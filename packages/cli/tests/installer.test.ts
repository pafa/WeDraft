import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { execFileSync, execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, mkdir, readdir, rm, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { importArticleBundle } from "@wedraft/core";
// @ts-expect-error The installation program is also an executable ES module.
import { install } from "../../../integrations/installer.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const run = promisify(execFile);
let workspace: string;
let baseUrl: string;
let corrupt = false;
const server = createServer(async (request, response) => {
  try {
    const name = request.url?.slice(1) ?? "";
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) { response.writeHead(404).end(); return; }
    let bytes = await readFile(join(root, "artifacts/integrations", name));
    if (corrupt && name === "cli.mjs") bytes = Buffer.from("tampered");
    response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
beforeAll(async () => {
  execFileSync(process.execPath, [join(root, "scripts/build-integrations.mjs")], { cwd: root });
  workspace = await mkdtemp(join(tmpdir(), "wedraft-install-test-"));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address");
  baseUrl = `http://127.0.0.1:${address.port}/`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(workspace, { recursive: true, force: true }); });
async function paths(name: string) {
  const directory = join(workspace, name); await mkdir(directory);
  return { baseUrl, installDir: join(directory, "tools with ' quotes"), skillDir: join(directory, "skills"), configFile: join(directory, "config.toml"), outputDir: join(directory, "exports") };
}
async function mcpRequest(command: string, args: string[], markdown: string) {
  return new Promise<{ tools: string[]; files: string[] }>((resolve, reject) => {
    const child = spawn(command, args, { cwd: workspace, stdio: ["pipe", "pipe", "pipe"] });
    let buffer = ""; let errors = ""; let toolNames: string[] = [];
    const timeout = setTimeout(() => { child.kill(); reject(new Error(errors || "MCP handshake timed out")); }, 15_000);
    child.on("error", error => { clearTimeout(timeout); reject(error); });
    child.stderr.on("data", value => { errors += String(value); });
    child.stdout.on("data", value => {
      buffer += String(value);
      while (buffer.includes("\n")) {
        const index = buffer.indexOf("\n"); const result = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1);
        if (result.error) { clearTimeout(timeout); child.kill(); reject(new Error(JSON.stringify(result.error))); return; }
        if (result.id === 1) {
          child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
          child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
        }
        if (result.id === 2) {
          toolNames = result.result.tools.map((tool: { name: string }) => tool.name);
          child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "export_article", arguments: { markdown } } }) + "\n");
        }
        if (result.id === 3) {
          clearTimeout(timeout); child.kill();
          if (result.result.isError || result.result.structuredContent.status !== "ready") reject(new Error(JSON.stringify(result.result)));
          else resolve({ tools: toolNames, files: result.result.structuredContent.files });
        }
      }
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "installer-test", version: "1" } } }) + "\n");
  });
}

