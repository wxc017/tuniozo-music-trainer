// ─────────────────────────────────────────────────────────────────────────
// Weekly training volume by muscle group.
//
// Every logged exercise is resolved to the specific muscles it trains — first
// by its catalog skillId, then by matching its name against the calisthenics
// SKILLS list, then (for anything free-text) by a rigorous keyword table that
// covers common movements. Volume is reported the way lifters actually track
// it: WORKING SETS per muscle per week, with total reps and hold-seconds as
// supporting detail. A set counts toward every muscle the movement trains.
// ─────────────────────────────────────────────────────────────────────────

import { SKILLS, MUSCLE_META, type MuscleKey } from "./calisthenicsData";
import { getWorkouts, getCustomExercises } from "./workoutStore";
import { type MuscleGroup, GROUP_LABEL, GROUP_ORDER } from "./muscleGroups";
import type { WorkoutSet } from "./workoutTypes";

export { type MuscleGroup, GROUP_LABEL, GROUP_ORDER };

// Each fine MuscleKey maps to one coarse group for the weekly readout.
const MUSCLE_TO_GROUP: Record<MuscleKey, MuscleGroup> = {
  pecs: "chest", serratus: "chest",
  lats: "back", traps: "back", rhomboids: "back", teres: "back", erectors: "back",
  ant_delts: "shoulders", rear_delts: "shoulders",
  biceps: "biceps", triceps: "triceps", forearms: "forearms",
  abs: "core", obliques: "core", hip_flexors: "core",
  quads: "legs", glutes: "legs",
};

// ── Exercise → muscles resolver ──────────────────────────────────────────
//
// RIGOR: we count only PRIME MOVERS and major synergists that actually take
// meaningful load — NOT incidental stabilizers. So planche does NOT count as
// forearm/grip volume, and body-line holds (levers, crosses) do NOT count as
// glute volume. Grip/forearms are credited only to genuine grip work (hangs,
// pulls, holds); glutes/erectors only to real hip/leg/posterior-chain work.
// The catalog's SKILLS.muscles list is deliberately NOT used here — it includes
// stabilizers that inflate the volume readout.

const norm = (s: string) => s
  .toLowerCase()
  .replace(/[—–-]\s*cw\s*assisted\s*$/i, "")
  .replace(/\bcw\s*assisted\b/gi, "")
  .replace(/^(rings?|parallettes?|static bar|floor)\s+/i, "")
  .replace(/[^a-z0-9 ]+/gi, " ")
  .replace(/\s+/g, " ")
  .trim();

export interface ExMuscles { primary: MuscleKey[]; secondary: MuscleKey[] }

// Curated map for the app's catalog/seed skills (normalized names).
//   primary   = prime movers taking the most load (real training stimulus)
//   secondary = hard-working synergists + significant stabilizers
// This is where the stabilizers live: grip/forearms on ring holds, core &
// serratus on planche, the posterior chain holding a lever's line, etc.
const CURATED: Record<string, ExMuscles> = {
  "planche":                { primary: ["ant_delts", "pecs", "biceps"], secondary: ["serratus", "abs", "forearms"] },
  "planche pushup":         { primary: ["ant_delts", "pecs", "triceps"], secondary: ["biceps", "serratus", "abs"] },
  "reverse planche":        { primary: ["rear_delts", "lats", "triceps"], secondary: ["erectors", "glutes"] },
  "victorian cross":        { primary: ["lats", "rear_delts", "biceps"], secondary: ["teres", "rhomboids"] },
  "front lever":            { primary: ["lats", "biceps"], secondary: ["teres", "rhomboids", "abs", "rear_delts"] },
  "front lever pullup":     { primary: ["lats", "biceps"], secondary: ["rhomboids", "abs", "teres"] },
  "front lever raise":      { primary: ["lats", "abs"], secondary: ["biceps", "rhomboids"] },
  "front lever touch":      { primary: ["lats", "biceps"], secondary: ["abs", "teres", "rhomboids"] },
  "sat":                    { primary: ["lats", "biceps"], secondary: ["abs", "teres"] },
  "iron cross":             { primary: ["pecs", "lats", "biceps"], secondary: ["teres", "rear_delts"] },
  "maltese":                { primary: ["pecs", "ant_delts", "biceps"], secondary: ["serratus", "abs"] },
  "pelican planche pushup": { primary: ["pecs", "ant_delts", "biceps"], secondary: ["triceps", "abs"] },
  "pelican pushup":         { primary: ["pecs", "ant_delts", "biceps"], secondary: ["triceps"] },
  "back lever":             { primary: ["lats", "biceps", "pecs"], secondary: ["abs", "ant_delts"] },
  "handstand":              { primary: ["ant_delts", "traps"], secondary: ["abs", "forearms"] },
  "one arm handstand":      { primary: ["ant_delts", "traps"], secondary: ["abs", "obliques", "forearms"] },
  "handstand pushup":       { primary: ["ant_delts", "triceps"], secondary: ["traps", "serratus", "pecs"] },
  "l sit":                  { primary: ["hip_flexors", "abs"], secondary: ["quads", "triceps"] },
  "lsit":                   { primary: ["hip_flexors", "abs"], secondary: ["quads", "triceps"] },
};

