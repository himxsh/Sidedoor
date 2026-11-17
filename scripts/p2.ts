// Phase 2 repair gate: replay notices under different conditions.
import path from "node:path";
import { replay } from "../src/runner.js";
const [ep, label, vars, ...flags] = process.argv.slice(2);
const dir = path.resolve(`endpoints/${ep}`);
const r = await replay(path.join(dir, `.testmuai/tests/${ep}_test.md`), {
  variables: vars && vars !== "-" ? JSON.parse(vars) : undefined,
  cwd: dir, timeoutSec: 240, author: flags.includes("--author"),
  extraArgs: flags.filter((f) => f !== "--author"),
  logPath: path.resolve(`evidence/p2-${label}.ndjson`),
});
console.log(JSON.stringify({ label, status: r.status, exit: r.exitCode, data: r.values, remark: r.remark?.slice(0, 400), durationMs: r.durationMs, credits: r.runEnd?.credits_consumed }, null, 1));
