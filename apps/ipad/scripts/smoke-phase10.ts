import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "apps/ipad");
const main = fs.readFileSync(path.join(root, "src/main.tsx"), "utf8");
const manager = fs.readFileSync(path.join(root, "src/phase10ProjectManager.ts"), "utf8");
const styles = fs.readFileSync(path.join(root, "src/styles.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const checks: Array<[string, boolean]> = [
  ["Phase 9 persistence remains wired", main.includes("usePhase9Persistence")],
  ["Phase 10 manager is loaded", html.includes("phase10ProjectManager.ts")],
  ["Project naming uses local storage", manager.includes("ai-video-editor-project-name")],
  ["New project clears local storage", manager.includes("clearProject()")],
  ["Reset edits restores full clip ranges", manager.includes("start: 0, end: clip.duration")],
  ["Duplicate project preserves local files", manager.includes("saveProject(loaded.snapshot")],
  ["Duplicate clip gets a new id", manager.includes("const copyId = makeId()")],
  ["Duplicate clip preserves captions", manager.includes("clipId: copyId")],
  ["Clip rename is available", manager.includes("renameClip(index)")],
  ["Delete confirmation exists", manager.includes("Delete clip") && manager.includes("window.confirm")],
  ["Project panel is responsive", styles.includes(".project-panel") && styles.includes("@media (max-width: 600px)")],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
if (failed.length) process.exit(1);
console.log(`Phase 10 smoke passed: ${checks.length} checks`);
