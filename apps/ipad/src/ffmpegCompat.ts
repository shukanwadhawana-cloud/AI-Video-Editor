import { FFmpeg } from "@ffmpeg/ffmpeg";

// Host the single-thread FFmpeg core on the same origin as the PWA.
// This avoids the Safari/Vite worker + blob URL failure mode where ffmpeg.load()
// can remain pending forever. The build step downloads these two files into /public.
const LOCAL_CORE_URL = "/ffmpeg-core.js";
const LOCAL_WASM_URL = "/ffmpeg-core.wasm";
const originalLoad = FFmpeg.prototype.load;

FFmpeg.prototype.load = async function (config: any = {}) {
  const loadPromise = originalLoad.call(this, {
    ...config,
    coreURL: LOCAL_CORE_URL,
    wasmURL: LOCAL_WASM_URL,
  });

  // Never leave the UI permanently locked in "Working…" if the worker cannot start.
  return await Promise.race([
    loadPromise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("FFmpeg core failed to start within 60 seconds")), 60000),
    ),
  ]);
};

// iOS Safari may ignore programmatic <a download> for blob URLs.
// Open the generated local file instead so the user can save/share it.
document.addEventListener("click", (event) => {
  if (event.isTrusted) return;
  const target = event.target as HTMLElement | null;
  const anchor = target?.closest?.("a") as HTMLAnchorElement | null;
  if (!anchor || !anchor.download || !anchor.href.startsWith("blob:")) return;
  event.preventDefault();
  window.open(anchor.href, "_blank", "noopener,noreferrer");
}, true);
