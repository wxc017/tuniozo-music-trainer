import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  type DrumVoice, type VocalPattern, type VocalSlot,
  VOICE_LABELS, VOICE_COLORS, VOICE_SHORT,
  generateVocalPattern, generateFromGrouping, generatePulseGrouping,
  applyGrooveVoicing, applySplits,
  flattenForPlayback, type PlaybackResult,
  scheduleDrumHit, schedulePulseClick, parseGrouping,
} from "@/lib/vocalPercussionData";
import type { KonnakolGroup, KonnakolNote } from "@/lib/konnakolData";
import { generateMusicalGrouping, generateAwkwardGrouping } from "@/lib/accentData";
import { generateAndSelectGrouping } from "@/lib/groupingSelector";
import KonnakolNotation from "./KonnakolNotation";
import PracticeLogSaveBar from "@/components/PracticeLogSaveBar";

/* ── Group size → VexFlow duration + subdivision mapping ──────────────────── */
// Each vocal group renders as 1 beat with the appropriate tuplet bracket.
//   size 2 → 2 eighths (no bracket)
//   size 3 → triplet (3 bracket)
//   size 4 → 4 sixteenths (no bracket)
//   size 5 → quintuplet (5 bracket)
//   size 6 → sextuplet (6 bracket)
//   size 7 → septuplet (7 bracket)
//   size 8 → 32nds (no bracket)
function groupSizeToNotation(size: number, sixteenthMode = false): { duration: string; subdivision: number; noTuplet: boolean } {
  // 16th-groups mode: every group is just N sixteenth notes in a row, no tuplets.
  // Each group is still labeled "a beat" conceptually, but its visual/audio width
  // scales linearly with size (group of 5 = 5/4 beats).
  if (sixteenthMode) return { duration: "16", subdivision: size, noTuplet: true };
  if (size === 1) return { duration: "q", subdivision: 1, noTuplet: true };
  if (size === 2) return { duration: "8", subdivision: 2, noTuplet: true };
  if (size === 3) return { duration: "8", subdivision: 3, noTuplet: false };
  if (size === 4) return { duration: "16", subdivision: 4, noTuplet: true };
  if (size === 5) return { duration: "16", subdivision: 5, noTuplet: false };
  if (size === 6) return { duration: "16", subdivision: 6, noTuplet: false };
  if (size === 7) return { duration: "16", subdivision: 7, noTuplet: false };
  if (size === 8) return { duration: "32", subdivision: 8, noTuplet: true };
  return { duration: "16", subdivision: size, noTuplet: false };
}

/** Map a unit count back to the closest VexFlow duration string. Returns null if the
 *  count doesn't map cleanly (e.g. 5, 7 sixteenths — would need ties to render). */
function tryConsolidatedDuration(units: number, baseDuration: string): string | null {
  const baseToUnits: Record<string, number> = { "32": 0.5, "16": 1, "8": 2, "q": 4 };
  const baseUnit = baseToUnits[baseDuration] ?? 1;
  const totalUnits = units * baseUnit;
  const map: Record<number, string> = {
    0.5: "32", 1: "16", 1.5: "16.", 2: "8", 3: "8.",
    4: "q", 6: "q.", 8: "h", 12: "h.", 16: "w",
  };
  return map[totalUnits] ?? null;
}

/** Half a VexFlow duration string for rendering split slots. "8"→"16", "16"→"32". */
function halfDuration(d: string): string {
  if (d === "q") return "8";
  if (d === "8") return "16";
  if (d === "16") return "32";
  return d; // "32" can't be halved in the current renderer (no 64th support)
}

/** For non-tuplet groups, absorb trailing rests into the preceding note's duration
 *  (so `Bum + 3 sixteenth rests` becomes a single quarter `Bum`), and merge runs
 *  of leading rests into single longer rests. Tuplet groups MUST be left untouched
 *  since their timing depends on uniform notes inside the bracket — consolidating
 *  a triplet's trailing rests into a lengthened note would make the VexFlow Tuplet
 *  bracket span one note with a duration that doesn't fit the subdivision, producing
 *  a malformed bracket glyph.
 *
 *  Split slots (slot.isSplit = true) emit two half-duration notes in place of
 *  one, regardless of tuplet vs non-tuplet — the two halves still fit inside
 *  the slot's allotted time. */
function consolidateSlots(slots: VocalSlot[], baseDuration: string, isTuplet = false): KonnakolNote[] {
  const emitSplitPair = (slot: VocalSlot, dur: string): KonnakolNote[] => {
    const half = halfDuration(dur);
    const noteColor = invertHex(VOICE_COLORS[slot.voice]);
    return [
      { syllable: "", noteType: "normal" as const, accent: slot.isAccent, duration: half, noteColor },
      { syllable: "", noteType: "normal" as const, accent: false, duration: half, noteColor },
    ];
  };

  if (isTuplet) {
    // Emit every slot at the base duration; rests stay as rests, notes stay as notes.
    // Split slots become two half-duration notes at the same tuplet position.
    const out: KonnakolNote[] = [];
    for (const slot of slots) {
      if (slot.isRest) {
        out.push({ syllable: "", noteType: "rest" as const, accent: false, duration: baseDuration });
        continue;
      }
      if (slot.isSplit) {
        out.push(...emitSplitPair(slot, baseDuration));
        continue;
      }
      const noteColor = invertHex(VOICE_COLORS[slot.voice]);
      out.push({
        syllable: "",
        noteType: "normal" as const,
        accent: slot.isAccent,
        duration: baseDuration,
        noteColor,
      });
    }
    return out;
  }
  const out: KonnakolNote[] = [];
  let i = 0;
  // Each non-rest slot carries its voice's color directly on the emitted
  // KonnakolNote (pre-inverted to cancel the SVG's invert(1) filter). This
  // avoids depending on SVG text order to map colors back onto annotations.
  while (i < slots.length) {
    const slot = slots[i];
    if (slot.isRest) {
      // Count consecutive rests, emit single longer rest if possible
      let n = 1;
      while (i + n < slots.length && slots[i + n].isRest) n++;
      const dur = tryConsolidatedDuration(n, baseDuration);
      if (dur !== null) {
        out.push({ syllable: "", noteType: "rest", accent: false, duration: dur });
      } else {
        for (let k = 0; k < n; k++) {
          out.push({ syllable: "", noteType: "rest", accent: false, duration: baseDuration });
        }
      }
      i += n;
    } else if (slot.isSplit) {
      // Split slot: emit two half-duration notes, don't absorb trailing rests
      // (the split consumes the slot's full duration).
      out.push(...emitSplitPair(slot, baseDuration));
      i += 1;
    } else {
      // Note: absorb any trailing rests into its duration
      let trailingRests = 0;
      while (i + 1 + trailingRests < slots.length && slots[i + 1 + trailingRests].isRest) {
        trailingRests++;
      }
      const dur = tryConsolidatedDuration(1 + trailingRests, baseDuration);
      // Voice identity is carried by the notehead colour (pre-inverted because
      // the containing SVG has invert(1)).  No syllable text — the user
      // vocalises in their own voice, guided by colour coding.
      const noteColor = invertHex(VOICE_COLORS[slot.voice]);
      if (dur !== null) {
        out.push({
          syllable: "",
          noteType: "normal",
          accent: slot.isAccent,
          duration: dur,
          noteColor,
        });
        i += 1 + trailingRests;
      } else {
        // Fallback: emit note at base duration, then individual rests
        out.push({
          syllable: "",
          noteType: "normal",
          accent: slot.isAccent,
          duration: baseDuration,
          noteColor,
        });
        for (let k = 0; k < trailingRests; k++) {
          out.push({ syllable: "", noteType: "rest", accent: false, duration: baseDuration });
        }
        i += 1 + trailingRests;
      }
    }
  }
  return out;
}

