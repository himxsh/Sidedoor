// Export the hosted playback copy: web/snapshot.json plus the Kane screenshots it references.
// Usage: npx tsx scripts/snapshot.ts   (run after real calls, so the snapshot holds real runs)
import fs from "node:fs/promises";
import path from "node:path";
import { listEndpoints, EVIDENCE_DIR, ROOT } from "../src/store.js";
import { readEvents } from "../src/events.js";
import { publicEndpoint } from "../src/server.js";

const WEB = path.join(ROOT, "web");
const endpoints = (await listEndpoints()).map(publicEndpoint);
const events = await readEvents(600);

// One recorded call per endpoint: the latest successful call (or create proof) from the log.
const calls: Record<string, { at: string; result: unknown }> = {};
for (const e of events) {
  if (!e.endpoint) continue;
  if (e.type === "call.ok" || e.type === "guard.swap") {
    calls[e.endpoint] = { at: e.at, result: { endpoint: e.endpoint, ok: true, verified: true, repaired: e.type === "guard.swap" || undefined, data: (e.data as any)?.data, trace: e.trace } };
  }
}
for (const ep of endpoints) {
  if (!calls[ep.name] && ep.last?.ok) calls[ep.name] = { at: ep.last.at, result: { endpoint: ep.name, ok: true, verified: true, data: ep.last.data } };
}

// Copy referenced screenshots next to the page.
const shots = new Set<string>();
for (const e of events) {
  const s = (e.data as any)?.screenshot;
  if (typeof s === "string" && s.startsWith("shots/")) shots.add(s);
}
await fs.rm(path.join(WEB, "evidence"), { recursive: true, force: true });
await fs.mkdir(path.join(WEB, "evidence", "shots"), { recursive: true });
let copied = 0;
for (const s of shots) {
  try { await fs.copyFile(path.join(EVIDENCE_DIR, s), path.join(WEB, "evidence", s)); copied++; } catch { /* missing file: skip */ }
}

const snapshot = { capturedAt: new Date().toISOString(), endpoints, events, calls };
await fs.writeFile(path.join(WEB, "snapshot.json"), JSON.stringify(snapshot, null, 1));
console.log(`snapshot: ${endpoints.length} endpoints, ${events.length} events, ${Object.keys(calls).length} recorded calls, ${copied} screenshots`);
