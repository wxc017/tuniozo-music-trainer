/**
 * Tonnetz Engine — Neo-Riemannian Theory Lattice
 *
 * Pure data/math engine for generating Tonnetz lattices at various JI limits.
 * Produces 3D node positions, edges, otonal/utonal simplices (triads/tetrads),
 * and PLR (Parallel, Leading-tone, Relative) transformations.
 *
 * Supports 5-limit (2D triangular tiling) and 7-limit (3D tetrahedral).
 *
 * No React code — this is a standalone data/math module.
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface TonnetzConfig {
  limit: 5 | 7;
  bounds: Record<number, [number, number]>;         // prime → [min, max] exponent
  projections: Record<number, [number, number, number]>; // prime → 3D projection vector
}

export interface TonnetzNode {
  key: string;           // grid coords as "a,b" or "a,b,c" etc.
  ratioKey: string;      // "n/d" format for drone compatibility
  n: number;
  d: number;
  exps: number[];        // prime exponents (one per axis, excluding prime 2)
  pos3d: [number, number, number];
  cents: number;
  noteName: string;
}

export interface TonnetzEdge {
  from: string;          // node key (grid coords)
  to: string;
  prime: number;         // the prime axis this edge is along
}

export interface TonnetzTriad {
  key: string;           // "o:0,0" or "u:1,1" etc.
  type: "otonal" | "utonal";
  nodeKeys: string[];    // keys of nodes forming this simplex
  center: [number, number, number]; // centroid position for rendering
}

export interface PLRLink {
  name: string;          // "P", "L", "R" for 5-limit; descriptive for higher
  description: string;   // e.g. "third moves" or "root moves"
  from: string;          // triad key
  to: string;            // triad key
  sharedNodes: string[]; // nodes shared between the two triads
  movedFrom: string;     // node key that leaves
  movedTo: string;       // node key that enters
}

export interface TonnetzData {
  nodes: TonnetzNode[];
  nodeMap: Map<string, TonnetzNode>;
  edges: TonnetzEdge[];
  triads: TonnetzTriad[];
  plrLinks: PLRLink[];
  plrByTriad: Map<string, PLRLink[]>; // triad key → outgoing PLR links
  primes: number[];
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

/** Primes used as generators for each limit (excludes 2, which is octave-reduced). */
export const LIMIT_PRIMES: Record<number, number[]> = {
  5: [3, 5],
  7: [3, 5, 7],
};

/**
 * Default 3D projection vectors for each prime axis.
 * - 5-limit uses X and Y axes at 60° for equilateral triangle tiling.
 * - 7-limit adds Z for regular tetrahedral geometry.
 */
export const TONNETZ_PROJECTIONS: Record<number, [number, number, number]> = {
  3:  [3, 0, 0],              // fifths along X
  5:  [1.5, 2.598, 0],        // major thirds at 60° in XY plane
  7:  [1.5, 0.866, 2.449],    // septimal axis up into Z (regular tetrahedron)
};

/**
 * 2D projection vectors — all axes lie in the XY plane at distinct angles.
 * ×3 at 0°, ×5 at 60°, ×7 at 120°.
 */
export const TONNETZ_PROJECTIONS_2D: Record<number, [number, number, number]> = {
  3:  [3, 0, 0],                // 0°
  5:  [1.5, 2.598, 0],          // 60°
  7:  [-1.5, 2.598, 0],         // 120°
};

export const DEFAULT_TONNETZ_BOUNDS: Record<number, [number, number]> = {
  3:  [-4, 4],
  5:  [-3, 3],
  7:  [-2, 2],
};

export const TONNETZ_PRIME_COLORS: Record<number, string> = {
  3: "#e87010", 5: "#22cc44", 7: "#5599ff",
};

/** Root note options (same as latticeEngine for compatibility). */
export const ROOT_NOTE_OPTIONS = [
  "C", "C#/Db", "D", "D#/Eb", "E", "F", "F#/Gb", "G", "G#/Ab", "A", "A#/Bb", "B",
];

// ═══════════════════════════════════════════════════════════════
// Preset Configurations
// ═══════════════════════════════════════════════════════════════

export const TONNETZ_PRESETS: Record<string, TonnetzConfig> = {
  "5-limit": {
    limit: 5,
    bounds: { 2: [-1, 1], 3: [-4, 4], 5: [-3, 3] },
    projections: TONNETZ_PROJECTIONS_2D,
  },
  "7-limit": {
    limit: 7,
    bounds: { 2: [-1, 1], 3: [-3, 3], 5: [-2, 2], 7: [-2, 2] },
    projections: TONNETZ_PROJECTIONS,
  },
};

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

/** Greatest common divisor (Euclidean algorithm). */
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

/**
 * Convert a vector of prime exponents to an octave-reduced ratio [n, d].
 *
 * Given exponents [e₃, e₅, e₇, ...] for primes [3, 5, 7, ...],
 * the raw ratio is 3^e₃ * 5^e₅ * 7^e₇ * ... which may be > 2 or < 1.
 * Octave reduction multiplies/divides by 2 until 1 ≤ ratio < 2.
 */
