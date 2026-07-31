// ── In-key pentatonics — the degree-slot frameworks of a key ─────────
// A pentatonic that "stays in the key" is a choice of five DEGREE SLOTS out of
// 1 2 3 4 5 6 7 — nothing more.  The slot pattern is the invariant; the
// chromatic spelling is whatever the mode makes of it:
//
//     slots 1·3·4·6·7   in Lydian → 1 3 ♯4 6 7
//                       in minor  → 1 ♭3 4 ♭6 ♭7   (Man Gong)
//
// A heptatonic key has C(7,5) = 21 such frameworks, but SEVEN of them are not
// pentatonics in any useful sense: if the two omitted slots are adjacent, the
// five survivors are four consecutive scale steps plus one 4th-or-wider hole —
// a pentachord with a gap, not a gapped scale.  Those are dropped by default
// (pass `includeGapped` to see them).  The 14 that remain collapse to 10
// interval necklaces, and between them they present ALL eleven intervals above
// a tonic without one borrowed note — which is the whole point.  Transposing a
// single shape through 12 keys × 7 degrees is 84 drills sharing one necklace;
// the anhemitonic 2-2-3-2-3 only ever offers {2,3,4,5,7,8,9,10} above a tonic,
// so it can never teach a ♭2, a tritone or a major 7th.
//
// Hirajoshi, Iwato, In, Kumoi, In-sen, Ryukyu and Balinese all fall out as
// plain slot patterns — none of them needs a note from outside the key.

const mod = (a: number, b: number) => ((a % b) + b) % b;

/** Pcs of the major scale — the reference each degree slot is spelled against. */
const MAJOR_PCS = [0, 2, 4, 5, 7, 9, 11];

/** Chromatic degree names from a shape's OWN root (12-EDO). */
const DEG12 = ["1", "♭2", "2", "♭3", "3", "4", "♯4", "5", "♭6", "6", "♭7", "7"] as const;

// ── Names ────────────────────────────────────────────────────────────
// Every rotation of every kept necklace is named, keyed by its pcs from its own
// root.  `traditional` separates the two kinds of name, and the distinction is
// load-bearing — DON'T blur it:
//
//   • traditional — an established name from a living practice: the Chinese Gong
//     rotations, the Japanese hirajōshi/kumoi/ryūkyū tunings, the jazz "dominant"
//     / "minor 6" pentatonics, and the Indian audava (five-note) ragas, which
//     name far more of these shapes than any other tradition.  37 of the 50.
//   • systematic  — "<Family> <n>", the nth mode of that family.  The remaining
//     13 have no name in any literature I'd stand behind; inventing folk-sounding
//     ones would be teaching a falsehood, so they get a mode number instead.
//     `traditional: false` marks them, and the Sing view filters them out.
//
// Where two traditions name the same pitch-set, the label is whichever reads
// less ambiguously: Valaji over Kalavati, and Sunadavinodini over the Hindustani
// Hindol — because Carnatic "Hindolam" is a DIFFERENT scale (it's Malkauns).
//
// Family labels are internal grouping only and are never displayed.  The five
// with no traditional member are named for the chord their principal rotation
// actually outlines (Maj9 = 1 2 3 5 7 — C D E G B is a Cmaj9, not a maj7).  A
// family label describes only its principal rotation: "Min9 5" is Min9's fifth
// mode and has a major 3rd of its own, the usual modal convention.
interface PentName { name: string; family: string; mode: number; traditional: boolean }
const T = (name: string, family: string, mode: number): PentName => ({ name, family, mode, traditional: true });
// Mode 1 of a descriptively-named family is just the family (`Maj9`, not
// `Maj9 1`); the other modes carry their numeral.
const S = (family: string, mode: number): PentName =>
  ({ name: mode === 1 ? family : `${family} ${mode}`, family, mode, traditional: false });

