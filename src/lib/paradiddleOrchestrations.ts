// ── Paradiddle Orchestrations ──────────────────────────────────────
//
// A paradiddle is a STICKING — a fixed sequence of right/left strokes.  An
// "orchestration" paints that sticking across the kit: EACH stroke gets ONE
// kit voice (bass, snare, ghost, hi-hat) so the cell reads as a melody across
// the drums — e.g. "B s s HH" or "S BB S".  (Stacking a voice on every stroke
// is not an orchestration, it's clutter — we don't do that.)
//
// Two distinct things can happen to a DOUBLE (an RR or LL in the sticking):
//   • the BOUNCE (the 2nd note of the double) can be substituted alone — this
//     is what makes "B s s HH": the diddle's bounce becomes the hi-hat;
//   • the WHOLE double (both notes) can be substituted — this is what makes
//     "S BB S": both notes of the LL become bass drums.
// Both are provided as separate schemes.
//
// Only musical orchestrations are listed.  A (sticking, scheme) pair that
// isn't musical is left EMPTY on purpose.  Everything is in SIXTEENTH notes.

import type { StripMeasureData } from "@/components/VexDrumNotation";

// ── Voices ─────────────────────────────────────────────────────────
// "tap" = a plain snare notehead with NO accent and NO ghost parentheses —
// kept dynamically AMBIGUOUS per user direction ("remove accents and ghost
// notes, keep it ambiguous").  "hhFoot" = the left-foot hi-hat pedal.
export type Voice = "hh" | "tap" | "buzz" | "bass" | "hhFoot";

export interface Stroke { hand: "R" | "L"; voices: Voice[] }
export interface Pattern { name: string; strokes: Stroke[]; slots?: number[]; slotCount?: number }

// ── Stickings (columns) ────────────────────────────────────────────
export interface Sticking { id: string; label: string; pattern: ("R" | "L")[] }

// Four canonical 4-stroke stickings (one bar of 16ths = 4 strokes).  The
// label's second line is the hand-swapped mirror, shown as a 2nd R/L row under
// each note in the matrix.
export const STICKINGS: Sticking[] = [
  { id: "singles",    label: "Singles · RLRL",     pattern: ["R","L","R","L"] },
  { id: "doubles",    label: "Doubles · RRLL",     pattern: ["R","R","L","L"] },
  { id: "paradiddle", label: "Paradiddle · RLRR",  pattern: ["R","L","R","R"] },
  { id: "inward",     label: "Inward · RLLR",      pattern: ["R","L","L","R"] },
  { id: "inverted",   label: "Inverted · RRLR",    pattern: ["R","R","L","R"] },
];

/** The hand-swapped mirror of a sticking (R↔L) — the user's "other-hand
 *  variation" shown as a second label row beneath each note. */
export function mirrorHand(h: "R" | "L"): "R" | "L" { return h === "R" ? "L" : "R"; }

// ── Double / accent structure ──────────────────────────────────────
/** Both notes of every RR / LL pair (used by "whole-double" schemes). */
function doublePairSlots(p: ("R" | "L")[]): Set<number> {
  const out = new Set<number>();
  for (let i = 1; i < p.length; i++) if (p[i] === p[i - 1]) { out.add(i); out.add(i - 1); }
  return out;
}
/** Just the BOUNCE (2nd note) of every double (used by "diddle-bounce" schemes). */
function bounceSlots(p: ("R" | "L")[]): Set<number> {
  const out = new Set<number>();
  for (let i = 1; i < p.length; i++) if (p[i] === p[i - 1]) out.add(i);
  return out;
}
/** Accent = first stroke of each 4-stroke group (the natural rudiment accent). */
function accentSlots(len: number): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < len; i += 4) out.add(i);
  return out;
}

// ── Orchestration schemes (rows) ───────────────────────────────────
export interface SchemeCtx {
  hand: "R" | "L"; lead: "R" | "L";
  isAccent: boolean; isBounce: boolean; isDouble: boolean; index: number;
}
export interface Scheme {
  id: string; label: string; desc: string;
  voices: (c: SchemeCtx) => Voice[];
  appliesTo?: (s: Sticking) => boolean;
}

