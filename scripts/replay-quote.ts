// Phase 1 check: replay the recorded random_quote test with the runner and print JSON.
import path from "node:path";
import { replay } from "../src/runner.js";

const dir = path.resolve("endpoints/random_quote");
const r = await replay(path.join(dir, ".testmuai/tests/random_quote_test.md"), {
  cwd: dir,
  timeoutSec: 180,
  logPath: path.resolve("evidence/replay-random_quote.ndjson"),
});
console.log(JSON.stringify({ status: r.status, data: r.values, durationMs: r.durationMs, evidence: r.evidenceUrl }, null, 2));
process.exit(r.status === "passed" ? 0 : 1);
