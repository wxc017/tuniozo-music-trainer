// ── Modulation & Borrowing (31-EDO cheat sheet) ───────────────────
// Chord borrowings (modal interchange + chromatic + xen) and modulations
// in 31-EDO, by prime-limit color (5 / 7 / 11).  Everything is scale-
// degree INTERVALS — no note names.  Roman numerals are DERIVED from
// (root, quality, home mode), so the Major/Minor toggle re-spells them,
// and diatonic chords are filtered out of the borrowing list per mode.
//
// NOTE on tuning: plain degrees (1 2 3 4 5 6 7) are the 5-limit/meantone
// intervals — the major 3rd is 5/4, NOT the Pythagorean 81/64 (31-EDO is
// meantone and has no separate Pythagorean third).  Prefixes mark the
// xen tunings: s = septimal sub, S = septimal super, n = neutral (11).
// So a chord's true tuning is always in its FORMULA, not its roman.
// Step math is in 31-EDO degrees (1 step = 1200/31 ≈ 38.71 ¢).

export type Limit = 5 | 7 | 11;
export type Mode = "major" | "minor";

/* ── Degree symbols (interval above a root), all 31 steps ────────────
   Standard for major/minor — plain numbers (1 2 3 4 5 6 7) and flats
   (♭2 ♭3 ♭6 ♭7).  Letters only for the microtonal qualities: s sub,
   n neutral, S super, h harmonic 7th.  Degrees 1/4/5 use accidentals —
   ♯ sharp, ♭ flat, 𝄲 half-sharp (U+1D132), 𝄳 half-flat (U+1D133).
   (𝄲/𝄳 render via the Noto Music web font; see index.html.) */
const HS = "\u{1D132}"; // 𝄲 half sharp
const HF = "\u{1D133}"; // 𝄳 half flat
const DEG: Record<number, string> = {
  0: "1",      1: HS + "1", 2: "♯1", 3: "♭2", 4: "n2", 5: "2", 6: "S2", 7: "s3", 8: "♭3", 9: "n3", 10: "3",
  11: "S3", 12: HF + "4", 13: "4", 14: HS + "4", 15: "♯4", 16: "♭5", 17: HF + "5", 18: "5", 19: HS + "5", 20: "♯5",
  21: "♭6", 22: "n6", 23: "6", 24: "S6", 25: "h7", 26: "♭7", 27: "n7", 28: "7", 29: "S7", 30: HF + "8",
};

/** Best simple JI ratio for each 31-EDO step (one octave) — used to show
 *  a chord's tones as ratios from the tonic. */
export const RATIO_31: string[] = [
  "1/1", "45/44", "22/21", "16/15", "12/11", "9/8", "8/7", "7/6", "6/5", "11/9", "5/4",
  "9/7", "21/16", "4/3", "11/8", "7/5", "10/7", "16/11", "3/2", "32/21", "25/16",
  "8/5", "18/11", "5/3", "12/7", "7/4", "9/5", "11/6", "15/8", "21/11", "35/18",
];

/** Degree symbol for a step; steps ≥ 31 read as compound (9, 11…). */
export function degree(step: number): string {
  const oct = Math.floor(step / 31);
  const sym = DEG[(((step % 31) + 31) % 31)];
  if (!sym) return `?${step}`;
  if (oct === 0) return sym;
  const m = sym.match(/^(\D*)(\d+)$/);
  return m ? `${m[1]}${parseInt(m[2], 10) + 7 * oct}` : sym;
}

/* ── Mode-relative spelling (chromatic roots) ──────────────────────── */
const ARABIC_MAJOR: Record<number, string> = {
  0: "1", 2: "♯1", 3: "♭2", 5: "2", 7: "♯2", 8: "♭3", 10: "3", 13: "4",
  15: "♯4", 16: "♭5", 18: "5", 20: "♯5", 21: "♭6", 23: "6", 25: "♯6", 26: "♭7", 28: "7",
};
const ARABIC_MINOR: Record<number, string> = {
  0: "1", 2: "♯1", 3: "♭2", 5: "2", 8: "3", 10: "♯3", 13: "4",
  15: "♯4", 16: "♭5", 18: "5", 21: "6", 23: "♯6", 26: "7", 28: "♯7",
};
const ROMAN_MAJOR: Record<number, string> = {
  0: "I", 2: "♯I", 3: "♭II", 5: "II", 7: "♯II", 8: "♭III", 10: "III", 13: "IV",
  15: "♯IV", 16: "♭V", 18: "V", 20: "♯V", 21: "♭VI", 23: "VI", 25: "♯VI", 26: "♭VII", 28: "VII",
};
const ROMAN_MINOR: Record<number, string> = {
  0: "I", 2: "♯I", 3: "♭II", 5: "II", 8: "III", 10: "♯III", 13: "IV",
  15: "♯IV", 16: "♭V", 18: "V", 21: "VI", 23: "♯VI", 26: "VII", 28: "♯VII",
};

