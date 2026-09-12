import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "apps/ipad/src/main.tsx"), "utf8");

// Source-level Phase 3 contracts. Runtime media rendering is covered separately by the
// existing compositor/jobs smoke tests; this gate verifies the iPad editor owns the
// multi-clip timeline/export behavior added in Phase 3.
const contracts: Array<[string, RegExp]> = [
  ["multi-clip state", /const \[clips, setClips\] = React\.useState<Clip\[\]>\(\[\]\)/],
  ["selected clip state", /const \[selectedId, setSelectedId\] = React\.useState<string \| null>\(null\)/],
  ["clip import supports multiple files", /multiple accept=\"video\/\*\"/],
  ["clip reorder up/down controls", /moveClip\(/],
  ["clip deletion", /deleteClip\(/],
  ["segment-based cuts", /segments: Segment\[\]\]/],
  ["segment removal logic", /function removeRange\(/],
  ["concat export list", /concat-list\.txt/],
  ["local concat export", /-f.*concat.*-safe.*0.*-i.*concat-list\.txt/],
  ["MP4 export", /ai-video-editor-project\.mp4/],
  ["local FFmpeg engine", /new FFmpeg\(\)/],
  ["export action", /const exportEdit = async/],
];

const failures = contracts.filter(([, pattern]) => !pattern.test(source)).map(([name]) => name);
if (failures.length) {
  console.error("Phase 3 smoke failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Phase 3 smoke passed: ${contracts.length} multi-clip timeline/export contracts verified.`);
