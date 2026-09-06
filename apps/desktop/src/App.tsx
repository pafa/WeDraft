import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AlertTriangle,
  Check,
  Copy,
  FileClock,
  FilePlus2,
  LoaderCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ContentIssue, LocalArticle } from "@wedraft/shared-types";
import {
  copyPreflightIssues,
  hasBlockingIssues,
  validateArticle,
} from "@wedraft/validation";

import { ArticleEditor } from "./components/ArticleEditor.js";
import { HistoryPage } from "./components/HistoryPage.js";
import { WechatPreview } from "./components/WechatPreview.js";
import { SAMPLE_MARKDOWN } from "./sample-article.js";
import {
  buildArticle,
  countArticleCharacters,
} from "./services/article.js";
import { copyArticle } from "./services/clipboard.js";
import {
  deleteAllArticles,
  deleteArticle,
  exportAllArticles,
  exportArticle,
  initializeStorage,
  listArticles,
  loadSettings,
  readCachedImage,
  saveArticle,
  saveSettings,
} from "./services/native.js";
import { cachedImagePath } from "./services/image-preview.js";
import { normalizeSettings } from "./services/settings.js";
import type {
  ContentAnchor,
  ContentSyncEvent,
} from "./services/scroll-sync.js";
import { useEditorStore } from "./stores/editor-store.js";
import { APP_UPDATED_AT, APP_VERSION } from "./version.js";

type Page = "editor" | "history";

