// Pure data and math for the Harmonic Experience Graph.
// No React. All exports are static data or pure functions.

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface HNode {
  n: number;
  d: number;
  a3: number;
  a5: number;
  a7: number;
  a11: number;
  a13: number;
  isComma?: boolean;
}

export interface EdgeDef {
  from: string;
  to: string;
  type: "generator" | "otonal" | "utonal" | "comma" | "octave";
  prime?: number;
}

// ═══════════════════════════════════════════════════════════════
// 3D Projection: prime-exponent coords → 3D position
// 3→X, 5→Y, 7→Z, 11 & 13 projected into the 3D space
// ═══════════════════════════════════════════════════════════════

export const PROJ3D: Record<number, [number, number, number]> = {
  3:  [3.0, 0, 0],
  5:  [0, 3.0, 0],
  7:  [0, 0, 3.0],
  11: [1.2, 1.2, 1.5],
  13: [-1.4, 0.8, 0.5],
};

export const PRIME_COLORS: Record<number, string> = {
  3: "#e87010", 5: "#22cc44", 7: "#5599ff", 11: "#ddbb00", 13: "#cc44cc",
};

// ═══════════════════════════════════════════════════════════════
// Prime factorization (ignoring powers of 2)
// ═══════════════════════════════════════════════════════════════

function factorize(n: number, d: number): [number, number, number, number, number] {
  const primes = [3, 5, 7, 11, 13];
  const r: number[] = [0, 0, 0, 0, 0];
  for (let i = 0; i < 5; i++) {
    const p = primes[i];
    while (n % p === 0) { n /= p; r[i]++; }
    while (d % p === 0) { d /= p; r[i]--; }
  }
  return r as [number, number, number, number, number];
}

function mk(n: number, d: number, comma = false): HNode {
  const [a3, a5, a7, a11, a13] = factorize(n, d);
  return { n, d, a3, a5, a7, a11, a13, isComma: comma || undefined };
}

// ═══════════════════════════════════════════════════════════════
// All 45 nodes
// ═══════════════════════════════════════════════════════════════

export const NODES: HNode[] = [
  // ── Main ratios (41) ──
  mk(1, 1),
  mk(256, 243), mk(16, 15), mk(15, 14), mk(14, 13), mk(13, 12),
  mk(12, 11), mk(11, 10), mk(10, 9), mk(9, 8),
  mk(8, 7), mk(7, 6), mk(32, 27), mk(6, 5), mk(11, 9),
  mk(5, 4), mk(81, 64), mk(9, 7), mk(14, 11), mk(4, 3),
  mk(11, 8), mk(7, 5), mk(10, 7), mk(729, 512), mk(3, 2),
  mk(128, 81), mk(14, 9), mk(11, 7), mk(8, 5), mk(5, 3),
  mk(18, 11), mk(12, 7), mk(7, 4), mk(27, 16), mk(16, 9),
  mk(9, 5), mk(20, 11), mk(11, 6), mk(15, 8), mk(243, 128),
  // ── Commas (4) ──
  mk(81, 80, true), mk(64, 63, true), mk(33, 32, true), mk(128, 125, true),
];

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

export function nodeKey(nd: HNode): string {
  return `${nd.n}/${nd.d}`;
}

// ═══════════════════════════════════════════════════════════════
// Interval names for every ratio
// ═══════════════════════════════════════════════════════════════

