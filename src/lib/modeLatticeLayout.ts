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

// Edges: every pair within 3 alterations gets one.  Relatives share the
// anchor's pitch set so their distance is 0 from the anchor (the
// "same-notes" edge).
function buildEdges(nodes: ModeNode[]): ModeEdge[] {
  const out: ModeEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = pitchSetDistance(nodes[i].pitchSet, nodes[j].pitchSet);
      if (d === 0 || d === 1 || d === 2 || d === 3) {
        out.push({ fromKey: nodes[i].key, toKey: nodes[j].key, alterations: d });
      }
    }
  }
  return out;
}

// Family-axis layout.  Anchor at origin.  Seven family axes radiate
// out from the centre in a hexagonal-star arrangement: Major straight
// up the +Y axis, the other six families distributed evenly around the
// equator at 60° apart.  Along each axis the family's modes line up
// ordered DARKEST (closest to centre) → BRIGHTEST (far end).
//
// The anchor's six relatives (modes sharing the anchor's pitch set on
// other roots — D Dorian, E Phrygian, etc. for C Major) live on a
// dedicated axis pointing -Y, so the user can read them as a single
// "same notes" line distinct from the family axes.
function familyAxisLayout(
  nodes: ModeNode[],
  anchorKey: string | null,
) {
  const anchor = anchorKey ? nodes.find(n => n.key === anchorKey) : null;

  // Hexagonal-star directions: Major up, 6 others equally spaced around
  // the equator.  The wide angular separation makes the structure
  // unambiguously read as 7 distinct axes radiating from the centre.
  const familyDirs = new Map<string, [number, number, number]>();
  for (let i = 0; i < FAMILY_ORDER.length; i++) {
    const family = FAMILY_ORDER[i];
    if (i === 0) {
      familyDirs.set(family, [0, 1, 0]);  // Major straight up
    } else {
      // Six equatorial directions at 60° intervals, starting at +X.
      const angle = ((i - 1) * Math.PI * 2) / 6;
      familyDirs.set(family, [Math.cos(angle), 0, Math.sin(angle)]);
    }
  }

  // Brightness ranks within each family (darkest = 0, brightest = 6).
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

  const SPACING = 1.4;

  // Place every node.
  for (const node of nodes) {
    if (anchor && node.key === anchor.key) {
      node.pos = [0, 0, 0];
      continue;
    }

    // Relative satellites get their own dedicated axis pointing -Y so
    // the user reads them as one clean "same notes" line: D Dorian,
    // E Phrygian, F Lydian, G Mixolydian, A Aeolian, B Locrian.
    if (node.isRelative) {
      const ranks = familyRank.get(node.family);
      const rank = ranks?.get(node.mode) ?? 0;
      const dist = (rank + 1) * SPACING;
      // Direction = straight down so it doesn't clash with Major (+Y).
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
    const dist = (rank + 1) * SPACING;
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

  const edges = buildEdges(nodes);
  familyAxisLayout(nodes, anchorKey);

  const byKey = new Map(nodes.map(n => [n.key, n]));
  const lattice: ModeLattice = { nodes, edges, byKey };
  _cached = { key: cacheKey, lattice };
  return lattice;
}

export function alterationFromAnchor(anchor: ModeNode, other: ModeNode): number {
  return pitchSetDistance(anchor.pitchSet, other.pitchSet);
}
