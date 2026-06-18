// ── chordSymbol — sized-interval chord labels ─────────────────────────
import { describe, it, expect } from "vitest";
import { chordSymbol, sizedCode } from "./chordNotation";

describe("chordSymbol", () => {
  it("a genuine perfect 5th is implied (hidden)", () => {
    // I major triad: 1 + sM3 + perfect 5th.
    const sym = chordSymbol([0, 386, 702]);
    expect(sym).toBe("I sM3");
  });

  it("a large fifth is named as an altered 5th (A5), never 'l5' or a bare 'no5'", () => {
    // V triad whose 5th sizes as a LARGE fifth (≈729¢ above the root) — the
    // 50-EDO case the user hit.  It must SAY what replaces the perfect 5th.
    expect(sizedCode(729)).toBe("l5");
    const sym = chordSymbol([702, 702 + 435, 702 + 729]);
    expect(sym).toBe("5 V lM3 A5");
    expect(sym).not.toContain("l5");      // no stray, self-contradicting 5-code
    expect(sym).not.toContain("no5");     // the interval is named, not just "missing"
  });

  it("a small fifth is named as a diminished 5th (d5)", () => {
    expect(sizedCode(660)).toBe("s5");
    const sym = chordSymbol([0, 408, 660]);  // 1 + M3 + s5
    expect(sym).toContain("d5");
    expect(sym).not.toContain("s5");
    expect(sym).not.toContain("no5");
  });

  it("a tempered (in-band) perfect 5th shows as d5 / A5", () => {
    expect(sizedCode(720)).toBe("5");                 // within the 5-band
    const sym = chordSymbol([0, 408, 720]);           // 1 + M3 + sharp 5
    expect(sym).toContain("A5");
    expect(sym).not.toContain("no5");
  });

  it("no5 only when the 5th slot is a genuinely different degree, and that tone is shown", () => {
    // 1 + sM3 + a minor-6th-region tone (no 5-region tone at all): the symbol
    // must both flag no5 AND show the interval that's actually there.
    const sym = chordSymbol([0, 386, 792]);
    expect(sym).toContain("no5");
    expect(sym).toContain("m6");           // the replacing interval is specified
  });
});
