// ── Sized-interval scale / mode naming ──────────────────────────────
// One naming rule, used everywhere (Lumatone visualizer + Tonal Audiation):
// a scale is named by the sized quality that fits the MOST of its modal degrees
// (3rd / 6th / 7th), and any degree that deviates from its natural value is
// appended as a sized code.
//
//   1 sM2 sM3 4 5  sM6 sM7  →  "Small Major"        (every modal degree is small-major)
//   1 sM2 sM3 4 L5 sM6 sM7  →  "Small Major L5"     (the 5th is large → appended)
//   1 M2  m3  4 5  M6  m7   →  "Minor M6"           (minor base, major 6th deviates → Dorian)
//   1 m2  m3  4 5  m6  m7   →  "Minor m2"           (Phrygian — the flat 2nd surfaces)
//
// Natural value per degree:  2nd → major,  3rd/6th/7th → the base quality,
// 4th/5th/unison/octave → perfect (bare).  Large is written "L" in the appended
// codes (capital, so it can't be mistaken for a 1 or i); small stays "s".

import { fuzzyCode } from "./intervalCodes";

interface Parsed { key: string; size: "s" | "l" | ""; qual: "m" | "M" | "n" | ""; deg: number; raw?: string; }
function parse(code: string): Parsed | null {
  // Tritone region (sT / T / lT) — a non-perfect 4th/5th.  Carried through with
  // its raw code so the name always states it (never silently assumes a
  // perfect 4th and 5th).  deg 4 only positions it in the exception list.
  const t = /^([sl]?)T$/.exec(code);
  if (t) return { key: code, size: t[1] as Parsed["size"], qual: "", deg: 4, raw: code };
  // Interseptimal (i3/i4/i6/i7) and equable (e2/e7) — "between" intervals not
  // pinned by any base quality, so carried raw and always stated.
  if (/^[ie]\d$/.test(code)) return { key: code, size: "", qual: "", deg: +code[1], raw: code };
  const m = /^([sl]?)([mMn]?)(\d+)$/.exec(code);
  if (!m) return null;
  return { key: m[1] + m[2], size: m[1] as Parsed["size"], qual: m[2] as Parsed["qual"], deg: +m[3] };
}
/** Render a parsed degree as a sized code with large = capital "L". */
function nameCode(p: Parsed): string {
  if (p.raw) return p.raw;
  return (p.size === "l" ? "L" : p.size) + p.qual + p.deg;
}
const SIZE_WORD: Record<string, string> = { s: "Small", l: "Large", "": "" };
const QUAL_WORD: Record<string, string> = { m: "Minor", M: "Major", n: "Neutral", "": "" };
// Tie-break order when several qualities fit equally many degrees: centre first.
const PRIORITY = ["M", "m", "n", "sM", "lm", "sn", "sm", "lM", "ln"];
const rank = (k: string) => { const i = PRIORITY.indexOf(k); return i < 0 ? 99 : i; };

/** Options for `sizedScaleName`:
 *  - `mode`  prepends a Greek mode name; "Major" (Ionian) is dropped as
 *            redundant with the quality (so the major scale reads "Small Major").
 *  - `family` replaces the Minor/Major word with a family word ("Harmonic
 *            Minor"), sized by the 3rd, and hides the 2nd/7th (the family word
 *            already implies them) — e.g. "Large Harmonic Minor". */
export interface SizedNameOpts { mode?: string; family?: string; suffix?: string; }

/** Sized-interval name for a scale: "[Greek mode] [Size][Quality] [off-base
 *  degree codes]" — e.g. "Small Major", "Lydian Small Major L4", "Small Minor
 *  M2", "Large Harmonic Minor".  No structural ("Diatonic") word — the
 *  group/limit conveys that. */
export function sizedScaleName(steps: number[], edo: number, opts: SizedNameOpts = {}): string {
  const uniq = [...new Set(steps.map(s => (((s % edo) + edo) % edo)))].sort((a, b) => a - b);
  const parsed = uniq.map(s => parse(fuzzyCode((s * 1200) / edo))).filter((p): p is Parsed => !!p);

  // Greek/position prefix — Ionian ("Major") is redundant with the quality.
  const modeWord = opts.mode && opts.mode !== "Major" ? opts.mode : "";

  // Base quality = the (size+quality) shared by the most MODAL degrees (3/6/7);
  // a family scale is sized by its 3rd alone.  Fall back to all coloured
  // degrees, then to a plain "Perfect" scale.
  const modal = parsed.filter(p => p.qual && (p.deg === 3 || p.deg === 6 || p.deg === 7));
  const colorAll = parsed.filter(p => p.qual === "m" || p.qual === "M" || p.qual === "n");
  const basisDegrees = modal.length ? modal : colorAll;
  const thirdKey = parsed.find(p => p.deg === 3 && p.qual)?.key;
  if (basisDegrees.length === 0) {
    const codes = parsed.filter(p => p.deg !== 1 && p.deg !== 8 && (p.size || p.raw)).map(nameCode);
    return [modeWord, opts.family ?? opts.suffix ?? "Perfect", ...codes].filter(Boolean).join(" ").trim();
  }
  let best = "";
  if (opts.family && thirdKey) {
    best = thirdKey;                                         // family scales are sized by their 3rd
  } else {
    const tally = new Map<string, number>();
    for (const p of basisDegrees) tally.set(p.key, (tally.get(p.key) ?? 0) + 1);
    let bestN = -1;
    for (const [k, n] of tally) {
      const win = n > bestN
        || (n === bestN && k === thirdKey && best !== thirdKey)
        || (n === bestN && best !== thirdKey && rank(k) < rank(best));
      if (win) { best = k; bestN = n; }
    }
  }
  const bSize = best.length === 2 ? best[0] : "";
  const bQual = best[best.length - 1];
  const baseName = opts.family
    ? [SIZE_WORD[bSize], opts.family].filter(Boolean).join(" ")
    : [SIZE_WORD[bSize], QUAL_WORD[bQual], opts.suffix].filter(Boolean).join(" ");

  // A degree is an exception when it deviates from the base.  The 2nd shows when
  // its quality differs from the base quality (so a minor scale's major 2nd
  // surfaces as "M2", but a major scale's stays hidden).  Family scales hide the
  // 2nd/7th since the family word implies them.
  const isException = (p: Parsed): boolean => {
    if (p.raw) return true;                                  // tritone: a non-perfect 4th/5th — always stated
    if (p.deg === 1 || p.deg === 8) return false;            // unison / octave
    // Pentatonic / non-diatonic (suffix): which degrees are PRESENT is the
    // distinguishing feature, so state every present degree except the base 3rd
    // (so Major-pent "…M2 5 sM6" reads differently from Ritusen "…M2 4 5").
    if (opts.suffix) return p.key !== best;
    if (p.deg === 4 || p.deg === 5 || p.qual === "") return p.size !== "";  // perfect-class: only sized deviates
    if (opts.family && (p.deg === 2 || p.deg === 7)) return false;
    return p.key !== best;     // 2/3/6/7 are implied to match the base size+quality — shown only when they deviate
  };
  const exc = parsed.filter(isException).sort((a, b) => a.deg - b.deg).map(nameCode);

  return [modeWord, baseName, ...exc].filter(Boolean).join(" ");
}
