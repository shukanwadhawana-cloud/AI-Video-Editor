import type { EditPlan, EditInstruction } from "./schema";
import type { FrameRate } from "opencut-wasm";

export interface DirectorTranscript {
	id: string;
	fullText: string;
	segments: Array<{ id: string; text: string; start: number; end: number }>;
	status?: string;
}

const EMPHASIS_KEYWORDS = ["important", "key", "critical", "remember", "note", "first", "second", "third", "because", "therefore"];

export function generateHeuristicEditPlan({
	transcript, fps, durationTicks, planId, now,
}: {
	transcript: DirectorTranscript;
	fps: FrameRate;
	durationTicks: number;
	planId?: string;
	now?: string;
}): EditPlan {
	const edits: EditInstruction[] = [];
	const id = planId ?? `plan-${Date.now().toString(36)}`;
	let editIdx = 0;
	const nextId = () => `edit-${++editIdx}`;
	for (const seg of transcript.segments) {
		if (seg.end > durationTicks || seg.start >= seg.end) continue;
		const lower = seg.text.toLowerCase();
		for (const kw of EMPHASIS_KEYWORDS) {
			if (lower.includes(kw)) {
				const start = seg.start;
				const end = Math.min(seg.end, start + Math.max(1, Math.round((seg.end - seg.start) * 0.4)));
				if (end > start) {
					edits.push({
						id: nextId(), type: "keyword_emphasis", start, end, priority: 2,
						reason: `Keyword "${kw}"`, target: "caption", sourceSegmentId: seg.id,
						metadata: { keyword: kw, style: "highlight" },
					});
				}
				break;
			}
		}
		if (/\d/.test(seg.text) || lower.includes("step") || lower.includes("process")) {
			edits.push({
				id: nextId(), type: "callout", start: seg.start, end: Math.min(durationTicks, Math.max(seg.start + 1, seg.end)),
				priority: 3, reason: "Callout for instructional content", target: "overlay", sourceSegmentId: seg.id,
				metadata: { text: seg.text.slice(0, 48), placement: "right" },
			});
		}
	}
	if (transcript.segments.length > 0) {
		const seg = transcript.segments[0];
		const mid = Math.round((seg.start + seg.end) / 2);
		const start = Math.max(seg.start, mid - 2000);
		const end = Math.min(durationTicks, mid + 2000);
		if (end > start) {
			edits.push({
				id: nextId(), type: "punch_in", start, end, priority: 4, reason: "Subtle emphasis zoom",
				target: "effect", metadata: { fromScale: 1, toScale: 1.08, easing: "ease_in_out" },
			});
		}
	}
	return {
		schemaVersion: 1, id, createdAt: now ?? new Date().toISOString(),
		source: { fps, durationTicks, transcriptId: transcript.id },
		edits, providerId: "heuristic-local", densityProfile: "balanced",
	};
}
