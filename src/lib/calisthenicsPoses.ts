// ─────────────────────────────────────────────────────────────────────────
// 3D pose definitions for the calisthenics skill viewer.
//
// A pose is a set of joint rotations (Euler XYZ, DEGREES here — converted to
// radians by the viewer) applied to a shared articulated humanoid, plus the
// grip type / ring gap and text coaching cues.
//
// Axis convention (matches the viewer):
//   +X right, +Y up, +Z toward the camera. The default figure stands upright
//   facing +Z with arms hanging down (all joint rotations 0).
//
// `tuned: true`  → angles I'm confident read correctly.
// `tuned: false` → structurally in the right archetype but exact angles want a
//                   visual pass in the dev server. Surfaced as "approx" in the UI.
// ─────────────────────────────────────────────────────────────────────────

export type Vec3 = [number, number, number];

export interface JointAngles {
  spine?: Vec3;   chest?: Vec3;   neck?: Vec3;
  shoulderL?: Vec3; elbowL?: Vec3;
  shoulderR?: Vec3; elbowR?: Vec3;
  hipL?: Vec3;    kneeL?: Vec3;
  hipR?: Vec3;    kneeR?: Vec3;
}

export interface Pose {
  root:  { position?: Vec3; rotation?: Vec3 };
  joints: JointAngles;
  grip:  "rings" | "bar" | "floor" | "none";
  ringGap?: number;          // half the distance between the two rings (metres)
  cue:   { scapula: string; grip: string; line: string };
  tuned?: boolean;
}

// A relaxed support hold — the fallback for anything not explicitly posed.
export const DEFAULT_POSE: Pose = {
  root: { position: [0, 0, 0], rotation: [0, 0, 0] },
  joints: {
    shoulderL: [0, 0, 8], shoulderR: [0, 0, -8],
    hipL: [0, 0, 2], hipR: [0, 0, -2],
  },
  grip: "rings",
  ringGap: 0.26,
  cue: {
    scapula: "Depress and slightly protract — push the rings down and away, shoulders away from ears.",
    grip: "Rings turned out (thumbs rotating outward), stacked directly under the shoulders.",
    line: "Hollow body, ribs down, glutes and quads squeezed to lock a straight line.",
  },
  tuned: false,
};

