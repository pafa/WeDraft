import { afterEach, expect, test } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
// @ts-expect-error Release scripts run directly in Node without a TS build.
import { prepareHosting } from '../../../scripts/web-release-hosting.mjs';
// @ts-expect-error Release scripts run directly in Node without a TS build.
import { checkDeployment } from '../../../scripts/check-web-deployment.mjs';
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'wedraft-release-test-'));
  directories.push(directory);
  await mkdir(join(directory, 'site'));
  const files = {
    'index.html': '<!doctype html><title>WeDraft</title>',
    'release.json': JSON.stringify({ commit: 'abc123', version: '0.1.0' }),
    'app-icon.png': 'fixture-icon',
    'robots.txt': 'User-agent: *\nAllow: /\n\nSitemap: https://example.org/sitemap.xml\n',
    'sitemap.xml': '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.org/</loc></url></urlset>',
  };
  for (const [path, body] of Object.entries(files)) await writeFile(join(directory, 'site', path), body);
  await writeFile(join(directory, 'site-files.json'), JSON.stringify(Object.entries(files).map(([path, body]) => ({ path: `site/${path}`, size: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') }))));
  return { directory, files };
}
test('hosting preparation includes privacy headers, exact source content and domain without credentials', async () => {
  const { directory, files } = await fixture();
  await prepareHosting(directory, 'https://example.org');
  const config = JSON.parse(await readFile(join(directory, 'wrangler.jsonc'), 'utf8'));
  expect(config.routes).toEqual([{ pattern: 'example.org', custom_domain: true }]);
  expect(config.account_id).toBeUndefined();
  expect(config.assets.not_found_handling).toBe('none');
  expect(config.assets.html_handling).toBe('auto-trailing-slash');
  expect(await readFile(join(directory, 'deploy-site/index.html'), 'utf8')).toBe(files['index.html']);
  expect(await readFile(join(directory, 'deploy-site/_headers'), 'utf8')).toContain('no-transform');
  expect(await readFile(join(directory, 'deploy-site/_redirects'), 'utf8')).toBe('/favicon.ico /app-icon.png 301\n');
  for (const name of ['robots.txt', 'sitemap.xml'] as const) expect(await readFile(join(directory, 'deploy-site', name), 'utf8')).toBe(files[name]);
  await expect(prepareHosting(directory, 'https://example.org')).rejects.toThrow();
  await expect(prepareHosting(directory, 'https://example.org/path')).rejects.toThrow();
});
test('deployment verification rejects transformed HTML and wrong MIME or cache, including root', async () => {
  const { directory, files } = await fixture();
  await prepareHosting(directory, 'https://example.org');
  let fault = '';
  const fetcher = async (url: URL) => {
    // fetch follows the favicon redirect; compare the final body with the icon.
    const path = url.pathname === '/' ? 'index.html' : url.pathname === '/favicon.ico' ? 'app-icon.png' : url.pathname.slice(1);
    const body = fault === 'missing-favicon' && url.pathname === '/favicon.ico' ? undefined : files[path as keyof typeof files];
    const type = path.endsWith('.html') ? 'text/html' : path.endsWith('.xml') ? 'application/xml' : path.endsWith('.png') ? 'image/png' : path.endsWith('.txt') ? 'text/plain' : 'application/json';
    const inject = (fault === 'root' && url.pathname === '/') || (fault === 'wrong-favicon' && url.pathname === '/favicon.ico');
    const wrongMime = fault === 'mime' || (fault === 'sitemap-mime' && path === 'sitemap.xml');
    const wrongCache = fault === 'cache' || (fault === 'discovery-cache' && path === 'robots.txt');
    return new Response(body === undefined ? '' : body + (inject ? 'injected' : ''), { status: body === undefined ? 404 : 200, headers: { 'content-type': wrongMime ? 'text/plain' : type, 'cache-control': wrongCache ? 'public' : 'public, no-cache, no-transform' } });
  };
  expect((await checkDeployment(directory, 'https://example.org', fetcher)).rows).toHaveLength(9);
  for (fault of ['root', 'mime', 'cache', 'missing-favicon', 'wrong-favicon', 'sitemap-mime', 'discovery-cache']) await expect(checkDeployment(directory, 'https://example.org', fetcher)).rejects.toThrow();
  await expect(checkDeployment(directory, 'http://example.org', fetcher)).rejects.toThrow('HTTPS');
  // Rollback verification must still accept retained candidates without this route.
  await rm(join(directory, 'deploy-site/_redirects'));
  fault = 'missing-favicon';
  expect((await checkDeployment(directory, 'https://example.org', fetcher)).rows).toHaveLength(8);
});
