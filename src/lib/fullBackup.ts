// One backup to rule them all: EVERYTHING — every lt_ localStorage key (scores,
// chord charts, practice log, workout log, settings…) AND every workout video
// clip — bundled into a single .zip. Used both for local Export/Import All Data
// and for Drive Export/Restore, so there's one mechanism and nothing is missed.
//
// Clips are gathered wherever they live: local IndexedDB blobs, and clips that
// were offloaded to Drive (downloaded back in). On import each clip is stored in
// IndexedDB under its original key, and getClipUrl falls back to that local copy
// if the Drive stream isn't available — so a restore plays offline too.

import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { isExportKey } from "./storage";
import { getWorkouts } from "./workoutStore";
import { getVideo, putVideo } from "./workoutVideoDb";
import { getClipUrl } from "./workoutDrive";
import {
  getSavedToken, findOrCreateFolder, findFileInFolder, updateDriveFileMedia,
  uploadDriveFile, getDriveFileBlob,
} from "./googleDrive";
import { dlog } from "./driveDebug";

const FOLDER_NAME = "Tunizo Backups";
const BACKUP_NAME = "tunizo-everything.zip";

function extFor(mime: string): string {
  if (/mp4/i.test(mime)) return "mp4";
  if (/webm/i.test(mime)) return "webm";
  if (/quicktime|mov/i.test(mime)) return "mov";
  return "bin";
}

interface ClipEntry { id: string; blob: Blob; mime: string; durationSec: number }

/** Every clip referenced by the log, resolved to a blob — local first, else
 *  streamed from Drive. Deduped by the id we'll store it under. */
async function collectAllClips(): Promise<ClipEntry[]> {
  const out: ClipEntry[] = [];
  const seen = new Set<string>();
  for (const w of getWorkouts()) {
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        const id = s.videoId || s.driveFileId;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        try {
          if (s.videoId) {
            const v = await getVideo(s.videoId);
            if (v) { out.push({ id: s.videoId, blob: v.blob, mime: v.mime, durationSec: v.durationSec }); continue; }
          }
          if (s.driveFileId) {
            const url = await getClipUrl({ driveFileId: s.driveFileId });
            if (url) { const blob = await (await fetch(url)).blob(); out.push({ id: s.driveFileId, blob, mime: blob.type || "video/webm", durationSec: 0 }); }
          }
        } catch { /* skip a clip that won't resolve */ }
      }
    }
  }
  return out;
}

export interface FullBackupInfo { blob: Blob; keyCount: number; videoCount: number; bytes: number }

/** Build the everything zip: backup.json (all export keys) + videos/<id>.<ext>. */
export async function buildFullBackupZip(): Promise<FullBackupInfo> {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (isExportKey(k)) data[k] = localStorage.getItem(k)!;
  }

  const files: Record<string, Uint8Array> = {};
  const videos: { id: string; file: string; mime: string; durationSec: number }[] = [];
  for (const c of await collectAllClips()) {
    const file = `videos/${c.id}.${extFor(c.mime)}`;
    files[file] = new Uint8Array(await c.blob.arrayBuffer());
    videos.push({ id: c.id, file, mime: c.mime, durationSec: c.durationSec });
  }

  files["backup.json"] = strToU8(JSON.stringify({ type: "tunizo-everything", version: 1, data, videos }));
  const zipped = zipSync(files, { level: 0 }); // videos already compressed
  const blob = new Blob([zipped], { type: "application/zip" });
  dlog(`full backup: ${Object.keys(data).length} keys, ${videos.length} videos, ${blob.size} bytes`);
  return { blob, keyCount: Object.keys(data).length, videoCount: videos.length, bytes: blob.size };
}

export interface FullRestoreInfo { keyCount: number; videoCount: number }

/** Import an everything zip: restore video blobs + all localStorage keys.
 *  Also accepts the older workout-only backup zip. Caller should reload after. */
export async function importFullBackupZip(file: Blob): Promise<FullRestoreInfo> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let entries: Record<string, Uint8Array>;
  try { entries = unzipSync(buf); }
  catch { throw new Error("Couldn't read that file — is it a Tunizo backup .zip?"); }

  const jsonU8 = entries["backup.json"] ?? entries["workout-log.json"];
  if (!jsonU8) throw new Error("Not a Tunizo backup (backup.json missing).");
  let manifest: { type?: string; data?: Record<string, string>; videos?: { id: string; file: string; mime?: string; durationSec?: number }[] };
  try { manifest = JSON.parse(strFromU8(jsonU8)); }
  catch { throw new Error("Backup data is corrupt."); }

  let videoCount = 0;
  for (const v of manifest.videos ?? []) {
    const data = entries[v.file];
    if (!data) continue;
    const blob = new Blob([data.slice()], { type: v.mime || "video/webm" });
    await putVideo({ id: v.id, blob, mime: v.mime || "video/webm", durationSec: v.durationSec ?? 0, createdAt: Date.now() });
    videoCount++;
  }

  let keyCount = 0;
  if (manifest.data && typeof manifest.data === "object") {
    for (const [k, val] of Object.entries(manifest.data)) {
      if (isExportKey(k)) { localStorage.setItem(k, val); keyCount++; }
    }
  }
  dlog(`full restore: ${keyCount} keys, ${videoCount} videos`);
  return { keyCount, videoCount };
}

// ── Drive: single everything file in a "Tunizo Backups" folder ────────────

export async function fullBackupToDrive(): Promise<FullBackupInfo> {
  const token = getSavedToken();
  if (!token) throw new Error("Not signed in to Google Drive.");
  const info = await buildFullBackupZip();
  const folder = await findOrCreateFolder(token, FOLDER_NAME);
  const existing = await findFileInFolder(token, folder, BACKUP_NAME);
  if (existing) await updateDriveFileMedia(token, existing.id, info.blob);
  else await uploadDriveFile(token, { name: BACKUP_NAME, mimeType: "application/zip", parents: [folder] }, info.blob);
  dlog(`full backup: uploaded to Drive (${existing ? "updated" : "created"})`);
  return info;
}

export async function fullRestoreFromDrive(): Promise<{ found: boolean; info?: FullRestoreInfo }> {
  const token = getSavedToken();
  if (!token) throw new Error("Not signed in to Google Drive.");
  const folder = await findOrCreateFolder(token, FOLDER_NAME);
  const existing = await findFileInFolder(token, folder, BACKUP_NAME);
  if (!existing) return { found: false };
  const blob = await getDriveFileBlob(token, existing.id);
  const info = await importFullBackupZip(blob);
  return { found: true, info };
}

/** Local download of the everything zip. */
export async function downloadFullBackup(): Promise<FullBackupInfo> {
  const info = await buildFullBackupZip();
  const url = URL.createObjectURL(info.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tunizo-everything-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return info;
}
