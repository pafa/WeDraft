import {
  documentPlainText,
} from "@wedraft/article-model";
import {
  parseArticleWithSourceMap,
  type ArticleSourceRange,
} from "@wedraft/article-parser";
import type { ArticleDocument } from "@wedraft/shared-types";
import {
  getTemplateById,
  renderWechatHtml,
} from "@wedraft/wechat-renderer";

export function countArticleCharacters(document: ArticleDocument): number {
  return `${document.title}${documentPlainText(document)}`
    .replace(/\s/g, "")
    .length;
}

export function buildArticle(input: {
  markdown: string;
  author: string;
  digest: string;
  sourceUrl: string;
  templateId?: string;
  imagePreviewUrls?: Record<string, string>;
}): {
  document: ArticleDocument;
  html: string;
  sourceMap: ArticleSourceRange[];
} {
  const parsed = parseArticleWithSourceMap(input.markdown, {
    author: input.author,
    digest: input.digest,
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
  });
  const { document } = parsed;
  for (const block of document.blocks) {
    if (
      block.type === "image" &&
      block.localPath?.startsWith("wedraft://image/")
    ) {
      try {
        const source = new URL(block.localPath);
        const id = source.pathname.replace(/^\/+/, "");
        if (id) block.id = id;
        const previewUrl = input.imagePreviewUrls?.[block.localPath];
        if (previewUrl) block.previewUrl = previewUrl;
      } catch {
        // 内容检查会拦截无法解析的本地图片。
      }
    }
  }
  return {
    document,
    html: renderWechatHtml(
      document,
      getTemplateById(input.templateId ?? "default-business"),
    ),
    sourceMap: parsed.sourceMap,
  };
}