export function App() {
  const [page, setPage] = useState<Page>("editor");
  const [ready, setReady] = useState(false);
  const [articles, setArticles] = useState<LocalArticle[]>([]);
  const [activeAction, setActiveAction] = useState<"copy" | null>(null);
  const [copied, setCopied] = useState(false);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [demoActive, setDemoActive] = useState(true);
  const [contentSync, setContentSync] =
    useState<ContentSyncEvent | null>(null);
  const [activeBlock, setActiveBlock] = useState<{
    blockIndex: number;
    origin: "editor" | "preview";
  } | null>(null);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<
    Record<string, string>
  >({});
  const store = useEditorStore();
  const showingDemo = demoActive && !store.markdown;
  const previewMarkdown = showingDemo ? SAMPLE_MARKDOWN : store.markdown;

  const articleOutput = useMemo(
    () =>
      buildArticle({
        markdown: previewMarkdown,
        author: store.author,
        digest: store.digest,
        sourceUrl: store.sourceUrl,
        templateId: store.settings.defaultTemplateId,
        imagePreviewUrls,
      }),
    [
      previewMarkdown,
      store.author,
      store.digest,
      store.sourceUrl,
      store.settings.defaultTemplateId,
      imagePreviewUrls,
    ],
  );
  const issues = useMemo(
    () => validateArticle({ document: articleOutput.document }),
    [articleOutput.document],
  );
  const preflightIssues = useMemo(
    () => copyPreflightIssues(issues),
    [issues],
  );
  const articleCharacterCount = useMemo(
    () => countArticleCharacters(articleOutput.document),
    [articleOutput.document],
  );
  const hasPreflightBlockers = hasBlockingIssues(preflightIssues);
  const actionBlocked = showingDemo;

  useEffect(() => {
    const localPaths = articleOutput.document.blocks
      .filter(
        (block) =>
          block.type === "image" &&
          Boolean(block.localPath?.startsWith("wedraft://image/")),
      )
      .map((block) => block.type === "image" ? block.localPath : undefined)
      .filter((path): path is string => Boolean(path))
      .filter((path) => !imagePreviewUrls[path]);
    if (!localPaths.length) return;

    let cancelled = false;
    void Promise.all(
      localPaths.map(async (localPath) => {
        const path = cachedImagePath(localPath);
        if (!path) return undefined;
        try {
          const image = await readCachedImage(path);
          const dataUrl: string =
            `data:${image.mimeType};base64,${image.base64}`;
          return [localPath, dataUrl] as const;
        } catch {
          return undefined;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const loaded = entries.filter(
        (entry): entry is readonly [string, string] => Boolean(entry),
      );
      if (!loaded.length) return;
      setImagePreviewUrls((current) => ({
        ...current,
        ...Object.fromEntries(loaded),
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [articleOutput.document.blocks, imagePreviewUrls]);

  const refreshArticles = useCallback(async () => {
    setArticles(await listArticles());
  }, []);

  useEffect(() => {
    void (async () => {
      await initializeStorage();
      const storedSettings = await loadSettings();
      const settings = normalizeSettings(storedSettings);
      if (
        !storedSettings ||
        storedSettings.defaultTemplateId !== settings.defaultTemplateId ||
        storedSettings.templateDefaultVersion !==
          settings.templateDefaultVersion
      ) {
        await saveSettings(settings);
      }
      store.setSettings(settings);
      if (!store.author) store.setField("author", settings.defaultAuthor);
      await refreshArticles();
      setReady(true);
    })();
  }, []);

  const saveCurrent = useCallback(async () => {
    const now = new Date().toISOString();
    const existing = articles.find(
      (article) => article.id === store.articleId,
    );
    await saveArticle({
      id: store.articleId,
      title: articleOutput.document.title,
      author: articleOutput.document.author,
      digest: articleOutput.document.digest,
      markdown: store.markdown,
      templateId: store.settings.defaultTemplateId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    await refreshArticles();
  }, [
    articles,
    articleOutput.document,
    store.articleId,
    store.markdown,
    store.settings.defaultTemplateId,
    refreshArticles,
  ]);

  const openArticle = useCallback(
    (article: LocalArticle) => {
      store.loadArticle(article);
      setDemoActive(false);
      setContentSync(null);
      setActiveBlock(null);
      setPage("editor");
    },
    [store],
  );

  const removeArticle = useCallback(
    async (id: string) => {
      await deleteArticle(id);
      await refreshArticles();
    },
    [refreshArticles],
  );

  const removeAllArticles = useCallback(async () => {
    await deleteAllArticles();
    await refreshArticles();
  }, [refreshArticles]);

  const runCopy = useCallback(async () => {
    if (actionBlocked || hasBlockingIssues(issues)) return;
    setActiveAction("copy");
    setCopied(false);
    store.setCopy({ status: "copying", message: "正在复制富文本…" });
    try {
      await saveCurrent();
      await copyArticle(articleOutput.document, articleOutput.html);
      setCopied(true);
      store.setCopy({
        status: "success",
        message: "排版已复制，可以粘贴到公众号后台",
      });
    } catch (caught) {
      store.setCopy({
        status: "failed",
        message:
          caught instanceof Error ? caught.message : "复制失败，请重试。",
      });
    } finally {
      setActiveAction(null);
    }
  }, [actionBlocked, articleOutput, issues, saveCurrent, store]);

  const requestCopy = useCallback(() => {
    if (actionBlocked) return;
    if (preflightIssues.length) {
      setPreflightOpen(true);
      return;
    }
    void runCopy();
  }, [actionBlocked, preflightIssues, runCopy]);

  const locateIssue = useCallback(
    (issue: ContentIssue) => {
      if (issue.blockIndex === undefined) {
        setPreflightOpen(false);
        return;
      }
      const anchor = { blockIndex: issue.blockIndex, progress: 0 };
      setActiveBlock({ blockIndex: issue.blockIndex, origin: "editor" });
      setContentSync((current) => ({
        anchor,
        origin: "preview",
        revision: (current?.revision ?? 0) + 1,
      }));
      setPreflightOpen(false);
    },
    [],
  );

  const issueLocation = useCallback(
    (issue: ContentIssue): string => {
      if (issue.blockIndex === -1) return "第 1 行 · 文章标题";
      const range = articleOutput.sourceMap.find(
        (candidate) => candidate.blockIndex === issue.blockIndex,
      );
      if (!range) return "文章内容";
      return range.startLine === range.endLine
        ? `第 ${range.startLine} 行`
        : `第 ${range.startLine}–${range.endLine} 行`;
    },
    [articleOutput.sourceMap],
  );

  const changeTemplate = useCallback(
    (templateId: string) => {
      const next = {
        ...store.settings,
        defaultTemplateId: templateId,
      };
      store.setSettings(next);
      void saveSettings(next);
    },
    [store],
  );

  const syncContentAnchor = useCallback(
    (origin: "editor" | "preview", anchor: ContentAnchor) => {
      setContentSync((current) => ({
        anchor,
        origin,
        revision: (current?.revision ?? 0) + 1,
      }));
    },
    [],
  );

  const highlightContentBlock = useCallback(
    (
      origin: "editor" | "preview",
      blockIndex: number | null,
    ) => {
      setActiveBlock((current) => {
        if (blockIndex === null) return current === null ? current : null;
        if (
          current?.blockIndex === blockIndex &&
          current.origin === origin
        ) {
          return current;
        }
        return { blockIndex, origin };
      });
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey) return;
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        store.newArticle();
        setDemoActive(true);
        setContentSync(null);
        setActiveBlock(null);
        setPage("editor");
      } else if (event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        requestCopy();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestCopy, store]);

  if (!ready) {
    return (
      <div className="app-loading">
        <LoaderCircle className="spin" />
        正在打开 WeDraft…
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header" data-tauri-drag-region>
        <button
          className="brand"
          type="button"
          onClick={() => setPage("editor")}
        >
          <span>W</span>
          <strong>WeDraft</strong>
        </button>
        <nav>
          <button
            type="button"
            className={page === "editor" ? "active" : ""}
            onClick={() => {
              store.newArticle();
              setDemoActive(true);
              setContentSync(null);
              setActiveBlock(null);
              setPage("editor");
            }}
          >
            <FilePlus2 size={15} /> 新建文章
          </button>
          <button
            type="button"
            className={page === "history" ? "active" : ""}
            onClick={() => setPage("history")}
          >
            <FileClock size={15} /> 最近文章
          </button>
        </nav>
        <span className="header-version">
          v{APP_VERSION} · {APP_UPDATED_AT} · APPLE SILICON
        </span>
      </header>

      {page === "history" ? (
        <HistoryPage
          articles={articles}
          onOpen={openArticle}
          onDelete={removeArticle}
          onDeleteAll={removeAllArticles}
          onExport={exportArticle}
          onExportAll={exportAllArticles}
        />
      ) : (
        <>
          <main className="workspace">
            <ArticleEditor
              demoActive={showingDemo}
              demoMarkdown={SAMPLE_MARKDOWN}
              characterCount={articleCharacterCount}
              onDismissDemo={() => {
                setDemoActive(false);
                setContentSync(null);
                setActiveBlock(null);
              }}
              sourceMap={articleOutput.sourceMap}
              contentSync={contentSync}
              activeBlock={activeBlock}
              onContentAnchorChange={(anchor) =>
                syncContentAnchor("editor", anchor)
              }
              onActiveBlockChange={(blockIndex) =>
                highlightContentBlock("editor", blockIndex)
              }
              onImagePreviewReady={(localPath, dataUrl) =>
                setImagePreviewUrls((current) => ({
                  ...current,
                  [localPath]: dataUrl,
                }))
              }
            />
            <WechatPreview
              document={articleOutput.document}
              html={articleOutput.html}
              markdown={store.markdown}
              sourceMap={articleOutput.sourceMap}
              directEditDisabled={showingDemo}
              onMarkdownChange={(markdown) => {
                store.setMarkdown(markdown, "checkpoint");
                setDemoActive(false);
              }}
              templateId={store.settings.defaultTemplateId}
              onTemplateChange={changeTemplate}
              contentSync={contentSync}
              activeBlock={activeBlock}
              onContentAnchorChange={(anchor) =>
                syncContentAnchor("preview", anchor)
              }
              onActiveBlockChange={(blockIndex) =>
                highlightContentBlock("preview", blockIndex)
              }
            />
          </main>
          <footer className="action-bar">
            <div className="copy-status">
              <span
                className={`status-orb ${store.copy.status}`}
                aria-hidden
              />
              <div>
                <strong>
                  {showingDemo ? "正在展示完整排版示例" : store.copy.message}
                </strong>
                <small>
                  {showingDemo
                    ? "点击左侧编辑区，光标出现后即可输入"
                    : hasBlockingIssues(issues)
                    ? `复制前有 ${preflightIssues.length} 项必须修正的问题`
                    : preflightIssues.length
                    ? `复制前有 ${preflightIssues.length} 项兼容性提醒`
                    : "先确认排版预览，再复制到公众号后台"}
                </small>
              </div>
            </div>
            <div className="footer-actions">
              {copied ? (
                <button
                  type="button"
                  className="button secondary public-account-button"
                  onClick={() => void openUrl("https://mp.weixin.qq.com/")}
                >
                  打开公众号后台
                </button>
              ) : null}
              <button
                type="button"
                className="button primary copy-button"
                disabled={
                  actionBlocked || activeAction !== null
                }
                onClick={requestCopy}
              >
                {activeAction === "copy" ? (
                  <LoaderCircle className="spin" size={17} />
                ) : copied ? (
                  <Check size={17} />
                ) : (
                  <Copy size={17} />
                )}
                复制排版
                <kbd>⌘ ⇧ C</kbd>
              </button>
            </div>
          </footer>
          {preflightOpen ? (
            <div
              className="confirm-dialog-backdrop"
              onMouseDown={(event) => {
                if (event.currentTarget === event.target) {
                  setPreflightOpen(false);
                }
              }}
            >
              <section
                className="confirm-dialog preflight-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="preflight-dialog-title"
              >
                <span className="confirm-dialog-icon preflight-dialog-icon" aria-hidden>
                  <AlertTriangle size={21} />
                </span>
                <div className="confirm-dialog-copy">
                  <span className="eyebrow">COPY CHECK</span>
                  <h2 id="preflight-dialog-title">
                    {hasPreflightBlockers ? "请先修正后再复制" : "复制前兼容性检查"}
                  </h2>
                  <p>
                    {hasPreflightBlockers
                      ? "点击任一问题可直接定位到原文；修正后再点“复制排版”即可重新检查。"
                      : "以下内容可能影响微信三端显示。可先定位修改，也可确认后继续复制。"}
                  </p>
                </div>
                <div className="preflight-list" aria-label="复制检查问题">
                  {preflightIssues.map((issue, index) => (
                    <button
                      type="button"
                      className={`preflight-issue ${issue.level}`}
                      key={`${issue.code}-${issue.blockIndex ?? "article"}-${index}`}
                      onClick={() => locateIssue(issue)}
                    >
                      <span>{issue.level === "blocking" ? "必须修正" : "建议检查"}</span>
                      <strong>{issueLocation(issue)}</strong>
                      <p>{issue.message}</p>
                    </button>
                  ))}
                </div>
                <div className="confirm-dialog-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setPreflightOpen(false)}
                  >
                    返回修改
                  </button>
                  {!hasPreflightBlockers ? (
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => {
                        setPreflightOpen(false);
                        void runCopy();
                      }}
                    >
                      确认并继续复制
                    </button>
                  ) : null}
                </div>
              </section>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
