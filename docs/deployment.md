# 网页与 AI 首次发布

公开测试版网站为 **https://wedraft.xiaoha.org**，现有 **https://github.com/pafa/WeDraft** 已采用 [MIT](../LICENSE) 开源。工具集版本 `0.1.0`，部署源码为 `b00fee0cf6288b3dcbab094d5da3f89ab1ffde95`；部署与公网验收进度见[首发记录](releases/web-0.1.0.md)。真实微信环境尚未验收。

首发范围是网页、七款内置模板、CLI、本地 MCP 与 Skill。Mac 仍保留 1.1.2 基线，不包含本次重新打包、签名或公证。

## 本地发布候选

在同一任务分支完成修改、`./scripts/verify` 与相关浏览器验收，审阅并提交。然后在干净工作区运行：

```sh
mkdir -p artifacts/web-release
node scripts/prepare-web-release.mjs
```

脚本重新构建网页，检查安装资源的版本与 SHA-256，然后在 `artifacts/web-release/<工具版本>-<提交>/` 创建新目录；已有目录不会覆盖。它不会提交、推送、合并、创建标签、改可见性或部署。

| 文件 | 用途 |
| --- | --- |
| `site/`、`site.tar.gz` | 静态站点与一键安装资源，来自同一源码提交。 |
| `source.tar.gz` | 该提交的已跟踪源码快照，不包含 `.git` 历史、工作区私稿或忽略文件。不是另一套公开仓库。 |
| `candidate.json`、`site/release.json` | 版本、完整源 SHA、目标域名、构建时间及审阅状态。 |
| `site-files.json`、`source-files.json` | 产物哈希与源码文件清单，供逐项审阅。 |
| `SHA256SUMS` | 文件与归档校验和；在候选目录运行 `shasum -a 256 -c SHA256SUMS`。 |

源码快照中仍包含维护文档和历史基线说明，不能用它代替现有仓库的历史公开审查。脚本生成成功也不代表安全、许可或真机验收已经完成。

## 站点部署要求

由 Cloudflare Workers Static Assets 在域名根目录提供构建产物（首发为 `deploy-site/`，在原始 `site/` 上仅增加托管响应头 `_headers`），无应用后台，不需要账号、数据库或模型 API Key。当前部署版本为 `9bcb94d4-a167-473e-9617-a0d9f84f0606`。发布验收需核对正式域名 TLS、资源与完整源 SHA，不能把本机 HTTP 成功当作 HTTPS 验收。

- `/`、`/#/templates`、`/#/ai` 使用同一入口。hash 路由不需要服务端路由重写。
- `/connect.md` 与 `/integrations/*` 必须返回真实文件；不存在的安装资源返回 404，不能兜底成 HTML。
- `index.html`、`connect.md`、`release.json` 与安装目录采用 `Cache-Control: no-cache`；带内容哈希的 `/assets/*` 可长缓存。一次更新原子替换整套产物，避免混用安装器与旧 manifest。
- `.mjs` 提供 JavaScript MIME，`.json` 为 JSON，`.md` / `.sh` / `.txt` 为纯文本。保留站点与安装目录中的第三方许可原文。
- 当前没有 service worker、遥测、文章服务或远程 HTTP MCP。不要把 `/integrations/` 描述为远程 MCP 地址。
- 文章仅在当前页面内存暂存，刷新或关闭清空；网页不提供文章库。Cookie 只记默认模板，需要保留原稿时先导出 `.wedraft.zip`。不会读取、删除或迁移旧候选的浏览器记录或 Mac 文章历史。
- 部署配置关闭 Workers observability，不主动启用 Workers 请求日志；站点响应使用 `no-transform` 阻止区域级分析脚本自动注入，不改变主站设置；Cloudflare 平台仍可能处理基础访问记录，不承诺零日志或未经核实的保留期限。远程图片仍请求来源网站，AI 客户端处理内容的方式由其自身设置决定。

正式网站提供以下安装命令；各平台验收范围见首发记录：

```sh
curl -fsSL 'https://wedraft.xiaoha.org/integrations/install.sh' | sh -s -- 'https://wedraft.xiaoha.org/integrations/'
```

## 发布核对清单

1. 核对已选定的 MIT LICENSE 与第三方原文随产物保留。本地临时附件和用户文章数据排除在发布之外，不继续做附件审查。
2. 复核目标仓库的全部可见分支、标签、可达历史、提交身份和工作流记录。用户选择了直接公开现有仓库，不能只审核当前分支，也不能未经授权改写或删除历史。
3. 确认安全问题的私密报告渠道，并据此更新 `SECURITY.md`；不要把敏感文章、凭据或漏洞细节发到公开 Issue。
4. 完成无 Node 安装、真实 AI 调用和真机微信验收，并记录不支持的客户端/平台。公开测试版可披露未覆盖项目，但不承诺未验证的 1:1 效果。
5. 维护者确认当前 PR 与候选 SHA 后通过 PR 合入 main；在合并后的确定 SHA 重建候选，核对无意外差异，再按批准范围公开仓库和部署站点。网站发布与创建软件 Release / 标签分别记录，不擅自替换 Mac App。

## 公网验收与回退

从正式域名重新检查示例编辑、模板偏好、AI 两条流程、文章包导入/导出和正文复制；使用隔离用户目录运行正式安装命令，核对 manifest、私有 Node、CLI 和真实 MCP 输出。最后确认站点 `release.json` 的完整 SHA。

保留每个已发布候选及校验和。回退时恢复同一旧候选的整套站点和安装资源，不改旧标签、不删除用户浏览器数据；工具安装器仍保留用户配置与本地编辑冲突保护。当前没有承诺自动降级已安装工具。
