// Full-fidelity workout-log backup to Google Drive — the log JSON plus every
// video clip — in a "Tunizo Workouts" folder. This captures the clips that the
// JSON appDataFolder sync can't (they live in IndexedDB, not localStorage), so
// restoring on another device brings the footage too. Restore merges by id.
//
// ── WHY THIS IS PER-CLIP AND NOT ONE ZIP ────────────────────────────────
// It used to build a single .zip and send it in one shot, and that fell over for
// three compounding reasons:
//
//   1. Every clip was decoded into memory (blob → Uint8Array), then zipSync
//      built one contiguous buffer, then that became a Blob. Three copies of the
//      entire library resident before a single byte went out — minutes of work
//      on a phone, and an easy way to get the tab killed.
//   2. The upload was ONE non-resumable multipart request. No progress to show,
//      no way to resume, and any dropped connection meant starting from zero.
//   3. Every backup re-sent every clip, and rotation kept three full copies. The
//      cost scaled with the whole library, forever, instead of with what changed.
//
// Together those are exactly "extremely slow and it seems like it will never
// back up". So now: each clip is its own Drive file named by its video id and
// uploaded ONCE, resumably, with progress; a backup uploads only the clips Drive
// doesn't already have, then writes a small JSON manifest. A second backup with
// no new footage moves a few KB.
//
// ROTATION: manifests are kept as a rolling window of the last KEEP_BACKUPS, so
// a bad backup never destroys the good one behind it. Clips are shared between
// manifests and are only deleted once NO kept manifest refers to them.
//
// Order matters and is deliberate: clips, then manifest, then prune. A manifest
// is only ever written once the clips it names are already up, so no manifest
// can point at footage that isn't there. Prune runs last, so a failure part-way
// leaves too much rather than too little.

import {
  getSavedToken, findOrCreateFolder, listFilesInFolder,
  uploadDriveFile, uploadDriveFileResumable, getDriveFileBlob, deleteDriveFile,
} from "./googleDrive";
import {
  buildManifest, readBackupFile, parsedFromManifest, diffBackup, applyBackupDiff,
  type ImportResult, type BackupDiff, type ApplyOptions,
} from "./workoutBackup";
import { getVideo } from "./workoutVideoDb";
import { dlog } from "./driveDebug";

const FOLDER_NAME = "Tunizo Workouts";
/** Manifests. Also matches the pre-rotation single file and the old zips. */
const BACKUP_PREFIX = "workout-log-backup";
/** The original fixed name, from before rotation — adopted as a normal slot. */
const LEGACY_NAME = "workout-log-backup.zip";
/** Clips live beside the manifests as `clip-<videoId>.<ext>`. */
const CLIP_PREFIX = "clip-";
/** How many backups to keep. The oldest beyond this are deleted on backup. */
export const KEEP_BACKUPS = 3;

export interface DriveBackup {
  id: string;
  name: string;
  /** Backup instant — parsed from the filename, else Drive's createdTime. */
  when: Date;
  bytes: number;
  /** True for the single pre-rotation file, which carries no timestamp. */
  legacy: boolean;
  /** True for the old one-file-holds-everything format. Still restorable. */
  zip: boolean;
}

/** `workout-log-backup-2026-08-07_1432.json` — lexicographic order matches
 *  chronological order, and it stays readable in the Drive web UI. */
