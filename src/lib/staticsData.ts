// ─────────────────────────────────────────────────────────────────────────
// Statics gamemode — master list of elite rings / straight-arm skills.
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

export interface StaticSkill {
  id: string;
  name: string;
  category: SkillCategory;
  rating?: string;
  tier?: "foundational" | "advanced" | "elite" | "super" | "ceiling";
  muscles: MuscleKey[];
  desc: string;
  /** The positions this element passes through, in order — "inverted hang →
   *  inverted cross → handstand".  A prose description says what a move is; this
   *  says what you actually have to hold on the way, which is what you train.
   *  Pure holds have a single entry (the shape itself); everything dynamic has
   *  two or more.  `via` marks a position that is passed THROUGH rather than
   *  stopped in, so a momentary lever isn't mistaken for a held one. */
  chain?: { pos: string; via?: boolean }[];
}

/** Shorthand: `p("inverted hang", "inverted cross!", "handstand")` — a trailing
 *  "!" marks a position that is only passed through, not held. */
const p = (...steps: string[]): { pos: string; via?: boolean }[] =>
  steps.map(s => s.endsWith("!") ? { pos: s.slice(0, -1), via: true } : { pos: s });

export const SKILLS: StaticSkill[] = [
  // ── Static holds ──────────────────────────────────────────────────────
  { id: "lsit", name: "L-sit", category: "static", tier: "foundational",
    muscles: ["hip_flexors", "quads", "abs", "triceps"],
    desc: "Legs held out horizontal while pressing down into support.",
    chain: p("L-sit") },
  { id: "back_lever", name: "Back Lever", category: "static", rating: "FIG B", tier: "foundational",
    muscles: ["lats", "biceps", "ant_delts", "pecs", "abs"],
    desc: "Horizontal hold facing up, suspended from the rings.",
    chain: p("back lever") },
  { id: "front_lever", name: "Front Lever", category: "static", tier: "foundational",
    muscles: ["lats", "teres", "rhomboids", "abs", "biceps"],
    desc: "Horizontal hold facing up in an undergrip, straight body.",
    chain: p("front lever") },
  { id: "planche", name: "Planche", category: "static", tier: "advanced",
    muscles: ["ant_delts", "pecs", "biceps", "serratus", "abs", "forearms"],
    desc: "Horizontal hold facing down, hands under the hips.",
    chain: p("planche") },
  { id: "iron_cross", name: "Iron Cross", category: "static", rating: "FIG B / BG 2", tier: "advanced",
    muscles: ["pecs", "lats", "teres", "biceps"],
    desc: "Arms straight out to the sides, body vertical.",
    chain: p("iron cross") },
  { id: "lv_cross", name: "L / V-Cross", category: "static", tier: "elite",
    muscles: ["pecs", "lats", "teres", "biceps", "abs", "hip_flexors"],
    desc: "Iron cross with the legs raised to an L or higher V.",
    chain: p("L-cross", "V-cross") },
  { id: "inv_cross", name: "Inverted Cross", category: "static", tier: "elite",
    muscles: ["ant_delts", "pecs", "traps", "biceps"],
    desc: "An upside-down iron cross, pressed and held above the rings.",
    chain: p("inverted cross") },
  { id: "maltese", name: "Maltese", category: "static", rating: "BG 5.1", tier: "super",
    muscles: ["pecs", "ant_delts", "biceps", "lats", "abs"],
    desc: "Horizontal at ring height, arms wide and low, facing down.",
    chain: p("maltese") },
  { id: "victorian", name: "Victorian Cross", category: "static", rating: "FIG E / BG 6.5", tier: "super",
    muscles: ["lats", "rear_delts", "teres", "rhomboids", "biceps", "glutes"],
    desc: "Horizontal facing up — an inverted maltese. The hardest static.",
    chain: p("Victorian cross") },
  { id: "reverse_planche", name: "Reverse Planche", category: "static", rating: "Near-impossible", tier: "ceiling",
    muscles: ["lats", "rear_delts", "erectors", "glutes", "triceps", "biceps"],
    desc: "Straight-arm horizontal hold facing up; posterior mirror of planche.",
    chain: p("reverse planche") },

  // ── Posterior straight-arm family (incl. cross entries) ───────────────
  { id: "fl_raise", name: "Front Lever Raise", category: "posterior", tier: "advanced",
    muscles: ["abs", "hip_flexors", "lats"],
    desc: "Raise from a dead/inverted hang up into the front lever position.",
    chain: p("inverted hang", "front lever") },
  { id: "fl_pull", name: "Front Lever Pull", category: "posterior", tier: "advanced",
    muscles: ["lats", "biceps", "abs"],
    desc: "Dynamic pull toward the bar while held horizontal.",
    chain: p("front lever", "front lever touch", "front lever") },
  { id: "fl_touch", name: "Front Lever Touch", category: "static", rating: "BG 2.4–3.9", tier: "advanced",
    muscles: ["lats", "abs", "biceps"],
    desc: "Front lever pulled all the way in and held — hips lifted to touch the rings.",
    chain: p("front lever", "front lever touch") },
  { id: "oa_fl", name: "One-Arm Front Lever", category: "static", rating: "Elite", tier: "elite",
    muscles: ["lats", "obliques", "abs", "forearms", "biceps"],
    desc: "A full front lever supported on a single arm.",
    chain: p("one-arm front lever") },
  { id: "hang_pull_bl", name: "Hang Pull to Back Lever", category: "posterior", tier: "foundational",
    muscles: ["lats", "biceps", "abs"],
    desc: "Pull from a hang up into the back lever.",
    chain: p("dead hang", "back lever") },
  { id: "iron_cross_pullout", name: "Iron Cross Pullouts", category: "posterior", tier: "advanced",
    muscles: ["pecs", "lats", "biceps"],
    desc: "Dynamic support → cross; the main strength driver for the cross.",
    chain: p("support", "iron cross") },
  { id: "cross_to_bl", name: "Cross to Back Lever", category: "posterior", tier: "advanced",
    muscles: ["pecs", "lats", "biceps"],
    desc: "Controlled straight-arm lower from cross into back lever.",
    chain: p("iron cross", "back lever") },
  { id: "support_hang_cross", name: "Support to Hang to Cross", category: "posterior", tier: "advanced",
    muscles: ["pecs", "lats", "biceps"],
    desc: "Controlled descent from support through hang into the cross.",
    chain: p("support", "dead hang", "iron cross") },
  { id: "azarian", name: "Azarian", category: "posterior", rating: "FIG D", tier: "advanced",
    muscles: ["biceps", "pecs", "lats"],
    desc: "Slow backward roll from a hang into the iron cross / L-cross.",
    chain: p("hang", "backward roll!", "iron cross") },
  { id: "nakayama", name: "Nakayama", category: "posterior", rating: "FIG E", tier: "elite",
    muscles: ["lats", "biceps", "pecs"],
    desc: "Back lever pressed up into the cross.",
    chain: p("back lever!", "iron cross") },
  { id: "pineda", name: "Pineda", category: "posterior", rating: "BG 4", tier: "elite",
    muscles: ["lats", "rear_delts", "biceps"],
    desc: "Straight-arm pull through a momentary front lever to the cross or L-cross. FIG rings EG II #40.",
    chain: p("hang", "front lever!", "L-cross") },
  { id: "caruso", name: "Caruso", category: "posterior", rating: "BG 7", tier: "super",
    muscles: ["lats", "rear_delts", "teres", "biceps", "glutes"],
    desc: "Straight-arm pull through a momentary front lever into the Victorian.",
    chain: p("front lever!", "Victorian cross") },
  { id: "zahran", name: "Zahran", category: "posterior", tier: "super",
    muscles: ["lats", "rear_delts", "biceps", "glutes"],
    desc: "Pull through a back lever and the cross — neither held — into the Victorian. FIG rings EG II #60.",
    chain: p("back lever!", "iron cross!", "Victorian cross") },
  { id: "tulloch1", name: "Tulloch 1", category: "posterior", rating: "FIG F", tier: "super",
    muscles: ["lats", "rear_delts", "teres", "rhomboids", "biceps", "glutes"],
    desc: "An Azarian slow backward roll carried past the cross into the Victorian. FIG rings EG II #120 (F).",
    chain: p("hang", "backward roll!", "Victorian cross") },
  { id: "rodrigues", name: "Rodrigues", category: "posterior", rating: "FIG F", tier: "ceiling",
    muscles: ["lats", "rear_delts", "teres", "rhomboids", "biceps", "glutes"],
    desc: "Forward uprise out of a swing straight into the Victorian — a swing-to-strength element, not a static pull. FIG rings EG III #60.",
    chain: p("swinging hang", "uprise forward!", "Victorian cross") },

  // ── Anterior straight-arm family ──────────────────────────────────────
  { id: "van_gelder", name: "Van Gelder", category: "anterior", rating: "FIG F", tier: "super",
    muscles: ["ant_delts", "pecs", "biceps", "abs"],
    desc: "Planche lowered through a back lever (no hold required) and pressed to maltese. FIG rings EG II #65.",
    chain: p("planche", "back lever!", "maltese") },
  { id: "balandin1", name: "Balandin 1", category: "anterior", rating: "FIG F", tier: "super",
    muscles: ["pecs", "ant_delts", "biceps"],
    desc: "Vertical (butterfly) pull to Maltese.",
    chain: p("hang", "maltese") },
  { id: "balandin2", name: "Balandin 2", category: "anterior", rating: "FIG G", tier: "ceiling",
    muscles: ["ant_delts", "pecs", "biceps", "traps"],
    desc: "Vertical (butterfly) pull to Inverted Cross. One of the hardest elements.",
    chain: p("hang", "inverted cross") },
  { id: "balandin3", name: "Balandin 3", category: "anterior", rating: "FIG E", tier: "super",
    muscles: ["ant_delts", "pecs", "biceps"],
    desc: "Vertical (butterfly) pull to Planche.",
    chain: p("hang", "planche") },
  { id: "cingolani", name: "Cingolani", category: "anterior", rating: "FIG F", tier: "super",
    muscles: ["ant_delts", "traps", "biceps", "pecs"],
    desc: "From hang, pull to support and press to handstand, straight body & arms.",
    chain: p("hang", "support!", "handstand") },
  { id: "butterfly", name: "Butterfly", category: "anterior", tier: "super",
    muscles: ["ant_delts", "pecs", "biceps"],
    desc: "Straight-arm vertical pull from a hang to the cross.",
    chain: p("hang", "iron cross") },
  { id: "inv_butterfly", name: "Inverted Butterfly", category: "anterior", rating: "FIG F/G", tier: "ceiling",
    muscles: ["ant_delts", "pecs", "biceps"],
    desc: "The anterior pull to inverted cross — hardest anterior pattern possible.",
    chain: p("inverted hang", "inverted cross", "handstand") },
  { id: "tulloch2", name: "Tulloch 2", category: "anterior", rating: "FIG F", tier: "ceiling",
    muscles: ["lats", "rear_delts", "teres", "pecs", "biceps", "glutes"],
    desc: "Straight-arm vertical pull from hang, through the cross, to the Victorian. FIG rings EG II #66 (G).",
    chain: p("hang", "iron cross!", "Victorian cross") },
  { id: "carmona", name: "Carmona", category: "anterior", rating: "FIG F", tier: "ceiling",
    muscles: ["pecs", "ant_delts", "biceps"],
    desc: "Pressed through a back lever, straight body, into the inverted cross. FIG rings EG II #90 (G).",
    chain: p("back lever!", "inverted cross") },
  { id: "zanetti", name: "Zanetti", category: "anterior", tier: "super",
    muscles: ["pecs", "ant_delts", "biceps"],
    desc: "Back lever pressed to maltese (the Code also allows ending in a support scale). FIG rings EG II #72 (F).",
    chain: p("back lever", "maltese") },
  { id: "jovtchev", name: "Jovtchev", category: "anterior", tier: "super",
    muscles: ["pecs", "ant_delts", "biceps"],
    desc: "Inverted cross lowered into Maltese.",
    chain: p("inverted cross", "maltese") },
  { id: "rsa_planche_hs", name: "RSA Planche → HS", category: "anterior", rating: "Elite", tier: "elite",
    muscles: ["ant_delts", "traps", "serratus", "biceps", "abs"],
    desc: "Ring straight-arm (full) planche pressed to handstand.",
    chain: p("planche", "handstand") },

  // ── Press / pushup / mount ────────────────────────────────────────────
  { id: "planche_pushup", name: "Ring Planche Pushup", category: "press", tier: "advanced",
    muscles: ["ant_delts", "pecs", "triceps", "biceps"],
    desc: "A pushup performed in the planche position, hands low.",
    chain: p("planche", "bottom of planche pushup", "planche") },
  { id: "maltese_pushup", name: "Ring Maltese Pushup", category: "press", tier: "super",
    muscles: ["pecs", "ant_delts", "triceps", "biceps"],
    desc: "Pressing in and out of the maltese.",
    chain: p("maltese", "bottom of maltese pushup", "maltese") },
  { id: "cross_pushup", name: "Ring Cross Pushup", category: "press", tier: "elite",
    muscles: ["pecs", "lats", "ant_delts", "biceps"],
    desc: "Pressing in and out of the iron cross.",
    chain: p("iron cross", "support", "iron cross") },
  { id: "pelican_pushup", name: "Ring Pelican Pushup", category: "press", tier: "advanced",
    muscles: ["pecs", "ant_delts", "biceps"],
    desc: "A deep ring pushup where the shoulders extend behind the body.",
    chain: p("support", "pelican bottom", "support") },
  { id: "pelican_planche_pushup", name: "Ring Pelican Planche Pushup", category: "press", tier: "super",
    muscles: ["pecs", "ant_delts", "biceps", "triceps", "abs"],
    desc: "A pelican pushup performed in the planche — deep shoulder extension with the body held horizontal.",
    chain: p("planche", "pelican planche bottom", "planche") },
  { id: "butterfly_mount", name: "Butterfly Mount", category: "press", tier: "elite",
    muscles: ["pecs", "ant_delts", "biceps"],
    desc: "A press-mount to support via a butterfly motion.",
    chain: p("hang", "support") },
  { id: "elevator", name: "Elevator", category: "press", tier: "elite",
    muscles: ["pecs", "lats", "ant_delts", "biceps"],
    desc: "Controlled straight-arm lowering from support/handstand through positions.",
    chain: p("handstand", "support", "dead hang") },
];

export const TIER_LABELS: Record<NonNullable<StaticSkill["tier"]>, string> = {
  foundational: "Foundational",
  advanced:     "Advanced",
  elite:        "Elite",
  super:        "Super-elite",
  ceiling:      "Ceiling",
};

export const TIER_COLORS: Record<NonNullable<StaticSkill["tier"]>, string> = {
  foundational: "#3b8f5a",
  advanced:     "#c98a2b",
  elite:        "#c85a3c",
  super:        "#a8434e",
  ceiling:      "#7173e6",
};
