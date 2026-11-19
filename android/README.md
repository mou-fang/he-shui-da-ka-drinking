# android/ 目录

这个目录是给 Capacitor 预留的。生成方式（需要 JDK 17 + Android SDK，见仓库根 README）：

```bash
npm run setup:android   # 装 @capacitor/core + @capacitor/cli，生成 android/ 原生工程
npm run package:android # 同步网页代码并用 Gradle 打 debug APK
```

生成后的 `android/` 是标准 Capacitor 安卓工程，不应手工改里面的 Gradle 配置；
网页代码改完后跑 `npx cap sync android` 即可同步。

注意：`android/` 下的 `app/build/`、`.gradle/`、`local.properties` 已在 `.gitignore` 里，
不要提交。
