// ── Types ──────────────────────────────────────────────────────────────────

import { localToday } from "@/lib/storage";

export type GridType = "8th" | "16th" | "triplet" | "quintuplet" | "sextuplet" | "septuplet" | "32nd";

export const GRID_SUBDIVS: Record<GridType, number> = {
  "8th":        8,
  "16th":       16,
  "triplet":    12,
  "quintuplet": 20,   // 5 slots per beat × 4 beats
  "sextuplet":  24,   // 6 slots per beat × 4 beats
  "septuplet":  28,   // 7 slots per beat × 4 beats
  "32nd":       32,   // 8 slots per beat × 4 beats
};

export const GRID_LABELS: Record<GridType, string[]> = {
  "8th":     ["1","+","2","+","3","+","4","+"],
  "16th":    ["1","e","+","a","2","e","+","a","3","e","+","a","4","e","+","a"],
  "triplet": ["1","t","a","2","t","a","3","t","a","4","t","a"],
  "quintuplet": [
    "1","2","3","4","5", "1","2","3","4","5",
    "1","2","3","4","5", "1","2","3","4","5",
  ],
  "sextuplet": [
    "1","2","3","4","5","6", "1","2","3","4","5","6",
    "1","2","3","4","5","6", "1","2","3","4","5","6",
  ],
  "septuplet": [
    "1","2","3","4","5","6","7", "1","2","3","4","5","6","7",
    "1","2","3","4","5","6","7", "1","2","3","4","5","6","7",
  ],
  "32nd": [
    "1","&","e","&","+","&","a","&",
    "2","&","e","&","+","&","a","&",
    "3","&","e","&","+","&","a","&",
    "4","&","e","&","+","&","a","&",
  ],
};

export const BEAT_POSITIONS: Record<GridType, number[]> = {
  "8th":        [0, 2, 4, 6],
  "16th":       [0, 4, 8, 12],
  "triplet":    [0, 3, 6, 9],
  "quintuplet": [0, 5, 10, 15],
  "sextuplet":  [0, 6, 12, 18],
  "septuplet":  [0, 7, 14, 21],
  "32nd":       [0, 8, 16, 24],
};

export const BEAT_SLOT_LABELS: Record<GridType, string[]> = {
  "8th":        ["1", "+"],
  "16th":       ["1", "e", "+", "a"],
  "triplet":    ["1", "t", "a"],
  "quintuplet": ["1", "2", "3", "4", "5"],
  "sextuplet":  ["1", "2", "3", "4", "5", "6"],
  "septuplet":  ["1", "2", "3", "4", "5", "6", "7"],
  "32nd":       ["1", "&", "e", "&", "+", "&", "a", "&"],
};

// ── Hi-Hat Ostinato ────────────────────────────────────────────────────────

export interface Ostinato {
  id: string;
  name: string;
  family: number;     // hit-density group: 1=sparse … 4=dense
  hits16: number[];
  open16: number[];
  hits8: number[];
  open8: number[];
  hits12: number[];   // triplet grid (12 subdivisions)
  open12: number[];
}

