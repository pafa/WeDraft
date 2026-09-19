import { expect, test } from 'vitest';
// @ts-expect-error This repository check runs directly in Node.
import { checkWebVersions } from '../../../scripts/check-web-versions.mjs';
const paths = ['apps/web/package.json', 'packages/cli/package.json', 'packages/mcp/package.json', 'packages/core/package.json'];
function fixture() {
  return Object.fromEntries([...paths.map(path => [path, JSON.stringify({ version: '0.1.0' })]), ['packages/core/src/index.ts', 'export const ENGINE_VERSION = "0.1.0";']]);
}
test('accepts one consistent Web/AI release without reading Mac or unrelated package versions', () => {
  const files = fixture();
  expect(checkWebVersions((path: string) => { if (!(path in files)) throw Error('unexpected version scope'); return files[path]; })).toEqual({ version: '0.1.0', errors: [] });
});
test.each([...paths, 'packages/core/src/index.ts'])('rejects independent version drift in %s', path => {
  const files = fixture();
  files[path] = files[path].replace('0.1.0', '0.1.1');
  expect(checkWebVersions((name: string) => files[name]).errors.length).toBeGreaterThan(0);
});
test('rejects missing engine version and invalid shared version syntax', () => {
  const files = fixture();
  files['packages/core/src/index.ts'] = '';
  expect(checkWebVersions((name: string) => files[name]).errors.join('\n')).toContain('ENGINE_VERSION');
  for (const path of paths) files[path] = JSON.stringify({ version: 'latest' });
  expect(checkWebVersions((name: string) => files[name]).errors.join('\n')).toContain('X.Y.Z');
});
