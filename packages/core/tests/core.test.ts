import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { PREVIEW_COPY_SCRIPT, PREVIEW_COPY_CSP_HASH } from "../src/preview-copy.js";
import { strToU8, unzipSync, zipSync, Zip, ZipDeflate } from "fflate";
import { articleInputSchema, createPreviewHtml, decodeBase64, encodeBase64, exportArticleBundle, importArticleBundle, renderArticle, type ArticleAsset } from "../src/index.js";

const image: ArticleAsset = { path: "assets/test.png", mimeType: "image/png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=" };
const markdown = '# 保留原文的测试\r\n\r\n正文 **重点** 和 [链接](https://example.com)。\r\n\r\n![图片](assets/test.png "图片来源：作者")\r\n\r\n---\r\n\r\n## 1. 数据\r\n\r\n|项目|结果|\r\n|---|---|\r\n|示例|通过|\r\n\r\n```js\r\nconst x = "<script>";\r\n```\r\n\r\n---\r\n\r\n## 参考来源\r\n\r\n1. [原始资料](https://example.com/source)\r\n';

describe("shared article pipeline", () => {
  it("preserves captions, links, tables and escaped code in body-only output", () => {
    const result = renderArticle({ markdown, assets: [image] });
    expect(result.status).toBe("ready");
    expect(result.html).not.toContain("保留原文的测试");
    expect(result.html).toContain("图片来源：作者");
    expect(result.html).toContain('src="data:image/png;base64,');
    expect(result.html).toContain('href="https://example.com/source"');
    expect(result.html).toContain("<table");
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain("data-wedraft-");
    expect(result.previewHtml).toContain("data-wedraft-block-index");
    expect(result).toEqual(renderArticle({ markdown, assets: [image] }));
  });
  it("blocks missing assets and locates the Markdown line", () => {
    const result = renderArticle({ markdown: '标题\n\n![图](missing.png "来源")' });
    expect(result.status).toBe("blocked");
    expect(result.html).toBeNull();
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "ASSET_MISSING", startLine: 3 }));
  });
  it("rejects an unknown or incompatible template rather than silently changing appearance", () => {
    expect(() => renderArticle({ markdown, templateId: "unknown" })).toThrow("未知模板");
    expect(() => renderArticle({ markdown, templateVersion: "future" })).toThrow("不兼容");
  });
  it.each([
    "<iframe>重要原文</iframe>", "~~删除线~~", "[资料][source]\n\n[source]: https://example.com",
    "- A\n  - B", "- [x] 完成", "0. 自定义编号", "> 首段\n>\n> 第二段", "文字 ![图](assets/test.png)",
    "[文件](file:///private/file)", "![图片][image]\n\n[image]: assets/test.png",
    "[![图](https://example.com/image.png)](https://example.com/page)",
    "## 标题中的 ![图](https://example.com/image.png)",
    "|项目|图片|\n|---|---|\n|A|![图](https://example.com/image.png)|",
    "**![图](https://example.com/image.png)**",
  ])("reports unsupported input before output is mistaken for complete: %s", (body) => {
    const result = renderArticle({ markdown: `标题\n\n${body}`, assets: [image] });
    expect(result.status).toBe("blocked");
    expect(result.issues.some((issue) => issue.code === "UNSUPPORTED_MARKDOWN")).toBe(true);
  });
  it("allows remote images without fetching them, and reports the limitation", () => {
    const result = renderArticle({ markdown: "标题\n\n正文\n\n![图](https://example.com/image.png)" });
    expect(result.status).toBe("ready");
    expect(result.issues.some((issue) => issue.code === "REMOTE_IMAGE")).toBe(true);
  });
  it("rejects invalid image bytes and duplicate asset names", () => {
    expect(() => renderArticle({ markdown, assets: [{ ...image, base64: "c2NyaXB0" }] })).toThrow("图片");
    expect(() => renderArticle({ markdown, assets: [image, image] })).toThrow("重复");
  });
  it("decodes a large image without recursive-regexp stack overflow and rejects malformed padding", () => {
    const bytes = new Uint8Array(2 * 1024 * 1024).fill(173);
    expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
    for (const value of ["=AAA", "A===", "A=AA", "AAA", "AA?="]) expect(() => decodeBase64(value)).toThrow();
  });
  it("escapes preview title and includes no executable article HTML", () => {
    const html = createPreviewHtml(renderArticle({ markdown: '标题 <svg/onload=alert(1)>\n\n正文' }));
    expect(html).toContain("&lt;svg/onload=alert(1)&gt;");
    expect(html).not.toContain("<svg");
    expect(html).toContain("Content-Security-Policy");
  });
  it("allows only the fixed copy script and keeps article text outside executable code", () => {
    expect(PREVIEW_COPY_CSP_HASH).toBe(`sha256-${createHash("sha256").update(PREVIEW_COPY_SCRIPT).digest("base64")}`);
    const result = renderArticle({ markdown: '标题\n\n正文 **重点**\n\n```\n</script><script>alert(1)</script>\n```' });
    const html = createPreviewHtml(result);
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html).toContain(`script-src '${PREVIEW_COPY_CSP_HASH}'`);
    expect(html).toContain(`<section id="wedraft-body">${result.html}</section>`);
    expect(html).not.toContain('id="wedraft-copy" disabled');
  });
  it("disables the copy action for an incomplete article", () => {
    const html = createPreviewHtml(renderArticle({ markdown: '标题\n\n![图](missing.png)' }));
    expect(html).toContain('id="wedraft-copy" disabled');
  });
});

