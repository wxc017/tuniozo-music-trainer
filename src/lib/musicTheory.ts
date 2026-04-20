// ── Multi-EDO Theory Engine ───────────────────────────────────────────
import {
  getDegreeMap, getDegreeMapMinor, getIntervalNames, getSolfege,
  getBaseChords, getChordDroneTypes, getExtLabelToSteps,
  getShellRanges, getPatternScaleMaps, getModeDegreeMap,
  getChordShapes,
} from "./edoData";

export {
  getDegreeMap, getDegreeMapMinor, getIntervalNames,
  getBaseChords, getChordDroneTypes, getExtLabelToSteps,
  getShellRanges, getPatternScaleMaps, getModeDegreeMap,
};

export const BASE_FREQ = 261.63; // C4

export const INTERVAL_NAMES_31 = [
  "Perfect Unison",
  "Super Unison / Uber Unison",
  "Subminor Second",
  "Minor Second",
  "Greater Neutral Second",
  "Major Second",
  "Supermajor Second",
  "Subminor Third",
  "Minor Third",
  "Greater Neutral Third",
  "Major Third",
  "Supermajor Third",
  "Sub Fourth",
  "Perfect Fourth",
  "Uber Fourth",
  "Augmented Fourth",
  "Diminished Fifth",
  "Unter Fifth",
  "Perfect Fifth",
  "Super Fifth",
  "Subminor Sixth",
  "Minor Sixth",
  "Greater Neutral Sixth",
  "Major Sixth",
  "Supermajor Sixth",
  "Subminor Seventh",
  "Minor Seventh",
  "Greater Neutral Seventh",
  "Major Seventh",
  "Supermajor Seventh",
  "Sub Octave / Unter Octave",
  "Perfect Octave",
];

export function getAllChordsForEdo(edo: number): [string, number[]][] {
  return getBaseChords(edo);
}

// ── Extensions ────────────────────────────────────────────────────────

export const EXTENSION_LABELS = ["2nd","4th","6th","7th","9th","11th","13th"];

// ── Voicings ──────────────────────────────────────────────────────────

export const VOICING_TYPES = [
  "Close","Open Triad","Drop-2","Drop-3","Drop-2&4",
  "Shell","Rootless","Spread","Quartal","Quintal"
];

// ── Fine-grained voicing patterns ────────────────────────────────────
// Each pattern specifies note order (bottom→top) using chord-degree indices:
//   0 = root (1), 1 = third/second (3 or 2), 2 = fifth (5), 3 = seventh (7)
//   For sus chords: 1 = 2nd or 4th depending on chord type
// "spread" flag raises alternate inner notes by one octave for wider spacing.

export interface VoicingPattern {
  id: string;         // unique key for checkbox state
  label: string;      // display label e.g. "1 3 5"
  group: string;      // group header for UI
  order: number[];    // chord-degree indices bottom→top
  spread: boolean;    // spread variant
  minNotes: number;   // minimum chord size (3 = triads, 4 = sevenths)
  maxNotes?: number;  // maximum chord size (3 = triads only)
}

// Grouped by inversion for clean UI layout
export const ALL_VOICING_PATTERNS: VoicingPattern[] = [
  // ── Root Position (bass = 1) ──────────────────────────────────────
  // Triads
  { id: "t-135",     label: "1 3 5",           group: "Root Position",  order: [0,1,2], spread: false, minNotes: 3, maxNotes: 3 },
  { id: "t-153",     label: "1 5 3",           group: "Root Position",  order: [0,2,1], spread: false, minNotes: 3, maxNotes: 3 },
  { id: "t-135s",    label: "1 3 5 (spread)",  group: "Root Position",  order: [0,1,2], spread: true,  minNotes: 3, maxNotes: 3 },
  { id: "t-153s",    label: "1 5 3 (spread)",  group: "Root Position",  order: [0,2,1], spread: true,  minNotes: 3, maxNotes: 3 },
  // Sevenths
  { id: "7-1357",    label: "1 3 5 7",           group: "Root Position",  order: [0,1,2,3], spread: false, minNotes: 4 },
  { id: "7-1735",    label: "1 7 3 5",           group: "Root Position",  order: [0,3,1,2], spread: false, minNotes: 4 },
  { id: "7-1537",    label: "1 5 3 7",           group: "Root Position",  order: [0,2,1,3], spread: false, minNotes: 4 },
  { id: "7-1357s",   label: "1 3 5 7 (spread)",  group: "Root Position",  order: [0,1,2,3], spread: true,  minNotes: 4 },
  { id: "7-1735s",   label: "1 7 3 5 (spread)",  group: "Root Position",  order: [0,3,1,2], spread: true,  minNotes: 4 },
  { id: "7-1537s",   label: "1 5 3 7 (spread)",  group: "Root Position",  order: [0,2,1,3], spread: true,  minNotes: 4 },

  // ── 1st Inversion (bass = 3) ──────────────────────────────────────
  // Triads
  { id: "t-351",     label: "3 5 1",           group: "1st Inversion",  order: [1,2,0], spread: false, minNotes: 3, maxNotes: 3 },
  { id: "t-315",     label: "3 1 5",           group: "1st Inversion",  order: [1,0,2], spread: false, minNotes: 3, maxNotes: 3 },
  { id: "t-351s",    label: "3 5 1 (spread)",  group: "1st Inversion",  order: [1,2,0], spread: true,  minNotes: 3, maxNotes: 3 },
  { id: "t-315s",    label: "3 1 5 (spread)",  group: "1st Inversion",  order: [1,0,2], spread: true,  minNotes: 3, maxNotes: 3 },
  // Sevenths
  { id: "7-3715",    label: "3 7 1 5",           group: "1st Inversion",  order: [1,3,0,2], spread: false, minNotes: 4 },
  { id: "7-3157",    label: "3 1 5 7",           group: "1st Inversion",  order: [1,0,2,3], spread: false, minNotes: 4 },
  { id: "7-3571",    label: "3 5 7 1",           group: "1st Inversion",  order: [1,2,3,0], spread: false, minNotes: 4 },
  { id: "7-3715s",   label: "3 7 1 5 (spread)",  group: "1st Inversion",  order: [1,3,0,2], spread: true,  minNotes: 4 },
  { id: "7-3157s",   label: "3 1 5 7 (spread)",  group: "1st Inversion",  order: [1,0,2,3], spread: true,  minNotes: 4 },
  { id: "7-3571s",   label: "3 5 7 1 (spread)",  group: "1st Inversion",  order: [1,2,3,0], spread: true,  minNotes: 4 },

  // ── 2nd Inversion (bass = 5) ──────────────────────────────────────
  // Triads
  { id: "t-513",     label: "5 1 3",           group: "2nd Inversion",  order: [2,0,1], spread: false, minNotes: 3, maxNotes: 3 },
  { id: "t-531",     label: "5 3 1",           group: "2nd Inversion",  order: [2,1,0], spread: false, minNotes: 3, maxNotes: 3 },
  { id: "t-513s",    label: "5 1 3 (spread)",  group: "2nd Inversion",  order: [2,0,1], spread: true,  minNotes: 3, maxNotes: 3 },
  { id: "t-531s",    label: "5 3 1 (spread)",  group: "2nd Inversion",  order: [2,1,0], spread: true,  minNotes: 3, maxNotes: 3 },
  // Sevenths
  { id: "7-5137",    label: "5 1 3 7",           group: "2nd Inversion",  order: [2,0,1,3], spread: false, minNotes: 4 },
  { id: "7-5713",    label: "5 7 1 3",           group: "2nd Inversion",  order: [2,3,0,1], spread: false, minNotes: 4 },
  { id: "7-5137s",   label: "5 1 3 7 (spread)",  group: "2nd Inversion",  order: [2,0,1,3], spread: true,  minNotes: 4 },
  { id: "7-5713s",   label: "5 7 1 3 (spread)",  group: "2nd Inversion",  order: [2,3,0,1], spread: true,  minNotes: 4 },

  // ── 3rd Inversion (bass = 7) ──────────────────────────────────────
  { id: "7-7135",    label: "7 1 3 5",           group: "3rd Inversion",  order: [3,0,1,2], spread: false, minNotes: 4 },
  { id: "7-7351",    label: "7 3 5 1",           group: "3rd Inversion",  order: [3,1,2,0], spread: false, minNotes: 4 },
  { id: "7-7135s",   label: "7 1 3 5 (spread)",  group: "3rd Inversion",  order: [3,0,1,2], spread: true,  minNotes: 4 },
  { id: "7-7351s",   label: "7 3 5 1 (spread)",  group: "3rd Inversion",  order: [3,1,2,0], spread: true,  minNotes: 4 },

  // ── Sus2 ──────────────────────────────────────────────────────────
  // Triads
  { id: "s2-125",    label: "1 2 5",    group: "Sus2",  order: [0,1,2], spread: false, minNotes: 3, maxNotes: 3 },
  { id: "s2-152",    label: "1 5 2",    group: "Sus2",  order: [0,2,1], spread: false, minNotes: 3, maxNotes: 3 },
  { id: "s2-251",    label: "2 5 1",    group: "Sus2",  order: [1,2,0], spread: false, minNotes: 3, maxNotes: 3 },
  { id: "s2-215",    label: "2 1 5",    group: "Sus2",  order: [1,0,2], spread: false, minNotes: 3, maxNotes: 3 },
  { id: "s2-512",    label: "5 1 2",    group: "Sus2",  order: [2,0,1], spread: false, minNotes: 3, maxNotes: 3 },
  { id: "s2-521",    label: "5 2 1",    group: "Sus2",  order: [2,1,0], spread: false, minNotes: 3, maxNotes: 3 },
  // Sevenths
  { id: "s27-1257",  label: "1 2 5 7",  group: "Sus2",  order: [0,1,2,3], spread: false, minNotes: 4 },
  { id: "s27-1725",  label: "1 7 2 5",  group: "Sus2",  order: [0,3,1,2], spread: false, minNotes: 4 },
  { id: "s27-1527",  label: "1 5 2 7",  group: "Sus2",  order: [0,2,1,3], spread: false, minNotes: 4 },
  { id: "s27-2571",  label: "2 5 7 1",  group: "Sus2",  order: [1,2,3,0], spread: false, minNotes: 4 },
  { id: "s27-2715",  label: "2 7 1 5",  group: "Sus2",  order: [1,3,0,2], spread: false, minNotes: 4 },
  { id: "s27-5127",  label: "5 1 2 7",  group: "Sus2",  order: [2,0,1,3], spread: false, minNotes: 4 },
  { id: "s27-7125",  label: "7 1 2 5",  group: "Sus2",  order: [3,0,1,2], spread: false, minNotes: 4 },
  { id: "s27-7251",  label: "7 2 5 1",  group: "Sus2",  order: [3,1,2,0], spread: false, minNotes: 4 },

  // ── Sus4 ──────────────────────────────────────────────────────────
  // Triads
  { id: "s4-145",    label: "1 4 5",    group: "Sus4",  order: [0,1,2], spread: false, minNotes: 3, maxNotes: 3 },
  { id: "s4-154",    label: "1 5 4",    group: "Sus4",  order: [0,2,1], spread: false, minNotes: 3, maxNotes: 3 },
  { id: "s4-451",    label: "4 5 1",    group: "Sus4",  order: [1,2,0], spread: false, minNotes: 3, maxNotes: 3 },
  { id: "s4-415",    label: "4 1 5",    group: "Sus4",  order: [1,0,2], spread: false, minNotes: 3, maxNotes: 3 },
  { id: "s4-514",    label: "5 1 4",    group: "Sus4",  order: [2,0,1], spread: false, minNotes: 3, maxNotes: 3 },
  { id: "s4-541",    label: "5 4 1",    group: "Sus4",  order: [2,1,0], spread: false, minNotes: 3, maxNotes: 3 },
  // Sevenths
  { id: "s47-1457",  label: "1 4 5 7",  group: "Sus4",  order: [0,1,2,3], spread: false, minNotes: 4 },
  { id: "s47-1745",  label: "1 7 4 5",  group: "Sus4",  order: [0,3,1,2], spread: false, minNotes: 4 },
  { id: "s47-1547",  label: "1 5 4 7",  group: "Sus4",  order: [0,2,1,3], spread: false, minNotes: 4 },
  { id: "s47-4571",  label: "4 5 7 1",  group: "Sus4",  order: [1,2,3,0], spread: false, minNotes: 4 },
  { id: "s47-4715",  label: "4 7 1 5",  group: "Sus4",  order: [1,3,0,2], spread: false, minNotes: 4 },
  { id: "s47-5147",  label: "5 1 4 7",  group: "Sus4",  order: [2,0,1,3], spread: false, minNotes: 4 },
  { id: "s47-7145",  label: "7 1 4 5",  group: "Sus4",  order: [3,0,1,2], spread: false, minNotes: 4 },
  { id: "s47-7451",  label: "7 4 5 1",  group: "Sus4",  order: [3,1,2,0], spread: false, minNotes: 4 },
];

export const VOICING_PATTERN_GROUPS: string[] = [...new Set(ALL_VOICING_PATTERNS.map(p => p.group))];

/** Apply a specific voicing pattern to a chord.
 *  `chord` may include extensions (9/11/13) already placed an octave above
 *  the triad, so the input is sorted by PITCH (not folded to pitch classes) —
 *  folding would collapse a 9th down into a 2nd inside the root octave.
 *  The pattern's `order` array reorders the pitch-sorted chord tones from
 *  bottom to top, raising octaves as needed to keep each note above the
 *  previous. `spread` raises every other inner note by one octave. */
export function applyVoicingPattern(chord: number[], edo: number, pattern: VoicingPattern): number[] {
  const n = chord.length;
  if (n === 0) return [];

  // Sort by absolute pitch so extensions (input at bass+edo+pc) retain the
  // octave displacement that distinguishes a 9th from a 2nd, an 11th from
  // a 4th, etc. The pattern's indices then map to the intended slots
  // (root / 3 / 5 / 7-or-extension) by ascending pitch order.
  const sorted = [...chord].sort((a, b) => a - b);
  const order = pattern.order.filter(idx => idx < sorted.length);
  if (order.length === 0) return chord;

  const result: number[] = [];
  result.push(sorted[order[0]]);

  for (let i = 1; i < order.length; i++) {
    let note = sorted[order[i]];
    while (note <= result[result.length - 1]) note += edo;
    result.push(note);
  }

  // Apply spread: raise every other inner note by an octave
  if (pattern.spread && result.length >= 3) {
    for (let i = 1; i < result.length; i += 2) {
      result[i] += edo;
    }
    // Re-sort to maintain ascending order
    result.sort((a, b) => a - b);
  }

  return result;
}

export function closedPosition(chord: number[], edo: number): number[] {
  if (!chord.length) return [];
  const bass = Math.min(...chord);
  const corePcs = [...new Set(chord.map(n => ((n - bass) % edo + edo) % edo))].sort((a,b)=>a-b);
  const closedCore = corePcs.map(p => bass + p);
  const exts = chord.filter(n => (n - bass) >= edo).sort((a,b)=>a-b);
  if (!exts.length) return closedCore.sort((a,b)=>a-b);
  const top = Math.max(...closedCore);
  const used = new Set(closedCore);
  const placedExts: number[] = [];
  for (const e of exts) {
    const pc = ((e - bass) % edo + edo) % edo;
    let cand = bass + pc;
    while (cand <= top || used.has(cand)) cand += edo;
    placedExts.push(cand);
    used.add(cand);
  }
  return [...closedCore, ...placedExts].sort((a,b)=>a-b);
}

