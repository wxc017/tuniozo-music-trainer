// ── Jianpu / Sol-fa numbered-notation editor ─────────────────────────────────
//
// A dedicated numbered-notation editor (EOP-NMN-Master style).  Notes are typed
// as scale degrees 1–7 (0 = rest); the same data can be shown as jianpu numbers
// or tonic sol-fa (d r m f s l t + chromatics).  Every score has TWO voices,
// always shown (upper / lower); pick a voice by clicking its line.  Only
// octaves + durations are modelled (no dynamics / slurs / key signatures).
//
// Interaction mirrors the staff editor: click to place the cursor, click a
// number to select it, drag a rectangle to multi-select, then change duration.
// Rendering is a self-contained SVG so PDF export reuses the svg2pdf path.

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  NoteData, NoteEntryProject, Duration, MeasureTimeSig,
  DURATION_ORDER, DURATION_NAMES, DURATION_SLOTS,
  measureSlots, noteSlots,
  loadProjects, saveProject, generateJianpuMusicXML,
} from "@/lib/noteEntryData";
import {
  jianpuToPitch, jianpuGlyphFor, edoNoteLabel, regularSolfaSyllable, minorLowersDegree,
  NOTATION_SYSTEM_LABELS, type NotationSystem,
} from "@/lib/jianpu";
import { MOVABLE_DO } from "@/lib/notationLabels";
import { exportToPdf, downloadMusicXml } from "@/lib/exportPdf";
import ClefReference from "./ClefReference";

// ── Layout constants ─────────────────────────────────────────────────────────
const LEFT_PAD        = 26;   // room for the piano brace on the left
const DEFAULT_MEASURE_W = 170;   // floor width for a bar (kept modest so margins stay tight)
const INNER_PAD       = 0;    // no bar-edge inset: slot 0 sits on the left barline so
                              // the 8th-cells divide the bar evenly and every syllable
                              // centres in its cell (cell-centring gives its own margin)
const HEADER_H        = 44;
const CELL_W          = 22;   // pixels for ONE 8th-note cell (the base grid unit)
const BEAT_SLOTS      = DURATION_SLOTS["q"];   // 8 — one beat, in slots
const EIGHTH_SLOTS    = DURATION_SLOTS["8"];   // 4 — base cell for pixels-per-slot
const GRID_ORDER: Duration[] = ["h", "q", "8", "16", "32"];  // snap grids, coarse→fine
// Layout is recomputed every render (module-level so the geometry helpers below
// see it): sections and manual breaks split the bars into rows of ≤ MPR, and
// each bar's width follows its own time signature, so a bar's position/size is
// looked up rather than derived from a single uniform width.
let MPR       = 4;    // measures per row (max — a section may start a shorter row)
let ROW_OF: number[]   = [0];   // row index of each bar
let COL_OF: number[]   = [0];   // column-within-row of each bar
let ROW_TOP: number[]  = [0];   // top-Y of each row (section rows get extra pad)
let ROWS: number[][]   = [[0]]; // bars in each row
let ROW_COUNT          = 1;
let W_OF: number[]     = [DEFAULT_MEASURE_W];  // width of each bar (∝ its meter)
let X_OF: number[]     = [LEFT_PAD];           // left-X of each bar (row-centred)
let CANVAS_W           = LEFT_PAD * 2 + DEFAULT_MEASURE_W;
let VC_OF: number[]           = [2];    // voice-line count of each bar's section
let HS_OF: (number | null)[]  = [null]; // hand-split (piano brace) of each bar's section
let CELL_OF: number[]         = [BEAT_SLOTS]; // grid cell (slots) of each bar = its finest note, ≤ a beat
function cellSlotsOf(m: number): number { return CELL_OF[m] ?? BEAT_SLOTS; }
const NUM_FONT     = 22;
// Stroke weight shared by every duration RULE — the 8th/16th underlines, the
// beams joining them, and the vertical half/whole strokes.  One constant so the
// marks that all mean "duration" read as the same pen at any grid size.
const RULE_W       = 1.5;
// Curvy, rounded display face for the jianpu numerals/accidentals/dashes
// (loaded from Google Fonts in index.html).  Falls back to Helvetica.
const JIANPU_FONT  = "'Comfortaa', Helvetica, Arial, sans-serif";
const FIRST_VOICE  = 40;   // baseline offset of the first (top) voice within a system
const VOICE_GAP    = 56;   // vertical distance between successive voice lines
const HAND_GAP     = 26;   // extra separation between the two hands when braced
const BAR_TOP_PAD  = 18;   // barline extends this far above the first voice baseline
const BAR_BOT_PAD  = 22;   // …and this far below the last voice baseline
const SYSTEM_PAD   = 22;   // gap below a system before the next row
const SECTION_PAD  = 44;   // extra top gap on a row that opens a labelled section / cut line
const SECTION_LABEL_DY = 44;  // section heading baseline above the bar top (clears the "+ note" line)
const TS_PAD       = 22;   // extra bottom gap on a row carrying a time-signature label
const CHORD_DY     = 24;   // vertical gap between stacked chord numbers
const CHORD_PAD    = 24;   // extra top gap on a row that carries the italic chord lane
const CHORD_LANE_DY = 44;  // chord-lane baseline above the bar top (above the "+ note" line)
// The reference line every bar width is scaled against: four 4/4 bars = 128 slots.
// A row fills to this budget, so it holds eight 2/4 bars, four 4/4 bars, or two
// 15/8 bars — whatever actually fits, rather than a fixed number of bars.
const REF_BARS     = 4;
const GROUP_PAD    = 40;   // extra top gap on a row carrying grouping brackets
                           // (the end ticks now extend ABOVE the lane as well)
// The bracket needs to clear everything that already lives above the numeral:
// octave-up dots stack from ~font+2 above the baseline (barTop is only 18 above
// it) and an accent sits above those again, so a short lane collided with both.
const GROUP_LANE_DY = 30;  // grouping bracket sits this far above the bar top
const GROUP_TICK   = 5;    // length of the bracket's downward end ticks
const MIN_VOICES   = 2;    // always at least two voices (EOP-style)
const MAX_VOICES   = 6;
const WHITE        = "#ffffff";  // pure white so PDF export recolours → black
const ACCENT       = "#7173e6";

interface Cursor { voice: number; measure: number; slot: number; }
interface NotePos { id: string; x: number; y: number; }

// ── Geometry helpers (parametrised by voice count, which can grow) ───────────
function measureLeftX(measure: number): number { return X_OF[measure] ?? LEFT_PAD; }
function measureWidth(measure: number): number { return W_OF[measure] ?? DEFAULT_MEASURE_W; }
function rowOf(measure: number): number { return ROW_OF[measure] ?? Math.floor(measure / MPR); }
// `handSplit` = the voice index where the lower hand starts (voices ≥ it are
// pushed down by HAND_GAP so the two hands read as a piano grand staff).  null
// → no gap (single group).
function systemHeight(voiceCount: number, gapped: boolean): number {
  return FIRST_VOICE + (voiceCount - 1) * VOICE_GAP + (gapped ? HAND_GAP : 0) + BAR_BOT_PAD + SYSTEM_PAD;
}
// Voice-line count / hand-split of the SECTION a bar belongs to (per-section
// voicing — each labelled exercise can have its own number of voices).
function vcOf(measure: number): number { return VC_OF[measure] ?? 2; }
function hsOf(measure: number): number | null { return HS_OF[measure] ?? null; }
function rowTopY(measure: number): number { return ROW_TOP[rowOf(measure)] ?? HEADER_H; }
function baselineY(voice: number, measure: number): number {
  const hs = hsOf(measure);
  const extra = hs != null && voice >= hs ? HAND_GAP : 0;
  return rowTopY(measure) + FIRST_VOICE + voice * VOICE_GAP + extra;
}
function slotToX(measure: number, slot: number, totalSlots: number): number {
  return measureLeftX(measure) + INNER_PAD + (slot / totalSlots) * (measureWidth(measure) - 2 * INNER_PAD);
}
// Left-opening curly brace `{` from y1→y2, its right edge at x, tip pointing
// left.  The tip (centre point) sits at `tipY` — defaults to the midpoint, but
// for a piano brace it's placed at the gap between the two hands.
function bracePath(x: number, y1: number, y2: number, tipY?: number): string {
  const w = 7;
  const t = tipY ?? (y1 + y2) / 2;
  const hu = (t - y1) * 0.5;   // half of the upper arm
  const hl = (y2 - t) * 0.5;   // half of the lower arm
  return [
    `M ${x} ${y1}`,
    `q ${-w} 0 ${-w} ${hu}`,               // upper terminal hook
    `L ${x - w} ${t - hu}`,                // upper arm
    `q 0 ${hu} ${-w * 0.9} ${hu}`,         // pinch into the tip at t
    `q ${w * 0.9} 0 ${w * 0.9} ${hl}`,     // out of the tip
    `L ${x - w} ${y2 - hl}`,               // lower arm
    `q 0 ${hl} ${w} ${hl}`,                // lower terminal hook
  ].join(" ");
}
function pitchRank(n: NoteData): number { return (n.jianpuOctave ?? 0) * 7 + (n.jianpuDegree ?? 0); }
/** Effective alteration (EDO steps): explicit field, else legacy #/b accidental. */
function altOf(n: NoteData): number {
  return n.alteration ?? (n.jianpuAccidental === "#" ? 1 : n.jianpuAccidental === "b" ? -1 : 0);
}
/** Half-width of an underline/beam under a glyph — scales with label length so
 *  a 2-letter syllable (e.g. "mo") sits centred over its line. */
function labelHalfW(label: string): number {
  return 9 + Math.max(0, label.length - 1) * 4;
}

/** Standard music-notation rest drawn as SVG SHAPES (paths/rects), so it exports
 *  to PDF cleanly — font glyphs don't embed.  Centred at (cx, cy). */
function restShape(dur: Duration, cx: number, cy: number, key: string): React.ReactNode[] {
  const els: React.ReactNode[] = [];
  if (dur === "w" || dur === "h") {
    // Whole rest hangs below a ledge; half rest sits on it.
    els.push(<line key={`${key}-l`} x1={cx - 8} x2={cx + 8} y1={cy} y2={cy} stroke={WHITE} strokeWidth={1.2} />);
    els.push(<rect key={`${key}-r`} x={cx - 6} y={dur === "w" ? cy - 5 : cy} width={12} height={5} fill={WHITE} />);
    return els;
  }
  if (dur === "q") {
    // Standard quarter rest (𝄽): three angular zig-zag strokes down, then a
    // small curled tail at the bottom — reads as a proper rest, not a squiggle.
    // This is the original f7ea1ab drawing.  It was later "improved" — zig-zag
    // reversed to start upper-RIGHT, stroke thinned 2.6 → 2.2, split into two
    // paths with butt caps — and every one of those made it worse.  Leave it be.
    els.push(<path key={`${key}-q`} fill="none" stroke={WHITE} strokeWidth={2.6}
      strokeLinejoin="miter" strokeLinecap="round"
      d={`M ${cx - 2.5} ${cy - 9} L ${cx + 3} ${cy - 4} L ${cx - 2.5} ${cy - 1} L ${cx + 3.5} ${cy + 3.5} `
        + `C ${cx + 0.5} ${cy + 2.5} ${cx - 2} ${cy + 5} ${cx + 1.5} ${cy + 9}`} />);
    return els;
  }
  // Eighth / 16th / 32nd — a slanted stroke with 1 / 2 / 3 flag dots.
  const flags = dur === "8" ? 1 : dur === "16" ? 2 : 3;
  els.push(<line key={`${key}-s`} x1={cx + 3.5} y1={cy - 7} x2={cx - 3.5} y2={cy + 9} stroke={WHITE} strokeWidth={1.6} />);
  for (let f = 0; f < flags; f++) {
    els.push(<circle key={`${key}-f${f}`} cx={cx + 2 - f * 0.8} cy={cy - 6 + f * 5} r={2} fill={WHITE} />);
  }
  return els;
}

export interface JianpuModeProps {
  controlledActiveId?: string;
  onBack?: () => void;
  /** Embedded mode (e.g. the Sol-fa Spectrum trainer answer sheet): hides all
   *  project chrome — the Back/Export/Piano action row, the title/composer/EDO
   *  block, the time-signature + Bars controls, and the keybind footer —
   *  leaving just the note-entry toolbar and the score. */
  embedded?: boolean;
  /** Sol-fa-only: lock the notation system to sol-fa syllables and hide the
   *  jianpu/sol-fa toggle (the "Sol-fa" scoring mode has no numbered notation). */
  solfaOnly?: boolean;
  /** Report this sheet's EDO to the app so the global Notation ("n") overlay is
   *  scoped to the piece's EDO instead of whatever the rest of the app is on. */
  onActiveEdo?: (edo: number) => void;
  /** The app's per-EDO solfège selection (from the "n" overlay).  When the piece's
   *  EDO maps to "Movable Do", degrees read as do-re-mi; otherwise Spectrum-ege. */
  solfege?: Record<number, string>;
  /** Set the app's solfège system for an EDO (so the editor's Major/Minor toggle
   *  can switch the "n" overlay's Spectrum-ege ↔ Movable Do). */
  onSolfege?: (edo: number, system: string) => void;
}

