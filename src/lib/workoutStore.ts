// ─────────────────────────────────────────────────────────────────────────
// Workout Log — persistence + CRUD.
//
// Everything here is small JSON under `lt_workout_*` keys, so folderSync's
// setItem interceptor fires `lt-data-changed` on every write and the log
// auto-syncs (Google Drive + desktop folder) exactly like the practice log.
//
// A `lt-workout-changed` event lets React views re-read after a mutation
// without prop-drilling a store through the whole tree.
// ─────────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from "react";
import { lsGet, lsSet, localToday } from "./storage";
import {
  type Workout, type WorkoutTemplate, type WorkoutPrefs,
  type LoggedExercise, type WorkoutSet, type TemplateExercise,
  type TrackingMode, type CustomExercise, type MuscleGroup,
  DEFAULT_PREFS,
} from "./workoutTypes";
import { SKILLS } from "./staticsData";
import { SEED_EXERCISES } from "./workoutSeed";

const LOG_KEY = "lt_workout_log";
const TEMPLATES_KEY = "lt_workout_templates";
const PREFS_KEY = "lt_workout_prefs";
const CUSTOM_EX_KEY = "lt_workout_custom_exercises";
const CHANGE_EVENT = "lt-workout-changed";

// ── ids ────────────────────────────────────────────────────────────────
let counter = 0;
export function uid(prefix = "w"): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

// ── raw reads / writes ───────────────────────────────────────────────────
export function getWorkouts(): Workout[] {
  const v = lsGet<Workout[]>(LOG_KEY, []);
  return Array.isArray(v) ? v : [];
}
export function getTemplates(): WorkoutTemplate[] {
  const v = lsGet<WorkoutTemplate[]>(TEMPLATES_KEY, []);
  return Array.isArray(v) ? v : [];
}
export function getPrefs(): WorkoutPrefs {
  return { ...DEFAULT_PREFS, ...lsGet<Partial<WorkoutPrefs>>(PREFS_KEY, {}) };
}
export function getCustomExercises(): CustomExercise[] {
  const v = lsGet<CustomExercise[]>(CUSTOM_EX_KEY, []);
  return Array.isArray(v) ? v : [];
}

// Built-in starter exercises are HARD-CODED (from SEED_EXERCISES) — never stored,
// never synced, so they can't duplicate across devices. Stable ids (name-derived)
// keep references consistent. ONLY user-created exercises live in storage.
const cexSlug = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const BUILTIN_EXERCISES: CustomExercise[] = SEED_EXERCISES.map(s => ({
  id: `cex_builtin_${cexSlug(s.name)}`, name: s.name, mode: s.mode, createdAt: 0,
}));
const BUILTIN_NAMES = new Set(BUILTIN_EXERCISES.map(e => e.name.toLowerCase()));
export function isBuiltinExerciseId(id: string): boolean { return id.startsWith("cex_builtin_"); }
/** Built-in starter list ∪ the user's own stored exercises (built-in wins on a name
 *  clash). This is what the picker shows; storage/sync hold ONLY user exercises. */
export function getAllExercises(): CustomExercise[] {
  const user = getCustomExercises().filter(e => !BUILTIN_NAMES.has(e.name.trim().toLowerCase()));
  return [...BUILTIN_EXERCISES, ...user];
}

/** Sensible default tracking mode for a catalog skill: static holds are timed,
 *  everything else is reps. Users can flip it per-exercise in the logger. */
export function defaultModeForSkill(skillId?: string): TrackingMode {
  if (!skillId) return "weight_reps";
  return SKILLS.find(s => s.id === skillId)?.category === "static" ? "time" : "reps";
}

function writeWorkouts(list: Workout[]): void { lsSet(LOG_KEY, list); emitChange(); }
function writeTemplates(list: WorkoutTemplate[]): void { lsSet(TEMPLATES_KEY, list); emitChange(); }
function writeCustomExercises(list: CustomExercise[]): void { lsSet(CUSTOM_EX_KEY, list); emitChange(); }

/** Save (or update by case-insensitive name) a reusable custom exercise. */
export function saveCustomExercise(name: string, mode: TrackingMode, muscleGroups?: MuscleGroup[]): CustomExercise {
  const nm = name.trim();
  // A built-in name resolves to the hard-coded exercise — never store a copy of it.
  const builtin = BUILTIN_EXERCISES.find(e => e.name.toLowerCase() === nm.toLowerCase());
  if (builtin) return builtin;
  const list = getCustomExercises();
  const existing = list.find(e => e.name.toLowerCase() === nm.toLowerCase());
  if (existing) {
    existing.mode = mode;
    if (muscleGroups?.length) existing.muscleGroups = muscleGroups;
    rev++; writeCustomExercises(list);
    return existing;
  }
  const ex: CustomExercise = { id: uid("cex"), name: name.trim(), mode, createdAt: Date.now(), ...(muscleGroups?.length ? { muscleGroups } : {}) };
  rev++; writeCustomExercises([...list, ex]);
  return ex;
}
export function deleteCustomExercise(id: string): void {
  captureUndo("exercise");
  rev++; writeCustomExercises(getCustomExercises().filter(e => e.id !== id));
}

