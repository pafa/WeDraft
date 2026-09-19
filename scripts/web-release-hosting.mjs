import { cp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// No account ID or credential is needed to prepare a reviewable static deployment.
export async function prepareHosting(directory, site) {
  const url = new URL(site);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password || url.port) {
    throw new Error('Deployment site must be an HTTPS origin without a port, path or credentials.');
  }
  const template = JSON.parse(await readFile(new URL('../deployment/cloudflare/wrangler.template.json', import.meta.url), 'utf8'));
  template.routes = [{ pattern: url.hostname, custom_domain: true }];
  await cp(join(directory, 'site'), join(directory, 'deploy-site'), { recursive: true, errorOnExist: true, force: false });
  await cp(new URL('../deployment/cloudflare/_headers', import.meta.url), join(directory, 'deploy-site/_headers'), { errorOnExist: true, force: false });
  await writeFile(join(directory, 'wrangler.jsonc'), JSON.stringify(template, null, 2) + '\n', { flag: 'wx' });
}