export const INTERVAL_NAMES: Record<string, string> = {
  // Identity & octave
  "1/1":     "Root",
  "2/1":     "Octave",
  // 3-limit (Pythagorean)
  "256/243": "Minor 2nd",
  "9/8":     "Major 2nd",
  "32/27":   "Minor 3rd",
  "81/64":   "Major 3rd",
  "4/3":     "Perfect 4th",
  "729/512": "Tritone",
  "3/2":     "Perfect 5th",
  "128/81":  "Minor 6th",
  "27/16":   "Major 6th",
  "16/9":    "Minor 7th",
  "243/128": "Major 7th",
  // 5-limit (Just intonation)
  "16/15":   "Minor 2nd",
  "10/9":    "Minor 2nd",
  "6/5":     "Minor 3rd",
  "5/4":     "Major 3rd",
  "45/32":   "Tritone",
  "8/5":     "Minor 6th",
  "5/3":     "Major 6th",
  "9/5":     "Minor 7th",
  "15/8":    "Major 7th",
  // 7-limit
  "15/14":   "Sept. minor 2nd",
  "8/7":     "Sept. major 2nd",
  "7/6":     "Sept. minor 3rd",
  "9/7":     "Sept. major 3rd",
  "7/5":     "Sept. tritone",
  "10/7":    "Sept. tritone",
  "14/9":    "Sept. minor 6th",
  "12/7":    "Sept. major 6th",
  "7/4":     "Harmonic 7th",
  // 11-limit
  "12/11":   "Undec. minor 2nd",
  "11/10":   "Undec. neutral 2nd",
  "11/9":    "Undec. neutral 3rd",
  "14/11":   "Undec. 3rd",
  "11/8":    "Undec. tritone",
  "11/7":    "Undec. 6th",
  "18/11":   "Undec. 6th",
  "20/11":   "Undec. 7th",
  "11/6":    "Undec. 7th",
  // 13-limit
  "14/13":   "13/14 (13-limit)",
  "13/12":   "13/12 (13-limit)",
  "13/10":   "Tridec. neutral 3rd",
  "13/9":    "Tridec. 4th",
  "13/8":    "Tridec. 6th",
  "13/7":    "Tridec. minor 7th",
  // Commas
  "81/80":   "Syntonic comma",
  "64/63":   "Septimal comma",
  "33/32":   "Undecimal comma",
  "128/125": "Diesis",
  "27/26":   "Tridec. comma",
};

export function intervalName(nd: HNode): string {
  const key = nodeKey(nd);
  if (INTERVAL_NAMES[key]) return INTERVAL_NAMES[key];
  // Fallback: ratio (N-limit)
  const limit = nd.a13 ? 13 : nd.a11 ? 11 : nd.a7 ? 7 : nd.a5 ? 5 : nd.a3 ? 3 : 2;
  return `${key} (${limit}-limit)`;
}

export function nodePos3D(nd: HNode): [number, number, number] {
  // Diesis 128/125 (a5=-3) would land at y=-9; keep it closer to the cluster
  if (nd.n === 128 && nd.d === 125) return [0, -4.5, 0];
  return [
    nd.a3 * PROJ3D[3][0] + nd.a5 * PROJ3D[5][0] + nd.a7 * PROJ3D[7][0]
      + nd.a11 * PROJ3D[11][0] + nd.a13 * PROJ3D[13][0],
    nd.a3 * PROJ3D[3][1] + nd.a5 * PROJ3D[5][1] + nd.a7 * PROJ3D[7][1]
      + nd.a11 * PROJ3D[11][1] + nd.a13 * PROJ3D[13][1],
    nd.a3 * PROJ3D[3][2] + nd.a5 * PROJ3D[5][2] + nd.a7 * PROJ3D[7][2]
      + nd.a11 * PROJ3D[11][2] + nd.a13 * PROJ3D[13][2],
  ];
}

export function ratioToCents(n: number, d: number): number {
  return 1200 * Math.log2(n / d);
}

const SUP: Record<string, string> = {
  "-": "\u207B", "0": "\u2070", "1": "\u00B9", "2": "\u00B2", "3": "\u00B3",
  "4": "\u2074", "5": "\u2075", "6": "\u2076", "7": "\u2077", "8": "\u2078", "9": "\u2079",
};
function toSup(n: number): string {
  return String(n).split("").map(c => SUP[c] ?? c).join("");
}

export function exponentLabel(nd: HNode): string {
  const p: string[] = [];
  if (nd.a3) p.push(`3${toSup(nd.a3)}`);
  if (nd.a5) p.push(`5${toSup(nd.a5)}`);
  if (nd.a7) p.push(`7${toSup(nd.a7)}`);
  if (nd.a11) p.push(`11${toSup(nd.a11)}`);
  if (nd.a13) p.push(`13${toSup(nd.a13)}`);
  return p.join("\u00B7") || "1\u2070";
}

// ═══════════════════════════════════════════════════════════════
// Pre-compute position map
// ═══════════════════════════════════════════════════════════════

export const POS_MAP = new Map<string, [number, number, number]>();
for (const nd of NODES) POS_MAP.set(nodeKey(nd), nodePos3D(nd));

