// Web / Capacitor / Electron 共用同一份经过 esbuild 打包的页面。
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const file of ["index.html", "src/styles.css", "LICENSE"]) {
  const target = file === "src/styles.css" ? "src/styles.css" : file;
  const dest = join(dist, target);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(root, file), dest);
}
await build({
  entryPoints: [join(root, "src/app.js")],
  outfile: join(dist, "app.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome110", "safari16.4", "firefox115"],
  sourcemap: false,
  minify: false,
  logLevel: "info"
});
// Electron 仍加载根目录 index.html，避免升级时改变 localStorage 的 file URL。
cpSync(join(dist, "app.js"), join(root, "app.js"));
console.log("Web bundle ready: dist/index.html");
