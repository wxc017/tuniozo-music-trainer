// ── Mode-lattice layout ───────────────────────────────────────────────
// Radial shell layout centered on the user-selected anchor mode.
//   - Anchor sits at the origin.
//   - Concentric shells at increasing radii hold every other mode,
//     keyed by alteration distance from the anchor (= |pitchSet
//     symdiff anchorPitchSet| / 2).
//   - 0-alteration shell holds "relatives" — modes sharing the anchor's
//     pitch set on different roots (e.g. D Dorian for C Major).
//   - Each shell uses a different angular orientation so the shape
//     reads as a complex multi-axis sphere rather than concentric rings.
//   - Brightness biases the Y component slightly so within a shell,
//     brighter modes float upward.

import { PATTERN_SCALE_FAMILIES } from "./musicTheory";
import { getModeDegreeMap } from "./edoData";

export interface ModeNode {
  key: string;
  family: string;
  mode: string;
  rootPcOffset: number;     // pc offset from the user's tonic (0 = on tonic)
  scale: number[];          // step values from this node's own root
  pitchSet: number[];       // sorted pitch classes mod edo (relative to tonic)
  brightness: number;
  pos: [number, number, number];
  isRelative: boolean;      // true for satellites that share the anchor's notes
}

export interface ModeEdge {
  fromKey: string;
  toKey: string;
  alterations: number;      // 0, 1, 2, 3
}

export interface ModeLattice {
  nodes: ModeNode[];
  edges: ModeEdge[];
  byKey: Map<string, ModeNode>;
}

const FAMILY_ORDER = [
  "Major Family",
  "Harmonic Minor Family",
  "Melodic Minor Family",
  "Subminor Diatonic Family",
  "Neutral Diatonic Family",
  "Supermajor Diatonic Family",
  "Subharmonic Diatonic Family",
];

function sortedSteps(degMap: Record<string, number>): number[] {
  return Object.values(degMap).sort((a, b) => a - b);
}

function buildPitchSet(rootPcOffset: number, scale: number[], edo: number): number[] {
  return scale.map(s => ((rootPcOffset + s) % edo + edo) % edo).sort((a, b) => a - b);
}

function pitchSetDistance(a: number[], b: number[]): number {
  const setA = new Set(a);
  let symdiff = 0;
  for (const v of a) if (!b.includes(v)) symdiff++;
  for (const v of b) if (!setA.has(v)) symdiff++;
  return symdiff / 2;
}

// All 49 parallel modes rooted on the user's tonic (rootPcOffset = 0).
function buildParallelNodes(edo: number): ModeNode[] {
  const out: ModeNode[] = [];
  for (const family of FAMILY_ORDER) {
    const modes = PATTERN_SCALE_FAMILIES[family] ?? [];
    for (const modeName of modes) {
      const scale = sortedSteps(getModeDegreeMap(edo, family, modeName));
      if (scale.length !== 7) continue;
      out.push({
        key: `${family}::${modeName}::r0`,
        family,
        mode: modeName,
        rootPcOffset: 0,
        scale,
        pitchSet: buildPitchSet(0, scale, edo),
        brightness: scale.reduce((s, v) => s + v, 0),
        pos: [0, 0, 0],
        isRelative: false,
      });
    }
  }
  return out;
}

// 6 relative satellites for the anchor — the other rotations of its
// family parent on different roots, all sharing the anchor's pitch set.
//
// Math: anchor mode i with absolute root R_anchor implies all rotations
// share a "base offset" A = R_anchor - parent[i-1].  Mode m's relative
// root = A + parent[m-1].  Working in (pc - tonic) space, R_anchor of
// the parallel anchor is 0, so A = -parent[i-1] mod edo.
function buildRelativeNodes(
  anchorFamily: string,
  anchorMode: string,
  edo: number,
): ModeNode[] {
  const familyModes = PATTERN_SCALE_FAMILIES[anchorFamily];
  if (!familyModes) return [];
  const anchorIdx = familyModes.indexOf(anchorMode);
  if (anchorIdx < 0) return [];

  // The "parent" scale = mode 1's intervals.  All modes are rotations
  // of this parent.
  const parent = sortedSteps(getModeDegreeMap(edo, anchorFamily, familyModes[0]));
  if (parent.length !== 7) return [];

  const A = ((0 - parent[anchorIdx]) % edo + edo) % edo;

  const out: ModeNode[] = [];
  for (let m = 0; m < familyModes.length; m++) {
    if (m === anchorIdx) continue;
    const modeName = familyModes[m];
    const scale = sortedSteps(getModeDegreeMap(edo, anchorFamily, modeName));
    if (scale.length !== 7) continue;
    const rootPcOffset = (A + parent[m]) % edo;
    out.push({
      key: `${anchorFamily}::${modeName}::r${rootPcOffset}`,
      family: anchorFamily,
      mode: modeName,
      rootPcOffset,
      scale,
      pitchSet: buildPitchSet(rootPcOffset, scale, edo),
      brightness: scale.reduce((s, v) => s + v, 0),
      pos: [0, 0, 0],
      isRelative: true,
    });
  }
  return out;
}

