import { describe, expect, it } from "vitest";

import type { ArticleDocument } from "@wedraft/shared-types";

import {
  availableTemplates,
  defaultTemplate,
  getTemplateById,
  renderWechatHtml,
  sanitizeWechatHtml,
} from "../src/index.js";

const document: ArticleDocument = {
  title: "标题",
  author: "作者",
  digest: "摘要",
  blocks: [
    {
      type: "paragraph",
      children: [
        { text: "普通 " },
        { text: "粗体", bold: true },
        { text: " 链接", link: "https://example.com" },
      ],
    },
    { type: "heading", level: 2, children: [{ text: "章节" }] },
    { type: "quote", children: [{ text: "引用" }] },
    { type: "divider" },
    { type: "image", id: "image-1", localPath: "./image.jpg" },
  ],
};

describe("renderWechatHtml", () => {
  it("输出内联 CSS 和允许标签", () => {
    const html = renderWechatHtml(document);
    expect(html).toContain(`font-size:${defaultTemplate.body["font-size"]}`);
    expect(html).toContain("<strong style=");
    expect(html).toContain(">粗体</strong>");
    expect(html).toContain("<h2");
    expect(html).toContain("color:#FFA900");
    expect(html).toContain('data-wedraft-block-index="0"');
  });

  it("只提供小哈公社和小哈公社New两种模板", () => {
    expect(availableTemplates.map((template) => template.id)).toEqual([
      "default-business",
      "next-edition",
    ]);
    expect(getTemplateById("next-edition").name).toBe("小哈公社New");
    expect(getTemplateById("missing")).toBe(defaultTemplate);
  });

  it("小哈公社New区分章节、参考说明与重点", () => {
    const nextEdition = getTemplateById("next-edition");
    const html = renderWechatHtml(
      {
        ...document,
        blocks: [
          {
            type: "heading",
            level: 2,
            children: [{ text: "2. 阅读体验" }],
          },
          {
            type: "heading",
            level: 3,
            children: [{ text: "二级章节" }],
          },
          {
            type: "paragraph",
            children: [{ text: "参考：行业排版规范" }],
          },
          {
            type: "paragraph",
            children: [{ text: "重点", bold: true }],
          },
          {
            type: "code",
            language: "js",
            code: "const safe = true;",
          },
        ],
      },
      nextEdition,
    );
    expect(html).toContain("SECTION 02");
    expect(html).toContain("color:#FFA900");
    expect(html).toContain("color:#008DB9");
    expect(html).toContain("border-left:2px solid #D0DCD7");
    expect(html).toContain("color:#185548");
    expect(html).toContain("<pre");
    expect(html).toContain("<code>const safe = true;</code>");
  });

  it("引用样式在内容同一行开头显示中文左双引号", () => {
    const businessHtml = renderWechatHtml(document, defaultTemplate);
    const nextHtml = renderWechatHtml(
      document,
      getTemplateById("next-edition"),
    );
    expect(businessHtml).toContain(
      'display:inline-block;font-size:26px',
    );
    expect(businessHtml).toContain('color:#F96E57;margin:0 7px 0 0">“</span>引用');
    expect(nextHtml).toContain('color:#7B9F93;margin:0 7px 0 0">“</span>引用');
    expect(nextHtml).not.toContain('>“</span><span style="display:block">');
  });

  it("两套模板都提供独立的参考来源样式", () => {
    const referenceDocument: ArticleDocument = {
      ...document,
      blocks: [
        {
          type: "references",
          title: "参考来源",
          items: [
            [{ text: "第一项" }],
            [{ text: "第二项" }],
          ],
        },
      ],
    };
    const businessHtml = renderWechatHtml(
      referenceDocument,
      defaultTemplate,
    );
    const nextHtml = renderWechatHtml(
      referenceDocument,
      getTemplateById("next-edition"),
    );
    expect(businessHtml).toContain("background:#FFF8EE");
    expect(businessHtml).toContain("color:#F96E57");
    expect(nextHtml).toContain("border:1px solid #D8E2DE");
    expect(nextHtml).toContain("color:#3F7669");
    expect(nextHtml).toContain("REFERENCES · 参考来源");
    expect(nextHtml).toContain(">01</span>第一项");
  });

  it("每个一级章节和参考来源前自动显示模板分割线且不重复", () => {
    const chapterDocument: ArticleDocument = {
      ...document,
      blocks: [
        {
          type: "heading",
          level: 2,
          children: [{ text: "1. 第一章" }],
        },
        { type: "divider" },
        {
          type: "heading",
          level: 2,
          children: [{ text: "2. 第二章" }],
        },
        { type: "divider" },
        {
          type: "references",
          title: "参考来源",
          items: [[{ text: "第一项" }]],
        },
      ],
    };

    const businessHtml = renderWechatHtml(
      chapterDocument,
      defaultTemplate,
    );
    const nextHtml = renderWechatHtml(
      chapterDocument,
      getTemplateById("next-edition"),
    );

    expect(businessHtml.match(/border-top:1px solid #F0DED5/g)).toHaveLength(
      3,
    );
    expect(nextHtml.match(/border-top:1px solid #D8E0DD/g)).toHaveLength(3);
  });

  it("两套排版都只渲染用户正文，不追加固定尾注", () => {
    const businessHtml = renderWechatHtml(document, defaultTemplate);
    const nextHtml = renderWechatHtml(
      document,
      getTemplateById("next-edition"),
    );

    for (const html of [businessHtml, nextHtml]) {
      expect(html).not.toContain("谢谢您看到了这里");
      expect(html).not.toContain("- End -");
      expect(html).not.toContain("封面海报@豆包AI");
      expect(html).not.toContain("合作或投稿");
    }
  });

  it("两套模板都渲染自适应 GFM 表格并保留对齐与强调", () => {
    const tableDocument: ArticleDocument = {
      ...document,
      blocks: [
        {
          type: "table",
          header: [
            [{ text: "指标" }],
            [{ text: "当前值" }],
            [{ text: "变化" }],
          ],
          rows: [
            [
              [{ text: "用户数" }],
              [{ text: "12,800" }],
              [{ text: "+18%", bold: true }],
            ],
            [
              [{ text: "转化率" }],
              [{ text: "6.4%" }],
              [{ text: "-0.7%" }],
            ],
          ],
          align: ["left", "right", "center"],
        },
      ],
    };
    const businessHtml = renderWechatHtml(tableDocument, defaultTemplate);
    const nextHtml = renderWechatHtml(
      tableDocument,
      getTemplateById("next-edition"),
    );

    for (const html of [businessHtml, nextHtml]) {
      expect(html).toContain("<table");
      expect(html).toContain("<thead><tr>");
      expect(html).toContain("<tbody><tr>");
      expect(html).toContain("table-layout:fixed");
      expect(html).toContain("width:100%");
      expect(html).toContain("text-align:right");
      expect(html).toContain("text-align:center");
      expect(html).toContain(">+18%</strong>");
      expect(html.match(/<tr>/g)).toHaveLength(3);
    }
    expect(businessHtml).toContain("border-top:3px solid #F36C21");
    expect(businessHtml).toContain("background:#FFF0E4");
    expect(nextHtml).toContain("border-top:3px solid #008DB9");
    expect(nextHtml).toContain("background:#E8F3EF");
  });

  it("本地图片输出可替换占位符", () => {
    expect(renderWechatHtml(document)).toContain(
      'data-wedraft-image-id="image-1"',
    );
  });

  it("正文缓存图片使用 Tauri asset 地址进行实时预览", () => {
    const html = renderWechatHtml({
      ...document,
      blocks: [
        {
          type: "image",
          id: "cached-image",
          localPath:
            "wedraft://image/cached-image?path=%2Fapp%2Fimages%2Fcached.png",
          previewUrl: "asset://localhost/app/images/cached.png",
          alt: "缓存图片",
        },
      ],
    });
    expect(html).toContain(
      'src="asset://localhost/app/images/cached.png"',
    );
    expect(html).toContain('alt="缓存图片"');
  });

  it("应用内示例图片保留 8px 边距并在右下显示灰色来源", () => {
    const html = renderWechatHtml({
      ...document,
      blocks: [
        {
          type: "image",
          id: "sample-image",
          localPath: "/assets/sample.svg",
          alt: "示例",
          caption: "图片来源：WeDraft",
        },
      ],
    });
    expect(html).toContain('src="/assets/sample.svg"');
    expect(html).toContain("width:calc(100% - 16px)");
    expect(html).toContain("margin:28px 8px 7px");
    expect(html).toContain("font-size:11px");
    expect(html).toContain("color:#999999");
    expect(html).toContain("text-align:right");
    expect(html).toContain("图片来源：WeDraft");
  });

  it("移除脚本、事件、class 和本地地址", () => {
    const html = sanitizeWechatHtml(
      '<section class="x"><script>alert(1)</script><p onclick="x()">ok</p><img src="file:///tmp/a.jpg"><img src="http://localhost:1420/a.jpg"></section>',
    );
    expect(html).not.toMatch(
      /script|onclick|class=|file:\/\/|http:\/\/localhost/,
    );
    expect(html).toContain("ok");
  });

  it("转义正文中的 HTML 字符", () => {
    const html = renderWechatHtml({
      ...document,
      blocks: [
        { type: "paragraph", children: [{ text: "<img onerror=x>" }] },
      ],
    });
    expect(html).toContain("&lt;img onerror=x&gt;");
    expect(html).not.toContain("<img onerror");
  });
});
