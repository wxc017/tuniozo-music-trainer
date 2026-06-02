// ── Paradiddle Orchestrations ──────────────────────────────────────
//
// A paradiddle is a STICKING — a fixed sequence of right/left hand strokes.
// An "orchestration" is that sticking painted across the kit: each stroke is
// assigned a kit voice (hi-hat, snare, kick, …) and a dynamic (accent / ghost)
// according to a SCHEME.  The musical content is therefore
//     sticking  ×  orchestration scheme.
//
// This file enumerates only the MUSICAL orchestrations drummers actually play
// (not the raw 7^8 combinatorial space).  Each scheme below is a curated
// voice-map keyed off the universal structure of any paradiddle:
//   • accent slots  — the natural rudiment accents (first stroke of each
//                     4-stroke half: slots 0 and 4),
//   • diddle slots  — the doubled stroke (where a hand repeats),
//   • the lead hand — the hand that starts the cell (rides the hi-hat in the
//                     hand-split schemes).
// Some (sticking, scheme) pairs simply aren't musical — those cells are left
// empty on purpose.
//
// Everything is in SIXTEENTH notes: an 8-stroke cell = 8 sixteenths = two beats.

import type { StripMeasureData } from "@/components/VexDrumNotation";

// ── Voices ─────────────────────────────────────────────────────────
export type Voice =
  | "hh"       // hi-hat (closed), X notehead
  | "ride"     // ride cymbal (drawn on the cymbal line as X)
  | "snare"    // accented snare
  | "ghost"    // ghost snare (parenthesised)
  | "buzz"     // buzz / press stroke on the snare (z mark)
  | "bass"     // bass drum
  | "hhFoot"   // hi-hat pedal (foot chick)
  | "tom";     // tom

export interface Stroke { hand: "R" | "L"; voices: Voice[] }

export interface Pattern {
  name: string;
  strokes: Stroke[];          // one per stroke, in order
  /** Slot (sixteenth) index of each stroke; defaults to 0,1,2,… */
  slots?: number[];
  /** Total sixteenth slots in the rendered fragment (defaults to strokes.length). */
  slotCount?: number;
}

// ── Stickings (columns) ────────────────────────────────────────────
export interface Sticking { id: string; label: string; pattern: ("R" | "L")[] }

export const STICKINGS: Sticking[] = [
  { id: "singles",    label: "Singles · RLRL LRLR",    pattern: ["R","L","R","L","L","R","L","R"] },
  { id: "paradiddle", label: "Paradiddle · RLRR LRLL", pattern: ["R","L","R","R","L","R","L","L"] },
  { id: "inward",     label: "Inward · LRRL RLLR",     pattern: ["L","R","R","L","R","L","L","R"] },
  { id: "doubles",    label: "Doubles · RRLL LLRR",    pattern: ["R","R","L","L","L","L","R","R"] },
  { id: "reverse",    label: "Reverse · RRLR LLRL",    pattern: ["R","R","L","R","L","L","R","L"] },
];

/** Diddle slots: a stroke whose hand repeats the previous stroke's hand. */
function diddleSlots(p: ("R" | "L")[]): Set<number> {
  const out = new Set<number>();
  for (let i = 1; i < p.length; i++) if (p[i] === p[i - 1]) out.add(i);
  return out;
}

// Accent slots: the first stroke of each 4-stroke half (the rudiment accents).
const ACCENT_SLOTS = new Set([0, 4]);

// ── Orchestration schemes (rows) ───────────────────────────────────
// Each scheme is a pure function: given the per-stroke context, return the
// voices for that stroke (empty array = scheme doesn't apply → no note).  A
// scheme returning all-empty for a given sticking yields an empty tile.
export interface SchemeCtx {
  hand: "R" | "L";
  lead: "R" | "L";
  isAccent: boolean;
  isDiddle: boolean;
  index: number;
}
export interface Scheme {
  id: string;
  label: string;
  desc: string;
  voices: (c: SchemeCtx) => Voice[];
}

