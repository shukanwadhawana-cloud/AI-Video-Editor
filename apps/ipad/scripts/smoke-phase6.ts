import { applyPhase6Command, buildTimelineContext, cleanCaptionText, cleanCaptions, PHASE6_LOCAL_ONLY_CONTRACT } from "../src/phase6";

type Clip = { id: string; duration: number; segments: { start: number; end: number }[] };
type Caption = { id: string; clipId: string; start: number; end: number; text: string };

const clip: Clip = { id: "clip-1", duration: 60, segments: [{ start: 0, end: 60 }] };
const captions: Caption[] = [
  { id: "c1", clipId: "clip-1", start: 10, end: 14, text: "hello   world" },
  { id: "c2", clipId: "clip-1", start: 20, end: 24, text: "this is a test" },
];

const cleaned = cleanCaptionText("  hello   world  ");
if (cleaned !== "Hello world.") throw new Error(`caption cleanup failed: ${cleaned}`);
const cleanedAll = cleanCaptions(captions);
if (cleanedAll[0]?.text !== "Hello world.") throw new Error("bulk caption cleanup failed");

const removed = applyPhase6Command('remove the part where I say "hello world"', [clip], captions);
if (!removed.handled) throw new Error("caption-aware removal was not handled");
if (removed.clips[0]?.segments.some((s) => s.start < 14 && s.end > 10)) throw new Error("matched caption range was not removed");

const context = buildTimelineContext([clip], captions);
if (!context.includes("Clip 1") || !context.includes("transcript")) throw new Error("timeline context missing transcript");

const cleanCommand = applyPhase6Command("clean captions", [clip], captions);
if (!cleanCommand.handled || cleanCommand.captions[0]?.text !== "Hello world.") throw new Error("clean captions command failed");

if (!PHASE6_LOCAL_ONLY_CONTRACT.includes("No remote AI endpoint")) throw new Error("local-only contract missing");

console.log("Phase 6 local AI editing smoke passed");
