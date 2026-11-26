// Create, call, guard and repair (PLAN.md §4.3–4.5).
import { existsSync } from "node:fs";
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildContract, pickFields, storedNames, validate, type Violation } from "./contract.js";
import { emit, newTrace } from "./events.js";
import { KANE_MISSING_HINT, kaneInstalled, record, replay, stripVariablesBlock, type RunResult, type Variables } from "./runner.js";
import {
  EVIDENCE_DIR, NAME_RE, emptyStats, endpointDir, loadEndpoint, saveEndpoint, testFile,
  type Endpoint, type InputSpec, type Kind,
} from "./store.js";

const TIMEOUT = Number(process.env.SIDEDOOR_KANE_TIMEOUT || 240);
const CACHE_TTL_MS = Number(process.env.SIDEDOOR_CACHE_TTL || 300) * 1000;
const MAX_REPAIR_ATTEMPTS = 3;

// ---------- queue: at most N browsers at once, one job per endpoint at a time ----------
const MAX_BROWSERS = Number(process.env.SIDEDOOR_CONCURRENCY || 2);
let running = 0;
const waiting: Array<() => void> = [];
async function withBrowser<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_BROWSERS) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}
const endpointLocks = new Map<string, Promise<unknown>>();
function withEndpointLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const prev = endpointLocks.get(name) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  endpointLocks.set(name, next.catch(() => {}));
  return next;
}
export const queueState = () => ({ running, waiting: waiting.length, maxBrowsers: MAX_BROWSERS });

// ---------- helpers ----------
export class SidedoorError extends Error {
  constructor(message: string, public status = 400, public details?: Record<string, unknown>) {
    super(message);
  }
}

/** Fail fast, with install steps, when kane-cli is not on this machine. */
function assertKane() {
  if (!kaneInstalled()) throw new SidedoorError("kane-cli not found", 503, { kane: "missing", hint: KANE_MISSING_HINT });
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const logPath = (name: string, what: string) => path.join(EVIDENCE_DIR, name, `${stamp()}-${what}.ndjson`);

export function objectiveFor(url: string, sentence: string): string {
  const s = sentence.trim();
  return /^go to\s/i.test(s) ? s : `Go to ${url}. ${s}`;
}

function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)].map((m) => m[1]))];
}

/** Replace the body of "## Step 1" in a Kane test file. */
export function setObjective(md: string, objective: string): string {
  const i = md.indexOf("## Step 1");
  if (i < 0) throw new Error("test file has no '## Step 1'");
  const bodyStart = md.indexOf("\n", i) + 1;
  const nextStep = md.indexOf("\n## ", bodyStart);
  const tail = nextStep >= 0 ? md.slice(nextStep) : "";
  return md.slice(0, bodyStart) + objective + "\n" + tail;
}

async function stripTestFile(name: string) {
  const f = testFile(name);
  await writeFile(f, stripVariablesBlock(await readFile(f, "utf8")));
}

function resolveInputs(ep: Endpoint, given: Record<string, unknown>, fallbackToSample = false): Variables {
  const vars: Variables = {};
  const missing: string[] = [];
  for (const inp of ep.inputs) {
    const v = given[inp.name];
    if (v === undefined || v === null || String(v) === "") {
      if (fallbackToSample) vars[inp.name] = inp.sample;
      else missing.push(inp.name);
    } else vars[inp.name] = String(v);
  }
  if (missing.length) throw new SidedoorError(`missing input(s): ${missing.join(", ")}`, 400, { inputs: ep.inputs });
  return vars;
}

const progress = (endpoint: string, trace: string) => (ev: any) => {
  if (ev?.type === "step_end" && ev.summary) {
    void emit({ type: "kane.step", endpoint, trace, message: String(ev.summary).slice(0, 200), data: { status: ev.status } });
  }
};

async function keepScreenshot(name: string, trace: string, r: RunResult): Promise<string | undefined> {
  if (!r.screenshotPath || !existsSync(r.screenshotPath)) return undefined;
  const dir = path.join(EVIDENCE_DIR, "shots");
  await mkdir(dir, { recursive: true });
  const dest = path.join(dir, `${name}-${trace}.png`);
  await copyFile(r.screenshotPath, dest).catch(() => {});
  return path.relative(EVIDENCE_DIR, dest);
}

