// consonanceEngine.ts
// Pure TypeScript math engine for psychoacoustic consonance and roughness calculations.
// No framework dependencies. All functions are purely functional.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoughnessDatum {
  ratio: number;
  cents: number;
  roughness: number;
}

export interface EntropyCurveDatum {
  cents: number;
  entropy: number;
}

export interface ConsonanceProfile {
  roughnessCurve: RoughnessDatum[];
  entropyCurve: EntropyCurveDatum[];
}

export interface ChordConsonance {
  totalRoughness: number;
  pairwiseRoughness: { i: number; j: number; roughness: number }[];
  meanEntropy: number;
}

export interface SpectrumConfig {
  numHarmonics: number;
  amplitudes: number[];
  rolloff?: "natural" | "saw" | "square" | "custom";
}

// ---------------------------------------------------------------------------
// Landmarks
// ---------------------------------------------------------------------------

export const CONSONANCE_LANDMARKS = [
  { ratio: 1, name: "Unison (1/1)" },
  { ratio: 16 / 15, name: "Minor 2nd (16/15)" },
  { ratio: 9 / 8, name: "Major 2nd (9/8)" },
  { ratio: 6 / 5, name: "Minor 3rd (6/5)" },
  { ratio: 5 / 4, name: "Major 3rd (5/4)" },
  { ratio: 4 / 3, name: "Perfect 4th (4/3)" },
  { ratio: 7 / 5, name: "Tritone (7/5)" },
  { ratio: 3 / 2, name: "Perfect 5th (3/2)" },
  { ratio: 8 / 5, name: "Minor 6th (8/5)" },
  { ratio: 5 / 3, name: "Major 6th (5/3)" },
  { ratio: 7 / 4, name: "Harmonic 7th (7/4)" },
  { ratio: 15 / 8, name: "Major 7th (15/8)" },
  { ratio: 2, name: "Octave (2/1)" },
] as const;

// ---------------------------------------------------------------------------
// Utility conversions
// ---------------------------------------------------------------------------

/** Convert a frequency ratio to cents. */
export function ratioToCents(ratio: number): number {
  return 1200 * Math.log2(ratio);
}

/** Convert cents to a frequency ratio. */
export function centsToRatio(cents: number): number {
  return Math.pow(2, cents / 1200);
}

// ---------------------------------------------------------------------------
// GCD (for Tenney Height)
// ---------------------------------------------------------------------------

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

// ---------------------------------------------------------------------------
// 1. Plomp-Levelt Roughness (1965)
// ---------------------------------------------------------------------------

/**
 * Plomp-Levelt roughness for two pure (sinusoidal) tones.
 *
 * Returns 0 at unison, peaks near s ≈ 0.6 (roughly a minor second in
 * mid-range), and decays to 0 for wide intervals.
 */
export function plompLevelt(f1: number, f2: number): number {
  // Ensure f1 <= f2
  if (f1 > f2) {
    const tmp = f1;
    f1 = f2;
    f2 = tmp;
  }

  const diff = f2 - f1;

  // Identical frequencies: roughness is exactly 0
  if (diff === 0) return 0;

  const s = 0.24 * diff / (0.021 * f1 + 19);

  const r = Math.exp(-3.5 * s) - Math.exp(-5.75 * s);

  // Clamp to non-negative (numerical noise for very wide intervals)
  return Math.max(0, r);
}

// ---------------------------------------------------------------------------
// 2. Default Spectrum Configurations
// ---------------------------------------------------------------------------

/**
 * Build a SpectrumConfig for common waveform types.
 *
 * - "natural": 1/n amplitude rolloff, 8 harmonics
 * - "saw":     1/n for all harmonics (default 12)
 * - "square":  odd harmonics only, 1/n
 * - "sine":    single partial (fundamental only)
 */
