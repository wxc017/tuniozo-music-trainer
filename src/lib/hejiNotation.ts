/**
 * Helmholtz-Ellis JI Pitch Notation (HEJI) — 2020 standard
 *
 * Implements the complete HEJI extended notation system for Just Intonation:
 *   • Pythagorean spine (chain of fifths → diatonic letter + accidental)
 *   • Prime-specific comma accidentals for primes 5–47
 *   • HEJI2Text font (Thomas Nicholson) character mapping for pre-composed glyphs
 *   • Otonal/utonal shorthand notation (7°/C, u11\B, etc.)
 *   • Algorithmic comma calculation per HEJI2020 standard
 *
 * References:
 *   Marc Sabat & Thomas Nicholson, "The Helmholtz-Ellis JI Pitch Notation (HEJI) | 2020 | LEGEND"
 *   Plainsound Music Edition — www.plainsound.org
 */

// ═══════════════════════════════════════════════════════════════
// Prime comma definitions (HEJI2020 standard)
// ═══════════════════════════════════════════════════════════════

/**
 * For each prime p > 3, HEJI defines a comma relating p's harmonic
 * to the nearest Pythagorean note (a position in the chain of fifths).
 *
 * Algorithm (from HEJI2020 legend):
 *   1. Limit search to ±7 fifths from the fundamental
 *   2. Maximum comma size ≈ 1/3 tone
 *   3. Prefer nearest fifth; consider comma simplicity and voice-leading logic
 *   4. Note: prime 17 uses the apotome (+7 fifths) by deliberate choice,
 *      keeping Pythagorean limma < apotome ordering in 17° spelling.
 */
export interface PrimeCommaSpec {
  prime: number;
  /** Chain-of-fifths offset: where this prime's harmonic maps in the Pythagorean spine */
  fifthsOffset: number;
  /** true if the otonal (positive exponent) direction RAISES pitch above the Pythagorean note */
  otonalRaises: boolean;
  /** Comma ratio numerator */
  commaN: number;
  /** Comma ratio denominator */
  commaD: number;
  /** Comma size in cents (always positive) */
  commaCents: number;
}

export const PRIME_COMMAS: PrimeCommaSpec[] = [
  // Prime 5: syntonic comma 81/80 ≈ 21.5¢
  // 5/4 (386.3¢) is 21.5¢ BELOW Pythagorean E (81/64 = 407.8¢)
  // → otonal direction lowers
  { prime: 5, fifthsOffset: 4, otonalRaises: false, commaN: 81, commaD: 80, commaCents: 21.506 },
  // Prime 7: septimal comma 64/63 ≈ 27.3¢ (Giuseppe Tartini symbols)
  // 7/4 (968.8¢) is 27.3¢ BELOW Pythagorean B♭ (16/9 = 996.1¢)
  { prime: 7, fifthsOffset: -2, otonalRaises: false, commaN: 64, commaD: 63, commaCents: 27.264 },
  // Prime 11: undecimal quartertone 33/32 ≈ 53.3¢ (Richard H. Stein)
  // 11/8 (551.3¢) is 53.3¢ ABOVE Pythagorean F (4/3 = 498.0¢)
  { prime: 11, fifthsOffset: -1, otonalRaises: true, commaN: 33, commaD: 32, commaCents: 53.273 },
  // Prime 13: tridecimal thirdtone 27/26 ≈ 65.3¢ (Gérard Grisey)
  // 13/8 (840.5¢) is 65.3¢ BELOW Pythagorean A (27/16 = 905.9¢)
  { prime: 13, fifthsOffset: 3, otonalRaises: false, commaN: 27, commaD: 26, commaCents: 65.337 },
  // Prime 17: 17-limit schisma 2187/2176 ≈ 8.7¢
  // Deliberately uses +7 fifths (apotome), not the nearer -5 fifths (limma)
  { prime: 17, fifthsOffset: 7, otonalRaises: false, commaN: 2187, commaD: 2176, commaCents: 8.730 },
  // Prime 19: 19-limit schisma 513/512 ≈ 3.4¢
  { prime: 19, fifthsOffset: -3, otonalRaises: true, commaN: 513, commaD: 512, commaCents: 3.378 },
  // Prime 23: 23-limit comma 736/729 ≈ 16.5¢ (James Tenney / John Cage)
  { prime: 23, fifthsOffset: 6, otonalRaises: true, commaN: 736, commaD: 729, commaCents: 16.544 },
  // Prime 29: 29-limit sixthtone 261/256 ≈ 33.5¢
  { prime: 29, fifthsOffset: -2, otonalRaises: true, commaN: 261, commaD: 256, commaCents: 33.487 },
  // Prime 31: 31-limit quartertone 32/31 ≈ 55.0¢ (Alinaghi Vaziri)
  { prime: 31, fifthsOffset: 0, otonalRaises: false, commaN: 32, commaD: 31, commaCents: 54.964 },
  // Prime 37: 37-limit quartertone 37/36 ≈ 47.4¢ (Ivan Wyschnegradsky)
  { prime: 37, fifthsOffset: 2, otonalRaises: true, commaN: 37, commaD: 36, commaCents: 47.434 },
  // Prime 41: 41-limit comma 82/81 ≈ 21.2¢ (adapted from Ben Johnston)
  { prime: 41, fifthsOffset: 4, otonalRaises: true, commaN: 82, commaD: 81, commaCents: 21.242 },
  // Prime 43: 43-limit comma 129/128 ≈ 13.5¢
  { prime: 43, fifthsOffset: -1, otonalRaises: true, commaN: 129, commaD: 128, commaCents: 13.473 },
  // Prime 47: 47-limit sixthtone 48/47 ≈ 36.4¢
  { prime: 47, fifthsOffset: 1, otonalRaises: false, commaN: 48, commaD: 47, commaCents: 36.448 },
];

