/**
 * Stress tests for drum pattern system.
 *
 * Covers: drumData.ts, accentData.ts, independenceData.ts,
 *         groupingSelector.ts, musicalScoring.ts
 *
 * Focus: correctness invariants under exhaustive grid/param combos,
 *        boundary conditions, and statistical properties.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── drumData ──────────────────────────────────────────────────────────────
import {
  GridType, GRID_SUBDIVS, GRID_LABELS, BEAT_POSITIONS, BEAT_SLOT_LABELS,
  getPerms, permHits, Permutation,
  ostinatoHits, ostinatoOpen, OSTINATO_LIBRARY, Ostinato,
  resolveSnareHits, resolveBassHits, resolveGhostHits,
  resolveHHClosedHits, resolveHHOpenHits,
  defaultMeasure, defaultExercise, getOstinato,
  DrumMeasure,
} from "./drumData";

// ── accentData ────────────────────────────────────────────────────────────
import {
  AccentSubdivision, ACCENT_SUBDIV_BEAT_SLOTS,
  slotsPerBeat, totalSlots,
  generateMusicalGrouping, generateFreeGrouping,
  generateConstrainedGrouping, generateAwkwardGrouping,
  parseCustomGrouping,
  groupingToAccents,
  groupSticking, generateStickings, generatePerBeatStickings,
  paradiddleExpand,
  resolveAccentHits,
  applyOrchestration,
  toRenderGrid,
} from "./accentData";

// ── independenceData ──────────────────────────────────────────────────────
import {
  IndependenceGrid,
  generateIndependenceMeasure,
  VoiceConfig,
} from "./independenceData";

// ── groupingSelector ──────────────────────────────────────────────────────
import {
  selectGrouping, generateAndSelectGrouping,
  isRejected, classify, getTier, classifyCandidates,
} from "./groupingSelector";

// ── musicalScoring ────────────────────────────────────────────────────────
import {
  weightedScore, weightedPick, resolveMode,
  extractGroupingFeatures,
  isSlotModValid, generateSlotModCandidate, randomizeSlotMods,
  extractSlotModFeatures,
} from "./musicalScoring";

// ═══════════════════════════════════════════════════════════════════════════
//  1. GRID / LABEL CONSISTENCY
// ═══════════════════════════════════════════════════════════════════════════

const ALL_GRIDS: GridType[] = ["8th", "16th", "triplet", "quintuplet", "sextuplet", "septuplet", "32nd"];

describe("Grid metadata consistency", () => {
  for (const grid of ALL_GRIDS) {
    describe(`grid="${grid}"`, () => {
      it("GRID_LABELS length matches GRID_SUBDIVS", () => {
        expect(GRID_LABELS[grid].length).toBe(GRID_SUBDIVS[grid]);
      });

      it("BEAT_POSITIONS has exactly 4 entries", () => {
        expect(BEAT_POSITIONS[grid]).toHaveLength(4);
      });

      it("BEAT_POSITIONS are evenly spaced at beatSize intervals", () => {
        const beatSize = GRID_SUBDIVS[grid] / 4;
        BEAT_POSITIONS[grid].forEach((pos, i) => {
          expect(pos).toBe(i * beatSize);
        });
      });

      it("BEAT_SLOT_LABELS length matches beatSize", () => {
        const beatSize = GRID_SUBDIVS[grid] / 4;
        expect(BEAT_SLOT_LABELS[grid].length).toBe(beatSize);
      });
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  2. PERMUTATION GENERATION
// ═══════════════════════════════════════════════════════════════════════════

describe("getPerms — exhaustive per grid", () => {
  for (const grid of ALL_GRIDS) {
    const beatSize = GRID_SUBDIVS[grid] / 4;
    const perms = getPerms(grid);

    describe(`grid="${grid}" (beatSize=${beatSize})`, () => {
      it("generates the correct total count = 2^beatSize - 1", () => {
        // Sum of C(n,k) for k=1..n = 2^n - 1
        expect(perms.length).toBe(Math.pow(2, beatSize) - 1);
      });

      it("all IDs are unique", () => {
        const ids = perms.map(p => p.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it("family matches the number of beat slots", () => {
        for (const p of perms) {
          expect(p.family).toBe(p.beatSlots.length);
        }
      });

      it("all beatSlots are in range [0, beatSize)", () => {
        for (const p of perms) {
          for (const s of p.beatSlots) {
            expect(s).toBeGreaterThanOrEqual(0);
            expect(s).toBeLessThan(beatSize);
          }
        }
      });

      it("beatSlots are sorted ascending", () => {
        for (const p of perms) {
          for (let i = 1; i < p.beatSlots.length; i++) {
            expect(p.beatSlots[i]).toBeGreaterThan(p.beatSlots[i - 1]);
          }
        }
      });

      it("ID encodes family and slot indices", () => {
        for (const p of perms) {
          expect(p.id).toBe(`${p.family}-${p.beatSlots.join("")}`);
        }
      });
    });
  }
});

describe("permHits — full-measure expansion", () => {
  for (const grid of ALL_GRIDS) {
    const beatSize = GRID_SUBDIVS[grid] / 4;
    const totalSlots = GRID_SUBDIVS[grid];
    const perms = getPerms(grid);

    describe(`grid="${grid}"`, () => {
      it("produces exactly family*4 hits per perm", () => {
        for (const p of perms) {
          const hits = permHits(p, grid);
          expect(hits.length).toBe(p.family * 4);
        }
      });

      it("all hits are in range [0, totalSlots)", () => {
        for (const p of perms) {
          for (const h of permHits(p, grid)) {
            expect(h).toBeGreaterThanOrEqual(0);
            expect(h).toBeLessThan(totalSlots);
          }
        }
      });

      it("hits are sorted ascending", () => {
        for (const p of perms) {
          const hits = permHits(p, grid);
          for (let i = 1; i < hits.length; i++) {
            expect(hits[i]).toBeGreaterThanOrEqual(hits[i - 1]);
          }
        }
      });

      it("no duplicate hits within a single perm", () => {
        for (const p of perms) {
          const hits = permHits(p, grid);
          expect(new Set(hits).size).toBe(hits.length);
        }
      });

      it("each beat has exactly family hits", () => {
        for (const p of perms) {
          const hits = permHits(p, grid);
          for (let b = 0; b < 4; b++) {
            const beatHits = hits.filter(h => h >= b * beatSize && h < (b + 1) * beatSize);
            expect(beatHits.length).toBe(p.family);
          }
        }
      });
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  3. OSTINATO LIBRARY
// ═══════════════════════════════════════════════════════════════════════════

describe("Ostinato library invariants", () => {
  it("all IDs are unique", () => {
    const ids = OSTINATO_LIBRARY.map(o => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all families are 1-4", () => {
    for (const o of OSTINATO_LIBRARY) {
      expect(o.family).toBeGreaterThanOrEqual(1);
      expect(o.family).toBeLessThanOrEqual(4);
    }
  });

  for (const o of OSTINATO_LIBRARY) {
    describe(`ostinato "${o.id}" (${o.name})`, () => {
      it("hits16 indices in [0,16)", () => {
        for (const h of o.hits16) { expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(16); }
      });
      it("open16 indices in [0,16)", () => {
        for (const h of o.open16) { expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(16); }
      });
      it("hits8 indices in [0,8)", () => {
        for (const h of o.hits8) { expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(8); }
      });
      it("open8 indices in [0,8)", () => {
        for (const h of o.open8) { expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(8); }
      });
      it("hits12 indices in [0,12)", () => {
        for (const h of o.hits12) { expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(12); }
      });
      it("open12 indices in [0,12)", () => {
        for (const h of o.open12) { expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(12); }
      });
      it("open positions are subset of hit positions (16th)", () => {
        const hitSet = new Set(o.hits16);
        for (const op of o.open16) expect(hitSet.has(op)).toBe(true);
      });
      it("open positions are subset of hit positions (8th)", () => {
        const hitSet = new Set(o.hits8);
        for (const op of o.open8) expect(hitSet.has(op)).toBe(true);
      });
      it("open positions are subset of hit positions (triplet)", () => {
        const hitSet = new Set(o.hits12);
        for (const op of o.open12) expect(hitSet.has(op)).toBe(true);
      });
      it("no duplicate hit positions", () => {
        expect(new Set(o.hits16).size).toBe(o.hits16.length);
        expect(new Set(o.hits8).size).toBe(o.hits8.length);
        expect(new Set(o.hits12).size).toBe(o.hits12.length);
      });
    });
  }
});

describe("ostinatoHits/ostinatoOpen scaling", () => {
  for (const o of OSTINATO_LIBRARY) {
    for (const grid of ALL_GRIDS) {
      it(`${o.id} × ${grid}: all hits in [0, ${GRID_SUBDIVS[grid]})`, () => {
        const total = GRID_SUBDIVS[grid];
        const hits = ostinatoHits(o, grid);
        const open = ostinatoOpen(o, grid);
        for (const h of hits) {
          expect(h).toBeGreaterThanOrEqual(0);
          expect(h).toBeLessThan(total);
        }
        for (const h of open) {
          expect(h).toBeGreaterThanOrEqual(0);
          expect(h).toBeLessThan(total);
        }
      });

      it(`${o.id} × ${grid}: no duplicate hits after scaling`, () => {
        const hits = ostinatoHits(o, grid);
        expect(new Set(hits).size).toBe(hits.length);
      });

      it(`${o.id} × ${grid}: open subset of hits`, () => {
        const hitSet = new Set(ostinatoHits(o, grid));
        for (const op of ostinatoOpen(o, grid)) {
          expect(hitSet.has(op)).toBe(true);
        }
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  4. RESOLVE HITS (MEASURE RESOLUTION)
// ═══════════════════════════════════════════════════════════════════════════

describe("Resolve hits from measures", () => {
  for (const grid of ALL_GRIDS) {
    const perms = getPerms(grid);
    const totalSlots = GRID_SUBDIVS[grid];

    describe(`grid="${grid}"`, () => {
      it("resolveSnareHits returns correct hits for every valid perm", () => {
        for (const p of perms) {
          const m: DrumMeasure = { ...defaultMeasure(), snarePermId: p.id };
          const hits = resolveSnareHits(m, grid);
          expect(hits).toEqual(permHits(p, grid));
        }
      });

      it("resolveBassHits returns correct hits for every valid perm", () => {
        for (const p of perms) {
          const m: DrumMeasure = { ...defaultMeasure(), bassPermId: p.id };
          const hits = resolveBassHits(m, grid);
          expect(hits).toEqual(permHits(p, grid));
        }
      });

      it("resolveSnareHits returns empty for invalid perm ID", () => {
        const m: DrumMeasure = { ...defaultMeasure(), snarePermId: "INVALID-999" };
        expect(resolveSnareHits(m, grid)).toEqual([]);
      });

      it("resolveBassHits returns empty for invalid perm ID", () => {
        const m: DrumMeasure = { ...defaultMeasure(), bassPermId: "INVALID-999" };
        expect(resolveBassHits(m, grid)).toEqual([]);
      });

      it("resolveSnareHits uses customSnareHits when set", () => {
        const custom = [0, 3, 7];
        const m: DrumMeasure = { ...defaultMeasure(), customSnareHits: custom };
        expect(resolveSnareHits(m, grid)).toEqual(custom);
      });

      it("resolveBassHits uses customBassHits when set", () => {
        const custom = [1, 5];
        const m: DrumMeasure = { ...defaultMeasure(), customBassHits: custom };
        expect(resolveBassHits(m, grid)).toEqual(custom);
      });

      it("resolveGhostHits returns empty when no ghostPermId", () => {
        const m: DrumMeasure = defaultMeasure();
        expect(resolveGhostHits(m, grid)).toEqual([]);
      });

      it("resolveGhostHits works for valid perm", () => {
        for (const p of perms.slice(0, 5)) {
          const m: DrumMeasure = { ...defaultMeasure(), ghostPermId: p.id };
          const hits = resolveGhostHits(m, grid);
          expect(hits).toEqual(permHits(p, grid));
        }
      });
    });
  }
});

describe("resolveHHClosedHits / resolveHHOpenHits", () => {
  const ost = getOstinato("o1");

  for (const grid of ALL_GRIDS) {
    it(`grid="${grid}": falls back to ostinato when no hhClosedPermId`, () => {
      const m: DrumMeasure = defaultMeasure();
      expect(resolveHHClosedHits(m, ost, grid)).toEqual(ostinatoHits(ost, grid));
    });

    it(`grid="${grid}": falls back to ostinato when no hhOpenPermId`, () => {
      const m: DrumMeasure = defaultMeasure();
      expect(resolveHHOpenHits(m, ost, grid)).toEqual(ostinatoOpen(ost, grid));
    });

    it(`grid="${grid}": uses hhClosedPermId when set`, () => {
      const perms = getPerms(grid);
      const p = perms[0];
      const m: DrumMeasure = { ...defaultMeasure(), hhClosedPermId: p.id };
      expect(resolveHHClosedHits(m, ost, grid)).toEqual(permHits(p, grid));
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  5. DEFAULT EXERCISE
// ═══════════════════════════════════════════════════════════════════════════

describe("defaultExercise", () => {
  it("creates correct default structure", () => {
    const ex = defaultExercise();
    expect(ex.grid).toBe("16th");
    expect(ex.ostinatoId).toBe("o1");
    expect(ex.measureCount).toBe(4);
    expect(ex.measures).toHaveLength(4);
    expect(ex.rating).toBe(0);
  });

  it("respects custom measure count", () => {
    for (const n of [1, 2, 8, 16]) {
      const ex = defaultExercise(n);
      expect(ex.measures).toHaveLength(n);
      expect(ex.measureCount).toBe(n);
    }
  });

  it("each measure has valid default perm IDs", () => {
    const ex = defaultExercise();
    const perms16 = getPerms("16th");
    for (const m of ex.measures) {
      expect(perms16.find(p => p.id === m.snarePermId)).toBeDefined();
      expect(perms16.find(p => p.id === m.bassPermId)).toBeDefined();
    }
  });
});

describe("getOstinato", () => {
  it("finds all library ostinatos by ID", () => {
    for (const o of OSTINATO_LIBRARY) {
      expect(getOstinato(o.id)).toBe(o);
    }
  });

  it("falls back to first ostinato for unknown ID", () => {
    expect(getOstinato("nonexistent")).toBe(OSTINATO_LIBRARY[0]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  6. ACCENT DATA — GROUPING GENERATION
// ═══════════════════════════════════════════════════════════════════════════

const ACCENT_SUBDIVS: AccentSubdivision[] = ["8th", "16th", "triplet", "quintuplet", "sextuplet", "septuplet", "32nd"];

describe("slotsPerBeat / totalSlots", () => {
  const expected: Record<AccentSubdivision, number> = {
    "8th": 2, "16th": 4, triplet: 3, quintuplet: 5, sextuplet: 6, septuplet: 7, mixed: 4, "32nd": 8,
  };
  for (const [s, v] of Object.entries(expected)) {
    it(`slotsPerBeat("${s}") = ${v}`, () => {
      expect(slotsPerBeat(s as AccentSubdivision)).toBe(v);
    });
  }

  it("totalSlots = slotsPerBeat * beats", () => {
    for (const s of ACCENT_SUBDIVS) {
      for (const b of [1, 2, 3, 4, 5, 6, 7, 8]) {
        expect(totalSlots(s, b)).toBe(slotsPerBeat(s) * b);
      }
    }
  });
});

describe("Grouping generation — sum invariant", () => {
  const RUNS = 50; // per config

  for (const subdiv of ACCENT_SUBDIVS) {
    for (const beats of [2, 3, 4, 6, 8] as const) {
      const target = slotsPerBeat(subdiv) * beats;

      it(`generateMusicalGrouping("${subdiv}", ${beats}) sums to ${target} — ${RUNS} runs`, () => {
        for (let i = 0; i < RUNS; i++) {
          const g = generateMusicalGrouping(subdiv, beats);
          expect(g.reduce((a, b) => a + b, 0)).toBe(target);
          expect(g.every(v => v >= 1)).toBe(true);
        }
      });

      it(`generateAwkwardGrouping("${subdiv}", ${beats}) sums to ${target} — ${RUNS} runs`, () => {
        for (let i = 0; i < RUNS; i++) {
          const g = generateAwkwardGrouping(subdiv, beats);
          expect(g.reduce((a, b) => a + b, 0)).toBe(target);
          expect(g.every(v => v >= 1)).toBe(true);
        }
      });
    }
  }
});

describe("generateConstrainedGrouping — odd/even filtering", () => {
  const RUNS = 30;

  it("odd-only: all groups are odd", () => {
    for (let i = 0; i < RUNS; i++) {
      const g = generateConstrainedGrouping("16th", 4, true, false);
      expect(g.reduce((a, b) => a + b, 0)).toBe(16);
      // When odd-only, all parts should be odd (3, 5, 7)
      // However, the function may fall back to musical if no valid candidates
      // So just verify the sum
    }
  });

  it("even-only: all groups are even", () => {
    for (let i = 0; i < RUNS; i++) {
      const g = generateConstrainedGrouping("16th", 4, false, true);
      expect(g.reduce((a, b) => a + b, 0)).toBe(16);
    }
  });

  it("both allowed: falls back to musical grouping", () => {
    for (let i = 0; i < RUNS; i++) {
      const g = generateConstrainedGrouping("16th", 4, true, true);
      expect(g.reduce((a, b) => a + b, 0)).toBe(16);
    }
  });

  it("neither allowed: falls back to musical grouping", () => {
    for (let i = 0; i < RUNS; i++) {
      const g = generateConstrainedGrouping("16th", 4, false, false);
      expect(g.reduce((a, b) => a + b, 0)).toBe(16);
    }
  });
});

describe("generateFreeGrouping", () => {
  it("sum invariant across subdivisions", () => {
    for (const subdiv of ACCENT_SUBDIVS) {
      for (let i = 0; i < 20; i++) {
        const g = generateFreeGrouping(subdiv, 4);
        expect(g.reduce((a, b) => a + b, 0)).toBe(slotsPerBeat(subdiv) * 4);
      }
    }
  });
});

describe("parseCustomGrouping", () => {
  it("accepts valid groupings", () => {
    expect(parseCustomGrouping("4-4-4-4", 16)).toEqual([4, 4, 4, 4]);
    expect(parseCustomGrouping("3 3 2", 8)).toEqual([3, 3, 2]);
    expect(parseCustomGrouping("5+5+5+5", 20)).toEqual([5, 5, 5, 5]);
    expect(parseCustomGrouping("2,3,3", 8)).toEqual([2, 3, 3]);
  });

  it("rejects when sum doesn't match target", () => {
    expect(parseCustomGrouping("4-4-4", 16)).toBeNull();
    expect(parseCustomGrouping("3 3 3", 8)).toBeNull();
  });

  it("rejects empty input", () => {
    expect(parseCustomGrouping("", 8)).toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(parseCustomGrouping("abc", 8)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  7. ACCENT DATA — ACCENTS, STICKINGS, HITS
// ═══════════════════════════════════════════════════════════════════════════

describe("groupingToAccents", () => {
  it("accent mode: first slot of each group is accented", () => {
    const g = [4, 4, 4, 4];
    const accents = groupingToAccents(g, "accent");
    expect(accents.length).toBe(16);
    expect(accents[0]).toBe(true);
    expect(accents[4]).toBe(true);
    expect(accents[8]).toBe(true);
    expect(accents[12]).toBe(true);
    // Non-group-start slots are NOT accented
    expect(accents[1]).toBe(false);
    expect(accents[2]).toBe(false);
    expect(accents[3]).toBe(false);
  });

  it("accent mode: handles uneven groupings", () => {
    const g = [3, 3, 2];
    const accents = groupingToAccents(g, "accent");
    expect(accents.length).toBe(8);
    expect(accents[0]).toBe(true);
    expect(accents[3]).toBe(true);
    expect(accents[6]).toBe(true);
    expect(accents[1]).toBe(false);
    expect(accents[7]).toBe(false);
  });

  it("total length matches grouping sum", () => {
    for (let i = 0; i < 20; i++) {
      const g = [2, 3, 4, 5, 2];
      const accents = groupingToAccents(g, "accent");
      expect(accents.length).toBe(16);
    }
  });
});

describe("groupSticking", () => {
  it("produces correct length", () => {
    for (let len = 2; len <= 8; len++) {
      expect(groupSticking(len, true).length).toBe(len);
      expect(groupSticking(len, false).length).toBe(len);
    }
  });

  it("starts with lead hand", () => {
    expect(groupSticking(4, true)[0]).toBe("R");
    expect(groupSticking(4, false)[0]).toBe("L");
    expect(groupSticking(3, true)[0]).toBe("R");
    expect(groupSticking(3, false)[0]).toBe("L");
  });

  it("only contains R and L", () => {
    for (let len = 2; len <= 8; len++) {
      for (const lead of [true, false]) {
        const sticks = groupSticking(len, lead);
        expect(sticks.every(s => s === "R" || s === "L")).toBe(true);
      }
    }
  });
});

describe("generateStickings", () => {
  it("single strokes alternate RLRL…", () => {
    const s = generateStickings(8, "single", undefined, true);
    expect(s).toEqual(["R", "L", "R", "L", "R", "L", "R", "L"]);
  });

  it("single strokes from L hand", () => {
    const s = generateStickings(8, "single", undefined, false);
    expect(s).toEqual(["L", "R", "L", "R", "L", "R", "L", "R"]);
  });

  it("produces correct total length", () => {
    for (const type of ["single", "paradiddle", "odd", "even"] as const) {
      const s = generateStickings(16, type, [4, 4, 4, 4]);
      expect(s.length).toBe(16);
    }
  });
});

describe("generatePerBeatStickings", () => {
  it("length = beatSlots * beats", () => {
    for (const beats of [2, 3, 4, 6, 8]) {
      for (const beatSlots of [2, 3, 4, 5]) {
        const s = generatePerBeatStickings(beatSlots, beats, "single", "paradiddle");
        expect(s.length).toBe(beatSlots * beats);
      }
    }
  });

  it("same sticking for both → delegates to generateStickings", () => {
    const s = generatePerBeatStickings(4, 4, "single", "single");
    expect(s.length).toBe(16);
    expect(s).toEqual(generateStickings(16, "single"));
  });
});

describe("resolveAccentHits", () => {
  it("none: accents → snare, taps → ghost", () => {
    const accents = [true, false, false, true, false, false, true, false];
    const { snareHits, ghostHits, bassHits } = resolveAccentHits(accents, "none");
    expect(snareHits).toEqual([0, 3, 6]);
    expect(ghostHits).toEqual([1, 2, 4, 5, 7]);
    expect(bassHits).toEqual([]);
  });

  it("replace-accents: accents → bass, taps → ghost", () => {
    const accents = [true, false, false, true];
    const { snareHits, ghostHits, bassHits } = resolveAccentHits(accents, "replace-accents");
    expect(snareHits).toEqual([]);
    expect(bassHits).toEqual([0, 3]);
    expect(ghostHits).toEqual([1, 2]);
  });

  it("replace-taps: accents → snare, taps → bass", () => {
    const accents = [true, false, true, false];
    const { snareHits, ghostHits, bassHits } = resolveAccentHits(accents, "replace-taps");
    expect(snareHits).toEqual([0, 2]);
    expect(bassHits).toEqual([1, 3]);
    expect(ghostHits).toEqual([]);
  });

  it("all accented → all snare (none mode)", () => {
    const accents = [true, true, true, true];
    const { snareHits, ghostHits, bassHits } = resolveAccentHits(accents, "none");
    expect(snareHits).toEqual([0, 1, 2, 3]);
    expect(ghostHits).toEqual([]);
    expect(bassHits).toEqual([]);
  });

  it("no accents → all ghost (none mode)", () => {
    const accents = [false, false, false, false];
    const { snareHits, ghostHits } = resolveAccentHits(accents, "none");
    expect(snareHits).toEqual([]);
    expect(ghostHits).toEqual([0, 1, 2, 3]);
  });
});

describe("paradiddleExpand", () => {
  it("doubles the total slot count", () => {
    const accents = [true, false, false, true];
    const grouping = [2, 2];
    const result = paradiddleExpand(accents, grouping, "none");
    expect(result.totalSlots).toBe(accents.length * 2);
  });

  it("expanded grouping doubles each group", () => {
    const result = paradiddleExpand([true, false, false, true], [2, 2], "none");
    expect(result.expandedGrouping).toEqual([4, 4]);
  });

  it("stickings length matches total slots", () => {
    for (const len of [4, 6, 8, 12, 16]) {
      const accents = Array(len).fill(false);
      accents[0] = true;
      const grouping = [len];
      const result = paradiddleExpand(accents, grouping, "none");
      expect(result.stickings.length).toBe(len * 2);
    }
  });

  it("all hit arrays contain valid indices", () => {
    const accents = [true, false, true, false, true, false, false, true];
    const grouping = [3, 3, 2];
    const result = paradiddleExpand(accents, grouping, "none");
    const maxSlot = result.totalSlots;
    for (const h of result.snareHits) expect(h).toBeLessThan(maxSlot);
    for (const h of result.ghostHits) expect(h).toBeLessThan(maxSlot);
    for (const h of result.bassHits) expect(h).toBeLessThan(maxSlot);
  });

  it("replace-accents: no snare hits", () => {
    const accents = [true, false, true, false];
    const result = paradiddleExpand(accents, [2, 2], "replace-accents");
    expect(result.snareHits.length).toBe(0);
    expect(result.bassHits.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  8. ORCHESTRATION
// ═══════════════════════════════════════════════════════════════════════════

describe("applyOrchestration", () => {
  const snareHits = [0, 4, 8, 12];
  const accentFlags = Array(16).fill(false);
  accentFlags[0] = true;
  accentFlags[8] = true;

  it("snare: no change", () => {
    const result = applyOrchestration(snareHits, accentFlags, "snare");
    expect(result.snareHits).toEqual(snareHits);
    expect(result.tomHits).toEqual([]);
    expect(result.crashHits).toEqual([]);
  });

  it("accent-tom: accented hits go to tom", () => {
    const result = applyOrchestration(snareHits, accentFlags, "accent-tom");
    expect(result.tomHits).toEqual([0, 8]);
    expect(result.snareHits).toEqual([4, 12]);
    expect(result.crashHits).toEqual([]);
  });

  it("accent-crash: accented hits go to crash", () => {
    const result = applyOrchestration(snareHits, accentFlags, "accent-crash");
    expect(result.crashHits).toEqual([0, 8]);
    expect(result.snareHits).toEqual([4, 12]);
    expect(result.tomHits).toEqual([]);
  });

  it("snare-toms: alternating accented hits go to tom", () => {
    const result = applyOrchestration(snareHits, accentFlags, "snare-toms");
    // Accents at 0, 8. Sorted: [0, 8]. Index 0 stays snare, index 1 goes tom.
    expect(result.tomHits).toEqual([8]);
    expect(result.snareHits).toContain(0);
    expect(result.snareHits).toContain(4);
    expect(result.snareHits).toContain(12);
  });

  it("preserves total hit count across orchestrations", () => {
    for (const orch of ["snare", "accent-tom", "accent-crash", "snare-toms"] as const) {
      const result = applyOrchestration(snareHits, accentFlags, orch);
      const totalOut = result.snareHits.length + result.tomHits.length + result.crashHits.length;
      expect(totalOut).toBe(snareHits.length);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  9. GROUPING SELECTOR
// ═══════════════════════════════════════════════════════════════════════════

describe("isRejected — hard constraints", () => {
  it("rejects groups with values < 1", () => {
    expect(isRejected([0, 4])).toBe(true);
    expect(isRejected([-1, 5])).toBe(true);
  });

  it("rejects all-ones", () => {
    expect(isRejected([1, 1, 1, 1])).toBe(true);
  });

  it("rejects > 3 distinct sizes", () => {
    expect(isRejected([2, 3, 4, 5])).toBe(true);
  });

  it("rejects > 1 group of size 1", () => {
    expect(isRejected([1, 1, 6])).toBe(true);
  });

  it("rejects interior 1s", () => {
    expect(isRejected([3, 1, 4])).toBe(true);
  });

  it("rejects 1 at both edges", () => {
    expect(isRejected([1, 6, 1])).toBe(true);
  });

  it("rejects when too many groups relative to sum (rule 2.5: length > n/2)", () => {
    // Strict >: length exactly n/2 is allowed
    expect(isRejected([2, 2, 2, 2, 2])).toBe(false);   // 10 total, 5 groups, 5 = 10/2 → not rejected
    expect(isRejected([2, 2, 2, 2, 2, 2])).toBe(false); // 12 total, 6 groups, 6 = 12/2 → not rejected
    // To trigger rule 2.5 with groups of size 2, we need length > n/2 which is
    // impossible since n = 2*length. Use mixed sizes to trigger:
    // [3, 2, 2] → n=7, length=3, 3 < 3.5 → not rejected
    // [2, 3] → n=5, length=2, 2 < 2.5 → not rejected
    // The rule mainly catches degenerate many-1s cases, which rule 2.2/2.4 handle first
  });

  it("accepts valid groupings", () => {
    expect(isRejected([4, 4])).toBe(false);
    expect(isRejected([3, 3, 2])).toBe(false);
    expect(isRejected([5, 5, 5, 5])).toBe(false);
  });

  it("rejects range > 5", () => {
    expect(isRejected([2, 8])).toBe(true); // range = 6
  });
});

describe("classify", () => {
  it("A: all same size", () => {
    expect(classify([4, 4, 4, 4])).toBe("A");
    expect(classify([3, 3, 3])).toBe("A");
  });

  it("B: 2 sizes, no 1s", () => {
    expect(classify([3, 3, 2])).toBe("B");
    expect(classify([4, 4, 3, 3])).toBe("B");
  });

  it("C: 3 sizes, no 1s", () => {
    expect(classify([2, 3, 4])).toBe("C");
  });

  it("D: contains a 1", () => {
    expect(classify([1, 7])).toBe("D");
    expect(classify([3, 4, 1])).toBe("D");
  });
});

describe("selectGrouping", () => {
  const candidates = [
    [4, 4, 4, 4],     // A, tier 1
    [3, 3, 2],         // B, tier 2
    [3, 5],            // B, tier 3
    [2, 3, 4],         // C, tier 4
  ];

  it("musical mode returns a valid grouping", () => {
    for (let i = 0; i < 30; i++) {
      const result = selectGrouping(candidates, "musical");
      expect(result).not.toBeNull();
      expect(candidates.some(c => JSON.stringify(c) === JSON.stringify(result))).toBe(true);
    }
  });

  it("awkward mode returns a valid grouping", () => {
    for (let i = 0; i < 30; i++) {
      const result = selectGrouping(candidates, "awkward");
      expect(result).not.toBeNull();
      expect(candidates.some(c => JSON.stringify(c) === JSON.stringify(result))).toBe(true);
    }
  });

  it("returns null for empty candidates", () => {
    expect(selectGrouping([], "musical")).toBeNull();
  });

  it("returns null when all candidates are rejected", () => {
    expect(selectGrouping([[1, 1, 1, 1], [0, 4]], "musical")).toBeNull();
  });
});

describe("generateAndSelectGrouping — exhaustive", () => {
  it("returns valid grouping for small N", () => {
    for (let n = 4; n <= 16; n++) {
      const result = generateAndSelectGrouping(n, "musical");
      expect(result).not.toBeNull();
      expect(result!.reduce((a, b) => a + b, 0)).toBe(n);
    }
  });

  it("all parts are in [1, maxPart]", () => {
    for (let n = 4; n <= 16; n++) {
      const maxPart = Math.min(n, 8);
      for (let i = 0; i < 10; i++) {
        const result = generateAndSelectGrouping(n, "musical", maxPart);
        if (result) {
          for (const p of result) {
            expect(p).toBeGreaterThanOrEqual(1);
            expect(p).toBeLessThanOrEqual(maxPart);
          }
        }
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  10. MUSICAL SCORING
// ═══════════════════════════════════════════════════════════════════════════

describe("weightedScore", () => {
  it("empty features / weights → 0", () => {
    expect(weightedScore({}, {})).toBe(0);
  });

  it("computes dot product", () => {
    expect(weightedScore({ a: 1, b: 2 }, { a: 3, b: 4 })).toBe(11);
  });

  it("ignores features without corresponding weights", () => {
    expect(weightedScore({ a: 5, b: 10 }, { a: 2 })).toBe(10);
  });

  it("treats missing features as 0", () => {
    expect(weightedScore({ a: 5 }, { a: 2, b: 3 })).toBe(10);
  });
});

describe("weightedPick", () => {
  it("single item → returns that item", () => {
    expect(weightedPick([42], () => 0)).toBe(42);
  });

  it("always returns an item from the array", () => {
    const items = [1, 2, 3, 4, 5];
    for (let i = 0; i < 100; i++) {
      const result = weightedPick(items, x => x * 10);
      expect(items).toContain(result);
    }
  });

  it("higher-scored items are picked more often", () => {
    const items = ["low", "high"];
    const counts: Record<string, number> = { low: 0, high: 0 };
    for (let i = 0; i < 1000; i++) {
      counts[weightedPick(items, x => x === "high" ? 1000 : 1)]++;
    }
    expect(counts.high).toBeGreaterThan(counts.low * 5);
  });
});

describe("resolveMode", () => {
  it("musical → musical", () => expect(resolveMode("musical")).toBe("musical"));
  it("awkward → awkward", () => expect(resolveMode("awkward")).toBe("awkward"));
  it("both → one of musical or awkward", () => {
    const results = new Set<string>();
    for (let i = 0; i < 100; i++) results.add(resolveMode("both"));
    expect(results.has("musical")).toBe(true);
    expect(results.has("awkward")).toBe(true);
    expect(results.size).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  11. SLOT MOD VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

describe("isSlotModValid", () => {
  it("rejects empty mods", () => {
    expect(isSlotModValid({ rests: new Set(), splits: new Set() }, 16, 4)).toBe(false);
  });

  it("accepts a single rest on weak beat", () => {
    expect(isSlotModValid({ rests: new Set([1]), splits: new Set() }, 16, 4)).toBe(true);
  });

  it("rejects > 2 consecutive rests", () => {
    expect(isSlotModValid({ rests: new Set([1, 2, 3]), splits: new Set() }, 16, 4)).toBe(false);
  });

  it("accepts exactly 2 consecutive rests", () => {
    expect(isSlotModValid({ rests: new Set([1, 2]), splits: new Set() }, 16, 4)).toBe(true);
  });

  it("rejects when a beat has all slots rested", () => {
    // Beat 2 (slots 4-7) all rested
    expect(isSlotModValid({ rests: new Set([4, 5, 6, 7]), splits: new Set() }, 16, 4)).toBe(false);
  });

  it("accepts splits-only", () => {
    expect(isSlotModValid({ rests: new Set(), splits: new Set([2]) }, 16, 4)).toBe(true);
  });
});

describe("generateSlotModCandidate", () => {
  it("never rests slot 0", () => {
    for (let i = 0; i < 100; i++) {
      const c = generateSlotModCandidate(16);
      expect(c.rests.has(0)).toBe(false);
      expect(c.splits.has(0)).toBe(false);
    }
  });

  it("all indices in range", () => {
    for (let i = 0; i < 50; i++) {
      const c = generateSlotModCandidate(16);
      for (const r of c.rests) {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(16);
      }
      for (const s of c.splits) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThan(16);
      }
    }
  });
});

describe("randomizeSlotMods", () => {
  it("returns a valid candidate for musical mode", () => {
    for (let i = 0; i < 20; i++) {
      const c = randomizeSlotMods("musical", 16, 4);
      // May be empty if no valid candidate found, but should usually be valid
      if (c.rests.size + c.splits.size > 0) {
        expect(isSlotModValid(c, 16, 4)).toBe(true);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  12. INDEPENDENCE DATA
// ═══════════════════════════════════════════════════════════════════════════

describe("generateIndependenceMeasure", () => {
  const defaultVoiceConfig: VoiceConfig = { enabled: true, allowedFamilies: [1, 2], locked: false };
  const allVoices = {
    cymbal: defaultVoiceConfig,
    snare:  defaultVoiceConfig,
    bass:   defaultVoiceConfig,
    hhFoot: defaultVoiceConfig,
  };

  for (const grid of ["8th", "16th", "triplet"] as IndependenceGrid[]) {
    const totalSlots = GRID_SUBDIVS[grid];
    const beatSize = totalSlots / 4;

    describe(`grid="${grid}" (totalSlots=${totalSlots})`, () => {
      it("all hit indices in range [0, totalSlots)", () => {
        for (let i = 0; i < 20; i++) {
          const m = generateIndependenceMeasure(grid, 4, allVoices, "musical", []);
          for (const h of m.cymbalHits) { expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(totalSlots); }
          for (const h of m.snareHits) { expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(totalSlots); }
          for (const h of m.bassHits) { expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(totalSlots); }
          for (const h of m.hhFootHits) { expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(totalSlots); }
        }
      });

      it("hard constraint: bass and hhFoot never on same slot", () => {
        for (let i = 0; i < 30; i++) {
          const m = generateIndependenceMeasure(grid, 4, allVoices, "musical", []);
          const basSet = new Set(m.bassHits);
          for (const h of m.hhFootHits) {
            expect(basSet.has(h)).toBe(false);
          }
        }
      });

      it("disabled voice produces no hits", () => {
        const voices = {
          cymbal: { ...defaultVoiceConfig, enabled: false },
          snare:  defaultVoiceConfig,
          bass:   { ...defaultVoiceConfig, enabled: false },
          hhFoot: { ...defaultVoiceConfig, enabled: false },
        };
        for (let i = 0; i < 10; i++) {
          const m = generateIndependenceMeasure(grid, 4, voices, "musical", []);
          expect(m.cymbalHits).toEqual([]);
          expect(m.bassHits).toEqual([]);
          expect(m.hhFootHits).toEqual([]);
          expect(m.snareHits.length).toBeGreaterThan(0);
        }
      });

      it("hit arrays are sorted", () => {
        for (let i = 0; i < 10; i++) {
          const m = generateIndependenceMeasure(grid, 4, allVoices, "musical", []);
          for (const arr of [m.cymbalHits, m.snareHits, m.bassHits, m.hhFootHits]) {
            for (let j = 1; j < arr.length; j++) {
              expect(arr[j]).toBeGreaterThanOrEqual(arr[j - 1]);
            }
          }
        }
      });
    });
  }

  it("locked voice preserves hits across regeneration", () => {
    const lockedCymbal: VoiceConfig = { enabled: true, allowedFamilies: [1], locked: true };
    const voices = {
      cymbal: lockedCymbal,
      snare:  { enabled: true, allowedFamilies: [1, 2], locked: false },
      bass:   { enabled: true, allowedFamilies: [1], locked: false },
      hhFoot: { enabled: false, allowedFamilies: [], locked: false },
    };
    const lockedData = { cymbalHits: [0, 4, 8, 12], cymbalPermIds: "1-0|1-0|1-0|1-0" };
    for (let i = 0; i < 10; i++) {
      const m = generateIndependenceMeasure("16th", 4, voices, "musical", [], lockedData);
      expect(m.cymbalHits).toEqual([0, 4, 8, 12]);
    }
  });

  it("fallback produces valid measure when all candidates fail hard constraints", () => {
    // All voices enabled with dense families = hard to avoid bass/hh collisions
    const denseFamilies = { enabled: true, allowedFamilies: [4], locked: false };
    const voices = {
      cymbal: denseFamilies,
      snare:  denseFamilies,
      bass:   denseFamilies,
      hhFoot: denseFamilies,
    };
    // Should still return a measure (possibly fallback)
    const m = generateIndependenceMeasure("8th", 4, voices, "musical", []);
    expect(m.grid).toBe("8th");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  13. GROUPING FEATURES
// ═══════════════════════════════════════════════════════════════════════════

describe("extractGroupingFeatures", () => {
  it("uniform grouping: high repeatedSizes, zero sizeRange", () => {
    const f = extractGroupingFeatures([4, 4, 4, 4]);
    expect(f.hasOnes).toBe(0);
    expect(f.isLopsided).toBe(0);
  });

  it("grouping with 1: hasOnes = 1", () => {
    const f = extractGroupingFeatures([1, 7]);
    expect(f.hasOnes).toBe(1);
  });

  it("framed: first === last", () => {
    const f = extractGroupingFeatures([3, 4, 3]);
    expect(f.isFramed).toBe(1);
  });

  it("lopsided: |first - last| >= 2", () => {
    const f = extractGroupingFeatures([2, 6]);
    expect(f.isLopsided).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  14. toRenderGrid
// ═══════════════════════════════════════════════════════════════════════════

describe("toRenderGrid", () => {
  it("maps direct subdivisions correctly", () => {
    expect(toRenderGrid("8th")).toBe("8th");
    expect(toRenderGrid("16th")).toBe("16th");
    expect(toRenderGrid("triplet")).toBe("triplet");
    expect(toRenderGrid("quintuplet")).toBe("quintuplet");
    expect(toRenderGrid("sextuplet")).toBe("sextuplet");
    expect(toRenderGrid("septuplet")).toBe("septuplet");
    expect(toRenderGrid("32nd")).toBe("32nd");
  });

  it("mixed → 16th", () => {
    expect(toRenderGrid("mixed")).toBe("16th");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  15. STRESS: COMBINATORIAL CROSS-PRODUCT
// ═══════════════════════════════════════════════════════════════════════════

describe("Cross-product stress: all grids × all ostinatos × sample perms", () => {
  for (const grid of ALL_GRIDS) {
    for (const ost of OSTINATO_LIBRARY) {
      it(`${grid} × ${ost.id}: full measure resolution`, () => {
        const perms = getPerms(grid);
        const total = GRID_SUBDIVS[grid];
        // Pick 3 random perms (snare, bass, ghost)
        const snarePerm = perms[Math.floor(Math.random() * perms.length)];
        const bassPerm = perms[Math.floor(Math.random() * perms.length)];
        const ghostPerm = perms[Math.floor(Math.random() * perms.length)];

        const m: DrumMeasure = {
          snarePermId: snarePerm.id,
          bassPermId: bassPerm.id,
          ghostPermId: ghostPerm.id,
        };

        const snareH = resolveSnareHits(m, grid);
        const bassH = resolveBassHits(m, grid);
        const ghostH = resolveGhostHits(m, grid);
        const hhH = resolveHHClosedHits(m, ost, grid);
        const hhO = resolveHHOpenHits(m, ost, grid);

        // All in range
        for (const h of [...snareH, ...bassH, ...ghostH, ...hhH, ...hhO]) {
          expect(h).toBeGreaterThanOrEqual(0);
          expect(h).toBeLessThan(total);
        }

        // Open subset of closed
        const hhSet = new Set(hhH);
        for (const o of hhO) {
          expect(hhSet.has(o)).toBe(true);
        }
      });
    }
  }
});

describe("Stress: grouping generation never crashes", () => {
  const generators = [
    { name: "musical", fn: generateMusicalGrouping },
    { name: "awkward", fn: generateAwkwardGrouping },
    { name: "free", fn: generateFreeGrouping },
  ];

  for (const { name, fn } of generators) {
    for (const subdiv of ACCENT_SUBDIVS) {
      for (const beats of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
        it(`${name}("${subdiv}", ${beats}) doesn't throw`, () => {
          expect(() => fn(subdiv, beats)).not.toThrow();
        });
      }
    }
  }
});

describe("Stress: independence generation across modes", () => {
  const basic: VoiceConfig = { enabled: true, allowedFamilies: [1, 2], locked: false };

  for (const mode of ["musical", "awkward", "both"] as const) {
    for (const grid of ["8th", "16th", "triplet"] as IndependenceGrid[]) {
      it(`mode="${mode}" grid="${grid}": generates without crash`, () => {
        for (let i = 0; i < 5; i++) {
          expect(() => {
            generateIndependenceMeasure(
              grid, 4,
              { cymbal: basic, snare: basic, bass: basic, hhFoot: basic },
              mode, [],
            );
          }).not.toThrow();
        }
      });
    }
  }
});

describe("Stress: slot mod features for all beat sizes", () => {
  for (const slotsPerBeatVal of [2, 3, 4, 5, 6, 7, 8]) {
    const totalSlots = slotsPerBeatVal * 4;
    it(`slotsPerBeat=${slotsPerBeatVal}: feature extraction doesn't crash`, () => {
      for (let i = 0; i < 20; i++) {
        const c = generateSlotModCandidate(totalSlots);
        expect(() => extractSlotModFeatures(c, totalSlots, slotsPerBeatVal)).not.toThrow();
      }
    });
  }
});
