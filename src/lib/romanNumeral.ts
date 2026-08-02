// ── Canonical Roman-numeral notation ─────────────────────────────────────────
//
// ONE definition of how this app writes a roman numeral, so every screen agrees.
// It grew up inside Spectrum Audiation (SolfaSpectrumChords) and was the only
// version that got all four parts right; everything else in the app either
// hand-authored its labels or derived case from the wrong question.  Extracted
// here so there is a single place to fix and a single place to read.
//
// A numeral is built from four independent pieces:
//
//   ↓ ♭ vii °
//   │ │ │   └─ QUALITY SYMBOL — ° diminished, ø half-diminished, + augmented,
//   │ │ │      taken from the chord's own 5th (and 7th, to tell ° from ø).
//   │ │ └───── DEGREE + CASE — which scale degree the root sits on, lowercase
//   │ │        when the chord's own 3rd is minor.  Case describes the CHORD,
//   │ │        never the size of the root's interval to the tonic: that is a
//   │ │        different question, and answering it there is why minor's v used
//   │ │        to print "V" and major's vii° printed "VII".
//   │ └─────── ACCIDENTAL — the degree measured against the major scale.
//   └───────── SPECTRUM BAND — ↓ small · bare centre · ↑ large.  12-EDO is the
//              centre tuning by definition, so all twelve of its degrees are bare.
//
// Inversion is appended separately by `inversionSlash` (I/3rd, I/5th …).

import { REGIONS } from "./intervalSpectrum";
import { sizedRoman } from "./chordNotation";

const MAIN_REGIONS = REGIONS.filter(r => r.kind === "main" && r.subs && r.subs.length === 3);

export const MAJOR_REF = [0, 2, 4, 5, 7, 9, 11];
export const ROMAN_UP = ["I", "II", "III", "IV", "V", "VI", "VII"];

const wrap = (x: number) => ((x % 1200) + 1200) % 1200;

/** Sub-band of a cents value: 0 small · 1 centre · 2 large, per the app's own
 *  spectrum regions (the split the spectrum strips draw).
 *
 *  The three sub-bands SHARE their boundaries (small.hi === middle.lo), and every
 *  12-EDO degree lands exactly ON one: 200 / 900 / 1100 sit at middle.lo, and
 *  300 / 800 / 1000 at middle.hi.  Testing them in order resolves a boundary to
 *  whichever band comes first, which made half the 12-EDO scale read "small"
 *  (↓II ↓VI ↓VII).  12-EDO is the CENTRE tuning by definition — every one of its
 *  notes is central — so middle is tested FIRST and a boundary lands there. */
export function subBandOf(centsFromTonic: number): number {
  const c = wrap(centsFromTonic);
  const r = MAIN_REGIONS.find(rg => c >= rg.lo && c <= rg.hi);
  if (!r?.subs) return 1;
  const [sm, mid] = r.subs;
  if (c >= mid.lo - 0.01 && c <= mid.hi + 0.01) return 1;
  return c <= sm.hi + 0.01 ? 0 : 2;
}

/** The ↓ / ↑ band arrow for a root, or "" when it sits centrally. */
export function bandArrow(centsFromTonic: number): string {
  const b = subBandOf(centsFromTonic);
  return b === 0 ? "↓" : b === 2 ? "↑" : "";
}

/** Accidental for a degree measured against the major scale. */
function accidentalFor(alt: number): string {
  return alt === -1 ? "♭" : alt === 1 ? "♯" : alt === -2 ? "♭♭" : alt === 2 ? "♯♯" : "";
}

/** ° / ø / + from a chord's own 5th and 7th (intervals above the root). */
function qualitySymbol(isMinor: boolean, fifth: number, seventh: number | null, dimSeventh: boolean): string {
  // ° on its own and with a diminished 7th, but ø when the 7th is minor —
  // minor's ii7 is iiø, not ii°.
  if (isMinor && fifth <= 650) return seventh !== null && !dimSeventh ? "ø" : "°";
  return !isMinor && fifth >= 750 ? "+" : "";
}

