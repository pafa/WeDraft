# AI 与 WeDraft：手工整理，或自动排版

网页版的「接入 AI」提供两条独立路径。你可以只借助 AI 整理原稿，也可以安装工具后，让 AI 直接生成排版结果。两种方式最终都得到可粘贴到微信公众号的富文本正文。

## 方式一：格式杂，先让 AI 整理，再回网页

这条路径不需要安装 Skill、MCP 或 CLI，可以使用你常用的 AI 对话。

1. 在「接入 AI」页面选择“手工整理”，点击“复制 Markdown 格式指令”。它直接复用编辑器中的 `MARKDOWN_RULES_PROMPT`，与“复制 Markdown 规则”按钮内容相同。
2. 把原文与这份指令一起发给 AI。AI 按规则将已有标题、段落、列表和来源转换成 WeDraft 支持的 Markdown；指令要求保留可见文字、不改写、不删减、不补充内容。
3. 复制 AI 返回的完整 Markdown 代码块内容，粘贴回网页编辑器。对照原文检查，选择模板、处理图片和来源，再按实时预览微调。
4. 点击网页的“复制排版”，将带样式的正文粘贴到公众号后台；标题单独填写，发布前检查图片与手机效果。

页面可以展开查看完整指令；复制不可用时也能手工选择指令文字。Word、网页文字等原稿由你选择的 AI 读取或整理，WeDraft 并不因此具备直接解析任意文档格式的能力。AI 转换结果仍由作者核对。

## 方式二：已有 Markdown，让 AI 直接排版

如果文章已经在 AI 对话里写成 Markdown，不必再复制回工作台完成排版。安装一次后，AI 可以调用 WeDraft 选择模板、检查原稿，交付可以打开并复制富文本的排版预览。

页面的“自动排版”路径包含两个动作：第一次复制接入指令；之后每篇文章只要复制或直接说一句排版任务。

> 用 WeDraft 的青岚模板排版上面的 Markdown，保留原文、链接和图片来源；给我可以复制富文本的排版预览。有阻断问题时先指出位置。

模板名称可以换成其他已安装模板。拿到结果后，打开 `preview.html`，点击“复制正文排版”，将正文粘贴到微信。文章包是需要继续修改时的交接文件：可导入网页换模板或编辑，完成自动排版本身不要求先返回工作台。

如果 AI 宿主同时具备浏览器和剪贴板能力，还可以在用户授权后继续操作预览、复制和微信粘贴。WeDraft 的 MCP 只提供排版、检查和文件导出，不自行操作剪贴板或微信，也不自动发布；这段后续操作取决于 AI 宿主能力。

当前一键配置面向 macOS / Linux 上能执行本机命令的 Codex。其他支持本地 stdio MCP 的客户端可以使用生成的配置；纯网页聊天、只接受远程 MCP 地址的客户端可先使用方式一。

