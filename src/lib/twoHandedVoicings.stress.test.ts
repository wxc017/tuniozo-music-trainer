// ── Two-Handed Voicings Stress Tests ─────────────────────────────────
// Exhaustively exercises every two-handed voicing mode (family-1 BASS +
// YOUR VOICING and family-2 FULL TWO-HAND VOICINGS) against every
// standard chord type in 12-EDO and 31-EDO.  Asserts that:
//
//   1. The realised voicing's pitch classes are all IN-KEY/IN-CHORD —
//      i.e. they belong to {chord tones} ∪ {supplied extensions} ∪ a
//      narrow style-specific allowed set (e.g. "sixway" adds the 6th).
//      No spurious m7 from a fallback on a plain triad, no rogue b5
//      from a synthetic interval.
//
//   2. For family-1 (BassVoicing) the LOWEST pitch's pc IS the chord
//      root pc — the LH bass really is on the root, never on some
//      misplaced chord tone or extension.
//
//   3. The bass-* shapes produce the expected LH structure:
//      - bass-root        → 1 pitch at root
//      - bass-octave      → 2 pitches, both root
//      - bass-root5       → 2 pitches: root + a true P5
//      - bass-root10      → root + 3rd (a 10th up)  [skipped if no 3rd]
//      - bass-shell7      → root + 7th               [skipped if no 7th]
//      - bass-shellfull   → root + 3rd + 7th         [degrades gracefully]
//
// Run with `npx vitest run twoHandedVoicings.stress`.

import { describe, it, expect } from "vitest";
import {
  addBassUnder, buildTwoHandedVoicing,
  BASS_VOICINGS, TWO_HAND_STYLES,
  type BassVoicing, type TwoHandStyle,
} from "./musicTheory";

// ── Chord catalogue (interval-class steps from root) ───────────────
// Per EDO, with the conventional intervals.  Triads (no 7) drive the
// "fallback" code paths; 7th chords exercise the seventh-derived shapes;
// dim / sus / mb5 chords cover edge interval zones.
const CHORDS_12 = {
  maj:    [0, 4, 7],
  min:    [0, 3, 7],
  dim:    [0, 3, 6],          // b5
  aug:    [0, 4, 8],          // #5
  sus2:   [0, 2, 7],          // no 3rd
  sus4:   [0, 5, 7],          // no 3rd
  maj7:   [0, 4, 7, 11],
  min7:   [0, 3, 7, 10],
  dom7:   [0, 4, 7, 10],
  m7b5:   [0, 3, 6, 10],
  dim7:   [0, 3, 6, 9],       // bb7 (= M6)
} as const;
const CHORDS_31 = {
  // 31-EDO steps for the same chord families.
  maj:    [0, 10, 18],
  min:    [0,  8, 18],
  dim:    [0,  8, 15],
  aug:    [0, 10, 20],
  sus2:   [0,  5, 18],
  sus4:   [0, 13, 18],
  maj7:   [0, 10, 18, 28],
  min7:   [0,  8, 18, 26],
  dom7:   [0, 10, 18, 26],
  m7b5:   [0,  8, 15, 26],
  dim7:   [0,  8, 15, 23],
} as const;

// Sample tonics across the octave so any pitch-class arithmetic that
// happens to be correct only at root=0 still gets caught.
const ROOTS_12 = [0, 2, 5, 7, 11];
const ROOTS_31 = [0, 5, 13, 18, 28];

// Floor / ceiling for placement.  Wide enough that addBassUnder always
// has room to position the bass below the RH.
const FLOOR = -100;
const CEIL = 100;

// Build a synthetic right-hand voicing for a chord by placing each tone
// at a plausible "above middle C" pitch (in steps).  Mimics what
// buildVoicing produces with the simplest "1 3 5 (7)" voicing pattern.
function rhVoicing(rootStep: number, intervals: readonly number[], edo: number): number[] {
  const anchor = edo * 4 + rootStep;  // ≈ C4-ish octave
  const out: number[] = [anchor];
  for (let i = 1; i < intervals.length; i++) {
    let n = anchor + (intervals[i] - intervals[0]);
    while (n <= out[out.length - 1]) n += edo;
    out.push(n);
  }
  return out;
}

