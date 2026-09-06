import {
  AlertTriangle,
  Archive,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

import type { LocalArticle } from "@wedraft/shared-types";

type DeleteTarget =
  | { type: "one"; article: LocalArticle }
  | { type: "all" };

export function HistoryPage({
  articles,
  onOpen,
  onDelete,
  onDeleteAll,
  onExport,
  onExportAll,
}: {
  articles: LocalArticle[];
  onOpen: (article: LocalArticle) => void;
  onDelete: (id: string) => Promise<void>;
  onDeleteAll: () => Promise<void>;
  onExport: (article: LocalArticle) => Promise<string | undefined>;
  onExportAll: (articles: LocalArticle[]) => Promise<string | undefined>;
}) {
  const [deleting, setDeleting] = useState<string | "all" | null>(
    null,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState<string | "all" | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(
    null,
  );

  useEffect(() => {
    if (!deleteTarget) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && deleting === null) {
        setDeleteTarget(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [deleteTarget, deleting]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(target.type === "all" ? "all" : target.article.id);
    setError("");
    try {
      if (target.type === "all") {
        await onDeleteAll();
      } else {
        await onDelete(target.article.id);
      }
      setDeleteTarget(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : target.type === "all"
            ? "清空文章失败。"
            : "删除文章失败。",
      );
    } finally {
      setDeleting(null);
    }
  };

  const exportOne = async (article: LocalArticle) => {
    setExporting(article.id);
    setError("");
    setNotice("");
    try {
      const path = await onExport(article);
      if (path) setNotice(`“${article.title || "未命名文章"}”已导出。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "文章导出失败。");
    } finally {
      setExporting(null);
    }
  };

  const exportAll = async () => {
    setExporting("all");
    setError("");
    setNotice("");
    try {
      const path = await onExportAll(articles);
      if (path) setNotice(`已导出全部 ${articles.length} 篇文章。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "全部导出失败。");
    } finally {
      setExporting(null);
    }
  };

  return (
    <main className="history-page">
      <section className="history-shell">
        <div className="history-header">
          <div>
            <span className="eyebrow">LOCAL ARTICLES</span>
            <h1>最近文章</h1>
            <p>执行“复制排版”的文章保存在本机，点击即可继续编辑。</p>
          </div>
          <div className="history-actions">
            <span className="history-count">{articles.length} 篇</span>
            {articles.length ? (
              <>
                <button
                  type="button"
                  className="export-history-button"
                  disabled={deleting !== null || exporting !== null}
                  onClick={() => void exportAll()}
                >
                  {exporting === "all" ? (
                    <LoaderCircle className="spin" size={14} />
                  ) : (
                    <Archive size={14} />
                  )}
                  一键全部导出
                </button>
                <button
                  type="button"
                  className="clear-history-button"
                  disabled={deleting !== null || exporting !== null}
                  onClick={() => {
                    setError("");
                    setNotice("");
                    setDeleteTarget({ type: "all" });
                  }}
                >
                  {deleting === "all" ? (
                    <LoaderCircle className="spin" size={14} />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  清空全部
                </button>
              </>
            ) : null}
          </div>
        </div>
        {error ? <p className="history-error">{error}</p> : null}
        {notice ? <p className="history-success">{notice}</p> : null}
        <div className="article-list">
          {articles.length ? (
            articles.map((article) => (
              <div
                className="article-row"
                key={article.id}
              >
                <button
                  type="button"
                  className="article-open"
                  onClick={() => onOpen(article)}
                >
                  <span className="article-icon">
                    <FileText size={18} />
                  </span>
                  <span className="article-copy">
                    <strong>{article.title || "未命名文章"}</strong>
                    <small>
                      {article.author || "未填写作者"} ·{" "}
                      {article.markdown.replace(/\s/g, "").length} 字
                    </small>
                  </span>
                  <span className="article-time">
                    <Clock3 size={13} />
                    {new Date(article.updatedAt).toLocaleString("zh-CN")}
                  </span>
                  <ChevronRight className="article-chevron" size={16} />
                </button>
                <div className="article-row-actions">
                  <button
                    type="button"
                    className="article-export"
                    aria-label={`导出${article.title || "未命名文章"}`}
                    title="导出 Markdown"
                    disabled={deleting !== null || exporting !== null}
                    onClick={() => void exportOne(article)}
                  >
                    {exporting === article.id ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <Download size={15} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="article-delete"
                    aria-label={`删除${article.title || "未命名文章"}`}
                    title="删除这篇文章"
                    disabled={deleting !== null || exporting !== null}
                    onClick={() => {
                      setError("");
                      setNotice("");
                      setDeleteTarget({ type: "one", article });
                    }}
                  >
                    {deleting === article.id ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <Trash2 size={15} />
                    )}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="history-empty">
              <FileText size={30} />
              <p>还没有文章；执行“复制排版”后会出现在这里。</p>
            </div>
          )}
        </div>
      </section>
      {deleteTarget ? (
        <div
          className="confirm-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && deleting === null) {
              setDeleteTarget(null);
            }
          }}
        >
          <section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-description"
          >
            <span className="confirm-dialog-icon" aria-hidden>
              <AlertTriangle size={21} />
            </span>
            <div className="confirm-dialog-copy">
              <span className="eyebrow">DELETE CONFIRMATION</span>
              <h2 id="delete-dialog-title">
                {deleteTarget.type === "all"
                  ? "确认清空全部文章？"
                  : "确认删除这篇文章？"}
              </h2>
              <p id="delete-dialog-description">
                {deleteTarget.type === "all" ? (
                  <>
                    将永久删除最近文章中的
                    <strong>全部 {articles.length} 篇文章</strong>
                    ，删除后列表会立即清空。
                  </>
                ) : (
                  <>
                    将永久删除
                    <strong>
                      “{deleteTarget.article.title || "未命名文章"}”
                    </strong>
                    ，删除后将无法恢复。
                  </>
                )}
              </p>
            </div>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="button secondary"
                disabled={deleting !== null}
                autoFocus
                onClick={() => setDeleteTarget(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="button danger"
                disabled={deleting !== null}
                onClick={() => void confirmDelete()}
              >
                {deleting !== null ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Trash2 size={16} />
                )}
                {deleteTarget.type === "all" ? "确认清空全部" : "确认删除"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
