// ── Accompaniment engine ────────────────────────────────────────────
//
// Two jobs:
//   1. harmonizeMelody() — when a tune has no chords (folk/trad), infer a
//      diatonic progression from the melody. Diatonic chord vocabulary +
//      chord tones come from `tonal` (the standard music-theory package);
//      we score each candidate against the melody notes per harmonic span.
//   2. compEvents() — turn a chord track into *idiomatic* accompaniment
//      events (not one block on beat 1): genre/metre-specific comping and
//      arpeggio patterns + a simple walking/root-fifth bass.
//
// Everything is 12-EDO; pitches are MIDI numbers (C4 = 60).

import type { TxChord, TxKey } from "./types";
import { spellPc } from "./chordSymbols";
import { Voicing, VoicingDictionary, VoiceLeading, Note } from "tonal";

/** Voice a chord with tonal's left-hand (rootless) jazz dictionary, voice-led
 *  from the previous voicing (minimal top-note motion). Returns MIDI notes.
 *  Falls back to a simple triad voicing for symbols tonal can't parse.
 *  When no bassist is present, the root is added underneath so the harmony
 *  is still grounded. */
function voicedChord(sym: string, rootPc: number, intervals: number[], prev: string[] | undefined, rootless: boolean): { midis: number[]; voicing: string[] | undefined } {
  const name = sym.split("/")[0];
  let v: string[] = [];
  try { v = Voicing.get(name, ["F3", "A4"], VoicingDictionary.lefthand, VoiceLeading.topNoteDiff, prev) ?? []; } catch { v = []; }
  let midis = v.map(n => Note.midi(n)).filter((m): m is number => m != null);
  if (!midis.length) { midis = voiceChord(rootPc, intervals); v = []; }
  if (!rootless) midis = [36 + (((rootPc % 12) + 12) % 12), ...midis];
  return { midis, voicing: v.length ? v : undefined };
}

// ── Diatonic vocabulary (self-contained, 12-EDO) ────────────────────
interface Cand { sym: string; rootPc: number; tones: number[]; intervals: number[]; degree: number }

// Scale-degree semitone offsets per mode.
const SCALE: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11], ionian: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10], aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};

/** The seven diatonic triads of a key, as scored candidates. */
function diatonicCandidates(key: TxKey): Cand[] {
  const scale = SCALE[key.mode.toLowerCase()] ?? SCALE.major;
  // Flat-preferring spelling for flat keys / minor modes.
  const flat = /min|aeol|dor|phry|locr/.test(key.mode) || [1, 3, 5, 8, 10].includes(key.tonicPc);
  const out: Cand[] = [];
  for (let d = 0; d < 7; d++) {
    const rootPc = (key.tonicPc + scale[d]) % 12;
    const thirdPc = (key.tonicPc + scale[(d + 2) % 7]) % 12;
    const fifthPc = (key.tonicPc + scale[(d + 4) % 7]) % 12;
    const third = ((thirdPc - rootPc) % 12 + 12) % 12;
    const fifth = ((fifthPc - rootPc) % 12 + 12) % 12;
    const quality = third === 3 && fifth === 7 ? "m" : third === 4 && fifth === 7 ? ""
      : third === 3 && fifth === 6 ? "dim" : third === 4 && fifth === 8 ? "aug" : "";
    out.push({
      sym: spellPc(rootPc, flat) + quality,
      rootPc,
      tones: [rootPc, thirdPc, fifthPc],
      intervals: [0, third, fifth],
      degree: d,
    });
  }
  return out;
}

interface MelNote { midi: number; startBeat: number; durBeats: number }

/** Infer a diatonic chord progression from a melody.  One chord per
 *  harmonic span (half-bar in 4/4-ish metres, whole bar otherwise),
 *  choosing the diatonic triad whose tones best cover the span's melody
 *  (weighted by duration + downbeat emphasis), with light functional
 *  bias toward I/IV/V and a cadential V/​I at the end. */