export function degreeInMode(step: number, mode: Mode): string {
  const k = ((step % 31) + 31) % 31;
  return (mode === "major" ? ARABIC_MAJOR : ARABIC_MINOR)[k] ?? degree(step);
}
export function romanDegree(step: number, mode: Mode): string {
  const k = ((step % 31) + 31) % 31;
  return (mode === "major" ? ROMAN_MAJOR : ROMAN_MINOR)[k] ?? degree(step);
}

/* ── Chord-quality table ────────────────────────────────────────────
   Jazz roman notation: an uppercase numeral (with ♯/♭ on the root) plus
   a quality suffix.  Microtonal third quality is the letter s/n/S
   (sub/neutral/super); m/maj/° etc. are the usual jazz suffixes. */
interface Quality { type: string; suffix: string; limit: Limit; }
const QUAL: Record<string, Quality> = {
  maj:     { type: "Major",             suffix: "",       limit: 5 },
  min:     { type: "Minor",             suffix: "m",      limit: 5 },
  dim:     { type: "Diminished",        suffix: "°",      limit: 5 },
  aug:     { type: "Augmented",         suffix: "+",      limit: 5 },
  maj7:    { type: "Major 7",           suffix: "maj7",   limit: 5 },
  min7:    { type: "Minor 7",           suffix: "m7",     limit: 5 },
  min6:    { type: "Minor 6",           suffix: "m6",     limit: 5 },
  minMaj7: { type: "Minor-major 7",     suffix: "m(maj7)",limit: 5 },
  dom7:    { type: "Dominant 7 (just)", suffix: "7",      limit: 7 },
  hdim7:   { type: "Half-dim 7",        suffix: "ø7",     limit: 7 },
  sub:     { type: "Subminor triad",    suffix: "s",      limit: 7 },
  sub7:    { type: "Subminor 7",        suffix: "s7",     limit: 7 },
  sup:     { type: "Supermajor triad",  suffix: "S",      limit: 7 },
  utonal7: { type: "Utonal 7",          suffix: "u7",     limit: 7 },
  neu:     { type: "Neutral triad",     suffix: "n",      limit: 11 },
  neu7:    { type: "Neutral 7 (Rast)",  suffix: "n7",     limit: 11 },
  dom7s11: { type: "Dom 7 ♯11 (just)",  suffix: "7♯11",   limit: 11 },
  over11:  { type: "Overtone (to 11)",  suffix: "9♯11",   limit: 11 },
};
export function qualityLimit(quality: string): Limit { return QUAL[quality].limit; }

const ROMAN_NUM: Record<number, string> = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII" };
/** Roman-ise a degree label, keeping its prefix: "n3"→"nIII", "𝄲4"→"𝄲IV". */
function romanizeDegree(deg: string): string {
  const m = deg.match(/(\d+)/);
  if (!m) return deg;
  return deg.replace(m[1], ROMAN_NUM[parseInt(m[1], 10)] ?? m[1]);
}

/** Standard jazz qualities keep their suffix; everything else (septimal /
 *  neutral / undecimal) lists its tones explicitly. */
const JAZZ_SUFFIX = new Set(["maj", "min", "dim", "aug", "maj7", "min7", "min6", "minMaj7", "dom7", "hdim7"]);

/** Roman numeral for (root step, quality, home mode).  Standard qualities
 *  → roman + jazz suffix (V7, ♭IIImaj7…).  Exotic qualities → roman with
 *  the quality-bearing tones explicit in parens, e.g. I(s3,♯4,h7); root and
 *  perfect 5th are implied.  Microtonal roots use a prefix-roman (nIII…). */
export function romanFor(step: number, quality: string, mode: Mode): string {
  const k = ((step % 31) + 31) % 31;
  const roman = (mode === "major" ? ROMAN_MAJOR : ROMAN_MINOR)[k];
  const rootLabel = roman ?? romanizeDegree(degree(step));
  if (JAZZ_SUFFIX.has(quality)) return rootLabel + QUAL[quality].suffix;
  const tones = qualityChord(quality).steps.slice(1).filter(s => s !== 18).map(degree).join(",");
  return tones ? `${rootLabel}(${tones})` : rootLabel;
}

