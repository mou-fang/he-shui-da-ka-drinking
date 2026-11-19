// 构建：把网页版复制到 dist/（Electron / Capacitor 都直接用这份代码）。
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const f of ["index.html", "src", "LICENSE", "README.md"]) cpSync(join(root, f), join(dist, f), { recursive: true });
console.log("built dist/ — open dist/index.html or serve it");
