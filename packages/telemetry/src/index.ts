import { z } from "zod";

export const SCHEMA_VERSION = 1;
export const MAX_BATCH = 20;
export const MAX_BYTES = 32_768;
export const DAY = 86_400_000;
export const SESSION_IDLE = 30 * 60_000;
export const QUEUE_TTL = 15 * 60_000;
export const inputMethod = z.enum(["typing", "paste_plain", "paste_html", "import", "toolbar", "preview", "unknown"]);
const uuid = z.uuid();
const envelope = { schema: z.literal(1), id: uuid, session: uuid, article: uuid.nullable(), seq: z.number().int().min(1).max(2000), version: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/) };
function event<N extends string, S extends z.ZodRawShape>(name: N, properties: S) {
  return z.strictObject({ ...envelope, name: z.literal(name), properties: z.strictObject(properties) });
}
const result = z.enum(["success", "failed"]);
const status = z.enum(["ready", "blocked"]);
const action = z.enum(["bold", "heading1", "heading2", "heading3", "inline-code", "code-block", "ordered-list", "unordered-list", "quote", "divider", "table", "link", "undo", "redo", "image", "note", "references"]);
export const eventSchema = z.discriminatedUnion("name", [
  event("page_view", { route: z.enum(["editor", "templates", "ai"]) }),
  event("article_started", { method: inputMethod, partial: z.boolean() }),
  event("content_input", { method: inputMethod }),
  event("format_action", { action, source: z.enum(["toolbar", "keyboard"]), changed: z.boolean() }),
  event("manual_edit", { surface: z.enum(["markdown", "preview"]) }),
  event("ui_action", { action: z.enum(["new", "import", "issues", "export", "help", "editor", "preview"]) }),
  event("template_selected", { template: z.number().int().min(0).max(50) }),
  event("import_result", { format: z.enum(["markdown", "json", "bundle"]), method: z.enum(["picker", "drop"]), result }),
  event("image_result", { result }),
  event("preview_ready", {}),
  event("validation_changed", { status, reason: z.enum(["none", "image", "content", "other"]) }),
  event("copy_requested", { operation: uuid }),
  event("copy_result", { operation: uuid, result: z.enum(["pending", "success", "failed", "blocked", "cancelled"]) }),
  event("export_result", { kind: z.enum(["html", "markdown", "bundle"]), result: z.enum(["handed_off", "failed"]), status }),
  event("article_checkpoint", { chars: z.number().int().min(0).max(5), images: z.number().int().min(0).max(3), tables: z.number().int().min(0).max(2), headings: z.boolean(), lists: z.boolean(), quotes: z.boolean(), code: z.boolean() }),
  event("ai_action", { action: z.enum(["manual", "automatic", "rules_copy", "setup_copy", "install_copy", "task_copy"]), result: z.enum(["selected", "success", "failed"]) }),
  event("runtime_error", { code: z.enum(["render_failed", "page_failed"]) }),
]);
export type TelemetryEvent = z.infer<typeof eventSchema>;
export type EventName = TelemetryEvent["name"];
export type EventProperties<N extends EventName> = Extract<TelemetryEvent, { name: N }>["properties"];
export type InputMethod = z.infer<typeof inputMethod>;
export const batchSchema = z.strictObject({ events: z.array(eventSchema).min(1).max(MAX_BATCH) }).superRefine(({ events }, ctx) => {
  const session = events[0]?.session;
  if (events.some(e => e.session !== session)) ctx.addIssue({ code: "custom", message: "mixed_session" });
  for (const e of events) {
    if (["article_started", "content_input", "format_action", "manual_edit", "preview_ready", "validation_changed", "copy_requested", "copy_result", "export_result", "article_checkpoint"].includes(e.name) && !e.article) ctx.addIssue({ code: "custom", message: "missing_article" });
  }
});

export function contentFeatures(document: { title: string; blocks: readonly { type: string }[] }, plainText: string): EventProperties<"article_checkpoint"> {
  const chars = (document.title + plainText).replace(/\s/gu, "").length;
  const count = (type: string) => document.blocks.filter(block => block.type === type).length;
  const images = count("image"), tables = count("table");
  return { chars: chars === 0 ? 0 : chars < 500 ? 1 : chars < 1500 ? 2 : chars < 3000 ? 3 : chars < 6000 ? 4 : 5,
    images: images === 0 ? 0 : images === 1 ? 1 : images <= 5 ? 2 : 3, tables: Math.min(2, tables),
    headings: count("heading") > 0, lists: count("list") > 0, quotes: count("quote") > 0, code: count("code") > 0 };
}
