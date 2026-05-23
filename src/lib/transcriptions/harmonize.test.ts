import { describe, it, expect } from "vitest";
import { inferChords, buildAccompaniment } from "./harmonize";
import type { TxExcerpt } from "./loader";
import type { TxItem } from "./types";

function excerpt(midis: number[][], tonicPc = 0, mode = "major", timeSig: [number, number] = [4, 4]): TxExcerpt {
  const bpb = (timeSig[0] * 4) / timeSig[1];
  const melody = midis.flatMap((bar, b) =>
    bar.map((midi, i) => ({ midi, startBeat: b * bpb + i * (bpb / bar.length), durBeats: bpb / bar.length })));
  const item = { key: { tonicPc, mode }, timeSig, id: "t" } as unknown as TxItem;
  return { item, startBar: 0, bars: midis.length, beatsPerBar: bpb, windowBeats: midis.length * bpb, melody, chords: [] };
}

describe("inferChords", () => {
  it("picks I when the bar outlines the tonic triad", () => {
    const ex = excerpt([[60, 64, 67, 64]]);          // C E G E in C major
    const [c] = inferChords(ex);
    expect(c.rootPc).toBe(0);
    expect(c.sym).toBe("C");
  });
  it("picks V when the bar outlines the dominant triad", () => {
    const ex = excerpt([[67, 71, 74, 71]]);           // G B D in C major
    const [c] = inferChords(ex);
    expect(c.rootPc).toBe(7);
    expect(c.sym).toBe("G");
  });
  it("labels minor chords with m", () => {
    const ex = excerpt([[69, 72, 76, 72]]);           // A C E → vi (Am)
    expect(inferChords(ex)[0].sym).toBe("Am");
  });
  it("returns one chord per bar (merging repeats)", () => {
    const ex = excerpt([[60, 64, 67], [60, 64, 67]]); // two identical C bars → merged
    const chords = inferChords(ex);
    expect(chords.length).toBe(1);
    expect(chords[0].durBeats).toBeCloseTo(8, 6);
  });
});

describe("buildAccompaniment", () => {
  it("produces in-span notes for each chord", () => {
    const ex = excerpt([[60, 64, 67, 64]]);
    const chords = inferChords(ex);
    const acc = buildAccompaniment(chords, [4, 4], "seed");
    expect(acc.length).toBeGreaterThan(0);
    for (const a of acc) {
      expect(a.startBeat).toBeGreaterThanOrEqual(0);
      expect(a.startBeat + a.durBeats).toBeLessThanOrEqual(ex.windowBeats + 1e-6);
      expect(a.midi).toBeGreaterThan(20);
      expect(a.velocity).toBeGreaterThan(0);
    }
  });
  it("handles compound + waltz meters without overrunning the bar", () => {
    for (const ts of [[6, 8], [3, 4]] as [number, number][]) {
      const ex = excerpt([[67, 72, 76]], 0, "major", ts);
      const acc = buildAccompaniment(inferChords(ex), ts, "s");
      for (const a of acc) expect(a.startBeat + a.durBeats).toBeLessThanOrEqual(ex.windowBeats + 1e-6);
    }
  });
});
