import React from "react";
import { formatHalfAccidentals } from "./edoData";

const SUPER_CHARS = new Set(["°", "ø", "+"]);
const SPLIT_RE = /([°ø+])/;

// ── Size → up/down arrow (jazz-xen convention) ──────────────────────
// A plain Roman numeral (case = major/minor) already implies the diatonic
// interval; an arrow marks a size that ISN'T implicit — ↓ = small (sub),
// ↑ = large (super), bare = central.  Chord-type symbols (° ø +) and the
// extension/quality suffix stay in ordinary jazz notation.  `s` / `l` are the
// sized-code letters (chordNotation.ts sizedRoman); `S` / `L` the super/large
// single-letter qualifiers (tonalityChordPool.ts).
const SIZE_ARROW: Record<string, string> = {
  s: "↓", "ₛ": "↓", "ˢ": "↓",
  l: "↑", S: "↑", L: "↑",
};

/** Convert a leading-prefix run to display form: size letters become ↓/↑
 *  arrows; accidentals (b # ♭ ♯ 𝄲 𝄳) and the neutral mark (N) pass through. */
function arrowifyPrefix(raw: string): string {
  let out = "";
  for (const ch of raw) out += SIZE_ARROW[ch] ?? ch;
  return out;
}

/** Convert one space-delimited suffix token: a sized interval code
 *  ([s|l] + optional quality + degree) becomes an arrow code (s3 → ↓3,
 *  lM7 → ↑M7).  Everything else — ordinary jazz qualities (7, M7, n7,
 *  sus4, add9) — passes through untouched. */
function arrowifySuffix(suffix: string): string {
  return suffix
    .split(" ")
    .map(tok => {
      const m = /^([sl])([mMn]?)(\d)$/.exec(tok);
      return m ? (m[1] === "s" ? "↓" : "↑") + m[2] + m[3] : tok;
    })
    .join(" ");
}

/**
 * Renders a roman numeral label with chord-type symbols (°, ø, +) as superscript.
 * Handles compound labels like "iiø/V", "vii°/X", "V/vi", "bIII+", "#iv°".
 * Also applies half-accidental glyph formatting so "##" / "bb" render as
 * the proper half-sharp (𝄲) / half-flat (𝄳) Unicode characters.
 *
 * Xen tonality chord labels carry a space-delimited quality suffix
 * (e.g. "iii s3", "I s3 n7").  Anything after the first space is rendered
 * inside a single <sup> so the full suffix appears as superscript.
 */
export function formatRomanNumeral(label: string, edo?: number): React.ReactNode {
  label = formatHalfAccidentals(label, edo);

  const spaceIdx = label.indexOf(" ");
  let head = label;
  let suffixSup: React.ReactNode = null;
  if (spaceIdx >= 0) {
    head = label.slice(0, spaceIdx);
    const suffix = label.slice(spaceIdx + 1);
    suffixSup = (
      <sup style={{ fontSize: "0.7em", verticalAlign: "super", lineHeight: 0 }}>{arrowifySuffix(suffix)}</sup>
    );
  }

  // Always go through formatSingleRoman so the leading-"s" superscript
  // path handles labels without °/ø/+ symbols (e.g. "siv", "sV") too.
  const parts = head.split("/");
  const result: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) result.push("/");
    result.push(formatSingleRoman(parts[i], i));
  }
  const body: React.ReactNode = <>{result}</>;

  if (suffixSup === null) return body;
  return <>{body}{suffixSup}</>;
}

/**
 * Variant that prepends a short family marker as a leading subscript
 * so 41/53-EDO chord labels carry their JI limit family inline (e.g.
 * "₁₃i" for a Tridecimal i, "₁₇IV" for a Heptadecimal IV).  Without
 * the marker, "I" from a Tridecimal scale and "I" from a Heptadecimal
 * scale render identically — the user has no way to tell them apart
 * in the chord pool.  Pass `null` to skip the marker (12-EDO and
 * other non-JI contexts).
 *
 * Leading subscript (not trailing superscript) per direct user
 * direction — the prime number reads as a "before-the-numeral tag"
 * rather than as a chord-quality suffix that might be confused with
 * extension numbers (M7, 9, 13, etc.).
 */
export function formatRomanNumeralWithFamily(label: string, familyPrefix: string | null, edo?: number): React.ReactNode {
  const body = formatRomanNumeral(label, edo);
  if (!familyPrefix) return body;
  return (
    <>
      <sub style={{ fontSize: "0.6em", verticalAlign: "sub", lineHeight: 0, marginRight: 1, opacity: 0.85 }}>{familyPrefix}</sub>
      {body}
    </>
  );
}

// A leading prefix on a Roman numeral indicates the chord root sits on a
// non-major scale-degree position.  The SIZE part (small / large) now renders
// as a ↓ / ↑ arrow (arrowifyPrefix) — an inflection the plain numeral can't
// imply — while accidentals (b / # / half-sharp / half-flat) pass through:
//   sIII → ↓III (root on subminor 3rd),  liii → ↑iii (large minor 3rd),
//   sV → ↓V (diminished 5th),  bIII → bIII,  #iv° → #iv°.
// The arrow reads as a size marker before the numeral; the chord-quality
// SUPERSCRIPT suffix that follows (↓3 / n3 / M7 / …) stays in jazz notation.
//
// Match: any run of accidental / size characters (b / # / s / l / S / L / N
// / ♭ / ♯ / 𝄲 half-sharp / 𝄳 half-flat / ₛ / ˢ) before a Roman-numeral letter.
// The size letters (s = small, l = large) only convert when they sit in front
// of an actual Roman numeral — standalone interval codes like "s5" or "ln6"
// aren't followed by a Roman letter, so they're left untouched.
const LEADING_PREFIX_RE = /^([bslSLN#♭♯𝄲𝄳ₛˢ]+)([IiVvXx].*)$/;

function formatSingleRoman(part: string, key: number): React.ReactNode {
  let prefixNode: React.ReactNode = null;
  const pMatch = part.match(LEADING_PREFIX_RE);
  if (pMatch) {
    // Size letters → ↓ / ↑ arrows, accidentals pass through; rendered inline
    // just before the numeral (no longer a subscript tag) so ↓III / ↑iii read
    // at a glance.
    prefixNode = (
      <span style={{ fontSize: "0.85em", marginRight: 0.5 }}>{arrowifyPrefix(pMatch[1])}</span>
    );
    part = pMatch[2];
  }

  const segments = part.split(SPLIT_RE);
  if (segments.length === 1) {
    return prefixNode ? <span key={key}>{prefixNode}{part}</span> : part;
  }
  return (
    <span key={key}>
      {prefixNode}
      {segments.map((seg, i) =>
        SUPER_CHARS.has(seg)
          ? <sup key={i} style={{ fontSize: "0.7em", verticalAlign: "super", lineHeight: 0 }}>{seg}</sup>
          : seg
      )}
    </span>
  );
}
