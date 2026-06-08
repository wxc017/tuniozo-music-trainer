// ── Odd-Meter Groove Library ─────────────────────────────────────────────
//
// A self-contained catalogue of the common drum grooves in 3/4, 5/4, 5/8,
// 7/8 and 11/8.  These are *generic* functional patterns — the standard
// subdivision groupings (2+3, 3+2, 2+2+3, 3+3+3+2, …) realized with a
// basic kick / snare / hat treatment per style.  They are common
// pedagogical knowledge, NOT transcriptions of any copyrighted recording.
//
// The existing drumData.ts grid engine is hard-wired to 4/4 (every grid is
// "× 4 beats"), so odd meters live here in their own simple model:
//
//   • Every groove is laid out on a 16th-note grid.
//   • A measure has `slots` sixteenths:  x/8 → 2·X,   x/4 → 4·Q.
//   • Hits are 16th-slot indices (0-based).  Eighths fall on even slots.
//   • `grouping` is the accent structure in PULSE units (eighths for x/8,
//     quarters for x/4); e.g. 7/8 = [2,2,3].
//
// Voices: hihat (closed hat / ride), snare (backbeat), kick, optional
// ghost (soft snare) and hhFoot (hi-hat with the foot).  `accents` marks
// the metric group-heads so a player can feel where the bar re-groups.

export type OddMeter = "3/4" | "5/4" | "5/8" | "7/8" | "11/8";
export type GrooveStyle = "rock" | "funk" | "jazz" | "folk" | "latin" | "ballad" | "prog";
export type GrooveFeel = "straight" | "swung";

export interface OddGroove {
  id: string;
  meter: OddMeter;
  name: string;
  style: GrooveStyle;
  feel: GrooveFeel;
  /** Accent grouping in pulse units (eighths for x/8, quarters for x/4). */
  grouping: number[];
  /** What one pulse is. */
  pulseUnit: "eighth" | "quarter";
  /** Total 16th-note slots in one measure. */
  slots: number;
  /** 16th-slot indices for each voice. */
  hihat: number[];
  snare: number[];
  kick: number[];
  ghost?: number[];
  hhFoot?: number[];
  /** Metric group-head slots (for the felt accent / counting). */
  accents?: number[];
  /** Short practice note — generic style context, no song transcriptions. */
  note?: string;
}

// ── Per-meter geometry ───────────────────────────────────────────────────

export const METER_INFO: Record<OddMeter, {
  slots: number;
  pulseUnit: "eighth" | "quarter";
  pulses: number;
}> = {
  "3/4":  { slots: 12, pulseUnit: "quarter", pulses: 3 },
  "5/4":  { slots: 20, pulseUnit: "quarter", pulses: 5 },
  "5/8":  { slots: 10, pulseUnit: "eighth",  pulses: 5 },
  "7/8":  { slots: 14, pulseUnit: "eighth",  pulses: 7 },
  "11/8": { slots: 22, pulseUnit: "eighth",  pulses: 11 },
};

/** Slots-per-pulse: an eighth spans 2 sixteenths, a quarter spans 4. */
export function slotsPerPulse(m: OddMeter): number {
  return METER_INFO[m].pulseUnit === "quarter" ? 4 : 2;
}

/** Convert a pulse grouping (e.g. [2,2,3]) to group-head 16th slots. */
export function groupHeadSlots(meter: OddMeter, grouping: number[]): number[] {
  const per = slotsPerPulse(meter);
  const heads: number[] = [];
  let acc = 0;
  for (const g of grouping) { heads.push(acc * per); acc += g; }
  return heads;
}

// ── The grooves ──────────────────────────────────────────────────────────
// Eighth positions per meter (even slots), for reference while reading:
//   5/8  : 0 2 4 6 8
//   7/8  : 0 2 4 6 8 10 12
//   11/8 : 0 2 4 6 8 10 12 14 16 18 20
//   3/4  : 0 2 4 6 8 10        (quarters 0 4 8)
//   5/4  : 0 2 4 6 8 10 12 14 16 18  (quarters 0 4 8 12 16)