export type AccentMode = "first" | "repeat" | "groupings";

/** Rewrite the pattern's slot accents according to the selected mode.
 *  - first:     accent only the first slot of each group (default behavior).
 *  - repeat:    accent every Nth slot across the pattern (counting rests too so
 *               the accent lands on consistent metric positions).
 *  - groupings: use the accent-study's own grouping generator to pick a
 *               musical partition of the pattern's total slots, then accent
 *               the first slot of each generated group. Same algorithm the
 *               accent study uses — we don't reinvent the wheel. */
/** Fast random musical partition of n slots — used when n is too large for
 *  exhaustive composition enumeration.  `generateAndSelectGrouping` internally
 *  calls `allCompositions(n, 8)` which grows ~2^n; for n=24 (sextuplet × 4) it
 *  allocates ~16M arrays and freezes the UI.  For large n we draw sizes from
 *  a musical palette {2,3,4,5,6} and tolerate whatever lands. */
function fastMusicalGrouping(n: number): number[] {
  const parts: number[] = [];
  let remaining = n;
  const palette = n >= 24 ? [2, 3, 4, 5, 6, 7, 8]
                : n >= 16 ? [2, 3, 4, 5, 6]
                : [2, 3, 4, 5];
  const maxPart = Math.max(...palette);
  while (remaining > 0) {
    if (remaining <= maxPart) { parts.push(remaining); break; }
    parts.push(palette[Math.floor(Math.random() * palette.length)]);
    remaining = n - parts.reduce((s, x) => s + x, 0);
  }
  return parts;
}

function applyAccentMode(
  pattern: VocalPattern,
  mode: AccentMode,
  every: number,
): VocalPattern {
  if (mode === "first") return pattern;
  const step = Math.max(1, Math.floor(every));
  const totalSlots = pattern.groups.reduce((s, g) => s + g.size, 0);

  // For "groupings" mode: ask the accent-study generator for a musical
  // partition of totalSlots, then mark the starts of those groups as accents.
  // For large n the brute-force enumerator freezes the UI; fall back to a
  // random-palette partition above the tractable threshold (n=14).
  const accentStarts = new Set<number>();
  if (mode === "groupings") {
    const accentGrouping = totalSlots <= 14
      ? (generateAndSelectGrouping(totalSlots, "musical") ?? [totalSlots])
      : fastMusicalGrouping(totalSlots);
    let cursor = 0;
    for (const size of accentGrouping) {
      if (cursor < totalSlots) accentStarts.add(cursor);
      cursor += size;
    }
  }

  let globalIdx = 0;
  const groups = pattern.groups.map(g => {
    const slots = g.slots.map(s => {
      let isAccent = false;
      if (mode === "repeat") isAccent = globalIdx % step === 0;
      else if (mode === "groupings") isAccent = accentStarts.has(globalIdx);
      globalIdx++;
      return { ...s, isAccent };
    });
    return { ...g, slots };
  });
  return { ...pattern, groups };
}

/** Convert a VocalPattern to Konnakol groups for staff rendering.
 *  Non-tuplet groups (size 2/4/8) consolidate trailing rests into the preceding
 *  note's duration for cleaner notation.  Tuplet groups (3/5/6/7) emit every
 *  slot literally — the VexFlow Tuplet bracket's scaling relies on a uniform
 *  note count matching the subdivision; consolidating rests breaks the bracket. */
function toKonnakolGroups(pattern: VocalPattern, sixteenthMode = false): KonnakolGroup[] {
  return pattern.groups.map(g => {
    const { duration, subdivision, noTuplet } = groupSizeToNotation(g.size, sixteenthMode);
    const isTuplet = !noTuplet;
    return { notes: consolidateSlots(g.slots, duration, isTuplet), subdivision, noTuplet };
  });
}

/** Slot counts (in 16th-note units) for each duration, matching KonnakolNotation's DUR_TO_SLOTS. */
const DUR_SLOTS: Record<string, number> = { "32": 0.5, "16": 1, "8": 2, "q": 4 };

/** Break a slot count into a sequence of durations (greedy: q → 8 → 16 → 32). */
function slotsToDurations(slots: number): string[] {
  const out: string[] = [];
  let remaining = slots;
  for (const d of ["q", "8", "16", "32"] as const) {
    const s = DUR_SLOTS[d];
    while (remaining >= s - 1e-6) {
      out.push(d);
      remaining -= s;
    }
  }
  return out;
}

/** Visual-slot size of each main group in 16th-note units (post-notation). */
function groupVisualSlots(pattern: VocalPattern, sixteenthMode: boolean): number[] {
  return pattern.groups.map(g => {
    const { duration } = groupSizeToNotation(g.size, sixteenthMode);
    return g.size * (DUR_SLOTS[duration] ?? 1);
  });
}

/**
 * Build a pulse staff with `numPulses` evenly-spaced pulses across the whole
 * pattern's visual duration.  Each pulse aligns to the correct per-group slot
 * position via hidden-rest padding so VexFlow keeps the voices in sync.
 *
 *   numPulses === numBeats     ↔ old "quarter" pulse (one click per beat)
 *   numPulses === 2 * numBeats ↔ old "eighth" pulse (two clicks per beat)
 *   numPulses === 3, beats = 4 ↔ 3:4 polyrhythm (three clicks over four beats)
 *
 * Pulses are evenly spaced in the *visual-slot* coordinate system — so if the
 * main groups are uneven (quintuplets, septuplets, etc.), pulses still land at
 * uniform time-equivalent positions.  Any (pulses, beats) integer pair is a
 * valid polyrhythm.
 */
function toPulseGroups(pattern: VocalPattern, numPulses: number, sixteenthMode = false): KonnakolGroup[] {
  const gSlots = groupVisualSlots(pattern, sixteenthMode);
  const totalVisualSlots = gSlots.reduce((s, x) => s + x, 0);
  const n = Math.max(1, Math.floor(numPulses));

  // Pulse positions in global visual-slot coordinates.
  const pulseAt: number[] = [];
  for (let i = 0; i < n; i++) pulseAt.push((i * totalVisualSlots) / n);

  const out: KonnakolGroup[] = [];
  let groupStart = 0;
  for (let gi = 0; gi < pattern.groups.length; gi++) {
    const { subdivision } = groupSizeToNotation(pattern.groups[gi].size, sixteenthMode);
    const groupSize = gSlots[gi];
    const groupEnd = groupStart + groupSize;

    const localPulses: number[] = pulseAt
      .filter(p => p >= groupStart - 1e-6 && p < groupEnd - 1e-6)
      .map(p => p - groupStart);

    const notes: KonnakolNote[] = [];
    const emit = (slots: number, asRest: boolean, hidden: boolean) => {
      if (slots <= 1e-6) return;
      for (const d of slotsToDurations(slots)) {
        notes.push({
          syllable: "",
          noteType: asRest ? "rest" : "normal",
          accent: false,
          duration: d,
          hidden,
        });
      }
    };

    let localCursor = 0;
    for (let pi = 0; pi < localPulses.length; pi++) {
      const pPos = localPulses[pi];
      const gap = pPos - localCursor;
      if (gap > 1e-6) emit(gap, true, true);
      const nextGlobal = pi + 1 < localPulses.length
        ? localPulses[pi + 1] + groupStart
        : (pulseAt.find(p => p >= groupEnd - 1e-6) ?? totalVisualSlots);
      const room = Math.min(nextGlobal - (pPos + groupStart), groupEnd - (pPos + groupStart));
      const pulseDur = Math.max(1, Math.min(4, Math.floor(room)));
      emit(pulseDur, false, false);
      localCursor = pPos + pulseDur;
    }

    const tail = groupSize - localCursor;
    if (tail > 1e-6) emit(tail, true, true);

    out.push({ notes, subdivision, noTuplet: true });
    groupStart = groupEnd;
  }

  return out;
}