const POSES: Record<string, Pose> = {
  // ── L-sit ────────────────────────────────────────────────────────────
  lsit: {
    root: { rotation: [0, 0, 0] },
    joints: {
      shoulderL: [0, 0, -8], shoulderR: [0, 0, 8],   // arms straight down at ring width, beside the hips
      hipL: [-90, 0, 0], hipR: [-90, 0, 0],   // legs forward, horizontal
    },
    grip: "rings",
    ringGap: 0.24,
    cue: {
      scapula: "Strong depression — actively press the rings/floor down to lift the hips clear.",
      grip: "Rings pressed down at the hips, arms locked straight, turned slightly out.",
      line: "Legs straight and parallel to the floor, toes pointed, deep hip-flexor compression.",
    },
    tuned: true,
  },

  // ── Back lever (face-DOWN horizontal) ─────────────────────────────────
  back_lever: {
    root: { rotation: [90, 0, 0] },
    joints: {
      shoulderL: [90, 0, 4], shoulderR: [90, 0, -4],  // straight arms reach up to the rings
    },
    grip: "rings",
    ringGap: 0.24,
    cue: {
      scapula: "Retract + depress hard; arms fight to stay straight against the shoulder extension.",
      grip: "Supinated (underhand) grip, rings behind the hips, straps angled back.",
      line: "Body horizontal facing the floor, straight line head-to-toe, no sagging hips.",
    },
    tuned: false,
  },

  // ── Front lever (face-UP horizontal) ──────────────────────────────────
  front_lever: {
    root: { rotation: [-90, 0, 0] },
    joints: {
      shoulderL: [-90, 0, 4], shoulderR: [-90, 0, -4],  // straight arms reach up to the rings
    },
    grip: "rings",
    ringGap: 0.26,
    cue: {
      scapula: "Depress + slightly retract; drive straight arms down toward the hips (lat-driven).",
      grip: "Overhand grip overhead, rings above the shoulders, straps vertical.",
      line: "Horizontal facing up, hollow body, pull the wrists toward the feet to hold the line.",
    },
    tuned: false,
  },

  // ── Planche (face-DOWN horizontal, hands under → rings BELOW body) ─────
  planche: {
    root: { rotation: [90, 0, 0] },
    joints: {
      shoulderL: [-90, 0, 8], shoulderR: [-90, 0, -8],  // straight arms press DOWN to rings under the body
    },
    grip: "rings",
    ringGap: 0.22,
    cue: {
      scapula: "Maximal protraction + depression — lean forward until shoulders pass the hands.",
      grip: "Rings turned strongly out, hands under the hips, deep forward lean over the rings.",
      line: "Horizontal facing down, posterior pelvic tilt, no arch — straight rigid line.",
    },
    tuned: false,
  },

  // ── Iron cross (upright, arms straight out) ───────────────────────────
  iron_cross: {
    root: { rotation: [0, 0, 0] },
    joints: {
      shoulderL: [0, 0, -90], shoulderR: [0, 0, 90],  // arms straight out to the sides
    },
    grip: "rings",
    ringGap: 0.62,
    cue: {
      scapula: "Depress and set; resist the rings pulling up — lats and pecs hold the adduction.",
      grip: "Rings turned out, arms locked straight and level at shoulder height.",
      line: "Body vertical and hollow, arms in a straight horizontal line through the shoulders.",
    },
    tuned: true,
  },

  // ── Inverted cross (UPSIDE-DOWN iron cross: head down, feet up) ───────
  inv_cross: {
    root: { rotation: [180, 0, 0] },
    joints: {
      shoulderL: [0, 0, -90], shoulderR: [0, 0, 90],   // arms straight out to the sides
    },
    grip: "rings",
    ringGap: 0.62,
    cue: {
      scapula: "Press hard through the shoulders — support the whole body above the rings, inverted.",
      grip: "Rings turned out, arms locked straight and level; you push down into them, upside-down.",
      line: "Body vertical but inverted — head down, hips and legs stacked straight above.",
    },
    tuned: false,
  },

  // ── Maltese (face-DOWN horizontal, arms wide & low) ───────────────────
  maltese: {
    root: { rotation: [90, 0, 0] },
    joints: {
      shoulderL: [0, 0, -90], shoulderR: [0, 0, 90],   // arms straight out to the sides, at body height
    },
    grip: "rings",
    ringGap: 0.5,
    cue: {
      scapula: "Extreme protraction + depression, arms driven wide and down behind the body.",
      grip: "Rings wide, low and turned out; body hovers at ring height, facing down.",
      line: "Fully horizontal, straight and rigid — the definitive planche-to-cross crossover.",
    },
    tuned: false,
  },

  // ── Victorian (inverted maltese: face-UP, arms wide & low) ────────────
  victorian: {
    root: { rotation: [-90, 0, 0] },
    joints: {
      shoulderL: [0, 0, -90], shoulderR: [0, 0, 90],   // arms straight out to the sides (inverted maltese)
    },
    grip: "rings",
    ringGap: 0.5,
    cue: {
      scapula: "Massive retraction + depression; straight arms driven wide and behind against the rings.",
      grip: "Rings wide and low, turned out; the body hovers face-up at ring height.",
      line: "Fully horizontal facing up — a straight, rigid inverted maltese. The hardest static.",
    },
    tuned: false,
  },

  // ── Reverse planche (face-UP, straight arms pressing 90° straight down) ─
  reverse_planche: {
    root: { rotation: [-90, 0, 0] },
    joints: {
      shoulderL: [90, 0, 0], shoulderR: [90, 0, 0],    // arms 90° straight down to rings below
    },
    grip: "rings",
    ringGap: 0.24,
    cue: {
      scapula: "Deep shoulder extension — press the rings down and back, hands driving toward the hips.",
      grip: "Straight arms pressing down beside the hips; the body holds ABOVE the rings, facing up.",
      line: "Horizontal facing up, posterior mirror of the planche — no sag, straight rigid line.",
    },
    tuned: false,
  },

  // ── Manna (pike compression, legs overhead) ───────────────────────────
  manna: {
    root: { rotation: [-20, 0, 0] },
    joints: {
      shoulderL: [0, 0, 12], shoulderR: [0, 0, -12],
      hipL: [-150, 0, 0], hipR: [-150, 0, 0],   // deep pike, legs up and over
    },
    grip: "rings",
    ringGap: 0.24,
    cue: {
      scapula: "Depress hard and press down; huge anterior compression drives the legs up.",
      grip: "Hands press down beside the hips, arms straight, wrists loaded in extension.",
      line: "Deep pike — legs raised past vertical over the head, chest stays lifted.",
    },
    tuned: false,
  },

  // ── L / V-Cross (iron cross with legs raised to an L) ─────────────────
  lv_cross: {
    root: { rotation: [0, 0, 0] },
    joints: {
      shoulderL: [0, 0, -90], shoulderR: [0, 0, 90],   // iron-cross arms
      hipL: [-90, 0, 0], hipR: [-90, 0, 0],             // legs raised forward to an L
    },
    grip: "rings",
    ringGap: 0.62,
    cue: {
      scapula: "Hold the cross adduction while compressing the hip flexors to raise the legs.",
      grip: "Rings turned out, arms locked straight and level; legs shot forward to horizontal.",
      line: "Iron cross holding an L-sit — arms out to the sides, legs forward at hip height.",
    },
    tuned: false,
  },

  // ── Dynamic START positions (used as the first keyframe of transitions) ─
  // Dead hang: vertical, hanging below the rings, straight arms overhead.
  dead_hang: {
    root: { rotation: [0, 0, 0] },
    joints: { shoulderL: [180, 0, 4], shoulderR: [180, 0, -4] },
    grip: "rings", ringGap: 0.26,
    cue: { scapula: "Active shoulders, lats engaged.", grip: "Straight arms overhead on the rings.", line: "Body vertical, hanging straight down." },
    tuned: false,
  },
  // Inverted hang: upside-down, feet up, straight arms reaching to the rings.
  inverted_hang: {
    root: { rotation: [180, 0, 0] },
    joints: { shoulderL: [0, 0, 4], shoulderR: [0, 0, -4] },
    grip: "rings", ringGap: 0.26,
    cue: { scapula: "Shoulders open, ribs down.", grip: "Straight arms reaching to the rings.", line: "Inverted and vertical — head down, feet stacked overhead." },
    tuned: false,
  },
  // Support hold: upright above the rings, straight arms pressed down.
  support: {
    root: { rotation: [0, 0, 0] },
    joints: { shoulderL: [0, 0, -8], shoulderR: [0, 0, 8] },
    grip: "rings", ringGap: 0.26,
    cue: { scapula: "Depress and push the rings down; shoulders away from the ears.", grip: "Rings turned out, stacked under the shoulders.", line: "Upright support above the rings, hollow body." },
    tuned: false,
  },
  // Handstand: inverted, straight body stacked over straight supporting arms.
  handstand: {
    root: { rotation: [180, 0, 0] },
    joints: { shoulderL: [0, 0, -4], shoulderR: [0, 0, 4] },
    grip: "rings", ringGap: 0.26,
    cue: { scapula: "Elevate and stack — push tall through straight arms.", grip: "Straight arms pressing down; rings turned in for balance.", line: "Inverted straight line, feet stacked over the shoulders and hands." },
    tuned: false,
  },

  // Front-lever TOUCH: pulled all the way in and HELD — bent arms row the
  // rings to the chest, hips lifted to touch, body still horizontal & face up.
  fl_touch: {
    root: { rotation: [-90, 0, 0] },
    joints: {
      shoulderL: [-90, 0, 4], shoulderR: [-90, 0, -4],
      elbowL: [95, 0, 0], elbowR: [95, 0, 0],   // arms bent, rings pulled to the body
      hipL: [-22, 0, 0], hipR: [-22, 0, 0],      // hips lifted toward the rings ("touch")
    },
    grip: "rings", ringGap: 0.26,
    cue: {
      scapula: "Pull the rings to the chest and hold — deep retraction, elbows driving down/back.",
      grip: "Rings pulled in to the ribs, hips lifted to the rings, body kept horizontal.",
      line: "A maximally pulled-in, held front lever — hips to the rings, chest up.",
    },
    tuned: false,
  },
};

