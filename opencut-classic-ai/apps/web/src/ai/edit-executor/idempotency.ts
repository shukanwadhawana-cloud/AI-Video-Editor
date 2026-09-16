import type { EditProvenance } from "./types";
import { EXECUTOR_ELEMENT_SOURCE } from "./types";
export function makeStableElementId({ planId, instructionId, role = "primary" }: { planId: string; instructionId: string; role?: string }): string {
	return `aiplan:${planId}:edit:${instructionId}:${role}`;
}
export function makeProvenance({ planId, instructionId }: { planId: string; instructionId: string }): EditProvenance {
	return { planId, instructionId, executorVersion: 1, source: EXECUTOR_ELEMENT_SOURCE };
}