const NAMES: Record<string, PentName> = {
  // ── Major / Gong (2-2-3-2-3) — anhemitonic; all five rotations traditional ──
  "0,2,4,7,9":   T("Major", "Major", 1),                     // 1 2 3 5 6      Gong
  "0,2,5,7,10":  T("Egyptian", "Major", 2),                  // 1 2 4 5 ♭7     Shang / suspended
  "0,3,5,8,10":  T("Man Gong", "Major", 3),                  // 1 ♭3 4 ♭6 ♭7   Jue
  "0,2,5,7,9":   T("Ritusen", "Major", 4),                   // 1 2 4 5 6      Zhi
  "0,3,5,7,10":  T("Minor", "Major", 5),                     // 1 ♭3 4 5 ♭7    Yu

  // ── Dominant (2-2-2-3-3) — the other anhemitonic necklace ──
  "0,2,4,7,10":  T("Dominant", "Dominant", 1),               // 1 2 3 5 ♭7
  "0,2,5,8,10":  S("Dominant", 2),                           // 1 2 4 ♭6 ♭7
  "0,3,6,8,10":  T("Tivrakauns", "Dominant", 3),             // 1 ♭3 ♭5 ♭6 ♭7
  "0,3,5,7,9":   T("Minor 6", "Dominant", 4),                // 1 ♭3 4 5 6
  "0,2,4,6,9":   S("Dominant", 5),                           // 1 2 3 ♯4 6

  // ── Hirajoshi (1-4-1-4-2) — Japanese; three of five traditional ──
  "0,2,3,7,8":   T("Hirajoshi", "Hirajoshi", 1),             // 1 2 ♭3 5 ♭6
  "0,1,5,6,10":  T("Iwato", "Hirajoshi", 2),                 // 1 ♭2 4 ♭5 ♭7
  "0,4,5,9,11":  T("Bhinna Shadja", "Hirajoshi", 3),         // 1 3 4 6 7
  "0,1,5,7,8":   T("In", "Hirajoshi", 4),                    // 1 ♭2 4 5 ♭6   miyako-bushi
  "0,4,6,7,11":  T("Amritavarshini", "Hirajoshi", 5),        // 1 3 ♯4 5 7

  // ── Kumoi (1-4-2-3-2) ──
  "0,2,3,7,9":   T("Kumoi", "Kumoi", 1),                     // 1 2 ♭3 5 6
  "0,1,5,7,10":  T("In-sen", "Kumoi", 2),                    // 1 ♭2 4 5 ♭7
  "0,4,6,9,11":  T("Sunadavinodini", "Kumoi", 3),            // 1 3 ♯4 6 7
  "0,2,5,7,8":   T("Shobhawari", "Kumoi", 4),                // 1 2 4 5 ♭6
  "0,3,5,6,10":  S("Kumoi", 5),                              // 1 ♭3 4 ♭5 ♭7

  // ── Ryukyu (1-2-4-1-4) ──
  "0,4,5,7,11":  T("Ryukyu", "Ryukyu", 1),                   // 1 3 4 5 7
  "0,1,3,7,8":   T("Balinese", "Ryukyu", 2),                 // 1 ♭2 ♭3 5 ♭6   pelog-like
  "0,2,6,7,11":  T("Vaijayanti", "Ryukyu", 3),               // 1 2 ♯4 5 7
  "0,4,5,9,10":  S("Ryukyu", 4),                             // 1 3 4 6 ♭7
  "0,1,5,6,8":   S("Ryukyu", 5),                             // 1 ♭2 4 ♭5 ♭6

  // ── Maj9 (1-2-2-3-4) — principal is 1 2 3 5 7 ──
  "0,2,4,7,11":  T("Hamsadhwani", "Maj9", 1),                // 1 2 3 5 7
  "0,2,5,9,10":  T("Jai Bhavani", "Maj9", 2),                // 1 2 4 6 ♭7
  "0,3,7,8,10":  T("Taranga", "Maj9", 3),                    // 1 ♭3 5 ♭6 ♭7
  "0,4,5,7,9":   T("Nagasvaravali", "Maj9", 4),              // 1 3 4 5 6
  "0,1,3,5,8":   S("Maj9", 5),                               // 1 ♭2 ♭3 4 ♭6

  // ── Min9 (1-4-3-2-2) — principal is 1 2 ♭3 5 ♭7 ──
  "0,2,3,7,10":  S("Min9", 1),                               // 1 2 ♭3 5 ♭7
  "0,1,5,8,10":  T("Gyankali", "Min9", 2),                   // 1 ♭2 4 ♭6 ♭7
  "0,4,7,9,11":  T("Ardha Shankar", "Min9", 3),              // 1 3 5 6 7
  "0,3,5,7,8":   S("Min9", 4),                               // 1 ♭3 4 5 ♭6
  "0,2,4,5,9":   S("Min9", 5),                               // 1 2 3 4 6

  // ── Maj9sus (1-2-3-2-4) — principal is 1 2 4 5 7 ──
  "0,2,5,7,11":  T("Salang Sarang", "Maj9sus", 1),           // 1 2 4 5 7
  "0,3,5,9,10":  T("Shivkauns", "Maj9sus", 2),               // 1 ♭3 4 6 ♭7
  "0,2,6,7,9":   S("Maj9sus", 3),                            // 1 2 ♯4 5 6
  "0,4,5,7,10":  T("Nandeshwari", "Maj9sus", 4),             // 1 3 4 5 ♭7
  "0,1,3,6,8":   T("Chhaya Todi", "Maj9sus", 5),             // 1 ♭2 ♭3 ♯4 ♭6

  // ── Maj13sus (1-2-3-4-2) — principal is 1 2 4 6 7 ──
  "0,2,5,9,11":  T("Rasaranjani", "Maj13sus", 1),            // 1 2 4 6 7
  "0,3,7,9,10":  T("Lilavati", "Maj13sus", 2),               // 1 ♭3 5 6 ♭7
  "0,4,6,7,9":   T("Hiradharini", "Maj13sus", 3),            // 1 3 ♯4 5 6
  "0,2,3,5,8":   T("Adi Bhairavi", "Maj13sus", 4),           // 1 2 ♭3 4 ♭6
  "0,1,3,6,10":  S("Maj13sus", 5),                           // 1 ♭2 ♭3 ♯4 ♭7

  // ── Dom13 (1-2-4-3-2) — principal is 1 3 5 6 ♭7 ──
  "0,4,7,9,10":  T("Valaji", "Dom13", 1),                    // 1 3 5 6 ♭7
  "0,3,5,6,8":   S("Dom13", 2),                              // 1 ♭3 4 ♭5 ♭6
  "0,2,3,5,9":   T("Abhogi", "Dom13", 3),                    // 1 2 ♭3 4 6
  "0,1,3,7,10":  T("Bairagi Todi", "Dom13", 4),              // 1 ♭2 ♭3 5 ♭7
  "0,2,6,9,11":  S("Dom13", 5),                              // 1 2 ♯4 6 7
};