/**
 * Resolve a skill id to a single static pose. Falls back to the nearest
 * archetype inferred from the skill name/category so every skill shows
 * something sensible.
 */
export function getPose(id: string, name: string, category: string): Pose {
  if (POSES[id]) return POSES[id];

  const n = name.toLowerCase();
  if (n.includes("l-sit") || n.includes("l sit")) return POSES.lsit;
  if (n.includes("manna")) return POSES.manna;
  if (n.includes("maltese") || n.includes("swallow")) return POSES.maltese;
  if (n.includes("planche")) return POSES.planche;
  if (n.includes("front lever")) return POSES.front_lever;
  if (n.includes("back lever")) return POSES.back_lever;
  if (n.includes("reverse planche")) return POSES.reverse_planche;
  if (n.includes("victorian") || n.includes("tulloch") || n.includes("rodrigues")) return POSES.victorian;
  if (n.includes("cross") || n.includes("butterfly") || n.includes("balandin"))
    return POSES.iron_cross;
  if (category === "static") return POSES.iron_cross;
  return DEFAULT_POSE;
}

// ── Transitions / animated skills ──────────────────────────────────────────
// Categories whose skills are movements between positions rather than holds.
const DYNAMIC_CATS = new Set(["posterior", "anterior", "press", "cross_prog"]);

