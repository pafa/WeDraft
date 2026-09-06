// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import type { ArticleDocument } from "@wedraft/shared-types";
import { renderWechatHtml } from "@wedraft/wechat-renderer";

import { prepareClipboardHtml } from "../src/services/clipboard.js";

describe("rich clipboard", () => {
  it("把本地缓存图片嵌入 HTML 并移除内部标记", async () => {
    const document: ArticleDocument = {
      title: "标题",
      author: "",
      digest: "",
      blocks: [
        {
          type: "image",
          id: "image-a",
          localPath: "wedraft://image/image-a?path=%2Ftmp%2Fimage.png",
        },
      ],
    };
    const html = await prepareClipboardHtml(
      document,
      '<section><img data-wedraft-image-id="image-a"></section>',
      async () => ({
        base64: "cG5n",
        fileName: "image.png",
        mimeType: "image/png",
      }),
    );
    expect(html).toContain("data:image/png;base64,cG5n");
    expect(html).not.toContain("data-wedraft-image-id");
    expect(html).not.toContain("标题");
    expect(html).toContain("<!--StartFragment-->");
  });

  it("复制内容不自动添加顶部 GIF 或固定页脚", async () => {
    const document: ArticleDocument = {
      title: "标题",
      author: "",
      digest: "",
      blocks: [],
    };
    const html = await prepareClipboardHtml(
      document,
      "<section><p>正文</p></section>",
    );
    expect(html).toContain("<p>正文</p>");
    expect(html).not.toContain("data:image/gif");
    expect(html).not.toContain("谢谢您看到了这里");
    expect(html).not.toContain("- End -");
  });

  it("复制富文本时保留真实表格结构和内联样式", async () => {
    const document: ArticleDocument = {
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
    };
    const html = await prepareClipboardHtml(
      document,
      renderWechatHtml(document),
    );

    expect(html).toContain("<table");
    expect(html).toContain("<thead><tr>");
    expect(html).toContain("<tbody><tr>");
    expect(html).toContain("table-layout:fixed");
    expect(html).toContain("text-align:right");
  });
});
