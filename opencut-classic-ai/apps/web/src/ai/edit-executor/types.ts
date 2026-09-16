import type { FrameRate } from "opencut-wasm";
import type { EditPlan, EditType } from "@/ai/edit-director/schema";
export const EXECUTOR_ELEMENT_SOURCE = "ai-edit-plan" as const;
export const AI_STABLE_ID_PARAM = "aiStableId" as const;
export interface EditProvenance { planId: string; instructionId: string; executorVersion: 1; source: typeof EXECUTOR_ELEMENT_SOURCE; }
export type BlueprintKind = "text" | "graphic" | "lower_third" | "diagram_node" | "transform_keyframe" | "transition_marker";
export interface TimelineElementBlueprint {
	kind: BlueprintKind; stableId: string; trackHint: "text" | "graphic" | "effect" | "overlay";
	start: number; duration: number; provenance: EditProvenance; payload: Record<string, unknown>;
}
export interface KeyframeBlueprint {
	stableId: string; propertyPath: string; localTime: number; value: number;
	interpolation?: "linear" | "ease_in" | "ease_out" | "ease_in_out";
	provenance: EditProvenance; target: "main_video_transform";
}
export interface AppliedEdit { instructionId: string; type: EditType; blueprints: TimelineElementBlueprint[]; keyframes: KeyframeBlueprint[]; }
export interface SkippedEdit {
	instructionId: string; type: string; reason: string;
	code: "unsupported_type" | "master_track_forbidden" | "invalid_timing" | "out_of_duration" | "duplicate" | "invalid_metadata" | "zero_duration" | "renderer_unavailable";
}
export interface ExecutionResult {
	ok: boolean; planId: string; applied: AppliedEdit[]; skipped: SkippedEdit[]; warnings: string[];
	blueprints: TimelineElementBlueprint[]; keyframes: KeyframeBlueprint[];
}
export interface ExecutionContext {
	plan: EditPlan; projectFps: FrameRate; durationTicks: number;
	existingStableIds?: ReadonlySet<string>; allowMainTransformKeyframes?: boolean;
}
export const SUPPORTED_EXECUTION_TYPES: readonly EditType[] = [
	"keyword_emphasis","caption_emphasis","callout","graphic","diagram","lower_third",
	"zoom_in","zoom_out","punch_in","punch_out","transition",
] as const;
export const DEFERRED_EXECUTION_TYPES: readonly EditType[] = ["broll","ai_broll","screen_insert","sfx","music"] as const;
