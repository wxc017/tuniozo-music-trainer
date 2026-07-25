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
