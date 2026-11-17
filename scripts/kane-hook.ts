// Kane in the build loop (PLAN.md §4.10). Claude Code runs this after every file edit.
// It replays the Kane tests for the dashboard and the portal. On failure it prints Kane's
// failure remark and exits 2, which hands the remark back to the agent: fix the code first.
// Every failed run is kept in evidence/build-hook/ for the README and the video.
import { existsSync } from "node:fs";
import { appendFile, copyFile, mkdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { replay } from "../src/runner.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "evidence", "build-hook");
// TODO(remove-kane-switch): the build hook is a local dev check (it only runs on file edits on this
// machine), so it opts in past the server's Kane switch. An explicit SIDEDOOR_KANE=off still wins.
process.env.SIDEDOOR_KANE ??= "on";
const WATCH = [/^web\//, /^portal\//, /^src\/server\.ts$/];
const TESTS = [
  { name: "dashboard", test: "dashboard-2", dir: "tests/kane/dashboard", url: "http://localhost:3030/health", start: ["npx", ["tsx", "src/cli.ts", "serve", "--port", "3030"]] },
  { name: "portal", dir: "tests/kane/portal", url: "http://localhost:4400/health", start: ["node", ["portal/server.mjs"]] },
] as const;

async function stdinJson(): Promise<any> {
  if (process.stdin.isTTY || process.argv[2]) return {};
  const raw = await new Promise<string>((resolve) => {
    let buf = "";
    const done = () => resolve(buf);
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", done);
    setTimeout(done, 3000);
  });
  process.stdin.pause();
  try { return JSON.parse(raw); } catch { return {}; }
}

async function up(url: string) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}

async function ensure(t: (typeof TESTS)[number]) {
  if (await up(t.url)) return;
  const [cmd, args] = t.start;
  spawn(cmd, [...args], { cwd: ROOT, detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 40 && !(await up(t.url)); i++) await new Promise((r) => setTimeout(r, 500));
}

async function main() {
  if (process.env.SIDEDOOR_HOOK === "off") return;
  const input = await stdinJson();
  const file = input?.tool_input?.file_path ? path.relative(ROOT, path.resolve(input.tool_input.file_path)) : process.argv[2] ?? "";
  if (input?.tool_input && !WATCH.some((re) => re.test(file))) return; // only UI edits trigger a Kane run
  // A page served by the dev server picks up the edit on reload; give the server a moment for src/ changes.
  await mkdir(OUT, { recursive: true });
  const failures: string[] = [];
  for (const t of TESTS) {
    await ensure(t);
    const dir = path.join(ROOT, t.dir);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const log = path.join(OUT, "runs", `${stamp}-${t.name}.ndjson`);
    const r = await replay(path.join(dir, `.testmuai/tests/${(t as { test?: string }).test ?? t.name}_test.md`), { cwd: dir, timeoutSec: 180, logPath: log, extraArgs: ["--no-adaptive-heal"] });
    const entry = { at: new Date().toISOString(), test: t.name, trigger: file, status: r.status, durationMs: r.durationMs, reason: r.runEnd?.reason, failedSteps: r.failedSteps, remark: r.remark, log: path.relative(ROOT, log) };
    await appendFile(path.join(OUT, "runs.jsonl"), JSON.stringify(entry) + "\n");
    if (r.status !== "passed") {
      let shot: string | undefined;
      if (r.screenshotPath && existsSync(r.screenshotPath)) {
        shot = path.join(OUT, `failed-${stamp}-${t.name}.png`);
        await copyFile(r.screenshotPath, shot).catch(() => (shot = undefined));
      }
      await copyFile(log, path.join(OUT, `failed-${stamp}-${t.name}.ndjson`));
      await appendFile(path.join(OUT, "failures.jsonl"), JSON.stringify({ ...entry, screenshot: shot && path.relative(ROOT, shot) }) + "\n");
      const objective = (await readFile(path.join(dir, `.testmuai/tests/${(t as { test?: string }).test ?? t.name}_test.md`), "utf8")).split("## Step 1")[1]?.trim();
      failures.push(
        `Kane build check FAILED for the ${t.name} (after editing ${file || "?"}).\n` +
        `  Test: ${objective}\n` +
        `  Kane: ${[r.runEnd?.reason, ...r.failedSteps].filter(Boolean).join(" | ") || r.status}\n` +
        (r.remark && r.remark !== r.runEnd?.reason ? `  Remark: ${r.remark}\n` : "") +
        (shot ? `  Screenshot: ${path.relative(ROOT, shot)}\n` : ""),
      );
    }
  }
  if (failures.length) {
    process.stderr.write(failures.join("\n") + "\nFix the code so this Kane test passes before continuing.\n");
    process.exit(2);
  }
}

main().catch((e) => {
  process.stderr.write(`kane-hook error: ${e?.stack || e}\n`);
  process.exit(0); // a broken hook must not block work; only a failed Kane test does
});
