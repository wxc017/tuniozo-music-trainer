// ── Unusual Meters & Time Systems: data, taxonomy, generators, custom sigs ──

import type { RhythmEvent, RhythmPattern, BeatLayer, AnswerOption, RhythmExercise } from "./rhythmEarData";

// ── Structural layers (3 top-level groups) ────────────────────────────
// Replaces the old 7-way MetaCategory split with a mathematically cleaner
// 3-layer decomposition: what it IS vs. what it DOES vs. how it's MADE.

export type StructuralLayer = "metric" | "transformation" | "generative";

export const LAYER_LABELS: Record<StructuralLayer, string> = {
  metric: "Metric",
  transformation: "Transformation",
  generative: "Generative",
};

export const LAYER_DESCRIPTIONS: Record<StructuralLayer, string> = {
  metric: "Discrete grouping objects — meters built from countable beat clusters, polymetric layers, or graph-structured time.",
  transformation: "Temporal modifications — continuous, phase-based, or directional changes applied to an underlying pulse.",
  generative: "Rule-based and algorithmic — meter emerges from a process, formula, probability field, or mathematical constant.",
};

/** @deprecated Use StructuralLayer + LAYER_LABELS instead */
export type MetaCategory = "signatures" | "layered" | "continuous" | "duration" | "subdivision" | "process" | "infinite";
/** @deprecated Use LAYER_LABELS instead */
export const META_LABELS: Record<MetaCategory, string> = {
  signatures: "Signatures", layered: "Layered", continuous: "Continuous",
  duration: "Duration", subdivision: "Subdivision", process: "Process", infinite: "Infinite",
};
/** @deprecated Use LAYER_DESCRIPTIONS instead */
export const META_DESCRIPTIONS: Record<MetaCategory, string> = {
  signatures: "Extended time signatures.", layered: "Multiple metric layers.", continuous: "Continuous meter.",
  duration: "Duration-based systems.", subdivision: "Subdivision-based complexity.", process: "Process-based meter.", infinite: "Infinite systems.",
};

// ── Sub-categories (detailed) ────────────────────────────────────────

export type TimeSigCategory =
  | "additive"         // (3+2+3)/8
  | "irrational"       // 4/3, 5/6 — non-power-of-2 denominators
  | "fractional"       // 3.5/4, 2.25/8 — non-integer numerators
  | "ratio"            // 5:7, 17:12 — polymetric ratios
  | "prime"            // 7/5, 11/8, 13/10 — prime-based meters
  | "polymeter"        // multiple simultaneous meters
  | "nested"           // metric modulation / fractal meter
  | "continuous_tempo" // accelerando / logarithmic / exponential
  | "elastic"          // beats stretch/compress dynamically
  | "real_number"      // pi/4, phi/5 — irrational constants
  | "proportional"     // time in seconds
  | "absolute_time"    // seconds instead of beats
  | "timeline"         // events on continuous time axis
  | "subdivision_tree" // nonlinear subdivision trees
  | "irrational_subdiv"// tuplets of √2, π, etc.
  | "hybrid_grid"      // mixing binary, ternary, non-integer layers
  | "phase_shift"      // Reich-style phase offset
  | "algorithmic"      // Euclidean, cellular automata, L-systems
  | "stochastic"       // probability-based meter
  | "non_terminating"  // infinite ratios, Cantor, limits
  | "fractal_time"     // fractal temporal structures
  | "limit_process"    // meter as convergence
  // ── New edge-case categories ──
  | "retrograde"       // reversed / negative time segments
  | "directed"         // signed / branching time
  | "geometric"        // beats on curves (spiral, hyperbolic)
  | "graph_time"       // beats as graph/tree nodes, not linear
  | "density";         // probability density as rhythm

/** Map each sub-category to its structural layer */
export const CATEGORY_LAYER: Record<TimeSigCategory, StructuralLayer> = {
  // ── Metric: discrete grouping objects ──
  additive: "metric", irrational: "metric", fractional: "metric",
  prime: "metric", polymeter: "metric", nested: "metric",
  subdivision_tree: "metric", hybrid_grid: "metric", graph_time: "metric",
  proportional: "metric", absolute_time: "metric", timeline: "metric",
  // ── Transformation: temporal modifications ──
  continuous_tempo: "transformation", elastic: "transformation",
  phase_shift: "transformation", irrational_subdiv: "transformation",
  retrograde: "transformation", directed: "transformation",
  // ── Generative: rule-based / algorithmic ──
  ratio: "generative", real_number: "generative", algorithmic: "generative",
  stochastic: "generative", non_terminating: "generative", fractal_time: "generative",
  limit_process: "generative", geometric: "generative", density: "generative",
};

/** @deprecated Use CATEGORY_LAYER instead */
export const CATEGORY_META: Record<TimeSigCategory, MetaCategory> = {
  additive: "signatures", irrational: "signatures", fractional: "signatures",
  ratio: "signatures", prime: "signatures", polymeter: "layered", nested: "layered",
  continuous_tempo: "continuous", elastic: "continuous", real_number: "continuous",
  proportional: "duration", absolute_time: "duration", timeline: "duration",
  subdivision_tree: "subdivision", irrational_subdiv: "subdivision", hybrid_grid: "subdivision",
  phase_shift: "process", algorithmic: "process", stochastic: "process",
  non_terminating: "infinite", fractal_time: "infinite", limit_process: "infinite",
  retrograde: "process", directed: "process", geometric: "infinite",
  graph_time: "subdivision", density: "process",
};

export const CATEGORY_LABELS: Record<TimeSigCategory, string> = {
  additive: "Additive / Aksak",
  irrational: "Irrational Denominator",
  fractional: "Fractional Numerator",
  ratio: "Ratio Meter",
  prime: "Prime / Non-Standard Units",
  polymeter: "Polymeter",
  nested: "Metric Modulation / Nested",
  continuous_tempo: "Continuous Tempo Fields",
  elastic: "Elastic Meter",
  real_number: "Real-Number Meter",
  proportional: "Proportional Notation",
  absolute_time: "Absolute Time",
  timeline: "Timeline / Event-Based",
  subdivision_tree: "Subdivision Tree",
  irrational_subdiv: "Irrational Subdivisions",
  hybrid_grid: "Hybrid Subdivision Grid",
  phase_shift: "Phase Shift",
  algorithmic: "Algorithmic / Euclidean",
  stochastic: "Stochastic / Probabilistic",
  non_terminating: "Non-Terminating Ratios",
  fractal_time: "Fractal Time",
  limit_process: "Limit Process",
  retrograde: "Retrograde / Negative Time",
  directed: "Directed / Branching Time",
  geometric: "Geometric Rhythm",
  graph_time: "Graph Time",
  density: "Density Rhythm",
};

export const CATEGORY_DESCRIPTIONS: Record<TimeSigCategory, string> = {
  additive: "Meters built from unequal groups: (3+2+3)/8, (5+5+7)/16. Used in Balkan music, Stravinsky, prog rock.",
  irrational: "Denominators that are not powers of 2: 4/3, 5/6, 7/10. Used by Ferneyhough, Nancarrow, new complexity.",
  fractional: "Non-integer numerators: 3.5/4, 2.25/8. Measure length ≠ whole beats. Used in electroacoustic scores.",
  ratio: "Polymetric ratios: 5:7, 17:12. Different simultaneous pulse streams. Nancarrow player piano studies.",
  prime: "Prime-based meters: 7/5, 11/8, 13/10, 31/16. Related to EDO / JI lattices and microtonal rhythm.",
  polymeter: "Multiple meters running simultaneously with different lengths: 5/8 + 7/8, 3/4 + 4/4 + 5/4. Creates polymetric interference patterns.",
  nested: "Beat identity shifts mid-stream. 4/4 → 5/7 subdivision reinterpretation. Fractal meter-within-meter at multiple scales.",
  continuous_tempo: "Beat spacing changes continuously within a measure: accelerando, ritardando, logarithmic, exponential. No two consecutive beats are equally spaced.",
  elastic: "Beats stretch and compress dynamically based on rules or performer interpretation. No fixed grid.",
  real_number: "Irrational constants: π/4, φ/5, e/8. Only possible with computer playback. Generative / DSP music.",
  proportional: "Length on page = duration. Time measured in spatial distance. John Cage, Earle Brown, graphic scores.",
  absolute_time: "Seconds instead of beats. Events placed at exact timestamps, not relative to any pulse.",
  timeline: "Events placed on a continuous time axis. No measure, no beat — pure chronological ordering.",
  subdivision_tree: "Each beat subdivides into a different number of parts, forming a nonlinear tree: beat → 3 → 5 → 7 → √2.",
  irrational_subdiv: "Tuplets of irrational numbers: √2, π, φ. Subdivisions that never align with any integer grid.",
  hybrid_grid: "Mixing binary, ternary, and non-integer subdivision layers simultaneously within one measure.",
  phase_shift: "Two identical meters offset in time. Reich-style gradual phase drift where patterns slowly move out of sync.",
  algorithmic: "Meters generated by algorithms: Euclidean rhythms (maximally even distributions), cellular automata, L-systems.",
  stochastic: "Meter determined by probability fields. Beat placement follows statistical distributions, not fixed patterns.",
  non_terminating: "Symbolic or infinite ratios: π/√2 beats. No periodic alignment possible at any timescale.",
  fractal_time: "Self-similar temporal structures: Cantor set rhythms, Sierpinski timing. Structure repeats at every scale.",
  limit_process: "Meter defined as a convergence process. The measure is the limit of an infinite sequence.",
  retrograde: "Time segments played in reverse or with negative duration. Palindromic and retrograde structures. Messiaen non-retrogradable rhythms.",
  directed: "Time that branches, has signed direction, or follows non-linear paths. Forward-backward alternation, tree-shaped timelines.",
  geometric: "Beats placed along geometric curves — spirals, hyperbolas, logarithmic arcs. Shape determines rhythm.",
  graph_time: "Beats connected as nodes in a graph or tree rather than along a linear timeline. Connectivity, not sequence.",
  density: "Rhythm defined by probability density functions. Gaussian clusters, Poisson arrivals, entropy-maximizing distributions.",
};

export const CATEGORY_COMPOSERS: Record<TimeSigCategory, string[]> = {
  additive: ["Stravinsky", "Bartók", "Balkan folk", "prog rock (Tool, King Crimson)"],
  irrational: ["Ferneyhough", "Nancarrow", "Thomas Adès", "new complexity school"],
  fractional: ["electroacoustic", "algorithmic", "proportional notation"],
  ratio: ["Nancarrow", "Ligeti", "polymetric jazz (Vijay Iyer)"],
  prime: ["microtonal composers", "Erv Wilson", "lattice-based rhythm"],
  polymeter: ["Nancarrow", "Ligeti", "Stravinsky", "Carter", "prog rock (Meshuggah)"],
  nested: ["Xenakis", "spectral music", "algorithmic composition"],
  continuous_tempo: ["Nancarrow", "Ligeti", "Stockhausen", "electronic / tape music"],
  elastic: ["Feldman", "Scelsi", "free improvisation", "graphic scores"],
  real_number: ["generative music", "DSP synthesis", "microtime systems"],
  proportional: ["John Cage", "Earle Brown", "Feldman", "graphic scores"],
  absolute_time: ["tape music", "electronic", "film scoring"],
  timeline: ["Cage", "Cardew", "event scores"],
  subdivision_tree: ["Ferneyhough", "Finnissy", "new complexity", "spectral music"],
  irrational_subdiv: ["Ferneyhough", "new complexity", "spectral music"],
  hybrid_grid: ["Carter", "Babbitt", "serialist composers"],
  phase_shift: ["Steve Reich", "Terry Riley", "minimalism", "process music"],
  algorithmic: ["Toussaint (Euclidean)", "Xenakis", "Wolfram", "West African drumming"],
  stochastic: ["Xenakis", "Cage (chance)", "algorithmic composition"],
  non_terminating: ["Cage", "Xenakis", "mathematical music"],
  fractal_time: ["Mandelbrot-inspired", "Cantor", "spectral music"],
  limit_process: ["mathematical music", "conceptual composition"],
  retrograde: ["Messiaen", "serialist composers", "palindromic forms"],
  directed: ["Stockhausen", "Xenakis", "branching-time notation"],
  geometric: ["algorithmic art", "generative music", "mathematical visualization"],
  graph_time: ["experimental notation", "network music", "Cardew"],
  density: ["Xenakis (stochastic)", "spectral music", "probability-based composition"],
};

