import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Download, FileClock, FilePlus2, FolderOpen, Monitor, Sparkles, Upload, X } from "lucide-react";
import { articleInputSchema, createPreviewHtml, ENGINE_VERSION, exportArticleBundle, importArticleBundle, MAX_BUNDLE_BYTES, renderArticle, validateAssets, type ArticleAsset, type LocatedIssue, type PortableArticle } from "@wedraft/core";
import { ArticleEditor } from "../../desktop/src/components/ArticleEditor.js";
import { WechatPreview } from "../../desktop/src/components/WechatPreview.js";
import { useEditorStore } from "../../desktop/src/stores/editor-store.js";
import type { ContentAnchor, ContentSyncEvent } from "../../desktop/src/services/scroll-sync.js";
import { copyHtml, download, prepareBrowserImage } from "./platform.js";
import { listDrafts, saveDraft, type Draft } from "./storage.js";
import { SAMPLE } from "./sample.js";
import aiGuide from "../../../docs/ai-integration.md?raw";

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} onClose={onClose} className="web-dialog" aria-labelledby="dialog-title">
    <div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button className="web-icon-button" aria-label="关闭" onClick={() => ref.current?.close()}><X size={19} /></button></div>{children}
  </dialog>;
}

export function App() {
  const store = useEditorStore();
  const [assets, setAssets] = useState<ArticleAsset[]>([]);
  const [demo, setDemo] = useState(true);
  const [ready, setReady] = useState(false);
  const [storageDisabled, setStorageDisabled] = useState(false);
  const [saveState, setSaveState] = useState("样稿不会保存");
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [dialog, setDialog] = useState<"history" | "export" | "ai" | "issues" | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [copying, setCopying] = useState(false);
  const [copyConfirm, setCopyConfirm] = useState(false);
  const [mobilePanel, setMobilePanel] = useState("editor");
  const [contentSync, setContentSync] = useState<ContentSyncEvent | null>(null);
  const [activeBlock, setActiveBlock] = useState<{ blockIndex: number; origin: "editor" | "preview" } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const saveQueue = useRef(Promise.resolve());
  const saveRevision = useRef(0);
  const latestSaved = useRef("");
  const showingDemo = demo && !store.markdown;
  const article = useMemo(() => ({ markdown: store.markdown, templateId: store.settings.defaultTemplateId,
    author: store.author, digest: store.digest, sourceUrl: store.sourceUrl, assets }),
  [store.markdown, store.settings.defaultTemplateId, store.author, store.digest, store.sourceUrl, assets]);
  const output = useMemo(() => {
    try { return { result: renderArticle(showingDemo ? { markdown: SAMPLE, templateId: article.templateId } : article), error: "" }; }
    catch (error) { return { result: renderArticle({ markdown: "" }), error: error instanceof Error ? error.message : "文章无法解析。" }; }
  }, [article, showingDemo]);
  const result = output.result;
  const notify = useCallback((text: string, error = false) => { setMessage(text); setMessageError(error); }, []);

  const load = useCallback((input: PortableArticle, id: string = crypto.randomUUID()) => {
    // Validate everything before replacing any current editor state.
    renderArticle(input);
    const state = useEditorStore.getState();
    state.newArticle();
    useEditorStore.setState({ articleId: id, markdown: input.markdown, author: input.author,
      digest: input.digest, sourceUrl: input.sourceUrl,
      settings: { ...state.settings, defaultTemplateId: input.templateId }, undoStack: [], redoStack: [] });
    setAssets(input.assets); setDemo(false); setActiveBlock(null); setContentSync(null);
    setCopyConfirm(false); setMessage("");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = await listDrafts();
        if (cancelled) return;
        setDrafts(saved);
        const activeId = sessionStorage.getItem("wedraft.web.active");
        const previous = saved.find((draft) => draft.id === activeId);
        if (previous) { load(previous.article, previous.id); setSaveState("已恢复本机草稿"); }
      } catch (error) {
        if (cancelled) return;
        setStorageDisabled(true);
        notify(`本机草稿暂不可用，原记录未被修改。请用文章包保存当前内容。${error instanceof Error ? error.message : ""}`, true);
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [load, notify]);

  const persist = useCallback(async () => {
    if (showingDemo || storageDisabled) return;
    const snapshot: Draft = { id: store.articleId, updatedAt: new Date().toISOString(), article: articleInputSchema.parse(article) };
    const fingerprint = JSON.stringify({ id: snapshot.id, article: snapshot.article });
    if (latestSaved.current === fingerprint) return;
    const revision = ++saveRevision.current;
    setSaveState("正在保存…");
    const job = saveQueue.current.catch(() => {}).then(async () => {
      await saveDraft(snapshot);
      sessionStorage.setItem("wedraft.web.active", snapshot.id);
      latestSaved.current = fingerprint;
    });
    saveQueue.current = job;
    try {
      await job;
      if (revision === saveRevision.current) setSaveState("已保存到此浏览器");
    } catch (error) {
      if (revision === saveRevision.current) setSaveState("保存失败，请导出文章包");
      throw error;
    }
  }, [article, showingDemo, storageDisabled, store.articleId, store.markdown]);

  useEffect(() => {
    if (!ready || showingDemo || storageDisabled) return;
    setSaveState("尚有未保存修改");
    const timer = setTimeout(() => { void persist().catch((error) => notify(error instanceof Error ? error.message : "保存失败，请导出文章包。", true)); }, 650);
    return () => clearTimeout(timer);
  }, [ready, persist, showingDemo, storageDisabled, notify]);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      const current = JSON.stringify({ id: store.articleId, article: articleInputSchema.safeParse(article).data ?? article });
      if (!showingDemo && store.markdown && current !== latestSaved.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [article, showingDemo, store.articleId, store.markdown]);

  const sync = (origin: "editor" | "preview", anchor: ContentAnchor) => setContentSync((current) => ({ origin, anchor, revision: (current?.revision ?? 0) + 1 }));
  const highlight = (origin: "editor" | "preview", blockIndex: number | null) => setActiveBlock((previous) => {
    if (blockIndex === null) return previous === null ? previous : null;
    return previous?.origin === origin && previous.blockIndex === blockIndex ? previous : { origin, blockIndex };
  });
  const closeDialog = () => { setDialog(null); setCopyConfirm(false); };

  async function beforeReplace() {
    if (storageDisabled && !showingDemo && store.markdown) {
      return window.confirm("当前草稿无法自动保存。继续会替换编辑区内容；如需保留，请先取消并导出文章包。");
    }
    await persist(); return true;
  }

  async function importFile(file: File) {
    try {
      if (file.size > MAX_BUNDLE_BYTES) throw new Error("文件超过大小限制。");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const input = file.name.endsWith(".zip") ? importArticleBundle(bytes) : file.name.endsWith(".json")
        ? articleInputSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)))
        : articleInputSchema.parse({ markdown: new TextDecoder("utf-8", { fatal: true }).decode(bytes), templateId: store.settings.defaultTemplateId });
      renderArticle(input);
      if (!(await beforeReplace())) return;
      load(input); notify(`已导入 ${file.name}，可以继续编辑。`); setDialog(null);
    } catch (error) { notify(error instanceof Error ? error.message : "导入失败，当前文章未被替换。", true); }
  }

  async function copy() {
    if (showingDemo || output.error || result.html === null) return;
    setCopying(true);
    try {
      // Invoke during the user's click; waiting for IndexedDB first breaks Safari activation.
      await copyHtml(result.html, result.plainText);
      notify("排版已复制。粘贴到公众号后台后，请检查图片和手机预览。");
    } catch (error) { notify(error instanceof Error ? error.message : "复制失败，请重试或导出 HTML。", true); }
    finally { setCopying(false); }
  }

  function locate(issue: LocatedIssue) {
    const blockIndex = issue.blockIndex ?? result.sourceMap.find((range) => issue.startLine !== undefined && range.startLine <= issue.startLine && range.endLine >= issue.startLine)?.blockIndex;
    if (blockIndex !== undefined) { setActiveBlock({ blockIndex, origin: "preview" }); sync("preview", { blockIndex, progress: 0 }); }
    closeDialog(); setMobilePanel("editor");
    requestAnimationFrame(() => {
      const editor = document.querySelector<HTMLTextAreaElement>(".markdown-editor");
      if (editor && issue.startLine) {
        const offset = article.markdown.split("\n").slice(0, issue.startLine - 1).join("\n").length + (issue.startLine > 1 ? 1 : 0);
        editor.focus(); editor.setSelectionRange(offset, offset);
      }
    });
  }

  function exportFile(kind: "bundle" | "html" | "markdown") {
    try {
      const title = (result.document.title || "未命名文章").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 80);
      if (kind === "bundle") download(exportArticleBundle(article), `${title}.wedraft.zip`, "application/zip");
      else if (kind === "markdown") download(article.markdown, `${title}.md`, "text/markdown;charset=utf-8");
      else {
        if (result.html === null || output.error) throw new Error("请修正阻断问题后再导出预览。");
        download(createPreviewHtml(result), `${title}.html`, "text/html;charset=utf-8");
      }
      notify("文件已交给浏览器下载。"); closeDialog();
    } catch (error) { notify(error instanceof Error ? error.message : "导出失败。", true); }
  }

  if (!ready) return <div className="app-loading">正在打开 WeDraft…</div>;
  return <div className="web-app" data-mobile-panel={mobilePanel}
    onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
    onDrop={(event) => { const file = event.dataTransfer.files[0]; if (file) { event.preventDefault(); void importFile(file); } }}>
    <header className="web-header">
      <div className="brand"><span>W</span><strong>WeDraft</strong><small>文章排版工作台</small></div>
      <nav aria-label="文章操作">
        <button className="web-action" onClick={() => { void (async () => { if (await beforeReplace()) { store.newArticle(); setAssets([]); setDemo(true); setSaveState("样稿不会保存"); setMessage(""); sessionStorage.removeItem("wedraft.web.active"); setContentSync(null); setActiveBlock(null); } })().catch((error) => notify(String(error), true)); }}><FilePlus2 size={16} />新建</button>
        <button className="web-action" onClick={() => fileInput.current?.click()}><FolderOpen size={16} />导入</button>
        <button className="web-action" onClick={() => { void (async () => { await persist(); setDrafts(await listDrafts()); setDialog("history"); })().catch((error) => notify(String(error), true)); }}><FileClock size={16} />本机草稿</button>
        <button className="web-action ai-entry" onClick={() => setDialog("ai")}><Sparkles size={16} />接入 AI</button>
      </nav>
      <input ref={fileInput} type="file" accept=".md,.markdown,.txt,.json,.zip" aria-label="导入文章文件" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importFile(file); }} />
    </header>
    <div className="web-context"><div><span className="local-dot" />本地处理<span className="context-divider">/</span><span>原稿与图片保存在此浏览器，文章包可随时带走</span></div><span>WEB PREVIEW · {ENGINE_VERSION}</span></div>
    {showingDemo && <div className="sample-banner"><span>先看看排版效果，或点击左侧开始写作。</span><button onClick={() => load(articleInputSchema.parse({ markdown: SAMPLE, templateId: article.templateId }))}>使用这篇示例 <span aria-hidden>↗</span></button></div>}
    <div className="mobile-tabs" aria-label="编辑与预览切换"><button aria-pressed={mobilePanel === "editor"} onClick={() => setMobilePanel("editor")}>编辑原稿</button><button aria-pressed={mobilePanel === "preview"} onClick={() => setMobilePanel("preview")}>阅读预览</button></div>
    <main className="workspace web-workspace">
      <ArticleEditor demoActive={showingDemo} demoMarkdown={SAMPLE} persistenceHint="编辑后自动保存到此浏览器" characterCount={`${result.document.title}${result.plainText}`.replace(/\s/g, "").length}
        imageProcessingHint="保留原图片与 GIF 动画；单张上限 10 MiB。"
        onDismissDemo={() => { setDemo(false); setMessage(""); }} sourceMap={result.sourceMap} contentSync={contentSync} activeBlock={activeBlock}
        onContentAnchorChange={(anchor) => sync("editor", anchor)} onActiveBlockChange={(block) => highlight("editor", block)} onImagePreviewReady={() => {}}
        prepareImage={async (file) => {
          const image = await prepareBrowserImage(file);
          const next = [...assets.filter((asset) => asset.path !== image.asset.path), image.asset];
          validateAssets(next); setAssets(next); return image;
        }} />
      <WechatPreview document={result.document} html={result.previewHtml} markdown={store.markdown} sourceMap={result.sourceMap}
        directEditDisabled={showingDemo || Boolean(output.error)} onMarkdownChange={(value) => store.setMarkdown(value, "checkpoint")}
        templateId={store.settings.defaultTemplateId} onTemplateChange={(id) => store.setSettings({ ...store.settings, defaultTemplateId: id })}
        contentSync={contentSync} activeBlock={activeBlock} onContentAnchorChange={(anchor) => sync("preview", anchor)} onActiveBlockChange={(block) => highlight("preview", block)} />
    </main>
    <footer className="web-footer">
      <div className={`web-status ${messageError || output.error ? "error" : ""}`} aria-live="polite"><span>{output.error || message || (showingDemo ? "样稿不会保存；开始编辑后自动保存草稿" : saveState)}</span><small>排版效果以微信实际粘贴后的预览为准</small></div>
      <div className="footer-actions"><button className={`web-action issue-count ${result.status}`} disabled={showingDemo} onClick={() => { setCopyConfirm(false); setDialog("issues"); }}>{result.issues.filter((issue) => issue.level === "blocking").length ? `${result.issues.filter((issue) => issue.level === "blocking").length} 项待修正` : `${result.issues.length} 项提示`}</button>
        <button className="web-action" disabled={showingDemo} onClick={() => setDialog("export")}><Download size={16} />导出</button>
        <button className="button primary web-copy" disabled={showingDemo || copying || Boolean(output.error)} onClick={() => {
          if (result.issues.some((issue) => issue.level === "blocking" || !["BODY_SHORT", "DIGEST_EMPTY"].includes(issue.code))) { setCopyConfirm(true); setDialog("issues"); }
          else void copy();
        }}><Copy size={16} />{copying ? "正在复制…" : "复制排版"}</button></div>
    </footer>
    {dialog === "export" && <Dialog title="把文章带走" onClose={closeDialog}><p className="dialog-intro">文章包保留原稿、模板和本地图片，可在网页或 AI 工具中继续编辑。</p><div className="export-options">
      <button onClick={() => exportFile("bundle")}><Upload /><span><strong>可编辑文章包</strong><small>.wedraft.zip · 推荐用于保存与 AI 交接</small></span></button>
      <button disabled={result.status === "blocked" || Boolean(output.error)} onClick={() => exportFile("html")}><Monitor /><span><strong>网页预览</strong><small>.html · 带图片与样式的阅读文件</small></span></button>
      <button onClick={() => exportFile("markdown")}><Download /><span><strong>Markdown 原稿</strong><small>.md · 仅文本，不包含本地图片文件</small></span></button></div></Dialog>}
    {dialog === "history" && <Dialog title="本机草稿" onClose={closeDialog}><p className="dialog-intro">编辑后自动保存到此浏览器。清除浏览器数据会影响这些草稿，请用文章包保留重要内容。</p><div className="draft-list">{drafts.length ? drafts.map((draft) => <button key={draft.id} onClick={() => { try { load(draft.article, draft.id); closeDialog(); } catch (error) { notify(String(error), true); } }}><strong>{draft.article.markdown.split(/\r?\n/).find((line) => line.trim())?.replace(/^#+\s*/, "") || "未命名文章"}</strong><small>{new Date(draft.updatedAt).toLocaleString()} · {draft.article.assets.length} 张本地图片</small></button>) : <p>还没有草稿。开始编辑后，文章会自动保存在这里。</p>}</div></Dialog>}
    {dialog === "issues" && <Dialog title={result.status === "blocked" ? "修正后再复制" : "排版检查"} onClose={closeDialog}><p className="dialog-intro">点击问题可定位到原稿。提示不会自动改写内容。</p><div className="web-issues">{result.issues.length ? result.issues.map((issue, index) => <button key={`${issue.code}-${index}`} onClick={() => locate(issue)}><span className={issue.level}>{issue.level === "blocking" ? "必须修正" : "建议检查"} {issue.startLine ? `· 第 ${issue.startLine} 行` : ""}</span><p>{issue.message}</p></button>) : <p><Check size={16} /> 未发现排版问题。</p>}</div>{copyConfirm && result.status === "ready" && <button className="button primary" onClick={() => { closeDialog(); void copy(); }}>确认并继续复制</button>}</Dialog>}
    {dialog === "ai" && <Dialog title="让 AI 帮你完成排版" onClose={closeDialog}><p className="dialog-intro">让 AI 使用 WeDraft 的 MCP 或 CLI 生成文章包，再拖入这个网页继续修改。</p><blockquote className="ai-example">把这篇文章按 WeDraft 模板排版，保留原文和来源，给我预览与可编辑文章包。</blockquote><ol className="ai-steps"><li>从项目源码安装 CLI / 本地 MCP，或使用配套 Skill。</li><li>AI 调用模板、检查、排版与导出工具。</li><li>将生成的 <strong>.wedraft.zip</strong> 文件导入这里。</li></ol><p className="dialog-intro">首版使用本地工具，不会自动上传文章或发布到微信。</p><button className="web-action" onClick={() => download(aiGuide, "WeDraft-AI接入说明.md", "text/markdown;charset=utf-8")}><Download size={16} />下载接入说明</button><button className="button primary" onClick={() => { closeDialog(); fileInput.current?.click(); }}>导入 AI 生成的文章包</button></Dialog>}
  </div>;
}
