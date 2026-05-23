// ── Auto-harmonization + accompaniment for melody-only tunes ────────
//
// The Session and Essen corpora are melody-only.  Per user direction
// (2026-05-22): "for folk melodies, play chords even if it's melody only,
// use creative ways for chords — arpeggios and different rhythms that make
// sense, use melodic patterns for inspiration."
//
// inferChords() picks a diatonic triad per bar that best fits the melody
// in that bar.  buildAccompaniment() turns those chords into a flowing
// broken-chord / boom-chuck accompaniment whose figuration suits the meter
// (and varies per tune so it never sounds mechanical).

import { spellPc } from "./chordSymbols";
import { keySpecFor, keyIsFlat } from "./notation";
import type { TxExcerpt, TxChordRebased } from "./loader";

const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11], ionian: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10], aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};

interface Triad { rootPc: number; intervals: number[]; pcs: number[]; quality: string; degree: number }

/** The seven diatonic triads of a key, in scale-degree order. */
function diatonicTriads(tonicPc: number, mode: string): Triad[] {
  const scale = SCALES[mode.toLowerCase()] ?? SCALES.major;
  const out: Triad[] = [];
  for (let d = 0; d < 7; d++) {
    const third = (scale[(d + 2) % 7] - scale[d] + 12) % 12;
    const fifth = (scale[(d + 4) % 7] - scale[d] + 12) % 12;
    const rootPc = (tonicPc + scale[d]) % 12;
    const quality = third === 3 && fifth === 7 ? "m"
      : third === 4 && fifth === 7 ? ""
      : third === 3 && fifth === 6 ? "dim"
      : third === 4 && fifth === 8 ? "aug" : "";
    out.push({ rootPc, intervals: [0, third, fifth], pcs: [rootPc, (rootPc + third) % 12, (rootPc + fifth) % 12], quality, degree: d });
  }
  return out;
}

// Tie-break preference: I, V, IV, vi, ii, iii, vii°.
const DEGREE_RANK = [0, 4, 3, 5, 1, 2, 6];

