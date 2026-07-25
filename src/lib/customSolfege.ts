// ── Region-centered neutral-consonant solfège ─────────────────────
// A reinvention of Kite's uniform solfège along Universal-solfège lines:
//   • the CONSONANT names the interval REGION (Margo Schulter's regions);
//   • the vowel "-a" is that region's NEUTRAL / central prototype;
//   • the vowel ladder u · o · a · e · i = -- · - · center · + · ++ gives the
//     fine ± position within the region (Kite's up/down alterations, re-centered
//     on each region rather than on major/minor).  The ladder is ordered by
//     vowel BRIGHTNESS (rising F2: u < o < a < e < i) so that flat = darker /
//     lower-sounding and sharp = brighter / higher-sounding — the syllable's
//     timbre is iconic for the direction it means (Ohala's frequency code).
//
// Neutral degrees get their OWN consonants so they read as characters in their
// own right — NOT as alterations of the neighbouring major/minor.  Deriving them
// from a neighbour (e.g. voicing Fr→Vr) makes a minimal pair, which the ear
// files as "a tweaked minor"; a phonetically distant consonant makes its own
// category.  The neutrals take a reserved voiced/"colourful" family (iconic for
// the 11-limit exotic intervals that live in the neutral bands):
//   2nd  K(minor)   V(neutral /v/)   R(major)
//   3rd  N          J(neutral /dʒ/)  M
//   6th  B          G(neutral /g/)   L
//   7th  Y          W(neutral /w/)   T
// Each shares nothing with its degree-neighbours.  Onsets are chosen for
// singability and mutual distinctness: the minor 2nd is the clean stop /k/ "Ka"
// (not the effortful cluster "Fr", whose Fru/Fro didn't roll); the neutral 2nd
// is /v/ (not /z/, which clashed with the 5th "Sa"); the minor 6th is /b/ (not
// "Fl", which crowded the /f/ family and made the r/l pair Fra/Fla); the minor
// 7th is the glide /j/ "Ya" (not the low-sonority /θ/ "Tha", which echoed "Da").
// The two 7th glides Y/W are acoustically well separated (palatal vs labiovelar);
// their one weak spot is the up-shade melt "Yi"/"Wu" — rare enough to accept.

import { REGIONS, type Region } from "./intervalSpectrum";

/** Region name → onset consonant.  "-a" appended = the region's center syllable. */
const CONS: Record<string, string> = {
  "Minor Seconds": "K",      // Ka — clean single stop (Ku/Ko/Ka/Ke/Ki roll easily); ≠ Va/Ra
  "Neutral Seconds": "V",    // Va — own character (voiced; not derived from K/R; ≠ Sa)
  "Major Seconds": "R",
  "Minor Thirds": "N",
  "Neutral Thirds": "J",     // Ja — own character (not derived from N/M)
  "Major Thirds": "M",
  "Perfect Fourths": "F",
  "Tritonic Region": "P",   // one region: Pu/Po/Pa/Pe/Pi across the whole tritone (no aug4/dim5 split)
  "Perfect Fifths": "S",
  "Minor Sixths": "B",       // Ba — voiced stop; ≠ Fr/Fl so no /f/ crowding, no r/l pair
  "Neutral Sixths": "G",     // Ga (hard g) — own character (not derived from B/L)
  "Major Sixths": "L",
  "Minor Sevenths": "Y",     // Ya — voiced glide, singable; ≠ Da, ≠ Wa/Ta
  "Neutral Sevenths": "W",   // Wa — own character (not derived from Y/T; ≠ Va)
  "Major Sevenths": "T",

  // Transitional "between" regions — only the ones that (a) land on real EDO
  // steps (esp. 24-EDO's interseptimals & superfourth) and (b) still have a
  // distinct, singable onset left.  They take "marked" onsets (an affricate/
  // fricative or a consonant+liquid cluster) — iconic for these unstable,
  // in-between 11/13-limit intervals, and kept clear of the sibilants S/Z so
  // nothing clashes.  Each emits a single centre syllable "C + a" (no ± ladder;
  // the bands are narrow).
  // The tiny comma/diesis and octave-neighbour bands stay empty: no clean onset
  // remains and they're almost never sung as scale degrees.
  // Singable-single onsets are exhausted here, so the two intervals that flank
  // the fifth (both border S) take distinct, neighbour-clear CLUSTER onsets:
  "Equable Heptatonic": "H",       // Ha — equable 2nd/7th (≈171¢ / 1029¢)
  "Interseptimal (M2–m3)": "Ch",   // Cha — semifourth  (≈250¢, 24edo step 5)
  "Interseptimal (M3–4)": "Zh",    // Zha — semisixth   (≈454¢, 24edo step 9)
  "Superfourths": "Br",            // Bra — superfourth (≈544¢ 11/8, 24edo step 11)
  "Subfifths": "Tr",               // Tra — subfifth    (≈649¢ 16/11, 24edo step 13)
  "Interseptimal (5–m6)": "Gr",    // Gra — semitenth   (≈746¢, 24edo step 15)
  "Interseptimal (M6–m7)": "Pr",   // Pra — semitwelfth (≈950¢, 24edo step 19)

  // Near-anchor microtones reuse the unison/octave consonant D (no new onset),
  // the vowel read as an alteration of the NEAREST anchor — sharp of unison
  // (comma → De, diesis → Di) or flat of octave (8ve−comma → Do, 8ve−diesis →
  // Du) — exactly like the main ladder's flat = o/u, sharp = e/i.
  //   seam ascending:  Da(0) · De · Di … Du · Do · Da(1200)
  "Commas": "D",                   // De — barely-sharp unison (small +)
  "Dieses": "D",                   // Di — diesis (≈50¢, 24edo step 1; larger ++)
  "Octave less diesis": "D",       // Du — 8ve − diesis (≈1150¢, 24edo step 23; large −−)
  "Octave less comma": "D",        // Do — 8ve − comma (small −)
};