function expsToRatio(exps: number[], primes: number[]): [number, number] {
  // Separate positive and negative exponents to build n and d
  let n = 1;
  let d = 1;
  for (let i = 0; i < exps.length; i++) {
    const e = exps[i];
    if (e > 0) {
      n *= Math.pow(primes[i], e);
    } else if (e < 0) {
      d *= Math.pow(primes[i], -e);
    }
  }

  // At this point ratio = n/d (no factors of 2 yet).
  // Octave-reduce: multiply or divide by 2 until 1 ≤ n/d < 2.
  while (n < d) {
    n *= 2;
  }
  while (n >= 2 * d) {
    d *= 2;
  }

  // Simplify the fraction
  const g = gcd(Math.round(n), Math.round(d));
  return [Math.round(n / g), Math.round(d / g)];
}

/** Convert a ratio n/d to cents. */
function ratioToCents(n: number, d: number): number {
  return 1200 * Math.log2(n / d);
}

// Sharp and flat note name arrays (same ordering as latticeEngine)
const NOTE_NAMES_SHARP = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const NOTE_NAMES_FLAT  = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];

/** Circle-of-fifths position for a ratio n/d, summing across all prime factors.
 *  Each prime's exponent is weighted by its 12-equal fifths mapping.
 *  Positive → sharp side, negative → flat side. */
function fifthsPosition(n: number, d: number): number {
  const PRIMES = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31];
  let pos = 0;
  for (const p of PRIMES) {
    let exp = 0;
    while (n % p === 0) { n /= p; exp++; }
    while (d % p === 0) { d /= p; exp--; }
    if (exp !== 0) {
      const semi = Math.round(1200 * Math.log2(p) / 100) % 12;
      const f = (semi * 7) % 12;
      pos += exp * (f > 6 ? f - 12 : f);
    }
  }
  return pos;
}

/**
 * Map a ratio n/d to the nearest 12-TET pitch class name.
 * Sharp/flat determined by circle-of-fifths position across all prime factors.
 */
function ratioToNoteNameInternal(n: number, d: number): string {
  const cents = 1200 * Math.log2(n / d);
  const normCents = ((cents % 1200) + 1200) % 1200;
  const semitones = Math.round(normCents / 100);
  const pc = semitones % 12;
  const deviation = normCents - semitones * 100;
  const useFlat = fifthsPosition(n, d) < 0;
  const name = useFlat ? NOTE_NAMES_FLAT[pc] : NOTE_NAMES_SHARP[pc];
  if (Math.abs(deviation) > 5) {
    const sign = deviation > 0 ? "+" : "";
    return `${name} ${sign}${deviation.toFixed(3)}¢`;
  }
  return name;
}

/**
 * Project exponent coordinates to 3D using the projection vectors.
 */
function expsTo3D(
  exps: number[],
  primes: number[],
  projections: Record<number, [number, number, number]>,
): [number, number, number] {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < exps.length; i++) {
    const vec = projections[primes[i]];
    if (vec) {
      x += exps[i] * vec[0];
      y += exps[i] * vec[1];
      z += exps[i] * vec[2];
    }
  }
  return [x, y, z];
}

/**
 * Create a string key from exponent coordinates.
 * E.g. [1, -2] → "1,-2"
 */
function expsToKey(exps: number[]): string {
  return exps.join(",");
}

/**
 * Parse a key string back to exponent array.
 */
function keyToExps(key: string): number[] {
  return key.split(",").map(Number);
}

// ═══════════════════════════════════════════════════════════════
// Exported Utility Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Given a ratio n/d and an optional root pitch class (0–11, C=0),
 * return the closest note name with cent deviation if > 5¢.
 * Sharp/flat determined by circle-of-fifths position across all prime factors.
 */
export function ratioToNoteName(n: number, d: number, rootPc: number = 0): string {
  const cents = 1200 * Math.log2(n / d);
  const semitones = Math.round(cents / 100);
  const pc = ((rootPc + semitones) % 12 + 12) % 12;
  const deviation = cents - semitones * 100;
  const useFlat = fifthsPosition(n, d) < 0;
  const name = useFlat ? NOTE_NAMES_FLAT[pc] : NOTE_NAMES_SHARP[pc];
  if (Math.abs(deviation) > 5) {
    const sign = deviation > 0 ? "+" : "";
    return `${name} ${sign}${deviation.toFixed(3)}¢`;
  }
  return name;
}

/** Summary info about a generated Tonnetz. */
export function tonnetzInfo(data: TonnetzData): {
  nodeCount: number;
  triadCount: number;
  dimension: number;
  otonalCount: number;
  utonalCount: number;
} {
  const otonalCount = data.triads.filter(t => t.type === "otonal").length;
  const utonalCount = data.triads.filter(t => t.type === "utonal").length;
  return {
    nodeCount: data.nodes.length,
    triadCount: data.triads.length,
    dimension: data.primes.length,
    otonalCount,
    utonalCount,
  };
}

// ═══════════════════════════════════════════════════════════════
// PLR Naming
// ═══════════════════════════════════════════════════════════════

/**
 * Determine the PLR name for a transformation based on which node was dropped
 * from the otonal simplex.
 *
 * @param droppedIndex  Index within the otonal simplex's node list:
 *   - 0 = the root node (base grid position)
 *   - i (1..k) = node at base + unit vector along axis i-1
 * @param primes  The prime generators for this limit
 */
