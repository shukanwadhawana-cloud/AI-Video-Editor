import { pipeline } from "@huggingface/transformers";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

const MODEL = "onnx-community/whisper-tiny";
let transcriberPromise: Promise<any> | null = null;

export type TranscriptSegment = { start: number; end: number; text: string };
type WhisperResult = { text?: string; chunks?: Array<{ timestamp?: [number | null, number | null]; text?: string }> };

async function getTranscriber(onProgress?: (message: string) => void) {
  if (!transcriberPromise) {
    // Safari/WebGPU can initialize successfully but stall during first inference.
    // Prefer the WASM CPU backend for predictable local execution, then use WebGPU
    // only as a fallback if WASM is unavailable.
    onProgress?.("Loading local Whisper model… first run downloads and caches it on-device.");
    transcriberPromise = pipeline("automatic-speech-recognition", MODEL, {
      device: "wasm",
      dtype: "q4",
      progress_callback: (progress: { status?: string; progress?: number }) => {
        if (progress.status === "progress" && typeof progress.progress === "number") onProgress?.(`Downloading Whisper model • ${Math.round(progress.progress)}%`);
      },
    } as any) as Promise<any>;
  }
  try {
    return await transcriberPromise;
  } catch {
    transcriberPromise = null;
    onProgress?.("WASM unavailable; retrying Whisper with WebGPU…");
    transcriberPromise = pipeline("automatic-speech-recognition", MODEL, { device: "webgpu", dtype: "q4" } as any) as Promise<any>;
    return await transcriberPromise;
  }
}

export async function transcribeClip(ffmpeg: FFmpeg, file: File, start: number, end: number, onProgress?: (message: string) => void): Promise<TranscriptSegment[]> {
  const inputName = `stt-input${file.name.match(/\.[^.]+$/)?.[0] || ".mp4"}`;
  const audioName = "stt-audio.wav";
  await ffmpeg.writeFile(inputName, await fetchFile(file));
  onProgress?.("Extracting audio locally…");
  await ffmpeg.exec(["-ss", start.toFixed(3), "-i", inputName, "-t", Math.max(0.1, end - start).toFixed(3), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audioName]);
  const wav = await ffmpeg.readFile(audioName), bytes = typeof wav === "string" ? new TextEncoder().encode(wav) : wav;
  const blobUrl = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "audio/wav" }));
  try {
    const transcriber = await getTranscriber(onProgress);
    onProgress?.("Transcribing locally on this iPad…");
    const result = await transcriber(blobUrl, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 } as any) as WhisperResult;
    const chunks = (result.chunks || []).map((chunk) => {
      const timestamp = chunk.timestamp || [0, 0], chunkStart = typeof timestamp[0] === "number" ? timestamp[0] : 0, chunkEnd = typeof timestamp[1] === "number" ? timestamp[1] : chunkStart + 2;
      return { start: start + chunkStart, end: start + Math.max(chunkEnd, chunkStart + 0.05), text: (chunk.text || "").trim() };
    }).filter((chunk) => chunk.text);
    if (chunks.length) return chunks;
    const text = (result.text || "").trim();
    return text ? [{ start, end, text }] : [];
  } finally {
    URL.revokeObjectURL(blobUrl);
    try { await ffmpeg.deleteFile(inputName); } catch {}
    try { await ffmpeg.deleteFile(audioName); } catch {}
  }
}
