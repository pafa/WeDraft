import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
// @ts-expect-error Bundler-owned notice collector is an executable ES module.
import { thirdPartyNotices } from "../../scripts/third-party-notices.mjs";
// @ts-expect-error The shared build helper is an executable ES module.
import { buildIntegrations, integrationAssets, integrationDirectory } from "../../scripts/build-integrations.mjs";

function integrations(): Plugin {
  return {
    name: "wedraft-integrations",
    async buildStart() { await buildIntegrations(); },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split("?")[0];
        const name = path === "/connect.md" ? "connect.md" : path?.startsWith("/integrations/") ? path.slice("/integrations/".length) : null;
        if (!name || (name !== "connect.md" && !integrationAssets.includes(name))) return next();
        try {
          const bytes = await readFile(join(integrationDirectory, name));
          response.setHeader("Content-Type", name.endsWith(".json") ? "application/json; charset=utf-8" : "text/plain; charset=utf-8");
          response.setHeader("Cache-Control", "no-cache");
          response.end(bytes);
        } catch (error) { next(error); }
      });
    },
    async generateBundle() {
      this.emitFile({ type: "asset", fileName: "LICENSE", source: await readFile(join(integrationDirectory, "LICENSE")) });
      const notices = await thirdPartyNotices([...this.getModuleIds()], join(integrationDirectory, "../.."));
      this.emitFile({ type: "asset", fileName: "THIRD-PARTY-NOTICES.txt", source: notices.text });
      this.emitFile({ type: "asset", fileName: "dependencies.json", source: JSON.stringify(notices.inventory, null, 2) + "\n" });
      for (const name of [...integrationAssets, "connect.md"]) {
        this.emitFile({ type: "asset", fileName: name === "connect.md" ? name : `integrations/${name}`, source: await readFile(join(integrationDirectory, name)) });
      }
    },
  };
}
export default defineConfig({ plugins: [react(), integrations()], base: "./", server: { host: "127.0.0.1", port: 1432, strictPort: true }, build: { target: "es2022", sourcemap: true } });
