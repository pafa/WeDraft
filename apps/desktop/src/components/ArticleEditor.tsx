import type { ComponentProps } from "react";
import { ArticleEditor as SharedArticleEditor } from "@wedraft/editor-ui/components/ArticleEditor";
import { copyPlainText } from "../services/clipboard.js";
import { cacheBodyImage } from "../services/native.js";

function formatImageBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
}

async function prepareNativeImage(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const cached = await cacheBodyImage(bytes, file.name);
  const metadata = new URLSearchParams({
    path: cached.path,
    bytes: String(cached.outputBytes),
    width: String(cached.width),
    height: String(cached.height),
    mime: cached.mimeType,
    optimized: cached.optimized ? "1" : "0",
  });
  return {
    url: `wedraft://image/${cached.sha256}?${metadata.toString()}`,
    dataUrl: `data:${cached.mimeType};base64,${cached.base64}`,
    notice: cached.warning ?? (cached.optimized
      ? `图片已自动优化：${formatImageBytes(cached.originalBytes)} → ${formatImageBytes(cached.outputBytes)}，${cached.width} × ${cached.height}px。`
      : `图片检测完成：${cached.width} × ${cached.height}px，${formatImageBytes(cached.outputBytes)}。`),
    warning: Boolean(cached.warning),
  };
}

type Props = Omit<ComponentProps<typeof SharedArticleEditor>, "prepareImage" | "copyPlainText">;

export function ArticleEditor(props: Props) {
  return (
    <SharedArticleEditor
      {...props}
      prepareImage={prepareNativeImage}
      copyPlainText={copyPlainText}
    />
  );
}
