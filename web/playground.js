// Sidedoor playground (/playground). Prompt on the left, streamed run on the right.
// Playback (hosted, no /api): replays real recorded event sequences from /snapshot.json, sped up.
// Live (local server): creates and calls endpoints through the same API as the dashboard and streams /api/events.
import { esc, getJSON, detectMode, setModePill, label, shotUrl, tablistKeys, NPX } from "/shared.js";

const $ = (s) => document.querySelector(s);
const ORDER = ["notices", "fees", "quotes", "book-price", "top-tag", "leave-request"];
const BREAK = "break";
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const state = { mode: "playback", endpoints: [], snapshot: null, preset: null, runId: 0, run: null, es: null };

// ---------- helpers ----------
const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const day = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`; // shell single-quote
const dq = (s) => `"${String(s).replace(/(["\\$`])/g, "\\$1")}"`; // shell double-quote

function spec() {
  const f = new FormData($("#pg-form"));
  const inputs = String(f.get("inputs") || "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const [name, ...rest] = s.split("=");
    return { name: name.trim(), sample: rest.join("=").trim() };
  }).filter((i) => i.name);
  return {
    name: String(f.get("name") || "").trim(),
    url: String(f.get("url") || "").trim(),
    sentence: String(f.get("sentence") || "").trim(),
    inputs,
    kind: f.get("kind") === "action" ? "action" : "read",
  };
}
const same = (a, b) => a && b && a.url === b.url && a.sentence.trim() === b.sentence.trim() && a.kind === b.kind;
const inputsText = (inputs) => inputs.map((i) => `${i.name}=${i.sample}`).join(", ");

// ---------- recorded runs (snapshot) ----------
function traces(endpoint) {
  const groups = new Map();
  for (const e of state.snapshot?.events ?? []) {
    if (endpoint && e.endpoint !== endpoint) continue;
    const k = e.trace || e.id;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  return [...groups.values()];
}
const isPlainCall = (evs) => evs.every((e) => e.type === "call.start" || e.type === "call.ok") && evs.some((e) => e.type === "call.ok");
const isCreate = (evs) => evs.some((e) => e.type === "create.done");

// One recorded run per preset: the creation, then the latest plain verified call after it.
function recordedRun(name) {
  if (name === BREAK) {
    const swap = traces("notices").filter((t) => t.some((e) => e.type === "guard.swap")).pop() ?? traces().filter((t) => t.some((e) => e.type === "guard.swap")).pop();
    if (!swap) return null;
    return { name: swap[0].endpoint, stages: [{ title: "Call after the redesign", events: swap }] };
  }
  const all = traces(name);
  const call = all.filter(isPlainCall).pop();
  const create = all.filter((t) => isCreate(t) && (!call || t[0].at < call[0].at)).pop() ?? all.filter(isCreate).pop();
  const stages = [];
  if (create) stages.push({ title: "Create", events: create });
  if (call) stages.push({ title: "Call", events: call });
  return stages.length ? { name, stages } : null;
}

function resultFrom(name, events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const d = e.data || {};
    if (e.type === "call.ok" || e.type === "guard.swap" || e.type === "call.cached") {
      const out = { endpoint: name, ok: true, verified: true };
      if (e.type === "guard.swap") out.repaired = true;
      out.data = d.data;
      if (d.durationMs) out.durationMs = d.durationMs;
      const shot = d.screenshot ?? events.map((x) => x.data?.screenshot).filter(Boolean).pop();
      if (shot) out.evidence = { screenshot: shot };
      out.trace = e.trace;
      return out;
    }
    if (e.type === "create.done") return { endpoint: name, live: true, contract: d.contract, sample: d.sample, trace: e.trace };
    if (/failed|broken/.test(e.type)) return { endpoint: name, ok: false, problem: e.message, remark: d.remark, trace: e.trace };
  }
  return null;
}

// ---------- presets ----------
function presetList() {
  const eps = [...state.endpoints].sort((a, b) => {
    const ia = ORDER.indexOf(a.name), ib = ORDER.indexOf(b.name);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name);
  });
  return eps;
}