// Each transition's START and END static position (researched from the FIG /
// calisthenics element definitions), so movements that end in the same hold
// still animate through distinct paths.
const END_ARCHETYPE: Record<string, keyof typeof POSES> = {
  // Cross entries
  azarian: "iron_cross", nakayama: "iron_cross", pineda: "iron_cross",
  iron_cross_pullout: "iron_cross", support_hang_cross: "iron_cross",
  butterfly: "iron_cross", butterfly_mount: "support", cross_pushup: "iron_cross",
  elevator: "support", inv_butterfly: "inv_cross",
  // Victorian entries (same end, different starts)
  caruso: "victorian", zahran: "victorian",
  tulloch1: "victorian", tulloch2: "victorian", rodrigues: "victorian",
  // Maltese / planche / handstand family
  van_gelder: "maltese", zanetti: "maltese", jovtchev: "maltese", carmona: "maltese",
  maltese_pushup: "maltese", balandin1: "maltese", balandin3: "planche",
  balandin2: "inv_cross", cingolani: "handstand", rsa_planche_hs: "handstand",
  pelican_pushup: "planche", pelican_planche_pushup: "planche", planche_pushup: "planche",
  // Lever family
  hang_pull_bl: "back_lever", cross_to_bl: "back_lever",
  fl_raise: "front_lever", fl_pull: "fl_touch",   // rows between straight and pulled-in
};

const START_ARCHETYPE: Record<string, keyof typeof POSES> = {
  // Front-lever dynamics
  fl_raise: "dead_hang", fl_pull: "front_lever",   // rows in the front-lever position
  // Cross entries
  azarian: "inverted_hang", nakayama: "back_lever", pineda: "dead_hang",
  iron_cross_pullout: "support", support_hang_cross: "support",
  butterfly: "dead_hang", inv_butterfly: "inverted_hang",
  cross_pushup: "support", butterfly_mount: "dead_hang", elevator: "handstand",
  // Victorian entries
  caruso: "front_lever", zahran: "back_lever",
  tulloch1: "inverted_hang", tulloch2: "dead_hang", rodrigues: "support",
  // Maltese / planche / handstand
  van_gelder: "planche", zanetti: "back_lever", jovtchev: "inv_cross",
  carmona: "inverted_hang", maltese_pushup: "support",
  balandin1: "dead_hang", balandin2: "dead_hang", balandin3: "dead_hang",
  cingolani: "dead_hang", rsa_planche_hs: "planche",
  pelican_pushup: "support", pelican_planche_pushup: "support", planche_pushup: "support",
  hang_pull_bl: "dead_hang", cross_to_bl: "iron_cross",
};

/**
 * Returns an ordered list of keyframe poses for a transition skill, or null
 * for a static hold. The viewer plays frames start→end→start on a loop and
 * interpolates joint angles between them.
 */
export function getAnimation(id: string, name: string, category: string): Pose[] | null {
  if (!DYNAMIC_CATS.has(category)) return null;

  const endKey = END_ARCHETYPE[id]
    ?? (getPose(id, name, category) === DEFAULT_POSE ? "iron_cross" : undefined);
  const end = endKey ? POSES[endKey] : getPose(id, name, category);

  const startKey = START_ARCHETYPE[id];
  const start = startKey ? POSES[startKey] : DEFAULT_POSE;

  return [start, end];
}