export interface PentSubset {
  /** The framework: 1-based degree slots of the key, ascending. e.g. [1,3,4,6,7] */
  slots: number[];
  /** Stable identity of the framework across every mode and key: "1·3·4·6·7". */
  slotKey: string;
  /** How the mode spells those slots, ascending from the key tonic: "1 ♭3 4 ♭6 ♭7". */
  slotLabel: string;
  /** The subset's pcs, ascending from the KEY tonic. */
  slotPcs: number[];
  /** The two slots this framework leaves out. */
  omitted: number[];
  /** Which slot this realisation is rooted on (1-based). */
  rootSlot: number;
  /** 0-based index of that root within the parent scale. */
  rootIdx: number;
  /** Pc of the root within the parent scale's pc space. */
  rootPc: number;
  /** Pcs from THIS shape's own root, ascending from 0. */
  struct: number[];
  /** Adjacent step sizes starting at the root, wrapping the octave. */
  steps: number[];
  /** Canonical (lexicographically least) rotation of `steps` — the necklace. */
  necklace: string;
  /** Name family, e.g. "Hirajoshi"; every rotation of a necklace shares it. */
  family: string;
  /** Which mode of the family this rotation is (1-5). */
  mode: number;
  /** True when `name` is an established name, false when it's "<Family> <n>". */
  traditional: boolean;
  /** Degree formula from its own root, e.g. "1 2 ♭3 5 ♭6". */
  formula: string;
  /** How many adjacencies are a single semitone — the hemitonic grade. */
  semitoneSteps: number;
  /** Widest adjacency.  ≥5 means a 4th-or-wider hole (gapped shapes only). */
  maxStep: number;
  /** The shape's name. */
  name: string;
}

/** Spell pcs as KEY degrees against their slots, so the accidental is the one
 *  the mode actually produces: slot 4 at a tritone is ♯4 (Lydian), slot 5 at a
 *  tritone is ♭5 (Locrian).  `slots` and `pcs` are parallel. */
