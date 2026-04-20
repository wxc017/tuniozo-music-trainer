/**
 * Stickings data & helpers for the Stickings Study tab.
 *
 * Patterns satisfy: max 2 consecutive same limb, max 2 kicks total,
 * R-lead only (swap R↔L for mirror), loops cleanly at seam.
 */

/* ── Types ──────────────────────────────────────────────────────────────────── */

export interface StickingPattern {
  /** Display string, e.g. "RLKR" */
  pattern: string;
  /** Number of slots this pattern occupies (1-7) */
  group: number;
  /** Rudiment family or short description */
  label: string;
}

export interface StickingMeasureData {
  snareHits: number[];
  bassHits: number[];
  accentFlags: boolean[];
  stickings: string[];
  /** Sequence of pattern strings chosen (e.g. ["RLRR","RLK","RLRLR"]) */
  groups: string[];
  /** Total pulse count for this measure (4-32, default 16) */
  totalSlots: number;
  /** How many pulses per beam group (default 4); kept for backward compat */
  beamGrouping: number;
  /** Custom beam grouping array, e.g. [5,3,2,6]. Preferred over beamGrouping when present. */
  beamGroups?: number[];
  lineBreak?: boolean;
}

/* ── Curated pattern catalogue (675 patterns, groups 1–7) ────────────────────── */

