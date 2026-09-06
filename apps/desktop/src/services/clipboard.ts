import { documentPlainText } from "@wedraft/article-model";
import type { ArticleDocument } from "@wedraft/shared-types";

import {
  copyPlainText as nativeCopyPlainText,
  copyRichText,
  readCachedImage,
} from "./native.js";

type ImageReader = typeof readCachedImage;

export async function prepareClipboardHtml(
  document: ArticleDocument,
  articleHtml: string,
  imageReader: ImageReader = readCachedImage,
): Promise<string> {
  const parsed = new DOMParser().parseFromString(articleHtml, "text/html");
  for (const block of document.blocks) {
    if (block.type !== "image") continue;
    const image = Array.from(
      parsed.querySelectorAll<HTMLImageElement>("img[data-wedraft-image-id]"),
    ).find(
      (candidate) =>
        candidate.getAttribute("data-wedraft-image-id") === block.id,
    );
    if (!image) continue;
    if (block.localPath?.startsWith("wedraft://image/")) {
      const cachedPath = new URL(block.localPath).searchParams.get("path");
      if (!cachedPath) throw new Error("正文图片缓存路径无效，请重新插入图片。");
      const cached = await imageReader(cachedPath);
      image.src = `data:${cached.mimeType};base64,${cached.base64}`;
    }
    image.removeAttribute("data-wedraft-image-id");
  }

  const fragment = parsed.body.innerHTML;
  return [
    "<html><body>",
    "<!--StartFragment-->",
    fragment,
    "<!--EndFragment-->",
    "</body></html>",
  ].join("");
}

export async function copyArticle(
  document: ArticleDocument,
  articleHtml: string,
): Promise<void> {
  const html = await prepareClipboardHtml(document, articleHtml);
  await copyRichText(html, documentPlainText(document));
}

export async function copyPlainText(text: string): Promise<void> {
  await nativeCopyPlainText(text);
}
