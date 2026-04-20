// ── AudioEngine Stress Tests ─────────────────────────────────────────
// Tests the pure-math portions of AudioEngine (frequency conversion,
// equal-loudness boost, gain scaling). Web Audio API nodes are not
// available in Node, so we extract and test the formulas directly.

import { describe, it, expect } from "vitest";

// ── Reproduce private helpers from AudioEngine ──────────────────────
const C4_FREQ = 261.63;

function absToRate(abs: number, edo: number): number {
  return Math.pow(2, abs / edo);
}
function absToFreq(abs: number, edo: number): number {
  return C4_FREQ * absToRate(abs, edo);
}
function elBoost(abs: number, edo: number): number {
  if (abs >= 0) return 1;
  const octavesDown = -abs / edo;
  return Math.min(4, Math.pow(1.41, octavesDown));
}
function elBoostRatio(ratio: number): number {
  if (ratio >= 1) return 1;
  const octavesDown = -Math.log2(ratio);
  return Math.min(4, Math.pow(1.41, octavesDown));
}

// ── absToRate / absToFreq ────────────────────────────────────────────

describe("absToRate", () => {
  it("returns 1 for abs=0 (C4 reference) in any EDO", () => {
    for (const edo of [12, 17, 19, 31, 41, 53]) {
      expect(absToRate(0, edo)).toBe(1);
    }
  });

  it("returns 2 for one octave up (abs=EDO)", () => {
    for (const edo of [12, 17, 19, 31, 41, 53]) {
      expect(absToRate(edo, edo)).toBeCloseTo(2, 10);
    }
  });

  it("returns 0.5 for one octave down (abs=-EDO)", () => {
    for (const edo of [12, 31, 41]) {
      expect(absToRate(-edo, edo)).toBeCloseTo(0.5, 10);
    }
  });

  it("returns correct 12-EDO semitone ratio (2^(1/12))", () => {
    expect(absToRate(1, 12)).toBeCloseTo(Math.pow(2, 1 / 12), 10);
  });

  it("returns correct 31-EDO step ratio", () => {
    expect(absToRate(1, 31)).toBeCloseTo(Math.pow(2, 1 / 31), 10);
  });

  it("is monotonically increasing with abs for fixed EDO", () => {
    for (const edo of [12, 31, 41]) {
      for (let a = -edo * 3; a < edo * 3; a++) {
        expect(absToRate(a + 1, edo)).toBeGreaterThan(absToRate(a, edo));
      }
    }
  });

  it("handles extreme values without NaN/Infinity", () => {
    for (const edo of [12, 31]) {
      const high = absToRate(edo * 10, edo); // 10 octaves up
      const low = absToRate(-edo * 10, edo); // 10 octaves down
      expect(Number.isFinite(high)).toBe(true);
      expect(Number.isFinite(low)).toBe(true);
      expect(high).toBeGreaterThan(0);
      expect(low).toBeGreaterThan(0);
    }
  });
});

describe("absToFreq", () => {
  it("returns C4 frequency for abs=0", () => {
    expect(absToFreq(0, 31)).toBeCloseTo(261.63, 2);
  });

  it("returns ~523.25 Hz for one octave up in 12-EDO", () => {
    expect(absToFreq(12, 12)).toBeCloseTo(523.26, 1);
  });

  it("matches known 12-EDO pitches", () => {
    // A4 = 440 Hz is 9 semitones above C4
    expect(absToFreq(9, 12)).toBeCloseTo(440, 0);
  });

  it("31-EDO perfect fifth (18 steps) ≈ 3/2 ratio", () => {
    const fifth = absToFreq(18, 31);
    const justFifth = C4_FREQ * 1.5;
    // 31-EDO fifth is ~5.2 cents from just (meantone characteristic)
    const centsDiff = Math.abs(1200 * Math.log2(fifth / justFifth));
    expect(centsDiff).toBeLessThan(6);
  });

  it("31-EDO major third (10 steps) ≈ 5/4 ratio", () => {
    const third = absToFreq(10, 31);
    const justThird = C4_FREQ * 1.25;
    const centsDiff = Math.abs(1200 * Math.log2(third / justThird));
    expect(centsDiff).toBeLessThan(1.5);
  });

  it("41-EDO perfect fifth (24 steps) ≈ 3/2 ratio", () => {
    const fifth = absToFreq(24, 41);
    const justFifth = C4_FREQ * 1.5;
    const centsDiff = Math.abs(1200 * Math.log2(fifth / justFifth));
    expect(centsDiff).toBeLessThan(1);
  });

  it("all frequencies are positive for wide range", () => {
    for (const edo of [12, 31, 41, 53]) {
      for (let a = -edo * 4; a <= edo * 4; a += edo) {
        expect(absToFreq(a, edo)).toBeGreaterThan(0);
      }
    }
  });
});

