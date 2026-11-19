import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
const root = resolve("dist");
const types = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".ico":"image/x-icon" };
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = resolve(root, "." + (name === "/" ? "/index.html" : name));
    if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403).end(); return; }
    if (!(await stat(file)).isFile()) { res.writeHead(404).end(); return; }
    const extension = file.slice(file.lastIndexOf("."));
    res.setHeader("Content-Type", types[extension] || "application/octet-stream");
    res.end(await readFile(file));
  } catch { res.writeHead(404).end("Not found"); }
});
server.listen(5173, "127.0.0.1", () => console.log("http://127.0.0.1:5173"));
