// Export the whole workout log — data + video clips — as a single .zip the
// user can drop in a backup folder / cloud drive. On phones we prefer the
// native share sheet (send to Drive, Files, Nearby Share to a computer);
// elsewhere we fall back to a normal download.

import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import {
  getWorkouts, getTemplates, getCustomExercises, getPrefs, referencedVideoIds,
  upsertWorkout, saveTemplate, saveCustomExercise, setPrefs,
} from "./workoutStore";
import { getVideo, putVideo } from "./workoutVideoDb";
import { localToday } from "./storage";
import type { Workout, WorkoutTemplate, CustomExercise, WorkoutPrefs } from "./workoutTypes";

function extFor(mime: string): string {
  if (/mp4/i.test(mime)) return "mp4";
  if (/webm/i.test(mime)) return "webm";
  if (/quicktime|mov/i.test(mime)) return "mov";
  return "bin";
}

export interface BackupResult { blob: Blob; filename: string; videoCount: number }

/** Build the backup zip: workout-log.json + videos/<id>.<ext>. */
export async function buildBackupZip(): Promise<BackupResult> {
  const manifest = {
    type: "tunizo-workout-backup",
    version: 1,
    exported: new Date().toISOString(),
    workouts: getWorkouts(),
    templates: getTemplates(),
    customExercises: getCustomExercises(),
    prefs: getPrefs(),
    videos: [] as { id: string; file: string; mime: string; durationSec: number }[],
  };

  const files: Record<string, Uint8Array> = {};
  const ids = referencedVideoIds();
  for (const id of ids) {
    const v = await getVideo(id);
    if (!v) continue;
    const file = `videos/${id}.${extFor(v.mime)}`;
    files[file] = new Uint8Array(await v.blob.arrayBuffer());
    manifest.videos.push({ id, file, mime: v.mime, durationSec: v.durationSec });
  }
  files["workout-log.json"] = strToU8(JSON.stringify(manifest, null, 2));

  // level 0 (store): video/webm/mp4 are already compressed, so this is fast
  // and avoids re-deflating large blobs.
  const zipped = zipSync(files, { level: 0 });
  const blob = new Blob([zipped], { type: "application/zip" });
  return { blob, filename: `tunizo-workout-backup-${localToday()}.zip`, videoCount: manifest.videos.length };
}

/** Build + hand off the backup (share sheet where available, else download). */
export async function exportBackup(): Promise<{ shared: boolean; videoCount: number }> {
  const { blob, filename, videoCount } = await buildBackupZip();
  const nav = navigator as any;
  const file = new File([blob], filename, { type: "application/zip" });

  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "Tunizo workout backup" });
      return { shared: true, videoCount };
    } catch (err) {
      if ((err as any)?.name === "AbortError") return { shared: true, videoCount };
      // otherwise fall through to download
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { shared: false, videoCount };
}

export interface ImportResult { workouts: number; videos: number; templates: number; exercises: number }

/** Load a backup .zip into the app (merges by id — safe to re-import). */
export async function importBackupFromFile(file: File): Promise<ImportResult> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let entries: Record<string, Uint8Array>;
  try { entries = unzipSync(buf); }
  catch { throw new Error("Couldn't read that file — is it a Tunizo backup .zip?"); }

  const jsonU8 = entries["workout-log.json"];
  if (!jsonU8) throw new Error("Not a Tunizo backup (workout-log.json missing).");
  let manifest: any;
  try { manifest = JSON.parse(strFromU8(jsonU8)); }
  catch { throw new Error("Backup data is corrupt."); }
  if (manifest?.type !== "tunizo-workout-backup") throw new Error("Unrecognized backup file.");

  // Videos first (restored with their original ids so sets stay linked).
  let videos = 0;
  for (const v of (manifest.videos ?? []) as { id: string; file: string; mime: string; durationSec?: number }[]) {
    const data = entries[v.file];
    if (!data) continue;
    // .slice() yields a Uint8Array backed by a real ArrayBuffer (valid BlobPart).
    const blob = new Blob([data.slice()], { type: v.mime || "video/webm" });
    await putVideo({ id: v.id, blob, mime: v.mime || "video/webm", durationSec: v.durationSec ?? 0, createdAt: Date.now() });
    videos++;
  }

  const workouts = (manifest.workouts ?? []) as Workout[];
  for (const w of workouts) upsertWorkout(w);
  const templates = (manifest.templates ?? []) as WorkoutTemplate[];
  for (const t of templates) saveTemplate(t);
  const exercises = (manifest.customExercises ?? []) as CustomExercise[];
  for (const e of exercises) saveCustomExercise(e.name, e.mode);
  if (manifest.prefs) setPrefs(manifest.prefs as Partial<WorkoutPrefs>);

  return { workouts: workouts.length, videos, templates: templates.length, exercises: exercises.length };
}
