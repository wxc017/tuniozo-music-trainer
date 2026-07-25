// ─────────────────────────────────────────────────────────────────────────
// Workout video store — Blobs in IndexedDB, keyed by videoId.
//
// Videos never touch localStorage / the Drive-sync payload (they'd blow the
// ~5-10MB quota instantly). They live here as native Blobs, which IndexedDB
// stores efficiently — no base64, no +33% bloat. A WorkoutSet references a
// clip by `videoId`; the UI pulls the Blob and makes an object URL only when
// the user actually taps play.
//
// This is a SEPARATE database from folderSync's handle store so the two never
// collide. It is deliberately not synced automatically — cross-device video
// movement is an explicit export step (share sheet / download) since the data
// is large.
// ─────────────────────────────────────────────────────────────────────────

const DB_NAME = "tunizo_workout_videos";
const STORE = "videos";
const DB_VERSION = 1;

export interface StoredVideo {
  id: string;
  blob: Blob;
  mime: string;
  /** Original recording duration in seconds (best effort; 0 if unknown). */
  durationSec: number;
  createdAt: number;
  /** Back-reference for orphan cleanup / export labelling. */
  setId?: string;
  workoutId?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Monotonic-ish id without Date.now collisions across rapid saves. */
let idCounter = 0;
export function newVideoId(): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `vid_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export async function putVideo(v: StoredVideo): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(v);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getVideo(id: string): Promise<StoredVideo | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as StoredVideo) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteVideo(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function allVideoIds(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
    req.onerror = () => reject(req.error);
  });
}

/** Sum of stored blob sizes in bytes — for a storage-usage readout. */
export async function totalVideoBytes(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const rows = req.result as StoredVideo[];
      resolve(rows.reduce((sum, r) => sum + (r.blob?.size ?? 0), 0));
    };
    req.onerror = () => reject(req.error);
  });
}

/** Delete any stored video whose id isn't in `keepIds` (orphan cleanup). */
export async function pruneVideos(keepIds: Set<string>): Promise<number> {
  const ids = await allVideoIds();
  let removed = 0;
  for (const id of ids) {
    if (!keepIds.has(id)) { await deleteVideo(id); removed++; }
  }
  return removed;
}

// ── Object-URL cache ───────────────────────────────────────────────────
// Playback needs a URL, not a Blob. Cache per-id so repeated plays of the
// same clip don't leak URLs; callers revoke via releaseVideoUrl on unmount.

const urlCache = new Map<string, string>();

export async function getVideoUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const v = await getVideo(id);
  if (!v) return null;
  const url = URL.createObjectURL(v.blob);
  urlCache.set(id, url);
  return url;
}

export function releaseVideoUrl(id: string): void {
  const url = urlCache.get(id);
  if (url) { URL.revokeObjectURL(url); urlCache.delete(id); }
}
