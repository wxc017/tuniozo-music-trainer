import { REGIONS, type Region } from "./intervalSpectrum";

// ── Shared interval quality codes ───────────────────────────────────
// One compact notation used by the Lumatone keyboards and the Interval
// Spectrum so naming stays consistent.
//
//   perfect degrees (1/4/5/8):  bare number; #/b = aug/dim; ##/bb = super/sub
//   sm Sm sM SM   = subminor / supraminor / submajor / supermajor
//   p  P          = Pythagorean minor / major
//   j  J          = classic (Just) minor / major
//   m  M          = generic minor / major (EDOs with no Pyth/classic split)
//   n  e  i       = neutral / equable / interseptimal
//   TT            = tritone

/** Convert a full interval name (e.g. "Submajor 3rd", "Perfect 5th",
 *  "Pythagorean minor 3rd") into its short code. */
export function toIntervalCode(name: string): string {
  if (!name) return "";
  const n = name.toLowerCase();
  if (/tritone/.test(n)) return "TT";
  const deg = /unison|prime/.test(n) ? "1"
    : /octave/.test(n) ? "8"
    : /(2nd|second)/.test(n) ? "2"
    : /(3rd|third)/.test(n) ? "3"
    : /(4th|fourth)/.test(n) ? "4"
    : /(5th|fifth)/.test(n) ? "5"
    : /(6th|sixth)/.test(n) ? "6"
    : /(7th|seventh)/.test(n) ? "7"
    : "";
  if (/interseptimal/.test(n)) return "i" + deg;
  if (/superfourth/.test(n)) return "S4";
  if (/subfifth/.test(n)) return "s5";
  // Perfect degrees use accidentals, not quality letters
  if (deg === "1" || deg === "4" || deg === "5" || deg === "8") {
    if (/aug|sharp/.test(n)) return "#" + deg;
    if (/dim|flat/.test(n)) return "b" + deg;
    if (/super|acute|greater|wide/.test(n)) return "##" + deg;
    if (/sub|grave|lesser|narrow/.test(n)) return "bb" + deg;
    return deg;
  }
  // Imperfect degrees (2/3/6/7)
  let q = "";
  if (/supermajor/.test(n)) q = "SM";
  else if (/submajor/.test(n)) q = "sM";
  else if (/supraminor/.test(n)) q = "Sm";
  else if (/subminor/.test(n)) q = "sm";
  else if (/equable/.test(n)) q = "e";
  else if (/neutral/.test(n)) q = "n";
  else if (/pythagorean/.test(n)) q = /minor/.test(n) ? "p" : "P";
  else if (/classic|ptolemaic|just/.test(n)) q = /minor/.test(n) ? "j" : "J";
  else if (/minor/.test(n)) q = "m";
  else if (/major/.test(n)) q = "M";
  else if (/(diminished|dim)/.test(n)) q = "d";
  else if (/(augmented|aug)/.test(n)) q = "A";
  if (deg) return q + deg;
  // between-region names
  if (/comma/.test(n)) return "c";
  if (/diesis/.test(n)) return "di";
  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3);
}

// Just-intonation landmarks (cents → code) used to name any pitch by the
// nearest just interval.  p/P = Pythagorean minor/major, j/J… here lowercase
// pairs: pm/pM = Pythagorean minor/major, jm/jM = just (5-limit) minor/major,
// sm/SM = subminor/supermajor, n = neutral, u = undecimal, perfect degrees bare.
const JUST: [number, string][] = [
  [0, "1"],
  [90, "pm2"], [112, "jm2"], [151, "n2"], [182, "jM2"], [204, "pM2"], [231, "SM2"],
  [267, "sm3"], [294, "pm3"], [316, "jm3"], [347, "n3"], [386, "jM3"], [408, "pM3"], [435, "SM3"],
  [471, "s4"], [498, "4"], [551, "S4"],
  [583, "d5"], [600, "TT"], [617, "A4"],
  [649, "s5"], [702, "5"], [729, "S5"],
  [765, "sm6"], [792, "pm6"], [814, "jm6"], [853, "n6"], [884, "jM6"], [906, "pM6"], [933, "SM6"],
  [969, "sm7"], [996, "pm7"], [1018, "jm7"], [1049, "n7"], [1088, "jM7"], [1110, "pM7"], [1137, "SM7"],
  [1200, "8"],
];

