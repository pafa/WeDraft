# 网页与 AI 初版验收记录

历史记录：2026-09-19，PR #3（合并提交 `9d3dcd8edc211d530b2689df610adca4e219007c`）及其前序候选的开发验收。工具集 0.1.0，Mac 基线 1.1.2。下列结果保留当时检查范围，不代表之后的提交重新通过相同检查；后续公开与上线见[首发记录](releases/web-0.1.0.md)，当前覆盖范围见[验收矩阵](acceptance-tests.md)。

## 实际通过

- `./scripts/verify`：仓库约束、类型检查、216 项测试、Mac 前端构建、独立网页静态构建、CLI / MCP 构建。
- 核心与文章包：原稿、CRLF 与显式 BOM 保留，图片与元数据往返，正文 HTML 与纯文本，未知版本/模板、缺图、越界路径、不支持语法和无效 UTF-8 的错误路径。
- CLI：实际写出预览、文章包和报告，拒绝覆盖已有目录，显式图片根目录与越界符号链接检查。
- MCP：官方 SDK 客户端连接真实 stdio 子进程，发现工具、校验输入、渲染与导出；默认无写文件工具，配置目录后才能导出。
- `node scripts/smoke-web.mjs`：真实 Chrome，MCP 生成含图片的文章包 → 网页导入 → 编辑/撤回/重做 → 预览微调写回 → 添加图片来源 → 切模板 → 导出。
- 同一脚本也针对构建后的静态网页运行：真实 HTML + 纯文本剪贴板、浏览器 contenteditable 粘贴、刷新清空、模板 Cookie 保留、旧 IndexedDB 数据不被读取或更改、错误导入不覆盖原稿、缺图阻止复制、文章包重新打开。
- 1440×1000、390×844、320×740 的编辑器、模板库和 AI 页面已实际检查。手机屏幕固定逻辑尺寸，完整机身等比缩放并支持 100%；状态栏在窄屏保留。中性本地图片样稿没有页面、控制台错误或站外请求。
- 新版 `smoke-web` 的 19 项真实端到端检查通过：含图灰色示例点击即开始输入、新建空白、七模板与 Cookie 一年、跨标签默认值与导入文章包的模板隔离、返回首页恢复含图示例、第八格贡献卡片直接说明、320–2560px 快捷栏按实测宽度整体切换图标、全部按钮最多两行且无内部滚动、字数独立在底栏、设备切换后预览编辑写回；固定顶栏及从模板库、AI 页面新建与导入。
- 一键安装在隔离目录验证：真实 shell 下载与安装、自包含 CLI/MCP、实际 MCP 导出文章包与 CLI 正文一致、内置示例、配置备份、重复安装、冲突和完整性失败路径。测试没有触碰真实用户的 Skill 或 Codex 配置。
- 此前样式候选的定向检查通过：22 个可编辑节点非悬停时无轮廓；模板弹窗关闭、Escape 与焦点恢复；剪贴板 API 不可用时有反馈且无页面异常。
- 配套 Skill 使用官方 `quick_validate.py` 验证通过。

本轮快捷栏进一步调整记录在 `/private/tmp/wedraft-toolbar-v2-verify.log`、`/private/tmp/wedraft-toolbar-v2-qa/`。此前快捷栏、首页示例和模板贡献卡片检查记录在 `/private/tmp/wedraft-toolbar-verify.log`、`/private/tmp/wedraft-toolbar-home-qa/`。共享组件整合检查记录在 `/private/tmp/wedraft-pr3-integration-verify.log`、`/private/tmp/wedraft-pr3-integration-qa/`，AI 可复制预览验证在 `/private/tmp/wedraft-ai-copy-qa-20260919/`，无 Node 冷启动记录在 `/private/tmp/wedraft-cold-start.EqvRXh/report.json`。此前测试证据在 `/private/tmp/wedraft-typography-20260919/verify.log`、`qa-static/` 和 `/private/tmp/wedraft-web-styles-qa/`；早期候选记录仍保留在忽略目录 `artifacts/web-ai-first-version/`。不将测试导出的文章包作为源码上传。README 使用内置中性样稿的真实截图。

## 明确边界

- 当时尚未合并、公开或部署；后续已通过 PR 合并并公开上线。此轮检查未发布 npm 包或安装全局 Skill / MCP。
- 没有更改 Rust、Tauri 配置、签名或包装行为；没有重建 Mac 原生安装包，也没有替换已安装 App。
- 未实测微信后台、Safari / Firefox、全部 AI 客户端或实际手机硬件。浏览器粘贴成功不能替代微信验收。
- macOS Apple Silicon 的无 Node 冷启动已完成：从官方源下载 Node 24.21.0、核对 SHA-256，在隔离目录安装并实际执行 CLI 与 MCP 导出。未实测 Linux 冷启动。
- MCP 使用真实协议客户端验收，不宣称已经验证模型在所有宿主中的自动工具选择。
- 静态构建有单 JS chunk 超过 500 kB 的体积提示（压缩传输约 225 kB）；构建成功，首版尚未做代码拆分。
- 图片保留原字节，含图工具结果可能较大；优先使用 CLI 文件输入和文章包导出。网页只在页面内存中暂存，保留结果需导出文件。

## 可复现方式

```sh
pnpm install --frozen-lockfile
./scripts/verify
pnpm smoke:web
```

浏览器验收脚本需要本机 Chrome。它使用临时目录和隔离浏览器上下文，启动本地 1435 端口并在结束时关闭；不会读取真实草稿或公众号账号。如需验证自己的已启动构建预览，传入 `WEDRAFT_WEB_URL=http://127.0.0.1:1433/`；可用 `WEDRAFT_EVIDENCE_DIR` 指定临时证据目录，默认位于系统临时目录的 `wedraft-web-evidence/`。

早期初版的额外源码安装检查（本轮界面改版之前）：曾将候选源码复制到独立临时目录，使用锁文件和 pnpm 缓存进行离线安装，成功构建网页、CLI 与 MCP；这验证了源码树的完整性，没有模拟一次全新联网下载。首次安装时 CLI 尚未构建，会出现其内部 bin 链接缺失提示；构建后按文档使用 Node 绝对路径运行，模板查询与真实 MCP 测试通过。