// ═══════════════════════════════════════════════════════════════
// Pythagorean note name from chain of fifths
// ═══════════════════════════════════════════════════════════════

const FIFTH_LETTERS = ["F", "C", "G", "D", "A", "E", "B"] as const;

/** Root pitch class → chain-of-fifths position (most common spelling) */
const ROOT_PC_TO_FIFTHS: Record<number, number> = {
  0: 0,    // C
  1: 7,    // C♯
  2: 2,    // D
  3: -3,   // E♭
  4: 4,    // E
  5: -1,   // F
  6: 6,    // F♯
  7: 1,    // G
  8: -4,   // A♭
  9: 3,    // A
  10: -2,  // B♭
  11: 5,   // B
};

/**
 * Convert a chain-of-fifths position to note letter + accidental count.
 * @returns [letter, accidentalCount] where positive = sharps, negative = flats
 */
export function fifthsToNoteLetter(fifths: number): [string, number] {
  const letterIndex = (((fifths + 1) % 7) + 7) % 7;
  const accidentals = Math.floor((fifths + 1) / 7);
  return [FIFTH_LETTERS[letterIndex], accidentals];
}

/** Format an accidental count as Unicode text */
export function accidentalText(count: number): string {
  if (count === 0) return "";
  if (count === 1) return "♯";
  if (count === -1) return "♭";
  if (count === 2) return "𝄪";
  if (count === -2) return "𝄫";
  if (count > 2) return "♯".repeat(count);  // rare: triple+ sharps
  return "♭".repeat(-count);
}

// ═══════════════════════════════════════════════════════════════
// HEJI2Text font glyph tables (character mapping from helmholtz-ellis-ji-notation package)
//
// The HEJI2Text font (Thomas Nicholson / Plainsound) maps ASCII/Latin characters
// to HEJI accidental glyphs. Each character below, when rendered in the
// HEJI2Text font, displays the corresponding HEJI accidental glyph.
//
// Pre-composed glyphs combine base accidental + prime-5 comma arrow.
// Individual prime modifiers (7, 11, 13, …) are appended after the base.
// ═══════════════════════════════════════════════════════════════

/**
 * Base accidental index: maps accidentalCount → index into glyph arrays
 *   0 = double flat, 1 = flat, 2 = natural, 3 = sharp, 4 = double sharp
 */
function accidentalToIndex(count: number): number | null {
  if (count < -2 || count > 2) return null;
  return count + 2;
}