export function applyVoicing(chord: number[], edo: number, vType: string): number[] {
  const c = closedPosition(chord, edo);
  if (!c.length) return c;
  if (vType === "Close") return c;
  if (vType === "Open Triad") {
    if (c.length < 3) return c;
    const r = [...c]; r[1] += edo; return r.sort((a,b)=>a-b);
  }
  if (vType === "Drop-2") {
    if (c.length < 4) return c;
    const r = [...c]; r[r.length-2] -= edo; return r.sort((a,b)=>a-b);
  }
  if (vType === "Drop-3") {
    if (c.length < 4) return c;
    const r = [...c]; r[r.length-3] -= edo; return r.sort((a,b)=>a-b);
  }
  if (vType === "Drop-2&4") {
    if (c.length < 4) return c;
    const r = [...c]; r[r.length-2] -= edo; r[r.length-4] -= edo; return r.sort((a,b)=>a-b);
  }
  if (vType === "Shell") {
    const bass = c[0];
    const core = c.filter(n => (n - bass) < edo);
    if (core.length < 3) return core.sort((a,b)=>a-b);
    const [tMin, tMax, sMin, sMax] = getShellRanges(edo);
    const thirds   = core.slice(1).filter(n => (n-bass) >= tMin && (n-bass) <= tMax);
    const sevenths = core.slice(1).filter(n => (n-bass) >= sMin && (n-bass) <= sMax);
    if (!thirds.length) return [bass, core[1]].sort((a,b)=>a-b);
    if (!sevenths.length) return [bass, thirds[0]].sort((a,b)=>a-b);
    return [bass, thirds[0], sevenths[sevenths.length-1]].sort((a,b)=>a-b);
  }
  if (vType === "Rootless") return c.slice(1).sort((a,b)=>a-b);
  if (vType === "Spread") {
    if (c.length < 3) return c;
    const out = [...c];
    for (let i = 1; i < out.length - 1; i += 2) out[i] += edo;
    return out.sort((a,b)=>a-b);
  }
  if (vType === "Quartal") {
    const { P4 } = getChordShapes(edo);
    const bass = c[0]; const out = [bass]; let cur = bass;
    for (let i = 1; i < c.length; i++) { cur += P4; out.push(cur); }
    return out.sort((a,b)=>a-b);
  }
  if (vType === "Quintal") {
    const { P5 } = getChordShapes(edo);
    const bass = c[0]; const out = [bass]; let cur = bass;
    for (let i = 1; i < c.length; i++) { cur += P5; out.push(cur); }
    return out.sort((a,b)=>a-b);
  }
  return c;
}

export function rotateInversion(chord: number[], edo: number, inv: number): number[] {
  let c = [...chord].sort((a,b)=>a-b);
  inv = Math.max(0, Math.min(inv, c.length - 1));
  for (let i = 0; i < inv; i++) {
    const x = c.shift()!;
    c.push(x + edo);
  }
  return c.sort((a,b)=>a-b);
}

export function chooseInversion(chord: number[], edo: number, allowed: number[]): number[] {
  const n = chord.length;
  const valid = allowed.filter(i => i >= 0 && i < n);
  if (!valid.length) return rotateInversion(chord, edo, 0);
  const inv = valid[Math.floor(Math.random() * valid.length)];
  return rotateInversion(chord, edo, inv);
}

// ── Register helpers ──────────────────────────────────────────────────

export function strictWindowBounds(tonicPc: number, edo: number, lowestOff: number, highestOff: number): [number,number] {
  const low = tonicPc + (lowestOff - 4) * edo;
  const high = tonicPc + (highestOff + 1 - 4) * edo;
  return low <= high ? [low, high] : [high, low];
}

export function fitChordIntoWindow(chordAbs: number[], edo: number, low: number, high: number): number[] {
  if (!chordAbs.length) return [];
  const c0 = [...chordAbs].sort((a,b)=>a-b);
  // Try shifting the whole chord by octaves to fit
  for (let k = -6; k <= 6; k++) {
    const trial = c0.map(n => n + k * edo);
    if (Math.min(...trial) >= low && Math.max(...trial) < high) return trial;
  }
  // Fallback: anchor the bass note inside the window, then place each upper
  // note as the lowest occurrence of its pitch class that is ≥ the bass note.
  // Never drop notes — if a note can't fit in the window, keep it anyway.
  let bass = c0[0];
  while (bass < low) bass += edo;
  while (bass >= high) bass -= edo;
  if (bass < low) bass = c0[0]; // window too small, keep original
  const out = [bass];
  for (let i = 1; i < c0.length; i++) {
    let n = c0[i];
    // Place above (or equal to) the previous note
    const prev = out[out.length - 1];
    while (n <= prev) n += edo;
    // Pull down if above window, but never below prev
    while (n >= high && n - edo > prev) n -= edo;
    out.push(n);
  }
  // Final pass: pull any notes still outside the window back in,
  // allowing voice crossing if necessary, then re-sort.
  for (let i = 0; i < out.length; i++) {
    while (out[i] >= high && out[i] - edo >= low) out[i] -= edo;
    while (out[i] < low  && out[i] + edo <  high) out[i] += edo;
  }
  out.sort((a, b) => a - b);
  return out;
}

export function placeChordInRegister(
  chordAbs: number[], edo: number, tonicPc: number,
  lowestOff: number, highestOff: number, registerMode: string
): number[] {
  if (!chordAbs.length) return [];
  const [low, high] = strictWindowBounds(tonicPc, edo, lowestOff, highestOff);
  let targetOff = lowestOff;
  if (registerMode === "Random Bass Octave") {
    targetOff = lowestOff + Math.floor(Math.random() * (highestOff - lowestOff + 1));
  } else if (registerMode === "Random Full Register") {
    targetOff = lowestOff + Math.floor(Math.random() * (highestOff - lowestOff + 1));
  }
  const targetLow = tonicPc + (targetOff - 4) * edo;
  const targetHigh = targetLow + edo;
  let out = [...chordAbs].sort((a,b)=>a-b);
  const bass = out[0];
  if (bass < targetLow) {
    const k = Math.ceil((targetLow - bass) / edo);
    out = out.map(n => n + k * edo);
  } else if (bass >= targetHigh) {
    const k = Math.floor((bass - targetHigh) / edo) + 1;
    out = out.map(n => n - k * edo);
  }
  if (registerMode === "Random Full Register") {
    const b = out[0];
    out = [b, ...out.slice(1).map(n => n + Math.floor(Math.random() * 3) * edo)];
  }
  return fitChordIntoWindow(out, edo, low, high);
}

// ── Extensions ────────────────────────────────────────────────────────

export function addExtensions(
  chordAbs: number[], rootAbs: number, edo: number,
  k: number, checkedLabels: Set<string>
): number[] {
  if (k <= 0) return [...chordAbs];
  const extMap = getExtLabelToSteps(edo);
  let pool: number[] = [];
  if (checkedLabels.size > 0) {
    for (const lbl of checkedLabels) {
      for (const s of extMap[lbl] ?? []) pool.push(s);
    }
  } else {
    for (const steps of Object.values(extMap)) pool.push(...steps);
  }
  const existing = new Set(chordAbs);
  const candidates = pool.map(s => rootAbs + s).filter(n => !existing.has(n));
  shuffle(candidates);
  return [...chordAbs, ...candidates.slice(0, k)].sort((a,b)=>a-b);
}

// ── Bass control ──────────────────────────────────────────────────────

export function applyBassControl(chord: number[], edo: number, bassMode: string): number[] {
  const c = [...chord].sort((a,b)=>a-b);
  if (bassMode === "Triad Only" && c.length > 3) {
    const triad = c.slice(0, 3);
    const ext = c.slice(3).map(n => { let x = n; while (x <= triad[0]) x += edo; return x; });
    return [...triad, ...ext].sort((a,b)=>a-b);
  }
  if (bassMode === "Extensions Only" && c.length > 3) {
    const ext = c.slice(3).sort((a,b)=>a-b);
    const triad = c.slice(0, 3).map(n => { let x = n; while (x <= ext[0]) x += edo; return x; });
    return [...ext, ...triad].sort((a,b)=>a-b);
  }
  return c;
}

// ── Chord quality detection ────────────────────────────────────────────

// Normalise raw chord steps so root is first, others sorted by PC
export function normalizeToRootFirst(steps: number[], edo: number): number[] {
  const root = steps[0] % edo;
  const pcs = [...new Set(steps.map(s => ((s % edo) + edo) % edo))].sort((a, b) => a - b);
  return [root, ...pcs.filter(p => p !== root)];
}

// Detect triad quality from root-first pitch-class list
export function triadQuality(steps: number[], edo = 31): string {
  if (steps.length < 3) return "unknown";
  const root = steps[0];
  const rels = [...new Set(steps.slice(0, 3).map(s => ((s - root) % edo + edo) % edo))].sort((a, b) => a - b);
  const { M3, m3, P5, d5, A1 } = getChordShapes(edo);
  if (rels[0] === 0 && rels[1] === M3 && rels[2] === P5) return "major";
  if (rels[0] === 0 && rels[1] === m3 && rels[2] === P5) return "minor";
  if (rels[0] === 0 && rels[1] === m3 && rels[2] === d5) return "dim";
  if (rels[0] === 0 && rels[1] === M3 && rels[2] === P5 + A1) return "aug";
  // Microtonal triads — subminor/supermajor are 1 diesis (1 step)
  // away from minor/major, not A1 (chromatic semitone) away.
  if (A1 >= 2) {
    if (rels[0] === 0 && rels[1] === m3 - 1 && rels[2] === P5) return "subminor";
    if (rels[0] === 0 && rels[1] === M3 + 1 && rels[2] === P5) return "supermajor";
    const neut3 = Math.round((m3 + M3) / 2);
    if (rels[0] === 0 && rels[1] === neut3 && rels[2] === P5) return "neutral";
  }
  return "unknown";
}

// ── Formula / progressions ────────────────────────────────────────────

// Formulas match Python: "X" = single random chord
export const FORMULA_NAMES = ["X","I X I","ii/X V/X X","iiø/X V/X X","V/X","vii°/X","i X i"];

// Returns list of [label, stepsFromTonic | null] — null means look up label in chord map.
// Non-null steps are relative to tonal center (same format as BASE_CHORDS shapes).
export function buildSequenceFromFormula(
  formula: string,
  checkedRomans: string[],
  chordMap: Record<string, number[]>,
  edo = 31
): [string, number[] | null][] | null {
  if (!checkedRomans.length) return null;
  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const { MAJ, MIN, DIM, P5, LT, M2 } = getChordShapes(edo);

  if (formula === "X") {
    return [[pick(checkedRomans), null]];
  }

  if (formula === "I X I") {
    if (!chordMap["I"]) return null;
    const pool = checkedRomans.filter(r => r !== "I");
    if (!pool.length) return [["I", null]];
    return [["I", null], [pick(pool), null], ["I", null]];
  }

  if (formula === "i X i") {
    if (!chordMap["i"]) return null;
    const pool = checkedRomans.filter(r => r !== "i");
    if (!pool.length) return [["i", null]];
    return [["i", null], [pick(pool), null], ["i", null]];
  }

  if (formula === "ii/X V/X X") {
    const major = checkedRomans.filter(r => chordMap[r] && triadQuality(chordMap[r], edo) === "major");
    if (!major.length) return null;
    const X = pick(major);
    const xr = chordMap[X][0];
    return [
      [`ii/${X}`,  MIN.map(s => xr + M2 + s)],
      [`V/${X}`,   MAJ.map(s => xr + P5 + s)],
      [X, null],
    ];
  }

  if (formula === "iiø/X V/X X") {
    const minor = checkedRomans.filter(r => chordMap[r] && triadQuality(chordMap[r], edo) === "minor");
    if (!minor.length) return null;
    const X = pick(minor);
    const xr = chordMap[X][0];
    return [
      [`iiø/${X}`, DIM.map(s => xr + M2 + s)],
      [`V/${X}`,   MAJ.map(s => xr + P5 + s)],
      [X, null],
    ];
  }

  if (formula === "V/X") {
    const X = pick(checkedRomans);
    const xr = chordMap[X]?.[0] ?? 0;
    return [
      [`V/${X}`, MAJ.map(s => xr + P5 + s)],
      [X, null],
    ];
  }

  if (formula === "vii°/X") {
    const X = pick(checkedRomans);
    const xr = chordMap[X]?.[0] ?? 0;
    return [
      [`vii°/${X}`, DIM.map(s => xr + LT + s)],
      [X, null],
    ];
  }

  return null;
}

// ── Functional harmony: chord movement graph + loop generation ────────

/**
 * Directed graph of common chord movements.  Each key lists the roman
 * numerals that can *follow* it in a functional progression.  The graph
 * covers diatonic chords, secondary dominants, and common borrowings.
 * Any chord not listed as a key can go to I or i (default resolution).
 */
export const HARMONIC_GRAPH: Record<string, string[]> = {
  // ── Diatonic major ──
  "I":    ["ii","iii","IV","V","vi","vii°","V/ii","V/iii","V/IV","V/V","V/vi","ii/IV","ii/V","iiø/ii","iiø/iii","iiø/vi","TT/I","TT/ii","TT/V","TT/vi"],
  "ii":   ["V","vii°","V/V","ii/V"],
  "iii":  ["vi","IV","ii"],
  "IV":   ["V","vii°","I","ii","V/V","TT/V"],
  "V":    ["I","vi","IV","TT/I"],
  "vi":   ["ii","IV","V","iii","V/ii","iiø/ii"],
  "vii°": ["I","iii","vi"],
  // ── Diatonic minor ──
  "i":    ["ii°","III","iv","V","v","VI","VII","vii°"],
  "ii°":  ["V","vii°","v"],
  "III":  ["VI","iv","i"],
  "iv":   ["V","vii°","I","i","v"],
  "v":    ["i","VI","iv","bVI"],
  "VI":   ["ii°","iv","V","III"],
  "VII":  ["III","i"],
  // ── Secondary dominants — MUST resolve to their target ──
  "V/ii":  ["ii"],
  "V/iii": ["iii"],
  "V/IV":  ["IV"],
  "V/V":   ["V"],
  "V/vi":  ["vi"],
  // ── Secondary ii-Vs — ii resolves to V, which resolves to target ──
  "ii/IV":   ["V/IV"],
  "ii/V":    ["V/V"],
  "iiø/ii":  ["V/ii"],
  "iiø/iii": ["V/iii"],
  "iiø/vi":  ["V/vi"],
  // ── Tritone subs — resolve to their target (down a half step) ──
  "TT/I":   ["I"],
  "TT/ii":  ["ii"],
  "TT/V":   ["V"],
  "TT/vi":  ["vi"],
  // ── Borrowings ──
  "bIII":  ["IV","iv","bVI","bVII","i"],
  "bVI":   ["bVII","V","iv","i"],
  "bVII":  ["I","i","bIII","IV"],
  "#iv°":  ["V","vii°"],
};

/**
 * Chords that are "applied" — they MUST be followed by their resolution
 * target, so the loop generator never places them at the end of a path.
 */
const APPLIED_CHORDS = new Set([
  "V/ii","V/iii","V/IV","V/V","V/vi",
  "ii/IV","ii/V","iiø/ii","iiø/iii","iiø/vi",
  "TT/I","TT/ii","TT/V","TT/vi",
]);

/** Length options for generated loops */
export const LOOP_LENGTHS = [2, 3, 4, 5, 6, 8] as const;

/** Chords that function as "home" — a loop must start and end here. */
const HOME_CHORDS = new Set(["I", "i"]);

/**
 * Generate a functional chord loop from the selected chords.
 * Returns a sequence that starts on a home chord, walks the graph
 * using only chords from `available`, and ends on a chord that can
 * resolve back to the start (making it loopable).
 *
 * Returns null if no valid loop can be found.
 */
