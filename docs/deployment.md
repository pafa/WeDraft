# 网页与 AI 部署

公开测试版网站为 **https://wedraft.xiaoha.org**，现有 **https://github.com/pafa/WeDraft** 已采用 [MIT](../LICENSE) 开源。工具集版本 `0.1.0`；线上当前源码以 [release.json](https://wedraft.xiaoha.org/release.json) 的完整 `commit` 为准，不能由本地分支或工具版本号推断。首次部署历史见[首发记录](releases/web-0.1.0.md)。真实微信环境尚未验收。

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
| `deploy-site/`、`wrangler.jsonc`、`deploy.tar.gz` | 可直接审阅的 Cloudflare 静态部署产物、配置及归档；不含账号或凭据。 |
| `deploy-files.json` | 部署文件与配置的 SHA-256，包含 `_headers`。 |
| `source.tar.gz` | 该提交的已跟踪源码快照，不包含 `.git` 历史、工作区私稿或忽略文件。不是另一套公开仓库。 |
| `candidate.json`、`site/release.json` | 版本、完整源 SHA、目标域名、构建时间及审阅状态。 |
| `site-files.json`、`source-files.json` | 产物哈希与源码文件清单，供逐项审阅。 |
| `SHA256SUMS` | 文件与归档校验和；在候选目录运行 `shasum -a 256 -c SHA256SUMS`。 |

源码快照中仍包含维护文档和历史基线说明，不能用它代替现有仓库的历史公开审查。脚本生成成功也不代表安全、许可或真机验收已经完成。

## Cloudflare 配置与部署

源码中的 [`deployment/cloudflare/wrangler.template.json`](../deployment/cloudflare/wrangler.template.json) 和 [`_headers`](../deployment/cloudflare/_headers) 是托管配置来源。候选脚本根据 `deployment/web.json` 的站点生成自定义域名路由；Fork 项目部署前先修改自己的站点地址和模板中的 Worker 名称。账号通过 `CLOUDFLARE_ACCOUNT_ID` 提供，认证通过 Wrangler 登录或本机环境变量提供，均不写进源码或候选。

使用 Wrangler 4（本流程验证版本 `4.127.1`）。以下命令在**候选目录**运行，先核对配置、域名和全部校验和：

```sh
shasum -a 256 -c SHA256SUMS
pnpm dlx wrangler@4.127.1 deploy --config wrangler.jsonc --dry-run
```

Dry run 只验证打包配置，不证明域名权限、HTTPS 或线上行为正确。维护者批准明确候选 SHA、站点和发布范围后才执行实际部署：

```sh
pnpm dlx wrangler@4.127.1 deploy --config wrangler.jsonc
```

配置关闭 `workers.dev`、预览 URL 与 observability，只部署静态文件。`html_handling: auto-trailing-slash` 保证 `/` 可用，`not_found_handling: none` 保证安装资源不存在时返回 404。响应头使用 `no-transform`，避免区域级分析注入；不能移除后仍声称线上内容与候选字节一致。Cloudflare 配置行为参考[静态响应头](https://developers.cloudflare.com/workers/static-assets/headers/)与 [HTML 路由](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)。

## 站点部署要求

由 Cloudflare Workers Static Assets 在域名根目录提供构建产物（`deploy-site/`，在原始 `site/` 上仅增加托管响应头 `_headers`），无应用后台，用户无需注册账号，也不需要数据库或模型 API Key。每次发布的 Cloudflare Version ID 与源 SHA 单独记录在本地候选目录，避免文档中的旧 ID 被误认为当前线上版本。发布验收需核对正式域名 TLS、资源与完整源 SHA，不能把本机 HTTP 成功当作 HTTPS 验收。

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

1. 核对 MIT LICENSE、第三方许可与安装资源均随候选保留，发布目录不含私人数据或凭据。
2. 完成标准验证和本次改动涉及的浏览器、安装与 AI 调用验收，记录真机微信等未覆盖项。
3. 维护者批准 PR 后合入 main，在干净的合并提交重新构建并核对候选，单独取得部署授权。
4. 保存本次源 SHA、Cloudflare Version ID、验收报告和可回退的上一版本。网站部署不等于软件 Release、标签或 Mac App 更新。

## 公网验收与回退

在仓库目录执行参数化验收；指定的候选应为本次实际部署产物：

```sh
node scripts/check-web-deployment.mjs artifacts/web-release/<版本>-<提交> https://wedraft.xiaoha.org artifacts/web-release/<版本>-<提交>/production-assets.json
```

脚本校验每个资源的字节数、SHA-256、关键 MIME、缓存策略、根页面内容和缺失文件 404；报告不覆盖已有文件。仅本地回归允许 loopback HTTP，公网必须 HTTPS。报告中的源码 SHA 来自候选 `release.json`，线上该文件也必须通过哈希比对。检查失败应保留记录并排查，不绕过 TLS 校验。

从正式域名重新检查示例编辑、模板偏好、AI 两条流程、文章包导入/导出和正文复制；使用隔离用户目录运行正式安装命令，核对 manifest、私有 Node、CLI 和真实 MCP 输出。最后确认站点 `release.json` 的完整 SHA。

保留每个已发布候选及校验和。回退时恢复同一旧候选的整套站点和安装资源，不改旧标签、不删除用户浏览器数据；工具安装器仍保留用户配置与本地编辑冲突保护。当前没有承诺自动降级已安装工具。
