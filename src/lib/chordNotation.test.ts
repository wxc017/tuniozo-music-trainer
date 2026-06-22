// ── chordSymbol — sized-interval chord labels ─────────────────────────
import { describe, it, expect } from "vitest";
import { chordSymbol, sizedCode, sizedCodeAtDegree } from "./chordNotation";

describe("sizedCodeAtDegree", () => {
  it("forces a degree even when the tone tempers into a neighbouring family", () => {
    // ~635¢ globally sizes as a small fifth, but as a known 11th (a fourth) it
    // must read as a large fourth — the bug where the 11th vanished as a 5th.
    expect(sizedCode(635)).toBe("s5");
    expect(sizedCodeAtDegree(635, 4)).toBe("l4");
    // a normal 9th (sized 2nd) and 13th (sized 6th)
    expect(sizedCodeAtDegree(204, 2)).toBe("M2");
    expect(sizedCodeAtDegree(884, 6)).toBe("sM6");
  });
});

describe("chordSymbol (canonical form C: {set}/anchor)", () => {
  it("keeps the perfect 5th explicit in the set, over a tonic anchor of 1", () => {
    // I major triad: 1 + sM3 + perfect 5th.
    expect(chordSymbol([0, 386, 702])).toBe("{sM3 5}/1");
  });

  it("a large fifth shows its raw code (l5) in the set, over its anchor", () => {
    // V triad whose 5th sizes as a LARGE fifth (≈729¢ above the root) — the
    // 50-EDO case.  Raw Schulter code only; no d5/A5.
    expect(sizedCode(729)).toBe("l5");
    const sym = chordSymbol([702, 702 + 435, 702 + 729]);
    expect(sym).toBe("{lM3 l5}/5");
    expect(sym).not.toMatch(/[dA]5/);     // never d5 / A5
  });

  it("a small fifth shows its raw code (s5)", () => {
    expect(sizedCode(660)).toBe("s5");
    const sym = chordSymbol([0, 408, 660]);  // 1 + M3 + s5
    expect(sym).toBe("{M3 s5}/1");
  });

  it("a tone that codes as a 5 stays a 5, never relabelled d5/A5", () => {
    expect(sizedCode(720)).toBe("5");        // an 18¢-sharp tone still codes "5"
    const sym = chordSymbol([0, 408, 720]);  // 1 + M3 + (sharp) 5
    expect(sym).toBe("{M3 5}/1");
    expect(sym).not.toMatch(/[dA]5/);
  });

  it("a missing 5th simply isn't listed — the set tells the whole truth", () => {
    // 1 + sM3 + a minor-6th-region tone (no 5-region tone at all): the set just
    // shows what's there (sM3, m6) and carries no fifth member.
    expect(sizedCode(792)).toBe("m6");
    const sym = chordSymbol([0, 386, 792]);
    expect(sym).toBe("{sM3 m6}/1");
    expect(sym).not.toContain("no5");        // absence of a 5 member = no fifth
  });
});
