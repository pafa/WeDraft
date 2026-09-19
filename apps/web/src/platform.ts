import { assetDataUrl, createAsset, MAX_IMAGE_BYTES, type ArticleAsset } from "@wedraft/core";

export function download(bytes: Uint8Array | string, name: string, mimeType: string) {
  const data = typeof bytes === "string" ? bytes : Uint8Array.from(bytes);
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function copyHtml(html: string, plainText: string): Promise<void> {
  if (!navigator.clipboard || !globalThis.ClipboardItem) {
    return Promise.reject(new Error("当前浏览器无法复制富文本。请使用支持剪贴板的 HTTPS / localhost 页面，或导出 HTML。"));
  }
  return navigator.clipboard.write([new ClipboardItem({
    "text/html": new Blob([`<html><body><!--StartFragment-->${html}<!--EndFragment--></body></html>`], { type: "text/html" }),
    "text/plain": new Blob([plainText], { type: "text/plain" }),
  })]);
}

export async function prepareBrowserImage(file: File): Promise<{ asset: ArticleAsset; url: string; dataUrl: string; notice: string }> {
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error("单张图片不能超过 10 MiB。");
  const asset = await createAsset(new Uint8Array(await file.arrayBuffer()));
  const dataUrl = assetDataUrl(asset);
  const image = new Image(); image.src = dataUrl;
  await image.decode();
  if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error("图片不能超过 4000 万像素，请先缩小尺寸。");
  return { asset, url: asset.path, dataUrl, notice: `图片已加入文章：${image.naturalWidth} × ${image.naturalHeight}px；将随草稿保存，导出文章包时一并携带。` };
}
