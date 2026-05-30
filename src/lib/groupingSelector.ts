// ── Grouping Selector ─────────────────────────────────────────────────────────
// Given a list of candidate groupings (arrays of positive integers summing to N),
// selects one based on Musical / Awkward / Both mode.
//
// This module ONLY selects. It does not generate candidates, add accents,
// rests, ties, or note values.

export type GroupingMode = "musical" | "awkward" | "both";

// ── 1. Hard Rejection ────────────────────────────────────────────────────────

/** True if `g` is k>=2 repeats of a smaller cell (e.g. [2,1,2,1] = 2×[2,1]).
 *  Periodicity is the strongest internal-repetition signal a grouping can
 *  carry — every cell boundary lands on the same size, which is exactly what
 *  makes hemiola, alternating-tisra, and additive ostinatos audible.  We treat
 *  it as an explicit musicality override: a periodic grouping is musical even
 *  when it would otherwise fail the multi-1s / fragmentation / edge-1 rules. */
function isPeriodicRepeat(g: number[]): boolean {
  if (g.length < 2) return false;
  for (let cell = 1; cell < g.length; cell++) {
    if (g.length % cell !== 0) continue;
    let periodic = true;
    for (let i = cell; i < g.length; i++) {
      if (g[i] !== g[i - cell]) { periodic = false; break; }
    }
    if (periodic) return true;
  }
  return false;
}

function isRejected(g: number[]): boolean {
  if (g.some(v => v < 1)) return true;                          // 2.1
  if (g.every(v => v === 1)) return true;                       // 2.2
  // Periodic groupings (2+1+2+1, 3+1+3+1, 2+2+1+2+2+1) are intrinsically
  // musical via their explicit cell loop — accept past the fragmentation
  // and 1-count rules below.  Only the pathological all-1s / non-positive
  // cases above still reject.
  if (isPeriodicRepeat(g)) return false;
  const sizes = new Set(g);
  const n = g.reduce((s, v) => s + v, 0);
  if (sizes.size > 3) return true;                              // 2.3
  if (g.filter(v => v === 1).length > 1) return true;           // 2.4
  if (g.length > (n + 1) / 2) return true;                      // 2.5 — softened
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
  // Periodic groupings that contain 1s (2+1+2+1, 3+1+3+1) carry strong
  // shape via their cell repetition — class as B, not D.
  if (g.includes(1) && isPeriodicRepeat(g)) return "B";
  // A single 1 at one edge with exactly two distinct sizes (2+2+1, 1+3+3,
  // 4+4+1) is an additive cell pattern, not a fragmentation — class as B
  // so the strong-shape detector can pick up the repeated non-1 sizes.
  // Requires len >= 3 (so 1+4, 4+1, etc. stay D — those are just lopsided
  // pairs, not additive cells).
  if (g.includes(1)
      && g.filter(v => v === 1).length === 1
      && (g[0] === 1 || g[g.length - 1] === 1)
      && g.length >= 3
      && sizes.size === 2) return "B";
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
  // Periodic repetition is the strongest shape signal — explicit cell loop.
  if (isPeriodicRepeat(g)) return true;
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

/**
 * Enumerate every "musical" grouping of n pulses.  Excludes same-size
 * groupings (class A / tier 1) entirely — per user direction "these are
 * not musical, its boring" pointing at 8+8, 4+4+4+4, 2+2…  Keeps the
 * asymmetric tiers (2 = strong-shape Class B like 3+3+5+5; 3 = generic
 * two-size Class B like 5+3).  Sorted by musical score within the kept
 * tiers so the most idiomatic shapes come first.
 */
export function allMusicalGroupings(n: number, maxPart: number = Math.min(n, 8)): { grouping: number[]; tier: Tier }[] {
  const candidates = allCompositions(n, maxPart);
  const classified = classifyCandidates(candidates);
  // Drop tier 1 (boring same-size — user explicitly rejected 8+8, 4+4+4+4,
  // 2+2…) and tier 4+/D (genuinely awkward).  Keep tier 2 (strong-shape
  // Class B like 3+3+5+5) and tier 3 (generic two-size Class B).
  const musical = classified.filter(c => c.tier === 2 || c.tier === 3);
  // Sort by musical score DESCENDING so the canonical additive cells
  // (tresillo, daichovo, aksak 13 / 16 etc. — bonused inside scoreGrouping)
  // surface at the top, then tier, then fewer groups, then lex.
  musical.sort((a, b) =>
    scoreGrouping(b.grouping, "musical") - scoreGrouping(a.grouping, "musical") ||
    a.tier - b.tier ||
    a.grouping.length - b.grouping.length ||
    groupingKey(a.grouping).localeCompare(groupingKey(b.grouping)),
  );
  return musical.map(c => ({ grouping: c.grouping, tier: c.tier }));
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

export { isRejected, classify, getTier, classifyCandidates, isPeriodicRepeat };
