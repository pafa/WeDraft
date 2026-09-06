import type {
  BlockContent,
  DefinitionContent,
  Image,
  Link,
  ListItem,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  Text,
} from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import TurndownService from "turndown";
import { unified } from "unified";

import { inlineText, normalizeDocument } from "@wedraft/article-model";
import type {
  ArticleBlock,
  ArticleDocument,
  InlineNode,
} from "@wedraft/shared-types";

export type ParseArticleOptions = {
  title?: string;
  author?: string;
  digest?: string;
  sourceUrl?: string;
  contentType?: "auto" | "markdown" | "html" | "plain";
};

export type ArticleSourceRange = {
  blockIndex: number;
  startLine: number;
  endLine: number;
};

export type ParsedArticleWithSourceMap = {
  document: ArticleDocument;
  sourceMap: ArticleSourceRange[];
};

function looksLikeHtml(input: string): boolean {
  return /<(?:p|div|h[1-6]|blockquote|ul|ol|li|strong|em|img|br|pre|code)\b/i.test(
    input,
  );
}

export function htmlToMarkdown(html: string): string {
  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  turndown.remove(["script", "style", "iframe", "form", "object"]);
  turndown.addRule("wordNoise", {
    filter: (node) =>
      node.nodeName === "O:P" ||
      node.nodeName === "META" ||
      node.nodeName === "LINK",
    replacement: () => "",
  });
  return turndown.turndown(html).replace(/\n{3,}/g, "\n\n").trim();
}

function mergeInlineNodes(nodes: InlineNode[]): InlineNode[] {
  const merged: InlineNode[] = [];
  for (const node of nodes) {
    if (!node.text) continue;
    const previous = merged.at(-1);
    if (
      previous &&
      previous.bold === node.bold &&
      previous.italic === node.italic &&
      previous.link === node.link
    ) {
      previous.text += node.text;
    } else {
      merged.push({ ...node });
    }
  }
  return merged;
}

type InlineMarks = Pick<InlineNode, "bold" | "italic" | "link">;

const LITERAL_STRONG_PATTERN =
  /(?<!\*)\*\*([^\s*\n](?:[^*\n]*?[^\s*\n])?)\*\*(?!\*)/gu;

function inlineFromText(
  node: Text,
  marks: InlineMarks,
  markdownSource?: string,
): InlineNode[] {
  const startOffset = node.position?.start.offset;
  const endOffset = node.position?.end.offset;
  const rawSource =
    markdownSource !== undefined &&
    startOffset !== undefined &&
    endOffset !== undefined
      ? markdownSource.slice(startOffset, endOffset)
      : undefined;

  // CommonMark leaves some adjacent emphasis markers literal, for example
  // `增长**18%**继续`. WeDraft treats an unescaped, balanced pair as an
  // explicit bold request so Chinese prose does not need visible extra spaces.
  // Comparing raw source with decoded text keeps `\*\*literal\*\*` literal.
  if (rawSource !== node.value || !node.value.includes("**")) {
    return [{ text: node.value, ...marks }];
  }

  const result: InlineNode[] = [];
  let cursor = 0;
  for (const match of node.value.matchAll(LITERAL_STRONG_PATTERN)) {
    const matchIndex = match.index;
    const value = match[1];
    if (matchIndex === undefined || !value) continue;
    if (matchIndex > cursor) {
      result.push({ text: node.value.slice(cursor, matchIndex), ...marks });
    }
    result.push({ text: value, ...marks, bold: true });
    cursor = matchIndex + match[0].length;
  }
  if (cursor === 0) return [{ text: node.value, ...marks }];
  if (cursor < node.value.length) {
    result.push({ text: node.value.slice(cursor), ...marks });
  }
  return result;
}

