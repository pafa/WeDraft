#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { access, chmod, copyFile, lstat, mkdir, readFile, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';

const OWNER = 'wedraft-one-step-v1';
const MARKER = '.wedraft-install.json';
const START = '# >>> WeDraft managed MCP >>>';
const END = '# <<< WeDraft managed MCP <<<';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;
const tomlQuote = value => JSON.stringify(value).replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
const exists = async path => { try { await access(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };

function baseAddress(value) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) throw new Error('Use HTTPS or loopback HTTP without credentials, query or fragment.');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}
async function fetchBytes(url, limit = 20 * 1024 * 1024) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  if (Number(response.headers.get('content-length')) > limit) throw new Error('Installation download is too large.');
  const chunks = []; let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > limit) throw new Error('Installation download exceeded its size limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function regularFile(path) {
  try { const stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Refusing to replace a non-regular file: ${path}`); return stat; }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function inspectOwnedDirectory(directory, checkFiles = true) {
  try {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Refusing an existing non-directory or symlink: ${directory}`);
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (!(await readdir(directory)).length) return null;
  await regularFile(join(directory, MARKER));
  let previous;
  try { previous = JSON.parse(await readFile(join(directory, MARKER), 'utf8')); }
  catch { throw new Error(`Existing files are not owned by this installer: ${directory}`); }
  if (previous.owner !== OWNER || !previous.files || typeof previous.files !== 'object' || Array.isArray(previous.files)) throw new Error(`Unrecognized installation: ${directory}`);
  for (const [name, checksum] of Object.entries(previous.files)) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(name) || name === MARKER || !/^[a-f0-9]{64}$/.test(checksum)) throw new Error('Invalid local installation record.');
    if (!checkFiles) continue;
    await regularFile(join(directory, name));
    if (sha256(await readFile(join(directory, name))) !== checksum) throw new Error(`Locally edited WeDraft file preserved: ${join(directory, name)}`);
  }
  return previous;
}
function installationPaths(options = {}, previous = null) {
  const home = homedir();
  const paths = {
    installDir: resolve(options.installDir ?? join(home, '.local/share/wedraft')),
    skillDir: resolve(options.skillDir ?? previous?.paths?.skillDir ?? join(home, '.agents/skills/format-with-wedraft')),
    configFile: resolve(options.configFile ?? previous?.paths?.configFile ?? join(home, '.codex/config.toml')),
    outputDir: resolve(options.outputDir ?? previous?.paths?.outputDir ?? join(home, 'Documents/WeDraft Exports')),
  };
  if (new Set(Object.values(paths)).size !== 4) throw new Error('Installation, Skill, configuration and output paths must be distinct.');
  return paths;
}
function releaseMetadata(manifest) {
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version) ||
    (manifest.sourceCommit != null && !/^[a-f0-9]{40}$/.test(manifest.sourceCommit)) ||
    (manifest.sourceDirty != null && typeof manifest.sourceDirty !== 'boolean')) throw new Error('Invalid installation version metadata.');
  return { version: manifest.version, sourceCommit: manifest.sourceCommit ?? null, sourceDirty: manifest.sourceDirty ?? null };
}

