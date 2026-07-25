// ── Shared voice pitch detection ────────────────────────────────────
// Real-time monophonic pitch detection (McLeod Pitch Method / NSDF) plus the
// small helpers the trainers share.  Used by PitchTrainer (single-note guide)
// and EchoTrainer (call-and-response).

export const C4_FREQ = 261.63;
export const FMIN = 70, FMAX = 1200;   // vocal range we search
export const RMS_GATE = 0.007;          // below this = silence
export const CLARITY_GATE = 0.7;        // NSDF peak below this = noise, not a clean voiced note

/** Median of a short window — smooths frame-to-frame jitter. */
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
}

/** Signed shortest distance a − b on the 1200-cent octave circle. */
export function circDelta(a: number, b: number): number {
  let d = a - b;
  if (d > 600) d -= 1200;
  if (d < -600) d += 1200;
  return d;
}

/** Undo octave / harmonic slips relative to the previous pitch: if some small
 *  harmonic ratio of `f` lands within ~60 cents of `prevF`, that ratio was a
 *  detection slip — return the corrected value.  A genuine new note is kept. */
export function correctOctave(f: number, prevF: number): number {
  if (!prevF) return f;
  const cands = [f, f * 2, f / 2, f * 3, f / 3, f * 1.5, f / 1.5, f * 4, f / 4];
  let best = f, bestD = Infinity;
  for (const c of cands) {
    const d = Math.abs(1200 * Math.log2(c / prevF));
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD < 60 ? best : f;
}

/** RMS of a time-domain buffer. */
export function rmsOf(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

/** McLeod Pitch Method — NSDF with a clarity measure so noise/silence can be
 *  gated out.  Returns { freq, clarity } (freq −1 if none found). */
export function detectPitch(buf: Float32Array, sampleRate: number, rms: number): { freq: number; clarity: number } {
  if (rms < RMS_GATE) return { freq: -1, clarity: 0 };
  const n = buf.length;
  const minLag = Math.floor(sampleRate / FMAX);
  const maxLag = Math.min(Math.floor(sampleRate / FMIN), n - 1);
  const nsdf = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let acf = 0, m = 0;
    for (let i = 0; i < n - tau; i++) {
      acf += buf[i] * buf[i + tau];
      m += buf[i] * buf[i] + buf[i + tau] * buf[i + tau];
    }
    nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
  }
  let pos = 1;
  while (pos <= maxLag && nsdf[pos] > 0) pos++;          // skip lag-0 central lobe
  let bestLag = -1, tallest = 0;
  const peaks: [number, number][] = [];
  while (pos <= maxLag) {
    while (pos <= maxLag && nsdf[pos] <= 0) pos++;
    if (pos > maxLag) break;
    let pl = pos, pv = nsdf[pos];
    while (pos <= maxLag && nsdf[pos] > 0) { if (nsdf[pos] > pv) { pv = nsdf[pos]; pl = pos; } pos++; }
    if (pl >= minLag) { peaks.push([pl, pv]); if (pv > tallest) tallest = pv; }
  }
  if (!peaks.length || tallest < CLARITY_GATE) return { freq: -1, clarity: tallest };
  const thresh = 0.9 * tallest;
  for (const [lag, val] of peaks) if (val >= thresh) { bestLag = lag; break; }
  if (bestLag < 1) return { freq: -1, clarity: tallest };
  const y1 = nsdf[bestLag - 1] ?? 0, y2 = nsdf[bestLag], y3 = nsdf[bestLag + 1] ?? 0;
  const denom = y1 + y3 - 2 * y2;
  const shift = denom ? (0.5 * (y1 - y3)) / denom : 0;
  return { freq: sampleRate / (bestLag + shift), clarity: tallest };
}

/** Cents-above-tonic (octave-reduced 0..1200) for a detected frequency. */
export function centsFromTonic(freq: number, rootCents: number): number {
  const tonicFreq = C4_FREQ * Math.pow(2, (rootCents - 1200) / 1200);
  const c = 1200 * Math.log2(freq / tonicFreq);
  return ((c % 1200) + 1200) % 1200;
}