/**
 * Pythagorean base accidentals (no prime modifications).
 * Rendered in HEJI2Text font. Indexed [𝄫, ♭, ♮, ♯, 𝄪].
 */
const BASE_ACCIDENTALS = ["E", "e", "n", "v", "V"];

/**
 * Pre-composed prime 5 (syntonic comma) accidentals.
 * Each character renders as base accidental + syntonic comma arrow in HEJI2Text font.
 * Indexed [𝄫, ♭, ♮, ♯, 𝄪].
 *
 * "otonal five" = syntonic comma DOWN (because otonalRaises=false for prime 5)
 * "utonal five" = syntonic comma UP
 */
// 5^1 otonal (DOWN by 81/80)
const P5_SINGLE_DOWN = ["D", "d", "m", "u", "U"];
// 5^1 utonal (UP by 81/80)
const P5_SINGLE_UP   = ["F", "f", "o", "w", "W"];
// 5^2 otonal (DOWN by 81/80 × 2)
const P5_DOUBLE_DOWN = ["C", "c", "l", "t", "T"];
// 5^2 utonal (UP by 81/80 × 2)
const P5_DOUBLE_UP   = ["G", "g", "p", "x", "X"];
// 5^3 otonal (DOWN by 81/80 × 3)
const P5_TRIPLE_DOWN = ["B", "b", "k", "s", "S"];
// 5^3 utonal (UP by 81/80 × 3)
const P5_TRIPLE_UP   = ["H", "h", "q", "y", "Y"];
// 5^4 otonal (DOWN by 81/80 × 4)
const P5_QUAD_DOWN   = ["I", "K", "M", "O", "R"];
// 5^4 utonal (UP by 81/80 × 4)
const P5_QUAD_UP     = ["J", "L", "N", "P", "Q"];

/**
 * Individual prime modifier characters (HEJI2Text font mapping).
 * Each character renders as the prime-specific comma symbol.
 * These are placed AFTER the base accidental glyph.
 * Indexed as [lower, raise] to match how commaModifiers stores raise/lower.
 *
 * Mapping from HEJI2Text: each prime has [otonal, utonal] chars.
 * We reorder based on otonalRaises: if otonal raises, [utonal, otonal] = [lower, raise].
 */
const PRIME_MODIFIER_CHARS: Record<number, [string, string]> = {
  // prime 7:  otonalRaises=false → otonal=lower, utonal=raise → [<, >]
  7:  ["<", ">"],
  // prime 11: otonalRaises=true  → otonal=raise, utonal=lower → [5, 4]
  11: ["5", "4"],
  // prime 13: otonalRaises=false → otonal=lower, utonal=raise → [0, 9]
  13: ["0", "9"],
  // prime 17: otonalRaises=false → otonal=lower, utonal=raise → [:, ;]
  17: [":", ";"],
  // prime 19: otonalRaises=true  → otonal=raise, utonal=lower → [*, /]
  19: ["*", "/"],
  // prime 23: otonalRaises=true  → otonal=raise, utonal=lower → [6, 3]
  23: ["6", "3"],
  // prime 29: otonalRaises=true  → otonal=raise, utonal=lower → [7, 2]
  29: ["7", "2"],
  // prime 31: otonalRaises=false → otonal=lower, utonal=raise → [1, 8]
  31: ["1", "8"],
  // prime 37: otonalRaises=true  → otonal=raise, utonal=lower → [à, á]
  37: ["\u00e0", "\u00e1"],
  // prime 41: otonalRaises=true  → otonal=raise, utonal=lower → [-, +]
  41: ["-", "+"],
  // prime 43: otonalRaises=true  → otonal=raise, utonal=lower → [è, é]
  43: ["\u00e8", "\u00e9"],
  // prime 47: otonalRaises=false → otonal=lower, utonal=raise → [í, ì]
  47: ["\u00ed", "\u00ec"],
};

/** Prime 7 double (49) comma characters */
const P7_DOUBLE_DOWN = ",";  // otonalfortynine
const P7_DOUBLE_UP = ".";    // utonalfortynine

// ═══════════════════════════════════════════════════════════════
// Core HEJI notation types
// ═══════════════════════════════════════════════════════════════

