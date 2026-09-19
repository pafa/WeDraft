# AI 接入：同一个核心，三个调用入口

当前为源码可运行的 0.1.0 候选。npm 包、公开仓库、远程 MCP 和在线演示站尚未发布。安装和运行无需模型 API Key；AI 如何获得稿件由调用者自己的工具负责。

- **CLI**：适合能够执行命令的 Agent、批处理和流水线。
- **MCP**：适合支持本地 stdio 的 AI 客户端，用工具发现和结构化参数调用。
- **Skill**：说明什么时候调用、如何保留原文并交付文件，底层仍调用 CLI / MCP。

插件可以在后续作为特定 AI 客户端的安装包装；首版不重复实现排版逻辑。

## 从源码安装

使用你有权访问的源码 checkout。Node / pnpm 版本见 `.node-version` 和根 `package.json`，Node 至少 22。

```sh
pnpm install --frozen-lockfile
pnpm build:tools
node packages/cli/dist/cli.mjs --help
```

CLI 构建产物打包了内部 TypeScript、模板和依赖，可直接由 Node 执行。MCP 构建产物仍依赖本目录安装的官方 `@modelcontextprotocol/sdk`；运行时保留其 `node_modules`。不要把只有 `server.mjs` 的文件当成独立安装包。

## CLI

以下命令从源码根目录运行，输出目录的父目录应存在，目标目录必须尚不存在：

```sh
node packages/cli/dist/cli.mjs templates
node packages/cli/dist/cli.mjs validate --input /path/to/article.md
node packages/cli/dist/cli.mjs render --input /path/to/article.md --out /path/to/new-result
node packages/cli/dist/cli.mjs render --input /path/to/article.wedraft.zip --out /path/to/another-result
```

可选 `--template next-edition` 或 `--template default-business`，先用 `templates` 查询。Markdown 第一行是标题，复制正文不重复包含标题。

相对路径图片只有在显式传入 `--asset-root /path/to/images-root` 时才读取。例如原稿的 `assets/photo.png` 对应该根目录下同名路径；不接受越界路径或指向根目录外的符号链接。不会根据稿件自动扫描硬盘，也不会下载远程图片。

`--stdin` 接受 UTF-8 ArticleInput JSON。最小示例：

```json
{"markdown":"文章标题\n\n完整正文。","templateId":"next-edition"}
```

可选字段：`templateVersion`（当前 `builtin-1`）、`author`、`digest`、`sourceUrl`（HTTP(S) URL）、`assets`。本地图片使用：

```json
{"path":"assets/photo.png","mimeType":"image/png","base64":"图片原字节的 Base64"}
```

将该对象放入 `assets` 数组，并在 Markdown 使用 `![说明](assets/photo.png "图片来源：作者")`。真实数据必须是完整有效图片，示例占位符不能直接执行。

退出码：`0` 可用，`2` 存在阻断内容问题，`1` 输入格式 / 文件 / 程序错误。标准输出为 JSON，错误写入标准错误。`render --out` 生成：

- `article.wedraft.zip`：可继续编辑的原稿与图片。
- `preview.html`：打开检查排版；阻断草稿会有明显提示。
- `report.json`：状态、具体问题、模板版本。
- `body.html`、`body.txt`：仅在没有阻断问题时生成。

不带 `--out` 返回含 HTML 的完整 JSON；含图文章会较大，文件交付优先使用 `--out`。工具不会覆盖已有输出目录，IO 失败可能留下不完整的新目录，应以成功返回和 `report.json` 为准。

## 本地 MCP

启动命令（客户端应直接启动 Node，以免包管理器日志干扰 stdout）：

```sh
node /absolute/WeDraft/packages/mcp/dist/server.mjs
```

这是等待 stdin 的 stdio 服务，**没有 HTTP 端口**，不要把它作为网页地址打开。只支持远程 HTTP MCP 的客户端不能直接连接此版本。

部分桌面客户端采用以下配置格式；替换绝对路径，具体配置入口以客户端说明为准：

```json
{
  "mcpServers": {
    "wedraft": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/WeDraft/packages/mcp/dist/server.mjs", "--output-dir", "/absolute/path/to/article-output"]
    }
  }
}
```

不传 `--output-dir` 时只提供三个无副作用工具：

| 工具 | 输入与输出 |
| --- | --- |
| `list_templates` | 空对象 → 模板 ID、名称和版本。 |
| `validate_article` | ArticleInput → 状态、问题和原稿行号。 |
| `render_article` | ArticleInput → 正文 HTML、纯文本和检查结果；阻断时 HTML 为 null。 |

配置输出目录后额外提供 `export_article`。它在该目录下创建唯一子目录，生成与 CLI 相同的预览和文章包，返回本机绝对文件路径。它具有写文件副作用，工具声明不会将其标成只读；路径不是公共下载链接。默认三个工具不读文件、不联网、不修改剪贴板，也不发布到微信。

带图片时优先让有文件权限的 Agent 使用 CLI 读取明确的图片目录，避免把大量 Base64 塞入模型上下文；MCP 适合纯文本或宿主能传入图片资产的调用。

## Skill

仓库内的 `skills/format-with-wedraft/` 是可复制的技能目录。按照所用 AI 客户端的技能安装机制加载这个文件夹，再告诉 AI 已安装的 WeDraft 源码位置或连接上述 MCP。此版本不会自动修改用户的全局技能或 MCP 配置。

建议任务：

> 使用 WeDraft 为这篇文章排版，保留原文、链接、图片说明与来源。给我可打开的预览和可编辑文章包；存在阻断问题时先指出位置。

Skill 是流程指导，不能替代可执行工具。它不会用模型重新编写模板 HTML，也不会假定源码路径或未发布的 npm 包已经存在。

## 网页交接与兼容性

将输出的 `.wedraft.zip` 导入网页即可继续编辑，再导出交还 AI。文章包格式为 `schemaVersion: 1`，包含 `article.md`、`manifest.json` 和图片；未知格式或模板版本会明确拒绝，不静默切换模板。`schemaVersion` 与软件版本独立演进。

实际验证：官方 MCP SDK 1.26.0 客户端连接真实子进程；CLI 生成文件；Chrome 导入、编辑、图片、撤回重做、IndexedDB 恢复、导出重开和富文本复制/浏览器粘贴。此证据不等于已验证所有 AI 宿主或微信后台。运行 `node scripts/smoke-web.mjs` 可复现，需本机 Chrome，证据写入忽略目录 `output/playwright/web-ai/`。
