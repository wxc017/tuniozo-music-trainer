/**
 * grooveStyleMusicality.test.ts — test EVERY style bucket and judge musicality.
 *
 * After re-tagging the 14k-entry library from 5 continents into 10 cultural
 * style buckets (see bucketFor in grooveLibrary.ts), this test drives the REAL
 * generation path the "⟳ Generate musical cycle" button uses — generateInStyle
 * → generateFromGroove (a library groove kept as a skeleton, its playing
 * re-rolled) — for each bucket, and rates the musicality of what comes out.
 *
 * Per style we report, over many generated grooves spanning the bucket's own
 * cycle lengths:
 *   • library size            — how many real entries back the bucket.
 *   • musical score           — scoreGroove(a, "musical"): features + lib bonus.
 *   • "sounds like a groove?"  — the human gate (no empty pulse, low collision,
 *                                a real backbeat + kick anchor).
 *   • feature profile          — backbeat / kickAnchor / interlock / density …
 *
 * Run:  npx vitest run src/lib/grooveStyleMusicality.test.ts
 */

import { describe, it, expect } from "vitest";
import { makeCycle } from "@/lib/grooveCycle";
import { generateInStyle, extractGrooveFeatures, type GrooveFeatures } from "@/lib/grooveScoring";
import { GROOVE_LIBRARY, REGIONS, type Region } from "@/lib/grooveLibrary";

const PER_STYLE = 600;          // grooves generated per bucket
const PREFERRED_LENS = [16, 12, 8, 24, 20, 32];  // cycle lengths to favour if present

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};
const pctl = (sorted: number[], p: number) => {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
};
const f3 = (x: number) => x.toFixed(3);
const f1 = (x: number) => x.toFixed(1);
const pctStr = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "—");
const randInt = (n: number) => Math.floor(Math.random() * n);

/** Factor a slot count into editor pulse sizes (mirrors GrooveMode.factorSizes). */
function factorSizes(L: number): number[] {
  if (L <= 7) return [Math.max(2, L)];
  for (const s of [4, 3, 2, 6, 5, 7]) if (L % s === 0) return Array<number>(L / s).fill(s);
  const parts: number[] = []; let r = L;
  while (r > 7) { parts.push(4); r -= 4; }
  if (r >= 2) parts.push(r); else if (parts.length) parts[parts.length - 1] += r;
  return parts;
}

/** Human-readable "this sounds like a groove" gate. */
function soundsLikeGroove(f: GrooveFeatures): boolean {
  return f.hasEmptyPulse === 0 && f.collision < 0.15 && f.backbeat >= 0.5 && f.kickAnchor >= 0.5;
}

interface StyleResult {
  region: Region;
  libCount: number;
  lensTested: number[];
  n: number;
  scores: number[];
  gate: number;
  feat: Record<keyof GrooveFeatures, number>;
}

