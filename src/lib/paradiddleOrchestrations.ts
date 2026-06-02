// ── Paradiddle Orchestrations ──────────────────────────────────────
//
// Theory.  A drum "orchestration" of a rudiment is the rudiment's STICKING
// (a fixed sequence of right/left hand motions) painted across the kit, where
// each stroke is assigned:
//   • a VOICE   — which drum/cymbal it lands on (hi-hat, snare, bass, …), and
//   • a TREATMENT — its dynamic / stroke-type (accent, ghost, buzz, double),
//   • optionally a STACKED foot played simultaneously (hi-hat+bass, etc.).
//
// The musical space is therefore  sticking × voicing-style × diddle-treatment.
// It is NOT the raw 7^8 combinatorial space — the following musical rules prune
// it to the orchestrations drummers actually play (the "theory" the benchmark
// asks for):
//
//   1. Hand→voice convention: the leading/timekeeping hand rides the hi-hat or
//      ride; the other hand plays the snare — unless a style reassigns it.
//   2. Backbeat: the loud snare accent falls on beats 2 & 4.
//   3. Ghosts: un-accented snare strokes become ghost notes (the funk texture).
//   4. The diddle is special: the doubled stroke (RR / LL) is the natural home
//      for a bass-drum substitution, a double stroke, or a buzz/press stroke.
//   5. Feet fill & stack: bass on strong/syncopated beats; a hand stroke can be
//      doubled by a simultaneous foot (hi-hat+bass), and the hi-hat pedal is
//      the 4th limb.
//   6. Open/close: the hi-hat opens before a foot-close.
//
// Every reference groove the user supplied (see REFERENCE_GROOVES) is generated
// by this model; the matrix below is the systematic sweep of it.

import type { StripMeasureData } from "@/components/VexDrumNotation";
import type { GridType } from "@/lib/drumData";

// ── Voices ─────────────────────────────────────────────────────────
// One stroke can sound several voices at once (a hi-hat + bass "stack"), so a
// slot holds a SET of voices.  "rest" = empty set.
export type Voice =
  | "hh"          // hi-hat (closed), X notehead — the ride hand
  | "hhOpen"      // open hi-hat (circle-X)
  | "ride"        // ride cymbal (rendered on the hi-hat/ostinato line as X)
  | "crash"       // crash cymbal
  | "snare"       // accented snare (the backbeat / rudiment accent)
  | "ghost"       // ghost snare (parenthesised)
  | "buzz"        // buzz / press stroke on the snare (z mark)
  | "bass"        // bass drum
  | "hhFoot"      // hi-hat pedal (foot "chick")
  | "tom";        // tom (orchestration colour)

export interface Stroke {
  hand: "R" | "L";
  voices: Voice[];     // what this stroke sounds (may be a stack)
}

export interface Pattern {
  name: string;
  grid: GridType;      // "8th" → 8 slots/bar, etc.
  strokes: Stroke[];   // one entry per occupied slot, in order
  /** Slot index of each stroke (defaults to 0,1,2,… i.e. every grid slot). */
  slots?: number[];
}

// ── Stickings ──────────────────────────────────────────────────────
// Eight-stroke cells (one bar of straight 8ths).  These are the canonical
// single-paradiddle family plus the single/double-stroke references and the
// paradiddle inversions the user listed.
export interface Sticking { id: string; label: string; pattern: ("R" | "L")[] }

export const STICKINGS: Sticking[] = [
  { id: "singles",    label: "Singles · RLRL LRLR",   pattern: ["R","L","R","L","L","R","L","R"] },
  { id: "paradiddle", label: "Paradiddle · RLRR LRLL", pattern: ["R","L","R","R","L","R","L","L"] },
  { id: "inward",     label: "Inward · LRRL RLLR",     pattern: ["L","R","R","L","R","L","L","R"] },
  { id: "doubles",    label: "Doubles · RRLL LLRR",    pattern: ["R","R","L","L","L","L","R","R"] },
  { id: "reverse",    label: "Reverse · RRLR LLRL",    pattern: ["R","R","L","R","L","L","R","L"] },
];

// A diddle = a stroke whose hand repeats the previous stroke's hand (the bounce
// half of a double).  Returns the set of slot indices that are diddle-bounces.
export function diddleSlots(p: ("R" | "L")[]): Set<number> {
  const out = new Set<number>();
  for (let i = 1; i < p.length; i++) if (p[i] === p[i - 1]) out.add(i);
  return out;
}

// Beats fall on even slots (0,2,4,6) of an 8-slot 8th-note bar; the backbeat
// accents are beats 2 & 4 → slots 2 & 6 in a 4-beat bar of 8ths... but our cell
// is 8 eighths = one 4/4 bar, so beats are slots 0,2,4,6 and backbeat = 4 (beat
// 3?) — to keep the familiar 2 & 4 we treat the 8-slot cell as 4 beats with the
// backbeat on slots 2 and 6.
const BACKBEAT_SLOTS = new Set([2, 6]);
const DOWNBEAT_SLOTS = new Set([0, 4]);

