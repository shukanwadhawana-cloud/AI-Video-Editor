# OpenCut AI Talking-Head Editor

AI enhancement layer on **[OpenCut Classic](https://github.com/OpenCut-app/opencut-classic)** for talking-head video:

- Canonical **TranscriptDocument** (MediaTime ticks)
- **AI Edit Director** (heuristic-local provider, Zod EditPlan)
- **Deterministic EditPlan → timeline executor**
- **Live editor application** via existing commands
- **Captions panel → AI Edit** button (see patches/)

Master talking-head video remains authoritative. AI only adds overlays / transform keyframes.

## Status

| Phase | Scope |
|-------|--------|
| 0 | Architecture audit (classic base) |
| 1 | Timeline safety (MediaTime / FPS) |
| 2–3 | Transcript + EditPlan director |
| 3.1 | Canonical transcript path |
| 4 | EditPlan → blueprints/keyframes |
| 4.1 | Apply to SceneTracks / commands |
| 4.2 | Live UI AI Edit |

**Not included yet (Phase 5+):** B-roll, AI image/video gen, SFX/music, renderer redesign.

## Setup

See `docs/INSTALL.md`. Merge `apps/web/src/ai/` into a local OpenCut Classic checkout, then apply the Captions UI snippet in `patches/ASSETS_VIEW_SNIPPET.md`.

```bash
git clone https://github.com/OpenCut-app/opencut-classic.git
cd opencut-classic
cp -R path/to/this/opencut-classic-ai/apps/web/src/ai apps/web/src/
# wire AI Edit button per patches/ASSETS_VIEW_SNIPPET.md
bun install && bun dev:web
```

## License

Upstream OpenCut Classic is MIT. This AI layer is provided under MIT for your project use.
