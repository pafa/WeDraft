import { parseArgs } from "node:util";
import { articleInputSchema, ENGINE_VERSION, listTemplates, renderArticle, validateInput } from "@wedraft/core";
import { loadArticleFile, writeArticleArtifacts } from "./files.js";

const HELP = `WeDraft ${ENGINE_VERSION} — local article formatting

wedraft templates
wedraft validate --input article.md [--asset-root ./images] [--template next-edition]
wedraft render --input article.md --out ./new-output [--asset-root .]
wedraft render --input article.wedraft.zip --out ./new-output
wedraft render --stdin [--out ./new-output]

Input: Markdown (first line is title), .wedraft.zip, or an ArticleInput JSON file.
--stdin reads ArticleInput JSON; it never reads image paths implicitly.
Without --out, render returns JSON with HTML, text and diagnostics.
An output directory must not already exist. Exit codes: 0 ready, 2 blocked content, 1 invalid input/I/O.
No network requests, model API calls, clipboard writes or WeChat publishing.
`;

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, strict: true, options: {
    input: { type: "string" }, out: { type: "string" }, template: { type: "string" },
    "asset-root": { type: "string" }, stdin: { type: "boolean" }, help: { type: "boolean", short: "h" },
  } });
  if (values.help || !positionals.length) { process.stdout.write(HELP); return; }
  if (positionals.length !== 1) throw new Error("只接受一个命令。");
  const command = positionals[0];
  if (command === "templates") { process.stdout.write(`${JSON.stringify({ templates: listTemplates() }, null, 2)}\n`); return; }
  if (command !== "render" && command !== "validate") throw new Error(`未知命令：${command}`);
  if (Boolean(values.input) === Boolean(values.stdin)) throw new Error("请提供 --input 或 --stdin，二选一。");
  if (command === "validate" && values.out) throw new Error("validate 不写文件，请使用 render --out。");
  let article;
  if (values.stdin) {
    if (values["asset-root"]) throw new Error("--asset-root 仅用于文件输入。");
    const chunks: Buffer[] = []; let length = 0;
    for await (const chunk of process.stdin) { length += chunk.length; if (length > 60 * 1024 * 1024) throw new Error("标准输入过大。"); chunks.push(chunk); }
    article = articleInputSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))));
  } else article = await loadArticleFile(values.input!, values["asset-root"]);
  if (values.template) article.templateId = values.template;
  const result = command === "validate" ? validateInput(article) : values.out ? await writeArticleArtifacts(article, values.out) : renderArticle(article);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === "blocked" ? 2 : 0;
}
main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : "未知错误" })}\n`);
  process.exitCode = 1;
});
