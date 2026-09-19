import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Real stdio server, real browser storage/clipboard/downloads; only neutral fixtures.
const root = fileURLToPath(new URL("../", import.meta.url));
const mcpRequire = createRequire(join(root, "packages/mcp/package.json"));
const webRequire = createRequire(join(root, "apps/web/package.json"));
const coreRequire = createRequire(join(root, "packages/core/package.json"));
const { Client } = mcpRequire("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = mcpRequire("@modelcontextprotocol/sdk/client/stdio.js");
const { unzipSync } = coreRequire("fflate");
const temporary = await mkdtemp(join(tmpdir(), "wedraft-web-smoke-"));
const evidence = process.env.WEDRAFT_EVIDENCE_DIR || join(tmpdir(), "wedraft-web-evidence");
await mkdir(evidence, { recursive: true });
const cli = join(root, "packages/cli/dist/cli.mjs");
const report = { checks: [], errors: [], consoleErrors: [], requestsOutsideApp: [], devices: [], browser: "Chrome through Playwright; Browser plugin not available", startedAt: new Date().toISOString() };
const templates = [
  ["default-business", "小哈公社"], ["next-edition", "小哈公社New"],
  ["plain-paper", "素笺"], ["ink-journal", "墨刊"], ["jade-notes", "青岚"],
  ["blueprint", "蓝图"], ["cinnabar", "朱砂"],
];
let browser; let vite;
const client = new Client({ name: "wedraft-web-smoke", version: "0.1.0" });
const waitFor = async (predicate) => {
  for (let i = 0; i < 80; i++) { if (await predicate()) return; await new Promise((done) => setTimeout(done, 100)); }
  throw new Error("Timed out waiting for state");
};
const check = (name) => { report.checks.push(name); console.log(`PASS ${name}`); };
const chooseTemplate = async (page, name) => {
  await page.getByRole("link", { name: "更多模板" }).click();
  await page.getByRole("heading", { name: "模板库", exact: true }).waitFor();
  const card = page.locator(".template-card").filter({ has: page.getByRole("heading", { name, exact: true }) });
  await card.getByRole("button", { name: "设为默认并使用", exact: true }).click();
  await waitFor(async () => new URL(page.url()).hash === "#/" && await page.locator(".current-template strong").innerText() === name);
};
const databaseNames = (page) => page.evaluate(async () => (await indexedDB.databases()).map(({ name }) => name));
const legacyDrafts = (page) => page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open("wedraft-web-v1", 1);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result;
    const read = db.transaction("drafts", "readonly").objectStore("drafts").getAll();
    read.onsuccess = () => { const records = read.result; db.close(); resolve(records); };
    read.onerror = () => { db.close(); reject(read.error); };
  };
}));
const verifyDevice = async (page, mode, width, height) => {
  await page.getByRole("button", { name: mode === "iphone" ? "iPhone" : "Android", exact: true }).click();
  const shell = page.locator(`.phone-shell.${mode}`);
  await shell.waitFor();
  // Compare the logical geometry as well as the transformed rectangle. A squashed
  // shell can still fit its container, so bounding width alone is insufficient.
  await waitFor(async () => shell.evaluate((element) => {
    const rectangle = element.getBoundingClientRect();
    return Math.abs(rectangle.width / element.offsetWidth - rectangle.height / element.offsetHeight) < 0.001;
  }));
  const dimensions = await shell.evaluate((element) => {
    const rectangle = element.getBoundingClientRect();
    const article = element.querySelector(".wechat-article");
    return { logicalWidth: element.offsetWidth, logicalHeight: element.offsetHeight,
      screenWidth: element.clientWidth, screenHeight: element.clientHeight, width: rectangle.width, height: rectangle.height,
      articleWidth: article?.clientWidth, fontSize: article && getComputedStyle(article).fontSize,
      viewport: { width: innerWidth, height: innerHeight } };
  });
  assert.equal(dimensions.logicalWidth, width);
  assert.equal(dimensions.logicalHeight, height);
  assert.equal(dimensions.screenWidth, mode === "iphone" ? 440 : 412);
  assert.equal(dimensions.screenHeight, mode === "iphone" ? 956 : 892);
  assert(dimensions.width <= width + 1 && dimensions.width > 100);
  assert(Math.abs(dimensions.width / width - dimensions.height / height) < 0.001);
  for (const selector of [".phone-status", ".status-time", ".status-icons", ".wechat-back", ".gesture-indicator", mode === "iphone" ? ".dynamic-island" : ".camera-hole"]) {
    assert(await shell.locator(selector).isVisible(), `${mode} ${selector} is visible`);
  }
  report.devices.push({ mode, ...dimensions });
  return dimensions;
};
try {
  for (const target of ["cli", "mcp"]) execFileSync(process.execPath, [join(root, "scripts/build-tools.mjs"), target], { cwd: root });
  const url = process.env.WEDRAFT_WEB_URL || "http://127.0.0.1:1435/";
  if (!process.env.WEDRAFT_WEB_URL) {
    const viteBin = join(dirname(webRequire.resolve("vite/package.json")), "bin/vite.js");
    vite = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", "1435", "--strictPort"], { cwd: join(root, "apps/web"), stdio: "pipe" });
    let logs = "";
    vite.stderr.on("data", (data) => { logs += data; });
    await waitFor(async () => { if (vite.exitCode !== null) throw new Error(logs); try { return (await fetch(url)).ok; } catch { return false; } });
  }
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [join(root, "packages/mcp/dist/server.mjs"), "--output-dir", temporary], stderr: "pipe" }));
  const listed = await client.callTool({ name: "list_templates", arguments: {} });
  assert.notEqual(listed.isError, true);
  const catalog = listed.structuredContent.templates;
  assert.deepEqual(catalog.map(({ id, name }) => [id, name]), templates);
  check("MCP exposes the same seven named templates as the website");
  const png = await readFile(join(root, "apps/desktop/public/sample-editorial-image.png"));
  const original = "# AI 与网页共同编辑\r\n\r\n这段正文保留 **重点** 与 [原始来源](https://example.com/source)。\r\n\r\n## 1. 可以继续修改\r\n\r\n![内置示例](assets/sample.png \"图片来源：WeDraft 内置样图\")\r\n\r\n|项目|状态|\r\n|---|---|\r\n|文章包|可编辑|\r\n\r\n```js\r\nconst example = 1;\r\n```\r\n";
  const input = { markdown: original, templateId: "next-edition", assets: [{ path: "assets/sample.png", mimeType: "image/png", base64: png.toString("base64") }] };
  const exported = await client.callTool({ name: "export_article", arguments: input });
  assert.notEqual(exported.isError, true);
  assert.equal(exported.structuredContent.status, "ready");
  const bundle = exported.structuredContent.files.find((file) => file.endsWith(".zip"));
  assert.equal(new TextDecoder().decode(unzipSync(await readFile(bundle))["article.md"]), original);
  check("MCP exports exact source and local image to portable bundle");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
  context.on("page", (opened) => {
    opened.on("pageerror", (error) => report.errors.push(error.message));
    opened.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push({ text: message.text(), location: message.location() }); });
    opened.on("request", (request) => { if (!request.url().startsWith(url) && !/^(data:|blob:)/.test(request.url())) report.requestsOutsideApp.push(request.url()); });
  });
  const page = await context.newPage();
  await page.goto(url);
  const importer = page.getByLabel("导入文章文件");
  const editor = page.locator(".markdown-editor");
  await editor.waitFor();
  assert.equal(new URL(page.url()).origin, new URL(url).origin);
  assert((await page.title()).includes("WeDraft"));
  assert(await page.getByRole("heading", { name: "微信效果预览", exact: true }).isVisible());
  assert.equal(await page.locator("vite-error-overlay").count(), 0);
  assert.equal(await page.getByRole("button", { name: "使用这篇示例" }).count(), 0);
  assert.equal(await page.locator(".current-template").count(), 1);
  assert.equal(await page.locator(".template-switcher").count(), 0, "the editor shows one selected template instead of a row of all themes");
  assert.equal(await page.getByRole("button", { name: "本机草稿", exact: true }).count(), 0);
  assert.deepEqual(await databaseNames(page), [], "opening the temporary editor does not create a draft database");
  const initialSample = await editor.inputValue();
  assert(initialSample.length > 100, "the full example is displayed on first visit");
  await page.mouse.move(120, 30);
  await page.screenshot({ path: join(evidence, "editor-sample.png") });
  assert(await editor.evaluate(element => element.classList.contains("demo-content")));
  const sampleImage = page.locator(".wechat-article img").first();
  await sampleImage.waitFor();
  await waitFor(() => sampleImage.evaluate(element => element.complete && element.naturalWidth > 0));
  assert(await page.getByRole("button", { name: "复制排版", exact: true }).isDisabled());
  await editor.click();
  assert.equal(await editor.inputValue(), "", "one click dismisses the example and opens an empty editor");
  assert(await editor.evaluate(element => document.activeElement === element));
  assert.equal(await page.locator(".wechat-article img").count(), 0);
  await editor.pressSequentially("开始写自己的文章");
  assert.equal(await editor.inputValue(), "开始写自己的文章");
  await page.screenshot({ path: join(evidence, "desktop.png") });
  const editedSample = `${initialSample}\n\n自动验收：直接接着编辑示例。`;
  await editor.fill(editedSample);
  await page.reload();
  await waitFor(async () => await editor.inputValue() === initialSample);
  assert(!(await editor.inputValue()).includes("自动验收：直接接着编辑示例。"));
  assert.deepEqual(await databaseNames(page), []);
  await editor.fill(editedSample);
  check("First visit displays a gray sample with a loaded image; one click starts a blank focused editor, and refresh discards temporary edits without creating a database");

  await page.getByRole("link", { name: "更多模板" }).click();
  await page.getByRole("heading", { name: "模板库", exact: true }).waitFor();
  assert.equal(new URL(page.url()).hash, "#/templates");
  assert.equal(await page.locator(".template-card").count(), 7);
  for (const [, name] of templates) assert(await page.getByRole("heading", { name, exact: true }).isVisible());
  assert.equal(await page.getByRole("searchbox").count(), 0);
  assert.equal(await page.getByLabel("搜索模板").count(), 0);
  assert.equal(await page.locator(".template-grid").evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length), 4);
  await page.getByRole("button", { name: "添加模板", exact: true }).click();
  await page.getByRole("dialog", { name: "添加模板", exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "前往 GitHub" }).getAttribute("href"), "https://github.com/pafa/WeDraft");
  await page.getByRole("button", { name: "关闭添加说明" }).click();
  await page.getByRole("button", { name: "预览青岚", exact: true }).click();
  await page.getByRole("dialog", { name: "青岚完整排版" }).waitFor();
  await page.getByRole("button", { name: "关闭模板预览" }).click();
  await page.screenshot({ path: join(evidence, "templates-desktop.png"), fullPage: true });
  await page.getByRole("heading", { name: "朱砂", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(evidence, "templates-desktop-lower.png") });
  const jade = page.locator(".template-card").filter({ has: page.getByRole("heading", { name: "青岚", exact: true }) });
  await jade.getByRole("button", { name: "设为默认并使用", exact: true }).click();
  await waitFor(async () => new URL(page.url()).hash === "#/" && await page.locator(".current-template strong").innerText() === "青岚");
  assert.equal(await editor.inputValue(), editedSample);
  const preference = (await context.cookies()).find(({ name }) => name === "wedraft_template");
  assert.equal(preference?.value, "jade-notes");
  assert.equal(preference?.path, "/");
  assert.equal(preference?.sameSite, "Lax");
  assert(Math.abs(preference.expires - Date.now() / 1000 - 31536000) < 60);
  const freshTab = await context.newPage();
  await freshTab.goto(url);
  await freshTab.locator(".markdown-editor").waitFor();
  assert.equal(await freshTab.locator(".current-template strong").innerText(), "青岚");
  assert.equal(await freshTab.locator(".markdown-editor").inputValue(), initialSample);
  await freshTab.getByRole("button", { name: "新建", exact: true }).click();
  await waitFor(async () => await freshTab.locator(".markdown-editor").inputValue() === "");
  assert.equal(await freshTab.locator(".current-template strong").innerText(), "青岚");
  await freshTab.close();
  check("Template library previews seven styles, remembers selection for one year and starts blank new articles with that default");

  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "接入 AI" }).click();
  await page.getByRole("heading", { name: /从原稿到微信/ }).waitFor();
  assert.equal(new URL(page.url()).hash, "#/ai");
  assert.equal(await editor.count(), 0);
  assert(await page.locator("#ai-manual-path").isVisible());
  await page.getByRole("button", { name: "自动排版", exact: true }).click();
  await page.locator("#ai-automatic-path").waitFor();
  await page.getByRole("button", { name: "复制接入指令", exact: true }).click();
  const connectionPrompt = await page.evaluate(() => navigator.clipboard.readText());
  assert(connectionPrompt.includes(`${url}connect.md`) && connectionPrompt.includes("Skill") && connectionPrompt.includes("MCP"));
  assert((await page.locator(".local-connect-note").innerText()).includes("只适用于这台电脑"));
  await page.screenshot({ path: join(evidence, "ai-desktop.png"), fullPage: true });
  await page.locator(".connect-panel").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(evidence, "ai-connect-desktop.png") });
  await page.getByRole("link", { name: "返回编辑", exact: true }).click();
  await waitFor(async () => await editor.inputValue() === editedSample);
  check("AI integration has separate manual and automatic paths with a one-step setup prompt; returning retains source");

  await importer.setInputFiles(bundle);
  await waitFor(async () => (await editor.inputValue()) === original.replaceAll("\r\n", "\n"));
  assert.equal(await page.locator(".current-template strong").innerText(), "小哈公社New", "an imported article retains its own template");
  await waitFor(() => page.locator(".wechat-article img").evaluateAll((images) => images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0)));
  check("Web imports MCP bundle, template and decoded image");
  const changed = (await editor.inputValue()).replace("这段正文", "网页修订正文");
  await editor.fill(changed);
  await page.getByRole("button", { name: "撤回上一步", exact: true }).click();
  assert(!(await editor.inputValue()).includes("网页修订正文"));
  await page.getByRole("button", { name: "重做下一步", exact: true }).click();
  assert((await editor.inputValue()).includes("网页修订正文"));
  const paragraph = page.locator('[data-wedraft-edit-kind="paragraph"]').first();
  await paragraph.fill("从预览直接修改的正文。");
  await editor.click();
  await waitFor(async () => (await editor.inputValue()).includes("从预览直接修改的正文"));
  check("Textarea undo/redo and preview editing write back to Markdown");
  await chooseTemplate(page, "小哈公社");
  await editor.press("ControlOrMeta+End");
  await editor.press("End");
  await editor.press("Enter");
  await editor.press("Enter");
  await page.locator('input[type="file"]:not([aria-label="导入文章文件"])').setInputFiles(join(root, "apps/desktop/public/sample-editorial-image.png"));
  await page.getByPlaceholder("例如：新华社、品牌官网、作者拍摄").fill("测试作者拍摄");
  await page.getByRole("button", { name: "添加图片", exact: true }).click();
  await waitFor(async () => (await editor.inputValue()).includes("测试作者拍摄"));
  await page.getByRole("button", { name: "导出", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "可编辑文章包" }).click();
  const portablePath = join(evidence, "roundtrip.wedraft.zip");
  await (await downloaded).saveAs(portablePath);
  const source = await editor.inputValue();
  const archive = unzipSync(await readFile(portablePath));
  assert.equal(new TextDecoder().decode(archive["article.md"]), source);
  assert.equal(JSON.parse(new TextDecoder().decode(archive["manifest.json"])).templateId, "default-business");
  assert.equal(Object.keys(archive).filter((name) => name.startsWith("assets/")).length, 2);
  check("Local image/caption and template survive web bundle export");
  await page.bringToFront();
  assert.equal(await editor.inputValue(), source, "source stays stable before invoking copy");
  await page.getByRole("button", { name: "复制排版", exact: true }).click();
  if (await page.getByRole("button", { name: "确认并继续复制" }).isVisible()) await page.getByRole("button", { name: "确认并继续复制" }).click();
  await waitFor(async () => (await page.locator(".web-status").innerText()).includes("排版已复制"));
  assert.equal(await editor.inputValue(), source, "copy does not replace the current article");
  const clipboard = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return { html: await (await item.getType("text/html")).text(), text: await (await item.getType("text/plain")).text() };
  });
  const cliOutput = join(temporary, "cli-roundtrip");
  const cliResult = JSON.parse(execFileSync(process.execPath, [cli, "render", "--input", portablePath, "--out", cliOutput], { encoding: "utf8" }));
  assert.equal(cliResult.status, "ready");
  assert.equal(clipboard.text, await readFile(join(cliOutput, "body.txt"), "utf8"));
  assert(clipboard.html.includes("data:image/png;base64,") && clipboard.html.includes("<table") && clipboard.html.includes("测试作者拍摄"));
  assert(!clipboard.text.includes("AI 与网页共同编辑"));
  const pastePage = await context.newPage();
  await pastePage.goto(url);
  await pastePage.evaluate(() => { const target = document.createElement("div"); target.id = "paste-check"; target.contentEditable = "true"; document.body.replaceChildren(target); });
  await pastePage.locator("#paste-check").focus();
  await pastePage.keyboard.press("ControlOrMeta+V");
  await waitFor(async () => (await pastePage.locator("#paste-check").innerText()).includes("测试作者拍摄"));
  assert.equal(await pastePage.locator("#paste-check img").count(), 2);
  await pastePage.close();
  check("Actual rich clipboard and browser paste preserve body, table, images and captions");
  const preferenceTab = await context.newPage();
  await preferenceTab.goto(url);
  await preferenceTab.locator(".markdown-editor").waitFor();
  await chooseTemplate(preferenceTab, "蓝图");
  await preferenceTab.close();
  assert.equal(await editor.inputValue(), source);
  assert.equal(await page.locator(".current-template strong").innerText(), "小哈公社", "changing the default in another tab leaves the current in-memory article unchanged");
  assert.deepEqual(await databaseNames(page), [], "editing, navigating, importing, copying and exporting do not create IndexedDB");
  const legacy = { id: "legacy-private-fixture", updatedAt: "2026-09-01T00:00:00Z", archivalMarker: "preserve-this-unchanged",
    article: { markdown: "旧版本保存的中性测试文章\n\n不得被当前临时编辑流程读取或覆盖。", templateId: "cinnabar", author: "测试作者", digest: "", sourceUrl: "", assets: [] } };
  await page.evaluate((draft) => new Promise((resolve, reject) => {
    const request = indexedDB.open("wedraft-web-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "id" });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("drafts", "readwrite");
      transaction.objectStore("drafts").put(draft);
      transaction.oncomplete = () => { db.close(); sessionStorage.setItem("wedraft.web.active", draft.id); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }), legacy);
  await page.reload();
  await waitFor(async () => (await editor.inputValue()) === initialSample);
  assert.equal(await page.locator(".current-template strong").innerText(), "蓝图", "refresh starts the sample with the remembered default rather than the old article template");
  assert.equal((await context.cookies()).find(({ name }) => name === "wedraft_template")?.value, "blueprint");
  assert.deepEqual(await legacyDrafts(page), [legacy], "an existing old-version draft is preserved and not restored into the temporary editor");
  await importer.setInputFiles(portablePath);
  await waitFor(async () => (await editor.inputValue()) === source);
  assert.equal(await page.locator(".current-template strong").innerText(), "小哈公社", "explicit article import still keeps the article's own template");
  await importer.setInputFiles({ name: "invalid.wedraft.zip", mimeType: "application/zip", buffer: Buffer.from("not a zip") });
  await waitFor(async () => (await page.locator(".web-status.error").count()) > 0);
  assert.equal(await editor.inputValue(), source);
  check("Temporary edits are discarded on refresh while the template cookie and old IndexedDB records remain intact; explicit import restores the article and invalid import is non-destructive");
  await editor.fill("缺图文章\n\n![图](missing.png)");
  await page.getByRole("button", { name: "复制排版", exact: true }).click();
  await page.getByRole("heading", { name: "修正后再复制" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "确认并继续复制" }).count(), 0);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await importer.setInputFiles(portablePath);
  await waitFor(async () => (await editor.inputValue()) === source);
  check("Blocking missing-image issue prevents copy; portable bundle restores editable draft");
  const originalParagraph = await page.locator('[data-wedraft-edit-kind="paragraph"]').first().innerText();
  for (const mode of ["网页版", "iPhone", "Android"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    const editableParagraph = page.locator('[data-wedraft-edit-kind="paragraph"]').first();
    await waitFor(async () => await editableParagraph.getAttribute("contenteditable") === "true");
    const replacement = `切换到 ${mode} 后，仍能直接微调正文。`;
    await editableParagraph.fill(replacement);
    await editor.click();
    await waitFor(async () => (await editor.inputValue()).includes(replacement));
  }
  await page.locator('[data-wedraft-edit-kind="paragraph"]').first().fill(originalParagraph);
  await editor.click();
  await waitFor(async () => await editor.inputValue() === source);
  check("Switching web → iPhone → Android recreates editable preview blocks and writes each edit back without losing other source");
  const fittedIphone = await verifyDevice(page, "iphone", 456, 972);
  await page.getByRole("button", { name: "100%", exact: true }).click();
  await waitFor(async () => Math.abs((await page.locator(".phone-shell.iphone").boundingBox()).width - 456) < 1);
  const actualSize = await page.locator(".phone-shell.iphone").boundingBox();
  assert(Math.abs(actualSize.height - 972) < 1);
  assert.equal(await page.locator(".phone-shell.iphone .wechat-article").evaluate((element) => getComputedStyle(element).fontSize), fittedIphone.fontSize);
  await page.getByRole("button", { name: "适应窗口", exact: true }).click();
  await verifyDevice(page, "android", 424, 904);
  await page.screenshot({ path: join(evidence, "android-desktop.png") });
  await verifyDevice(page, "iphone", 456, 972);
  await page.screenshot({ path: join(evidence, "desktop-edited.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "阅读预览", exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await verifyDevice(page, "iphone", 456, 972);
  await page.screenshot({ path: join(evidence, "mobile.png") });
  await verifyDevice(page, "android", 424, 904);
  await page.screenshot({ path: join(evidence, "android-mobile.png") });
  await page.setViewportSize({ width: 320, height: 740 });
  await verifyDevice(page, "iphone", 456, 972);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
  await page.screenshot({ path: join(evidence, "mobile-narrow.png") });
  check("iPhone and Android preserve fixed screen geometry, system chrome and equal-axis scaling on desktop and narrow screens; 100% uses logical pixels");
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "模板库" }).click();
  await page.getByRole("heading", { name: "模板库", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
  await page.screenshot({ path: join(evidence, "templates-mobile.png"), fullPage: true });
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "接入 AI" }).click();
  await page.getByRole("heading", { name: /从原稿到微信/ }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320);
  await page.screenshot({ path: join(evidence, "ai-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "自动排版", exact: true }).click();
  await page.getByRole("button", { name: "复制接入指令", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(evidence, "ai-connect-mobile.png") });
  check("Template and AI pages keep navigation and content within a 320px viewport");
  assert.deepEqual(await databaseNames(page), ["wedraft-web-v1"]);
  assert.deepEqual(await legacyDrafts(page), [legacy], "later imports and preview edits never modify or append to the pre-existing draft database");
  check("The legacy draft database remains byte-for-byte equivalent at the record level after all editor actions");
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.consoleErrors, []);
  assert.deepEqual(report.requestsOutsideApp, []);
  check("No page runtime errors or off-origin requests for the local fixture");
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  await writeFile(join(evidence, "smoke-report.json"), JSON.stringify(report, null, 2));
  await browser?.close(); await client.close(); vite?.kill();
  await rm(temporary, { recursive: true, force: true });
}
