# Phase 8 — Installable PWA & Offline App Shell

Phase 8 hardens the responsive phone/tablet editor as a real installable web app.

## Included
- Service worker for same-origin app-shell caching.
- Offline fallback to the cached editor shell.
- Cache versioning and cleanup on activation.
- PWA manifest metadata for installation and any orientation.
- Maskable SVG app icon.
- Service-worker registration from the app entry page.
- CI smoke coverage for registration, manifest, icon, cache lifecycle, and offline fallback.

## Scope
This caches the application shell only. Video files, FFmpeg core assets, and AI/Whisper model downloads are not silently cached because they can be large and device-dependent.
