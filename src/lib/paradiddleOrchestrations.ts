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
export type Voice = "hh" | "snare" | "ghost" | "buzz" | "bass";

export interface Stroke { hand: "R" | "L"; voices: Voice[] }
export interface Pattern { name: string; strokes: Stroke[]; slots?: number[]; slotCount?: number }

// ── Stickings (columns) ────────────────────────────────────────────
export interface Sticking { id: string; label: string; pattern: ("R" | "L")[] }

export const STICKINGS: Sticking[] = [
  { id: "single4",     label: "Paradiddle · RLRR",        pattern: ["R","L","R","R"] },
  { id: "inward4",     label: "Inward · RLLR",            pattern: ["R","L","L","R"] },
  { id: "singles",     label: "Singles · RLRL RLRL",      pattern: ["R","L","R","L","R","L","R","L"] },
  { id: "doubles",     label: "Doubles · RR LL",          pattern: ["R","R","L","L"] },
  { id: "paradiddle",  label: "Paradiddle · RLRR LRLL",   pattern: ["R","L","R","R","L","R","L","L"] },
  { id: "reverse",     label: "Reverse · RLLR LRRL",      pattern: ["R","L","L","R","L","R","R","L"] },
  { id: "diddlepara",  label: "Para-diddle-diddle · RLRRLL", pattern: ["R","L","R","R","L","L"] },
  { id: "doublepara",  label: "Double Paradiddle · RLRLRR", pattern: ["R","L","R","L","R","R"] },
];

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

export const SCHEMES: Scheme[] = [
  {
    id: "snare",
    label: "Snare (rudiment)",
    desc: "The bare rudiment on the snare — accent on the rudiment accent, ghosts between.",
    voices: c => [c.isAccent ? "snare" : "ghost"],
  },
  {
    id: "hh-snare",
    label: "Hi-hat / snare",
    desc: "Hands trade off: the lead hand rides the hi-hat, the other hand plays snare (accented) / ghost — e.g. HH s HH s.",
    voices: c => c.hand === c.lead ? ["hh"] : [c.isAccent ? "snare" : "ghost"],
  },
  {
    id: "bounce-hat",
    label: "Bass + hat on diddle",
    desc: "Bass on the accent, ghosts through the middle, hi-hat on the diddle bounce — B s s HH.",
    voices: c => c.isAccent ? ["bass"] : c.isBounce ? ["hh"] : ["ghost"],
    appliesTo: hasDouble,
  },
  {
    id: "bounce-bass",
    label: "Hat + bass on diddle",
    desc: "Hi-hat on the accent, ghosts in the middle, bass on the diddle bounce — HH s s B.",
    voices: c => c.isAccent ? ["hh"] : c.isBounce ? ["bass"] : ["ghost"],
    appliesTo: hasDouble,
  },
  {
    id: "double-bass",
    label: "Double → bass",
    desc: "Both notes of the double become bass; the single strokes are snare — S BB S.",
    voices: c => c.isDouble ? ["bass"] : ["snare"],
    appliesTo: hasDouble,
  },
  {
    id: "double-buzz",
    label: "Double → buzz",
    desc: "Both notes of the double become a buzz / press stroke (z); single strokes snare.",
    voices: c => c.isDouble ? ["buzz"] : [c.isAccent ? "snare" : "ghost"],
    appliesTo: hasDouble,
  },
  {
    id: "accent-bass",
    label: "Accent → bass",
    desc: "The rudiment accent becomes bass drum; the rest are ghost-snare — B s s s.",
    voices: c => c.isAccent ? ["bass"] : ["ghost"],
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
  const ghostHits: number[] = [];
  const bassHits: number[] = [];
  const buzzHits: number[] = [];
  const stickings: string[] = new Array(slotCount).fill("");
  const accentFlags: boolean[] = new Array(slotCount).fill(false);

  p.strokes.forEach((stroke, idx) => {
    const slot = slots[idx];
    if (stroke.voices.length > 0) stickings[slot] = stroke.hand;
    for (const v of stroke.voices) {
      switch (v) {
        case "hh": ostinatoHits.push(slot); break;
        case "snare": snareHits.push(slot); accentFlags[slot] = true; break;
        case "ghost": ghostHits.push(slot); break;
        case "buzz": ghostHits.push(slot); buzzHits.push(slot); break;
        case "bass": bassHits.push(slot); break;
      }
    }
  });

  // Bass-alone (no upper-voice content) → render the bass stem-UP as a single
  // readable voice instead of an empty up-voice over a lone stem-down kick.
  const upperEmpty = ostinatoHits.length === 0 && snareHits.length === 0 && ghostHits.length === 0;
  const bassStemUp = upperEmpty && bassHits.length > 0;

  return {
    grid: "16th",
    slotOverride: slotCount,
    ostinatoHits, ostinatoOpen: [],
    snareHits, bassHits,
    hhFootHits: [], hhFootOpen: [],
    ghostHits, ghostDoubleHits: [],
    tomHits: [], crashHits: [],
    accentFlags,
    buzzHits,
    stickings,
    bassStemUp,
    showRests: true,
  };
}

/** Pixel width for a column rendering `slotCount` sixteenths — wider cells so
 *  the notation isn't cramped (the prior fixed width crushed 8-note cells). */
export function columnWidth(slotCount: number): number {
  return Math.max(150, slotCount * 30 + 24);
}
