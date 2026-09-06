// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LocalArticle } from "@wedraft/shared-types";

import { HistoryPage } from "../src/components/HistoryPage.js";

(globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
}).IS_REACT_ACT_ENVIRONMENT = true;

const articles: LocalArticle[] = [
  {
    id: "one",
    title: "第一篇文章",
    author: "作者",
    digest: "",
    markdown: "第一篇文章\n\n正文",
    templateId: "default-business",
    createdAt: "2026-07-29T00:00:00Z",
    updatedAt: "2026-07-29T00:00:00Z",
  },
  {
    id: "two",
    title: "第二篇文章",
    author: "",
    digest: "",
    markdown: "第二篇文章\n\n正文",
    templateId: "next-edition",
    createdAt: "2026-07-29T00:00:00Z",
    updatedAt: "2026-07-29T00:00:00Z",
  },
];

afterEach(() => {
  document.body.innerHTML = "";
});

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(text),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`找不到按钮：${text}`);
  }
  return button;
}

function buttonByLabel(label: string): HTMLButtonElement {
  const button = document.querySelector(`button[aria-label="${label}"]`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`找不到按钮：${label}`);
  }
  return button;
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("history confirmation dialogs", () => {
  it("单篇删除先确认，再调用删除并关闭弹窗", async () => {
    const onDelete = vi.fn(async () => {});
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);

    await act(async () => {
      root.render(
        createElement(HistoryPage, {
          articles,
          onOpen: vi.fn(),
          onDelete,
          onDeleteAll: vi.fn(async () => {}),
          onExport: vi.fn(async () => undefined),
          onExportAll: vi.fn(async () => undefined),
        }),
      );
    });

    await click(buttonByLabel("删除第一篇文章"));
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("“第一篇文章”");
    expect(onDelete).not.toHaveBeenCalled();

    await click(buttonByText("确认删除"));
    expect(onDelete).toHaveBeenCalledWith("one");
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();

    await act(async () => root.unmount());
  });

  it("清空全部显示文章数量，确认后执行清空", async () => {
    const onDeleteAll = vi.fn(async () => {});
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);

    await act(async () => {
      root.render(
        createElement(HistoryPage, {
          articles,
          onOpen: vi.fn(),
          onDelete: vi.fn(async () => {}),
          onDeleteAll,
          onExport: vi.fn(async () => undefined),
          onExportAll: vi.fn(async () => undefined),
        }),
      );
    });

    await click(buttonByText("清空全部"));
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("全部 2 篇文章");
    expect(onDeleteAll).not.toHaveBeenCalled();

    await click(buttonByText("确认清空全部"));
    expect(onDeleteAll).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();

    await act(async () => root.unmount());
  });

  it("支持单篇导出和一键全部导出", async () => {
    const onExport = vi.fn(async () => "/tmp/第一篇文章.md");
    const onExportAll = vi.fn(async () => "/tmp/articles.zip");
    const host = document.body.appendChild(document.createElement("div"));
    const root = createRoot(host);

    await act(async () => {
      root.render(
        createElement(HistoryPage, {
          articles,
          onOpen: vi.fn(),
          onDelete: vi.fn(async () => {}),
          onDeleteAll: vi.fn(async () => {}),
          onExport,
          onExportAll,
        }),
      );
    });

    await click(buttonByLabel("导出第一篇文章"));
    expect(onExport).toHaveBeenCalledWith(articles[0]);
    expect(document.body.textContent).toContain("“第一篇文章”已导出");

    await click(buttonByText("一键全部导出"));
    expect(onExportAll).toHaveBeenCalledWith(articles);
    expect(document.body.textContent).toContain("已导出全部 2 篇文章");

    await act(async () => root.unmount());
  });
});
