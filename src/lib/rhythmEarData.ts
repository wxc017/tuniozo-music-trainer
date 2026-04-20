// ── Rhythm Ear Training: data structures, pattern generators, syllable tables ──

// ── Types ──────────────────────────────────────────────────────────────

export type MetreType =
  | "duple"
  | "triple"
  | "uneven_2_3"
  | "uneven_3_2"
  | "uneven_unpaired"
  | "combined";

export type BeatLayer = "macro" | "micro" | "division" | "reference";

export type ExerciseType =
  | "same_different"
  | "tempo_compare"
  | "beat_size_compare"
  | "tempo_change"
  | "big_beats_same_size"
  | "little_beats_same_size"
  | "metre_id"
  | "uneven_direction"
  | "combined_metre"
  | "beat_layer_id"
  | "beat_layer_id_duple"
  | "beat_layer_id_triple"
  | "beat_layer_id_uneven"
  | "syllables"
  | "syllables_divisions"
  | "syllables_uneven"
  | "elongations_duple"
  | "elongations_triple"
  | "rests_duple"
  | "rests_triple"
  | "elongations_rests"
  | "uneven_unpaired_acculturation"
  | "beat_layer_id_uneven_unpaired";

export interface RhythmEvent {
  /** Position in macrobeats (fractional) */
  beatPos: number;
  layer: BeatLayer;
  accent: boolean;
  syllable?: string;
  isRest?: boolean;
  isTie?: boolean;
  /** True for the first beat of each group (used for click differentiation) */
  isGroupStart?: boolean;
  /** For polymeter: which layer (0-based) this event belongs to */
  polyLayerIdx?: number;
}

export interface RhythmPattern {
  events: RhythmEvent[];
  metre: MetreType;
  bpm: number;
  macrobeats: number;
  microPerMacro: number; // 2 = duple, 3 = triple
  divsPerMicro: number;  // subdivisions within each microbeat
  /** For uneven metres: microbeat counts per macrobeat group, e.g. [2,3] or [3,2,2] */
  grouping?: number[];
  /** For tempo-change exercises */
  bpmEnd?: number;
}

export interface AnswerOption {
  key: string;
  label: string;
}

export interface RhythmExercise {
  type: ExerciseType;
  patterns: RhythmPattern[];       // 1 for identification, 2 for comparison
  correctAnswer: string;
  options: AnswerOption[];
  optionKey: string;               // for stats
  label: string;                   // display label for stats
}

// ── Gordon Syllables ──────────────────────────────────────────────────

export const GORDON_SYLLABLES: Record<string, string[]> = {
  duple_macro:      ["Du"],
  duple_micro:      ["Du", "de"],
  duple_division:   ["Du-ta", "de-ta"],
  triple_macro:     ["Du"],
  triple_micro:     ["Du", "da", "di"],
  triple_division:  ["Du-ta", "da-ta", "di-ta"],
  uneven_2_3_micro: ["Du", "be", "Du", "ba", "bi"],
  uneven_3_2_micro: ["Du", "ba", "bi", "Du", "be"],
  combined_micro_2: ["Du", "de"],
  combined_micro_3: ["Du", "da", "di"],
};

// ── Helpers ───────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function coinFlip(p = 0.5): boolean {
  return Math.random() < p;
}

// ── Pattern Generators ────────────────────────────────────────────────

function metreConfig(metre: MetreType): { microPerMacro: number; macrobeats: number; grouping?: number[] } {
  switch (metre) {
    case "duple":            return { microPerMacro: 2, macrobeats: randInt(4, 8) };
    case "triple":           return { microPerMacro: 3, macrobeats: randInt(4, 6) };
    case "uneven_2_3":       return { microPerMacro: 5, macrobeats: 2, grouping: [2, 3] };
    case "uneven_3_2":       return { microPerMacro: 5, macrobeats: 2, grouping: [3, 2] };
    case "uneven_unpaired":  {
      const g = pick([[2,2,3],[3,2,2]] as number[][]);
      return { microPerMacro: 7, macrobeats: g.length, grouping: g };
    }
    case "combined":         return { microPerMacro: 0, macrobeats: randInt(4, 6) }; // mixed
  }
}

/** Generate events for a given layer across a pattern.
 *  For uneven metres, grouping must be provided so events align with macrobeat boundaries. */
