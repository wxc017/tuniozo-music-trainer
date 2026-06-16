// ── Sized-interval chord notation (Tonal Audiation spec) ────────────
// See docs/CHORD_NOTATION.md.  A chord symbol = a plain scale-degree Roman
// numeral (the root's position; I = home) + a stack of sized interval codes
// (`[s|l]` + quality + degree, center = bare).  No °, no +, no neutral status.
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

/** Build a chord symbol from a list of tone pitches (cents from the tonic).
 *  The lowest tone is the root; its degree-from-tonic gives the numeral, and
 *  every tone above it is a sized code from the root. */
export function chordSymbol(centsFromTonic: number[]): string {
  if (!centsFromTonic.length) return "";
  const sorted = [...centsFromTonic].sort((a, b) => a - b);
  const root = sorted[0];
  // Numeral degree + size prefix come from the root's interval to the tonic, but
  // the CASE reflects the CHORD's quality: a minor third above the root →
  // lowercase (ii, iii, …), major / other → uppercase.  The s/l size prefix is
  // preserved (rendered as a subscript by the chord-symbol component).
  const pm = /^([sl]?)(.+)$/.exec(sizedRoman(root));
  // Bare Roman (degree + quality) — the size now lives in the root-position
  // prefix below, so drop the redundant s/l here.
  let numeral = pm ? pm[2] : sizedRoman(root);
  if (pm && sorted.length >= 2) {
    // Case from the chord's THIRD — the first degree-3 tone above the root —
    // NOT sorted[1].  sorted[1] can be a DUPLICATED root (interval "1", when the
    // caller both prepends the root and includes it in the tone list) or an
    // extension (a 9th sorts below the third), either of which would wrongly
    // flip a minor chord to uppercase.  Falls back to the first non-unison tone
    // (sus chords have no 3rd).
    let thirdIv: number | null = null, firstIv: number | null = null;
    for (const c of sorted) {
      const iv = c - root;
      const code = sizedCode(iv);
      if (code === "1" || code === "8") continue;        // skip root / octave (and duplicates)
      if (firstIv === null) firstIv = iv;
      if (/3$/.test(code)) { thirdIv = iv; break; }
    }
    const t = sizedCode(thirdIv ?? firstIv ?? (sorted[1] - root));
    const minorChord = /m\d/.test(t) && !/M/.test(t);    // minor third above the root
    numeral = minorChord ? pm[2].toLowerCase() : pm[2].toUpperCase();
  }
  // Root-position indicator: the root's own sized interval from the tonic, in
  // FRONT of the numeral so it's explicit where the root sits — e.g. a flat-3
  // rooted on the large-minor-3rd reads "lm3 III" (per direct user direction
  // 2026-06-14).  Omitted for the tonic (unison / octave).
  const rootCode = sizedCode(root);
  const prefix = rootCode === "1" || rootCode === "8" ? "" : `${rootCode} `;
  // A genuine perfect 5th is implied (hidden); a tempered 5th still coded "5" is
  // shown as d5 / A5.  Either way the 5th is accounted for.  But a diminished or
  // augmented 5th sizes as a DIFFERENT degree (l4 ~576¢, lm6 ~816¢) and keeps
  // that sized code — so when a 3rd-bearing chord shows no 5-family tone at all,
  // append "no5" so the altered interval doesn't read as a stray 4th / 6th.  Per
  // direct user direction 2026-06-14: keep the sized code, just say no5.
  // In a 7th chord the upper 2nd / 4th / 6th are tensions, so name them as the
  // compound intervals they actually are to the chord — 2→9, 4→11, 6→13 — keeping
  // the sized prefix (s11 / 11 / lM13, etc.).  Gated on a 7th being present so
  // plain triads, sus / add and 6 chords keep their simple degree.  Per direct
  // user direction 2026-06-14 ("i need to see l11 or s11 or 11").
  const hasSeventh = sorted.some(c => { const k = sizedCode(c - root); return k !== "1" && k !== "8" && /7$/.test(k); });
  const ext = (code: string): string => {
    if (!hasSeventh) return code;
    const m = /^(.*?)([246])$/.exec(code);
    return m ? `${m[1]}${parseInt(m[2], 10) + 7}` : code;
  };
  let fifthSeen = false, hasThird = false;
  const stack: string[] = [];
  for (const c of sorted) {
    const code = sizedCode(c - root);
    if (code === "1" || code === "8") continue;                  // skip root / octave
    if (/3$/.test(code)) hasThird = true;
    if (code === "5") {
      const off = ((((c - root) % 1200) + 1200) % 1200) - 702;
      if (Math.abs(off) <= 14) { fifthSeen = true; continue; }   // genuine perfect 5th: implied
      fifthSeen = true;                                          // tempered 5th: signify d5 / A5
      const sig = off < 0 ? "d5" : "A5";
      if (stack[stack.length - 1] !== sig) stack.push(sig);
      continue;
    }
    // A small / large fifth (s5 / l5) sits too far from a perfect 5th to read
    // as the chord's 5th.  When the chord has a 3rd, treat it as a MISSING
    // perfect fifth (→ "no5" below) rather than printing a self-contradictory
    // "l5 … no5".  With no 3rd (power / sus shapes) we still show it so the
    // tone isn't lost.  Per direct user direction 2026-06-16.
    if (code === "s5" || code === "l5") {
      if (hasThird) continue;                                      // fifthSeen stays false → no5
      if (stack[stack.length - 1] !== code) stack.push(code);
      continue;
    }
    const display = ext(code);
    if (stack[stack.length - 1] !== display) stack.push(display);
  }
  // 3rd present but no 5-family tone — the altered 5th (l4 / lm6 / …) kept its own
  // sized code above; flag the missing perfect 5th explicitly.
  if (hasThird && !fifthSeen) stack.push("no5");
  return prefix + (stack.length ? `${numeral} ${stack.join(" ")}` : numeral);
}
