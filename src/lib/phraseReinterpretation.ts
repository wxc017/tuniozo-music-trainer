// ── Phrase Reinterpretation Engines ─────────────────────────────────────────
// Musical transformation functions for phrase decomposition mode.
// All operations return new DecomposedPhrase instances (immutable transforms).

import type {
  DecomposedPhrase, DecomposedNote, ChordFunction,
  ChordQuality, ParsedChord,
} from "./phraseDecompositionData";
import {
  parsePitch, pcName, analyzePhrase, parseChordName,
  QUALITY_INTERVALS, intervalToFunctionDetailed,
} from "./phraseDecompositionData";
import type { Duration, MeasureTimeSig } from "./noteEntryData";
import { DURATION_SLOTS, measureSlots } from "./noteEntryData";

// ── ID generator ────────────────────────────────────────────────────────────

let _rid = 1;
function rid(): string { return `ri_${Date.now()}_${_rid++}`; }

// ── Scale System ────────────────────────────────────────────────────────────

export type ScaleType =
  | "ionian" | "dorian" | "phrygian" | "lydian" | "mixolydian" | "aeolian" | "locrian"
  | "melodicMinor" | "dorianB2" | "lydianAug" | "lydianDom" | "mixolydianB6" | "locrianN2" | "altered"
  | "dimHW" | "dimWH" | "wholeTone"
  | "majPent" | "minPent" | "blues"
  | "bebopDom" | "bebopMaj"
  | "chromatic";

export const SCALE_DISPLAY: Record<ScaleType, string> = {
  ionian: "Ionian (Major)", dorian: "Dorian", phrygian: "Phrygian",
  lydian: "Lydian", mixolydian: "Mixolydian", aeolian: "Aeolian (Minor)", locrian: "Locrian",
  melodicMinor: "Melodic Minor", dorianB2: "Dorian b2", lydianAug: "Lydian Aug",
  lydianDom: "Lydian Dom", mixolydianB6: "Mixolydian b6", locrianN2: "Locrian #2", altered: "Altered",
  dimHW: "Dim (HW)", dimWH: "Dim (WH)", wholeTone: "Whole Tone",
  majPent: "Maj Pent", minPent: "Min Pent", blues: "Blues",
  bebopDom: "Bebop Dom", bebopMaj: "Bebop Maj", chromatic: "Chromatic",
};

