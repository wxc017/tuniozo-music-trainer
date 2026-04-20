// ── Harmony Category Stress Tests ────────────────────────────────────
// Tests that every harmony category in generateProgression actually
// produces the expected chord types and that applied chords resolve.

import { describe, it, expect } from "vitest";
import {
  generateProgression,
  type HarmonyCategory,
  type ProgChord,
} from "./melodicPatternData";

const EDO = 31;
const TRIALS = 50; // run each test multiple times for statistical confidence

/** Generate N progressions and collect all roman numerals produced */
function collectRomans(
  cats: HarmonyCategory[],
  count = 4,
  trials = TRIALS,
): string[] {
  const catSet = new Set<HarmonyCategory>(cats);
  const allRomans: string[] = [];
  for (let t = 0; t < trials; t++) {
    const prog = generateProgression(EDO, count, catSet, "functional", 3, "both", 0);
    for (const ch of prog) allRomans.push(ch.roman);
  }
  return allRomans;
}

/** Check if V/x resolves to x (the chord immediately after V/x is at target root) */
function checkResolution(
  cats: HarmonyCategory[],
  appliedPrefix: string,
  trials = TRIALS,
): { total: number; resolved: number; examples: string[] } {
  const catSet = new Set<HarmonyCategory>(cats);
  let total = 0;
  let resolved = 0;
  const examples: string[] = [];
  for (let t = 0; t < trials; t++) {
    const prog = generateProgression(EDO, 6, catSet, "functional", 3, "both", 0);
    for (let i = 0; i < prog.length - 1; i++) {
      if (prog[i].roman.startsWith(appliedPrefix)) {
        total++;
        const target = prog[i].roman.replace(appliedPrefix, "");
        const next = prog[i + 1].roman;
        // Strict check: strip quality suffixes and compare bare numeral
        if (romanMatchesTarget(next, target)) {
          resolved++;
        } else {
          if (examples.length < 5) examples.push(`${prog[i].roman} → ${next} (expected ${target})`);
        }
      }
    }
  }
  return { total, resolved, examples };
}

function romanMatchesTarget(roman: string, target: string): boolean {
  // Strip quality suffixes to get the bare roman numeral
  // Order matters: longer suffixes first to avoid partial matches
  const strip = (s: string) => s.replace(/maj7|min7|maj|min|m7|m|7|°|ø/g, "").toLowerCase();
  return strip(roman) === strip(target);
}

