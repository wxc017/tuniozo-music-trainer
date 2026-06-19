// ── Smooth-voicing generator (harmonic-series-ordered) ───────────────
// Generates VoicingPattern objects for chord-tone sets, organised into
// CHORD-TYPE SECTIONS (Triad, Seventh, and one per active extension), each
// with the full common-voicing set per inversion:
//   • CLOSE       — tones stacked in natural order from the bass.
//   • OPEN        — tones in harmonic-series rank order (1·5·3·7·9·11·13).
//   • DROP-2/3/2&4 — the standard drop voicings (a top voice dropped an 8ve).
// Every voicing is a bottom-to-top ordering of indices into the active-tone
// array, composing with applyVoicingPattern unchanged.

import { applyVoicingPattern, type VoicingPattern } from "./musicTheory";

// Harmonic-series rank: the smooth bottom→top stack order (lower = lower).
const RANK: Record<string, number> = {
  "1": 0, "5": 1, "3": 2, "7": 3, "9": 4, "11": 5, "13": 6,
  "2": 4, "4": 5, "6": 6,
};
const rankOf = (deg: string): number => RANK[deg] ?? 99;

// Pitch order of every degree symbol (for sorting a chord's tones low→high).
const PITCH_ORDER: Record<string, number> = {
  "1": 0, "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6, "9": 7, "11": 8, "13": 9,
};
const byPitch = (a: string, b: string) => (PITCH_ORDER[a] ?? 99) - (PITCH_ORDER[b] ?? 99);

const ordinal = (i: number): string =>
  i === 0 ? "Root Position"
  : i === 1 ? "1st Inversion"
  : i === 2 ? "2nd Inversion"
  : i === 3 ? "3rd Inversion"
  : `${i + 1}th Inversion`;

export interface GenerateOptions {
  group?: string;          // section header; defaults to the inversion name
  baseNotes?: number;      // base chord size (3/4) for the engine
  extDegrees?: string[];   // extension labels this section adds (e.g. ["9th"])
  sus?: string;            // "2" / "4" — engine replaces the 3rd before voicing
  open?: boolean;          // include the harmonic-rank open ordering. Default true.
}

/**
 * Generate the common voicings for a chord-tone set: close + open + the drop
 * voicings, for every inversion.  `degrees` are tone symbols in pitch order
 * (e.g. ["1","3","5","7","9"]); the engine must build the chord's pitches in
 * the same order so the `order` indices line up.
 */
