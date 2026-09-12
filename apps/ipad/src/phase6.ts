export type Phase6Segment = { start: number; end: number };
export type Phase6Clip = { id: string; duration: number; segments: Phase6Segment[] };
export type Phase6Caption = { id: string; clipId: string; start: number; end: number; text: string };

export type Phase6Result = {
  clips: Phase6Clip[];
  captions: Phase6Caption[];
  handled: boolean;
  message: string;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

function removeRange(clip: Phase6Clip, from: number, to: number): Phase6Clip {
  const start = clamp(Math.min(from, to), 0, clip.duration);
  const end = clamp(Math.max(from, to), 0, clip.duration);
  if (end - start < 0.05) return clip;
  const next: Phase6Segment[] = [];
  for (const segment of clip.segments) {
    if (end <= segment.start || start >= segment.end) next.push(segment);
    else {
      if (start > segment.start) next.push({ start: segment.start, end: Math.min(start, segment.end) });
      if (end < segment.end) next.push({ start: Math.max(end, segment.start), end: segment.end });
    }
  }
  return { ...clip, segments: next.filter((segment) => segment.end - segment.start >= 0.05) };
}

function findPhraseMatch(captions: Phase6Caption[], phrase: string) {
  const target = normalize(phrase);
  if (!target) return null;
  const exact = captions.find((caption) => normalize(caption.text).includes(target));
  if (exact) return exact;
  const words = target.split(" ").filter(Boolean);
  if (!words.length) return null;
  return captions.find((caption) => {
    const text = normalize(caption.text);
    const hits = words.filter((word) => text.includes(word)).length;
    return hits >= Math.max(1, Math.ceil(words.length * 0.7));
  }) || null;
}

export function cleanCaptionText(text: string) {
  let value = text.replace(/\s+/g, " ").trim();
  value = value.replace(/\bi\b/g, "I");
  if (value) value = value.charAt(0).toUpperCase() + value.slice(1);
  value = value.replace(/\s+([,.!?])/g, "$1");
  if (value && !/[.!?]$/.test(value)) value += ".";
  return value;
}

export function cleanCaptions(captions: Phase6Caption[]) {
  return captions.map((caption) => ({ ...caption, text: cleanCaptionText(caption.text) }));
}

export function buildTimelineContext(clips: Phase6Clip[], captions: Phase6Caption[]) {
  const lines = clips.map((clip, index) => {
    const kept = clip.segments.reduce((sum, segment) => sum + Math.max(0, segment.end - segment.start), 0);
    const words = captions.filter((caption) => caption.clipId === clip.id).map((caption) => caption.text).join(" ");
    return `Clip ${index + 1}: ${kept.toFixed(2)}s kept${words ? ` • transcript: ${words}` : ""}`;
  });
  return lines.join("\n");
}

export function applyPhase6Command(command: string, clips: Phase6Clip[], captions: Phase6Caption[]): Phase6Result {
  const text = command.trim();
  const lower = text.toLowerCase();
  if (!text) return { clips, captions, handled: false, message: "Type an edit command" };

  if (/\b(clean|fix|polish)\b.*\b(captions|subtitles|transcript)\b/.test(lower) || /\b(captions|subtitles)\b.*\b(clean|fix|polish)\b/.test(lower)) {
    return { clips, captions: cleanCaptions(captions), handled: true, message: `Cleaned ${captions.length} caption${captions.length === 1 ? "" : "s"} locally` };
  }

  const phraseMatch = text.match(/\b(?:remove|delete|cut)\s+(?:the\s+)?(?:part|section|moment)?\s*(?:where|when|that)\s+(?:i|I)\s+(?:say|said|mention|mentioned)\s+["“']?(.+?)["”']?$/i);
  if (phraseMatch && captions.length) {
    const match = findPhraseMatch(captions, phraseMatch[1]);
    if (!match) return { clips, captions, handled: true, message: `I couldn't find “${phraseMatch[1]}” in the local transcript` };
    const nextClips = clips.map((clip) => clip.id === match.clipId ? removeRange(clip, match.start, match.end) : clip);
    const nextCaptions = captions.filter((caption) => caption.id !== match.id && caption.clipId !== match.clipId || caption.end <= match.start || caption.start >= match.end);
    return { clips: nextClips, captions: nextCaptions, handled: true, message: `Removed the section matching “${match.text.trim()}” locally` };
  }

  if (/\b(show|summarize|describe)\b.*\b(timeline|edit|project)\b/.test(lower)) {
    return { clips, captions, handled: true, message: buildTimelineContext(clips, captions) || "Timeline is empty" };
  }

  return { clips, captions, handled: false, message: "No Phase 6 command matched; using the existing local edit parser" };
}

export const PHASE6_LOCAL_ONLY_CONTRACT = "No remote AI endpoint; commands, caption cleanup, transcript matching, and timeline context run locally.";