// ── Anchor mode ──────────────────────────────────────────────────────
// Controls how the listener perceives the meter.

export type AnchorMode = "single" | "multiple" | "none";

export const ANCHOR_DESCRIPTIONS: Record<AnchorMode, string> = {
  single: "One reference pulse — metronome click, visual subdivisions",
  multiple: "Competing pulses — two colored click tracks, stereo separation",
  none: "No pulse — floating, ungridded. Timeline visualization only",
};

/** Default anchor mode per sub-category */
export const CATEGORY_ANCHOR: Record<TimeSigCategory, AnchorMode> = {
  additive: "single",
  irrational: "single",
  fractional: "single",
  ratio: "multiple",
  prime: "single",
  polymeter: "multiple",
  nested: "multiple",
  continuous_tempo: "single",
  elastic: "none",
  real_number: "single",
  proportional: "none",
  absolute_time: "none",
  timeline: "none",
  subdivision_tree: "single",
  irrational_subdiv: "single",
  hybrid_grid: "single",
  phase_shift: "multiple",
  algorithmic: "single",
  stochastic: "none",
  non_terminating: "none",
  fractal_time: "none",
  limit_process: "none",
  retrograde: "single",
  directed: "none",
  geometric: "none",
  graph_time: "none",
  density: "none",
};

// ── Periodicity axis ──────────────────────────────────────────────────
// Orthogonal to category: does this structure repeat?

export type PeriodicityClass = "periodic" | "quasi_periodic" | "aperiodic" | "non_cyclic";

export const PERIODICITY_LABELS: Record<PeriodicityClass, string> = {
  periodic: "Periodic",
  quasi_periodic: "Quasi-Periodic",
  aperiodic: "Aperiodic",
  non_cyclic: "Non-Cyclic",
};

export const PERIODICITY_DESCRIPTIONS: Record<PeriodicityClass, string> = {
  periodic: "Repeats exactly every cycle — the brain can lock on.",
  quasi_periodic: "Eventually aligns via LCM of layers — long-range periodicity.",
  aperiodic: "Never aligns at any timescale — no periodic reduction possible.",
  non_cyclic: "No repetition concept at all — each moment is unique.",
};

const CATEGORY_PERIODICITY_DEFAULT: Record<TimeSigCategory, PeriodicityClass> = {
  additive: "periodic", irrational: "periodic", fractional: "periodic",
  prime: "periodic", polymeter: "quasi_periodic", nested: "quasi_periodic",
  ratio: "quasi_periodic", subdivision_tree: "periodic", hybrid_grid: "periodic",
  graph_time: "non_cyclic", continuous_tempo: "periodic", elastic: "aperiodic",
  phase_shift: "quasi_periodic", irrational_subdiv: "aperiodic",
  retrograde: "periodic", directed: "non_cyclic",
  algorithmic: "periodic", stochastic: "non_cyclic",
  non_terminating: "aperiodic", fractal_time: "aperiodic", limit_process: "aperiodic",
  real_number: "aperiodic", proportional: "non_cyclic",
  absolute_time: "non_cyclic", timeline: "non_cyclic",
  geometric: "aperiodic", density: "non_cyclic",
};

export function getPeriodicityClass(sig: TimeSigDef): PeriodicityClass {
  return sig.periodicityClass ?? CATEGORY_PERIODICITY_DEFAULT[sig.category];
}

// ── Perceptual resistance metrics ─────────────────────────────────────
// Quantifies how hard it is for the brain to collapse the rhythm into
// a simpler periodic model. Low values = easy to normalize, high = resistant.

export interface PerceptualResistance {
  /** 0 = no discernible pulse, 1 = perfectly steady click */
  pulseClarity: number;
  /** 0 = non-cyclic / never repeats, 1 = exact repetition */
  periodicity: number;
  /** 0 = fully asymmetric, 1 = palindromic groups */
  symmetry: number;
  /** 0 = cannot be heard as a simpler meter, 1 = trivially reducible */
  reducibility: number;
}

export function computePerceptualResistance(sig: TimeSigDef): PerceptualResistance {
  const { groups, totalBeats, category, polyLayers } = sig;
  const layer = CATEGORY_LAYER[category];

  // ── pulseClarity
  const mean = totalBeats / Math.max(groups.length, 1);
  const variance = groups.length > 1
    ? groups.reduce((s, g) => s + (g - mean) ** 2, 0) / groups.length : 0;
  const maxVar = Math.max((totalBeats / 2) ** 2, 0.01);
  const regularity = 1 - Math.min(variance / maxVar, 1);
  const layerPenalty = layer === "generative" ? 0.3 : layer === "transformation" ? 0.15 : 0;
  const polyPenalty = polyLayers && polyLayers.length > 1 ? 0.2 : 0;
  const pulseClarity = Math.max(0, Math.min(1, regularity - layerPenalty - polyPenalty));

  // ── periodicity
  const pc = getPeriodicityClass(sig);
  const pMap: Record<PeriodicityClass, number> = {
    periodic: 1, quasi_periodic: 0.6, aperiodic: 0.2, non_cyclic: 0,
  };
  const periodicity = pMap[pc];

  // ── symmetry (palindrome check — only meaningful with 3+ groups)
  let symmetry = 0;
  if (groups.length >= 3) {
    const rev = [...groups].reverse();
    let match = 0;
    for (let i = 0; i < groups.length; i++) {
      if (Math.abs(groups[i] - rev[i]) < 0.01) match++;
    }
    symmetry = match / groups.length;
  } else if (groups.length === 2) {
    // Two groups: symmetric only if both are equal
    symmetry = Math.abs(groups[0] - groups[1]) < 0.01 ? 1 : 0;
  }
  // Single group or empty: symmetry = 0 (not meaningful)

  // ── reducibility (can the ear simplify this?)
  const isInt = Number.isInteger(totalBeats);
  const isSmall = totalBeats <= 7;
  const allEqual = groups.every(g => Math.abs(g - groups[0]) < 0.01);
  const reducibility = Math.min(1,
    (isInt ? 0.3 : 0) + (isSmall ? 0.2 : 0) +
    (allEqual ? 0.3 : 0) + (groups.length <= 3 ? 0.2 : 0));

  return { pulseClarity, periodicity, symmetry, reducibility };
}

// ── Anti-collapse playback modes ──────────────────────────────────────
// Controls how much the playback actively resists perceptual normalization.

export type AntiCollapseMode = "human_friendly" | "ambiguous" | "non_reducible";

export const ANTI_COLLAPSE_LABELS: Record<AntiCollapseMode, string> = {
  human_friendly: "Clear",
  ambiguous: "Ambiguous",
  non_reducible: "Non-Reducible",
};

export const ANTI_COLLAPSE_DESCRIPTIONS: Record<AntiCollapseMode, string> = {
  human_friendly: "Clear accents, stable tempo. Default listening mode.",
  ambiguous: "Reduced accents, mild timing jitter, rotating dominance. Harder to lock onto a pulse.",
  non_reducible: "No stable pulse, cumulative irrational drift, no accents. Cannot be heard as a simpler meter.",
};

// ── Time signature definition ────────────────────────────────────────

/** A single metric layer in a polymeter */
export interface PolyLayer {
  /** Display label for this layer, e.g. "3/4" */
  label: string;
  /** Beat grouping for this layer */
  groups: number[];
  /** Total beats in one cycle of this layer */
  totalBeats: number;
  /** Color hint (index into GROUP_COLORS) */
  colorIdx?: number;
}

export interface TimeSigDef {
  id: string;
  category: TimeSigCategory;
  /** Display name, e.g. "(3+2+3)/8" */
  display: string;
  /** Longer explanation */
  description: string;
  /** Total measure duration in abstract beat units */
  totalBeats: number;
  /** Grouping structure — how beats cluster */
  groups: number[];
  /** BPM scaling factor (1 = normal, <1 = each beat is longer, >1 = shorter) */
  tempoScale: number;
  /** Whether this is a built-in or user-created sig */
  isCustom?: boolean;
  /** Tags for filtering */
  tags?: string[];
  /** Override anchor mode (if different from category default) */
  anchorMode?: AnchorMode;
  /** For polymeter / layered sigs: independent metric layers that run simultaneously */
  polyLayers?: PolyLayer[];
  /** Periodicity classification override (defaults to category default) */
  periodicityClass?: PeriodicityClass;
}

/** Get the effective anchor mode for a sig */
export function getAnchorMode(sig: TimeSigDef): AnchorMode {
  return sig.anchorMode ?? CATEGORY_ANCHOR[sig.category];
}

// ── Built-in time signatures by category ─────────────────────────────