export function generateVoicings(degrees: string[], opts: GenerateOptions = {}): VoicingPattern[] {
  const n = degrees.length;
  if (n === 0) return [];
  const out: VoicingPattern[] = [];
  const seen = new Set<string>();

  // Drop a set of voices (counted from the top) of a close voicing down an
  // octave: they move to the bottom in their original (ascending) order.
  const applyDrop = (close: number[], dropsFromTop: number[]): number[] => {
    const dropIdx = new Set(dropsFromTop.map(k => n - k));
    const dropped = close.filter((_, i) => dropIdx.has(i));
    const rest = close.filter((_, i) => !dropIdx.has(i));
    return [...dropped, ...rest];
  };

  const push = (order: number[], voicingType: string) => {
    if (order.length < 2) return;
    const key = order.join(",");
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      id: "v-" + order.join("-"),
      label: order.map(i => degrees[i]).join(" "),
      group: opts.group ?? ordinal(order[0]),
      order,
      spread: false,
      minNotes: n,
      maxNotes: n,
      baseNotes: opts.baseNotes,
      extDegrees: opts.extDegrees,
      sus: opts.sus,
      voicingType,
    });
  };

  const iOf = (d: string) => degrees.indexOf(d);
  const rootI = iOf("1"), thirdI = iOf("3"), fifthI = iOf("5"), seventhI = iOf("7"), ninthI = iOf("9");
  const rankSort = (idxs: number[]) =>
    [...idxs].sort((x, y) => rankOf(degrees[x]) - rankOf(degrees[y]) || x - y);
  const DROP_NAME: Record<string, string> = { "2": "Drop 2", "3": "Drop 3", "2,3": "Drop 2&3", "2,4": "Drop 2&4" };

  // ── Close / Open / Drops, per inversion ──────────────────────────────
  for (let b = 0; b < n; b++) {
    const close = Array.from({ length: n }, (_, k) => (b + k) % n);
    push(close, "Close");
    if (n === 3) {
      // Three-note chords have no drop voicings — just the OPEN position per
      // inversion (the middle voice lifted to the top, e.g. 1 3 5 → 1 5 3).
      push([close[0], close[2], close[1]], "Open");
    } else {
      if (opts.open ?? true) push([b, ...rankSort(close.slice(1))], "Open");  // harmonic-rank open
      for (const drops of [[2], [3], [2, 3], [2, 4]]) {   // drop-2 / 3 / 2&3 / 2&4
        if (drops.some(k => k > n || k < 2)) continue;
        push(applyDrop(close, drops), DROP_NAME[drops.join(",")] ?? "Drop");
      }
    }
  }

  // ── Doublings — double the root / 5th an octave above close root position ──
  const close0 = Array.from({ length: n }, (_, k) => k);
  if (rootI >= 0) push([...close0, rootI], "Doubled");
  if (fifthI >= 0 && fifthI !== rootI) push([...close0, fifthI], "Doubled");

  // ── Rootless — omit the root (4+ note chords) ──
  if (n >= 4 && rootI >= 0) {
    const nonRoot = close0.filter(i => i !== rootI);
    push(nonRoot, "Rootless");
    push(rankSort(nonRoot), "Rootless");
  }

  // ── Shell — guide tones (3 + 7), optionally + 9 ──
  if (thirdI >= 0 && seventhI >= 0) {
    push([thirdI, seventhI], "Shell");
    push([seventhI, thirdI], "Shell");
    if (ninthI >= 0) push([thirdI, seventhI, ninthI], "Shell");
  }

  // ── Upper structure — root in the bass + the top three tones (5+ notes) ──
  if (n >= 5 && rootI >= 0) {
    const top3 = close0.filter(i => i !== rootI).slice(-3);
    if (top3.length === 3) push([rootI, ...top3], "Upper");
  }

  // Order the section by actual bass (inversion), then by the ordering itself.
  out.sort((a, b) => a.order[0] - b.order[0] || a.order.join().localeCompare(b.order.join()));
  return out;
}

// Each selectable extension → the chord-type section it produces.
const EXT_SECTION: Record<string, { sym: string; base: string[]; baseNotes: number }> = {
  "2nd":  { sym: "2",  base: ["1", "3", "5"],       baseNotes: 3 },
  "4th":  { sym: "4",  base: ["1", "3", "5"],       baseNotes: 3 },
  "6th":  { sym: "6",  base: ["1", "3", "5"],       baseNotes: 3 },
  "9th":  { sym: "9",  base: ["1", "3", "5", "7"],  baseNotes: 4 },
  "11th": { sym: "11", base: ["1", "3", "5", "7"],  baseNotes: 4 },
  "13th": { sym: "13", base: ["1", "3", "5", "7"],  baseNotes: 4 },
};

const EXT_ORDER = ["2nd", "4th", "6th", "9th", "11th", "13th"];
const isUpperExt = (l: string) => l === "9th" || l === "11th" || l === "13th";

/** Every non-empty subset of `items`, ordered by size then extension order. */
function nonEmptySubsets(items: string[]): string[][] {
  const n = items.length;
  const out: string[][] = [];
  for (let mask = 1; mask < (1 << n); mask++) {
    const s: string[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) s.push(items[i]);
    out.push(s);
  }
  out.sort((a, b) => a.length - b.length || a.join().localeCompare(b.join()));
  return out;
}

/**
 * The full voicing catalog: always the Triad and Seventh sections, plus a
 * section for EVERY non-empty combination of the active extensions
 * (2nd/4th/6th/9th/11th/13th) — so 9th + 11th yields "9th", "11th" AND
 * "9th + 11th".  Each section has its own inversions + drop voicings; toggling
 * extensions only ADDS sections, never mutating the base ones.
 */