function plrName(droppedIndex: number, primes: number[]): { name: string; description: string } {
  if (primes.length === 2) {
    // 5-limit: classical P, L, R
    switch (droppedIndex) {
      case 0: return { name: "L", description: "root moves" };
      case 1: return { name: "R", description: "fifth (3) moves" };
      case 2: return { name: "P", description: "third (5) moves" };
      default: return { name: "?", description: "unknown" };
    }
  }
  // Higher limits: use descriptive names
  if (droppedIndex === 0) {
    return { name: "L", description: "root moves" };
  }
  const prime = primes[droppedIndex - 1];
  return { name: `P${subscriptDigits(prime)}`, description: `prime ${prime} moves` };
}

/** Convert a number to Unicode subscript digits for display. */
function subscriptDigits(n: number): string {
  const sub = "₀₁₂₃₄₅₆₇₈₉";
  return String(n).split("").map(ch => sub[parseInt(ch)] ?? ch).join("");
}

// ═══════════════════════════════════════════════════════════════
// Main Builder
// ═══════════════════════════════════════════════════════════════

/**
 * Build a complete Tonnetz lattice for the given configuration.
 *
 * Steps:
 * 1. Generate all grid nodes within bounds
 * 2. Compute octave-reduced JI ratio, 3D position, cents, note name for each
 * 3. Generate edges (nodes differing by ±1 along one axis)
 * 4. Find otonal simplices (node + unit step along ALL axes)
 * 5. Find utonal simplices (node - unit step along ALL axes)
 * 6. Find PLR links (simplex pairs sharing all but one node)
 */
export function buildTonnetz(config: TonnetzConfig): TonnetzData {
  const primes = LIMIT_PRIMES[config.limit];
  if (!primes) {
    throw new Error(`Unsupported limit: ${config.limit}. Use 5 or 7.`);
  }

  const dim = primes.length;

  // ─── Step 1: Generate all grid nodes within bounds ───

  const nodeMap = new Map<string, TonnetzNode>();
  const nodes: TonnetzNode[] = [];

  // Get bounds as arrays aligned with primes
  const mins = primes.map(p => config.bounds[p]?.[0] ?? DEFAULT_TONNETZ_BOUNDS[p]?.[0] ?? -2);
  const maxs = primes.map(p => config.bounds[p]?.[1] ?? DEFAULT_TONNETZ_BOUNDS[p]?.[1] ?? 2);

  // Recursively enumerate all grid points within bounds
  function enumerate(axis: number, current: number[]): void {
    if (axis === dim) {
      const exps = [...current];
      const key = expsToKey(exps);
      const [n, d] = expsToRatio(exps, primes);
      const pos3d = expsTo3D(exps, primes, config.projections);
      const cents = ratioToCents(n, d);
      const noteName = ratioToNoteNameInternal(n, d);
      const node: TonnetzNode = {
        key,
        ratioKey: `${n}/${d}`,
        n,
        d,
        exps,
        pos3d,
        cents,
        noteName,
      };
      nodeMap.set(key, node);
      nodes.push(node);
      return;
    }
    for (let v = mins[axis]; v <= maxs[axis]; v++) {
      current.push(v);
      enumerate(axis + 1, current);
      current.pop();
    }
  }

  enumerate(0, []);

  // ─── Step 2: Generate edges ───

  const edges: TonnetzEdge[] = [];
  const edgeSet = new Set<string>(); // avoid duplicates

  for (const node of nodes) {
    for (let axis = 0; axis < dim; axis++) {
      // Forward edge: +1 along this axis
      const neighborExps = [...node.exps];
      neighborExps[axis] += 1;
      const neighborKey = expsToKey(neighborExps);
      if (nodeMap.has(neighborKey)) {
        const edgeId = `${node.key}|${neighborKey}`;
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          edges.push({
            from: node.key,
            to: neighborKey,
            prime: primes[axis],
          });
        }
      }
    }
  }

  // ─── Step 3: Find otonal simplices ───
  // An otonal simplex at grid position I consists of k+1 nodes:
  //   {I, I+e₁, I+e₂, ..., I+eₖ}
  // where eᵢ is the unit vector along axis i.

  const triads: TonnetzTriad[] = [];
  const triadMap = new Map<string, TonnetzTriad>();

  for (const node of nodes) {
    const simplexKeys = [node.key];
    let valid = true;

    for (let axis = 0; axis < dim; axis++) {
      const stepped = [...node.exps];
      stepped[axis] += 1;
      const steppedKey = expsToKey(stepped);
      if (!nodeMap.has(steppedKey)) {
        valid = false;
        break;
      }
      simplexKeys.push(steppedKey);
    }

    if (valid) {
      const triadKey = `o:${node.key}`;
      const center = computeCentroid(simplexKeys, nodeMap);
      const triad: TonnetzTriad = {
        key: triadKey,
        type: "otonal",
        nodeKeys: simplexKeys,
        center,
      };
      triads.push(triad);
      triadMap.set(triadKey, triad);
    }
  }

  // ─── Step 4: Find utonal simplices ───
  // A utonal simplex at grid position I consists of k+1 nodes:
  //   {I, I-e₁, I-e₂, ..., I-eₖ}

  for (const node of nodes) {
    const simplexKeys = [node.key];
    let valid = true;

    for (let axis = 0; axis < dim; axis++) {
      const stepped = [...node.exps];
      stepped[axis] -= 1;
      const steppedKey = expsToKey(stepped);
      if (!nodeMap.has(steppedKey)) {
        valid = false;
        break;
      }
      simplexKeys.push(steppedKey);
    }

    if (valid) {
      const triadKey = `u:${node.key}`;
      const center = computeCentroid(simplexKeys, nodeMap);
      const triad: TonnetzTriad = {
        key: triadKey,
        type: "utonal",
        nodeKeys: simplexKeys,
        center,
      };
      triads.push(triad);
      triadMap.set(triadKey, triad);
    }
  }

  // ─── Step 5: Find PLR links ───
  // Two simplices (one otonal, one utonal) form a PLR pair if they share
  // exactly dim nodes (out of dim+1). The unshared nodes define the transform.

  const plrLinks: PLRLink[] = [];
  const plrByTriad = new Map<string, PLRLink[]>();

  // Build a lookup from node-set (sorted, minus one) to triads
  // For efficiency: for each triad, generate all dim+1 "faces" (subsets missing one node)
  const faceToTriads = new Map<string, TonnetzTriad[]>();

  for (const triad of triads) {
    for (let drop = 0; drop < triad.nodeKeys.length; drop++) {
      const face = triad.nodeKeys
        .filter((_, i) => i !== drop)
        .sort()
        .join("|");
      let list = faceToTriads.get(face);
      if (!list) {
        list = [];
        faceToTriads.set(face, list);
      }
      list.push(triad);
    }
  }

  // For each face shared by exactly one otonal and one utonal simplex, create a PLR link
  const plrSet = new Set<string>(); // avoid duplicate links

  for (const [_face, sharing] of faceToTriads) {
    if (sharing.length !== 2) continue;

    const [a, b] = sharing;
    // Only link otonal ↔ utonal
    if (a.type === b.type) continue;

    const otonal = a.type === "otonal" ? a : b;
    const utonal = a.type === "utonal" ? a : b;

    const linkId = `${otonal.key}|${utonal.key}`;
    if (plrSet.has(linkId)) continue;
    plrSet.add(linkId);

    // Find the shared and unshared nodes
    const otonalSet = new Set(otonal.nodeKeys);
    const utonalSet = new Set(utonal.nodeKeys);

    const shared = otonal.nodeKeys.filter(k => utonalSet.has(k));
    const movedFrom = otonal.nodeKeys.find(k => !utonalSet.has(k))!;
    const movedTo = utonal.nodeKeys.find(k => !otonalSet.has(k))!;

    // Determine which index in the otonal simplex was dropped
    const droppedIndex = otonal.nodeKeys.indexOf(movedFrom);
    const { name, description } = plrName(droppedIndex, primes);

    const link: PLRLink = {
      name,
      description,
      from: otonal.key,
      to: utonal.key,
      sharedNodes: shared,
      movedFrom,
      movedTo,
    };
    plrLinks.push(link);

    // Also add the reverse direction
    const reverseLink: PLRLink = {
      name,
      description,
      from: utonal.key,
      to: otonal.key,
      sharedNodes: shared,
      movedFrom: movedTo,
      movedTo: movedFrom,
    };
    plrLinks.push(reverseLink);

    // Index by triad
    if (!plrByTriad.has(otonal.key)) plrByTriad.set(otonal.key, []);
    plrByTriad.get(otonal.key)!.push(link);

    if (!plrByTriad.has(utonal.key)) plrByTriad.set(utonal.key, []);
    plrByTriad.get(utonal.key)!.push(reverseLink);
  }

  return {
    nodes,
    nodeMap,
    edges,
    triads,
    plrLinks,
    plrByTriad,
    primes,
  };
}

