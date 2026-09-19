import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { ArrowUpRight, Check, Plus, X } from "lucide-react";
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
  const [detail, setDetail] = useState<string | null>(null);
  const previews = useMemo(() => new Map(catalog.map((template) => [template.id, renderArticle({ markdown: example, templateId: template.id }).previewHtml])), []);
  const selected = catalog.find((template) => template.id === detail);
  return <main className="discovery-page template-page">
    <h1 className="template-title">模板库</h1>
    <div className="template-grid">{catalog.map((template) => <article className="template-card" key={template.id} style={{ "--template-accent": template.accentColor } as CSSProperties}>
      <div className="template-card-heading"><h2>{template.name}</h2>{template.id === defaultId && <span className="default-badge"><Check size={12} />默认</span>}</div>
      <button className="template-preview" aria-label={`预览${template.name}`} onClick={() => setDetail(template.id)}><div aria-hidden inert className="template-preview-content" dangerouslySetInnerHTML={{ __html: previews.get(template.id) ?? "" }} /><span className="preview-open">查看完整排版 <ArrowUpRight size={15} /></span></button>
      <div className="template-card-actions"><span>{currentId === template.id ? "当前使用" : ""}</span><button className="web-action" onClick={() => onChoose(template.id)}>设为默认并使用</button></div>
    </article>)}<a className="template-card template-contribution-card" href="https://github.com/pafa/WeDraft" target="_blank" rel="noreferrer" aria-label="在 GitHub 添加模板">
      <div className="template-card-heading"><h2>添加模板</h2></div>
      <div className="template-preview contribution-preview"><Plus size={44} strokeWidth={1.25} aria-hidden /></div>
      <p className="contribution-caption">Fork 项目，设计自己的模板。<br />欢迎提交 PR，共建模板库。 <ArrowUpRight size={12} aria-hidden /></p>
    </a></div>
    {selected && <TemplateDetail name={selected.name} onClose={() => setDetail(null)}><div className="template-detail-article" dangerouslySetInnerHTML={{ __html: previews.get(selected.id) ?? "" }} /><button className="button primary" onClick={() => onChoose(selected.id)}>设为默认并使用</button></TemplateDetail>}
  </main>;
}
