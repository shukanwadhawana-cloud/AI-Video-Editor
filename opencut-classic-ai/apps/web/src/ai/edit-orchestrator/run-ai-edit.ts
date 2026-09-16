import type { FrameRate } from "opencut-wasm";
import type { SceneTracks } from "@/timeline/types";
import { generateHeuristicEditPlan, type DirectorTranscript } from "@/ai/edit-director";
import type { EditPlan } from "@/ai/edit-director/schema";
import { applyExecutionResult, collectExistingStableIds, executeEditPlan, type ApplicationResult, type ExecutionResult } from "@/ai/edit-executor";

export type AiEditStatus = "applied" | "empty" | "validation_failed" | "no_transcript" | "partial";
export interface AiEditResult {
	status: AiEditStatus; message: string; plan: EditPlan | null;
	execution: ExecutionResult | null; application: ApplicationResult | null; tracks: SceneTracks;
}

export function runAiEditOnTracks({
	transcript, tracks, fps, durationTicks, planId, now,
}: {
	transcript: DirectorTranscript | null | undefined;
	tracks: SceneTracks; fps: FrameRate; durationTicks: number; planId?: string; now?: string;
}): AiEditResult {
	if (!transcript || !transcript.segments?.length) {
		return { status: "no_transcript", message: "No transcript available. Generate a transcript first.", plan: null, execution: null, application: null, tracks };
	}
	const plan = generateHeuristicEditPlan({ transcript, fps, durationTicks, planId, now });
	if (plan.edits.length === 0) {
		return { status: "empty", message: "No edits were generated.", plan, execution: null, application: null, tracks };
	}
	const existingStableIds = collectExistingStableIds({ tracks });
	const execution = executeEditPlan({ context: { plan, projectFps: fps, durationTicks, existingStableIds } });
	if (execution.blueprints.length === 0 && execution.keyframes.length === 0) {
		return { status: "empty", message: "No supported edits to apply.", plan, execution, application: null, tracks };
	}
	const application = applyExecutionResult({ result: execution, tracks });
	const appliedCount = application.insertedElementIds.length + application.appliedKeyframeIds.length;
	const skippedCount = execution.skipped.length + application.skipped.length;
	return {
		status: skippedCount > 0 && appliedCount > 0 ? "partial" : appliedCount > 0 ? "applied" : "empty",
		message: appliedCount > 0
			? `Applied ${application.insertedElementIds.length} element(s) and ${application.appliedKeyframeIds.length} keyframe(s).`
			: "No edits were applied.",
		plan, execution, application, tracks: application.tracks,
	};
}