export const BUILTIN_SIGS: TimeSigDef[] = [
  // ══════════════════════════════════════════════════════════════
  // SIGNATURES — Extended time signatures (notational variants)
  // ══════════════════════════════════════════════════════════════

  // ── Additive ──
  {
    id: "add_3_2_3_8", category: "additive", display: "(3+2+3)/8",
    description: "8 eighth notes grouped as 3+2+3. Common in Balkan music (aksak). Creates a limping, asymmetric groove.",
    totalBeats: 8, groups: [3, 2, 3], tempoScale: 1, tags: ["balkan", "aksak"],
  },
  {
    id: "add_2_2_2_3_8", category: "additive", display: "(2+2+2+3)/8",
    description: "9/8 with the long group at the end. Like a 4/4 bar with an extra eighth note appended.",
    totalBeats: 9, groups: [2, 2, 2, 3], tempoScale: 1, tags: ["9/8"],
  },
  {
    id: "add_3_3_2_8", category: "additive", display: "(3+3+2)/8",
    description: "8 eighth notes grouped 3+3+2. The 'reverse tresillo'. Widely used in Latin and African music.",
    totalBeats: 8, groups: [3, 3, 2], tempoScale: 1, tags: ["tresillo", "latin"],
  },
  {
    id: "add_2_3_2_2_8", category: "additive", display: "(2+3+2+2)/8",
    description: "9/8 aksak pattern. Bulgarian folk rhythm. The 3 group creates an asymmetric lilt.",
    totalBeats: 9, groups: [2, 3, 2, 2], tempoScale: 1, tags: ["bulgarian", "aksak"],
  },
  {
    id: "add_5_5_7_16", category: "additive", display: "(5+5+7)/16",
    description: "17 sixteenth notes in three unequal groups. Complex asymmetric pattern found in contemporary classical.",
    totalBeats: 17, groups: [5, 5, 7], tempoScale: 1, tags: ["complex"],
  },
  {
    id: "add_3_2_2_7", category: "additive", display: "(3+2+2)/7",
    description: "7 beats split as 3+2+2. A septuple meter with a long-short-short feel.",
    totalBeats: 7, groups: [3, 2, 2], tempoScale: 1, tags: ["7/8"],
  },
  {
    id: "add_2_3_8", category: "additive", display: "(2+3)/8",
    description: "5/8 meter. Short-long pattern. The simplest odd additive meter.",
    totalBeats: 5, groups: [2, 3], tempoScale: 1, tags: ["5/8"],
  },
  {
    id: "add_3_2_2_3_2_12", category: "additive", display: "(3+2+2+3+2)/8",
    description: "12 beats in a quintuple grouping. Extended aksak used in Turkish and Greek music.",
    totalBeats: 12, groups: [3, 2, 2, 3, 2], tempoScale: 1, tags: ["turkish"],
  },
  {
    id: "add_2_2_3_8", category: "additive", display: "(2+2+3)/8",
    description: "7/8 with the long group last. Common in Bulgarian and Macedonian folk music.",
    totalBeats: 7, groups: [2, 2, 3], tempoScale: 1, tags: ["bulgarian", "7/8"],
  },
  {
    id: "add_4_3_3_2_12", category: "additive", display: "(4+3+3+2)/8",
    description: "12 beats with front-heavy grouping. Creates a swung, lopsided 12/8 feel.",
    totalBeats: 12, groups: [4, 3, 3, 2], tempoScale: 1, tags: ["12/8"],
  },
  {
    id: "add_3_3_3_2_11", category: "additive", display: "(3+3+3+2)/8",
    description: "11/8 aksak. Three triples followed by a duple. Used in prog and Turkish folk.",
    totalBeats: 11, groups: [3, 3, 3, 2], tempoScale: 1, tags: ["11/8", "prog"],
  },
  {
    id: "add_2_3_2_3_10", category: "additive", display: "(2+3+2+3)/8",
    description: "10/8 alternating short-long. Creates a rocking, wave-like feel.",
    totalBeats: 10, groups: [2, 3, 2, 3], tempoScale: 1, tags: ["10/8"],
  },

  // ── Irrational denominator ──
  {
    id: "irr_4_3", category: "irrational", display: "4/3",
    description: "4 third-notes per measure. Each beat = 1 note of a triplet. Makes the measure √(4/3) × a normal 4/4 bar. Used by Ferneyhough.",
    totalBeats: 4, groups: [4], tempoScale: 1, tags: ["ferneyhough"],
  },
  {
    id: "irr_5_6", category: "irrational", display: "5/6",
    description: "5 sixth-notes per measure. Beat unit = 1/6, a sextuplet partial. Compresses time by 2/3 vs 5/4.",
    totalBeats: 5, groups: [5], tempoScale: 1, tags: ["new-complexity"],
  },
  {
    id: "irr_7_12", category: "irrational", display: "7/12",
    description: "7 twelfth-notes per measure. Each beat is very short — a single swing-triplet partial. Creates a very dense texture.",
    totalBeats: 7, groups: [3, 4], tempoScale: 1, tags: ["dense"],
  },
  {
    id: "irr_3_5", category: "irrational", display: "3/5",
    description: "3 fifth-notes per measure. Beat unit = quintuplet partial. Slightly longer than 3/4, creating a stretched feel.",
    totalBeats: 3, groups: [3], tempoScale: 1, tags: ["quintuplet"],
  },
  {
    id: "irr_4_6", category: "irrational", display: "4/6",
    description: "4 sextuplet partials per measure. Equivalent to 2/3 of a 4/4 bar. Creates contracted time.",
    totalBeats: 4, groups: [2, 2], tempoScale: 1, tags: ["contracted"],
  },
  {
    id: "irr_3_10", category: "irrational", display: "3/10",
    description: "3 decimuplet partials per measure. Each beat is 1/10 of a whole note. Extremely fast, flickering texture.",
    totalBeats: 3, groups: [3], tempoScale: 1, tags: ["fast", "new-complexity"],
  },
  {
    id: "irr_6_5", category: "irrational", display: "6/5",
    description: "6 quintuplet partials per measure. Slightly stretched 6/4. Creates a subtle temporal warp.",
    totalBeats: 6, groups: [3, 3], tempoScale: 1, tags: ["quintuplet"],
  },
  {
    id: "irr_5_3", category: "irrational", display: "5/3",
    description: "5 third-notes per measure. Each beat = one triplet partial. Expanded time, very spacious.",
    totalBeats: 5, groups: [2, 3], tempoScale: 1, tags: ["ferneyhough"],
  },

  // ── Fractional numerator ──
  {
    id: "frac_3_5_4", category: "fractional", display: "3.5/4",
    description: "3 and a half quarter notes per measure. An extra eighth note tacked on. Creates perpetual rhythmic displacement.",
    totalBeats: 3.5, groups: [2, 1.5], tempoScale: 1, tags: ["displaced"],
  },
  {
    id: "frac_2_25_8", category: "fractional", display: "2.25/8",
    description: "2 and a quarter eighth notes. Very short measure with a 32nd-note overhang. Extreme metric compression.",
    totalBeats: 2.25, groups: [2.25], tempoScale: 1, tags: ["micro"],
  },
  {
    id: "frac_4_5_4", category: "fractional", display: "4.5/4",
    description: "4 and a half quarter notes. Like 9/8 but conceptualized differently — a 4/4 bar plus an extra eighth.",
    totalBeats: 4.5, groups: [2, 2.5], tempoScale: 1, tags: ["extended"],
  },
  {
    id: "frac_1_75_4", category: "fractional", display: "1.75/4",
    description: "1 and three-quarter quarter notes per measure. A measure shorter than 2/4 by a sixteenth. Micro-measure.",
    totalBeats: 1.75, groups: [1.75], tempoScale: 1, tags: ["micro"],
  },
  {
    id: "frac_5_5_8", category: "fractional", display: "5.5/8",
    description: "5 and a half eighth notes. Like 11/16 but felt in halved units. Creates a 2+2+1.5 lilt.",
    totalBeats: 5.5, groups: [2, 2, 1.5], tempoScale: 1, tags: ["displaced"],
  },
  {
    id: "frac_2_33_4", category: "fractional", display: "2.33/4",
    description: "2 and a third quarter notes. Measure = 7 triplet partials. Perpetual 3-against-something drift.",
    totalBeats: 7/3, groups: [7/3], tempoScale: 1, tags: ["triplet-drift"],
  },
  {
    id: "frac_6_25_8", category: "fractional", display: "6.25/8",
    description: "6 and a quarter eighths. Like 6/8 with a 32nd-note tail. Tiny asymmetry accumulates over repetitions.",
    totalBeats: 6.25, groups: [3, 3.25], tempoScale: 1, tags: ["micro-tail"],
  },

  // ── Ratio ──
  {
    id: "ratio_5_7", category: "ratio", display: "5:7",
    description: "Two simultaneous pulses: 5 against 7. Five beats in one stream for every seven in another. Nancarrow polyrhythm.",
    totalBeats: 35, groups: Array.from({ length: 7 }, () => 5), tempoScale: 1, tags: ["nancarrow", "polyrhythm"],
    polyLayers: [
      { label: "5", groups: Array.from({ length: 7 }, () => 5), totalBeats: 35, colorIdx: 0 },
      { label: "7", groups: Array.from({ length: 5 }, () => 7), totalBeats: 35, colorIdx: 1 },
    ],
  },
  {
    id: "ratio_3_4", category: "ratio", display: "3:4",
    description: "The fundamental polyrhythm. 3 beats against 4. One of the most common cross-rhythms in world music.",
    totalBeats: 12, groups: [3, 3, 3, 3], tempoScale: 1, tags: ["cross-rhythm"],
    polyLayers: [
      { label: "3", groups: [3, 3, 3, 3], totalBeats: 12, colorIdx: 0 },
      { label: "4", groups: [4, 4, 4], totalBeats: 12, colorIdx: 1 },
    ],
  },
  {
    id: "ratio_7_11", category: "ratio", display: "7:11",
    description: "Seven beats against eleven. A highly complex polyrhythm that creates irrational phase relationships.",
    totalBeats: 77, groups: Array.from({ length: 11 }, () => 7), tempoScale: 1, tags: ["complex", "nancarrow"],
    polyLayers: [
      { label: "7", groups: Array.from({ length: 11 }, () => 7), totalBeats: 77, colorIdx: 0 },
      { label: "11", groups: Array.from({ length: 7 }, () => 11), totalBeats: 77, colorIdx: 1 },
    ],
  },
  {
    id: "ratio_5_3", category: "ratio", display: "5:3",
    description: "Five beats against three. Quintuplet feel over a waltz. Creates a lilting, unresolved texture.",
    totalBeats: 15, groups: Array.from({ length: 3 }, () => 5), tempoScale: 1, tags: ["quintuplet"],
    polyLayers: [
      { label: "5", groups: Array.from({ length: 3 }, () => 5), totalBeats: 15, colorIdx: 0 },
      { label: "3", groups: Array.from({ length: 5 }, () => 3), totalBeats: 15, colorIdx: 1 },
    ],
  },
  {
    id: "ratio_4_7", category: "ratio", display: "4:7",
    description: "Four against seven. The slower stream creates a stretched 4/4 over a rapid septuplet. Extreme phase offset.",
    totalBeats: 28, groups: Array.from({ length: 7 }, () => 4), tempoScale: 1, tags: ["complex", "ligeti"],
    polyLayers: [
      { label: "4", groups: Array.from({ length: 7 }, () => 4), totalBeats: 28, colorIdx: 0 },
      { label: "7", groups: Array.from({ length: 4 }, () => 7), totalBeats: 28, colorIdx: 1 },
    ],
  },
  {
    id: "ratio_11_8", category: "ratio", display: "11:8",
    description: "Eleven against eight. Close to 4:3 but with one extra beat creating constant drift. Nancarrow-style.",
    totalBeats: 88, groups: Array.from({ length: 8 }, () => 11), tempoScale: 1, tags: ["nancarrow"],
    polyLayers: [
      { label: "11", groups: Array.from({ length: 8 }, () => 11), totalBeats: 88, colorIdx: 0 },
      { label: "8", groups: Array.from({ length: 11 }, () => 8), totalBeats: 88, colorIdx: 1 },
    ],
  },
  {
    id: "ratio_8_5", category: "ratio", display: "8:5",
    description: "Eight against five. The golden ratio approximation as polyrhythm. Near-Fibonacci phase cycling.",
    totalBeats: 40, groups: Array.from({ length: 5 }, () => 8), tempoScale: 1, tags: ["golden", "polyrhythm"],
    polyLayers: [
      { label: "8", groups: Array.from({ length: 5 }, () => 8), totalBeats: 40, colorIdx: 0 },
      { label: "5", groups: Array.from({ length: 8 }, () => 5), totalBeats: 40, colorIdx: 1 },
    ],
  },

  // ── Prime / lattice ──
  {
    id: "prime_7_5", category: "prime", display: "7/5",
    description: "7 quintuplet partials per measure. Based on the septimal tritone ratio. Microtonal rhythm.",
    totalBeats: 7, groups: [3, 4], tempoScale: 1, tags: ["septimal"],
  },
  {
    id: "prime_11_8", category: "prime", display: "11/8",
    description: "11 eighth notes per measure. The undecimal superfourth as meter. 11 is the first prime that doesn't appear in standard music.",
    totalBeats: 11, groups: [3, 3, 3, 2], tempoScale: 1, tags: ["undecimal"],
  },
  {
    id: "prime_13_8", category: "prime", display: "13/8",
    description: "13 eighth notes. Tridecimal meter. Appears in Bulgarian and Turkish folk music as additive groupings.",
    totalBeats: 13, groups: [3, 2, 3, 2, 3], tempoScale: 1, tags: ["tridecimal", "balkan"],
  },
  {
    id: "prime_17_16", category: "prime", display: "17/16",
    description: "17 sixteenth notes. Just barely more than one beat. A micro-extension that creates subtle metric shift.",
    totalBeats: 17, groups: [4, 4, 4, 5], tempoScale: 1, tags: ["micro", "shift"],
  },
  {
    id: "prime_31_16", category: "prime", display: "31/16",
    description: "31 sixteenth notes (≈2 beats). The 31st harmonic as rhythm. Approaches 2/1 but never arrives.",
    totalBeats: 31, groups: [4, 4, 4, 4, 4, 4, 3, 4], tempoScale: 1, tags: ["harmonic-31"],
  },
  {
    id: "prime_5_4", category: "prime", display: "5/4",
    description: "5 quarter notes per measure. The simplest odd prime meter. Ubiquitous in prog rock and jazz.",
    totalBeats: 5, groups: [3, 2], tempoScale: 1, tags: ["5/4", "prog"],
  },
  {
    id: "prime_19_16", category: "prime", display: "19/16",
    description: "19 sixteenth notes. The 19th harmonic as rhythm. A barely-extended beat with subtle asymmetry.",
    totalBeats: 19, groups: [4, 4, 4, 4, 3], tempoScale: 1, tags: ["harmonic-19"],
  },
  {
    id: "prime_23_8", category: "prime", display: "23/8",
    description: "23 eighth notes. A large prime meter. Resists subdivision into neat groups.",
    totalBeats: 23, groups: [3, 3, 2, 3, 3, 3, 3, 3], tempoScale: 1, tags: ["large-prime"],
  },

  // ══════════════════════════════════════════════════════════════
  // LAYERED — Composite & multi-layer meters
  // ══════════════════════════════════════════════════════════════

  // ── Polymeter ──
  {
    id: "poly_3_4", category: "polymeter", display: "3 vs 4 poly",
    description: "3/4 and 4/4 superimposed. Downbeats coincide every 12 beats. The fundamental polymetric clash.",
    totalBeats: 12, groups: [3, 3, 3, 3], tempoScale: 1, tags: ["3-vs-4", "basic-poly"],
    polyLayers: [
      { label: "3/4", groups: [3, 3, 3, 3], totalBeats: 12, colorIdx: 0 },
      { label: "4/4", groups: [4, 4, 4], totalBeats: 12, colorIdx: 1 },
    ],
  },
  {
    id: "poly_5_7", category: "polymeter", display: "5 vs 7 poly",
    description: "5/8 and 7/8 simultaneously. Downbeats coincide every 35 beats. Creates a long, complex interference pattern.",
    totalBeats: 35, groups: [5, 5, 5, 5, 5, 5, 5], tempoScale: 1, tags: ["5-vs-7", "long-cycle"],
    polyLayers: [
      { label: "5/8", groups: [5, 5, 5, 5, 5, 5, 5], totalBeats: 35, colorIdx: 0 },
      { label: "7/8", groups: [7, 7, 7, 7, 7], totalBeats: 35, colorIdx: 1 },
    ],
  },
  {
    id: "poly_3_4_5", category: "polymeter", display: "3+4+5 poly",
    description: "Three simultaneous meters: 3, 4, and 5. Downbeats coincide every 60 beats. Triple polymetric texture.",
    totalBeats: 60, groups: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3], tempoScale: 1, tags: ["triple-poly", "complex"],
    polyLayers: [
      { label: "3/4", groups: Array.from({ length: 20 }, () => 3), totalBeats: 60, colorIdx: 0 },
      { label: "4/4", groups: Array.from({ length: 15 }, () => 4), totalBeats: 60, colorIdx: 1 },
      { label: "5/4", groups: Array.from({ length: 12 }, () => 5), totalBeats: 60, colorIdx: 2 },
    ],
  },
  {
    id: "poly_meshuggah", category: "polymeter", display: "Meshuggah 23/16",
    description: "A 23-sixteenth-note riff over 4/4 drums. The guitar pattern cycles every 23 while drums cycle every 16, creating long phase offsets.",
    totalBeats: 23, groups: [4, 4, 4, 4, 4, 3], tempoScale: 1, tags: ["meshuggah", "metal"],
    polyLayers: [
      { label: "23/16 riff", groups: [4, 4, 4, 4, 4, 3], totalBeats: 23, colorIdx: 0 },
      { label: "4/4 drums", groups: [4, 4, 4, 4, 7], totalBeats: 23, colorIdx: 3 },
    ],
  },
  {
    id: "poly_4_4_7_8", category: "polymeter", display: "4/4 vs 7/8",
    description: "Standard 4/4 against 7/8. The 4/4 barline falls at different points within 7/8. Stravinsky-like metric dissonance.",
    totalBeats: 28, groups: [4, 4, 4, 4, 4, 4, 4], tempoScale: 1, tags: ["stravinsky", "metric-dissonance"],
    polyLayers: [
      { label: "4/4", groups: [4, 4, 4, 4, 4, 4, 4], totalBeats: 28, colorIdx: 0 },
      { label: "7/8", groups: [7, 7, 7, 7], totalBeats: 28, colorIdx: 1 },
    ],
  },

  // ── Nested / Metric Modulation ──
  {
    id: "nest_4_in_5_7", category: "nested", display: "4/4 → 5/7 subdivisions",
    description: "4/4 meter where each beat is subdivided into 5/7 of its normal value. Creates a fractal-like nested temporal structure.",
    totalBeats: 20, groups: [5, 5, 5, 5], tempoScale: 1, tags: ["fractal", "xenakis"],
    polyLayers: [
      { label: "4/4", groups: [5, 5, 5, 5], totalBeats: 20, colorIdx: 0 },
      { label: "7-grid", groups: [7, 7, 6], totalBeats: 20, colorIdx: 1 },
    ],
  },
  {
    id: "nest_3_in_sqrt2", category: "nested", display: "3/4 → √2 subdivisions",
    description: "3/4 meter where each beat subdivides by √2. Irrational nesting creates non-repeating micro-rhythms.",
    totalBeats: 12, groups: [4, 4, 4], tempoScale: 1, tags: ["irrational", "spectral"],
    polyLayers: [
      { label: "3/4", groups: [4, 4, 4], totalBeats: 12, colorIdx: 0 },
      { label: "√2 grid", groups: [3, 3, 3, 3], totalBeats: 12, colorIdx: 2 },
    ],
  },
  {
    id: "nest_5_in_3_4", category: "nested", display: "5/4 vs 3/4 nesting",
    description: "5/4 where each beat is internally grouped in 3s. Conflicting fives and threes at different levels.",
    totalBeats: 15, groups: [3, 3, 3, 3, 3], tempoScale: 1, tags: ["polymetric", "fractal"],
    polyLayers: [
      { label: "5/4", groups: [3, 3, 3, 3, 3], totalBeats: 15, colorIdx: 0 },
      { label: "3/4", groups: [5, 5, 5], totalBeats: 15, colorIdx: 1 },
    ],
  },
  {
    id: "nest_7_in_phi", category: "nested", display: "7/8 → φ subdivisions",
    description: "7/8 where each beat subdivides by the golden ratio. Self-similar at every scale. Algorithmic rhythm.",
    totalBeats: 21, groups: [3, 3, 3, 3, 3, 3, 3], tempoScale: 1, tags: ["golden", "fractal"],
    polyLayers: [
      { label: "7/8", groups: [3, 3, 3, 3, 3, 3, 3], totalBeats: 21, colorIdx: 0 },
      { label: "φ grid", groups: [5, 3, 5, 3, 5], totalBeats: 21, colorIdx: 2 },
    ],
  },
  {
    id: "nest_2_levels", category: "nested", display: "3/4 → [2+3]/5 → 7/8",
    description: "Three nesting levels: a 3/4 bar whose beats are split 2+3, each of which splits into 7. Deep fractal time.",
    totalBeats: 21, groups: [2, 3, 2, 3, 2, 3, 2, 4], tempoScale: 1, tags: ["deep-fractal", "xenakis"],
    polyLayers: [
      { label: "3/4 (2+3)", groups: [2, 3, 2, 3, 2, 3, 2, 4], totalBeats: 21, colorIdx: 0 },
      { label: "7/8", groups: [7, 7, 7], totalBeats: 21, colorIdx: 1 },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // CONTINUOUS — Continuous & non-discrete meter
  // ══════════════════════════════════════════════════════════════

  // ── Continuous Tempo ──
  {
    id: "ct_accel_4", category: "continuous_tempo", display: "4/4 accel.",
    description: "4 beats with logarithmic acceleration. Each beat is shorter than the last. Creates a rushing feel within one measure.",
    totalBeats: 4, groups: [1.37, 1.03, 0.86, 0.74], tempoScale: 1, tags: ["accelerando", "logarithmic"],
  },
  {
    id: "ct_decel_4", category: "continuous_tempo", display: "4/4 rit.",
    description: "4 beats with exponential deceleration. Each beat longer than the last. Creates a slowing feel.",
    totalBeats: 4, groups: [0.74, 0.86, 1.03, 1.37], tempoScale: 1, tags: ["ritardando", "exponential"],
  },
  {
    id: "ct_log_6", category: "continuous_tempo", display: "6 log-spaced",
    description: "6 beats with logarithmic spacing. Dense at the start, spreading apart. Like a ball bouncing in reverse.",
    totalBeats: 6, groups: [0.5, 0.65, 0.85, 1.1, 1.35, 1.55], tempoScale: 1, tags: ["logarithmic"],
  },
  {
    id: "ct_exp_5", category: "continuous_tempo", display: "5 exp-spaced",
    description: "5 beats with exponential spacing. Starts wide, compresses. Like a ball falling and bouncing faster.",
    totalBeats: 5, groups: [1.6, 1.2, 0.9, 0.7, 0.6], tempoScale: 1, tags: ["exponential", "bouncing"],
  },
  {
    id: "ct_sine_8", category: "continuous_tempo", display: "8 sine-wave",
    description: "8 beats whose spacing follows a sine curve. Speeds up in the middle, slows at edges. Breathing rhythm.",
    totalBeats: 8, groups: [1.3, 1.0, 0.7, 0.6, 0.6, 0.7, 1.0, 1.3], tempoScale: 1, tags: ["sine", "breathing"],
  },
  {
    id: "ct_golden_accel", category: "continuous_tempo", display: "φ-accel",
    description: "5 beats accelerating by the golden ratio. Each beat is φ times shorter: creates a spiral-like temporal compression.",
    totalBeats: 5, groups: [2.0, 1.24, 0.76, 0.47, 0.53], tempoScale: 1, tags: ["golden", "spiral"],
  },

  // ── Real-number meter ──
  {
    id: "real_pi_4", category: "real_number", display: "π/4",
    description: "Pi quarter notes per measure (≈3.14159 beats). The measure never exactly aligns with any regular grid. Pure computer music.",
    totalBeats: Math.PI, groups: [Math.PI], tempoScale: 1, tags: ["irrational", "generative"],
  },
  {
    id: "real_phi_4", category: "real_number", display: "φ/4",
    description: "Golden ratio quarter notes (≈1.618 beats). Self-similar scaling. The most \"anti-periodic\" possible meter.",
    totalBeats: (1 + Math.sqrt(5)) / 2, groups: [(1 + Math.sqrt(5)) / 2], tempoScale: 1, tags: ["golden", "generative"],
  },
  {
    id: "real_e_8", category: "real_number", display: "e/8",
    description: "Euler's number eighth notes (≈2.718 beats). Like 2.75/8 but slightly off. Creates perpetual drift.",
    totalBeats: Math.E, groups: [Math.E], tempoScale: 1, tags: ["euler", "generative"],
  },
  {
    id: "real_sqrt2_4", category: "real_number", display: "√2/4",
    description: "Square root of 2 quarter notes (≈1.414 beats). Tritone of the octave as a rhythmic interval.",
    totalBeats: Math.SQRT2, groups: [Math.SQRT2], tempoScale: 1, tags: ["sqrt", "generative"],
  },
  {
    id: "real_ln2_4", category: "real_number", display: "ln(2)/4",
    description: "Natural log of 2 quarter notes (≈0.693 beats). Extremely short measure — the octave's rhythmic shadow.",
    totalBeats: Math.LN2, groups: [Math.LN2], tempoScale: 1, tags: ["logarithmic", "generative"],
  },
  {
    id: "real_sqrt5_4", category: "real_number", display: "√5/4",
    description: "Square root of 5 quarter notes (≈2.236 beats). Between duple and triple, always unsettled.",
    totalBeats: Math.sqrt(5), groups: [1, Math.sqrt(5) - 1], tempoScale: 1, tags: ["sqrt", "generative"],
  },
  {
    id: "real_tau_8", category: "real_number", display: "τ/8",
    description: "Tau (2π) eighth notes (≈6.283 beats). A full circle of rhythm. Barely longer than 6/8.",
    totalBeats: 2 * Math.PI, groups: [3, 2 * Math.PI - 3], tempoScale: 1, tags: ["circle", "generative"],
  },

  // ══════════════════════════════════════════════════════════════
  // DURATION — Duration-based systems (non-metric time)
  // ══════════════════════════════════════════════════════════════

  // ── Proportional ──
  {
    id: "prop_3_2_sec", category: "proportional", display: "3.2 seconds",
    description: "Measure = 3.2 seconds of real time. No fixed beat grid. Events placed proportionally within the time span.",
    totalBeats: 3.2, groups: [3.2], tempoScale: 1, tags: ["cage", "time-based"],
    anchorMode: "none",
  },
  {
    id: "prop_5_sec", category: "proportional", display: "5.0 seconds",
    description: "Measure = exactly 5 seconds. Common in graphic scores. Beat placement is spatial/proportional.",
    totalBeats: 5, groups: [5], tempoScale: 1, tags: ["graphic-score"],
    anchorMode: "none",
  },
  {
    id: "prop_1_5_sec", category: "proportional", display: "1.5 seconds",
    description: "Measure = 1.5 seconds. Very short. Forces rapid gestural decisions. Earle Brown influence.",
    totalBeats: 1.5, groups: [1.5], tempoScale: 1, tags: ["brown", "time-based"],
    anchorMode: "none",
  },
  {
    id: "prop_7_sec", category: "proportional", display: "7.0 seconds",
    description: "Measure = 7 seconds. Breath-length phrasing. Used in meditation-inspired scores and Feldman's late works.",
    totalBeats: 7, groups: [3, 4], tempoScale: 1, tags: ["feldman", "breath"],
    anchorMode: "none",
  },
  {
    id: "prop_2_7_sec", category: "proportional", display: "2.7 seconds",
    description: "Measure = 2.7 seconds. An awkward duration that resists internal counting. Pure proportional time.",
    totalBeats: 2.7, groups: [2.7], tempoScale: 1, tags: ["cage", "proportional"],
    anchorMode: "none",
  },

  // ══════════════════════════════════════════════════════════════
  // SUBDIVISION — Subdivision-based complexity
  // ══════════════════════════════════════════════════════════════

  // ── Subdivision Tree ──
  {
    id: "st_3_5_tree", category: "subdivision_tree", display: "3→5 tree",
    description: "3 macro beats, each subdivided into 5 micro beats. Unlike 15/16, the 3-level and 5-level are conceptually nested, not flat.",
    totalBeats: 3, groups: [1, 1, 1], tempoScale: 1, tags: ["nested-sub", "3×5"],
  },
  {
    id: "st_2_3_5_tree", category: "subdivision_tree", display: "2→3→5 tree",
    description: "2 beats, each splits into 3, each of those into 5. Total 30 events in a hierarchical tree. Deep fractal subdivision.",
    totalBeats: 2, groups: [1, 1], tempoScale: 1, tags: ["deep-tree", "2×3×5"],
  },
  {
    id: "st_nonuniform", category: "subdivision_tree", display: "[3,5,7] tree",
    description: "3 beats with nonuniform subdivision: first beat → 3 parts, second → 5 parts, third → 7 parts. Each beat has different internal density.",
    totalBeats: 3, groups: [0.6, 1.0, 1.4], tempoScale: 1, tags: ["nonuniform", "density-gradient"],
  },
  {
    id: "st_prime_tree", category: "subdivision_tree", display: "[2,3,5,7] tree",
    description: "4 beats subdivided by ascending primes: 2, 3, 5, 7. Creates an accelerating density within each successive beat.",
    totalBeats: 4, groups: [0.47, 0.71, 1.18, 1.64], tempoScale: 1, tags: ["prime-sub", "ascending-density"],
  },
  {
    id: "st_fibonacci_tree", category: "subdivision_tree", display: "Fib tree",
    description: "5 beats subdivided by Fibonacci numbers: 1, 1, 2, 3, 5. Natural growth pattern applied to rhythm.",
    totalBeats: 5, groups: [0.42, 0.42, 0.83, 1.25, 2.08], tempoScale: 1, tags: ["fibonacci", "growth"],
  },

  // ══════════════════════════════════════════════════════════════
  // PROCESS — Process-based meter (temporal behavior)
  // ══════════════════════════════════════════════════════════════

  // ── Phase Shift ──
  {
    id: "ps_4_4_8th", category: "phase_shift", display: "4/4 + ⅛ shift",
    description: "Two 4/4 patterns offset by an eighth note. The second voice starts half a beat late, creating a canonic echo effect.",
    totalBeats: 4.5, groups: [0.5, 1, 1, 1, 1], tempoScale: 1, tags: ["reich", "canon"],
  },
  {
    id: "ps_gradual_12", category: "phase_shift", display: "12/8 gradual",
    description: "A 12/8 pattern that gradually drifts. Beats widen by tiny increments. Over many repetitions, it slides out of phase.",
    totalBeats: 12, groups: [0.96, 0.97, 0.98, 0.99, 1.0, 1.01, 1.02, 1.03, 1.04, 1.0, 1.0, 1.0], tempoScale: 1, tags: ["gradual-drift"],
  },
  {
    id: "ps_clapping_music", category: "phase_shift", display: "Clapping Music",
    description: "Steve Reich's Clapping Music pattern: 3+2+1+2 in 12 beats. One voice rotates the pattern by one position each cycle.",
    totalBeats: 12, groups: [3, 2, 1, 2, 1, 2, 1], tempoScale: 1, tags: ["reich", "clapping-music"],
  },
  {
    id: "ps_5_vs_5_offset", category: "phase_shift", display: "5/8 + 1 shift",
    description: "Two 5/8 patterns offset by 1 eighth note. Creates a 2-against-3 like texture from identical material.",
    totalBeats: 6, groups: [1, 2, 3], tempoScale: 1, tags: ["offset", "5/8"],
  },
  {
    id: "ps_micro_drift", category: "phase_shift", display: "micro-drift",
    description: "8 beats where each is 1.01× the previous duration. Imperceptible at first but accumulates into audible drift over repetitions.",
    totalBeats: 8, groups: [0.97, 0.98, 0.99, 1.0, 1.01, 1.02, 1.03, 1.0], tempoScale: 1, tags: ["micro", "drift"],
  },

  // ── Algorithmic / Euclidean ──
  {
    id: "alg_e_5_8", category: "algorithmic", display: "E(5,8)",
    description: "Euclidean rhythm: 5 onsets maximally distributed in 8 slots → [x.xx.xx.]. The Cuban cinquillo.",
    totalBeats: 8, groups: [2, 1, 2, 1, 2], tempoScale: 1, tags: ["euclidean", "cinquillo"],
  },
  {
    id: "alg_e_3_8", category: "algorithmic", display: "E(3,8)",
    description: "Euclidean rhythm: 3 onsets in 8 slots → [x..x..x.]. The Cuban tresillo. Foundation of Afro-Latin rhythms.",
    totalBeats: 8, groups: [3, 3, 2], tempoScale: 1, tags: ["euclidean", "tresillo"],
  },
  {
    id: "alg_e_7_12", category: "algorithmic", display: "E(7,12)",
    description: "Euclidean rhythm: 7 onsets in 12 slots. West African bell pattern. Related to the major diatonic scale.",
    totalBeats: 12, groups: [2, 2, 1, 2, 2, 2, 1], tempoScale: 1, tags: ["euclidean", "bell-pattern", "diatonic"],
  },
  {
    id: "alg_e_5_12", category: "algorithmic", display: "E(5,12)",
    description: "Euclidean rhythm: 5 onsets in 12 slots. The pentatonic rhythm. Related to the minor pentatonic scale.",
    totalBeats: 12, groups: [2, 3, 2, 3, 2], tempoScale: 1, tags: ["euclidean", "pentatonic"],
  },
  {
    id: "alg_e_7_16", category: "algorithmic", display: "E(7,16)",
    description: "Euclidean rhythm: 7 onsets in 16 slots. Complex pattern resembling Brazilian samba timelines.",
    totalBeats: 16, groups: [2, 2, 3, 2, 2, 3, 2], tempoScale: 1, tags: ["euclidean", "samba"],
  },
  {
    id: "alg_e_9_16", category: "algorithmic", display: "E(9,16)",
    description: "Euclidean rhythm: 9 onsets in 16 slots. Dense pattern with 9 attacks in 16 time units.",
    totalBeats: 16, groups: [2, 2, 2, 1, 2, 2, 2, 2, 1], tempoScale: 1, tags: ["euclidean", "dense"],
  },
  {
    id: "alg_e_11_24", category: "algorithmic", display: "E(11,24)",
    description: "Euclidean rhythm: 11 in 24. A complex, long-cycle pattern. Sounds like an ever-shifting compound meter.",
    totalBeats: 24, groups: [2, 2, 3, 2, 2, 2, 2, 3, 2, 2, 2], tempoScale: 1, tags: ["euclidean", "long-cycle"],
  },
  {
    id: "alg_rule30_8", category: "algorithmic", display: "Rule 30 × 8",
    description: "8 beats derived from Wolfram's Rule 30 cellular automaton. Pseudorandom but deterministic.",
    totalBeats: 8, groups: [1, 1, 1, 2, 1, 1, 1], tempoScale: 1, tags: ["cellular-automata", "wolfram"],
  },

  // ══════════════════════════════════════════════════════════════
  // INFINITE — Infinite / non-terminating systems
  // ══════════════════════════════════════════════════════════════

  {
    id: "nt_pi_sqrt2", category: "non_terminating", display: "π/√2",
    description: "π divided by √2 ≈ 2.221 beats. A ratio of two irrational numbers. No periodic alignment is possible at any timescale.",
    totalBeats: Math.PI / Math.SQRT2, groups: [Math.PI / Math.SQRT2], tempoScale: 1, tags: ["doubly-irrational"],
    anchorMode: "none",
  },
  {
    id: "nt_cantor_9", category: "fractal_time", display: "Cantor 9",
    description: "9 beats following the Cantor set: beats at 0,1,2 then 6,7,8 (remove middle third). A fractal silence pattern.",
    totalBeats: 9, groups: [1, 1, 1, 3, 1, 1, 1], tempoScale: 1, tags: ["cantor", "fractal-silence"],
    anchorMode: "none",
  },
  {
    id: "nt_fibonacci_grow", category: "non_terminating", display: "Fib-grow",
    description: "Each repetition has Fibonacci(n) beats: 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89... The measure grows without bound. Groups within each measure use Fibonacci decomposition. Starts at Fib(4)=3.",
    totalBeats: 8, groups: [1, 2, 5], tempoScale: 1, tags: ["fibonacci", "growing"],
    anchorMode: "none",
  },
  {
    id: "nt_sqrt_chain", category: "non_terminating", display: "√2→√3→√5",
    description: "Three beats with durations √2, √3, √5. Pairwise irrational ratios guarantee no periodic alignment anywhere.",
    totalBeats: Math.SQRT2 + Math.sqrt(3) + Math.sqrt(5), groups: [Math.SQRT2, Math.sqrt(3), Math.sqrt(5)], tempoScale: 1, tags: ["sqrt-chain", "incommensurable"],
    anchorMode: "none",
  },
  {
    id: "nt_zeta_4", category: "non_terminating", display: "ζ(2)/4",
    description: "Riemann zeta function ζ(2) = π²/6 ≈ 1.645 beats. A number from analytic number theory as rhythm.",
    totalBeats: (Math.PI * Math.PI) / 6, groups: [(Math.PI * Math.PI) / 6], tempoScale: 1, tags: ["zeta", "number-theory"],
    anchorMode: "none",
  },
  {
    id: "nt_plastic_ratio", category: "non_terminating", display: "ρ meter",
    description: "Plastic ratio ρ ≈ 1.3247. The real root of x³=x+1. Shares self-similar properties with φ but in a different family.",
    totalBeats: 1.3247, groups: [1.3247], tempoScale: 1, tags: ["plastic-ratio", "self-similar"],
    anchorMode: "none",
  },
  {
    id: "nt_e_over_pi", category: "non_terminating", display: "e/π",
    description: "Euler's number divided by pi ≈ 0.865 beats. Extremely short. Whether e/π is rational is still an open problem in mathematics.",
    totalBeats: Math.E / Math.PI, groups: [Math.E / Math.PI], tempoScale: 1, tags: ["open-problem", "ultra-short"],
    anchorMode: "none",
  },

  // ══════════════════════════════════════════════════════════════
  // RETROGRADE — Reversed / negative time segments
  // ══════════════════════════════════════════════════════════════
  {
    id: "retro_palindrome_8", category: "retrograde", display: "Palindrome 8",
    description: "8 beats grouped 1+2+3+2. Reads the same forwards and backwards — a non-retrogradable rhythm (Messiaen). The temporal mirror prevents the ear from assigning a direction.",
    totalBeats: 8, groups: [1, 2, 3, 2], tempoScale: 1, tags: ["palindrome", "messiaen"],
  },
  {
    id: "retro_mirror_10", category: "retrograde", display: "Mirror 10",
    description: "10 beats as 2+3+3+2: symmetric around the center. Reversing playback produces the identical rhythm.",
    totalBeats: 10, groups: [2, 3, 3, 2], tempoScale: 1, tags: ["mirror", "retrograde"],
  },
  {
    id: "retro_contract_expand", category: "retrograde", display: "Contract→Expand",
    description: "Beats shrink then grow: 1.5, 0.5, 0.5, 1.5. Simulates temporal reversal — time compresses then decompresses.",
    totalBeats: 4, groups: [1.5, 0.5, 0.5, 1.5], tempoScale: 1, tags: ["negative-time", "symmetric"],
  },

  // ══════════════════════════════════════════════════════════════
  // DIRECTED — Signed / branching time
  // ══════════════════════════════════════════════════════════════
  {
    id: "dir_branch_6", category: "directed", display: "Branch 6",
    description: "6 beats: 3 forward, then a branch into two 1.5-beat paths. Time forks. In linear playback the branch is serialized, but the structure implies simultaneity.",
    totalBeats: 6, groups: [3, 1.5, 1.5], tempoScale: 1, tags: ["branching"],
    anchorMode: "none", periodicityClass: "non_cyclic",
  },
  {
    id: "dir_zigzag_8", category: "directed", display: "Zigzag 8",
    description: "8 beats alternating direction: 2 forward, 1 back, 2 forward, 1 back, 2 forward. Net displacement = 6 but elapsed = 8. Signed time as rhythm.",
    totalBeats: 8, groups: [2, 1, 2, 1, 2], tempoScale: 1, tags: ["signed-time", "zigzag"],
    anchorMode: "none", periodicityClass: "non_cyclic",
  },

  // ══════════════════════════════════════════════════════════════
  // GEOMETRIC — Beats on mathematical curves
  // ══════════════════════════════════════════════════════════════
  {
    id: "geo_spiral_8", category: "geometric", display: "Spiral 8",
    description: "8 beats along an Archimedean spiral — each beat slightly further from center. Spacing expands like unwinding thread.",
    totalBeats: 8, groups: [0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.7], tempoScale: 1, tags: ["spiral", "expanding"],
    anchorMode: "none",
  },
  {
    id: "geo_hyperbolic_6", category: "geometric", display: "Hyperbolic 6",
    description: "6 beats on a hyperbola: 1/1, 1/2, 1/3, 1/4, 1/5, 1/6. Beats converge toward zero spacing. Harmonic series as rhythm.",
    totalBeats: 2.45, groups: [1, 0.5, 1/3, 0.25, 0.2, 1/6], tempoScale: 1, tags: ["hyperbolic", "converging"],
    anchorMode: "none",
  },
  {
    id: "geo_lissajous_12", category: "geometric", display: "Lissajous 12",
    description: "12 beats placed at Lissajous figure crossings (3:4 frequency ratio). Spacing follows sine-product curve.",
    totalBeats: 12, groups: [1.3, 0.7, 0.7, 1.3, 1.3, 0.7, 0.7, 1.3, 1.3, 0.7, 0.7, 1.3], tempoScale: 1, tags: ["lissajous", "sine"],
    anchorMode: "none",
  },

  // ══════════════════════════════════════════════════════════════
  // GRAPH TIME — Beats as nodes, not sequence
  // ══════════════════════════════════════════════════════════════
  {
    id: "graph_tree_7", category: "graph_time", display: "Binary Tree 7",
    description: "7 beats as a binary tree: root → 2 children → 4 grandchildren. Hierarchical, not sequential — depth determines emphasis, not position.",
    totalBeats: 7, groups: [1, 2, 4], tempoScale: 1, tags: ["tree", "hierarchical"],
    anchorMode: "none", periodicityClass: "non_cyclic",
  },
  {
    id: "graph_star_5", category: "graph_time", display: "Star 5",
    description: "5 beats as a star graph: one hub beat connected to 4 spokes. All non-hub beats are equidistant from center but unrelated to each other.",
    totalBeats: 5, groups: [1, 1, 1, 1, 1], tempoScale: 1, tags: ["star", "graph"],
    anchorMode: "none", periodicityClass: "non_cyclic",
  },

  // ══════════════════════════════════════════════════════════════
  // DENSITY — Probability density as rhythm
  // ══════════════════════════════════════════════════════════════
  {
    id: "density_gaussian_8", category: "density", display: "Gaussian 8",
    description: "8 beats placed by a bell curve: dense in the center, sparse at edges. The rhythm clusters around the midpoint.",
    totalBeats: 8, groups: [1.6, 1.1, 0.7, 0.6, 0.6, 0.7, 1.1, 1.6], tempoScale: 1, tags: ["gaussian", "bell-curve"],
    anchorMode: "none", periodicityClass: "non_cyclic",
  },
  {
    id: "density_poisson_6", category: "density", display: "Poisson 6",
    description: "6 beats with Poisson-like spacing: memoryless arrivals. Each inter-beat gap is independent — exponentially distributed.",
    totalBeats: 6, groups: [0.8, 1.3, 0.5, 1.7, 0.9, 0.8], tempoScale: 1, tags: ["poisson", "memoryless"],
    anchorMode: "none", periodicityClass: "non_cyclic",
  },
  {
    id: "density_maxent_10", category: "density", display: "MaxEntropy 10",
    description: "10 beats maximizing Shannon entropy: spacing chosen so no simple pattern can be extracted. Information-theoretic rhythm.",
    totalBeats: 10, groups: [1.3, 0.7, 1.1, 0.8, 1.2, 0.6, 1.4, 0.9, 1.0, 1.0], tempoScale: 1, tags: ["entropy", "information"],
    anchorMode: "none", periodicityClass: "non_cyclic",
  },
];

// ── Custom time signature support ────────────────────────────────────

const CUSTOM_STORAGE_KEY = "lt_weird_ts_custom";

export function loadCustomSigs(): TimeSigDef[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TimeSigDef[];
  } catch { return []; }
}

