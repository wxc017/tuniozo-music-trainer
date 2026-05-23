import { describe, it, expect } from "vitest";
import { decomposeDuration, segmentByBar, layoutBarCells, keySpecFor, keyIsFlat, midiToVexKey } from "./notation";

const sumDur = (cells: { durBeats: number }[]) => cells.reduce((s, c) => s + c.durBeats, 0);

describe("decomposeDuration", () => {
  it("single notatable values", () => {
    expect(decomposeDuration(4)).toEqual([{ dur: "w", dots: 0 }]);
    expect(decomposeDuration(2)).toEqual([{ dur: "h", dots: 0 }]);
    expect(decomposeDuration(1)).toEqual([{ dur: "q", dots: 0 }]);
    expect(decomposeDuration(0.5)).toEqual([{ dur: "8", dots: 0 }]);
    expect(decomposeDuration(0.25)).toEqual([{ dur: "16", dots: 0 }]);
  });
  it("dotted values", () => {
    expect(decomposeDuration(3)).toEqual([{ dur: "h", dots: 1 }]);
    expect(decomposeDuration(1.5)).toEqual([{ dur: "q", dots: 1 }]);
    expect(decomposeDuration(0.75)).toEqual([{ dur: "8", dots: 1 }]);
  });
  it("compound durations split largest-first", () => {
    expect(decomposeDuration(1.25)).toEqual([{ dur: "q", dots: 0 }, { dur: "16", dots: 0 }]);
    expect(decomposeDuration(2.5)).toEqual([{ dur: "h", dots: 0 }, { dur: "8", dots: 0 }]);
  });
  it("never returns empty", () => {
    expect(decomposeDuration(0).length).toBeGreaterThan(0);
    expect(decomposeDuration(0.01).length).toBeGreaterThan(0);
  });
});

describe("segmentByBar", () => {
  it("keeps a within-bar note in one segment", () => {
    const bars = segmentByBar([{ startBeat: 0, durBeats: 1, data: 60 }], 2, 4);
    expect(bars[0]).toEqual([{ startInBar: 0, dur: 1, data: 60, tieToNext: false }]);
    expect(bars[1]).toEqual([]);
  });
  it("splits a note across a barline and flags the tie", () => {
    const bars = segmentByBar([{ startBeat: 3, durBeats: 2, data: 60 }], 2, 4);
    expect(bars[0]).toEqual([{ startInBar: 3, dur: 1, data: 60, tieToNext: true }]);
    expect(bars[1]).toEqual([{ startInBar: 0, dur: 1, data: 60, tieToNext: false }]);
  });
  it("places a note into the correct later bar", () => {
    const bars = segmentByBar([{ startBeat: 5, durBeats: 1, data: 64 }], 3, 4);
    expect(bars[1]).toEqual([{ startInBar: 1, dur: 1, data: 64, tieToNext: false }]);
  });
});

describe("layoutBarCells", () => {
  const seg = (startInBar: number, dur: number, data = 60, tieToNext = false) => ({ startInBar, dur, data, tieToNext });

  it("fills gaps with rests and always sums to a full bar", () => {
    const cells = layoutBarCells([seg(0, 1), seg(2, 1)], 4);
    expect(sumDur(cells)).toBeCloseTo(4, 6);
    expect(cells.filter(c => c.data === null).length).toBeGreaterThan(0);
  });

  it("clamps overlapping notes so they never exceed the bar (jazz case)", () => {
    // Dense, overlapping, fractional, over-long notes — the broken case.
    const segs = [seg(0, 3), seg(0.4, 2), seg(0.9, 0.3), seg(1.1, 5), seg(3.7, 2)];
    const cells = layoutBarCells(segs, 4);
    expect(sumDur(cells)).toBeCloseTo(4, 6);
    // No cell starts before the previous one ends.
    let cursor = 0;
    for (const c of cells) { expect(c.startInBar).toBeGreaterThanOrEqual(cursor - 1e-9); cursor = c.startInBar + c.durBeats; }
    expect(cursor).toBeCloseTo(4, 6);
  });

  it("empty bar → one full-bar rest", () => {
    const cells = layoutBarCells([], 4);
    expect(cells).toHaveLength(1);
    expect(cells[0].data).toBeNull();
    expect(cells[0].durBeats).toBeCloseTo(4, 6);
  });

  it("sums correctly for compound + odd meters", () => {
    for (const bpb of [3, 2.5, 3.5, 6]) {
      expect(sumDur(layoutBarCells([seg(0.5, 0.5), seg(1.7, 0.9)], bpb))).toBeCloseTo(bpb, 6);
    }
  });

  it("preserves a cross-bar tie flag on the last note reaching the barline", () => {
    const cells = layoutBarCells([seg(3, 2, 60, true)], 4);
    const last = cells[cells.length - 1];
    expect(last.data).toBe(60);
    expect(last.tieToNext).toBe(true);
  });
});

describe("key signatures + spelling", () => {
  it("major / minor key specs", () => {
    expect(keySpecFor(0, "major")).toBe("C");
    expect(keySpecFor(2, "major")).toBe("D");
    expect(keySpecFor(9, "minor")).toBe("Am");
    expect(keySpecFor(7, "minor")).toBe("Gm");
  });
  it("modal key signatures resolve to parent major", () => {
    expect(keySpecFor(2, "dorian")).toBe("C");      // D dorian → C major
    expect(keySpecFor(7, "mixolydian")).toBe("C");  // G mixolydian → C major
    expect(keySpecFor(5, "lydian")).toBe("C");      // F lydian → C major
  });
  it("flat detection", () => {
    expect(keyIsFlat("C")).toBe(false);
    expect(keyIsFlat("D")).toBe(false);
    expect(keyIsFlat("F")).toBe(true);
    expect(keyIsFlat("Bb")).toBe(true);
  });
  it("midi → vex key", () => {
    expect(midiToVexKey(60, false)).toBe("c/4");
    expect(midiToVexKey(61, false)).toBe("c#/4");
    expect(midiToVexKey(61, true)).toBe("db/4");
    expect(midiToVexKey(72, false)).toBe("c/5");
    expect(midiToVexKey(48, false)).toBe("c/3");
  });
});
