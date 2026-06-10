/**
 * grooveMusicalityRandom.test.ts — judge 10,000 TRULY RANDOM grooves and rate
 * their musicality with the production scoring engine.
 *
 * Unlike grooveStressTest.test.ts (which draws grooves FROM the library and asks
 * "does the variation still fit its source style?"), this test asks a blunter
 * question:  if you place voices at RANDOM, how musical is the result — and how
 * far below the production generator does pure randomness sit?
 *
 * For each groove we sample independent random placements for every voice
 * (bass / snare / ghost / hat / open-hat / left-foot) over a random cycle shape,
 * assemble it, and rate it on:
 *
 *   1. Musical score   — scoreGroove(a, "musical"): features + library bonus.
 *   2. Feature profile  — backbeat, kickAnchor, interlock, syncopation,
 *                         ghostPlacement, density, hatSteadiness, emptyPulse,
 *                         collision (the raw ingredients of the score).
 *   3. "Sounds like a groove?" gate — a human-readable pass/fail: no empty
 *                         pulse, low collision, a real backbeat + kick anchor.
 *   4. Nearest real groove — does a random pattern ever land near a real-world
 *                         groove? (subsampled — the scan is O(pool × length)).
 *
 * A REFERENCE batch from the production generator (assembleMusicalCycle) is
 * scored the same way so the random distribution has something to be rated
 * against — randomness should sit far below it.
 *
 * Run:  npx vitest run src/lib/grooveMusicalityRandom.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  makeCycle, assembleCycle, cycleTotalSlots,
  VOICE_META, type GrooveCycle, type PointVoices, type LayerVoice, type VoicePlacement,
} from "@/lib/grooveCycle";
import {
  extractGrooveFeatures, scoreGroove, assembleMusicalCycle, type GrooveFeatures,
} from "@/lib/grooveScoring";
import { GROOVE_LIBRARY, nearestLibraryGroove } from "@/lib/grooveLibrary";

const TOTAL = 10_000;
// Reference batch from the real generator — enough for a stable mean to rate
// the random batch against, small enough to stay fast (it runs 220 candidates
// + a full library scan per groove).
const REFERENCE = 500;
// The nearest-neighbour scan is the expensive judge; subsample it.
const NEAREST_RATE = 0.05;

// Cycle shapes to exercise — the common library lengths in uniform-4 and
// additive-3 groupings (mirrors the style-fit stress test).
const CONFIGS: number[][] = [
  [4, 4, 4, 4],                 // 16
  [3, 3, 3, 3],                 // 12
  [4, 4, 4],                    // 12
  [4, 4],                       // 8
  [4, 4, 4, 4, 4],              // 20
  [4, 4, 4, 4, 4, 4],           // 24
  [3, 3, 3, 3, 3, 3, 3, 3],     // 24
  [4, 4, 4, 4, 4, 4, 4, 4],     // 32
];

const CORE_VOICES: LayerVoice[] = ["bass", "snareAccent", "snareGhost"];
const ALL_VOICES: LayerVoice[] = ["bass", "snareAccent", "snareGhost", "hatClosed", "hatOpen", "hhFoot"];

const randInt = (n: number) => Math.floor(Math.random() * n);
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};
const pct = (sorted: number[], p: number) => {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
};
const f3 = (x: number) => x.toFixed(3);
const f1 = (x: number) => x.toFixed(1);
const pctStr = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(2)}%` : "—");

/** A random placement of one voice in a point of `size` slots: include each slot
 *  with probability `p`, and (for a doublable voice) split the odd note into a
 *  32nd with a small chance. */
function randomPlacement(size: number, p: number, voice: LayerVoice): VoicePlacement {
  const hits: number[] = [];
  for (let s = 0; s < size; s++) if (Math.random() < p) hits.push(s);
  let doubles: number[] = [];
  if (VOICE_META[voice].doublable && hits.length && Math.random() < 0.1) {
    // a single double-stroke, never adjacent to another hit (mirrors the enumerator)
    const cands = hits.filter(h => !hits.includes(h + 1) && !hits.includes(h - 1));
    if (cands.length) doubles = [cands[randInt(cands.length)]];
  }
  return { hits, doubles };
}

/** One fully random groove over the given cycle.  Each voice gets its OWN random
 *  per-slot density (drawn fresh per groove) so the batch spans sparse → busy
 *  rather than clustering at one density. */
