// ── chordSymbol — sized-interval chord labels ─────────────────────────
import { describe, it, expect } from "vitest";
import { chordSymbol, sizedCode } from "./chordNotation";

describe("chordSymbol", () => {
  it("a genuine perfect 5th is implied (hidden)", () => {
    // I major triad: 1 + sM3 + perfect 5th.
    const sym = chordSymbol([0, 386, 702]);
    expect(sym).toBe("I sM3");
  });

  it("a small / large fifth reads as no5, never a contradictory 'l5 no5'", () => {
    // V triad whose 5th sizes as a LARGE fifth (≈729¢ above the root) — the
    // 50-EDO case the user hit: the symbol used to print 'l5' AND 'no5'.
    expect(sizedCode(729)).toBe("l5");
    const sym = chordSymbol([702, 702 + 435, 702 + 729]);
    expect(sym).toContain("no5");
    expect(sym).not.toContain("l5");      // no stray, self-contradicting 5-code
    expect(sym).toBe("5 V lM3 no5");
  });

  it("a small fifth with a 3rd also reads as no5", () => {
    expect(sizedCode(660)).toBe("s5");
    const sym = chordSymbol([0, 408, 660]);  // 1 + M3 + s5
    expect(sym).toContain("no5");
    expect(sym).not.toContain("s5");
  });

  it("a small / large fifth is still shown when there is no 3rd (power shape)", () => {
    // Root + l5 only — no 3rd, so there's nothing to disambiguate; keep it.
    const sym = chordSymbol([0, 729]);
    expect(sym).toContain("l5");
    expect(sym).not.toContain("no5");
  });

  it("a tempered (but in-band) perfect 5th still shows as d5 / A5", () => {
    expect(sizedCode(720)).toBe("5");                 // within the 5-band
    const sym = chordSymbol([0, 408, 720]);           // 1 + M3 + sharp 5
    expect(sym).toContain("A5");
    expect(sym).not.toContain("no5");
  });
});