// Restore only the exact files this transaction changed; never delete a directory tree.
async function replaceFiles(changes) {
  const before = await Promise.all(changes.map(async ({ path }) => {
    const stat = await regularFile(path);
    return stat ? { bytes: await readFile(path), mode: stat.mode & 0o777 } : null;
  }));
  let applied = 0;
  try {
    for (const change of changes) {
      if (change.bytes === null) await rm(change.path);
      else await writeAtomic(change.path, change.bytes, change.mode);
      applied += 1;
    }
  } catch (error) {
    const failures = [];
    for (let index = applied - 1; index >= 0; index -= 1) {
      try {
        if (before[index]) await writeAtomic(changes[index].path, before[index].bytes, before[index].mode);
        else await rm(changes[index].path, { force: true });
      } catch { failures.push(changes[index].path); }
    }
    if (failures.length) throw new Error(`Operation failed; could not restore these files: ${failures.join(', ')}. Original error: ${error.message}`);
    throw error;
  }
}
async function writeAtomic(path, bytes, mode = 0o644) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temp, bytes, { flag: 'wx', mode }); await rename(temp, path); }
  finally { await rm(temp, { force: true }); }
}
function tomlKeyPath(source) {
  const parts = []; let remaining = source.trim();
  while (remaining) {
    const match = /^(?:[A-Za-z0-9_-]+|"(?:[^"\\]|\\.)*"|'[^']*')/.exec(remaining);
    if (!match) return null;
    const token = match[0];
    try {
      // TOML also accepts eight-digit Unicode escapes; JSON only accepts four.
      // Match escaped backslashes first so literal \\U text stays literal.
      const quoted = token.replace(/\\\\|\\U([0-9a-fA-F]{8})/g, (escape, hex) =>
        hex ? JSON.stringify(String.fromCodePoint(parseInt(hex, 16))).slice(1, -1) : escape);
      parts.push(token.startsWith('"') ? JSON.parse(quoted) : token.startsWith("'") ? token.slice(1, -1) : token);
    }
    catch { return null; }
    remaining = remaining.slice(token.length).trimStart();
    if (!remaining) return parts;
    if (!remaining.startsWith('.')) return null;
    remaining = remaining.slice(1).trimStart();
    if (!remaining) return null;
  }
  return parts;
}
function hasExistingMcpConfiguration(original) {
  let section = [];
  for (const line of original.split(/\r?\n/)) {
    const header = /^\s*\[\[?(.*?)\]\]?\s*(?:#.*)?$/.exec(line);
    if (header) {
      section = tomlKeyPath(header[1]);
      if (section?.[0] === 'mcp_servers' && section[1] === 'wedraft') return true;
      continue;
    }
    const assignment = /^\s*([^#].*?)\s*=/.exec(line);
    if (!assignment || !section) continue;
    const key = tomlKeyPath(assignment[1]);
    if (!key) continue;
    const path = [...section, ...key];
    // Inline mcp_servers tables cannot safely be extended by appending a subtable.
    if (path[0] === 'mcp_servers' && (path.length === 1 || path[1] === 'wedraft')) return true;
  }
  return false;
}
function configureMcp(original, block, previous) {
  const start = original.indexOf(START); const end = original.indexOf(END);
  if (start !== -1 || end !== -1) {
    if (start < 0 || end < start || original.indexOf(START, start + START.length) !== -1 || original.indexOf(END, end + END.length) !== -1) throw new Error('Conflicting WeDraft configuration markers; existing configuration preserved.');
    const current = original.slice(start, end + END.length);
    if (!previous?.configBlock || current !== previous.configBlock) throw new Error('Existing WeDraft MCP configuration was not created here, or was edited; preserved.');
    return original.slice(0, start) + block + original.slice(end + END.length);
  }
  // Be conservative with alternate TOML spellings and inline tables; never add a duplicate server.
  if (hasExistingMcpConfiguration(original)) throw new Error('An existing WeDraft or inline MCP configuration needs manual integration; no configuration was changed.');
  return `${original}${original && !original.endsWith('\n') ? '\n' : ''}${original ? '\n' : ''}${block}\n`;
}

export async function install(options) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('Node 22.12 or newer is required. Use install.sh to prepare it automatically.');
  const base = baseAddress(options.baseUrl);
  const paths = installationPaths(options);
  const { installDir, skillDir, configFile, outputDir } = paths;
  const lock = `${configFile}.wedraft-lock`;
  await mkdir(dirname(configFile), { recursive: true });
  try { await mkdir(lock, { mode: 0o700 }); }
  catch (error) { if (error.code === 'EEXIST') throw new Error(`Another installation is active, or a stopped installation left its lock: ${lock}`); throw error; }
  try {
  const [previous, previousSkill, configStat] = await Promise.all([inspectOwnedDirectory(installDir), inspectOwnedDirectory(skillDir), regularFile(configFile)]);
  if (previous?.paths && Object.keys(paths).some(key => previous.paths[key] !== paths[key])) throw new Error('Installation paths changed; use the original paths. Existing installation preserved.');
  if (previousSkill && (!previous || (previousSkill.paths && previousSkill.paths.installDir !== installDir))) throw new Error('This Skill belongs to another installation; existing files preserved.');
  const originalConfig = configStat ? await readFile(configFile, 'utf8') : '';
  const manifest = JSON.parse(await fetchBytes(new URL('manifest.json', base), 64 * 1024));
  const names = ['cli.mjs', 'server.mjs', 'SKILL.md', 'sample.md', 'THIRD-PARTY-NOTICES.txt', 'LICENSE', 'installer.mjs'];
  if (manifest.schemaVersion !== 1 || manifest.product !== 'wedraft' || !manifest.files) throw new Error('Unsupported WeDraft installation manifest.');
  if (manifest.managementVersion !== 1) throw new Error('This download source does not provide compatible installation management yet; existing installation preserved.');
  const release = releaseMetadata(manifest);
  const payload = Object.fromEntries(await Promise.all(names.map(async name => {
    const record = manifest.files[name];
    if (!record || !/^[a-f0-9]{64}$/.test(record.sha256) || !Number.isInteger(record.size) || record.size < 1 || record.size > 20 * 1024 * 1024) throw new Error(`Invalid manifest entry: ${name}`);
    const bytes = await fetchBytes(new URL(name, base), record.size);
    if (bytes.length !== record.size || sha256(bytes) !== record.sha256) throw new Error(`Integrity check failed: ${name}`);
    return [name, bytes];
  })));
  const nodePath = options.copyRuntime || previous?.files.node ? join(installDir, 'node') : process.execPath;
  const cliPath = join(installDir, 'cli.mjs'); const mcpPath = join(installDir, 'server.mjs');
  const command = `${shellQuote(nodePath)} ${shellQuote(cliPath)}`;
  const mcp = { command: nodePath, args: [mcpPath, '--output-dir', outputDir] };
  const block = `${START}\n[mcp_servers.wedraft]\ncommand = ${tomlQuote(nodePath)}\nargs = [${mcp.args.map(tomlQuote).join(', ')}]\n${END}`;
  const newConfig = configureMcp(originalConfig, block, previous);
  const skillText = payload['SKILL.md'].toString('utf8').replaceAll('{{WEDRAFT_CLI}}', command).replaceAll('{{WEDRAFT_SAMPLE}}', shellQuote(join(installDir, 'sample.md')));
  const toolFiles = { 'cli.mjs': payload['cli.mjs'], 'server.mjs': payload['server.mjs'], 'sample.md': payload['sample.md'], 'mcp-client.json': Buffer.from(JSON.stringify({ mcpServers: { wedraft: mcp } }, null, 2) + '\n') };
  toolFiles['THIRD-PARTY-NOTICES.txt'] = payload['THIRD-PARTY-NOTICES.txt'];
  toolFiles.LICENSE = payload.LICENSE;
  toolFiles['installer.mjs'] = payload['installer.mjs'];
  toolFiles['manage.sh'] = Buffer.from(`#!/bin/sh\nexec ${shellQuote(nodePath)} ${shellQuote(join(installDir, 'installer.mjs'))} "$@" --install-dir ${shellQuote(installDir)}\n`);
  if (options.copyRuntime) {
    if (!options.runtimeLicense || !(await regularFile(options.runtimeLicense))) throw new Error('Copying the private Node runtime requires its official LICENSE file (--runtime-license).');
    const license = await readFile(options.runtimeLicense);
    if (!license.length) throw new Error('The Node runtime LICENSE file is empty.');
    toolFiles.node = await readFile(process.execPath);
    toolFiles['NODE-LICENSE.txt'] = license;
  }
  // A previous private runtime stays owned, even when a later invocation finds another Node.
  else if (previous?.files.node) {
    toolFiles.node = await readFile(join(installDir, 'node'));
    if (previous.files['NODE-LICENSE.txt']) toolFiles['NODE-LICENSE.txt'] = await readFile(join(installDir, 'NODE-LICENSE.txt'));
  }
  const skillFiles = { 'SKILL.md': Buffer.from(skillText) };
  for (const [directory, files, owned] of [[installDir, toolFiles, previous], [skillDir, skillFiles, previousSkill]]) {
    for (const name of Object.keys(files)) if (await exists(join(directory, name)) && !owned?.files[name]) throw new Error(`Unmanaged existing file preserved: ${join(directory, name)}`);
  }
  // Check executables before touching the user's configuration or an existing installation.
  await mkdir(dirname(installDir), { recursive: true });
  const stage = join(dirname(installDir), `.wedraft-stage-${randomUUID()}`);
  await mkdir(stage, { mode: 0o700 });
  try {
    await Promise.all(names.slice(0, 2).map(name => writeFile(join(stage, name), payload[name])));
    execFileSync(process.execPath, [join(stage, 'cli.mjs'), 'templates'], { encoding: 'utf8', timeout: 30_000 });
    execFileSync(process.execPath, [join(stage, 'server.mjs'), '--help'], { stdio: 'pipe', timeout: 30_000 });
    const outputStat = await lstat(outputDir).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (outputStat && (!outputStat.isDirectory() || outputStat.isSymbolicLink())) throw new Error(`Output must be a directory: ${outputDir}`);
    // Recheck the shared configuration just before writing to avoid replacing concurrent edits.
    if ((await exists(configFile) ? await readFile(configFile, 'utf8') : '') !== originalConfig) throw new Error('Codex configuration changed during installation; please retry.');
    // Downloads can take time. Do not overwrite edits made while they were in flight.
    for (const [directory, files] of [[installDir, toolFiles], [skillDir, skillFiles]]) {
      const owned = await inspectOwnedDirectory(directory);
      for (const name of Object.keys(files)) if (await exists(join(directory, name)) && !owned?.files[name]) throw new Error(`Unmanaged existing file preserved: ${join(directory, name)}`);
    }
    const changes = [];
    for (const [directory, files] of [[installDir, toolFiles], [skillDir, skillFiles]]) {
      await mkdir(directory, { recursive: true });
      for (const [name, bytes] of Object.entries(files)) changes.push({ path: join(directory, name), bytes, mode: name === 'node' || name === 'manage.sh' ? 0o755 : 0o644 });
      const record = { owner: OWNER, source: base.href, release, paths, files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, sha256(bytes)])), ...(directory === installDir ? { configBlock: block } : {}) };
      changes.push({ path: join(directory, MARKER), bytes: JSON.stringify(record, null, 2) + '\n' });
    }
    await mkdir(outputDir, { recursive: true });
    let backup = null;
    if (newConfig !== originalConfig) {
      if (configStat) { backup = `${configFile}.wedraft-backup-${Date.now()}-${randomUUID().slice(0, 8)}`; await copyFile(configFile, backup); await chmod(backup, configStat.mode & 0o777); }
      changes.push({ path: configFile, bytes: newConfig, mode: configStat ? configStat.mode & 0o777 : 0o600 });
    }
    await replaceFiles(changes);
    return { installed: true, release, cliCommand: command, manageCommand: `sh ${shellQuote(join(installDir, 'manage.sh'))}`, mcp, ...paths, configBackup: backup };
  } finally { await rm(stage, { recursive: true, force: true }); }
  } finally { await rm(lock, { recursive: true, force: true }); }
}

