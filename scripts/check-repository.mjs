import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const staged = process.argv.includes("--staged");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
const read = (path) => staged ? git("show", `:${path}`) : readFileSync(path, "utf8");
const errors = [];
const files = git("ls-files", "-z").split("\0").filter(Boolean);
const forbidden = /(^|\/)(node_modules|target|dist|coverage|release|artifacts|output|local-data|backups|\.worktrees|\.codex|\.agents)(\/|$)|(^|\/)\.env(?:\..*)?$|\.(sqlite|db)(?:-.*)?$|\.(dmg|p12|p8|key|pem|mobileprovision)$|\.app\/|^apps\/desktop\/src-tauri\/gen\//i;
for (const path of files) {
  if (forbidden.test(path) && !path.endsWith("/.env.example") && path !== ".env.example") {
    errors.push(`禁止入库的数据或生成文件: ${path}`);
  }
  if (/(^|\/)(package-lock\.json|yarn\.lock|bun\.lockb?)$/.test(path)) {
    errors.push(`仅使用 pnpm: ${path}`);
  }
}
const root = JSON.parse(read("package.json"));
const desktop = JSON.parse(read("apps/desktop/package.json"));
const tauri = JSON.parse(read("apps/desktop/src-tauri/tauri.conf.json"));
const version = root.version;
const versions = {
  desktop: desktop.version,
  tauri: tauri.version,
  cargo: read("apps/desktop/src-tauri/Cargo.toml").match(/^version = "([^"]+)"/m)?.[1],
  cargoLock: read("apps/desktop/src-tauri/Cargo.lock").match(/name = "wedraft"\nversion = "([^"]+)"/)?.[1],
  display: read("apps/desktop/src/version.ts").match(/APP_VERSION = "([^"]+)"/)?.[1],
  readme: read("README.md").match(/当前版本：`([^`]+)`/)?.[1],
};
if (!/^\d+\.\d+\.\d+$/.test(version)) errors.push("应用版本必须是 X.Y.Z。");
for (const [name, value] of Object.entries(versions)) {
  if (value !== version) errors.push(`${name} 版本 ${value} 与 ${version} 不一致。`);
}
if (!read("CHANGELOG.md").includes(`## [${version}]`)) errors.push("CHANGELOG 缺少当前版本。");
const updated = read("apps/desktop/src/version.ts").match(/APP_UPDATED_AT = "([^"]+)"/)?.[1];
if (!updated || !read("README.md").includes(`更新日期：\`${updated}\``)) errors.push("界面和 README 更新日期不一致。");
if (!root.packageManager?.startsWith("pnpm@")) errors.push("必须固定 pnpm 版本。");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Repository checks passed (${staged ? "index" : "working tree"}, app ${version}).`);
