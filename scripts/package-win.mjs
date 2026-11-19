// Windows 安装包打包入口。
// 需要：在 Windows 上跑（或带 wine 的 Linux CI），且已 npm run setup:desktop。
// 未签名：安装时 SmartScreen 会提示，属正常。
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
if (process.platform !== "win32" && !process.env.WINE) {
  console.error("Windows 安装包请在 Windows 上打包：npm run setup:desktop && npm run package:win");
  console.error("（Linux 上打包 NSIS 需要 wine，未装 wine 时 electron-builder 会失败。）");
  process.exit(2);
}
if (!existsSync("node_modules/electron-builder")) {
  console.error("先跑：npm run setup:desktop");
  process.exit(2);
}
execSync("npx electron-builder --win nsis", { stdio: "inherit" });
