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

/** Previous voicing state carried chord-to-chord so successive comps voice-
 *  lead instead of re-spelling root-position triads each bar. */
interface PrevVoicing {
  /** Tonal voicing strings, for the jazz path's `Voicing.get` continuity
   *  (minimal top-note motion across LH voicings). */
  voicing?: string[];
  /** Raw MIDI notes of the last comp, for the folk/pop path's nearest-octave
   *  voice leading. */
  midis?: number[];
}

/** Voice a chord for comping, genre-appropriately AND voice-led from the prior
 *  chord so successive comps trace a coherent line rather than block-jumping:
 *   • jazz / fusion → tonal's left-hand (rootless) dictionary, voice-led via
 *     `VoiceLeading.topNoteDiff` (minimal top-note motion).  3rd/7th carry the
 *     harmony, the bass (or the ear) supplies the root.
 *   • folk / pop → triad placed at the nearest-octave inversion to the previous
 *     voicing's notes (greedy per-pc voice leading), staying in the typical
 *     guitar-comp register (top ≤ E4).
 *  No octave-low root is ever added on the chord instrument: that produced an
 *  inaudible super-bassy note and piled deep ledger lines under the staff.
 *  In the jazz withRoot case, the root is anchored separately in low bass
 *  register (C2-B2) per two-hand voicing pedagogy. */
function voicedChord(sym: string, rootPc: number, intervals: number[], prev: PrevVoicing | undefined, genre: CompGenre, withRoot: boolean): { midis: number[]; voicing: string[] | undefined } {
  if (genre === "jazz" || genre === "fusion") {
    const name = sym.split("/")[0];
    let v: string[] = [];
    // Idiomatic Bill-Evans-style left-hand comping register (E3–G4): the LH
    // sits in the middle of the keyboard, well clear of the upright bass below
    // and the soloist above.  The old C3–E4 range was too low — voicings
    // collided with the bass register, muddying the harmony.
    try { v = Voicing.get(name, ["E3", "G4"], VoicingDictionary.lefthand, VoiceLeading.topNoteDiff, prev?.voicing) ?? []; } catch { v = []; }
    const midis = v.map(n => Note.midi(n)).filter((m): m is number => m != null);
    if (midis.length) {
      // Rootless voicings assume a bass supplies the root.  With NO bass line,
      // add a two-hand-voicing bass root — anchored in a fixed low register
      // (C2-B2 / MIDI 36-47) regardless of where the RH voicing sits.
      //
      // Per standard piano pedagogy (Mark Levine, Bill Evans, Barry Harris):
      // the LH root stays in bass register and the RH chord floats above.
      // Tracking the RH up the keyboard would lift the root out of bass
      // register and lose the bass function.  The gap between root and RH
      // ends up as whatever the RH voice leading dictates (a 10th, an 11th,
      // 2 octaves) — never a fixed octave shadow.
      if (withRoot) {
        const pc = ((rootPc % 12) + 12) % 12;
        const rootMidi = 36 + pc;                       // C2..B2
        return { midis: [rootMidi, ...midis], voicing: v };
      }
      return { midis, voicing: v };
    }
  }
  // Folk / pop (and any jazz symbol tonal can't parse): triad voice-led from
  // the previous comp's midis.
  return { midis: voiceChord(rootPc, intervals, prev?.midis), voicing: undefined };
}

/** The voiced pitches (MIDI) of each chord, voice-led exactly as compEvents
 *  plays them — so the notated chord voicing matches what's heard.  `withRoot`
 *  adds the root to jazz voicings (when there's no bass line to supply it). */
export function chordVoicings(chords: { sym: string; rootPc: number; intervals: number[] }[], genre: CompGenre, withRoot: boolean): number[][] {
  const prev: PrevVoicing = {};
  return chords.map(c => {
    const r = voicedChord(c.sym, c.rootPc, c.intervals, prev, genre, withRoot);
    if (r.voicing) prev.voicing = r.voicing;
    prev.midis = r.midis;
    return r.midis;
  });
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
  if (source.startsWith("blues") || source === "drums") return "jazz";   // (audio-only; comp unused)

  // weimar
  if (style && /fusion|funk|jazz.?rock|rock|groove/i.test(style)) return "fusion";
  if (style && /latin|bossa|samba|calypso|afro|world/i.test(style)) return "pop";
  return "jazz";
}

/** Voice-led triad placement for folk/pop comping.
 *
 *  First chord (no prev) anchors at a typical guitar-comp midpoint (F3 ≈ MIDI
 *  53), placing each pitch class at its closest octave.  Successive chords
 *  voice-lead — for every pitch class in the new chord, pick the octave that
 *  minimizes the leap to ANY note of the previous voicing.  This is a greedy
 *  approximation of optimal voice leading: between e.g. C and F it'll
 *  naturally pick C-F-A (sec. inv. of F: C stays, E→F, G→A — total 3
 *  semitones) over root-position F-A-C (15 semitones of parallel motion).
 *
 *  Output is clamped to the typical guitar/folk comp register (top ≤ E4 / MIDI
 *  64) so voice-leading drift across many chords doesn't push the chord into
 *  the melody's space. */
