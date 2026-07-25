// ── Jianpu (简谱 / numbered notation) helpers ────────────────────────────────
//
// Jianpu represents pitches as scale degrees 1–7 relative to a key ("1 = C"),
// with octave *dots* above/below the number and duration shown by underlines
// (shorter than a quarter) and trailing dashes (longer than a quarter).  This
// module is the single source of truth for:
//   • mapping a scale degree + octave-dots + accidental → a concrete pitch
//     (for MusicXML export, LilyPond export, and audio playback)
//   • mapping a note Duration → its jianpu glyph decoration (underlines /
//     dashes / augmentation dot)
//
// We deliberately support only what jianpu needs per the product spec:
// octaves + durations.  No dynamics, slurs, or articulations.

import type { Duration } from "./noteEntryData";
import { KEY_NAMES } from "./noteEntryData";
import { customSolfege } from "./customSolfege";

// ── Jianpu note fields (stored on NoteData for jianpu scores) ────────────────
// A jianpu note is authored directly as a degree/octave/accidental so the
// renderer never has to reverse-engineer a staff pitch.  A concrete `pitch`
// is *also* derived and stored so playback / MusicXML can reuse standard code.

export type JianpuVoice = 0 | 1;            // 0 = upper (RH), 1 = lower (LH)
export type JianpuAccidental = "#" | "b" | "n";

// ── Music-theory tables ──────────────────────────────────────────────────────

const LETTER_ORDER = ["C", "D", "E", "F", "G", "A", "B"] as const;
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MAJOR_SCALE_SEMIS = [0, 2, 4, 5, 7, 9, 11]; // degrees 1..7

const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER  = ["B", "E", "A", "D", "G", "C", "F"];

/** Key-signature accidental (−1, 0, +1) applied to a natural letter. */
function keyAlterForLetter(letter: string, fifths: number): number {
  if (fifths > 0 && SHARP_ORDER.indexOf(letter) < fifths) return 1;
  if (fifths < 0 && FLAT_ORDER.indexOf(letter) < -fifths) return -1;
  return 0;
}

/** Tonic letter + its own accidental for the given key (e.g. F# → {letter:"F", alter:1}). */
function tonicOf(fifths: number): { letter: string; alter: number } {
  const name = KEY_NAMES[fifths as keyof typeof KEY_NAMES] ?? "C";
  const letter = name[0].toUpperCase();
  const alter = name.includes("#") ? 1 : name.includes("b") ? -1 : 0;
  return { letter, alter };
}

/** The seven diatonic letters (with octave numbers, base octave 4) of a key. */
function keyDegrees(fifths: number): { letter: string; octave: number }[] {
  const { letter: tonicLetter } = tonicOf(fifths);
  const startIdx = LETTER_ORDER.indexOf(tonicLetter as (typeof LETTER_ORDER)[number]);
  const out: { letter: string; octave: number }[] = [];
  let octave = 4;
  for (let i = 0; i < 7; i++) {
    const L = LETTER_ORDER[(startIdx + i) % 7];
    if (i > 0 && L === "C") octave++; // crossed the B→C octave boundary going up
    out.push({ letter: L, octave });
  }
  return out;
}

export interface JianpuPitch {
  /** VexFlow-style pitch string, e.g. "c/4" (letter is natural; alter is separate). */
  pitch: string;
  step: string;      // "C".."B"
  alter: number;     // −2..+2 (sounding accidental incl. key signature)
  octave: number;
  midi: number;
}

/**
 * Resolve a jianpu degree (1–7) with octave dots + optional accidental to a
 * concrete pitch, given the key signature (fifths).  `octaveDots` is signed:
 * +1 = one dot above (up an octave), −1 = one dot below.
 */
