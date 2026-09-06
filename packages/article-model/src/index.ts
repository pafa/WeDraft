import type {
  ArticleBlock,
  ArticleDocument,
  InlineNode,
} from "@wedraft/shared-types";

export function inlineText(children: InlineNode[]): string {
  return children.map((child) => child.text).join("");
}

export function blockText(block: ArticleBlock): string {
  if (block.type === "divider" || block.type === "image") {
    return "";
  }
  if (block.type === "code") {
    return block.code;
  }
  if (block.type === "references") {
    return [
      block.title,
      ...block.items.map(
        (item, index) => `${index + 1}. ${inlineText(item)}`,
      ),
    ].join("\n");
  }
  if (block.type === "table") {
    return [block.header, ...block.rows]
      .map((row) => row.map(inlineText).join("\t"))
      .join("\n");
  }
  if (block.type === "list") {
    return block.items.map(inlineText).join(" ");
  }
  return inlineText(block.children);
}

export function documentPlainText(document: ArticleDocument): string {
  return document.blocks.map(blockText).filter(Boolean).join("\n");
}

export function generateDigest(
  document: Pick<ArticleDocument, "blocks">,
  maxLength = 120,
): string {
  const paragraph = document.blocks
    .filter((block) => block.type === "paragraph" || block.type === "quote")
    .map(blockText)
    .map((text) => text.replace(/\s+/g, " ").trim())
    .find(Boolean);
  return (paragraph ?? "").slice(0, maxLength);
}

export function normalizeDocument(document: ArticleDocument): ArticleDocument {
  const blocks = document.blocks.filter((block) => {
    if (block.type === "divider" || block.type === "image") {
      return true;
    }
    if (block.type === "code") {
      return block.code.trim().length > 0;
    }
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
  });

  const normalized = {
    ...document,
    title: document.title.trim(),
    author: document.author.trim(),
    digest: document.digest.trim(),
    blocks,
  };

  return normalized.digest
    ? normalized
    : { ...normalized, digest: generateDigest(normalized) };
}
