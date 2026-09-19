import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { ArrowLeft, ArrowUpRight, Check, Copy, Search, X } from "lucide-react";
import { listTemplates, renderArticle } from "@wedraft/core";

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

function TemplateDetail({ name, onClose, children }: { name: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="template-detail-overlay" aria-label={`${name}完整排版`} onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) ref.current?.close(); }}><section className="template-detail"><div className="dialog-heading"><h2>{name}</h2><button autoFocus className="web-icon-button" aria-label="关闭模板预览" onClick={() => ref.current?.close()}><X size={20} /></button></div>{children}</section></dialog>;
}

export function TemplatesPage({ defaultId, currentId, onChoose }: { defaultId: string; currentId: string; onChoose: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const previews = useMemo(() => new Map(catalog.map((template) => [template.id, renderArticle({ markdown: example, templateId: template.id }).previewHtml])), []);
  const selected = catalog.find((template) => template.id === detail);
  const matches = catalog.filter((template) => `${template.name} ${template.description}`.includes(query.trim()));
  return <main className="discovery-page template-page">
    <a className="back-link" href="#/"><ArrowLeft size={16} />返回编辑</a>
    <div className="page-heading"><div><p className="section-kicker">为你的文字，选一种气质</p><h1>模板库</h1><p>从这里挑选喜欢的排版。设为默认后，下次打开就能直接使用。</p></div><label className="catalog-search"><Search size={18} /><input aria-label="搜索模板" placeholder="搜索名称或文章类型" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
    <div className="catalog-summary"><span>{catalog.length} 款模板</span><span>同一篇内容，不同的阅读感受</span></div>
    <div className="template-grid">{matches.map((template) => <article className="template-card" key={template.id} style={{ "--template-accent": template.accentColor } as CSSProperties}>
      <div className="template-card-heading"><h2>{template.name}</h2>{template.id === defaultId && <span className="default-badge"><Check size={12} />默认</span>}</div>
      <p className="template-description">{template.description}</p>
      <button className="template-preview" aria-label={`预览${template.name}`} onClick={() => setDetail(template.id)}><div aria-hidden inert className="template-preview-content" dangerouslySetInnerHTML={{ __html: previews.get(template.id) ?? "" }} /><span className="preview-open">查看完整排版 <ArrowUpRight size={15} /></span></button>
      <div className="template-card-actions"><span>{currentId === template.id ? "当前文章使用中" : "WeDraft · 内置"}</span><button className="web-action" onClick={() => onChoose(template.id)}>设为默认并使用</button></div>
    </article>)}</div>
    {!matches.length && <p className="empty-search">没有找到这个模板，试试“长文”或“科技”。</p>}
    <section className="contribute-panel"><div><p className="section-kicker">让好排版不断生长</p><h2>每一种风格，都可以成为一款模板。</h2><p>模板与编辑器独立维护。未来开源后，你可以通过 GitHub 提交自己的作品，让更多人使用。</p></div><details><summary>模板如何加入这里</summary><p>提交模板样式、唯一 ID、名称与简介，并附上一份完整的效果预览。通过格式、内容保真和复制兼容性检查后，登记到模板目录，网页、CLI 和 MCP 就会同时获得这款模板。</p><p>当前展示的是随版本提供的内置模板；社区投稿入口将在仓库公开后启用。</p></details></section>
    {selected && <TemplateDetail name={selected.name} onClose={() => setDetail(null)}><div className="template-detail-article" dangerouslySetInnerHTML={{ __html: previews.get(selected.id) ?? "" }} /><button className="button primary" onClick={() => onChoose(selected.id)}>设为默认并使用</button></TemplateDetail>}
  </main>;
}

function CopyBlock({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState("");
  async function copyText() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setState("已复制");
    } catch { setState("复制未成功，请选中文字复制"); }
  }
  return <div className="copy-block"><pre><code>{text}</code></pre><button className="web-action" onClick={() => void copyText()}><Copy size={15} />{label}</button><span role="status">{state}</span></div>;
}