export function jianpuToPitch(
  degree: number,
  octaveDots: number,
  accidental: JianpuAccidental | undefined,
  fifths: number,
): JianpuPitch {
  const d = Math.min(7, Math.max(1, Math.round(degree)));
  const degs = keyDegrees(fifths);
  const { letter, octave: baseOctave } = degs[d - 1];
  const octave = baseOctave + octaveDots;

  const keyAlter = keyAlterForLetter(letter, fifths);
  // An explicit accidental overrides the key signature for this note:
  //   "#" → raise a semitone, "b" → lower, "n" → force natural.
  let alter: number;
  if (accidental === "#") alter = keyAlter + 1;
  else if (accidental === "b") alter = keyAlter - 1;
  else if (accidental === "n") alter = 0;
  else alter = keyAlter;

  const midi = (octave + 1) * 12 + LETTER_PC[letter] + alter;
  return { pitch: `${letter.toLowerCase()}/${octave}`, step: letter, alter, octave, midi };
}

// Cross-check that MAJOR_SCALE_SEMIS agrees with the letter-based mapping — kept
// referenced so the constant isn't flagged unused and documents intent.
export const JIANPU_SCALE_SEMITONES = MAJOR_SCALE_SEMIS;

// ── Duration → jianpu glyph decoration ───────────────────────────────────────
//
// Fixed x/4 convention (the standard used by jianpu-ly / EOP NMN Master):
//   whole  = number + 3 trailing dashes
//   half   = number + 1 trailing dash
//   quarter= bare number
//   eighth = 1 underline
//   16th   = 2 underlines
//   32nd   = 3 underlines
//   dotted = trailing augmentation dot (·)

// Note value in quarter-note beats (x/4 convention).
const BEATS: Record<Duration, number>       = { w: 4, h: 2, q: 1, "8": 0.5, "16": 0.25, "32": 0.125 };
const UNDERLINES: Record<Duration, number>  = { w: 0, h: 0, q: 0, "8": 1, "16": 2, "32": 3 };

export interface JianpuGlyph {
  underlines: number; // beams drawn under the number
  dashes: number;     // trailing "–" cells, each sustaining the note one beat
  dot: boolean;       // augmentation dot after the number (sub-beat extension only)
}

/**
 * Jianpu duration decoration, following standard practice:
 *   whole = 1 – – –        half = 1 –        quarter = 1
 *   eighth = 1̲             16th = 1̳          (underlines for sub-beat values)
 * A dot on a *dashed* value (half/whole) adds whole-beat dashes:
 *   dotted half  = 1 – –           dotted whole = 1 – – – – –
 * A dot on a *sub-beat* value (quarter/eighth/…) is a `•` augmentation dot:
 *   dotted quarter = 1•            dotted eighth = 1̲•
 */
export function jianpuGlyphFor(duration: Duration, dotted?: boolean): JianpuGlyph {
  const beats = BEATS[duration];
  const underlines = UNDERLINES[duration];
  let dashes = beats >= 1 ? beats - 1 : 0;   // whole→3, half→1, quarter→0
  let dot = false;
  if (dotted) {
    const added = beats / 2;                 // a dot adds half the value
    if (added >= 1) dashes += added;         // dotted half +1, dotted whole +2
    else dot = true;                         // dotted quarter/eighth/… → •
  }
  return { underlines, dashes, dot };
}

/** Human label for the key header, e.g. `1 = C`. */
export function jianpuKeyLabel(fifths: number): string {
  return `1 = ${KEY_NAMES[fifths as keyof typeof KEY_NAMES] ?? "C"}`;
}

// ── Notation systems (display only — same underlying degree data) ────────────
//
// A jianpu note is stored as a scale degree + accidental; switching the display
// system only changes the glyph text, not the note.  "jianpu" shows numbers
// 1–7; "solfa" shows movable-do tonic sol-fa (d r m f s l t) with the standard
// chromatic syllables (di ri fi si li for sharps, ra me se le te for flats).

export type NotationSystem = "jianpu" | "solfa";

export const NOTATION_SYSTEM_LABELS: Record<NotationSystem, string> = {
  jianpu: "Jianpu",
  solfa: "Sol-fa",
};

const SOLFA_NATURAL: Record<number, string> = { 1: "d", 2: "r", 3: "m", 4: "f", 5: "s", 6: "l", 7: "t" };
const SOLFA_SHARP: Record<number, string>   = { 1: "di", 2: "ri", 4: "fi", 5: "si", 6: "li" };
const SOLFA_FLAT: Record<number, string>    = { 2: "ra", 3: "me", 5: "se", 6: "le", 7: "te" };