// Keyword fallback for anything free-text — first match wins, specific first.
// These are prime movers (secondary left empty); grip/forearms and
// glutes/erectors appear only where the movement truly trains them.
const KEYWORD_MUSCLES: [RegExp, MuscleKey[]][] = [
  // straight-arm skills (in case of naming variants)
  [/reverse planche/, ["lats", "rear_delts", "erectors", "triceps"]],
  [/planche pushup|planche push up/, ["ant_delts", "pecs", "triceps", "biceps"]],
  [/planche/, ["ant_delts", "pecs", "biceps", "serratus", "abs"]],
  [/front lever (pull|raise|row)/, ["lats", "biceps", "abs", "rhomboids"]],
  [/front lever/, ["lats", "teres", "rhomboids", "abs", "biceps"]],
  [/back lever/, ["lats", "biceps", "pecs", "abs"]],
  [/victorian/, ["lats", "rear_delts", "teres", "rhomboids", "biceps"]],
  [/maltese/, ["pecs", "ant_delts", "biceps"]],
  [/(iron |inverted )cross|^cross|\bcross\b/, ["pecs", "lats", "teres", "biceps"]],
  [/butterfly/, ["ant_delts", "pecs", "biceps"]],
  [/l ?sit|l-sit/, ["hip_flexors", "abs", "quads"]],
  [/human flag|flag/, ["obliques", "lats", "abs"]],
  // handstand / overhead press
  [/handstand pushup|hspu|hand stand push/, ["ant_delts", "triceps", "traps"]],
  [/handstand|hand stand/, ["ant_delts", "traps", "abs"]],
  [/overhead press|ohp|shoulder press|pike push/, ["ant_delts", "triceps", "traps"]],
  [/lateral raise|side raise/, ["ant_delts"]],
  [/rear delt|reverse fly|face pull/, ["rear_delts", "rhomboids"]],
  // push
  [/dip/, ["pecs", "triceps", "ant_delts"]],
  [/(bench|chest) press|chest fly|pec deck/, ["pecs", "ant_delts", "triceps"]],
  [/push ?up|push-up|press/, ["pecs", "ant_delts", "triceps"]],
  // pulls (grip is real here → forearms)
  [/muscle ?up/, ["lats", "biceps", "pecs", "triceps", "forearms"]],
  [/pull ?up|chin ?up|chinup|pullup/, ["lats", "biceps", "rhomboids", "forearms"]],
  [/row|inverted row/, ["lats", "rhomboids", "rear_delts", "biceps"]],
  [/lat pulldown|pulldown/, ["lats", "biceps", "teres"]],
  [/dead ?hang|\bhang\b|grip|farmer|wrist roller/, ["forearms"]],
  // arms
  [/hammer curl|bicep curl|\bcurl\b/, ["biceps"]],
  [/tricep|skull ?crusher|pushdown|kickback|tricep extension/, ["triceps"]],
  [/wrist curl|forearm|reverse curl/, ["forearms"]],
  [/shrug/, ["traps"]],
  // core
  [/leg raise|knee raise|toes to bar/, ["abs", "hip_flexors"]],
  [/hollow|dragon flag|v ?up|sit ?up|crunch|ab wheel|plank|hanging/, ["abs"]],
  [/oblique|russian twist|side bend|windshield/, ["obliques", "abs"]],
  [/back extension|hyperextension|superman|good ?morning/, ["erectors", "glutes"]],
  // legs / posterior chain (glutes/erectors credited here)
  [/pistol|squat|lunge|step ?up|wall sit/, ["quads", "glutes"]],
  [/hip thrust|glute bridge|bridge/, ["glutes"]],
  [/hamstring|nordic|leg curl|romanian|rdl|deadlift|hinge/, ["glutes", "erectors"]],
];

/** The muscles a logged exercise trains, split into primary / secondary. Empty
 *  arrays if nothing matches (so it's excluded from volume, not guessed). */
