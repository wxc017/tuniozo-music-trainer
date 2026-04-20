/**
 * transformData.ts — Pattern transformation engine
 *
 * Canonical pattern model + pure transform functions organized into 6 families:
 * Shift, Mirror, Metric, Density, Voicing, Phrase.
 *
 * Each transform: TransformPattern → TransformPattern[]
 */

import { GridType, GRID_SUBDIVS } from "./drumData";

// ── Metric annotation types ────────────────────────────────────────────────

export type NoteType = "quarter" | "eighth" | "dotted-quarter" | "dotted-eighth" | "sixteenth";

export interface MetricAnnotation {
  leftNote: NoteType;
  rightNote: NoteType;
  rightTuplet?: number; // 3, 5, 6, 7 — draws tuplet bracket over right note
  label: string;        // text fallback for dropdowns
}

// ── Canonical pattern model ────────────────────────────────────────────────

export interface TransformPattern {
  grid: GridType;
  totalSlots: number;
  beatSize: number;
  cymbalHits: number[];
  cymbalOpen: number[];
  snareHits: number[];
  bassHits: number[];
  hhFootHits: number[];
  ghostHits: number[];
  tomHits: number[];
  crashHits: number[];
  accentFlags: boolean[];
  stickings: string[];
  sourceTab: "ostinato" | "accent" | "stickings" | "independence";
  /** Rendered as SVG notation above the measure */
  metricAnnotation?: MetricAnnotation;
}

export type TransformFamily = "shift" | "mirror" | "metric" | "density" | "voicing" | "phrase";

export const FAMILY_LABELS: Record<TransformFamily, string> = {
  shift: "Shift",
  mirror: "Mirror",
  metric: "Metric",
  density: "Density",
  voicing: "Voicing",
  phrase: "Phrase",
};

export interface TransformParamDef {
  key: string;
  label: string;
  type: "number" | "select" | "boolean";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  default: any;
}

