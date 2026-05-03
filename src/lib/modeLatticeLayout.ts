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

// Concentric-ring layout.  The anchor sits at the origin.  Each
// alteration distance forms a RING around the anchor at a radius
// proportional to that distance — so all 1-alt modes are equidistant
// from anchor, rotated around it, all 2-alt modes form the next
// ring out, etc.
//
// Within each ring, modes are spread evenly by brightness so the
// reading goes "darker on one side, brighter on the other".  The user
// gets clear visual paths: spokes from anchor cross multiple rings,
// arcs along a ring stay at the same alteration distance.
//
// Rings are interleaved with small Y biases (alternating up/down) so
// the structure reads as 3D rather than a flat target board.
function familyAxisLayout(
  nodes: ModeNode[],
  anchorKey: string | null,
) {
  const anchor = anchorKey ? nodes.find(n => n.key === anchorKey) : null;

  // Group every non-anchor node by its alteration distance to the
  // anchor.  Anchor itself sits at the origin.
  const byAlt = new Map<number, ModeNode[]>();
  for (const node of nodes) {
    if (anchor && node.key === anchor.key) {
      node.pos = [0, 0, 0];
      continue;
    }
    const alt = anchor ? pitchSetDistance(anchor.pitchSet, node.pitchSet) : 1;
    if (!byAlt.has(alt)) byAlt.set(alt, []);
    byAlt.get(alt)!.push(node);
  }

  // Tunable: ring radii and the per-ring Y bias that gives the structure
  // some 3D depth.  Even-numbered alt-rings tilt slightly down, odd up.
  const RING_BASE = 1.6;
  const RING_STEP = 1.2;

  for (const [alt, group] of byAlt) {
    const radius = RING_BASE + alt * RING_STEP;
    // Within each ring, sort by brightness ascending then group by
    // family so families form arcs on the ring.
    group.sort((a, b) => {
      if (a.family !== b.family) {
        return FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family);
      }
      return a.brightness - b.brightness;
    });

    // Stagger Y per ring: alt 0 below, alt 1 above, alt 2 below, ...
    // gives a 3D corkscrew rather than a flat target.
    const yBias = (alt % 2 === 0 ? -1 : 1) * 0.35 * Math.min(alt + 1, 4);

    const N = group.length;
    for (let i = 0; i < N; i++) {
      // Per-ring rotational offset so the rings don't all start their
      // first node at the same azimuth — keeps spokes from overlapping.
      const startOffset = alt * 0.31;
      const angle = (i / Math.max(1, N)) * Math.PI * 2 + startOffset;
      group[i].pos = [
        Math.cos(angle) * radius,
        yBias,
        Math.sin(angle) * radius,
      ];
    }
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
