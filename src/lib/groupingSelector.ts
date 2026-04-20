// ── Grouping Selector ─────────────────────────────────────────────────────────
// Given a list of candidate groupings (arrays of positive integers summing to N),
// selects one based on Musical / Awkward / Both mode.
//
// This module ONLY selects. It does not generate candidates, add accents,
// rests, ties, or note values.

export type GroupingMode = "musical" | "awkward" | "both";

// ── 1. Hard Rejection ────────────────────────────────────────────────────────

function isRejected(g: number[]): boolean {
  if (g.some(v => v < 1)) return true;                          // 2.1
  if (g.every(v => v === 1)) return true;                       // 2.2
  const sizes = new Set(g);
  const n = g.reduce((s, v) => s + v, 0);
  if (sizes.size > 3) return true;                              // 2.3
  if (g.filter(v => v === 1).length > 1) return true;           // 2.4
  if (g.length > n / 2) return true;                            // 2.5
  if (Math.max(...g) - Math.min(...g) > 5) return true;         // 2.6
  if (g.length > 3 && sizes.size === g.length) return true;     // 2.7
  for (let i = 1; i < g.length - 1; i++) {                     // 2.8
    if (g[i] === 1) return true;
  }
  if (g.length >= 2 && g[0] === 1 && g[g.length - 1] === 1) return true; // 2.9
  return false;
}

// ── 2. Classification ────────────────────────────────────────────────────────

type GroupClass = "A" | "B" | "C" | "D";

function classify(g: number[]): GroupClass {
  const sizes = new Set(g);
  if (sizes.size === 1) return "A";
  if (g.includes(1)) return "D";
  if (sizes.size === 2) return "B";
  return "C";
}

// ── 3. Tiering ───────────────────────────────────────────────────────────────

type Tier = 1 | 2 | 3 | 4 | 5;

function getTier(g: number[], cls: GroupClass): Tier {
  if (cls === "A") return 1;
  if (cls === "B") return hasStrongShape(g) ? 2 : 3;
  if (cls === "C") return 4;
  return 5;
}

/**
 * Tier 2 vs Tier 3 for Class B:
 * Strong shape = adjacency or framing that makes the pattern easy to hear.
 *   3+3+2  → yes (repeated beginning)
 *   2+3+3  → yes (repeated ending)
 *   2+4+2  → yes (frame: first === last)
 *   4+2+2  → yes (repeated ending)
 *   2+2+4  → yes (repeated beginning)
 *   5+3    → NO  (no repetition, no frame)
 *   3+5    → NO
 *   6+2    → NO
 */
function hasStrongShape(g: number[]): boolean {
  if (g.length < 2) return false;
  // Repeated beginning
  if (g.length >= 2 && g[0] === g[1]) return true;
  // Repeated ending
  if (g.length >= 2 && g[g.length - 1] === g[g.length - 2]) return true;
  // Frame: first === last (with at least 3 groups)
  if (g.length >= 3 && g[0] === g[g.length - 1]) return true;
  return false;
}

// ── 4. Scoring helpers ───────────────────────────────────────────────────────

function countRepeatedSizes(g: number[]): number {
  const counts = new Map<number, number>();
  for (const v of g) counts.set(v, (counts.get(v) ?? 0) + 1);
  let reps = 0;
  for (const c of counts.values()) if (c > 1) reps += c;
  return reps;
}

function sizeRange(g: number[]): number {
  return Math.max(...g) - Math.min(...g);
}

function isCenterWeightedOrFramed(g: number[]): boolean {
  if (g.length < 3) return false;
  if (g[0] === g[g.length - 1]) return true;
  const mid = Math.floor(g.length / 2);
  return g[mid] >= g[0] && g[mid] >= g[g.length - 1];
}

function isLopsided(g: number[]): boolean {
  if (g.length < 2) return false;
  return Math.abs(g[0] - g[g.length - 1]) >= 2;
}

function groupingKey(g: number[]): string {
  return g.join("+");
}

// ── 5–6. Musical / Awkward scoring via shared framework ─────────────────────

import { scoreGrouping } from "./musicalScoring";

function musicalScore(g: number[]): number {
  return scoreGrouping(g, "musical");
}

function awkwardScore(g: number[]): number {
  return scoreGrouping(g, "awkward");
}

// ── 7. Main selector ─────────────────────────────────────────────────────────

interface ClassifiedGrouping {
  grouping: number[];
  cls: GroupClass;
  tier: Tier;
}