function voiceChord(rootPc: number, intervals: number[], prev?: number[]): number[] {
  const pcs = [...new Set(intervals.map(i => ((rootPc + i) % 12 + 12) % 12))].slice(0, 4);
  // Anchor target: previous voicing's midpoint, or F3 (MIDI 53) on first chord.
  const target = prev && prev.length
    ? prev.reduce((s, m) => s + m, 0) / prev.length
    : 53;
  const place = (pc: number): number => {
    let best = pc + 48, bd = Infinity;
    // Try each octave from C2..C6; prefer the placement closest to the
    // previous voicing (any note) — falls back to closest-to-target when
    // there's no prev.
    for (let oct = 2; oct <= 5; oct++) {
      const m = oct * 12 + pc;
      const d = prev && prev.length
        ? Math.min(...prev.map(p => Math.abs(m - p)))
        : Math.abs(m - target);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  };
  let chord = pcs.map(place).sort((a, b) => a - b);
  // Clamp the top to E4 (MIDI 64) so voice-leading drift over many chords
  // doesn't lift the comp into the melody's range.
  let guard = 0;
  while (Math.max(...chord) > 64 && guard++ < 4) chord = chord.map(n => n - 12);
  return chord;
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
    // Bass velocity dropped from 80/70 → 68/58 so the upright doesn't bury
    // the comp.  Real jazz mixes put bass and piano comp roughly equal under
    // the soloist; the prior 80/70 vs comp ~58 left the bass ~10 dB louder.
    const vel = (onChordStart ? 68 : 58) + Math.floor(rand() * 7) - 3;

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

/** Realize a chord track into idiomatic accompaniment events.  Voicings are
 *  genre-appropriate (jazz/fusion = rootless left-hand, folk/pop = triads);
 *  no octave-low root is added — the bass line (when present) grounds it. */
export function compEvents(
  chords: TxChord[], genre: CompGenre, beatsPerBar: number, timeSig: [number, number], windowBeats: number,
  withRoot = true,
): Accompaniment {
  const [num, den] = timeSig;
  const out: Accompaniment = { chord: [], bass: [] };
  if (!chords.length) return out;

  // Voice every chord up front, voice-led (minimal motion) from the prior one.
  // `withRoot` adds the root to jazz voicings when no bass line will supply it.
  // PrevVoicing carries BOTH the tonal voicing strings (jazz Voicing.get) and
  // the prior MIDIs (folk/pop voiceChord) so both paths voice-lead correctly.
  const prev: PrevVoicing = {};
  const voicings = chords.map(c => {
    const r = voicedChord(c.sym, c.rootPc, c.intervals, prev, genre, withRoot);
    if (r.voicing) prev.voicing = r.voicing;
    prev.midis = r.midis;
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

  // Comp rhythm: a real comper holds ONE feel across the phrase, not a fresh
  // random rhythm every bar.  Pick a single pattern for the whole excerpt
  // (coherent groove), and only the final bar of a longer excerpt may vary as a
  // light turnaround.  Variation across the excerpt comes from the chord changes
  // (the guaranteed onset stabs below) + voice-led voicings + the walking bass.
  const totalBars = Math.max(1, Math.round(windowBeats / beatsPerBar));
  const rand = makeRng(Math.round(chords.reduce((a, c) => a + c.rootPc * 17 + c.startBeat, windowBeats * 7 + num)));
  const feel = rand();                         // one comp feel for the excerpt
  for (let bar = 0; bar < totalBars; bar++) {
    const barStart = bar * beatsPerBar;
    const r = (bar === totalBars - 1 && totalBars >= 4) ? rand() : feel;
    for (const h of barPattern(genre, beatsPerBar, den, num, r)) {
      if (h.role === "chord") stab(barStart + h.at, h.dur, 56);
    }
  }
  // Guarantee every chord is actually heard: a stab on each chord's onset that
  // a sparse/lay-out pattern would otherwise leave silent.
  for (let i = 0; i < chords.length; i++) {
    const cb = chords[i].startBeat;
    if (cb < windowBeats - 1e-6 && !out.chord.some(e => Math.abs(e.startBeat - cb) < 0.2)) stab(cb, 0.6, 52);
  }

  // Comping rarely articulates a chord on the very next beat after the chord
  // changed on a strong beat (the unusual "chord on 1 and 2").  Drop any stab
  // exactly one beat after a chord change that isn't itself a change.
  const isChangeAt = (b: number) => chords.some(c => Math.abs(c.startBeat - b) < 0.15);
  out.chord = out.chord.filter(e => !(isChangeAt(e.startBeat - 1) && !isChangeAt(e.startBeat)));

  out.bass = buildBass(chords, genre, timeSig, windowBeats);
  return out;
}
