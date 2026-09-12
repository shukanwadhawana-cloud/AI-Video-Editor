import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

// Vite + ffmpeg.wasm is most reliable with the ESM core. Keep the core local
// to the deployed origin, then convert the local assets to blob URLs so the
// worker can import them without cross-origin restrictions.
const CORE_BASE = new URL("./", window.location.href).href;
const CORE_JS = `${CORE_BASE}ffmpeg-core.js`;
const CORE_WASM = `${CORE_BASE}ffmpeg-core.wasm`;
const originalLoad = FFmpeg.prototype.load;
const originalExec = FFmpeg.prototype.exec;

FFmpeg.prototype.load = async function (config: any = {}) {
  const coreURL = await toBlobURL(CORE_JS, "text/javascript");
  const wasmURL = await toBlobURL(CORE_WASM, "application/wasm");
  return await Promise.race([
    originalLoad.call(this, { ...config, coreURL, wasmURL }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("FFmpeg engine failed to start within 30 seconds")), 30000)),
  ]);
};

// Prevent a transcoding command from locking the editor indefinitely.
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