export const SCALE_INTERVALS: Record<ScaleType, number[]> = {
  ionian:       [0, 2, 4, 5, 7, 9, 11],
  dorian:       [0, 2, 3, 5, 7, 9, 10],
  phrygian:     [0, 1, 3, 5, 7, 8, 10],
  lydian:       [0, 2, 4, 6, 7, 9, 11],
  mixolydian:   [0, 2, 4, 5, 7, 9, 10],
  aeolian:      [0, 2, 3, 5, 7, 8, 10],
  locrian:      [0, 1, 3, 5, 6, 8, 10],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  dorianB2:     [0, 1, 3, 5, 7, 9, 10],
  lydianAug:    [0, 2, 4, 6, 8, 9, 11],
  lydianDom:    [0, 2, 4, 6, 7, 9, 10],
  mixolydianB6: [0, 2, 4, 5, 7, 8, 10],
  locrianN2:    [0, 2, 3, 5, 6, 8, 10],
  altered:      [0, 1, 3, 4, 6, 8, 10],
  dimHW:        [0, 1, 3, 4, 6, 7, 9, 10],
  dimWH:        [0, 2, 3, 5, 6, 8, 9, 11],
  wholeTone:    [0, 2, 4, 6, 8, 10],
  majPent:      [0, 2, 4, 7, 9],
  minPent:      [0, 3, 5, 7, 10],
  blues:        [0, 3, 5, 6, 7, 10],
  bebopDom:     [0, 2, 4, 5, 7, 9, 10, 11],
  bebopMaj:     [0, 2, 4, 5, 7, 8, 9, 11],
  chromatic:    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export const QUALITY_DEFAULT_SCALE: Record<ChordQuality, ScaleType> = {
  maj: "ionian", min: "dorian", dom7: "mixolydian", maj7: "ionian", min7: "dorian",
  dim: "locrian", dim7: "dimHW", m7b5: "locrian", aug: "wholeTone",
  minMaj7: "melodicMinor", aug7: "wholeTone", sus4: "mixolydian", sus2: "mixolydian",
  dom9: "mixolydian", maj9: "ionian", min9: "dorian",
  dom13: "mixolydian", min11: "dorian", dom7alt: "altered",
  "6": "ionian", min6: "dorian",
};

// ── Pitch / MIDI helpers ────────────────────────────────────────────────────

const PC_NAMES = ["c", "c#", "d", "eb", "e", "f", "f#", "g", "ab", "a", "bb", "b"];

function pitchToMidi(pitch: string): number | null {
  const p = parsePitch(pitch);
  if (!p) return null;
  return p.octave * 12 + p.pc;
}

function midiToPitch(midi: number): string {
  const octave = Math.floor(midi / 12);
  const pc = ((midi % 12) + 12) % 12;
  return `${PC_NAMES[pc]}/${octave}`;
}

function midiToAccidental(midi: number): "b" | "#" | undefined {
  const pc = ((midi % 12) + 12) % 12;
  if (pc === 1 || pc === 6) return "#";
  if (pc === 3 || pc === 8 || pc === 10) return "b";
  return undefined;
}

export function getScalePcs(rootPc: number, scaleType: ScaleType): number[] {
  return SCALE_INTERVALS[scaleType].map(i => (rootPc + i) % 12);
}

export function getChordScale(chord: ParsedChord, scaleOverride?: ScaleType): ScaleType {
  return scaleOverride ?? QUALITY_DEFAULT_SCALE[chord.quality];
}

/**
 * Transpose a MIDI note by N scale degrees within a given scale.
 * Handles octave wrapping correctly using scale-relative octaves.
 */
function transposeDiatonicMidi(
  midi: number, rootPc: number, scaleType: ScaleType, steps: number,
): number {
  const intervals = SCALE_INTERVALS[scaleType];
  const scaleLen = intervals.length;
  const pc = ((midi % 12) + 12) % 12;
  const intervalFromRoot = ((pc - rootPc) % 12 + 12) % 12;

  // Find current scale degree (nearest if not exact)
  let degree = intervals.indexOf(intervalFromRoot);
  if (degree === -1) {
    let bestDist = 99;
    for (let i = 0; i < scaleLen; i++) {
      const dist = Math.min(
        Math.abs(intervals[i] - intervalFromRoot),
        12 - Math.abs(intervals[i] - intervalFromRoot),
      );
      if (dist < bestDist) { bestDist = dist; degree = i; }
    }
  }

  // Compute scale-relative octave (not MIDI octave)
  const scaleOctave = Math.round((midi - rootPc - intervals[degree]) / 12);

  // New degree with octave wrapping
  const rawNewDeg = degree + steps;
  const newDeg = ((rawNewDeg % scaleLen) + scaleLen) % scaleLen;
  const octShift = Math.floor(rawNewDeg / scaleLen);

  return (scaleOctave + octShift) * 12 + rootPc + intervals[newDeg];
}

// ── Solfege System ──────────────────────────────────────────────────────────

export const SOLFEGE_SYLLABLES = [
  "Do", "Ra", "Re", "Me", "Mi", "Fa", "Fi", "Sol", "Le", "La", "Te", "Ti",
] as const;

/** All solfege labels (including enharmonic alternates) for SVG text matching */
export const SOLFEGE_ALL = new Set([
  "Do", "Ra", "Re", "Me", "Ri", "Mi", "Fa", "Fi", "Sol", "Le", "Si", "La", "Li", "Te", "Ti",
]);

/** Moveable-do solfege syllable for an interval from chord root. */
export function getSolfege(interval: number, quality?: ChordQuality): string {
  const s = ((interval % 12) + 12) % 12;
  const isMinor = quality
    ? QUALITY_INTERVALS[quality].includes(3) && !QUALITY_INTERVALS[quality].includes(4)
    : false;
  switch (s) {
    case 0:  return "Do";
    case 1:  return "Ra";
    case 2:  return "Re";
    case 3:  return isMinor ? "Me" : "Ri";
    case 4:  return "Mi";
    case 5:  return "Fa";
    case 6:  return "Fi";
    case 7:  return "Sol";
    case 8:  return "Le";
    case 9:  return "La";
    case 10: return "Te";
    case 11: return "Ti";
    default: return "?";
  }
}

/** Get solfege for a note relative to its active chord root */
export function noteSolfege(note: DecomposedNote, chord: ParsedChord | null): string {
  if (note.isRest || !chord) return "";
  const p = parsePitch(note.pitch);
  if (!p) return "";
  const interval = ((p.pc - chord.rootPc) % 12 + 12) % 12;
  return getSolfege(interval, chord.quality);
}

// ── Clone / rebuild helpers ─────────────────────────────────────────────────

function clonePhrase(p: DecomposedPhrase): DecomposedPhrase {
  return { ...p, notes: p.notes.map(n => ({ ...n })), chords: p.chords.map(c => ({ ...c })) };
}

function noteWithNewPitch(note: DecomposedNote, midi: number): DecomposedNote {
  return {
    ...note,
    id: rid(),
    pitch: midiToPitch(midi),
    accidental: midiToAccidental(midi),
  };
}

function halveDuration(dur: Duration): Duration {
  const map: Record<Duration, Duration> = { w: "h", h: "q", q: "8", "8": "16", "16": "32", "32": "32" };
  return map[dur];
}

function doubleDuration(dur: Duration): Duration {
  const map: Record<Duration, Duration> = { "32": "16", "16": "8", "8": "q", q: "h", h: "w", w: "w" };
  return map[dur];
}

/** Reflow notes sequentially into measures based on durations */
function reflowNotes(
  notes: DecomposedNote[],
  timeSig: MeasureTimeSig,
): { notes: DecomposedNote[]; barCount: number } {
  const barSlots = measureSlots(timeSig);
  const result: DecomposedNote[] = [];
  let currentSlot = 0;
  let currentBar = 0;

  for (const note of notes) {
    const slots = DURATION_SLOTS[note.duration] * (note.dotted ? 1.5 : 1);
    if (currentSlot + slots > barSlots) {
      currentBar++;
      currentSlot = 0;
    }
    result.push({ ...note, measure: currentBar, startSlot: Math.round(currentSlot) });
    currentSlot += slots;
  }
  return { notes: result, barCount: currentBar + 1 };
}

function slotsToBestDuration(slots: number): Duration | null {
  const map: [number, Duration][] = [[32, "w"], [16, "h"], [8, "q"], [4, "8"], [2, "16"], [1, "32"]];
  for (const [s, d] of map) { if (s <= slots) return d; }
  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// TRANSFORMATION ENGINES
// ═════════════════════════════════════════════════════════════════════════════

// ── 1. DIATONIC TRANSPOSITION ───────────────────────────────────────────────

export function diatonicTranspose(
  phrase: DecomposedPhrase,
  steps: number,
  scaleOverride?: ScaleType,
  lockedBars?: Set<number>,
): DecomposedPhrase {
  const result = clonePhrase(phrase);
  result.notes = result.notes.map(note => {
    if (note.isRest || lockedBars?.has(note.measure)) return note;
    const chord = phrase.chords[note.activeChordIdx];
    if (!chord?.parsed) return note;
    const midi = pitchToMidi(note.pitch);
    if (midi === null) return note;
    const scale = getChordScale(chord.parsed, scaleOverride);
    const newMidi = transposeDiatonicMidi(midi, chord.parsed.rootPc, scale, steps);
    return noteWithNewPitch(note, newMidi);
  });
  result.notes = analyzePhrase(result);
  return result;
}

// ── 2. CHROMATIC TRANSPOSITION ──────────────────────────────────────────────

export function chromaticTranspose(
  phrase: DecomposedPhrase,
  semitones: number,
  lockedBars?: Set<number>,
): DecomposedPhrase {
  const result = clonePhrase(phrase);
  result.notes = result.notes.map(note => {
    if (note.isRest || lockedBars?.has(note.measure)) return note;
    const midi = pitchToMidi(note.pitch);
    if (midi === null) return note;
    return noteWithNewPitch(note, midi + semitones);
  });
  result.notes = analyzePhrase(result);
  return result;
}

// ── 3. SEQUENCE / PATTERN REPEAT ────────────────────────────────────────────

export type SequenceType = "diatonic" | "chromatic";

export function sequencePhrase(
  phrase: DecomposedPhrase,
  count: number,
  interval: number,
  type: SequenceType,
  scaleOverride?: ScaleType,
): DecomposedPhrase {
  const result = clonePhrase(phrase);
  const origNotes = phrase.notes
    .filter(n => !n.isRest)
    .sort((a, b) => a.measure - b.measure || a.startSlot - b.startSlot);
  const origRests = phrase.notes.filter(n => n.isRest);
  const origBarCount = phrase.barCount;
  const allNotes: DecomposedNote[] = [...result.notes];

  for (let rep = 1; rep <= count; rep++) {
    const transAmount = interval * rep;
    for (const note of origNotes) {
      const midi = pitchToMidi(note.pitch);
      if (midi === null) continue;
      let newMidi: number;
      if (type === "chromatic") {
        newMidi = midi + transAmount;
      } else {
        const chord = phrase.chords[note.activeChordIdx];
        if (!chord?.parsed) { newMidi = midi + transAmount; } else {
          const scale = getChordScale(chord.parsed, scaleOverride);
          newMidi = transposeDiatonicMidi(midi, chord.parsed.rootPc, scale, transAmount);
        }
      }
      allNotes.push({
        ...noteWithNewPitch(note, newMidi),
        measure: note.measure + origBarCount * rep,
        activeChordIdx: Math.min(note.activeChordIdx, phrase.chords.length - 1),
      });
    }
    for (const note of origRests) {
      allNotes.push({ ...note, id: rid(), measure: note.measure + origBarCount * rep });
    }
  }

  result.notes = allNotes;
  result.barCount = origBarCount * (count + 1);
  result.notes = analyzePhrase(result);
  return result;
}

// ── 4. INTERVAL EXPANSION / COMPRESSION ─────────────────────────────────────

export type IntervalMode = "expand" | "compress" | "invert" | "mirror";

export function transformIntervals(
  phrase: DecomposedPhrase,
  mode: IntervalMode,
  factor: number = 2,
  lockedBars?: Set<number>,
): DecomposedPhrase {
  const result = clonePhrase(phrase);
  const nonRest = result.notes
    .filter(n => !n.isRest && !lockedBars?.has(n.measure))
    .sort((a, b) => a.measure - b.measure || a.startSlot - b.startSlot);

  if (nonRest.length < 2) return result;

  const midis = nonRest.map(n => pitchToMidi(n.pitch)).filter((m): m is number => m !== null);
  if (midis.length < 2) return result;

  const anchor = midis[0];
  const newMidis: number[] = [anchor];

  for (let i = 1; i < midis.length; i++) {
    switch (mode) {
      case "expand":
        newMidis.push(newMidis[i - 1] + Math.round((midis[i] - midis[i - 1]) * factor));
        break;
      case "compress":
        newMidis.push(newMidis[i - 1] + Math.round((midis[i] - midis[i - 1]) / factor));
        break;
      case "invert":
        newMidis.push(newMidis[i - 1] + -(midis[i] - midis[i - 1]));
        break;
      case "mirror":
        newMidis.push(anchor - (midis[i] - anchor));
        break;
    }
  }

  // Clamp all to reasonable range
  const clamped = newMidis.map(m => Math.max(24, Math.min(96, m)));

  let midiIdx = 0;
  result.notes = result.notes.map(note => {
    if (note.isRest || lockedBars?.has(note.measure)) return note;
    if (midiIdx >= clamped.length) return note;
    return noteWithNewPitch(note, clamped[midiIdx++]);
  });

  result.notes = analyzePhrase(result);
  return result;
}

// ── 5. CONTOUR PRESERVATION ─────────────────────────────────────────────────

export function contourPreserve(
  phrase: DecomposedPhrase,
  scaleOverride?: ScaleType,
  lockedBars?: Set<number>,
): DecomposedPhrase {
  const result = clonePhrase(phrase);
  const nonRest = result.notes
    .filter(n => !n.isRest && !lockedBars?.has(n.measure))
    .sort((a, b) => a.measure - b.measure || a.startSlot - b.startSlot);

  if (nonRest.length < 2) return result;

  const midis = nonRest.map(n => pitchToMidi(n.pitch)).filter((m): m is number => m !== null);
  if (midis.length < 2) return result;

  // Extract contour: +1 up, 0 same, -1 down
  const contour: number[] = [];
  for (let i = 1; i < midis.length; i++) contour.push(Math.sign(midis[i] - midis[i - 1]));

  // Build scale MIDI ladder from active chord
  const firstChord = phrase.chords[nonRest[0].activeChordIdx];
  if (!firstChord?.parsed) return result;
  const scale = getChordScale(firstChord.parsed, scaleOverride);
  const scalePcs = SCALE_INTERVALS[scale];
  const rootPc = firstChord.parsed.rootPc;
  const baseOctave = Math.floor(midis[0] / 12);

  const scaleMidis: number[] = [];
  for (let oct = baseOctave - 2; oct <= baseOctave + 3; oct++) {
    for (const si of scalePcs) scaleMidis.push(oct * 12 + rootPc + si);
  }
  scaleMidis.sort((a, b) => a - b);

  // Start near original first note
  let currentIdx = scaleMidis.findIndex(m => m >= midis[0]);
  if (currentIdx === -1) currentIdx = scaleMidis.length - 1;

  const newMidis: number[] = [scaleMidis[currentIdx]];
  for (const dir of contour) {
    if (dir > 0) currentIdx = Math.min(currentIdx + 1, scaleMidis.length - 1);
    else if (dir < 0) currentIdx = Math.max(currentIdx - 1, 0);
    newMidis.push(scaleMidis[currentIdx]);
  }

  let midiIdx = 0;
  result.notes = result.notes.map(note => {
    if (note.isRest || lockedBars?.has(note.measure)) return note;
    if (midiIdx >= newMidis.length) return note;
    return noteWithNewPitch(note, newMidis[midiIdx++]);
  });

  result.notes = analyzePhrase(result);
  return result;
}

// ── 6. CHORD TONE TARGET SHIFT ──────────────────────────────────────────────

const FUNC_TO_SEMI: Record<string, number> = {
  root: 0, "b9": 1, "9": 2, "#9": 3, "b3": 3, "3": 4,
  "11": 5, "#11": 6, "b5": 6, "5": 7, "#5": 8, "b13": 8,
  "13": 9, "b7": 10, "7": 11,
};

export function chordToneTargetShift(
  phrase: DecomposedPhrase,
  targetFunctions: ChordFunction[],
  lockedBars?: Set<number>,
): DecomposedPhrase {
  const result = clonePhrase(phrase);
  let targetIdx = 0;

  result.notes = result.notes.map(note => {
    if (note.isRest || lockedBars?.has(note.measure)) return note;
    const chord = phrase.chords[note.activeChordIdx];
    if (!chord?.parsed) return note;
    const fn = targetFunctions[targetIdx % targetFunctions.length];
    targetIdx++;
    const semi = FUNC_TO_SEMI[fn];
    if (semi === undefined) return note;
    const p = parsePitch(note.pitch);
    if (!p) return note;
    const newPc = (chord.parsed.rootPc + semi) % 12;
    return { ...noteWithNewPitch(note, p.octave * 12 + newPc), chordFunction: fn };
  });

  result.notes = analyzePhrase(result);
  return result;
}

// ── 7. SCALE REINTERPRETATION ───────────────────────────────────────────────

export function scaleReinterpret(
  phrase: DecomposedPhrase,
  newScale: ScaleType,
  lockedBars?: Set<number>,
): DecomposedPhrase {
  const result = clonePhrase(phrase);

  result.notes = result.notes.map(note => {
    if (note.isRest || lockedBars?.has(note.measure)) return note;
    const chord = phrase.chords[note.activeChordIdx];
    if (!chord?.parsed) return note;

    const origScale = QUALITY_DEFAULT_SCALE[chord.parsed.quality];
    const origIntervals = SCALE_INTERVALS[origScale];
    const newIntervals = SCALE_INTERVALS[newScale];

    const p = parsePitch(note.pitch);
    if (!p) return note;
    const interval = ((p.pc - chord.parsed.rootPc) % 12 + 12) % 12;

    // Find degree in original scale (nearest match)
    let degree = origIntervals.indexOf(interval);
    if (degree === -1) {
      let bestDist = 99;
      for (let i = 0; i < origIntervals.length; i++) {
        const dist = Math.min(Math.abs(origIntervals[i] - interval), 12 - Math.abs(origIntervals[i] - interval));
        if (dist < bestDist) { bestDist = dist; degree = i; }
      }
    }

    // Map same degree to new scale
    const newDegree = degree % newIntervals.length;
    const newPc = (chord.parsed.rootPc + newIntervals[newDegree]) % 12;
    return noteWithNewPitch(note, p.octave * 12 + newPc);
  });

  result.notes = analyzePhrase(result);
  return result;
}

// ── 8. REHARMONIZATION ──────────────────────────────────────────────────────

export type ReharmMode = "tritoneSub" | "backdoor" | "secondaryDom" | "relativeMinor" | "modalSwap" | "parallelMinor";

export const REHARM_DISPLAY: Record<ReharmMode, string> = {
  tritoneSub: "Tritone Sub", backdoor: "Backdoor", secondaryDom: "Secondary Dom",
  relativeMinor: "Relative Min/Maj", modalSwap: "Modal Swap", parallelMinor: "Parallel Minor",
};

const QUALITY_DISPLAY_SHORT: Record<ChordQuality, string> = {
  maj: "", min: "m", dom7: "7", maj7: "maj7", min7: "m7",
  dim: "dim", dim7: "dim7", m7b5: "m7b5", aug: "aug",
  minMaj7: "mMaj7", aug7: "aug7", sus4: "sus4", sus2: "sus2",
  dom9: "9", maj9: "maj9", min9: "m9",
  dom13: "13", min11: "m11", dom7alt: "7alt",
  "6": "6", min6: "m6",
};

export function reharmonize(
  phrase: DecomposedPhrase,
  mode: ReharmMode,
): DecomposedPhrase {
  const result = clonePhrase(phrase);

  result.chords = result.chords.map(chord => {
    if (!chord.parsed) return chord;
    const { rootPc, quality } = chord.parsed;
    let newRootPc = rootPc;
    let newQuality: ChordQuality = quality;

    switch (mode) {
      case "tritoneSub":
        newRootPc = (rootPc + 6) % 12;
        if (!["dom7", "dom9", "dom13"].includes(quality)) newQuality = "dom7";
        break;
      case "backdoor":
        if (["dom7", "dom9"].includes(quality)) {
          newRootPc = (rootPc + 10) % 12;
          newQuality = "dom7";
        }
        break;
      case "secondaryDom":
        newRootPc = (rootPc + 7) % 12;
        newQuality = "dom7";
        break;
      case "relativeMinor":
        if (["maj", "maj7", "maj9", "6"].includes(quality)) {
          newRootPc = (rootPc + 9) % 12; newQuality = "min7";
        } else if (["min", "min7", "min9"].includes(quality)) {
          newRootPc = (rootPc + 3) % 12; newQuality = "maj7";
        }
        break;
      case "modalSwap":
        if (quality === "maj7") newQuality = "min7";
        else if (quality === "min7") newQuality = "maj7";
        else if (quality === "dom7") newQuality = "min7";
        else if (quality === "maj") newQuality = "min";
        else if (quality === "min") newQuality = "maj";
        break;
      case "parallelMinor":
        if (["maj", "maj7"].includes(quality)) newQuality = "min7";
        else if (quality === "dom7") newQuality = "m7b5";
        break;
    }

    const useFlats = [1, 3, 5, 6, 8, 10].includes(newRootPc);
    const rootName = pcName(newRootPc, useFlats);
    const newChordName = rootName + (QUALITY_DISPLAY_SHORT[newQuality] ?? "");
    const newParsed = parseChordName(newChordName);
    return { ...chord, chordName: newChordName, parsed: newParsed };
  });

  result.notes = analyzePhrase(result);
  return result;
}

// ── 9. NOTE INSERTION (Passing / Enclosure / Chromatic) ─────────────────────

export type InsertMode = "diatonicPassing" | "chromaticPassing" | "enclosure" | "doubleChromatic";

export function insertNotes(
  phrase: DecomposedPhrase,
  mode: InsertMode,
  scaleOverride?: ScaleType,
): DecomposedPhrase {
  const result = clonePhrase(phrase);
  const nonRest = result.notes
    .filter(n => !n.isRest)
    .sort((a, b) => a.measure - b.measure || a.startSlot - b.startSlot);

  if (nonRest.length < 2) return result;

  const newNotes: DecomposedNote[] = [];

  for (let i = 0; i < nonRest.length; i++) {
    const note = nonRest[i];
    const nextNote = nonRest[i + 1];
    const halved = halveDuration(note.duration);
    newNotes.push({ ...note, id: rid(), duration: halved, dotted: false });

    if (!nextNote) continue;
    const midi = pitchToMidi(note.pitch);
    const nextMidi = pitchToMidi(nextNote.pitch);
    if (midi === null || nextMidi === null) continue;

    const chord = phrase.chords[note.activeChordIdx];
    let insertedMidis: number[] = [];

    switch (mode) {
      case "diatonicPassing": {
        if (!chord?.parsed) break;
        const scale = getChordScale(chord.parsed, scaleOverride);
        const dir = nextMidi > midi ? 1 : -1;
        const newMidi = transposeDiatonicMidi(midi, chord.parsed.rootPc, scale, dir);
        insertedMidis = [newMidi];
        break;
      }
      case "chromaticPassing": {
        const dir = nextMidi > midi ? 1 : -1;
        insertedMidis = [midi + dir];
        break;
      }
      case "enclosure":
        insertedMidis = [nextMidi + 1, nextMidi - 1];
        break;
      case "doubleChromatic": {
        const dir = nextMidi > midi ? 1 : -1;
        insertedMidis = [nextMidi - dir * 2, nextMidi - dir];
        break;
      }
    }

    for (const im of insertedMidis) {
      newNotes.push({ ...noteWithNewPitch(note, im), duration: halved, dotted: false });
    }
  }

  const reflowed = reflowNotes(newNotes, phrase.timeSig);
  result.notes = reflowed.notes;
  result.barCount = reflowed.barCount;
  result.notes = analyzePhrase(result);
  return result;
}

// ── 10. SIMPLIFY ────────────────────────────────────────────────────────────

export type SimplifyMode = "nonChordTones" | "everyOther" | "weakBeats";

export function simplifyPhrase(
  phrase: DecomposedPhrase,
  mode: SimplifyMode,
  lockedBars?: Set<number>,
): DecomposedPhrase {
  const result = clonePhrase(phrase);
  const sorted = [...result.notes].sort((a, b) => a.measure - b.measure || a.startSlot - b.startSlot);

  let keep: DecomposedNote[];
  switch (mode) {
    case "nonChordTones":
      keep = sorted.filter(n => {
        if (n.isRest || lockedBars?.has(n.measure)) return true;
        const fn = n.chordFunction;
        return fn === "root" || fn === "3" || fn === "b3" || fn === "5" || fn === "7" || fn === "b7";
      });
      break;
    case "everyOther":
      keep = sorted.filter((n, i) => {
        if (n.isRest || lockedBars?.has(n.measure)) return true;
        return i % 2 === 0;
      });
      break;
    case "weakBeats": {
      const beatSlots = 32 / phrase.timeSig.den;
      keep = sorted.filter(n => {
        if (n.isRest || lockedBars?.has(n.measure)) return true;
        return Math.floor(n.startSlot / beatSlots) % 2 === 0;
      });
      break;
    }
  }

  // Extend durations to fill gaps
  const extended = keep.map((note, i) => {
    if (i >= keep.length - 1 || note.measure !== keep[i + 1].measure) return note;
    const gap = keep[i + 1].startSlot - note.startSlot;
    const bestDur = slotsToBestDuration(gap);
    return bestDur ? { ...note, duration: bestDur, dotted: false } : note;
  });

  result.notes = extended;
  result.notes = analyzePhrase(result);
  return result;
}

// ── 11. FRAGMENT ────────────────────────────────────────────────────────────

export type FragmentMode = "firstN" | "lastN" | "random" | "perBar" | "perBeat";

export function fragmentPhrase(
  phrase: DecomposedPhrase,
  mode: FragmentMode,
  length: number,
): DecomposedPhrase {
  const result = clonePhrase(phrase);
  const nonRest = result.notes
    .filter(n => !n.isRest)
    .sort((a, b) => a.measure - b.measure || a.startSlot - b.startSlot);

  let selected: DecomposedNote[];
  switch (mode) {
    case "firstN":
      selected = nonRest.slice(0, length);
      break;
    case "lastN":
      selected = nonRest.slice(-length);
      break;
    case "random": {
      const start = Math.floor(Math.random() * Math.max(1, nonRest.length - length));
      selected = nonRest.slice(start, start + length);
      break;
    }
    case "perBar": {
      const byBar = new Map<number, DecomposedNote[]>();
      for (const n of nonRest) {
        const arr = byBar.get(n.measure) ?? [];
        arr.push(n);
        byBar.set(n.measure, arr);
      }
      selected = [];
      for (const [, barNotes] of byBar) selected.push(...barNotes.slice(0, length));
      break;
    }
    case "perBeat": {
      const beatSlots = 32 / phrase.timeSig.den;
      const seen = new Set<string>();
      selected = nonRest.filter(n => {
        const key = `${n.measure}-${Math.floor(n.startSlot / beatSlots)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      break;
    }
  }

  const reflowed = reflowNotes(selected, phrase.timeSig);
  result.notes = reflowed.notes;
  result.barCount = reflowed.barCount;
  result.notes = analyzePhrase(result);
  return result;
}

// ── 12. ROTATION ────────────────────────────────────────────────────────────

export function rotatePhrase(
  phrase: DecomposedPhrase,
  steps: number,
): DecomposedPhrase {
  const result = clonePhrase(phrase);
  const nonRest = result.notes
    .filter(n => !n.isRest)
    .sort((a, b) => a.measure - b.measure || a.startSlot - b.startSlot);

  if (nonRest.length === 0) return result;
  const n = nonRest.length;
  const shift = ((steps % n) + n) % n;
  const pitches = nonRest.map(note => ({ pitch: note.pitch, accidental: note.accidental }));
  const rotated = [...pitches.slice(shift), ...pitches.slice(0, shift)];

  let pitchIdx = 0;
  result.notes = result.notes.map(note => {
    if (note.isRest) return note;
    const rp = rotated[pitchIdx++];
    if (!rp) return note;
    return { ...note, id: rid(), pitch: rp.pitch, accidental: rp.accidental };
  });

  result.notes = analyzePhrase(result);
  return result;
}

// ── 13. RETROGRADE ──────────────────────────────────────────────────────────

export function reversePhrase(phrase: DecomposedPhrase): DecomposedPhrase {
  const result = clonePhrase(phrase);
  const nonRest = result.notes
    .filter(n => !n.isRest)
    .sort((a, b) => a.measure - b.measure || a.startSlot - b.startSlot);

  if (nonRest.length === 0) return result;
  const pitches = nonRest.map(n => ({ pitch: n.pitch, accidental: n.accidental }));
  pitches.reverse();

  let pitchIdx = 0;
  result.notes = result.notes.map(note => {
    if (note.isRest) return note;
    const rp = pitches[pitchIdx++];
    if (!rp) return note;
    return { ...note, id: rid(), pitch: rp.pitch, accidental: rp.accidental };
  });

  result.notes = analyzePhrase(result);
  return result;
}

// ── 14. REGISTER / OCTAVE ───────────────────────────────────────────────────

export type RegisterMode = "shiftAll" | "random" | "spread" | "compress";

export function registerShift(
  phrase: DecomposedPhrase,
  mode: RegisterMode,
  octaves: number = 1,
  lockedBars?: Set<number>,
): DecomposedPhrase {
  const result = clonePhrase(phrase);

  // Pre-compute center pitch for spread mode
  const allMidis = result.notes
    .filter(n => !n.isRest)
    .map(n => pitchToMidi(n.pitch))
    .filter((m): m is number => m !== null);
  const avg = allMidis.length > 0 ? allMidis.reduce((a, b) => a + b, 0) / allMidis.length : 60;

  result.notes = result.notes.map(note => {
    if (note.isRest || lockedBars?.has(note.measure)) return note;
    const midi = pitchToMidi(note.pitch);
    if (midi === null) return note;
    let newMidi: number;
    switch (mode) {
      case "shiftAll":  newMidi = midi + octaves * 12; break;
      case "random":    newMidi = midi + (Math.floor(Math.random() * 3) - 1) * 12; break;
      case "spread":    newMidi = Math.round(avg + (midi - avg) * 2); break;
      case "compress":  newMidi = 48 + (((midi % 12) + 12) % 12); break;
    }
    return noteWithNewPitch(note, Math.max(24, Math.min(96, newMidi)));
  });

  result.notes = analyzePhrase(result);
  return result;
}

// ── 15. GROUPING REINTERPRETATION ───────────────────────────────────────────

export type GroupingPattern = "3+3+2" | "4+4" | "5+3" | "3+5" | "2+2+2+2" | "3+2+3" | "2+3+3";

export const GROUPING_PRESETS: { key: GroupingPattern; label: string; groups: number[] }[] = [
  { key: "2+2+2+2", label: "2+2+2+2", groups: [2, 2, 2, 2] },
  { key: "3+3+2",   label: "3+3+2",   groups: [3, 3, 2] },
  { key: "3+2+3",   label: "3+2+3",   groups: [3, 2, 3] },
  { key: "2+3+3",   label: "2+3+3",   groups: [2, 3, 3] },
  { key: "4+4",     label: "4+4",     groups: [4, 4] },
  { key: "5+3",     label: "5+3",     groups: [5, 3] },
  { key: "3+5",     label: "3+5",     groups: [3, 5] },
];

export function computeGroupingAccents(noteCount: number, groups: number[]): Set<number> {
  const accented = new Set<number>();
  let idx = 0;
  let gi = 0;
  while (idx < noteCount) {
    accented.add(idx);
    idx += groups[gi % groups.length];
    gi++;
  }
  return accented;
}

// ── 16. TARGET BEAT SHIFT ───────────────────────────────────────────────────

export function targetBeatShift(
  phrase: DecomposedPhrase,
  lockedBars?: Set<number>,
): DecomposedPhrase {
  const result = clonePhrase(phrase);
  const beatSlots = 32 / phrase.timeSig.den;
  const barSlotCount = measureSlots(phrase.timeSig);

  // Per-bar: separate chord tones and non-chord tones
  for (let bar = 0; bar < phrase.barCount; bar++) {
    if (lockedBars?.has(bar)) continue;
    const barNotes = result.notes
      .filter(n => n.measure === bar && !n.isRest)
      .sort((a, b) => a.startSlot - b.startSlot);

    if (barNotes.length === 0) continue;

    const chordTones: DecomposedNote[] = [];
    const others: DecomposedNote[] = [];
    for (const n of barNotes) {
      const fn = n.chordFunction;
      const isCT = fn === "root" || fn === "3" || fn === "b3" || fn === "5" || fn === "7" || fn === "b7";
      (isCT ? chordTones : others).push(n);
    }

    // Build slot assignment: chord tones get strong beats first
    const slots: number[] = [];
    for (let s = 0; s < barSlotCount; s += beatSlots) slots.push(s);
    // Add remaining slots for non-chord tones
    for (let s = 0; s < barSlotCount; s += Math.floor(beatSlots / 2)) {
      if (!slots.includes(s)) slots.push(s);
    }

    const allOrdered = [...chordTones, ...others];
    for (let i = 0; i < allOrdered.length && i < slots.length; i++) {
      allOrdered[i].startSlot = slots[i];
    }
  }

  result.notes = analyzePhrase(result);
  return result;
}

// ── 17. APPROACH NOTE GENERATOR ─────────────────────────────────────────────

export type ApproachMode = "above" | "below" | "enclosure" | "doubleChromatic" | "diatonic";

export function addApproachNotes(
  phrase: DecomposedPhrase,
  mode: ApproachMode,
  scaleOverride?: ScaleType,
): DecomposedPhrase {
  if (mode === "enclosure") return insertNotes(phrase, "enclosure", scaleOverride);
  if (mode === "doubleChromatic") return insertNotes(phrase, "doubleChromatic", scaleOverride);
  if (mode === "diatonic") return insertNotes(phrase, "diatonicPassing", scaleOverride);

  // "above" or "below": add chromatic approach before each chord tone
  const result = clonePhrase(phrase);
  const sorted = result.notes
    .filter(n => !n.isRest)
    .sort((a, b) => a.measure - b.measure || a.startSlot - b.startSlot);

  const newNotes: DecomposedNote[] = [];
  for (const note of sorted) {
    const fn = note.chordFunction;
    const isTarget = fn === "root" || fn === "3" || fn === "b3" || fn === "5" || fn === "7" || fn === "b7";
    if (isTarget) {
      const midi = pitchToMidi(note.pitch);
      if (midi !== null) {
        const approachMidi = mode === "above" ? midi + 1 : midi - 1;
        const halved = halveDuration(note.duration);
        newNotes.push({ ...noteWithNewPitch(note, approachMidi), duration: halved, dotted: false });
        newNotes.push({ ...note, id: rid(), duration: halved, dotted: false });
        continue;
      }
    }
    newNotes.push(note);
  }

  const reflowed = reflowNotes(newNotes, phrase.timeSig);
  result.notes = reflowed.notes;
  result.barCount = reflowed.barCount;
  result.notes = analyzePhrase(result);
  return result;
}

// ── 18. MOTIVIC DEVELOPMENT ─────────────────────────────────────────────────

export type MotifTransform = "sequence" | "invert" | "transpose" | "augment" | "diminish";

export function motivicDevelopment(
  phrase: DecomposedPhrase,
  motifLength: number,
  transform: MotifTransform,
  repeatCount: number,
  scaleOverride?: ScaleType,
): DecomposedPhrase {
  const result = clonePhrase(phrase);
  const nonRest = result.notes
    .filter(n => !n.isRest)
    .sort((a, b) => a.measure - b.measure || a.startSlot - b.startSlot);

  const motif = nonRest.slice(0, motifLength);
  if (motif.length === 0) return result;

  const motifMidis = motif.map(n => pitchToMidi(n.pitch)).filter((m): m is number => m !== null);
  if (motifMidis.length === 0) return result;

  const allNotes: DecomposedNote[] = [...motif.map(n => ({ ...n, id: rid() }))];

  for (let rep = 1; rep <= repeatCount; rep++) {
    let newMidis: number[];
    switch (transform) {
      case "sequence": {
        const chord = phrase.chords[motif[0].activeChordIdx];
        if (chord?.parsed) {
          const scale = getChordScale(chord.parsed, scaleOverride);
          newMidis = motifMidis.map(m =>
            transposeDiatonicMidi(m, chord.parsed!.rootPc, scale, rep),
          );
        } else {
          newMidis = motifMidis.map(m => m + rep * 2);
        }
        break;
      }
      case "invert": {
        const anchor = motifMidis[0];
        newMidis = motifMidis.map(m => anchor - (m - anchor) + (rep - 1) * 2);
        break;
      }
      case "transpose":
        newMidis = motifMidis.map(m => m + rep * 2);
        break;
      case "augment":
      case "diminish":
        newMidis = motifMidis;
        break;
    }

    for (let i = 0; i < motif.length && i < newMidis.length; i++) {
      let dur = motif[i].duration;
      if (transform === "augment") dur = doubleDuration(dur);
      if (transform === "diminish") dur = halveDuration(dur);
      allNotes.push({
        ...noteWithNewPitch(motif[i], newMidis[i]),
        duration: dur,
        dotted: false,
      });
    }
  }

  const reflowed = reflowNotes(allNotes, phrase.timeSig);
  result.notes = reflowed.notes;
  result.barCount = reflowed.barCount;
  result.notes = analyzePhrase(result);
  return result;
}

// ── 19. DENSITY ─────────────────────────────────────────────────────────────

export type DensityMode = "double" | "half" | "fill" | "sparse";

export function changeDensity(
  phrase: DecomposedPhrase,
  mode: DensityMode,
  scaleOverride?: ScaleType,
  lockedBars?: Set<number>,
): DecomposedPhrase {
  if (mode === "sparse") return simplifyPhrase(phrase, "nonChordTones", lockedBars);

  const result = clonePhrase(phrase);

  if (mode === "double" || mode === "fill") {
    const nonRest = result.notes
      .filter(n => !n.isRest && !lockedBars?.has(n.measure))
      .sort((a, b) => a.measure - b.measure || a.startSlot - b.startSlot);

    const newNotes: DecomposedNote[] = [];
    for (const note of nonRest) {
      const halved = halveDuration(note.duration);
      newNotes.push({ ...note, id: rid(), duration: halved, dotted: false });
      // Add scale neighbor
      const chord = phrase.chords[note.activeChordIdx];
      if (chord?.parsed) {
        const scale = getChordScale(chord.parsed, scaleOverride);
        const midi = pitchToMidi(note.pitch);
        if (midi !== null) {
          const neighborMidi = transposeDiatonicMidi(midi, chord.parsed.rootPc, scale, 1);
          newNotes.push({ ...noteWithNewPitch(note, neighborMidi), duration: halved, dotted: false });
        }
      }
    }
    // Include locked bar notes unchanged
    for (const note of result.notes) {
      if (lockedBars?.has(note.measure)) newNotes.push(note);
    }
    const sorted = newNotes.sort((a, b) => a.measure - b.measure || a.startSlot - b.startSlot);
    const reflowed = reflowNotes(sorted, phrase.timeSig);
    result.notes = reflowed.notes;
    result.barCount = reflowed.barCount;
  } else {
    // half: remove every other non-chord-tone
    let skipNext = false;
    result.notes = result.notes
      .sort((a, b) => a.measure - b.measure || a.startSlot - b.startSlot)
      .filter(note => {
        if (note.isRest || lockedBars?.has(note.measure)) return true;
        const fn = note.chordFunction;
        if (fn === "root" || fn === "3" || fn === "b3" || fn === "5") { skipNext = false; return true; }
        skipNext = !skipNext;
        return !skipNext;
      });
  }

  result.notes = analyzePhrase(result);
  return result;
}

// ── 20. STYLE PRESETS ───────────────────────────────────────────────────────

export type StylePreset =
  | "bebop" | "coltrane" | "tristano" | "barryHarris"
  | "modern" | "outside" | "pentatonic" | "chromaticStyle"
  | "guideTone";

export const STYLE_PRESET_DISPLAY: Record<StylePreset, string> = {
  bebop: "Bebop", coltrane: "Coltrane", tristano: "Tristano",
  barryHarris: "Barry Harris", modern: "Modern", outside: "Outside",
  pentatonic: "Pentatonic", chromaticStyle: "Chromatic", guideTone: "Guide Tone",
};

export function applyStylePreset(
  phrase: DecomposedPhrase,
  style: StylePreset,
): DecomposedPhrase {
  switch (style) {
    case "bebop":
      return addApproachNotes(scaleReinterpret(phrase, "bebopDom"), "enclosure");
    case "coltrane":
      return scaleReinterpret(transformIntervals(phrase, "expand", 1.5), "lydian");
    case "tristano":
      return insertNotes(transformIntervals(phrase, "invert"), "chromaticPassing");
    case "barryHarris":
      return diatonicTranspose(scaleReinterpret(phrase, "dimHW"), 2);
    case "modern":
      return scaleReinterpret(transformIntervals(phrase, "expand", 2), "altered");
    case "outside":
      return chromaticTranspose(reharmonize(phrase, "tritoneSub"), 1);
    case "pentatonic":
      return scaleReinterpret(phrase, "majPent");
    case "chromaticStyle":
      return insertNotes(scaleReinterpret(phrase, "chromatic"), "chromaticPassing");
    case "guideTone":
      return simplifyPhrase(phrase, "nonChordTones");
  }
}

// ── Operation metadata for UI ───────────────────────────────────────────────

export type ReinterpretationOp =
  | "diatonicTranspose" | "chromaticTranspose" | "sequence"
  | "intervalTransform" | "contourPreserve"
  | "chordToneShift" | "scaleReinterpret" | "reharmonize"
  | "insertNotes" | "approachNotes"
  | "simplify" | "fragment" | "rotate" | "reverse" | "density" | "registerShift"
  | "grouping" | "targetBeatShift"
  | "motivicDev" | "stylePreset";

export const REINTERPRETATION_OPS: { key: ReinterpretationOp; label: string; group: string }[] = [
  { key: "diatonicTranspose",  label: "Diatonic Transpose",      group: "Pitch" },
  { key: "chromaticTranspose", label: "Chromatic Transpose",     group: "Pitch" },
  { key: "sequence",           label: "Sequence / Repeat",       group: "Pitch" },
  { key: "intervalTransform",  label: "Interval Transform",      group: "Pitch" },
  { key: "contourPreserve",    label: "Contour Preserve",        group: "Pitch" },
  { key: "scaleReinterpret",   label: "Scale Reinterpretation",  group: "Harmony" },
  { key: "chordToneShift",     label: "Chord Tone Target",       group: "Harmony" },
  { key: "reharmonize",        label: "Reharmonization",         group: "Harmony" },
  { key: "insertNotes",        label: "Insert Passing Notes",    group: "Ornament" },
  { key: "approachNotes",      label: "Approach Notes",          group: "Ornament" },
  { key: "simplify",           label: "Simplify",                group: "Structure" },
  { key: "fragment",           label: "Fragment",                group: "Structure" },
  { key: "rotate",             label: "Rotate",                  group: "Structure" },
  { key: "reverse",            label: "Retrograde",              group: "Structure" },
  { key: "density",            label: "Density",                 group: "Structure" },
  { key: "registerShift",      label: "Register / Octave",       group: "Structure" },
  { key: "grouping",           label: "Grouping",                group: "Rhythm" },
  { key: "targetBeatShift",    label: "Target Beat Shift",       group: "Rhythm" },
  { key: "motivicDev",         label: "Motivic Development",     group: "Advanced" },
  { key: "stylePreset",        label: "Style Preset",            group: "Presets" },
];