// Built-in exercises are hard-coded now (BUILTIN_EXERCISES) and never stored. Older
// versions COPIED the starter list into the stored custom list with per-device random
// ids, so a Drive sync (which merges by id) duplicated every exercise across devices.
// This strips those stored copies back out — idempotent, so it self-heals if a stale
// device re-syncs them in. Runs at startup in place of the old seeding.
const SEED_FLAG = "lt_workout_seeded_v1";
export function pruneStoredBuiltins(): void {
  try {
    const list = getCustomExercises();
    const kept = list.filter(e => !BUILTIN_NAMES.has(e.name.trim().toLowerCase()));
    if (kept.length !== list.length) { rev++; writeCustomExercises(kept); }
    localStorage.removeItem(SEED_FLAG);   // the old one-time seed guard is now obsolete
  } catch { /* storage unavailable */ }
}

/** Wipe ALL workout data on THIS device — log, templates, user exercises, prefs, and
 *  the old seed flag. Built-in exercises come back automatically (they're hard-coded).
 *  Video blobs are cleared by the caller. Does NOT touch Drive. */
export function wipeWorkoutData(): void {
  rev++;
  for (const k of [LOG_KEY, TEMPLATES_KEY, CUSTOM_EX_KEY, PREFS_KEY, SEED_FLAG]) {
    try { localStorage.removeItem(k); } catch { /* */ }
  }
  emitChange();
}
export function setPrefs(patch: Partial<WorkoutPrefs>): void {
  rev++;
  lsSet(PREFS_KEY, { ...getPrefs(), ...patch }); emitChange();
}

// ── change subscription (for useSyncExternalStore) ───────────────────────
const listeners = new Set<() => void>();
/** Every mutator bumps `rev` (invalidating the snapshot cache) BEFORE its
 *  write, then the write calls this to notify subscribers. */
function emitChange(): void {
  listeners.forEach(l => l());
  try { window.dispatchEvent(new CustomEvent(CHANGE_EVENT)); } catch { /* jsdom */ }
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // Also re-fire when a sync restore rewrites localStorage from another device.
  const onExternal = () => cb();
  window.addEventListener("lt-folder-sync-loaded", onExternal);
  return () => { listeners.delete(cb); window.removeEventListener("lt-folder-sync-loaded", onExternal); };
}

/** Reactive snapshot of the whole log; re-renders on any mutation. */
export function useWorkoutData(): {
  workouts: Workout[]; templates: WorkoutTemplate[]; prefs: WorkoutPrefs; customExercises: CustomExercise[];
} {
  const workouts = useSyncExternalStore(subscribe, getWorkoutsSnapshot);
  const templates = useSyncExternalStore(subscribe, getTemplatesSnapshot);
  const prefs = useSyncExternalStore(subscribe, getPrefsSnapshot);
  const customExercises = useSyncExternalStore(subscribe, getCustomSnapshot);
  return { workouts, templates, prefs, customExercises };
}

// useSyncExternalStore requires referentially-stable snapshots between changes,
// so cache the parsed arrays and only replace them when a mutation bumps `rev`.
let rev = 0;
let cachedWorkouts: Workout[] | null = null;
let cachedTemplates: WorkoutTemplate[] | null = null;
let cachedPrefs: WorkoutPrefs | null = null;
let cachedCustom: CustomExercise[] | null = null;
let cachedRev = -1;
function refreshCache(): void {
  if (cachedRev === rev && cachedWorkouts && cachedTemplates && cachedPrefs && cachedCustom) return;
  cachedWorkouts = getWorkouts();
  cachedTemplates = getTemplates();
  cachedPrefs = getPrefs();
  cachedCustom = getAllExercises();   // built-ins ∪ user exercises (built-ins never stored)
  cachedRev = rev;
}
function getWorkoutsSnapshot(): Workout[] { refreshCache(); return cachedWorkouts!; }
function getTemplatesSnapshot(): WorkoutTemplate[] { refreshCache(); return cachedTemplates!; }
function getPrefsSnapshot(): WorkoutPrefs { refreshCache(); return cachedPrefs!; }
function getCustomSnapshot(): CustomExercise[] { refreshCache(); return cachedCustom!; }

