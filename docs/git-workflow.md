# WeDraft 本地 Git、备份与发布规则

本地 Git 管理开发和验证，所有合并通过 [pafa/WeDraft](https://github.com/pafa/WeDraft) 的 PR 完成，`main` 保存已接受的版本。维护者最新决定取代 2026-09-06 的本地直接合并方式：每个 PR 注明问题、变更、实际验证和限制。仓库已采用 MIT 公开；不因此增加 Actions、付费保护或自动发布。

当前项目目录是持续维护的软件工作区。维护者已于 2026-09-06 批准将接管候选合入 `main`；后续以本地 `main` 为唯一主线，GitHub 默认分支同步为 `main`。旧接管分支和已取消的 CI 归档只供追溯，不从它们启动新开发。

## 本地日常管理

1. 开始前检查当前目录、Git 根目录、分支、HEAD、`git status --short` 和远端。保护已有改动，不自动 stash、reset、clean 或切分支覆盖工作。
2. 新任务从本地 `main` 建立 `codex/feat/...`、`codex/fix/...`、`codex/chore/...` 或 `codex/release/...`。一项任务一个短期分支，不直接在主干开发。已有任务继续原分支。
3. 只修改当前目标需要的内容，按影响更新测试、文档和 CHANGELOG。按具体文件暂存，审阅完整 diff 与新增文件后提交；不盲目 `git add .`。
4. 交付前执行 `./scripts/verify`。Rust、Tauri、权限、图标或打包变化还要执行 `cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml` 和 `pnpm build:mac`；人工验收按 `docs/acceptance-tests.md` 选择相关项目。
5. 审阅完整 diff 后推送任务分支并创建 PR，目标为 `main`。PR 写明具体变更、当前 head SHA、实际验证和未验证边界；反馈继续更新同一 PR，不把“已推送”当成“已批准”。
6. 维护者明确批准当前 PR 和 head SHA 后，通过该 PR 合并。候选或主干发生实质变化时重新检查并确认，不以本地 merge 或直接 push main 绕过 PR。创建 PR 不等于批准合并或发布。
7. 每次完成任务后用 `./scripts/backup` 推送当前任务分支并核对 SHA。PR 合并后 fetch，在干净的 main 工作树用 `git merge --ff-only origin/main` 同步已经合并的结果，不产生额外本地合并。暂不需要的分支先保留。
8. 已批准的任务合并、备份完毕后，当前工作区停留在干净的 `main`。尚未批准或有未提交改动时继续保留原任务分支，不为了切回主线覆盖工作。

本地钩子拦截主干直接提交、暂存区版本不一致及禁止文件；允许同名 `main` 的正常快进备份，拦截主干删除/非快进推送和已有标签覆盖/删除。钩子是本地防误操作措施，不要求线上另设硬性保护，代理不得绕过钩子。

## 初始化与多任务

- 当前项目目录继续使用，不移动或覆盖应用数据。
- 每个 clone 首次执行 `pnpm install --frozen-lockfile` 和 `./scripts/setup-git`。Node、pnpm、Rust 分别取 `.node-version`、`package.json#packageManager`、`rust-toolchain.toml`。
- 安装脚本只修改当前仓库 Git 配置；遇到已有其他 hooksPath 会停止，先整合原有钩子，不修改全局设置。
- 多任务确有必要时，用 `git worktree add ../WeDraft-fix -b codex/fix/topic main` 隔离；不用复制整份项目目录代替版本管理。移除 worktree 前先审查未提交和未推送内容。
- 从备份恢复或在另一台电脑继续时，先检查所有备份分支，选择已确认的版本；未合并任务通常保存在对应任务分支。不要假定远端 `main` 总包含最新工作，也不要用远端覆盖当前未提交工作。

## GitHub PR 与源码备份

- 现为公开仓库，目标固定为 `pafa/WeDraft`。所有合并使用 PR；不自动修改仓库保护、Actions、发布或付费设置。
- `./scripts/backup` 要求工作区干净，仅推送当前分支，并核对远端 SHA 与本地一致。成功推送且 SHA 一致才算这次提交已备份；网络失败时保留本地提交并报告未备份。
- main 的新改动经 PR 合并后同步到本地。发现两端分歧先比较，不强推、不覆盖工作区；多任务和多台电脑操作需保护各自已有工作。
- 只推送明确的源码分支和已批准版本标签，不使用 `git push --mirror`、`--all` 或上传 Codex 内部引用。
- 源码、测试、主题、内置图片、图标、配置、提示词及两个锁文件入 Git。`node_modules`、`target`、`dist`、安装包、文章数据库、用户图片缓存、导出稿、密钥和本机工具状态不入 Git。
- GitHub 不备份未提交工作、安装包或文章历史。安装包与发布记录保存在本地忽略目录；重要文章数据由维护者自己的本地备份方案保护。本流程不修改 `~/Library/Application Support/com.wedraft.desktop/`。

## 本地版本与发布

1. 在发布准备分支选择版本号：兼容修复升 PATCH，新功能升 MINOR，不兼容变更升 MAJOR。同步根和 desktop 的 `package.json`、`Cargo.toml`、`Cargo.lock` 中 wedraft 项、`tauri.conf.json`、`src/version.ts`、版本测试及 README 的版本/日期，补齐 CHANGELOG。内部 `packages/*` 不单独发布，不强行统一版本号。
2. 完成本地验证和 PR 审阅，维护者批准后通过 PR 合入 `main` 并同步本地。记录合并后完整 SHA。在这个干净提交上重新执行标准验证、锁定 Rust 测试及 `pnpm build:mac`；不能把旧构建与新 SHA 拼成发布记录。
3. 将本次 `.app`/`.dmg` 与构建记录保存到 `release/<版本>-<提交短SHA>/`，生成安装包 SHA-256。构建记录至少写明版本、完整源 SHA、构建时间、arm64 架构、测试结果、签名状态及校验和。已有目录不覆盖，旧安装包保留用于回退。
4. 实际验收启动、复制排版、图片、历史、撤回重做等相关行为。创建正式版本标签、对外发布或替换本机已安装 App，分别需要维护者针对版本、源 SHA、包和范围的明确批准。
5. 获准后创建注释标签 `git tag -a vX.Y.Z 完整SHA -m 'WeDraft X.Y.Z'`，确认本地与 PR 合并后的远端 `main` 一致，再 `git push origin refs/tags/vX.Y.Z` 并核对远端标签。GitHub 只保留源码版本，不自动创建 Release、上传安装包或分发。
6. 版本标签和正式包不可覆盖；问题通过新版本修复。代码回退在任务分支 `git revert`，检查和批准后合并；应用回退前保护本地数据，不随软件降级自动回退数据库。

当前应用仍为 1.1.2，采用 ad-hoc 签名，未做 Developer ID 公证。建立 Git 管理不升级应用、不追溯创建旧标签、不替换已安装软件，也不引入证书或外部服务。

## 产品说明与 GitHub 首页

- `README.md` 是 GitHub 首页，说明定位、真实能力、截图、数据边界、运行方法和文档入口；详细操作放在 `docs/user-guide.md`。
- 功能、模板默认值、安装方式或数据行为变化时，同步检查 README、使用指南、架构说明和相关验收项。保持应用版本日期真实，文档整理不冒充新版本发布。
- 截图只使用内置样稿或获准素材，并注明 Web 预览与原生能力的区别；不上传私人稿件、账户页面或历史记录。
- GitHub About 与 topics 随产品定位维护，仓库已公开，默认分支保持 `main`；如实标注网页测试版与 Mac 基线，不增加未经实际发布的下载按钮、Release、CI 徽章或云端能力。
