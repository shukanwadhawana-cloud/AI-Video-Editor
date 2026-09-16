# Install AI layer into OpenCut Classic

## Files to copy

```
apps/web/src/ai/edit-director/
apps/web/src/ai/edit-executor/
apps/web/src/ai/edit-orchestrator/
```

## UI

See `patches/ASSETS_VIEW_SNIPPET.md` for the Captions panel **AI Edit** button.

## Transcripts

For AI Edit to find a transcript, store it on `project.transcripts` after transcription, or extend `getTranscriptFromProject`.