function inlineFromNodes(
  nodes: PhrasingContent[],
  marks: InlineMarks = {},
  markdownSource?: string,
): InlineNode[] {
  const result: InlineNode[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        result.push(...inlineFromText(node, marks, markdownSource));
        break;
      case "strong":
        result.push(
          ...inlineFromNodes(
            node.children,
            { ...marks, bold: true },
            markdownSource,
          ),
        );
        break;
      case "emphasis":
        result.push(
          ...inlineFromNodes(
            node.children,
            { ...marks, italic: true },
            markdownSource,
          ),
        );
        break;
      case "link": {
        const link = node as Link;
        const safeLink = /^https?:\/\//i.test(link.url) ? link.url : undefined;
        result.push(
          ...inlineFromNodes(
            link.children,
            {
              ...marks,
              ...(safeLink ? { link: safeLink } : {}),
            },
            markdownSource,
          ),
        );
        break;
      }
      case "inlineCode":
        result.push({ text: node.value, ...marks });
        break;
      case "break":
        result.push({ text: "\n", ...marks });
        break;
      case "delete":
        result.push(...inlineFromNodes(node.children, marks, markdownSource));
        break;
      case "image":
        result.push({ text: node.alt ?? "", ...marks });
        break;
      case "html":
        break;
      default:
        break;
    }
  }
  return mergeInlineNodes(result);
}

function inlineFromBlock(
  node: BlockContent | DefinitionContent,
  markdownSource?: string,
): InlineNode[] {
  if ("children" in node) {
    return inlineFromNodes(
      node.children as PhrasingContent[],
      {},
      markdownSource,
    );
  }
  if ("value" in node) {
    return inlineFromNodes([
      { type: "text", value: String(node.value) } as PhrasingContent,
    ]);
  }
  return [];
}

function listItemInline(item: ListItem, markdownSource: string): InlineNode[] {
  return mergeInlineNodes(
    item.children.flatMap((child) => inlineFromBlock(child, markdownSource)),
  );
}

function imageBlock(image: Image, index: number): ArticleBlock {
  const isRemote = /^https?:\/\//i.test(image.url);
  return {
    type: "image",
    id: `image-${String(index + 1)}`,
    ...(isRemote ? { remoteUrl: image.url } : { localPath: image.url }),
    ...(image.alt ? { alt: image.alt } : {}),
    ...(image.title ? { caption: image.title } : {}),
  };
}

function blocksFromNode(
  node: RootContent,
  imageIndex: { value: number },
  markdownSource: string,
): ArticleBlock[] {
  switch (node.type) {
    case "paragraph": {
      const images = node.children.filter(
        (child): child is Image => child.type === "image",
      );
      const textChildren = node.children.filter(
        (child) => child.type !== "image",
      );
      const blocks: ArticleBlock[] = [];
      const inline = inlineFromNodes(textChildren, {}, markdownSource);
      if (inline.some((child) => child.text.trim())) {
        blocks.push({ type: "paragraph", children: inline });
      }
      for (const image of images) {
        blocks.push(imageBlock(image, imageIndex.value));
        imageIndex.value += 1;
      }
      return blocks;
    }
    case "heading":
      return [
        {
          type: "heading",
          level: node.depth <= 2 ? 2 : 3,
          children: inlineFromNodes(node.children, {}, markdownSource),
        },
      ];
    case "blockquote":
      return [
        {
          type: "quote",
          children: mergeInlineNodes(
            node.children.flatMap((child) =>
              inlineFromBlock(child, markdownSource),
            ),
          ),
        },
      ];
    case "list":
      return [
        {
          type: "list",
          ordered: Boolean(node.ordered),
          items: node.children.map((item) =>
            listItemInline(item, markdownSource),
          ),
        },
      ];
    case "thematicBreak":
      return [{ type: "divider" }];
    case "code":
      return [
        {
          type: "code",
          code: node.value,
          ...(node.lang ? { language: node.lang } : {}),
        },
      ];
    case "table": {
      const table = node as Table;
      const [headerRow, ...bodyRows] = table.children;
      if (!headerRow) return [];
      return [
        {
          type: "table",
          header: headerRow.children.map((cell) =>
            inlineFromNodes(cell.children, {}, markdownSource),
          ),
          rows: bodyRows.map((row) =>
            row.children.map((cell) =>
              inlineFromNodes(cell.children, {}, markdownSource),
            ),
          ),
          align: (table.align ?? headerRow.children.map(() => null)).map(
            (alignment) => alignment ?? null,
          ),
        },
      ];
    }
    case "html":
      return [];
    default:
      return [];
  }
}

