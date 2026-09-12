import { pipeline } from "@huggingface/transformers";
import type { FFmpeg } from "@ffmpeg/ffmpeg";

const MODEL = "onnx-community/whisper-tiny";
let transcriberPromise: Promise<any> | null = null;

export type TranscriptSegment = { start: number; end: number; text: string };
type WhisperResult = { text?: string; chunks?: Array<{ timestamp?: [number | null, number | null]; text?: string }> };

async function getTranscriber(onProgress?: (message: string) => void) {
  if (!transcriberPromise) {
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

export async function transcribeClip(
  ffmpeg: FFmpeg,
  inputPath: string,
  start: number,
  end: number,
  onProgress?: (message: string) => void,
): Promise<TranscriptSegment[]> {
  const audioName = `stt-audio-${Date.now()}.wav`;
  onProgress?.("Extracting only the selected audio locally…");
  await ffmpeg.exec([
    "-ss", start.toFixed(3),
    "-i", inputPath,
    "-t", Math.max(0.1, end - start).toFixed(3),
    "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audioName,
  ], 180000);

  const wav = await ffmpeg.readFile(audioName);
  const bytes = typeof wav === "string" ? new TextEncoder().encode(wav) : wav;
  const blobUrl = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "audio/wav" }));

  try {
    const transcriber = await getTranscriber(onProgress);
    onProgress?.("Transcribing locally on this iPad…");
    const result = await transcriber(blobUrl, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    } as any) as WhisperResult;

    const chunks = (result.chunks || []).map((chunk) => {
      const timestamp = chunk.timestamp || [0, 0];
      const chunkStart = typeof timestamp[0] === "number" ? timestamp[0] : 0;
      const chunkEnd = typeof timestamp[1] === "number" ? timestamp[1] : chunkStart + 2;
      return {
        start: start + chunkStart,
        end: start + Math.max(chunkEnd, chunkStart + 0.05),
        text: (chunk.text || "").trim(),
      };
    }).filter((chunk) => chunk.text);

    if (chunks.length) return chunks;
    const text = (result.text || "").trim();
    return text ? [{ start, end, text }] : [];
  } finally {
    URL.revokeObjectURL(blobUrl);
    try { await ffmpeg.deleteFile(audioName); } catch {}
  }
}
