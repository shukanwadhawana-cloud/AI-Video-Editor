# Phase 10 — Project Management & Editing Workflow Polish

Phase 10 builds on the local project persistence delivered in Phase 9.

## Included

- Local project naming with an 80-character safety limit.
- New Project flow with explicit destructive confirmation.
- Reset Edits flow that keeps imported media while restoring full clip ranges, clearing captions, and returning to original format.
- Duplicate current-project checkpoint using the existing local IndexedDB project/files.
- Clip rename by double-tapping the clip name.
- Clip duplication with a new clip ID, copied local media reference, copied captions, and selection of the new clip.
- Confirmation before destructive clip deletion.
- Responsive project-management controls for phones and tablets.
- Phase 10 smoke coverage plus all earlier Phase 7/8/9 CI gates.

## Local-only contract

Project metadata stays in browser storage. Project state and imported media continue to use the existing local IndexedDB store. No account, server upload, cloud project database, or paid API is introduced.

## Target workflow

Import → Name → Edit → Undo/Redo → Save locally → Reopen → Continue editing → Export.
