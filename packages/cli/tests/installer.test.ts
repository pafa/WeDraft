import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { execFileSync, execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, mkdir, readdir, rm, realpath, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { importArticleBundle } from "@wedraft/core";
// @ts-expect-error The installation program is also an executable ES module.
import { install, status, upgrade, uninstall } from "../../../integrations/installer.mjs";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, writeFile: vi.fn(actual.writeFile) };
});

const root = fileURLToPath(new URL("../../../", import.meta.url));
const run = promisify(execFile);
let workspace: string;
let baseUrl: string;
let corrupt = false;
let requests = 0;
const overrides = new Map<string, Buffer>();
const server = createServer(async (request, response) => {
  try {
    requests += 1;
    const name = request.url?.slice(1) ?? "";
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) { response.writeHead(404).end(); return; }
    let bytes = overrides.get(name) ?? await readFile(join(root, "artifacts/integrations", name));
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
    const original = '# Existing preferences\nmodel = "test-model"\n\n[mcp_servers.existing]\ncommand = "existing-tool"\n\n[projects."/Users/demo/wedraft"]\ntrust_level = "trusted"\n';
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
    for (const foreign of [
      '[mcp_servers."wedraft"]\ncommand = "my-own-tool"\n',
      '["mcp_servers"."wedr\\u0061ft"]\ncommand = "my-own-tool"\n',
      '["mcp_servers"."wedr\\U00000061ft"]\ncommand = "my-own-tool"\n',
      '[mcp_servers]\nwedraft = { command = "my-own-tool" }\n',
      'mcp_servers.wedraft.command = "my-own-tool"\n',
      'mcp_servers = { example = { command = "another-tool" } }\n',
    ]) {
      await writeFile(options.configFile, foreign);
      await expect(install(options)).rejects.toThrow("configuration");
      expect(await readFile(options.configFile, "utf8")).toBe(foreign);
    }
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

describe("installation lifecycle", () => {
  it("records the exact build identity and offers offline status from the installed manager", async () => {
    const options = await paths("status");
    const result = await install(options);
    const manifest = JSON.parse(await readFile(join(root, "artifacts/integrations/manifest.json"), "utf8"));
    const config = await readFile(options.configFile, "utf8");
    const requestCount = requests;
    const response = await run("sh", [join(options.installDir, "manage.sh"), "status"], { cwd: workspace });
    const current = JSON.parse(response.stdout);
    expect(current.installed).toBe(true);
    expect(current.release).toEqual({ version: manifest.version, sourceCommit: manifest.sourceCommit, sourceDirty: manifest.sourceDirty });
    expect(current.release.sourceCommit).toMatch(/^[a-f0-9]{40}$/);
    expect(current.paths).toEqual({ installDir: options.installDir, skillDir: options.skillDir, configFile: options.configFile, outputDir: options.outputDir });
    expect(current.issues).toEqual([]);
    expect(result.manageCommand).toContain("manage.sh");
    expect(requests).toBe(requestCount);
    expect(await readFile(options.configFile, "utf8")).toBe(config);
  });

  it("upgrades from the recorded source and paths while preserving unrelated MCPs and exports", async () => {
    const options = await paths("upgrade");
    await install(options);
    const unrelated = '\n[mcp_servers.other]\ncommand = "keep-me"\n';
    const config = await readFile(options.configFile, "utf8") + unrelated;
    await writeFile(options.configFile, config);
    await writeFile(join(options.outputDir, "my-article.md"), "已有原稿");
    const sample = Buffer.from("更新后的内置样稿\n\n保留内容。\n");
    const manifest = JSON.parse(await readFile(join(root, "artifacts/integrations/manifest.json"), "utf8"));
    manifest.sourceCommit = "b".repeat(40);
    manifest.sourceDirty = false;
    manifest.files["sample.md"] = { sha256: createHash("sha256").update(sample).digest("hex"), size: sample.length };
    overrides.set("sample.md", sample);
    overrides.set("manifest.json", Buffer.from(JSON.stringify(manifest)));
    try {
      await run("sh", [join(options.installDir, "manage.sh"), "upgrade"], { cwd: workspace });
      expect((await status({ installDir: options.installDir })).release.sourceCommit).toBe("b".repeat(40));
      expect(await readFile(join(options.installDir, "sample.md"))).toEqual(sample);
      expect(await readFile(options.configFile, "utf8")).toBe(config);
      expect(await readFile(join(options.outputDir, "my-article.md"), "utf8")).toBe("已有原稿");
    } finally { overrides.clear(); }
  });

  it("uninstalls only owned files, retains extra files and article exports, and backs up configuration", async () => {
    const options = await paths("uninstall");
    const unrelated = '[mcp_servers.other]\ncommand = "keep-me"\n';
    await writeFile(options.configFile, unrelated);
    await install(options);
    const config = await readFile(options.configFile, "utf8");
    await writeFile(join(options.outputDir, "article.wedraft.zip"), "export fixture");
    await writeFile(join(options.installDir, "personal.txt"), "keep tool note");
    await writeFile(join(options.skillDir, "my-rules.md"), "keep added rules");
    const response = await run("sh", [join(options.installDir, "manage.sh"), "uninstall"], { cwd: workspace });
    const result = JSON.parse(response.stdout);
    expect(result.uninstalled).toBe(true);
    expect(result.exportsPreserved).toBe(true);
    expect(result.retainedDirectories.sort()).toEqual([options.installDir, options.skillDir].sort());
    expect(await readFile(result.configBackup, "utf8")).toBe(config);
    expect((await readFile(options.configFile, "utf8")).trim()).toBe(unrelated.trim());
    expect(await readdir(options.installDir)).toEqual(["personal.txt"]);
    expect(await readdir(options.skillDir)).toEqual(["my-rules.md"]);
    expect(await readFile(join(options.outputDir, "article.wedraft.zip"), "utf8")).toBe("export fixture");
  });

  it.each(["tools", "skill", "config"])("preserves all files when %s has local edits", async (edited) => {
    const options = await paths(`edited-${edited}`);
    await install(options);
    const target = edited === "tools" ? join(options.installDir, "sample.md") : edited === "skill" ? join(options.skillDir, "SKILL.md") : options.configFile;
    const content = await readFile(target, "utf8") + (edited === "config" ? "extra_setting = true\n" : "\nlocal edits\n");
    await writeFile(target, content);
    const config = await readFile(options.configFile, "utf8");
    if (edited !== "config") await expect(upgrade({ installDir: options.installDir })).rejects.toThrow(/Locally edited/);
    await expect(uninstall({ installDir: options.installDir })).rejects.toThrow(/Locally edited|Settings were added/);
    expect((await status({ installDir: options.installDir })).issues.length).toBeGreaterThan(0);
    expect(await readFile(target, "utf8")).toBe(content);
    expect(await readFile(options.configFile, "utf8")).toBe(config);
    expect(await readdir(options.installDir)).toContain("cli.mjs");
    expect(await readdir(options.skillDir)).toContain("SKILL.md");
  });

  it("reports legacy installs without guessing version or custom paths, then upgrades their records on reinstallation", async () => {
    const options = await paths("legacy");
    await install(options);
    for (const directory of [options.installDir, options.skillDir]) {
      const path = join(directory, ".wedraft-install.json");
      const record = JSON.parse(await readFile(path, "utf8"));
      delete record.paths; delete record.release;
      await writeFile(path, JSON.stringify(record));
    }
    expect(await status({ installDir: options.installDir })).toMatchObject({ installed: true, legacy: true, release: null });
    await expect(uninstall({ installDir: options.installDir })).rejects.toThrow("Legacy installation");
    await expect(upgrade({ installDir: options.installDir })).rejects.toThrow("Legacy installation");
    await install(options);
    expect((await status({ installDir: options.installDir })).legacy).toBe(false);
    await uninstall({ installDir: options.installDir });
    expect(await status({ installDir: options.installDir })).toEqual({ installed: false, installDir: options.installDir });
  });

  it("does not redirect management to another configuration or Skill directory", async () => {
    const options = await paths("management-paths");
    await install(options);
    await expect(uninstall({ installDir: options.installDir, configFile: join(workspace, "foreign.toml") })).rejects.toThrow("paths differ");
    await expect(upgrade({ installDir: options.installDir, skillDir: join(workspace, "foreign-skill") })).rejects.toThrow("paths differ");
    expect((await status({ installDir: options.installDir })).issues).toEqual([]);
  });

  it("rolls back tool and Skill writes when the final configuration write fails", async () => {
    const options = await paths("rollback");
    // This basename fits the filesystem limit; the atomic temporary filename does not.
    options.configFile = join(workspace, "rollback", `${"c".repeat(230)}.toml`);
    await expect(install(options)).rejects.toThrow(/ENAMETOOLONG/);
    expect(await readdir(options.installDir)).toEqual([]);
    expect(await readdir(options.skillDir)).toEqual([]);
    expect(await status({ installDir: options.installDir })).toEqual({ installed: false, installDir: options.installDir });
  });

  it("restores an existing installation and its records when an upgrade fails at the final config write", async () => {
    const options = await paths("upgrade-rollback");
    // A different initial runtime makes the upgrade update the MCP command too.
    const initialRuntime = join(workspace, "initial-node");
    await copyFile(process.execPath, initialRuntime);
    await run(initialRuntime, [join(root, "integrations/installer.mjs"), "--base-url", baseUrl, "--install-dir", options.installDir, "--skill-dir", options.skillDir, "--config-file", options.configFile, "--output-dir", options.outputDir]);
    const originalConfig = await readFile(options.configFile);
    expect(originalConfig.toString()).toContain(initialRuntime);
    const originals = new Map<string, Buffer>([[options.configFile, originalConfig]]);
    for (const directory of [options.installDir, options.skillDir]) {
      for (const name of await readdir(directory)) originals.set(join(directory, name), await readFile(join(directory, name)));
    }
    const sample = Buffer.from("New sample that must be rolled back.\n");
    const manifest = JSON.parse(await readFile(join(root, "artifacts/integrations/manifest.json"), "utf8"));
    manifest.sourceCommit = "c".repeat(40);
    manifest.files["sample.md"] = { sha256: createHash("sha256").update(sample).digest("hex"), size: sample.length };
    overrides.set("sample.md", sample);
    overrides.set("manifest.json", Buffer.from(JSON.stringify(manifest)));
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    let failed = false;
    let stagedCommit: string | undefined;
    let stagedSample: Buffer | undefined;
    vi.mocked(writeFile).mockImplementation(async (...args) => {
      if (!failed && String(args[0]).startsWith(`${options.configFile}.`) && String(args[0]).endsWith(".tmp")) {
        failed = true;
        stagedCommit = JSON.parse(await readFile(join(options.installDir, ".wedraft-install.json"), "utf8")).release.sourceCommit;
        stagedSample = await readFile(join(options.installDir, "sample.md"));
        throw Object.assign(new Error("Injected final config write failure"), { code: "EIO" });
      }
      return actual.writeFile(...args);
    });
    try {
      await expect(upgrade({ installDir: options.installDir })).rejects.toThrow("Injected final config write failure");
      expect(stagedCommit).toBe("c".repeat(40));
      expect(stagedSample).toEqual(sample);
      for (const [path, bytes] of originals) expect(await readFile(path), path).toEqual(bytes);
      expect((await status({ installDir: options.installDir })).issues).toEqual([]);
    } finally { vi.mocked(writeFile).mockImplementation(actual.writeFile); overrides.clear(); }
  }, 20_000);

  it("preserves an installation when a target source lacks management support", async () => {
    const options = await paths("old-source");
    await install(options);
    const config = await readFile(options.configFile, "utf8");
    const record = await readFile(join(options.installDir, ".wedraft-install.json"), "utf8");
    const manifest = JSON.parse(await readFile(join(root, "artifacts/integrations/manifest.json"), "utf8"));
    delete manifest.managementVersion;
    overrides.set("manifest.json", Buffer.from(JSON.stringify(manifest)));
    try { await expect(upgrade({ installDir: options.installDir })).rejects.toThrow("compatible installation management"); }
    finally { overrides.clear(); }
    expect(await readFile(options.configFile, "utf8")).toBe(config);
    expect(await readFile(join(options.installDir, ".wedraft-install.json"), "utf8")).toBe(record);
  });
});
