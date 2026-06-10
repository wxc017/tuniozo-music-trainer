/**
 * Tests for grooveScoring.ts + grooveLibrary.ts — feature detection, library
 * matching (rotation-aware), and the per-voice assembly engine.
 */

import { describe, it, expect } from "vitest";
import { makeUniformCycle, assembleCycle, type PointVoices } from "@/lib/grooveCycle";
import { extractGrooveFeatures, scoreGroove, assembleMusicalCycle, generateInStyle, grooveToPointVoices } from "@/lib/grooveScoring";
import { GROOVE_LIBRARY, grooveSimilarity, nearestLibraryGroove, grooveLibraryBonus } from "@/lib/grooveLibrary";

/** Build a 4×4 cycle where each point gets one voice on its given slots. */
function backbeatCycle(): ReturnType<typeof assembleCycle> {
  const cycle = makeUniformCycle(4, 4);
  const pv: PointVoices[] = [
    { bass: { hits: [0], doubles: [] } },
    { snareAccent: { hits: [0], doubles: [] } },
    { bass: { hits: [0], doubles: [] } },
    { snareAccent: { hits: [0], doubles: [] } },
  ];
  return assembleCycle(cycle, pv);
}

describe("groove features", () => {
  it("detects backbeat + kick anchor", () => {
    const f = extractGrooveFeatures(backbeatCycle());
    expect(f.backbeat).toBe(1);
    expect(f.kickAnchor).toBe(1);
    expect(f.hasEmptyPulse).toBe(0);
  });

  it("flags an empty pulse", () => {
    const cycle = makeUniformCycle(4, 4);
    const a = assembleCycle(cycle, [
      { bass: { hits: [0], doubles: [] } }, {}, { bass: { hits: [0], doubles: [] } }, { snareAccent: { hits: [0], doubles: [] } },
    ]);
    expect(extractGrooveFeatures(a).hasEmptyPulse).toBe(1);
  });

  it("a backbeat scores higher than a single-kick cycle", () => {
    const cycle = makeUniformCycle(4, 4);
    const degenerate = assembleCycle(cycle, [{ bass: { hits: [0], doubles: [] } }, {}, {}, {}]);
    expect(scoreGroove(backbeatCycle(), "musical")).toBeGreaterThan(scoreGroove(degenerate, "musical"));
  });
});

describe("library matching", () => {
  it("every entry has non-empty voices + positive length", () => {
    for (const g of GROOVE_LIBRARY) {
      const n = Object.values(g.voices).reduce((s, arr) => s + (arr?.length ?? 0), 0);
      expect(n).toBeGreaterThan(0);
      expect(g.length).toBeGreaterThan(0);
    }
  });

  it("a rock backbeat matches the library strongly", () => {
    const a = backbeatCycle();
    const m = nearestLibraryGroove(a);
    expect(m).not.toBeNull();
    expect(m!.similarity).toBeGreaterThan(0.5);
    expect(grooveLibraryBonus(a)).toBeGreaterThan(0);
  });

  it("similarity is rotation-aware", () => {
    const clave = GROOVE_LIBRARY.find(g => g.id === "son-clave-32")!;
    const rotated = (clave.voices.snareAccent ?? []).map(x => (x + 1) % clave.length);
    const cycle = makeUniformCycle(4, 4);
    const pv: PointVoices[] = cycle.points.map((_, i) => {
      const hits = rotated.filter(h => Math.floor(h / 4) === i).map(h => h % 4);
      return hits.length ? { snareAccent: { hits, doubles: [] } } : {};
    });
    expect(grooveSimilarity(assembleCycle(cycle, pv), clave)).toBeGreaterThan(0.9);
  });

  it("different lengths don't match a fixed-length entry", () => {
    const clave = GROOVE_LIBRARY.find(g => g.id === "son-clave-32")!; // length 16
    const cycle = makeUniformCycle(3, 4); // 12
    const a = assembleCycle(cycle, cycle.points.map(() => ({ bass: { hits: [0], doubles: [] } })));
    expect(grooveSimilarity(a, clave)).toBe(0);
  });
});

describe("assembly engine (per-voice)", () => {
  it("returns per-voice placements for every point, no empty pulse", () => {
    const cycle = makeUniformCycle(4, 4);
    const res = assembleMusicalCycle(cycle, { candidates: 140, hat: "8ths" });
    expect(res.pointVoices.length).toBe(4);
    expect(extractGrooveFeatures(res.assembled).hasEmptyPulse).toBe(0);
    const onsets = res.assembled.bassHits.length + res.assembled.snareHits.length + res.assembled.ghostHits.length;
    expect(onsets).toBeGreaterThan(0);
  });

  it("permutes over a fixed hi-hat ostinato (hats present on every point)", () => {
    const cycle = makeUniformCycle(4, 4);
    // linear:false forces the stacked path so the fixed hat ostinato is applied
    // (linear mode weaves a single line and ignores the hat shape).
    const res = assembleMusicalCycle(cycle, { candidates: 80, hat: "8ths", linear: false });
    // 8ths hat = positions 0,2 per point → 8 hat hits across the cycle
    expect(res.assembled.hatHits.length).toBe(8);
  });

  it("attaches a real library match when one is found", () => {
    const res = assembleMusicalCycle(makeUniformCycle(4, 4), { candidates: 160, hat: "8ths" });
    if (res.match) expect(GROOVE_LIBRARY.some(g => g.id === res.match!.groove.id)).toBe(true);
  });

  it("linear mode places at most one voice per slot", () => {
    const res = assembleMusicalCycle(makeUniformCycle(4, 4), { candidates: 40, linear: true });
    const a = res.assembled;
    const all = [...a.bassHits, ...a.snareHits, ...a.ghostHits, ...a.hatHits];
    expect(new Set(all).size).toBe(all.length); // no slot used by two voices
  });
});

describe("tradition / style generation", () => {
  it("grooveToPointVoices round-trips a library entry's onsets", () => {
    const g = GROOVE_LIBRARY.find(x => x.id === "son-clave-32")!; // snareAccent [0,3,6,10,12], length 16
    const cycle = makeUniformCycle(4, 4);
    const a = assembleCycle(cycle, grooveToPointVoices(g, cycle));
    expect(a.snareHits).toEqual(g.voices.snareAccent);
  });

  it("generateInStyle returns an entry from the requested style bucket at matching length", () => {
    const res = generateInStyle(makeUniformCycle(4, 4), { region: "Afro-Cuban & Caribbean" });
    expect(res.match).not.toBeNull();
    expect(res.match!.groove.region).toBe("Afro-Cuban & Caribbean");
    expect(res.match!.groove.length).toBe(16);
    expect(res.pointVoices.length).toBe(4);
  });
});
