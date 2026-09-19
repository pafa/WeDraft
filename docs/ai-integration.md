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

[pafa/WeDraft](https://github.com/pafa/WeDraft) 已采用 MIT 开源，公开测试版网站为 [wedraft.xiaoha.org](https://wedraft.xiaoha.org)。站点提供安装资源，本地 stdio MCP 在用户电脑运行，并非远程 HTTP MCP 服务。本地预览中的 `127.0.0.1` 地址只能由同一台电脑访问，不能交给云端 AI。验证状态与限制见[首发记录](releases/web-0.1.0.md)。

## 一次接入

在「接入 AI」页面选择“自动排版”，复制接入指令交给本机 AI，或展开终端选项复制一条命令。当前命令支持 macOS / Linux，并自动登记 Codex。地址由当前站点生成；正式网站的安装命令为：

```sh
curl -fsSL 'https://wedraft.xiaoha.org/integrations/install.sh' | sh -s -- 'https://wedraft.xiaoha.org/integrations/'
```

也可以告诉本机 AI：“读取 https://wedraft.xiaoha.org/connect.md，帮我接入 WeDraft，然后为这篇文章排版。”AI 仍须有执行本机命令和修改配置的权限。

安装器完成：

- 获取并校验自包含 CLI / MCP；运行时不依赖源码或 `node_modules`。
- 优先使用本机 Node 22.12+。没有时，从 Node 官方站点下载、校验并准备专供 WeDraft 的 Node 24；不使用 sudo、不更改系统 Node。
- 将工具放入 `~/.local/share/wedraft/`，Skill 放入 `~/.agents/skills/format-with-wedraft/`。
- 在 `~/.codex/config.toml` 登记 `wedraft` MCP；保留其他配置，修改前备份原文件。
- 使用 `~/Documents/WeDraft Exports/` 保存新导出文件。已有导出不会覆盖。

重复运行不会重复添加 MCP。遇到同名的其他工具、已有 Skill 或本地改动时会停止并保留它们。安装文件带 SHA-256 完整性校验；站点本身仍须可信。

完成后可以立即使用打印出的 CLI 命令。正在运行的对话如果没有刷新工具列表，可先直接调用 CLI，或重新打开对话加载 MCP / Skill。其他支持 stdio 的客户端可使用安装目录内 `mcp-client.json` 的 `command` / `args`；本次自动配置仅适配 Codex。

## 查看版本、升级与卸载

安装完成后会打印 `Manage` 命令。默认目录下可以直接运行：

```sh
sh "$HOME/.local/share/wedraft/manage.sh" status
sh "$HOME/.local/share/wedraft/manage.sh" upgrade
sh "$HOME/.local/share/wedraft/manage.sh" uninstall
```

三个命令分别执行检查、升级、卸载，不要一次全部执行。自定义安装目录时，使用安装器打印出的路径。管理入口会使用原来记录的 Skill、Codex 配置和导出目录，无需再次填写；它不会根据当前工作目录猜测这些位置。

`status` **离线、只读**，输出 JSON：`release.version` 是工具版本，`release.sourceCommit` 是构建源码提交，`release.sourceDirty` 表示构建时源码是否有未提交修改。线上版本为 `0.1.0`，当前源码准备 `0.1.1`；同版本的不同提交也可以据此区分。源代码压缩包缺少 Git 信息时提交显示为 `null`，不会伪造版本来源。`issues` 会列出已修改、缺失的安装文件或 MCP 配置；有提示时先处理提示，不要直接删除记录来绕过保护。安装元数据保存在工具和 Skill 目录的 `.wedraft-install.json` 中。

`upgrade` 从**安装时记录的网站地址**重新获取当前安装资源，验证 SHA-256、试运行 CLI/MCP，然后更新工具、Skill 和版本记录；正常情况下其他 MCP 配置与导出文件不变。也可以重新运行原安装命令，保留原来的自定义路径。它不会自行查找或升级到未发布的 npm 包，也不按 `0.1.0` 字符串判断是否已有新提交。如果需要明确更换可信下载来源，可使用 `upgrade --base-url 'https://另一个可信站点/integrations/'`。曾从临时 `localhost` 安装时，原服务必须可访问，或由你明确指定正式来源。

升级前建议结束正在排版的任务；升级后重新打开 AI 对话，使宿主重新启动 MCP 并加载 Skill。CLI 可以立即使用。工具、Skill 或自管 MCP 段被手工修改时，操作会停止并保留现有内容。先把自己的改动保存在安装目录外，再决定恢复原版后升级，或继续使用现有版本；没有自动覆盖本地修改的 `--force` 选项。

`uninstall` 会先核对所有权和文件哈希，再移除 WeDraft 管理的文件及 Codex 中带标记的 WeDraft MCP 段。配置改动前会生成 `.wedraft-backup-*` 备份。**导出文章、其他 MCP、配置备份、用户额外添加的文件均保留**；目录中还有额外文件时保留目录。安装文件或管理段被修改时停止整个卸载；不会删掉整棵目录。不要把恢复整个旧配置备份当成日常卸载方式，那可能覆盖后来添加的其他 MCP。已经运行的 MCP 进程由宿主管理，卸载不会强制结束进程，完成后请重新打开宿主对话。

旧版安装没有 `manage.sh`、版本或路径记录时，先重跑原安装命令并沿用原有自定义路径，安装器在确认文件未被修改后补齐管理记录。缺少旧路径时先从原 Skill 的 CLI 命令和 Codex `wedraft` 配置确认，不要直接猜测。新管理器遇到不支持管理协议的旧下载来源会停止，保留现有安装。

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

Node / pnpm 版本见 `.node-version` 和根 `package.json`。CLI 和 MCP 构建产物均已打包内部 TypeScript、模板和运行依赖，可直接由 Node 22.12+ 执行。`pnpm build:web` 同时生成站点的安装资源和 `connect.md`，开发服务器也提供同样入口；没有依赖未发布的 npm 包。

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

安装测试使用明确的临时安装目录、Skill 目录、配置文件和导出目录，不修改开发者真实用户配置。覆盖真实 shell 安装、离开源码目录后的 CLI、MCP 初始化与工具发现、私有 runtime、重复安装、原配置备份、冲突保护、下载完整性校验，以及离线版本检查、升级、卸载和额外文件/导出保护。测试命令：`pnpm --filter @wedraft/cli test`。

安装器的 `--install-dir`、`--skill-dir`、`--config-file`、`--output-dir` 支持显式路径。`install.sh` 会把这些参数转交给安装器。联网和本机客户端的权限弹窗由运行环境决定；不会承诺绕过权限或让云端工具访问 localhost。当前未覆盖 Windows 自动安装，也未把本地 MCP 描述为可粘贴的远程 MCP URL。
