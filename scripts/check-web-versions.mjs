// Shared by working-tree and staged repository checks. Mac versions are independent.
export function checkWebVersions(read) {
  const paths = ['apps/web/package.json', 'packages/cli/package.json', 'packages/mcp/package.json', 'packages/core/package.json'];
  const versions = paths.map(path => [path, JSON.parse(read(path)).version]);
  versions.push(['ENGINE_VERSION', read('packages/core/src/index.ts').match(/export const ENGINE_VERSION = "([^"]+)";/)?.[1]]);
  const version = versions[0][1];
  const errors = [];
  if (!/^\d+\.\d+\.\d+$/.test(version)) errors.push('Web/AI 版本必须是 X.Y.Z。');
  for (const [name, value] of versions) {
    if (value !== version) errors.push(`${name} Web/AI 版本 ${value} 与 ${version} 不一致。`);
  }
  return { version, errors };
}
