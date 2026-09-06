import sanitizeHtml from "sanitize-html";

import type {
  ArticleDocument,
  InlineNode,
  LayoutTemplate,
} from "@wedraft/shared-types";
import { layoutTemplateSchema } from "@wedraft/shared-types";
import defaultTemplateJson from "../../../templates/default-business.json" with {
  type: "json",
};
import nextEditionJson from "../../../templates/next-edition.json" with {
  type: "json",
};

export const defaultTemplate: LayoutTemplate =
  layoutTemplateSchema.parse(defaultTemplateJson);
export const availableTemplates: LayoutTemplate[] = [
  defaultTemplate,
  layoutTemplateSchema.parse(nextEditionJson),
];

export function getTemplateById(id: string): LayoutTemplate {
  return (
    availableTemplates.find((template) => template.id === id) ??
    defaultTemplate
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function styleString(styles: Record<string, string>): string {
  return Object.entries(styles)
    .map(([property, value]) => `${property}:${value}`)
    .join(";");
}

function renderDivider(template: LayoutTemplate): string {
  return `<section style="${styleString(template.divider)}"><br></section>`;
}

function isChapterBlock(block: ArticleDocument["blocks"][number]): boolean {
  return (
    (block.type === "heading" && block.level === 2) ||
    block.type === "references"
  );
}

function renderInline(
  children: InlineNode[],
  template: LayoutTemplate,
): string {
  return children
    .map((node) => {
      let output = escapeHtml(node.text).replaceAll("\n", "<br>");
      if (node.bold) {
        output = `<strong style="${styleString(template.strong)}">${output}</strong>`;
      }
      if (node.italic) output = `<em>${output}</em>`;
      if (node.link && /^https?:\/\//i.test(node.link)) {
        output = `<a href="${escapeHtml(node.link)}" style="${styleString(template.link)}">${output}</a>`;
      }
      return output;
    })
    .join("");
}

function renderHeading2(
  children: InlineNode[],
  template: LayoutTemplate,
): string {
  const html = renderInline(children, template);
  const match = html.match(/^(\s*\d+[.．、])\s*(.*)$/s);
  if (template.id === "next-edition") {
    const sectionLabel = match?.[1]
      ? `SECTION ${match[1].replace(/\D/g, "").padStart(2, "0")}`
      : "SECTION";
    const title = match?.[2] ?? html;
    return `<h2 style="${styleString(template.heading2)}"><span style="display:block;font-size:10px;line-height:1.4;font-weight:700;color:#F96E57;letter-spacing:1.6px;margin-bottom:4px;">${sectionLabel}</span><span style="display:block;">${title}</span></h2>`;
  }
  if (!match || template.id !== defaultTemplate.id) {
    return `<h2 style="${styleString(template.heading2)}">${html}</h2>`;
  }
  return `<h2 style="${styleString(template.heading2)}"><span style="font-size:25px;line-height:1.19;font-style:italic;font-weight:900;color:#F96E57;letter-spacing:1px;">${match[1]}</span><span style="font-size:15px;font-style:normal;font-weight:700;color:#FFA900;letter-spacing:0.5px;"> ${match[2]}</span></h2>`;
}

function renderQuote(
  children: InlineNode[],
  template: LayoutTemplate,
): string {
  const quoteColor =
    template.id === defaultTemplate.id ? "#F96E57" : "#7B9F93";
  return `<blockquote style="${styleString(template.quote)}"><span style="display:inline-block;font-size:26px;line-height:0.8;font-weight:800;color:${quoteColor};margin:0 7px 0 0;">“</span>${renderInline(children, template)}</blockquote>`;
}

function renderTable(
  block: Extract<ArticleDocument["blocks"][number], { type: "table" }>,
  template: LayoutTemplate,
): string {
  const renderCell = (
    children: InlineNode[],
    columnIndex: number,
    baseStyle: Record<string, string>,
    tag: "th" | "td",
  ) => {
    const alignment = block.align[columnIndex];
    const style = {
      ...baseStyle,
      ...(alignment ? { "text-align": alignment } : {}),
      ...(columnIndex === block.header.length - 1
        ? { "border-right": "0" }
        : {}),
    };
    return `<${tag} style="${styleString(style)}">${renderInline(children, template)}</${tag}>`;
  };
  const header = block.header
    .map((cell, columnIndex) =>
      renderCell(cell, columnIndex, template.tableHeaderCell, "th"),
    )
    .join("");
  const rows = block.rows
    .map((row, rowIndex) => {
      const baseStyle =
        rowIndex % 2 === 0 ? template.tableCell : template.tableAltCell;
      const cells = block.header
        .map((_, columnIndex) =>
          renderCell(row[columnIndex] ?? [], columnIndex, baseStyle, "td"),
        )
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<section style="${styleString(template.tableWrapper)}"><table style="${styleString(template.table)}"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></section>`;
}

export function renderWechatHtml(
  document: ArticleDocument,
  template: LayoutTemplate = defaultTemplate,
): string {
  const rendered = document.blocks
    .map((block, blockIndex) => {
      const nextBlock = document.blocks[blockIndex + 1];
      // A chapter owns its divider. If Markdown already contains `---` directly
      // before it, consume that block here so the preview never shows two lines.
      if (
        block.type === "divider" &&
        nextBlock &&
        isChapterBlock(nextBlock)
      ) {
        return "";
      }

      const renderedBlock = (() => {
        switch (block.type) {
        case "paragraph": {
          const paragraphText = block.children
            .map((child) => child.text)
            .join("")
            .trim();
          const style =
            /^(?:注|说明|参考|来源|资料来源|数据来源|作者|编辑)[：:]/.test(
              paragraphText,
            )
              ? template.note
              : template.body;
          return `<p style="${styleString(style)}">${renderInline(block.children, template)}</p>`;
        }
        case "heading":
          return block.level === 2
            ? `<section>${renderDivider(template)}${renderHeading2(block.children, template)}</section>`
            : `<h3 style="${styleString(template.heading3)}">${renderInline(block.children, template)}</h3>`;
        case "quote":
          return renderQuote(block.children, template);
        case "list": {
          const tag = block.ordered ? "ol" : "ul";
          const items = block.items
            .map(
              (item) =>
                `<li style="${styleString(template.listItem)}">${renderInline(item, template)}</li>`,
            )
            .join("");
          return `<${tag} style="${styleString(template.list)}">${items}</${tag}>`;
        }
        case "divider":
          return renderDivider(template);
        case "image": {
          const previewSource =
            block.previewUrl &&
            /^(?:asset:\/\/localhost\/|http:\/\/asset\.localhost\/|data:image\/(?:jpeg|png|gif|webp);base64,)/i.test(
              block.previewUrl,
            )
              ? block.previewUrl
              : undefined;
          const source =
            previewSource ??
            block.remoteUrl ??
            (block.localPath?.startsWith("/") ? block.localPath : undefined);
          const sourceAttribute = source
            ? ` src="${escapeHtml(source)}"`
            : "";
          const image = `<img${sourceAttribute} data-wedraft-image-id="${escapeHtml(block.id)}" alt="${escapeHtml(block.alt ?? "")}" style="${styleString(template.image)}">`;
          return block.caption
            ? `<section>${image}<p style="${styleString(template.caption)}">${escapeHtml(block.caption)}</p></section>`
            : image;
        }
        case "code":
          return `<pre style="${styleString(template.code)}"><code>${escapeHtml(block.code)}</code></pre>`;
        case "table":
          return renderTable(block, template);
        case "references": {
          const numberColor =
            template.id === defaultTemplate.id ? "#F96E57" : "#3F7669";
          const items = block.items
            .map(
              (item, index) =>
                `<p style="${styleString(template.referenceItem)}"><span style="display:inline-block;width:24px;font-weight:800;color:${numberColor};">${String(index + 1).padStart(2, "0")}</span>${renderInline(item, template)}</p>`,
            )
            .join("");
          return `<section>${renderDivider(template)}<section style="${styleString(template.references)}"><p style="${styleString(template.referenceTitle)}">REFERENCES · ${escapeHtml(block.title)}</p>${items}</section></section>`;
        }
        }
      })();
      return renderedBlock.replace(
        /^<([a-z][a-z0-9]*)/i,
        `<$1 data-wedraft-block-index="${blockIndex}"`,
      );
    })
    .join("");

  return sanitizeWechatHtml(`<section>${rendered}</section>`);
}

export function sanitizeWechatHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "section",
      "p",
      "span",
      "strong",
      "b",
      "em",
      "blockquote",
      "h2",
      "h3",
      "img",
      "br",
      "ul",
      "ol",
      "li",
      "a",
      "pre",
      "code",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
    ],
    allowedAttributes: {
      "*": ["style", "data-wedraft-block-index"],
      a: ["href", "style"],
      img: ["src", "alt", "style", "data-wedraft-image-id"],
    },
    allowedSchemes: ["http", "https", "asset", "data"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    parseStyleAttributes: true,
    allowedStyles: {
      "*": {
        "font-size": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "line-height": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        color: [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "letter-spacing": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "text-align": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "font-weight": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "font-style": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        background: [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "border-left": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        border: [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "border-top": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "border-bottom": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "border-right": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "border-radius": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        padding: [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "padding-left": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        margin: [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "margin-top": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "margin-bottom": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        display: [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        overflow: [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "overflow-wrap": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        width: [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        height: [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "text-decoration": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "white-space": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "word-break": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "font-family": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "table-layout": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "border-collapse": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "border-spacing": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
        "vertical-align": [/^(?!.*(?:expression|javascript|url\s*\()).+$/i],
      },
    },
    transformTags: {
      a: (_tagName, attributes) => ({
        tagName: "a",
        attribs: {
          ...attributes,
          ...(attributes.href && /^https?:\/\//i.test(attributes.href)
            ? {}
            : { href: "" }),
        },
      }),
      img: (_tagName, attributes) => ({
        tagName: "img",
        attribs: {
          ...attributes,
          ...(attributes.src &&
          /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(
            attributes.src,
          )
            ? { src: "" }
            : {}),
        },
      }),
    },
  })
    .replaceAll(/\s(?:class|id|on\w+)="[^"]*"/gi, "")
    .replaceAll(/file:\/\//gi, "");
}