function renderPresets() {
  const box = $("#presets");
  const eps = presetList();
  const canBreak = !!recordedRun(BREAK) && !!presetSpec(BREAK);
  box.innerHTML = eps.map((e) => `<button type="button" class="pill chip" data-preset="${esc(e.name)}" aria-pressed="false">${esc(e.name)}</button>`).join("")
    + (canBreak ? `<button type="button" class="pill pill-red chip" data-preset="${BREAK}" aria-pressed="false" title="Replays the recorded notices self-repair">Break the site</button>` : "")
    || `<span class="muted">No endpoints yet. Write your own below.</span>`;
  box.querySelectorAll("[data-preset]").forEach((b) => (b.onclick = () => applyPreset(b.dataset.preset)));
  markPreset();
}

function presetSpec(name) {
  const key = name === BREAK ? "notices" : name;
  const e = state.endpoints.find((x) => x.name === key) ?? state.snapshot?.endpoints?.find((x) => x.name === key);
  return e ? { name: e.name, url: e.url, sentence: e.sentence, inputs: e.inputs, kind: e.kind } : null;
}

function applyPreset(name) {
  const p = presetSpec(name);
  if (!p) return;
  state.preset = name;
  $("#pg-name").value = p.name;
  $("#pg-url").value = p.url;
  $("#pg-sentence").value = p.sentence;
  $("#pg-inputs").value = inputsText(p.inputs);
  document.querySelector(`input[name=kind][value=${p.kind}]`).checked = true;
  markPreset();
  update();
}

