// 仅在没有原生工程时移除仓库内 android/README.md 占位目录。
import { existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
if (existsSync("android/app")) {
  console.error("android/app 已存在。请直接运行 npm run package:android，不覆盖现有原生工程。");
  process.exit(1);
}
execFileSync("npm", ["run", "build"], { stdio: "inherit", shell: process.platform === "win32" });
if (existsSync("android/README.md")) rmSync("android", { recursive: true, force: true });
execFileSync("npx", ["cap", "add", "android"], { stdio: "inherit", shell: process.platform === "win32" });