type BlockEntry = {
  block: ArticleBlock;
  startLine: number;
  endLine: number;
};

function combineReferenceBlocks(entries: BlockEntry[]): BlockEntry[] {
  const combined: BlockEntry[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    const nextEntry = entries[index + 1];
    const block = entry.block;
    const next = nextEntry?.block;
    if (
      block?.type === "heading" &&
      next?.type === "list" &&
      /^(?:参考来源|参考资料|资料来源|references)$/i.test(
        block.children.map((child) => child.text).join("").trim(),
      ) &&
      nextEntry
    ) {
      combined.push({
        block: {
          type: "references",
          title: block.children.map((child) => child.text).join("").trim(),
          items: next.items,
        },
        startLine: entry.startLine,
        endLine: nextEntry.endLine,
      });
      index += 1;
      continue;
    }
    if (entry) combined.push(entry);
  }
  return combined;
}

function blockHasContent(block: ArticleBlock): boolean {
  if (block.type === "divider" || block.type === "image") return true;
  if (block.type === "code") return block.code.trim().length > 0;
  if (block.type === "references") {
    return block.items.some((item) => inlineText(item).trim().length > 0);
  }
  if (block.type === "table") {
    return [block.header, ...block.rows].some((row) =>
      row.some((cell) => inlineText(cell).trim().length > 0),
    );
  }
  if (block.type === "list") {
    return block.items.some((item) => inlineText(item).trim().length > 0);
  }
  return inlineText(block.children).trim().length > 0;
}

const BOLD_BOUNDARY = "<!--wedraft-bold-boundary-->";
const MARKDOWN_PUNCTUATION = /[\p{P}\p{S}]/u;

function isEscapedAt(source: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function excludedStrongRanges(root: Root): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const visit = (node: RootContent | PhrasingContent | Root): void => {
    if (
      node.type === "code" ||
      node.type === "inlineCode" ||
      node.type === "html" ||
      node.type === "image" ||
      node.type === "link" ||
      node.type === "definition"
    ) {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) ranges.push([start, end]);
      return;
    }
    if ("children" in node) {
      for (const child of node.children) {
        visit(child as RootContent | PhrasingContent);
      }
    }
  };
  visit(root);
  return ranges;
}

function normalizeAdjacentStrong(markdown: string, initialRoot: Root): string {
  const excluded = excludedStrongRanges(initialRoot);
  const insertions: Array<{ index: number; value: string }> = [];

  for (const match of markdown.matchAll(LITERAL_STRONG_PATTERN)) {
    const start = match.index;
    const content = match[1];
    if (start === undefined || !content) continue;
    const end = start + match[0].length;
    const closingStart = end - 2;
    if (isEscapedAt(markdown, start) || isEscapedAt(markdown, closingStart)) {
      continue;
    }
    if (excluded.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart)) {
      continue;
    }

    const before = markdown[start - 1] ?? "\n";
    const first = content[0] ?? "";
    const last = content.at(-1) ?? "";
    const after = markdown[end] ?? "\n";
    const canOpen =
      !/\s/u.test(first) &&
      (!MARKDOWN_PUNCTUATION.test(first) ||
        /\s/u.test(before) ||
        MARKDOWN_PUNCTUATION.test(before));
    const canClose =
      !/\s/u.test(last) &&
      (!MARKDOWN_PUNCTUATION.test(last) ||
        /\s/u.test(after) ||
        MARKDOWN_PUNCTUATION.test(after));
    if (canOpen && canClose) continue;

    insertions.push(
      { index: start, value: BOLD_BOUNDARY },
      { index: end, value: BOLD_BOUNDARY },
    );
  }

  return insertions
    .sort((left, right) => right.index - left.index)
    .reduce(
      (source, insertion) =>
        `${source.slice(0, insertion.index)}${insertion.value}${source.slice(insertion.index)}`,
      markdown,
    );
}

