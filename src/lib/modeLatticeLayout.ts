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

// Anchor-relative axis layout.  The anchor's own family always gets
// the primary axis (+Y straight up).  Every other family is assigned
// an axis whose polar angle from +Y grows with that family's minimum
// alteration distance to the anchor — so 1-alteration families sit
// near the primary axis, 2-alt families ring the equator, and 3+ alt
// families fall toward the southern hemisphere.  Within a polar
// "ring", families with the same min-alteration distance are spread
// evenly around the azimuth.
//
// Along each axis the family's seven modes line up ordered BRIGHTEST
// (closest to centre) → DARKEST (far end).  The anchor itself sits at
// the world origin and is not duplicated on its family axis.
// Relatives (D Dorian, E Phrygian, etc. for C Major) line up on a
// dedicated -Y axis ordered by brightness.
function familyAxisLayout(
  nodes: ModeNode[],
  anchorKey: string | null,
) {
  const anchor = anchorKey ? nodes.find(n => n.key === anchorKey) : null;
  const anchorFamily = anchor?.family ?? FAMILY_ORDER[0];

  // For each family OTHER than the anchor's, compute the minimum
  // alteration distance from anchor to any of that family's parallel
  // modes.  This decides the polar angle (closer to anchor = closer
  // to the primary +Y axis).
  const familyMinAlt = new Map<string, number>();
  for (const family of FAMILY_ORDER) {
    if (family === anchorFamily) continue;
    let minD = Infinity;
    if (anchor) {
      for (const node of nodes) {
        if (node.family !== family || node.isRelative) continue;
        const d = pitchSetDistance(anchor.pitchSet, node.pitchSet);
        if (d < minD) minD = d;
      }
    }
    familyMinAlt.set(family, minD === Infinity ? 4 : minD);
  }

  // Group non-anchor families by min-alt level so families at the
  // same level can be distributed around the azimuth at that polar
  // angle.  Sort levels ascending.
  const levels = new Map<number, string[]>();
  for (const [family, minAlt] of familyMinAlt) {
    if (!levels.has(minAlt)) levels.set(minAlt, []);
    levels.get(minAlt)!.push(family);
  }
  const sortedLevels = Array.from(levels.keys()).sort((a, b) => a - b);

  // Compute axis direction per family.
  //   - Anchor's family → +Y (polar angle 0).
  //   - Each other family → polar angle = (minAlt / 4) * 0.85 * π
  //     (so 1-alt sits ~22°, 2-alt at ~45°, 3-alt at ~67°, 4-alt at
  //     ~90° equator).
  //   - Within a level, families fan evenly around the azimuth.
  const familyDirs = new Map<string, [number, number, number]>();
  familyDirs.set(anchorFamily, [0, 1, 0]);

  for (const level of sortedLevels) {
    const fams = levels.get(level)!;
    const polar = Math.min(0.95 * Math.PI, (level / 4) * 0.85 * Math.PI);
    for (let i = 0; i < fams.length; i++) {
      const azimuth = (i / fams.length) * Math.PI * 2 + level * 0.4;
      const sinP = Math.sin(polar);
      const cosP = Math.cos(polar);
      familyDirs.set(fams[i], [
        sinP * Math.cos(azimuth),
        cosP,
        sinP * Math.sin(azimuth),
      ]);
    }
  }

  // Brightness ranks within each family (darkest = 0, brightest = 6).
  // Ordering on axis: BRIGHTEST closest to centre → DARKEST at far end
  // (axis position = total ranks - rank).
  const familyRank = new Map<string, Map<string, number>>();
  for (const family of FAMILY_ORDER) {
    const familyModes = (PATTERN_SCALE_FAMILIES[family] ?? []).slice();
    const bright = new Map<string, number>();
    for (const m of familyModes) {
      const node = nodes.find(n => n.family === family && n.mode === m && !n.isRelative);
      bright.set(m, node?.brightness ?? 0);
    }
    familyModes.sort((a, b) => (bright.get(a) ?? 0) - (bright.get(b) ?? 0));
    const rankMap = new Map<string, number>();
    familyModes.forEach((m, idx) => rankMap.set(m, idx));
    familyRank.set(family, rankMap);
  }

  const SPACING = 1.6;

  // Place every node.
  for (const node of nodes) {
    if (anchor && node.key === anchor.key) {
      node.pos = [0, 0, 0];
      continue;
    }

    // Relative satellites get their own dedicated axis pointing -Y.
    // Brightest closest to centre, darkest at the far end — same
    // ordering convention as the family axes.
    if (node.isRelative) {
      const ranks = familyRank.get(node.family);
      const rank = ranks?.get(node.mode) ?? 0;
      const TOTAL = 7;
      const dist = (TOTAL - rank) * SPACING;
      node.pos = [0, -dist, 0];
      continue;
    }

    const dir = familyDirs.get(node.family);
    const ranks = familyRank.get(node.family);
    if (!dir || !ranks) {
      node.pos = [0, 0, 0];
      continue;
    }
    const rank = ranks.get(node.mode) ?? 0;
    // Brightest (highest rank) closest to centre at distance 1*SPACING;
    // darkest (rank 0) at the far end at distance 7*SPACING.
    const TOTAL = 7;
    const dist = (TOTAL - rank) * SPACING;
    node.pos = [dir[0] * dist, dir[1] * dist, dir[2] * dist];
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
