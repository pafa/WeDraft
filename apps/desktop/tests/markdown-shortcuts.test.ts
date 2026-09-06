import { describe, expect, it } from "vitest";

import {
  applyMarkdownShortcut,
  isMarkdownShortcutActive,
  type MarkdownShortcut,
} from "../src/services/markdown-shortcuts.js";

function format(
  text: string,
  shortcut: MarkdownShortcut,
): string {
  return applyMarkdownShortcut(text, 0, text.length, shortcut).markdown;
}

describe("Markdown shortcut transformations", () => {
  it("转换标题、粗体与引用", () => {
    expect(format("章节", "heading1")).toBe("## 1. 章节");
    expect(format("小标题", "heading2")).toBe("### 小标题");
    expect(format("重点词", "bold")).toBe("**重点词**");
    expect(format("引用内容", "quote")).toBe("> 引用内容");
  });

  it("光标位于行内即可切换和取消一级标题", () => {
    const enabled = applyMarkdownShortcut(
      "前言\n章节标题\n正文",
      5,
      5,
      "heading1",
    );
    expect(enabled.markdown).toBe("前言\n## 1. 章节标题\n正文");

    const disabled = applyMarkdownShortcut(
      enabled.markdown,
      enabled.selectionStart,
      enabled.selectionEnd,
      "heading1",
    );
    expect(disabled.markdown).toBe("前言\n章节标题\n正文");
  });

  it("只选择行内部分文字也会切换整行二级标题", () => {
    const enabled = applyMarkdownShortcut(
      "前言\n这是二级标题\n正文",
      7,
      10,
      "heading2",
    );
    expect(enabled.markdown).toBe("前言\n### 这是二级标题\n正文");

    const switched = applyMarkdownShortcut(
      enabled.markdown,
      enabled.selectionStart,
      enabled.selectionEnd,
      "heading1",
    );
    expect(switched.markdown).toBe("前言\n## 1. 这是二级标题\n正文");
  });

  it("转换列表与代码", () => {
    expect(format("甲\n乙", "unordered-list")).toBe("- 甲\n- 乙");
    expect(format("甲\n乙", "ordered-list")).toBe("1. 甲\n2. 乙");
    expect(format("value", "inline-code")).toBe("`value`");
    expect(format("const a = 1;", "code-block")).toBe(
      "```text\nconst a = 1;\n```",
    );
  });

  it("插入表格并把制表符分隔的数据转换为 GFM 表格", () => {
    expect(format("", "table")).toBe(
      "| 项目 | 说明 | 数据 |\n| :--- | :--- | ---: |\n| 示例 A | 简洁描述 | 100 |\n| 示例 B | 简洁描述 | 80 |",
    );
    expect(format("项目\t数据\n甲\t100\n乙\t80", "table")).toBe(
      "| 项目 | 数据 |\n| :--- | :--- |\n| 甲 | 100 |\n| 乙 | 80 |",
    );
  });

  it("粗体和行内代码支持包裹、光标识别与再次取消", () => {
    const bold = applyMarkdownShortcut("重点词", 0, 3, "bold");
    expect(bold.markdown).toBe("**重点词**");
    expect(
      isMarkdownShortcutActive(
        bold.markdown,
        bold.selectionStart,
        bold.selectionEnd,
        "bold",
      ),
    ).toBe(true);
    expect(
      applyMarkdownShortcut(
        bold.markdown,
        bold.selectionStart,
        bold.selectionEnd,
        "bold",
      ).markdown,
    ).toBe("重点词");
    expect(applyMarkdownShortcut("前`代码`后", 4, 4, "inline-code").markdown)
      .toBe("前代码后");
  });

  it("引用、列表和说明按光标所在行切换并可互换", () => {
    expect(applyMarkdownShortcut("正文", 1, 1, "quote").markdown)
      .toBe("> 正文");
    expect(applyMarkdownShortcut("> 正文", 3, 3, "quote").markdown)
      .toBe("正文");
    expect(
      applyMarkdownShortcut("- 甲\n- 乙", 0, 7, "ordered-list").markdown,
    ).toBe("1. 甲\n2. 乙");
    expect(applyMarkdownShortcut("说明：补充", 4, 4, "note").markdown)
      .toBe("补充");
  });

  it("代码块与分隔线都支持再次点击取消", () => {
    const code = applyMarkdownShortcut("const a = 1;", 0, 12, "code-block");
    expect(code.markdown).toBe("```text\nconst a = 1;\n```");
    expect(
      applyMarkdownShortcut(
        code.markdown,
        code.selectionStart,
        code.selectionEnd,
        "code-block",
      ).markdown,
    ).toBe("const a = 1;");
    expect(applyMarkdownShortcut("---", 1, 1, "divider").markdown).toBe("");
    expect(applyMarkdownShortcut("正文", 1, 1, "divider").markdown)
      .toBe("正文\n\n---\n");
  });

  it("参考来源始终追加到文末且不会重复创建", () => {
    const inserted = applyMarkdownShortcut(
      "文章标题\n\n正文",
      8,
      8,
      "references",
    );
    expect(inserted.markdown).toContain(
      "正文\n\n## 参考来源\n\n1. 来源名称或资料说明",
    );
    const existing = applyMarkdownShortcut(
      inserted.markdown,
      0,
      0,
      "references",
    );
    expect(existing.markdown).toBe(inserted.markdown);
    expect(existing.selectionStart).toBe(
      inserted.markdown.indexOf("## 参考来源"),
    );
  });

  it("返回光标位置对应的按钮激活状态", () => {
    expect(
      isMarkdownShortcutActive("## 1. 标题", 5, 5, "heading1"),
    ).toBe(true);
    expect(
      isMarkdownShortcutActive("## 1. 标题", 5, 5, "heading2"),
    ).toBe(false);
    expect(
      isMarkdownShortcutActive("> 引用", 3, 3, "quote"),
    ).toBe(true);
  });

  it("插入分隔线、图片、说明与参考来源", () => {
    expect(format("", "divider")).toBe("---");
    expect(format("购物车", "image")).toBe(
      '![购物车](图片地址 "图片来源：来源名称")',
    );
    expect(format("补充内容", "note")).toBe("说明：补充内容");
    expect(format("来源甲\n来源乙", "references")).toBe(
      "## 参考来源\n\n1. 来源甲\n2. 来源乙",
    );
  });
});
