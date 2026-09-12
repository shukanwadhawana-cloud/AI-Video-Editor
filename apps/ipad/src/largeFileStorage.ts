const LARGE_FILE_THRESHOLD_BYTES = 250 * 1024 * 1024;
const OPFS_DIR = "media";

export const isLargeMediaFile = (file: File) => file.size >= LARGE_FILE_THRESHOLD_BYTES;

function supportsOpfs(): boolean {
  return typeof navigator !== "undefined" && "storage" in navigator && typeof navigator.storage.getDirectory === "function";
}

async function getMediaDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!supportsOpfs()) throw new Error("Origin Private File System is not available in this browser");
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIR, { create: true });
}

function safeName(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function hasLargeMedia(id: string, expectedSize?: number, expectedLastModified?: number): Promise<boolean> {
  try {
    const directory = await getMediaDirectory();
    const handle = await directory.getFileHandle(safeName(id));
    const file = await handle.getFile();
    if (expectedSize !== undefined && file.size !== expectedSize) return false;
    if (expectedLastModified !== undefined && file.lastModified !== expectedLastModified) return false;
    return true;
  } catch {
    return false;
  }
}

export async function saveLargeMedia(id: string, file: File): Promise<void> {
  const directory = await getMediaDirectory();
  const handle = await directory.getFileHandle(safeName(id), { create: true });
  const writable = await handle.createWritable();
  try {
    // Stream the source into OPFS. Do not call arrayBuffer()/Blob() here: a 1–2 GB
    // video must never require a second 1–2 GB in-memory copy.
    await file.stream().pipeTo(writable);
  } catch (error) {
    try { await writable.abort(); } catch {}
    throw error;
  }
}

export async function loadLargeMedia(id: string, name: string, type: string): Promise<File | null> {
  try {
    const directory = await getMediaDirectory();
    const handle = await directory.getFileHandle(safeName(id));
    const file = await handle.getFile();
    return new File([file], name, { type: type || file.type || "video/mp4", lastModified: file.lastModified });
  } catch {
    return null;
  }
}

export async function deleteLargeMedia(id: string): Promise<void> {
  try {
    const directory = await getMediaDirectory();
    await directory.removeEntry(safeName(id));
  } catch {
    // Missing media is already effectively deleted.
  }
}

export const LARGE_MEDIA_CONTRACT =
  "Files >=250 MiB use streaming OPFS persistence when supported; small files remain in IndexedDB. No whole-file arrayBuffer copy is used for large media persistence.";