/** Name a pitch (in cents above the root) by its nearest just interval. */
export function nearestJustCode(cents: number): string {
  const c = ((cents % 1200) + 1200) % 1200;
  let best = JUST[0], bd = Infinity;
  for (const e of JUST) { const d = Math.abs(e[0] - c); if (d < bd) { bd = d; best = e; } }
  return best[1];
}

// ── Scale limit classification (Ptolemaic / Septimal / Undecimal) ────
// Group a scale by the most complex prime any degree reaches, using the SAME
// spectrum coder as the scale namer (fuzzyCode) so the name and the group
// always agree:
//   any neutral band (n / sn / ln)                       → Undecimal (11-limit)
//   any subminor (small-minor sm*) or supermajor (large-major lM*) band → Septimal
//   else 5-limit                                          → Ptolemaic.
// Tritones (T) are left out — at ~600¢ they don't pin a limit and would
// mis-flag diatonic Lydian/Locrian.
export type ScaleLimit = "Ptolemaic" | "Septimal" | "Undecimal";

/** Classify a scale (step set in an EDO) as Ptolemaic / Septimal / Undecimal. */
export function scaleLimit(steps: number[], edo: number): ScaleLimit {
  let septimal = false;
  for (const s of steps) {
    const code = fuzzyCode((s * 1200) / edo);
    if (/n/.test(code)) return "Undecimal";          // neutral band
    if (/^sm|^lM/.test(code)) septimal = true;       // subminor / supermajor band
  }
  return septimal ? "Septimal" : "Ptolemaic";
}

function modInverse(a: number, m: number): number | null {
  a = ((a % m) + m) % m;
  for (let x = 1; x < m; x++) if ((a * x) % m === 1) return x;
  return null;
}

/** Spell a perfect-class step (unison/4th/5th/octave, incl. aug/dim) by its
 *  circle-of-fifths position, so e.g. the augmented 4th is "#4" and the
 *  diminished 5th is "b5" — independent of EDO.  Returns null for steps that
 *  aren't a perfect-class interval (callers fall back to quality codes), or
 *  for multi-ring EDOs where the fifth doesn't generate every note. */
export function fifthSpelling(edo: number, step: number): string | null {
  const k = ((step % edo) + edo) % edo;
  if (k * 2 === edo) return "TT";              // exact half-octave
  const fifth = Math.round(edo * Math.log2(1.5));
  const inv = modInverse(fifth, edo);
  if (inv === null) return null;               // multi-ring (e.g. 34-EDO)
  let f = (k * inv) % edo;
  if (f > edo / 2) f -= edo;                   // signed, nearest 0
  const deg7 = (((f * 4) % 7) + 7) % 7;        // diatonic degree class
  let f0: number, degNum: string;
  if (deg7 === 0) { f0 = 0; degNum = k < edo / 2 ? "1" : "8"; }
  else if (deg7 === 3) { f0 = -1; degNum = "4"; }
  else if (deg7 === 4) { f0 = 1; degNum = "5"; }
  else return null;                            // not perfect-class → quality code
  // Only spell within the actual perfect-degree cents zones, so genuine 3rds/
  // 6ths (e.g. 8/5 = aug-5th enharmonic) stay quality-named, not "#5"/"b4".
  const cents = (k * 1200) / edo;
  const inZone = degNum === "4" || degNum === "5" ? cents >= 430 && cents <= 775
    : degNum === "1" ? cents <= 70 : cents >= 1130;
  if (!inZone) return null;
  const n = Math.round((f - f0) / 7);          // sharps (+) / flats (−)
  return (n > 0 ? "#".repeat(n) : n < 0 ? "b".repeat(-n) : "") + degNum;
}

/** A Schulter-inspired NOTE-name (not interval) for an EDO step: the NEAREST
 *  clean note name (a natural F C G D A E B, or a single #/b) plus a SIZE
 *  superscript saying which side of that note the step sits on:
 *    ""   central — within ½ comma of the exact (Pythagorean) note
 *    "s"  small   — the step is flatter than the note
 *    "l"  large   — the step is sharper than the note
 *  Each note centers a range; a flatter E reads "E·s", a sharper E "E·l".  So the
 *  50-EDO white keys read  C  D·s  E·s  F  G  A·s  B·s.  Returns `base` (render
 *  plainly) + `sup` (render as a superscript).  Works for EVERY EDO (no fifth-
 *  generation needed) — multi-ring tunings included. */
