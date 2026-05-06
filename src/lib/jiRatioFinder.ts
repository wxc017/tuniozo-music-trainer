// JI ratio finder.  Given a target ratio (linear, e.g. 1.5 for a perfect
// fifth), search for the simplest integer ratio n/d that approximates it
// within `toleranceCents`, subject to a max prime limit and Tenney height
// ceiling.  Returns null if nothing in the search space fits.
//
// The search runs on every drag tick of the Drone Continuum strip, so
// keep it cheap.  Tenney height ≤ 200 with prime limit 13 yields a tiny
// candidate set (≤ ~200 (n,d) pairs) — well under 1 ms in practice.

export interface JiRatioMatch {
  num: number;
  den: number;
  cents: number;       // cents of n/d above 1/1
  driftCents: number;  // signed cents (target − n/d), positive = target sharper
}

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31];

function maxPrimeOf(n: number): number {
  let m = 1;
  let x = n;
  for (const p of PRIMES) {
    while (x % p === 0) { x = x / p; if (p > m) m = p; }
    if (x === 1) return m;
  }
  return Infinity;  // residual factor outside our prime list
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function findJiRatio(
  targetRatio: number,
  primeLimit = 13,
  maxTenney = 200,
  toleranceCents = 5,
): JiRatioMatch | null {
  if (!isFinite(targetRatio) || targetRatio <= 0) return null;
  const targetCents = 1200 * Math.log2(targetRatio);
  const tolFactor = Math.pow(2, toleranceCents / 1200);

  let best: JiRatioMatch | null = null;
  let bestScore = Infinity;

  for (let d = 1; d <= maxTenney; d++) {
    if (maxPrimeOf(d) > primeLimit) continue;
    const nIdeal = d * targetRatio;
    const nLow  = Math.max(1, Math.floor(nIdeal / tolFactor));
    const nHigh = Math.ceil(nIdeal * tolFactor);
    if (nLow * d > maxTenney) continue;
    for (let n = nLow; n <= nHigh; n++) {
      if (n * d > maxTenney) break;
      if (gcd(n, d) !== 1) continue;
      if (maxPrimeOf(n) > primeLimit) continue;
      const ratioCents = 1200 * Math.log2(n / d);
      const drift = targetCents - ratioCents;
      if (Math.abs(drift) > toleranceCents) continue;
      // Score = Tenney height (log) + small drift penalty.  Prefer the
      // simplest ratio within tolerance; break ties by accuracy.
      const score = Math.log2(n * d) + Math.abs(drift) / 50;
      if (score < bestScore) {
        bestScore = score;
        best = { num: n, den: d, cents: ratioCents, driftCents: drift };
      }
    }
  }
  return best;
}

/** Format a JiRatioMatch for display, e.g. "5/4 +3¢" or "5/4". */
export function formatJiRatio(m: JiRatioMatch, showDriftBelow = 1): string {
  const base = `${m.num}/${m.den}`;
  if (Math.abs(m.driftCents) < showDriftBelow) return base;
  const sign = m.driftCents >= 0 ? "+" : "−";
  return `${base} ${sign}${Math.abs(m.driftCents).toFixed(1)}¢`;
}
