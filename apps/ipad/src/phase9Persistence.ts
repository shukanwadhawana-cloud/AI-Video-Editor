import React from "react";
import { loadProject, saveProject, type ProjectSnapshot } from "./projectStore";

type Segment = { start: number; end: number };
export type Phase9Clip = { id: string; file: File; url: string; duration: number; name: string; segments: Segment[] };
export type Phase9Caption = { id: string; clipId: string; start: number; end: number; text: string };

type EditorState = {
  clips: Phase9Clip[];
  captions: Phase9Caption[];
  selectedId: string | null;
  vertical: boolean;
};

type PersistenceArgs = {
  clips: Phase9Clip[];
  captions: Phase9Caption[];
  selectedId: string | null;
  vertical: boolean;
  setClips: React.Dispatch<React.SetStateAction<Phase9Clip[]>>;
  setCaptions: React.Dispatch<React.SetStateAction<Phase9Caption[]>>;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  setVertical: React.Dispatch<React.SetStateAction<boolean>>;
  setStatus: React.Dispatch<React.SetStateAction<string>>;
};

function snapshotOf(state: EditorState): EditorState {
  return {
    clips: state.clips.map((clip) => ({ ...clip, segments: clip.segments.map((segment) => ({ ...segment })) })),
    captions: state.captions.map((caption) => ({ ...caption })),
    selectedId: state.selectedId,
    vertical: state.vertical,
  };
}

function equalState(a: EditorState | null, b: EditorState): boolean {
  if (!a) return false;
  return JSON.stringify({ clips: a.clips.map(({ id, duration, name, segments }) => ({ id, duration, name, segments })), captions: a.captions, selectedId: a.selectedId, vertical: a.vertical }) === JSON.stringify({ clips: b.clips.map(({ id, duration, name, segments }) => ({ id, duration, name, segments })), captions: b.captions, selectedId: b.selectedId, vertical: b.vertical });
}

function toStored(state: EditorState): Omit<ProjectSnapshot, "version"> {
  return {
    clips: state.clips.map((clip) => ({ id: clip.id, duration: clip.duration, name: clip.name, type: clip.file.type, size: clip.file.size, storage: "indexeddb", segments: clip.segments })),
    captions: state.captions,
    selectedId: state.selectedId,
    vertical: state.vertical,
  };
}

export function usePhase9Persistence(args: PersistenceArgs) {
  const { clips, captions, selectedId, vertical, setClips, setCaptions, setSelectedId, setVertical, setStatus } = args;
  const [storageReady, setStorageReady] = React.useState(false);
  const [canUndo, setCanUndo] = React.useState(false);
  const [canRedo, setCanRedo] = React.useState(false);
  const historyRef = React.useRef<EditorState[]>([]);
  const futureRef = React.useRef<EditorState[]>([]);
  const previousRef = React.useRef<EditorState | null>(null);
  const restoringRef = React.useRef(false);
  const initialLoadRef = React.useRef(true);

  const currentState = React.useMemo(() => snapshotOf({ clips, captions, selectedId, vertical }), [clips, captions, selectedId, vertical]);

  const persist = React.useCallback(async (state: EditorState) => {
    try {
      await saveProject(toStored(state), state.clips.map((clip) => ({ id: clip.id, file: clip.file })));
    } catch (error) {
      console.error(error);
      setStatus("Project changed locally, but browser storage could not be updated");
    }
  }, [setStatus]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const restored = await loadProject();
        if (cancelled) return;
        if (restored) {
          const restoredClips: Phase9Clip[] = restored.snapshot.clips.map((clip) => {
            const file = restored.files[clip.id];
            return {
              id: clip.id,
              file: file || new File([], clip.name, { type: clip.type || "video/mp4" }),
              url: file ? URL.createObjectURL(file) : "",
              duration: clip.duration,
              name: clip.name,
              segments: clip.segments,
            };
          });
          setClips(restoredClips);
          setCaptions(restored.snapshot.captions);
          setSelectedId(restored.snapshot.selectedId && restoredClips.some((clip) => clip.id === restored.snapshot.selectedId) ? restored.snapshot.selectedId : restoredClips[0]?.id || null);
          setVertical(restored.snapshot.vertical);
          setStatus(restoredClips.length ? `Project restored locally • ${restoredClips.length} clip${restoredClips.length === 1 ? "" : "s"}` : "Saved project restored locally");
        } else {
          setStatus("Import videos to begin • project state saves locally");
        }
      } catch (error) {
        console.error(error);
        setStatus("Local project storage unavailable • editing still works in this session");
      } finally {
        if (!cancelled) setStorageReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [setClips, setCaptions, setSelectedId, setVertical, setStatus]);

  React.useEffect(() => {
    if (!storageReady) return;
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      previousRef.current = currentState;
      void persist(currentState);
      return;
    }
    if (equalState(previousRef.current, currentState)) return;
    if (restoringRef.current) {
      restoringRef.current = false;
      previousRef.current = currentState;
      void persist(currentState);
      return;
    }
    if (previousRef.current) historyRef.current = [...historyRef.current.slice(-49), snapshotOf(previousRef.current)];
    futureRef.current = [];
    previousRef.current = currentState;
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(false);
    void persist(currentState);
  }, [currentState, storageReady, persist]);

  const restore = React.useCallback((state: EditorState) => {
    restoringRef.current = true;
    setClips(snapshotOf(state).clips);
    setCaptions(snapshotOf(state).captions);
    setSelectedId(state.selectedId);
    setVertical(state.vertical);
  }, [setClips, setCaptions, setSelectedId, setVertical]);

  const undo = React.useCallback(() => {
    const target = historyRef.current.pop();
    if (!target || !previousRef.current) return;
    futureRef.current = [...futureRef.current.slice(-49), snapshotOf(previousRef.current)];
    restore(target);
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
    setStatus("Undo • project restored locally");
  }, [restore, setStatus]);

  const redo = React.useCallback(() => {
    const target = futureRef.current.pop();
    if (!target || !previousRef.current) return;
    historyRef.current = [...historyRef.current.slice(-49), snapshotOf(previousRef.current)];
    restore(target);
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
    setStatus("Redo • project restored locally");
  }, [restore, setStatus]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  return { storageReady, canUndo, canRedo, undo, redo, contract: "IndexedDB metadata + small-media persistence; large media uses streaming OPFS when supported • 50-step undo/redo history" };
}
