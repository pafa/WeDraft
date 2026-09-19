export type MarkdownShortcut =
  | "heading1"
  | "heading2"
  | "bold"
  | "quote"
  | "unordered-list"
  | "ordered-list"
  | "inline-code"
  | "code-block"
  | "table"
  | "divider"
  | "image"
  | "note"
  | "references";

export type MarkdownShortcutResult = {
  markdown: string;
  selectionStart: number;
  selectionEnd: number;
};

function replaceRange(
  markdown: string,
  start: number,
  end: number,
  replacement: string,
  innerStart = 0,
  innerEnd = replacement.length,
): MarkdownShortcutResult {
  return {
    markdown: `${markdown.slice(0, start)}${replacement}${markdown.slice(end)}`,
    selectionStart: start + innerStart,
    selectionEnd: start + innerEnd,
  };
}

function selectedLineRange(
  markdown: string,
  start: number,
  end: number,
): { start: number; end: number; text: string } {
  const lineStart = markdown.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const effectiveEnd = end > start ? end - 1 : end;
  const nextBreak = markdown.indexOf("\n", effectiveEnd);
  const lineEnd = nextBreak < 0 ? markdown.length : nextBreak;
  return {
    start: lineStart,
    end: lineEnd,
    text: markdown.slice(lineStart, lineEnd),
  };
}

function toggleInlineMarkup(
  markdown: string,
  start: number,
  end: number,
  marker: string,
  placeholder: string,
): MarkdownShortcutResult {
  const selected = markdown.slice(start, end);
  if (selected) {
    if (
      selected.startsWith(marker) &&
      selected.endsWith(marker) &&
      selected.length >= marker.length * 2
    ) {
      const inner = selected.slice(marker.length, -marker.length);
      return replaceRange(markdown, start, end, inner, 0, inner.length);
    }
    if (
      markdown.slice(start - marker.length, start) === marker &&
      markdown.slice(end, end + marker.length) === marker
    ) {
      return replaceRange(
        markdown,
        start - marker.length,
        end + marker.length,
        selected,
        0,
        selected.length,
      );
    }
    const replacement = `${marker}${selected}${marker}`;
    return replaceRange(
      markdown,
      start,
      end,
      replacement,
      marker.length,
      marker.length + selected.length,
    );
  }

  const range = selectedLineRange(markdown, start, end);
  const relativeCursor = start - range.start;
  const beforeCursor = range.text.slice(0, relativeCursor);
  const opening = beforeCursor.lastIndexOf(marker);
  const closing =
    opening >= 0
      ? range.text.indexOf(marker, Math.max(relativeCursor, opening + marker.length))
      : -1;
  if (opening >= 0 && closing >= 0) {
    const inner = range.text.slice(opening + marker.length, closing);
    return replaceRange(
      markdown,
      range.start + opening,
      range.start + closing + marker.length,
      inner,
      0,
      inner.length,
    );
  }

  const replacement = `${marker}${placeholder}${marker}`;
  return replaceRange(
    markdown,
    start,
    end,
    replacement,
    marker.length,
    marker.length + placeholder.length,
  );
}

function transformLineBlock(
  markdown: string,
  start: number,
  end: number,
  placeholder: string,
  isActive: (line: string) => boolean,
  enable: (line: string, index: number) => string,
  disable: (line: string) => string,
): MarkdownShortcutResult {
  const range = selectedLineRange(markdown, start, end);
  const lines = range.text.split("\n");
  const contentLines = lines.filter((line) => line.trim());
  if (contentLines.length === 0) {
    return replaceRange(
      markdown,
      range.start,
      range.end,
      placeholder,
      0,
      placeholder.length,
    );
  }
  const shouldDisable = contentLines.every(isActive);
  let contentIndex = 0;
  const replacement = lines
    .map((line) => {
      if (!line.trim()) return line;
      const transformed = shouldDisable
        ? disable(line)
        : enable(line, contentIndex);
      contentIndex += 1;
      return transformed;
    })
    .join("\n");
  return replaceRange(
    markdown,
    range.start,
    range.end,
    replacement,
    0,
    replacement.length,
  );
}