export const SCHEMES: Scheme[] = [
  {
    id: "snare",
    label: "Snare (rudiment)",
    desc: "The bare rudiment on the snare — accented rudiment strokes, ghosts between.",
    voices: c => [c.isAccent ? "snare" : "ghost"],
  },
  {
    id: "hands-hh-snare",
    label: "Hi-hat + snare",
    desc: "Lead hand rides the hi-hat, the other hand plays the snare (accented on its strong stroke).",
    voices: c => c.hand === c.lead ? ["hh"] : [c.isAccent ? "snare" : "ghost"],
  },
  {
    id: "hands-snare-hh",
    label: "Snare + hi-hat (inverted)",
    desc: "Hands swapped: lead hand on snare, the other rides the hi-hat.",
    voices: c => c.hand === c.lead ? [c.isAccent ? "snare" : "ghost"] : ["hh"],
  },
  {
    id: "accent-kick",
    label: "Accents → kick",
    desc: "The rudiment accents become bass drum; the taps are ghost-snare.",
    voices: c => c.isAccent ? ["bass"] : ["ghost"],
  },
  {
    id: "diddle-kick",
    label: "Diddle → kick",
    desc: "The doubled (diddle) stroke drops to the bass drum; lead beats ride the hi-hat, taps ghost. Yields the K-ghost-ghost-hat contour.",
    voices: c => {
      if (c.isDiddle) return ["bass"];
      if (c.isAccent) return ["hh"];
      return ["ghost"];
    },
  },
  {
    id: "kick-lead-hat-diddle",
    label: "Kick lead, hat on diddle",
    desc: "Bass on the accent, ghosts through the middle, hi-hat on the diddle — i.e. K s s HH per half.",
    voices: c => {
      if (c.isAccent) return ["bass"];
      if (c.isDiddle) return ["hh"];
      return ["ghost"];
    },
  },
  {
    id: "diddle-buzz",
    label: "Diddle → buzz",
    desc: "The diddle becomes a buzz / press stroke (z); accents on snare, taps ghost.",
    voices: c => {
      if (c.isDiddle) return ["buzz"];
      return [c.isAccent ? "snare" : "ghost"];
    },
  },
  {
    id: "accent-tom",
    label: "Accents → tom",
    desc: "Move the accents onto a tom for a melodic orchestration; taps stay ghost-snare.",
    voices: c => c.isAccent ? ["tom"] : ["ghost"],
  },
  {
    id: "hh-snare-kick",
    label: "Hi-hat + snare + kick",
    desc: "Full groove: lead hand hi-hat, off-hand snare (accented), bass drum doubling the accents.",
    voices: c => {
      const base: Voice[] = c.hand === c.lead ? ["hh"] : [c.isAccent ? "snare" : "ghost"];
      return c.isAccent ? [...base, "bass"] : base;
    },
  },
];

// ── Generator ──────────────────────────────────────────────────────
export function orchestrate(sticking: Sticking, scheme: Scheme): Pattern {
  const p = sticking.pattern;
  const diddles = diddleSlots(p);
  const lead = p[0];
  const strokes: Stroke[] = p.map((hand, index) => ({
    hand,
    voices: scheme.voices({ hand, lead, isAccent: ACCENT_SLOTS.has(index), isDiddle: diddles.has(index), index }),
  }));
  return { name: `${sticking.label} · ${scheme.label}`, strokes, slotCount: p.length };
}

/** True when an orchestration is empty (no audible voice on any stroke). */
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
  const hhFootHits: number[] = [];
  const tomHits: number[] = [];
  const buzzHits: number[] = [];
  const accentFlags: boolean[] = new Array(slotCount).fill(false);

  p.strokes.forEach((stroke, idx) => {
    const slot = slots[idx];
    for (const v of stroke.voices) {
      switch (v) {
        case "hh": case "ride": ostinatoHits.push(slot); break;
        case "snare": snareHits.push(slot); accentFlags[slot] = true; break;
        case "ghost": ghostHits.push(slot); break;
        case "buzz": ghostHits.push(slot); buzzHits.push(slot); break;
        case "bass": bassHits.push(slot); break;
        case "hhFoot": hhFootHits.push(slot); break;
        case "tom": tomHits.push(slot); break;
      }
    }
  });

  return {
    grid: "16th",
    // VexDrumStrip defaults slotCount to one beat unless slotOverride is set —
    // the cell is `slotCount` sixteenths (8 = two beats for an 8-stroke cell).
    slotOverride: slotCount,
    ostinatoHits, ostinatoOpen: [],
    snareHits, bassHits,
    hhFootHits, hhFootOpen: [],
    ghostHits, ghostDoubleHits: [],
    tomHits, crashHits: [],
    accentFlags,
    buzzHits,
    showRests: true,
  };
}
