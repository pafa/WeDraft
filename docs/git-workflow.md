# WeDraft 本地、GitHub 与发布规则

唯一主仓库为 [pafa/WeDraft](https://github.com/pafa/WeDraft)，保持私有。主干为 `main`；新功能、修复、依赖升级、规则及发布准备全部通过短期任务分支和 PR 管理。不另设长期 `develop` 分支，不用复制项目文件夹代替 Git 版本。

## 当前接管状态与限制

2026-09-06 核验：本地原先没有有效 HEAD、没有远端，现有应用版本为 1.1.2。已有 `.git` 内的 Codex 内部引用与对象不清理、不镜像推送。新仓库的 `main` 先建立空初始化提交；审查过的现有源码、资源和本次管理规则通过首个 PR 提交，人工批准之前不会进入主干。应用版本不会因为建库而擅自升级。

GitHub 实际返回 `403: Upgrade to GitHub Pro or make this repository public`。本仓库保持私有，**服务器端分支保护和标签规则尚未生效**；本地钩子与书面规则不能替代它。维护者自行升级 Pro 后执行 `./scripts/configure-github`，保留命令成功的读回结果，并通过 PR 更新本节、README、AGENTS 和 CHANGELOG 中的待办状态。不自动购买套餐或更改可见性。

期望服务器规则已保存在 `.github/main-protection.json` 和 `.github/tag-protection.json`：强制 PR、GitHub Actions 的 `verify` 通过、分支与主干同步、解决审阅对话、管理员同样受限、禁止主干强推/删除、版本标签不可改写/删除。

当前为个人账号，PR 通常也由 `pafa` 创建。GitHub 不允许作者批准自己的 PR，因此未要求“另一账号的 1 次 Approve”；CODEOWNERS 标记维护人为 `pafa`。维护者在聊天中明确批准当前 PR/SHA，或自行审阅后点击 Squash merge；代理不能代替人给自己的候选批准。将来有独立协作者或机器人身份时，再经确认把 required approvals 提高到 1。这是人工流程边界，不是同一账号下能够技术隔离的人机权限。

## 本地目录怎么用

- 当前目录继续作为开发工作区，不移动或覆盖应用数据。
- 每个 clone 首次运行 `pnpm install --frozen-lockfile`、`./scripts/setup-git`。Node 取 `.node-version`，pnpm 取 `package.json#packageManager`，Rust 取 `rust-toolchain.toml`。
- 安装脚本只改当前仓库的 Git 配置；若已有其他 hooksPath 会停止，先整合既有钩子。不修改全局 Git 设置。
- `main` 仅同步 GitHub 已合并内容；未提交工作先留在原分支。不要自动 stash、reset、clean 或切分支覆盖改动。
- 多任务确有必要时，使用 Git worktree，例如 `git worktree add ../WeDraft-fix -b codex/fix/topic origin/main`。一项任务一个分支；删除 worktree 前核实无未提交和未推送内容。
- 源码、测试、主题、内置图片、应用图标、配置和两个锁文件入 Git。`node_modules`、`target`、`dist`、安装包、文章数据库、用户图片缓存、导出稿、密钥和本机工具状态不入 Git。
- GitHub 保存提交过的代码，不能备份未提交工作或文章历史。文章数据使用维护者自己的本地备份方案；本流程不触碰 `~/Library/Application Support/com.wedraft.desktop/`。

首次 clone：

```bash
git clone https://github.com/pafa/WeDraft.git
cd WeDraft
pnpm install --frozen-lockfile
./scripts/setup-git
git switch -c codex/feat/topic
```

## 每次更新的固定步骤

1. 核对 Git 根目录、分支、HEAD、`git status --short` 与远端；说明并保护已有改动。
2. 工作区干净后 `git fetch origin --prune`，从最新 `origin/main` 建立 `codex/feat/...`、`codex/fix/...`、`codex/chore/...` 或 `codex/release/...`。已有任务继续原分支。
3. 只实现当前目标，更新相关测试和文档；版本发布准备同时更新 CHANGELOG。
4. 执行 `./scripts/verify`。Rust/Tauri/权限/图标/打包相关变化追加 `cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml` 和 `pnpm build:mac`；按影响执行 `docs/acceptance-tests.md` 的人工验收。
5. 审查 `git diff` 和新增文件，按具体路径 `git add`；再审阅 `git diff --cached`，提交有意义的 `feat:`、`fix:`、`chore:` 或 `docs:` 说明。禁止盲目 `git add .`。
6. 推送任务分支，创建 PR，写清问题、结果、候选 SHA、实际验证、未验证边界和恢复办法。反馈继续更新同一个 PR。不要自动邀请或发送消息给协作者。
7. CI 对每个 PR 运行仓库检查、108 项基线测试及其后新增测试、前端构建、Rust 测试、Apple Silicon `.app`/`.dmg` 构建。检查只读，不发布、不自动合并。实际测试数量随项目发展变化。
8. CI 成功且维护者明确批准当前候选后，使用 GitHub Squash 合并；代理获批时可用 `gh pr merge PR编号 --squash --match-head-commit 候选完整SHA`。不使用 `--admin` 绕过。候选改变后重新批准。
9. GitHub 自动删除已合并远端分支；本地干净时 `git switch main`、`git pull --ff-only`。Squash 后本地旧分支可能不会被 `git branch -d` 识别为已合并，先保留；核对对应 PR、差异和未推送提交后再明确清理，不自动强删。

本地钩子在提交时拦截主干、暂存区版本不一致和禁止文件；推送时拦截主干及标签删除/覆盖。它们并不防止 `--no-verify`、GitHub 网页、API 或其他 clone 绕过；禁止代理使用这些旁路，服务器强制能力以实际保护设置为准。

## GitHub 怎么管理

- 仓库私有，不上传到其他远端；`main` 是唯一主干。
- 仅允许 Squash merge，关闭自动合并，开启合并后删除远端分支。
- Actions 默认只读；关闭 Actions 创建/批准 PR 的权限。官方 Actions 固定到提交 SHA，工具链升级也走 PR。
- CI 没有发布权限，不配置证书或任何微信凭据。
- 私有仓库的 macOS CI 使用账号 Actions 配额；工作流设 40 分钟超时、取消过期 PR 检查并缓存 Rust 构建。此设置不调整账号的付费预算。
- 规则变更同样需要 PR 和人工批准；不能为了让当前 PR 合并而临时降低检查。

## 每次版本发布

1. 建立发布准备 PR。PATCH 用于兼容修复，MINOR 用于新功能，MAJOR 用于不兼容变化。同步根 `package.json`、desktop `package.json`、`Cargo.toml`、`Cargo.lock` 的 wedraft 项、`tauri.conf.json`、`src/version.ts`、版本测试和 README 的版本/日期，补齐 CHANGELOG。内部 `packages/*` 不是独立发布产品，不强行统一到应用版本。
2. 完成 CI 和人工验收；维护者批准后合并。记录合并后的完整 `main` SHA，不能拿 PR 合并前的 SHA 作为正式来源。
3. GitHub Actions → Release candidate → 选择 `main`，输入这个完整 SHA。工作流核对输入与主干一致，重新测试/构建，输出 `.dmg`、`.app.zip`、`build-info.json` 和 `SHA256SUMS`。仅保存 30 天候选 artifact，不创建标签或 Release。
4. 下载候选，运行 `shasum -a 256 -c SHA256SUMS`；完成启动、复制、图片、历史和撤回重做等相关验收。维护者确认版本、源 SHA、安装包校验和和发布范围后，才可创建版本标签和 Release。不能把旧本地构建与新的源 SHA 拼接成发布记录。
5. 在已核对的干净工作区创建注释标签 `git tag -a vX.Y.Z 完整SHA -m 'WeDraft X.Y.Z'`，然后 `git push origin refs/tags/vX.Y.Z`。上传已验收的同一批文件到 **Draft Release**，Release 说明列出变化、测试、源 SHA、SHA256、兼容性和签名状态。最终 Publish 仍需明确批准。
6. 正式 Release 保留安装包、校验文件、构建记录和版本说明，旧版继续保留用于回退。不覆盖同名标签或发布资产；修复发新版本。回退代码走 `git revert` 的修复 PR，回退安装需先保护本地数据，不能随应用降级自动回退数据库。

现有 Tauri 配置使用 ad-hoc 签名，没有 Developer ID 公证。候选包会如实记录这一点；本次不引入证书、不更换安装中的 App，也不声称满足对外商业分发条件。当前 Git 接管不创建 `v1.1.2` 历史标签或 Release。

## 参考依据

- [GitHub 私有仓库分支保护与套餐要求](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [PR 作者不能批准自己的 PR](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/approving-a-pull-request-with-required-reviews)
- [GitHub macOS ARM64 runner 与私有仓库配额](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
