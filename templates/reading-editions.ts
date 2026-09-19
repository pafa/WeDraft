import type { LayoutTemplate } from "../packages/shared-types/src/index.js";

// A local, copy-safe reading system. No remote fonts or application-only CSS.
const sans = "PingFang SC,Microsoft YaHei,Arial,sans-serif";
const serif = "Songti SC,Noto Serif CJK SC,SimSun,serif";
const mono = "Menlo,Consolas,monospace";

interface Edition {
  id: string;
  name: string;
  description: string;
  accent: string;
  ink: string;
  muted: string;
  surface: string;
  rule: string;
  rhythm: string;
  paragraphGap: number;
  overrides: Partial<LayoutTemplate>;
}

function createEdition(edition: Edition): LayoutTemplate {
  const { id, name, description, accent, ink, muted, surface, rule, rhythm, paragraphGap, overrides } = edition;
  const reading = {
    "font-family": sans, "font-size": "16px", "line-height": rhythm,
    "font-weight": "400", "letter-spacing": "0", "text-align": "left",
    "overflow-wrap": "break-word", color: ink,
  };
  const cell = {
    "font-family": sans, "font-size": "13.5px", "line-height": "1.7",
    "font-weight": "400", "letter-spacing": "0", "font-variant-numeric": "tabular-nums",
    color: ink, "background-color": "#FFFFFF", padding: "10px 8px",
    "text-align": "left", "vertical-align": "middle",
    "border-bottom": `1px solid ${rule}`, "overflow-wrap": "anywhere",
  };
  const base: LayoutTemplate = {
    id, name, description, accentColor: accent,
    article: reading,
    body: { ...reading, margin: `0 8px ${paragraphGap}px` },
    heading2: {
      "font-family": sans, "font-size": "20px", "line-height": "1.6",
      "font-weight": "600", "letter-spacing": "0", color: ink, margin: "0 8px 20px",
    },
    headingNumber: {
      display: "block", "font-family": sans, "font-size": "12px", "font-weight": "400",
      "line-height": "1.4", "letter-spacing": "1px", color: accent, "margin-bottom": "6px",
    },
    headingText: { display: "block" },
    heading3: {
      "font-family": sans, "font-size": "17px", "line-height": "1.7",
      "font-weight": "600", "letter-spacing": "0", color: accent, margin: "26px 8px 12px",
    },
    // The quote hangs in the inner gutter; continuation lines align to the text.
    quote: {
      ...reading, "border-left": `1px solid ${rule}`, "background-color": "#FFFFFF",
      padding: "8px 0 8px 24px", "text-indent": "-16px", margin: "26px 8px",
    },
    quoteMark: {
      display: "inline-block", width: "16px", "font-family": serif, "font-size": "22px",
      "line-height": "1", "font-weight": "600", "text-indent": "0", color: accent,
      "vertical-align": "-2px",
    },
    quoteStrong: { "font-weight": "600", color: ink },
    image: { display: "block", width: "calc(100% - 16px)", height: "auto", margin: "26px 8px 8px" },
    caption: {
      "font-family": sans, "font-size": "12px", "line-height": "1.65", color: muted,
      "text-align": "right", "overflow-wrap": "break-word", margin: "0 8px 26px",
    },
    link: { color: accent, "text-decoration": "underline" },
    divider: {
      border: "0", "border-top": `1px solid ${rule}`, width: "calc(100% - 16px)",
      "font-size": "0", "line-height": "0", height: "0", margin: "34px auto 16px",
    },
    strong: { color: ink, "font-weight": "700" },
    list: { "padding-left": "1.25em", margin: `18px 8px ${paragraphGap}px` },
    listItem: { ...reading, margin: "0 0 6px" },
    note: {
      "font-family": sans, "font-size": "13px", "line-height": "1.8", color: muted,
      "text-align": "left", margin: "12px 8px 22px",
    },
    code: {
      "font-family": mono, "font-size": "13px", "line-height": "1.75", color: ink,
      "background-color": surface, border: `1px solid ${rule}`, padding: "14px 16px",
      margin: "24px 8px 26px", "white-space": "pre-wrap", "word-break": "break-word",
    },
    references: { padding: "2px 0 4px", margin: "0 8px 22px" },
    referenceTitlePrefix: "",
    referenceNumberFormat: "decimal",
    referenceTitle: {
      "font-family": sans, "font-size": "13px", "line-height": "1.6",
      "font-weight": "600", "letter-spacing": "0", color: accent, margin: "0 0 14px",
    },
    referenceItem: {
      "font-family": sans, "font-size": "13px", "line-height": "1.8", color: muted,
      "padding-left": "22px", "text-indent": "-22px", margin: "0 0 8px", "overflow-wrap": "anywhere",
    },
    referenceNumber: {
      display: "inline-block", "font-family": sans, "font-size": "12px", "font-weight": "400",
      "font-variant-numeric": "tabular-nums", "text-indent": "0", width: "22px", color: muted,
    },
    tableWrapper: { margin: "24px 8px 28px", "border-top": `1px solid ${rule}` },
    table: {
      display: "table", width: "100%", "table-layout": "fixed", "border-collapse": "separate",
      "border-spacing": "0", "font-family": sans, "font-variant-numeric": "tabular-nums",
    },
    tableHeaderCell: { ...cell, color: accent, "background-color": surface, "font-weight": "600", "line-height": "1.65" },
    tableCell: cell,
    tableAltCell: cell,
  };
  // Style-level merging keeps shared fonts and wrapping when refining a theme.
  const merged = Object.fromEntries(Object.entries(overrides).map(([key, value]) => {
    const original = base[key as keyof LayoutTemplate];
    return [key, value && typeof value === "object" && original && typeof original === "object"
      ? { ...original, ...value }
      : value];
  }));
  return { ...base, ...merged };
}

