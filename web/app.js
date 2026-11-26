// Sidedoor dashboard. Live mode talks to the local server; playback mode (hosted copy)
// reads snapshot.json, which holds real recorded runs, so judges can see it without installing anything.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const state = { mode: "live", endpoints: [], events: [], snapshot: null };

async function getJSON(url, opts) {
  const r = await fetch(url, opts);
  const body = await r.json().catch(() => ({}));
  if (!r.ok && !body.endpoint) throw Object.assign(new Error(body.error || r.statusText), { body, status: r.status });
  return body;
}

async function boot() {
  try {
    state.endpoints = await getJSON("/api/endpoints");
    state.events = await getJSON("/api/events/history?limit=400");
    // Static hosts answer unknown paths with index.html, so check the shape, not just the status.
    if (!Array.isArray(state.endpoints) || !Array.isArray(state.events)) throw new Error("no API");
  } catch {
    const snap = await getJSON("snapshot.json");
    state.mode = "playback";
    state.snapshot = snap;
    state.endpoints = snap.endpoints;
    state.events = snap.events;
    const m = $("#mode");
    m.hidden = false;
    m.textContent = `Playback of real recorded runs (captured ${new Date(snap.capturedAt).toLocaleString()}). Run it locally to call endpoints live: npx @himxsh/sidedoor serve`;
    $("#live").textContent = "playback";
    $("#live").classList.add("off");
  }
  render();
  if (state.mode === "live") {
    connect();
    setInterval(refresh, 10000);
  }
}

async function refresh() {
  try {
    state.endpoints = await getJSON("/api/endpoints");
    renderEndpoints();
    renderTotals();
    const q = await getJSON("/api/queue");
    $("#queue").textContent = q.running ? `${q.running} browser${q.running > 1 ? "s" : ""} running${q.waiting ? `, ${q.waiting} waiting` : ""}` : "";
  } catch {}
}

function connect() {
  const es = new EventSource("/api/events");
  es.onopen = () => $("#live").classList.remove("off");
  es.onerror = () => $("#live").classList.add("off");
  es.onmessage = (m) => {
    const ev = JSON.parse(m.data);
    state.events.push(ev);
    if (state.events.length > 800) state.events.splice(0, state.events.length - 800);
    renderTimeline();
    if (ev.type !== "kane.step") refresh();
  };
}

function render() {
  renderTotals();
  renderEndpoints();
  renderTry();
  renderTimeline();
}

