import { strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";
import { articleInputSchema, ENGINE_VERSION, TEMPLATE_VERSION, type ArticleInput, type PortableArticle } from "./index.js";
import { assetSchema, decodeBase64, encodeBase64, isSafeAssetPath, MAX_ASSET_BYTES, MAX_ASSETS, MAX_IMAGE_BYTES, MAX_SOURCE_LENGTH, validateAssets } from "./assets.js";

export const MAX_BUNDLE_BYTES = MAX_ASSET_BYTES + 4 * MAX_SOURCE_LENGTH;
const manifestSchema = z.strictObject({
  format: z.literal("wedraft"), schemaVersion: z.literal(1),
  engineVersion: z.string().max(80), templateVersion: z.string().max(80),
  templateId: z.string().max(80), author: z.string().max(100), digest: z.string().max(1000), sourceUrl: z.string().max(4000),
  assets: z.array(z.strictObject({ path: assetSchema.shape.path, mimeType: assetSchema.shape.mimeType, file: z.string() })).max(MAX_ASSETS),
});

/** Keeps the original Markdown verbatim, including whitespace and source captions. */
export function exportArticleBundle(rawInput: ArticleInput): Uint8Array {
  const input = articleInputSchema.parse(rawInput);
  const assets = [...validateAssets(input.assets).values()];
  if (input.templateVersion && input.templateVersion !== TEMPLATE_VERSION) throw new Error("无法导出不兼容的模板版本。");
  const entries: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>;
  entries["article.md"] = strToU8(input.markdown);
  const assetManifest = assets.map((asset, index) => {
    const file = `assets/${index}.${asset.mimeType === "image/jpeg" ? "jpg" : asset.mimeType.split("/")[1]}`;
    entries[file] = decodeBase64(asset.base64);
    return { path: asset.path, mimeType: asset.mimeType, file };
  });
  entries["manifest.json"] = strToU8(JSON.stringify({
    format: "wedraft", schemaVersion: 1, engineVersion: ENGINE_VERSION,
    templateVersion: TEMPLATE_VERSION, templateId: input.templateId,
    author: input.author, digest: input.digest, sourceUrl: input.sourceUrl, assets: assetManifest,
  }, null, 2));
  return zipSync(entries, { level: 0, mtime: new Date(2020, 0, 1) });
}

export function importArticleBundle(bytes: Uint8Array): PortableArticle {
  if (!bytes.length || bytes.length > MAX_BUNDLE_BYTES) throw new Error("文章包为空或超过大小限制。");
  let total = 0; let count = 0;
  const entries = unzipSync(bytes, { filter: (file) => {
    count += 1;
    if (!isSafeAssetPath(file.name) || count > MAX_ASSETS + 2) throw new Error("文章包包含非法路径或过多文件。");
    const limit = file.name === "article.md" ? 4 * MAX_SOURCE_LENGTH : file.name === "manifest.json" ? 128 * 1024 : MAX_IMAGE_BYTES;
    if (file.originalSize > limit) throw new Error("文章包内文件超过大小限制。");
    total += file.originalSize;
    if (total > MAX_BUNDLE_BYTES) throw new Error("文章包解压后过大。");
    if (file.name !== "article.md" && file.name !== "manifest.json" && !/^assets\/\d+\.(?:png|jpg|gif|webp)$/.test(file.name)) {
      throw new Error(`文章包包含未支持的文件：${file.name}`);
    }
    return true;
  } });
  if (!entries["manifest.json"] || !entries["article.md"]) throw new Error("文章包缺少 manifest.json 或 article.md。");
  if (Object.keys(entries).length !== count) throw new Error("文章包包含重复文件。");
  const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const manifest = manifestSchema.parse(JSON.parse(utf8.decode(entries["manifest.json"])));
  if (manifest.templateVersion !== TEMPLATE_VERSION) throw new Error(`文章包模板版本不兼容：${manifest.templateVersion}`);
  const filenames = manifest.assets.map((asset) => asset.file);
  if (new Set(filenames).size !== filenames.length) throw new Error("文章包包含重复资产映射。");
  if (count !== manifest.assets.length + 2) throw new Error("文章包文件与资产清单不一致。");
  const assets = manifest.assets.map((asset) => {
    if (!/^assets\/\d+\.(?:png|jpg|gif|webp)$/.test(asset.file) || !entries[asset.file]) throw new Error(`文章包缺少图片：${asset.path}`);
    return { path: asset.path, mimeType: asset.mimeType, base64: encodeBase64(entries[asset.file]!) };
  });
  validateAssets(assets);
  return articleInputSchema.parse({ markdown: utf8.decode(entries["article.md"]),
    templateId: manifest.templateId, templateVersion: manifest.templateVersion,
    author: manifest.author, digest: manifest.digest, sourceUrl: manifest.sourceUrl, assets });
}
