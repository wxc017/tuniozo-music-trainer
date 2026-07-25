// Export the whole workout log — data + video clips — as a single .zip the
// user can drop in a backup folder / cloud drive. On phones we prefer the
// native share sheet (send to Drive, Files, Nearby Share to a computer);
// elsewhere we fall back to a normal download.

import { zipSync, strToU8 } from "fflate";
import {
  getWorkouts, getTemplates, getCustomExercises, getPrefs, referencedVideoIds,
} from "./workoutStore";
import { getVideo } from "./workoutVideoDb";
import { localToday } from "./storage";

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