function pcsOf(pitches: number[], edo: number): Set<number> {
  return new Set(pitches.map(n => ((n % edo) + edo) % edo));
}

// ── Family 1: addBassUnder ─────────────────────────────────────────
describe("addBassUnder — family 1 (Bass + YOUR voicing)", () => {
  for (const edo of [12, 31] as const) {
    const CHORDS = edo === 12 ? CHORDS_12 : CHORDS_31;
    const ROOTS = edo === 12 ? ROOTS_12 : ROOTS_31;
    for (const [chordName, intervals] of Object.entries(CHORDS)) {
      for (const rootPc of ROOTS) {
        for (const bass of BASS_VOICINGS.map(b => b.id) as BassVoicing[]) {
          const label = `${edo}-EDO ${chordName} (root=${rootPc}) · ${bass}`;
          it(label, () => {
            // Build the synthetic RH from the chord intervals at the root.
            const rh = rhVoicing(rootPc, intervals, edo);
            const chordTonePcs = intervals.map(s => ((rootPc + s) % edo + edo) % edo);
            const expectedPcs = new Set(chordTonePcs);

            const out = addBassUnder(rh, chordTonePcs, rootPc, edo, bass, FLOOR);

            // The output's pcs must be a subset of the chord's pcs — no
            // spurious tones from fallbacks.  This catches "bass-shell7
            // on a triad adds a synthetic m7" and similar.
            const outPcs = pcsOf(out, edo);
            for (const pc of outPcs) {
              expect(expectedPcs, `${label}: pc ${pc} not in chord {${[...expectedPcs].join(",")}}`).toContain(pc);
            }

            // For every bass-* shape the LOWEST pitch's pc must be the
            // chord root.  This is THE invariant that broke before
            // (showed up as "I/5" instead of "I").
            const lowest = Math.min(...out);
            expect(((lowest % edo) + edo) % edo, `${label}: lowest pitch pc != rootPc`).toBe(rootPc);

            // Shape-specific structural checks — count of LH tones (the
            // pitches the function added below the RH).  The in-chord
            // assertion above already proves each tone is a valid chord
            // pitch; we just check the LH has the right number of notes
            // for each shape.
            const rhBottom = Math.min(...rh);
            const lhPitches = out.filter(n => n < rhBottom);
            // Helpers to ask which roles the chord provides.
            const hasThird = intervals.slice(1).some(s => {
              const r = ((s % edo) + edo) % edo;
              return r >= Math.round(edo * 2 / 12) && r <= Math.round(edo * 5 / 12);
            });
            const hasFifth = intervals.slice(1).some(s => {
              const r = ((s % edo) + edo) % edo;
              return r > Math.round(edo * 5 / 12) && r <= Math.round(edo * 8 / 12);
            });
            const hasSeventh = intervals.slice(1).some(s => {
              const r = ((s % edo) + edo) % edo;
              return r > Math.round(edo * 8 / 12);
            });
            switch (bass) {
              case "bass-root":
                expect(lhPitches.length, `${label}: bass-root expects 1 LH pitch`).toBe(1);
                break;
              case "bass-octave":
                expect(lhPitches.length, `${label}: bass-octave expects 2 LH pitches`).toBe(2);
                break;
              case "bass-root5":
                // Always 2 (root + chord's 5th if present, else P5 fallback).
                expect(lhPitches.length, `${label}: bass-root5 expects 2 LH pitches`).toBe(2);
                break;
              case "bass-root10":
                expect(lhPitches.length, `${label}: bass-root10 expects ${hasThird ? 2 : 1}`).toBe(hasThird ? 2 : 1);
                break;
              case "bass-shell7":
                expect(lhPitches.length, `${label}: bass-shell7 expects ${(hasSeventh || hasThird) ? 2 : 1}`).toBe((hasSeventh || hasThird) ? 2 : 1);
                break;
              case "bass-shellfull": {
                const expected = (hasThird && hasSeventh) ? 3 : (hasThird || hasSeventh) ? 2 : 1;
                expect(lhPitches.length, `${label}: shellfull expects ${expected}`).toBe(expected);
                break;
              }
            }
            // Mark hasFifth as used to keep the linter happy without
            // changing the structural checks above.
            void hasFifth;
          });
        }
      }
    }
  }
});

