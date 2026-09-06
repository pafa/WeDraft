import type { LocalArticle } from "@wedraft/shared-types";

function plainTitle(value: string): string {
  return value
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/[*_`]/g, "")
    .trim();
}

export function shouldKeepHistoryArticle(article: LocalArticle): boolean {
  const title = article.title.trim();
  if (!title || title === "未命名文章") return false;

  const lines = article.markdown.split(/\r?\n/);
  const firstContentIndex = lines.findIndex((line) => line.trim());
  if (firstContentIndex < 0) return false;

  const firstLineIsTitle =
    plainTitle(lines[firstContentIndex] ?? "") === title;
  const body = firstLineIsTitle
    ? lines.slice(firstContentIndex + 1).join("\n")
    : article.markdown;

  return body.replace(/\s/g, "").length > 0;
}