/** Between-region vowel override.  Most transitional bands use their centre
 *  "-a"; the four near-anchor bands take a sharp/flat vowel relative to the
 *  unison/octave anchor (see CONS). */
const BETWEEN_VOWEL: Record<string, string> = {
  "Commas": "e", "Dieses": "i", "Octave less diesis": "u", "Octave less comma": "o",
};

/** Human-readable row label per region. */
const PRETTY: Record<string, string> = {
  "Minor Seconds": "minor 2nd",
  "Neutral Seconds": "neutral 2nd",
  "Major Seconds": "major 2nd",
  "Minor Thirds": "minor 3rd",
  "Neutral Thirds": "neutral 3rd",
  "Major Thirds": "major 3rd",
  "Perfect Fourths": "perfect 4th",
  "Tritonic Region": "tritone",
  "Perfect Fifths": "perfect 5th",
  "Minor Sixths": "minor 6th",
  "Neutral Sixths": "neutral 6th",
  "Major Sixths": "major 6th",
  "Minor Sevenths": "minor 7th",
  "Neutral Sevenths": "neutral 7th",
  "Major Sevenths": "major 7th",
};

/** The main interval regions we assign a consonant to, in ascending order. */
const MAIN: Region[] = REGIONS.filter(r => r.kind === "main" && CONS[r.name]);

/** The transitional "between" regions we've given a consonant to (see CONS). */
const BETWEEN: Region[] = REGIONS.filter(r => r.kind === "between" && CONS[r.name]);

const VOWELS = ["u", "o", "a", "e", "i"]; // index 0..4  ⇒  -- - center + ++  (by rising brightness)

export interface SolfegeSlot {
  region: string;   // region name (Schulter)
  label: string;    // pretty label ("neutral 3rd")
  cons: string;     // onset consonant ("Ny")
  base: string;     // center syllable ("Nya")
  lo: number;
  hi: number;
  center: number;
}

/** Ordered rows for the chart (main regions only; unison/octave handled by callers). */
export const SOLFEGE_SLOTS: SolfegeSlot[] = MAIN.map(r => ({
  region: r.name,
  label: PRETTY[r.name] ?? r.name,
  cons: CONS[r.name],
  base: CONS[r.name] + "a",
  lo: r.lo,
  hi: r.hi,
  center: (r.lo + r.hi) / 2,
}));

/** The region a pitch belongs to: the containing main region, else the nearest
 *  by center (so transitional/"between" cents fold to their closest region). */
