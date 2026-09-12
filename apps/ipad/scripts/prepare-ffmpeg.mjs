import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const VERSION = "0.12.10";
const base = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${VERSION}/dist/esm`;
const files = [
  ["ffmpeg-core.js", `${base}/ffmpeg-core.js`],
  ["ffmpeg-core.wasm", `${base}/ffmpeg-core.wasm`],
];

const publicDir = resolve(process.cwd(), "public");
await mkdir(publicDir, { recursive: true });

for (const [name, url] of files) {
  const target = resolve(publicDir, name);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  const data = new Uint8Array(await response.arrayBuffer());
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
  console.log(`Prepared ${name} (${data.byteLength} bytes)`);
}