/* ── Interval names (ratio + name), keyed by step ──────────────────── */
export const INTERVAL: Record<number, { ratio: string; name: string }> = {
  0:  { ratio: "1/1",   name: "unison" },        3:  { ratio: "16/15", name: "minor 2nd" },
  5:  { ratio: "9/8",   name: "major 2nd" },     6:  { ratio: "8/7",   name: "supermajor 2nd" },
  7:  { ratio: "7/6",   name: "subminor 3rd" },  8:  { ratio: "6/5",   name: "minor 3rd" },
  9:  { ratio: "11/9",  name: "neutral 3rd" },   10: { ratio: "5/4",   name: "major 3rd" },
  11: { ratio: "9/7",   name: "supermajor 3rd" },13: { ratio: "4/3",   name: "perfect 4th" },
  14: { ratio: "11/8",  name: "super 4th" },     15: { ratio: "7/5",   name: "septimal tritone" },
  16: { ratio: "45/32", name: "diminished 5th" },18: { ratio: "3/2",   name: "perfect 5th" },
  21: { ratio: "8/5",   name: "minor 6th" },     23: { ratio: "5/3",   name: "major 6th" },
  24: { ratio: "12/7",  name: "supermajor 6th" },25: { ratio: "7/4",   name: "harmonic 7th" },
  26: { ratio: "9/5",   name: "minor 7th" },     27: { ratio: "11/6",  name: "neutral 7th" },
  28: { ratio: "15/8",  name: "major 7th" },
};

/* ── Chord-ratio dictionary ─────────────────────────────────────────── */
export interface ChordType { name: string; ratio: string; steps: number[]; limit: Limit; }
export const CHORD_TYPES: ChordType[] = [
  { name: "Major",             ratio: "4:5:6",         steps: [0, 10, 18],             limit: 5 },
  { name: "Minor",             ratio: "10:12:15",      steps: [0, 8, 18],              limit: 5 },
  { name: "Sus2",              ratio: "8:9:12",        steps: [0, 5, 18],              limit: 5 },
  { name: "Sus4",              ratio: "6:8:9",         steps: [0, 13, 18],             limit: 5 },
  { name: "Diminished",        ratio: "25:30:36",      steps: [0, 8, 16],              limit: 5 },
  { name: "Augmented",         ratio: "16:20:25",      steps: [0, 10, 20],             limit: 5 },
  { name: "Major 6",           ratio: "12:15:18:20",   steps: [0, 10, 18, 23],         limit: 5 },
  { name: "Minor 6",           ratio: "30:36:45:50",   steps: [0, 8, 18, 23],          limit: 5 },
  { name: "Major 7",           ratio: "8:10:12:15",    steps: [0, 10, 18, 28],         limit: 5 },
  { name: "Minor 7",           ratio: "10:12:15:18",   steps: [0, 8, 18, 26],          limit: 5 },
  { name: "Minor-major 7",     ratio: "40:48:60:75",   steps: [0, 8, 18, 28],          limit: 5 },
  { name: "Major 9",           ratio: "8:10:12:15:18", steps: [0, 10, 18, 28, 36],     limit: 5 },
  { name: "Add 9",             ratio: "4:5:6:9",       steps: [0, 10, 18, 36],         limit: 5 },
  { name: "Dominant 7 (just)", ratio: "4:5:6:7",       steps: [0, 10, 18, 25],         limit: 7 },
  { name: "Dominant 9 (just)", ratio: "4:5:6:7:9",     steps: [0, 10, 18, 25, 36],     limit: 7 },
  { name: "Subminor triad",    ratio: "6:7:9",         steps: [0, 7, 18],              limit: 7 },
  { name: "Subminor 7",        ratio: "12:14:18:21",   steps: [0, 7, 18, 25],          limit: 7 },
  { name: "Supermajor triad",  ratio: "14:18:21",      steps: [0, 11, 18],             limit: 7 },
  { name: "Supermajor 6",      ratio: "14:18:21:24",   steps: [0, 11, 18, 24],         limit: 7 },
  { name: "Diminished (sept)", ratio: "5:6:7",         steps: [0, 8, 15],              limit: 7 },
  { name: "Half-dim 7",        ratio: "5:6:7:9",       steps: [0, 8, 15, 26],          limit: 7 },
  { name: "Utonal 7",          ratio: "60:70:84:105",  steps: [0, 7, 15, 25],          limit: 7 },
  { name: "Harmonic 7 (sub)",  ratio: "6:7:9:11",      steps: [0, 7, 18, 27],          limit: 11 },
  { name: "Neutral triad",     ratio: "18:22:27",      steps: [0, 9, 18],              limit: 11 },
  { name: "Neutral 7 (Rast)",  ratio: "18:22:27:33",   steps: [0, 9, 18, 27],          limit: 11 },
  { name: "Dom 7 ♯11 (just)",  ratio: "4:5:6:7:11",    steps: [0, 10, 18, 25, 45],     limit: 11 },
  { name: "Overtone 8:9:10:11",ratio: "8:9:10:11",     steps: [0, 5, 10, 14],          limit: 11 },
  { name: "Overtone (to 11)",  ratio: "4:5:6:7:9:11",  steps: [0, 10, 18, 25, 36, 45], limit: 11 },
];
const CHORD_BY_NAME = new Map(CHORD_TYPES.map(c => [c.name, c]));
export function chordType(name: string): ChordType {
  const c = CHORD_BY_NAME.get(name);
  if (!c) throw new Error(`unknown chord type: ${name}`);
  return c;
}
export function qualityChord(quality: string): ChordType { return chordType(QUAL[quality].type); }

