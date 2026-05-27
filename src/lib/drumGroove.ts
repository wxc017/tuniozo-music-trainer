// ── Drum groove generator (Rhythmic Audiation: Drum Transcription) ────────
//
// Produces a single 4/4 bar of kit notation (16th-note grid, 16 slots) as
// DrumNotation-compatible slot-index arrays.  The same Groove object both
// PLAYS (via drumSampler, real samples) and is the SHOW-ANSWER notation
// (DrumNotation) — so what you hear is exactly what's revealed.
//
// Time-signature variety is a deliberate follow-up (the user asked to add it
// AFTER the mode exists); the first cut is 4/4 only, matching DrumNotation's
// fixed 16-slot grid.

import type { GridType } from "./drumData";

export interface Groove {
  grid: GridType;            // always "16th" for now (4/4, 16 slots)
  timeSig: [number, number]; // [4, 4]
  hhHits: number[];          // closed hi-hat slot indices
  hhOpen: number[];          // open hi-hat slot indices
  snareHits: number[];       // accented snare (backbeat etc.)
  ghostHits: number[];       // ghost snare (quiet)
  bassHits: number[];        // kick slot indices
}

export type GrooveLevel = "basic" | "intermediate" | "advanced";

export const LEVEL_INFO: { value: GrooveLevel; label: string; desc: string }[] = [
  { value: "basic",        label: "Basic",        desc: "8th-note hats, backbeat, simple kick" },
  { value: "intermediate", label: "Intermediate", desc: "16th hats, syncopated kick, a ghost" },
  { value: "advanced",     label: "Advanced",     desc: "Busy 16ths, open hats, ghost notes" },
];

// ── Seeded PRNG (same LCG used across the rhythm tools) ───────────────────
function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; };
}
const pick = <T,>(arr: T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)];

// Kick vocabularies on the 16-slot grid.  Slot 0 = beat 1; 4 = beat 2;
// 8 = beat 3; 12 = beat 4.  Each entry is a set of additional kick slots
// (beat 1 is always present).  Hand-picked to sound like real grooves.
const KICK_BASIC = [
  [8],            // 1 . 3
  [8, 10],        // "boots" — 1, 3, and-of-3
  [6, 8],
];
const KICK_INTER = [
  [3, 8],         // 1, e-of-1, 3
  [8, 11],        // 1, 3, a-of-3
  [6, 8, 14],
  [3, 10],
  [8, 10, 14],
];
const KICK_ADV = [
  [3, 6, 10, 11],
  [2, 8, 11, 14],
  [3, 8, 10, 13],
  [6, 7, 10, 14],
  [2, 3, 8, 11],
];

export function generateGroove(level: GrooveLevel, seed?: number): Groove {
  const rng = makeRng(seed ?? ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0));

  // ── Hi-hat ostinato ──
  let hhHits: number[];
  const hhOpen: number[] = [];
  if (level === "basic") {
    hhHits = [0, 2, 4, 6, 8, 10, 12, 14];                     // straight 8ths
  } else {
    hhHits = Array.from({ length: 16 }, (_, i) => i);          // straight 16ths
    if (level === "advanced" && rng() < 0.6) {
      // Drop a couple of 16ths and add an open hat on an upbeat for colour.
      const dropCount = 1 + Math.floor(rng() * 2);
      for (let d = 0; d < dropCount; d++) {
        const cand = pick([5, 7, 9, 13, 15], rng);
        hhHits = hhHits.filter(h => h !== cand);
      }
      const openSlot = pick([14, 10, 6], rng);
      hhHits = hhHits.filter(h => h !== openSlot);
      hhOpen.push(openSlot);
    }
  }

  // ── Snare: backbeat on 2 & 4, always ──
  const snareHits = [4, 12];
  if (level !== "basic" && rng() < 0.5) {
    // A syncopated snare push (e.g. the "a" before beat 4 or a 3-e).
    snareHits.push(pick([10, 11, 14, 7], rng));
  }

  // ── Ghost notes (quiet snare filler) ──
  const ghostHits: number[] = [];
  if (level === "advanced") {
    const ghostCands = [1, 2, 5, 6, 9, 13, 15].filter(s => !snareHits.includes(s));
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n && ghostCands.length; i++) {
      const idx = Math.floor(rng() * ghostCands.length);
      ghostHits.push(ghostCands.splice(idx, 1)[0]);
    }
  }

  // ── Kick ──
  const vocab = level === "basic" ? KICK_BASIC : level === "intermediate" ? KICK_INTER : KICK_ADV;
  const bassHits = [0, ...pick(vocab, rng)];

  // De-dupe / sort everything.
  const uniq = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);
  return {
    grid: "16th",
    timeSig: [4, 4],
    hhHits: uniq(hhHits),
    hhOpen: uniq(hhOpen),
    snareHits: uniq(snareHits),
    ghostHits: uniq(ghostHits.filter(g => !snareHits.includes(g))),
    bassHits: uniq(bassHits),
  };
}
