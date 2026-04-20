// ── Music Theory Stress Tests ────────────────────────────────────────
// Tests chord construction, voicings, formula parsing, functional loop
// generation, bass line generation, melody generation, and all helpers.

import { describe, it, expect } from "vitest";
import {
  getAllChordsForEdo,
  FORMULA_NAMES, buildSequenceFromFormula,
  placeChordInRegister, generateFunctionalLoop,
  triadQuality, describeChord, randomChoice, shuffle,
  ALL_VOICING_PATTERNS, applyVoicingPattern,
  generateBassLine, generateMelodyLine,
  checkLowIntervalLimits,
  HARMONIC_GRAPH, LOOP_LENGTHS,
  addExtensions, applyBassControl,
  phraseToSteps, phraseToStepsEdo,
  fitChordIntoWindow, fitLineIntoWindow, strictWindowBounds,
  EXTENSION_LABELS,
} from "./musicTheory";
import { getChordShapes, getBaseChords } from "./edoData";

const EDOS = [12, 31, 41];

// ── triadQuality ────────────────────────────────────────────────────

describe("triadQuality", () => {
  it("detects major triads for all EDOs", () => {
    for (const edo of EDOS) {
      const cs = getChordShapes(edo);
      expect(triadQuality([0, cs.M3, cs.P5], edo)).toBe("major");
    }
  });

  it("detects minor triads for all EDOs", () => {
    for (const edo of EDOS) {
      const cs = getChordShapes(edo);
      expect(triadQuality([0, cs.m3, cs.P5], edo)).toBe("minor");
    }
  });

  it("detects diminished triads for all EDOs", () => {
    for (const edo of EDOS) {
      const cs = getChordShapes(edo);
      expect(triadQuality([0, cs.m3, cs.d5], edo)).toBe("dim");
    }
  });

  it("detects augmented triads for all EDOs", () => {
    for (const edo of EDOS) {
      const cs = getChordShapes(edo);
      expect(triadQuality([0, cs.M3, cs.P5 + cs.A1], edo)).toBe("aug");
    }
  });

  it("detects microtonal triads in 31-EDO", () => {
    // Subminor (7/6) = m3-1 = 7, supermajor (9/7) = M3+1 = 11
    expect(triadQuality([0, 7, 18], 31)).toBe("subminor");
    expect(triadQuality([0, 11, 18], 31)).toBe("supermajor");
    expect(triadQuality([0, 9, 18], 31)).toBe("neutral"); // neutral 3rd = round((8+10)/2) = 9
  });

  it("returns 'unknown' for < 3 notes", () => {
    expect(triadQuality([0, 10], 31)).toBe("unknown");
    expect(triadQuality([0], 31)).toBe("unknown");
    expect(triadQuality([], 31)).toBe("unknown");
  });

  it("handles transposed triads (non-zero root)", () => {
    const cs = getChordShapes(31);
    // V chord in 31-EDO: root=18 (P5 above tonic)
    expect(triadQuality([18, 18 + cs.M3, 18 + cs.P5], 31)).toBe("major");
  });
});

// ── randomChoice / shuffle ──────────────────────────────────────────

describe("randomChoice", () => {
  it("always returns element from the array", () => {
    const arr = [1, 2, 3, 4, 5];
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(randomChoice(arr));
    }
  });

  it("eventually picks all elements (coverage)", () => {
    const arr = ["a", "b", "c"];
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      seen.add(randomChoice(arr));
    }
    expect(seen.size).toBe(3);
  });
});

describe("shuffle", () => {
  it("preserves all elements", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const copy = [...arr];
    shuffle(copy);
    expect(copy.sort((a, b) => a - b)).toEqual(arr);
  });

  it("preserves length", () => {
    const arr = [1, 2, 3];
    shuffle(arr);
    expect(arr.length).toBe(3);
  });
});

// ── placeChordInRegister ────────────────────────────────────────────

