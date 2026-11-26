#!/usr/bin/env node
// sidedoor CLI: create | call | repair | list | serve | mcp
import { callEndpoint, createEndpoint, repairEndpoint, SidedoorError } from "./engine.js";
import { listEndpoints } from "./store.js";
import type { InputSpec, Kind } from "./store.js";

const HELP = `Sidedoor: turn a web page with no API into a JSON endpoint and an agent tool.

  sidedoor create --name <name> --url <url> [--input key=sample]... [--action] "<sentence>"
      Kane records the flow once. Reference inputs as {{key}} and name each value
      to return: "store the price as 'price'".
  sidedoor call <name> [--key value]... [--no-cache]
      Free replay. Prints verified JSON.
  sidedoor repair <name> ["<sharper sentence>"] [--key value]...
      Re-record a broken endpoint, optionally with a new sentence.
  sidedoor list
  sidedoor serve [--port 3030]        HTTP API, dashboard (/dashboard), playground (/playground)
  sidedoor mcp                        MCP server (stdio) for Claude Code, Cursor, Codex...
                                      (also the default when an MCP client starts sidedoor with no command)
`;

function parse(argv: string[]) {
  const pos: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const inputs: InputSpec[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, inline] = a.slice(2).split(/=(.*)/s, 2);
      const next = argv[i + 1];
      const val = inline ?? (next !== undefined && !next.startsWith("--") ? (i++, next) : true);
      if (k === "input" && typeof val === "string") {
        const [n, sample = ""] = val.split(/=(.*)/s, 2);
        inputs.push({ name: n, sample });
      } else flags[k] = val;
    } else pos.push(a);
  }
  return { pos, flags, inputs };
}

async function main() {
  const [given, ...rest] = process.argv.slice(2);
  // No command and no terminal on stdin: an MCP client (Claude Code, Cursor...) started us. Speak MCP.
  const cmd = given ?? (process.stdin.isTTY ? undefined : "mcp");
  const { pos, flags, inputs } = parse(rest);
  const out = (o: unknown) => console.log(JSON.stringify(o, null, 2));
  switch (cmd) {
    case "create": {
      const sentence = pos.join(" ");
      if (!flags.name || !flags.url || !sentence) throw new SidedoorError("create needs --name, --url and a sentence");
      for (const i of inputs) if (!i.sample) throw new SidedoorError(`--input ${i.name} needs a sample value: --input ${i.name}=<sample>`);
      console.error(`Kane is recording "${flags.name}" (about a minute, paid once)...`);
      const r = await createEndpoint({ name: String(flags.name), url: String(flags.url), sentence, inputs, kind: (flags.action ? "action" : "read") as Kind, force: !!flags.force });
      out({ endpoint: r.endpoint.name, kind: r.endpoint.kind, contract: r.endpoint.contract, sample: r.endpoint.sample, recording: r.recording, proof: r.proof });
      break;
    }
    case "call": {
      const name = pos[0];
      if (!name) throw new SidedoorError("call needs an endpoint name");
      const given: Record<string, string> = {};
      for (const [k, v] of Object.entries(flags)) if (k !== "no-cache" && typeof v === "string") given[k] = v;
      const r = await callEndpoint(name, given, { noCache: !!flags["no-cache"] });
      out(r);
      process.exitCode = r.ok ? 0 : 1;
      break;
    }
    case "repair": {
      const [name, ...words] = pos;
      if (!name) throw new SidedoorError("repair needs an endpoint name");
      const given: Record<string, string> = {};
      for (const [k, v] of Object.entries(flags)) if (typeof v === "string") given[k] = v;
      const r = await repairEndpoint(name, { sentence: words.join(" ") || undefined, inputs: given });
      out(r);
      process.exitCode = r.ok ? 0 : 1;
      break;
    }
    case "list": {
      const eps = await listEndpoints();
      out(eps.map((e) => ({ name: e.name, kind: e.kind, health: e.health, inputs: e.inputs.map((i) => i.name), returns: Object.keys(e.contract.fields), calls: e.stats.calls, last: e.last })));
      break;
    }
    case "serve": {
      const { startServer } = await import("./server.js");
      await startServer(Number(flags.port || process.env.PORT || 3030));
      break;
    }
    case "mcp": {
      const { startMcp } = await import("./mcp.js");
      await startMcp();
      break;
    }
    default:
      console.log(HELP);
  }
}

main().catch((e) => {
  const err = e instanceof SidedoorError ? { error: e.message, ...e.details } : { error: String(e?.stack || e) };
  console.error(JSON.stringify(err, null, 2));
  process.exit(1);
});