/** Largest cents error between a chord's 31-EDO realization and its pure
 *  just ratio (e.g. 4:5:6:7 is off by ≤ 5.2¢ — the 3/2 is 5.2¢ flat). */
export function ratioCentsError(ratio: string, steps: number[]): number {
  const parts = ratio.split(":").map(Number);
  if (parts.some(n => !isFinite(n)) || parts.length !== steps.length) return 0;
  let max = 0;
  for (let i = 1; i < parts.length; i++) {
    const just = 1200 * Math.log2(parts[i] / parts[0]);
    const edo = steps[i] * 1200 / 31;
    max = Math.max(max, Math.abs(edo - just));
  }
  return Math.round(max * 10) / 10;
}

/** Per-tone cents deviation of a chord's 31-EDO realization from each pure
 *  partial, e.g. 4:5:6:7 → [0, +1, -5, -1]. */
export function ratioCentsPerTone(ratio: string, steps: number[]): number[] {
  const parts = ratio.split(":").map(Number);
  if (parts.some(n => !isFinite(n)) || parts.length !== steps.length) return steps.map(() => 0);
  return steps.map((s, i) => Math.round(s * 1200 / 31 - 1200 * Math.log2(parts[i] / parts[0])));
}

/** A chord's tones as absolute steps from the tonic (root at `root`). */
export function tonicSteps(root: number, quality: string): number[] {
  return qualityChord(quality).steps.map(s => ((root + s) % 31 + 31) % 31);
}
/** A chord's tones as JI ratios from the tonic, e.g. ["3/2","15/8","9/8","21/16"]. */
export function tonicRatios(root: number, quality: string): string[] {
  return tonicSteps(root, quality).map(s => RATIO_31[s]);
}