function generateLayerEvents(
  metre: MetreType,
  macrobeats: number,
  microPerMacro: number,
  layer: BeatLayer,
  grouping?: number[],
): RhythmEvent[] {
  const events: RhythmEvent[] = [];

  if (layer === "macro") {
    for (let mb = 0; mb < macrobeats; mb++) {
      events.push({ beatPos: mb, layer: "macro", accent: mb === 0, isGroupStart: true });
    }
    return events;
  }

  // For uneven metres, use grouping-aware generation so that microbeat
  // positions align with macrobeat group boundaries.
  const isUneven = metre === "uneven_2_3" || metre === "uneven_3_2" || metre === "uneven_unpaired";

  if (layer === "micro") {
    if (isUneven && grouping) {
      const total = grouping.reduce((a, b) => a + b, 0);
      let pos = 0;
      for (const grp of grouping) {
        for (let i = 0; i < grp; i++) {
          events.push({ beatPos: (pos + i) / total * macrobeats, layer: "micro", accent: i === 0 });
        }
        pos += grp;
      }
    } else if (metre === "combined") {
      for (let mb = 0; mb < macrobeats; mb++) {
        const micro = coinFlip() ? 2 : 3;
        for (let i = 0; i < micro; i++) {
          events.push({ beatPos: mb + i / micro, layer: "micro", accent: i === 0 });
        }
      }
    } else {
      for (let mb = 0; mb < macrobeats; mb++) {
        for (let i = 0; i < microPerMacro; i++) {
          events.push({
            beatPos: mb + i / microPerMacro,
            layer: "micro",
            accent: i === 0,
          });
        }
      }
    }
    return events;
  }

  // Division layer
  const divsPerMicro = 2;
  if (metre === "combined") {
    for (let mb = 0; mb < macrobeats; mb++) {
      const micro = coinFlip() ? 2 : 3;
      for (let mi = 0; mi < micro; mi++) {
        for (let d = 0; d < divsPerMicro; d++) {
          events.push({
            beatPos: mb + (mi + d / divsPerMicro) / micro,
            layer: "division",
            accent: d === 0 && mi === 0,
          });
        }
      }
    }
  } else if (isUneven && grouping) {
    const total = grouping.reduce((a, b) => a + b, 0);
    let pos = 0;
    for (let gi = 0; gi < grouping.length; gi++) {
      const grp = grouping[gi];
      for (let i = 0; i < grp; i++) {
        for (let d = 0; d < divsPerMicro; d++) {
          events.push({
            beatPos: (pos + i + d / divsPerMicro) / total * macrobeats,
            layer: "division",
            accent: d === 0 && i === 0,
          });
        }
      }
      pos += grp;
    }
  } else {
    for (let mb = 0; mb < macrobeats; mb++) {
      for (let mi = 0; mi < microPerMacro; mi++) {
        for (let d = 0; d < divsPerMicro; d++) {
          events.push({
            beatPos: mb + (mi * divsPerMicro + d) / (microPerMacro * divsPerMicro),
            layer: "division",
            accent: d === 0 && mi === 0,
          });
        }
      }
    }
  }
  return events;
}

/** Build a rhythm pattern with specific layers active */
function buildPattern(
  metre: MetreType,
  bpm: number,
  layers: BeatLayer[],
  opts?: { bpmEnd?: number },
): RhythmPattern {
  const { microPerMacro, macrobeats, grouping } = metreConfig(metre);
  const events: RhythmEvent[] = [];
  for (const layer of layers) {
    events.push(...generateLayerEvents(metre, macrobeats, microPerMacro, layer, grouping));
  }
  events.sort((a, b) => a.beatPos - b.beatPos);

  return {
    events,
    metre,
    bpm,
    macrobeats,
    microPerMacro,
    divsPerMicro: 2,
    grouping,
    bpmEnd: opts?.bpmEnd,
  };
}

/** Build a pattern that randomly selects which layer elements to play */
function buildMixedPattern(
  metre: MetreType,
  bpm: number,
  includeLayers: BeatLayer[],
): RhythmPattern {
  const { microPerMacro, macrobeats, grouping } = metreConfig(metre);
  const allEvents: RhythmEvent[] = [];

  for (const layer of includeLayers) {
    const layerEvents = generateLayerEvents(metre, macrobeats, microPerMacro, layer, grouping);
    for (const ev of layerEvents) {
      if (layer === "macro" || coinFlip(0.7)) {
        allEvents.push(ev);
      }
    }
  }
  allEvents.sort((a, b) => a.beatPos - b.beatPos);

  return {
    events: allEvents,
    metre,
    bpm,
    macrobeats,
    microPerMacro,
    divsPerMicro: 2,
    grouping,
  };
}

