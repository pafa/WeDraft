import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareHosting } from './web-release-hosting.mjs';

// This creates a local, inspectable candidate. It never changes GitHub or DNS.
const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
const checksum = bytes => createHash('sha256').update(bytes).digest('hex');
if (git('status', '--porcelain')) throw new Error('Commit and review the candidate first; the source tree must be clean.');
const commit = git('rev-parse', 'HEAD');
const branch = git('branch', '--show-current');
const config = JSON.parse(await readFile(join(root, 'deployment/web.json'), 'utf8'));
const { version } = JSON.parse(await readFile(join(root, 'apps/web/package.json'), 'utf8'));
const directory = resolve(process.argv[2] ?? join(root, 'artifacts/web-release', `${version}-${commit.slice(0, 12)}`));
await mkdir(dirname(directory), { recursive: true });
await mkdir(directory, { recursive: false }); // Refuse to replace a previously reviewed candidate.
const record = { version, commit, branch, ...config, builtAt: new Date().toISOString(), publicationApproved: false };
await writeFile(join(directory, 'candidate.json'), JSON.stringify({ ...record, status: 'preparing' }, null, 2) + '\n');
try {
  execFileSync('pnpm', ['build:web'], { cwd: root, stdio: 'inherit' });
  if (git('rev-parse', 'HEAD') !== commit || git('status', '--porcelain')) throw new Error('Source changed during preparation; discard this incomplete candidate.');
  await cp(join(root, 'apps/web/dist'), join(directory, 'site'), { recursive: true, errorOnExist: true });
  const required = ['index.html', 'connect.md', 'LICENSE', 'THIRD-PARTY-NOTICES.txt', 'dependencies.json', 'integrations/install.sh', 'integrations/installer.mjs', 'integrations/installer.sha256', 'integrations/manifest.json', 'integrations/cli.mjs', 'integrations/server.mjs', 'integrations/SKILL.md', 'integrations/THIRD-PARTY-NOTICES.txt', 'integrations/LICENSE'];
  for (const name of required) if (!(await lstat(join(directory, 'site', name))).isFile()) throw new Error(`Missing release file: ${name}`);
  const manifest = JSON.parse(await readFile(join(directory, 'site/integrations/manifest.json'), 'utf8'));
  if (manifest.version !== version) throw new Error('Installer and website versions differ.');
  for (const [name, entry] of Object.entries(manifest.files)) {
    if (!/^[\w.-]+$/.test(name)) throw new Error('Invalid installer asset path.');
    const bytes = await readFile(join(directory, 'site/integrations', name));
    if (bytes.length !== entry.size || checksum(bytes) !== entry.sha256) throw new Error(`Installer asset checksum mismatch: ${name}`);
  }
  const installerChecksum = (await readFile(join(directory, 'site/integrations/installer.sha256'), 'utf8')).split(/\s+/)[0];
  if (installerChecksum !== manifest.files['installer.mjs'].sha256) throw new Error('Bootstrap installer checksum mismatch.');
  await writeFile(join(directory, 'site/release.json'), JSON.stringify({ version, commit, site: config.site, repository: config.repository }, null, 2) + '\n');
  await prepareHosting(directory, config.site);
  const inventory = [];
  async function walk(relative) {
    for (const entry of (await readdir(join(directory, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`Release contains a symbolic link: ${name}`);
      if (entry.isDirectory()) await walk(name);
      else { const bytes = await readFile(join(directory, name)); inventory.push({ path: name, size: bytes.length, sha256: checksum(bytes) }); }
    }
  }
  await walk('site');
  await walk('deploy-site');
  const hostingBytes = await readFile(join(directory, 'wrangler.jsonc'));
  inventory.push({ path: 'wrangler.jsonc', size: hostingBytes.length, sha256: checksum(hostingBytes) });
  await writeFile(join(directory, 'site-files.json'), JSON.stringify(inventory.filter(file => file.path.startsWith('site/')), null, 2) + '\n');
  await writeFile(join(directory, 'deploy-files.json'), JSON.stringify(inventory.filter(file => !file.path.startsWith('site/')), null, 2) + '\n');
  const sourceFiles = git('ls-tree', '-r', '--name-only', commit).split('\n');
  await writeFile(join(directory, 'source-files.json'), JSON.stringify(sourceFiles, null, 2) + '\n');
  execFileSync('git', ['archive', '--format=tar.gz', `--output=${join(directory, 'source.tar.gz')}`, commit], { cwd: root });
  execFileSync('tar', ['-czf', join(directory, 'site.tar.gz'), '-C', directory, 'site']);
  execFileSync('tar', ['-czf', join(directory, 'deploy.tar.gz'), '-C', directory, 'deploy-site', 'wrangler.jsonc']);
  for (const name of ['source.tar.gz', 'site.tar.gz', 'deploy.tar.gz']) { const bytes = await readFile(join(directory, name)); inventory.push({ path: name, size: bytes.length, sha256: checksum(bytes) }); }
  await writeFile(join(directory, 'SHA256SUMS'), inventory.map(file => `${file.sha256}  ${file.path}`).join('\n') + '\n');
  await writeFile(join(directory, 'candidate.json'), JSON.stringify({ ...record, status: 'prepared-for-review', files: inventory.length, sourceFiles: sourceFiles.length, pending: ['Physical-device WeChat acceptance', 'Final candidate approval', 'Hosting and HTTPS deployment approval'] }, null, 2) + '\n');
  console.log(`Local release candidate prepared: ${directory}\nNothing was published. Review the candidate and hosting configuration before deployment.`);
} catch (error) {
  await writeFile(join(directory, 'candidate.json'), JSON.stringify({ ...record, status: 'failed', error: error.message }, null, 2) + '\n');
  throw error;
}
