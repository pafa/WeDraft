// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App.js";
import { defaultSettings, useEditorStore } from "../src/stores/editor-store.js";

const { copyArticle } = vi.hoisted(() => ({
  copyArticle: vi.fn(async () => {}),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => {}),
}));

vi.mock("../src/services/clipboard.js", () => ({
  copyArticle,
  copyPlainText: vi.fn(async () => {}),
}));

vi.mock("../src/services/native.js", () => ({
  deleteAllArticles: vi.fn(async () => {}),
  deleteArticle: vi.fn(async () => {}),
  exportAllArticles: vi.fn(async () => undefined),
  exportArticle: vi.fn(async () => undefined),
  initializeStorage: vi.fn(async () => {}),
  listArticles: vi.fn(async () => []),
  loadSettings: vi.fn(async () => ({
    ...defaultSettings,
    defaultAuthor: "",
  })),
  readCachedImage: vi.fn(async () => ({
    base64: "",
    fileName: "image.png",
    mimeType: "image/png",
  })),
  saveArticle: vi.fn(async () => {}),
  saveSettings: vi.fn(async () => {}),
  cacheBodyImage: vi.fn(),
}));

(globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
}).IS_REACT_ACT_ENVIRONMENT = true;

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(text),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`找不到按钮：${text}`);
  }
  return button;
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

beforeEach(() => {
  copyArticle.mockClear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  useEditorStore.setState({
    articleId: "preflight-test",
    markdown: "标题\n\n---\n\n## 2. 编号错误\n\n" + "正文内容".repeat(50),
    author: "",
    digest: "摘要",
    sourceUrl: "",
    settings: { ...defaultSettings, defaultAuthor: "" },
    copy: { status: "idle", message: "等待排版" },
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("copy preflight flow", () => {
  it("引用式链接触发源语法阻断，定位原文后修正才能复制", async () => {
    useEditorStore.getState().setMarkdown("标题\n\n[关键原文][source]\n\n[source]: https://example.com");
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(App));
      await Promise.resolve();
      await Promise.resolve();
    });
    await click(buttonByText("复制排版"));
    expect(document.body.textContent).toContain("引用式链接");
    expect(document.body.textContent).toContain("第 3 行");
    expect(copyArticle).not.toHaveBeenCalled();
    const issue = Array.from(document.querySelectorAll<HTMLButtonElement>(".preflight-issue"))
      .find((candidate) => candidate.textContent?.includes("引用式链接"));
    expect(issue).toBeDefined();
    await click(issue!);
    const textarea = document.querySelector<HTMLTextAreaElement>("textarea.markdown-editor");
    expect(document.activeElement).toBe(textarea);
    expect(textarea?.value.slice(textarea.selectionStart, textarea.selectionEnd)).toBe("[关键原文][source]");
    await act(async () => {
      useEditorStore.getState().setMarkdown("标题\n\n[关键原文](https://example.com)");
    });
    await click(buttonByText("复制排版"));
    expect(copyArticle).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
  });

  it("精确定位问题，修正后可以重新检查并复制", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(App));
      await Promise.resolve();
      await Promise.resolve();
    });

    await click(buttonByText("复制排版"));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("第 5 行");
    expect(document.body.textContent).toContain("应使用连续编号“1.”");
    expect(copyArticle).not.toHaveBeenCalled();

    const issue = document.querySelector(".preflight-issue");
    expect(issue).toBeInstanceOf(HTMLButtonElement);
    await click(issue as HTMLButtonElement);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector(".editor-content-highlight")).not.toBeNull();

    await act(async () => {
      useEditorStore.getState().setField(
        "markdown",
        "标题\n\n---\n\n## 1. 编号正确\n\n" + "正文内容".repeat(50),
      );
    });
    await click(buttonByText("复制排版"));

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(copyArticle).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("排版已复制");

    await act(async () => root.unmount());
  });
});