export function generateFunctionalLoop(
  available: string[],
  length: number,
  maxAttempts = 300,
): string[] | null {
  if (available.length < 2) return null;

  const avSet = new Set(available);
  const diatonicStarts = available.filter(c => !APPLIED_CHORDS.has(c));
  const homes = available.filter(c => HOME_CHORDS.has(c));
  const startPool = diatonicStarts.length > 0 ? diatonicStarts : (homes.length > 0 ? homes : [available[0]]);

  const uniformPick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  // ── Build weighted transition table from HARMONIC_GRAPH ──
  // Same structure as melodicPatternData's Markov chain: Map<chord, {target, weight}[]>
  // Common-practice weights encode functional tendencies (V→I strong, iii→vi moderate, etc.)
  type Transition = { target: string; weight: number }[];
  const transitions = new Map<string, Transition>();

  const FUNCTIONAL_WEIGHTS: Record<string, Record<string, number>> = {
    "I":    { ii: 3, iii: 2, IV: 3, V: 2, vi: 2, "vii°": 1, "V/ii": 2, "V/iii": 1, "V/IV": 2, "V/V": 3, "V/vi": 2, "ii/IV": 1, "ii/V": 2, "iiø/ii": 1, "iiø/iii": 1, "iiø/vi": 1, "TT/I": 1, "TT/ii": 1, "TT/V": 1, "TT/vi": 1 },
    "ii":   { V: 4, "vii°": 2, "V/V": 3, "ii/V": 2 },
    "iii":  { vi: 3, IV: 3, ii: 2 },
    "IV":   { V: 3, "vii°": 2, I: 2, ii: 1, "V/V": 2, "TT/V": 1 },
    "V":    { I: 5, vi: 2, IV: 1 },
    "vi":   { ii: 3, IV: 3, V: 1, iii: 2, "V/ii": 2, "iiø/ii": 1 },
    "vii°": { I: 3, iii: 2, vi: 2 },
    "i":    { "ii°": 2, III: 2, iv: 3, V: 2, v: 1, VI: 2, VII: 1, "vii°": 2 },
    "ii°":  { V: 4, "vii°": 2, v: 1 },
    "III":  { VI: 3, iv: 3, i: 1 },
    "iv":   { V: 3, "vii°": 2, I: 1, i: 2, v: 1 },
    "v":    { i: 2, VI: 3, iv: 2, bVI: 2 },
    "VI":   { "ii°": 3, iv: 3, V: 1, III: 1 },
    "VII":  { III: 3, i: 3 },
    // Applied chords — forced resolution (high weight to target)
    "V/ii":  { ii: 5 },
    "V/iii": { iii: 5 },
    "V/IV":  { IV: 5 },
    "V/V":   { V: 5 },
    "V/vi":  { vi: 5 },
    "ii/IV":   { "V/IV": 5 },
    "ii/V":    { "V/V": 5 },
    "iiø/ii":  { "V/ii": 5 },
    "iiø/iii": { "V/iii": 5 },
    "iiø/vi":  { "V/vi": 5 },
    "TT/I":   { I: 5 },
    "TT/ii":  { ii: 5 },
    "TT/V":   { V: 5 },
    "TT/vi":  { vi: 5 },
    // Borrowings
    bIII: { IV: 3, iv: 2, bVI: 2, bVII: 2, i: 1 },
    bVI:  { bVII: 3, V: 2, iv: 2, i: 1 },
    bVII: { I: 4, i: 2, bIII: 2, IV: 2 },
    "#iv°": { V: 3, "vii°": 2 },
  };

  // Build the transition map, filtering to only available chords
  for (const chord of available) {
    const weightMap = FUNCTIONAL_WEIGHTS[chord];
    if (!weightMap) continue;
    const trans: Transition = [];
    for (const [target, weight] of Object.entries(weightMap)) {
      if (avSet.has(target)) trans.push({ target, weight });
    }
    if (trans.length > 0) transitions.set(chord, trans);
  }

  // Weighted pick from transitions — same as melodicPatternData's pickFromTransitions
  const pickFromTransitions = (trans: Transition): string => {
    const total = trans.reduce((s, t) => s + t.weight, 0);
    let r = Math.random() * total;
    for (const t of trans) {
      r -= t.weight;
      if (r <= 0) return t.target;
    }
    return trans[trans.length - 1].target;
  };

  // History length for anti-repetition (same as melodicPatternData's HISTORY = 3)
  const HISTORY = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const start = uniformPick(startPool);
    const path = [start];
    const recent: string[] = [start];
    let valid = true;

    for (let step = 1; step < length; step++) {
      const prev = path[path.length - 1];
      const trans = transitions.get(prev);
      const isLastStep = step === length - 1;

      if (!trans || trans.length === 0) {
        // No transitions — fallback to any non-applied, non-recent chord
        const fallback = available.filter(c => c !== prev && !APPLIED_CHORDS.has(c) && !recent.includes(c));
        if (fallback.length > 0) { path.push(uniformPick(fallback)); }
        else {
          const any = available.filter(c => c !== prev && !APPLIED_CHORDS.has(c));
          if (any.length > 0) { path.push(uniformPick(any)); }
          else { valid = false; break; }
        }
      } else if (isLastStep) {
        // Last chord: must not be applied, prefer chords that can loop back to start
        let pool = trans.filter(t => !APPLIED_CHORDS.has(t.target));
        const canLoop = pool.filter(t => {
          const next = HARMONIC_GRAPH[t.target] ?? [];
          return next.some(n => n === start) || HOME_CHORDS.has(start);
        });
        // Filter out recent chords (same as melodicPatternData's recentSet filter)
        const recentSet = new Set(recent);
        const noRecent = (canLoop.length > 0 ? canLoop : pool).filter(t => !recentSet.has(t.target));
        const finalPool = noRecent.length > 0 ? noRecent : (canLoop.length > 0 ? canLoop : pool);
        if (finalPool.length > 0) { path.push(pickFromTransitions(finalPool)); }
        else if (pool.length > 0) { path.push(pickFromTransitions(pool)); }
        else { valid = false; break; }
      } else if (step === length - 2) {
        // Penultimate: avoid applied chords whose resolution can't close the loop
        const safe = trans.filter(t => {
          if (!APPLIED_CHORDS.has(t.target)) return true;
          const targets = (HARMONIC_GRAPH[t.target] ?? []).filter(r => avSet.has(r) && !APPLIED_CHORDS.has(r));
          return targets.some(r => {
            const next = HARMONIC_GRAPH[r] ?? [];
            return next.some(n => n === start) || HOME_CHORDS.has(start);
          });
        });
        const recentSet = new Set(recent);
        const pool = safe.length > 0 ? safe : trans;
        const noRecent = pool.filter(t => !recentSet.has(t.target));
        path.push(pickFromTransitions(noRecent.length > 0 ? noRecent : pool));
      } else {
        // Normal step: filter out recent chords to avoid repetition
        const recentSet = new Set(recent);
        const noRecent = trans.filter(t => !recentSet.has(t.target));
        const noPrev = trans.filter(t => t.target !== prev);
        const pool = noRecent.length > 0 ? noRecent : (noPrev.length > 0 ? noPrev : trans);
        path.push(pickFromTransitions(pool));
      }

      // Update recent history (same sliding window as melodicPatternData)
      recent.push(path[path.length - 1]);
      if (recent.length > HISTORY) recent.shift();
    }

    if (valid && path.length === length) return path;
  }

  // Last resort: simple progression from diatonic chords only (no consecutive repeats)
  const diatonic = available.filter(c => !APPLIED_CHORDS.has(c));
  if (diatonic.length < 2) return null;
  const path = [uniformPick(diatonic)];
  for (let i = 1; i < length; i++) {
    const prev = path[path.length - 1];
    const candidates = diatonic.filter(c => c !== prev);
    path.push(candidates.length > 0 ? uniformPick(candidates) : uniformPick(diatonic));
  }
  return path;
}

// ── Degree maps ───────────────────────────────────────────────────────

export const DEGREE_MAP_MAJOR_31: Record<string, number> = {
  "1":0,"b2":3,"2":5,"#2":7,"b3":8,"3":10,"#3":12,
  "4":13,"#4":15,"b5":16,"5":18,"#5":20,"b6":21,
  "6":23,"#6":25,"b7":26,"7":28,"8":31,"9":36
};
export const DEGREE_MAP_MINOR_31: Record<string, number> = {
  "1":0,"b2":3,"2":5,"b3":8,"3":10,"#3":12,
  "4":13,"#4":15,"b5":16,"5":18,
  "b6":21,"6":23,"b7":26,"7":28,"8":31,"9":36
};

export function phraseToSteps(phrase: { degrees: string[]; scale?: string }, rootStep: number): number[] {
  const map = phrase.scale === "minor" ? DEGREE_MAP_MINOR_31 : DEGREE_MAP_MAJOR_31;
  return phrase.degrees.map(d => rootStep + (map[d] ?? 0));
}

export function phraseToStepsEdo(
  phrase: { degrees: string[]; scale?: string },
  rootStep: number,
  edo: number
): number[] {
  const map = getDegreeMap(edo);
  const raw = phrase.degrees.map(d => rootStep + (map[d] ?? 0));
  // Unfold octave-boundary wraps so that a jump of more than half an octave
  // downward (e.g. leading-tone 7 → tonic 1) is treated as ascending instead.
  // This preserves natural cadential voice-leading (B→C resolves UP, not down).
  const half = edo / 2;
  const out = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    let curr = raw[i];
    const diff = curr - out[i - 1];
    if (diff < -half) curr += edo; // downward wrap → resolve ascending (e.g. 7→1)
    out.push(curr);
  }
  return out;
}

export function jazzPhraseToSteps(
  degrees: string[],
  rootStep: number,
  scaleFam: string,
  modeName: string
): number[] {
  const modeMap = getModeDegreeMap31(scaleFam, modeName);
  return degrees.map(d => rootStep + (modeMap[d] ?? DEGREE_MAP_MAJOR_31[d] ?? 0));
}

export function jazzPhraseToStepsEdo(
  degrees: string[],
  rootStep: number,
  scaleFam: string,
  modeName: string,
  edo: number
): number[] {
  const modeMap = getModeDegreeMap(edo, scaleFam, modeName);
  const fallback = getDegreeMap(edo);

  const steps: number[] = [];
  let prev: number | null = null;

  for (const d of degrees) {
    const pc = modeMap[d] ?? fallback[d] ?? 0;
    if (prev === null) {
      const s = rootStep + pc;
      steps.push(s);
      prev = s;
    } else {
      let best = rootStep + pc;
      let bestDist = Math.abs(best - prev);
      for (let k = -4; k <= 4; k++) {
        const candidate = rootStep + pc + k * edo;
        const dist = Math.abs(candidate - prev);
        if (dist < bestDist) { bestDist = dist; best = candidate; }
      }
      steps.push(best);
      prev = best;
    }
  }
  return steps;
}

export function edoFreq(baseFreq: number, steps: number, edo: number): number {
  return baseFreq * Math.pow(2, steps / edo);
}

// ── Melody / Jazz banks ───────────────────────────────────────────────

export const MELODY_FAMILIES = [
  "Cadences","Pentatonic Hooks","Neighbor-Tone Cells",
  "Triadic Shapes","Folk / Pop Phrases","Blues Fragments"
];
export const JAZZ_FAMILIES = [
  "Chord Tone Arpeggios","Enclosures","Bebop Fragments","Guide-Tone Lines",
  "Bergonzi Pentatonics","Bergonzi Digital Patterns","Bergonzi Triad Pairs",
  "Bergonzi Hexatonics","Bergonzi Intervallic",
];

