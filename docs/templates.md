# 模板目录与贡献约定

模板是一份数据驱动的排版配置。编辑器、CLI 和 MCP 共用 `packages/wechat-renderer` 的 `availableTemplates`，网页模板库通过 core 的 `listTemplates()` 获取展示信息，不维护第二份名单。

## 当前目录

| ID | 名称 | 风格 |
| --- | --- | --- |
| `default-business` | 小哈公社 | 经典暖色 |
| `next-edition` | 小哈公社New | 清爽绿调，未设置偏好时的默认值 |
| `plain-paper` | 素笺 | 暖灰留白 |
| `ink-journal` | 墨刊 | 黑白刊物 |
| `jade-notes` | 青岚 | 松青书页 |
| `blueprint` | 蓝图 | 理性蓝调 |
| `cinnabar` | 朱砂 | 砖红篇章 |

五款阅读模板接回自已有设计任务 `codex/feat/five-reading-themes` 的 `templates/reading-editions.ts`，保留其原名称、样式及兼容性测试。原任务的其他桌面功能与文档没有一并迁入。

## 增加模板

1. 在 `templates/` 添加配置，以 `packages/shared-types/src/index.ts` 中的 `layoutTemplateSchema` 为准。JSON 配置或返回 `LayoutTemplate` 的 TypeScript 配置均可；提供稳定、唯一的 `id`、`name`、`description`、`accentColor`。
2. 为正文、标题、引用、图片说明、列表、代码、表格和参考来源提供内联样式。可选字段（如章节编号、引号、参考来源编号）用于细化结构，不以改写原文获得效果。
3. 在 renderer 的 `availableTemplates` 登记。无需修改网页卡片、CLI 或 MCP。新增模板不能改变已有 ID 的含义；不兼容变化需要新的版本方案并保留旧文章读取路径。
4. 用同一篇中性样稿展示完整效果，加入渲染测试：内容、链接和图片来源保留，章节编号无重复，危险 HTML/CSS 被过滤，旧模板输出不变。执行 `./scripts/verify` 并完成浏览器与微信实际粘贴检查，分别记录验证边界。

模板只能使用受支持的内联样式，不引入远程脚本、字体或遥测。网页预览不能当成真机微信兼容性证明。当前随源码版本一起审阅和分发，不从任意外部地址执行模板代码。

## 后续开源管理

仓库目前仍为私有备份，没有公开投稿入口或授权声明。公开后可由贡献者提交 GitHub PR，附模板文件、效果图、作者和许可信息；维护者检查内容保真、样式安全及实际预览后登记。模板库会随批准的版本增长，不需要在首页增加切换按钮。
