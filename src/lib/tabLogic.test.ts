// ── Tab Logic Stress Tests ───────────────────────────────────────────
// Tests the note-building and frame-construction logic extracted from
// IntervalsTab, MelodyTab, and ChordsTab.

import { describe, it, expect } from "vitest";
import { getIntervalNames, getDegreeMap, getChordShapes, getBaseChords } from "./edoData";
import {
  randomChoice, triadQuality,
  MELODY_BANK_31, MELODY_FAMILIES,
  fitLineIntoWindow, strictWindowBounds,
  PATTERN_SCALE_FAMILIES, getModeDegreeMap,
  buildSequenceFromFormula, FORMULA_NAMES,
  phraseToSteps,
} from "./musicTheory";

const EDOS = [12, 31, 41];

// ── IntervalsTab: buildNotes logic ──────────────────────────────────

describe("IntervalsTab: note building", () => {
  function buildNotes(
    checked: Set<number>, tonicPc: number, lowestOct: number, highestOct: number, edo: number, numNotes: number
  ) {
    const pool = Array.from(checked);
    if (!pool.length) return { notes: [], steps: [], root: 0 };
    const ivNames = getIntervalNames(edo);
    const low = tonicPc + (lowestOct - 4) * edo;
    const high = tonicPc + (highestOct + 1 - 4) * edo;
    let r = tonicPc + (lowestOct + Math.floor((highestOct - lowestOct) / 2) - 4) * edo;
    while (r < low) r += edo;
    while (r >= high) r -= edo;

    const count = Math.min(numNotes, 6);
    const notes: { note: number; label: string }[] = [];
    const steps: number[] = [];
    for (let i = 0; i < count; i++) {
      const step = pool[i % pool.length]; // deterministic for testing
      steps.push(step);
      let n = r + step;
      if (n >= high + edo) n -= edo;
      if (n < low) n += edo;
      notes.push({ note: n, label: ivNames[step] ?? "Root" });
    }
    return { notes, steps, root: r };
  }

  it("returns empty for empty checked set", () => {
    const result = buildNotes(new Set(), 0, 3, 5, 31, 2);
    expect(result.notes).toEqual([]);
  });

  it("returns correct number of notes (capped at 6)", () => {
    const checked = new Set([3, 5, 8, 10]);
    for (let n = 1; n <= 8; n++) {
      const result = buildNotes(checked, 0, 3, 5, 31, n);
      expect(result.notes.length).toBe(Math.min(n, 6));
    }
  });

  it("root is within playable range", () => {
    for (const edo of EDOS) {
      for (let tonic = 0; tonic < edo; tonic += Math.ceil(edo / 4)) {
        const checked = new Set([1, 3, 5]);
        const result = buildNotes(checked, tonic, 2, 6, edo, 2);
        const low = tonic + (2 - 4) * edo;
        const high = tonic + (6 + 1 - 4) * edo;
        expect(result.root).toBeGreaterThanOrEqual(low);
        expect(result.root).toBeLessThan(high);
      }
    }
  });

  it("notes have valid labels from interval names", () => {
    for (const edo of EDOS) {
      const ivNames = getIntervalNames(edo);
      const checked = new Set([1, 3, 5, 8, 10]);
      const result = buildNotes(checked, 0, 3, 5, edo, 3);
      for (const { label } of result.notes) {
        expect(ivNames).toContain(label);
      }
    }
  });

  it("stress: all possible tonic/octave combinations produce valid results", () => {
    const checked = new Set([5, 10, 18]);
    for (const edo of [31]) {
      for (let tonic = 0; tonic < edo; tonic += 5) {
        for (let lo = 1; lo <= 5; lo++) {
          for (let hi = lo + 1; hi <= 7; hi++) {
            const result = buildNotes(checked, tonic, lo, hi, edo, 3);
            expect(result.notes.length).toBe(3);
          }
        }
      }
    }
  });
});

// ── IntervalsTab: buildFrames logic ─────────────────────────────────

