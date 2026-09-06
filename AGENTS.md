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

## Git, PR and release rules

- Read `docs/git-workflow.md` before engineering or release work. The private canonical repository is `https://github.com/pafa/WeDraft`; `main` is the integration branch.
- Before edits, inspect cwd, Git root, branch, HEAD, remote and existing changes. Preserve unrelated work; stage only reviewed, named paths. Never use a blanket initial import to create a baseline.
- All engineering changes, including prompts, dependencies, workflow rules and hotfixes, use a short-lived `codex/<type>/<topic>` branch and a PR to `main`. Never commit or push directly to `main` or `master`, force-push protected branches, bypass hooks/checks, or merge locally into `main`.
- Run `./scripts/setup-git` in each new clone. Run `./scripts/verify` before handing off; native or packaging changes also require locked Rust tests and `pnpm build:mac`. GitHub CI checks every PR on Apple Silicon.
- Review the complete diff and new files before committing. Create/update the PR with the exact candidate SHA, actual checks and limitations. Never claim a previous build verifies a newer candidate.
- The owner must explicitly approve the repository, PR and current candidate before an agent merges with Squash. A changed candidate needs renewed approval. CI success, this workflow setup request, and approval to create a PR are not approval to merge or release.
- Agents may prepare local builds and draft release material. Creating a release tag, publishing a release, replacing the installed app or changing data/signing credentials requires specific authorization. Never overwrite or move an existing release tag or asset.
- Releases come only from a clean, approved `main` commit, with matching app versions, `CHANGELOG.md`, an annotated `vX.Y.Z` tag, source SHA and SHA-256 checksums. Retain the previous release for rollback; never roll back user data implicitly.
- Private article history, cached user images, credentials, local exports and built installers stay out of Git. Source icons and the built-in sample image belong in Git.
- GitHub currently returns HTTP 403 for private branch protection on this account. Local hooks are guardrails, not a server guarantee. Do not claim strict server enforcement until `./scripts/configure-github` and its readback succeed after the owner upgrades to Pro.
