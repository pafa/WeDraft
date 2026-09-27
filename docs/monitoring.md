# Cloudflare 免费监控

本分支准备 Web/AI 0.2.0 监控候选；是否已上线，以 `release.json` 与部署记录为准。只使用 Cloudflare Workers Free、D1、Access 和已验证地址的免费邮件通道，不自动购买或升级。

## 采集与隐私

网页首次显示可选统计说明，默认不采集，只有点击「允许使用统计」才开始。选择保存在本机 localStorage；页面左下角随时关闭。关闭清空待发队列并取消请求，已接收数据按保留期清理。没有永久访客 ID，不跨设备或重开页面识别人。会话随机 ID 只在内存，闲置 30 分钟后换新。文章 ID 是统计专用随机值，不使用原文、文件名、文章包标识或内容哈希。

严格字段白名单在浏览器和 Worker 两端验证；未知字段直接拒绝。仅采集固定事件、顺序、结果、版本和特征区间：字数 0 / 1–499 / 500–1499 / 1500–2999 / 3000–5999 / 6000+，图片 0 / 1 / 2–5 / 6+，表格 0 / 1 / 2+，以及标题层级、列表、引用、代码块是否存在。正文、标题、作者、摘要、图片、链接、文件名和剪贴板原文不进入统计。IP 仅瞬时交给边缘限流，不写 D1，不做访客标识。Worker 不启用请求日志与自动追踪，不打印异常正文。

明细以服务器接收时间保留 30 天，每 5 分钟分批清理；删除积压时最多短暂延迟，查询窗口仍限定 30 天。汇总保留 365 天。D1 平台备份/Time Travel 的保留期与在线表删除不同。Cloudflare 作为基础设施仍处理网络请求信息。

## 回答哪些问题

- 访问编辑器、模板库、AI 接入页；导入、新建、查看问题、导出、帮助、移动端切换。
- 第一种内容输入：键入、纯文本粘贴、富文本粘贴、文件导入、工具栏或预览编辑。
- 排版工具及快捷键、是否实际改变内容、撤回/重做、预览区直接编辑、模板选择。
- 导入、图片准备、复制、导出、AI 接入指令复制的实际结果。
- 文章内容特征与同一会话内的操作顺序；不是屏幕录像。

样稿不算用户文章。键入和特征按文章去重，避免逐按键采集；短于防抖时间的操作可能没有特征快照。中途允许统计或闲置后继续编辑标为 partial，不纳入完整任务分母。页面刷新后无法关联此前会话，统计不是全部用户行为。

复制成功仅代表浏览器剪贴板调用完成，不代表粘贴或发布到微信。导出 `handed_off` 只代表已交给浏览器下载，不代表文件落盘或安装。任务表按北京时间分组，只将已观察满 24 小时并预留 15 分钟传输窗口的完整任务计入成熟分母；汇总每小时更新。复制与其他输出必须属于同一会话和同一文章；原始路径按客户端序号排列。

模板以 `listTemplates()` 顺序编号，版本随每条事件记录；当前发布不重排模板。最近会话列表只查看最近 5,000 条事件里的 30 个会话，单会话明细最多 200 条。数字未提供全量唯一访客、跨设备留存或绝对流失率。

MCP 当前为本地 stdio，不上传运行日志；网页复制接入指令不代表 MCP 安装或调用成功。当前没有公开 Mac 安装包，本期没有虚构的下载/安装事件。后续发布这些能力时再接实际结果事件。

## 本机验证与看板

```sh
pnpm install --frozen-lockfile
pnpm build:web
pnpm --filter @wedraft/monitor exec wrangler d1 migrations apply DB --local
pnpm --filter @wedraft/monitor dev
```

打开 `http://127.0.0.1:8787`，本机看板在 `/monitor`。localhost 仅在 `ENVIRONMENT=local` 可免 Access；生产环境拒绝无有效 JWT、错误 audience、issuer、过期签名或非允许邮箱。生产配置生成器固定 `ENVIRONMENT=production`，关闭 workers.dev 与预览 URL。

需要更新绑定时运行 `pnpm --filter @wedraft/monitor types`。类型文件由 Wrangler 生成。标准验证仍是 `./scripts/verify`；本期没有修改 Rust、Tauri 配置或打包行为。

## 免费预算与降级

项目保护阈值：5,000 条事件/北京时间日，150,000 条明细，350 MB 数据库。D1 事务内检查，重试按事件 ID 与 `(session,seq)` 去重；整批超过阈值回滚，不部分记账。每次 20 条以内、32 KiB 以内，同 IP 每 Cloudflare 节点每分钟 30 个采集请求。客户端队列最多 100 条，最多重试 3 次，15 分钟过期；429/503 暂停本页采集。刷新、撤回、断网和退出会造成统计缺口，无法用服务端数据精确还原丢失量。

