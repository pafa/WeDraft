import { create } from "zustand";

import type { UserSettings } from "@wedraft/shared-types";

import type { CopyProgress } from "../types.js";

export const defaultSettings: UserSettings = {
  defaultAuthor: "",
  defaultTemplateId: "next-edition",
  autosaveIntervalSeconds: 15,
  templateDefaultVersion: 2,
};

type EditorState = {
  articleId: string;
  markdown: string;
  author: string;
  digest: string;
  sourceUrl: string;
  settings: UserSettings;
  copy: CopyProgress;
  undoStack: string[];
  redoStack: string[];
  lastMarkdownEditAt: number;
  setField: <K extends "markdown" | "author" | "digest" | "sourceUrl">(
    key: K,
    value: EditorState[K],
  ) => void;
  setMarkdown: (value: string, mode?: "typing" | "checkpoint") => void;
  undoMarkdown: () => void;
  redoMarkdown: () => void;
  setSettings: (settings: UserSettings) => void;
  setCopy: (copy: CopyProgress) => void;
  newArticle: () => void;
  loadArticle: (article: {
    id: string;
    title: string;
    markdown: string;
    author: string;
    digest: string;
  }) => void;
};

const MAX_MARKDOWN_HISTORY = 100;
const TYPING_GROUP_MS = 800;

function nextMarkdownHistory(
  state: EditorState,
  markdown: string,
  mode: "typing" | "checkpoint",
): Partial<EditorState> {
  if (markdown === state.markdown) return {};
  const now = Date.now();
  const continuingTyping =
    mode === "typing" &&
    state.lastMarkdownEditAt > 0 &&
    now - state.lastMarkdownEditAt <= TYPING_GROUP_MS &&
    state.undoStack.length > 0;
  return {
    markdown,
    undoStack: continuingTyping
      ? state.undoStack
      : [...state.undoStack, state.markdown].slice(-MAX_MARKDOWN_HISTORY),
    redoStack: [],
    lastMarkdownEditAt: mode === "typing" ? now : 0,
  };
}

function newId(): string {
  return crypto.randomUUID();
}

function markdownWithTitle(article: {
  title: string;
  markdown: string;
}): string {
  const firstLine =
    article.markdown
      .split(/\r?\n/)
      .find((line) => line.trim())
      ?.trim()
      .replace(/^#{1,6}\s*/, "")
      .replace(/[*_`]/g, "") ?? "";
  if (!article.title.trim() || firstLine === article.title.trim()) {
    return article.markdown;
  }
  return `${article.title.trim()}\n\n${article.markdown}`.trim();
}

export const useEditorStore = create<EditorState>((set) => ({
  articleId: newId(),
  markdown: "",
  author: "",
  digest: "",
  sourceUrl: "",
  settings: defaultSettings,
  copy: { status: "idle", message: "等待排版" },
  undoStack: [],
  redoStack: [],
  lastMarkdownEditAt: 0,
  setField: (key, value) => {
    if (key === "markdown") {
      set((state) => nextMarkdownHistory(state, value as string, "checkpoint"));
      return;
    }
    set({ [key]: value });
  },
  setMarkdown: (value, mode = "checkpoint") =>
    set((state) => nextMarkdownHistory(state, value, mode)),
  undoMarkdown: () =>
    set((state) => {
      const previous = state.undoStack.at(-1);
      if (previous === undefined) return state;
      return {
        markdown: previous,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, state.markdown].slice(
          -MAX_MARKDOWN_HISTORY,
        ),
        lastMarkdownEditAt: 0,
      };
    }),
  redoMarkdown: () =>
    set((state) => {
      const next = state.redoStack.at(-1);
      if (next === undefined) return state;
      return {
        markdown: next,
        undoStack: [...state.undoStack, state.markdown].slice(
          -MAX_MARKDOWN_HISTORY,
        ),
        redoStack: state.redoStack.slice(0, -1),
        lastMarkdownEditAt: 0,
      };
    }),
  setSettings: (settings) => set({ settings }),
  setCopy: (copy) => set({ copy }),
  newArticle: () =>
    set((state) => ({
      articleId: newId(),
      markdown: "",
      author: state.settings.defaultAuthor,
      digest: "",
      sourceUrl: "",
      copy: { status: "idle", message: "等待排版" },
      undoStack: [],
      redoStack: [],
      lastMarkdownEditAt: 0,
    })),
  loadArticle: (article) =>
    set({
      articleId: article.id,
      markdown: markdownWithTitle(article),
      author: article.author,
      digest: article.digest,
      sourceUrl: "",
      copy: { status: "idle", message: "已载入本地文章" },
      undoStack: [],
      redoStack: [],
      lastMarkdownEditAt: 0,
    }),
}));
