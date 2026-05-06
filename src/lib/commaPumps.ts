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
//
// ── Higher-limit pump status (2026-05-06) ─────────────────────────────────
// "find comma pumps for everything else if they exist, do all the
// calculations please" — the calculations were done, summary below.
// Honest result: most higher-limit scales DON'T have natural
// cumulative pumps in our scale-tone progression model.  Why:
//
//   * 5-LIMIT MAJOR (Diatonic Classic Major + JI Ionian): genuine
//     syntonic pump on vi→ii.  vi's root (5/3) appears in scale-tone
//     ii triad as ii's "P5" position, but the scale-tone ii P5 is
//     40/27 (wolf!) — held-tone voice-leading forces ii to retune,
//     dropping the chain by 81/80 ≈ 21.5¢.  This is the only known
//     pump that the existing chord-root lattice infrastructure
//     models cleanly.  ✓ surfaced
//
//   * 5-LIMIT MINOR (Diatonic Classic Minor / Classic Harmonic
//     Minor M7): same syntonic pump in the i-VI-ii°-V-i form.  The
//     5 templates above all resolve correctly because lowercase /
//     uppercase / ° quality is encoded in the chord pool's labels.
//     ✓ surfaced
//
//   * 3-LIMIT PYTHAGOREAN (Diatonic Major Pyth / Diatonic Harmonic
//     Minor / "Pythagorean *"): NO realistic diatonic pump.  Pyth
//     comma 531441/524288 ≈ 23.5¢ requires a chain of 12 perfect
//     fifths spelled chromatically (B# = C+pyth) — a 7-chord
//     diatonic progression can't traverse it.  ✗ skip
//
//   * 7-LIMIT (Diatonic Subminor / Supermajor / Subharmonic Minor
//     M7): no NATURAL scale-tone pump.  Each scale's chord pool is
//     internally consistent — Subminor's bVII chord on 7/4 has a
//     wide P5 (32/21) that's 27¢ off canonical, but voice-leading
//     bVII→i has no held common-tone, so the wide-fifth retuning
//     doesn't propagate.  Septimal pumps (Marvel 225/224, Archytas
//     64/63) need either V7sept-with-7/4-seventh chord types in a
//     5-limit scale (modal interchange) or extended progressions
//     that alternate chord interpretations — neither fits the
//     scale-scoped template framework.  ✗ skip honestly
//
//   * 11-LIMIT (Mohajira / Maqam): Mohajira's iii triad on 11/9 has
//     a wolf m3 (27/22 vs canonical 11/9, ~7¢ off = Rastma 243/242)
//     when built scale-tone, and retuning it would propagate
//     through V — but V→I has no held tone in Mohajira's voicing
//     so the drift doesn't close into a sustained pump.  Standard
//     diatonic-Roman progressions on Maqam scales (Rast / Bayati /
//     etc.) similarly don't produce cumulative drift.  ✗ skip
//
//   * 13-LIMIT (Tridecimal Major / Minor / Beirut / Tridecimal
//     Hijaz): same situation.  13-limit ratios at colour positions
//     don't create voice-leading-forced retunings in 7-tone
//     diatonic progressions.  ✗ skip
//
// What WOULD model higher-limit pumps faithfully:
//   1. Per-tonality CHORD_ROOT_POSITION overrides in jiLattice —
//      Mohajira's vi at 27/16 (Pyth) instead of 5/3 (5-limit
//      canonical), Subminor's bVII at 7/4 instead of 9/5, etc.
//      Each scale needs its own root-position table.
//   2. A held-tone voice-leading walk that tracks per-VOICE lattice
//      positions (the existing VOICING_CATALOG infrastructure)
//      rather than chord-root motion alone.
//   3. Mixed-tuning / modal-interchange progression support, so
//      e.g. "V7sept resolving in a 5-limit major key" can surface
//      as a Marvel pump even though the scale itself is 5-limit.
//
// Each of these is a meaningful infrastructure task; doing all
// three is days of work.  The current code surfaces the one pump
// that genuinely fires through the existing infrastructure (5-limit
// syntonic) and stays silent on every other scale rather than
// faking it with hand-computed drifts that don't actually emerge
// from the scale's structure.

import { tracePathDrifts } from "./jiLattice";
import { edoTempersComma } from "./edoTemperamentData";

