// Landing page: the self-repair timeline and the recorded-calls list.
// The calls list reads /snapshot.json (real recorded runs) and falls back to the values below.
import { esc, tablistKeys } from "/shared.js";

const SHOT = {
  before: "/evidence/shots/notices-qdl1acat.png",
  redesign: "/evidence/shots/notices-6zynbk52.png",
  verified: "/evidence/shots/notices-6zynbk52-ver.png",
};

const steps = [
  { short: "Recorded", time: "Before", pos: 0, status: "Healthy", title: "Recorded on the original layout", line: "One sentence becomes the notices endpoint.", code: "contract: { title: string, date: string }", img: SHOT.before, alt: "Original Campus Portal notice board table", source: "Kane replay", shot: "Original layout, notices in a table." },
  { short: "Redesign", time: "0:00", pos: 8, status: "Site changed", title: "The portal is redesigned", line: "Notices move behind an Announcements link.", code: "call.start · notices", img: SHOT.redesign, alt: "Redesigned CampusOne dashboard with an Announcements card", source: "Kane replay", shot: "New layout. No notices on the first screen." },
  { short: "Caught", time: "0:51", pos: 31.7, status: "Broken", title: "Bad data caught", line: "Kane says passed. The contract says no.", code: "title: boolean where text was expected", img: SHOT.redesign, alt: "Kane replay ending on the dashboard without any notice", source: "Kane replay", shot: "Where the old recording stopped." },
  { short: "Re-record", time: "1:41", pos: 54.9, status: "Repairing", title: "Re-record fails", line: "Kane explains what to do instead.", code: 'fix: "Open Announcements, identify the newest notice…"', remark: "The agent tried to save the date before opening the Announcements page and reading the most recent notice.", source: "Kane CLI", shot: "Kane’s own diagnosis, word for word." },
  { short: "Kane’s fix", time: "2:58", pos: 90.7, status: "Repairing", title: "Kane’s fix applied", line: "The new recording passes the contract.", code: '"Open Announcements, identify the newest notice…"', remark: "Opened the Announcements page to find the newest notice.", source: "Kane CLI", shot: "The retry, in Kane’s words." },
  { short: "Swapped", time: "3:18", pos: 100, status: "Healthy", title: "Verified and swapped", line: "The caller gets the right answer.", code: '{ "ok": true, "verified": true, "repaired": true }', img: SHOT.verified, alt: "Announcements page with the newest notice, Mid-semester exam schedule released", source: "Verification replay", shot: "Newest notice found on Announcements." },
];

// Fallback copy from the design; snapshot.json replaces request, json and date when it loads.
let calls = [
  { name: "notices", kind: "Repaired", request: "GET /api/notices", at: "17 Nov 2026", json: '{ "ok": true, "verified": true, "repaired": true,\n  "data": { "title": "Mid-semester exam schedule released",\n            "date": "Posted 17 November 2026" } }' },
  { name: "fees", kind: "Read", request: "GET /api/fees?student_id=[INPUT]", at: "17 Nov 2026", json: '{ "ok": true, "verified": true,\n  "data": { "amount_due": "₹0", "due_date": "—" } }' },
  { name: "quotes", kind: "Read", request: "GET /api/quotes?tag=[INPUT]", at: "17 Nov 2026", json: '{ "ok": true, "verified": true,\n  "data": { "quote": "It is better to be hated for what you are…",\n            "author": "André Gide" } }' },
  { name: "book-price", kind: "Made by Claude", request: "GET /api/book-price?title=[INPUT]", at: "17 Nov 2026", json: '{ "ok": true, "verified": true,\n  "data": { "price": "£53.74",\n            "availability": "In stock (20 available)" } }' },
  { name: "top-tag", kind: "Read", request: "GET /api/top-tag", at: "17 Nov 2026", json: '{ "ok": true, "verified": true,\n  "data": { "tag": "love" } }' },
  { name: "leave-request", kind: "Action", request: "POST /api/leave-request", at: "17 Nov 2026", json: '{ "ok": true, "verified": true,\n  "data": { "confirmation": "LR-4103" } }' },
];

const state = { step: 0, call: 0 };
const $ = (s) => document.querySelector(s);

// ---- Self-repair timeline ----
const track = $("#r-track");
const markers = steps.map((x, i) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "marker";
  b.setAttribute("role", "tab");
  b.setAttribute("aria-controls", "r-panel");
  b.setAttribute("aria-label", `${x.time}, ${x.short}`);
  b.style.left = x.pos + "%";
  b.style.transform = x.pos === 100 ? "translateX(-100%)" : x.pos === 0 ? "none" : "translateX(-50%)";
  b.style.alignItems = x.pos === 100 ? "flex-end" : x.pos === 0 ? "flex-start" : "center";
  b.innerHTML = `<span class="dot"></span><span class="t">${esc(x.time)}</span><span class="s hide-sm">${esc(x.short)}</span>`;
  b.onclick = () => setStep(i);
  track.appendChild(b);
  return b;
});
tablistKeys(track, () => markers, (i) => setStep(i, true));

