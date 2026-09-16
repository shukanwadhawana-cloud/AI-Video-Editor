import type { EditorCore } from "@/core";
import { runAiEditOnTracks, type AiEditResult } from "./run-ai-edit";
import type { DirectorTranscript } from "@/ai/edit-director";
import type { FrameRate } from "opencut-wasm";

export function runAiEditInEditor({
	editor, transcript,
}: {
	editor: EditorCore;
	transcript: DirectorTranscript | null | undefined;
}): AiEditResult {
	const project = editor.project.getActive();
	const fps = project.settings.fps as FrameRate;
	const durationTicks = (editor.timeline.getTotalDuration() as number) || (project.metadata.duration as number) || 0;
	const tracks = editor.scenes.getActiveScene().tracks;
	const result = runAiEditOnTracks({ transcript, tracks, fps, durationTicks });
	if (!result.application) return result;
	editor.timeline.updateTracks(result.application.tracks);
	editor.save.markDirty();
	return { ...result, tracks: editor.scenes.getActiveScene().tracks };
}

export function getTranscriptFromProject({ editor }: { editor: EditorCore }): DirectorTranscript | null {
	const project = editor.project.getActive() as { transcripts?: DirectorTranscript[] };
	const list = project.transcripts;
	if (!Array.isArray(list) || list.length === 0) return null;
	return list[0] ?? null;
}
