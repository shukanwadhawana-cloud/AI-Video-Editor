import React from "react";
import { createRoot } from "react-dom/client";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import "./styles.css";

const CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

type Segment = { start: number; end: number };
type Clip = { id: string; file: File; url: string; duration: number; name: string; segments: Segment[] };
type Caption = { id: string; start: number; end: number; text: string };
type EditPlan = { label: string; vertical: boolean };
type CommandResult = { clips: Clip[]; selectedId: string | null; vertical: boolean; message: string };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
function totalKept(clip: Clip) { return clip.segments.reduce((sum, segment) => sum + Math.max(0, segment.end - segment.start), 0); }
function normalizeSegments(segments: Segment[], duration: number) {
  return segments.map((segment) => ({ start: clamp(segment.start, 0, duration), end: clamp(segment.end, 0, duration) })).filter((segment) => segment.end - segment.start >= 0.05).sort((a, b) => a.start - b.start);
}
function removeRange(clip: Clip, from: number, to: number): Clip {
  const start = clamp(Math.min(from, to), 0, clip.duration), end = clamp(Math.max(from, to), 0, clip.duration);
  if (end - start < 0.05) return clip;
  const next: Segment[] = [];
  for (const segment of clip.segments) {
    if (end <= segment.start || start >= segment.end) next.push(segment);
    else { if (start > segment.start) next.push({ start: segment.start, end: Math.min(start, segment.end) }); if (end < segment.end) next.push({ start: Math.max(end, segment.start), end: segment.end }); }
  }
  return { ...clip, segments: normalizeSegments(next, clip.duration) };
}
function parseCommand(command: string, clips: Clip[], selectedId: string | null, vertical: boolean): CommandResult {
  const text = command.trim().toLowerCase(); let nextClips = [...clips], nextSelected = selectedId, nextVertical = vertical;
  if (!text) return { clips, selectedId, vertical, message: "Type an edit command" };
  const selectedIndex = selectedId ? nextClips.findIndex((clip) => clip.id === selectedId) : -1;
  const selected = selectedIndex >= 0 ? nextClips[selectedIndex] : nextClips[0];
  if (/\b(reset|clear|undo all)\b/.test(text)) { nextClips = nextClips.map((clip) => ({ ...clip, segments: [{ start: 0, end: clip.duration }] })); nextVertical = false; }
  if (/\b(9\s*[:x]\s*16|vertical|portrait|reel|reels|instagram reel|shorts?)\b/.test(text)) nextVertical = true;
  if (/\b(16\s*[:x]\s*9|horizontal|landscape)\b/.test(text)) nextVertical = false;
  const clipNumber = text.match(/\b(?:clip|video)\s+(\d+)\b/);
  const targetIndex = clipNumber ? Number(clipNumber[1]) - 1 : selectedIndex >= 0 ? selectedIndex : 0;
  if (/\b(delete|remove)\s+(?:clip|video)\s+\d+\b/.test(text) && targetIndex >= 0 && targetIndex < nextClips.length) {
    nextClips.splice(targetIndex, 1); nextSelected = nextClips[Math.min(targetIndex, nextClips.length - 1)]?.id || null;
    return { clips: nextClips, selectedId: nextSelected, vertical: nextVertical, message: `Deleted clip ${targetIndex + 1}` };
  }
  const move = text.match(/\b(?:put|move)\s+(?:clip|video)\s+(\d+)\s+(after|before)\s+(?:clip|video)\s+(\d+)\b/);
  if (move) {
    const from = Number(move[1]) - 1; let to = Number(move[3]) - 1;
    if (from >= 0 && from < nextClips.length && to >= 0 && to < nextClips.length && from !== to) { const [item] = nextClips.splice(from, 1); if (from < to) to -= 1; if (move[2] === "after") to += 1; nextClips.splice(clamp(to, 0, nextClips.length), 0, item); nextSelected = item.id; return { clips: nextClips, selectedId: nextSelected, vertical: nextVertical, message: `Reordered clip ${from + 1}` }; }
  }
  const number = "([0-9]+(?:\\.[0-9]+)?)";
  const first = text.match(new RegExp(`(?:remove|delete|cut|trim)\\s+(?:the\\s+)?first\\s+${number}\\s*(?:s|sec|secs|second|seconds)?`));
  const last = text.match(new RegExp(`(?:remove|delete|cut|trim)\\s+(?:the\\s+)?last\\s+${number}\\s*(?:s|sec|secs|second|seconds)?`));
  const range = text.match(new RegExp(`(?:remove|delete|cut)\\s+(?:the\\s+)?(?:middle\\s+)?${number}\\s*(?:s|sec|secs|second|seconds)?\\s*(?:to|-)\\s*${number}\\s*(?:s|sec|secs|second|seconds)?`));
  const middle = text.match(new RegExp(`(?:remove|delete|cut)\\s+(?:the\\s+)?middle\\s+${number}\\s*(?:s|sec|secs|second|seconds)?`));
  const keep = text.match(new RegExp(`(?:keep|trim)\\s+(?:from\\s+)?${number}\\s*(?:s|sec|secs|second|seconds)?\\s*(?:to|-)\\s*${number}\\s*(?:s|sec|secs|second|seconds)?`));
  if (selected && targetIndex >= 0 && targetIndex < nextClips.length) {
    let edited = nextClips[targetIndex];
    if (first) edited = removeRange(edited, edited.segments[0]?.start || 0, (edited.segments[0]?.start || 0) + Number(first[1]));
    else if (last) { const end = edited.segments[edited.segments.length - 1]?.end || edited.duration; edited = removeRange(edited, end - Number(last[1]), end); }
    else if (range) edited = removeRange(edited, Number(range[1]), Number(range[2]));
    else if (middle) { const amount = Number(middle[1]), center = edited.duration / 2; edited = removeRange(edited, center - amount / 2, center + amount / 2); }
    else if (keep) { const start = clamp(Number(keep[1]), 0, edited.duration), end = clamp(Number(keep[2]), start + 0.05, edited.duration); edited = { ...edited, segments: [{ start, end }] }; }
    nextClips[targetIndex] = edited;
  }
  const changed = first || last || range || middle || keep || /\b(reset|clear|undo all)\b/.test(text) || /\b(9\s*[:x]\s*16|vertical|portrait|reel|reels|instagram reel|shorts?|16\s*[:x]\s*9|horizontal|landscape)\b/.test(text);
  if (!changed) return { clips, selectedId, vertical, message: "Try: remove the middle 5 seconds, cut 10–20 seconds, delete clip 2, or put clip 2 after clip 1." };
  const selectedAfter = nextClips[targetIndex];
  return { clips: nextClips, selectedId: nextSelected, vertical: nextVertical, message: `Applied locally • ${selectedAfter ? `Clip ${targetIndex + 1}: ${totalKept(selectedAfter).toFixed(1)}s kept` : `${nextClips.length} clips`}${nextVertical ? " • 9:16 vertical" : ""}` };
}
function formatSrtTime(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000)), h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), milli = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(milli).padStart(3, "0")}`;
}
function captionsToSrt(captions: Caption[]) { return captions.slice().sort((a, b) => a.start - b.start).map((caption, i) => `${i + 1}\n${formatSrtTime(caption.start)} --> ${formatSrtTime(caption.end)}\n${caption.text.trim()}\n`).join("\n"); }

function App() {
  const [clips, setClips] = React.useState<Clip[]>([]); const [selectedId, setSelectedId] = React.useState<string | null>(null); const [vertical, setVertical] = React.useState(false); const [command, setCommand] = React.useState("");
  const [plan, setPlan] = React.useState<EditPlan>({ label: "Original format", vertical: false }); const [busy, setBusy] = React.useState(false); const [status, setStatus] = React.useState("Import videos to begin");
  const [captions, setCaptions] = React.useState<Caption[]>([]); const [captionText, setCaptionText] = React.useState(""); const [captionStart, setCaptionStart] = React.useState(0); const [captionEnd, setCaptionEnd] = React.useState(3);
  const videoRef = React.useRef<HTMLVideoElement>(null); const inputRef = React.useRef<HTMLInputElement>(null); const ffmpegRef = React.useRef<FFmpeg | null>(null);
  const selectedIndex = selectedId ? clips.findIndex((clip) => clip.id === selectedId) : -1; const selectedClip = selectedIndex >= 0 ? clips[selectedIndex] : null;
  const selectedStart = selectedClip?.segments[0]?.start ?? 0; const selectedEnd = selectedClip?.segments[selectedClip.segments.length - 1]?.end ?? selectedClip?.duration ?? 0;
  const currentTime = videoRef.current?.currentTime ?? 0;

  const importVideos = (files: FileList | null) => {
    if (!files?.length) return; const videoFiles = Array.from(files).filter((file) => file.type.startsWith("video/")); if (!videoFiles.length) return; let remaining = videoFiles.length; const imported: Clip[] = [];
    videoFiles.forEach((file) => { const url = URL.createObjectURL(file), probe = document.createElement("video"); probe.preload = "metadata"; probe.src = url; probe.onloadedmetadata = () => { const duration = Number.isFinite(probe.duration) ? probe.duration : 0; imported.push({ id: makeId(), file, url, duration, name: file.name, segments: [{ start: 0, end: duration }] }); URL.revokeObjectURL(probe.src); remaining -= 1; if (!remaining) { setClips((current) => { const next = [...current, ...imported]; if (!selectedId && next[0]) setSelectedId(next[0].id); return next; }); setStatus(`${imported.length} video${imported.length === 1 ? "" : "s"} imported • local-only timeline ready`); } }; }); if (inputRef.current) inputRef.current.value = "";
  };
  const applyCommand = () => { const result = parseCommand(command, clips, selectedId, vertical); setClips(result.clips); setSelectedId(result.selectedId); setVertical(result.vertical); setPlan({ label: result.vertical ? "9:16 vertical" : "Original format", vertical: result.vertical }); setStatus(result.message); setCommand(""); };
  const loadFfmpeg = async () => { if (ffmpegRef.current) return ffmpegRef.current; const ffmpeg = new FFmpeg(); setStatus("Loading local video engine…"); await ffmpeg.load({ coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"), wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm") }); ffmpegRef.current = ffmpeg; return ffmpeg; };
  const exportCaptions = () => { if (!captions.length) { setStatus("Add at least one caption first"); return; } const blob = new Blob([captionsToSrt(captions)], { type: "application/x-subrip;charset=utf-8" }); const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = "ai-video-editor-captions.srt"; a.click(); URL.revokeObjectURL(url); setStatus(`Caption track exported • ${captions.length} subtitle${captions.length === 1 ? "" : "s"} • local-only`); };
  const addCaption = () => { const text = captionText.trim(); if (!text || !selectedClip) return; const start = clamp(captionStart, 0, Math.max(0, selectedClip.duration - 0.05)), end = clamp(captionEnd, start + 0.05, selectedClip.duration); setCaptions((current) => [...current, { id: makeId(), start, end, text }].sort((a, b) => a.start - b.start)); setCaptionText(""); setStatus("Caption added locally"); };
  const deleteCaption = (id: string) => { setCaptions((current) => current.filter((caption) => caption.id !== id)); setStatus("Caption removed"); };

  const exportEdit = async () => {
    if (!clips.length) return; setBusy(true);
    try { const ffmpeg = await loadFfmpeg(), outputParts: string[] = []; setStatus("Rendering clips locally on this iPad…");
      for (let clipIndex = 0; clipIndex < clips.length; clipIndex += 1) { const clip = clips[clipIndex], inputName = `input-${clipIndex}${clip.file.name.match(/\.[^.]+$/)?.[0] || ".mp4"}`; await ffmpeg.writeFile(inputName, await fetchFile(clip.file)); for (let segmentIndex = 0; segmentIndex < clip.segments.length; segmentIndex += 1) { const segment = clip.segments[segmentIndex], partName = `part-${clipIndex}-${segmentIndex}.mp4`; const args = ["-ss", segment.start.toFixed(3), "-i", inputName, "-t", (segment.end - segment.start).toFixed(3), "-map", "0:v:0?", "-map", "0:a:0?"]; if (vertical) args.push("-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"); args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-movflags", "+faststart", partName); await ffmpeg.exec(args); outputParts.push(partName); } }
      await ffmpeg.writeFile("concat-list.txt", new TextEncoder().encode(outputParts.map((name) => `file '${name}'`).join("\n"))); const finalName = "ai-video-editor-project.mp4"; await ffmpeg.exec(["-f", "concat", "-safe", "0", "-i", "concat-list.txt", "-c", "copy", "-movflags", "+faststart", finalName]);
      const data = await ffmpeg.readFile(finalName), bytes = typeof data === "string" ? new TextEncoder().encode(data) : data, blob = new Blob([bytes as unknown as BlobPart], { type: "video/mp4" }), url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = `ai-video-editor-${vertical ? "9x16" : "edit"}.mp4`; a.click(); URL.revokeObjectURL(url);
      if (captions.length) exportCaptions(); setStatus(`Export complete • ${clips.length} clip${clips.length === 1 ? "" : "s"} combined locally${captions.length ? " • captions exported separately" : ""}`);
    } catch (error) { console.error(error); setStatus("Export failed. Try fewer/smaller clips on iPad."); } finally { setBusy(false); }
  };
  const moveClip = (index: number, direction: -1 | 1) => { const target = index + direction; if (target < 0 || target >= clips.length) return; const next = [...clips]; [next[index], next[target]] = [next[target], next[index]]; setClips(next); setStatus(`Moved clip ${index + 1} ${direction < 0 ? "up" : "down"}`); };
  const deleteClip = (index: number) => { const removed = clips[index], next = clips.filter((_, i) => i !== index); setClips(next); if (removed?.id === selectedId) setSelectedId(next[Math.min(index, next.length - 1)]?.id || null); setStatus(`Deleted clip ${index + 1}`); };
  const updateSelectedRange = (start: number, end: number) => { if (!selectedClip) return; const safeStart = clamp(start, 0, Math.max(0, end - 0.1)), safeEnd = clamp(end, safeStart + 0.1, selectedClip.duration); setClips((current) => current.map((clip) => clip.id === selectedClip.id ? { ...clip, segments: [{ start: safeStart, end: safeEnd }] } : clip)); if (videoRef.current) videoRef.current.currentTime = safeStart; };

  return <main className="app">
    <header className="topbar"><div><div className="brand">AI Video Editor</div><div className="sub">Private • local-first • iPad • Phase 4 captions</div></div><button className="import" onClick={() => inputRef.current?.click()} disabled={busy}>＋ Import videos</button><input ref={inputRef} hidden multiple type="file" accept="video/*" onChange={(e) => importVideos(e.target.files)} /></header>
    <section className="command-bar"><div className="command-label">Tell the editor what to do</div><div className="command-row"><input value={command} onChange={(e) => setCommand(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyCommand(); }} placeholder='“Remove the middle 5 seconds from clip 2 and make it 9:16”' disabled={busy} /><button onClick={applyCommand} disabled={busy || !command.trim()}>Apply</button></div><div className="chips"><button onClick={() => setCommand("Cut middle 5 seconds")}>Cut middle 5s</button><button onClick={() => setCommand("Cut 10 to 20 seconds")}>Cut 10–20s</button><button onClick={() => setCommand("Delete clip 2")}>Delete clip 2</button><button onClick={() => setCommand("Put clip 2 after clip 1")}>Reorder clips</button><button onClick={() => setCommand("Make it 9:16 vertical")}>Make 9:16</button><button onClick={() => setCommand("Reset")}>Reset</button></div></section>
    <section className="workspace"><div className="preview-card" data-format={plan.vertical ? "vertical" : "original"}>{selectedClip ? <div className="video-wrap"><video ref={videoRef} src={selectedClip.url} controls playsInline onTimeUpdate={(e) => { if (e.currentTarget.currentTime > selectedEnd) e.currentTarget.currentTime = selectedStart; }} /><div className="caption-overlay">{captions.filter((caption) => currentTime >= caption.start && currentTime <= caption.end).map((caption) => <span key={caption.id}>{caption.text}</span>)}</div></div> : <button className="empty" onClick={() => inputRef.current?.click()}><span className="empty-icon">＋</span><strong>Import videos</strong><span>Photos or Files • nothing is uploaded</span></button>}</div>
      <aside className="controls"><div className="panel-title">Edit plan</div><div className="plan-badge">{plan.label}</div>{selectedClip ? <><div className="selected-name">Clip {selectedIndex + 1} • {selectedClip.name}</div><div className="time-row"><span>In</span><b>{selectedStart.toFixed(1)}s</b><span>Out</span><b>{selectedEnd.toFixed(1)}s</b></div><input aria-label="Trim start" type="range" min="0" max={Math.max(selectedClip.duration, 0.1)} step="0.1" value={selectedStart} onChange={(e) => updateSelectedRange(Number(e.target.value), selectedEnd)} /><input aria-label="Trim end" type="range" min="0" max={Math.max(selectedClip.duration, 0.1)} step="0.1" value={selectedEnd} onChange={(e) => updateSelectedRange(selectedStart, Number(e.target.value))} /></> : <div className="notice">Import videos to build a sequence.</div>}<button className="format-button" onClick={() => { const next = !vertical; setVertical(next); setPlan({ label: next ? "9:16 vertical" : "Original format", vertical: next }); }} disabled={!clips.length || busy}>{vertical ? "Use original format" : "Convert to 9:16"}</button><button className="primary" disabled={!clips.length || busy} onClick={exportEdit}>{busy ? "Working…" : "Export full project"}</button><div className="notice">Phase 4: captions are editable on-device and export as SRT. No LLM, API key, account or cloud upload is required.</div></aside>
    </section>
    <section className="caption-panel"><div className="panel-title">Captions</div><div className="caption-editor"><input value={captionText} onChange={(e) => setCaptionText(e.target.value)} placeholder="Type a caption" disabled={!selectedClip || busy} /><input type="number" min="0" step="0.1" value={captionStart} onChange={(e) => setCaptionStart(Number(e.target.value))} placeholder="Start" disabled={!selectedClip || busy} /><input type="number" min="0.1" step="0.1" value={captionEnd} onChange={(e) => setCaptionEnd(Number(e.target.value))} placeholder="End" disabled={!selectedClip || busy} /><button onClick={addCaption} disabled={!selectedClip || busy || !captionText.trim()}>＋ Add caption</button><button onClick={exportCaptions} disabled={!captions.length || busy}>Export SRT</button></div><div className="caption-list">{captions.map((caption, index) => <div className="caption-row" key={caption.id}><span>{index + 1}</span><span className="caption-copy">{caption.text}</span><span>{caption.start.toFixed(1)}–{caption.end.toFixed(1)}s</span><button onClick={() => deleteCaption(caption.id)} disabled={busy}>×</button></div>)}{!captions.length && <div className="timeline-empty">No captions yet. Add timed captions above; they preview over the video and export as standard SRT.</div>}</div></section>
    <section className="timeline"><div className="timeline-head"><span>Timeline • {clips.length} clip{clips.length === 1 ? "" : "s"}</span><span>{clips.length ? `${clips.reduce((sum, clip) => sum + totalKept(clip), 0).toFixed(1)}s final duration` : "Import media to create a timeline"}</span></div><div className="clip-list">{clips.map((clip, index) => { const active = clip.id === selectedId, kept = totalKept(clip); return <div key={clip.id} className={`clip-row ${active ? "active" : ""}`} onClick={() => setSelectedId(clip.id)}><div className="clip-index">{index + 1}</div><div className="clip-main"><div className="clip-name">{clip.name}</div><div className="clip-meta">{kept.toFixed(1)}s kept • {clip.segments.length > 1 ? `${clip.segments.length} segments` : "single segment"}</div><div className="clip-track">{clip.segments.map((segment, i) => <span key={i} className="segment" style={{ left: `${(segment.start / clip.duration) * 100}%`, width: `${((segment.end - segment.start) / clip.duration) * 100}%` }} />)}</div></div><div className="clip-actions"><button onClick={(e) => { e.stopPropagation(); moveClip(index, -1); }} disabled={index === 0 || busy}>↑</button><button onClick={(e) => { e.stopPropagation(); moveClip(index, 1); }} disabled={index === clips.length - 1 || busy}>↓</button><button onClick={(e) => { e.stopPropagation(); deleteClip(index); }} disabled={busy}>×</button></div></div>; })}{!clips.length && <div className="timeline-empty">No clips yet — import two or more videos to build a sequence.</div>}</div></section><footer>{status}</footer>
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