公开采集接口无法证明发送者是真实用户，来源校验和限流不等于反作弊，数据不用于计费或安全判定。

这些阈值是本项目保护值，不是 Cloudflare 账单或账户剩余额度。Worker 免费请求、D1 读写/存储由账户内其他项目共同使用，恶意流量也可能耗尽免费请求。免费额度耗尽后采集失败，网站普通静态资源仍走资产服务；编辑与导出不等待采集。始终先确认账户保持 Workers Free；不自动启用 R2、Logpush、付费发送或第三方分析。

Cron 每 5 分钟检查实际 `/release.json` 可达性和数据库心跳；连续 3 次站点故障才报警；预算 70%/90%报警，状态恢复时通知。每个状态最多尝试 3 次；发送服务接受不等于收件人收到。自监控无法覆盖 Cloudflare 整体故障、Cron 本身停止或数据库完全耗尽，需要查看平台状态。没有宣称拥有外部独立探测。

## 部署准备与上线

1. 按仓库规则审阅 PR、批准精确 head，合入干净 main 后生成不可变候选。
2. 在 Workers Free 账户创建独立 `wedraft-monitoring` D1；不要使用其他产品数据库。建表命令只指向这个库。保持已有网站生产配置直到候选获准发布。
3. 若开通 Access：Zero Trust 选择 Free；为 `wedraft.xiaoha.org/monitor` 及所有子路径配置一个 self-hosted Access 应用，只允许管理员单一邮箱，禁止 Everyone/bypass。不要把 Access 套到整个网站。保留 `/api/telemetry/events` 为公共的同源白名单入口。若不接受账户开通条件，可先在本机配置显式设置 `dashboardMode: "disabled"`，删除或清空 `accessIssuer`、`accessAud`，仅上线采集与定时维护；所有看板页面和 API 继续返回 403，没有公开入口或备用密码。省略该选项时仍强制要求完整 Access 配置，不会因漏配自动关闭看板。
4. 管理员邮箱、account/database ID、Access team issuer/audience 存在忽略的 `artifacts/monitoring/setup.json`；不能提交到公开仓库。
5. 邮件只发到同一已验证收件人，绑定固定 `destination_address`。发件域需已有 Email Routing 配置。不要为监控擅自替换网站域名的 MX、启用付费任意收件人通道；未就绪时保留告警状态但不发送。只有 `emailVerified: true` 且提供 `alertFrom` 才生成邮件绑定；否则发件人保持空值，不需要为部署开通邮件服务。
6. `WEDRAFT_MONITOR_CONFIG=/绝对路径/setup.json node scripts/prepare-web-release.mjs` 将 Worker、迁移和配置封装到同一个版本目录，沿用 SHA256、源码包、部署包与回退记录。缺少已验证免费套餐标记、D1、管理员邮箱或所选模式的必要配置时拒绝生成。普通不带配置的命令仍生成静态候选。
7. 对具体候选与影响范围取得生产批准，再使用该目录配置迁移 D1 并部署。验证真实浏览器同意/撤回、粘贴与工具栏路径、重复事件不增计数。Access 模式验证匿名登录、允许邮箱可见和拒绝其他邮箱；关闭模式验证所有看板页面/API 均返回 403。邮件配置完成后才验收故障与恢复通知；未配置时验证告警状态但不得宣称邮件可用。不能把本地模拟当线上验收。
8. 回退使用上一个保留的静态网站候选，并移除本期 Cron；数据仍保留，不随代码回退删除。立即停采可把 `ENABLED` 改为 `false`。若静态回退，网页无采集代码，数据库无需破坏性回滚。

首次开通 Access Free 可能出现服务条款与超额扣款授权；这不是代码可以绕过的步骤，必须由账户所有者决定，不能从“先免费使用”推定同意自动扣款。

`dashboardMode: "disabled"` 是分阶段部署：不购买或开通 Zero Trust，用户同意后的统计仍写入独立 D1；线上无法查看私有看板，邮件未配置时也没有邮件告警。运维人员可在既有 Cloudflare 账户权限下查看该 D1，不能把本机测试看板当作线上数据。后续启用看板需要另行配置 Access 和部署，关闭模式不会自动开通服务或升级套餐。

配置文件内的邮箱只用于 Worker 环境和受保护的监控服务，不出现在静态网站产物。发布包属于本机私有运维资产，不上传公共仓库。

官方资料（实施时核对）：[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)、[D1 定价](https://developers.cloudflare.com/d1/platform/pricing/)、[邮件免费已验证收件人](https://developers.cloudflare.com/email-service/platform/pricing/)、[Access JWT 验证](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)。