async function installedRecord(options) {
  const installDir = installationPaths(options).installDir;
  const record = await inspectOwnedDirectory(installDir, false);
  return { installDir, record };
}
function managedPaths(options, record, installDir) {
  if (!record.paths || record.paths.installDir !== installDir ||
    !['installDir', 'skillDir', 'configFile', 'outputDir'].every(key => typeof record.paths[key] === 'string' && resolve(record.paths[key]) === record.paths[key])) {
    throw new Error('Legacy installation has no recorded paths. Rerun the original install command with its original paths before upgrading or uninstalling.');
  }
  const paths = installationPaths({ ...record.paths, ...options, installDir });
  if (Object.keys(paths).some(key => paths[key] !== record.paths[key])) throw new Error('Management paths differ from the installation record; existing files preserved.');
  return paths;
}
function removeMcp(original, previous) {
  if (!original.includes(START) && !original.includes(END)) {
    if (hasExistingMcpConfiguration(original)) throw new Error('WeDraft MCP configuration was edited; preserved.');
    return original;
  }
  const result = configureMcp(original, '', previous);
  const suffix = original.slice(original.indexOf(END) + END.length);
  const next = suffix.split(/\r?\n/).find(line => line.trim() && !line.trimStart().startsWith('#'));
  // Otherwise removing the managed table would silently re-parent added TOML keys.
  if (next && !next.trimStart().startsWith('[')) throw new Error('Settings were added after the managed WeDraft block; existing configuration preserved.');
  return result;
}