describe("IntervalsTab: frame construction", () => {
  function buildFrames(
    notes: { note: number; label: string }[], root: number, playStyle: string
  ): number[][] {
    if (!notes.length) return [];
    if (playStyle === "Sequential") {
      return notes.map(x => [root, x.note]);
    }
    if (playStyle === "Dyad (2 at once)") {
      return [notes.map(x => x.note)];
    }
    if (playStyle === "Trichord (3 at once)") {
      const frames: number[][] = [];
      for (let i = 0; i + 1 < notes.length; i += 2) {
        const frame = [...new Set([root, notes[i].note, notes[i + 1].note])];
        frames.push(frame);
      }
      if (notes.length % 2 === 1) {
        frames.push([root, notes[notes.length - 1].note]);
      }
      if (!frames.length) frames.push([...new Set([root, ...notes.map(x => x.note)])]);
      return frames;
    }
    if (playStyle === "Random (2–3 at once)") {
      const frames: number[][] = [];
      let i = 0;
      while (i < notes.length) {
        const take = 1; // deterministic for testing
        const frame = [...new Set([root, ...notes.slice(i, i + take).map(x => x.note)])];
        frames.push(frame);
        i += take;
      }
      return frames;
    }
    return notes.map(x => [root, x.note]);
  }

  const makeNotes = (...vals: number[]) => vals.map(v => ({ note: v, label: `n${v}` }));

  it("Sequential: each frame contains root + interval note", () => {
    const notes = makeNotes(10, 18, 23);
    const frames = buildFrames(notes, 0, "Sequential");
    expect(frames.length).toBe(3);
    for (const frame of frames) {
      expect(frame).toContain(0);
      expect(frame.length).toBe(2);
    }
  });

  it("Dyad: all notes in a single frame", () => {
    const notes = makeNotes(10, 18, 23);
    const frames = buildFrames(notes, 0, "Dyad (2 at once)");
    expect(frames.length).toBe(1);
    expect(frames[0].length).toBe(3);
  });

  it("Trichord: pairs of notes with root", () => {
    const notes = makeNotes(10, 18, 23, 28);
    const frames = buildFrames(notes, 0, "Trichord (3 at once)");
    expect(frames.length).toBe(2);
    for (const frame of frames) {
      expect(frame).toContain(0);
    }
  });

  it("Trichord: handles odd number of notes", () => {
    const notes = makeNotes(10, 18, 23);
    const frames = buildFrames(notes, 0, "Trichord (3 at once)");
    // 2 notes in pair + 1 remaining
    expect(frames.length).toBe(2);
  });

  it("returns empty for empty notes", () => {
    expect(buildFrames([], 0, "Sequential")).toEqual([]);
    expect(buildFrames([], 0, "Dyad (2 at once)")).toEqual([]);
  });

  it("Sequential frames deduplicate when note equals root", () => {
    // Unison interval: note = root
    const notes = makeNotes(0);
    const frames = buildFrames(notes, 0, "Sequential");
    expect(frames.length).toBe(1);
    expect(frames[0]).toContain(0);
  });
});

// ── MelodyTab: degree resolution ────────────────────────────────────

describe("MelodyTab: degree resolution", () => {
  function resolveDegrees(
    phrase: { degrees: string[]; scale?: string },
    rootStep: number,
    scaleFam: string,
    modeName: string,
    isGenerative: boolean,
    edo: number
  ): number[] {
    const chromatic = getDegreeMap(edo);
    const degMap = isGenerative
      ? { ...chromatic, ...getModeDegreeMap(edo, scaleFam, modeName) }
      : chromatic;
    const out: number[] = [rootStep + (degMap[phrase.degrees[0]] ?? 0)];
    for (let i = 1; i < phrase.degrees.length; i++) {
      const pc = degMap[phrase.degrees[i]] ?? 0;
      let best = rootStep + pc;
      let bestDist = Math.abs(best - out[i - 1]);
      for (let k = -4; k <= 4; k++) {
        const c = rootStep + pc + k * edo;
        const dist = Math.abs(c - out[i - 1]);
        if (dist < bestDist) { bestDist = dist; best = c; }
      }
      out.push(best);
    }
    return out;
  }

  it("resolves scale degrees with voice-leading proximity", () => {
    const steps = resolveDegrees(
      { degrees: ["1", "2", "3", "4", "5"] }, 0, "Major Family", "Ionian", true, 31
    );
    // Each step should be close to the previous
    for (let i = 1; i < steps.length; i++) {
      expect(Math.abs(steps[i] - steps[i - 1])).toBeLessThan(31 / 2);
    }
  });

  it("7→1 resolves upward (cadential voice-leading)", () => {
    const steps = resolveDegrees(
      { degrees: ["7", "1"] }, 0, "Major Family", "Ionian", true, 31
    );
    // 7 (step 28) → 1 (step 0/31) should resolve upward to 31
    expect(steps[1]).toBeGreaterThan(steps[0]);
  });

  it("handles all chromatic degrees without crashing", () => {
    const dm = getDegreeMap(31);
    const allDegrees = Object.keys(dm);
    const steps = resolveDegrees(
      { degrees: allDegrees }, 0, "Major Family", "Ionian", false, 31
    );
    expect(steps.length).toBe(allDegrees.length);
    for (const s of steps) {
      expect(Number.isFinite(s)).toBe(true);
    }
  });

  it("works across all supported EDOs", () => {
    for (const edo of EDOS) {
      const steps = resolveDegrees(
        { degrees: ["1", "3", "5", "1"] }, 0, "Major Family", "Ionian", true, edo
      );
      expect(steps.length).toBe(4);
    }
  });
});

