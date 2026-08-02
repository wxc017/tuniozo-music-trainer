// ── 3- and 4-part chord structures (M-Lode + over-bass) ──────────────────
// Reference catalogue for the "3-, 4-Part Chords" tab.  Structures are stored
// as C-reference note letters in IDENTITY (stacked) order.  For over-bass
// families the UI shows the re-rooting: the upper scale degrees equal a local
// chord formula (`local`) with the interval spacing between its notes, built
// on scale degree `at`.  No note names, no solfège — degrees + intervals only.

export interface ChordStruct {
  id: string;
  roman?: string;      // family index (TBN I, SBN VIII, …) — rendered italic
  name: string;        // construction label, e.g. "min7 shell", "major triad"
  upper: string[];     // identity-order notes (bass excluded for over-bass)
  over?: boolean;      // true = bass + a 3-note upper structure
  at?: string;         // scale-degree Roman the upper structure sits on (italic)
  local?: string[];    // local chord formula of the upper structure (over-bass)
  degFull?: string;    // full chord-formula degrees for base (non-over) structures
}
export interface StructFamily {
  key: string;
  label: string;
  color: string;
  desc: string;
  members: ChordStruct[];
}

const BLUE = "#79a4ff";     // triad / TBN
const TEAL = "#40cfb0";     // quartal / QBN
const ORANGE = "#f0a15b";   // shell / SBN
const MAGENTA = "#dc86cd";  // cluster / CBN
const GOLD = "#d7ac52";     // root-position base structures

export const THREE_PART: StructFamily[] = [
  { key: "TRIAD", label: "Triad", color: BLUE, desc: "stacked thirds", members: [
    { id: "triad", name: "major triad", degFull: "1·3·5", upper: ["C","E","G"] },
  ] },
  { key: "SHELL", label: "7th-shells", color: ORANGE, desc: "a seventh minus one chord tone", members: [
    { id: "no5", name: "7th, no 5th", degFull: "1·3·7", upper: ["C","E","B"] },
    { id: "no3", name: "7th, no 3rd", degFull: "1·5·7", upper: ["C","G","B"] },
  ] },
  { key: "QUARTAL", label: "4ths", color: TEAL, desc: "stacked fourths", members: [
    { id: "quartal3", name: "3-part 4ths", degFull: "1·4·7", upper: ["C","F","B"] },
  ] },
  { key: "CLUSTER", label: "Clusters", color: MAGENTA, desc: "three adjacent steps", members: [
    { id: "cluster3", name: "spread cluster", degFull: "1·2·3", upper: ["C","D","E"] },
  ] },
];

export const FOUR_PART: StructFamily[] = [
  { key: "BASE", label: "Base", color: GOLD, desc: "stacked intervals", members: [
    { id: "seventh",  name: "7th chord",      degFull: "1·3·5·7",  upper: ["C","E","G","B"] },
    { id: "quartal4", name: "4-part 4ths",    degFull: "1·4·7·10", upper: ["C","F","B","E"] },
    { id: "cluster4", name: "spread cluster", degFull: "1·2·3·4",  upper: ["C","D","E","F"] },
  ] },
  { key: "TBN", label: "TBN", color: BLUE, desc: "triad over bass", members: [
    { id: "tbn1", roman: "I",   over: true, at: "V",    name: "major triad",      upper: ["G","B","D"], local: ["1","3","5"] },
    { id: "tbn2", roman: "II",  over: true, at: "vii°", name: "diminished triad", upper: ["B","D","F"], local: ["1","♭3","♭5"] },
    { id: "tbn3", roman: "III", over: true, at: "ii",   name: "minor triad",      upper: ["D","F","A"], local: ["1","♭3","5"] },
  ] },
  { key: "QBN", label: "QBN", color: TEAL, desc: "quartal trichord over bass", members: [
    { id: "qbn1", roman: "I",   over: true, at: "iii", name: "quartal 4ths", upper: ["E","A","D"], local: ["1","4","♭7"] },
    { id: "qbn2", roman: "II",  over: true, at: "vi",  name: "quartal 4ths", upper: ["A","D","G"], local: ["1","4","♭7"] },
    { id: "qbn3", roman: "III", over: true, at: "vii", name: "quartal 4ths", upper: ["B","E","A"], local: ["1","4","♭7"] },
  ] },
  { key: "SBN", label: "SBN", color: ORANGE, desc: "7th-shell over bass", members: [
    { id: "sbn1", roman: "I",    over: true, at: "iii",  name: "min7 shell",  upper: ["E","G","D"], local: ["1","♭3","♭7"] },
    { id: "sbn2", roman: "II",   over: true, at: "iii",  name: "min7 shell",  upper: ["E","B","D"], local: ["1","5","♭7"] },
    { id: "sbn3", roman: "III",  over: true, at: "V",    name: "dom7 shell",  upper: ["G","D","F"], local: ["1","5","♭7"] },
    { id: "sbn4", roman: "IV",   over: true, at: "vii",  name: "min7 shell",  upper: ["B","D","A"], local: ["1","♭3","♭7"] },
    { id: "sbn5", roman: "V",    over: true, at: "IV",   name: "maj7 shell",  upper: ["F","A","E"], local: ["1","3","7"] },
    { id: "sbn6", roman: "VI",   over: true, at: "vi",   name: "min7 shell",  upper: ["A","E","G"], local: ["1","5","♭7"] },
    { id: "sbn7", roman: "VII",  over: true, at: "V",    name: "dom7 shell",  upper: ["G","B","F"], local: ["1","3","♭7"] },
    { id: "sbn8", roman: "VIII", over: true, at: "vii°", name: "m7♭5 shell",  upper: ["B","F","A"], local: ["1","♭5","♭7"] },
  ] },
  { key: "CBN", label: "CBN", color: MAGENTA, desc: "cluster over bass", members: [
    { id: "cbn1", roman: "I",   over: true, at: "iii", name: "cluster", upper: ["E","F","G"], local: ["1","♭2","♭3"] },
    { id: "cbn2", roman: "II",  over: true, at: "IV",  name: "cluster", upper: ["F","G","A"], local: ["1","2","3"] },
    { id: "cbn3", roman: "III", over: true, at: "V",   name: "cluster", upper: ["G","A","B"], local: ["1","2","3"] },
  ] },
];