export function saveCustomSigs(sigs: TimeSigDef[]) {
  localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(sigs));
}

export function addCustomSig(sig: TimeSigDef): TimeSigDef[] {
  const existing = loadCustomSigs();
  const updated = [...existing, { ...sig, isCustom: true }];
  saveCustomSigs(updated);
  return updated;
}

export function removeCustomSig(id: string): TimeSigDef[] {
  const existing = loadCustomSigs();
  const updated = existing.filter(s => s.id !== id);
  saveCustomSigs(updated);
  return updated;
}

export function getAllSigs(): TimeSigDef[] {
  return [...BUILTIN_SIGS, ...loadCustomSigs()];
}

export function getSigsByCategory(cat: TimeSigCategory): TimeSigDef[] {
  return getAllSigs().filter(s => s.category === cat);
}

export function getSigsByLayer(layer: StructuralLayer): TimeSigDef[] {
  return getAllSigs().filter(s => CATEGORY_LAYER[s.category] === layer);
}

export function getCategoriesInLayer(layer: StructuralLayer): TimeSigCategory[] {
  return (Object.keys(CATEGORY_LAYER) as TimeSigCategory[]).filter(c => CATEGORY_LAYER[c] === layer);
}

export function getSigsByPeriodicity(pc: PeriodicityClass): TimeSigDef[] {
  return getAllSigs().filter(s => getPeriodicityClass(s) === pc);
}

