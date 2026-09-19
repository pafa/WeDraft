import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Copy, FileText, Plus, Sparkles, X } from "lucide-react";
import { listTemplates, renderArticle } from "@wedraft/core";
import { MARKDOWN_RULES_PROMPT } from "@wedraft/editor-ui/markdown-rules";

const catalog = listTemplates();
const example = `# 让内容，自然地被读懂

## 1. 建立阅读层级

好的排版让读者更容易走进一篇文章。一个自然段表达一个核心意思，用 **关键结论** 帮助读者快速扫描。

### 把复杂内容拆小

> 真正好的排版不会抢走内容的注意力，而是让信息自己发光。

- 章节标题负责建立结构
- 短段落负责降低阅读压力
- 强调、引用和列表负责提高扫描效率

## 2. 留下呼吸的空间

适当的行距和留白，让长文也能轻松读下去。模板只改变呈现方式，保留作者原有的表达。

| 展示元素 | 主要用途 |
| --- | --- |
| 标题 | 建立层级 |
| 正文 | 连续阅读 |

## 参考资料

1. [WeDraft 排版示例](https://example.com)
`;

function TemplateDetail({ name, onClose, children, articlePreview = true }: { name: string; onClose: () => void; children: ReactNode; articlePreview?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="template-detail-overlay" aria-label={articlePreview ? `${name}完整排版` : name} onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) ref.current?.close(); }}><section className="template-detail"><div className="dialog-heading"><h2>{name}</h2><button autoFocus className="web-icon-button" aria-label={articlePreview ? "关闭模板预览" : "关闭添加说明"} onClick={() => ref.current?.close()}><X size={20} /></button></div>{children}</section></dialog>;
}

export function TemplatesPage({ defaultId, currentId, onChoose }: { defaultId: string; currentId: string; onChoose: (id: string) => void }) {
  const [contributing, setContributing] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const previews = useMemo(() => new Map(catalog.map((template) => [template.id, renderArticle({ markdown: example, templateId: template.id }).previewHtml])), []);
  const selected = catalog.find((template) => template.id === detail);
  return <main className="discovery-page template-page">
    <h1 className="template-title">模板库</h1>
    <div className="template-grid">{catalog.map((template) => <article className="template-card" key={template.id} style={{ "--template-accent": template.accentColor } as CSSProperties}>
      <div className="template-card-heading"><h2>{template.name}</h2>{template.id === defaultId && <span className="default-badge"><Check size={12} />默认</span>}</div>
      <button className="template-preview" aria-label={`预览${template.name}`} onClick={() => setDetail(template.id)}><div aria-hidden inert className="template-preview-content" dangerouslySetInnerHTML={{ __html: previews.get(template.id) ?? "" }} /><span className="preview-open">查看完整排版 <ArrowUpRight size={15} /></span></button>
      <div className="template-card-actions"><span>{currentId === template.id ? "当前使用" : ""}</span><button className="web-action" onClick={() => onChoose(template.id)}>设为默认并使用</button></div>
    </article>)}</div>
    <button className="add-template" aria-label="添加模板" title="添加模板" onClick={() => setContributing(true)}><Plus size={26} /></button>
    {contributing && <TemplateDetail name="添加模板" articlePreview={false} onClose={() => setContributing(false)}><p className="template-contribution-copy">Fork WeDraft 项目，设计并添加你的模板。欢迎提交 PR，让模板库更丰富。</p><a className="button primary" href="https://github.com/pafa/WeDraft" target="_blank" rel="noreferrer">前往 GitHub <ArrowUpRight size={16} /></a></TemplateDetail>}
    {selected && <TemplateDetail name={selected.name} onClose={() => setDetail(null)}><div className="template-detail-article" dangerouslySetInnerHTML={{ __html: previews.get(selected.id) ?? "" }} /><button className="button primary" onClick={() => onChoose(selected.id)}>设为默认并使用</button></TemplateDetail>}
  </main>;
}

function CopyAction({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState("");
  async function copyText() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setState("已复制");
    } catch { setState("复制未成功，请展开或选中文字复制"); }
  }
  return <div className="ai-copy-action"><button className="web-action" onClick={() => void copyText()}><Copy size={15} />{label}</button><span role="status">{state}</span></div>;
}

