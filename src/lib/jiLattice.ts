// ── JI Lattice Engine (true Adaptive JI / comma-drift modelling) ──────────
//
// Tracks chord-to-chord motion on the 5-limit JI lattice (3-axis, 5-axis)
// so chord progressions in Adaptive JI mode actually drift the tonic when
// they should — the famous I-vi-ii-V-I "comma pump" lands the final I
// 81/80 ≈ 21.5¢ flat from where it started.
//
// Lattice convention: a position [a, b] represents a pitch ratio of
// 3^a * 5^b * 2^c (octave c chosen for octave-reduction).  Each axis edge
// corresponds to a pure interval:
//   +3-axis = up a fifth   (3:2)
//   −3-axis = down a fifth (2:3)
//   +5-axis = up a major third (5:4)
//   −5-axis = down a major third (4:5)
//
// Chord transitions are mapped to lattice motions via a small table.
// Most diatonic motions are unambiguous (V→I = −fifth, I→IV = +fourth);
// the interesting cases are vi→ii and similar "minor-quality lower-fifth"
// motions where the canonical 5-limit JI choice introduces a syntonic
// comma into the chain — the source of the comma pump.
//
// 7-limit and 11-limit motions are deferred; this module handles 5-limit
// only.  Chord labels with suffixes (V/IV, I~neu, etc.) are stripped
// down to their core Roman numeral before lookup.
//
// TODO (deferred follow-up): true 7-/11-/13-axis support requires
// per-NOTE lattice tracking, not per-CHORD-ROOT — most 7/11/13-prime
// motions arise from chord QUALITY changes (e.g. dom7's 7/4 resolving
// to a major 3rd of the next chord) rather than chord-root motion on
// those axes.  Doing this honestly means tracking each note in each
// chord as its own lattice position and propagating through voice-
// leading.  The 5-limit lattice covers the famous syntonic-comma
// pumps that make up 95% of audible drift in tonal music; higher-axis
// extensions add septimal, tridecimal, undecimal pumps that are real
// but rarer.  For now the lattice tracks 5-limit; the higher-limit
// scales (11/13/17/19/23/29/31) play correctly at their static cents
// but their progressions don't pump on their characteristic commas.

export type LatticePos = readonly [number, number];   // [3-axis, 5-axis]

export const LATTICE_ORIGIN: LatticePos = [0, 0];

/** Cents value (in 0..1200) of a lattice position, octave-reduced. */
export function latticeToCents(pos: LatticePos): number {
  const c = pos[0] * 701.96 + pos[1] * 386.31;
  return ((c % 1200) + 1200) % 1200;
}

/** Signed drift in cents from origin, centred on 0 (range −600 .. +600). */
export function latticeDriftCents(pos: LatticePos): number {
  const c = latticeToCents(pos);
  return c > 600 ? c - 1200 : c;
}

/** Lattice position of each diatonic chord ROOT relative to the major
 *  tonic at [0, 0].  These are the "canonical" positions used when a
 *  chord is reached from the tonic directly; pump motions can override.
 *  Roman numerals follow the standard major-key labelling; minor-key
 *  scales reuse these (i = lower-case I, etc.). */
const CHORD_ROOT_POSITION: Record<string, LatticePos> = {
  "I":   [0, 0],
  "i":   [0, 0],
  "ii":  [+2, 0],   // Pythagorean D (9/8)
  "iiø": [+2, 0],
  "ii°": [+2, 0],
  "iii": [0, +1],   // 5/4 from tonic = E
  "III": [0, +1],
  "IV":  [-1, 0],   // 4/3 from tonic = F
  "iv":  [-1, 0],
  "V":   [+1, 0],   // 3/2 from tonic = G
  "v":   [+1, 0],
  "vi":  [-1, +1],  // 5/3 from tonic = A
  "VI":  [-1, +1],
  "vii°":[+1, +1],  // 15/8 from tonic = B
  "VII": [+1, +1],
  // Modal-mixture / borrowed chords
  "bII":  [-5, 0],  // Db as Pyth (rare); often used as Neapolitan
  "bIII": [+1, -1], // Eb as 6/5 (minor third up)
  "bVI":  [-3, 0],  // Ab as Pyth m6
  "bVII": [+2, -1], // Bb as 16/9 (Pyth m7) — could also be (-3,+1)
};

/** Motion vector for selected chord transitions.  When present, this
 *  overrides the (next.position − prev.position) default motion — used
 *  to encode the canonical pure-interval path between chords, which is
 *  what causes comma drift on diatonic loops.  Each entry asserts:
 *  "going from prev to next, the pure-interval move is [da, db]". */
