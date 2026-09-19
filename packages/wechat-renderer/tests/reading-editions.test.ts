import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { ArticleDocument, LayoutTemplate } from "@wedraft/shared-types";
import { layoutTemplateSchema } from "@wedraft/shared-types";

import {
  availableTemplates,
  getTemplateById,
  renderWechatHtml,
} from "../src/index.js";

const legacyIds = ["default-business", "next-edition"];
const readingTemplates = availableTemplates.filter(
  (template) => !legacyIds.includes(template.id),
);

const compatibilityDocument: ArticleDocument = {
  title: "不应复制的标题",
  author: "不应复制的作者",
  digest: "不应复制的摘要",
  blocks: [
    {
      type: "paragraph",
      children: [
        { text: "正文" },
        { text: "重点", bold: true },
        { text: "斜体", italic: true },
        { text: "链接", link: "https://example.com/source" },
      ],
    },
    { type: "heading", level: 2, children: [{ text: "2. 保留原章节" }] },
    { type: "heading", level: 3, children: [{ text: "原二级标题" }] },
    { type: "quote", children: [{ text: "重要判断", bold: true }] },
    {
      type: "list",
      ordered: true,
      items: [[{ text: "步骤一" }], [{ text: "步骤二" }]],
    },
    { type: "divider" },
    {
      type: "image",
      id: "sample-image",
      remoteUrl: "https://example.com/image.png",
      alt: "真实配图",
      caption: "图片来源：作者拍摄",
    },
    { type: "code", language: "js", code: "const value = 1;\nconsole.log(value);" },
    {
      type: "table",
      header: [
        [{ text: "指标", bold: true }],
        [{ text: "值", link: "https://example.com/data" }],
      ],
      rows: [
        [[{ text: "收益" }], [{ text: "+18%", bold: true }]],
        [[{ text: "数量" }], [{ text: "1,200" }]],
      ],
      align: ["left", "right"],
    },
    {
      type: "references",
      title: "参考来源",
      items: [
        [{ text: "资料一", link: "https://example.com/source" }],
        [{ text: "资料二" }],
      ],
    },
  ],
};

function renderBlocks(
  blocks: ArticleDocument["blocks"],
  template: LayoutTemplate,
) {
  return renderWechatHtml({ ...compatibilityDocument, blocks }, template);
}

function elements(html: string, tag: string) {
  return Array.from(
    html.matchAll(new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, "g")),
    (match) => ({ attributes: match[1] ?? "", inner: match[2] ?? "" }),
  );
}

function firstElement(html: string, tag: string) {
  const element = elements(html, tag)[0];
  expect(element, `Expected a <${tag}> in rendered article`).toBeDefined();
  return element!;
}

function styles(attributes: string): Record<string, string> {
  const value = attributes.match(/\bstyle="([^"]*)"/)?.[1] ?? "";
  return Object.fromEntries(
    value.split(";").flatMap((declaration) => {
      const separator = declaration.indexOf(":");
      return separator > 0
        ? [[declaration.slice(0, separator), declaration.slice(separator + 1)]]
        : [];
    }),
  );
}

function visibleText(html: string) {
  return html.replace(/<[^>]*>/g, "");
}

