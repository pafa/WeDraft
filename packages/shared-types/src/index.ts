import { z } from "zod";

export const inlineNodeSchema = z.object({
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  link: z.url().optional(),
});
export type InlineNode = z.infer<typeof inlineNodeSchema>;

const inlineChildrenSchema = z.array(inlineNodeSchema);

export const paragraphBlockSchema = z.object({
  type: z.literal("paragraph"),
  children: inlineChildrenSchema,
});
export const headingBlockSchema = z.object({
  type: z.literal("heading"),
  level: z.union([z.literal(2), z.literal(3)]),
  children: inlineChildrenSchema,
});
export const quoteBlockSchema = z.object({
  type: z.literal("quote"),
  children: inlineChildrenSchema,
});
export const listBlockSchema = z.object({
  type: z.literal("list"),
  ordered: z.boolean(),
  items: z.array(inlineChildrenSchema),
});
export const dividerBlockSchema = z.object({
  type: z.literal("divider"),
});
export const imageBlockSchema = z.object({
  type: z.literal("image"),
  id: z.string().min(1),
  localPath: z.string().optional(),
  remoteUrl: z.url().optional(),
  previewUrl: z.string().optional(),
  alt: z.string().optional(),
  caption: z.string().optional(),
});
export const codeBlockSchema = z.object({
  type: z.literal("code"),
  code: z.string(),
  language: z.string().optional(),
});
export const referencesBlockSchema = z.object({
  type: z.literal("references"),
  title: z.string(),
  items: z.array(inlineChildrenSchema),
});
export const tableBlockSchema = z.object({
  type: z.literal("table"),
  header: z.array(inlineChildrenSchema),
  rows: z.array(z.array(inlineChildrenSchema)),
  align: z.array(
    z.union([
      z.literal("left"),
      z.literal("center"),
      z.literal("right"),
      z.null(),
    ]),
  ),
});

export const articleBlockSchema = z.discriminatedUnion("type", [
  paragraphBlockSchema,
  headingBlockSchema,
  quoteBlockSchema,
  listBlockSchema,
  dividerBlockSchema,
  imageBlockSchema,
  codeBlockSchema,
  referencesBlockSchema,
  tableBlockSchema,
]);
export type ArticleBlock = z.infer<typeof articleBlockSchema>;

export const articleDocumentSchema = z.object({
  title: z.string(),
  author: z.string(),
  digest: z.string(),
  sourceUrl: z.url().optional(),
  blocks: z.array(articleBlockSchema),
});
export type ArticleDocument = z.infer<typeof articleDocumentSchema>;

const cssValueSchema = z.string().min(1).max(80);
const styleRecordSchema = z.record(z.string(), cssValueSchema);

export const layoutTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  body: styleRecordSchema,
  heading2: styleRecordSchema,
  heading3: styleRecordSchema,
  quote: styleRecordSchema,
  image: styleRecordSchema,
  link: styleRecordSchema,
  divider: styleRecordSchema,
  strong: styleRecordSchema,
  list: styleRecordSchema,
  listItem: styleRecordSchema,
  caption: styleRecordSchema,
  note: styleRecordSchema,
  code: styleRecordSchema,
  references: styleRecordSchema,
  referenceTitle: styleRecordSchema,
  referenceItem: styleRecordSchema,
  tableWrapper: styleRecordSchema,
  table: styleRecordSchema,
  tableHeaderCell: styleRecordSchema,
  tableCell: styleRecordSchema,
  tableAltCell: styleRecordSchema,
});
export type LayoutTemplate = z.infer<typeof layoutTemplateSchema>;

export const userSettingsSchema = z.object({
  defaultAuthor: z.string().max(16),
  defaultTemplateId: z.string().min(1),
  autosaveIntervalSeconds: z.number().int().min(5).max(600),
  templateDefaultVersion: z.number().int().min(1).optional(),
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

export type LocalArticle = {
  id: string;
  title: string;
  author: string;
  digest: string;
  markdown: string;
  templateId: string;
  createdAt: string;
  updatedAt: string;
};

export type ContentIssue = {
  code: string;
  level: "blocking" | "warning" | "info";
  message: string;
  blockIndex?: number;
};