export const MELODY_BANK_31 = [
  {family:"Cadences",        name:"mel_001",scale:"major",degrees:["2","7","1"]},
  {family:"Cadences",        name:"mel_002",scale:"major",degrees:["4","3","2","1"]},
  {family:"Cadences",        name:"mel_003",scale:"major",degrees:["5","4","3","2","1"]},
  {family:"Cadences",        name:"mel_004",scale:"major",degrees:["7","1","2","1"]},
  {family:"Cadences",        name:"mel_005",scale:"major",degrees:["6","5","3","2","1"]},
  {family:"Cadences",        name:"mel_006",scale:"major",degrees:["5","2","7","1"]},
  {family:"Cadences",        name:"mel_007",scale:"minor",degrees:["2","b7","1"]},
  {family:"Cadences",        name:"mel_008",scale:"minor",degrees:["4","b3","2","1"]},
  {family:"Cadences",        name:"mel_009",scale:"minor",degrees:["5","4","b3","2","1"]},
  {family:"Cadences",        name:"mel_010",scale:"minor",degrees:["b7","1","2","1"]},
  {family:"Pentatonic Hooks",name:"mel_011",scale:"major",degrees:["1","2","3","5","6","5","3"]},
  {family:"Pentatonic Hooks",name:"mel_012",scale:"major",degrees:["5","3","2","1","2","3","5"]},
  {family:"Pentatonic Hooks",name:"mel_013",scale:"major",degrees:["1","2","3","5","3","2","1"]},
  {family:"Pentatonic Hooks",name:"mel_014",scale:"major",degrees:["6","5","3","2","1"]},
  {family:"Pentatonic Hooks",name:"mel_015",scale:"major",degrees:["3","5","6","5","3","2"]},
  {family:"Pentatonic Hooks",name:"mel_016",scale:"minor",degrees:["1","b3","4","5","b7","5","4"]},
  {family:"Pentatonic Hooks",name:"mel_017",scale:"minor",degrees:["5","b7","5","4","b3","1"]},
  {family:"Pentatonic Hooks",name:"mel_018",scale:"minor",degrees:["1","b3","4","5","4","b3","1"]},
  {family:"Pentatonic Hooks",name:"mel_019",scale:"minor",degrees:["b7","5","4","b3","1"]},
  {family:"Pentatonic Hooks",name:"mel_020",scale:"minor",degrees:["1","b3","5","b7","5","b3","1"]},
  {family:"Neighbor-Tone Cells",name:"mel_021",scale:"major",degrees:["1","2","1"]},
  {family:"Neighbor-Tone Cells",name:"mel_022",scale:"major",degrees:["3","4","3"]},
  {family:"Neighbor-Tone Cells",name:"mel_023",scale:"major",degrees:["5","6","5"]},
  {family:"Neighbor-Tone Cells",name:"mel_024",scale:"major",degrees:["1","7","1"]},
  {family:"Neighbor-Tone Cells",name:"mel_025",scale:"major",degrees:["5","#4","5"]},
  {family:"Neighbor-Tone Cells",name:"mel_026",scale:"minor",degrees:["1","2","1"]},
  {family:"Neighbor-Tone Cells",name:"mel_027",scale:"minor",degrees:["b3","4","b3"]},
  {family:"Neighbor-Tone Cells",name:"mel_028",scale:"minor",degrees:["5","b6","5"]},
  {family:"Neighbor-Tone Cells",name:"mel_029",scale:"minor",degrees:["1","b7","1"]},
  {family:"Neighbor-Tone Cells",name:"mel_030",scale:"minor",degrees:["5","#4","5"]},
  {family:"Triadic Shapes",  name:"mel_031",scale:"major",degrees:["1","3","5"]},
  {family:"Triadic Shapes",  name:"mel_032",scale:"major",degrees:["5","3","1"]},
  {family:"Triadic Shapes",  name:"mel_033",scale:"major",degrees:["1","3","5","3","1"]},
  {family:"Triadic Shapes",  name:"mel_034",scale:"major",degrees:["3","5","1"]},
  {family:"Triadic Shapes",  name:"mel_035",scale:"major",degrees:["1","5","3","1"]},
  {family:"Triadic Shapes",  name:"mel_036",scale:"minor",degrees:["1","b3","5"]},
  {family:"Triadic Shapes",  name:"mel_037",scale:"minor",degrees:["5","b3","1"]},
  {family:"Triadic Shapes",  name:"mel_038",scale:"minor",degrees:["1","b3","5","b3","1"]},
  {family:"Triadic Shapes",  name:"mel_039",scale:"minor",degrees:["b3","5","1"]},
  {family:"Triadic Shapes",  name:"mel_040",scale:"minor",degrees:["1","5","b3","1"]},
  {family:"Folk / Pop Phrases",name:"mel_041",scale:"major",degrees:["1","2","3","5","3","2","1"]},
  {family:"Folk / Pop Phrases",name:"mel_042",scale:"major",degrees:["5","6","5","3","2","1"]},
  {family:"Folk / Pop Phrases",name:"mel_043",scale:"major",degrees:["1","2","1","5","3","2","1"]},
  {family:"Folk / Pop Phrases",name:"mel_044",scale:"major",degrees:["3","2","1","2","3","5"]},
  {family:"Folk / Pop Phrases",name:"mel_045",scale:"major",degrees:["1","1","2","3","5","3","2"]},
  {family:"Folk / Pop Phrases",name:"mel_046",scale:"minor",degrees:["1","2","b3","5","b3","2","1"]},
  {family:"Folk / Pop Phrases",name:"mel_047",scale:"minor",degrees:["5","b6","5","b3","2","1"]},
  {family:"Folk / Pop Phrases",name:"mel_048",scale:"minor",degrees:["1","b3","4","5","4","b3","1"]},
  {family:"Folk / Pop Phrases",name:"mel_049",scale:"minor",degrees:["b3","2","1","2","b3","5"]},
  {family:"Folk / Pop Phrases",name:"mel_050",scale:"minor",degrees:["1","1","2","b3","5","b3","2"]},
  {family:"Blues Fragments", name:"mel_051",scale:"minor",degrees:["1","b3","4","5"]},
  {family:"Blues Fragments", name:"mel_052",scale:"minor",degrees:["b3","3","4","5"]},
  {family:"Blues Fragments", name:"mel_053",scale:"minor",degrees:["4","#4","5"]},
  {family:"Blues Fragments", name:"mel_054",scale:"minor",degrees:["b5","5","b7","5"]},
  {family:"Blues Fragments", name:"mel_055",scale:"minor",degrees:["5","b7","5","4","b3"]},
  {family:"Blues Fragments", name:"mel_056",scale:"minor",degrees:["1","b3","4","b5","5"]},
  {family:"Blues Fragments", name:"mel_057",scale:"minor",degrees:["b7","5","4","b3","1"]},
  {family:"Blues Fragments", name:"mel_058",scale:"minor",degrees:["1","b3","1","b7","5"]},
  {family:"Blues Fragments", name:"mel_059",scale:"minor",degrees:["4","5","b7","5","4"]},
  {family:"Blues Fragments", name:"mel_060",scale:"minor",degrees:["b3","4","5","b5","4"]},
  // Folk / Pop Phrases (extended — mel_061–mel_085)
  {family:"Folk / Pop Phrases",name:"mel_061",scale:"major",degrees:["3","2","1","2","3","3","3"]},
  {family:"Folk / Pop Phrases",name:"mel_062",scale:"major",degrees:["1","1","5","5","6","6","5"]},
  {family:"Folk / Pop Phrases",name:"mel_063",scale:"major",degrees:["5","5","6","5","8","7"]},
  {family:"Folk / Pop Phrases",name:"mel_064",scale:"major",degrees:["3","3","4","5","5","4","3","2","1"]},
  {family:"Folk / Pop Phrases",name:"mel_065",scale:"major",degrees:["1","2","3","4","5","4","3","2","1"]},
  {family:"Folk / Pop Phrases",name:"mel_066",scale:"major",degrees:["5","6","5","3","1","3","5"]},
  {family:"Folk / Pop Phrases",name:"mel_067",scale:"major",degrees:["1","3","5","3","2","3","1"]},
  {family:"Folk / Pop Phrases",name:"mel_068",scale:"major",degrees:["3","5","6","5","3","2","1"]},
  {family:"Folk / Pop Phrases",name:"mel_069",scale:"major",degrees:["1","2","3","5","6","5","3","2","1"]},
  {family:"Folk / Pop Phrases",name:"mel_070",scale:"major",degrees:["5","3","2","1","2","3","5"]},
  {family:"Folk / Pop Phrases",name:"mel_071",scale:"major",degrees:["1","3","5","8","5","3","1"]},
  {family:"Folk / Pop Phrases",name:"mel_072",scale:"major",degrees:["6","5","4","3","2","3","4","5"]},
  {family:"Folk / Pop Phrases",name:"mel_073",scale:"major",degrees:["1","2","3","2","1","7","1"]},
  {family:"Folk / Pop Phrases",name:"mel_074",scale:"major",degrees:["5","4","3","2","3","4","5","6","5"]},
  {family:"Folk / Pop Phrases",name:"mel_075",scale:"major",degrees:["3","2","1","3","5","6","5"]},
  {family:"Folk / Pop Phrases",name:"mel_076",scale:"minor",degrees:["1","b3","4","5","b7","5","4","b3","1"]},
  {family:"Folk / Pop Phrases",name:"mel_077",scale:"minor",degrees:["5","b6","5","4","b3","2","1"]},
  {family:"Folk / Pop Phrases",name:"mel_078",scale:"minor",degrees:["1","2","b3","4","5","4","b3","2","1"]},
  {family:"Folk / Pop Phrases",name:"mel_079",scale:"minor",degrees:["b3","4","5","b7","5","4","b3"]},
  {family:"Folk / Pop Phrases",name:"mel_080",scale:"minor",degrees:["1","b3","5","b7","5","b3","1"]},
  {family:"Folk / Pop Phrases",name:"mel_081",scale:"minor",degrees:["5","5","b6","5","b3","1"]},
  {family:"Folk / Pop Phrases",name:"mel_082",scale:"minor",degrees:["1","2","b3","5","b3","2","1"]},
  {family:"Folk / Pop Phrases",name:"mel_083",scale:"minor",degrees:["b7","5","b3","1","b3","5"]},
  {family:"Folk / Pop Phrases",name:"mel_084",scale:"minor",degrees:["b3","4","5","b7","5","4","b3","2","1"]},
  {family:"Folk / Pop Phrases",name:"mel_085",scale:"minor",degrees:["5","4","b3","4","5","b7","5"]},
  // Blues Fragments (extended — mel_086–mel_110)
  {family:"Blues Fragments", name:"mel_086",scale:"minor",degrees:["5","b7","8","b7","5","b3","1"]},
  {family:"Blues Fragments", name:"mel_087",scale:"minor",degrees:["b3","1","b3","4","b5","5"]},
  {family:"Blues Fragments", name:"mel_088",scale:"minor",degrees:["1","4","b3","1"]},
  {family:"Blues Fragments", name:"mel_089",scale:"minor",degrees:["5","4","b3","4","5","b7"]},
  {family:"Blues Fragments", name:"mel_090",scale:"minor",degrees:["b7","b7","5","4","b3","1"]},
  {family:"Blues Fragments", name:"mel_091",scale:"minor",degrees:["1","b3","4","4","b5","5"]},
  {family:"Blues Fragments", name:"mel_092",scale:"minor",degrees:["8","b7","5","4","b3"]},
  {family:"Blues Fragments", name:"mel_093",scale:"minor",degrees:["1","1","b3","4","5"]},
  {family:"Blues Fragments", name:"mel_094",scale:"minor",degrees:["5","5","b7","5","4","b3"]},
  {family:"Blues Fragments", name:"mel_095",scale:"minor",degrees:["b3","1","b3","4","5"]},
  {family:"Blues Fragments", name:"mel_096",scale:"minor",degrees:["4","b3","1","b3","4"]},
  {family:"Blues Fragments", name:"mel_097",scale:"minor",degrees:["b7","8","b7","5"]},
  {family:"Blues Fragments", name:"mel_098",scale:"minor",degrees:["5","b3","1","b3","5"]},
  {family:"Blues Fragments", name:"mel_099",scale:"minor",degrees:["1","4","b3","1","b7","1"]},
  {family:"Blues Fragments", name:"mel_100",scale:"minor",degrees:["b3","4","5","b7","8","b7","5"]},
  {family:"Blues Fragments", name:"mel_101",scale:"minor",degrees:["5","4","b3","b3","1"]},
  {family:"Blues Fragments", name:"mel_102",scale:"minor",degrees:["b7","5","b7","8"]},
  {family:"Blues Fragments", name:"mel_103",scale:"minor",degrees:["4","4","b3","4","5"]},
  {family:"Blues Fragments", name:"mel_104",scale:"minor",degrees:["1","b3","4","5","b7","5","4","b3","1"]},
  {family:"Blues Fragments", name:"mel_105",scale:"minor",degrees:["b3","4","b5","5","b7","5","4","b3"]},
  {family:"Blues Fragments", name:"mel_106",scale:"minor",degrees:["1","b3","1","4","b3","1"]},
  {family:"Blues Fragments", name:"mel_107",scale:"minor",degrees:["5","b3","4","5","b7","8"]},
  {family:"Blues Fragments", name:"mel_108",scale:"minor",degrees:["b7","5","4","b5","4","b3","1"]},
  {family:"Blues Fragments", name:"mel_109",scale:"minor",degrees:["1","b3","4","b3","1","b7","1"]},
  {family:"Blues Fragments", name:"mel_110",scale:"minor",degrees:["4","b5","5","b7","5","4","b3"]},
];

