import { documentPlainText } from "@wedraft/article-model";
import { parseArticleWithSourceMap } from "@wedraft/article-parser";
import type { ContentIssue } from "@wedraft/shared-types";
import { hasBlockingIssues, validateArticle } from "@wedraft/validation";
import { availableTemplates, renderWechatHtml } from "@wedraft/wechat-renderer";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { z } from "zod";
import { assetDataUrl, assetSchema, MAX_ASSETS, MAX_SOURCE_LENGTH, validateAssets } from "./assets.js";

export * from "./assets.js";
export * from "./bundle.js";

export const ENGINE_VERSION = "0.1.0";
export const TEMPLATE_VERSION = "builtin-1";
export const DEFAULT_TEMPLATE_ID = "next-edition";

export const articleInputSchema = z.strictObject({
  markdown: z.string().max(MAX_SOURCE_LENGTH),
  templateId: z.string().max(80).default(DEFAULT_TEMPLATE_ID),
  templateVersion: z.string().max(80).optional(),
  author: z.string().max(100).default(""),
  digest: z.string().max(1000).default(""),
  sourceUrl: z.union([z.literal(""), z.url().refine((value) => /^https?:\/\//i.test(value))]).default(""),
  assets: z.array(assetSchema).max(MAX_ASSETS).default([]),
});
export type ArticleInput = z.input<typeof articleInputSchema>;
export type PortableArticle = z.output<typeof articleInputSchema>;
export type LocatedIssue = ContentIssue & { startLine?: number; endLine?: number };

export function listTemplates() {
  return availableTemplates.map((template) => ({
    id: template.id, name: template.name, version: TEMPLATE_VERSION,
    default: template.id === DEFAULT_TEMPLATE_ID, target: "wechat" as const,
  }));
}

type SyntaxNode = {
  type: string; depth?: number; start?: number | null; checked?: boolean | null; url?: string;
  children?: SyntaxNode[]; position?: { start: { line: number }; end: { line: number } };
};

function unsupportedMarkdown(markdown: string): LocatedIssue[] {
  const root = unified().use(remarkParse).use(remarkGfm).parse(markdown) as SyntaxNode;
  const issues: LocatedIssue[] = [];
  const visit = (node: SyntaxNode, parents: string[]) => {
    let message: string | undefined;
    if (["html", "delete", "imageReference", "linkReference", "footnoteDefinition", "footnoteReference"].includes(node.type)) {
      message = "这段 Markdown 包含暂不支持的 HTML、删除线、脚注或引用式链接；请改成普通正文或内联链接后再导出。";
    } else if (node.type === "list" && parents.includes("list")) {
      message = "暂不支持嵌套列表，请展开成独立段落，避免层级丢失。";
    } else if (node.type === "list" && node.start != null && node.start !== 1) {
      message = "有序列表请从 1 开始，当前模板不保留自定义起始编号。";
    } else if (node.type === "listItem" && (node.checked != null || (node.children?.length ?? 0) > 1)) {
      message = "暂不支持任务列表或包含多个区块的列表项，请改为普通列表。";
    } else if (node.type === "blockquote" && (node.children?.length !== 1 || node.children[0]?.type !== "paragraph")) {
      message = "引用暂只支持单个正文段落，请把列表、代码或多段内容移到引用之外。";
    } else if (node.type === "image" && (parents.includes("list") || parents.includes("blockquote"))) {
      message = "图片需要单独放在正文段落中，不能嵌入列表或引用。";
    } else if (node.type === "paragraph" && node.children?.some((child) => child.type === "image") &&
      node.children.some((child) => child.type !== "image")) {
      message = "图片请独占一段，避免图片与同行文字的顺序改变。";
    } else if (node.type === "link" && !/^https?:\/\//i.test(node.url ?? "")) {
      message = "正文链接仅支持 http 和 https，请修正这个链接。";
    }
    if (message) issues.push({
      code: "UNSUPPORTED_MARKDOWN", level: "blocking", message,
      ...(node.position ? { startLine: node.position.start.line, endLine: node.position.end.line } : {}),
    });
    if (node.type === "heading" && (node.depth ?? 0) > 3) issues.push({
      code: "HEADING_DEPTH", level: "warning", message: "四级及以下标题会使用三级标题样式。",
      ...(node.position ? { startLine: node.position.start.line, endLine: node.position.end.line } : {}),
    });
    for (const child of node.children ?? []) visit(child, [...parents, node.type]);
  };
  visit(root, []);
  return issues;
}

/** Pure operation: no filesystem, clipboard, network, storage, or model call. */
export function renderArticle(rawInput: ArticleInput) {
  const input = articleInputSchema.parse(rawInput);
  const template = availableTemplates.find((candidate) => candidate.id === input.templateId);
  if (!template) throw new Error(`未知模板：${input.templateId}。请先调用 list_templates。`);
  if (input.templateVersion && input.templateVersion !== TEMPLATE_VERSION) {
    throw new Error(`模板版本不兼容：${input.templateVersion}；当前支持 ${TEMPLATE_VERSION}。`);
  }
  const assets = validateAssets(input.assets);
  const parsed = parseArticleWithSourceMap(input.markdown, {
    contentType: "markdown", author: input.author, digest: input.digest,
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
  });
  const resolved = new Set<number>();
  const imageIssues: ContentIssue[] = [];
  parsed.document.blocks.forEach((block, blockIndex) => {
    if (block.type !== "image" || !block.localPath) return;
    const asset = assets.get(block.localPath);
    if (asset) {
      block.previewUrl = assetDataUrl(asset);
      resolved.add(blockIndex);
    } else imageIssues.push({ code: "ASSET_MISSING", level: "blocking", blockIndex,
      message: `缺少图片 ${block.localPath}。请提供该图片，或导入包含图片的文章包。` });
  });
  const issues: LocatedIssue[] = [
    ...validateArticle({ document: parsed.document }).filter((issue) =>
      !(issue.code === "LOCAL_IMAGE" && resolved.has(issue.blockIndex ?? -1))),
    ...imageIssues,
  ].map((issue) => {
    const range = parsed.sourceMap.find((source) => source.blockIndex === issue.blockIndex);
    return { ...issue, ...(range ? { startLine: range.startLine, endLine: range.endLine } : {}) };
  });
  issues.push(...unsupportedMarkdown(input.markdown));
  const previewHtml = renderWechatHtml(parsed.document, template);
  const html = previewHtml.replace(/\sdata-wedraft-(?:block-index|image-id)="[^"]*"/g, "");
  const status = hasBlockingIssues(issues) ? "blocked" as const : "ready" as const;
  return {
    schemaVersion: 1 as const, engineVersion: ENGINE_VERSION,
    template: { id: template.id, name: template.name, version: TEMPLATE_VERSION },
    status, document: parsed.document, sourceMap: parsed.sourceMap, issues,
    html: status === "ready" ? html : null,
    plainText: documentPlainText(parsed.document), previewHtml,
  };
}

export function validateInput(input: ArticleInput) {
  const { status, issues, template, engineVersion } = renderArticle(input);
  return { status, issues, template, engineVersion };
}

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function createPreviewHtml(result: ReturnType<typeof renderArticle>): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(result.document.title)}</title><style>body{margin:0;background:#f5f4ef;color:#24342f;font-family:system-ui,sans-serif}main{max-width:677px;margin:24px auto;background:white;padding:28px;box-sizing:border-box}h1{font-size:26px;line-height:1.5}aside{padding:12px;background:#f8ebe3;font-size:14px;margin-bottom:24px}img{max-width:100%}@media(max-width:720px){main{margin:0;padding:24px 20px}}</style></head><body><main>${result.status === "blocked" ? "<aside>这篇文章仍有阻断问题。预览仅供检查，请修正后再复制。</aside>" : ""}<h1>${escapeHtml(result.document.title)}</h1>${result.previewHtml}</main></body></html>`;
}
