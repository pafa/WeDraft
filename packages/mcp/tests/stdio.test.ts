import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importArticleBundle, renderArticle } from "@wedraft/core";
import { z } from "zod";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const clients: Client[] = []; const directories: string[] = [];
beforeAll(() => execFileSync(process.execPath, [join(root, "scripts/build-tools.mjs"), "mcp"], { cwd: root }));
afterEach(async () => { for (const client of clients.splice(0)) await client.close(); for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); });
async function connect(outputDirectory?: string) {
  const client = new Client({ name: "wedraft-integration-test", version: "1.0.0" });
  clients.push(client);
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [join(root, "packages/mcp/dist/server.mjs"), ...(outputDirectory ? ["--output-dir", outputDirectory] : [])], cwd: root, stderr: "pipe" }));
  return client;
}

describe("real MCP stdio process", () => {
  it("discovers only pure tools by default and renders the same HTML as the core", async () => {
    const client = await connect();
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(["list_templates", "validate_article", "render_article"]);
    expect(tools.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    const input = { markdown: "MCP 真实调用\n\n正文 **重点** 和 [来源](https://example.com)。" };
    const rendered = await client.callTool({ name: "render_article", arguments: input });
    expect(rendered.isError).not.toBe(true);
    expect(rendered.structuredContent).toMatchObject({ status: "ready", html: renderArticle(input).html });
    const invalid = await client.callTool({ name: "render_article", arguments: { ...input, templateId: "missing" } });
    expect(invalid.isError).toBe(true);
    const missing = await client.callTool({ name: "validate_article", arguments: { markdown: "标题\n\n正文\n\n![图](private.png)" } });
    expect(missing.structuredContent).toMatchObject({ status: "blocked" });
  });
  it("exports to the configured directory and returns a reopenable article bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "wedraft-mcp-")); directories.push(root);
    const client = await connect(root);
    const tools = await client.listTools();
    expect(tools.tools.find((tool) => tool.name === "export_article")?.annotations?.readOnlyHint).toBe(false);
    const input = { markdown: "AI 到网页\n\n完整原文和 **重点**。\n", templateId: "default-business" };
    const response = await client.callTool({ name: "export_article", arguments: input });
    expect(response.isError).not.toBe(true);
    const { files } = z.object({ files: z.array(z.string()) }).parse(response.structuredContent);
    const canonicalRoot = await realpath(root);
    expect(files.every((path) => path.startsWith(`${canonicalRoot}/`))).toBe(true);
    const bytes = await readFile(files.find((path) => path.endsWith(".zip"))!);
    const article = importArticleBundle(new Uint8Array(bytes));
    expect(article.markdown).toBe(input.markdown);
    expect(renderArticle(article).html).toBe(renderArticle(input).html);
  });
});
