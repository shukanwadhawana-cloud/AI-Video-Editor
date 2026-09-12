import React from "react";
import { createRoot } from "react-dom/client";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import "./styles.css";

const CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

type Clip = { file: File; url: string; duration: number; name: string };
type EditPlan = { label: string; vertical: boolean };

function parseCommand(command: string, duration: number, currentStart: number, currentEnd: number, currentVertical: boolean): { start: number; end: number; vertical: boolean; message: string } {
  const text = command.trim().toLowerCase();
  let start = currentStart;
  let end = currentEnd;
  let vertical = currentVertical;

  if (!text) return { start, end, vertical, message: "Type an edit command" };

  if (/\b(reset|clear|undo all)\b/.test(text)) {
    start = 0;
    end = duration;
    vertical = false;
  }

  const number = "([0-9]+(?:\\.[0-9]+)?)";
  const first = text.match(new RegExp(`(?:remove|delete|cut|trim)\\s+(?:the\\s+)?first\\s+${number}\\s*(?:s|sec|secs|second|seconds)?`));
  const last = text.match(new RegExp(`(?:remove|delete|cut|trim)\\s+(?:the\\s+)?last\\s+${number}\\s*(?:s|sec|secs|second|seconds)?`));
  const range = text.match(new RegExp(`(?:keep|trim)\\s+(?:from\\s+)?${number}\\s*(?:s|sec|secs|second|seconds)?\\s*(?:to|-)\\s*${number}\\s*(?:s|sec|secs|second|seconds)?`));

  if (first) {
    const amount = Number(first[1]);
    start = Math.min(Math.max(0, start + amount), Math.max(0, end - 0.1));
  } else if (last) {
    const amount = Number(last[1]);
    end = Math.max(Math.min(duration, end - amount), start + 0.1);
  } else if (range) {
    start = Math.max(0, Math.min(duration - 0.1, Number(range[1])));
    end = Math.max(start + 0.1, Math.min(duration, Number(range[2])));
  }

  if (/\b(9\\s*[:x]\\s*16|vertical|portrait|reel|reels|instagram reel|shorts?)\b/.test(text)) vertical = true;
  if (/\b(16\\s*[:x]\\s*9|horizontal|landscape)\b/.test(text)) vertical = false;

  const changedTime = first || last || range;
  const changedFormat = /\b(9\\s*[:x]\\s*16|vertical|portrait|reel|reels|instagram reel|shorts?|16\\s*[:x]\\s*9|horizontal|landscape)\b/.test(text);
  if (!changedTime && !changedFormat && !/\b(reset|clear|undo all)\b/.test(text)) {
    return { start: currentStart, end: currentEnd, vertical: currentVertical, message: "I can currently understand trim/cut commands and 9:16/16:9 format commands." };
  }

  const parts: string[] = [];
  if (start > 0) parts.push(`starts at ${start.toFixed(1)}s`);
  if (end < duration) parts.push(`ends at ${end.toFixed(1)}s`);
  if (vertical) parts.push("9:16 vertical");
  else parts.push("original landscape/portrait format");
  return { start, end, vertical, message: `Applied locally: ${parts.join(" • ")}` };
}