/* ── Scales (by scale degree) ──────────────────────────────────────── */
export interface Scale { name: string; steps: number[]; family: "mode" | "minor" | "jazz" | "maqam" | "exotic" | "septimal"; }
export const SCALES: Record<string, Scale> = {
  // Diatonic modes
  major:          { name: "Major (Ionian)",  steps: [0, 5, 10, 13, 18, 23, 28], family: "mode" },
  dorian:         { name: "Dorian",          steps: [0, 5, 8, 13, 18, 23, 26],  family: "mode" },
  phrygian:       { name: "Phrygian",        steps: [0, 3, 8, 13, 18, 21, 26],  family: "mode" },
  lydian:         { name: "Lydian",          steps: [0, 5, 10, 15, 18, 23, 28], family: "mode" },
  mixolydian:     { name: "Mixolydian",      steps: [0, 5, 10, 13, 18, 23, 26], family: "mode" },
  minor:          { name: "Minor (Aeolian)", steps: [0, 5, 8, 13, 18, 21, 26],  family: "mode" },
  locrian:        { name: "Locrian",         steps: [0, 3, 8, 13, 16, 21, 26],  family: "mode" },
  // Minor variants / jazz
  harmonicMinor:  { name: "Harmonic minor",  steps: [0, 5, 8, 13, 18, 21, 28],  family: "minor" },
  melodicMinor:   { name: "Melodic minor",   steps: [0, 5, 8, 13, 18, 23, 28],  family: "minor" },
  harmonicMajor:  { name: "Harmonic major",  steps: [0, 5, 10, 13, 18, 21, 28], family: "minor" },
  lydianDominant: { name: "Lydian dominant", steps: [0, 5, 10, 15, 18, 23, 26], family: "jazz" },
  altered:        { name: "Altered",         steps: [0, 3, 8, 11, 16, 21, 26],  family: "jazz" },
  // Exotic
  doubleHarmonic: { name: "Double harmonic", steps: [0, 3, 10, 13, 18, 21, 28], family: "exotic" },
  hungarianMinor: { name: "Hungarian minor", steps: [0, 5, 8, 15, 18, 21, 28],  family: "exotic" },
  neapolitanMinor:{ name: "Neapolitan minor",steps: [0, 3, 8, 13, 18, 21, 28],  family: "exotic" },
  neapolitanMajor:{ name: "Neapolitan major",steps: [0, 3, 8, 13, 18, 23, 28],  family: "exotic" },
  // Maqamat (neutral)
  rast:           { name: "Rast",            steps: [0, 5, 9, 13, 18, 23, 27],  family: "maqam" },
  bayati:         { name: "Bayati",          steps: [0, 4, 8, 13, 18, 21, 26],  family: "maqam" },
  hijaz:          { name: "Hijaz",           steps: [0, 3, 10, 13, 18, 21, 26], family: "maqam" },
  nikriz:         { name: "Nikriz",          steps: [0, 5, 8, 15, 18, 23, 26],  family: "maqam" },
  saba:           { name: "Saba",            steps: [0, 4, 8, 11, 18, 21, 26],  family: "maqam" },
  sikah:          { name: "Sikah",           steps: [0, 4, 9, 14, 18, 22, 27],  family: "maqam" },
  // Septimal / neutral diatonics (31-EDO) — the "uniformly inflected"
  // diatonic parents from the alteration-lattice families.  Each replaces
  // the major scale's variable degrees (3/6/7, and 2 for neutral) with the
  // family's septimal or neutral flavour.
  subminorDiatonic:    { name: "Subminor diatonic",    steps: [0, 5, 7, 13, 18, 20, 25],  family: "septimal" },
  supermajorDiatonic:  { name: "Supermajor diatonic",  steps: [0, 5, 11, 13, 18, 24, 29], family: "septimal" },
  neutralDiatonic:     { name: "Neutral diatonic",     steps: [0, 5, 9, 13, 18, 22, 27],  family: "septimal" },
  subharmonicDiatonic: { name: "Subharmonic diatonic", steps: [0, 5, 7, 13, 18, 20, 28],  family: "septimal" },
  superLydian:         { name: "Superlydian",          steps: [0, 5, 11, 16, 18, 23, 29], family: "septimal" },
  subPhrygian:         { name: "Subminor Phrygian",    steps: [0, 2, 7, 13, 18, 20, 25],  family: "septimal" },
};

/** Is (root, quality) entirely within the home-mode scale? (= diatonic,
 *  so NOT a borrowing). */
export function isDiatonic(root: number, quality: string, mode: Mode): boolean {
  const scale = new Set(SCALES[mode].steps);
  return qualityChord(quality).steps.every(s => scale.has(((root + s) % 31 + 31) % 31));
}

/** Pivot chord (destination tonic triad) in old-key degrees, e.g. "5-7-2". */
export function pivotChord(target: number, scaleKey: string, mode: Mode): string {
  const s = SCALES[scaleKey].steps;
  return [s[0], s[2], s[4]].map(t => degreeInMode((target + t) % 31, mode)).join("-");
}

/* ── Borrowed chords (root = steps above tonic) ─────────────────────
   Comprehensive union across parallel modes + chromatic + xen.  The
   view hides whichever are diatonic to the current Major/Minor home. */
export interface Borrowing { root: number; quality: string; source: string; use: string; resolve?: number; limit?: Limit; }

