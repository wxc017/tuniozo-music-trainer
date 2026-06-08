// ── Notation / solfège label registry ──────────────────────────────
// Two INDEPENDENT axes per EDO: a notation system (interval symbols) and a
// solfège system (syllables).  "Schulter" is our built-in sized notation;
// "Universal Solfège" is our built-in constructed solfège.  Everything else is
// mined from the Xenharmonic Wiki — pure renames.

import { solfegeName, fuzzyCode } from "./intervalCodes";
import { NOTATION_SYSTEMS } from "./notationSystems";
import { SOLFEGE_SYSTEMS } from "./solfegeSystems";

export const SCHULTER = "Schulter";
export const UNIVERSAL_SOLFEGE = "Universal Solfège";

/** Notation systems available for an EDO (Schulter first, then mined). */
export function notationsForEdo(edo: number): string[] {
  // A "Solfège" entry is a solfège, not an interval notation — keep it out of
  // the notation list (it still appears under the Solfège section).
  return [SCHULTER, ...(NOTATION_SYSTEMS[edo] ?? []).map(s => s.name).filter(n => !/solf[eè]ge/i.test(n))];
}
/** Solfège systems available for an EDO (Universal first, then mined). */
export function solfegesForEdo(edo: number): string[] {
  // Drop the mined "extras" catch-all — we want discrete, named systems only.
  return [UNIVERSAL_SOLFEGE, ...(SOLFEGE_SYSTEMS[edo] ?? []).map(s => s.name).filter(n => !/^extras?$/i.test(n))];
}

/** Interval label for a step under a notation system (falls back to Schulter). */
export function notationLabel(edo: number, system: string | undefined, step: number): string {
  const k = (((step % edo) + edo) % edo);
  const cents = (k * 1200) / edo;
  // Schulter = our spectrum coder (fuzzyCode) — same one the scale namer uses,
  // so it carries neutrals and the per-region no-overlap codes.
  if (!system || system === SCHULTER) return fuzzyCode(cents);
  return (NOTATION_SYSTEMS[edo] ?? []).find(s => s.name === system)?.labels[k] ?? fuzzyCode(cents);
}
/** Solfège syllable for a step under a solfège system (falls back to Universal). */
export function solfegeLabel(edo: number, system: string | undefined, step: number): string {
  const k = (((step % edo) + edo) % edo);
  if (!system || system === UNIVERSAL_SOLFEGE) return solfegeName((k * 1200) / edo);
  return (SOLFEGE_SYSTEMS[edo] ?? []).find(s => s.name === system)?.labels[k] ?? solfegeName((k * 1200) / edo);
}

/** Back-compat: notation label (used by existing overlay callers). */
export const labelForStep = notationLabel;

// Known authors of notation / solfège systems (shown as "· by …").  Names that
// already credit a person ("Kite Giedraitis's solfege") are left alone.
const AUTHORS: [RegExp, string][] = [
  [/^Schulter$/i, "Margo Schulter"],
  [/universal solf/i, "Nick Vuci"],
  [/uniform solf/i, "Kite Giedraitis"],
  [/ups?\s*and\s*downs|^kite\b/i, "Kite Giedraitis"],
  [/skulo/i, "Aura, Praveen Venkataramana et al."],
  [/sagittal/i, "George Secor & Dave Keenan"],
  [/stein.?zimmermann|gould/i, "Stein, Zimmermann & Gould"],
  [/^extended pythagorean/i, "Pythagorean (traditional)"],
  [/heathwaite/i, "Andrew Heathwaite"],
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
