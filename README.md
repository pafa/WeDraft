<p align="center">
  <img src="apps/desktop/src-tauri/icons/128x128@2x.png" width="88" height="88" alt="WeDraft 应用图标">
</p>

# WeDraft

**在 Mac 上整理文章，一键复制成适合微信公众号的排版。**

WeDraft 是面向个人作者与编辑的本地排版应用。把 Markdown 或纯文本粘贴进来，调整章节、图片和引用，边编辑边预览，再将正文复制到公众号后台。文章由你掌握，排版交给模板。

当前版本：`1.1.2`

更新日期：`2026.08.26`

**Apple Silicon macOS · 本地存储 · 两套排版模板 · 私有源码备份**

[使用指南](docs/user-guide.md) · [默认模板规范](docs/next-edition-guidelines.md) · [版本记录](CHANGELOG.md) · [开发与维护](docs/git-workflow.md)

![WeDraft 编辑与预览界面：左侧 Markdown，右侧小哈公社New 排版](docs/images/editor-overview.png)

*当前源码的 Web 预览截图，使用应用内置组件样稿。原生图片缓存、文章导出与 macOS 剪贴板在桌面 App 中使用。*

## 一篇文章的工作流程

1. **输入**：第一行写文章标题，第二行起写正文，或直接粘贴完整稿件。
2. **排版**：用工具栏处理章节、粗体、引用、列表、代码和图片，切换模板查看效果。
3. **检查**：在网页版、iPhone、Android 三种视口预览；复制前按提示处理图片、表格和来源等问题。
4. **复制**：点击“复制排版”，再打开公众号后台粘贴正文。标题单独填写，最终发布由你在微信后台完成。

## 主要能力

| 能力 | 实际使用方式 |
| --- | --- |
| 实时编辑与预览 | 左侧 Markdown 与右侧排版同步更新，支持内容块定位、双向滚动和文章缩略导航。 |
| 预览内文字微调 | 在右侧修正标题、正文、引用、列表、表格单元格等文字，修改写回对应 Markdown，并进入撤回历史。 |
| 两套长文模板 | “小哈公社New”为默认模板，另保留“小哈公社”；切换模板不修改原文。 |
| 本地正文图片 | 添加 JPG、PNG、WEBP、GIF，填写来源或选择无来源；静态大图在本机优化，GIF 保留动画。 |
| 复制前检查 | 定位到具体 Markdown 行；必须修正的问题会阻止复制，普通兼容性提醒可确认后继续。 |
| 富文本复制 | 同时写入 HTML 和纯文本，只复制正文，便于粘贴到公众号编辑器或普通文本框。 |
| 历史与导出 | 执行“复制排版”后进入本地历史；支持重新打开、删除、单篇 Markdown 导出与全部文章 ZIP 导出。 |
| 写作辅助规则 | 一键复制应用支持的 Markdown 规则，供你在外部 AI 工具中使用；应用不内置 AI 调用。 |

## 数据与使用边界

- 不需要微信 AppID、AppSecret、服务地址或任何公众号凭据，也不调用微信发布接口。
- 文章历史、设置和缓存图片存储在本机；不提供账号、云同步或内容上传服务。
- 普通编辑不等于已存入历史：**只有执行“复制排版”后文章才会进入历史**。重要原稿仍应自行保存。
- 本地图片复制时嵌入富文本；外部图片链接会访问其来源，粘贴后仍需在微信后台检查图片和排版。
- 导出保存 Markdown 文本；全部导出的 ZIP 不包含本地图片缓存，不能作为完整 App 数据备份。

详见[使用指南与常见问题](docs/user-guide.md)。

## 运行与构建

主要使用形态是 **Apple Silicon Mac 桌面应用**。本仓库只备份源码，不在 GitHub 提供安装包下载或自动发布。当前构建使用 ad-hoc 签名，未做 Developer ID 公证。

从源码运行需要 Node.js、pnpm、Rust 和 Xcode Command Line Tools。工具链版本分别以 `.node-version`、`package.json` 的 `packageManager` 和 `rust-toolchain.toml` 为准。

```bash
git clone https://github.com/pafa/WeDraft.git
cd WeDraft
pnpm install --frozen-lockfile
./scripts/setup-git
pnpm dev
```

常用命令：

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动 Tauri 桌面开发环境。 |
| `pnpm dev:web` | 查看浏览器中的编辑界面；不具备完整原生能力。 |
| `./scripts/verify` | 检查版本、入库文件、类型、测试和前端构建。 |
| `cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml` | 运行 Rust 原生测试。 |
| `pnpm build:mac` | 构建 `aarch64-apple-darwin` 的 `.app` 与 `.dmg`，不构建 Intel 版本。 |
| `./scripts/backup` | 上传当前已提交分支并核对远端 SHA；要求工作区干净。 |

安装包位置为 `<Cargo target 目录>/aarch64-apple-darwin/release/bundle/`。未设置 `CARGO_TARGET_DIR` 时，target 目录通常位于 `apps/desktop/src-tauri/target/`；以实际构建输出为准。

## 主线与文档

**`main` 是本项目唯一的维护主线。** 本地完成开发、检查和版本管理，GitHub 私有仓库承载 PR 审阅、合并和源码备份。新任务使用短期分支，所有合并通过 PR，注明变更和验证结果，获批后合入 `main`；不要求新增 Actions 或付费保护。

| 文档 | 内容 |
| --- | --- |
| [使用指南](docs/user-guide.md) | 从输入到复制、模板、图片、历史、导出和常见问题。 |
| [小哈公社New 规范](docs/next-edition-guidelines.md) | 默认模板的层级、间距、颜色和 Markdown 示例。 |
| [架构说明](docs/architecture.md) | 前端、原生层、渲染与数据边界。 |
| [共享组件准备](docs/shared-components.md) | Mac 组件边界和后续开源任务的复用入口。 |
| [验收清单](docs/acceptance-tests.md) | 编辑、复制、图片和历史等功能的验证步骤。 |
| [Git 与维护规则](docs/git-workflow.md) | 主线、任务分支、本地审阅、备份和版本发布。 |
| [版本记录](CHANGELOG.md) | 应用版本及后续变更记录。 |

源码备份不包含用户文章、缓存图片、密钥、安装包或未提交工作。页面说明与截图随实际功能变更维护，应用版本日期与文档整理日期分别记录。