export const OSTINATO_LIBRARY: Ostinato[] = [
  {
    id: "o1",  family: 1,
    name: "1 – Quarter notes",
    hits16: [0, 4, 8, 12],     open16: [],
    hits8:  [0, 2, 4, 6],      open8: [],
    hits12: [0, 3, 6, 9],      open12: [],
  },
  {
    id: "o2",  family: 2,
    name: "2 – 8ths: open on &s",
    hits16: [0,2,4,6,8,10,12,14],   open16: [2,6,10,14],
    hits8:  [0,1,2,3,4,5,6,7],     open8: [1,3,5,7],
    hits12: [0,1,2,3,4,5,6,7,8,9,10,11], open12: [1,4,7,10],
  },
  {
    id: "o3",  family: 2,
    name: "3 – 8ths: open on +2 +4",
    hits16: [0,2,4,6,8,10,12,14],   open16: [6,14],
    hits8:  [0,1,2,3,4,5,6,7],     open8: [3,7],
    hits12: [0,1,2,3,4,5,6,7,8,9,10,11], open12: [5,11],
  },
  {
    id: "o4",  family: 1,
    name: "4 – Offbeat 8ths (& only)",
    hits16: [2,6,10,14],   open16: [],
    hits8:  [1,3,5,7],     open8: [],
    hits12: [1,4,7,10],    open12: [],
  },
  {
    id: "o5",  family: 4,
    name: "5 – 16th notes (straight)",
    hits16: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], open16: [],
    hits8:  [0,1,2,3,4,5,6,7],                        open8: [],
    hits12: [0,1,2,3,4,5,6,7,8,9,10,11],              open12: [],
  },
  {
    id: "o6",  family: 4,
    name: "6 – 16ths: open on &s",
    hits16: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], open16: [2,6,10,14],
    hits8:  [0,1,2,3,4,5,6,7],                        open8: [1,3,5,7],
    hits12: [0,1,2,3,4,5,6,7,8,9,10,11],              open12: [1,4,7,10],
  },
  {
    id: "o7",  family: 4,
    name: "7 – 16ths: open on beats",
    hits16: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], open16: [0,4,8,12],
    hits8:  [0,1,2,3,4,5,6,7],                        open8: [0,2,4,6],
    hits12: [0,1,2,3,4,5,6,7,8,9,10,11],              open12: [0,3,6,9],
  },
  {
    id: "o8",  family: 3,
    name: "8 – 8ths + 16ths (halves)",
    hits16: [0,2,4,5,6,8,10,12,13,14], open16: [6,14],
    hits8:  [0,1,2,3,4,5,6,7],          open8: [3,7],
    hits12: [0,2,3,5,6,8,9,11],        open12: [2,5,8,11],
  },
  {
    id: "o9",  family: 3,
    name: "9 – 8th + 16th triplet feel",
    hits16: [0,2,3,4,6,7,8,10,11,12,14,15], open16: [],
    hits8:  [0,1,2,3,4,5,6,7],              open8: [],
    hits12: [0,1,2,3,4,5,6,7,8,9,10,11],   open12: [],
  },
  {
    id: "o10", family: 2,
    name: "10 – Offbeat 8ths + 16ths",
    hits16: [2,4,5,6,10,12,13,14], open16: [6,14],
    hits8:  [1,2,3,5,6,7],          open8: [3,7],
    hits12: [1,2,4,5,7,8,10,11],   open12: [2,5,8,11],
  },
  {
    id: "o11", family: 4,
    name: "11 – 16ths: open on e+a",
    hits16: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], open16: [1,3,5,7,9,11,13,15],
    hits8:  [0,1,2,3,4,5,6,7],                        open8: [1,3,5,7],
    hits12: [0,1,2,3,4,5,6,7,8,9,10,11],              open12: [1,2,4,5,7,8,10,11],
  },
  {
    id: "o12", family: 4,
    name: "12 – 16ths: open on e positions",
    hits16: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], open16: [1,5,9,13],
    hits8:  [0,1,2,3,4,5,6,7],                        open8: [1,3,5,7],
    hits12: [0,1,2,3,4,5,6,7,8,9,10,11],              open12: [1,4,7,10],
  },
  {
    id: "o13", family: 2,
    name: "13 – 8th: open + closed alternating",
    hits16: [0,2,4,6,8,10,12,14], open16: [0,4,8,12],
    hits8:  [0,1,2,3,4,5,6,7],   open8: [0,2,4,6],
    hits12: [0,1,2,3,4,5,6,7,8,9,10,11], open12: [0,3,6,9],
  },
  {
    id: "o14", family: 2,
    name: "14 – Offbeat 8ths + 16th pairs",
    hits16: [2,4,6,10,12,14], open16: [6,14],
    hits8:  [1,2,3,5,6,7],   open8: [3,7],
    hits12: [1,2,4,5,7,8,10,11], open12: [2,8],
  },
  {
    id: "o15", family: 4,
    name: "15 – 16ths: open on a positions",
    hits16: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], open16: [3,7,11,15],
    hits8:  [0,1,2,3,4,5,6,7],                        open8: [1,3,5,7],
    hits12: [0,1,2,3,4,5,6,7,8,9,10,11],              open12: [2,5,8,11],
  },
];

// Scale 16-slot hit indices to a target slot count (for quintuplet/septuplet)
function scaleHits(hits16: number[], targetSlots: number): number[] {
  const seen = new Set<number>();
  return hits16
    .map(h => Math.round(h * targetSlots / 16))
    .filter(h => { if (h >= targetSlots || seen.has(h)) return false; seen.add(h); return true; })
    .sort((a, b) => a - b);
}

export function ostinatoHits(o: Ostinato, grid: GridType): number[] {
  if (grid === "triplet")    return o.hits12;
  if (grid === "quintuplet") return scaleHits(o.hits16, 20);
  if (grid === "septuplet")  return scaleHits(o.hits16, 28);
  if (grid === "32nd")       return scaleHits(o.hits16, 32);
  return grid === "16th" ? o.hits16 : o.hits8;
}