// ═══════════════════════════════════════════════════════════════
// Edge computation: Generator (prime lattice step)
// ═══════════════════════════════════════════════════════════════

function computeGeneratorEdges(): EdgeDef[] {
  const primes = [3, 5, 7, 11, 13] as const;
  const fields = ["a3", "a5", "a7", "a11", "a13"] as const;
  const edges: EdgeDef[] = [];
  for (let i = 0; i < NODES.length; i++) {
    for (let j = i + 1; j < NODES.length; j++) {
      const a = NODES[i], b = NODES[j];
      let matchIdx = -1, valid = true;
      for (let k = 0; k < 5; k++) {
        const diff = b[fields[k]] - a[fields[k]];
        if (Math.abs(diff) === 1) {
          if (matchIdx !== -1) { valid = false; break; }
          matchIdx = k;
        } else if (diff !== 0) { valid = false; break; }
      }
      if (valid && matchIdx !== -1) {
        edges.push({ from: nodeKey(a), to: nodeKey(b), type: "generator", prime: primes[matchIdx] });
      }
    }
  }
  return edges;
}

// ═══════════════════════════════════════════════════════════════
// Edge computation: Comma
// ═══════════════════════════════════════════════════════════════

export const COMMA_ND: [number, number][] = [[81, 80], [64, 63], [33, 32], [128, 125]];

function computeCommaEdges(): EdgeDef[] {
  const edges: EdgeDef[] = [];
  for (let i = 0; i < NODES.length; i++) {
    for (let j = i + 1; j < NODES.length; j++) {
      const a = NODES[i], b = NODES[j];
      for (const [cn, cd] of COMMA_ND) {
        // Check a/b = cn/cd  OR  b/a = cn/cd  (exact rational arithmetic)
        if (a.n * b.d * cd === a.d * b.n * cn ||
            b.n * a.d * cd === b.d * a.n * cn) {
          edges.push({ from: nodeKey(a), to: nodeKey(b), type: "comma" });
          break;
        }
      }
    }
  }
  return edges;
}

// ═══════════════════════════════════════════════════════════════
// Edge computation: Otonal & Utonal (harmonic/subharmonic series)
// ═══════════════════════════════════════════════════════════════

function octaveReduce(r: number): number {
  while (r > 2) r /= 2;
  while (r < 1) r *= 2;
  return r;
}

function findNodeByValue(target: number): string | null {
  for (const nd of NODES) {
    if (Math.abs(nd.n / nd.d - target) < 1e-8) return nodeKey(nd);
  }
  return null;
}

function searchPatterns(patterns: number[][], type: "otonal" | "utonal"): EdgeDef[] {
  const seen = new Set<string>();
  const edges: EdgeDef[] = [];
  for (const intervals of patterns) {
    for (const root of NODES) {
      const rv = root.n / root.d;
      const members: string[] = [];
      let ok = true;
      for (const iv of intervals) {
        const key = findNodeByValue(octaveReduce(rv * iv));
        if (!key) { ok = false; break; }
        members.push(key);
      }
      if (ok && new Set(members).size === members.length) {
        for (let k = 0; k < members.length - 1; k++) {
          const [a, b] = [members[k], members[k + 1]].sort();
          const ek = `${a}|${b}`;
          if (!seen.has(ek)) { seen.add(ek); edges.push({ from: a, to: b, type }); }
        }
      }
    }
  }
  return edges;
}

// Otonal patterns: contiguous harmonic series segments
// 4:5:6 → ratios from root: 1, 5/4, 3/2
const OTONAL_INTERVALS = [
  [1, 5/4, 3/2],           // 4:5:6  (major triad)
  [1, 5/4, 3/2, 7/4],      // 4:5:6:7  (dom 7th)
  [1, 9/8, 5/4, 11/8],     // 8:9:10:11
  [1, 7/6, 4/3, 3/2],      // 6:7:8:9
  [1, 6/5, 7/5],            // 5:6:7
  [1, 4/3, 5/3, 2],         // 3:4:5:6
];