export function harmonizeMelody(
  melody: MelNote[], key: TxKey, beatsPerBar: number, bars: number,
): TxChord[] {
  if (!melody.length) return [];
  const cands = diatonicCandidates(key);
  if (!cands.length) return [];
  const spanBeats = beatsPerBar >= 4 ? beatsPerBar / 2 : beatsPerBar;
  const spans = Math.max(1, Math.round((bars * beatsPerBar) / spanBeats));
  const FUNCTIONAL_BONUS: Record<number, number> = { 0: 1.4, 4: 1.25, 3: 1.15, 5: 1.0 };

  const chords: TxChord[] = [];
  let prevDeg = -1;
  for (let s = 0; s < spans; s++) {
    const start = s * spanBeats;
    const end = start + spanBeats;
    // Weight each melody pitch-class present in this span.
    const weight = new Map<number, number>();
    for (const n of melody) {
      const ns = n.startBeat, ne = n.startBeat + n.durBeats;
      if (ne <= start + 1e-6 || ns >= end - 1e-6) continue;
      const overlap = Math.min(ne, end) - Math.max(ns, start);
      const onDownbeat = Math.abs(ns - start) < 1e-6;
      const pc = ((n.midi % 12) + 12) % 12;
      weight.set(pc, (weight.get(pc) ?? 0) + overlap * (onDownbeat ? 2 : 1));
    }
    let best = cands[0], bestScore = -Infinity;
    for (const c of cands) {
      let score = 0;
      for (const [pc, w] of weight) {
        if (c.tones.includes(pc)) score += w * (pc === c.rootPc ? 1.3 : 1);
      }
      score *= FUNCTIONAL_BONUS[c.degree] ?? 0.9;
      if (c.degree === prevDeg) score *= 0.85;            // gentle change-of-harmony nudge
      if (s === spans - 1 && c.degree === 0) score *= 1.5; // cadence onto tonic
      if (score > bestScore) { bestScore = score; best = c; }
    }
    prevDeg = best.degree;
    // Merge with previous span if same chord (longer held chord).
    const last = chords[chords.length - 1];
    if (last && last.sym === best.sym && Math.abs(last.startBeat + last.durBeats - start) < 1e-6) {
      last.durBeats += spanBeats;
    } else {
      chords.push({ sym: best.sym, rootPc: best.rootPc, intervals: best.intervals, startBeat: start, durBeats: spanBeats });
    }
  }
  return chords;
}

// ── Comping / arpeggio realization ──────────────────────────────────
export interface CompEvent { midi: number; startBeat: number; durBeats: number; velocity: number }
export interface Accompaniment { chord: CompEvent[]; bass: CompEvent[] }

export type CompGenre = "jazz" | "folk" | "pop" | "fusion";

/** Comp feel for an item, by source + style.  Weimar isn't all swing:
 *  funk/fusion/rock get a sparse, syncopated, space-leaving comp; latin a
 *  straight (pop) feel; everything else swings. */
export function compGenreFor(source: string, style?: string): CompGenre {
  if (source === "thesession" || source === "essen") return "folk";
  if (source === "cocopops") return "pop";
  // weimar
  if (style && /fusion|funk|jazz.?rock|rock|groove/i.test(style)) return "fusion";
  if (style && /latin|bossa|samba|calypso|afro|world/i.test(style)) return "pop";
  return "jazz";
}

/** Compact mid-register voicing (root, 3rd, 5th, [7th]) around C4. */
function voiceChord(rootPc: number, intervals: number[]): number[] {
  let base = 52 + rootPc;                 // E3..D#4
  if (base > 63) base -= 12;
  const reduced = [...new Set(intervals.map(i => ((i % 12) + 12) % 12))].sort((a, b) => a - b);
  return reduced.slice(0, 4).map(i => base + i);
}
const bassMidi = (pc: number) => 36 + (((pc % 12) + 12) % 12);   // C2..B2