/** @deprecated Use getSigsByLayer */
export function getSigsByMeta(meta: MetaCategory): TimeSigDef[] {
  return getAllSigs().filter(s => CATEGORY_META[s.category] === meta);
}
/** @deprecated Use getCategoriesInLayer */
export function getCategoriesInMeta(meta: MetaCategory): TimeSigCategory[] {
  return (Object.keys(CATEGORY_META) as TimeSigCategory[]).filter(c => CATEGORY_META[c] === meta);
}

// ── Pattern generation from time signature ───────────────────────────

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Generate events for a single group array (shared by both single-layer and poly-layer paths) */
function generateGroupEvents(
  groups: number[],
  totalBeats: number,
  layers: BeatLayer[],
  polyLayerIdx?: number,
): RhythmEvent[] {
  const events: RhythmEvent[] = [];
  let pos = 0;
  for (let gi = 0; gi < groups.length; gi++) {
    const grpSize = groups[gi];
    const intSteps = Math.max(1, Math.round(grpSize));

    if (layers.includes("macro")) {
      // Group start (downbeat of this group)
      events.push({
        beatPos: pos,
        layer: "macro",
        accent: gi === 0,
        isGroupStart: true,
        polyLayerIdx,
      });
      // Internal beats within the group (not group starts, but audible beats)
      for (let s = 1; s < intSteps; s++) {
        events.push({
          beatPos: pos + (s * grpSize) / intSteps,
          layer: "macro",
          accent: false,
          isGroupStart: false,
          polyLayerIdx,
        });
      }
    }

    if (layers.includes("micro") && intSteps >= 1) {
      // Place micro beats halfway through each beat within the group
      for (let s = 0; s < intSteps; s++) {
        const beatStart = pos + (s * grpSize) / intSteps;
        const beatLen = grpSize / intSteps;
        const microPos = beatStart + beatLen / 2;
        events.push({
          beatPos: microPos,
          layer: "micro",
          accent: false,
          polyLayerIdx,
        });
      }
    }

    if (layers.includes("division") && intSteps >= 1) {
      const divsPerMicro = 2;
      for (let s = 0; s < intSteps; s++) {
        for (let d = 1; d < divsPerMicro; d++) {
          const divPos = pos + (s * grpSize) / intSteps + (d * grpSize) / (intSteps * divsPerMicro);
          events.push({
            beatPos: divPos,
            layer: "division",
            accent: false,
            polyLayerIdx,
          });
        }
      }
    }

    pos += grpSize;
  }
  return events;
}

