// ── chordSymbol — sized-interval chord labels ─────────────────────────
import { describe, it, expect } from "vitest";
import { chordSymbol, sizedCode } from "./chordNotation";

describe("chordSymbol", () => {
  it("a genuine perfect 5th is implied (hidden)", () => {
    // I major triad: 1 + sM3 + perfect 5th.
    const sym = chordSymbol([0, 386, 702]);
    expect(sym).toBe("I sM3");
  });

  it("a large fifth shows its raw code (l5) and is still a 5th — no no5", () => {
    // V triad whose 5th sizes as a LARGE fifth (≈729¢ above the root) — the
    // 50-EDO case the user hit.  Raw Schulter code only; no d5/A5, no no5.
    expect(sizedCode(729)).toBe("l5");
    const sym = chordSymbol([702, 702 + 435, 702 + 729]);
    expect(sym).toBe("5 V lM3 l5");
    expect(sym).not.toContain("no5");
    expect(sym).not.toMatch(/[dA]5/);     // never d5 / A5
  });

  it("a small fifth shows its raw code (s5) — no no5", () => {
    expect(sizedCode(660)).toBe("s5");
    const sym = chordSymbol([0, 408, 660]);  // 1 + M3 + s5
    expect(sym).toBe("I M3 s5");
    expect(sym).not.toContain("no5");
  });

  it("any tone that codes as a 5 is implied, never relabelled d5/A5", () => {
    expect(sizedCode(720)).toBe("5");        // an 18¢-sharp tone still codes "5"
    const sym = chordSymbol([0, 408, 720]);  // 1 + M3 + (sharp) 5
    expect(sym).toBe("I M3");                // implied, hidden
    expect(sym).not.toMatch(/[dA]5/);
  });

  it("no5 only when the 5th slot is a NON-fifth degree, shown by its raw code", () => {
    // 1 + sM3 + a minor-6th-region tone (no 5-region tone at all): say no5 AND
    // show the interval that's actually there (m6), using our coded interval.
    const sym = chordSymbol([0, 386, 792]);
    expect(sizedCode(792)).toBe("m6");
    expect(sym).toContain("no5");
    expect(sym).toContain("m6");
  });
});
