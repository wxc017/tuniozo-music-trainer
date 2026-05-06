// ── Progression Catalog ───────────────────────────────────────────────────
//
// Generates up to 5 "interesting" chord progressions per tonality per
// EDO from a small library of degree-shape templates (1-5-1,
// 1-4-5-1, 1-6-4-5-1, 1-6-2-5-1, 1-4-6-2-5-1).  Each template is
// resolved against the tonality's actual chord-pool labels so the
// same shape automatically picks up minor / xen / JI variants
// (e.g. 1-5-1 in Subminor Diatonic resolves to "i s3 → V s3 → i s3").
//
// Drift in cents is computed live via jiLattice's tracePathDrifts;
// progressions whose drift is non-zero in JI are the classic comma
// pumps (typically 21.5¢ syntonic / 27¢ septimal in 41/53-EDO).  In
// EDOs that temper out the underlying comma (12, 19, 31 = meantone)
// the same progressions resolve back to the tonic — the drift label
// just shows 0¢, so we surface them as ordinary cadential
// progressions rather than pumps.
//
// Per direct user direction (2026-05-06): "the comma pumps are all
// hardcoded I want you to calculate 5 different progressions for
// each tonality for every edo" → "5 interesting progressions".

import { tracePathDrifts } from "./jiLattice";

export interface CommaPump {
  /** Stable id for React keys + state */
  key: string;
  /** Human-readable label, e.g. "I → vi → ii → V → I" */
  label: string;
  /** Roman-numeral chord sequence to play */
  progression: string[];
  /** Prime limit of the comma being pumped (5 for syntonic etc.).  When
   *  the progression doesn't pump (drift = 0) this is still informative
   *  about which prime the cadence centres on. */
  primeLimit: 3 | 5 | 7 | 11 | 13;
  /** Short description for tooltip / muted secondary text */
  description: string;
}

// Degree-shape templates.  Each entry uses arabic numerals 1..7 for
// scale-degree position; the resolver below substitutes the actual
// chord label at that degree from the tonality's chord pool.
interface ProgressionTemplate {
  key: string;
  shape: number[];
  primeLimit: 3 | 5 | 7 | 11 | 13;
  description: string;
}

const TEMPLATES: ProgressionTemplate[] = [
  {
    key: "auth-1-5-1",
    shape: [1, 5, 1],
    primeLimit: 3,
    description: "Authentic cadence — V → I.  3-limit (Pythagorean) cadential motion.",
  },
  {
    key: "plag-auth-1-4-5-1",
    shape: [1, 4, 5, 1],
    primeLimit: 5,
    description: "Plagal + authentic — IV → V → I.  Anchors the tonic from both 4th and 5th.",
  },
  {
    key: "fifties-1-6-4-5-1",
    shape: [1, 6, 4, 5, 1],
    primeLimit: 5,
    description: "I → vi → IV → V → I.  Doo-wop / ′50s progression.",
  },
  {
    key: "syntonic-1-6-2-5-1",
    shape: [1, 6, 2, 5, 1],
    primeLimit: 5,
    description: "I → vi → ii → V → I.  Canonical 5-limit syntonic comma pump (21.5¢ in JI).",
  },
  {
    key: "syntonic-1-4-6-2-5-1",
    shape: [1, 4, 6, 2, 5, 1],
    primeLimit: 5,
    description: "I → IV → vi → ii → V → I.  Syntonic pump with extra IV setup.",
  },
];

/** Strip leading scale-degree-alteration prefix (b / # / s / S / N
 *  + half-accidental glyphs) and the trailing chord-quality suffix
 *  (anything after a space, plus ° / ø / +) so we can extract the
 *  bare Roman numeral.  Returns null if the label doesn't look like
 *  a Roman-numeral chord (e.g. compound "V/vi" returns the leading
 *  "V" so progressions can match it; wholly unparseable returns null). */
const ROMAN_TO_DEG: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7,
};
function labelDegree(label: string): number | null {
  // Compound labels like "V/vi" → take only the head numeral.
  const head = label.split("/")[0];
  // Strip space-suffix and any trailing chord-type symbols.
  const noSuffix = head.split(/\s+/)[0].replace(/[°ø+]+$/, "");
  // Strip leading accidental prefix (root-altered position).
  const stripped = noSuffix.replace(/^[bs#SN♭♯𝄲𝄳ₛˢ]+/, "");
  const upper = stripped.toUpperCase();
  return ROMAN_TO_DEG[upper] ?? null;
}

/** Build a degree → label index.  Each degree picks the FIRST label
 *  matching it (so I beats out a hypothetical bI variant; ii beats
 *  bII).  Compound chords with leading prefixes are kept as alternates
 *  if no plain label exists. */
function indexByDegree(labels: string[]): Map<number, string> {
  const exact = new Map<number, string>();
  const altered = new Map<number, string>();
  for (const label of labels) {
    const head = label.split("/")[0];
    const noSuffix = head.split(/\s+/)[0].replace(/[°ø+]+$/, "");
    const hasPrefix = /^[bs#SN♭♯𝄲𝄳ₛˢ]/.test(noSuffix);
    const deg = labelDegree(label);
    if (deg === null) continue;
    if (hasPrefix) {
      if (!altered.has(deg)) altered.set(deg, label);
    } else {
      if (!exact.has(deg)) exact.set(deg, label);
    }
  }
  // Prefer exact (un-altered) over altered.
  const out = new Map<number, string>(altered);
  for (const [k, v] of exact) out.set(k, v);
  return out;
}

/** Cumulative drift (cents) at the END of a pump's progression.
 *  Positive = chain drifted upward, negative = downward. */
export function pumpFinalDriftCents(pump: CommaPump): number {
  const drifts = tracePathDrifts(pump.progression);
  return drifts[drifts.length - 1] ?? 0;
}

/** Per-chord cumulative drifts for a pump — used to shift each
 *  chord's pitches at playback so the audible comma drift is
 *  actually heard. */
export function pumpChordDrifts(pump: CommaPump): number[] {
  return tracePathDrifts(pump.progression);
}

/** Build up to 5 interesting progressions for the given tonality on
 *  the given EDO.  Resolves each shape template against the
 *  tonality's actual chord labels; templates that need a degree the
 *  tonality lacks are skipped.  Returns at most 5 progressions
 *  (typically 5 for full diatonic tonalities, fewer for tonalities
 *  with restricted chord pools). */
export function pumpsForTonality(
  edo: number,
  availableChordLabels: Set<string>,
): CommaPump[] {
  const byDeg = indexByDegree(Array.from(availableChordLabels));
  if (byDeg.size === 0) return [];
  const out: CommaPump[] = [];
  for (const t of TEMPLATES) {
    const progression: string[] = [];
    let ok = true;
    for (const deg of t.shape) {
      const lbl = byDeg.get(deg);
      if (!lbl) { ok = false; break; }
      progression.push(lbl);
    }
    if (!ok) continue;
    const label = progression.join(" → ");
    out.push({
      key: `${t.key}-${edo}`,
      label,
      progression,
      primeLimit: t.primeLimit,
      description: t.description,
    });
    if (out.length === 5) break;
  }
  return out;
}
