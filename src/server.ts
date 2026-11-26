// HTTP server (PLAN.md §4.6).
//   GET|POST /api/<name>          call an endpoint (inputs from query string or JSON body)
//   POST     /api/<name>/repair   re-record, optionally with {"sentence": "..."}
//   GET      /api/endpoints       list with health
//   POST     /api/endpoints       create {name,url,sentence,inputs:[{name,sample}],kind}
//   GET      /api/events          live event stream (SSE); /api/events/history for the log
//   GET      /evidence/...        screenshots and NDJSON logs of every run
//   GET      /                    dashboard
import { existsSync, createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callEndpoint, createEndpoint, queueState, repairEndpoint, SidedoorError } from "./engine.js";
import { bus, readEvents, type SidedoorEvent } from "./events.js";
import { EVIDENCE_DIR, ROOT, listEndpoints, type Endpoint } from "./store.js";

const WEB_DIR = existsSync(path.join(ROOT, "web")) ? path.join(ROOT, "web") : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "web");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ndjson": "application/x-ndjson", ".ico": "image/x-icon",
};

export function publicEndpoint(e: Endpoint) {
  const saved = Math.max(0, e.stats.calls - (e.stats.recordings - 1)) * e.stats.recordingCost;
  return {
    name: e.name, url: e.url, sentence: e.sentence, kind: e.kind, health: e.health,
    inputs: e.inputs, returns: e.contract.fields, sample: e.sample, last: e.last, lastFailure: e.lastFailure,
    stats: { ...e.stats, creditsSaved: Math.round(saved * 10) / 10 },
    call: `/api/${e.name}${e.inputs.length ? "?" + e.inputs.map((i) => `${i.name}=${encodeURIComponent(i.sample)}`).join("&") : ""}`,
  };
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  let raw = "";
  for await (const c of req) raw += c;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" });
  res.end(JSON.stringify(body, null, 2));
}

async function serveFile(res: http.ServerResponse, base: string, rel: string) {
  const file = path.resolve(base, "." + path.posix.normalize("/" + rel));
  if (!file.startsWith(base) || !existsSync(file) || !(await stat(file)).isFile()) return false;
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
  createReadStream(file).pipe(res);
  return true;
}

export async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? "/", "http://sidedoor.local");
  const p = url.pathname.replace(/\/+$/, "") || "/";
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" });
    return res.end();
  }
  try {
    if (p === "/health") return send(res, 200, { ok: true, queue: queueState() });
    if (p === "/api/endpoints" && req.method === "GET") return send(res, 200, (await listEndpoints()).map(publicEndpoint));
    if (p === "/api/endpoints" && req.method === "POST") {
      const b = await readJson(req);
      const r = await createEndpoint({ name: b.name, url: b.url, sentence: b.sentence, inputs: b.inputs ?? [], kind: b.kind === "action" ? "action" : "read", force: !!b.force });
      return send(res, 201, { endpoint: publicEndpoint(r.endpoint), recording: r.recording });
    }
    if (p === "/api/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "access-control-allow-origin": "*" });
      res.write(": connected\n\n");
      const on = (e: SidedoorEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);
      bus.on("event", on);
      const ping = setInterval(() => res.write(": ping\n\n"), 15000);
      req.on("close", () => {
        bus.off("event", on);
        clearInterval(ping);
      });
      return;
    }
    if (p === "/api/events/history") return send(res, 200, await readEvents(Number(url.searchParams.get("limit") || 500), url.searchParams.get("endpoint") || undefined));
    if (p === "/api/queue") return send(res, 200, queueState());
    let m = p.match(/^\/api\/([a-zA-Z0-9_-]+)\/repair$/);
    if (m && req.method === "POST") {
      const b = await readJson(req);
      const r = await repairEndpoint(m[1], { sentence: b.sentence, inputs: b.inputs });
      return send(res, r.ok ? 200 : 502, r);
    }
    m = p.match(/^\/api\/([a-zA-Z0-9_-]+)$/);
    if (m && (req.method === "GET" || req.method === "POST")) {
      const given: Record<string, unknown> = Object.fromEntries(url.searchParams);
      if (req.method === "POST") Object.assign(given, await readJson(req));
      const noCache = given.fresh === "1" || given.fresh === true;
      delete given.fresh;
      const r = await callEndpoint(m[1], given, { noCache });
      return send(res, r.ok ? 200 : 502, r);
    }
    if (p.startsWith("/evidence/") && (await serveFile(res, EVIDENCE_DIR, p.slice("/evidence/".length)))) return;
    if (await serveFile(res, WEB_DIR, p === "/" ? "index.html" : p.slice(1))) return;
    return send(res, 404, { error: "not found" });
  } catch (e: any) {
    if (e instanceof SidedoorError) return send(res, e.status, { error: e.message, ...e.details });
    if (/no endpoint named/.test(String(e?.message))) return send(res, 404, { error: e.message });
    console.error(e);
    return send(res, 500, { error: String(e?.message ?? e) });
  }
}

export async function startServer(port: number) {
  const server = http.createServer((req, res) => void handle(req, res));
  server.requestTimeout = 0; // a repair can take several minutes
  server.headersTimeout = 0;
  await new Promise<void>((r) => server.listen(port, r));
  console.log(`Sidedoor on http://localhost:${port}  (dashboard /, API /api/<name>)`);
  return server;
}
