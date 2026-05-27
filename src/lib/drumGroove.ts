// ── Drum groove generator (Rhythmic Audiation: Grooves) ───────────────────
//
// Produces one bar of kit notation as slot-index arrays.  The same Groove
// object both PLAYS (drumSampler, real samples) and is the SHOW-ANSWER
// notation — so what you hear is exactly what's revealed.
//
// The hi-hat / kick layers are drawn from the SAME per-beat permutation
// vocabulary the Drum Patterns feature uses (getPerms), tiled across the
// chosen meter; the snare lands on a meter-appropriate backbeat.  Meter-aware:
// simple meters (x/4) run on a 16th grid, compound meters (x/8, numerator
// divisible by 3) on a triplet grid.

import { type GridType } from "./drumData";

export type TimeSig = [number, number];

export interface Groove {
  timeSig: TimeSig;
  grid: GridType;        // "16th" (simple) or "triplet" (compound) — beam styling
  subdivs: number;       // total slots in the bar
  slotsPerBeat: number;  // slots per notated beat group
  slotQuarters: number;  // quarter-note value of one slot (playback timing)
  beats: number;         // notated beats per bar
  hhHits: number[];
  hhOpen: number[];
  snareHits: number[];
  ghostHits: number[];
  bassHits: number[];
}

// ── Meter spec (typical + generic/custom) ─────────────────────────────────
export interface MeterSpec {
  timeSig: TimeSig;
  label: string;
  grid: GridType;
  subdivs: number;
  slotsPerBeat: number;
  slotQuarters: number;
  beats: number;
  compound: boolean;
  backbeat: number[];    // snare backbeat slots for this meter
}

/** The quick-pick "typical" meters shown as buttons. */
export const TYPICAL_METERS: TimeSig[] = [[4, 4], [3, 4], [5, 4], [7, 4], [6, 8], [12, 8]];

function backbeatFor(beats: number, spb: number, compound: boolean): number[] {
  if (compound) {
    if (beats <= 2) return [1 * spb];               // 6/8 → beat 2
    return [1 * spb, 3 * spb].filter(s => s < beats * spb); // 12/8 → beats 2 & 4
  }
  if (beats <= 2) return [1 * spb];
  if (beats === 3) return [2 * spb];                // 3/4 → beat 3
  if (beats === 5) return [1 * spb, 3 * spb];       // 5/4 → beats 2 & 4
  if (beats === 7) return [1 * spb, 4 * spb];       // 7/4 → beats 2 & 5 (4+3)
  return [1 * spb, 3 * spb];                        // 4/4 etc. → beats 2 & 4
}

/** Build a MeterSpec for any time signature.  Denominator 4 → simple 16th
 *  grid; denominator 8 with numerator divisible by 3 → compound triplet grid;
 *  any other denominator-8 falls back to a simple eighth feel. */
export function meterSpecFor(timeSig: TimeSig): MeterSpec {
  const [num, den] = timeSig;
  let grid: GridType, spb: number, slotQuarters: number, beats: number, compound: boolean;
  if (den === 8 && num % 3 === 0) {
    compound = true; grid = "triplet"; spb = 3; slotQuarters = 0.5; beats = num / 3;
  } else if (den === 8) {
    compound = false; grid = "8th"; spb = 2; slotQuarters = 0.5; beats = Math.max(1, Math.round(num / 2));
  } else {
    compound = false; grid = "16th"; spb = 4; slotQuarters = 0.25; beats = num; // treat den 2/4 as quarter beats
  }
  const subdivs = beats * spb;
  return {
    timeSig, label: `${num}/${den}`, grid, subdivs,
    slotsPerBeat: spb, slotQuarters, beats, compound,
    backbeat: backbeatFor(beats, spb, compound),
  };
}

// ── Seeded PRNG (same LCG used across the rhythm tools) ───────────────────
function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; };
}
const pick = <T,>(arr: T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)];
const uniq = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);

export function generateGroove(timeSig: TimeSig = [4, 4], seed?: number): Groove {
  const m = meterSpecFor(timeSig);
  const rng = makeRng(seed ?? ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0));
  const { beats, slotsPerBeat: spb, subdivs } = m;
  const beatStarts = Array.from({ length: beats }, (_, b) => b * spb);

  // ── Hi-hat: a steady eighth-note ostinato (the bedrock of most grooves) ──
  // 16th grid → every other slot; 8th/triplet grids → every slot (each slot
  // is already an eighth).
  const eighthStep = spb % 2 === 0 ? spb / 2 : 1;
  const hhHits: number[] = [];
  for (let s = 0; s < subdivs; s += eighthStep) hhHits.push(s);
  const hhOpen: number[] = [];

  // ── Snare: meter backbeat (clean — no random clutter) ──
  const snareHits = [...m.backbeat];
  const ghostHits: number[] = [];

  // ── Kick: beat 1, the bar's midpoint downbeat, and an occasional "and" ──
  const half = spb / 2;
  const bassHits = [0];
  const mid = Math.floor(beats / 2) * spb;          // beat 3 in 4/4, beat 2 in 3/4, etc.
  if (mid > 0) bassHits.push(mid);
  if (Number.isInteger(half) && rng() < 0.5) {
    // a syncopated "and of a beat" that isn't already a backbeat
    const ands = beatStarts.map(b => b + half).filter(s => s < subdivs && !bassHits.includes(s) && !snareHits.includes(s));
    if (ands.length) bassHits.push(pick(ands, rng));
  }

  return {
    timeSig: m.timeSig, grid: m.grid, subdivs: m.subdivs,
    slotsPerBeat: m.slotsPerBeat, slotQuarters: m.slotQuarters, beats: m.beats,
    hhHits: uniq(hhHits),
    hhOpen: uniq(hhOpen),
    snareHits: uniq(snareHits),
    ghostHits: uniq(ghostHits.filter(g => !snareHits.includes(g))),
    bassHits: uniq(bassHits),
  };
}
