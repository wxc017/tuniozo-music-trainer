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
          name: "Borrowings",
          chords: [
            chord("ii°", dim(M2)), chord("bIII", maj(m3)),
            chord("iv", min(P4)), chord("v", min(P5)),
            chord("bVI", maj(m6)), chord("bVII", maj(m7)),
            chord("#iv°", dim(P4 + A1)),
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
      return { name: "Aeolian", levels: [{ name: "Primary", chords: pr }, { name: "Diatonic", chords: di }, ...functionLevels(di, pr)] };
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
