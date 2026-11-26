// Where Sidedoor keeps its endpoints, data and evidence.
//   1. SIDEDOOR_HOME, if set.
//   2. The current folder, if it is the Sidedoor repo checkout (`npm start`, `npm run dev`).
//   3. ~/.sidedoor otherwise (an `npx getsidedoor ...` install run from anywhere). Created on first use.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function isRepo(dir: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
    return pkg.name === "getsidedoor" && existsSync(path.join(dir, "src", "cli.ts"));
  } catch {
    return false;
  }
}

function resolveHome(): string {
  if (process.env.SIDEDOOR_HOME) return path.resolve(process.env.SIDEDOOR_HOME);
  if (isRepo(process.cwd())) return process.cwd();
  return path.join(os.homedir(), ".sidedoor");
}

export const ROOT = resolveHome();
mkdirSync(ROOT, { recursive: true });