function setStep(i, focus) {
  state.step = i;
  const c = steps[i];
  markers.forEach((m, j) => {
    m.setAttribute("aria-selected", String(j === i));
    m.tabIndex = j === i ? 0 : -1;
    m.classList.toggle("past", j <= i);
  });
  if (focus) markers[i].focus();
  $("#r-time").textContent = c.time;
  const st = $("#r-status");
  st.textContent = c.status;
  st.dataset.s = c.status;
  $("#r-fill").style.width = c.pos + "%";
  const img = $("#r-img");
  img.hidden = !c.img;
  if (c.img) { img.src = c.img; img.alt = c.alt || ""; }
  $("#r-quote").hidden = !!c.img;
  $("#r-remark").textContent = c.remark ? `“${c.remark}”` : "";
  $("#r-source").textContent = c.source;
  $("#r-shot").textContent = c.shot;
  $("#r-num").textContent = `${String(i + 1).padStart(2, "0")} / 06`;
  $("#r-title").textContent = c.title;
  $("#r-line").textContent = c.line;
  $("#r-code").textContent = c.code;
  $("#r-prev").disabled = i === 0;
  $("#r-next").disabled = i === steps.length - 1;
}
$("#r-prev").onclick = () => setStep(Math.max(0, state.step - 1));
$("#r-next").onclick = () => setStep(Math.min(steps.length - 1, state.step + 1));
setStep(0);

// ---- Recorded calls ----
const list = $("#c-list");
let rows = [];
function renderCalls() {
  list.innerHTML = calls.map((c, i) => `<button type="button" role="tab" class="row" id="c-tab-${i}" aria-controls="c-panel">
<span class="idx">${String(i + 1).padStart(2, "0")}</span>
<span class="d row-name">${esc(c.name)}</span>
<span class="tag${c.kind === "Repaired" ? " hot" : ""}">${esc(c.kind)}</span>
</button>`).join("");
  rows = [...list.querySelectorAll(".row")];
  rows.forEach((r, i) => (r.onclick = () => setCall(i)));
  setCall(Math.min(state.call, calls.length - 1));
}
tablistKeys(list, () => rows, (i) => setCall(i, true), true);

function setCall(i, focus) {
  state.call = i;
  rows.forEach((r, j) => {
    r.setAttribute("aria-selected", String(j === i));
    r.tabIndex = j === i ? 0 : -1;
  });
  if (focus) rows[i].focus();
  const c = calls[i];
  $("#c-panel").setAttribute("aria-labelledby", `c-tab-${i}`);
  $("#c-req").textContent = c.request;
  $("#c-json").textContent = c.json;
  $("#c-at").textContent = `Recorded ${c.at}`;
}
renderCalls();

// Compact JSON in the design's style: one line per top-level key, data fields aligned.
function compact(result) {
  const head = ["ok", "verified", "repaired"].filter((k) => result[k] !== undefined).map((k) => `"${k}": ${JSON.stringify(result[k])}`).join(", ");
  const data = Object.entries(result.data || {}).map(([k, v]) => `"${k}": ${JSON.stringify(v)}`);
  if (!data.length) return `{ ${head} }`;
  return `{ ${head},\n  "data": { ${data.join(",\n            ")} } }`;
}

async function loadSnapshot() {
  try {
    const r = await fetch("/snapshot.json", { cache: "no-cache" });
    if (!r.ok) return;
    const snap = await r.json();
    if (!snap?.calls || !Array.isArray(snap.endpoints)) return;
    calls = calls.map((c) => {
      const rec = snap.calls[c.name];
      const ep = snap.endpoints.find((e) => e.name === c.name);
      if (!rec?.result || !ep) return c;
      const q = ep.inputs.map((i) => `${i.name}=${encodeURIComponent(i.sample)}`).join("&");
      return {
        ...c,
        request: ep.kind === "action" ? `POST /api/${ep.name}` : `GET /api/${ep.name}${q ? "?" + q : ""}`,
        json: compact(rec.result),
        at: new Date(rec.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
      };
    });
    renderCalls();
  } catch { /* keep the fallback values */ }
}
loadSnapshot();

// Copy buttons on the install commands.
document.querySelectorAll(".cmd-copy").forEach((b) => (b.onclick = async () => {
  const code = b.parentElement.querySelector(".cmd-code");
  let ok = false;
  try { await navigator.clipboard.writeText(code.textContent); ok = true; } catch {
    const r = document.createRange(); r.selectNodeContents(code);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    try { ok = document.execCommand("copy"); } catch {}
  }
  b.textContent = ok ? "Copied" : "Press ⌘C";
  setTimeout(() => (b.textContent = "Copy"), 1600);
}));
