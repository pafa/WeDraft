// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { parseArticleWithSourceMap } from "@wedraft/article-parser";

import {
  markdownForPreviewEdit,
  replaceMarkdownSourceRange,
} from "../src/services/preview-edit.js";

describe("preview micro editing", () => {
  it("只替换对应正文范围", () => {
    const markdown = "标题\n\n第一段\n\n第二段";
    const parsed = parseArticleWithSourceMap(markdown);
    expect(
      replaceMarkdownSourceRange(
        markdown,
        parsed.sourceMap,
        0,
        "第一段已修改",
      ),
    ).toBe("标题\n\n第一段已修改\n\n第二段");
  });

  it("编辑一级章节时保留章节编号", () => {
    const parsed = parseArticleWithSourceMap("标题\n\n## 1. 原章节");
    const block = parsed.document.blocks[0];
    const root = document.createElement("section");
    const target = document.createElement("span");
    target.dataset.wedraftEditKind = "heading";
    target.textContent = "新章节";
    root.append(target);
    expect(block?.type).toBe("heading");
    if (!block || block.type !== "heading") return;
    expect(markdownForPreviewEdit(block, target, root)).toBe(
      "## 1. 新章节",
    );
  });

  it("编辑表格单元格后仍输出标准 GFM 表格", () => {
    const parsed = parseArticleWithSourceMap(
      "标题\n\n| 名称 | 数值 |\n| --- | ---: |\n| A | 1 |",
    );
    const block = parsed.document.blocks[0];
    const root = document.createElement("section");
    root.innerHTML =
      '<table><tr><th data-wedraft-edit-kind="table-cell">名称</th><th data-wedraft-edit-kind="table-cell">数值</th></tr><tr><td data-wedraft-edit-kind="table-cell">项目 A</td><td data-wedraft-edit-kind="table-cell">2</td></tr></table>';
    const target = root.querySelector<HTMLElement>("td");
    expect(block?.type).toBe("table");
    if (!block || block.type !== "table" || !target) return;
    expect(markdownForPreviewEdit(block, target, root)).toBe(
      "| 名称 | 数值 |\n| --- | ---: |\n| 项目 A | 2 |",
    );
  });
});
