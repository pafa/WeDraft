import {
  Bold,
  BookOpenText,
  Check,
  ClipboardCopy,
  Code2,
  FileCode2,
  Heading2,
  Heading3,
  ImagePlus,
  Info,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Sparkles,
  Table2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import {
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  htmlToMarkdown,
  type ArticleSourceRange,
} from "@wedraft/article-parser";

import { MARKDOWN_RULES_PROMPT } from "../markdown-rules.js";
import { buildBodyImageMarkdown } from "../services/image-markdown.js";
import {
  applyMarkdownShortcut,
  isMarkdownShortcutActive,
  type MarkdownShortcut,
} from "../services/markdown-shortcuts.js";
import {
  blockIndexAtSourceLine,
  contentAnchorFromScroll,
  scrollTopForContentAnchor,
  type ContentBox,
  type ContentAnchor,
  type ContentSyncEvent,
} from "../services/scroll-sync.js";
import { useEditorStore } from "../stores/editor-store.js";

const markdownShortcuts: Array<{
  id: MarkdownShortcut;
  label: string;
  title: string;
  icon: LucideIcon;
  groupStart?: boolean;
  keyShortcut?: string;
}> = [
  {
    id: "heading1",
    label: "一级标题",
    title: "切换当前行一级标题（⌘⌥1）",
    icon: Heading2,
    keyShortcut: "Meta+Alt+1",
  },
  {
    id: "heading2",
    label: "二级标题",
    title: "切换当前行二级标题（⌘⌥2）",
    icon: Heading3,
    keyShortcut: "Meta+Alt+2",
  },
  {
    id: "bold",
    label: "粗体",
    title: "切换粗体（⌘B）",
    icon: Bold,
    groupStart: true,
    keyShortcut: "Meta+B",
  },
  {
    id: "inline-code",
    label: "行内代码",
    title: "切换行内代码（⌘E）",
    icon: Code2,
    keyShortcut: "Meta+E",
  },
  {
    id: "quote",
    label: "引用",
    title: "切换当前行引用（⌘⇧.）",
    icon: Quote,
    groupStart: true,
    keyShortcut: "Meta+Shift+.",
  },
  {
    id: "unordered-list",
    label: "无序列表",
    title: "切换无序列表（⌘⇧8）",
    icon: List,
    keyShortcut: "Meta+Shift+8",
  },
  {
    id: "ordered-list",
    label: "有序列表",
    title: "切换有序列表（⌘⇧7）",
    icon: ListOrdered,
    keyShortcut: "Meta+Shift+7",
  },
  {
    id: "table",
    label: "表格",
    title: "插入 Markdown 表格；选中制表符分隔的数据可直接转换",
    icon: Table2,
    groupStart: true,
  },
  {
    id: "code-block",
    label: "代码块",
    title: "切换代码块（⌘⌥C）",
    icon: FileCode2,
    keyShortcut: "Meta+Alt+C",
  },
  {
    id: "divider",
    label: "分隔线",
    title: "插入或移除分隔线",
    icon: Minus,
  },
  {
    id: "image",
    label: "添加正文图片",
    title: "选择本机图片并插入正文",
    icon: ImagePlus,
  },
  {
    id: "note",
    label: "说明",
    title: "切换当前行说明",
    icon: Info,
  },
  {
    id: "references",
    label: "参考来源",
    title: "追加参考来源；已存在时跳转到该区块",
    icon: BookOpenText,
  },
];

const toggleShortcuts = new Set<MarkdownShortcut>([
  "heading1",
  "heading2",
  "bold",
  "inline-code",
  "quote",
  "unordered-list",
  "ordered-list",
  "code-block",
  "divider",
  "note",
  "references",
]);

function formatImageBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
}

