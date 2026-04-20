// ── Phrase Decomposition Data Layer ──────────────────────────────────────────
// Types, chord analysis, tension pools, and rhythm permutation utilities.

import type { Duration, NoteData, MeasureTimeSig } from "./noteEntryData";
import { DURATION_SLOTS, noteSlots, measureSlots } from "./noteEntryData";

// ── Pitch helpers (12-TET) ──────────────────────────────────────────────────

const NOTE_TO_SEMI: Record<string, number> = {
  c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11,
};

/** Parse NoteData pitch string like "c/4", "eb/5", "f#/3" → { pc: 0-11, octave } */
export function parsePitch(pitch: string): { pc: number; octave: number } | null {
  const m = pitch.match(/^([a-g])(b|#|n)?\/(\d+)$/i);
  if (!m) return null;
  const base = NOTE_TO_SEMI[m[1].toLowerCase()];
  if (base === undefined) return null;
  let pc = base;
  if (m[2] === "#") pc = (pc + 1) % 12;
  else if (m[2] === "b") pc = (pc + 11) % 12;
  return { pc, octave: parseInt(m[3], 10) };
}

/** Pitch class name from pc number (sharps preferred) */
const PC_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const PC_NAMES_FLAT  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export function pcName(pc: number, preferFlats = false): string {
  const n = ((pc % 12) + 12) % 12;
  return preferFlats ? PC_NAMES_FLAT[n] : PC_NAMES_SHARP[n];
}

// ── Chord quality definitions ───────────────────────────────────────────────

export type ChordQuality =
  | "maj" | "min" | "dom7" | "maj7" | "min7"
  | "dim" | "dim7" | "m7b5" | "aug"
  | "minMaj7" | "aug7" | "sus4" | "sus2"
  | "dom9" | "maj9" | "min9"
  | "dom13" | "min11" | "dom7alt"
  | "6" | "min6";

/** Intervals in semitones that define each chord quality */
export const QUALITY_INTERVALS: Record<ChordQuality, number[]> = {
  maj:     [0, 4, 7],
  min:     [0, 3, 7],
  dom7:    [0, 4, 7, 10],
  maj7:    [0, 4, 7, 11],
  min7:    [0, 3, 7, 10],
  dim:     [0, 3, 6],
  dim7:    [0, 3, 6, 9],
  m7b5:    [0, 3, 6, 10],
  aug:     [0, 4, 8],
  minMaj7: [0, 3, 7, 11],
  aug7:    [0, 4, 8, 10],
  sus4:    [0, 5, 7],
  sus2:    [0, 2, 7],
  dom9:    [0, 4, 7, 10, 14],
  maj9:    [0, 4, 7, 11, 14],
  min9:    [0, 3, 7, 10, 14],
  dom13:   [0, 4, 7, 10, 14, 21],
  min11:   [0, 3, 7, 10, 14, 17],
  dom7alt: [0, 4, 7, 10],
  "6":     [0, 4, 7, 9],
  min6:    [0, 3, 7, 9],
};

// ── Chord function labels ───────────────────────────────────────────────────

export type ChordFunction =
  | "root" | "b9" | "9" | "#9"
  | "b3" | "3" | "11" | "#11"
  | "b5" | "5" | "#5" | "b13"
  | "13" | "b7" | "7"
  | "non-chord";

/**
 * Map semitone interval (0-11) to a chord function label.
 * Context-sensitive: uses quality to decide ambiguous intervals.
 */
export function intervalToFunction(semitones: number, quality: ChordQuality): ChordFunction {
  const s = ((semitones % 12) + 12) % 12;
  const qi = QUALITY_INTERVALS[quality];
  const isMinor = qi.includes(3) && !qi.includes(4); // has b3, no natural 3
  const hasFlatSeven = qi.includes(10);
  const hasNatSeven = qi.includes(11);
  const hasFlatFive = qi.includes(6);

  switch (s) {
    case 0:  return "root";
    case 1:  return "b9";
    case 2:  return "9";
    case 3:  return isMinor ? "b3" : "#9";
    case 4:  return "3";
    case 5:  return "11";
    case 6:  return hasFlatFive ? "b5" : "#11";
    case 7:  return "5";
    case 8:  return "#5"; // or b13 — prefer #5 for aug, b13 for dom context
    case 9:  return "13";
    case 10: return hasFlatSeven ? "b7" : "b7";
    case 11: return hasNatSeven ? "7" : "7";
    default: return "non-chord";
  }
}

// Alias: b13 vs #5 disambiguation
export function intervalToFunctionDetailed(semitones: number, quality: ChordQuality): ChordFunction {
  const base = intervalToFunction(semitones, quality);
  // In dominant contexts, prefer b13 over #5
  if (base === "#5" && QUALITY_INTERVALS[quality].includes(10)) return "b13";
  return base;
}

// ── Chord parsing ───────────────────────────────────────────────────────────

const CHORD_ROOT_RE = /^([A-Ga-g])(b|#)?/;

const QUALITY_ALIASES: [RegExp, ChordQuality][] = [
  [/^maj9/i,         "maj9"],
  [/^maj7/i,         "maj7"],
  [/^m(?:in)?Maj7/i, "minMaj7"],
  [/^m(?:in)?9/i,    "min9"],
  [/^m(?:in)?7b5/i,  "m7b5"],
  [/^m(?:in)?7/i,    "min7"],
  [/^m(?:in)?6/i,    "min6"],
  [/^m(?:in)?11/i,   "min11"],
  [/^m(?:in)?(?![a-z])/i, "min"],
  [/^dim7/i,         "dim7"],
  [/^dim/i,          "dim"],
  [/^aug7/i,         "aug7"],
  [/^aug|\+/i,       "aug"],
  [/^sus4/i,         "sus4"],
  [/^sus2/i,         "sus2"],
  [/^13/i,           "dom13"],
  [/^9/i,            "dom9"],
  [/^7alt/i,         "dom7alt"],
  [/^7/i,            "dom7"],
  [/^6/i,            "6"],
  [/^Δ7?/i,          "maj7"],
  [/^ø7?/i,          "m7b5"],
  [/^°7/i,           "dim7"],
  [/^°/i,            "dim"],
];

export interface ParsedChord {
  root: string;     // e.g. "C", "Eb", "F#"
  rootPc: number;   // 0-11
  quality: ChordQuality;
  display: string;  // original input cleaned
}

export function parseChordName(input: string): ParsedChord | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const rm = trimmed.match(CHORD_ROOT_RE);
  if (!rm) return null;
  const rootLetter = rm[1].toUpperCase();
  const rootAcc = rm[2] || "";
  const root = rootLetter + rootAcc;
  const base = NOTE_TO_SEMI[rootLetter.toLowerCase()];
  if (base === undefined) return null;
  let rootPc = base;
  if (rootAcc === "#") rootPc = (rootPc + 1) % 12;
  else if (rootAcc === "b") rootPc = (rootPc + 11) % 12;

  const rest = trimmed.slice(rm[0].length);
  let quality: ChordQuality = "maj";
  if (rest.length > 0) {
    for (const [re, q] of QUALITY_ALIASES) {
      if (re.test(rest)) { quality = q; break; }
    }
  }

  return { root, rootPc, quality, display: trimmed };
}

// ── Tension pools ───────────────────────────────────────────────────────────

export type TensionPool = "stable" | "avoid" | "both";

/** Stable tensions: chord tones + available (non-clashing) extensions */
function stableTensions(quality: ChordQuality): number[] {
  const qi = QUALITY_INTERVALS[quality];
  const ct = qi.map(i => ((i % 12) + 12) % 12);
  const isMinor = ct.includes(3) && !ct.includes(4);
  const isDom = ct.includes(4) && ct.includes(10);
  const isMaj7 = ct.includes(4) && ct.includes(11);

  if (isMaj7)  return [...ct, 2, 6, 9];     // 9, #11, 13
  if (isMinor) return [...ct, 2, 5, 9];     // 9, 11, 13
  if (isDom)   return [...ct, 2, 9];         // 9, 13
  return [...ct, 2, 5, 9];
}

/** Avoid notes: intervals that clash with chord tones (half-step above a chord tone) */
function avoidTensions(quality: ChordQuality): number[] {
  const qi = QUALITY_INTERVALS[quality];
  const ct = new Set(qi.map(i => ((i % 12) + 12) % 12));
  const stable = new Set(stableTensions(quality));
  const avoid: number[] = [];
  for (let i = 0; i < 12; i++) {
    if (!stable.has(i)) avoid.push(i);
  }
  return avoid;
}

/** Get available tensions for a chord quality and pool type.
 *  Returns array of semitone intervals from root. */
export function getTensionPool(quality: ChordQuality, pool: TensionPool): number[] {
  if (pool === "stable") return stableTensions(quality);
  if (pool === "avoid") return avoidTensions(quality);
  return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // both
}

/** Classify a chord function as stable or avoid */
export function tensionCategory(fn: ChordFunction, quality: ChordQuality): "stable" | "avoid" {
  const semi = functionToSemitonesExport(fn);
  if (semi === null) return "avoid";
  const stable = new Set(stableTensions(quality));
  return stable.has(semi) ? "stable" : "avoid";
}

function functionToSemitonesExport(fn: ChordFunction): number | null {
  const map: Record<ChordFunction, number | null> = {
    root: 0, "b9": 1, "9": 2, "#9": 3,
    "b3": 3, "3": 4, "11": 5, "#11": 6,
    "b5": 6, "5": 7, "#5": 8, "b13": 8,
    "13": 9, "b7": 10, "7": 11,
    "non-chord": null,
  };
  return map[fn];
}

// ── Decomposed note / phrase types ──────────────────────────────────────────

export interface DecomposedNote {
  id: string;
  pitch: string;          // from NoteData, e.g. "c/4"
  duration: Duration;
  dotted?: boolean;
  measure: number;        // bar index (0-based in phrase)
  startSlot: number;
  activeChordIdx: number; // index into phrase's chords array
  chordFunction: ChordFunction;
  isRest: boolean;
  accidental?: "n" | "b" | "#";
  isTieStart?: boolean;
  isTieEnd?: boolean;
}

export interface ChordAssignment {
  id: string;
  chordName: string;
  parsed: ParsedChord | null;
  startMeasure: number;   // 0-based
  startBeat: number;      // 0-based beat within measure
  endMeasure: number;
  endBeat: number;        // exclusive
}

export interface DecomposedPhrase {
  id: string;
  notes: DecomposedNote[];
  chords: ChordAssignment[];
  timeSig: MeasureTimeSig;
  barCount: number;
  tempo?: number;
  sourceBarNumbers: number[]; // original bar numbers from transcription
}

// ── Analyze notes against chords ────────────────────────────────────────────

/** Find which chord assignment is active at a given measure + slot position */
export function chordAtPosition(
  chords: ChordAssignment[],
  measure: number,
  slot: number,
  timeSig: MeasureTimeSig,
): ChordAssignment | null {
  const beatSlots = timeSig.den === 8 ? 4 : 8; // slots per beat
  const beat = Math.floor(slot / beatSlots);
  for (let i = chords.length - 1; i >= 0; i--) {
    const c = chords[i];
    if (measure > c.startMeasure || (measure === c.startMeasure && beat >= c.startBeat)) {
      if (measure < c.endMeasure || (measure === c.endMeasure && beat < c.endBeat)) {
        return c;
      }
    }
  }
  return chords[0] ?? null;
}

/** Analyze a single note: compute its function relative to active chord */
export function analyzeNoteFunction(
  note: DecomposedNote,
  chord: ParsedChord,
): ChordFunction {
  if (note.isRest) return "non-chord";
  const p = parsePitch(note.pitch);
  if (!p) return "non-chord";
  const interval = ((p.pc - chord.rootPc) % 12 + 12) % 12;
  return intervalToFunctionDetailed(interval, chord.quality);
}

/** Re-analyze all notes in a phrase against their active chords */
export function analyzePhrase(phrase: DecomposedPhrase): DecomposedNote[] {
  return phrase.notes.map(note => {
    const chord = phrase.chords[note.activeChordIdx];
    if (!chord?.parsed) return { ...note, chordFunction: "non-chord" };
    return {
      ...note,
      chordFunction: analyzeNoteFunction(note, chord.parsed),
      activeChordIdx: note.activeChordIdx,
    };
  });
}

// ── Import from NoteEntryMode ───────────────────────────────────────────────

let _nextId = 1;
function newId(): string {
  return `pd_${Date.now()}_${_nextId++}`;
}

/** Convert selected NoteData bars into a DecomposedPhrase */
export function importFromTranscription(
  notes: NoteData[],
  barNumbers: number[],   // which bars were selected (0-based)
  timeSig: MeasureTimeSig,
  tempo?: number,
): DecomposedPhrase {
  const barSet = new Set(barNumbers);
  const imported = notes.filter(n => barSet.has(n.measure));

  // Remap measure indices to 0-based within phrase
  const sortedBars = [...barNumbers].sort((a, b) => a - b);
  const barRemap = new Map(sortedBars.map((b, i) => [b, i]));

  const decomposed: DecomposedNote[] = imported.map(n => ({
    id: newId(),
    pitch: n.pitch,
    duration: n.duration,
    dotted: n.dotted,
    measure: barRemap.get(n.measure) ?? 0,
    startSlot: n.startSlot,
    activeChordIdx: 0,
    chordFunction: "non-chord" as ChordFunction,
    isRest: n.isRest,
    accidental: n.accidental,
    isTieStart: n.isTieStart,
    isTieEnd: n.isTieEnd,
  }));

  // Default: one chord assignment spanning all bars
  const defaultChord: ChordAssignment = {
    id: newId(),
    chordName: "",
    parsed: null,
    startMeasure: 0,
    startBeat: 0,
    endMeasure: sortedBars.length - 1,
    endBeat: timeSig.num,
  };

  return {
    id: newId(),
    notes: decomposed,
    chords: [defaultChord],
    timeSig,
    barCount: sortedBars.length,
    tempo,
    sourceBarNumbers: sortedBars,
  };
}

// ── Tension change ──────────────────────────────────────────────────────────

/** Replace a note's pitch so it takes on a new chord function */
export function changeNoteTension(
  note: DecomposedNote,
  newFunction: ChordFunction,
  chord: ParsedChord,
): DecomposedNote {
  // Compute the semitone interval for the target function
  const targetSemi = functionToSemitones(newFunction);
  if (targetSemi === null) return note;

  const p = parsePitch(note.pitch);
  if (!p) return note;

  const newPc = (chord.rootPc + targetSemi) % 12;
  // Keep the same octave, adjust note name
  const noteName = pcToNoteName(newPc);
  const newPitch = `${noteName}/${p.octave}`;

  return {
    ...note,
    pitch: newPitch,
    accidental: noteName.length > 1 ? (noteName[1] === "#" ? "#" : "b") : undefined,
    chordFunction: newFunction,
  };
}

/** Core chord tones (root, 3/b3, 5) that should be preserved during randomization */
const CORE_FUNCTIONS: Set<ChordFunction> = new Set(["root", "3", "b3", "5"]);

/** Random tension change for a note within a pool.
 *  Skips notes that are core chord tones (root, 3, 5) to preserve the phrase outline. */
export function randomTensionChange(
  note: DecomposedNote,
  chord: ParsedChord,
  pool: TensionPool,
): DecomposedNote {
  if (note.isRest) return note;
  if (CORE_FUNCTIONS.has(note.chordFunction)) return note;
  const tensions = getTensionPool(chord.quality, pool)
    .filter(semi => !CORE_FUNCTIONS.has(intervalToFunctionDetailed(semi, chord.quality)));
  if (tensions.length === 0) return note;
  const semi = tensions[Math.floor(Math.random() * tensions.length)];
  const fn = intervalToFunctionDetailed(semi, chord.quality);
  return changeNoteTension(note, fn, chord);
}

function functionToSemitones(fn: ChordFunction): number | null {
  const map: Record<ChordFunction, number | null> = {
    root: 0, "b9": 1, "9": 2, "#9": 3,
    "b3": 3, "3": 4, "11": 5, "#11": 6,
    "b5": 6, "5": 7, "#5": 8, "b13": 8,
    "13": 9, "b7": 10, "7": 11,
    "non-chord": null,
  };
  return map[fn];
}

function pcToNoteName(pc: number): string {
  const names = ["c", "c#", "d", "eb", "e", "f", "f#", "g", "ab", "a", "bb", "b"];
  return names[((pc % 12) + 12) % 12];
}

// ── Rhythm change ───────────────────────────────────────────────────────────

export type RhythmFixedMode = "pitches" | "functions" | "both";

const ALL_DURATIONS: Duration[] = ["w", "h", "q", "8", "16", "32"];

/** Generate a random rhythm that fills exactly `totalSlots` using allowed durations */
export function generateRandomRhythm(
  totalSlots: number,
  allowedDurations: Duration[],
  smallestSubdiv: Duration,
): Duration[] {
  const minSlot = DURATION_SLOTS[smallestSubdiv];
  const allowed = allowedDurations
    .filter(d => DURATION_SLOTS[d] >= minSlot)
    .sort((a, b) => DURATION_SLOTS[b] - DURATION_SLOTS[a]);

  if (allowed.length === 0) return [];

  const result: Duration[] = [];
  let remaining = totalSlots;

  while (remaining > 0) {
    const fitting = allowed.filter(d => DURATION_SLOTS[d] <= remaining);
    if (fitting.length === 0) break;
    const pick = fitting[Math.floor(Math.random() * fitting.length)];
    result.push(pick);
    remaining -= DURATION_SLOTS[pick];
  }

  return result;
}

/** Apply random rhythm to a bar of notes, keeping pitches or functions fixed */
export function applyRhythmChange(
  notes: DecomposedNote[],
  allowedDurations: Duration[],
  smallestSubdiv: Duration,
  timeSig: MeasureTimeSig,
): DecomposedNote[] {
  const totalSlots = measureSlots(timeSig);
  const newDurations = generateRandomRhythm(totalSlots, allowedDurations, smallestSubdiv);
  if (newDurations.length === 0) return notes;

  const nonRestNotes = notes.filter(n => !n.isRest);
  const result: DecomposedNote[] = [];
  let slot = 0;

  for (let i = 0; i < newDurations.length; i++) {
    const dur = newDurations[i];
    const slots = DURATION_SLOTS[dur];
    const sourceNote = nonRestNotes[i % Math.max(1, nonRestNotes.length)];
    result.push({
      ...(sourceNote ?? notes[0]),
      id: newId(),
      duration: dur,
      startSlot: slot,
      dotted: false,
    });
    slot += slots;
  }

  return result;
}

// ── Konnakol permutation integration ────────────────────────────────────────

/** Get konnakol-style permutations for a given subdivision count.
 *  Returns arrays of group sizes that sum to the target. */
export function getPermutationsForSubdiv(subdivCount: number): number[][] {
  // Generate integer partitions with order
  const results: number[][] = [];
  function partition(remaining: number, current: number[]) {
    if (remaining === 0) { results.push([...current]); return; }
    for (let i = 1; i <= remaining; i++) {
      current.push(i);
      partition(remaining - i, current);
      current.pop();
    }
  }
  // Limit to reasonable partition sizes (max 8 groups)
  function partitionLimited(remaining: number, current: number[], maxGroups: number) {
    if (remaining === 0) { results.push([...current]); return; }
    if (current.length >= maxGroups) return;
    for (let i = 1; i <= remaining; i++) {
      current.push(i);
      partitionLimited(remaining - i, current, maxGroups);
      current.pop();
    }
  }
  partitionLimited(subdivCount, [], Math.min(8, subdivCount));
  return results;
}

/** Apply a konnakol-style grouping permutation to a bar's rhythm */
export function applyPermutation(
  notes: DecomposedNote[],
  groupSizes: number[],
  smallestSubdiv: Duration,
  timeSig: MeasureTimeSig,
): DecomposedNote[] {
  const slotPerUnit = DURATION_SLOTS[smallestSubdiv];
  const nonRestNotes = notes.filter(n => !n.isRest);
  const result: DecomposedNote[] = [];
  let slot = 0;
  let noteIdx = 0;

  for (const size of groupSizes) {
    const totalSlotForGroup = size * slotPerUnit;
    // Find the best duration match
    const dur = slotsToDuration(totalSlotForGroup);
    if (!dur) continue;

    const sourceNote = nonRestNotes[noteIdx % Math.max(1, nonRestNotes.length)];
    result.push({
      ...(sourceNote ?? notes[0]),
      id: newId(),
      duration: dur,
      startSlot: slot,
      dotted: false,
    });
    slot += totalSlotForGroup;
    noteIdx++;
  }

  return result;
}

function slotsToDuration(slots: number): Duration | null {
  for (const [dur, s] of Object.entries(DURATION_SLOTS)) {
    if (s === slots) return dur as Duration;
  }
  return null;
}

// ── Randomize options ───────────────────────────────────────────────────────

export interface RandomizeOptions {
  tensions: boolean;
  rhythm: boolean;
  tensionPool: TensionPool;
  allowedDurations: Duration[];
  smallestSubdiv: Duration;
  lockedNoteIds: Set<string>;
  lockedBars: Set<number>;
}

export function randomizePhrase(
  phrase: DecomposedPhrase,
  options: RandomizeOptions,
): DecomposedPhrase {
  let newNotes = [...phrase.notes];

  if (options.tensions) {
    newNotes = newNotes.map(note => {
      if (options.lockedNoteIds.has(note.id)) return note;
      if (options.lockedBars.has(note.measure)) return note;
      if (note.isRest) return note;
      const chord = phrase.chords[note.activeChordIdx];
      if (!chord?.parsed) return note;
      return randomTensionChange(note, chord.parsed, options.tensionPool);
    });
  }

  if (options.rhythm) {
    // Group notes by measure, apply rhythm per measure
    const byMeasure = new Map<number, DecomposedNote[]>();
    for (const n of newNotes) {
      const arr = byMeasure.get(n.measure) ?? [];
      arr.push(n);
      byMeasure.set(n.measure, arr);
    }

    const rhythmized: DecomposedNote[] = [];
    for (const [mIdx, mNotes] of byMeasure) {
      if (options.lockedBars.has(mIdx)) {
        rhythmized.push(...mNotes);
      } else {
        rhythmized.push(
          ...applyRhythmChange(mNotes, options.allowedDurations, options.smallestSubdiv, phrase.timeSig)
            .map(n => ({ ...n, measure: mIdx })),
        );
      }
    }
    newNotes = rhythmized;
  }

  // Re-analyze functions after changes
  const updated: DecomposedPhrase = { ...phrase, notes: newNotes };
  updated.notes = analyzePhrase(updated);
  return updated;
}

// ── Display helpers ─────────────────────────────────────────────────────────

export const FUNCTION_COLORS: Record<ChordFunction, string> = {
  root:    "#c8aa50",
  "b9":    "#e06060",
  "9":     "#60c0a0",
  "#9":    "#e09060",
  "b3":    "#9090e0",
  "3":     "#9999ee",
  "11":    "#c8aa50",
  "#11":   "#e06060",
  "b5":    "#e09060",
  "5":     "#60c0a0",
  "#5":    "#c860c8",
  "b13":   "#e06060",
  "13":    "#60c0a0",
  "b7":    "#9090e0",
  "7":     "#9999ee",
  "non-chord": "#555",
};

export const FUNCTION_DISPLAY: Record<ChordFunction, string> = {
  root: "R", "b9": "b9", "9": "9", "#9": "#9",
  "b3": "b3", "3": "3", "11": "11", "#11": "#11",
  "b5": "b5", "5": "5", "#5": "#5", "b13": "b13",
  "13": "13", "b7": "b7", "7": "7",
  "non-chord": "NCT",
};

export const CHORD_QUALITY_DISPLAY: Record<ChordQuality, string> = {
  maj: "", min: "m", dom7: "7", maj7: "maj7", min7: "m7",
  dim: "dim", dim7: "dim7", m7b5: "m7b5", aug: "aug",
  minMaj7: "mMaj7", aug7: "aug7", sus4: "sus4", sus2: "sus2",
  dom9: "9", maj9: "maj9", min9: "m9",
  dom13: "13", min11: "m11", dom7alt: "7alt",
  "6": "6", min6: "m6",
};

// ── Preset / Save types ─────────────────────────────────────────────────────

export interface PhrasePreset {
  id: string;
  name: string;
  phrase: DecomposedPhrase;
  createdAt: number;
}

export interface VariationPreset {
  id: string;
  name: string;
  original: DecomposedPhrase;
  variation: DecomposedPhrase;
  settings: RandomizeOptions & { tensionPool: TensionPool };
  createdAt: number;
}