function renderTotals() {
  const eps = state.endpoints;
  const sum = (f) => eps.reduce((a, e) => a + (f(e) || 0), 0);
  const stats = [
    ["Endpoints", eps.length],
    ["Healthy", eps.filter((e) => e.health === "healthy").length],
    ["Calls served", sum((e) => e.stats.calls)],
    ["Repairs", sum((e) => e.stats.repairs)],
    ["Credits spent", sum((e) => e.stats.creditsSpent).toFixed(1)],
    ["Credits saved", sum((e) => e.stats.creditsSaved).toFixed(1)],
  ];
  $("#totals").innerHTML = stats.map(([k, v]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join("");
}

function renderEndpoints() {
  const box = $("#endpoints");
  if (!state.endpoints.length) {
    box.innerHTML = `<p class="muted">No endpoints yet. Create one on the right, or run <code>sidedoor create</code>.</p>`;
    return;
  }
  box.innerHTML = state.endpoints.map((e) => {
    const last = e.last?.ok ? JSON.stringify(e.last.data) : e.last?.problem ? `last call failed: ${e.last.problem}` : "";
    return `<article class="ep" data-endpoint="${esc(e.name)}">
      <div class="ep-head"><span class="ep-name">${esc(e.name)}</span><span class="pill ${esc(e.health)}" data-testid="health-${esc(e.name)}">${esc(e.health)}</span><span class="pill kind">${esc(e.kind)}</span></div>
      <div class="ep-sentence">${esc(e.sentence)} <span class="muted">· ${esc(new URL(e.url.replace(/\{\{.*?\}\}/g, "x")).host)}</span></div>
      <div class="ep-meta">
        <span>inputs: ${e.inputs.length ? e.inputs.map((i) => esc(i.name)).join(", ") : "none"}</span>
        <span>returns: ${Object.keys(e.returns).map(esc).join(", ")}</span>
        <span>${e.stats.calls} calls</span>
        <span>avg replay ${(e.stats.avgReplayMs / 1000).toFixed(1)} s</span>
        <span>${e.stats.repairs} repairs</span>
        <span>${(e.stats.creditsSaved ?? 0).toFixed(1)} credits saved</span>
      </div>
      ${last ? `<div class="ep-last">${esc(last)}</div>` : ""}
      ${e.lastFailure?.remark && e.health !== "healthy" ? `<div class="ep-sentence">Kane: ${esc(e.lastFailure.remark.slice(0, 300))}</div>` : ""}
      <div class="ep-actions"><button class="ghost" data-try="${esc(e.name)}">Try</button>${state.mode === "live" && e.health === "broken" ? `<button class="ghost" data-repair="${esc(e.name)}">Repair</button>` : ""}</div>
    </article>`;
  }).join("");
  box.querySelectorAll("[data-try]").forEach((b) => (b.onclick = () => { $("#try-name").value = b.dataset.try; renderTryInputs(); $("#try").scrollIntoView({ behavior: "smooth", block: "nearest" }); }));
  box.querySelectorAll("[data-repair]").forEach((b) => (b.onclick = () => repair(b.dataset.repair, b)));
}

function renderTry() {
  const sel = $("#try-name");
  const current = sel.value;
  sel.innerHTML = state.endpoints.map((e) => `<option value="${esc(e.name)}">${esc(e.name)}</option>`).join("");
  if (current) sel.value = current;
  sel.onchange = renderTryInputs;
  renderTryInputs();
  $("#try").onsubmit = async (ev) => {
    ev.preventDefault();
    const name = sel.value;
    const ep = state.endpoints.find((e) => e.name === name);
    if (!ep) return;
    const inputs = Object.fromEntries(ep.inputs.map((i) => [i.name, $(`#in-${i.name}`).value]));
    const out = $("#try-out");
    const btn = $("#try-go");
    if (state.mode === "playback") {
      const rec = state.snapshot.calls?.[name];
      out.textContent = rec ? `// recorded call, ${new Date(rec.at).toLocaleString()}\n` + JSON.stringify(rec.result, null, 2) : "No recorded call for this endpoint.";
      return;
    }
    if (ep.kind === "action" && !confirm(`"${name}" is an action endpoint and will submit the form for real. Continue?`)) return;
    btn.disabled = true;
    const t0 = performance.now();
    const tick = setInterval(() => (out.textContent = `Kane is replaying… ${((performance.now() - t0) / 1000).toFixed(0)} s`), 500);
    try {
      const q = new URLSearchParams(inputs);
      if ($("#try-fresh").checked) q.set("fresh", "1");
      const r = ep.kind === "action"
        ? await getJSON(`/api/${name}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(inputs) })
        : await getJSON(`/api/${name}?${q}`);
      out.textContent = JSON.stringify(r, null, 2);
    } catch (e) {
      out.textContent = JSON.stringify(e.body ?? { error: e.message }, null, 2);
    } finally {
      clearInterval(tick);
      btn.disabled = false;
      refresh();
    }
  };
}

function renderTryInputs() {
  const ep = state.endpoints.find((e) => e.name === $("#try-name").value);
  if (!ep) return;
  $("#try-inputs").innerHTML = ep.inputs.map((i) => `<label>${esc(i.name)} <input id="in-${esc(i.name)}" value="${esc(i.sample)}"></label>`).join("");
  const upd = () => {
    const q = ep.inputs.map((i) => `${i.name}=${encodeURIComponent($(`#in-${i.name}`).value)}`).join("&");
    $("#try-curl").textContent = ep.kind === "action"
      ? `curl -X POST localhost:3030/api/${ep.name} -H 'content-type: application/json' -d '${JSON.stringify(Object.fromEntries(ep.inputs.map((i) => [i.name, $(`#in-${i.name}`).value])))}'`
      : `curl 'localhost:3030/api/${ep.name}${q ? "?" + q : ""}'`;
  };
  $("#try-inputs").querySelectorAll("input").forEach((i) => (i.oninput = upd));
  upd();
}

async function repair(name, btn) {
  const sentence = prompt(`Re-record "${name}". Optionally give a sharper sentence (it must still store the same fields). Leave empty to re-record with the current one.`, "");
  if (sentence === null) return;
  btn.disabled = true;
  try {
    const r = await getJSON(`/api/${name}/repair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sentence ? { sentence } : {}) });
    $("#try-out").textContent = JSON.stringify(r, null, 2);
  } catch (e) {
    $("#try-out").textContent = JSON.stringify(e.body ?? { error: e.message }, null, 2);
  } finally {
    btn.disabled = false;
    refresh();
  }
}

const LABEL = {
  "create.start": ["record", "warn"], "create.recorded": ["recorded", "good"], "create.done": ["live", "good"], "create.failed": ["failed", "bad"],
  "call.start": ["replay", ""], "call.cached": ["cache", ""], "call.ok": ["verified", "good"], "call.failed": ["contract", "bad"],
  "guard.detect": ["detect", "bad"], "guard.rerecord": ["re-record", "warn"], "guard.check": ["check", ""], "guard.verify": ["verify", ""],
  "guard.swap": ["swap", "good"], "guard.broken": ["broken", "bad"], "guard.failed": ["failed", "bad"],
  "repair.start": ["repair", "warn"], "repair.done": ["repaired", "good"], "repair.failed": ["failed", "bad"], "kane.step": ["kane", ""],
};

function renderTimeline() {
  const groups = new Map();
  for (const e of state.events) {
    const k = e.trace || e.id;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  const shotUrl = (s) => (state.mode === "playback" ? `evidence/${s}` : `/evidence/${s}`);
  const items = [...groups.values()].reverse().slice(0, 40).map((evs) => {
    const types = evs.map((e) => e.type);
    const isRepair = types.some((t) => t.startsWith("guard.") || t.startsWith("repair."));
    const fixed = types.includes("guard.swap") || types.includes("repair.done");
    const first = evs[0];
    const steps = evs.filter((e) => e.type !== "kane.step" || evs.length < 12).slice(-14);
    const shots = [...new Set(evs.map((e) => e.data?.screenshot).filter(Boolean))];
    const title = isRepair ? (fixed ? "repaired" : types.includes("guard.broken") || types.includes("repair.failed") ? "repair needed" : "repairing") : first.type.split(".")[0];
    return `<li class="trace ${isRepair ? "repair" : ""} ${fixed ? "fixed" : ""}">
      <div class="trace-head"><span><b>${esc(first.endpoint)}</b> · ${esc(title)}</span><span class="muted">${new Date(first.at).toLocaleTimeString()}</span></div>
      <ul class="steps">${steps.map((e) => {
        const [k, cls] = LABEL[e.type] ?? [e.type, ""];
        const remark = e.data?.remark && /failed|broken|check/.test(e.type) ? `<div class="remark">Kane: ${esc(String(e.data.remark).slice(0, 280))}</div>` : "";
        return `<li><span class="k ${cls}">${esc(k)}</span><span>${esc(e.message)}${remark}</span></li>`;
      }).join("")}</ul>
      ${shots.length ? `<div class="shots">${shots.slice(-3).map((s) => `<a href="${esc(shotUrl(s))}" target="_blank" rel="noopener"><img loading="lazy" alt="Kane screenshot" src="${esc(shotUrl(s))}"></a>`).join("")}</div>` : ""}
    </li>`;
  });
  $("#timeline").innerHTML = items.join("") || `<li class="muted">No activity yet.</li>`;
}

$("#create").onsubmit = async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const out = $("#create-out");
  out.hidden = false;
  if (state.mode === "playback") {
    out.textContent = "Creating needs Kane CLI on your machine: npx @himxsh/sidedoor serve";
    return;
  }
  const inputs = String(f.get("inputs") || "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const [name, ...rest] = s.split("=");
    return { name: name.trim(), sample: rest.join("=").trim() };
  });
  const btn = ev.target.querySelector("button");
  btn.disabled = true;
  out.textContent = "Kane is recording the flow (about a minute)…";
  try {
    const r = await getJSON("/api/endpoints", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: f.get("name"), url: f.get("url"), sentence: f.get("sentence"), inputs, kind: f.get("action") ? "action" : "read" }) });
    out.textContent = JSON.stringify(r, null, 2);
    await refresh();
    renderTry();
  } catch (e) {
    out.textContent = JSON.stringify(e.body ?? { error: e.message }, null, 2);
  } finally {
    btn.disabled = false;
  }
};

boot();
