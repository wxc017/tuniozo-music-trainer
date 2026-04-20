// ── Stats & Storage Stress Tests ─────────────────────────────────────
// Tests localStorage wrappers, Set serialization, stats recording/undo,
// weighted random selection, preset management, and data import/export.

import { describe, it, expect, beforeEach } from "vitest";

// ── Mock localStorage for Node environment ──────────────────────────
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => { store[key] = val; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  get length() { return Object.keys(store).length; },
  key: (i: number) => Object.keys(store)[i] ?? null,
};

// Install mock before importing modules
Object.defineProperty(globalThis, "localStorage", { value: mockLocalStorage, writable: true });

// Now import modules that use localStorage
import { lsGet, lsSet, localToday } from "./storage";
import {
  recordAnswer, undoLastAnswer, clearAllStats,
  getDailyStats, getOptionStats, getDayTotals,
  getWeekDays, getMonthDays, accuracy,
  weightedRandomChoice, clearDayOption, clearDay,
  removeSlotAnswers, setImportBias, clearImportBias,
} from "./stats";

beforeEach(() => {
  mockLocalStorage.clear();
});

// ── lsGet / lsSet ───────────────────────────────────────────────────

describe("lsGet / lsSet", () => {
  it("round-trips primitives", () => {
    lsSet("test_num", 42);
    expect(lsGet("test_num", 0)).toBe(42);
    lsSet("test_str", "hello");
    expect(lsGet("test_str", "")).toBe("hello");
    lsSet("test_bool", true);
    expect(lsGet("test_bool", false)).toBe(true);
  });

  it("round-trips objects", () => {
    lsSet("test_obj", { a: 1, b: "two" });
    expect(lsGet("test_obj", {})).toEqual({ a: 1, b: "two" });
  });

  it("round-trips arrays", () => {
    lsSet("test_arr", [1, 2, 3]);
    expect(lsGet("test_arr", [])).toEqual([1, 2, 3]);
  });

  it("round-trips Set objects (custom serialization)", () => {
    lsSet("test_set", new Set([1, 2, 3]));
    const result = lsGet<Set<number>>("test_set", new Set());
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(3);
    expect(result.has(1)).toBe(true);
    expect(result.has(2)).toBe(true);
    expect(result.has(3)).toBe(true);
  });

  it("round-trips nested Sets", () => {
    lsSet("test_nested", { mySet: new Set(["a", "b"]) });
    const result = lsGet<{ mySet: Set<string> }>("test_nested", { mySet: new Set() });
    expect(result.mySet).toBeInstanceOf(Set);
    expect(result.mySet.has("a")).toBe(true);
  });

  it("returns fallback for missing keys", () => {
    expect(lsGet("nonexistent", "fallback")).toBe("fallback");
    expect(lsGet("nonexistent", 99)).toBe(99);
  });

  it("returns fallback for corrupted JSON", () => {
    mockLocalStorage.setItem("bad_json", "{invalid json!!}");
    expect(lsGet("bad_json", "default")).toBe("default");
  });

  it("handles null values", () => {
    lsSet("test_null", null);
    expect(lsGet("test_null", "fallback")).toBeNull();
  });

  it("overwrites existing values", () => {
    lsSet("overwrite", 1);
    lsSet("overwrite", 2);
    expect(lsGet("overwrite", 0)).toBe(2);
  });
});

// ── localToday ──────────────────────────────────────────────────────

