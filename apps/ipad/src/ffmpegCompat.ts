import { FFmpeg } from "@ffmpeg/ffmpeg";

// Keep FFmpeg on the same deployed origin. Blob-wrapping the ESM core can
// break the worker's dynamic import on Safari/iOS; direct same-origin URLs
// avoid that worker/blob boundary entirely.
const CORE_BASE = new URL("./", document.baseURI).href;
const CORE_JS = new URL("ffmpeg-core.js", CORE_BASE).href;
const CORE_WASM = new URL("ffmpeg-core.wasm", CORE_BASE).href;
const originalLoad = FFmpeg.prototype.load;
const originalExec = FFmpeg.prototype.exec;

FFmpeg.prototype.load = async function (config: any = {}) {
  const timeoutMs = 30000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const loadPromise = originalLoad.call(this, {
      ...config,
      coreURL: CORE_JS,
      wasmURL: CORE_WASM,
    });
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("FFmpeg engine failed to start within 30 seconds")), timeoutMs);
    });
    return await Promise.race([loadPromise, timeoutPromise]);
  } catch (error) {
    try { this.terminate(); } catch {}
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

// Never let a render command leave the editor permanently busy.
FFmpeg.prototype.exec = function (args: string[], timeout = -1, ...rest: any[]) {
  return originalExec.call(this, args, timeout > 0 ? timeout : 120000, ...rest);
};

// iOS Safari can ignore programmatic <a download> for blob URLs. Open the
// generated local file instead so the user can save/share it.
document.addEventListener("click", (event) => {
  if (event.isTrusted) return;
  const target = event.target as HTMLElement | null;
  const anchor = target?.closest?.("a") as HTMLAnchorElement | null;
  if (!anchor || !anchor.download || !anchor.href.startsWith("blob:")) return;
  event.preventDefault();
  window.open(anchor.href, "_blank", "noopener,noreferrer");
}, true);