export const ODD_GROOVES: OddGroove[] = [
  // ═══════════════════════ 3/4 ═══════════════════════
  {
    id: "om_3_4_rock", meter: "3/4", name: "3/4 Rock", style: "rock", feel: "straight",
    grouping: [1, 1, 1], pulseUnit: "quarter", slots: 12,
    hihat: [0, 2, 4, 6, 8, 10], snare: [4], kick: [0, 8], accents: [0, 4, 8],
    note: "Basic rock waltz: kick on 1 & 3, backbeat snare on 2.",
  },
  {
    id: "om_3_4_rock_23", meter: "3/4", name: "3/4 Rock (backbeat 2 & 3)", style: "rock", feel: "straight",
    grouping: [1, 1, 1], pulseUnit: "quarter", slots: 12,
    hihat: [0, 2, 4, 6, 8, 10], snare: [4, 8], kick: [0], accents: [0, 4, 8],
    note: "Driving feel — snare on both 2 and 3, kick only on the downbeat.",
  },
  {
    id: "om_3_4_jazz_waltz", meter: "3/4", name: "3/4 Jazz Waltz", style: "jazz", feel: "swung",
    grouping: [1, 1, 1], pulseUnit: "quarter", slots: 12,
    hihat: [0, 4, 6, 8, 10], hhFoot: [4, 8], snare: [], kick: [0], accents: [0, 4, 8],
    note: "Ride: 1 — 2 +(a) — 3 +(a) in triplet feel; hi-hat foot on 2 & 3.",
  },
  {
    id: "om_3_4_viennese", meter: "3/4", name: "3/4 Viennese Waltz (oom-pah-pah)", style: "folk", feel: "straight",
    grouping: [1, 1, 1], pulseUnit: "quarter", slots: 12,
    hihat: [4, 8], snare: [], kick: [0], accents: [0],
    note: "Bass drum on 1, hi-hat 'chick' on 2 & 3.",
  },
  {
    id: "om_3_4_country", meter: "3/4", name: "3/4 Country Waltz", style: "folk", feel: "straight",
    grouping: [1, 1, 1], pulseUnit: "quarter", slots: 12,
    hihat: [0, 2, 4, 6, 8, 10], snare: [4, 8], kick: [0], accents: [0, 4, 8],
    note: "Kick on 1, rim-click on 2 & 3 — play the snares as cross-stick.",
  },
  {
    id: "om_3_4_ballad_halftime", meter: "3/4", name: "3/4 Ballad (half-time)", style: "ballad", feel: "straight",
    grouping: [1, 1, 1], pulseUnit: "quarter", slots: 12,
    hihat: [0, 2, 4, 6, 8, 10], snare: [8], kick: [0], accents: [0, 4, 8],
    note: "One slow backbeat on beat 3 — spacious ballad feel.",
  },
  {
    id: "om_3_4_shuffle", meter: "3/4", name: "3/4 Shuffle", style: "rock", feel: "swung",
    grouping: [1, 1, 1], pulseUnit: "quarter", slots: 12,
    hihat: [0, 2, 4, 6, 8, 10], snare: [4, 8], kick: [0], accents: [0, 4, 8],
    note: "Swing the eighths (long-short triplet feel); backbeat on 2 & 3.",
  },
  {
    id: "om_3_4_funk", meter: "3/4", name: "3/4 Funk (16ths)", style: "funk", feel: "straight",
    grouping: [1, 1, 1], pulseUnit: "quarter", slots: 12,
    hihat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], snare: [4], kick: [0, 3, 8],
    ghost: [6, 10], accents: [0, 4, 8],
    note: "16th hats, syncopated kick, ghost notes around the backbeat.",
  },

  // ═══════════════════════ 5/4 ═══════════════════════
  {
    id: "om_5_4_rock", meter: "5/4", name: "5/4 Rock (4+1)", style: "rock", feel: "straight",
    grouping: [1, 1, 1, 1, 1], pulseUnit: "quarter", slots: 20,
    hihat: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18], snare: [4, 12], kick: [0, 8, 16],
    accents: [0, 4, 8, 12, 16],
    note: "Felt as a 4/4 backbeat (snare 2 & 4) with an extra beat 5.",
  },
  {
    id: "om_5_4_rock_32", meter: "5/4", name: "5/4 Rock (3+2)", style: "rock", feel: "straight",
    grouping: [3, 2], pulseUnit: "quarter", slots: 20,
    hihat: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18], snare: [8], kick: [0, 12],
    accents: [0, 12],
    note: "Classic prog 5/4: groups of 3+2, backbeat snare on beat 3.",
  },
  {
    id: "om_5_4_rock_23", meter: "5/4", name: "5/4 Rock (2+3)", style: "rock", feel: "straight",
    grouping: [2, 3], pulseUnit: "quarter", slots: 20,
    hihat: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18], snare: [4], kick: [0, 8],
    accents: [0, 8],
    note: "Groups of 2+3; snare on beat 2, kick restarts the 3-group.",
  },
  {
    id: "om_5_4_jazz", meter: "5/4", name: "5/4 Jazz (3+2 swing)", style: "jazz", feel: "swung",
    grouping: [3, 2], pulseUnit: "quarter", slots: 20,
    hihat: [0, 4, 6, 8, 12, 14, 16, 18], hhFoot: [4, 12], snare: [], kick: [0],
    accents: [0, 12],
    note: "Swing ride over 3+2; hi-hat foot on 2 & 4, comp freely on snare/kick.",
  },
  {
    id: "om_5_4_funk", meter: "5/4", name: "5/4 Funk (16ths)", style: "funk", feel: "straight",
    grouping: [1, 1, 1, 1, 1], pulseUnit: "quarter", slots: 20,
    hihat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    snare: [4, 12], kick: [0, 7, 10, 16], ghost: [2, 14, 18], accents: [0, 4, 8, 12, 16],
    note: "16th-note funk; backbeat 2 & 4, ghosted snares, syncopated kick.",
  },
  {
    id: "om_5_4_halftime", meter: "5/4", name: "5/4 Half-time", style: "ballad", feel: "straight",
    grouping: [1, 1, 1, 1, 1], pulseUnit: "quarter", slots: 20,
    hihat: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18], snare: [8], kick: [0, 16],
    accents: [0, 4, 8, 12, 16],
    note: "Single centred backbeat on beat 3 — broad half-time feel.",
  },
  {
    id: "om_5_4_latin", meter: "5/4", name: "5/4 Afro-Cuban (3+2)", style: "latin", feel: "straight",
    grouping: [3, 2], pulseUnit: "quarter", slots: 20,
    hihat: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18], snare: [4, 16], kick: [0, 6, 12],
    accents: [0, 12],
    note: "Cross-stick on the offbeats over a 3+2 (son-clave-flavoured) feel.",
  },

  // ═══════════════════════ 5/8 ═══════════════════════
  {
    id: "om_5_8_rock_23", meter: "5/8", name: "5/8 Rock (2+3)", style: "rock", feel: "straight",
    grouping: [2, 3], pulseUnit: "eighth", slots: 10,
    hihat: [0, 2, 4, 6, 8], snare: [4], kick: [0, 8], accents: [0, 4],
    note: "Short-long: snare on the 3-group head, kick on 1 + pickup into the next bar.",
  },
  {
    id: "om_5_8_rock_32", meter: "5/8", name: "5/8 Rock (3+2)", style: "rock", feel: "straight",
    grouping: [3, 2], pulseUnit: "eighth", slots: 10,
    hihat: [0, 2, 4, 6, 8], snare: [6], kick: [0], accents: [0, 6],
    note: "Long-short: snare lands on the 2-group head (the '4-and' feel).",
  },
  {
    id: "om_5_8_funk_23", meter: "5/8", name: "5/8 Funk (2+3, 16ths)", style: "funk", feel: "straight",
    grouping: [2, 3], pulseUnit: "eighth", slots: 10,
    hihat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], snare: [4], kick: [0, 5], ghost: [2, 8],
    accents: [0, 4],
    note: "16th-note funk in 5/8; tight ghosts around the single backbeat.",
  },
  {
    id: "om_5_8_folk_paidushko", meter: "5/8", name: "5/8 Folk (paidushko, quick-slow)", style: "folk", feel: "straight",
    grouping: [2, 3], pulseUnit: "eighth", slots: 10,
    hihat: [0, 2, 4, 6, 8], snare: [4], kick: [0, 4], accents: [0, 4],
    note: "Balkan quick-slow (2+3) dance pulse; play snare as rim-click (generic).",
  },
  {
    id: "om_5_8_halftime_32", meter: "5/8", name: "5/8 Half-time (3+2)", style: "ballad", feel: "straight",
    grouping: [3, 2], pulseUnit: "eighth", slots: 10,
    hihat: [0, 2, 4, 6, 8], snare: [6], kick: [0], accents: [0, 6],
    note: "Sparse half-time: one backbeat per bar on the 2-group head.",
  },
  {
    id: "om_5_8_jazz_23", meter: "5/8", name: "5/8 Jazz (2+3) ride", style: "jazz", feel: "swung",
    grouping: [2, 3], pulseUnit: "eighth", slots: 10,
    hihat: [0, 2, 4, 6, 8], hhFoot: [4], snare: [], kick: [0], accents: [0, 4],
    note: "Ride the eighths; hi-hat foot on the 3-group head; comp lightly.",
  },

  // ═══════════════════════ 7/8 ═══════════════════════
  {
    id: "om_7_8_rock_223", meter: "7/8", name: "7/8 Rock (2+2+3)", style: "rock", feel: "straight",
    grouping: [2, 2, 3], pulseUnit: "eighth", slots: 14,
    hihat: [0, 2, 4, 6, 8, 10, 12], snare: [4], kick: [0, 8], accents: [0, 4, 8],
    note: "The most common 7/8 rock groove: snare on 2, kick on 1 and the 3-group.",
  },
  {
    id: "om_7_8_rock_322", meter: "7/8", name: "7/8 Rock (3+2+2)", style: "rock", feel: "straight",
    grouping: [3, 2, 2], pulseUnit: "eighth", slots: 14,
    hihat: [0, 2, 4, 6, 8, 10, 12], snare: [6], kick: [0, 10], accents: [0, 6, 10],
    note: "Long group first; backbeat on the first 2-group head.",
  },
  {
    id: "om_7_8_rock_232", meter: "7/8", name: "7/8 Rock (2+3+2)", style: "rock", feel: "straight",
    grouping: [2, 3, 2], pulseUnit: "eighth", slots: 14,
    hihat: [0, 2, 4, 6, 8, 10, 12], snare: [4], kick: [0, 10], accents: [0, 4, 10],
    note: "Long group in the middle; snare on 2, kick reignites the final 2-group.",
  },
  {
    id: "om_7_8_funk_223", meter: "7/8", name: "7/8 Funk (2+2+3, 16ths)", style: "funk", feel: "straight",
    grouping: [2, 2, 3], pulseUnit: "eighth", slots: 14,
    hihat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], snare: [4], kick: [0, 8, 11],
    ghost: [2, 6, 12], accents: [0, 4, 8],
    note: "16th funk; the 3-group gets a syncopated kick (8 & the 'a').",
  },
  {
    id: "om_7_8_halftime_223", meter: "7/8", name: "7/8 Half-time (2+2+3)", style: "ballad", feel: "straight",
    grouping: [2, 2, 3], pulseUnit: "eighth", slots: 14,
    hihat: [0, 2, 4, 6, 8, 10, 12], snare: [8], kick: [0, 4], accents: [0, 4, 8],
    note: "Single backbeat on the 3-group head — broad half-time 7/8.",
  },
  {
    id: "om_7_8_jazz_322", meter: "7/8", name: "7/8 Jazz (3+2+2) ride", style: "jazz", feel: "swung",
    grouping: [3, 2, 2], pulseUnit: "eighth", slots: 14,
    hihat: [0, 2, 4, 6, 8, 10, 12], hhFoot: [6, 10], snare: [], kick: [0], accents: [0, 6, 10],
    note: "Swing ride over 3+2+2; hi-hat foot on the two duple heads.",
  },
  {
    id: "om_7_8_folk_rachenitsa", meter: "7/8", name: "7/8 Folk (rachenitsa, 2+2+3)", style: "folk", feel: "straight",
    grouping: [2, 2, 3], pulseUnit: "eighth", slots: 14,
    hihat: [0, 2, 4, 6, 8, 10, 12], snare: [8], kick: [0, 4], accents: [0, 4, 8],
    note: "Bulgarian rachenitsa quick-quick-slow (generic); accent the group heads.",
  },
  {
    id: "om_7_8_latin_223", meter: "7/8", name: "7/8 Afro-pop (2+2+3)", style: "latin", feel: "straight",
    grouping: [2, 2, 3], pulseUnit: "eighth", slots: 14,
    hihat: [0, 2, 4, 6, 8, 10, 12], snare: [4, 12], kick: [0, 6, 8], accents: [0, 4, 8],
    note: "Bell-pattern feel; cross-stick the snares, kick straddles the 3-group.",
  },

  // ═══════════════════════ 11/8 ═══════════════════════
  {
    id: "om_11_8_prog_3332", meter: "11/8", name: "11/8 Prog (3+3+3+2)", style: "prog", feel: "straight",
    grouping: [3, 3, 3, 2], pulseUnit: "eighth", slots: 22,
    hihat: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20], snare: [6, 18], kick: [0, 12],
    accents: [0, 6, 12, 18],
    note: "Three triples + a duple; backbeats on the 2nd and 4th group heads.",
  },
  {
    id: "om_11_8_22223", meter: "11/8", name: "11/8 (2+2+2+2+3) — 4/4 + 3/8 tag", style: "rock", feel: "straight",
    grouping: [2, 2, 2, 2, 3], pulseUnit: "eighth", slots: 22,
    hihat: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20], snare: [4, 12], kick: [0, 8, 16],
    accents: [0, 4, 8, 12, 16],
    note: "Hear a 4/4 backbeat (snare 2 & 4) with a 3/8 tag bolted on the end.",
  },
  {
    id: "om_11_8_32222", meter: "11/8", name: "11/8 (3+2+2+2+2)", style: "rock", feel: "straight",
    grouping: [3, 2, 2, 2, 2], pulseUnit: "eighth", slots: 22,
    hihat: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20], snare: [6, 14], kick: [0, 10, 18],
    accents: [0, 6, 10, 14, 18],
    note: "Long group first, then four duples; backbeats on duple heads 1 & 3.",
  },
  {
    id: "om_11_8_443", meter: "11/8", name: "11/8 (4+4+3)", style: "prog", feel: "straight",
    grouping: [4, 4, 3], pulseUnit: "eighth", slots: 22,
    hihat: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20], snare: [4, 12], kick: [0, 8, 16],
    accents: [0, 8, 16],
    note: "Two longs + a short; reads as 2+2 / 2+2 / 3 with a 4/4-ish backbeat.",
  },
  {
    id: "om_11_8_kopanitsa", meter: "11/8", name: "11/8 Folk (kopanitsa, 2+2+3+2+2)", style: "folk", feel: "straight",
    grouping: [2, 2, 3, 2, 2], pulseUnit: "eighth", slots: 22,
    hihat: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20], snare: [4, 14], kick: [0, 8], accents: [0, 4, 8, 14, 18],
    note: "Bulgarian kopanitsa (generic): the 3-group sits in the centre.",
  },
  {
    id: "om_11_8_funk_3332", meter: "11/8", name: "11/8 Funk (3+3+3+2, 16ths)", style: "funk", feel: "straight",
    grouping: [3, 3, 3, 2], pulseUnit: "eighth", slots: 22,
    hihat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
    snare: [6, 18], kick: [0, 12, 16], ghost: [2, 10, 14], accents: [0, 6, 12, 18],
    note: "16th-note funk over 3+3+3+2; ghosts thread between the backbeats.",
  },
  {
    id: "om_11_8_halftime_3332", meter: "11/8", name: "11/8 Half-time (3+3+3+2)", style: "ballad", feel: "straight",
    grouping: [3, 3, 3, 2], pulseUnit: "eighth", slots: 22,
    hihat: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20], snare: [12], kick: [0, 18],
    accents: [0, 6, 12, 18],
    note: "One big backbeat on the 3rd group head — spacious half-time 11/8.",
  },
];

