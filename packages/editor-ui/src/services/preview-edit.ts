import type { ArticleSourceRange } from "@wedraft/article-parser";
import type {
  ArticleBlock,
  InlineNode,
} from "@wedraft/shared-types";

function escapeMarkdownText(value: string): string {
  return value.replace(/([\\`*_[\]])/g, "\\$1");
}

export function serializeInlineNodes(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      let value = escapeMarkdownText(node.text);
      if (node.bold) value = `**${value}**`;
      if (node.italic) value = `*${value}*`;
      if (node.link) value = `[${value}](${node.link})`;
      return value;
    })
    .join("");
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMarkdownText(node.textContent ?? "");
  }
  if (!(node instanceof HTMLElement)) return "";
  if (node.dataset.wedraftDecoration === "true") return "";
  if (node.tagName === "BR") return "\n";

  const contents = Array.from(node.childNodes)
    .map(serializeNode)
    .join("");
  if (node.matches("strong, b")) return `**${contents}**`;
  if (node.matches("em, i")) return `*${contents}*`;
  if (node.matches("a")) {
    const href = node.getAttribute("href") ?? "";
    return /^https?:\/\//i.test(href)
      ? `[${contents}](${href})`
      : contents;
  }
  return contents;
}

export function serializeEditableInline(element: HTMLElement): string {
  return Array.from(element.childNodes)
    .map(serializeNode)
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function sourceRangeIsUnique(
  sourceMap: ArticleSourceRange[],
  blockIndex: number,
): boolean {
  const range = sourceMap.find((item) => item.blockIndex === blockIndex);
  if (!range) return false;
  return sourceMap.filter(
    (item) =>
      item.startLine === range.startLine && item.endLine === range.endLine,
  ).length === 1;
}

export function replaceMarkdownSourceRange(
  markdown: string,
  sourceMap: ArticleSourceRange[],
  blockIndex: number,
  replacement: string,
): string {
  const range = sourceMap.find((item) => item.blockIndex === blockIndex);
  if (!range) return markdown;
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  lines.splice(
    range.startLine - 1,
    range.endLine - range.startLine + 1,
    ...replacement.split("\n"),
  );
  return lines.join("\n");
}

function heading2Prefix(block: Extract<ArticleBlock, { type: "heading" }>) {
  const original = block.children.map((node) => node.text).join("");
  return original.match(/^\s*(\d+[.．、])\s*/)?.[1] ?? "";
}

function tableDivider(
  align: "left" | "center" | "right" | null | undefined,
): string {
  if (align === "center") return ":---:";
  if (align === "right") return "---:";
  if (align === "left") return ":---";
  return "---";
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

export function markdownForPreviewEdit(
  block: ArticleBlock,
  target: HTMLElement,
  blockRoot: HTMLElement,
): string | null {
  const kind = target.dataset.wedraftEditKind;
  const value = serializeEditableInline(target);

  if (block.type === "paragraph" && kind === "paragraph") return value;
  if (block.type === "quote" && kind === "quote") return `> ${value}`;
  if (block.type === "heading" && kind === "heading") {
    if (block.level === 3) return `### ${value}`;
    const prefix = heading2Prefix(block);
    return `## ${prefix ? `${prefix} ` : ""}${value}`;
  }
  if (block.type === "list" && kind === "list-item") {
    const items = Array.from(
      blockRoot.querySelectorAll<HTMLElement>("li[data-wedraft-edit-kind]"),
    ).map(serializeEditableInline);
    return items
      .map((item, index) =>
        block.ordered ? `${index + 1}. ${item}` : `- ${item}`,
      )
      .join("\n");
  }
  if (block.type === "table" && kind === "table-cell") {
    const rows = Array.from(blockRoot.querySelectorAll("tr")).map((row) =>
      Array.from(row.querySelectorAll<HTMLElement>("th, td")).map((cell) =>
        escapeTableCell(serializeEditableInline(cell)),
      ),
    );
    if (!rows.length) return null;
    const width = Math.max(block.header.length, rows[0]?.length ?? 0);
    const normalizeRow = (row: string[]) =>
      `| ${Array.from({ length: width }, (_, index) => row[index] ?? "").join(" | ")} |`;
    return [
      normalizeRow(rows[0] ?? []),
      normalizeRow(
        Array.from({ length: width }, (_, index) =>
          tableDivider(block.align[index]),
        ),
      ),
      ...rows.slice(1).map(normalizeRow),
    ].join("\n");
  }
  if (block.type === "references" && kind === "reference-item") {
    const items = Array.from(
      blockRoot.querySelectorAll<HTMLElement>(
        '[data-wedraft-edit-kind="reference-item"]',
      ),
    ).map(serializeEditableInline);
    return [
      `## ${block.title}`,
      "",
      ...items.map((item, index) => `${index + 1}. ${item}`),
    ].join("\n");
  }
  return null;
}