export const STICKING_PATTERNS: StickingPattern[] = [
  // ======================================================================
  // Group of 1 — Single strokes (3 patterns)
  // ======================================================================
  { pattern: "R", group: 1, label: "right" },
  { pattern: "L", group: 1, label: "left" },
  { pattern: "K", group: 1, label: "kick" },

  // ======================================================================
  // Group of 2 — Doubles / kick combos (7 patterns)
  // ======================================================================
  { pattern: "RL", group: 2, label: "single stroke" },
  { pattern: "RR", group: 2, label: "double right" },
  { pattern: "LL", group: 2, label: "double left" },
  { pattern: "KR", group: 2, label: "kick + right" },
  { pattern: "KL", group: 2, label: "kick + left" },
  { pattern: "RK", group: 2, label: "right + kick" },
  { pattern: "LK", group: 2, label: "left + kick" },

  // ======================================================================
  // Group of 3 — Triplets / 6-8 feel (16 patterns)
  // ======================================================================
  // ── Hands only ──
  { pattern: "RLL", group: 3, label: "double stroke trail" },
  { pattern: "RLR", group: 3, label: "single stroke (3)" },
  { pattern: "RRL", group: 3, label: "double stroke lead" },
  // ── With 1 kick ──
  { pattern: "KLL", group: 3, label: "double stroke trail (K@1)" },
  { pattern: "KLR", group: 3, label: "single stroke (3) (K@1)" },
  { pattern: "KRL", group: 3, label: "double stroke lead (K@1)" },
  { pattern: "KRR", group: 3, label: "1K, 1 double" },
  { pattern: "RKL", group: 3, label: "double stroke lead (K@2)" },
  { pattern: "RKR", group: 3, label: "single stroke (3) (K@2)" },
  { pattern: "RLK", group: 3, label: "single stroke (3) (K@3)" },
  { pattern: "RRK", group: 3, label: "double stroke lead (K@3)" },
  // ── With 2 kicks ──
  { pattern: "KKL", group: 3, label: "double stroke lead (K@1,2)" },
  { pattern: "KKR", group: 3, label: "single stroke (3) (K@1,2)" },
  { pattern: "KLK", group: 3, label: "single stroke (3) (K@1,3)" },
  { pattern: "KRK", group: 3, label: "double stroke lead (K@1,3)" },
  { pattern: "RKK", group: 3, label: "single stroke (3) (K@2,3)" },
  // ── Voice-oriented (hand-agnostic): bass + snares ──
  { pattern: "BSS", group: 3, label: "bass + 2 snares (any hand)" },

  // ======================================================================
  // Group of 4 — 16th notes (36 patterns)
  // ======================================================================
  // ── Hands only ──
  { pattern: "RLLR", group: 4, label: "reverse paradiddle" },
  { pattern: "RLRL", group: 4, label: "single stroke (4)" },
  { pattern: "RRLL", group: 4, label: "double stroke roll" },
  // ── With 1 kick ──
  { pattern: "KLLR", group: 4, label: "reverse paradiddle (K@1)" },
  { pattern: "KLRL", group: 4, label: "single stroke (4) (K@1)" },
  { pattern: "KLRR", group: 4, label: "paradiddle (K@1)" },
  { pattern: "KRLL", group: 4, label: "double stroke roll (K@1)" },
  { pattern: "KRLR", group: 4, label: "inverted paradiddle (K@1)" },
  { pattern: "KRRL", group: 4, label: "1K, 1 double" },
  { pattern: "RKLL", group: 4, label: "double stroke roll (K@2)" },
  { pattern: "RKLR", group: 4, label: "inverted paradiddle (K@2)" },
  { pattern: "RKRL", group: 4, label: "single stroke (4) (K@2)" },
  { pattern: "RLKL", group: 4, label: "single stroke (4) (K@3)" },
  { pattern: "RLKR", group: 4, label: "paradiddle (K@3)" },
  { pattern: "RLLK", group: 4, label: "reverse paradiddle (K@4)" },
  { pattern: "RLRK", group: 4, label: "single stroke (4) (K@4)" },
  { pattern: "RRKL", group: 4, label: "double stroke roll (K@3)" },
  { pattern: "RRLK", group: 4, label: "double stroke roll (K@4)" },
  // ── With 2 kicks ──
  { pattern: "KKLL", group: 4, label: "double stroke roll (K@1,2)" },
  { pattern: "KKLR", group: 4, label: "inverted paradiddle (K@1,2)" },
  { pattern: "KKRL", group: 4, label: "single stroke (4) (K@1,2)" },
  { pattern: "KKRR", group: 4, label: "paradiddle (K@1,2)" },
  { pattern: "KLKL", group: 4, label: "single stroke (4) (K@1,3)" },
  { pattern: "KLKR", group: 4, label: "paradiddle (K@1,3)" },
  { pattern: "KLLK", group: 4, label: "reverse paradiddle (K@1,4)" },
  { pattern: "KLRK", group: 4, label: "single stroke (4) (K@1,4)" },
  { pattern: "KRKL", group: 4, label: "double stroke roll (K@1,3)" },
  { pattern: "KRKR", group: 4, label: "inverted paradiddle (K@1,3)" },
  { pattern: "KRLK", group: 4, label: "double stroke roll (K@1,4)" },
  { pattern: "KRRK", group: 4, label: "2K, 1 double" },
  { pattern: "RKKL", group: 4, label: "single stroke (4) (K@2,3)" },
  { pattern: "RKKR", group: 4, label: "paradiddle (K@2,3)" },
  { pattern: "RKLK", group: 4, label: "double stroke roll (K@2,4)" },
  { pattern: "RKRK", group: 4, label: "single stroke (4) (K@2,4)" },
  { pattern: "RLKK", group: 4, label: "single stroke (4) (K@3,4)" },
  { pattern: "RRKK", group: 4, label: "double stroke roll (K@3,4)" },
  // ── Voice-oriented (hand-agnostic): bass + snares ──
  { pattern: "BSSS", group: 4, label: "bass + 3 snares (any hand)" },

  // ======================================================================
  // Group of 5 — Quintuplets / odd groupings (83 patterns)
  // ======================================================================
  // ── Hands only ──
  { pattern: "RLLRL", group: 5, label: "1 double" },
  { pattern: "RLRLL", group: 5, label: "1 double" },
  { pattern: "RLRLR", group: 5, label: "single stroke (5)" },
  { pattern: "RLRRL", group: 5, label: "paradiddle-diddle var" },
  { pattern: "RRLRL", group: 5, label: "inverted para (5)" },
  // ── Voice-oriented (hand-agnostic): bass + snares ──
  { pattern: "BSSSS", group: 5, label: "bass + 4 snares (any hand)" },
  // ── With 1 kick ──
  { pattern: "KLLRL", group: 5, label: "1K, 1 double" },
  { pattern: "KLLRR", group: 5, label: "reverse para + double (K@1)" },
  { pattern: "KLRLL", group: 5, label: "1K, 1 double" },
  { pattern: "KLRLR", group: 5, label: "single stroke (5) (K@1)" },
  { pattern: "KLRRL", group: 5, label: "paradiddle-diddle var (K@1)" },
  { pattern: "KRLLR", group: 5, label: "double stroke + alt (K@1)" },
  { pattern: "KRLRL", group: 5, label: "inverted para (5) (K@1)" },
  { pattern: "KRLRR", group: 5, label: "1K, 1 double" },
  { pattern: "KRRLL", group: 5, label: "1K, 2 doubles" },
  { pattern: "KRRLR", group: 5, label: "1K, 1 double" },
  { pattern: "RKLLR", group: 5, label: "double stroke + alt (K@2)" },
  { pattern: "RKLRL", group: 5, label: "inverted para (5) (K@2)" },
  { pattern: "RKRLL", group: 5, label: "1K, 1 double" },
  { pattern: "RKRLR", group: 5, label: "single stroke (5) (K@2)" },
  { pattern: "RKRRL", group: 5, label: "paradiddle-diddle var (K@2)" },
  { pattern: "RLKLL", group: 5, label: "1K, 1 double" },
  { pattern: "RLKLR", group: 5, label: "single stroke (5) (K@3)" },
  { pattern: "RLKRL", group: 5, label: "paradiddle-diddle var (K@3)" },
  { pattern: "RLLKL", group: 5, label: "1K, 1 double" },
  { pattern: "RLLKR", group: 5, label: "reverse para + double (K@4)" },
  { pattern: "RLLRK", group: 5, label: "reverse para + double (K@5)" },
  { pattern: "RLRKL", group: 5, label: "paradiddle-diddle var (K@4)" },
  { pattern: "RLRKR", group: 5, label: "single stroke (5) (K@4)" },
  { pattern: "RLRLK", group: 5, label: "single stroke (5) (K@5)" },
  { pattern: "RLRRK", group: 5, label: "paradiddle-diddle var (K@5)" },
  { pattern: "RRKRL", group: 5, label: "inverted para (5) (K@3)" },
  { pattern: "RRLKL", group: 5, label: "inverted para (5) (K@4)" },
  { pattern: "RRLLK", group: 5, label: "double stroke + alt (K@5)" },
  { pattern: "RRLRK", group: 5, label: "inverted para (5) (K@5)" },
  // ── With 2 kicks ──
  { pattern: "KKLLR", group: 5, label: "double stroke + alt (K@1,2)" },
  { pattern: "KKLRL", group: 5, label: "inverted para (5) (K@1,2)" },
  { pattern: "KKLRR", group: 5, label: "reverse para + double (K@1,2)" },
  { pattern: "KKRLL", group: 5, label: "2K, 1 double" },
  { pattern: "KKRLR", group: 5, label: "single stroke (5) (K@1,2)" },
  { pattern: "KKRRL", group: 5, label: "paradiddle-diddle var (K@1,2)" },
  { pattern: "KLKLL", group: 5, label: "2K, 1 double" },
  { pattern: "KLKLR", group: 5, label: "single stroke (5) (K@1,3)" },
  { pattern: "KLKRL", group: 5, label: "paradiddle-diddle var (K@1,3)" },
  { pattern: "KLKRR", group: 5, label: "reverse para + double (K@1,3)" },
  { pattern: "KLLKL", group: 5, label: "2K, 1 double" },
  { pattern: "KLLKR", group: 5, label: "reverse para + double (K@1,4)" },
  { pattern: "KLLRK", group: 5, label: "reverse para + double (K@1,5)" },
  { pattern: "KLRKL", group: 5, label: "paradiddle-diddle var (K@1,4)" },
  { pattern: "KLRKR", group: 5, label: "single stroke (5) (K@1,4)" },
  { pattern: "KLRLK", group: 5, label: "single stroke (5) (K@1,5)" },
  { pattern: "KLRRK", group: 5, label: "paradiddle-diddle var (K@1,5)" },
  { pattern: "KRKLL", group: 5, label: "2K, 1 double" },
  { pattern: "KRKLR", group: 5, label: "double stroke + alt (K@1,3)" },
  { pattern: "KRKRL", group: 5, label: "inverted para (5) (K@1,3)" },
  { pattern: "KRKRR", group: 5, label: "2K, 1 double" },
  { pattern: "KRLKL", group: 5, label: "inverted para (5) (K@1,4)" },
  { pattern: "KRLKR", group: 5, label: "double stroke + alt (K@1,4)" },
  { pattern: "KRLLK", group: 5, label: "double stroke + alt (K@1,5)" },
  { pattern: "KRLRK", group: 5, label: "inverted para (5) (K@1,5)" },
  { pattern: "KRRKL", group: 5, label: "2K, 1 double" },
  { pattern: "KRRKR", group: 5, label: "2K, 1 double" },
  { pattern: "KRRLK", group: 5, label: "2K, 1 double" },
  { pattern: "RKKLL", group: 5, label: "2K, 1 double" },
  { pattern: "RKKLR", group: 5, label: "single stroke (5) (K@2,3)" },
  { pattern: "RKKRL", group: 5, label: "paradiddle-diddle var (K@2,3)" },
  { pattern: "RKLKL", group: 5, label: "inverted para (5) (K@2,4)" },
  { pattern: "RKLKR", group: 5, label: "double stroke + alt (K@2,4)" },
  { pattern: "RKLLK", group: 5, label: "double stroke + alt (K@2,5)" },
  { pattern: "RKLRK", group: 5, label: "inverted para (5) (K@2,5)" },
  { pattern: "RKRKL", group: 5, label: "paradiddle-diddle var (K@2,4)" },
  { pattern: "RKRKR", group: 5, label: "single stroke (5) (K@2,4)" },
  { pattern: "RKRLK", group: 5, label: "single stroke (5) (K@2,5)" },
  { pattern: "RKRRK", group: 5, label: "paradiddle-diddle var (K@2,5)" },
  { pattern: "RLKKL", group: 5, label: "paradiddle-diddle var (K@3,4)" },
  { pattern: "RLKKR", group: 5, label: "single stroke (5) (K@3,4)" },
  { pattern: "RLKLK", group: 5, label: "single stroke (5) (K@3,5)" },
  { pattern: "RLKRK", group: 5, label: "paradiddle-diddle var (K@3,5)" },
  { pattern: "RLLKK", group: 5, label: "reverse para + double (K@4,5)" },
  { pattern: "RLRKK", group: 5, label: "single stroke (5) (K@4,5)" },
  { pattern: "RRKKL", group: 5, label: "inverted para (5) (K@3,4)" },
  { pattern: "RRKLK", group: 5, label: "double stroke + alt (K@3,5)" },
  { pattern: "RRKRK", group: 5, label: "inverted para (5) (K@3,5)" },
  { pattern: "RRLKK", group: 5, label: "inverted para (5) (K@4,5)" },

  // ======================================================================
  // Group of 6 — Sextuplets / double triplets (175 patterns)
  // ======================================================================
  // ── Hands only ──
  { pattern: "RLLRLL", group: 6, label: "2 doubles" },
  { pattern: "RLLRLR", group: 6, label: "1 double" },
  { pattern: "RLLRRL", group: 6, label: "reverse + double" },
  { pattern: "RLRLLR", group: 6, label: "1 double" },
  { pattern: "RLRLRL", group: 6, label: "single stroke (6)" },
  { pattern: "RLRRLL", group: 6, label: "paradiddle-diddle" },
  { pattern: "RLRRLR", group: 6, label: "paradiddle + inverted" },
  { pattern: "RRLLRL", group: 6, label: "double + paradiddle" },
  { pattern: "RRLRLL", group: 6, label: "double paradiddle" },
  { pattern: "RRLRRL", group: 6, label: "2 doubles" },
  // ── With 1 kick ──
  { pattern: "KLLRLL", group: 6, label: "1K, 2 doubles" },
  { pattern: "KLLRLR", group: 6, label: "1K, 1 double" },
  { pattern: "KLLRRL", group: 6, label: "reverse + double (K@1)" },
  { pattern: "KLRLLR", group: 6, label: "1K, 1 double" },
  { pattern: "KLRLRL", group: 6, label: "single stroke (6) (K@1)" },
  { pattern: "KLRLRR", group: 6, label: "1K, 1 double" },
  { pattern: "KLRRLL", group: 6, label: "paradiddle-diddle (K@1)" },
  { pattern: "KLRRLR", group: 6, label: "paradiddle + inverted (K@1)" },
  { pattern: "KRLLRL", group: 6, label: "double + paradiddle (K@1)" },
  { pattern: "KRLLRR", group: 6, label: "double stroke roll (6) (K@1)" },
  { pattern: "KRLRLL", group: 6, label: "double paradiddle (K@1)" },
  { pattern: "KRLRLR", group: 6, label: "1K, alternating" },
  { pattern: "KRLRRL", group: 6, label: "1K, 1 double" },
  { pattern: "KRRLLR", group: 6, label: "1K, 2 doubles" },
  { pattern: "KRRLRL", group: 6, label: "1K, 1 double" },
  { pattern: "KRRLRR", group: 6, label: "1K, 2 doubles" },
  { pattern: "RKLLRL", group: 6, label: "double + paradiddle (K@2)" },
  { pattern: "RKLRLL", group: 6, label: "double paradiddle (K@2)" },
  { pattern: "RKLRLR", group: 6, label: "1K, alternating" },
  { pattern: "RKLRRL", group: 6, label: "reverse + double (K@2)" },
  { pattern: "RKRLLR", group: 6, label: "1K, 1 double" },
  { pattern: "RKRLRL", group: 6, label: "single stroke (6) (K@2)" },
  { pattern: "RKRRLL", group: 6, label: "paradiddle-diddle (K@2)" },
  { pattern: "RKRRLR", group: 6, label: "paradiddle + inverted (K@2)" },
  { pattern: "RLKLLR", group: 6, label: "1K, 1 double" },
  { pattern: "RLKLRL", group: 6, label: "single stroke (6) (K@3)" },
  { pattern: "RLKRLL", group: 6, label: "paradiddle-diddle (K@3)" },
  { pattern: "RLKRLR", group: 6, label: "paradiddle + inverted (K@3)" },
  { pattern: "RLKRRL", group: 6, label: "reverse + double (K@3)" },
  { pattern: "RLLKLL", group: 6, label: "1K, 2 doubles" },
  { pattern: "RLLKLR", group: 6, label: "1K, 1 double" },
  { pattern: "RLLKRL", group: 6, label: "reverse + double (K@4)" },
  { pattern: "RLLRLK", group: 6, label: "1K, 1 double" },
  { pattern: "RLLRRK", group: 6, label: "reverse + double (K@6)" },
  { pattern: "RLRKLL", group: 6, label: "paradiddle-diddle (K@4)" },
  { pattern: "RLRKLR", group: 6, label: "paradiddle + inverted (K@4)" },
  { pattern: "RLRKRL", group: 6, label: "single stroke (6) (K@4)" },
  { pattern: "RLRLLK", group: 6, label: "1K, 1 double" },
  { pattern: "RLRLRK", group: 6, label: "single stroke (6) (K@6)" },
  { pattern: "RLRRLK", group: 6, label: "paradiddle-diddle (K@6)" },
  { pattern: "RRKLRL", group: 6, label: "double + paradiddle (K@3)" },
  { pattern: "RRKRLL", group: 6, label: "double paradiddle (K@3)" },
  { pattern: "RRKRRL", group: 6, label: "1K, 2 doubles" },
  { pattern: "RRLKLL", group: 6, label: "double paradiddle (K@4)" },
  { pattern: "RRLKRL", group: 6, label: "double + paradiddle (K@4)" },
  { pattern: "RRLLRK", group: 6, label: "double + paradiddle (K@6)" },
  { pattern: "RRLRLK", group: 6, label: "double paradiddle (K@6)" },
  { pattern: "RRLRRK", group: 6, label: "1K, 2 doubles" },
  // ── With 2 kicks ──
  { pattern: "KKLLRL", group: 6, label: "double + paradiddle (K@1,2)" },
  { pattern: "KKLLRR", group: 6, label: "double stroke roll (6) (K@1,2)" },
  { pattern: "KKLRLL", group: 6, label: "double paradiddle (K@1,2)" },
  { pattern: "KKLRLR", group: 6, label: "2K, alternating" },
  { pattern: "KKLRRL", group: 6, label: "reverse + double (K@1,2)" },
  { pattern: "KKRLLR", group: 6, label: "2K, 1 double" },
  { pattern: "KKRLRL", group: 6, label: "single stroke (6) (K@1,2)" },
  { pattern: "KKRLRR", group: 6, label: "2K, 1 double" },
  { pattern: "KKRRLL", group: 6, label: "paradiddle-diddle (K@1,2)" },
  { pattern: "KKRRLR", group: 6, label: "paradiddle + inverted (K@1,2)" },
  { pattern: "KLKLLR", group: 6, label: "2K, 1 double" },
  { pattern: "KLKLRL", group: 6, label: "single stroke (6) (K@1,3)" },
  { pattern: "KLKLRR", group: 6, label: "2K, 1 double" },
  { pattern: "KLKRLL", group: 6, label: "paradiddle-diddle (K@1,3)" },
  { pattern: "KLKRLR", group: 6, label: "paradiddle + inverted (K@1,3)" },
  { pattern: "KLKRRL", group: 6, label: "reverse + double (K@1,3)" },
  { pattern: "KLLKLL", group: 6, label: "2K, 2 doubles" },
  { pattern: "KLLKLR", group: 6, label: "2K, 1 double" },
  { pattern: "KLLKRL", group: 6, label: "reverse + double (K@1,4)" },
  { pattern: "KLLRKL", group: 6, label: "reverse + double (K@1,5)" },
  { pattern: "KLLRKR", group: 6, label: "2K, 1 double" },
  { pattern: "KLLRLK", group: 6, label: "2K, 1 double" },
  { pattern: "KLLRRK", group: 6, label: "reverse + double (K@1,6)" },
  { pattern: "KLRKLL", group: 6, label: "paradiddle-diddle (K@1,4)" },
  { pattern: "KLRKLR", group: 6, label: "paradiddle + inverted (K@1,4)" },
  { pattern: "KLRKRL", group: 6, label: "single stroke (6) (K@1,4)" },
  { pattern: "KLRKRR", group: 6, label: "2K, 1 double" },
  { pattern: "KLRLKL", group: 6, label: "single stroke (6) (K@1,5)" },
  { pattern: "KLRLKR", group: 6, label: "2K, alternating" },
  { pattern: "KLRLLK", group: 6, label: "2K, 1 double" },
  { pattern: "KLRLRK", group: 6, label: "single stroke (6) (K@1,6)" },
  { pattern: "KLRRKL", group: 6, label: "paradiddle-diddle (K@1,5)" },
  { pattern: "KLRRKR", group: 6, label: "paradiddle + inverted (K@1,5)" },
  { pattern: "KLRRLK", group: 6, label: "paradiddle-diddle (K@1,6)" },
  { pattern: "KRKLLR", group: 6, label: "2K, 1 double" },
  { pattern: "KRKLRL", group: 6, label: "double + paradiddle (K@1,3)" },
  { pattern: "KRKLRR", group: 6, label: "double stroke roll (6) (K@1,3)" },
  { pattern: "KRKRLL", group: 6, label: "double paradiddle (K@1,3)" },
  { pattern: "KRKRLR", group: 6, label: "2K, alternating" },
  { pattern: "KRKRRL", group: 6, label: "2K, 1 double" },
  { pattern: "KRLKLL", group: 6, label: "double paradiddle (K@1,4)" },
  { pattern: "KRLKLR", group: 6, label: "2K, alternating" },
  { pattern: "KRLKRL", group: 6, label: "double + paradiddle (K@1,4)" },
  { pattern: "KRLKRR", group: 6, label: "double stroke roll (6) (K@1,4)" },
  { pattern: "KRLLKL", group: 6, label: "double + paradiddle (K@1,5)" },
  { pattern: "KRLLKR", group: 6, label: "double stroke roll (6) (K@1,5)" },
  { pattern: "KRLLRK", group: 6, label: "double + paradiddle (K@1,6)" },
  { pattern: "KRLRKL", group: 6, label: "double paradiddle (K@1,5)" },
  { pattern: "KRLRKR", group: 6, label: "2K, alternating" },
  { pattern: "KRLRLK", group: 6, label: "double paradiddle (K@1,6)" },
  { pattern: "KRLRRK", group: 6, label: "2K, 1 double" },
  { pattern: "KRRKLR", group: 6, label: "2K, 1 double" },
  { pattern: "KRRKRL", group: 6, label: "2K, 1 double" },
  { pattern: "KRRKRR", group: 6, label: "2K, 2 doubles" },
  { pattern: "KRRLKL", group: 6, label: "2K, 1 double" },
  { pattern: "KRRLKR", group: 6, label: "2K, 1 double" },
  { pattern: "KRRLLK", group: 6, label: "2K, 2 doubles" },
  { pattern: "KRRLRK", group: 6, label: "2K, 1 double" },
  { pattern: "RKKLLR", group: 6, label: "2K, 1 double" },
  { pattern: "RKKLRL", group: 6, label: "single stroke (6) (K@2,3)" },
  { pattern: "RKKRLL", group: 6, label: "paradiddle-diddle (K@2,3)" },
  { pattern: "RKKRLR", group: 6, label: "paradiddle + inverted (K@2,3)" },
  { pattern: "RKKRRL", group: 6, label: "reverse + double (K@2,3)" },
  { pattern: "RKLKLL", group: 6, label: "double paradiddle (K@2,4)" },
  { pattern: "RKLKLR", group: 6, label: "2K, alternating" },
  { pattern: "RKLKRL", group: 6, label: "double + paradiddle (K@2,4)" },
  { pattern: "RKLLKL", group: 6, label: "double + paradiddle (K@2,5)" },
  { pattern: "RKLLKR", group: 6, label: "double stroke roll (6) (K@2,5)" },
  { pattern: "RKLLRK", group: 6, label: "double + paradiddle (K@2,6)" },
  { pattern: "RKLRKL", group: 6, label: "double paradiddle (K@2,5)" },
  { pattern: "RKLRKR", group: 6, label: "2K, alternating" },
  { pattern: "RKLRLK", group: 6, label: "double paradiddle (K@2,6)" },
  { pattern: "RKLRRK", group: 6, label: "reverse + double (K@2,6)" },
  { pattern: "RKRKLL", group: 6, label: "paradiddle-diddle (K@2,4)" },
  { pattern: "RKRKLR", group: 6, label: "paradiddle + inverted (K@2,4)" },
  { pattern: "RKRKRL", group: 6, label: "single stroke (6) (K@2,4)" },
  { pattern: "RKRLKL", group: 6, label: "single stroke (6) (K@2,5)" },
  { pattern: "RKRLKR", group: 6, label: "2K, alternating" },
  { pattern: "RKRLLK", group: 6, label: "2K, 1 double" },
  { pattern: "RKRLRK", group: 6, label: "single stroke (6) (K@2,6)" },
  { pattern: "RKRRKL", group: 6, label: "paradiddle-diddle (K@2,5)" },
  { pattern: "RKRRKR", group: 6, label: "paradiddle + inverted (K@2,5)" },
  { pattern: "RKRRLK", group: 6, label: "paradiddle-diddle (K@2,6)" },
  { pattern: "RLKKLL", group: 6, label: "paradiddle-diddle (K@3,4)" },
  { pattern: "RLKKLR", group: 6, label: "paradiddle + inverted (K@3,4)" },
  { pattern: "RLKKRL", group: 6, label: "single stroke (6) (K@3,4)" },
  { pattern: "RLKLKL", group: 6, label: "single stroke (6) (K@3,5)" },
  { pattern: "RLKLKR", group: 6, label: "2K, alternating" },
  { pattern: "RLKLLK", group: 6, label: "2K, 1 double" },
  { pattern: "RLKLRK", group: 6, label: "single stroke (6) (K@3,6)" },
  { pattern: "RLKRKL", group: 6, label: "paradiddle-diddle (K@3,5)" },
  { pattern: "RLKRKR", group: 6, label: "paradiddle + inverted (K@3,5)" },
  { pattern: "RLKRLK", group: 6, label: "paradiddle-diddle (K@3,6)" },
  { pattern: "RLKRRK", group: 6, label: "reverse + double (K@3,6)" },
  { pattern: "RLLKKL", group: 6, label: "reverse + double (K@4,5)" },
  { pattern: "RLLKKR", group: 6, label: "2K, 1 double" },
  { pattern: "RLLKLK", group: 6, label: "2K, 1 double" },
  { pattern: "RLLKRK", group: 6, label: "reverse + double (K@4,6)" },
  { pattern: "RLLRKK", group: 6, label: "reverse + double (K@5,6)" },
  { pattern: "RLRKKL", group: 6, label: "single stroke (6) (K@4,5)" },
  { pattern: "RLRKKR", group: 6, label: "paradiddle + inverted (K@4,5)" },
  { pattern: "RLRKLK", group: 6, label: "paradiddle-diddle (K@4,6)" },
  { pattern: "RLRKRK", group: 6, label: "single stroke (6) (K@4,6)" },
  { pattern: "RLRLKK", group: 6, label: "single stroke (6) (K@5,6)" },
  { pattern: "RLRRKK", group: 6, label: "paradiddle-diddle (K@5,6)" },
  { pattern: "RRKKLL", group: 6, label: "double paradiddle (K@3,4)" },
  { pattern: "RRKKRL", group: 6, label: "double + paradiddle (K@3,4)" },
  { pattern: "RRKLKL", group: 6, label: "double + paradiddle (K@3,5)" },
  { pattern: "RRKLRK", group: 6, label: "double + paradiddle (K@3,6)" },
  { pattern: "RRKRKL", group: 6, label: "double paradiddle (K@3,5)" },
  { pattern: "RRKRLK", group: 6, label: "double paradiddle (K@3,6)" },
  { pattern: "RRKRRK", group: 6, label: "2K, 2 doubles" },
  { pattern: "RRLKKL", group: 6, label: "double + paradiddle (K@4,5)" },
  { pattern: "RRLKLK", group: 6, label: "double paradiddle (K@4,6)" },
  { pattern: "RRLKRK", group: 6, label: "double + paradiddle (K@4,6)" },
  { pattern: "RRLLKK", group: 6, label: "double + paradiddle (K@5,6)" },
  { pattern: "RRLRKK", group: 6, label: "double paradiddle (K@5,6)" },

  // ======================================================================
  // Group of 7 — Septuplets / odd groupings (355 patterns)
  // ======================================================================
  // ── Hands only ──
  { pattern: "RLLRLLR", group: 7, label: "reverse para (7)" },
  { pattern: "RLLRLRL", group: 7, label: "1 double" },
  { pattern: "RLLRRLR", group: 7, label: "reverse + inverted" },
  { pattern: "RLRLLRL", group: 7, label: "1 double" },
  { pattern: "RLRLRLL", group: 7, label: "1 double" },
  { pattern: "RLRLRLR", group: 7, label: "single stroke (7)" },
  { pattern: "RLRLRRL", group: 7, label: "single + para" },
  { pattern: "RLRRLLR", group: 7, label: "para-diddle + reverse" },
  { pattern: "RLRRLRL", group: 7, label: "para + single" },
  { pattern: "RRLRLRL", group: 7, label: "double lead (7)" },
  // ── With 1 kick ──
  { pattern: "KLLRLLR", group: 7, label: "reverse para (7) (K@1)" },
  { pattern: "KLLRLRL", group: 7, label: "1K, 1 double" },
  { pattern: "KLLRLRR", group: 7, label: "1K, 2 doubles" },
  { pattern: "KLLRRLR", group: 7, label: "reverse + inverted (K@1)" },
  { pattern: "KLRLLRL", group: 7, label: "1K, 1 double" },
  { pattern: "KLRLLRR", group: 7, label: "para + reverse + double (K@1)" },
  { pattern: "KLRLRLL", group: 7, label: "1K, 1 double" },
  { pattern: "KLRLRLR", group: 7, label: "single stroke (7) (K@1)" },
  { pattern: "KLRLRRL", group: 7, label: "single + para (K@1)" },
  { pattern: "KLRRLLR", group: 7, label: "para-diddle + reverse (K@1)" },
  { pattern: "KLRRLRL", group: 7, label: "para + single (K@1)" },
  { pattern: "KLRRLRR", group: 7, label: "1K, 2 doubles" },
  { pattern: "KRLLRLL", group: 7, label: "1K, 2 doubles" },
  { pattern: "KRLLRLR", group: 7, label: "double + single (K@1)" },
  { pattern: "KRLLRRL", group: 7, label: "double roll combo (K@1)" },
  { pattern: "KRLRLLR", group: 7, label: "triple paradiddle base (K@1)" },
  { pattern: "KRLRLRL", group: 7, label: "double lead (7) (K@1)" },
  { pattern: "KRLRLRR", group: 7, label: "inverted double para (K@1)" },
  { pattern: "KRLRRLL", group: 7, label: "double lead para-diddle (K@1)" },
  { pattern: "KRLRRLR", group: 7, label: "1K, 1 double" },
  { pattern: "KRRLLRL", group: 7, label: "1K, 2 doubles" },
  { pattern: "KRRLRLL", group: 7, label: "1K, 2 doubles" },
  { pattern: "KRRLRLR", group: 7, label: "1K, 1 double" },
  { pattern: "KRRLRRL", group: 7, label: "1K, 2 doubles" },
  { pattern: "RKLLRLL", group: 7, label: "1K, 2 doubles" },
  { pattern: "RKLLRLR", group: 7, label: "double + single (K@2)" },
  { pattern: "RKLLRRL", group: 7, label: "double roll combo (K@2)" },
  { pattern: "RKLRLLR", group: 7, label: "triple paradiddle base (K@2)" },
  { pattern: "RKLRLRL", group: 7, label: "double lead (7) (K@2)" },
  { pattern: "RKLRRLL", group: 7, label: "double lead para-diddle (K@2)" },
  { pattern: "RKLRRLR", group: 7, label: "reverse + inverted (K@2)" },
  { pattern: "RKRLLRL", group: 7, label: "1K, 1 double" },
  { pattern: "RKRLRLL", group: 7, label: "1K, 1 double" },
  { pattern: "RKRLRLR", group: 7, label: "single stroke (7) (K@2)" },
  { pattern: "RKRLRRL", group: 7, label: "single + para (K@2)" },
  { pattern: "RKRRLLR", group: 7, label: "para-diddle + reverse (K@2)" },
  { pattern: "RKRRLRL", group: 7, label: "para + single (K@2)" },
  { pattern: "RLKLLRL", group: 7, label: "1K, 1 double" },
  { pattern: "RLKLRLL", group: 7, label: "1K, 1 double" },
  { pattern: "RLKLRLR", group: 7, label: "single stroke (7) (K@3)" },
  { pattern: "RLKLRRL", group: 7, label: "single + para (K@3)" },
  { pattern: "RLKRLLR", group: 7, label: "para-diddle + reverse (K@3)" },
  { pattern: "RLKRLRL", group: 7, label: "para + single (K@3)" },
  { pattern: "RLKRRLL", group: 7, label: "reverse para-diddle-diddle (K@3)" },
  { pattern: "RLKRRLR", group: 7, label: "reverse + inverted (K@3)" },
  { pattern: "RLLKLLR", group: 7, label: "reverse para (7) (K@4)" },
  { pattern: "RLLKLRL", group: 7, label: "1K, 1 double" },
  { pattern: "RLLKRLL", group: 7, label: "reverse para-diddle-diddle (K@4)" },
  { pattern: "RLLKRLR", group: 7, label: "reverse + inverted (K@4)" },
  { pattern: "RLLRKLL", group: 7, label: "reverse para-diddle-diddle (K@5)" },
  { pattern: "RLLRKLR", group: 7, label: "reverse + inverted (K@5)" },
  { pattern: "RLLRKRL", group: 7, label: "1K, 1 double" },
  { pattern: "RLLRLLK", group: 7, label: "reverse para (7) (K@7)" },
  { pattern: "RLLRLRK", group: 7, label: "1K, 1 double" },
  { pattern: "RLLRRLK", group: 7, label: "reverse + inverted (K@7)" },
  { pattern: "RLRKLLR", group: 7, label: "para-diddle + reverse (K@4)" },
  { pattern: "RLRKLRL", group: 7, label: "para + single (K@4)" },
  { pattern: "RLRKRLL", group: 7, label: "1K, 1 double" },
  { pattern: "RLRKRLR", group: 7, label: "single stroke (7) (K@4)" },
  { pattern: "RLRKRRL", group: 7, label: "single + para (K@4)" },
  { pattern: "RLRLKLL", group: 7, label: "1K, 1 double" },
  { pattern: "RLRLKLR", group: 7, label: "single stroke (7) (K@5)" },
  { pattern: "RLRLKRL", group: 7, label: "single + para (K@5)" },
  { pattern: "RLRLLRK", group: 7, label: "para + reverse + double (K@7)" },
  { pattern: "RLRLRLK", group: 7, label: "single stroke (7) (K@7)" },
  { pattern: "RLRLRRK", group: 7, label: "single + para (K@7)" },
  { pattern: "RLRRKLR", group: 7, label: "para-diddle + reverse (K@5)" },
  { pattern: "RLRRKRL", group: 7, label: "para + single (K@5)" },
  { pattern: "RLRRLLK", group: 7, label: "para-diddle + reverse (K@7)" },
  { pattern: "RLRRLRK", group: 7, label: "para + single (K@7)" },
  { pattern: "RRKLRLL", group: 7, label: "1K, 2 doubles" },
  { pattern: "RRKLRRL", group: 7, label: "double roll combo (K@3)" },
  { pattern: "RRKRLRL", group: 7, label: "double lead (7) (K@3)" },
  { pattern: "RRLKLRL", group: 7, label: "double lead (7) (K@4)" },
  { pattern: "RRLKRLL", group: 7, label: "double lead para-diddle (K@4)" },
  { pattern: "RRLKRRL", group: 7, label: "double roll combo (K@4)" },
  { pattern: "RRLLKRL", group: 7, label: "double roll combo (K@5)" },
  { pattern: "RRLLRLK", group: 7, label: "double + single (K@7)" },
  { pattern: "RRLRKLL", group: 7, label: "double lead para-diddle (K@5)" },
  { pattern: "RRLRKRL", group: 7, label: "double lead (7) (K@5)" },
  { pattern: "RRLRLLK", group: 7, label: "triple paradiddle base (K@7)" },
  { pattern: "RRLRLRK", group: 7, label: "double lead (7) (K@7)" },
  { pattern: "RRLRRLK", group: 7, label: "double lead para-diddle (K@7)" },
  // ── With 2 kicks ──
  { pattern: "KKLLRLL", group: 7, label: "2K, 2 doubles" },
  { pattern: "KKLLRLR", group: 7, label: "double + single (K@1,2)" },
  { pattern: "KKLLRRL", group: 7, label: "double roll combo (K@1,2)" },
  { pattern: "KKLRLLR", group: 7, label: "triple paradiddle base (K@1,2)" },
  { pattern: "KKLRLRL", group: 7, label: "double lead (7) (K@1,2)" },
  { pattern: "KKLRLRR", group: 7, label: "inverted double para (K@1,2)" },
  { pattern: "KKLRRLL", group: 7, label: "double lead para-diddle (K@1,2)" },
  { pattern: "KKLRRLR", group: 7, label: "reverse + inverted (K@1,2)" },
  { pattern: "KKRLLRL", group: 7, label: "2K, 1 double" },
  { pattern: "KKRLLRR", group: 7, label: "para + reverse + double (K@1,2)" },
  { pattern: "KKRLRLL", group: 7, label: "2K, 1 double" },
  { pattern: "KKRLRLR", group: 7, label: "single stroke (7) (K@1,2)" },
  { pattern: "KKRLRRL", group: 7, label: "single + para (K@1,2)" },
  { pattern: "KKRRLLR", group: 7, label: "para-diddle + reverse (K@1,2)" },
  { pattern: "KKRRLRL", group: 7, label: "para + single (K@1,2)" },
  { pattern: "KKRRLRR", group: 7, label: "2K, 2 doubles" },
  { pattern: "KLKLLRL", group: 7, label: "2K, 1 double" },
  { pattern: "KLKLLRR", group: 7, label: "para + reverse + double (K@1,3)" },
  { pattern: "KLKLRLL", group: 7, label: "2K, 1 double" },
  { pattern: "KLKLRLR", group: 7, label: "single stroke (7) (K@1,3)" },
  { pattern: "KLKLRRL", group: 7, label: "single + para (K@1,3)" },
  { pattern: "KLKRLLR", group: 7, label: "para-diddle + reverse (K@1,3)" },
  { pattern: "KLKRLRL", group: 7, label: "para + single (K@1,3)" },
  { pattern: "KLKRLRR", group: 7, label: "2K, 1 double" },
  { pattern: "KLKRRLL", group: 7, label: "reverse para-diddle-diddle (K@1,3)" },
  { pattern: "KLKRRLR", group: 7, label: "reverse + inverted (K@1,3)" },
  { pattern: "KLLKLLR", group: 7, label: "reverse para (7) (K@1,4)" },
  { pattern: "KLLKLRL", group: 7, label: "2K, 1 double" },
  { pattern: "KLLKLRR", group: 7, label: "2K, 2 doubles" },
  { pattern: "KLLKRLL", group: 7, label: "reverse para-diddle-diddle (K@1,4)" },
  { pattern: "KLLKRLR", group: 7, label: "reverse + inverted (K@1,4)" },
  { pattern: "KLLRKLL", group: 7, label: "reverse para-diddle-diddle (K@1,5)" },
  { pattern: "KLLRKLR", group: 7, label: "reverse + inverted (K@1,5)" },
  { pattern: "KLLRKRL", group: 7, label: "2K, 1 double" },
  { pattern: "KLLRKRR", group: 7, label: "2K, 2 doubles" },
  { pattern: "KLLRLKL", group: 7, label: "2K, 1 double" },
  { pattern: "KLLRLKR", group: 7, label: "reverse para (7) (K@1,6)" },
  { pattern: "KLLRLLK", group: 7, label: "reverse para (7) (K@1,7)" },
  { pattern: "KLLRLRK", group: 7, label: "2K, 1 double" },
  { pattern: "KLLRRKL", group: 7, label: "reverse para-diddle-diddle (K@1,6)" },
  { pattern: "KLLRRKR", group: 7, label: "reverse + inverted (K@1,6)" },
  { pattern: "KLLRRLK", group: 7, label: "reverse + inverted (K@1,7)" },
  { pattern: "KLRKLLR", group: 7, label: "para-diddle + reverse (K@1,4)" },
  { pattern: "KLRKLRL", group: 7, label: "para + single (K@1,4)" },
  { pattern: "KLRKLRR", group: 7, label: "para + reverse + double (K@1,4)" },
  { pattern: "KLRKRLL", group: 7, label: "2K, 1 double" },
  { pattern: "KLRKRLR", group: 7, label: "single stroke (7) (K@1,4)" },
  { pattern: "KLRKRRL", group: 7, label: "single + para (K@1,4)" },
  { pattern: "KLRLKLL", group: 7, label: "2K, 1 double" },
  { pattern: "KLRLKLR", group: 7, label: "single stroke (7) (K@1,5)" },
  { pattern: "KLRLKRL", group: 7, label: "single + para (K@1,5)" },
  { pattern: "KLRLKRR", group: 7, label: "para + reverse + double (K@1,5)" },
  { pattern: "KLRLLKL", group: 7, label: "2K, 1 double" },
  { pattern: "KLRLLKR", group: 7, label: "para + reverse + double (K@1,6)" },
  { pattern: "KLRLLRK", group: 7, label: "para + reverse + double (K@1,7)" },
  { pattern: "KLRLRKL", group: 7, label: "single + para (K@1,6)" },
  { pattern: "KLRLRKR", group: 7, label: "single stroke (7) (K@1,6)" },
  { pattern: "KLRLRLK", group: 7, label: "single stroke (7) (K@1,7)" },
  { pattern: "KLRLRRK", group: 7, label: "single + para (K@1,7)" },
  { pattern: "KLRRKLR", group: 7, label: "para-diddle + reverse (K@1,5)" },
  { pattern: "KLRRKRL", group: 7, label: "para + single (K@1,5)" },
  { pattern: "KLRRKRR", group: 7, label: "2K, 2 doubles" },
  { pattern: "KLRRLKL", group: 7, label: "para + single (K@1,6)" },
  { pattern: "KLRRLKR", group: 7, label: "para-diddle + reverse (K@1,6)" },
  { pattern: "KLRRLLK", group: 7, label: "para-diddle + reverse (K@1,7)" },
  { pattern: "KLRRLRK", group: 7, label: "para + single (K@1,7)" },
  { pattern: "KRKLLRL", group: 7, label: "2K, 1 double" },
  { pattern: "KRKLLRR", group: 7, label: "2K, 2 doubles" },
  { pattern: "KRKLRLL", group: 7, label: "2K, 1 double" },
  { pattern: "KRKLRLR", group: 7, label: "double + single (K@1,3)" },
  { pattern: "KRKLRRL", group: 7, label: "double roll combo (K@1,3)" },
  { pattern: "KRKRLLR", group: 7, label: "triple paradiddle base (K@1,3)" },
  { pattern: "KRKRLRL", group: 7, label: "double lead (7) (K@1,3)" },
  { pattern: "KRKRLRR", group: 7, label: "inverted double para (K@1,3)" },
  { pattern: "KRKRRLL", group: 7, label: "double lead para-diddle (K@1,3)" },
  { pattern: "KRKRRLR", group: 7, label: "2K, 1 double" },
  { pattern: "KRLKLLR", group: 7, label: "triple paradiddle base (K@1,4)" },
  { pattern: "KRLKLRL", group: 7, label: "double lead (7) (K@1,4)" },
  { pattern: "KRLKLRR", group: 7, label: "inverted double para (K@1,4)" },
  { pattern: "KRLKRLL", group: 7, label: "double lead para-diddle (K@1,4)" },
  { pattern: "KRLKRLR", group: 7, label: "double + single (K@1,4)" },
  { pattern: "KRLKRRL", group: 7, label: "double roll combo (K@1,4)" },
  { pattern: "KRLLKLL", group: 7, label: "2K, 2 doubles" },
  { pattern: "KRLLKLR", group: 7, label: "double + single (K@1,5)" },
  { pattern: "KRLLKRL", group: 7, label: "double roll combo (K@1,5)" },
  { pattern: "KRLLRKL", group: 7, label: "double roll combo (K@1,6)" },
  { pattern: "KRLLRKR", group: 7, label: "double + single (K@1,6)" },
  { pattern: "KRLLRLK", group: 7, label: "double + single (K@1,7)" },
  { pattern: "KRLLRRK", group: 7, label: "double roll combo (K@1,7)" },
  { pattern: "KRLRKLL", group: 7, label: "double lead para-diddle (K@1,5)" },
  { pattern: "KRLRKLR", group: 7, label: "triple paradiddle base (K@1,5)" },
  { pattern: "KRLRKRL", group: 7, label: "double lead (7) (K@1,5)" },
  { pattern: "KRLRKRR", group: 7, label: "inverted double para (K@1,5)" },
  { pattern: "KRLRLKL", group: 7, label: "double lead (7) (K@1,6)" },
  { pattern: "KRLRLKR", group: 7, label: "triple paradiddle base (K@1,6)" },
  { pattern: "KRLRLLK", group: 7, label: "triple paradiddle base (K@1,7)" },
  { pattern: "KRLRLRK", group: 7, label: "double lead (7) (K@1,7)" },
  { pattern: "KRLRRKL", group: 7, label: "double lead para-diddle (K@1,6)" },
  { pattern: "KRLRRKR", group: 7, label: "2K, 1 double" },
  { pattern: "KRLRRLK", group: 7, label: "double lead para-diddle (K@1,7)" },
  { pattern: "KRRKLRL", group: 7, label: "2K, 1 double" },
  { pattern: "KRRKLRR", group: 7, label: "2K, 2 doubles" },
  { pattern: "KRRKRLL", group: 7, label: "2K, 2 doubles" },
  { pattern: "KRRKRLR", group: 7, label: "2K, 1 double" },
  { pattern: "KRRKRRL", group: 7, label: "2K, 2 doubles" },
  { pattern: "KRRLKLL", group: 7, label: "2K, 2 doubles" },
  { pattern: "KRRLKLR", group: 7, label: "2K, 1 double" },
  { pattern: "KRRLKRL", group: 7, label: "2K, 1 double" },
  { pattern: "KRRLKRR", group: 7, label: "2K, 2 doubles" },
  { pattern: "KRRLLKL", group: 7, label: "2K, 2 doubles" },
  { pattern: "KRRLLKR", group: 7, label: "2K, 2 doubles" },
  { pattern: "KRRLLRK", group: 7, label: "2K, 2 doubles" },
  { pattern: "KRRLRKL", group: 7, label: "2K, 1 double" },
  { pattern: "KRRLRKR", group: 7, label: "2K, 1 double" },
  { pattern: "KRRLRLK", group: 7, label: "2K, 1 double" },
  { pattern: "KRRLRRK", group: 7, label: "2K, 2 doubles" },
  { pattern: "RKKLLRL", group: 7, label: "2K, 1 double" },
  { pattern: "RKKLRLL", group: 7, label: "2K, 1 double" },
  { pattern: "RKKLRLR", group: 7, label: "single stroke (7) (K@2,3)" },
  { pattern: "RKKLRRL", group: 7, label: "single + para (K@2,3)" },
  { pattern: "RKKRLLR", group: 7, label: "triple paradiddle base (K@2,3)" },
  { pattern: "RKKRLRL", group: 7, label: "double lead (7) (K@2,3)" },
  { pattern: "RKKRRLL", group: 7, label: "double lead para-diddle (K@2,3)" },
  { pattern: "RKKRRLR", group: 7, label: "reverse + inverted (K@2,3)" },
  { pattern: "RKLKLLR", group: 7, label: "triple paradiddle base (K@2,4)" },
  { pattern: "RKLKLRL", group: 7, label: "double lead (7) (K@2,4)" },
  { pattern: "RKLKRLL", group: 7, label: "double lead para-diddle (K@2,4)" },
  { pattern: "RKLKRLR", group: 7, label: "reverse + inverted (K@2,4)" },
  { pattern: "RKLKRRL", group: 7, label: "double roll combo (K@2,4)" },
  { pattern: "RKLLKLL", group: 7, label: "2K, 2 doubles" },
  { pattern: "RKLLKLR", group: 7, label: "double + single (K@2,5)" },
  { pattern: "RKLLKRL", group: 7, label: "double roll combo (K@2,5)" },
  { pattern: "RKLLRKL", group: 7, label: "double roll combo (K@2,6)" },
  { pattern: "RKLLRKR", group: 7, label: "double + single (K@2,6)" },
  { pattern: "RKLLRLK", group: 7, label: "double + single (K@2,7)" },
  { pattern: "RKLLRRK", group: 7, label: "double roll combo (K@2,7)" },
  { pattern: "RKLRKLL", group: 7, label: "double lead para-diddle (K@2,5)" },
  { pattern: "RKLRKLR", group: 7, label: "triple paradiddle base (K@2,5)" },
  { pattern: "RKLRKRL", group: 7, label: "double lead (7) (K@2,5)" },
  { pattern: "RKLRLKL", group: 7, label: "double lead (7) (K@2,6)" },
  { pattern: "RKLRLKR", group: 7, label: "triple paradiddle base (K@2,6)" },
  { pattern: "RKLRLLK", group: 7, label: "triple paradiddle base (K@2,7)" },
  { pattern: "RKLRLRK", group: 7, label: "double lead (7) (K@2,7)" },
  { pattern: "RKLRRKL", group: 7, label: "double lead para-diddle (K@2,6)" },
  { pattern: "RKLRRKR", group: 7, label: "reverse + inverted (K@2,6)" },
  { pattern: "RKLRRLK", group: 7, label: "reverse + inverted (K@2,7)" },
  { pattern: "RKRKLLR", group: 7, label: "para-diddle + reverse (K@2,4)" },
  { pattern: "RKRKLRL", group: 7, label: "para + single (K@2,4)" },
  { pattern: "RKRKRLL", group: 7, label: "2K, 1 double" },
  { pattern: "RKRKRLR", group: 7, label: "single stroke (7) (K@2,4)" },
  { pattern: "RKRKRRL", group: 7, label: "single + para (K@2,4)" },
  { pattern: "RKRLKLL", group: 7, label: "2K, 1 double" },
  { pattern: "RKRLKLR", group: 7, label: "single stroke (7) (K@2,5)" },
  { pattern: "RKRLKRL", group: 7, label: "single + para (K@2,5)" },
  { pattern: "RKRLLKL", group: 7, label: "2K, 1 double" },
  { pattern: "RKRLLKR", group: 7, label: "para + reverse + double (K@2,6)" },
  { pattern: "RKRLLRK", group: 7, label: "para + reverse + double (K@2,7)" },
  { pattern: "RKRLRKL", group: 7, label: "single + para (K@2,6)" },
  { pattern: "RKRLRKR", group: 7, label: "single stroke (7) (K@2,6)" },
  { pattern: "RKRLRLK", group: 7, label: "single stroke (7) (K@2,7)" },
  { pattern: "RKRLRRK", group: 7, label: "single + para (K@2,7)" },
  { pattern: "RKRRKLR", group: 7, label: "para-diddle + reverse (K@2,5)" },
  { pattern: "RKRRKRL", group: 7, label: "para + single (K@2,5)" },
  { pattern: "RKRRLKL", group: 7, label: "para + single (K@2,6)" },
  { pattern: "RKRRLKR", group: 7, label: "para-diddle + reverse (K@2,6)" },
  { pattern: "RKRRLLK", group: 7, label: "para-diddle + reverse (K@2,7)" },
  { pattern: "RKRRLRK", group: 7, label: "para + single (K@2,7)" },
  { pattern: "RLKKLLR", group: 7, label: "para-diddle + reverse (K@3,4)" },
  { pattern: "RLKKLRL", group: 7, label: "para + single (K@3,4)" },
  { pattern: "RLKKRLL", group: 7, label: "reverse para-diddle-diddle (K@3,4)" },
  { pattern: "RLKKRLR", group: 7, label: "single stroke (7) (K@3,4)" },
  { pattern: "RLKKRRL", group: 7, label: "single + para (K@3,4)" },
  { pattern: "RLKLKLL", group: 7, label: "2K, 1 double" },
  { pattern: "RLKLKLR", group: 7, label: "single stroke (7) (K@3,5)" },
  { pattern: "RLKLKRL", group: 7, label: "single + para (K@3,5)" },
  { pattern: "RLKLLKL", group: 7, label: "2K, 1 double" },
  { pattern: "RLKLLKR", group: 7, label: "para + reverse + double (K@3,6)" },
  { pattern: "RLKLLRK", group: 7, label: "para + reverse + double (K@3,7)" },
  { pattern: "RLKLRKL", group: 7, label: "single + para (K@3,6)" },
  { pattern: "RLKLRKR", group: 7, label: "single stroke (7) (K@3,6)" },
  { pattern: "RLKLRLK", group: 7, label: "single stroke (7) (K@3,7)" },
  { pattern: "RLKLRRK", group: 7, label: "single + para (K@3,7)" },
  { pattern: "RLKRKLL", group: 7, label: "reverse para-diddle-diddle (K@3,5)" },
  { pattern: "RLKRKLR", group: 7, label: "reverse + inverted (K@3,5)" },
  { pattern: "RLKRKRL", group: 7, label: "para + single (K@3,5)" },
  { pattern: "RLKRLKL", group: 7, label: "para + single (K@3,6)" },
  { pattern: "RLKRLKR", group: 7, label: "para-diddle + reverse (K@3,6)" },
  { pattern: "RLKRLLK", group: 7, label: "para-diddle + reverse (K@3,7)" },
  { pattern: "RLKRLRK", group: 7, label: "para + single (K@3,7)" },
  { pattern: "RLKRRKL", group: 7, label: "reverse para-diddle-diddle (K@3,6)" },
  { pattern: "RLKRRKR", group: 7, label: "reverse + inverted (K@3,6)" },
  { pattern: "RLKRRLK", group: 7, label: "reverse + inverted (K@3,7)" },
  { pattern: "RLLKKLL", group: 7, label: "reverse para-diddle-diddle (K@4,5)" },
  { pattern: "RLLKKLR", group: 7, label: "reverse + inverted (K@4,5)" },
  { pattern: "RLLKKRL", group: 7, label: "2K, 1 double" },
  { pattern: "RLLKLKL", group: 7, label: "2K, 1 double" },
  { pattern: "RLLKLKR", group: 7, label: "reverse para (7) (K@4,6)" },
  { pattern: "RLLKLLK", group: 7, label: "reverse para (7) (K@4,7)" },
  { pattern: "RLLKLRK", group: 7, label: "2K, 1 double" },
  { pattern: "RLLKRKL", group: 7, label: "reverse para-diddle-diddle (K@4,6)" },
  { pattern: "RLLKRKR", group: 7, label: "reverse + inverted (K@4,6)" },
  { pattern: "RLLKRLK", group: 7, label: "reverse + inverted (K@4,7)" },
  { pattern: "RLLRKKL", group: 7, label: "reverse para-diddle-diddle (K@5,6)" },
  { pattern: "RLLRKKR", group: 7, label: "reverse + inverted (K@5,6)" },
  { pattern: "RLLRKLK", group: 7, label: "reverse + inverted (K@5,7)" },
  { pattern: "RLLRKRK", group: 7, label: "2K, 1 double" },
  { pattern: "RLLRLKK", group: 7, label: "reverse para (7) (K@6,7)" },
  { pattern: "RLLRRKK", group: 7, label: "reverse + inverted (K@6,7)" },
  { pattern: "RLRKKLL", group: 7, label: "2K, 1 double" },
  { pattern: "RLRKKLR", group: 7, label: "single stroke (7) (K@4,5)" },
  { pattern: "RLRKKRL", group: 7, label: "para + single (K@4,5)" },
  { pattern: "RLRKLKL", group: 7, label: "para + single (K@4,6)" },
  { pattern: "RLRKLKR", group: 7, label: "para-diddle + reverse (K@4,6)" },
  { pattern: "RLRKLLK", group: 7, label: "para-diddle + reverse (K@4,7)" },
  { pattern: "RLRKLRK", group: 7, label: "para + single (K@4,7)" },
  { pattern: "RLRKRKL", group: 7, label: "single + para (K@4,6)" },
  { pattern: "RLRKRKR", group: 7, label: "single stroke (7) (K@4,6)" },
  { pattern: "RLRKRLK", group: 7, label: "single stroke (7) (K@4,7)" },
  { pattern: "RLRKRRK", group: 7, label: "single + para (K@4,7)" },
  { pattern: "RLRLKKL", group: 7, label: "single + para (K@5,6)" },
  { pattern: "RLRLKKR", group: 7, label: "single stroke (7) (K@5,6)" },
  { pattern: "RLRLKLK", group: 7, label: "single stroke (7) (K@5,7)" },
  { pattern: "RLRLKRK", group: 7, label: "single + para (K@5,7)" },
  { pattern: "RLRLLKK", group: 7, label: "para + reverse + double (K@6,7)" },
  { pattern: "RLRLRKK", group: 7, label: "single stroke (7) (K@6,7)" },
  { pattern: "RLRRKKL", group: 7, label: "para + single (K@5,6)" },
  { pattern: "RLRRKKR", group: 7, label: "para-diddle + reverse (K@5,6)" },
  { pattern: "RLRRKLK", group: 7, label: "para-diddle + reverse (K@5,7)" },
  { pattern: "RLRRKRK", group: 7, label: "para + single (K@5,7)" },
  { pattern: "RLRRLKK", group: 7, label: "para + single (K@6,7)" },
  { pattern: "RRKKLRL", group: 7, label: "double lead (7) (K@3,4)" },
  { pattern: "RRKKRLL", group: 7, label: "double lead para-diddle (K@3,4)" },
  { pattern: "RRKKRRL", group: 7, label: "double roll combo (K@3,4)" },
  { pattern: "RRKLKLL", group: 7, label: "2K, 2 doubles" },
  { pattern: "RRKLKRL", group: 7, label: "double roll combo (K@3,5)" },
  { pattern: "RRKLRKL", group: 7, label: "double roll combo (K@3,6)" },
  { pattern: "RRKLRLK", group: 7, label: "double + single (K@3,7)" },
  { pattern: "RRKLRRK", group: 7, label: "double roll combo (K@3,7)" },
  { pattern: "RRKRKLL", group: 7, label: "double lead para-diddle (K@3,5)" },
  { pattern: "RRKRKRL", group: 7, label: "double lead (7) (K@3,5)" },
  { pattern: "RRKRLKL", group: 7, label: "double lead (7) (K@3,6)" },
  { pattern: "RRKRLLK", group: 7, label: "triple paradiddle base (K@3,7)" },
  { pattern: "RRKRLRK", group: 7, label: "double lead (7) (K@3,7)" },
  { pattern: "RRKRRKL", group: 7, label: "double lead para-diddle (K@3,6)" },
  { pattern: "RRKRRLK", group: 7, label: "double lead para-diddle (K@3,7)" },
  { pattern: "RRLKKLL", group: 7, label: "double lead para-diddle (K@4,5)" },
  { pattern: "RRLKKRL", group: 7, label: "double lead (7) (K@4,5)" },
  { pattern: "RRLKLKL", group: 7, label: "double lead (7) (K@4,6)" },
  { pattern: "RRLKLLK", group: 7, label: "triple paradiddle base (K@4,7)" },
  { pattern: "RRLKLRK", group: 7, label: "double lead (7) (K@4,7)" },
  { pattern: "RRLKRKL", group: 7, label: "double roll combo (K@4,6)" },
  { pattern: "RRLKRLK", group: 7, label: "double + single (K@4,7)" },
  { pattern: "RRLKRRK", group: 7, label: "double roll combo (K@4,7)" },
  { pattern: "RRLLKKL", group: 7, label: "double roll combo (K@5,6)" },
  { pattern: "RRLLKLK", group: 7, label: "double + single (K@5,7)" },
  { pattern: "RRLLKRK", group: 7, label: "double roll combo (K@5,7)" },
  { pattern: "RRLLRKK", group: 7, label: "double roll combo (K@6,7)" },
  { pattern: "RRLRKKL", group: 7, label: "double lead (7) (K@5,6)" },
  { pattern: "RRLRKLK", group: 7, label: "triple paradiddle base (K@5,7)" },
  { pattern: "RRLRKRK", group: 7, label: "double lead (7) (K@5,7)" },
  { pattern: "RRLRLKK", group: 7, label: "double lead (7) (K@6,7)" },
  { pattern: "RRLRRKK", group: 7, label: "double lead para-diddle (K@6,7)" },

  // ======================================================================
  // 3 KICKS — higher bass density stickings (prog metal / Garstka)
  // ======================================================================

  // -- 3K, Group of 5 (10) --
  { pattern: "KKRKL", group: 5, label: "3K @1,2,4" },
  { pattern: "KKRKR", group: 5, label: "3K @1,2,4" },
  { pattern: "KRKKL", group: 5, label: "3K @1,3,4" },
  { pattern: "KRKKR", group: 5, label: "3K @1,3,4" },
  { pattern: "KRKLK", group: 5, label: "3K @1,3,5" },
  { pattern: "KRKRK", group: 5, label: "3K @1,3,5" },
  { pattern: "RKKLK", group: 5, label: "3K @2,3,5" },
  { pattern: "RKKRK", group: 5, label: "3K @2,3,5" },
  { pattern: "RKLKK", group: 5, label: "3K @2,4,5" },
  { pattern: "RKRKK", group: 5, label: "3K @2,4,5" },

  // -- 3K, Group of 6 (56) --
  { pattern: "KKRKLL", group: 6, label: "3K, 1 dbl @1,2,4" },
  { pattern: "KKRKLR", group: 6, label: "3K @1,2,4" },
  { pattern: "KKRKRL", group: 6, label: "3K @1,2,4" },
  { pattern: "KKRKRR", group: 6, label: "3K, 1 dbl @1,2,4" },
  { pattern: "KKRLKL", group: 6, label: "3K @1,2,5" },
  { pattern: "KKRLKR", group: 6, label: "3K @1,2,5" },
  { pattern: "KKRRKL", group: 6, label: "3K, 1 dbl @1,2,5" },
  { pattern: "KKRRKR", group: 6, label: "3K, 1 dbl @1,2,5" },
  { pattern: "KRKKLL", group: 6, label: "3K, 1 dbl @1,3,4" },
  { pattern: "KRKKLR", group: 6, label: "3K @1,3,4" },
  { pattern: "KRKKRL", group: 6, label: "3K @1,3,4" },
  { pattern: "KRKKRR", group: 6, label: "3K, 1 dbl @1,3,4" },
  { pattern: "KRKLKL", group: 6, label: "3K @1,3,5" },
  { pattern: "KRKLKR", group: 6, label: "3K @1,3,5" },
  { pattern: "KRKLLK", group: 6, label: "3K, 1 dbl @1,3,6" },
  { pattern: "KRKLRK", group: 6, label: "3K @1,3,6" },
  { pattern: "KRKRKL", group: 6, label: "3K @1,3,5" },
  { pattern: "KRKRKR", group: 6, label: "3K @1,3,5" },
  { pattern: "KRKRLK", group: 6, label: "3K @1,3,6" },
  { pattern: "KRKRRK", group: 6, label: "3K, 1 dbl @1,3,6" },
  { pattern: "KRLKKL", group: 6, label: "3K @1,4,5" },
  { pattern: "KRLKKR", group: 6, label: "3K @1,4,5" },
  { pattern: "KRLKLK", group: 6, label: "3K @1,4,6" },
  { pattern: "KRLKRK", group: 6, label: "3K @1,4,6" },
  { pattern: "KRRKKL", group: 6, label: "3K, 1 dbl @1,4,5" },
  { pattern: "KRRKKR", group: 6, label: "3K, 1 dbl @1,4,5" },
  { pattern: "KRRKLK", group: 6, label: "3K, 1 dbl @1,4,6" },
  { pattern: "KRRKRK", group: 6, label: "3K, 1 dbl @1,4,6" },
  { pattern: "RKKLKL", group: 6, label: "3K @2,3,5" },
  { pattern: "RKKLKR", group: 6, label: "3K @2,3,5" },
  { pattern: "RKKLLK", group: 6, label: "3K, 1 dbl @2,3,6" },
  { pattern: "RKKLRK", group: 6, label: "3K @2,3,6" },
  { pattern: "RKKRKL", group: 6, label: "3K @2,3,5" },
  { pattern: "RKKRKR", group: 6, label: "3K @2,3,5" },
  { pattern: "RKKRLK", group: 6, label: "3K @2,3,6" },
  { pattern: "RKKRRK", group: 6, label: "3K, 1 dbl @2,3,6" },
  { pattern: "RKLKKL", group: 6, label: "3K @2,4,5" },
  { pattern: "RKLKKR", group: 6, label: "3K @2,4,5" },
  { pattern: "RKLKLK", group: 6, label: "3K @2,4,6" },
  { pattern: "RKLKRK", group: 6, label: "3K @2,4,6" },
  { pattern: "RKLLKK", group: 6, label: "3K, 1 dbl @2,5,6" },
  { pattern: "RKLRKK", group: 6, label: "3K @2,5,6" },
  { pattern: "RKRKKL", group: 6, label: "3K @2,4,5" },
  { pattern: "RKRKKR", group: 6, label: "3K @2,4,5" },
  { pattern: "RKRKLK", group: 6, label: "3K @2,4,6" },
  { pattern: "RKRKRK", group: 6, label: "3K @2,4,6" },
  { pattern: "RKRLKK", group: 6, label: "3K @2,5,6" },
  { pattern: "RKRRKK", group: 6, label: "3K, 1 dbl @2,5,6" },
  { pattern: "RLKKLK", group: 6, label: "3K @3,4,6" },
  { pattern: "RLKKRK", group: 6, label: "3K @3,4,6" },
  { pattern: "RLKLKK", group: 6, label: "3K @3,5,6" },
  { pattern: "RLKRKK", group: 6, label: "3K @3,5,6" },
  { pattern: "RRKKLK", group: 6, label: "3K, 1 dbl @3,4,6" },
  { pattern: "RRKKRK", group: 6, label: "3K, 1 dbl @3,4,6" },
  { pattern: "RRKLKK", group: 6, label: "3K, 1 dbl @3,5,6" },
  { pattern: "RRKRKK", group: 6, label: "3K, 1 dbl @3,5,6" },

  // -- 3K, Group of 7 (196) --
  { pattern: "KKRKLLR", group: 7, label: "3K, 1 dbl @1,2,4" },
  { pattern: "KKRKLRL", group: 7, label: "3K @1,2,4" },
  { pattern: "KKRKLRR", group: 7, label: "3K, 1 dbl @1,2,4" },
  { pattern: "KKRKRLL", group: 7, label: "3K, 1 dbl @1,2,4" },
  { pattern: "KKRKRLR", group: 7, label: "3K @1,2,4" },
  { pattern: "KKRKRRL", group: 7, label: "3K, 1 dbl @1,2,4" },
  { pattern: "KKRLKLL", group: 7, label: "3K, 1 dbl @1,2,5" },
  { pattern: "KKRLKLR", group: 7, label: "3K @1,2,5" },
  { pattern: "KKRLKRL", group: 7, label: "3K @1,2,5" },
  { pattern: "KKRLKRR", group: 7, label: "3K, 1 dbl @1,2,5" },
  { pattern: "KKRLLKL", group: 7, label: "3K, 1 dbl @1,2,6" },
  { pattern: "KKRLLKR", group: 7, label: "3K, 1 dbl @1,2,6" },
  { pattern: "KKRLRKL", group: 7, label: "3K @1,2,6" },
  { pattern: "KKRLRKR", group: 7, label: "3K @1,2,6" },
  { pattern: "KKRRKLL", group: 7, label: "3K, 2 dbl @1,2,5" },
  { pattern: "KKRRKLR", group: 7, label: "3K, 1 dbl @1,2,5" },
  { pattern: "KKRRKRL", group: 7, label: "3K, 1 dbl @1,2,5" },
  { pattern: "KKRRKRR", group: 7, label: "3K, 2 dbl @1,2,5" },
  { pattern: "KKRRLKL", group: 7, label: "3K, 1 dbl @1,2,6" },
  { pattern: "KKRRLKR", group: 7, label: "3K, 1 dbl @1,2,6" },
  { pattern: "KRKKLLR", group: 7, label: "3K, 1 dbl @1,3,4" },
  { pattern: "KRKKLRL", group: 7, label: "3K @1,3,4" },
  { pattern: "KRKKLRR", group: 7, label: "3K, 1 dbl @1,3,4" },
  { pattern: "KRKKRLL", group: 7, label: "3K, 1 dbl @1,3,4" },
  { pattern: "KRKKRLR", group: 7, label: "3K @1,3,4" },
  { pattern: "KRKKRRL", group: 7, label: "3K, 1 dbl @1,3,4" },
  { pattern: "KRKLKLL", group: 7, label: "3K, 1 dbl @1,3,5" },
  { pattern: "KRKLKLR", group: 7, label: "3K @1,3,5" },
  { pattern: "KRKLKRL", group: 7, label: "3K @1,3,5" },
  { pattern: "KRKLKRR", group: 7, label: "3K, 1 dbl @1,3,5" },
  { pattern: "KRKLLKL", group: 7, label: "3K, 1 dbl @1,3,6" },
  { pattern: "KRKLLKR", group: 7, label: "3K, 1 dbl @1,3,6" },
  { pattern: "KRKLLRK", group: 7, label: "3K, 1 dbl @1,3,7" },
  { pattern: "KRKLRKL", group: 7, label: "3K @1,3,6" },
  { pattern: "KRKLRKR", group: 7, label: "3K @1,3,6" },
  { pattern: "KRKLRLK", group: 7, label: "3K @1,3,7" },
  { pattern: "KRKLRRK", group: 7, label: "3K, 1 dbl @1,3,7" },
  { pattern: "KRKRKLL", group: 7, label: "3K, 1 dbl @1,3,5" },
  { pattern: "KRKRKLR", group: 7, label: "3K @1,3,5" },
  { pattern: "KRKRKRL", group: 7, label: "3K @1,3,5" },
  { pattern: "KRKRKRR", group: 7, label: "3K, 1 dbl @1,3,5" },
  { pattern: "KRKRLKL", group: 7, label: "3K @1,3,6" },
  { pattern: "KRKRLKR", group: 7, label: "3K @1,3,6" },
  { pattern: "KRKRLLK", group: 7, label: "3K, 1 dbl @1,3,7" },
  { pattern: "KRKRLRK", group: 7, label: "3K @1,3,7" },
  { pattern: "KRKRRKL", group: 7, label: "3K, 1 dbl @1,3,6" },
  { pattern: "KRKRRKR", group: 7, label: "3K, 1 dbl @1,3,6" },
  { pattern: "KRKRRLK", group: 7, label: "3K, 1 dbl @1,3,7" },
  { pattern: "KRLKKLL", group: 7, label: "3K, 1 dbl @1,4,5" },
  { pattern: "KRLKKLR", group: 7, label: "3K @1,4,5" },
  { pattern: "KRLKKRL", group: 7, label: "3K @1,4,5" },
  { pattern: "KRLKKRR", group: 7, label: "3K, 1 dbl @1,4,5" },
  { pattern: "KRLKLKL", group: 7, label: "3K @1,4,6" },
  { pattern: "KRLKLKR", group: 7, label: "3K @1,4,6" },
  { pattern: "KRLKLLK", group: 7, label: "3K, 1 dbl @1,4,7" },
  { pattern: "KRLKLRK", group: 7, label: "3K @1,4,7" },
  { pattern: "KRLKRKL", group: 7, label: "3K @1,4,6" },
  { pattern: "KRLKRKR", group: 7, label: "3K @1,4,6" },
  { pattern: "KRLKRLK", group: 7, label: "3K @1,4,7" },
  { pattern: "KRLKRRK", group: 7, label: "3K, 1 dbl @1,4,7" },
  { pattern: "KRLLKKL", group: 7, label: "3K, 1 dbl @1,5,6" },
  { pattern: "KRLLKKR", group: 7, label: "3K, 1 dbl @1,5,6" },
  { pattern: "KRLLKLK", group: 7, label: "3K, 1 dbl @1,5,7" },
  { pattern: "KRLLKRK", group: 7, label: "3K, 1 dbl @1,5,7" },
  { pattern: "KRLRKKL", group: 7, label: "3K @1,5,6" },
  { pattern: "KRLRKKR", group: 7, label: "3K @1,5,6" },
  { pattern: "KRLRKLK", group: 7, label: "3K @1,5,7" },
  { pattern: "KRLRKRK", group: 7, label: "3K @1,5,7" },
  { pattern: "KRRKKLL", group: 7, label: "3K, 2 dbl @1,4,5" },
  { pattern: "KRRKKLR", group: 7, label: "3K, 1 dbl @1,4,5" },
  { pattern: "KRRKKRL", group: 7, label: "3K, 1 dbl @1,4,5" },
  { pattern: "KRRKKRR", group: 7, label: "3K, 2 dbl @1,4,5" },
  { pattern: "KRRKLKL", group: 7, label: "3K, 1 dbl @1,4,6" },
  { pattern: "KRRKLKR", group: 7, label: "3K, 1 dbl @1,4,6" },
  { pattern: "KRRKLLK", group: 7, label: "3K, 2 dbl @1,4,7" },
  { pattern: "KRRKLRK", group: 7, label: "3K, 1 dbl @1,4,7" },
  { pattern: "KRRKRKL", group: 7, label: "3K, 1 dbl @1,4,6" },
  { pattern: "KRRKRKR", group: 7, label: "3K, 1 dbl @1,4,6" },
  { pattern: "KRRKRLK", group: 7, label: "3K, 1 dbl @1,4,7" },
  { pattern: "KRRKRRK", group: 7, label: "3K, 2 dbl @1,4,7" },
  { pattern: "KRRLKKL", group: 7, label: "3K, 1 dbl @1,5,6" },
  { pattern: "KRRLKKR", group: 7, label: "3K, 1 dbl @1,5,6" },
  { pattern: "KRRLKLK", group: 7, label: "3K, 1 dbl @1,5,7" },
  { pattern: "KRRLKRK", group: 7, label: "3K, 1 dbl @1,5,7" },
  { pattern: "RKKLKLL", group: 7, label: "3K, 1 dbl @2,3,5" },
  { pattern: "RKKLKLR", group: 7, label: "3K @2,3,5" },
  { pattern: "RKKLKRL", group: 7, label: "3K @2,3,5" },
  { pattern: "RKKLLKL", group: 7, label: "3K, 1 dbl @2,3,6" },
  { pattern: "RKKLLKR", group: 7, label: "3K, 1 dbl @2,3,6" },
  { pattern: "RKKLLRK", group: 7, label: "3K, 1 dbl @2,3,7" },
  { pattern: "RKKLRKL", group: 7, label: "3K @2,3,6" },
  { pattern: "RKKLRKR", group: 7, label: "3K @2,3,6" },
  { pattern: "RKKLRLK", group: 7, label: "3K @2,3,7" },
  { pattern: "RKKLRRK", group: 7, label: "3K, 1 dbl @2,3,7" },
  { pattern: "RKKRKLL", group: 7, label: "3K, 1 dbl @2,3,5" },
  { pattern: "RKKRKLR", group: 7, label: "3K @2,3,5" },
  { pattern: "RKKRKRL", group: 7, label: "3K @2,3,5" },
  { pattern: "RKKRLKL", group: 7, label: "3K @2,3,6" },
  { pattern: "RKKRLKR", group: 7, label: "3K @2,3,6" },
  { pattern: "RKKRLLK", group: 7, label: "3K, 1 dbl @2,3,7" },
  { pattern: "RKKRLRK", group: 7, label: "3K @2,3,7" },
  { pattern: "RKKRRKL", group: 7, label: "3K, 1 dbl @2,3,6" },
  { pattern: "RKKRRKR", group: 7, label: "3K, 1 dbl @2,3,6" },
  { pattern: "RKKRRLK", group: 7, label: "3K, 1 dbl @2,3,7" },
  { pattern: "RKLKKLL", group: 7, label: "3K, 1 dbl @2,4,5" },
  { pattern: "RKLKKLR", group: 7, label: "3K @2,4,5" },
  { pattern: "RKLKKRL", group: 7, label: "3K @2,4,5" },
  { pattern: "RKLKLKL", group: 7, label: "3K @2,4,6" },
  { pattern: "RKLKLKR", group: 7, label: "3K @2,4,6" },
  { pattern: "RKLKLLK", group: 7, label: "3K, 1 dbl @2,4,7" },
  { pattern: "RKLKLRK", group: 7, label: "3K @2,4,7" },
  { pattern: "RKLKRKL", group: 7, label: "3K @2,4,6" },
  { pattern: "RKLKRKR", group: 7, label: "3K @2,4,6" },
  { pattern: "RKLKRLK", group: 7, label: "3K @2,4,7" },
  { pattern: "RKLKRRK", group: 7, label: "3K, 1 dbl @2,4,7" },
  { pattern: "RKLLKKL", group: 7, label: "3K, 1 dbl @2,5,6" },
  { pattern: "RKLLKKR", group: 7, label: "3K, 1 dbl @2,5,6" },
  { pattern: "RKLLKLK", group: 7, label: "3K, 1 dbl @2,5,7" },
  { pattern: "RKLLKRK", group: 7, label: "3K, 1 dbl @2,5,7" },
  { pattern: "RKLLRKK", group: 7, label: "3K, 1 dbl @2,6,7" },
  { pattern: "RKLRKKL", group: 7, label: "3K @2,5,6" },
  { pattern: "RKLRKKR", group: 7, label: "3K @2,5,6" },
  { pattern: "RKLRKLK", group: 7, label: "3K @2,5,7" },
  { pattern: "RKLRKRK", group: 7, label: "3K @2,5,7" },
  { pattern: "RKLRLKK", group: 7, label: "3K @2,6,7" },
  { pattern: "RKLRRKK", group: 7, label: "3K, 1 dbl @2,6,7" },
  { pattern: "RKRKKLL", group: 7, label: "3K, 1 dbl @2,4,5" },
  { pattern: "RKRKKLR", group: 7, label: "3K @2,4,5" },
  { pattern: "RKRKKRL", group: 7, label: "3K @2,4,5" },
  { pattern: "RKRKLKL", group: 7, label: "3K @2,4,6" },
  { pattern: "RKRKLKR", group: 7, label: "3K @2,4,6" },
  { pattern: "RKRKLLK", group: 7, label: "3K, 1 dbl @2,4,7" },
  { pattern: "RKRKLRK", group: 7, label: "3K @2,4,7" },
  { pattern: "RKRKRKL", group: 7, label: "3K @2,4,6" },
  { pattern: "RKRKRKR", group: 7, label: "3K @2,4,6" },
  { pattern: "RKRKRLK", group: 7, label: "3K @2,4,7" },
  { pattern: "RKRKRRK", group: 7, label: "3K, 1 dbl @2,4,7" },
  { pattern: "RKRLKKL", group: 7, label: "3K @2,5,6" },
  { pattern: "RKRLKKR", group: 7, label: "3K @2,5,6" },
  { pattern: "RKRLKLK", group: 7, label: "3K @2,5,7" },
  { pattern: "RKRLKRK", group: 7, label: "3K @2,5,7" },
  { pattern: "RKRLLKK", group: 7, label: "3K, 1 dbl @2,6,7" },
  { pattern: "RKRLRKK", group: 7, label: "3K @2,6,7" },
  { pattern: "RKRRKKL", group: 7, label: "3K, 1 dbl @2,5,6" },
  { pattern: "RKRRKKR", group: 7, label: "3K, 1 dbl @2,5,6" },
  { pattern: "RKRRKLK", group: 7, label: "3K, 1 dbl @2,5,7" },
  { pattern: "RKRRKRK", group: 7, label: "3K, 1 dbl @2,5,7" },
  { pattern: "RKRRLKK", group: 7, label: "3K, 1 dbl @2,6,7" },
  { pattern: "RLKKLKL", group: 7, label: "3K @3,4,6" },
  { pattern: "RLKKLKR", group: 7, label: "3K @3,4,6" },
  { pattern: "RLKKLLK", group: 7, label: "3K, 1 dbl @3,4,7" },
  { pattern: "RLKKLRK", group: 7, label: "3K @3,4,7" },
  { pattern: "RLKKRKL", group: 7, label: "3K @3,4,6" },
  { pattern: "RLKKRKR", group: 7, label: "3K @3,4,6" },
  { pattern: "RLKKRLK", group: 7, label: "3K @3,4,7" },
  { pattern: "RLKKRRK", group: 7, label: "3K, 1 dbl @3,4,7" },
  { pattern: "RLKLKKL", group: 7, label: "3K @3,5,6" },
  { pattern: "RLKLKKR", group: 7, label: "3K @3,5,6" },
  { pattern: "RLKLKLK", group: 7, label: "3K @3,5,7" },
  { pattern: "RLKLKRK", group: 7, label: "3K @3,5,7" },
  { pattern: "RLKLLKK", group: 7, label: "3K, 1 dbl @3,6,7" },
  { pattern: "RLKLRKK", group: 7, label: "3K @3,6,7" },
  { pattern: "RLKRKKL", group: 7, label: "3K @3,5,6" },
  { pattern: "RLKRKKR", group: 7, label: "3K @3,5,6" },
  { pattern: "RLKRKLK", group: 7, label: "3K @3,5,7" },
  { pattern: "RLKRKRK", group: 7, label: "3K @3,5,7" },
  { pattern: "RLKRLKK", group: 7, label: "3K @3,6,7" },
  { pattern: "RLKRRKK", group: 7, label: "3K, 1 dbl @3,6,7" },
  { pattern: "RLLKKLK", group: 7, label: "3K, 1 dbl @4,5,7" },
  { pattern: "RLLKKRK", group: 7, label: "3K, 1 dbl @4,5,7" },
  { pattern: "RLLKLKK", group: 7, label: "3K, 1 dbl @4,6,7" },
  { pattern: "RLLKRKK", group: 7, label: "3K, 1 dbl @4,6,7" },
  { pattern: "RLRKKLK", group: 7, label: "3K @4,5,7" },
  { pattern: "RLRKKRK", group: 7, label: "3K @4,5,7" },
  { pattern: "RLRKLKK", group: 7, label: "3K @4,6,7" },
  { pattern: "RLRKRKK", group: 7, label: "3K @4,6,7" },
  { pattern: "RRKKLKL", group: 7, label: "3K, 1 dbl @3,4,6" },
  { pattern: "RRKKLLK", group: 7, label: "3K, 2 dbl @3,4,7" },
  { pattern: "RRKKLRK", group: 7, label: "3K, 1 dbl @3,4,7" },
  { pattern: "RRKKRKL", group: 7, label: "3K, 1 dbl @3,4,6" },
  { pattern: "RRKKRLK", group: 7, label: "3K, 1 dbl @3,4,7" },
  { pattern: "RRKKRRK", group: 7, label: "3K, 2 dbl @3,4,7" },
  { pattern: "RRKLKKL", group: 7, label: "3K, 1 dbl @3,5,6" },
  { pattern: "RRKLKLK", group: 7, label: "3K, 1 dbl @3,5,7" },
  { pattern: "RRKLKRK", group: 7, label: "3K, 1 dbl @3,5,7" },
  { pattern: "RRKLLKK", group: 7, label: "3K, 2 dbl @3,6,7" },
  { pattern: "RRKLRKK", group: 7, label: "3K, 1 dbl @3,6,7" },
  { pattern: "RRKRKKL", group: 7, label: "3K, 1 dbl @3,5,6" },
  { pattern: "RRKRKLK", group: 7, label: "3K, 1 dbl @3,5,7" },
  { pattern: "RRKRKRK", group: 7, label: "3K, 1 dbl @3,5,7" },
  { pattern: "RRKRLKK", group: 7, label: "3K, 1 dbl @3,6,7" },
  { pattern: "RRKRRKK", group: 7, label: "3K, 2 dbl @3,6,7" },
  { pattern: "RRLKKLK", group: 7, label: "3K, 1 dbl @4,5,7" },
  { pattern: "RRLKKRK", group: 7, label: "3K, 1 dbl @4,5,7" },
  { pattern: "RRLKLKK", group: 7, label: "3K, 1 dbl @4,6,7" },
  { pattern: "RRLKRKK", group: 7, label: "3K, 1 dbl @4,6,7" },
];

