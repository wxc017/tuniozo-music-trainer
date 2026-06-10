/**
 * grooveStressTest.test.ts — generate 100,000 grooves through the production
 * generator and judge, in depth, whether the variations actually fit the style
 * they were drawn from.
 *
 * For each generation we know the SOURCE library groove (the scaffolding) and
 * its region/genre.  We judge fit on several independent axes:
 *
 *   1. Faithfulness    — grooveSimilarity(varied, source) ∈ [0,1].
 *   2. Skeleton kept   — the style-defining backbone survives the variation:
 *                        kit sources keep their snare backbeat + kick anchors;
 *                        timeline sources keep their bell/clave on the hi-hat.
 *   3. Style identity  — the nearest real-world groove to the VARIED result is
 *                        still in the same region/genre (subsampled — the
 *                        nearest-neighbour scan is O(pool × length)).
 *   4. Musicality      — feature checks (no empty pulse, low collision, etc.).
 *   5. Variation depth — how much actually changed (so we can tell it isn't
 *                        replaying the source verbatim).
 *
 * Run:  npx vitest run src/lib/grooveStressTest.test.ts
 */

import { describe, it, expect } from "vitest";
import { makeCycle, cycleTotalSlots, type GrooveCycle } from "@/lib/grooveCycle";
import { generateFromGroove, isTimelineGroove, extractGrooveFeatures } from "@/lib/grooveScoring";
import {
  GROOVE_LIBRARY, grooveSimilarity, nearestLibraryGroove,
  REGIONS, type LibraryGroove, type Region,
} from "@/lib/grooveLibrary";

const TOTAL = 100_000;
// The nearest-neighbour scan is the only expensive judge; run it on this
// fraction so the run stays fast while the sample (~5k) is still large enough
// for stable region/genre-confusion rates.
const NEAREST_RATE = 0.05;

// Cycle shapes to exercise — cover the common library lengths (8/12/16/20/24/32)
// in both uniform-4 and additive-3 groupings.
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

/** Mirror kitUnderTimeline's choice of which sparse voice is the timeline. */
function timelinePositions(g: LibraryGroove): number[] {
  const c = [g.voices.hatClosed, g.voices.snareAccent, g.voices.bass, g.voices.hhFoot]
    .filter((a): a is number[] => !!a && a.length > 0)
    .sort((a, b) => b.length - a.length);
  return c[0] ?? [];
}
const isSubset = (a: number[], b: Set<number>) => a.every(x => b.has(x));

interface RegionAgg {
  n: number; sims: number[];
  skeletonOK: number; skeletonChecked: number;
}
interface Worst { sim: number; region: Region; name: string; genre: string; timeline: boolean; }

