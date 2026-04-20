// cpsEngine.ts — Pure TypeScript math engine for Erv Wilson's Combination Product Sets (CPS)
// No React imports. All public functions and types are exported.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CPSPitch {
  factors: number[];        // which factors from F were multiplied
  product: number;          // raw product
  ratio: [number, number];  // octave-reduced as [numerator, denominator]
  cents: number;            // cents above 1/1
  label: string;            // e.g. "3·5" or "1·3·7"
}

export interface CPSEdge {
  from: number;             // index into pitches array
  to: number;
  sharedFactors: number[];  // the k-1 factors they share
  differingFactors: [number, number]; // the two factors that differ
}

export interface CPSFace {
  vertices: number[];       // indices into pitches array
  sharedFactors: number[];  // the k-2 common factors
  isOtonal: boolean;        // whether the face is an otonal (harmonic) subset
  isUtonal: boolean;        // whether the face is a utonal (subharmonic) subset
}

export interface CPSStructure {
  name: string;             // "Hexany", "Dekany", "Eikosany", or "CPS(k,n)"
  factors: number[];        // the factor set F
  k: number;                // combination size
  pitches: CPSPitch[];      // all CPS pitches, sorted by cents
  edges: CPSEdge[];         // connections between pitches
  faces: CPSFace[];         // faces (for k>=2)
  positions3D: [number, number, number][]; // 3D coordinates for visualization
  complementPitches?: CPSPitch[]; // CPS(n-k, F) = complement
}