// ═══════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Compute the centroid (average position) of a set of nodes.
 */
function computeCentroid(
  nodeKeys: string[],
  nodeMap: Map<string, TonnetzNode>,
): [number, number, number] {
  let x = 0, y = 0, z = 0;
  for (const key of nodeKeys) {
    const node = nodeMap.get(key)!;
    x += node.pos3d[0];
    y += node.pos3d[1];
    z += node.pos3d[2];
  }
  const count = nodeKeys.length;
  return [x / count, y / count, z / count];
}

// ═══════════════════════════════════════════════════════════════
// EDO Tonnetz — Equal Division of the Octave Tonnetz
// ═══════════════════════════════════════════════════════════════

/**
 * Configuration for an EDO-based Tonnetz.
 */
export interface EdoTonnetzConfig {
  edo: number;
  /** Number of EDO steps for the "fifth" generator (X axis). 12-EDO: 7, 31-EDO: 18 */
  fifth: number;
  /** Number of EDO steps for the "major third" generator (Y axis). 12-EDO: 4, 31-EDO: 10 */
  majorThird: number;
  /** Grid extent: columns (fifths axis). Range [-cols, cols]. */
  cols: number;
  /** Grid extent: rows (thirds axis). Range [-rows, rows]. */
  rows: number;
}

/**
 * An EDO Tonnetz node — represents a grid position mapped to a pitch class.
 */
export interface EdoTonnetzNode {
  key: string;           // grid coords "a,b"
  pc: number;            // pitch class (0 .. edo-1)
  gridA: number;         // fifths axis coordinate
  gridB: number;         // thirds axis coordinate
  pos2d: [number, number]; // 2D position for rendering
  noteName: string;
  cents: number;         // cents value of this pitch class
}

