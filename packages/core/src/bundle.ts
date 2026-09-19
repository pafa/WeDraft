import { Inflate, strToU8, zipSync } from "fflate";
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

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

/** The bundle format uses single-disk ZIP with stored or DEFLATE entries. */
function readBundleEntries(bytes: Uint8Array): Record<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  let end = bytes.length - 22;
  const minimum = Math.max(0, end - 65535);
  for (; end >= minimum; end -= 1) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break;
  }
  if (end < minimum) throw new Error("文章包 ZIP 目录损坏。");
  const count = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  const centralStart = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0 ||
    view.getUint16(end + 8, true) !== count || count > MAX_ASSETS + 2 || centralStart + centralSize !== end) {
    throw new Error("文章包包含不支持的 ZIP 目录或过多文件。");
  }
  const entries: Record<string, Uint8Array> = Object.create(null) as Record<string, Uint8Array>;
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = centralStart; let total = 0;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) throw new Error("文章包 ZIP 文件记录损坏。");
    const flags = view.getUint16(cursor + 8, true);
    const compression = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const originalSize = view.getUint32(cursor + 24, true);
    const nameSize = view.getUint16(cursor + 28, true);
    const next = cursor + 46 + nameSize + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
    const local = view.getUint32(cursor + 42, true);
    if (next > end || view.getUint16(cursor + 34, true) !== 0) throw new Error("文章包 ZIP 文件记录越界。");
    const name = utf8.decode(bytes.subarray(cursor + 46, cursor + 46 + nameSize));
    cursor = next;
    if (!isSafeAssetPath(name)) throw new Error("文章包包含非法路径。");
    if (Object.hasOwn(entries, name)) throw new Error("文章包包含重复文件。");
    if (name !== "article.md" && name !== "manifest.json" && !/^assets\/\d+\.(?:png|jpg|gif|webp)$/.test(name)) {
      throw new Error(`文章包包含未支持的文件：${name}`);
    }
    const limit = name === "article.md" ? 4 * MAX_SOURCE_LENGTH : name === "manifest.json" ? 128 * 1024 : MAX_IMAGE_BYTES;
    if (originalSize > limit) throw new Error("文章包内文件超过大小限制。");
    if (flags & 0x41 || (compression !== 0 && compression !== 8)) throw new Error("文章包包含不支持的加密或压缩格式。");
    if (local + 30 > centralStart || view.getUint32(local, true) !== 0x04034b50) throw new Error("文章包 ZIP 文件头损坏。");
    const localNameSize = view.getUint16(local + 26, true);
    const dataStart = local + 30 + localNameSize + view.getUint16(local + 28, true);
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > centralStart || view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== compression ||
      utf8.decode(bytes.subarray(local + 30, local + 30 + localNameSize)) !== name ||
      (!(flags & 8) && (view.getUint32(local + 14, true) !== expectedCrc || view.getUint32(local + 18, true) !== compressedSize || view.getUint32(local + 22, true) !== originalSize)) ||
      ranges.some((range) => local < range.end && dataEnd > range.start)) {
      throw new Error("文章包 ZIP 文件信息不一致。");
    }
    ranges.push({ start: local, end: dataEnd });
    const chunks: Uint8Array[] = []; let size = 0; let crc = 0xffffffff;
    const accept = (chunk: Uint8Array) => {
      size += chunk.length; total += chunk.length;
      if (size > originalSize || size > limit || total > MAX_BUNDLE_BYTES) throw new Error("文章包解压后的实际大小超过声明或限制。");
      for (const byte of chunk) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
      chunks.push(chunk.slice());
    };
    const compressed = bytes.subarray(dataStart, dataEnd);
    if (compression === 0) accept(compressed);
    else {
      const inflater = new Inflate((chunk) => accept(chunk));
      // Bound each expansion before accepting another chunk; never allocate from untrusted ZIP sizes.
      let idleInput = 0;
      for (let offset = 0; offset < compressed.length; offset += 1024) {
        const input = compressed.subarray(offset, offset + 1024);
        const previousSize = size;
        inflater.push(input, offset + 1024 >= compressed.length);
        idleInput = size === previousSize ? idleInput + input.length : 0;
        // Empty blocks or padding after the stream must not grow fflate's
        // unconsumed buffer indefinitely. Ordinary DEFLATE headers fit well below this budget.
        if (idleInput > 64 * 1024) throw new Error("文章包压缩流包含过多无输出数据。");
      }
      if (!compressed.length) throw new Error("文章包压缩数据为空。");
    }
    if (size !== originalSize) throw new Error("文章包解压后的实际大小与声明不符。");
    if (((crc ^ 0xffffffff) >>> 0) !== expectedCrc) throw new Error(`文章包文件 CRC 校验失败：${name}`);
    const result = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    entries[name] = result;
  }
  if (cursor !== end) throw new Error("文章包 ZIP 目录长度不一致。");
  return entries;
}

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
  const entries = readBundleEntries(bytes);
  const count = Object.keys(entries).length;
  if (!entries["manifest.json"] || !entries["article.md"]) throw new Error("文章包缺少 manifest.json 或 article.md。");
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
