import type { TrackingMode } from "./workoutTypes";

// ─────────────────────────────────────────────────────────────────────────
// Starter exercise list, seeded once into the user's saved exercises.
//
// A variant is one point on TWO axes, and its stored name encodes both so the
// picker can read them back out (see ExercisePicker.classify):
//
//     "<Surface> <Skill> — <Assistance> assisted"
//     "Ring Planche — CW assisted"      "Parallettes Handstand — Halver assisted"
//     "Handstand"                       (ground, unassisted — no prefix, no suffix)
//
//   SURFACE      Ring · Parallettes · Static Bar · none (hands on the ground)
//   ASSISTANCE   CW (overhead counterweight) · Halver (2:1 waist pulley) ·
//                Bungee (cord taking tension off the hold) · none
//
// Assisted variants track the assistance as load, so holds → weight_time and
// dynamic movements → weight_reps; unassisted variants track time / reps.
//
// Which assistance a skill gets is per-skill, not per-surface, so each skill
// carries its own list. A counterweight pulls you up out of a hang, which suits
// levers, crosses and planches. The Halver and a bungee cord both hold you INTO
// an inverted balance, which is what handstands need — so handstand holds take
// those two and not CW, and they take BOTH because a cord and a 2:1 pulley are
// different tools with their own feel and their own progression, not two names
// for one thing.
//
// The plain variant is emitted from the skill row itself rather than alongside
// each assistance, because a skill has ONE unassisted version however many ways
// there are to assist it. Listing assistances in parallel arrays (an earlier
// shape here) emitted it once per array, and since a built-in's id is derived
// from its name that produced two identical rows in the picker with the same id.
//
// Seeded once (guarded by a flag), then fully user-editable/deletable — a
// deleted seed exercise does NOT respawn.  Renaming or dropping a name here
// means adding the old one to RETIRED_BUILTIN_NAMES in workoutStore.ts, or
// stored copies from older builds come back as phantom "user exercises".
// ─────────────────────────────────────────────────────────────────────────

export interface SeedExercise { name: string; mode: TrackingMode }

/** Assistance kinds, as they appear in a stored name. */
export type AssistKind = "cw" | "halver" | "bungee";
export const ASSIST_SUFFIX: Record<AssistKind, string> = {
  cw: "— CW assisted",
  halver: "— Halver assisted",
  bungee: "— Bungee assisted",
};

/** [skill, isDynamic, assistances].  isDynamic true = reps, false = timed hold.
 *  An empty assistance list means the skill is trained unassisted only. */
type Entry = [skill: string, dyn: boolean, assists: AssistKind[]];

const CW: AssistKind[] = ["cw"];
/** Inverted balances: both ways of holding you up, neither of them a hang. */
const INVERTED: AssistKind[] = ["halver", "bungee"];

const RING: Entry[] = [
  ["Victorian Cross", false, CW],
  ["Caruso", true, CW],
  ["Reverse Planche", false, CW],
  ["Planche", false, CW],
  ["Planche Pushup", true, CW],
  ["Pelican Planche Pushup", true, CW],
  ["Front Lever", false, CW],
  ["Front Lever Pullup", true, CW],
  ["Iron Cross", false, CW],
  ["Handstand", false, INVERTED],
  ["Handstand Pushup", true, CW],
];

const STATIC_BAR: Entry[] = [
  ["Front Lever", false, CW],
  ["Front Lever Pullup", true, CW],
  ["SAT", true, CW],
  ["Front Lever Touch", false, CW],
  ["Planche", false, CW],
  ["Planche Pushup", true, CW],
];

const PARALLETTES: Entry[] = [
  ["Reverse Planche", false, CW],
  ["Planche", false, CW],
  ["Planche Pushup", true, CW],
  ["Handstand", false, INVERTED],
  ["One Arm Handstand", false, INVERTED],
  // No counterweight rig on parallettes, and neither a 2:1 nor a cord helps a
  // press — so this one is unassisted only.
  ["Handstand Pushup", true, []],
];

// Floor work — "Hands on ground" in the picker.
const FLOOR: Entry[] = [
  ["Handstand", false, INVERTED],
  ["One Arm Handstand", false, INVERTED],
  ["Handstand Pushup", true, CW],
];

/** One skill → its unassisted variant plus one per assistance kind. */
function expand(prefix: string, entries: Entry[]): SeedExercise[] {
  const out: SeedExercise[] = [];
  for (const [skill, dyn, assists] of entries) {
    const base = prefix ? `${prefix} ${skill}` : skill;
    out.push({ name: base, mode: dyn ? "reps" : "time" });
    for (const a of assists) {
      out.push({ name: `${base} ${ASSIST_SUFFIX[a]}`, mode: dyn ? "weight_reps" : "weight_time" });
    }
  }
  return out;
}

export const SEED_EXERCISES: SeedExercise[] = [
  ...expand("Ring", RING),
  ...expand("Static Bar", STATIC_BAR),
  ...expand("Parallettes", PARALLETTES),
  ...expand("", FLOOR),
];

// A duplicated name means two built-ins with the same derived id, which renders
// as two identical picker rows. Cheap to assert, and it has gone wrong before.
if (import.meta.env.DEV) {
  const seen = new Set<string>();
  for (const s of SEED_EXERCISES) {
    const k = s.name.toLowerCase();
    if (seen.has(k)) console.error(`workoutSeed: duplicate exercise name "${s.name}"`);
    seen.add(k);
  }
}