export interface EdoTonnetzEdge {
  from: string;
  to: string;
  type: "fifth" | "majorThird" | "minorThird";
}

export interface EdoTonnetzTriad {
  key: string;
  type: "major" | "minor";
  nodeKeys: string[];
  center: [number, number];
  rootPc: number;
}

export interface EdoTonnetzPLR {
  name: string;
  description: string;
  from: string;
  to: string;
  sharedNodes: string[];
}

export interface EdoTonnetzData {
  nodes: EdoTonnetzNode[];
  nodeMap: Map<string, EdoTonnetzNode>;
  edges: EdoTonnetzEdge[];
  triads: EdoTonnetzTriad[];
  plrLinks: EdoTonnetzPLR[];
  plrByTriad: Map<string, EdoTonnetzPLR[]>;
  config: EdoTonnetzConfig;
}

// ── Note names ──────────────────────────────────────────────────

const NOTE_NAMES_12: string[] = [
  "C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B",
];

/**
 * 31-EDO note names using double-sharp (𝄪) / double-flat (𝄫) notation.
 * Sharp (♯) = +2 steps, double-sharp (𝄪) = +4, flat (♭) = −2, double-flat (𝄫) = −4.
 * Between each pair of naturals (5 steps): N, N+1𝄫, N♯, N+1♭, N𝄪, N+1
 * Index = step number (0–30).
 */
const NOTE_NAMES_31: string[] = [
  // C..D (5 steps)
  "C",   "D𝄫",  "C♯",  "D♭",  "C𝄪",
  // D..E (5 steps)
  "D",   "E𝄫",  "D♯",  "E♭",  "D𝄪",
  // E..F (3 steps)
  "E",   "F♭",  "E♯",
  // F..G (5 steps)
  "F",   "G𝄫",  "F♯",  "G♭",  "F𝄪",
  // G..A (5 steps)
  "G",   "A𝄫",  "G♯",  "A♭",  "G𝄪",
  // A..B (5 steps)
  "A",   "B𝄫",  "A♯",  "B♭",  "A𝄪",
  // B..C (3 steps)
  "B",   "C♭",  "B♯",
];

/**
 * 53-EDO note names using ups-and-downs notation.
 * ♯/♭ = ±5 steps (apotome, 7 fifths), ^/v = ±1 step (syntonic comma).
 * Whole-tone gaps (9 steps): C ^C ^^C vD♭ D♭ | C♯ ^C♯ vvD vD D
 * Semitone gaps (4 steps): E ^E ^^E vF F
 * Index = step number (0–52).
 */
const NOTE_NAMES_53: string[] = [
  // C..D (9 steps)
  "C", "^C", "^^C", "vD♭", "D♭", "C♯", "^C♯", "vvD", "vD",
  // D..E (9 steps)
  "D", "^D", "^^D", "vE♭", "E♭", "D♯", "^D♯", "vvE", "vE",
  // E..F (4 steps)
  "E", "^E", "^^E", "vF",
  // F..G (9 steps)
  "F", "^F", "^^F", "vG♭", "G♭", "F♯", "^F♯", "vvG", "vG",
  // G..A (9 steps)
  "G", "^G", "^^G", "vA♭", "A♭", "G♯", "^G♯", "vvA", "vA",
  // A..B (9 steps)
  "A", "^A", "^^A", "vB♭", "B♭", "A♯", "^A♯", "vvB", "vB",
  // B..C (4 steps)
  "B", "^B", "^^B", "vC",
];

function edoNoteName(pc: number, edo: number, rootPc: number = 0): string {
  const shifted = ((pc - rootPc) % edo + edo) % edo;
  if (edo === 12) {
    return NOTE_NAMES_12[(rootPc + shifted) % 12];
  }
  if (edo === 31) {
    return NOTE_NAMES_31[(rootPc + shifted) % 31];
  }
  if (edo === 53) {
    return NOTE_NAMES_53[(rootPc + shifted) % 53];
  }
  // Generic fallback: show step number
  const actualPc = (rootPc + shifted) % edo;
  return `${actualPc}`;
}

export function edoNoteNameByPc(pc: number, edo: number): string {
  if (edo === 12) return NOTE_NAMES_12[pc % 12];
  if (edo === 31) return NOTE_NAMES_31[pc % 31];
  if (edo === 53) return NOTE_NAMES_53[pc % 53];
  return `${pc}`;
}

// ── EDO Tonnetz presets ─────────────────────────────────────────

export const EDO_TONNETZ_PRESETS: Record<string, EdoTonnetzConfig> = {
  "12-EDO": {
    edo: 12,
    fifth: 7,
    majorThird: 4,
    cols: 6,
    rows: 4,
  },
  "12-EDO (small)": {
    edo: 12,
    fifth: 7,
    majorThird: 4,
    cols: 4,
    rows: 3,
  },
  "31-EDO": {
    edo: 31,
    fifth: 18,
    majorThird: 10,
    cols: 8,
    rows: 5,
  },
  "53-EDO": {
    edo: 53,
    fifth: 31,
    majorThird: 17,
    cols: 10,
    rows: 5,
  },
  "53-EDO (small)": {
    edo: 53,
    fifth: 31,
    majorThird: 17,
    cols: 6,
    rows: 3,
  },
};