describe("groove permutations — every style bucket, musicality judged", () => {
  it("generates from each of the 10 style buckets and rates how musical it is", () => {
    expect(REGIONS.length).toBe(10);
    const t0 = Date.now();

    // Per-bucket: available cycle lengths in the library (≥1 entry).
    const lensByRegion = new Map<Region, number[]>();
    const countByRegion = new Map<Region, number>();
    for (const r of REGIONS) {
      const pool = GROOVE_LIBRARY.filter(g => g.region === r);
      countByRegion.set(r, pool.length);
      const lens = [...new Set(pool.map(g => g.length))].filter(L => L >= 4 && L <= 32);
      // favour the common kit lengths; fall back to whatever the bucket has.
      const preferred = PREFERRED_LENS.filter(L => lens.includes(L));
      lensByRegion.set(r, (preferred.length ? preferred : lens).slice(0, 4));
    }

    const results: StyleResult[] = [];

    for (const region of REGIONS) {
      const lens = lensByRegion.get(region)!;
      const res: StyleResult = {
        region, libCount: countByRegion.get(region)!, lensTested: lens, n: 0,
        scores: [], gate: 0,
        feat: { backbeat: 0, kickAnchor: 0, interlock: 0, syncopation: 0, ghostPlacement: 0, density: 0, hatSteadiness: 0, hasEmptyPulse: 0, collision: 0 },
      };
      if (!lens.length) { results.push(res); continue; }

      for (let k = 0; k < PER_STYLE; k++) {
        const L = lens[randInt(lens.length)];
        const cycle = makeCycle(factorSizes(L));
        const gen = generateInStyle(cycle, { region, mode: "musical" });
        const a = gen.assembled;
        const f = extractGrooveFeatures(a);
        res.scores.push(gen.score);
        for (const key in res.feat) res.feat[key as keyof GrooveFeatures] += f[key as keyof GrooveFeatures];
        if (soundsLikeGroove(f)) res.gate++;
        res.n++;
      }
      results.push(res);
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    // Overall (pooled) musicality, for context.
    const allScores = results.flatMap(r => r.scores).sort((a, b) => a - b);
    const allGate = sum(results.map(r => r.gate));
    const allN = sum(results.map(r => r.n));

    // ── Report ────────────────────────────────────────────────────────────────
    const L: string[] = [];
    L.push("");
    L.push("══════════════════════════════════════════════════════════════════════════════");
    L.push(`  STYLE-BY-STYLE MUSICALITY — ${allN.toLocaleString()} grooves across ${REGIONS.length} buckets in ${elapsed}s`);
    L.push(`  library: ${GROOVE_LIBRARY.length.toLocaleString()} entries · path: generateInStyle (the Generate button)`);
    L.push("══════════════════════════════════════════════════════════════════════════════");

    L.push("\n── PER-STYLE RATING (sorted by mean musical score) ───────────────────────────");
    L.push("  style                          lib    n    score(mean±sd)   gate    backbt  kick   dens");
    const sorted = [...results].sort((a, b) => mean(b.scores) - mean(a.scores));
    for (const r of sorted) {
      const m = mean(r.scores), s = sd(r.scores);
      const g = (k: keyof GrooveFeatures) => f3(r.feat[k] / Math.max(1, r.n));
      L.push(
        `  ${r.region.padEnd(28)} ${String(r.libCount).padStart(5)} ${String(r.n).padStart(4)}   ` +
        `${f1(m).padStart(6)}±${f1(s).padStart(5)}   ${pctStr(r.gate, r.n).padStart(6)}   ` +
        `${g("backbeat")}  ${g("kickAnchor")}  ${g("density")}`
      );
    }

    L.push("\n── POOLED (all styles) ───────────────────────────────────────────────────────");
    L.push(`  musical score:  mean ${f1(mean(allScores))}  p5 ${f1(pctl(allScores, 5))}  median ${f1(pctl(allScores, 50))}  p95 ${f1(pctl(allScores, 95))}`);
    L.push(`  random baseline (see grooveMusicalityRandom.test.ts): mean ≈ 346`);
    L.push(`  "backbeat gate" pass:  ${pctStr(allGate, allN)}`);
    L.push(`  NOTE: the backbeat gate (snare on 2 & 4 + kick anchor) is a WESTERN-KIT`);
    L.push(`  criterion — bell timelines, gamelan & aksak are musical WITHOUT a backbeat,`);
    L.push(`  so a low gate for those styles is expected. The musical SCORE (which rewards`);
    L.push(`  resembling real library grooves) is the cross-cultural musicality measure.`);

    L.push("\n── CYCLE LENGTHS EXERCISED PER STYLE ─────────────────────────────────────────");
    for (const r of results) L.push(`  ${r.region.padEnd(28)} ${r.lensTested.join(", ") || "(none)"}`);

    L.push("══════════════════════════════════════════════════════════════════════════════\n");

    const report = L.join("\n");
    process.stdout.write(report + "\n");
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require("node:fs") as typeof import("node:fs");
      fs.writeFileSync("style-musicality-report.txt", report);
    } catch { /* ignore */ }

    // ── Sanity gates ──────────────────────────────────────────────────────────
    // Every bucket must be backed by real library entries and produce grooves.
    for (const r of results) {
      expect(r.libCount, `${r.region} has library entries`).toBeGreaterThan(0);
      expect(r.n, `${r.region} produced grooves`).toBe(PER_STYLE);
    }
    // Cross-cultural musicality check: every style must comfortably out-rate
    // pure randomness (random baseline ≈ 346) on the musical SCORE.  We do NOT
    // gate on backbeat — that is a Western-kit trait many of these traditions
    // (bell timelines, gamelan, aksak) musically lack by design.
    for (const r of results) {
      expect(mean(r.scores), `${r.region} beats random`).toBeGreaterThan(450);
    }
    // The backbeat gate should still fire SOMEWHERE (generation isn't broken):
    // backbeat-driven styles (Afro-Cuban, Mid-East kit) clear it often.
    expect(allGate / allN, "some grooves clear the backbeat gate").toBeGreaterThan(0.1);
  }, 600_000);
});