export function generateChordVoicings(activeExtLabels: string[]): VoicingPattern[] {
  const out: VoicingPattern[] = [];
  out.push(...generateVoicings(["1", "3", "5"], { group: "Triad", baseNotes: 3, extDegrees: [] }));
  out.push(...generateVoicings(["1", "3", "5", "7"], { group: "Seventh", baseNotes: 4, extDegrees: [] }));
  // Suspensions — the engine replaces the 3rd with the resolved 2nd / 4th.
  out.push(...generateVoicings(["1", "2", "5"], { group: "Sus2", baseNotes: 3, sus: "2", extDegrees: [] }));
  out.push(...generateVoicings(["1", "4", "5"], { group: "Sus4", baseNotes: 3, sus: "4", extDegrees: [] }));
  out.push(...generateVoicings(["1", "2", "5", "7"], { group: "7sus2", baseNotes: 4, sus: "2", extDegrees: [] }));
  out.push(...generateVoicings(["1", "4", "5", "7"], { group: "7sus4", baseNotes: 4, sus: "4", extDegrees: [] }));
  const active = EXT_ORDER.filter(l => activeExtLabels.includes(l) && EXT_SECTION[l]);
  for (const subset of nonEmptySubsets(active)) {
    // A 7th base when any compound extension is present, else a triad base.
    const base = subset.some(isUpperExt) ? ["1", "3", "5", "7"] : ["1", "3", "5"];
    const degrees = [...base, ...subset.map(l => EXT_SECTION[l].sym)].sort(byPitch);
    out.push(...generateVoicings(degrees, {
      group: subset.join(" + "),
      baseNotes: base.length,
      extDegrees: subset,
    }));
  }
  // Disambiguate ids across sections (the same order indices recur per section).
  for (const p of out) p.id = `v-${p.group}-${p.order.join("-")}`;
  return out;
}

/** Unique group headers (sections) present in a generated set, in order. */
export function generatedGroups(patterns: VoicingPattern[]): string[] {
  return [...new Set(patterns.map(p => p.group))];
}

// ── Unified voicing assembly (the engine seam for the rework) ─────────

/**
 * Canonical-ordered tone steps (relative to the chord root): base tones plus
 * the already-scale-resolved extension steps, pitch-sorted — the order
 * generateVoicings' indices and applyVoicingPattern both assume.
 */
export function chordToneSteps(baseSteps: number[], extSteps: number[]): number[] {
  return [...baseSteps, ...extSteps].sort((a, b) => a - b);
}

/**
 * Realize one voicing: place the canonical tone steps at `rootAbs` and apply
 * the pattern's bottom-to-top order (extensions included).
 */
export function assembleVoicing(
  rootAbs: number, toneSteps: number[], pattern: VoicingPattern, edo: number,
): number[] {
  const content = toneSteps.map(s => rootAbs + s).sort((a, b) => a - b);
  return applyVoicingPattern(content, edo, pattern);
}

/**
 * Approximate a VOICED chord (absolute EDO steps) as the low-integer harmonic
 * partials it sits closest to, bottom→top — e.g. a close major triad → 4:5:6,
 * an open one → 2:3:5, a drop-2 dom7 → 5:7:8:12.  Reflects the literal voicing
 * (octave placement included).  Returns null if no small-integer set fits.
 */
export function chordPartials(
  pitches: number[], edo: number, opts: { maxPartial?: number; tolCents?: number; maxTop?: number } = {},
): number[] | null {
  // `maxPartial` bounds the bass's partial number (m); wide / two-hand voicings
  // keep m small but push the TOP note high, so the top partial gets its own,
  // looser cap (`maxTop`).
  const maxPartial = opts.maxPartial ?? 48;
  const maxTop = opts.maxTop ?? 256;
  const tolCents = opts.tolCents ?? 22;
  const uniq = [...new Set(pitches)].sort((a, b) => a - b);
  if (uniq.length < 2) return null;
  const centsFromBass = uniq.map(p => ((p - uniq[0]) * 1200) / edo);
  const ratios = centsFromBass.map(c => Math.pow(2, c / 1200));
  for (let m = 1; m <= maxPartial; m++) {
    const partials = ratios.map(r => Math.round(m * r));
    let ok = partials[partials.length - 1] <= maxTop;
    for (let i = 1; ok && i < partials.length; i++) {
      if (partials[i] <= partials[i - 1]) ok = false;             // strictly ascending
    }
    for (let i = 0; ok && i < ratios.length; i++) {
      const idealCents = 1200 * Math.log2(partials[i] / m);
      if (Math.abs(idealCents - centsFromBass[i]) > tolCents) ok = false;
    }
    if (ok) return partials;
  }
  return null;
}