/**
 * Build a complete EDO Tonnetz lattice.
 *
 * The grid is a 2D triangular tiling where:
 * - X axis (columns) = fifths generator
 * - Y axis (rows) = major thirds generator
 * - Diagonal = minor thirds (fifth - major third)
 *
 * Upward triangles = major triads, downward triangles = minor triads.
 * PLR transformations connect adjacent major ↔ minor triads.
 */
export function buildEdoTonnetz(config: EdoTonnetzConfig): EdoTonnetzData {
  const { edo, fifth, majorThird, cols, rows } = config;
  const minorThird = ((fifth - majorThird) % edo + edo) % edo;

  // ─── Step 1: Generate grid nodes ───
  const nodeMap = new Map<string, EdoTonnetzNode>();
  const nodes: EdoTonnetzNode[] = [];

  // Equilateral triangle layout: fifths horizontal, thirds at 60°
  const xSpacing = 3;
  const ySpacing = 2.598; // √3 * 1.5

  for (let b = -rows; b <= rows; b++) {
    for (let a = -cols; a <= cols; a++) {
      const pc = (((a * fifth + b * majorThird) % edo) + edo) % edo;
      const key = `${a},${b}`;
      const x = a * xSpacing + b * (xSpacing / 2);
      const y = b * ySpacing;
      const cents = (pc / edo) * 1200;
      const node: EdoTonnetzNode = {
        key,
        pc,
        gridA: a,
        gridB: b,
        pos2d: [x, y],
        noteName: edoNoteName(pc, edo),
        cents,
      };
      nodeMap.set(key, node);
      nodes.push(node);
    }
  }

  // ─── Step 2: Generate edges ───
  const edges: EdoTonnetzEdge[] = [];
  const edgeSet = new Set<string>();

  for (const node of nodes) {
    const { gridA: a, gridB: b } = node;
    // Right neighbor (fifth)
    const rightKey = `${a + 1},${b}`;
    if (nodeMap.has(rightKey) && !edgeSet.has(`${rightKey}|${node.key}`)) {
      edgeSet.add(`${node.key}|${rightKey}`);
      edges.push({ from: node.key, to: rightKey, type: "fifth" });
    }
    // Up neighbor (major third)
    const upKey = `${a},${b + 1}`;
    if (nodeMap.has(upKey) && !edgeSet.has(`${upKey}|${node.key}`)) {
      edgeSet.add(`${node.key}|${upKey}`);
      edges.push({ from: node.key, to: upKey, type: "majorThird" });
    }
    // Diagonal neighbor (minor third: right+down = (a+1, b-1) from perspective of up node)
    // Actually the diagonal is (a+1, b) to (a, b+1) — but that's already covered.
    // The third edge of each triangle connects (a+1, b) to (a, b+1):
    // from node (a,b+1) perspective it's the node at (a+1, b) — going down-right
    const diagKey = `${a + 1},${b - 1}`;
    if (nodeMap.has(diagKey) && !edgeSet.has(`${diagKey}|${node.key}`)) {
      edgeSet.add(`${node.key}|${diagKey}`);
      edges.push({ from: node.key, to: diagKey, type: "minorThird" });
    }
  }

  // ─── Step 3: Find triads ───
  const triads: EdoTonnetzTriad[] = [];
  const triadMap = new Map<string, EdoTonnetzTriad>();

  for (const node of nodes) {
    const { gridA: a, gridB: b } = node;

    // Upward triangle (major): (a,b), (a+1,b), (a,b+1)
    // Pitches: root, root+fifth, root+majorThird → major triad
    const rightKey = `${a + 1},${b}`;
    const upKey = `${a},${b + 1}`;
    if (nodeMap.has(rightKey) && nodeMap.has(upKey)) {
      const triadKey = `M:${a},${b}`;
      const right = nodeMap.get(rightKey)!;
      const up = nodeMap.get(upKey)!;
      const cx = (node.pos2d[0] + right.pos2d[0] + up.pos2d[0]) / 3;
      const cy = (node.pos2d[1] + right.pos2d[1] + up.pos2d[1]) / 3;
      const triad: EdoTonnetzTriad = {
        key: triadKey,
        type: "major",
        nodeKeys: [node.key, rightKey, upKey],
        center: [cx, cy],
        rootPc: node.pc,
      };
      triads.push(triad);
      triadMap.set(triadKey, triad);
    }

    // Downward triangle (minor): (a+1,b), (a,b+1), (a+1,b+1)
    // The root of this minor triad is at (a,b+1): pitch p+majorThird
    // From root: +minorThird = p+majorThird+minorThird = p+fifth → (a+1,b)
    // From root: +fifth = p+majorThird+fifth → (a+1,b+1)
    const diagKey = `${a + 1},${b + 1}`;
    if (nodeMap.has(rightKey) && nodeMap.has(upKey) && nodeMap.has(diagKey)) {
      const triadKey = `m:${a},${b}`;
      const right = nodeMap.get(rightKey)!;
      const up = nodeMap.get(upKey)!;
      const diag = nodeMap.get(diagKey)!;
      const cx = (right.pos2d[0] + up.pos2d[0] + diag.pos2d[0]) / 3;
      const cy = (right.pos2d[1] + up.pos2d[1] + diag.pos2d[1]) / 3;
      const triad: EdoTonnetzTriad = {
        key: triadKey,
        type: "minor",
        nodeKeys: [rightKey, upKey, diagKey],
        center: [cx, cy],
        rootPc: up.pc,  // the "lowest" note in the triangle acts as minor root
      };
      triads.push(triad);
      triadMap.set(triadKey, triad);
    }
  }

  // ─── Step 4: Find PLR links ───
  // P (Parallel): major ↔ minor sharing root and fifth (2 nodes), third moves
  // R (Relative): major ↔ minor sharing third and fifth, root moves
  // L (Leading tone): major ↔ minor sharing root and third, fifth moves

  const plrLinks: EdoTonnetzPLR[] = [];
  const plrByTriad = new Map<string, EdoTonnetzPLR[]>();

  function addPLR(name: string, desc: string, from: string, to: string, shared: string[]) {
    const link: EdoTonnetzPLR = { name, description: desc, from, to, sharedNodes: shared };
    plrLinks.push(link);
    if (!plrByTriad.has(from)) plrByTriad.set(from, []);
    plrByTriad.get(from)!.push(link);
  }

  for (const node of nodes) {
    const { gridA: a, gridB: b } = node;
    const majKey = `M:${a},${b}`;
    if (!triadMap.has(majKey)) continue;

    // L: Major at (a,b) ↔ Minor at (a,b) — they share (a+1,b) and (a,b+1), root moves (leading tone)
    const minLKey = `m:${a},${b}`;
    if (triadMap.has(minLKey)) {
      const shared = [`${a + 1},${b}`, `${a},${b + 1}`];
      addPLR("L", "leading tone", majKey, minLKey, shared);
      addPLR("L", "leading tone", minLKey, majKey, shared);
    }

    // P: Major at (a,b) ↔ Minor at (a,b-1) — they share (a,b) and (a+1,b), third moves (parallel)
    const minPKey = `m:${a},${b - 1}`;
    if (triadMap.has(minPKey)) {
      const shared = [`${a},${b}`, `${a + 1},${b}`];
      addPLR("P", "parallel", majKey, minPKey, shared);
      addPLR("P", "parallel", minPKey, majKey, shared);
    }

    // R: Major at (a,b) ↔ Minor at (a-1,b) — they share (a,b) and (a,b+1), fifth moves (relative)
    const minRKey = `m:${a - 1},${b}`;
    if (triadMap.has(minRKey)) {
      const shared = [`${a},${b}`, `${a},${b + 1}`];
      addPLR("R", "relative", majKey, minRKey, shared);
      addPLR("R", "relative", minRKey, majKey, shared);
    }
  }

  return {
    nodes,
    nodeMap,
    edges,
    triads,
    plrLinks,
    plrByTriad,
    config,
  };
}

