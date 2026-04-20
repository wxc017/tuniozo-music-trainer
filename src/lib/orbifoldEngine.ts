// orbifoldEngine.ts
// Pure TypeScript math engine for voice-leading orbifold geometry (Tymoczko 2006).
// No React imports. All pitch-class arithmetic is modular (mod edo).
// Works for any EDO, not just 12.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChordType {
  intervals: number[];      // interval vector [i1, i2, ..., in], sum = edo
  pcSet: number[];          // pitch classes starting from 0
  name: string;             // human-readable name or interval string
  symmetryOrder: number;    // how many rotations map to itself (1=asymmetric, n=maximally symmetric)
  inversionallySymmetric: boolean;
}

export interface VoiceLeading {
  assignment: number[];     // assignment[i] = which voice of chord2 voice i maps to
  motions: number[];        // signed motion for each voice (positive = up, negative = down)
  totalL1: number;          // sum of |motions|
  totalL2: number;          // sqrt of sum of motions^2
  maxMotion: number;        // max |motion| (L-infinity)
}

export interface VLGraphNode {
  id: number;
  chord: ChordType;
  x: number; y: number; z: number;  // simplex coordinates
}

export interface VLGraphEdge {
  from: number; to: number;
  vl: VoiceLeading;
}

export interface VLGraph {
  nodes: VLGraphNode[];
  edges: VLGraphEdge[];
}

export interface GeodesicFrame {
  t: number;                // 0 to 1
  pitches: number[];        // interpolated pitch classes (continuous, may be non-integer)
}

// ---------------------------------------------------------------------------
// Named chord database (12-EDO only)
// ---------------------------------------------------------------------------

const CHORD_NAMES_12: Record<string, string> = {
  "4-3-5": "Major", "3-4-5": "Minor", "3-3-6": "Dim", "4-4-4": "Aug",
  "2-5-5": "sus2", "5-2-5": "sus4", "2-3-7": "min(no5)",
  "4-3-4-1": "Maj7", "4-3-3-2": "Dom7", "3-4-3-2": "min7",
  "3-3-3-3": "dim7", "3-3-4-2": "ø7", "3-4-4-1": "mMaj7",
  "4-4-3-1": "Aug7", "4-4-2-2": "AugMaj7",
  "2-2-3-5": "add9(no5)", "4-3-2-3": "Dom9(no5)",
};

// ---------------------------------------------------------------------------
// Modular arithmetic helpers
// ---------------------------------------------------------------------------

/** Proper mathematical modulo (always non-negative). */
function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/**
 * Circular distance between two pitch classes in Z_N.
 * Returns the shortest unsigned distance around the circle.
 */
export function pcDistance(a: number, b: number, edo: number): number {
  const diff = mod(b - a, edo);
  return Math.min(diff, edo - diff);
}

/**
 * Signed shortest motion from `from` to `to` on the pitch-class circle.
 * Positive = clockwise (ascending), negative = counterclockwise (descending).
 * Ties (motion = edo/2) break toward positive.
 */
export function signedPcMotion(from: number, to: number, edo: number): number {
  const diff = mod(to - from, edo);
  if (diff <= edo / 2) {
    // Ascending (clockwise) is shorter or tied — return positive.
    // When diff === 0, motion is 0.
    return diff;
  }
  // Descending (counterclockwise) is shorter.
  return diff - edo; // negative value
}

// ---------------------------------------------------------------------------
// Hungarian algorithm (Kuhn-Munkres), O(n^3)
// ---------------------------------------------------------------------------

/**
 * Standard O(n^3) Hungarian algorithm for minimum-cost assignment on a square
 * cost matrix. Returns an array `assignment` where assignment[i] = j means
 * row i is matched to column j.
 *
 * Implementation follows the shortest-augmenting-path formulation with
 * potentials (u for rows, v for columns).
 */
export function hungarian(costMatrix: number[][]): number[] {
  const n = costMatrix.length;
  if (n === 0) return [];

  // We use 1-based indexing internally; row 0 and col 0 are dummies.
  const u = new Float64Array(n + 1); // row potentials
  const v = new Float64Array(n + 1); // col potentials
  const p = new Int32Array(n + 1);   // p[j] = row assigned to column j
  const way = new Int32Array(n + 1); // way[j] = previous column in shortest-path tree

  for (let i = 1; i <= n; i++) {
    // Start augmenting path from row i.
    p[0] = i;
    let j0 = 0; // virtual column
    const minv = new Float64Array(n + 1).fill(Infinity);
    const used = new Uint8Array(n + 1); // boolean

    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = -1;

      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = costMatrix[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }

      // Update potentials.
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }

      j0 = j1;
    } while (p[j0] !== 0);

    // Trace back the augmenting path.
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  // Build result: assignment[row] = col (0-based).
  const assignment = new Array<number>(n);
  for (let j = 1; j <= n; j++) {
    assignment[p[j] - 1] = j - 1;
  }
  return assignment;
}

