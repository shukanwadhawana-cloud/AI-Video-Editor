// FFmpeg WASM is loaded from jsDelivr at runtime. Cloudflare Pages has a 25 MiB
// per-file asset limit, while ffmpeg-core.wasm is ~31 MiB. Keep the build
// dependency-free and avoid copying that large binary into dist/.
console.log("FFmpeg core will be loaded from jsDelivr at runtime");
