import type { FFmpeg } from "@ffmpeg/ffmpeg";

/**
 * Mount a user File through WORKERFS instead of copying its bytes into MEMFS.
 * WORKERFS is read-only and intended specifically for large browser File/Blob inputs.
 * The mounted source therefore stays outside the WASM heap while FFmpeg reads it.
 */
export async function withMountedInput<T>(
  ffmpeg: FFmpeg,
  file: File,
  mountId: string,
  task: (inputPath: string) => Promise<T>,
): Promise<T> {
  const mountPoint = `/input-${mountId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const inputPath = `${mountPoint}/${file.name}`;

  await ffmpeg.createDir(mountPoint);
  try {
    await ffmpeg.mount("WORKERFS", { files: [file] }, mountPoint);
    return await task(inputPath);
  } catch (error) {
    try { await ffmpeg.unmount(mountPoint); } catch {}
    try { await ffmpeg.deleteDir(mountPoint); } catch {}
    throw error;
  } finally {
    try { await ffmpeg.unmount(mountPoint); } catch {}
    try { await ffmpeg.deleteDir(mountPoint); } catch {}
  }
}
