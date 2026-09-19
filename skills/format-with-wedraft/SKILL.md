---
name: format-with-wedraft
description: Format an article for WeChat with installed WeDraft CLI or MCP tools, preserving the source and returning a preview plus an editable article bundle. Use for WeDraft formatting, checking, or AI-to-web article handoff.
---

Use WeDraft's deterministic renderer; do not recreate its template HTML in a model response.

## Choose the installed entry point

- Prefer available WeDraft MCP tools for text: call `list_templates`, then `validate_article`, then `export_article` if it is configured. `export_article` writes new files under the configured output directory. Pure `render_article` returns HTML but does not produce a portable bundle.
- For local files, images, or when MCP tools have not refreshed, use the installed CLI command below. The one-command website installer fills in the exact executable path, so no source checkout or package manager is needed. A source copy of this Skill containing an unresolved command token has not been installed; use the website's `connect.md` setup instructions first.
- If setup is requested, use the provided WeDraft website's `connect.md`. Do not invent a public address or unpublished npm package. A localhost address requires tools running on that same computer.

## Try the bundled example

When the user asks to verify setup with the built-in example, list templates and read the installed example at `{{WEDRAFT_SAMPLE}}`. Validate and export that exact content. Do not invent an example or modify the user's current draft. The sample can also be rendered immediately with `{{WEDRAFT_CLI}} render --input {{WEDRAFT_SAMPLE}} --out /path/to/new-output`.

## Preserve the source

Keep wording, ordering, links, captions and source attributions unless the user has requested editing. The first nonblank Markdown line is the title. Query valid template IDs; the default is `next-edition`. Keep the renderer's pinned template version when reopening an existing article.

Pass complete original Markdown. For a local `.wedraft.zip`, pass it directly to the CLI; it includes metadata and images. For Markdown with local relative images, pass `--asset-root` only for the directory containing the user's intended assets. Never scan arbitrary directories or invent missing images, sources or public URLs.

```sh
{{WEDRAFT_CLI}} templates
{{WEDRAFT_CLI}} validate --input /path/to/article.md --asset-root /path/to/assets-root
{{WEDRAFT_CLI}} render --input /path/to/article.md --asset-root /path/to/assets-root --out /path/to/new-output
```

Use a new output directory whose parent exists. Omit `--asset-root` if there are no local images. CLI exit code 2 means content is blocked, not a tool crash. Report the specific issue and line; do not remove unsupported content to make the check pass. Blocked drafts can still be preserved in the article bundle, but are not ready-to-copy output.

## Deliver an editable result

Return links to `preview.html` and `article.wedraft.zip`, plus material diagnostics. Explain that the bundle can be imported into the WeDraft web editor for further changes. Local output paths refer to the machine running the tool and are not hosted download URLs.

Do not claim the HTML is verified in WeChat from a renderer test alone. Formatting and export do not imply publishing or clipboard access. No WeDraft tool publishes to WeChat; final paste and publication belong to the user's chosen workflow.