/** Invert a hex color for use inside an SVG with invert(1) filter. */
function invertHex(hex: string): string {
  const n = hex.replace("#", "");
  const r = 255 - parseInt(n.slice(0, 2), 16);
  const g = 255 - parseInt(n.slice(2, 4), 16);
  const b = 255 - parseInt(n.slice(4, 6), 16);
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
}

/**
 * Wrapper around KonnakolNotation that applies per-note colors to syllable
 * annotations. Colors are pre-inverted because the SVG has invert(1) filter.
 */
function ColoredStaff({
  groups, colors, width, height,
  pulseGroups, pulseHeight,
}: {
  groups: KonnakolGroup[];
  colors: string[];  // legacy prop, unused — colors are set on each KonnakolNote directly
  width: number;
  height: number;
  pulseGroups?: KonnakolGroup[] | null;
  pulseHeight?: number;
}) {
  void colors; // silence unused-param lint
  const wrapRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={wrapRef}>
      <KonnakolNotation
        groups={groups}
        width={width}
        height={height}
        singleLine
        noteKey="f/5"
        pulseGroups={pulseGroups ?? undefined}
        pulseHeight={pulseHeight}
        stemless
      />
    </div>
  );
}
import type { GroupingMode } from "@/lib/groupingSelector";

/* ── Constants ────────────────────────────────────────────────────────────── */

const ALL_VOICES: DrumVoice[] = ["kick", "snare", "hat"];
const GROUPING_MODES: { value: GroupingMode; label: string; color: string }[] = [
  { value: "musical", label: "Musical", color: "#60c0a0" },
  { value: "awkward", label: "Awkward", color: "#e09060" },
  { value: "both",    label: "Both",    color: "#9999ee" },
];

/* ── Colour-to-voice legend ───────────────────────────────────────────────── */
// Replaces the old syllable cheat sheet.  Noteheads on the staff are coloured
// by voice; this panel is the key so the user can map colour → drum and
// invent their own vocalisation.

function VoiceColorLegend() {
  const hints: Record<DrumVoice, string> = {
    kick:  "low / chest",
    snare: "attack / crack",
    ghost: "soft / breathy",
    hat:   "crisp / fricative",
    tom:   "mid / round",
  };
  return (
    <div style={{
      background: "#0e0e0e", borderRadius: 10, border: "1px solid #1a1a1a",
      padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6,
    }}>
      <span style={{ fontSize: 9, color: "#444", fontWeight: 700, letterSpacing: 1.5 }}>
        COLOUR KEY
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
        {ALL_VOICES.map(v => (
          <div key={v} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 12, height: 12, borderRadius: 3,
              background: VOICE_COLORS[v], display: "inline-block",
              boxShadow: `0 0 6px ${VOICE_COLORS[v]}66`,
            }} />
            <span style={{ fontSize: 11, color: VOICE_COLORS[v], fontWeight: 700 }}>
              {VOICE_LABELS[v]}
            </span>
            <span style={{ fontSize: 10, color: "#666" }}>— {hints[v]}</span>
          </div>
        ))}
      </div>
      <span style={{ fontSize: 9, color: "#444", marginTop: 2 }}>
        Vocalise each colour in whatever sound you choose; &gt; marks accents.
      </span>
    </div>
  );
}

/* ── Pattern Display ──────────────────────────────────────────────────────── */

