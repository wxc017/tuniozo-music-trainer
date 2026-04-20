// circleMapEngine.ts
// Pure TypeScript math engine for circle map dynamical systems applied to rhythm.
// No framework imports. All functions are deterministic and purely functional.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CircleMapParams {
  omega: number;    // Ω ∈ [0, 1)
  K: number;        // coupling strength >= 0
}

export interface OrbitPoint {
  n: number;        // iteration index
  theta: number;    // θ mod 1 (on the circle)
  thetaUnwrapped: number; // Θ (cumulative, not mod 1)
}

export interface BifurcationPoint {
  paramValue: number;   // the swept parameter value
  theta: number;        // attractor point on the circle
}

export interface ArnoldTongueCell {
  omega: number;
  K: number;
  rho: number;          // rotation number
  period: number;       // detected period (0 if quasiperiodic)
  isLocked: boolean;    // true if ρ is rational (within tolerance)
}

export interface RhythmOnset {
  time: number;         // onset time in beats
  velocity: number;     // accent strength (0-1)
}

export interface DevilsStaircaseDatum {
  omega: number;
  rho: number;
}

export interface LyapunovDatum {
  paramValue: number;
  lyapunov: number;     // positive = chaotic, negative = stable
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TWO_PI = 2 * Math.PI;

// ---------------------------------------------------------------------------
// Core iteration
// ---------------------------------------------------------------------------

/**
 * Single circle map iteration (mod 1).
 * θ_{n+1} = (θ + Ω - (K/(2π))·sin(2πθ))  mod 1
 * Result is guaranteed in [0, 1).
 */
export function circleMapStep(theta: number, omega: number, K: number): number {
  const raw = theta + omega - (K / TWO_PI) * Math.sin(TWO_PI * theta);
  return ((raw % 1) + 1) % 1;
}

/**
 * Single circle map iteration WITHOUT mod 1 (for computing rotation number).
 */
export function circleMapStepUnwrapped(theta: number, omega: number, K: number): number {
  return theta + omega - (K / TWO_PI) * Math.sin(TWO_PI * theta);
}

// ---------------------------------------------------------------------------
// Orbit generation
// ---------------------------------------------------------------------------

/**
 * Iterate the circle map n times from theta0 (default 0.1).
 * Returns the full orbit with both wrapped and unwrapped values.
 */
export function iterateOrbit(
  params: CircleMapParams,
  n: number,
  theta0: number = 0.1,
): OrbitPoint[] {
  const { omega, K } = params;
  const orbit: OrbitPoint[] = new Array(n + 1);
  let thetaU = theta0;

  orbit[0] = {
    n: 0,
    theta: ((theta0 % 1) + 1) % 1,
    thetaUnwrapped: theta0,
  };

  for (let i = 1; i <= n; i++) {
    thetaU = circleMapStepUnwrapped(thetaU, omega, K);
    orbit[i] = {
      n: i,
      theta: ((thetaU % 1) + 1) % 1,
      thetaUnwrapped: thetaU,
    };
  }

  return orbit;
}

// ---------------------------------------------------------------------------
// Rotation number
// ---------------------------------------------------------------------------

/**
 * Compute the rotation number ρ.
 * Discards the first `transient` iterations, then measures net winding.
 */
export function rotationNumber(
  params: CircleMapParams,
  iterations: number = 5000,
  transient: number = 1000,
): number {
  const { omega, K } = params;

  // Special case: K = 0 means pure rotation, ρ = Ω exactly
  if (K === 0) return omega;

  let thetaU = 0.1;

  // Burn through transient
  for (let i = 0; i < transient; i++) {
    thetaU = circleMapStepUnwrapped(thetaU, omega, K);
  }

  const thetaTransient = thetaU;

  // Iterate the measurement window
  const count = iterations - transient;
  for (let i = 0; i < count; i++) {
    thetaU = circleMapStepUnwrapped(thetaU, omega, K);
  }

  return (thetaU - thetaTransient) / count;
}

// ---------------------------------------------------------------------------
// Period detection
// ---------------------------------------------------------------------------

/**
 * Detect if the orbit is periodic. Returns the smallest period p (1..100),
 * or 0 if no period found (quasiperiodic / chaotic).
 */
export function detectPeriod(
  params: CircleMapParams,
  iterations: number = 500,
  transient: number = 1000,
  tolerance: number = 1e-6,
): number {
  const { omega, K } = params;

  let theta = 0.1;

  // Burn through transient (using wrapped values)
  for (let i = 0; i < transient; i++) {
    theta = circleMapStep(theta, omega, K);
  }

  // Record the next `iterations` wrapped θ values
  const buf = new Float64Array(iterations);
  for (let i = 0; i < iterations; i++) {
    theta = circleMapStep(theta, omega, K);
    buf[i] = theta;
  }

  // Check candidate periods p = 1 .. 100
  const maxP = Math.min(100, iterations >> 1);
  for (let p = 1; p <= maxP; p++) {
    let match = true;
    // Verify the period holds for a good stretch of the recorded orbit
    const checkLen = Math.min(iterations - p, 200);
    for (let i = 0; i < checkLen; i++) {
      // Distance on the circle (handles wrap-around)
      let diff = Math.abs(buf[i] - buf[i + p]);
      if (diff > 0.5) diff = 1 - diff;
      if (diff > tolerance) {
        match = false;
        break;
      }
    }
    if (match) return p;
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Bifurcation diagram
// ---------------------------------------------------------------------------

/**
 * Sweep one parameter while holding the other fixed.
 * Returns (paramValue, θ) pairs suitable for scatter-plotting a bifurcation diagram.
 */
export function bifurcationData(
  sweepParam: "omega" | "K",
  fixedValue: number,
  min: number,
  max: number,
  steps: number,
  iterations: number = 300,
  transient: number = 500,
): BifurcationPoint[] {
  const plotPoints = 100;
  const result: BifurcationPoint[] = [];

  for (let s = 0; s < steps; s++) {
    const pv = min + (max - min) * (s / (steps - 1 || 1));
    const omega = sweepParam === "omega" ? pv : fixedValue;
    const K = sweepParam === "K" ? pv : fixedValue;

    let theta = 0.1;

    // Transient
    for (let i = 0; i < transient; i++) {
      theta = circleMapStep(theta, omega, K);
    }

    // Collect attractor points
    for (let i = 0; i < iterations; i++) {
      theta = circleMapStep(theta, omega, K);
      if (i >= iterations - plotPoints) {
        result.push({ paramValue: pv, theta });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Arnold tongue grid
// ---------------------------------------------------------------------------

/**
 * Compute rotation number over a 2D grid of (Ω, K).
 */
export function arnoldTongueGrid(
  omegaSteps: number = 200,
  kSteps: number = 200,
  kMax: number = 2,
  iterations: number = 300,
): ArnoldTongueCell[] {
  const transient = 200;
  const periodTolerance = 1e-5;
  const cells: ArnoldTongueCell[] = new Array(omegaSteps * kSteps);
  let idx = 0;

  for (let ki = 0; ki < kSteps; ki++) {
    const K = kMax * (ki / (kSteps - 1 || 1));

    for (let oi = 0; oi < omegaSteps; oi++) {
      const omega = oi / (omegaSteps - 1 || 1);

      // Compute rotation number (inline for performance)
      let thetaU = 0.1;
      for (let i = 0; i < transient; i++) {
        thetaU = thetaU + omega - (K / TWO_PI) * Math.sin(TWO_PI * thetaU);
      }
      const thetaStart = thetaU;
      for (let i = 0; i < iterations; i++) {
        thetaU = thetaU + omega - (K / TWO_PI) * Math.sin(TWO_PI * thetaU);
      }
      const rho = (thetaU - thetaStart) / iterations;

      // Quick period detection: check a few small periods
      let period = 0;
      if (K > 0) {
        let theta = 0.1;
        for (let i = 0; i < transient; i++) {
          theta = circleMapStep(theta, omega, K);
        }
        const ref = theta;
        for (let p = 1; p <= 30; p++) {
          theta = circleMapStep(theta, omega, K);
          let diff = Math.abs(theta - ref);
          if (diff > 0.5) diff = 1 - diff;
          if (diff < periodTolerance) {
            // Verify once more at 2p
            let theta2 = ref;
            for (let j = 0; j < 2 * p; j++) {
              theta2 = circleMapStep(theta2, omega, K);
            }
            let diff2 = Math.abs(theta2 - ref);
            if (diff2 > 0.5) diff2 = 1 - diff2;
            if (diff2 < periodTolerance) {
              period = p;
              break;
            }
          }
        }
      } else {
        // K=0: period exists only if omega is rational
        const [, q] = rationalApprox(omega, 50);
        if (Math.abs(omega - Math.round(omega * q) / q) < 1e-9) {
          period = q;
        }
      }

      cells[idx++] = {
        omega,
        K,
        rho,
        period,
        isLocked: period > 0,
      };
    }
  }

  return cells;
}

// ---------------------------------------------------------------------------
// Devil's staircase
// ---------------------------------------------------------------------------

/**
 * Sweep Ω from 0 to 1 at fixed K, compute ρ(Ω).
 * At K=1 this produces the classic devil's staircase.
 */
export function devilsStaircase(
  K: number,
  omegaSteps: number = 1000,
  iterations: number = 3000,
): DevilsStaircaseDatum[] {
  const transient = 500;
  const data: DevilsStaircaseDatum[] = new Array(omegaSteps);

  for (let i = 0; i < omegaSteps; i++) {
    const omega = i / (omegaSteps - 1 || 1);

    if (K === 0) {
      data[i] = { omega, rho: omega };
      continue;
    }

    let thetaU = 0.1;
    for (let j = 0; j < transient; j++) {
      thetaU = thetaU + omega - (K / TWO_PI) * Math.sin(TWO_PI * thetaU);
    }
    const thetaStart = thetaU;
    const count = iterations - transient;
    for (let j = 0; j < count; j++) {
      thetaU = thetaU + omega - (K / TWO_PI) * Math.sin(TWO_PI * thetaU);
    }

    data[i] = { omega, rho: (thetaU - thetaStart) / count };
  }

  return data;
}

// ---------------------------------------------------------------------------
// Lyapunov exponents
// ---------------------------------------------------------------------------

/**
 * Compute Lyapunov exponent along a parameter sweep.
 * λ = (1/N) Σ log|dF/dθ| where dF/dθ = 1 - K·cos(2πθ)
 */
export function lyapunovExponents(
  sweepParam: "omega" | "K",
  fixedValue: number,
  min: number,
  max: number,
  steps: number,
  iterations: number = 5000,
): LyapunovDatum[] {
  const transient = 500;
  const data: LyapunovDatum[] = new Array(steps);

  for (let s = 0; s < steps; s++) {
    const pv = min + (max - min) * (s / (steps - 1 || 1));
    const omega = sweepParam === "omega" ? pv : fixedValue;
    const K = sweepParam === "K" ? pv : fixedValue;

    let theta = 0.1;

    // Transient
    for (let i = 0; i < transient; i++) {
      theta = circleMapStep(theta, omega, K);
    }

    // Accumulate Lyapunov sum
    let sum = 0;
    const count = iterations - transient;
    for (let i = 0; i < count; i++) {
      const derivative = Math.abs(1 - K * Math.cos(TWO_PI * theta));
      // Clamp to avoid log(0)
      sum += Math.log(Math.max(derivative, 1e-300));
      theta = circleMapStep(theta, omega, K);
    }

    data[s] = { paramValue: pv, lyapunov: sum / count };
  }

  return data;
}

// ---------------------------------------------------------------------------
// Orbit to rhythm conversion
// ---------------------------------------------------------------------------

/**
 * Convert a circle map orbit to a rhythm pattern.
 * Each orbit point maps to a time position with accent based on proximity to θ=0.
 */
export function orbitToRhythm(
  orbit: OrbitPoint[],
  beatsPerCycle: number,
): RhythmOnset[] {
  return orbit.map((pt) => ({
    time: pt.n * (1 / beatsPerCycle),
    velocity: 0.5 + 0.5 * Math.cos(TWO_PI * pt.theta),
  }));
}

// ---------------------------------------------------------------------------
// Rational approximation (continued fractions / Stern-Brocot mediant)
// ---------------------------------------------------------------------------

/**
 * Find best rational approximation p/q to x with q <= maxDenom.
 * Uses the continued fraction / mediant algorithm.
 */
export function rationalApprox(x: number, maxDenom: number): [number, number] {
  // Handle negative and > 1 by working with fractional part
  // but keep it general.
  if (maxDenom < 1) return [Math.round(x), 1];

  // Stern-Brocot / mediants approach
  let aNum = 0, aDen = 1; // lower bound a = 0/1
  let bNum = 1, bDen = 1; // upper bound b = 1/1

  // Handle values outside [0,1]
  const intPart = Math.floor(x);
  const frac = x - intPart;

  let bestP = Math.round(x);
  let bestQ = 1;
  let bestErr = Math.abs(x - bestP);

  // Reset bounds for fractional part
  aNum = 0; aDen = 1;
  bNum = 1; bDen = 1;

  // Use continued fraction convergents for the fractional part
  const val = frac;

  // Continued fraction approach
  let p0 = 0, q0 = 1; // convergent h_{-1}/k_{-1}
  let p1 = 1, q1 = 0; // convergent h_{-2}/k_{-2} (convention)

  // Actually use standard continued fraction convergent algorithm
  let rem = val;

  for (let iter = 0; iter < 100; iter++) {
    if (rem < 1e-15) break;

    const a = Math.floor(rem);
    const p2 = a * p0 + p1;
    const q2 = a * q0 + q1;

    if (q2 > maxDenom) {
      // Try the largest multiple of a that keeps q <= maxDenom
      const maxMult = Math.floor((maxDenom - q1) / q0);
      if (maxMult >= 1) {
        const pCand = maxMult * p0 + p1;
        const qCand = maxMult * q0 + q1;
        const err = Math.abs(x - (pCand + intPart * qCand) / qCand);
        if (err < bestErr) {
          bestP = pCand + intPart * qCand;
          bestQ = qCand;
          bestErr = err;
        }
      }
      break;
    }

    const err = Math.abs(val - p2 / q2);
    const fullP = p2 + intPart * q2;
    const fullErr = Math.abs(x - fullP / q2);
    if (fullErr < bestErr) {
      bestP = fullP;
      bestQ = q2;
      bestErr = fullErr;
    }

    p1 = p0; q1 = q0;
    p0 = p2; q0 = q2;

    if (Math.abs(rem - a) < 1e-15) break;
    rem = 1 / (rem - a);
    if (rem > 1e12) break; // numerical safety
  }

  return [bestP, bestQ];
}

// ---------------------------------------------------------------------------
// Format rotation number
// ---------------------------------------------------------------------------

/**
 * Format ρ as "p/q" if close to rational, otherwise as decimal.
 */
export function formatRotationNumber(rho: number, maxDenom: number = 50): string {
  const [p, q] = rationalApprox(rho, maxDenom);
  if (q > 0 && Math.abs(rho - p / q) < 1e-4) {
    return `${p}/${q}`;
  }
  return rho.toFixed(6);
}

// ---------------------------------------------------------------------------
// Musical presets
// ---------------------------------------------------------------------------

export const RHYTHM_PRESETS: {
  name: string;
  omega: number;
  K: number;
  description: string;
}[] = [
  {
    name: "Polyrhythm 3:4",
    omega: 3 / 4,
    K: 0,
    description: "Pure 3-against-4. No coupling — never synchronizes.",
  },
  {
    name: "Polyrhythm 3:4 (entrained)",
    omega: 3 / 4,
    K: 0.8,
    description: "3:4 with strong coupling. Locks to 3/4.",
  },
  {
    name: "Swing feel",
    omega: 0.667,
    K: 0.3,
    description: "Slight asymmetry from 2/3 mode-locking.",
  },
  {
    name: "Aksak 7/8",
    omega: 7 / 8,
    K: 0.5,
    description: "Balkan-style uneven meter from near-integer coupling.",
  },
  {
    name: "Golden ratio",
    omega: 0.6180339887,
    K: 0,
    description: "φ-1: maximally irrational, never mode-locks at any K<1.",
  },
  {
    name: "Golden (critical)",
    omega: 0.6180339887,
    K: 1.0,
    description: "Golden ratio at critical coupling. On the edge of chaos.",
  },
  {
    name: "Chaos onset",
    omega: 0.5,
    K: 1.5,
    description: "Past critical coupling — chaotic orbit.",
  },
  {
    name: "Phase-locked unison",
    omega: 0.01,
    K: 0.8,
    description: "Near-unison coupling: complete entrainment.",
  },
  {
    name: "Quintuple feel",
    omega: 0.4,
    K: 0.6,
    description: "2/5 mode-locking: quintuplet pattern.",
  },
  {
    name: "Steve Reich drift",
    omega: 0.501,
    K: 0.0,
    description: "Almost-unison: very slow phase drift (Piano Phase).",
  },
];
