import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
if (!existsSync("android/app")) {
  console.error("缺少 Android 原生工程：先运行 npm run setup:android");
  process.exit(2);
}
if (!process.env.JAVA_HOME || !(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT)) {
  console.error("请配置 JDK 21 的 JAVA_HOME 和 ANDROID_HOME（或 ANDROID_SDK_ROOT）。");
  process.exit(2);
}
const run = (exe,args,cwd) => execFileSync(exe,args,{ cwd, stdio:"inherit", shell:process.platform==="win32" });
run("npm",["run","build"]);
run("npx",["cap","sync","android"]);
run(process.platform === "win32" ? "gradlew.bat" : "./gradlew",["assembleDebug"],"android");
console.log("APK: android/app/build/outputs/apk/debug/app-debug.apk");