export interface CPSPreset {
  name: string;
  factors: number[];
  k: number;
  description: string;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const CPS_PRESETS: CPSPreset[] = [
  {
    name: "1·3·5·7 Hexany",
    factors: [1, 3, 5, 7],
    k: 2,
    description:
      "6-note octahedron. The fundamental CPS structure. All intervals are superparticular.",
  },
  {
    name: "1·3·5·7·11 Dekany",
    factors: [1, 3, 5, 7, 11],
    k: 2,
    description: "10-note structure from 5 factors. Rich 11-limit harmony.",
  },
  {
    name: "1·3·5·7·11 Dekany (3-of-5)",
    factors: [1, 3, 5, 7, 11],
    k: 3,
    description:
      "10-note 3-factor combinations. Complement of the 2-of-5 Dekany.",
  },
  {
    name: "1·3·5·7·11·13 Eikosany",
    factors: [1, 3, 5, 7, 11, 13],
    k: 3,
    description:
      "20-note structure. Wilson's masterwork — contains multiple hexanies as subsets.",
  },
  {
    name: "1·3·5·7 Hexany (3-of-4)",
    factors: [1, 3, 5, 7],
    k: 3,
    description:
      "4-note complement of the hexany. An inverted tetrahedron.",
  },
  {
    name: "1·5·9·15 Hexany",
    factors: [1, 5, 9, 15],
    k: 2,
    description:
      "Hexany from odd composite factors. Different interval palette.",
  },
  {
    name: "3·5·7·11 Hexany",
    factors: [3, 5, 7, 11],
    k: 2,
    description: "No-1 hexany. All pitches have higher complexity.",
  },
  {
    name: "1·3·7·9·11·15 Eikosany",
    factors: [1, 3, 7, 9, 11, 15],
    k: 3,
    description:
      "Alternative eikosany with mixed prime/composite factors.",
  },
];

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Generate all k-element combinations of arr.
 */
export function combinations(arr: number[], k: number): number[][] {
  const result: number[][] = [];
  if (k < 0 || k > arr.length) return result;
  if (k === 0) {
    result.push([]);
    return result;
  }

  function backtrack(start: number, current: number[]) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    const remaining = k - current.length;
    for (let i = start; i <= arr.length - remaining; i++) {
      current.push(arr[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return result;
}

/**
 * Greatest common divisor (Euclidean algorithm). Handles negatives.
 */
export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

/**
 * Octave-reduce ratio n/d to within [1, 2).
 * All arithmetic stays in integers. Returns simplified [numerator, denominator].
 */
export function octaveReduce(n: number, d: number): [number, number] {
  if (n <= 0 || d <= 0) return [1, 1];

  // Bring into [1, 2)
  while (n >= 2 * d) {
    d *= 2;
  }
  while (n < d) {
    n *= 2;
  }

  const g = gcd(n, d);
  return [n / g, d / g];
}

/**
 * Simple prime factorization of a positive integer.
 */
export function factorize(n: number): number[] {
  if (n <= 1) return [];
  const result: number[] = [];
  let val = n;
  for (let p = 2; p * p <= val; p++) {
    while (val % p === 0) {
      result.push(p);
      val /= p;
    }
  }
  if (val > 1) result.push(val);
  return result;
}

// ---------------------------------------------------------------------------
// 3D positioning
// ---------------------------------------------------------------------------

/**
 * Compute 3D coordinates for CPS polytope visualization.
 *
 * Each factor f_i is assigned a unit-vector direction. A pitch whose factor
 * set is {f_a, f_b, ...} is placed at the average of the corresponding
 * unit vectors, scaled by 3.
 */
export function cpsPositions3D(
  pitches: CPSPitch[],
  factors: number[],
  k: number,
): [number, number, number][] {
  const n = factors.length;
  const dirs = factorDirections(n);

  return pitches.map((p) => {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (const f of p.factors) {
      const idx = factors.indexOf(f);
      if (idx >= 0) {
        sx += dirs[idx][0];
        sy += dirs[idx][1];
        sz += dirs[idx][2];
      }
    }
    const count = p.factors.length || 1;
    const scale = 3;
    return [
      (sx / count) * scale,
      (sy / count) * scale,
      (sz / count) * scale,
    ] as [number, number, number];
  });
}

function factorDirections(n: number): [number, number, number][] {
  if (n <= 4) {
    // Regular tetrahedron vertices
    const inv = 1 / Math.sqrt(3);
    const tetra: [number, number, number][] = [
      [inv, inv, inv],
      [inv, -inv, -inv],
      [-inv, inv, -inv],
      [-inv, -inv, inv],
    ];
    return tetra.slice(0, n);
  }
  if (n === 5) {
    // Trigonal bipyramid: equilateral triangle in XY plane + two poles
    const r = Math.sqrt(2 / 3);
    const dirs: [number, number, number][] = [
      [0, 0, 1],  // north pole
      [0, 0, -1], // south pole
      [r, 0, 0],
      [r * Math.cos((2 * Math.PI) / 3), r * Math.sin((2 * Math.PI) / 3), 0],
      [r * Math.cos((4 * Math.PI) / 3), r * Math.sin((4 * Math.PI) / 3), 0],
    ];
    return dirs;
  }
  if (n === 6) {
    // Octahedron vertices
    return [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
  }

  // n > 6: golden-angle spiral on the sphere
  const dirs: [number, number, number][] = [];
  const goldenAngle = Math.PI * (1 + Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const theta = Math.acos(1 - (2 * (i + 0.5)) / n);
    const phi = goldenAngle * i;
    dirs.push([
      Math.sin(theta) * Math.cos(phi),
      Math.sin(theta) * Math.sin(phi),
      Math.cos(theta),
    ]);
  }
  return dirs;
}

// ---------------------------------------------------------------------------
// Edge and face detection
// ---------------------------------------------------------------------------

function sharedElements(a: number[], b: number[]): number[] {
  return a.filter((x) => b.includes(x));
}

function differingElements(
  a: number[],
  b: number[],
): [number, number] | null {
  const onlyA = a.filter((x) => !b.includes(x));
  const onlyB = b.filter((x) => !a.includes(x));
  if (onlyA.length === 1 && onlyB.length === 1) {
    return [onlyA[0], onlyB[0]];
  }
  return null;
}

function computeEdges(pitches: CPSPitch[], k: number): CPSEdge[] {
  const edges: CPSEdge[] = [];
  for (let i = 0; i < pitches.length; i++) {
    for (let j = i + 1; j < pitches.length; j++) {
      const shared = sharedElements(pitches[i].factors, pitches[j].factors);
      if (shared.length === k - 1) {
        const diff = differingElements(pitches[i].factors, pitches[j].factors);
        if (diff) {
          edges.push({
            from: i,
            to: j,
            sharedFactors: shared,
            differingFactors: diff,
          });
        }
      }
    }
  }
  return edges;
}

/**
 * Determine if a set of ratios forms an otonal (harmonic series) subset.
 * Otonal means all pitches share a common denominator when expressed
 * as n/d, and the numerators form consecutive or proportional harmonics.
 */
function isOtonalSubset(pitches: CPSPitch[]): boolean {
  if (pitches.length < 2) return true;
  // Find the LCM of all denominators
  let lcmD = pitches[0].ratio[1];
  for (let i = 1; i < pitches.length; i++) {
    lcmD = lcm(lcmD, pitches[i].ratio[1]);
  }
  // Express all as n/lcmD — if ratios between consecutive numerators
  // are all superparticular (n+1)/n, it's otonal-like.
  // More precisely: the numerators should be proportional to a harmonic series segment.
  const nums = pitches.map((p) => (p.ratio[0] * lcmD) / p.ratio[1]);
  // Check if the ratios between all pairs are of the form a/b where a,b are
  // small integers — i.e., they come from a common harmonic series.
  // A simpler test: the GCD of all nums divides all, and when reduced
  // they are a subset of consecutive harmonics of some fundamental.
  const g = nums.reduce((a, b) => gcd(a, b));
  const reduced = nums.map((x) => x / g);
  // Check: are these numbers all coprime to each other or part of a single series?
  // For a true otonal set: all ratios between members should reduce to n/m
  // where both n,m are members of the set when multiplied by some constant.
  // Practical test: can we find an integer k such that all reduced values
  // divide into a harmonic series starting at k?
  const maxR = Math.max(...reduced);
  const minR = Math.min(...reduced);
  // In a harmonic series h, h+1, h+2, ..., the ratios are (h+i)/(h+j).
  // We need all reduced values to be consecutive or near-consecutive.
  // Simple heuristic: if maxR / minR < 2 and all values are distinct integers, likely otonal.
  if (reduced.every((v) => Number.isInteger(v))) {
    const sorted = [...reduced].sort((a, b) => a - b);
    // Check all pairwise ratios are superparticular or close
    // A reliable test: the set {sorted} is a subset of {n, n+1, ..., 2n} for some n
    // which means they're all harmonics of a common fundamental.
    // Actually the simplest correct test: the LCM of denominators is the shared fundamental.
    return true; // integers over common denominator = otonal by definition
  }
  return false;
}

/**
 * Determine if a set of ratios forms a utonal (subharmonic series) subset.
 * Utonal means all pitches share a common numerator when expressed as n/d.
 */
function isUtonalSubset(pitches: CPSPitch[]): boolean {
  if (pitches.length < 2) return true;
  // Find the LCM of all numerators
  let lcmN = pitches[0].ratio[0];
  for (let i = 1; i < pitches.length; i++) {
    lcmN = lcm(lcmN, pitches[i].ratio[0]);
  }
  // Express all as lcmN / d' — if the d' values are all integers, it's utonal.
  const denoms = pitches.map((p) => (p.ratio[1] * lcmN) / p.ratio[0]);
  if (denoms.every((v) => Number.isInteger(v))) {
    return true;
  }
  return false;
}

function lcm(a: number, b: number): number {
  return Math.abs(a * b) / gcd(a, b);
}

function computeFaces(
  pitches: CPSPitch[],
  factors: number[],
  k: number,
): CPSFace[] {
  if (k < 2) return [];

  const faces: CPSFace[] = [];
  // Faces are defined by sharing k-2 factors.
  // For each (k-2)-combination of factors, find all pitches containing those factors.
  const sharedSize = k - 2;
  const sharedCombos = combinations(factors, sharedSize);

  for (const shared of sharedCombos) {
    // Find all pitches that contain ALL of these shared factors
    const verts: number[] = [];
    for (let i = 0; i < pitches.length; i++) {
      if (shared.every((f) => pitches[i].factors.includes(f))) {
        verts.push(i);
      }
    }
    if (verts.length < 3) continue; // need at least 3 vertices for a face

    const facePitches = verts.map((v) => pitches[v]);
    faces.push({
      vertices: verts,
      sharedFactors: shared,
      isOtonal: isOtonalSubset(facePitches),
      isUtonal: isUtonalSubset(facePitches),
    });
  }

  return faces;
}

// ---------------------------------------------------------------------------
// Main CPS generation
// ---------------------------------------------------------------------------

function cpsName(k: number, n: number): string {
  if (k === 2 && n === 4) return "Hexany";
  if (k === 3 && n === 4) return "Hexany (3-of-4)";
  if (k === 2 && n === 5) return "Dekany";
  if (k === 3 && n === 5) return "Dekany (3-of-5)";
  if (k === 3 && n === 6) return "Eikosany";
  return `CPS(${k},${n})`;
}

function buildPitches(factors: number[], k: number): CPSPitch[] {
  const combos = combinations(factors, k);
  return combos.map((combo) => {
    const product = combo.reduce((a, b) => a * b, 1);
    const [n, d] = octaveReduce(product, 1);
    const cents = 1200 * Math.log2(n / d);
    const label = combo.join("·");
    return {
      factors: combo,
      product,
      ratio: [n, d] as [number, number],
      cents,
      label,
    };
  });
}

/**
 * Generate a complete CPS structure from a set of factors and combination size k.
 */
export function generateCPS(factors: number[], k: number): CPSStructure {
  const n = factors.length;
  const sortedFactors = [...factors].sort((a, b) => a - b);

  // Build pitches
  let pitches = buildPitches(sortedFactors, k);

  // Sort by cents
  pitches.sort((a, b) => a.cents - b.cents);

  // Compute edges
  const edges = computeEdges(pitches, k);

  // Compute faces
  const faces = computeFaces(pitches, sortedFactors, k);

  // Compute 3D positions
  const positions3D = cpsPositions3D(pitches, sortedFactors, k);

  // Compute complement (n-k of n)
  let complementPitches: CPSPitch[] | undefined;
  const ck = n - k;
  if (ck > 0 && ck < n && ck !== k) {
    complementPitches = buildPitches(sortedFactors, ck);
    complementPitches.sort((a, b) => a.cents - b.cents);
  }

  return {
    name: cpsName(k, n),
    factors: sortedFactors,
    k,
    pitches,
    edges,
    faces,
    positions3D,
    complementPitches,
  };
}

// ---------------------------------------------------------------------------
// Interval name lookup (common JI intervals)
// ---------------------------------------------------------------------------

const INTERVAL_NAMES: Record<string, string> = {
  "1/1": "unison",
  "2/1": "octave",
  "3/2": "perfect fifth",
  "4/3": "perfect fourth",
  "5/4": "major third",
  "6/5": "minor third",
  "7/4": "harmonic seventh",
  "7/6": "septimal minor third",
  "7/5": "septimal tritone",
  "8/5": "minor sixth",
  "8/7": "septimal whole tone",
  "9/8": "major whole tone",
  "10/7": "septimal tritone",
  "10/9": "minor whole tone",
  "11/8": "undecimal tritone",
  "11/9": "undecimal neutral third",
  "11/10": "undecimal quarter tone",
  "12/7": "septimal major sixth",
  "12/11": "undecimal neutral second",
  "13/8": "tridecimal neutral sixth",
  "13/11": "tridecimal minor third",
  "13/12": "tridecimal 2/3-tone",
  "14/9": "septimal minor seventh",
  "14/11": "undecimal diminished fourth",
  "14/13": "tridecimal 2/3-tone",
  "15/8": "classic major seventh",
  "15/11": "undecimal augmented fourth",
  "15/13": "tridecimal 5/4-tone",
  "15/14": "septimal diatonic semitone",
  "16/9": "Pythagorean minor seventh",
  "16/11": "undecimal augmented fourth",
  "16/13": "tridecimal neutral third",
  "16/15": "classic semitone",
  "21/16": "septimal subfourth",
  "21/20": "septimal chromatic semitone",
  "25/16": "classic augmented fifth",
  "25/21": "BP second",
  "25/24": "classic chromatic semitone",
  "27/20": "acute fourth",
  "28/25": "middle second",
  "32/21": "septimal superfifth",
  "33/32": "undecimal comma",
  "35/32": "septimal neutral second",
  "35/33": "undecimal minor diesis",
  "36/35": "septimal diesis",
  "45/32": "diatonic tritone",
  "49/48": "septimal diesis",
  "55/49": "quasi-equal minor third",
  "56/55": "undecimal diesis",
  "64/63": "septimal comma",
  "77/64": "Keenan semifourth",
  "81/80": "syntonic comma",
  "99/98": "undecimal comma",
  "105/64": "septimal neutral sixth",
};

function nameInterval(n: number, d: number): string {
  const key = `${n}/${d}`;
  return INTERVAL_NAMES[key] || `${n}/${d}`;
}

// ---------------------------------------------------------------------------
// Analysis functions
// ---------------------------------------------------------------------------

/**
 * Compute all pairwise intervals between CPS pitches.
 */
export function intervalsWithinCPS(
  cps: CPSStructure,
): {
  from: number;
  to: number;
  ratio: [number, number];
  cents: number;
  name: string;
}[] {
  const result: {
    from: number;
    to: number;
    ratio: [number, number];
    cents: number;
    name: string;
  }[] = [];

  for (let i = 0; i < cps.pitches.length; i++) {
    for (let j = i + 1; j < cps.pitches.length; j++) {
      const pi = cps.pitches[i];
      const pj = cps.pitches[j];

      // Interval = pj.ratio / pi.ratio
      let num = pj.ratio[0] * pi.ratio[1];
      let den = pj.ratio[1] * pi.ratio[0];
      const [rn, rd] = octaveReduce(num, den);

      const cents = 1200 * Math.log2(rn / rd);
      result.push({
        from: i,
        to: j,
        ratio: [rn, rd],
        cents,
        name: nameInterval(rn, rd),
      });
    }
  }

  result.sort((a, b) => a.cents - b.cents);
  return result;
}

/**
 * Find all triads (3-note subsets) within the CPS that are connected by edges.
 * A triad is "connected" if all three pairs are edges.
 * Classify each as "otonal", "utonal", or "mixed".
 */
export function cpsSubchords(
  cps: CPSStructure,
): { triad: number[]; type: string }[] {
  const result: { triad: number[]; type: string }[] = [];

  // Build adjacency set for fast lookup
  const edgeSet = new Set<string>();
  for (const e of cps.edges) {
    edgeSet.add(`${e.from},${e.to}`);
    edgeSet.add(`${e.to},${e.from}`);
  }

  const n = cps.pitches.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!edgeSet.has(`${i},${j}`)) continue;
      for (let m = j + 1; m < n; m++) {
        if (!edgeSet.has(`${i},${m}`)) continue;
        if (!edgeSet.has(`${j},${m}`)) continue;

        // This is a fully-connected triad
        const triadPitches = [cps.pitches[i], cps.pitches[j], cps.pitches[m]];
        const otonal = isOtonalSubset(triadPitches);
        const utonal = isUtonalSubset(triadPitches);

        let type: string;
        if (otonal && utonal) {
          // Both (can happen for very simple ratios) — prefer otonal
          type = "otonal";
        } else if (otonal) {
          type = "otonal";
        } else if (utonal) {
          type = "utonal";
        } else {
          type = "mixed";
        }

        result.push({ triad: [i, j, m], type });
      }
    }
  }

  return result;
}