/* ── Helpers ────────────────────────────────────────────────────────────────── */

export const DEFAULT_PULSE_COUNT = 16;
export const MIN_PULSE_COUNT = 4;
export const MAX_PULSE_COUNT = 32;

/** Return patterns whose group size fits in the remaining slots. */
export function getAvailablePatterns(remaining: number): StickingPattern[] {
  return STICKING_PATTERNS.filter(p => p.group <= remaining);
}

/** Create uniform beam groups: e.g. totalSlots=16, size=4 → [4,4,4,4] */
export function uniformBeamGroups(totalSlots: number, size: number = SLOTS_PER_BEAT): number[] {
  const groups: number[] = [];
  let rem = totalSlots;
  while (rem > 0) { const g = Math.min(size, rem); groups.push(g); rem -= g; }
  return groups;
}

/** Get beam ranges (lo/hi pairs) from a beamGroups array, covering totalSlots */
export function beamRanges(beamGroups: number[], totalSlots: number): { lo: number; hi: number }[] {
  const ranges: { lo: number; hi: number }[] = [];
  let cursor = 0;
  for (const g of beamGroups) {
    if (cursor >= totalSlots) break;
    ranges.push({ lo: cursor, hi: Math.min(cursor + g, totalSlots) });
    cursor += g;
  }
  if (cursor < totalSlots) ranges.push({ lo: cursor, hi: totalSlots });
  return ranges;
}

