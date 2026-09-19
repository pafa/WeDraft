# 生产依赖补丁核查 · 2026-09-19

本次仅更新兼容补丁和锁文件，不改变产品版本，也不表示已经部署。合并、部署状态以 PR 和网站 `release.json` 为准。

| 依赖 | 原版本 | 修复候选 | 入口 |
| --- | --- | --- | --- |
| fast-uri | 3.1.4 | 3.1.6 | MCP SDK → ajv |
| nanoid | 3.3.16 | 3.3.18 | sanitize-html → postcss |
| sanitize-html | 2.17.6 | 2.17.7 | 共享微信 HTML 渲染器 |
| fflate | 0.8.2 | 0.8.3 | 可编辑文章包 |

审计前 `pnpm audit --prod` 命中 8 条公告（6 high、2 moderate），其中 fast-uri 占 5 条。评级描述上游漏洞，不等于这些路径在 WeDraft 中可利用：

- sanitize-html 公告涉及显式允许 SVG 动画的配置；当前 `sanitizeWechatHtml` 不允许 `svg`、`animate`、`set`，仍升级补丁以降低依赖风险。[公告](https://github.com/advisories/GHSA-g8qq-57p8-ggw5)
- fflate 公告涉及 `unzipSync` 的 ZIP64 解析；产品文章包解析使用受限目录解析与 `Inflate`，没有调用该函数。测试中使用 `unzipSync` 检查中性导出包，不等同于产品接受不可信 ZIP64 的入口。[公告](https://github.com/advisories/GHSA-px8p-9vwx-vf98)
- fast-uri 与 nanoid 保持原有主版本范围，本次未宣称其上游攻击条件可由产品输入触发。[fast-uri 公告示例](https://github.com/advisories/GHSA-5jgf-p345-68v8)、[nanoid 公告](https://github.com/advisories/GHSA-2v37-7h3g-55p8)

补丁版本的依赖声明与现有依赖图兼容。普通 pnpm 更新在无关 Playwright 全量元数据请求上失败，因此使用 npm 官方 registry 的精确版本元数据定点更新锁文件的版本和真实 integrity，并用 `pnpm install --frozen-lockfile` 校验安装；没有关闭供应链策略或完整性验证，没有更换包管理器。

仓库最低 Node 要求同步为 `22.12.0`，与 sanitize-html 的已存在要求一致；推荐开发版本仍由 `.node-version` 指定。

后续每次依赖升级运行冻结安装、`pnpm audit --prod`、`./scripts/verify`，检查真实渲染、文章包导入导出及 CLI/MCP 交接。扫描未命中不等于没有未知漏洞；此记录不涵盖 Rust 依赖或操作系统组件。

本候选冻结安装与供应链检查通过，升级后 `pnpm audit --prod` 返回 0 条已知公告（187 个生产及可选依赖项）。完整仓库验证和实际浏览器结果以本 PR 验证记录为准。