/**
 * Choose the best regular-pulse interval (1, 2, or 3 beats) for the
 * reference grid.  The goal is to pick the interval whose downbeats
 * overlap the *least* with the signature's group boundaries, so the
 * listener hears maximum contrast between the regular grid and the
 * actual meter.
 *
 * - Very short measures (≤3 beats): always 1-beat grid.
 * - Otherwise, score each candidate by how many of its clicks land on
 *   a group boundary.  Fewer coincidences = more audible drift.
 *   Ties prefer the smaller interval (denser grid).
 */
export function bestReferenceInterval(sig: TimeSigDef): number {
  const { totalBeats, groups } = sig;
  if (totalBeats <= 3) return 1;

  // Collect group-boundary positions (cumulative sums, excl. 0)
  const boundaries = new Set<number>();
  let pos = 0;
  for (const g of groups) {
    pos += g;
    if (pos < totalBeats) boundaries.add(Math.round(pos * 1000) / 1000);
  }

  const candidates = [1, 2, 3].filter(c => c < totalBeats);
  let bestInterval = 1;
  let bestCoincidence = Infinity;

  for (const interval of candidates) {
    const limit = Math.floor(totalBeats);
    let coincidences = 0;
    for (let r = interval; r < limit; r += interval) {
      // Check if this reference click lands on (or very near) a group boundary
      for (const b of boundaries) {
        if (Math.abs(r - b) < 0.05) { coincidences++; break; }
      }
    }
    if (coincidences < bestCoincidence) {
      bestCoincidence = coincidences;
      bestInterval = interval;
    }
  }
  return bestInterval;
}