// ── Equal-loudness compensation ─────────────────────────────────────

describe("elBoost (Fletcher-Munson approximation)", () => {
  it("returns 1.0 for all abs >= 0 (at or above C4)", () => {
    for (const edo of [12, 31, 41]) {
      for (let a = 0; a <= edo * 3; a++) {
        expect(elBoost(a, edo)).toBe(1);
      }
    }
  });

  it("returns > 1.0 for notes below C4", () => {
    for (const edo of [12, 31, 41]) {
      for (let a = -1; a >= -edo * 3; a--) {
        expect(elBoost(a, edo)).toBeGreaterThan(1);
      }
    }
  });

  it("increases monotonically as pitch goes lower", () => {
    for (const edo of [12, 31]) {
      for (let a = -1; a > -edo * 3; a--) {
        expect(elBoost(a - 1, edo)).toBeGreaterThanOrEqual(elBoost(a, edo));
      }
    }
  });

  it("is capped at 4 (hard ceiling)", () => {
    for (const edo of [12, 31, 41]) {
      expect(elBoost(-edo * 100, edo)).toBe(4);
    }
  });

  it("boosts ~1.41x (≈3 dB) per octave below C4", () => {
    const boost1oct = elBoost(-31, 31); // 1 octave below in 31-EDO
    expect(boost1oct).toBeCloseTo(1.41, 1);
    const boost2oct = elBoost(-62, 31); // 2 octaves below
    expect(boost2oct).toBeCloseTo(1.41 ** 2, 1);
  });
});

describe("elBoostRatio", () => {
  it("returns 1.0 for ratios >= 1", () => {
    expect(elBoostRatio(1)).toBe(1);
    expect(elBoostRatio(2)).toBe(1);
    expect(elBoostRatio(100)).toBe(1);
  });

  it("returns > 1 for ratios < 1", () => {
    expect(elBoostRatio(0.5)).toBeGreaterThan(1);
    expect(elBoostRatio(0.25)).toBeGreaterThan(1);
  });

  it("is capped at 4", () => {
    expect(elBoostRatio(0.0001)).toBe(4);
  });

  it("matches elBoost for equivalent positions", () => {
    // ratio 0.5 = 1 octave below C4, same as abs=-EDO
    const ratioBoost = elBoostRatio(0.5);
    const absBoost = elBoost(-31, 31);
    expect(ratioBoost).toBeCloseTo(absBoost, 5);
  });
});

// ── Gain scaling in playChord ────────────────────────────────────────

describe("chord gain scaling", () => {
  // Reproduces: g = gain / Math.sqrt(notes.length)
  function chordGain(gain: number, noteCount: number): number {
    return gain / Math.sqrt(noteCount);
  }

  it("scales inversely with sqrt(note count)", () => {
    const base = 0.65;
    expect(chordGain(base, 1)).toBeCloseTo(0.65, 5);
    expect(chordGain(base, 4)).toBeCloseTo(0.325, 3);
    expect(chordGain(base, 9)).toBeCloseTo(0.65 / 3, 3);
  });

  it("never exceeds original gain", () => {
    for (let n = 1; n <= 20; n++) {
      expect(chordGain(0.7, n)).toBeLessThanOrEqual(0.7);
    }
  });

  it("stays positive for any note count", () => {
    for (let n = 1; n <= 100; n++) {
      expect(chordGain(0.65, n)).toBeGreaterThan(0);
    }
  });

  it("total power roughly constant across chord sizes", () => {
    // Sum of squared gains ≈ constant (energy conservation)
    const base = 0.7;
    for (let n = 1; n <= 12; n++) {
      const g = chordGain(base, n);
      const totalPower = n * g * g;
      expect(totalPower).toBeCloseTo(base * base, 3);
    }
  });
});

// ── Sequence timing ─────────────────────────────────────────────────

describe("playSequence timing math", () => {
  it("computes correct onset times for sequential frames", () => {
    const gapMs = 700;
    const gap = gapMs / 1000;
    const startTime = 0.05;
    const frames = [[0], [5], [10], [18]]; // 4 frames
    const expectedOnsets = frames.map((_, i) => startTime + i * gap);
    expectedOnsets.forEach((onset, i) => {
      expect(onset).toBeCloseTo([0.05, 0.75, 1.45, 2.15][i], 10);
    });
  });

  it("total sequence duration = (n-1)*gap + noteDuration + tail", () => {
    const n = 8;
    const gap = 0.7;
    const noteDuration = 0.9;
    const total = (n - 1) * gap + noteDuration;
    expect(total).toBeCloseTo(5.8, 5);
  });
});

