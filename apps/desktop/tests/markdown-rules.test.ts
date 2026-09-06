import { describe, expect, it } from "vitest";

import { MARKDOWN_RULES_PROMPT } from "../src/markdown-rules.js";

describe("Markdown rules prompt", () => {
  it("要求 ChatGPT 只排版、不改稿，并默认禁止新建表格", () => {
    expect(
      MARKDOWN_RULES_PROMPT.startsWith(
        "请只对上面的最新版文章添加 WeDraft 支持的 Markdown 排版标记。",
      ),
    ).toBe(true);
    expect(MARKDOWN_RULES_PROMPT).toContain("只排版，不改稿");
    expect(MARKDOWN_RULES_PROMPT).toContain(
      "原文的标题、正文、事实、数据、观点、措辞、语气、标点、段落顺序和信息量必须保持不变",
    );
    expect(MARKDOWN_RULES_PROMPT).toContain("~~~markdown");
    expect(MARKDOWN_RULES_PROMPT).toContain(
      "代码块外不能出现解释、提示、总结或“已完成”等文字",
    );
    expect(MARKDOWN_RULES_PROMPT).toContain("不要把 Markdown 渲染成普通富文本");
    expect(MARKDOWN_RULES_PROMPT).toContain("点击代码块右上角的复制按钮");
    expect(MARKDOWN_RULES_PROMPT).toContain("第一行保留原文标题");
    expect(MARKDOWN_RULES_PROMPT).toContain("## 1. 章节标题");
    expect(MARKDOWN_RULES_PROMPT).toContain("### 二级章节标题");
    expect(MARKDOWN_RULES_PROMPT).toContain(
      "原文已有的一级章节使用连续编号，并在前面添加分割线",
    );
    expect(MARKDOWN_RULES_PROMPT).toContain("普通金句只加粗");
    expect(MARKDOWN_RULES_PROMPT).toContain(
      "市占率**42.5%**提升。不要为了加粗而改变原文空格",
    );
    expect(MARKDOWN_RULES_PROMPT).toContain(
      "> **这是一句特别重要、需要独立展示的核心观点。**",
    );
    expect(MARKDOWN_RULES_PROMPT).toContain("“>”后必须保留一个空格");
    expect(MARKDOWN_RULES_PROMPT).toContain("【表格：默认禁止新建】");
    expect(MARKDOWN_RULES_PROMPT).toContain(
      "不得从普通段落、列表或分散叙述中提取内容、改写表头或重组数据来制作表格",
    );
    expect(MARKDOWN_RULES_PROMPT).toContain(
      "用户明确要求“把这一段转成表格”时",
    );
    expect(MARKDOWN_RULES_PROMPT).toContain("标准 GFM Markdown 管道语法");
    expect(MARKDOWN_RULES_PROMPT).toContain("| 指标 | 当前值 | 变化 |");
    expect(MARKDOWN_RULES_PROMPT).toContain("列数必须完全一致");
    expect(MARKDOWN_RULES_PROMPT).toContain("2 至 4 列");
    expect(MARKDOWN_RULES_PROMPT).toContain("写成“\\|”");
    expect(MARKDOWN_RULES_PROMPT).toContain("不输出 HTML 表格");
    expect(MARKDOWN_RULES_PROMPT).toContain(
      '![原图片说明](图片地址 "图片来源：原来源")',
    );
    expect(MARKDOWN_RULES_PROMPT).toContain("## 参考来源");
    expect(MARKDOWN_RULES_PROMPT).toContain("1 至 10 条有序列表");
    expect(MARKDOWN_RULES_PROMPT).toContain(
      "不要主动添加感谢语、“- End -”、封面海报来源或联系信息",
    );
    expect(
      MARKDOWN_RULES_PROMPT.endsWith(
        "上面的最新版，直接按照以上规则输出最终文章。",
      ),
    ).toBe(true);
  });
});
