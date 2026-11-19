// 把 npm 版本映射到 Android versionName/versionCode，防止每次 cap add 重置为 1.0 / 1。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
if (!match) throw new Error("Invalid package.json semver: " + version);
const [major, minor, patch] = match.slice(1).map(Number);
if (major > 2000 || minor > 999 || patch > 999) throw new Error("Android version number exceeds supported range");
const code = major * 1000000 + minor * 1000 + patch;
if (code < 1 || code > 2147483647) throw new Error("Invalid Android versionCode");
const file = "android/app/build.gradle";
if (!existsSync(file)) throw new Error("Missing Android gradle project: run setup:android first");
let gradle = readFileSync(file, "utf8");
if (!/versionCode\s+\d+/.test(gradle) || !/versionName\s+"[^"]*"/.test(gradle)) {
  throw new Error("Cannot locate versionCode/versionName in generated Gradle project");
}
gradle = gradle.replace(/versionCode\s+\d+/, "versionCode " + code)
  .replace(/versionName\s+"[^"]*"/, 'versionName "' + version + '"');
writeFileSync(file, gradle, "utf8");
console.log("Android release version:", version, "(code " + code + ")");
