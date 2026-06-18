import { describe, it, expect } from "vitest";
import { getSpectrumChromaticMap } from "./intervalCodes";
import { degreeMapFromScale } from "./edoData";

describe("sized chromaticism", () => {
  it("31-EDO palette has small/center/large minor-3rd + tritone variants", () => {
    const m = getSpectrumChromaticMap(31);
    const keys = Object.keys(m);
    // distinct minor-3rd-region variants
    expect(keys).toContain("sm3");
    expect(keys).toContain("m3");
    expect(keys).toContain("lm3");
    // tritone variants
    expect(keys.some(k => /^s?l?T$/.test(k))).toBe(true);
    expect(m["sm3"]).not.toBe(m["lm3"]);   // genuinely different steps
  });
  it("a small-minor scale names its 3rd as a sized code (not just b3)", () => {
    // Small Minor diatonic-ish in 31: 1, M2, sm3, 4, 5, sm6, sm7
    const steps = [0, 5, 7, 13, 18, 20, 26];
    const map = degreeMapFromScale(31, steps);
    // sized name for the 3rd present, AND standard b3 maps to the SAME sized step
    expect("sm3" in map).toBe(true);
    expect(map["b3"]).toBe(map["sm3"]);
  });
});