/** Summary info about an EDO Tonnetz. */
export function edoTonnetzInfo(data: EdoTonnetzData): {
  nodeCount: number;
  triadCount: number;
  majorCount: number;
  minorCount: number;
  uniquePcs: number;
} {
  const majorCount = data.triads.filter(t => t.type === "major").length;
  const minorCount = data.triads.filter(t => t.type === "minor").length;
  const pcs = new Set(data.nodes.map(n => n.pc));
  return {
    nodeCount: data.nodes.length,
    triadCount: data.triads.length,
    majorCount,
    minorCount,
    uniquePcs: pcs.size,
  };
}

/** Edge type colors for EDO tonnetz. */
export const EDO_TONNETZ_EDGE_COLORS: Record<string, string> = {
  fifth: "#e87010",
  majorThird: "#22cc44",
  minorThird: "#5599ff",
};

// ═══════════════════════════════════════════════════════════════
// Generalized Chord Moves (N-note parsimonious voice leading)
// ═══════════════════════════════════════════════════════════════

/**
 * A single voice move: swap one note in the chord for a grid neighbor.
 */
export interface ChordMove {
  /** Human label, e.g. "C → D" */
  label: string;
  /** Interval direction, e.g. "+5th", "-M3" */
  direction: string;
  /** The node key being removed */
  fromKey: string;
  /** The node key being added */
  toKey: string;
  /** The complete resulting chord (all node keys) */
  resultKeys: string[];
}

/** 6 neighbor directions on the triangular EDO grid: (da, db, label). */
const GRID_NEIGHBORS: [number, number, string][] = [
  [+1,  0, "+5th"],
  [-1,  0, "-5th"],
  [ 0, +1, "+M3"],
  [ 0, -1, "-M3"],
  [+1, -1, "+m3"],
  [-1, +1, "-m3"],
];

/**
 * Find all single-voice moves for an arbitrary N-note chord on the EDO Tonnetz.
 *
 * For each note in the chord, checks all 6 triangular-grid neighbors.
 * A move is valid if the neighbor exists on the grid and is not already in the chord.
 */
export function findEdoChordMoves(
  selectedKeys: string[],
  data: EdoTonnetzData,
): ChordMove[] {
  const moves: ChordMove[] = [];
  const selectedSet = new Set(selectedKeys);
  const { nodeMap, config } = data;
  const edo = config.edo;

  for (const key of selectedKeys) {
    const node = nodeMap.get(key);
    if (!node) continue;
    const { gridA: a, gridB: b } = node;

    for (const [da, db, fwdLabel] of GRID_NEIGHBORS) {
      const neighborKey = `${a + da},${b + db}`;
      if (!nodeMap.has(neighborKey) || selectedSet.has(neighborKey)) continue;

      const neighbor = nodeMap.get(neighborKey)!;
      const fromName = edoNoteNameByPc(node.pc, edo);
      const toName = edoNoteNameByPc(neighbor.pc, edo);

      const resultKeys = selectedKeys.map(k => k === key ? neighborKey : k);

      moves.push({
        label: `${fromName}→${toName}`,
        direction: fwdLabel,
        fromKey: key,
        toKey: neighborKey,
        resultKeys,
      });
    }
  }

  return moves;
}