describe("groove generator — 100k style-fit stress test", () => {
  it("judges whether varied grooves still fit their source style", () => {
    // ── Build valid (region, cycle) combos with non-empty source pools ──────
    const combos: { region: Region; cycle: GrooveCycle; pool: LibraryGroove[] }[] = [];
    for (const region of REGIONS) {
      for (const cfg of CONFIGS) {
        const total = sum(cfg);
        const pool = GROOVE_LIBRARY.filter(g => g.length === total && g.region === region);
        if (pool.length > 0) combos.push({ region, cycle: makeCycle(cfg), pool });
      }
    }
    expect(combos.length).toBeGreaterThan(0);

    const base = Math.floor(TOTAL / combos.length);
    let remainder = TOTAL - base * combos.length;
    const counts = combos.map(() => base);
    for (let i = 0; i < remainder; i++) counts[i]++;

    // ── Accumulators ────────────────────────────────────────────────────────
    const simAll: number[] = [];
    const region: Record<string, RegionAgg> = {};
    const byType = { timeline: [] as number[], kit: [] as number[] };
    const tiers = { strong: 0, good: 0, weak: 0, poor: 0 };  // ≥.8 / ≥.6 / ≥.4 / <.4

    let kitChecked = 0, kitBackbone = 0, snareExact = 0, kickKept = 0;
    let tlChecked = 0, tlBell = 0;

    let fEmpty = 0, fColl = 0, fBack = 0, fKick = 0, fDens = 0, fInterlock = 0;
    let degenerate = 0;

    let ghostDelta = 0, kickDelta = 0, hatChanged = 0, hatPresent = 0;
    let openAdded = 0, ornament = 0;

    // nearest-neighbour subsample
    let nN = 0, nRegion = 0, nGenre = 0, nSource = 0;
    const confusion: Record<string, Record<string, number>> = {};
    const flips: { src: string; srcRegion: string; near: string; nearRegion: string; sim: number }[] = [];

    const worst: Worst[] = [];
    const pushWorst = (w: Worst) => {
      if (worst.length < 25) { worst.push(w); worst.sort((a, b) => a.sim - b.sim); }
      else if (w.sim < worst[worst.length - 1].sim) { worst[worst.length - 1] = w; worst.sort((a, b) => a.sim - b.sim); }
    };

    const t0 = Date.now();

    // ── Generate + judge ──────────────────────────────────────────────────────
    combos.forEach((combo, ci) => {
      const n = counts[ci];
      const total = cycleTotalSlots(combo.cycle);
      const agg = (region[combo.region] ??= { n: 0, sims: [], skeletonOK: 0, skeletonChecked: 0 });

      for (let k = 0; k < n; k++) {
        const g = combo.pool[randInt(combo.pool.length)];
        const res = generateFromGroove(g, combo.cycle, { computeScore: false });
        const a = res.assembled;
        const timeline = isTimelineGroove(g);

        const sim = grooveSimilarity(a, g);
        simAll.push(sim);
        agg.n++; agg.sims.push(sim);
        (timeline ? byType.timeline : byType.kit).push(sim);
        if (sim >= 0.8) tiers.strong++; else if (sim >= 0.6) tiers.good++;
        else if (sim >= 0.4) tiers.weak++; else tiers.poor++;
        pushWorst({ sim, region: combo.region, name: g.name, genre: g.genre, timeline });

        const totalHits = a.bassHits.length + a.snareHits.length + a.ghostHits.length + a.hatHits.length + a.hhFootHits.length;
        if (totalHits === 0) degenerate++;

        // ── Skeleton preservation ──────────────────────────────────────────
        if (timeline) {
          // Every source voice is preserved on its OWN voice.
          tlChecked++; agg.skeletonChecked++;
          const av: Record<string, number[]> = {
            bass: a.bassHits, snareAccent: a.snareHits, snareGhost: a.ghostHits,
            hatClosed: a.hatHits, hatOpen: a.hatOpenHits, hhFoot: a.hhFootHits,
          };
          const kept = (["bass", "snareAccent", "snareGhost", "hatClosed", "hatOpen", "hhFoot"] as const)
            .every(v => {
              const src = g.voices[v];
              return !src || !src.length || isSubset(src.filter(x => x < total), new Set(av[v]));
            });
          if (kept) { tlBell++; agg.skeletonOK++; }
        } else {
          kitChecked++; agg.skeletonChecked++;
          const sBass = (g.voices.bass ?? []).filter(x => x < total);
          const sSnare = (g.voices.snareAccent ?? []).filter(x => x < total);
          const bassSet = new Set(a.bassHits), snareSet = new Set(a.snareHits);
          const bassKept = isSubset(sBass, bassSet);
          const snareKept = isSubset(sSnare, snareSet);
          if (bassKept) kickKept++;
          if (snareKept && a.snareHits.length === new Set(sSnare).size) snareExact++;
          if (bassKept && snareKept) { kitBackbone++; agg.skeletonOK++; }
        }

        // ── Variation depth ─────────────────────────────────────────────────
        ghostDelta += a.ghostHits.length - (g.voices.snareGhost ?? []).length;
        kickDelta += a.bassHits.length - (g.voices.bass ?? []).length;
        const srcHat = new Set((g.voices.hatClosed ?? []).filter(x => x < total));
        if (srcHat.size > 0) {
          hatPresent++;
          const genHat = new Set(a.hatHits);
          const same = genHat.size === srcHat.size && [...srcHat].every(x => genHat.has(x));
          if (!same) hatChanged++;
        }
        if (a.hatOpenHits.length > (g.voices.hatOpen ?? []).length) openAdded++;
        if (a.snareDoubleHits.length + a.ghostDoubleHits.length > 0) ornament++;

        // ── Musicality features ─────────────────────────────────────────────
        const ft = extractGrooveFeatures(a);
        fEmpty += ft.hasEmptyPulse; fColl += ft.collision; fBack += ft.backbeat;
        fKick += ft.kickAnchor; fDens += ft.density; fInterlock += ft.interlock;

        // ── Style identity via nearest neighbour (subsample) ────────────────
        if (Math.random() < NEAREST_RATE) {
          nN++;
          const nm = nearestLibraryGroove(a);
          if (nm) {
            if (nm.groove.region === g.region) nRegion++;
            if (nm.groove.genre === g.genre) nGenre++;
            if (nm.groove.id === g.id) nSource++;
            ((confusion[g.region] ??= {})[nm.groove.region] = (confusion[g.region][nm.groove.region] ?? 0) + 1);
            if (nm.groove.region !== g.region && flips.length < 30)
              flips.push({ src: g.name, srcRegion: g.region, near: nm.groove.name, nearRegion: nm.groove.region, sim: nm.similarity });
          }
        }
      }
    });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const sorted = [...simAll].sort((a, b) => a - b);
    const N = simAll.length;

    // ── Report ────────────────────────────────────────────────────────────────
    const L: string[] = [];
    L.push("");
    L.push("══════════════════════════════════════════════════════════════════════");
    L.push(`  GROOVE GENERATOR STRESS TEST — ${N.toLocaleString()} grooves in ${elapsed}s`);
    L.push(`  library entries: ${GROOVE_LIBRARY.length.toLocaleString()} · valid (region×cycle) combos: ${combos.length}`);
    L.push("══════════════════════════════════════════════════════════════════════");

    L.push("\n── 1. FAITHFULNESS  grooveSimilarity(varied, source) ─────────────────");
    L.push(`  mean ${f3(mean(simAll))}  sd ${f3(sd(simAll))}`);
    L.push(`  min ${f3(pct(sorted, 0))}  p1 ${f3(pct(sorted, 1))}  p5 ${f3(pct(sorted, 5))}  p25 ${f3(pct(sorted, 25))}  median ${f3(pct(sorted, 50))}`);
    L.push(`  p75 ${f3(pct(sorted, 75))}  p95 ${f3(pct(sorted, 95))}  p99 ${f3(pct(sorted, 99))}  max ${f3(pct(sorted, 100))}`);
    L.push(`  tiers: strong(≥.80) ${pctStr(tiers.strong, N)} · good(≥.60) ${pctStr(tiers.good, N)} · weak(≥.40) ${pctStr(tiers.weak, N)} · poor(<.40) ${pctStr(tiers.poor, N)}`);
    L.push(`  by source type:  kit mean ${f3(mean(byType.kit))} (n=${byType.kit.length})   timeline mean ${f3(mean(byType.timeline))} (n=${byType.timeline.length})`);

    L.push("\n── 2. SKELETON PRESERVATION (style backbone survives variation) ──────");
    L.push(`  kit sources    — backbeat+kick kept: ${pctStr(kitBackbone, kitChecked)}  (kick anchors ${pctStr(kickKept, kitChecked)}, snare exact ${pctStr(snareExact, kitChecked)})  n=${kitChecked}`);
    L.push(`  timeline srcs  — all source voices preserved: ${pctStr(tlBell, tlChecked)}  n=${tlChecked}`);
    L.push(`  degenerate (empty) grooves: ${degenerate}`);

    L.push("\n── 3. STYLE IDENTITY  nearest real groove to the variation (sample) ──");
    L.push(`  sample size: ${nN.toLocaleString()}`);
    L.push(`  nearest groove is SAME REGION as source:  ${pctStr(nRegion, nN)}`);
    L.push(`  nearest groove is SAME GENRE  as source:  ${pctStr(nGenre, nN)}`);
    L.push(`  nearest groove IS the exact source entry:  ${pctStr(nSource, nN)}`);
    L.push("  region confusion (source → nearest):");
    for (const sr of REGIONS) {
      const row = confusion[sr]; if (!row) continue;
      const tot = sum(Object.values(row));
      const parts = REGIONS.filter(r => row[r]).map(r => `${r} ${pctStr(row[r], tot)}`);
      L.push(`    ${sr.padEnd(9)} → ${parts.join("  ·  ")}`);
    }

    L.push("\n── 4. MUSICALITY (feature means over all grooves) ────────────────────");
    L.push(`  hasEmptyPulse ${f3(fEmpty / N)} (lower=better)   collision ${f3(fColl / N)} (lower=better)`);
    L.push(`  backbeat ${f3(fBack / N)}   kickAnchor ${f3(fKick / N)}   interlock ${f3(fInterlock / N)}   density ${f3(fDens / N)}`);

    L.push("\n── 5. VARIATION DEPTH (proof it isn't replaying verbatim) ────────────");
    L.push(`  avg ghost-note delta vs source: ${f1(ghostDelta / N)}   avg kick delta: ${f1(kickDelta / N)}`);
    L.push(`  hi-hat subdivision changed: ${pctStr(hatChanged, hatPresent)} (of ${hatPresent} with a source hat)`);
    L.push(`  open-hat accent added: ${pctStr(openAdded, N)}   32nd ornament added: ${pctStr(ornament, N)}`);

    L.push("\n── 6. PER-REGION FIT ─────────────────────────────────────────────────");
    L.push("  region      n        sim(mean)  sim(p5)  skeletonOK");
    for (const r of REGIONS) {
      const a = region[r]; if (!a) continue;
      const rs = [...a.sims].sort((x, y) => x - y);
      L.push(`  ${r.padEnd(10)} ${String(a.n).padStart(7)}   ${f3(mean(a.sims))}      ${f3(pct(rs, 5))}    ${pctStr(a.skeletonOK, a.skeletonChecked)}`);
    }

    L.push("\n── 7. WORST 25 BY FAITHFULNESS ───────────────────────────────────────");
    for (const w of worst)
      L.push(`  ${f3(w.sim)}  [${w.region}/${w.timeline ? "timeline" : "kit"}]  ${w.genre} — ${w.name}`);

    if (flips.length) {
      L.push("\n── 8. SAMPLE REGION FLIPS (variation's nearest neighbour left the region) ─");
      for (const fl of flips.slice(0, 15))
        L.push(`  ${fl.srcRegion}:${fl.src}  →  ${fl.nearRegion}:${fl.near}  (sim ${f3(fl.sim)})`);
    }
    L.push("══════════════════════════════════════════════════════════════════════\n");

    const report = L.join("\n");
    // vitest (jsdom) buffers console.log; write straight to stdout + a file so
    // the full report is always visible.
    process.stdout.write(report + "\n");
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require("node:fs") as typeof import("node:fs");
      fs.writeFileSync("stress-report.txt", report);
    } catch { /* ignore */ }

    // ── Sanity gates (the judge's pass/fail lines) ────────────────────────────
    expect(N).toBe(TOTAL);
    expect(degenerate).toBe(0);                                  // never produce an empty groove
    expect(kitBackbone / Math.max(1, kitChecked)).toBeGreaterThan(0.999); // backbone must survive
    expect(tlBell / Math.max(1, tlChecked)).toBeGreaterThan(0.999);       // bell/clave must survive
  }, 600_000);
});