export const BORROWINGS: Borrowing[] = [
  // ── 5-limit triads: modal interchange + chromatic ──
  { root: 0,  quality: "min",  source: "parallel minor",  use: "Minor tonic" },
  { root: 0,  quality: "maj",  source: "Picardy",         use: "Major tonic (Picardy 3rd)" },
  { root: 0,  quality: "aug",  source: "harmonic minor",  use: "Augmented tonic (line cliché)" },
  { root: 3,  quality: "maj",  source: "Phrygian",        use: "Neapolitan ♭II", resolve: 15 },
  { root: 5,  quality: "maj",  source: "Lydian",          use: "Lydian II (= V/V triad)" },
  { root: 5,  quality: "dim",  source: "harmonic minor",  use: "Supertonic diminished" },
  { root: 8,  quality: "maj",  source: "parallel minor",  use: "♭III major" },
  { root: 8,  quality: "aug",  source: "harmonic minor",  use: "♭III+ augmented mediant" },
  { root: 10, quality: "maj",  source: "Maj on 3",        use: "Chromatic mediant III" },
  { root: 13, quality: "maj",  source: "Dorian/major",    use: "Major IV (Dorian in minor)" },
  { root: 13, quality: "min",  source: "parallel minor",  use: "Minor iv — classic" },
  { root: 15, quality: "dim",  source: "Lydian",          use: "♯iv° (Lydian)" },
  { root: 16, quality: "maj",  source: "Maj on ♭5",       use: "♭V tritone-region major" },
  { root: 18, quality: "maj",  source: "harmonic minor",  use: "Major V (raised 7th)" },
  { root: 18, quality: "min",  source: "parallel minor",  use: "Minor v (soft dominant)" },
  { root: 21, quality: "maj",  source: "parallel minor",  use: "♭VI major" },
  { root: 23, quality: "maj",  source: "Maj on 6",        use: "Chromatic mediant VI" },
  { root: 26, quality: "maj",  source: "Mixolydian/minor",use: "♭VII major" },
  { root: 28, quality: "dim",  source: "harmonic minor",  use: "Leading-tone diminished", resolve: 3 },
  // ── 5-limit sevenths / sixths ──
  { root: 0,  quality: "maj7", source: "Lydian/major",    use: "Imaj7" },
  { root: 0,  quality: "min7", source: "Dorian/minor",    use: "i min7" },
  { root: 0,  quality: "minMaj7", source: "melodic minor",use: "i(maj7) — melodic-minor tonic" },
  { root: 3,  quality: "maj7", source: "Phrygian",        use: "♭IImaj7" },
  { root: 5,  quality: "min7", source: "Dorian",          use: "ii min7" },
  { root: 5,  quality: "hdim7",source: "minor ii–V",      use: "Half-dim ii (minor ii-V)", resolve: 13 },
  { root: 8,  quality: "maj7", source: "parallel minor",  use: "♭IIImaj7" },
  { root: 5,  quality: "maj7", source: "Lydian / V-of-V", use: "IImaj7" },
  { root: 10, quality: "maj7", source: "chromatic mediant", use: "IIImaj7" },
  { root: 18, quality: "maj7", source: "Lydian",          use: "Vmaj7 (♯11 sound)" },
  { root: 23, quality: "maj7", source: "chromatic mediant", use: "VImaj7" },
  { root: 13, quality: "min7", source: "parallel minor",  use: "iv min7 (pop/R&B)" },
  { root: 13, quality: "min6", source: "Dorian/minor",    use: "iv6 (line cliché)" },
  { root: 13, quality: "maj7", source: "Lydian",          use: "IVmaj7" },
  { root: 21, quality: "maj7", source: "parallel minor",  use: "♭VImaj7" },
  { root: 26, quality: "maj7", source: "Mixolydian",      use: "♭VIImaj7" },
  // ── 7-limit dominant / applied-dominant color ──
  { root: 18, quality: "dom7", source: "dominant",        use: "True 4:5:6:7 dominant", resolve: 13 },
  { root: 0,  quality: "dom7", source: "applied / Mixo",  use: "I7 (V/IV, blues tonic)", resolve: 13 },
  { root: 5,  quality: "dom7", source: "applied",         use: "Secondary dominant (V/V)", resolve: 13 },
  { root: 10, quality: "dom7", source: "applied",         use: "Secondary dominant (V/vi)", resolve: 13 },
  { root: 23, quality: "dom7", source: "applied",         use: "Secondary dominant (V/ii)", resolve: 13 },
  { root: 28, quality: "dom7", source: "applied",         use: "Secondary dominant (V/iii)", resolve: 13 },
  { root: 13, quality: "dom7", source: "Lydian/blues",    use: "IV7 (Lydian/blues dominant)" },
  { root: 26, quality: "dom7", source: "backdoor",        use: "Backdoor dominant", resolve: 5 },
  { root: 3,  quality: "dom7", source: "tritone sub",     use: "Tritone sub (near-just)", resolve: -3 },
  { root: 21, quality: "dom7", source: "Aug-6th",         use: "German aug-6th (4:5:6:7)", resolve: -3 },
  { root: 28, quality: "hdim7",source: "melodic minor",   use: "Leading-tone ø7", resolve: 3 },
  { root: 15, quality: "hdim7",source: "applied",         use: "Secondary leading-tone ø7", resolve: 3 },
  { root: 2,  quality: "hdim7",source: "applied",         use: "Secondary leading-tone ø7", resolve: 3 },
  // ── 7-limit subminor / supermajor / utonal color (always borrowed) ──
  { root: 0,  quality: "sub",  source: "septimal/blues",  use: "Subminor tonic" },
  { root: 5,  quality: "sub",  source: "septimal",        use: "Subminor ii" },
  { root: 13, quality: "sub",  source: "septimal",        use: "Subminor iv" },
  { root: 18, quality: "sub",  source: "septimal",        use: "Subminor v" },
  { root: 23, quality: "sub",  source: "septimal",        use: "Subminor vi" },
  { root: 0,  quality: "sub7", source: "septimal",        use: "Subminor-7 tonic" },
  { root: 0,  quality: "sup",  source: "septimal",        use: "Supermajor tonic" },
  { root: 13, quality: "sup",  source: "septimal",        use: "Supermajor IV" },
  { root: 18, quality: "sup",  source: "septimal",        use: "Supermajor V" },
  { root: 0,  quality: "utonal7", source: "subharmonic",  use: "Utonal (subharmonic) tetrad" },
  // ── 11-limit neutral / maqam color (always borrowed) ──
  { root: 0,  quality: "neu",  source: "Rast / neutral",  use: "Neutral tonic" },
  { root: 5,  quality: "neu",  source: "Bayati",          use: "Neutral ii" },
  { root: 8,  quality: "neu",  source: "neutral",         use: "Neutral ♭III" },
  { root: 13, quality: "neu",  source: "neutral",         use: "Neutral IV" },
  { root: 18, quality: "neu",  source: "neutral",         use: "Neutral V" },
  { root: 21, quality: "neu",  source: "neutral",         use: "Neutral ♭VI" },
  { root: 26, quality: "neu",  source: "neutral",         use: "Neutral ♭VII" },
  { root: 0,  quality: "neu7", source: "maqam Rast",      use: "Rast tetrad (tonic)" },
  { root: 18, quality: "neu7", source: "neutral",         use: "Neutral-7 on V" },
  { root: 13, quality: "dom7s11", source: "Lydian (just)",use: "IV7♯11 (just Lydian dom)" },
  { root: 18, quality: "dom7s11", source: "Lydian dom",   use: "Lydian dominant ♯11" },
  { root: 18, quality: "over11", source: "overtone",      use: "Undecimal dominant (to 11)" },
  // ── chords ROOTED on a microtonal (7/11-limit) degree (off the chain
  //    of fifths — exotic, most at home in maqam/xen practice) ──────────
  { root: 9,  quality: "neu",  limit: 11, source: "maqam Sikah",     use: "Neutral mediant (Sikah — built on n3)" },
  { root: 27, quality: "neu",  limit: 11, source: "neutral root",    use: "Neutral chord on the neutral 7th" },
  { root: 14, quality: "maj",  limit: 11, source: "undecimal root",  use: "Major on the 11th degree (11/8)" },
  { root: 25, quality: "dom7", limit: 7,  source: "harmonic-7 root",  use: "Dom7 on the harmonic 7th (subtonic)" },
  { root: 6,  quality: "maj",  limit: 7,  source: "septimal root",    use: "Major on the supermajor 2nd (8/7)" },
  { root: 7,  quality: "min",  limit: 7,  source: "septimal root",    use: "Minor on the subminor 3rd (7/6)" },
  { root: 24, quality: "maj",  limit: 7,  source: "septimal root",    use: "Major on the supermajor 6th (12/7)" },
];