/**
 * Find all single-voice moves for an arbitrary N-note chord on the JI Tonnetz.
 *
 * For each note, checks ±1 along each prime axis.
 */
export function findJiChordMoves(
  selectedKeys: string[],
  data: TonnetzData,
  rootPc: number,
): ChordMove[] {
  const moves: ChordMove[] = [];
  const selectedSet = new Set(selectedKeys);
  const { nodeMap, primes } = data;

  for (const key of selectedKeys) {
    const node = nodeMap.get(key);
    if (!node) continue;
    const exps = node.exps;

    for (let axis = 0; axis < primes.length; axis++) {
      for (const delta of [+1, -1]) {
        const neighborExps = [...exps];
        neighborExps[axis] += delta;
        const neighborKey = neighborExps.join(",");

        if (!nodeMap.has(neighborKey) || selectedSet.has(neighborKey)) continue;

        const neighbor = nodeMap.get(neighborKey)!;
        const fromName = ratioToNoteName(node.n, node.d, rootPc);
        const toName = ratioToNoteName(neighbor.n, neighbor.d, rootPc);
        const sign = delta > 0 ? "+" : "-";
        const direction = `${sign}×${primes[axis]}`;

        const resultKeys = selectedKeys.map(k => k === key ? neighborKey : k);

        moves.push({
          label: `${fromName}→${toName}`,
          direction,
          fromKey: key,
          toKey: neighborKey,
          resultKeys,
        });
      }
    }
  }

  return moves;
}

// ── Parallel chord moves (all voices shift together) ──────────────────

export interface ParallelChordMove {
  /** Direction label, e.g. "+5th", "+×3" */
  direction: string;
  /** Per-voice from→to pairs */
  voices: { fromKey: string; toKey: string; label: string }[];
  /** The complete resulting chord (all node keys) */
  resultKeys: string[];
}

/**
 * Find parallel moves for an N-note chord on the EDO Tonnetz.
 * All voices shift by the same (da, db) simultaneously.
 */
export function findEdoParallelMoves(
  selectedKeys: string[],
  data: EdoTonnetzData,
): ParallelChordMove[] {
  if (selectedKeys.length < 2) return [];
  const moves: ParallelChordMove[] = [];
  const { nodeMap, config } = data;
  const edo = config.edo;

  for (const [da, db, dirLabel] of GRID_NEIGHBORS) {
    const voices: ParallelChordMove["voices"] = [];
    const resultKeys: string[] = [];
    let valid = true;

    for (const key of selectedKeys) {
      const node = nodeMap.get(key);
      if (!node) { valid = false; break; }
      const neighborKey = `${node.gridA + da},${node.gridB + db}`;
      const neighbor = nodeMap.get(neighborKey);
      if (!neighbor) { valid = false; break; }
      resultKeys.push(neighborKey);
      voices.push({
        fromKey: key,
        toKey: neighborKey,
        label: `${edoNoteNameByPc(node.pc, edo)}→${edoNoteNameByPc(neighbor.pc, edo)}`,
      });
    }

    if (!valid) continue;
    if (new Set(resultKeys).size !== resultKeys.length) continue;

    moves.push({ direction: dirLabel, voices, resultKeys });
  }

  return moves;
}

/**
 * Find parallel moves for an N-note chord on the JI Tonnetz.
 * All voices shift by ±1 on the same prime axis simultaneously.
 */
export function findJiParallelMoves(
  selectedKeys: string[],
  data: TonnetzData,
  rootPc: number,
): ParallelChordMove[] {
  if (selectedKeys.length < 2) return [];
  const moves: ParallelChordMove[] = [];
  const { nodeMap, primes } = data;

  for (let axis = 0; axis < primes.length; axis++) {
    for (const delta of [+1, -1]) {
      const voices: ParallelChordMove["voices"] = [];
      const resultKeys: string[] = [];
      let valid = true;

      for (const key of selectedKeys) {
        const node = nodeMap.get(key);
        if (!node) { valid = false; break; }
        const neighborExps = [...node.exps];
        neighborExps[axis] += delta;
        const neighborKey = neighborExps.join(",");
        const neighbor = nodeMap.get(neighborKey);
        if (!neighbor) { valid = false; break; }
        resultKeys.push(neighborKey);
        const fromName = ratioToNoteName(node.n, node.d, rootPc);
        const toName = ratioToNoteName(neighbor.n, neighbor.d, rootPc);
        voices.push({ fromKey: key, toKey: neighborKey, label: `${fromName}→${toName}` });
      }

      if (!valid) continue;
      if (new Set(resultKeys).size !== resultKeys.length) continue;

      const sign = delta > 0 ? "+" : "-";
      moves.push({ direction: `${sign}×${primes[axis]}`, voices, resultKeys });
    }
  }

  return moves;
}