const PYTH_FIFTH_CENTS = 1200 * Math.log2(1.5);   // 701.955…
const FIFTH_LETTERS = "FCGDAEB";                   // chain order: F C G D A E B
export function sizedNoteName(edo: number, step: number): { base: string; sup: string } {
  const k = ((step % edo) + edo) % edo;
  const cents = (k * 1200) / edo;
  // No modInverse / fifth-generation needed: we spell each step by the NEAREST
  // circle-of-fifths note by CENTS, so this works for every EDO — including
  // multi-ring ones (34, 24, …) whose fifth doesn't reach every step.
  // Spell to the NEAREST circle-of-fifths note carrying at most ONE accidental
  // (naturals F C G D A E B, single #/b), chosen by cents with a per-accidental
  // penalty so a natural wins unless an accidental is clearly closer.  The
  // microtonal offset is carried by the superscript — that is the spectrum idea:
  // several nearby steps share a named region (e.g. D·-k / D / D·k), and those
  // "collisions" are expected, not a bug.  (Strict fifth-chain spelling is unique
  // but piles on double-sharps/flats — Dbb — which we avoid.)
  const circDev = (a: number, b: number) => ((a - b) % 1200 + 1800) % 1200 - 600;
  // Candidate notes = the 7 naturals (F C G D A E B) + the 5 flats (Bb Eb Ab Db
  // Gb) + the 5 sharps (F# C# G# D# A#).  We deliberately EXCLUDE the enharmonic
  // naturals (Fb Cb E# B#) and all double-accidentals so a step always spells to
  // a clean, near note (every nominal "centers a range").
  //
  // SPELLING uses the EDO's OWN fifth, not the pure Pythagorean one — otherwise a
  // meantone EDO (31, 50, 19, …) gets its accidentals backwards (Pythagorean has
  // C# above Db, but meantone has C# BELOW Db).  Using the tempered fifth lands
  // each accidental on its real side of the white keys, so a step above a white
  // key spells sharp and a step below one spells flat (per direct user request).
  const edoFifth = (Math.round(edo * Math.log2(1.5)) / edo) * 1200;
  let best: { base: string; f: number } | null = null, bestScore = Infinity;
  for (let f = -6; f <= 10; f++) {
    const letter = FIFTH_LETTERS[(((f + 1) % 7) + 7) % 7];
    const acc = Math.floor((f + 1) / 7);
    const posEdo = (((f * edoFifth) % 1200) + 1200) % 1200;
    const score = Math.abs(circDev(cents, posEdo)) + 10 * Math.abs(acc);  // mild natural preference
    if (score < bestScore) {
      bestScore = score;
      best = { base: letter + (acc > 0 ? "#".repeat(acc) : acc < 0 ? "b".repeat(-acc) : ""), f };
    }
  }
  // s/l size is measured off the note's PYTHAGOREAN position, so a meantone D
  // (an exact step, but flat of Pythagorean D) still reads "small".
  const posPyth = (((best!.f * PYTH_FIFTH_CENTS) % 1200) + 1200) % 1200;
  const d = circDev(cents, posPyth);
  // Superscript is ONLY the size of the offset from the nearest note: a sharper
  // step → "l" (large), a flatter step → "s" (small), within ½ comma → bare
  // ("just/central").  Each note CENTERS a range and the s/l mark which side of
  // it the step sits — no comma/diesis/interval codes (per direct user request:
  // "CDEFGAB are the center of a range, a flatter E is E small, a sharper E is E
  // large"; "D sm2 is bad notation — it should be Eb s").
  const TOL = 10.75;                                 // ≈ ½ syntonic comma central band
  const sup = d > TOL ? "l" : d < -TOL ? "s" : "";
  return { base: best!.base, sup };
}

/** ASCII→Unicode superscript for rendering a sized note name as a plain string
 *  (e.g. grid labels that can't host a <sup>): "D" + "-k" → "D⁻ᵏ".  Characters
 *  without a superscript form are left as-is. */
