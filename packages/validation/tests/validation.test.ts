import { describe, expect, it } from "vitest";

import {
  copyPreflightIssues,
  hasBlockingIssues,
  validateArticle,
} from "../src/index.js";

describe("validateArticle", () => {
  it("拦截空标题和空正文", () => {
    const issues = validateArticle({
      document: {
        title: "",
        author: "",
        digest: "",
        blocks: [],
      },
    });
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["TITLE_EMPTY", "BODY_EMPTY"]),
    );
    expect(hasBlockingIssues(issues)).toBe(true);
  });

  it("外部图片只警告并提示粘贴后检查", () => {
    const issues = validateArticle({
      document: {
        title: "标题",
        author: "",
        digest: "摘要",
        blocks: [
          { type: "paragraph", children: [{ text: "足够长的正文".repeat(30) }] },
          {
            type: "image",
            id: "image-1",
            remoteUrl: "https://example.com/a.jpg",
          },
        ],
      },
    });
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "REMOTE_IMAGE", level: "warning" }),
    );
    expect(hasBlockingIssues(issues)).toBe(false);
  });

  it("精确标记表格兼容性问题所在的区块", () => {
    const issues = validateArticle({
      document: {
        title: "标题",
        author: "",
        digest: "摘要",
        blocks: [
          { type: "paragraph", children: [{ text: "正文".repeat(80) }] },
          {
            type: "table",
            header: ["A", "B", "C", "D", "E"].map((text) => [{ text }]),
            rows: [["1", "2", "3", "4", "5"].map((text) => [{ text }])],
            align: [null, null, null, null, null],
          },
        ],
      },
    });

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "TABLE_TOO_WIDE",
        level: "warning",
        blockIndex: 1,
      }),
    );
  });

  it("复制预检只显示硬性问题和微信兼容性提醒", () => {
    const issues = validateArticle({
      document: {
        title: "标题",
        author: "",
        digest: "",
        blocks: [
          { type: "divider" },
          { type: "heading", level: 2, children: [{ text: "2. 错误编号" }] },
          { type: "paragraph", children: [{ text: "短正文" }] },
        ],
      },
    });
    const preflight = copyPreflightIssues(issues);

    expect(preflight.map((issue) => issue.code)).toContain("SECTION_NUMBERING");
    expect(preflight.map((issue) => issue.code)).not.toContain("DIGEST_EMPTY");
    expect(preflight.map((issue) => issue.code)).not.toContain("BODY_SHORT");
    expect(preflight.find((issue) => issue.code === "SECTION_NUMBERING"))
      .toEqual(expect.objectContaining({ blockIndex: 1 }));
  });

  it("修正章节编号和分隔线后即可通过复制预检", () => {
    const issues = validateArticle({
      document: {
        title: "标题",
        author: "",
        digest: "摘要",
        blocks: [
          { type: "paragraph", children: [{ text: "导语".repeat(60) }] },
          { type: "divider" },
          { type: "heading", level: 2, children: [{ text: "1. 正确章节" }] },
          { type: "paragraph", children: [{ text: "正文".repeat(60) }] },
        ],
      },
    });

    expect(copyPreflightIssues(issues)).toEqual([]);
  });

  it("识别缓存图片 URL 中的超大 GIF 元数据", () => {
    const issues = validateArticle({
      document: {
        title: "标题",
        author: "",
        digest: "摘要",
        blocks: [
          { type: "paragraph", children: [{ text: "正文".repeat(80) }] },
          {
            type: "image",
            id: "gif",
            localPath: "wedraft://image/hash?path=%2Ftmp%2Fa.gif&bytes=9437184&mime=image%2Fgif",
          },
        ],
      },
    });

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "IMAGE_LARGE",
        blockIndex: 1,
        message: expect.stringContaining("GIF"),
      }),
    );
  });
});
