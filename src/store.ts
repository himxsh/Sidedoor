// Endpoint store (PLAN.md §4.2). One folder per endpoint, committed to git:
//   endpoints/<name>/endpoint.json
//   endpoints/<name>/.testmuai/tests/<name>_test.md        (the Kane test file)
//   endpoints/<name>/.testmuai/tests/output-<name>/        (the recording Kane replays)
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Contract } from "./contract.js";

export type Kind = "read" | "action";
export type Health = "healthy" | "repairing" | "broken" | "new";

export interface InputSpec {
  name: string;
  sample: string;
  description?: string;
}

export interface LastResult {
  at: string;
  ok: boolean;
  data?: Record<string, unknown>;
  durationMs: number;
  problem?: string;
}

export interface Endpoint {
  name: string;
  url: string;
  sentence: string;
  inputs: InputSpec[];
  kind: Kind;
  contract: Contract;
  health: Health;
  createdAt: string;
  stats: {
    calls: number;
    replays: number;
    cacheHits: number;
    recordings: number;
    repairs: number;
    creditsSpent: number;
    /** Cost of the first recording, used for "credits saved" */
    recordingCost: number;
    avgReplayMs: number;
  };
  sample?: Record<string, unknown>;
  last?: LastResult;
  repairAttempts?: number;
  lastFailure?: { at: string; remark?: string; violations?: unknown[]; evidence?: string };
}

export { ROOT } from "./home.js";
import { ROOT } from "./home.js";
export const ENDPOINTS_DIR = path.join(ROOT, "endpoints");
export const DATA_DIR = path.join(ROOT, "data");
export const EVIDENCE_DIR = path.join(ROOT, "evidence");

export const NAME_RE = /^[a-zA-Z0-9_-]{1,48}$/;

export const endpointDir = (name: string) => path.join(ENDPOINTS_DIR, name);
export const testFile = (name: string) => path.join(endpointDir(name), ".testmuai", "tests", `${name}_test.md`);
const jsonFile = (name: string) => path.join(endpointDir(name), "endpoint.json");

export async function loadEndpoint(name: string): Promise<Endpoint> {
  if (!NAME_RE.test(name)) throw new Error(`invalid endpoint name: ${name}`);
  const p = jsonFile(name);
  if (!existsSync(p)) throw new Error(`no endpoint named "${name}"`);
  return JSON.parse(await readFile(p, "utf8"));
}

export async function saveEndpoint(ep: Endpoint): Promise<void> {
  await mkdir(endpointDir(ep.name), { recursive: true });
  const tmp = jsonFile(ep.name) + ".tmp";
  await writeFile(tmp, JSON.stringify(ep, null, 2) + "\n");
  await rename(tmp, jsonFile(ep.name));
}

export async function listEndpoints(): Promise<Endpoint[]> {
  if (!existsSync(ENDPOINTS_DIR)) return [];
  const out: Endpoint[] = [];
  for (const d of (await readdir(ENDPOINTS_DIR, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (d.isDirectory() && existsSync(jsonFile(d.name))) out.push(await loadEndpoint(d.name));
  }
  return out;
}

export function emptyStats(): Endpoint["stats"] {
  return { calls: 0, replays: 0, cacheHits: 0, recordings: 0, repairs: 0, creditsSpent: 0, recordingCost: 0, avgReplayMs: 0 };
}