// Utonal patterns: subharmonic series, intervals from lowest note
// 1/4:1/5:1/6 → from lowest: 1, 6/5, 3/2
const UTONAL_INTERVALS = [
  [1, 6/5, 3/2],            // 1/4:1/5:1/6  (minor triad)
  [1, 7/6, 7/5, 7/4],       // 1/4:1/5:1/6:1/7
  [1, 8/7, 4/3, 8/5],       // 1/5:1/6:1/7:1/8
  [1, 9/8, 9/7, 3/2],       // 1/6:1/7:1/8:1/9
];

// ═══════════════════════════════════════════════════════════════
// Edge computation: Octave (r1/r2 = 2)
// ═══════════════════════════════════════════════════════════════

function computeOctaveEdges(): EdgeDef[] {
  const edges: EdgeDef[] = [];
  for (let i = 0; i < NODES.length; i++) {
    for (let j = i + 1; j < NODES.length; j++) {
      const a = NODES[i], b = NODES[j];
      // a/b = 2 → a.n * b.d = 2 * a.d * b.n
      // b/a = 2 → b.n * a.d = 2 * b.d * a.n
      if (a.n * b.d === 2 * a.d * b.n || b.n * a.d === 2 * b.d * a.n) {
        edges.push({ from: nodeKey(a), to: nodeKey(b), type: "octave" });
      }
    }
  }
  return edges;
}

// ═══════════════════════════════════════════════════════════════
// Pre-compute all edge sets (runs once at module load)
// ═══════════════════════════════════════════════════════════════

export const GENERATOR_EDGES = computeGeneratorEdges();
export const COMMA_EDGES = computeCommaEdges();
export const OTONAL_EDGES = searchPatterns(OTONAL_INTERVALS, "otonal");
export const UTONAL_EDGES = searchPatterns(UTONAL_INTERVALS, "utonal");
export const OCTAVE_EDGES = computeOctaveEdges();

// ═══════════════════════════════════════════════════════════════
// Harmonic Series: linear chain layout (NOT lattice)
// ═══════════════════════════════════════════════════════════════

/** Largest prime factor of n */
function largestPrimeFactor(n: number): number {
  let largest = 1;
  let v = n;
  for (const p of [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31]) {
    while (v % p === 0) { largest = p; v /= p; }
  }
  if (v > 1) largest = v; // remaining factor is prime
  return largest;
}

export interface HarmonicNode {
  harmonic: number;       // e.g. 7
  n: number;              // numerator (after octave reduction if enabled)
  d: number;              // denominator
  label: string;          // display label e.g. "7/4"
}