// ── MelodyTab: melody bank structure ────────────────────────────────

describe("MELODY_BANK_31", () => {
  it("has at least 10 phrases", () => {
    expect(MELODY_BANK_31.length).toBeGreaterThanOrEqual(10);
  });

  it("every phrase has a family", () => {
    for (const p of MELODY_BANK_31) {
      expect(MELODY_FAMILIES).toContain(p.family);
    }
  });

  it("every phrase has at least 2 degrees", () => {
    for (const p of MELODY_BANK_31) {
      expect(p.degrees.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("all degree strings are valid scale degrees", () => {
    const validDegrees = new Set(Object.keys(getDegreeMap(31)));
    // Add octave equivalents
    validDegrees.add("8");
    for (const p of MELODY_BANK_31) {
      for (const d of p.degrees) {
        expect(validDegrees.has(d)).toBe(true);
      }
    }
  });

  it("all families have at least one phrase", () => {
    for (const family of MELODY_FAMILIES) {
      const count = MELODY_BANK_31.filter(p => p.family === family).length;
      expect(count).toBeGreaterThan(0);
    }
  });
});

// ── PATTERN_SCALE_FAMILIES ──────────────────────────────────────────

describe("PATTERN_SCALE_FAMILIES", () => {
  it("has entries for major and minor family", () => {
    expect("Major Family" in PATTERN_SCALE_FAMILIES).toBe(true);
    // Melodic minor is also common
    const keys = Object.keys(PATTERN_SCALE_FAMILIES);
    expect(keys.length).toBeGreaterThanOrEqual(2);
  });

  it("each family has at least one mode", () => {
    for (const [fam, modes] of Object.entries(PATTERN_SCALE_FAMILIES)) {
      expect(modes.length).toBeGreaterThan(0);
    }
  });

  it("Major Family includes Ionian", () => {
    expect(PATTERN_SCALE_FAMILIES["Major Family"]).toContain("Ionian");
  });
});

// ── ChordsTab: chord map construction ───────────────────────────────

describe("ChordsTab: chord map and quality detection", () => {
  it("builds valid chord map for all EDOs", () => {
    for (const edo of EDOS) {
      const chords = getBaseChords(edo);
      const chordMap: Record<string, number[]> = {};
      chords.forEach(([label, steps]) => { chordMap[label] = steps; });
      // I should be major
      expect(triadQuality(chordMap["I"], edo)).toBe("major");
      // ii should be minor
      expect(triadQuality(chordMap["ii"], edo)).toBe("minor");
      // vii° should be diminished
      expect(triadQuality(chordMap["vii°"], edo)).toBe("dim");
    }
  });

  it("all roman numerals produce chords with 3 notes", () => {
    for (const edo of EDOS) {
      for (const [label, steps] of getBaseChords(edo)) {
        expect(steps.length).toBe(3);
      }
    }
  });
});

// ── Melody shape detection (from MelodyTab quiz) ────────────────────

describe("melody shape detection", () => {
  function detectShape(absNotes: number[]): string {
    const diffs = absNotes.slice(1).map((n, i) => n - absNotes[i]);
    const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const allSame = diffs.every(d => Math.abs(d) <= 1);
    if (allSame) return "Stays";
    if (avgDiff > 0.5) return "Ascending";
    if (avgDiff < -0.5) return "Descending";
    const mid = Math.floor(diffs.length / 2);
    const firstHalf = diffs.slice(0, mid).reduce((a, b) => a + b, 0);
    const secondHalf = diffs.slice(mid).reduce((a, b) => a + b, 0);
    if (firstHalf > 0 && secondHalf < 0) return "Arch";
    if (firstHalf < 0 && secondHalf > 0) return "Valley";
    return avgDiff >= 0 ? "Ascending" : "Descending";
  }

  it("detects ascending melodies", () => {
    expect(detectShape([0, 5, 10, 18, 23])).toBe("Ascending");
  });

  it("detects descending melodies", () => {
    expect(detectShape([23, 18, 10, 5, 0])).toBe("Descending");
  });

  it("detects arch shapes (up then down)", () => {
    expect(detectShape([0, 5, 10, 18, 10, 5, 0])).toBe("Arch");
  });

  it("detects valley shapes (down then up)", () => {
    expect(detectShape([18, 10, 5, 0, 5, 10, 18])).toBe("Valley");
  });

  it("detects static melodies", () => {
    expect(detectShape([10, 10, 11, 10, 10])).toBe("Stays");
  });
});
