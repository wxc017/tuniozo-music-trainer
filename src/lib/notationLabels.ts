// ── Notation / solfège label registry ──────────────────────────────
// Two INDEPENDENT axes per EDO: a notation system (interval symbols) and a
// solfège system (syllables).  "Schulter" is our built-in sized notation;
// "Universal Solfège" is our built-in constructed solfège.  Everything else is
// mined from the Xenharmonic Wiki — pure renames.

import { fuzzyCode } from "./intervalCodes";
import { customSolfege } from "./customSolfege";
import { NOTATION_SYSTEMS } from "./notationSystems";

export const SCHULTER = "Schulter";
// The single solfège system used everywhere now — the region-centered
// "Spectrum-ege" from the Solfège chart (customSolfege).
export const SPECTRUM_SOLFEGE = "Spectrum-ege";
// "Schulter V2" — the region/Gould absolute NOTE system (see intervalCodes
// sizedNoteName).  For interval labels it behaves like Schulter (the spectrum
// coder); it only changes the "Notes" overlay (Pythagorean for plain Schulter,
// SZG/Gould for V2).
export const SCHULTER_V2 = "Schulter V2";
export const UNIVERSAL_SOLFEGE = "Universal Solfège";

/** Notation systems available for an EDO (Schulter first, then mined). */
// Drop mined duplicate variants ("… 2", "… 3") — keep the primary name only.
const tidyNames = (names: string[]): string[] => names.filter(n => !/ \d+$/.test(n));

export function notationsForEdo(edo: number): string[] {
  // Every surfaced system must be attributable to a known author/convention —
  // per direct user direction.  This drops mining artifacts ("System 1/2",
  // whose labels are raw cent deviations), generic names ("Notation"), and
  // mis-mined or unattributable entries ("Armodue notation", "Circle-of-fifths",
  // "Porcupine", …).  Solfège-kind entries belong under the Solfège section.
  const mined = (NOTATION_SYSTEMS[edo] ?? [])
    .filter(s => s.kind === "notation")
    .map(s => s.name)
    .filter(n => authorFor(n) !== null);
  return [SCHULTER, SCHULTER_V2, ...tidyNames(mined)];
}
/** Solfège is a single fixed system now — Spectrum-ege (region-centered). */
export function solfegesForEdo(_edo: number): string[] {
  return [SPECTRUM_SOLFEGE];
}

/** Interval label for a step under a notation system (falls back to Schulter). */
export function notationLabel(edo: number, system: string | undefined, step: number): string {
  const k = (((step % edo) + edo) % edo);
  const cents = (k * 1200) / edo;
  // Schulter = our spectrum coder (fuzzyCode) — same one the scale namer uses,
  // so it carries neutrals and the per-region no-overlap codes.
  if (!system || system === SCHULTER || system === SCHULTER_V2) return fuzzyCode(cents);
  return (NOTATION_SYSTEMS[edo] ?? []).find(s => s.name === system)?.labels[k] ?? fuzzyCode(cents);
}
/** Solfège syllable for a step — always the Spectrum-ege system (customSolfege),
 *  the region-centered syllables from the Solfège chart. */
export function solfegeLabel(edo: number, _system: string | undefined, step: number): string {
  const k = (((step % edo) + edo) % edo);
  return customSolfege((k * 1200) / edo);
}

/** Back-compat: notation label (used by existing overlay callers). */
export const labelForStep = notationLabel;

// Known authors of notation / solfège systems (shown as "· by …").  Names that
// already credit a person ("Kite Giedraitis's solfege") are left alone.
const AUTHORS: [RegExp, string][] = [
  [/schulter/i, "Margo Schulter"],
  [/universal solf/i, "Nick Vuci"],
  [/uniform solf/i, "Kite Giedraitis"],
  [/ups?\s*and\s*downs|^kite\b/i, "Kite Giedraitis"],
  [/skulo/i, "Aura, Praveen Venkataramana et al."],
  [/sagittal/i, "George Secor & Dave Keenan"],
  [/stein.?zimmermann|gould/i, "Stein, Zimmermann & Gould"],
  [/^extended pythagorean/i, "Pythagorean (traditional)"],
  [/heathwaite/i, "Andrew Heathwaite"],
  [/decatonic/i, "Paul Erlich"],
];
/** Attribution for a system name.  Names that credit a person possessively
 *  ("Kite Giedraitis's solfege") yield that person; otherwise a known-author
 *  lookup; else null. */
export function authorFor(name: string): string | null {
  const poss = /^(.+?)['’]s\b/.exec(name);          // "Kite Giedraitis's solfege" → "Kite Giedraitis"
  if (poss) return poss[1].trim();
  for (const [re, a] of AUTHORS) if (re.test(name)) return a;
  return null;
}