const SUPERSCRIPTS: Record<string, string> = {
  "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶",
  "7": "⁷", "8": "⁸", "9": "⁹", a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", h: "ʰ",
  i: "ⁱ", k: "ᵏ", l: "ˡ", m: "ᵐ", n: "ⁿ", o: "ᵒ", p: "ᵖ", r: "ʳ", s: "ˢ", t: "ᵗ", u: "ᵘ",
};
const toSuper = (s: string) => s.split("").map(ch => SUPERSCRIPTS[ch] ?? ch).join("");

/** Sized note name as a single display string with the superscript rendered in
 *  Unicode (for callers that take a plain string label). */
export function sizedNoteLabel(edo: number, step: number): string {
  const { base, sup } = sizedNoteName(edo, step);
  return base + (sup ? toSuper(sup) : "");
}

// Quality-prefix remap for the 41/53 short-code tables (s/m/Clm/u/n/Cl/M/S…)
const PREFIX: Record<string, string> = {
  s: "sm", m: "p", Clm: "j", u: "Sm", n: "n", Cl: "J", M: "P", S: "SM",
  Cm: "j", CM: "J",
};

/** Remap an already-short 41/53 table code (e.g. "Clm3" → "j3", "M3" → "P3",
 *  "u3" → "Sm3", "S3" → "SM3").  Leaves accidental/number codes untouched. */
export function recodeEdoTable(code: string): string {
  const cleaned = code.replace(/[↑↓]/g, "");   // no up/down notation — codes cover everything
  const m = cleaned.match(/^([A-Za-z]+)(.*)$/);
  if (!m) return cleaned;              // "1", "#1", "##4", "b5", "bbb5"…
  const [, prefix, rest] = m;
  return (PREFIX[prefix] ?? prefix) + rest;
}

/** small/center/large code for a region that has bands (cents outside the
 *  bands clamps to the small or large extreme). */
function posCodeForRegion(r: Region, c: number): string {
  const subs = r.subs!;
  // nearest band CENTER (ties → upper band), so values sitting exactly on a
  // band boundary (e.g. 12-EDO's 400¢) read as center, not edge.
  let idx = 0, bd = Infinity;
  for (let i = 0; i < subs.length; i++) {
    const d = Math.abs(c - (subs[i].lo + subs[i].hi) / 2);
    if (d <= bd) { bd = d; idx = i; }
  }
  const pos = idx === 0 ? "s" : idx >= subs.length - 1 ? "l" : "";   // center = bare
  const name = r.name;
  const ord = /Second/.test(name) ? "2" : /Third/.test(name) ? "3"
    : /Fourth/.test(name) ? "4" : /Fifth/.test(name) ? "5"
    : /Sixth/.test(name) ? "6" : /Seventh/.test(name) ? "7" : "";
  const base = /Tritonic/.test(name) ? "T"
    : /Minor/.test(name) ? "m" + ord
    : /Major/.test(name) ? "M" + ord
    : /Neutral/.test(name) ? "n" + ord
    : ord; // perfect 4th / 5th → bare degree
  return pos + base;
}

/** Position-based (Schulter spectrum) name for a pitch in cents.  Every pitch
 *  reads as small / center / large (s / c / l) of a degree's quality — a
 *  uniform grid across all tunings:
 *    minor 3rd → sm3 cm3 lm3   major 6th → sM6 cM6 lM6
 *    neutral 3rd → sn3 cn3 ln3   perfect 4th → s4 c4 l4   tritone → sT cT lT
 *  In-between zones (interseptimal, super-4th/sub-5th, equable) fold into the
 *  nearest region's extreme, e.g. interseptimal M2–m3 → lM2, super-4th → l4,
 *  sub-5th → s5.  Only true commas stay special (k comma, di diesis, 1, 8). */
export function fuzzyCode(cents: number): string {
  const c = ((cents % 1200) + 1200) % 1200;
  let best: Region | null = null, score = Infinity;
  for (const r of REGIONS) {
    const inside = c >= r.lo - 0.01 && c <= r.hi + 0.01;
    const center = (r.lo + r.hi) / 2;
    const s = Math.abs(c - center) - (inside ? 100000 : 0) - (r.kind === "main" ? 600 : 0);
    if (s < score) { score = s; best = r; }
  }
  if (!best) return "";
  if (best.subs && best.subs.length) return posCodeForRegion(best, c);
  return betweenCode(best, c);
}

/** Nearest spectrum region for a pitch in cents (containing region preferred,
 *  then main regions, then nearest center). */
