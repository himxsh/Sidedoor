// Append-only event log the dashboard reads (PLAN.md §4.5, last line).
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "./store.js";

export type EventType =
  | "create.start" | "create.recorded" | "create.done" | "create.failed"
  | "call.start" | "call.cached" | "call.ok" | "call.failed"
  | "guard.detect" | "guard.rerecord" | "guard.check" | "guard.verify" | "guard.swap" | "guard.failed" | "guard.broken"
  | "repair.start" | "repair.done" | "repair.failed"
  | "kane.step";

export interface SidedoorEvent {
  id: string;
  at: string;
  type: EventType;
  endpoint: string;
  /** Groups the events of one call / create / repair */
  trace?: string;
  message: string;
  data?: Record<string, unknown>;
}

export const bus = new EventEmitter();
bus.setMaxListeners(100);

const LOG = () => path.join(DATA_DIR, "events.jsonl");
let seq = 0;

export async function emit(e: Omit<SidedoorEvent, "id" | "at">): Promise<SidedoorEvent> {
  const ev: SidedoorEvent = { id: `${Date.now().toString(36)}-${(seq++).toString(36)}`, at: new Date().toISOString(), ...e };
  // kane.step events are live-only progress; they are not persisted.
  if (ev.type !== "kane.step") {
    await mkdir(DATA_DIR, { recursive: true });
    await appendFile(LOG(), JSON.stringify(ev) + "\n");
  }
  bus.emit("event", ev);
  return ev;
}

export async function readEvents(limit = 500, endpoint?: string): Promise<SidedoorEvent[]> {
  if (!existsSync(LOG())) return [];
  const lines = (await readFile(LOG(), "utf8")).split("\n").filter(Boolean);
  const evs: SidedoorEvent[] = [];
  for (const l of lines) {
    try {
      const e = JSON.parse(l);
      if (!endpoint || e.endpoint === endpoint) evs.push(e);
    } catch {
      /* skip */
    }
  }
  return evs.slice(-limit);
}

export const newTrace = () => Math.random().toString(36).slice(2, 10);
