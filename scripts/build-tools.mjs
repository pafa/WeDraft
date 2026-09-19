import { build } from "esbuild";
import { chmod } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function buildTool(target, outputFile) {
if (target !== "cli" && target !== "mcp") throw new Error("Expected cli or mcp target");
const entry = target === "cli" ? "cli" : "server";
const root = fileURLToPath(new URL("../", import.meta.url));
await build({
  absWorkingDir: root, entryPoints: [`packages/${target}/src/${entry}.ts`],
  outfile: outputFile ?? `packages/${target}/dist/${entry}.mjs`, bundle: true,
  platform: "node", target: "node22", format: "esm", sourcemap: true,
  banner: { js: '#!/usr/bin/env node\nimport { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
});
await chmod(outputFile ?? `${root}packages/${target}/dist/${entry}.mjs`, 0o755);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await buildTool(process.argv[2]);
