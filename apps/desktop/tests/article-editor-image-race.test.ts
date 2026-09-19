// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleEditor } from "@wedraft/editor-ui/components/ArticleEditor";
import { useEditorStore } from "@wedraft/editor-ui/stores/editor-store";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  useEditorStore.getState().newArticle();
  useEditorStore.getState().setMarkdown("旧标题\n\n旧正文");
});
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function startImage() {
  let finish!: (image: { url: string; dataUrl: string; notice: string }) => void;
  const pending = new Promise<{ url: string; dataUrl: string; notice: string }>(resolve => { finish = resolve; });
  const onImagePreviewReady = vi.fn();
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root?.render(createElement(ArticleEditor, {
    demoActive: false, demoMarkdown: "", characterCount: 6,
    sourceMap: [], contentSync: null, activeBlock: null,
    onDismissDemo: vi.fn(), onContentAnchorChange: vi.fn(), onActiveBlockChange: vi.fn(),
    onImagePreviewReady, prepareImage: () => pending,
  })));
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [new File(["png"], "test.png", { type: "image/png" })] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  const insert = [...document.querySelectorAll("button")].find(button => button.textContent === "无来源插入")!;
  await act(async () => insert.click());
  return { onImagePreviewReady, finish: async () => {
    await act(async () => finish({ url: "assets/test.png", dataUrl: "data:image/png;base64,eA==", notice: "完成" }));
  } };
}

describe("asynchronous image insertion", () => {
  it("does not overwrite a new article when an old image finishes", async () => {
    const task = await startImage();
    await act(async () => {
      useEditorStore.getState().newArticle();
      useEditorStore.getState().setMarkdown("新标题\n\n新正文");
    });
    await task.finish();
    expect(useEditorStore.getState().markdown).toBe("新标题\n\n新正文");
    expect(task.onImagePreviewReady).not.toHaveBeenCalled();
  });

  it("inserts into the latest source without restoring a stale snapshot", async () => {
    const task = await startImage();
    await act(async () => useEditorStore.getState().setMarkdown("标题\n\n处理图片期间的新正文"));
    const textarea = document.querySelector("textarea")!;
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    await task.finish();
    expect(useEditorStore.getState().markdown).toBe("标题\n\n处理图片期间的新正文\n\n![test.png](assets/test.png)\n\n");
    expect(task.onImagePreviewReady).toHaveBeenCalledOnce();
  });
});