// ── Lookups ──────────────────────────────────────────────────────────────

export const ODD_METERS: OddMeter[] = ["3/4", "5/4", "5/8", "7/8", "11/8"];

export function groovesByMeter(meter: OddMeter): OddGroove[] {
  return ODD_GROOVES.filter(g => g.meter === meter);
}

export function getGroove(id: string): OddGroove | undefined {
  return ODD_GROOVES.find(g => g.id === id);
}

// ── ASCII drum-tab renderer ──────────────────────────────────────────────
// Renders a groove as a monospace grid so it can be printed to a practice
// sheet.  Symbols: X = accented hit, x = hit, o = ghost, f = hi-hat foot,
// '|' = group boundary, '·' = empty slot.

export function renderGrooveAscii(g: OddGroove): string {
  const heads = new Set(groupHeadSlots(g.meter, g.grouping));
  const accents = new Set(g.accents ?? []);
  const cell = (slot: number, on: boolean, sym: string, accentSym?: string) =>
    on ? (accentSym && accents.has(slot) ? accentSym : sym) : "·";

  const row = (label: string, hits: number[], sym: string, accentSym?: string) => {
    const set = new Set(hits);
    let line = label.padEnd(5) + "|";
    for (let s = 0; s < g.slots; s++) {
      if (heads.has(s) && s !== 0) line += "|";
      line += cell(s, set.has(s), sym, accentSym) + " ";
    }
    return line.trimEnd() + "|";
  };

  // Count row: number each group head, dots elsewhere on the pulse grid.
  const per = slotsPerPulse(g.meter);
  let count = "".padEnd(5) + " ";
  let pulseNo = 0;
  for (let s = 0; s < g.slots; s++) {
    if (heads.has(s) && s !== 0) count += " ";
    if (s % per === 0) { pulseNo++; count += String(pulseNo % 10) + " "; }
    else count += ". ";
  }

  const lines = [
    `${g.name}   [${g.meter} · ${g.style} · ${g.feel}]   groups ${g.grouping.join("+")}`,
    count.trimEnd(),
    row("Hat", g.hihat, "x", "X"),
    row("Snare", g.snare, "x", "X"),
  ];
  if (g.ghost?.length) lines.push(row("(gst)", g.ghost, "o"));
  lines.push(row("Kick", g.kick, "x", "X"));
  if (g.hhFoot?.length) lines.push(row("HHft", g.hhFoot, "f"));
  if (g.note) lines.push(`  → ${g.note}`);
  return lines.join("\n");
}

export function renderAllGroovesAscii(): string {
  const out: string[] = [];
  for (const m of ODD_METERS) {
    out.push("", `========== ${m} ==========`, "");
    for (const g of groovesByMeter(m)) out.push(renderGrooveAscii(g), "");
  }
  return out.join("\n");
}
