import { describe, expect, it } from "vitest";
import { hasBlockingIssues } from "@wedraft/validation";

import {
  buildArticle,
  countArticleCharacters,
} from "../src/services/article.js";

describe("desktop article pipeline", () => {
  it("解析并渲染实时预览", () => {
    const result = buildArticle({
      markdown: "标题\n\n## 章节\n\n正文 **重点**",
      author: "作者",
      digest: "",
      sourceUrl: "",
    });
    expect(result.document.digest).toBe("正文 重点");
    expect(result.html).toContain("<h2");
    expect(result.html).toContain(">重点</strong>");
    expect(result.html).not.toContain("wedraft-brand-header.gif");
    expect(result.html).not.toContain("谢谢您看到了这里");
  });

  it("本地正文图片使用稳定哈希作为占位 ID", () => {
    const hash = "a".repeat(64);
    const localPath =
      `wedraft://image/${hash}?path=%2Ftmp%2Fimage.jpg`;
    const result = buildArticle({
      markdown: `标题\n![图片](${localPath})`,
      author: "",
      digest: "",
      sourceUrl: "",
      imagePreviewUrls: {
        [localPath]: "data:image/png;base64,iVBORw0KGgo=",
      },
    });
    expect(result.document.blocks[0]).toMatchObject({
      type: "image",
      id: hash,
      previewUrl: "data:image/png;base64,iVBORw0KGgo=",
    });
    expect(result.html).toContain(`data-wedraft-image-id="${hash}"`);
    expect(result.html).toContain(
      'src="data:image/png;base64,iVBORw0KGgo="',
    );
  });

  it("统计标题与可见正文字符，不计 Markdown 标记和空白", () => {
    const result = buildArticle({
      markdown: "标题\n\n## 章节\n\n正文 **重点**",
      author: "",
      digest: "",
      sourceUrl: "",
    });

    expect(countArticleCharacters(result.document)).toBe(8);
  });

  it("HTML 代码示例保留 Markdown 内容和原始行映射", () => {
    const result = buildArticle({
      markdown: "示例标题\n\n```html\n<div>literal</div>\n```\n\n## 1. 后续\n\n正文末尾",
      author: "", digest: "", sourceUrl: "",
    });
    expect(result.document.title).toBe("示例标题");
    expect(result.document.blocks).toEqual([
      { type: "code", code: "<div>literal</div>", language: "html" },
      { type: "heading", level: 2, children: [{ text: "1. 后续" }] },
      { type: "paragraph", children: [{ text: "正文末尾" }] },
    ]);
    expect(result.sourceMap).toEqual([
      { blockIndex: -1, startLine: 1, endLine: 1 },
      { blockIndex: 0, startLine: 3, endLine: 5 },
      { blockIndex: 1, startLine: 7, endLine: 7 },
      { blockIndex: 2, startLine: 9, endLine: 9 },
    ]);
    expect(result.html).toContain("&lt;div&gt;literal&lt;/div&gt;");
    expect(hasBlockingIssues(result.issues)).toBe(false);
  });

  it.each([
    ["引用式链接", "请阅读[关键原文][source]，然后继续。\n\n[source]: https://example.com"],
    ["嵌套列表", "- 父级条目\n  - 子级重要正文\n- 末项"],
  ])("%s不能在内容丢失时通过复制检查", (_name, body) => {
    const result = buildArticle({
      markdown: `标题\n\n${body}`,
      author: "", digest: "", sourceUrl: "",
    });
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "UNSUPPORTED_MARKDOWN", level: "blocking", startLine: 3,
      blockIndex: 0,
    }));
    expect(hasBlockingIssues(result.issues)).toBe(true);
  });
});
