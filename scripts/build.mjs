import { mkdir, cp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
for (const file of [
  "src/physics.js",
  "src/render.js",
  "src/app.js",
  "src/lunar.js",
  "src/celestial.js",
  "src/celestial-ui.js",
  "src/celestial-render.js",
  "src/zodiac-math.js",
  "server.mjs",
])
  execFileSync(process.execPath, ["--check", resolve(root, file)]);
await rm(resolve(root, "dist"), { recursive: true, force: true });
await mkdir(resolve(root, "dist"), { recursive: true });
await cp(resolve(root, "public"), resolve(root, "dist"), { recursive: true });
await cp(resolve(root, "src"), resolve(root, "dist/src"), { recursive: true });
console.log("Static dashboard built in dist/");