// ── Exercise Generators ───────────────────────────────────────────────

const METRES_BASIC: MetreType[] = ["duple", "triple"];

// ── 1.2 Same or Different? ──

export function generateSameDifferent(bpm: number): RhythmExercise {
  const metre = pick(METRES_BASIC);
  const isSame = coinFlip(0.4);
  const layers: BeatLayer[] = coinFlip() ? ["macro", "micro"] : ["macro", "micro", "division"];

  const p1 = buildMixedPattern(metre, bpm, layers);
  const p2 = isSame ? { ...p1 } : buildMixedPattern(metre, bpm, layers);

  return {
    type: "same_different",
    patterns: [p1, p2],
    correctAnswer: isSame ? "same" : "different",
    options: [
      { key: "same", label: "Same" },
      { key: "different", label: "Different" },
    ],
    optionKey: `rhy:same_diff:${isSame ? "same" : "diff"}`,
    label: "Rhythm: Same or Different?",
  };
}

// ── 1.2 Slower or Faster? ──

export function generateTempoCompare(bpm: number): RhythmExercise {
  const metre = pick(METRES_BASIC);
  const layers: BeatLayer[] = ["macro", "micro"];
  const isFaster = coinFlip();
  const delta = randInt(15, 40);

  const bpm1 = bpm;
  const bpm2 = isFaster ? bpm + delta : bpm - delta;

  const p1 = buildPattern(metre, bpm1, layers);
  const p2 = buildPattern(metre, Math.max(40, bpm2), layers);

  return {
    type: "tempo_compare",
    patterns: [p1, p2],
    correctAnswer: isFaster ? "faster" : "slower",
    options: [
      { key: "slower", label: "Slower" },
      { key: "faster", label: "Faster" },
    ],
    optionKey: `rhy:tempo:${isFaster ? "faster" : "slower"}`,
    label: "Rhythm: Tempo Comparison",
  };
}

// ── 1.2 Smaller or Bigger beats? ──

export function generateBeatSizeCompare(bpm: number): RhythmExercise {
  const metre = pick(METRES_BASIC);
  const isSmaller = coinFlip();

  const layers1: BeatLayer[] = ["macro", "micro"];
  const layers2: BeatLayer[] = isSmaller
    ? ["macro", "micro", "division"]
    : ["macro"];

  const p1 = buildPattern(metre, bpm, layers1);
  const p2 = buildPattern(metre, bpm, layers2);

  return {
    type: "beat_size_compare",
    patterns: [p1, p2],
    correctAnswer: isSmaller ? "smaller" : "bigger",
    options: [
      { key: "smaller", label: "Smaller" },
      { key: "bigger", label: "Bigger" },
    ],
    optionKey: `rhy:beatsize:${isSmaller ? "smaller" : "bigger"}`,
    label: "Rhythm: Beat Size",
  };
}

// ── 1.2 Are all big beats the same size? ──

export function generateBigBeatsSameSize(bpm: number): RhythmExercise {
  const isRegular = coinFlip();
  // Regular = duple or triple (all macrobeats same size)
  // Irregular = uneven (macrobeats differ)
  const metre: MetreType = isRegular ? pick(METRES_BASIC) : pick(["uneven_2_3", "uneven_3_2"] as MetreType[]);
  const layers: BeatLayer[] = ["macro", "micro"];
  const p = buildPattern(metre, bpm, layers);

  return {
    type: "big_beats_same_size",
    patterns: [p],
    correctAnswer: isRegular ? "yes" : "no",
    options: [
      { key: "yes", label: "Yes" },
      { key: "no", label: "No" },
    ],
    optionKey: `rhy:big_same:${isRegular ? "yes" : "no"}`,
    label: "Rhythm: Big Beats Same Size?",
  };
}

// ── 1.2 Are all little beats the same size? ──

export function generateLittleBeatsSameSize(bpm: number): RhythmExercise {
  const isRegular = coinFlip();
  // Regular = duple or triple (all microbeats same size)
  // Irregular = combined (microbeats differ — some Du de, some Du da di)
  const metre: MetreType = isRegular ? pick(METRES_BASIC) : "combined";
  const layers: BeatLayer[] = ["macro", "micro"];
  const p = buildPattern(metre, bpm, layers);

  return {
    type: "little_beats_same_size",
    patterns: [p],
    correctAnswer: isRegular ? "yes" : "no",
    options: [
      { key: "yes", label: "Yes" },
      { key: "no", label: "No" },
    ],
    optionKey: `rhy:little_same:${isRegular ? "yes" : "no"}`,
    label: "Rhythm: Little Beats Same Size?",
  };
}

