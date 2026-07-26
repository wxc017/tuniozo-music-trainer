// Full-fidelity workout-log backup to Google Drive — the SAME zip that manual
// "Export" produces (workout-log.json + every referenced video blob), pushed to
// a "Tunizo Workouts" folder in the user's Drive as a single file that's
// updated in place. This captures the video clips that the JSON appDataFolder
// sync can't (they live in IndexedDB, not localStorage), so restoring on
// another device brings the clips too. Import merges by id — safe to re-run.

import {
  getSavedToken, findOrCreateFolder, findFileInFolder, updateDriveFileMedia,
  uploadDriveFile, getDriveFileBlob,
} from "./googleDrive";
import { buildBackupZip, importBackupFromFile, type ImportResult } from "./workoutBackup";
import { dlog } from "./driveDebug";

const FOLDER_NAME = "Tunizo Workouts";
const BACKUP_NAME = "workout-log-backup.zip";

/** Build the backup zip and upload it to Drive (create or update in place). */
export async function backupWorkoutsToDrive(): Promise<{ videoCount: number; bytes: number }> {
  const token = getSavedToken();
  if (!token) throw new Error("Not signed in to Google Drive.");
  const { blob, videoCount } = await buildBackupZip();
  dlog(`workout backup: zip ${blob.size} bytes, ${videoCount} video(s)`);
  const folder = await findOrCreateFolder(token, FOLDER_NAME);
  const existing = await findFileInFolder(token, folder, BACKUP_NAME);
  if (existing) await updateDriveFileMedia(token, existing.id, blob);
  else await uploadDriveFile(token, { name: BACKUP_NAME, mimeType: "application/zip", parents: [folder] }, blob);
  dlog(`workout backup: uploaded OK (${existing ? "updated" : "created"})`);
  return { videoCount, bytes: blob.size };
}

/** Download the latest backup zip from Drive and merge it into the log. */
export async function restoreWorkoutsFromDrive(): Promise<{ found: boolean; result?: ImportResult }> {
  const token = getSavedToken();
  if (!token) throw new Error("Not signed in to Google Drive.");
  const folder = await findOrCreateFolder(token, FOLDER_NAME);
  const existing = await findFileInFolder(token, folder, BACKUP_NAME);
  if (!existing) { dlog("workout restore: no backup zip on Drive yet"); return { found: false }; }
  const blob = await getDriveFileBlob(token, existing.id);
  const file = new File([blob], BACKUP_NAME, { type: "application/zip" });
  const result = await importBackupFromFile(file);
  dlog(`workout restore: imported ${result.workouts} workouts, ${result.videos} video(s)`);
  return { found: true, result };
}
