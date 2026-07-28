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
import { shouldSyncEntry } from "./storage";
import { getWorkouts } from "./workoutStore";
import { getVideo, putVideo, allVideoIds } from "./workoutVideoDb";
import { getClipUrl } from "./workoutDrive";
import { computeSyncDiff, applySyncSelection, type SyncDiff } from "./syncMerge";
import {
  getSavedToken, findOrCreateFolder, findFileInFolder, updateDriveFileMedia,
  uploadDriveFile, getDriveFileBlob,
} from "./googleDrive";
import { dlog } from "./driveDebug";

const FOLDER_NAME = "Tunizo Backups";
const BACKUP_NAME = "tunizo-everything.zip";
const SIG_KEY = "lt_full_backup_sig";        // signature of the last successful Drive upload
const VIDEO_SEL_PREFIX = "vid::";             // must match SyncMergeDialog.videoSelId

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
    const v = localStorage.getItem(k)!;
    if (shouldSyncEntry(k, v)) data[k] = v;
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
      if (shouldSyncEntry(k, val)) { localStorage.setItem(k, val); keyCount++; }
    }
  }
  dlog(`full restore: ${keyCount} keys, ${videoCount} videos`);
  return { keyCount, videoCount };
}

// ── Drive: single everything file in a "Tunizo Backups" folder ────────────

// A cheap content signature of everything a backup would contain (all export
// keys + the set of referenced clip ids). If it's unchanged since the last
// successful upload we skip re-zipping/re-uploading entirely — so hitting
// "Export to Drive" when nothing changed is an instant no-op.
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h;
}
function currentSignature(): string {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (shouldSyncEntry(k, localStorage.getItem(k))) keys.push(k); }
  keys.sort();
  const parts = keys.map(k => { const v = localStorage.getItem(k) ?? ""; return `${k}:${v.length}:${djb2(v)}`; });
  const clipIds = new Set<string>();
  for (const w of getWorkouts()) for (const ex of w.exercises) for (const s of ex.sets) { const id = s.videoId || s.driveFileId; if (id) clipIds.add(id); }
  parts.push("V:" + [...clipIds].sort().join(","));
  return String(djb2(parts.join("|")));
}

export interface DriveBackupResult { keyCount: number; videoCount: number; bytes: number; skipped: boolean }

export async function fullBackupToDrive(): Promise<DriveBackupResult> {
  const token = getSavedToken();
  if (!token) throw new Error("Not signed in to Google Drive.");
  const sig = currentSignature();
  const folder = await findOrCreateFolder(token, FOLDER_NAME);
  const existing = await findFileInFolder(token, folder, BACKUP_NAME);
  // Nothing changed since the last upload AND a backup already exists → skip.
  if (existing && localStorage.getItem(SIG_KEY) === sig) {
    dlog("full backup: unchanged since last upload — skipped");
    return { keyCount: 0, videoCount: 0, bytes: 0, skipped: true };
  }
  const info = await buildFullBackupZip();
  if (existing) await updateDriveFileMedia(token, existing.id, info.blob);
  else await uploadDriveFile(token, { name: BACKUP_NAME, mimeType: "application/zip", parents: [folder] }, info.blob);
  try { localStorage.setItem(SIG_KEY, sig); } catch { /* quota — non-fatal */ }
  dlog(`full backup: uploaded to Drive (${existing ? "updated" : "created"})`);
  return { keyCount: info.keyCount, videoCount: info.videoCount, bytes: info.bytes, skipped: false };
}

// ── Restore: diff first, then apply only what's selected ──────────────────
// Instead of blindly overwriting this device, download the backup, diff it
// against local data, and hand the caller a preview to confirm. Clips already
// present locally are NOT re-imported (immutable by id) — only genuinely new
// ones are pulled in, so an overlapping restore does far less work.

export interface RestorePreview {
  found: boolean;
  dataJson?: string;
  diff?: SyncDiff;
  /** Clips in the backup that this device doesn't already have. */
  newVideos?: { id: string; label: string }[];
  /** Clips skipped because they're already local. */
  skippedVideos?: number;
  // internal — carried to applyFullRestore:
  entries?: Record<string, Uint8Array>;
  videos?: { id: string; file: string; mime?: string; durationSec?: number }[];
}

export async function previewFullRestoreFromDrive(): Promise<RestorePreview> {
  const token = getSavedToken();
  if (!token) throw new Error("Not signed in to Google Drive.");
  const folder = await findOrCreateFolder(token, FOLDER_NAME);
  const existing = await findFileInFolder(token, folder, BACKUP_NAME);
  if (!existing) return { found: false };
  const blob = await getDriveFileBlob(token, existing.id);
  const buf = new Uint8Array(await blob.arrayBuffer());
  let entries: Record<string, Uint8Array>;
  try { entries = unzipSync(buf); }
  catch { throw new Error("Couldn't read the Drive backup — is it a Tunizo .zip?"); }

  const jsonU8 = entries["backup.json"] ?? entries["workout-log.json"];
  if (!jsonU8) throw new Error("Not a Tunizo backup (backup.json missing).");
  const manifest = JSON.parse(strFromU8(jsonU8)) as { data?: Record<string, string>; videos?: { id: string; file: string; mime?: string; durationSec?: number }[] };
  const data = (manifest.data && typeof manifest.data === "object") ? manifest.data : {};
  const videos = manifest.videos ?? [];
  const dataJson = JSON.stringify({ data });
  const diff = computeSyncDiff(dataJson);

  const localIds = new Set(await allVideoIds());
  const newVideos = videos.filter(v => !localIds.has(v.id)).map((v, i) => ({ id: v.id, label: v.file?.split("/").pop() || `clip ${i + 1}` }));
  const skippedVideos = videos.length - newVideos.length;
  dlog(`full restore preview: ${diff.items.length + diff.values.length} data changes, ${newVideos.length} new / ${skippedVideos} present videos`);
  return { found: true, dataJson, diff, newVideos, skippedVideos, entries, videos };
}

/** Apply only the selected changes from a preview. `applied` holds item/value
 *  ids from the diff plus `vid::<id>` for each clip to import. */
export async function applyFullRestore(preview: RestorePreview, applied: Set<string>): Promise<{ keyCount: number; videoCount: number }> {
  if (!preview.found || !preview.dataJson || !preview.diff || !preview.entries || !preview.videos) return { keyCount: 0, videoCount: 0 };
  applySyncSelection(preview.dataJson, preview.diff, applied);
  let videoCount = 0;
  for (const v of preview.videos) {
    if (!applied.has(VIDEO_SEL_PREFIX + v.id)) continue;
    const u8 = preview.entries[v.file];
    if (!u8) continue;
    const b = new Blob([u8.slice()], { type: v.mime || "video/webm" });
    await putVideo({ id: v.id, blob: b, mime: v.mime || "video/webm", durationSec: v.durationSec ?? 0, createdAt: Date.now() });
    videoCount++;
  }
  const keyCount = [...applied].filter(id => !id.startsWith(VIDEO_SEL_PREFIX)).length;
  dlog(`full restore apply: ${keyCount} data changes, ${videoCount} videos imported`);
  return { keyCount, videoCount };
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
