// ─────────────────────────────────────────────────────────────────────────
// Calisthenics gamemode — master list of elite rings / straight-arm skills.
// Each skill maps to muscle-group keys; each muscle maps to the anatomy
// package's muscle regions (react-body-highlighter) for the graphic.
// Ratings from the FIG Code of Points and the Burningate (calisthenics) code.
// ─────────────────────────────────────────────────────────────────────────

import type { Muscle as BodyMuscle } from "react-body-highlighter";

export type MuscleKey =
  | "ant_delts" | "rear_delts" | "pecs" | "biceps" | "triceps"
  | "forearms" | "lats" | "traps" | "rhomboids" | "teres"
  | "serratus" | "abs" | "obliques" | "erectors"
  | "hip_flexors" | "quads" | "glutes";

// label = anatomical name, simple = everyday name, pkg = region(s) highlighted
// on the react-body-highlighter model (its vocabulary is coarser than ours).
export const MUSCLE_META: Record<MuscleKey, { label: string; simple: string; pkg: BodyMuscle[] }> = {
  ant_delts:   { label: "Anterior Deltoids", simple: "Shoulders (front)", pkg: ["front-deltoids"] },
  rear_delts:  { label: "Rear Deltoids",     simple: "Shoulders (rear)",  pkg: ["back-deltoids"] },
  pecs:        { label: "Pectorals",         simple: "Chest",             pkg: ["chest"] },
  biceps:      { label: "Biceps / Tendon",   simple: "Biceps",            pkg: ["biceps"] },
  triceps:     { label: "Triceps",           simple: "Triceps",           pkg: ["triceps"] },
  forearms:    { label: "Forearms",          simple: "Forearms / grip",   pkg: ["forearm"] },
  lats:        { label: "Latissimus Dorsi",  simple: "Back (lats)",       pkg: ["upper-back"] },
  traps:       { label: "Trapezius",         simple: "Traps",             pkg: ["trapezius"] },
  rhomboids:   { label: "Rhomboids",         simple: "Upper back",        pkg: ["upper-back"] },
  teres:       { label: "Teres Major",       simple: "Back (armpit)",     pkg: ["upper-back"] },
  serratus:    { label: "Serratus Anterior", simple: "Ribcage (side)",    pkg: ["obliques"] },
  abs:         { label: "Rectus Abdominis",  simple: "Core / abs",        pkg: ["abs"] },
  obliques:    { label: "Obliques",          simple: "Sides",             pkg: ["obliques"] },
  erectors:    { label: "Spinal Erectors",   simple: "Lower back",        pkg: ["lower-back"] },
  hip_flexors: { label: "Hip Flexors",       simple: "Hips (front)",      pkg: ["quadriceps"] },
  quads:       { label: "Quadriceps",        simple: "Thighs (front)",    pkg: ["quadriceps"] },
  glutes:      { label: "Gluteals",          simple: "Glutes",            pkg: ["gluteal"] },
};

export const ALL_MUSCLES: MuscleKey[] = Object.keys(MUSCLE_META) as MuscleKey[];

export type SkillCategory = "static" | "posterior" | "anterior" | "press";

export const CATEGORY_LABELS: Record<SkillCategory, string> = {
  static:    "Static Holds",
  posterior: "Posterior Straight-Arm",
  anterior:  "Anterior Straight-Arm",
  press:     "Press / Pushup / Mount",
};

export const CATEGORY_ORDER: SkillCategory[] = ["static", "posterior", "anterior", "press"];

export interface CaliSkill {
  id: string;
  name: string;
  category: SkillCategory;
  rating?: string;
  tier?: "foundational" | "advanced" | "elite" | "super" | "ceiling";
  muscles: MuscleKey[];
  desc: string;
}