/** Resolve beamGroups from a measure (prefer beamGroups, fall back to uniform from beamGrouping) */
export function resolveBeamGroups(m: StickingMeasureData): number[] {
  if (m.beamGroups && m.beamGroups.length > 0) return m.beamGroups;
  return uniformBeamGroups(m.totalSlots ?? DEFAULT_PULSE_COUNT, m.beamGrouping ?? SLOTS_PER_BEAT);
}

/** Build a StickingMeasureData from a sequence of chosen patterns. */
export function buildStickingMeasure(chosenPatterns: StickingPattern[], totalSlots: number = DEFAULT_PULSE_COUNT, beamGroups: number[] = uniformBeamGroups(totalSlots)): StickingMeasureData {
  const stickings: string[] = [];
  const groups: string[] = [];
  for (const p of chosenPatterns) {
    groups.push(p.pattern);
    for (const ch of p.pattern) stickings.push(ch);
  }
  while (stickings.length < totalSlots) stickings.push("R");

  const snareHits: number[] = [];
  const bassHits: number[] = [];
  for (let i = 0; i < totalSlots; i++) {
    const c = stickings[i];
    // "K" and "B" both route to bass; "R"/"L"/"S" (or any non-bass) to snare.
    if (c === "K" || c === "B") bassHits.push(i);
    else snareHits.push(i);
  }

  return {
    snareHits,
    bassHits,
    accentFlags: Array(totalSlots).fill(false),
    stickings,
    groups,
    totalSlots,
    beamGrouping: beamGroups[0] ?? SLOTS_PER_BEAT,
    beamGroups,
  };
}

