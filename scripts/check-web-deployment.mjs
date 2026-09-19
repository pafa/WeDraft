import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function checkDeployment(directory, origin, fetcher = fetch, timeoutMs = 180000) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 900000) throw new Error("Timeout must be 1000–900000 milliseconds.");
  const base = new URL(origin);
  if (!['https:', 'http:'].includes(base.protocol) || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('Expected a site origin.');
  if (base.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('Public deployment checks require HTTPS.');
  const inventory = JSON.parse(await readFile(join(directory, 'site-files.json'), 'utf8'));
  const candidate = JSON.parse(await readFile(join(directory, 'site/release.json'), 'utf8'));
  const rows = [];
  async function request(path, file, status = 200) {
    const response = await fetcher(new URL(path, base), { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: path === '/' || path.endsWith('.html') ? 'text/html' : '*/*' } });
    if (new URL(response.url || base).origin !== base.origin) throw new Error(`Cross-origin redirect: ${path}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (response.status !== status || (file && (sha256 !== file.sha256 || bytes.length !== file.size))) throw new Error(`Status or content mismatch: ${path} (${response.status})`);
    const type = response.headers.get('content-type') || '';
    const cache = response.headers.get('cache-control') || '';
    if (status === 200) {
      const expectedType = path === '/' || path.endsWith('.html') ? /text\/html/ : path.endsWith('.json') ? /application\/json/ : path.endsWith('.mjs') ? /(?:application|text)\/javascript/ : /\.(md|sh|txt)$/.test(path) ? /text\/plain/ : null;
      if (expectedType && !expectedType.test(type)) throw new Error(`Unexpected MIME type: ${path} (${type})`);
      if (path === '/' || path === '/index.html' || path === '/release.json' || path === '/connect.md' || path.startsWith('/integrations/') || path.startsWith('/assets/')) {
        if (!cache.includes('no-transform') || !cache.includes(path.startsWith('/assets/') ? 'immutable' : 'no-cache')) throw new Error(`Unexpected cache policy: ${path} (${cache})`);
      }
    }
    rows.push({ path, status: response.status, sha256, type, cache });
  }
  for (const file of inventory) {
    if (!/^site\/(?!.*(?:^|\/)\.\.?\/)[a-zA-Z0-9_./-]+$/.test(file.path)) throw new Error('Invalid inventory path.');
    await request('/' + file.path.slice(5), file);
  }
  const index = inventory.find(file => file.path === 'site/index.html');
  if (!index || !inventory.some(file => file.path === 'site/release.json')) throw new Error('Missing entry or release metadata in inventory.');
  await request('/', index);
  await request('/integrations/wedraft-check-missing.mjs', null, 404);
  await request('/wedraft-check-missing.md', null, 404);
  return { source: candidate.commit, version: candidate.version, site: base.origin, checkedAt: new Date().toISOString(), rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, origin, output, timeoutSeconds = "180"] = process.argv.slice(2);
  if (!directory || !origin) throw new Error('Usage: node scripts/check-web-deployment.mjs <candidate-directory> <https-origin> [new-report.json] [timeout-seconds]');
  const report = await checkDeployment(resolve(directory), origin, fetch, Number(timeoutSeconds) * 1000);
  if (output) await writeFile(resolve(output), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(`PASS ${report.rows.length} deployment checks; source ${report.source}`);
}