/* ── Modulations (key changes) ──────────────────────────────────────
   `scales` lists the destination tonalities you can establish on the
   new tonic — you're not limited to major. */
export interface Modulation { target: number; limit: Limit; scales: string[]; name: string; }
export const MODULATIONS: Modulation[] = [
  // 5-limit
  { target: 18, limit: 5,  scales: ["major", "minor", "mixolydian"],          name: "Dominant (to the 5th)" },
  { target: 13, limit: 5,  scales: ["major", "minor", "lydian"],              name: "Subdominant (to the 4th)" },
  { target: 5,  limit: 5,  scales: ["major", "minor", "dorian"],              name: "Supertonic — up a whole tone" },
  { target: 26, limit: 5,  scales: ["major", "minor", "mixolydian"],          name: "Subtonic — down a whole tone" },
  { target: 10, limit: 5,  scales: ["major", "minor", "harmonicMajor"],       name: "Chromatic mediant (♯ side)" },
  { target: 8,  limit: 5,  scales: ["major", "minor", "dorian"],              name: "Relative major / mediant (♭III)" },
  { target: 23, limit: 5,  scales: ["minor", "major", "dorian"],              name: "Relative minor / submediant" },
  { target: 21, limit: 5,  scales: ["major", "minor", "lydian"],              name: "Flat submediant (♭VI)" },
  { target: 3,  limit: 5,  scales: ["major", "phrygian", "neapolitanMajor"],  name: "Neapolitan (♭II)" },
  // 7-limit
  { target: 15, limit: 7,  scales: ["major", "minor", "lydianDominant"],      name: "Septimal tritone substitution" },
  { target: 6,  limit: 7,  scales: ["major", "minor"],                        name: "Supermajor second (8/7)" },
  { target: 7,  limit: 7,  scales: ["minor", "major", "dorian"],              name: "Subminor third (7/6)" },
  { target: 25, limit: 7,  scales: ["major", "mixolydian", "lydianDominant"], name: "Harmonic seventh (7/4)" },
  { target: 24, limit: 7,  scales: ["major", "minor"],                        name: "Supermajor sixth (12/7)" },
  // 11-limit (neutral / maqam)
  { target: 9,  limit: 11, scales: ["rast", "sikah"],                         name: "Neutral mediant — maqam Sikah" },
  { target: 14, limit: 11, scales: ["rast", "lydian", "nikriz"],             name: "Undecimal — 11th harmonic" },
  { target: 4,  limit: 11, scales: ["bayati", "saba"],                        name: "Neutral second — maqam Bayati" },
  { target: 27, limit: 11, scales: ["rast", "hijaz"],                         name: "Neutral seventh" },
];