/** Total number of slots filled by the chosen patterns. */
export function filledCount(patterns: StickingPattern[]): number {
  return patterns.reduce((s, p) => s + p.group, 0);
}

export const SLOTS_PER_BEAT = 4;

/* ── Randomize: musical vs awkward sticking fill ─────────────────────────── */

import { scoreStickingFill, resolveMode, type AestheticMode } from "./musicalScoring";

export type StickingMode = AestheticMode;

/** Check if concatenating two patterns creates a run of >maxRun same hand (R or L) at the boundary */
function createsBoundaryRun(prevPattern: string, nextPattern: string, maxRun: number): boolean {
  if (prevPattern.length === 0) return false;
  // Count trailing same-hand hits of prev (ignoring K)
  let trailChar = "";
  let trailCount = 0;
  for (let i = prevPattern.length - 1; i >= 0; i--) {
    const c = prevPattern[i];
    if (c === "K") continue;
    if (trailChar === "") { trailChar = c; trailCount = 1; }
    else if (c === trailChar) trailCount++;
    else break;
  }
  if (trailCount === 0) return false;
  // Count leading same-hand hits of next (ignoring K)
  let leadCount = 0;
  for (let i = 0; i < nextPattern.length; i++) {
    const c = nextPattern[i];
    if (c === "K") continue;
    if (c === trailChar) leadCount++;
    else break;
  }
  return trailCount + leadCount > maxRun;
}