// Edges: every pair within 3 alterations gets one.  Relatives all
// share the anchor's pitch set, so every relative-relative pair is
// also 0-alt — but rendering all 21 of those creates a gold hairball.
// We restrict 0-alt edges to *spokes from the anchor* so the
// "same-notes" relationship reads cleanly.
function buildEdges(nodes: ModeNode[], anchorKey: string | null): ModeEdge[] {
  const out: ModeEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = pitchSetDistance(nodes[i].pitchSet, nodes[j].pitchSet);
      if (d === 0) {
        const involvesAnchor = nodes[i].key === anchorKey || nodes[j].key === anchorKey;
        if (involvesAnchor) {
          out.push({ fromKey: nodes[i].key, toKey: nodes[j].key, alterations: 0 });
        }
        continue;
      }
      if (d === 1 || d === 2 || d === 3) {
        out.push({ fromKey: nodes[i].key, toKey: nodes[j].key, alterations: d });
      }
    }
  }
  return out;
}

// Hierarchical family-cluster layout.
//
//   - Anchor at the origin.
//   - Anchor's own family forms a small ring directly around the
//     anchor (its 6 other modes orbit it).
//   - Every other family becomes a satellite cluster: a "centroid"
//     positioned at a distance proportional to that family's minimum
//     alteration distance to the anchor, with that family's 7 modes
//     orbiting on a small ring around the centroid.
//   - Multiple families at the same min-alt distance fan out
//     angularly so they don't stack on each other.
//
// This is what gives the user a clean reading:
//   "anchor in the middle, its own family circling it, then 1-alt
//    families each as their own little ring nearby, 2-alt families
//    further out, etc."
function familyAxisLayout(
  nodes: ModeNode[],
  anchorKey: string | null,
) {
  const anchor = anchorKey ? nodes.find(n => n.key === anchorKey) : null;
  if (!anchor) {
    for (const n of nodes) n.pos = [0, 0, 0];
    return;
  }
  const anchorFamily = anchor.family;

  // 1. Min alteration distance per non-anchor family.
  const familyMinAlt = new Map<string, number>();
  for (const family of FAMILY_ORDER) {
    if (family === anchorFamily) continue;
    let minD = Infinity;
    for (const n of nodes) {
      if (n.family === family && !n.isRelative) {
        const d = pitchSetDistance(anchor.pitchSet, n.pitchSet);
        if (d < minD) minD = d;
      }
    }
    familyMinAlt.set(family, minD === Infinity ? 4 : minD);
  }

  // 2. Place each family's centroid.  Anchor's family sits AT origin
  //    (anchor itself), so its modes orbit anchor directly.  Other
  //    families' centroids land at distance = ALT_BASE + (alt-1)*ALT_STEP
  //    from anchor, distributed angularly with families at the same
  //    alt-level fanning evenly + a small Y bias for 3D depth.
  const familyCentroid = new Map<string, [number, number, number]>();
  familyCentroid.set(anchorFamily, [0, 0, 0]);

  // Group non-anchor families by min-alt level so we can spread
  // multiple families at the same alt level around their shared shell.
  const altLevels = new Map<number, string[]>();
  for (const [family, alt] of familyMinAlt) {
    if (!altLevels.has(alt)) altLevels.set(alt, []);
    altLevels.get(alt)!.push(family);
  }

  const ALT_BASE = 4.0;
  const ALT_STEP = 2.6;
  for (const [alt, fams] of altLevels) {
    fams.sort((a, b) => FAMILY_ORDER.indexOf(a) - FAMILY_ORDER.indexOf(b));
    const r = ALT_BASE + Math.max(0, alt - 1) * ALT_STEP;
    const N = fams.length;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2 + alt * 0.4;
      const yBias = (alt % 2 === 0 ? -1 : 1) * 0.6 * alt;
      familyCentroid.set(fams[i], [
        Math.cos(angle) * r,
        yBias,
        Math.sin(angle) * r,
      ]);
    }
  }

  // 3. Brightness rank per family — modes within a cluster orbit in
  //    brightness order around their centroid.
  const familyRank = new Map<string, Map<string, number>>();
  for (const family of FAMILY_ORDER) {
    const fmodes = (PATTERN_SCALE_FAMILIES[family] ?? []).slice();
    const bright = new Map<string, number>();
    for (const m of fmodes) {
      const node = nodes.find(n => n.family === family && n.mode === m && !n.isRelative);
      bright.set(m, node?.brightness ?? 0);
    }
    fmodes.sort((a, b) => (bright.get(a) ?? 0) - (bright.get(b) ?? 0));
    const rmap = new Map<string, number>();
    fmodes.forEach((m, i) => rmap.set(m, i));
    familyRank.set(family, rmap);
  }

  // 4. Place every node on its family's orbit.
  const ANCHOR_ORBIT_R = 1.9;     // anchor's family modes orbit this far from anchor
  const SATELLITE_ORBIT_R = 1.1;  // other families' modes orbit their centroid this tight

  // Build a perpendicular basis given an axis direction (used to lay
  // out a satellite cluster's orbit perpendicular to its anchor-line).
  const perpBasis = (axis: [number, number, number]): [
    [number, number, number],
    [number, number, number],
  ] => {
    const upGuess: [number, number, number] = Math.abs(axis[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    let p1: [number, number, number] = [
      axis[1] * upGuess[2] - axis[2] * upGuess[1],
      axis[2] * upGuess[0] - axis[0] * upGuess[2],
      axis[0] * upGuess[1] - axis[1] * upGuess[0],
    ];
    const p1L = Math.hypot(p1[0], p1[1], p1[2]) || 1;
    p1 = [p1[0] / p1L, p1[1] / p1L, p1[2] / p1L];
    const p2: [number, number, number] = [
      axis[1] * p1[2] - axis[2] * p1[1],
      axis[2] * p1[0] - axis[0] * p1[2],
      axis[0] * p1[1] - axis[1] * p1[0],
    ];
    return [p1, p2];
  };

  for (const node of nodes) {
    if (node.key === anchor.key) {
      node.pos = [0, 0, 0];
      continue;
    }

    const ranks = familyRank.get(node.family);
    const rank = ranks?.get(node.mode) ?? 0;
    const centroid = familyCentroid.get(node.family) ?? [0, 0, 0];

    const isAnchorFamily = node.family === anchorFamily;
    const orbitR = isAnchorFamily ? ANCHOR_ORBIT_R : SATELLITE_ORBIT_R;

    // Choose a basis for the orbit ring.  Anchor's family orbits in the
    // XZ plane (so it's clearly the central ring); satellite clusters
    // orient their orbit perpendicular to (centroid → anchor) so the
    // ring "faces" the anchor.
    let bx: [number, number, number];
    let bz: [number, number, number];
    if (isAnchorFamily || node.isRelative) {
      bx = [1, 0, 0];
      bz = [0, 0, 1];
    } else {
      const len = Math.hypot(centroid[0], centroid[1], centroid[2]) || 1;
      const cn: [number, number, number] = [centroid[0] / len, centroid[1] / len, centroid[2] / len];
      [bx, bz] = perpBasis(cn);
    }

    // For the anchor's family ring, anchor occupies one of the 7 mode
    // slots — we just leave that slot empty by skipping the anchor's
    // own rank when assigning angles.  Other modes fill the remaining
    // 6 slots.  For satellite families, all 7 modes participate.
    const anchorRank = familyRank.get(anchorFamily)?.get(anchor.mode) ?? 0;
    let slotIdx: number;
    let slotN: number;
    if (isAnchorFamily) {
      // Skip anchor's slot — modes with rank > anchorRank shift up by one.
      slotIdx = rank > anchorRank ? rank - 1 : rank;
      slotN = 7;  // 7 slots total but anchor's slot is left empty
    } else if (node.isRelative) {
      // Relatives ride at half-step positions on the anchor's family
      // ring — between parallel modes, sorted by brightness.
      slotIdx = rank;
      slotN = 7;
    } else {
      slotIdx = rank;
      slotN = 7;
    }

    let angle = (slotIdx / slotN) * Math.PI * 2;
    if (node.isRelative) angle += Math.PI / slotN;  // half-step offset

    const ox = bx[0] * Math.cos(angle) * orbitR + bz[0] * Math.sin(angle) * orbitR;
    const oy = bx[1] * Math.cos(angle) * orbitR + bz[1] * Math.sin(angle) * orbitR;
    const oz = bx[2] * Math.cos(angle) * orbitR + bz[2] * Math.sin(angle) * orbitR;

    node.pos = [
      centroid[0] + ox,
      centroid[1] + oy,
      centroid[2] + oz,
    ];
  }
}

let _cached: { key: string; lattice: ModeLattice } | null = null;

export function getModeLattice(
  edo: number,
  anchorFamily: string | null,
  anchorMode: string | null,
): ModeLattice {
  const cacheKey = `${edo}::${anchorFamily ?? "_"}::${anchorMode ?? "_"}`;
  if (_cached && _cached.key === cacheKey) return _cached.lattice;

  const parallel = buildParallelNodes(edo);
  const relatives = (anchorFamily && anchorMode)
    ? buildRelativeNodes(anchorFamily, anchorMode, edo)
    : [];
  const nodes = [...parallel, ...relatives];

  const anchorKey = (anchorFamily && anchorMode)
    ? `${anchorFamily}::${anchorMode}::r0`
    : null;

  const edges = buildEdges(nodes, anchorKey);
  familyAxisLayout(nodes, anchorKey);

  const byKey = new Map(nodes.map(n => [n.key, n]));
  const lattice: ModeLattice = { nodes, edges, byKey };
  _cached = { key: cacheKey, lattice };
  return lattice;
}

export function alterationFromAnchor(anchor: ModeNode, other: ModeNode): number {
  return pitchSetDistance(anchor.pitchSet, other.pitchSet);
}
