// ── Paradiddle Orchestrations ──────────────────────────────────────
//
// A paradiddle is a STICKING — a fixed sequence of right/left hand strokes.
// An "orchestration" paints that sticking across the kit: each stroke gets a
// kit voice (hi-hat, snare, kick, …) and a dynamic (accent / ghost) per a
// SCHEME.  Musical content = sticking × scheme.
//
// Only the orchestrations drummers actually play are listed.  A (sticking,
// scheme) pair that isn't musical is left EMPTY on purpose (isEmptyPattern).
//
// Everything is in SIXTEENTH notes: an 8-stroke cell = 8 sixteenths = two beats.

import type { StripMeasureData } from "@/components/VexDrumNotation";

// ── Voices ─────────────────────────────────────────────────────────
export type Voice =
  | "hh"       // hi-hat (closed), X notehead
  | "snare"    // accented snare
  | "ghost"    // ghost snare (parenthesised)
  | "buzz"     // buzz / press stroke on the snare (z)
  | "bass"     // bass drum
  | "tom";     // tom

export interface Stroke { hand: "R" | "L"; voices: Voice[] }

export interface Pattern {
  name: string;
  strokes: Stroke[];
  slots?: number[];
  slotCount?: number;
}

// ── Stickings (columns) ────────────────────────────────────────────
export interface Sticking { id: string; label: string; pattern: ("R" | "L")[] }

export const STICKINGS: Sticking[] = [
  { id: "singles",     label: "Singles · RLRL RLRL",     pattern: ["R","L","R","L","R","L","R","L"] },
  { id: "doubles",     label: "Doubles · RRLL LLRR",     pattern: ["R","R","L","L","L","L","R","R"] },
  { id: "paradiddle",  label: "Paradiddle · RLRR LRLL",  pattern: ["R","L","R","R","L","R","L","L"] },
  { id: "reverse",     label: "Reverse · RRLR LLRL",     pattern: ["R","R","L","R","L","L","R","L"] },
  { id: "inward",      label: "Inward · RLLR LRRL",      pattern: ["R","L","L","R","L","R","R","L"] },
  { id: "paradiddlediddle", label: "Para-diddle-diddle · RLRRLL", pattern: ["R","L","R","R","L","L"] },
  { id: "doubleparadiddle", label: "Double Paradiddle · RLRLRR LRLRLL", pattern: ["R","L","R","L","R","R","L","R","L","R","L","L"] },
];

/** Diddle slots: a stroke whose hand repeats the previous stroke's hand. */
function diddleSlots(p: ("R" | "L")[]): Set<number> {
  const out = new Set<number>();
  for (let i = 1; i < p.length; i++) if (p[i] === p[i - 1]) out.add(i);
  return out;
}

// Accent slots: first stroke of each 4-stroke group (the rudiment accents).
function accentSlots(len: number): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < len; i += 4) out.add(i);
  return out;
}

// ── Orchestration schemes (rows) ───────────────────────────────────
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
  /** Optional musicality gate — return false to leave this sticking's cell
   *  empty (the scheme isn't musical for that sticking). */
  appliesTo?: (sticking: Sticking) => boolean;
}

// A paradiddle-family sticking has at least one diddle; pure singles don't.
const hasDiddle = (s: Sticking) => diddleSlots(s.pattern).size > 0;

