import React from "react";

const SUPER_CHARS = new Set(["°", "ø", "+"]);
const SPLIT_RE = /([°ø+])/;

/**
 * Renders a roman numeral label with chord-type symbols (°, ø, +) as superscript.
 * Handles compound labels like "iiø/V", "vii°/X", "V/vi", "bIII+", "#iv°".
 */
export function formatRomanNumeral(label: string): React.ReactNode {
  if (!SPLIT_RE.test(label)) return label;

  const parts = label.split("/");
  const result: React.ReactNode[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (i > 0) result.push("/");
    result.push(formatSingleRoman(parts[i], i));
  }

  return <>{result}</>;
}

function formatSingleRoman(part: string, key: number): React.ReactNode {
  const segments = part.split(SPLIT_RE);
  if (segments.length === 1) return part;

  return (
    <span key={key}>
      {segments.map((seg, i) =>
        SUPER_CHARS.has(seg)
          ? <sup key={i} style={{ fontSize: "0.7em", verticalAlign: "super", lineHeight: 0 }}>{seg}</sup>
          : seg
      )}
    </span>
  );
}
