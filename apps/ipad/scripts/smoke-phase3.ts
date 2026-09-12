import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "apps/ipad/src/main.tsx"), "utf8");

// Source-level Phase 3 contracts. Runtime media rendering is covered separately by the
// existing compositor/jobs smoke tests; this gate verifies the iPad editor owns the
// multi-clip timeline/export behavior added in Phase 3.
const contracts: Array<[string, (source: string) => boolean]> = [
  ["multi-clip state", (s) => s.includes("const [clips, setClips] = React.useState<Clip[]>([])")],
  ["selected clip state", (s) => s.includes("const [selectedId, setSelectedId] = React.useState<string | null>(null)")],
  ["clip import supports multiple files", (s) => s.includes("multiple") && s.includes('accept="video/*"')],
  ["clip reorder implementation", (s) => s.includes("nextClips.splice(")],
  ["clip deletion implementation", (s) => s.includes("nextClips.splice(targetIndex, 1)")],
  ["segment-based cuts", (s) => s.includes("type Segment = { start: number; end: number }") && s.includes("segments: Segment[]")],
  ["segment removal logic", (s) => s.includes("function removeRange(")],
  ["concat export list", (s) => s.includes("concat-list.txt")],
  ["local concat export", (s) => s.includes('["-f", "concat", "-safe", "0", "-i", "concat-list.txt"]')],
  ["MP4 export", (s) => s.includes("ai-video-editor-project.mp4")],
  ["local FFmpeg engine", (s) => s.includes("new FFmpeg()")],
  ["export action", (s) => s.includes("const exportEdit = async")],
];

const failures = contracts.filter(([, check]) => !check(source)).map(([name]) => name);
if (failures.length) {
  console.error("Phase 3 smoke failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Phase 3 smoke passed: ${contracts.length} multi-clip timeline/export contracts verified.`);
