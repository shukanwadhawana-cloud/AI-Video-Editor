import { editPlanSchema, type EditPlan } from "@/ai/edit-director/schema";
import { mapInstructionToBlueprints } from "./mapping";
import type { AppliedEdit, ExecutionContext, ExecutionResult, SkippedEdit } from "./types";
import { DEFERRED_EXECUTION_TYPES, SUPPORTED_EXECUTION_TYPES } from "./types";

export function executeEditPlan({ context }: { context: ExecutionContext }): ExecutionResult {
	const warnings: string[] = [];
	const applied: AppliedEdit[] = [];
	const skipped: SkippedEdit[] = [];
	const parsed = editPlanSchema.safeParse(context.plan);
	if (!parsed.success) {
		return { ok: false, planId: context.plan?.id ?? "unknown", applied: [], skipped: [{ instructionId: "*", type: "*", reason: "Invalid EditPlan schema", code: "invalid_metadata" }], warnings: parsed.error.issues.map((i) => i.message), blueprints: [], keyframes: [] };
	}
	const plan: EditPlan = parsed.data;
	const existing = context.existingStableIds ?? new Set<string>();
	const durationTicks = context.durationTicks;
	if (!Number.isInteger(durationTicks) || durationTicks < 0) {
		return { ok: false, planId: plan.id, applied: [], skipped: [{ instructionId: "*", type: "*", reason: "Invalid durationTicks", code: "invalid_timing" }], warnings: [], blueprints: [], keyframes: [] };
	}
	for (const edit of plan.edits) {
		const target = edit.target as string;
		if (target === "master" || target === "main" || target === "source") {
			skipped.push({ instructionId: edit.id, type: edit.type, reason: "Master forbidden", code: "master_track_forbidden" });
			continue;
		}
		if (edit.end <= edit.start) { skipped.push({ instructionId: edit.id, type: edit.type, reason: "start < end required", code: "zero_duration" }); continue; }
		if (edit.start > durationTicks || edit.end > durationTicks) { skipped.push({ instructionId: edit.id, type: edit.type, reason: "Out of duration", code: "out_of_duration" }); continue; }
		if ((DEFERRED_EXECUTION_TYPES as readonly string[]).includes(edit.type)) {
			skipped.push({ instructionId: edit.id, type: edit.type, reason: `Deferred: ${edit.type}`, code: "unsupported_type" }); continue;
		}
		if (!(SUPPORTED_EXECUTION_TYPES as readonly string[]).includes(edit.type)) {
			skipped.push({ instructionId: edit.id, type: edit.type, reason: `Unsupported: ${edit.type}`, code: "unsupported_type" }); continue;
		}
		const mapped = mapInstructionToBlueprints({ edit, planId: plan.id, allowMainTransformKeyframes: context.allowMainTransformKeyframes ?? true });
		if (mapped.skipCode) {
			skipped.push({ instructionId: edit.id, type: edit.type, reason: mapped.skipReason ?? "Skipped", code: mapped.skipCode });
			continue;
		}
		const newBlueprints = mapped.blueprints.filter((bp) => !existing.has(bp.stableId));
		const newKeyframes = mapped.keyframes.filter((kf) => !existing.has(kf.stableId));
		if (newBlueprints.length === 0 && newKeyframes.length === 0) {
			skipped.push({ instructionId: edit.id, type: edit.type, reason: "Idempotent skip", code: "duplicate" });
			continue;
		}
		applied.push({ instructionId: edit.id, type: edit.type, blueprints: newBlueprints, keyframes: newKeyframes });
	}
	const blueprints = applied.flatMap((a) => a.blueprints);
	const keyframes = applied.flatMap((a) => a.keyframes);
	return { ok: !skipped.some((s) => s.code === "master_track_forbidden"), planId: plan.id, applied, skipped, warnings, blueprints, keyframes };
}