// ── 1.2 Tempo change ──

export function generateTempoChange(bpm: number): RhythmExercise {
  const metre = pick(METRES_BASIC);
  const layers: BeatLayer[] = ["macro", "micro"];
  const r = Math.random();
  let type: "accel" | "decel" | "steady";
  if (r < 0.33) type = "accel";
  else if (r < 0.66) type = "decel";
  else type = "steady";

  const delta = randInt(20, 50);
  let bpmEnd = bpm;
  if (type === "accel") bpmEnd = bpm + delta;
  if (type === "decel") bpmEnd = Math.max(40, bpm - delta);

  const p = buildPattern(metre, bpm, layers, { bpmEnd });

  return {
    type: "tempo_change",
    patterns: [p],
    correctAnswer: type === "accel" ? "speeds_up" : type === "decel" ? "slows_down" : "stays_same",
    options: [
      { key: "slows_down", label: "Slows down" },
      { key: "speeds_up", label: "Speeds up" },
      { key: "stays_same", label: "Stays the same" },
    ],
    optionKey: `rhy:tempo_change:${type}`,
    label: "Rhythm: Tempo Change",
  };
}

// ── 2.5 / 3.5 Metre identification ──

export function generateMetreId(
  bpm: number,
  includeUneven: boolean,
  includeCombined: boolean,
  includeUnevenUnpaired: boolean,
): RhythmExercise {
  const pool: MetreType[] = [...METRES_BASIC];
  if (includeUneven) pool.push("uneven_2_3", "uneven_3_2");
  if (includeCombined) pool.push("combined");
  if (includeUnevenUnpaired) pool.push("uneven_unpaired");

  const metre = pick(pool);
  const layers: BeatLayer[] = ["macro", "micro"];
  const p = buildMixedPattern(metre, bpm, layers);

  const options: AnswerOption[] = [
    { key: "duple", label: "Duple (Du de)" },
    { key: "triple", label: "Triple (Du da di)" },
  ];
  if (includeUneven) {
    options.push({ key: "uneven_2_3", label: "5 (2+3)" });
    options.push({ key: "uneven_3_2", label: "5 (3+2)" });
  }
  if (includeCombined) {
    options.push({ key: "combined", label: "Combined" });
  }
  if (includeUnevenUnpaired) {
    options.push({ key: "uneven_unpaired", label: "7 (Uneven Unpaired)" });
  }

  return {
    type: "metre_id",
    patterns: [p],
    correctAnswer: metre,
    options,
    optionKey: `rhy:metre:${metre}`,
    label: `Rhythm: Metre ID (${metre})`,
  };
}

// ── 3.4 Uneven direction (2+3 vs 3+2) ──

export function generateUnevenDirection(bpm: number): RhythmExercise {
  const is23 = coinFlip();
  const metre: MetreType = is23 ? "uneven_2_3" : "uneven_3_2";
  const layers: BeatLayer[] = ["macro", "micro"];
  const p = buildPattern(metre, bpm, layers);

  return {
    type: "uneven_direction",
    patterns: [p],
    correctAnswer: is23 ? "short_long" : "long_short",
    options: [
      { key: "short_long", label: "2+3 (Short-Long)" },
      { key: "long_short", label: "3+2 (Long-Short)" },
    ],
    optionKey: `rhy:uneven:${is23 ? "2_3" : "3_2"}`,
    label: "Rhythm: Uneven Direction",
  };
}

// ── 2.2 / 2.4 / 3.1 / 3.2 Beat layer identification (scoped by metre) ──

