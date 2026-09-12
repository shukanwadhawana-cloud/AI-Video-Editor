import { FFmpeg } from "@ffmpeg/ffmpeg";

// Cloudflare Pages cannot serve the ~31 MiB FFmpeg WASM file because Pages
// limits individual assets to 25 MiB. Load the ESM core directly from the
// public jsDelivr CDN instead of wrapping it in blob URLs.
const CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
const CORE_JS = `${CORE_BASE}/ffmpeg-core.js`;
const CORE_WASM = `${CORE_BASE}/ffmpeg-core.wasm`;
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
