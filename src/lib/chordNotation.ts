// ── Sized-interval chord notation (Tonal Audiation spec) ────────────
// See docs/CHORD_NOTATION.md.  Canonical chord symbol = form C:
// `{<sized interval codes>}/<anchor>` — a complete, brace-delimited SET of the
// chord's intervals (each `[s|l]` + quality + degree, center = bare) measured
// from its own root, over the root's sized interval from home (the anchor;
// tonic = "1").  No Roman numerals, no °, no +, no neutral status, no hidden 5th.
// EDO-agnostic: works from cents, so the same shape names the same chord anywhere.

// Size/quality code for each interval, anchored at its JI/Pythagorean landmark.
// Nearest landmark wins (the midpoints are the small/center/large boundaries).
const LANDMARKS: ReadonlyArray<readonly [number, string]> = [
  [0, "1"],
  [67, "sm2"], [90, "m2"], [112, "lm2"],
  [182, "sM2"], [204, "M2"], [231, "lM2"],
  [267, "sm3"], [294, "m3"], [316, "lm3"],
  [386, "sM3"], [408, "M3"], [435, "lM3"],
  [471, "s4"], [498, "4"], [551, "l4"],
  [649, "s5"], [702, "5"], [755, "l5"],
  [773, "sm6"], [792, "m6"], [814, "lm6"],
  [884, "sM6"], [906, "M6"], [933, "lM6"],
  [969, "sm7"], [996, "m7"], [1018, "lm7"],
  [1088, "sM7"], [1110, "M7"], [1137, "lM7"],
  [1200, "8"],
];

/** Sized interval code for an interval in cents (octave-reduced). */
export function sizedCode(cents: number): string {
  const c = ((cents % 1200) + 1200) % 1200;
  let best = LANDMARKS[0][1], bd = Infinity;
  for (const [lc, code] of LANDMARKS) {
    const raw = Math.abs(c - lc);
    const d = Math.min(raw, 1200 - raw);   // wrap around the octave
    if (d < bd) { bd = d; best = code; }
  }
  return best;
}

/** Sized code for an interval, FORCED to a specific degree number (2..7) by
 *  picking the nearest landmark with that degree only.  Use when the tone's
 *  functional role is known (e.g. an 11th that tempers wide enough to size as a
 *  5th globally should still read as a fourth-family code: l4 → "11"). */
export function sizedCodeAtDegree(cents: number, degree: number): string {
  const c = ((cents % 1200) + 1200) % 1200;
  let best = "", bd = Infinity;
  for (const [lc, code] of LANDMARKS) {
    if (degreeOf(code) !== degree) continue;
    const raw = Math.abs(c - lc);
    const d = Math.min(raw, 1200 - raw);
    if (d < bd) { bd = d; best = code; }
  }
  return best || sizedCode(cents);
}

/** Sized interval name per EDO step (index 0..edo): "1", "sM2", "m3", "5", … */
export function sizedIntervalNames(edo: number): string[] {
  return Array.from({ length: edo + 1 }, (_, s) => sizedCode((s * 1200) / edo));
}

const ORDINAL: Record<number, string> = { 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", 6: "6th", 7: "7th" };
/** Spell a sized code out in full words: "sm3" → "Small Minor 3rd". */
export function fullName(code: string): string {
  if (code === "1") return "Unison";
  if (code === "8") return "Octave";
  const m = /^([sl]?)([mM]?)(\d+)$/.exec(code);
  if (!m) return code;
  const size = m[1] === "s" ? "Small " : m[1] === "l" ? "Large " : "";
  const qual = m[2] === "m" ? "Minor " : m[2] === "M" ? "Major " : (m[1] ? "" : "Perfect ");
  const ord = ORDINAL[Number(m[3])] ?? `${m[3]}th`;
  return (size + qual + ord).trim();
}
/** Full-word interval name per EDO step: "Unison", "Small Major 2nd", … */
export function sizedIntervalNamesFull(edo: number): string[] {
  return Array.from({ length: edo + 1 }, (_, s) => fullName(sizedCode((s * 1200) / edo)));
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
function degreeOf(code: string): number {
  const m = /(\d+)$/.exec(code);
  return m ? parseInt(m[1], 10) : 1;
}
/** Roman numeral for a scale-degree number (1 = I). */
export function roman(deg: number): string {
  return ROMAN[(deg - 1) % 8] ?? String(deg);
}

/** Roman numeral for a chord ROOT, carrying its sized quality relative to the
 *  tonic (I).  Only I (the key's root) is "pure"; every other degree shows the
 *  size of its interval from I as a prefix (s = small, l = large) and its
 *  minor/major quality as case (lowercase = minor, uppercase = major/perfect).
 *  e.g.  M2 → "II",  small major 3rd → "sIII",  large minor 3rd → "liii",
 *        diminished 5th → "sV",  flat 2nd (minor) → "ii". */
export function sizedRoman(cents: number): string {
  const code = sizedCode(cents);
  if (code === "1") return "I";
  if (code === "8") return "VIII";
  const m = /^([sl]?)([mM]?)(\d+)$/.exec(code);
  if (!m) return code;
  const deg = parseInt(m[3], 10);
  let r = ROMAN[(deg - 1) % 8] ?? String(deg);
  if (m[2] === "m") r = r.toLowerCase();     // minor root interval → lowercase
  return m[1] + r;                            // size prefix (s / l / none)
}

/** Build the canonical chord symbol (form C) from a list of tone pitches (cents
 *  from the tonic): `{<sized codes>}/<anchor>`.  The lowest tone is the root; the
 *  anchor is the root's own sized interval from home (tonic → "1"), and the set
 *  is every interval from the root, sized and listed ascending.
 *
 *  The set is honest and complete — nothing is hidden:
 *   - the perfect 5th is KEPT in the set (not implied/dropped); a sized fifth
 *     (s5 / l5) shows its raw Schulter code; a missing 5th simply isn't listed
 *     (absence of a 5 member = no fifth — no "no5" flag needed).
 *   - when a 7 is present the upper 2nd / 4th / 6th promote to 9 / 11 / 13 so
 *     tensions read as the compounds they are (keeping the sized prefix:
 *     s11 / 11 / lM13, …).  Per direct user direction 2026-06-21: form C, the
 *     anchored interval-set, replaces the Roman numeral entirely. */
export function chordSymbol(centsFromTonic: number[]): string {
  if (!centsFromTonic.length) return "";
  const sorted = [...centsFromTonic].sort((a, b) => a - b);
  const root = sorted[0];
  // Anchor: the root's own sized interval from the tonic.  Home (unison / octave)
  // renders as "1" so "1 = home" stays visible.
  const anchorCode = sizedCode(root);
  const anchor = anchorCode === "8" ? "1" : anchorCode;
  // Tensions: when a 7 is present the upper 2nd / 4th / 6th are 9 / 11 / 13.
  const hasSeventh = sorted.some(c => { const k = sizedCode(c - root); return k !== "1" && k !== "8" && /7$/.test(k); });
  const ext = (code: string): string => {
    if (!hasSeventh) return code;
    const m = /^(.*?)([246])$/.exec(code);
    return m ? `${m[1]}${parseInt(m[2], 10) + 7}` : code;
  };
  const codes: string[] = [];
  for (const c of sorted) {
    const code = sizedCode(c - root);
    if (code === "1" || code === "8") continue;          // skip root / octave duplicates
    const display = ext(code);
    if (codes[codes.length - 1] !== display) codes.push(display);
  }
  return `{${codes.join(" ")}}/${anchor}`;
}
