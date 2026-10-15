import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { gzipSync } from "node:zlib";
const root = import.meta.dirname,
  port = Number(process.env.PORT || 3001);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".bin": "application/octet-stream",
  ".txt": "text/plain",
};
const clients = new Set();
let previous = "";
setInterval(async () => {
  const files = [
    "public/index.html",
    "public/atlas.css",
    "src/app.js",
    "src/render.js",
    "src/physics.js",
  ];
  const key = (
    await Promise.all(
      files.map(async (f) => (await stat(resolve(root, f)).catch(() => ({ mtimeMs: 0 }))).mtimeMs),
    )
  ).join(",");
  if (previous && previous !== key) for (const res of clients) res.write("data: reload\n\n");
  previous = key;
}, 1000).unref();
http
  .createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      if (path === "/__events") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
        res.write(": connected\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
      const base = resolve(root, path.startsWith("/src/") ? "src" : "public");
      const file = resolve(base, path === "/" ? "index.html" : path.replace(/^\/(src\/)?/, ""));
      if (!file.startsWith(base + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const raw = await readFile(file),
        accept = req.headers["accept-encoding"] || "";
      const gzip = accept.includes("gzip") && raw.length > 1024;
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
        ...(gzip ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding" } : {}),
      });
      res.end(gzip ? gzipSync(raw) : raw);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(port, "127.0.0.1", () => console.log(`Orbital Atlas ready at http://localhost:${port}/`));
