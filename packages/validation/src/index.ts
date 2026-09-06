import { documentPlainText, inlineText } from "@wedraft/article-model";
import type {
  ArticleDocument,
  ContentIssue,
} from "@wedraft/shared-types";

function cachedImageMetadata(localPath: string): {
  bytes: number | null;
  mimeType: string | null;
} {
  try {
    const url = new URL(localPath);
    const bytes = Number(url.searchParams.get("bytes"));
    return {
      bytes: Number.isFinite(bytes) && bytes > 0 ? bytes : null,
      mimeType: url.searchParams.get("mime"),
    };
  } catch {
    return { bytes: null, mimeType: null };
  }
}

function formatMiB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

export function validateArticle(input: {
  document: ArticleDocument;
}): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const text = documentPlainText(input.document);

  if (!input.document.title.trim()) {
    issues.push({
      code: "TITLE_EMPTY",
      level: "blocking",
      message: "第 1 行必须是文章标题。",
      blockIndex: -1,
    });
  }
  if (!text.trim()) {
    issues.push({
      code: "BODY_EMPTY",
      level: "blocking",
      message: "请从第 2 行开始填写正文。",
    });
  }
  if (!input.document.digest.trim()) {
    issues.push({
      code: "DIGEST_EMPTY",
      level: "warning",
      message: "摘要为空，将自动使用第一个有效段落。",
    });
  }
  if (text.trim().length > 0 && text.trim().length < 120) {
    issues.push({
      code: "BODY_SHORT",
      level: "warning",
      message: "正文较短，请确认内容是否完整。",
    });
  }

  input.document.blocks.forEach((block, blockIndex) => {
    if (block.type !== "image") return;
    if (
      block.localPath &&
      !block.localPath.startsWith("wedraft://image/")
    ) {
      issues.push({
        code: "LOCAL_IMAGE",
        level: "blocking",
        message: "这张本地图片无法读取，请删除后用“添加正文图片”重新添加。",
        blockIndex,
      });
    }
    if (!block.localPath && !block.remoteUrl) {
      issues.push({
        code: "IMAGE_SOURCE_MISSING",
        level: "blocking",
        message: "这张图片没有可读取的文件或网络地址，请删除后重新添加。",
        blockIndex,
      });
    }
    if (block.remoteUrl) {
      issues.push({
        code: "REMOTE_IMAGE",
        level: "warning",
        message: "这张图片来自外部网址，粘贴到公众号后请检查是否正常显示。",
        blockIndex,
      });
    }
    if (block.localPath?.startsWith("wedraft://image/")) {
      const metadata = cachedImageMetadata(block.localPath);
      const warningLimit = metadata.mimeType === "image/gif"
        ? 8 * 1024 * 1024
        : 5 * 1024 * 1024;
      if (metadata.bytes && metadata.bytes > warningLimit) {
        issues.push({
          code: "IMAGE_LARGE",
          level: "warning",
          message: metadata.mimeType === "image/gif"
            ? `这张 GIF 动图为 ${formatMiB(metadata.bytes)} MiB，为保留动画未压缩，粘贴后请重点检查。`
            : `这张图片为 ${formatMiB(metadata.bytes)} MiB，可能影响公众号粘贴稳定性。`,
          blockIndex,
        });
      }
    }
  });

  input.document.blocks.forEach((block, blockIndex) => {
    if (block.type !== "table") return;
    const columnCount = block.header.length;
    const maximumColumns = Math.max(
      columnCount,
      ...block.rows.map((row) => row.length),
    );
    if (maximumColumns > 4) {
      issues.push({
        code: "TABLE_TOO_WIDE",
        level: "warning",
        message: `这个表格有 ${maximumColumns} 列，手机端容易拥挤，建议收窄到 4 列以内。`,
        blockIndex,
      });
    }
    if (block.rows.some((row) => row.length !== columnCount)) {
      issues.push({
        code: "TABLE_INCONSISTENT",
        level: "blocking",
        message: "这个表格的正文列数与表头不一致，请补齐或删除多余单元格。",
        blockIndex,
      });
    }
    const longestCell = [block.header, ...block.rows]
      .flat()
      .map((cell) => inlineText(cell).trim().length)
      .reduce((maximum, length) => Math.max(maximum, length), 0);
    if (longestCell > 40) {
      issues.push({
        code: "TABLE_CELL_LONG",
        level: "warning",
        message: `这个表格有长达 ${longestCell} 字的单元格，手机端阅读较困难，建议改成短句。`,
        blockIndex,
      });
    }
  });

  const levelTwoHeadings = input.document.blocks
    .map((block, blockIndex) => ({ block, blockIndex }))
    .filter(({ block }) => block.type === "heading" && block.level === 2);
  levelTwoHeadings.forEach(({ block, blockIndex }, headingIndex) => {
    if (block.type !== "heading") return;
    const heading = inlineText(block.children).trim();
    const number = heading.match(/^(\d+)[.、]\s*/)?.[1];
    if (Number(number) !== headingIndex + 1) {
      issues.push({
        code: "SECTION_NUMBERING",
        level: "warning",
        message: `这个一级章节应使用连续编号“${headingIndex + 1}.”。`,
        blockIndex,
      });
    }
    if (input.document.blocks[blockIndex - 1]?.type !== "divider") {
      issues.push({
        code: "SECTION_DIVIDER_MISSING",
        level: "warning",
        message: "这个一级章节前缺少分隔线“---”。",
        blockIndex,
      });
    }
  });

  const referencesIndex = input.document.blocks.findIndex(
    (block) => block.type === "references",
  );
  if (
    referencesIndex >= 0 &&
    referencesIndex !== input.document.blocks.length - 1
  ) {
    issues.push({
      code: "REFERENCES_NOT_LAST",
      level: "warning",
      message: "“参考来源”必须是文章最后一个区块，请将后面的内容移到它之前。",
      blockIndex: referencesIndex,
    });
  }
  return issues;
}

const COPY_COMPATIBILITY_CODES = new Set([
  "REMOTE_IMAGE",
  "IMAGE_LARGE",
  "TABLE_TOO_WIDE",
  "TABLE_CELL_LONG",
  "SECTION_NUMBERING",
  "SECTION_DIVIDER_MISSING",
  "REFERENCES_NOT_LAST",
]);

export function copyPreflightIssues(issues: ContentIssue[]): ContentIssue[] {
  return issues.filter(
    (issue) =>
      issue.level === "blocking" || COPY_COMPATIBILITY_CODES.has(issue.code),
  );
}

export function hasBlockingIssues(issues: ContentIssue[]): boolean {
  return issues.some((issue) => issue.level === "blocking");
}
