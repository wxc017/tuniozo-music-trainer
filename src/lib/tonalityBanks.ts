// ── Tonality-scoped chord banks for functional ear training ───────────
// Each tonality defines chords grouped by pedagogical level:
//   Primary → Diatonic → Secondary Dominants → Borrowings → Tritone Subs
//
// Chord entries are label-only references — actual shapes come from
// getBaseChords(edo) or are built dynamically from getChordShapes(edo).

import { getChordShapes } from "./edoData";

// ── Types ─────────────────────────────────────────────────────────────

export interface ChordEntry {
  /** Roman numeral label */
  label: string;
  /** Steps above tonic (relative), or null → look up from base chord map */
  steps: number[] | null;
}

export interface TonalityLevel {
  name: string;
  chords: ChordEntry[];
}

export interface TonalityBank {
  name: string;
  levels: TonalityLevel[];
}

// Helper: wrap a label with null steps (looked up from base chord map)
const ref = (label: string): ChordEntry => ({ label, steps: null });

// Helper: build chord with explicit steps
const chord = (label: string, steps: number[]): ChordEntry => ({ label, steps });

// ── Approach-chord builders (per target) ──────────────────────────────
// Used by ChordsTab to toggle secondary-dominant / secondary-diminished /
// ii-V / tritone-sub approaches on a per-target basis.

export type ApproachKind = "secdom" | "secdim" | "iiV" | "TT";

export const APPROACH_KINDS: ApproachKind[] = ["secdom", "secdim", "iiV", "TT"];

export const APPROACH_LABELS: Record<ApproachKind, string> = {
  secdom: "V/",
  secdim: "vii°/",
  iiV: "ii-V",
  TT: "TT",
};

/**
 * Build the approach chord(s) leading to `targetLabel` for a given approach
 * kind. Returns [] if the target shape is unusable. ii-V flavor (minor vs
 * half-dim ii) follows the target's 3rd quality.
 */
export function getApproachChords(
  targetLabel: string,
  targetSteps: number[] | null,
  kind: ApproachKind,
  edo: number,
): ChordEntry[] {
  if (!targetSteps || targetSteps.length < 2) return [];
  const sh = getChordShapes(edo);
  const { MAJ, MIN, DIM, M2, M3, P5, d5, M7 } = sh;
  const maj = (r: number) => MAJ.map(s => s + r);
  const min = (r: number) => MIN.map(s => s + r);
  const dim = (r: number) => DIM.map(s => s + r);
  const r = targetSteps[0];
  const isMajorTarget = (targetSteps[1] - r) === M3;
  switch (kind) {
    case "secdom":
      return [chord(`V/${targetLabel}`, maj(r + P5))];
    case "secdim":
      // vii°/X — diminished triad a half-step below the target (or +M7)
      return [chord(`vii°/${targetLabel}`, dim(r + M7))];
    case "iiV":
      return isMajorTarget
        ? [chord(`ii/${targetLabel}`, min(r + M2)), chord(`V/${targetLabel}`, maj(r + P5))]
        : [chord(`iiø/${targetLabel}`, dim(r + M2)), chord(`V/${targetLabel}`, maj(r + P5))];
    case "TT":
      return [chord(`TT/${targetLabel}`, maj(r + P5 + d5))];
  }
}

// ── Build banks for a given EDO ───────────────────────────────────────