type Hit = { at: number; dur: number; role: "bass" | "chord"; tone?: number };

// ── Comp rhythm vocabularies (chord-stab positions in quarter-beats) ──
// A bar picks ONE of these per chord-comp so the feel varies bar-to-bar
// instead of repeating a single canned rhythm.  Bass is generated
// separately (buildBass), so these are chord hits only.
type Stab = { at: number; dur: number };
const JAZZ_COMP: Stab[][] = [
  [{ at: 0, dur: 0.4 }, { at: 2.5, dur: 1.0 }],                       // Charleston
  [{ at: 1.5, dur: 0.4 }, { at: 3.5, dur: 0.5 }],                     // "and of 2", "and of 4"
  [{ at: 0.5, dur: 0.4 }, { at: 2, dur: 0.6 }],                       // "and of 1", beat 3
  [{ at: 1, dur: 0.4 }, { at: 3, dur: 0.4 }],                         // backbeat 2 & 4
  [{ at: 0, dur: 0.6 }, { at: 2.5, dur: 0.4 }, { at: 3.5, dur: 0.4 }],// 1, "and of 3", "and of 4"
  [{ at: 2, dur: 0.8 }],                                             // sparse: lay out, one push on 3
  [{ at: 0.5, dur: 0.4 }, { at: 1.5, dur: 0.4 }, { at: 3, dur: 0.4 }],// busier syncopation
  [{ at: 3.5, dur: 0.5 }],                                           // anticipate the next bar only
];
const POP_COMP: Stab[][] = [
  [{ at: 1, dur: 0.8 }, { at: 3, dur: 0.8 }],                         // backbeat
  [{ at: 0.5, dur: 0.4 }, { at: 1.5, dur: 0.4 }, { at: 2.5, dur: 0.4 }, { at: 3.5, dur: 0.4 }], // off-beat 8ths
  [{ at: 1, dur: 0.4 }, { at: 2, dur: 0.4 }, { at: 3, dur: 0.4 }],    // 2,3,4
  [{ at: 0, dur: 1.9 }],                                             // sustained pad
];
const FOLK_COMP: Stab[][] = [
  [{ at: 1, dur: 0.5 }, { at: 3, dur: 0.5 }],                         // off-beat chuck (bass on 1&3)
  [{ at: 1.5, dur: 0.4 }, { at: 3.5, dur: 0.4 }],                     // pushed chucks
  [{ at: 1, dur: 0.4 }, { at: 2, dur: 0.4 }, { at: 3, dur: 0.4 }],    // chord on 2,3,4
];
// Funk/fusion: sparse, syncopated, sustained — leaves space (incl. laying out).
const FUSION_COMP: Stab[][] = [
  [{ at: 0, dur: 1.4 }],                                              // pad held to "and of 2"
  [{ at: 0.5, dur: 0.4 }, { at: 2.5, dur: 0.4 }],                     // pushed offbeats
  [{ at: 1.5, dur: 0.4 }, { at: 3, dur: 0.9 }],                       // syncopation + held
  [{ at: 0, dur: 0.3 }, { at: 1.5, dur: 0.3 }, { at: 3.5, dur: 0.3 }],// 16th-ish stabs
  [{ at: 2, dur: 1.8 }],                                             // late entry, sustained
  [],                                                                // lay out (space is part of the groove)
];

const pick = <T,>(pool: T[], r: number): T => pool[Math.min(pool.length - 1, Math.floor(r * pool.length))];

