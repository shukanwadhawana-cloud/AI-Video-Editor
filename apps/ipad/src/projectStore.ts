export type StoredSegment = { start: number; end: number };
export type StoredClip = { id: string; duration: number; name: string; type: string; segments: StoredSegment[] };
export type StoredCaption = { id: string; clipId: string; start: number; end: number; text: string };

export type ProjectSnapshot = {
  version: 1;
  clips: StoredClip[];
  captions: StoredCaption[];
  selectedId: string | null;
  vertical: boolean;
};

const DB_NAME = "ai-video-editor-projects";
const DB_VERSION = 1;
const PROJECTS_STORE = "projects";
const FILES_STORE = "files";
const CURRENT_PROJECT = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) db.createObjectStore(PROJECTS_STORE);
      if (!db.objectStoreNames.contains(FILES_STORE)) db.createObjectStore(FILES_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open project database"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

export async function saveProject(snapshot: ProjectSnapshot, files: Array<{ id: string; file: File }>): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([PROJECTS_STORE, FILES_STORE], "readwrite");
    tx.objectStore(PROJECTS_STORE).put(snapshot, CURRENT_PROJECT);
    const fileStore = tx.objectStore(FILES_STORE);
    files.forEach(({ id, file }) => fileStore.put(file, id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Unable to save project"));
    tx.onabort = () => reject(tx.error || new Error("Project save aborted"));
  }).finally(() => db.close());
}

export async function loadProject(): Promise<{ snapshot: ProjectSnapshot; files: Record<string, File> } | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  try {
    const snapshot = await requestResult<ProjectSnapshot | undefined>(db.transaction(PROJECTS_STORE, "readonly").objectStore(PROJECTS_STORE).get(CURRENT_PROJECT));
    if (!snapshot || snapshot.version !== 1) return null;
    const files: Record<string, File> = {};
    for (const clip of snapshot.clips) {
      const blob = await requestResult<Blob | undefined>(db.transaction(FILES_STORE, "readonly").objectStore(FILES_STORE).get(clip.id));
      if (blob) files[clip.id] = blob instanceof File ? blob : new File([blob], clip.name, { type: clip.type || blob.type || "video/mp4" });
    }
    return { snapshot, files };
  } finally {
    db.close();
  }
}

export async function clearProject(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([PROJECTS_STORE, FILES_STORE], "readwrite");
    tx.objectStore(PROJECTS_STORE).clear();
    tx.objectStore(FILES_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Unable to clear project"));
  }).finally(() => db.close());
}

export const PHASE9_STORAGE_CONTRACT = "Project metadata and imported video blobs persist locally in IndexedDB; nothing is uploaded.";