export function musclesForExercise(name: string, skillId?: string): ExMuscles {
  const n = norm(name);
  if (CURATED[n]) return CURATED[n];
  for (const [re, muscles] of KEYWORD_MUSCLES) if (re.test(n)) return { primary: muscles, secondary: [] };
  // Last resort: a catalog skill by id (rarely set on logged exercises).
  if (skillId) {
    const sk = SKILLS.find(s => s.id === skillId);
    if (sk) return { primary: sk.muscles, secondary: [] };
  }
  return { primary: [], secondary: [] };
}

// ── Weekly aggregation ────────────────────────────────────────────────────

/** ISO-ish local date key YYYY-MM-DD for a Date. */
function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Monday-start week containing `ref` (offset in weeks). Returns inclusive
 *  YYYY-MM-DD bounds + a friendly label. */
export function weekRange(offset = 0, ref = new Date()): { start: string; end: string; label: string } {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() - dow + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (x: Date) => x.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return { start: dateKey(monday), end: dateKey(sunday), label: `${fmt(monday)} – ${fmt(sunday)}` };
}

export interface GroupVolume {
  group: MuscleGroup;
  primarySets: number;   // sets where this group is a prime mover
  secondarySets: number; // sets where this group is only a synergist/stabilizer
  topExercises: { name: string; sets: number }[];
}

function countsSet(s: WorkoutSet): boolean {
  // A set "counts" if it carries any logged work (or was ticked done).
  return !!(s.done || s.reps || s.holdSec || s.weight != null || s.rpe != null);
}

const uniqGroups = (ms: MuscleKey[]): MuscleGroup[] => [...new Set(ms.map(m => MUSCLE_TO_GROUP[m]))];

/** Aggregate volume per muscle GROUP for workouts whose date is in [start,end],
 *  split into primary and secondary sets. A set counts once per group: primary
 *  if the group is a prime mover for that movement, otherwise secondary. */
export function weeklyVolume(start: string, end: string): {
  groups: GroupVolume[];
  totalPrimary: number;
  totalSecondary: number;
  workouts: number;
} {
  const acc = new Map<MuscleGroup, { primary: number; secondary: number; byEx: Map<string, number> }>();
  let totalPrimary = 0;
  let totalSecondary = 0;
  let workouts = 0;

  // User-assigned muscle tags on custom exercises take priority (counted as
  // primary — the user is telling us what it trains).
  const tagByName = new Map<string, MuscleGroup[]>();
  for (const c of getCustomExercises()) if (c.muscleGroups?.length) tagByName.set(c.name.toLowerCase(), c.muscleGroups);

  const bump = (g: MuscleGroup, kind: "primary" | "secondary", exName: string) => {
    const a = acc.get(g) ?? { primary: 0, secondary: 0, byEx: new Map() };
    a[kind]++;
    a.byEx.set(exName, (a.byEx.get(exName) ?? 0) + 1);
    acc.set(g, a);
    if (kind === "primary") totalPrimary++; else totalSecondary++;
  };

  for (const w of getWorkouts()) {
    if (w.date < start || w.date > end) continue;
    let touched = false;
    for (const ex of w.exercises) {
      const tagged = tagByName.get(ex.name.toLowerCase());
      let primaryGroups: MuscleGroup[];
      let secondaryGroups: MuscleGroup[];
      if (tagged) {
        primaryGroups = [...new Set(tagged)];
        secondaryGroups = [];
      } else {
        const m = musclesForExercise(ex.name, ex.skillId);
        if (!m.primary.length && !m.secondary.length) continue;
        primaryGroups = uniqGroups(m.primary);
        const pg = new Set(primaryGroups);
        secondaryGroups = uniqGroups(m.secondary).filter(g => !pg.has(g)); // a group is primary if it's a prime mover anywhere in the movement
      }
      for (const s of ex.sets) {
        if (!countsSet(s)) continue;
        touched = true;
        for (const g of primaryGroups) bump(g, "primary", ex.name);
        for (const g of secondaryGroups) bump(g, "secondary", ex.name);
      }
    }
    if (touched) workouts++;
  }

  const groups: GroupVolume[] = GROUP_ORDER
    .filter(g => acc.has(g))
    .map(g => {
      const a = acc.get(g)!;
      const topExercises = [...a.byEx.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([name, sets]) => ({ name, sets }));
      return { group: g, primarySets: a.primary, secondarySets: a.secondary, topExercises };
    })
    .sort((x, y) => (y.primarySets - x.primarySets) || (y.secondarySets - x.secondarySets));

  return { groups, totalPrimary, totalSecondary, workouts };
}

export { MUSCLE_META };