/** One bar's chord-stab rhythm, varied per bar via `r` (0..1). */
function barPattern(genre: CompGenre, beatsPerBar: number, den: number, num: number, r: number): Hit[] {
  const compound = den === 8 && num % 3 === 0;
  if (compound) {
    // 6/8, 9/8 — chord on the two offbeats of each dotted-quarter pulse.
    const hits: Hit[] = [];
    for (let g = 0; g < beatsPerBar; g += 1.5) {
      hits.push({ at: g + 0.5, dur: 0.4, role: "chord" });
      hits.push({ at: g + 1.0, dur: 0.4, role: "chord" });
    }
    return hits;
  }
  if (beatsPerBar <= 3.0 + 1e-6 && beatsPerBar > 2.0 + 1e-6) {
    // 3/4 — usually pah-pah on 2 & 3, occasionally all three offbeats.
    return (r < 0.7 ? [{ at: 1, dur: 0.6 }, { at: 2, dur: 0.6 }]
      : [{ at: 1, dur: 0.4 }, { at: 2, dur: 0.4 }]).map(s => ({ ...s, role: "chord" as const }));
  }
  const pool = genre === "jazz" ? JAZZ_COMP : genre === "fusion" ? FUSION_COMP : genre === "pop" ? POP_COMP : FOLK_COMP;
  return pick(pool, r)
    .filter(s => s.at < beatsPerBar - 1e-6)
    .map(s => ({ at: s.at, dur: s.dur, role: "chord" as const }));
}

// Tiny deterministic RNG (mulberry32) so a tune's line varies bar-to-bar
// yet is identical each replay.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Place a pitch-class in the upright-bass register nearest to `prev` so the
 *  line moves by small steps instead of leaping octaves (the robotic feel). */
function nearBass(pc: number, prev: number): number {
  pc = ((pc % 12) + 12) % 12;
  let best = pc + 36, bd = Infinity;
  for (let m = 24; m <= 48; m += 12) {           // C1..C3 octaves
    const cand = m + pc;
    if (cand < 28 || cand > 52) continue;        // keep within E1..E3
    const d = Math.abs(cand - prev);
    if (d < bd) { bd = d; best = cand; }
  }
  return best;
}

/** A musical, voice-led bass line.  Jazz = walking line: root on each chord,
 *  chord tones / scale steps through the bar, a chromatic-or-step approach
 *  into the next chord's root, plus the occasional eighth-note skip.
 *  Folk/pop = root-led with fifths and passing tones.  Register is kept
 *  continuous (small steps) and lightly humanised, and a per-tune seed makes
 *  successive bars differ rather than repeating one canned shape. */
function buildBass(
  chords: TxChord[], genre: CompGenre, timeSig: [number, number], windowBeats: number,
): CompEvent[] {
  const out: CompEvent[] = [];
  if (!chords.length) return out;
  const [num, den] = timeSig;
  const compound = den === 8 && num % 3 === 0;
  const pulse = compound ? 1.5 : 1;
  const rand = makeRng(Math.round(chords.reduce((a, c) => a + c.rootPc * 31 + c.startBeat * 7, windowBeats * 13 + num)));

  const chordAt = (beat: number): TxChord => {
    let f = chords[0];
    for (const c of chords) { if (c.startBeat <= beat + 1e-6) f = c; else break; }
    return f;
  };
  const rootAfter = (beat: number): number => {
    for (const c of chords) if (c.startBeat > beat + 1e-6) return c.rootPc;
    return chords[chords.length - 1].rootPc;
  };

  let prev = 40;                                  // start around E2
  for (let beat = 0; beat < windowBeats - 1e-6; beat += pulse) {
    const ch = chordAt(beat);
    const tones = ch.intervals.map(i => (ch.rootPc + i) % 12);
    const onChordStart = Math.abs(beat - ch.startBeat) < 1e-6 || beat < 1e-6;
    const changeNext = chordAt(beat + pulse) !== ch || beat + pulse >= windowBeats - 1e-6;

    let pc: number;
    if (genre !== "jazz") {     // folk / pop / fusion: root-led bass, not walking
      if (onChordStart) pc = ch.rootPc;
      else if (changeNext && rand() < 0.5) pc = (rootAfter(beat) + (rand() < 0.5 ? 2 : 10)) % 12; // step into next
      else pc = rand() < 0.6 ? (ch.rootPc + 7) % 12 : (tones[1] ?? ch.rootPc);                     // fifth or third
    } else {
      if (onChordStart) pc = ch.rootPc;
      else if (changeNext) {
        const target = rootAfter(beat);
        pc = rand() < 0.6 ? (target + (rand() < 0.5 ? 1 : 11)) % 12     // chromatic approach
                          : (target + (rand() < 0.5 ? 2 : 10)) % 12;    // scale-step approach
      } else {
        const pool = tones.length > 1 ? tones.slice(1) : tones;        // 3rd/5th/(7th)
        pc = rand() < 0.25 ? (ch.rootPc + (rand() < 0.5 ? 2 : 9)) % 12  // scale passing tone
                           : pool[Math.floor(rand() * pool.length)];
      }
    }

    const midi = nearBass(pc, prev);
    prev = midi;
    const vel = (onChordStart ? 80 : 70) + Math.floor(rand() * 7) - 3;

    if (genre === "jazz" && !onChordStart && !changeNext && rand() < 0.2) {
      // eighth-note skip: a quick stepwise passing note for life
      out.push({ midi, startBeat: beat, durBeats: pulse * 0.5, velocity: vel });
      const stepMidi = nearBass((pc + (rand() < 0.5 ? 2 : 10)) % 12, midi);
      out.push({ midi: stepMidi, startBeat: beat + pulse * 0.5, durBeats: pulse * 0.5, velocity: vel - 10 });
      prev = stepMidi;
    } else {
      out.push({ midi, startBeat: beat, durBeats: pulse * 0.92, velocity: vel });
    }
  }
  return out;
}

