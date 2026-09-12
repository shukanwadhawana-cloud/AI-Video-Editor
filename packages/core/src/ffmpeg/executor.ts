import { execa, type ResultPromise } from "execa";

export const FFMPEG_BIN = process.env.AIVE_FFMPEG || "ffmpeg";
export const FFPROBE_BIN = process.env.AIVE_FFPROBE || "ffprobe";

export class FfmpegError extends Error {
  constructor(message: string, readonly command: string, readonly stderr: string) {
    super(message);
    this.name = "FfmpegError";
  }
}

export function ffmpegStderrDetail(stderr: string, maxLines = 5, maxChars = 600): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^(ffmpeg version|built with|configuration:|lib\w+\s+\d|Input #|Stream #|Press \[q\]|frame=|size=|video:|audio:|Output #|Metadata:)/i.test(l));
  const tail = lines.slice(-maxLines).join(" | ");
  return tail.length > maxChars ? `…${tail.slice(-maxChars)}` : tail;
}

export async function runFfprobe(args: string[]): Promise<string> {
  try {
    const { stdout } = await execa(FFPROBE_BIN, args, { reject: true });
    return stdout;
  } catch (err: unknown) {
    const e = err as { stderr?: string; shortMessage?: string; message?: string };
    throw new FfmpegError(`ffprobe failed: ${e.shortMessage || e.message || "unknown error"}`, `${FFPROBE_BIN} ${args.join(" ")}`, e.stderr || "");
  }
}

export interface FfmpegRunOptions {
  onProgress?: (fraction: number) => void;
  totalDuration?: number;
  signal?: AbortSignal;
  cwd?: string;
}

export async function runFfmpeg(args: string[], opts: FfmpegRunOptions = {}): Promise<void> {
  const child: ResultPromise = execa(FFMPEG_BIN, args, {
    reject: true,
    buffer: { stdout: false, stderr: true },
    cancelSignal: opts.signal,
    cwd: opts.cwd,
  });

  if (opts.onProgress && opts.totalDuration && opts.totalDuration > 0 && child.stdout) {
    let buf = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line.startsWith("out_time_us=") || line.startsWith("out_time_ms=")) {
          const raw = Number(line.split("=")[1]);
          if (Number.isFinite(raw)) {
            const seconds = raw / 1e6;
            const frac = Math.max(0, Math.min(1, seconds / opts.totalDuration!));
            opts.onProgress!(frac);
          }
        }
      }
    });
  }

  try {
    await child;
  } catch (err: unknown) {
    const e = err as { stderr?: string; shortMessage?: string; message?: string; isCanceled?: boolean };
    if (e.isCanceled) {
      if (child.exitCode === null) {
        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
          };
          child.once("close", finish);
          const timer = setTimeout(finish, 5000);
          timer.unref?.();
        });
      }
      throw new FfmpegError("ffmpeg render canceled", `${FFMPEG_BIN} ${args.join(" ")}`, e.stderr || "");
    }
    const detail = ffmpegStderrDetail(e.stderr || "");
    throw new FfmpegError(`ffmpeg failed${detail ? `: ${detail}` : `: ${e.shortMessage || e.message || "unknown error"}`}`, `${FFMPEG_BIN} ${args.join(" ")}`, e.stderr || "");
  }
}

export async function runFfmpegStdoutBuffer(args: string[]): Promise<Buffer> {
  const { stdout } = await execa(FFMPEG_BIN, args, { reject: true, encoding: "buffer" });
  return stdout as unknown as Buffer;
}

export async function runFfmpegCaptureStderr(args: string[]): Promise<string> {
  try {
    const result = await execa(FFMPEG_BIN, args, { reject: false, all: false });
    return result.stderr ?? "";
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    return e.stderr ?? e.message ?? "";
  }
}

let encodersPromise: Promise<Set<string>> | null = null;

export function detectEncoders(): Promise<Set<string>> {
  if (!encodersPromise) {
    encodersPromise = execa(FFMPEG_BIN, ["-hide_banner", "-encoders"], { reject: true })
      .then((r) => {
        const names = new Set<string>();
        for (const line of r.stdout.split(/\r?\n/)) {
          const m = /^\s*[A-Z.]{6}\s+(\S+)/.exec(line);
          if (m) names.add(m[1]);
        }
        return names;
      })
      .catch(() => new Set<string>());
  }
  return encodersPromise;
}

const HW_ENCODERS: Record<"h264" | "h265", string[]> = {
  h264: ["h264_nvenc", "h264_qsv", "h264_amf", "h264_videotoolbox"],
  h265: ["hevc_nvenc", "hevc_qsv", "hevc_amf", "hevc_videotoolbox"],
};

export async function pickHwEncoder(codec: "h264" | "h265"): Promise<string | null> {
  if ((process.env.AIVE_HWENC ?? "auto").toLowerCase() === "off") return null;
  const available = await detectEncoders();
  return HW_ENCODERS[codec].find((e) => available.has(e)) ?? null;
}

export async function checkBinaries(): Promise<{ ffmpeg: string; ffprobe: string }> {
  const [ff, fp] = await Promise.all([
    execa(FFMPEG_BIN, ["-version"]).then((r) => r.stdout.split("\n")[0]),
    execa(FFPROBE_BIN, ["-version"]).then((r) => r.stdout.split("\n")[0]),
  ]);
  return { ffmpeg: ff, ffprobe: fp };
}