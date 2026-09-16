import type { TranscriptionResult } from "@/transcription/types";
import type { DirectorTranscript } from "@/ai/edit-director";

export const TRANSCRIPT_TICKS_PER_SECOND = 120_000;

/**
 * Convert legacy ASR float-second segments into DirectorTranscript (MediaTime ticks).
 * Authoritative AI input must not be CaptionChunk / float seconds.
 */
export function transcriptionResultToDirectorTranscript({
	result,
	documentId,
}: {
	result: TranscriptionResult;
	documentId?: string;
}): DirectorTranscript {
	return {
		id: documentId ?? `transcript-${Date.now().toString(36)}`,
		fullText: result.text ?? "",
		status: "complete",
		segments: (result.segments ?? []).map((seg, index) => {
			const start = Math.max(
				0,
				Math.round(Number(seg.start) * TRANSCRIPT_TICKS_PER_SECOND),
			);
			const end = Math.max(
				start,
				Math.round(Number(seg.end) * TRANSCRIPT_TICKS_PER_SECOND),
			);
			return {
				id: `seg-${index}`,
				text: seg.text ?? "",
				start,
				end,
			};
		}),
	};
}