const hasDouble = (s: Sticking) => bounceSlots(s.pattern).size > 0;
// Whole-double substitution is only musical when the sticking MIXES singles and
// doubles — if every note is part of a double (RRLL) the substitution turns the
// whole bar into one repeated voice (B B B B / z z z z), which is nonsense.
const hasMixedDoubles = (s: Sticking) => {
  const n = doublePairSlots(s.pattern).size;
  return n > 0 && n < s.pattern.length;
};

export const SCHEMES: Scheme[] = [
  {
    id: "snare",
    label: "Snare (rudiment)",
    desc: "The bare rudiment on the snare — plain noteheads, dynamically ambiguous.",
    voices: () => ["tap"],
  },
  {
    id: "hh-snare",
    label: "Hi-hat / snare",
    desc: "Hands trade off: the lead hand rides the hi-hat, the other plays the snare — e.g. HH s HH s.",
    voices: c => c.hand === c.lead ? ["hh"] : ["tap"],
  },
  {
    id: "bounce-hat",
    label: "Bass + hat on diddle",
    desc: "Bass on the accent, snare through the middle, hi-hat on the diddle bounce — B s s HH.",
    voices: c => c.isAccent ? ["bass"] : c.isBounce ? ["hh"] : ["tap"],
    appliesTo: hasDouble,
  },
  {
    id: "bounce-bass",
    label: "Hat + bass on diddle",
    desc: "Hi-hat on the accent, snare in the middle, bass on the diddle bounce — HH s s B.",
    voices: c => c.isAccent ? ["hh"] : c.isBounce ? ["bass"] : ["tap"],
    appliesTo: hasDouble,
  },
  {
    id: "double-bass",
    label: "Double → bass",
    desc: "Both notes of the double become bass; the single strokes are snare — S BB S.",
    voices: c => c.isDouble ? ["bass"] : ["tap"],
    appliesTo: hasMixedDoubles,
  },
  {
    id: "buzz-on-bounce",
    label: "Buzz on the diddle",
    desc: "Snare / hi-hat interplay with a buzz / press stroke on the diddle bounce — e.g. S HH S(buzz).",
    voices: c => {
      if (c.isBounce) return ["buzz"];
      return c.hand === c.lead ? ["tap"] : ["hh"];
    },
    appliesTo: hasDouble,
  },
  {
    id: "pedal-lead-hat",
    label: "Pedal lead, hat on diddle",
    desc: "Left-foot hi-hat pedal IS the lead stroke, snare in the middle, hi-hat (hand) on the diddle bounce — HH-pedal s s HH.",
    voices: c => {
      if (c.isAccent) return ["hhFoot"];   // the foot replaces the lead stroke
      if (c.isBounce) return ["hh"];
      return ["tap"];
    },
    appliesTo: hasDouble,
  },
  {
    id: "pedal-lead-bass",
    label: "Pedal lead, bass on diddle",
    desc: "Left-foot hi-hat pedal leads, snare in the middle, bass drum on the diddle bounce — HH-pedal s s B.",
    voices: c => {
      if (c.isAccent) return ["hhFoot"];
      if (c.isBounce) return ["bass"];
      return ["tap"];
    },
    appliesTo: hasDouble,
  },
  {
    id: "pedal-on-diddle",
    label: "Pedal on the diddle",
    desc: "Hands play hi-hat / snare, and the diddle bounce is taken by the left-foot hi-hat pedal — s HH s(foot).",
    voices: c => {
      if (c.isBounce) return ["hhFoot"];
      return c.hand === c.lead ? ["hh"] : ["tap"];
    },
    appliesTo: hasDouble,
  },
  {
    id: "accent-bass",
    label: "Accent → bass",
    desc: "The rudiment accent becomes bass drum; the rest are snare — B s s s.",
    voices: c => c.isAccent ? ["bass"] : ["tap"],
  },
];