export function slotDegrees(slots: number[], pcs: number[]): string {
  return slots.map((slot, i) => {
    const delta = mod(pcs[i] - MAJOR_PCS[slot - 1] + 6, 12) - 6;
    const acc = delta < 0 ? "♭".repeat(-delta) : delta > 0 ? "♯".repeat(delta) : "";
    return acc + slot;
  }).join(" ");
}

/** Degree formula of a shape from its OWN root (12-EDO); step list elsewhere.
 *  The tritone spells ♭5 when the shape already has a 4 to be flattened from
 *  (Iwato is 1 ♭2 4 ♭5 ♭7, not "4 ♯4"), and ♯4 otherwise. */
export function pentFormula(struct: number[], edo = 12): string {
  if (edo !== 12) return struct.join("·");
  const hasFourth = struct.includes(5);
  return struct.map(pc => (pc === 6 && hasFourth ? "♭5" : DEG12[pc])).join(" ");
}

/** A framework is "gapped" — a pentachord with a hole rather than a pentatonic —
 *  when the two slots it omits are cyclically adjacent, leaving four consecutive
 *  scale steps and one 4th-or-wider leap. */
const isGapped = (omitted: number[], n: number): boolean =>
  omitted.length === 2 && (omitted[1] - omitted[0] === 1 || (omitted[0] === 1 && omitted[1] === n));

/**
 * Every 5-slot framework of `scalePcs`, realised in that scale and rooted on
 * each of its own slots.
 *
 * `scalePcs` is the selected mode as ascending pcs from its tonic — so the SAME
 * framework yields Lydian's `1 3 ♯4 6 7` and minor's `1 ♭3 4 ♭6 ♭7`.  A
 * heptatonic parent gives 14 frameworks × 5 roots = 70 realisations by default;
 * `includeGapped` adds the 7 pentachord-with-a-hole frameworks back.  Sorted by
 * framework then by root slot, so one framework's realisations are contiguous.
 */
export function pentatonicSubsets(
  scalePcs: number[], edo = 12, opts: { includeGapped?: boolean } = {},
): PentSubset[] {
  const n = scalePcs.length;
  if (n < 5) return [];

  // All 5-element subsets of the parent's degree slots.
  const frameworks: number[][] = [];
  const pick = (start: number, acc: number[]) => {
    if (acc.length === 5) { frameworks.push([...acc]); return; }
    for (let i = start; i < n; i++) { acc.push(i); pick(i + 1, acc); acc.pop(); }
  };
  pick(0, []);

  const semi = Math.max(1, Math.round(edo / 12));
  const out: PentSubset[] = [];
  for (const fw of frameworks) {
    const slots = fw.map(i => i + 1);
    const omitted = Array.from({ length: n }, (_, i) => i + 1).filter(d => !slots.includes(d));
    if (!opts.includeGapped && isGapped(omitted, n)) continue;
    const slotPcs = fw.map(i => mod(scalePcs[i], edo));
    if (new Set(slotPcs).size !== 5) continue;             // degenerate at this EDO
    const slotKey = slots.join("·");
    const slotLabel = edo === 12 && n === 7 ? slotDegrees(slots, slotPcs) : slotKey;

    for (const rootIdx of fw) {
      const rootPc = mod(scalePcs[rootIdx], edo);
      const struct = slotPcs.map(pc => mod(pc - rootPc, edo)).sort((a, b) => a - b);
      const steps = struct.map((v, i) => mod(struct[(i + 1) % 5] - v, edo));
      const necklace = steps
        .map((_, r) => [...steps.slice(r), ...steps.slice(0, r)].join("-"))
        .sort()[0];
      const formula = pentFormula(struct, edo);
      // Gapped shapes are outside the named catalogue; they fall back to formula.
      const nm = NAMES[struct.join(",")]
        ?? { name: formula, family: formula, mode: 1, traditional: false };
      out.push({
        slots, slotKey, slotLabel, slotPcs, omitted,
        rootSlot: rootIdx + 1, rootIdx, rootPc,
        struct, steps, necklace,
        family: nm.family, mode: nm.mode, traditional: nm.traditional, name: nm.name,
        formula,
        semitoneSteps: steps.filter(s => s <= semi).length,
        maxStep: Math.max(...steps),
      });
    }
  }

  // Framework order, then by the slot it's rooted on — so all five realisations
  // of one framework sit together under one header.
  return out.sort((a, b) =>
    a.slots.join(",").localeCompare(b.slots.join(",")) || a.rootSlot - b.rootSlot);
}