function CopyBlock({ text, label }: { text: string; label: string }) {
  return <div className="copy-block"><pre><code>{text}</code></pre><CopyAction text={text} label={label} /></div>;
}

export function AiPage() {
  const [path, setPath] = useState<"manual" | "automatic">("manual");
  const base = new URL(import.meta.env.BASE_URL, window.location.href).href.split("#")[0];
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(window.location.hostname);
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  const command = `curl -fsSL ${quote(`${base}integrations/install.sh`)} | sh -s -- ${quote(`${base}integrations/`)}`;
  const setupPrompt = `请阅读 ${base}connect.md，为我安装 WeDraft 的 Skill 并接入本地 MCP。完成后列出可用模板，并确认可以生成排版预览。`;
  const taskPrompt = "用 WeDraft 的青岚模板排版上面的 Markdown，保留原文、链接和图片来源；给我可以复制富文本的排版预览。有阻断问题时先指出位置。";
  const paths = [
    { id: "manual" as const, title: "手工整理", caption: "文档格式杂，先让 AI 整理，再到网页调整。", icon: FileText },
    { id: "automatic" as const, title: "自动排版", caption: "AI 里已经有 Markdown，一句话生成排版结果。", icon: Sparkles },
  ];

  return <main className="discovery-page ai-page ai-workflows">
    <a className="back-link" href="#/"><ArrowLeft size={16} />返回编辑</a>
    <div className="page-heading"><div><p className="section-kicker">AI 帮忙，排版更轻松</p><h1>从原稿到微信，<br className="ai-title-break" />选一种顺手的方式。</h1><p>先用 AI 整理文档，或直接让 AI 调用 WeDraft。<br />两条路都保留原文，最后拿到可以粘贴到微信的排版。</p></div></div>
    <div className="ai-path-switch" role="group" aria-label="选择排版方式">{paths.map(({ id, title, caption, icon: Icon }) => <button key={id} type="button" aria-label={title} aria-describedby={`ai-${id}-description`} aria-pressed={path === id} onClick={() => setPath(id)}><span className="ai-path-icon"><Icon size={20} /></span><span><strong>{title}</strong><small id={`ai-${id}-description`}>{caption}</small></span><ArrowRight className="ai-path-arrow" size={19} /></button>)}</div>

    {path === "manual" ? <section className="ai-path-panel" id="ai-manual-path" aria-labelledby="ai-manual-title">
      <div className="ai-path-heading"><div><p className="section-kicker">方式一 · 无需安装</p><h2 id="ai-manual-title">让 AI 整理，自己把关效果。</h2></div><span className="support-badge">适合你常用的 AI 对话</span></div>
      <p className="ai-path-intro">Word、网页文字或其他格式的原稿，先交给 AI 转成 WeDraft 支持的 Markdown，再回到网页微调。</p>
      <ol className="ai-workflow-steps"><li><span>01</span><div><h3>复制格式指令，连同原文发给 AI</h3><p>下面的指令与编辑器内的“复制 Markdown 规则”相同：只加排版标记，不改写、不删减、不补内容。</p></div></li><li><span>02</span><div><h3>把 AI 返回的 Markdown 粘回网页</h3><p>复制完整代码块里的原稿，在编辑器选择模板、检查图片来源，再按预览调整。</p></div></li><li><span>03</span><div><h3>点击“复制排版”，粘贴到微信</h3><p>复制的是带样式的正文。标题单独填写，粘贴后检查图片和手机效果。</p></div></li></ol>
      <div className="ai-rules-card"><div><FileText size={20} /><div><h3>WeDraft Markdown 格式指令</h3><p>保留原文 · 保留来源 · 输出完整 Markdown</p></div></div><CopyAction text={MARKDOWN_RULES_PROMPT} label="复制 Markdown 格式指令" /><details className="ai-rules-details"><summary>查看完整指令</summary><pre>{MARKDOWN_RULES_PROMPT}</pre></details></div>
      <div className="ai-next-step"><span>拿到 Markdown 之后，就可以开始排版。</span><a className="button primary" href="#/">打开网页编辑器 <ArrowRight size={16} /></a></div>
    </section> : <section className="ai-path-panel" id="ai-automatic-path" aria-labelledby="ai-automatic-title">
      <div className="ai-path-heading"><div><p className="section-kicker">方式二 · 安装一次，以后一句话</p><h2 id="ai-automatic-title">文章已经写好，直接让 AI 排版。</h2></div><span className="support-badge">本机 Agent · Codex 一键接入</span></div>
      <p className="ai-path-intro">AI 里已有 Markdown 时，不必重新粘回编辑器。接入 WeDraft 后，AI 可以选模板、检查原稿，直接交付排版结果。</p>
      <div className="connect-panel ai-setup-panel"><div className="connect-heading"><div><p className="section-kicker">第一次使用</p><h3>把这句话告诉你的 AI</h3></div><span className="support-badge">macOS / Linux</span></div><p>发给能执行本机命令的 Codex，自动安装 Skill 和本地 MCP，无需逐个下载文件。</p><CopyBlock text={setupPrompt} label="复制接入指令" />
        <details className="command-option"><summary>也可以在终端执行一条命令</summary><CopyBlock text={command} label="复制安装命令" /><p>自动准备运行环境并保留已有配置，不修改系统 Node。正在运行的对话可能需要重新打开，才能加载新工具。</p></details>
        {local && <p className="local-connect-note">当前是本机预览地址，只适用于这台电脑上的 AI。正式部署后，这里会自动使用网站地址。</p>}
      </div>
      <section className="ai-task-panel"><div className="ai-step-heading"><span>01</span><div><h3>以后排版，只要这一句话</h3><p>把它发在已有 Markdown 的对话里。模板名可以换成你喜欢的一款。</p></div></div><CopyBlock text={taskPrompt} label="复制排版指令" /></section>
      <section className="ai-result-panel"><div className="ai-step-heading"><span>02</span><div><h3>打开结果，复制到微信</h3><p>打开 AI 交付的排版预览，点击“复制正文排版”，把富文本正文粘贴到公众号后台。想再调整时，再将文章包导入网页。</p></div></div><div className="ai-result-flow" aria-label="自动排版流程"><span>已有 Markdown</span><ArrowRight size={15} /><span>AI 调用 WeDraft</span><ArrowRight size={15} /><span>复制排版结果</span><ArrowRight size={15} /><span>粘贴微信</span></div></section>
      <details className="ai-agent-note"><summary>让 Agent 继续完成复制、粘贴，可以吗？</summary><p>如果 AI 客户端还具备浏览器和剪贴板能力，它可以在获得你的授权后继续操作预览页和微信后台。WeDraft 的 MCP 本身只负责排版、检查与文件导出；复制、粘贴取决于宿主能力，不会自动发布文章。</p></details>
    </section>}

    <section className="ai-faq"><h2>还有几个小问题</h2><details><summary>手工整理也需要装 Skill 或 MCP 吗？</summary><p>不需要。复制格式指令给你常用的 AI，拿到 Markdown 后回网页即可。只有希望 AI 直接调用排版工具时，才需要接入 Skill / MCP。</p></details><details><summary>Skill 和 MCP 分别做什么？</summary><p>Skill 告诉 AI 怎样保留原文、检查问题和交付结果；MCP 提供查询模板、检查、渲染和导出的工具。一条安装命令会同时准备两者，Skill 也可以调用 CLI 完成任务。</p></details><details><summary>所有 AI 都能自动接入吗？</summary><p>当前一键配置面向 macOS / Linux 上的 Codex。其他支持本地 stdio MCP 的客户端可使用安装目录里的连接配置；纯网页聊天和只接受远程 MCP 地址的客户端不能直接连接此版本，但可以使用手工整理方式。</p></details><details><summary>排版结果会上传或自动发布吗？</summary><p>WeDraft 在本机处理，生成的文件保存在本机，不会自动改写或发布。你所用 AI 如何处理原稿与对话，取决于该客户端的设置。微信中粘贴后的图片、字号和最终发布仍需检查。</p></details><details><summary>安装在哪里，怎样管理？</summary><p>工具默认放在 ~/.local/share/wedraft，Skill 放在 ~/.agents/skills/format-with-wedraft，Codex 连接写入 ~/.codex/config.toml。已有同名配置或本地修改会被保留并提示处理；默认导出位置是 ~/Documents/WeDraft Exports/。</p></details></section>
  </main>;
}
