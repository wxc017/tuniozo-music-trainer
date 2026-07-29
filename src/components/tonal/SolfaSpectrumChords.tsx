// ── Sol-fa Spectrum Trainer (Chords + Intervals) ────────────────────
// Shown ONLY in Tonal Audiation when responseMode = "Sol-fa" AND the
// EDO/Spectrum toggle is set to "Spectrum" (per direct user direction).
//
// Model: every playback randomizes pitches to a continuous cents value inside
// their Schulter region (small / center / large band — "any cent or pitch in
// the region", sampled across the whole band and biased away from recent
// picks).  Two modes share the same engine:
//   • CHORDS   — randomize the 12 chromatic pcs once, order a progression with
//     a Markov chain over the chosen romans (diatonic + applied families
//     V/, vii°/, ii-V, TT, and borrowings, exactly like the EDO tab), voice
//     each as triads / closed 7ths (+ 9/11/13, inversions).
//   • INTERVALS — pick from the 12 chromatic intervals + neutral 2/3/6/7 and a
//     note count; each play stacks that many random intervals over the tonic.
// The answer is written in the real Scoring Jianpu editor (embedded, one beat
// per event, 3 voices) and graded per beat on the SET of chromatic pcs — so
// altered degrees (♭3, ♯4, …) check correctly.