export function randomizeStickings(
  totalSlots: number,
  mode: StickingMode,
  enabledKicks: Set<number>,
  enabledGroups: Set<number>,
  enabledFamilies: Set<string>,
  maxAttempts = 200,
): StickingPattern[] | null {
  const resolved = resolveMode(mode);
  const allPatterns = STICKING_PATTERNS.filter(p =>
    enabledGroups.has(p.group) &&
    enabledKicks.has(kickCountOf(p.pattern)) &&
    enabledFamilies.has(rudimentFamilyOf(p.label)),
  );
  if (allPatterns.length === 0) return null;

  const bySize = new Map<number, StickingPattern[]>();
  for (const p of allPatterns) {
    const arr = bySize.get(p.group) ?? [];
    arr.push(p);
    bySize.set(p.group, arr);
  }
  const availSizes = [...bySize.keys()].sort((a, b) => a - b);
  if (availSizes.length === 0) return null;

  let bestResult: StickingPattern[] | null = null;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const sizes = pickGroupSizes(totalSlots, availSizes, resolved);
    if (!sizes) continue;

    const result: StickingPattern[] = [];
    let ok = true;
    for (const sz of sizes) {
      const candidates = bySize.get(sz);
      if (!candidates || candidates.length === 0) { ok = false; break; }
      // Filter candidates that won't create >2 consecutive same-hand hits at the boundary
      const prev = result.length > 0 ? result[result.length - 1].pattern : "";
      const filtered = candidates.filter(c => !createsBoundaryRun(prev, c.pattern, 2));
      const pool = filtered.length > 0 ? filtered : candidates;
      pool.sort(() => Math.random() - 0.5);
      result.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    if (!ok) continue;

    const score = scoreStickingFill(result, resolved, totalSlots);
    if (score > bestScore) {
      bestScore = score;
      bestResult = result;
    }
  }

  return bestResult;
}