// ---------------------------------------------------------------------------
// Voice leading
// ---------------------------------------------------------------------------

/**
 * Find the optimal voice leading (bijection) between two equal-sized chords
 * that minimizes L1 (total absolute motion).
 *
 * For n <= 7: brute-force over all n! permutations.
 * For n > 7: Hungarian algorithm.
 */
export function voiceLeading(
  chord1: number[],
  chord2: number[],
  edo: number,
): VoiceLeading {
  const n = chord1.length;
  if (n !== chord2.length) {
    throw new Error("voiceLeading: chords must have the same cardinality");
  }
  if (n === 0) {
    return { assignment: [], motions: [], totalL1: 0, totalL2: 0, maxMotion: 0 };
  }

  // Build cost matrix.
  const cost: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => pcDistance(chord1[i], chord2[j], edo)),
  );

  let bestAssignment: number[];

  if (n <= 7) {
    // Brute-force: enumerate all permutations.
    bestAssignment = bruteForceAssignment(cost, n);
  } else {
    bestAssignment = hungarian(cost);
  }

  // Compute signed motions using the optimal assignment.
  const motions = bestAssignment.map((j, i) =>
    signedPcMotion(chord1[i], chord2[j], edo),
  );

  const totalL1 = motions.reduce((s, m) => s + Math.abs(m), 0);
  const totalL2 = Math.sqrt(motions.reduce((s, m) => s + m * m, 0));
  const maxMotion = motions.reduce((s, m) => Math.max(s, Math.abs(m)), 0);

  return {
    assignment: bestAssignment,
    motions,
    totalL1,
    totalL2,
    maxMotion,
  };
}

/** Brute-force minimum-cost assignment for small n. */
function bruteForceAssignment(cost: number[][], n: number): number[] {
  let bestCost = Infinity;
  let bestPerm: number[] = [];

  const perm = Array.from({ length: n }, (_, i) => i);

  // Heap's algorithm for generating all permutations.
  const c = new Array<number>(n).fill(0);

  // Evaluate initial (identity) permutation.
  const evalCost = (p: number[]): number =>
    p.reduce((s, j, i) => s + cost[i][j], 0);

  let curCost = evalCost(perm);
  if (curCost < bestCost) {
    bestCost = curCost;
    bestPerm = perm.slice();
  }

  let i = 0;
  while (i < n) {
    if (c[i] < i) {
      if (i % 2 === 0) {
        [perm[0], perm[i]] = [perm[i], perm[0]];
      } else {
        [perm[c[i]], perm[i]] = [perm[i], perm[c[i]]];
      }
      curCost = evalCost(perm);
      if (curCost < bestCost) {
        bestCost = curCost;
        bestPerm = perm.slice();
      }
      c[i]++;
      i = 0;
    } else {
      c[i] = 0;
      i++;
    }
  }

  return bestPerm;
}

// ---------------------------------------------------------------------------
// Chord type enumeration
// ---------------------------------------------------------------------------

/** Canonical form: smallest lexicographic rotation of the interval vector. */
function canonicalRotation(intervals: number[]): number[] {
  const n = intervals.length;
  let best = intervals;
  for (let r = 1; r < n; r++) {
    const rotated = [...intervals.slice(r), ...intervals.slice(0, r)];
    if (lexLess(rotated, best)) {
      best = rotated;
    }
  }
  return best;
}

/** True if a < b lexicographically. */
function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return false;
}

/** Key string for an interval vector. */
function ivKey(iv: number[]): string {
  return iv.join("-");
}

/**
 * Enumerate all distinct n-note chord types in the given EDO.
 *
 * A chord type is an equivalence class of pitch-class sets under transposition,
 * represented by its canonical interval vector (smallest lexicographic rotation
 * of the cyclic interval sequence).
 */