export const readingEditionTemplates: LayoutTemplate[] = [
  createEdition({
    id: "plain-paper", name: "素笺", description: "暖灰留白 · 适合长文与生活随笔",
    accent: "#756655", ink: "#3F3D39", muted: "#74706A", surface: "#F8F6F1", rule: "#E6E0D7",
    rhythm: "1.90", paragraphGap: 24,
    overrides: {
      heading2: { "font-size": "21px", "line-height": "1.55", "letter-spacing": "0.5px", "text-align": "center" },
      headingNumber: { "font-family": serif, "font-size": "13px" },
      divider: { "border-top": "1px solid #C8BFB2", width: "28px", margin: "36px auto 14px" },
      quote: {
        "border-left": "0", "border-top": "1px solid #E6E0D7", "border-bottom": "1px solid #E6E0D7",
        padding: "12px 16px 12px 32px", "line-height": "1.86",
      },
      tableWrapper: { "border-top": "1px solid #CFC5B7" },
      code: { "background-color": "#FAF9F6" },
    },
  }),
  createEdition({
    id: "ink-journal", name: "墨刊", description: "黑白刊物 · 适合深度报道与人物文章",
    accent: "#272727", ink: "#3C3C3A", muted: "#73736F", surface: "#F6F6F3", rule: "#E2E2DD",
    rhythm: "1.84", paragraphGap: 24,
    overrides: {
      heading2: { "font-family": serif, "font-size": "22px", "line-height": "1.55", color: "#272727" },
      heading2Numbered: { "padding-left": "26px", "text-indent": "-26px" },
      headingNumber: { display: "inline-block", width: "26px", "font-family": mono, "font-size": "12px", "letter-spacing": "0", "text-indent": "0", "margin-right": "0" },
      headingText: { display: "inline" },
      divider: { "border-top": "1px solid #464644" },
      quote: { "font-family": serif, "font-size": "17px", "line-height": "1.85", "border-left": "1px solid #B6B6B2", padding: "6px 0 6px 24px" },
      tableWrapper: { "border-top": "1px solid #60605C" },
      tableHeaderCell: { "background-color": "#FFFFFF", color: "#303030", "border-bottom": "1px solid #B7B7B2" },
      code: { border: "0", "border-left": "1px solid #CFCFCB", "background-color": "#F8F8F6" },
    },
  }),
  createEdition({
    id: "jade-notes", name: "青岚", description: "松青书页 · 适合随笔、人文与知识长文",
    accent: "#27675C", ink: "#3D4841", muted: "#6D786F", surface: "#F4F7F4", rule: "#DDE7DF",
    rhythm: "1.92", paragraphGap: 25,
    overrides: {
      heading2: { color: "#27675C" },
      headingNumber: { width: "22px", "border-bottom": "1px solid #B8CDC3", "padding-bottom": "4px", "margin-bottom": "8px" },
      quote: { "border-left": "0", "background-color": "#F4F8F5", padding: "14px 16px 14px 32px", "line-height": "1.9" },
      tableWrapper: { "border-top": "1px solid #B6CCC1" },
      code: { color: "#3B5548", "background-color": "#F3F7F4" },
    },
  }),
  createEdition({
    id: "blueprint", name: "蓝图", description: "理性蓝调 · 适合科技、方法与数据解读",
    accent: "#2857B7", ink: "#3B424D", muted: "#6D7684", surface: "#F1F5FC", rule: "#DFE6F1",
    rhythm: "1.84", paragraphGap: 22,
    overrides: {
      heading2: { "line-height": "1.55", color: "#2F3540" },
      heading2Numbered: { "padding-left": "28px", "text-indent": "-28px" },
      headingNumber: {
        display: "inline-block", "font-family": mono, "font-size": "12px", "font-weight": "500",
        "line-height": "1.4", "letter-spacing": "0", "text-indent": "0", width: "28px",
        "margin-right": "0", "margin-bottom": "0",
      },
      headingText: { display: "inline" },
      divider: { margin: "32px auto 16px" },
      quote: { "border-left": "2px solid #ABC0E5", "line-height": "1.85" },
      tableWrapper: { "border-top": "1px solid #B4C7E7" },
      code: { "background-color": "#F6F8FC" },
    },
  }),
  createEdition({
    id: "cinnabar", name: "朱砂", description: "砖红篇章 · 适合观点、文化与品牌故事",
    accent: "#A3453C", ink: "#443B38", muted: "#7A6D69", surface: "#FBF6F3", rule: "#EBE1DB",
    rhythm: "1.88", paragraphGap: 24,
    overrides: {
      heading2: { "font-size": "21px", "line-height": "1.55" },
      heading2Numbered: { "padding-left": "36px", "text-indent": "-36px" },
      headingNumber: { display: "inline-block", width: "36px", "font-family": serif, "font-size": "22px", "line-height": "1.3", "letter-spacing": "0", "text-indent": "0", "margin-right": "0" },
      headingText: { display: "inline" },
      divider: { "border-top": "1px solid #BB796F", width: "28px", margin: "36px 8px 16px" },
      quote: { "border-left": "0", "background-color": "#FCF8F5", padding: "14px 16px 14px 32px" },
      quoteMark: { "font-size": "24px", "font-weight": "500" },
      code: { "background-color": "#FBF8F5" },
    },
  }),
];
