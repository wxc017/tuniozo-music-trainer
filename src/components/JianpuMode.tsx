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
  loadProjects, saveProject,
} from "@/lib/noteEntryData";
import {
  jianpuToPitch, jianpuGlyphFor, edoNoteLabel,
  NOTATION_SYSTEM_LABELS, type NotationSystem,
} from "@/lib/jianpu";
import { exportToPdf } from "@/lib/exportPdf";

// ── Layout constants ─────────────────────────────────────────────────────────
const LEFT_PAD        = 26;   // room for the piano brace on the left
const DEFAULT_MEASURE_W = 170;   // floor width for a bar (kept modest so margins stay tight)
const INNER_PAD       = 8;    // horizontal margin inside a bar, before the first / after the last note
const HEADER_H        = 44;
const CELL_W          = 22;   // horizontal room reserved per finest subdivision
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
const NUM_FONT     = 22;
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
}

export default function JianpuMode({ controlledActiveId, onBack, embedded = false, solfaOnly = false }: JianpuModeProps) {
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
  const [edoText, setEdoText] = useState("12");   // free-typed EDO, committed on blur
  const [barsText, setBarsText] = useState("8");  // free-typed bar count, committed on blur
  const [tsEdit, setTsEdit] = useState<{ m: number; text: string } | null>(null); // per-bar time-sig being typed

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
  const perSection = project?.perSectionVoiceCount;
  // Sol-fa is a single melodic line, so it may drop to one voice; jianpu keeps
  // the piano-style two-voice minimum.
  const minVoices = solfaOnly ? 1 : MIN_VOICES;

  // ── Sections & per-section voice counts ─────────────────────────────────────
  // A "section" runs from a bar carrying a `perBarSection` label (or bar 0) up to
  // the next such bar.  Each section has an independent voice-line count, so
  // adding voices to one exercise never touches another.
  const sectionStartOf = useCallback((measure: number): number => {
    let s = 0;
    for (let m = 1; m <= measure; m++) if (sectionLabels?.[m]?.trim()) s = m;
    return s;
  }, [sectionLabels]);
  const sectionRangeOf = useCallback((measure: number): [number, number] => {
    const bc = project?.setup.barCount ?? 1;
    const start = sectionStartOf(measure);
    let end = bc;
    for (let m = start + 1; m < bc; m++) if (sectionLabels?.[m]?.trim()) { end = m; break; }
    return [start, end];
  }, [project?.setup.barCount, sectionLabels, sectionStartOf]);
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
  useEffect(() => { setEdoText(String(edo)); }, [edo]);
  useEffect(() => { setBarsText(String(project?.setup.barCount ?? 8)); }, [project?.setup.barCount]);

  // A time signature applies from the bar it's set on FORWARD until the next
  // change (standard notation), so the effective meter is the nearest override
  // at or before the bar, else the default.
  const effectiveTs = useCallback((measure: number): MeasureTimeSig => {
    const per = setup?.perBarTimeSig;
    if (per) for (let k = measure; k >= 0; k--) if (per[k]) return per[k];
    return setup?.defaultTimeSig ?? { num: 4, den: 4 };
  }, [setup]);
  const totalSlotsOf = useCallback((measure: number): number => {
    if (!setup) return 32;
    return measureSlots(effectiveTs(measure));
  }, [setup, effectiveTs]);

  MPR = 4;   // four measures per line; break early with the per-measure cut button

  // Row + size layout.  A bar opens a new row when it starts a section, carries a
  // manual break, or the current row already holds MPR bars.  All bars share one
  // width — sized to the densest bar so nothing squishes and every bar lines up
  // (symmetrical) — and rows are left-aligned.  Row height follows that row's
  // section voice count.  Written to the module-level arrays so the geometry
  // helpers above resolve each bar.
  const layout = useMemo(() => {
    const barCount = setup?.barCount ?? 1;
    const gapped    = !!project?.pianoBrace;
    const breakAt   = (m: number) => !!project?.setup.perBarBreakBefore?.[m];
    const sectionAt = (m: number) => !!sectionLabels?.[m]?.trim();
    // Rows: break on a section label, a manual cut, or a full row (MPR).
    const rowsArr: number[][] = [];
    for (let m = 0; m < barCount; m++) {
      const last = rowsArr[rowsArr.length - 1];
      if (m === 0 || breakAt(m) || sectionAt(m) || !last || last.length >= MPR) rowsArr.push([m]);
      else last.push(m);
    }
    if (!rowsArr.length) rowsArr.push([0]);
    // Uniform bar width — enough cells for the densest bar (finest subdivision ×
    // its slot count) so 16ths never squish and all bars match.
    const cell = system === "solfa" ? 34 : CELL_W;
    const finest = notes.reduce((mn, n) => Math.min(mn, DURATION_SLOTS[n.duration]), 8);
    let maxCells = 4;
    for (let m = 0; m < barCount; m++) maxCells = Math.max(maxCells, totalSlotsOf(m) / finest);
    const uniformW = Math.max(DEFAULT_MEASURE_W, Math.round(maxCells * cell) + 2 * INNER_PAD);
    const wArr: number[] = [];
    for (let m = 0; m < barCount; m++) wArr[m] = uniformW;
    // Section start of each bar, then that section's voice count (stored min or
    // the tallest note voice) — computed once so every bar in a section agrees.
    const startOf: number[] = [];
    let cur = 0;
    for (let m = 0; m < barCount; m++) { if (m > 0 && sectionAt(m)) cur = m; startOf[m] = cur; }
    const maxVoice: Record<number, number> = {};
    for (const n of notes) { const s = startOf[n.measure] ?? 0; maxVoice[s] = Math.max(maxVoice[s] ?? 0, (n.voice ?? 0) + 1); }
    const vcForStart = (s: number) => Math.max(
      minVoices, perSection?.[s] ?? (s === 0 ? project?.voiceCount ?? minVoices : minVoices), maxVoice[s] ?? 0);
    const vcArr: number[] = [], hsArr: (number | null)[] = [];
    for (let m = 0; m < barCount; m++) {
      const vc = vcForStart(startOf[m]);
      vcArr[m] = vc;
      hsArr[m] = gapped ? Math.ceil(vc / 2) : null;
    }
    // Row geometry — height follows the row's section voice count; bars are
    // left-aligned (start at LEFT_PAD) and accumulate the uniform width.
    const maxRowLen = Math.max(...rowsArr.map(r => r.length));
    const hasTsLabel = (m: number) => m === 0 || !!project?.setup.perBarTimeSig?.[m];
    const rowOfArr: number[] = [], colOfArr: number[] = [], rowTop: number[] = [], xArr: number[] = [];
    let y = HEADER_H;
    rowsArr.forEach((row, r) => {
      // A line the user deliberately started (a section OR a manual cut) gets
      // headroom for a title above it; auto-wrapped continuations don't.
      if (sectionAt(row[0]) || breakAt(row[0])) y += SECTION_PAD;
      rowTop[r] = y;
      let x = LEFT_PAD;   // far-left
      row.forEach((m, c) => { rowOfArr[m] = r; colOfArr[m] = c; xArr[m] = x; x += wArr[m]; });
      y += systemHeight(vcArr[row[0]] ?? minVoices, gapped);
      if (row.some(hasTsLabel)) y += TS_PAD;   // room for the time-signature line
    });
    return { rowsArr, rowOfArr, colOfArr, rowTop, wArr, xArr, vcArr, hsArr, totalHeight: y, canvasW: LEFT_PAD * 2 + maxRowLen * uniformW };
  }, [setup?.barCount, project?.setup.perBarBreakBefore, project?.setup.perBarTimeSig, sectionLabels, perSection,
      project?.voiceCount, project?.pianoBrace, notes, totalSlotsOf, system, minVoices]);
  ROW_OF = layout.rowOfArr; COL_OF = layout.colOfArr; ROW_TOP = layout.rowTop;
  ROWS = layout.rowsArr; ROW_COUNT = layout.rowsArr.length;
  VC_OF = layout.vcArr; HS_OF = layout.hsArr; W_OF = layout.wArr; X_OF = layout.xArr; CANVAS_W = layout.canvasW;

  const gridSnap = DURATION_SLOTS[duration] * (dotted ? 1.5 : 1);

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

  const togglePianoBrace = useCallback(() => {
    if (!project) return;
    const u = { ...project, pianoBrace: !project.pianoBrace, notes };
    saveProject(u); setProject(u);
  }, [project, notes]);

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
    if (nextSlot >= total) {
      const nm = Math.min(project.setup.barCount - 1, measure + 1);
      setCursor({ voice, measure: nm, slot: nm === measure ? total - gridSnap : 0 });
    } else {
      setCursor({ voice, measure, slot: nextSlot });
    }
  }, [project, totalSlotsOf, gridSnap]);

  // ── Note construction ─────────────────────────────────────────────────────
  const makeNote = useCallback((degree: number, isRest: boolean, dur: Duration, dot: boolean,
                                voice: number, measure: number, slot: number): NoteData => {
    const jp = isRest ? null : jianpuToPitch(degree, octave, undefined, fifths);
    return {
      id: crypto.randomUUID(),
      measure, startSlot: slot, duration: dur, dotted: dot || undefined,
      voice, isRest,
      pitch: jp ? jp.pitch : "b/4",
      jianpuDegree: isRest ? 0 : degree,
      jianpuOctave: isRest ? undefined : octave,
    };
  }, [octave]);

  const placeNote = useCallback((degree: number, isRest: boolean) => {
    if (!project) return;
    const { voice, measure, slot } = cursor;
    const newLen = DURATION_SLOTS[duration] * (dotted ? 1.5 : 1);
    const newNote = makeNote(degree, isRest, duration, dotted, voice, measure, slot);
    const newEnd = slot + newLen;
    const kept = notes.filter(n => {
      if ((n.voice ?? 0) !== voice || n.measure !== measure) return true;
      const s = n.startSlot, e = n.startSlot + noteSlots(n);
      return e <= slot || s >= newEnd;
    });
    commit([...kept, newNote]);
    setSelectedIds([]);
    // Embedded (trainer) mode: keep the cursor on this beat so further digits
    // build the chord downward into successive voices (never stacking in one
    // voice); the user moves between beats with the arrow keys.
    if (!embedded) advanceCursor(voice, measure, slot + newLen);
  }, [project, cursor, duration, dotted, notes, makeNote, commit, advanceCursor, embedded]);

  const inputDigit = useCallback((degree: number, isRest: boolean) => {
    if (!isRest) {
      const { voice, measure, slot } = cursor;
      const covers = (v: number) => notes.some(n => (n.voice ?? 0) === v && n.measure === measure && !n.isRest
        && slot >= n.startSlot && slot < n.startSlot + noteSlots(n));
      if (covers(voice)) {
        // Two notes may never share a beat in one voice — a simultaneous note
        // always drops into the next free voice (no chord stacking anywhere).
        let v = voice + 1;
        while (v < MAX_VOICES && covers(v)) v++;
        const newLen = DURATION_SLOTS[duration] * (dotted ? 1.5 : 1);
        const kept = notes.filter(n => {
          if ((n.voice ?? 0) !== v || n.measure !== measure) return true;
          return n.startSlot + noteSlots(n) <= slot || n.startSlot >= slot + newLen;
        });
        commit([...kept, makeNote(degree, false, duration, dotted, v, measure, slot)]);
        setSelectedIds([]);
        setCursor({ voice: v, measure, slot });
        return;
      }
    }
    placeNote(degree, isRest);
  }, [cursor, notes, duration, dotted, makeNote, commit, placeNote]);

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
  // Append a measure (up to 64).  Bound to the `m` keybind.
  const addMeasure = useCallback(() => {
    if (!project) return;
    updateSetup({ barCount: Math.min(64, project.setup.barCount + 1) });
  }, [project, updateSetup]);
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
        perBarSection: shift(project.setup.perBarSection),
        perBarBreakBefore: shift(project.setup.perBarBreakBefore),
        perBarTimeSig: shift(project.setup.perBarTimeSig),
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

  // Persist notes + the stored voice count for ONE section + cursor voice.  The
  // count is keyed by the section's start bar, so other sections are untouched.
  const commitVoices = useCallback((nextNotes: NoteData[], sectionStart: number, storedVoiceCount: number, cursorVoice: number) => {
    if (!project) return;
    const vc = Math.max(minVoices, Math.min(MAX_VOICES, storedVoiceCount));
    const sorted = [...nextNotes].sort((a, b) =>
      a.measure !== b.measure ? a.measure - b.measure
      : (a.voice ?? 0) !== (b.voice ?? 0) ? (a.voice ?? 0) - (b.voice ?? 0)
      : a.startSlot - b.startSlot);
    const perSectionVoiceCount = { ...(project.perSectionVoiceCount ?? {}), [sectionStart]: vc };
    const u = { ...project, notes: sorted, perSectionVoiceCount };
    saveProject(u); setProject(u); setNotes(sorted);
    setCursor(c => ({ ...c, voice: cursorVoice }));
  }, [project, minVoices]);

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

  // Shift+↓ — add an empty voice BELOW the bottom line of the cursor's section.
  // Shift+↑ — add one ABOVE its top line (reindex that section's notes down one
  // so the new voice 0 is blank).  Other sections are untouched.
  const addVoiceBelow = useCallback(() => {
    if (!project) return;
    const vc = voiceCountOf(cursor.measure);
    if (vc >= MAX_VOICES) return;
    commitVoices(notes, sectionStartOf(cursor.measure), vc + 1, cursor.voice);
  }, [project, notes, cursor.measure, cursor.voice, voiceCountOf, sectionStartOf, commitVoices]);
  const addVoiceAbove = useCallback(() => {
    if (!project) return;
    const vc = voiceCountOf(cursor.measure);
    if (vc >= MAX_VOICES) return;
    const [start, end] = sectionRangeOf(cursor.measure);
    const shifted = notes.map(n => (n.measure >= start && n.measure < end) ? { ...n, voice: (n.voice ?? 0) + 1 } : n);
    commitVoices(shifted, start, vc + 1, cursor.voice + 1);
  }, [project, notes, cursor.measure, cursor.voice, voiceCountOf, sectionRangeOf, commitVoices]);

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

  // The notes an edit targets: the explicit multi-selection, else the single
  // note under the cursor (so hovering a note acts as if it were selected).
  const targetIds = useCallback((): string[] => {
    if (selectedIds.length) return selectedIds;
    const { voice, measure, slot } = cursor;
    const host = notes.find(n => (n.voice ?? 0) === voice && n.measure === measure && !n.isRest
      && slot >= n.startSlot && slot < n.startSlot + noteSlots(n));
    return host ? [host.id] : [];
  }, [selectedIds, cursor, notes]);

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

  const toggleDot = useCallback(() => {
    const next = !dotted;
    setDotted(next);
    applyToSelection(n => ({ ...n, dotted: next || undefined }));
  }, [dotted, applyToSelection]);

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

    // ── Arrows (handled before the modifier guard so Ctrl/Shift work) ──
    // ←→  move selected note, else move cursor: plain = one subdivision,
    //     Shift = one beat, Ctrl/⌘ = jump to the next/previous measure.
    // ↑↓  voice (or move note); Shift = change row.
    if (k === "ArrowRight" || k === "ArrowLeft") {
      e.preventDefault();
      const dir = k === "ArrowRight" ? 1 : -1;
      const mode = (e.ctrlKey || e.metaKey) ? "measure" : e.shiftKey ? "beat" : "fine";
      if (spaceHeldRef.current) extendSelect(dir, mode);   // Space held → grow selection
      else if (hasSel) moveSelected("h", dir);             // move the selected note(s)
      else moveCursorH(dir, mode);                         // just move the cursor
      return;
    }
    if (k === "ArrowUp" || k === "ArrowDown") {
      e.preventDefault();
      const dir = k === "ArrowDown" ? 1 : -1;
      // Shift+↑ = add an empty voice above the top; Shift+↓ = add one below.
      // Plain ↑/↓ = move through voices (wrapping to the adjacent row).
      if (e.shiftKey) (dir < 0 ? addVoiceAbove() : addVoiceBelow());
      else navVoice(dir);
      return;
    }
    // Space held → arrows range-select; a Space tap selects the note at the cursor.
    if (k === " ") {
      e.preventDefault();
      if (!spaceHeldRef.current) {
        spaceHeldRef.current = true;
        anchorRef.current = cursor;
        const { voice, measure, slot } = cursor;
        const host = notes.find(n => (n.voice ?? 0) === voice && n.measure === measure && !n.isRest
          && slot >= n.startSlot && slot < n.startSlot + noteSlots(n));
        setSelectedIds(host ? [host.id] : []);
      }
      return;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (k >= "1" && k <= "7") { e.preventDefault(); inputDigit(parseInt(k, 10), false); return; }
    if (k === "0")            { e.preventDefault(); inputDigit(0, true); return; }

    // Quick-access modifiers on the letter row directly below the numbers:
    //   q/w = octave −/+   e/r = duration shorter/longer   t = dot
    //   u = underline (eighth)   o = staccato   . / , = alteration up / down
    if (k === "q" || k === "-" || k === "_") { e.preventDefault(); bumpOctave(-1); return; }
    if (k === "w" || k === "+" || k === "=") { e.preventDefault(); bumpOctave(1); return; }
    if (k === "e" || k === "]")              { e.preventDefault(); stepDuration(-1); return; } // shorter
    if (k === "r" || k === "[")              { e.preventDefault(); stepDuration(1); return; }  // longer
    if (k === "t")                           { e.preventDefault(); toggleDot(); return; }
    if (k === "u")                           { e.preventDefault(); toggleUnderline(); return; }  // eighth-note underline
    if (k === "o")                           { e.preventDefault(); toggleStaccato(); return; }   // staccato dot
    if (k === "." || k === ">")              { e.preventDefault(); alter(1); return; }   // alteration up
    if (k === "," || k === "<")              { e.preventDefault(); alter(-1); return; }  // alteration down
    if (k === "p")                           { e.preventDefault(); togglePianoBrace(); return; }
    if (k === "l")                           { e.preventDefault(); toggleUnderlines(); return; }
    // Jump into the current measure's title field (Enter/Esc jumps back out).
    if (k === "n")                           { e.preventDefault(); document.getElementById(`jp-title-${cursor.measure}`)?.focus(); return; }
    // Jump into the current measure's section-label field (labels this bar as a
    // new exercise: big heading + line break).
    if (k === "s")                           { e.preventDefault(); document.getElementById(`jp-section-${cursor.measure}`)?.focus(); return; }
    // Cut the line after the current measure (press again to rejoin); the ✂
    // button at each bar's end does the same.
    if (k === "b")                           { e.preventDefault(); toggleBreakBefore(cursor.measure + 1); return; }
    // Append a measure (m) / delete the current measure (Shift+M).
    if (k === "m")                           { e.preventDefault(); addMeasure(); return; }
    if (k === "M")                           { e.preventDefault(); deleteMeasure(cursor.measure); return; }
    // Edit the current measure's time signature (type "n/d" under the bar).
    if (k === "g")                           { e.preventDefault(); document.getElementById(`jp-timesig-${cursor.measure}`)?.focus(); return; }

    if (k === "Backspace" || k === "Delete") {
      e.preventDefault();
      if (e.shiftKey) removeVoiceAt(cursor.voice);   // Shift+⌫ → delete the current voice line
      else deleteSelectedOrCursor();
      return;
    }
    if (k === "Escape")        { e.preventDefault(); setSelectedIds([]); return; }
  }, [project, selectedIds, cursor, notes, inputDigit, moveSelected, moveCursorH, extendSelect, navVoice, addVoiceAbove, addVoiceBelow,
      removeVoiceAt, toggleBreakBefore, addMeasure, deleteMeasure, undo,
      stepDuration, toggleDot, toggleUnderline, toggleStaccato, alter, deleteSelectedOrCursor, bumpOctave, togglePianoBrace, toggleUnderlines]);

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
      // Place the note at the CENTRE of its rhythmic cell (start + half its span)
      // so a bar of equal notes sits symmetrically — no phantom trailing slot.
      const x = slotToX(first.measure, first.startSlot + noteSlots(first) / 2, total);
      const base = baselineY(voice, first.measure);
      const sorted = [...g].sort((a, b) => pitchRank(a) - pitchRank(b));
      const glyph = jianpuGlyphFor(first.duration, first.dotted);
      const firstLabel = first.isRest ? "0" : edoNoteLabel(system, first.jianpuDegree ?? 1, altOf(first), edo).text;
      const vmKey = `${voice}:${first.measure}`;
      (byVM.get(vmKey) ?? byVM.set(vmKey, []).get(vmKey)!).push(
        { startSlot: first.startSlot, slots: noteSlots(first), x, y: base, underlines: glyph.underlines, isRest: first.isRest, separate: !!first.separateUnderline, label: firstLabel });
      sorted.forEach((n, i) => {
        const y = base - i * CHORD_DY;
        positions.push({ id: n.id, x, y });
        const lbl = n.isRest ? null : edoNoteLabel(system, n.jianpuDegree ?? 1, altOf(n), edo);
        items.push({
          id: n.id, x, y,
          label: lbl ? lbl.text : "0",
          isRest: n.isRest,
          octave: n.isRest ? 0 : (n.jianpuOctave ?? 0),
          accidental: lbl?.prefix,   // alteration mark drawn before a jianpu number
          underlines: glyph.underlines, dashes: glyph.dashes, dot: glyph.dot,
          measure: first.measure, startSlot: first.startSlot, total,
          decorate: i === 0, separate: !!first.separateUnderline, staccato: !!n.staccato,
        });
      });
    }
    notePosRef.current = positions;

    // Continuous underline beams: within each voice+measure, connect consecutive
    // underlined notes into one line (jianpu draws the time-reduction line under
    // the whole run, not per beat).  The run breaks only when notes aren't
    // contiguous — a rest, a gap, or a longer note between them — or when a note
    // is flagged `separate` (which draws its own underline in svgNotes instead).
    const beams: Beam[] = [];
    for (const list of byVM.values()) {
      const arr = list.filter(e => !e.isRest && e.underlines > 0).sort((a, b) => a.startSlot - b.startSlot);
      let run: typeof arr = [];
      const flush = () => {
        if (!run.length) { return; }
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
        if (e.separate) { flush(); continue; }   // separate note: own underline, breaks beam
        // Break the line when this note doesn't start exactly where the previous
        // underlined note ended (a rest, gap, or longer note sits between them).
        const prev = run[run.length - 1];
        if (prev && prev.startSlot + prev.slots !== e.startSlot) flush();
        run.push(e);
      }
      flush();
    }

    return { items, positions, beams };
  }, [project, notes, totalSlotsOf, system, layout, edo]);

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExportPdf = useCallback(async () => {
    if (!project || !scoreRef.current) return;
    await exportToPdf([{ title: project.title, element: scoreRef.current }],
      project.title.replace(/\s+/g, "_"), { showTitles: true, splitSections: false, orientation: "portrait" });
  }, [project]);

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
    if (!isDownRef.current || !dragStartRef.current) return;
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
        stroke={WHITE} strokeWidth={1.5} />);

  // Beamed notes' underlines are drawn as continuous beams; `separate` notes
  // (and rests) draw their own underline in svgNotes.
  const svgBeams = rendered.beams.map((b, i) =>
    <line key={`beam-${i}`} x1={b.x1} x2={b.x2} y1={b.y} y2={b.y} stroke={WHITE} strokeWidth={1.5} />);

  const svgNotes = rendered.items.flatMap(it => {
    const els: React.ReactNode[] = [];

    // ── Rests ──  a centred dot, one per beat (multi-beat rests repeat it)
    if (it.isRest) {
      const count = it.dashes + 1;
      for (let z = 0; z < count; z++) {
        const zslot = it.startSlot + z * 8;
        if (z > 0 && zslot >= it.total) break;
        const zx = z === 0 ? it.x : slotToX(it.measure, zslot, it.total);
        els.push(<circle key={`${it.id}-r-${z}`} cx={zx} cy={it.y - 7} r={2.5} fill={WHITE} />);
        els.push(...underlinesAt(zx, it.y, it.underlines, `${it.id}-${z}`));
      }
      if (it.dot) els.push(<circle key={`${it.id}-dt`} cx={it.x + 12} cy={it.y - 6} r={2} fill={WHITE} />);
      return els;
    }

    // ── Pitched notes ──
    els.push(<text key={`${it.id}-n`} x={it.x} y={it.y} fill={WHITE}
      fontSize={NUM_FONT} fontFamily={JIANPU_FONT} textAnchor="middle">{it.label}</text>);
    if (it.accidental) {
      els.push(<text key={`${it.id}-a`} x={it.x - 11} y={it.y - 7} fill={WHITE}
        fontSize={12} fontFamily={JIANPU_FONT} textAnchor="end">{it.accidental}</text>);
    }
    for (let d = 0; d < Math.abs(it.octave); d++) {
      const dy = it.octave > 0 ? it.y - NUM_FONT - 2 - d * 6 : it.y + 8 + it.underlines * 4 + d * 6;
      els.push(<circle key={`${it.id}-od${d}`} cx={it.x} cy={dy} r={2} fill={WHITE} />);
    }
    // Staccato — a dot above the number, clearing any octave-up dots.
    if (it.staccato) {
      const above = it.octave > 0 ? it.y - NUM_FONT - 2 - (Math.abs(it.octave) - 1) * 6 - 6 : it.y - NUM_FONT - 6;
      els.push(<circle key={`${it.id}-st`} cx={it.x} cy={above} r={1.8} fill={WHITE} />);
    }
    if (it.decorate) {
      if (it.separate) els.push(...underlinesAt(it.x, it.y, it.underlines, it.id, labelHalfW(it.label)));
      if (it.dot) els.push(<circle key={`${it.id}-dt`} cx={it.x + 12} cy={it.y - 6} r={2} fill={WHITE} />);
      for (let dsh = 1; dsh <= it.dashes; dsh++) {
        const dashSlot = it.startSlot + dsh * 8;
        if (dashSlot >= it.total) break;
        const dx = slotToX(it.measure, dashSlot, it.total);
        els.push(<text key={`${it.id}-d${dsh}`} x={dx} y={it.y} fill={WHITE}
          fontSize={NUM_FONT} fontFamily={JIANPU_FONT} textAnchor="middle">–</text>);
      }
    }
    return els;
  });

  const svgSystems: React.ReactNode[] = [];
  const barTop = (m: number) => baselineY(0, m) - BAR_TOP_PAD;
  const barBot = (m: number) => baselineY(vcOf(m) - 1, m) + BAR_BOT_PAD;
  for (let m = 0; m < project.setup.barCount; m++) {
    const left = measureLeftX(m);
    const right = left + measureWidth(m);
    svgSystems.push(<line key={`bar-${m}`} x1={right} x2={right}
      y1={barTop(m)} y2={barBot(m)} stroke={WHITE} strokeWidth={1.2} />);
    // measure number (top-left of each bar) — lifted clear of the cursor box
    svgSystems.push(<text key={`mn-${m}`} x={left - 4} y={barTop(m) - 10} fill="#8a8a8a"
      fontSize={10} fontFamily="Helvetica, Arial, sans-serif">{m + 1}</text>);
    // per-measure title / note, drawn above the bar (also captured on export)
    const barTitle = project.setup.perBarTitle?.[m];
    if (barTitle) svgSystems.push(<text key={`bt-${m}`} x={left} y={barTop(m) - 25} fill={WHITE}
      fontSize={12} fontFamily="Helvetica, Arial, sans-serif">{barTitle}</text>);
    // Section heading — large, bold, lifted into the row's extra top padding so
    // the "+ note" line and the notes sit clearly below it (this bar always opens
    // a new row, so there's room above it).
    const section = project.setup.perBarSection?.[m];
    if (section?.trim()) svgSystems.push(<text key={`sec-${m}`} x={left} y={barTop(m) - SECTION_LABEL_DY} fill={WHITE}
      fontSize={18} fontWeight="bold" fontFamily="Helvetica, Arial, sans-serif">{section}</text>);
    // Time signature — drawn horizontally under the bar.  Shown at bar 0 (the
    // starting meter) and wherever a meter is explicitly set (a change point), so
    // it stays visible after you set it.  Also captured on export.
    if (m === 0 || project.setup.perBarTimeSig?.[m]) {
      const eff = effectiveTs(m);
      svgSystems.push(<text key={`ts-${m}`} x={left + measureWidth(m) / 2} y={barBot(m) + 16} fill={WHITE}
        fontSize={13} fontWeight="bold" fontFamily="Helvetica, Arial, sans-serif" textAnchor="middle">{eff.num}/{eff.den}</text>);
    }
    if ((COL_OF[m] ?? 0) === 0) {
      svgSystems.push(<line key={`barL-${m}`} x1={left} x2={left} y1={barTop(m)} y2={barBot(m)}
        stroke={WHITE} strokeWidth={1.2} />);
      // Piano grand-staff brace joining the voices — span it symmetrically
      // around the voice glyphs (equal margin above the top / below the bottom)
      // so its tip is always centred regardless of voice count.
      if (project.pianoBrace) {
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

  const cursorX = slotToX(cursor.measure, cursor.slot + gridSnap / 2, totalSlotsOf(cursor.measure));
  const cursorY = baselineY(cursor.voice, cursor.measure);

  const btn = "px-2 py-1 rounded text-xs border transition-colors";
  const btnOn = "bg-[#7173e618] border-[#7173e6] text-[#9999ee]";
  const btnOff = "bg-[#1a1a1a] border-[#2a2a2a] text-[#888] hover:text-[#ccc] hover:border-[#3a3a3a]";

  return (
    <div className={`flex flex-col ${embedded ? "" : "h-full"}`}>
      {/* Header — action row (hidden when embedded) */}
      {!embedded && <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[#141414]">
        <button onClick={() => onBack?.()} className="text-xs text-[#888] hover:text-white">← Back</button>
        <div className="flex-1" />
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"
          className={`${btn} ${canUndo ? btnOff : "bg-[#141414] border-[#1e1e1e] text-[#444] cursor-not-allowed"}`}>↶ Undo</button>
        <button onClick={handleExportPdf} className={`${btn} ${btnOff}`}>Export PDF</button>
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
        </div>
      </div>}

      {/* Duration / octave / alteration are driven by the keybinds shown in the
          footer (e/r duration, t dot, q/w octave, ,/. alter) — no toolbar. */}

      {/* Score area (grows with content when embedded; scrolls when full-page) */}
      <div ref={scoreAreaRef} className={`${embedded ? "overflow-x-auto" : "flex-1 overflow-x-hidden overflow-y-auto"} p-4 outline-none`} style={{ background: "#0b0b0b" }}>
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
            {notes.length === 0 && (
              <text x={cursorX + 24} y={cursorY} fill="#555"
                fontSize={12} fontFamily="Helvetica, Arial, sans-serif">type 1–7 to start</text>
            )}
            {selectedIds.map(id => {
              const p = rendered.positions.find(pp => pp.id === id);
              if (!p) return null;
              return <rect key={id} x={p.x - 13} y={p.y - NUM_FONT - 2} width={26} height={NUM_FONT + 10}
                fill={`${ACCENT}22`} stroke={ACCENT} strokeWidth={1} rx={3} />;
            })}
            <rect x={cursorX - 13} y={cursorY - NUM_FONT - 2} width={26} height={NUM_FONT + 10}
              fill="none" stroke={ACCENT} strokeWidth={1.4} rx={3} strokeDasharray="3 2" />
            {dragRect && (
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
              return (
                <input
                  key={`mt-${m}`}
                  id={`jp-title-${m}`}
                  className="jp-mtitle"
                  value={project.setup.perBarTitle?.[m] ?? ""}
                  placeholder="+ note"
                  onChange={e => updateBarTitle(m, e.target.value)}
                  onPointerDown={e => e.stopPropagation()}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                  style={{
                    position: "absolute",
                    left: left * scale,
                    top: (barTop(m) - 25 - 11) * scale,
                    width: (measureWidth(m) - 6) * scale,
                    height: 16 * scale,
                    fontSize: 12 * scale,
                    fontFamily: "Helvetica, Arial, sans-serif",
                    color: "transparent",
                    caretColor: "#fff",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    padding: 0,
                    pointerEvents: "auto",
                  }}
                />
              );
            })}
          </div>

          {/* Per-measure title / section editors — transparent text over the SVG
              headings.  Reach one with the `s` keybind, or click the faint
              "+ title" that appears at the start of every line (the first bar, a
              section, or a cut line) — type a label to give that line a heading. */}
          <style>{`.jp-section::placeholder{color:#3a3a3a;font-weight:400}`}</style>
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
                    top: (barTop(m) - SECTION_LABEL_DY - 14) * scale,
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
              const active = !!project.setup.perBarBreakBefore?.[m + 1];
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

          {/* Per-measure time-signature editors — under each bar.  Reach one with
              the `g` keybind (or click an existing change) and type "n/d".  Empty
              inputs are click-through; the SVG draws the visible label. */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {Array.from({ length: project.setup.barCount }, (_, m) => {
              const left = measureLeftX(m);
              const editing = tsEdit?.m === m;
              const eff = effectiveTs(m);
              const hasOverride = !!project.setup.perBarTimeSig?.[m];
              const shown = hasOverride || m === 0;   // a visible label sits here
              return (
                <input
                  key={`ts-${m}`}
                  id={`jp-timesig-${m}`}
                  value={editing ? tsEdit!.text : (shown ? `${eff.num}/${eff.den}` : "")}
                  onFocus={() => setTsEdit({ m, text: `${eff.num}/${eff.den}` })}
                  onChange={e => setTsEdit({ m, text: e.target.value.replace(/[^0-9/]/g, "") })}
                  onBlur={() => { commitBarTimeSig(m, editing ? tsEdit!.text : `${eff.num}/${eff.den}`); setTsEdit(null); }}
                  onPointerDown={e => e.stopPropagation()}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                  title="Time signature — type n/d, clear to remove"
                  style={{
                    position: "absolute",
                    left: (left + measureWidth(m) / 2 - 27) * scale,
                    top: (barBot(m) + 5) * scale,
                    width: 54 * scale,
                    height: 16 * scale,
                    fontSize: 13 * scale,
                    fontWeight: "bold",
                    textAlign: "center",
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

      {/* Footer legend */}
      <div className="border-t border-[#1a1a1a] bg-[#0d0d0d] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Hint keys={["1–7"]} label="pitch" />
          <Hint keys={["0"]} label="rest" />
          <Sep />
          <Hint keys={["q", "w"]} label="octave" />
          <Hint keys={["e", "r"]} label="duration" />
          <Hint keys={["t"]} label="dot" />
          <Hint keys={["u"]} label="underline" />
          <Hint keys={["o"]} label="staccato" />
          <Hint keys={[",", "."]} label="alter" />
          <Sep />
          <Hint keys={["←", "→"]} label="move" />
          <Hint keys={["↑", "↓"]} label="row" />
          <Hint keys={["Shift + ↑↓"]} label="add voice" />
          <Hint keys={["Shift + ⌫"]} label="del voice" />
          <Hint keys={["Space"]} label="select" />
          {!embedded && <>
            <Sep />
            <Hint keys={["p"]} label="piano brace" />
            <Hint keys={["l"]} label="separate/beam (selection)" />
            <Hint keys={["n"]} label="measure note" />
            <Hint keys={["s"]} label="title / section" />
            <Hint keys={["b"]} label="cut line" />
            <Hint keys={["m"]} label="add bar" />
            <Hint keys={["Shift + M"]} label="del bar" />
            <Hint keys={["g"]} label="time sig" />
            <Hint keys={["Ctrl + Z"]} label="undo" />
          </>}
        </div>
      </div>
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
    <span className="flex items-center gap-1.5">
      <span className="flex gap-0.5">{keys.map((k, i) => <Kbd key={i}>{k}</Kbd>)}</span>
      <span className="text-[11px] text-[#888]">{label}</span>
    </span>
  );
}

function Sep() {
  return <span className="w-px h-4 bg-[#222]" />;
}

interface Beam { x1: number; x2: number; y: number; }

interface RenderItem {
  id: string; x: number; y: number; label: string; isRest: boolean;
  octave: number; accidental?: string;   // alteration prefix (♯/♭/^/v)
  underlines: number; dashes: number; dot: boolean;
  measure: number; startSlot: number; total: number; decorate: boolean; separate: boolean; staccato?: boolean;
}
