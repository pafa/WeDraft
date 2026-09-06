import { describe, expect, it } from "vitest";

import {
  documentPlainText,
  generateDigest,
  normalizeDocument,
} from "../src/index.js";

describe("article model", () => {
  it("复制纯文本只包含正文，不包含标题", () => {
    expect(
      documentPlainText({
        title: "不会被复制的标题",
        author: "",
        digest: "",
        blocks: [
          { type: "paragraph", children: [{ text: "只复制这段正文" }] },
        ],
      }),
    ).toBe("只复制这段正文");
  });

  it("摘要来自第一个有效自然段", () => {
    expect(
      generateDigest({
        blocks: [
          { type: "heading", level: 2, children: [{ text: "章节" }] },
          { type: "paragraph", children: [{ text: "正文摘要" }] },
        ],
      }),
    ).toBe("正文摘要");
  });

  it("删除空段落", () => {
    expect(
      normalizeDocument({
        title: " 标题 ",
        author: "",
        digest: "",
        blocks: [
          { type: "paragraph", children: [{ text: " " }] },
          { type: "paragraph", children: [{ text: "正文" }] },
        ],
      }).blocks,
    ).toHaveLength(1);
  });

  it("表格参与纯文本与字数统计", () => {
    expect(
      documentPlainText({
        title: "标题",
        author: "",
        digest: "",
        blocks: [
          {
            type: "table",
            header: [[{ text: "项目" }], [{ text: "数据" }]],
            rows: [[[{ text: "用户" }], [{ text: "100" }]]],
            align: ["left", "right"],
          },
        ],
      }),
    ).toBe("项目\t数据\n用户\t100");
  });

});