export function ostinatoOpen(o: Ostinato, grid: GridType): number[] {
  if (grid === "triplet")    return o.open12;
  if (grid === "quintuplet") return scaleHits(o.open16, 20);
  if (grid === "septuplet")  return scaleHits(o.open16, 28);
  if (grid === "32nd")       return scaleHits(o.open16, 32);
  return grid === "16th" ? o.open16 : o.open8;
}

// ── Permutations — one beat only, all C(beatSize,k) combinations ──────────
//
// Family N = N notes per beat.  All combinations auto-generated.
// ID format:  "${family}-${slots.join("")}"  e.g. "1-0", "2-02", "4-0123"
// Triplet:    beatSize=3 → IDs like "1-0","1-1","1-2","2-01","3-012" etc.

export interface Permutation {
  id: string;
  family: number;
  label: string;
  beatSlots: number[];
}

function combinations(n: number, k: number): number[][] {
  const result: number[][] = [];
  function pick(start: number, chosen: number[]) {
    if (chosen.length === k) { result.push([...chosen]); return; }
    for (let i = start; i < n; i++) pick(i + 1, [...chosen, i]);
  }
  pick(0, []);
  return result;
}

export function getPerms(grid: GridType): Permutation[] {
  const beatSize = GRID_SUBDIVS[grid] / 4;
  const labels   = BEAT_SLOT_LABELS[grid];
  const result: Permutation[] = [];
  for (let k = 1; k <= beatSize; k++) {
    for (const slots of combinations(beatSize, k)) {
      result.push({
        id:        `${k}-${slots.join("")}`,
        family:    k,
        beatSlots: slots,
        label:     slots.map(s => labels[s]).join(" "),
      });
    }
  }
  return result;
}

export function permHits(p: Permutation, grid: GridType): number[] {
  const beatSize = GRID_SUBDIVS[grid] / 4;
  return Array.from({ length: 4 }, (_, b) =>
    p.beatSlots.map(s => s + b * beatSize)
  ).flat().sort((a, b) => a - b);
}

// ── Measure & Exercise ────────────────────────────────────────────────────

// Per beat-slot modifier: cycles none → ghost → double → open
export type SlotMod = "none" | "ghost" | "double" | "open";

export interface DrumMeasure {
  snarePermId: string;
  snarePermPool?: string[];      // snare perm pool for generation
  bassPermId: string;
  bassPermPool?: string[];       // bass perm pool for generation
  hhClosedPermId?: string;       // ostinato/cymbal perm id (voice O) — single (legacy)
  hhClosedPermIds?: string[];    // ostinato perm pool for generation
  hhOpenPermId?: string;         // HH foot perm id (voice HH)
  hhOpenPermPool?: string[];     // HH foot perm pool for generation
  ostinatoOpenPermId?: string;    // ostinato open-hat perm id (single, legacy)
  ostinatoOpenPermIds?: string[]; // ostinato open multi-select perm ids
  ostinatoOpenSlots?: boolean[];  // length=beatSize; true = that beat-slot is open in ostinato
  ostinatoDoubleSlots?: boolean[]; // length=beatSize; true = that ostinato slot is a double stroke
  hhFootOpenSlots?: boolean[];    // length=beatSize; true = that beat-slot is open in HH foot
  hhFootDoubleSlots?: boolean[];  // length=beatSize; true = that HH foot slot is a double stroke
  ghostPermId?: string;           // ghost note perm id (single, legacy)
  ghostPermIds?: string[];        // ghost note multi-select perm ids
  ghostDoublePermId?: string;     // ghost double-stroke perm id (single, legacy)
  ghostDoublePermIds?: string[];  // ghost double-stroke multi-select perm ids
  ghostDoubleSlots?: boolean[];   // length=beatSize; true = that ghost slot is a double stroke
  snareDoubleSlots?: boolean[];   // length=beatSize; true = that snare slot is a double stroke
  bassDoubleSlots?: boolean[];    // length=beatSize; true = that bass slot is a double stroke
  slotMods?: SlotMod[];           // snare modifiers: ghost/double per beat-slot (legacy)
  ghostSlots?: number[];          // legacy — kept for backward compat
  doubleSlots?: number[];         // legacy
  customSnareHits?: number[];
  customBassHits?: number[];
  paradiddlePool?: string[];      // linked paradiddle labels — each permuted as an atomic unit (sets O+S+B together)
  rotationLocked?: boolean;       // when true, rotation engine skips this measure
  accentSlots?: boolean[];        // length = total subdivisions (e.g. 16 for 16th grid); true = accent at that slot
}