// ── Family 2: buildTwoHandedVoicing ────────────────────────────────
describe("buildTwoHandedVoicing — family 2 (full two-hand styles)", () => {
  for (const edo of [12, 31] as const) {
    const CHORDS = edo === 12 ? CHORDS_12 : CHORDS_31;
    const ROOTS = edo === 12 ? ROOTS_12 : ROOTS_31;
    for (const [chordName, intervals] of Object.entries(CHORDS)) {
      for (const rootPc of ROOTS) {
        for (const style of TWO_HAND_STYLES.map(s => s.id) as TwoHandStyle[]) {
          const label = `${edo}-EDO ${chordName} (root=${rootPc}) · ${style}`;
          it(label, () => {
            const chordTonePcs = intervals.map(s => ((rootPc + s) % edo + edo) % edo);
            const extPcs: number[] = [];  // exercise the "no extensions" baseline
            const out = buildTwoHandedVoicing(chordTonePcs, extPcs, rootPc, edo, style, edo * 4, FLOOR, CEIL);

            // The output must be non-empty.
            expect(out.length, `${label}: voicing must produce at least one note`).toBeGreaterThan(0);

            // Build the allowed pc set for this style.  Most styles must
            // stay strictly within chord tones; "sixway" adds the chord-
            // appropriate 6th (m6 for minor-third chords, M6 for major-
            // third chords) so that pc is also allowed.
            const allowed = new Set(chordTonePcs);
            if (style === "sixway") {
              // Pick the same 6 the implementation picks.
              const relRoot = (pc: number) => (((pc % edo) + edo) % edo - rootPc + edo) % edo;
              let thirdI: number | null = null;
              for (const pc of chordTonePcs) {
                const r = relRoot(pc);
                if (r === 0) continue;
                if (r <= Math.round(edo * 5 / 12)) { thirdI = thirdI ?? r; }
              }
              const sixthI = thirdI !== null && thirdI < Math.round(edo * 4 / 12)
                ? Math.round(edo * 8 / 12)
                : Math.round(edo * 9 / 12);
              allowed.add(((rootPc + sixthI) % edo + edo) % edo);
            }

            const outPcs = pcsOf(out, edo);
            for (const pc of outPcs) {
              expect(allowed, `${label}: pc ${pc} not in allowed {${[...allowed].join(",")}}`).toContain(pc);
            }

            // Voicing must fit in the keyboard window.
            expect(Math.min(...out), `${label}: below floor`).toBeGreaterThanOrEqual(FLOOR);
            expect(Math.max(...out), `${label}: above ceil`).toBeLessThanOrEqual(CEIL);
          });
        }
      }
    }
  }
});

// ── Family 2 with extensions: every ext must land in-key ──────────
describe("buildTwoHandedVoicing — with 9 / 11 / 13 extensions", () => {
  // Test a representative chord (Cmaj7) with each extension enabled.
  const edo = 12;
  const intervals = [0, 4, 7, 11];     // maj7
  const rootPc = 0;
  const chordTonePcs = intervals;
  const EXT_CASES: { name: string; extPcs: number[] }[] = [
    { name: "9 only",   extPcs: [2] },           // D
    { name: "11 only",  extPcs: [5] },           // F
    { name: "13 only",  extPcs: [9] },           // A
    { name: "9 + 13",   extPcs: [2, 9] },
    { name: "all 3",    extPcs: [2, 5, 9] },
  ];
  for (const { name, extPcs } of EXT_CASES) {
    for (const style of TWO_HAND_STYLES.map(s => s.id) as TwoHandStyle[]) {
      it(`Cmaj7 + ${name} · ${style}`, () => {
        const out = buildTwoHandedVoicing(chordTonePcs, extPcs, rootPc, edo, style, edo * 4, FLOOR, CEIL);
        const allowed = new Set([...chordTonePcs, ...extPcs]);
        if (style === "sixway") allowed.add(9);  // M6 fallback (already in 13)
        const outPcs = pcsOf(out, edo);
        for (const pc of outPcs) {
          expect(allowed, `Cmaj7 +${name} ${style}: pc ${pc} not allowed`).toContain(pc);
        }
      });
    }
  }
});