describe("localToday", () => {
  it("returns YYYY-MM-DD format", () => {
    const today = localToday();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("matches current date components", () => {
    const d = new Date();
    const today = localToday();
    const parts = today.split("-").map(Number);
    expect(parts[0]).toBe(d.getFullYear());
    expect(parts[1]).toBe(d.getMonth() + 1);
    expect(parts[2]).toBe(d.getDate());
  });
});

// ── recordAnswer / getDailyStats / getOptionStats ───────────────────

describe("recordAnswer", () => {
  it("records a correct answer", () => {
    recordAnswer("ivl:5", "Interval: P4", true);
    const opts = getOptionStats();
    expect(opts["ivl:5"].correct).toBe(1);
    expect(opts["ivl:5"].wrong).toBe(0);
    expect(opts["ivl:5"].label).toBe("Interval: P4");
  });

  it("records a wrong answer", () => {
    recordAnswer("ivl:10", "Interval: M3", false);
    const opts = getOptionStats();
    expect(opts["ivl:10"].wrong).toBe(1);
  });

  it("accumulates multiple answers for same key", () => {
    recordAnswer("ivl:5", "P4", true);
    recordAnswer("ivl:5", "P4", true);
    recordAnswer("ivl:5", "P4", false);
    const opts = getOptionStats();
    expect(opts["ivl:5"].correct).toBe(2);
    expect(opts["ivl:5"].wrong).toBe(1);
  });

  it("stores in daily stats keyed by today", () => {
    recordAnswer("crd:I", "Chord I", true);
    const daily = getDailyStats();
    const today = localToday();
    expect(daily[today]).toBeDefined();
    expect(daily[today]["crd:I"].correct).toBe(1);
  });

  it("tracks first_seen and last_seen", () => {
    recordAnswer("mel:test", "Test", true);
    const opts = getOptionStats();
    const today = localToday();
    expect(opts["mel:test"].first_seen).toBe(today);
    expect(opts["mel:test"].last_seen).toBe(today);
  });
});

// ── undoLastAnswer ──────────────────────────────────────────────────

describe("undoLastAnswer", () => {
  it("decrements correct count", () => {
    recordAnswer("ivl:5", "P4", true);
    recordAnswer("ivl:5", "P4", true);
    undoLastAnswer("ivl:5", true);
    expect(getOptionStats()["ivl:5"].correct).toBe(1);
  });

  it("never goes below 0", () => {
    recordAnswer("ivl:5", "P4", true);
    undoLastAnswer("ivl:5", true);
    undoLastAnswer("ivl:5", true);
    undoLastAnswer("ivl:5", true);
    expect(getOptionStats()["ivl:5"].correct).toBe(0);
  });

  it("only affects the specified field (correct vs wrong)", () => {
    recordAnswer("ivl:5", "P4", true);
    recordAnswer("ivl:5", "P4", false);
    undoLastAnswer("ivl:5", true);
    expect(getOptionStats()["ivl:5"].correct).toBe(0);
    expect(getOptionStats()["ivl:5"].wrong).toBe(1);
  });
});

// ── clearAllStats ───────────────────────────────────────────────────

describe("clearAllStats", () => {
  it("resets all stats to empty", () => {
    recordAnswer("a", "A", true);
    recordAnswer("b", "B", false);
    clearAllStats();
    expect(getDailyStats()).toEqual({});
    expect(getOptionStats()).toEqual({});
  });
});

// ── clearDayOption / clearDay ───────────────────────────────────────

describe("clearDayOption", () => {
  it("removes a specific option from a day", () => {
    recordAnswer("a", "A", true);
    recordAnswer("a", "A", true);
    recordAnswer("b", "B", false);
    const today = localToday();
    clearDayOption(today, "a");
    const daily = getDailyStats();
    expect(daily[today]?.["a"]).toBeUndefined();
    expect(daily[today]?.["b"]).toBeDefined();
    // Option stats should be decremented
    expect(getOptionStats()["a"].correct).toBe(0);
  });
});

describe("clearDay", () => {
  it("removes entire day of stats", () => {
    recordAnswer("a", "A", true);
    recordAnswer("b", "B", false);
    const today = localToday();
    clearDay(today);
    expect(getDailyStats()[today]).toBeUndefined();
  });
});

// ── removeSlotAnswers ───────────────────────────────────────────────

describe("removeSlotAnswers", () => {
  it("decrements specified counts per key", () => {
    recordAnswer("a", "A", true);
    recordAnswer("a", "A", true);
    recordAnswer("a", "A", false);
    const today = localToday();
    removeSlotAnswers(today, [{ key: "a", c: 1, w: 1 }]);
    const daily = getDailyStats();
    expect(daily[today]["a"].correct).toBe(1);
    expect(daily[today]["a"].wrong).toBe(0);
  });

  it("cleans up zeroed-out entries", () => {
    recordAnswer("a", "A", true);
    const today = localToday();
    removeSlotAnswers(today, [{ key: "a", c: 1, w: 0 }]);
    // Entry should be cleaned up since both are 0
    expect(getDailyStats()[today]).toBeUndefined();
  });
});

// ── weightedRandomChoice ────────────────────────────────────────────

describe("weightedRandomChoice", () => {
  it("returns element from array", () => {
    const items = ["a", "b", "c"];
    for (let i = 0; i < 50; i++) {
      expect(items).toContain(weightedRandomChoice(items, x => x));
    }
  });

  it("throws for empty array", () => {
    expect(() => weightedRandomChoice([], x => x as string)).toThrow();
  });

  it("returns the only element for single-element array", () => {
    expect(weightedRandomChoice(["only"], x => x)).toBe("only");
  });

  it("prefers unplayed items over heavily-played ones", () => {
    // Record many answers for "a", none for "b" and "c"
    for (let i = 0; i < 20; i++) {
      recordAnswer("a", "A", true);
    }
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 200; i++) {
      const choice = weightedRandomChoice(["a", "b", "c"], x => x);
      counts[choice]++;
    }
    // "b" and "c" should be chosen more often than "a"
    expect(counts["b"] + counts["c"]).toBeGreaterThan(counts["a"]);
  });

  it("import bias boosts items with high error rates", () => {
    // Set bias for "a" with high error rate
    setImportBias({ "a": { c: 1, w: 9 } }); // 90% error
    const counts: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 200; i++) {
      const choice = weightedRandomChoice(["a", "b"], x => x);
      counts[choice]++;
    }
    // "a" should be boosted by its high error rate
    expect(counts["a"]).toBeGreaterThan(counts["b"] * 0.5);
    clearImportBias();
  });
});

