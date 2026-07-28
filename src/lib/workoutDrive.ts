// Workout videos on Google Drive. When connected, clips are uploaded to a
// "Tunizo Workouts" folder in the user's Drive and the heavy blob is removed
// from the phone — the set keeps only a driveFileId and streams the clip back
// on demand. This offloads storage and syncs videos to other devices.

import {
  getSavedToken, requestAccessToken, clearToken,
  uploadDriveFile, getDriveFileBlob, deleteDriveFile, findOrCreateFolder, uploadSync,
  GDRIVE_TOKEN_EVENT,
} from "./googleDrive";
import { getVideoUrl } from "./workoutVideoDb";
import { buildSyncPayload } from "./syncData";
import { dlog } from "./driveDebug";

const FOLDER_NAME = "Tunizo Workouts";
const FOLDER_ID_KEY = "lt_workout_drive_folder";
const CHANGE_EVENT = "lt-workout-drive-changed";

export function isDriveConnected(): boolean { return !!getSavedToken(); }

export async function connectDrive(): Promise<void> {
  await requestAccessToken();
  emit();
  // Push current log data up immediately so it's backed up on connect.
  try { const t = getSavedToken(); if (t) await uploadSync(t, buildSyncPayload()); } catch { /* ignore */ }
}
export function disconnectDrive(): void {
  clearToken();
  emit();
}

// ── Auto-save the log DATA to Drive on every change (debounced) ──────────
let dataSyncInit = false;
let dataSyncTimer: number | null = null;
export function initDriveDataSync(): void {
  if (dataSyncInit || typeof window === "undefined") return;
  dataSyncInit = true;
  window.addEventListener("lt-data-changed", () => {
    if (!isDriveConnected()) return;
    if (dataSyncTimer) window.clearTimeout(dataSyncTimer);
    dataSyncTimer = window.setTimeout(() => {
      const token = getSavedToken();
      if (!token) return;
      uploadSync(token, buildSyncPayload()).catch(() => { /* offline / token lapsed */ });
    }, 3000);
  });
}
function emit(): void { try { window.dispatchEvent(new CustomEvent(CHANGE_EVENT)); } catch { /* jsdom */ } }
export function onDriveChange(cb: () => void): () => void {
  // Fire on our own connect/disconnect AND on any shared-token change (e.g. the
  // user signed in from the Settings panel) so the workout-log toggle always
  // mirrors the single Google connection.
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener(GDRIVE_TOKEN_EVENT, cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener(GDRIVE_TOKEN_EVENT, cb);
  };
}

async function folderId(token: string): Promise<string> {
  const cached = localStorage.getItem(FOLDER_ID_KEY);
  if (cached) return cached;
  const id = await findOrCreateFolder(token, FOLDER_NAME);
  localStorage.setItem(FOLDER_ID_KEY, id);
  return id;
}

/** Upload a video blob to the Drive folder; returns the Drive file id. */
export async function uploadVideoToDrive(blob: Blob, name: string): Promise<string> {
  const token = getSavedToken();
  if (!token) throw new Error("Not connected to Google Drive.");
  const parent = await folderId(token);
  return uploadDriveFile(token, { name, mimeType: blob.type || "video/webm", parents: [parent] }, blob);
}

export async function deleteDriveVideo(fileId: string): Promise<void> {
  const token = getSavedToken();
  if (!token) return;
  try { await deleteDriveFile(token, fileId); } catch { /* best effort */ }
}

// Object-URL cache for streamed Drive clips.
const urlCache = new Map<string, string>();
export async function getDriveVideoUrl(fileId: string): Promise<string | null> {
  const cached = urlCache.get(fileId);
  if (cached) return cached;
  const token = getSavedToken();
  if (!token) { dlog(`video: clip is on Drive (${fileId.slice(0, 8)}…) but not signed in — can't stream`); return null; }
  const blob = await getDriveFileBlob(token, fileId);
  dlog(`video: streamed ${blob.size} bytes from Drive (${fileId.slice(0, 8)}…)`);
  const url = URL.createObjectURL(blob);
  urlCache.set(fileId, url);
  return url;
}
export function releaseDriveVideoUrl(fileId: string): void {
  const u = urlCache.get(fileId);
  if (u) { URL.revokeObjectURL(u); urlCache.delete(fileId); }
}

/** Resolve a clip URL from Drive (if driveFileId) or IndexedDB (videoId). */
export async function getClipUrl(ref: { videoId?: string; driveFileId?: string }): Promise<string | null> {
  if (ref.driveFileId) {
    try { const u = await getDriveVideoUrl(ref.driveFileId); if (u) return u; }
    catch (err) { dlog(`video: Drive stream failed — ${err instanceof Error ? err.message : String(err)}`); }
    // Offline fallback: a full-backup restore stores the clip in IndexedDB keyed
    // by its driveFileId, so try that before giving up.
    const local = await getVideoUrl(ref.driveFileId);
    if (local) return local;
  }
  if (ref.videoId) {
    const u = await getVideoUrl(ref.videoId);
    if (!u) dlog(`video: local file for ${ref.videoId.slice(0, 8)}… is NOT on this device — only its reference synced. Use Settings → Restore from Drive.`);
    return u;
  }
  dlog("video: set references no local videoId and no driveFileId");
  return null;
}
export function releaseClipUrl(ref: { videoId?: string; driveFileId?: string }): void {
  if (ref.driveFileId) releaseDriveVideoUrl(ref.driveFileId);
}

/** Like getClipUrl, but returns the FAILURE REASON instead of null — so the UI
 *  can show why a specific Drive clip won't load (404 / auth / network) rather
 *  than a generic "couldn't load". */
export async function resolveClipUrl(ref: { videoId?: string; driveFileId?: string }): Promise<{ url: string } | { error: string }> {
  if (ref.driveFileId) {
    const token = getSavedToken();
    if (token) {
      try {
        const u = await getDriveVideoUrl(ref.driveFileId);
        if (u) return { url: u };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        const local = await getVideoUrl(ref.driveFileId);
        if (local) return { url: local };
        return { error: `Drive error (${reason})` };
      }
    }
    const local = await getVideoUrl(ref.driveFileId);
    if (local) return { url: local };
    return { error: token ? "Drive returned no data for this clip" : "Not signed in to Drive" };
  }
  if (ref.videoId) {
    const u = await getVideoUrl(ref.videoId);
    return u ? { url: u } : { error: "Clip file isn't on this device" };
  }
  return { error: "No clip reference" };
}
