import { build } from "esbuild";
import { chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const target = process.argv[2];
if (target !== "cli" && target !== "mcp") throw new Error("Expected cli or mcp target");
const entry = target === "cli" ? "cli" : "server";
const root = fileURLToPath(new URL("../", import.meta.url));
await build({
  absWorkingDir: root, entryPoints: [`packages/${target}/src/${entry}.ts`],
  outfile: `packages/${target}/dist/${entry}.mjs`, bundle: true,
  platform: "node", target: "node22", format: "esm", sourcemap: true,
  external: target === "mcp" ? ["@modelcontextprotocol/sdk/*"] : [],
  banner: { js: '#!/usr/bin/env node\nimport { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
});
await chmod(`${root}packages/${target}/dist/${entry}.mjs`, 0o755);
