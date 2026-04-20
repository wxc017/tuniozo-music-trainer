import { GridType, GRID_SUBDIVS } from "./drumData";
import { selectGrouping, generateAndSelectGrouping, type GroupingMode } from "./groupingSelector";

export type AccentSubdivision = "8th" | "16th" | "triplet" | "quintuplet" | "sextuplet" | "septuplet" | "mixed" | "32nd";
export type AccentBeatCount = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type StartMode = "accent" | "random";

export const ACCENT_SUBDIV_BEAT_SLOTS: Record<AccentSubdivision, number> = {
  "8th": 2,
  "16th": 4,
  triplet: 3,
  quintuplet: 5,
  sextuplet: 6,
  septuplet: 7,
  mixed: 4,
  "32nd": 8,
};

export const ACCENT_SUBDIV_LABELS: Record<AccentSubdivision, string> = {
  "8th": "8th",
  "16th": "16th",
  triplet: "Triplet",
  quintuplet: "Quintuplet",
  sextuplet: "Sextuplet",
  septuplet: "Septuplet",
  mixed: "Mixed",
  "32nd": "32nd",
};

export function toRenderGrid(s: AccentSubdivision): GridType {
  if (s === "8th" || s === "16th" || s === "triplet") return s;
  if (s === "quintuplet" || s === "sextuplet" || s === "septuplet") return s;
  if (s === "32nd") return "32nd";
  return "16th";
}

/** Legacy union kept for backward-compat when loading old saved exercises. */
export type Interpretation =
  | "accent-flam" | "accent-double" | "accent-buzz"
  | "tap-buzz" | "tap-flam" | "tap-double";

export type AccentInterpretation = "accent-flam" | "accent-double" | "accent-buzz";
export type TapInterpretation    = "tap-buzz"    | "tap-flam" | "tap-double";

export const ACCENT_INTERPRETATION_LABELS: Record<AccentInterpretation, string> = {
  "accent-flam":   "Flams",
  "accent-double": "Doubles",
  "accent-buzz":   "Buzz",
};

export const TAP_INTERPRETATION_LABELS: Record<TapInterpretation, string> = {
  "tap-buzz":   "Buzz",
  "tap-flam":   "Flams",
  "tap-double": "Doubles",
};

/** @deprecated use AccentInterpretation + TapInterpretation separately */
export const INTERPRETATION_LABELS: Record<Interpretation, string> = {
  "accent-flam":   "Accents = Flams",
  "accent-double": "Accents = Doubles",
  "tap-buzz":      "Taps = Buzz",
  "tap-flam":      "Taps = Flams",
  "tap-double":    "Taps = Doubles",
};

export type Sticking =
  | "single"
  | "paradiddle"
  | "odd"
  | "even";

export const STICKING_LABELS: Record<Sticking, string> = {
  single: "Single Strokes",
  paradiddle: "Paradiddle",
  odd: "Odd Sticking",
  even: "Even Sticking",
};

export type BassOption =
  | "none"
  | "replace-accents"
  | "replace-taps";

export const BASS_LABELS: Record<BassOption, string> = {
  none: "None",
  "replace-accents": "Replace Accents",
  "replace-taps": "Replace Taps",
};

export type Orchestration =
  | "snare"
  | "snare-toms"
  | "accent-tom"
  | "accent-crash";

export const ORCHESTRATION_LABELS: Record<Orchestration, string> = {
  snare: "Snare Only",
  "snare-toms": "Snare + Toms",
  "accent-tom": "Accent \u2192 Tom",
  "accent-crash": "Accent \u2192 Crash",
};

export interface AccentMeasureData {
  snareHits: number[];
  ghostHits: number[];
  bassHits: number[];
  tomHits?: number[];
  crashHits?: number[];
  accentFlags: boolean[];
  stickings: string[];
  grouping: number[];
  startMode: StartMode;
  /** @deprecated use accentInterpretation + tapInterpretation */
  interpretation?: Interpretation;
  accentInterpretation?: AccentInterpretation;
  tapInterpretation?: TapInterpretation;
  /** @deprecated legacy field; use allowOdd/allowEven/useParadiddle/useSingle */
  sticking: Sticking;
  allowOdd?: boolean;
  allowEven?: boolean;
  useParadiddle?: boolean;
  useSingle?: boolean;
  biasR?: boolean;
  bassOption: BassOption;
  orchestration: Orchestration;
  displaySlots?: number;
  lineBreak?: boolean;
  /** Groups measures auto-split across lines from a single composed import — one rating per phrase */
  phraseId?: string;
  /** Per-beat subdivision info for mixed-subdivision measures (from composed studies) */
  beatSubdivs?: { subdiv: string; n: number }[];
  /** Slot indices where a rest replaces the hit */
  restSlots?: number[];
  /** Slot indices where the 16th note is split into two 32nd notes */
  splitSlots?: number[];
  /** Grid subdivision at the time the measure was created */
  subdivision?: AccentSubdivision;
}

