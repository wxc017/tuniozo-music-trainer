/**
 * Tests for grooveCycle.ts — per-voice enumeration, no-adjacent 32nd doubles,
 * per-pulse (additive) cycles, slot stacking, and strip-data slot math.
 */

import { describe, it, expect } from "vitest";
import {
  LAYER_VOICES, VOICE_META,
  enumerateVoicePerms, enumerateAllVoicePerms, voicePermDensities,
  makeUniformCycle, makeCycle, pointOffsets, assembleCycle, cycleToStripData, cycleToStripMeasures,
  gridForResolution, hatShapePositions,
  type PointVoices,
} from "@/lib/grooveCycle";

describe("per-voice permutation enumeration", () => {
  it("density node counts match C(size,k)", () => {
    const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));
    const choose = (n: number, k: number) => fact(n) / (fact(k) * fact(n - k));
    for (const { density: k, count } of voicePermDensities(4)) expect(count).toBe(choose(4, k));
  });

  it("a single voice at density k places exactly k hits", () => {
    const perms = enumerateVoicePerms(4, 2, "snareAccent");
    expect(perms.length).toBe(6); // C(4,2)
    for (const p of perms) expect(p.hits.length).toBe(2);
  });

  it("non-doublable voices (bass/hat/foot) never produce doubles", () => {
    for (const v of ["bass", "hatClosed", "hatOpen", "hhFoot"] as const) {
      const perms = enumerateAllVoicePerms(4, v, { includeDoubles: true });
      for (const p of perms) expect(p.doubles.length).toBe(0);
    }
  });

  it("doublable voices add single-note 32nd splits, never adjacent", () => {
    const perms = enumerateAllVoicePerms(4, "snareGhost", { includeDoubles: true });
    const doubled = perms.filter(p => p.doubles.length > 0);
    expect(doubled.length).toBeGreaterThan(0);
    for (const p of doubled) {
      expect(p.doubles.length).toBe(1);
      const d = p.doubles[0];
      // never a hit immediately adjacent to the doubled note
      expect(p.hits.includes(d + 1)).toBe(false);
      expect(p.hits.includes(d - 1)).toBe(false);
    }
  });

  it("perm ids are unique", () => {
    const perms = enumerateAllVoicePerms(5, "snareAccent", { includeDoubles: true });
    expect(new Set(perms.map(p => p.id)).size).toBe(perms.length);
  });
});

describe("voice metadata", () => {
  it("lists six layer voices; only snare/ghost are doublable", () => {
    expect(LAYER_VOICES.length).toBe(6);
    expect(VOICE_META.snareAccent.doublable).toBe(true);
    expect(VOICE_META.snareGhost.doublable).toBe(true);
    expect(VOICE_META.bass.doublable).toBe(false);
    expect(VOICE_META.hatClosed.doublable).toBe(false);
  });
});

describe("cycle assembly", () => {
  it("4×4 cycle: 16 slots, 16th grid, boundaries", () => {
    const cycle = makeUniformCycle(4, 4);
    const a = assembleCycle(cycle, cycle.points.map(() => ({})));
    expect(a.totalSlots).toBe(16);
    expect(a.grid).toBe("16th");
    expect(a.pulseBoundaries).toEqual([0, 4, 8, 12]);
  });

  it("additive 3-2-2 lays out at offsets [0,3,5], no single grid", () => {
    const cycle = makeCycle([3, 2, 2]);
    expect(pointOffsets(cycle)).toEqual([0, 3, 5]);
    const a = assembleCycle(cycle, cycle.points.map(() => ({})));
    expect(a.totalSlots).toBe(7);
    expect(a.grid).toBeNull();
  });

  it("places each voice at absolute slots; accents flagged; doubles routed", () => {
    const cycle = makeUniformCycle(2, 4);
    const pv: PointVoices[] = [
      { bass: { hits: [0], doubles: [] }, snareGhost: { hits: [2], doubles: [2] } },
      { snareAccent: { hits: [0], doubles: [] } },
    ];
    const a = assembleCycle(cycle, pv);
    expect(a.bassHits).toEqual([0]);
    expect(a.ghostHits).toEqual([2]);
    expect(a.ghostDoubleHits).toEqual([2]);
    expect(a.snareHits).toEqual([4]);
    expect(a.accentFlags[4]).toBe(true);
  });

  it("hi-hat and bass may share a slot (unison)", () => {
    const cycle = makeUniformCycle(1, 4);
    const a = assembleCycle(cycle, [{ bass: { hits: [0], doubles: [] }, hatClosed: { hits: [0, 2], doubles: [] } }]);
    expect(a.bassHits).toContain(0);
    expect(a.hatHits).toContain(0);
  });
});

describe("ostinato shapes + strip data", () => {
  it("hi-hat 8ths shape hits even positions", () => {
    expect(hatShapePositions("8ths", 4)).toEqual([0, 2]);
    expect(hatShapePositions("offbeats", 4)).toEqual([1, 3]);
  });

  it("uniform cycle → single strip measure", () => {
    const cycle = makeUniformCycle(4, 4);
    const ms = cycleToStripMeasures(cycle, cycle.points.map(() => ({})));
    expect(ms.length).toBe(1);
    expect(ms[0].slotOverride).toBe(16);
    expect(ms[0].capToBeat).toBe(true);
  });

  it("mixed cycle → one measure per pulse with its own grid", () => {
    const cycle = makeCycle([4, 5, 4, 4]);
    const ms = cycleToStripMeasures(cycle, cycle.points.map(() => ({})));
    expect(ms.length).toBe(4);
    expect(ms[1].grid).toBe("quintuplet");
    expect(ms[1].slotOverride).toBe(5);
  });

  it("cycleToStripData renders beat-aligned drum values (capToBeat, rests shown)", () => {
    const cycle = makeUniformCycle(4, 4);
    const sd = cycleToStripData(cycle, cycle.points.map(() => ({})));
    expect(sd.capToBeat).toBe(true);
    expect(sd.showRests).toBe(true);
    expect(sd.shortHits).toBeUndefined();
  });

  it("gridForResolution maps 5 → quintuplet, 9 → null", () => {
    expect(gridForResolution(5)).toBe("quintuplet");
    expect(gridForResolution(9)).toBeNull();
  });
});
