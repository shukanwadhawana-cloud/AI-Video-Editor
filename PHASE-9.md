# Phase 9 — Project persistence + Undo/Redo

Phase 9 turns the editor from a disposable browser session into a reusable local project.

## What changed

- Current project state is stored in IndexedDB.
- Imported video blobs are stored locally by clip ID so the project can reopen without re-importing media.
- The project restores automatically after reload/reopen.
- Up to 50 previous editor states are kept for Undo.
- Up to 50 forward states are kept for Redo.
- Undo/Redo buttons are visible on phone/tablet UI.
- `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, and `Ctrl/Cmd+Y` are supported when a hardware keyboard is available.
- Persistence is local-only; no project or media upload is introduced.

## Intentionally not persisted

Transient UI state such as the current command text, busy state, FFmpeg runtime, and browser video playback position is not part of the project model.

## Validation

The Phase 9 smoke gate checks the IndexedDB store, project snapshot versioning, local-only contract, bounded history, keyboard shortcuts, and visible Undo/Redo wiring. Existing Phase 7 responsive UI, Phase 8 PWA, typecheck, and build gates remain active.
