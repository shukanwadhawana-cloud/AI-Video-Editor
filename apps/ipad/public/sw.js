const CACHE_NAME = "ai-video-editor-shell-v4";
const APP_SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache the service-worker script or FFmpeg assets. These must always
  // be refreshed from the deployment so a broken engine cannot survive updates.
  if (url.pathname.endsWith("/sw.js") || url.pathname.endsWith("/ffmpeg-core.js") || url.pathname.endsWith("/ffmpeg-core.wasm")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-first for HTML so new deployments are picked up immediately;
  // fall back to the cached shell when offline.
  if (event.request.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => caches.match("./index.html")));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok && response.type === "basic") caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => caches.match("./index.html")))
  );
});