// ── Orchestration axes ─────────────────────────────────────────────
export interface Style { id: string; label: string; desc: string }
export interface Treatment { id: string; label: string; desc: string }

// COLUMNS — voicing style: how the two hands map onto kit voices.
export const STYLES: Style[] = [
  { id: "rudiment", label: "Rudiment",  desc: "All strokes on the snare — the pure rudiment, accents on the beat." },
  { id: "rock",     label: "Rock",      desc: "Ride hand → hi-hat, other hand → snare; backbeat accents, bass on the downbeats." },
  { id: "funk",     label: "Funk (ghost)", desc: "Hi-hat marks the beats, off-beat snare strokes become ghosts, backbeat accented." },
  { id: "jazz",     label: "Jazz (ride)",  desc: "Ride hand on the ride/hi-hat, comping ghosts on snare, hi-hat pedal on 2 & 4." },
  { id: "linear",   label: "Linear",    desc: "No two voices at once — strokes spread hi-hat / snare / bass in a single line." },
];

// ROWS — diddle / foot treatment: what happens to the doubled (diddle) stroke
// and the feet.
export const TREATMENTS: Treatment[] = [
  { id: "plain",   label: "Plain",        desc: "Diddle stays as written (two like-hand strokes)." },
  { id: "bass",    label: "Diddle→Bass",  desc: "The diddle's bounce stroke is played by the bass drum." },
  { id: "buzz",    label: "Diddle→Buzz",  desc: "The diddle's bounce stroke is a buzz / press stroke (z)." },
  { id: "stack",   label: "Stacked kick", desc: "The downbeats add a simultaneous bass drum under the hand." },
  { id: "openhat", label: "Open hat",     desc: "Hi-hat opens on the off-beats (before the foot closes it)." },
  { id: "pedal",   label: "Pedal hat",    desc: "Hi-hat pedal (foot chick) fills the off-beats." },
];

// ── The generator ──────────────────────────────────────────────────
// Produce the voiced stroke list for (sticking, style, treatment).  This is the
// single source of truth that both the matrix tiles and the decomposition use.
export function orchestrate(sticking: Sticking, styleId: string, treatmentId: string): Pattern {
  const p = sticking.pattern;
  const diddles = diddleSlots(p);
  const lead = p[0];                         // the "ride" hand for hand→voice styles
  const strokes: Stroke[] = p.map((hand, i) => {
    const onBeat = DOWNBEAT_SLOTS.has(i) || BACKBEAT_SLOTS.has(i);
    const isRideHand = hand === lead;
    let voices: Voice[] = [];

    // ── Base voice by style ──
    switch (styleId) {
      case "rudiment":
        voices = [BACKBEAT_SLOTS.has(i) ? "snare" : DOWNBEAT_SLOTS.has(i) ? "snare" : "ghost"];
        // accent the down/back beats, ghost the rest
        if (DOWNBEAT_SLOTS.has(i) || BACKBEAT_SLOTS.has(i)) voices = ["snare"]; else voices = ["ghost"];
        break;
      case "rock":
        voices = isRideHand ? ["hh"] : (BACKBEAT_SLOTS.has(i) ? ["snare"] : ["ghost"]);
        break;
      case "funk":
        // Hi-hat only on the beats (ride hand landing on a beat); off-beats are
        // ghost snares; backbeat is an accent.  This is the contour of the
        // user's "HH (s)(s) … S (s)(s) HH" groove.
        if (BACKBEAT_SLOTS.has(i)) voices = ["snare"];
        else if (onBeat && isRideHand) voices = ["hh"];
        else voices = ["ghost"];
        break;
      case "jazz":
        voices = isRideHand ? ["ride"] : (BACKBEAT_SLOTS.has(i) ? ["snare"] : ["ghost"]);
        break;
      case "linear":
        // single line: ride hand → hi-hat, off-hand → snare (accent on backbeat)
        voices = isRideHand ? ["hh"] : (BACKBEAT_SLOTS.has(i) ? ["snare"] : ["ghost"]);
        break;
      default:
        voices = ["snare"];
    }

    // ── Diddle / foot treatment ──
    const isDiddle = diddles.has(i);
    switch (treatmentId) {
      case "bass":
        if (isDiddle) voices = ["bass"];
        break;
      case "buzz":
        if (isDiddle) voices = ["buzz"];
        break;
      case "stack":
        if (DOWNBEAT_SLOTS.has(i) && !voices.includes("bass")) voices = [...voices, "bass"];
        break;
      case "openhat":
        voices = voices.map(v => (v === "hh" && !onBeat ? "hhOpen" : v));
        break;
      case "pedal":
        // foot chick on the off-beats that are otherwise ghost/rest
        if (!onBeat && !voices.includes("bass")) voices = [...voices, "hhFoot"];
        break;
      case "plain":
      default:
        break;
    }

    return { hand, voices };
  });

  // Anchor the groove with a bass drum on beat 1 for the kit styles (rudiment
  // stays hands-only).  Don't double if the slot already has bass.
  if (styleId !== "rudiment") {
    const s0 = strokes[0];
    if (s0 && !s0.voices.includes("bass") && !s0.voices.includes("buzz")) {
      s0.voices = [...s0.voices, "bass"];
    }
  }

  return { name: `${sticking.label} · ${styleId}/${treatmentId}`, grid: "8th", strokes };
}