export function defaultSpectrum(
  type: "natural" | "saw" | "square" | "sine",
  numHarmonics?: number,
): SpectrumConfig {
  switch (type) {
    case "sine":
      return {
        numHarmonics: 1,
        amplitudes: [1],
        rolloff: "natural",
      };

    case "natural": {
      const n = numHarmonics ?? 8;
      const amps: number[] = [];
      for (let h = 1; h <= n; h++) {
        amps.push(1 / h);
      }
      return { numHarmonics: n, amplitudes: amps, rolloff: "natural" };
    }

    case "saw": {
      const n = numHarmonics ?? 12;
      const amps: number[] = [];
      for (let h = 1; h <= n; h++) {
        amps.push(1 / h);
      }
      return { numHarmonics: n, amplitudes: amps, rolloff: "saw" };
    }

    case "square": {
      // Odd harmonics only; even harmonics get amplitude 0.
      const n = numHarmonics ?? 12;
      const amps: number[] = [];
      for (let h = 1; h <= n; h++) {
        amps.push(h % 2 === 1 ? 1 / h : 0);
      }
      return { numHarmonics: n, amplitudes: amps, rolloff: "square" };
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Dyad Roughness (complex tones)
// ---------------------------------------------------------------------------

/**
 * Total Plomp-Levelt roughness for an interval between two complex tones,
 * each built from the given spectrum.
 *
 * Only between-tone partial pairs are summed (not within-tone).
 */
export function dyadRoughness(
  ratio: number,
  baseFreq: number,
  spectrum: SpectrumConfig,
): number {
  const { numHarmonics, amplitudes } = spectrum;

  // Pre-compute partials for tone 1 and tone 2
  const freq1: number[] = [];
  const amp1: number[] = [];
  const freq2: number[] = [];
  const amp2: number[] = [];

  for (let h = 1; h <= numHarmonics; h++) {
    const a = amplitudes[h - 1] ?? 0;
    if (a === 0) continue; // skip silent partials (e.g. even harmonics of square)

    freq1.push(baseFreq * h);
    amp1.push(a);

    freq2.push(baseFreq * ratio * h);
    amp2.push(a);
  }

  let total = 0;
  for (let i = 0; i < freq1.length; i++) {
    for (let j = 0; j < freq2.length; j++) {
      total += amp1[i] * amp2[j] * plompLevelt(freq1[i], freq2[j]);
    }
  }

  return total;
}

// ---------------------------------------------------------------------------
// 4. Roughness Curve
// ---------------------------------------------------------------------------

/**
 * Sweep the frequency ratio from minRatio to maxRatio and compute
 * Plomp-Levelt roughness at each step.
 */
export function roughnessCurve(
  baseFreq: number,
  spectrum: SpectrumConfig,
  minRatio: number,
  maxRatio: number,
  steps: number,
): RoughnessDatum[] {
  const result: RoughnessDatum[] = [];
  const step = (maxRatio - minRatio) / Math.max(steps - 1, 1);

  for (let i = 0; i < steps; i++) {
    const ratio = minRatio + i * step;
    const roughness = dyadRoughness(ratio, baseFreq, spectrum);
    const cents = ratioToCents(ratio);
    result.push({ ratio, cents, roughness });
  }

  return result;
}

// ---------------------------------------------------------------------------
// 5. Harmonic Entropy (Paul Erlich)
// ---------------------------------------------------------------------------

interface RatioEntry {
  p: number;
  q: number;
  cents: number;
  weight_base: number; // 1 / (p * q)
}

/**
 * Build the list of simple ratios p/q within [1, 2] with q <= maxDenom, p <= maxDenom.
 * This is factored out so it can be reused across multiple calls.
 */
function buildRatioList(maxDenom: number): RatioEntry[] {
  const entries: RatioEntry[] = [];
  for (let q = 1; q <= maxDenom; q++) {
    for (let p = q; p <= maxDenom; p++) {
      const r = p / q;
      if (r < 1 || r > 2) continue;

      // Ensure p/q is in lowest terms
      if (gcd(p, q) !== 1) continue;

      entries.push({
        p,
        q,
        cents: 1200 * Math.log2(r),
        weight_base: 1 / (p * q),
      });
    }
  }
  return entries;
}

/**
 * Compute Erlich harmonic entropy at a given interval (in cents).
 *
 * Low entropy = strong identification with a simple ratio = consonant.
 * High entropy = ambiguous = dissonant.
 *
 * @param cents     Interval size in cents
 * @param sigma     Hearing resolution in cents (default 12)
 * @param maxDenom  Maximum denominator for ratio search (default 100)
 */
export function harmonicEntropy(
  cents: number,
  sigma: number = 12,
  maxDenom: number = 100,
): number {
  const ratios = buildRatioList(maxDenom);
  return _harmonicEntropyFromList(cents, sigma, ratios);
}

/**
 * Internal: compute entropy using a pre-built ratio list.
 */
function _harmonicEntropyFromList(
  cents: number,
  sigma: number,
  ratios: RatioEntry[],
): number {
  const twoSigmaSq = 2 * sigma * sigma;
  let sumWeights = 0;
  const weights: number[] = new Array(ratios.length);

  for (let i = 0; i < ratios.length; i++) {
    const diff = cents - ratios[i].cents;
    const w = ratios[i].weight_base * Math.exp(-(diff * diff) / twoSigmaSq);
    weights[i] = w;
    sumWeights += w;
  }

  // If all weights are effectively zero, return 0 (degenerate case)
  if (sumWeights === 0) return 0;

  let entropy = 0;
  for (let i = 0; i < weights.length; i++) {
    const prob = weights[i] / sumWeights;
    if (prob > 0) {
      entropy -= prob * Math.log2(prob);
    }
  }

  return entropy;
}

// ---------------------------------------------------------------------------
// 6. Harmonic Entropy Curve
// ---------------------------------------------------------------------------

/**
 * Sweep from minCents to maxCents and compute harmonic entropy at each step.
 * The ratio list is pre-computed once and reused for all points.
 */
export function harmonicEntropyCurve(
  minCents: number,
  maxCents: number,
  steps: number,
  sigma: number = 12,
  maxDenom: number = 100,
): EntropyCurveDatum[] {
  const ratios = buildRatioList(maxDenom);
  const result: EntropyCurveDatum[] = [];
  const step = (maxCents - minCents) / Math.max(steps - 1, 1);

  for (let i = 0; i < steps; i++) {
    const cents = minCents + i * step;
    const entropy = _harmonicEntropyFromList(cents, sigma, ratios);
    result.push({ cents, entropy });
  }

  return result;
}

// ---------------------------------------------------------------------------
// 7. Chord Roughness
// ---------------------------------------------------------------------------

/**
 * Compute consonance metrics for a chord given as frequency ratios
 * relative to the root (e.g. [1, 5/4, 3/2] for a major triad).
 *
 * Returns total roughness (sum of all pairwise), per-pair roughness,
 * and mean harmonic entropy across all pairwise intervals.
 */
export function chordRoughness(
  ratios: number[],
  baseFreq: number,
  spectrum: SpectrumConfig,
): ChordConsonance {
  const pairwise: { i: number; j: number; roughness: number }[] = [];
  let totalRoughness = 0;
  let entropySum = 0;
  let pairCount = 0;

  for (let i = 0; i < ratios.length; i++) {
    for (let j = i + 1; j < ratios.length; j++) {
      // The interval between note i and note j
      const intervalRatio = ratios[j] / ratios[i];

      // Roughness: note i is at baseFreq * ratios[i], and note j
      // is at baseFreq * ratios[j]. We compute dyad roughness with
      // the lower note as the base.
      const lowerFreq = baseFreq * ratios[i];
      const r = dyadRoughness(intervalRatio, lowerFreq, spectrum);

      pairwise.push({ i, j, roughness: r });
      totalRoughness += r;

      // Harmonic entropy for the pairwise interval
      const intervalCents = ratioToCents(intervalRatio);
      entropySum += harmonicEntropy(intervalCents);
      pairCount++;
    }
  }

  const meanEntropy = pairCount > 0 ? entropySum / pairCount : 0;

  return { totalRoughness, pairwiseRoughness: pairwise, meanEntropy };
}

// ---------------------------------------------------------------------------
// 8. Tenney Height
// ---------------------------------------------------------------------------

/**
 * Tenney Height for ratio n/d (in lowest terms).
 * Lower values = simpler = more consonant.
 */
export function tenneyHeight(n: number, d: number): number {
  const g = gcd(n, d);
  const nr = n / g;
  const dr = d / g;
  return Math.log2(nr * dr);
}

// ---------------------------------------------------------------------------
// Re-export convenience: ConsonanceProfile builder
// ---------------------------------------------------------------------------

/**
 * Build a full ConsonanceProfile (roughness + entropy curves) for a given
 * spectrum and frequency range.
 */
export function buildConsonanceProfile(
  baseFreq: number,
  spectrum: SpectrumConfig,
  minRatio: number = 1,
  maxRatio: number = 2,
  steps: number = 600,
  sigma: number = 12,
  maxDenom: number = 100,
): ConsonanceProfile {
  const rc = roughnessCurve(baseFreq, spectrum, minRatio, maxRatio, steps);
  const minCents = ratioToCents(minRatio);
  const maxCents = ratioToCents(maxRatio);
  const ec = harmonicEntropyCurve(minCents, maxCents, steps, sigma, maxDenom);

  return { roughnessCurve: rc, entropyCurve: ec };
}