function evidenceOf(r: RunResult, shot?: string) {
  return {
    log: r.logPath ? path.relative(EVIDENCE_DIR, r.logPath) : undefined,
    screenshot: shot,
    testManager: r.evidenceUrl,
  };
}

const recordingDir = (name: string) => path.join(endpointDir(name), ".testmuai", "tests");
async function backupRecording(name: string): Promise<string> {
  const bak = path.join(endpointDir(name), ".testmuai", ".backup-tests");
  await rm(bak, { recursive: true, force: true });
  await cp(recordingDir(name), bak, { recursive: true });
  return bak;
}
async function restoreRecording(name: string, bak: string) {
  await rm(recordingDir(name), { recursive: true, force: true });
  await cp(bak, recordingDir(name), { recursive: true });
}
async function dropBackup(bak: string) {
  await rm(bak, { recursive: true, force: true });
}

function noteReplay(ep: Endpoint, r: RunResult) {
  ep.stats.replays++;
  ep.stats.avgReplayMs = Math.round(ep.stats.avgReplayMs + (r.durationMs - ep.stats.avgReplayMs) / ep.stats.replays);
}

// ---------- create (§4.3) ----------
export interface CreateOptions {
  name: string;
  url: string;
  sentence: string;
  inputs?: InputSpec[];
  kind?: Kind;
  force?: boolean;
}

