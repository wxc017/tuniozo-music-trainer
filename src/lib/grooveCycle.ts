/**
 * grooveCycle.ts — Groove Permutations: cycle model + PER-VOICE permutation
 * enumeration + render adapter.
 *
 * A CYCLE is a list of PULSES ("points"), each subdivided into a per-pulse
 * sub-pulse count (uniform 4-4-4-4 → 16 sixteenths, or additive 3-2-2 / 6-8-8).
 *
 * Every voice has its own permutation pool: bass, snare-accent, snare-ghost,
 * hi-hat (closed), open-hat and left-foot (hh-pedal).  In the UI a voice
 * selector sits above the pool; you browse one voice's placements at a time and
 * drop them into a point.  All voices layer independently and may share a slot
 * (a hat on a kick is a unison).  Any snare/ghost note can SPLIT into two 32nds
 * (a double-stroke) — surfaced as extra options in that voice's pool.
 *
 * Note values are left NATURAL (each note lasts to the next onset in its voice),
 * so a hat on slots 0,2,3 of a beat reads as an eighth + two sixteenths rather
 * than three equal attacks.
 */

import { GridType } from "@/lib/drumData";
import type { StripMeasureData } from "@/components/VexDrumNotation";

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 1: Voice model
   ═══════════════════════════════════════════════════════════════════════════ */

export type LayerVoice =
  | "bass" | "snareAccent" | "snareGhost" | "hatClosed" | "hatOpen" | "hhFoot";

export interface VoiceMeta {
  char: string;
  label: string;
  color: string;
  /** Can a note of this voice split into a 32nd double-stroke? */
  doublable: boolean;
}

export const VOICE_META: Record<LayerVoice, VoiceMeta> = {
  bass:        { char: "B", label: "Bass",      color: "#e0a040", doublable: false },
  snareAccent: { char: "S", label: "Snare",     color: "#60b0e0", doublable: true  },
  snareGhost:  { char: "g", label: "Ghost",     color: "#9a9a9a", doublable: true  },
  hatClosed:   { char: "x", label: "Hi-hat",    color: "#c8aa50", doublable: false },
  hatOpen:     { char: "o", label: "Open hat",  color: "#e06070", doublable: false },
  hhFoot:      { char: "L", label: "Left foot", color: "#50b080", doublable: false },
};

/** Display / selector order. */
export const LAYER_VOICES: LayerVoice[] = ["bass", "snareAccent", "snareGhost", "hatClosed", "hatOpen", "hhFoot"];

export const SUB_PULSE_SIZES = [2, 3, 4, 5, 6, 7] as const;
export type SubPulseSize = (typeof SUB_PULSE_SIZES)[number];

export interface GroovePoint { subPulses: number; }
export interface GrooveCycle { points: GroovePoint[]; }

/** One voice's placement within a single point. */
export interface VoicePlacement {
  /** Slot positions (within the point) this voice hits. */
  hits: number[];
  /** Subset of `hits` that are 32nd double-strokes. */
  doubles: number[];
}

/** All voices placed in one point. */
export type PointVoices = Partial<Record<LayerVoice, VoicePlacement>>;

/* ── Cycle helpers ──────────────────────────────────────────────────────── */

