import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseArgs } from "node:util";
import { createServer } from "./tools.js";

async function main() {
  const { values } = parseArgs({ strict: true, options: { "output-dir": { type: "string" }, help: { type: "boolean", short: "h" } } });
  if (values.help) { process.stderr.write("WeDraft local MCP (stdio)\nnode server.mjs [--output-dir /absolute/artifact/directory]\nWithout --output-dir, only pure read-only formatting tools are available.\n"); return; }
  const server = createServer(values["output-dir"] ? { outputDirectory: values["output-dir"] } : {});
  await server.connect(new StdioServerTransport());
}
main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "MCP startup failed"}\n`); process.exitCode = 1; });
