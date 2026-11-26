// Shared by the dashboard and the playground (and the landing page's tabs).
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function getJSON(url, opts) {
  const r = await fetch(url, opts);
  const body = await r.json().catch(() => ({}));
  if (!r.ok && !body.endpoint) throw Object.assign(new Error(body.error || r.statusText), { body, status: r.status });
  return body;
}

// Live when the local server's API answers with the right shapes; otherwise playback of /snapshot.json.
// Static hosts answer unknown paths with an HTML page, so check the shape, not just the status.
export async function detectMode() {
  try {
    const endpoints = await getJSON("/api/endpoints");
    const events = await getJSON("/api/events/history?limit=400");
    if (!Array.isArray(endpoints) || !Array.isArray(events)) throw new Error("no API");
    return { mode: "live", endpoints, events };
  } catch {
    const snapshot = await getJSON("/snapshot.json");
    return { mode: "playback", snapshot, endpoints: snapshot.endpoints, events: snapshot.events };
  }
}

export function setModePill(el, mode) {
  el.hidden = false;
  el.dataset.mode = mode;
  el.textContent = mode === "live" ? "Live" : "Playback";
  el.title = mode === "live" ? "Connected to your local Sidedoor server" : "Real recorded runs from snapshot.json";
}

export const NPX = "npx @himeshjain/sidedoor serve";
export const shotUrl = (s) => `/evidence/${String(s).replace(/^\/?(evidence\/)?/, "")}`;

// Event type -> [label, style] for status pills.
export const LABEL = {
  "create.start": ["record", "warn"], "create.recorded": ["recorded", "good"], "create.done": ["live", "good"], "create.failed": ["failed", "bad"],
  "call.start": ["replay", "plain"], "call.cached": ["cache", "plain"], "call.ok": ["verified", "good"], "call.failed": ["contract", "bad"],
  "guard.detect": ["detect", "bad"], "guard.rerecord": ["re-record", "warn"], "guard.check": ["check", "plain"], "guard.verify": ["verify", "good"],
  "guard.swap": ["swap", "good"], "guard.broken": ["broken", "bad"], "guard.failed": ["failed", "bad"],
  "repair.start": ["repair", "warn"], "repair.done": ["repaired", "good"], "repair.failed": ["failed", "bad"], "kane.step": ["kane", "plain"],
};
export const label = (type) => LABEL[type] ?? [type, "plain"];

// Arrow-key navigation for a role=tablist (roving tabindex is set by the caller).
export function tablistKeys(list, getTabs, select, vertical = false) {
  list.addEventListener("keydown", (e) => {
    const tabs = getTabs();
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const back = vertical ? ["ArrowUp", "ArrowLeft"] : ["ArrowLeft", "ArrowUp"];
    const fwd = vertical ? ["ArrowDown", "ArrowRight"] : ["ArrowRight", "ArrowDown"];
    let n = null;
    if (back.includes(e.key)) n = (i - 1 + tabs.length) % tabs.length;
    else if (fwd.includes(e.key)) n = (i + 1) % tabs.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = tabs.length - 1;
    if (n === null) return;
    e.preventDefault();
    select(n);
  });
}
