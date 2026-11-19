import { execFileSync } from "node:child_process";
if (process.platform !== "win32" && !process.env.WINE) {
  console.error("Windows 安装包请在 Windows 上运行，或在具备 Wine 的 Linux 构建环境运行。");
  process.exit(2);
}
const run = (exe,args) => execFileSync(exe,args,{stdio:"inherit",shell:process.platform==="win32"});
run("npm",["run","build"]);
run("npx",["electron-builder","--win","nsis","--publish","never"]);
console.log("Windows 安装包已输出到 out/windows/");