export function generateBeatLayerId(bpm: number, metreScope?: MetreType): RhythmExercise {
  const metre = metreScope ?? pick(METRES_BASIC);
  const r = Math.random();
  let layers: BeatLayer[];
  let answer: string;

  if (r < 0.3) {
    layers = ["macro"];
    answer = "macrobeats";
  } else if (r < 0.55) {
    layers = ["macro", "micro"];
    answer = "microbeats";
  } else if (r < 0.8) {
    layers = ["macro", "micro", "division"];
    answer = "divisions";
  } else {
    // Mixed: macro + some micro + some division
    layers = ["macro", "micro", "division"];
    answer = "both";
  }

  const p = buildMixedPattern(metre, bpm, layers);

  const metreLabel = metre === "duple" ? "Duple" : metre === "triple" ? "Triple"
    : metre === "uneven_2_3" || metre === "uneven_3_2" ? "5 (Uneven Paired)"
    : metre === "uneven_unpaired" ? "7 (Uneven Unpaired)" : "Combined";

  return {
    type: metreScope ? (`beat_layer_id_${metreScope === "duple" ? "duple" : metreScope === "triple" ? "triple" : "uneven"}` as ExerciseType) : "beat_layer_id",
    patterns: [p],
    correctAnswer: answer,
    options: [
      { key: "macrobeats", label: "Macrobeats" },
      { key: "microbeats", label: "Microbeats" },
      { key: "divisions", label: "Divisions" },
      { key: "both", label: "Both" },
    ],
    optionKey: `rhy:layer:${metre}:${answer}`,
    label: `Rhythm: Beat Layer in ${metreLabel} (${answer})`,
  };
}

// ── 2.1 / 2.3 / 3.3 / 3.6 Acculturation: are beats always same size? ──

export function generateBeatConsistency(bpm: number, beatType: "macro" | "micro"): RhythmExercise {
  const isRegular = coinFlip();

  let metre: MetreType;
  if (beatType === "macro") {
    // Regular = duple/triple (equal macrobeats), irregular = uneven (unequal macrobeats)
    metre = isRegular ? pick(METRES_BASIC) : pick(["uneven_2_3", "uneven_3_2"] as MetreType[]);
  } else {
    // Regular = duple/triple (equal microbeats), irregular = combined (mixed micro sizes)
    metre = isRegular ? pick(METRES_BASIC) : "combined";
  }

  const layers: BeatLayer[] = ["macro", "micro"];
  const p = buildPattern(metre, bpm, layers);

  const question = beatType === "macro"
    ? "Are the big beats (macrobeats) always the same size?"
    : "Are the little beats (microbeats) always the same size?";

  return {
    type: beatType === "macro" ? "big_beats_same_size" : "little_beats_same_size",
    patterns: [p],
    correctAnswer: isRegular ? "always_same" : "sometimes_different",
    options: [
      { key: "always_same", label: "Always the same size" },
      { key: "sometimes_different", label: "Sometimes different sizes" },
    ],
    optionKey: `rhy:consistency:${beatType}:${isRegular ? "same" : "diff"}`,
    label: `Rhythm: ${question}`,
  };
}

// ── 2.2 / 2.4 Syllable identification ──

export function generateSyllables(bpm: number, metreScope?: MetreType): RhythmExercise {
  const metre = metreScope ?? pick(METRES_BASIC);
  const { microPerMacro, macrobeats, grouping } = metreConfig(metre);

  const events = generateLayerEvents(metre, macrobeats, microPerMacro, "micro", grouping);

  // Assign Gordon syllables
  const syllableKey = `${metre}_micro`;
  const syllables = GORDON_SYLLABLES[syllableKey] ?? ["Du"];
  events.forEach((ev, i) => {
    ev.syllable = syllables[i % syllables.length];
  });

  const p: RhythmPattern = {
    events,
    metre,
    bpm,
    macrobeats,
    microPerMacro,
    divsPerMicro: 2,
  };

  // Build answer options based on what's possible
  const options: AnswerOption[] = [
    { key: "du_de", label: "Du de (Duple)" },
    { key: "du_da_di", label: "Du da di (Triple)" },
  ];
  if (metreScope === "uneven_2_3" || metreScope === "uneven_3_2" || !metreScope) {
    // If uneven is in scope, add uneven options
  }

  let answer: string;
  if (metre === "duple") answer = "du_de";
  else if (metre === "triple") answer = "du_da_di";
  else answer = "du_de"; // fallback

  return {
    type: "syllables",
    patterns: [p],
    correctAnswer: answer,
    options,
    optionKey: `rhy:syl:${answer}`,
    label: `Rhythm: Syllables (${answer})`,
  };
}

// ── 3.1 / 3.2 Division syllable exercises ──

