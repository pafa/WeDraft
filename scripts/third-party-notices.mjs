import { readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// Use the packages actually included by the bundler, not the entire development store.
export async function thirdPartyNotices(inputs, root) {
  const packages = new Map();
  for (const input of inputs) {
    if (!input.includes('node_modules/') || input.includes('\0')) continue;
    let directory = dirname(await realpath(resolve(root, input.split('?')[0])));
    while (directory.includes('node_modules')) {
      let manifest;
      try { manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (manifest?.name && manifest?.version) {
        packages.set(`${manifest.name}@${manifest.version}`, { directory, manifest });
        break;
      }
      directory = dirname(directory);
    }
  }
  const inventory = [];
  const sections = ['WeDraft bundled third-party notices', 'These notices describe third-party components. WeDraft is licensed separately under the accompanying MIT LICENSE.'];
  for (const [id, { directory, manifest }] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
    const licenseFiles = [];
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!/^(licen[cs]e|copying|copyright|notice)([._-]|$)/i.test(entry.name)) continue;
      if (entry.isFile()) licenseFiles.push(entry.name);
      if (entry.isDirectory()) {
        for (const name of await readdir(join(directory, entry.name))) {
          if (/\.(txt|md)$/i.test(name)) licenseFiles.push(`${entry.name}/${name}`);
        }
      }
    }
    // Do not silently distribute code whose published license text was omitted.
    const supplement = id === 'launder@1.7.1' ? 'third-party/launder-1.7.1-LICENSE.txt' : null;
    if (!licenseFiles.length && !supplement) throw new Error(`Missing bundled license text: ${id}`);
    const license = typeof manifest.license === 'string' ? manifest.license : JSON.stringify(manifest.license ?? null);
    inventory.push({ name: manifest.name, version: manifest.version, license, files: licenseFiles.length ? licenseFiles.sort() : [supplement] });
    sections.push(`\n${'='.repeat(72)}\n${id}\nDeclared license: ${license}`);
    for (const name of licenseFiles.sort()) sections.push(`\n--- ${name} ---\n${await readFile(join(directory, name), 'utf8')}`);
    if (!licenseFiles.length) sections.push(`\n--- ${supplement} ---\n${await readFile(join(root, supplement), 'utf8')}`);
  }
  return { text: sections.join('\n') + '\n', inventory };
}
