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

// Per direct user direction: a leading "s" before a Roman numeral
// indicates the chord root sits on the SUB-MINOR of that degree —
// analogous to "b" for minor.  Render the "s" as a superscript so it
// reads as an alteration marker (like ° / ø / + later in the label)
// rather than as a regular letter inline with the numeral.
const LEADING_S_RE = /^(s+)([IiVvXx#♯♭b].*)$/;

function formatSingleRoman(part: string, key: number): React.ReactNode {
  let prefixSup: React.ReactNode = null;
  const sMatch = part.match(LEADING_S_RE);
  if (sMatch) {
    prefixSup = (
      <sup style={{ fontSize: "0.7em", verticalAlign: "super", lineHeight: 0 }}>{sMatch[1]}</sup>
    );
    part = sMatch[2];
  }

  const segments = part.split(SPLIT_RE);
  if (segments.length === 1) {
    return prefixSup ? <span key={key}>{prefixSup}{part}</span> : part;
  }
  return (
    <span key={key}>
      {prefixSup}
      {segments.map((seg, i) =>
        SUPER_CHARS.has(seg)
          ? <sup key={i} style={{ fontSize: "0.7em", verticalAlign: "super", lineHeight: 0 }}>{seg}</sup>
          : seg
      )}
    </span>
  );
}