export const SKILLS: CaliSkill[] = [
  // ── Static holds ──────────────────────────────────────────────────────
  { id: "lsit", name: "L-sit", category: "static", tier: "foundational",
    muscles: ["hip_flexors", "quads", "abs", "triceps"],
    desc: "Legs held out horizontal while pressing down into support." },
  { id: "back_lever", name: "Back Lever", category: "static", rating: "FIG B", tier: "foundational",
    muscles: ["lats", "biceps", "ant_delts", "pecs", "abs"],
    desc: "Horizontal hold facing up, suspended from the rings." },
  { id: "front_lever", name: "Front Lever", category: "static", tier: "foundational",
    muscles: ["lats", "teres", "rhomboids", "abs", "biceps"],
    desc: "Horizontal hold facing up in an undergrip, straight body." },
  { id: "planche", name: "Planche", category: "static", tier: "advanced",
    muscles: ["ant_delts", "pecs", "biceps", "serratus", "abs", "forearms"],
    desc: "Horizontal hold facing down, hands under the hips." },
  { id: "iron_cross", name: "Iron Cross", category: "static", rating: "FIG B / BG 2", tier: "advanced",
    muscles: ["pecs", "lats", "teres", "biceps"],
    desc: "Arms straight out to the sides, body vertical." },
  { id: "lv_cross", name: "L / V-Cross", category: "static", tier: "elite",
    muscles: ["pecs", "lats", "teres", "biceps", "abs", "hip_flexors"],
    desc: "Iron cross with the legs raised to an L or higher V." },
  { id: "inv_cross", name: "Inverted Cross", category: "static", tier: "elite",
    muscles: ["ant_delts", "pecs", "traps", "biceps"],
    desc: "An upside-down iron cross, pressed and held above the rings." },
  { id: "maltese", name: "Maltese", category: "static", rating: "BG 5.1", tier: "super",
    muscles: ["pecs", "ant_delts", "biceps", "lats", "abs"],
    desc: "Horizontal at ring height, arms wide and low, facing down." },
  { id: "victorian", name: "Victorian Cross", category: "static", rating: "FIG E / BG 6.5", tier: "super",
    muscles: ["lats", "rear_delts", "teres", "rhomboids", "biceps", "glutes"],
    desc: "Horizontal facing up — an inverted maltese. The hardest static." },
  { id: "reverse_planche", name: "Reverse Planche", category: "static", rating: "Near-impossible", tier: "ceiling",
    muscles: ["lats", "rear_delts", "erectors", "glutes", "triceps", "biceps"],
    desc: "Straight-arm horizontal hold facing up; posterior mirror of planche." },

  // ── Posterior straight-arm family (incl. cross entries) ───────────────
  { id: "fl_raise", name: "Front Lever Raise", category: "posterior", tier: "advanced",
    muscles: ["abs", "hip_flexors", "lats"],
    desc: "Raise from a dead/inverted hang up into the front lever position." },
  { id: "fl_pull", name: "Front Lever Pull", category: "posterior", tier: "advanced",
    muscles: ["lats", "biceps", "abs"],
    desc: "Dynamic pull toward the bar while held horizontal." },
  { id: "fl_touch", name: "Front Lever Touch", category: "static", rating: "BG 2.4–3.9", tier: "advanced",
    muscles: ["lats", "abs", "biceps"],
    desc: "Front lever pulled all the way in and held — hips lifted to touch the rings." },
  { id: "oa_fl", name: "One-Arm Front Lever", category: "static", rating: "Elite", tier: "elite",
    muscles: ["lats", "obliques", "abs", "forearms", "biceps"],
    desc: "A full front lever supported on a single arm." },
  { id: "hang_pull_bl", name: "Hang Pull to Back Lever", category: "posterior", tier: "foundational",
    muscles: ["lats", "biceps", "abs"],
    desc: "Pull from a hang up into the back lever." },
  { id: "iron_cross_pullout", name: "Iron Cross Pullouts", category: "posterior", tier: "advanced",
    muscles: ["pecs", "lats", "biceps"],
    desc: "Dynamic support → cross; the main strength driver for the cross." },
  { id: "cross_to_bl", name: "Cross to Back Lever", category: "posterior", tier: "advanced",
    muscles: ["pecs", "lats", "biceps"],
    desc: "Controlled straight-arm lower from cross into back lever." },
  { id: "support_hang_cross", name: "Support to Hang to Cross", category: "posterior", tier: "advanced",
    muscles: ["pecs", "lats", "biceps"],
    desc: "Controlled descent from support through hang into the cross." },
  { id: "azarian", name: "Azarian", category: "posterior", rating: "FIG D", tier: "advanced",
    muscles: ["biceps", "pecs", "lats"],
    desc: "Slow backward roll from a hang into the iron cross / L-cross." },
  { id: "nakayama", name: "Nakayama", category: "posterior", rating: "FIG E", tier: "elite",
    muscles: ["lats", "biceps", "pecs"],
    desc: "Back lever pressed up into the cross." },
  { id: "pineda", name: "Pineda", category: "posterior", rating: "BG 4", tier: "elite",
    muscles: ["lats", "rear_delts", "biceps"],
    desc: "Front lever pulled through into a cross L-sit." },
  { id: "caruso", name: "Caruso", category: "posterior", rating: "BG 7", tier: "super",
    muscles: ["lats", "rear_delts", "teres", "biceps", "glutes"],
    desc: "Straight-arm pull through a momentary front lever into the Victorian." },
  { id: "zahran", name: "Zahran", category: "posterior", tier: "super",
    muscles: ["lats", "rear_delts", "biceps", "glutes"],
    desc: "Back lever pressed into the Victorian." },
  { id: "tulloch1", name: "Tulloch 1", category: "posterior", rating: "FIG F", tier: "super",
    muscles: ["lats", "rear_delts", "teres", "rhomboids", "biceps", "glutes"],
    desc: "Straight-arm pull into the Victorian cross — the first of Courtney Tulloch's two Victorian entries." },
  { id: "rodrigues", name: "Rodrigues", category: "posterior", rating: "FIG F", tier: "ceiling",
    muscles: ["lats", "rear_delts", "teres", "rhomboids", "biceps", "glutes"],
    desc: "Straight-arm transition into the Victorian cross, named after Danny Pinheiro Rodrigues." },

  // ── Anterior straight-arm family ──────────────────────────────────────
  { id: "van_gelder", name: "Van Gelder", category: "anterior", rating: "FIG F", tier: "super",
    muscles: ["ant_delts", "pecs", "biceps", "abs"],
    desc: "Transitions among planche, back lever and maltese." },
  { id: "balandin1", name: "Balandin 1", category: "anterior", rating: "FIG F", tier: "super",
    muscles: ["pecs", "ant_delts", "biceps"],
    desc: "Vertical (butterfly) pull to Maltese." },
  { id: "balandin2", name: "Balandin 2", category: "anterior", rating: "FIG G", tier: "ceiling",
    muscles: ["ant_delts", "pecs", "biceps", "traps"],
    desc: "Vertical (butterfly) pull to Inverted Cross. One of the hardest elements." },
  { id: "balandin3", name: "Balandin 3", category: "anterior", rating: "FIG E", tier: "super",
    muscles: ["ant_delts", "pecs", "biceps"],
    desc: "Vertical (butterfly) pull to Planche." },
  { id: "cingolani", name: "Cingolani", category: "anterior", rating: "FIG F", tier: "super",
    muscles: ["ant_delts", "traps", "biceps", "pecs"],
    desc: "From hang, pull to support and press to handstand, straight body & arms." },
  { id: "butterfly", name: "Butterfly", category: "anterior", tier: "super",
    muscles: ["ant_delts", "pecs", "biceps"],
    desc: "From inverted hang, straight-arm pull to inverted cross." },
  { id: "inv_butterfly", name: "Inverted Butterfly", category: "anterior", rating: "FIG F/G", tier: "ceiling",
    muscles: ["ant_delts", "pecs", "biceps"],
    desc: "The anterior pull to inverted cross — hardest anterior pattern possible." },
  { id: "tulloch2", name: "Tulloch 2", category: "anterior", rating: "FIG F", tier: "ceiling",
    muscles: ["lats", "rear_delts", "teres", "pecs", "biceps", "glutes"],
    desc: "Butterfly — straight-arm vertical pull — pressed into the Victorian cross." },
  { id: "carmona", name: "Carmona", category: "anterior", rating: "FIG F", tier: "ceiling",
    muscles: ["pecs", "ant_delts", "biceps"],
    desc: "The ultimate anterior strength movement, via maltese / inverted cross." },
  { id: "zanetti", name: "Zanetti", category: "anterior", tier: "super",
    muscles: ["pecs", "ant_delts", "biceps"],
    desc: "Back lever pulled into Maltese." },
  { id: "jovtchev", name: "Jovtchev", category: "anterior", tier: "super",
    muscles: ["pecs", "ant_delts", "biceps"],
    desc: "Inverted cross lowered into Maltese." },
  { id: "rsa_planche_hs", name: "RSA Planche → HS", category: "anterior", rating: "Elite", tier: "elite",
    muscles: ["ant_delts", "traps", "serratus", "biceps", "abs"],
    desc: "Ring straight-arm (full) planche pressed to handstand." },

  // ── Press / pushup / mount ────────────────────────────────────────────
  { id: "planche_pushup", name: "Ring Planche Pushup", category: "press", tier: "advanced",
    muscles: ["ant_delts", "pecs", "triceps", "biceps"],
    desc: "A pushup performed in the planche position, hands low." },
  { id: "maltese_pushup", name: "Ring Maltese Pushup", category: "press", tier: "super",
    muscles: ["pecs", "ant_delts", "triceps", "biceps"],
    desc: "Pressing in and out of the maltese." },
  { id: "cross_pushup", name: "Ring Cross Pushup", category: "press", tier: "elite",
    muscles: ["pecs", "lats", "ant_delts", "biceps"],
    desc: "Pressing in and out of the iron cross." },
  { id: "pelican_pushup", name: "Ring Pelican Pushup", category: "press", tier: "advanced",
    muscles: ["pecs", "ant_delts", "biceps"],
    desc: "A deep ring pushup where the shoulders extend behind the body." },
  { id: "pelican_planche_pushup", name: "Ring Pelican Planche Pushup", category: "press", tier: "super",
    muscles: ["pecs", "ant_delts", "biceps", "triceps", "abs"],
    desc: "A pelican pushup performed in the planche — deep shoulder extension with the body held horizontal." },
  { id: "butterfly_mount", name: "Butterfly Mount", category: "press", tier: "elite",
    muscles: ["pecs", "ant_delts", "biceps"],
    desc: "A press-mount to support via a butterfly motion." },
  { id: "elevator", name: "Elevator", category: "press", tier: "elite",
    muscles: ["pecs", "lats", "ant_delts", "biceps"],
    desc: "Controlled straight-arm lowering from support/handstand through positions." },
];

export const TIER_LABELS: Record<NonNullable<CaliSkill["tier"]>, string> = {
  foundational: "Foundational",
  advanced:     "Advanced",
  elite:        "Elite",
  super:        "Super-elite",
  ceiling:      "Ceiling",
};

export const TIER_COLORS: Record<NonNullable<CaliSkill["tier"]>, string> = {
  foundational: "#3b8f5a",
  advanced:     "#c98a2b",
  elite:        "#c85a3c",
  super:        "#a8434e",
  ceiling:      "#7173e6",
};
