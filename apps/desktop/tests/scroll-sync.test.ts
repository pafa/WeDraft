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
    const anchor = contentAnchorFromScroll(100, 200, editorBoxes);
    expect(anchor).toEqual({ blockIndex: 0, progress: 0.875 });
    expect(
      scrollTopForContentAnchor(anchor!, 300, previewBoxes),
    ).toBe(337.5);
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