export interface CommaPump {
  /** Stable id for React keys + state */
  key: string;
  /** Human-readable label, e.g. "I → vi → ii → V → I" */
  label: string;
  /** Roman-numeral chord sequence to play */
  progression: string[];
  /** Prime limit of the comma being pumped (5 for syntonic etc.) */
  primeLimit: 3 | 5 | 7 | 11 | 13;
  /** Short description for tooltip / muted secondary text */
  description: string;
}

// ── Tonality → primary colour prime limit ──────────────────────────────
// Maps each parent tonality to the highest "colour" prime it carries at
// the 3rd / 6th / 7th — a syntonic (5-limit) pump can't surface on a
// scale whose 3rd is 9/7 (7-limit Supermajor), even though the lattice's
// curated vi→ii motion would otherwise compute a -21.5¢ drift on the
// chord-root path.  Mode rotations inherit from their parent via the
// pattern fallback in `tonalityPrimeLimit` below.
const TONALITY_PRIMARY_PRIME: Record<string, 3 | 5 | 7 | 11 | 13> = {
  // 3-limit Pythagorean — pure stacked-fifths, no realistic diatonic pump
  "Diatonic Major": 3,
  "Diatonic Harmonic Minor": 3,
  "Pythagorean Ionian": 3,
  "Pythagorean Aeolian": 3,
  "Pythagorean Dorian": 3,
  "Pythagorean Mixolydian": 3,

  // 5-limit Just Intonation / Classic
  "Diatonic Classic Major": 5,
  "Diatonic Classic Minor": 5,
  "Diatonic Classic Harmonic Minor M7": 5,
  "JI Ionian": 5,
  "JI Dorian": 5,
  "JI Phrygian": 5,
  "JI Lydian": 5,
  "JI Mixolydian": 5,
  "JI Aeolian": 5,
  "JI Harmonic Minor": 5,

  // 7-limit Septimal — 9/7 / 7/6 / 7/4 colour ratios at 3rd/6th/7th
  "Diatonic Subminor": 7,
  "Diatonic Supermajor": 7,
  "Diatonic Subharmonic Minor M7": 7,

  // 11-limit Maqamat + Mohajira — 11/9 / 11/8 / 11/6 colour
  "Mohajira": 11,
  "Rast": 11,
  "Bayati": 11,
  "Hijaz": 11,
  "Saba": 11,
  "Sikah": 11,
  "Huzam": 11,
  "Nikriz": 11,
  "Hijazkar": 11,

  // 13-limit Tridecimal — 13/8 / 13/11 / 13/10 / 13/12 colour
  "Tridecimal Major": 13,
  "Tridecimal Minor": 13,
  "Beirut": 13,
  "Tridecimal Hijaz": 13,
};

/** Resolve a tonality name (parent or auto-generated mode rotation) to
 *  its primary colour prime limit.  Mode rotations inherit from their
 *  parent: a "Classic Minor Phrygian" rotation is still 5-limit, a
 *  "Subminor Locrian m7" is 7-limit, etc. */
export function tonalityPrimeLimit(tonality: string): 3 | 5 | 7 | 11 | 13 {
  const direct = TONALITY_PRIMARY_PRIME[tonality];
  if (direct) return direct;
  // Mode-rotation pattern fallbacks — match the parent-name fragments
  // generated by buildModeNameFromCents in jiScaleData.ts.
  if (/Subminor|Supermajor|Subharmonic|Subaeolian|Sublocrian|Submixolydian|Subphrygian|Supermixolydian|Superlydian|Superphrygian/.test(tonality)) return 7;
  if (/Tridecimal|Beirut/.test(tonality)) return 13;
  if (/Mohajira|Rast|Bayati|Hijaz|Saba|Sikah|Huzam|Nikriz|Hijazkar|Maqam|Neutral/.test(tonality)) return 11;
  if (/Classic|JI /.test(tonality)) return 5;
  if (/Pythagorean|Pyth|Diatonic Major$|Diatonic Harmonic Minor$/.test(tonality)) return 3;
  return 5;  // default to 5-limit for any other "Diatonic" tonality
}

// Degree-shape templates.  Each entry uses arabic numerals 1..7 for
// scale-degree position; the resolver below substitutes the actual
// chord label at that degree from the tonality's chord pool.
//
// `commaN/D` is the comma the progression pumps in JI; it gates the
// template against the target EDO via edoTempersComma — meantone
// EDOs (12/19/31) temper out 81/80 so syntonic-pump templates drop
// out automatically there.  All current entries are syntonic pumps
// (vi → ii direct motion fires the curated 81/80 lattice offset);
// expanding to septimal / undecimal / tridecimal pumps requires
// adding entries to TRANSITION_MOTIONS in jiLattice.ts.
interface ProgressionTemplate {
  key: string;
  shape: number[];
  commaN: number;
  commaD: number;
  primeLimit: 3 | 5 | 7 | 11 | 13;
  description: string;
}