/** GCD for octave reduction */
function gcd(a: number, b: number): number {
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

/**
 * Build harmonic series nodes filtered by prime limit.
 * @param maxHarmonic  highest harmonic number to include (default 16)
 * @param limit        prime limit filter — only include harmonics whose prime factors ≤ limit (0 = no filter)
 * @param octaveReduce whether to octave-reduce to 1–2 range
 * @param subharmonic  if true, build subharmonic (utonal) series: 1/1, 1/2, 1/3, …
 */
export function buildHarmonicSeries(
  maxHarmonic: number = 16,
  limit: number = 0,
  octaveReduce: boolean = false,
  subharmonic: boolean = false,
): { nodes: HarmonicNode[]; edges: EdgeDef[] } {

  // 1) Collect qualifying harmonic numbers
  const harmonics: number[] = [];
  for (let h = 1; h <= maxHarmonic; h++) {
    if (limit > 0 && largestPrimeFactor(h) > limit) continue;
    harmonics.push(h);
  }

  // 2) Build nodes
  const nodes: HarmonicNode[] = [];
  if (octaveReduce) {
    // Deduplicate: reduce each ratio to [1, 2) range, keep unique ratios
    const seen = new Set<string>();
    for (const h of harmonics) {
      let num: number, den: number;
      if (subharmonic) {
        // Subharmonic: ratio is 1/h, octave-reduce by multiplying by 2
        num = 1; den = h;
        while (num / den < 1) num *= 2;
        while (num / den >= 2) den *= 2;
      } else {
        // Harmonic: ratio is h/1, octave-reduce by dividing by 2
        num = h; den = 1;
        while (num / den >= 2) den *= 2;
      }
      const g = gcd(num, den);
      num /= g; den /= g;
      const key = `${num}/${den}`;
      if (seen.has(key)) continue;
      seen.add(key);
      nodes.push({ harmonic: h, n: num, d: den, label: key });
    }
    // Sort by pitch (ratio value)
    nodes.sort((a, b) => (a.n / a.d) - (b.n / b.d));
  } else {
    for (const h of harmonics) {
      if (subharmonic) {
        nodes.push({ harmonic: h, n: 1, d: h, label: `1/${h}` });
      } else {
        nodes.push({ harmonic: h, n: h, d: 1, label: `${h}/1` });
      }
    }
  }

  // 3) Build chain edges (consecutive neighbors only)
  const edges: EdgeDef[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({
      from: nodes[i].label,
      to: nodes[i + 1].label,
      type: "generator", // reuse type for rendering
    });
  }

  return { nodes, edges };
}

/**
 * Deterministic linear positions for harmonic chain nodes.
 * Evenly spaced left-to-right along the X axis, centered at origin.
 */
export function harmonicChainPositions(
  nodes: HarmonicNode[],
  spacing: number = 1.2,
): Map<string, [number, number, number]> {
  const positions = new Map<string, [number, number, number]>();
  const totalWidth = (nodes.length - 1) * spacing;
  const startX = -totalWidth / 2;
  for (let i = 0; i < nodes.length; i++) {
    positions.set(nodes[i].label, [startX + i * spacing, 0, 0]);
  }
  return positions;
}

// ═══════════════════════════════════════════════════════════════
// Otonal / Utonal Stack Layout
// ═══════════════════════════════════════════════════════════════

export interface StackNode {
  harmonic: number;       // harmonic number in the series (e.g. 4, 5, 6, 7)
  n: number;              // octave-reduced numerator
  d: number;              // octave-reduced denominator
  label: string;          // display e.g. "5/4"
  harmonicLabel: string;  // e.g. "5" (the raw harmonic number)
  cents: number;          // cents from 1/1
  stackIndex: number;     // position within this stack (0 = bottom)
  stackId: number;        // which stack this belongs to
}

export interface StackEdge {
  from: string;  // key into position map
  to: string;
}

/**
 * Build a single otonal (harmonic series) stack.
 * base = starting harmonic number, count = how many harmonics.
 * e.g. base=4, count=4 → harmonics 4,5,6,7 → ratios 1/1, 5/4, 3/2, 7/4
 */
export function buildOtonalStack(
  base: number,
  count: number,
  stackId: number = 0,
): { nodes: StackNode[]; edges: StackEdge[] } {
  const nodes: StackNode[] = [];
  for (let i = 0; i < count; i++) {
    const h = base + i;
    // Ratio relative to base: h/base, then octave-reduce
    let num = h, den = base;
    const g = gcd(num, den);
    num /= g; den /= g;
    // Octave reduce to [1, 2)
    while (num / den >= 2) den *= 2;
    const g2 = gcd(num, den);
    num /= g2; den /= g2;
    const label = `${num}/${den}`;
    nodes.push({
      harmonic: h,
      n: num,
      d: den,
      label,
      harmonicLabel: `${h}`,
      cents: ratioToCents(num, den),
      stackIndex: i,
      stackId,
    });
  }
  // Edges: only consecutive neighbors
  const edges: StackEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({
      from: `${stackId}:${nodes[i].harmonicLabel}`,
      to: `${stackId}:${nodes[i + 1].harmonicLabel}`,
    });
  }
  return { nodes, edges };
}

/**
 * Build a single utonal (subharmonic series) stack.
 * base = starting subharmonic number, count = how many.
 * e.g. base=4, count=4 → subharmonics 1/4, 1/5, 1/6, 1/7
 * → octave-reduced from lowest: 1/1, 8/7, 4/3, 2/1 (ascending)
 */
