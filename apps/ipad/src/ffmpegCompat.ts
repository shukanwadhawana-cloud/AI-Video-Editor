import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

const ESM_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
const originalLoad = FFmpeg.prototype.load;

FFmpeg.prototype.load = async function (config: any = {}) {
  const coreURL = await toBlobURL(`${ESM_BASE}/ffmpeg-core.js`, "text/javascript");
  const wasmURL = await toBlobURL(`${ESM_BASE}/ffmpeg-core.wasm`, "application/wasm");
  return originalLoad.call(this, { ...config, coreURL, wasmURL });
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