function backupName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${BACKUP_PREFIX}-${stamp}.json`;
}

function parseStamp(name: string): Date | null {
  const m = /-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})\.(zip|json)$/.exec(name);
  if (!m) return null;
  const [, y, mo, da, h, mi, s] = m;
  const d = new Date(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi), Number(s));
  return isNaN(d.getTime()) ? null : d;
}

/** Clip filename ↔ video id.  The id is the whole identity: a clip's bytes never
 *  change, so a file already named for that id is already the right bytes and
 *  never needs re-uploading. */
const clipName = (id: string, mime: string) => `${CLIP_PREFIX}${id}.${extFor(mime)}`;
const clipId = (name: string) => {
  if (!name.startsWith(CLIP_PREFIX)) return null;
  const rest = name.slice(CLIP_PREFIX.length);
  const dot = rest.lastIndexOf(".");
  return (dot > 0 ? rest.slice(0, dot) : rest) || null;
};
function extFor(mime: string): string {
  if (/mp4/i.test(mime)) return "mp4";
  if (/webm/i.test(mime)) return "webm";
  if (/quicktime|mov/i.test(mime)) return "mov";
  return "bin";
}

/** Every backup in the folder, OLDEST FIRST — slot 1 is the one that gets
 *  dropped next. Drive is the single source of truth here; nothing is cached,
 *  so a backup taken on another device shows up straight away. */
export async function listWorkoutBackups(): Promise<DriveBackup[]> {
  const token = getSavedToken();
  if (!token) throw new Error("Not signed in to Google Drive.");
  const folder = await findOrCreateFolder(token, FOLDER_NAME);
  const files = await listFilesInFolder(token, folder, BACKUP_PREFIX);
  return files
    .filter(f => f.name.endsWith(".json") || f.name.endsWith(".zip"))
    .map(f => {
      const stamped = parseStamp(f.name);
      const created = new Date(f.createdTime || f.modifiedTime || Date.now());
      return {
        id: f.id, name: f.name, bytes: f.size,
        when: stamped ?? created,
        legacy: f.name === LEGACY_NAME,
        zip: f.name.endsWith(".zip"),
      };
    })
    .sort((a, b) => a.when.getTime() - b.when.getTime());
}

/** Clips already on Drive: video id → file id. */
async function listRemoteClips(token: string, folder: string): Promise<Map<string, string>> {
  const files = await listFilesInFolder(token, folder, CLIP_PREFIX);
  const out = new Map<string, string>();
  for (const f of files) {
    const id = clipId(f.name);
    if (id) out.set(id, f.id);
  }
  return out;
}

/** What a backup is doing right now, for the UI to render. */
export type BackupProgress =
  | { phase: "scanning" }
  | { phase: "clips"; done: number; total: number; sentBytes: number; totalBytes: number }
  | { phase: "manifest" }
  | { phase: "pruning" };

export interface BackupOptions { onProgress?: (p: BackupProgress) => void }

/** Upload any clips Drive is missing, then the manifest, then prune. */
export async function backupWorkoutsToDrive(opts: BackupOptions = {}): Promise<{
  videoCount: number; uploadedClips: number; bytes: number; kept: number; pruned: number;
}> {
  const token = getSavedToken();
  if (!token) throw new Error("Not signed in to Google Drive.");
  const report = opts.onProgress ?? (() => {});

  report({ phase: "scanning" });
  const folder = await findOrCreateFolder(token, FOLDER_NAME);
  const remote = await listRemoteClips(token, folder);
  const manifest = await buildManifest();

  // Name each clip after its id so the "do I already have this?" test is a
  // filename lookup rather than a download-and-compare.
  const missing: { id: string; mime: string; bytes: number }[] = [];
  for (const v of manifest.videos) {
    if (remote.has(v.id)) continue;
    const stored = await getVideo(v.id);
    if (!stored) continue;                      // referenced but gone locally
    missing.push({ id: v.id, mime: v.mime, bytes: stored.blob.size });
  }
  const totalBytes = missing.reduce((n, m) => n + m.bytes, 0);
  dlog(`workout backup: ${manifest.videos.length} clip(s) referenced, ${missing.length} to upload (${totalBytes} bytes)`);

  let sentBytes = 0;
  let uploadedClips = 0;
  report({ phase: "clips", done: 0, total: missing.length, sentBytes: 0, totalBytes });
  for (const m of missing) {
    const stored = await getVideo(m.id);
    if (!stored) continue;
    const base = sentBytes;
    await uploadDriveFileResumable(
      token,
      { name: clipName(m.id, m.mime), mimeType: m.mime || "video/webm", parents: [folder] },
      stored.blob,
      sent => report({ phase: "clips", done: uploadedClips, total: missing.length, sentBytes: base + sent, totalBytes }),
    );
    sentBytes = base + m.bytes;
    uploadedClips++;
    report({ phase: "clips", done: uploadedClips, total: missing.length, sentBytes, totalBytes });
    dlog(`workout backup: uploaded clip ${m.id} (${m.bytes} bytes)`);
  }

  // Manifest LAST of the two, so it can never name a clip that isn't up yet.
  report({ phase: "manifest" });
  const json = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
  const name = backupName(new Date());
  await uploadDriveFile(token, { name, mimeType: "application/json", parents: [folder] }, json);
  dlog(`workout backup: uploaded ${name} (${json.size} bytes)`);

  // Prune AFTER a confirmed upload — a failed upload must never cost a backup.
  report({ phase: "pruning" });
  let pruned = 0;
  let kept = KEEP_BACKUPS;
  try {
    const all = await listWorkoutBackups();          // oldest first, includes the new one
    const excess = all.slice(0, Math.max(0, all.length - KEEP_BACKUPS));
    for (const old of excess) {
      await deleteDriveFile(token, old.id);
      pruned++;
      dlog(`workout backup: pruned ${old.name}`);
    }
    kept = all.length - pruned;

    // Clips are shared between manifests, so one is only garbage once NOTHING
    // kept still names it.  Reading the survivors back is the only safe test —
    // deleting on "not in the newest manifest" would tear footage out from under
    // an older backup that's still in the window.
    const survivors = all.slice(pruned);
    const stillWanted = new Set<string>();
    for (const b of survivors) {
      if (b.zip) { stillWanted.add("*"); break; }   // can't cheaply read a zip's list — keep everything
      try {
        const blob = await getDriveFileBlob(token, b.id);
        const m = JSON.parse(await blob.text());
        for (const v of (m.videos ?? []) as { id: string }[]) stillWanted.add(v.id);
      } catch { stillWanted.add("*"); break; }      // unreadable → assume it needs them all
    }
    if (!stillWanted.has("*")) {
      for (const [id, fileId] of remote) {
        if (stillWanted.has(id) || manifest.videos.some(v => v.id === id)) continue;
        await deleteDriveFile(token, fileId);
        dlog(`workout backup: pruned orphan clip ${id}`);
      }
    }
  } catch (e) {
    // Keeping an extra backup is harmless; failing the whole operation is not.
    dlog(`workout backup: prune failed (${e instanceof Error ? e.message : String(e)}) — extra copies left in place`);
  }

  return { videoCount: manifest.videos.length, uploadedClips, bytes: sentBytes + json.size, kept, pruned };
}

/** A downloaded backup plus what restoring it would change here. Held between
 *  the preview and the apply so it's fetched and parsed exactly once. */
export interface RestorePreview {
  name: string;
  parsed: Awaited<ReturnType<typeof readBackupFile>>;
  diff: BackupDiff;
}

/** Download a backup (by id, or the NEWEST if omitted) and work out what it
 *  would actually change — WITHOUT writing anything.  Clips are NOT downloaded
 *  here; the diff only needs to know which ones exist, and pulling footage the
 *  user might not go on to restore is the waste this whole rewrite is about. */
export async function previewWorkoutRestore(fileId?: string): Promise<{ found: boolean; preview?: RestorePreview }> {
  const token = getSavedToken();
  if (!token) throw new Error("Not signed in to Google Drive.");

  const all = await listWorkoutBackups();
  const match = fileId ? all.find(b => b.id === fileId) : all[all.length - 1];
  if (!match) {
    dlog(fileId ? `workout restore: backup ${fileId} is gone from Drive` : "workout restore: no backup on Drive yet");
    return { found: false };
  }

  const blob = await getDriveFileBlob(token, match.id);
  let parsed: Awaited<ReturnType<typeof readBackupFile>>;
  if (match.zip) {
    // An older single-zip backup. Still readable, bytes and all.
    parsed = await readBackupFile(new File([blob], match.name, { type: "application/zip" }));
  } else {
    const manifest = JSON.parse(await blob.text());
    if (manifest?.type !== "tunizo-workout-backup") throw new Error("Unrecognized backup file.");
    const folder = await findOrCreateFolder(token, FOLDER_NAME);
    const remote = await listRemoteClips(token, folder);
    parsed = parsedFromManifest(manifest, {
      has: id => remote.has(id),
      read: async id => {
        const f = remote.get(id);
        if (!f) return null;
        const b = await getDriveFileBlob(token, f);
        return new Uint8Array(await b.arrayBuffer());
      },
    });
  }

  const diff = await diffBackup(parsed);
  dlog(
    `workout restore preview: ${match.name} — workouts +${diff.workouts.added.length}/~${diff.workouts.changed.length}/=${diff.workouts.same}, ` +
    `videos +${diff.videos.added.length}/=${diff.videos.same}`,
  );
  return { found: true, preview: { name: match.name, parsed, diff } };
}

/** Write a previewed restore. Additive unless `includeChanged` is set. */
export async function applyWorkoutRestore(preview: RestorePreview, opts: ApplyOptions = {}): Promise<ImportResult> {
  const result = await applyBackupDiff(preview.parsed, preview.diff, opts);
  dlog(`workout restore: applied ${preview.name} — ${result.workouts} workouts, ${result.videos} video(s) written`);
  return result;
}
