# Mac 共享组件准备

这次仅整理现有 Mac 代码，保留排版、模板切换、本地图片、复制和历史的现有工作方式。应用版本仍为 1.1.2，没有软件发行、数据迁移或线上适配。

## 可复用部分

`packages/editor-ui` 提供编辑器、预览、编辑状态、快捷格式、撤回重做、预览回写、双向定位、基础样式和 Markdown 规则说明。桌面原路径保留薄导出，现有调用和测试继续工作。

- `@wedraft/editor-ui/components/ArticleEditor`：通过 `prepareImage(file)` 接收平台图片处理结果；通过 `copyPlainText(text)` 接收复制规则说明的能力。
- `@wedraft/editor-ui/components/WechatPreview`：文章排版预览、模板选择和预览文字回写。
- `@wedraft/editor-ui/stores/editor-store`：页面编辑状态与撤回重做，不包含数据库或持久化逻辑。
- `@wedraft/editor-ui/services/*`：Markdown 操作、预览回写与滚动定位。
- `@wedraft/editor-ui/styles.css`：从现有 Mac 原样提取的基础样式。

已有 `article-model`、`article-parser`、`validation`、`wechat-renderer` 继续负责模型、解析、检查与渲染。本次不替换 Mac 排版调用链，不引入 Web 新的检查策略。

## Mac 平台边界

`apps/desktop/src/components/ArticleEditor.tsx` 是图片与剪贴板适配层，保留现有图片缓存、压缩结果和提示。SQLite、文章历史、导出、系统剪贴板、应用标识和 Tauri 配置仍留在 desktop，使用现有实现。

这次不增加自动草稿体系、跨端文章包、账号、云端存储或数据库迁移。Mac 与 Web 的文章体系可以不同，不需要互通。

## 后续交接

开源版的 Web 接入、独立存储、许可证整合和最终发布由“开源版”任务处理。该任务可在自己的当前代码上复用这个组件包；不要用旧候选覆盖它的新改动。

此前较大范围的试作保留在 `codex/feat/macos-open-source`，不是本次 Mac 准备候选，也不作为合并依据。用户的本地临时附件不需要核对，不纳入公开发布范围。本任务不继续处理开源进度或发行事项。

## 验证

运行 `./scripts/verify` 检查现有编辑、预览、快捷操作、撤回、复制及前端构建。此分支不改 Rust、Tauri 或打包配置，因此不新增安装包构建和发行验收任务。