export function generateDivisionSyllables(bpm: number, metreScope?: MetreType): RhythmExercise {
  const metre = metreScope ?? pick(METRES_BASIC);
  const { microPerMacro, macrobeats, grouping } = metreConfig(metre);

  // Include divisions
  const microEvents = generateLayerEvents(metre, macrobeats, microPerMacro, "micro", grouping);
  const divEvents = generateLayerEvents(metre, macrobeats, microPerMacro, "division", grouping);

  // Randomly include only micro, only div, or both
  const r = Math.random();
  let answer: string;
  let events: RhythmEvent[];
  if (r < 0.33) {
    events = microEvents;
    answer = "microbeats";
  } else if (r < 0.66) {
    events = divEvents;
    answer = "divisions";
  } else {
    events = [...microEvents, ...divEvents];
    answer = "both";
  }
  events.sort((a, b) => a.beatPos - b.beatPos);

  const p: RhythmPattern = {
    events,
    metre,
    bpm,
    macrobeats,
    microPerMacro,
    divsPerMicro: 2,
  };

  const metreLabel = metre === "duple" ? "Duple" : "Triple";

  return {
    type: "syllables_divisions",
    patterns: [p],
    correctAnswer: answer,
    options: [
      { key: "microbeats", label: "Microbeats" },
      { key: "divisions", label: "Divisions" },
      { key: "both", label: "Both" },
    ],
    optionKey: `rhy:div_syl:${metre}:${answer}`,
    label: `Rhythm: ${metreLabel} Divisions (${answer})`,
  };
}

// ── 3.4 Uneven syllable exercises ──

export function generateUnevenSyllables(bpm: number): RhythmExercise {
  const metre = pick(["uneven_2_3", "uneven_3_2"] as MetreType[]);
  const { microPerMacro, macrobeats, grouping } = metreConfig(metre);

  const events = generateLayerEvents(metre, macrobeats, microPerMacro, "micro", grouping);
  const syllableKey = `${metre}_micro`;
  const syllables = GORDON_SYLLABLES[syllableKey] ?? ["Du"];
  events.forEach((ev, i) => {
    ev.syllable = syllables[i % syllables.length];
  });

  // Ask: macrobeats, microbeats, or both?
  const r = Math.random();
  let answer: string;
  let playEvents: RhythmEvent[];
  if (r < 0.33) {
    playEvents = generateLayerEvents(metre, macrobeats, microPerMacro, "macro", grouping);
    answer = "macrobeats";
  } else if (r < 0.66) {
    playEvents = events;
    answer = "microbeats";
  } else {
    playEvents = [
      ...generateLayerEvents(metre, macrobeats, microPerMacro, "macro", grouping),
      ...events,
    ];
    answer = "both";
  }
  playEvents.sort((a, b) => a.beatPos - b.beatPos);

  const p: RhythmPattern = {
    events: playEvents,
    metre,
    bpm,
    macrobeats,
    microPerMacro,
    divsPerMicro: 2,
    grouping,
  };

  return {
    type: "syllables_uneven",
    patterns: [p],
    correctAnswer: answer,
    options: [
      { key: "macrobeats", label: "Macrobeats" },
      { key: "microbeats", label: "Microbeats" },
      { key: "both", label: "Both" },
    ],
    optionKey: `rhy:uneven_syl:${answer}`,
    label: `Rhythm: Uneven Syllables (${answer})`,
  };
}

// ── 4.1 / 4.2 Elongations (scoped by metre) ──
// Gordon's definition: an elongation is a note extended over the next
// microbeat or macrobeat boundary. The exercise asks whether the pattern
// contains any elongations, NOT how many.

export function generateElongations(bpm: number, metre: MetreType): RhythmExercise {
  const { microPerMacro, macrobeats, grouping } = metreConfig(metre);

  // Build a full pattern with macro + micro + division layers
  const macroEvents = generateLayerEvents(metre, macrobeats, microPerMacro, "macro", grouping);
  const microEvents = generateLayerEvents(metre, macrobeats, microPerMacro, "micro", grouping);
  const divEvents = generateLayerEvents(metre, macrobeats, microPerMacro, "division", grouping);

  const hasElongation = coinFlip(0.6);
  const events = [...macroEvents, ...microEvents, ...divEvents];
  events.sort((a, b) => a.beatPos - b.beatPos);

  if (hasElongation) {
    // Mark 1-2 division or micro events as ties (elongated over next boundary)
    const candidates = events.filter((e, i) =>
      (e.layer === "division" || e.layer === "micro") && i > 0 && i < events.length - 1
    );
    const count = randInt(1, Math.min(2, candidates.length));
    const chosen = new Set<number>();
    while (chosen.size < count && chosen.size < candidates.length) {
      chosen.add(randInt(0, candidates.length - 1));
    }
    for (const ci of chosen) {
      candidates[ci].isTie = true;
    }
  }

  const answer = hasElongation ? "elongation" : "regular";
  const metreLabel = metre === "duple" ? "Duple" : "Triple";

  return {
    type: metre === "duple" ? "elongations_duple" : "elongations_triple",
    patterns: [{ events, metre, bpm, macrobeats, microPerMacro, divsPerMicro: 2, grouping }],
    correctAnswer: answer,
    options: [
      { key: "regular", label: "Regular pattern" },
      { key: "elongation", label: "Contains elongation(s)" },
    ],
    optionKey: `rhy:elong:${metre}:${answer}`,
    label: `Rhythm: Elongations in ${metreLabel}`,
  };
}