// ── Pattern → notation (StripMeasureData) ──────────────────────────
// Maps the abstract voiced strokes onto the drum-notation strip's hit arrays,
// reusing the exact buzz ("z") wiring that Accent Study / Scoring use
// (accentInterpretation:"accent-buzz" / tapInterpretation:"tap-buzz").
export function toStripMeasure(p: Pattern): StripMeasureData {
  const slots = p.slots ?? p.strokes.map((_, i) => i);
  const slotCount = gridSlots(p.grid);

  const ostinatoHits: number[] = [];
  const ostinatoOpen: number[] = [];
  const snareHits: number[] = [];
  const ghostHits: number[] = [];
  const bassHits: number[] = [];
  const hhFootHits: number[] = [];
  const tomHits: number[] = [];
  const crashHits: number[] = [];
  const buzzHits: number[] = [];
  const accentFlags: boolean[] = new Array(slotCount).fill(false);

  p.strokes.forEach((stroke, idx) => {
    const slot = slots[idx];
    for (const v of stroke.voices) {
      switch (v) {
        case "hh": case "ride": ostinatoHits.push(slot); break;
        case "hhOpen": ostinatoHits.push(slot); ostinatoOpen.push(slot); break;
        case "crash": crashHits.push(slot); break;
        case "snare": snareHits.push(slot); accentFlags[slot] = true; break;
        case "ghost": ghostHits.push(slot); break;
        case "buzz":
          // A press/buzz stroke: a ghost-level snare note carrying a per-note
          // "z" buzz mark (the same z used in Scoring / Accent Study).
          ghostHits.push(slot); buzzHits.push(slot); break;
        case "bass": bassHits.push(slot); break;
        case "hhFoot": hhFootHits.push(slot); break;
        case "tom": tomHits.push(slot); break;
      }
    }
  });

  return {
    grid: p.grid,
    ostinatoHits, ostinatoOpen,
    snareHits, bassHits,
    hhFootHits, hhFootOpen: [],
    ghostHits, ghostDoubleHits: [],
    tomHits, crashHits,
    accentFlags,
    buzzHits,
    showRests: true,
  };
}

function gridSlots(g: GridType): number {
  switch (g) {
    case "8th": return 8;
    case "16th": return 16;
    case "triplet": return 12;
    case "quintuplet": return 20;
    case "sextuplet": return 24;
    case "septuplet": return 28;
    case "32nd": return 32;
  }
}

// ── Reference grooves (the user's sent patterns) ───────────────────
// Authored note-for-note from the patterns the user supplied, decomposed into
// the voice model above.  "/" = stacked simultaneous hits.  These are the
// benchmark: every one must appear and notate correctly.
const R = (voices: Voice[]): Stroke => ({ hand: "R", voices });
const L = (voices: Voice[]): Stroke => ({ hand: "L", voices });

export const REFERENCE_GROOVES: Pattern[] = [
  {
    // HH (s)(s) B, S (s)(s) HH
    name: "HH (s)(s) B · S (s)(s) HH",
    grid: "8th",
    strokes: [R(["hh"]), L(["ghost"]), R(["ghost"]), L(["bass"]), R(["snare"]), L(["ghost"]), R(["ghost"]), L(["hh"])],
  },
  {
    // HH s HH s
    name: "HH s HH s",
    grid: "8th",
    slots: [0, 2, 4, 6],
    strokes: [R(["hh"]), L(["ghost"]), R(["hh"]), L(["ghost"])],
  },
  {
    // s HH s HH HH/buzz
    name: "s HH s HH · HH/buzz",
    grid: "8th",
    slots: [0, 2, 4, 6, 7],
    strokes: [L(["ghost"]), R(["hh"]), L(["ghost"]), R(["hh"]), R(["hh", "buzz"])],
  },
  {
    // HH/B s s/HH HH/B  ·  HH/s s HH HH/s  ·  s HH/b HH/b buzz
    name: "HH/B s s/HH HH/B",
    grid: "16th",
    slots: [0, 1, 2, 3],
    strokes: [R(["hh", "bass"]), L(["ghost"]), R(["ghost", "hh"]), L(["hh", "bass"])],
  },
  {
    name: "HH/s s HH HH/s",
    grid: "16th",
    slots: [0, 1, 2, 3],
    strokes: [R(["hh", "ghost"]), L(["ghost"]), R(["hh"]), L(["hh", "ghost"])],
  },
  {
    name: "s HH/b HH/b buzz",
    grid: "16th",
    slots: [0, 1, 2, 3],
    strokes: [L(["ghost"]), R(["hh", "bass"]), R(["hh", "bass"]), L(["buzz"])],
  },
  {
    // HH pedal · HH/S · S · HH/B
    name: "HH-pedal · HH/S · S · HH/B",
    grid: "16th",
    slots: [0, 1, 2, 3],
    strokes: [L(["hhFoot"]), R(["hh", "snare"]), L(["snare"]), R(["hh", "bass"])],
  },
];
