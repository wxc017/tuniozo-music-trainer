// ── Smooth-voicing generator (harmonic-series-ordered) ───────────────
// Generates VoicingPattern objects for ANY active chord-tone set — base
// tones (1/3/5/7) plus whatever extensions (9/11/13, or 2/4/6) the user has
// turned on — so the Voicings list grows as extensions are added instead of
// staying frozen at triads/sevenths.
//
// Each voicing is a bottom-to-top ordering of indices into the active-tone
// array.  Two orderings are produced per inversion (bass note):
//   • CLOSE  — the tones stacked in their natural (numeric) order from the bass.
//   • OPEN   — the tones in harmonic-series rank order from the bass
//              (1·5·3·7·9·11·13), the all-odd / smooth spread.
// Both index the SAME pitch-sorted chord the engine builds, so they compose
// with applyVoicingPattern unchanged.

import { applyVoicingPattern, type VoicingPattern } from "./musicTheory";

// Harmonic-series rank: the smooth bottom→top stack order.  Lower = lower in
// the voicing.  The octave-up extensions (9/11/13) share their first-octave
// degree's slot but rank above the core, as colours on top.
const RANK: Record<string, number> = {
  "1": 0, "5": 1, "3": 2, "7": 3, "9": 4, "11": 5, "13": 6,
  // first-octave additions (sus / add): rank with their compound colour
  "2": 4, "4": 5, "6": 6,
};

const ordinal = (i: number): string =>
  i === 0 ? "Root Position"
  : i === 1 ? "1st Inversion"
  : i === 2 ? "2nd Inversion"
  : i === 3 ? "3rd Inversion"
  : i === 4 ? "4th Inversion"
  : i === 5 ? "5th Inversion"
  : `${i + 1}th Inversion`;

const rankOf = (deg: string): number => RANK[deg] ?? 99;

export interface GenerateOptions {
  /** Include the OPEN (harmonic-rank) ordering in addition to CLOSE. Default true. */
  open?: boolean;
}

/**
 * Generate the smooth voicings for an active chord-tone set.
 * @param degrees active tone labels in CANONICAL order, e.g. ["1","3","5","7","9","13"].
 *                The engine must build the chord's pitches in this same order
 *                (each extension an octave above its first-octave degree) so the
 *                `order` indices line up.
 */
export function generateVoicings(degrees: string[], opts: GenerateOptions = {}): VoicingPattern[] {
  const open = opts.open ?? true;
  const n = degrees.length;
  if (n === 0) return [];
  const out: VoicingPattern[] = [];
  const seen = new Set<string>();

  const push = (order: number[], spread: boolean, bass: number) => {
    const key = order.join(",") + (spread ? "s" : "");
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      id: "v-" + order.join("-") + (spread ? "s" : ""),
      label: order.map(i => degrees[i]).join(" ") + (spread ? " (spread)" : ""),
      group: ordinal(bass),
      order,
      spread,
      minNotes: n,
      maxNotes: n,
    });
  };

  for (let b = 0; b < n; b++) {
    // CLOSE — rotate so the bass is first, keep the rest in numeric order.
    const close = Array.from({ length: n }, (_, k) => (b + k) % n);
    push(close, false, b);

    if (open) {
      // OPEN — bass first, then the rest by harmonic-series rank (smooth spread).
      const others = degrees
        .map((_, i) => i)
        .filter(i => i !== b)
        .sort((x, y) => rankOf(degrees[x]) - rankOf(degrees[y]) || x - y);
      push([b, ...others], false, b);
    }
  }
  return out;
}

/** Unique group headers (inversions) present in a generated set, in order. */
export function generatedGroups(patterns: VoicingPattern[]): string[] {
  return [...new Set(patterns.map(p => p.group))];
}

// ── Unified voicing assembly (the engine seam for the rework) ─────────
// The current engine voices the base triad/7th with a pattern and then bolts
// extensions on afterward.  The unified model instead treats EVERY active tone
// (base + extensions) as one ordered set the pattern arranges — so "extension
// placement" is just the pattern's order, no separate append.

/**
 * Canonical-ordered tone steps (relative to the chord root) for the full active
 * chord: the base chord tones plus the selected, already-scale-resolved
 * extension steps (each raised into its compound octave so the 9 sits above the
 * 7, the 13 above the 7, etc.).  Pitch-sorted — the order that both
 * generateVoicings' indices and applyVoicingPattern assume.
 *
 * `baseSteps` and `extSteps` are EDO step offsets above the chord root.  The
 * extension steps must already be resolved from the key/scale (♮11 vs ♯11, etc.)
 * by the caller — this function only orders them, it doesn't choose qualities.
 */
export function chordToneSteps(baseSteps: number[], extSteps: number[]): number[] {
  return [...baseSteps, ...extSteps].sort((a, b) => a - b);
}

/**
 * Realize one voicing: place the canonical tone steps at `rootAbs` and apply the
 * pattern's bottom-to-top order (extensions included).  A pure wrapper over
 * applyVoicingPattern that pins the root-realization + canonical-ordering
 * contract the extension-aware rework relies on.
 */
export function assembleVoicing(
  rootAbs: number, toneSteps: number[], pattern: VoicingPattern, edo: number,
): number[] {
  const content = toneSteps.map(s => rootAbs + s).sort((a, b) => a - b);
  return applyVoicingPattern(content, edo, pattern);
}
