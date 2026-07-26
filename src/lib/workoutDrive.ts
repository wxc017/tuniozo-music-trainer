// Workout videos on Google Drive. When connected, clips are uploaded to a
// "Tunizo Workouts" folder in the user's Drive and the heavy blob is removed
// from the phone — the set keeps only a driveFileId and streams the clip back
// on demand. This offloads storage and syncs videos to other devices.

import {
  getSavedToken, requestAccessToken, clearToken,
  uploadDriveFile, getDriveFileBlob, deleteDriveFile, findOrCreateFolder, uploadSync,
} from "./googleDrive";
import { getVideoUrl } from "./workoutVideoDb";
import { buildSyncPayload } from "./syncData";

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
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
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
  if (!token) return null;
  const blob = await getDriveFileBlob(token, fileId);
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
    try { const u = await getDriveVideoUrl(ref.driveFileId); if (u) return u; } catch { /* fall through */ }
  }
  if (ref.videoId) return getVideoUrl(ref.videoId);
  return null;
}
export function releaseClipUrl(ref: { videoId?: string; driveFileId?: string }): void {
  if (ref.driveFileId) releaseDriveVideoUrl(ref.driveFileId);
}
