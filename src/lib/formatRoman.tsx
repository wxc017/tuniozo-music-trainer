import React from "react";
import { formatHalfAccidentals } from "./edoData";

const SUPER_CHARS = new Set(["°", "ø", "+"]);
const SPLIT_RE = /([°ø+])/;

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
      <sup style={{ fontSize: "0.7em", verticalAlign: "super", lineHeight: 0 }}>{suffix}</sup>
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

// Per direct user direction: a leading prefix on a Roman numeral
// indicates the chord root sits on a non-major scale-degree position
// (e.g. sIII = root on subminor 3rd, bIII = root on minor 3rd, #IV =
// root on aug 4th).  All such front prefixes render as SUBSCRIPT so
// they read as a position-marker tag attached to the numeral —
// distinct from the chord-quality SUPERSCRIPT suffix that follows
// the numeral (s3 / n3 / S3 / M7 / etc.).
//
// Match: any run of accidental characters (b / # / s / S / N / ♭ / ♯
// / 𝄲 half-sharp / 𝄳 half-flat / ₛ / ˢ) before a Roman-numeral letter.
const LEADING_PREFIX_RE = /^([bs#SN♭♯𝄲𝄳ₛˢ]+)([IiVvXx].*)$/;

function formatSingleRoman(part: string, key: number): React.ReactNode {
  let prefixSub: React.ReactNode = null;
  const pMatch = part.match(LEADING_PREFIX_RE);
  if (pMatch) {
    prefixSub = (
      <sub style={{ fontSize: "0.7em", verticalAlign: "sub", lineHeight: 0 }}>{pMatch[1]}</sub>
    );
    part = pMatch[2];
  }

  const segments = part.split(SPLIT_RE);
  if (segments.length === 1) {
    return prefixSub ? <span key={key}>{prefixSub}{part}</span> : part;
  }
  return (
    <span key={key}>
      {prefixSub}
      {segments.map((seg, i) =>
        SUPER_CHARS.has(seg)
          ? <sup key={i} style={{ fontSize: "0.7em", verticalAlign: "super", lineHeight: 0 }}>{seg}</sup>
          : seg
      )}
    </span>
  );
}
