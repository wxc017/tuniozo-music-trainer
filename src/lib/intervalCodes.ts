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

// ── A FIXED Schulter-region → note map (the system is universal; EDOs fit in) ──
// Every pitch is classified into a Schulter spectrum region by its cents (via
// fuzzyCode); the region maps to a note name (naturals at the major/perfect
// regions, enharmonic sharps/flats at the minor/tritone regions, Gould-arrow
// notes for the fine regions between).  The small/large SUB-BAND of the region a
// pitch lands in is added as an s/l superscript.  Because it is keyed to cents,
// the SAME table names every EDO — the tunings just fit into it.
//
// SMuFL accidental glyphs (Private-Use Area — render in the "Bravura Text" font;
// letters fall back to the normal font automatically).  Standard accidentals are
// U+E260–E264; the Gould arrow quarter-tone accidentals are U+E270–E279.
const ACC = {
  flat: "", natural: "", sharp: "", dblSharp: "", dblFlat: "",
  flatUp: "", flatDown: "", natUp: "", natDown: "",
  sharpUp: "", sharpDown: "", dblSharpUp: "", dblSharpDown: "",
  dblFlatUp: "", dblFlatDown: "",
};

// fuzzyCode base (region) → note (letter + SMuFL glyph).  The system is fixed:
// naturals at the major/perfect regions, the enharmonic ♯/♭ at the minor/tritone
// regions, and Gould-arrow glyphs for the fine regions — spelled SHARP from the
// white key below in a gap's LOWER half (above the white key) and FLAT from the
// white key above in the UPPER half (below the next white key).  "between"
// regions carry no sub-band, so they never get an s/l superscript; main regions
// do (their s/l prefix → `sup`).
const REGION_NOTE: Record<string, string> = {
  // ── between regions (single band, no s/l) ──
  "1": "C", "8": "C",
  k: "C" + ACC.natUp, "-k": "C" + ACC.natDown,         // C-D lower / B-C upper
  di: "C" + ACC.sharpDown, "-di": "B" + ACC.sharp,      // C-D / B-C midpoints
  i3: "D" + ACC.natUp, i4: "E" + ACC.sharp,             // D-E lower / E-F midpoint
  sup4: "F" + ACC.natUp, sub5: "G" + ACC.natDown,       // F-G lower / upper
  i6: "G" + ACC.natUp, i7: "A" + ACC.natUp,             // G-A / A-B lower
  e2: "D" + ACC.natDown, e7: "B" + ACC.flatUp,          // C-D upper / A-B upper
  // ── main regions (s/l prefix stripped before lookup) ──
  m2: "C" + ACC.sharp, M2: "D", n2: "D" + ACC.flatUp,
  m3: "D" + ACC.sharp, M3: "E", n3: "E" + ACC.natDown,
  "4": "F", T: "F" + ACC.sharp, "5": "G",
  m6: "G" + ACC.sharp, M6: "A", n6: "A" + ACC.natDown,
  m7: "A" + ACC.sharp, M7: "B", n7: "B" + ACC.natDown,
};

/** A note name for an EDO step in our Schulter-region notation: the step's cents
 *  are classified into a spectrum region (fuzzyCode); the region → a note name
 *  (incl. Gould-arrow accidentals for the fine in-between regions), and the
 *  region's small/large sub-band → an `s`/`l` superscript.  Sharps and flats come
 *  out enharmonically equivalent.  Returns `base` (letter + accidental) + `sup`. */
export function sizedNoteName(edo: number, step: number): { base: string; sup: string } {
  const k = ((step % edo) + edo) % edo;
  const code = fuzzyCode((k * 1200) / edo);     // e.g. "sM2", "m2", "di", "k", "lm3"
  if (code in REGION_NOTE) return { base: REGION_NOTE[code], sup: "" };   // between region
  const m = /^([sl])(.+)$/.exec(code);          // main region with an s/l sub-band prefix
  if (m && (m[2] in REGION_NOTE)) return { base: REGION_NOTE[m[2]], sup: m[1] };
  return { base: REGION_NOTE[code] ?? code, sup: "" };
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