/** Cents of a 31-EDO step count, rounded. */
export function cents(steps: number): number { return Math.round(steps * 1200 / 31); }

// ── EDO-general conversion ──────────────────────────────────────────
// The tables above encode musical knowledge in 31-EDO steps; these map them
// onto any (meantone) EDO so the Modulation tab works beyond 31-EDO.

/** Map a 31-EDO step (root offset, scale degree, …) to the nearest step of
 *  another EDO, via cents.  31-EDO is meantone so this preserves intent. */
export function toEdoStep(step31: number, edo: number): number {
  return Math.round((((step31 % 31) + 31) % 31) * edo / 31);
}
/** Realise a chord ratio (e.g. "4:5:6:7") as nearest steps in an EDO. */
export function chordStepsForEdo(ratio: string, edo: number): number[] {
  const parts = ratio.split(":").map(Number);
  if (parts.some(n => !isFinite(n)) || parts[0] === 0) return [];
  return parts.map(p => Math.round(edo * Math.log2(p / parts[0])));
}
/** A chord's tones as absolute steps from the tonic in an EDO (root at `root`,
 *  itself a 31-EDO degree that gets mapped to this EDO). */
export function tonicStepsEdo(root31: number, quality: string, edo: number): number[] {
  const r = toEdoStep(root31, edo);
  return chordStepsForEdo(qualityChord(quality).ratio, edo).map(s => ((r + s) % edo + edo) % edo);
}
/** Per-tone cents deviation of a chord's EDO realization from its pure ratio. */
export function ratioCentsPerToneEdo(ratio: string, steps: number[], edo: number): number[] {
  const parts = ratio.split(":").map(Number);
  if (parts.some(n => !isFinite(n)) || parts.length !== steps.length) return steps.map(() => 0);
  return steps.map((s, i) => Math.round(s * 1200 / edo - 1200 * Math.log2(parts[i] / parts[0])));
}
/** Is (root, quality) entirely within the home-mode scale at this EDO? */
export function isDiatonicEdo(root31: number, quality: string, mode: Mode, edo: number): boolean {
  const scale = new Set(SCALES[mode].steps.map(s => toEdoStep(s, edo)));
  const r = toEdoStep(root31, edo);
  return chordStepsForEdo(qualityChord(quality).ratio, edo).every(s => scale.has(((r + s) % edo + edo) % edo));
}