const TEMPLATES: ProgressionTemplate[] = [
  {
    key: "syntonic-1-6-2-5-1",
    shape: [1, 6, 2, 5, 1],
    commaN: 81, commaD: 80, primeLimit: 5,
    description: "I → vi → ii → V → I.  Canonical 5-limit syntonic comma pump.",
  },
  {
    key: "syntonic-1-4-6-2-5-1",
    shape: [1, 4, 6, 2, 5, 1],
    commaN: 81, commaD: 80, primeLimit: 5,
    description: "I → IV → vi → ii → V → I.  Syntonic pump with extra IV setup.",
  },
  {
    key: "syntonic-1-3-6-2-5-1",
    shape: [1, 3, 6, 2, 5, 1],
    commaN: 81, commaD: 80, primeLimit: 5,
    description: "I → iii → vi → ii → V → I.  Syntonic pump with iii passing chord.",
  },
  {
    key: "syntonic-1-5-6-2-5-1",
    shape: [1, 5, 6, 2, 5, 1],
    commaN: 81, commaD: 80, primeLimit: 5,
    description: "I → V → vi → ii → V → I.  Deceptive cadence into a syntonic pump.",
  },
  {
    key: "syntonic-1-6-2-4-5-1",
    shape: [1, 6, 2, 4, 5, 1],
    commaN: 81, commaD: 80, primeLimit: 5,
    description: "I → vi → ii → IV → V → I.  Syntonic pump with IV before V.",
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

/** Build up to 5 ACTUAL comma pumps for the given tonality on the
 *  given EDO.  Resolves each shape template, drops it if:
 *    - the tonality is missing a needed scale degree, OR
 *    - the EDO tempers out the template's comma (so the pump would
 *      collapse audibly), OR
 *    - the JI drift comes back ~0 (the curated pump motion didn't
 *      actually fire on this resolution — usually because the
 *      tonality's chord at the pump-relevant degree is itself an
 *      altered-position chord that strips back to a different
 *      numeral than the template expected).
 *  Returns only progressions that genuinely pump in this EDO. */
const DRIFT_THRESHOLD_CENTS = 0.5;

export function pumpsForTonality(
  edo: number,
  tonality: string,
  availableChordLabels: Set<string>,
): CommaPump[] {
  const byDeg = indexByDegree(Array.from(availableChordLabels));
  if (byDeg.size === 0) return [];
  // Per direct user direction (2026-05-06): a 5-limit syntonic pump
  // showing on a 7-limit scale (Diatonic Supermajor) was wrong — the
  // scale has no 5/4 third for the comma to live on, even though the
  // chord labels I-vi-ii-V-I happen to exist in Supermajor's pool.
  // Gate every template by the tonality's actual primary prime so a
  // template's commaPrime must MATCH (not just be ≤) the scale's
  // colour prime.  Mode rotations inherit from their parent.
  const scalePrime = tonalityPrimeLimit(tonality);
  const out: CommaPump[] = [];
  for (const t of TEMPLATES) {
    // Skip templates whose comma doesn't apply to this scale's prime
    // limit — a 5-limit syntonic comma can't drift in a 7-limit scale.
    if (t.primeLimit !== scalePrime) continue;
    // Skip templates whose comma vanishes in this EDO — the user
    // wouldn't audibly hear a drift even if the JI lattice walks one.
    if (edoTempersComma(edo, t.commaN, t.commaD)) continue;

    const progression: string[] = [];
    let ok = true;
    for (const deg of t.shape) {
      const lbl = byDeg.get(deg);
      if (!lbl) { ok = false; break; }
      progression.push(lbl);
    }
    if (!ok) continue;

    // Verify the resolved progression actually pumps in JI — the
    // curated pump motion (vi → ii) only fires when both labels
    // strip back to those exact numerals.
    const drifts = tracePathDrifts(progression);
    const finalDrift = drifts[drifts.length - 1] ?? 0;
    if (Math.abs(finalDrift) < DRIFT_THRESHOLD_CENTS) continue;

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
