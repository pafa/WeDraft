# 编辑器共享组件

Mac 与 Web 共用编辑器组件，通过平台适配层处理图片和剪贴板。Mac 应用基线为 1.1.2，网页发布不迁移 Mac 数据。

## 可复用部分

`packages/editor-ui` 提供编辑器、预览、编辑状态、快捷格式、撤回重做、预览回写、双向定位、基础样式和 Markdown 规则说明。桌面原路径保留薄导出，现有调用和测试继续工作。

- `@wedraft/editor-ui/components/ArticleEditor`：通过 `prepareImage(file)` 接收平台图片处理结果；通过 `copyPlainText(text)` 接收复制规则说明的能力。
- `@wedraft/editor-ui/components/WechatPreview`：文章排版预览、模板选择和预览文字回写。
- `@wedraft/editor-ui/stores/editor-store`：页面编辑状态与撤回重做，不包含数据库或持久化逻辑。
- `@wedraft/editor-ui/services/*`：Markdown 操作、预览回写与滚动定位。
- `@wedraft/editor-ui/styles.css`：从现有 Mac 原样提取的基础样式。

已有 `article-model`、`article-parser`、`validation`、`wechat-renderer` 继续负责模型、解析、检查与渲染。两端共用基础排版与语法校验；持久化和文件访问由平台层负责。

## Mac 平台边界

`apps/desktop/src/components/ArticleEditor.tsx` 是图片与剪贴板适配层，保留现有图片缓存、压缩结果和提示。SQLite、文章历史、导出、系统剪贴板、应用标识和 Tauri 配置仍留在 desktop，使用现有实现。

共享组件不负责自动草稿、文章包、账号、云端存储或数据库迁移。Mac 与 Web 的文章体系可以不同，不需要互通。

## Web 接入

网页直接依赖 `@wedraft/editor-ui`，使用浏览器图片处理与剪贴板。固定设备预览、紧凑工具栏等网页能力通过可选参数接入；Mac 继续走原有平台适配层，默认行为保持不变。

## 验证

运行 `./scripts/verify` 检查现有编辑、预览、快捷操作、撤回、复制及前端构建。涉及 Rust、Tauri 或打包配置时还需原生测试与 Mac 构建，见[贡献指南](../CONTRIBUTING.md)。
