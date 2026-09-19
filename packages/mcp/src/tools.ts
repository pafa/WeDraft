import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { articleInputSchema, ENGINE_VERSION, listTemplates, renderArticle, validateInput } from "@wedraft/core";
import { writeArticleArtifacts } from "@wedraft/cli/files";
import { mkdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const templateSchema = z.object({ id: z.string(), name: z.string(), version: z.string() });
const issueSchema = z.object({ code: z.string(), level: z.enum(["blocking", "warning", "info"]), message: z.string(), blockIndex: z.number().optional(), startLine: z.number().optional(), endLine: z.number().optional() });
const validationSchema = z.object({ status: z.enum(["ready", "blocked"]), issues: z.array(issueSchema), template: templateSchema, engineVersion: z.string() });
const readAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

function success<T extends Record<string, unknown>>(data: T) {
  return { structuredContent: data, content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

export function createServer(options: { outputDirectory?: string } = {}) {
  const server = new McpServer({ name: "wedraft", version: ENGINE_VERSION }, {
    instructions: "Format articles without rewriting their content. The first Markdown line is the title. Use list_templates for valid IDs; honor blocking issues. Local images must be explicitly supplied as assets. No tool publishes to WeChat or fetches remote images. Use export_article if configured to produce a portable bundle and preview; otherwise use the WeDraft CLI for file delivery.",
  });
  server.registerTool("list_templates", {
    title: "列出 WeDraft 排版模板", description: "List supported template IDs and pinned versions before formatting a WeChat article.",
    inputSchema: z.strictObject({}), outputSchema: z.object({ templates: z.array(templateSchema.extend({ default: z.boolean(), target: z.literal("wechat") })) }),
    annotations: readAnnotations,
  }, () => success({ templates: listTemplates() }));
  server.registerTool("validate_article", {
    title: "检查文章", description: "Check Markdown and explicitly supplied image assets. Returns blocking issues and warnings with source line locations; does not rewrite or save the article.",
    inputSchema: articleInputSchema, outputSchema: validationSchema, annotations: readAnnotations,
  }, (input) => success(validateInput(input)));
  server.registerTool("render_article", {
    title: "排版公众号正文", description: "Render Markdown into sanitized body-only WeChat HTML and plain text using WeDraft templates. HTML is null when content is blocked. No file, clipboard, network or publishing side effects.",
    inputSchema: articleInputSchema,
    outputSchema: validationSchema.extend({ title: z.string(), html: z.string().nullable(), plainText: z.string() }),
    annotations: readAnnotations,
  }, (input) => {
    const result = renderArticle(input);
    return success({ status: result.status, issues: result.issues, template: result.template, engineVersion: result.engineVersion,
      title: result.document.title, html: result.html, plainText: result.plainText });
  });
  if (options.outputDirectory) {
    const outputRoot = resolve(options.outputDirectory);
    server.registerTool("export_article", {
      title: "生成预览与可编辑文章包", description: "Write a new preview, portable .wedraft.zip bundle and validation report under the output directory configured by the user. Never overwrites existing artifacts. For blocked drafts, preserves the source for repair but does not produce body.html. Paths refer to the machine running this MCP server, not a public URL.",
      inputSchema: articleInputSchema,
      outputSchema: z.object({ status: z.enum(["ready", "blocked"]), issues: z.array(issueSchema), files: z.array(z.string()) }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }, async (input) => {
      await mkdir(outputRoot, { recursive: true });
      const root = await realpath(outputRoot);
      return success(await writeArticleArtifacts(articleInputSchema.parse(input), join(root, `article-${randomUUID()}`)));
    });
  }
  return server;
}
