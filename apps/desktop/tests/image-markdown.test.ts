import { describe, expect, it } from "vitest";

import { buildBodyImageMarkdown } from "../src/services/image-markdown.js";

describe("body image markdown", () => {
  it("带来源时生成可渲染和复制的图片图注", () => {
    expect(
      buildBodyImageMarkdown(
        "购物车.png",
        "wedraft://image/hash?path=%2Fimage.png",
        "图片来源：作者拍摄",
      ),
    ).toBe(
      '\n\n![购物车.png](wedraft://image/hash?path=%2Fimage.png "图片来源：作者拍摄")\n\n',
    );
  });

  it("选择无来源时不生成图片来源占位文字", () => {
    const markdown = buildBodyImageMarkdown(
      "购物车.png",
      "wedraft://image/hash?path=%2Fimage.png",
      "",
    );
    expect(markdown).toBe(
      "\n\n![购物车.png](wedraft://image/hash?path=%2Fimage.png)\n\n",
    );
    expect(markdown).not.toContain("图片来源");
  });
});