export async function createEndpoint(o: CreateOptions) {
  const name = o.name;
  if (!NAME_RE.test(name)) throw new SidedoorError("name must match [a-zA-Z0-9_-]{1,48}");
  if (!/^https?:\/\//.test(o.url)) throw new SidedoorError("url must start with http:// or https://");
  const dir = endpointDir(name);
  if (existsSync(path.join(dir, "endpoint.json")) && !o.force) throw new SidedoorError(`endpoint "${name}" already exists`, 409);
  const inputs = o.inputs ?? [];
  assertKane();
  const objective = objectiveFor(o.url, o.sentence);
  const used = placeholders(objective);
  const declared = inputs.map((i) => i.name);
  const undeclared = used.filter((u) => !declared.includes(u));
  if (undeclared.length) throw new SidedoorError(`sentence uses {{${undeclared.join("}}, {{")}}} but no --input declares it`);
  const unused = declared.filter((d) => !used.includes(d));
  if (unused.length) throw new SidedoorError(`input(s) ${unused.join(", ")} are not referenced as {{name}} in the sentence`);
  const fields = storedNames(o.sentence);
  if (!fields.length) throw new SidedoorError(`the sentence must name at least one value to return, e.g. "store the price as 'price'"`);

  return withEndpointLock(name, async () => {
    const trace = newTrace();
    await emit({ type: "create.start", endpoint: name, trace, message: `Recording "${objective}"`, data: { url: o.url, inputs } });
    if (o.force) await rm(path.join(dir, ".testmuai"), { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    const sample: Variables = Object.fromEntries(inputs.map((i) => [i.name, i.sample]));

    const rec = await withBrowser(() =>
      record(objective, name, { cwd: dir, timeoutSec: TIMEOUT, variables: sample, logPath: logPath(name, "record"), onEvent: progress(name, trace) }),
    );
    if (rec.status !== "passed" || !existsSync(testFile(name))) {
      await emit({ type: "create.failed", endpoint: name, trace, message: rec.remark || `Kane recording ${rec.status}`, data: { status: rec.status, evidence: evidenceOf(rec) } });
      throw new SidedoorError(`recording ${rec.status}: ${rec.remark ?? "no remark"}`, 502, { evidence: evidenceOf(rec) });
    }
    await emit({ type: "create.recorded", endpoint: name, trace, message: `Recorded in ${Math.round(rec.durationMs / 1000)} s for ${rec.credits?.toFixed(1)} credits`, data: { values: rec.values, credits: rec.credits } });

    // Required: Kane's saved `variables:` block would override every later --variables.
    await stripTestFile(name);
    const contract = buildContract(fields, rec.values);
    const recViolations = validate(contract, rec.values);
    const kind = o.kind ?? "read";
    const ep: Endpoint = {
      name, url: o.url, sentence: o.sentence, inputs, kind, contract, health: "new", createdAt: new Date().toISOString(),
      stats: { ...emptyStats(), recordings: 1, creditsSpent: rec.credits ?? 0, recordingCost: rec.credits ?? 0 },
      sample: pickFields(contract, rec.values),
    };
    if (recViolations.length) {
      ep.health = "broken";
      ep.lastFailure = { at: new Date().toISOString(), remark: rec.remark, violations: recViolations };
      await saveEndpoint(ep);
      await emit({ type: "create.failed", endpoint: name, trace, message: "Recording returned empty values", data: { violations: recViolations } });
      throw new SidedoorError("recording passed but returned empty values; make the sentence more specific", 502, { violations: recViolations, values: rec.values });
    }

    // Prove the recording replays. Skipped for actions so a side effect does not fire twice.
    let proof: RunResult | undefined;
    if (kind === "read") {
      proof = await withBrowser(() => replay(testFile(name), { cwd: dir, timeoutSec: TIMEOUT, variables: sample, extraArgs: ["--no-adaptive-heal"], logPath: logPath(name, "proof"), onEvent: progress(name, trace) }));
      noteReplay(ep, proof);
      const v = proof.status === "passed" ? validate(contract, proof.values) : [{ field: "*", problem: `replay ${proof.status}` }];
      if (v.length) {
        ep.health = "broken";
        ep.lastFailure = { at: new Date().toISOString(), remark: proof.remark, violations: v };
        await saveEndpoint(ep);
        await emit({ type: "create.failed", endpoint: name, trace, message: "Recording does not replay cleanly", data: { violations: v } });
        throw new SidedoorError("recorded, but the first replay did not return valid values; try a more direct sentence", 502, { violations: v, values: proof.values });
      }
      ep.sample = pickFields(contract, proof.values);
    }
    ep.health = "healthy";
    ep.last = { at: new Date().toISOString(), ok: true, data: ep.sample, durationMs: (proof ?? rec).durationMs };
    await saveEndpoint(ep);
    await emit({ type: "create.done", endpoint: name, trace, message: `Endpoint "${name}" is live`, data: { contract, sample: ep.sample } });
    return { endpoint: ep, recording: { credits: rec.credits, durationMs: rec.durationMs, values: rec.values }, proof: proof && { durationMs: proof.durationMs, values: proof.values } };
  });
}

// ---------- call (§4.4) ----------
export interface CallResult {
  endpoint: string;
  ok: boolean;
  verified: boolean;
  data?: Record<string, unknown>;
  inputs: Variables;
  durationMs: number;
  cached: boolean;
  repaired?: boolean;
  health: Endpoint["health"];
  evidence?: { log?: string; screenshot?: string; testManager?: string };
  error?: { message: string; remark?: string; violations?: Violation[]; hint?: string };
  trace: string;
}

const cache = new Map<string, { at: number; result: CallResult }>();
const inflight = new Map<string, Promise<CallResult>>();

export async function callEndpoint(name: string, given: Record<string, unknown> = {}, opts: { noCache?: boolean; noGuard?: boolean } = {}): Promise<CallResult> {
  const ep = await loadEndpoint(name);
  const inputs = resolveInputs(ep, given);
  const key = `${name}:${JSON.stringify(inputs)}`;
  if (ep.kind === "read" && !opts.noCache) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      const trace = newTrace();
      await emit({ type: "call.cached", endpoint: name, trace, message: "Served from cache", data: { inputs } });
      void bumpCacheHit(name);
      return { ...hit.result, cached: true, durationMs: 0, trace };
    }
    const running = inflight.get(key);
    if (running) return running;
  }
  assertKane();
  const p = withEndpointLock(name, () => doCall(name, inputs, opts));
  if (ep.kind === "read") {
    inflight.set(key, p);
    p.finally(() => inflight.delete(key)).catch(() => {});
  }
  const result = await p;
  if (ep.kind === "read" && result.ok) cache.set(key, { at: Date.now(), result });
  return result;
}

async function bumpCacheHit(name: string) {
  await withEndpointLock(name, async () => {
    const ep = await loadEndpoint(name);
    ep.stats.calls++;
    ep.stats.cacheHits++;
    await saveEndpoint(ep);
  });
}

async function doCall(name: string, inputs: Variables, opts: { noGuard?: boolean }): Promise<CallResult> {
  const ep = await loadEndpoint(name);
  const trace = newTrace();
  const started = Date.now();
  await emit({ type: "call.start", endpoint: name, trace, message: `Replaying with ${JSON.stringify(inputs)}`, data: { inputs } });
  const r = await withBrowser(() =>
    replay(testFile(name), { cwd: endpointDir(name), timeoutSec: TIMEOUT, variables: inputs, extraArgs: ["--no-adaptive-heal"], logPath: logPath(name, "call"), onEvent: progress(name, trace) }),
  );
  ep.stats.calls++;
  noteReplay(ep, r);
  const shot = await keepScreenshot(name, trace, r);
  const violations: Violation[] = r.status === "passed" ? validate(ep.contract, r.values) : [{ field: "*", problem: `replay ${r.status}` }];

  if (!violations.length) {
    const data = pickFields(ep.contract, r.values);
    const wasBroken = ep.health !== "healthy";
    ep.health = "healthy";
    ep.last = { at: new Date().toISOString(), ok: true, data, durationMs: r.durationMs };
    await saveEndpoint(ep);
    await emit({ type: "call.ok", endpoint: name, trace, message: `Verified ${Object.keys(data).length} field(s) in ${(r.durationMs / 1000).toFixed(1)} s`, data: { data, durationMs: r.durationMs, wasBroken, screenshot: shot } });
    return { endpoint: name, ok: true, verified: true, data, inputs, durationMs: Date.now() - started, cached: false, health: ep.health, evidence: evidenceOf(r, shot), trace };
  }

  ep.last = { at: new Date().toISOString(), ok: false, durationMs: r.durationMs, problem: violations.map((v) => `${v.field}: ${v.problem}`).join("; ") };
  ep.lastFailure = { at: ep.last.at, remark: r.remark, violations, evidence: shot };
  await emit({ type: "call.failed", endpoint: name, trace, message: `Contract check failed: ${ep.last.problem}`, data: { violations, values: r.values, remark: r.remark, screenshot: shot } });

  // Guard only runs on an endpoint that was healthy: a broken one is not re-recorded on every call,
  // and an action is never re-run automatically (the re-record would repeat its side effect).
  if (!opts.noGuard && ep.health === "healthy" && ep.kind === "read") {
    await saveEndpoint(ep);
    const g = await guard(name, inputs, trace, violations);
    return { ...g, durationMs: Date.now() - started, trace };
  }
  if (ep.health === "healthy") ep.health = "broken";
  await saveEndpoint(ep);
  return {
    endpoint: name, ok: false, verified: false, inputs, durationMs: Date.now() - started, cached: false, health: ep.health,
    evidence: evidenceOf(r, shot), trace,
    error: {
      message: ep.kind === "action" ? "action endpoint failed; it is never re-run automatically" : "endpoint is broken",
      remark: r.remark, violations,
      hint: `Call repair_endpoint with name "${name}" and a more specific sentence (name the page, link or label next to each value).`,
    },
  };
}

// ---------- guard: the repair loop (§4.5) ----------
async function rerecordAndVerify(ep: Endpoint, inputs: Variables, trace: string, objective?: string) {
  const name = ep.name;
  const bak = await backupRecording(name);
  const original = await readFile(testFile(name), "utf8");
  if (objective) await writeFile(testFile(name), setObjective(original, objective));
  await emit({ type: "guard.rerecord", endpoint: name, trace, message: `Kane re-records the flow${objective ? " with a new sentence" : ""}`, data: { objective: objective ?? null } });

  const rec = await withBrowser(() =>
    replay(testFile(name), { cwd: endpointDir(name), timeoutSec: TIMEOUT, variables: inputs, author: true, logPath: logPath(name, "rerecord"), onEvent: progress(name, trace) }),
  );
  ep.stats.recordings++;
  ep.stats.creditsSpent += rec.credits ?? 0;
  const recShot = await keepScreenshot(name, trace + "-rec", rec);
  let violations: Violation[] = rec.status === "passed" ? validate(ep.contract, rec.values) : [{ field: "*", problem: `re-record ${rec.status}` }];
  await emit({ type: "guard.check", endpoint: name, trace, message: violations.length ? `Re-recorded result fails the contract` : `Re-recorded result passes the contract`, data: { values: rec.values, violations, credits: rec.credits, remark: rec.remark, screenshot: recShot } });

  let final = rec;
  let shot = recShot;
  if (!violations.length && ep.kind === "read") {
    // A re-recording can pass once and still not replay (docs/repair-gate.md #13–#14): replay it before the swap.
    const ver = await withBrowser(() =>
      replay(testFile(name), { cwd: endpointDir(name), timeoutSec: TIMEOUT, variables: inputs, extraArgs: ["--no-adaptive-heal"], logPath: logPath(name, "verify"), onEvent: progress(name, trace) }),
    );
    noteReplay(ep, ver);
    shot = (await keepScreenshot(name, trace + "-ver", ver)) ?? shot;
    violations = ver.status === "passed" ? validate(ep.contract, ver.values) : [{ field: "*", problem: `verification replay ${ver.status}` }];
    await emit({ type: "guard.verify", endpoint: name, trace, message: violations.length ? "Verification replay failed" : "Verification replay passed", data: { values: ver.values, violations, screenshot: shot } });
    final = ver;
  }
  if (violations.length) {
    await restoreRecording(name, bak);
    if (objective) await writeFile(testFile(name), original);
  } else {
    await stripTestFile(name);
  }
  await dropBackup(bak);
  return { ok: !violations.length, final, rec, violations, shot };
}

/** The actionable part of a Kane failure remark: the paragraph after the diagnosis. */
export function kaneFix(remark?: string): string | undefined {
  if (!remark) return undefined;
  const paras = remark.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (paras.length < 2) return undefined;
  const fix = paras.slice(1).join(" ");
  // Drop "Do not ..." / "Update the run to ..." framing that only makes sense to a test author.
  const cleaned = fix
    .split(/(?<=\.)\s+/)
    .filter((s) => !/^(do not|don't|avoid)\b/i.test(s))
    .join(" ")
    .replace(/^update the (run|test) to\s+/i, "")
    .trim();
  if (cleaned.length < 12 || cleaned.length > 400) return undefined;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

async function guard(name: string, inputs: Variables, trace: string, detected: Violation[]): Promise<CallResult> {
  const ep = await loadEndpoint(name);
  ep.health = "repairing";
  await saveEndpoint(ep);
  await emit({ type: "guard.detect", endpoint: name, trace, message: `Replay broke the contract (${detected.map((v) => `${v.field}: ${v.problem}`).join("; ")}); repairing`, data: { violations: detected } });
  let g = await rerecordAndVerify(ep, inputs, trace);
  let hinted: string | undefined;
  // Second automatic attempt: Kane's failure remark usually ends with what to do instead
  // ("Open Announcements, identify the newest notice, then save..."). Put that in front of the sentence.
  // No AI model on our side: Kane wrote the hint.
  const fix = kaneFix(g.rec.remark);
  if (!g.ok && fix) {
    hinted = `${fix} ${ep.sentence}`;
    await emit({ type: "guard.rerecord", endpoint: name, trace, message: `Retrying with Kane's own fix: "${fix}"`, data: { hint: fix } });
    g = await rerecordAndVerify(ep, inputs, trace, objectiveFor(ep.url, hinted));
  }
  if (g.ok) {
    const data = pickFields(ep.contract, g.final.values);
    if (hinted) ep.sentence = hinted;
    ep.health = "healthy";
    ep.stats.repairs++;
    ep.repairAttempts = 0;
    ep.last = { at: new Date().toISOString(), ok: true, data, durationMs: g.final.durationMs };
    await saveEndpoint(ep);
    await emit({ type: "guard.swap", endpoint: name, trace, message: "New recording swapped in; endpoint healthy", data: { data } });
    return { endpoint: name, ok: true, verified: true, repaired: true, data, inputs, durationMs: 0, cached: false, health: "healthy", evidence: evidenceOf(g.final, g.shot), trace };
  }
  ep.health = "broken";
  ep.repairAttempts = 0;
  ep.lastFailure = { at: new Date().toISOString(), remark: g.rec.remark, violations: g.violations, evidence: g.shot };
  await saveEndpoint(ep);
  await emit({ type: "guard.broken", endpoint: name, trace, message: "Automatic re-record did not pass; waiting for repair_endpoint", data: { remark: g.rec.remark, violations: g.violations } });
  return {
    endpoint: name, ok: false, verified: false, repaired: false, inputs, durationMs: 0, cached: false, health: "broken", trace,
    evidence: evidenceOf(g.rec, g.shot),
    error: {
      message: "the site changed and the automatic re-record did not return valid values",
      remark: g.rec.remark,
      violations: g.violations,
      hint: `Read Kane's remark, then call repair_endpoint with name "${name}" and a sharper sentence that still stores ${Object.keys(ep.contract.fields).map((f) => `'${f}'`).join(", ")}. Up to ${MAX_REPAIR_ATTEMPTS} attempts.`,
    },
  };
}

// ---------- repair_endpoint (§4.5 step 5) ----------
export async function repairEndpoint(name: string, opts: { sentence?: string; inputs?: Record<string, unknown> } = {}): Promise<CallResult & { attempt: number; attemptsLeft: number }> {
  assertKane();
  return withEndpointLock(name, async () => {
    const ep = await loadEndpoint(name);
    const attempt = (ep.repairAttempts ?? 0) + 1;
    if (attempt > MAX_REPAIR_ATTEMPTS && ep.health === "broken") {
      throw new SidedoorError(`repair limit reached (${MAX_REPAIR_ATTEMPTS} attempts). Recreate the endpoint with "sidedoor create --force".`, 429);
    }
    const inputs = resolveInputs(ep, opts.inputs ?? {}, true);
    let objective: string | undefined;
    if (opts.sentence) {
      const fields = storedNames(opts.sentence);
      const missing = Object.keys(ep.contract.fields).filter((f) => !fields.includes(f));
      if (missing.length) throw new SidedoorError(`the new sentence must still store ${missing.map((m) => `'${m}'`).join(", ")} (write "store ... as '${missing[0]}'")`);
      objective = objectiveFor(ep.url, opts.sentence);
      const used = placeholders(objective);
      const undeclared = used.filter((u) => !ep.inputs.some((i) => i.name === u));
      if (undeclared.length) throw new SidedoorError(`unknown input(s) {{${undeclared.join("}}, {{")}}}`);
    }
    const trace = newTrace();
    ep.health = "repairing";
    ep.repairAttempts = attempt;
    await saveEndpoint(ep);
    await emit({ type: "repair.start", endpoint: name, trace, message: `Repair attempt ${attempt}/${MAX_REPAIR_ATTEMPTS}${opts.sentence ? `: "${opts.sentence}"` : ""}`, data: { sentence: opts.sentence ?? null, attempt } });
    const g = await rerecordAndVerify(ep, inputs, trace, objective);
    const fresh = await loadEndpoint(name).catch(() => ep);
    Object.assign(fresh.stats, ep.stats);
    if (g.ok) {
      const data = pickFields(ep.contract, g.final.values);
      if (opts.sentence) fresh.sentence = opts.sentence;
      fresh.health = "healthy";
      fresh.stats.repairs++;
      fresh.repairAttempts = 0;
      fresh.last = { at: new Date().toISOString(), ok: true, data, durationMs: g.final.durationMs };
      await saveEndpoint(fresh);
      await emit({ type: "repair.done", endpoint: name, trace, message: "Repaired and verified; endpoint healthy", data: { data } });
      return { endpoint: name, ok: true, verified: true, repaired: true, data, inputs, durationMs: g.final.durationMs, cached: false, health: "healthy", evidence: evidenceOf(g.final, g.shot), trace, attempt, attemptsLeft: MAX_REPAIR_ATTEMPTS };
    }
    fresh.health = "broken";
    fresh.repairAttempts = attempt;
    fresh.lastFailure = { at: new Date().toISOString(), remark: g.rec.remark, violations: g.violations, evidence: g.shot };
    await saveEndpoint(fresh);
    await emit({ type: "repair.failed", endpoint: name, trace, message: `Repair attempt ${attempt} failed`, data: { remark: g.rec.remark, violations: g.violations } });
    return {
      endpoint: name, ok: false, verified: false, repaired: false, inputs, durationMs: g.rec.durationMs, cached: false, health: "broken", trace,
      evidence: evidenceOf(g.rec, g.shot), attempt, attemptsLeft: MAX_REPAIR_ATTEMPTS - attempt,
      error: { message: `repair attempt ${attempt} failed`, remark: g.rec.remark, violations: g.violations, hint: "Use Kane's remark to write a more direct sentence: name the page or link to open and the label next to each value. Avoid 'if' clauses." },
    };
  });
}