// ── playMultiVoice subdivision math ─────────────────────────────────

describe("playMultiVoice subdivision", () => {
  function computeSubdivOnsets(
    voiceFrameCount: number,
    chordCount: number,
    gapMs: number
  ): number[] {
    const gap = gapMs / 1000;
    const t0 = 0.05;
    const subdivs = Math.max(1, Math.ceil(voiceFrameCount / chordCount));
    const subGap = gap / subdivs;
    const onsets: number[] = [];
    let t = t0;
    for (let i = 0; i < voiceFrameCount; i++) {
      onsets.push(t);
      t += subGap;
      if ((i + 1) % subdivs === 0) {
        const slotIdx = Math.floor((i + 1) / subdivs);
        t = t0 + slotIdx * gap;
      }
    }
    return onsets;
  }

  it("1:1 ratio — no subdivision", () => {
    const onsets = computeSubdivOnsets(4, 4, 1000);
    expect(onsets.length).toBe(4);
    expect(onsets[1] - onsets[0]).toBeCloseTo(1, 5);
  });

  it("2:1 ratio — each chord slot gets 2 subdivisions", () => {
    const onsets = computeSubdivOnsets(8, 4, 1000);
    expect(onsets.length).toBe(8);
    // Within first slot: two notes 0.5s apart
    expect(onsets[1] - onsets[0]).toBeCloseTo(0.5, 5);
    // Slot boundary: second slot starts at t0+1*gap
    expect(onsets[2]).toBeCloseTo(0.05 + 1, 5);
  });

  it("3:1 ratio — 3 subdivisions per slot", () => {
    const onsets = computeSubdivOnsets(12, 4, 900);
    expect(onsets.length).toBe(12);
    const subGap = 0.9 / 3;
    expect(onsets[1] - onsets[0]).toBeCloseTo(subGap, 5);
  });
});

// ── TAMBURA harmonic spectrum ───────────────────────────────────────

describe("tambura harmonic spectrum", () => {
  const TAMBURA_REAL = [0, 1.00, 0.55, 0.30, 0.16, 0.09, 0.05, 0.030, 0.015, 0.008, 0.004];

  it("has 11 elements (DC + 10 harmonics)", () => {
    expect(TAMBURA_REAL.length).toBe(11);
  });

  it("DC component is 0", () => {
    expect(TAMBURA_REAL[0]).toBe(0);
  });

  it("fundamental is the strongest harmonic", () => {
    for (let h = 2; h < TAMBURA_REAL.length; h++) {
      expect(TAMBURA_REAL[1]).toBeGreaterThan(TAMBURA_REAL[h]);
    }
  });

  it("harmonics decay monotonically", () => {
    for (let h = 2; h < TAMBURA_REAL.length; h++) {
      expect(TAMBURA_REAL[h]).toBeLessThanOrEqual(TAMBURA_REAL[h - 1]);
    }
  });

  it("each harmonic is roughly 55% of the previous", () => {
    for (let h = 2; h <= 5; h++) {
      const ratio = TAMBURA_REAL[h] / TAMBURA_REAL[h - 1];
      expect(ratio).toBeCloseTo(0.55, 0.1);
    }
  });

  it("all values are non-negative", () => {
    TAMBURA_REAL.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
  });
});

// ── startRatioDrone harmonic frequencies ─────────────────────────────

describe("ratio drone harmonic calculation", () => {
  it("produces correct harmonic series for a given ratio", () => {
    const ratio = 1.5; // perfect fifth
    const baseFreq = C4_FREQ;
    const fundamentalFreq = baseFreq * ratio;
    for (let h = 1; h <= 10; h++) {
      const harmonicFreq = fundamentalFreq * h;
      expect(harmonicFreq).toBeCloseTo(C4_FREQ * 1.5 * h, 2);
    }
  });

  it("drone with ratio=1 produces C4 harmonic series", () => {
    const ratio = 1;
    const base = C4_FREQ * ratio;
    expect(base).toBeCloseTo(261.63, 2);
    expect(base * 2).toBeCloseTo(523.26, 2); // octave
    expect(base * 3).toBeCloseTo(784.89, 2); // twelfth
  });
});