/**
 * Glyph text for a note in the chosen system.  In "solfa" the chromatic
 * syllable already encodes the accidental, so the caller should NOT also draw a
 * separate ♯/♭ prefix in that system (`accidentalInGlyph` reports this).
 */
export function noteLabel(
  system: NotationSystem,
  degree: number,
  accidental: JianpuAccidental | undefined,
): string {
  if (system === "jianpu") return String(degree);
  if (accidental === "#") return SOLFA_SHARP[degree] ?? `${SOLFA_NATURAL[degree] ?? degree}♯`;
  if (accidental === "b") return SOLFA_FLAT[degree] ?? `${SOLFA_NATURAL[degree] ?? degree}♭`;
  return SOLFA_NATURAL[degree] ?? String(degree);
}

/** Whether the accidental is baked into the glyph (solfa) vs drawn separately (jianpu). */
export function accidentalInGlyph(system: NotationSystem): boolean {
  return system === "solfa";
}

/** Raise/lower a degree by one scale step, wrapping across the octave. */
export function shiftDegree(degree: number, octave: number, dir: 1 | -1): { degree: number; octave: number } {
  let d = degree + dir;
  let o = octave;
  if (d > 7) { d = 1; o += 1; }
  else if (d < 1) { d = 7; o -= 1; }
  return { degree: d, octave: Math.max(-3, Math.min(3, o)) };
}

// ── EDO support + region-centered solfège ────────────────────────────────────
//
// A jianpu note is a diatonic degree 1–7 (the MOS major scale generated by the
// EDO's best fifth) plus an integer `alteration` in EDO steps.  Its solfège
// syllable comes from the app's region-centered gamut (`customSolfege`, where
// the "-a" vowel is each region's centre); the syllable is abbreviated to the
// familiar d r m f s l t ONLY when the note actually lands on a centre — so a
// "small" major third (e.g. 31-EDO degree 3) shows its true syllable (mo), not m.

// Degrees 1–7 (do re mi fa sol la ti) as offsets along the chain of fifths.
const FIFTHS_FROM_TONIC = [0, 2, 4, -1, 1, 3, 5];

/** Best approximation of a just perfect fifth (3/2) in this EDO, in steps. */
export function edoFifth(edo: number): number {
  return Math.round(edo * Math.log2(3 / 2));
}

/** EDO step (0..edo-1) of diatonic degree 1–7, from stacked fifths. */
export function degreeToEdoStep(degree: number, edo: number): number {
  const f = FIFTHS_FROM_TONIC[(((degree - 1) % 7) + 7) % 7];
  return (((f * edoFifth(edo)) % edo) + edo) % edo;
}

/** Cents of an EDO step. */
export function edoStepCents(step: number, edo: number): number {
  return (step * 1200) / edo;
}


/**
 * Display for a jianpu note: `.text` is the glyph (a number in jianpu, a solfège
 * syllable in solfa), `.prefix` is an optional alteration mark drawn before a
 * jianpu number (♯/♭ in 12-EDO, ^/v elsewhere; solfa bakes the alteration into
 * the syllable so has none).
 */
export function edoNoteLabel(
  system: NotationSystem,
  degree: number,
  alteration: number,
  edo: number,
  toCents: (cents: number) => string = customSolfege,
): { text: string; prefix?: string } {
  if (system === "solfa") {
    // Full region-centered syllable (Da / Ra / Ma / Mo / Mu …) — matches the
    // Solfège chart, not the old abbreviated d r m f s l t.
    const step = ((degreeToEdoStep(degree, edo) + alteration) % edo + edo) % edo;
    return { text: toCents(edoStepCents(step, edo)) };
  }
  let prefix: string | undefined;
  if (alteration > 0) prefix = (edo === 12 ? "♯" : "^").repeat(alteration);
  else if (alteration < 0) prefix = (edo === 12 ? "♭" : "v").repeat(-alteration);
  return { text: String(degree), prefix };
}