export const SCHEMES: Scheme[] = [
  {
    id: "snare",
    label: "Snare (rudiment)",
    desc: "The bare rudiment on the snare — accents on the rudiment accent, ghosts between.",
    voices: c => [c.isAccent ? "snare" : "ghost"],
  },
  {
    id: "hh-snare",
    label: "Hi-hat + snare",
    desc: "Lead hand rides the hi-hat; the other hand plays the snare (accented on its strong stroke). Hi-hat / snare interplay.",
    voices: c => c.hand === c.lead ? ["hh"] : [c.isAccent ? "snare" : "ghost"],
  },
  {
    id: "hh-snare-stack",
    label: "Hi-hat over snare",
    desc: "Both hands keep the hi-hat going; the off-hand strokes stack a snare/ghost UNDER the hi-hat — the HH/s, HH/S interplay.",
    voices: c => c.hand === c.lead
      ? ["hh"]
      : (c.isAccent ? ["hh", "snare"] : ["hh", "ghost"]),
  },
  {
    id: "diddle-kick",
    label: "Diddle → kick",
    desc: "The doubled (diddle) stroke drops to the bass; lead beats ride the hi-hat, taps ghost — the HH s s K contour.",
    voices: c => {
      if (c.isDiddle) return ["bass"];
      if (c.isAccent) return ["hh"];
      return ["ghost"];
    },
    appliesTo: hasDiddle,
  },
  {
    id: "kick-lead-hat-diddle",
    label: "Kick lead, hat on diddle",
    desc: "Bass on the accent, ghosts through the middle, hi-hat on the diddle — K s s HH per group.",
    voices: c => {
      if (c.isAccent) return ["bass"];
      if (c.isDiddle) return ["hh"];
      return ["ghost"];
    },
    appliesTo: hasDiddle,
  },
  {
    id: "diddle-buzz",
    label: "Diddle → buzz",
    desc: "The diddle becomes a buzz / press stroke (z); accents on snare, taps ghost.",
    voices: c => {
      if (c.isDiddle) return ["buzz"];
      return [c.isAccent ? "snare" : "ghost"];
    },
    appliesTo: hasDiddle,
  },
  {
    id: "accent-kick",
    label: "Accents → kick",
    desc: "Rudiment accents become bass drum; the taps stay ghost-snare.",
    voices: c => c.isAccent ? ["bass"] : ["ghost"],
  },
  {
    id: "accent-tom",
    label: "Accents → tom",
    desc: "Melodic orchestration: accents on a tom, taps ghost-snare.",
    voices: c => c.isAccent ? ["tom"] : ["ghost"],
  },
  {
    id: "kick-only",
    label: "Kick (bass alone)",
    desc: "The rudiment played on the bass drum alone — a foot-technique orchestration.",
    voices: () => ["bass"],
  },
];

// ── Generator ──────────────────────────────────────────────────────
export function orchestrate(sticking: Sticking, scheme: Scheme): Pattern {
  if (scheme.appliesTo && !scheme.appliesTo(sticking)) {
    return { name: `${sticking.label} · ${scheme.label}`, strokes: [], slotCount: sticking.pattern.length };
  }
  const p = sticking.pattern;
  const diddles = diddleSlots(p);
  const accents = accentSlots(p.length);
  const lead = p[0];
  const strokes: Stroke[] = p.map((hand, index) => ({
    hand,
    voices: scheme.voices({ hand, lead, isAccent: accents.has(index), isDiddle: diddles.has(index), index }),
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
  const tomHits: number[] = [];
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
        case "tom": tomHits.push(slot); break;
      }
    }
  });

  // "Bass alone = one voice": if nothing uses the upper (stem-up) voices, draw
  // the bass stem-UP as a single voice so it's readable, instead of an empty
  // up-voice over a lone stem-down kick (per user: bass tiles unreadable).
  const upperEmpty = ostinatoHits.length === 0 && snareHits.length === 0 &&
                     ghostHits.length === 0 && tomHits.length === 0;
  const bassStemUp = upperEmpty && bassHits.length > 0;

  return {
    grid: "16th",
    slotOverride: slotCount,
    ostinatoHits, ostinatoOpen: [],
    snareHits, bassHits,
    hhFootHits: [], hhFootOpen: [],
    ghostHits, ghostDoubleHits: [],
    tomHits, crashHits: [],
    accentFlags,
    buzzHits,
    stickings,
    bassStemUp,
    showRests: true,
  };
}