/** A single prime-comma modification */
export interface HEJICommaModifier {
  prime: number;
  /** Absolute count of this comma (always positive) */
  count: number;
  /** true if this modification raises the pitch */
  raises: boolean;
}

/** Complete HEJI notation for a JI ratio */
export interface HEJINotation {
  /** Diatonic note letter (A–G) */
  letter: string;
  /** Pythagorean accidental count: positive = sharps, negative = flats */
  accidentals: number;
  /** List of prime-comma modifications beyond the Pythagorean base */
  commaModifiers: HEJICommaModifier[];
  /** Chain-of-fifths position (absolute, including root offset) */
  fifthsPosition: number;
  /** Deviation from 12-TET in cents */
  centsDeviation: number;
  /** The original ratio */
  n: number;
  d: number;
}

// ═══════════════════════════════════════════════════════════════
// Core algorithm: ratio → HEJI notation
// ═══════════════════════════════════════════════════════════════

/**
 * Factorize n/d into prime exponents (ignoring prime 2).
 * Returns Map<prime, exponent>.
 */
function factorizeRatio(n: number, d: number): Map<number, number> {
  const exps = new Map<number, number>();
  // Remove factors of 2 (octave equivalence)
  while (n % 2 === 0) n /= 2;
  while (d % 2 === 0) d /= 2;

  const PRIMES = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
  for (const p of PRIMES) {
    let exp = 0;
    while (n % p === 0) { n /= p; exp++; }
    while (d % p === 0) { d /= p; exp--; }
    if (exp !== 0) exps.set(p, exp);
  }
  return exps;
}

/**
 * Compute the complete HEJI notation for a JI ratio n/d.
 *
 * Algorithm:
 *   1. Factorize n/d into prime exponents (mod octave)
 *   2. Chain-of-fifths position = e₃ + Σ(eₚ × fifthsOffset(p)) for each prime p > 3
 *   3. Derive note letter + Pythagorean accidental from fifths position
 *   4. Collect comma modifications for each prime p > 3 with non-zero exponent
 *   5. Compute cents deviation from 12-TET
 *
 * @param n  Ratio numerator
 * @param d  Ratio denominator
 * @param rootPc  Root pitch class (0=C, 1=C♯, ..., 11=B) — determines reference note
 */
export function ratioToHEJI(n: number, d: number, rootPc: number = 0): HEJINotation {
  const exps = factorizeRatio(n, d);

  // 1. Compute total chain-of-fifths position
  //    The fifths position includes contributions from ALL primes:
  //    - e3 directly (each power of 3 = one fifth)
  //    - For each prime p > 3: ep × fifthsOffset(p) shifts to the nearest
  //      Pythagorean note for that prime's harmonic
  //    This determines the note letter + Pythagorean accidental.
  //    Example: 5/4 has e5=1, fifthsOffset(5)=4, so fifths=4 → E
  const e3 = exps.get(3) ?? 0;
  let fifths = e3;
  const modifiers: HEJICommaModifier[] = [];

  for (const pc of PRIME_COMMAS) {
    const ep = exps.get(pc.prime) ?? 0;
    if (ep === 0) continue;

    // Each exponent unit shifts the fifths position by the prime's offset
    fifths += ep * pc.fifthsOffset;

    // Determine comma direction:
    // If otonal raises and exponent is positive → raises
    // If otonal raises and exponent is negative → lowers (utonal)
    const isOtonal = ep > 0;
    const raises = isOtonal ? pc.otonalRaises : !pc.otonalRaises;

    modifiers.push({
      prime: pc.prime,
      count: Math.abs(ep),
      raises,
    });
  }

  // 2. Add root offset to get absolute fifths position
  const rootFifths = ROOT_PC_TO_FIFTHS[rootPc] ?? 0;
  const absFifths = rootFifths + fifths;

  // 3. Derive note letter + accidental from absolute fifths position
  const [letter, accidentals] = fifthsToNoteLetter(absFifths);

  // 4. Cents deviation from 12-TET
  const ratioCents = 1200 * Math.log2(n / d);
  const nearestSemitone = Math.round(ratioCents / 100);
  const centsDeviation = ratioCents - nearestSemitone * 100;

  return {
    letter,
    accidentals,
    commaModifiers: modifiers,
    fifthsPosition: absFifths,
    centsDeviation,
    n,
    d,
  };
}

