// ── Automatic functional-harmony analysis ───────────────────────────
// Given any scale (a step set in an EDO), derive its diatonic chords by
// stacking scale-thirds on each degree, name each in the sized-interval
// system (chordSymbol), and assign a harmonic function from theory:
//   • Dominant     — the chord carries the leading tone (a 7th within ~150¢
//                    of the octave); it pulls back to the tonic.
//   • Subdominant  — the chord carries the 4th degree (fa) but no leading tone;
//                    it pulls away from the tonic toward the dominant.
//   • Tonic        — the home chord, and chords with neither characteristic
//                    tone (they feel at rest).
// This is the standard "characteristic-tone" rule (fa = subdominant, ti =
// dominant), which generalises to any diatonic-style scale and any EDO.

import { chordSymbol } from "./chordNotation";

export type HarmonicFunction = "Tonic" | "Subdominant" | "Dominant";

export interface FunctionalChord {
  degree: number;          // 1-based scale degree of the root
  rootStep: number;        // root step (0-based, within the octave)
  triadSteps: number[];    // absolute steps from tonic (ascending), triad
  seventhSteps: number[];  // …including the 7th
  symbol: string;          // sized chord symbol for the triad ("I sM3")
  seventhSymbol: string;   // sized chord symbol for the 7th chord
  func: HarmonicFunction;
}

/** Stack scale-thirds on every degree and classify each chord's function. */
export function deriveFunctionalChords(rawSteps: number[], edo: number): FunctionalChord[] {
  const scale = [...new Set(rawSteps.map(s => (((s % edo) + edo) % edo)))].sort((a, b) => a - b);
  const n = scale.length;
  if (n < 3) return [];
  const cents = (s: number) => (s * 1200) / edo;

  // Characteristic tones, measured from the tonic (scale[0] === 0).
  const isLeadingTone = (s: number) => cents(s) >= 1050 && cents(s) < 1200;  // ti: ≤150¢ under the 8ve
  const isSubdominant = (s: number) => Math.abs(cents(s) - 498) <= 60;       // fa: a perfect 4th
  const ltSet = new Set(scale.filter(isLeadingTone));
  const faSet = new Set(scale.filter(isSubdominant));

  // Lift a list of in-octave steps so each sits strictly above the previous —
  // i.e. spell the chord ascending across octaves.
  const lift = (arr: number[]): number[] => {
    let prev = -1;
    return arr.map(s => { let v = s; while (v <= prev) v += edo; prev = v; return v; });
  };

  const out: FunctionalChord[] = [];
  for (let i = 0; i < n; i++) {
    const idxs = [0, 2, 4, 6].map(k => scale[(i + k) % n]);
    const triadSteps = lift([idxs[0], idxs[1], idxs[2]]);
    const seventhSteps = lift([idxs[0], idxs[1], idxs[2], idxs[3]]);
    const symbol = chordSymbol(triadSteps.map(s => cents(s)));
    const seventhSymbol = chordSymbol(seventhSteps.map(s => cents(s)));

    const tonePcs = [idxs[0], idxs[1], idxs[2]].map(s => (((s % edo) + edo) % edo));
    const hasLT = tonePcs.some(p => ltSet.has(p));
    const hasFa = tonePcs.some(p => faSet.has(p));
    const func: HarmonicFunction =
      i === 0 ? "Tonic" : hasLT ? "Dominant" : hasFa ? "Subdominant" : "Tonic";

    out.push({ degree: i + 1, rootStep: scale[i], triadSteps, seventhSteps, symbol, seventhSymbol, func });
  }
  return out;
}

export const FUNCTION_ORDER: HarmonicFunction[] = ["Tonic", "Subdominant", "Dominant"];
export const FUNCTION_COLOR: Record<HarmonicFunction, string> = {
  Tonic: "#6aa86a", Subdominant: "#c0a050", Dominant: "#c06a8a",
};
