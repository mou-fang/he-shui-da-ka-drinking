// Android APK 打包入口。需要 JDK 17 + Android SDK（见 README）。
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
const missing = [];
if (!process.env.JAVA_HOME && !existsSync("/usr/lib/jvm")) missing.push("JDK 17（JAVA_HOME）");
if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT) missing.push("Android SDK（ANDROID_HOME）");
if (missing.length) {
  console.error("Android 打包缺少：" + missing.join("、"));
  console.error("装好 JDK 17 + Android SDK 后：npm run setup:android && npm run package:android");
  process.exit(2);
}
execSync("npx cap sync android && cd android && ./gradlew assembleDebug", { stdio: "inherit" });
console.log("APK: android/app/build/outputs/apk/debug/app-debug.apk");