/** Sized numeral for a bare interval, with the band arrow but NO chord context.
 *  Only for roots that aren't in the scale — prefer the chord-aware forms. */
export function romanBandArrow(centsFromTonic: number): string {
  const c = wrap(centsFromTonic);
  return bandArrow(c) + sizedRoman(c).replace(/^[sl]/, "");
}

/** Numeral for a chord on scale degree `dd` of a mode, given in SEMITONES.
 *  `mSemis` = the mode's degrees, `chordSemis` = the chord stacked from `dd`
 *  (root first — this form trusts the stack order). */
export function romanForDegree(mSemis: number[], dd: number, chordSemis: number[], rootCents: number): string {
  const root = chordSemis[0];
  const iv = (n: number) => ((n - root) % 12 + 12) % 12;
  const third = iv(chordSemis[1] ?? root + 4);
  const fifth = iv(chordSemis[2] ?? root + 7);
  const seventh = chordSemis.length > 3 ? iv(chordSemis[3]) : null;
  const isMinor = third <= 3;
  const sym = qualitySymbol(isMinor, fifth * 100, seventh === null ? null : seventh * 100, seventh === 9);
  return bandArrow(rootCents) + accidentalFor(mSemis[dd] - MAJOR_REF[dd])
    + (isMinor ? ROMAN_UP[dd].toLowerCase() : ROMAN_UP[dd]) + sym;
}

/** Numeral for a chord given in CENTS: `rootCents` above the tonic, `toneCents`
 *  its pitch-classes in any order, `scale` the mode's raw cents.  Prefer this —
 *  it doesn't assume the tones arrive stacked, so a voicing can't mislead it. */
export function romanForChordCents(rootCents: number, toneCents: number[], scale: number[]): string {
  const R = wrap(rootCents);
  const dd = scale.findIndex(c => Math.abs(wrap(c) - R) < 1);
  if (dd < 0) return romanBandArrow(rootCents);   // off-scale root: no degree to number
  // Pick chord members by interval RANGE, not by sorted index — a 9th chord's
  // pitch-classes sort to [0, 200, 400, 700, 1000], where index 1 is the 9th.
  const iv = toneCents.map(t => wrap(t - R)).sort((a, b) => a - b);
  const inRange = (lo: number, hi: number) => iv.find(x => x >= lo && x <= hi);
  const third = inRange(250, 500) ?? 400;
  const fifth = inRange(550, 850) ?? 700;
  const seventh = inRange(850, 1150) ?? null;
  const isMinor = third < 350;
  const sym = qualitySymbol(isMinor, fifth, seventh, seventh !== null && Math.abs(seventh - 900) <= 50);
  const alt = Math.round((wrap(scale[dd]) - MAJOR_REF[dd] * 100) / 100);
  return bandArrow(R) + accidentalFor(alt)
    + (isMinor ? ROMAN_UP[dd].toLowerCase() : ROMAN_UP[dd]) + sym;
}

/** Inversion as a slash plus the chord member in the bass, by ordinal:
 *  I/3rd = first inversion, I/5th = second, I/7th = third.  Root position is
 *  bare.  Read from the REAL bass tone, so a drop voicing that moves a
 *  different voice to the bottom is named by what you actually hear.
 *
 *  The ordinal is always WITHIN the octave — never /9th, /11th, /13th.  The bass
 *  is the lowest note by definition, so it cannot be a compound interval above
 *  the root, however the chord is spelled in stacked form.  TBN I stacks as
 *  1·5·7·9 but voices closed as 1·2·5·7, and its inversions are /2nd /5th /7th.
 *  The old buckets also called a 4th in the bass a "3rd", which mislabelled
 *  every quartal voicing. */
const GENERIC_ORDINAL = ["", "/2nd", "/2nd", "/3rd", "/3rd", "/4th", "/4th", "/5th", "/6th", "/6th", "/7th", "/7th"];
export function inversionSlash(rootCents: number, bassCents: number): string {
  const semis = Math.round(wrap(bassCents - rootCents) / 100) % 12;
  return GENERIC_ORDINAL[semis] ?? "";
}
