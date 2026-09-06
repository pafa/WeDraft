// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import type { LocalArticle } from "@wedraft/shared-types";

import {
  deleteAllArticles,
  deleteArticle,
  listArticles,
  saveArticle,
} from "../src/services/native.js";

function article(id: string): LocalArticle {
  return {
    id,
    title: `文章 ${id}`,
    author: "",
    digest: "",
    markdown: `文章 ${id}\n\n正文`,
    templateId: "default-business",
    createdAt: "2026-07-29T00:00:00Z",
    updatedAt: "2026-07-29T00:00:00Z",
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("local article history", () => {
  it("支持删除单篇与清空全部文章", async () => {
    await saveArticle(article("one"));
    await saveArticle(article("two"));

    await deleteArticle("one");
    expect((await listArticles()).map((item) => item.id)).toEqual(["two"]);

    await deleteAllArticles();
    expect(await listArticles()).toEqual([]);
  });

  it("不保存或显示未命名、空正文文章", async () => {
    const unnamed = {
      ...article("empty"),
      title: "未命名文章",
      markdown: "",
    };
    const titleOnly = {
      ...article("title-only"),
      title: "只有标题",
      markdown: "只有标题\n\n   ",
    };

    await saveArticle(unnamed);
    await saveArticle(titleOnly);
    expect(await listArticles()).toEqual([]);

    localStorage.setItem(
      "wedraft.articles",
      JSON.stringify([unnamed, titleOnly, article("valid")]),
    );
    expect((await listArticles()).map((item) => item.id)).toEqual([
      "valid",
    ]);
  });
});
