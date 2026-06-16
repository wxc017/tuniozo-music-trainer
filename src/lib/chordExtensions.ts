// ── Chord-extension pool (scale-aware) ───────────────────────────────
// Extracted from the ChordsTab voicing pipeline so the "every randomized
// extension stays in the pool" invariant is unit-testable.
//
// Two jobs:
//   1. diatonicExtensionStep — resolve a natural extension (2/4/6/9/11/13)
//      to the CURRENT scale's actual degree by walking the diatonic scale
//      up from the chord root, instead of a fixed major/perfect interval.
//      So a 13th over a harmonic-minor chord becomes the scale's ♭6, not a
//      major 6th that the scale gate would then have to discard.
//   2. buildExtensionPool — the full filtered pool of extension STEPS the
//      voicing may draw from, honouring the scale gate + tendency.

import { getExtLabelToSteps } from "./edoData";

export type ExtTendency = "Any" | "Stable" | "Avoid" | string;

// Natural extension label → [scale-steps above the chord root, octave lift].
// 9/11/13 are the octave-up compounds of 2/4/6.
const EXT_DIATONIC: Record<string, [number, number]> = {
  "2nd": [1, 0], "4th": [3, 0], "6th": [5, 0],
  "9th": [1, 1], "11th": [3, 1], "13th": [5, 1],
};

/** The in-scale step (relative to the chord root step) for a natural
 *  extension, found by walking the 7-note diatonic scale `scaleRoots` up
 *  from the chord root.  Returns null when the scale isn't a 7-note set,
 *  the chord root isn't one of its degrees (chromatic / borrowed chords),
 *  or the label isn't a natural extension — callers then fall back to the
 *  fixed-quality degree map. */
export function diatonicExtensionStep(
  edo: number, scaleRoots: number[] | null | undefined, chordRootStep: number, label: string,
): number | null {
  const off = EXT_DIATONIC[label];
  if (!off || !scaleRoots) return null;
  const scale = Array.from(new Set(scaleRoots.map(r => ((r % edo) + edo) % edo))).sort((a, b) => a - b);
  if (scale.length !== 7) return null;
  const rootPc = ((chordRootStep % edo) + edo) % edo;
  const idx = scale.indexOf(rootPc);
  if (idx < 0) return null;
  const targetPc = scale[(idx + off[0]) % 7];
  const interval = ((targetPc - rootPc) % edo + edo) % edo;
  return interval + off[1] * edo;
}

export interface ExtensionPoolParams {
  edo: number;
  /** Checked natural-extension labels ("6th", "13th", …). */
  checkedExts: Iterable<string>;
  /** Pitch classes that count as "in the scale / pool". */
  scalePcs: Set<number>;
  /** The tonality's 7 diatonic scale roots (pcs), or null when unknown. */
  scaleRoots: number[] | null | undefined;
  /** Chord root, as an absolute EDO step. */
  chordRootStep: number;
  extTendency: ExtTendency;
  /** matchedType.stable — the chord type's consonant interval set (for "In Key"). */
  stableSet?: number[] | null;
}

/** Build the pool of extension STEPS (relative to the chord root step) the
 *  voicing may draw from.  Mirrors the ChordsTab pipeline exactly, but each
 *  natural extension ALSO offers its in-scale (diatonic-walk) variant, so
 *  the scale gate can keep the in-key tone (e.g. ♭6 as the 13th in harmonic
 *  minor) instead of dropping the only — major — candidate.
 *
 *  Invariant: for "Any"/"Stable" the returned steps are all in `scalePcs`;
 *  for "Avoid" they are all OUT of `scalePcs` (unless no out-of-scale tone
 *  exists, in which case the gate is relaxed as a last resort). */
export function buildExtensionPool(p: ExtensionPoolParams): number[] {
  const extMap = getExtLabelToSteps(p.edo);
  const build = (applyScale: boolean, applyStable: boolean): number[] => {
    const pool: number[] = [];
    const seen = new Set<number>();
    for (const lbl of p.checkedExts) {
      // 7th is carried by seventh-chord voicings, not as a generic ext.
      if (lbl === "7th") continue;
      const steps = [...(extMap[lbl] ?? [])];
      const dia = diatonicExtensionStep(p.edo, p.scaleRoots, p.chordRootStep, lbl);
      if (dia !== null) steps.push(dia);
      for (const s of steps) {
        if (seen.has(s)) continue;
        const pc = ((p.chordRootStep + s) % p.edo + p.edo) % p.edo;
        const inScale = p.scalePcs.has(pc);
        if (applyScale) {
          if (p.extTendency === "Avoid") {
            if (inScale) continue;                         // deliberately seek out-of-scale tension
          } else if (!inScale) continue;                   // Any / In-Key: extensions stay in the scale
        }
        // "In Key" additionally restricts to the chord type's consonant set.
        if (applyStable && p.extTendency === "Stable" && p.stableSet && p.stableSet.length > 0
            && !p.stableSet.includes(((s % p.edo) + p.edo) % p.edo)) continue;
        seen.add(s);
        pool.push(s);
      }
    }
    return pool;
  };
  // In-scale + (for In-Key) the consonant-set narrowing.
  let pool = build(true, true);
  // If the consonant narrowing emptied it, relax ONLY that — keep the scale
  // gate — so "In Key" never leaks an out-of-scale tone.
  if (pool.length === 0 && p.extTendency === "Stable") pool = build(true, false);
  // "Avoid" genuinely wants out-of-scale tension; if none exists, allow anything.
  if (pool.length === 0 && p.extTendency === "Avoid") pool = build(false, false);
  return pool;
}