/**
 * Generate beat events for a time signature.
 * Creates macro beats at group boundaries, micro beats within groups,
 * and optionally division beats for finer subdivisions.
 * For polyLayers sigs, generates events for each layer independently.
 */
export function generateTimeSigPattern(
  sig: TimeSigDef,
  bpm: number,
  layers: BeatLayer[] = ["macro", "micro"],
  antiCollapse: AntiCollapseMode = "human_friendly",
): RhythmPattern {
  const { totalBeats, groups, tempoScale, polyLayers } = sig;
  const effectiveBpm = bpm * tempoScale;
  let events: RhythmEvent[];

  if (polyLayers && polyLayers.length > 0) {
    // Generate events for each independent layer
    events = [];
    for (let li = 0; li < polyLayers.length; li++) {
      const layer = polyLayers[li];
      const layerEvents = generateGroupEvents(layer.groups, layer.totalBeats, layers, li);
      events.push(...layerEvents);
    }
  } else {
    events = generateGroupEvents(groups, totalBeats, layers);
  }

  // Reference pulse is now handled independently:
  // - Visual ref grid: ReferenceCircle component (no audio events)
  // - Audible ref pulse: rhythmAudio.startReference() (independent oscillator)

  // ── Anti-collapse post-processing ──
  if (antiCollapse === "ambiguous") {
    // Mild jitter + randomly suppress accents → harder to find the pulse
    for (const ev of events) {
      ev.beatPos += (Math.random() - 0.5) * 0.04;
      if (ev.accent && Math.random() > 0.5) ev.accent = false;
    }
  } else if (antiCollapse === "non_reducible") {
    // Cumulative irrational drift + zero accents → cannot normalize
    const drift = Math.SQRT2 * 0.02;
    for (let i = 0; i < events.length; i++) {
      events[i].beatPos += drift * i;
      events[i].accent = false;
    }
  }

  // Sort events by position
  events.sort((a, b) => a.beatPos - b.beatPos);

  // Map to a unified metre type
  const metreLabel: import("./rhythmEarData").MetreType = totalBeats === 5
    ? "uneven_2_3"
    : totalBeats === 7
      ? "uneven_unpaired"
      : groups.length > 1 && groups.some(g => g !== groups[0])
        ? "combined"
        : totalBeats <= 4
          ? "duple"
          : "triple";

  return {
    events,
    metre: metreLabel,
    bpm: effectiveBpm,
    macrobeats: totalBeats,
    microPerMacro: groups.length > 0 ? Math.round(totalBeats / groups.length) : 2,
    divsPerMicro: 2,
    grouping: groups.map(g => Math.round(g)),
  };
}

// ── Evolving pattern generation for process/infinite sigs ─────────────

/** Whether this sig evolves across repetitions (infinite playback) */
export function isEvolvingSig(sig: TimeSigDef): boolean {
  // Specific evolving categories
  const evolving: TimeSigCategory[] = [
    "non_terminating", "fractal_time", "limit_process",
    "phase_shift", "subdivision_tree",
  ];
  if (evolving.includes(sig.category)) return true;
  if (sig.id === "alg_rule30_8") return true;
  return false;
}

// ── Helpers for Rule 30 (stateful, so we use a closure) ─────────────
function rule30Step(state: number[]): number[] {
  const n = state.length;
  return state.map((_, j) => {
    const l = state[(j - 1 + n) % n];
    const c = state[j];
    const r = state[(j + 1) % n];
    return (30 >> ((l << 2) | (c << 1) | r)) & 1;
  });
}

function stateToGroups(state: number[]): number[] {
  const groups: number[] = [];
  let run = 1;
  for (let j = 1; j < state.length; j++) {
    if (state[j] === state[j - 1]) run++;
    else { groups.push(run); run = 1; }
  }
  groups.push(run);
  return groups;
}

function fibAt(n: number): number {
  let a = 1, b = 1;
  for (let i = 2; i <= n; i++) { [a, b] = [b, a + b]; }
  return b;
}

/**
 * Generate the nth pattern for a sig. Stateless — given any index i,
 * produces the correct pattern. Supports infinite calling.
 */
export function generateNthPattern(
  sig: TimeSigDef,
  bpm: number,
  i: number,
  layers: BeatLayer[] = ["macro", "micro", "division"],
): RhythmPattern {
  const { id, category } = sig;

  // ── Fibonacci growing: rep i has fib(i+4) beats (starting at 3, 5, 8, 13, 21...)
  //    Groups use recursive Fibonacci splitting: fib(n) = fib(n-2) + fib(n-1),
  //    continuing until groups are ≤ 3 beats. This makes the Fibonacci structure audible.
  if (id === "nt_fibonacci_grow") {
    const fibIdx = i + 4; // start at fib(4)=3 so first reps are already interesting
    const fibLen = fibAt(fibIdx);
    const fibSplit = (n: number): number[] => {
      if (n <= 3) return [n];
      // Find fib(k) = n by climbing the sequence
      let a = 1, b = 1;
      while (b < n) { [a, b] = [b, a + b]; }
      if (b === n) return [...fibSplit(n - a), ...fibSplit(a)]; // split into fib(k-2) + fib(k-1)
      return [n]; // fallback
    };
    const groups = fibSplit(fibLen);
    return generateTimeSigPattern({ ...sig, totalBeats: fibLen, groups, display: `Fib(${fibIdx}) = ${fibLen}` }, bpm, layers);
  }

  // ── Clapping Music: rotate by i positions
  if (id === "ps_clapping_music") {
    const base = [3, 2, 1, 2, 1, 2, 1];
    const rot = i % base.length;
    const rotated = [...base.slice(rot), ...base.slice(0, rot)];
    return generateTimeSigPattern({ ...sig, groups: rotated, display: `Clapping [rot ${i}]` }, bpm, layers);
  }

  // ── Phase drift: beats widen progressively
  if (id === "ps_gradual_12" || id === "ps_micro_drift") {
    const driftedGroups = sig.groups.map((g, gi) => g * (1 + (gi / sig.groups.length) * i * 0.005));
    const total = driftedGroups.reduce((a, b) => a + b, 0);
    return generateTimeSigPattern({ ...sig, groups: driftedGroups, totalBeats: total, display: `${sig.display} [drift ${i}]` }, bpm, layers);
  }

  // ── Cantor: deeper each rep
  if (id === "nt_cantor_9") {
    const depth = Math.min(i + 1, 6);
    const slots = Math.pow(3, depth);
    const cantorSet = new Set<number>();
    for (let s = 0; s < slots; s++) {
      let num = s, ok = true;
      for (let d = 0; d < depth; d++) {
        if (num % 3 === 1) { ok = false; break; }
        num = Math.floor(num / 3);
      }
      if (ok) cantorSet.add(s);
    }
    const groups: number[] = [];
    let runLen = 0, wasOn = cantorSet.has(0);
    for (let s = 0; s < slots; s++) {
      const isOn = cantorSet.has(s);
      if (isOn === wasOn) { runLen++; }
      else { groups.push(runLen); runLen = 1; wasOn = isOn; }
    }
    if (runLen > 0) groups.push(runLen);
    const rawTotal = groups.reduce((a, b) => a + b, 0);
    const scale = 9 / rawTotal;
    return generateTimeSigPattern({ ...sig, groups: groups.map(g => +(g * scale).toFixed(3)), totalBeats: 9, display: `Cantor depth ${depth}` }, bpm, layers);
  }

  // ── √chain: each rep adds another √prime
  if (id === "nt_sqrt_chain") {
    const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
    const n = Math.min(i + 3, primes.length);
    const groups = primes.slice(0, n).map(p => Math.sqrt(p));
    const total = groups.reduce((a, b) => a + b, 0);
    return generateTimeSigPattern({ ...sig, groups, totalBeats: total, display: primes.slice(0, n).map(p => `√${p}`).join("→") }, bpm, layers);
  }

  // ── Non-terminating ratios: more precision each rep
  // Keep as a single group to avoid a tiny fractional group at the end
  // that creates an audible "extra beat" artefact.
  if (id === "nt_pi_sqrt2" || id === "nt_zeta_4" || id === "nt_plastic_ratio" || id === "nt_e_over_pi") {
    const precision = i + 1;
    const truncated = Math.floor(sig.totalBeats * Math.pow(10, precision)) / Math.pow(10, precision);
    return generateTimeSigPattern({ ...sig, groups: [truncated], totalBeats: truncated, display: `${sig.display} ≈ ${truncated.toFixed(precision)}` }, bpm, layers);
  }

  // ── Subdivision trees: deeper each rep
  if (category === "subdivision_tree") {
    const treePrimes = id === "st_prime_tree" ? [2, 3, 5, 7]
      : id === "st_fibonacci_tree" ? [1, 1, 2, 3, 5]
      : id === "st_3_5_tree" ? [3, 5]
      : id === "st_2_3_5_tree" ? [2, 3, 5]
      : id === "st_nonuniform" ? [3, 5, 7]
      : [2, 3];
    let groups = [...sig.groups];
    for (let d = 0; d < i && groups.length < 64; d++) {
      const subdivFactor = treePrimes[d % treePrimes.length];
      const newGroups: number[] = [];
      for (const g of groups) {
        const subSize = g / subdivFactor;
        for (let s = 0; s < subdivFactor; s++) newGroups.push(subSize);
      }
      groups = newGroups;
    }
    const total = groups.reduce((a, b) => a + b, 0);
    return generateTimeSigPattern({ ...sig, groups, totalBeats: total, display: `${sig.display} depth ${i}` }, bpm, layers);
  }

  // ── Rule 30: compute gen i from scratch
  if (id === "alg_rule30_8") {
    let state = [0, 0, 0, 1, 0, 0, 0, 0];
    for (let g = 0; g < i; g++) state = rule30Step(state);
    const groups = stateToGroups(state);
    const total = groups.reduce((a, b) => a + b, 0);
    return generateTimeSigPattern({ ...sig, groups, totalBeats: total, display: `Rule 30 gen ${i}` }, bpm, layers);
  }

  // ── 4/4 + ⅛ shift: increase offset each rep
  if (id === "ps_4_4_8th") {
    const offset = (i + 1) * 0.5; // ⅛ more offset each time
    const groups = [offset, ...sig.groups.slice(1)];
    const total = groups.reduce((a, b) => a + b, 0);
    return generateTimeSigPattern({ ...sig, groups, totalBeats: total, display: `4/4 + ${((i + 1) * 0.5).toFixed(1)} shift` }, bpm, layers);
  }

  // ── 5/8 + offset: increasing shift
  if (id === "ps_5_vs_5_offset") {
    const offset = ((i + 1) % 5) + 1;
    const groups = [offset, 5 - offset];
    return generateTimeSigPattern({ ...sig, groups, totalBeats: 5, display: `5/8 + ${offset} shift` }, bpm, layers);
  }

  // ── Default: static pattern
  return generateTimeSigPattern(sig, bpm, layers);
}

