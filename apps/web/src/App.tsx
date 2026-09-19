import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Download, FilePlus2, FolderOpen, Monitor, Sparkles, Palette, Upload, X } from "lucide-react";
import { articleInputSchema, createPreviewHtml, ENGINE_VERSION, exportArticleBundle, importArticleBundle, MAX_BUNDLE_BYTES, renderArticle, validateAssets, type ArticleAsset, type LocatedIssue, type PortableArticle } from "@wedraft/core";
import { ArticleEditor } from "../../desktop/src/components/ArticleEditor.js";
import { WechatPreview } from "../../desktop/src/components/WechatPreview.js";
import { useEditorStore } from "../../desktop/src/stores/editor-store.js";
import type { ContentAnchor, ContentSyncEvent } from "../../desktop/src/services/scroll-sync.js";
import { copyHtml, download, prepareBrowserImage } from "./platform.js";
import { SAMPLE, loadSampleAssets } from "./sample.js";
import { TemplatesPage, AiPage } from "./Pages.js";
import { readDefaultTemplate, templateCookie } from "./preferences.js";

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
  const [sampleAssets, setSampleAssets] = useState<ArticleAsset[]>([]);
  const [demoActive, setDemoActive] = useState(true);
  const [defaultTemplate, setDefaultTemplate] = useState(() => readDefaultTemplate(document.cookie));
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || "/");
  useEffect(() => {
    const update = () => setRoute(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    document.title = `${route === "/templates" ? "模板库" : route === "/ai" ? "接入 AI" : "文章排版"} · WeDraft`;
    if (route === "/templates") setDefaultTemplate(readDefaultTemplate(document.cookie));
  }, [route]);
  const editing = route !== "/templates" && route !== "/ai";
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [dialog, setDialog] = useState<"export" | "help" | "issues" | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyConfirm, setCopyConfirm] = useState(false);
  const [mobilePanel, setMobilePanel] = useState("editor");
  const [contentSync, setContentSync] = useState<ContentSyncEvent | null>(null);
  const [activeBlock, setActiveBlock] = useState<{ blockIndex: number; origin: "editor" | "preview" } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);
  const showingDemo = demoActive && !store.markdown;
  const article = useMemo(() => ({ markdown: store.markdown, templateId: store.settings.defaultTemplateId,
    author: store.author, digest: store.digest, sourceUrl: store.sourceUrl, assets }),
  [store.markdown, store.settings.defaultTemplateId, store.author, store.digest, store.sourceUrl, assets]);
  const output = useMemo(() => {
    try { return { result: renderArticle(showingDemo ? { ...article, markdown: SAMPLE, assets: sampleAssets } : article), error: "" }; }
    catch (error) { return { result: renderArticle({ markdown: "" }), error: error instanceof Error ? error.message : "文章无法解析。" }; }
  }, [article, showingDemo, sampleAssets]);
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
    setAssets(input.assets); setDemoActive(false); setActiveBlock(null); setContentSync(null);
    setCopyConfirm(false); setMessage(""); setMessageError(false);
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const id = crypto.randomUUID();
    const templateId = readDefaultTemplate(document.cookie);
    load(articleInputSchema.parse({ markdown: "", templateId }), id);
    setDemoActive(true);
    void loadSampleAssets().then(setSampleAssets).catch((error) => notify(String(error), true));
    setReady(true);
  }, [load, notify]);

  const sync = (origin: "editor" | "preview", anchor: ContentAnchor) => setContentSync((current) => ({ origin, anchor, revision: (current?.revision ?? 0) + 1 }));
  const highlight = (origin: "editor" | "preview", blockIndex: number | null) => setActiveBlock((previous) => {
    if (blockIndex === null) return previous === null ? previous : null;
    return previous?.origin === origin && previous.blockIndex === blockIndex ? previous : { origin, blockIndex };
  });
  const closeDialog = () => { setDialog(null); setCopyConfirm(false); };

  async function importFile(file: File) {
    try {
      if (file.size > MAX_BUNDLE_BYTES) throw new Error("文件超过大小限制。");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const input = file.name.endsWith(".zip") ? importArticleBundle(bytes) : file.name.endsWith(".json")
        ? articleInputSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)))
        : articleInputSchema.parse({ markdown: new TextDecoder("utf-8", { fatal: true }).decode(bytes), templateId: store.settings.defaultTemplateId });
      renderArticle(input);
      load(input); setMobilePanel("editor"); window.location.hash = "/";
      notify(`已导入 ${file.name}，可以继续编辑。`); setDialog(null);
    } catch (error) { notify(error instanceof Error ? error.message : "导入失败，当前文章未被替换。", true); }
  }

  async function copy() {
    if (showingDemo || output.error || result.html === null) return;
    setCopying(true);
    try {
      // Invoke directly during the click to preserve browser user activation.
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

  function chooseTemplate(id: string) {
    try {
      document.cookie = templateCookie(id, window.location.protocol === "https:");
      const remembered = readDefaultTemplate(document.cookie) === id;
      if (remembered) setDefaultTemplate(id);
      store.setSettings({ ...store.settings, defaultTemplateId: id });
      window.location.hash = "/";
      notify(remembered ? "已设为默认模板，下次打开继续使用。" : "已应用模板。浏览器未允许记住选择，下次需要重新选择。", !remembered);
    } catch (error) { notify(String(error), true); }
  }

  if (!ready) return <div className="app-loading">正在打开 WeDraft…</div>;
  return <div className="web-app" data-mobile-panel={mobilePanel} data-page={editing ? "editor" : route.slice(1)}
    onDragOver={(event) => { if (editing && event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
    onDrop={(event) => { const file = event.dataTransfer.files[0]; if (editing && file) { event.preventDefault(); void importFile(file); } }}>
    <header className="web-header">
      <div className="brand-family"><a href="#/" className="brand" aria-label="WeDraft 首页"><img className="brand-icon" src={`${import.meta.env.BASE_URL}app-icon.png`} width="32" height="32" alt="WeDraft 应用图标" /><strong>WeDraft</strong></a><a className="publisher-brand" href="https://xiaoha.org" target="_blank" rel="noreferrer" aria-label="小哈公社出品"><img src={`${import.meta.env.BASE_URL}xiaoha-logo.png`} width="20" height="20" alt="" /><span>小哈公社出品</span></a></div>
      <nav aria-label="主导航"><a href="#/" aria-current={editing ? "page" : undefined}>编辑器</a><a href="#/templates" aria-current={route === "/templates" ? "page" : undefined}><Palette size={16} />模板库</a><a href="#/ai" aria-current={route === "/ai" ? "page" : undefined}><Sparkles size={16} />接入 AI</a></nav>
      <div className="document-actions">
      <button className="web-action" onClick={() => { load(articleInputSchema.parse({ markdown: "", templateId: readDefaultTemplate(document.cookie) })); setMobilePanel("editor"); window.location.hash = "/"; }}><FilePlus2 size={16} />新建</button>
      <button className="web-action" onClick={() => fileInput.current?.click()}><FolderOpen size={16} />导入</button>
    </div>
      <input ref={fileInput} type="file" accept=".md,.markdown,.txt,.json,.zip" aria-label="导入文章文件" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importFile(file); }} />
    </header>
    {!editing && messageError && <p className="global-action-error" role="alert">{message}</p>}
    {editing && <>
    <div className="mobile-tabs" aria-label="编辑与预览切换"><button aria-pressed={mobilePanel === "editor"} onClick={() => setMobilePanel("editor")}>编辑原稿</button><button aria-pressed={mobilePanel === "preview"} onClick={() => setMobilePanel("preview")}>阅读预览</button></div>
    <main className="workspace web-workspace">
      <ArticleEditor demoActive={showingDemo} demoMarkdown={SAMPLE} compactHeader persistenceHint="" characterCount={`${result.document.title}${result.plainText}`.replace(/\s/g, "").length}
        imageProcessingHint="保留原图片与 GIF 动画；单张上限 10 MiB。"
        onDismissDemo={() => { setDemoActive(false); setContentSync(null); setActiveBlock(null); setMessage(""); }} sourceMap={result.sourceMap} contentSync={contentSync} activeBlock={activeBlock}
        onContentAnchorChange={(anchor) => sync("editor", anchor)} onActiveBlockChange={(block) => highlight("editor", block)} onImagePreviewReady={() => {}}
        prepareImage={async (file) => {
          const image = await prepareBrowserImage(file);
          const next = [...assets.filter((asset) => asset.path !== image.asset.path), image.asset];
          validateAssets(next); setAssets(next); return image;
        }} />
      <WechatPreview document={result.document} html={result.previewHtml} markdown={store.markdown} sourceMap={result.sourceMap}
        directEditDisabled={showingDemo || Boolean(output.error)} onMarkdownChange={(value) => store.setMarkdown(value, "checkpoint")}
        templateId={store.settings.defaultTemplateId} onTemplateChange={chooseTemplate} fixedDevice
        templateControl={<div className="current-template"><span><strong>{result.template.name}</strong></span><a href="#/templates">更多模板 <span aria-hidden>↗</span></a></div>}
        contentSync={contentSync} activeBlock={activeBlock} onContentAnchorChange={(anchor) => sync("preview", anchor)} onActiveBlockChange={(block) => highlight("preview", block)} />
    </main>
    <footer className="web-footer">
      <div className={`web-status ${messageError || output.error ? "error" : ""}`} aria-live="polite"><span>{output.error || message || (showingDemo ? "排版示例 · 点击左侧开始输入" : "仅本页暂存 · 刷新后清空")}</span><button className="quiet-link" onClick={() => setDialog("help")}>使用说明</button></div>
      <div className="footer-actions"><button className={`web-action issue-count ${result.status}`} onClick={() => { setCopyConfirm(false); setDialog("issues"); }}>{result.issues.filter((issue) => issue.level === "blocking").length ? `${result.issues.filter((issue) => issue.level === "blocking").length} 项待修正` : `${result.issues.length} 项提示`}</button>
        <button className="web-action" disabled={showingDemo} onClick={() => setDialog("export")}><Download size={16} />导出</button>
        <button className="button primary web-copy" disabled={showingDemo || copying || Boolean(output.error)} onClick={() => {
          if (result.issues.some((issue) => issue.level === "blocking" || !["BODY_SHORT", "DIGEST_EMPTY"].includes(issue.code))) { setCopyConfirm(true); setDialog("issues"); }
          else void copy();
        }}><Copy size={16} />{copying ? "正在复制…" : "复制排版"}</button></div>
    </footer></>}
    {route === "/templates" && <TemplatesPage defaultId={defaultTemplate} currentId={article.templateId} onChoose={chooseTemplate} />}
    {route === "/ai" && <AiPage />}
    {dialog === "export" && <Dialog title="把文章带走" onClose={closeDialog}><p className="dialog-intro">文章包保留原稿、模板和本地图片，可在网页或 AI 工具中继续编辑。</p><div className="export-options">
      <button onClick={() => exportFile("bundle")}><Upload /><span><strong>可编辑文章包</strong><small>.wedraft.zip · 推荐用于保存与 AI 交接</small></span></button>
      <button disabled={result.status === "blocked" || Boolean(output.error)} onClick={() => exportFile("html")}><Monitor /><span><strong>网页预览</strong><small>.html · 带图片与样式的阅读文件</small></span></button>
      <button onClick={() => exportFile("markdown")}><Download /><span><strong>Markdown 原稿</strong><small>.md · 仅文本，不包含本地图片文件</small></span></button></div></Dialog>}
    {dialog === "issues" && <Dialog title={result.status === "blocked" ? "修正后再复制" : "排版检查"} onClose={closeDialog}><p className="dialog-intro">点击问题可定位到原稿。提示不会自动改写内容。</p><div className="web-issues">{result.issues.length ? result.issues.map((issue, index) => <button key={`${issue.code}-${index}`} onClick={() => locate(issue)}><span className={issue.level}>{issue.level === "blocking" ? "必须修正" : "建议检查"} {issue.startLine ? `· 第 ${issue.startLine} 行` : ""}</span><p>{issue.message}</p></button>) : <p><Check size={16} /> 未发现排版问题。</p>}</div>{copyConfirm && result.status === "ready" && <button className="button primary" onClick={() => { closeDialog(); void copy(); }}>确认并继续复制</button>}</Dialog>}
    {dialog === "help" && <Dialog title="使用说明" onClose={closeDialog}><p className="dialog-intro">文章和图片仅在当前页面内存中处理，刷新或关闭后清空。切换本站页面可继续编辑；如需保存，请先导出文章包。</p><p className="dialog-intro">手机预览按固定逻辑分辨率绘制，默认等比缩放以展示完整机身，也可以切换到 100%。状态栏为模拟显示；系统字体、微信版本与用户字号设置会影响真机效果，发布前请在微信中预览。</p><p className="dialog-intro">默认模板通过 Cookie 记住一年。导入文章包时，保留该文章自己的模板。</p><small>WeDraft Web · 排版引擎 {ENGINE_VERSION}</small></Dialog>}
  </div>;
}
