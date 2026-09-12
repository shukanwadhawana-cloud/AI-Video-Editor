import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const main = fs.readFileSync(path.join(root, "apps/ipad/src/main.tsx"), "utf8");
const store = fs.readFileSync(path.join(root, "apps/ipad/src/projectStore.ts"), "utf8");
const history = fs.readFileSync(path.join(root, "apps/ipad/src/phase9Persistence.ts"), "utf8");

const checks: Array<[string, boolean]> = [
  ["main imports Phase 9 persistence", main.includes('from "./phase9Persistence"')],
  ["main renders Undo control", main.includes("↶ Undo")],
  ["main renders Redo control", main.includes("↷ Redo")],
  ["main wires undo and redo state", main.includes("canUndo") && main.includes("canRedo")],
  ["IndexedDB project store exists", store.includes('indexedDB.open(DB_NAME, DB_VERSION)')],
  ["video blobs have a dedicated store", store.includes('const FILES_STORE = "files"')],
  ["project snapshots have a version", store.includes("version: 1")],
  ["project persistence is local", store.includes("nothing is uploaded")],
  ["history keeps bounded undo depth", history.includes("slice(-49)")],
  ["keyboard undo shortcut exists", history.includes('event.key.toLowerCase() === "z"')],
  ["keyboard redo shortcut exists", history.includes('event.key.toLowerCase() === "y"')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
if (failed.length) process.exit(1);
console.log("Phase 9 smoke test passed");
