# WeDraft Repository Guidance

## Mission

Maintain WeDraft as a personal, local-first macOS WeChat formatting application. It does not publish to WeChat, require WeChat credentials, or send article content to a WeDraft service.

## Boundaries

- Preserve local-first behavior and do not add accounts, cloud sync, telemetry, publishing APIs, or credential collection without explicit approval.
- User article history, cached images, clipboard contents, and application data are private local data. Never delete or migrate them implicitly.
- Markdown parsing, copied HTML, source captions, undo/redo, and bidirectional block mapping are product contracts; update tests with behavioral changes.
- Keep the pnpm workspace and Rust/Tauri boundaries intact. Do not introduce a second JavaScript package manager or lockfile.
- Packaging changes require Apple Silicon app build verification; ordinary web/editor logic changes use the standard repository verification first.

## Required verification

- Run `./scripts/verify` before claiming a code change is complete.
- Run `pnpm build:mac` when Tauri configuration, Rust code, entitlements, icons, or packaging behavior changes.

## Local Git and release rules

- Read `docs/git-workflow.md` before engineering or release work. `main` stores accepted versions. `https://github.com/pafa/WeDraft` is the public MIT-licensed source repository for PR review, merging and backup.
- This checkout is the maintained project home. Start new work from current local `main`; after an approved merge and successful backup, leave this checkout on clean `main`. Archived setup/CI branches are historical references, not development baselines.
- The owner's latest decision supersedes the 2026-09-06 local-only merge workflow: all merges use GitHub PRs. Each PR must describe the problem, changes, actual validation and limitations. This does not require new Actions, branch protection, paid upgrades or release automation.
- Before edits, inspect cwd, Git root, branch, HEAD, remote and existing changes. Preserve unrelated work; stage only reviewed, named paths. Never use a blanket initial import to create a baseline.
- All engineering changes, including prompts, dependencies, rules and hotfixes, use a short-lived `codex/<type>/<topic>` branch. Do not commit directly on `main` or `master` or bypass local hooks.
- Run `./scripts/setup-git` in each new clone and `./scripts/verify` before handoff. Native or packaging changes also require locked Rust tests and `pnpm build:mac`.
- Review the complete local diff, including new files, and report the candidate SHA, actual checks and limitations. Create or update a PR for the reviewed task branch; local review complements the PR. Never claim a previous build verifies a newer candidate.
- Obtain the owner's explicit approval of the current PR and head SHA before merging through the PR. A changed candidate needs renewed approval. Do not replace the PR workflow with a local merge or direct push to main. After the PR merges, fetch and fast-forward local main only when its worktree is clean; preserve other tasks' work. Never force-push or delete main.
- After each completed task, back up its committed task branch with `./scripts/backup`. After an approved PR merge, synchronize local `main` with the remote merge commit. Backing up a task branch is not approval to merge or release. Verify the remote SHA; do not claim uncommitted or unpushed work is backed up. Never use `git push --mirror` or push Codex internal refs.
- Releases come from a clean, approved local `main` commit, with matching app versions, `CHANGELOG.md`, an annotated `vX.Y.Z` tag, source SHA and local installer SHA-256 checksums. Creating a release tag, publishing or replacing the installed app requires specific authorization. Never move existing tags or replace release assets.
- Keep installers and build records locally under ignored `release/` or `artifacts/`; GitHub backs up source branches and approved tags, not app data or installers. Preserve older packages for rollback; never roll back user data implicitly.
- Private article history, cached user images, credentials, local exports and built installers stay out of Git. Source icons and the built-in sample image belong in Git. Do not add accounts, signing credentials or new remote services as part of this workflow.

## Product documentation and repository page

- Keep root `README.md` as the product landing page on GitHub's default `main` branch, with `docs/user-guide.md` for detailed usage. Update both when behavior, defaults or installation steps change; verify claims against current code and tests.
- Use real screenshots with the built-in sample or explicitly approved content. Never include private article history or describe browser preview as proof of native clipboard, image caching or export behavior.
- Keep application version/date aligned across existing version sources. Documentation-only maintenance does not change the app version or pretend to be a software release.
- GitHub About, topics and README should describe the public Web/AI beta and the existing macOS baseline accurately. Do not invent download links, public releases, cloud services, CI badges or license grants. Maintain the page when completing relevant changes; no scheduled monitoring or external publishing is implied.
