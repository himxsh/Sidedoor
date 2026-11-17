// Agent tools (PLAN.md §4.7): an MCP server over stdio.
// - one tool per endpoint, typed from endpoint.json
// - create_endpoint, so an agent can make itself a new tool
// - repair_endpoint, so an agent can fix a broken one
// - list_endpoints
// No AI key inside Sidedoor: the calling agent does the thinking, Kane does the browsing.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { callEndpoint, createEndpoint, repairEndpoint, SidedoorError } from "./engine.js";
import { listEndpoints, type Endpoint } from "./store.js";

const toolName = (ep: string) => ep.replace(/-/g, "_");

function endpointTool(e: Endpoint) {
  const fields = Object.keys(e.contract.fields);
  const host = (() => {
    try { return new URL(e.url.replace(/\{\{.*?\}\}/g, "x")).host; } catch { return e.url; }
  })();
  return {
    name: toolName(e.name),
    description:
      `${e.kind === "action" ? "ACTION (has side effects, runs for real, never cached or retried)" : "Read"} on ${host}: ${e.sentence} ` +
      `Returns ${fields.join(", ")} as verified JSON. Kane replays a recorded browser flow (about 15–40 s). ` +
      `Health: ${e.health}. If it fails, the result carries Kane's remark; then call repair_endpoint.`,
    inputSchema: {
      type: "object" as const,
      properties: Object.fromEntries(e.inputs.map((i) => [i.name, { type: "string", description: i.description ?? `e.g. ${i.sample}` }])),
      required: e.inputs.map((i) => i.name),
    },
  };
}

const STATIC_TOOLS = [
  {
    name: "list_endpoints",
    description: "List Sidedoor endpoints with health, inputs, returned fields and the last result.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "create_endpoint",
    description:
      "Make a new tool from one plain-English sentence. Kane records the browser flow once (about a minute, paid once), " +
      "Sidedoor builds a contract from the returned values and proves the recording replays. Reference inputs as {{name}} " +
      "in the url or sentence, and name every value to return with: store ... as 'field'. Use direct sentences (no 'if'). " +
      "Example: url https://quotes.toscrape.com/tag/{{tag}}/ , sentence \"Store the text of the first quote as 'quote' and its author as 'author'.\", inputs [{name:'tag', sample:'humor'}].",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "endpoint name, [a-zA-Z0-9_-]" },
        url: { type: "string", description: "start URL; may contain {{input}}" },
        sentence: { type: "string", description: "what to do and which values to store as 'field'" },
        inputs: {
          type: "array",
          description: "inputs with a sample value used for the recording",
          items: { type: "object", properties: { name: { type: "string" }, sample: { type: "string" } }, required: ["name", "sample"] },
        },
        kind: { type: "string", enum: ["read", "action"], description: "action = has side effects (submits a form)" },
      },
      required: ["name", "url", "sentence"],
    },
  },
  {
    name: "repair_endpoint",
    description:
      "Re-record a broken endpoint with Kane, optionally with a sharper sentence (name the page or link to open and the label next to each value; " +
      "it must still store the same fields). The result is checked against the endpoint's contract and replayed once before it goes back into service. Up to 3 attempts.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string" },
        sentence: { type: "string", description: "optional new sentence" },
        inputs: { type: "object", description: "optional input values for the re-record (defaults to the samples)" },
      },
      required: ["name"],
    },
  },
];

const text = (o: unknown, isError = false) => ({ content: [{ type: "text" as const, text: JSON.stringify(o, null, 2) }], isError });

export async function startMcp() {
  const server = new Server({ name: "sidedoor", version: "0.1.0" }, { capabilities: { tools: { listChanged: true } } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...(await listEndpoints()).map(endpointTool), ...STATIC_TOOLS],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    const a = args as Record<string, any>;
    try {
      if (name === "list_endpoints") {
        return text((await listEndpoints()).map((e) => ({
          tool: toolName(e.name), kind: e.kind, health: e.health, inputs: e.inputs.map((i) => i.name),
          returns: Object.keys(e.contract.fields), sentence: e.sentence, last: e.last, lastFailure: e.health !== "healthy" ? e.lastFailure : undefined,
        })));
      }
      if (name === "create_endpoint") {
        const r = await createEndpoint({ name: a.name, url: a.url, sentence: a.sentence, inputs: a.inputs ?? [], kind: a.kind === "action" ? "action" : "read" });
        await server.sendToolListChanged().catch(() => {});
        return text({ created: r.endpoint.name, tool: toolName(r.endpoint.name), returns: r.endpoint.contract.fields, sample: r.endpoint.sample, recordingCredits: r.recording.credits });
      }
      if (name === "repair_endpoint") {
        const r = await repairEndpoint(a.name, { sentence: a.sentence, inputs: a.inputs });
        return text(r, !r.ok);
      }
      const ep = (await listEndpoints()).find((e) => toolName(e.name) === name);
      if (!ep) return text({ error: `unknown tool ${name}` }, true);
      const r = await callEndpoint(ep.name, a);
      return text(r, !r.ok);
    } catch (e: any) {
      return text(e instanceof SidedoorError ? { error: e.message, ...e.details } : { error: String(e?.message ?? e) }, true);
    }
  });

  await server.connect(new StdioServerTransport());
  console.error("sidedoor MCP server ready (stdio)");
}
