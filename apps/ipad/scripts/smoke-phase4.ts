import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "apps/ipad/src/main.tsx"), "utf8");

// Source-level Phase 4 contracts. This gate validates the local caption track and SRT
// export surface; Phase 5 owns speech-to-text runtime validation separately.
const contracts: Array<[string, (s: string) => boolean]> = [
  ["caption model", (s) => s.includes("type Caption = { id: string; clipId: string; start: number; end: number; text: string }")],
  ["caption state", (s) => s.includes("const [captions, setCaptions] = React.useState<Caption[]>([])")],
  ["caption text editing state", (s) => s.includes("const [captionText, setCaptionText] = React.useState(\"\")")],
  ["caption timing state", (s) => s.includes("const [captionStart, setCaptionStart] = React.useState(0)") && s.includes("const [captionEnd, setCaptionEnd] = React.useState(3)")],
  ["caption creation", (s) => s.includes("const addCaption = () =>") && s.includes("setCaptions((current) =>")],
  ["caption deletion", (s) => s.includes("const deleteCaption = (id: string)") && s.includes("filter((caption) => caption.id !== id)")],
  ["SRT timestamp formatting", (s) => s.includes("function formatSrtTime(seconds: number)") && s.includes("${String(milli).padStart(3, \"0\")}")],
  ["SRT generation", (s) => s.includes("function captionsToSrt(captions: Caption[])") && s.includes("-->" )],
  ["SRT ordering", (s) => s.includes("captions.slice().sort((a, b) => a.start - b.start)")],
  ["local SRT export", (s) => s.includes("new Blob([captionsToSrt(captions)]") && s.includes("application/x-subrip")],
  ["SRT download", (s) => s.includes('a.download = \"ai-video-editor-captions.srt\"')],
  ["caption overlay timing", (s) => s.includes("currentTime") && s.includes("captions") && s.includes("caption.start") && s.includes("caption.end")],
  ["local-only caption status", (s) => s.includes("Caption added locally") && s.includes("Caption track exported")],
];

const failures = contracts.filter(([, check]) => !check(source)).map(([name]) => name);
if (failures.length) {
  console.error("Phase 4 smoke failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Phase 4 smoke passed: ${contracts.length} local caption/SRT contracts verified.`);