当前仍是本地候选：公开仓库、远程 MCP 和在线演示站尚未发布。本地预览中的 `127.0.0.1` 地址仅能由这台电脑上的工具访问，不能直接交给云端 AI。正式公开目标为现有 [pafa/WeDraft](https://github.com/pafa/WeDraft) 仓库，计划网站地址为 `https://wedraft.xiaoha.org`，当前尚未上线。网站部署后，接入页面会自动使用当前站点地址；本地页面不提前生成指向未上线网站的安装命令。

## 一次接入

在「接入 AI」页面选择“自动排版”，复制接入指令交给本机 AI，或展开终端选项复制一条命令。当前命令支持 macOS / Linux，并自动登记 Codex。地址由当前站点生成；以下仅表示格式，不能把占位地址直接运行：

```sh
curl -fsSL 'https://实际站点/integrations/install.sh' | sh -s -- 'https://实际站点/integrations/'
```

也可以告诉本机 AI：“读取这个 WeDraft 站点的 `connect.md`，帮我接入，然后为这篇文章排版。”AI 仍须有执行本机命令和修改配置的权限。

安装器完成：

- 获取并校验自包含 CLI / MCP；运行时不依赖源码或 `node_modules`。
- 优先使用本机 Node 22+。没有时，从 Node 官方站点下载、校验并准备专供 WeDraft 的 Node 24；不使用 sudo、不更改系统 Node。
- 将工具放入 `~/.local/share/wedraft/`，Skill 放入 `~/.agents/skills/format-with-wedraft/`。
- 在 `~/.codex/config.toml` 登记 `wedraft` MCP；保留其他配置，修改前备份原文件。
- 使用 `~/Documents/WeDraft Exports/` 保存新导出文件。已有导出不会覆盖。

重复运行不会重复添加 MCP。遇到同名的其他工具、已有 Skill 或本地改动时会停止并保留它们。安装文件带 SHA-256 完整性校验；站点本身仍须可信。

完成后可以立即使用打印出的 CLI 命令。正在运行的对话如果没有刷新工具列表，可先直接调用 CLI，或重新打开对话加载 MCP / Skill。其他支持 stdio 的客户端可使用安装目录内 `mcp-client.json` 的 `command` / `args`；本次自动配置仅适配 Codex。

## 工具分别负责什么

- **Skill**：给 AI 的工作说明，约定保留原文、检查问题和交付结果，调用 CLI / MCP 执行排版。
- **MCP**：让支持本地 stdio 的 AI 客户端发现并调用模板、检查、渲染与导出工具。
- **CLI**：供能执行命令的 Agent、批处理或流水线使用；MCP 尚未加载时也可以直接运行。

一条安装命令会准备这些工具，不需要用户分别下载。它们共用同一个排版核心，不要求模型 API Key；后续特定客户端的插件可以作为安装包装，不重复实现排版逻辑。

## 开发者从源码运行

```sh
pnpm install --frozen-lockfile
pnpm build:tools
node packages/cli/dist/cli.mjs --help
```

Node / pnpm 版本见 `.node-version` 和根 `package.json`。CLI 和 MCP 构建产物均已打包内部 TypeScript、模板和运行依赖，可直接由 Node 22+ 执行。`pnpm build:web` 同时生成站点的安装资源和 `connect.md`，开发服务器也提供同样入口；没有依赖未发布的 npm 包。

## CLI

以下命令从源码根目录运行，输出目录的父目录应存在，目标目录必须尚不存在：

```sh
node packages/cli/dist/cli.mjs templates
node packages/cli/dist/cli.mjs validate --input /path/to/article.md
node packages/cli/dist/cli.mjs render --input /path/to/article.md --out /path/to/new-result
node packages/cli/dist/cli.mjs render --input /path/to/article.wedraft.zip --out /path/to/another-result
```

使用 `--template <模板ID>` 选择模板，先用 `templates` 查询当前完整列表。Markdown 第一行是标题，复制正文不重复包含标题。

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
- `preview.html`：打开检查排版并复制富文本正文；阻断草稿会有明显提示，不能作为可发布排版复制。
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

网站的一条命令会安装 `format-with-wedraft` 并填入实际 CLI 路径；它可在 MCP 尚未刷新时直接使用工具。仓库内的 Skill 是安装源，命令占位符在安装时替换，不需要用户手动复制目录。

建议任务：

> 用 WeDraft 的青岚模板排版上面的 Markdown，保留原文、链接和图片来源；给我可以复制富文本的排版预览。有阻断问题时先指出位置。

Skill 是流程指导，不能替代可执行工具。它不会用模型重新编写模板 HTML，也不会假定源码路径或未发布的 npm 包已经存在。

## 网页交接与兼容性

将输出的 `.wedraft.zip` 导入网页即可继续编辑，再导出交还 AI。文章包格式为 `schemaVersion: 1`，包含 `article.md`、`manifest.json` 和图片；未知格式或模板版本会明确拒绝，不静默切换模板。`schemaVersion` 与软件版本独立演进。

网页文章只在当前页面内存暂存，刷新或关闭后清空；跨页操作保留本次原稿，模板 Cookie 不包含文章。AI 工作流如需保留源文件应交付文章包，不依赖浏览器文章库。

验证覆盖官方 MCP SDK 1.26.0 客户端连接真实子进程、CLI 文件生成，以及 Chrome 的导入、编辑、图片、撤回重做、导出重开和富文本复制/浏览器粘贴。最新临时编辑与双流程验收以[验收记录](web-ai-acceptance.md)为准。此证据不等于已验证所有 AI 宿主或微信后台。运行 `node scripts/smoke-web.mjs` 可复现，需本机 Chrome，证据默认写入系统临时目录的 `wedraft-web-evidence/`，可用 `WEDRAFT_EVIDENCE_DIR` 指定。

## 安装验证与限制

安装测试使用明确的临时安装目录、Skill 目录、配置文件和导出目录，不修改开发者真实用户配置。覆盖真实 shell 安装、离开源码目录后的 CLI、MCP 初始化与工具发现、私有 runtime、重复安装、原配置备份、冲突保护和下载完整性校验。测试命令：`pnpm --filter @wedraft/cli test`。

安装器的 `--install-dir`、`--skill-dir`、`--config-file`、`--output-dir` 支持显式路径。`install.sh` 会把这些参数转交给安装器。联网和本机客户端的权限弹窗由运行环境决定；不会承诺绕过权限或让云端工具访问 localhost。当前未覆盖 Windows 自动安装，也未把本地 MCP 描述为可粘贴的远程 MCP URL。