export default function JianpuMode({ controlledActiveId, onBack, embedded = false, solfaOnly = false, onActiveEdo, solfege, onSolfege }: JianpuModeProps) {
  const [project, setProject] = useState<NoteEntryProject | null>(null);
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [cursor, setCursor] = useState<Cursor>({ voice: 0, measure: 0, slot: 0 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dragRect, setDragRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [system, setSystem] = useState<NotationSystem>("jianpu");

  // Entry tools
  const [duration, setDuration] = useState<Duration>("q");
  const [dotted, setDotted] = useState(false);
  const [octave, setOctave] = useState(0);
  // Snap grid — the columns notes lock onto, INDEPENDENT of their duration, so
  // you can drop e.g. quarter notes on any 16th column (across voices).  Cursor
  // steps and click-placement snap to this; `[` / `]` change it.
  const [gridDur, setGridDur] = useState<Duration>("8");
  const [edoText, setEdoText] = useState("12");   // free-typed EDO, committed on blur
  const [barsText, setBarsText] = useState("8");  // free-typed bar count, committed on blur
  // Per-bar time-sig being typed.  `dirty` = the user actually changed the text,
  // so merely focusing and leaving an input can never write anything.
  const [tsEdit, setTsEdit] = useState<{ m: number; text: string; dirty: boolean } | null>(null);
  const [showClefRef, setShowClefRef] = useState(false);   // C2–C6 treble/bass reference
  // "measure:slot" keys whose mid-bar note editor is open but still empty — an
  // editor only persists once you type something into it.
  const [openSlotNotes, setOpenSlotNotes] = useState<Set<string>>(new Set());
  // Chord-lane slots opened for typing (persist only once you type a chord in).
  const [openChordSlots, setOpenChordSlots] = useState<Set<string>>(new Set());

  const scoreRef = useRef<HTMLDivElement | null>(null);
  const scoreAreaRef = useRef<HTMLDivElement | null>(null);
  const notePosRef = useRef<NotePos[]>([]);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDownRef = useRef(false);
  const scaleRef = useRef(1);   // score → screen scale (fit-to-width)
  const [containerW, setContainerW] = useState(0);
  const spaceHeldRef = useRef(false);        // Space held → arrows extend selection
  const anchorRef = useRef<Cursor | null>(null);

  const fifths = 0; // jianpu has no key signature — degrees resolve against C

  // ── Load project ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!controlledActiveId) return;
    const p = loadProjects().find(pr => pr.id === controlledActiveId) ?? null;
    if (p) {
      setProject(p);
      setNotes(p.notes ?? []);
      setSystem(solfaOnly ? "solfa" : (p.displaySystem ?? "jianpu"));
      setCursor({ voice: 0, measure: 0, slot: 0 });
      setSelectedIds([]);
      // Fresh undo history for the loaded project (never undo across projects).
      historyRef.current = [];
      prevProjectRef.current = p;
      skipHistoryRef.current = true;
      setCanUndo(false);
    }
  }, [controlledActiveId]);

  // Track the score-area width so the score can be scaled to fit (all measures
  // visible at once, no horizontal scrollbar).
  useEffect(() => {
    const el = scoreAreaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setContainerW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [project]);


  const persist = useCallback((nextNotes: NoteData[], nextProject?: NoteEntryProject) => {
    const base = nextProject ?? project;
    if (!base) return;
    const updated = { ...base, notes: nextNotes };
    saveProject(updated);
    setProject(updated);
  }, [project]);

  // ── Undo history ────────────────────────────────────────────────────────────
  // Snapshot the project before each edit.  Every mutation replaces `project`
  // with a fresh object, so an effect on `project` records the previous state;
  // `skipHistoryRef` stops the undo itself from being recorded.
  const historyRef = useRef<NoteEntryProject[]>([]);
  const prevProjectRef = useRef<NoteEntryProject | null>(null);
  const skipHistoryRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  useEffect(() => {
    if (!project) return;
    if (skipHistoryRef.current) { skipHistoryRef.current = false; prevProjectRef.current = project; return; }
    const prev = prevProjectRef.current;
    if (prev && prev.id === project.id && prev !== project) {
      historyRef.current.push(prev);
      if (historyRef.current.length > 100) historyRef.current.shift();
      setCanUndo(true);
    }
    prevProjectRef.current = project;
  }, [project]);

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) { setCanUndo(false); return; }
    skipHistoryRef.current = true;
    saveProject(prev);
    setProject(prev);
    setNotes(prev.notes ?? []);
    setSelectedIds([]);
    setCanUndo(historyRef.current.length > 0);
  }, []);

  const setup = project?.setup;
  const sectionLabels = project?.setup.perBarSection;
  const breaks = project?.setup.perBarBreakBefore;
  const perSection = project?.perSectionVoiceCount;
  // Sol-fa is a single melodic line, so it may drop to one voice; jianpu keeps
  // the piano-style two-voice minimum.
  const minVoices = solfaOnly ? 1 : MIN_VOICES;

  // ── Sections & per-section voice counts ─────────────────────────────────────
  // A "section" is an independent group: it starts at bar 0, at any bar with a
  // section label, OR at a manually cut line.  Each group has its own voice count
  // (and piano brace), so changing one exercise never touches another.
  const isBoundary = useCallback((m: number) => m > 0 && (!!sectionLabels?.[m]?.trim() || !!breaks?.[m]), [sectionLabels, breaks]);
  const sectionStartOf = useCallback((measure: number): number => {
    let s = 0;
    for (let m = 1; m <= measure; m++) if (isBoundary(m)) s = m;
    return s;
  }, [isBoundary]);
  const sectionRangeOf = useCallback((measure: number): [number, number] => {
    const bc = project?.setup.barCount ?? 1;
    const start = sectionStartOf(measure);
    let end = bc;
    for (let m = start + 1; m < bc; m++) if (isBoundary(m)) { end = m; break; }
    return [start, end];
  }, [project?.setup.barCount, isBoundary, sectionStartOf]);
  // Effective voice lines for the section holding `measure`: never below
  // MIN_VOICES, always enough to show its notes, plus any stored empty voices
  // (bar-0 section falls back to the legacy global `voiceCount`).
  const voiceCountOf = useCallback((measure: number): number => {
    const [start, end] = sectionRangeOf(measure);
    const stored = perSection?.[start] ?? (start === 0 ? project?.voiceCount : undefined) ?? minVoices;
    let maxNote = 0;
    for (const n of notes) if (n.measure >= start && n.measure < end) maxNote = Math.max(maxNote, (n.voice ?? 0) + 1);
    return Math.max(minVoices, stored, maxNote);
  }, [perSection, project?.voiceCount, notes, sectionRangeOf, minVoices]);

  const edo = project?.edo ?? 12;
  // Movable-do (do-re-mi) vs universal Spectrum-ege is decided ONLY by the "n"
  // overlay's solfège pick for this EDO.  The editor Major/Minor toggle switches
  // that pick too, so the two stay in sync.
  const movableDo = edo === 12 && solfege?.[edo] === MOVABLE_DO;
  useEffect(() => { setEdoText(String(edo)); }, [edo]);
  // Tell the app this sheet's EDO so the global Notation ("n") overlay follows it.
  useEffect(() => { if (project) onActiveEdo?.(edo); }, [edo, project, onActiveEdo]);
  useEffect(() => { setBarsText(String(project?.setup.barCount ?? 8)); }, [project?.setup.barCount]);

  // Which bar opens the GROUP a bar belongs to — a group starts at bar 0, at a
  // section label, or at a manual cut.  Computed here (not from `layout`, which
  // needs bar widths and therefore meters) so `effectiveTs` can use it.
  const groupStartOf = useCallback((measure: number): number => {
    let start = 0;
    for (let m = 1; m <= measure; m++) {
      if (sectionLabels?.[m]?.trim() || project?.setup.perBarBreakBefore?.[m]) start = m;
    }
    return start;
  }, [sectionLabels, project?.setup.perBarBreakBefore]);

  // A time signature applies forward until the next change — but ONLY inside its
  // own group.  Groups are independent sets of bars, so a meter set in one must
  // not reach past the cut into the next; the walk therefore stops at the group
  // start, and a group with no override of its own uses the score default.
  const effectiveTs = useCallback((measure: number): MeasureTimeSig => {
    const per = setup?.perBarTimeSig;
    if (per) for (let k = measure, first = groupStartOf(measure); k >= first; k--) if (per[k]) return per[k];
    return setup?.defaultTimeSig ?? { num: 4, den: 4 };
  }, [setup, groupStartOf]);
  // ── Cycle mode ────────────────────────────────────────────────────────────
  // Time signatures off entirely: the grid is a constant eighth-note stream and a
  // "bar" is a CYCLE whose length is wherever the user ended it (Enter).  A cycle
  // with no stored length is OPEN — it grows to hold whatever is entered, so you
  // never run out of bar and never have to declare a metre first.
  const cycleMode = !!project?.cycleMode;
  const CYCLE_MIN_SLOTS = EIGHTH_SLOTS;   // an empty cycle still shows one cell to type into
  // End of the last note in a bar (0 when empty) — what an open cycle grows to hold.
  const barFillOf = useCallback((measure: number): number => {
    let end = 0;
    for (const n of notes) if (n.measure === measure) end = Math.max(end, n.startSlot + noteSlots(n));
    return end;
  }, [notes]);
  const totalSlotsOf = useCallback((measure: number): number => {
    if (!setup) return 32;
    if (cycleMode) {
      const closed = setup.perBarCycleSlots?.[measure];
      // A closed cycle keeps its length even if a note overruns it (the overrun
      // is visible rather than silently restretching the bar you just fixed).
      if (closed != null) return Math.max(EIGHTH_SLOTS, closed);
      // Open: EXACTLY the music in it.  This used to reserve a spare cell to type
      // into, which made every open cycle read one beat longer than it sounded —
      // a lone quarter (2 eighths) showed as 3.  The spare isn't needed: an open
      // cycle's cursor doesn't wrap, so entry extends the bar on its own.
      return Math.max(CYCLE_MIN_SLOTS, barFillOf(measure));
    }
    return measureSlots(effectiveTs(measure));
  }, [setup, effectiveTs, cycleMode, barFillOf, CYCLE_MIN_SLOTS]);

  // The line is sized by SLOTS, not by a bar count: a row holds as many bars as
  // fit the reference width, so eight 2/4 bars fill a line exactly as four 4/4
  // bars do (both are 128 slots).  MPR is now only a sanity ceiling for very
  // short bars, and the fallback used before the layout runs.
  MPR = 16;

  // Row + size layout.  A bar opens a new row when it starts a section, carries a
  // manual break, or the current row already holds MPR bars.  All bars share one
  // width — sized to the densest bar so nothing squishes and every bar lines up
  // (symmetrical) — and rows are left-aligned.  Row height follows that row's
  // section voice count.  Written to the module-level arrays so the geometry
  // helpers above resolve each bar.
  const layout = useMemo(() => {
    const barCount = setup?.barCount ?? 1;
    // Piano brace is per section (falls back to the legacy global flag).
    const braceFor = (s: number) => project?.perSectionPianoBrace?.[s] ?? !!project?.pianoBrace;
    const breakAt   = (m: number) => !!project?.setup.perBarBreakBefore?.[m];
    const sectionAt = (m: number) => !!sectionLabels?.[m]?.trim();
    // Rows: break on a section label, a manual cut, a full row (MPR), or when the
    // row's SLOTS would overrun the reference line.  MPR alone isn't enough — bar
    // width is slot-proportional (below), so four 15/8 bars come to 240 slots
    // against a 128-slot reference line and the row runs ~1.9x past the container.
    // Budgeting by slots keeps 4/4 at four bars a row while letting a long meter
    // take as many as actually fit (15/8 → two).  Short meters still stop short of
    // the full width — MPR remains the cap, so a 2/4 line ends halfway as intended.
    const ROW_SLOT_BUDGET = REF_BARS * measureSlots({ num: 4, den: 4 });
    const rowsArr: number[][] = [];
    let rowSlots = 0;
    for (let m = 0; m < barCount; m++) {
      const last = rowsArr[rowsArr.length - 1];
      const slots = totalSlotsOf(m);
      // A bar wider than a whole line still gets its own row rather than none.
      const overruns = !!last && last.length > 0 && rowSlots + slots > ROW_SLOT_BUDGET;
      if (m === 0 || breakAt(m) || sectionAt(m) || !last || last.length >= MPR || overruns) {
        rowsArr.push([m]);
        rowSlots = slots;
      } else {
        last.push(m);
        rowSlots += slots;
      }
    }
    if (!rowsArr.length) rowsArr.push([0]);
    // Section start of each bar — a group starts at bar 0, a section label, or a
    // manual cut.  Everything below (width, meter, voices, numbering) is scoped to
    // the group so cut groups stay independent.
    const startOf: number[] = [];
    { let c = 0; for (let m = 0; m < barCount; m++) { if (m > 0 && (sectionAt(m) || breakAt(m))) c = m; startOf[m] = c; } }
    // Per-group measure numbering: 1a 2a … then 1b 2b … (a new letter per group).
    const groupOrder = new Map<number, number>();
    for (let m = 0; m < barCount; m++) { const s = startOf[m]; if (!groupOrder.has(s)) groupOrder.set(s, groupOrder.size); }
    const numLabel: string[] = [];
    for (let m = 0; m < barCount; m++) {
      const gi = groupOrder.get(startOf[m]) ?? 0;
      numLabel[m] = `${m - startOf[m] + 1}${String.fromCharCode(97 + (gi % 26))}`;
    }
    // Uniform pixels-per-slot across the whole score: every bar's width is just
    // its slot count × a constant, so a 2/4 bar is exactly half a 4/4 bar and any
    // two same-meter bars line up.  The constant is pinned to a FIXED reference —
    // REF_BARS 4/4 bars fill the container — NOT to whatever the widest row
    // happens to hold.  Stretching to the actual content made meter invisible: a
    // line of four 2/4 bars was blown up to fill the same width as a line of four
    // 4/4 bars, so a short bar looked exactly like a long one.  Short bars keep
    // their true width; the ROW just fits more of them (eight 2/4 to a line).
    const cell = system === "solfa" ? 34 : CELL_W;
    const REF_ROW_SLOTS = REF_BARS * measureSlots({ num: 4, den: 4 });
    const availW = Math.max(0, containerW - LEFT_PAD * 2 - 32);
    const pxPerSlot = Math.max(cell / EIGHTH_SLOTS, availW > 0 ? availW / REF_ROW_SLOTS : 0);
    // Grid cell PER GROUP, never coarser than an EIGHTH: the finest of the 8th
    // cell, the chosen snap grid, and that group's OWN finest note.  The 8th cap
    // is what keeps syllable placement stable — a half grid, a quarter grid and
    // an 8th grid all resolve to the same 8th-note columns, so pressing [ / ] or
    // entering a longer note never slides the syllables sideways; longer notes
    // just fill their extra 8th cells with dashes.  Only actual 16ths/32nds in a
    // group subdivide further (they have to, or two heads would share one x).
    // Per-group so one exercise's fine notes don't force dashes into every other
    // group.  Bar WIDTHS stay uniform (pxPerSlot), so a 2/4 bar is still exactly
    // half a 4/4 bar regardless.
    const groupFinest: Record<number, number> = {};
    for (const n of notes) { const s = startOf[n.measure] ?? 0; groupFinest[s] = Math.min(groupFinest[s] ?? BEAT_SLOTS, DURATION_SLOTS[n.duration]); }
    const cellArr: number[] = [];
    for (let m = 0; m < barCount; m++) {
      const gf = groupFinest[startOf[m]] ?? BEAT_SLOTS;
      cellArr[m] = Math.max(1, Math.min(EIGHTH_SLOTS, DURATION_SLOTS[gridDur], gf));
    }
    const wArr: number[] = [];
    for (let m = 0; m < barCount; m++) wArr[m] = Math.max(cell, Math.round(totalSlotsOf(m) * pxPerSlot));
    // Per-group voice count (stored min or the tallest note voice in the group).
    const maxVoice: Record<number, number> = {};
    for (const n of notes) { const s = startOf[n.measure] ?? 0; maxVoice[s] = Math.max(maxVoice[s] ?? 0, (n.voice ?? 0) + 1); }
    const vcForStart = (s: number) => Math.max(
      minVoices, perSection?.[s] ?? (s === 0 ? project?.voiceCount ?? minVoices : minVoices), maxVoice[s] ?? 0);
    const vcArr: number[] = [], hsArr: (number | null)[] = [];
    for (let m = 0; m < barCount; m++) {
      const s = startOf[m];
      const vc = vcForStart(s);
      vcArr[m] = vc;
      // Explicit per-section split (upper-hand voice count) if set, else auto ⌈vc/2⌉,
      // always clamped to 1..vc-1 so both hands keep at least one voice.
      const split = project?.perSectionHandSplit?.[s] ?? Math.ceil(vc / 2);
      hsArr[m] = braceFor(s) ? Math.max(1, Math.min(vc - 1, split)) : null;
    }
    // Row geometry — height follows the row's voice count; bars are left-aligned
    // and accumulate their own widths.  Canvas width = the widest row.
    const rowW = rowsArr.map(row => row.reduce((s, m) => s + wArr[m], 0));
    const maxRowW = Math.max(...rowW);
    // Cycle mode prints a cycle length under every bar instead of a metre, so the
    // label lane is reserved unconditionally there.
    const hasTsLabel = (m: number) => cycleMode || m === startOf[m] || !!project?.setup.perBarTimeSig?.[m];
    const rowOfArr: number[] = [], colOfArr: number[] = [], rowTop: number[] = [], xArr: number[] = [];
    let y = HEADER_H;
    const rowCut: number[] = [];   // clean page-break y at the top of each row's block
    rowsArr.forEach((row, r) => {
      rowCut[r] = y;               // before the heading pad → safe break between rows
      // A line the user deliberately started (a section OR a manual cut) gets
      // headroom for a title above it; auto-wrapped continuations don't.
      if (sectionAt(row[0]) || breakAt(row[0])) y += SECTION_PAD;
      // Reserve a line above the bar for the italic chord lane when this row uses it.
      if (row.some(m => Object.keys(project?.setup.perChord?.[m] ?? {}).length > 0)) y += CHORD_PAD;
      // …and a lane for cycle-mode grouping brackets when any bar in the row has them.
      if (row.some(m => notes.some(n => n.measure === m && n.groupEnd)
                        || (project?.setup.perBarGroupEnds?.[m]?.length ?? 0) > 0)) y += GROUP_PAD;
      rowTop[r] = y;
      let x = LEFT_PAD;   // far-left
      row.forEach((m, c) => { rowOfArr[m] = r; colOfArr[m] = c; xArr[m] = x; x += wArr[m]; });
      y += systemHeight(vcArr[row[0]] ?? minVoices, hsArr[row[0]] != null);
      if (row.some(hasTsLabel)) y += TS_PAD;   // room for the time-signature line
    });
    return { rowsArr, rowOfArr, colOfArr, rowTop, rowCut, wArr, xArr, vcArr, hsArr, cellArr, pxPerSlot, numLabel, startOf, totalHeight: y, canvasW: LEFT_PAD * 2 + maxRowW };
  }, [setup?.barCount, project?.setup.perBarBreakBefore, project?.setup.perBarTimeSig, project?.setup.perChord, sectionLabels, perSection,
      project?.voiceCount, project?.pianoBrace, project?.perSectionPianoBrace, notes, totalSlotsOf, system, minVoices, containerW, gridDur]);
  ROW_OF = layout.rowOfArr; COL_OF = layout.colOfArr; ROW_TOP = layout.rowTop;
  ROWS = layout.rowsArr; ROW_COUNT = layout.rowsArr.length;
  VC_OF = layout.vcArr; HS_OF = layout.hsArr; W_OF = layout.wArr; X_OF = layout.xArr; CANVAS_W = layout.canvasW;
  CELL_OF = layout.cellArr;
  // Pixels-per-slot the layout settled on (stretched to fill the width) — used
  // to size the syllable font so it fills its cell at any grid resolution.
  const pxPerSlot = layout.pxPerSlot;

  // Cursor/click snap to the shared grid cell (the chosen snap grid, refined by
  // any finer note present) — NOT the note duration, so notes of any length lock
  // to the same columns.  Matches the drawn grid (CELL_OF).
  const gridSnap = cellSlotsOf(cursor.measure);

  // Sol-fa has NO note selection at all — no click-to-select, no rubber-band
  // drag, no Space-extend, no highlight boxes.  You drive it purely with the
  // cursor, which is the whole interaction model there.
  const noSelect = system === "solfa";
  useEffect(() => { if (noSelect) { setSelectedIds([]); setDragRect(null); } }, [noSelect]);

  const commit = useCallback((next: NoteData[]) => {
    const sorted = next.sort((a, b) =>
      a.measure !== b.measure ? a.measure - b.measure
      : (a.voice ?? 0) !== (b.voice ?? 0) ? (a.voice ?? 0) - (b.voice ?? 0)
      : a.startSlot - b.startSlot);
    setNotes(sorted);
    persist(sorted);
  }, [persist]);

  const changeSystem = useCallback((s: NotationSystem) => {
    setSystem(s);
    if (project) { const u = { ...project, displaySystem: s, notes }; saveProject(u); setProject(u); }
  }, [project, notes]);

  // Sol-fa syllable style (12-EDO): spectrum (Da/Na/Fa) · major (do re mi) · minor.
  const setSolfaStyle = useCallback((s: "spectrum" | "major" | "minor") => {
    if (!project) return;
    const u = { ...project, solfaStyle: s, notes }; saveProject(u); setProject(u);
  }, [project, notes]);

  // Toggle the piano brace for the cursor's section only (keyed by its start bar).
  const togglePianoBrace = useCallback(() => {
    if (!project) return;
    const s = sectionStartOf(cursor.measure);
    const cur = project.perSectionPianoBrace?.[s] ?? !!project.pianoBrace;
    const perSectionPianoBrace = { ...(project.perSectionPianoBrace ?? {}), [s]: !cur };
    const u = { ...project, perSectionPianoBrace, notes };
    saveProject(u); setProject(u);
  }, [project, notes, cursor.measure, sectionStartOf]);

  // Toggle beamed vs separate underline for the current selection (or the note
  // at the cursor when nothing is selected) — never all notes at once.
  const toggleUnderlines = useCallback(() => {
    const ids = selectedIds.length
      ? selectedIds
      : (() => {
          const { voice, measure, slot } = cursor;
          const host = notes.find(n => (n.voice ?? 0) === voice && n.measure === measure && !n.isRest
            && slot >= n.startSlot && slot < n.startSlot + noteSlots(n));
          return host ? [host.id] : [];
        })();
    if (!ids.length) return;
    // Flip toward a single shared state: if any target is currently beamed,
    // separate them all; otherwise beam them all.
    const anyBeamed = notes.some(n => ids.includes(n.id) && !n.separateUnderline);
    commit(notes.map(n => ids.includes(n.id) ? { ...n, separateUnderline: anyBeamed || undefined } : n));
  }, [selectedIds, cursor, notes, commit]);

  const updateMeta = useCallback((patch: Partial<Pick<NoteEntryProject, "title" | "composer">>) => {
    if (!project) return;
    const u = { ...project, ...patch, notes };
    saveProject(u); setProject(u);
  }, [project, notes]);

  const setEdo = useCallback((n: number) => {
    if (!project) return;
    const u = { ...project, edo: Math.max(5, Math.min(72, Math.round(n) || 12)), notes };
    saveProject(u); setProject(u);
  }, [project, notes]);
  const commitEdo = useCallback(() => {
    const n = parseInt(edoText, 10);
    setEdo(Number.isNaN(n) ? 12 : n);
  }, [edoText, setEdo]);

  const advanceCursor = useCallback((voice: number, measure: number, nextSlot: number) => {
    if (!project) return;
    const total = totalSlotsOf(measure);
    // An OPEN cycle never wraps — it grows instead, so entry just keeps flowing
    // and only Enter decides where the cycle ends.  A CLOSED one wraps as a bar does.
    if (cycleMode && project.setup.perBarCycleSlots?.[measure] == null) {
      setCursor({ voice, measure, slot: Math.max(0, nextSlot) });
      return;
    }
    if (nextSlot >= total) {
      const nm = Math.min(project.setup.barCount - 1, measure + 1);
      // Clamp so a long entry duration in a short bar can't push the slot
      // negative (which would corrupt the cursor / snap it to the wrong place).
      setCursor({ voice, measure: nm, slot: nm === measure ? Math.max(0, total - gridSnap) : 0 });
    } else {
      setCursor({ voice, measure, slot: Math.max(0, nextSlot) });
    }
  }, [project, totalSlotsOf, gridSnap, cycleMode]);

  // ── Note construction ─────────────────────────────────────────────────────
  const makeNote = useCallback((degree: number, isRest: boolean, dur: Duration, dot: boolean,
                                voice: number, measure: number, slot: number): NoteData => {
    // Diatonic Minor lowers degrees 3/6/7 a semitone — bake that as alteration −1
    // so the PITCH is a true minor third in EITHER display system (spectrum shows
    // "Na", movable-do "Me").  Independent of the display system.
    const minorMode = project?.solfaStyle === "minor";
    const alt = !isRest && minorMode && minorLowersDegree(degree) ? -1 : 0;
    const jp = isRest ? null : jianpuToPitch(degree, octave, alt < 0 ? "b" : undefined, fifths);
    return {
      id: crypto.randomUUID(),
      measure, startSlot: slot, duration: dur, dotted: dot || undefined,
      voice, isRest,
      pitch: jp ? jp.pitch : "b/4",
      jianpuDegree: isRest ? 0 : degree,
      jianpuOctave: isRest ? undefined : octave,
      alteration: alt || undefined,
      solfaMode: isRest ? undefined : (project?.solfaStyle === "minor" ? "minor" : "major"),
    };
  }, [octave, project?.solfaStyle, movableDo]);

  const placeNote = useCallback((degree: number, isRest: boolean, held = false) => {
    if (!project) return;
    const { voice, measure, slot } = cursor;
    const newLen = DURATION_SLOTS[duration] * (dotted ? 1.5 : 1);
    const newNote = { ...makeNote(degree, isRest, duration, dotted, voice, measure, slot), held: held || undefined };
    const newEnd = slot + newLen;
    const kept = notes.filter(n => {
      if ((n.voice ?? 0) !== voice || n.measure !== measure) return true;
      const s = n.startSlot, e = n.startSlot + noteSlots(n);
      return e <= slot || s >= newEnd;
    });
    commit([...kept, newNote]);
    setSelectedIds([]);
    // Advance past the note just written — one grid step for anything that fits a
    // single cell, otherwise clear of its whole span, since the cursor never sits
    // inside a sounding note.  Embedded (trainer) mode holds the cursor so further
    // digits build a chord downward instead.
    if (!embedded) advanceCursor(voice, measure, slot + Math.max(gridSnap, newLen));
  }, [project, cursor, duration, dotted, notes, makeNote, commit, advanceCursor, embedded, gridSnap]);
  // Held continuation ("–"): a sustaining beat at the current duration, for
  // holding a note across beats / barlines.  Bound to the `-` keybind.
  const placeHeld = useCallback(() => { placeNote(1, false, true); }, [placeNote]);

  const inputDigit = useCallback((degree: number, isRest: boolean) => {
    const { voice, measure, slot } = cursor;
    if (!isRest) {
      // Retune an existing note in place (keep its duration / octave) instead of
      // adding a voice.  Target the single selected note if there is one, else
      // the note under the cursor.
      const selHost = selectedIds.length === 1 ? notes.find(n => n.id === selectedIds[0] && !n.isRest) : undefined;
      const host = selHost ?? notes.find(n => (n.voice ?? 0) === voice && n.measure === measure && !n.isRest
        && slot >= n.startSlot && slot < n.startSlot + noteSlots(n));
      if (host) {
        const minorMode = project?.solfaStyle === "minor";
        const alt = minorMode && minorLowersDegree(degree) ? -1 : 0;
        const jp = jianpuToPitch(degree, host.jianpuOctave ?? 0, alt < 0 ? "b" : host.jianpuAccidental, fifths);
        const mode = project?.solfaStyle === "minor" ? "minor" : "major";
        commit(notes.map(n => n.id === host.id ? { ...n, jianpuDegree: degree, alteration: alt || undefined, pitch: jp.pitch, solfaMode: mode } : n));
        setSelectedIds([]);
        setCursor({ voice: host.voice ?? 0, measure: host.measure, slot: host.startSlot });
        return;
      }
    }
    placeNote(degree, isRest);
  }, [cursor, selectedIds, notes, commit, placeNote, project?.solfaStyle, movableDo]);

  // ── Range select / copy / paste ───────────────────────────────────────────
  // Click a note (parks the cursor), then Shift+click another: everything from
  // the cursor to that note is selected.  Works in sol-fa too — plain clicking
  // still only moves the cursor there, so the cursor-driven model is intact and
  // Shift is the only thing that ever selects.
  const posKey = (m: number, s: number) => m * 100000 + s;
  const selectRangeTo = useCallback((n: NoteData) => {
    const a = posKey(cursor.measure, cursor.slot), b = posKey(n.measure, n.startSlot);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    // Span the voices between the two ends, so a same-line drag picks one line
    // and a cross-line one picks both hands, without needing a separate gesture.
    const vA = cursor.voice, vB = n.voice ?? 0;
    const vLo = Math.min(vA, vB), vHi = Math.max(vA, vB);
    setSelectedIds(notes.filter(x => {
      const k = posKey(x.measure, x.startSlot), v = x.voice ?? 0;
      return k >= lo && k <= hi && v >= vLo && v <= vHi;
    }).map(x => x.id));
  }, [cursor, notes]);

  const clipRef = useRef<NoteData[]>([]);
  const copySelection = useCallback(() => {
    if (!selectedIds.length) return;
    clipRef.current = notes.filter(n => selectedIds.includes(n.id))
      .sort((a, b) => a.measure - b.measure || a.startSlot - b.startSlot || (a.voice ?? 0) - (b.voice ?? 0))
      .map(n => ({ ...n }));
  }, [notes, selectedIds]);

  // Paste at the cursor, keeping every note's offset from the first copied one.
  // Slots FLOW across bars rather than being clamped, so a passage copied out of
  // a 15-beat cycle still lands correctly in bars of a different length.
  const pasteClipboard = useCallback(() => {
    if (!project || !clipRef.current.length) return;
    const clip = clipRef.current, base = clip[0];
    const out: NoteData[] = [];
    let maxM = project.setup.barCount - 1;
    for (const n of clip) {
      let m = cursor.measure + (n.measure - base.measure);
      let s = cursor.slot + (n.startSlot - base.startSlot);
      // Flow past the end of a bar instead of clamping, so a passage copied from
      // one bar length lands correctly in another.  Bounded purely as a runaway
      // guard — running off the END of the sheet is handled by growing it below.
      for (let guard = 0; s >= totalSlotsOf(m) && guard < 512; guard++) { s -= totalSlotsOf(m); m++; }
      if (m < 0 || s < 0) continue;
      maxM = Math.max(maxM, m);
      out.push({ ...n, id: crypto.randomUUID(), measure: m, startSlot: s,
                 voice: Math.max(0, cursor.voice + ((n.voice ?? 0) - (base.voice ?? 0))) });
    }
    if (!out.length) return;
    // Pasting several bars' worth into one bar GROWS the sheet to hold it rather
    // than dropping the overflow — silently losing half a copied phrase is worse
    // than adding the bars it needs.  64 is the editor's existing hard ceiling.
    const barCount = Math.min(64, Math.max(project.setup.barCount, maxM + 1));
    const kept = out.filter(n => n.measure < barCount);
    if (!kept.length) return;
    // Whatever already sat on a pasted (voice, measure, slot) is replaced — else
    // the old note and the pasted one would stack into an accidental chord.
    const key = (n: NoteData) => `${n.voice ?? 0}:${n.measure}:${n.startSlot}`;
    const taken = new Set(kept.map(key));
    const next = [...notes.filter(n => !taken.has(key(n))), ...kept]
      .sort((a, b) => a.measure - b.measure || (a.voice ?? 0) - (b.voice ?? 0) || a.startSlot - b.startSlot);
    // One write: notes and the grown bar count together, or the second save would
    // rebuild from a stale project and undo the first.
    const u: NoteEntryProject = { ...project, notes: next, setup: { ...project.setup, barCount } };
    setNotes(next); saveProject(u); setProject(u);
    setSelectedIds(kept.map(n => n.id));
  }, [project, cursor, notes, totalSlotsOf]);

  const deleteSelectedOrCursor = useCallback(() => {
    if (selectedIds.length) {
      commit(notes.filter(n => !selectedIds.includes(n.id)));
      setSelectedIds([]);
      return;
    }
    const { voice, measure, slot } = cursor;
    const inVoice = notes.filter(n => (n.voice ?? 0) === voice && n.measure === measure);
    let target = inVoice.find(n => slot >= n.startSlot && slot < n.startSlot + noteSlots(n));
    if (!target) {
      target = inVoice.filter(n => n.startSlot + noteSlots(n) <= slot)
        .sort((a, b) => b.startSlot - a.startSlot)[0];
    }
    if (!target) return;
    commit(notes.filter(n => n.id !== target!.id));
    setCursor({ voice, measure, slot: target.startSlot });
  }, [selectedIds, notes, cursor, commit]);

  // ── Cursor navigation (no selection) ────────────────────────────────────────
  //  fine    = one subdivision (finest note in the bar, so 16ths step one at a time)
  //  beat    = one quarter-note beat
  //  measure = jump to the first beat of the next/previous measure
  const nextCursorH = useCallback((cur: Cursor, dir: -1 | 1, mode: "fine" | "beat" | "measure"): Cursor => {
    if (!project) return cur;
    const barCount = project.setup.barCount;
    let { measure, slot } = cur;
    if (mode === "measure") {
      // Move to the far edge of the current measure; if already there, the next.
      const total = totalSlotsOf(measure);
      const atEdge = dir > 0 ? slot >= total - 1 : slot <= 0;
      if (atEdge) { measure = Math.max(0, Math.min(barCount - 1, measure + dir)); }
      return { ...cur, measure, slot: dir > 0 ? totalSlotsOf(measure) - 1 : 0 };
    }
    const total = totalSlotsOf(measure);
    let step: number;
    if (mode === "beat") step = 8;
    else {
      const inVM = notes.filter(n => (n.voice ?? 0) === cur.voice && n.measure === measure);
      const finest = inVM.reduce((mn, n) => Math.min(mn, DURATION_SLOTS[n.duration]), gridSnap);
      step = Math.max(1, Math.min(gridSnap, finest));
    }
    slot += dir * step;
    // A sounding note owns every slot it spans, so the cursor never stops inside
    // one — a half note takes you straight to the beat after it rather than
    // parking on the 8th cells it already fills.  Going right lands just past the
    // note; going left lands on its head.  (Rests don't block: you can overwrite
    // them freely.)
    const cover = notes.find(n => (n.voice ?? 0) === cur.voice && n.measure === measure && !n.isRest
      && slot > n.startSlot && slot < n.startSlot + noteSlots(n));
    if (cover) slot = dir > 0 ? cover.startSlot + noteSlots(cover) : cover.startSlot;
    if (slot < 0) {
      if (measure > 0) { measure -= 1; slot = totalSlotsOf(measure) - step; } else slot = 0;
    } else if (slot >= total) {
      if (measure < barCount - 1) { measure += 1; slot = 0; } else slot = total - step;
    }
    return { ...cur, measure, slot: Math.max(0, slot) };
  }, [project, notes, totalSlotsOf, gridSnap]);

  const moveCursorH = useCallback((dir: -1 | 1, mode: "fine" | "beat" | "measure") => {
    setCursor(cur => nextCursorH(cur, dir, mode));
  }, [nextCursorH]);

  // While Space is held, ←→ extends a selection from the anchor to the new
  // cursor (same voice).  Shift widens by a beat, Ctrl/⌘ to the measure edge.
  const linPos = (m: number, s: number) => m * 100000 + s;
  const extendSelect = useCallback((dir: -1 | 1, mode: "fine" | "beat" | "measure") => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const nc = nextCursorH(cursor, dir, mode);
    setCursor(nc);
    const lo = Math.min(linPos(anchor.measure, anchor.slot), linPos(nc.measure, nc.slot));
    const hi = Math.max(linPos(anchor.measure, anchor.slot), linPos(nc.measure, nc.slot));
    const ids = notes
      .filter(n => (n.voice ?? 0) === nc.voice && !n.isRest
        && linPos(n.measure, n.startSlot) >= lo && linPos(n.measure, n.startSlot) <= hi)
      .map(n => n.id);
    setSelectedIds(ids);
  }, [cursor, notes, nextCursorH]);

  // ── Setup mutation ──────────────────────────────────────────────────────────
  const updateSetup = useCallback((patch: Partial<NoteEntryProject["setup"]>) => {
    if (!project) return;
    const updated = { ...project, setup: { ...project.setup, ...patch }, notes };
    saveProject(updated);
    setProject(updated);
  }, [project, notes]);
  // Per-measure title / note (rendered above the bar).
  const updateBarTitle = useCallback((m: number, text: string) => {
    if (!project) return;
    const perBarTitle = { ...(project.setup.perBarTitle ?? {}) };
    if (text.trim()) perBarTitle[m] = text; else delete perBarTitle[m];
    updateSetup({ perBarTitle });
  }, [project, updateSetup]);
  // Mid-bar note at a given slot (a chord that changes part-way through the bar).
  // Slot 0 belongs to the bar title, so it never lands here.
  const updateSlotNote = useCallback((m: number, slot: number, text: string) => {
    if (!project) return;
    const perSlotNote = { ...(project.setup.perSlotNote ?? {}) };
    const bar = { ...(perSlotNote[m] ?? {}) };
    if (text.trim()) bar[slot] = text; else delete bar[slot];
    if (Object.keys(bar).length) perSlotNote[m] = bar; else delete perSlotNote[m];
    updateSetup({ perSlotNote });
  }, [project, updateSetup]);
  // Chord-lane symbol at a given slot (any slot, incl. slot 0 = downbeat chord).
  const updateChord = useCallback((m: number, slot: number, text: string) => {
    if (!project) return;
    const perChord = { ...(project.setup.perChord ?? {}) };
    const bar = { ...(perChord[m] ?? {}) };
    if (text.trim()) bar[slot] = text; else delete bar[slot];
    if (Object.keys(bar).length) perChord[m] = bar; else delete perChord[m];
    updateSetup({ perChord });
  }, [project, updateSetup]);
  // Per-section label (rendered large above the bar; also forces a line break).
  const updateBarSection = useCallback((m: number, text: string) => {
    if (!project) return;
    const perBarSection = { ...(project.setup.perBarSection ?? {}) };
    if (text.trim()) perBarSection[m] = text; else delete perBarSection[m];
    updateSetup({ perBarSection });
  }, [project, updateSetup]);
  // Per-measure time-signature override.  Empty text clears it (the bar reverts
  // to the previous meter); "n/d" sets it (den snapped to 1/2/4/8/16/32).  The
  // 32-slot bar math in totalSlotsOf already honours perBarTimeSig.
  const commitBarTimeSig = useCallback((m: number, text: string) => {
    if (!project) return;
    const perBarTimeSig = { ...(project.setup.perBarTimeSig ?? {}) };
    const t = text.trim();
    if (!t) { delete perBarTimeSig[m]; updateSetup({ perBarTimeSig }); return; }
    const mm = t.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!mm) return;   // incomplete/invalid — leave unchanged
    const num = Math.max(1, Math.min(32, parseInt(mm[1], 10)));
    const valid = [1, 2, 4, 8, 16, 32];
    let den = parseInt(mm[2], 10);
    if (!valid.includes(den)) den = valid.reduce((a, b) => Math.abs(b - den) < Math.abs(a - den) ? b : a, 4);
    perBarTimeSig[m] = { num, den };
    updateSetup({ perBarTimeSig });
  }, [project, updateSetup]);
  // Cycle mode is a per-project switch.  Turning it OFF leaves the stored cycle
  // lengths alone so the time signatures (and the cycles) both survive a toggle
  // back and forth — neither view destroys the other's data.
  const toggleCycleMode = useCallback(() => {
    if (!project) return;
    const u = { ...project, cycleMode: !project.cycleMode, notes };
    saveProject(u); setProject(u);
  }, [project, notes]);
  const commitBars = useCallback(() => {
    const n = parseInt(barsText, 10);
    updateSetup({ barCount: Math.max(1, Math.min(64, Number.isNaN(n) ? 8 : n)) });
  }, [barsText, updateSetup]);
  // Toggle a manual line break so bar `m` starts a new line (the "cut line here"
  // button, and the `b` keybind, set it for the bar after the cursor).
  const toggleBreakBefore = useCallback((m: number) => {
    if (!project || m <= 0 || m >= project.setup.barCount) return;
    const perBarBreakBefore = { ...(project.setup.perBarBreakBefore ?? {}) };
    if (perBarBreakBefore[m]) delete perBarBreakBefore[m]; else perBarBreakBefore[m] = true;
    updateSetup({ perBarBreakBefore });
  }, [project, updateSetup]);
  // Insert an empty bar at `insertAt`, pushing later bars up one and re-indexing
  // every per-bar map (titles, sections, breaks, time sigs, section voice counts).
  const insertMeasureAt = useCallback((insertAt: number) => {
    if (!project || project.setup.barCount >= 64) return;
    const shift = <T,>(map?: Record<number, T>): Record<number, T> | undefined => {
      if (!map) return undefined;
      const out: Record<number, T> = {};
      for (const k of Object.keys(map)) { const i = +k; out[i >= insertAt ? i + 1 : i] = map[i]; }
      return out;
    };
    const nextNotes = notes
      .map(n => n.measure >= insertAt ? { ...n, measure: n.measure + 1 } : n)
      .sort((a, b) => a.measure - b.measure || (a.voice ?? 0) - (b.voice ?? 0) || a.startSlot - b.startSlot);
    const u: NoteEntryProject = {
      ...project,
      notes: nextNotes,
      perSectionVoiceCount: shift(project.perSectionVoiceCount),
      setup: {
        ...project.setup,
        barCount: project.setup.barCount + 1,
        perBarTitle: shift(project.setup.perBarTitle),
        perSlotNote: shift(project.setup.perSlotNote),
        perChord: shift(project.setup.perChord),
        perBarSection: shift(project.setup.perBarSection),
        perBarBreakBefore: shift(project.setup.perBarBreakBefore),
        perBarTimeSig: shift(project.setup.perBarTimeSig),
        perBarCycleSlots: shift(project.setup.perBarCycleSlots),
        perBarVolta: shift(project.setup.perBarVolta),
      },
    };
    saveProject(u); setProject(u); setNotes(nextNotes);
  }, [project, notes]);
  // Add a measure to the CURSOR's group (its last bar), not the end of the piece.
  const addMeasure = useCallback(() => {
    if (!project) return;
    const [, end] = sectionRangeOf(cursor.measure);
    insertMeasureAt(end);
  }, [project, cursor.measure, sectionRangeOf, insertMeasureAt]);
  // Delete bar `m`: drop its notes, pull later bars back one, and re-index every
  // per-bar map (titles, sections, breaks, time sigs, section voice counts).
  const deleteMeasure = useCallback((m: number) => {
    if (!project || project.setup.barCount <= 1) return;
    const shift = <T,>(map?: Record<number, T>): Record<number, T> | undefined => {
      if (!map) return undefined;
      const out: Record<number, T> = {};
      for (const k of Object.keys(map)) { const i = +k; if (i < m) out[i] = map[i]; else if (i > m) out[i - 1] = map[i]; }
      return out;
    };
    const nextNotes = notes
      .filter(n => n.measure !== m)
      .map(n => n.measure > m ? { ...n, measure: n.measure - 1 } : n)
      .sort((a, b) => a.measure - b.measure || (a.voice ?? 0) - (b.voice ?? 0) || a.startSlot - b.startSlot);
    const u: NoteEntryProject = {
      ...project,
      notes: nextNotes,
      perSectionVoiceCount: shift(project.perSectionVoiceCount),
      setup: {
        ...project.setup,
        barCount: project.setup.barCount - 1,
        perBarTitle: shift(project.setup.perBarTitle),
        perSlotNote: shift(project.setup.perSlotNote),
        perChord: shift(project.setup.perChord),
        perBarSection: shift(project.setup.perBarSection),
        perBarBreakBefore: shift(project.setup.perBarBreakBefore),
        perBarTimeSig: shift(project.setup.perBarTimeSig),
        perBarCycleSlots: shift(project.setup.perBarCycleSlots),
        perBarVolta: shift(project.setup.perBarVolta),
      },
    };
    saveProject(u); setProject(u); setNotes(nextNotes);
    setSelectedIds([]);
    setCursor(c => ({ voice: c.voice, measure: Math.min(c.measure, u.setup.barCount - 1), slot: 0 }));
  }, [project, notes]);
  // Trim trailing empty rows (below content and the cursor) — collapses the
  // phantom rows created by navigating down past the bottom without writing.
  const collapseTrailingEmptyRows = useCallback((cursorMeasure: number) => {
    if (!project) return;
    let bc = project.setup.barCount;
    const rowHasContent = (rowStart: number) =>
      Array.from({ length: MPR }, (_, i) => rowStart + i).some(m => notes.some(n => n.measure === m));
    while (bc > MPR) {
      const rowStart = bc - MPR;
      if (rowHasContent(rowStart) || cursorMeasure >= rowStart) break;
      bc -= MPR;
    }
    if (bc !== project.setup.barCount) updateSetup({ barCount: bc });
  }, [project, notes, updateSetup]);

  // Persist notes + the stored voice count (and optional hand split) for ONE
  // section + cursor voice.  Keyed by the section's start bar, so other sections
  // are untouched.  `handSplit` = upper-hand voice count (undefined → leave/auto).
  const commitVoices = useCallback((nextNotes: NoteData[], sectionStart: number, storedVoiceCount: number, cursorVoice: number, handSplit?: number) => {
    if (!project) return;
    const vc = Math.max(minVoices, Math.min(MAX_VOICES, storedVoiceCount));
    const sorted = [...nextNotes].sort((a, b) =>
      a.measure !== b.measure ? a.measure - b.measure
      : (a.voice ?? 0) !== (b.voice ?? 0) ? (a.voice ?? 0) - (b.voice ?? 0)
      : a.startSlot - b.startSlot);
    const perSectionVoiceCount = { ...(project.perSectionVoiceCount ?? {}), [sectionStart]: vc };
    const u: NoteEntryProject = { ...project, notes: sorted, perSectionVoiceCount };
    if (handSplit != null) u.perSectionHandSplit = { ...(project.perSectionHandSplit ?? {}), [sectionStart]: Math.max(1, Math.min(vc - 1, handSplit)) };
    saveProject(u); setProject(u); setNotes(sorted);
    setCursor(c => ({ ...c, voice: cursorVoice }));
  }, [project, minVoices]);

  // Insert an empty voice line at `insertIndex` within the cursor's section.
  // `growUpper` records whether it joined the upper hand (so the piano-brace split
  // moves with it instead of auto-rebalancing).
  const insertVoice = useCallback((insertIndex: number, growUpper: boolean) => {
    if (!project) return;
    const vc = voiceCountOf(cursor.measure);
    if (vc >= MAX_VOICES) return;
    const [start, end] = sectionRangeOf(cursor.measure);
    const shifted = notes.map(n =>
      (n.measure >= start && n.measure < end && (n.voice ?? 0) >= insertIndex)
        ? { ...n, voice: (n.voice ?? 0) + 1 } : n);
    const curSplit = hsOf(cursor.measure) ?? Math.ceil(vc / 2);
    const newSplit = growUpper ? curSplit + 1 : curSplit;
    const newCursorVoice = cursor.voice >= insertIndex ? cursor.voice + 1 : cursor.voice;
    commitVoices(shifted, start, vc + 1, newCursorVoice, hsOf(cursor.measure) != null ? newSplit : undefined);
  }, [project, notes, cursor.measure, cursor.voice, voiceCountOf, sectionRangeOf, commitVoices]);

  // Plain ↓ / ↑ — move through the voices; at the bottom voice, wrap to the top
  // voice of the measure right below (measure + MPR = the same column, next
  // row); at the top voice, wrap to the bottom voice of the measure above.
  const navVoice = useCallback((dir: -1 | 1) => {
    if (!project) return;
    const r = rowOf(cursor.measure), c = COL_OF[cursor.measure] ?? 0;
    const vc = voiceCountOf(cursor.measure);
    if (dir === 1) {
      if (cursor.voice < vc - 1) { setCursor(cc => ({ ...cc, voice: cc.voice + 1 })); return; }
      const nextRow = ROWS[r + 1];
      if (nextRow) setCursor({ ...cursor, voice: 0, measure: nextRow[Math.min(c, nextRow.length - 1)], slot: 0 });
    } else {
      if (cursor.voice > 0) { setCursor(cc => ({ ...cc, voice: cc.voice - 1 })); return; }
      const prevRow = ROWS[r - 1];
      if (prevRow) {
        const pm = prevRow[Math.min(c, prevRow.length - 1)];
        setCursor({ ...cursor, voice: voiceCountOf(pm) - 1, measure: pm, slot: 0 });
      }
    }
  }, [project, cursor, voiceCountOf]);

  // Shift+↑/↓ — add an empty voice at the TOP / BOTTOM of the hand the cursor is
  // in.  With a piano brace this keeps the OTHER hand untouched (top of upper,
  // bottom of upper, top of lower, bottom of lower); without a brace it's just the
  // top / bottom of the section.
  const addVoiceBelow = useCallback(() => {
    if (!project) return;
    const vc = voiceCountOf(cursor.measure);
    const hs = hsOf(cursor.measure);
    if (hs == null) { insertVoice(vc, false); return; }        // bottom of section
    const inUpper = cursor.voice < hs;
    insertVoice(inUpper ? hs : vc, inUpper);                    // bottom of this hand
  }, [project, cursor.measure, cursor.voice, voiceCountOf, insertVoice]);
  const addVoiceAbove = useCallback(() => {
    if (!project) return;
    const hs = hsOf(cursor.measure);
    if (hs == null) { insertVoice(0, false); return; }          // top of section
    const inUpper = cursor.voice < hs;
    insertVoice(inUpper ? 0 : hs, inUpper);                     // top of this hand
  }, [project, cursor.measure, cursor.voice, insertVoice]);

  // Delete voice line `v` within the cursor's section: drop its notes and pull
  // every lower voice up one.  Never drops the section below its minimum (1 for
  // sol-fa, 2 for jianpu).
  const removeVoiceAt = useCallback((v: number) => {
    if (!project) return;
    const vc = voiceCountOf(cursor.measure);
    if (vc <= minVoices || v < 0 || v >= vc) return;
    const [start, end] = sectionRangeOf(cursor.measure);
    const inSection = (n: NoteData) => n.measure >= start && n.measure < end;
    const nextNotes = notes
      .filter(n => !(inSection(n) && (n.voice ?? 0) === v))
      .map(n => (inSection(n) && (n.voice ?? 0) > v) ? { ...n, voice: (n.voice ?? 0) - 1 } : n);
    const newCursorVoice = cursor.voice > v ? cursor.voice - 1 : Math.min(cursor.voice, vc - 2);
    commitVoices(nextNotes, start, vc - 1, newCursorVoice);
  }, [project, notes, cursor.measure, cursor.voice, voiceCountOf, sectionRangeOf, commitVoices, minVoices]);

  // ── Move the selected note(s) ───────────────────────────────────────────────
  const moveSelected = useCallback((axis: "h" | "v", dir: -1 | 1) => {
    if (!project || !selectedIds.length) return;
    const sel = new Set(selectedIds);
    const next = notes.map(n => {
      if (!sel.has(n.id)) return n;
      if (axis === "v") return { ...n, voice: Math.max(0, Math.min(voiceCountOf(n.measure) - 1, (n.voice ?? 0) + dir)) };
      const total = totalSlotsOf(n.measure);
      const len = noteSlots(n);
      let m = n.measure, s = n.startSlot + dir * len;
      if (s < 0) {
        if (m > 0) { m -= 1; s = totalSlotsOf(m) - len; } else s = 0;
      } else if (s + len > total) {
        if (m < project.setup.barCount - 1) { m += 1; s = 0; } else s = total - len;
      }
      // If the destination slot is already taken by another note in this voice,
      // move to another voice instead of stacking in the same row (add a new
      // voice if every existing one is occupied there).
      const occupied = (vv: number) => notes.some(o =>
        !sel.has(o.id) && !o.isRest && (o.voice ?? 0) === vv && o.measure === m && o.startSlot === s);
      let v = n.voice ?? 0;
      if (occupied(v)) {
        let free = 0;
        while (free < MAX_VOICES && occupied(free)) free++;
        v = free;
      }
      return { ...n, measure: m, startSlot: s, voice: v };
    });
    commit(next);
    const first = next.find(n => sel.has(n.id));
    if (first) setCursor({ voice: first.voice ?? 0, measure: first.measure, slot: first.startSlot });
  }, [project, selectedIds, notes, totalSlotsOf, commit, voiceCountOf]);

  // ── Apply a tool to the selection (or set it as the entry default) ──────────
  const recompute = useCallback((n: NoteData): NoteData => {
    if (n.isRest) return n;
    const jp = jianpuToPitch(n.jianpuDegree ?? 1, n.jianpuOctave ?? 0, n.jianpuAccidental, fifths);
    return { ...n, pitch: jp.pitch };
  }, []);

  // The notes a modifier (duration / octave / dot / alter …) edits: the mouse
  // selection when there is one, otherwise the note under the cursor.
  //
  // With nothing selected the CURSOR is the target — no modifier key needs Shift.
  // You edit whatever you're parked on, and the same keypress also updates the
  // entry default, so the next note you write inherits it.  Park on empty space
  // and there's nothing to edit, so the keypress only sets that default.
  const cursorTargetIds = useCallback((): string[] => notes
    .filter(n => (n.voice ?? 0) === cursor.voice && n.measure === cursor.measure
      && cursor.slot >= n.startSlot && cursor.slot < n.startSlot + noteSlots(n))
    .map(n => n.id), [notes, cursor]);
  const targetIds = useCallback((): string[] =>
    selectedIds.length ? selectedIds : cursorTargetIds(),
    [selectedIds, cursorTargetIds]);

  const applyToSelection = useCallback((fn: (n: NoteData) => NoteData) => {
    const ids = targetIds();
    if (!ids.length) return false;
    commit(notes.map(n => ids.includes(n.id) ? recompute(fn(n)) : n));
    return true;
  }, [targetIds, notes, commit, recompute]);

  const pickDuration = useCallback((d: Duration) => {
    setDuration(d);
    applyToSelection(n => ({ ...n, duration: d }));
  }, [applyToSelection]);

  const stepDuration = useCallback((dir: 1 | -1) => {
    // dir +1 = longer (toward whole), −1 = shorter (toward 32nd)
    const i = DURATION_ORDER.indexOf(duration);
    const ni = Math.max(0, Math.min(DURATION_ORDER.length - 1, i - dir));
    pickDuration(DURATION_ORDER[ni]);
  }, [duration, pickDuration]);

  // Step the SNAP grid (the columns notes lock onto), independent of duration —
  // a half…32nd range.  `[` = coarser, `]` = finer.  dir +1 = finer.
  const stepGrid = useCallback((dir: 1 | -1) => {
    setGridDur(g => {
      const i = GRID_ORDER.indexOf(g);
      return GRID_ORDER[Math.max(0, Math.min(GRID_ORDER.length - 1, i + dir))];
    });
  }, []);

  // Toggle the eighth-note underline: make the target an eighth (one underline)
  // if it isn't already, else revert it to a quarter (no underline).
  const toggleUnderline = useCallback(() => {
    const ids = targetIds();
    const isEighth = ids.length ? ids.every(id => notes.find(n => n.id === id)?.duration === "8") : duration === "8";
    pickDuration(isEighth ? "q" : "8");
  }, [targetIds, notes, duration, pickDuration]);

  // Toggle staccato (a dot above the number) on the target note(s).
  const toggleStaccato = useCallback(() => {
    const ids = targetIds();
    if (!ids.length) return;
    const anyOff = notes.some(n => ids.includes(n.id) && !n.isRest && !n.staccato);
    commit(notes.map(n => ids.includes(n.id) && !n.isRest ? { ...n, staccato: anyOff || undefined } : n));
  }, [targetIds, notes, commit]);

  // Toggle accent (a ">" above the number) on the target note(s).  Mirrors
  // toggleStaccato — the two are independent, so a note can carry both.
  const toggleAccent = useCallback(() => {
    const ids = targetIds();
    if (!ids.length) return;
    const anyOff = notes.some(n => ids.includes(n.id) && !n.isRest && !n.accent);
    commit(notes.map(n => ids.includes(n.id) && !n.isRest ? { ...n, accent: anyOff || undefined } : n));
  }, [targetIds, notes, commit]);

  // Cycle mode: close the current cycle AT THE CURSOR and open the next one.
  // Length = everything before the cursor, so you type until the cycle sounds
  // finished and press Enter — no metre declared up front.  On the last cycle a
  // new one is appended so Enter always has somewhere to go.
  const endCycle = useCallback(() => {
    if (!project || !cycleMode) return;
    const { voice, measure, slot } = cursor;
    // Cursor on the downbeat means "close where the notes actually stop"; that's
    // what you get pressing Enter straight after entering the last note of a cycle.
    const len = Math.max(EIGHTH_SLOTS, slot > 0 ? slot : barFillOf(measure));
    // ONE write.  Setting the length and appending the next cycle separately meant
    // the append rebuilt the project from a stale closure and threw the length
    // away — ending the last cycle looked like it did nothing.  Appending at the
    // END needs no per-bar re-indexing (no existing bar's index moves), so a plain
    // barCount bump is enough.
    const needBar = measure + 1 >= project.setup.barCount;
    const u: NoteEntryProject = {
      ...project,
      notes,
      setup: {
        ...project.setup,
        perBarCycleSlots: { ...(project.setup.perBarCycleSlots ?? {}), [measure]: len },
        barCount: project.setup.barCount + (needBar ? 1 : 0),
      },
    };
    saveProject(u); setProject(u);
    setCursor({ voice, measure: measure + 1, slot: 0 });
  }, [project, cycleMode, cursor, barFillOf, notes]);

  // Shorten / lengthen the cursor's cycle by one eighth.  Reads the CURRENT length
  // (open cycles included) so the first nudge starts from what's on screen.
  const nudgeCycle = useCallback((dir: 1 | -1) => {
    if (!project || !cycleMode) return;
    // The selected note's cycle when there is a selection, else the cursor's —
    // "the cycle I'm in" is whichever one you're actually pointing at.  Only that
    // one key is written; every other cycle keeps its own length.
    const sel = selectedIds.length ? notes.find(n => selectedIds.includes(n.id)) : undefined;
    const m = sel ? sel.measure : cursor.measure;
    const next = Math.max(EIGHTH_SLOTS, totalSlotsOf(m) + dir * EIGHTH_SLOTS);
    updateSetup({ perBarCycleSlots: { ...(project.setup.perBarCycleSlots ?? {}), [m]: next } });
  }, [project, cycleMode, cursor.measure, selectedIds, notes, totalSlotsOf, updateSetup]);

  // Mark/unmark a grouping boundary.  On a note it rides the note (so the bracket
  // follows it through inserts/deletes); on an EMPTY slot it's stored per bar by
  // position, because laying out 5+5+3+2 before writing any notes is the normal
  // order of work and used to be impossible.
  const toggleGroupEnd = useCallback(() => {
    const ids = targetIds();
    if (ids.length) {
      const anyOff = notes.some(n => ids.includes(n.id) && !n.isRest && !n.groupEnd);
      commit(notes.map(n => ids.includes(n.id) && !n.isRest ? { ...n, groupEnd: anyOff || undefined } : n));
      return;
    }
    if (!project) return;
    const { measure, slot } = cursor;
    if (slot <= 0) return;                       // a boundary at 0 isn't a boundary
    const cur = project.setup.perBarGroupEnds?.[measure] ?? [];
    const next = cur.includes(slot) ? cur.filter(s => s !== slot) : [...cur, slot].sort((a, b) => a - b);
    const map = { ...(project.setup.perBarGroupEnds ?? {}) };
    if (next.length) map[measure] = next; else delete map[measure];
    updateSetup({ perBarGroupEnds: map });
  }, [targetIds, notes, commit, project, cursor, updateSetup]);

  const toggleDot = useCallback(() => {
    // Toggle relative to the TARGET's own state when there is one, not to the
    // entry default — otherwise pressing `t` on a note whose dot already matches
    // the default writes the same value back and looks like a dead key.
    const ids = targetIds();
    const next = ids.length ? notes.some(n => ids.includes(n.id) && !n.dotted) : !dotted;
    setDotted(next);
    applyToSelection(n => ({ ...n, dotted: next || undefined }));
  }, [dotted, notes, targetIds, applyToSelection]);

  const bumpOctave = useCallback((delta: number) => {
    setOctave(o => Math.max(-3, Math.min(3, o + delta)));
    applyToSelection(n => n.isRest ? n
      : ({ ...n, jianpuOctave: Math.max(-3, Math.min(3, (n.jianpuOctave ?? 0) + delta)) }));
  }, [applyToSelection]);

  // Raise/lower the alteration of the target (selection or cursor note) by one
  // EDO step — moves the syllable up/down the vowel ladder.
  const alter = useCallback((delta: number) => {
    applyToSelection(n => ({ ...n, alteration: altOf(n) + delta, jianpuAccidental: undefined }));
  }, [applyToSelection]);

  // ── Keyboard — global keybinds ──────────────────────────────────────────────
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (!project) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const k = e.key;
    const hasSel = selectedIds.length > 0;

    // Undo (Ctrl/⌘+Z) — handled before the modifier guard below.
    if ((e.ctrlKey || e.metaKey) && (k === "z" || k === "Z")) { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (k === "c" || k === "C")) { e.preventDefault(); copySelection(); return; }
    if ((e.ctrlKey || e.metaKey) && (k === "v" || k === "V")) { e.preventDefault(); pasteClipboard(); return; }

    // ── Arrows (handled before the modifier guard so Ctrl/Shift work) ──
    // ←→  Ctrl/⌘ + arrow MOVES the selected note; plain/Shift just move the
    //     cursor (fine / by-beat).  Space held grows the selection.
    // ↑↓  voice (Shift = add voice; Ctrl = move the selected note's voice).
    if (k === "ArrowRight" || k === "ArrowLeft") {
      e.preventDefault();
      const dir = k === "ArrowRight" ? 1 : -1;
      if ((e.ctrlKey || e.metaKey) && hasSel) moveSelected("h", dir);              // Ctrl → move the note(s)
      else moveCursorH(dir, e.shiftKey ? "beat" : "fine");                         // otherwise move the cursor
      return;
    }
    if (k === "ArrowUp" || k === "ArrowDown") {
      e.preventDefault();
      const dir = k === "ArrowDown" ? 1 : -1;
      // Ctrl+↑/↓ = move the selected note to another voice; Shift+↑/↓ = add an
      // empty voice above/below; plain ↑/↓ = move through voices.
      if ((e.ctrlKey || e.metaKey) && hasSel) moveSelected("v", dir);
      else if (e.shiftKey) (dir < 0 ? addVoiceAbove() : addVoiceBelow());
      else navVoice(dir);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (k === " ") { e.preventDefault(); return; }  // Space no longer selects — swallow it.

    // Action keys (q/w/e/r/t/u/o/,/.) need no modifier: they act on whatever the
    // cursor is parked on, via targetIds()'s cursor fallback.  Shift is no longer
    // special here — it's folded away below so Shift+q still reads as "q".

    // Shift turns the action letters into their uppercase form (Shift+q → "Q"),
    // so fold single letters to lowercase for the matches below — otherwise
    // Shift+q/w/e/r would fall through and do nothing.  "M" stays distinct from
    // "m" (delete- vs add-measure), so it's excluded from the fold.
    const key = k.length === 1 && k !== "M" ? k.toLowerCase() : k;

    if (key >= "1" && key <= "7") { e.preventDefault(); inputDigit(parseInt(key, 10), false); return; }
    if (key === "0")              { e.preventDefault(); inputDigit(0, true); return; }

    // Quick-access modifiers on the letter row directly below the numbers:
    //   q/w = octave −/+   e/r = duration shorter/longer   t = dot
    //   u = underline (eighth)   o = staccato   a = accent   . / , = alteration up / down
    //   [ / ] = snap grid coarser / finer   - = held "–" continuation
    // Each edits the note under the cursor (and sets the entry default) — no
    // modifier needed.  `,`/`.` accept their shifted forms `<`/`>` too, so the
    // key works whether or not Shift happens to be down.
    if (key === "-" || key === "_")                { e.preventDefault(); placeHeld(); return; }
    if (key === "q")                               { e.preventDefault(); bumpOctave(-1); return; }
    if (key === "w" || key === "+" || key === "=") { e.preventDefault(); bumpOctave(1); return; }
    if (key === "e")                               { e.preventDefault(); stepDuration(-1); return; } // shorter
    if (key === "r")                               { e.preventDefault(); stepDuration(1); return; }  // longer
    if (key === "[")                               { e.preventDefault(); stepGrid(-1); return; }   // grid coarser
    if (key === "]")                               { e.preventDefault(); stepGrid(1); return; }    // grid finer
    if (key === "t")                               { e.preventDefault(); toggleDot(); return; }
    if (key === "u")                               { e.preventDefault(); toggleUnderline(); return; }  // eighth-note underline
    if (key === "o")                               { e.preventDefault(); toggleStaccato(); return; }   // staccato dot
    if (key === "a")                               { e.preventDefault(); toggleAccent(); return; }     // accent ">" (marks odd-meter groupings)
    // Enter ends a cycle (cycle mode only — there's nothing to end otherwise).
    if (key === "Enter" && cycleMode)               { e.preventDefault(); endCycle(); return; }
    // ' marks a grouping bracket's last note.  NOT gated on cycle mode: showing
    // the grouping of an odd metre (15/8 as 4+4+4+3) is exactly as useful in a
    // time-signatured bar, which is where the need came up first.
    if (key === "'")                                { e.preventDefault(); toggleGroupEnd(); return; }
    // h / j shorten / lengthen THIS cycle by one eighth.  Deliberately nowhere near
    // [ ] — those change the snap grid, which is global, so a mis-hit silently
    // re-cells every bar in the score and reads as "it changed all the cycles".
    // Setting a length also closes an open cycle: you've now stated where it ends.
    if (key === "h" && cycleMode)                   { e.preventDefault(); nudgeCycle(-1); return; }
    if (key === "j" && cycleMode)                   { e.preventDefault(); nudgeCycle(1); return; }
    if (key === "." || key === ">")                { e.preventDefault(); alter(1); return; }   // alteration up
    if (key === "," || key === "<")                { e.preventDefault(); alter(-1); return; }  // alteration down
    if (key === "p")                               { e.preventDefault(); togglePianoBrace(); return; }
    if (key === "l")                               { e.preventDefault(); toggleUnderlines(); return; }
    // Jump into the current measure's title field (Enter/Esc jumps back out).
    // Annotate at the CURSOR: on the downbeat that's the bar's own note, and
    // anywhere else it's a mid-bar note at that slot — which is how a chord that
    // changes part-way through the bar gets written over the beat it lands on.
    if (key === "n") {
      e.preventDefault();
      const { measure, slot } = cursor;
      if (slot <= 0) { document.getElementById(`jp-title-${measure}`)?.focus(); return; }
      setOpenSlotNotes(prev => new Set(prev).add(`${measure}:${slot}`));
      // Focus after the editor has been rendered by the state change above.
      requestAnimationFrame(() => document.getElementById(`jp-slotnote-${measure}-${slot}`)?.focus());
      return;
    }
    // 'k' — add a CHORD at the cursor's beat (dedicated italic chord lane). Any
    // slot including the downbeat (slot 0), so chords sit on any eighth-note beat.
    if (key === "k") {
      e.preventDefault();
      const { measure, slot } = cursor;
      setOpenChordSlots(prev => new Set(prev).add(`${measure}:${slot}`));
      requestAnimationFrame(() => document.getElementById(`jp-chord-${measure}-${slot}`)?.focus());
      return;
    }
    // Jump into the current measure's section-label field (labels this bar as a
    // new exercise: big heading + line break).
    if (key === "s")                               { e.preventDefault(); document.getElementById(`jp-section-${cursor.measure}`)?.focus(); return; }
    // Cut the line after the current measure (press again to rejoin); the ✂
    // button at each bar's end does the same.
    if (key === "b")                               { e.preventDefault(); toggleBreakBefore(cursor.measure + 1); return; }
    // Append a measure (m) / delete the current measure (Shift+M).
    if (key === "m")                               { e.preventDefault(); addMeasure(); return; }
    if (key === "M")                               { e.preventDefault(); deleteMeasure(cursor.measure); return; }
    // Edit the current measure's time signature (type "n/d" under the bar).
    if (key === "g")                               { e.preventDefault(); document.getElementById(`jp-timesig-${cursor.measure}`)?.focus(); return; }
    // Toggle the C2–C6 treble/bass clef reference.
    if (key === "c")                               { e.preventDefault(); setShowClefRef(v => !v); return; }

    if (key === "Backspace" || key === "Delete") {
      e.preventDefault();
      if (e.shiftKey) removeVoiceAt(cursor.voice);   // Shift+⌫ → delete the current voice line
      else deleteSelectedOrCursor();
      return;
    }
    if (key === "Escape")        { e.preventDefault(); if (showClefRef) setShowClefRef(false); else setSelectedIds([]); return; }
  }, [project, selectedIds, cursor, notes, showClefRef, inputDigit, moveSelected, moveCursorH, extendSelect, navVoice, addVoiceAbove, addVoiceBelow,
      removeVoiceAt, toggleBreakBefore, addMeasure, deleteMeasure, undo, placeHeld,
      stepDuration, stepGrid, toggleDot, toggleUnderline, toggleStaccato, toggleAccent, alter, deleteSelectedOrCursor, bumpOctave, togglePianoBrace, toggleUnderlines,
      cycleMode, endCycle, toggleGroupEnd, nudgeCycle, copySelection, pasteClipboard]);

  const handleKeyRef = useRef(handleKey);
  handleKeyRef.current = handleKey;
  useEffect(() => {
    const fn = (e: KeyboardEvent) => handleKeyRef.current(e);
    const up = (e: KeyboardEvent) => { if (e.key === " ") spaceHeldRef.current = false; };
    window.addEventListener("keydown", fn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", fn); window.removeEventListener("keyup", up); };
  }, []);


  // ── Render model (positions + decorations) ──────────────────────────────────
  const rendered = useMemo(() => {
    if (!project) return { items: [] as RenderItem[], positions: [] as NotePos[], beams: [] as Beam[] };
    interface RI extends RenderItem {}
    const items: RI[] = [];
    const positions: NotePos[] = [];
    // Sol-fa syllable: when the "n" system is Movable Do, degrees read as do-re-mi
    // (the syllable follows the note's alteration — sharp "i" / flat forms);
    // otherwise the universal Spectrum-ege syllable.
    const labelOf = (degree: number, alt: number): { text: string; prefix?: string } =>
      (system === "solfa" && movableDo)
        ? { text: regularSolfaSyllable(degree, alt) }
        : edoNoteLabel(system, degree, alt, edo);
    // Per voice+measure list used to build continuous underline beams.
    const byVM = new Map<string, { startSlot: number; slots: number; x: number; y: number; underlines: number; isRest: boolean; separate: boolean; label: string }[]>();

    const groups = new Map<string, NoteData[]>();
    for (const n of notes) {
      const key = `${n.voice ?? 0}:${n.measure}:${n.startSlot}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(n);
    }
    for (const [, g] of groups) {
      const first = g[0];
      const voice = first.voice ?? 0;
      const total = totalSlotsOf(first.measure);
      const glyph = jianpuGlyphFor(first.duration, first.dotted);
      // This bar's grid cell; head centres in the first cell of its onset (so it
      // sits between grid lines, never on one).  EVERY note fills the cells its
      // duration spans with dashes (proper numbered notation: a quarter on an 8th
      // grid is "1 –"), so bars of quarters read as dense as bars of held wholes
      // — the grid stays symmetric no matter the note values.
      const cellS = cellSlotsOf(first.measure);
      // Length never spills into neighbouring cells as horizontal dashes — every
      // note occupies exactly its own 8th column.  Instead the length rides ON the
      // glyph, in units of a HALF note: one full vertical stroke per half, plus a
      // short tick for a leftover single beat.  So half = one dash, dotted half =
      // a dash and a tick, whole = two dashes.  Notes under a half carry nothing
      // (a plain quarter is bare), and their dot — when they have one — is the
      // augmentation dot; the tick takes that job once strokes are in play.
      const lenSlots = first.isRest ? 0 : noteSlots(first);
      const sideDashes = lenSlots < DURATION_SLOTS["h"] ? 0 : Math.floor(lenSlots / DURATION_SLOTS["h"]);
      const sideTick = sideDashes > 0 && lenSlots - sideDashes * DURATION_SLOTS["h"] === BEAT_SLOTS;
      // Shrink the syllable so it fits its cell with margin — lets a 16th grid
      // (small cells) sit comfortably; roomy cells (beat / 8th) keep full size.
      const font = Math.min(NUM_FONT, Math.round(cellS * pxPerSlot * 0.58));
      const x = slotToX(first.measure, first.startSlot + cellS / 2, total);
      const base = baselineY(voice, first.measure);
      const sorted = [...g].sort((a, b) => pitchRank(a) - pitchRank(b));
      const firstLabel = first.isRest ? "0" : first.held ? "–" : labelOf(first.jianpuDegree ?? 1, altOf(first)).text;
      const vmKey = `${voice}:${first.measure}`;
      (byVM.get(vmKey) ?? byVM.set(vmKey, []).get(vmKey)!).push(
        { startSlot: first.startSlot, slots: noteSlots(first), x, y: base, underlines: glyph.underlines, isRest: first.isRest, separate: !!first.separateUnderline, label: firstLabel });
      sorted.forEach((n, i) => {
        const y = base - i * CHORD_DY;
        positions.push({ id: n.id, x, y });
        const lbl = n.isRest || n.held ? null : labelOf(n.jianpuDegree ?? 1, altOf(n));
        items.push({
          id: n.id, x, y,
          label: n.isRest ? "0" : n.held ? "–" : (lbl ? lbl.text : "0"),
          isRest: n.isRest,
          octave: n.isRest || n.held ? 0 : (n.jianpuOctave ?? 0),
          accidental: lbl?.prefix,   // alteration mark drawn before a jianpu number
          underlines: glyph.underlines, sideDashes, sideTick, dot: glyph.dot, duration: n.duration,
          measure: first.measure, startSlot: first.startSlot, total, cellSlots: cellS, font,
          decorate: i === 0, separate: !!first.separateUnderline, staccato: !!n.staccato,
          accent: !!n.accent,
        });
      });
    }
    notePosRef.current = positions;

    // Continuous underline beams: within each voice+measure, connect consecutive
    // underlined notes into one line (numbered notation draws the time-reduction
    // line under the whole run, not per note).  The run breaks only when notes
    // aren't contiguous — a rest, a gap, or a longer note between them — or when
    // a note is flagged `separate` (which draws its own underline in svgNotes).
    const beams: Beam[] = [];
    for (const list of byVM.values()) {
      const arr = list.filter(e => !e.isRest && e.underlines > 0).sort((a, b) => a.startSlot - b.startSlot);
      let run: typeof arr = [];
      const flush = () => {
        if (!run.length) return;
        const maxU = Math.max(...run.map(e => e.underlines));
        for (let L = 0; L < maxU; L++) {
          let i = 0;
          while (i < run.length) {
            if (run[i].underlines > L) {
              let j = i;
              while (j + 1 < run.length && run[j + 1].underlines > L) j++;
              beams.push({ x1: run[i].x - labelHalfW(run[i].label), x2: run[j].x + labelHalfW(run[j].label), y: run[i].y + 5 + L * 4 });
              i = j + 1;
            } else i++;
          }
        }
        run = [];
      };
      for (const e of arr) {
        if (e.separate) { flush(); continue; }   // separate note: own underline, breaks the run
        // Break the line when this note doesn't start exactly where the previous
        // underlined note ended (a rest, gap, or longer note sits between them).
        const prev = run[run.length - 1];
        if (prev && prev.startSlot + prev.slots !== e.startSlot) flush();
        run.push(e);
      }
      flush();
    }

    return { items, positions, beams };
  }, [project, notes, totalSlotsOf, system, layout, edo, movableDo]);

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExportPdf = useCallback(async () => {
    if (!project || !scoreRef.current) return;
    // Safe page-break rows (between systems), scaled into the exported SVG's
    // coordinate space so a piano brace / group is never split across a page.
    const cutYs = layout.rowCut.slice(1).map(yy => yy * (scaleRef.current || 1));
    await exportToPdf([{ title: project.title, element: scoreRef.current }],
      project.title.replace(/\s+/g, "_"), { showTitles: true, splitSections: false, orientation: "portrait", cutYs });
  }, [project, layout]);

  // MusicXML export.  Sol-fa had only a PDF button, so the numbered/sol-fa data
  // could never leave the app in a form another notation program could open.
  // Cycle-mode scores carry their derived (and, when grouped, additive Balkan)
  // time signatures through `generateJianpuMusicXML`.
  const handleExportXml = useCallback(() => {
    if (!project) return;
    const name = (project.title || "score").replace(/\s+/g, "_");
    downloadMusicXml(generateJianpuMusicXML({ ...project, notes }), name);
  }, [project, notes]);

  // ── Pointer interaction (click / drag-select) ───────────────────────────────
  const localXY = (e: { clientX: number; clientY: number }) => {
    const rect = scoreRef.current!.getBoundingClientRect();
    const s = scaleRef.current || 1;
    return { x: (e.clientX - rect.left) / s, y: (e.clientY - rect.top) / s };
  };
  const noteAt = (x: number, y: number): string | null => {
    let best: string | null = null, bestD = Infinity;
    for (const p of notePosRef.current) {
      const dx = Math.abs(x - p.x);
      const dyc = Math.abs(y - (p.y - NUM_FONT / 2));
      if (dx <= 14 && dyc <= 15) { const d = dx + dyc; if (d < bestD) { bestD = d; best = p.id; } }
    }
    return best;
  };
  const positionCursorAt = (x: number, y: number) => {
    if (!project) return;
    // Row = the last one whose top is at/above the click (honours variable row
    // heights from section padding); column clamps to that row's bar count.
    let row = 0;
    for (let r = 0; r < ROW_COUNT; r++) { if (y >= ROW_TOP[r]) row = r; else break; }
    const rowMeasures = ROWS[row] ?? [0];
    // Column = the bar whose [x, x+width) span contains the click (bar widths vary).
    let measure = rowMeasures[0];
    for (const mm of rowMeasures) { if (x >= measureLeftX(mm)) measure = mm; else break; }
    // Nearest voice baseline to the click.
    let voice = 0, bestD = Infinity;
    for (let v = 0; v < vcOf(measure); v++) {
      const d = Math.abs(y - baselineY(v, measure));
      if (d < bestD) { bestD = d; voice = v; }
    }
    const total = totalSlotsOf(measure);
    const innerLeft = measureLeftX(measure) + INNER_PAD;
    const frac = Math.min(0.999, Math.max(0, (x - innerLeft) / (measureWidth(measure) - 2 * INNER_PAD)));
    // Notes render centred in their cell, so subtract half a cell before snapping
    // (a click on a note's centre maps back to its start slot).
    const centeredSlot = frac * total - gridSnap / 2;
    const snapped = Math.max(0, Math.min(total - gridSnap, Math.round(centeredSlot / gridSnap) * gridSnap));
    setCursor({ voice, measure, slot: snapped });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!project || !scoreRef.current) return;
    e.preventDefault();
    const { x, y } = localXY(e);
    dragStartRef.current = { x, y };
    isDownRef.current = true;
    try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (noSelect || !isDownRef.current || !dragStartRef.current) return;   // no rubber-band in sol-fa
    const { x, y } = localXY(e);
    const s = dragStartRef.current;
    if (Math.abs(x - s.x) > 4 || Math.abs(y - s.y) > 4) setDragRect({ x1: s.x, y1: s.y, x2: x, y2: y });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!isDownRef.current) return;
    isDownRef.current = false;
    const s = dragStartRef.current;
    dragStartRef.current = null;
    setDragRect(null);
    if (!s) return;
    const { x, y } = localXY(e);
    const moved = Math.abs(x - s.x) + Math.abs(y - s.y);
    if (noSelect) {
      // Sol-fa: a plain click only ever parks the cursor — on the note's head if
      // you hit one, otherwise on the cell you clicked.  SHIFT+click is the one
      // exception: it selects from the cursor to the note you hit, which is what
      // makes copy/paste reachable without giving up the cursor-driven model.
      const hit = noteAt(x, y);
      const n = hit ? notes.find(nn => nn.id === hit) : undefined;
      if (n && e.shiftKey) { selectRangeTo(n); return; }
      setSelectedIds([]);
      if (n) setCursor({ voice: n.voice ?? 0, measure: n.measure, slot: n.startSlot });
      else positionCursorAt(x, y);
      return;
    }
    if (moved <= 5 && e.shiftKey) {
      const hit = noteAt(x, y);
      const n = hit ? notes.find(nn => nn.id === hit) : undefined;
      if (n) { selectRangeTo(n); return; }
    }
    if (moved > 5) {
      const x1 = Math.min(s.x, x), x2 = Math.max(s.x, x);
      const y1 = Math.min(s.y, y), y2 = Math.max(s.y, y);
      const ids = notePosRef.current
        .filter(p => p.x >= x1 && p.x <= x2 && (p.y - NUM_FONT / 2) >= y1 && (p.y - NUM_FONT / 2) <= y2)
        .map(p => p.id);
      setSelectedIds(ids);
    } else {
      const hit = noteAt(x, y);
      if (hit) {
        setSelectedIds([hit]);
        const n = notes.find(nn => nn.id === hit);
        if (n) setCursor({ voice: n.voice ?? 0, measure: n.measure, slot: n.startSlot });
      } else {
        positionCursorAt(x, y);
        setSelectedIds([]);
      }
    }
  };

  if (!project || !setup) return <div className="p-6 text-sm text-[#666]">Loading…</div>;

  // ── SVG element construction ────────────────────────────────────────────────
  const width = CANVAS_W;   // widest row + side margins (bars vary in width)
  const height = layout.totalHeight + 12;   // variable rows (section padding baked in)
  // Scale the whole score down to fit the available width (never up) so all
  // measures are visible without a horizontal scrollbar.
  const scale = containerW > 0 ? Math.min(1, (containerW - 32) / width) : 1;
  scaleRef.current = scale;
  const dispW = width * scale;
  const dispH = height * scale;

  const underlinesAt = (x: number, y: number, count: number, key: string, hw = 9): React.ReactNode[] =>
    Array.from({ length: count }, (_, u) =>
      <line key={`${key}-u${u}`} x1={x - hw} x2={x + hw} y1={y + 5 + u * 4} y2={y + 5 + u * 4}
        stroke={WHITE} strokeWidth={RULE_W} />);

  // A run of consecutive 8ths/16ths shares one continuous underline; `separate`
  // notes (and rests) draw their own in svgNotes.
  const svgBeams = rendered.beams.map((b, i) =>
    <line key={`beam-${i}`} x1={b.x1} x2={b.x2} y1={b.y} y2={b.y} stroke={WHITE} strokeWidth={RULE_W} />);

  const svgNotes = rendered.items.flatMap(it => {
    const els: React.ReactNode[] = [];

    // ── Rests ──  standard music-notation rest drawn as SVG shapes (exports to
    // PDF cleanly, unlike a music-font glyph), centred where the note would sit.
    if (it.isRest) {
      els.push(...restShape(it.duration, it.x, it.y - 8, it.id));
      if (it.dot) els.push(<circle key={`${it.id}-dt`} cx={it.x + 11} cy={it.y - 10} r={2} fill={WHITE} />);
      return els;
    }

    // ── Pitched notes ──  (font scales with the bar's cell so 16th grids fit)
    els.push(<text key={`${it.id}-n`} x={it.x} y={it.y} fill={WHITE}
      fontSize={it.font} fontFamily={JIANPU_FONT} textAnchor="middle">{it.label}</text>);
    if (it.accidental) {
      els.push(<text key={`${it.id}-a`} x={it.x - 11} y={it.y - 7} fill={WHITE}
        fontSize={12} fontFamily={JIANPU_FONT} textAnchor="end">{it.accidental}</text>);
    }
    for (let d = 0; d < Math.abs(it.octave); d++) {
      const dy = it.octave > 0 ? it.y - it.font - 2 - d * 6 : it.y + 8 + it.underlines * 4 + d * 6;
      els.push(<circle key={`${it.id}-od${d}`} cx={it.x} cy={dy} r={2} fill={WHITE} />);
    }
    // Staccato — a dot above the number, clearing any octave-up dots.
    if (it.staccato) {
      const above = it.octave > 0 ? it.y - it.font - 2 - (Math.abs(it.octave) - 1) * 6 - 6 : it.y - it.font - 6;
      els.push(<circle key={`${it.id}-st`} cx={it.x} cy={above} r={1.8} fill={WHITE} />);
    }
    // Accent — a ">" above the number, stacked clear of the octave dots AND of a
    // staccato dot so a note can carry both.  Drawn as two strokes rather than a
    // glyph so it exports to PDF like the rest of the marks.
    if (it.accent) {
      const octTop = it.octave > 0 ? it.y - it.font - 2 - (Math.abs(it.octave) - 1) * 6 - 6 : it.y - it.font - 6;
      const cy = (it.staccato ? octTop - 6 : octTop) - 1;
      const hw = 3.4, vh = 2.6;
      els.push(<polyline key={`${it.id}-ac`} points={`${it.x - hw},${cy - vh} ${it.x + hw},${cy} ${it.x - hw},${cy + vh}`}
        fill="none" stroke={WHITE} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />);
    }
    if (it.decorate) {
      // Only `separate` notes draw their own underline; a contiguous run of 8ths
      // is joined into one continuous beam instead (see `beams` above).
      if (it.separate) els.push(...underlinesAt(it.x, it.y, it.underlines, it.id, labelHalfW(it.label)));
      // The tick already spells the dotted half's extra beat, so the augmentation
      // dot only prints on the short dotted notes that carry no strokes.
      if (it.dot && !it.sideTick) {
        // Dotted note: an augmentation dot sitting immediately right of the
        // syllable (like the rests do), NOT a stacked pair of dashes in the next
        // cell — the dot rides with the glyph so the grid columns stay clean.
        // Stood off the glyph by the same clearance the octave dots use above /
        // below it, so the three dot marks read as one family around the syllable.
        const halfW = labelHalfW(it.label) * (it.font / NUM_FONT);
        els.push(<circle key={`${it.id}-dt`} cx={it.x + halfW + it.font * 0.3 + 2} cy={it.y - it.font * 0.3}
          r={Math.max(1.6, it.font * 0.095)} fill={WHITE} />);
      }
      // Long-note length mark: VERTICAL strokes side by side to the right of the
      // syllable — tally marks rather than a horizontal dash train, so the note
      // stays inside its own 8th column.  One full stroke per half note, then a
      // half-height tick for a leftover beat (dotted half = stroke + tick).  Same
      // stand-off from the glyph as the augmentation dot.
      if (it.sideDashes) {
        const halfW = labelHalfW(it.label) * (it.font / NUM_FONT);
        const h = Math.max(4, it.font * 0.3);          // full stroke half-height
        const gap = Math.max(3.5, it.font * 0.2);      // horizontal spacing
        const midY = it.y - it.font * 0.3;
        const x0 = it.x + halfW + it.font * 0.3 + 2;
        const marks = it.sideDashes + (it.sideTick ? 1 : 0);
        for (let k = 0; k < marks; k++) {
          const xx = x0 + k * gap;
          const hh = k < it.sideDashes ? h : h * 0.5;   // the trailing tick is shorter
          els.push(<line key={`${it.id}-sd${k}`} x1={xx} x2={xx} y1={midY - hh} y2={midY + hh}
            stroke={WHITE} strokeWidth={RULE_W} strokeLinecap="round" />);
        }
      }
    }
    return els;
  });

  const svgSystems: React.ReactNode[] = [];
  const barTop = (m: number) => baselineY(0, m) - BAR_TOP_PAD;
  const barBot = (m: number) => baselineY(vcOf(m) - 1, m) + BAR_BOT_PAD;
  // Everything that prints ABOVE a bar (title, mid-bar notes, chord lane, section
  // heading) has to clear the grouping brackets when the bar has any, or they
  // land on top of each other.  One lift, applied to every lane.
  const groupLift = (m: number) =>
    (notes.some(n => n.measure === m && n.groupEnd) || (project.setup.perBarGroupEnds?.[m]?.length ?? 0) > 0) ? GROUP_PAD : 0;
  for (let m = 0; m < project.setup.barCount; m++) {
    const left = measureLeftX(m);
    const right = left + measureWidth(m);
    svgSystems.push(<line key={`bar-${m}`} x1={right} x2={right}
      y1={barTop(m)} y2={barBot(m)} stroke={WHITE} strokeWidth={1.2} />);
    // ── Cycle-mode grouping brackets ────────────────────────────────────────
    // Spans are DERIVED from the `groupEnd` marks rather than stored: walk the
    // bar's onsets in order and close a bracket on every marked note, so adding
    // or removing a note keeps each bracket around the notes it was drawn around.
    // A trailing run with no mark gets no bracket — an unfinished group is left
    // unbracketed rather than guessed at.
    {
      const totalB = totalSlotsOf(m);
      const cellB = cellSlotsOf(m);
      // Everything reduces to a set of BOUNDARY slots, so the same code draws a
      // grouping whether it hangs off notes or was laid out on an empty bar.
      // Notes across ALL voices — grouping is rhythmic and prints once above the
      // system, so restricting it to voice 0 would lose marks made elsewhere.
      const inBar = notes.filter(n => n.measure === m);
      // A flagged note ends its group where the note STOPS, not one cell past its
      // head: a quarter sits in one column but occupies two eighths.
      const spanAt = (s: number) => Math.max(cellB, ...inBar.filter(n => n.startSlot === s && !n.isRest).map(n => noteSlots(n)));
      const bounds = [...new Set([
        ...inBar.filter(n => n.groupEnd).map(n => n.startSlot + spanAt(n.startSlot)),
        ...(project.setup.perBarGroupEnds?.[m] ?? []),
      ])].filter(b => b > 0 && b <= totalB).sort((a, b) => a - b);
      if (bounds.length) {
        // Close the final group at the bar end so a fully-marked bar reads as a
        // complete additive metre (5+5+3+2) rather than losing its last group.
        if (bounds[bounds.length - 1] < totalB) bounds.push(totalB);
        const gy = barTop(m) - GROUP_LANE_DY;
        let from = 0;
        bounds.forEach((to, gi) => {
          const x1 = slotToX(m, from, totalB) + 2;
          const x2 = slotToX(m, to, totalB) - 2;
          // Tuplet-style bracket: a solid vertical tick at each end, a DOTTED run
          // along the top broken in the middle, and the count sitting inline in
          // that break rather than floating above the line.
          const label = String(Math.round((to - from) / EIGHTH_SLOTS));
          const cx = (x1 + x2) / 2;
          const gap = 3 + label.length * 3.2;   // half-width of the hole for the numeral
          // Mirrored about the dotted line — the stroke passes through it rather
          // than stopping dead where the two meet.
          const tick = (x: number, k: string) =>
            <line key={`grpt-${m}-${gi}-${k}`} x1={x} y1={gy - GROUP_TICK} x2={x} y2={gy + GROUP_TICK}
              stroke={WHITE} strokeWidth={1.1} strokeLinecap="round" />;
          const run = (a: number, b: number, k: string) => b - a > 1 ? (
            <line key={`grpr-${m}-${gi}-${k}`} x1={a} y1={gy} x2={b} y2={gy}
              stroke={WHITE} strokeWidth={1.1} strokeDasharray="2 3" strokeLinecap="butt" />
          ) : null;
          svgSystems.push(tick(x1, "l"), tick(x2, "r"));
          const left = run(x1, cx - gap, "a"), right = run(cx + gap, x2, "b");
          if (left) svgSystems.push(left);
          if (right) svgSystems.push(right);
          // The group's length in EIGHTHS — the "4" of a 4+4+4+3.  Beats, not
          // note-heads: a quarter plus two eighths is 4, not 3.
          svgSystems.push(<text key={`grpn-${m}-${gi}`} x={cx} y={gy} fill={WHITE}
            fontSize={10} fontFamily={JIANPU_FONT} textAnchor="middle" dominantBaseline="central">{label}</text>);
          from = to;
        });
      }
    }
    // Faint dotted grid (like the drum-notation X-ray): a vertical guide at
    // every cell boundary for THIS bar's resolution, so every note/dash reads as
    // sitting in its own symmetric column.  Not pure #ffffff, so PDF export
    // leaves it white (invisible on paper) — it's a screen-only aid.
    {
      const totalG = totalSlotsOf(m);
      const cellS = cellSlotsOf(m);
      for (let s = cellS; s < totalG; s += cellS) {
        const gx = slotToX(m, s, totalG);
        svgSystems.push(<line key={`grid-${m}-${s}`} x1={gx} x2={gx}
          y1={barTop(m)} y2={barBot(m)} stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeDasharray="2 4" />);
      }
    }
    // Piano-brace hand divider: a faint dotted line between the two hands.
    const hsm = hsOf(m);
    if (hsm != null) {
      const splitY = (baselineY(hsm - 1, m) + baselineY(hsm, m)) / 2;
      svgSystems.push(<line key={`split-${m}`} x1={left} x2={right} y1={splitY} y2={splitY}
        stroke={ACCENT} strokeWidth={1} opacity={0.55} strokeDasharray="2 3" />);
    }
    // measure number (top-left of each bar) — per-group "1a 2a … 1b 2b …"
    svgSystems.push(<text key={`mn-${m}`} x={left - 4} y={barTop(m) - 10} fill="#8a8a8a"
      fontSize={10} fontFamily="Helvetica, Arial, sans-serif">{layout.numLabel[m] ?? m + 1}</text>);
    // per-measure title / note, drawn above the bar (also captured on export)
    const barTitle = project.setup.perBarTitle?.[m];
    if (barTitle) svgSystems.push(<text key={`bt-${m}`} x={left} y={barTop(m) - 25 - groupLift(m)} fill={WHITE}
      fontSize={12} fontFamily="Helvetica, Arial, sans-serif">{barTitle}</text>);
    // Mid-bar notes share that line, each starting at ITS OWN slot — so a chord
    // change half-way through the bar sits over the beat it lands on.
    for (const [slotKey, text] of Object.entries(project.setup.perSlotNote?.[m] ?? {})) {
      const slot = +slotKey;
      svgSystems.push(<text key={`sn-${m}-${slot}`} x={slotToX(m, slot, totalSlotsOf(m))} y={barTop(m) - 25 - groupLift(m)}
        fill={WHITE} fontSize={12} fontFamily="Helvetica, Arial, sans-serif">{text}</text>);
    }
    // Dedicated CHORD LANE — italic, on its own line above the note-annotation line.
    for (const [slotKey, text] of Object.entries(project.setup.perChord?.[m] ?? {})) {
      const slot = +slotKey;
      svgSystems.push(<text key={`ch-${m}-${slot}`} x={slotToX(m, slot, totalSlotsOf(m))} y={barTop(m) - CHORD_LANE_DY - groupLift(m)}
        fill={WHITE} fontSize={12} fontStyle="italic" fontFamily="Helvetica, Arial, sans-serif">{text}</text>);
    }
    // Section heading — large, bold, lifted into the row's extra top padding so
    // the "+ note" line and the notes sit clearly below it (this bar always opens
    // a new row, so there's room above it).
    const section = project.setup.perBarSection?.[m];
    if (section?.trim()) {
      // Lift the heading above the chord lane and the grouping lane when this bar
      // carries them, so the three never stack on top of each other.
      const secDy = SECTION_LABEL_DY
        + (Object.keys(project.setup.perChord?.[m] ?? {}).length > 0 ? CHORD_PAD : 0)
        + groupLift(m);
      svgSystems.push(<text key={`sec-${m}`} x={left} y={barTop(m) - secDy} fill={WHITE}
        fontSize={18} fontWeight="bold" fontFamily="Helvetica, Arial, sans-serif">{section}</text>);
    }
    // Time signature — drawn under the bar, left-aligned to the measure start so
    // it lines up with the number / title.  Shown at each group start (its meter)
    // and wherever a meter is explicitly set.  Also captured on export.
    if (cycleMode) {
      // Cycle mode has no metre to print.  What's worth knowing instead is the
      // cycle's LENGTH in eighths, and whether it's still open (no end marked).
      const closed = project.setup.perBarCycleSlots?.[m] != null;
      const eighths = Math.round(totalSlotsOf(m) / EIGHTH_SLOTS);
      svgSystems.push(<text key={`cyc-${m}`} x={left} y={barBot(m) + 16} fill={WHITE}
        fontSize={13} fontWeight="bold" fontFamily="Helvetica, Arial, sans-serif"
        opacity={closed ? 1 : 0.45}>{closed ? `⟳${eighths}` : `⟳${eighths}…`}</text>);
    } else if (layout.startOf[m] === m || project.setup.perBarTimeSig?.[m]) {
      const eff = effectiveTs(m);
      svgSystems.push(<text key={`ts-${m}`} x={left} y={barBot(m) + 16} fill={WHITE}
        fontSize={13} fontWeight="bold" fontFamily="Helvetica, Arial, sans-serif">{eff.num}/{eff.den}</text>);
    }
    if ((COL_OF[m] ?? 0) === 0) {
      svgSystems.push(<line key={`barL-${m}`} x1={left} x2={left} y1={barTop(m)} y2={barBot(m)}
        stroke={WHITE} strokeWidth={1.2} />);
      // Piano grand-staff brace joining the voices — span it symmetrically
      // around the voice glyphs (equal margin above the top / below the bottom)
      // so its tip is always centred regardless of voice count.
      if (hsOf(m) != null) {
        const hs = hsOf(m);
        const bTop = baselineY(0, m) - 18;
        const bBot = baselineY(vcOf(m) - 1, m) + 4;
        // Point the brace at the gap between the two hands so it looks balanced
        // even with an uneven split (e.g. 3 upper / 2 lower).
        const tipY = hs != null
          ? (baselineY(hs - 1, m) + baselineY(hs, m)) / 2
          : undefined;
        svgSystems.push(<path key={`brace-${m}`} d={bracePath(left - 2, bTop, bBot, tipY)}
          fill="none" stroke={WHITE} strokeWidth={1.4} />);
      }
    }
  }

  // The box spans the note the cursor sits on, so its WIDTH reads the duration:
  // a dotted quarter covers three 8th cells and a half covers four, where a plain
  // quarter covers two.  A one-cell box would make every note look the same
  // length.  On an empty slot it's just the one cell you'd write into.
  const cursorCell = cellSlotsOf(cursor.measure);
  const cursorNote = notes.find(n => (n.voice ?? 0) === cursor.voice && n.measure === cursor.measure
    && cursor.slot >= n.startSlot && cursor.slot < n.startSlot + noteSlots(n));
  const cursorSpan = cursorNote ? Math.max(cursorCell, noteSlots(cursorNote)) : cursorCell;
  const cursorStart = cursorNote ? cursorNote.startSlot : cursor.slot;
  const cursorTotal = totalSlotsOf(cursor.measure);
  const cursorX = slotToX(cursor.measure, cursorStart + cursorSpan / 2, cursorTotal);
  const cursorY = baselineY(cursor.voice, cursor.measure);
  // Cursor box tracks the (possibly shrunk) syllable size at this cell.
  const cursorFont = Math.min(NUM_FONT, Math.round(cursorCell * layout.pxPerSlot * 0.58));
  // Half-width follows the span in pixels, with the single-cell box as the floor.
  const cursorBoxHW = Math.max(9, Math.round(cursorFont * 0.7),
    Math.round((slotToX(cursor.measure, cursorStart + cursorSpan, cursorTotal)
      - slotToX(cursor.measure, cursorStart, cursorTotal)) / 2) - 2);

  const btn = "px-2 py-1 rounded text-xs border transition-colors";
  const btnOn = "bg-[#7173e618] border-[#7173e6] text-[#9999ee]";
  const btnOff = "bg-[#1a1a1a] border-[#2a2a2a] text-[#888] hover:text-[#ccc] hover:border-[#3a3a3a]";

  // Key legend — ONE definition, rendered twice (the single-line bar and the panel
  // that opens upward), so the two can never drift apart.
  const keyHints = (
    <>
      {/* Current entry defaults (what the next note gets). */}
      <span className="flex items-center gap-2 text-[11px] shrink-0">
        <span className="px-1.5 py-0.5 rounded bg-[#16162a] border border-[#3a3a6a] text-[#9a9cf8]">
          oct {octave > 0 ? `+${octave}` : octave}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-[#16162a] border border-[#3a3a6a] text-[#9a9cf8]">
          {DURATION_NAMES[duration]}{dotted ? " ·" : ""}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-[#16221a] border border-[#356a3a] text-[#8ff0a0]" title="Snap grid — the columns notes lock onto ([ / ] to change)">
          grid {DURATION_NAMES[gridDur]}
        </span>
      </span>
      <Sep />
      <Hint keys={["1–7"]} label="pitch" />
      <Hint keys={["0"]} label="rest" />
      <Sep />
      <Hint keys={["q", "w"]} label="octave" />
      <Hint keys={["e", "r"]} label="duration" />
      <Hint keys={["[", "]"]} label="snap grid" />
      <Hint keys={["t"]} label="dot" />
      <Hint keys={["-"]} label="hold –" />
      <Hint keys={["u"]} label="underline" />
      <Hint keys={["o"]} label="staccato" />
      <Hint keys={["a"]} label="accent >" />
      <Hint keys={["'"]} label="group end" />
      <Hint keys={[",", "."]} label="alter" />
      {/* Cycle keys are listed even when the mode is off — otherwise the only way
          to learn they exist is to have already found the toggle. */}
      <Sep />
      <span className={`text-[10px] uppercase tracking-wider shrink-0 ${cycleMode ? "text-[#9a9cf8]" : "text-[#4a4a4a]"}`}>⟳ cycles</span>
      <Hint keys={["Enter"]} label="end cycle" />
      <Hint keys={["h", "j"]} label="beat −/+" />
      <Sep />
      <Hint keys={["←", "→"]} label="move" />
      <Hint keys={["↑", "↓"]} label="row" />
      <Hint keys={["Shift + ↑↓"]} label="add voice" />
      <Hint keys={["Shift + ⌫"]} label="del voice" />
      {!noSelect && <Hint keys={["Space"]} label="select" />}
      <Hint keys={["Shift + click"]} label="select range" />
      <Hint keys={["Ctrl + C", "Ctrl + V"]} label="copy / paste" />
      {!embedded && <>
        <Sep />
        <Hint keys={["p"]} label="piano brace" />
        <Hint keys={["n"]} label="note at cursor" />
        <Hint keys={["s"]} label="title / section" />
        <Hint keys={["b"]} label="cut line" />
        <Hint keys={["m"]} label="add bar" />
        <Hint keys={["Shift + M"]} label="del bar" />
        {!cycleMode && <Hint keys={["g"]} label="time sig" />}
        <Hint keys={["c"]} label="clef ref" />
        <Hint keys={["Ctrl + Z"]} label="undo" />
      </>}
    </>
  );

  return (
    <div className={`flex flex-col ${embedded ? "" : "h-full"}`}>
      {/* Header — action row (hidden when embedded) */}
      {!embedded && <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[#141414]">
        <button onClick={() => onBack?.()} className="text-xs text-[#888] hover:text-white">← Back</button>
        <div className="flex-1" />
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"
          className={`${btn} ${canUndo ? btnOff : "bg-[#141414] border-[#1e1e1e] text-[#444] cursor-not-allowed"}`}>↶ Undo</button>
        <button onClick={handleExportPdf} className={`${btn} ${btnOff}`}>Export PDF</button>
        <button onClick={handleExportXml} title="MusicXML — opens in MuseScore / Sibelius / Finale"
          className={`${btn} ${btnOff}`}>Export XML</button>
      </div>}

      {/* Header — editable title block (edit on the go; hidden when embedded) */}
      {!embedded && <div className="flex items-end justify-between gap-4 px-5 pt-3 pb-3 border-b border-[#1a1a1a]">
        <div className="min-w-0 flex-1">
          <input
            value={project.title}
            onChange={e => updateMeta({ title: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
            placeholder="Untitled score"
            className="w-full bg-transparent text-white text-xl font-bold tracking-tight outline-none placeholder-[#444]"
          />
          <input
            value={project.composer ?? ""}
            onChange={e => updateMeta({ composer: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
            placeholder="Composer"
            className="w-full bg-transparent text-[#888] text-sm outline-none placeholder-[#555] mt-0.5"
          />
          <div className="flex items-baseline gap-4 mt-1 text-sm">
            <label className="flex items-baseline gap-1.5">
              <span className="text-[10px] text-[#666] uppercase tracking-wider">EDO</span>
              <input type="text" inputMode="numeric" value={edoText}
                onChange={e => setEdoText(e.target.value.replace(/[^0-9]/g, ""))}
                onBlur={commitEdo}
                onKeyDown={e => { if (e.key === "Enter") { commitEdo(); (e.target as HTMLInputElement).blur(); } }}
                title="Equal divisions of the octave (degrees 1–7 = diatonic MOS from the best fifth)"
                className="bg-transparent text-[#aaa] outline-none w-8 placeholder-[#555]" />
            </label>
            {/* Time signature is now set per measure (press g under a bar and
                type n/d); it applies forward until the next change. */}
            <label className="flex items-baseline gap-1.5">
              <span className="text-[10px] text-[#666] uppercase tracking-wider">Bars</span>
              <input type="text" inputMode="numeric" value={barsText}
                onChange={e => setBarsText(e.target.value.replace(/[^0-9]/g, ""))}
                onBlur={commitBars}
                onKeyDown={e => { if (e.key === "Enter") { commitBars(); (e.target as HTMLInputElement).blur(); } }}
                className="bg-transparent text-[#aaa] outline-none w-8 placeholder-[#555]" />
            </label>
            {/* Cycle mode — drops time signatures entirely; bars become cycles you
                close with Enter.  For music that changes metre often enough that a
                signature per bar is noise. */}
            <button onClick={toggleCycleMode}
              title="Cycle mode: no time signatures — a constant eighth-note grid, Enter ends a cycle, ' marks a grouping bracket"
              className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border transition-colors ${
                cycleMode ? "bg-[#20204a] border-[#5a5cc8] text-[#b9baf5]" : "bg-transparent border-[#2a2a2a] text-[#666] hover:text-[#aaa]"
              }`}>⟳ Cycles</button>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {!solfaOnly && (
            <button
              onClick={() => changeSystem(system === "jianpu" ? "solfa" : "jianpu")}
              title="Switch notation system"
              className="text-[11px] px-2 py-0.5 rounded border border-[#3a3a6a] bg-[#16162a] text-[#9a9cf8] hover:border-[#5a5cc7] font-semibold uppercase tracking-wide"
            >
              {NOTATION_SYSTEM_LABELS[system]} ⇄
            </button>
          )}
          {/* Scale mode (independent of the display system): Diatonic Minor lowers
              the 3rd/6th/7th, so degree 3 is a real minor third — shown as "Na" in
              Spectrum-ege or "Me" in Movable Do. */}
          {system === "solfa" && edo === 12 && (
            <div className="flex gap-0.5" title="Scale for the next notes">
              {(["major", "minor"] as const).map(s => {
                const on = (project.solfaStyle === "minor" ? "minor" : "major") === s;
                return (
                  <button key={s} onClick={() => setSolfaStyle(s)}
                    className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${on
                      ? "bg-[#252550] border-[#7173e6] text-[#cfe6ff]"
                      : "bg-[#111] border-[#2a2a2a] text-[#888] hover:text-[#ccc] hover:border-[#3a3a5a]"}`}>
                    {s === "major" ? "Diatonic Major" : "Diatonic Minor"}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>}

      {/* Duration / octave / alteration are driven by the keybinds shown in the
          footer (e/r duration, t dot, q/w octave, ,/. alter) — no toolbar. */}

      {/* Key legend, pinned at the TOP.  It lived at the bottom and kept getting
          cut off: the window's client area runs under the Windows task bar, so the
          last row was physically off-screen however it was positioned.  Up here
          there is nothing below it to lose. */}
      <div className="shrink-0 border-b border-[#1a1a1a] bg-[#0d0d0d] px-4 py-1.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">{keyHints}</div>
      </div>

      {/* Score area (grows with content when embedded; scrolls when full-page) */}
      <div ref={scoreAreaRef}
        onScroll={() => { const a = document.activeElement as HTMLElement | null; if (a && a.tagName === "INPUT" && a.id?.startsWith("jp-")) a.blur(); }}
        className={`${embedded ? "overflow-x-auto" : "flex-1 min-h-0 overflow-x-hidden overflow-y-auto"} p-4 outline-none select-none`}
        style={{ background: "#0b0b0b" }}>
        <div
          ref={scoreRef}
          style={{ position: "relative", width: dispW, height: dispH, userSelect: "none", touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <svg width={dispW} height={dispH} viewBox={`0 0 ${width} ${height}`}
            style={{ display: "block", background: "#0b0b0b" }} xmlns="http://www.w3.org/2000/svg">
            {svgSystems}
            {svgNotes}
            {svgBeams}
          </svg>

          {/* Transient overlay — never captured by PDF export */}
          <svg width={dispW} height={dispH} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
            {selectedIds.map(id => {
              const p = rendered.positions.find(pp => pp.id === id);
              if (!p) return null;
              return <rect key={id} x={p.x - 13} y={p.y - NUM_FONT - 2} width={26} height={NUM_FONT + 10}
                fill={`${ACCENT}22`} stroke={ACCENT} strokeWidth={1} rx={3} />;
            })}
            <rect x={cursorX - cursorBoxHW} y={cursorY - cursorFont - 2} width={cursorBoxHW * 2} height={cursorFont + 10}
              fill="none" stroke={ACCENT} strokeWidth={1.4} rx={3} strokeDasharray="3 2" />
            {!noSelect && dragRect && (
              <rect x={Math.min(dragRect.x1, dragRect.x2)} y={Math.min(dragRect.y1, dragRect.y2)}
                width={Math.abs(dragRect.x2 - dragRect.x1)} height={Math.abs(dragRect.y2 - dragRect.y1)}
                fill={`${ACCENT}18`} stroke={ACCENT} strokeWidth={1} />
            )}
          </svg>

          {/* Per-measure title editors — transparent text over the SVG titles;
              the "+ note" placeholder invites annotations.  Hidden when embedded
              (the write-in answer sheet takes no note annotations). */}
          {!embedded && (<>
          <style>{`.jp-mtitle::placeholder{color:#3a3a3a}`}</style>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {Array.from({ length: project.setup.barCount }, (_, m) => {
              const left = measureLeftX(m);
              const right = left + measureWidth(m);
              const total = totalSlotsOf(m);
              // Slots in this bar carrying a mid-bar note, plus any the cursor has
              // opened for typing but that are still empty.  Slot 0 is the bar
              // title, never a mid-bar note.
              const slots = [...new Set([
                ...Object.keys(project.setup.perSlotNote?.[m] ?? {}).map(Number),
                ...[...openSlotNotes].map(k => k.split(":").map(Number)).filter(([mm]) => mm === m).map(([, s]) => s),
              ])].filter(s => s > 0 && s < total).sort((a, b) => a - b);
              // Each editor runs from its own slot to wherever the next one
              // begins, so their click targets never overlap.
              const edgeX = (i: number) => i < slots.length ? slotToX(m, slots[i], total) : right;
              const box = (x: number, w: number) => ({
                position: "absolute" as const,
                left: x * scale,
                top: (barTop(m) - 25 - groupLift(m) - 11) * scale,
                width: Math.max(12, w - 6) * scale,
                height: 16 * scale,
                fontSize: 12 * scale,
                fontFamily: "Helvetica, Arial, sans-serif",
                color: "transparent",
                caretColor: "#fff",
                background: "transparent",
                border: "none",
                outline: "none",
                padding: 0,
                pointerEvents: "auto" as const,
              });
              return (
                <div key={`mt-${m}`}>
                  <input
                    id={`jp-title-${m}`}
                    className="jp-mtitle"
                    value={project.setup.perBarTitle?.[m] ?? ""}
                    placeholder="+ note"
                    onChange={e => updateBarTitle(m, e.target.value)}
                    onPointerDown={e => e.stopPropagation()}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                    style={box(left, edgeX(0) - left)}
                  />
                  {slots.map((slot, i) => (
                    <input
                      key={`sn-${slot}`}
                      id={`jp-slotnote-${m}-${slot}`}
                      className="jp-mtitle"
                      value={project.setup.perSlotNote?.[m]?.[slot] ?? ""}
                      placeholder="+"
                      onChange={e => updateSlotNote(m, slot, e.target.value)}
                      onBlur={() => setOpenSlotNotes(prev => {
                        // Drop an editor that was opened but left empty, so a
                        // stray keypress doesn't leave a permanent "+" behind.
                        if (project.setup.perSlotNote?.[m]?.[slot]) return prev;
                        const next = new Set(prev); next.delete(`${m}:${slot}`); return next;
                      })}
                      onPointerDown={e => e.stopPropagation()}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                      style={box(slotToX(m, slot, total), edgeX(i + 1) - slotToX(m, slot, total))}
                    />
                  ))}
                  {/* Chord-lane inputs — any slot incl. the downbeat (slot 0). Sit on
                      their own italic line above the note-annotation line. */}
                  {[...new Set([
                    ...Object.keys(project.setup.perChord?.[m] ?? {}).map(Number),
                    ...[...openChordSlots].map(k => k.split(":").map(Number)).filter(([mm]) => mm === m).map(([, s]) => s),
                  ])].filter(s => s >= 0 && s < total).sort((a, b) => a - b).map(slot => (
                    <input
                      key={`ch-${slot}`}
                      id={`jp-chord-${m}-${slot}`}
                      className="jp-mtitle"
                      value={project.setup.perChord?.[m]?.[slot] ?? ""}
                      placeholder="+ chord"
                      onChange={e => updateChord(m, slot, e.target.value)}
                      onBlur={() => setOpenChordSlots(prev => {
                        if (project.setup.perChord?.[m]?.[slot]) return prev;
                        const next = new Set(prev); next.delete(`${m}:${slot}`); return next;
                      })}
                      onPointerDown={e => e.stopPropagation()}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                      style={{ ...box(slotToX(m, slot, total), 90), top: (barTop(m) - CHORD_LANE_DY - groupLift(m) - 11) * scale, fontStyle: "italic" as const }}
                    />
                  ))}
                </div>
              );
            })}
          </div>

          {/* Per-measure title / section editors — transparent text over the SVG
              headings.  Reach one with the `s` keybind, or click the faint
              "+ title" that appears at the start of every line (the first bar, a
              section, or a cut line) — type a label to give that line a heading. */}
          <style>{`.jp-section::placeholder{color:#3a3a3a;font-weight:400}
            .jp-section,.jp-mtitle{user-select:none;-webkit-user-select:none}`}</style>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {Array.from({ length: project.setup.barCount }, (_, m) => {
              const left = measureLeftX(m);
              const hasSection = !!project.setup.perBarSection?.[m]?.trim();
              // A line the user can title: the first bar, a section start, or a
              // manually cut line — these carry headroom for a heading.
              const isTitleLine = (COL_OF[m] ?? 0) === 0 &&
                (m === 0 || !!project.setup.perBarBreakBefore?.[m] || hasSection);
              return (
                <input
                  key={`ms-${m}`}
                  id={`jp-section-${m}`}
                  className="jp-section"
                  value={project.setup.perBarSection?.[m] ?? ""}
                  placeholder={isTitleLine && !hasSection ? "+ title" : ""}
                  onChange={e => updateBarSection(m, e.target.value)}
                  onPointerDown={e => e.stopPropagation()}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                  style={{
                    position: "absolute",
                    left: left * scale,
                    top: (barTop(m) - SECTION_LABEL_DY - groupLift(m) - 14) * scale,
                    width: (measureWidth(m) - 6) * scale,
                    height: 20 * scale,
                    fontSize: 18 * scale,
                    fontWeight: "bold",
                    fontFamily: "Helvetica, Arial, sans-serif",
                    color: "transparent",
                    caretColor: "#fff",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    padding: 0,
                    // A titled line (or one that can be titled) captures clicks; an
                    // empty non-title bar lets clicks fall to the note field.  `s`
                    // still focuses it programmatically regardless.
                    pointerEvents: hasSection || isTitleLine ? "auto" : "none",
                  }}
                />
              );
            })}
          </div>

          {/* Per-measure "cut line" buttons at each bar's end — click to drop the
              next bar onto a new line (toggles the manual break).  Hidden on the
              last bar (nothing follows it). */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {Array.from({ length: project.setup.barCount }, (_, m) => {
              if (m >= project.setup.barCount - 1) return null;
              // Once the next line has a written title, its cut-scissors would sit
              // right on top of the heading — hide it to keep the title clean.
              if (project.setup.perBarSection?.[m + 1]?.trim()) return null;
              const active = !!project.setup.perBarBreakBefore?.[m + 1];
              // Once a bar has notes, hide its scissors so it doesn't clutter the
              // written music — keep it only where a break is already set (so it
              // stays removable). Cut anywhere with the `b` keybind.
              if (!active && notes.some(n => n.measure === m)) return null;
              const bx = measureLeftX(m) + measureWidth(m);
              return (
                <button
                  key={`cut-${m}`}
                  title={active ? "Line break (click to remove)" : "Cut line here — next bar to a new line"}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={() => toggleBreakBefore(m + 1)}
                  style={{
                    position: "absolute",
                    left: (bx - 9) * scale,
                    top: (barTop(m) - 34) * scale,   // lifted clear of the measure-number line
                    width: 18 * scale,
                    height: 15 * scale,
                    lineHeight: `${15 * scale}px`,
                    fontSize: 11 * scale,
                    textAlign: "center",
                    color: active ? ACCENT : "#4a4a4a",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    pointerEvents: "auto",
                  }}
                >✂</button>
              );
            })}
          </div>

          {/* Per-measure "rejoin line" buttons at the START of every bar that a
              manual cut pushed onto a new line.  The ✂ that made the cut lives at
              the END of the PREVIOUS bar — which after the cut sits on the row
              above, and is hidden outright when the new line carries a title — so
              without this there was no obvious way back.  Click to undo the cut
              and pull the bar up to the previous line. */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {Array.from({ length: project.setup.barCount }, (_, m) => {
              if (!project.setup.perBarBreakBefore?.[m]) return null;
              return (
                <button
                  key={`join-${m}`}
                  title="Rejoin with the previous line (undo the cut)"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={() => toggleBreakBefore(m)}
                  style={{
                    position: "absolute",
                    left: (measureLeftX(m) - 20) * scale,
                    top: (barTop(m) - 34) * scale,   // same band as the ✂ above the bar
                    width: 18 * scale,
                    height: 15 * scale,
                    lineHeight: `${15 * scale}px`,
                    fontSize: 12 * scale,
                    textAlign: "center",
                    color: ACCENT,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    pointerEvents: "auto",
                  }}
                >⇤</button>
              );
            })}
          </div>

          {/* Per-measure time-signature editors — under each bar.  Reach one with
              the `g` keybind (or click an existing change) and type "n/d".  Empty
              inputs are click-through; the SVG draws the visible label. */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {(cycleMode ? [] : Array.from({ length: project.setup.barCount }, (_, i) => i)).map(m => {
              const left = measureLeftX(m);
              const editing = tsEdit?.m === m;
              const eff = effectiveTs(m);
              const hasOverride = !!project.setup.perBarTimeSig?.[m];
              const shown = hasOverride || layout.startOf[m] === m;   // a visible label sits here (group start)
              return (
                <input
                  key={`ts-${m}`}
                  id={`jp-timesig-${m}`}
                  value={editing ? tsEdit!.text : (shown ? `${eff.num}/${eff.den}` : "")}
                  // Focus clears the box so you type the new meter straight in
                  // rather than editing around the old one.
                  onFocus={() => setTsEdit({ m, text: "", dirty: false })}
                  onChange={e => setTsEdit({ m, text: e.target.value.replace(/[^0-9/]/g, ""), dirty: true })}
                  // Commit ONLY this bar, and only if it is the one being edited
                  // and the text actually changed.  Blurring an untouched input
                  // used to write its INHERITED meter back as an explicit
                  // override — which planted a time-signature label (and its row
                  // padding) on bars the user never touched, visibly shifting
                  // other lines of the score.
                  onBlur={() => {
                    if (editing) { if (tsEdit!.dirty) commitBarTimeSig(m, tsEdit!.text); setTsEdit(null); }
                  }}
                  onPointerDown={e => e.stopPropagation()}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                  title="Time signature — type n/d, clear to remove"
                  style={{
                    position: "absolute",
                    left: left * scale,
                    top: (barBot(m) + 5) * scale,
                    width: 54 * scale,
                    height: 16 * scale,
                    fontSize: 13 * scale,
                    fontWeight: "bold",
                    textAlign: "left",
                    fontFamily: "Helvetica, Arial, sans-serif",
                    // Visible only while typing; otherwise transparent so the SVG
                    // label shows (and empty bars stay clean).
                    color: editing ? "#fff" : "transparent",
                    caretColor: "#fff",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    padding: 0,
                    pointerEvents: shown ? "auto" : "none",
                  }}
                />
              );
            })}
          </div>
          </>)}
        </div>
      </div>


      {showClefRef && (
        <ClefReference
          onClose={() => setShowClefRef(false)}
          root={project.clefRefRoot ?? ""}
          onRootChange={r => {
            const u = { ...project, clefRefRoot: r || undefined, notes };
            saveProject(u); setProject(u);
          }}
        />
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded bg-[#1a1a1a] border border-[#2f2f2f] text-[#bbb] text-[10px] font-mono leading-none">
      {children}
    </span>
  );
}

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <span className="flex gap-0.5">{keys.map((k, i) => <Kbd key={i}>{k}</Kbd>)}</span>
      <span className="text-[11px] text-[#888] whitespace-nowrap">{label}</span>
    </span>
  );
}

function Sep() {
  return <span className="w-px h-4 bg-[#222] shrink-0" />;
}

interface Beam { x1: number; x2: number; y: number; }

interface RenderItem {
  id: string; x: number; y: number; label: string; isRest: boolean;
  octave: number; accidental?: string;   // alteration prefix (♯/♭/^/v)
  underlines: number; sideDashes: number; sideTick: boolean; dot: boolean; duration: Duration;
  measure: number; startSlot: number; total: number; cellSlots: number; font: number;
  decorate: boolean; separate: boolean; staccato?: boolean; accent?: boolean;
}