export interface AccentExercise {
  id: string;
  name: string;
  date: string;
  subdivision: AccentSubdivision;
  beats: AccentBeatCount;
  measures: AccentMeasureData[];
  rating: number;
  grouping: number[];
  startMode: StartMode;
  /** @deprecated use accentInterpretation + tapInterpretation */
  interpretation?: Interpretation;
  accentInterpretation?: AccentInterpretation;
  tapInterpretation?: TapInterpretation;
  /** @deprecated legacy field; use allowOdd/allowEven/useParadiddle/useSingle */
  sticking: Sticking;
  allowOdd?: boolean;
  allowEven?: boolean;
  useParadiddle?: boolean;
  useSingle?: boolean;
  biasR?: boolean;
  bassOption: BassOption;
  orchestration: Orchestration;
}

export function slotsPerBeat(subdiv: AccentSubdivision): number {
  return ACCENT_SUBDIV_BEAT_SLOTS[subdiv];
}

export function totalSlots(subdiv: AccentSubdivision, beats: number): number {
  return ACCENT_SUBDIV_BEAT_SLOTS[subdiv] * beats;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fillToTarget(target: number, sizes: number[]): number[] | null {
  const result: number[] = [];
  let remaining = target;
  let stuck = 0;
  while (remaining > 0 && stuck < 100) {
    const valid = sizes.filter(s => s <= remaining);
    if (valid.length === 0) return null;
    const s = pick(valid);
    result.push(s);
    remaining -= s;
    stuck++;
  }
  return remaining === 0 ? result : null;
}

function scoreGrouping(g: number[]): number {
  let score = 0;
  const len = g.length;

  const counts = new Map<number, number>();
  for (const n of g) counts.set(n, (counts.get(n) ?? 0) + 1);
  for (const [, c] of counts) if (c > 1) score += c * 3;

  let symPairs = 0;
  for (let i = 0; i < Math.floor(len / 2); i++) {
    if (g[i] === g[len - 1 - i]) symPairs++;
  }
  score += symPairs * 4;
  if (symPairs === Math.floor(len / 2) && len > 2) score += 8;

  if (g.every(n => n === g[0])) score += 10;

  const unique = new Set(g).size;
  if (unique === 1) score += 6;
  else if (unique === 2) score += 4;
  else if (unique === 3) score += 1;
  else score -= unique;

  for (let i = 1; i < len; i++) {
    if (g[i] === g[i - 1]) score += 2;
  }

  let hasRun = false;
  for (let i = 0; i + 1 < len; i++) {
    if (g[i] === g[i + 1]) {
      hasRun = true;
      let runLen = 2;
      while (i + runLen < len && g[i + runLen] === g[i]) runLen++;
      score += runLen * 2;
      i += runLen - 1;
    }
  }
  if (hasRun) score += 3;

  if (len >= 4) {
    let patternLen = 0;
    for (let p = 1; p <= Math.floor(len / 2); p++) {
      let match = true;
      for (let j = 0; j + p < len; j++) {
        if (g[j] !== g[j + p]) { match = false; break; }
      }
      if (match) { patternLen = p; break; }
    }
    if (patternLen > 0) score += 8;
  }

  const hasOne = g.includes(1);
  if (hasOne) score -= 5;

  const maxGroup = Math.max(...g);
  const minGroup = Math.min(...g);
  if (maxGroup - minGroup <= 2) score += 3;

  return score;
}

type Strategy = (target: number) => number[] | null;

function stratUniform(target: number): number[] | null {
  const sizes = [2, 3, 4, 5].filter(s => target % s === 0 && target / s >= 2);
  if (sizes.length === 0) return null;
  const s = pick(sizes);
  return Array(target / s).fill(s);
}

function stratSymmetric(target: number): number[] | null {
  for (let attempt = 0; attempt < 10; attempt++) {
    const halfTarget = Math.floor(target / 2);
    const half = fillToTarget(halfTarget, [2, 3, 4, 5]);
    if (!half) continue;
    const mirror = [...half, ...half.slice().reverse()];
    const sum = mirror.reduce((a, b) => a + b, 0);
    if (sum === target) return mirror;
    const diff = target - sum;
    if (diff >= 2 && diff <= 5) {
      mirror.splice(half.length, 0, diff);
      return mirror;
    }
  }
  return null;
}

function stratRepeatingPair(target: number): number[] | null {
  const pairs: [number, number][] = [];
  for (let a = 2; a <= 5; a++) {
    for (let b = 2; b <= 5; b++) {
      const pairSum = a + b;
      if (target % pairSum === 0 && target / pairSum >= 2) {
        pairs.push([a, b]);
      }
    }
  }
  if (pairs.length === 0) return null;
  const [a, b] = pick(pairs);
  const reps = target / (a + b);
  const result: number[] = [];
  for (let i = 0; i < reps; i++) { result.push(a, b); }
  return result;
}

function stratBookend(target: number): number[] | null {
  const cap = pick([2, 3, 4, 5].filter(s => s * 2 < target));
  if (!cap) return null;
  const inner = target - cap * 2;
  if (inner <= 0) return null;
  const middle = fillToTarget(inner, [2, 3, 4, 5]);
  if (!middle) return null;
  return [cap, ...middle, cap];
}

function stratCommonForm(target: number): number[] | null {
  const forms: Record<number, number[][]> = {
    4:  [[2, 2]],
    6:  [[3, 3], [2, 2, 2]],
    8:  [[4, 4], [3, 3, 2], [2, 2, 2, 2]],
    9:  [[3, 3, 3]],
    10: [[5, 5], [3, 3, 4], [2, 3, 2, 3]],
    12: [[4, 4, 4], [3, 3, 3, 3], [3, 4, 5]],
    14: [[4, 3, 4, 3], [3, 4, 4, 3]],
    15: [[5, 5, 5], [3, 3, 3, 3, 3]],
    16: [[4, 4, 4, 4], [3, 3, 3, 3, 4], [5, 3, 5, 3], [3, 5, 5, 3]],
    20: [[5, 5, 5, 5], [4, 4, 4, 4, 4], [3, 4, 3, 4, 3, 3]],
    21: [[3, 3, 3, 3, 3, 3, 3]],
    24: [[4, 4, 4, 4, 4, 4], [3, 3, 3, 3, 3, 3, 3, 3]],
    28: [[4, 4, 4, 4, 4, 4, 4], [3, 4, 3, 4, 3, 4, 3, 4]],
    32: [[4, 4, 4, 4, 4, 4, 4, 4], [3, 3, 3, 3, 4, 3, 3, 3, 3, 4]],
  };
  const options = forms[target];
  if (!options || options.length === 0) return null;
  return [...pick(options)];
}

function stratBiased(target: number): number[] | null {
  const weights: Record<number, number> = { 2: 3, 3: 6, 4: 6, 5: 4 };
  const result: number[] = [];
  let remaining = target;
  while (remaining > 0) {
    const valid = [2, 3, 4, 5].filter(s => s <= remaining);
    if (valid.length === 0) return null;
    const totalW = valid.reduce((sum, s) => sum + (weights[s] ?? 1), 0);
    let r = Math.random() * totalW;
    let chosen = valid[valid.length - 1];
    for (const s of valid) {
      r -= weights[s] ?? 1;
      if (r <= 0) { chosen = s; break; }
    }
    result.push(chosen);
    remaining -= chosen;
  }
  return result;
}

const STRATEGIES: Strategy[] = [
  stratUniform,
  stratSymmetric,
  stratRepeatingPair,
  stratBookend,
  stratCommonForm,
  stratBiased,
];

function groupingKey(g: number[]): string {
  return [...g].sort((a, b) => a - b).join(',');
}

function excludePenalty(result: number[], exclude: number[]): number {
  if (exclude.length === 0) return 0;
  const shared = result.filter(v => exclude.includes(v)).length;
  const maxLen = Math.max(result.length, exclude.length);
  return (shared / maxLen) * 100;
}

export function generateMusicalGrouping(
  subdiv: AccentSubdivision,
  beats: number = 4,
  exclude: number[] = [],
  previousGroupings: number[][] = [],
): number[] {
  const target = slotsPerBeat(subdiv) * beats;
  return _selectGroupingWithExclude(target, "musical", exclude, previousGroupings);
}

export function generateFreeGrouping(
  subdiv: AccentSubdivision,
  beats: number,
  exclude: number[] = [],
  previousGroupings: number[][] = [],
): number[] {
  const target = slotsPerBeat(subdiv) * beats;
  return _selectGroupingWithExclude(target, "musical", exclude, previousGroupings);
}

export function generateConstrainedGrouping(
  subdiv: AccentSubdivision,
  beats: number,
  allowOdd: boolean,
  allowEven: boolean,
  exclude: number[] = [],
  previousGroupings: number[][] = [],
): number[] {
  const target = slotsPerBeat(subdiv) * beats;
  const onlyOdd  = allowOdd  && !allowEven;
  const onlyEven = allowEven && !allowOdd;

  if (!onlyOdd && !onlyEven) {
    return _selectGroupingWithExclude(target, "musical", exclude, previousGroupings);
  }

  const allowedSizes = onlyOdd
    ? [3, 5, 7].filter(s => s <= target)
    : [2, 4, 6, 8].filter(s => s <= target);

  if (allowedSizes.length === 0) {
    return _selectGroupingWithExclude(target, "musical", exclude, previousGroupings);
  }

  const candidates: number[][] = [];
  for (let i = 0; i < 80; i++) {
    const r = fillToTarget(target, allowedSizes);
    if (r) candidates.push(r);
  }
  const result = selectGrouping(candidates, "musical", [...previousGroupings, ...(exclude.length > 0 ? [exclude] : [])]);
  return result ?? fillToTarget(target, allowedSizes) ?? [target];
}

export function generateAwkwardGrouping(
  subdiv: AccentSubdivision,
  beats: number,
  exclude: number[] = [],
  previousGroupings: number[][] = [],
): number[] {
  const target = slotsPerBeat(subdiv) * beats;
  return _selectGroupingWithExclude(target, "awkward", exclude, previousGroupings);
}

/** Internal: generate candidates, filter out exclude, select by mode */
function _selectGroupingWithExclude(
  target: number,
  mode: GroupingMode,
  exclude: number[],
  previousGroupings: number[][] = [],
): number[] {
  const allPrevious = [...previousGroupings, ...(exclude.length > 0 ? [exclude] : [])];
  const maxPart = Math.min(target, 8);

  // For manageable N, use exhaustive enumeration for best coverage
  if (target <= 18) {
    const result = generateAndSelectGrouping(target, mode, maxPart, allPrevious);
    if (result) return result;
  }

  // For larger N, generate a big random pool
  const candidates: number[][] = [];
  const allowed = Array.from({ length: maxPart }, (_, i) => i + 1);
  for (let i = 0; i < 200; i++) {
    const r = fillToTarget(target, allowed);
    if (r) candidates.push(r);
  }
  for (let i = 0; i < 50; i++) {
    const strat = pick(STRATEGIES);
    const r = strat(target);
    if (r) candidates.push(r);
  }

  const result = selectGrouping(candidates, mode, allPrevious);
  return result ?? fillToTarget(target, [2, 3, 4]) ?? [target];
}

export function parseCustomGrouping(input: string, targetSlots: number): number[] | null {
  const parts = input.split(/[-,+\s]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n > 0);
  if (parts.length === 0) return null;
  const sum = parts.reduce((a, b) => a + b, 0);
  if (sum !== targetSlots) return null;
  return parts;
}

export function groupingToAccents(
  grouping: number[],
  startMode: StartMode,
): boolean[] {
  const total = grouping.reduce((a, b) => a + b, 0);
  const accents = new Array(total).fill(false);
  let pos = 0;
  for (const len of grouping) {
    if (startMode === "accent") {
      accents[pos] = true;
    } else {
      accents[pos] = Math.random() > 0.5;
    }
    pos += len;
  }
  return accents;
}

export function groupSticking(len: number, leadR: boolean): string[] {
  const R = leadR ? "R" : "L";
  const L = leadR ? "L" : "R";
  const isEven = len % 2 === 0;
  const result: string[] = [];

  if (isEven) {
    result.push(R, L);
    let hand = R;
    while (result.length < len) {
      result.push(hand, hand);
      hand = hand === R ? L : R;
    }
  } else {
    result.push(R);
    let hand = L;
    while (result.length < len) {
      result.push(hand, hand);
      hand = hand === R ? L : R;
    }
  }
  return result.slice(0, len);
}

export interface ParadiddleResult {
  expandedGrouping: number[];
  snareHits: number[];
  ghostHits: number[];
  bassHits: number[];
  accentFlags: boolean[];
  stickings: string[];
  totalSlots: number;
}

export function paradiddleExpand(
  accents: boolean[],
  grouping: number[],
  bassOption: BassOption,
  biasR: boolean = true,
): ParadiddleResult {
  const expandedGrouping = grouping.map(g => g * 2);
  const expandedTotal = accents.length * 2;
  const snareHits: number[] = [];
  const ghostHits: number[] = [];
  const bassHits: number[] = [];
  const accentFlags = new Array(expandedTotal).fill(false);
  const stickings: string[] = [];

  let srcPos = 0;
  let dstPos = 0;
  let leadR = biasR;
  let accentIdx = 0;

  for (const grpLen of grouping) {
    const lead = leadR ? "R" : "L";
    const off  = leadR ? "L" : "R";
    let doubleHand = lead;
    let pastSingles = false;

    for (let n = 0; n < grpLen; n++) {
      const isAccent = accents[srcPos + n];

      if (isAccent) {
        accentIdx++;
        stickings.push(lead, off);
        doubleHand = lead;
        pastSingles = true;

        if (bassOption === "replace-accents") {
          bassHits.push(dstPos);
          ghostHits.push(dstPos + 1);
        } else {
          snareHits.push(dstPos);
          accentFlags[dstPos] = true;
          if (bassOption === "replace-taps") {
            bassHits.push(dstPos + 1);
          } else {
            ghostHits.push(dstPos + 1);
          }
        }
      } else {
        if (!pastSingles) {
          stickings.push(lead, off);
          pastSingles = true;
          doubleHand = lead;
        } else {
          stickings.push(doubleHand, doubleHand);
          doubleHand = doubleHand === lead ? off : lead;
        }
        if (bassOption === "replace-taps") {
          bassHits.push(dstPos);
          bassHits.push(dstPos + 1);
        } else {
          ghostHits.push(dstPos);
          ghostHits.push(dstPos + 1);
        }
      }

      dstPos += 2;
    }

    srcPos += grpLen;
    // Determine next lead from the actual last two stickings so we never
    // get 3 of the same hand in a row across the group boundary.
    if (stickings.length >= 2 && stickings[stickings.length - 1] === stickings[stickings.length - 2]) {
      // Ended with a double (XX) → next lead must be the opposite hand
      leadR = stickings[stickings.length - 1] === "L";
    } else {
      leadR = !leadR;
    }
  }

  return {
    expandedGrouping,
    snareHits,
    ghostHits,
    bassHits,
    accentFlags,
    stickings,
    totalSlots: expandedTotal,
  };
}

export function generateStickings(
  totalSlots: number,
  stickingType: Sticking,
  grouping?: number[],
  biasR = true,
): string[] {
  const result: string[] = [];
  if (stickingType === "single") {
    // Single strokes: RLRL… starting from bias hand
    for (let i = 0; i < totalSlots; i++) {
      result.push((i % 2 === 0) === biasR ? "R" : "L");
    }
  } else if (stickingType === "paradiddle" || stickingType === "odd" || stickingType === "even") {
    if (grouping && grouping.length > 0) {
      let leadR = biasR;
      for (const len of grouping) {
        const sticks = groupSticking(len, leadR);
        result.push(...sticks);
        // If the group ends with a double (XX) the next group MUST start with
        // the opposite hand — otherwise we get three-in-a-row (XXX).
        // If the group ends with a single stroke, honour the bias preference.
        if (sticks.length >= 2 && sticks[sticks.length - 1] === sticks[sticks.length - 2]) {
          leadR = sticks[sticks.length - 1] === "L"; // ends LL → R; ends RR → L
        } else {
          leadR = biasR;
        }
      }
    } else {
      for (let i = 0; i < totalSlots; i++) {
        result.push((i % 2 === 0) === biasR ? "R" : "L");
      }
    }
  }
  return result;
}

// Generate stickings for a single beat with a given lead hand.
function generateSingleBeatSticking(
  beatSlots: number,
  stickingType: Sticking,
  leadR: boolean,
): string[] {
  if (stickingType === "single") {
    const res: string[] = [];
    let r = leadR;
    for (let i = 0; i < beatSlots; i++) { res.push(r ? "R" : "L"); r = !r; }
    return res;
  }
  return groupSticking(beatSlots, leadR);
}

/**
 * Generate stickings for a full measure, applying oddSticking to beats 1, 3, 5 …
 * and evenSticking to beats 2, 4, 6 … .  The lead hand carries over from beat to beat.
 * When both are the same, falls back to the unified generateStickings() function.
 * Paradiddle expansion (doubling slots) only happens at the component level when
 * both oddSticking and evenSticking are "paradiddle".
 */
export function generatePerBeatStickings(
  beatSlots: number,
  beats: number,
  oddSticking: Sticking,
  evenSticking: Sticking,
  grouping?: number[],
  beatAssignments?: boolean[], // true = use oddSticking for that beat index
): string[] {
  if (!beatAssignments && oddSticking === evenSticking) {
    return generateStickings(beatSlots * beats, oddSticking, grouping);
  }
  const result: string[] = [];
  let leadR = true;
  for (let b = 0; b < beats; b++) {
    const useOdd = beatAssignments ? beatAssignments[b] ?? (b % 2 === 0) : b % 2 === 0;
    const stickingType = useOdd ? oddSticking : evenSticking;
    const beat = generateSingleBeatSticking(beatSlots, stickingType, leadR);
    result.push(...beat);
    if (beat.length > 0) leadR = beat[beat.length - 1] !== "R";
  }
  return result;
}

export function randomBeatAssignments(beats: number): boolean[] {
  return Array.from({ length: beats }, () => Math.random() < 0.5);
}

export function resolveAccentHits(
  accents: boolean[],
  bassOption: BassOption,
): { snareHits: number[]; ghostHits: number[]; bassHits: number[]; accentFlags: boolean[] } {
  const snareHits: number[] = [];
  const ghostHits: number[] = [];
  const bassHits: number[] = [];
  const accentFlags = new Array(accents.length).fill(false);

  let accentIdx = 0;
  for (let i = 0; i < accents.length; i++) {
    if (accents[i]) {
      accentIdx++;
      switch (bassOption) {
        case "none":
        case "replace-taps":
          snareHits.push(i);
          accentFlags[i] = true;
          break;
        case "replace-accents":
          bassHits.push(i);
          break;
      }
    } else {
      if (bassOption === "replace-taps") {
        bassHits.push(i);
      } else {
        ghostHits.push(i);
      }
    }
  }

  return { snareHits, ghostHits, bassHits, accentFlags };
}

export function groupingLabel(grouping: number[]): string {
  return grouping.join("-");
}

const ACCENT_LOG_KEY = "lt_accent_log";

export function loadAccentLog(): AccentExercise[] {
  try {
    const raw = localStorage.getItem(ACCENT_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveAccentExercise(ex: AccentExercise) {
  const log = loadAccentLog();
  log.push(ex);
  localStorage.setItem(ACCENT_LOG_KEY, JSON.stringify(log));
}

export function deleteAccentExercise(id: string) {
  const log = loadAccentLog().filter((ex) => ex.id !== id);
  localStorage.setItem(ACCENT_LOG_KEY, JSON.stringify(log));
}

/**
 * Apply an orchestration to a set of snare (accent) hits.
 * Returns split { snareHits, tomHits, crashHits } — ghost hits are not touched.
 * "accent-tom"   → all accent-flagged hits → tom
 * "snare-toms"   → alternate accent hits between snare and tom
 * "snare"        → no change (all hits stay on snare)
 * "accent-crash" → accent hits get crash cymbal added (snare stays)
 */
export function applyOrchestration(
  snareHits: number[],
  accentFlags: boolean[],
  orch: Orchestration,
): { snareHits: number[]; tomHits: number[]; crashHits: number[] } {
  const accentSet = new Set(accentFlags.map((f, i) => f ? i : -1).filter(i => i >= 0));

  if (orch === "accent-crash") {
    return {
      snareHits: snareHits.filter(h => !accentSet.has(h)),
      tomHits: [],
      crashHits: snareHits.filter(h => accentSet.has(h)),
    };
  }

  if (orch === "snare") {
    return { snareHits, tomHits: [], crashHits: [] };
  }

  if (orch === "accent-tom") {
    return {
      snareHits: snareHits.filter(h => !accentSet.has(h)),
      tomHits:   snareHits.filter(h =>  accentSet.has(h)),
      crashHits: [],
    };
  }

  if (orch === "snare-toms") {
    const accentArr = [...accentSet].sort((a, b) => a - b);
    const toTom = new Set(accentArr.filter((_, i) => i % 2 === 1));
    return {
      snareHits: snareHits.filter(h => !toTom.has(h)),
      tomHits:   snareHits.filter(h =>  toTom.has(h)),
      crashHits: [],
    };
  }

  return { snareHits, tomHits: [], crashHits: [] };
}