// ── Undo (one-level) for destructive deletes ─────────────────────────────
// Snapshots the whole log before a delete; undoLast() restores it. Media
// blobs aren't touched by structural deletes (only SetVideo's Delete-clip
// removes a blob), so undoing a workout/set/exercise delete is always safe.
interface UndoSnap { workouts: Workout[]; templates: WorkoutTemplate[]; customExercises: CustomExercise[]; label: string; ts: number }
let undoSnapshot: UndoSnap | null = null;

export function captureUndo(label: string): void {
  undoSnapshot = { workouts: getWorkouts(), templates: getTemplates(), customExercises: getCustomExercises(), label, ts: Date.now() };
  rev++; emitChange();
}
export function undoLast(): void {
  if (!undoSnapshot) return;
  const s = undoSnapshot;
  undoSnapshot = null;
  rev++;
  lsSet(LOG_KEY, s.workouts);
  lsSet(TEMPLATES_KEY, s.templates);
  lsSet(CUSTOM_EX_KEY, s.customExercises);
  emitChange();
}
export function clearUndo(): void { if (undoSnapshot) { undoSnapshot = null; rev++; emitChange(); } }
function getUndoRaw(): UndoSnap | null { return undoSnapshot; }

/** Reactive current undo entry (or null). */
export function useUndo(): { label: string; ts: number } | null {
  const raw = useSyncExternalStore(subscribe, getUndoRaw);
  return raw ? { label: raw.label, ts: raw.ts } : null;
}
// A cross-device sync restore rewrites localStorage without going through our
// mutators, so bump rev on that path too, before subscribers re-read.
if (typeof window !== "undefined") {
  window.addEventListener("lt-folder-sync-loaded", () => { rev++; });
}

// ── Workout CRUD ─────────────────────────────────────────────────────────
export function upsertWorkout(w: Workout): void {
  const list = getWorkouts();
  const i = list.findIndex(x => x.id === w.id);
  if (i >= 0) list[i] = w; else list.push(w);
  list.sort((a, b) => b.startedAt - a.startedAt);
  rev++;
  writeWorkouts(list);
}
export function deleteWorkout(id: string): void {
  captureUndo("workout");
  rev++;
  writeWorkouts(getWorkouts().filter(w => w.id !== id));
}
export function getWorkout(id: string): Workout | undefined {
  return getWorkouts().find(w => w.id === id);
}
export function workoutsOnDate(date: string): Workout[] {
  return getWorkouts().filter(w => w.date === date);
}

