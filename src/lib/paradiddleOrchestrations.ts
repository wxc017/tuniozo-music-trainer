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
  isAccent: boolean; isBounce: boolean; isDouble: boolean;
  isFirst: boolean; isLast: boolean; index: number;
}
export interface Scheme {
  id: string; label: string; desc: string;
  voices: (c: SchemeCtx) => Voice[];
  appliesTo?: (s: Sticking) => boolean;
}

// ── Linear voicings ────────────────────────────────────────────────
// The mode is now a flat list of raw VOICINGS of the single paradiddle (RLRR):
// each is a 4-slot cell where every stroke independently takes one of
// {snare, hi-hat, hi-hat-pedal, bass}.  No sticking columns, no R/L labels —
// just the voicings (per user direction).  Capped to the musical subset and
// ordered left-to-right by minimal change from the previous voicing.
const SLOT_VOICES: { v: Voice; sym: string }[] = [
  { v: "tap",    sym: "s"  },
  { v: "hh",     sym: "HH" },
  { v: "hhFoot", sym: "F"  },
  { v: "bass",   sym: "B"  },
];
const SYM: Record<Voice, string> = { tap: "s", hh: "HH", hhFoot: "F", bass: "B", buzz: "z" };
const isFootV = (v: Voice) => v === "bass" || v === "hhFoot";

/** Musicality cap for a 4-slot voicing of the paradiddle. */
function musicalVoicing(v: Voice[]): boolean {
  if (v.every(x => x === "tap")) return false;          // bare rudiment
  if (new Set(v).size === 1) return false;              // monotone (HHHH, BBBB…)
  const feet = v.filter(isFootV).length;
  if (feet > 2) return false;                           // too much foot for a 4-note lick
  // No three of the same NON-snare voice in a row (e.g. HH HH HH) — un-idiomatic.
  // Three snares in a row is fine (e.g. s s s HH = a single substitution).
  for (let i = 0; i + 2 < v.length; i++) {
    if (v[i] !== "tap" && v[i] === v[i + 1] && v[i + 1] === v[i + 2]) return false;
  }
  return true;
}

/** All musical 4-slot voicings, unordered. */
function allMusicalVoicings(): Voice[][] {
  const out: Voice[][] = [];
  const VS = SLOT_VOICES.map(s => s.v);
  for (const a of VS) for (const b of VS) for (const c of VS) for (const d of VS) {
    const v = [a, b, c, d];
    if (musicalVoicing(v)) out.push(v);
  }
  return out;
}

/** Hamming distance between two equal-length voicings. */
function voicingDist(a: Voice[], b: Voice[]): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

/** Order voicings so each differs minimally from the previous (greedy nearest
 *  neighbour from the snare-heavy "s s s HH" end), per user: "order them left
 *  to right by alterations compared to the previous voice". */
function orderByMinimalChange(voicings: Voice[][]): Voice[][] {
  if (voicings.length === 0) return [];
  const remaining = [...voicings];
  // Start from the voicing closest to all-snare (fewest non-snare slots).
  remaining.sort((a, b) =>
    a.filter(x => x !== "tap").length - b.filter(x => x !== "tap").length);
  const ordered: Voice[][] = [remaining.shift()!];
  while (remaining.length) {
    const last = ordered[ordered.length - 1];
    let best = 0, bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = voicingDist(last, remaining[i]);
      if (d < bestD) { bestD = d; best = i; if (d === 1) break; }
    }
    ordered.push(remaining.splice(best, 1)[0]);
  }
  return ordered;
}

export interface Voicing { id: string; label: string; voices: Voice[] }

export const VOICINGS: Voicing[] = orderByMinimalChange(allMusicalVoicings()).map(v => ({
  id: "v-" + v.map(x => SYM[x]).join(""),
  label: v.map(x => SYM[x]).join(" "),
  voices: v,
}));

/** A voicing → Pattern, carrying the paradiddle hands internally (RLRR) even
 *  though hands are no longer displayed, so toStripMeasure's foot/bass stem
 *  logic still works. */
const PARADIDDLE_HANDS: ("R" | "L")[] = ["R", "L", "R", "R"];
export function voicingToPattern(v: Voicing): Pattern {
  return {
    name: v.label,
    strokes: v.voices.map((voice, i) => ({ hand: PARADIDDLE_HANDS[i], voices: [voice] })),
    slotCount: v.voices.length,
  };
}

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
      isFirst: index === 0,
      isLast: index === p.length - 1,
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