describe("portable article bundle", () => {
  function rewriteDeclaredArticleSize(bytes: Uint8Array, size: number) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 0; offset + 46 <= bytes.length; offset += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) continue;
      const nameLength = view.getUint16(offset + 28, true);
      if (new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength)) !== "article.md") continue;
      const local = view.getUint32(offset + 42, true);
      view.setUint32(offset + 24, size, true);
      view.setUint32(local + 22, size, true);
      return bytes;
    }
    throw new Error("Article entry missing from test fixture");
  }
  it("round-trips exact source, metadata, image bytes and rendered output", () => {
    const input = { markdown, assets: [image], templateId: "next-edition", author: "作者", sourceUrl: "https://example.com", digest: "原摘要" };
    const restored = importArticleBundle(exportArticleBundle(input));
    expect(restored.markdown).toBe(markdown);
    expect(restored.assets).toEqual([image]);
    expect(restored.author).toBe("作者");
    expect(renderArticle(restored)).toEqual(renderArticle(input));
  });
  it("keeps blocked drafts exportable so original content can be fixed later", () => {
    const raw = "标题\n\n<div>需要修复的原文</div>\n";
    expect(importArticleBundle(exportArticleBundle({ markdown: raw })).markdown).toBe(raw);
  });
  it("preserves an explicit Unicode BOM in source", () => {
    const raw = "\ufeff标题\r\n\r\n正文\r\n";
    expect(importArticleBundle(exportArticleBundle({ markdown: raw })).markdown).toBe(raw);
  });
  it("applies the same source URL limit before export and after import", () => {
    const prefix = "https://example.com/";
    const input = { markdown: "标题\n\n正文。", sourceUrl: prefix + "a".repeat(4000 - prefix.length) };
    expect(importArticleBundle(exportArticleBundle(input)).sourceUrl).toBe(input.sourceUrl);
    expect(() => articleInputSchema.parse({ ...input, sourceUrl: `${input.sourceUrl}a` })).toThrow();
    expect(() => exportArticleBundle({ ...input, sourceUrl: `${input.sourceUrl}a` })).toThrow();
  });
  it("accepts ordinary compressed entries and streaming ZIP data descriptors", () => {
    const entries = unzipSync(exportArticleBundle({ markdown, assets: [image] }));
    expect(importArticleBundle(zipSync(entries, { level: 6 })).markdown).toBe(markdown);
    const chunks: Uint8Array[] = [];
    const stream = new Zip((error, bytes) => { if (error) throw error; chunks.push(bytes); });
    for (const [name, bytes] of Object.entries(entries)) {
      const file = new ZipDeflate(name); stream.add(file); file.push(bytes, true);
    }
    stream.end();
    const restored = importArticleBundle(new Uint8Array(Buffer.concat(chunks)));
    expect(restored.markdown).toBe(markdown);
    expect(restored.assets).toEqual([image]);
  });
  it("rejects excessive trailing compressed data without accumulating an unbounded idle buffer", () => {
    const entries = unzipSync(exportArticleBundle({ markdown: "Title\n\nOriginal source." }));
    // Keep article.md last so padding affects only its compressed size and the directory position.
    const original = zipSync({ "manifest.json": entries["manifest.json"]!, "article.md": entries["article.md"]! }, { level: 6 });
    const originalView = new DataView(original.buffer);
    const directoryStart = originalView.getUint32(original.length - 6, true);
    const padding = 68 * 1024;
    const bytes = new Uint8Array(original.length + padding);
    bytes.set(original.subarray(0, directoryStart));
    bytes.set(original.subarray(directoryStart), directoryStart + padding);
    const view = new DataView(bytes.buffer);
    let cursor = directoryStart + padding;
    for (let index = 0; index < 2; index += 1) {
      const nameLength = view.getUint16(cursor + 28, true);
      const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
      if (name === "article.md") {
        const local = view.getUint32(cursor + 42, true);
        const compressedSize = view.getUint32(cursor + 20, true) + padding;
        view.setUint32(cursor + 20, compressedSize, true);
        view.setUint32(local + 18, compressedSize, true);
      }
      cursor += 46 + nameLength + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
    }
    view.setUint32(bytes.length - 6, directoryStart + padding, true);
    expect(() => importArticleBundle(bytes)).toThrow("过多无输出数据");
  });
  it.each([5, 150_000])("rejects a forged uncompressed length %s instead of truncating or padding source", (size) => {
    const entries = unzipSync(exportArticleBundle({ markdown: "Title\n\n" + "x".repeat(100_000) }));
    expect(() => importArticleBundle(rewriteDeclaredArticleSize(zipSync(entries, { level: 6 }), size))).toThrow(/实际大小/);
  });
  it("rejects CRC mismatches instead of accepting corrupted article text", () => {
    const bytes = exportArticleBundle({ markdown: "Title\n\nThe original article must remain intact." });
    const position = Buffer.from(bytes).indexOf("original");
    expect(position).toBeGreaterThan(0);
    bytes[position] = "X".charCodeAt(0);
    expect(() => importArticleBundle(bytes)).toThrow("CRC");
  });
  it("rejects invalid UTF-8 instead of silently replacing original bytes", () => {
    const entries = unzipSync(exportArticleBundle({ markdown: "原稿" }));
    entries["article.md"] = new Uint8Array([0xff, 0xfe]);
    expect(() => importArticleBundle(zipSync(entries))).toThrow();
  });
  it.each(["../outside.png", "/tmp/outside", "assets/../outside.png", "assets\\outside.png", "script.js"])("rejects unsafe or unrelated archive entry %s", (path) => {
    expect(() => importArticleBundle(zipSync({ [path]: strToU8("private") }))).toThrow();
  });
  it("rejects missing manifest, missing assets and incompatible format versions", () => {
    expect(() => importArticleBundle(zipSync({ "article.md": strToU8("标题") }))).toThrow("缺少");
    expect(() => importArticleBundle(zipSync({ "manifest.json": strToU8('{"schemaVersion":99}'), "article.md": strToU8("标题") }))).toThrow();
  });
});