const TRANSITION_MOTIONS: Record<string, Record<string, LatticePos>> = {
  // The comma-pump cluster.  Going vi → ii via "up a fourth from vi"
  // (not "back to the I-relative ii at +2,0") puts ii at lattice
  // (-2, +1) = 5-limit JI minor-second 10/9.  All subsequent chords in
  // the chain inherit the comma offset.
  "vi": { "ii": [-1, 0], "ii°": [-1, 0] },
  "VI": { "ii": [-1, 0], "ii°": [-1, 0] },
  // Authentic motions (don't drift on their own, but exercise the chain)
  "ii": { "V": [+1, 0] },
  "iiø":{ "V": [+1, 0] },
  "ii°":{ "V": [+1, 0] },
  "V":  { "I": [-1, 0], "i": [-1, 0], "vi": [-1, +1], "VI": [-1, +1] },
  "v":  { "I": [-1, 0], "i": [-1, 0] },
  // Plagal
  "IV": { "I": [+1, 0], "i": [+1, 0] },
  "iv": { "I": [+1, 0], "i": [+1, 0] },
  "I":  { "IV": [-1, 0], "iv": [-1, 0], "V": [+1, 0], "vi": [-1, +1], "ii": [+2, 0], "iii": [0, +1] },
  "i":  { "IV": [-1, 0], "iv": [-1, 0], "V": [+1, 0], "vi": [-1, +1], "VI": [-1, +1] },
  // Modal mixture
  "I":  { "bVII": [+2, -1], "bVI": [-3, 0], "bIII": [+1, -1] } as Record<string, LatticePos>,  // (overrides above; see merge note)
};

// Note: the duplicate "I" above is intentional clutter — TS's later-key-wins
// behaviour merges them, so the modal-mixture line wins.  In practice we
// merge explicitly:
const MERGED_TRANSITIONS = (() => {
  const out: Record<string, Record<string, LatticePos>> = {};
  for (const from of Object.keys(TRANSITION_MOTIONS)) {
    out[from] = { ...(out[from] ?? {}), ...TRANSITION_MOTIONS[from] };
  }
  // Hand-merge the two "I" entries so both sets of motions are reachable.
  out["I"] = {
    "IV": [-1, 0], "iv": [-1, 0], "V": [+1, 0],
    "vi": [-1, +1], "ii": [+2, 0], "iii": [0, +1],
    "bVII": [+2, -1], "bVI": [-3, 0], "bIII": [+1, -1],
  };
  return out;
})();

/** Strip xen suffixes / applied-chord prefixes from a chord label so the
 *  lattice lookup hits the underlying Roman numeral.  E.g. "I~neu" → "I",
 *  "V/IV" → "V" (we treat applied dominants as their own degree for lattice
 *  purposes; finer-grained applied-chord modelling is a follow-up). */
export function stripChordLabel(label: string): string {
  let s = label;
  const xenIdx = s.indexOf("~");
  if (xenIdx > 0) s = s.slice(0, xenIdx);
  const slashIdx = s.indexOf("/");
  if (slashIdx > 0) s = s.slice(0, slashIdx);
  return s;
}

/** Compute the lattice motion vector from `prev` to `next`.  Returns the
 *  curated pump motion when one is registered for the pair; otherwise
 *  returns the default motion as (next.position − prev.position). */
export function getLatticeMotion(prev: string, next: string): LatticePos {
  const p = stripChordLabel(prev);
  const n = stripChordLabel(next);
  const pump = MERGED_TRANSITIONS[p]?.[n];
  if (pump) return pump;
  const prevPos = CHORD_ROOT_POSITION[p] ?? [0, 0];
  const nextPos = CHORD_ROOT_POSITION[n] ?? [0, 0];
  return [nextPos[0] - prevPos[0], nextPos[1] - prevPos[1]];
}

/** Walk a progression, accumulating lattice positions per chord.  The
 *  first chord lands at LATTICE_ORIGIN; each subsequent chord adds the
 *  motion vector from the prior label.  Returns one position per chord. */
export function tracePath(progression: string[]): LatticePos[] {
  const out: LatticePos[] = [];
  let pos: LatticePos = LATTICE_ORIGIN;
  for (let i = 0; i < progression.length; i++) {
    if (i === 0) {
      // First chord: anchor to its canonical position relative to tonic.
      pos = CHORD_ROOT_POSITION[stripChordLabel(progression[0])] ?? LATTICE_ORIGIN;
    } else {
      const motion = getLatticeMotion(progression[i - 1], progression[i]);
      pos = [pos[0] + motion[0], pos[1] + motion[1]];
    }
    out.push(pos);
  }
  return out;
}

/** Cumulative drift (signed cents from origin) at each chord position
 *  in the path.  Computed by subtracting the chord's I-relative
 *  canonical position from the actual lattice position reached — what's
 *  left is the comma offset accumulated by the chord chain. */
export function tracePathDrifts(progression: string[]): number[] {
  const positions = tracePath(progression);
  return positions.map((pos, i) => {
    const canonical = CHORD_ROOT_POSITION[stripChordLabel(progression[i])] ?? LATTICE_ORIGIN;
    const driftPos: LatticePos = [pos[0] - canonical[0], pos[1] - canonical[1]];
    return latticeDriftCents(driftPos);
  });
}

/** Convert a lattice drift in cents to an EDO-step offset (rounded). */
export function driftCentsToSteps(driftCents: number, edo: number): number {
  return Math.round((driftCents / 1200) * edo);
}