// ── 4.3 / 4.4 Rests (scoped by metre) ──
// Gordon's definition: a rest replaces one or more notes with silence
// in an otherwise regular pattern. The exercise asks whether the pattern
// contains any rests, NOT how many.

export function generateRests(bpm: number, metre: MetreType): RhythmExercise {
  const { microPerMacro, macrobeats, grouping } = metreConfig(metre);

  const macroEvents = generateLayerEvents(metre, macrobeats, microPerMacro, "macro", grouping);
  const microEvents = generateLayerEvents(metre, macrobeats, microPerMacro, "micro", grouping);
  const divEvents = generateLayerEvents(metre, macrobeats, microPerMacro, "division", grouping);

  const hasRest = coinFlip(0.6);
  const events = [...macroEvents, ...microEvents, ...divEvents];
  events.sort((a, b) => a.beatPos - b.beatPos);

  if (hasRest) {
    // Mark 1-2 micro or division events as rests (silent)
    const candidates = events.filter(e =>
      (e.layer === "division" || e.layer === "micro") && !e.accent
    );
    const count = randInt(1, Math.min(2, candidates.length));
    const chosen = new Set<number>();
    while (chosen.size < count && chosen.size < candidates.length) {
      chosen.add(randInt(0, candidates.length - 1));
    }
    for (const ci of chosen) {
      candidates[ci].isRest = true;
    }
  }

  const answer = hasRest ? "rest" : "regular";
  const metreLabel = metre === "duple" ? "Duple" : "Triple";

  return {
    type: metre === "duple" ? "rests_duple" : "rests_triple",
    patterns: [{ events, metre, bpm, macrobeats, microPerMacro, divsPerMicro: 2, grouping }],
    correctAnswer: answer,
    options: [
      { key: "regular", label: "Regular pattern" },
      { key: "rest", label: "Contains rest(s)" },
    ],
    optionKey: `rhy:rest:${metre}:${answer}`,
    label: `Rhythm: Rests in ${metreLabel}`,
  };
}

// ── Generic elongations & rests (mixed) ──
// Asks whether the pattern is regular, has elongation(s), rest(s), or both.

export function generateElongationsRests(bpm: number): RhythmExercise {
  const metre = pick(METRES_BASIC);
  const { microPerMacro, macrobeats, grouping } = metreConfig(metre);

  const macroEvents = generateLayerEvents(metre, macrobeats, microPerMacro, "macro", grouping);
  const microEvents = generateLayerEvents(metre, macrobeats, microPerMacro, "micro", grouping);
  const divEvents = generateLayerEvents(metre, macrobeats, microPerMacro, "division", grouping);
  const events = [...macroEvents, ...microEvents, ...divEvents];
  events.sort((a, b) => a.beatPos - b.beatPos);

  // Decide what modifications to make
  const r = Math.random();
  let hasRest = false;
  let hasTie = false;
  if (r < 0.25) {
    // Regular — no modifications
  } else if (r < 0.5) {
    hasTie = true;
  } else if (r < 0.75) {
    hasRest = true;
  } else {
    hasTie = true;
    hasRest = true;
  }

  const divMicroEvents = events.filter(e => e.layer === "division" || e.layer === "micro");
  const nonAccent = divMicroEvents.filter(e => !e.accent);

  if (hasRest && nonAccent.length > 0) {
    const idx = randInt(0, nonAccent.length - 1);
    nonAccent[idx].isRest = true;
  }
  if (hasTie && divMicroEvents.length > 2) {
    const candidates = divMicroEvents.filter(e => !e.isRest);
    if (candidates.length > 0) {
      const idx = randInt(0, candidates.length - 1);
      candidates[idx].isTie = true;
    }
  }

  const answer = hasTie && hasRest ? "both"
    : hasTie ? "elongations"
    : hasRest ? "rests"
    : "regular";

  return {
    type: "elongations_rests",
    patterns: [{ events, metre, bpm, macrobeats, microPerMacro, divsPerMicro: 2, grouping }],
    correctAnswer: answer,
    options: [
      { key: "regular", label: "Regular (no modifications)" },
      { key: "elongations", label: "Elongation(s)" },
      { key: "rests", label: "Rest(s)" },
      { key: "both", label: "Both elongation(s) & rest(s)" },
    ],
    optionKey: `rhy:elong_rest:${answer}`,
    label: `Rhythm: Elongations & Rests`,
  };
}