describe("one-command installation", () => {
  it("installs self-contained tools and Skill, preserves config, and is idempotent", async () => {
    const options = await paths("complete");
    const original = '# Existing preferences\nmodel = "test-model"\n\n[mcp_servers.existing]\ncommand = "existing-tool"\n';
    await writeFile(options.configFile, original);
    const result = await install(options);
    const config = await readFile(options.configFile, "utf8");
    expect(config.startsWith(original)).toBe(true);
    expect(config).toContain("[mcp_servers.wedraft]");
    expect(await readFile(result.configBackup, "utf8")).toBe(original);
    expect(await readFile(join(options.skillDir, "SKILL.md"), "utf8")).not.toContain("{{WEDRAFT_CLI}}");
    const notices = await readFile(join(options.installDir, "THIRD-PARTY-NOTICES.txt"), "utf8");
    expect(notices).toBe(await readFile(join(root, "artifacts/integrations/THIRD-PARTY-NOTICES.txt"), "utf8"));
    expect(await readFile(join(options.installDir, "LICENSE"), "utf8")).toBe(await readFile(join(root, "LICENSE"), "utf8"));
    const installationRecord = JSON.parse(await readFile(join(options.installDir, ".wedraft-install.json"), "utf8"));
    expect(installationRecord.files["THIRD-PARTY-NOTICES.txt"]).toMatch(/^[a-f0-9]{64}$/);
    expect(installationRecord.files.LICENSE).toMatch(/^[a-f0-9]{64}$/);
    const templates = JSON.parse((await run(result.mcp.command, [join(options.installDir, "cli.mjs"), "templates"], { cwd: workspace })).stdout);
    expect(JSON.stringify(templates)).toContain("next-edition");
    const markdown = await readFile(join(options.installDir, "sample.md"), "utf8");
    const exported = await mcpRequest(result.mcp.command, result.mcp.args, markdown);
    expect(exported.tools).toEqual(["list_templates", "validate_article", "render_article", "export_article"]);
    const canonicalOutput = await realpath(options.outputDir);
    expect(exported.files.every(path => path.startsWith(`${canonicalOutput}/`))).toBe(true);
    const zip = exported.files.find(path => path.endsWith("article.wedraft.zip"))!;
    expect(importArticleBundle(new Uint8Array(await readFile(zip))).markdown).toBe(markdown);
    const cliOutput = join(workspace, "cli-export");
    await run(result.mcp.command, [join(options.installDir, "cli.mjs"), "render", "--input", join(options.installDir, "sample.md"), "--out", cliOutput], { cwd: workspace });
    expect(await readFile(exported.files.find(path => path.endsWith("body.html"))!, "utf8")).toBe(await readFile(join(cliOutput, "body.html"), "utf8"));
    const again = await install(options);
    expect(again.configBackup).toBeNull();
    expect(await readFile(options.configFile, "utf8")).toBe(config);
    await writeFile(join(options.installDir, "LICENSE"), "locally edited license");
    await expect(install(options)).rejects.toThrow("Locally edited");
    expect(await readFile(join(options.installDir, "LICENSE"), "utf8")).toBe("locally edited license");
  });
  it("executes the actual shell bootstrap against an isolated destination", async () => {
    const options = await paths("bootstrap");
    const result = await run("sh", [join(root, "integrations/install.sh"), baseUrl, "--install-dir", options.installDir, "--skill-dir", options.skillDir, "--config-file", options.configFile, "--output-dir", options.outputDir], { timeout: 60_000 });
    expect(result.stdout).toContain("WeDraft is ready");
    expect(await readFile(options.configFile, "utf8")).toContain("mcp_servers.wedraft");
  });
  it("can install a private runtime without relying on Node in PATH", async () => {
    const options = await paths("private-runtime");
    const runtimeLicense = join(workspace, "node-license-fixture.txt");
    const license = "Node runtime license fixture for unit-test propagation only.\n";
    await writeFile(runtimeLicense, license);
    await expect(install({ ...options, copyRuntime: true })).rejects.toThrow("official LICENSE");
    const result = await install({ ...options, copyRuntime: true, runtimeLicense });
    expect(await readFile(join(options.installDir, "NODE-LICENSE.txt"), "utf8")).toBe(license);
    const record = JSON.parse(await readFile(join(options.installDir, ".wedraft-install.json"), "utf8"));
    expect(record.files["NODE-LICENSE.txt"]).toMatch(/^[a-f0-9]{64}$/);
    expect(result.mcp.command).toBe(join(options.installDir, "node"));
    expect((await mcpRequest(result.mcp.command, result.mcp.args, "私有运行时\n\n完整保留原文。")).tools).toContain("export_article");
    await install({ ...options, copyRuntime: true, runtimeLicense });
    expect(await readFile(join(options.installDir, "NODE-LICENSE.txt"), "utf8")).toBe(license);
    await writeFile(join(options.installDir, "NODE-LICENSE.txt"), "local edits");
    await expect(install({ ...options, copyRuntime: true, runtimeLicense })).rejects.toThrow("Locally edited");
  }, 20_000);
  it("refuses foreign configs, foreign Skill files and local edits", async () => {
    const options = await paths("conflicts");
    const foreign = '[mcp_servers."wedraft"]\ncommand = "my-own-tool"\n';
    await writeFile(options.configFile, foreign);
    await expect(install(options)).rejects.toThrow("configuration");
    expect(await readFile(options.configFile, "utf8")).toBe(foreign);
    await writeFile(options.configFile, "");
    await mkdir(options.skillDir); await writeFile(join(options.skillDir, "SKILL.md"), "private skill");
    await expect(install(options)).rejects.toThrow("not owned");
    await rm(options.skillDir, { recursive: true });
    await install(options);
    await writeFile(join(options.installDir, "cli.mjs"), "locally edited");
    await expect(install(options)).rejects.toThrow("Locally edited");
    expect(await readFile(join(options.installDir, "cli.mjs"), "utf8")).toBe("locally edited");
  });
  it("rejects tampered downloads before changing configuration", async () => {
    const options = await paths("integrity"); await writeFile(options.configFile, 'model = "unchanged"\n');
    corrupt = true;
    try { await expect(install(options)).rejects.toThrow("Integrity check failed"); }
    finally { corrupt = false; }
    expect(await readFile(options.configFile, "utf8")).toBe('model = "unchanged"\n');
    expect(await readdir(join(workspace, "integrity"))).toEqual(["config.toml"]);
    await expect(install({ ...options, baseUrl: "http://example.com/integrations/" })).rejects.toThrow("HTTPS");
  });
});