// ═══════════════════════════════════════════════════════════════
// Text rendering (standard Unicode)
// ═══════════════════════════════════════════════════════════════

/**
 * Render HEJI notation as plain text: note letter + Pythagorean accidental.
 * Prime-specific comma symbols can only be rendered via the HEJI2 font.
 */
export function hejiToText(heji: HEJINotation): string {
  return heji.letter + accidentalText(heji.accidentals);
}

/**
 * Render HEJI notation as a compact text label.
 * Shows note letter + Pythagorean accidental only.
 * The prime-specific comma symbols are rendered via the HEJI2 font glyph,
 * not as text — each prime has its own unique symbol that has no Unicode equivalent.
 */
export function hejiToCompactText(heji: HEJINotation): string {
  return heji.letter + accidentalText(heji.accidentals);
}

// ═══════════════════════════════════════════════════════════════
// HEJI2 font (SMuFL) rendering
// ═══════════════════════════════════════════════════════════════

/**
 * Build the HEJI2 font accidental string for a notation.
 * Returns a string of ASCII/Unicode characters that, when rendered in the HEJI2 font,
 * display the correct HEJI accidental glyphs.
 *
 * The HEJI2 font overloads ASCII characters as music symbols:
 *   - Pre-composed prime 5: `$`-`7` (base accidental + syntonic comma arrow)
 *   - Individual prime modifiers: `;`=p7↓, `<`=p7↑, `?`=p11↓, `@`=p11↑, etc.
 *   - Base accidentals: ♭ ♮ ♯ (standard Unicode, also mapped in font)
 *
 * Returns empty string for pure naturals with no modifications.
 */
export function hejiAccidentalSMuFL(heji: HEJINotation): string {
  const accIdx = accidentalToIndex(heji.accidentals);
  const mod5 = heji.commaModifiers.find(m => m.prime === 5);
  const hasNonP5Mods = heji.commaModifiers.some(m => m.prime !== 5);

  // Step 1: Base accidental (possibly pre-composed with prime 5)
  let base = "";

  if (mod5 && accIdx !== null) {
    // Pre-composed prime 5 glyph (includes base ♭/♮/♯ + syntonic comma arrow)
    if (mod5.count === 1) {
      base = mod5.raises ? P5_SINGLE_UP[accIdx] : P5_SINGLE_DOWN[accIdx];
    } else if (mod5.count === 2) {
      base = mod5.raises ? P5_DOUBLE_UP[accIdx] : P5_DOUBLE_DOWN[accIdx];
    } else if (mod5.count === 3) {
      base = mod5.raises ? P5_TRIPLE_UP[accIdx] : P5_TRIPLE_DOWN[accIdx];
    } else if (mod5.count === 4) {
      base = mod5.raises ? P5_QUAD_UP[accIdx] : P5_QUAD_DOWN[accIdx];
    } else {
      // count > 4: use quad + repeat singles for the remainder
      base = mod5.raises ? P5_QUAD_UP[accIdx!] : P5_QUAD_DOWN[accIdx!];
      const singleChar = mod5.raises ? P5_SINGLE_UP[2] : P5_SINGLE_DOWN[2]; // natural variant
      for (let i = 4; i < mod5.count; i++) base += singleChar;
    }
  } else if (heji.commaModifiers.length > 0 || heji.accidentals !== 0) {
    // No prime 5 but has other mods or non-natural accidental → show base accidental
    if (accIdx !== null) {
      // For natural with prime mods, show ♮ so the modifier has something to attach to
      if (heji.accidentals === 0 && hasNonP5Mods) {
        base = BASE_ACCIDENTALS[2]; // ♮
      } else if (heji.accidentals !== 0) {
        base = BASE_ACCIDENTALS[accIdx];
      }
    } else {
      // Extreme accidentals (>2 sharps/flats) — use text fallback
      base = accidentalText(heji.accidentals);
    }
  }
  // else: pure natural, no mods → base stays empty

  // Step 2: Append individual modifier characters for primes ≥ 7
  let mods = "";
  for (const mod of heji.commaModifiers) {
    if (mod.prime === 5) continue; // already handled in base

    if (mod.prime === 7) {
      if (mod.count === 1) {
        mods += mod.raises ? ">" : "<";
      } else if (mod.count === 2) {
        mods += mod.raises ? P7_DOUBLE_UP : P7_DOUBLE_DOWN;
      } else {
        // count > 2: double + singles
        mods += mod.raises ? P7_DOUBLE_UP : P7_DOUBLE_DOWN;
        const single = mod.raises ? ">" : "<";
        for (let i = 2; i < mod.count; i++) mods += single;
      }
      continue;
    }

    const chars = PRIME_MODIFIER_CHARS[mod.prime];
    if (chars) {
      const ch = mod.raises ? chars[1] : chars[0];
      for (let i = 0; i < mod.count; i++) mods += ch;
    }
  }

  return base + mods;
}

