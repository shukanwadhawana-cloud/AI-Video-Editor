import React from "react";
import { createRoot } from "react-dom/client";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import "./styles.css";

const CORE_BASE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

type Clip = { file: File; url: string; duration: number; name: string };

function App() {
  const [clip, setClip] = React.useState<Clip | null>(null);
  const [start, setStart] = React.useState(0);
  const [end, setEnd] = React.useState(0);
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
      setStatus("Ready — drag the handles or use the trim controls");
      URL.revokeObjectURL(probe.src);
    };
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

  const exportTrim = async () => {
    if (!clip || !videoRef.current) return;
    if (end <= start || end - start < 0.05) {
      setStatus("Choose a valid trim range");
      return;
    }
    setBusy(true);
    try {
      const ffmpeg = await loadFfmpeg();
      const inputName = "input" + (clip.file.name.match(/\.[^.]+$/)?.[0] || ".mp4");
      const outputName = "ai-video-editor-trim.mp4";
      setStatus("Editing locally on this iPad…");
      await ffmpeg.writeFile(inputName, await fetchFile(clip.file));
      await ffmpeg.exec([
        "-ss", start.toFixed(3),
        "-i", inputName,
        "-t", (end - start).toFixed(3),
        "-map", "0:v:0?",
        "-map", "0:a:0?",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-c:a", "aac",
        "-movflags", "+faststart",
        outputName,
      ]);
      const data = await ffmpeg.readFile(outputName);
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
      const blob = new Blob([bytes], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = clip.name.replace(/\.[^.]+$/, "") + "-trim.mp4";
      a.click();
      URL.revokeObjectURL(url);
      setStatus("Export complete — saved locally");
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

      <section className="workspace">
        <div className="preview-card">
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
          <div className="panel-title">Trim</div>
          <div className="time-row"><span>In</span><b>{start.toFixed(1)}s</b><span>Out</span><b>{end.toFixed(1)}s</b></div>
          <input aria-label="Trim start" type="range" min="0" max={clip?.duration || 1} step="0.1" value={start} onChange={(e) => { const v = Number(e.target.value); setStart(Math.min(v, end - 0.1)); seek(v); }} />
          <input aria-label="Trim end" type="range" min="0" max={clip?.duration || 1} step="0.1" value={end} onChange={(e) => { const v = Number(e.target.value); setEnd(Math.max(v, start + 0.1)); }} />
          <button className="primary" disabled={!clip || busy} onClick={exportTrim}>{busy ? "Working…" : "Export trimmed video"}</button>
          <div className="notice">Phase 1 uses a browser-local FFmpeg engine. Your video is processed on-device; the engine download is only the free WebAssembly runtime.</div>
        </aside>
      </section>

      <section className="timeline">
        <div className="timeline-head"><span>{clip?.name || "No media"}</span><span>{clip ? `${clip.duration.toFixed(1)}s` : "Import media to create a timeline"}</span></div>
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