// ═════════════════════════════════════════════════════════════════════
// 1. FUNCTIONAL HARMONY — diatonic chords should appear
// ═════════════════════════════════════════════════════════════════════
describe("Functional Harmony", () => {
  it("produces diatonic major chords (I, ii, iii, IV, V, vi)", () => {
    const romans = collectRomans(["functional"], 6, 100);
    const unique = new Set(romans.map(r => r.replace(/maj7|min7|7/g, "").toLowerCase()));
    // Should see at least a few different diatonic chords
    expect(unique.size).toBeGreaterThanOrEqual(3);
    console.log("  Functional chords seen:", [...unique].sort().join(", "));
  });

  it("does not produce consecutive identical chords", () => {
    const catSet = new Set<HarmonyCategory>(["functional"]);
    for (let t = 0; t < TRIALS; t++) {
      const prog = generateProgression(EDO, 6, catSet, "functional", 3, "both", 0);
      for (let i = 1; i < prog.length; i++) {
        expect(prog[i].roman).not.toBe(prog[i - 1].roman);
      }
    }
  });

  it("does not produce consecutive same-root chords (e.g. vi→vi7, iii→iii7)", () => {
    const catSet = new Set<HarmonyCategory>(["functional"]);
    for (let t = 0; t < 200; t++) {
      const prog = generateProgression(EDO, 6, catSet, "functional", 3, "both", 0);
      for (let i = 1; i < prog.length; i++) {
        if (prog[i].root === prog[i - 1].root) {
          throw new Error(`Same root ${prog[i].root} at positions ${i - 1},${i}: ${prog.map(c => c.roman).join(" → ")}`);
        }
      }
    }
  });

  it("produces musically sensible progressions (diverse roots)", () => {
    const catSet = new Set<HarmonyCategory>(["functional"]);
    let totalUnique = 0;
    const RUNS = 100;
    for (let t = 0; t < RUNS; t++) {
      const prog = generateProgression(EDO, 4, catSet, "functional", 3, "both", 0);
      const uniqueRoots = new Set(prog.map(c => c.root));
      totalUnique += uniqueRoots.size;
    }
    const avgUnique = totalUnique / RUNS;
    console.log(`  Avg unique roots per 4-chord progression: ${avgUnique.toFixed(1)}/4`);
    // Should average at least 3 different roots in a 4-chord progression
    expect(avgUnique).toBeGreaterThanOrEqual(3);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 2. MODAL INTERCHANGE — borrowed chords should appear
// ═════════════════════════════════════════════════════════════════════
describe("Modal Interchange", () => {
  it("produces borrowed chords (bVII, bVI, bIII, iv) when selected", () => {
    const romans = collectRomans(["functional", "modal"], 6, 100);
    const romanStr = romans.join(" ");
    // At least one of the modal chords should appear across 100 trials
    const hasModal = /bVII|bVI|bIII|iv[^°]|♭VII|♭VI|♭III/i.test(romanStr);
    if (!hasModal) {
      console.log("  WARNING: No modal chords found in", romans.length, "chords");
      console.log("  Sample romans:", [...new Set(romans)].sort().join(", "));
    }
    expect(hasModal).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 3. SECONDARY DOMINANTS — V/x must resolve to x
// ═════════════════════════════════════════════════════════════════════
describe("Secondary Dominants", () => {
  it("produces V/x chords when selected", () => {
    const romans = collectRomans(["functional", "secdom"], 6, 100);
    const hasSecDom = romans.some(r => r.startsWith("V/"));
    if (!hasSecDom) {
      console.log("  WARNING: No V/x chords in", romans.length, "chords");
      console.log("  Unique romans:", [...new Set(romans)].sort().join(", "));
    }
    expect(hasSecDom).toBe(true);
  });

  it("V/x resolves to x", () => {
    const result = checkResolution(["functional", "secdom"], "V/");
    console.log(`  V/x resolution: ${result.resolved}/${result.total} (${result.total > 0 ? Math.round(result.resolved / result.total * 100) : 0}%)`);
    if (result.examples.length > 0) {
      console.log("  Failed resolutions:", result.examples.join("; "));
    }
    if (result.total > 0) {
      expect(result.resolved / result.total).toBeGreaterThanOrEqual(0.9);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// 4. SECONDARY DIMINISHED — vii°/x must resolve to x
// ═════════════════════════════════════════════════════════════════════
describe("Secondary Diminished", () => {
  it("produces vii°/x chords when selected", () => {
    const romans = collectRomans(["functional", "secdim"], 6, 100);
    const hasSecDim = romans.some(r => r.includes("°/") || r.includes("ø/"));
    if (!hasSecDim) {
      console.log("  WARNING: No vii°/x chords in", romans.length, "chords");
      console.log("  Unique romans:", [...new Set(romans)].sort().join(", "));
    }
    expect(hasSecDim).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 5. NEAPOLITAN — bII should appear and resolve to V
// ═════════════════════════════════════════════════════════════════════
describe("Neapolitan", () => {
  it("produces bII when selected", () => {
    const romans = collectRomans(["functional", "neapolitan"], 6, 100);
    const hasNea = romans.some(r => r.includes("bII") || r.includes("♭II"));
    if (!hasNea) {
      console.log("  WARNING: No bII chords in", romans.length, "chords");
      console.log("  Unique romans:", [...new Set(romans)].sort().join(", "));
    }
    expect(hasNea).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 6. TRITONE SUBSTITUTIONS — TT/x should appear and resolve
// ═════════════════════════════════════════════════════════════════════
describe("Tritone Substitutions", () => {
  it("produces TT/x chords when selected", () => {
    const romans = collectRomans(["functional", "tritone"], 6, 100);
    const hasTT = romans.some(r => r.startsWith("TT/"));
    if (!hasTT) {
      console.log("  WARNING: No TT/x chords in", romans.length, "chords");
      console.log("  Unique romans:", [...new Set(romans)].sort().join(", "));
    }
    expect(hasTT).toBe(true);
  });

  it("TT/x resolves to target", () => {
    const result = checkResolution(["functional", "tritone"], "TT/");
    console.log(`  TT/x resolution: ${result.resolved}/${result.total} (${result.total > 0 ? Math.round(result.resolved / result.total * 100) : 0}%)`);
    if (result.examples.length > 0) {
      console.log("  Failed resolutions:", result.examples.join("; "));
    }
    if (result.total > 0) {
      expect(result.resolved / result.total).toBeGreaterThanOrEqual(0.8);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// 7. CHROMATIC MEDIANTS — third-related chords should appear
// ═════════════════════════════════════════════════════════════════════
describe("Chromatic Mediants", () => {
  it("produces chromatic mediant chords when selected", () => {
    const romans = collectRomans(["functional", "mediants"], 6, 100);
    // Chromatic mediants include III (major), biii (minor), bvi (minor), VI (major)
    const unique = [...new Set(romans)];
    console.log("  Mediants unique romans:", unique.sort().join(", "));
    // Should see at least one chord that's not standard diatonic
    const diatonic = new Set(["I", "Imaj7", "ii", "ii7", "iii", "iii7", "IV", "IVmaj7", "V", "V7", "vi", "vi7", "vii°",
      "i", "i7", "ii°", "III", "IIImaj7", "iv", "iv7", "v", "v7", "VI", "VImaj7", "VII", "VII7", "vii°"]);
    const nonDiatonic = unique.filter(r => !diatonic.has(r));
    expect(nonDiatonic.length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 8. ALL CATEGORIES COMBINED — smoke test
// ═════════════════════════════════════════════════════════════════════
describe("All categories combined", () => {
  it("produces a mix of chord types", () => {
    const allCats: HarmonyCategory[] = ["functional", "modal", "secdom", "secdim", "neapolitan", "tritone", "mediants"];
    const romans = collectRomans(allCats, 8, 50);
    const unique = [...new Set(romans)];
    console.log("  All-cats unique romans:", unique.sort().join(", "));
    // Should see significant variety
    expect(unique.length).toBeGreaterThanOrEqual(6);
  });
});