/** Realize a chord track into idiomatic accompaniment events.
 *  `rootless` = a bassist is present, so the chord voicing omits the root
 *  (rootless left-hand voicings); otherwise the root is added underneath. */
export function compEvents(
  chords: TxChord[], genre: CompGenre, beatsPerBar: number, timeSig: [number, number], windowBeats: number, rootless = false,
): Accompaniment {
  const [num, den] = timeSig;
  const out: Accompaniment = { chord: [], bass: [] };
  if (!chords.length) return out;

  // Voice every chord up front, voice-led (minimal motion) from the prior one.
  let prevV: string[] | undefined;
  const voicings = chords.map(c => {
    const r = voicedChord(c.sym, c.rootPc, c.intervals, prevV, rootless);
    if (r.voicing) prevV = r.voicing;
    return r.midis;
  });
  const indexAt = (beat: number): number => {
    let idx = 0;
    for (let i = 0; i < chords.length; i++) { if (chords[i].startBeat <= beat + 1e-6) idx = i; else break; }
    return idx;
  };
  const stab = (beat: number, dur: number, vel: number) => {
    if (beat >= windowBeats - 1e-6) return;
    for (const m of voicings[indexAt(beat)]) out.chord.push({ midi: m, startBeat: beat, durBeats: dur, velocity: vel });
  };

  // Comp rhythm: a varied (seeded) stab pattern per bar.
  const totalBars = Math.max(1, Math.round(windowBeats / beatsPerBar));
  const rand = makeRng(Math.round(chords.reduce((a, c) => a + c.rootPc * 17 + c.startBeat, windowBeats * 7 + num)));
  for (let bar = 0; bar < totalBars; bar++) {
    const barStart = bar * beatsPerBar;
    for (const h of barPattern(genre, beatsPerBar, den, num, rand())) {
      if (h.role === "chord") stab(barStart + h.at, h.dur, 56);
    }
  }
  // Guarantee every chord is actually heard: a stab on each chord's onset that
  // a sparse/lay-out pattern would otherwise leave silent.
  for (let i = 0; i < chords.length; i++) {
    const cb = chords[i].startBeat;
    if (cb < windowBeats - 1e-6 && !out.chord.some(e => Math.abs(e.startBeat - cb) < 0.2)) stab(cb, 0.6, 52);
  }

  out.bass = buildBass(chords, genre, timeSig, windowBeats);
  return out;
}