export async function status(options = {}) {
  const { installDir, record } = await installedRecord(options);
  if (!record) return { installed: false, installDir };
  const result = { installed: true, installDir, source: record.source, release: record.release ?? null, legacy: !record.paths, issues: [] };
  if (!record.paths) return result;
  const paths = managedPaths(options, record, installDir);
  result.paths = paths;
  for (const directory of [paths.installDir, paths.skillDir]) {
    try {
      const owned = await inspectOwnedDirectory(directory);
      if (!owned || owned.paths?.installDir !== installDir) result.issues.push(`Missing or unrelated installation record: ${directory}`);
    } catch (error) { result.issues.push(error.message); }
  }
  try {
    const stat = await regularFile(paths.configFile);
    const config = stat ? await readFile(paths.configFile, 'utf8') : '';
    if (!config.includes(START)) result.issues.push('Managed Codex MCP configuration is missing.');
    else removeMcp(config, record);
  } catch (error) { result.issues.push(error.message); }
  return result;
}

export async function upgrade(options = {}) {
  const { installDir, record } = await installedRecord(options);
  if (!record) throw new Error('WeDraft is not installed. Run the installation command first.');
  const paths = managedPaths(options, record, installDir);
  return install({ ...paths, baseUrl: options.baseUrl ?? record.source });
}

