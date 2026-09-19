// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { exportArticleBundle, type ArticleAsset } from "@wedraft/core";
import { App } from "../../web/src/App.js";

vi.mock("@wedraft/core", async (original) => {
  const core = await original<typeof import("@wedraft/core")>();
  return { ...core, exportArticleBundle: vi.fn(core.exportArticleBundle) };
});

type Prepared = { asset: ArticleAsset; url: string; dataUrl: string; notice: string };
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(), download: vi.fn(),
  editor: null as null | { prepareImage: (file: File) => Promise<Prepared> },
}));
vi.mock("@wedraft/editor-ui/components/ArticleEditor", () => ({ ArticleEditor: (props: typeof mocks.editor) => { mocks.editor = props; return null; } }));
vi.mock("@wedraft/editor-ui/components/WechatPreview", () => ({ WechatPreview: () => null }));
vi.mock("../../web/src/platform.js", () => ({ prepareBrowserImage: mocks.prepare, download: mocks.download, copyHtml: vi.fn() }));
vi.mock("../../web/src/sample.js", () => ({ SAMPLE: "示例\n\n正文", loadSampleAssets: async () => [] }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.replaceChildren(); vi.clearAllMocks(); });

it("out-of-order image completion keeps both assets in the exported article", async () => {
  const originalModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: vi.fn() });
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  const click = async (text: string) => {
    const button = [...document.querySelectorAll("button")].find(item => item.textContent?.includes(text))!;
    await act(async () => button.click());
  };
  const resolvers: Array<(value: Prepared) => void> = [];
  mocks.prepare.mockImplementation(() => new Promise<Prepared>(resolve => resolvers.push(resolve)));
  const prepared = (name: string): Prepared => ({
    asset: { path: `assets/${name}.png`, mimeType: "image/png", base64: "iVBORw0KGgo=" },
    url: `assets/${name}.png`, dataUrl: "", notice: "",
  });
  try {
    await act(async () => root.render(createElement(App)));
    await click("新建");
    const first = mocks.editor!.prepareImage(new File(["a"], "a.png"));
    const second = mocks.editor!.prepareImage(new File(["b"], "b.png"));
    await act(async () => { resolvers[1]!(prepared("b")); await second; });
    await act(async () => { resolvers[0]!(prepared("a")); await first; });
    await click("导出");
    await click("可编辑文章包");
    expect(mocks.download).toHaveBeenCalledOnce();
    const result = vi.mocked(exportArticleBundle).mock.calls[0]![0];
    expect(result.assets!.map(asset => asset.path).sort()).toEqual(["assets/a.png", "assets/b.png"]);
  } finally {
    await act(async () => root.unmount());
    if (originalModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalModal);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  }
});
