import { z } from "zod";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_ASSET_BYTES = 40 * 1024 * 1024;
export const MAX_ASSETS = 64;
export const MAX_SOURCE_LENGTH = 1_000_000;

export function isSafeAssetPath(path: string): boolean {
  return path.length > 0 && path.length <= 240 &&
    !/[\\\x00-\x1f:?#%]/.test(path) &&
    path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

export const assetSchema = z.strictObject({
  path: z.string().refine(isSafeAssetPath, "图片必须使用安全的相对路径。"),
  mimeType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
  base64: z.string().max(Math.ceil(MAX_IMAGE_BYTES / 3) * 4),
});
export type ArticleAsset = z.infer<typeof assetSchema>;

export function decodeBase64(value: string): Uint8Array {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  if (!value || value.length % 4 !== 0 || /[^A-Za-z0-9+/]/.test(value.slice(0, value.length - padding))) {
    throw new Error("图片 Base64 格式无效。");
  }
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export function imageMime(bytes: Uint8Array): ArticleAsset["mimeType"] {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("图片大小必须在 1 字节到 10 MiB 之间。");
  const starts = (...signature: number[]) => signature.every((value, index) => bytes[index] === value);
  if (starts(137, 80, 78, 71, 13, 10, 26, 10)) return "image/png";
  if (starts(255, 216, 255)) return "image/jpeg";
  if (starts(71, 73, 70, 56) && (bytes[4] === 55 || bytes[4] === 57) && bytes[5] === 97) return "image/gif";
  if (starts(82, 73, 70, 70) && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") return "image/webp";
  throw new Error("仅支持 PNG、JPEG、GIF 和 WEBP 图片，文件内容与图片格式必须相符。");
}

export function validateAssets(input: ArticleAsset[]): Map<string, ArticleAsset> {
  const assets = z.array(assetSchema).max(MAX_ASSETS).parse(input);
  const result = new Map<string, ArticleAsset>();
  let total = 0;
  for (const asset of assets) {
    if (result.has(asset.path)) throw new Error(`重复的图片路径：${asset.path}`);
    const bytes = decodeBase64(asset.base64);
    if (imageMime(bytes) !== asset.mimeType) throw new Error(`图片格式与声明不一致：${asset.path}`);
    total += bytes.length;
    if (total > MAX_ASSET_BYTES) throw new Error("本篇文章的图片总量不能超过 40 MiB。");
    result.set(asset.path, asset);
  }
  return result;
}

export async function createAsset(bytes: Uint8Array): Promise<ArticleAsset> {
  const mimeType = imageMime(bytes);
  const hash = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  const id = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  return { path: `assets/${id}.${extension}`, mimeType, base64: encodeBase64(bytes) };
}

export function assetDataUrl(asset: ArticleAsset): string {
  return `data:${asset.mimeType};base64,${asset.base64}`;
}