export function buildUtonalStack(
  base: number,
  count: number,
  stackId: number = 0,
): { nodes: StackNode[]; edges: StackEdge[] } {
  const rawRatios: { h: number; ratio: number }[] = [];
  for (let i = 0; i < count; i++) {
    const h = base + i;
    rawRatios.push({ h, ratio: (base + count - 1) / h });
  }
  rawRatios.sort((a, b) => a.ratio - b.ratio);

  const nodes: StackNode[] = [];
  for (let i = 0; i < rawRatios.length; i++) {
    const { h } = rawRatios[i];
    let num = base + count - 1, den = h;
    const g = gcd(num, den);
    num /= g; den /= g;
    while (num / den >= 2) den *= 2;
    const g2 = gcd(num, den);
    num /= g2; den /= g2;
    while (num / den < 1) num *= 2;
    const g3 = gcd(num, den);
    num /= g3; den /= g3;
    const label = `${num}/${den}`;
    nodes.push({
      harmonic: h,
      n: num,
      d: den,
      label,
      harmonicLabel: `1/${h}`,
      cents: ratioToCents(num, den),
      stackIndex: i,
      stackId,
    });
  }
  const edges: StackEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({
      from: `${stackId}:${nodes[i].harmonicLabel}`,
      to: `${stackId}:${nodes[i + 1].harmonicLabel}`,
    });
  }
  return { nodes, edges };
}

/**
 * Build multiple stacks side by side.
 * e.g. bases=[4,5,6] with count=4 builds stacks 4:5:6:7, 5:6:7:8, 6:7:8:9
 */
export function buildMultipleStacks(
  bases: number[],
  count: number,
  utonal: boolean,
): { nodes: StackNode[]; edges: StackEdge[]; positions: Map<string, [number, number, number]> } {
  const allNodes: StackNode[] = [];
  const allEdges: StackEdge[] = [];
  const positions = new Map<string, [number, number, number]>();
  const stackSpacing = 2.5;
  const nodeSpacing = 1.4;
  const totalWidth = (bases.length - 1) * stackSpacing;
  const startX = -totalWidth / 2;

  for (let s = 0; s < bases.length; s++) {
    const { nodes, edges } = utonal
      ? buildUtonalStack(bases[s], count, s)
      : buildOtonalStack(bases[s], count, s);
    allNodes.push(...nodes);
    allEdges.push(...edges);
    const totalHeight = (nodes.length - 1) * nodeSpacing;
    const startY = -totalHeight / 2;
    for (const nd of nodes) {
      const key = `${s}:${nd.harmonicLabel}`;
      positions.set(key, [startX + s * stackSpacing, startY + nd.stackIndex * nodeSpacing, 0]);
    }
  }
  return { nodes: allNodes, edges: allEdges, positions };
}

// ═══════════════════════════════════════════════════════════════
// Comma Cluster Layout — each comma type gets its own cluster
// ═══════════════════════════════════════════════════════════════

export interface CommaClusterNode {
  node: HNode;
  key: string;        // original "n/d"
  posKey: string;     // cluster-prefixed "0:n/d"
  clusterId: number;
}

export interface CommaClusterLabel {
  pos: [number, number, number];
  name: string;       // "Syntonic"
  ratio: string;      // "81/80"
  cents: string;      // "22¢"
}

export interface CommaPair {
  lower: HNode;
  higher: HNode;
  lowerKey: string;
  higherKey: string;
  lowerName: string;
  higherName: string;
}

export interface CommaGroup {
  name: string;       // "Syntonic"
  ratio: string;      // "81/80"
  cents: string;      // "22¢"
  pairs: CommaPair[];
}

const COMMA_NAMES: Record<string, string> = {
  "81/80": "Syntonic", "64/63": "Septimal", "33/32": "Undecimal", "128/125": "Diesis",
};

export function buildCommaGroups(): CommaGroup[] {
  const groups: CommaGroup[] = [];

  for (const [cn, cd] of COMMA_ND) {
    const pairs: CommaPair[] = [];
    for (let i = 0; i < NODES.length; i++) {
      for (let j = i + 1; j < NODES.length; j++) {
        const a = NODES[i], b = NODES[j];
        if (a.isComma || b.isComma) continue;
        if (a.n * b.d * cd === a.d * b.n * cn) {
          pairs.push({ lower: b, higher: a, lowerKey: nodeKey(b), higherKey: nodeKey(a), lowerName: intervalName(b), higherName: intervalName(a) });
        } else if (b.n * a.d * cd === b.d * a.n * cn) {
          pairs.push({ lower: a, higher: b, lowerKey: nodeKey(a), higherKey: nodeKey(b), lowerName: intervalName(a), higherName: intervalName(b) });
        }
      }
    }
    if (pairs.length > 0) {
      pairs.sort((a, b) => (a.lower.n / a.lower.d) - (b.lower.n / b.lower.d));
      const commaKey = `${cn}/${cd}`;
      groups.push({
        name: COMMA_NAMES[commaKey] || commaKey,
        ratio: commaKey,
        cents: `${ratioToCents(cn, cd).toFixed(0)}¢`,
        pairs,
      });
    }
  }
  return groups;
}