function randomGroove(cycle: GrooveCycle): PointVoices[] {
  // Per-voice inclusion probability for THIS groove. Hat/foot lean denser (they
  // are ostinato voices); core voices lean sparser — but it is still random.
  const probFor = (v: LayerVoice) =>
    v === "hatClosed" ? 0.2 + Math.random() * 0.6
      : v === "hhFoot" || v === "hatOpen" ? Math.random() * 0.4
      : Math.random() * 0.5;
  const probs = Object.fromEntries(ALL_VOICES.map(v => [v, probFor(v)])) as Record<LayerVoice, number>;
  return cycle.points.map(pt => {
    const pv: PointVoices = {};
    for (const v of ALL_VOICES) {
      const placement = randomPlacement(pt.subPulses, probs[v], v);
      if (placement.hits.length) pv[v] = placement;
    }
    return pv;
  });
}

/** Human-readable "this sounds like a groove" gate — the floor a pattern must
 *  clear to be a plausible kit groove (not the full score, just the basics). */
function soundsLikeGroove(f: GrooveFeatures): boolean {
  return f.hasEmptyPulse === 0 && f.collision < 0.15 && f.backbeat >= 0.5 && f.kickAnchor >= 0.5;
}

interface Batch {
  scores: number[];
  feat: Record<keyof GrooveFeatures, number>;  // running sums
  gate: number;
  n: number;
}
const newBatch = (): Batch => ({
  scores: [],
  feat: { backbeat: 0, kickAnchor: 0, interlock: 0, syncopation: 0, ghostPlacement: 0, density: 0, hatSteadiness: 0, hasEmptyPulse: 0, collision: 0 },
  gate: 0, n: 0,
});
function record(b: Batch, a: ReturnType<typeof assembleCycle>) {
  const f = extractGrooveFeatures(a);
  b.scores.push(scoreGroove(a, "musical"));
  for (const k in b.feat) b.feat[k as keyof GrooveFeatures] += f[k as keyof GrooveFeatures];
  if (soundsLikeGroove(f)) b.gate++;
  b.n++;
}

