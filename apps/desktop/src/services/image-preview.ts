type FileSourceConverter = (path: string) => string;

export function cachedImagePath(localPath: string): string | undefined {
  if (!localPath.startsWith("wedraft://image/")) return undefined;
  try {
    return new URL(localPath).searchParams.get("path") ?? undefined;
  } catch {
    return undefined;
  }
}

export function localImagePreviewUrl(
  localPath: string,
  converter: FileSourceConverter,
): string | undefined {
  const path = cachedImagePath(localPath);
  return path ? converter(path) : undefined;
}
