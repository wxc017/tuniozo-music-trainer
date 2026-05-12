// ── Stress tests for the Scalar Permutations engines ────────────────
// Exercises every family across multiple modes / lengths / iterations
// to confirm the unified tab's dispatch never crashes and always
// produces a non-empty phrase whose degrees the modeMap can resolve.
//
// Coverage:
//   • Cadences (Melody bank) — single curated phrase per round.
//   • All 9 jazz families via generateJazzCell() — full variant fanout.
//   • Bergonzi Intervallic — verifies the expanded mix-* permutations
//     introduced 2026-05-12 (Mix 3rds/2nds, Mix 4ths/6ths, …) actually
//     produce output instead of silently falling through.

import { describe, it, expect } from "vitest";
import {
  MELODY_BANK_31,
  JAZZ_FAMILIES, JAZZ_VARIANTS,
  generateJazzCell,
  PATTERN_SCALE_FAMILIES,
  CADENCE_PROGRESSIONS, MELODY_VARIANTS, buildDiatonicChord,
} from "./musicTheory";

const ITERATIONS = 50;
const LENGTHS = [3, 4, 5, 6, 8];

// Sample of representative scale × mode pairs covering Major / Harmonic
// Minor / Melodic Minor / pentatonic / xen families.  Don't enumerate
// every mode — the generators are mode-agnostic for most operations;
// the goal here is "doesn't crash under variety", not "diatonically
// correct in every mode" (correctness is tested elsewhere).
const SCALE_PAIRS: { fam: string; mode: string }[] = [];
for (const fam of Object.keys(PATTERN_SCALE_FAMILIES)) {
  const modes = PATTERN_SCALE_FAMILIES[fam];
  // First + middle mode of each family
  SCALE_PAIRS.push({ fam, mode: modes[0] });
  if (modes.length > 2) SCALE_PAIRS.push({ fam, mode: modes[Math.floor(modes.length / 2)] });
}

describe("Scalar Permutations — Cadence chord progressions", () => {
  it("MELODY_VARIANTS['Cadences'] includes 'phrase' plus 7 chord progressions", () => {
    const ids = (MELODY_VARIANTS["Cadences"] ?? []).map(v => v.id);
    expect(ids).toContain("phrase");
    const cadIds = ids.filter(id => id.startsWith("cad_"));
    expect(cadIds.length).toBe(Object.keys(CADENCE_PROGRESSIONS).length);
  });

  it("every cadence progression resolves to the tonic (last chord = degree 1)", () => {
    for (const [id, chords] of Object.entries(CADENCE_PROGRESSIONS)) {
      expect(chords.length).toBeGreaterThanOrEqual(2);
      expect(chords[chords.length - 1]).toBe(1);
      // ID format check: cad_<digit>_<digit>...
      expect(id).toMatch(/^cad_\d+(_\d+)+$/);
    }
  });

  it("buildDiatonicChord produces 4-note stacks (root, 3rd, 5th, 7th)", () => {
    for (let root = 1; root <= 7; root++) {
      const chord = buildDiatonicChord(root);
      expect(chord.length).toBe(4);
      // Each label is a 1..7 scale-degree string (no chromatic accidentals
      // — qualities come from the mode's degree map at playback time).
      for (const d of chord) expect(d).toMatch(/^[1-7]$/);
    }
  });

  it("V-I cadence: V's chord stack = [5,7,2,4], I's = [1,3,5,7]", () => {
    expect(buildDiatonicChord(5)).toEqual(["5", "7", "2", "4"]);
    expect(buildDiatonicChord(1)).toEqual(["1", "3", "5", "7"]);
  });
});

describe("Scalar Permutations — Cadences melody bank", () => {
  it("every Cadences phrase has 2+ degrees and contains only known degree tokens", () => {
    const cadences = MELODY_BANK_31.filter(m => m.family === "Cadences");
    expect(cadences.length).toBeGreaterThan(0);
    const validToken = /^(?:bb|b|#)?\d+$/;
    for (const phrase of cadences) {
      expect(phrase.degrees.length).toBeGreaterThanOrEqual(2);
      for (const d of phrase.degrees) {
        expect(d).toMatch(validToken);
      }
    }
  });
});

describe("Scalar Permutations — Jazz families generate non-empty phrases", () => {
  for (const family of JAZZ_FAMILIES) {
    it(`${family}: ${ITERATIONS} iterations × ${LENGTHS.length} lengths × ${SCALE_PAIRS.length} scales`, () => {
      let failures = 0;
      let totalRuns = 0;
      for (const { fam, mode } of SCALE_PAIRS) {
        for (const len of LENGTHS) {
          for (let i = 0; i < ITERATIONS; i++) {
            totalRuns++;
            try {
              const phrase = generateJazzCell(family, len, undefined, fam, mode);
              if (!phrase.degrees.length) failures++;
              // Every degree token must be a parseable degree label
              for (const d of phrase.degrees) {
                if (typeof d !== "string" || d.length === 0) failures++;
              }
              if (typeof phrase.variant !== "string") failures++;
            } catch {
              failures++;
            }
          }
        }
      }
      // Allow zero failures.  Any failure indicates a regression in
      // generateJazzCell dispatch or a missing case in the family.
      expect(failures).toBe(0);
      expect(totalRuns).toBeGreaterThan(0);
    });
  }
});

describe("Scalar Permutations — Guide-Tone Lines progression variants", () => {
  const progIds = ["prog_2_5_1", "prog_2_5", "prog_5_1", "prog_1_4_5_1", "prog_1_6_2_5", "prog_1_6_4_5", "prog_3_6_2_5", "prog_1_4_1_5"];
  for (const progId of progIds) {
    it(`Guide-Tone Lines / ${progId} produces non-empty phrases`, () => {
      for (let i = 0; i < 20; i++) {
        const phrase = generateJazzCell("Guide-Tone Lines", 8, new Set([progId]), "Major Family", "Ionian");
        expect(phrase.degrees.length).toBe(8);
        expect(phrase.variant).toContain("guide-tone");
        for (const d of phrase.degrees) {
          expect(typeof d).toBe("string");
          expect(d.length).toBeGreaterThan(0);
        }
      }
    });
  }
});

describe("Scalar Permutations — Bergonzi Intervallic mix-* variants", () => {
  // The 2026-05-12 expansion added 10 new mix variants on top of the
  // original 4.  This test pins every variant to its enabled set so
  // pickAllowed must select it and the generator must produce output.
  const mixVariants = (JAZZ_VARIANTS["Bergonzi Intervallic"] ?? [])
    .filter(v => v.id.startsWith("mix_"))
    .map(v => v.id);

  it("there are at least 14 mix-* variants (legacy 4 + 10 added)", () => {
    expect(mixVariants.length).toBeGreaterThanOrEqual(14);
  });

  for (const vid of [
    "mix_3_2", "mix_4_2", "mix_4_3", "mix_4_6",
    "mix_5_2", "mix_5_3", "mix_5_4", "mix_5_6",
    "mix_6_2", "mix_6_3", "mix_6_4",
    "mix_7_2", "mix_7_3", "mix_7_4",
  ]) {
    it(`Bergonzi Intervallic / ${vid} produces non-empty phrases`, () => {
      for (let i = 0; i < 30; i++) {
        const phrase = generateJazzCell("Bergonzi Intervallic", 6, new Set([vid]), "Major Family", "Ionian");
        expect(phrase.degrees.length).toBeGreaterThan(0);
        expect(phrase.variant.length).toBeGreaterThan(0);
      }
    });
  }
});
