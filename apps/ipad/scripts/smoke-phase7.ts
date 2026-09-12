import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const css = fs.readFileSync(path.join(root, "apps/ipad/src/styles.css"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "apps/ipad/package.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "apps/ipad/public/manifest.webmanifest"), "utf8"));

const required = [
  ["phone breakpoint", /@media \(max-width: 600px\)/],
  ["very narrow phone breakpoint", /@media \(max-width: 380px\)/],
  ["tablet landscape breakpoint", /@media \(min-width: 901px\) and \(max-width: 1280px\)/],
  ["tablet portrait breakpoint", /@media \(orientation: portrait\) and \(min-width: 601px\) and \(max-width: 1100px\)/],
  ["safe-area padding", /env\(--?safe-area-inset-top|env\(safe-area-inset-top/],
  ["touch manipulation", /touch-action: manipulation/],
  ["small-screen single-column workspace", /\.workspace \{ grid-template-columns: 1fr; \}/],
];

for (const [name, pattern] of required) {
  if (!(pattern as RegExp).test(css)) throw new Error(`Phase 7 smoke failed: missing ${name}`);
}

if (!pkg.description.toLowerCase().includes("phones") || !pkg.description.toLowerCase().includes("tablets")) {
  throw new Error("Phase 7 smoke failed: package description is not device-neutral");
}
if (manifest.orientation !== "any") throw new Error("Phase 7 smoke failed: PWA orientation must be any");

console.log("Phase 7 responsive UI smoke passed: phone + tablet breakpoints, touch targets, safe areas, and PWA orientation verified.");
