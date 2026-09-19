# 模板目录与贡献指南

模板是一份数据驱动的排版配置。编辑器、CLI 和 MCP 共用 `packages/wechat-renderer` 的 `availableTemplates`，网页模板库通过 core 的 `listTemplates()` 获取展示信息，不维护第二份名单。

模板库独立展示所有已登记模板。用户选择一款后，网页将其应用于当前文章，并用 Cookie 记住默认选择；导入文章包时保留该文章自己的模板。文章仅在当前页面内存保留，刷新或关闭后清空。

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

## 从现有模板开始

按 [贡献说明](../CONTRIBUTING.md) 准备源码与任务分支。在 `templates/` 新建配置，以 [`layoutTemplateSchema`](../packages/shared-types/src/index.ts) 为准。JSON 或返回 `LayoutTemplate` 的 TypeScript 配置均可。

下面是一个完整继承青岚基础样式的起点，可保存为 `templates/my-reading.ts`。请换成自己的稳定 ID、名称、简介和完整设计；不要仅改名称就提交为新作品。

```ts
import type { LayoutTemplate } from "../packages/shared-types/src/index.js";
import { readingEditionTemplates } from "./reading-editions.js";

const base = readingEditionTemplates.find((template) => template.id === "jade-notes");
if (!base) throw new Error("缺少基础阅读模板");

export const myReadingTemplate: LayoutTemplate = {
  ...base,
  id: "my-reading",
  name: "我的阅读模板",
  description: "用一句话说明排版气质与适用的文章类型",
  accentColor: "#61567B",
  heading2: { ...base.heading2, color: "#61567B" },
  heading3: { ...base.heading3, color: "#61567B" },
  link: { ...base.link, color: "#61567B" },
};
```

此例只改了三个区块的颜色；引号、编号、表格等仍继承原风格，完善设计时需要一并检查。用对象展开创建新配置，不直接修改被其他模板引用的样式对象。

在 [`packages/wechat-renderer/src/index.ts`](../packages/wechat-renderer/src/index.ts) 中导入并追加注册项，保留原有项目：

```ts
import { myReadingTemplate } from "../../../templates/my-reading.js";

// 在现有 availableTemplates 数组末尾追加：
layoutTemplateSchema.parse(myReadingTemplate),
```

注册后，网页模板库、CLI `templates` 和 MCP `list_templates` 会从同一个目录读取新模板。无需增加首页按钮，也无需改动这三个入口的实现。当前模板随源码构建分发，不支持将任意外部 URL 或脚本直接安装进网页。

## 配置与兼容性

- 提供稳定唯一的 `id`、显示名称 `name`、简介 `description` 和用于模板卡片的 `accentColor`。建议 ID 使用小写英文与连字符；已有 ID 不重命名、不复用。
- 配齐正文、二三级标题、引用、图片及来源说明、链接、强调、列表、说明、代码、表格和参考资料样式。可选的 `headingNumber` / `headingText`、`quoteMark`、`referenceNumber` 等字段可细化呈现。
- 样式是内联 CSS。属性必须经过 renderer 的 `sanitizeWechatHtml()` 允许范围；仅通过 schema 不代表样式会保留或在微信中生效。不支持的属性可能被过滤。
- 不增加网络请求、远程脚本或字体、跟踪代码、固定推广内容。模板不得改写正文、替换链接、移除图片来源或自动添加参考资料。
- 模板 ID 写入文章包，当前目录版本由 core 的 `TEMPLATE_VERSION` 统一表示。给模板随意添加 `version` 字段不会建立版本兼容机制；破坏已有文章外观或格式的修改，应先讨论版本与旧文章读取方案。
- 如确实需要新的渲染结构，单独说明需求并补充解析、复制、直接微调和内容块映射验证；不要为一款模板绕过清洗或改动原稿。

## 自测与提交

先在 `packages/wechat-renderer/tests/` 为新模板增加行为检查，可参考 `reading-editions.test.ts` 中的中性完整样稿。模板目录的数量与名称目前还有显式断言：检查 `renderer.test.ts`、`reading-editions.test.ts` 和 `scripts/smoke-web.mjs`，按实际新增模板更新目录预期，保留既有五款的视觉约束及两款旧模板的输出兼容断言。

```sh
pnpm --filter @wedraft/wechat-renderer test
pnpm --filter @wedraft/core test
pnpm dev:web
```

在模板库打开完整预览、设为默认，再回到编辑页检查。使用同一篇中性样稿比较全部区块，至少检查桌面和 320px 窄屏；固定比例手机模拟器只验证浏览器呈现。导出文章包再导入，确认原文、链接、图片来源和模板 ID 保留。

交付前执行 `./scripts/verify`。模板或网页交互有变化时，再按贡献说明运行 `pnpm build:tools` 和 `pnpm smoke:web`；自动化会真实操作剪贴板，不要与其他复制测试并行。最后在实际微信环境检查粘贴结果；无法完成时写明“微信未验证”，让维护者补验后决定是否接收。

| 检查点 | 审阅要看到的证据 |
| --- | --- |
| 内容保真 | 同一份原稿渲染前后正文、链接和图片来源保持一致，不生成额外内容。 |
| 阅读效果 | 标题、长段落、粗体/链接、引用、列表、代码、表格、图片说明与参考资料的完整预览。 |
| 窄屏与编号 | 长标题和表格不越界；章节编号不重复；参考编号与正文对齐。 |
| 编辑与交接 | 切换模板不改原文；预览微调定位正确；文章包往返保留内容与模板。 |
| 兼容性 | 相关测试通过，已有模板输出没有意外变化；注明实际微信检查的系统和版本。 |
| 来源 | 作者、原创或参考说明，以及外来素材的来源与适用许可。 |

候选附模板文件、注册项、测试、中性样稿和桌面/窄屏截图。只上传中性演示素材，不上传个人稿件、账户页面或真实文章包。纯样式模板没有现成作者/许可元数据字段，可先在候选说明中记录；不要把这些信息塞进每篇导出的正文。

## 社区目录如何增长

正式公开的目标是现有 [pafa/WeDraft](https://github.com/pafa/WeDraft)。当前仍是私有备份；公开后可以通过该仓库的“提交模板”Issue 表单讨论设计，或直接准备 PR。Issue 是提案记录，模板不会因提交 Issue 自动上架。

维护者检查来源、内容保真、允许的样式、自动化结果和实际预览，批准后登记并随版本提供。网页只显示已随版本构建的目录，不从外部投稿中执行任意代码。当前本地审阅与发布授权仍以 [Git 规则](git-workflow.md) 为准；项目采用根目录 [MIT LICENSE](../LICENSE)，此文档不改变仓库可见性。
