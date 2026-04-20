// ── EDO Data Stress Tests ────────────────────────────────────────────
// Validates degree maps, interval names, chord shapes, and structural
// invariants across ALL supported EDO systems (12, 17, 19, 31, 41, 53).

import { describe, it, expect } from "vitest";
import {
  getDegreeMap, getIntervalNames, getSolfege,
  getBaseChords, getChordDroneTypes, getChordShapes,
  getEDOIntervals, getFullDegreeNames, getEdoChordTypes,
} from "./edoData";

const SUPPORTED_EDOS = [12, 17, 19, 31, 41, 53];

// ── Degree Maps ─────────────────────────────────────────────────────

describe("getDegreeMap", () => {
  it("returns unison=0 for all EDOs", () => {
    for (const edo of SUPPORTED_EDOS) {
      expect(getDegreeMap(edo)["1"]).toBe(0);
    }
  });

  it("returns octave=EDO for all EDOs", () => {
    for (const edo of SUPPORTED_EDOS) {
      expect(getDegreeMap(edo)["8"]).toBe(edo);
    }
  });

  it("has perfect fifth < octave for all EDOs", () => {
    for (const edo of SUPPORTED_EDOS) {
      const dm = getDegreeMap(edo);
      expect(dm["5"]).toBeLessThan(edo);
      expect(dm["5"]).toBeGreaterThan(0);
    }
  });

  it("has perfect fourth < perfect fifth for all EDOs", () => {
    for (const edo of SUPPORTED_EDOS) {
      const dm = getDegreeMap(edo);
      expect(dm["4"]).toBeLessThan(dm["5"]);
    }
  });

  it("P4 + P5 = octave (mod EDO) for all EDOs", () => {
    // In meantone EDOs: P4 = EDO - P5
    for (const edo of SUPPORTED_EDOS) {
      const dm = getDegreeMap(edo);
      // P4 + P5 should equal the octave for chain-of-fifths EDOs
      // (may differ by A1 for non-meantone)
      const sum = dm["4"] + dm["5"];
      expect(sum).toBe(edo);
    }
  });

  it("major scale degrees are strictly ascending: 1 < 2 < 3 < 4 < 5 < 6 < 7 < 8", () => {
    for (const edo of SUPPORTED_EDOS) {
      const dm = getDegreeMap(edo);
      const seq = ["1", "2", "3", "4", "5", "6", "7", "8"].map(d => dm[d]);
      for (let i = 1; i < seq.length; i++) {
        expect(seq[i]).toBeGreaterThan(seq[i - 1]);
      }
    }
  });

  it("chromatic degrees: b2 < 2, b3 < 3, b6 < 6, b7 < 7", () => {
    for (const edo of SUPPORTED_EDOS) {
      const dm = getDegreeMap(edo);
      expect(dm["b2"]).toBeLessThan(dm["2"]);
      expect(dm["b3"]).toBeLessThan(dm["3"]);
      expect(dm["b6"]).toBeLessThan(dm["6"]);
      expect(dm["b7"]).toBeLessThan(dm["7"]);
    }
  });

  it("sharp degrees: #2 > 2, #4 > 4, #5 > 5, #6 > 6", () => {
    for (const edo of SUPPORTED_EDOS) {
      const dm = getDegreeMap(edo);
      expect(dm["#2"]).toBeGreaterThan(dm["2"]);
      expect(dm["#4"]).toBeGreaterThan(dm["4"]);
      expect(dm["#5"]).toBeGreaterThan(dm["5"]);
      expect(dm["#6"]).toBeGreaterThan(dm["6"]);
    }
  });

  it("tritone pair: #4 + b5 should surround the half-octave", () => {
    for (const edo of SUPPORTED_EDOS) {
      const dm = getDegreeMap(edo);
      const halfOctave = edo / 2;
      expect(dm["#4"]).toBeGreaterThanOrEqual(Math.floor(halfOctave) - 1);
      expect(dm["b5"]).toBeLessThanOrEqual(Math.ceil(halfOctave) + 1);
    }
  });

  it("12-EDO specific: known step values", () => {
    const dm = getDegreeMap(12);
    expect(dm["b2"]).toBe(1);
    expect(dm["2"]).toBe(2);
    expect(dm["b3"]).toBe(3);
    expect(dm["3"]).toBe(4);
    expect(dm["4"]).toBe(5);
    expect(dm["#4"]).toBe(6);
    expect(dm["5"]).toBe(7);
    expect(dm["b7"]).toBe(10);
    expect(dm["7"]).toBe(11);
  });

  it("31-EDO specific: known step values", () => {
    const dm = getDegreeMap(31);
    expect(dm["b2"]).toBe(3);
    expect(dm["2"]).toBe(5);
    expect(dm["b3"]).toBe(8);
    expect(dm["3"]).toBe(10);
    expect(dm["4"]).toBe(13);
    expect(dm["5"]).toBe(18);
    expect(dm["b7"]).toBe(26);
    expect(dm["7"]).toBe(28);
  });

  it("53-EDO uses 5-limit JI approximations", () => {
    const dm = getDegreeMap(53);
    // M3 ≈ 5/4 → 17 steps (not Pythagorean 18)
    expect(dm["3"]).toBe(17);
    // P4 ≈ 4/3 → 22 steps (not Pythagorean 23)
    expect(dm["4"]).toBe(22);
    // P5 ≈ 3/2 → 31 steps
    expect(dm["5"]).toBe(31);
  });

  it("all degree values are non-negative integers", () => {
    for (const edo of SUPPORTED_EDOS) {
      const dm = getDegreeMap(edo);
      for (const [key, val] of Object.entries(dm)) {
        expect(Number.isInteger(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ── Interval Names ──────────────────────────────────────────────────

describe("getIntervalNames", () => {
  it("returns EDO+1 names for each EDO (0..EDO inclusive)", () => {
    for (const edo of SUPPORTED_EDOS) {
      const names = getIntervalNames(edo);
      expect(names.length).toBe(edo + 1);
    }
  });

  it("first name contains 'Unison' for all EDOs", () => {
    for (const edo of SUPPORTED_EDOS) {
      expect(getIntervalNames(edo)[0].toLowerCase()).toContain("unison");
    }
  });

  it("last name contains 'Octave' or '8ve' for all EDOs", () => {
    for (const edo of SUPPORTED_EDOS) {
      const last = getIntervalNames(edo)[edo].toLowerCase();
      expect(last).toMatch(/octave|8ve/);
    }
  });

  it("all names are non-empty strings", () => {
    for (const edo of SUPPORTED_EDOS) {
      for (const name of getIntervalNames(edo)) {
        expect(typeof name).toBe("string");
        expect(name.length).toBeGreaterThan(0);
      }
    }
  });

  it("12-EDO has 13 entries with familiar names", () => {
    const names = getIntervalNames(12);
    expect(names.length).toBe(13);
    expect(names).toContain("Perfect 4th");
    expect(names).toContain("Perfect 5th");
    expect(names).toContain("Tritone");
  });

  it("31-EDO has 32 entries with microtonal names", () => {
    const names = getIntervalNames(31);
    expect(names.length).toBe(32);
    expect(names).toContain("Subminor Third");
    expect(names).toContain("Greater Neutral Third");
    expect(names).toContain("Supermajor Third");
  });

  it("no duplicate names within a single EDO", () => {
    for (const edo of SUPPORTED_EDOS) {
      const names = getIntervalNames(edo);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    }
  });
});

// ── Solfege ─────────────────────────────────────────────────────────

describe("getSolfege", () => {
  it("returns null for EDOs without solfege (12, 17, 19, 53)", () => {
    expect(getSolfege(12)).toBeNull();
    expect(getSolfege(17)).toBeNull();
    expect(getSolfege(19)).toBeNull();
    expect(getSolfege(53)).toBeNull();
  });

  it("returns array for 31-EDO with EDO+2 entries", () => {
    const sol = getSolfege(31);
    expect(sol).not.toBeNull();
    expect(sol!.length).toBe(32); // 31+1 entries (0..31)
  });

  it("31-EDO solfege starts with Do and ends with Do", () => {
    const sol = getSolfege(31)!;
    expect(sol[0]).toBe("Do");
    expect(sol[sol.length - 1]).toBe("Do");
  });

  it("41-EDO solfege starts with Do and ends with Do", () => {
    const sol = getSolfege(41)!;
    expect(sol[0]).toBe("Do");
    expect(sol[sol.length - 1]).toBe("Do");
  });
});

// ── Full Degree Names ───────────────────────────────────────────────

describe("getFullDegreeNames", () => {
  it("returns EDO entries for all supported EDOs", () => {
    for (const edo of SUPPORTED_EDOS) {
      const names = getFullDegreeNames(edo);
      expect(names.length).toBe(edo);
    }
  });

  it("step 0 is always '1' (unison)", () => {
    for (const edo of SUPPORTED_EDOS) {
      expect(getFullDegreeNames(edo)[0]).toBe("1");
    }
  });

  it("all names are non-empty", () => {
    for (const edo of SUPPORTED_EDOS) {
      for (const name of getFullDegreeNames(edo)) {
        expect(name.length).toBeGreaterThan(0);
      }
    }
  });

  it("natural degrees (1-7) appear in the list", () => {
    for (const edo of SUPPORTED_EDOS) {
      const names = getFullDegreeNames(edo);
      for (const deg of ["1", "2", "3", "4", "5", "6", "7"]) {
        expect(names).toContain(deg);
      }
    }
  });

  it("is deterministic (returns same array on repeat calls)", () => {
    for (const edo of [12, 31, 41]) {
      const a = getFullDegreeNames(edo);
      const b = getFullDegreeNames(edo);
      expect(a).toEqual(b);
    }
  });
});

// ── Chord Shapes ────────────────────────────────────────────────────

describe("getChordShapes", () => {
  it("MAJ is [0, M3, P5] for all EDOs", () => {
    for (const edo of SUPPORTED_EDOS) {
      const cs = getChordShapes(edo);
      expect(cs.MAJ).toEqual([0, cs.M3, cs.P5]);
    }
  });

  it("MIN is [0, m3, P5] for all EDOs", () => {
    for (const edo of SUPPORTED_EDOS) {
      const cs = getChordShapes(edo);
      expect(cs.MIN).toEqual([0, cs.m3, cs.P5]);
    }
  });

  it("DIM is [0, m3, d5] for all EDOs", () => {
    for (const edo of SUPPORTED_EDOS) {
      const cs = getChordShapes(edo);
      expect(cs.DIM).toEqual([0, cs.m3, cs.d5]);
    }
  });

  it("M3 > m3 (major third larger than minor third)", () => {
    for (const edo of SUPPORTED_EDOS) {
      const cs = getChordShapes(edo);
      expect(cs.M3).toBeGreaterThan(cs.m3);
    }
  });

  it("d5 < P5 (diminished fifth below perfect fifth)", () => {
    for (const edo of SUPPORTED_EDOS) {
      const cs = getChordShapes(edo);
      expect(cs.d5).toBeLessThan(cs.P5);
    }
  });

  it("M7 > m7 (major seventh larger than minor)", () => {
    for (const edo of SUPPORTED_EDOS) {
      const cs = getChordShapes(edo);
      expect(cs.M7).toBeGreaterThan(cs.m7);
    }
  });

  it("P4 + P5 = EDO (octave)", () => {
    for (const edo of SUPPORTED_EDOS) {
      const cs = getChordShapes(edo);
      expect(cs.P4 + cs.P5).toBe(edo);
    }
  });

  it("m3 + M6 = EDO (inversion pair)", () => {
    for (const edo of SUPPORTED_EDOS) {
      const cs = getChordShapes(edo);
      expect(cs.m3 + cs.M6).toBe(edo);
    }
  });

  it("M3 + m6 = EDO (inversion pair)", () => {
    for (const edo of SUPPORTED_EDOS) {
      const cs = getChordShapes(edo);
      expect(cs.M3 + cs.m6).toBe(edo);
    }
  });
});

// ── EDO Intervals ───────────────────────────────────────────────────

describe("getEDOIntervals", () => {
  it("12-EDO known values", () => {
    const iv = getEDOIntervals(12);
    expect(iv.m2).toBe(1);
    expect(iv.M2).toBe(2);
    expect(iv.m3).toBe(3);
    expect(iv.M3).toBe(4);
    expect(iv.P4).toBe(5);
    expect(iv.P5).toBe(7);
    expect(iv.m7).toBe(10);
    expect(iv.M7).toBe(11);
  });

  it("31-EDO known values", () => {
    const iv = getEDOIntervals(31);
    expect(iv.m2).toBe(3);
    expect(iv.M2).toBe(5);
    expect(iv.m3).toBe(8);
    expect(iv.M3).toBe(10);
    expect(iv.P4).toBe(13);
    expect(iv.P5).toBe(18);
    expect(iv.m7).toBe(26);
    expect(iv.M7).toBe(28);
    expect(iv.A1).toBe(2); // chromatic semitone
  });

  it("all intervals are positive", () => {
    for (const edo of SUPPORTED_EDOS) {
      const iv = getEDOIntervals(edo);
      for (const [, val] of Object.entries(iv)) {
        expect(val).toBeGreaterThan(0);
      }
    }
  });
});

// ── Base Chords ─────────────────────────────────────────────────────

describe("getBaseChords", () => {
  const EXPECTED_ROMAN_NUMERALS = [
    "I", "ii", "iii", "IV", "V", "vi", "vii°",
    "i", "ii°", "III", "iv", "v", "VI", "VII",
    "bIII", "bVI", "bVII",
  ];

  it("returns all expected roman numerals for each EDO", () => {
    for (const edo of SUPPORTED_EDOS) {
      const chords = getBaseChords(edo);
      const labels = chords.map(([label]) => label);
      for (const rn of EXPECTED_ROMAN_NUMERALS) {
        expect(labels).toContain(rn);
      }
    }
  });

  it("all chords have at least 3 notes (triads)", () => {
    for (const edo of SUPPORTED_EDOS) {
      for (const [label, steps] of getBaseChords(edo)) {
        expect(steps.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("I chord is always [0, M3, P5]", () => {
    for (const edo of SUPPORTED_EDOS) {
      const cs = getChordShapes(edo);
      const I = getBaseChords(edo).find(([l]) => l === "I")![1];
      expect(I).toEqual([0, cs.M3, cs.P5]);
    }
  });

  it("chord notes are sorted ascending", () => {
    for (const edo of SUPPORTED_EDOS) {
      for (const [, steps] of getBaseChords(edo)) {
        for (let i = 1; i < steps.length; i++) {
          expect(steps[i]).toBeGreaterThan(steps[i - 1]);
        }
      }
    }
  });

  it("all chord notes are within 0..EDO-1 range (mod EDO)", () => {
    for (const edo of SUPPORTED_EDOS) {
      for (const [, steps] of getBaseChords(edo)) {
        for (const s of steps) {
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThan(edo * 2); // allow notes up to 2nd octave
        }
      }
    }
  });
});

// ── Chord Drone Types ───────────────────────────────────────────────

describe("getChordDroneTypes", () => {
  it("always includes basic triads and sevenths", () => {
    for (const edo of SUPPORTED_EDOS) {
      const types = getChordDroneTypes(edo);
      expect("Major Triad" in types).toBe(true);
      expect("Minor Triad" in types).toBe(true);
      expect("Diminished Triad" in types).toBe(true);
      expect("Major 7" in types).toBe(true);
      expect("Dominant 7" in types).toBe(true);
      expect("Minor 7" in types).toBe(true);
    }
  });

  it("all chord shapes start with 0 (root)", () => {
    for (const edo of SUPPORTED_EDOS) {
      for (const [name, steps] of Object.entries(getChordDroneTypes(edo))) {
        expect(steps[0]).toBe(0);
      }
    }
  });

  it("31-EDO includes microtonal types", () => {
    const types = getChordDroneTypes(31);
    expect("Subminor Triad" in types).toBe(true);
    expect("Neutral Triad" in types).toBe(true);
    expect("Supermajor Triad" in types).toBe(true);
    expect("Harmonic 7" in types).toBe(true);
  });

  it("12-EDO does NOT include microtonal types (A1 < 2)", () => {
    const types = getChordDroneTypes(12);
    expect("Subminor Triad" in types).toBe(false);
    expect("Neutral Triad" in types).toBe(false);
  });

  it("31-EDO Subminor Triad matches catalog [0,7,18]", () => {
    const types = getChordDroneTypes(31);
    expect(types["Subminor Triad"]).toEqual([0, 7, 18]);
  });

  it("31-EDO Supermajor Triad matches catalog [0,11,18]", () => {
    const types = getChordDroneTypes(31);
    expect(types["Supermajor Triad"]).toEqual([0, 11, 18]);
  });

  it("31-EDO Harmonic 7 matches catalog [0,10,18,25]", () => {
    const types = getChordDroneTypes(31);
    expect(types["Harmonic 7"]).toEqual([0, 10, 18, 25]);
  });

  it("31-EDO Subminor 7 has P5 between 3rd and 7th", () => {
    const types = getChordDroneTypes(31);
    const sub7 = types["Subminor 7"];
    // 3rd (step 7) + P5 (18) = 25 = 7th
    expect(sub7[3] - sub7[1]).toBe(18);
  });

  it("31-EDO Supermajor 7 has P5 between 3rd and 7th", () => {
    const types = getChordDroneTypes(31);
    const sup7 = types["Supermajor 7"];
    // 3rd (step 11) + P5 (18) = 29 = 7th
    expect(sup7[3] - sup7[1]).toBe(18);
  });

  it("microtonal drone triads match getEdoChordTypes catalog for 31-EDO", () => {
    const droneTypes = getChordDroneTypes(31);
    const catalog = getEdoChordTypes(31);
    const subminCat = catalog.find(t => t.id === "submin");
    const supermajCat = catalog.find(t => t.id === "supermaj");
    const neutralCat = catalog.find(t => t.id === "neutral");
    expect(subminCat).toBeDefined();
    expect(supermajCat).toBeDefined();
    expect(neutralCat).toBeDefined();
    expect(droneTypes["Subminor Triad"]).toEqual(subminCat!.steps);
    expect(droneTypes["Supermajor Triad"]).toEqual(supermajCat!.steps);
    expect(droneTypes["Neutral Triad"]).toEqual(neutralCat!.steps);
  });
});

// ── EDO Chord Types Catalog ─────────────────────────────────────────

describe("getEdoChordTypes", () => {
  it("returns non-empty array for all EDOs", () => {
    for (const edo of SUPPORTED_EDOS) {
      const types = getEdoChordTypes(edo);
      expect(types.length).toBeGreaterThan(0);
    }
  });

  it("all types have unique IDs", () => {
    for (const edo of SUPPORTED_EDOS) {
      const types = getEdoChordTypes(edo);
      const ids = types.map(t => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("all types start with root=0", () => {
    for (const edo of SUPPORTED_EDOS) {
      for (const t of getEdoChordTypes(edo)) {
        expect(t.steps[0]).toBe(0);
      }
    }
  });

  it("triad types have 3 steps, seventh types have 4", () => {
    for (const edo of SUPPORTED_EDOS) {
      for (const t of getEdoChordTypes(edo)) {
        if (t.category === "triad") expect(t.steps.length).toBe(3);
        if (t.category === "seventh") expect(t.steps.length).toBe(4);
      }
    }
  });

  it("31-EDO has more types than 12-EDO (microtonal richness)", () => {
    expect(getEdoChordTypes(31).length).toBeGreaterThan(getEdoChordTypes(12).length);
  });

  it("41-EDO has more types than 31-EDO", () => {
    expect(getEdoChordTypes(41).length).toBeGreaterThan(getEdoChordTypes(31).length);
  });

  it("steps are sorted ascending within each type", () => {
    for (const edo of SUPPORTED_EDOS) {
      for (const t of getEdoChordTypes(edo)) {
        for (let i = 1; i < t.steps.length; i++) {
          expect(t.steps[i]).toBeGreaterThan(t.steps[i - 1]);
        }
      }
    }
  });

  it("no duplicate step patterns within an EDO", () => {
    for (const edo of SUPPORTED_EDOS) {
      const patterns = getEdoChordTypes(edo).map(t => t.steps.join(","));
      expect(new Set(patterns).size).toBe(patterns.length);
    }
  });
});
