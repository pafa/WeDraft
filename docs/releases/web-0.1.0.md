# 网页与 AI 工具集 0.1.0 首次公开记录

发布日期：2026-09-19。公开测试版，不包含新的 Mac 安装包或 npm 包，也未创建软件 Release 或 Git 标签。

## 发布对象

- 网站：[wedraft.xiaoha.org](https://wedraft.xiaoha.org)
- 开源仓库：[pafa/WeDraft](https://github.com/pafa/WeDraft)，MIT；直接公开原仓库，没有重写或删除历史。
- 发布源码：`b00fee0cf6288b3dcbab094d5da3f89ab1ffde95`，来自维护者批准并合并的 PR #4。
- Cloudflare Worker：`wedraft`；唯一绑定域名 `wedraft.xiaoha.org`。
- 首发验收版本：`9bcb94d4-a167-473e-9617-a0d9f84f0606`。
- GitHub 私密漏洞报告已启用：[报告入口](https://github.com/pafa/WeDraft/security/advisories/new)。

## 验证与边界

在干净的已批准 main 上重新运行 `./scripts/verify`，248 项 JS/TS 测试、类型检查、仓库检查和构建通过。部署的产品代码与合并前已通过 9 项 Rust 测试及 Apple Silicon 构建的候选文件树一致；本次没有重新发行 Mac 软件。

公开前审查了 4 个远端分支、0 个标签、4 个 PR 引用、378 个历史文件对象及 PR/Issue 正文。未发现真实凭据、私人稿件、数据库或安装包；历史截图均为内置样稿，Actions 运行记录和 Releases 为空。此检查不是对未知格式秘密的绝对证明。

正式 HTTPS 证书和 `release.json` 源 SHA 已验证，22 个发布文件逐一校验哈希，首页返回 200，不存在的安装文件返回 404。Google 与 Cloudflare 公共 DoH 均已解析到站点；首发验收时本机解析器仍返回缓存的 NXDOMAIN，因此部分验收在独立进程中使用公共 DoH 返回地址，保留正式域名 SNI 和 TLS 校验，没有修改系统 DNS。

正式站点的 19 项 Chrome 流程回归通过：含图示例、七款模板、AI 两条流程和公网安装命令、真实富文本剪贴板、文章包进出、手机预览及 320–2560px 工具栏。无运行时错误或样稿触发的站外请求。测试脚本将本机提示断言改为公网安装命令断言，并为实际网络图片加载延长等待窗口。macOS Apple Silicon 的无 Node 冷安装通过：从正式网站下载安装器，从 Node 官方站全新下载并校验私有运行时，安装 Skill 与隔离 MCP 配置；实际 CLI 模板列表、文章导出和 MCP 握手/调用均通过，CLI/MCP 输出 HTML 一致，文章包保留原稿。验证未改动真实用户配置。

未完成真实微信后台、真实输入法全组合、Safari/Firefox 全流程、Linux 冷安装及全部 AI 宿主验收；公开测试版不承诺这些未覆盖场景。

## 托管配置与数据

采用 Cloudflare Workers Static Assets，无应用后台、账号、文章数据库或远程 HTTP MCP。`workers_dev`、`preview_urls`、`observability` 均关闭。网页内容仍在浏览器处理，外链图片可能请求来源网站；不承诺 Cloudflare 平台基础访问记录为零或未经核实的保留期限。

部署目录 `deploy-site/` 从原始 `site/` 完整复制，只额外添加 `_headers`。首页、安装资源与版本文件使用 `public, no-cache, no-transform`；带内容哈希的资源使用一年缓存并保留 `no-transform`。后者防止区域级自动分析脚本注入；已按浏览器 Accept 头验证最终 HTML 与原始文件相同且无该脚本。规则依据 [Cloudflare Web Analytics 文档](https://developers.cloudflare.com/web-analytics/get-started/)，未改变 xiaoha.org 主站设置。

资源路由使用 `html_handling: auto-trailing-slash`、`not_found_handling: none`，根目录映射 index.html，缺失安装文件不会返回 HTML。`.mjs`、`.sh`、`.md` 分别保留正确 MIME。

上线期间首个部署的根目录映射不正确，已修复；随后移除继承的区域级分析脚本注入。上面的首发验收版本是修复后的最终部署，早期版本不能作为回退目标。

## 本地证据与后续发布

完整产物、源码快照、校验和、部署配置和验收记录保存在忽略目录 `artifacts/web-release/0.1.0-b00fee0cf628/`，不包含用户文章。`site/` 保留原始构建，`deploy-site/` 为实际托管内容。公开 `release.json` 可以核验线上源 SHA。

后续发布继续从获批 main 生成新候选，保存新目录及部署版本，不覆盖旧产物。回退选择本次最终版本或之后已验收版本，整套恢复站点与安装资源；不删除用户本地数据，也不自动降级已安装工具。

## 2026-09-19 后续更新

PR #6 的滚动同步修复与 PR #7 的 README 更新合并后，维护者批准将 `c81ee8886c366e7c6b344c8b00ae48bcc20f6c30` 部署到同一站点。Cloudflare Version ID 为 `ad8fe68d-0532-403f-870d-ef5c9cf85fd5`，回退候选为上述首发验收版本。

标准仓库验证、线上 `release.json` 源 SHA、22 个资源哈希及根页面/404 检查通过；Chrome 中网页版、iPhone、Android 预览及窄屏双向顶部/底部滚动通过。记录位于本地 `artifacts/web-release/0.1.0-c81ee8886c36/`。这些是该次部署证据，后续线上状态以正式站点 `release.json` 与新部署记录为准；没有新增真实微信或其他平台验收结论。