function cleanHeading(line: string): string {
  return line.replace(/^#{1,6}\s*/, "").trim();
}

function cleanHeading1(line: string): string {
  return cleanHeading(line).replace(/^\d+[.．、]\s*/, "");
}

function nextHeadingNumber(markdown: string, before: number): number {
  const matches = [
    ...markdown
      .slice(0, before)
      .matchAll(/^##\s+(\d+)[.．、]\s+/gm),
  ];
  const latest = matches.at(-1)?.[1];
  return latest ? Number.parseInt(latest, 10) + 1 : 1;
}

function toggleHeadingLines(
  markdown: string,
  start: number,
  end: number,
  level: 1 | 2,
): MarkdownShortcutResult {
  const range = selectedLineRange(markdown, start, end);
  const lines = range.text.split("\n");
  const targetPrefix = level === 1 ? "##" : "###";
  const contentLines = lines.filter((line) => line.trim());
  if (contentLines.length === 0) {
    const placeholder =
      level === 1 ? "## 1. 章节标题" : "### 二级章节标题";
    return replaceRange(
      markdown,
      range.start,
      range.end,
      placeholder,
      0,
      placeholder.length,
    );
  }
  const isTargetHeading = contentLines.every(
    (line) => line.match(/^\s*(#{1,6})\s+/)?.[1] === targetPrefix,
  );
  let headingNumber = nextHeadingNumber(markdown, range.start);

  const replacement = lines
    .map((line) => {
      if (!line.trim()) return line;
      if (isTargetHeading) {
        return level === 1 ? cleanHeading1(line) : cleanHeading(line);
      }
      const text = cleanHeading1(line);
      if (level === 2) return `### ${text}`;
      const transformed = `## ${headingNumber}. ${text}`;
      headingNumber += 1;
      return transformed;
    })
    .join("\n");

  return replaceRange(
    markdown,
    range.start,
    range.end,
    replacement,
    0,
    replacement.length,
  );
}

function findCodeFence(
  markdown: string,
  cursor: number,
): { start: number; end: number; content: string } | null {
  const fences = [...markdown.matchAll(/^```[^\n]*$/gm)];
  for (let index = 0; index + 1 < fences.length; index += 2) {
    const opening = fences[index];
    const closing = fences[index + 1];
    if (!opening || !closing) continue;
    if (
      opening.index === undefined ||
      closing.index === undefined ||
      cursor < opening.index ||
      cursor > closing.index + closing[0].length
    ) {
      continue;
    }
    const openingEnd = opening.index + opening[0].length;
    const contentStart =
      markdown[openingEnd] === "\n" ? openingEnd + 1 : openingEnd;
    const rawContent = markdown.slice(contentStart, closing.index);
    return {
      start: opening.index,
      end: closing.index + closing[0].length,
      content: rawContent.endsWith("\n")
        ? rawContent.slice(0, -1)
        : rawContent,
    };
  }
  return null;
}

function toggleCodeBlock(
  markdown: string,
  start: number,
  end: number,
): MarkdownShortcutResult {
  const fence = findCodeFence(markdown, start);
  if (fence) {
    return replaceRange(
      markdown,
      fence.start,
      fence.end,
      fence.content,
      0,
      fence.content.length,
    );
  }
  const range = selectedLineRange(markdown, start, end);
  const content = range.text || "代码内容";
  const replacement = `\`\`\`text\n${content}\n\`\`\``;
  return replaceRange(
    markdown,
    range.start,
    range.end,
    replacement,
    8,
    8 + content.length,
  );
}

function toggleDivider(
  markdown: string,
  start: number,
  end: number,
): MarkdownShortcutResult {
  const range = selectedLineRange(markdown, start, end);
  if (/^\s*(?:---|\*\*\*|___)\s*$/.test(range.text)) {
    return replaceRange(markdown, range.start, range.end, "", 0, 0);
  }
  if (!range.text.trim()) {
    return replaceRange(markdown, range.start, range.end, "---", 0, 3);
  }
  const replacement = `${range.text}\n\n---\n`;
  return replaceRange(
    markdown,
    range.start,
    range.end,
    replacement,
    replacement.length - 3,
    replacement.length,
  );
}

function insertImage(
  markdown: string,
  start: number,
  end: number,
): MarkdownShortcutResult {
  const selected = markdown.slice(start, end) || "图片说明";
  const opening = "![";
  const closing = '](图片地址 "图片来源：来源名称")';
  const replacement = `${opening}${selected}${closing}`;
  return replaceRange(
    markdown,
    start,
    end,
    replacement,
    opening.length,
    opening.length + selected.length,
  );
}

function insertTable(
  markdown: string,
  start: number,
  end: number,
): MarkdownShortcutResult {
  const selected = markdown.slice(start, end).trim();
  const selectedRows = selected
    .split(/\r?\n/)
    .map((line) => line.split("\t").map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));
  const canConvertSelection =
    selectedRows.length > 0 &&
    Math.max(...selectedRows.map((row) => row.length)) > 1;
  const columnCount = canConvertSelection
    ? Math.max(...selectedRows.map((row) => row.length))
    : 3;
  const escapeCell = (cell: string) => cell.replaceAll("|", "\\|");
  const row = (cells: string[]) =>
    `| ${Array.from({ length: columnCount }, (_, index) =>
      escapeCell(cells[index] ?? ""),
    ).join(" | ")} |`;
  const table = canConvertSelection
    ? [
        row(selectedRows[0] ?? []),
        row(Array.from({ length: columnCount }, () => ":---")),
        ...selectedRows.slice(1).map(row),
      ].join("\n")
    : [
        "| 项目 | 说明 | 数据 |",
        "| :--- | :--- | ---: |",
        "| 示例 A | 简洁描述 | 100 |",
        "| 示例 B | 简洁描述 | 80 |",
      ].join("\n");
  const before = markdown.slice(0, start);
  const after = markdown.slice(end);
  const leading = before
    ? before.endsWith("\n\n")
      ? ""
      : before.endsWith("\n")
        ? "\n"
        : "\n\n"
    : "";
  const trailing = after
    ? after.startsWith("\n\n")
      ? ""
      : after.startsWith("\n")
        ? "\n"
        : "\n\n"
    : "";
  const replacement = `${leading}${table}${trailing}`;
  return replaceRange(
    markdown,
    start,
    end,
    replacement,
    leading.length,
    leading.length + table.length,
  );
}

function insertReferences(
  markdown: string,
  start: number,
  end: number,
): MarkdownShortcutResult {
  const existing = markdown.match(/^## 参考来源\s*$/m);
  if (existing?.index !== undefined) {
    return {
      markdown,
      selectionStart: existing.index,
      selectionEnd: markdown.length,
    };
  }
  const selected = markdown.slice(start, end).trim();
  const items = selected
    ? selected
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map(
          (line, index) =>
            `${index + 1}. ${line.replace(/^\d+[.)]\s+/, "").trim()}`,
        )
        .join("\n")
    : "1. 来源名称或资料说明\n2. 来源名称或资料说明\n3. 来源名称或资料说明";
  const block = `## 参考来源\n\n${items}`;
  const withoutSelection = selected
    ? `${markdown.slice(0, start)}${markdown.slice(end)}`
    : markdown;
  const prefix = withoutSelection.trimEnd();
  const separator = prefix ? "\n\n" : "";
  return {
    markdown: `${prefix}${separator}${block}`,
    selectionStart: prefix.length + separator.length,
    selectionEnd: prefix.length + separator.length + block.length,
  };
}

export function applyMarkdownShortcut(
  markdown: string,
  start: number,
  end: number,
  shortcut: MarkdownShortcut,
): MarkdownShortcutResult {
  switch (shortcut) {
    case "heading1":
      return toggleHeadingLines(markdown, start, end, 1);
    case "heading2":
      return toggleHeadingLines(markdown, start, end, 2);
    case "bold":
      return toggleInlineMarkup(markdown, start, end, "**", "重点词");
    case "quote":
      return transformLineBlock(
        markdown,
        start,
        end,
        "> 引用内容",
        (line) => /^>\s?/.test(line),
        (line) => `> ${line.replace(/^>\s?/, "")}`,
        (line) => line.replace(/^>\s?/, ""),
      );
    case "unordered-list":
      return transformLineBlock(
        markdown,
        start,
        end,
        "- 列表内容",
        (line) => /^[-*+]\s+/.test(line),
        (line) =>
          `- ${line.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, "")}`,
        (line) => line.replace(/^[-*+]\s+/, ""),
      );
    case "ordered-list":
      return transformLineBlock(
        markdown,
        start,
        end,
        "1. 第一项\n2. 第二项\n3. 第三项",
        (line) => /^\d+[.)]\s+/.test(line),
        (line, index) =>
          `${index + 1}. ${line.replace(/^(?:\d+[.)]\s+|[-*+]\s+)/, "")}`,
        (line) => line.replace(/^\d+[.)]\s+/, ""),
      );
    case "inline-code":
      return toggleInlineMarkup(markdown, start, end, "`", "代码");
    case "code-block":
      return toggleCodeBlock(markdown, start, end);
    case "table":
      return insertTable(markdown, start, end);
    case "divider":
      return toggleDivider(markdown, start, end);
    case "image":
      return insertImage(markdown, start, end);
    case "note":
      return transformLineBlock(
        markdown,
        start,
        end,
        "说明：补充说明",
        (line) => /^说明[：:]\s*/.test(line),
        (line) =>
          `说明：${line.replace(/^(?:说明|数据来源|作者|编辑)[：:]\s*/, "")}`,
        (line) => line.replace(/^说明[：:]\s*/, ""),
      );
    case "references":
      return insertReferences(markdown, start, end);
  }
}

export function isMarkdownShortcutActive(
  markdown: string,
  start: number,
  end: number,
  shortcut: MarkdownShortcut,
): boolean {
  const range = selectedLineRange(markdown, start, end);
  const contentLines = range.text.split("\n").filter((line) => line.trim());
  switch (shortcut) {
    case "heading1":
      return (
        contentLines.length > 0 &&
        contentLines.every((line) => /^##\s+/.test(line))
      );
    case "heading2":
      return (
        contentLines.length > 0 &&
        contentLines.every((line) => /^###\s+/.test(line))
      );
    case "quote":
      return (
        contentLines.length > 0 &&
        contentLines.every((line) => /^>\s?/.test(line))
      );
    case "unordered-list":
      return (
        contentLines.length > 0 &&
        contentLines.every((line) => /^[-*+]\s+/.test(line))
      );
    case "ordered-list":
      return (
        contentLines.length > 0 &&
        contentLines.every((line) => /^\d+[.)]\s+/.test(line))
      );
    case "note":
      return (
        contentLines.length > 0 &&
        contentLines.every((line) => /^说明[：:]\s*/.test(line))
      );
    case "divider":
      return /^\s*(?:---|\*\*\*|___)\s*$/.test(range.text);
    case "code-block":
      return findCodeFence(markdown, start) !== null;
    case "bold":
    case "inline-code": {
      const marker = shortcut === "bold" ? "**" : "`";
      const selected = markdown.slice(start, end);
      if (
        selected.startsWith(marker) &&
        selected.endsWith(marker) &&
        selected.length >= marker.length * 2
      ) {
        return true;
      }
      if (
        selected &&
        markdown.slice(start - marker.length, start) === marker &&
        markdown.slice(end, end + marker.length) === marker
      ) {
        return true;
      }
      const relativeCursor = start - range.start;
      const opening = range.text
        .slice(0, relativeCursor)
        .lastIndexOf(marker);
      return (
        opening >= 0 &&
        range.text.indexOf(
          marker,
          Math.max(relativeCursor, opening + marker.length),
        ) >= 0
      );
    }
    case "references": {
      const existing = markdown.match(/^## 参考来源\s*$/m);
      return (
        existing?.index !== undefined &&
        start >= existing.index
      );
    }
    case "image":
    case "table":
      return false;
  }
}