// ── Generator ──────────────────────────────────────────────────────
export function orchestrate(sticking: Sticking, scheme: Scheme): Pattern {
  if (scheme.appliesTo && !scheme.appliesTo(sticking)) {
    return { name: `${sticking.label} · ${scheme.label}`, strokes: [], slotCount: sticking.pattern.length };
  }
  const p = sticking.pattern;
  const bounces = bounceSlots(p);
  const doubles = doublePairSlots(p);
  const accents = accentSlots(p.length);
  const lead = p[0];
  const strokes: Stroke[] = p.map((hand, index) => ({
    hand,
    voices: scheme.voices({
      hand, lead, index,
      isAccent: accents.has(index),
      isBounce: bounces.has(index),
      isDouble: doubles.has(index),
    }),
  }));
  return { name: `${sticking.label} · ${scheme.label}`, strokes, slotCount: p.length };
}

export function isEmptyPattern(p: Pattern): boolean {
  return p.strokes.every(s => s.voices.length === 0);
}

// ── Pattern → notation (StripMeasureData), all sixteenth notes ─────
export function toStripMeasure(p: Pattern): StripMeasureData {
  const slots = p.slots ?? p.strokes.map((_, i) => i);
  const slotCount = p.slotCount ?? p.strokes.length;

  const ostinatoHits: number[] = [];
  const snareHits: number[] = [];
  const bassHits: number[] = [];
  const hhFootHits: number[] = [];
  const buzzHits: number[] = [];

  p.strokes.forEach((stroke, idx) => {
    const slot = slots[idx];
    for (const v of stroke.voices) {
      switch (v) {
        case "hh": ostinatoHits.push(slot); break;
        // Plain snare notehead — no accent flag, no ghost parentheses.
        case "tap": snareHits.push(slot); break;
        case "buzz": snareHits.push(slot); buzzHits.push(slot); break;
        case "bass": bassHits.push(slot); break;
        case "hhFoot": hhFootHits.push(slot); break;
      }
    }
  });

  // Linear vocabulary = at most one voice per slot AND no foot-pedal voice (the
  // hi-hat pedal lives stem-down, so a pattern using it is genuinely two-voice).
  // When linear, the bass beams with the hands as one up-voice; otherwise it
  // stays a stem-down voice alongside the pedal.
  const isLinear = p.strokes.every(s => s.voices.length <= 1) && hhFootHits.length === 0;
  const bassStemUp = bassHits.length > 0 && isLinear;

  return {
    grid: "16th",
    slotOverride: slotCount,
    ostinatoHits, ostinatoOpen: [],
    snareHits, bassHits,
    hhFootHits, hhFootOpen: [],
    ghostHits: [], ghostDoubleHits: [],
    tomHits: [], crashHits: [],
    buzzHits,
    bassStemUp,
    // No rests: every stroke is a fixed 1-slot attack and the whole cell beams
    // as ONE group, so cells stay evenly-spaced and symmetrical instead of the
    // ragged dotted-note/rest rendering (per user: "remove the rests… linear
    // vocabulary all in one beam").  beamAcrossRests is only honoured on the
    // grouping path, so set beamGrouping to the whole cell.
    showRests: false,
    shortHits: true,
    beamGrouping: slotCount,
    beamAcrossRests: true,
  };
}

/** Pixel width for a column rendering `slotCount` sixteenths. */
export function columnWidth(slotCount: number): number {
  return Math.max(150, slotCount * 40 + 24);
}

/** The two sticking label rows for a pattern: the played hand on top and its
 *  hand-swapped mirror beneath.  A bass-drum stroke shows no hand (foot), so
 *  both rows are blank there. */
export function stickingRows(p: Pattern): { top: string[]; mirror: string[] } {
  const top: string[] = [];
  const mirror: string[] = [];
  for (const s of p.strokes) {
    const isBass = s.voices.includes("bass");
    if (s.voices.length === 0 || isBass) { top.push(""); mirror.push(""); }
    else { top.push(s.hand); mirror.push(mirrorHand(s.hand)); }
  }
  return { top, mirror };
}
