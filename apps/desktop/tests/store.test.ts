import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  defaultSettings,
  useEditorStore,
} from "../src/stores/editor-store.js";

beforeEach(() => {
  useEditorStore.setState({
    articleId: "original",
    markdown: "旧标题\n\n旧正文",
    author: "作者",
    digest: "摘要",
    sourceUrl: "",
    settings: { ...defaultSettings, defaultAuthor: "默认作者" },
    copy: { status: "idle", message: "等待排版" },
    undoStack: [],
    redoStack: [],
    lastMarkdownEditAt: 0,
  });
});

describe("editor store", () => {
  it("新建文章重置内容并使用默认作者", () => {
    useEditorStore.getState().newArticle();
    const state = useEditorStore.getState();
    expect(state.articleId).not.toBe("original");
    expect(state.markdown).toBe("");
    expect(state.author).toBe("默认作者");
  });

  it("载入本地文章", () => {
    useEditorStore.getState().loadArticle({
      id: "saved",
      title: "已保存",
      markdown: "正文",
      author: "作者",
      digest: "摘要",
    });
    expect(useEditorStore.getState()).toMatchObject({
      articleId: "saved",
      markdown: "已保存\n\n正文",
    });
  });

  it("支持多步撤回和重做", () => {
    useEditorStore.getState().setMarkdown("第一版", "checkpoint");
    useEditorStore.getState().setMarkdown("第二版", "checkpoint");
    useEditorStore.getState().setMarkdown("第三版", "checkpoint");

    useEditorStore.getState().undoMarkdown();
    expect(useEditorStore.getState().markdown).toBe("第二版");
    useEditorStore.getState().undoMarkdown();
    expect(useEditorStore.getState().markdown).toBe("第一版");
    useEditorStore.getState().redoMarkdown();
    expect(useEditorStore.getState().markdown).toBe("第二版");
    useEditorStore.getState().redoMarkdown();
    expect(useEditorStore.getState().markdown).toBe("第三版");
  });

  it("连续输入合并为一步，撤回后新编辑清空重做历史", () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000);
    useEditorStore.getState().setMarkdown("旧标题\n\n旧正文一", "typing");
    now.mockReturnValue(1_400);
    useEditorStore.getState().setMarkdown("旧标题\n\n旧正文一二", "typing");
    useEditorStore.getState().undoMarkdown();
    expect(useEditorStore.getState().markdown).toBe("旧标题\n\n旧正文");
    expect(useEditorStore.getState().redoStack).toHaveLength(1);

    useEditorStore.getState().setMarkdown("全新修改", "checkpoint");
    expect(useEditorStore.getState().redoStack).toEqual([]);
    now.mockRestore();
  });
});