export function buildCommaClusterData(): {
  nodes: CommaClusterNode[];
  edges: { from: string; to: string }[];
  positions: Map<string, [number, number, number]>;
  labels: CommaClusterLabel[];
} {
  const allNodes: CommaClusterNode[] = [];
  const allEdges: { from: string; to: string }[] = [];
  const positions = new Map<string, [number, number, number]>();
  const labels: CommaClusterLabel[] = [];

  // Gather valid clusters (comma types that have at least one pair)
  const validClusters: {
    cn: number; cd: number;
    pairs: [HNode, HNode][];
    commaNode: HNode;
  }[] = [];

  for (const [cn, cd] of COMMA_ND) {
    const commaNode = NODES.find(n => n.n === cn && n.d === cd && n.isComma);
    if (!commaNode) continue;

    const pairs: [HNode, HNode][] = [];
    for (let i = 0; i < NODES.length; i++) {
      for (let j = i + 1; j < NODES.length; j++) {
        const a = NODES[i], b = NODES[j];
        if (a.isComma || b.isComma) continue;
        if (a.n * b.d * cd === a.d * b.n * cn) {
          // a/b = cn/cd → a is higher pitch
          pairs.push([b, a]);
        } else if (b.n * a.d * cd === b.d * a.n * cn) {
          // b/a = cn/cd → b is higher pitch
          pairs.push([a, b]);
        }
      }
    }

    if (pairs.length > 0) {
      validClusters.push({ cn, cd, pairs, commaNode });
    }
  }

  const clusterSpacing = 6.0;
  const totalWidth = (validClusters.length - 1) * clusterSpacing;
  const startX = -totalWidth / 2;

  for (let ci = 0; ci < validClusters.length; ci++) {
    const { cn, cd, pairs, commaNode } = validClusters[ci];
    const cx = startX + ci * clusterSpacing;
    const commaKey = `${cn}/${cd}`;

    // Sort pairs by pitch of lower node
    pairs.sort((a, b) => (a[0].n / a[0].d) - (b[0].n / b[0].d));

    const pairSpacing = 1.4;
    const colGap = 1.2;
    const totalHeight = (pairs.length - 1) * pairSpacing;
    const topY = totalHeight / 2;

    const placed = new Map<string, string>(); // originalKey → posKey

    for (let pi = 0; pi < pairs.length; pi++) {
      const [lower, higher] = pairs[pi];
      const lk = nodeKey(lower), hk = nodeKey(higher);
      const y = topY - pi * pairSpacing;

      if (!placed.has(lk)) {
        const lpk = `${ci}:${lk}`;
        positions.set(lpk, [cx - colGap, y, 0]);
        placed.set(lk, lpk);
        allNodes.push({ node: lower, key: lk, posKey: lpk, clusterId: ci });
      }
      if (!placed.has(hk)) {
        const hpk = `${ci}:${hk}`;
        positions.set(hpk, [cx + colGap, y, 0]);
        placed.set(hk, hpk);
        allNodes.push({ node: higher, key: hk, posKey: hpk, clusterId: ci });
      }

      // Comma edge between pair
      allEdges.push({ from: placed.get(lk)!, to: placed.get(hk)! });
    }

    // Comma node centered below pairs
    const cpk = `${ci}:${commaKey}`;
    const commaY = topY - pairs.length * pairSpacing - 0.3;
    positions.set(cpk, [cx, commaY, 0]);
    allNodes.push({ node: commaNode, key: commaKey, posKey: cpk, clusterId: ci });

    // Cluster label below comma node
    labels.push({
      pos: [cx, commaY - 0.6, 0],
      name: COMMA_NAMES[commaKey] || commaKey,
      ratio: commaKey,
      cents: `${ratioToCents(cn, cd).toFixed(0)}¢`,
    });
  }

  return { nodes: allNodes, edges: allEdges, positions, labels };
}
