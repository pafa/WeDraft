import { describe, expect, it } from "vitest";

import {
  cachedImagePath,
  localImagePreviewUrl,
} from "../src/services/image-preview.js";

describe("local body image preview", () => {
  const localPath =
    "wedraft://image/hash?path=%2FUsers%2Fme%2FLibrary%2FApplication%20Support%2Fcom.wedraft.desktop%2Fimages%2Fhash.png";

  it("从正文图片地址安全提取缓存文件路径", () => {
    expect(cachedImagePath(localPath)).toBe(
      "/Users/me/Library/Application Support/com.wedraft.desktop/images/hash.png",
    );
  });

  it("把缓存文件转换成 Tauri asset 预览地址", () => {
    expect(
      localImagePreviewUrl(
        localPath,
        (path) => `asset://localhost${path}`,
      ),
    ).toBe(
      "asset://localhost/Users/me/Library/Application Support/com.wedraft.desktop/images/hash.png",
    );
  });

  it("拒绝非 WeDraft 缓存地址", () => {
    expect(cachedImagePath("file:///tmp/image.png")).toBeUndefined();
  });
});