function nearestRegion(c: number): Region | null {
  let best: Region | null = null, score = Infinity;
  for (const r of REGIONS) {
    const inside = c >= r.lo - 0.01 && c <= r.hi + 0.01;
    const s = Math.abs(c - (r.lo + r.hi) / 2) - (inside ? 100000 : 0) - (r.kind === "main" ? 600 : 0);
    if (s < score) { score = s; best = r; }
  }
  return best;
}

/** Constructed solfège for a pitch in cents (the "full gamut" system):
 *  class consonant + quality vowel + position suffix, e.g. minor 3rd small =
 *  Th+ai+s = "Thais"; perfect 4th middle = "Fo"; tritone = "Trai".  Special
 *  syllables for unison/comma/diesis/equable/interseptimal/octave fringes. */
export function solfegeName(cents: number): string {
  const c = ((cents % 1200) + 1200) % 1200;
  const best = nearestRegion(c);
  if (!best) return "";
  const name = best.name;

  // specials
  if (/Unison|Octave/.test(name) && !/less/.test(name)) return "A";
  if (/Commas/.test(name)) return "O";
  if (/Dieses/.test(name)) return "Ee";
  if (/Equable/.test(name)) return c < 600 ? "Ha" : "Ho";
  if (/Interseptimal/.test(name)) return c < 300 ? "Fe" : c < 500 ? "Ke" : c < 800 ? "Te" : "Twe";
  if (/Superfourth/.test(name)) return "Foo";
  if (/Subfifth/.test(name)) return "Fu";
  if (/Octave less diesis/.test(name)) return "Dee";
  if (/Octave less comma/.test(name)) return "Co";

  // main regions: consonant + vowel + position suffix
  const cons = /Tritonic/.test(name) ? "Tr" : /Second/.test(name) ? "S" : /Third/.test(name) ? "Th"
    : /Fourth/.test(name) ? "F" : /Fifth/.test(name) ? "F" : /Sixth/.test(name) ? "K" : /Seventh/.test(name) ? "V" : "";
  const vowel = /Minor|Tritonic/.test(name) ? "ai" : /Major/.test(name) ? "ay" : /Neutral/.test(name) ? "oo"
    : /Fourth/.test(name) ? "o" : /Fifth/.test(name) ? "i" : "";
  let suf = "";
  if (best.subs && best.subs.length) {
    let idx = 0, bd = Infinity;
    for (let i = 0; i < best.subs.length; i++) {
      const d = Math.abs(c - (best.subs[i].lo + best.subs[i].hi) / 2);
      if (d <= bd) { bd = d; idx = i; }
    }
    suf = idx === 0 ? "s" : idx >= best.subs.length - 1 ? "l" : "";
  }
  return cons + vowel + suf;
}

function betweenCode(best: Region, c: number): string {
  const name = best.name;

  // Between-regions with no bands:
  if (/Unison/.test(name)) return "1";
  if (/Octave/.test(name) && !/less/.test(name)) return "8";
  if (/Commas/.test(name)) return "k";       // near-unison comma only
  if (/Dieses/.test(name)) return "di";      // near-unison diesis only
  if (/Interseptimal/.test(name)) {          // i3 / i4 / i6 / i7 — the region's upper-edge degree
    const nums = name.match(/\d/g);
    return "i" + (nums ? nums[nums.length - 1] : "");
  }
  if (/Equable/.test(name)) return c < 600 ? "e2" : "e7";   // equable heptatonic
  // Tritone-flanking and near-octave between-regions get their OWN codes (never
  // fold into a neighbouring band — that double-named steps in fine EDOs):
  if (/Superfourth/.test(name)) return "sup4";  // super-fourth, between P4 and tritone
  if (/Subfifth/.test(name)) return "sub5";     // sub-fifth, between tritone and P5
  if (/Octave less diesis/.test(name)) return "-di";  // octave minus a diesis (mirror of "di")
  if (/Octave less comma/.test(name)) return "-k";    // octave minus a comma (mirror of "k")
  // anything else still folds to the nearest banded region's extreme
  let main: Region | null = null, md = Infinity;
  for (const r of REGIONS) {
    if (!r.subs || !r.subs.length) continue;
    const d = Math.abs(c - (r.lo + r.hi) / 2);
    if (d < md) { md = d; main = r; }
  }
  return main ? posCodeForRegion(main, c) : "";
}