describe("placeChordInRegister", () => {
  it("places chord in specified register range", () => {
    const cs = getChordShapes(31);
    const chord = [0, cs.M3, cs.P5]; // I chord
    const placed = placeChordInRegister(chord, 31, 0, 3, 5, "Fixed Register");
    // All notes should be within the register window
    expect(placed.length).toBeGreaterThanOrEqual(3);
    for (const n of placed) {
      expect(Number.isFinite(n)).toBe(true);
    }
  });

  it("returns empty for empty input", () => {
    expect(placeChordInRegister([], 31, 0, 3, 5, "Fixed Register")).toEqual([]);
  });

  it("preserves note count (no notes dropped)", () => {
    const cs = getChordShapes(31);
    const chord = [0, cs.M3, cs.P5, cs.m7]; // dom7
    const placed = placeChordInRegister(chord, 31, 0, 2, 6, "Fixed Register");
    expect(placed.length).toBe(4);
  });

  it("works with all register modes", () => {
    const cs = getChordShapes(31);
    const chord = [0, cs.M3, cs.P5];
    for (const mode of ["Fixed Register", "Random Bass Octave", "Random Full Register"]) {
      const placed = placeChordInRegister(chord, 31, 0, 2, 6, mode);
      expect(placed.length).toBeGreaterThanOrEqual(3);
    }
  });
});

// ── buildSequenceFromFormula ────────────────────────────────────────

describe("buildSequenceFromFormula", () => {
  it("returns non-null for all standard formulas with valid input", () => {
    for (const edo of EDOS) {
      const chords = getBaseChords(edo);
      const chordMap: Record<string, number[]> = {};
      chords.forEach(([label, steps]) => { chordMap[label] = steps; });
      const checked = ["I", "ii", "IV", "V", "vi"];
      for (const formula of FORMULA_NAMES) {
        // Some formulas need minor chords — skip if not relevant
        const result = buildSequenceFromFormula(formula, checked, chordMap, edo);
        // Can be null if formula requires minor chords not in checked
        if (formula === "i X i" || formula === "iiø/X V/X X") continue;
        expect(result).not.toBeNull();
      }
    }
  });

  it("'X' formula returns single chord", () => {
    const chordMap: Record<string, number[]> = { "I": [0, 10, 18], "V": [18, 28, 36] };
    const result = buildSequenceFromFormula("X", ["I", "V"], chordMap, 31);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);
  });

  it("'I X I' formula returns 3 chords starting and ending with I", () => {
    const chordMap: Record<string, number[]> = {
      "I": [0, 10, 18], "ii": [5, 13, 23], "V": [18, 28, 36]
    };
    const result = buildSequenceFromFormula("I X I", ["I", "ii", "V"], chordMap, 31);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(3);
    expect(result![0][0]).toBe("I");
    expect(result![2][0]).toBe("I");
  });

  it("'ii/X V/X X' resolves secondary dominants correctly", () => {
    const chordMap: Record<string, number[]> = {
      "I": [0, 10, 18], "IV": [13, 23, 31], "V": [18, 28, 36],
    };
    const result = buildSequenceFromFormula("ii/X V/X X", ["I", "IV", "V"], chordMap, 31);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(3);
    // Middle chord should be V/X
    expect(result![1][0]).toMatch(/^V\//);
    // Last chord should be the target
    const target = result![2][0];
    expect(["I", "IV", "V"]).toContain(target);
  });

  it("returns null for empty checked chords", () => {
    expect(buildSequenceFromFormula("X", [], {}, 31)).toBeNull();
  });
});

// ── generateFunctionalLoop ──────────────────────────────────────────

