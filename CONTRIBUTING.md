# 参与 WeDraft

欢迎改进排版、修复问题、补充教程，或设计新的模板。小改动可以直接准备候选；涉及文章格式、存储、外部服务或新的渲染结构时，先说明具体场景和预期结果。

WeDraft 已采用 [MIT](LICENSE) 开源。可在 [Issue 表单](https://github.com/pafa/WeDraft/issues/new/choose) 反馈问题或提议模板，Fork [pafa/WeDraft](https://github.com/pafa/WeDraft) 后提交 PR。

## 选择入口

- **发现问题**：使用“报告问题”，提供可重复的操作、预期结果、实际结果和运行环境。
- **提出改进**：使用“功能建议”，说明你正在完成的任务，以及当前流程卡在哪里。
- **贡献模板**：使用“提交模板”，记录名称、唯一 ID、风格、作者与素材来源；具体实现见 [模板贡献指南](docs/templates.md)。已有完整实现也可以直接准备 PR，不要求先另开 Issue。

所有样稿、日志和截图只使用最小中性示例。不要附私人文章、客户内容、公众号凭据、个人信息或包含真实草稿的文章包；无法脱敏时，先只描述现象。

## 本地开始

先在 GitHub Fork 仓库，将下例 `YOUR_USERNAME` 替换为自己的用户名，克隆 Fork，再建立任务分支。工具链以 `.node-version` 和 `package.json` 的 `packageManager` 为准；使用 pnpm，保留现有锁文件。

```sh
git clone https://github.com/YOUR_USERNAME/WeDraft.git
cd WeDraft
git switch -c feat/my-change
pnpm install --frozen-lockfile
pnpm dev:web
```

页面地址以终端输出为准，默认是 `http://127.0.0.1:1432/`。网页、CLI 和 MCP 的开发不需要 Rust 或微信凭据。修改原生功能时，另外按 [使用指南](docs/user-guide.md) 准备 macOS / Rust 工具链。

改动前检查工作目录、分支与已有改动。新任务从最新 `main` 建立自己的功能或修复分支；已有任务继续原分支。`codex/` 是维护者内部 Agent 的命名约定，社区分支不要求该前缀。保留他人修改，不直接提交到 `main`，不要将文章数据、导出文件、安装包或本地配置纳入提交。

## 验证你的改动

开发中可以先跑相关包的检查，例如模板改动：

```sh
pnpm --filter @wedraft/wechat-renderer test
pnpm --filter @wedraft/core test
```

工程候选交付前运行完整验证：

```sh
./scripts/verify
```

网页交互、模板选择、复制或 AI 交接发生变化时，补充真实浏览器检查。仓库提供现成的冒烟脚本，需要本机已安装 Google Chrome：

```sh
pnpm build:tools
pnpm smoke:web
```

脚本会启动独立测试页面，截图和记录写入临时目录。它会实际操作系统剪贴板；运行前保留你正在使用的剪贴板内容，不要与其他复制测试同时运行。浏览器验证不能替代微信后台粘贴或真机预览。

涉及 Rust、Tauri 配置、权限、图标或打包时，还需要：

```sh
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
pnpm build:mac
```

只记录实际执行结果。暂时无法完成的检查写明原因和影响，不用模拟结果代替真实验证。纯文档改动检查链接、路径、命令与当前实现一致；不要把文档准备称作软件发布。

## 提交可审阅的候选

一项候选只解决一个连贯问题。说明用户原来遇到什么、修改后会怎样，并提供实际验证与尚未验证的部分。行为、默认值或使用方式变化时，同步更新相关指南；不为文档维护单独升级应用版本。

模板候选至少包含：

- 模板文件与注册项；不在网页、CLI、MCP 分别维护不同目录。
- 一份覆盖正文、标题、引用、列表、表格、图片来源和参考资料的中性样稿。
- 桌面和窄屏效果图，注明模板 ID、视口和预览环境。
- 内容保真与渲染测试；实际微信检查情况，未检查的明确标注。
- 作者、参考来源及素材许可信息；来源或使用权限不清楚的素材先不纳入。

提交后推送到自己的 Fork，在 GitHub 创建目标为 `pafa/WeDraft:main` 的 PR，反馈继续更新同一分支。维护者检查范围、内容保真、模板兼容性和实际效果，审阅批准后合并；部署与软件发行另行决定。

维护者工作区遵循 [Git 规则](docs/git-workflow.md)，并运行 `./scripts/setup-git` 安装本地保护钩子。`./scripts/backup` 固定备份至 `pafa/WeDraft`，是维护者工具；Fork 贡献者使用普通 `git push origin <分支名>`，不需要运行此备份脚本。

## 保持产品边界

WeDraft 在本机处理文章。模板改变呈现，不改写文字、增添固定推广内容、替换来源或触发发布。不要为模板增加网络请求、远程字体、脚本、遥测、账户或凭据要求。

发现渲染器缺少能力时，单独说明需要支持的内容和兼容性影响，不通过关闭检查或扩大 HTML / CSS 允许范围来掩盖问题。原有文章、模板 ID、图片来源、撤回重做和内容块映射需要持续兼容。
