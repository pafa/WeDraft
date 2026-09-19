import { build } from "esbuild";
import { chmod, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { thirdPartyNotices } from "./third-party-notices.mjs";

export async function buildTool(target, outputFile) {
if (target !== "cli" && target !== "mcp") throw new Error("Expected cli or mcp target");
const entry = target === "cli" ? "cli" : "server";
const root = fileURLToPath(new URL("../", import.meta.url));
const result = await build({
  absWorkingDir: root, entryPoints: [`packages/${target}/src/${entry}.ts`],
  outfile: outputFile ?? `packages/${target}/dist/${entry}.mjs`, bundle: true,
  platform: "node", target: "node22", format: "esm", sourcemap: true, metafile: true,
  banner: { js: '#!/usr/bin/env node\nimport { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
});
await chmod(outputFile ?? `${root}packages/${target}/dist/${entry}.mjs`, 0o755);
return result.metafile;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2];
  const metadata = await buildTool(target);
  const root = fileURLToPath(new URL("../", import.meta.url));
  const notices = await thirdPartyNotices(Object.keys(metadata.inputs), root);
  await writeFile(join(root, `packages/${target}/dist/THIRD-PARTY-NOTICES.txt`), notices.text);
  await copyFile(join(root, 'LICENSE'), join(root, `packages/${target}/dist/LICENSE`));
}