export function AiPage() {
  const base = new URL(import.meta.env.BASE_URL, window.location.href).href.split("#")[0];
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(window.location.hostname);
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  const command = `curl -fsSL ${quote(`${base}integrations/install.sh`)} | sh -s -- ${quote(`${base}integrations/`)}`;
  const prompt = `请阅读 ${base}connect.md，为我安装 WeDraft 的 Skill 并接入本地 MCP。完成后列出可用模板，然后用内置示例生成排版预览和可编辑文章包。`;
  return <main className="discovery-page ai-page">
    <a className="back-link" href="#/"><ArrowLeft size={16} />返回编辑</a>
    <div className="page-heading"><div><p className="section-kicker">让排版进入你的 AI 工作流</p><h1>写完之后，交给 WeDraft。</h1><p>AI 帮你整理内容，WeDraft 负责准确排版。<br />同一套模板，贯穿对话、网页和可编辑文章包。</p></div><span className="ai-monogram" aria-hidden>W<span>↗</span></span></div>
    <div className="ai-benefits"><section><span>01</span><h2>一句话完成排版</h2><p>让 AI 选模板、检查原稿并生成预览，保留你的文字、链接和图片来源。</p></section><section><span>02</span><h2>接着在网页里改</h2><p>AI 生成的文章包可直接拖进编辑页，修改正文、换模板，再复制排版。</p></section><section><span>03</span><h2>融入已有的流程</h2><p>把排版接在写作、资料整理或周报之后。用 MCP 调工具，用 Skill 告诉 AI 如何做好。</p></section></div>
    <section className="connect-panel"><div className="connect-heading"><div><p className="section-kicker">安装一次，以后直接用</p><h2>把这句话告诉你的 AI</h2></div><span className="support-badge">Codex · macOS / Linux</span></div><p>在能执行本机命令的 Codex 中发送下面这句话。AI 会完成安装和接入；首次连接可能需要新开一次对话。</p><CopyBlock text={prompt} label="复制接入指令" />
      {local && <p className="local-connect-note">这是本机预览地址，只适用于这台电脑上的 AI。公开部署后，这里会自动使用网站地址，可直接分享给其他人。</p>}
      <details className="command-option"><summary>也可以在终端执行一条命令</summary><CopyBlock text={command} label="复制安装命令" /><p>自动准备运行环境、安装 Skill、登记本地 MCP。无需手工下载，也不修改系统 Node。安装文件位于用户目录；已有同名配置会被保留并提示处理。</p></details>
    </section>
    <section className="try-ai"><div><p className="section-kicker">接入后，直接这样说</p><h2>从一篇文章开始</h2></div><CopyBlock text="用 WeDraft 的青岚模板排版这篇文章。保留原文和来源，检查排版问题，给我网页预览与可编辑文章包。" label="复制示例" /><div className="flow-strip"><span>你的原稿</span><b>→</b><span>AI 调用 WeDraft</span><b>→</b><span>预览 + 文章包</span><b>→</b><a href="#/">网页继续编辑 ↗</a></div></section>
    <section className="ai-faq"><h2>了解它怎样工作</h2><details><summary>Skill 和 MCP 分别做什么？</summary><p>Skill 是给 AI 的排版说明：保留什么、怎样检查、交付哪些文件。MCP 提供实际的模板查询、检查、排版和导出工具。这条安装命令会一起准备好两者。</p></details><details><summary>其他 AI 也能用吗？</summary><p>支持本地 stdio MCP 的客户端可以使用同一个服务。安装后会给出可复制的 command / args 配置。当前一键登记针对 Codex；纯网页聊天和只接受远程 MCP 地址的客户端暂不适用。</p></details><details><summary>会自动改文章或发布到微信吗？</summary><p>WeDraft 负责排版和检查，不会自动改写或发布。MCP 在你的电脑上运行，输出文件保存在本机；你使用的 AI 客户端如何处理对话和文章，取决于该客户端的设置。</p></details><details><summary>安装在哪里，如何管理？</summary><p>工具默认放在 ~/.local/share/wedraft，Skill 放在 ~/.agents/skills/format-with-wedraft，Codex 连接写入 ~/.codex/config.toml。安装重复执行时检查版本和已有配置，不覆盖其他连接或 Skill。文章导出到独立目录，不混入程序文件。</p></details></section>
  </main>;
}