export interface DrumExercise {
  id: string;
  name: string;
  date: string;
  grid: GridType;
  ostinatoId: string;
  measureCount: number;
  measures: DrumMeasure[];
  rating: number;
}

export function defaultMeasure(): DrumMeasure {
  return {
    snarePermId: "1-0",
    bassPermId:  "1-0",
    ghostSlots:  [],
    doubleSlots: [],
  };
}

export function defaultExercise(measureCount = 4): DrumExercise {
  return {
    id:           Date.now().toString(),
    name:         "",
    date:         localToday(),
    grid:         "16th",
    ostinatoId:   "o1",
    measureCount,
    measures:     Array.from({ length: measureCount }, defaultMeasure),
    rating:       0,
  };
}

// ── Resolve actual hits for a measure ─────────────────────────────────────

export function resolveSnareHits(m: DrumMeasure, grid: GridType): number[] {
  if (m.customSnareHits !== undefined) return m.customSnareHits;
  const p = getPerms(grid).find(q => q.id === m.snarePermId);
  return p ? permHits(p, grid) : [];
}

export function resolveBassHits(m: DrumMeasure, grid: GridType): number[] {
  if (m.customBassHits !== undefined) return m.customBassHits;
  const p = getPerms(grid).find(q => q.id === m.bassPermId);
  return p ? permHits(p, grid) : [];
}

export function resolveGhostHits(m: DrumMeasure, grid: GridType): number[] {
  const p = getPerms(grid).find(q => q.id === m.ghostPermId);
  return p ? permHits(p, grid) : [];
}

export function resolveHHClosedHits(
  m: DrumMeasure,
  ost: Ostinato,
  grid: GridType,
): number[] {
  if (m.hhClosedPermId !== undefined) {
    const p = getPerms(grid).find(q => q.id === m.hhClosedPermId);
    return p ? permHits(p, grid) : [];
  }
  return ostinatoHits(ost, grid);
}

export function resolveHHOpenHits(
  m: DrumMeasure,
  ost: Ostinato,
  grid: GridType,
): number[] {
  if (m.hhOpenPermId !== undefined) {
    const p = getPerms(grid).find(q => q.id === m.hhOpenPermId);
    return p ? permHits(p, grid) : [];
  }
  return ostinatoOpen(ost, grid);
}

// ── Storage ────────────────────────────────────────────────────────────────

const LS_KEY = "lt_drum_log";

export function loadDrumLog(): DrumExercise[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveExercise(ex: DrumExercise): DrumExercise[] {
  const log = loadDrumLog();
  const idx = log.findIndex(e => e.id === ex.id);
  if (idx >= 0) log[idx] = ex;
  else log.unshift(ex);
  localStorage.setItem(LS_KEY, JSON.stringify(log));
  return log;
}

export function deleteExercise(id: string): DrumExercise[] {
  const log = loadDrumLog().filter(e => e.id !== id);
  localStorage.setItem(LS_KEY, JSON.stringify(log));
  return log;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function getOstinato(id: string): Ostinato {
  return OSTINATO_LIBRARY.find(o => o.id === id) ?? OSTINATO_LIBRARY[0];
}

const RATING_LABELS = ["", "Unknown", "Hard", "Medium", "Good", "Mastered"];
export { RATING_LABELS };

// ── Pool Presets ──────────────────────────────────────────────────────────

export interface PoolPreset {
  id: string;
  name: string;
  voice: string;           // "S" | "B" | "G" | "O" | "HH" | "G-dbl" | "O-open"
  permIds: string[];
}

const POOL_PRESET_KEY = "lt_drum_pool_presets";

export function loadPoolPresets(): PoolPreset[] {
  try { return JSON.parse(localStorage.getItem(POOL_PRESET_KEY) ?? "[]"); }
  catch { return []; }
}

export function savePoolPreset(preset: PoolPreset): PoolPreset[] {
  const all = loadPoolPresets();
  const idx = all.findIndex(p => p.id === preset.id);
  if (idx >= 0) all[idx] = preset; else all.unshift(preset);
  localStorage.setItem(POOL_PRESET_KEY, JSON.stringify(all));
  return all;
}

export function deletePoolPreset(id: string): PoolPreset[] {
  const all = loadPoolPresets().filter(p => p.id !== id);
  localStorage.setItem(POOL_PRESET_KEY, JSON.stringify(all));
  return all;
}