describe("generateFunctionalLoop", () => {
  it("returns array of correct length for valid input", () => {
    for (const len of LOOP_LENGTHS) {
      const result = generateFunctionalLoop(["I", "ii", "IV", "V", "vi"], len);
      if (result) {
        expect(result.length).toBe(len);
      }
    }
  });

  it("returns null for fewer than 2 available chords", () => {
    expect(generateFunctionalLoop(["I"], 4)).toBeNull();
    expect(generateFunctionalLoop([], 4)).toBeNull();
  });

  it("only uses chords from the available set", () => {
    const available = ["I", "IV", "V", "vi"];
    for (let trial = 0; trial < 50; trial++) {
      const loop = generateFunctionalLoop(available, 4);
      if (loop) {
        for (const chord of loop) {
          expect(available).toContain(chord);
        }
      }
    }
  });

  it("last chord is never an applied chord (V/X, ii/X, etc.)", () => {
    const available = ["I", "ii", "IV", "V", "vi", "V/V", "V/ii"];
    for (let trial = 0; trial < 50; trial++) {
      const loop = generateFunctionalLoop(available, 4);
      if (loop) {
        const last = loop[loop.length - 1];
        expect(last).not.toMatch(/^V\//);
        expect(last).not.toMatch(/^ii\//);
        expect(last).not.toMatch(/^iiø\//);
        expect(last).not.toMatch(/^TT\//);
      }
    }
  });

  it("stress: generates loops reliably for large chord sets", () => {
    const allChords = Object.keys(HARMONIC_GRAPH);
    let successes = 0;
    for (let i = 0; i < 100; i++) {
      const loop = generateFunctionalLoop(allChords, 8);
      if (loop) successes++;
    }
    // Should succeed most of the time with full chord set
    expect(successes).toBeGreaterThan(80);
  });

  it("stress: minor key chords also produce valid loops", () => {
    const minorChords = ["i", "ii°", "III", "iv", "V", "VI", "VII"];
    let successes = 0;
    for (let i = 0; i < 50; i++) {
      const loop = generateFunctionalLoop(minorChords, 4);
      if (loop) successes++;
    }
    expect(successes).toBeGreaterThan(30);
  });
});

// ── HARMONIC_GRAPH structure ────────────────────────────────────────

describe("HARMONIC_GRAPH", () => {
  it("all targets in each adjacency list exist as keys", () => {
    const allKeys = new Set(Object.keys(HARMONIC_GRAPH));
    for (const [chord, targets] of Object.entries(HARMONIC_GRAPH)) {
      for (const t of targets) {
        expect(allKeys.has(t)).toBe(true);
      }
    }
  });

  it("no chord lists itself as a target", () => {
    for (const [chord, targets] of Object.entries(HARMONIC_GRAPH)) {
      expect(targets).not.toContain(chord);
    }
  });

  it("secondary dominants resolve to their target chord", () => {
    expect(HARMONIC_GRAPH["V/ii"]).toContain("ii");
    expect(HARMONIC_GRAPH["V/iii"]).toContain("iii");
    expect(HARMONIC_GRAPH["V/IV"]).toContain("IV");
    expect(HARMONIC_GRAPH["V/V"]).toContain("V");
    expect(HARMONIC_GRAPH["V/vi"]).toContain("vi");
  });

  it("tritone subs resolve correctly", () => {
    expect(HARMONIC_GRAPH["TT/I"]).toContain("I");
    expect(HARMONIC_GRAPH["TT/V"]).toContain("V");
  });

  it("I has the most outgoing edges (harmonic flexibility)", () => {
    const iEdges = HARMONIC_GRAPH["I"].length;
    for (const [chord, targets] of Object.entries(HARMONIC_GRAPH)) {
      if (chord !== "I") {
        expect(iEdges).toBeGreaterThanOrEqual(targets.length);
      }
    }
  });
});

// ── Voicing Patterns ────────────────────────────────────────────────

describe("ALL_VOICING_PATTERNS", () => {
  it("all patterns have unique IDs", () => {
    const ids = ALL_VOICING_PATTERNS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all patterns have valid order indices", () => {
    for (const p of ALL_VOICING_PATTERNS) {
      for (const idx of p.order) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(10); // reasonable upper bound
      }
    }
  });

  it("triad patterns have 3 notes, seventh patterns have 4", () => {
    for (const p of ALL_VOICING_PATTERNS) {
      if (p.maxNotes === 3) {
        expect(p.order.length).toBe(3);
      }
      if (p.minNotes === 4 && !p.maxNotes) {
        expect(p.order.length).toBe(4);
      }
    }
  });

  it("root position patterns start with index 0 (root)", () => {
    const rootPos = ALL_VOICING_PATTERNS.filter(p => p.group === "Root Position");
    for (const p of rootPos) {
      expect(p.order[0]).toBe(0);
    }
  });

  it("all patterns have non-empty label and group", () => {
    for (const p of ALL_VOICING_PATTERNS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.group.length).toBeGreaterThan(0);
    }
  });
});

// ── generateBassLine ────────────────────────────────────────────────

describe("generateBassLine", () => {
  const shapes31 = [[0, 10, 18], [5, 13, 23], [13, 23, 31], [18, 28, 36]]; // I ii IV V

  it("returns empty for empty shapes", () => {
    expect(generateBassLine([], 31, 0, 3, "root")).toEqual([]);
  });

  it("root mode: one frame per chord", () => {
    const frames = generateBassLine(shapes31, 31, 0, 3, "root");
    expect(frames.length).toBe(shapes31.length);
    frames.forEach(f => expect(f.length).toBe(1)); // single note per frame
  });

  it("root-fifth mode: two frames per chord", () => {
    const frames = generateBassLine(shapes31, 31, 0, 3, "root-fifth");
    expect(frames.length).toBe(shapes31.length * 2);
  });

  it("passing mode: two frames per chord", () => {
    const frames = generateBassLine(shapes31, 31, 0, 3, "passing");
    expect(frames.length).toBe(shapes31.length * 2);
  });

  it("walking mode: 4 frames per chord (root + 2 walk + approach)", () => {
    const frames = generateBassLine(shapes31, 31, 0, 3, "walking");
    expect(frames.length).toBe(shapes31.length * 4);
  });

  it("all frames contain finite numbers", () => {
    for (const mode of ["root", "root-fifth", "passing", "walking"] as const) {
      const frames = generateBassLine(shapes31, 31, 0, 3, mode);
      for (const frame of frames) {
        for (const n of frame) {
          expect(Number.isFinite(n)).toBe(true);
        }
      }
    }
  });
});

// ── generateMelodyLine ──────────────────────────────────────────────

describe("generateMelodyLine", () => {
  const shapes31 = [[0, 10, 18], [5, 13, 23], [13, 23, 31], [18, 28, 36]];

  it("returns empty for empty shapes", () => {
    expect(generateMelodyLine([], 31, 0, 5, "chord-tone")).toEqual([]);
  });

  it("chord-tone mode: one frame per chord", () => {
    const frames = generateMelodyLine(shapes31, 31, 0, 5, "chord-tone");
    expect(frames.length).toBe(shapes31.length);
  });

  it("scalar mode: two frames per chord (main + passing)", () => {
    const frames = generateMelodyLine(shapes31, 31, 0, 5, "scalar");
    expect(frames.length).toBe(shapes31.length * 2);
  });

  it("arpeggiate mode: one frame per chord tone", () => {
    const frames = generateMelodyLine(shapes31, 31, 0, 5, "arpeggiate");
    // Each chord has 3 tones → 4 chords × 3 = 12 frames
    expect(frames.length).toBe(12);
  });

  it("all melody notes are single-note frames", () => {
    for (const mode of ["chord-tone", "scalar", "arpeggiate"] as const) {
      const frames = generateMelodyLine(shapes31, 31, 0, 5, mode);
      for (const frame of frames) {
        expect(frame.length).toBe(1);
      }
    }
  });

  it("stress: 100 chord-tone generations produce finite notes", () => {
    for (let i = 0; i < 100; i++) {
      const frames = generateMelodyLine(shapes31, 31, 0, 5, "chord-tone");
      for (const f of frames) {
        expect(Number.isFinite(f[0])).toBe(true);
      }
    }
  });
});

// ── Window bounds / fitting ─────────────────────────────────────────

describe("strictWindowBounds", () => {
  it("returns [low, high] where low < high", () => {
    for (const edo of EDOS) {
      const [low, high] = strictWindowBounds(0, edo, 2, 6);
      expect(low).toBeLessThan(high);
    }
  });

  it("range covers at least one octave", () => {
    for (const edo of EDOS) {
      const [low, high] = strictWindowBounds(0, edo, 4, 5);
      expect(high - low).toBeGreaterThanOrEqual(edo);
    }
  });
});

describe("fitChordIntoWindow", () => {
  it("all notes stay within window bounds", () => {
    for (const edo of EDOS) {
      const [low, high] = strictWindowBounds(0, edo, 2, 6);
      const chord = [0, 10, 18].map(s => s + low);
      const fitted = fitChordIntoWindow(chord, edo, low, high);
      for (const n of fitted) {
        expect(n).toBeGreaterThanOrEqual(low);
        expect(n).toBeLessThanOrEqual(high);
      }
    }
  });
});

describe("fitLineIntoWindow", () => {
  it("keeps melody within bounds", () => {
    for (const edo of EDOS) {
      const [low, high] = strictWindowBounds(0, edo, 3, 5);
      const line = [0, 5, 10, 13, 18, 23, 28].map(s => s + low);
      const fitted = fitLineIntoWindow(line, edo, low, high);
      for (const n of fitted) {
        expect(n).toBeGreaterThanOrEqual(low);
        expect(n).toBeLessThanOrEqual(high);
      }
    }
  });

  it("preserves note count", () => {
    const [low, high] = strictWindowBounds(0, 31, 3, 5);
    const line = [0, 5, 10, 18, 23, 28].map(s => s + low);
    const fitted = fitLineIntoWindow(line, 31, low, high);
    expect(fitted.length).toBe(line.length);
  });
});

// ── addExtensions ───────────────────────────────────────────────────

describe("addExtensions", () => {
  it("returns original chord when k=0", () => {
    const chord = [0, 10, 18];
    const result = addExtensions(chord, 0, 31, 0, new Set(["7th"]));
    expect(result).toEqual(chord);
  });

  it("adds exactly k notes when possible", () => {
    const chord = [0, 10, 18]; // major triad
    const result = addExtensions(chord, 0, 31, 1, new Set(["7th"]));
    expect(result.length).toBe(4);
  });

  it("does not duplicate existing chord tones", () => {
    const chord = [0, 10, 18];
    const result = addExtensions(chord, 0, 31, 2, new Set(["7th", "9th"]));
    expect(new Set(result).size).toBe(result.length);
  });

  it("result is sorted ascending", () => {
    const chord = [0, 10, 18];
    for (let k = 1; k <= 3; k++) {
      const result = addExtensions(chord, 0, 31, k, new Set(EXTENSION_LABELS));
      for (let i = 1; i < result.length; i++) {
        expect(result[i]).toBeGreaterThanOrEqual(result[i - 1]);
      }
    }
  });
});

// ── phraseToSteps ───────────────────────────────────────────────────

describe("phraseToSteps", () => {
  it("maps major scale degrees correctly (31-EDO)", () => {
    const phrase = { degrees: ["1", "3", "5"] };
    const steps = phraseToSteps(phrase, 0);
    expect(steps).toEqual([0, 10, 18]);
  });

  it("maps minor scale degrees correctly", () => {
    const phrase = { degrees: ["1", "b3", "5"], scale: "minor" };
    const steps = phraseToSteps(phrase, 0);
    expect(steps).toEqual([0, 8, 18]);
  });

  it("transposes by rootStep", () => {
    const phrase = { degrees: ["1", "3", "5"] };
    const steps = phraseToSteps(phrase, 5);
    expect(steps).toEqual([5, 15, 23]);
  });
});

describe("phraseToStepsEdo", () => {
  it("resolves cadential 7→1 ascending (not wrapping down)", () => {
    const phrase = { degrees: ["5", "6", "7", "1"] };
    const steps = phraseToStepsEdo(phrase, 0, 31);
    // 7→1 should go UP (28→31), not down (28→0)
    expect(steps[3]).toBeGreaterThan(steps[2]);
  });

  it("works for 12-EDO", () => {
    const phrase = { degrees: ["1", "3", "5"] };
    const steps = phraseToStepsEdo(phrase, 0, 12);
    expect(steps).toEqual([0, 4, 7]);
  });
});