export const JAZZ_CELL_BANK_31 = [
  // Chord Tone Arpeggios
  {family:"Chord Tone Arpeggios",name:"jaz_001",degrees:["1","3","5","7"]},
  {family:"Chord Tone Arpeggios",name:"jaz_002",degrees:["7","5","3","1"]},
  {family:"Chord Tone Arpeggios",name:"jaz_003",degrees:["1","3","5","7","9"]},
  {family:"Chord Tone Arpeggios",name:"jaz_004",degrees:["9","7","5","3","1"]},
  {family:"Chord Tone Arpeggios",name:"jaz_005",degrees:["3","5","7","9"]},
  {family:"Chord Tone Arpeggios",name:"jaz_006",degrees:["9","7","5","3"]},
  {family:"Chord Tone Arpeggios",name:"jaz_007",degrees:["1","5","3","7"]},
  {family:"Chord Tone Arpeggios",name:"jaz_008",degrees:["3","7","5","1"]},
  {family:"Chord Tone Arpeggios",name:"jaz_009",degrees:["1","3","5","3","1"]},
  {family:"Chord Tone Arpeggios",name:"jaz_010",degrees:["5","7","9","7","5"]},
  // Enclosures
  {family:"Enclosures",name:"jaz_011",degrees:["b2","7","1"]},
  {family:"Enclosures",name:"jaz_012",degrees:["2","7","1"]},
  {family:"Enclosures",name:"jaz_013",degrees:["4","#2","3"]},
  {family:"Enclosures",name:"jaz_014",degrees:["4","2","3"]},
  {family:"Enclosures",name:"jaz_015",degrees:["b6","#4","5"]},
  {family:"Enclosures",name:"jaz_016",degrees:["6","4","5"]},
  {family:"Enclosures",name:"jaz_017",degrees:["8","b7","7"]},
  {family:"Enclosures",name:"jaz_018",degrees:["8","6","7"]},
  {family:"Enclosures",name:"jaz_019",degrees:["b2","7","1","2","3"]},
  {family:"Enclosures",name:"jaz_020",degrees:["4","2","3","5","7"]},
  // Bebop Fragments
  {family:"Bebop Fragments",name:"jaz_021",degrees:["1","2","3","#3","4","5"]},
  {family:"Bebop Fragments",name:"jaz_022",degrees:["3","4","5","#5","6","7"]},
  {family:"Bebop Fragments",name:"jaz_023",degrees:["5","6","7","b7","b7","8"]},
  {family:"Bebop Fragments",name:"jaz_024",degrees:["8","7","b7","6","5","4","3"]},
  {family:"Bebop Fragments",name:"jaz_025",degrees:["5","4","3","#2","2","1"]},
  {family:"Bebop Fragments",name:"jaz_026",degrees:["5","#4","4","3","2","1"]},
  {family:"Bebop Fragments",name:"jaz_027",degrees:["9","8","7","b7","6","5"]},
  {family:"Bebop Fragments",name:"jaz_028",degrees:["8","7","b7","6","5","4","3","2","1"]},
  {family:"Bebop Fragments",name:"jaz_029",degrees:["1","2","3","4","5","#5","6","7","8"]},
  {family:"Bebop Fragments",name:"jaz_030",degrees:["7","6","5","#4","4","3"]},
  // Guide-Tone Lines
  {family:"Guide-Tone Lines",name:"jaz_031",degrees:["3","2","1"]},
  {family:"Guide-Tone Lines",name:"jaz_032",degrees:["7","1","2","3"]},
  {family:"Guide-Tone Lines",name:"jaz_033",degrees:["3","4","5","7"]},
  {family:"Guide-Tone Lines",name:"jaz_034",degrees:["7","6","5","3"]},
  {family:"Guide-Tone Lines",name:"jaz_035",degrees:["3","5","7","9"]},
  {family:"Guide-Tone Lines",name:"jaz_036",degrees:["7","9","1","3"]},
  {family:"Guide-Tone Lines",name:"jaz_037",degrees:["3","2","7","1"]},
  {family:"Guide-Tone Lines",name:"jaz_038",degrees:["7","5","3","1"]},
  {family:"Guide-Tone Lines",name:"jaz_039",degrees:["9","7","3","1"]},
  {family:"Guide-Tone Lines",name:"jaz_040",degrees:["3","7","9","3"]},

  // ── Bergonzi Pentatonics (Vol 1 & 2) ──
  // Major pentatonic permutations (1 2 3 5 6)
  {family:"Bergonzi Pentatonics",name:"bgz_p01",degrees:["1","2","3","5"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p02",degrees:["2","3","5","6"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p03",degrees:["3","5","6","1"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p04",degrees:["5","6","1","2"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p05",degrees:["6","1","2","3"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p06",degrees:["1","3","5","6"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p07",degrees:["2","5","6","1"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p08",degrees:["3","6","1","2"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p09",degrees:["5","1","2","3"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p10",degrees:["6","2","3","5"]},
  // Major pentatonic descending
  {family:"Bergonzi Pentatonics",name:"bgz_p11",degrees:["5","3","2","1"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p12",degrees:["6","5","3","2"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p13",degrees:["1","6","5","3"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p14",degrees:["2","1","6","5"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p15",degrees:["3","2","1","6"]},
  // Major pentatonic 5-note groups
  {family:"Bergonzi Pentatonics",name:"bgz_p16",degrees:["1","2","3","5","6"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p17",degrees:["2","3","5","6","1"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p18",degrees:["3","5","6","1","2"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p19",degrees:["5","6","1","2","3"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p20",degrees:["6","1","2","3","5"]},
  // Major pentatonic pendulum / skip patterns
  {family:"Bergonzi Pentatonics",name:"bgz_p21",degrees:["1","3","2","5","3","6"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p22",degrees:["1","5","3","6","5","2"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p23",degrees:["6","3","5","2","3","1"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p24",degrees:["5","2","6","3","1","6"]},
  // Minor pentatonic permutations (1 b3 4 5 b7)
  {family:"Bergonzi Pentatonics",name:"bgz_p25",degrees:["1","b3","4","5"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p26",degrees:["b3","4","5","b7"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p27",degrees:["4","5","b7","1"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p28",degrees:["5","b7","1","b3"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p29",degrees:["b7","1","b3","4"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p30",degrees:["1","4","5","b7"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p31",degrees:["b3","5","b7","1"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p32",degrees:["4","b7","1","b3"]},
  // Minor pentatonic descending
  {family:"Bergonzi Pentatonics",name:"bgz_p33",degrees:["5","4","b3","1"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p34",degrees:["b7","5","4","b3"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p35",degrees:["1","b7","5","4"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p36",degrees:["b3","1","b7","5"]},
  // Minor pentatonic 5-note groups
  {family:"Bergonzi Pentatonics",name:"bgz_p37",degrees:["1","b3","4","5","b7"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p38",degrees:["b3","4","5","b7","1"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p39",degrees:["4","5","b7","1","b3"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p40",degrees:["5","b7","1","b3","4"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p41",degrees:["b7","1","b3","4","5"]},
  // Minor pentatonic skip patterns
  {family:"Bergonzi Pentatonics",name:"bgz_p42",degrees:["1","4","b3","5","4","b7"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p43",degrees:["b3","5","4","b7","5","1"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p44",degrees:["5","b3","b7","4","1","5"]},
  // Dominant pentatonic (1 2 3 5 b7) — Mixolydian pentatonic
  {family:"Bergonzi Pentatonics",name:"bgz_p45",degrees:["1","2","3","5","b7"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p46",degrees:["2","3","5","b7","1"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p47",degrees:["3","5","b7","1","2"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p48",degrees:["5","b7","1","2","3"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p49",degrees:["b7","1","2","3","5"]},
  // Kumoi pentatonic (1 2 b3 5 6)
  {family:"Bergonzi Pentatonics",name:"bgz_p50",degrees:["1","2","b3","5","6"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p51",degrees:["2","b3","5","6","1"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p52",degrees:["b3","5","6","1","2"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p53",degrees:["5","6","1","2","b3"]},
  // Hirajoshi pentatonic (1 2 b3 5 b6)
  {family:"Bergonzi Pentatonics",name:"bgz_p54",degrees:["1","2","b3","5","b6"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p55",degrees:["2","b3","5","b6","1"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p56",degrees:["b3","5","b6","1","2"]},
  // In-Sen pentatonic (1 b2 4 5 b7)
  {family:"Bergonzi Pentatonics",name:"bgz_p57",degrees:["1","b2","4","5","b7"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p58",degrees:["b2","4","5","b7","1"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p59",degrees:["4","5","b7","1","b2"]},
  // Pentatonic superimpositions (b3 from root = minor pent over dominant)
  {family:"Bergonzi Pentatonics",name:"bgz_p60",degrees:["b3","4","5","b7","1"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p61",degrees:["2","4","5","b7","2"]},
  {family:"Bergonzi Pentatonics",name:"bgz_p62",degrees:["5","6","1","2","3","5"]},

  // ── Bergonzi Digital Patterns (Vol 3: Jazz Line) ──
  // All 24 permutations of the 1235 cell
  {family:"Bergonzi Digital Patterns",name:"bgz_d01",degrees:["1","2","3","5"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d02",degrees:["1","2","5","3"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d03",degrees:["1","3","2","5"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d04",degrees:["1","3","5","2"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d05",degrees:["1","5","2","3"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d06",degrees:["1","5","3","2"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d07",degrees:["2","1","3","5"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d08",degrees:["2","1","5","3"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d09",degrees:["2","3","1","5"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d10",degrees:["2","3","5","1"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d11",degrees:["2","5","1","3"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d12",degrees:["2","5","3","1"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d13",degrees:["3","1","2","5"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d14",degrees:["3","1","5","2"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d15",degrees:["3","2","1","5"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d16",degrees:["3","2","5","1"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d17",degrees:["3","5","1","2"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d18",degrees:["3","5","2","1"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d19",degrees:["5","1","2","3"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d20",degrees:["5","1","3","2"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d21",degrees:["5","2","1","3"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d22",degrees:["5","2","3","1"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d23",degrees:["5","3","1","2"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d24",degrees:["5","3","2","1"]},
  // 1235 sequenced through each scale degree
  {family:"Bergonzi Digital Patterns",name:"bgz_d25",degrees:["2","3","4","6"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d26",degrees:["3","4","5","7"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d27",degrees:["4","5","6","1"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d28",degrees:["5","6","7","2"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d29",degrees:["6","7","1","3"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d30",degrees:["7","1","2","4"]},
  // Interval variant base cells (same "skip one" logic, different interval shape)
  // 1345 cell — skip 2nd degree
  {family:"Bergonzi Digital Patterns",name:"bgz_d31",degrees:["1","3","4","5"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d32",degrees:["5","4","3","1"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d33",degrees:["3","1","5","4"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d34",degrees:["4","5","1","3"]},
  // 1256 cell — skip 3rd & 4th degrees
  {family:"Bergonzi Digital Patterns",name:"bgz_d35",degrees:["1","2","5","6"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d36",degrees:["6","5","2","1"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d37",degrees:["2","6","1","5"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d38",degrees:["5","1","6","2"]},
  // 1357 cell — all-thirds stacking
  {family:"Bergonzi Digital Patterns",name:"bgz_d39",degrees:["1","3","5","7"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d40",degrees:["7","5","3","1"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d41",degrees:["3","7","1","5"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d42",degrees:["5","1","7","3"]},
  // Extended digital: 5-note
  {family:"Bergonzi Digital Patterns",name:"bgz_d43",degrees:["1","2","3","5","3"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d44",degrees:["1","3","5","3","2"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d45",degrees:["1","2","3","5","6"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d46",degrees:["5","3","2","1","2"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d47",degrees:["1","2","3","4","5"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d48",degrees:["5","4","3","2","1"]},
  // Digital with chromatic approach
  {family:"Bergonzi Digital Patterns",name:"bgz_d49",degrees:["7","1","2","3","5"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d50",degrees:["#4","5","6","7","2"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d51",degrees:["#2","3","5","6","1"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d52",degrees:["b2","1","2","3","5"]},
  // Descending digital patterns
  {family:"Bergonzi Digital Patterns",name:"bgz_d53",degrees:["8","7","6","5"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d54",degrees:["7","6","5","3"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d55",degrees:["6","5","3","2"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d56",degrees:["5","3","2","1"]},
  // Compound digital (two cells chained)
  {family:"Bergonzi Digital Patterns",name:"bgz_d57",degrees:["1","2","3","5","2","3","4","6"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d58",degrees:["1","3","5","2","3","5","7","3"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d59",degrees:["5","3","2","1","6","5","3","2"]},
  {family:"Bergonzi Digital Patterns",name:"bgz_d60",degrees:["3","5","1","3","5","7","2","5"]},

  // ── Bergonzi Triad Pairs (Vol 6: Developing a Jazz Language) ──
  // Adjacent major triads (e.g. C & D triads)
  {family:"Bergonzi Triad Pairs",name:"bgz_t01",degrees:["1","3","5","2","#4","6"]},
  {family:"Bergonzi Triad Pairs",name:"bgz_t02",degrees:["2","#4","6","1","3","5"]},
  {family:"Bergonzi Triad Pairs",name:"bgz_t03",degrees:["5","3","1","6","#4","2"]},
  {family:"Bergonzi Triad Pairs",name:"bgz_t04",degrees:["6","#4","2","5","3","1"]},
  // Triad permutations (all inversions)
  {family:"Bergonzi Triad Pairs",name:"bgz_t05",degrees:["1","5","3","2","6","#4"]},
  {family:"Bergonzi Triad Pairs",name:"bgz_t06",degrees:["3","1","5","#4","2","6"]},
  {family:"Bergonzi Triad Pairs",name:"bgz_t07",degrees:["5","1","3","6","2","#4"]},
  {family:"Bergonzi Triad Pairs",name:"bgz_t08",degrees:["3","5","1","#4","6","2"]},
  // IV & V triads (F & G over C)
  {family:"Bergonzi Triad Pairs",name:"bgz_t09",degrees:["4","6","1","5","7","2"]},
  {family:"Bergonzi Triad Pairs",name:"bgz_t10",degrees:["5","7","2","4","6","1"]},
  {family:"Bergonzi Triad Pairs",name:"bgz_t11",degrees:["1","6","4","2","7","5"]},
  {family:"Bergonzi Triad Pairs",name:"bgz_t12",degrees:["2","7","5","1","6","4"]},
  // Minor triad pairs (i & ii triads)
  {family:"Bergonzi Triad Pairs",name:"bgz_t13",degrees:["1","b3","5","2","4","6"]},
  {family:"Bergonzi Triad Pairs",name:"bgz_t14",degrees:["2","4","6","1","b3","5"]},
  {family:"Bergonzi Triad Pairs",name:"bgz_t15",degrees:["5","b3","1","6","4","2"]},
  {family:"Bergonzi Triad Pairs",name:"bgz_t16",degrees:["6","4","2","5","b3","1"]},
  // Triad pairs over dominant (V & bVII)
  {family:"Bergonzi Triad Pairs",name:"bgz_t17",degrees:["5","7","2","b7","2","4"]},
  {family:"Bergonzi Triad Pairs",name:"bgz_t18",degrees:["b7","2","4","5","7","2"]},
  // Triads with chromatic approach
  {family:"Bergonzi Triad Pairs",name:"bgz_t19",degrees:["#4","5","7","2","b2","1","3","5"]},
  {family:"Bergonzi Triad Pairs",name:"bgz_t20",degrees:["7","1","3","5","#2","3","5","7"]},
  // Augmented triad pairs
  {family:"Bergonzi Triad Pairs",name:"bgz_t21",degrees:["1","3","#5","2","#4","7"]},
  {family:"Bergonzi Triad Pairs",name:"bgz_t22",degrees:["2","#4","7","1","3","#5"]},
  // Triad pair inversions (1st inversion cells)
  {family:"Bergonzi Triad Pairs",name:"bgz_t23",degrees:["3","5","1","#4","6","2"]},
  {family:"Bergonzi Triad Pairs",name:"bgz_t24",degrees:["#4","6","2","3","5","1"]},
  // 2nd inversion cells
  {family:"Bergonzi Triad Pairs",name:"bgz_t25",degrees:["5","1","3","6","2","#4"]},
  {family:"Bergonzi Triad Pairs",name:"bgz_t26",degrees:["6","2","#4","5","1","3"]},

  // ── Bergonzi Hexatonics (Vol 7) ──
  // Hexatonic = two triads combined into 6-note scale
  // Major hexatonic (I + II triads: 1 2 3 #4 5 6)
  {family:"Bergonzi Hexatonics",name:"bgz_h01",degrees:["1","2","3","#4","5","6"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h02",degrees:["6","5","#4","3","2","1"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h03",degrees:["1","3","5","2","#4","6"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h04",degrees:["6","#4","2","5","3","1"]},
  // Hexatonic 4-note cells
  {family:"Bergonzi Hexatonics",name:"bgz_h05",degrees:["1","2","3","#4"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h06",degrees:["2","3","#4","5"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h07",degrees:["3","#4","5","6"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h08",degrees:["#4","5","6","1"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h09",degrees:["5","6","1","2"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h10",degrees:["6","1","2","3"]},
  // Hexatonic skip patterns
  {family:"Bergonzi Hexatonics",name:"bgz_h11",degrees:["1","3","2","#4","3","5"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h12",degrees:["1","#4","3","6","5","2"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h13",degrees:["6","3","5","2","#4","1"]},
  // Augmented hexatonic (I + bVI triads: 1 b3 3 5 b6 8 — whole-tone subset)
  {family:"Bergonzi Hexatonics",name:"bgz_h14",degrees:["1","3","#5","b6","1","b3"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h15",degrees:["3","#5","1","b3","b6","3"]},
  // Minor hexatonic (i + IV triads: 1 b3 4 5 6 8)
  {family:"Bergonzi Hexatonics",name:"bgz_h16",degrees:["1","b3","4","5","6","1"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h17",degrees:["b3","4","5","6","1","b3"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h18",degrees:["1","4","b3","5","6","1"]},
  // Dominant hexatonic (V + IV triads: 1 2 4 5 6 b7)
  {family:"Bergonzi Hexatonics",name:"bgz_h19",degrees:["1","2","4","5","6","b7"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h20",degrees:["2","4","5","6","b7","1"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h21",degrees:["5","6","b7","1","2","4"]},
  // Hexatonic descending 4-note cells
  {family:"Bergonzi Hexatonics",name:"bgz_h22",degrees:["#4","3","2","1"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h23",degrees:["5","#4","3","2"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h24",degrees:["6","5","#4","3"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h25",degrees:["1","6","5","#4"]},
  // Hexatonic compound cells
  {family:"Bergonzi Hexatonics",name:"bgz_h26",degrees:["1","2","3","#4","5","6","#4","3"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h27",degrees:["6","5","#4","3","2","1","3","#4"]},
  {family:"Bergonzi Hexatonics",name:"bgz_h28",degrees:["1","3","#4","6","5","3","2","1"]},

  // ── Bergonzi Intervallic (Vol 5 — Thesaurus of Intervallic Melodies) ──
  // All-seconds patterns
  {family:"Bergonzi Intervallic",name:"bgz_i01",degrees:["1","2","3","4","5","6"]},
  {family:"Bergonzi Intervallic",name:"bgz_i02",degrees:["1","2","3","2","1","2"]},
  {family:"Bergonzi Intervallic",name:"bgz_i03",degrees:["6","5","4","3","2","1"]},
  // All-thirds patterns
  {family:"Bergonzi Intervallic",name:"bgz_i04",degrees:["1","3","2","4","3","5"]},
  {family:"Bergonzi Intervallic",name:"bgz_i05",degrees:["5","3","4","2","3","1"]},
  {family:"Bergonzi Intervallic",name:"bgz_i06",degrees:["1","3","5","7","2","4"]},
  {family:"Bergonzi Intervallic",name:"bgz_i07",degrees:["7","5","3","1","6","4"]},
  // All-fourths patterns
  {family:"Bergonzi Intervallic",name:"bgz_i08",degrees:["1","4","2","5","3","6"]},
  {family:"Bergonzi Intervallic",name:"bgz_i09",degrees:["6","3","5","2","4","1"]},
  {family:"Bergonzi Intervallic",name:"bgz_i10",degrees:["1","4","7","3","6","2"]},
  {family:"Bergonzi Intervallic",name:"bgz_i11",degrees:["5","1","4","7","3","6"]},
  // All-fifths patterns
  {family:"Bergonzi Intervallic",name:"bgz_i12",degrees:["1","5","2","6","3","7"]},
  {family:"Bergonzi Intervallic",name:"bgz_i13",degrees:["7","3","6","2","5","1"]},
  {family:"Bergonzi Intervallic",name:"bgz_i14",degrees:["4","1","5","2","6","3"]},
  // Mixed interval patterns (2nd + 4th)
  {family:"Bergonzi Intervallic",name:"bgz_i15",degrees:["1","2","5","6","2","3"]},
  {family:"Bergonzi Intervallic",name:"bgz_i16",degrees:["3","2","6","5","1","7"]},
  // Mixed interval patterns (3rd + 5th)
  {family:"Bergonzi Intervallic",name:"bgz_i17",degrees:["1","3","7","2","6","1"]},
  {family:"Bergonzi Intervallic",name:"bgz_i18",degrees:["5","3","6","4","7","5"]},
  // Mixed interval patterns (2nd + 3rd alternating)
  {family:"Bergonzi Intervallic",name:"bgz_i19",degrees:["1","2","4","5","7","1"]},
  {family:"Bergonzi Intervallic",name:"bgz_i20",degrees:["1","3","4","6","7","2"]},
  // Wide interval patterns (4th + 5th)
  {family:"Bergonzi Intervallic",name:"bgz_i21",degrees:["1","4","1","5","2","5"]},
  {family:"Bergonzi Intervallic",name:"bgz_i22",degrees:["5","1","5","2","6","2"]},
  // Tritone patterns
  {family:"Bergonzi Intervallic",name:"bgz_i23",degrees:["1","#4","2","b6","3","6"]},
  {family:"Bergonzi Intervallic",name:"bgz_i24",degrees:["#4","1","b6","2","6","3"]},
  // Mixed: 2nd + tritone
  {family:"Bergonzi Intervallic",name:"bgz_i25",degrees:["1","2","#4","#5","2","3"]},
  {family:"Bergonzi Intervallic",name:"bgz_i26",degrees:["5","6","2","3","6","7"]},
  // Chromatic intervallic cells
  {family:"Bergonzi Intervallic",name:"bgz_i27",degrees:["1","b2","3","4","#5","6"]},
  {family:"Bergonzi Intervallic",name:"bgz_i28",degrees:["1","#1","3","#3","5","#5"]},
  // Intervallic enclosures (approach by interval then resolve)
  {family:"Bergonzi Intervallic",name:"bgz_i29",degrees:["4","7","1"]},
  {family:"Bergonzi Intervallic",name:"bgz_i30",degrees:["6","2","3"]},
  {family:"Bergonzi Intervallic",name:"bgz_i31",degrees:["2","5","3"]},
  {family:"Bergonzi Intervallic",name:"bgz_i32",degrees:["b6","2","5"]},
  // Whole-tone intervallic
  {family:"Bergonzi Intervallic",name:"bgz_i33",degrees:["1","2","3","#4","#5","#6"]},
  {family:"Bergonzi Intervallic",name:"bgz_i34",degrees:["#6","#5","#4","3","2","1"]},
  // 6ths patterns
  {family:"Bergonzi Intervallic",name:"bgz_i35",degrees:["1","6","2","7","3","1"]},
  {family:"Bergonzi Intervallic",name:"bgz_i36",degrees:["6","1","7","2","1","3"]},
  // 7ths patterns
  {family:"Bergonzi Intervallic",name:"bgz_i37",degrees:["1","7","2","1","3","2"]},
  {family:"Bergonzi Intervallic",name:"bgz_i38",degrees:["7","1","1","2","2","3"]},
  // Compound intervallic (chained mixed cells)
  {family:"Bergonzi Intervallic",name:"bgz_i39",degrees:["1","3","2","5","4","6","5","7"]},
  {family:"Bergonzi Intervallic",name:"bgz_i40",degrees:["1","4","3","6","5","1","7","3"]},
];

// ── Jazz cell family descriptions ─────────────────────────────────────

export const JAZZ_FAMILY_DESCRIPTIONS: Record<string, string> = {
  "Chord Tone Arpeggios": "Arpeggiated chord tones (1-3-5-7-9) in various orderings — broken, ascending, descending, pendulum, with returns.",
  "Enclosures": "Chromatic or diatonic approach from above and below into a target chord tone. The core bebop ornament.",
  "Bebop Fragments": "Scale runs with chromatic passing tones inserted between diatonic degrees — the bebop scale sound.",
  "Guide-Tone Lines": "Stepwise motion connecting chord tones (3rds and 7ths), forming smooth voice-leading lines across changes.",
  "Bergonzi Pentatonics": "All pentatonic permutations from Bergonzi Vol 1 & 2: major, minor, dominant, Kumoi, Hirajoshi, In-Sen pentatonics — ascending, descending, skip, and superimposition cells.",
  "Bergonzi Digital Patterns": "Digital patterns from Bergonzi Vol 3 (Jazz Line): all 24 permutations of 1235 plus interval variants (1345, 1256, 1357), sequenced through the scale, with chromatic approaches and compound chains.",
  "Bergonzi Triad Pairs": "Triad pair cells from Bergonzi Vol 6 (Developing a Jazz Language): adjacent major/minor/augmented triads in all inversions, permutations, and with chromatic approaches.",
  "Bergonzi Hexatonics": "Six-note scales from Bergonzi Vol 7: two triads combined — major, minor, dominant, augmented hexatonics — in 4-note cells, skip patterns, and compound forms.",
  "Bergonzi Intervallic": "Intervallic melodies from Bergonzi Vol 5: patterns built on all-seconds, all-thirds, all-fourths, all-fifths, mixed intervals, tritones, 6ths, 7ths, and chromatic intervallic cells.",
};

// ── Generative jazz cell engine ───────────────────────────────────────

const CHORD_TONES = ["1", "3", "5", "7"];
const CHORD_TONES_EXT = ["1", "3", "5", "7", "9"];

function generateArpeggio(length: number): string[] {
  const style = randomChoice(["ascending", "descending", "broken", "pendulum", "return"]);
  const pool = length > 5 ? CHORD_TONES_EXT : CHORD_TONES;

  switch (style) {
    case "ascending": {
      const out: string[] = [];
      for (let i = 0; out.length < length; i++) out.push(pool[i % pool.length]);
      return out;
    }
    case "descending": {
      const out: string[] = [];
      for (let i = pool.length - 1; out.length < length; i--) {
        if (i < 0) i = pool.length - 1;
        out.push(pool[i]);
      }
      return out;
    }
    case "broken": {
      // Interleave low and high: 1,7,3,5,9,1,...
      const sorted = [...pool];
      const out: string[] = [];
      let lo = 0, hi = sorted.length - 1;
      while (out.length < length) {
        if (out.length % 2 === 0) { out.push(sorted[lo]); lo = (lo + 1) % sorted.length; }
        else { out.push(sorted[hi]); hi = (hi - 1 + sorted.length) % sorted.length; }
      }
      return out;
    }
    case "pendulum": {
      // Up by thirds then back: 1,5,3,7,5,9,...
      const out: string[] = [];
      let idx = 0, dir = 2;
      for (let i = 0; i < length; i++) {
        out.push(pool[((idx % pool.length) + pool.length) % pool.length]);
        idx += dir;
        dir = i % 2 === 0 ? 2 : -1; // jump up 2, step back 1
      }
      return out;
    }
    case "return":
    default: {
      // 1,3,5,7,5,3,1,...
      const up = pool.slice(0, Math.min(Math.ceil((length + 1) / 2), pool.length));
      const down = [...up].reverse().slice(1);
      const cycle = [...up, ...down];
      const out: string[] = [];
      for (let i = 0; out.length < length; i++) out.push(cycle[i % cycle.length]);
      return out;
    }
  }
}

// Enclosure approach options for each target chord tone
const ENCLOSURE_APPROACHES: Record<string, { above: string[]; below: string[] }> = {
  "1": { above: ["b2", "2"], below: ["7", "b7"] },
  "3": { above: ["4"], below: ["2", "#2"] },
  "5": { above: ["b6", "6"], below: ["#4", "4"] },
  "7": { above: ["8"], below: ["6", "#6"] },
};

function generateEnclosure(length: number): string[] {
  const targets = Object.keys(ENCLOSURE_APPROACHES);
  const target = randomChoice(targets);
  const app = ENCLOSURE_APPROACHES[target];
  const above = randomChoice(app.above);
  const below = randomChoice(app.below);

  if (length <= 3) return [above, below, target];

  // Extended: enclosure + tail of ascending chord tones from target
  const core = [above, below, target];
  const targetIdx = CHORD_TONES.indexOf(target);
  const tail: string[] = [];
  for (let i = 1; tail.length < length - 3; i++) {
    tail.push(CHORD_TONES[(targetIdx + i) % CHORD_TONES.length]);
  }
  return [...core, ...tail];
}

// Chromatic passing tones for bebop scale fragments
const BEBOP_CHROMATICS: Record<string, string> = {
  "1_2": "#1",   // ascending passing tone between 1 and 2 (conceptual, maps via degree map)
  "2_3": "#2",
  "4_5": "#4",
  "5_6": "#5",
  "6_7": "#6",
};
// Descending chromatic insertions
const BEBOP_CHROMATICS_DESC: Record<string, string> = {
  "8_7": "b8",
  "7_6": "b7",
  "6_5": "b6",
  "5_4": "b5",
  "3_2": "b3",
};

function generateBebopFragment(length: number): string[] {
  const scale = ["1", "2", "3", "4", "5", "6", "7", "8"];
  const ascending = Math.random() > 0.4;

  if (ascending) {
    const start = Math.floor(Math.random() * 4); // start on 1-4
    const raw: string[] = [];
    for (let i = start; raw.length < length + 4 && i < scale.length; i++) {
      raw.push(scale[i]);
      // Insert chromatic passing tone with some probability
      if (i + 1 < scale.length) {
        const key = `${scale[i]}_${scale[i + 1]}`;
        const chromatic = BEBOP_CHROMATICS[key];
        if (chromatic && Math.random() > 0.4) raw.push(chromatic);
      }
    }
    return raw.slice(0, length);
  } else {
    const start = 4 + Math.floor(Math.random() * 4); // start on 5-8
    const raw: string[] = [];
    for (let i = start; raw.length < length + 4 && i >= 0; i--) {
      raw.push(scale[i]);
      if (i - 1 >= 0) {
        const key = `${scale[i]}_${scale[i - 1]}`;
        const chromatic = BEBOP_CHROMATICS_DESC[key];
        if (chromatic && Math.random() > 0.4) raw.push(chromatic);
      }
    }
    return raw.slice(0, length);
  }
}

function generateGuideToneLine(length: number): string[] {
  // Guide tones are 3rds and 7ths; connect them stepwise
  const guideTones = ["3", "7"];
  const passingUp: Record<string, string[]> = {
    "3": ["4", "5", "6", "7"],    // 3 → 7 ascending through scale
    "7": ["8", "9"],              // 7 → next 3 (approached as 9→3 or 8→3)
  };
  const passingDown: Record<string, string[]> = {
    "7": ["6", "5", "4", "3"],    // 7 → 3 descending
    "3": ["2", "1"],              // 3 → next 7 below (via 2→1→7)
  };

  const out: string[] = [];
  let current = randomChoice(guideTones);
  out.push(current);

  while (out.length < length) {
    const goUp = Math.random() > 0.5;
    const passing = goUp ? (passingUp[current] ?? ["5"]) : (passingDown[current] ?? ["5"]);
    // Add some passing tones then land on next guide tone
    const passCount = Math.min(length - out.length, 1 + Math.floor(Math.random() * 2));
    for (let i = 0; i < passCount && out.length < length; i++) {
      out.push(passing[i % passing.length]);
    }
    current = current === "3" ? "7" : "3";
  }
  return out.slice(0, length);
}

// ── Bergonzi generative engines ──────────────────────────────────────

const MAJOR_PENT = ["1", "2", "3", "5", "6"];
const MINOR_PENT = ["1", "b3", "4", "5", "b7"];
const DOM_PENT   = ["1", "2", "3", "5", "b7"];
const KUMOI_PENT = ["1", "2", "b3", "5", "6"];
const HIRAJOSHI  = ["1", "2", "b3", "5", "b6"];
const IN_SEN     = ["1", "b2", "4", "5", "b7"];
const ALL_PENTS  = [MAJOR_PENT, MINOR_PENT, DOM_PENT, KUMOI_PENT, HIRAJOSHI, IN_SEN];

function generateBergonziPentatonic(length: number): string[] {
  const pent = randomChoice(ALL_PENTS);
  const style = randomChoice(["ascending", "descending", "skip", "pendulum"]);
  const out: string[] = [];

  switch (style) {
    case "ascending": {
      const start = Math.floor(Math.random() * pent.length);
      for (let i = 0; out.length < length; i++) out.push(pent[(start + i) % pent.length]);
      break;
    }
    case "descending": {
      const start = Math.floor(Math.random() * pent.length);
      for (let i = 0; out.length < length; i++) out.push(pent[((start - i) % pent.length + pent.length) % pent.length]);
      break;
    }
    case "skip": {
      const start = Math.floor(Math.random() * pent.length);
      const step = randomChoice([2, 3]);
      for (let i = 0; out.length < length; i++) out.push(pent[(start + i * step) % pent.length]);
      break;
    }
    case "pendulum": {
      let lo = 0, hi = pent.length - 1;
      while (out.length < length) {
        out.push(pent[lo]); lo++;
        if (out.length < length) { out.push(pent[hi]); hi--; }
        if (lo > hi) { lo = 0; hi = pent.length - 1; }
      }
      break;
    }
  }
  return out.slice(0, length);
}

const DIGITAL_BASE = ["1", "2", "3", "4", "5", "6", "7"];

function generateBergonziDigital(length: number): string[] {
  // Pick a 4-note digital cell permutation and optionally sequence it
  const startDeg = Math.floor(Math.random() * 7);
  const cellSize = Math.min(4, length);
  // Base cells: 1235 (skip 4th), 1345 (skip 2nd), 1256 (skip 3-4), 1357 (thirds)
  const bases = [[0,1,2,4],[0,2,3,4],[0,1,4,5],[0,2,4,6]];
  const base = randomChoice(bases);
  // Generate all 24 permutations of the chosen base
  const shapes: number[][] = [];
  for (let a = 0; a < 4; a++)
    for (let b = 0; b < 4; b++)
      for (let c = 0; c < 4; c++)
        for (let d = 0; d < 4; d++)
          if (a !== b && a !== c && a !== d && b !== c && b !== d && c !== d)
            shapes.push([base[a], base[b], base[c], base[d]]);
  const shape = randomChoice(shapes);
  const out: string[] = [];

  // Sequence through scale degrees
  let degOffset = startDeg;
  while (out.length < length) {
    for (let i = 0; i < cellSize && out.length < length; i++) {
      const idx = (degOffset + shape[i]) % 7;
      out.push(DIGITAL_BASE[idx]);
    }
    degOffset = (degOffset + 1) % 7; // move up one scale degree
  }
  return out.slice(0, length);
}

function generateBergonziTriadPair(length: number): string[] {
  // Pick two adjacent triads from diatonic collection
  const triadRoots = [
    { root: 0, notes: ["1", "3", "5"] },
    { root: 1, notes: ["2", "4", "6"] },
    { root: 2, notes: ["3", "5", "7"] },
    { root: 3, notes: ["4", "6", "1"] },
    { root: 4, notes: ["5", "7", "2"] },
    { root: 5, notes: ["6", "1", "3"] },
  ];
  const idx = Math.floor(Math.random() * (triadRoots.length - 1));
  const t1 = triadRoots[idx].notes;
  const t2 = triadRoots[idx + 1].notes;

  // Permute each triad independently
  const perms = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  const p1 = randomChoice(perms);
  const p2 = randomChoice(perms);

  const ascending = Math.random() > 0.4;
  const cell = ascending
    ? [...p1.map(i => t1[i]), ...p2.map(i => t2[i])]
    : [...p2.map(i => t2[i]).reverse(), ...p1.map(i => t1[i]).reverse()];

  // Repeat / truncate to target length
  const out: string[] = [];
  for (let i = 0; out.length < length; i++) out.push(cell[i % cell.length]);
  return out.slice(0, length);
}

function generateBergonziHexatonic(length: number): string[] {
  // Build a hexatonic scale from two triads
  const hexScales = [
    ["1", "2", "3", "#4", "5", "6"],     // I + II
    ["1", "b3", "4", "5", "6", "1"],     // i + IV
    ["1", "2", "4", "5", "6", "b7"],     // V + IV
    ["1", "3", "#5", "b6", "1", "b3"],   // augmented
  ];
  const hex = randomChoice(hexScales);
  const style = randomChoice(["ascending", "descending", "skip", "cell4"]);
  const out: string[] = [];

  switch (style) {
    case "ascending": {
      const start = Math.floor(Math.random() * hex.length);
      for (let i = 0; out.length < length; i++) out.push(hex[(start + i) % hex.length]);
      break;
    }
    case "descending": {
      const start = Math.floor(Math.random() * hex.length);
      for (let i = 0; out.length < length; i++) out.push(hex[((start - i) % hex.length + hex.length) % hex.length]);
      break;
    }
    case "skip": {
      const start = Math.floor(Math.random() * hex.length);
      for (let i = 0; out.length < length; i++) {
        out.push(hex[(start + i) % hex.length]);
        if (out.length < length) out.push(hex[(start + i + 2) % hex.length]);
      }
      break;
    }
    case "cell4": {
      // 4-note cells through hexatonic, sequencing up
      const start = Math.floor(Math.random() * hex.length);
      let offset = start;
      while (out.length < length) {
        for (let j = 0; j < 4 && out.length < length; j++) {
          out.push(hex[(offset + j) % hex.length]);
        }
        offset++;
      }
      break;
    }
  }
  return out.slice(0, length);
}

function generateBergonziIntervallic(length: number): string[] {
  const scale = ["1", "2", "3", "4", "5", "6", "7"];
  // Interval jump sizes: 2=seconds, 3=thirds, 4=fourths, 5=fifths
  const intervalType = randomChoice([2, 3, 4, 5]);
  const ascending = Math.random() > 0.4;
  const mixed = Math.random() > 0.6; // alternate up/down
  const start = Math.floor(Math.random() * 7);

  const out: string[] = [];
  let pos = start;

  if (mixed) {
    // Alternating: step up by interval, step down by different interval
    const interval2 = intervalType === 2 ? 3 : 2;
    for (let i = 0; out.length < length; i++) {
      out.push(scale[((pos % 7) + 7) % 7]);
      pos += (i % 2 === 0) ? intervalType : -interval2;
    }
  } else {
    for (let i = 0; out.length < length; i++) {
      out.push(scale[((pos % 7) + 7) % 7]);
      pos += ascending ? intervalType : -intervalType;
    }
  }
  return out.slice(0, length);
}

/**
 * Generate a jazz cell procedurally for the given family and target length.
 * Falls back to the fixed bank if generation fails.
 */
export function generateJazzCell(
  family: string,
  length: number,
): { degrees: string[]; family: string; name: string } {
  let degrees: string[];
  switch (family) {
    case "Chord Tone Arpeggios":      degrees = generateArpeggio(length); break;
    case "Enclosures":                degrees = generateEnclosure(length); break;
    case "Bebop Fragments":           degrees = generateBebopFragment(length); break;
    case "Guide-Tone Lines":          degrees = generateGuideToneLine(length); break;
    case "Bergonzi Pentatonics":      degrees = generateBergonziPentatonic(length); break;
    case "Bergonzi Digital Patterns":  degrees = generateBergonziDigital(length); break;
    case "Bergonzi Triad Pairs":      degrees = generateBergonziTriadPair(length); break;
    case "Bergonzi Hexatonics":       degrees = generateBergonziHexatonic(length); break;
    case "Bergonzi Intervallic":      degrees = generateBergonziIntervallic(length); break;
    default: {
      // Fallback to bank
      const pool = JAZZ_CELL_BANK_31.filter(c => c.family === family);
      const pick = pool.length ? randomChoice(pool) : { degrees: ["1", "3", "5"], name: "fallback" };
      return { degrees: pick.degrees, family, name: pick.name };
    }
  }
  return { degrees, family, name: `gen_${family.slice(0, 3)}_${Date.now().toString(36)}` };
}

// ── Pattern Sequences ─────────────────────────────────────────────────

export const PATTERN_SCALE_FAMILIES: Record<string, string[]> = {
  "Major Family": ["Ionian","Dorian","Phrygian","Lydian","Mixolydian","Aeolian","Locrian"],
  "Harmonic Minor Family": ["Harmonic Minor","Locrian #6","Ionian #5","Dorian #4","Phrygian Dominant","Lydian #2","Ultralocrian"],
  "Melodic Minor Family": ["Melodic Minor","Dorian b2","Lydian Augmented","Lydian Dominant","Mixolydian b6","Locrian #2","Altered"],
};

export const PATTERN_SEQUENCE_FAMILIES = [
  "Scalar Sequences","Interval Chains","Skip Patterns","Cell Sequences",
  "Triad Sequences","Seventh-Chord Sequences","Quartal / Quintal Sequences",
  "Neighbor / Enclosure Patterns","Contour Patterns","Rotational Sequences",
  "Within-Octave Patterns","Extended Patterns","Interval Inversion Pairs",
];

const PATTERN_SCALE_MAPS_31: Record<string, Record<string, Record<string, number>>> = {
  "Major Family": {
    "Ionian":     {"1":0,"2":5,"3":10,"4":13,"5":18,"6":23,"7":28},
    "Dorian":     {"1":0,"2":5,"b3":8,"4":13,"5":18,"6":23,"b7":26},
    "Phrygian":   {"1":0,"b2":3,"b3":8,"4":13,"5":18,"b6":21,"b7":26},
    "Lydian":     {"1":0,"2":5,"3":10,"#4":15,"5":18,"6":23,"7":28},
    "Mixolydian": {"1":0,"2":5,"3":10,"4":13,"5":18,"6":23,"b7":26},
    "Aeolian":    {"1":0,"2":5,"b3":8,"4":13,"5":18,"b6":21,"b7":26},
    "Locrian":    {"1":0,"b2":3,"b3":8,"4":13,"b5":16,"b6":21,"b7":26},
  },
  "Harmonic Minor Family": {
    "Harmonic Minor":   {"1":0,"2":5,"b3":8,"4":13,"5":18,"b6":21,"7":28},
    "Locrian #6":       {"1":0,"b2":3,"b3":8,"4":13,"b5":16,"6":23,"b7":26},
    "Ionian #5":        {"1":0,"2":5,"3":10,"4":13,"#5":21,"6":23,"7":28},
    "Dorian #4":        {"1":0,"2":5,"b3":8,"#4":15,"5":18,"6":23,"b7":26},
    "Phrygian Dominant":{"1":0,"b2":3,"3":10,"4":13,"5":18,"b6":21,"b7":26},
    "Lydian #2":        {"1":0,"#2":8,"3":10,"#4":15,"5":18,"6":23,"7":28},
    "Ultralocrian":     {"1":0,"b2":3,"b3":8,"3":10,"b5":16,"b6":21,"6":23},
  },
  "Melodic Minor Family": {
    "Melodic Minor":    {"1":0,"2":5,"b3":8,"4":13,"5":18,"6":23,"7":28},
    "Dorian b2":        {"1":0,"b2":3,"b3":8,"4":13,"5":18,"6":23,"b7":26},
    "Lydian Augmented": {"1":0,"2":5,"3":10,"#4":15,"#5":21,"6":23,"7":28},
    "Lydian Dominant":  {"1":0,"2":5,"3":10,"#4":15,"5":18,"6":23,"b7":26},
    "Mixolydian b6":    {"1":0,"2":5,"3":10,"4":13,"5":18,"b6":21,"b7":26},
    "Locrian #2":       {"1":0,"2":5,"b3":8,"4":13,"b5":16,"b6":21,"b7":26},
    "Altered":          {"1":0,"b2":3,"#2":8,"3":10,"b5":16,"#5":21,"b7":26},
  },
};

export function getModeDegreeMap31(scaleFam: string, modeName: string): Record<string, number> {
  const fam = PATTERN_SCALE_MAPS_31[scaleFam];
  if (!fam) return DEGREE_MAP_MAJOR_31;
  return fam[modeName] ?? DEGREE_MAP_MAJOR_31;
}

export function getScaleDiatonicSteps(scaleFam: string, modeName: string, edo = 31): number[] {
  if (edo !== 31) {
    const modeMap = getModeDegreeMap(edo, scaleFam, modeName);
    const vals = Object.values(modeMap).sort((a, b) => a - b);
    return vals.length ? vals : [0];
  }
  const fam = PATTERN_SCALE_MAPS_31[scaleFam];
  if (!fam) return [0,5,10,13,18,23,28];
  const modeMap = fam[modeName];
  if (!modeMap) return [0,5,10,13,18,23,28];
  return Object.values(modeMap).sort((a,b)=>a-b);
}

export function generatePatternSteps(scaleSteps: number[], startIdx: number, style: string, length: number, edo = 31): number[] {
  const n = scaleSteps.length;
  const EDO = edo;
  const idxToStep = (i: number) => {
    let o = Math.floor(i / n); let l = ((i % n) + n) % n;
    if (i < 0 && i % n !== 0) o = Math.floor(i / n);
    return scaleSteps[l] + o * EDO;
  };
  const idxs: number[] = [];
  if (style === "asc")       for (let i=0;i<length;i++) idxs.push(startIdx+i);
  else if (style === "desc") for (let i=0;i<length;i++) idxs.push(startIdx-i);
  else if (style === "arch") {
    const pk = Math.floor((length+1)/2);
    for (let i=0;i<pk;i++) idxs.push(startIdx+i);
    for (let i=0;i<length-pk;i++) idxs.push(startIdx+pk-1-i);
  }
  else if (style === "valley") {
    const tr = Math.floor((length+1)/2);
    for (let i=0;i<tr;i++) idxs.push(startIdx-i);
    for (let i=0;i<length-tr;i++) idxs.push(startIdx-tr+1+i);
  }
  else if (style === "skip2") for (let i=0;i<length;i++) idxs.push(startIdx+i*2);
  else if (style === "skip3") for (let i=0;i<length;i++) idxs.push(startIdx+i*3);
  else if (style === "cell2") {
    const cell=[0,2];
    for (let i=0;i<length;i++) idxs.push(startIdx+cell[i%2]+Math.floor(i/2));
  }
  else if (style === "cell3") {
    const cell=[0,2,4];
    for (let i=0;i<length;i++) idxs.push(startIdx+cell[i%3]+Math.floor(i/3));
  }
  else if (style === "neighbor") {
    const pat=[0,1,-1,0,1,2,0,1,-1,2];
    for (let i=0;i<length;i++) idxs.push(startIdx+pat[i%pat.length]+Math.floor(i/pat.length)*2);
  }
  else if (style === "rotate") {
    const msz=Math.min(3,length);
    for (let i=0;i<length;i++) idxs.push(startIdx+(i%msz)+Math.floor(i/msz));
  }
  else if (style === "asc_desc") {
    const half=Math.floor((length+1)/2);
    for (let i=0;i<half;i++) idxs.push(startIdx+i);
    for (let i=0;i<length-half;i++) idxs.push(startIdx+half-i);
  }
  else for (let i=0;i<length;i++) idxs.push(startIdx+i);
  return idxs.map(idxToStep);
}

export const FAMILY_TO_STYLES: Record<string,string[]> = {
  "Scalar Sequences":            ["asc","desc"],
  "Interval Chains":             ["skip2_alt","skip3_alt","skip2","skip3"],
  "Skip Patterns":               ["skip2","skip3"],
  "Cell Sequences":              ["cell2","cell3"],
  "Triad Sequences":             ["skip2"],
  "Seventh-Chord Sequences":     ["skip2"],
  "Quartal / Quintal Sequences": ["skip3"],
  "Neighbor / Enclosure Patterns":["neighbor"],
  "Contour Patterns":            ["arch","valley"],
  "Rotational Sequences":        ["rotate"],
  "Within-Octave Patterns":      ["asc","desc"],
  "Extended Patterns":           ["asc","skip2","arch"],
  "Interval Inversion Pairs":    ["asc_desc"],
};

export function buildDynamicPatternLine(
  edo: number, tonicPc: number, lowestOff: number, highestOff: number,
  scaleFam: string, modeName: string, length: number, checkedFams: string[],
  styleOverride?: string
): [number[], string] | null {
  const scaleSteps = getScaleDiatonicSteps(scaleFam, modeName, edo);
  const n = scaleSteps.length;
  if (!n) return null;
  let styles: string[] = [];
  for (const f of checkedFams) styles.push(...(FAMILY_TO_STYLES[f] ?? ["asc"]));
  if (!styles.length) styles = ["asc","desc","skip2","arch","cell2"];
  const style = styleOverride ?? randomChoice(styles);
  const startIdx = Math.floor(Math.random() * n);
  const rawSteps = generatePatternSteps(scaleSteps, startIdx, style, length, edo);
  if (!rawSteps.length) return null;
  const offset = rawSteps[0];
  const normSteps = rawSteps.map(s => s - offset);
  const startOff = lowestOff + Math.floor(Math.random() * (highestOff - lowestOff + 1));
  const base = tonicPc + (startOff - 4) * edo + offset;
  const lineAbs = normSteps.map(s => base + s);
  const [low, high] = strictWindowBounds(tonicPc, edo, lowestOff, highestOff);
  const fitted = fitLineIntoWindow(lineAbs, edo, low, high);
  return fitted.length ? [fitted, style] : null;
}

export function fitLineIntoWindow(lineAbs: number[], edo: number, low: number, high: number): number[] {
  for (let k = -8; k <= 8; k++) {
    const trial = lineAbs.map(n => n + k * edo);
    if (Math.min(...trial) >= low && Math.max(...trial) < high) return trial;
  }
  const out: number[] = [];
  let prev: number | null = null;
  for (const n of lineAbs) {
    const cands: number[] = [];
    for (let k = -8; k <= 8; k++) {
      const c = n + k * edo;
      if (c >= low && c < high) cands.push(c);
    }
    if (!cands.length) return [];
    const chosen: number = prev === null
      ? cands.reduce((a,b) => Math.abs(b-n)<Math.abs(a-n)?b:a)
      : cands.reduce((a,b) => Math.abs(b-prev!)<Math.abs(a-prev!)?b:a);
    out.push(chosen);
    prev = chosen;
  }
  return out;
}

// ── Chord Drones ──────────────────────────────────────────────────────

export const CHORD_DRONE_TYPES_31: Record<string, number[]> = {
  "Major Triad":       [0,10,18],
  "Minor Triad":       [0,8,18],
  "Diminished Triad":  [0,8,16],
  "Augmented Triad":   [0,10,21],
  "Sus2 Triad":        [0,5,18],
  "Sus4 Triad":        [0,13,18],
  "Major 7":           [0,10,18,28],
  "Dominant 7":        [0,10,18,26],
  "Minor 7":           [0,8,18,26],
  "Minor Maj7":        [0,8,18,28],
  "Half-Dim 7":        [0,8,16,26],
  "Diminished 7":      [0,8,16,24],
  "Augmented Maj7":    [0,10,21,28],
  "Dominant 7 Sus4":   [0,13,18,26],
};

// ── QPP ───────────────────────────────────────────────────────────────

export const QPP_TARGET_TYPES = [
  "Single Notes","Intervals","Triads","7th Chords","Clusters","Spread Voicings"
];

export function qppGenerate(
  edo: number, tonicPc: number, lowestOff: number, highestOff: number, kinds: string[]
): { kind: string; notes: number[]; label: string } | null {
  const [low, high] = strictWindowBounds(tonicPc, edo, lowestOff, highestOff);
  const roots = Array.from({length: high - low}, (_, i) => low + i);
  const pick = () => randomChoice(kinds);

  const kind = pick();
  if (kind === "Single Notes") {
    const n = randomChoice(roots);
    return { kind, notes: [n], label: `Single Note: ${n}` };
  }
  if (kind === "Intervals") {
    const steps = [3,5,8,10,13,15,18,21,23,26,28];
    for (let i = 0; i < 20; i++) {
      const root = randomChoice(roots);
      const step = randomChoice(steps);
      const sign = Math.random() < 0.5 ? 1 : -1;
      const n2 = root + sign * step;
      if (n2 >= low && n2 < high) {
        const notes = [root, n2].sort((a,b)=>a-b);
        return { kind, notes, label: `Interval +${step}: [${notes}]` };
      }
    }
    return null;
  }
  if (kind === "Triads") {
    const shapes: [string, number[]][] = [["Major",[0,10,18]],["Minor",[0,8,18]],["Dim",[0,8,16]]];
    for (let i = 0; i < 20; i++) {
      const root = randomChoice(roots);
      const [name, shape] = randomChoice(shapes);
      const notes = shape.map(s => root + s);
      if (notes.every(n => n >= low && n < high)) return { kind, notes, label: `${name} Triad: [${notes}]` };
    }
    return null;
  }
  if (kind === "7th Chords") {
    const shapes: [string, number[]][] = [["Maj7",[0,10,18,28]],["Dom7",[0,10,18,26]],["Min7",[0,8,18,26]],["HalfDim7",[0,8,16,26]]];
    for (let i = 0; i < 20; i++) {
      const root = randomChoice(roots);
      const [name, shape] = randomChoice(shapes);
      const notes = shape.map(s => root + s);
      if (notes.every(n => n >= low && n < high)) return { kind, notes, label: `${name}: [${notes}]` };
    }
    return null;
  }
  if (kind === "Clusters") {
    const root = randomChoice(roots);
    const count = 3 + Math.floor(Math.random() * 3);
    const notes = [root];
    let cur = root;
    for (let i = 1; i < count; i++) {
      cur += 1 + Math.floor(Math.random() * 4);
      if (cur >= high) return null;
      notes.push(cur);
    }
    return { kind, notes, label: `Cluster: [${notes}]` };
  }
  if (kind === "Spread Voicings") {
    for (let i = 0; i < 20; i++) {
      const root = randomChoice(roots);
      const notes = [root, root+10, root+18+edo];
      if (notes.every(n => n >= low && n < high)) return { kind, notes, label: `Spread Voicing: [${notes}]` };
    }
    return null;
  }
  return null;
}

// ── Polyphonic Realization — Bass & Melody generators ─────────────────

/**
 * Build a "composite scale" from the union of all chord-tone pitch classes.
 * Returns a sorted array of pitch classes (0..edo-1) relative to tonic.
 */
export function buildCompositeScale(appliedShapes: number[][], edo: number): number[] {
  const pcs = new Set<number>();
  for (const shape of appliedShapes) {
    for (const step of shape) {
      pcs.add(((step % edo) + edo) % edo);
    }
  }
  return [...pcs].sort((a, b) => a - b);
}

/** Find the nearest pitch class in `scale` to `target` (mod edo). */
function nearestScalePc(target: number, scale: number[], edo: number): number {
  let best = scale[0];
  let bestDist = edo;
  for (const pc of scale) {
    const d = Math.min(((target - pc) % edo + edo) % edo, ((pc - target) % edo + edo) % edo);
    if (d < bestDist) { bestDist = d; best = pc; }
  }
  return best;
}

/** Place a pitch class in a specific octave (offset from octave 4). */
function pcToAbs(pc: number, tonicPc: number, edo: number, octOff: number): number {
  return tonicPc + (octOff - 4) * edo + pc;
}

/** Voice-lead: place `pc` in the octave closest to `prev` absolute pitch. */
function voiceLeadTo(pc: number, prev: number, tonicPc: number, edo: number): number {
  // Find the occurrence of this pc nearest to prev
  const base = tonicPc + pc;
  let note = base;
  while (note < prev - edo / 2) note += edo;
  while (note > prev + edo / 2) note -= edo;
  return note;
}

/**
 * Voice-leading checklist — score how well `curr` voice-leads from `prev`.
 * Lower is smoother. Used by the looping mode to pick the best (octave,
 * voicing pattern) combination from the user's allowed-patterns set.
 *
 * Criteria (additively combined):
 *   1. Sum of squared sorted-pair voice motion — a single big leap costs
 *      more than several small steps (encourages stepwise motion).
 *   2. Common-tone bonus — every preserved exact pitch shaves 4 from the
 *      score (≈ a 2-semitone equivalent move), tilting toward voicings
 *      that retain shared tones at the same octave.
 *   3. Voice-count penalty — adding or dropping voices vs prev costs 6
 *      per voice difference, biasing toward consistent texture density.
 *   4. Bass-leap penalty — bass motion beyond a P5 (7 EDO steps) adds 8,
 *      since bass jumps tend to fragment a progression more than upper-
 *      voice leaps.
 *
 * Returns 0 if either chord is empty (no voice-leading possible).
 */
export function scoreVoiceLeading(curr: number[], prev: number[], edo: number): number {
  if (prev.length === 0 || curr.length === 0) return 0;

  const sortedCurr = [...curr].sort((a, b) => a - b);
  const sortedPrev = [...prev].sort((a, b) => a - b);
  const minLen = Math.min(sortedCurr.length, sortedPrev.length);

  let score = 0;

  // 1. Sum of squared voice motion (sorted-pair matching).
  for (let i = 0; i < minLen; i++) {
    const motion = Math.abs(sortedCurr[i] - sortedPrev[i]);
    score += motion * motion;
  }

  // 2. Common-tone bonus.
  const prevSet = new Set(sortedPrev);
  for (const n of sortedCurr) {
    if (prevSet.has(n)) score -= 4;
  }

  // 3. Voice-count mismatch penalty.
  score += Math.abs(sortedCurr.length - sortedPrev.length) * 6;

  // 4. Bass-leap penalty (motion beyond a P5).
  const bassMove = Math.abs(sortedCurr[0] - sortedPrev[0]);
  const p5Steps = Math.round(edo * 7 / 12);
  if (bassMove > p5Steps) score += 8;

  return score;
}

/**
 * Generate a bass line from the applied chord shapes.
 *
 * @param appliedShapes - One shape per chord (post applyChordType), relative steps from tonic
 * @param edo - Equal division of octave
 * @param tonicPc - Tonic pitch class in absolute terms
 * @param bassOct - Octave offset for bass register
 * @param mode - Bass mode
 * @returns Array of frames (each frame = array of absolute note values)
 */
export function generateBassLine(
  appliedShapes: number[][], edo: number, tonicPc: number,
  bassOct: number, mode: "root" | "root-fifth" | "passing" | "walking"
): number[][] {
  const n = appliedShapes.length;
  if (n === 0) return [];
  const frames: number[][] = [];
  const scale = buildCompositeScale(appliedShapes, edo);

  // Extract root and fifth PCs for each chord
  const roots = appliedShapes.map(s => ((s[0] % edo) + edo) % edo);
  const fifths = appliedShapes.map(s => s.length >= 3 ? ((s[2] % edo) + edo) % edo : ((s[0] % edo) + edo) % edo);

  if (mode === "root") {
    for (let i = 0; i < n; i++) {
      frames.push([pcToAbs(roots[i], tonicPc, edo, bassOct)]);
    }
  } else if (mode === "root-fifth") {
    for (let i = 0; i < n; i++) {
      frames.push([pcToAbs(roots[i], tonicPc, edo, bassOct)]);
      frames.push([pcToAbs(fifths[i], tonicPc, edo, bassOct)]);
    }
  } else if (mode === "passing") {
    for (let i = 0; i < n; i++) {
      const curRoot = pcToAbs(roots[i], tonicPc, edo, bassOct);
      const nextRootPc = roots[(i + 1) % n];
      const nextRoot = pcToAbs(nextRootPc, tonicPc, edo, bassOct);
      frames.push([curRoot]);
      // Find passing tone: scale PC closest to midpoint between roots
      const mid = ((roots[i] + nextRootPc) / 2 + edo) % edo;
      const passPc = nearestScalePc(Math.round(mid), scale.filter(pc => pc !== roots[i] && pc !== nextRootPc), edo);
      let passNote = pcToAbs(passPc, tonicPc, edo, bassOct);
      // Place passing tone between curRoot and nextRoot
      if (nextRoot > curRoot && passNote < curRoot) passNote += edo;
      else if (nextRoot < curRoot && passNote > curRoot) passNote -= edo;
      frames.push([passNote]);
    }
  } else if (mode === "walking") {
    for (let i = 0; i < n; i++) {
      const curRootPc = roots[i];
      const nextRootPc = roots[(i + 1) % n];
      const curRoot = pcToAbs(curRootPc, tonicPc, edo, bassOct);

      frames.push([curRoot]);

      // Walk stepwise through composite scale toward next root
      // Direction: shortest path
      const upDist = ((nextRootPc - curRootPc) % edo + edo) % edo;
      const goUp = upDist <= edo / 2;
      const sortedScale = goUp ? [...scale] : [...scale].reverse();

      // Find current position in scale
      let curPc = curRootPc;
      const walkNotes: number[] = [];
      for (let step = 0; step < 2; step++) {
        // Find next scale tone in the chosen direction
        let nextPc: number | null = null;
        if (goUp) {
          for (const pc of sortedScale) {
            if (((pc - curPc) % edo + edo) % edo > 0 && ((pc - curPc) % edo + edo) % edo <= edo / 2) {
              nextPc = pc; break;
            }
          }
        } else {
          for (const pc of sortedScale) {
            if (((curPc - pc) % edo + edo) % edo > 0 && ((curPc - pc) % edo + edo) % edo <= edo / 2) {
              nextPc = pc; break;
            }
          }
        }
        if (nextPc === null) break;
        curPc = nextPc;
        walkNotes.push(pcToAbs(curPc, tonicPc, edo, bassOct));
      }

      // Approach tone: chromatic neighbor of next root
      const approachPc = goUp
        ? ((nextRootPc - 1) % edo + edo) % edo
        : ((nextRootPc + 1) % edo + edo) % edo;
      const approachNote = pcToAbs(approachPc, tonicPc, edo, bassOct);

      for (const wn of walkNotes) frames.push([wn]);
      frames.push([approachNote]);
    }
  }

  return frames;
}

/**
 * Generate a melody line from the applied chord shapes.
 *
 * @param appliedShapes - One shape per chord (post applyChordType), relative steps from tonic
 * @param edo - Equal division of octave
 * @param tonicPc - Tonic pitch class in absolute terms
 * @param melodyOct - Octave offset for melody register
 * @param mode - Melody mode
 * @returns Array of frames (each frame = [singleNote])
 */
export function generateMelodyLine(
  appliedShapes: number[][], edo: number, tonicPc: number,
  melodyOct: number, mode: "chord-tone" | "scalar" | "arpeggiate"
): number[][] {
  const n = appliedShapes.length;
  if (n === 0) return [];
  const frames: number[][] = [];
  const scale = buildCompositeScale(appliedShapes, edo);

  // For each chord, extract chord tone PCs (relative to tonic)
  const chordToneSets = appliedShapes.map(shape =>
    shape.map(s => ((s % edo) + edo) % edo)
  );

  // Weights for chord tone selection: prefer 3rd, then 5th, then root
  const pickChordTone = (tones: number[]): number => {
    if (tones.length >= 3) {
      const weights = [1, 3, 2]; // root=1, 3rd=3, 5th=2
      // extend weights for 7ths etc
      for (let i = 3; i < tones.length; i++) weights.push(2);
      const total = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      for (let i = 0; i < tones.length; i++) {
        r -= weights[i];
        if (r <= 0) return tones[i];
      }
    }
    return tones[Math.floor(Math.random() * tones.length)];
  };

  if (mode === "chord-tone") {
    let prev = pcToAbs(chordToneSets[0][0], tonicPc, edo, melodyOct);
    for (let i = 0; i < n; i++) {
      const pc = pickChordTone(chordToneSets[i]);
      const note = voiceLeadTo(pc, prev, tonicPc, edo);
      frames.push([note]);
      prev = note;
    }
  } else if (mode === "scalar") {
    let prev = pcToAbs(chordToneSets[0][0], tonicPc, edo, melodyOct);
    for (let i = 0; i < n; i++) {
      // Main chord tone
      const mainPc = pickChordTone(chordToneSets[i]);
      const mainNote = voiceLeadTo(mainPc, prev, tonicPc, edo);
      frames.push([mainNote]);

      // Passing tone toward next chord
      const nextPc = pickChordTone(chordToneSets[(i + 1) % n]);
      const nextNote = voiceLeadTo(nextPc, mainNote, tonicPc, edo);
      // Find a scale tone between mainNote and nextNote
      const dir = nextNote > mainNote ? 1 : -1;
      let passPc: number | null = null;
      const mainPcMod = ((mainNote - tonicPc) % edo + edo) % edo;
      const nextPcMod = ((nextNote - tonicPc) % edo + edo) % edo;
      if (dir > 0) {
        for (const pc of scale) {
          const d = ((pc - mainPcMod) % edo + edo) % edo;
          if (d > 0 && d < ((nextPcMod - mainPcMod) % edo + edo) % edo) { passPc = pc; break; }
        }
      } else {
        for (let j = scale.length - 1; j >= 0; j--) {
          const pc = scale[j];
          const d = ((mainPcMod - pc) % edo + edo) % edo;
          if (d > 0 && d < ((mainPcMod - nextPcMod) % edo + edo) % edo) { passPc = pc; break; }
        }
      }
      if (passPc !== null) {
        frames.push([voiceLeadTo(passPc, mainNote, tonicPc, edo)]);
      } else {
        // Neighbor tone: one scale step above or below
        const neighbor = dir > 0
          ? scale.find(pc => ((pc - mainPcMod) % edo + edo) % edo > 0) ?? mainPcMod
          : [...scale].reverse().find(pc => ((mainPcMod - pc) % edo + edo) % edo > 0) ?? mainPcMod;
        frames.push([voiceLeadTo(neighbor, mainNote, tonicPc, edo)]);
      }
      prev = frames[frames.length - 1][0];
    }
  } else if (mode === "arpeggiate") {
    let prev = pcToAbs(chordToneSets[0][0], tonicPc, edo, melodyOct);
    for (let i = 0; i < n; i++) {
      const tones = chordToneSets[i];
      const ascending = i % 2 === 0;
      const ordered = ascending ? [...tones] : [...tones].reverse();
      for (const pc of ordered) {
        const note = voiceLeadTo(pc, prev, tonicPc, edo);
        frames.push([note]);
        prev = note;
      }
    }
  }

  return frames;
}

// ── Utilities ─────────────────────────────────────────────────────────

export function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function intervalLabel(steps: number, edo: number): string {
  const octs = Math.floor(steps / edo);
  const rem = steps % edo;
  const names = getIntervalNames(edo);
  const name = names[rem] ?? `${rem}`;
  const solfege = getSolfege(edo);
  const sol = solfege?.[rem] ?? "";
  const base = sol ? `${name} (${sol})` : name;
  return octs === 0 ? base : `${base}+${octs}oct`;
}

function octaveShiftLabel(edo: number, shift: number): string {
  const n = Math.round(shift / edo);
  if (n === 0) return "0o";
  return n > 0 ? `+${n}o` : `${n}o`;
}

export function describeChord(chordAbs: number[], rootAbs: number, edo: number): string {
  if (!chordAbs.length) return "[]";
  const c = [...chordAbs].sort((a,b)=>a-b);
  const bass = c[0];
  const toneNames = c.map(n => intervalLabel(((n - rootAbs) % edo + edo) % edo, edo));
  const gaps: string[] = [];
  for (let i = 0; i < c.length - 1; i++) gaps.push(intervalLabel(c[i+1] - c[i], edo));
  const shifts = c.map(n => {
    const rem = ((n - bass) % edo + edo) % edo;
    return octaveShiftLabel(edo, n - (bass + rem));
  });
  const allZero = shifts.every(s => s === "0o");
  return [
    `Names:  [${toneNames.join(", ")}]`,
    `Gaps:   [${gaps.length ? gaps.join(", ") : "(single)"}]`,
    `Δ:      ${allZero ? "none" : "[" + shifts.join(", ") + "]"}`,
  ].join("\n");
}

// ── Low Interval Limit (LIL) check ──────────────────────────────────
// Returns an array of warning strings for intervals that are too tight
// given the register of the lower note. Thresholds (in 12-EDO semitones):
//   Below C2 (abs < -2·edo): need ≥ octave
//   C2–G2:                   need ≥ P5
//   G2–C3:                   need ≥ P4
//   C3–C4:                   need ≥ m3
//   Above C4:                anything OK

export interface LilWarning {
  lowerNoteAbs: number;
  upperNoteAbs: number;
  gapSteps: number;
  minSteps: number;
  region: string;
}

export function checkLowIntervalLimits(chordAbs: number[], edo: number): LilWarning[] {
  if (chordAbs.length < 2) return [];
  const c = [...chordAbs].sort((a, b) => a - b);

  // EDO-scaled thresholds: approximate the 12-EDO intervals in any EDO
  const octave = edo;
  const p5 = Math.round(edo * 7 / 12);
  const p4 = Math.round(edo * 5 / 12);
  const m3 = Math.round(edo * 3 / 12);

  // Region boundaries (absolute note positions, where 0 = C4)
  const c2 = -2 * edo;
  const g2 = -2 * edo + p5;
  const c3 = -1 * edo;

  const warnings: LilWarning[] = [];
  for (let i = 0; i < c.length - 1; i++) {
    const lo = c[i];
    const hi = c[i + 1];
    const gap = hi - lo;

    let minSteps: number;
    let region: string;
    if (lo < c2) {
      minSteps = octave; region = "below C2";
    } else if (lo < g2) {
      minSteps = p5; region = "C2–G2";
    } else if (lo < c3) {
      minSteps = p4; region = "G2–C3";
    } else if (lo < 0) {
      minSteps = m3; region = "C3–C4";
    } else {
      continue; // above C4, anything goes
    }

    if (gap < minSteps) {
      warnings.push({ lowerNoteAbs: lo, upperNoteAbs: hi, gapSteps: gap, minSteps, region });
    }
  }
  return warnings;
}

export function formatLilWarnings(warnings: LilWarning[], edo: number): string {
  if (!warnings.length) return "";
  const lines = warnings.map(w => {
    const gapName = intervalLabel(w.gapSteps, edo);
    const minName = intervalLabel(w.minSteps, edo);
    return `⚠ LIL: ${gapName} in ${w.region} (need ≥ ${minName})`;
  });
  return lines.join("\n");
}