import { useCallback, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { REGIONS } from "@/lib/intervalSpectrum";
import { sizedRoman, sizedCode } from "@/lib/chordNotation";
import { generateFunctionalLoop } from "@/lib/musicTheory";
import { audioEngine, AudioEngine, DRONE_INSTRUMENTS, type DroneInstrument } from "@/lib/audioEngine";
import { lsGet, lsSet } from "@/lib/storage";
import { customSolfege } from "@/lib/customSolfege";
import { degreeToEdoStep, edoStepCents, jianpuToPitch } from "@/lib/jianpu";
import JianpuMode from "@/components/JianpuMode";
import SolfegeGamutAside from "@/components/tonal/SolfegeGamutAside";
import PitchTrainer from "@/components/tonal/PitchTrainer";
import EchoTrainer, { type EchoPhrase, type EchoNote } from "@/components/tonal/EchoTrainer";
import SpectrumBandsEditor from "@/components/tonal/SpectrumBandsEditor";
import {
  NoteEntryProject, NoteData, loadProjects, saveProject, SOLFA_ANSWER_PROJECT_ID,
} from "@/lib/noteEntryData";

// Answer editor's EDO — fine enough that "alter" moves WITHIN a region through
// its small/center/large bands (region-centered solfège), instead of jumping a
// semitone to the neighbouring interval (as it would in 12-EDO).
const ANSWER_EDO = 41;
// Largest chord the Show Answer sheet spreads across voices (one tone per voice);
// tones beyond this stack onto the bottom voice.  Matches the jianpu MAX_VOICES.
const MAX_ANSWER_VOICES = 6;
// C4 in Hz — the drone-voice base frequency.  A tone's `abs` is cents from C4
// (freq = C4 · 2^(abs/1200)), so `startRatioDroneVoice` gets ratio = 2^(abs/1200).
const DRONE_BASE_HZ = 261.63;
// Namespace for this trainer's click-to-drone voices, so we only ever tear down
// our own keyed voices and never the host's tonic drone.
const SPEC_DRONE_PREFIX = "specChord:";
// Region-centered solfège syllable (Da / Ra / Ma / Mo / Mu …, octave-reduced)
// for a cents value from the tonic — same table the Solfège chart uses.
const sylOf = (centsFromTonic: number) => customSolfege(((centsFromTonic % 1200) + 1200) % 1200);

interface Props {
  ensureAudio: () => Promise<void>;
  playVol?: number;
  // Optionally lift the root out to the host (Spectrum Audiation links its drone
  // to it).  Controlled when both are provided; otherwise the trainer owns it.
  rootCents?: number;
  onRootCentsChange?: (cents: number) => void;
}

type Mode = "chords" | "intervals" | "sing" | "echo";
type Quality = "major" | "minor";
type ChordShape = "triad" | "seventh";
// Sing chord-generation types the user can pick from.
// Chord SHAPES (the source chords, Almanac-style), grouped by voice count.
// Voicings below are applied to whichever of these are selected.
type ChordType = "triad" | "quartal3" | "cluster3" | "no3" | "no5" | "seventh" | "tbn1" | "tbn2" | "tbn3" | "quartal4" | "cluster4" | "ninth" | "quartal5" | "cluster5" | "eleventh" | "qbn1" | "qbn2" | "qbn3" | "sbn1" | "sbn2" | "sbn3" | "sbn4" | "sbn5" | "sbn6" | "sbn7" | "sbn8" | "cbn1" | "cbn2" | "cbn3";

// ── Over-bass structures (C + a 3-note upper structure) ──────────────────
// A bass note carrying a triad / quartal trichord / 7th-shell / cluster on
// top.  TBN = triad over bass, QBN = quartal over bass, SBN = shell over
// bass, CBN = cluster over bass.  Grouped by family for the compact picker;
// each member carries its degree formula and the upper structure in identity
// order (C-reference note names) — the popup derives the intervals from `up`.
interface OverBassMember { id: ChordType; roman: string; deg: string; up: string[]; name: string; }
interface OverBassFamily { key: string; label: string; color: string; desc: string; members: OverBassMember[]; }
const OVERBASS_FAMILIES: OverBassFamily[] = [
  { key: "TBN", label: "TBN", color: "#79a4ff", desc: "triad over bass", members: [
    { id: "tbn1", roman: "I",   deg: "1·5·7·9",   up: ["G","B","D"], name: "major triad · on the 5th" },
    { id: "tbn2", roman: "II",  deg: "1·7·9·11",  up: ["B","D","F"], name: "diminished triad · on the 7th" },
    { id: "tbn3", roman: "III", deg: "1·9·11·13", up: ["D","F","A"], name: "minor triad · on the 9th" },
  ] },
  { key: "QBN", label: "QBN", color: "#40cfb0", desc: "quartal trichord over bass", members: [
    { id: "qbn1", roman: "I",   deg: "1·3·9·13", up: ["E","A","D"], name: "quartal · on the 3rd" },
    { id: "qbn2", roman: "II",  deg: "1·5·9·13", up: ["A","D","G"], name: "quartal · on the 6th" },
    { id: "qbn3", roman: "III", deg: "1·3·7·13", up: ["B","E","A"], name: "quartal · on the 7th" },
  ] },
  { key: "SBN", label: "SBN", color: "#f0a15b", desc: "7th-shell over bass", members: [
    { id: "sbn1", roman: "I",    deg: "1·3·5·9",   up: ["E","G","D"], name: "min7 shell · 1-♭3-♭7" },
    { id: "sbn2", roman: "II",   deg: "1·3·7·9",   up: ["E","B","D"], name: "min7 shell · 1-5-♭7" },
    { id: "sbn3", roman: "III",  deg: "1·5·9·11",  up: ["G","D","F"], name: "dom7 shell · 1-5-♭7" },
    { id: "sbn4", roman: "IV",   deg: "1·7·9·13",  up: ["B","D","A"], name: "min7 shell · 1-♭3-♭7" },
    { id: "sbn5", roman: "V",    deg: "1·3·11·13", up: ["F","A","E"], name: "maj7 shell · 1-3-7" },
    { id: "sbn6", roman: "VI",   deg: "1·3·5·13",  up: ["A","E","G"], name: "min7 shell · 1-5-♭7" },
    { id: "sbn7", roman: "VII",  deg: "1·5·7·11",  up: ["G","B","F"], name: "dom7 shell · 1-3-♭7" },
    { id: "sbn8", roman: "VIII", deg: "1·7·11·13", up: ["B","F","A"], name: "m7♭5 shell · 1-♭5-♭7" },
  ] },
  { key: "CBN", label: "CBN", color: "#dc86cd", desc: "cluster over bass", members: [
    { id: "cbn1", roman: "I",   deg: "1·3·5·11",  up: ["E","F","G"], name: "cluster · on the 3rd" },
    { id: "cbn2", roman: "II",  deg: "1·5·11·13", up: ["F","G","A"], name: "cluster · on the 4th" },
    { id: "cbn3", roman: "III", deg: "1·5·7·13",  up: ["G","A","B"], name: "cluster · on the 5th" },
  ] },
];
const CHORD_GROUPS: { group: string; items: { id: ChordType; label: string; title: string }[] }[] = [
  { group: "3-PART CHORDS", items: [
    { id: "triad", label: "Triad", title: "TRIAD (1·3·5)" },
    { id: "no5", label: "7th (no 5th)", title: "7th CHORD, NO 5TH (1·3·7)" },
    { id: "no3", label: "7th (no 3rd)", title: "7th CHORD, NO 3RD (1·5·7)" },
    { id: "quartal3", label: "4ths", title: "3-PART 4THS (1·4·7)" },
    { id: "cluster3", label: "Spread Clusters", title: "3-PART SPREAD CLUSTER (1·2·3)" },
  ] },
  { group: "4-PART CHORDS", items: [
    { id: "seventh", label: "7th", title: "SEVENTH (1·3·5·7)" },
    { id: "quartal4", label: "4ths", title: "4-PART 4THS (1·4·7·10)" },
    { id: "cluster4", label: "Spread Clusters", title: "4-PART SPREAD CLUSTER (1·2·3·4)" },
  ] },
  // OVER-BASS gets a bespoke compact picker (family buttons that expand to
  // reveal numbered members with hover popups); the items still live in
  // CHORD_GROUPS so generation + SHAPE_TONES treat them like any other chord.
  { group: "OVER-BASS", items: OVERBASS_FAMILIES.flatMap(f => f.members.map(m => ({
    id: m.id, label: `${f.key} ${m.roman}`, title: `${f.key} ${m.roman} — ${m.name}`,
  }))) },
];
const CHORD_TYPES = CHORD_GROUPS.flatMap(g => g.items);
// Voicings applied to the CLOSED voicing of the selected chords, generated the
// way Goodrick tabulates them: closed + every single & pair "drop" (drop the
// Nth voice(s) from the top down an octave) + the double-drop.  `min` = the
// voice count the voicing needs.
interface VoicingDef { id: string; label: string; drops: number[]; min: number; double?: boolean; spread?: boolean; octave?: boolean; }
const VOICING_TYPES: VoicingDef[] = [
  { id: "close", label: "Closed", drops: [], min: 1 },
  { id: "drop2", label: "Drop 2", drops: [2], min: 2 },
  { id: "drop3", label: "Drop 3", drops: [3], min: 3 },
  { id: "drop23", label: "Drop 2&3", drops: [2, 3], min: 3 },
  { id: "drop24", label: "Drop 2&4", drops: [2, 4], min: 4 },
  { id: "ddrop", label: "Double Drop 2&3", drops: [], min: 3, double: true },
];
// Vol-1 triad spread voicings — their own selector, shown when Triad is picked:
// close, the "spread voicing" (2nd voice up an octave = the 1-5-3 open triad),
// octave-insertion (bass down an octave), and both together.
const TRIAD_VOICINGS: VoicingDef[] = [
  { id: "close", label: "Closed", drops: [], min: 3 },
  { id: "spread", label: "Spread", drops: [], min: 3, spread: true },
  { id: "octave", label: "Octave-Insert", drops: [], min: 3, octave: true },
  { id: "octspread", label: "Spread + Oct", drops: [], min: 3, spread: true, octave: true },
];
// Base close-position tones (scale-step offsets from the bass) for each shape.
// `tob` yields two source chords (TBN I = V-triad/bass, TBN II = vii°-triad/bass).
const SHAPE_TONES: Record<ChordType, { label?: string; offs: number[] }[]> = {
  triad: [{ offs: [0, 2, 4] }],
  quartal3: [{ offs: [0, 3, 6] }],  // 1·4·7 stack of 4ths
  cluster3: [{ offs: [0, 1, 2] }],  // 1·2·3 spread cluster
  no3: [{ offs: [0, 4, 6] }],
  no5: [{ offs: [0, 2, 6] }],
  seventh: [{ offs: [0, 2, 4, 6] }],
  tbn1: [{ offs: [0, 1, 4, 6] }],
  tbn2: [{ offs: [0, 1, 3, 6] }],
  quartal4: [{ offs: [0, 3, 6, 9] }],  // 1·4·7·10 stack of 4ths
  cluster4: [{ offs: [0, 1, 2, 3] }],  // 1·2·3·4 spread cluster
  ninth: [{ offs: [0, 2, 4, 6, 8] }],
  quartal5: [{ offs: [0, 3, 6, 9, 12] }],   // stack of 4ths (≡ quintal set-class)
  cluster5: [{ offs: [0, 1, 2, 3, 4] }],    // 5 adjacent steps (≡ spread cluster)
  eleventh: [{ offs: [0, 2, 4, 6, 8, 10] }],
  // Over-bass structures — octave-reduced close-position pitch-class sets
  // (bass + a 3-note upper structure), scale-step offsets from the bass.
  tbn3: [{ offs: [0, 1, 3, 5] }],   // C-D-F-A  (Dm triad on the 9th)
  qbn1: [{ offs: [0, 1, 2, 5] }],   // C-D-E-A  (quartal on E)
  qbn2: [{ offs: [0, 1, 4, 5] }],   // C-D-G-A  (quartal on A)
  qbn3: [{ offs: [0, 2, 5, 6] }],   // C-E-A-B  (quartal on B)
  sbn1: [{ offs: [0, 1, 2, 4] }],   // C-D-E-G  (Em7 shell, no 5)
  sbn2: [{ offs: [0, 1, 2, 6] }],   // C-D-E-B  (Em7 shell, no 3)
  sbn3: [{ offs: [0, 1, 3, 4] }],   // C-D-F-G  (G7 shell, no 3)
  sbn4: [{ offs: [0, 1, 5, 6] }],   // C-D-A-B  (Bm7 shell, no 5)
  sbn5: [{ offs: [0, 2, 3, 5] }],   // C-E-F-A  (Fmaj7 shell, no 5)
  sbn6: [{ offs: [0, 2, 4, 5] }],   // C-E-G-A  (Am7 shell, no 3)
  sbn7: [{ offs: [0, 3, 4, 6] }],   // C-F-G-B  (G7 shell, no 5)
  sbn8: [{ offs: [0, 3, 5, 6] }],   // C-F-A-B  (B⌀ shell, no 3)
  cbn1: [{ offs: [0, 2, 3, 4] }],   // C-E-F-G  (cluster E-F-G)
  cbn2: [{ offs: [0, 3, 4, 5] }],   // C-F-G-A  (cluster F-G-A)
  cbn3: [{ offs: [0, 4, 5, 6] }],   // C-G-A-B  (cluster G-A-B)
};

// ── Over-bass member chip + hover popup ──────────────────────────────────
// A small toggle (roman numeral) that adds/removes the structure from the
// generation set; hovering pops the scale degrees + the upper structure with
// the interval spacing shown between each note (mirrors the reference sheet).
const OB_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const OB_IVL = ["P8", "m2", "M2", "m3", "M3", "P4", "TT", "P5", "m6", "M6", "m7", "M7"];
const obIvl = (a: string, b: string) => OB_IVL[(((OB_PC[b] - OB_PC[a]) % 12) + 12) % 12];
function ObMemberChip({ m, color, active, onToggle }: {
  m: OverBassMember; color: string; active: boolean; onToggle: () => void;
}) {
  return (
    <span className="relative group inline-flex">
      <button
        onClick={onToggle}
        title={`${m.name} — degrees ${m.deg}`}
        className="px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold border transition-colors"
        style={active
          ? { background: color + "33", borderColor: color, color }
          : { background: "#1a1a1a", borderColor: "#2a2a2a", color: "#9a9a9a" }}
      >
        {m.roman}
      </button>
      <span
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-[60] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        style={{ width: "max-content", maxWidth: 250 }}
      >
        <span className="block rounded-lg border p-3 shadow-2xl text-left"
              style={{ background: "#1c1d24", borderColor: color + "70" }}>
          <span className="block text-[8px] tracking-[0.15em] text-[#8a8a8a] uppercase mb-1">Scale degrees</span>
          <span className="block font-mono text-[17px] font-semibold text-[#e9e7e1] mb-2.5"
                style={{ fontVariantNumeric: "tabular-nums" }}>
            {m.deg.split("·").map((d, i) => (
              <span key={i}>
                {i > 0 && <span className="text-[#555]"> · </span>}
                <span style={i === 0 ? { color: "#d7ac52" } : undefined}>{d}</span>
              </span>
            ))}
          </span>
          <span className="block text-[10px] text-[#9a9a9a]">{m.name}</span>
        </span>
      </span>
    </span>
  );
}

// ── Over-bass reference sheet (keybind: u) ───────────────────────────────
// The full TBN / QBN / SBN / CBN catalogue as a read-only overlay, mirroring
// the gamut (x) and spectrum (z) sheets.  Each row: roman · degrees · upper
// structure with the interval spacing between its notes.
function OverBassSheet() {
  return (
    <div className="bg-[#0c0c0c] border border-[#2a2a2a] rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] font-semibold tracking-widest text-[#8a8a8a]">OVER-BASS STRUCTURES</span>
        <span className="text-[9px] text-[#666] font-mono">C + upper</span>
      </div>
      <p className="text-[10px] text-[#666] mb-3 leading-snug">
        A bass note carrying a three-note upper structure — a triad (TBN), a stack of
        fourths (QBN), a 7th-shell (SBN), or a cluster (CBN). Interval spacing shown
        between the upper notes.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OVERBASS_FAMILIES.map(f => (
          <div key={f.key} className="rounded border p-2.5" style={{ borderColor: f.color + "33" }}>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-[12px] font-bold tracking-wide" style={{ color: f.color }}>{f.label}</span>
              <span className="text-[9px] text-[#777]">{f.desc}</span>
              <span className="ml-auto text-[9px] text-[#555] font-mono">{f.members.length}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {f.members.map(m => (
                <div key={m.id} className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-[10px] font-mono font-bold w-9 shrink-0" style={{ color: f.color }}>{m.roman}</span>
                  <span className="font-mono text-[11.5px] text-[#bbb] tabular-nums" style={{ minWidth: 84 }}>{m.deg}</span>
                  <span className="flex items-center font-mono text-[12px]" style={{ color: f.color }}>
                    {m.up.map((n, i) => (
                      <span key={i} className="inline-flex items-center">
                        {i > 0 && (
                          <span className="mx-1 px-1 py-px rounded-full text-[8px] font-semibold text-[#b0b0b0]"
                                style={{ background: f.color + "1f", border: `1px solid ${f.color}44` }}>
                            {obIvl(m.up[i - 1], n)}
                          </span>
                        )}
                        <span className="font-semibold">{n}</span>
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
// Almanac root cycles (Goodrick) the settings can turn on — chord roots move by
// this interval through the scale (a 2nd … a 7th).
const CYCLE_INTERVALS = [2, 3, 4, 5, 6, 7];
const ROMAN_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"];
// Melodic-line sequence patterns musicians actually drill — each is a short
// "cell" of scale-step offsets, applied from every scale degree ascending until
// the cell would leave the octave.  Stepwise runs are named by grouping size
// ("in 3/4/5"); the rest by their interval contour.  (Scale "in 3rds/4ths…"
// lives separately.)
// Each cell is sequenced up the scale from every degree.  Grouped so the label
// families read clearly rather than as one lumped list.
const PATTERN_GROUPS: { title: string; items: { label: string; cell: number[] }[] }[] = [
  // Two-note cells are labelled by the FULL repeating figure (the leap inside the
  // cell, then the step to the next cell); longer cells are labelled by the cell.
  { title: "STEPWISE GROUPS", items: [
    { label: "In 3",   cell: [0, 1, 2] },
    { label: "In 4",   cell: [0, 1, 2, 3] },
    { label: "In 5",   cell: [0, 1, 2, 3, 4] },
    { label: "In 6",   cell: [0, 1, 2, 3, 4, 5] },
    { label: "In 7",   cell: [0, 1, 2, 3, 4, 5, 6] },
    { label: "In 3 ↓", cell: [2, 1, 0] },
    { label: "In 4 ↓", cell: [3, 2, 1, 0] },
    { label: "In 5 ↓", cell: [4, 3, 2, 1, 0] },
  ] },
  { title: "UP & BACK", items: [
    { label: "1·2·3·4·3·2", cell: [0, 1, 2, 3, 2, 1] },
    { label: "1·2·3·2",     cell: [0, 1, 2, 1] },
    { label: "1·2·1",       cell: [0, 1, 0] },
    { label: "1·2·3·1",     cell: [0, 1, 2, 0] },
    { label: "3·2·1·2",     cell: [2, 1, 0, 1] },
    { label: "1·2·3·4·5·4·3·2", cell: [0, 1, 2, 3, 4, 3, 2, 1] },
  ] },
  // (the simple ascending pairs 3rd↑2nd↓ … 7th↑6th↓ moved to Scale-in-Intervals)
  { title: "BROKEN INTERVALS", items: [
    { label: "3rd↓ 4th↑", cell: [2, 0] },
    { label: "4th↓ 5th↑", cell: [3, 0] },
    { label: "3rd↑ 3rd↑ 3rd↓", cell: [0, 2, 4, 2] },
    { label: "3rd↑ 3rd↓ (1·3·1)", cell: [0, 2, 0] },
    { label: "3rd↑ 2nd↓ 3rd↑ (1·3·2·4)", cell: [0, 2, 1, 3] },
  ] },
  { title: "DIGITAL CELLS (Coker)", items: [
    { label: "1·2·3·5", cell: [0, 1, 2, 4] },
    { label: "1·2·4·5", cell: [0, 1, 3, 4] },
    { label: "1·3·4·5", cell: [0, 2, 3, 4] },
    { label: "1·3·5·4", cell: [0, 2, 4, 3] },
    { label: "1·2·4·3", cell: [0, 1, 3, 2] },
    { label: "1·4·3·2", cell: [0, 3, 2, 1] },
    { label: "1·3·2·5", cell: [0, 2, 1, 4] },
    { label: "1·2·5·3", cell: [0, 1, 4, 2] },
    { label: "1·5·4·3", cell: [0, 4, 3, 2] },
    { label: "3·2·1·5", cell: [2, 1, 0, 4] },
    { label: "5·3·2·1", cell: [4, 2, 1, 0] },
  ] },
  // Triadic cells — arpeggio shapes sequenced up the scale (distinct from the
  // Angular spread arpeggios, which leap across octaves).
  { title: "TRIADIC CELLS", items: [
    { label: "1·3·5·8", cell: [0, 2, 4, 7] },
    { label: "1·3·5·3·1", cell: [0, 2, 4, 2, 0] },
    { label: "5·3·1 (↓ triad)", cell: [4, 2, 0] },
    // ("1·5·3 spread" moved to Angular · Spread Arps)
  ] },
];
// Repeat a cell of scale-step offsets from ascending roots (octave dots show the
// range) — used for the angular intervallic lines that leap beyond one octave.
const cellRun = (cell: number[], reps: number): number[] => {
  const s: number[] = [];
  for (let r = 0; r < reps; r++) for (const o of cell) s.push(r + o);
  return s;
};
// Angular / intervallic melodic material (fourths, triad pairs, wide leaps) — the
// modern-line vocabulary, kept in its own section apart from the scalar patterns.
// Curated angular / intervallic melodic material — modern-line vocabulary of
// leaps that a singer actually gets mileage from. Titles are uniform:
// "<interval contour> (<degree list>)".  Anything that just duplicated the
// scalar interval runs (4th/5th pairs, stacked quartal/quintal LINES) lives in
// Scale-in-Intervals, not here.
const ANGULAR_GROUPS: { title: string; items: { label: string; steps: number[] }[] }[] = [
  { title: "ANGULAR · QUARTAL / QUINTAL", items: [
    { label: "4th↑ 4th↑ (1·4·7)",        steps: cellRun([0, 3, 6], 4) },
    { label: "4th↑ 4th↑ 4th↑ (1·4·7·10)", steps: cellRun([0, 3, 6, 9], 3) },
    { label: "4th↑ 4th↑ 4th↓ (1·4·7·4)", steps: cellRun([0, 3, 6, 3], 4) },
    { label: "4th↑ 4th↑ 2nd↓ (1·4·7·6)", steps: cellRun([0, 3, 6, 5], 4) },
    { label: "4th↑ 4th↑ 3rd↑ (1·4·7·9)", steps: cellRun([0, 3, 6, 8], 4) },
    { label: "4th↑ 4th↑ 3rd↓ (1·4·7·5)", steps: cellRun([0, 3, 6, 4], 4) },
    { label: "5th↑ 5th↑ (1·5·9)",        steps: cellRun([0, 4, 8], 3) },
  ] },
  { title: "ANGULAR · WIDE LEAPS", items: [
    { label: "5th↑ 4th↓ (1·5·2)",        steps: cellRun([0, 4, 1], 5) },
    { label: "6th↑ 4th↓ (1·6·3)",        steps: cellRun([0, 5, 2], 5) },
    { label: "7th↑ 5th↓ (1·7·3)",        steps: cellRun([0, 6, 2], 5) },
    { label: "5th↑ 4th↓ 5th↑ (1·5·2·6)", steps: cellRun([0, 4, 1, 5], 3) },
    { label: "6th↑ 5th↓ (1·6·2·7)",      steps: cellRun([0, 5, 1, 6], 4) },
    { label: "5th↑ 4th↑ 4th↓ (1·5·8·5)", steps: cellRun([0, 4, 7, 4], 3) },
  ] },
  { title: "ANGULAR · LEAP + STEP", items: [
    { label: "5th↑ 2nd↓ (1·5·4)",        steps: cellRun([0, 4, 3], 5) },
    { label: "6th↑ 3rd↓ (1·6·4)",        steps: cellRun([0, 5, 3], 5) },
    { label: "6th↑ 2nd↓ (1·6·5)",        steps: cellRun([0, 5, 4], 5) },
    { label: "7th↑ 2nd↓ (1·7·6)",        steps: cellRun([0, 6, 5], 4) },
    { label: "3rd↑ 6th↑ (1·3·8)",        steps: cellRun([0, 2, 7], 4) },
  ] },
  { title: "ANGULAR · OCTAVE DISPLACED", items: [
    { label: "8ve↑ 4th↓ (1·8·5)",        steps: cellRun([0, 7, 4], 4) },
    { label: "8ve↑ 5th↓ (1·8·4)",        steps: cellRun([0, 7, 3], 4) },
    { label: "8ve displaced (1·8·2·9)",  steps: cellRun([0, 7, 1, 8], 3) },
    { label: "7th zigzag (1·7·2·8)",     steps: cellRun([0, 6, 1, 7], 3) },
  ] },
  { title: "ANGULAR · SPREAD ARPS", items: [
    { label: "spread △7 (1·5·3·7)",      steps: cellRun([0, 4, 2, 6], 3) },
    { label: "spread △7 (1·5·7·3)",      steps: cellRun([0, 4, 6, 2], 3) },
    { label: "spread triad (1·5·3)",     steps: cellRun([0, 4, 2], 5) },
    { label: "spread add9 (1·3·5·9)",    steps: cellRun([0, 2, 4, 8], 3) },
  ] },
  { title: "ANGULAR · WEDGES", items: [
    { label: "wedge in (1·8·2·7·3·6·4·5)",  steps: [0, 7, 1, 6, 2, 5, 3, 4] },
    { label: "wedge out (4·5·3·6·2·7·1·8)", steps: [3, 4, 2, 5, 1, 6, 0, 7] },
  ] },
];
// Voicing spread applied to a close-position chord.
type Voicing = "close" | "open" | "drop2" | "drop3" | "drop23" | "drop24";
const VOICINGS: { id: Voicing; label: string }[] = [
  { id: "close", label: "Close" }, { id: "open", label: "Open" },
  { id: "drop2", label: "Drop 2" }, { id: "drop3", label: "Drop 3" },
  { id: "drop23", label: "Drop 2&3" }, { id: "drop24", label: "Drop 2&4" },
];
// Voice a close chord (chromatic offsets from tonic).  Drops move the Nth voice
// from the TOP down an octave; open spreads the triad (2nd-from-bottom up 8ve).
function applyVoicing(offsets: number[], v: Voicing): number[] {
  if (v === "close") return offsets;
  if (v === "open") {
    const asc = [...offsets].sort((a, b) => a - b);
    if (asc.length >= 3) asc[1] += 12;   // 1-5-3 style spread
    return asc;
  }
  const drops = v === "drop2" ? [2] : v === "drop3" ? [3] : v === "drop23" ? [2, 3] : [2, 4];
  const desc = [...offsets].sort((a, b) => b - a);   // top → bottom
  for (const n of drops) if (n - 1 < desc.length) desc[n - 1] -= 12;
  return desc;
}
type Band = 0 | 1 | 2;            // 0 = small, 1 = center, 2 = large

const BAND_LABELS = ["small", "center", "large"] as const;
// Colour per band so the spectrum reads as a low → mid → high gradient.
const BAND_COLORS = ["#3f9bc4", "#7173e6", "#e0a040"] as const;   // small / center / large
// ── EDO band system ─────────────────────────────────────────────────
// Alternative to small/center/large: the three slots become fixed EDO tunings.
// Each renders the SAME diatonic scale as a proper MOS generated by that
// tuning's fifth (NOT a nearest-step snap of each interval), so the third's
// size is whatever the generating fifth makes it.  Ordered by that third size
// so the slots still read small → centre → large:
//   50-EDO  meantone   generator 29\50 (696¢) → major 3rd ~384¢  (small)
//   12-EDO             generator  7\12 (700¢) → major 3rd 400¢   (centre)
//   39-EDO  superpyth  generator 23\39 (708¢) → major 3rd ~431¢  (large)
type BandSystem = "spectrum" | "edo";
type EdoTuning = { edo: number; gen: number };   // gen = generating fifth, in EDO steps
const BAND_TUNINGS: readonly EdoTuning[] = [
  { edo: 50, gen: 29 },   // small  — meantone
  { edo: 12, gen: 7 },    // centre — 12-TET
  { edo: 39, gen: 23 },   // large  — superpyth
] as const;
const BAND_EDO_LABELS = BAND_TUNINGS.map(t => String(t.edo));   // slot → button text
const BAND_SYSTEM_KEY = "lt_spectrumBandSystem";
// Each chromatic pitch-class's position on the chain of fifths (meantone
// spelling): Do=0, Sol=+1, Re=+2, La=+3, Mi=+4, Ti=+5, Fi=+6; Fa=−1, Te=−2,
// Me=−3, Le=−4, Ra=−5.  Stacking the GENERATING fifth this many times makes a
// proper diatonic MOS — which is why 39-EDO keeps its large 3rd.
const FIFTHS_FOR_PC = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5] as const;
// Diatonic-MOS cents of pitch-class `pc` in a tuning: walk `pc`'s fifths from
// the tonic using the tuning's GENERATING fifth, then octave-reduce.  pc 4
// (+4 fifths) → ~431¢ in 39-EDO (large), ~384¢ in 50-EDO (small), 400¢ in 12.
const mosCents = (pc: number, t: EdoTuning): number => {
  const p = ((pc % 12) + 12) % 12;
  const step = (((FIFTHS_FOR_PC[p] * t.gen) % t.edo) + t.edo) % t.edo;
  return step * (1200 / t.edo);
};
const QUALITIES: Quality[] = ["major", "minor"];

// The MODE a scale is drawn from (Mathieu's thirds-direction: Lydian brightest …
// Locrian darkest).  "amb" uses the NEUTRAL regions, committing to neither major
// nor minor — universal.
type ModeId = string;

// ── Sing mode ───────────────────────────────────────────────────────
// One generation makes ONE section per selected spectrum band (small / center /
// large), each holding the same set of exercises re-tuned to that band: the
// scale, the scale in 3rds/4ths/5ths/6ths, useful melodic patterns, the stacked-
// thirds run, and every diatonic chord in a few piano voicings.  Notes carry an
// octave (dot notation) so patterns can range above/below the tonic.
interface SingNote { syl: string; abs: number; oct: number; cents: number; root?: boolean; }
type SingSeq =
  | { kind: "line"; label: string; notes: SingNote[]; steps?: number[] }
  | { kind: "chords"; label: string; chords: { label?: string; tones: SingNote[]; borrowed?: boolean }[]; mi?: boolean };
type SingCat = "scalar" | "chords" | "cycles";
// Sub-categories within the Scalar tab (own sub-tab bar) so it isn't one long list.
type ScalarSub = "scale" | "patterns" | "pentatonic" | "blues" | "angular" | "chromatic" | "resolution" | "triadpairs";
const SCALAR_SUBS: { id: ScalarSub; label: string }[] = [
  { id: "scale", label: "Scale" }, { id: "patterns", label: "Patterns" }, { id: "pentatonic", label: "Pentatonic" },
  { id: "angular", label: "Angular" }, { id: "chromatic", label: "Chromatic" }, { id: "resolution", label: "Resolution" },
  { id: "triadpairs", label: "Triad Pairs" },
];
interface SingGroup { title: string; seqs: SingSeq[]; cat: SingCat; sub?: ScalarSub; parent?: string; }
interface SingSection { band: Band; mode: ModeId; scaleLabel: string; scale: SingNote[]; rawScale: number[]; groups: SingGroup[]; }

// Modes defined by REGION NAME per scale degree (index 0 = tonic), so "amb" can
// use the NEUTRAL regions.  Brightest → darkest.
const RG = {
  m2: "Minor Seconds", n2: "Neutral Seconds", M2: "Major Seconds",
  m3: "Minor Thirds", n3: "Neutral Thirds", M3: "Major Thirds",
  P4: "Perfect Fourths", TT: "Tritonic Region", P5: "Perfect Fifths",
  m6: "Minor Sixths", n6: "Neutral Sixths", M6: "Major Sixths",
  m7: "Minor Sevenths", n7: "Neutral Sevenths", M7: "Major Sevenths",
};
// Region name → the chromatic pitch-class it centres on (for the 12-note scale).
const REGION_PC: Record<string, number> = {
  [RG.m2]: 1, [RG.M2]: 2, [RG.m3]: 3, [RG.M3]: 4, [RG.P4]: 5, [RG.TT]: 6,
  [RG.P5]: 7, [RG.m6]: 8, [RG.M6]: 9, [RG.m7]: 10, [RG.M7]: 11,
  // Neutral regions need slots too.  Without them every neutral degree fell back
  // to `?? 0` (chords) or `?? d` (chroma) — so a scale with a neutral 6th collided
  // with the perfect 4th and the whole mode generated wrong.  The slot only picks
  // WHICH chroma bin holds the degree; the actual cents come from the region band,
  // so a neutral 3rd parks in the m3 bin but still sounds at ~350¢.
  [RG.n2]: 1, [RG.n3]: 3, [RG.n6]: 8, [RG.n7]: 10,
};
const MODES: { id: ModeId; label: string; short: string; regions: string[]; sym?: number[]; arp?: number[] }[] = [
  { id: "amb", label: "Ambiguous",  short: "~",   regions: ["", RG.n2, RG.n3, RG.P4, RG.P5, RG.n6, RG.n7] },
  { id: "lyd", label: "Lydian",     short: "lyd", regions: ["", RG.M2, RG.M3, RG.TT, RG.P5, RG.M6, RG.M7] },
  { id: "maj", label: "Major",      short: "maj", regions: ["", RG.M2, RG.M3, RG.P4, RG.P5, RG.M6, RG.M7] },
  { id: "mix", label: "Mixolydian", short: "mix", regions: ["", RG.M2, RG.M3, RG.P4, RG.P5, RG.M6, RG.m7] },
  { id: "dor", label: "Dorian",     short: "dor", regions: ["", RG.M2, RG.m3, RG.P4, RG.P5, RG.M6, RG.m7] },
  { id: "min", label: "Minor",      short: "min", regions: ["", RG.M2, RG.m3, RG.P4, RG.P5, RG.m6, RG.m7] },
  { id: "phr", label: "Phrygian",   short: "phr", regions: ["", RG.m2, RG.m3, RG.P4, RG.P5, RG.m6, RG.m7] },
  { id: "loc", label: "Locrian",    short: "loc", regions: ["", RG.m2, RG.m3, RG.P4, RG.TT, RG.m6, RG.m7] },
  // ── Melodic minor and its modes ──
  { id: "melmin", label: "Melodic Min", short: "mm",  regions: ["", RG.M2, RG.m3, RG.P4, RG.P5, RG.M6, RG.M7] },
  { id: "dorb2",  label: "Dorian ♭2",   short: "dor♭2", regions: ["", RG.m2, RG.m3, RG.P4, RG.P5, RG.M6, RG.m7] },
  { id: "lydaug", label: "Lydian Aug",  short: "lyd+", regions: ["", RG.M2, RG.M3, RG.TT, RG.m6, RG.M6, RG.M7] },
  { id: "lyddom", label: "Lydian Dom",  short: "lyd♭7", regions: ["", RG.M2, RG.M3, RG.TT, RG.P5, RG.M6, RG.m7] },
  { id: "mixb6",  label: "Mixo ♭6",     short: "mix♭6", regions: ["", RG.M2, RG.M3, RG.P4, RG.P5, RG.m6, RG.m7] },
  { id: "locn2",  label: "Locrian ♮2",  short: "loc♮2", regions: ["", RG.M2, RG.m3, RG.P4, RG.TT, RG.m6, RG.m7] },
  { id: "alt",    label: "Altered",     short: "alt", regions: ["", RG.m2, RG.m3, RG.M3, RG.TT, RG.m6, RG.m7] },
  // ── Harmonic minor and its useful modes ──
  { id: "harmmin",  label: "Harmonic Min", short: "hm",   regions: ["", RG.M2, RG.m3, RG.P4, RG.P5, RG.m6, RG.M7] },
  { id: "phrygdom", label: "Phrygian Dom", short: "phr♮3", regions: ["", RG.m2, RG.M3, RG.P4, RG.P5, RG.m6, RG.m7] },
  { id: "ukrdor",   label: "Ukr. Dorian",  short: "dor♯4", regions: ["", RG.M2, RG.m3, RG.TT, RG.P5, RG.M6, RG.m7] },
  { id: "lyds2",    label: "Lydian ♯2",    short: "lyd♯2", regions: ["", RG.m3, RG.M3, RG.TT, RG.P5, RG.M6, RG.M7] },
  // ── Symmetric scales — not 7-region MOS, so `regions` is a placeholder (only
  // used by the diatonic apparatus, which these skip) and `sym` holds the actual
  // pc scale.  `arp` is the characteristic arpeggio (aug triad / dim7). ──
  { id: "wholetone", label: "Whole-Tone",  short: "WT",   regions: ["", RG.M2, RG.M3, RG.P4, RG.P5, RG.M6, RG.M7], sym: [0, 2, 4, 6, 8, 10],       arp: [0, 2, 4] },
  { id: "augment6",  label: "Augmented",   short: "aug",  regions: ["", RG.M2, RG.M3, RG.P4, RG.P5, RG.M6, RG.M7], sym: [0, 3, 4, 7, 8, 11],       arp: [0, 2, 4] },
  { id: "octWH",     label: "Octatonic °",  short: "oct°", regions: ["", RG.M2, RG.M3, RG.P4, RG.P5, RG.M6, RG.M7], sym: [0, 2, 3, 5, 6, 8, 9, 11], arp: [0, 2, 4, 6] },
  { id: "octHW",     label: "Octatonic 7",  short: "oct7", regions: ["", RG.M2, RG.M3, RG.P4, RG.P5, RG.M6, RG.M7], sym: [0, 1, 3, 4, 6, 7, 9, 10], arp: [0, 2, 4, 6] },
  // ── Maqamat — the scales the NEUTRAL regions actually exist for.  Given in
  // their common ascending forms (maqam intonation varies by region and by
  // performer; the neutral degrees here sit in the Schulter neutral bands rather
  // than at an exact 24-EDO quarter-tone).
  //   Rast   0 · 200 · ~350 · 500 · 700 · 900 · ~1050   (neutral 3rd & 7th)
  //   Bayati 0 · ~150 · 300 · 500 · 700 · 800 · 1000    (neutral 2nd)
  //   Sikah  0 · ~150 · ~350 · 500 · 700 · ~850 · ~1050 (neutral 2nd/3rd/6th/7th)
  //   Huzam  0 · ~150 · ~350 · 500 · 700 · 800 · 1100   (Sikah with a hijaz upper)
  { id: "rast",  label: "Rast",   short: "rast",  regions: ["", RG.M2, RG.n3, RG.P4, RG.P5, RG.M6, RG.n7] },
  { id: "bayati", label: "Bayati", short: "bayati", regions: ["", RG.n2, RG.m3, RG.P4, RG.P5, RG.m6, RG.m7] },
  { id: "sikah", label: "Sikah",  short: "sikah", regions: ["", RG.n2, RG.n3, RG.P4, RG.P5, RG.n6, RG.n7] },
  { id: "huzam", label: "Huzam",  short: "huzam", regions: ["", RG.n2, RG.n3, RG.P4, RG.P5, RG.m6, RG.M7] },
];
const MODE_BY_ID = new Map(MODES.map(m => [m.id, m]));
// Each mode's CHARACTERISTIC tone — the semitone-from-tonic that gives the mode
// its colour (Lydian's ♯4, Mixolydian's ♭7, Dorian's ♮6, …).  Modal-interchange
// chords are built to feature this tone even at small part-counts, so a 3-part
// Lydian reads 1·3·♯4 rather than a plain 1·3·5 (which would be indistinguishable
// from major).  (amb has none.)
const CHAR_SEMI: Record<string, number> = {
  lyd: 6, maj: 11, mix: 10, dor: 9, min: 8, phr: 1, loc: 6,
  melmin: 9, lyddom: 6, mixb6: 8, dorb2: 1, locn2: 6, alt: 6, lydaug: 8,
  harmmin: 11, phrygdom: 1, ukrdor: 6, lyds2: 3,
  // Maqamat — the neutral degree IS the colour tone.
  rast: 3, bayati: 1, sikah: 3, huzam: 3,
};
const COLOR_MODES = MODES.filter(m => m.id !== "amb");   // selectable colours (amb = deselected)
// Modes grouped by parent scale (brightest → darkest within each) so the picker
// reads as three tidy families instead of one long jarring row.
const MODE_FAMILIES: { label: string; ids: ModeId[] }[] = [
  { label: "Church",       ids: ["lyd", "maj", "mix", "dor", "min", "phr", "loc"] },
  { label: "Melodic min",  ids: ["melmin", "lyddom", "mixb6", "dorb2", "locn2", "alt", "lydaug"] },
  { label: "Harmonic min", ids: ["harmmin", "phrygdom", "ukrdor", "lyds2"] },
  { label: "Symmetric",    ids: ["wholetone", "augment6", "octWH", "octHW"] },
  { label: "Maqam",        ids: ["rast", "bayati", "sikah", "huzam"] },
];
// A degree's sub-band [lo,hi] for a region, tolerating regions without the
// small/center/large split (neutral regions) by using their full span.
const REGION_ANY = new Map(REGIONS.map(r => [r.name, r]));
// Minimum cents between two bands' sampled pitches.  The sub-bands are ADJACENT
// (Major Thirds: small 372-394 · middle 394-406 · large 406-440), so sampling
// uniformly across each lets a small pick at 393 sit 2¢ from a centre pick at
// 395 — inaudible.  ~15¢ is the practical floor for hearing two versions of the
// SAME interval as different sizes (it's the 5/4 = 386 vs 12-TET = 400 gap, which
// is clearly audible); melodic interval JND is ~15-25¢ for most listeners, and
// only sustained dyads (beating) resolve finer than that.
const MIN_BAND_GAP = 15;
// Pick-window for one band: centred on the sub-band, widened as far as it can go
// while still leaving MIN_BAND_GAP to BOTH neighbours.  Narrow sub-bands collapse
// toward a point rather than bleeding into the neighbour.
const bandWindow = (r: { lo: number; hi: number; subs?: { lo: number; hi: number }[] }, band: Band): [number, number] => {
  if (!r.subs || r.subs.length !== 3) return [r.lo, r.hi];
  const mid = r.subs.map(s => (s.lo + s.hi) / 2);
  let jitter = Infinity;
  for (let i = 1; i < 3; i++) jitter = Math.min(jitter, (mid[i] - mid[i - 1] - MIN_BAND_GAP) / 2);
  const s = r.subs[band];
  const half = Math.max(0, Math.min(jitter, (s.hi - s.lo) / 2));
  return [mid[band] - half, mid[band] + half];
};
// EDO mode collapses a region to a single point: `pc`'s diatonic-MOS pitch in
// the tuning `t` (a zero-width window, so the downstream random pick returns it
// exactly).  Spectrum mode falls through to the sub-band window.
const regionBand = (name: string, band: Band, t?: EdoTuning): [number, number] => {
  if (t) { const pc = REGION_PC[name]; if (pc != null) { const c = mosCents(pc, t); return [c, c]; } }
  const r = REGION_ANY.get(name);
  if (!r) return [0, 0];
  return bandWindow(r, band);
};

// Chromatic pitch-class (0-11 from tonic) → interval region.
const PC_REGION: (string | null)[] = [
  null, "Minor Seconds", "Major Seconds", "Minor Thirds", "Major Thirds",
  "Perfect Fourths", "Tritonic Region", "Perfect Fifths", "Minor Sixths",
  "Major Sixths", "Minor Sevenths", "Major Sevenths",
];

const SCALE_PC: Record<Quality, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};
const INTERVAL_NAMES = ["Unison", "2nd", "3rd", "4th", "5th", "6th", "7th"];

const ROMANS: Record<Quality, string[]> = {
  major: ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
  minor: ["i", "ii°", "III", "iv", "v", "VI", "VII"],
};
const ROMAN_ROOT: Record<Quality, Record<string, number>> = {
  major: { I: 0, ii: 1, iii: 2, IV: 3, V: 4, vi: 5, "vii°": 6 },
  minor: { i: 0, "ii°": 1, III: 2, iv: 3, v: 4, VI: 5, VII: 6 },
};

// Per-chord approach kinds, exactly the EDO tab's card sub-buttons.  Each
// targets a diatonic degree → an applied Markov label (e.g. secdom + ii = V/ii).
type Kind = "secdom" | "secdim" | "iiV" | "TT";
const KINDS: Kind[] = ["secdom", "secdim", "iiV", "TT"];
const KIND_PREFIX: Record<Kind, string> = { secdom: "V/", secdim: "vii°/", iiV: "ii/", TT: "TT/" };
const KIND_SHORT: Record<Kind, string> = { secdom: "V/", secdim: "vii°/", iiV: "ii–V", TT: "TT" };
const APPROACH_COLORS: Record<Kind, string> = { secdom: "#c77a4a", secdim: "#a86bb8", iiV: "#4a9ac7", TT: "#c7a14a" };
// Major-context target token by scale degree (0-6), used to build applied labels.
const CARD_TOKENS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const ACCENT = "#7173e6";
// ── Practice logbook ────────────────────────────────────────────────
// One entry per PATTERN (band-independent: the same exercise across the small /
// center / large columns shares an entry).  `status` cycles unset → complete →
// WIP → failure; `bands` records which spectrum bands you've actually worked.
const LOG_KEY = "tunizo:patternLog:v1";
type LogEntry = { cat: string; group: string; label: string; status: number; bands: [boolean, boolean, boolean]; day: string; ts: number };
const LOG_STATUS_COLORS = ["#2f2f2f", "#4c9a5a", "#d8a83c", "#c9524d"];   // unset · complete · WIP · failure
const LOG_STATUS_NAMES = ["unset", "complete", "WIP", "failure"];
const loadPatternLog = (): Record<string, LogEntry> => {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || "{}") as Record<string, LogEntry>; } catch { return {}; }
};
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// Distinct tint for modal-interchange (A/B borrowed) rows & cards — a warm amber
// so the recolored chords read apart from the cool-purple diatonic ones.
const MI_TINT = "#d08a3a";
// Global harmonization voices — a parallel line a diatonic 3rd/4th/5th up/down
// (in SCALE STEPS, so it stays in the mode).  3rd = 2 steps, 4th = 3, 5th = 4.
type HarmId = "3u" | "3d" | "4u" | "4d" | "5u" | "5d";
const HARMS: { id: HarmId; label: string; delta: number }[] = [
  { id: "3u", label: "3rd↑", delta: 2 }, { id: "3d", label: "3rd↓", delta: -2 },
  { id: "4u", label: "4th↑", delta: 3 }, { id: "4d", label: "4th↓", delta: -3 },
  { id: "5u", label: "5th↑", delta: 4 }, { id: "5d", label: "5th↓", delta: -4 },
];
const WALK_COLOR = "#4a9ac7";
const HARM_COLOR = "#5aa06a";   // harmonization voices — green, apart from base & MI
// Lowest cents-above-tonic a voiced chord tone may sit at (tonic = C3), so drops
// can't sink a tone into the sub-bass where a sampled drone just rumbles.
const VOICE_FLOOR_CENTS = -1200;

// Common modal-interchange borrowings (from the parallel minor + modes), each
// as a chromatic root pc + triad quality — mirrors the EDO tab's Modal
// Interchange level.  Ordered/starred like the EDO tab.
type ChQ = "maj" | "min" | "dim" | "hdim";
const BORROWED: Record<string, { rootPc: number; kind: ChQ }> = {
  iv: { rootPc: 5, kind: "min" },
  bVII: { rootPc: 10, kind: "maj" },
  bVI: { rootPc: 8, kind: "maj" },
  bIII: { rootPc: 3, kind: "maj" },
  bII: { rootPc: 1, kind: "maj" },      // Neapolitan
  "ii°": { rootPc: 2, kind: "dim" },
  iiø: { rootPc: 2, kind: "hdim" },
  v: { rootPc: 7, kind: "min" },
  II: { rootPc: 2, kind: "maj" },
  bV: { rootPc: 6, kind: "maj" },
};
const BORROWED_ORDER = ["iv", "bVII", "bVI", "bIII", "bII", "ii°", "iiø", "v", "II", "bV"];
const TRIAD_OFFS: Record<ChQ, number[]> = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], hdim: [0, 3, 6] };
const SEVENTH_OFF: Record<ChQ, number> = { maj: 11, min: 10, dim: 9, hdim: 10 };

// Interval-mode options: 11 chromatic + 4 neutral.  `pc` is the nearest
// chromatic class used for grading.
const INTERVALS: { id: string; label: string; region: string; pc: number }[] = [
  { id: "m2", label: "Minor 2nd", region: "Minor Seconds", pc: 1 },
  { id: "M2", label: "Major 2nd", region: "Major Seconds", pc: 2 },
  { id: "m3", label: "Minor 3rd", region: "Minor Thirds", pc: 3 },
  { id: "M3", label: "Major 3rd", region: "Major Thirds", pc: 4 },
  { id: "P4", label: "Perfect 4th", region: "Perfect Fourths", pc: 5 },
  { id: "TT", label: "Tritone", region: "Tritonic Region", pc: 6 },
  { id: "P5", label: "Perfect 5th", region: "Perfect Fifths", pc: 7 },
  { id: "m6", label: "Minor 6th", region: "Minor Sixths", pc: 8 },
  { id: "M6", label: "Major 6th", region: "Major Sixths", pc: 9 },
  { id: "m7", label: "Minor 7th", region: "Minor Sevenths", pc: 10 },
  { id: "M7", label: "Major 7th", region: "Major Sevenths", pc: 11 },
  { id: "n2", label: "Neutral 2nd", region: "Neutral Seconds", pc: 2 },
  { id: "n3", label: "Neutral 3rd", region: "Neutral Thirds", pc: 3 },
  { id: "n6", label: "Neutral 6th", region: "Neutral Sixths", pc: 8 },
  { id: "n7", label: "Neutral 7th", region: "Neutral Sevenths", pc: 10 },
];
const INTERVAL_BY_ID = new Map(INTERVALS.map(i => [i.id, i]));

// Quick-pick presets for the common dyads — each selects its interval id(s) so
// the trainer stacks that dyad over the tonic (use with "at once" = 2).
const DYAD_PRESETS: { label: string; ids: string[] }[] = [
  { label: "3rds", ids: ["m3", "M3"] },
  { label: "4ths", ids: ["P4"] },
  { label: "5ths", ids: ["P5"] },
  { label: "6ths", ids: ["m6", "M6"] },
];

// Main interval regions (with small/center/large sub-bands) for the per-interval
// spectrum strips.
const MAIN_REGIONS = REGIONS.filter(r => r.kind === "main" && r.subs && r.subs.length === 3);
const regionForCents = (cents: number) => {
  const c = ((cents % 1200) + 1200) % 1200;
  return MAIN_REGIONS.find(r => c >= r.lo && c <= r.hi) ?? null;
};
// Sub-band (0 small · 1 center · 2 large) of a cents value, per the APP's own
// region sub-bands — the authoritative split the spectrum strips use.  (sizedCode
// classifies with different thresholds, so a center note there can read "small".)
const subBandOf = (centsFromTonic: number): number => {
  const c = ((centsFromTonic % 1200) + 1200) % 1200;
  const r = MAIN_REGIONS.find(rg => c >= rg.lo && c <= rg.hi);
  if (!r?.subs) return 1;
  const i = r.subs.findIndex(s => c >= s.lo - 0.01 && c <= s.hi + 0.01);
  return i < 0 ? 1 : Math.min(i, 2);
};
// Sized Roman numeral with the band arrow taken from the ACTUAL sub-band (↓ small ·
// bare center · ↑ large) — so a center major-3rd root reads "III", not "↓III".
const romanBandArrow = (centsFromTonic: number): string => {
  const c = ((centsFromTonic % 1200) + 1200) % 1200;
  const base = sizedRoman(c).replace(/^[sl]/, "");   // quality/degree only (drop sizedCode's size letter)
  const b = subBandOf(c);
  return (b === 0 ? "↓" : b === 2 ? "↑" : "") + base;
};
// Roman numeral for a chord on SCALE DEGREE `dd` of a mode.  Derived from the
// degree's position (not the raw interval size) — that's the only way a tritone
// root reads "♯iv°" rather than being mistaken for a small fifth ("V").  The
// accidental compares the degree against the major scale, the case/symbol come
// from the chord's own 3rd & 5th, and the arrow marks the root's spectrum band.
const MAJOR_REF = [0, 2, 4, 5, 7, 9, 11];
const ROMAN_UP = ["I", "II", "III", "IV", "V", "VI", "VII"];
const romanForDegree = (mSemis: number[], dd: number, chordSemis: number[], rootCents: number): string => {
  const alt = mSemis[dd] - MAJOR_REF[dd];
  const acc = alt === -1 ? "♭" : alt === 1 ? "♯" : alt === -2 ? "♭♭" : alt === 2 ? "♯♯" : "";
  const root = chordSemis[0];
  const iv = (n: number) => ((n - root) % 12 + 12) % 12;
  const third = iv(chordSemis[1] ?? root + 4);
  const fifth = iv(chordSemis[2] ?? root + 7);
  const seventh = chordSemis.length > 3 ? iv(chordSemis[3]) : null;
  const isMinor = third <= 3;
  // A diminished triad reads ° on its own and with a diminished 7th, but ø
  // (half-diminished) when the 7th is minor — e.g. minor's ii7 is iiø, not ii°.
  const sym = isMinor && fifth <= 6 ? (seventh !== null && seventh !== 9 ? "ø" : "°")
    : !isMinor && fifth >= 8 ? "+" : "";
  const b = subBandOf(rootCents);
  const arrow = b === 0 ? "↓" : b === 2 ? "↑" : "";
  return arrow + acc + (isMinor ? ROMAN_UP[dd].toLowerCase() : ROMAN_UP[dd]) + sym;
};
const REGION_BY_NAME = new Map(REGIONS.filter(r => r.subs && r.subs.length === 3).map(r => [r.name, r]));
function bandRange(regionName: string | null, band: Band, t?: EdoTuning): [number, number] {
  if (!regionName) return [0, 0];
  if (t) { const pc = REGION_PC[regionName]; if (pc != null) { const c = mosCents(pc, t); return [c, c]; } }
  const r = REGION_BY_NAME.get(regionName);
  if (!r?.subs) return [0, 0];
  return bandWindow(r, band);   // same MIN_BAND_GAP separation as the Sing scales
}
function fullRange(regionName: string): [number, number] {
  const r = REGION_BY_NAME.get(regionName);
  return r ? [r.lo, r.hi] : [0, 0];
}

const mod = (n: number, m: number) => ((n % m) + m) % m;
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// ── Permutations (Bergonzi "Melodic Structures") ─────────────────────
// Every ordering of a pitch-set, so you audiate all contours of the same notes
// (contour-independent hearing — the opposite of memorising one formula).
const permute = <T,>(a: T[]): T[][] => a.length <= 1 ? [a] : a.flatMap((x, i) => permute([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p]));
const PERM_3 = permute([0, 1, 2]);        // all 6 orderings of a 3-note cell (1·2·3)
// Curated 4-note structures: ONE ordering per distinct up/down contour (8 of the
// 24 — the rest are retrogrades/inversions you get live with r / i, so drilling
// all 24 is production fluency, not new pitch-information to audiate).
const BERGONZI_4 = [
  [0, 1, 2, 3], // ▲▲▲
  [0, 1, 3, 2], // ▲▲▼
  [0, 2, 1, 3], // ▲▼▲
  [0, 3, 2, 1], // ▲▼▼
  [1, 0, 2, 3], // ▼▲▲
  [2, 0, 3, 1], // ▼▲▼
  [2, 1, 0, 3], // ▼▼▲
  [3, 2, 1, 0], // ▼▼▼
];
const stepLabel = (s: number[]): string => s.map(x => x + 1).join("·");

// A full interval cycle for a scale of `L` notes: the [degree, degree+k] pair
// from every degree (0…L-1), then a final tonic (index L) where the cycle
// returns. 2L+1 notes. Used for the diatonic scale-in-intervals and the
// pentatonic/symmetric cells below, so they all share one logic. e.g. penta
// 4ths (L=5, k=3) → 1 5 2 6 3 1 5 2 6 3 1.
const intervalPairs = (L: number, k: number): number[] =>
  [...Array.from({ length: L }, (_, d) => [d, d + k]).flat(), L];

// ── Structure application: pentatonic superimposition + symmetric scales ─────
// A pattern is a STRUCTURE (an index cell); a scale is a list of ascending pc
// offsets within one octave.  scPc wraps the index by the scale length, carrying
// octaves, so ONE cell sequences over a 5-note pentatonic, a 6-note whole-tone,
// or an 8-note octatonic exactly as the diatonic cells run over 7.  The pcs are
// mapped through the band-tuned 12-note chroma at build time, so every structure
// inherits the 50/12/39-EDO spectrum — structures, pentatonics, symmetric
// scales, chords and cycles are all the same idea applied to different note-sets.
const scPc = (scale: number[], i: number): number =>
  scale[mod(i, scale.length)] + 12 * Math.floor(i / scale.length);
const scPcs = (scale: number[], idxs: number[]): number[] => idxs.map(i => scPc(scale, i));
const upDownIdx = (n: number): number[] =>
  [...Array.from({ length: n + 1 }, (_, i) => i), ...Array.from({ length: n }, (_, i) => n - 1 - i)];
// Sequence a cell from every degree of an n-note scale (index space).
const seqCell = (cell: number[], n: number): number[] =>
  Array.from({ length: n }, (_, r) => cell.map(o => r + o)).flat();
const rollGroups = (n: number, g: number): number[] =>
  Array.from({ length: n }, (_, r) => Array.from({ length: g }, (_, j) => r + j)).flat();

// Major / minor pentatonic as pc structures (semitones from the pentatonic's own
// root), and the singable cells run over them.
const MAJ_PENT = [0, 2, 4, 7, 9];
const MIN_PENT = [0, 3, 5, 7, 10];
const PENTA_CELLS: { label: string; cell: number[] }[] = [
  { label: "up · down",    cell: upDownIdx(5) },
  { label: "3rds",         cell: intervalPairs(5, 2) },
  { label: "4ths",         cell: intervalPairs(5, 3) },
  { label: "5ths",         cell: intervalPairs(5, 4) },
  { label: "groups of 3",  cell: seqCell([0, 1, 2], 5) },
  { label: "groups of 4",  cell: seqCell([0, 1, 2, 3], 5) },
  { label: "↓ groups of 3", cell: seqCell([2, 1, 0], 5) },
  { label: "1·3·5 triads", cell: seqCell([0, 2, 4], 5) },
  { label: "4th↑ 2nd↓",    cell: seqCell([0, 3, 1], 5) },
  // Wide-leap cells that exploit the minor-3rd gaps — the pentatonic's whole
  // point (Potter "fours & sixes"), not just stepwise motion.
  { label: "wide 1·4·2·5", cell: seqCell([0, 3, 1, 4], 5) },
  { label: "skip 1·2·4·5", cell: seqCell([0, 1, 3, 4], 5) },
  { label: "1·5·3·2",      cell: seqCell([0, 4, 2, 1], 5) },
];
// Degree spelling of a pentatonic FROM ITS OWN ROOT (root = 1), so each base's
// shape is legible: major pentatonic reads "1 2 3 5 6", minor "1 ♭3 4 5 ♭7".
const DEG_NAMES = ["1", "♭2", "2", "♭3", "3", "4", "♯4", "5", "♭6", "6", "♭7", "7"] as const;
// Spell a pentatonic's notes as KEY degrees, in the pentatonic's own order from
// its root (root = chromatic offset from the tonic).  e.g. min pent on 2 →
// 2 4 5 6 1; maj pent on 5 → 5 6 7 2 3.
const pentaDegrees = (root: number, struct: number[]): string =>
  struct.map(pc => DEG_NAMES[mod(root + pc, 12)]).join(" ");

// Symmetric (non-diatonic) scales don't fit the 7-region diatonic MOS, so they
// live in the MODES list as `sym` scales (selectable under Harmonic minor) and
// get the full scalar vocabulary applied structure-over-scale in buildSymSection.

// ── Blues — with the blue notes where they actually live ─────────────
// The blue notes are NOT 12-EDO degrees.  Performance and recording studies put
// the blue third near the septimal 7/6 (267¢) or the neutral 11/9 (347¢), the
// blue fifth near 7/5 (583¢) — with 11/8 (551¢) as the undecimal neighbour — and
// the blue seventh near the harmonic 7/4 (969¢), well flat of 12-EDO's 1000¢.
// Every scale is cents-from-tonic, so the same patterns can be sung in any
// intonation and compared directly.
const JI7 = {
  M2: 203.9, m3s: 266.9, m3: 315.6, n3: 347.4, M3: 386.3,
  P4: 498.0, sup4: 551.3, tt: 582.5, P5: 702.0, M6: 884.4,
  m7h: 968.8, m7: 1017.6, n7: 1049.4,
};
const BLUES_SCALES: { id: string; label: string; cents: number[] }[] = [
  { id: "min12", label: "Blues · 12-EDO",           cents: [0, 300, 500, 600, 700, 1000] },
  { id: "min7",  label: "Blues · 7-limit",          cents: [0, JI7.m3s, JI7.P4, JI7.tt, JI7.P5, JI7.m7h] },
  { id: "min11", label: "Blues · 11-limit neutral", cents: [0, JI7.n3, JI7.P4, JI7.sup4, JI7.P5, JI7.n7] },
  { id: "mix",   label: "Blues · mixed blue 3rds",  cents: [0, JI7.m3s, JI7.n3, JI7.P4, JI7.tt, JI7.P5, JI7.m7h] },
  { id: "maj12", label: "Major blues · 12-EDO",     cents: [0, 200, 300, 400, 700, 900] },
  { id: "maj7",  label: "Major blues · 7-limit",    cents: [0, JI7.M2, JI7.m3s, JI7.M3, JI7.P5, JI7.M6] },
  { id: "pen12", label: "Minor pentatonic · 12-EDO", cents: [0, 300, 500, 700, 1000] },
  { id: "pen7",  label: "Minor pentatonic · 7-limit", cents: [0, JI7.m3s, JI7.P4, JI7.P5, JI7.m7h] },
];
// Index the scale with octave wrap, so a cell can run past the octave.
const bluesNote = (sc: number[], i: number): number => sc[mod(i, sc.length)] + 1200 * Math.floor(i / sc.length);
const bluesLine = (sc: number[], idxs: number[]): number[] => idxs.map(i => bluesNote(sc, i));
// Sequence a cell from EVERY degree of the blues scale (seqPattern, blues-space).
const bluesSeq = (sc: number[], cell: number[]): number[] => {
  const out: number[] = [];
  for (let r = 0; r < sc.length; r++) for (const o of cell) out.push(bluesNote(sc, r + o));
  return out;
};
const BLUES_CELLS: { label: string; cell: number[] }[] = [
  { label: "in 3", cell: [0, 1, 2] },
  { label: "in 4", cell: [0, 1, 2, 3] },
  { label: "in 3 ↓", cell: [2, 1, 0] },
  { label: "in 4 ↓", cell: [3, 2, 1, 0] },
  { label: "3rds (1·3 · 2·4)", cell: [0, 2] },
  { label: "4ths (1·4 · 2·5)", cell: [0, 3] },
  { label: "up & back 1·2·3·2", cell: [0, 1, 2, 1] },
  { label: "1·2·3·1", cell: [0, 1, 2, 0] },
  { label: "1·3·2·4", cell: [0, 2, 1, 3] },
  { label: "1·4·3·2", cell: [0, 3, 2, 1] },
  { label: "1·3·5·3", cell: [0, 2, 4, 2] },
];

// ── Triad pairs — two triads a scale-step apart, played as one hexatonic unit
// (Campbell / Bergonzi Vol 7).  Built for EVERY degree of the scale. ──
// Curated to the distinct shapes: the "down·" orderings are just retrogrades of
// these (get them live with r), so drilling all six is production fluency.
const TRIAD_PAIR_PATTERNS: { label: string; make: (d: number) => number[] }[] = [
  { label: "up · up",     make: d => [d, d + 2, d + 4, d + 1, d + 3, d + 5] },
  { label: "up · down",   make: d => [d, d + 2, d + 4, d + 5, d + 3, d + 1] },
  { label: "interlocked", make: d => [d, d + 1, d + 2, d + 3, d + 4, d + 5] },
];

// Common just-intonation landmarks (cents) shown as reference ticks on the
// spectrum strips, alongside the 12-EDO gridlines.
const JI_REFS: { cents: number; label: string }[] = [
  { cents: 0, label: "1/1" },
  { cents: 111.7, label: "16/15" },
  { cents: 203.9, label: "9/8" },
  { cents: 315.6, label: "6/5" },
  { cents: 386.3, label: "5/4" },
  { cents: 498.0, label: "4/3" },
  { cents: 582.5, label: "7/5" },
  { cents: 702.0, label: "3/2" },
  { cents: 813.7, label: "8/5" },
  { cents: 884.4, label: "5/3" },
  { cents: 1017.6, label: "9/5" },
  { cents: 1088.3, label: "15/8" },
];
// Overlay: faint 12-EDO gridlines + labelled JI-ratio ticks along the bottom.
function SpectrumRefs() {
  return (
    <>
      {Array.from({ length: 11 }, (_, k) => k + 1).map(k => (
        <div key={`e${k}`} className="absolute top-0 bottom-0 w-px bg-[#171717]" style={{ left: `${(k / 12) * 100}%` }} />
      ))}
      {JI_REFS.map(r => (
        <div key={r.label} className="absolute bottom-0 flex flex-col items-center pointer-events-none"
          style={{ left: `${(r.cents / 1200) * 100}%`, transform: "translateX(-50%)" }}>
          <div className="w-px h-2 bg-[#3f6f6f]" />
          <span className="text-[7px] leading-none text-[#4d7d7d] font-mono">{r.label}</span>
        </div>
      ))}
    </>
  );
}

// Chord / tonal-audiation practice methods, shown as a reference panel in Sing
// mode.  You can't phonate a chord with one voice — the target is polyphonic
// audiation with the voice as probe/anchor, so these build the multi-note
// "feeling" without needing to sing more than one note at a time.
const PRACTICE_TECHNIQUES: { title: string; body: string }[] = [
  {
    title: "Sing inside the chord",
    body: "Play the chord, then sing each member in turn — third, fifth, seventh — holding it against the sounding chord. The beating, sympathetic resonance and \"locking in\" you feel is the bodily sensation of harmony: your one voice learns its place in the stack by fusing with it.",
  },
  {
    title: "Arpeggiate-and-hold (\"bloom\")",
    body: "Sing the notes in sequence, keeping each one ringing in imagination as you add the next. By the last note you're imagining them all sounding together — the bridge from sequential access (the voice) to simultaneous audiation (the ear).",
  },
  {
    title: "Drone method (tanpura)",
    body: "Turn the Drone on and sing scale degrees against the root+fifth. Everything is heard as an interval against the dyad, so each note's harmonic feeling is internalized relative to the harmony. Extend the drone to a triad and you're audiating against a chord.",
  },
  {
    title: "Motor imagery — vocalize without vocalizing",
    body: "Imagine the vocal effort of each voice — the laryngeal set, the breath — without phonating. Motor imagery recruits much of the same circuitry as real singing, and you can cycle the voices faster than you can sing them, approaching a simultaneous sense.",
  },
  {
    title: "Predict, then verify (audiate cold)",
    body: "Establish the tonic, then imagine the target degree fully and sing it from that inner image — with the reference OFF. Only after you've committed do you turn on the Drone or Pitch Trainer to check. The reference must confirm what you already heard, never hand you the pitch; the moment you tune to it live you're ear-matching, not audiating. This is the single discipline that keeps the whole tool an audiation trainer rather than a tuner.",
  },
  {
    title: "Hunt your misses",
    body: "Notice which degrees and which bands (small / center / large) you land sharp or flat on again and again, and open each session by re-drilling exactly those, cold. Come back to them the next day, not just the same sitting — spaced return is what moves a shaky note into reflex. Your consistent errors, not your easy notes, are the curriculum.",
  },
];

// Titled section panel with a coloured accent tab.  Module-level so it keeps a
// stable identity across renders (an inline component would remount its subtree
// and drop input focus every keystroke).
function Panel({ title, accent = ACCENT, children }: { title: string; accent?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#1e1e1e] bg-[#0c0c0c] overflow-hidden">
      <div className="px-3 py-1.5 border-b border-[#161616] flex items-center gap-2 bg-[#0a0a0a]">
        <span className="w-1.5 h-3 rounded-sm" style={{ background: accent }} />
        <span className="text-[10px] font-semibold tracking-widest text-[#8a8a8a]">{title}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

export default function SolfaSpectrumChords({ ensureAudio, playVol = 0.6, rootCents: rootCentsProp, onRootCentsChange }: Props) {
  const [mode, setMode] = useState<Mode>("sing");
  const [qualities, setQualities] = useState<Set<Quality>>(new Set(["major"]));
  const [shapes, setShapes] = useState<Set<ChordShape>>(new Set(["triad"]));
  const [ext, setExt] = useState<Set<number>>(new Set());
  const [inversions, setInversions] = useState<Set<number>>(new Set([0]));
  const [voicings, setVoicings] = useState<Set<Voicing>>(new Set(["close"]));
  const [octaves, setOctaves] = useState<Set<number>>(new Set([3]));   // octave numbers (3 = C3-C4 = 0 dots)
  const [loopLength, setLoopLength] = useState(4);
  const [checkedRomans, setCheckedRomans] = useState<Record<Quality, Set<string>>>({
    major: new Set(ROMANS.major),
    minor: new Set(ROMANS.minor),
  });
  const [applied, setApplied] = useState<Set<string>>(new Set());
  // Interval mode
  const [ivlSel, setIvlSel] = useState<Set<string>>(new Set(["M3", "P5"]));
  const [ivlBands, setIvlBands] = useState<Set<Band>>(new Set([0, 1, 2]));   // small/center/large
  const [noteCount, setNoteCount] = useState(2);   // notes sounding AT ONCE (tonic + intervals)
  const [ivlSeq, setIvlSeq] = useState(1);         // how many stacks to play IN SUCCESSION
  const [answerShown, setAnswerShown] = useState(false);   // Show Answer reveal (chords/intervals)
  // Sing mode — pick mode(s) + which spectrum bands.  Each selected band makes
  // its own section (one small, one center, one large — never three of a kind).
  const [singModes, setSingModes] = useState<Set<ModeId>>(new Set(["maj"]));
  const [singBands, setSingBands] = useState<Set<Band>>(new Set([0, 1, 2]));
  // Shared spectrum-band selection for BOTH Chords and Sing: one universal set
  // for the "blendable" degrees (2·3·6·7) plus dedicated fine-tune controls for
  // the perfect 4th and 5th so they never smear out of tune.
  const [specBands, setSpecBands] = useState<Set<Band>>(new Set([1]));   // 2nd/3rd/6th/7th
  const [specBand2, setSpecBand2] = useState<Set<Band>>(new Set([1]));   // 2nd — its own control
  const [specBand4, setSpecBand4] = useState<Set<Band>>(new Set([1]));   // 4th — its own control
  const [specBand5, setSpecBand5] = useState<Set<Band>>(new Set([1]));   // 5th — its own control
  // Band system: "spectrum" (small/center/large sub-bands) or "edo" (the three
  // slots become the 50/12/39-EDO diatonic-MOS tunings).  Persisted.
  const [bandSystem, setBandSystem] = useState<BandSystem>(() => lsGet<BandSystem>(BAND_SYSTEM_KEY, "spectrum"));
  useEffect(() => { lsSet(BAND_SYSTEM_KEY, bandSystem); }, [bandSystem]);
  // The EDO tuning a band slot resolves to (undefined in spectrum → sub-band pick).
  const edoForBand = (b: Band): EdoTuning | undefined => bandSystem === "edo" ? BAND_TUNINGS[b] : undefined;
  // Display label for a band slot in the current system.
  const bandLabelOf = (b: Band): string => bandSystem === "edo" ? BAND_EDO_LABELS[b] : BAND_LABELS[b];
  // Longer label for section headers ("50-EDO" vs "center").
  const bandTitleOf = (b: Band): string => bandSystem === "edo" ? `${BAND_TUNINGS[b].edo}-EDO` : BAND_LABELS[b];
  // Allowed bands for scale-degree index d (1-6): 4th/5th get their own control,
  // everything else uses the universal set.  Shared by Chords and Sing.  In EDO
  // mode there's no per-degree tuning — every degree follows the one slot
  // selection, so a chord sits wholly in one EDO.
  const bandsForDegree = (d: number): Band[] => {
    const s = bandSystem === "edo" ? specBands : d === 3 ? specBand4 : d === 4 ? specBand5 : specBands;
    return s.size ? [...s] : [1 as Band];
  };
  const [singSections, setSingSections] = useState<SingSection[]>([]);
  const [techOpen, setTechOpen] = useState(true);
  // Which chord types the Sing section generates (multi-select).
  const [chordTypes, setChordTypes] = useState<Set<ChordType>>(new Set(["triad", "seventh"]));
  // Over-bass compact picker: which family is expanded to show its members.
  // Clicking a family opens it for a short period (auto-collapses); hovering
  // the expanded row holds it open so the popups stay readable.
  const [obOpen, setObOpen] = useState<Set<string>>(new Set());
  const obToggleFamily = useCallback((k: string) => {
    setObOpen(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }, []);
  // Which card/note is currently held as a drone (null = nothing droning).  A
  // click starts its sustained drone; clicking the same target again stops it.
  const [droningId, setDroningId] = useState<string | null>(null);
  const [singVoicings, setSingVoicings] = useState<Set<string>>(new Set(["close", "drop2"]));
  const [singTriadVoicings, setSingTriadVoicings] = useState<Set<string>>(new Set(["close", "spread"]));
  const [cycles, setCycles] = useState<Set<number>>(new Set());   // Almanac root cycles to show
  // Modal interchange laid over the diatonic cycle: which parallel modes recolor
  // each diatonic root, and whether the plain diatonic / interchange rows show.
  // Default borrow pool = the 6 non-major church modes (the full diatonic recolor).
  const [borrowModes, setBorrowModes] = useState<Set<ModeId>>(new Set(["lyd", "mix", "dor", "min", "phr", "loc"]));
  // Modal interchange is its OWN feature (toggle) shown in BOTH the Chords and
  // Cycles tabs — the color-characteristic borrowed chords of each picked mode.
  const [showInterchange, setShowInterchange] = useState(false);
  // MI part-count selection (3/4/5/6-part).  A mode's color needs its
  // characteristic tone — Lydian's ♯11 only shows at 6-part — so a picked mode
  // auto-falls back to its characteristic size if none of these reveal it.
  const [interchangeParts, setInterchangeParts] = useState<Set<ChordType>>(new Set(["seventh"]));
  const [singTab, setSingTab] = useState<SingCat>("scalar");      // Scalar (s) / Chords (d) / Cycles (f)
  const [specOpen, setSpecOpen] = useState(false);                // spectrum popup (z)
  const [gamutOpen, setGamutOpen] = useState(false);              // solfège gamut popup (x)
  const [obSheetOpen, setObSheetOpen] = useState(false);          // over-bass structures sheet (u)
  const [pitchOpen, setPitchOpen] = useState(false);              // pitch trainer panel (p)
  const [echoOpen, setEchoOpen] = useState(false);                // echo call-and-response panel (e)
  const [bandsOpen, setBandsOpen] = useState(false);              // spectrum band-margin editor (b)
  // ── Drone panel (o) ── pick scale degrees / diatonic chords to hold, each with
  // its own small/center/large band, optionally an octave down.
  const [droneOpen, setDroneOpen] = useState(false);
  // Collapsed section headings (keyed by group title) — click a heading to fold
  // its rows away for a tidier list.
  // Track EXPANDED groups — default empty, so every group/parent starts collapsed.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroupExpanded = (title: string) => setExpandedGroups(s => {
    const n = new Set(s); n.has(title) ? n.delete(title) : n.add(title); return n;
  });
  const [droneDegBand, setDroneDegBand] = useState<Band[]>([1, 1, 1, 1, 1, 1, 1]);
  const [droneChordType, setDroneChordType] = useState<ChordType>("triad");
  const [droneOct, setDroneOct] = useState(0);   // octave shift; base scale octave is 3
  const [droneInst, setDroneInst] = useState<DroneInstrument>(() => {
    const v = lsGet<string>("lt_app_droneInstrument", "cello");
    return AudioEngine.isValidInstrument(v) ? v : "cello";
  });
  // ── Harmonization + walking drone ──
  const [harmonize, setHarmonize] = useState<Set<HarmId>>(new Set());
  // Walking drone: the set of "walkable line" keys currently held (index-locked so
  // all advance together 1-to-1), the shared position, and an octave shift.
  const [walk, setWalk] = useState<{ keys: string[]; index: number; oct: number }>({ keys: [], index: 0, oct: 0 });
  const walkNotesRef = useRef<Record<string, number[]>>({});   // key → abs-cents sequence
  const walkStateRef = useRef(walk);
  walkStateRef.current = walk;
  const [betaOpen, setBetaOpen] = useState(false);                // reveal Chords/Intervals (beta) modes
  const [hiddenDeg, setHiddenDeg] = useState<Set<number>>(new Set());   // 1-7 hide degrees (chords tab)
  const [patRetro, setPatRetro] = useState(false);                      // retrograde lines (r)
  const [patExpand, setPatExpand] = useState(0);                        // diatonic interval expansion (+) / contraction (−), in scale steps ([ ])
  const [patInv, setPatInv] = useState<"none" | "dia" | "chrom">("none"); // inversion: diatonic (i) / chromatic (c)
  const [scalarSub, setScalarSub] = useState<ScalarSub>("scale");       // Scalar sub-tab (which one is VIEWED)
  const [scaleStart, setScaleStart] = useState(0);                      // 1-7 → scalar exercises start on this degree (0 = tonic)
  // ── Logbook ──
  const [patternLog, setPatternLog] = useState<Record<string, LogEntry>>(loadPatternLog);
  const [logOpen, setLogOpen] = useState(false);                        // logbook panel (l)
  const [logBy, setLogBy] = useState<"day" | "cat">("day");             // group the logbook by day or category
  const [logSel, setLogSel] = useState<Set<string>>(new Set());         // multi-selected pattern ids
  const dragRef = useRef<{ on: boolean; add: boolean }>({ on: false, add: true });
  // Blues is behind the beta gate for now (dev only), so it's off by default and
  // its toggle is hidden in production builds.
  const [scalarGen, setScalarGen] = useState<Set<ScalarSub>>(new Set(SCALAR_SUBS.map(s => s.id)));  // which scalar groups are GENERATED

  // Root/tonic as a continuous cents position in the octave (0 = C3), shared by
  // all spectrum modes.  Click the root spectrum line or randomize it.  Controlled
  // by the host when rootCentsProp/onRootCentsChange are supplied (Spectrum
  // Audiation links its drone to it); otherwise the trainer owns it.
  const [rootCentsLocal, setRootCentsLocal] = useState(0);
  const rootCents = rootCentsProp ?? rootCentsLocal;
  const setRootCents = onRootCentsChange ?? setRootCentsLocal;
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [progression, setProgression] = useState<string[]>([]);
  const expectedRef = useRef<string[][]>([]);   // per beat: "pc:oct" keys
  const lastFramesRef = useRef<number[][]>([]);
  const spreadRef = useRef<Record<string, number[]>>({});   // recent cents per slot key
  const [answerKey, setAnswerKey] = useState(0);
  const [status, setStatus] = useState("");
  const [verdict, setVerdict] = useState<boolean[]>([]);

  // Sing has no write-in answer — entering it clears any lingering answer sheet
  // (progression) left over from Chords / Intervals so it drops out of view.
  useEffect(() => {
    if (mode === "sing") { setProgression([]); setVerdict([]); setStatus(""); setAnswerShown(false); }
  }, [mode]);

  const toggleIn = <T,>(setter: Dispatch<SetStateAction<Set<T>>>, v: T, keepOne = false) =>
    setter(prev => {
      const next = new Set(prev);
      if (next.has(v)) { if (!(keepOne && next.size === 1)) next.delete(v); }
      else next.add(v);
      return next;
    });

  const toggleRoman = (q: Quality, r: string) =>
    setCheckedRomans(prev => {
      const set = new Set(prev[q]);
      if (set.has(r)) { if (set.size > 1) set.delete(r); } else set.add(r);
      return { ...prev, [q]: set };
    });

  // Sample uniformly in [lo,hi], keep the candidate farthest from recent picks
  // for `key` → truly spread across the region, biased off recent notes.
  const spreadPick = (key: string, lo: number, hi: number): number => {
    const hist = spreadRef.current[key] ?? [];
    let best = lo + Math.random() * (hi - lo);
    let bestScore = -1;
    for (let i = 0; i < 12; i++) {
      const c = lo + Math.random() * (hi - lo);
      const score = hist.length ? Math.min(...hist.map(h => Math.abs(c - h))) : Infinity;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    const nh = [...hist, best];
    if (nh.length > 3) nh.shift();
    spreadRef.current[key] = nh;
    return best;
  };

  const randomChroma = (quality: Quality): number[] => {
    const chroma = new Array(12).fill(0);
    for (let pc = 1; pc < 12; pc++) {
      const degIdx = SCALE_PC[quality].indexOf(pc);
      const allowed = degIdx > 0 ? bandsForDegree(degIdx) : [1 as Band];
      const b = pick(allowed);
      const [lo, hi] = bandRange(PC_REGION[pc], b, edoForBand(b));
      chroma[pc] = spreadPick(`c${pc}`, lo, hi);
    }
    return chroma;
  };

  const appliedStack = (label: string, want7: boolean): number[] => {
    const [prefix, target] = label.split("/");
    const tPC = SCALE_PC.major[ROMAN_ROOT.major[target] ?? 0] ?? 0;
    let rootPc: number, offs: number[];
    if (prefix === "V") { rootPc = mod(tPC + 7, 12); offs = want7 ? [0, 4, 7, 10] : [0, 4, 7]; }
    else if (prefix === "vii°") { rootPc = mod(tPC - 1, 12); offs = want7 ? [0, 3, 6, 9] : [0, 3, 6]; }
    else if (prefix === "ii" || prefix === "iiø") { rootPc = mod(tPC + 2, 12); offs = want7 ? [0, 3, 6, 10] : [0, 3, 6]; }
    else { rootPc = mod(tPC + 1, 12); offs = want7 ? [0, 4, 7, 10] : [0, 4, 7]; }   // TT
    return offs.map(o => rootPc + o);
  };

  const chordStack = (roman: string, quality: Quality, size: number): number[] => {
    const want7 = shapes.has("seventh");
    if (roman.includes("/")) return appliedStack(roman, want7);
    const b = BORROWED[roman];
    if (b) { const base = TRIAD_OFFS[b.kind]; return (want7 ? [...base, SEVENTH_OFF[b.kind]] : base).map(o => b.rootPc + o); }
    const r = ROMAN_ROOT[quality][roman];
    return Array.from({ length: size }, (_, k) => {
      const step = r + 2 * k;
      return SCALE_PC[quality][step % 7] + 12 * Math.floor(step / 7);
    });
  };

  // Work in integer chromatic offsets from the tonic so octave is tracked.
  // Invert = move the lowest tone up an octave (+12).
  const invertOffsets = (offsets: number[], k: number): number[] => {
    const out = [...offsets];
    for (let i = 0; i < k; i++) out.push(out.shift()! + 12);
    return out;
  };
  // Offset → playback abs (audioEngine edo=1200, ref C4).  Tonic sits at C3 +
  // the chosen root (offset 0, octave 0 = "zero dots"), so subtract an octave
  // and add the root transposition.
  const offsetToAbs = (o: number, chroma: number[]): number =>
    chroma[mod(o, 12)] + 1200 * Math.floor(o / 12) - 1200 + rootCents;
  const pickSize = (): number => {
    const shape = pick([...shapes]) ?? "triad";
    let size = shape === "seventh" ? 4 : 3;
    if (ext.has(9)) size = Math.max(size, 5);
    if (ext.has(11)) size = Math.max(size, 6);
    if (ext.has(13)) size = Math.max(size, 7);
    return size;
  };

  const seedAnswer = (beatCount: number) => {
    // Exactly `beatCount` quarter-note beats in a single bar → 1 chord = 1 beat.
    const proj: NoteEntryProject = {
      id: SOLFA_ANSWER_PROJECT_ID,
      title: "Sol-fa Spectrum Answer",
      setup: { clef: "treble", keySignature: 0, defaultTimeSig: { num: Math.max(1, beatCount), den: 4 }, barCount: 1 },
      notes: [], syncPoints: [], youtubeUrl: "", createdAt: Date.now(),
      instrument: "jianpu", voiceCount: 3, displaySystem: "solfa", edo: ANSWER_EDO,
    };
    saveProject(proj);
  };

  // Expected answer per beat: each note's region-solfège syllable + octave,
  // read straight from the played cents (frames are abs cents from C4; the tonic
  // sits at C3 = abs −1200).
  const finishPlay = (frames: number[][]) => {
    const expected = frames.map(chord =>
      [...new Set(chord.map(abs => {
        const fromTonic = abs + 1200 - rootCents;           // cents above the tonic (root removed)
        return `${sylOf(fromTonic)}:${Math.floor(fromTonic / 1200)}`;
      }))]);
    lastFramesRef.current = frames;
    expectedRef.current = expected;
    setVerdict([]);
    setStatus("");
    setAnswerShown(false);
    seedAnswer(frames.length);
    setAnswerKey(k => k + 1);
    audioEngine.playSequence(frames, 1200, 750, 0.95, playVol * 0.7);
  };

  const playChords = () => {
    const activeQ = qualities.size ? [...qualities] : (["major"] as Quality[]);
    const quality = pick(activeQ);
    const diatonic = ROMANS[quality].filter(r => checkedRomans[quality].has(r));
    const poolAll = [...diatonic, ...applied];
    const pool = poolAll.length ? poolAll : ROMANS[quality];
    const prog = pool.length === 1
      ? Array.from({ length: loopLength }, () => pool[0])
      : (generateFunctionalLoop(pool, loopLength, 300, new Set(applied)) ?? Array.from({ length: loopLength }, () => pool[0]));
    const chroma = randomChroma(quality);
    const invPool = [...inversions];
    // Octave numbers → dot offset (octave 3 = C3 = 0 dots).
    const octPool = octaves.size ? [...octaves].map(n => n - 3) : [0];
    const frames: number[][] = [];
    for (const rn of prog) {
      let offsets = chordStack(rn, quality, pickSize());
      const k = Math.min(invPool.length ? pick(invPool) : 0, offsets.length - 1);
      offsets = invertOffsets(offsets, k);
      offsets = applyVoicing(offsets, pick([...voicings]) ?? "close");
      const baseOct = pick(octPool);
      offsets = offsets.map(o => o + baseOct * 12);
      // Keep the whole chord within (or above) the selected octave floor — a
      // drop voicing must not sink a tone below the chosen octave (e.g. no note
      // below C3 when only octave 3 is selected).
      const floor = baseOct * 12;
      let lowest = Math.min(...offsets);
      while (lowest < floor) { offsets = offsets.map(o => o + 12); lowest += 12; }
      frames.push(offsets.map(o => offsetToAbs(o, chroma)));
    }
    setProgression(prog);
    finishPlay(frames);
  };

  // Interval mode: one beat, `noteCount` notes = tonic + random chosen intervals,
  // each sampled within a randomly-chosen allowed band (small/center/large; all
  // three = the whole region).  All within the base octave = 0 dots.
  const playIntervals = () => {
    const chosen = [...ivlSel];
    if (!chosen.length) { setStatus("Pick at least one interval."); return; }
    const allowed = ivlBands.size ? [...ivlBands] : [1 as Band];
    // `ivlSeq` stacks in succession (each a beat); each stacks `noteCount` notes
    // AT ONCE = tonic + (noteCount − 1) chosen intervals over it.
    const frames: number[][] = [];
    for (let s = 0; s < Math.max(1, ivlSeq); s++) {
      const cents = [0];
      for (let i = 0; i < Math.max(1, noteCount - 1); i++) {
        const iv = INTERVAL_BY_ID.get(pick(chosen))!;
        const b = pick(allowed);
        const [lo, hi] = bandRange(iv.region, b, edoForBand(b));
        cents.push(spreadPick(`i${iv.id}`, lo, hi));
      }
      cents.sort((a, b) => a - b);
      frames.push(cents.map(c => c - 1200 + rootCents));   // tonic at C3 + root
    }
    setProgression(frames.map(() => "interval"));
    finishPlay(frames);
  };

  // ── Sing mode ─────────────────────────────────────────────────────
  // Generate the full 12-note chromatic scale (cents from tonic, indexed by
  // pitch-class 0-11), band-tuned.  The mode's diatonic degrees follow their band
  // controls (4th/5th fixed via c4/c5); the 5 chromatic pitches get their OWN
  // region-band tuning so they're distinct pitches, not fixed semitone offsets.
  const singChroma = (regions: string[], band: Band, c2: number, c4: number, c5: number, edo?: EdoTuning): number[] => {
    // EDO mode: the whole 12-note chromatic is the fifth-generated MOS of this
    // tuning — every pc is `mosCents`, so the 5 chromatic pitches are the proper
    // meantone sharps/flats (diatonic-chromatic equivalence), not random spreads.
    if (edo) return Array.from({ length: 12 }, (_, pc) => mosCents(pc, edo));
    const chroma = new Array(12).fill(0);
    const dia = new Set([0]);
    for (let d = 1; d < 7; d++) {
      const pc = REGION_PC[regions[d]] ?? d;
      dia.add(pc);
      if (d === 1) { chroma[pc] = c2; continue; }   // 2nd — shared across all bands
      if (d === 3) { chroma[pc] = c4; continue; }   // 4th — shared
      if (d === 4) { chroma[pc] = c5; continue; }   // 5th — shared
      const [lo, hi] = regionBand(regions[d], band, edo);
      chroma[pc] = spreadPick(`singm_${regions[d]}_b${band}`, lo, hi);
    }
    for (let pc = 1; pc < 12; pc++) {
      if (dia.has(pc)) continue;
      const region = PC_REGION[pc];
      if (!region) continue;
      const [lo, hi] = regionBand(region, band, edo);
      chroma[pc] = spreadPick(`chroma_pc${pc}_b${band}`, lo, hi);
    }
    return chroma;
  };
  // The mode's diatonic 7-note scale, read from the shared 12-note chroma.
  const scaleFromChroma = (regions: string[], chroma: number[]): number[] =>
    [0, ...Array.from({ length: 6 }, (_, i) => chroma[REGION_PC[regions[i + 1]] ?? (i + 1)])];
  // One shared cents value for the 4th/5th — random within its band, computed
  // ONCE per generation so all three band-scales use the same tuning.
  const perfectCents = (region: string, bandSet: Set<Band>, edo?: EdoTuning): number => {
    const [lo, hi] = regionBand(region, pick([...bandSet]) ?? 1, edo);
    return lo + Math.random() * (hi - lo);   // hi===lo in EDO mode → the exact MOS step
  };
  // Scale-step index (0 = tonic, 7 = octave, negatives below) → a playable note.
  // Octave is tracked so patterns/voicings show dot notation above/below.
  const stepNote = (scale: number[], s: number): SingNote => {
    const deg = mod(s, 7), oct = Math.floor(s / 7);
    return { syl: sylOf(scale[deg]), abs: scale[deg] + 1200 * oct - 1200 + rootCents, oct, cents: mod(scale[deg], 1200) };
  };
  const lineSeq = (label: string, scale: number[], steps: number[]): SingSeq =>
    ({ kind: "line", label, steps, notes: steps.map(s => stepNote(scale, s)) });
  // Start-degree shift for a scalar line (keys 1–7): diatonic lines (with steps)
  // rotate WITHIN the scale by scaleStart; chromatic lines (cents only) transpose
  // by the start degree's cents.  Resolution is exempt (must land on the tonic).
  // Shared by the on-screen rows AND the Echo phrase pool so both start alike.
  const applyStartShift = (seq: SingSeq, rawScale: number[], sub?: ScalarSub): SingNote[] => {
    if (seq.kind !== "line") return [];
    if (!scaleStart || sub === "resolution") return seq.notes;
    return seq.steps
      ? seq.steps.map(s => stepNote(rawScale, s + scaleStart))
      : seq.notes.map(n => centsNote((n.abs + 1200 - rootCents) + rawScale[scaleStart]));
  };
  // ── Chromatic material — lines built from the 12-note chroma (raw cents), so
  // approach / passing / neighbour tones are the REAL band-tuned chromatic
  // pitches (distinct from the diatonic notes). ──
  const centsNote = (cents: number): SingNote => {
    const oct = Math.floor(cents / 1200), c = cents - 1200 * oct;
    return { syl: sylOf(c), abs: cents - 1200 + rootCents, oct, cents: c };
  };
  const chromSeq = (label: string, centsArr: number[]): SingSeq =>
    ({ kind: "line", label, notes: centsArr.map(centsNote) });
  // Cents of a chromatic pitch-class (with octaves), from the 12-note chroma.
  const chromaCents = (chroma: number[], pc: number): number => chroma[mod(pc, 12)] + 1200 * Math.floor(pc / 12);
  const chromaticScaleLine = (chroma: number[]): number[] => Array.from({ length: 13 }, (_, pc) => chromaCents(chroma, pc));
  // Approach each target pitch-class from the chromatic pc a semitone below / above.
  const approachLine = (chroma: number[], targetPcs: number[]): number[] => targetPcs.flatMap(P => [chromaCents(chroma, P - 1), chromaCents(chroma, P)]);
  const approachAboveLine = (chroma: number[], targetPcs: number[]): number[] => targetPcs.flatMap(P => [chromaCents(chroma, P + 1), chromaCents(chroma, P)]);
  // Double-chromatic approach: two semitones below → target.
  const doubleApproachLine = (chroma: number[], targetPcs: number[]): number[] => targetPcs.flatMap(P => [chromaCents(chroma, P - 2), chromaCents(chroma, P - 1), chromaCents(chroma, P)]);
  // Triadic Chromatic Approach (Garzone): play a triad, step a CHROMATIC semitone
  // to the next note, which starts a NEW triad, and so on — through all four triad
  // qualities (major, minor, diminished, augmented), connected by half-steps.
  // (TCA is an improvisational method, so this is one rigorous line through every
  // quality, not an "exhaustive" enumeration — that would be infinite.)
  const TRIAD_QUALITIES = [[0, 400, 700], [0, 300, 700], [0, 300, 600], [0, 400, 800]]; // maj · min · dim · aug (cents)
  const triadicChromaticLine = (): number[] => {
    const out: number[] = [];
    let cur = 0;
    TRIAD_QUALITIES.forEach((q, i) => {
      for (const iv of q) out.push(cur + iv);
      cur = out[out.length - 1] + (i % 2 === 0 ? 100 : -100);   // half-step to the next triad
    });
    return out;
  };
  // Enclose each target: whole-step above, chromatic below, then the target.
  const enclosureLine = (chroma: number[], targetPcs: number[]): number[] => targetPcs.flatMap(P => [chromaCents(chroma, P + 2), chromaCents(chroma, P - 1), chromaCents(chroma, P)]);
  // Every one of the six tritones resolving INWARD to a major 3rd (arpeggiated).
  const tritoneResLine = (chroma: number[]): number[] => {
    const out: number[] = [];
    for (let a = 0; a < 6; a++) out.push(chromaCents(chroma, a), chromaCents(chroma, a + 6), chromaCents(chroma, a + 1), chromaCents(chroma, a + 5));
    return out;
  };
  // Scale "in Nths": stack the interval UP through the octaves (no wrapping), so
  // it moves outside one octave and lands back on the tonic — e.g. thirds =
  // Da Mo Sa To Ra• Fa• Lo• Da•• (over two octaves).
  // Octave-reduced (mod 7) so the "scale in Nths" stays inside one octave and
  // singable — it still visits every degree by that interval and lands on the
  // tonic, but never climbs two octaves out of range.
  const intervalCycle = (stepInterval: number): number[] =>
    Array.from({ length: 8 }, (_, k) => (k * stepInterval) % 7);
  // A sequence pattern: apply a "cell" of scale-step offsets from every degree,
  // ascending, until the cell would leave the octave — resolving on the top da.
  // Sequence a cell up the scale from EVERY degree (root 0-6) so it completes a
  // full cycle through the mode — a 4-note cell = 28 notes.  Notes past the octave
  // show dot notation.
  const seqPattern = (cell: number[]): number[] => {
    const s: number[] = [];
    for (let root = 0; root < 7; root++) for (const off of cell) s.push(root + off);
    return s;
  };
  // Make a line resolve home: if it doesn't already end on a tonic (Da), append
  // the nearest one so every pattern completes its cycle where it started.
  const endOnTonic = (steps: number[]): number[] => {
    if (!steps.length) return steps;
    const last = steps[steps.length - 1];
    const da = Math.round(last / 7) * 7;
    return da === last ? steps : [...steps, da];
  };
  // Same, for cents-based (chromatic) lines — append the nearest octave tonic.
  const endOnTonicCents = (arr: number[]): number[] => {
    if (!arr.length) return arr;
    const last = arr[arr.length - 1];
    const da = Math.round(last / 1200) * 1200;
    return Math.abs(last - da) < 1 ? arr : [...arr, da];
  };
  // Piano voicings in scale steps.  Rotate = inversions; drop moves voices
  // (counted from the TOP) down an octave (same as Tonal Audiation's chord
  // voicings); open triad lifts the middle voice up an octave.
  const rotateUp = (steps: number[], k: number) => { const s = [...steps]; for (let i = 0; i < k; i++) s.push(s.shift()! + 7); return s; };
  const applyDrop = (close: number[], dropsFromTop: number[]): number[] => {
    const s = [...close].sort((a, b) => a - b);
    for (const k of dropsFromTop) { const i = s.length - k; if (i >= 0) s[i] -= 7; }
    return s;
  };
  const chordSeq = (label: string, scale: number[], voicings: { label?: string; steps: number[]; rootStep?: number }[]): SingSeq =>
    ({ kind: "chords", label, chords: voicings.map(v => ({
      label: v.label,
      tones: v.steps.map(s => ({ ...stepNote(scale, s), root: v.rootStep !== undefined && mod(s, 7) === mod(v.rootStep, 7) })).sort((a, b) => a.abs - b.abs),
    })) });

  // Full names for cycle ROW headers; shorthand for the (narrow) chord-card captions.
  const INV_LABEL = ["Root", "1st Inversion", "2nd Inversion", "3rd Inversion", "4th Inversion", "5th Inversion"];
  const INV_SHORT = ["Root", "1st Inv", "2nd Inv", "3rd Inv", "4th Inv", "5th Inv"];
  // Apply a voicing to a close-position chord (scale steps).  Drops move voices
  // from the TOP down an octave (double drop = 2nd voice two octaves, 3rd voice
  // one) — the same logic as Tonal Audiation's chord voicings.
  const voiceChord = (close: number[], v: VoicingDef): number[] => {
    if (v.spread || v.octave) {
      const s = [...close].sort((a, b) => a - b);
      if (v.spread && s.length >= 3) s[1] += 7;    // spread: 2nd voice up an octave (1-5-3 open)
      if (v.octave && s.length >= 2) s[0] -= 7;    // octave-insertion: bass down an octave
      return s;
    }
    if (v.double) { const s = [...close].sort((a, b) => a - b); const n = s.length; if (n >= 2) s[n - 2] -= 14; if (n >= 3) s[n - 3] -= 7; return s; }
    if (!v.drops.length) return close;
    return applyDrop(close, v.drops);
  };
  // Every (shape × selected voicing) at one degree, across all inversions.  A
  // shape may yield several source chords (TBN I/II); each is voiced & inverted.
  const shapeVoicings = (type: ChordType, v: VoicingDef, d: number): { label?: string; steps: number[] }[] => {
    const out: { label?: string; steps: number[] }[] = [];
    for (const src of SHAPE_TONES[type]) {
      const tones = src.offs.map(o => d + o);
      for (let inv = 0; inv < tones.length; inv++) {
        const steps = voiceChord(rotateUp(tones, inv), v);
        // Label by the ACTUAL bass (lowest voice), not the pre-drop close-position
        // inversion. A drop / double-drop moves a different chord tone into the bass,
        // so a chord the close voicing calls "root" can really be an inversion —
        // "root position" means the ROOT is in the bass. Reduce the bass to its
        // scale-step offset from the root and find which chord tone that is.
        const bassOff = (((Math.min(...steps) - d) % 7) + 7) % 7;
        const bi = src.offs.findIndex(o => (((o % 7) + 7) % 7) === bassOff);
        const invIdx = bi >= 0 && bi < INV_SHORT.length ? bi : inv;
        out.push({ label: INV_SHORT[invIdx], steps });
      }
    }
    return out;
  };
  // Diatonic root cycle by interval `n` (2nd…7th): roots move by that interval
  // through the scale, covering every degree and returning home.  The chords are
  // VOICE-LED — the first is in the chosen starting inversion, and each following
  // chord takes the inversion/octave that moves the voices least (Goodrick's
  // Almanac cycles).  A different start inversion gives a different cycle path.
  const voiceCost = (a: number[], b: number[]): number => {
    const A = [...a].sort((x, y) => x - y), B = [...b].sort((x, y) => x - y);
    let c = 0; for (let i = 0; i < A.length; i++) c += Math.abs(A[i] - B[i]); return c;
  };
  // Walk the roots of cycle `n` through the scale in CLOSE voicings.  The first
  // chord is in `startInv` (so the "root" cycle really has the root in the bass);
  // each following chord takes the inversion+octave that moves the voices least.
  // Diatonic root steps of cycle `n` (2nd…7th): walk by that interval through the
  // scale, covering every degree and returning home.  Shared by the diatonic and
  // modal-interchange cycles so both trace the same root path.
  const cycleRoots = (n: number): number[] => {
    const inc = (n - 1) % 7;
    const roots = [0]; let cur = 0;
    for (let i = 0; i < 7; i++) { cur = mod(cur + inc, 7); roots.push(cur); if (cur === 0) break; }
    return roots;
  };
  const cycleChords = (n: number, startInv: number, offs: number[]): { label?: string; steps: number[]; rootStep?: number }[] => {
    const roots = cycleRoots(n);
    const size = offs.length;
    const out: { label?: string; steps: number[]; rootStep?: number }[] = [];
    let prev: number[] | null = null;
    for (const r of roots) {
      const base = offs.map(o => r + o);
      let close = rotateUp(base, Math.min(startInv, size - 1));
      if (prev) {
        let bestCost = Infinity;
        for (let inv = 0; inv < size; inv++) for (const oct of [-7, 0, 7]) {
          const voiced = rotateUp(base, inv).map(x => x + oct);
          const cost = voiceCost(prev, voiced);
          if (cost < bestCost) { bestCost = cost; close = voiced; }
        }
      }
      out.push({ label: ROMAN_NUMERALS[r], steps: close, rootStep: r });
      prev = close;
    }
    return out;
  };

  // A chord row built from raw cents-above-tonic (not scale steps) — for the
  // modal-interchange cycle, whose tones are the band-tuned chromatic pitches of
  // a borrowed mode rather than degrees of the home scale.  `rootPc1200` marks
  // which tone is the (diatonic) root so the display dots it.
  const chordSeqCents = (label: string, chords: { label?: string; cents: number[]; rootPc1200: number; borrowed?: boolean }[], mi = true): SingSeq =>
    ({ kind: "chords", label, mi, chords: chords.map(c => ({
      label: c.label,
      borrowed: c.borrowed,
      tones: c.cents.map(x => ({ ...centsNote(x), root: Math.abs(mod(x, 1200) - mod(c.rootPc1200, 1200)) < 1 })).sort((a, b) => a.abs - b.abs),
    })) });
  // The shape's tertian offsets read against a mode's semitones, transposed to a
  // diatonic root pc and voiced from the band-tuned `chroma`.
  const modeStackAt = (mId: ModeId, R: number, chroma: number[], offs: number[]): number[] => {
    const ms = [0, ...MODE_BY_ID.get(mId)!.regions.slice(1).map(r => REGION_PC[r] ?? 0)];
    return offs.map(o => chromaCents(chroma, R + ms[mod(o, 7)] + 12 * Math.floor(o / 7))).sort((a, b) => a - b);
  };
  // Voice `cents` (octave shift + inversion) to move the fewest cents off `ref`.
  const voiceNear = (cents: number[], ref: number[] | null): number[] => {
    if (!ref) return [...cents].sort((a, b) => a - b);
    let best = cents, bestCost = Infinity;
    for (const oct of [-1200, 0, 1200]) for (let inv = 0; inv < cents.length; inv++) {
      const cand = invertCents(cents, inv).map(x => x + oct);
      const cost = voiceCost(ref, cand);
      if (cost < bestCost) { bestCost = cost; best = cand; }
    }
    return best;
  };
  // A/B interchange cycle: roots walk the DIATONIC scale, and at each root the
  // diatonic chord is followed immediately by its recoloring through `borrowId`,
  // voiced right on top of it — so you audiate the swap chord by chord.
  const cyclePairMode = (n: number, homeId: ModeId, borrowId: ModeId, homeDiaPcs: number[], chroma: number[], offs: number[], startInv: number) => {
    const homeSemis = [0, ...MODE_BY_ID.get(homeId)!.regions.slice(1).map(r => REGION_PC[r] ?? 0)];
    const borSemis = [0, ...MODE_BY_ID.get(borrowId)!.regions.slice(1).map(r => REGION_PC[r] ?? 0)];
    const out: { label?: string; cents: number[]; rootPc1200: number; borrowed?: boolean }[] = [];
    let prevDia: number[] | null = null;
    for (const rStep of cycleRoots(n)) {
      const R = homeDiaPcs[rStep];
      const dia: number[] = prevDia === null
        ? invertCents(modeStackAt(homeId, R, chroma, offs), Math.min(startInv, offs.length - 1))
        : voiceNear(modeStackAt(homeId, R, chroma, offs), prevDia);
      const bor = voiceNear(modeStackAt(borrowId, R, chroma, offs), dia);
      const rootPc1200 = chromaCents(chroma, R);
      // Both cards get a normal roman.  The diatonic one reads from the home scale;
      // the borrowed twin keeps the same ROOT degree but takes its quality from the
      // borrow mode (so a borrowed minor tonic reads "i", not "min").
      const diaSemis = offs.map(o => homeSemis[mod(rStep + o, 7)] + 12 * Math.floor((rStep + o) / 7));
      const borChordSemis = offs.map(o => R + borSemis[mod(o, 7)] + 12 * Math.floor(o / 7));
      out.push({ label: romanForDegree(homeSemis, rStep, diaSemis, rootPc1200), cents: dia, rootPc1200 });
      out.push({ label: romanForDegree(homeSemis, rStep, borChordSemis, rootPc1200), cents: bor, rootPc1200, borrowed: true });
      prevDia = dia;
    }
    return out;
  };
  // Apply a VoicingDef (the cycle's chosen voicing) to a close-position chord given
  // as CENTS-above-tonic (drops move top voices down an octave = −1200; spread
  // lifts the 2nd voice; octave drops the bass) — the cents mirror of voiceChord.
  const voiceChordCents = (close: number[], v: VoicingDef): number[] => {
    let s = [...close].sort((a, b) => a - b);
    if (v.spread || v.octave) {
      if (v.spread && s.length >= 3) s[1] += 1200;
      if (v.octave && s.length >= 2) s[0] -= 1200;
    } else if (v.double) {
      const n = s.length; if (n >= 2) s[n - 2] -= 2400; if (n >= 3) s[n - 3] -= 1200;
    } else {
      for (const k of v.drops) { const i = s.length - k; if (i >= 0) s[i] -= 1200; }
    }
    // Keep the chord out of the sub-bass: a drop / double-drop can sink a tone two
    // octaves, and a sampled drone pitched that far down just rumbles.  Lift the
    // whole chord by octaves until its lowest tone clears the floor.
    while (Math.min(...s) < VOICE_FLOOR_CENTS) s = s.map(x => x + 1200);
    return s.sort((a, b) => a - b);
  };
  // Invert a cents chord `k` times (lowest tone up an octave each time).
  const invertCents = (cents: number[], k: number): number[] => {
    const s = [...cents].sort((a, b) => a - b);
    for (let i = 0; i < k; i++) s.push(s.shift()! + 1200);
    return s;
  };

  // Build every exercise for one band-locked scale of one mode.
  const buildSection = (band: Band, modeId: ModeId, scaleLabel: string, scale: number[], chroma: number[]): SingSection => {
    const regions = MODE_BY_ID.get(modeId)!.regions;
    const diaPcs = [0, ...regions.slice(1).map(r => REGION_PC[r] ?? 0)];   // 7 diatonic pcs
    const triadPcs = [0, diaPcs[2], diaPcs[4], 12];                        // 1·3·5·8
    // Every non-diatonic (chromatic) pitch resolving to its nearest diatonic
    // neighbour below AND above — the exhaustive chromatic tension→resolution map.
    const diaSet = new Set(diaPcs.map(pc => mod(pc, 12)));
    const chromRes: number[] = [];
    for (let pc = 1; pc < 12; pc++) {
      if (diaSet.has(pc)) continue;
      let lo = pc - 1; while (!diaSet.has(mod(lo, 12))) lo--;
      let hi = pc + 1; while (!diaSet.has(mod(hi, 12))) hi++;
      chromRes.push(chromaCents(chroma, pc), chromaCents(chroma, lo), chromaCents(chroma, pc), chromaCents(chroma, hi));
    }
    // One CHORDS section per selected (chord shape × voicing); a row per degree.
    const vs = VOICING_TYPES.filter(v => singVoicings.has(v.id));
    const triadVs = TRIAD_VOICINGS.filter(v => singTriadVoicings.has(v.id));
    const chordGroups: SingGroup[] = [];
    for (const t of CHORD_TYPES) {
      if (!chordTypes.has(t.id)) continue;
      const size = SHAPE_TONES[t.id][0].offs.length;
      // The triad has its own spread-voicing set; every other shape uses drops.
      const voicingSet = t.id === "triad" ? triadVs : vs;
      for (const v of voicingSet) {
        if (size < v.min) continue;   // voicing needs at least this many voices
        chordGroups.push({
          cat: "chords",
          title: v.id === "close" ? t.title : `${t.title} · ${v.label}`,
          seqs: [0, 1, 2, 3, 4, 5, 6].map(d => chordSeq(ROMAN_NUMERALS[d], scale, shapeVoicings(t.id, v, d))),
        });
      }
    }
    // ── Modal interchange (own feature, shown in BOTH Chords and Cycles) ──
    // For each picked mode, the MULTIPLE non-overlapping interchange chords, all in
    // one side-by-side row, each with ITS OWN sized roman:
    //   • the tonic characteristic chord — biased to feature the colour tone even
    //     small (3-part Lydian = 1·3·♯4, 4-part = 1·3·♯4·7, not a plain 1·3·5), and
    //   • the mode's other diatonic chords whose pitch-class set isn't already a
    //     home diatonic chord (bIII, II, ♯iv°, …), deduped.
    // Band-tuned via chroma, section-voiced.
    const MI_SIZES: ChordType[] = ["triad", "seventh"];
    const miSizes = (() => { const sel = MI_SIZES.filter(id => interchangeParts.has(id)); return sel.length ? sel : MI_SIZES; })();
    // Never borrow from the scale we're already in — there'd be nothing to swap.
    const borrowList = showInterchange
      ? [...borrowModes].map(id => MODE_BY_ID.get(id)).filter((m): m is NonNullable<typeof m> => !!m && m.id !== modeId)
      : [];
    // Semitones-from-tonic of the chord `offs` stacked from degree `dd` of a mode.
    const degChord = (rgs: string[], dd: number, offs: number[]): number[] => {
      const ms = [0, ...rgs.slice(1).map(r => REGION_PC[r] ?? 0)];
      return offs.map(o => ms[mod(dd + o, 7)] + 12 * Math.floor((dd + o) / 7));
    };
    const pcSig = (semis: number[]) => [...new Set(semis.map(s => mod(s, 12)))].sort((a, b) => a - b).join(",");
    // Characteristic-tone-biased tonic chord for a mode at `parts` voices.
    const charChord = (mSemis: number[], charSemi: number, parts: number): number[] => {
      const pri = [0, mSemis[2], charSemi, mSemis[6], mSemis[4], mSemis[1] + 12, mSemis[5] + 12];
      const out: number[] = []; const seen = new Set<number>();
      for (const s of pri) { const pc = mod(s, 12); if (seen.has(pc)) continue; seen.add(pc); out.push(s); if (out.length >= parts) break; }
      return out.sort((a, b) => a - b);
    };
    // Chords tab: lay each borrow mode out exactly like the regular chords — a row
    // per scale degree labelled with ITS OWN roman (I · II · iii · ♯iv° · V · vi ·
    // vii for Lydian), cards = root / 1st inv / 2nd inv …  All 7 degrees show, so
    // the 3rd and the ♯4 chord are both there.  Plus the tonic characteristic chord
    // (colour-tone biased: 1·3·♯4) as its own row.
    if (showInterchange) for (const m of borrowList) {
      const mRegions = MODE_BY_ID.get(m.id)!.regions;
      const mSemis = [0, ...mRegions.slice(1).map(r => REGION_PC[r] ?? 0)];
      const charSemi = CHAR_SEMI[m.id] ?? 6;
      for (const sizeId of miSizes) {
        const offs = SHAPE_TONES[sizeId][0].offs, parts = offs.length;
        const t = CHORD_TYPES.find(c => c.id === sizeId)!;
        const voicingSet = vs.filter(v => parts >= v.min);
        for (const v of voicingSet.length ? voicingSet : [VOICING_TYPES[0]]) {
          const vLabel = v.id === "close" ? "" : ` · ${v.label}`;
          const card = (semis: number[], rootPc1200: number, inv: number, borrowed: boolean) => ({
            label: INV_SHORT[inv],
            cents: voiceChordCents(invertCents(semis.map(s => chromaCents(chroma, s)), inv), v),
            rootPc1200, borrowed,
          });
          const invCount = Math.min(parts, INV_LABEL.length);
          const invCards = (semis: number[], root: number) =>
            Array.from({ length: invCount }, (_, inv) => card(semis, root, inv, true));
          // The borrow mode laid out exactly like the regular chords: a row per
          // degree with its own roman and root→3rd inversions.  No diatonic pairing
          // here — A/B stays a cycles-only thing.
          const seqs: SingSeq[] = [0, 1, 2, 3, 4, 5, 6].map(dd => {
            const semis = degChord(mRegions, dd, offs);
            const root = chromaCents(chroma, mSemis[dd]);
            return chordSeqCents(romanForDegree(mSemis, dd, semis, root), invCards(semis, root));
          });
          // The colour-tone-biased tonic chord (Lydian 1·3·♯4) — the mode's sound.
          const tc = charChord(mSemis, charSemi, parts);
          seqs.push(chordSeqCents(`${m.short} colour`, invCards(tc, chromaCents(chroma, 0))));
          chordGroups.push({ cat: "chords", title: `MODAL INTERCHANGE · ${m.label} · ${t.title}${vLabel}`, seqs });
        }
      }
    }

    // One CYCLE section per selected cycle × chord shape: the diatonic cycle
    // (following the Chords-tab shape selection), then — when interchange is on —
    // the A/B rows, each diatonic chord paired with its borrowed recoloring.
    const cycleGroups: SingGroup[] = [];
    for (const n of [...cycles].sort((a, b) => a - b)) {
      for (const t of CHORD_TYPES) {
        if (!chordTypes.has(t.id)) continue;
        const offs = SHAPE_TONES[t.id][0].offs;
        const size = offs.length;
        const voicingSet = t.id === "triad" ? triadVs : vs;
        for (const v of voicingSet) {
          if (size < v.min) continue;   // voicing needs at least this many voices
          cycleGroups.push({
            cat: "cycles",
            title: v.id === "close" ? `CYCLE ${n} · ${t.title}` : `CYCLE ${n} · ${t.title} · ${v.label}`,
            seqs: Array.from({ length: size }, (_, inv) => chordSeq(INV_LABEL[inv], scale,
              cycleChords(n, inv, offs).map(c => ({ ...c, steps: voiceChord(c.steps, v) })))),
          });
        }
      }
      // A/B interchange through the same cycle — diatonic chord then borrowed twin.
      if (showInterchange) for (const m of borrowList) {
        for (const sizeId of miSizes) {
          const offs = SHAPE_TONES[sizeId][0].offs, size = offs.length;
          const t = CHORD_TYPES.find(c => c.id === sizeId)!;
          const voicingSet = (sizeId === "triad" ? triadVs : vs).filter(v => size >= v.min);
          for (const v of voicingSet.length ? voicingSet : [VOICING_TYPES[0]]) {
            const vLabel = v.id === "close" ? "" : ` · ${v.label}`;
            const invs = [0, 1, 2].filter(inv => inv < size);
            cycleGroups.push({
              cat: "cycles",
              title: `CYCLE ${n} · ${t.title} · A/B ${m.label}${vLabel}`,
              seqs: invs.map(inv => chordSeqCents(`vs ${m.label} · ${INV_LABEL[inv]}`,
                cyclePairMode(n, modeId, m.id, diaPcs, chroma, offs, inv).map(c => ({ ...c, cents: voiceChordCents(c.cents, v) })))),
            });
          }
        }
      }
    }
    const groups: SingGroup[] = [
      { cat: "scalar", sub: "scale", title: "SCALE", seqs: [
        lineSeq("up", scale, [0, 1, 2, 3, 4, 5, 6, 7]),
        lineSeq("down", scale, [7, 6, 5, 4, 3, 2, 1, 0]),
      ] },
      { cat: "scalar", sub: "scale", title: "SCALE IN INTERVALS (3rds–7ths)", seqs: [
        lineSeq("3rds", scale, intervalPairs(7, 2)),
        lineSeq("4ths", scale, intervalPairs(7, 3)),
        lineSeq("5ths", scale, intervalPairs(7, 4)),
        lineSeq("6ths", scale, intervalPairs(7, 5)),
        lineSeq("7ths", scale, intervalPairs(7, 6)),
      ] },
      ...PATTERN_GROUPS.map(g => ({ cat: "scalar" as SingCat, sub: "patterns" as ScalarSub, title: g.title, seqs: g.items.map(p => lineSeq(p.label, scale, endOnTonic(seqPattern(p.cell)))) })),
      ...pentaGroups(chroma, diaPcs),
      ...ANGULAR_GROUPS.map(g => ({ cat: "scalar" as SingCat, sub: "angular" as ScalarSub, title: g.title, seqs: g.items.map(p => lineSeq(p.label, scale, endOnTonic(p.steps))) })),
      { cat: "scalar", sub: "chromatic", title: "CHROMATIC", seqs: [
        chromSeq("12-note chromatic", endOnTonicCents(chromaticScaleLine(chroma))),
        // Approach / enclose EVERY scale tone (not just 1·3·5) — exhaustive.
        chromSeq("approach from below (all)", endOnTonicCents(approachLine(chroma, [...diaPcs, 12]))),
        chromSeq("approach from above (all)", endOnTonicCents(approachAboveLine(chroma, [...diaPcs, 12]))),
        chromSeq("double approach (all)", endOnTonicCents(doubleApproachLine(chroma, [...diaPcs, 12]))),
        chromSeq("enclosure (all)", endOnTonicCents(enclosureLine(chroma, [...diaPcs, 12]))),
        chromSeq("triadic chromatic (Garzone)", endOnTonicCents(triadicChromaticLine())),
      ] },
      { cat: "scalar", sub: "resolution", title: "RESOLUTION", seqs: [
        // Exhaustive MELODIC resolution — every label is literally what plays.  No
        // suspensions/cadences: those need harmony (they live in the Chords tab).
        lineSeq("every active tone → its rest", scale, endOnTonic([1, 0, 1, 2, 3, 2, 3, 4, 5, 4, 6, 7])),  // Re-Do Re-Mi Fa-Mi Fa-So La-So Ti-Do
        chromSeq("every chromatic tone → its neighbour", endOnTonicCents(chromRes)),
        lineSeq("upper & lower neighbours (all)", scale, endOnTonic([0, 1, 0, -1, 0, 2, 3, 2, 1, 2, 4, 5, 4, 3, 4, 6, 7, 6, 5, 6])),
        chromSeq("every tritone → its 3rd (inward)", endOnTonicCents(tritoneResLine(chroma))),
      ] },
      // Triad pairs (Campbell / Bergonzi Vol 7) — two triads a step apart as a
      // hexatonic unit; their own tab now that the permutation drills are cut.
      ...[0, 1, 2, 3, 4, 5, 6].map(d => ({
        cat: "scalar" as SingCat, sub: "triadpairs" as ScalarSub,
        title: `TRIAD PAIR ${mod(d, 7) + 1}·${mod(d + 2, 7) + 1}·${mod(d + 4, 7) + 1} + ${mod(d + 1, 7) + 1}·${mod(d + 3, 7) + 1}·${mod(d + 5, 7) + 1}`,
        seqs: TRIAD_PAIR_PATTERNS.map(tp => lineSeq(tp.label, scale, endOnTonic(tp.make(d)))),
      })),
      ...chordGroups,
      ...cycleGroups,
    ];
    // Drop scalar groups the user has toggled OFF for generation (their sub is
    // deselected) — controls both what's shown and the Echo phrase pool.
    const kept = groups.filter(g => g.cat !== "scalar" || scalarGen.has(g.sub!));
    return { band, mode: modeId, scaleLabel, scale: scale.map((_, i) => stepNote(scale, i)), rawScale: scale, groups: kept };
  };

  // Pentatonic superimposition, split into two collapsible families:
  //   • TONIC-RELATIVE — one shape re-rooted at fixed chromatic offsets from the
  //     key tonic (on 1, off 5, off ♭7, side-slip …).  Context-free colour study.
  //   • CHORD-RELATIVE — a pentatonic rooted on EACH scale degree (the chord
  //     roots), quality matched to that degree's own third — pentatonic-per-chord.
  // Plus the 4-note pentatonic Melodic Structures (all 24) on the home shape.
  const pentaGroups = (chroma: number[], diaPcs: number[]): SingGroup[] => {
    const scaleSet = new Set(diaPcs.map(pc => mod(pc, 12)));
    const inKey = (root: number, struct: number[]): boolean => struct.every(pc => scaleSet.has(mod(root + pc, 12)));
    const cellsFor = (root: number, struct: number[]): SingSeq[] =>
      PENTA_CELLS.map(c => chromSeq(c.label, endOnTonicCents(scPcs(struct, c.cell).map(pc => chromaCents(chroma, root + pc)))));
    // TONIC-RELATIVE — every major / minor pentatonic that stays ENTIRELY in the
    // key.  This is how pentatonics are actually catalogued: in C major, maj pent
    // on I/IV/V and min pent on ii/iii/vi — three collections, six roots — not the
    // five modal rotations of one collection.
    // Every major / minor pentatonic that stays ENTIRELY inside the selected
    // scale — the pentatonic subsets you're internalising.  (Superimposition
    // proper needs out-of-scale notes, so it doesn't belong in this mode; in-key,
    // "tonic-relative" and "chord-relative" are the same six pentatonics.)  Each
    // is spelled in the key's own degrees from its root: min on 2 → 2 4 5 6 1.
    const groups: SingGroup[] = [];
    diaPcs.forEach((rootPc, d) => {
      ([["maj", MAJ_PENT], ["min", MIN_PENT]] as const).forEach(([q, struct]) => {
        if (!inKey(rootPc, struct)) return;
        groups.push({
          cat: "scalar", sub: "pentatonic", parent: "IN-KEY PENTATONICS",
          title: `${q} pent on ${d + 1} · ${pentaDegrees(rootPc, struct)}`,
          seqs: cellsFor(rootPc, struct),
        });
      });
    });
    return groups;
  };

  // A symmetric scale (whole-tone / augmented / octatonic) doesn't fit the
  // 7-region diatonic HARMONY (chords/cycles), but every scalar pattern is just a
  // structure — a list of scale-step indices — so the whole scalar vocabulary
  // runs over it once we index by the scale's own length N (octave = +N) instead
  // of a hardcoded 7.  `deg` reads the N-note cents scale with octave carry; the
  // module cells (patterns, angular, permutations, triad pairs) are reused as-is.
  const buildSymSection = (band: Band, modeId: ModeId, m: { label: string; sym: number[]; arp: number[] }, chroma: number[]): SingSection => {
    const sc = m.sym.map(pc => chromaCents(chroma, pc));   // within-octave cents, length N
    const N = sc.length;
    const L = m.label.toUpperCase();
    const deg = (i: number): number => sc[mod(i, N)] + 1200 * Math.floor(i / N);
    const line = (label: string, idxs: number[]): SingSeq => chromSeq(label, endOnTonicCents(idxs.map(deg)));
    // Sequence a cell from every degree of the N-note scale (structure over scale).
    const seqN = (cell: number[]): number[] => { const s: number[] = []; for (let r = 0; r < N; r++) for (const o of cell) s.push(r + o); return s; };
    const scaleCents = [...sc, 1200];
    const res: number[] = [];
    for (let d = 0; d < N; d++) res.push(d, d - 1, d, d + 1);   // each tone ↔ its neighbours

    const groups: SingGroup[] = [
      { cat: "scalar", sub: "scale", title: `${L} SCALE`, seqs: [
        chromSeq("up", scaleCents), chromSeq("down", [...scaleCents].reverse()),
      ] },
      { cat: "scalar", sub: "scale", title: `${L} IN INTERVALS`,
        seqs: Array.from({ length: Math.max(0, N - 2) }, (_, i) => i + 2).map(k => line(`+${k} steps`, intervalPairs(N, k))) },
      ...PATTERN_GROUPS.map(g => ({ cat: "scalar" as SingCat, sub: "patterns" as ScalarSub, title: g.title, seqs: g.items.map(p => line(p.label, seqN(p.cell))) })),
      { cat: "scalar", sub: "patterns", title: `${L} ARPS`, seqs: [line(N > 6 ? "dim7 arps" : "aug arps", seqN(m.arp))] },
      // No pentatonic (superimposition is a functional-harmony device — meaningless
      // over a symmetric scale) and no chromatic (a symmetric scale already IS
      // half-chromatic, so approach tones just land on other scale tones).
      ...ANGULAR_GROUPS.map(g => ({ cat: "scalar" as SingCat, sub: "angular" as ScalarSub, title: g.title, seqs: g.items.map(p => line(p.label, p.steps)) })),
      { cat: "scalar", sub: "resolution", title: "RESOLUTION", seqs: [
        line("each tone ↔ its neighbours", res),
      ] },
      ...Array.from({ length: N }, (_, d) => ({
        cat: "scalar" as SingCat, sub: "triadpairs" as ScalarSub,
        title: `TRIAD PAIR ${mod(d, N) + 1}·${mod(d + 2, N) + 1}·${mod(d + 4, N) + 1}`,
        seqs: TRIAD_PAIR_PATTERNS.map(tp => line(tp.label, tp.make(d))),
      })),
    ];
    const kept = groups.filter(g => scalarGen.has(g.sub!));
    return { band, mode: modeId, scaleLabel: m.label, scale: scaleCents.map(centsNote), rawScale: scaleCents, groups: kept };
  };

  // Generate one section per selected band, for each selected mode.
  const generateSing = () => {
    const bands: Band[] = [0, 1, 2];   // always small · center · large
    const modes = singModes.size ? [...singModes] : (["maj"] as ModeId[]);
    const majRegions = MODE_BY_ID.get("maj")!.regions;   // neutral 12-note tuning reference
    const sections: SingSection[] = [];
    for (const modeId of modes) {
      const symMode = MODE_BY_ID.get(modeId);
      if (symMode?.sym) {
        for (const band of bands) {
          const edo = edoForBand(band);
          const c2 = perfectCents(majRegions[1], specBand2, edo);
          const c4 = perfectCents(majRegions[3], specBand4, edo);
          const c5 = perfectCents(majRegions[4], specBand5, edo);
          const chroma = singChroma(majRegions, band, c2, c4, c5, edo);
          sections.push(buildSymSection(band, modeId, { label: symMode.label, sym: symMode.sym, arp: symMode.arp! }, chroma));
        }
        continue;
      }
      const m = MODE_BY_ID.get(modeId)!;
      // Spectrum: the 2nd/4th/5th are shared across all three bands so they never
      // smear.  EDO: each section is a distinct tuning, so they take that
      // tuning's MOS 2nd/4th/5th per-band.
      const c2s = perfectCents(m.regions[1], specBand2);
      const c4s = perfectCents(m.regions[3], specBand4);
      const c5s = perfectCents(m.regions[4], specBand5);
      for (const band of bands) {
        const edo = edoForBand(band);
        const c2 = edo != null ? perfectCents(m.regions[1], specBand2, edo) : c2s;
        const c4 = edo != null ? perfectCents(m.regions[3], specBand4, edo) : c4s;
        const c5 = edo != null ? perfectCents(m.regions[4], specBand5, edo) : c5s;
        const chroma = singChroma(m.regions, band, c2, c4, c5, edo);
        sections.push(buildSection(band, modeId, m.label, scaleFromChroma(m.regions, chroma), chroma));
      }
    }
    setSingSections(sections);
    setProgression([]);        // no jianpu answer / grading in Sing
  };

  const playSeq = async (notes: { abs: number }[]) => {
    await ensureAudio();
    audioEngine.playSequence(notes.map(n => [n.abs]), 1200, 480, 0.9, playVol * 0.7);
  };
  const playFrames = async (frames: number[][]) => {
    await ensureAudio();
    audioEngine.playSequence(frames, 1200, 620, 0.92, playVol * 0.7);
  };
  const playOne = async (abs: number) => {
    await ensureAudio();
    audioEngine.playNote(abs, 1200, 1.1, playVol * 0.8);
  };
  // ── Click-to-drone ────────────────────────────────────────────────
  // Tear down only OUR keyed drone voices (leave the host's tonic drone).
  const stopSpecDrones = () => {
    for (const k of audioEngine.getActiveDroneVoiceKeys())
      if (k.startsWith(SPEC_DRONE_PREFIX)) audioEngine.stopRatioDroneVoice(k);
  };
  // Toggle a sustained drone of `absList` (cents from C4) under `id`.  Clicking
  // the target that's already droning turns it off; clicking a new one swaps.
  // The engine's instrument is GLOBAL and other tabs reassign it (the Lattice
  // forces "additive"), so re-assert the drone instrument the user picked in the
  // toolbar before spawning any voice — otherwise a cello selection plays additive.
  const applyDroneInstrument = () => {
    const inst = lsGet<string>("lt_app_droneInstrument", "cello");
    if (AudioEngine.isValidInstrument(inst)) audioEngine.setInstrument(inst);
  };
  // The last held drone (id + pitches), so a band / instrument / octave change can
  // re-voice it without losing the selection.  null while nothing (or the walk) is
  // holding.
  const droneHoldRef = useRef<{ id: string; abs: number[] } | null>(null);
  // ONE engineer's mix for every drone scenario in this tab — a single note, a
  // 5-note chord, and a walking dyad all sit at the same perceived loudness:
  // equal-POWER across voice count (per-voice gain ÷√N) + Fletcher-Munson low
  // boost (+3 dB/oct below C4, capped ×4).  Base ~+4 dB over the background tonic
  // drone so a hold reads as present.  Worst case (octave-spanning 5-note, deep
  // bass) still peaks ~−5 dBFS, under the −3 dBFS limiter.
  const spawnDroneMix = (idBase: string, absList: number[]) => {
    const base = playVol * 1.1 / Math.sqrt(Math.max(1, absList.length));
    absList.forEach((abs, i) => {
      applyDroneInstrument();   // re-assert per voice — startRatioDroneVoice awaits sample loading
      const elBoost = abs >= 0 ? 1 : Math.min(4, Math.pow(1.41, -abs / 1200));
      audioEngine.startRatioDroneVoice(`${SPEC_DRONE_PREFIX}${idBase}:${i}`, Math.pow(2, abs / 1200), base * elBoost, DRONE_BASE_HZ);
    });
  };
  // ── Walking drone ────────────────────────────────────────────────
  // Hold a chord of `absList` as sustained drone voices (no toggle) — the walking
  // cursor calls this on every position change.  Same engineer's mix as toggleDrone.
  const startDroneVoices = async (absList: number[]) => {
    stopSpecDrones();
    setDroningId(null);
    droneHoldRef.current = null;
    if (!absList.length) return;
    await ensureAudio();
    spawnDroneMix("walk", absList);
  };
  const walkMaxIndex = (keys: string[]): number =>
    keys.length ? Math.min(...keys.map(k => walkNotesRef.current[k]?.length ?? 1)) - 1 : 0;
  const toggleWalk = (key: string) => setWalk(w => {
    const has = w.keys.includes(key);
    if (has) {
      const keys = w.keys.filter(k => k !== key);
      return { keys, index: keys.length ? w.index : 0, oct: w.oct };
    }
    // Turning ON a base scale line (no '#') is mutually exclusive — it stops any
    // other line that was going. Harmony voices ('#') still stack onto it.
    const keys = key.includes("#") ? [...w.keys, key] : [key];
    return { keys, index: key.includes("#") ? w.index : 0, oct: w.oct };
  });
  const walkStep = (d: number) => setWalk(w => ({ ...w, index: Math.max(0, Math.min(w.index + d, walkMaxIndex(w.keys))) }));
  const walkOct = (d: number) => setWalk(w => ({ ...w, oct: Math.max(-2, Math.min(2, w.oct + d)) }));
  const walkStop = () => setWalk({ keys: [], index: 0, oct: 0 });
  // Turning harmonization off ends any HARMONY-voice walk (its handle vanished),
  // but a bare scalar-line drone (base key, no '#') stays valid — keep droning it.
  useEffect(() => {
    if (harmonize.size) return;
    setWalk(w => {
      const keys = w.keys.filter(k => !k.includes("#"));
      return keys.length === w.keys.length ? w : { ...w, keys, index: keys.length ? w.index : 0 };
    });
  }, [harmonize]);
  // Re-voice on every cursor / octave / selection change.
  useEffect(() => {
    if (!walk.keys.length) { stopSpecDrones(); return; }
    const abs = walk.keys.map(k => {
      const arr = walkNotesRef.current[k];
      return arr && arr.length ? arr[Math.min(walk.index, arr.length - 1)] + walk.oct * 1200 : null;
    }).filter((x): x is number => x != null);
    void startDroneVoices(abs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walk]);
  // A small ○ handle that adds/removes a line from the synced walk set — a
  // per-line drone you can walk with ← → (↑ ↓ octave).  Offered on every scalar
  // line and every chord/cycle VOICE dot; the `gated` flag (default) hides it
  // only where a caller explicitly opts back into harmonization-gating.
  const walkCircle = (key: string, gated = true) => {
    if (gated && !harmonize.size) return null;
    const on = walk.keys.includes(key);
    // Resume the AudioContext INSIDE the click gesture — the drone itself is spawned
    // by the walk effect, which runs after render (outside the gesture), so without
    // this the first click wouldn't be allowed to start audio.
    return (
      <button onClick={() => { void ensureAudio(); toggleWalk(key); }} title="Walk a drone along this line — ← → move · ↑ ↓ octave · space stop"
        className="w-3.5 h-3.5 rounded-full border shrink-0 transition-colors"
        style={on ? { background: WALK_COLOR, borderColor: WALK_COLOR } : { borderColor: "#3a5a6a" }} />
    );
  };
  // Harmonize the displayed notes by `delta` scale steps (each note → its scale
  // step + delta), stepping by the ACTUAL scale length so it stays in the mode
  // even for non-7-note scales — e.g. pentatonic [1 2 3 5 6]: a 3rd↑ (+2) maps
  // 1→3, 2→5, 3→6. Chromatic notes (not in the scale) pass through.
  const harmonizeNotes = (ns: SingNote[], rawScale: number[], delta: number): SingNote[] =>
    ns.map(n => {
      const L = rawScale.length;
      const d = rawScale.findIndex(c => Math.abs(c - n.cents) < 1);
      if (d < 0) return n;
      const s = d + delta;
      const deg = mod(s, L);
      const oct = n.oct + Math.floor(s / L);
      return { syl: sylOf(rawScale[deg]), abs: rawScale[deg] + 1200 * oct - 1200 + rootCents, oct, cents: mod(rawScale[deg], 1200) };
    });
  const toggleDrone = async (id: string, absList: number[]) => {
    const wasDroning = droningId === id;
    stopSpecDrones();
    if (wasDroning) { setDroningId(null); droneHoldRef.current = null; return; }
    setDroningId(id);
    droneHoldRef.current = { id, abs: absList };
    await ensureAudio();
    spawnDroneMix(id, absList);
  };
  // Start (no toggle) — re-voices a held drone at a new band / octave / instrument
  // without releasing it.
  const holdDrone = async (id: string, absList: number[]) => {
    stopSpecDrones();
    setDroningId(id);
    droneHoldRef.current = { id, abs: absList };
    await ensureAudio();
    spawnDroneMix(id, absList);
  };
  // Stop our drones when the component unmounts.
  useEffect(() => () => stopSpecDrones(), []);
  // Echo is generate-free: entering it (or having nothing yet) auto-produces the
  // random material its call-and-response draws from.
  useEffect(() => { if (mode === "echo" && singSections.length === 0) generateSing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  // Also release any held drone when what's displayed changes (new shapes,
  // voicings, cycles, tab, root…) so a hold never outlives its card.
  useEffect(() => { stopSpecDrones(); setDroningId(null); walkStop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singTab, rootCents, chordTypes, singVoicings, singTriadVoicings, cycles, interchangeParts, borrowModes, showInterchange, singModes, singBands]);
  // Flipping the band system (spectrum ↔ 12/50/39-EDO) retunes everything, so
  // regenerate the on-screen Sing/Echo material immediately rather than leaving
  // it labelled one way but sounding the other until the next Generate.
  useEffect(() => {
    if ((mode === "sing" || mode === "echo") && singSections.length > 0) generateSing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bandSystem]);

  const play = useCallback(async () => {
    if (mode === "sing" || mode === "echo") { generateSing(); return; }
    await ensureAudio();
    if (mode === "chords") playChords(); else playIntervals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, ensureAudio, qualities, checkedRomans, applied, loopLength, shapes, ext, inversions, voicings, octaves, specBands, specBand2, specBand4, specBand5, ivlSel, ivlBands, noteCount, ivlSeq, singModes, singBands, chordTypes, singVoicings, singTriadVoicings, cycles, interchangeParts, borrowModes, showInterchange, rootCents, playVol, bandSystem]);

  const replay = useCallback(async () => {
    if (!lastFramesRef.current.length) return;
    await ensureAudio();
    audioEngine.playSequence(lastFramesRef.current, 1200, 750, 0.95, playVol * 0.7);
  }, [ensureAudio, playVol]);

  // A written note → its region-solfège syllable + octave (same key space as the
  // expected answer).  Degree 1-7 + alteration (EDO steps) resolve against the
  // answer editor's fine EDO so small/center/large land on distinct syllables.
  const noteKey = (n: NoteData): string | null => {
    const deg = n.jianpuDegree;
    if (!deg || deg < 1 || deg > 7) return null;
    const alt = n.alteration ?? (n.jianpuAccidental === "#" ? 1 : n.jianpuAccidental === "b" ? -1 : 0);
    const step = degreeToEdoStep(deg, ANSWER_EDO) + alt;
    return `${sylOf(edoStepCents(step, ANSWER_EDO))}:${n.jianpuOctave ?? 0}`;
  };
  const check = () => {
    const exp = expectedRef.current;
    if (!exp.length) { setStatus("Play first."); return; }
    const notes = loadProjects().find(p => p.id === SOLFA_ANSWER_PROJECT_ID)?.notes ?? [];
    const byBeat = new Map<number, Set<string>>();
    for (const n of notes) {
      if (n.isRest) continue;
      const key = noteKey(n);
      if (key == null) continue;
      const idx = Math.floor(n.startSlot / 8);          // single bar → beat index
      if (!byBeat.has(idx)) byBeat.set(idx, new Set());
      byBeat.get(idx)!.add(key);
    }
    const v = exp.map((keys, i) => {
      const got = byBeat.get(i);
      return !!got && got.size === keys.length && keys.every(kk => got.has(kk));
    });
    setVerdict(v);
    setStatus(`${v.filter(Boolean).length} / ${exp.length} correct`);
  };

  // Show Answer — write the correct notes into the write-in sheet (each played
  // pitch → nearest 41-EDO degree + alteration + octave) and reveal the answer
  // with the region/band spectrum, just like Sing.
  const fillAnswer = () => {
    const frames = lastFramesRef.current;
    if (!frames.length) return;
    const proj = loadProjects().find(p => p.id === SOLFA_ANSWER_PROJECT_ID);
    if (!proj) return;
    const notes: NoteData[] = [];
    let maxVoices = 0;
    frames.forEach((frame, i) => {
      // Convert each played pitch → nearest 41-EDO degree/alteration/octave,
      // deduping unison chord tones.
      const seen = new Set<string>();
      const tones: { deg: number; alt: number; oct: number; cents: number }[] = [];
      for (const abs of frame) {
        const fromTonic = abs + 1200 - rootCents;
        let oct = Math.floor(fromTonic / 1200);
        let s = Math.round(((fromTonic - oct * 1200) / 1200) * ANSWER_EDO);
        if (s >= ANSWER_EDO) { s -= ANSWER_EDO; oct += 1; }
        let deg = 1, best = Infinity;
        for (let d = 1; d <= 7; d++) {
          const nd = Math.abs(s - degreeToEdoStep(d, ANSWER_EDO));
          if (nd < best) { best = nd; deg = d; }
        }
        const alt = s - degreeToEdoStep(deg, ANSWER_EDO);
        const key = `${deg}:${alt}:${oct}`;
        if (seen.has(key)) continue;              // dedupe unison chord tones
        seen.add(key);
        tones.push({ deg, alt, oct, cents: fromTonic });
      }
      // One tone per voice — highest pitch on voice 0 (top line), descending
      // down the voices, so a seventh chord fills four voices.  Never stack:
      // tones beyond the grid's MAX_ANSWER_VOICES are dropped, not piled up.
      tones.sort((a, b) => b.cents - a.cents);
      maxVoices = Math.max(maxVoices, Math.min(tones.length, MAX_ANSWER_VOICES));
      tones.slice(0, MAX_ANSWER_VOICES).forEach((tn, voice) => {
        notes.push({
          id: crypto.randomUUID(), measure: 0, startSlot: i * 8, duration: "q",
          voice, isRest: false, pitch: jianpuToPitch(tn.deg, tn.oct, undefined, 0).pitch,
          jianpuDegree: tn.deg, jianpuOctave: tn.oct || undefined, alteration: tn.alt || undefined,
        });
      });
    });
    // Grow the sheet to fit the widest chord (min 2 voices for the jianpu grid).
    saveProject({ ...proj, notes, voiceCount: Math.max(2, maxVoices) });
    setAnswerKey(k => k + 1);   // remount JianpuMode so it reloads the filled notes
  };
  const showAnswer = () => {
    if (!lastFramesRef.current.length) { setStatus("Play first."); return; }
    fillAnswer();
    setAnswerShown(true);
  };
  // The revealed answer per beat: each note's region-solfège syllable + cents,
  // rendered with the same band spectrum strips as Sing.
  const answerReveal = lastFramesRef.current.map(frame =>
    frame.map(abs => {
      const ft = ((abs + 1200 - rootCents) % 1200 + 1200) % 1200;
      return { syl: sylOf(abs + 1200 - rootCents), cents: ft };
    }));

  // Keybinds: a = Play, s = Replay, d = Check, r = Show Answer (ignored while typing in a field).
  const actionsRef = useRef({ play, replay, check, showAnswer, mode, singTab });
  actionsRef.current = { play, replay, check, showAnswer, mode, singTab };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "escape") { setSpecOpen(false); setGamutOpen(false); setObSheetOpen(false); setBandsOpen(false); setDroneOpen(false); if (walkStateRef.current.keys.length) walkStop(); return; }
      if (actionsRef.current.mode === "echo") return;   // Echo mode owns its own keys (a/s/d/f/arrows)
      // Walking drone owns the arrows / space while active (any tab).
      if (walkStateRef.current.keys.length) {
        if (k === "arrowleft") { e.preventDefault(); walkStep(-1); return; }
        if (k === "arrowright") { e.preventDefault(); walkStep(1); return; }
        if (k === "arrowup") { e.preventDefault(); walkOct(1); return; }
        if (k === "arrowdown") { e.preventDefault(); walkOct(-1); return; }
        if (k === " " || k === "spacebar") { e.preventDefault(); walkStop(); return; }
      }
      if (k === "a") { e.preventDefault(); actionsRef.current.play(); return; }
      if (actionsRef.current.mode === "sing") {
        // Sing: s/d/f switch the generation tab; z/x pop the spectrum / gamut;
        // 1-7 hide/show that scale degree (Chords tab only).
        if (k === "s") { e.preventDefault(); setSingTab("scalar"); }
        else if (k === "d") { e.preventDefault(); setSingTab("chords"); }
        else if (k === "f") { e.preventDefault(); setSingTab("cycles"); }
        else if (k === "z") { e.preventDefault(); setSpecOpen(o => !o); }
        else if (k === "x") { e.preventDefault(); setGamutOpen(o => !o); }
        else if (k === "u") { e.preventDefault(); setObSheetOpen(o => !o); }                  // over-bass structures sheet
        else if (k === "p") { e.preventDefault(); setPitchOpen(o => !o); }                    // pitch trainer
        else if (k === "e") { e.preventDefault(); setEchoOpen(o => !o); }                     // echo call-and-response
        else if (k === "b") { e.preventDefault(); setBandsOpen(o => !o); }                     // spectrum band editor
        else if (k === "l") { e.preventDefault(); setLogOpen(o => !o); }                       // logbook
        else if (k === "o") { e.preventDefault(); setDroneOpen(o => !o); }                      // drone panel
        else if (k === "r") { e.preventDefault(); setPatRetro(o => !o); }                     // retrograde (r+i = retrograde-inversion)
        else if (k === "i") { e.preventDefault(); setPatInv(m => m === "dia" ? "none" : "dia"); }   // diatonic (tonal) inversion
        else if (k === "c") { e.preventDefault(); setPatInv(m => m === "chrom" ? "none" : "chrom"); } // chromatic (real) inversion
        else if (k === "]") { e.preventDefault(); setPatExpand(x => Math.min(5, x + 1)); }     // widen every interval by a scale step
        else if (k === "[") { e.preventDefault(); setPatExpand(x => Math.max(-4, x - 1)); }    // narrow every interval by a scale step
        else if (k === "\\") { e.preventDefault(); setPatExpand(0); }                          // reset expansion
        else if (/^[1-7]$/.test(k) && actionsRef.current.singTab === "chords") {
          e.preventDefault();
          const d = parseInt(k, 10) - 1;
          setHiddenDeg(s => { const nx = new Set(s); nx.has(d) ? nx.delete(d) : nx.add(d); return nx; });
        }
        else if (/^[1-7]$/.test(k) && actionsRef.current.singTab === "scalar") {
          e.preventDefault();
          setScaleStart(parseInt(k, 10) - 1);   // scalar exercises start on this degree
        }
        return;
      }
      if (k === "s") { e.preventDefault(); actionsRef.current.replay(); }
      else if (k === "d") { e.preventDefault(); actionsRef.current.check(); }
      else if (k === "r") { e.preventDefault(); actionsRef.current.showAnswer(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Render ────────────────────────────────────────────────────────
  const chip = (on: boolean) =>
    `px-2.5 py-0.5 rounded text-[11px] font-medium border transition-colors ${
      on ? "bg-[#7173e6] text-white border-[#7173e6]"
         : "bg-[#1a1a1a] text-[#aaa] border-[#2a2a2a] hover:text-white hover:border-[#3a3a5a]"}`;
  const numInput = (val: number, setter: (v: number) => void, min: number, max: number) => (
    <input type="text" inputMode="numeric" value={val}
      onChange={e => { const v = parseInt(e.target.value.replace(/\D/g, ""), 10); setter(Number.isFinite(v) ? v : 0); }}
      onBlur={() => setter(Math.max(min, Math.min(max, val || min)))}
      className="w-14 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-0.5 text-xs text-white focus:outline-none" />
  );
  // Small/center/large button, coloured by band.
  const bandBtn = (b: Band, on: boolean, onClick: () => void) => (
    <button key={b} onClick={onClick}
      className="px-2.5 py-0.5 rounded text-[11px] font-medium border transition-colors"
      style={on ? { background: BAND_COLORS[b], borderColor: BAND_COLORS[b], color: "#0a0a0a" }
                : { background: "#1a1a1a", borderColor: "#2a2a2a", color: "#aaa" }}>
      {bandLabelOf(b)}
    </button>
  );
  const label = (t: string) => <span className="text-[10px] text-[#555] font-semibold tracking-wider mr-1">{t}</span>;
  // Setup section header with a hairline rule.
  const sectionHead = (t: string) => (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-[10px] font-bold tracking-widest text-[#8f90c8]">{t}</span>
      <div className="flex-1 h-px bg-[#181818]" />
    </div>
  );
  // One aligned control row: right-aligned label column + wrapping controls.
  const fieldRow = (lbl: string, children: ReactNode, title?: string) => (
    <div className="flex items-baseline gap-2.5 py-[3px]">
      <span title={title} className="w-[92px] shrink-0 text-right text-[10px] text-[#666] font-semibold tracking-wider leading-5 whitespace-nowrap">{lbl}</span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
  // Colour for a syllable's band vowel (o=small, a=center, e=large; u/i = beyond).
  const vowelColor = (syl: string) => {
    const v = syl.slice(-1).toLowerCase();
    return v === "o" ? BAND_COLORS[0] : v === "e" ? BAND_COLORS[2]
      : v === "u" ? "#2f6f88" : v === "i" ? "#e6c860" : BAND_COLORS[1];
  };
  // Band colour (small/center/large) for a cents-from-tonic value.
  const bandColorForCents = (centsFromTonic: number): string => BAND_COLORS[subBandOf(centsFromTonic)];
  // Syllable stacked with octave dots (above for higher octaves, below for lower).
  // Octave dots above (higher) / below (lower).  Both rows are ALWAYS rendered —
  // invisible when there are no dots — so every note tile is the same height and
  // the rows line up symmetrically.
  const noteGlyph = (n: { syl: string; oct: number }) => (
    <span className="inline-flex flex-col items-center leading-none">
      <span className={`text-[7px] leading-none mb-px text-[#7aa0c0] ${n.oct > 0 ? "" : "invisible"}`}>{"•".repeat(Math.max(1, n.oct))}</span>
      <span className="leading-snug hover:underline group-hover:underline underline-offset-2" style={{ color: vowelColor(n.syl) }}>{n.syl}</span>
      <span className={`text-[7px] leading-none mt-px text-[#7aa0c0] ${n.oct < 0 ? "" : "invisible"}`}>{"•".repeat(Math.max(1, -n.oct))}</span>
    </span>
  );
  // Target pitches for the Pitch Trainer — every distinct note across all the
  // generated band-scales (octave-reduced), deduped, so the trainer scores your
  // singing against the actual points it just produced.
  const pitchTargets = (() => {
    const out: { cents: number; syl: string; band: number }[] = [];
    for (const sec of singSections)
      for (const n of sec.scale) {
        const c = ((n.cents % 1200) + 1200) % 1200;
        // Keep band-specific targets (dedupe only within the same band) so the
        // Pitch trainer can LOCK to one band (small/center/large = 50/12/39-EDO)
        // instead of snapping to the nearest across all three.
        if (!out.some(o => o.band === sec.band && (Math.abs(o.cents - c) < 4 || Math.abs(o.cents - c) > 1196)))
          out.push({ cents: c, syl: n.syl, band: sec.band });
      }
    return out.sort((a, b) => a.cents - b.cents);
  })();

  // Echo pool — every generated LINE (single-voice material you can sing back),
  // across all bands / modes / enabled scalar groups.  "Whatever you picked in
  // the setup" is exactly what the call-and-response randomizes among.
  const echoPool: EchoPhrase[] = (() => {
    const toNote = (n: SingNote): EchoNote => ({ abs: n.abs, cents: ((n.cents % 1200) + 1200) % 1200, syl: n.syl, oct: n.oct });
    const out: EchoPhrase[] = [];
    for (const sec of singSections)
      for (const g of sec.groups) {
        // Category used by the Echo pool toggles: scalar sub-name, or chords /
        // cycles / interchange (modal-interchange rows carry it in their title).
        const cat = g.cat === "scalar" ? (g.sub ?? "scale") : /INTERCHANGE/.test(g.title) ? "interchange" : g.cat;
        for (const seq of g.seqs) {
          const label = `${bandTitleOf(sec.band)} · ${seq.label}`;
          if (seq.kind === "line" && seq.notes.length)
            out.push({ label, cat, slots: applyStartShift(seq, sec.rawScale, g.sub).map(n => ({ notes: [toNote(n)] })) });
          else if (seq.kind === "chords" && seq.chords.length)   // chords + cycles → a box per tone
            out.push({ label, cat, slots: seq.chords.map(ch => ({ notes: [...ch.tones].sort((a, b) => a.abs - b.abs).map(toNote) })) });
        }
      }
    return out;
  })();

  // One exercise row (a line or a set of chords) — reused across the band columns.
  // Apply the transformation toggles to a line — practised dimensions, not
  // duplicates.  Inversion pivots on the first note: diatonic (i) mirrors by
  // scale STEP (stays in the mode); chromatic (c) mirrors by exact cents (leaves
  // the key).  Chromatic notes always fall back to the cents mirror.
  const transformNotes = (notes: SingNote[], rawScale: number[]): SingNote[] => {
    let ns = notes;
    const stepOf = (n: SingNote): number | null => {
      const d = rawScale.findIndex(c => Math.abs(c - n.cents) < 1);
      return d < 0 ? null : d + 7 * n.oct;
    };
    // Diatonic interval expansion / contraction: widen (or narrow) every melodic
    // interval by `patExpand` scale steps, keeping its direction — a motivic
    // transform that stays in the scale.  Only applies when every note is a scale
    // tone (off-scale lines have no diatonic interval to scale).
    if (patExpand !== 0 && ns.length > 1) {
      const steps = ns.map(stepOf);
      if (steps.every(s => s !== null)) {
        const out = [steps[0] as number];
        for (let i = 1; i < steps.length; i++) {
          const d = (steps[i] as number) - (steps[i - 1] as number);
          const mag = Math.max(0, Math.abs(d) + patExpand);       // narrow to a unison, never flip direction
          out.push(out[i - 1] + Math.sign(d) * mag);
        }
        ns = out.map(s => stepNote(rawScale, s));
      }
    }
    const chromMirror = (f: number, n: SingNote) => centsNote(2 * f - (n.abs + 1200 - rootCents));
    if (patInv === "chrom" && ns.length) {
      const f = ns[0].abs + 1200 - rootCents;
      ns = ns.map(n => chromMirror(f, n));
    } else if (patInv === "dia" && ns.length) {
      const fStep = stepOf(ns[0]), fCents = ns[0].abs + 1200 - rootCents;
      ns = ns.map(n => {
        const st = stepOf(n);
        return fStep === null || st === null ? chromMirror(fCents, n) : stepNote(rawScale, 2 * fStep - st);
      });
    }
    if (patRetro) ns = [...ns].reverse();
    return ns;
  };
  // ── Logbook: persistence, drag-selection & mutation ──────────────
  useEffect(() => { try { localStorage.setItem(LOG_KEY, JSON.stringify(patternLog)); } catch { /* quota */ } }, [patternLog]);
  useEffect(() => {
    const up = () => { dragRef.current.on = false; };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);
  // Meta for every pattern rendered this pass, so a control can log ids that
  // aren't in the store yet (e.g. when applying to a whole drag-selection).
  const logMetaRef = useRef<Record<string, { cat: string; group: string; label: string }>>({});
  // A control affects the whole selection when its pattern is part of a
  // multi-selection; otherwise just itself.
  const logTargets = (id: string): string[] => (logSel.size > 1 && logSel.has(id) ? [...logSel] : [id]);
  const mutateLog = (ids: string[], fn: (e: LogEntry) => LogEntry) =>
    setPatternLog(prev => {
      const next = { ...prev };
      for (const id of ids) {
        const meta = logMetaRef.current[id] ?? { cat: "", group: "", label: id };
        const cur: LogEntry = next[id] ?? { ...meta, status: 0, bands: [false, false, false], day: todayKey(), ts: 0 };
        next[id] = { ...fn({ ...cur, ...meta }), day: todayKey(), ts: Date.now() };
      }
      return next;
    });
  const cycleLogStatus = (id: string) => mutateLog(logTargets(id), e => ({ ...e, status: (e.status + 1) % 4 }));
  const toggleLogBand = (id: string, b: number) => mutateLog(logTargets(id), e => {
    const bands: [boolean, boolean, boolean] = [...e.bands];
    bands[b] = !bands[b];
    return { ...e, bands };
  });
  // Drag to select a run of patterns: mousedown toggles and sets the direction,
  // mouseenter over another handle repeats it until mouseup.
  const selectDown = (id: string) => {
    const add = !logSel.has(id);
    dragRef.current = { on: true, add };
    setLogSel(prev => { const nx = new Set(prev); if (add) nx.add(id); else nx.delete(id); return nx; });
  };
  const selectEnter = (id: string) => {
    if (!dragRef.current.on) return;
    setLogSel(prev => { const nx = new Set(prev); if (dragRef.current.add) nx.add(id); else nx.delete(id); return nx; });
  };
  // Status circle (unset → complete → WIP → failure) + small/center/large marks.
  const logControl = (id: string) => {
    const e = patternLog[id];
    const st = e?.status ?? 0;
    return (
      <span className="inline-flex items-center gap-0.5 ml-1 align-middle">
        <button onMouseDown={ev => ev.stopPropagation()} onClick={ev => { ev.stopPropagation(); cycleLogStatus(id); }}
          title={`Logbook: ${LOG_STATUS_NAMES[st]} — click to cycle`}
          className="w-2.5 h-2.5 rounded-full border border-[#3a3a3a] shrink-0"
          style={{ background: LOG_STATUS_COLORS[st] }} />
        {([0, 1, 2] as const).map(b => (
          <button key={b} onMouseDown={ev => ev.stopPropagation()} onClick={ev => { ev.stopPropagation(); toggleLogBand(id, b); }}
            title={`Mark ${bandTitleOf(b)} worked`}
            className="text-[8px] leading-none px-0.5 rounded-sm border"
            style={e?.bands[b]
              ? { background: BAND_COLORS[b], borderColor: BAND_COLORS[b], color: "#0b0b0b" }
              : { background: "transparent", borderColor: "#2a2a2a", color: "#555" }}>
            {bandLabelOf(b)[0].toUpperCase()}
          </button>
        ))}
      </span>
    );
  };

  const renderSeq = (seq: SingSeq, qi: number, rawScale: number[], keyPrefix: string, logId: string, logMeta: { cat: string; group: string; label: string }) => {
    logMetaRef.current[logId] = logMeta;
    // Start-degree shift (keys 1–7 in the Scalar tab) via the shared helper, then
    // the transform toggles.  Resolution is exempt inside applyStartShift.
    const notes = seq.kind === "line" ? transformNotes(applyStartShift(seq, rawScale, scalarSub), rawScale) : [];
    // Global harmonization voices (scalar diatonic lines only; chromatic-inversion
    // lines are left alone since they leave the scale).  Register every walkable
    // line — base, each harmony voice, and (for chord rows) the top voice — so the
    // walking cursor can look them up by key.
    const harmVoices = (seq.kind === "line" && seq.steps && patInv !== "chrom" && harmonize.size)
      ? HARMS.filter(h => harmonize.has(h.id)).map(h => ({ id: h.id, label: h.label, delta: h.delta, notes: harmonizeNotes(notes, rawScale, h.delta) }))
      : [];
    // Walk keys are BAND-SPECIFIC (keyPrefix carries the section index) — the same
    // pattern in the small/center/large columns is a different pitch set, so each
    // gets its own walkable line.  (logId stays band-independent for the logbook.)
    // Chord rows: one walkable line per VOICE (highest tone = voice 0, down to the
    // shared minimum voice count) so you can drone a single voice and step it
    // chord-to-chord across the cycle / progression.
    const chordVoices = seq.kind === "chords" ? Math.min(...seq.chords.map(c => c.tones.length)) : 0;
    if (seq.kind === "line") {
      walkNotesRef.current[keyPrefix] = notes.map(n => n.abs);
      for (const hv of harmVoices) walkNotesRef.current[`${keyPrefix}#${hv.id}`] = hv.notes.map(n => n.abs);
    } else {
      for (let vi = 0; vi < chordVoices; vi++)
        walkNotesRef.current[`${keyPrefix}#v${vi}`] = seq.chords.map(ch => [...ch.tones].sort((a, b) => b.abs - a.abs)[vi].abs);
    }
    // Voice indices being walked in THIS row (for tone highlighting).
    const walkedVoices = new Set(walk.keys.filter(k => k.startsWith(`${keyPrefix}#v`)).map(k => parseInt(k.slice(`${keyPrefix}#v`.length), 10)));
    // One walkable note-row.  A FIXED-width left gutter (tag · ○ · ▶) keeps the note
    // columns aligned across the base line and its harmony voices, so a 3rd-up sits
    // directly above its note.  Harmony notes are tinted green; the walk position is
    // ringed cyan.
    const noteRow = (rowKey: string, rowNotes: SingNote[], walkKey: string, tag?: string, harm?: boolean) => {
      const wi = walk.keys.includes(walkKey) ? Math.min(walk.index, rowNotes.length - 1) : -1;
      return (
        <div key={rowKey} className="flex items-start gap-2">
          <div className="w-[70px] shrink-0 flex items-center gap-1.5">
            {/* Fixed-width tag slot (always present) so the ○ and ▶ line up
                across the base line and its harmony voices. */}
            <span className="w-[20px] shrink-0 text-[9px] font-mono leading-none overflow-hidden whitespace-nowrap"
              style={{ color: harm ? HARM_COLOR : "#777" }}>{tag ?? ""}</span>
            {walkCircle(walkKey, false)}
            <button onClick={() => playSeq(rowNotes)} title="Hear this line"
              className="bg-[#7173e6] hover:bg-[#5a5cc8] text-white px-2 py-1 rounded text-xs transition-colors shrink-0">▶</button>
          </div>
          <div className="flex gap-1 flex-wrap">
            {rowNotes.map((n, j) => (
              <button key={j} onClick={() => playOne(n.abs)} title="Click to hear this note"
                className={`min-w-[34px] rounded border px-1.5 py-1 text-sm font-mono ${j === wi ? "border-[#4a9ac7] ring-2 ring-[#4a9ac7]/60" : ""}`}
                style={j === wi ? { background: "#4a9ac726" } : harm ? { borderColor: HARM_COLOR + "66", background: HARM_COLOR + "14" } : { borderColor: "#242424", background: "#101014" }}>
                {noteGlyph(n)}
              </button>
            ))}
          </div>
        </div>
      );
    };
    // Up-harmonies render ABOVE the base (bigger interval higher), down-harmonies below.
    const upV = harmVoices.filter(h => h.delta > 0).sort((a, b) => b.delta - a.delta);
    const downV = harmVoices.filter(h => h.delta < 0).sort((a, b) => b.delta - a.delta);
    // Chord rows are labelled by degree — show the root's sized ROMAN numeral with
    // the ↓/↑ band arrow (Solfège-chart convention: ↓ small · bare center · ↑
    // large), e.g. "↓iii", not an interval code.
    const romanDeg = ROMAN_NUMERALS.indexOf(seq.label);
    const rowCode = romanDeg >= 0 ? romanBandArrow(rawScale[romanDeg]) : null;
    // Modal-interchange rows carry the `mi` flag — tint them apart.
    const isMI = seq.kind === "chords" && !!seq.mi;
    return (
    // Line rows claim the full width; chord rows shrink to content so several sit
    // side by side in the wrapping group container.
    <div key={qi} className={seq.kind === "line" ? "space-y-1 w-full" : "space-y-1"}>
      {/* Row label doubles as the logbook handle — click or drag across to select,
          then the circle / S·C·L marks apply to the whole selection. */}
      <div className={`text-[10px] font-mono flex items-center gap-2 rounded px-1 -mx-1 cursor-pointer select-none ${logSel.has(logId) ? "ring-1 ring-[#7173e6] bg-[#7173e6]/10" : ""}`}
        onMouseDown={() => selectDown(logId)} onMouseEnter={() => selectEnter(logId)}>
        {rowCode
          ? <span className="text-sm font-semibold" style={{ color: bandColorForCents(rawScale[romanDeg]) }}>{rowCode}</span>
          : <span className={seq.kind === "chords" ? "text-sm font-semibold" : ""} style={{ color: isMI ? MI_TINT : "#9a9a9a" }}>{seq.label}</span>}
        {/* ▶ to the RIGHT of the label (chord/cycle rows only); line rows keep a ▶ per note-row. */}
        {seq.kind === "chords" && (
          <button onMouseDown={e => e.stopPropagation()} onClick={() => playFrames(seq.chords.map(c => c.tones.map(t => t.abs)))} title="Hear all voicings (one-shot)"
            className="bg-[#7173e6] hover:bg-[#5a5cc8] text-white px-2 py-0.5 rounded text-[11px] transition-colors shrink-0">▶</button>
        )}
        <span className="ml-auto flex items-center gap-1">
          <span className="text-[8px] tracking-wider text-[#555] uppercase">log</span>
          {logControl(logId)}
        </span>
      </div>
      {seq.kind === "line" ? (
        <div className="space-y-1">
          {upV.map(hv => noteRow(hv.id, hv.notes, `${keyPrefix}#${hv.id}`, hv.label, true))}
          {noteRow("base", notes, keyPrefix)}
          {downV.map(hv => noteRow(hv.id, hv.notes, `${keyPrefix}#${hv.id}`, hv.label, true))}
        </div>
      ) : (
        <div className="flex items-start gap-2">
          {/* One ○ per voice — a "control card" using a real chord card's box model
              (same padding/label spacer, and each cell mirrors noteGlyph exactly with
              the ○ in the syllable slot) so every dot sits on its voice row. */}
          <div className="flex flex-col items-center gap-0 rounded-md border border-transparent px-1.5 py-1 min-w-[42px] shrink-0">
            <span className={`${INV_SHORT.includes(seq.chords[0]?.label ?? "") ? "text-[8px]" : "text-[11px]"} leading-none mb-0.5 invisible`}>I</span>
            {Array.from({ length: chordVoices }, (_, vi) => (
              <span key={vi} className="text-xs font-mono leading-tight rounded-sm px-1">
                <span className="inline-flex flex-col items-center leading-none">
                  <span className="text-[7px] leading-none mb-px invisible">•</span>
                  <span className="leading-snug inline-flex items-center">{walkCircle(`${keyPrefix}#v${vi}`, false)}</span>
                  <span className="text-[7px] leading-none mt-px invisible">•</span>
                </span>
              </span>
            ))}
          </div>
          {/* Chords tab keeps every inversion on ONE line; cycles have many cards
              per row so those still wrap. */}
          <div className={`flex-1 flex gap-1 ${singTab === "chords" ? "flex-nowrap" : "flex-wrap content-start"}`}>
            {seq.chords.map((ch, j) => {
              const cardId = `${keyPrefix}:${j}`;
              const cardOn = droningId === cardId;
              // Cycle / interchange cards are labelled by the sized ROMAN numeral of
              // the chord's root (↓iii / ↑III / bVII …).  Chord-tab cards are
              // inversions (ch.label = "root"/"1st inv") — those keep their label.
              // A card labelled with an INVERSION name renders like the regular
              // chords (small grey caption) — the roman lives on the row header.
              // Only degree-labelled cards (cycle / A-B) get the big roman caption.
              const isInvLabel = INV_SHORT.includes(ch.label ?? "");
              const isCycleCard = !isInvLabel && (isMI || ROMAN_NUMERALS.includes(ch.label ?? ""));
              const cardRootTone = isCycleCard ? ch.tones.find(t => t.root) : undefined;
              const cardRomanCode = isInvLabel ? null
                : isMI ? (ch.label ?? null)
                : (cardRootTone ? romanBandArrow(cardRootTone.cents) : null);
              // Only the BORROWED card is tinted — the diatonic half of an A/B pair
              // stays neutral so the swap reads at a glance.
              const isBorrowed = isMI && !!ch.borrowed;
              return (
              <div key={j} role="button" tabIndex={0} title="Click to drone the whole chord (click again to stop)"
                onClick={() => toggleDrone(cardId, ch.tones.map(t => t.abs))}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleDrone(cardId, ch.tones.map(t => t.abs)); } }}
                className={`flex flex-col items-center gap-0 rounded-md border px-1.5 py-1 min-w-[42px] cursor-pointer transition-colors ${cardOn ? "border-[#e0b060] ring-2 ring-[#e0b060]/50" : isBorrowed ? "border-[#7a5a2a] bg-[#191309] hover:border-[#d08a3a]" : "border-[#2a2a3a] bg-[#14141c] hover:border-[#7173e6]/60"}`}>
                {/* Card drones the whole chord; hovering a solfège underlines it and clicking drones just that note. */}
                {cardRomanCode
                  ? <span className="text-[11px] leading-none mb-0.5 font-semibold" style={{ color: bandColorForCents(cardRootTone!.cents) }}>{cardRomanCode}</span>
                  : <span className="text-[8px] leading-none mb-0.5 text-[#777]">{ch.label || (cardOn ? "●" : "▶")}</span>}
                {[...ch.tones].reverse().map((t, k) => {
                  const noteId = `${cardId}:n${k}`;
                  const noteOn = droningId === noteId;
                  // Ringed cyan when the walking cursor is on this chord (j) and this
                  // voice (k, from the top).
                  const voiceWalked = j === walk.index && walkedVoices.has(k);
                  return (
                  <button key={k}
                    onClick={e => { e.stopPropagation(); playOne(t.abs); }}
                    title="Click to hear this note momentarily"
                    className={`group text-xs font-mono leading-tight rounded-sm px-1 hover:bg-[#7173e6]/20 ${voiceWalked ? "bg-[#4a9ac7]/25 ring-2 ring-[#4a9ac7]/70" : noteOn ? "bg-[#e0b060]/25 ring-1 ring-[#e0b060]/60" : t.root ? "bg-[#e0609f]/18 ring-1 ring-[#e0609f]/40" : ""}`}>{noteGlyph(t)}</button>
                  );
                })}
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
  };
  // Per-interval spectrum: one strip per note, zoomed to THAT interval's region
  // (like the Interval Spectrum tab) with its small/center/large sub-bands, JI
  // landmarks in range, and a marker where the note landed.
  const intervalSpectrum = (notes: { syl: string; cents: number }[]) => (
    <div className="mt-2 flex flex-col gap-1">
      {notes.map((n, j) => {
        const c = ((n.cents % 1200) + 1200) % 1200;
        const region = regionForCents(c);
        const color = vowelColor(n.syl);
        if (!region || !region.subs) {
          return (
            <div key={j} className="flex items-center gap-2 text-[10px]">
              <span className="w-24 text-[#888]">{c < 6 || c > 1194 ? "unison / octave" : "—"}</span>
              <span className="font-mono" style={{ color }}>{n.syl}</span>
              <span className="text-[#666] font-mono">{Math.round(c)}¢</span>
            </div>
          );
        }
        const span = region.hi - region.lo;
        const pct = (v: number) => `${((v - region.lo) / span) * 100}%`;
        return (
          <div key={j} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-[10px] text-[#888] truncate" title={region.name}>{region.name.toLowerCase()}</span>
            <div className="relative flex-1 h-7 rounded bg-[#0a0a0a] border border-[#1a1a1a] overflow-hidden">
              {region.subs.map((s, i) => (
                <div key={i} className="absolute top-0 bottom-0" style={{ left: pct(s.lo), width: `${((s.hi - s.lo) / span) * 100}%`, background: BAND_COLORS[i] + "22" }} />
              ))}
              {JI_REFS.filter(r => r.cents >= region.lo && r.cents <= region.hi).map(r => (
                <div key={r.label} className="absolute bottom-0 flex flex-col items-center pointer-events-none" style={{ left: pct(r.cents), transform: "translateX(-50%)" }}>
                  <div className="w-px h-1.5 bg-[#3f6f6f]" />
                  <span className="text-[7px] leading-none text-[#4d7d7d] font-mono">{r.label}</span>
                </div>
              ))}
              <div className="absolute top-0.5 flex flex-col items-center pointer-events-none" style={{ left: pct(c), transform: "translateX(-50%)" }}>
                <span className="text-[9px] font-mono leading-none" style={{ color }}>{n.syl}</span>
                <div className="w-[3px] h-3.5 rounded-full" style={{ background: color }} />
              </div>
            </div>
            <span className="w-10 shrink-0 text-right text-[9px] text-[#888] font-mono">{Math.round(c)}¢</span>
          </div>
        );
      })}
    </div>
  );
  const setRootFromEvent = (e: { clientX: number }) => {
    const el = rootRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    setRootCents(Math.max(0, Math.min(1200, ((e.clientX - rect.left) / rect.width) * 1200)));
  };

  // Shared band controls (Chords + Sing): one universal set for the blendable
  // degrees (2·3·6·7) plus dedicated fine-tune controls for the perfect 4th/5th.
  const bandControls = (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <div className="flex items-center gap-1">{label(bandSystem === "edo" ? "EDO" : "BANDS 2·3·6·7")}
        {([0, 1, 2] as Band[]).map(b => bandBtn(b, specBands.has(b), () => toggleIn(setSpecBands, b, true)))}
      </div>
      {/* Per-degree 4th/5th fine-tuning is meaningless in EDO mode — the whole
          chord sits in one tuning — so hide those rows there. */}
      {bandSystem !== "edo" && <>
        <div className="flex items-center gap-1">{label("4TH")}
          {([0, 1, 2] as Band[]).map(b => bandBtn(b, specBand4.has(b), () => toggleIn(setSpecBand4, b, true)))}
        </div>
        <div className="flex items-center gap-1">{label("5TH")}
          {([0, 1, 2] as Band[]).map(b => bandBtn(b, specBand5.has(b), () => toggleIn(setSpecBand5, b, true)))}
        </div>
      </>}
    </div>
  );

  const romanCard = (q: Quality, roman: string, degIdx: number) => {
    const checked = checkedRomans[q].has(roman);
    const kinds: Kind[] = degIdx === 0 ? ["TT"] : KINDS;
    return (
      <div key={roman} className="relative rounded-md overflow-hidden border transition-colors flex flex-col h-full"
        style={checked ? { background: ACCENT + "26", borderColor: ACCENT } : { background: "#141414", borderColor: "#1e1e1e" }}>
        <button onClick={() => toggleRoman(q, roman)}
          className={`flex-1 w-full px-2 py-2 text-lg font-semibold italic text-left transition-colors ${checked ? "" : "text-[#5f5f5f] hover:text-[#888]"}`}
          style={checked ? { color: "#cfd0ff" } : undefined}>
          {roman}
        </button>
        <div className="flex gap-0.5 px-1 pb-1">
          {kinds.map(k => {
            const lbl = KIND_PREFIX[k] + CARD_TOKENS[degIdx];
            const on = applied.has(lbl);
            const color = APPROACH_COLORS[k];
            return (
              <button key={k} onClick={() => checked ? toggleIn(setApplied, lbl) : toggleRoman(q, roman)}
                title={checked ? `${KIND_SHORT[k]}${roman}` : `Enable ${roman} first`}
                className={`relative flex-1 min-h-[22px] text-[10px] leading-tight px-1 py-1 rounded border transition-colors ${
                  !checked ? "bg-[#141414] text-[#4d4d4d] border-[#222]"
                    : on ? "text-black font-semibold" : "bg-[#1a1a1a] text-[#888] border-[#333] hover:text-[#ddd] hover:border-[#555]"}`}
                style={checked && on ? { background: color, borderColor: color } : undefined}>
                {KIND_SHORT[k]}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const modeBtn = (m: Mode, text: string) => (
    <button key={m} onClick={() => setMode(m)}
      className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
        mode === m ? "bg-[#7173e6] text-white shadow-[0_1px_6px_rgba(113,115,230,0.4)]" : "text-[#777] hover:text-[#cfcfcf]"}`}>
      {text}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Mode selector — Sing / Echo up front; Chords & Intervals behind a beta toggle. */}
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-lg border border-[#242424] bg-[#0b0b0b] p-0.5 gap-0.5">
          {modeBtn("sing", "Sing")}
          {modeBtn("echo", "Echo")}
        </div>
        <button onClick={() => setBetaOpen(o => !o)}
          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${betaOpen ? "border-[#3a3424] bg-[#1e1a10] text-[#cab48a]" : "border-[#242424] bg-[#0b0b0b] text-[#666] hover:text-[#aaa]"}`}>
          beta {betaOpen ? "▾" : "▸"}
        </button>
        {betaOpen && (
          <div className="inline-flex rounded-lg border border-[#3a3424] bg-[#0b0b0b] p-0.5 gap-0.5">
            {modeBtn("chords", "Chords")}
            {modeBtn("intervals", "Intervals")}
          </div>
        )}
        {/* Band system — the three slots are either Schulter sub-bands
            (small/center/large) or the 50/12/39-EDO diatonic-MOS tunings. */}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] text-[#555] font-semibold tracking-wider">BANDS</span>
          <div className="inline-flex rounded-lg border border-[#242424] bg-[#0b0b0b] p-0.5 gap-0.5">
            {([["spectrum", "Spectrum"], ["edo", "50·12·39 EDO"]] as const).map(([id, text]) => (
              <button key={id} onClick={() => setBandSystem(id)}
                title={id === "edo"
                  ? "Three slots become the 50 / 12 / 39-EDO diatonic scales (each the MOS generated by that tuning's fifth: small / center / large 3rds)"
                  : "Three slots are the small / center / large Schulter sub-bands"}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  bandSystem === id ? "bg-[#7173e6] text-white shadow-[0_1px_6px_rgba(113,115,230,0.4)]" : "text-[#777] hover:text-[#cfcfcf]"}`}>
                {text}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Practice techniques — shared across all modes. */}
      <div className="rounded-lg border border-[#1e1e1e] bg-[#0c0c0c] overflow-hidden">
        <button onClick={() => setTechOpen(o => !o)}
          className="w-full px-3 py-1.5 flex items-center gap-2 bg-[#0a0a0a] hover:bg-[#0e0e0e] transition-colors">
          <span className="w-1.5 h-3 rounded-sm" style={{ background: "#7aa87a" }} />
          <span className="text-[10px] font-semibold tracking-widest text-[#8a8a8a]">PRACTICE TECHNIQUES</span>
          <span className="ml-auto text-[#555] text-[10px]">{techOpen ? "▲" : "▼"}</span>
        </button>
        {techOpen && (
          <div className="p-3 pt-2 space-y-2.5 border-t border-[#161616]">
            {PRACTICE_TECHNIQUES.map((t, i) => (
              <p key={i} className="text-[11px] leading-relaxed text-[#9a9a9a]">
                <span className="text-[#cfe6ff] font-semibold">{t.title}.</span> {t.body}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Root — one-octave spectrum line: click it or randomize the tonic pitch. */}
      <Panel title="ROOT · CLICK THE SPECTRUM OR RANDOMIZE" accent="#7aa87a">
        <div className="flex items-center gap-2">
          <button onClick={() => setRootCents(Math.random() * 1200)}
            className="shrink-0 bg-[#1e1e1e] hover:bg-[#2a2a2a] border border-[#333] text-[#cfe6ff] px-3 py-1.5 rounded text-xs font-medium transition-colors">
            🎲 Random
          </button>
          <button onClick={() => playOne(rootCents - 1200)}
            title="Hear the tonic (root) pitch"
            className="shrink-0 bg-[#1e1e1e] hover:bg-[#2a2a2a] border border-[#333] text-[#cfe6ff] px-3 py-1.5 rounded text-xs font-medium transition-colors">
            ♪ Tonic
          </button>
          <div ref={rootRef} onClick={setRootFromEvent}
            className="relative flex-1 h-12 rounded bg-[#0a0a0a] border border-[#1a1a1a] cursor-pointer overflow-hidden">
            <SpectrumRefs />
            <div className="absolute top-0 bottom-0 w-[3px] bg-[#7aa87a]" style={{ left: `${(rootCents / 1200) * 100}%`, transform: "translateX(-50%)" }} />
          </div>
          <span className="shrink-0 w-16 text-right text-[11px] text-[#888] font-mono">{Math.round(rootCents)}¢</span>
        </div>
      </Panel>

      {mode === "chords" && (<>
        <Panel title="SETUP">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
            <div className="flex items-center gap-1">{label("SCALE")}
              {QUALITIES.map(q => <button key={q} onClick={() => toggleIn(setQualities, q, true)} className={chip(qualities.has(q))}>{q === "major" ? "Major" : "Minor"}</button>)}
            </div>
            <div className="flex items-center gap-1">{label("CHORD")}
              <button onClick={() => toggleIn(setShapes, "triad", true)} className={chip(shapes.has("triad"))}>Triad</button>
              <button onClick={() => toggleIn(setShapes, "seventh", true)} className={chip(shapes.has("seventh"))}>7th</button>
            </div>
            <div className="flex items-center gap-1">{label("EXT")}
              {[9, 11, 13].map(n => <button key={n} onClick={() => toggleIn(setExt, n)} className={chip(ext.has(n))}>{n}</button>)}
            </div>
            <div className="flex items-center gap-1">{label("INV")}
              {[0, 1, 2, 3].map(k => <button key={k} onClick={() => toggleIn(setInversions, k, true)} className={chip(inversions.has(k))}>{k === 0 ? "root" : k === 1 ? "1st" : k === 2 ? "2nd" : "3rd"}</button>)}
            </div>
            <div className="flex items-center gap-1"><span title="Voicing spread — Open + Drop voicings need a 7th/extension to be audible">{label("VOICING")}</span>
              {VOICINGS.map(v => <button key={v.id} onClick={() => toggleIn(setVoicings, v.id, true)} className={chip(voicings.has(v.id))}>{v.label}</button>)}
            </div>
            <div className="flex items-center gap-1"><span title="octave 3 = C3-C4 = 0 dots">{label("OCTAVE")}</span>
              {[1, 2, 3, 4, 5, 6].map(o => <button key={o} onClick={() => toggleIn(setOctaves, o, true)} className={chip(octaves.has(o))}>{o}</button>)}
            </div>
            <div className="flex items-center gap-1">{label("CHORDS")}{numInput(loopLength, setLoopLength, 1, 16)}</div>
          </div>
        </Panel>

        {/* Roman-numeral + Modal-Interchange cards (EDO-style) */}
        <div className="grid gap-3 md:grid-cols-2">
          {QUALITIES.filter(q => qualities.has(q)).map(q => (
            <Panel key={q} title={q === "major" ? "MAJOR" : "MINOR"}>
              <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-3 auto-rows-fr">
                {ROMANS[q].map((roman, degIdx) => romanCard(q, roman, degIdx))}
              </div>
            </Panel>
          ))}
          <Panel title="MODAL INTERCHANGE" accent="#c77a4a">
            <div className="grid gap-1.5 grid-cols-3 sm:grid-cols-4 auto-rows-fr">
              {BORROWED_ORDER.map(m => {
                const on = applied.has(m);
                return (
                  <button key={m} onClick={() => toggleIn(setApplied, m)}
                    className="rounded-md overflow-hidden border px-2 py-2 text-base font-semibold italic text-left transition-colors"
                    style={on ? { background: "#c77a4a26", borderColor: "#c77a4a", color: "#e6b48c" } : { background: "#141414", borderColor: "#1e1e1e", color: "#5f5f5f" }}>
                    {m}
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>

        <Panel title={bandSystem === "edo" ? "TUNING · 50 / 12 / 39-EDO" : "SPECTRUM · SMALL / CENTER / LARGE"} accent={BAND_COLORS[1]}>{bandControls}</Panel>
      </>)}

      {mode === "intervals" && (<>
        <Panel title="SETUP">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
            <div className="flex items-center gap-1"><span title="How many notes sound simultaneously (tonic + intervals). 2 = a dyad.">{label("AT ONCE")}</span>{numInput(noteCount, setNoteCount, 2, 8)}</div>
            <div className="flex items-center gap-1"><span title="How many stacks to play one after another (e.g. 5 intervals in succession).">{label("IN A ROW")}</span>{numInput(ivlSeq, setIvlSeq, 1, 8)}</div>
            <div className="flex items-center gap-1">{label("BANDS")}
              {([0, 1, 2] as Band[]).map(b => bandBtn(b, ivlBands.has(b), () => toggleIn(setIvlBands, b, true)))}
            </div>
            <div className="flex items-center gap-1">{label("DYADS")}
              {DYAD_PRESETS.map(p => (
                <button key={p.label} onClick={() => { setIvlSel(new Set(p.ids)); setNoteCount(2); }}
                  title={`Train ${p.label} as dyads over the tonic`}
                  className={chip(p.ids.length === ivlSel.size && p.ids.every(id => ivlSel.has(id)) && noteCount === 2)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </Panel>
        <Panel title="INTERVALS">
          <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 auto-rows-fr">
            {INTERVALS.map(iv => {
              const on = ivlSel.has(iv.id);
              return (
                <button key={iv.id} onClick={() => toggleIn(setIvlSel, iv.id)}
                  className="rounded-md overflow-hidden border px-2 py-2 text-sm font-semibold text-left transition-colors"
                  style={on ? { background: ACCENT + "26", borderColor: ACCENT, color: "#cfd0ff" } : { background: "#141414", borderColor: "#1e1e1e", color: "#5f5f5f" }}>
                  {iv.label}
                </button>
              );
            })}
          </div>
        </Panel>
      </>)}

      {(mode === "sing" || mode === "echo") && (<>
        <Panel title="SETUP">
          {/* ── Scale: mode families + microtonal tuning of the neutral degrees ── */}
          {sectionHead("SCALE")}
          <div className="space-y-0.5">
            {MODE_FAMILIES.map((fam, fi) => {
              const ids = fam.ids.map(id => MODE_BY_ID.get(id)!).filter(Boolean);
              return fieldRow(
                fam.label,
                <>
                  {ids.map(m => <button key={m.id} onClick={() => setSingModes(new Set([m.id]))} className={chip(singModes.has(m.id))}>{m.label}</button>)}
                </>,
                fi === 0 ? "Pick ONE scale — every band mirrors the same exercises re-tuned to it." : undefined,
              );
            })}
            {/* Per-degree microtuning is only meaningful for the small/center/large
                sub-bands; in EDO mode each section IS one whole tuning, so hide it. */}
            {bandSystem !== "edo" && fieldRow(
              "TUNING",
              <>
                {([["2nd", specBand2, setSpecBand2], ["4th", specBand4, setSpecBand4], ["5th", specBand5, setSpecBand5]] as const).map(([nm, st, setter], i) => (
                  <span key={nm} className="flex items-center gap-1">
                    {i > 0 && <span className="w-px h-4 bg-[#1e1e1e] mx-1.5" />}
                    <span className="text-[10px] text-[#777] font-mono mr-0.5">{nm}</span>
                    {([0, 1, 2] as Band[]).map(b => bandBtn(b, st.has(b), () => toggleIn(setter, b, true)))}
                  </span>
                ))}
              </>,
              "Microtonal tuning of the neutral 2nd / 4th / 5th — shared across every band so they never smear out of tune.",
            )}
            {fieldRow(
              "SCALAR GEN",
              <>
                {SCALAR_SUBS.map(s => (
                  <button key={s.id} onClick={() => toggleIn(setScalarGen, s.id, true)} className={chip(scalarGen.has(s.id))}>{s.label}</button>
                ))}
              </>,
              "Which scalar groups get generated (and feed the Echo phrase pool). Toggle off what you don't want to drill.",
            )}
            {fieldRow(
              "HARMONIZE",
              HARMS.map(h => <button key={h.id} onClick={() => toggleIn(setHarmonize, h.id)} className={chip(harmonize.has(h.id))}>{h.label}</button>),
              "Add a parallel voice a diatonic 3rd/4th/5th above or below every scalar line — shown beneath it, with its own ○ walk handle.",
            )}
          </div>

          {/* ── Chords: structures → voicings → root cycles (mirrors the Almanac) ── */}
          <div className="mt-3 pt-2.5 border-t border-[#161616]">
            {sectionHead("CHORDS")}
            <div className="space-y-0.5">
              {CHORD_GROUPS.map(g => {
                // OVER-BASS is folded into 4-PART CHORDS (they ARE 4-part chords),
                // as family buttons that expand a member row on click and stay
                // open until toggled off.
                if (g.group === "OVER-BASS") return null;
                if (g.group === "4-PART CHORDS") {
                  // A family's members show if it's toggled open OR has any
                  // selected member — so several families can be open at once.
                  const openFams = OVERBASS_FAMILIES.filter(f => obOpen.has(f.key) || f.members.some(m => chordTypes.has(m.id)));
                  return (
                    <div key={g.group}>
                      {fieldRow(
                        g.group,
                        <>
                          {g.items.map(c => <button key={c.id} onClick={() => toggleIn(setChordTypes, c.id)} className={chip(chordTypes.has(c.id))}>{c.label}</button>)}
                          <span className="w-px h-4 bg-[#2a2a2a] mx-1" />
                          {OVERBASS_FAMILIES.map(f => {
                            const anyOn = f.members.some(m => chordTypes.has(m.id));
                            const open = obOpen.has(f.key);
                            return (
                              <button key={f.key} onClick={() => obToggleFamily(f.key)}
                                title={`${f.label} — ${f.desc}`}
                                className="px-2.5 py-0.5 rounded text-[11px] font-semibold border transition-colors"
                                style={open || anyOn
                                  ? { background: f.color + (open ? "33" : "1f"), borderColor: f.color, color: f.color }
                                  : { background: "#1a1a1a", borderColor: "#2a2a2a", color: "#9a9a9a" }}>
                                {f.label}
                                {anyOn && <span className="ml-1 text-[9px] opacity-80">{f.members.filter(m => chordTypes.has(m.id)).length}</span>}
                              </button>
                            );
                          })}
                        </>,
                      )}
                      {openFams.map(fam => (
                        <div key={fam.key}>
                          {fieldRow(
                            "",
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-[9px] font-mono uppercase tracking-wider mr-0.5" style={{ color: fam.color }}>{fam.key}</span>
                              {fam.members.map(m => (
                                <ObMemberChip key={m.id} m={m} color={fam.color}
                                  active={chordTypes.has(m.id)} onToggle={() => toggleIn(setChordTypes, m.id)} />
                              ))}
                            </div>,
                          )}
                        </div>
                      ))}
                    </div>
                  );
                }
                return (
                  <div key={g.group}>
                    {fieldRow(
                      g.group,
                      g.items.map(c => <button key={c.id} onClick={() => toggleIn(setChordTypes, c.id)} className={chip(chordTypes.has(c.id))}>{c.label}</button>),
                    )}
                  </div>
                );
              })}
              {fieldRow(
                "VOICINGS",
                VOICING_TYPES.map(v => <button key={v.id} onClick={() => toggleIn(setSingVoicings, v.id, true)} className={chip(singVoicings.has(v.id))}>{v.label}</button>),
                "Voicings applied to the closed voicing of the selected chords. Drops need a 4-note chord.",
              )}
              {chordTypes.has("triad") && fieldRow(
                "TRIAD SPREAD",
                TRIAD_VOICINGS.map(v => <button key={v.id} onClick={() => toggleIn(setSingTriadVoicings, v.id, true)} className={chip(singTriadVoicings.has(v.id))}>{v.label}</button>),
                "Spread voicings for the triad (Vol-1): closed, spread (1-5-3 open), octave-inserted, and both.",
              )}
              {/* Modal interchange — its own toggle, ABOVE cycles; its borrowed
                  chords appear in BOTH the Chords and Cycles tabs. */}
              {fieldRow(
                "MODAL INTER.",
                <button onClick={() => setShowInterchange(v => !v)} className={chip(showInterchange)}>{showInterchange ? "On" : "Off"}</button>,
                "Show each borrow mode's characteristic borrowed chords (bIII, ↓iii, …) — in both the Chords and Cycles tabs.",
              )}
              {showInterchange && fieldRow(
                "BORROW FROM",
                MODE_FAMILIES.map((fam, fi) => (
                  <span key={fam.label} className="flex items-center gap-1">
                    {fi > 0 && <span className="w-px h-4 bg-[#1e1e1e] mx-1" />}
                    {/* Full mode names, same as the SCALE row.  The scale you're
                        already in isn't offered — you can't borrow from yourself. */}
                    {fam.ids.map(id => MODE_BY_ID.get(id)!).filter(m => m && !singModes.has(m.id)).map(m => (
                      <button key={m.id} onClick={() => toggleIn(setBorrowModes, m.id)} className={chip(borrowModes.has(m.id))}>{m.label}</button>
                    ))}
                  </span>
                )),
                "Which modes to borrow characteristic chords from — one group per selected mode.",
              )}
              {showInterchange && fieldRow(
                "MI CHORDS",
                ([["triad", "3-part"], ["seventh", "4-part"]] as [ChordType, string][]).map(([id, lbl]) =>
                  <button key={id} onClick={() => toggleIn(setInterchangeParts, id, true)} className={chip(interchangeParts.has(id))}>{lbl}</button>),
                "Part-count of the borrowed chords — bigger sizes add each mode's tensions (Lydian's ♯11 at 6-part).",
              )}
              {fieldRow(
                "CYCLES",
                CYCLE_INTERVALS.map(n => <button key={n} onClick={() => toggleIn(setCycles, n)} className={chip(cycles.has(n))}>{n}</button>),
                "Almanac root cycles — chord roots move by this interval through the scale (following the Chords setup), in each starting inversion.",
              )}
            </div>
          </div>
        </Panel>

        {/* Generate sits right under the setup (Sing only — Echo plays random). */}
        {mode === "sing" && (
          <button onClick={play} title="Generate (a)"
            className="bg-[#7173e6] hover:bg-[#5a5cc8] text-white px-5 py-2 rounded text-sm font-medium transition-colors">
            ▶ Generate <span className="opacity-60 text-[10px]">a</span>
          </button>
        )}

        {/* Echo is its own game mode — call & response over random generated phrases. */}
        {mode === "echo" && (
          <EchoTrainer pool={echoPool} rootCents={rootCents} ensureAudio={ensureAudio} playVol={playVol} onRegenerate={generateSing} />
        )}

        {mode === "sing" && singSections.length > 0 && (<>
          {/* Tabs — Scalar (s) · Chords (d) · Cycles (f) — switch every band at once. */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-lg border border-[#242424] bg-[#0b0b0b] p-0.5 gap-0.5">
              {([["scalar", "Scalar", "s"], ["chords", "Chords", "d"], ["cycles", "Cycles", "f"]] as [SingCat, string, string][]).map(([id, txt, key]) => (
                <button key={id} onClick={() => setSingTab(id)}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${singTab === id ? "bg-[#7173e6] text-white" : "text-[#777] hover:text-[#cfcfcf]"}`}>
                  {txt} <span className="opacity-60 text-[10px]">{key}</span>
                </button>
              ))}
            </div>
            {/* Spectrum (z) · Gamut (x) · Pitch (p) · Echo (e) and degree show/hide
                (press 1–7 on the Chords tab) are keyboard-only per direct user
                direction — the buttons are hidden; the keydown handlers above and
                the keybind hint footer below keep every action reachable. */}
          </div>

          {/* Scalar sub-categories — keep the long list broken into sections. */}
          {singTab === "scalar" && (
            <div className="inline-flex rounded-lg border border-[#242424] bg-[#0b0b0b] p-0.5 gap-0.5 flex-wrap">
              {SCALAR_SUBS.map(s => (
                <button key={s.id} onClick={() => setScalarSub(s.id)}
                  className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-colors ${scalarSub === s.id ? "bg-[#7173e6] text-white" : "text-[#777] hover:text-[#cfcfcf]"}`}>{s.label}</button>
              ))}
            </div>
          )}

          {/* Logbook (l) — what you've worked, grouped by day → category (or by
              category outright).  Entries are written by the row controls. */}
          {logOpen && (
            <Panel title="LOGBOOK" accent="#4c9a5a">
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                <button onClick={() => setLogBy("day")} className={chip(logBy === "day")}>By day</button>
                <button onClick={() => setLogBy("cat")} className={chip(logBy === "cat")}>By category</button>
                {logSel.size > 0 && (
                  <button onClick={() => setLogSel(new Set())} className="text-[10px] text-[#777] hover:text-[#bbb] px-1.5">clear selection ({logSel.size})</button>
                )}
                <span className="text-[10px] text-[#666] ml-auto">{Object.keys(patternLog).length} logged</span>
                <button onClick={() => setPatternLog({})} className="text-[10px] text-[#a55] hover:text-[#d77] px-1.5">clear all</button>
              </div>
              {Object.keys(patternLog).length === 0 && (
                <div className="text-[11px] text-[#555]">Nothing logged yet — click a pattern's status dot (or drag across several) to log it.</div>
              )}
              <div className="space-y-2.5">
                {(() => {
                  const rows = Object.entries(patternLog).sort((a, b) => b[1].ts - a[1].ts);
                  const top = new Map<string, [string, LogEntry][]>();
                  for (const r of rows) {
                    const k = logBy === "day" ? r[1].day : (r[1].cat || "—");
                    const arr = top.get(k) ?? []; arr.push(r); top.set(k, arr);
                  }
                  return [...top.entries()].map(([head, list]) => {
                    // Inside a day, sub-group by category (the second axis).
                    const sub = new Map<string, [string, LogEntry][]>();
                    for (const r of list) {
                      const k = logBy === "day" ? (r[1].cat || "—") : (r[1].day);
                      const arr = sub.get(k) ?? []; arr.push(r); sub.set(k, arr);
                    }
                    return (
                      <div key={head} className="space-y-1">
                        <div className="text-[10px] font-semibold tracking-wider text-[#8ab88a]">{head}</div>
                        {[...sub.entries()].map(([sh, items]) => (
                          <div key={sh} className="pl-2 space-y-0.5">
                            <div className="text-[9px] tracking-wider text-[#555] uppercase">{sh}</div>
                            {items.map(([id, e]) => (
                              <div key={id} className="flex items-center gap-1.5 text-[11px] pl-1">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-[#3a3a3a]" style={{ background: LOG_STATUS_COLORS[e.status] }} />
                                {([0, 1, 2] as const).map(b => (
                                  <span key={b} className="text-[8px] leading-none px-0.5 rounded-sm border"
                                    style={e.bands[b] ? { background: BAND_COLORS[b], borderColor: BAND_COLORS[b], color: "#0b0b0b" } : { background: "transparent", borderColor: "#242424", color: "#444" }}>
                                    {bandLabelOf(b)[0].toUpperCase()}
                                  </span>
                                ))}
                                <span className="text-[#bbb] truncate">{e.label}</span>
                                <span className="text-[#555] truncate">· {e.group}</span>
                                <button onClick={() => setPatternLog(p => { const n = { ...p }; delete n[id]; return n; })}
                                  className="ml-auto text-[10px] text-[#555] hover:text-[#c55] shrink-0">×</button>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    );
                  });
                })()}
              </div>
            </Panel>
          )}

          {/* Walking-drone status bar — shown while a line is being walked.  Mouse
              controls mirror the keys (← → move · ↑ ↓ octave · space stop). */}
          {walk.keys.length > 0 && (
            <div className="sticky top-1 z-30 self-start inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs"
              style={{ borderColor: WALK_COLOR, background: "#0c1418" }}>
              <span className="font-semibold" style={{ color: WALK_COLOR }}>WALK</span>
              <button onClick={() => walkStep(-1)} className="px-1.5 rounded bg-[#152028] hover:bg-[#1d2c36]">←</button>
              <span className="font-mono text-[#cfe6ff]">note {walk.index + 1}</span>
              <button onClick={() => walkStep(1)} className="px-1.5 rounded bg-[#152028] hover:bg-[#1d2c36]">→</button>
              <span className="w-px h-4 bg-[#2a3a44]" />
              <button onClick={() => walkOct(-1)} className="px-1.5 rounded bg-[#152028] hover:bg-[#1d2c36]">8ve ↓</button>
              <span className="font-mono text-[#8ab0c8]">{walk.oct > 0 ? `+${walk.oct}` : walk.oct}</span>
              <button onClick={() => walkOct(1)} className="px-1.5 rounded bg-[#152028] hover:bg-[#1d2c36]">8ve ↑</button>
              <span className="w-px h-4 bg-[#2a3a44]" />
              <span className="text-[#6a8a9a]">{walk.keys.length} line{walk.keys.length > 1 ? "s" : ""}</span>
              <button onClick={walkStop} className="px-1.5 rounded bg-[#2a1515] text-[#d99] hover:bg-[#3a1d1d]">stop ␣</button>
            </div>
          )}

          {/* Bands side by side — one column each, all showing the active tab. */}
          <div className="flex gap-3 items-start overflow-x-auto pb-2">
            {singSections.map((sec, si) => {
              const groups = sec.groups.filter(g => g.cat === singTab && (singTab !== "scalar" || g.sub === scalarSub));
              return (
                <div key={si} className={`flex-1 ${singTab === "chords" ? "min-w-[480px]" : "min-w-[320px]"}`}>
                  <Panel title={`${bandTitleOf(sec.band).toUpperCase()} · ${sec.scaleLabel.toUpperCase()}`} accent={BAND_COLORS[sec.band]}>
                    <div className="space-y-3">
                      {groups.length === 0 && <div className="text-[11px] text-[#555]">Nothing selected for this tab.</div>}
                      {(() => {
                        // Some groups belong to a collapsible PARENT family (e.g. the
                        // Tonic-relative / Chord-relative pentatonic split).  Render a
                        // parent header at each transition and hide its children when
                        // the parent is collapsed.
                        const out: ReactNode[] = [];
                        let curParent: string | undefined;
                        groups.forEach((g, gi) => {
                          if (g.parent && g.parent !== curParent) {
                            curParent = g.parent;
                            const pCol = !expandedGroups.has(g.parent);
                            out.push(
                              <button key={`p:${g.parent}`} onClick={() => toggleGroupExpanded(g.parent!)}
                                className="flex items-center gap-1 text-[11px] text-[#8a8ac0] hover:text-[#c6c6e6] font-bold tracking-widest uppercase transition-colors pt-1">
                                <span className="text-[9px] w-2 inline-block">{pCol ? "▶" : "▼"}</span>{g.parent}
                              </button>,
                            );
                          }
                          if (!g.parent) curParent = undefined;
                          if (g.parent && !expandedGroups.has(g.parent)) return;   // hidden under collapsed parent
                          const collapsed = !expandedGroups.has(g.title);
                          out.push(
                            <div key={gi} className={`space-y-1.5 ${g.parent ? "pl-2 border-l border-[#1e1e2a] ml-1" : ""}`}>
                              <button onClick={() => toggleGroupExpanded(g.title)}
                                className="flex items-center gap-1 text-[10px] text-[#666] hover:text-[#aaa] font-semibold tracking-wider transition-colors">
                                <span className="text-[8px] w-2 inline-block">{collapsed ? "▶" : "▼"}</span>{g.title}
                              </button>
                              {/* Chords tab packs TWO per row; cycles and scalar rows are
                                  wide, so those stack full-width. */}
                              {!collapsed && (
                              <div className={singTab === "chords" ? "grid grid-cols-2 gap-x-3 gap-y-1.5 items-start" : "space-y-1.5"}>
                                {g.seqs.filter(seq => !(singTab === "chords" && ROMAN_NUMERALS.includes(seq.label) && hiddenDeg.has(ROMAN_NUMERALS.indexOf(seq.label)))).map((seq, qi) => renderSeq(
                                  seq, qi, sec.rawScale, `${si}:${gi}:${qi}`,
                                  // Band-independent id: the same pattern in the small /
                                  // center / large columns shares one logbook entry.
                                  `${sec.mode}|${g.title}|${seq.label}`,
                                  { cat: g.sub ?? g.cat, group: g.title, label: seq.label },
                                ))}
                              </div>
                              )}
                            </div>,
                          );
                        });
                        return out;
                      })()}
                    </div>
                  </Panel>
                </div>
              );
            })}
          </div>

        </>)}

      </>)}

      {/* Drone popup (o) — pick a scale degree (each with its own band) or a
          diatonic chord to hold; click again to release.  A popup like Spectrum /
          Gamut so it's always reachable regardless of scroll. */}
      {droneOpen && singSections.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDroneOpen(false)}>
          <div className="bg-[#0c0c0c] border border-[#2a2a2a] rounded-lg w-[90vw] max-w-2xl max-h-[85vh] overflow-auto p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold tracking-widest text-[#8a8a8a]">DRONE</span>
              <button onClick={() => setDroneOpen(false)} className="text-[#888] hover:text-white text-xs">✕ <span className="opacity-60">esc</span></button>
            </div>
            {(() => {
              const firstMode = [...singModes][0];
              const secByBand = new Map(singSections.filter(s => s.mode === firstMode).map(s => [s.band, s] as const));
              const octShift = droneOct * 1200;
              // Cycling a degree's band re-voices the held drone at the new band so
              // the selection (highlight) stays.  Octave / instrument changes do the
              // same via the held-drone ref.
              const cycleBand = (d: number) => {
                const newB = ((droneDegBand[d] + 1) % 3) as Band;
                setDroneDegBand(p => { const n = [...p]; n[d] = newB; return n; });
                if (droningId === `drdeg:${d}`) {
                  const a = secByBand.get(newB)?.scale[d].abs;
                  if (a != null) void holdDrone(`drdeg:${d}`, [a + octShift]);
                }
              };
              // Set the tuning band for EVERY degree at once (small/center/large =
              // 50/12/39-EDO), re-voicing a held degree drone to match.
              const setAllBands = (b: Band) => {
                setDroneDegBand(Array(7).fill(b));
                const h = droneHoldRef.current;
                if (h && h.id.startsWith("drdeg:")) {
                  const d = Number(h.id.slice("drdeg:".length));
                  const a = secByBand.get(b)?.scale[d]?.abs;
                  if (a != null) void holdDrone(h.id, [a + octShift]);
                }
              };
              const stepOct = (delta: number) => {
                const nx = Math.max(-3, Math.min(3, droneOct + delta));
                const applied = nx - droneOct;
                if (!applied) return;
                setDroneOct(nx);
                const h = droneHoldRef.current;
                if (h) void holdDrone(h.id, h.abs.map(x => x + applied * 1200));
              };
              const changeInst = (inst: DroneInstrument) => {
                lsSet("lt_app_droneInstrument", inst);
                setDroneInst(inst);
                audioEngine.setInstrument(inst);
                const h = droneHoldRef.current;
                if (h) void holdDrone(h.id, h.abs);
              };
              return (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-[#666] font-semibold">SOUND</span>
                    <select value={droneInst} onChange={e => changeInst(e.target.value as DroneInstrument)}
                      className="bg-[#141414] border border-[#242424] rounded text-[11px] text-[#bbb] px-1 py-0.5">
                      {DRONE_INSTRUMENTS.map(di => <option key={di.id} value={di.id}>{di.label}</option>)}
                    </select>
                    <span className="w-px h-4 bg-[#242424] mx-0.5" />
                    <span className="text-[10px] text-[#666] font-semibold">OCTAVE</span>
                    <button onClick={() => stepOct(-1)} className="px-2 py-0.5 rounded bg-[#141414] border border-[#242424] text-[#c8c8c8] hover:border-[#4a9ac7]">8ve ↓</button>
                    <span className="font-mono text-sm text-[#cfe6ff] w-6 text-center">{3 + droneOct}</span>
                    <button onClick={() => stepOct(1)} className="px-2 py-0.5 rounded bg-[#141414] border border-[#242424] text-[#c8c8c8] hover:border-[#4a9ac7]">8ve ↑</button>
                    <span className="w-px h-4 bg-[#242424] mx-0.5" />
                    <span className="text-[10px] text-[#666] font-semibold">TUNING</span>
                    <select value={droneDegBand[1]} onChange={e => setAllBands(Number(e.target.value) as Band)}
                      title="Tune every drone degree to one band / EDO"
                      className="bg-[#141414] border border-[#242424] rounded text-[11px] text-[#bbb] px-1 py-0.5">
                      <option value={0}>small · 50-EDO</option>
                      <option value={1}>center · 12-EDO</option>
                      <option value={2}>large · 39-EDO</option>
                    </select>
                  </div>
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className="text-[10px] text-[#666] font-semibold w-[56px] pt-1.5">DEGREES</span>
                    {[0, 1, 2, 3, 4, 5, 6].map(d => {
                      // Tonic (degree 0) has no small/center/large — fixed at 0¢ —
                      // so no band cycle.  Ids are band-INDEPENDENT so cycling the
                      // band keeps the drone selected.
                      const b = d === 0 ? (1 as Band) : droneDegBand[d];
                      const sec = secByBand.get(b);
                      const cents = sec ? ((sec.rawScale[d] % 1200) + 1200) % 1200 : 0;
                      const id = `drdeg:${d}`;
                      const on = droningId === id;
                      return (
                        <span key={d} className="flex flex-col items-center gap-0.5">
                          <button onClick={() => { const abs = sec?.scale[d].abs; if (abs == null) return; const a = abs + octShift; if (on || droningId === null) toggleDrone(id, [a]); else playOne(a); }}
                            className={`px-1.5 py-1 rounded text-xs font-mono border transition-colors ${on ? "bg-[#e0b060]/30 border-[#e0b060] text-[#f0dcae] ring-2 ring-[#e0b060]/50" : "bg-[#141414] border-[#242424] text-[#c8c8c8] hover:border-[#4a9ac7]"}`}>
                            {sizedCode(cents)}
                          </button>
                          {d === 0
                            ? <span className="w-3 h-3" />
                            : <button onClick={() => cycleBand(d)} title={bandTitleOf(b)} className="w-3 h-3 rounded-full border border-[#3a3a3a]" style={{ background: BAND_COLORS[b] }} />}
                        </span>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-[#666] font-semibold w-[56px]">CHORDS</span>
                    <select value={droneChordType} onChange={e => setDroneChordType(e.target.value as ChordType)}
                      className="bg-[#141414] border border-[#242424] rounded text-[11px] text-[#bbb] px-1 py-0.5">
                      {CHORD_TYPES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                    {[0, 1, 2, 3, 4, 5, 6].map(d => {
                      const sec = secByBand.get(droneDegBand[d]) ?? secByBand.get(1);
                      const on = droningId === `drrom:${d}`;
                      return (
                        <button key={d} onClick={() => { if (!sec) return; const abs = SHAPE_TONES[droneChordType][0].offs.map(o => stepNote(sec.rawScale, d + o).abs + octShift); if (on || droningId === null) toggleDrone(`drrom:${d}`, abs); else abs.forEach(a => playOne(a)); }}
                          className={`px-2 py-1 rounded text-xs font-serif italic border transition-colors ${on ? "bg-[#e0b060]/25 border-[#e0b060] text-[#e6d3a0]" : "bg-[#141414] border-[#242424] text-[#c8c8c8] hover:border-[#4a9ac7]"}`}>
                          {romanBandArrow(sec ? sec.rawScale[d] : d * 2)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Spectrum popup (z) — the scale for each band, zoomed per region. */}
      {specOpen && singSections.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSpecOpen(false)}>
          <div className="bg-[#0c0c0c] border border-[#2a2a2a] rounded-lg w-[90vw] max-w-3xl max-h-[85vh] overflow-auto p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold tracking-widest text-[#8a8a8a]">SPECTRUM</span>
              <button onClick={() => setSpecOpen(false)} className="text-[#888] hover:text-white text-xs">✕ <span className="opacity-60">esc</span></button>
            </div>
            {singSections.map((sec, si) => (
              <div key={si} className="mb-3 last:mb-0">
                <div className="text-[10px] font-semibold mb-1" style={{ color: BAND_COLORS[sec.band] }}>{bandTitleOf(sec.band).toUpperCase()} · {sec.scaleLabel}</div>
                {intervalSpectrum(sec.scale)}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Solfège gamut popup (x). */}
      {gamutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setGamutOpen(false)}>
          <div className="w-[440px] max-w-[92vw] max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <SolfegeGamutAside />
          </div>
        </div>
      )}
      {/* Over-bass structures sheet (u). */}
      {obSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setObSheetOpen(false)}>
          <div className="w-[720px] max-w-[94vw] max-h-[88vh] overflow-auto relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setObSheetOpen(false)}
              className="absolute top-2.5 right-3 z-10 text-[#888] hover:text-white text-xs">✕ <span className="opacity-60">esc</span></button>
            <OverBassSheet />
          </div>
        </div>
      )}
      {/* Spectrum band-margin editor (b) — drag your personal small/middle/large splits. */}
      {bandsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setBandsOpen(false)}>
          <div className="w-[720px] max-w-[94vw] max-h-[88vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <SpectrumBandsEditor />
          </div>
        </div>
      )}
      {/* Pitch trainer (p) — floating, non-blocking so it keeps listening while
          you sing the exercises.  Docked bottom-left above the keybind bar. */}
      {pitchOpen && mode === "sing" && (
        <div className="fixed top-3 right-3 z-40 w-[440px] max-w-[94vw] shadow-2xl">
          <PitchTrainer rootCents={rootCents} targets={pitchTargets} />
        </div>
      )}
      {/* Always-visible keybind help bar (Sing mode). */}
      {mode === "sing" && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0a0a0a]/95 border-t border-[#1e1e1e] px-4 py-1.5 flex items-center justify-center gap-4 text-[10px] text-[#888]">
          {[["a", "Generate"], ["s", "Scalar"], ["d", "Chords"], ["f", "Cycles"], ["z", "Spectrum"], ["x", "Gamut"], ["p", "Pitch"], ["e", "Echo"]].map(([k, t]) => (
            <span key={k}><kbd className="px-1.5 py-0.5 rounded bg-[#1e1e1e] border border-[#333] text-[#cfe6ff] font-mono">{k}</kbd> {t}</span>
          ))}
          <span className={patRetro ? "text-[#e0b060]" : ""}><kbd className="px-1.5 py-0.5 rounded bg-[#1e1e1e] border border-[#333] text-[#cfe6ff] font-mono">r</kbd> retrograde{patRetro ? " ✓" : ""}</span>
          <span className={patInv === "dia" ? "text-[#e0b060]" : ""}><kbd className="px-1.5 py-0.5 rounded bg-[#1e1e1e] border border-[#333] text-[#cfe6ff] font-mono">i</kbd> invert·diatonic{patInv === "dia" ? " ✓" : ""}</span>
          <span className={patInv === "chrom" ? "text-[#e0b060]" : ""}><kbd className="px-1.5 py-0.5 rounded bg-[#1e1e1e] border border-[#333] text-[#cfe6ff] font-mono">c</kbd> invert·chromatic{patInv === "chrom" ? " ✓" : ""}</span>
          <span className={patExpand !== 0 ? "text-[#e0b060]" : ""}><kbd className="px-1.5 py-0.5 rounded bg-[#1e1e1e] border border-[#333] text-[#cfe6ff] font-mono">[</kbd> narrow <kbd className="px-1.5 py-0.5 rounded bg-[#1e1e1e] border border-[#333] text-[#cfe6ff] font-mono">]</kbd> widen{patExpand !== 0 ? ` · ${patExpand > 0 ? "+" : ""}${patExpand}` : ""}</span>
          <span className="text-[#555]">(<kbd className="px-1 rounded bg-[#1e1e1e] border border-[#333] text-[#9ab] font-mono">r</kbd>+<kbd className="px-1 rounded bg-[#1e1e1e] border border-[#333] text-[#9ab] font-mono">i</kbd> = retro-invert)</span>
          {singTab === "chords" && <span><kbd className="px-1.5 py-0.5 rounded bg-[#1e1e1e] border border-[#333] text-[#cfe6ff] font-mono">1–7</kbd> hide degree{hiddenDeg.size > 0 && <span className="text-[#c88f8f]"> · hidden {[...hiddenDeg].sort((a, b) => a - b).map(d => d + 1).join(" ")}</span>}</span>}
          <span><kbd className="px-1.5 py-0.5 rounded bg-[#1e1e1e] border border-[#333] text-[#cfe6ff] font-mono">l</kbd> logbook{logSel.size > 0 && <span className="text-[#8ab88a]"> · {logSel.size} selected</span>}</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-[#1e1e1e] border border-[#333] text-[#cfe6ff] font-mono">o</kbd> drone</span>
          {singTab === "scalar" && <span><kbd className="px-1.5 py-0.5 rounded bg-[#1e1e1e] border border-[#333] text-[#cfe6ff] font-mono">1–7</kbd> start on degree{scaleStart > 0 && <span className="text-[#cfe6cf]"> · {scaleStart + 1}{scalarSub === "resolution" ? " (resolution exempt)" : ""}</span>}</span>}
        </div>
      )}


      {/* Transport — Play / Replay / Check together (keys a / s / d).  Sing has
          its own Generate button and Echo its own transport, so both are hidden. */}
      {mode !== "sing" && mode !== "echo" && (
      <div className="flex items-center gap-2">
        <button onClick={play} title="Play (a)"
          className="bg-[#7173e6] hover:bg-[#5a5cc8] text-white px-5 py-2 rounded text-sm font-medium transition-colors">
          ▶ Play <span className="opacity-60 text-[10px]">a</span>
        </button>
        <>
          <button onClick={replay} disabled={!lastFramesRef.current.length} title="Replay (s)"
            className="bg-[#1e1e1e] hover:bg-[#2a2a2a] border border-[#333] text-[#aaa] px-4 py-2 rounded text-sm transition-colors disabled:opacity-40">
            Replay <span className="opacity-60 text-[10px]">s</span>
          </button>
          <button onClick={check} disabled={!progression.length} title="Check (d)"
            className="bg-[#2a2a3a] hover:bg-[#33334a] border border-[#7173e6] text-[#cfe6ff] px-4 py-2 rounded text-sm font-medium transition-colors disabled:opacity-40">
            Check <span className="opacity-60 text-[10px]">d</span>
          </button>
          <button onClick={showAnswer} disabled={!lastFramesRef.current.length} title="Fill in and reveal the answer"
            className="bg-[#1e1a10] hover:bg-[#2a2418] border border-[#3a3424] text-[#cab48a] px-4 py-2 rounded text-sm font-medium transition-colors disabled:opacity-40">
            Show Answer
          </button>
        </>
        {status && <span className="text-xs text-[#888]">{status}</span>}
        {verdict.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {verdict.map((ok, i) => (
              <span key={i} className={`px-2 py-0.5 rounded text-[10px] font-mono border ${ok
                ? "bg-[#132013] border-[#3a5a3a] text-[#8fc88f]" : "bg-[#201313] border-[#5a3a3a] text-[#c88f8f]"}`}>
                {i + 1}{ok ? "✓" : "✗"}
              </span>
            ))}
          </div>
        )}
      </div>
      )}

      {/* Answer — the real Scoring Jianpu editor (sol-fa display) */}
      {progression.length > 0 && (
        <div className="rounded border border-[#1a1a1a] overflow-x-auto">
          <JianpuMode key={answerKey} controlledActiveId={SOLFA_ANSWER_PROJECT_ID} embedded />
        </div>
      )}

      {/* Revealed answer — syllables + region/band spectrum, like Sing. */}
      {answerShown && answerReveal.length > 0 && (
        <div className="space-y-2">
          {answerReveal.map((notes, i) => (
            <Panel key={i} title={`ANSWER · ${i + 1}`} accent="#cab48a">
              <div className="flex gap-1.5 flex-wrap mb-1">
                {notes.map((n, j) => (
                  <span key={j} className="min-w-[42px] text-center rounded-md border border-[#3a3424] bg-[#1e1a10] px-2 py-1 text-sm font-mono"
                    style={{ color: vowelColor(n.syl) }}>{n.syl}</span>
                ))}
              </div>
              {intervalSpectrum(notes)}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
