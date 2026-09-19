import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { articleInputSchema } from "@wedraft/core";
import { listDrafts, saveDraft } from "../src/storage.js";

describe("browser draft storage", () => {
  it("stores source and assets together and reopens separate drafts", async () => {
    const first = { id: "first", updatedAt: "2026-09-19T00:00:00Z", article: articleInputSchema.parse({ markdown: "第一篇\n\n原文" }) };
    const second = { id: "second", updatedAt: "2026-09-19T01:00:00Z", article: articleInputSchema.parse({ markdown: "第二篇\n\n来源", templateId: "default-business" }) };
    await saveDraft(first); await saveDraft(second);
    expect(await listDrafts()).toEqual([second, first]);
    await saveDraft({ ...first, article: articleInputSchema.parse({ markdown: "第一篇\n\n修改后" }) });
    const drafts = await listDrafts();
    expect(drafts).toHaveLength(2);
    expect(drafts.find((draft) => draft.id === "first")?.article.markdown).toContain("修改后");
    expect(drafts.find((draft) => draft.id === "second")?.article).toEqual(second.article);
  });
});