function rootFromMarkdown(markdown: string): Root {
  return unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
}

function splitFirstLine(markdown: string): {
  title: string;
  body: string;
  titleLine: number;
  bodyStartLine: number;
} {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  const firstIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstIndex < 0) {
    return { title: "", body: "", titleLine: 1, bodyStartLine: 1 };
  }
  const sourceTitle = lines[firstIndex]?.trim() ?? "";
  const title = sourceTitle
    .replace(/^#{1,6}\s*/, "")
    .replace(/^>\s*/, "")
    .replace(/^(?:[-+*]|\d+[.)])\s+/, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
  return {
    title,
    body: lines.slice(firstIndex + 1).join("\n"),
    titleLine: firstIndex + 1,
    bodyStartLine: firstIndex + 2,
  };
}

function titleAndBody(
  markdown: string,
  explicitTitle: string,
): {
  title: string;
  body: string;
  titleLine: number;
  bodyStartLine: number;
} {
  if (explicitTitle) {
    return {
      title: explicitTitle,
      body: markdown,
      titleLine: 1,
      bodyStartLine: 1,
    };
  }
  return splitFirstLine(markdown);
}

export function parseArticleWithSourceMap(
  input: string,
  options: ParseArticleOptions = {},
): ParsedArticleWithSourceMap {
  const normalizedInput = input.replace(/\r\n?/g, "\n");
  const useHtml =
    options.contentType === "html" ||
    (options.contentType !== "markdown" &&
      options.contentType !== "plain" &&
      looksLikeHtml(normalizedInput));
  const markdown = useHtml ? htmlToMarkdown(normalizedInput) : normalizedInput;
  const split = titleAndBody(markdown, options.title?.trim() ?? "");
  const initialRoot = rootFromMarkdown(split.body);
  const parsedBody = normalizeAdjacentStrong(split.body, initialRoot);
  const root =
    parsedBody === split.body ? initialRoot : rootFromMarkdown(parsedBody);
  const children = [...root.children];

  const imageIndex = { value: 0 };
  const entries = combineReferenceBlocks(
    children.flatMap((node) => {
      const startLine =
        split.bodyStartLine + (node.position?.start.line ?? 1) - 1;
      const endLine =
        split.bodyStartLine + (node.position?.end.line ?? 1) - 1;
      return blocksFromNode(node, imageIndex, parsedBody).map((block) => ({
        block,
        startLine,
        endLine,
      }));
    }),
  ).filter((entry) => blockHasContent(entry.block));
  const document = normalizeDocument({
    title: split.title,
    author: options.author ?? "",
    digest: options.digest ?? "",
    ...(options.sourceUrl ? { sourceUrl: options.sourceUrl } : {}),
    blocks: entries.map((entry) => entry.block),
  });
  const sourceMap: ArticleSourceRange[] = entries.map((entry, blockIndex) => ({
    blockIndex,
    startLine: entry.startLine,
    endLine: entry.endLine,
  }));
  sourceMap.unshift({
    blockIndex: -1,
    startLine: split.titleLine,
    endLine: split.titleLine,
  });
  return { document, sourceMap };
}

export function parseArticle(
  input: string,
  options: ParseArticleOptions = {},
): ArticleDocument {
  return parseArticleWithSourceMap(input, options).document;
}
