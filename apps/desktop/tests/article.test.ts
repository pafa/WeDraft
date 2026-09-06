import { describe, expect, it } from "vitest";

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
});
