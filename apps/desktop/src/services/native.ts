import { invoke } from "@tauri-apps/api/core";

import type {
  LocalArticle,
  UserSettings,
} from "@wedraft/shared-types";

import type { CachedBodyImage } from "../types.js";
import { shouldKeepHistoryArticle } from "./history.js";

function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

const SETTINGS_KEY = "wedraft.settings";
const ARTICLES_KEY = "wedraft.articles";

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function initializeStorage(): Promise<void> {
  if (isTauri()) await invoke("initialize_storage");
}

export async function loadSettings(): Promise<UserSettings | undefined> {
  return isTauri()
    ? invoke<UserSettings | null>("load_settings").then(
        (value) => value ?? undefined,
      )
    : readJson<UserSettings | undefined>(SETTINGS_KEY, undefined);
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  if (isTauri()) {
    await invoke("save_settings", { settings });
  } else {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }
}

export async function saveArticle(article: LocalArticle): Promise<void> {
  if (!shouldKeepHistoryArticle(article)) return;
  if (isTauri()) {
    await invoke("save_article", { article });
    return;
  }
  const articles = readJson<LocalArticle[]>(ARTICLES_KEY, []);
  const next = [article, ...articles.filter((item) => item.id !== article.id)];
  localStorage.setItem(ARTICLES_KEY, JSON.stringify(next.slice(0, 50)));
}

export async function listArticles(): Promise<LocalArticle[]> {
  const articles = isTauri()
    ? invoke<LocalArticle[]>("list_articles")
    : readJson<LocalArticle[]>(ARTICLES_KEY, []);
  return (await articles).filter(shouldKeepHistoryArticle);
}

export async function deleteArticle(id: string): Promise<void> {
  if (isTauri()) {
    await invoke("delete_article", { id });
    return;
  }
  const articles = readJson<LocalArticle[]>(ARTICLES_KEY, []);
  localStorage.setItem(
    ARTICLES_KEY,
    JSON.stringify(articles.filter((article) => article.id !== id)),
  );
}

export async function deleteAllArticles(): Promise<void> {
  if (isTauri()) {
    await invoke("delete_all_articles");
    return;
  }
  localStorage.setItem(ARTICLES_KEY, "[]");
}

export async function exportArticle(
  article: LocalArticle,
): Promise<string | undefined> {
  if (!isTauri()) {
    throw new Error("文章导出需要在 WeDraft macOS App 中运行。");
  }
  return invoke<string | null>("export_article", { article }).then(
    (path) => path ?? undefined,
  );
}

export async function exportAllArticles(
  articles: LocalArticle[],
): Promise<string | undefined> {
  if (!isTauri()) {
    throw new Error("全部导出需要在 WeDraft macOS App 中运行。");
  }
  return invoke<string | null>("export_all_articles", { articles }).then(
    (path) => path ?? undefined,
  );
}

export async function cacheBodyImage(
  bytes: Uint8Array,
  fileName: string,
): Promise<CachedBodyImage> {
  if (!isTauri()) {
    throw new Error("正文图片缓存需要在 WeDraft macOS App 中运行。");
  }
  return invoke<CachedBodyImage>("cache_body_image", {
    bytes: Array.from(bytes),
    fileName,
  });
}

export async function readCachedImage(path: string): Promise<{
  base64: string;
  fileName: string;
  mimeType: string;
}> {
  return invoke("read_cached_image", { path });
}

export async function copyRichText(
  html: string,
  plainText: string,
): Promise<void> {
  if (isTauri()) {
    await invoke("copy_rich_text", { html, plainText });
    return;
  }
  if (!navigator.clipboard) {
    throw new Error("当前环境无法访问剪贴板，请在 WeDraft App 中使用。");
  }
  if (!("ClipboardItem" in window)) {
    await navigator.clipboard.writeText(plainText);
    return;
  }
  const item = new ClipboardItem({
    "text/html": new Blob([html], { type: "text/html" }),
    "text/plain": new Blob([plainText], { type: "text/plain" }),
  });
  await navigator.clipboard.write([item]);
}

export async function copyPlainText(text: string): Promise<void> {
  if (isTauri()) {
    await invoke("copy_plain_text", { text });
    return;
  }
  await navigator.clipboard.writeText(text);
}
