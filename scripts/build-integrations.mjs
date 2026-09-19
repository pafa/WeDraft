import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildTool } from './build-tools.mjs';

export const integrationDirectory = fileURLToPath(new URL('../artifacts/integrations/', import.meta.url));
const root = fileURLToPath(new URL('../', import.meta.url));
export const integrationAssets = ['cli.mjs', 'server.mjs', 'SKILL.md', 'install.sh', 'installer.mjs', 'installer.sha256', 'manifest.json', 'sample.md'];
export async function buildIntegrations() {
  await mkdir(integrationDirectory, { recursive: true });
  await Promise.all([buildTool('cli', join(integrationDirectory, 'cli.mjs')), buildTool('mcp', join(integrationDirectory, 'server.mjs'))]);
  await Promise.all([
    copyFile(join(root, 'skills/format-with-wedraft/SKILL.md'), join(integrationDirectory, 'SKILL.md')),
    ...['install.sh', 'installer.mjs', 'connect.md', 'sample.md'].map(name => copyFile(join(root, 'integrations', name), join(integrationDirectory, name))),
  ]);
  const files = Object.fromEntries(await Promise.all(['cli.mjs', 'server.mjs', 'SKILL.md', 'installer.mjs', 'sample.md'].map(async name => {
    const bytes = await readFile(join(integrationDirectory, name));
    return [name, { sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length }];
  })));
  await writeFile(join(integrationDirectory, 'installer.sha256'), `${files['installer.mjs'].sha256}  installer.mjs\n`);
  await writeFile(join(integrationDirectory, 'manifest.json'), JSON.stringify({ schemaVersion: 1, product: 'wedraft', files }, null, 2) + '\n');
  return integrationDirectory;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await buildIntegrations();
