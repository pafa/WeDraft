export function buildBodyImageMarkdown(
  fileName: string,
  imageUrl: string,
  source: string,
): string {
  const alt = fileName.replace(/[[\]\r\n]/g, " ").trim() || "正文图片";
  const normalizedSource = source
    .replace(/^图片来源[：:]\s*/, "")
    .replace(/["\r\n]/g, " ")
    .trim();
  const caption = normalizedSource
    ? ` "图片来源：${normalizedSource}"`
    : "";
  return `\n\n![${alt}](${imageUrl}${caption})\n\n`;
}
