// Sidedoor dashboard (/dashboard). Live mode talks to the local server; playback mode (hosted copy)
// reads /snapshot.json, which holds real recorded runs, so judges can see it without installing anything.
import { esc, getJSON, detectMode, setModePill, label, shotUrl, NPX } from "/shared.js";

const $ = (s) => document.querySelector(s);
const state = { mode: "live", endpoints: [], events: [], snapshot: null };

async function boot() {
  const r = await detectMode();
  Object.assign(state, r);
  setModePill($("#mode"), state.mode);
  if (state.mode === "playback") {
    $("#mode-note").textContent = `Recorded ${new Date(state.snapshot.capturedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}. Nothing here calls Kane.`;
    $("#live-view").hidden = true;
    $("#playback").hidden = false;
    renderTotals();
    renderPlayback();
    return;
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
  const live = $("#live");
  es.onopen = () => { live.textContent = "live"; live.classList.add("pill-ink"); };
  es.onerror = () => { live.textContent = "reconnecting"; live.classList.remove("pill-ink"); };
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
    // Playback: endpoint stats reset when an endpoint is recreated, so count the swaps in the recorded log.
    ["Repairs", Math.max(sum((e) => e.stats.repairs), state.events.filter((e) => e.type === "guard.swap").length)],
    ["Credits spent", sum((e) => e.stats.creditsSpent).toFixed(1)],
    ["Credits saved", sum((e) => e.stats.creditsSaved).toFixed(1)],
  ];
  $("#totals").innerHTML = stats.map(([k, v]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join("");
}

function renderEndpoints() {
  const box = $("#endpoints");
  if (!state.endpoints.length) {
    box.innerHTML = `<p class="muted">No endpoints yet. Create one with the form, or run <code>sidedoor create</code>.</p>`;
    return;
  }
  box.innerHTML = state.endpoints.map((e) => {
    const last = e.last?.ok ? JSON.stringify(e.last.data) : e.last?.problem ? `last call failed: ${e.last.problem}` : "";
    return `<article class="ep" data-endpoint="${esc(e.name)}">
      <div class="ep-head"><span class="ep-name">${esc(e.name)}</span><span class="pill pill-sm health-${esc(e.health)}" data-testid="health-${esc(e.name)}">${esc(e.health)}</span><span class="pill pill-sm pill-line">${esc(e.kind)}</span></div>
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
      <div class="ep-actions"><button class="pill" data-try="${esc(e.name)}">Try</button>${state.mode === "live" && e.health === "broken" ? `<button class="pill pill-red" data-repair="${esc(e.name)}">Repair</button>` : ""}</div>
    </article>`;
  }).join("");
  box.querySelectorAll("[data-try]").forEach((b) => (b.onclick = () => { $("#try-name").value = b.dataset.try; renderTryInputs(); $("#try").scrollIntoView({ block: "nearest" }); $("#try-name").focus(); }));
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

function renderTimeline() {
  const groups = new Map();
  for (const e of state.events) {
    const k = e.trace || e.id;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
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
        const [k, cls] = label(e.type);
        const remark = e.data?.remark && /failed|broken|check/.test(e.type) ? `<div class="remark">Kane: ${esc(String(e.data.remark).slice(0, 280))}</div>` : "";
        return `<li><span class="pill pill-sm k ${cls}">${esc(k)}</span><span>${esc(e.message)}${remark}</span></li>`;
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
    out.textContent = `Creating needs Kane CLI on your machine: ${NPX}`;
    return;
  }
  const inputs = String(f.get("inputs") || "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const [name, ...rest] = s.split("=");
    return { name: name.trim(), sample: rest.join("=").trim() };
  });
  const btn = $("#create-go");
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

// ---------- Playback: recorded runs with Kane's screenshots ----------

// One run per repair (latest per endpoint) and one verified call per endpoint, each with a screenshot.
function buildRuns() {
  const traces = new Map();
  for (const e of state.events) if (e.trace) (traces.get(e.trace) ?? traces.set(e.trace, []).get(e.trace)).push(e);
  const repairs = new Map(), calls = new Map();
  for (const [trace, evs] of traces) {
    const ep = evs[0].endpoint;
    const failed = evs.find((e) => e.type === "call.failed");
    const verify = evs.find((e) => e.type === "guard.verify" && e.data?.screenshot);
    const swap = evs.find((e) => e.type === "guard.swap");
    const ok = evs.find((e) => e.type === "call.ok" && e.data?.screenshot);
    if (swap && failed?.data?.screenshot && verify) repairs.set(ep, { kind: "repair", endpoint: ep, trace, evs, at: evs[0].at });
    else if (ok) calls.set(ep, { kind: "call", endpoint: ep, trace, evs, at: evs[0].at });
  }
  // The demo portal's repair is the headline, so local (portal) endpoints come first.
  const local = (r) => (/localhost|127\.0\.0\.1/.test(epOf(r.endpoint)?.url ?? "") ? 0 : 1);
  const order = (m) => [...m.values()].sort((a, b) => local(a) - local(b) || a.endpoint.localeCompare(b.endpoint));
  return [...order(repairs), ...order(calls)];
}

function renderPlayback() {
  const runs = buildRuns();
  const picks = $("#pb-picks");
  const group = (kind, title) => {
    const list = runs.map((r, i) => [r, i]).filter(([r]) => r.kind === kind);
    if (!list.length) return "";
    return `<div class="pb-group"><span class="lbl">${title}</span><div class="chips">${list.map(([r, i]) =>
      `<button type="button" class="pill chip" data-run="${i}" aria-pressed="false">${esc(r.endpoint)}</button>`).join("")}</div></div>`;
  };
  picks.innerHTML = group("repair", "Self-repairs") + group("call", "Verified calls");
  const show = (i) => {
    picks.querySelectorAll("[data-run]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.run === i)));
    $("#pb-detail").innerHTML = runs[i].kind === "repair" ? repairView(runs[i]) : callView(runs[i]);
  };
  picks.querySelectorAll("[data-run]").forEach((b) => (b.onclick = () => show(+b.dataset.run)));
  if (runs.length) show(0);
  else $("#pb-detail").innerHTML = `<p class="muted">No recorded runs in this snapshot.</p>`;
}

const fig = (src, cap) => `<figure class="pb-fig"><a href="${esc(shotUrl(src))}" target="_blank" rel="noopener" title="Open full size"><img src="${esc(shotUrl(src))}" alt="${esc(cap)}" loading="lazy"></a><figcaption>${cap}</figcaption></figure>`;
const kv = (obj) => `<dl class="pb-kv">${Object.entries(obj ?? {}).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
const when = (at) => new Date(at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const epOf = (name) => state.endpoints.find((e) => e.name === name);
const hostOf = (ep) => { try { return new URL(ep.url.replace(/\{\{.*?\}\}/g, "x")).host; } catch { return ""; } };
const sitePhrase = (ep) => (/localhost|127\.0\.0\.1/.test(hostOf(ep)) ? "the demo campus portal" : hostOf(ep));
const inputsOf = (evs) => evs.find((e) => e.type === "call.start")?.data?.inputs ?? {};

function callView(r) {
  const ep = epOf(r.endpoint);
  const ok = r.evs.find((e) => e.type === "call.ok");
  const inputs = inputsOf(r.evs);
  const secs = ok.data?.durationMs ? `${(ok.data.durationMs / 1000).toFixed(1)} s` : "";
  const action = ep?.kind === "action";
  const story = action
    ? `Kane replayed the saved recording: it filled in the form on ${esc(sitePhrase(ep))} with these inputs and submitted it. Sidedoor checked the confirmation against the endpoint's contract before returning it. Actions are never cached or retried.`
    : `Kane replayed the saved recording on ${esc(sitePhrase(ep))}${Object.keys(inputs).length ? " with these inputs" : ""}, no new recording needed. Sidedoor checked every field against the endpoint's contract before returning the JSON.`;
  return `<div class="pb-media">${fig(ok.data.screenshot, "What Kane's browser showed at the end of the replay")}</div>
  <div class="pb-info">
    <div class="pb-tags"><span class="pill pill-sm pill-ink">verified</span><span class="pill pill-sm pill-line">${esc(ep?.kind ?? "read")}</span>${secs ? `<span class="muted">${secs}</span>` : ""}<span class="muted">${esc(when(r.at))}</span></div>
    <h3 class="pb-title">${esc(r.endpoint)}</h3>
    <p class="pb-text">${story}</p>
    ${ep ? `<p class="pb-sentence"><span class="lbl">The one sentence behind it</span>${esc(ep.sentence)}</p>` : ""}
    ${Object.keys(inputs).length ? `<div><span class="lbl">Called with</span>${kv(inputs)}</div>` : ""}
    <div><span class="lbl">Returned</span>${kv(ok.data?.data)}</div>
  </div>`;
}

function repairView(r) {
  const ep = epOf(r.endpoint);
  const failed = r.evs.find((e) => e.type === "call.failed");
  const verify = r.evs.find((e) => e.type === "guard.verify");
  const swap = r.evs.find((e) => e.type === "guard.swap");
  const checks = r.evs.filter((e) => e.type === "guard.check");
  const fix = r.evs.find((e) => e.data?.hint)?.data.hint;
  const credits = checks.reduce((a, e) => a + (Number(e.data?.credits) || 0), 0);
  const broken = (failed.data?.violations ?? []).map((v) => `<code>${esc(v.field)}</code>`).join(" and ");
  const portal = /localhost|127\.0\.0\.1/.test(hostOf(ep ?? { url: "" }));
  const story = `${portal ? "The campus portal was switched to its redesigned layout. " : ""}The old recording still ran, but ${broken || "the result"} came back wrong, so the contract check stopped it before it reached the caller. `
    + `Kane re-recorded the flow${checks.length > 1 ? `; its first attempt missed, and Kane's own remark became a sharper sentence for the second` : ""}. `
    + `A verification replay of the new recording passed, and it was swapped in. No one touched it.`;
  const steps = [
    ["contract", "bad", `Replay broke the contract: ${(failed.data?.violations ?? []).map((v) => `${v.field} was ${v.problem}`).join("; ")}`],
    ...checks.map((c, i) => [c.data?.violations?.length ? "missed" : "check", c.data?.violations?.length ? "bad" : "good", `Re-record ${i + 1} ${c.data?.violations?.length ? "did not find the values" : "passed the contract"}`]),
    ...(fix ? [["fix", "warn", `Kane's suggested sentence: “${fix}”`]] : []),
    ["verify", "good", "Verification replay of the new recording passed"],
    ["swap", "good", "New recording swapped in; endpoint healthy"],
  ];
  return `<div class="pb-media">
    ${fig(failed.data.screenshot, `<span class="pill pill-sm pill-red">before</span> The old replay, after the change`)}
    ${fig(verify.data.screenshot, `<span class="pill pill-sm pill-ink">after</span> The new recording's verification replay`)}
  </div>
  <div class="pb-info">
    <div class="pb-tags"><span class="pill pill-sm pill-red">self-repair</span>${credits ? `<span class="muted">${credits.toFixed(1)} credits to re-record</span>` : ""}<span class="muted">${esc(when(r.at))}</span></div>
    <h3 class="pb-title">${esc(r.endpoint)}</h3>
    <p class="pb-text">${story}</p>
    <div><span class="lbl">Broken result</span>${kv(failed.data?.values)}</div>
    <div><span class="lbl">Repaired result</span>${kv(swap.data?.data)}</div>
    <details class="pb-steps"><summary>Every step</summary><ul class="steps">${steps.map(([k, cls, m]) => `<li><span class="pill pill-sm k ${cls}">${esc(k)}</span><span>${esc(m)}</span></li>`).join("")}</ul></details>
  </div>`;
}

boot();