function PatternDisplay({
  pattern, activeSlot, mutedVoices,
  numPulses, sixteenthMode,
}: {
  pattern: VocalPattern;
  activeSlot: number | null;
  mutedVoices: Set<DrumVoice>;
  numPulses: number | null;
  sixteenthMode: boolean;
}) {
  // Measure host width so bars wrap across multiple staff rows instead of
  // forcing horizontal scroll.
  const hostRef = useRef<HTMLDivElement>(null);
  const [availW, setAvailW] = useState(1000);
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const update = () => {
      // Subtract the bar's internal padding (~20px) so rendered staff stays inside.
      const w = el.clientWidth - 24;
      setAvailW(Math.max(320, w));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute bar-line positions for polymetric cycles
  const barLineSlots = useMemo(() => {
    const set = new Set<number>();
    if (!pattern.meterBeats) return set;
    for (let i = pattern.meterBeats; i < pattern.totalSlots; i += pattern.meterBeats) {
      set.add(i);
    }
    return set;
  }, [pattern]);

  // Phrase boundary tracking for polymetric display
  const phraseLength = pattern.phraseGrouping
    ? pattern.phraseGrouping.reduce((a, b) => a + b, 0)
    : 0;

  // Konnakol staff groups
  const konnakolMainGroups = useMemo(() => toKonnakolGroups(pattern, sixteenthMode), [pattern, sixteenthMode]);
  const konnakolPulseGroups = useMemo(
    () => (numPulses && numPulses > 0 ? toPulseGroups(pattern, numPulses, sixteenthMode) : null),
    [pattern, numPulses, sixteenthMode],
  );

  // Voice color sequence for annotation coloring (one color per rendered note)
  const mainColors = useMemo(
    () => pattern.groups.flatMap(g =>
      g.slots.filter(s => !s.isRest).map(s => VOICE_COLORS[s.voice]),
    ),
    [pattern],
  );
  const pulseColors = useMemo(() => {
    if (!konnakolPulseGroups) return [];
    return konnakolPulseGroups.flatMap(g =>
      g.notes.filter(n => n.noteType === "normal").map(() => "#c8aa50"),
    );
  }, [konnakolPulseGroups]);

  // For cycle mode: split groups into bars (each bar = meterBeats groups).
  // For non-cycle: a single bar containing all groups.
  const bars = useMemo(() => {
    if (!pattern.meterBeats) {
      return [{
        groups: konnakolMainGroups,
        colors: mainColors,
        pulseGroups: konnakolPulseGroups,
        pulseColors,
        groupRange: [0, pattern.groups.length] as [number, number],
      }];
    }
    const meter = pattern.meterBeats;
    const out: Array<{
      groups: KonnakolGroup[];
      colors: string[];
      pulseGroups: KonnakolGroup[] | null;
      pulseColors: string[];
      groupRange: [number, number];
    }> = [];
    // Walk groups, slice every `meter` groups
    let mainColorCursor = 0;
    let pulseColorCursor = 0;
    for (let gi = 0; gi < konnakolMainGroups.length; gi += meter) {
      const slice = konnakolMainGroups.slice(gi, gi + meter);
      // Count colors in this slice (only non-rest notes)
      const sliceColorCount = slice.reduce(
        (s, g) => s + g.notes.filter(n => n.noteType === "normal").length, 0,
      );
      const colorSlice = mainColors.slice(mainColorCursor, mainColorCursor + sliceColorCount);
      mainColorCursor += sliceColorCount;

      let pulseSlice: KonnakolGroup[] | null = null;
      let pulseColorSlice: string[] = [];
      if (konnakolPulseGroups) {
        pulseSlice = konnakolPulseGroups.slice(gi, gi + meter);
        const pulseSliceColorCount = pulseSlice.reduce(
          (s, g) => s + g.notes.filter(n => n.noteType === "normal").length, 0,
        );
        pulseColorSlice = pulseColors.slice(pulseColorCursor, pulseColorCursor + pulseSliceColorCount);
        pulseColorCursor += pulseSliceColorCount;
      }

      out.push({
        groups: slice,
        colors: colorSlice,
        pulseGroups: pulseSlice,
        pulseColors: pulseColorSlice,
        groupRange: [gi, Math.min(gi + meter, konnakolMainGroups.length)] as [number, number],
      });
    }
    return out;
  }, [pattern, konnakolMainGroups, konnakolPulseGroups, mainColors, pulseColors]);

  // Split a bar's groups into rows that fit the available width. We only
  // break at group boundaries so tuplet brackets and beams stay intact.
  const PER_NOTE_PX = 42;
  const ROW_OVERHEAD_PX = 40;
  const splitBarIntoRows = (
    groups: KonnakolGroup[],
    colors: string[],
    pulseGroups: KonnakolGroup[] | null,
    pulseColorsArr: string[],
    maxW: number,
  ) => {
    type Row = {
      groups: KonnakolGroup[];
      colors: string[];
      pulseGroups: KonnakolGroup[] | null;
      pulseColors: string[];
      width: number;
    };
    const rows: Row[] = [];
    const rowBudget = Math.max(320, maxW);
    let rowStart = 0;
    let rowNoteLen = 0;
    let colorCursor = 0;
    let pulseColorCursor = 0;

    const flush = (endGi: number) => {
      const slice = groups.slice(rowStart, endGi);
      const noteCount = slice.reduce(
        (s, g) => s + g.notes.filter(n => n.noteType === "normal").length, 0,
      );
      const colSlice = colors.slice(colorCursor, colorCursor + noteCount);
      colorCursor += noteCount;

      let pulseSlice: KonnakolGroup[] | null = null;
      let pulseColSlice: string[] = [];
      if (pulseGroups) {
        pulseSlice = pulseGroups.slice(rowStart, endGi);
        const pCount = pulseSlice.reduce(
          (s, g) => s + g.notes.filter(n => n.noteType === "normal").length, 0,
        );
        pulseColSlice = pulseColorsArr.slice(pulseColorCursor, pulseColorCursor + pCount);
        pulseColorCursor += pCount;
      }

      const totalNoteLen = slice.reduce((s, g) => s + g.notes.length, 0);
      const naturalW = totalNoteLen * PER_NOTE_PX + ROW_OVERHEAD_PX;
      // If only one row total, shrink to content; otherwise fill the budget
      // so multi-row layouts align visually.
      const width = Math.min(rowBudget, Math.max(280, naturalW));
      rows.push({ groups: slice, colors: colSlice, pulseGroups: pulseSlice, pulseColors: pulseColSlice, width });
    };

    for (let gi = 0; gi < groups.length; gi++) {
      const len = groups[gi].notes.length;
      const projected = (rowNoteLen + len) * PER_NOTE_PX + ROW_OVERHEAD_PX;
      if (rowNoteLen > 0 && projected > rowBudget) {
        flush(gi);
        rowStart = gi;
        rowNoteLen = len;
      } else {
        rowNoteLen += len;
      }
    }
    if (rowStart < groups.length) flush(groups.length);
    return rows;
  };

  // Derive the accent-phrase grouping from actual accent positions.
  // The subdivision grouping (pattern.grouping) describes beaming/tuplet structure;
  // the accent grouping describes what the listener actually hears as phrase boundaries.
  // These differ whenever accentMode is "repeat" or "groupings" — the header should
  // show the phrase grouping, not the subdivision.
  const accentStructure = (() => {
    const positions: number[] = [];
    const voicesAtAccents: DrumVoice[] = [];
    let idx = 0;
    for (const g of pattern.groups) {
      for (const s of g.slots) {
        if (s.isAccent) {
          positions.push(idx);
          voicesAtAccents.push(s.voice);
        }
        idx++;
      }
    }
    if (positions.length === 0) {
      return { grouping: pattern.grouping, voices: pattern.groups.map(g => g.voice) };
    }
    const grouping: number[] = [];
    for (let i = 0; i < positions.length; i++) {
      const next = i + 1 < positions.length ? positions[i + 1] : pattern.totalSlots;
      grouping.push(next - positions[i]);
    }
    return { grouping, voices: voicesAtAccents };
  })();

  return (
    <div ref={hostRef} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header — always show the accent-phrase grouping (what the listener
          hears); show subdivision grouping only when it differs. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#c8aa50", fontWeight: 700 }}>
          {accentStructure.grouping.join(" + ")}
        </span>
        {accentStructure.grouping.join(",") !== pattern.grouping.join(",") && (
          <span style={{ fontSize: 10, color: "#666" }}>
            over subdiv {pattern.grouping.join("+")}
          </span>
        )}
        <span style={{ fontSize: 10, color: "#444" }}>
          = {pattern.grouping.length} beats ({pattern.totalSlots} notes)
        </span>
        <span style={{ fontSize: 10, color: "#333" }}>
          [{accentStructure.voices.map(v => VOICE_SHORT[v]).join(" ")}]
        </span>
      </div>

      {/* Bars: one staff per bar (multiple in cycle mode, single in normal mode).
          Each bar wraps across multiple rows when its content exceeds availW. */}
      {bars.map((bar, barIdx) => {
        const rows = splitBarIntoRows(
          bar.groups, bar.colors, bar.pulseGroups, bar.pulseColors, availW,
        );
        return (
          <div key={barIdx} style={{
            display: "flex", flexDirection: "column", gap: 6,
            background: "#0a0a0a", borderRadius: 8, border: "1px solid #1a1a1a",
            padding: "6px 10px",
          }}>
            {/* Bar header (only shown in cycle mode) */}
            {bars.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, color: "#9999ee", letterSpacing: 1,
                }}>BAR {barIdx + 1}</span>
                <span style={{ fontSize: 8, color: "#444" }}>
                  groups {bar.groupRange[0] + 1}–{bar.groupRange[1]}
                </span>
              </div>
            )}

            {rows.map((row, rowIdx) => (
              <div key={rowIdx} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <ColoredStaff
                  groups={row.groups}
                  colors={row.colors}
                  width={row.width}
                  height={180}
                  pulseGroups={row.pulseGroups}
                  pulseHeight={row.pulseGroups && row.pulseGroups.length > 0 ? 140 : undefined}
                />
              </div>
            ))}
          </div>
        );
      })}

    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────────────────── */

