// ─────────────────────────────────────────────────────────────────────────
// Rendered positions for the Statics mode.
//
// Each skill's `chain` lists the positions it passes through; those strings are
// what the UI shows, and each one maps to a Blender render in /public/statics.
// The renders are produced by scripts/statics-render (a parametric MakeHuman
// gymnast posed from authored joint directions, on FIG-dimensioned rings), so
// a position is drawn once and reused by every skill that passes through it —
// 27 renders cover all 44 skills.
// ─────────────────────────────────────────────────────────────────────────

/** Position keys that have a render. */
export type PositionKey =
  | "iron_cross" | "inverted_cross" | "l_cross" | "v_cross"
  | "planche" | "maltese" | "reverse_planche" | "victorian_cross"
  | "front_lever" | "back_lever" | "front_lever_touch" | "one_arm_front_lever"
  | "manna" | "dead_hang" | "inverted_hang" | "support" | "handstand"
  | "swinging_hang" | "backward_roll" | "uprise_forward"
  | "planche_pushup_bottom" | "maltese_pushup_bottom"
  | "pelican_bottom" | "pelican_planche_bottom"
  | "l_sit" | "v_sit" | "tuck_hang";

/** Chain position label (lower-cased) → render key. */
const BY_LABEL: Record<string, PositionKey> = {
  "l-sit": "l_sit",
  "v-sit": "v_sit",
  "back lever": "back_lever",
  "front lever": "front_lever",
  "front lever touch": "front_lever_touch",
  "one-arm front lever": "one_arm_front_lever",
  "planche": "planche",
  "reverse planche": "reverse_planche",
  "iron cross": "iron_cross",
  "l-cross": "l_cross",
  "v-cross": "v_cross",
  "inverted cross": "inverted_cross",
  "maltese": "maltese",
  "victorian cross": "victorian_cross",
  "manna": "manna",
  "hang": "dead_hang",
  "dead hang": "dead_hang",
  "swinging hang": "swinging_hang",
  "inverted hang": "inverted_hang",
  "tuck hang": "tuck_hang",
  "support": "support",
  "handstand": "handstand",
  "backward roll": "backward_roll",
  "uprise forward": "uprise_forward",
  "bottom of planche pushup": "planche_pushup_bottom",
  "bottom of maltese pushup": "maltese_pushup_bottom",
  "pelican bottom": "pelican_bottom",
  "pelican planche bottom": "pelican_planche_bottom",
};

/** Short coaching note per position — what the shape has to look like. */
export const POSITION_NOTE: Partial<Record<PositionKey, string>> = {
  iron_cross:     "Body vertical, straight arms level with the shoulders, rings turned out.",
  inverted_cross: "The cross upside down and held above the rings — head down, hips stacked over the shoulders.",
  l_cross:        "Cross adduction held while the hip flexors carry both legs to horizontal.",
  v_cross:        "As the L-cross but the legs are carried ~45° above horizontal.",
  planche:        "Horizontal facing down, hands under the hips, shoulders driven well in front of the hands.",
  maltese:        "Horizontal at ring height facing down, arms straight and spread wide to the sides.",
  reverse_planche:"Horizontal facing up above the rings, straight arms pressing down and back past the hips.",
  victorian_cross:"Horizontal facing up at ring height with the arms wide — an inverted maltese.",
  front_lever:    "Horizontal facing up below the rings, straight arms roughly square to the torso.",
  back_lever:     "Horizontal facing down, straight arms, shoulders in extension with the rings behind the hips.",
  front_lever_touch: "A front lever rowed all the way in and held — bent elbows are correct here.",
  one_arm_front_lever: "A full front lever on one arm; the torso rotates slightly toward the supporting side.",
  manna:          "Deep pike in support, straight arms pressing down beside the hips, legs past vertical.",
  dead_hang:      "Vertical below the rings, straight arms overhead, active shoulders.",
  inverted_hang:  "Inverted and vertical, feet stacked overhead, rings at about hip height.",
  support:        "Upright above the rings, straight arms pressed down, shoulders depressed.",
  handstand:      "Inverted straight line, feet stacked over the shoulders and hands.",
  swinging_hang:  "The front end of a swing — hanging straight-armed, body angled forward off vertical.",
  backward_roll:  "Rolling backward through inverted and piked, straight arms taking the load.",
  uprise_forward: "Passing through horizontal facing down on a forward swing, arms pulling.",
  planche_pushup_bottom: "The planche with the elbows flexed — chest lowered toward the rings.",
  maltese_pushup_bottom: "The maltese with the arms bent, chest lowered between the wide rings.",
  pelican_bottom: "Deepest shoulder extension of any position — straight arms swept far behind the torso.",
  pelican_planche_bottom: "A pelican bottom held at planche height, straight arms swept back.",
  l_sit:          "Straight arms pressing down beside the hips, legs straight and horizontal.",
  v_sit:          "As the L-sit but the straight legs are carried well above horizontal.",
  tuck_hang:      "Hanging from straight arms with the knees pulled tight to the chest.",
};


