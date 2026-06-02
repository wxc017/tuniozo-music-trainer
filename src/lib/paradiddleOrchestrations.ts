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

// A paradiddle-family sticking has EXACTLY ONE diddle in its 4-stroke cell, so
// it decomposes into: a LEAD stroke (slot 0), two middle taps, and the DIDDLE
// BOUNCE.  The linear orchestration vocabulary substitutes the lead and the
// bounce over {snare, hi-hat, hi-hat-pedal, bass}, keeping the middle two on
// the snare.  RLRR (bounce@3), RLLR (bounce@2), RRLR (bounce@1) all qualify;
// singles (no diddle) and doubles (two diddles) don't fit this structure.
const singleDiddle = (s: Sticking) => bounceSlots(s.pattern).size === 1;

// The four linear voices and how each prints in a label.
const ENDPOINT_VOICES: { v: Voice; sym: string }[] = [
  { v: "tap",    sym: "s"  },
  { v: "hh",     sym: "HH" },
  { v: "hhFoot", sym: "F"  },
  { v: "bass",   sym: "B"  },
];

// Generate all lead × bounce orchestrations (4 × 4 = 16) minus the monotone
// snare cell (s s s s), giving the 15 musical linear paradiddle orchestrations.
function buildEndpointSchemes(): Scheme[] {
  const out: Scheme[] = [];
  for (const lead of ENDPOINT_VOICES) {
    for (const bounce of ENDPOINT_VOICES) {
      if (lead.v === "tap" && bounce.v === "tap") continue;  // skip plain s s s s
      out.push({
        id: `lin-${lead.sym}-${bounce.sym}`,
        // Label reads as the actual lick on the paradiddle: "<lead> s s <bounce>".
        label: `${lead.sym} s s ${bounce.sym}`,
        desc: `Linear paradiddle: ${lead.sym} on the lead, snare on the two middle taps, ${bounce.sym} on the diddle bounce.`,
        voices: c => c.isAccent ? [lead.v] : c.isBounce ? [bounce.v] : ["tap"],
        appliesTo: singleDiddle,
      });
    }
  }
  return out;
}

export const SCHEMES: Scheme[] = buildEndpointSchemes();

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

  // Linear vocabulary = at most one voice per slot.  Then bass AND the hi-hat
  // foot pedal render in the up-voice (stem-up) so the whole line beams as one
  // group, instead of dangling as stem-down notes that don't beam and clip off
  // the bottom of the tile (per user: "can't see the bottom notes and it's not
  // beamed").
  const isLinear = p.strokes.every(s => s.voices.length <= 1);
  const bassStemUp = bassHits.length > 0 && isLinear;
  const footStemUp = hhFootHits.length > 0 && isLinear;

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
    footStemUp,
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