// ── 4.5 Uneven Unpaired Acculturation ──

export function generateUnevenUnpairedAcculturation(bpm: number): RhythmExercise {
  const { microPerMacro, macrobeats, grouping } = metreConfig("uneven_unpaired");
  const chosen = grouping!;
  const total = chosen.reduce((a, b) => a + b, 0);

  // Build micro events using the chosen grouping
  const events: RhythmEvent[] = [];
  let pos = 0;
  for (const grp of chosen) {
    for (let i = 0; i < grp; i++) {
      events.push({
        beatPos: (pos + i) / total * macrobeats,
        layer: "micro",
        accent: i === 0,
      });
    }
    pos += grp;
  }

  const p: RhythmPattern = {
    events,
    metre: "uneven_unpaired",
    bpm,
    macrobeats,
    microPerMacro,
    divsPerMicro: 2,
    grouping: chosen,
  };

  const answer = chosen.join("+");

  return {
    type: "uneven_unpaired_acculturation",
    patterns: [p],
    correctAnswer: answer,
    options: [
      { key: "2+2+3", label: "2+2+3" },
      { key: "3+2+2", label: "3+2+2" },
    ],
    optionKey: `rhy:uneven_unp_acc:${answer}`,
    label: `Rhythm: 7 (Uneven Unpaired) Acculturation (${answer})`,
  };
}

// ── 4.6 Beat Layers in Uneven Unpaired ──

export function generateBeatLayerIdUnevenUnpaired(bpm: number): RhythmExercise {
  return generateBeatLayerId(bpm, "uneven_unpaired");
}

// ── Master generator ─────────────────────────────────────────────────

export function generateExercise(
  type: ExerciseType,
  bpm: number,
  includeUneven: boolean,
  includeCombined: boolean,
  includeUnevenUnpaired: boolean,
): RhythmExercise {
  switch (type) {
    case "same_different":        return generateSameDifferent(bpm);
    case "tempo_compare":         return generateTempoCompare(bpm);
    case "beat_size_compare":     return generateBeatSizeCompare(bpm);
    case "tempo_change":          return generateTempoChange(bpm);
    case "big_beats_same_size":   return generateBigBeatsSameSize(bpm);
    case "little_beats_same_size":return generateLittleBeatsSameSize(bpm);
    case "metre_id":              return generateMetreId(bpm, includeUneven, includeCombined, includeUnevenUnpaired);
    case "uneven_direction":      return generateUnevenDirection(bpm);
    case "combined_metre":        return generateMetreId(bpm, false, true, false);
    case "beat_layer_id":         return generateBeatLayerId(bpm);
    case "beat_layer_id_duple":   return generateBeatLayerId(bpm, "duple");
    case "beat_layer_id_triple":  return generateBeatLayerId(bpm, "triple");
    case "beat_layer_id_uneven":  return generateBeatLayerId(bpm, pick(["uneven_2_3", "uneven_3_2"] as MetreType[]));
    case "syllables":             return generateSyllables(bpm);
    case "syllables_divisions":   return generateDivisionSyllables(bpm);
    case "syllables_uneven":      return generateUnevenSyllables(bpm);
    case "elongations_duple":     return generateElongations(bpm, "duple");
    case "elongations_triple":    return generateElongations(bpm, "triple");
    case "rests_duple":           return generateRests(bpm, "duple");
    case "rests_triple":          return generateRests(bpm, "triple");
    case "elongations_rests":     return generateElongationsRests(bpm);
    case "uneven_unpaired_acculturation": return generateUnevenUnpairedAcculturation(bpm);
    case "beat_layer_id_uneven_unpaired": return generateBeatLayerIdUnevenUnpaired(bpm);
  }
}
