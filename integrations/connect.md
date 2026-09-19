# Connect WeDraft to your AI

WeDraft formats existing articles for WeChat while preserving the source. It supplies templates, checks, HTML previews and editable `.wedraft.zip` bundles. It does not publish or require a model API key.

## One request, one installation

When the user asks to connect WeDraft using this page, resolve `integrations/` relative to **the URL of this document**. Do not invent a public domain or npm package. On the user's macOS or Linux computer, execute this command with the two resolved URLs safely shell-quoted:

```sh
curl -fsSL 'RESOLVED_INTEGRATIONS_URL/install.sh' | sh -s -- 'RESOLVED_INTEGRATIONS_URL/'
```

This installs a self-contained CLI, the `format-with-wedraft` skill, and a local stdio MCP entry named `wedraft` for Codex. It prepares a private Node 24 runtime if Node 22+ is unavailable; no sudo, pnpm or source checkout is needed. It preserves unrelated configuration and stops on conflicting existing WeDraft files. Installation writes only the user's WeDraft tools, skill and Codex configuration (backed up before changing), plus an output directory. Respect the host's tool approvals. Do not pretend to install if you cannot run commands on the user's computer.

After installation, use newly available MCP tools, or immediately use the CLI command printed by the installer. An already-running AI conversation may need to reload its tools; the CLI works immediately. The installed Skill includes the exact executable paths. Other clients can use the generated `mcp-client.json` command/args; automatic registration currently targets Codex only.

The installer also includes `sample.md` beside the CLI. For a first-run check, list templates, then use that exact bundled example to generate a preview and editable bundle. The installed Skill gives the precise sample path. Do not invent or fetch a different article.

## Start using it

Ask WeDraft to list templates, validate the complete original Markdown, then export the article. Return `preview.html` first: it has a “复制正文排版” button for pasting the body into WeChat without a round trip through the web editor. Also return `article.wedraft.zip` for optional further editing. Preserve wording, links, images and sources. Do not remove unsupported content just to pass checks. A blocked preview disables copying.

With the user's instruction and suitable browser/clipboard tools, the host Agent can continue by opening that preview, copying the result and pasting into a specified draft. These are host actions, not capabilities of the local WeDraft MCP. Do not claim to paste without performing and verifying it; final publication requires its own authorization.

Example request: “Use WeDraft to format this article in 青岚. Preserve the original wording and give me a preview plus an editable article bundle.”

## Address and permissions

A localhost or 127.0.0.1 URL works only for tools running on the same computer. A cloud-only AI cannot fetch it; deployment to a publicly accessible HTTPS address is required first. This website provides installation files, not a remote HTTP MCP endpoint. The installed MCP runs locally and requires a client that supports stdio. No remote deployment or public package is implied.