function regionFor(cents: number): Region | null {
  const c = ((cents % 1200) + 1200) % 1200;
  const inside = MAIN.find(r => c >= r.lo && c <= r.hi);
  if (inside) return inside;
  let best: Region | null = null, bd = Infinity;
  for (const r of MAIN) {
    const d = Math.abs(c - (r.lo + r.hi) / 2);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

/** The MAIN region whose [lo,hi] actually contains the pitch (no folding), or
 *  null if the pitch sits in a transitional "between" region. */
export function mainRegionContaining(cents: number): string | null {
  const c = ((cents % 1200) + 1200) % 1200;
  return MAIN.find(r => c >= r.lo && c <= r.hi)?.name ?? null;
}

/** A *filled* "between" region (interseptimal/superfourth/equable) containing
 *  the pitch, or null.  MAIN regions win where ranges overlap (e.g. Equable vs
 *  Neutral 2nd), so diatonic pitches keep their degree syllable. */
export function betweenRegionContaining(cents: number): string | null {
  const c = ((cents % 1200) + 1200) % 1200;
  if (MAIN.some(r => c >= r.lo && c <= r.hi)) return null;
  return BETWEEN.find(r => c >= r.lo && c <= r.hi)?.name ?? null;
}

/** The centre syllable ("C + a") for a between region, or "" if it has no
 *  consonant (the still-empty comma/diesis/octave-neighbour bands). */
export function betweenSyllable(regionName: string): string {
  return CONS[regionName] ? CONS[regionName] + (BETWEEN_VOWEL[regionName] ?? "a") : "";
}

/** Region name a pitch maps to (for bucketing chart rows). */
export function slotRegionFor(cents: number): string {
  const c = ((cents % 1200) + 1200) % 1200;
  if (c < 6 || c > 1194) return "";       // unison / octave anchors
  return regionFor(c)?.name ?? "";
}

/** Vowel index (0..4) for a pitch within its region: uses the region's
 *  small/middle/large sub-bands (→ o / a / u), with e / i past the edges.
 *  The MIDDLE band is inclusive on both edges so that a value sitting exactly on
 *  a sub-band boundary (e.g. 12edo's 200¢ / 400¢ whole-region intervals) reads
 *  as the region's neutral center "-a", not as an alteration. */
function vowelIndex(cents: number, r: Region): number {
  const subs = r.subs;
  if (subs && subs.length >= 3) {
    const mid = subs[Math.floor((subs.length - 1) / 2)];
    if (cents < subs[0].lo) return 0;                        // u  (below region, darkest)
    if (cents > subs[subs.length - 1].hi) return 4;          // i  (above region, brightest)
    if (cents >= mid.lo && cents <= mid.hi) return 2;        // a  (center)
    return cents < mid.lo ? 1 : 3;                           // o (flat) / e (sharp)
  }
  const lo = r.lo + (r.hi - r.lo) / 3, hi = r.hi - (r.hi - r.lo) / 3;
  if (cents < r.lo) return 0;
  if (cents > r.hi) return 4;
  if (cents >= lo && cents <= hi) return 2;
  return cents < lo ? 1 : 3;
}

/** The region-centered solfège syllable for a pitch in cents. */
export function customSolfege(cents: number): string {
  const c = ((cents % 1200) + 1200) % 1200;
  if (c < 6 || c > 1194) return "Da";     // unison / octave
  // Main regions take priority (diatonic pitches keep their degree syllable).
  const inMain = MAIN.find(r => c >= r.lo && c <= r.hi);
  if (inMain) return CONS[inMain.name] + VOWELS[vowelIndex(c, inMain)];
  // A filled transitional region gets its centre syllable (usually "C + a";
  // the near-anchor bands use a brightness vowel — see BETWEEN_VOWEL).
  const between = BETWEEN.find(r => c >= r.lo && c <= r.hi);
  if (between) return CONS[between.name] + (BETWEEN_VOWEL[between.name] ?? "a");
  // Otherwise fold an unfilled transitional pitch to its nearest main region.
  const r = regionFor(c);
  return r ? CONS[r.name] + VOWELS[vowelIndex(c, r)] : "";
}