/** Infer one diatonic chord per bar from the excerpt's melody. */
export function inferChords(ex: TxExcerpt): TxChordRebased[] {
  const triads = diatonicTriads(ex.item.key.tonicPc, ex.item.key.mode);
  const flat = keyIsFlat(keySpecFor(ex.item.key.tonicPc, ex.item.key.mode));
  const bpb = ex.beatsPerBar;
  const chords: TxChordRebased[] = [];
  let prevDegree = 0;

  for (let b = 0; b < ex.bars; b++) {
    const barStart = b * bpb, barEnd = (b + 1) * bpb;
    const notes = ex.melody.filter(n => n.startBeat < barEnd - 1e-6 && n.startBeat + n.durBeats > barStart + 1e-6);

    let best = triads[0], bestScore = -Infinity;
    for (const t of triads) {
      let score = 0;
      for (const n of notes) {
        const pc = ((n.midi % 12) + 12) % 12;
        const w = Math.min(n.durBeats, barEnd - n.startBeat);
        const onDownbeat = Math.abs(n.startBeat - barStart) < 1e-6;
        if (pc === t.pcs[0]) score += w * (onDownbeat ? 3 : 2);
        else if (pc === t.pcs[1] || pc === t.pcs[2]) score += w * (onDownbeat ? 1.6 : 1.2);
        else score -= w * 0.6;                       // non-chord tone penalty
      }
      // Gentle bias toward common functions + staying put.
      score += (7 - DEGREE_RANK.indexOf(t.degree)) * 0.05;
      if (t.degree === prevDegree) score += 0.15;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    prevDegree = best.degree;

    chords.push({
      sym: spellPc(best.rootPc, flat) + best.quality,
      rootPc: best.rootPc,
      intervals: best.intervals,
      startBeat: barStart,
      durBeats: bpb,
    });
  }
  // Merge identical neighbours into one held chord (cleaner symbols/voicing).
  const merged: TxChordRebased[] = [];
  for (const c of chords) {
    const last = merged[merged.length - 1];
    if (last && last.sym === c.sym) last.durBeats += c.durBeats;
    else merged.push({ ...c });
  }
  return merged;
}

export interface AccNote { midi: number; startBeat: number; durBeats: number; velocity: number }

/** Cheap deterministic hash → pattern choice per tune. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}

/** Voiced tones for a chord around C3–C4 plus a low bass root/fifth. */
function tones(rootPc: number, intervals: number[]) {
  const root = 48 + rootPc;                          // C3-ish register
  const third = root + (intervals[1] ?? 4);
  const fifth = root + (intervals[2] ?? 7);
  const octave = root + 12;
  let bass = 36 + rootPc;                             // C2-ish
  if (bass < 38) bass += 12;
  const bassFifth = bass + (intervals[2] ?? 7);
  return { root, third, fifth, octave, bass, bassFifth };
}

/** Build a meter-aware broken-chord accompaniment for a set of bar chords.
 *  Returns flat note events (beats are excerpt-relative, like the melody). */
export function buildAccompaniment(
  chords: TxChordRebased[], timeSig: [number, number], seed = "x",
): AccNote[] {
  const [num, den] = timeSig;
  const compound = den === 8 && num % 3 === 0;
  const out: AccNote[] = [];
  const variant = hash(seed) % 3;

  for (const c of chords) {
    const t = tones(c.rootPc, c.intervals);
    const span = c.durBeats;                          // quarter-beats
    const at = (off: number, midi: number, dur: number, vel: number) => {
      if (off < span - 1e-6) out.push({ midi, startBeat: c.startBeat + off, durBeats: Math.min(dur, span - off), velocity: vel });
    };

    if (compound) {
      // 6/8 (or 9/8): per dotted-quarter pulse → bass then two-eighth arpeggio.
      for (let p = 0; p < span; p += 1.5) {
        const low = p % 3 < 1e-6 ? t.bass : t.bassFifth;
        at(p, low, 0.5, 84);
        at(p + 0.5, t.third, 0.5, 60);
        at(p + 1.0, t.fifth, 0.5, 60);
      }
    } else if (num === 3 && den === 4) {
      // Waltz: bass on 1, chord stabs on 2 and 3.
      at(0, t.bass, 0.9, 84);
      at(1, t.third, 0.8, 58); at(1, t.fifth, 0.8, 58);
      at(2, t.bass + 12, 0.8, 60); at(2, t.fifth, 0.8, 56);
    } else {
      // Simple duple/quadruple — three flavours so tunes don't all sound alike.
      for (let beat = 0; beat < span; beat += 1) {
        const onBass = beat % 2 < 1e-6;
        if (variant === 0) {
          // Boom-chuck: bass on strong beats, chord stab on the off-beat eighth.
          at(beat, onBass ? t.bass : t.bassFifth, 0.5, onBass ? 84 : 70);
          at(beat + 0.5, t.third, 0.45, 56); at(beat + 0.5, t.fifth, 0.45, 56);
        } else if (variant === 1) {
          // Alberti-style broken chord in eighths: low-high-mid-high.
          at(beat, beat % 2 < 1e-6 ? t.bass : t.root, 0.5, 74);
          at(beat + 0.5, beat % 2 < 1e-6 ? t.fifth : t.octave, 0.5, 58);
        } else {
          // Running arpeggio in eighths cycling root-3-5-octave.
          const cyc = [t.root, t.third, t.fifth, t.octave];
          at(beat, beat === 0 ? t.bass : cyc[(beat * 2) % 4], 0.5, beat === 0 ? 82 : 64);
          at(beat + 0.5, cyc[(beat * 2 + 1) % 4], 0.5, 58);
        }
      }
    }
  }
  return out;
}
