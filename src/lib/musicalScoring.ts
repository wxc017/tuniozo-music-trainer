/**
 * musicalScoring.ts — Unified Musical vs Awkward scoring framework
 *
 * All musical/awkward decisions across the app route through this module:
 *  - Accent study groupings (groupingSelector.ts)
 *  - Accent study slot mods (AccentStudy.tsx)
 *  - Sticking pattern fills (stickingsData.ts)
 *
 * Architecture:
 *  1. Hard constraints — reject invalid candidates outright
 *  2. Feature extraction — compute normalized sub-scores (-1 to +1)
 *  3. Weight tables — different weights per mode, same features
 *  4. Novelty — penalize recently seen patterns
 *  5. Weighted pick — probabilistic selection favoring high scores
 */

export type AestheticMode = "musical" | "awkward" | "both";

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 1: Core scoring infrastructure
   ═══════════════════════════════════════════════════════════════════════════ */

/** Clamp a value to [-1, +1] */
function norm(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.max(-1, Math.min(1, (value - min) / (max - min) * 2 - 1));
}

/** Weighted sum of normalized features */
export function weightedScore(features: Record<string, number>, weights: Record<string, number>): number {
  let total = 0;
  for (const key in weights) {
    total += (features[key] ?? 0) * weights[key];
  }
  return total;
}