export function ArticleEditor({
  demoActive,
  demoMarkdown,
  characterCount,
  onDismissDemo,
  sourceMap,
  contentSync,
  activeBlock,
  onContentAnchorChange,
  onActiveBlockChange,
  onImagePreviewReady,
  prepareImage,
  compactHeader = false,
  copyPlainText = (text: string) => navigator.clipboard.writeText(text),
  persistenceHint = "复制后进入文章历史",
  imageProcessingHint = "JPG / PNG / WEBP 会在本机自动检测并优化；GIF 保留动画。",
}: {
  demoActive: boolean;
  demoMarkdown: string;
  characterCount: number;
  onDismissDemo: () => void;
  sourceMap: ArticleSourceRange[];
  contentSync: ContentSyncEvent | null;
  activeBlock: {
    blockIndex: number;
    origin: "editor" | "preview";
  } | null;
  onContentAnchorChange: (anchor: ContentAnchor) => void;
  onActiveBlockChange: (blockIndex: number | null) => void;
  onImagePreviewReady: (localPath: string, dataUrl: string) => void;
  prepareImage: (file: File) => Promise<{ url: string; dataUrl: string; notice: string; warning?: boolean }>;
  copyPlainText?: (text: string) => Promise<void>;
  compactHeader?: boolean;
  persistenceHint?: string;
  imageProcessingHint?: string;
}) {
  const {
    markdown,
    setMarkdown,
    undoMarkdown,
    redoMarkdown,
    undoStack,
    redoStack,
  } = useEditorStore();
  const editorShellRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shortcutBarRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const applyingScrollRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);
  const appliedContentSyncRevisionRef = useRef<number | null>(null);
  const autoScrolledPreviewBlockRef = useRef<number | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  useLayoutEffect(() => {
    if (!compactHeader) return;
    const bar = shortcutBarRef.current;
    if (!bar) return;
    let previousWidth = -1;
    const fit = () => {
      const width = bar.clientWidth;
      if (!width) return;
      previousWidth = width;
      // Measure expanded labels synchronously, then settle before painting.
      bar.dataset.iconOnly = "false";
      const style = getComputedStyle(bar);
      const buttons = [...bar.querySelectorAll<HTMLButtonElement>("button")];
      const required = buttons.reduce((sum, button) => sum + button.getBoundingClientRect().width, 0)
        + Math.max(0, buttons.length - 1) * parseFloat(style.columnGap);
      const available = width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      bar.dataset.iconOnly = String(required > available);
    };
    fit();
    const observer = new ResizeObserver(() => {
      if (bar.clientWidth !== previousWidth) fit();
    });
    observer.observe(bar);
    let disposed = false;
    void document.fonts.ready.then(() => { if (!disposed) fit(); });
    return () => { disposed = true; observer.disconnect(); };
  }, [compactHeader, imageBusy]);
  const [imageError, setImageError] = useState("");
  const [imageNotice, setImageNotice] = useState<{
    message: string;
    warning: boolean;
  } | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imageSource, setImageSource] = useState("");
  const [rulesCopied, setRulesCopied] = useState(false);
  const [rulesError, setRulesError] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [highlightGeometry, setHighlightGeometry] = useState<{
    top: number;
    height: number;
  } | null>(null);
  const [minimapViewport, setMinimapViewport] = useState({
    top: 0,
    height: 100,
  });
  const visibleMarkdown = demoActive ? demoMarkdown : markdown;
  const visibleLines = visibleMarkdown.split("\n");

  const minimapKind = (line: string, blockIndex: number): string => {
    if (blockIndex === -1) return "title";
    if (/^##\s+/.test(line)) return "heading1";
    if (/^###\s+/.test(line)) return "heading2";
    if (/^>\s+/.test(line)) return "quote";
    if (/^!\[/.test(line)) return "image";
    if (/^\s*(?:[-+*]|\d+[.)])\s+/.test(line)) return "list";
    if (/^\s*\|/.test(line)) return "table";
    if (/^```/.test(line)) return "code";
    return "paragraph";
  };

  useEffect(() => {
    if (!rulesCopied) return;
    const timer = window.setTimeout(() => setRulesCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [rulesCopied]);

  const readEditorBoxes = (): ContentBox[] => {
    const measure = measureRef.current;
    if (!measure) return [];
    return sourceMap.flatMap((range) => {
      const start = measure.querySelector<HTMLElement>(
        `[data-source-line="${range.startLine}"]`,
      );
      const end = measure.querySelector<HTMLElement>(
        `[data-source-line="${range.endLine}"]`,
      );
      if (!start || !end) return [];
      return [{
        blockIndex: range.blockIndex,
        top: start.offsetTop,
        height: Math.max(
          1,
          end.offsetTop + end.offsetHeight - start.offsetTop,
        ),
      }];
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

  const updateHighlightGeometry = () => {
    const textarea = textareaRef.current;
    if (!textarea || !activeBlock) {
      setHighlightGeometry(null);
      return;
    }
    const box = readEditorBoxes().find(
      (candidate) => candidate.blockIndex === activeBlock.blockIndex,
    );
    if (!box) {
      setHighlightGeometry(null);
      return;
    }
    setHighlightGeometry({
      top: box.top - textarea.scrollTop,
      height: box.height,
    });
  };

  const updateMinimapViewport = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const fullHeight = Math.max(textarea.clientHeight, textarea.scrollHeight);
    setMinimapViewport({
      top: (textarea.scrollTop / fullHeight) * 100,
      height: Math.min(100, (textarea.clientHeight / fullHeight) * 100),
    });
  };

  const jumpToSourceLine = (line: number) => {
    const textarea = textareaRef.current;
    const measure = measureRef.current;
    if (!textarea || !measure) return;
    const safeLine = Math.min(Math.max(1, line), visibleLines.length);
    const offset = visibleLines
      .slice(0, safeLine - 1)
      .reduce((total, value) => total + value.length + 1, 0);
    const lineElement = measure.querySelector<HTMLElement>(
      `[data-source-line="${safeLine}"]`,
    );
    suppressProgrammaticScroll();
    textarea.scrollTop = Math.max(
      0,
      (lineElement?.offsetTop ?? 0) - textarea.clientHeight * 0.22,
    );
    textarea.focus();
    textarea.setSelectionRange(offset, offset);
    setSelection({ start: offset, end: offset });
    updateMinimapViewport();
    updateHighlightGeometry();
  };

  useLayoutEffect(() => {
    updateMinimapViewport();
  }, [visibleMarkdown]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!contentSync) {
      appliedContentSyncRevisionRef.current = null;
      return;
    }
    if (
      !textarea ||
      contentSync.origin !== "preview" ||
      appliedContentSyncRevisionRef.current === contentSync.revision
    ) {
      return;
    }
    const nextTop = scrollTopForContentAnchor(
      contentSync.anchor,
      textarea.clientHeight,
      readEditorBoxes(),
      textarea.scrollHeight,
    );
    if (nextTop === null) return;
    appliedContentSyncRevisionRef.current = contentSync.revision;
    suppressProgrammaticScroll();
    textarea.scrollTop = Math.min(
      Math.max(0, textarea.scrollHeight - textarea.clientHeight),
      nextTop,
    );
    updateHighlightGeometry();
  }, [contentSync?.revision, visibleMarkdown, sourceMap]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !activeBlock) {
      autoScrolledPreviewBlockRef.current = null;
      setHighlightGeometry(null);
      return;
    }
    const box = readEditorBoxes().find(
      (candidate) => candidate.blockIndex === activeBlock.blockIndex,
    );
    if (!box) return;
    if (
      activeBlock.origin === "preview" &&
      autoScrolledPreviewBlockRef.current !== activeBlock.blockIndex
    ) {
      autoScrolledPreviewBlockRef.current = activeBlock.blockIndex;
      const visibleTop = textarea.scrollTop + 12;
      const visibleBottom =
        textarea.scrollTop + textarea.clientHeight - 12;
      const boxBottom = box.top + box.height;
      if (box.top < visibleTop || boxBottom > visibleBottom) {
        suppressProgrammaticScroll();
        textarea.scrollTop = Math.max(0, box.top - 22);
      }
    } else if (activeBlock.origin !== "preview") {
      autoScrolledPreviewBlockRef.current = null;
    }
    updateHighlightGeometry();
  }, [activeBlock, visibleMarkdown, sourceMap]);

  const publishEditorSelection = (start: number) => {
    const line =
      markdown.slice(0, start).split("\n").length;
    onActiveBlockChange(blockIndexAtSourceLine(line, sourceMap));
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (
      demoActive ||
      !textarea ||
      window.document.activeElement !== textarea
    ) {
      return;
    }
    publishEditorSelection(selection.start);
  }, [demoActive, markdown, selection, sourceMap]);

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    },
    [],
  );

  const onEditorScroll = () => {
    updateHighlightGeometry();
    updateMinimapViewport();
    if (applyingScrollRef.current || scrollFrameRef.current !== null) {
      return;
    }
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const textarea = textareaRef.current;
      if (!textarea || applyingScrollRef.current) return;
      const anchor = contentAnchorFromScroll(
        textarea.scrollTop,
        textarea.clientHeight,
        readEditorBoxes(),
        textarea.scrollHeight,
      );
      if (anchor) onContentAnchorChange(anchor);
    });
  };

  const insertAtCursor = (value: string) => {
    const textarea = textareaRef.current;
    const currentMarkdown = useEditorStore.getState().markdown;
    const start = textarea?.selectionStart ?? currentMarkdown.length;
    const end = textarea?.selectionEnd ?? currentMarkdown.length;
    setMarkdown(
      `${currentMarkdown.slice(0, start)}${value}${currentMarkdown.slice(end)}`,
      "checkpoint",
    );
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + value.length, start + value.length);
      setSelection({
        start: start + value.length,
        end: start + value.length,
      });
    });
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const html = event.clipboardData.getData("text/html");
    if (!html) return;
    event.preventDefault();
    insertAtCursor(htmlToMarkdown(html));
  };

  const chooseBodyImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImageError("");
    setImageNotice(null);
    setImageSource("");
    setPendingImage(file);
  };

  const addBodyImage = async (source: string) => {
    const file = pendingImage;
    if (!file || imageBusy) return;
    const articleId = useEditorStore.getState().articleId;
    setImageBusy(true);
    setImageError("");
    try {
      const image = await prepareImage(file);
      if (!textareaRef.current || useEditorStore.getState().articleId !== articleId) {
        setPendingImage(null);
        return;
      }
      onImagePreviewReady(image.url, image.dataUrl);
      insertAtCursor(buildBodyImageMarkdown(file.name, image.url, source));
      setImageNotice({ message: image.notice, warning: image.warning ?? false });
      setPendingImage(null);
      setImageSource("");
    } catch (caught) {
      setImageError(
        caught instanceof Error ? caught.message : "正文图片处理失败。",
      );
    } finally {
      setImageBusy(false);
    }
  };

  const copyMarkdownRules = async () => {
    setRulesError("");
    try {
      await copyPlainText(MARKDOWN_RULES_PROMPT);
      setRulesCopied(true);
    } catch (caught) {
      setRulesError(
        caught instanceof Error ? caught.message : "Markdown 规则复制失败。",
      );
    }
  };

  const useMarkdownShortcut = (shortcut: MarkdownShortcut) => {
    const textarea = textareaRef.current;
    if (!textarea || demoActive) return;
    const result = applyMarkdownShortcut(
      markdown,
      textarea.selectionStart,
      textarea.selectionEnd,
      shortcut,
    );
    setMarkdown(result.markdown, "checkpoint");
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(
        result.selectionStart,
        result.selectionEnd,
      );
      setSelection({
        start: result.selectionStart,
        end: result.selectionEnd,
      });
    });
  };

  const useHistoryAction = (action: "undo" | "redo") => {
    if (demoActive) return;
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? selection.start;
    if (action === "undo") undoMarkdown();
    else redoMarkdown();
    requestAnimationFrame(() => {
      const nextLength = useEditorStore.getState().markdown.length;
      const nextCaret = Math.min(caret, nextLength);
      textarea?.focus();
      textarea?.setSelectionRange(nextCaret, nextCaret);
      setSelection({ start: nextCaret, end: nextCaret });
    });
  };

  const onEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!event.metaKey) return;
    if (!event.altKey && event.code === "KeyZ") {
      event.preventDefault();
      useHistoryAction(event.shiftKey ? "redo" : "undo");
      return;
    }
    if (!event.altKey && !event.shiftKey && event.code === "KeyY") {
      event.preventDefault();
      useHistoryAction("redo");
      return;
    }
    let shortcut: MarkdownShortcut | null = null;
    if (!event.altKey && !event.shiftKey && event.code === "KeyB") {
      shortcut = "bold";
    } else if (
      !event.altKey &&
      !event.shiftKey &&
      event.code === "KeyE"
    ) {
      shortcut = "inline-code";
    } else if (event.altKey && !event.shiftKey && event.code === "Digit1") {
      shortcut = "heading1";
    } else if (event.altKey && !event.shiftKey && event.code === "Digit2") {
      shortcut = "heading2";
    } else if (event.shiftKey && !event.altKey && event.code === "Digit7") {
      shortcut = "ordered-list";
    } else if (event.shiftKey && !event.altKey && event.code === "Digit8") {
      shortcut = "unordered-list";
    } else if (event.shiftKey && !event.altKey && event.code === "Period") {
      shortcut = "quote";
    } else if (
      event.altKey &&
      !event.shiftKey &&
      event.code === "KeyC"
    ) {
      shortcut = "code-block";
    }
    if (!shortcut) return;
    event.preventDefault();
    useMarkdownShortcut(shortcut);
  };

  return (
    <section className="editor-column">
      <div className="column-header">
        <div>
          <span className="eyebrow">PASTE & FORMAT</span>
          <h2>{compactHeader ? "编辑原稿" : "粘贴文章"}</h2>
        </div>
        {compactHeader ? <button type="button" className={`text-button${rulesCopied ? " success" : ""}`} onClick={() => void copyMarkdownRules()}><ClipboardCopy size={14} />{rulesCopied ? "规则已复制" : "复制 Markdown 规则"}</button> : <span className="autosave-label">{persistenceHint}</span>}
      </div>
      <div className="editor-toolbar" hidden={compactHeader}>
        <span>
          <Sparkles size={14} />
          {demoActive
            ? "完整排版示例 · 点击编辑区后开始输入"
            : "粘贴后自动识别并排版"}
        </span>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          hidden
          onChange={chooseBodyImage}
        />
        <div className="editor-toolbar-actions">
          <button
            type="button"
            className={`text-button${rulesCopied ? " success" : ""}`}
            onClick={() => void copyMarkdownRules()}
          >
            {rulesCopied ? <Check size={14} /> : <ClipboardCopy size={14} />}
            {rulesCopied ? "Markdown规则已复制" : "复制Markdown规则"}
          </button>
        </div>
      </div>
      <div ref={shortcutBarRef} className="markdown-shortcut-bar" aria-label="Markdown 快捷格式">
        <div className="markdown-shortcut-list">
          {markdownShortcuts.map(
            ({
              id,
              label,
              title,
              icon: Icon,
              groupStart,
              keyShortcut,
            }) => {
              const active =
                !demoActive &&
                isMarkdownShortcutActive(
                  markdown,
                  selection.start,
                  selection.end,
                  id,
                );
              return (
                <div className="markdown-shortcut-item" key={id}>
                  {groupStart ? (
                    <span
                      className="markdown-shortcut-divider"
                      aria-hidden="true"
                    />
                  ) : null}
                  <button
                    type="button"
                    className={`markdown-shortcut-button${active ? " active" : ""}`}
                    title={title}
                    aria-label={id === "image" && imageBusy ? "处理中…" : label}
                    aria-pressed={
                      toggleShortcuts.has(id) ? active : undefined
                    }
                    aria-keyshortcuts={keyShortcut}
                    disabled={demoActive || (id === "image" && imageBusy)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      if (id !== "image") useMarkdownShortcut(id);
                    }}
                    onClick={(event) => {
                      if (id === "image") {
                        imageInputRef.current?.click();
                      } else if (event.detail === 0) {
                        useMarkdownShortcut(id);
                      }
                    }}
                  >
                    <Icon size={13} />
                    <span className="shortcut-label">{id === "image" && imageBusy ? "处理中…" : label}</span>
                  </button>
                </div>
              );
            },
          )}
        </div>
        <div className="markdown-history-actions" aria-label="编辑历史">
          <button
            type="button"
            className="markdown-shortcut-button markdown-history-button"
            title="撤回上一步（⌘Z）"
            aria-label="撤回上一步"
            aria-keyshortcuts="Meta+Z"
            disabled={demoActive || undoStack.length === 0}
            onMouseDown={(event) => {
              event.preventDefault();
              useHistoryAction("undo");
            }}
            onClick={(event) => {
              if (event.detail === 0) useHistoryAction("undo");
            }}
          >
            <Undo2 size={14} />
            <span className="shortcut-label">撤回</span>
          </button>
          <button
            type="button"
            className="markdown-shortcut-button markdown-history-button"
            title="重做下一步（⌘⇧Z）"
            aria-label="重做下一步"
            aria-keyshortcuts="Meta+Shift+Z"
            disabled={demoActive || redoStack.length === 0}
            onMouseDown={(event) => {
              event.preventDefault();
              useHistoryAction("redo");
            }}
            onClick={(event) => {
              if (event.detail === 0) useHistoryAction("redo");
            }}
          >
            <Redo2 size={14} />
            <span className="shortcut-label">重做</span>
          </button>
        </div>
        {!compactHeader && (<span
          className="article-character-count"
          aria-label={`文章总字数 ${characterCount.toLocaleString()} 字`}
        >
          总字数 {characterCount.toLocaleString()} 字
        </span>)}
      </div>
      <div className="markdown-editor-shell" ref={editorShellRef}>
        <div className="markdown-editor-measure" ref={measureRef} aria-hidden>
          {visibleLines.map((line, index) => (
            <div
              className="markdown-editor-measure-line"
              data-source-line={index + 1}
              key={`${index}-${line}`}
            >
              {line || "\u00a0"}
            </div>
          ))}
        </div>
        {highlightGeometry ? (
          <span
            className="editor-content-highlight"
            style={{
              top: highlightGeometry.top,
              height: highlightGeometry.height,
            }}
            aria-hidden
          />
        ) : null}
        <textarea
          ref={textareaRef}
          className={`markdown-editor${demoActive ? " demo-content" : ""}`}
          value={visibleMarkdown}
          placeholder={`第一行是文章标题\n从第二行开始粘贴正文，即刻完成排版…\n\n支持纯文本、Markdown、网页和 Word 富文本。`}
          spellCheck={false}
          onFocus={(event) => {
            if (demoActive) {
              onDismissDemo();
              return;
            }
            const nextSelection = {
              start: event.currentTarget.selectionStart,
              end: event.currentTarget.selectionEnd,
            };
            setSelection(nextSelection);
            publishEditorSelection(nextSelection.start);
          }}
          onPaste={onPaste}
          onKeyDown={onEditorKeyDown}
          onSelect={(event) =>
            setSelection({
              start: event.currentTarget.selectionStart,
              end: event.currentTarget.selectionEnd,
            })
          }
          onChange={(event) => setMarkdown(event.target.value, "typing")}
          onScroll={onEditorScroll}
        />
        <div
          className="markdown-minimap"
          aria-label="文章段落与章节快速导航"
          title="点击或拖动，快速定位文章位置"
          onMouseDown={(event) => {
            if ((event.target as Element).closest("button")) return;
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            const progress = Math.min(
              1,
              Math.max(0, (event.clientY - rect.top) / rect.height),
            );
            jumpToSourceLine(
              Math.round(progress * Math.max(0, visibleLines.length - 1)) + 1,
            );
          }}
        >
          <span
            className="markdown-minimap-viewport"
            style={{
              top: `${minimapViewport.top}%`,
              height: `${minimapViewport.height}%`,
            }}
            aria-hidden
          />
          {sourceMap.map((range) => {
            const line = visibleLines[range.startLine - 1] ?? "";
            const kind = minimapKind(line, range.blockIndex);
            const active = activeBlock?.blockIndex === range.blockIndex;
            const label = line
              .replace(/^#{2,3}\s+/, "")
              .replace(/^>\s+/, "")
              .trim()
              .slice(0, 28);
            return (
              <button
                type="button"
                className={`markdown-minimap-marker ${kind}${active ? " active" : ""}`}
                style={{
                  top: `${((range.startLine - 1) / Math.max(1, visibleLines.length)) * 100}%`,
                  height: `${kind.startsWith("heading") || kind === "title" ? 1.4 : 0.55}%`,
                }}
                title={`${range.startLine} 行 · ${label || "空行"}`}
                aria-label={`定位到第 ${range.startLine} 行${label ? `：${label}` : ""}`}
                key={`${range.blockIndex}-${range.startLine}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  jumpToSourceLine(range.startLine);
                }}
                onClick={(event) => {
                  if (event.detail === 0) jumpToSourceLine(range.startLine);
                }}
              />
            );
          })}
        </div>
      </div>
      <div className={`editor-footer${compactHeader ? " editor-status" : ""}`}>
        {demoActive ? <span>示例内容不会保存或复制</span> : null}
        {imageError || rulesError ? (
          <span className="field-error">{imageError || rulesError}</span>
        ) : null}
        {!imageError && !rulesError && imageNotice ? (
          <span className={imageNotice.warning ? "field-notice warning" : "field-notice"}>
            {imageNotice.message}
          </span>
        ) : null}
      {compactHeader && <span
          className="article-character-count"
          aria-label={`文章总字数 ${characterCount.toLocaleString()} 字`}
        >
          总字数 {characterCount.toLocaleString()} 字
        </span>}
      </div>

      {pendingImage ? (
        <div
          className="confirm-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !imageBusy) {
              setPendingImage(null);
            }
          }}
        >
          <section
            className="confirm-dialog image-source-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="image-source-dialog-title"
            aria-describedby="image-source-dialog-description"
          >
            <span
              className="confirm-dialog-icon image-source-dialog-icon"
              aria-hidden
            >
              <ImagePlus size={21} />
            </span>
            <div className="confirm-dialog-copy">
              <span className="eyebrow">IMAGE SOURCE</span>
              <h2 id="image-source-dialog-title">填写图片来源</h2>
              <p id="image-source-dialog-description">
                已选择“{pendingImage.name}”。填写后会显示在图片右下方；
                没有来源可以直接选择“无来源插入”。
              </p>
              <p className="image-file-meta">
                {formatImageBytes(pendingImage.size)} · {imageProcessingHint}
              </p>
              <label className="image-source-field">
                <span>图片来源</span>
                <input
                  value={imageSource}
                  placeholder="例如：新华社、品牌官网、作者拍摄"
                  disabled={imageBusy}
                  autoFocus
                  onChange={(event) => setImageSource(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && imageSource.trim()) {
                      event.preventDefault();
                      void addBodyImage(imageSource);
                    }
                    if (event.key === "Escape" && !imageBusy) {
                      setPendingImage(null);
                    }
                  }}
                />
              </label>
            </div>
            <div className="confirm-dialog-actions image-source-actions">
              <button
                type="button"
                className="button secondary"
                disabled={imageBusy}
                onClick={() => setPendingImage(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={imageBusy}
                onClick={() => void addBodyImage("")}
              >
                无来源插入
              </button>
              <button
                type="button"
                className="button primary"
                disabled={imageBusy || !imageSource.trim()}
                onClick={() => void addBodyImage(imageSource)}
              >
                {imageBusy ? "正在处理…" : "添加图片"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