export default function VocalPercussion() {
  // ── Config ─────────────────────────────────────────────────────────────
  const [numBeats, setNumBeats] = useState(4);
  const [groupingMode, setGroupingMode] = useState<GroupingMode>("musical");
  const [groupingInput, setGroupingInput] = useState("");
  const [useCustomGrouping, setUseCustomGrouping] = useState(false);
  const [enabledVoices, setEnabledVoices] = useState<DrumVoice[]>(["kick", "snare"]);
  const [allowedSubdivisions, setAllowedSubdivisions] = useState<number[]>([3, 4, 5, 6, 7]);
  const [bpm, setBpm] = useState(80);

  // ── Mode toggles ──────────────────────────────────────────────────────
  const [counterpoint, setCounterpoint] = useState(false);
  // Pulse-staff clicks per cycle.  numPulses === numBeats is the "quarter"
  // pulse; 2*numBeats is "eighth"; arbitrary values give polyrhythmic pulse
  // layers (e.g. 3 pulses over 4 beats → 3:4).
  const [numPulses, setNumPulses] = useState<number>(4);
  const [mutedVoices, setMutedVoices] = useState<Set<DrumVoice>>(new Set());
  const [sixteenthMode, setSixteenthMode] = useState(false);
  const [accentMode, setAccentMode] = useState<AccentMode>("first");
  const [accentEvery, setAccentEvery] = useState(3);
  // 32nds: when on, occasionally splits a 16th-group slot into two 32nds.
  const [splits32Enabled, setSplits32Enabled] = useState(false);
  // 16th in triplets: splits a triplet 8th into two 16ths within the triplet.
  const [splitsTriplet16Enabled, setSplitsTriplet16Enabled] = useState(false);
  // splitMode controls what drives the cycle length:
  //   "beats"  → numBeats × subdivision (per-beat density picked from allowedSubdivisions)
  //   "pulses" → exactly numPulses slots, partitioned into groups whose sizes are
  //              drawn from allowedSubdivisions. Group starts still produce accents.
  const [splitMode, setSplitMode] = useState<"beats" | "pulses">("beats");

  // 16th-groups mode is only meaningful when 16th is one of the allowed densities.
  // Any allowed subdivision can drive the 16th-groups generator now (the mode
  // picks one at generate time), so the toggle is always enabled.
  const canUseSixteenthMode = allowedSubdivisions.length > 0;
  const effectiveSixteenthMode = sixteenthMode && canUseSixteenthMode;

  // ── Pattern ────────────────────────────────────────────────────────────
  const [pattern, setPattern] = useState<VocalPattern | null>(null);
  const [history, setHistory] = useState<VocalPattern[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  // ── Practice log ──────────────────────────────────────────────────────
  // `isolation` = focusing on a single mode/voice/accent config in isolation.
  // `context`   = practising the pattern in a performance/ensemble context.
  // Mirrors the tagging DrumPatterns uses so entries are comparable.
  const [practiceTag, setPracticeTag] = useState<string>("isolation");
  const patternCaptureRef = useRef<HTMLDivElement>(null);

  // ── Playback ───────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stopRef = useRef(false);
  const loopRef = useRef(false);

  const prevGroupingsRef = useRef<number[][]>([]);

  // ── Voice toggles ─────────────────────────────────────────────────────
  const toggleVoice = useCallback((v: DrumVoice) => {
    setEnabledVoices(prev => {
      const has = prev.includes(v);
      const next = has ? prev.filter(x => x !== v) : [...prev, v];
      return next.length === 0 ? [v] : next;
    });
  }, []);

  const toggleMute = useCallback((v: DrumVoice) => {
    setMutedVoices(prev => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });
  }, []);

  // ── Generate ───────────────────────────────────────────────────────────
  const generate = useCallback(() => {
    stopAll();
    let pat: VocalPattern;

    // Resolve the grouping first
    let grouping: number[] | null = null;
    if (useCustomGrouping && groupingInput.trim()) {
      grouping = parseGrouping(groupingInput);
      if (!grouping) return;
    }

    // In 16th-groups mode: first pick a subdivision from allowedSubdivisions
    // (so we might pick septuplet=7, sextuplet=6, etc.), then ask the accent-
    // study generator for a musical grouping of (subdivision × numBeats) slots.
    // Example: subdivision=7, numBeats=4 → 28 slots partitioned into something
    // like 4+4+6+4+4+6, played as septuplets with accents at group starts.
    const SUBDIV_LABELS: Record<number, "8th" | "triplet" | "16th" | "quintuplet" | "sextuplet" | "septuplet" | "32nd"> = {
      2: "8th", 3: "triplet", 4: "16th", 5: "quintuplet", 6: "sextuplet", 7: "septuplet", 8: "32nd",
    };
    const sixteenthGrouping = (): number[] => {
      const pool = allowedSubdivisions.filter(n => SUBDIV_LABELS[n]);
      const chosen = pool.length > 0
        ? pool[Math.floor(Math.random() * pool.length)]
        : 4;
      const picker = groupingMode === "awkward" ? generateAwkwardGrouping : generateMusicalGrouping;
      return picker(SUBDIV_LABELS[chosen], numBeats, [], prevGroupingsRef.current);
    };

    if (grouping) {
      pat = generateFromGrouping(grouping, enabledVoices, 0);
    } else if (splitMode === "pulses") {
      // In pulse mode, group sizes come from NOTES/BEAT by default. When
      // "16th groups" is on, use the mixed 3/4/5/6/7 palette instead so the
      // partitioner can actually vary group sizes (otherwise a single NOTES/
      // BEAT value like 4 forces every generate to the same 4+4+…+remainder).
      const groupPalette = effectiveSixteenthMode ? [3, 4, 5, 6, 7] : allowedSubdivisions;
      const g = generatePulseGrouping(numPulses, groupPalette, groupingMode, prevGroupingsRef.current);
      pat = generateFromGrouping(g, enabledVoices, 0);
      prevGroupingsRef.current.push(g);
      if (prevGroupingsRef.current.length > 20) prevGroupingsRef.current.shift();
    } else if (effectiveSixteenthMode) {
      const g = sixteenthGrouping();
      pat = generateFromGrouping(g, enabledVoices, 0);
      pat = { ...pat, numBeats };
      prevGroupingsRef.current.push(g);
      if (prevGroupingsRef.current.length > 20) prevGroupingsRef.current.shift();
    } else {
      pat = generateVocalPattern(
        numBeats, groupingMode, enabledVoices, prevGroupingsRef.current, allowedSubdivisions, 0,
      );
      prevGroupingsRef.current.push(pat.grouping);
      if (prevGroupingsRef.current.length > 20) prevGroupingsRef.current.shift();
    }

    // In 16th-groups mode (and pulses mode, which is rendered as uniform 16ths)
    // the accent is always "start of each grouping" — the default
    // buildGroupFromSticking already does that, so we skip the accent override
    // entirely. Outside those modes, apply the selected accent mode.
    if (!effectiveSixteenthMode && splitMode !== "pulses") {
      pat = applyAccentMode(pat, accentMode, accentEvery);
    }

    // Accent-driven musical voicing: K/S anchors on accents, context-weighted
    // interior moves from GROOVE_MOVES, 2-slot max same-voice run. Every slot
    // shows its syllable (the spoken vocabulary for sight-reading).
    pat = applyGrooveVoicing(pat, enabledVoices, {
      suppressHat: false,
    });

    const splitSizes = new Set<number>();
    if (splits32Enabled) splitSizes.add(4);
    if (splitsTriplet16Enabled) splitSizes.add(3);
    if (splitSizes.size > 0) {
      pat = applySplits(pat, splitSizes);
    }

    setPattern(pat);
    setHistory(prev => [...prev, pat]);
    setHistoryIdx(prev => prev + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numBeats, numPulses, splitMode, groupingMode, useCustomGrouping, groupingInput, enabledVoices, allowedSubdivisions, splits32Enabled, splitsTriplet16Enabled, effectiveSixteenthMode, accentMode, accentEvery]);

  // ── Playback ───────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    stopRef.current = true;
    loopRef.current = false;
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
    setIsPlaying(false);
    setActiveSlot(null);
  }, []);

  const ensureAudio = useCallback(async () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed")
      audioCtxRef.current = new AudioContext();
    if (audioCtxRef.current.state === "suspended")
      await audioCtxRef.current.resume();
    return audioCtxRef.current;
  }, []);

  const scheduleOneCycle = useCallback((
    ctx: AudioContext, result: PlaybackResult,
    cycleStart: number, secPerUnit: number,
    muted: Set<DrumVoice>, pulseCount: number | null,
  ) => {
    // Drum hits + visual cursor for each pattern slot.
    result.events.forEach((ev, i) => {
      const time = cycleStart + ev.timeOffset * secPerUnit;

      const voiceMuted = muted.has(ev.slot.voice);
      const isRest = ev.slot.isRest === true;
      if (!voiceMuted && !isRest) {
        scheduleDrumHit(ctx, time, ev.slot.voice, ev.slot.isAccent, 0.7);
      }

      const delay = Math.max(0, (time - ctx.currentTime) * 1000);
      const tid = setTimeout(() => {
        if (!stopRef.current) setActiveSlot(i);
      }, delay);
      timersRef.current.push(tid);
    });

    // Pulse clicks — evenly spaced across the cycle duration.  Decoupled from
    // drum-slot indices so arbitrary (pulses, beats) ratios produce the right
    // polyrhythm.
    if (pulseCount && pulseCount > 0) {
      const cycleDur = result.totalDuration * secPerUnit;
      for (let p = 0; p < pulseCount; p++) {
        const time = cycleStart + (p * cycleDur) / pulseCount;
        schedulePulseClick(ctx, time, 0.5);
      }
    }
  }, []);

  const play = useCallback(async (loop: boolean) => {
    if (!pattern) return;
    stopAll();
    stopRef.current = false;
    loopRef.current = loop;

    const ctx = await ensureAudio();
    setIsPlaying(true);

    const result = flattenForPlayback(pattern, false);
    const secPerUnit = 60 / bpm;
    const cycleDurSec = result.totalDuration * secPerUnit;
    let cycleStart = ctx.currentTime + 0.1;

    const cp: number | null = counterpoint ? numPulses : null;

    const initialCycles = loop ? 4 : 1;
    for (let c = 0; c < initialCycles; c++) {
      scheduleOneCycle(ctx, result, cycleStart, secPerUnit, mutedVoices, cp);
      cycleStart += cycleDurSec;
    }

    if (loop) {
      const advance = () => {
        if (stopRef.current || !loopRef.current) return;
        scheduleOneCycle(ctx, result, cycleStart, secPerUnit, mutedVoices, cp);
        cycleStart += cycleDurSec;
        timersRef.current.push(setTimeout(advance, cycleDurSec * 800));
      };
      timersRef.current.push(setTimeout(advance, cycleDurSec * 2000));
    } else {
      const endTid = setTimeout(() => {
        if (!stopRef.current) { setActiveSlot(null); setIsPlaying(false); }
      }, (cycleDurSec + 0.3) * 1000);
      timersRef.current.push(endTid);
    }
  }, [pattern, bpm, mutedVoices, counterpoint, numPulses, stopAll, ensureAudio, scheduleOneCycle]);

  useEffect(() => () => { stopAll(); }, [stopAll]);
  useEffect(() => { if (!pattern) generate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectHistory = useCallback((idx: number) => {
    stopAll();
    setPattern(history[idx]);
    setHistoryIdx(idx);
  }, [history, stopAll]);

  // ── Style helpers ─────────────────────────────────────────────────────
  const chk = (on: boolean, color: string) => ({
    width: 16, height: 16, borderRadius: 4, cursor: "pointer",
    border: `1.5px solid ${on ? color : "#333"}`,
    background: on ? color + "33" : "#111",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 10, color: on ? color : "transparent", flexShrink: 0,
  } as const);

  return (
    <div style={{ margin: "0 auto", padding: "8px 4px", width: "100%" }}>

      {/* Main layout */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>

        {/* LEFT: Controls */}
        <div style={{
          display: "flex", flexDirection: "column", gap: 12,
          minWidth: 210, maxWidth: 250, flexShrink: 0,
          background: "#0e0e0e", borderRadius: 10, border: "1px solid #1a1a1a",
          padding: "14px 12px",
        }}>

          {/* Grouping source */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => setUseCustomGrouping(false)} style={{
                flex: 1, height: 26, borderRadius: 4, fontSize: 10, fontWeight: 700,
                border: `1.5px solid ${!useCustomGrouping ? "#c8aa50" : "#222"}`,
                background: !useCustomGrouping ? "#c8aa5022" : "#111",
                color: !useCustomGrouping ? "#c8aa50" : "#555", cursor: "pointer",
              }}>Random</button>
              <button onClick={() => setUseCustomGrouping(true)} style={{
                flex: 1, height: 26, borderRadius: 4, fontSize: 10, fontWeight: 700,
                border: `1.5px solid ${useCustomGrouping ? "#c8aa50" : "#222"}`,
                background: useCustomGrouping ? "#c8aa5022" : "#111",
                color: useCustomGrouping ? "#c8aa50" : "#555", cursor: "pointer",
              }}>Custom</button>
            </div>

            {useCustomGrouping ? (
              <input value={groupingInput} onChange={e => setGroupingInput(e.target.value)}
                placeholder="3+2+3"
                style={{
                  height: 30, borderRadius: 5, fontSize: 13, fontWeight: 700,
                  border: `1.5px solid ${parseGrouping(groupingInput) ? "#c8aa50" : groupingInput ? "#e0606066" : "#2a2a2a"}`,
                  background: "#111", color: "#c8aa50", textAlign: "center", outline: "none", padding: "0 8px",
                }}
              />
            ) : (
              <>
                {/* Split: drive cycle length by beats-with-subdivisions, or by a flat
                    pulse count (subdivisions then act as group sizes within N pulses). */}
                <div style={{ display: "flex", gap: 3 }}>
                  {([
                    { v: "beats" as const, label: "By beats", title: "Cycle = numBeats × per-beat subdivision" },
                    { v: "pulses" as const, label: "By pulses", title: "Cycle = exactly N pulses; subdivisions become group sizes" },
                  ]).map(m => {
                    const on = splitMode === m.v;
                    return (
                      <button key={m.v} onClick={() => setSplitMode(m.v)} title={m.title} style={{
                        flex: 1, height: 22, borderRadius: 4, fontSize: 10, fontWeight: 700,
                        border: `1.5px solid ${on ? "#c8aa50" : "#222"}`,
                        background: on ? "#c8aa5022" : "#111",
                        color: on ? "#c8aa50" : "#555", cursor: "pointer",
                      }}>{m.label}</button>
                    );
                  })}
                </div>
                {splitMode === "beats" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input type="number" min={1} max={16} value={numBeats}
                      onChange={e => setNumBeats(Math.max(1, Math.min(16, Number(e.target.value) || 1)))}
                      style={{
                        width: 42, height: 28, borderRadius: 5, fontSize: 12,
                        border: "1.5px solid #2a2a2a", background: "#111",
                        color: "#c8aa50", textAlign: "center", outline: "none",
                      }}
                    />
                    <span style={{ fontSize: 9, color: "#555", marginLeft: 2, marginRight: 4 }}>beats</span>
                    {[2, 3, 4, 6, 8].map(n => (
                      <button key={n} onClick={() => setNumBeats(n)} style={{
                        width: 24, height: 22, borderRadius: 4, fontSize: 9, fontWeight: 700,
                        border: `1px solid ${numBeats === n ? "#c8aa50" : "#1e1e1e"}`,
                        background: numBeats === n ? "#c8aa5022" : "#111",
                        color: numBeats === n ? "#c8aa50" : "#444", cursor: "pointer",
                      }}>{n}</button>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input type="number" min={1} max={64} value={numPulses}
                      onChange={e => {
                        const v = Number(e.target.value) || 1;
                        setNumPulses(Math.max(1, Math.min(64, v)));
                      }}
                      style={{
                        width: 48, height: 28, borderRadius: 5, fontSize: 12,
                        border: "1.5px solid #2a2a2a", background: "#111",
                        color: "#c8aa50", textAlign: "center", outline: "none",
                      }}
                    />
                    <span style={{ fontSize: 9, color: "#555", marginLeft: 2, marginRight: 4 }}>pulses</span>
                    {[8, 12, 16, 20, 24].map(n => (
                      <button key={n} onClick={() => setNumPulses(n)} style={{
                        width: 24, height: 22, borderRadius: 4, fontSize: 9, fontWeight: 700,
                        border: `1px solid ${numPulses === n ? "#c8aa50" : "#1e1e1e"}`,
                        background: numPulses === n ? "#c8aa5022" : "#111",
                        color: numPulses === n ? "#c8aa50" : "#444", cursor: "pointer",
                      }}>{n}</button>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 3 }}>
                  {GROUPING_MODES.map(m => {
                    const on = groupingMode === m.value;
                    return (
                      <button key={m.value} onClick={() => setGroupingMode(m.value)} style={{
                        flex: 1, height: 22, borderRadius: 4, fontSize: 10, fontWeight: 700,
                        border: `1.5px solid ${on ? m.color : "#222"}`,
                        background: on ? m.color + "22" : "#111",
                        color: on ? m.color : "#555", cursor: "pointer",
                      }}>{m.label}</button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Voices */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 1 }}>VOICES</span>
            <div style={{ display: "flex", gap: 3 }}>
              {ALL_VOICES.map(v => {
                const on = enabledVoices.includes(v);
                return (
                  <button key={v} onClick={() => toggleVoice(v)} style={{
                    flex: 1, height: 24, borderRadius: 4, fontSize: 9, fontWeight: 700,
                    border: `1.5px solid ${on ? VOICE_COLORS[v] : "#222"}`,
                    background: on ? VOICE_COLORS[v] + "22" : "#111",
                    color: on ? VOICE_COLORS[v] : "#333", cursor: "pointer",
                  }}>{VOICE_SHORT[v]}</button>
                );
              })}
            </div>
          </div>

          {/* Notes per beat (per-beat density). Each beat uses one of the checked values. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 1 }}>NOTES / BEAT</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 3 }}>
              {[3, 4, 5, 6, 7, 8].map(n => {
                const on = allowedSubdivisions.includes(n);
                const labels: Record<number, string> = {
                  3: "trip", 4: "16th", 5: "quin", 6: "sex", 7: "sep", 8: "32nd",
                };
                return (
                  <button key={n} onClick={() => {
                    setAllowedSubdivisions(prev => {
                      const has = prev.includes(n);
                      const next = has ? prev.filter(x => x !== n) : [...prev, n];
                      return next.length === 0 ? [n] : next;
                    });
                  }} style={{
                    padding: "3px 2px", height: 32, borderRadius: 4,
                    display: "flex", flexDirection: "column", alignItems: "center",
                    gap: 0, fontSize: 8, fontWeight: 700,
                    border: `1.5px solid ${on ? "#9999ee" : "#222"}`,
                    background: on ? "#9999ee22" : "#111",
                    color: on ? "#9999ee" : "#333", cursor: "pointer",
                  }}>
                    <span style={{ fontSize: 11 }}>{n}</span>
                    <span style={{ fontSize: 7, opacity: 0.7 }}>{labels[n]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* BPM */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 1 }}>BPM</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" min={30} max={300} value={bpm}
                onChange={e => setBpm(Math.max(30, Math.min(300, Number(e.target.value) || 80)))}
                style={{
                  width: 46, height: 28, borderRadius: 5, fontSize: 12,
                  border: "1.5px solid #2a2a2a", background: "#111",
                  color: "#60c0a0", textAlign: "center", outline: "none",
                }}
              />
              <input type="range" min={30} max={300} value={bpm}
                onChange={e => setBpm(Number(e.target.value))}
                style={{ flex: 1, accentColor: "#60c0a0" }}
              />
            </div>
          </div>

          {/* ── Mode toggles ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7, borderTop: "1px solid #1a1a1a", paddingTop: 10 }}>

            {/* Accents */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 1 }}>ACCENTS</span>
              <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                {([
                  { value: "first",  label: "On 1" },
                  { value: "repeat", label: "Every" },
                  { value: "groupings", label: "Groupings" },
                ] as { value: AccentMode; label: string }[]).map(opt => {
                  const on = accentMode === opt.value;
                  return (
                    <button key={opt.value} onClick={() => setAccentMode(opt.value)} style={{
                      flex: 1, height: 24, borderRadius: 4, fontSize: 10, fontWeight: 700,
                      border: `1.5px solid ${on ? "#e09060" : "#222"}`,
                      background: on ? "#e0906022" : "#111",
                      color: on ? "#e09060" : "#444", cursor: "pointer",
                    }}>{opt.label}</button>
                  );
                })}
              </div>
              {accentMode === "repeat" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 2 }}>
                  <span style={{ fontSize: 10, color: "#555" }}>every</span>
                  <input type="number" min={1} max={32} value={accentEvery}
                    onChange={e => setAccentEvery(Math.max(1, Math.min(32, Number(e.target.value) || 3)))}
                    style={{
                      width: 40, height: 22, borderRadius: 4, fontSize: 10,
                      border: "1px solid #2a2a2a", background: "#111",
                      color: "#e09060", textAlign: "center", outline: "none",
                    }}
                  />
                  <span style={{ fontSize: 10, color: "#555" }}>notes</span>
                </div>
              )}
            </div>

            {/* 16th-groups — only when 16th is in allowed densities */}
            <div
              onClick={canUseSixteenthMode ? () => setSixteenthMode(v => !v) : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                cursor: canUseSixteenthMode ? "pointer" : "not-allowed",
                opacity: canUseSixteenthMode ? 1 : 0.35,
              }}
              title={canUseSixteenthMode ? "" : "Enable 16th in Notes / Beat to use"}
            >
              <div style={chk(effectiveSixteenthMode, "#60c0a0")}>{effectiveSixteenthMode && "✓"}</div>
              <span style={{
                fontSize: 11, fontWeight: 600,
                color: effectiveSixteenthMode ? "#60c0a0" : "#555",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                16th groups
                {!canUseSixteenthMode && <span style={{ fontSize: 10, color: "#555" }}>🔒</span>}
              </span>
              {effectiveSixteenthMode && <span style={{ fontSize: 9, color: "#60c0a066" }}>mixed 3/4/5/6/7</span>}
            </div>

            {/* Pulse — N evenly-spaced clicks per cycle.  N=beats reproduces a
                quarter pulse; N=2*beats reproduces an eighth pulse; arbitrary
                values give polyrhythmic cross-layers (3:4, 5:4, 7:8, etc.). */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                onClick={() => setCounterpoint(v => !v)}>
                <div style={chk(counterpoint, "#c8aa50")}>{counterpoint && "✓"}</div>
                <span style={{ fontSize: 11, fontWeight: 600, color: counterpoint ? "#c8aa50" : "#555" }}>Pulse</span>
              </div>
              {counterpoint && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginLeft: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, color: "#888" }}>Pulses</span>
                    <input
                      type="number"
                      min={1}
                      max={64}
                      value={numPulses}
                      onChange={e => {
                        const v = parseInt(e.target.value, 10);
                        if (Number.isFinite(v) && v >= 1) setNumPulses(v);
                      }}
                      style={{
                        width: 48, height: 22, borderRadius: 4, padding: "0 6px",
                        border: "1px solid #222", background: "#111",
                        color: "#c8aa50", fontSize: 11, fontWeight: 700,
                      }}
                    />
                    <span style={{ fontSize: 9, color: "#555" }}>
                      {numPulses}:{numBeats} ratio
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 3 }}>
                    {[
                      { n: numBeats, label: "♩" },
                      { n: numBeats * 2, label: "♪" },
                      { n: numBeats * 3, label: "♪♪♪" },
                    ].map(p => {
                      const on = numPulses === p.n;
                      return (
                        <button key={p.label} onClick={() => setNumPulses(p.n)} style={{
                          flex: 1, height: 20, borderRadius: 4, fontSize: 10, fontWeight: 700,
                          border: `1px solid ${on ? "#c8aa50" : "#222"}`,
                          background: on ? "#c8aa5022" : "#111",
                          color: on ? "#c8aa50" : "#444", cursor: "pointer",
                          padding: "0 4px",
                        }}>{p.label}</button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Splits: optionally halve some notes into the next finer
                subdivision. Each toggle is greyed out when its base subdivision
                isn't in the NOTES/BEAT selection. */}
            {(() => {
              const canSplit32 = allowedSubdivisions.includes(4);
              const canSplitTrip16 = allowedSubdivisions.includes(3);
              const on32 = splits32Enabled && canSplit32;
              const onTrip16 = splitsTriplet16Enabled && canSplitTrip16;
              const btn = (label: string, title: string, on: boolean, enabled: boolean, toggle: () => void) => (
                <button
                  key={label}
                  onClick={enabled ? toggle : undefined}
                  disabled={!enabled}
                  title={enabled ? title : `${title} — enable ${label === "32nd" ? "16th" : "triplet"} in NOTES/BEAT to use.`}
                  style={{
                    flex: 1, height: 22, borderRadius: 4, fontSize: 9, fontWeight: 700,
                    border: `1.5px solid ${on ? "#9999ee" : enabled ? "#222" : "#181818"}`,
                    background: on ? "#9999ee22" : "#111",
                    color: on ? "#9999ee" : enabled ? "#444" : "#2a2a2a",
                    cursor: enabled ? "pointer" : "not-allowed",
                    opacity: enabled ? 1 : 0.5,
                  }}
                >{label}</button>
              );
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 1 }}>SPLITS</span>
                  <div style={{ display: "flex", gap: 3 }}>
                    {btn("32nd", "Split 16ths into 32nd pairs", on32, canSplit32, () => setSplits32Enabled(v => !v))}
                    {btn("16 trip", "Split triplet 8ths into 16th pairs", onTrip16, canSplitTrip16, () => setSplitsTriplet16Enabled(v => !v))}
                  </div>
                </div>
              );
            })()}

            {/* Voice muting */}
            {pattern && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 9, color: "#444", fontWeight: 700, letterSpacing: 1 }}>MUTE (you vocalize)</span>
                <div style={{ display: "flex", gap: 3 }}>
                  {ALL_VOICES.map(v => {
                    const on = mutedVoices.has(v);
                    return (
                      <button key={v} onClick={() => toggleMute(v)} style={{
                        flex: 1, height: 22, borderRadius: 4, fontSize: 9, fontWeight: 700,
                        border: `1.5px solid ${on ? "#e06060" : VOICE_COLORS[v] + "44"}`,
                        background: on ? "#e0606022" : "#111",
                        color: on ? "#e06060" : "#333",
                        cursor: "pointer", textDecoration: on ? "line-through" : "none",
                      }}>{VOICE_SHORT[v]}</button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Generate + Play */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 2 }}>
            <button onClick={generate} style={{
              height: 34, borderRadius: 6, fontSize: 12, fontWeight: 700,
              border: "1.5px solid #c8aa50", background: "#c8aa5022",
              color: "#c8aa50", cursor: "pointer",
            }}>Generate</button>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => isPlaying ? stopAll() : play(false)} disabled={!pattern} style={{
                flex: 1, height: 30, borderRadius: 6, fontSize: 11, fontWeight: 700,
                border: `1.5px solid ${isPlaying && !loopRef.current ? "#e06060" : "#60c0a0"}`,
                background: isPlaying && !loopRef.current ? "#e0606022" : "#60c0a022",
                color: isPlaying && !loopRef.current ? "#e06060" : "#60c0a0",
                cursor: pattern ? "pointer" : "default", opacity: pattern ? 1 : 0.4,
              }}>{isPlaying && !loopRef.current ? "Stop" : "Play"}</button>
              <button onClick={() => isPlaying ? stopAll() : play(true)} disabled={!pattern} style={{
                flex: 1, height: 30, borderRadius: 6, fontSize: 11, fontWeight: 700,
                border: `1.5px solid ${isPlaying && loopRef.current ? "#e06060" : "#9999ee"}`,
                background: isPlaying && loopRef.current ? "#e0606022" : "#9999ee22",
                color: isPlaying && loopRef.current ? "#e06060" : "#9999ee",
                cursor: pattern ? "pointer" : "default", opacity: pattern ? 1 : 0.4,
              }}>{isPlaying && loopRef.current ? "Stop" : "Loop"}</button>
            </div>
          </div>

          {/* History */}
          {history.length > 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 160, overflowY: "auto" }}>
              <span style={{ fontSize: 9, color: "#444", fontWeight: 700, letterSpacing: 1 }}>HISTORY</span>
              {history.map((pat, i) => (
                <button key={i} onClick={() => selectHistory(i)} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "3px 8px", borderRadius: 5, textAlign: "left",
                  border: `1px solid ${i === historyIdx ? "#9999ee44" : "#151515"}`,
                  background: i === historyIdx ? "#9999ee0d" : "transparent",
                  color: i === historyIdx ? "#9999ee" : "#444", cursor: "pointer", fontSize: 10,
                }}>
                  <span style={{ color: "#333" }}>#{i + 1}</span>
                  <span>{(pat.phraseGrouping ?? pat.grouping).join("+")}</span>
                  {pat.meterBeats && <span style={{ color: "#9999ee44" }}>/{pat.meterBeats}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Pattern */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Practice log save bar — positioned above the preview (top right
              of the layout) so the log action and the tag picker stay visible
              even when the staff is tall.  Mirrors DrumPatterns: isolation vs
              context tag, captures the preview image, snapshot carries all
              config needed to rebuild the pattern later. */}
          <PracticeLogSaveBar
            mode="vocal-percussion"
            label="Vocal Percussion"
            tagOptions={[
              { value: "isolation", label: "Isolation", color: "#e0a040" },
              { value: "context",   label: "Context",   color: "#7aaa7a" },
            ]}
            defaultTag={practiceTag}
            onTagChange={setPracticeTag}
            getSnapshot={() => {
              if (!pattern) {
                return { preview: "No pattern generated yet", snapshot: {}, canRestore: false };
              }
              const subdiv = pattern.grouping[0] ?? 0;
              const subdivLabel =
                subdiv === 2 ? "8th" : subdiv === 3 ? "triplet" :
                subdiv === 4 ? "16th" : subdiv === 5 ? "quintuplet" :
                subdiv === 6 ? "sextuplet" : subdiv === 7 ? "septuplet" :
                subdiv === 8 ? "32nd" : `sub=${subdiv}`;
              const allSame = pattern.grouping.every(g => g === subdiv);
              const gridDesc = allSame ? subdivLabel : pattern.grouping.join("+");
              const voiceStr = enabledVoices.map(v => VOICE_SHORT[v]).join("");
              const preview = [
                `${pattern.grouping.length} beats · ${pattern.totalSlots} notes`,
                `Grid: ${gridDesc}`,
                `Accent: ${accentMode}${accentMode === "repeat" ? ` (every ${accentEvery})` : ""}`,
                `BPM ${bpm}`,
                `Voices: ${voiceStr}`,
              ].join(" · ");
              return {
                preview,
                snapshot: {
                  pattern,
                  numBeats,
                  groupingMode,
                  enabledVoices,
                  allowedSubdivisions,
                  bpm,
                  accentMode,
                  accentEvery,
                  counterpoint,
                  numPulses,
                  sixteenthMode,
                  splits32Enabled,
                  splitsTriplet16Enabled,
                },
                canRestore: false,
              };
            }}
            getCapture={async () => {
              if (!patternCaptureRef.current) return undefined;
              const { captureElement } = await import("@/lib/captureUtil");
              return captureElement(patternCaptureRef.current, "#0c0c0c");
            }}
          />

          {pattern ? (
            <div ref={patternCaptureRef} style={{
              background: "#0e0e0e", borderRadius: 10, border: "1px solid #1a1a1a",
              padding: "8px 8px",
            }}>
              <PatternDisplay
                pattern={pattern}
                activeSlot={activeSlot}
                mutedVoices={mutedVoices}
                numPulses={null}
                sixteenthMode={effectiveSixteenthMode || splitMode === "pulses"}
              />
            </div>
          ) : (
            <div style={{
              background: "#0e0e0e", borderRadius: 10, border: "1px solid #1a1a1a",
              padding: "40px 20px", textAlign: "center", color: "#333", fontSize: 12,
            }}>
              Click <strong style={{ color: "#c8aa50" }}>Generate</strong> to create a pattern
            </div>
          )}

          {/* Colour-to-voice legend — replaces the syllable cheat sheet now
              that voices are identified by notehead colour instead of text. */}
          <VoiceColorLegend />
        </div>
      </div>
    </div>
  );
}
