// TODO(remove-kane-switch): TEMPORARY. Remove this file and every TODO(remove-kane-switch) once the project is ready.
// Kane CLI master switch. When off, nothing can start a Kane run (calls, creates, repairs,
// from the API, MCP or CLI), so nobody can spend the account's credits. Cached results still serve.
//
// Precedence: SIDEDOOR_KANE=on|off (env) > sidedoor.config.json {"kane": "on"|"off"} > off.
// Change it on the machine itself: `sidedoor kane on|off`, or the dashboard switch,
// which the server only accepts from localhost.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.env.SIDEDOOR_HOME || process.cwd());
export const CONFIG_FILE = path.join(ROOT, "sidedoor.config.json");

function readConfig(): Record<string, unknown> {
  try { return existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, "utf8")) : {}; } catch { return {}; }
}

export function kaneState(): { enabled: boolean; source: "env" | "config" | "default" } {
  const env = process.env.SIDEDOOR_KANE?.toLowerCase();
  if (env === "on" || env === "off") return { enabled: env === "on", source: "env" };
  const c = readConfig().kane;
  if (c === "on" || c === "off") return { enabled: c === "on", source: "config" };
  return { enabled: false, source: "default" };
}

export const kaneEnabled = () => kaneState().enabled;

export function setKane(on: boolean) {
  writeFileSync(CONFIG_FILE, JSON.stringify({ ...readConfig(), kane: on ? "on" : "off" }, null, 2) + "\n");
  return kaneState();
}

export class KaneOffError extends Error {
  status = 503;
  hint = "Kane CLI is switched off on this server, so no browser runs (and no credits) can be started. Turn it on locally: `sidedoor kane on`.";
  constructor() { super("Kane CLI is switched off"); }
}
