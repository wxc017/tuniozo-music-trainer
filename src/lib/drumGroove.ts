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

import { getPerms, type GridType, type Permutation } from "./drumData";

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

/** Tile a per-beat permutation across `beats` beats (slot = beat*spb + s). */
function tilePerm(p: Permutation, beats: number, spb: number): number[] {
  const out: number[] = [];
  for (let b = 0; b < beats; b++) for (const s of p.beatSlots) out.push(b * spb + s);
  return out;
}

export function generateGroove(timeSig: TimeSig = [4, 4], seed?: number): Groove {
  const m = meterSpecFor(timeSig);
  const rng = makeRng(seed ?? ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0));
  const { beats, slotsPerBeat: spb, subdivs } = m;
  const perms = getPerms(m.grid);                       // per-beat vocabulary, beatSlots in 0..spb-1
  const byFamily = (f: number) => perms.filter(p => p.family === f);

  // ── Hi-hat: a real ostinato perm (≥2 hits/beat so it keeps time) ──
  const hhFamilies = perms.length ? [...new Set(perms.map(p => p.family))].filter(f => f >= 2) : [];
  const hhFam = hhFamilies.length ? pick(hhFamilies, rng) : Math.max(2, spb);
  const hhPerm = pick(byFamily(hhFam).length ? byFamily(hhFam) : perms, rng);
  let hhHits = hhPerm ? tilePerm(hhPerm, beats, spb) : Array.from({ length: subdivs }, (_, i) => i);

  // Occasional open hat on a late upbeat.
  const hhOpen: number[] = [];
  if (rng() < 0.35 && hhHits.length) {
    const openSlot = hhHits[hhHits.length - 1];
    hhHits = hhHits.filter(h => h !== openSlot);
    hhOpen.push(openSlot);
  }

  // ── Snare: meter backbeat, plus an occasional syncopated push ──
  const snareHits = [...m.backbeat];
  const beatStarts = Array.from({ length: beats }, (_, b) => b * spb);
  const innerOff = Array.from({ length: subdivs }, (_, i) => i).filter(i => i % spb !== 0);
  if (rng() < 0.4) {
    const cands = innerOff.filter(s => !snareHits.includes(s));
    if (cands.length) snareHits.push(pick(cands, rng));
  }

  // ── Ghost notes (sometimes) ──
  const ghostHits: number[] = [];
  if (rng() < 0.5) {
    const cands = innerOff.filter(s => !snareHits.includes(s) && !beatStarts.includes(s));
    const n = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < n && cands.length; i++) ghostHits.push(cands.splice(Math.floor(rng() * cands.length), 1)[0]);
  }

  // ── Kick: beat 1 + a sparse bass perm tiled (from the same vocabulary) ──
  const bassHits = [0];
  const sparse = byFamily(1).concat(byFamily(2));
  if (sparse.length) {
    const bassPerm = pick(sparse, rng);
    for (const s of tilePerm(bassPerm, beats, spb)) {
      // keep the kick from cluttering every backbeat; allow on beat starts + the "and"
      if (s % spb === 0 || s % spb === Math.floor(spb / 2)) bassHits.push(s);
    }
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
