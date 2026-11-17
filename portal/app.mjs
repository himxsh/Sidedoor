// Campus Portal: a small demo site with NO API (PLAN.md §4.9).
// All data is made up. Two layouts ("a" and "b") render the same data with
// different markup, so a recorded Kane flow breaks when the layout is flipped.
//
// Layout switch:
//   GET  /__layout            -> {"layout":"a"}
//   POST /__layout?set=b      -> flips the layout for every visitor (local demo)
//   any page ?layout=b        -> renders that layout for this request only (hosted demo)

export const NOTICES = [
  { title: "Mid-semester exam schedule released", date: "2026-11-17", body: "The timetable for mid-semester exams is now on the notice board. Exams begin 1 December." },
  { title: "Library open 24 hours during exam weeks", date: "2026-11-12", body: "From 24 November the central library stays open around the clock." },
  { title: "Hostel fee payment window extended", date: "2026-11-05", body: "Hostel fees for the spring term can now be paid until 30 November." },
  { title: "Inter-college hackathon registrations open", date: "2026-10-28", body: "Teams of up to four can register at the student activity centre." },
];

export const STUDENTS = {
  S1001: { name: "Aarav Mehta", amount: "₹42,500", due: "2026-11-30", program: "B.Tech CSE" },
  S1002: { name: "Diya Rao", amount: "₹18,000", due: "2026-12-05", program: "B.Tech ECE" },
  S1003: { name: "Kabir Singh", amount: "₹0", due: "—", program: "M.Tech AI" },
  S1004: { name: "Meera Iyer", amount: "₹27,750", due: "2026-12-12", program: "B.Des" },
};

const state = { layout: (process.env.PORTAL_LAYOUT || "a").toLowerCase() === "b" ? "b" : "a" };
const leaveRequests = [];
let leaveCounter = 4100;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtDate = (iso) => {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

const CSS_A = `
body{font-family:Georgia,serif;margin:0;background:#f4f1ea;color:#222}
header{background:#7a1f1f;color:#fff;padding:16px 24px}header a{color:#fff;margin-right:16px}
main{max-width:860px;margin:24px auto;padding:0 16px}
table{width:100%;border-collapse:collapse;background:#fff}th,td{border:1px solid #ccc;padding:8px;text-align:left}
th{background:#eee}form label{display:block;margin:10px 0 4px}input,textarea{padding:6px;width:280px}
button{margin-top:12px;padding:8px 16px;background:#7a1f1f;color:#fff;border:0}
.result{background:#fff;border:1px solid #ccc;padding:12px;margin-top:16px}`;

const CSS_B = `
body{font-family:system-ui,sans-serif;margin:0;background:#0f172a;color:#e2e8f0;display:grid;grid-template-columns:220px 1fr;min-height:100vh}
aside{background:#1e293b;padding:20px}aside nav a{display:block;color:#93c5fd;margin:8px 0}
.promo{background:#334155;border-radius:8px;padding:10px;margin:16px 0;font-size:13px}
section.content{padding:24px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
article{background:#1e293b;border-radius:12px;padding:16px}
article time{font-size:12px;color:#94a3b8;display:block;margin-bottom:6px}
.kv{display:grid;grid-template-columns:140px 1fr;gap:6px;background:#1e293b;padding:16px;border-radius:12px;margin-top:16px}
form .row{display:flex;flex-direction:column;margin:10px 0}input,textarea{padding:8px;border-radius:6px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;max-width:320px}
button{padding:10px 18px;border-radius:8px;background:#2563eb;color:#fff;border:0;margin-top:8px}`;

function page(layout, title, body) {
  if (layout === "a") {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)} · Campus Portal</title><style>${CSS_A}</style></head>
<body><header><h1>Campus Portal</h1><nav><a href="/">Notice board</a><a href="/fees">Fee status</a><a href="/leave">Leave request</a></nav></header>
<main>${body}</main></body></html>`;
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)} · Campus Portal</title><style>${CSS_B}</style></head>
<body><aside><div class="brand"><strong>CampusOne</strong><div>Student services</div></div>
<div class="promo"><div>New!</div><div>The portal has a fresh look.</div></div>
<nav><div><a href="/">Dashboard</a></div><div><a href="/leave">Apply for leave</a></div><div><a href="/fees">Fees &amp; dues</a></div><div><a href="/announcements">Announcements</a></div></nav></aside>
<section class="content"><div class="crumbs"><span>Home</span> / <span>${esc(title)}</span></div>${body}</section></body></html>`;
}

function noticesPage(layout) {
  if (layout === "a") {
    const rows = NOTICES.map((n) => `<tr class="notice"><td class="notice-date">${esc(n.date)}</td><td class="notice-title">${esc(n.title)}</td><td>${esc(n.body)}</td></tr>`).join("");
    return page("a", "Notice board", `<h2>Notice board</h2><p>Latest notices first.</p>
<table id="notices"><thead><tr><th>Date</th><th>Title</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table>`);
  }
  // Layout B: cards, human dates, different classes and nesting.
  const cards = NOTICES.map((n) => `<article><div><div><time datetime="${esc(n.date)}">Posted ${esc(fmtDate(n.date))}</time></div><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p></div></article>`).join("");
  return page("b", "Announcements", `<div class="banner"><div><h2>Announcements</h2></div><div><small>Most recent at the top</small></div></div><div class="grid">${cards}</div>`);
}

