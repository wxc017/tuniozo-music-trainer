import { describe, it, expect } from "vitest";
import { decomposeDuration, segmentByBar, keySpecFor, keyIsFlat, midiToVexKey } from "./notation";

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