/** Backward compat: generate a fixed-length array of patterns */
export function generateTimeSigSequence(
  sig: TimeSigDef,
  bpm: number,
  count: number,
  layers: BeatLayer[] = ["macro", "micro", "division"],
): RhythmPattern[] {
  return Array.from({ length: count }, (_, i) => generateNthPattern(sig, bpm, i, layers));
}

// ── Exercise generators ──────────────────────────────────────────────

export type MetersExerciseType =
  | "identify_category"
  | "identify_grouping"
  | "count_beats"
  | "compare_sigs"
  | "feel_the_pulse";

export interface MetersExercise {
  type: MetersExerciseType;
  sig: TimeSigDef;
  /** optional second sig for comparison */
  sig2?: TimeSigDef;
  pattern: RhythmPattern;
  pattern2?: RhythmPattern;
  correctAnswer: string;
  options: AnswerOption[];
  optionKey: string;
  label: string;
  explanation: string;
}

/** Identify which category a time signature belongs to */
export function generateIdentifyCategory(
  bpm: number,
  enabledCategories?: TimeSigCategory[],
): MetersExercise {
  const cats = enabledCategories && enabledCategories.length >= 2
    ? enabledCategories
    : (Object.keys(CATEGORY_LABELS) as TimeSigCategory[]);

  const cat = pick(cats);
  const sigsInCat = BUILTIN_SIGS.filter(s => s.category === cat);
  if (sigsInCat.length === 0) return generateIdentifyCategory(bpm, cats.filter(c => c !== cat));

  const sig = pick(sigsInCat);
  const pattern = generateTimeSigPattern(sig, bpm, ["macro", "micro"]);

  const options = cats.map(c => ({ key: c, label: CATEGORY_LABELS[c] }));

  return {
    type: "identify_category",
    sig,
    pattern,
    correctAnswer: cat,
    options,
    optionKey: `weird_ts_cat_${cat}`,
    label: `Category: ${CATEGORY_LABELS[cat]}`,
    explanation: `${sig.display} is a ${CATEGORY_LABELS[cat].toLowerCase()} meter. ${sig.description}`,
  };
}

/** Identify the grouping structure of an additive meter */
export function generateIdentifyGrouping(bpm: number): MetersExercise {
  const additiveSigs = BUILTIN_SIGS.filter(
    s => s.category === "additive" || s.category === "prime",
  );
  const sig = pick(additiveSigs);
  const pattern = generateTimeSigPattern(sig, bpm, ["macro", "micro"]);

  // Generate wrong options
  const correctGrouping = sig.groups.join("+");
  const allGroupings = new Set([correctGrouping]);

  const original = [...sig.groups];
  for (let i = 0; i < 5 && allGroupings.size < 4; i++) {
    const variant = [...original];
    for (let j = variant.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [variant[j], variant[k]] = [variant[k], variant[j]];
    }
    const v = variant.join("+");
    if (v !== correctGrouping) allGroupings.add(v);
  }
  const sameTotalSigs = additiveSigs.filter(
    s => s.totalBeats === sig.totalBeats && s.id !== sig.id,
  );
  for (const alt of sameTotalSigs) {
    if (allGroupings.size >= 4) break;
    allGroupings.add(alt.groups.join("+"));
  }
  while (allGroupings.size < 4) {
    const g = original.map(x => x + pick([-1, 0, 1])).map(x => Math.max(1, x));
    allGroupings.add(g.join("+"));
  }

  const options = [...allGroupings].map(g => ({
    key: g,
    label: `(${g})`,
  }));

  return {
    type: "identify_grouping",
    sig,
    pattern,
    correctAnswer: correctGrouping,
    options,
    optionKey: `weird_ts_grp_${sig.id}`,
    label: `Grouping: ${sig.display}`,
    explanation: `The grouping is (${correctGrouping}). ${sig.description}`,
  };
}

/** Count the total number of beats in a measure */
export function generateCountBeats(bpm: number): MetersExercise {
  const sig = pick(BUILTIN_SIGS.filter(s =>
    s.totalBeats === Math.floor(s.totalBeats) && s.totalBeats >= 3 && s.totalBeats <= 17,
  ));
  const pattern = generateTimeSigPattern(sig, bpm, ["macro", "micro", "division"]);

  const correct = String(Math.round(sig.totalBeats));
  const options: AnswerOption[] = [];
  const values = new Set([sig.totalBeats]);

  for (const delta of [-2, -1, 1, 2, 3]) {
    const v = sig.totalBeats + delta;
    if (v >= 2 && !values.has(v)) values.add(v);
  }

  const sorted = [...values].sort((a, b) => a - b).slice(0, 5);
  for (const v of sorted) {
    options.push({ key: String(Math.round(v)), label: String(Math.round(v)) });
  }

  return {
    type: "count_beats",
    sig,
    pattern,
    correctAnswer: correct,
    options,
    optionKey: `weird_ts_count_${sig.totalBeats}`,
    label: `Count: ${sig.display}`,
    explanation: `${sig.display} has ${correct} beats total. ${sig.description}`,
  };
}

/** Compare two time signatures — which is longer? */
export function generateCompareSigs(bpm: number): MetersExercise {
  const sigs = [...BUILTIN_SIGS].sort(() => Math.random() - 0.5).slice(0, 2);
  const [a, b] = sigs;
  const patA = generateTimeSigPattern(a, bpm, ["macro", "micro"]);
  const patB = generateTimeSigPattern(b, bpm, ["macro", "micro"]);

  const durA = (a.totalBeats * 60) / (bpm * a.tempoScale);
  const durB = (b.totalBeats * 60) / (bpm * b.tempoScale);

  let correctAnswer: string;
  if (Math.abs(durA - durB) < 0.05) correctAnswer = "same";
  else if (durA > durB) correctAnswer = "first";
  else correctAnswer = "second";

  return {
    type: "compare_sigs",
    sig: a,
    sig2: b,
    pattern: patA,
    pattern2: patB,
    correctAnswer,
    options: [
      { key: "first", label: `${a.display} is longer` },
      { key: "second", label: `${b.display} is longer` },
      { key: "same", label: "About the same" },
    ],
    optionKey: `weird_ts_cmp`,
    label: `Compare: ${a.display} vs ${b.display}`,
    explanation: `${a.display} (${durA.toFixed(2)}s) vs ${b.display} (${durB.toFixed(2)}s). ${correctAnswer === "same" ? "Nearly identical duration." : correctAnswer === "first" ? `${a.display} is longer.` : `${b.display} is longer.`}`,
  };
}

/** Listen and feel the downbeat pulse */
export function generateFeelThePulse(bpm: number): MetersExercise {
  const sig = pick(BUILTIN_SIGS.filter(s => s.groups.length >= 2));
  const pattern = generateTimeSigPattern(sig, bpm, ["macro", "micro", "division"]);

  return {
    type: "feel_the_pulse",
    sig,
    pattern,
    correctAnswer: String(sig.groups.length),
    options: [2, 3, 4, 5].map(n => ({
      key: String(n),
      label: `${n} strong beats`,
    })),
    optionKey: `weird_ts_pulse_${sig.groups.length}`,
    label: `Pulse: ${sig.display}`,
    explanation: `${sig.display} has ${sig.groups.length} strong beats (group starts). Groups: (${sig.groups.join("+")}).`,
  };
}

// ── Master generator ─────────────────────────────────────────────────

export function generateMetersExercise(
  type: MetersExerciseType,
  bpm: number,
  enabledCategories?: TimeSigCategory[],
): MetersExercise {
  switch (type) {
    case "identify_category": return generateIdentifyCategory(bpm, enabledCategories);
    case "identify_grouping": return generateIdentifyGrouping(bpm);
    case "count_beats": return generateCountBeats(bpm);
    case "compare_sigs": return generateCompareSigs(bpm);
    case "feel_the_pulse": return generateFeelThePulse(bpm);
  }
}

// ── Custom sig builder helper ────────────────────────────────────────

export function parseGroupingString(s: string): number[] | null {
  const cleaned = s.replace(/[()[\]{}]/g, "").trim();
  const parts = cleaned.split(/[+,\s]+/).map(Number);
  if (parts.some(isNaN) || parts.length === 0) return null;
  if (parts.some(p => p <= 0)) return null;
  return parts;
}

export function buildCustomSig(
  category: TimeSigCategory,
  display: string,
  description: string,
  groups: number[],
  tempoScale: number,
): TimeSigDef {
  const totalBeats = groups.reduce((a, b) => a + b, 0);
  return {
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    category,
    display,
    description,
    totalBeats,
    groups,
    tempoScale,
    isCustom: true,
    tags: ["custom"],
  };
}