const RESOLUTION_TO_GRID: Record<number, GridType> = {
  2: "8th", 3: "triplet", 4: "16th", 5: "quintuplet", 6: "sextuplet", 7: "septuplet", 8: "32nd",
};
export function gridForResolution(r: number): GridType | null {
  return RESOLUTION_TO_GRID[r] ?? null;
}
export function cycleTotalSlots(cycle: GrooveCycle): number {
  return cycle.points.reduce((s, p) => s + p.subPulses, 0);
}
export function pointOffsets(cycle: GrooveCycle): number[] {
  const offs: number[] = []; let o = 0;
  for (const p of cycle.points) { offs.push(o); o += p.subPulses; }
  return offs;
}
export function isUniform(cycle: GrooveCycle): boolean {
  return cycle.points.every(p => p.subPulses === cycle.points[0]?.subPulses);
}
export function makeUniformCycle(pulses: number, subPulses: number): GrooveCycle {
  return { points: Array.from({ length: pulses }, () => ({ subPulses })) };
}
export function makeCycle(sizes: number[]): GrooveCycle {
  return { points: sizes.map(s => ({ subPulses: s })) };
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 2: Per-voice permutation enumeration
   ═══════════════════════════════════════════════════════════════════════════ */

function combinations(n: number, k: number): number[][] {
  const result: number[][] = [];
  (function pick(start: number, chosen: number[]) {
    if (chosen.length === k) { result.push([...chosen]); return; }
    for (let i = start; i < n; i++) pick(i + 1, [...chosen, i]);
  })(0, []);
  return result;
}

/** One enumerated placement of a single voice within a point. */
export interface VoicePerm {
  id: string;
  voice: LayerVoice;
  size: number;
  density: number;
  hits: number[];
  doubles: number[];
  label: string;
}

export interface EnumOpts {
  includeDoubles?: boolean;
  maxPerNode?: number;
}

/** Base placement count per density: C(size, k). */
export function voicePermDensities(size: number): { density: number; count: number }[] {
  return Array.from({ length: size + 1 }, (_, k) => ({ density: k, count: combinations(size, k).length }));
}

function permLabel(voice: LayerVoice, size: number, hits: number[], doubles: number[]): string {
  const ch = VOICE_META[voice].char;
  const hitSet = new Set(hits), dblSet = new Set(doubles);
  return Array.from({ length: size }, (_, i) =>
    hitSet.has(i) ? ch + (dblSet.has(i) ? "=" : "") : ".").join(" ");
}

/**
 * Enumerate placements of one `voice` at density `k` within a point of `size`.
 * With `includeDoubles` (and a doublable voice) each base placement also yields
 * variants that split exactly one note into a 32nd double-stroke — and never two
 * adjacent doubles (two 32nds in a row reads as an unmusical run).
 */
export function enumerateVoicePerms(size: number, k: number, voice: LayerVoice, opts: EnumOpts = {}): VoicePerm[] {
  const cap = opts.maxPerNode ?? Infinity;
  const out: VoicePerm[] = [];
  const doublable = VOICE_META[voice].doublable;
  const mk = (hits: number[], doubles: number[]) => {
    out.push({
      id: `${voice}:${size}:${hits.join(",")}${doubles.length ? "|d" + doubles.join(",") : ""}`,
      voice, size, density: k, hits: [...hits], doubles: [...doubles],
      label: permLabel(voice, size, hits, doubles),
    });
  };
  for (const hits of combinations(size, k)) {
    mk(hits, []);
    if (out.length >= cap) return out;
    if (opts.includeDoubles && doublable) {
      for (const h of hits) {
        // Skip a double that would sit right next to another hit (avoids the
        // "two 32nds in a row" look the user flagged).
        if (hits.includes(h + 1) || hits.includes(h - 1)) continue;
        mk(hits, [h]);
        if (out.length >= cap) return out;
      }
    }
  }
  return out;
}

export function enumerateAllVoicePerms(size: number, voice: LayerVoice, opts: EnumOpts = {}): VoicePerm[] {
  const out: VoicePerm[] = [];
  for (let k = 0; k <= size; k++) out.push(...enumerateVoicePerms(size, k, voice, opts));
  return out;
}

/* ── Hi-hat quick-fill positions (for "apply ostinato to all points") ────── */
export type HatShape = "16ths" | "8ths" | "offbeats" | "quarter" | "mixed";
const MIXED_HAT_BY_SIZE: Record<number, number[]> = {
  2: [0, 1], 3: [0, 2], 4: [0, 2, 3], 5: [0, 2, 4], 6: [0, 2, 3, 5], 7: [0, 2, 4, 6], 8: [0, 2, 3, 5, 6],
};
export function hatShapePositions(shape: HatShape, size: number): number[] {
  const all = Array.from({ length: size }, (_, i) => i);
  switch (shape) {
    case "16ths":    return all;
    case "8ths":     return all.filter(i => i % 2 === 0);
    case "offbeats": return all.filter(i => i % 2 === 1);
    case "quarter":  return [0];
    case "mixed":    return MIXED_HAT_BY_SIZE[size] ?? all.filter(i => i % 2 === 0);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 3: Assemble a cycle → renderable data
   ═══════════════════════════════════════════════════════════════════════════ */

export interface AssembledCycle {
  totalSlots: number;
  pulseBoundaries: number[];
  pulseSizes: number[];
  bassHits: number[];
  snareHits: number[];
  ghostHits: number[];
  snareDoubleHits: number[];
  ghostDoubleHits: number[];
  hatHits: number[];
  hatOpenHits: number[];
  hhFootHits: number[];
  accentFlags: boolean[];
  grid: GridType | null;
}

function dedupe(xs: number[]): number[] {
  return [...new Set(xs)].sort((a, b) => a - b);
}

export function assembleCycle(cycle: GrooveCycle, pointVoices: PointVoices[]): AssembledCycle {
  const bassHits: number[] = [];
  const snareHits: number[] = [];
  const ghostHits: number[] = [];
  const snareDoubleHits: number[] = [];
  const ghostDoubleHits: number[] = [];
  const hatHits: number[] = [];
  const hatOpenHits: number[] = [];
  const hhFootHits: number[] = [];
  const offs = pointOffsets(cycle);
  const pulseSizes = cycle.points.map(p => p.subPulses);
  const totalSlots = cycleTotalSlots(cycle);
  const accentFlags = new Array<boolean>(totalSlots).fill(false);

  cycle.points.forEach((_p, i) => {
    const off = offs[i];
    const voices = pointVoices[i];
    if (!voices) return;
    const place = (vp: VoicePlacement | undefined, fn: (abs: number, isDouble: boolean) => void) => {
      if (!vp) return;
      const dbl = new Set(vp.doubles);
      for (const h of vp.hits) fn(off + h, dbl.has(h));
    };
    place(voices.bass,        abs => { bassHits.push(abs); });
    place(voices.snareAccent, (abs, d) => { snareHits.push(abs); accentFlags[abs] = true; if (d) snareDoubleHits.push(abs); });
    place(voices.snareGhost,  (abs, d) => { ghostHits.push(abs); if (d) ghostDoubleHits.push(abs); });
    place(voices.hatClosed,   abs => { hatHits.push(abs); });
    place(voices.hatOpen,     abs => { hatHits.push(abs); hatOpenHits.push(abs); });
    place(voices.hhFoot,      abs => { hhFootHits.push(abs); });
  });

  const grid = isUniform(cycle) ? gridForResolution(cycle.points[0]?.subPulses ?? 4) : null;
  return {
    totalSlots, pulseBoundaries: offs, pulseSizes,
    bassHits: dedupe(bassHits), snareHits: dedupe(snareHits), ghostHits: dedupe(ghostHits),
    snareDoubleHits: dedupe(snareDoubleHits), ghostDoubleHits: dedupe(ghostDoubleHits),
    hatHits: dedupe(hatHits), hatOpenHits: dedupe(hatOpenHits), hhFootHits: dedupe(hhFootHits),
    accentFlags, grid,
  };
}

export function cycleToStripData(cycle: GrooveCycle, pointVoices: PointVoices[]): StripMeasureData {
  const a = assembleCycle(cycle, pointVoices);
  const grid = a.grid ?? gridForResolution(cycle.points[0]?.subPulses ?? 4) ?? "16th";
  return {
    grid,
    ostinatoHits: a.hatHits,
    ostinatoOpen: a.hatOpenHits,
    snareHits: a.snareHits,
    bassHits: a.bassHits,
    hhFootHits: a.hhFootHits,
    hhFootOpen: [],
    ghostHits: a.ghostHits,
    ghostDoubleHits: a.ghostDoubleHits,
    snareDoubleHits: a.snareDoubleHits,
    accentFlags: a.accentFlags,
    slotOverride: a.totalSlots,
    // Natural drum note values: each hit holds to the next onset in its voice,
    // capped to the end of its beat (max a quarter).  So an 8th-note hi-hat
    // reads as eighths, a kick on slot 0 with another on slot 3 reads as a
    // dotted-8th + 16th beamed together, and a kick on a beat reads as a
    // quarter — standard kit notation, not a flat 16th lattice.  Beat-aligned
    // beaming (default) keeps each beat's notes in their own beam.
    capToBeat: true,
    // Show rests so a beat with no hit (e.g. a hi-hat that doesn't land on
    // beat 1) is marked — the player can see where the downbeat lines up.
    showRests: true,
  };
}

/**
 * Render a cycle as one strip MEASURE PER PULSE when the cycle is mixed, so each
 * pulse uses its own tuplet grid and shows correct note values (a 5-pulse point
 * renders as a real quintuplet, not five mis-spelled sixteenths).  A uniform
 * cycle renders as a single full-bar measure (its grid already maps cleanly).
 */
export function cycleToStripMeasures(cycle: GrooveCycle, pointVoices: PointVoices[]): StripMeasureData[] {
  if (isUniform(cycle)) return [cycleToStripData(cycle, pointVoices)];
  const a = assembleCycle(cycle, pointVoices);
  const offs = a.pulseBoundaries;
  return cycle.points.map((p, i) => {
    const lo = offs[i], hi = lo + p.subPulses;
    const local = (xs: number[]) => xs.filter(x => x >= lo && x < hi).map(x => x - lo);
    return {
      grid: gridForResolution(p.subPulses) ?? "16th",
      ostinatoHits: local(a.hatHits), ostinatoOpen: local(a.hatOpenHits),
      snareHits: local(a.snareHits), bassHits: local(a.bassHits),
      hhFootHits: local(a.hhFootHits), hhFootOpen: [],
      ghostHits: local(a.ghostHits), ghostDoubleHits: local(a.ghostDoubleHits),
      snareDoubleHits: local(a.snareDoubleHits),
      accentFlags: a.accentFlags.slice(lo, hi),
      slotOverride: p.subPulses,
      capToBeat: true,
      showRests: true,
    } as StripMeasureData;
  });
}

/* ── Empty point ─────────────────────────────────────────────────────────── */
export function emptyPoint(): PointVoices { return {}; }