function luminance(hex: string) {
  const value = hex.replace(/^#/, "");
  const expanded = value.length === 3
    ? Array.from(value, (digit) => digit + digit).join("")
    : value;
  expect(expanded).toMatch(/^[\da-f]{6}$/i);
  const channels = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe("reading edition collection", () => {
  it("原两款保留并注册五款可选择的完整主题", () => {
    expect(availableTemplates).toHaveLength(7);
    expect(readingTemplates.map((template) => template.name).sort()).toEqual(
      ["素笺", "墨刊", "青岚", "蓝图", "朱砂"].sort(),
    );
    expect(new Set(availableTemplates.map((template) => template.id)).size).toBe(7);
    for (const template of availableTemplates) {
      expect(layoutTemplateSchema.safeParse(template).success).toBe(true);
      expect(getTemplateById(template.id)).toBe(template);
    }
    for (const template of readingTemplates) {
      expect(template.description?.trim().length).toBeGreaterThan(0);
    }
  });

  it("五款具有不同主色及标题结构，正文保持适合手机阅读的字号和统一字体", () => {
    expect(new Set(readingTemplates.map((template) => template.accentColor)).size).toBe(5);
    const headingRhythms = readingTemplates.map((template) => JSON.stringify({
      display: template.headingNumber?.display,
      size: template.headingNumber?.["font-size"],
      border: template.heading2["border-left"],
      alignment: template.heading2["text-align"],
      family: template.heading2["font-family"],
    }));
    expect(new Set(headingRhythms).size).toBeGreaterThanOrEqual(3);
    for (const template of readingTemplates) {
      const family = template.article?.["font-family"];
      expect(family).toBeTruthy();
      for (const style of [
        template.body,
        template.listItem,
        template.table,
        template.caption,
        template.referenceItem,
      ]) {
        expect(style["font-family"] ?? family).toBe(family);
      }
      // The newspaper edition intentionally uses a serif face for pull quotes.
      expect(template.quote["font-family"] ?? family).toBe(
        template.name === "墨刊" ? template.heading2["font-family"] : family,
      );
      expect(template.body["font-size"]).toBe("16px");
      expect(Number.parseFloat(template.body["line-height"] ?? "")).toBeGreaterThanOrEqual(1.8);
    }
  });
});

describe.each(readingTemplates)("$name rendering contracts", (template) => {
  it("编号跨粗体和链接节点时仍保留富文本，并保留双span直接编辑结构", () => {
    const html = renderBlocks([{
      type: "heading",
      level: 2,
      children: [
        { text: " 1", bold: true },
        { text: ". 关键", bold: true, link: "https://example.com/heading" },
        { text: "判断", italic: true },
      ],
    }], template);
    const heading = firstElement(html, "h2");
    const spans = elements(heading.inner, "span");
    expect(spans).toHaveLength(2);
    const headingSize = Number.parseFloat(styles(heading.attributes)["font-size"] ?? "");
    expect(headingSize).toBeGreaterThanOrEqual(20);
    expect(headingSize).toBeLessThanOrEqual(22);
    const numberStyle = styles(spans[0]!.attributes);
    if (template.heading2Numbered) {
      const indent = styles(heading.attributes)["text-indent"];
      expect(indent).toBe(`-${numberStyle.width}`);
      expect(styles(heading.attributes)["padding-left"]).toBe(numberStyle.width);
      expect(numberStyle["text-indent"]).toBe("0");
    }
    expect(Number.parseFloat(numberStyle["font-size"] ?? "")).toBeLessThanOrEqual(22);
    expect(numberStyle["background-color"] ?? "transparent").toMatch(/^(?:transparent|#fff(?:fff)?)$/i);
    expect(visibleText(spans[0]!.inner)).toBe("01");
    expect(visibleText(spans[1]!.inner)).toBe("关键判断");
    expect(spans[1]!.inner).toContain('href="https://example.com/heading"');
    expect(spans[1]!.inner).toMatch(/<strong[^>]*>关键<\/strong>/);
    expect(spans[1]!.inner).toContain("<em>判断</em>");
    for (const tag of ["strong", "a"]) {
      expect(styles(firstElement(spans[1]!.inner, tag).attributes).color).toBe(template.heading2.color);
    }
    for (const property of ["background-color", "margin-right", "margin-bottom"]) {
      if (template.headingNumber?.[property]) {
        expect(styles(spans[0]!.attributes)[property]).toBe(template.headingNumber[property]);
      }
    }
    expect(html).toContain('data-wedraft-block-index="0"');
  });

  it("不为无编号章节生成数字或SECTION前缀", () => {
    const html = renderBlocks([{
      type: "heading", level: 2, children: [{ text: "原始标题", bold: true }],
    }], template);
    const heading = firstElement(html, "h2");
    expect(visibleText(heading.inner)).toBe("原始标题");
    expect(elements(heading.inner, "span")).toHaveLength(1);
    expect(html).not.toContain("SECTION");
    expect(styles(heading.attributes)["text-indent"]).toBeUndefined();
    expect(styles(heading.attributes)["padding-left"]).toBeUndefined();
  });

  it("引用装饰与首句同行，引用正文和参考来源保持可编辑DOM", () => {
    const html = renderWechatHtml(compatibilityDocument, template);
    const quote = firstElement(html, "blockquote");
    const mark = firstElement(quote.inner, "span");
    expect(styles(mark.attributes).display).toBe("inline-block");
    expect(mark.inner).toBe("“");
    expect(quote.inner).toMatch(/^<span[^>]*>“<\/span><strong[^>]*>重要判断<\/strong>$/);
    expect(quote.inner).not.toContain("<br");
    expect(styles(quote.attributes)["background-color"]).toBe(template.quote["background-color"]);
    expect(styles(mark.attributes).color?.toLowerCase()).toBe(template.accentColor?.toLowerCase());
    expect(styles(firstElement(quote.inner, "strong").attributes)["font-weight"]).toBe("600");
    expect(html).toMatch(/<p[^>]*><span[^>]*>1\.<\/span><a[^>]*>资料一<\/a><\/p>/);
    expect(html).toContain('data-wedraft-block-index="9"');
  });

  it("参考来源采用中文标题和自然序号，长条目续行悬挂对齐", () => {
    const html = renderBlocks([{
      type: "references",
      title: "参考来源",
      items: Array.from({ length: 10 }, (_, index) => [{ text: `第${index + 1}条具有完整名称的原始资料` }]),
    }], template);
    const paragraphs = elements(html, "p");
    expect(paragraphs).toHaveLength(11);
    expect(visibleText(paragraphs[0]!.inner)).toBe("参考来源");
    expect(html).not.toContain("REFERENCES");
    const referenceItems = paragraphs.slice(1);
    for (const [index, item] of referenceItems.entries()) {
      const itemStyle = styles(item.attributes);
      expect(itemStyle["padding-left"]).toBe("22px");
      expect(itemStyle["text-indent"]).toBe("-22px");
      const number = firstElement(item.inner, "span");
      expect(number.inner).toBe(`${index + 1}.`);
      expect(styles(number.attributes).width).toBe("22px");
      expect(styles(number.attributes)["text-indent"]).toBe("0");
      expect(visibleText(item.inner)).toBe(`${index + 1}.第${index + 1}条具有完整名称的原始资料`);
    }
  });

  it("引用独立字重保持strong语义，而且不会覆盖正文的强调样式", () => {
    const isolatedTemplate: LayoutTemplate = {
      ...template,
      strong: { ...template.strong, "font-weight": "700" },
      quoteStrong: { ...template.quoteStrong, "font-weight": "600" },
    };
    const html = renderBlocks([
      { type: "quote", children: [{ text: "普通引文" }, { text: "重要判断", bold: true }] },
      { type: "paragraph", children: [{ text: "正文关键词", bold: true }] },
    ], isolatedTemplate);
    const quote = firstElement(html, "blockquote");
    const quoteStrong = firstElement(quote.inner, "strong");
    expect(quoteStrong.inner).toBe("重要判断");
    expect(styles(quoteStrong.attributes)["font-weight"]).toBe("600");
    expect(visibleText(quote.inner)).toBe("“普通引文重要判断");
    const bodyStrong = firstElement(firstElement(html, "p").inner, "strong");
    expect(bodyStrong.inner).toBe("正文关键词");
    expect(styles(bodyStrong.attributes)["font-weight"]).toBe("700");
  });

  it("表头的粗体和链接保有可读对比度，表格支持窄屏换行与原始对齐", () => {
    const html = renderWechatHtml(compatibilityDocument, template);
    const headerCells = elements(html, "th");
    expect(headerCells).toHaveLength(2);
    for (const [index, cell] of headerCells.entries()) {
      const cellStyle = styles(cell.attributes);
      const nested = firstElement(cell.inner, index === 0 ? "strong" : "a");
      expect(styles(nested.attributes).color).toBe(cellStyle.color);
      expect(cellStyle["background-color"]).toBe(template.tableHeaderCell["background-color"]);
      expect(contrast(cellStyle.color ?? "", cellStyle["background-color"] ?? "")).toBeGreaterThanOrEqual(4.5);
      expect(luminance(cellStyle["background-color"] ?? "")).toBeGreaterThanOrEqual(0.85);
      expect(cellStyle["font-size"]).toBe("13.5px");
      expect(cellStyle["font-weight"]).toBe("600");
      expect(cellStyle["overflow-wrap"]).toBe("anywhere");
    }
    expect(styles(headerCells[1]!.attributes)["text-align"]).toBe("right");
    const table = firstElement(html, "table");
    expect(styles(table.attributes)["table-layout"]).toBe("fixed");
    expect(styles(table.attributes).width).toBe("100%");
    const tableNumerals = styles(table.attributes)["font-variant-numeric"];
    expect(elements(table.inner, "td")).toHaveLength(4);
    expect(visibleText(table.inner)).toContain("+18%");
    expect(visibleText(table.inner)).toContain("1,200");
    for (const cell of [...headerCells, ...elements(table.inner, "td")]) {
      const cellStyle = styles(cell.attributes);
      expect(cellStyle["overflow-wrap"]).toBe("anywhere");
      expect(cellStyle["font-size"]).toBe("13.5px");
      expect(cellStyle["font-variant-numeric"] ?? tableNumerals).toBe("tabular-nums");
      for (const border of ["border", "border-left", "border-right"]) {
        expect(cellStyle[border] ?? "0").toMatch(/^(?:0(?:px)?|none)$/);
      }
    }
  });

  it("正文图左右8px且来源右对齐，图片信息不随切换样式丢失", () => {
    const html = renderWechatHtml(compatibilityDocument, template);
    const imageAttributes = html.match(/<img\b([^>]*)>/)?.[1] ?? "";
    const imageStyle = styles(imageAttributes);
    expect(imageStyle.width).toBe("calc(100% - 16px)");
    expect(imageStyle.height).toBe("auto");
    expect(imageStyle.margin?.split(" ")[1]).toBe("8px");
    expect(imageAttributes).toContain('src="https://example.com/image.png"');
    expect(imageAttributes).toContain('alt="真实配图"');
    const caption = elements(html, "p").find((element) => element.inner === "图片来源：作者拍摄");
    expect(caption).toBeDefined();
    expect(styles(caption!.attributes)["text-align"]).toBe("right");
    expect(styles(caption!.attributes)["font-size"]).toBe("12px");
  });

  it("二级标题强调保留标题色与下划线间距，代码底色经过HTML清洗仍存在", () => {
    const html = renderBlocks([
      { type: "heading", level: 3, children: [
        { text: "重要", bold: true },
        { text: "来源", link: "https://example.com/source" },
      ] },
      { type: "code", code: "const value = 1;" },
    ], template);
    const heading = firstElement(html, "h3");
    for (const tag of ["strong", "a"]) {
      expect(styles(firstElement(heading.inner, tag).attributes).color).toBe(template.heading3.color);
    }
    expect(styles(heading.attributes)["padding-bottom"]).toBe(template.heading3["padding-bottom"]);
    const pre = firstElement(html, "pre");
    const codeStyle = styles(pre.attributes);
    expect(codeStyle["background-color"]).toBe(template.code["background-color"]);
    expect(codeStyle["font-family"]).toBe(template.code["font-family"]);
    expect(codeStyle["font-family"]).toMatch(/Menlo.*Consolas.*monospace/);
    expect(codeStyle["white-space"]).toBe("pre-wrap");
    expect(codeStyle["word-break"]).toBe("break-word");
    expect(firstElement(pre.inner, "code").inner).toBe("const value = 1;");
  });

  it("自动分割线不重复，块映射不因主题装饰而偏移", () => {
    const html = renderBlocks([
      { type: "divider" },
      { type: "heading", level: 2, children: [{ text: "1. 章节" }] },
      { type: "divider" },
      { type: "references", title: "参考来源", items: [[{ text: "资料" }]] },
    ], template);
    expect(html.match(/<br\s*\/?\s*>/g)).toHaveLength(2);
    expect(Array.from(html.matchAll(/data-wedraft-block-index="(\d+)"/g), (match) => match[1])).toEqual(["1", "3"]);
  });

  it("切换主题只改变排版，不自动生成正文、图、参考来源或固定页脚", () => {
    const plain = "市场规模为128亿元，原文不增加内容。";
    const html = renderBlocks([{ type: "paragraph", children: [{ text: plain }] }], template);
    expect(visibleText(html)).toBe(plain);
    const rootAttributes = html.match(/^<section([^>]*)>/)?.[1] ?? "";
    expect(styles(rootAttributes)["font-family"]).toBe(template.article?.["font-family"]);
    const paragraphStyle = styles(firstElement(html, "p").attributes);
    expect(paragraphStyle["font-size"]).toBe("16px");
    expect(paragraphStyle["text-align"]).toBe("left");
    expect(paragraphStyle["letter-spacing"]).toBe("0");
    expect(html).not.toMatch(/<img\b|<table\b|<blockquote\b/);
    expect(html).not.toContain("REFERENCES");
    expect(html).not.toContain(compatibilityDocument.title);
    expect(html).not.toContain(compatibilityDocument.author);
    expect(html).not.toContain(compatibilityDocument.digest);
    expect(visibleText(renderBlocks([], template))).toBe("");
  });
});

describe("legacy template compatibility", () => {
  // Captured from the accepted HEAD 7357d574 renderer before this feature.
  // Includes every supported block, inline marks, pictures and source captions.
  it.each([
    ["default-business", "b1ae852075e137893fd2721c0ffd6113244c8a2287b42f13a22935273b5d749c"],
    ["next-edition", "bf15ba80afe308c8d076f5226b7895dd624542eb32d4662f83efe8564bf4756f"],
  ])("%s输出与原版完全相同", (id, expectedHash) => {
    const html = renderWechatHtml(compatibilityDocument, getTemplateById(id));
    expect(createHash("sha256").update(html).digest("hex")).toBe(expectedHash);
  });
});
