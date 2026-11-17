// One command: Campus Portal on :4400 and Sidedoor (API, MCP-ready store, dashboard) on :3030.
import { spawn } from "node:child_process";
const run = (name, args) => {
  const p = spawn(process.execPath, args, { stdio: ["ignore", "inherit", "inherit"] });
  p.on("exit", (code) => { console.log(`${name} exited (${code})`); process.exit(code ?? 1); });
  return p;
};
const kids = [
  run("portal", ["portal/server.mjs"]),
  run("sidedoor", ["--import", "tsx", "src/cli.ts", "serve", "--port", process.env.PORT || "3030"]),
];
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { kids.forEach((k) => k.kill()); process.exit(0); });