function markPreset() {
  document.querySelectorAll("[data-preset]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.preset === state.preset)));
}

// Which preset (if any) the form still matches.
function matched() {
  const s = spec();
  if (state.preset && same(s, presetSpec(state.preset))) return state.preset;
  const e = state.endpoints.find((x) => same(s, x));
  return e ? e.name : null;
}

// ---------- hint + "Use it" ----------
function update() {
  const s = spec();
  const m = matched();
  if (state.preset && m !== state.preset) { state.preset = null; markPreset(); }
  const hint = $("#pg-hint");
  if (m === BREAK) hint.textContent = "Replays the recorded notices self-repair after the portal redesign. 3:18 real time, sped up.";
  else if (state.mode === "playback") {
    hint.innerHTML = m ? "Replays the real recorded run, sped up." : `Live runs need a local install: <code>${esc(NPX)}</code>`;
  } else {
    const existing = state.endpoints.find((x) => x.name === s.name);
    if (existing && same(s, existing)) hint.textContent = existing.kind === "action" ? "Calls it on your machine. Action: submits the form for real." : "Calls it on your machine. Replays are free; reads are cached for 5 minutes.";
    else if (existing) hint.textContent = `"${s.name}" already exists with a different sentence. Pick a new name to record a new endpoint.`;
    else hint.textContent = "Kane records this once on your machine: about a minute, 10–30 credits.";
  }
  renderUse(s, m);
}

function renderUse(s, m) {
  const base = state.mode === "live" ? location.origin : "http://localhost:3030";
  const name = s.name || "my-endpoint";
  const q = s.inputs.map((i) => `${i.name}=${encodeURIComponent(i.sample)}`).join("&");
  const body = JSON.stringify(Object.fromEntries(s.inputs.map((i) => [i.name, i.sample])));
  const url = `${base}/api/${name}${s.kind === "read" && q ? "?" + q : ""}`;
  const tool = name.replace(/-/g, "_");
  const known = !!m || state.endpoints.some((x) => x.name === s.name);
  const snippets = [];
  if (!known || state.mode === "playback") {
    const flags = [`--name ${name}`, `--url ${sq(s.url || "https://example.com/")}`, ...s.inputs.map((i) => `--input ${sq(`${i.name}=${i.sample}`)}`), ...(s.kind === "action" ? ["--action"] : [])];
    snippets.push(["Create it", `npx @himeshjain/sidedoor create ${flags.join(" ")} ${dq(s.sentence || "Store the page title as 'title'.")}`]);
  }
  snippets.push(["curl", s.kind === "action"
    ? `curl -X POST ${url} -H 'content-type: application/json' -d ${sq(body)}`
    : `curl ${sq(url)}`]);
  snippets.push(["JavaScript", s.kind === "action"
    ? `const r = await fetch("${url}", {\n  method: "POST",\n  headers: { "content-type": "application/json" },\n  body: JSON.stringify(${body}),\n});\nconst { ok, data } = await r.json();`
    : `const r = await fetch("${url}");\nconst { ok, verified, data } = await r.json();`]);
  snippets.push([`MCP (tool: ${tool})`, `{ "mcpServers": { "sidedoor": { "command": "npx", "args": ["-y", "@himeshjain/sidedoor", "mcp"] } } }`]);
  snippets.push(["Claude Code", "claude mcp add sidedoor -- npx -y @himeshjain/sidedoor mcp"]);
  $("#use").innerHTML = snippets.map(([t, code], i) => `<div class="snip"><div class="snip-head"><h3>${esc(t)}</h3><button type="button" class="pill pill-sm" data-copy="${i}">Copy</button></div><pre class="json">${esc(code)}</pre></div>`).join("");
  $("#use").querySelectorAll("[data-copy]").forEach((b) => (b.onclick = async () => {
    try { await navigator.clipboard.writeText(snippets[Number(b.dataset.copy)][1]); b.textContent = "Copied"; } catch { b.textContent = "Select and copy"; }
  }));
}

// ---------- output tabs ----------
const tabs = [...document.querySelectorAll('#tabs [role="tab"]')];
function selectTab(i, focus) {
  tabs.forEach((t, j) => {
    t.setAttribute("aria-selected", String(i === j));
    t.tabIndex = i === j ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")).hidden = i !== j;
  });
  if (focus) tabs[i].focus();
}
tabs.forEach((t, i) => (t.onclick = () => selectTab(i)));
tablistKeys($("#tabs"), () => tabs, (i) => selectTab(i, true));

// ---------- run log ----------
function setStatus(text, cls = "") {
  const s = $("#run-status");
  s.textContent = text;
  s.className = `pill pill-sm k ${cls}`;
}
function resetOutput(meta) {
  $("#log").innerHTML = "";
  $("#run-meta").innerHTML = meta.map(([t, cls]) => `<span class="pill pill-sm ${cls || ""}">${esc(t)}</span>`).join("");
  $("#shots").innerHTML = `<p class="empty">No screenshot yet.</p>`;
  $("#json").textContent = "// Running…";
  state.shots = [];
}
function logStage(title, sub) {
  pending(false);
  $("#log").insertAdjacentHTML("beforeend", `<li class="stage">${esc(title)}${sub ? `<span>${esc(sub)}</span>` : ""}</li>`);
}
function logEvent(elapsedMs, type, message, remark) {
  pending(false);
  const [k, cls] = label(type);
  const r = remark ? `<div class="remark">Kane: ${esc(String(remark).slice(0, 400))}</div>` : "";
  $("#log").insertAdjacentHTML("beforeend", `<li><span class="ts">${clock(elapsedMs)}</span><span><span class="pill pill-sm k ${cls}">${esc(k)}</span></span><span class="msg">${esc(message)}${r}</span></li>`);
}
function pending(on, text = "Kane is working…") {
  $("#log .pending")?.remove();
  if (on) $("#log").insertAdjacentHTML("beforeend", `<li class="pending"><span class="ts">…</span><span><span class="pill pill-sm k plain">running</span></span><span class="msg">${esc(text)}</span></li>`);
}
function addShot(src, caption) {
  if (!src || state.shots.includes(src)) return;
  state.shots.push(src);
  const box = $("#shots");
  if (state.shots.length === 1) box.innerHTML = "";
  box.insertAdjacentHTML("beforeend", `<figure><a href="${esc(shotUrl(src))}" target="_blank" rel="noopener"><img src="${esc(shotUrl(src))}" alt="Kane screenshot: ${esc(caption)}" loading="lazy"></a><figcaption><span class="pill pill-sm">Kane</span>${esc(caption)}</figcaption></figure>`);
}
const remarkOf = (e) => (e.data?.remark && /failed|broken|check/.test(e.type) && e.data.remark !== "replay completed" ? e.data.remark : "");

// ---------- playback ----------
async function playRecorded(key, id) {
  const run = recordedRun(key);
  if (!run) return playbackOnly(spec());
  const ep = presetSpec(key);
  const first = run.stages[0].events[0];
  resetOutput([[run.name, "pill-ink"], [ep?.kind ?? "read", "pill-line"], [`Recorded ${day(first.at)}`, ""], ["Playback", ""]]);
  const s = spec();
  if (ep && inputsText(s.inputs) !== inputsText(ep.inputs)) logEvent(0, "call.start", `Playback uses the recorded inputs: ${inputsText(ep.inputs) || "none"}. Run locally to use your own.`);
  setStatus("Running", "warn");
  const fast = reduced();
  let result = null;
  for (const st of run.stages) {
    const t0 = Date.parse(st.events[0].at);
    const last = Date.parse(st.events[st.events.length - 1].at);
    logStage(st.title, `${clock(last - t0)} real time`);
    let prev = t0;
    for (const e of st.events) {
      const at = Date.parse(e.at);
      if (!fast && at > prev) {
        pending(true, e.type.startsWith("guard.") ? "Kane is re-recording…" : e.type.startsWith("create") ? "Kane is recording…" : "Kane is replaying…");
        await sleep(Math.min(900, Math.max(150, (at - prev) / 50)));
        if (id !== state.runId) return;
      }
      prev = at;
      logEvent(at - t0, e.type, e.message, remarkOf(e));
      if (e.data?.screenshot) addShot(e.data.screenshot, `${label(e.type)[0]} · ${clock(at - t0)}`);
    }
    result = resultFrom(run.name, st.events) ?? result;
  }
  pending(false);
  if (key !== BREAK && !run.stages.some((s) => s.title === "Call") && state.snapshot?.calls?.[key]) result = state.snapshot.calls[key].result;
  $("#json").textContent = JSON.stringify(result ?? {}, null, 2);
  const ok = result && result.ok !== false;
  setStatus(ok ? (result.repaired ? "Repaired" : "Verified") : "Failed", ok ? "good" : "bad");
}

function playbackOnly(s) {
  resetOutput([[s.name || "custom", "pill-ink"], [s.kind, "pill-line"], ["Playback", ""]]);
  logStage("Needs a local install");
  logEvent(0, "create.start", `This site only replays recorded runs. Run ${NPX} to record your own.`);
  $("#json").textContent = `// Live runs need a local install:\n// ${NPX}`;
  setStatus("Local only", "warn");
  selectTab(0);
}

// ---------- live ----------
function connect() {
  const es = new EventSource("/api/events");
  es.onmessage = (m) => {
    const ev = JSON.parse(m.data);
    const run = state.run;
    if (!run || ev.endpoint !== run.name) return;
    if (run.trace && ev.trace && ev.trace !== run.trace && ev.type !== "kane.step") return;
    if (!run.trace && ev.trace && ev.type !== "kane.step") run.trace = ev.trace;
    logEvent(Date.now() - run.t0, ev.type, ev.message, remarkOf(ev));
    if (ev.data?.screenshot) addShot(ev.data.screenshot, `${label(ev.type)[0]} · ${clock(Date.now() - run.t0)}`);
    pending(true, ev.type.startsWith("guard.") ? "Kane is re-recording…" : run.kind === "create" ? "Kane is recording…" : "Kane is replaying…");
  };
  state.es = es;
}

async function runLive(s, id) {
  if (!s.name || !/^[a-zA-Z0-9_-]{1,48}$/.test(s.name)) return formError("Name: letters, numbers, - and _ only.");
  if (!/^https?:\/\//.test(s.url)) return formError("URL must start with http:// or https://");
  if (!s.sentence) return formError("Write the sentence: what to do and what to store.");
  const existing = state.endpoints.find((x) => x.name === s.name);
  if (existing && !same(s, existing)) return formError(`"${s.name}" already exists with a different sentence. Pick a new name.`);
  const kind = existing ? "call" : "create";
  if (kind === "call" && existing.kind === "action" && !confirm(`"${s.name}" is an action endpoint and will submit the form for real. Continue?`)) return;
  resetOutput([[s.name, "pill-ink"], [s.kind, "pill-line"], ["Live", "pill-red"]]);
  logStage(kind === "create" ? "Create" : "Call", kind === "create" ? "Kane records the flow once" : "Kane replays the recording");
  state.run = { name: s.name, kind, t0: Date.now(), trace: null };
  pending(true, kind === "create" ? "Kane is recording…" : "Kane is replaying…");
  setStatus("Running", "warn");
  $("#pg-run").disabled = true;
  let result;
  try {
    if (kind === "create") {
      result = await getJSON("/api/endpoints", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(s) });
    } else if (s.kind === "action") {
      result = await getJSON(`/api/${s.name}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(s.inputs.map((i) => [i.name, i.sample]))) });
    } else {
      const q = new URLSearchParams(Object.fromEntries(s.inputs.map((i) => [i.name, i.sample])));
      result = await getJSON(`/api/${s.name}${q.toString() ? "?" + q : ""}`);
    }
  } catch (e) {
    result = e.body ?? { error: e.message };
  } finally {
    $("#pg-run").disabled = false;
  }
  if (id !== state.runId) return;
  const ms = Date.now() - state.run.t0;
  state.run = null;
  pending(false);
  if (result?.evidence?.screenshot) addShot(result.evidence.screenshot, "result");
  $("#json").textContent = JSON.stringify(result, null, 2);
  const ok = !result?.error && result?.ok !== false;
  logEvent(ms, ok ? (kind === "create" ? "create.done" : "call.ok") : "call.failed", ok ? (kind === "create" ? `Endpoint "${s.name}" is live. Press Run again to call it.` : `Done in ${(ms / 1000).toFixed(1)} s`) : (result?.error || result?.problem || "Call failed"));
  setStatus(ok ? (kind === "create" ? "Created" : result.repaired ? "Repaired" : "Verified") : "Failed", ok ? "good" : "bad");
  try { state.endpoints = await getJSON("/api/endpoints"); renderPresets(); } catch {}
  update();
}

function formError(msg) {
  $("#pg-hint").textContent = msg;
  setStatus("Check the prompt", "bad");
}

// ---------- boot ----------
$("#pg-form").addEventListener("input", update);
$("#pg-form").addEventListener("change", update);
$("#pg-form").onsubmit = (ev) => {
  ev.preventDefault();
  const id = ++state.runId;
  state.run = null;
  selectTab(0);
  const m = matched();
  if (m === BREAK || (state.mode === "playback" && m)) return playRecorded(m, id);
  if (state.mode === "playback") return playbackOnly(spec());
  return runLive(spec(), id);
};
$("#pg-sentence").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $("#pg-form").requestSubmit(); }
});

async function boot() {
  const r = await detectMode().catch(() => ({ mode: "playback", endpoints: [], events: [], snapshot: { endpoints: [], events: [], calls: {} } }));
  state.mode = r.mode;
  state.endpoints = r.endpoints ?? [];
  state.snapshot = r.snapshot ?? null;
  if (state.mode === "live") {
    // Recorded runs (for "Break the site") ship with the repo; a fresh npx install may not have them.
    try { state.snapshot = await getJSON("/snapshot.json"); } catch { state.snapshot = null; }
    connect();
  }
  setModePill($("#mode"), state.mode);
  renderPresets();
  const want = new URLSearchParams(location.search).get("preset");
  const first = want && (want === BREAK || state.endpoints.some((e) => e.name === want)) ? want : presetList().find((e) => e.name === "fees")?.name ?? presetList()[0]?.name;
  if (first) applyPreset(first);
  else update();
}
boot();