// ── Structure Roman numerals ─────────────────────────────────────────
// One glyph naming a structure: the scale degree its ROOT POSITION sits on, as
// an italic capital Roman, with an italic superscript family letter and member
// index.  V-superscript-T1 is "the first triad-over-bass structure, rooted on
// V".  Inversions append the app's usual /3rd · /5th · /7th ordinals.
//
// Root-position families (the 3-Part catalogue) are all built on the tonic, so
// they carry I with the same superscript: I-Q1 is the 3-part stack of fourths.
export const OB_FAMILY_LETTER: Record<string, string> = { TBN: "T", QBN: "Q", SBN: "S", CBN: "C" };
/** Root-position structures are tagged per MEMBER, not per family: the 4-part
 *  base family holds a 7th chord, a quartal stack and a cluster side by side.
 *  The triad and the 7th chord are deliberately absent — a plain tertian stack
 *  IS just its Roman numeral, and this notation exists to mark the ones that
 *  aren't tertian.  3- and 4-part versions share a tag on purpose (both quartal
 *  stacks are I-Q); the voice count is already visible in the degree formula. */
export const OB_MEMBER_LETTER: Record<string, string> = {
  no5: "S", no3: "S", quartal3: "Q", cluster3: "C",    // 3-part
  quartal4: "Q", cluster4: "C",                         // 4-part base
};
/** Family index ("VIII") → its Arabic superscript ("8"). */
const OB_ROMAN_N: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };
export const obMemberIndex = (roman?: string, fallback?: number): string =>
  roman ? String(OB_ROMAN_N[roman] ?? roman) : fallback != null ? String(fallback) : "";

/** The tag for a structure: its letter, plus an index ONLY when that letter
 *  names more than one structure in the family.  There is a single 3-part
 *  quartal stack, so it is I-Q with no number; there are eight shells over a
 *  bass, so they are S1..S8.  Returns null for anything untagged (triad, 7th). */
export function obTag(famKey: string, m: ChordStruct, siblings: readonly ChordStruct[]):
  { letter: string; index: string } | null {
  const letterOf = (s: ChordStruct) => OB_MEMBER_LETTER[s.id] ?? OB_FAMILY_LETTER[famKey] ?? "";
  const letter = letterOf(m);
  if (!letter) return null;
  const sameLetter = siblings.filter(s => letterOf(s) === letter);
  const index = sameLetter.length > 1
    ? obMemberIndex(m.roman, sameLetter.indexOf(m) + 1)
    : "";
  return { letter, index };
}
/** The degree the structure roots on, as a bare capital Roman.  Quality marks
 *  (case, °) are dropped: the family letter + member index already say what the
 *  upper structure is, so repeating it in the numeral says it twice. */
export const obRootDegree = (at?: string): string =>
  (at ?? "").replace(/[^ivxIVX]/g, "").toUpperCase();

/** Every structure in BOTH catalogues, keyed by chord id.  The Sing view's
 *  chord/cycle titles read this rather than keeping their own copy of the
 *  roman/degree fields — a second copy is how the two drifted apart (the Sing
 *  table stored TBN I as the stacked 1·5·7·9 while its closed voicing is
 *  1·2·5·7, which is what made its inversions read /9th instead of /2nd). */
export const OB_BY_ID: ReadonlyMap<string, { famKey: string; m: ChordStruct; siblings: readonly ChordStruct[] }> =
  new Map([...THREE_PART, ...FOUR_PART].flatMap(f =>
    f.members.map(m => [m.id, { famKey: f.key, m, siblings: f.members }] as const)));

const OB_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const OB_DEG: Record<string, string> = { C: "1", D: "9", E: "3", F: "11", G: "5", A: "13", B: "7" };
const OB_IVL = ["P8", "m2", "M2", "m3", "M3", "P4", "TT", "P5", "m6", "M6", "m7", "M7"];

/** C-major scale degree ("1".."13") for a note letter. */
export const obDegree = (note: string): string => OB_DEG[note];

/** Interval spacing along the notes AS GIVEN (identity order). */
export function structIntervals(notes: string[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < notes.length; i++) {
    out.push(OB_IVL[(((OB_PC[notes[i]] - OB_PC[notes[i - 1]]) % 12) + 12) % 12]);
  }
  return out;
}