/**
 * Build full HEJI2 string: accidental glyphs + note letter.
 * The entire string is rendered in the HEJI2 font.
 */
export function hejiToSMuFL(heji: HEJINotation): string {
  const acc = hejiAccidentalSMuFL(heji);
  return acc + heji.letter;
}

// ═══════════════════════════════════════════════════════════════
// Shorthand otonal/utonal notation (Partch-style)
// ═══════════════════════════════════════════════════════════════

/**
 * Generate otonal/utonal shorthand notation for a ratio.
 *
 * Conventions (from HEJI2020):
 *   - Overtonal: "7°/C" = 7th harmonic above C (= 7/4 when C is root)
 *   - Undertonal: "u7\G" = 7th subharmonic below G (= 8/7 inverted)
 *   - The small raised "°" follows the harmonic number for otonal
 *   - The lowercase "u" precedes the number for utonal
 *
 * Only applies to simple cases (single prime, or small harmonic numbers).
 */
export function ratioToShorthand(n: number, d: number, rootPc: number = 0): string | null {
  // Octave-reduce
  let ratio = n / d;
  while (ratio >= 2) { d *= 2; ratio = n / d; }
  while (ratio < 1) { n *= 2; ratio = n / d; }

  // Check if n or d is a power of 2 (simple harmonic/subharmonic)
  const rootNote = fifthsToNoteLetter(ROOT_PC_TO_FIFTHS[rootPc] ?? 0)[0];

  if (isPowerOf2(d)) {
    // Otonal: n/2^k → harmonic partial n° of root
    return `${n}°/${rootNote}`;
  }
  if (isPowerOf2(n)) {
    // Utonal: 2^k/d → subharmonic partial d
    return `u${d}\\${rootNote}`;
  }

  // For compound ratios, try to express as harmonic of a different note
  // e.g., 15/8 = 15°/C or 3°·5°/C
  // This is complex — return null for cases we can't simplify
  return null;
}

function isPowerOf2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

// ═══════════════════════════════════════════════════════════════
// Batch conversion for lattice nodes
// ═══════════════════════════════════════════════════════════════

export interface HEJILabel {
  /** Plain-text HEJI notation (works with any font) */
  text: string;
  /** Compact text for small labels */
  compact: string;
  /** SMuFL string for HEJI2 font rendering */
  smufl: string;
  /** Accidental-only SMuFL string (for separate rendering) */
  accidentalSmufl: string;
  /** Otonal/utonal shorthand (null if not applicable) */
  shorthand: string | null;
  /** Cents deviation from 12-TET */
  centsDeviation: number;
  /** Full notation data */
  notation: HEJINotation;
}

/**
 * Compute complete HEJI label data for a ratio.
 * This is the main entry point for lattice integration.
 */
export function ratioToHEJILabel(n: number, d: number, rootPc: number = 0): HEJILabel {
  const notation = ratioToHEJI(n, d, rootPc);
  return {
    text: hejiToText(notation),
    compact: hejiToCompactText(notation),
    smufl: hejiToSMuFL(notation),
    accidentalSmufl: hejiAccidentalSMuFL(notation),
    shorthand: ratioToShorthand(n, d, rootPc),
    centsDeviation: notation.centsDeviation,
    notation,
  };
}
