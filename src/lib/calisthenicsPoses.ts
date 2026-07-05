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
      shoulderL: [0, 0, 10], shoulderR: [0, 0, -10],
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
      shoulderL: [0, 0, 4], shoulderR: [0, 0, -4],
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
      shoulderL: [0, 0, 6], shoulderR: [0, 0, -6],
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

  // ── Planche (face-DOWN horizontal, hands under) ───────────────────────
  planche: {
    root: { rotation: [90, 0, 0] },
    joints: {
      shoulderL: [20, 0, 8], shoulderR: [20, 0, -8],
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

  // ── Maltese (face-DOWN horizontal, arms wide & low) ───────────────────
  maltese: {
    root: { rotation: [90, 0, 0] },
    joints: {
      shoulderL: [10, 0, -55], shoulderR: [10, 0, 55],
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
  if (n.includes("victorian") || n.includes("reverse planche")) return POSES.front_lever;
  if (n.includes("cross") || n.includes("butterfly") || n.includes("balandin"))
    return POSES.iron_cross;
  if (category === "static") return POSES.iron_cross;
  return DEFAULT_POSE;
}

// ── Transitions / animated skills ──────────────────────────────────────────
// Categories whose skills are movements between positions rather than holds.
const DYNAMIC_CATS = new Set(["posterior", "anterior", "press", "cross_prog"]);

// The end (and sometimes start) position a named transition resolves into.
const END_ARCHETYPE: Record<string, keyof typeof POSES> = {
  azarian: "iron_cross", nakayama: "iron_cross", pineda: "iron_cross",
  caruso: "front_lever", baruso: "front_lever", zahran: "front_lever",
  van_gelder: "maltese", zanetti: "maltese", jovtchev: "maltese",
  cingolani: "iron_cross", butterfly: "iron_cross", inv_butterfly: "iron_cross",
  carmona: "maltese", butterfly_mount: "iron_cross",
  pelican_pushup: "planche", planche_pushup: "planche", maltese_pushup: "maltese",
  cross_pushup: "iron_cross", elevator: "iron_cross",
  iron_cross_pullout: "iron_cross", support_hang_cross: "iron_cross",
  hang_pull_bl: "back_lever", cross_to_bl: "back_lever",
  fl_raise: "front_lever", fl_pull: "front_lever", fl_touch: "front_lever",
  oa_fl: "front_lever", rsa_planche_hs: "planche",
};

/**
 * Returns an ordered list of keyframe poses for a transition skill, or null
 * for a static hold. The viewer plays frames start→end→start on a loop and
 * interpolates joint angles between them.
 */
export function getAnimation(id: string, name: string, category: string): Pose[] | null {
  if (!DYNAMIC_CATS.has(category)) return null;

  // Movements that pass *through* a static into another static.
  if (id === "cross_to_bl") return [POSES.iron_cross, POSES.back_lever];

  const endKey = END_ARCHETYPE[id]
    ?? (getPose(id, name, category) === DEFAULT_POSE ? "iron_cross" : undefined);
  const end = endKey ? POSES[endKey] : getPose(id, name, category);

  // Default: press/pull from a support start into the end hold, and back.
  return [DEFAULT_POSE, end];
}