function kickCountOf(pat: string): number {
  let k = 0;
  for (const c of pat) if (c === "K" || c === "B") k++;
  return k;
}

function rudimentFamilyOf(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("3k")) return "3k";
  if (l.includes("single") || l.includes("alternating")) return "single";
  if (l.includes("double") || l.includes("dbl") || l === "2 doubles") return "double";
  if (l.includes("para")) return "paradiddle";
  return "other";
}

/** Pick group sizes that sum to totalSlots */
function pickGroupSizes(total: number, availSizes: number[], mode: "musical" | "awkward"): number[] | null {
  const sizes: number[] = [];
  let remaining = total;

  const weights = (sz: number, usedSizes: Set<number>): number => {
    if (mode === "musical") {
      let w = sz === 4 ? 10 : sz === 3 ? 7 : sz === 5 ? 4 : sz === 6 ? 3 : sz === 2 ? 5 : sz === 7 ? 2 : 1;
      if (usedSizes.size > 0 && usedSizes.has(sz)) w *= 2;
      return w;
    } else {
      let w = sz === 5 ? 8 : sz === 7 ? 7 : sz === 3 ? 5 : sz === 6 ? 4 : sz === 4 ? 3 : sz === 2 ? 2 : 1;
      if (usedSizes.size > 0 && !usedSizes.has(sz)) w *= 3;
      return w;
    }
  };

  const usedSizes = new Set<number>();
  for (let guard = 0; guard < 20 && remaining > 0; guard++) {
    const valid = availSizes.filter(s => s <= remaining);
    if (valid.length === 0) return null;
    if (valid.includes(remaining)) {
      if (mode === "musical" || Math.random() < 0.5) {
        sizes.push(remaining);
        remaining = 0;
        break;
      }
    }
    const ws = valid.map(s => weights(s, usedSizes));
    const totalW = ws.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalW;
    let pick = valid[0];
    for (let i = 0; i < valid.length; i++) {
      r -= ws[i];
      if (r <= 0) { pick = valid[i]; break; }
    }
    sizes.push(pick);
    usedSizes.add(pick);
    remaining -= pick;
  }

  return remaining === 0 ? sizes : null;
}
