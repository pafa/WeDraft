// @vitest-environment jsdom

import { act, createElement, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseArticle } from "@wedraft/article-parser";

import { ArticleEditor } from "../src/components/ArticleEditor.js";
import { WechatPreview } from "../src/components/WechatPreview.js";
import { buildArticle } from "../src/services/article.js";
import { defaultSettings, useEditorStore } from "../src/stores/editor-store.js";

vi.mock("../src/services/clipboard.js", () => ({
  copyPlainText: vi.fn(async () => {}),
}));

vi.mock("../src/services/native.js", () => ({
  cacheBodyImage: vi.fn(),
}));

(globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
}).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

function renderEditor(contentSync: {
  origin: "preview";
  revision: number;
  anchor: { blockIndex: number; progress: number };
} | null = null, onActiveBlockChange = vi.fn()) {
  const host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  return act(async () => {
    root?.render(
      createElement(ArticleEditor, {
        demoActive: false,
        demoMarkdown: "",
        characterCount: 4,
        onDismissDemo: vi.fn(),
        sourceMap: [
          { blockIndex: -1, startLine: 1, endLine: 1 },
          { blockIndex: 0, startLine: 3, endLine: 3 },
        ],
        contentSync,
        activeBlock: null,
        onContentAnchorChange: vi.fn(),
        onActiveBlockChange,
        onImagePreviewReady: vi.fn(),
      }),
    );
  });
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  useEditorStore.setState({
    articleId: "editor-interaction",
    markdown: "标题\n\n正文",
    author: "",
    digest: "",
    sourceUrl: "",
    settings: defaultSettings,
    copy: { status: "idle", message: "等待排版" },
    undoStack: [],
    redoStack: [],
    lastMarkdownEditAt: 0,
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("article editor interactions", () => {
  it("一次鼠标点击只执行一次 Markdown 快捷操作", async () => {
    await renderEditor();
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.includes("一级标题"),
    );
    expect(button).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      button?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, detail: 1 }),
      );
      button?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
    });

    expect(useEditorStore.getState().markdown).toBe("## 1. 标题\n\n正文");
  });

  it("修改内容时不会重复旧的预览滚动指令并跳回原位置", async () => {
    await renderEditor({
      origin: "preview",
      revision: 7,
      anchor: { blockIndex: 0, progress: 0 },
    });
    const textarea = document.querySelector("textarea");
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);
    Object.defineProperty(textarea, "clientHeight", {
      configurable: true,
      value: 300,
    });
    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      value: 1_000,
    });
    if (textarea) textarea.scrollTop = 111;

    await act(async () => {
      useEditorStore
        .getState()
        .setMarkdown("标题\n\n正文已修改", "typing");
    });

    expect(textarea?.scrollTop).toBe(111);
  });

  it("右侧写回 Markdown 时，未聚焦的左侧编辑器不会发送旧光标定位", async () => {
    const onActiveBlockChange = vi.fn();
    await renderEditor(null, onActiveBlockChange);
    onActiveBlockChange.mockClear();

    await act(async () => {
      useEditorStore
        .getState()
        .setMarkdown("标题\n\n正文已从预览修改", "checkpoint");
    });

    expect(document.activeElement).not.toBe(
      document.querySelector("textarea"),
    );
    expect(onActiveBlockChange).not.toHaveBeenCalled();
  });

  it("预览实时更新时不会重复旧的编辑器滚动指令并跳屏", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    const articleDocument = parseArticle("标题\n\n正文");
    const contentSync = {
      origin: "editor" as const,
      revision: 8,
      anchor: { blockIndex: 0, progress: 0 },
    };
    const props = {
      document: articleDocument,
      markdown: "标题\n\n正文",
      sourceMap: [
        { blockIndex: -1, startLine: 1, endLine: 1 },
        { blockIndex: 0, startLine: 3, endLine: 3 },
      ],
      directEditDisabled: false,
      onMarkdownChange: vi.fn(),
      templateId: "next-edition",
      onTemplateChange: vi.fn(),
      contentSync,
      activeBlock: null,
      onContentAnchorChange: vi.fn(),
      onActiveBlockChange: vi.fn(),
    };
    await act(async () => {
      root?.render(
        createElement(WechatPreview, {
          ...props,
          html: '<p data-wedraft-block-index="0">正文</p>',
        }),
      );
    });
    const preview = document.querySelector(".wechat-article");
    expect(preview).toBeInstanceOf(HTMLElement);
    Object.defineProperty(preview, "clientHeight", {
      configurable: true,
      value: 300,
    });
    Object.defineProperty(preview, "scrollHeight", {
      configurable: true,
      value: 1_000,
    });
    if (preview instanceof HTMLElement) preview.scrollTop = 137;

    await act(async () => {
      root?.render(
        createElement(WechatPreview, {
          ...props,
          html: '<p data-wedraft-block-index="0">正文已修改</p>',
        }),
      );
    });

    expect(preview?.scrollTop).toBe(137);
  });

  it("在右侧预览微调正文后写回对应 Markdown，并保留粗体", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    const markdown = "标题\n\n正文 **重点**";
    const articleDocument = parseArticle(markdown);
    const onMarkdownChange = vi.fn();
    await act(async () => {
      root?.render(
        createElement(WechatPreview, {
          document: articleDocument,
          html:
            '<p data-wedraft-block-index="0">正文 <strong>重点</strong></p>',
          markdown,
          sourceMap: [
            { blockIndex: -1, startLine: 1, endLine: 1 },
            { blockIndex: 0, startLine: 3, endLine: 3 },
          ],
          directEditDisabled: false,
          onMarkdownChange,
          templateId: "next-edition",
          onTemplateChange: vi.fn(),
          contentSync: null,
          activeBlock: null,
          onContentAnchorChange: vi.fn(),
          onActiveBlockChange: vi.fn(),
        }),
      );
    });
    const paragraph = document.querySelector<HTMLElement>(
      '[data-wedraft-edit-kind="paragraph"]',
    );
    expect(paragraph).toBeInstanceOf(HTMLElement);
    expect(paragraph?.getAttribute("contenteditable")).toBe("true");

    await act(async () => {
      paragraph?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      if (paragraph) {
        paragraph.innerHTML = "正文已修正 <strong>重点</strong>";
      }
      paragraph?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });

    expect(onMarkdownChange).toHaveBeenCalledWith(
      "标题\n\n正文已修正 **重点**",
    );
  });

  it("Markdown 缩略导航可点击章节并移动光标", async () => {
    useEditorStore.setState({
      markdown: "标题\n\n## 1. 第一章\n\n正文\n\n### 小节",
    });
    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    await act(async () => {
      root?.render(
        createElement(ArticleEditor, {
          demoActive: false,
          demoMarkdown: "",
          characterCount: 10,
          onDismissDemo: vi.fn(),
          sourceMap: [
            { blockIndex: -1, startLine: 1, endLine: 1 },
            { blockIndex: 0, startLine: 3, endLine: 3 },
            { blockIndex: 1, startLine: 5, endLine: 5 },
            { blockIndex: 2, startLine: 7, endLine: 7 },
          ],
          contentSync: null,
          activeBlock: null,
          onContentAnchorChange: vi.fn(),
          onActiveBlockChange: vi.fn(),
          onImagePreviewReady: vi.fn(),
        }),
      );
    });
    const marker = document.querySelector<HTMLButtonElement>(
      ".markdown-minimap-marker.heading1",
    );
    const textarea = document.querySelector<HTMLTextAreaElement>("textarea");
    await act(async () => {
      marker?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(textarea?.selectionStart).toBe("标题\n\n".length);
  });

  it("从一个预览段落点击到另一个段落时保持滚动位置并交接焦点", async () => {
    const onMarkdownChange = vi.fn();
    function Harness() {
      const [markdown, setMarkdown] = useState(
        "标题\n\n第一段正文。\n\n第二段正文。\n\n第三段正文。",
      );
      const output = useMemo(
        () =>
          buildArticle({
            markdown,
            author: "",
            digest: "",
            sourceUrl: "",
            templateId: "next-edition",
          }),
        [markdown],
      );
      return createElement(WechatPreview, {
        document: output.document,
        html: output.html,
        markdown,
        sourceMap: output.sourceMap,
        directEditDisabled: false,
        onMarkdownChange: (nextMarkdown: string) => {
          onMarkdownChange(nextMarkdown);
          setMarkdown(nextMarkdown);
        },
        templateId: "next-edition",
        onTemplateChange: vi.fn(),
        contentSync: null,
        activeBlock: null,
        onContentAnchorChange: vi.fn(),
        onActiveBlockChange: vi.fn(),
      });
    }

    const host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    await act(async () => root?.render(createElement(Harness)));
    const article = document.querySelector<HTMLElement>(".wechat-article");
    const paragraphs = document.querySelectorAll<HTMLElement>(
      '[data-wedraft-edit-kind="paragraph"]',
    );
    expect(paragraphs).toHaveLength(3);
    const firstParagraph = paragraphs.item(0);
    const secondParagraph = paragraphs.item(1);
    if (!article || !firstParagraph || !secondParagraph) return;
    article.scrollTop = 360;

    await act(async () => {
      firstParagraph.dispatchEvent(
        new FocusEvent("focusin", { bubbles: true }),
      );
      firstParagraph.innerHTML = "第一段正文已微调。";
      secondParagraph.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );
      firstParagraph.dispatchEvent(
        new FocusEvent("focusout", {
          bubbles: true,
          relatedTarget: secondParagraph,
        }),
      );
    });

    expect(onMarkdownChange).toHaveBeenCalledWith(
      "标题\n\n第一段正文已微调。\n\n第二段正文。\n\n第三段正文。",
    );
    expect(article.scrollTop).toBe(360);
    expect(
      document.activeElement?.getAttribute(
        "data-wedraft-edit-block-index",
      ),
    ).toBe("1");
  });
});