export async function uninstall(options = {}) {
  const { installDir, record } = await installedRecord(options);
  if (!record) return { uninstalled: false, installDir, reason: 'not-installed' };
  const paths = managedPaths(options, record, installDir);
  const lock = `${paths.configFile}.wedraft-lock`;
  await mkdir(dirname(paths.configFile), { recursive: true });
  try { await mkdir(lock, { mode: 0o700 }); }
  catch (error) { if (error.code === 'EEXIST') throw new Error(`Another installation is active, or a stopped installation left its lock: ${lock}`); throw error; }
  try {
    const tools = await inspectOwnedDirectory(paths.installDir);
    const skill = await inspectOwnedDirectory(paths.skillDir);
    if (!tools || !skill || tools.paths?.installDir !== installDir || skill.paths?.installDir !== installDir) throw new Error('Missing or unrelated ownership records; no files were removed.');
    const configStat = await regularFile(paths.configFile);
    const originalConfig = configStat ? await readFile(paths.configFile, 'utf8') : '';
    const newConfig = removeMcp(originalConfig, tools);
    const changes = [];
    let backup = null;
    if (newConfig !== originalConfig) {
      backup = `${paths.configFile}.wedraft-backup-${Date.now()}-${randomUUID().slice(0, 8)}`;
      await copyFile(paths.configFile, backup); await chmod(backup, configStat.mode & 0o777);
      changes.push({ path: paths.configFile, bytes: newConfig, mode: configStat.mode & 0o777 });
    }
    for (const [directory, owned] of [[paths.skillDir, skill], [paths.installDir, tools]]) {
      for (const name of [...Object.keys(owned.files), MARKER]) changes.push({ path: join(directory, name), bytes: null });
    }
    if ((await exists(paths.configFile) ? await readFile(paths.configFile, 'utf8') : '') !== originalConfig) throw new Error('Codex configuration changed; no files were removed.');
    await replaceFiles(changes);
    const retainedDirectories = [];
    for (const directory of [paths.skillDir, paths.installDir]) {
      try { await rmdir(directory); }
      catch (error) { if (error.code === 'ENOTEMPTY' || error.code === 'EEXIST') retainedDirectories.push(directory); else throw error; }
    }
    return { uninstalled: true, outputDir: paths.outputDir, exportsPreserved: true, retainedDirectories, configBackup: backup };
  } finally { await rm(lock, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: Object.fromEntries(['base-url', 'install-dir', 'skill-dir', 'config-file', 'output-dir', 'runtime-license'].map(name => [name, { type: 'string' }]).concat([['copy-runtime', { type: 'boolean' }], ['help', { type: 'boolean' }]])) });
    const action = positionals[0] ?? 'install';
    if (values.help) {
      process.stdout.write('WeDraft installation management\ninstall --base-url URL [--install-dir PATH --skill-dir PATH --config-file PATH --output-dir PATH]\nstatus | upgrade | uninstall [--install-dir PATH]\nstatus is offline/read-only. Upgrade uses the recorded source; --base-url explicitly changes it.\nUninstall preserves article exports and unrelated or locally modified files; conflicts stop the operation.\n');
    } else {
      if (positionals.length > 1 || !['install', 'status', 'upgrade', 'uninstall'].includes(action)) throw new Error('Expected install, status, upgrade or uninstall.');
      if (action === 'install' && !values['base-url']) throw new Error('--base-url is required.');
      const options = Object.fromEntries(Object.entries({ baseUrl: values['base-url'], installDir: values['install-dir'], skillDir: values['skill-dir'], configFile: values['config-file'], outputDir: values['output-dir'], copyRuntime: values['copy-runtime'], runtimeLicense: values['runtime-license'] }).filter(([, value]) => value !== undefined));
      const result = await ({ install, status, upgrade, uninstall }[action])(options);
      if (action === 'status' || action === 'uninstall') process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      else process.stdout.write(`\nWeDraft is ready. Skill installed and Codex MCP configured.\nVersion: ${result.release.version}; source commit: ${result.release.sourceCommit ?? 'unknown'}${result.release.sourceDirty ? ' (working tree modified)' : ''}\nUse immediately: ${result.cliCommand} templates\nManage (choose one action):\n  ${result.manageCommand} status\n  ${result.manageCommand} upgrade\n  ${result.manageCommand} uninstall\nMCP command/args: ${join(result.installDir, 'mcp-client.json')}\nArticle exports: ${result.outputDir}\n${result.configBackup ? `Previous configuration backed up: ${result.configBackup}\n` : ''}If this conversation has not refreshed its tools, use the CLI now or reload the conversation.\n`);
    }
  } catch (error) { process.stderr.write(`WeDraft setup stopped: ${error.message}\n`); process.exitCode = 1; }
}