describe("groove permutations — 10k random-groove musicality rating", () => {
  it("rates how musical purely random grooves are vs the production generator", () => {
    const cycles = CONFIGS.map(makeCycle);
    const t0 = Date.now();

    // ── RANDOM batch ──────────────────────────────────────────────────────────
    const rnd = newBatch();
    const byLen: Record<number, number[]> = {};
    let degenerate = 0;
    let bestRandom = { score: -Infinity, cfg: "" };

    // nearest-neighbour subsample
    let nN = 0, nHit = 0; let nBestSim = 0; let nBestName = "";

    for (let i = 0; i < TOTAL; i++) {
      const cfg = CONFIGS[randInt(CONFIGS.length)];
      const cycle = cycles[CONFIGS.indexOf(cfg)];
      const pv = randomGroove(cycle);
      const a = assembleCycle(cycle, pv);
      const totalHits = a.bassHits.length + a.snareHits.length + a.ghostHits.length + a.hatHits.length + a.hhFootHits.length;
      if (totalHits === 0) { degenerate++; i--; continue; }   // resample an all-rests groove
      record(rnd, a);
      const sc = rnd.scores[rnd.scores.length - 1];
      (byLen[a.totalSlots] ??= []).push(sc);
      if (sc > bestRandom.score) bestRandom = { score: sc, cfg: cfg.join("-") };

      if (Math.random() < NEAREST_RATE) {
        nN++;
        const nm = nearestLibraryGroove(a);
        if (nm) { nHit++; if (nm.similarity > nBestSim) { nBestSim = nm.similarity; nBestName = nm.groove.name; } }
      }
    }

    // ── REFERENCE batch (production generator) ────────────────────────────────
    const ref = newBatch();
    for (let i = 0; i < REFERENCE; i++) {
      const cfg = CONFIGS[randInt(CONFIGS.length)];
      const cycle = cycles[CONFIGS.indexOf(cfg)];
      const res = assembleMusicalCycle(cycle, { mode: "musical" });
      record(ref, res.assembled);
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const sorted = [...rnd.scores].sort((a, b) => a - b);
    const refSorted = [...ref.scores].sort((a, b) => a - b);
    const N = rnd.n;

    // Tiers relative to the production generator's median: a random groove is
    // "generator-grade" if it scores at/above the median real groove.
    const refMedian = pct(refSorted, 50);
    const atOrAboveRef = rnd.scores.filter(s => s >= refMedian).length;

    // ── Report ────────────────────────────────────────────────────────────────
    const L: string[] = [];
    L.push("");
    L.push("══════════════════════════════════════════════════════════════════════");
    L.push(`  RANDOM-GROOVE MUSICALITY RATING — ${N.toLocaleString()} random grooves in ${elapsed}s`);
    L.push(`  library entries: ${GROOVE_LIBRARY.length.toLocaleString()}  ·  reference batch (real generator): ${ref.n}`);
    L.push("══════════════════════════════════════════════════════════════════════");

    L.push("\n── 1. MUSICAL SCORE  scoreGroove(a, \"musical\") ───────────────────────");
    L.push(`  RANDOM     mean ${f1(mean(rnd.scores))}  sd ${f1(sd(rnd.scores))}`);
    L.push(`    min ${f1(pct(sorted, 0))}  p5 ${f1(pct(sorted, 5))}  p25 ${f1(pct(sorted, 25))}  median ${f1(pct(sorted, 50))}  p75 ${f1(pct(sorted, 75))}  p95 ${f1(pct(sorted, 95))}  max ${f1(pct(sorted, 100))}`);
    L.push(`  GENERATOR  mean ${f1(mean(ref.scores))}  sd ${f1(sd(ref.scores))}   (median ${f1(refMedian)})`);
    L.push(`    min ${f1(pct(refSorted, 0))}  p5 ${f1(pct(refSorted, 5))}  median ${f1(pct(refSorted, 50))}  p95 ${f1(pct(refSorted, 95))}  max ${f1(pct(refSorted, 100))}`);
    L.push(`  random grooves scoring ≥ generator median: ${pctStr(atOrAboveRef, N)}`);

    L.push("\n── 2. \"SOUNDS LIKE A GROOVE?\" GATE (no empty pulse · low collision · backbeat · kick) ─");
    L.push(`  RANDOM    pass: ${pctStr(rnd.gate, rnd.n)}`);
    L.push(`  GENERATOR pass: ${pctStr(ref.gate, ref.n)}`);

    L.push("\n── 3. FEATURE PROFILE (mean over batch — what the score is made of) ──");
    L.push("  feature         random   generator   (higher better, except* )");
    const featLine = (k: keyof GrooveFeatures, note = "") =>
      L.push(`  ${k.padEnd(14)}  ${f3(rnd.feat[k] / rnd.n).padStart(6)}    ${f3(ref.feat[k] / ref.n).padStart(6)}   ${note}`);
    featLine("backbeat"); featLine("kickAnchor"); featLine("interlock");
    featLine("syncopation"); featLine("ghostPlacement"); featLine("density");
    featLine("hatSteadiness");
    featLine("hasEmptyPulse", "*lower better");
    featLine("collision", "*lower better");

    L.push("\n── 4. RANDOM SCORE BY CYCLE LENGTH ───────────────────────────────────");
    L.push("  slots    n        mean      p95");
    for (const len of Object.keys(byLen).map(Number).sort((a, b) => a - b)) {
      const xs = [...byLen[len]].sort((a, b) => a - b);
      L.push(`  ${String(len).padStart(3)}    ${String(xs.length).padStart(6)}    ${f1(mean(xs)).padStart(7)}   ${f1(pct(xs, 95)).padStart(7)}`);
    }

    L.push("\n── 5. NEAREST REAL GROOVE TO A RANDOM PATTERN (sample) ───────────────");
    L.push(`  sample size: ${nN.toLocaleString()}   had a non-zero nearest match: ${pctStr(nHit, nN)}`);
    L.push(`  best random→real similarity in sample: ${f3(nBestSim)}  (${nBestName || "—"})`);

    L.push(`\n  best random groove score: ${f1(bestRandom.score)}  [cycle ${bestRandom.cfg}]   ·   degenerate (all-rest) resamples: ${degenerate}`);
    L.push("══════════════════════════════════════════════════════════════════════\n");

    const report = L.join("\n");
    process.stdout.write(report + "\n");
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require("node:fs") as typeof import("node:fs");
      fs.writeFileSync("random-musicality-report.txt", report);
    } catch { /* ignore */ }

    // ── Sanity gates ──────────────────────────────────────────────────────────
    expect(N).toBe(TOTAL);
    // The production generator must out-rate pure randomness on the mean score.
    expect(mean(ref.scores)).toBeGreaterThan(mean(rnd.scores));
    // And it must clear the "sounds like a groove" gate far more often.
    expect(ref.gate / ref.n).toBeGreaterThan(rnd.gate / Math.max(1, rnd.n));
  }, 600_000);
});
