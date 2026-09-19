// @vitest-environment jsdom

import { act, createElement, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WechatPreview } from "@wedraft/editor-ui/components/WechatPreview";
import { buildArticle } from "../src/services/article.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
const originalMarkdown = "标题\n\n第一段正文。\n\n第二段正文。";

async function renderPreview() {
  const changed = vi.fn();
  function Harness() {
    const [markdown, setMarkdown] = useState(originalMarkdown);
    const output = useMemo(() => buildArticle({ markdown, author: "", digest: "", sourceUrl: "", templateId: "next-edition" }), [markdown]);
    return createElement(WechatPreview, {
      document: output.document, html: output.html, markdown, sourceMap: output.sourceMap,
      directEditDisabled: false,
      onMarkdownChange: (value: string) => { changed(value); setMarkdown(value); },
      templateId: "next-edition", onTemplateChange: vi.fn(),
      contentSync: null, activeBlock: null,
      onContentAnchorChange: vi.fn(), onActiveBlockChange: vi.fn(),
    });
  }
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root?.render(createElement(Harness)));
  const paragraphs = Array.from(document.querySelectorAll<HTMLElement>('[data-wedraft-edit-kind="paragraph"]'));
  // jsdom does not make contenteditable elements focusable automatically.
  paragraphs.forEach((paragraph) => { paragraph.tabIndex = 0; });
  const article = document.querySelector<HTMLElement>(".wechat-article")!;
  await act(async () => paragraphs[0]!.focus());
  expect(document.activeElement).toBe(paragraphs[0]);
  return { changed, article, first: paragraphs[0]!, second: paragraphs[1]! };
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("preview focus and input method interactions", () => {
  it("switches to another unchanged paragraph with one click and preserves scroll", async () => {
    const { changed, article, second } = await renderPreview();
    article.scrollTop = 240;
    await act(async () => {
      const allowed = second.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      // Simulate the browser focus default only if the handler did not cancel it.
      if (allowed) second.focus();
    });
    expect(document.activeElement).toBe(second);
    expect(changed).not.toHaveBeenCalled();
    expect(article.scrollTop).toBe(240);
  });

  it("keeps focus handoff when DOM changes serialize to unchanged Markdown", async () => {
    const { changed, first, second } = await renderPreview();
    first.innerHTML = "<span>第一段正文。</span>";
    await act(async () => {
      const allowed = second.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      if (allowed) second.focus();
    });
    expect(document.activeElement).toBe(second);
    expect(changed).not.toHaveBeenCalled();
  });

  it.each([
    ["Enter", { isComposing: true }],
    ["Escape", { isComposing: true }],
    ["Enter", { keyCode: 229 }],
  ])("leaves %s to an active input method (%j)", async (key, options) => {
    const { changed, first } = await renderPreview();
    first.textContent = "正在输入中文";
    const event = new KeyboardEvent("keydown", { key, ...options, bubbles: true, cancelable: true });
    await act(async () => { first.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(first);
    expect(first.textContent).toBe("正在输入中文");
    expect(changed).not.toHaveBeenCalled();
  });

  it("commits an ordinary Enter after composition finishes", async () => {
    const { changed, first } = await renderPreview();
    first.textContent = "确认后的中文";
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => { first.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(changed).toHaveBeenCalledWith("标题\n\n确认后的中文\n\n第二段正文。");
  });
});
