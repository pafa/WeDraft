import { articleInputSchema, type PortableArticle } from "@wedraft/core";

export type Draft = { id: string; updatedAt: string; article: PortableArticle };
const DATABASE = "wedraft-web-v1";

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("浏览器无法打开本机草稿库。"));
    request.onblocked = () => reject(new Error("草稿库被另一个页面占用，请关闭旧页面后重试。"));
  });
}

export async function saveDraft(draft: Draft): Promise<void> {
  const article = articleInputSchema.parse(draft.article);
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("drafts", "readwrite");
      transaction.objectStore("drafts").put({ ...draft, article });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("草稿保存失败。"));
      transaction.onabort = () => reject(transaction.error ?? new Error("草稿保存中断。"));
    });
  } finally { db.close(); }
}

export async function listDrafts(): Promise<Draft[]> {
  const db = await database();
  try {
    return await new Promise<Draft[]>((resolve, reject) => {
      const request = db.transaction("drafts", "readonly").objectStore("drafts").getAll();
      request.onerror = () => reject(request.error ?? new Error("读取本机草稿失败。"));
      request.onsuccess = () => {
        try {
          const drafts = (request.result as Draft[]).map((draft) => {
            if (typeof draft.id !== "string" || typeof draft.updatedAt !== "string") throw new Error("草稿记录损坏；未修改原记录。");
            return { ...draft, article: articleInputSchema.parse(draft.article) };
          });
          resolve(drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        } catch (error) { reject(error); }
      };
    });
  } finally { db.close(); }
}
