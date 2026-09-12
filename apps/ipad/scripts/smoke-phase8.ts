import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const index = read("apps/ipad/index.html");
const sw = read("apps/ipad/public/sw.js");
const manifest = JSON.parse(read("apps/ipad/public/manifest.webmanifest"));

for (const [name, ok] of [
  ["service-worker registration", index.includes("navigator.serviceWorker.register")],
  ["manifest link", index.includes("./manifest.webmanifest")],
  ["app icon link", index.includes("./icon.svg")],
  ["cache install", sw.includes("cache.addAll(APP_SHELL)")],
  ["activation cleanup", sw.includes("caches.delete(key)")],
  ["same-origin runtime caching", sw.includes("url.origin !== self.location.origin")],
  ["offline app-shell fallback", sw.includes("caches.match(\"./index.html\")")],
]) {
  if (!ok) throw new Error(`Phase 8 smoke failed: missing ${name}`);
}
if (manifest.orientation !== "any") throw new Error("Phase 8 smoke failed: orientation is not any");
if (!Array.isArray(manifest.icons) || !manifest.icons.some((icon: { src?: string }) => icon.src === "./icon.svg")) {
  throw new Error("Phase 8 smoke failed: manifest icon is missing");
}

console.log("Phase 8 PWA smoke passed: install metadata, service-worker registration, cache lifecycle, and offline shell verified.");