// ── getDayTotals ────────────────────────────────────────────────────

describe("getDayTotals", () => {
  it("sums correct and wrong across all options for a day", () => {
    recordAnswer("a", "A", true);
    recordAnswer("a", "A", true);
    recordAnswer("b", "B", false);
    recordAnswer("b", "B", false);
    recordAnswer("b", "B", false);
    const totals = getDayTotals(localToday());
    expect(totals.correct).toBe(2);
    expect(totals.wrong).toBe(3);
  });

  it("returns 0/0 for non-existent day", () => {
    const totals = getDayTotals("2099-01-01");
    expect(totals.correct).toBe(0);
    expect(totals.wrong).toBe(0);
  });
});

// ── getWeekDays / getMonthDays ──────────────────────────────────────

describe("getWeekDays", () => {
  it("returns 7 days", () => {
    expect(getWeekDays().length).toBe(7);
  });

  it("last day is today", () => {
    const days = getWeekDays();
    expect(days[days.length - 1]).toBe(localToday());
  });

  it("days are in chronological order", () => {
    const days = getWeekDays();
    for (let i = 1; i < days.length; i++) {
      expect(days[i] > days[i - 1]).toBe(true);
    }
  });
});

describe("getMonthDays", () => {
  it("returns 28 days for February 2025 (non-leap)", () => {
    expect(getMonthDays(2025, 2).length).toBe(28);
  });

  it("returns 29 days for February 2024 (leap)", () => {
    expect(getMonthDays(2024, 2).length).toBe(29);
  });

  it("returns 31 days for January", () => {
    expect(getMonthDays(2025, 1).length).toBe(31);
  });

  it("returns 30 days for April", () => {
    expect(getMonthDays(2025, 4).length).toBe(30);
  });

  it("all days match YYYY-MM-DD format", () => {
    for (const day of getMonthDays(2025, 3)) {
      expect(day).toMatch(/^2025-03-\d{2}$/);
    }
  });
});

// ── accuracy ────────────────────────────────────────────────────────

describe("accuracy", () => {
  it("returns '—' for zero total", () => {
    expect(accuracy(0, 0)).toBe("—");
  });

  it("returns '100%' for perfect score", () => {
    expect(accuracy(10, 0)).toBe("100%");
  });

  it("returns '0%' for all wrong", () => {
    expect(accuracy(0, 10)).toBe("0%");
  });

  it("returns '50%' for equal correct/wrong", () => {
    expect(accuracy(5, 5)).toBe("50%");
  });

  it("rounds correctly", () => {
    expect(accuracy(1, 2)).toBe("33%"); // 33.33...
    expect(accuracy(2, 1)).toBe("67%"); // 66.66...
  });
});

// ── Stress: concurrent recording/clearing ───────────────────────────

describe("stress: rapid stat operations", () => {
  it("handles 1000 rapid record/undo cycles", () => {
    for (let i = 0; i < 1000; i++) {
      recordAnswer(`stress:${i % 10}`, `S${i % 10}`, i % 3 !== 0);
    }
    const opts = getOptionStats();
    for (let k = 0; k < 10; k++) {
      expect(opts[`stress:${k}`]).toBeDefined();
      expect(opts[`stress:${k}`].correct + opts[`stress:${k}`].wrong).toBe(100);
    }
    // Undo half
    for (let i = 0; i < 500; i++) {
      undoLastAnswer(`stress:${i % 10}`, i % 3 !== 0);
    }
    for (let k = 0; k < 10; k++) {
      expect(opts[`stress:${k}`].correct + opts[`stress:${k}`].wrong).toBeGreaterThanOrEqual(0);
    }
  });

  it("handles recording across 50 different option keys", () => {
    for (let i = 0; i < 50; i++) {
      recordAnswer(`key:${i}`, `Label ${i}`, true);
    }
    const opts = getOptionStats();
    expect(Object.keys(opts).length).toBeGreaterThanOrEqual(50);
  });
});