// Layout B home: a dashboard with no notices on it (they moved to /announcements).
function dashboardPage() {
  return page("b", "Dashboard", `<h2>Welcome back</h2><div class="grid">
<article><h3>Fees &amp; dues</h3><p>Check what you owe this term.</p><a href="/fees">Open</a></article>
<article><h3>Leave</h3><p>Apply for leave in under a minute.</p><a href="/leave">Open</a></article>
<article><h3>Announcements</h3><p>Exam schedules, library hours and more.</p><a href="/announcements">View announcements</a></article></div>`);
}

function feesPage(layout, id) {
  const s = id ? STUDENTS[id.trim().toUpperCase()] : undefined;
  if (layout === "a") {
    let result = "";
    if (id) {
      result = s
        ? `<div class="result" id="fee-result"><p>Student: <span class="student-name">${esc(s.name)}</span></p><p>Amount due: <strong class="amount-due">${esc(s.amount)}</strong></p><p>Due date: <span class="due-date">${esc(s.due)}</span></p></div>`
        : `<div class="result" id="fee-result"><p class="error">No student found with ID ${esc(id)}.</p></div>`;
    }
    return page("a", "Fee status", `<h2>Fee status</h2><form method="get" action="/fees"><label for="sid">Student ID</label><input id="sid" name="id" placeholder="e.g. S1001" value="${esc(id || "")}"><br><button type="submit">Check fees</button></form>${result}`);
  }
  let result = "";
  if (id) {
    result = s
      ? `<div class="kv"><div>Due by</div><div>${esc(s.due === "—" ? "—" : fmtDate(s.due))}</div><div>Program</div><div>${esc(s.program)}</div><div>Outstanding</div><div><b>${esc(s.amount)}</b></div><div>Name</div><div>${esc(s.name)}</div></div>`
      : `<div class="kv"><div>Status</div><div>We could not find ${esc(id)}.</div></div>`;
  }
  return page("b", "Fees & dues", `<h2>Fees &amp; dues</h2><form method="get" action="/fees"><div class="row"><span>Enrolment number</span><input name="student" placeholder="S1001" value="${esc(id || "")}"></div><button type="submit">Look up</button></form>${result}`);
}

function leavePage(layout, confirmation) {
  if (confirmation) {
    const c = confirmation;
    if (layout === "a")
      return page("a", "Leave request", `<h2>Leave request submitted</h2><div class="result"><p>Your confirmation number is <strong id="confirmation">${esc(c.number)}</strong>.</p><p>${esc(c.name)}, ${esc(c.from)} to ${esc(c.to)}.</p></div><p><a href="/leave">New request</a></p>`);
    return page("b", "Apply for leave", `<div class="kv"><div>Reference</div><div><b>${esc(c.number)}</b></div><div>Applicant</div><div>${esc(c.name)}</div><div>Dates</div><div>${esc(c.from)} → ${esc(c.to)}</div></div>`);
  }
  if (layout === "a")
    return page("a", "Leave request", `<h2>Leave request</h2><form method="post" action="/leave">
<label for="name">Full name</label><input id="name" name="name" required>
<label for="from">From date</label><input id="from" name="from" type="date" required>
<label for="to">To date</label><input id="to" name="to" type="date" required>
<label for="reason">Reason</label><textarea id="reason" name="reason" required></textarea><br>
<button type="submit">Submit request</button></form>`);
  return page("b", "Apply for leave", `<h2>Apply for leave</h2><form method="post" action="/leave">
<div class="row"><span>Reason for leave</span><textarea name="reason" required></textarea></div>
<div class="row"><span>Starting</span><input name="from" type="date" required></div>
<div class="row"><span>Ending</span><input name="to" type="date" required></div>
<div class="row"><span>Your name</span><input name="name" required></div>
<button type="submit">Send application</button></form>`);
}

async function readBody(req) {
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") return new URLSearchParams(req.body).toString();
  let data = "";
  for await (const chunk of req) data += chunk;
  return data;
}

/** Node-style request handler, usable from a plain http server or a serverless function. */
export async function handle(req, res) {
  const url = new URL(req.url, "http://portal.local");
  const q = url.searchParams.get("layout");
  const layout = q === "a" || q === "b" ? q : state.layout;
  const send = (status, body, type = "text/html; charset=utf-8") => {
    res.statusCode = status;
    res.setHeader("content-type", type);
    res.setHeader("cache-control", "no-store");
    res.end(body);
  };

  if (url.pathname === "/__layout") {
    const set = url.searchParams.get("set");
    if (req.method === "POST" && (set === "a" || set === "b")) state.layout = set;
    return send(200, JSON.stringify({ layout: state.layout }), "application/json");
  }
  if (url.pathname === "/__leave-requests") return send(200, JSON.stringify(leaveRequests), "application/json");
  if (url.pathname === "/") return send(200, layout === "b" ? dashboardPage() : noticesPage("a"));
  if (url.pathname === "/announcements" || url.pathname === "/notices") return send(200, noticesPage(layout));
  if (url.pathname === "/fees") return send(200, feesPage(layout, url.searchParams.get("id") ?? url.searchParams.get("student")));
  if (url.pathname === "/leave") {
    if (req.method === "POST") {
      const form = new URLSearchParams(await readBody(req));
      const entry = {
        number: `LR-${++leaveCounter}`,
        name: form.get("name") || "",
        from: form.get("from") || "",
        to: form.get("to") || "",
        reason: form.get("reason") || "",
        at: new Date().toISOString(),
      };
      leaveRequests.push(entry);
      return send(200, leavePage(layout, entry));
    }
    return send(200, leavePage(layout));
  }
  if (url.pathname === "/health") return send(200, "ok", "text/plain");
  return send(404, page(layout, "Not found", "<h2>Page not found</h2>"));
}
