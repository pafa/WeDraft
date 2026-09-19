import { readFile, realpath, stat, mkdir, writeFile } from "node:fs/promises";
import { resolve, relative, sep, isAbsolute, join } from "node:path";
import { articleInputSchema, createPreviewHtml, encodeBase64, exportArticleBundle, imageMime, importArticleBundle, isSafeAssetPath, MAX_BUNDLE_BYTES, MAX_IMAGE_BYTES, MAX_SOURCE_LENGTH, renderArticle, type PortableArticle } from "@wedraft/core";

export async function readLimited(path: string, maximum: number): Promise<Uint8Array> {
  const info = await stat(path);
  if (!info.isFile() || info.size > maximum) throw new Error(`文件不是普通文件或超过大小限制：${path}`);
  const bytes = new Uint8Array(await readFile(path));
  if (bytes.length > maximum) throw new Error("文件读取时超过大小限制。");
  return bytes;
}

export async function loadArticleFile(path: string, assetRoot?: string): Promise<PortableArticle> {
  const bytes = await readLimited(path, path.endsWith(".zip") ? MAX_BUNDLE_BYTES : path.endsWith(".json") ? 60 * 1024 * 1024 : MAX_SOURCE_LENGTH * 4);
  let article: PortableArticle;
  if (path.endsWith(".zip")) article = importArticleBundle(bytes);
  else if (path.endsWith(".json")) article = articleInputSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  else article = articleInputSchema.parse({ markdown: new TextDecoder("utf-8", { fatal: true }).decode(bytes) });
  if (!assetRoot) return article;
  const root = await realpath(assetRoot);
  const parsed = renderArticle(article);
  for (const block of parsed.document.blocks) {
    if (block.type !== "image" || !block.localPath || article.assets.some((asset) => asset.path === block.localPath)) continue;
    if (!isSafeAssetPath(block.localPath)) throw new Error(`图片路径必须位于指定目录：${block.localPath}`);
    const path = await realpath(resolve(root, block.localPath));
    const rel = relative(root, path);
    if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("图片路径或符号链接越过了指定图片目录。");
    const image = await readLimited(path, MAX_IMAGE_BYTES);
    article.assets.push({ path: block.localPath, mimeType: imageMime(image), base64: encodeBase64(image) });
  }
  return article;
}

export async function writeArticleArtifacts(article: PortableArticle, directory: string) {
  const result = renderArticle(article);
  // Never overwrite an existing directory or the user's files.
  await mkdir(directory, { recursive: false });
  const files: Record<string, string | Uint8Array> = {
    "article.wedraft.zip": exportArticleBundle(article),
    "preview.html": createPreviewHtml(result),
    "report.json": JSON.stringify({ status: result.status, issues: result.issues, template: result.template, engineVersion: result.engineVersion }, null, 2),
  };
  if (result.html !== null) {
    files["body.html"] = result.html;
    files["body.txt"] = result.plainText;
  }
  for (const [name, value] of Object.entries(files)) await writeFile(join(directory, name), value, { flag: "wx" });
  return { status: result.status, issues: result.issues, files: Object.keys(files).map((name) => resolve(directory, name)) };
}
