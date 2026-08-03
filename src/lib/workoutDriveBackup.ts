// Full-fidelity workout-log backup to Google Drive — the SAME zip that manual
// "Export" produces (workout-log.json + every referenced video blob), pushed to
// a "Tunizo Workouts" folder in the user's Drive. This captures the video clips
// that the JSON appDataFolder sync can't (they live in IndexedDB, not
// localStorage), so restoring on another device brings the clips too. Import
// merges by id — safe to re-run.
//
// ROTATION: backups are kept as a rolling window of the last KEEP_BACKUPS, not
// one file overwritten in place. Each backup is a NEW timestamped file; once
// there are more than KEEP_BACKUPS, the oldest are deleted. So a bad backup
// (mid-edit, half-synced, accidental wipe) never destroys the good one behind
// it — restore lets you pick an older slot instead.
//
// The upload happens BEFORE the prune, deliberately: if the upload fails you
// still have all your previous backups, and if the prune fails you have one
// extra rather than one too few. Never the other way round.

import {
  getSavedToken, findOrCreateFolder, listFilesInFolder,
  uploadDriveFile, getDriveFileBlob, deleteDriveFile,
} from "./googleDrive";
import {
  buildBackupZip, readBackupFile, diffBackup, applyBackupDiff,
  type ImportResult, type BackupDiff, type ApplyOptions,
} from "./workoutBackup";
import { dlog } from "./driveDebug";

const FOLDER_NAME = "Tunizo Workouts";
/** Shared by every backup file; also matches the pre-rotation single file. */
const BACKUP_PREFIX = "workout-log-backup";
/** The original fixed name, from before rotation — adopted as a normal slot. */
const LEGACY_NAME = "workout-log-backup.zip";
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
}

/** `workout-log-backup-2026-08-03_1432.zip` — lexicographic order matches
 *  chronological order, and it stays readable in the Drive web UI. */
function backupName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${BACKUP_PREFIX}-${stamp}.zip`;
}

function parseStamp(name: string): Date | null {
  const m = /-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})\.zip$/.exec(name);
  if (!m) return null;
  const [, y, mo, da, h, mi, s] = m;
  const d = new Date(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi), Number(s));
  return isNaN(d.getTime()) ? null : d;
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
    .filter(f => f.name.endsWith(".zip"))
    .map(f => {
      const stamped = parseStamp(f.name);
      const created = new Date(f.createdTime || f.modifiedTime || Date.now());
      return {
        id: f.id, name: f.name, bytes: f.size,
        when: stamped ?? created,
        legacy: f.name === LEGACY_NAME,
      };
    })
    .sort((a, b) => a.when.getTime() - b.when.getTime());
}

/** Build the backup zip, upload it as a NEW timestamped file, then drop the
 *  oldest so only KEEP_BACKUPS remain. Returns what was written and removed. */
export async function backupWorkoutsToDrive(): Promise<{
  videoCount: number; bytes: number; kept: number; pruned: number;
}> {
  const token = getSavedToken();
  if (!token) throw new Error("Not signed in to Google Drive.");
  const { blob, videoCount } = await buildBackupZip();
  dlog(`workout backup: zip ${blob.size} bytes, ${videoCount} video(s)`);

  const folder = await findOrCreateFolder(token, FOLDER_NAME);
  const name = backupName(new Date());
  await uploadDriveFile(token, { name, mimeType: "application/zip", parents: [folder] }, blob);
  dlog(`workout backup: uploaded ${name}`);

  // Prune AFTER a confirmed upload — a failed upload must never cost a backup.
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
  } catch (e) {
    // Keeping an extra backup is harmless; failing the whole operation is not.
    dlog(`workout backup: prune failed (${e instanceof Error ? e.message : String(e)}) — extra copies left in place`);
  }

  return { videoCount, bytes: blob.size, kept, pruned };
}

/** A downloaded backup plus what restoring it would change here. Held between
 *  the preview and the apply so the zip is fetched and unzipped exactly once. */
export interface RestorePreview {
  name: string;
  parsed: Awaited<ReturnType<typeof readBackupFile>>;
  diff: BackupDiff;
}

/** Download a backup (by id, or the NEWEST if omitted) and work out what it
 *  would actually change — WITHOUT writing anything. */
export async function previewWorkoutRestore(fileId?: string): Promise<{ found: boolean; preview?: RestorePreview }> {
  const token = getSavedToken();
  if (!token) throw new Error("Not signed in to Google Drive.");

  let id = fileId;
  let name = "backup.zip";
  if (id) {
    const match = (await listWorkoutBackups()).find(b => b.id === id);
    if (!match) { dlog(`workout restore: backup ${id} is gone from Drive`); return { found: false }; }
    name = match.name;
  } else {
    const all = await listWorkoutBackups();
    const newest = all[all.length - 1];
    if (!newest) { dlog("workout restore: no backup zip on Drive yet"); return { found: false }; }
    id = newest.id; name = newest.name;
  }

  const blob = await getDriveFileBlob(token, id);
  const parsed = await readBackupFile(new File([blob], name, { type: "application/zip" }));
  const diff = await diffBackup(parsed);
  dlog(
    `workout restore preview: ${name} — workouts +${diff.workouts.added.length}/~${diff.workouts.changed.length}/=${diff.workouts.same}, ` +
    `videos +${diff.videos.added.length}/=${diff.videos.same}`,
  );
  return { found: true, preview: { name, parsed, diff } };
}

/** Write a previewed restore. Additive unless `includeChanged` is set. */
export async function applyWorkoutRestore(preview: RestorePreview, opts: ApplyOptions = {}): Promise<ImportResult> {
  const result = await applyBackupDiff(preview.parsed, preview.diff, opts);
  dlog(`workout restore: applied ${preview.name} — ${result.workouts} workouts, ${result.videos} video(s) written`);
  return result;
}
