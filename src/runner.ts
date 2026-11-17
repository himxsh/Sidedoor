// Runner: wraps kane-cli as a child process (PLAN.md §4.1).
// - always passes --agent --headless --timeout
// - reads NDJSON line by line, ignores unknown events, takes the result from run_end
// - maps exit codes 0 passed, 1 failed, 2 did not start, 3 timed out
// - sets KANE_CLI_USER_AGENT on every call
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { kaneEnabled, KaneOffError } from "./kane-switch.js";

export type RunStatus = "passed" | "failed" | "not_started" | "timeout";

export const EXIT_STATUS: Record<number, RunStatus> = {
  0: "passed",
  1: "failed",
  2: "not_started",
  3: "timeout",
};

export type Variables = Record<string, string>;

export interface RunResult {
  status: RunStatus;
  exitCode: number | null;
  /** Flattened stored values: run_end.context.variables.<name>.value */
  values: Record<string, unknown>;
  /** Kane's final remark / failure reason, when it gives one */
  remark?: string;
  /** Link to the run in Test Manager, when present */
  evidenceUrl?: string;
  /** Local screenshot Kane saved for the final state (replays) */
  screenshotPath?: string;
  /** Credits charged (recordings only; replays report none) */
  credits?: number;
  durationMs: number;
  /** Summaries of steps Kane marked failed */
  failedSteps: string[];
  runEnd?: any;
  /** Path to the raw NDJSON log of this run */
  logPath?: string;
  stderr: string;
}

export interface RunOptions {
  cwd: string;
  timeoutSec?: number;
  variables?: Variables;
  /** Where to write the raw NDJSON log */
  logPath?: string;
  /** Called for every parsed NDJSON event (for live progress) */
  onEvent?: (ev: any) => void;
  extraArgs?: string[];
}

export const USER_AGENT = "sidedoor/0.1";
const KANE_BIN = process.env.SIDEDOOR_KANE_BIN || "kane-cli";

export function toKaneVariables(vars: Variables = {}): string {
  const out: Record<string, { value: string }> = {};
  for (const [k, v] of Object.entries(vars)) out[k] = { value: String(v) };
  return JSON.stringify(out);
}

function pickEvidenceUrl(ev: any): string | undefined {
  if (!ev || typeof ev !== "object") return undefined;
  for (const key of ["test_url", "run_url", "tms_url", "url", "link", "dashboard_url", "session_url"]) {
    const v = ev[key];
    if (typeof v === "string" && /^https?:\/\//.test(v) && !/toscrape|localhost/.test(v)) return v;
  }
  return undefined;
}

function deepFindUrl(obj: any, depth = 0): string | undefined {
  if (!obj || typeof obj !== "object" || depth > 4) return undefined;
  const direct = pickEvidenceUrl(obj);
  if (direct) return direct;
  for (const v of Object.values(obj)) {
    const found = deepFindUrl(v, depth + 1);
    if (found) return found;
  }
  return undefined;
}

export function extractValues(runEnd: any): Record<string, unknown> {
  const vars = runEnd?.context?.variables ?? {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries<any>(vars)) {
    out[k] = v && typeof v === "object" && "value" in v ? v.value : v;
  }
  return out;
}

/** Low-level: run kane-cli with the given subcommand args. */
export async function runKane(args: string[], opts: RunOptions): Promise<RunResult> {
  if (!kaneEnabled()) throw new KaneOffError(); // TODO(remove-kane-switch)
  const timeoutSec = opts.timeoutSec ?? 240;
  const fullArgs = [...args, "--agent", "--headless", "--timeout", String(timeoutSec), ...(opts.extraArgs ?? [])];
  if (opts.variables && Object.keys(opts.variables).length) {
    fullArgs.push("--variables", toKaneVariables(opts.variables));
  }
  if (opts.logPath) await mkdir(path.dirname(opts.logPath), { recursive: true });
  const log = opts.logPath ? createWriteStream(opts.logPath) : undefined;

  const started = Date.now();
  return await new Promise<RunResult>((resolve) => {
    const child = spawn(KANE_BIN, fullArgs, {
      cwd: opts.cwd,
      env: { ...process.env, KANE_CLI_USER_AGENT: USER_AGENT, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buf = "";
    let stderr = "";
    let runEnd: any;
    let lastRemark: string | undefined;
    let evidenceUrl: string | undefined;
    const failedSteps: string[] = [];

    const handleLine = (line: string) => {
      const t = line.trim();
      if (!t) return;
      let ev: any;
      try {
        ev = JSON.parse(t);
      } catch {
        return; // not JSON: ignore
      }
      if (ev?.type === "run_end") runEnd = ev;
      if (ev?.type === "step_end" && ev.status === "failed" && ev.summary) failedSteps.push(String(ev.summary));
      if (typeof ev?.remark === "string") lastRemark = ev.remark;
      evidenceUrl ??= pickEvidenceUrl(ev);
      try {
        opts.onEvent?.(ev);
      } catch {
        /* listener errors never break a run */
      }
    };

    child.stdout.on("data", (chunk: Buffer) => {
      log?.write(chunk);
      buf += chunk.toString("utf8");
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        handleLine(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    });
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
    // Hard stop slightly after Kane's own timeout, in case it hangs.
    const killer = setTimeout(() => child.kill("SIGKILL"), (timeoutSec + 60) * 1000);

    const finish = (code: number | null) => {
      clearTimeout(killer);
      if (buf) handleLine(buf);
      log?.end();
      const status: RunStatus = code === null ? "timeout" : (EXIT_STATUS[code] ?? "failed");
      resolve({
        status,
        exitCode: code,
        values: extractValues(runEnd),
        remark: runEnd?.summary || runEnd?.reason || runEnd?.remark || runEnd?.error || lastRemark,
        evidenceUrl: evidenceUrl ?? deepFindUrl(runEnd),
        screenshotPath: typeof runEnd?.screenshot_path === "string" ? runEnd.screenshot_path : undefined,
        credits: typeof runEnd?.credits_consumed === "number" ? runEnd.credits_consumed : 0,
        durationMs: Date.now() - started,
        failedSteps,
        runEnd,
        logPath: opts.logPath,
        stderr,
      });
    };
    child.on("error", (err) => {
      stderr += String(err);
      finish(2);
    });
    child.on("close", (code) => finish(code));
  });
}

/** Replay a saved test file with (optional) new inputs. Free. */
export function replay(testFile: string, opts: Omit<RunOptions, "cwd"> & { cwd?: string; author?: boolean }) {
  const cwd = opts.cwd ?? path.dirname(testFile);
  const rel = path.relative(cwd, testFile);
  const args = ["testmd", "run", rel];
  if (opts.author) args.push("--author");
  return runKane(args, { ...opts, cwd });
}

/** Record a new flow from a plain-English objective. Paid. */
export function record(objective: string, name: string, opts: RunOptions & { url?: string }) {
  const args = ["run", objective, "--name", name];
  if (opts.url) args.push("--url", opts.url);
  return runKane(args, opts);
}

/** Kane writes a `variables:` block into the frontmatter which overrides --variables. Strip it. */
export function stripVariablesBlock(md: string): string {
  return md.replace(/variables:\n(?:  .*\n|    .*\n)+/g, "");
}
