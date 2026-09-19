import { describe, expect, it } from "vitest";

import {
  blockIndexAtSourceLine,
  contentAnchorFromScroll,
  scrollRatio,
  scrollTopForContentAnchor,
  scrollTopAtRatio,
} from "../src/services/scroll-sync.js";

describe("bidirectional scroll sync", () => {
  it("按可滚动高度比例映射左右两栏", () => {
    expect(
      scrollRatio({
        scrollTop: 600,
        scrollHeight: 1600,
        clientHeight: 400,
      }),
    ).toBe(0.5);
    expect(scrollTopAtRatio(0.5, 2800, 800)).toBe(1000);
  });

  it("无滚动空间或越界值会安全归一化", () => {
    expect(
      scrollRatio({
        scrollTop: 100,
        scrollHeight: 400,
        clientHeight: 400,
      }),
    ).toBe(0);
    expect(scrollTopAtRatio(-1, 1000, 400)).toBe(0);
    expect(scrollTopAtRatio(2, 1000, 400)).toBe(600);
  });

  it("按内容块和块内高度进度同步不同高度的两栏", () => {
    const editorBoxes = [
      { blockIndex: 0, top: 100, height: 80 },
      { blockIndex: 1, top: 220, height: 120 },
    ];
    const previewBoxes = [
      { blockIndex: 0, top: 180, height: 300 },
      { blockIndex: 1, top: 520, height: 90 },
    ];
    const anchor = contentAnchorFromScroll(100, 200, editorBoxes, 1000);
    expect(anchor).toEqual({ blockIndex: 0, progress: 0.875 });
    expect(
      scrollTopForContentAnchor(anchor!, 300, previewBoxes, 1500),
    ).toBe(337.5);
  });

  it("滚回顶部时对齐容器顶部，而不是视口内的正文块", () => {
    const source = [{ blockIndex: 0, top: 20, height: 800 }];
    const target = [{ blockIndex: 0, top: 180, height: 2000 }];
    for (const scrollTop of [-12, 0, 0.5]) {
      const anchor = contentAnchorFromScroll(scrollTop, 500, source, 1200)!;
      expect(scrollTopForContentAnchor(anchor, 700, target, 2500)).toBe(0);
    }
  });

  it("到达底部时对齐对侧底部，包含段落后的留白", () => {
    const source = [{ blockIndex: 0, top: 20, height: 800 }];
    const target = [{ blockIndex: 0, top: 180, height: 2000 }];
    for (const scrollTop of [699.5, 700, 712]) {
      const anchor = contentAnchorFromScroll(scrollTop, 500, source, 1200)!;
      expect(scrollTopForContentAnchor(anchor, 700, target, 2600)).toBe(1900);
    }
  });

  it("无滚动空间时优先对齐顶部，空内容仍不产生同步事件", () => {
    const boxes = [{ blockIndex: 0, top: 20, height: 100 }];
    const anchor = contentAnchorFromScroll(0, 500, boxes, 500)!;
    expect(scrollTopForContentAnchor(anchor, 700, boxes, 1200)).toBe(0);
    expect(contentAnchorFromScroll(0, 500, [], 500)).toBeNull();
  });

  it("光标位于空白行时定位到最近的内容块", () => {
    const ranges = [
      { blockIndex: -1, startLine: 1, endLine: 1 },
      { blockIndex: 0, startLine: 3, endLine: 4 },
      { blockIndex: 1, startLine: 7, endLine: 7 },
    ];
    expect(blockIndexAtSourceLine(4, ranges)).toBe(0);
    expect(blockIndexAtSourceLine(6, ranges)).toBe(1);
  });
});