export function allChordTypes(n: number, edo: number): ChordType[] {
  if (n < 1 || n > edo) return [];

  const results: ChordType[] = [];
  const seen = new Set<string>();

  // Generate all compositions of `edo` into `n` parts, each >= 1.
  // We do this recursively.
  const current: number[] = new Array(n);

  function generate(pos: number, remaining: number): void {
    if (pos === n - 1) {
      if (remaining < 1) return;
      current[pos] = remaining;
      const canonical = canonicalRotation(current.slice());
      const key = ivKey(canonical);
      if (!seen.has(key)) {
        seen.add(key);

        // Build pcSet from canonical intervals starting at 0.
        const pcSet = [0];
        for (let i = 0; i < n - 1; i++) {
          pcSet.push(mod(pcSet[i] + canonical[i], edo));
        }

        // Symmetry order: count rotations that produce the same vector.
        let symmetryOrder = 0;
        for (let r = 0; r < n; r++) {
          const rotated = [...canonical.slice(r), ...canonical.slice(0, r)];
          if (ivKey(rotated) === key) symmetryOrder++;
        }

        // Inversional symmetry: reverse the interval vector and check
        // if its canonical rotation matches.
        const reversed = canonical.slice().reverse();
        const revCanonical = canonicalRotation(reversed);
        const inversionallySymmetric = ivKey(revCanonical) === key;

        // Name lookup for 12-EDO.
        let name: string;
        if (edo === 12 && CHORD_NAMES_12[key]) {
          name = CHORD_NAMES_12[key];
        } else {
          name = key;
        }

        results.push({
          intervals: canonical,
          pcSet,
          name,
          symmetryOrder,
          inversionallySymmetric,
        });
      }
      return;
    }

    // Each interval must be >= 1, and we need to leave at least 1 per remaining slot.
    const maxVal = remaining - (n - 1 - pos);
    for (let v = 1; v <= maxVal; v++) {
      current[pos] = v;
      generate(pos + 1, remaining - v);
    }
  }

  generate(0, edo);
  return results;
}

// ---------------------------------------------------------------------------
// Simplex coordinates
// ---------------------------------------------------------------------------

/**
 * Map an interval vector to visualization coordinates in a simplex.
 *
 * - n=3: 2D equilateral triangle (barycentric), z=0
 * - n=4: 3D regular tetrahedron (3-simplex embedding)
 * - n>4: first 3 principal barycentric coordinates projected to 3D
 */
export function simplexCoords(
  intervals: number[],
  edo: number,
): { x: number; y: number; z: number } {
  const n = intervals.length;
  // Barycentric weights.
  const w = intervals.map((iv) => iv / edo);

  if (n === 3) {
    // 2D equilateral triangle with vertices at:
    // v0 = (0, 0), v1 = (1, 0), v2 = (0.5, sqrt(3)/2)
    // point = w0*v0 + w1*v1 + w2*v2
    const x = w[1] + w[2] * 0.5;
    const y = w[2] * (Math.sqrt(3) / 2);
    return { x, y, z: 0 };
  }

  if (n === 4) {
    // Regular tetrahedron vertices (3-simplex embedding):
    const sqrt3 = Math.sqrt(3);
    const v = [
      [1 / sqrt3, 1 / sqrt3, 1 / sqrt3],
      [-1 / sqrt3, -1 / sqrt3, 1 / sqrt3],
      [-1 / sqrt3, 1 / sqrt3, -1 / sqrt3],
      [1 / sqrt3, -1 / sqrt3, -1 / sqrt3],
    ];
    let x = 0, y = 0, z = 0;
    for (let j = 0; j < 4; j++) {
      x += w[j] * v[j][0];
      y += w[j] * v[j][1];
      z += w[j] * v[j][2];
    }
    return { x, y, z };
  }

  // n > 4: project onto first 3 barycentric coordinates using a
  // standard simplex-to-3D mapping. We use the first three weights
  // mapped via the tetrahedron vertices as an approximation, distributing
  // the remaining weight equally among the first three axes.
  if (n < 3) {
    // n=1 or n=2: degenerate cases
    if (n === 1) return { x: 0, y: 0, z: 0 };
    // n=2: place on a line segment
    return { x: w[0], y: 0, z: 0 };
  }

  // For n > 4, take the first 4 barycentric coordinates (collapsing the rest
  // into the 4th) and embed in the tetrahedron.
  const w4 = [w[0], w[1], w[2], 0];
  for (let j = 3; j < n; j++) {
    w4[3] += w[j];
  }
  const sqrt3 = Math.sqrt(3);
  const v = [
    [1 / sqrt3, 1 / sqrt3, 1 / sqrt3],
    [-1 / sqrt3, -1 / sqrt3, 1 / sqrt3],
    [-1 / sqrt3, 1 / sqrt3, -1 / sqrt3],
    [1 / sqrt3, -1 / sqrt3, -1 / sqrt3],
  ];
  let x = 0, y = 0, z = 0;
  for (let j = 0; j < 4; j++) {
    x += w4[j] * v[j][0];
    y += w4[j] * v[j][1];
    z += w4[j] * v[j][2];
  }
  return { x, y, z };
}

