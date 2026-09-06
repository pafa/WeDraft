import { describe, expect, it } from "vitest";

import {
  htmlToMarkdown,
  parseArticle,
  parseArticleWithSourceMap,
} from "../src/index.js";

describe("parseArticle", () => {
  it("01 清理连续空行", () => {
    const result = parseArticle("# 标题\n\n\n\n第一段\n\n\n第二段");
    expect(result.blocks).toHaveLength(2);
  });

  it("02 保留中英文混排和标点", () => {
    const result = parseArticle("# Agent 时代\n\nAI 能力提升，workflow 也会变化。");
    expect(result.blocks[0]).toMatchObject({
      type: "paragraph",
      children: [{ text: "AI 能力提升，workflow 也会变化。" }],
    });
  });

  it("03 第一个一级标题作为文章标题且不进入正文", () => {
    const result = parseArticle("# 主标题\n\n正文");
    expect(result.title).toBe("主标题");
    expect(result.blocks).toHaveLength(1);
  });

  it("04 用户标题优先于 Markdown 一级标题", () => {
    const result = parseArticle("# Markdown 标题\n\n正文", {
      title: "用户标题",
    });
    expect(result.title).toBe("用户标题");
    expect(result.blocks[0]).toMatchObject({ type: "heading", level: 2 });
  });

  it("05 二三级标题层级正确", () => {
    const result = parseArticle("# 标题\n\n## 二级\n\n### 三级");
    expect(result.blocks).toMatchObject([
      { type: "heading", level: 2 },
      { type: "heading", level: 3 },
    ]);
  });

  it("06 四级及以下标题归一化为三级", () => {
    const result = parseArticle("# 标题\n\n#### 深层标题");
    expect(result.blocks[0]).toMatchObject({ type: "heading", level: 3 });
  });

  it("07 解析粗体与斜体", () => {
    const result = parseArticle("# 标题\n\n普通 **粗体** 和 *斜体*。");
    expect(result.blocks[0]).toMatchObject({
      type: "paragraph",
      children: [
        { text: "普通 " },
        { text: "粗体", bold: true },
        { text: " 和 " },
        { text: "斜体", italic: true },
        { text: "。" },
      ],
    });
  });

  it("粗体紧贴中文正文时不残留星号", () => {
    const result = parseArticle(
      "# 标题\n\n市占率**42.5%**提升，趋势**+18%**继续。",
    );
    expect(result.blocks[0]).toMatchObject({
      type: "paragraph",
      children: [
        { text: "市占率" },
        { text: "42.5%", bold: true },
        { text: "提升，趋势" },
        { text: "+18%", bold: true },
        { text: "继续。" },
      ],
    });
    expect(JSON.stringify(result.blocks)).not.toContain("**");
  });

  it("粗体内容以中文标点结尾时仍能识别", () => {
    const result = parseArticle("# 标题\n\n判断**“重要”**但不夸张。");
    expect(result.blocks[0]).toMatchObject({
      type: "paragraph",
      children: [
        { text: "判断" },
        { text: "“重要”", bold: true },
        { text: "但不夸张。" },
      ],
    });
  });

  it("不把转义星号和行内代码误判为粗体", () => {
    const result = parseArticle(
      "# 标题\n\n原样\\*\\*18%\\*\\*继续，代码 `增长**18%**继续`。",
    );
    const block = result.blocks[0];
    expect(block?.type).toBe("paragraph");
    if (block?.type !== "paragraph") return;
    expect(block.children.some((child) => child.bold)).toBe(false);
    expect(block.children.map((child) => child.text).join("")).toBe(
      "原样**18%**继续，代码 增长**18%**继续。",
    );
  });

  it("08 解析引用", () => {
    const result = parseArticle("# 标题\n\n> 重要提示");
    expect(result.blocks[0]).toMatchObject({
      type: "quote",
      children: [{ text: "重要提示" }],
    });
  });

  it("09 解析无序列表", () => {
    const result = parseArticle("# 标题\n\n- 苹果\n- 香蕉");
    expect(result.blocks[0]).toMatchObject({
      type: "list",
      ordered: false,
      items: [[{ text: "苹果" }], [{ text: "香蕉" }]],
    });
  });

  it("10 解析有序列表", () => {
    const result = parseArticle("# 标题\n\n1. 第一步\n2. 第二步");
    expect(result.blocks[0]).toMatchObject({
      type: "list",
      ordered: true,
    });
  });

  it("11 解析分割线", () => {
    const result = parseArticle("# 标题\n\n正文\n\n---\n\n结尾");
    expect(result.blocks[1]).toEqual({ type: "divider" });
  });

  it("12 仅保留 HTTP(S) 超链接", () => {
    const result = parseArticle(
      "# 标题\n\n[官网](https://example.com) 与 [危险](javascript:alert(1))",
    );
    const block = result.blocks[0];
    expect(block?.type).toBe("paragraph");
    if (block?.type !== "paragraph") return;
    expect(block.children.find((node) => node.text === "官网")?.link).toBe(
      "https://example.com",
    );
    expect(
      block.children.find((node) => node.text === "危险")?.link,
    ).toBeUndefined();
  });

  it("13 纯文本首行在合理长度且后接空行时识别标题", () => {
    const result = parseArticle("这是一篇文章标题\n\n这里是正文内容。", {
      contentType: "plain",
    });
    expect(result.title).toBe("这是一篇文章标题");
    expect(result.blocks).toHaveLength(1);
  });

  it("14 超长首行仍按固定规则作为标题", () => {
    const long = "这是一段很长的正文".repeat(20);
    const result = parseArticle(`${long}\n\n第二段`, {
      contentType: "plain",
    });
    expect(result.title).toBe(long);
    expect(result.blocks).toHaveLength(1);
  });

  it("15 自动从第一个自然段生成摘要", () => {
    const result = parseArticle("# 标题\n\n这是第一个有效自然段。\n\n第二段");
    expect(result.digest).toBe("这是第一个有效自然段。");
  });

  it("16 保留表情与特殊符号", () => {
    const result = parseArticle("# 标题\n\n你好 👋 © → 「测试」");
    expect(JSON.stringify(result.blocks)).toContain("👋");
  });

  it("17 不闭合 Markdown 不会抛错", () => {
    expect(() => parseArticle("# 标题\n\n**没有闭合")).not.toThrow();
  });

  it("18 解析远程正文图片", () => {
    const result = parseArticle(
      "# 标题\n\n![说明](https://img.example.com/a.jpg \"图注\")",
    );
    expect(result.blocks[0]).toMatchObject({
      type: "image",
      id: "image-1",
      remoteUrl: "https://img.example.com/a.jpg",
      alt: "说明",
      caption: "图注",
    });
  });

  it("19 解析本地相对图片并保留占位", () => {
    const result = parseArticle("# 标题\n\n![说明](./images/a.jpg)");
    expect(result.blocks[0]).toMatchObject({
      type: "image",
      localPath: "./images/a.jpg",
    });
  });

  it("20 将代码块解析为独立代码元素", () => {
    const result = parseArticle("# 标题\n\n```js\nalert('x')\n```");
    expect(result.blocks[0]).toMatchObject({
      type: "code",
      language: "js",
      code: "alert('x')",
    });
  });

  it("解析 GFM 表格、单元格强调和列对齐", () => {
    const result = parseArticle(
      "标题\n\n| 指标 | 当前值 | 状态 |\n| :--- | ---: | :---: |\n| 用户数 | **12,800** | 增长 |",
    );
    expect(result.blocks[0]).toMatchObject({
      type: "table",
      align: ["left", "right", "center"],
      header: [
        [{ text: "指标" }],
        [{ text: "当前值" }],
        [{ text: "状态" }],
      ],
      rows: [
        [
          [{ text: "用户数" }],
          [{ text: "12,800", bold: true }],
          [{ text: "增长" }],
        ],
      ],
    });
  });

  it("21 ChatGPT Markdown 不残留标记", () => {
    const result = parseArticle(
      "# Agent 趋势\n\n## 判断\n\n**核心观点**\n\n- 能力\n- 成本\n\n> 结论",
    );
    expect(JSON.stringify(result)).not.toContain("**");
    expect(result.blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "list",
      "quote",
    ]);
  });

  it("金句引用保留内部粗体标记", () => {
    const result = parseArticle(
      "# 标题\n\n> **真正值得单独展示的金句。**",
    );
    expect(result.blocks[0]).toMatchObject({
      type: "quote",
      children: [
        {
          text: "真正值得单独展示的金句。",
          bold: true,
        },
      ],
    });
  });

  it("22 Word HTML 清理 class 和冗余节点", () => {
    const markdown = htmlToMarkdown(
      '<meta charset="utf-8"><p class="MsoNormal"><b>Word 粗体</b></p><o:p></o:p>',
    );
    expect(markdown).toContain("**Word 粗体**");
    expect(markdown).not.toContain("MsoNormal");
  });

  it("23 HTML 自动转换为结构化文档", () => {
    const result = parseArticle(
      "<h1>网页标题</h1><h2>章节</h2><p>正文 <strong>重点</strong></p>",
    );
    expect(result.title).toBe("网页标题");
    expect(result.blocks).toMatchObject([
      { type: "heading", level: 2 },
      {
        type: "paragraph",
        children: [{ text: "正文 " }, { text: "重点", bold: true }],
      },
    ]);
  });

  it("24 删除恶意 script、iframe 和事件属性", () => {
    const result = parseArticle(
      '<h1>标题</h1><script>alert(1)</script><p onclick="steal()">安全正文</p><iframe src="https://evil.test"></iframe>',
      { contentType: "html" },
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("alert");
    expect(serialized).not.toContain("iframe");
    expect(serialized).not.toContain("onclick");
    expect(serialized).toContain("安全正文");
  });

  it("25 单行内容作为标题且正文为空", () => {
    const result = parseArticle("只有一行正文，没有标题");
    expect(result.title).toBe("只有一行正文，没有标题");
    expect(result.blocks).toHaveLength(0);
  });

  it("26 超长段落完整保留", () => {
    const paragraph = "内容".repeat(5_000);
    const result = parseArticle(`# 标题\n\n${paragraph}`);
    expect(JSON.stringify(result.blocks)).toContain(paragraph);
  });

  it("27 第一行固定为标题，第二行立即开始正文", () => {
    const result = parseArticle("固定标题\n第二行正文\n第三行继续");
    expect(result.title).toBe("固定标题");
    expect(result.blocks).toMatchObject([
      {
        type: "paragraph",
        children: [{ text: "第二行正文\n第三行继续" }],
      },
    ]);
    expect(JSON.stringify(result.blocks)).not.toContain("固定标题");
  });

  it("28 识别文末参考来源及编号条目", () => {
    const result = parseArticle(
      "标题\n\n正文\n\n## 参考来源\n\n1. 第一项\n2. 第二项",
    );
    expect(result.blocks.at(-1)).toMatchObject({
      type: "references",
      title: "参考来源",
      items: [[{ text: "第一项" }], [{ text: "第二项" }]],
    });
  });

  it("29 保留标题、正文、列表和参考来源对应的 Markdown 行号", () => {
    const result = parseArticleWithSourceMap(
      "标题\n\n第一段\n\n- 甲\n- 乙\n\n## 参考来源\n\n1. 来源甲",
    );
    expect(result.sourceMap).toEqual([
      { blockIndex: -1, startLine: 1, endLine: 1 },
      { blockIndex: 0, startLine: 3, endLine: 3 },
      { blockIndex: 1, startLine: 5, endLine: 6 },
      { blockIndex: 2, startLine: 8, endLine: 10 },
    ]);
  });

  it("30 输入开头存在空行时仍保留真实行号", () => {
    const result = parseArticleWithSourceMap(
      "\n\n标题\n\n正文",
    );
    expect(result.sourceMap).toEqual([
      { blockIndex: -1, startLine: 3, endLine: 3 },
      { blockIndex: 0, startLine: 5, endLine: 5 },
    ]);
  });
});