/** Weighted random pick: higher-scored items more likely but not guaranteed */
export function weightedPick<T>(items: T[], scoreFn: (item: T) => number): T {
  if (items.length === 1) return items[0];
  const scores = items.map(scoreFn);
  const min = Math.min(...scores);
  const weights = scores.map(s => s - min + 1);
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** Resolve "both" mode to musical or awkward via coin flip */
export function resolveMode(mode: AestheticMode): "musical" | "awkward" {
  if (mode === "both") return Math.random() < 0.5 ? "musical" : "awkward";
  return mode;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 2: Grouping scoring (accent study, konnakol)
   Replaces: groupingSelector.ts musicalScore/awkwardScore
   ═══════════════════════════════════════════════════════════════════════════ */

export interface GroupingFeatures {
  /** Number of groups (fewer = simpler) */
  groupCount: number;
  /** How many groups share a repeated size (higher = more uniform) */
  repeatedSizes: number;
  /** Max group size minus min group size */
  sizeRange: number;
  /** Whether the grouping contains any 1s */
  hasOnes: number; // 0 or 1
  /** Whether the pattern is framed/symmetric (first===last or center-weighted) */
  isFramed: number; // 0 or 1
  /** Whether the pattern is lopsided (first and last differ by >= 2) */
  isLopsided: number; // 0 or 1
  /** Whether a 1 appears at an edge */
  hasEdgeOne: number; // 0 or 1
}

export function extractGroupingFeatures(g: number[]): GroupingFeatures {
  const sizes = new Set(g);
  const counts = new Map<number, number>();
  for (const v of g) counts.set(v, (counts.get(v) ?? 0) + 1);
  let reps = 0;
  for (const c of counts.values()) if (c > 1) reps += c;

  const isFramed = g.length >= 3 && g[0] === g[g.length - 1] ? 1
    : (g.length >= 2 && g[0] === g[1]) ? 1
    : (g.length >= 2 && g[g.length - 1] === g[g.length - 2]) ? 1
    : 0;

  return {
    groupCount: norm(g.length, 1, 8),
    repeatedSizes: norm(reps, 0, g.length),
    sizeRange: norm(Math.max(...g) - Math.min(...g), 0, 6),
    hasOnes: g.includes(1) ? 1 : 0,
    isFramed,
    isLopsided: (g.length >= 2 && Math.abs(g[0] - g[g.length - 1]) >= 2) ? 1 : 0,
    hasEdgeOne: (g[0] === 1 || g[g.length - 1] === 1) ? 1 : 0,
  };
}

const GROUPING_WEIGHTS_MUSICAL: Record<string, number> = {
  groupCount: -100,    // fewer groups
  repeatedSizes: 80,   // more uniformity
  sizeRange: -50,      // smaller range
  hasOnes: -150,       // avoid singles
  isFramed: 60,        // reward symmetry
  isLopsided: -30,     // penalize asymmetry
  hasEdgeOne: -40,     // avoid edge 1s
};

const GROUPING_WEIGHTS_AWKWARD: Record<string, number> = {
  groupCount: 50,      // more groups
  repeatedSizes: -60,  // less uniformity
  sizeRange: 80,       // larger range
  hasOnes: 30,         // 1s add complexity
  isFramed: -50,       // avoid symmetry
  isLopsided: 70,      // reward asymmetry
  hasEdgeOne: 80,      // edge 1s are disruptive
};

export function scoreGrouping(g: number[], mode: "musical" | "awkward"): number {
  const features = extractGroupingFeatures(g);
  const weights = mode === "musical" ? GROUPING_WEIGHTS_MUSICAL : GROUPING_WEIGHTS_AWKWARD;
  return weightedScore(features as unknown as Record<string, number>, weights);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 3: Slot mod scoring (accent study rests/splits)
   Replaces: AccentStudy.tsx scoreCandidate
   ═══════════════════════════════════════════════════════════════════════════ */

export interface SlotModCandidate {
  rests: Set<number>;
  splits: Set<number>;
}

export interface SlotModFeatures {
  /** Total number of modifications, normalized by slot count */
  modDensity: number;
  /** Fraction of rests on beat 1 positions (most disruptive) */
  beat1Rests: number;
  /** Fraction of rests on secondary strong beats (other downbeats) */
  secondaryStrongRests: number;
  /** Fraction of rests on weak positions */
  weakRests: number;
  /** Adjacent rest pairs normalized by total mods */
  adjacencyRatio: number;
  /** Cross-beat adjacent rests (more disruptive than intra-beat) */
  crossBeatAdjacency: number;
  /** Variance of mod density across beats (0 = even, 1 = clustered) */
  densityVariance: number;
  /** Fraction of beats that have at least one mod */
  beatSpread: number;
  /** Split ratio (splits / total mods) */
  splitRatio: number;
  /** Whether any beat has zero sounding attacks */
  hasEmptyBeat: number; // 0 or 1 — hard constraint signal
  /** Rests on strong-beat accent positions (structural deletion) — relative to grouping */
  strongAccentRests: number;
  /** Rests on weak-beat accent positions (phrasing tool) — relative to grouping */
  weakAccentRests: number;
}

export function extractSlotModFeatures(
  c: SlotModCandidate,
  totalSlots: number,
  slotsPerBeat: number,
  accentFlags?: boolean[],
): SlotModFeatures {
  const beatCount = Math.max(1, Math.ceil(totalSlots / slotsPerBeat));
  const halfBeat = Math.max(1, Math.floor(slotsPerBeat / 2));
  const restArr = [...c.rests];
  const totalMods = restArr.length + c.splits.size;

  // Classify rest positions
  let beat1Rests = 0;
  let secondaryStrong = 0;
  let weakRests = 0;
  for (const r of restArr) {
    if (r === 0) { beat1Rests++; continue; } // beat 1
    if (r % slotsPerBeat === 0) { beat1Rests++; continue; } // downbeats count as "beat 1 level"
    if (r % halfBeat === 0) { secondaryStrong++; continue; } // on-beats
    weakRests++;
  }

  // Actually let's distinguish beat 1 from other downbeats
  let trueBeat1 = c.rests.has(0) ? 1 : 0;
  let otherDownbeats = 0;
  for (let b = 1; b < beatCount; b++) {
    if (c.rests.has(b * slotsPerBeat)) otherDownbeats++;
  }

  // Adjacency
  let adjacentPairs = 0;
  let crossBeatPairs = 0;
  for (const r of restArr) {
    if (c.rests.has(r + 1)) {
      adjacentPairs++;
      // Check if it crosses a beat boundary
      if (Math.floor(r / slotsPerBeat) !== Math.floor((r + 1) / slotsPerBeat)) {
        crossBeatPairs++;
      }
    }
  }

  // Density variance across beats
  const beatsModCount = new Array(beatCount).fill(0);
  for (const r of restArr) {
    const b = Math.floor(r / slotsPerBeat);
    if (b < beatCount) beatsModCount[b]++;
  }
  for (const s of c.splits) {
    const b = Math.floor(s / slotsPerBeat);
    if (b < beatCount) beatsModCount[b]++;
  }
  const avgMods = totalMods / beatCount;
  const variance = beatCount > 1
    ? beatsModCount.reduce((s, v) => s + (v - avgMods) ** 2, 0) / beatCount
    : 0;
  const maxVariance = (slotsPerBeat - 1) ** 2; // worst case: all mods in one beat

  // Beat spread
  const beatsWithMods = beatsModCount.filter(v => v > 0).length;

  // Empty beats (hard constraint check)
  let hasEmptyBeat = 0;
  for (let b = 0; b < beatCount; b++) {
    const lo = b * slotsPerBeat;
    const hi = Math.min(lo + slotsPerBeat, totalSlots);
    let attacks = 0;
    for (let i = lo; i < hi; i++) {
      if (!c.rests.has(i)) attacks++;
    }
    if (attacks === 0) { hasEmptyBeat = 1; break; }
  }

  // Accent-aware rest features: rests on accent positions relative to grouping
  // Accents on strong beats = structural deletion; on weak beats = phrasing tool
  let strongAccentRestsRaw = 0;
  let weakAccentRestsRaw = 0;
  let accentCount = 0;
  if (accentFlags && accentFlags.length > 0) {
    for (let i = 0; i < Math.min(accentFlags.length, totalSlots); i++) {
      if (!accentFlags[i]) continue;
      accentCount++;
      if (!c.rests.has(i)) continue;
      // Is this accent on a strong metrical position?
      const isStrong = i === 0 || i % slotsPerBeat === 0 || i % halfBeat === 0;
      if (isStrong) strongAccentRestsRaw++;
      else weakAccentRestsRaw++;
    }
  }

  return {
    modDensity: norm(totalMods, 0, totalSlots * 0.4),
    beat1Rests: norm(trueBeat1 + otherDownbeats, 0, beatCount),
    secondaryStrongRests: norm(secondaryStrong, 0, beatCount),
    weakRests: norm(weakRests, 0, totalSlots - beatCount),
    adjacencyRatio: totalMods > 0 ? norm(adjacentPairs, 0, Math.max(1, totalMods - 1)) : 0,
    crossBeatAdjacency: totalMods > 0 ? norm(crossBeatPairs, 0, Math.max(1, beatCount - 1)) : 0,
    densityVariance: norm(variance, 0, maxVariance),
    beatSpread: norm(beatsWithMods, 0, beatCount),
    splitRatio: totalMods > 0 ? norm(c.splits.size, 0, totalMods) : 0,
    hasEmptyBeat,
    strongAccentRests: accentCount > 0 ? norm(strongAccentRestsRaw, 0, Math.max(1, accentCount)) : 0,
    weakAccentRests: accentCount > 0 ? norm(weakAccentRestsRaw, 0, Math.max(1, accentCount)) : 0,
  };
}

const SLOT_MOD_WEIGHTS_MUSICAL: Record<string, number> = {
  modDensity: -40,             // sparse mods
  beat1Rests: -120,            // never rest on beat 1 / downbeats
  secondaryStrongRests: -60,   // avoid strong-beat rests
  weakRests: 40,               // weak-beat rests are natural phrasing
  adjacencyRatio: -50,         // avoid adjacent rests
  crossBeatAdjacency: -70,     // especially across beat boundaries
  densityVariance: -20,        // prefer even distribution
  beatSpread: 30,              // spread across beats
  splitRatio: -10,             // mild split penalty (allow some 32nds on weak beats)
  hasEmptyBeat: -999,          // hard constraint: never an empty beat
  strongAccentRests: -120,     // resting on a strong-beat accent = structural deletion
  weakAccentRests: 60,         // resting on a weak-beat accent = phrasing, linear feel
};

const SLOT_MOD_WEIGHTS_AWKWARD: Record<string, number> = {
  modDensity: 30,              // higher density
  beat1Rests: 80,              // rest on beat 1 is very disruptive
  secondaryStrongRests: 50,    // strong-beat rests add tension
  weakRests: -10,              // weak-beat rests are too safe
  adjacencyRatio: 40,          // adjacent rests create gaps
  crossBeatAdjacency: 60,      // cross-beat gaps are more disruptive
  densityVariance: 50,         // clustered mods = uneven feel
  beatSpread: -20,             // prefer concentrated disruption
  splitRatio: 30,              // more splits = rhythmic complexity
  hasEmptyBeat: -999,          // still a hard constraint (unplayable)
  strongAccentRests: 100,      // deleting strong accents = metric sabotage
  weakAccentRests: 20,         // deleting weak accents = mild disruption
};

export function scoreSlotMods(
  c: SlotModCandidate,
  mode: "musical" | "awkward",
  totalSlots: number,
  slotsPerBeat: number,
  accentFlags?: boolean[],
): number {
  const features = extractSlotModFeatures(c, totalSlots, slotsPerBeat, accentFlags);
  const weights = mode === "musical" ? SLOT_MOD_WEIGHTS_MUSICAL : SLOT_MOD_WEIGHTS_AWKWARD;
  return weightedScore(features as unknown as Record<string, number>, weights);
}

/** Hard constraints for slot mods — reject before scoring */
export function isSlotModValid(
  c: SlotModCandidate,
  totalSlots: number,
  slotsPerBeat: number,
): boolean {
  // Must have at least 1 mod
  if (c.rests.size + c.splits.size === 0) return false;
  // Max 2 adjacent rests
  let consecutive = 0;
  for (let i = 0; i < totalSlots; i++) {
    if (c.rests.has(i)) { consecutive++; if (consecutive > 2) return false; }
    else consecutive = 0;
  }
  // Every beat must have at least one sounding attack
  const beatCount = Math.ceil(totalSlots / slotsPerBeat);
  for (let b = 0; b < beatCount; b++) {
    const lo = b * slotsPerBeat;
    const hi = Math.min(lo + slotsPerBeat, totalSlots);
    let attacks = 0;
    for (let i = lo; i < hi; i++) {
      if (!c.rests.has(i)) attacks++;
    }
    if (attacks === 0) return false;
  }
  return true;
}

/** Generate a random slot mod candidate */
export function generateSlotModCandidate(totalSlots: number): SlotModCandidate {
  const rests = new Set<number>();
  const splits = new Set<number>();
  for (let i = 1; i < totalSlots; i++) { // skip slot 0
    const r = Math.random();
    if (r < 0.15) rests.add(i);
    else if (r < 0.25) splits.add(i);
  }
  return { rests, splits };
}

/** Generate and select the best slot mod configuration */
export function randomizeSlotMods(
  mode: AestheticMode,
  totalSlots: number,
  slotsPerBeat: number,
  numCandidates = 80,
  accentFlags?: boolean[],
): SlotModCandidate {
  const resolved = resolveMode(mode);
  let bestCandidate: SlotModCandidate = { rests: new Set(), splits: new Set() };
  let bestScore = -Infinity;

  for (let i = 0; i < numCandidates; i++) {
    const c = generateSlotModCandidate(totalSlots);
    if (!isSlotModValid(c, totalSlots, slotsPerBeat)) continue;
    const score = scoreSlotMods(c, resolved, totalSlots, slotsPerBeat, accentFlags);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = c;
    }
  }
  return bestCandidate;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 4: Sticking fill scoring
   Replaces: stickingsData.ts scoreStickingFill
   ═══════════════════════════════════════════════════════════════════════════ */

export interface StickingFillFeatures {
  /** Number of groups, normalized (fewer = simpler) */
  groupCount: number;
  /** Unique group sizes / total groups (lower = more uniform) */
  sizeVariety: number;
  /** Adjacent pattern repetitions (ABAB feel) */
  repetition: number;
  /** Total kicks normalized by slot count */
  kickDensity: number;
  /** Number of distinct rudiment families */
  familyMix: number;
  /** Fraction of groups that are odd-sized (5, 7) */
  oddSizeRatio: number;
  /** Whether all groups are the same size */
  isUniform: number; // 0 or 1
}

export function extractStickingFeatures(
  patterns: { group: number; pattern: string; label: string }[],
  totalSlots: number,
): StickingFillFeatures {
  const sizes = patterns.map(p => p.group);
  const uniqueSizes = new Set(sizes).size;
  const totalKicks = patterns.reduce((s, p) => {
    let k = 0; for (const c of p.pattern) if (c === "K") k++;
    return s + k;
  }, 0);
  const families = new Set(patterns.map(p => {
    const l = p.label.toLowerCase();
    if (l.includes("3k")) return "3k";
    if (l.includes("single") || l.includes("alternating")) return "single";
    if (l.includes("double") || l.includes("dbl")) return "double";
    if (l.includes("para")) return "paradiddle";
    return "other";
  }));

  let repeatedPairs = 0;
  for (let i = 0; i < patterns.length - 1; i++) {
    if (patterns[i].pattern === patterns[i + 1].pattern) repeatedPairs++;
  }

  const oddCount = sizes.filter(s => s % 2 === 1).length;

  return {
    groupCount: norm(patterns.length, 1, Math.max(2, Math.ceil(totalSlots / 2))),
    sizeVariety: norm(uniqueSizes, 1, Math.min(sizes.length, 5)),
    repetition: patterns.length > 1 ? norm(repeatedPairs, 0, patterns.length - 1) : 0,
    kickDensity: norm(totalKicks, 0, totalSlots * 0.3),
    familyMix: norm(families.size, 1, 4),
    oddSizeRatio: norm(oddCount, 0, patterns.length),
    isUniform: uniqueSizes === 1 ? 1 : 0,
  };
}

const STICKING_WEIGHTS_MUSICAL: Record<string, number> = {
  groupCount: -60,     // fewer groups
  sizeVariety: -70,    // uniform sizes
  repetition: 80,      // repeated patterns
  kickDensity: -40,    // low kick density
  familyMix: -50,      // same family
  oddSizeRatio: -20,   // prefer even groups (4s)
  isUniform: 30,       // mild bonus for all-same (avoid collapsing to single answer)
};

const STICKING_WEIGHTS_AWKWARD: Record<string, number> = {
  groupCount: 40,      // more groups
  sizeVariety: 70,     // varied sizes
  repetition: -50,     // avoid repetition
  kickDensity: 30,     // more kicks
  familyMix: 50,       // mix families
  oddSizeRatio: 60,    // odd sizes cross beat boundaries
  isUniform: -60,      // penalize uniformity
};

export function scoreStickingFill(
  patterns: { group: number; pattern: string; label: string }[],
  mode: "musical" | "awkward",
  totalSlots: number,
): number {
  const features = extractStickingFeatures(patterns, totalSlots);
  const weights = mode === "musical" ? STICKING_WEIGHTS_MUSICAL : STICKING_WEIGHTS_AWKWARD;
  return weightedScore(features as unknown as Record<string, number>, weights);
}