export function getTonalityBanks(edo: number): TonalityBank[] {
  const sh = getChordShapes(edo);
  const { MAJ, MIN, DIM, AUG, P5, M2, m3, M3, P4, d5, m6, M6, m7, M7, A1 } = sh;

  const maj = (root: number) => MAJ.map(s => s + root);
  const min = (root: number) => MIN.map(s => s + root);
  const dim = (root: number) => DIM.map(s => s + root);
  const aug = (root: number) => AUG.map(s => s + root);

  // Secondary dominant: V of target root
  const secV = (targetLabel: string, targetRoot: number): ChordEntry =>
    chord(`V/${targetLabel}`, maj(targetRoot + P5));
  // Secondary ii-V (major target)
  const secIIV = (targetLabel: string, targetRoot: number): ChordEntry[] => [
    chord(`ii/${targetLabel}`, min(targetRoot + M2)),
    chord(`V/${targetLabel}`, maj(targetRoot + P5)),
  ];
  // Secondary ii-V (minor target)
  const secIIoV = (targetLabel: string, targetRoot: number): ChordEntry[] => [
    chord(`iiø/${targetLabel}`, dim(targetRoot + M2)),
    chord(`V/${targetLabel}`, maj(targetRoot + P5)),
  ];
  // Tritone sub
  const ttSub = (targetLabel: string, targetRoot: number): ChordEntry =>
    chord(`TT/${targetLabel}`, maj(targetRoot + P5 + d5));

  // ── Auto-build a mode bank from scale semitones ──
  // Stacks scale-step thirds to produce a triad at every degree, then
  // labels each triad with the right roman-numeral case (case = quality)
  // and accidental prefix (from the scaleDegrees label like "b3" / "#5").
  // Used for the exotic harmonic/melodic-minor modes that were missing
  // from the bank list — keeps them in sync with the Mode-ID taxonomy
  // without having to hand-write 7 more bespoke entries.
  const ROMAN_NUM: Record<string, string> = {
    "1": "I", "2": "II", "3": "III", "4": "IV",
    "5": "V", "6": "VI", "7": "VII",
  };
  const labelTriad = (degLabel: string, kind: "maj" | "min" | "dim" | "aug" | "other"): string => {
    const m = degLabel.match(/^([b#]+)?(\d+)$/);
    const prefix = m?.[1] ?? "";
    const num = m?.[2] ?? degLabel;
    let r = ROMAN_NUM[num] ?? num;
    if (kind === "min" || kind === "dim") r = r.toLowerCase();
    let suffix = "";
    if (kind === "dim") suffix = "°";
    else if (kind === "aug") suffix = "+";
    return prefix + r + suffix;
  };
  const buildModeFromScale = (
    name: string,
    degLabels: string[],
    scaleSemis: number[],
    primaryIdx: number[],
  ): TonalityBank => {
    const triads: { label: string; steps: number[]; idx: number; kind: string }[] = [];
    const aug5 = P5 + A1;
    for (let i = 0; i < scaleSemis.length; i++) {
      const root = scaleSemis[i];
      const third = scaleSemis[(i + 2) % scaleSemis.length] + (i + 2 >= scaleSemis.length ? edo : 0);
      const fifth = scaleSemis[(i + 4) % scaleSemis.length] + (i + 4 >= scaleSemis.length ? edo : 0);
      const t3 = third - root;
      const t5 = fifth - root;
      let kind: "maj" | "min" | "dim" | "aug" | "other" = "other";
      let steps: number[];
      if (t3 === M3 && t5 === P5)        { kind = "maj"; steps = maj(root); }
      else if (t3 === m3 && t5 === P5)   { kind = "min"; steps = min(root); }
      else if (t3 === m3 && t5 === d5)   { kind = "dim"; steps = dim(root); }
      else if (t3 === M3 && t5 === aug5) { kind = "aug"; steps = aug(root); }
      else { steps = [root, third, fifth]; }
      triads.push({ label: labelTriad(degLabels[i], kind), steps, idx: i, kind });
    }
    const primarySet = new Set(primaryIdx);
    const primaryEntries = primaryIdx
      .filter(i => i < triads.length)
      .map(i => chord(triads[i].label, triads[i].steps));
    const diatonicEntries = triads
      .filter(t => !primarySet.has(t.idx))
      .map(t => chord(t.label, t.steps));
    return {
      name,
      levels: [
        { name: "Primary", chords: primaryEntries },
        { name: "Diatonic", chords: diatonicEntries },
        ...functionLevels(diatonicEntries, primaryEntries),
      ],
    };
  };

  /**
   * Given a list of diatonic chord entries, auto-generate the Secondary
   * Dominants, Secondary II-Vs, and Tritone Subs levels.
   * `isMajorQuality` determines ii-V flavor for each target.
   */
  const functionLevels = (
    diatonicChords: ChordEntry[],
    primaryChords: ChordEntry[],
  ): TonalityLevel[] => {
    const allChords = [...primaryChords, ...diatonicChords];
    // Determine quality: major if steps match MAJ pattern (root, M3, P5)
    const isMajor = (e: ChordEntry) => {
      if (!e.steps || e.steps.length < 3) return false;
      const r = e.steps[0];
      return (e.steps[1] - r) === M3;
    };
    // Skip tonic (root=0) for secondary dominants
    const targets = allChords.filter(e => e.steps && e.steps[0] !== 0);

    const secDom: ChordEntry[] = [];
    const secIIVs: ChordEntry[] = [];
    const ttSubs: ChordEntry[] = [];

    for (const t of targets) {
      if (!t.steps) continue;
      const root = t.steps[0];
      secDom.push(secV(t.label, root));
      if (isMajor(t)) {
        secIIVs.push(...secIIV(t.label, root));
      } else {
        secIIVs.push(...secIIoV(t.label, root));
      }
    }

    // TT subs for tonic + most common targets
    const tonicEntry = primaryChords[0];
    if (tonicEntry?.steps) ttSubs.push(ttSub(tonicEntry.label, tonicEntry.steps[0]));
    // Add TT subs for a few strong-function chords
    for (const t of targets.slice(0, 4)) {
      if (t.steps) ttSubs.push(ttSub(t.label, t.steps[0]));
    }

    const levels: TonalityLevel[] = [];
    if (secDom.length) levels.push({ name: "Secondary Dominants", chords: secDom });
    if (secIIVs.length) levels.push({ name: "Secondary II-Vs", chords: secIIVs });
    if (ttSubs.length) levels.push({ name: "Tritone Subs", chords: ttSubs });
    return levels;
  };

  return [
    // ── MAJOR ───────────────────────────────────────────────────────
    {
      name: "Major",
      levels: [
        { name: "Primary", chords: [ref("I"), ref("IV"), ref("V")] },
        { name: "Diatonic", chords: [ref("ii"), ref("iii"), ref("vi"), ref("vii°")] },
        {
          name: "Secondary Dominants",
          chords: [
            secV("ii", M2), secV("iii", M3), secV("IV", P4),
            secV("V", P5), secV("vi", M6),
          ],
        },
        {
          // Curated modal-interchange set for Major.  Roughly ordered by
          // usage frequency across pop / rock / classical / jazz.  Covers
          // parallel-minor borrowings (iv, bVII, bVI, bIII, v, ii°),
          // Phrygian (bII / Neapolitan), Lydian (II, #iv°), and the
          // major-III chromatic mediant.
          name: "Modal Interchange",
          chords: [
            chord("iv",  min(P4)),         // parallel minor — extremely common
            chord("bVII", maj(m7)),        // Mixolydian / rock
            chord("bVI", maj(m6)),         // parallel minor
            chord("bIII", maj(m3)),        // parallel minor
            chord("bII", maj(m3 - M2)),    // Neapolitan (Phrygian)
            chord("v",   min(P5)),         // minor v (Mixolydian / minor)
            chord("ii°", dim(M2)),         // parallel minor
            chord("#iv°", dim(P4 + A1)),   // Lydian — raised 4 leading tone
            chord("II",  maj(M2)),         // Lydian / V/V color
            chord("III", maj(M3)),         // chromatic mediant
          ],
        },
        {
          name: "Secondary II-Vs",
          chords: [
            ...secIIoV("ii", M2), ...secIIoV("iii", M3),
            ...secIIV("IV", P4), ...secIIV("V", P5),
            ...secIIoV("vi", M6),
          ],
        },
        {
          name: "Tritone Subs",
          chords: [
            ttSub("I", 0), ttSub("ii", M2),
            ttSub("V", P5), ttSub("vi", M6),
          ],
        },
      ],
    },

    // ── HARMONIC MINOR ──────────────────────────────────────────────
    (() => {
      const pr = [chord("i", min(0)), chord("iv", min(P4)), chord("V", maj(P5))];
      const di = [chord("ii°", dim(M2)), chord("bIII+", aug(m3)), chord("bVI", maj(m6)), chord("vii°", dim(M7))];
      return { name: "Harmonic Minor", levels: [{ name: "Primary", chords: pr }, { name: "Diatonic", chords: di }, ...functionLevels(di, pr)] };
    })(),

    // ── DORIAN ──────────────────────────────────────────────────────
    (() => {
      const pr = [chord("i", min(0)), chord("IV", maj(P4)), chord("bVII", maj(m7))];
      const di = [chord("ii", min(M2)), chord("bIII", maj(m3)), chord("v", min(P5)), chord("vi°", dim(M6))];
      return { name: "Dorian", levels: [{ name: "Primary", chords: pr }, { name: "Diatonic", chords: di }, ...functionLevels(di, pr)] };
    })(),

    // ── MIXOLYDIAN ──────────────────────────────────────────────────
    (() => {
      const pr = [chord("I", maj(0)), chord("IV", maj(P4)), chord("bVII", maj(m7))];
      const di = [chord("ii", min(M2)), chord("iii°", dim(M3)), chord("v", min(P5)), chord("vi", min(M6))];
      return { name: "Mixolydian", levels: [{ name: "Primary", chords: pr }, { name: "Diatonic", chords: di }, ...functionLevels(di, pr)] };
    })(),

    // ── AEOLIAN / NATURAL MINOR ─────────────────────────────────────
    (() => {
      const pr = [chord("i", min(0)), chord("iv", min(P4)), chord("bVII", maj(m7))];
      const di = [chord("ii°", dim(M2)), chord("bIII", maj(m3)), chord("v", min(P5)), chord("bVI", maj(m6))];
      // Curated modal-interchange set for Aeolian — roughly ordered by
      // usage frequency.  Covers harmonic-minor cadence (V, vii°),
      // Dorian inflections (IV, VI), Picardy (I), Phrygian Neapolitan
      // (bII), jazz-minor ii, and Locrian bV tritone color.
      const mi = [
        chord("V",    maj(P5)),         // harmonic-minor cadence — extremely common
        chord("vii°", dim(M7)),         // leading-tone diminished
        chord("IV",   maj(P4)),         // Dorian major IV (rock / gospel)
        chord("I",    maj(0)),          // Picardy third
        chord("bII",  maj(m3 - M2)),    // Neapolitan (Phrygian)
        chord("VI",   maj(M6)),         // Dorian major VI
        chord("ii",   min(M2)),         // minor ii (parallel major)
        chord("bV",   maj(d5)),         // tritone color (Locrian)
      ];
      return { name: "Aeolian", levels: [
        { name: "Primary", chords: pr },
        { name: "Diatonic", chords: di },
        { name: "Modal Interchange", chords: mi },
        ...functionLevels(di, pr),
      ] };
    })(),

    // ── PHRYGIAN ────────────────────────────────────────────────────
    (() => {
      const pr = [chord("i", min(0)), chord("bII", maj(m3 - M2)), chord("bvii", min(m7))];
      const di = [chord("bIII", maj(m3)), chord("iv", min(P4)), chord("v°", dim(P5)), chord("bVI", maj(m6))];
      return { name: "Phrygian", levels: [{ name: "Primary", chords: pr }, { name: "Diatonic", chords: di }, ...functionLevels(di, pr)] };
    })(),

    // ── LYDIAN ──────────────────────────────────────────────────────
    (() => {
      const pr = [chord("I", maj(0)), chord("II", maj(M2)), chord("vii", min(M7))];
      const di = [chord("iii", min(M3)), chord("#iv°", dim(P4 + A1)), chord("V", maj(P5)), chord("vi", min(M6))];
      return { name: "Lydian", levels: [{ name: "Primary", chords: pr }, { name: "Diatonic", chords: di }, ...functionLevels(di, pr)] };
    })(),

    // ── LOCRIAN ─────────────────────────────────────────────────────
    (() => {
      const pr = [chord("i°", dim(0)), chord("bV", maj(d5)), chord("bvii", min(m7))];
      const di = [chord("bII", maj(m3 - M2)), chord("biii", min(m3)), chord("iv", min(P4)), chord("bVI", maj(m6))];
      return { name: "Locrian", levels: [{ name: "Primary", chords: pr }, { name: "Diatonic", chords: di }, ...functionLevels(di, pr)] };
    })(),

    // ── MELODIC MINOR ───────────────────────────────────────────────
    (() => {
      const pr = [chord("i", min(0)), chord("IV", maj(P4)), chord("V", maj(P5))];
      const di = [chord("ii", min(M2)), chord("bIII+", aug(m3)), chord("vi°", dim(M6)), chord("vii°", dim(M7))];
      return { name: "Melodic Minor", levels: [{ name: "Primary", chords: pr }, { name: "Diatonic", chords: di }, ...functionLevels(di, pr)] };
    })(),

    // ── MIXOLYDIAN b6 ───────────────────────────────────────────────
    (() => {
      const pr = [chord("I", maj(0)), chord("iv", min(P4)), chord("bVII", maj(m7))];
      const di = [chord("ii°", dim(M2)), chord("iii°", dim(M3)), chord("v", min(P5)), chord("bVI+", aug(m6))];
      return { name: "Mixolydian b6", levels: [{ name: "Primary", chords: pr }, { name: "Diatonic", chords: di }, ...functionLevels(di, pr)] };
    })(),

    // ── LYDIAN DOMINANT ─────────────────────────────────────────────
    (() => {
      const pr = [chord("I", maj(0)), chord("II", maj(M2)), chord("v", min(P5))];
      const di = [chord("iii°", dim(M3)), chord("#iv°", dim(P4 + A1)), chord("vi", min(M6)), chord("bVII+", aug(m7))];
      return { name: "Lydian Dominant", levels: [{ name: "Primary", chords: pr }, { name: "Diatonic", chords: di }, ...functionLevels(di, pr)] };
    })(),

    // ── PHRYGIAN DOMINANT (Hijaz) ───────────────────────────────────
    (() => {
      const pr = [chord("I", maj(0)), chord("bII", maj(m3 - M2)), chord("iv", min(P4))];
      const di = [chord("iii°", dim(M3)), chord("v°", dim(P5)), chord("bVI+", aug(m6)), chord("bvii", min(m7))];
      return { name: "Phrygian Dominant", levels: [{ name: "Primary", chords: pr }, { name: "Diatonic", chords: di }, ...functionLevels(di, pr)] };
    })(),

    // ── DORIAN #4 ───────────────────────────────────────────────────
    (() => {
      const pr = [chord("i", min(0)), chord("II", maj(M2)), chord("v", min(P5))];
      const di = [chord("bIII", maj(m3)), chord("#iv°", dim(P4 + A1)), chord("vi°", dim(M6)), chord("bVII+", aug(m7))];
      return { name: "Dorian #4", levels: [{ name: "Primary", chords: pr }, { name: "Diatonic", chords: di }, ...functionLevels(di, pr)] };
    })(),

    // ── LYDIAN #2 ───────────────────────────────────────────────────
    (() => {
      const pr = [chord("I", maj(0)), chord("VII", maj(M7))];
      const di = [chord("#ii°", dim(M2 + A1)), chord("iii", min(M3)), chord("#iv°", dim(P4 + A1)), chord("V+", aug(P5)), chord("vi", min(M6))];
      return { name: "Lydian #2", levels: [{ name: "Primary", chords: pr }, { name: "Diatonic", chords: di }, ...functionLevels(di, pr)] };
    })(),

    // ── Harmonic-minor family (auto-built from scale) ───────────────
    buildModeFromScale("Locrian #6",
      ["1","b2","b3","4","b5","6","b7"],
      [0, m3 - M2, m3, P4, d5, M6, m7],
      [0, 3, 6]),
    buildModeFromScale("Ionian #5",
      ["1","2","3","4","#5","6","7"],
      [0, M2, M3, P4, P5 + A1, M6, M7],
      [0, 3, 5]),
    buildModeFromScale("Ultralocrian",
      ["1","b2","b3","3","b5","b6","6"],
      [0, m3 - M2, m3, M3, d5, m6, M6],
      [0, 5, 6]),

    // ── Melodic-minor family (auto-built from scale) ────────────────
    buildModeFromScale("Dorian b2",
      ["1","b2","b3","4","5","6","b7"],
      [0, m3 - M2, m3, P4, P5, M6, m7],
      [0, 3, 6]),
    buildModeFromScale("Lydian Augmented",
      ["1","2","3","#4","#5","6","7"],
      [0, M2, M3, P4 + A1, P5 + A1, M6, M7],
      [0, 1, 5]),
    buildModeFromScale("Locrian #2",
      ["1","2","b3","4","b5","b6","b7"],
      [0, M2, m3, P4, d5, m6, m7],
      [0, 4, 6]),
    buildModeFromScale("Altered",
      ["1","b2","#2","3","b5","#5","b7"],
      [0, m3 - M2, m3, M3, d5, P5 + A1, m7],
      [0, 4, 6]),
  ];
}

/** "Magic Mode" — every possible chord quality on every chromatic root */
export function getMagicModeBank(edo: number): TonalityBank {
  const sh = getChordShapes(edo);
  const { MAJ, MIN, DIM, M2, m3, M3, P4, d5, P5, m6, M6, m7, M7, A1 } = sh;
  const s = edo === 12 ? 1 : edo === 17 ? 1 : edo === 19 ? 2 : edo === 31 ? 3 : 5;

  const maj = (r: number) => MAJ.map(x => x + r);
  const mn = (r: number) => MIN.map(x => x + r);
  const dm = (r: number) => DIM.map(x => x + r);

  const secV = (tl: string, tr: number): ChordEntry => chord(`V/${tl}`, maj(tr + P5));
  const secIIV = (tl: string, tr: number): ChordEntry[] => [chord(`ii/${tl}`, mn(tr + M2)), chord(`V/${tl}`, maj(tr + P5))];
  const secIIoV = (tl: string, tr: number): ChordEntry[] => [chord(`iiø/${tl}`, dm(tr + M2)), chord(`V/${tl}`, maj(tr + P5))];
  const ttSub = (tl: string, tr: number): ChordEntry => chord(`TT/${tl}`, maj(tr + P5 + d5));

  const allTriads: ChordEntry[] = [
    chord("I°", dm(0)),     chord("i", mn(0)),      chord("I", maj(0)),
    chord("bII", maj(s)),   chord("ii", mn(M2)),    chord("II", maj(M2)),
    chord("#ii°", dm(M2 + A1)),
    chord("biii", mn(m3)),  chord("bIII", maj(m3)),
    chord("iii", mn(M3)),   chord("III", maj(M3)),
    chord("iv", mn(P4)),    chord("IV", maj(P4)),
    chord("#iv°", dm(P4 + A1)), chord("#iv", mn(P4 + A1)),
    chord("bV", maj(d5)),
    chord("v", mn(P5)),     chord("V", maj(P5)),
    chord("#v°", dm(P5 + A1)),
    chord("bvi", mn(m6)),   chord("bVI", maj(m6)),
    chord("vi", mn(M6)),    chord("VI", maj(M6)),
    chord("bvii", mn(m7)),  chord("bVII", maj(m7)),
    chord("vii°", dm(M7)),  chord("vii", mn(M7)),   chord("VII", maj(M7)),
  ];

  // Secondary dominants for all non-tonic triads
  const secDoms: ChordEntry[] = [];
  const secIIVs: ChordEntry[] = [];
  const ttSubs: ChordEntry[] = [];
  for (const t of allTriads) {
    if (!t.steps || t.steps[0] === 0) continue;
    const r = t.steps[0];
    secDoms.push(secV(t.label, r));
    const isMaj = (t.steps[1] - r) === M3;
    if (isMaj) secIIVs.push(...secIIV(t.label, r));
    else secIIVs.push(...secIIoV(t.label, r));
    ttSubs.push(ttSub(t.label, r));
  }

  return {
    name: "Magic Mode",
    levels: [
      { name: "All Triads", chords: allTriads },
      { name: "Secondary Dominants", chords: secDoms },
      { name: "Secondary II-Vs", chords: secIIVs },
      { name: "Tritone Subs", chords: ttSubs },
    ],
  };
}

/** Get all tonality names (for selector dropdown) */
export function getTonalityNames(edo: number): string[] {
  return [...getTonalityBanks(edo).map(b => b.name), "Magic Mode"];
}
