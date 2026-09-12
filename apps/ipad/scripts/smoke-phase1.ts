import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const main = fs.readFileSync(path.join(root, "apps/ipad/src/main.tsx"), "utf8");
const index = fs.readFileSync(path.join(root, "apps/ipad/index.html"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "apps/ipad/package.json"), "utf8"));

const required = [
  ["React entrypoint", main.includes('createRoot(document.getElementById("root")!).render(<App />);')],
  ["video file picker", main.includes('type="file"') && main.includes('accept="video/*"')],
  ["local object URL preview", main.includes("URL.createObjectURL(file)")],
  ["video metadata/duration", main.includes("onloadedmetadata") && main.includes("probe.duration")],
  ["trim in/out controls", main.includes('aria-label="Trim start"') && main.includes('aria-label="Trim end"')],
  ["local FFmpeg engine", main.includes("new FFmpeg()") && main.includes("ffmpeg.load")],
  ["local media input", main.includes("ffmpeg.writeFile(inputName")],
  ["trim export", main.includes('"-ss"') && main.includes('"-t"') && main.includes('"-c:v", "libx264"')],
  ["downloadable MP4", main.includes('a.download') && main.includes('type: "video/mp4"')],
  ["PWA-capable HTML", index.includes('rel="manifest"') && index.includes("apple-mobile-web-app-capable")],
  ["iPad workspace dependency", pkg.name === "ai-video-editor-ipad" && pkg.dependencies?.["@ffmpeg/ffmpeg"]],
] as const;

const failures = required.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) {
  console.error("Phase 1 smoke failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Phase 1 smoke passed: ${required.length} iPad editor contracts verified.`);
