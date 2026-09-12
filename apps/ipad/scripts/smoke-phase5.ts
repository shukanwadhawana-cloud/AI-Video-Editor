import { readFileSync } from "node:fs";

const transcription = readFileSync("apps/ipad/src/transcription.ts", "utf8");
const main = readFileSync("apps/ipad/src/main.tsx", "utf8");
const packageJson = JSON.parse(readFileSync("apps/ipad/package.json", "utf8"));

const checks: Array<[string, boolean]> = [
  ["Transformers.js dependency", packageJson.dependencies?.["@huggingface/transformers"] === "^3.8.1"],
  ["Whisper tiny model", transcription.includes('onnx-community/whisper-tiny')],
  ["speech-recognition pipeline", transcription.includes('pipeline("automatic-speech-recognition"')],
  ["WebGPU local inference", transcription.includes('device: "webgpu"')],
  ["quantized local model", transcription.includes('dtype: "q4"')],
  ["WebAssembly CPU fallback", transcription.includes('device: "wasm"')],
  ["local FFmpeg audio extraction", transcription.includes('"-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le"')],
  ["timestamped transcription", transcription.includes('return_timestamps: true')],
  ["chunked Whisper transcription", transcription.includes('chunk_length_s: 30') && transcription.includes('stride_length_s: 5')],
  ["clip-relative timestamps shifted to source time", transcription.includes('start: start + chunkStart')],
  ["empty speech result handled", transcription.includes('return text ? [{ start, end, text }] : []')],
  ["temporary audio URL cleanup", transcription.includes('URL.revokeObjectURL(blobUrl)')],
  ["temporary FFmpeg input cleanup", transcription.includes('ffmpeg.deleteFile(inputName)')],
  ["temporary WAV cleanup", transcription.includes('ffmpeg.deleteFile(audioName)')],
  ["automatic caption UI action", main.includes('const autoCaption = async () =>')],
  ["automatic caption calls local transcription", main.includes('transcribeClip(ffmpeg, selectedClip.file, start, end, setStatus)')],
  ["generated captions stored in local state", main.includes('setCaptions((current) => [...current.filter((caption) => caption.clipId !== selectedClip.id), ...next]')],
  ["on-device Whisper status", main.includes('on-device Whisper')],
  ["no remote transcription API", !/openai|anthropic|gemini|replicate/i.test(transcription)],
];

let failed = 0;
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
  if (!passed) failed += 1;
}

if (failed) {
  console.error(`\nPhase 5 smoke failed: ${failed} check(s).`);
  process.exit(1);
}

console.log(`\nPhase 5 smoke passed: ${checks.length} local-Whisper checks.`);