function classifyCandidates(candidates: number[][]): ClassifiedGrouping[] {
  const results: ClassifiedGrouping[] = [];
  const seen = new Set<string>();
  for (const g of candidates) {
    if (isRejected(g)) continue;
    const key = groupingKey(g);
    if (seen.has(key)) continue; // deduplicate
    seen.add(key);
    const cls = classify(g);
    const tier = getTier(g, cls);
    results.push({ grouping: g, cls, tier });
  }
  return results;
}

/** Weighted random pick: higher-scored items are more likely but not guaranteed */
function weightedPick<T>(items: T[], scoreFn: (item: T) => number): T {
  if (items.length === 1) return items[0];
  const scores = items.map(scoreFn);
  const min = Math.min(...scores);
  // Shift so all weights are positive, then add a base so low-scorers still have a chance
  const weights = scores.map(s => s - min + 1);
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function selectMusical(
  valid: ClassifiedGrouping[],
  previousKeys: Set<string>,
): number[] | null {
  // Keep tiers 1, 2, 3 — never D in musical unless nothing else
  let pool = valid.filter(v => v.tier <= 3);
  if (pool.length === 0) pool = valid.filter(v => v.cls === "C");
  if (pool.length === 0) pool = valid;
  if (pool.length === 0) return null;

  // Novelty: strongly prefer unseen groupings
  const novel = pool.filter(v => !previousKeys.has(groupingKey(v.grouping)));
  if (novel.length > 0) pool = novel;

  // Score ALL candidates across tiers — tier gives a bonus, not a hard filter
  // This lets 3+3+2 (tier 2) compete with 4+4 (tier 1)
  const picked = weightedPick(pool, c => {
    const tierBonus = (4 - c.tier) * 200; // tier 1=600, tier 2=400, tier 3=200
    return tierBonus + musicalScore(c.grouping);
  });
  return picked.grouping;
}

function selectAwkward(
  valid: ClassifiedGrouping[],
  previousKeys: Set<string>,
): number[] | null {
  // Never pick Class A unless nothing else exists
  let pool = valid.filter(v => v.cls !== "A");
  if (pool.length === 0) pool = valid;
  if (pool.length === 0) return null;

  // Novelty: strongly prefer unseen
  const novel = pool.filter(v => !previousKeys.has(groupingKey(v.grouping)));
  if (novel.length > 0) pool = novel;

  // Score with tier bonus (higher tier = more awkward = higher score)
  const picked = weightedPick(pool, c => {
    const tierBonus = c.tier * 200; // tier 5=1000, tier 4=800, tier 3=600
    return tierBonus + awkwardScore(c.grouping);
  });
  return picked.grouping;
}

/**
 * Select a grouping from candidates using the given mode.
 *
 * @param candidates - Array of grouping candidates (each is number[] summing to N)
 * @param mode - "musical" | "awkward" | "both"
 * @param previousGroupings - Previously selected groupings to bias against repeats
 * @returns The selected grouping, or null if no valid candidate exists
 */
export function selectGrouping(
  candidates: number[][],
  mode: GroupingMode,
  previousGroupings: number[][] = [],
): number[] | null {
  const valid = classifyCandidates(candidates);
  if (valid.length === 0) return null;

  const previousKeys = new Set(previousGroupings.map(groupingKey));

  if (mode === "musical") return selectMusical(valid, previousKeys);
  if (mode === "awkward") return selectAwkward(valid, previousKeys);

  // "both": coin flip then run that mode
  return Math.random() < 0.5
    ? selectMusical(valid, previousKeys)
    : selectAwkward(valid, previousKeys);
}

/**
 * Generate all integer compositions of n (parts 1..maxPart),
 * then select one using the mode.
 */
export function generateAndSelectGrouping(
  n: number,
  mode: GroupingMode,
  maxPart: number = Math.min(n, 8),
  previousGroupings: number[][] = [],
): number[] | null {
  const candidates = allCompositions(n, maxPart);
  return selectGrouping(candidates, mode, previousGroupings);
}

/** Generate all ordered integer compositions of n with parts in 1..maxPart */
function allCompositions(n: number, maxPart: number): number[][] {
  const results: number[][] = [];
  function build(remaining: number, current: number[]) {
    if (remaining === 0) { results.push([...current]); return; }
    for (let i = 1; i <= Math.min(remaining, maxPart); i++) {
      current.push(i);
      build(remaining - i, current);
      current.pop();
    }
  }
  build(n, []);
  return results;
}

// ── Exports for testing / external use ───────────────────────────────────────

export { isRejected, classify, getTier, classifyCandidates };
