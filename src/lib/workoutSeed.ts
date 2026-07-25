import type { TrackingMode } from "./workoutTypes";

// ─────────────────────────────────────────────────────────────────────────
// Starter exercise list, seeded once into the user's saved exercises.
//
// Naming: "<Equipment> <Skill> — CW assisted" (counterweight-assisted) and a
// plain "<Equipment> <Skill>". CW-assisted variants track the counterweight,
// so holds → weight_time and dynamic movements → weight_reps; plain variants
// track time / reps.
//
// Seeded once (guarded by a flag), then fully user-editable/deletable — a
// deleted seed exercise does NOT respawn.
// ─────────────────────────────────────────────────────────────────────────

export interface SeedExercise { name: string; mode: TrackingMode }

// [skill, isDynamic] — isDynamic true = tracked by reps, false = static hold (time)
type Item = [string, boolean];

const RING: Item[] = [
  ["Victorian Cross", false],
  ["Reverse Planche", false],
  ["Planche", false],
  ["Planche Pushup", true],
  ["Pelican Planche Pushup", true],
  ["Front Lever", false],
  ["Front Lever Pullup", true],
  ["Iron Cross", false],
  ["Handstand", false],
  ["Handstand Pushup", true],
];

const STATIC_BAR: Item[] = [
  ["Front Lever", false],
  ["Front Lever Pullup", true],
  ["SAT", true],
  ["Front Lever Touch", false],
  ["Planche", false],
  ["Planche Pushup", true],
];

const PARALLETTES: Item[] = [
  ["Planche", false],
  ["Planche Pushup", true],
];

// Floor handstands. Handstand + One-Arm Handstand are plain-only; Handstand
// Pushup gets a CW-assisted variant too.
const HANDSTAND_PLAIN: Item[] = [
  ["Handstand", false],
  ["One Arm Handstand", false],
];
const HANDSTAND_PAIRED: Item[] = [
  ["Handstand Pushup", true],
];

function variants(prefix: string, skill: string, dyn: boolean): SeedExercise[] {
  const base = prefix ? `${prefix} ${skill}` : skill;
  return [
    { name: `${base} — CW assisted`, mode: dyn ? "weight_reps" : "weight_time" },
    { name: base, mode: dyn ? "reps" : "time" },
  ];
}
function pairs(prefix: string, items: Item[]): SeedExercise[] {
  return items.flatMap(([s, d]) => variants(prefix, s, d));
}
function plainOnly(items: Item[]): SeedExercise[] {
  return items.map(([s, d]) => ({ name: s, mode: (d ? "reps" : "time") as TrackingMode }));
}

export const SEED_EXERCISES: SeedExercise[] = [
  ...pairs("Ring", RING),
  ...pairs("Static Bar", STATIC_BAR),
  ...pairs("Parallettes", PARALLETTES),
  ...plainOnly(HANDSTAND_PLAIN),
  ...pairs("", HANDSTAND_PAIRED),
];
