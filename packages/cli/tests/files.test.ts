import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadArticleFile, writeArticleArtifacts } from "../src/files.js";
import { articleInputSchema, importArticleBundle } from "@wedraft/core";

const temporary: string[] = [];
async function directory() { const path = await mkdtemp(join(tmpdir(), "wedraft-cli-")); temporary.push(path); return path; }
afterEach(async () => { for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true }); });
describe("CLI files", () => {
  it("writes reusable artifacts and refuses to overwrite them", async () => {
    const root = await directory(); const out = join(root, "output");
    const input = articleInputSchema.parse({ markdown: "标题\n\n保留 **重点** 的原稿。\n" });
    const result = await writeArticleArtifacts(input, out);
    expect(result.status).toBe("ready");
    expect(await readFile(join(out, "body.html"), "utf8")).toContain("重点</strong>");
    expect(importArticleBundle(new Uint8Array(await readFile(join(out, "article.wedraft.zip")))).markdown).toBe(input.markdown);
    await expect(writeArticleArtifacts(input, out)).rejects.toThrow();
  });
  it("preserves blocked originals but never writes a successful body export", async () => {
    const root = await directory(); const out = join(root, "blocked");
    const result = await writeArticleArtifacts(articleInputSchema.parse({ markdown: "标题\n\n![图片](missing.png)" }), out);
    expect(result.status).toBe("blocked");
    expect(result.files.some((path) => path.endsWith("body.html"))).toBe(false);
    expect(await readFile(join(out, "report.json"), "utf8")).toContain("ASSET_MISSING");
  });
  it("only reads images from the explicit asset root and rejects escaped symlinks", async () => {
    const root = await directory(); const allowed = join(root, "allowed"); await mkdir(allowed);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=", "base64");
    await writeFile(join(root, "outside.png"), png);
    await symlink(join(root, "outside.png"), join(allowed, "linked.png"));
    const source = join(root, "article.md"); await writeFile(source, "标题\n\n正文\n\n![图](linked.png)");
    expect((await loadArticleFile(source)).assets).toEqual([]);
    await expect(loadArticleFile(source, allowed)).rejects.toThrow("越过");
    await writeFile(join(allowed, "image.png"), png); await writeFile(source, "标题\n\n正文\n\n![图](image.png)");
    expect((await loadArticleFile(source, allowed)).assets[0]?.mimeType).toBe("image/png");
  });
});
