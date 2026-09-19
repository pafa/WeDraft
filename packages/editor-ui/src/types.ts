export type CachedBodyImage = {
  path: string;
  sha256: string;
  fileName: string;
  mimeType: string;
  base64: string;
  width: number;
  height: number;
  originalBytes: number;
  outputBytes: number;
  optimized: boolean;
  warning: string | null;
};

export type CopyProgress = {
  status: "idle" | "copying" | "success" | "failed";
  message: string;
};
