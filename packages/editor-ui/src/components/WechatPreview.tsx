import { Check, Eye, Monitor, Pencil, Smartphone } from "lucide-react";
import {
  type ClipboardEvent,
  type ReactNode,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { ArticleSourceRange } from "@wedraft/article-parser";
import type { ArticleDocument } from "@wedraft/shared-types";
import { availableTemplates } from "@wedraft/wechat-renderer";

import {
  contentAnchorFromScroll,
  scrollTopForContentAnchor,
  type ContentAnchor,
  type ContentBox,
  type ContentSyncEvent,
} from "../services/scroll-sync.js";
import {
  markdownForPreviewEdit,
  replaceMarkdownSourceRange,
  serializeEditableInline,
  sourceRangeIsUnique,
} from "../services/preview-edit.js";

const PreviewTitle = memo(function PreviewTitle({ title }: { title: string }) {
  return <h1 data-wedraft-block-index="-1">{title || "文章标题"}</h1>;
});

const PreviewBody = memo(function PreviewBody({ html }: { html: string }) {
  return (
    <div
      className="article-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

type PreviewMode = "web" | "iphone" | "android";

type PendingEditTarget = {
  blockIndex: number;
  kind: string;
  position: string;
  sourceLine: number;
  caretOffset: number | null;
};

function caretOffsetFromPoint(
  root: HTMLElement,
  x: number,
  y: number,
): number | null {
  const caretDocument = window.document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = caretDocument.caretPositionFromPoint?.(x, y);
  const fallbackRange = position
    ? null
    : caretDocument.caretRangeFromPoint?.(x, y);
  const node = position?.offsetNode ?? fallbackRange?.startContainer;
  const offset = position?.offset ?? fallbackRange?.startOffset;
  if (!node || offset === undefined || !root.contains(node)) return null;
  const range = window.document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function focusEditableAtOffset(
  target: HTMLElement,
  textOffset: number | null,
) {
  target.focus({ preventScroll: true });
  if (textOffset === null) return;
  const selection = window.getSelection();
  if (!selection) return;
  const walker = window.document.createTreeWalker(
    target,
    NodeFilter.SHOW_TEXT,
  );
  let remaining = textOffset;
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      const range = window.document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
}

const previewModes: Array<{
  id: PreviewMode;
  label: string;
  description: string;
}> = [
  { id: "web", label: "网页版", description: "微信公众号网页版" },
  { id: "iphone", label: "iPhone", description: "iPhone 17 Pro Max" },
  {
    id: "android",
    label: "Android",
    description: "Samsung Galaxy S26 Ultra",
  },
];

function IosStatusIcons() {
  return (
    <span
      className="status-icons ios-status-icons"
      aria-label="蜂窝网络、无线局域网和电池"
    >
      <svg className="cellular-icon" viewBox="0 0 18 12" aria-hidden>
        <rect x="1" y="8" width="2.5" height="3" rx="0.8" />
        <rect x="5.4" y="6" width="2.5" height="5" rx="0.8" />
        <rect x="9.8" y="3.5" width="2.5" height="7.5" rx="0.8" />
        <rect x="14.2" y="1" width="2.5" height="10" rx="0.8" />
      </svg>
      <svg className="wifi-icon" viewBox="0 0 16 12" aria-hidden>
        <path d="M1 4.1C5.1.5 10.9.5 15 4.1" />
        <path d="M3.8 7c2.4-2.1 6-2.1 8.4 0" />
        <path d="M6.8 9.8c.7-.6 1.7-.6 2.4 0" />
      </svg>
      <svg
        className="ios-battery"
        viewBox="0 0 27 13"
        aria-label="电量 87%"
      >
        <rect
          className="battery-outline"
          x="1"
          y="1"
          width="22"
          height="11"
          rx="3"
        />
        <path
          className="battery-cap"
          d="M24.5 4.2v4.6c1-.3 1.5-1.1 1.5-2.3s-.5-2-1.5-2.3Z"
        />
        <rect
          className="battery-level"
          x="3"
          y="3"
          width="17.5"
          height="7"
          rx="1.5"
        />
        <text className="battery-percentage" x="11.7" y="8.5">
          87
        </text>
      </svg>
    </span>
  );
}

function SamsungStatusIcons() {
  return (
    <span
      className="status-icons samsung-status-icons"
      aria-label="静音、无线局域网、蜂窝网络和电量 92%"
    >
      <svg className="silent-icon" viewBox="0 0 14 12" aria-hidden>
        <path d="M2 4.5h2.2L7.4 2v8L4.2 7.5H2Z" />
        <path d="m9.5 4 3 4m0-4-3 4" />
      </svg>
      <svg className="wifi-icon" viewBox="0 0 16 12" aria-hidden>
        <path d="M1 4.1C5.1.5 10.9.5 15 4.1" />
        <path d="M3.8 7c2.4-2.1 6-2.1 8.4 0" />
        <path d="M6.8 9.8c.7-.6 1.7-.6 2.4 0" />
      </svg>
      <svg className="cellular-icon" viewBox="0 0 18 12" aria-hidden>
        <rect x="1" y="8" width="2.5" height="3" rx="0.8" />
        <rect x="5.4" y="6" width="2.5" height="5" rx="0.8" />
        <rect x="9.8" y="3.5" width="2.5" height="7.5" rx="0.8" />
        <rect x="14.2" y="1" width="2.5" height="10" rx="0.8" />
      </svg>
      <span className="samsung-battery" aria-hidden>
        92
      </span>
    </span>
  );
}

function BackChevron() {
  return (
    <svg className="back-chevron" viewBox="0 0 12 20" aria-hidden>
      <path d="m9 2-7 8 7 8" />
    </svg>
  );
}

function DeviceViewport({ mode, enabled, children }: { mode: "iphone" | "android"; enabled: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(true);
  const [available, setAvailable] = useState({ width: 456, height: 972 });
  const width = mode === "iphone" ? 456 : 424;
  const height = mode === "iphone" ? 972 : 904;
  useLayoutEffect(() => {
    const area = ref.current;
    if (!enabled || !area) return;
    const observer = new ResizeObserver(() => setAvailable({ width: area.clientWidth - 24, height: area.clientHeight - 24 }));
    observer.observe(area);
    return () => observer.disconnect();
  }, [enabled]);
  if (!enabled) return children;
  const scale = fit ? Math.max(0.1, Math.min(1, available.width / width, available.height / height)) : 1;
  return <div className="device-viewport">
    <div className="device-scale-controls"><span>{mode === "iphone" ? "440 × 956" : "412 × 892"} · {Math.round(scale * 100)}%</span><div><button aria-pressed={fit} onClick={() => setFit(true)}>适应窗口</button><button aria-pressed={!fit} onClick={() => setFit(false)}>100%</button></div></div>
    <div className="device-fit-area" ref={ref}><div className="device-scaled-bounds" style={{ width: width * scale, height: height * scale }}><div className="device-transform" style={{ width, height, transform: `scale(${scale})` }}>{children}</div></div></div>
  </div>;
}

export function WechatPreview({
  document,
  html,
  markdown,
  sourceMap,
  directEditDisabled,
  onMarkdownChange,
  templateId,
  onTemplateChange,
  templateControl,
  fixedDevice = false,
  contentSync,
  activeBlock,
  onContentAnchorChange,
  onActiveBlockChange,
}: {
  document: ArticleDocument;
  html: string;
  markdown: string;
  sourceMap: ArticleSourceRange[];
  directEditDisabled: boolean;
  onMarkdownChange: (markdown: string) => void;
  templateId: string;
  onTemplateChange: (templateId: string) => void;
  templateControl?: ReactNode;
  fixedDevice?: boolean;
  contentSync: ContentSyncEvent | null;
  activeBlock: {
    blockIndex: number;
    origin: "editor" | "preview";
  } | null;
  onContentAnchorChange: (anchor: ContentAnchor) => void;
  onActiveBlockChange: (blockIndex: number | null) => void;
}) {
  const [previewMode, setPreviewMode] =
    useState<PreviewMode>("iphone");
  const articleRef = useRef<HTMLElement>(null);
  const applyingScrollRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);
  const hoveredBlockRef = useRef<number | null>(null);
  const appliedContentSyncSignatureRef = useRef<string | null>(null);
  const autoScrolledEditorBlockRef = useRef<number | null>(null);
  const editOriginalRef = useRef(new WeakMap<HTMLElement, string>());
  const cancelledEditRef = useRef(new WeakSet<HTMLElement>());
  const pendingScrollTopRef = useRef<number | null>(null);
  const pendingEditTargetRef = useRef<PendingEditTarget | null>(null);
  const [editStatus, setEditStatus] = useState<"idle" | "editing" | "saved">(
    "idle",
  );
  const activePreview = previewModes.find(
    (mode) => mode.id === previewMode,
  )!;

  const makeEditable = (
    element: HTMLElement | null,
    kind: string,
    blockIndex: number,
    position = "root",
  ) => {
    if (!element) return;
    element.dataset.wedraftEditKind = kind;
    element.dataset.wedraftEditBlockIndex = String(blockIndex);
    element.dataset.wedraftEditPosition = position;
    element.setAttribute("contenteditable", "true");
    element.setAttribute("spellcheck", "true");
    element.setAttribute("role", "textbox");
    element.setAttribute("aria-label", "直接微调预览文字");
  };

  useLayoutEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    article
      .querySelectorAll<HTMLElement>("[data-wedraft-edit-kind]")
      .forEach((element) => {
        element.removeAttribute("contenteditable");
        element.removeAttribute("data-wedraft-edit-kind");
        element.removeAttribute("data-wedraft-edit-block-index");
        element.removeAttribute("data-wedraft-edit-position");
      });
    if (directEditDisabled) return;

    makeEditable(
      article.querySelector<HTMLElement>(
        ':scope > h1[data-wedraft-block-index="-1"]',
      ),
      "title",
      -1,
    );
    document.blocks.forEach((block, blockIndex) => {
      if (!sourceRangeIsUnique(sourceMap, blockIndex)) return;
      const root = article.querySelector<HTMLElement>(
        `[data-wedraft-block-index="${blockIndex}"]`,
      );
      if (!root) return;
      if (block.type === "paragraph") {
        makeEditable(root, "paragraph", blockIndex);
      } else if (block.type === "heading") {
        const heading = root.matches("h2, h3")
          ? root
          : root.querySelector<HTMLElement>("h2, h3");
        const hasGeneratedHeadingLabel =
          block.level === 2 &&
          heading?.children.length === 2 &&
          Array.from(heading.children).every(
            (element) => element.tagName === "SPAN",
          );
        if (hasGeneratedHeadingLabel && heading) {
          const title = heading.lastElementChild as HTMLElement | null;
          Array.from(heading.children)
            .slice(0, -1)
            .forEach((element) => {
              (element as HTMLElement).dataset.wedraftDecoration = "true";
              element.setAttribute("contenteditable", "false");
            });
          makeEditable(title, "heading", blockIndex);
        } else {
          makeEditable(heading, "heading", blockIndex);
        }
      } else if (block.type === "quote") {
        const decoration = root.querySelector<HTMLElement>(":scope > span");
        if (decoration) {
          decoration.dataset.wedraftDecoration = "true";
          decoration.setAttribute("contenteditable", "false");
        }
        makeEditable(root, "quote", blockIndex);
      } else if (block.type === "list") {
        root.querySelectorAll<HTMLElement>("li").forEach((item, index) =>
          makeEditable(item, "list-item", blockIndex, String(index)),
        );
      } else if (block.type === "table") {
        root.querySelectorAll<HTMLElement>("th, td").forEach((cell, index) =>
          makeEditable(cell, "table-cell", blockIndex, String(index)),
        );
      } else if (block.type === "references") {
        const referenceSection = root.querySelector<HTMLElement>(
          ":scope > section",
        );
        Array.from(referenceSection?.querySelectorAll<HTMLElement>("p") ?? [])
          .slice(1)
          .forEach((item, index) => {
            const number = item.querySelector<HTMLElement>(":scope > span");
            if (number) {
              number.dataset.wedraftDecoration = "true";
              number.setAttribute("contenteditable", "false");
            }
            makeEditable(
              item,
              "reference-item",
              blockIndex,
              String(index),
            );
          });
      }
    });
  }, [directEditDisabled, document.blocks, document.title, html, sourceMap, previewMode]);

  useLayoutEffect(() => {
    const article = articleRef.current;
    const pendingTop = pendingScrollTopRef.current;
    if (!article) return;
    if (pendingTop !== null) {
      suppressProgrammaticScroll();
      article.scrollTop = pendingTop;
      pendingScrollTopRef.current = null;
    }
    const pendingTarget = pendingEditTargetRef.current;
    if (!pendingTarget) return;
    const nextRange = sourceMap.find(
      (range) => range.startLine === pendingTarget.sourceLine,
    );
    const nextBlockIndex = nextRange?.blockIndex ?? pendingTarget.blockIndex;
    const selector =
      `[data-wedraft-edit-block-index="${nextBlockIndex}"]` +
      `[data-wedraft-edit-kind="${pendingTarget.kind}"]` +
      `[data-wedraft-edit-position="${pendingTarget.position}"]`;
    pendingEditTargetRef.current = null;
    requestAnimationFrame(() => {
      const target = article.querySelector<HTMLElement>(selector);
      if (!target) return;
      const top = article.scrollTop;
      focusEditableAtOffset(target, pendingTarget.caretOffset);
      article.scrollTop = top;
    });
  }, [document.title, html, markdown, sourceMap]);

  useEffect(() => {
    if (editStatus !== "saved") return;
    const timer = window.setTimeout(() => setEditStatus("idle"), 1500);
    return () => window.clearTimeout(timer);
  }, [editStatus]);

  const readPreviewBoxes = (): ContentBox[] => {
    const article = articleRef.current;
    if (!article) return [];
    const containerRect = article.getBoundingClientRect();
    const scale = containerRect.width / article.offsetWidth || 1;
    return Array.from(
      article.querySelectorAll<HTMLElement>(
        "[data-wedraft-block-index]",
      ),
    ).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        blockIndex: Number(
          element.dataset.wedraftBlockIndex ?? "-1",
        ),
        top: (rect.top - containerRect.top) / scale + article.scrollTop,
        height: Math.max(1, rect.height / scale),
      };
    });
  };

  const suppressProgrammaticScroll = () => {
    applyingScrollRef.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        applyingScrollRef.current = false;
      });
    });
  };

  const updatePreviewHighlight = () => {
    const article = articleRef.current;
    if (!article) return;
    article
      .querySelectorAll(".preview-content-highlight")
      .forEach((element) =>
        element.classList.remove("preview-content-highlight"),
      );
    if (!activeBlock) return;
    article
      .querySelectorAll<HTMLElement>(
        `[data-wedraft-block-index="${activeBlock.blockIndex}"]`,
      )
      .forEach((element) =>
        element.classList.add("preview-content-highlight"),
      );
  };

  useLayoutEffect(() => {
    const article = articleRef.current;
    if (!contentSync) {
      appliedContentSyncSignatureRef.current = null;
      return;
    }
    const signature = `${contentSync.revision}:${previewMode}`;
    if (
      !article ||
      contentSync.origin !== "editor" ||
      appliedContentSyncSignatureRef.current === signature
    ) {
      return;
    }
    const nextTop = scrollTopForContentAnchor(
      contentSync.anchor,
      article.clientHeight,
      readPreviewBoxes(),
    );
    if (nextTop === null) return;
    appliedContentSyncSignatureRef.current = signature;
    suppressProgrammaticScroll();
    article.scrollTop = Math.min(
      Math.max(0, article.scrollHeight - article.clientHeight),
      nextTop,
    );
  }, [contentSync?.revision, document.title, html, previewMode]);

  useLayoutEffect(() => {
    const article = articleRef.current;
    updatePreviewHighlight();
    if (!article || !activeBlock || activeBlock.origin !== "editor") {
      autoScrolledEditorBlockRef.current = null;
      return;
    }
    if (autoScrolledEditorBlockRef.current === activeBlock.blockIndex) return;
    autoScrolledEditorBlockRef.current = activeBlock.blockIndex;
    const box = readPreviewBoxes().find(
      (candidate) => candidate.blockIndex === activeBlock.blockIndex,
    );
    if (!box) return;
    const visibleTop = article.scrollTop + 12;
    const visibleBottom =
      article.scrollTop + article.clientHeight - 12;
    if (
      box.top < visibleTop ||
      box.top + box.height > visibleBottom
    ) {
      suppressProgrammaticScroll();
      article.scrollTop = Math.max(0, box.top - 24);
    }
  }, [activeBlock, document.title, html, previewMode]);

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    },
    [],
  );

  const onPreviewScroll = () => {
    if (applyingScrollRef.current || scrollFrameRef.current !== null) {
      return;
    }
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const article = articleRef.current;
      if (!article || applyingScrollRef.current) return;
      const anchor = contentAnchorFromScroll(
        article.scrollTop,
        article.clientHeight,
        readPreviewBoxes(),
      );
      if (anchor) onContentAnchorChange(anchor);
    });
  };

  const onPreviewMouseMove = (event: MouseEvent<HTMLElement>) => {
    const target = (event.target as Element).closest<HTMLElement>(
      "[data-wedraft-block-index]",
    );
    const blockIndex = target
      ? Number(target.dataset.wedraftBlockIndex)
      : null;
    if (blockIndex === hoveredBlockRef.current) return;
    hoveredBlockRef.current = blockIndex;
    onActiveBlockChange(blockIndex);
  };

  const onPreviewClick = (event: MouseEvent<HTMLElement>) => {
    if (
      (event.target as Element).closest("a") &&
      (event.target as Element).closest("[data-wedraft-edit-kind]")
    ) {
      event.preventDefault();
    }
  };

  const onPreviewMouseDown = (event: MouseEvent<HTMLElement>) => {
    const target = (event.target as Element).closest<HTMLElement>(
      "[data-wedraft-edit-kind]",
    );
    if (!target) {
      pendingEditTargetRef.current = null;
      return;
    }
    const blockIndex = Number(target.dataset.wedraftEditBlockIndex);
    const range = sourceMap.find((item) => item.blockIndex === blockIndex);
    if (!Number.isFinite(blockIndex) || !range) return;
    pendingEditTargetRef.current = {
      blockIndex,
      kind: target.dataset.wedraftEditKind ?? "",
      position: target.dataset.wedraftEditPosition ?? "root",
      sourceLine: range.startLine,
      caretOffset: caretOffsetFromPoint(target, event.clientX, event.clientY),
    };
    const activeTarget = window.document.activeElement?.closest<HTMLElement>(
      "[data-wedraft-edit-kind]",
    );
    if (activeTarget && activeTarget !== target) {
      // The browser normally scrolls a newly focused contenteditable into view.
      // Commit the current block ourselves, then restore focus with
      // preventScroll after React has rendered the updated Markdown.
      event.preventDefault();
      activeTarget.blur();
    }
  };

  const onPreviewFocus = (event: FocusEvent<HTMLElement>) => {
    const target = (event.target as Element).closest<HTMLElement>(
      "[data-wedraft-edit-kind]",
    );
    if (!target) return;
    editOriginalRef.current.set(target, target.innerHTML);
    target.classList.add("preview-direct-editing");
    setEditStatus("editing");
    const blockIndex = Number(target.dataset.wedraftEditBlockIndex);
    if (Number.isFinite(blockIndex)) onActiveBlockChange(blockIndex);
  };

  const onPreviewBlur = (event: FocusEvent<HTMLElement>) => {
    const target = (event.target as Element).closest<HTMLElement>(
      "[data-wedraft-edit-kind]",
    );
    if (!target) return;
    target.classList.remove("preview-direct-editing");
    if (cancelledEditRef.current.has(target)) {
      cancelledEditRef.current.delete(target);
      setEditStatus("idle");
      return;
    }
    const original = editOriginalRef.current.get(target);
    if (original === target.innerHTML) {
      pendingEditTargetRef.current = null;
      setEditStatus("idle");
      return;
    }
    const blockIndex = Number(target.dataset.wedraftEditBlockIndex);
    let replacement: string | null = null;
    if (blockIndex === -1) {
      replacement = serializeEditableInline(target);
    } else {
      const block = document.blocks[blockIndex];
      const root = target.closest<HTMLElement>(
        `[data-wedraft-block-index="${blockIndex}"]`,
      );
      if (block && root) replacement = markdownForPreviewEdit(block, target, root);
    }
    if (replacement === null) {
      pendingEditTargetRef.current = null;
      target.innerHTML = original ?? target.innerHTML;
      setEditStatus("idle");
      return;
    }
    const nextMarkdown = replaceMarkdownSourceRange(
      markdown,
      sourceMap,
      blockIndex,
      replacement,
    );
    if (nextMarkdown === markdown) {
      pendingEditTargetRef.current = null;
      setEditStatus("idle");
      return;
    }
    const currentRange = sourceMap.find(
      (item) => item.blockIndex === blockIndex,
    );
    const pendingTarget = pendingEditTargetRef.current;
    if (
      currentRange &&
      pendingTarget &&
      pendingTarget.blockIndex !== blockIndex &&
      pendingTarget.sourceLine > currentRange.endLine
    ) {
      pendingTarget.sourceLine +=
        replacement.split("\n").length -
        (currentRange.endLine - currentRange.startLine + 1);
    } else if (pendingTarget?.blockIndex === blockIndex) {
      pendingEditTargetRef.current = null;
    }
    pendingScrollTopRef.current = articleRef.current?.scrollTop ?? null;
    onMarkdownChange(nextMarkdown);
    setEditStatus("saved");
  };

  const onPreviewKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = (event.target as Element).closest<HTMLElement>(
      "[data-wedraft-edit-kind]",
    );
    if (!target) return;
    if (event.key === "Escape") {
      event.preventDefault();
      const original = editOriginalRef.current.get(target);
      if (original !== undefined) target.innerHTML = original;
      cancelledEditRef.current.add(target);
      target.blur();
    } else if (event.key === "Enter") {
      event.preventDefault();
      target.blur();
    }
  };

  const onPreviewPaste = (event: ClipboardEvent<HTMLElement>) => {
    const target = (event.target as Element).closest(
      "[data-wedraft-edit-kind]",
    );
    if (!target) return;
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain").replace(/\s*\n+\s*/g, " ");
    window.document.execCommand("insertText", false, text);
  };

  const article = (
    <article
      ref={articleRef}
      className="wechat-article"
      aria-label={`${fixedDevice ? activePreview.label : activePreview.description}文章滚动预览`}
      tabIndex={0}
      onScroll={onPreviewScroll}
      onMouseDownCapture={onPreviewMouseDown}
      onMouseMove={onPreviewMouseMove}
      onClickCapture={onPreviewClick}
      onFocusCapture={onPreviewFocus}
      onBlurCapture={onPreviewBlur}
      onKeyDownCapture={onPreviewKeyDown}
      onPasteCapture={onPreviewPaste}
      onMouseLeave={() => {
        hoveredBlockRef.current = null;
        onActiveBlockChange(null);
      }}
    >
      <PreviewTitle title={document.title} />
      <div className="wechat-meta">
        <span>{document.author || "作者"}</span>
        <span>{new Date().toLocaleDateString("zh-CN")}</span>
      </div>
      {document.blocks.length ? (
        <PreviewBody html={html} />
      ) : (
        <div className="preview-empty">
          <Eye size={28} />
          <p>粘贴正文后，这里会实时显示微信排版效果。</p>
        </div>
      )}
    </article>
  );

  return (
    <section className="preview-column">
      <div className="column-header compact">
        <div>
          <span className="eyebrow">PREVIEW</span>
          <h2>微信效果预览</h2>
        </div>
        <div className="preview-device-control">
          <div
            className="device-switcher preview-switcher"
            aria-label="预览设备"
          >
            {previewModes.map((mode) => (
              <button
                type="button"
                className={mode.id === previewMode ? "active" : ""}
                aria-pressed={mode.id === previewMode}
                title={fixedDevice ? (mode.id === "iphone" ? "iPhone · 440 × 956" : mode.id === "android" ? "Android · 412 × 892" : mode.description) : mode.description}
                key={mode.id}
                onClick={() => setPreviewMode(mode.id)}
              >
                {mode.id === "web" ? (
                  <Monitor size={12} />
                ) : (
                  <Smartphone size={12} />
                )}
                {mode.label}
              </button>
            ))}
          </div>
          <span className="preview-mode">
            {fixedDevice ? (previewMode === "iphone" ? "iPhone · 440 × 956" : previewMode === "android" ? "Android · 412 × 892" : activePreview.description) : activePreview.description}
          </span>
          <span className={`preview-edit-status ${editStatus}`}>
            <Pencil size={11} />
            {directEditDisabled
              ? "示例仅预览"
              : editStatus === "editing"
                ? "正在微调"
                : editStatus === "saved"
                  ? "已写回 Markdown"
                  : "点击正文可微调"}
          </span>
        </div>
      </div>
      {templateControl ?? <div className="template-switcher" aria-label="排版模板">
        <span>模板</span>
        {availableTemplates.map((template) => (
          <button
            type="button"
            className={template.id === templateId ? "active" : ""}
            key={template.id}
            onClick={() => onTemplateChange(template.id)}
          >
            {template.id === templateId ? <Check size={12} /> : null}
            {template.name}
          </button>
        ))}
      </div>}
      {previewMode === "web" ? (
        <div className="web-shell">
          <div className="browser-chrome">
            <span className="browser-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <span className="browser-address">
              mp.weixin.qq.com · 公众号文章
            </span>
            <span className="browser-menu">•••</span>
          </div>
          {article}
        </div>
      ) : (
        <DeviceViewport mode={previewMode} enabled={fixedDevice}>
        <div className={`phone-shell ${previewMode}${fixedDevice ? " fixed-device" : ""}`} data-screen-width={previewMode === "iphone" ? 440 : 412} data-screen-height={previewMode === "iphone" ? 956 : 892}>
          <div className="phone-status">
            <span className="status-time">
              {previewMode === "iphone" ? "9:41" : "12:45"}
            </span>
            {previewMode === "iphone" ? (
              <span className="dynamic-island" />
            ) : (
              <span className="camera-hole" />
            )}
            {previewMode === "iphone" ? (
              <IosStatusIcons />
            ) : (
              <SamsungStatusIcons />
            )}
          </div>
          <div className="wechat-bar">
            <span className="wechat-back">
              {fixedDevice && previewMode === "android" ? <svg className="back-chevron android-back" viewBox="0 0 24 24" aria-hidden><path d="M20 12H4m7-7-7 7 7 7" /></svg> : <BackChevron />}
            </span>
            <strong>公众号文章</strong>
            <span className="wechat-actions">
              <i />
              <i />
              <i />
            </span>
          </div>
          {article}
          {fixedDevice && <div className="device-bottom-safe-area" aria-hidden />}
          <span
            className={`gesture-indicator ${previewMode}`}
            aria-hidden
          />
        </div>
        </DeviceViewport>
      )}
    </section>
  );
}