// ---------------------------------------------------------------------------
// Chord type from pitch-class set
// ---------------------------------------------------------------------------

/**
 * Given a pitch-class set, compute its ChordType (intervals, name, symmetry).
 * The pcSet is sorted, and the interval vector is derived from consecutive
 * differences (wrapping around via the circle).
 */
export function chordTypeByPcSet(pcSet: number[], edo: number): ChordType {
  if (pcSet.length === 0) {
    return {
      intervals: [],
      pcSet: [],
      name: "",
      symmetryOrder: 1,
      inversionallySymmetric: true,
    };
  }

  const n = pcSet.length;

  // Sort pitch classes.
  const sorted = pcSet.slice().sort((a, b) => a - b);

  // Compute interval vector (consecutive differences on the circle).
  const rawIntervals: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    rawIntervals.push(mod(sorted[i + 1] - sorted[i], edo));
  }
  rawIntervals.push(mod(sorted[0] - sorted[n - 1], edo));

  // Handle edge case: if any interval is 0, we have duplicate pitch classes.
  // We still proceed but the interval vector may contain zeros.

  const canonical = canonicalRotation(rawIntervals);
  const key = ivKey(canonical);

  // Build canonical pcSet starting from 0.
  const canonicalPcSet = [0];
  for (let i = 0; i < n - 1; i++) {
    canonicalPcSet.push(mod(canonicalPcSet[i] + canonical[i], edo));
  }

  // Symmetry order.
  let symmetryOrder = 0;
  for (let r = 0; r < n; r++) {
    const rotated = [...canonical.slice(r), ...canonical.slice(0, r)];
    if (ivKey(rotated) === key) symmetryOrder++;
  }

  // Inversional symmetry.
  const reversed = canonical.slice().reverse();
  const revCanonical = canonicalRotation(reversed);
  const inversionallySymmetric = ivKey(revCanonical) === key;

  // Name.
  let name: string;
  if (edo === 12 && CHORD_NAMES_12[key]) {
    name = CHORD_NAMES_12[key];
  } else {
    name = key;
  }

  return {
    intervals: canonical,
    pcSet: canonicalPcSet,
    name,
    symmetryOrder,
    inversionallySymmetric,
  };
}

// ---------------------------------------------------------------------------
// Voice-leading graph
// ---------------------------------------------------------------------------

/**
 * Build a voice-leading graph for all n-note chord types in a given EDO.
 * An edge is added between two chord types if their optimal L1 voice-leading
 * distance is at most maxDist.
 */
export function buildVLGraph(
  n: number,
  edo: number,
  maxDist: number,
): VLGraph {
  const types = allChordTypes(n, edo);
  const nodes: VLGraphNode[] = types.map((ct, i) => {
    const coords = simplexCoords(ct.intervals, edo);
    return {
      id: i,
      chord: ct,
      x: coords.x,
      y: coords.y,
      z: coords.z,
    };
  });

  const edges: VLGraphEdge[] = [];

  for (let i = 0; i < types.length; i++) {
    for (let j = i + 1; j < types.length; j++) {
      const vl = voiceLeading(types[i].pcSet, types[j].pcSet, edo);
      if (vl.totalL1 <= maxDist) {
        edges.push({ from: i, to: j, vl });
      }
    }
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Geodesic path (linear interpolation in voice-leading space)
// ---------------------------------------------------------------------------

/**
 * Compute a geodesic (straight-line) path in voice-leading space between
 * two chords. Returns `steps` frames with linearly interpolated pitches.
 *
 * The optimal voice leading determines which voices connect, and each voice
 * moves linearly from its start to its target pitch class.
 */
export function geodesicPath(
  chord1: number[],
  chord2: number[],
  edo: number,
  steps: number,
): GeodesicFrame[] {
  if (steps < 2) steps = 2;

  const vl = voiceLeading(chord1, chord2, edo);
  const frames: GeodesicFrame[] = [];

  for (let s = 0; s < steps; s++) {
    const t = s / (steps - 1);
    const pitches = chord1.map((pc, i) => {
      const motion = vl.motions[i];
      // Linear interpolation; keep continuous (may be non-integer).
      return mod(pc + t * motion, edo);
    });
    frames.push({ t, pitches });
  }

  return frames;
}