/** Form cues per position. `protraction` (−1 retracted … +1 protracted),
 *  `depression` (−1 elevated … +1 depressed) and `gripRotation` (degrees,
 *  positive = supinated / "rings turned out") are the same numbers that drive
 *  the shoulder girdle and forearm in the renders, so the text and the picture
 *  cannot drift apart. */
export const POSITION_CUES: Record<PositionKey, {
  scapula: string; grip: string;
  protraction: number; depression: number; gripRotation: number;
}> = {
  iron_cross: {
    scapula: "Depress and set; slight retraction holds the adduction",
    grip: "Rings turned out, arms locked level",
    protraction: -0.15, depression: 0.90, gripRotation: 35,
  },
  inverted_cross: {
    scapula: "Upward rotation and elevation \u2014 press tall, inverted",
    grip: "Arms rotated through 180\u00b0 \u2014 wrists rest ON TOP of the rings",
    protraction: 0.10, depression: -0.65, gripRotation: 180,
  },
  l_cross: {
    scapula: "Cross depression held while the hips compress",
    grip: "Rings turned out, arms level",
    protraction: -0.15, depression: 0.90, gripRotation: 35,
  },
  v_cross: {
    scapula: "Cross depression held through a deeper compression",
    grip: "Rings turned out, arms level",
    protraction: -0.15, depression: 0.90, gripRotation: 35,
  },
  planche: {
    scapula: "MAXIMAL protraction + depression, with posterior pelvic tilt \u2014 no arch anywhere in the line",
    grip: "Supinated \u2014 biceps turned out, wrists gripping over the rings",
    protraction: 1.00, depression: 0.85, gripRotation: 90,
  },
  maltese: {
    scapula: "Extreme protraction + depression, arms driven wide",
    grip: "Rings wide, low and turned strongly out",
    protraction: 0.85, depression: 0.95, gripRotation: 75,
  },
  reverse_planche: {
    scapula: "Retraction with deep shoulder extension",
    grip: "Rings rotated 90\u00b0, pressing down and back past the hips",
    protraction: -0.60, depression: 0.70, gripRotation: 90,
  },
  victorian_cross: {
    scapula: "MAXIMAL retraction + depression \u2014 the defining cue",
    grip: "Rings rotated 90\u00b0, the body resting on them face up",
    protraction: -0.95, depression: 0.90, gripRotation: 90,
  },
  front_lever: {
    scapula: "Depression + slight retraction; lat-driven",
    grip: "Undergrip (supinated), rings above the shoulders",
    protraction: -0.35, depression: 0.90, gripRotation: 40,
  },
  back_lever: {
    scapula: "Retraction + depression against shoulder extension",
    grip: "Supinated grip, rings behind the hips",
    protraction: -0.50, depression: 0.80, gripRotation: 50,
  },
  front_lever_touch: {
    scapula: "Deep retraction \u2014 the rings are rowed to the ribs",
    grip: "Rings pulled in to the body, elbows down and back",
    protraction: -0.85, depression: 0.70, gripRotation: 30,
  },
  one_arm_front_lever: {
    scapula: "Depression + retraction on the supporting side",
    grip: "Single supinated grip, free arm tucked in",
    protraction: -0.40, depression: 0.90, gripRotation: 25,
  },
  manna: {
    scapula: "Maximal depression; huge anterior compression",
    grip: "Pronated, wrists loaded in extension beside the hips",
    protraction: 0.30, depression: 1.00, gripRotation: -40,
  },
  dead_hang: {
    scapula: "Active but not maximally depressed shoulders",
    grip: "Neutral grip, straight arms overhead",
    protraction: -0.10, depression: -0.30, gripRotation: 0,
  },
  inverted_hang: {
    scapula: "Neutral girdle, ribs down",
    grip: "Near-neutral grip, rings at hip height",
    protraction: 0.00, depression: 0.00, gripRotation: 5,
  },
  support: {
    scapula: "Strong depression \u2014 push the rings down and away",
    grip: "Rings turned out, stacked under the shoulders",
    protraction: 0.20, depression: 1.00, gripRotation: 30,
  },
  handstand: {
    scapula: "Elevation and upward rotation \u2014 stack and push tall",
    grip: "Rings turned slightly in for balance",
    protraction: 0.05, depression: -0.90, gripRotation: 12,
  },
  swinging_hang: {
    scapula: "Shoulders open, girdle relaxed into the swing",
    grip: "Neutral grip, straight arms overhead",
    protraction: -0.10, depression: -0.20, gripRotation: 0,
  },
  backward_roll: {
    scapula: "Retracting as the roll loads the shoulders",
    grip: "Grip rotating out through the roll",
    protraction: -0.30, depression: 0.35, gripRotation: 20,
  },
  uprise_forward: {
    scapula: "Retraction as the pull begins",
    grip: "Grip turning out as the body rises",
    protraction: -0.40, depression: 0.50, gripRotation: 12,
  },
  planche_pushup_bottom: {
    scapula: "Protraction reduces as the chest lowers",
    grip: "Rings turned out, elbows tracking back",
    protraction: 0.55, depression: 0.55, gripRotation: 85,
  },
  maltese_pushup_bottom: {
    scapula: "Protraction reduces at the bottom of the press",
    grip: "Rings wide and turned out",
    protraction: 0.50, depression: 0.65, gripRotation: 46,
  },
  pelican_bottom: {
    scapula: "Retraction into the deepest shoulder extension here",
    grip: "Rings turned strongly out, arms swept far behind",
    protraction: -0.70, depression: 0.45, gripRotation: 55,
  },
  pelican_planche_bottom: {
    scapula: "Retraction under deep extension at planche height",
    grip: "Rings turned out, arms swept behind the torso",
    protraction: -0.45, depression: 0.55, gripRotation: 80,
  },
  l_sit: {
    scapula: "Strong depression \u2014 press down to lift the hips clear",
    grip: "Rings turned out, pressed down at the hips",
    protraction: 0.20, depression: 1.00, gripRotation: 25,
  },
  v_sit: {
    scapula: "Strong depression through a deeper compression",
    grip: "Rings turned out, pressed down at the hips",
    protraction: 0.20, depression: 1.00, gripRotation: 25,
  },
  tuck_hang: {
    scapula: "Shoulders active, girdle neutral",
    grip: "Neutral grip, straight arms overhead",
    protraction: -0.10, depression: -0.20, gripRotation: 0,
  },
};

/** Resolve a chain position label to its render key, or null if none exists. */
export function positionKey(label: string): PositionKey | null {
  return BY_LABEL[label.trim().toLowerCase()] ?? null;
}

/** Public URL of a position's render. */
export function positionImage(key: PositionKey): string {
  return `/statics/${key}.png`;
}

/** Resolve a whole chain to the positions that have renders. */
export function chainRenders(
  chain: { pos: string; via?: boolean }[] | undefined,
): { pos: string; via?: boolean; key: PositionKey; src: string }[] {
  if (!chain) return [];
  return chain.flatMap(step => {
    const key = positionKey(step.pos);
    return key ? [{ ...step, key, src: positionImage(key) }] : [];
  });
}