export interface TransformDef {
  id: string;
  name: string;
  family: TransformFamily;
  description: string;
  params: TransformParamDef[];
  apply: (p: TransformPattern, params: Record<string, any>) => TransformPattern[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function clone(p: TransformPattern): TransformPattern {
  return {
    ...p,
    cymbalHits: [...p.cymbalHits],
    cymbalOpen: [...p.cymbalOpen],
    snareHits: [...p.snareHits],
    bassHits: [...p.bassHits],
    hhFootHits: [...p.hhFootHits],
    ghostHits: [...p.ghostHits],
    tomHits: [...p.tomHits],
    crashHits: [...p.crashHits],
    accentFlags: [...p.accentFlags],
    stickings: [...p.stickings],
  };
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function shiftHits(hits: number[], amount: number, total: number): number[] {
  return hits.map(h => mod(h + amount, total)).sort((a, b) => a - b);
}

function shiftBools(arr: boolean[], amount: number): boolean[] {
  const n = arr.length;
  const out = new Array(n).fill(false);
  for (let i = 0; i < n; i++) out[mod(i + amount, n)] = arr[i];
  return out;
}

function shiftStrings(arr: string[], amount: number): string[] {
  const n = arr.length;
  const out = new Array(n).fill("");
  for (let i = 0; i < n; i++) out[mod(i + amount, n)] = arr[i];
  return out;
}

function reverseHits(hits: number[], total: number): number[] {
  return hits.map(h => total - 1 - h).sort((a, b) => a - b);
}

function reverseBools(arr: boolean[]): boolean[] {
  return [...arr].reverse();
}

function reverseStrings(arr: string[]): string[] {
  return [...arr].reverse();
}

function mirrorHitsPerBeat(hits: number[], beatSize: number, total: number): number[] {
  return hits.map(h => {
    const beat = Math.floor(h / beatSize);
    const pos = h % beatSize;
    return beat * beatSize + (beatSize - 1 - pos);
  }).sort((a, b) => a - b);
}

function mirrorBoolsPerBeat(arr: boolean[], beatSize: number): boolean[] {
  const out = new Array(arr.length).fill(false);
  for (let i = 0; i < arr.length; i++) {
    const beat = Math.floor(i / beatSize);
    const pos = i % beatSize;
    out[beat * beatSize + (beatSize - 1 - pos)] = arr[i];
  }
  return out;
}

function mirrorStringsPerBeat(arr: string[], beatSize: number): string[] {
  const out = new Array(arr.length).fill("");
  for (let i = 0; i < arr.length; i++) {
    const beat = Math.floor(i / beatSize);
    const pos = i % beatSize;
    out[beat * beatSize + (beatSize - 1 - pos)] = arr[i];
  }
  return out;
}

function reorderBeatsHits(hits: number[], beatSize: number, order: number[]): number[] {
  const out: number[] = [];
  for (let newBeat = 0; newBeat < order.length; newBeat++) {
    const srcBeat = order[newBeat];
    for (const h of hits) {
      const hBeat = Math.floor(h / beatSize);
      if (hBeat === srcBeat) {
        out.push(newBeat * beatSize + (h % beatSize));
      }
    }
  }
  return out.sort((a, b) => a - b);
}

function reorderBeatsBools(arr: boolean[], beatSize: number, order: number[]): boolean[] {
  const out = new Array(arr.length).fill(false);
  for (let newBeat = 0; newBeat < order.length; newBeat++) {
    const srcBeat = order[newBeat];
    for (let s = 0; s < beatSize; s++) {
      out[newBeat * beatSize + s] = arr[srcBeat * beatSize + s] ?? false;
    }
  }
  return out;
}

function reorderBeatsStrings(arr: string[], beatSize: number, order: number[]): string[] {
  const out = new Array(arr.length).fill("");
  for (let newBeat = 0; newBeat < order.length; newBeat++) {
    const srcBeat = order[newBeat];
    for (let s = 0; s < beatSize; s++) {
      out[newBeat * beatSize + s] = arr[srcBeat * beatSize + s] ?? "";
    }
  }
  return out;
}

/** Map hit positions from one beat size to another (proportional per-beat) */
function remapHits(hits: number[], fromBeatSize: number, toBeatSize: number, numBeats: number): number[] {
  // Group hits by beat, each with its ideal (fractional) target position
  const beatHits = new Map<number, { orig: number; ideal: number }[]>();
  for (const h of hits) {
    const beat = Math.floor(h / fromBeatSize);
    if (beat >= numBeats) continue;
    const pos = h % fromBeatSize;
    const ideal = (pos / fromBeatSize) * toBeatSize;
    if (!beatHits.has(beat)) beatHits.set(beat, []);
    beatHits.get(beat)!.push({ orig: h, ideal });
  }

  const out: number[] = [];
  // Resolve each beat independently so no hits are lost to collisions
  for (const [beat, entries] of beatHits) {
    // Sort by ideal position so nearest-first assignment is stable
    entries.sort((a, b) => a.ideal - b.ideal);
    const taken = new Set<number>();
    for (const e of entries) {
      let best = Math.min(Math.round(e.ideal), toBeatSize - 1);
      if (!taken.has(best)) {
        taken.add(best);
        out.push(beat * toBeatSize + best);
        continue;
      }
      // Collision: search outward for nearest free slot within the beat
      let found = false;
      for (let d = 1; d < toBeatSize; d++) {
        for (const candidate of [best - d, best + d]) {
          if (candidate >= 0 && candidate < toBeatSize && !taken.has(candidate)) {
            taken.add(candidate);
            out.push(beat * toBeatSize + candidate);
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
  }
  return out.sort((a, b) => a - b);
}

function remapBools(arr: boolean[], fromBeatSize: number, toBeatSize: number, numBeats: number): boolean[] {
  const newTotal = toBeatSize * numBeats;
  const out = new Array(newTotal).fill(false);
  for (let i = 0; i < arr.length; i++) {
    if (!arr[i]) continue;
    const beat = Math.floor(i / fromBeatSize);
    if (beat >= numBeats) continue;
    const pos = i % fromBeatSize;
    const newPos = Math.min(Math.round(pos / fromBeatSize * toBeatSize), toBeatSize - 1);
    out[beat * toBeatSize + newPos] = true;
  }
  return out;
}

function remapStrings(arr: string[], fromBeatSize: number, toBeatSize: number, numBeats: number): string[] {
  const newTotal = toBeatSize * numBeats;
  const out = new Array(newTotal).fill("");
  for (let i = 0; i < arr.length; i++) {
    if (!arr[i]) continue;
    const beat = Math.floor(i / fromBeatSize);
    if (beat >= numBeats) continue;
    const pos = i % fromBeatSize;
    const newPos = Math.min(Math.round(pos / fromBeatSize * toBeatSize), toBeatSize - 1);
    out[beat * toBeatSize + newPos] = arr[i];
  }
  return out;
}

type VoiceKey = "cymbal" | "snare" | "bass" | "hhFoot" | "ghost" | "tom" | "crash";

function getVoiceHits(p: TransformPattern, v: VoiceKey): number[] {
  const map: Record<VoiceKey, number[]> = {
    cymbal: p.cymbalHits, snare: p.snareHits, bass: p.bassHits,
    hhFoot: p.hhFootHits, ghost: p.ghostHits, tom: p.tomHits, crash: p.crashHits,
  };
  return map[v];
}

function setVoiceHits(p: TransformPattern, v: VoiceKey, hits: number[]): void {
  const map: Record<VoiceKey, keyof TransformPattern> = {
    cymbal: "cymbalHits", snare: "snareHits", bass: "bassHits",
    hhFoot: "hhFootHits", ghost: "ghostHits", tom: "tomHits", crash: "crashHits",
  };
  (p as any)[map[v]] = hits;
}

function allVoiceKeys(): VoiceKey[] {
  return ["cymbal", "snare", "bass", "hhFoot", "ghost", "tom", "crash"];
}

function applyToAllHits(p: TransformPattern, fn: (hits: number[]) => number[]): TransformPattern {
  const out = clone(p);
  for (const v of allVoiceKeys()) {
    setVoiceHits(out, v, fn(getVoiceHits(p, v)));
  }
  out.cymbalOpen = fn(p.cymbalOpen);
  return out;
}

// ── Transform implementations ──────────────────────────────────────────────

// --- SHIFT FAMILY ---

function tRotate(p: TransformPattern, params: Record<string, any>): TransformPattern[] {
  const slots = params.slots as number;
  const out = applyToAllHits(p, h => shiftHits(h, slots, p.totalSlots));
  out.accentFlags = shiftBools(p.accentFlags, slots);
  out.stickings = shiftStrings(p.stickings, slots);
  return [out];
}

function tOffset(p: TransformPattern, params: Record<string, any>): TransformPattern[] {
  const slots = params.slots as number;
  const out = applyToAllHits(p, h =>
    h.map(x => x + slots).filter(x => x >= 0 && x < p.totalSlots).sort((a, b) => a - b)
  );
  const newAcc = new Array(p.totalSlots).fill(false);
  const newStk = new Array(p.totalSlots).fill("");
  for (let i = 0; i < p.totalSlots; i++) {
    const src = i - slots;
    if (src >= 0 && src < p.totalSlots) {
      newAcc[i] = p.accentFlags[src] ?? false;
      newStk[i] = p.stickings[src] ?? "";
    }
  }
  out.accentFlags = newAcc;
  out.stickings = newStk;
  return [out];
}

function tReorderBeats(p: TransformPattern, params: Record<string, any>): TransformPattern[] {
  const orderStr = params.order as string;
  const order = orderStr.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));
  if (order.length !== 4) return [clone(p)];
  const out = applyToAllHits(p, h => reorderBeatsHits(h, p.beatSize, order));
  out.accentFlags = reorderBeatsBools(p.accentFlags, p.beatSize, order);
  out.stickings = reorderBeatsStrings(p.stickings, p.beatSize, order);
  return [out];
}

// --- MIRROR FAMILY ---

function tRetrograde(p: TransformPattern, params: Record<string, any>): TransformPattern[] {
  const scope = params.scope as string;
  if (scope === "beat") {
    const out = applyToAllHits(p, h => mirrorHitsPerBeat(h, p.beatSize, p.totalSlots));
    out.accentFlags = mirrorBoolsPerBeat(p.accentFlags, p.beatSize);
    out.stickings = mirrorStringsPerBeat(p.stickings, p.beatSize);
    return [out];
  }
  // Full measure retrograde
  const out = applyToAllHits(p, h => reverseHits(h, p.totalSlots));
  out.accentFlags = reverseBools(p.accentFlags);
  out.stickings = reverseStrings(p.stickings);
  return [out];
}

function tMirrorInBeat(p: TransformPattern): TransformPattern[] {
  const out = applyToAllHits(p, h => mirrorHitsPerBeat(h, p.beatSize, p.totalSlots));
  out.accentFlags = mirrorBoolsPerBeat(p.accentFlags, p.beatSize);
  out.stickings = mirrorStringsPerBeat(p.stickings, p.beatSize);
  return [out];
}

function tAccentInversion(p: TransformPattern): TransformPattern[] {
  const out = clone(p);
  // Swap accented snare hits ↔ ghost hits
  const accented = new Set<number>();
  const unaccented = new Set<number>();
  for (const h of p.snareHits) {
    if (p.accentFlags[h]) accented.add(h);
    else unaccented.add(h);
  }
  // Accents become ghosts, ghosts become accented snare
  out.snareHits = [...p.ghostHits, ...Array.from(unaccented)].sort((a, b) => a - b);
  out.ghostHits = [...Array.from(accented)].sort((a, b) => a - b);
  // Invert accent flags
  out.accentFlags = p.accentFlags.map(f => !f);
  return [out];
}

function tComplement(p: TransformPattern, params: Record<string, any>): TransformPattern[] {
  const voice = params.voice as VoiceKey;
  const out = clone(p);
  const current = new Set(getVoiceHits(p, voice));
  const complemented: number[] = [];
  for (let i = 0; i < p.totalSlots; i++) {
    if (!current.has(i)) complemented.push(i);
  }
  setVoiceHits(out, voice, complemented);

  // Resolve snare ↔ ghost conflicts: same instrument can't have both
  const compSet = new Set(complemented);
  if (voice === "snare") {
    out.ghostHits = out.ghostHits.filter(h => !compSet.has(h));
  } else if (voice === "ghost") {
    out.snareHits = out.snareHits.filter(h => !compSet.has(h));
  }

  // Update accent flags: clear accents at positions that lost their hit
  for (const h of current) {
    if (!compSet.has(h)) out.accentFlags[h] = false;
  }

  return [out];
}

// --- METRIC FAMILY ---

function gridForBeatSize(beatSize: number): GridType {
  for (const [grid, slots] of Object.entries(GRID_SUBDIVS)) {
    if (slots / 4 === beatSize) return grid as GridType;
  }
  return "16th";
}

function tStretch(p: TransformPattern, params: Record<string, any>): TransformPattern[] {
  const factor = params.factor as number;
  const newBeatSize = p.beatSize * factor;
  const newTotal = newBeatSize * 4;
  const newGrid = gridForBeatSize(newBeatSize);
  const out = applyToAllHits(p, h => h.map(x => {
    const beat = Math.floor(x / p.beatSize);
    const pos = x % p.beatSize;
    return beat * newBeatSize + pos * factor;
  }).sort((a, b) => a - b));
  out.grid = newGrid;
  out.totalSlots = newTotal;
  out.beatSize = newBeatSize;
  out.metricAnnotation = undefined;
  // Expand accentFlags and stickings
  const newAcc = new Array(newTotal).fill(false);
  const newStk = new Array(newTotal).fill("");
  for (let i = 0; i < p.totalSlots; i++) {
    const beat = Math.floor(i / p.beatSize);
    const pos = i % p.beatSize;
    const ni = beat * newBeatSize + pos * factor;
    if (ni < newTotal) {
      newAcc[ni] = p.accentFlags[i] ?? false;
      newStk[ni] = p.stickings[i] ?? "";
    }
  }
  out.accentFlags = newAcc;
  out.stickings = newStk;
  return [out];
}

function tCompress(p: TransformPattern, params: Record<string, any>): TransformPattern[] {
  const factor = params.factor as number;
  const newBeatSize = Math.max(1, Math.round(p.beatSize / factor));
  const newTotal = newBeatSize * 4;
  const newGrid = gridForBeatSize(newBeatSize);
  const out = applyToAllHits(p, h => remapHits(h, p.beatSize, newBeatSize, 4));
  out.grid = newGrid;
  out.totalSlots = newTotal;
  out.beatSize = newBeatSize;
  out.metricAnnotation = undefined;
  out.accentFlags = remapBools(p.accentFlags, p.beatSize, newBeatSize, 4);
  out.stickings = remapStrings(p.stickings, p.beatSize, newBeatSize, 4);
  return [out];
}

function tRegrid(p: TransformPattern, params: Record<string, any>): TransformPattern[] {
  const targetGrid = params.targetGrid as GridType;
  const newBeatSize = GRID_SUBDIVS[targetGrid] / 4;
  const newTotal = newBeatSize * 4;
  const out = applyToAllHits(p, h => remapHits(h, p.beatSize, newBeatSize, 4));
  out.grid = targetGrid;
  out.totalSlots = newTotal;
  out.beatSize = newBeatSize;
  out.accentFlags = remapBools(p.accentFlags, p.beatSize, newBeatSize, 4);
  out.stickings = remapStrings(p.stickings, p.beatSize, newBeatSize, 4);
  return [out];
}

/**
 * Metric modulation presets with structured rendering data.
 * Each side has a note type and optional tuplet bracket.
 * The UI renders these as actual SVG notation with tuplet brackets.
 */
export interface MetricModPreset {
  value: string;
  label: string;
  targetGrid: GridType;
  leftNote: NoteType;
  rightNote: NoteType;
  rightTuplet?: number;
}

export const METRIC_MOD_PRESETS: MetricModPreset[] = [
  // Triplet modulations
  { value: "q=q3",   label: "♩ = ♩(3)",   targetGrid: "triplet",    leftNote: "quarter", rightNote: "quarter",        rightTuplet: 3 },
  { value: "q=8t3",  label: "♩ = ♪(3)",   targetGrid: "triplet",    leftNote: "quarter", rightNote: "eighth",         rightTuplet: 3 },
  { value: "q=dq",   label: "♩ = ♩.",     targetGrid: "triplet",    leftNote: "quarter", rightNote: "dotted-quarter" },
  { value: "dq=q",   label: "♩. = ♩",     targetGrid: "triplet",    leftNote: "dotted-quarter", rightNote: "quarter" },
  // Quintuplet modulations
  { value: "q=q5",   label: "♩ = ♩(5)",   targetGrid: "quintuplet", leftNote: "quarter", rightNote: "quarter",        rightTuplet: 5 },
  { value: "q=85",   label: "♩ = ♪(5)",   targetGrid: "quintuplet", leftNote: "quarter", rightNote: "eighth",         rightTuplet: 5 },
  { value: "q=165",  label: "♩ = 𝅘𝅥𝅯(5)", targetGrid: "quintuplet", leftNote: "quarter", rightNote: "sixteenth",      rightTuplet: 5 },
  // Sextuplet modulations
  { value: "q=q6",   label: "♩ = ♩(6)",   targetGrid: "sextuplet",  leftNote: "quarter", rightNote: "quarter",        rightTuplet: 6 },
  { value: "q=86",   label: "♩ = ♪(6)",   targetGrid: "sextuplet",  leftNote: "quarter", rightNote: "eighth",         rightTuplet: 6 },
  // Septuplet modulations
  { value: "q=q7",   label: "♩ = ♩(7)",   targetGrid: "septuplet",  leftNote: "quarter", rightNote: "quarter",        rightTuplet: 7 },
  { value: "q=87",   label: "♩ = ♪(7)",   targetGrid: "septuplet",  leftNote: "quarter", rightNote: "eighth",         rightTuplet: 7 },
  { value: "q=167",  label: "♩ = 𝅘𝅥𝅯(7)", targetGrid: "septuplet",  leftNote: "quarter", rightNote: "sixteenth",      rightTuplet: 7 },
  // Standard grid changes
  { value: "q=8th",  label: "halftime",   targetGrid: "8th",        leftNote: "quarter", rightNote: "eighth" },
  { value: "q=16th", label: "standard",   targetGrid: "16th",       leftNote: "quarter", rightNote: "sixteenth" },
];

function tMetricModulate(p: TransformPattern, params: Record<string, any>): TransformPattern[] {
  const preset = METRIC_MOD_PRESETS.find(m => m.value === params.preset);
  if (!preset) return [clone(p)];
  const result = tRegrid(p, { targetGrid: preset.targetGrid })[0];
  result.metricAnnotation = {
    leftNote: preset.leftNote,
    rightNote: preset.rightNote,
    rightTuplet: preset.rightTuplet,
    label: preset.label,
  };
  return [result];
}

// --- DENSITY FAMILY ---

function tDensify(p: TransformPattern, params: Record<string, any>): TransformPattern[] {
  const voice = params.voice as VoiceKey;
  const rule = params.rule as string;
  const out = clone(p);
  const current = new Set(getVoiceHits(p, voice));
  const allOccupied = new Set([...p.cymbalHits, ...p.snareHits, ...p.bassHits, ...p.hhFootHits, ...p.ghostHits]);
  const candidates: number[] = [];

  for (let i = 0; i < p.totalSlots; i++) {
    if (!current.has(i)) {
      if (rule === "fill-empty" || !allOccupied.has(i)) {
        candidates.push(i);
      }
    }
  }

  if (rule === "fill-offbeats") {
    // Add hits on offbeat positions
    const added = candidates.filter(c => c % p.beatSize !== 0);
    if (added.length > 0) {
      const pick = added[Math.floor(Math.random() * added.length)];
      setVoiceHits(out, voice, [...getVoiceHits(out, voice), pick].sort((a, b) => a - b));
    }
  } else {
    // Fill nearest empty slot to an existing hit
    if (candidates.length > 0 && current.size > 0) {
      let bestSlot = candidates[0];
      let bestDist = Infinity;
      for (const c of candidates) {
        for (const h of current) {
          const d = Math.abs(c - h);
          if (d < bestDist && d > 0) { bestDist = d; bestSlot = c; }
        }
      }
      setVoiceHits(out, voice, [...getVoiceHits(out, voice), bestSlot].sort((a, b) => a - b));
    }
  }
  return [out];
}

function tReduce(p: TransformPattern, params: Record<string, any>): TransformPattern[] {
  const voice = params.voice as VoiceKey;
  const rule = params.rule as string;
  const out = clone(p);
  const hits = [...getVoiceHits(p, voice)];
  if (hits.length <= 1) return [out];

  if (rule === "remove-offbeats") {
    // Remove first offbeat hit found
    const offbeat = hits.find(h => h % p.beatSize !== 0);
    if (offbeat !== undefined) {
      setVoiceHits(out, voice, hits.filter(h => h !== offbeat));
    }
  } else if (rule === "keep-accents") {
    // Remove non-accented hits
    setVoiceHits(out, voice, hits.filter(h => p.accentFlags[h]));
  } else {
    // Remove weakest: last non-downbeat hit
    const removable = hits.filter(h => h % p.beatSize !== 0);
    if (removable.length > 0) {
      const toRemove = removable[removable.length - 1];
      setVoiceHits(out, voice, hits.filter(h => h !== toRemove));
    } else {
      // All on downbeats — remove last one
      setVoiceHits(out, voice, hits.slice(0, -1));
    }
  }
  return [out];
}

function tOrnamentExpand(p: TransformPattern, params: Record<string, any>): TransformPattern[] {
  // This is a metadata-only transform — the notation renderer handles flam/double/buzz
  // We mark it on the accent interpretation field, but since TransformPattern doesn't have
  // interpretation fields, we add ghost notes as flam grace notes
  const type = params.type as string;
  const out = clone(p);
  if (type === "flam") {
    // Add ghost notes one slot before each snare hit (as flam grace notes)
    const newGhosts: number[] = [...p.ghostHits];
    for (const h of p.snareHits) {
      const grace = h - 1;
      if (grace >= 0 && !new Set(p.snareHits).has(grace) && !new Set(newGhosts).has(grace)) {
        newGhosts.push(grace);
      }
    }
    out.ghostHits = newGhosts.sort((a, b) => a - b);
  }
  return [out];
}

function tOrnamentReduce(p: TransformPattern): TransformPattern[] {
  const out = clone(p);
  // Remove all ghost notes that are adjacent (grace notes / flams)
  const snrSet = new Set(p.snareHits);
  out.ghostHits = p.ghostHits.filter(g => {
    // Keep only ghosts that aren't flam grace notes
    return !snrSet.has(g + 1) && !snrSet.has(g - 1);
  });
  return [out];
}

// --- VOICING FAMILY ---

function tLimbRemap(p: TransformPattern, params: Record<string, any>): TransformPattern[] {
  const from = params.from as VoiceKey;
  const to = params.to as VoiceKey;
  if (from === to) return [clone(p)];
  const out = clone(p);
  const fromHits = getVoiceHits(p, from);
  const toHits = getVoiceHits(p, to);
  setVoiceHits(out, from, [...toHits]);
  setVoiceHits(out, to, [...fromHits]);
  return [out];
}

function tVoiceIsolate(p: TransformPattern, params: Record<string, any>): TransformPattern[] {
  const voice = params.voice as VoiceKey;
  const out = clone(p);
  for (const v of allVoiceKeys()) {
    if (v !== voice) setVoiceHits(out, v, []);
  }
  out.cymbalOpen = [];
  return [out];
}

function tVoiceMerge(p: TransformPattern, params: Record<string, any>): TransformPattern[] {
  const from = params.from as VoiceKey;
  const into = params.into as VoiceKey;
  if (from === into) return [clone(p)];
  const out = clone(p);
  const merged = new Set([...getVoiceHits(p, into), ...getVoiceHits(p, from)]);
  setVoiceHits(out, into, [...merged].sort((a, b) => a - b));
  setVoiceHits(out, from, []);
  return [out];
}

// --- PHRASE FAMILY ---

function tRepeatTransform(p: TransformPattern, params: Record<string, any>): TransformPattern[] {
  const transformId = params.transform as string;
  const count = params.count as number;
  const td = ALL_TRANSFORMS.find(t => t.id === transformId);
  if (!td) return [clone(p)];
  const results: TransformPattern[] = [clone(p)];
  let current = clone(p);
  for (let i = 1; i < count; i++) {
    const next = td.apply(current, params)[0];
    results.push(next);
    current = clone(next);
  }
  return results;
}

function tCallResponse(p: TransformPattern, params: Record<string, any>): TransformPattern[] {
  const transformId = params.transform as string;
  const td = ALL_TRANSFORMS.find(t => t.id === transformId);
  if (!td) return [clone(p), clone(p)];
  const response = td.apply(p, params)[0];
  return [clone(p), response];
}

function tFamilyGenerate(p: TransformPattern): TransformPattern[] {
  const results: TransformPattern[] = [clone(p)];
  // Generate common variants
  results.push(tRetrograde(p, { scope: "measure" })[0]);
  results.push(tMirrorInBeat(p)[0]);
  results.push(tRotate(p, { slots: p.beatSize })[0]);
  results.push(tAccentInversion(p)[0]);
  if (p.snareHits.length > 0 && p.bassHits.length > 0) {
    results.push(tLimbRemap(p, { from: "snare", to: "bass" })[0]);
  }
  return results;
}

// ── Voice options for param dropdowns ──────────────────────────────────────

const VOICE_OPTIONS = [
  { value: "cymbal", label: "Cymbal" },
  { value: "snare", label: "Snare" },
  { value: "bass", label: "Bass" },
  { value: "hhFoot", label: "HH Foot" },
  { value: "ghost", label: "Ghost" },
];

const COMPOSABLE_TRANSFORMS = [
  { value: "rotate-right", label: "Rotate +1" },
  { value: "rotate-beat", label: "Rotate +1 beat" },
  { value: "retrograde", label: "Retrograde" },
  { value: "mirror-beat", label: "Mirror in beat" },
  { value: "accent-inv", label: "Accent inversion" },
];

// ── Transform registry ─────────────────────────────────────────────────────

export const ALL_TRANSFORMS: TransformDef[] = [
  // SHIFT
  {
    id: "rotate", name: "Rotate", family: "shift",
    description: "Cyclic shift all voices by N slots",
    params: [{ key: "slots", label: "Slots", type: "number", min: -16, max: 16, step: 1, default: 1 }],
    apply: tRotate,
  },
  {
    id: "offset", name: "Offset", family: "shift",
    description: "Shift forward/back without wrapping (clips at edges)",
    params: [{ key: "slots", label: "Slots", type: "number", min: -16, max: 16, step: 1, default: 1 }],
    apply: tOffset,
  },
  {
    id: "reorder-beats", name: "Reorder Beats", family: "shift",
    description: "Rearrange beat order (e.g. 2,0,3,1)",
    params: [{ key: "order", label: "Beat order", type: "select", options: [
      { value: "2,0,3,1", label: "3-1-4-2" },
      { value: "1,0,3,2", label: "2-1-4-3" },
      { value: "2,3,0,1", label: "3-4-1-2" },
      { value: "3,2,1,0", label: "4-3-2-1" },
      { value: "1,2,3,0", label: "2-3-4-1" },
      { value: "3,0,1,2", label: "4-1-2-3" },
    ], default: "2,0,3,1" }],
    apply: tReorderBeats,
  },

  // MIRROR
  {
    id: "retrograde", name: "Retrograde", family: "mirror",
    description: "Reverse time order of all events",
    params: [{ key: "scope", label: "Scope", type: "select", options: [
      { value: "measure", label: "Full measure" },
      { value: "beat", label: "Per beat" },
    ], default: "measure" }],
    apply: tRetrograde,
  },
  {
    id: "mirror-beat", name: "Mirror In Beat", family: "mirror",
    description: "Mirror hit positions within each beat",
    params: [],
    apply: (p) => tMirrorInBeat(p),
  },
  {
    id: "accent-inv", name: "Accent Inversion", family: "mirror",
    description: "Swap accented snare hits with ghost notes",
    params: [],
    apply: (p) => tAccentInversion(p),
  },
  {
    id: "complement", name: "Complement", family: "mirror",
    description: "Replace hits with rests and rests with hits for one voice",
    params: [{ key: "voice", label: "Voice", type: "select", options: VOICE_OPTIONS, default: "snare" }],
    apply: tComplement,
  },

  // METRIC
  {
    id: "stretch", name: "Stretch (x2)", family: "metric",
    description: "Double all durations — pattern fills 2x the time",
    params: [{ key: "factor", label: "Factor", type: "select", options: [
      { value: "2", label: "x2" }, { value: "3", label: "x3" },
    ], default: "2" }],
    apply: (p, params) => tStretch(p, { factor: parseInt(params.factor) }),
  },
  {
    id: "compress", name: "Compress (/2)", family: "metric",
    description: "Halve all durations — pattern fills half the time",
    params: [{ key: "factor", label: "Factor", type: "select", options: [
      { value: "2", label: "/2" }, { value: "3", label: "/3" },
    ], default: "2" }],
    apply: (p, params) => tCompress(p, { factor: parseInt(params.factor) }),
  },
  {
    id: "regrid", name: "Re-Grid", family: "metric",
    description: "Map pattern proportionally to a different subdivision",
    params: [{ key: "targetGrid", label: "Target grid", type: "select", options: [
      { value: "8th", label: "8th" },
      { value: "16th", label: "16th" },
      { value: "triplet", label: "Triplet" },
      { value: "quintuplet", label: "Quintuplet" },
      { value: "sextuplet", label: "Sextuplet" },
      { value: "septuplet", label: "Septuplet" },
      { value: "32nd", label: "32nd" },
    ], default: "triplet" }],
    apply: tRegrid,
  },
  {
    id: "metric-mod", name: "Metric Modulation", family: "metric",
    description: "Re-grid with quarter-note equivalence notation (♩ = X)",
    params: [{ key: "preset", label: "Modulation", type: "select",
      options: METRIC_MOD_PRESETS.map(m => ({ value: m.value, label: m.label })),
      default: "q=q3",
    }],
    apply: tMetricModulate,
  },

  // DENSITY
  {
    id: "densify", name: "Densify", family: "density",
    description: "Add one hit to a voice at the best available position",
    params: [
      { key: "voice", label: "Voice", type: "select", options: VOICE_OPTIONS, default: "snare" },
      { key: "rule", label: "Rule", type: "select", options: [
        { value: "fill-nearest", label: "Fill nearest" },
        { value: "fill-offbeats", label: "Fill offbeats" },
        { value: "fill-empty", label: "Fill any empty" },
      ], default: "fill-nearest" },
    ],
    apply: tDensify,
  },
  {
    id: "reduce", name: "Reduce", family: "density",
    description: "Remove one hit from a voice",
    params: [
      { key: "voice", label: "Voice", type: "select", options: VOICE_OPTIONS, default: "snare" },
      { key: "rule", label: "Rule", type: "select", options: [
        { value: "remove-weakest", label: "Remove weakest" },
        { value: "remove-offbeats", label: "Remove offbeat" },
        { value: "keep-accents", label: "Keep accents only" },
      ], default: "remove-weakest" },
    ],
    apply: tReduce,
  },
  {
    id: "ornament-expand", name: "Ornament Expand", family: "density",
    description: "Add grace notes (flams) before snare hits",
    params: [{ key: "type", label: "Type", type: "select", options: [
      { value: "flam", label: "Flam" },
    ], default: "flam" }],
    apply: tOrnamentExpand,
  },
  {
    id: "ornament-reduce", name: "Ornament Reduce", family: "density",
    description: "Remove grace/flam notes adjacent to snare hits",
    params: [],
    apply: (p) => tOrnamentReduce(p),
  },

  // VOICING
  {
    id: "limb-remap", name: "Limb Swap", family: "voicing",
    description: "Swap two voices (e.g. snare ↔ bass)",
    params: [
      { key: "from", label: "Voice A", type: "select", options: VOICE_OPTIONS, default: "snare" },
      { key: "to", label: "Voice B", type: "select", options: VOICE_OPTIONS, default: "bass" },
    ],
    apply: tLimbRemap,
  },
  {
    id: "voice-isolate", name: "Voice Isolate", family: "voicing",
    description: "Extract one voice, silence all others",
    params: [{ key: "voice", label: "Voice", type: "select", options: VOICE_OPTIONS, default: "snare" }],
    apply: tVoiceIsolate,
  },
  {
    id: "voice-merge", name: "Voice Merge", family: "voicing",
    description: "Merge one voice into another",
    params: [
      { key: "from", label: "From", type: "select", options: VOICE_OPTIONS, default: "ghost" },
      { key: "into", label: "Into", type: "select", options: VOICE_OPTIONS, default: "snare" },
    ],
    apply: tVoiceMerge,
  },

  // PHRASE
  {
    id: "repeat-transform", name: "Repeat + Transform", family: "phrase",
    description: "Repeat N times, applying a transform each repetition",
    params: [
      { key: "transform", label: "Transform", type: "select", options: COMPOSABLE_TRANSFORMS, default: "rotate-right" },
      { key: "count", label: "Repetitions", type: "number", min: 2, max: 8, step: 1, default: 4 },
    ],
    apply: (p, params) => {
      const tid = params.transform as string;
      const count = params.count as number;
      const results: TransformPattern[] = [clone(p)];
      let current = clone(p);
      for (let i = 1; i < count; i++) {
        let next: TransformPattern;
        if (tid === "rotate-right") next = tRotate(current, { slots: 1 })[0];
        else if (tid === "rotate-beat") next = tRotate(current, { slots: p.beatSize })[0];
        else if (tid === "retrograde") next = tRetrograde(current, { scope: "measure" })[0];
        else if (tid === "mirror-beat") next = tMirrorInBeat(current)[0];
        else if (tid === "accent-inv") next = tAccentInversion(current)[0];
        else next = clone(current);
        results.push(next);
        current = clone(next);
      }
      return results;
    },
  },
  {
    id: "call-response", name: "Call & Response", family: "phrase",
    description: "Original measure followed by transformed version",
    params: [
      { key: "transform", label: "Response transform", type: "select", options: COMPOSABLE_TRANSFORMS, default: "retrograde" },
    ],
    apply: (p, params) => {
      const tid = params.transform as string;
      let response: TransformPattern;
      if (tid === "rotate-right") response = tRotate(p, { slots: 1 })[0];
      else if (tid === "rotate-beat") response = tRotate(p, { slots: p.beatSize })[0];
      else if (tid === "retrograde") response = tRetrograde(p, { scope: "measure" })[0];
      else if (tid === "mirror-beat") response = tMirrorInBeat(p)[0];
      else if (tid === "accent-inv") response = tAccentInversion(p)[0];
      else response = clone(p);
      return [clone(p), response];
    },
  },
  {
    id: "family-generate", name: "Generate Family", family: "phrase",
    description: "Generate a set of common variants (retrograde, mirror, rotate, swap, invert)",
    params: [],
    apply: (p) => tFamilyGenerate(p),
  },
];

export function getTransformsByFamily(): Record<TransformFamily, TransformDef[]> {
  const result: Record<TransformFamily, TransformDef[]> = {
    shift: [], mirror: [], metric: [], density: [], voicing: [], phrase: [],
  };
  for (const t of ALL_TRANSFORMS) result[t.family].push(t);
  return result;
}