function App() {
  const [clip, setClip] = React.useState<Clip | null>(null);
  const [start, setStart] = React.useState(0);
  const [end, setEnd] = React.useState(0);
  const [vertical, setVertical] = React.useState(false);
  const [command, setCommand] = React.useState("");
  const [plan, setPlan] = React.useState<EditPlan>({ label: "Original format", vertical: false });
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState("Import a video to begin");
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const ffmpegRef = React.useRef<FFmpeg | null>(null);

  const importVideo = (file: File) => {
    if (!file.type.startsWith("video/")) return;
    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = url;
    probe.onloadedmetadata = () => {
      const duration = Number.isFinite(probe.duration) ? probe.duration : 0;
      setClip({ file, url, duration, name: file.name });
      setStart(0);
      setEnd(duration);
      setVertical(false);
      setPlan({ label: "Original format", vertical: false });
      setStatus("Ready — use the timeline or tell the editor what to do");
      URL.revokeObjectURL(probe.src);
    };
  };

  const applyCommand = () => {
    if (!clip) {
      setStatus("Import a video first");
      return;
    }
    const result = parseCommand(command, clip.duration, start, end, vertical);
    setStart(result.start);
    setEnd(result.end);
    setVertical(result.vertical);
    setPlan({ label: result.vertical ? "9:16 vertical" : "Original format", vertical: result.vertical });
    setStatus(result.message);
    if (videoRef.current) videoRef.current.currentTime = result.start;
    setCommand("");
  };

  const loadFfmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    const ffmpeg = new FFmpeg();
    setStatus("Loading local video engine…");
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  const exportEdit = async () => {
    if (!clip) return;
    if (end <= start || end - start < 0.05) {
      setStatus("Choose a valid edit range");
      return;
    }
    setBusy(true);
    try {
      const ffmpeg = await loadFfmpeg();
      const extension = clip.file.name.match(/\.[^.]+$/)?.[0] || ".mp4";
      const inputName = "input" + extension;
      const outputName = "ai-video-editor-export.mp4";
      setStatus(vertical ? "Applying trim + 9:16 conversion locally…" : "Applying trim locally on this iPad…");
      await ffmpeg.writeFile(inputName, await fetchFile(clip.file));

      const args = [
        "-ss", start.toFixed(3),
        "-i", inputName,
        "-t", (end - start).toFixed(3),
        "-map", "0:v:0?",
        "-map", "0:a:0?",
      ];
      if (vertical) {
        args.push("-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920");
      }
      args.push(
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-c:a", "aac",
        "-movflags", "+faststart",
        outputName,
      );
      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile(outputName);
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      const blob = new Blob([bytes as unknown as BlobPart], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = clip.name.replace(/\.[^.]+$/, "") + (vertical ? "-9x16" : "-edit") + ".mp4";
      a.click();
      URL.revokeObjectURL(url);
      setStatus("Export complete — video never left the device");
    } catch (error) {
      console.error(error);
      setStatus("Export failed. Try a shorter/smaller video on iPad.");
    } finally {
      setBusy(false);
    }
  };

  const seek = (time: number) => {
    if (videoRef.current) videoRef.current.currentTime = Math.max(start, Math.min(end, time));
  };

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <div className="brand">AI Video Editor</div>
          <div className="sub">Private • local-first • iPad</div>
        </div>
        <button className="import" onClick={() => inputRef.current?.click()} disabled={busy}>＋ Import video</button>
        <input ref={inputRef} hidden type="file" accept="video/*" onChange={(e) => e.target.files?.[0] && importVideo(e.target.files[0])} />
      </header>

      <section className="command-bar">
        <div className="command-label">Tell the editor what to do</div>
        <div className="command-row">
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applyCommand(); }}
            placeholder='“Remove the first 8 seconds and make it 9:16”'
            disabled={!clip || busy}
          />
          <button onClick={applyCommand} disabled={!clip || busy || !command.trim()}>Apply</button>
        </div>
        <div className="chips">
          <button onClick={() => setCommand("Remove the first 5 seconds")}>Remove first 5s</button>
          <button onClick={() => setCommand("Remove the last 5 seconds")}>Remove last 5s</button>
          <button onClick={() => setCommand("Make it 9:16 vertical")}>Make 9:16</button>
          <button onClick={() => setCommand("Reset")}>Reset</button>
        </div>
      </section>

      <section className="workspace">
        <div className="preview-card" data-format={plan.vertical ? "vertical" : "original"}>
          {clip ? (
            <video ref={videoRef} src={clip.url} controls playsInline onTimeUpdate={(e) => {
              if (e.currentTarget.currentTime > end) e.currentTarget.currentTime = start;
            }} />
          ) : (
            <button className="empty" onClick={() => inputRef.current?.click()}>
              <span className="empty-icon">＋</span>
              <strong>Import a video</strong>
              <span>Photos or Files • nothing is uploaded</span>
            </button>
          )}
        </div>

        <aside className="controls">
          <div className="panel-title">Edit plan</div>
          <div className="plan-badge">{plan.label}</div>
          <div className="time-row"><span>In</span><b>{start.toFixed(1)}s</b><span>Out</span><b>{end.toFixed(1)}s</b></div>
          <input aria-label="Trim start" type="range" min="0" max={clip?.duration || 1} step="0.1" value={start} onChange={(e) => { const v = Number(e.target.value); setStart(Math.min(v, end - 0.1)); seek(v); }} />
          <input aria-label="Trim end" type="range" min="0" max={clip?.duration || 1} step="0.1" value={end} onChange={(e) => { const v = Number(e.target.value); setEnd(Math.max(v, start + 0.1)); }} />
          <button className="format-button" onClick={() => { setVertical(!vertical); setPlan({ label: !vertical ? "9:16 vertical" : "Original format", vertical: !vertical }); }} disabled={!clip || busy}>
            {vertical ? "Use original format" : "Convert to 9:16"}
          </button>
          <button className="primary" disabled={!clip || busy} onClick={exportEdit}>{busy ? "Working…" : "Export edited video"}</button>
          <div className="notice">Phase 2 adds a deterministic, on-device command layer. No LLM, API key, account or cloud upload is required.</div>
        </aside>
      </section>

      <section className="timeline">
        <div className="timeline-head"><span>{clip?.name || "No media"}</span><span>{clip ? `${(end - start).toFixed(1)}s selected • ${vertical ? "9:16" : "original"}` : "Import media to create a timeline"}</span></div>
        <div className="track">
          <div className="track-fill" style={{ left: `${clip ? (start / clip.duration) * 100 : 0}%`, width: `${clip ? ((end - start) / clip.duration) * 100 : 0}%` }} />
          {clip && <>
            <div className="handle" style={{ left: `${(start / clip.duration) * 100}%` }} />
            <div className="handle" style={{ left: `${(end / clip.duration) * 100}%` }} />
          </>}
        </div>
      </section>

      <footer>{status}</footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
