// Export the whole workout log — data + video clips — as a single .zip the
// user can drop in a backup folder / cloud drive. On phones we prefer the
// native share sheet (send to Drive, Files, Nearby Share to a computer);
// elsewhere we fall back to a normal download.

import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import {
  getWorkouts, getTemplates, getCustomExercises, getPrefs, referencedVideoIds,
  upsertWorkout, saveTemplate, saveCustomExercise, setPrefs,
} from "./workoutStore";
import { getVideo, putVideo, allVideoIds } from "./workoutVideoDb";
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

// ── Differential restore ──────────────────────────────────────────────────
//
// A restore is a MERGE against what's on the device, not a wholesale rewrite.
// With backups stacking up you're usually restoring one lost thing out of a
// log that's otherwise ahead of the backup, so every record is sorted into:
//
//   added    — in the backup, missing here          → always restored
//   changed  — in both, but the contents differ     → OPT-IN (it overwrites)
//   same     — byte-identical                       → skipped entirely
//
// "same" is the common case and skipping it is what keeps restores cheap:
// video blobs are the bulk of a backup and re-writing ones already in
// IndexedDB is pure waste. "changed" is opt-in because taking the backup's
// version of a record you've since edited is the one genuinely destructive
// thing a restore can do — the caller has to ask for it.

/** Key order is stable within a session (objects are built by the same code
 *  paths), but a backup written by an older build can order keys differently.
 *  Sorting keys makes "same" mean same DATA, not same serialization. */
function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.keys(val).sort().reduce<Record<string, unknown>>((o, k) => { o[k] = (val as any)[k]; return o; }, {});
    }
    return val;
  });
}

const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

export interface DiffBucket<T> { added: T[]; changed: T[]; same: number }
export interface BackupDiff {
  workouts: DiffBucket<Workout>;
  templates: DiffBucket<WorkoutTemplate>;
  exercises: DiffBucket<CustomExercise>;
  /** Videos only ever go one way — a clip's bytes are immutable, so a clip
   *  already in IndexedDB under that id is by definition the same clip. */
  videos: { added: string[]; same: number };
  prefsDiffer: boolean;
  /** True when nothing at all would change. */
  empty: boolean;
}

interface ParsedBackup {
  manifest: any;
  entries: Record<string, Uint8Array>;
}

/** Unzip + validate. Kept separate so a restore can diff, show the user what
 *  it's about to do, and then apply — without unzipping twice. */
export async function readBackupFile(file: File): Promise<ParsedBackup> {
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
  return { manifest, entries };
}

function bucket<T>(incoming: T[], local: T[], key: (t: T) => string): DiffBucket<T> {
  const byKey = new Map(local.map(x => [key(x), x]));
  const out: DiffBucket<T> = { added: [], changed: [], same: 0 };
  for (const item of incoming) {
    const mine = byKey.get(key(item));
    if (!mine) out.added.push(item);
    else if (same(mine, item)) out.same++;
    else out.changed.push(item);
  }
  return out;
}

/** What restoring this backup would actually do to the current device. */
export async function diffBackup(parsed: ParsedBackup): Promise<BackupDiff> {
  const m = parsed.manifest;
  const workouts = bucket((m.workouts ?? []) as Workout[], getWorkouts(), w => w.id);
  const templates = bucket((m.templates ?? []) as WorkoutTemplate[], getTemplates(), t => t.id);
  // Exercises are identified by NAME — saveCustomExercise dedupes that way, and
  // ids differ per device for the same exercise.
  const exercises = bucket(
    (m.customExercises ?? []) as CustomExercise[], getCustomExercises(),
    e => e.name.trim().toLowerCase(),
  );

  const have = new Set(await allVideoIds());
  const incomingVideos = (m.videos ?? []) as { id: string; file: string }[];
  const addedVideos = incomingVideos.filter(v => !have.has(v.id) && parsed.entries[v.file]);
  const videos = { added: addedVideos.map(v => v.id), same: incomingVideos.length - addedVideos.length };

  const prefsDiffer = !!m.prefs && !same({ ...getPrefs(), ...m.prefs }, getPrefs());

  const empty = !workouts.added.length && !workouts.changed.length
    && !templates.added.length && !templates.changed.length
    && !exercises.added.length && !exercises.changed.length
    && !videos.added.length && !prefsDiffer;

  return { workouts, templates, exercises, videos, prefsDiffer, empty };
}

export interface ApplyOptions {
  /** Overwrite records that exist here but differ. Off = additive only. */
  includeChanged?: boolean;
}

/** Apply a diff. Counts reflect what was WRITTEN, not what was in the file. */
export async function applyBackupDiff(
  parsed: ParsedBackup, diff: BackupDiff, opts: ApplyOptions = {},
): Promise<ImportResult> {
  const withChanged = <T,>(b: DiffBucket<T>): T[] => opts.includeChanged ? [...b.added, ...b.changed] : b.added;

  // Videos first, so restored sets never point at a clip that isn't there yet.
  // Only the missing ones — re-writing blobs already in IndexedDB is the single
  // most expensive thing a restore can do, and it buys nothing.
  const wanted = new Set(diff.videos.added);
  let videos = 0;
  for (const v of (parsed.manifest.videos ?? []) as { id: string; file: string; mime: string; durationSec?: number }[]) {
    if (!wanted.has(v.id)) continue;
    const data = parsed.entries[v.file];
    if (!data) continue;
    // .slice() yields a Uint8Array backed by a real ArrayBuffer (valid BlobPart).
    const blob = new Blob([data.slice()], { type: v.mime || "video/webm" });
    await putVideo({ id: v.id, blob, mime: v.mime || "video/webm", durationSec: v.durationSec ?? 0, createdAt: Date.now() });
    videos++;
  }

  const workouts = withChanged(diff.workouts);
  for (const w of workouts) upsertWorkout(w);
  const templates = withChanged(diff.templates);
  for (const t of templates) saveTemplate(t);
  const exercises = withChanged(diff.exercises);
  for (const e of exercises) saveCustomExercise(e.name, e.mode, e.muscleGroups);
  // Prefs are device-level settings, not log data — only an explicit
  // overwrite-changed restore should reach in and reset them.
  if (opts.includeChanged && parsed.manifest.prefs) setPrefs(parsed.manifest.prefs as Partial<WorkoutPrefs>);

  return { workouts: workouts.length, videos, templates: templates.length, exercises: exercises.length };
}

/** Load a backup .zip into the app. Additive by default: brings in what's
 *  missing here and leaves records you've since edited alone. */
export async function importBackupFromFile(file: File, opts: ApplyOptions = {}): Promise<ImportResult> {
  const parsed = await readBackupFile(file);
  const diff = await diffBackup(parsed);
  return applyBackupDiff(parsed, diff, opts);
}
