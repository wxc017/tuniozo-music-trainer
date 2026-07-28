// ─────────────────────────────────────────────────────────────────────────
// Workout Log — data model.
//
// The LOG itself (sets / RPE / rest / templates) is tiny JSON and lives in
// localStorage under `lt_workout_*` keys, so it rides the app's existing
// Google-Drive auto-sync (googleDrive.ts) and desktop folder-sync
// (folderSync.ts) for free — log on the phone, it appears on the computer.
//
// VIDEOS are far too large for that payload, so a set only stores a `videoId`
// pointing at a Blob held in a dedicated IndexedDB store (workoutVideoDb.ts).
// Trimming is stored as `trimIn` / `trimOut` seconds — non-destructive marks,
// applied at playback and (later) at export time.
// ─────────────────────────────────────────────────────────────────────────

import type { MuscleGroup } from "./muscleGroups";
export type { MuscleGroup };

export type WeightUnit = "kg" | "lb";

// How a set's "work done" is measured. Chosen per exercise; decides which
// input columns the logger shows.
export type TrackingMode = "weight_reps" | "weight_time" | "reps" | "time";

export const TRACKING_MODES: { id: TrackingMode; label: string; short: string }[] = [
  { id: "weight_reps", label: "Weight + Reps", short: "wt × reps" },
  { id: "weight_time", label: "Weight + Time", short: "wt × time" },
  { id: "reps",        label: "Reps only",    short: "reps" },
  { id: "time",        label: "Time only",    short: "time" },
];

export function modeShowsWeight(m: TrackingMode): boolean { return m === "weight_reps" || m === "weight_time"; }
export function modeShowsReps(m: TrackingMode): boolean { return m === "weight_reps" || m === "reps"; }
export function modeShowsTime(m: TrackingMode): boolean { return m === "weight_time" || m === "time"; }

/** A user-saved exercise (name + how it's tracked), reusable across workouts. */
export interface CustomExercise {
  id: string;
  name: string;
  mode: TrackingMode;
  /** Muscle groups the user tagged this exercise with — used for weekly volume
   *  when the name doesn't auto-resolve to catalog muscles. */
  muscleGroups?: MuscleGroup[];
  createdAt: number;
}

/** One set within a logged exercise. */
export interface WorkoutSet {
  id: string;
  /** Reps performed (dynamic movements). */
  reps?: number;
  /** Hold duration in seconds (static holds — the bread and butter of the
   *  calisthenics skill catalog: levers, planche, cross, etc.). */
  holdSec?: number;
  /** Added/assistance load. Sign convention: positive = added weight,
   *  negative = assistance (e.g. band). Unit is the log-wide `unit`. */
  weight?: number;
  /** Rate of Perceived Exertion, 1–10 in 0.5 steps. */
  rpe?: number;
  /** Self-rated movement quality for this set, 1 (sloppy) – 5 (clean). */
  form?: number;
  /** Rest taken AFTER this set, in seconds. */
  restSec?: number;
  /** Key into the video IndexedDB store (workoutVideoDb.ts) — local storage. */
  videoId?: string;
  /** Google Drive file id when the clip has been offloaded to Drive. */
  driveFileId?: string;
  /** Non-destructive trim marks, in seconds from the clip start. */
  trimIn?: number;
  trimOut?: number;
  note?: string;
  /** Checked off during a live session. */
  done?: boolean;
}

/** An exercise as it appears inside one workout, with its sets. */
export interface LoggedExercise {
  id: string;
  /** Links back to the SKILLS catalog (calisthenicsData.ts) when picked from
   *  it — lets the log show the muscle map / 3D pose. Absent for free-text. */
  skillId?: string;
  name: string;
  /** How this exercise's sets are measured (which columns show). */
  mode: TrackingMode;
  sets: WorkoutSet[];
  note?: string;
}

/** A single logged training session. */
export interface Workout {
  id: string;
  /** Local calendar date `YYYY-MM-DD` (see storage.localToday). */
  date: string;
  startedAt: number;
  endedAt?: number;
  title?: string;
  /** Template this session was started from, if any. */
  templateId?: string;
  exercises: LoggedExercise[];
  note?: string;
}

/** A reusable custom workout the user saves and re-runs. */
export interface TemplateExercise {
  skillId?: string;
  name: string;
  mode: TrackingMode;
  targetSets?: number;
  targetReps?: number;
  targetHoldSec?: number;
  targetRpe?: number;
  restSec?: number;
  note?: string;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  exercises: TemplateExercise[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkoutPrefs {
  unit: WeightUnit;
  /** Default rest in seconds, used to pre-fill new sets. */
  defaultRestSec: number;
}

export const DEFAULT_PREFS: WorkoutPrefs = { unit: "lb", defaultRestSec: 120 };
