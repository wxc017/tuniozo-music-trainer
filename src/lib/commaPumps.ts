// ── Comma Pump Catalog ────────────────────────────────────────────────────
//
// Curated chord progressions whose JI realisation drifts by a comma
// after a full cycle.  Each entry pairs a Roman-numeral progression
// with the prime-limit comma it pumps and the cumulative cent drift
// that accumulates over one pass.  The drift is computed live from
// jiLattice's tracePathDrifts so adding a curated TRANSITION_MOTIONS
// entry there automatically updates the displayed cents here.
//
// Surfaced in ScalarTab under the DIATONIC chord row for 41/53-EDO
// only — these are the EDOs that actually preserve the syntonic /
// septimal / etc. comma as an audible interval, so the pump is
// hearable.  12-EDO obliterates every comma; 19-EDO, 31-EDO are
// meantone (syntonic comma vanishes).

import { tracePathDrifts } from "./jiLattice";

export interface CommaPump {
  /** Stable id for React keys + state */
  key: string;
  /** Human-readable label, e.g. "I → vi → ii → V → I" */
  label: string;
  /** Roman-numeral chord sequence to play */
  progression: string[];
  /** Prime limit of the comma being pumped */
  primeLimit: 3 | 5 | 7 | 11 | 13;
  /** Short description for tooltip / muted secondary text */
  description: string;
}

const PUMPS: CommaPump[] = [
  // 5-limit syntonic pump.  vi → ii is the pump motion (held A from
  // vi into ii forces ii's D to 10/9 instead of 9/8 — see
  // jiLattice TRANSITION_MOTIONS).  After one cycle the I has
  // drifted by 81/80 (~21.5¢).  Most-cited example in any JI text.
  {
    key: "syntonic-vi-ii",
    label: "I → vi → ii → V → I",
    progression: ["I", "vi", "ii", "V", "I"],
    primeLimit: 5,
    description: "Syntonic comma pump — vi→ii holds A, forcing ii's D to 10/9.",
  },
  // Same pump, longer setup.  IV → ii doesn't pump on its own
  // (that's the canonical fallback), but the vi → ii motion still
  // does, so the cycle still drifts by one syntonic comma.
  {
    key: "syntonic-vi-ii-long",
    label: "I → IV → vi → ii → V → I",
    progression: ["I", "IV", "vi", "ii", "V", "I"],
    primeLimit: 5,
    description: "Syntonic pump with IV setup — same 81/80 drift via vi→ii.",
  },
];

/** Cumulative drift (cents) at the END of a pump's progression.
 *  Positive = chain drifted upward, negative = downward. */
export function pumpFinalDriftCents(pump: CommaPump): number {
  const drifts = tracePathDrifts(pump.progression);
  return drifts[drifts.length - 1] ?? 0;
}

/** Per-chord cumulative drifts for a pump — used to shift each
 *  chord's pitches at playback so the audible comma drift is
 *  actually heard. */
export function pumpChordDrifts(pump: CommaPump): number[] {
  return tracePathDrifts(pump.progression);
}

/** Pumps available for a given tonality on a given EDO.  Filters
 *  to (a) 41/53-EDO only — other EDOs collapse the comma — and
 *  (b) pumps whose chord labels are all present in the tonality's
 *  chord pool, so I-vi-ii-V-I doesn't surface in a minor tonality
 *  whose pool uses i/iv/v lowercase. */
export function pumpsForTonality(
  edo: number,
  availableChordLabels: Set<string>,
): CommaPump[] {
  if (edo !== 41 && edo !== 53) return [];
  return PUMPS.filter(p =>
    p.progression.every(label => availableChordLabels.has(label)),
  );
}