/** Default title from the current day, e.g. "Saturday, Jul 25". */
function dayTitle(): string {
  return new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

/** Start a blank session (optionally from a template) and persist it. */
export function startWorkout(template?: WorkoutTemplate): Workout {
  const now = Date.now();
  const w: Workout = {
    id: uid("wk"),
    date: localToday(),
    startedAt: now,
    title: template?.name ?? dayTitle(),
    templateId: template?.id,
    exercises: (template?.exercises ?? []).map(te => templateExerciseToLogged(te)),
  };
  upsertWorkout(w);
  return w;
}

function templateExerciseToLogged(te: TemplateExercise): LoggedExercise {
  const n = Math.max(1, te.targetSets ?? 1);
  const sets: WorkoutSet[] = Array.from({ length: n }, () => ({
    id: uid("set"),
    reps: te.targetReps,
    holdSec: te.targetHoldSec,
    rpe: te.targetRpe,
    restSec: te.restSec,
  }));
  return { id: uid("ex"), skillId: te.skillId, name: te.name, mode: te.mode ?? defaultModeForSkill(te.skillId), sets };
}

export function makeExercise(name: string, mode: TrackingMode, skillId?: string): LoggedExercise {
  return { id: uid("ex"), skillId, name, mode, sets: [makeSet()] };
}
export function makeSet(prefill?: Partial<WorkoutSet>): WorkoutSet {
  return { id: uid("set"), restSec: getPrefs().defaultRestSec, ...prefill };
}

// ── Template CRUD ────────────────────────────────────────────────────────
export function saveTemplate(t: WorkoutTemplate): void {
  const list = getTemplates();
  const i = list.findIndex(x => x.id === t.id);
  if (i >= 0) list[i] = { ...t, updatedAt: Date.now() };
  else list.push({ ...t, createdAt: t.createdAt || Date.now(), updatedAt: Date.now() });
  rev++;
  writeTemplates(list);
}
export function deleteTemplate(id: string): void {
  captureUndo("template");
  rev++;
  writeTemplates(getTemplates().filter(t => t.id !== id));
}

/** Derive a reusable template from a completed/in-progress workout. */
export function templateFromWorkout(w: Workout, name: string): WorkoutTemplate {
  return {
    id: uid("tpl"),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    exercises: w.exercises.map(ex => {
      const first = ex.sets[0];
      return {
        skillId: ex.skillId,
        name: ex.name,
        mode: ex.mode,
        targetSets: ex.sets.length,
        targetReps: first?.reps,
        targetHoldSec: first?.holdSec,
        targetRpe: first?.rpe,
        restSec: first?.restSec,
      };
    }),
  };
}

// ── Derived stats for the history / charts view ──────────────────────────
export interface ExerciseHistoryPoint {
  date: string;
  bestRpe?: number;
  topWeight?: number;
  /** Lowest weight that day — for CW-assisted work this is the best set
   *  (least assistance), so progress is this trending toward 0. */
  minWeight?: number;
  totalReps: number;
  totalHoldSec: number;
  sets: number;
}

/** Per-date rollup for one exercise (matched by skillId when present, else name). */
export function exerciseHistory(match: { skillId?: string; name: string }): ExerciseHistoryPoint[] {
  const byDate = new Map<string, ExerciseHistoryPoint>();
  for (const w of getWorkouts()) {
    for (const ex of w.exercises) {
      const same = match.skillId ? ex.skillId === match.skillId : ex.name.toLowerCase() === match.name.toLowerCase();
      if (!same) continue;
      const p = byDate.get(w.date) ?? { date: w.date, totalReps: 0, totalHoldSec: 0, sets: 0 };
      for (const s of ex.sets) {
        p.sets++;
        p.totalReps += s.reps ?? 0;
        p.totalHoldSec += s.holdSec ?? 0;
        if (s.rpe != null) p.bestRpe = Math.max(p.bestRpe ?? 0, s.rpe);
        if (s.weight != null) {
          p.topWeight = Math.max(p.topWeight ?? -Infinity, s.weight);
          p.minWeight = Math.min(p.minWeight ?? Infinity, s.weight);
        }
      }
      byDate.set(w.date, p);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Whether an exercise is counterweight-assisted (progress = weight → 0). */
export function isCwAssisted(name: string): boolean {
  return /cw assisted/i.test(name);
}

/** Every video clip logged for one exercise, oldest → newest, for a form
 *  timeline (watch how form changed over time). */
export interface ExerciseClip { date: string; videoId?: string; driveFileId?: string; setId: string; workoutId: string }
export function exerciseClips(match: { skillId?: string; name: string }): ExerciseClip[] {
  const out: ExerciseClip[] = [];
  for (const w of getWorkouts()) {
    for (const ex of w.exercises) {
      const same = match.skillId ? ex.skillId === match.skillId : ex.name.toLowerCase() === match.name.toLowerCase();
      if (!same) continue;
      for (const s of ex.sets) {
        if (s.videoId || s.driveFileId) out.push({ date: w.date, videoId: s.videoId, driveFileId: s.driveFileId, setId: s.id, workoutId: w.id });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.workoutId.localeCompare(b.workoutId));
}

/** Every distinct exercise ever logged (for the history picker). */
export function loggedExerciseIndex(): { key: string; name: string; skillId?: string; count: number }[] {
  const map = new Map<string, { key: string; name: string; skillId?: string; count: number }>();
  for (const w of getWorkouts()) {
    for (const ex of w.exercises) {
      const key = ex.skillId ?? ex.name.toLowerCase();
      const cur = map.get(key) ?? { key, name: ex.name, skillId: ex.skillId, count: 0 };
      cur.count += ex.sets.length;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/** The most recent note the user wrote for this exercise in a PAST session —
 *  surfaced as a "keep in mind" reminder when the exercise is picked again.
 *  Scans newest-first (workouts are stored startedAt-desc) and returns the
 *  latest non-empty set note (falling back to an exercise-level note). */
export function lastNoteForExercise(
  match: { skillId?: string; name: string },
  excludeWorkoutId?: string,
): { note: string; date: string } | undefined {
  for (const w of getWorkouts()) {
    if (w.id === excludeWorkoutId) continue;
    for (const ex of w.exercises) {
      const same = match.skillId ? ex.skillId === match.skillId : ex.name.toLowerCase() === match.name.toLowerCase();
      if (!same) continue;
      for (let i = ex.sets.length - 1; i >= 0; i--) {
        const n = ex.sets[i].note?.trim();
        if (n) return { note: n, date: w.date };
      }
      const en = ex.note?.trim();
      if (en) return { note: en, date: w.date };
    }
  }
  return undefined;
}

/** Count of all videoIds currently referenced by the log (orphan pruning). */
export function referencedVideoIds(): Set<string> {
  const ids = new Set<string>();
  for (const w of getWorkouts())
    for (const ex of w.exercises)
      for (const s of ex.sets)
        if (s.videoId) ids.add(s.videoId);
  return ids;
}

export { CHANGE_EVENT as WORKOUT_CHANGE_EVENT };
