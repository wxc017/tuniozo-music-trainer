import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Renderer, Stave, StaveNote, Voice, Formatter, Beam, Annotation,
  Barline, StaveTie, Dot, Tuplet, GhostNote,
} from "vexflow";
import {
  DecomposedPhrase, DecomposedNote, ChordAssignment, ChordFunction,
  parseChordName, analyzePhrase, analyzeNoteFunction,
  randomTensionChange, changeNoteTension, importFromTranscription, tensionCategory,
  FUNCTION_DISPLAY,
} from "@/lib/phraseDecompositionData";
import type { Duration, MeasureTimeSig, NoteData } from "@/lib/noteEntryData";
import { measureSlots, DURATION_SLOTS } from "@/lib/noteEntryData";
import { readPendingRestore } from "@/lib/practiceLog";
import PracticeLogSaveBar from "./PracticeLogSaveBar";
import { SUBDIVISION_PERMUTATIONS, type SubdivisionN } from "@/lib/konnakolData";
import {
  type ScaleType, type ReinterpretationOp, type SequenceType, type IntervalMode,
  type ReharmMode, type InsertMode, type SimplifyMode, type FragmentMode,
  type RegisterMode, type GroupingPattern, type ApproachMode, type MotifTransform,
  type DensityMode, type StylePreset,
  SCALE_DISPLAY, REINTERPRETATION_OPS, REHARM_DISPLAY, STYLE_PRESET_DISPLAY,
  GROUPING_PRESETS, SOLFEGE_ALL,
  noteSolfege,
  diatonicTranspose, chromaticTranspose, sequencePhrase, transformIntervals,
  contourPreserve, chordToneTargetShift, scaleReinterpret, reharmonize,
  insertNotes, simplifyPhrase, fragmentPhrase, rotatePhrase, reversePhrase,
  registerShift, computeGroupingAccents, targetBeatShift, addApproachNotes,
  motivicDevelopment, changeDensity, applyStylePreset,
} from "@/lib/phraseReinterpretation";

// ── VexFlow duration map ────────────────────────────────────────────────────

const DUR_TO_VF: Record<Duration, string> = {
  w: "w", h: "h", q: "q", "8": "8", "16": "16", "32": "32",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

let _idc = 1;
function uid(): string { return `pd_${Date.now()}_${_idc++}`; }

const STORAGE_KEY = "lt_phrase_decomp";

function loadPhrase(): DecomposedPhrase | null {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function savePhrase(p: DecomposedPhrase | null): void {
  try { if (p) localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); else localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
}

// ── Reinterpretation defaults ───────────────────────────────────────────────

const SCALE_OPTIONS = Object.entries(SCALE_DISPLAY).map(([key, label]) => ({ key: key as ScaleType, label }));

interface ReinterpState {
  op: ReinterpretationOp;
  diatonicSteps: number;
  chromaticSemitones: number;
  seqCount: number;
  seqInterval: number;
  seqType: SequenceType;
  intervalMode: IntervalMode;
  intervalFactor: number;
  scaleOverride: ScaleType;
  reharmMode: ReharmMode;
  insertMode: InsertMode;
  simplifyMode: SimplifyMode;
  fragmentMode: FragmentMode;
  fragmentLength: number;
  rotateSteps: number;
  registerMode: RegisterMode;
  registerOctaves: number;
  groupingPattern: GroupingPattern;
  targetFunctions: ChordFunction[];
  approachMode: ApproachMode;
  motifLength: number;
  motifTransform: MotifTransform;
  motifRepeats: number;
  densityMode: DensityMode;
  stylePreset: StylePreset;
}

const DEFAULT_REINTERP: ReinterpState = {
  op: "diatonicTranspose",
  diatonicSteps: 1,
  chromaticSemitones: 1,
  seqCount: 2,
  seqInterval: 1,
  seqType: "diatonic",
  intervalMode: "expand",
  intervalFactor: 2,
  scaleOverride: "ionian",
  reharmMode: "tritoneSub",
  insertMode: "diatonicPassing",
  simplifyMode: "nonChordTones",
  fragmentMode: "firstN",
  fragmentLength: 4,
  rotateSteps: 1,
  registerMode: "shiftAll",
  registerOctaves: 1,
  groupingPattern: "3+3+2",
  targetFunctions: ["root", "3", "5", "7"],
  approachMode: "enclosure",
  motifLength: 3,
  motifTransform: "sequence",
  motifRepeats: 2,
  densityMode: "double",
  stylePreset: "bebop",
};

// ── Reinterpretation category layout ─────────────────────────────────────────

const REINTERP_CATEGORIES: { title: string; color: string; ops: ReinterpretationOp[] }[] = [
  { title: "PITCH",     color: "#c8aa50", ops: ["diatonicTranspose", "chromaticTranspose", "sequence", "intervalTransform", "contourPreserve"] },
  { title: "HARMONY",   color: "#9999ee", ops: ["scaleReinterpret", "chordToneShift", "reharmonize"] },
  { title: "ORNAMENT",  color: "#60c0a0", ops: ["insertNotes", "approachNotes"] },
  { title: "STRUCTURE", color: "#cc8844", ops: ["simplify", "fragment", "rotate", "reverse", "density", "registerShift"] },
  { title: "RHYTHM",    color: "#9090e0", ops: ["grouping", "targetBeatShift"] },
  { title: "ADVANCED",  color: "#c860c8", ops: ["motivicDev"] },
  { title: "PRESETS",   color: "#c8aa50", ops: ["stylePreset"] },
];

const OP_NOTES: Record<string, string> = {
  _tensions: "Randomize chord extensions while preserving core tones (root, 3, 5)",
  _subdivision: "Fit notes into rhythmic grids — Konnakol-style permutations per beat",
  diatonicTranspose: "Move phrase up/down by scale degrees — sequences, Barry Harris style",
  chromaticTranspose: "Shift all notes by semitones — side-slipping, tritone movement",
  sequence: "Repeat phrase at successive transpositions — diatonic or chromatic",
  intervalTransform: "Expand, compress, invert, or mirror intervals between notes",
  contourPreserve: "Keep melodic shape (up/down/same), rebuild using scale tones",
  scaleReinterpret: "Same scale degrees, different scale — e.g. Ionian to Lydian",
  chordToneShift: "Reassign which chord functions each note emphasizes",
  reharmonize: "Change chords underneath — tritone sub, backdoor, modal swap",
  insertNotes: "Add passing tones between existing notes — diatonic, chromatic, enclosure",
  approachNotes: "Add bebop-style approach notes before chord tones",
  simplify: "Strip notes down — keep chord tones, every other, or strong beats only",
  fragment: "Extract a portion of the phrase — first N, last N, random segment",
  rotate: "Rotate pitch order — ABCDEF becomes CDEFAB",
  reverse: "Retrograde — reverse pitch order, keep rhythm intact",
  density: "Double or halve notes per beat — add scale neighbors or thin out",
  registerShift: "Move notes to different octaves — shift all, spread, compress, random",
  grouping: "Change accent grouping without moving notes — 3+3+2, 5+3, etc",
  targetBeatShift: "Move chord tones to strong beats, non-chord tones to weak beats",
  motivicDev: "Extract a short motif and develop — sequence, invert, augment, diminish",
  stylePreset: "Combined transformations in the style of jazz masters",
};

// ── Notation renderer ───────────────────────────────────────────────────────

function pitchToVexKey(pitch: string): string {
  return pitch.toLowerCase();
}

interface NoteClickEvent { noteId: string; clientX: number; clientY: number; }

function renderPhraseNotation(
  el: HTMLDivElement,
  phrase: DecomposedPhrase,
  perBeat?: number,
  onNoteClick?: (evt: NoteClickEvent) => void,
  solfegeMap?: Map<string, string>,
  tensionsMap?: Map<string, { label: string; color: string }>,
) {
  el.innerHTML = "";
  if (phrase.notes.length === 0) return;

  // ── Layout constants (matching NoteEntryMode) ──
  const MEASURE_W = 220;
  const CLEF_EXTRA = 78;
  const STAVE_Y = 40;
  const annotLines = (tensionsMap ? 1 : 0) + (solfegeMap ? 1 : 0);
  const STAVE_AREA_H = 160 + annotLines * 28;
  const TUPLET_SUBDIVS = new Set([3, 5, 6, 7]);
  const MEASURES_PER_ROW = Math.min(phrase.barCount, 4);

  // Group notes by measure
  const byMeasure = new Map<number, DecomposedNote[]>();
  for (const n of phrase.notes) {
    const arr = byMeasure.get(n.measure) ?? [];
    arr.push(n);
    byMeasure.set(n.measure, arr);
  }

  // ── Helpers ──
  const barTotalSlots = measureSlots(phrase.timeSig);
  const SLOT_TO_DUR: [number, Duration][] = [
    [32, "w"], [16, "h"], [8, "q"], [4, "8"], [2, "16"], [1, "32"],
  ];

  /** Fill ghost notes using small uniform sizes (8th-note = 4 slots) for even spacing */
  const addGhosts = (tickables: (StaveNote | GhostNote)[], upTo: number, cursor: number) => {
    let rem = upTo - cursor;
    while (rem >= 4) { tickables.push(new GhostNote({ duration: "8" })); rem -= 4; }
    if (rem >= 2) { tickables.push(new GhostNote({ duration: "16" })); rem -= 2; }
    if (rem >= 1) { tickables.push(new GhostNote({ duration: "32" })); rem -= 1; }
  };

  // ── Layout: fixed measure width, rows ──
  const numRows = Math.ceil(phrase.barCount / MEASURES_PER_ROW);
  const totalW = CLEF_EXTRA + MEASURES_PER_ROW * MEASURE_W + 10;
  const totalH = numRows * STAVE_AREA_H;

  const renderer = new Renderer(el, Renderer.Backends.SVG);
  renderer.resize(totalW, totalH);
  const ctx = renderer.getContext();
  ctx.setStrokeStyle("#ffffff");
  ctx.setFillStyle("#ffffff");
  ctx.setFont("Arial", 10);

  // Track ties across bars
  const tieInfos: { first: StaveNote; last: StaveNote; fIdx: number; lIdx: number }[] = [];
  const annotColors: { color: string; type: "tension" | "solfege" }[] = [];

  type BarResult = { vfNotes: StaveNote[]; noteSlotMap: number[]; noteIdMap: string[] } | null;
  const barResults: BarResult[] = [];

  // ── Render each bar ──
  for (let bar = 0; bar < phrase.barCount; bar++) {
    const row = Math.floor(bar / MEASURES_PER_ROW);
    const col = bar % MEASURES_PER_ROW;
    const yOffset = row * STAVE_AREA_H;
    const isFirst = col === 0;
    const x = isFirst ? 0 : CLEF_EXTRA + col * MEASURE_W;
    const w = isFirst ? MEASURE_W + CLEF_EXTRA : MEASURE_W;

    const stave = new Stave(x, STAVE_Y + yOffset, w);
    if (isFirst) stave.addClef("treble").addTimeSignature(`${phrase.timeSig.num}/${phrase.timeSig.den}`);
    if (bar === phrase.barCount - 1) stave.setEndBarType(Barline.type.END);
    stave.setContext(ctx).draw();

    // Chord labels above stave
    const barChords = phrase.chords.filter(c => c.startMeasure === bar);
    const noteStartX = (stave as unknown as { getNoteStartX(): number }).getNoteStartX();
    const justifyWidth = Math.max(60, x + w - noteStartX - 14);
    for (const c of barChords) {
      if (c.chordName) {
        const beatFrac = c.startBeat / phrase.timeSig.num;
        const cx = noteStartX + beatFrac * justifyWidth;
        ctx.save();
        ctx.setFont("Georgia, 'Times New Roman', serif", 13, "bold italic");
        ctx.fillText(c.chordName, cx, 36 + yOffset);
        ctx.restore();
      }
    }

    const barNotes = (byMeasure.get(bar) ?? []).sort((a, b) => a.startSlot - b.startSlot);
    if (barNotes.length === 0) { barResults.push(null); continue; }

    const vfNotes: StaveNote[] = [];
    const noteSlotMap: number[] = [];
    const noteIdMap: string[] = [];
    const allTickables: (StaveNote | GhostNote)[] = [];
    let cursor = 0;

    for (const n of barNotes) {
      if (n.startSlot >= barTotalSlots) continue;

      if (n.startSlot > cursor) {
        addGhosts(allTickables, n.startSlot, cursor);
        cursor = n.startSlot;
      } else if (n.startSlot < cursor) {
        continue;
      }

      // Clamp duration to not overflow past barline
      const noteSlotCount = DURATION_SLOTS[n.duration] * (n.dotted ? 1.5 : 1);
      const slotsRemaining = barTotalSlots - cursor;
      let renderDur = n.duration;
      let renderDotted = n.dotted;
      let renderSlots = noteSlotCount;
      if (noteSlotCount > slotsRemaining && slotsRemaining > 0) {
        renderDotted = false;
        renderDur = "32";
        for (const [slots, dur] of SLOT_TO_DUR) {
          if (slots <= slotsRemaining) { renderDur = dur; renderSlots = slots; break; }
        }
      }

      const vfDur = DUR_TO_VF[renderDur] + (n.isRest ? "r" : "");
      const keys = n.isRest ? ["b/4"] : [pitchToVexKey(n.pitch)];
      const sn = new StaveNote({ keys, duration: vfDur, clef: "treble", auto_stem: true } as any);

      if (!n.isRest && n.accidental && n.accidental !== "n") {
        try { sn.addModifier(new (await_accidental())(n.accidental === "#" ? "#" : "b"), 0); } catch { /* */ }
      }
      if (renderDotted) {
        try { Dot.buildAndAttach([sn], { all: true }); } catch { /* */ }
      }

      if (!n.isRest && tensionsMap) {
        const t = tensionsMap.get(n.id);
        if (t) {
          const tAnn = new Annotation(t.label);
          tAnn.setVerticalJustification(Annotation.VerticalJustify.BOTTOM);
          tAnn.setFont("monospace", 9, "bold");
          annotColors.push({ color: t.color, type: "tension" });
          sn.addModifier(tAnn, 0);
        }
      }

      if (!n.isRest && solfegeMap) {
        const sol = solfegeMap.get(n.id);
        if (sol) {
          const solAnn = new Annotation(sol);
          solAnn.setVerticalJustification(Annotation.VerticalJustify.BOTTOM);
          solAnn.setFont("monospace", 9, "bold italic");
          annotColors.push({ color: "#6688cc", type: "solfege" });
          sn.addModifier(solAnn, 0);
        }
      }

      sn.setStyle({ fillStyle: "#ffffff", strokeStyle: "#ffffff" });
      try {
        const mods = (sn as unknown as { getModifiers(): Array<{ setStyle(s: object): void }> }).getModifiers();
        mods.forEach(mod => { try { mod.setStyle({ fillStyle: "#ffffff", strokeStyle: "#ffffff" }); } catch { } });
      } catch { /* */ }

      allTickables.push(sn);
      vfNotes.push(sn);
      noteSlotMap.push(n.startSlot);
      noteIdMap.push(n.id);
      cursor += renderSlots;

      if (n.isTieStart) {
        tieInfos.push({ first: sn, last: sn, fIdx: 0, lIdx: 0 });
      }
      if (n.isTieEnd && tieInfos.length > 0) {
        const last = tieInfos[tieInfos.length - 1];
        if (last) { last.last = sn; last.lIdx = 0; }
      }
    }

    // Fill remaining space with uniform ghost notes
    if (cursor < barTotalSlots) {
      addGhosts(allTickables, barTotalSlots, cursor);
    }

    const voice = new Voice({ numBeats: phrase.timeSig.num, beatValue: phrase.timeSig.den });
    (voice as unknown as { setMode(m: number): void }).setMode(2); // SOFT mode
    voice.addTickables(allTickables);

    try {
      const beatSlots = 32 / phrase.timeSig.den;

      // Create tuplets BEFORE formatting
      const tuplets: Tuplet[] = [];
      if (perBeat && TUPLET_SUBDIVS.has(perBeat)) {
        const notesOccupied = perBeat === 3 ? 2 : 4;
        const notesByBeat = new Map<number, StaveNote[]>();
        for (let ni = 0; ni < vfNotes.length; ni++) {
          const beat = Math.floor(noteSlotMap[ni] / beatSlots);
          const arr = notesByBeat.get(beat) ?? [];
          arr.push(vfNotes[ni]);
          notesByBeat.set(beat, arr);
        }
        for (const [, beatNotes] of notesByBeat) {
          if (beatNotes.length >= 2) {
            try {
              tuplets.push(new Tuplet(beatNotes, {
                numNotes: perBeat, notesOccupied,
                ratioed: false, bracketed: true, location: 1,
              }));
            } catch { /* skip */ }
          }
        }
      }

      const fmt = new Formatter();
      fmt.joinVoices([voice]);
      fmt.format([voice], justifyWidth);

      // Manual beam grouping by beat
      const beams: Beam[] = [];
      {
        let currentGroup: StaveNote[] = [];
        let currentBeat = -1;
        const flushGroup = () => {
          if (currentGroup.length > 1) {
            try {
              const bm = new Beam(currentGroup);
              const durations = currentGroup.map(n => n.getDuration());
              if (!durations.every(d => d === durations[0])) bm.renderOptions.flatBeams = true;
              beams.push(bm);
            } catch { /* skip */ }
          }
        };
        for (let ni = 0; ni < vfNotes.length; ni++) {
          const n = vfNotes[ni];
          const slot = noteSlotMap[ni];
          const beat = Math.floor(slot / beatSlots);
          const isBeamable = !n.isRest() && parseInt(n.getDuration(), 10) >= 8;
          if (isBeamable && beat === currentBeat) {
            currentGroup.push(n);
          } else {
            flushGroup();
            currentGroup = isBeamable ? [n] : [];
            currentBeat = beat;
          }
        }
        flushGroup();
      }

      voice.draw(ctx, stave);
      ctx.setStrokeStyle("#ffffff");
      ctx.setFillStyle("#ffffff");
      beams.forEach(b => { try { b.setContext(ctx).draw(); } catch { /* skip */ } });
      tuplets.forEach(t => { try { t.setContext(ctx).draw(); } catch { /* skip */ } });
    } catch { /* formatting errors */ }

    barResults.push({ vfNotes, noteSlotMap, noteIdMap });
  }

  // Draw ties
  for (const ti of tieInfos) {
    try {
      const tie = new StaveTie({ firstNote: ti.first, lastNote: ti.last, firstIndexes: [ti.fIdx], lastIndexes: [ti.lIdx] });
      tie.setContext(ctx).draw();
    } catch { /* */ }
  }

  // Clean up SVG: hide ghost-note bounding-box rects
  const svg = el.querySelector("svg");
  if (svg) {
    svg.querySelectorAll("rect").forEach(r => {
      const rw = parseFloat(r.getAttribute("width") ?? "0");
      const rh = parseFloat(r.getAttribute("height") ?? "0");
      if (rw === 0 || rh === 0) return;
      if (rw <= 3) return; // keep barlines
      r.style.visibility = "hidden";
    });
  }

  // Color annotations (tensions + solfege)
  if (svg && annotColors.length > 0) {
    const fnLabels = new Set(Object.values(FUNCTION_DISPLAY));
    const matchLabels = new Set([...fnLabels, ...SOLFEGE_ALL]);
    const allTexts = svg.querySelectorAll("text");
    let colorIdx = 0;
    allTexts.forEach(t => {
      const content = t.textContent?.trim() ?? "";
      if (matchLabels.has(content) && colorIdx < annotColors.length) {
        const entry = annotColors[colorIdx++];
        t.setAttribute("fill", entry.color);
        t.setAttribute("font-size", "9");
      }
    });
  }

  // Click targets — 80% of notehead area, cursor-positioned
  if (onNoteClick && svg) {
    for (const bd of barResults) {
      if (!bd) continue;
      for (let ni = 0; ni < bd.vfNotes.length; ni++) {
        const note = bd.vfNotes[ni];
        const noteId = bd.noteIdMap[ni];
        if (note.isRest()) continue;
        try {
          const ax = (note as unknown as { getAbsoluteX(): number }).getAbsoluteX();
          const bb = (note as unknown as {
            getBoundingBox(): { x: number; y: number; w: number; h: number };
          }).getBoundingBox();
          if (!bb) continue;
          // 80% of notehead — shrink by 10% on each side
          const scale = 0.8;
          const fullW = Math.max(bb.w, 20);
          const fullH = bb.h + 12;
          const hitW = fullW * scale;
          const hitH = fullH * scale;
          const hitX = (ax - 10) + (fullW - hitW) / 2;
          const hitY = (bb.y - 6) + (fullH - hitH) / 2;
          const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          rect.setAttribute("x", String(hitX));
          rect.setAttribute("y", String(hitY));
          rect.setAttribute("width", String(hitW));
          rect.setAttribute("height", String(hitH));
          rect.setAttribute("fill", "none");
          rect.setAttribute("stroke", "none");
          rect.setAttribute("pointer-events", "all");
          rect.style.cursor = "pointer";
          rect.addEventListener("click", (e) => {
            e.stopPropagation();
            onNoteClick({ noteId, clientX: e.clientX, clientY: e.clientY });
          });
          svg.appendChild(rect);
        } catch { /* skip */ }
      }
    }
  }
}

// VexFlow Accidental import helper
function await_accidental() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return (window as any).Vex?.Flow?.Accidental ?? class { constructor() {} };
}

// ── Component ───────────────────────────────────────────────────────────────

export default function PhraseDecomposition() {
  const [phrase, setPhrase] = useState<DecomposedPhrase | null>(() => loadPhrase());
  const [variation, setVariation] = useState<DecomposedPhrase | null>(null);
  const [restoreChoice, setRestoreChoice] = useState<{ original: DecomposedPhrase; modified: DecomposedPhrase } | null>(null);
  const scoreRef = useRef<HTMLDivElement>(null);

  // Note popup (cursor-positioned overlay)
  const [notePopup, setNotePopup] = useState<{ noteId: string; x: number; y: number } | null>(null);

  // Chord editing
  const [editingChordIdx, setEditingChordIdx] = useState<number | null>(null);
  const [chordInput, setChordInput] = useState("");
  const [addChordOpen, setAddChordOpen] = useState(false);
  const [addChordBar, setAddChordBar] = useState(0);
  const [addChordBeat, setAddChordBeat] = useState(0);

  // Rhythm
  type RhythmSubdiv = "eighth" | "triplet" | "sixteenth" | "quintuplet" | "sextuplet" | "septuplet" | "thirty-second";
  const [rhythmSubdiv, setRhythmSubdiv] = useState<RhythmSubdiv>("eighth");
  const [useRandomPerm, setUseRandomPerm] = useState(false);
  const [lockedBars, setLockedBars] = useState<Set<number>>(new Set());

  // Tension selection
  const [selectedTensions, setSelectedTensions] = useState<Set<string>>(new Set());

  // Demo
  const [showManualImport, setShowManualImport] = useState(false);

  // Solfege + Tensions display
  const [showSolfege, setShowSolfege] = useState(false);
  const [showTensions, setShowTensions] = useState(false);

  // Reinterpretation
  const [reinterp, setReinterp] = useState<ReinterpState>(DEFAULT_REINTERP);
  const [groupingAccents, setGroupingAccents] = useState<Set<number>>(new Set());


  // ── Active phrase ─────────────────────────────────────────────────────────
  const activePhrase = variation ?? phrase;

  // ── Solfege map ───────────────────────────────────────────────────────────
  const solfegeMap = useMemo(() => {
    if (!showSolfege || !activePhrase) return undefined;
    const map = new Map<string, string>();
    for (const n of activePhrase.notes) {
      if (n.isRest) continue;
      const chord = activePhrase.chords[n.activeChordIdx];
      map.set(n.id, noteSolfege(n, chord?.parsed ?? null));
    }
    return map;
  }, [showSolfege, activePhrase]);

  // ── Tensions map ──────────────────────────────────────────────────────────
  const CHORD_COLORS = [
    "#5599ff", "#e8a030", "#44cc66", "#cc55cc", "#55cccc",
    "#ff6666", "#aaaa44", "#ff88aa", "#88aaff", "#cc8844",
  ];
  const tensionsMap = useMemo(() => {
    if (!showTensions || !activePhrase) return undefined;
    const map = new Map<string, { label: string; color: string }>();
    for (const n of activePhrase.notes) {
      if (n.isRest) continue;
      const fn = n.chordFunction;
      const color = CHORD_COLORS[n.activeChordIdx % CHORD_COLORS.length];
      map.set(n.id, { label: FUNCTION_DISPLAY[fn], color });
    }
    return map;
  }, [showTensions, activePhrase]);

  // ── Persistence ─────────────────────────────────────────────────────────
  useEffect(() => { savePhrase(phrase); }, [phrase]);

  // ── Restore ─────────────────────────────────────────────────────────────
  useEffect(() => {
    // Check for transcription import first (from Quick Transcriptions Alt+Decompose)
    const importData = readPendingRestore<{
      notes: NoteData[]; barNumbers: number[]; timeSig: MeasureTimeSig; tempo?: number;
    }>("phrase_decomp_import");
    if (importData) {
      const imported = importFromTranscription(importData.notes, importData.barNumbers, importData.timeSig, importData.tempo);
      setPhrase(imported);
      setVariation(null);
      return;
    }
    // Otherwise check for practice log restore
    const data = readPendingRestore<Record<string, unknown>>("phrase_decomposition");
    if (data) {
      // New format: { original, modified }
      if (data.original && typeof data.original === "object" && "notes" in (data.original as Record<string, unknown>)) {
        const original = data.original as unknown as DecomposedPhrase;
        const modified = data.modified ? (data.modified as unknown as DecomposedPhrase) : null;
        if (modified) {
          // Both exist — show choice
          setRestoreChoice({ original, modified });
        } else {
          setPhrase(original);
          setVariation(null);
        }
      } else {
        // Legacy format: bare DecomposedPhrase
        setPhrase(data as unknown as DecomposedPhrase);
      }
      setShowSolfege(true);
      setShowTensions(true);
    }
  }, []);

  // ── Rhythm subdivision config ──────────────────────────────────────────
  const RHYTHM_SUBDIVS: { key: RhythmSubdiv; label: string; perBeat: number }[] = [
    { key: "eighth",        label: "eighth",      perBeat: 2 },
    { key: "triplet",       label: "triplet",     perBeat: 3 },
    { key: "sixteenth",     label: "sixteenth",   perBeat: 4 },
    { key: "quintuplet",    label: "quintuplet",  perBeat: 5 },
    { key: "sextuplet",     label: "sextuplet",   perBeat: 6 },
    { key: "septuplet",     label: "septuplet",   perBeat: 7 },
    { key: "thirty-second", label: "thirty-second", perBeat: 8 },
  ];

  // ── Click: toggle tie to previous note ────────────────────────────────
  const handleToggleTie = useCallback((noteId: string) => {
    const target = variation ?? phrase;
    if (!target) return;
    const setter = variation ? setVariation : setPhrase;

    setter((prev: DecomposedPhrase | null) => {
      if (!prev) return prev;
      const nonRest = prev.notes
        .filter(n => !n.isRest)
        .sort((a, b) => a.measure - b.measure || a.startSlot - b.startSlot);
      const clickedIdx = nonRest.findIndex(n => n.id === noteId);
      if (clickedIdx <= 0) return prev; // Can't tie the first note

      const clickedId = nonRest[clickedIdx].id;
      const prevId = nonRest[clickedIdx - 1].id;
      const wasTied = nonRest[clickedIdx].isTieEnd;

      return {
        ...prev,
        notes: prev.notes.map(n => {
          if (n.id === clickedId) return { ...n, isTieEnd: wasTied ? undefined : true };
          if (n.id === prevId) return { ...n, isTieStart: wasTied ? undefined : true };
          return n;
        }),
      };
    });
  }, [phrase, variation]);

  // ── Note click → open popup at cursor ─────────────────────────────────
  const scoreContainerRef = useRef<HTMLDivElement>(null);
  const handleNoteClick = useCallback((evt: NoteClickEvent) => {
    const container = scoreContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setNotePopup({
      noteId: evt.noteId,
      x: evt.clientX - rect.left + container.scrollLeft,
      y: evt.clientY - rect.top + container.scrollTop,
    });
  }, []);

  // ── Render notation ─────────────────────────────────────────────────────
  const currentPerBeat = RHYTHM_SUBDIVS.find(s => s.key === rhythmSubdiv)?.perBeat;
  useEffect(() => {
    if (!scoreRef.current || !activePhrase) return;
    renderPhraseNotation(scoreRef.current, activePhrase, currentPerBeat, handleNoteClick, solfegeMap, tensionsMap);
  }, [activePhrase, currentPerBeat, handleNoteClick, solfegeMap, tensionsMap]);

  // ── Single note: cycle tension ─────────────────────────────────────────
  const handleCycleTension = useCallback((noteId: string) => {
    const target = variation ?? phrase;
    if (!target) return;
    const setter = variation ? setVariation : setPhrase;
    setter((prev: DecomposedPhrase | null) => {
      if (!prev) return prev;
      const notes = prev.notes.map(n => {
        if (n.id !== noteId || n.isRest) return n;
        const chord = prev.chords[n.activeChordIdx];
        if (!chord?.parsed) return n;
        return randomTensionChange(n, chord.parsed, "stable");
      });
      return { ...prev, notes };
    });
  }, [phrase, variation]);

  // ── Chord assignment ──────────────────────────────────────────────────
  const handleAddChord = useCallback((measure: number, beat: number) => {
    if (!phrase) return;
    const newChord: ChordAssignment = {
      id: uid(), chordName: "", parsed: null,
      startMeasure: measure, startBeat: beat,
      endMeasure: phrase.barCount - 1, endBeat: phrase.timeSig.num,
    };
    setPhrase(prev => {
      if (!prev) return prev;
      const chords = [...prev.chords, newChord].sort((a, b) => a.startMeasure - b.startMeasure || a.startBeat - b.startBeat);
      return { ...prev, chords };
    });
    setEditingChordIdx(phrase.chords.length);
    setChordInput("");
  }, [phrase]);

  const handleSaveChord = useCallback((idx: number) => {
    if (!phrase) return;
    const parsed = parseChordName(chordInput);
    setPhrase(prev => {
      if (!prev) return prev;
      const chords = prev.chords.map((c, i) => i !== idx ? c : { ...c, chordName: chordInput, parsed });
      const sorted = [...chords].sort((a, b) => a.startMeasure - b.startMeasure || a.startBeat - b.startBeat);
      for (let i = 0; i < sorted.length; i++) {
        if (i < sorted.length - 1) {
          sorted[i].endMeasure = sorted[i + 1].startMeasure;
          sorted[i].endBeat = sorted[i + 1].startBeat;
        } else {
          sorted[i].endMeasure = prev.barCount - 1;
          sorted[i].endBeat = prev.timeSig.num;
        }
      }
      const beatSlots = prev.timeSig.den === 8 ? 4 : 8;
      const notes = prev.notes.map(n => {
        const beat = Math.floor(n.startSlot / beatSlots);
        let chordIdx = 0;
        for (let ci = sorted.length - 1; ci >= 0; ci--) {
          const c = sorted[ci];
          if (n.measure > c.startMeasure || (n.measure === c.startMeasure && beat >= c.startBeat)) { chordIdx = ci; break; }
        }
        const chord = sorted[chordIdx];
        const fn = chord?.parsed ? analyzeNoteFunction(n, chord.parsed) : "non-chord" as ChordFunction;
        return { ...n, activeChordIdx: chordIdx, chordFunction: fn };
      });
      return { ...prev, chords: sorted, notes };
    });
    setEditingChordIdx(null);
    setChordInput("");
  }, [phrase, chordInput]);

  const handleDeleteChord = useCallback((idx: number) => {
    setPhrase(prev => {
      if (!prev || prev.chords.length <= 1) return prev;
      return { ...prev, chords: prev.chords.filter((_, i) => i !== idx) };
    });
    setEditingChordIdx(null);
  }, []);

  // ── Tensions: alter selected ──────────────────────────────────────────
  const handleAlterTensions = useCallback(() => {
    const target = variation ?? phrase;
    if (!target) return;
    if (selectedTensions.size === 0) return;
    const setter = variation ? setVariation : setPhrase;
    setter((prev: DecomposedPhrase | null) => {
      if (!prev) return prev;
      const notes = prev.notes.map(n => {
        if (n.isRest || !selectedTensions.has(n.id)) return n;
        const chord = prev.chords[n.activeChordIdx];
        if (!chord?.parsed) return n;
        return randomTensionChange(n, chord.parsed, "stable");
      });
      return { ...prev, notes };
    });
  }, [phrase, variation, selectedTensions]);

  // ── Rhythm: subdivision ──────────────────────────────────────────────
  const handleApplySubdivision = useCallback(() => {
    const target = variation ?? phrase;
    if (!target) return;
    const setter = variation ? setVariation : setPhrase;
    const subdivInfo = RHYTHM_SUBDIVS.find(s => s.key === rhythmSubdiv);
    if (!subdivInfo) return;
    const perBeat = subdivInfo.perBeat;

    setter((prev: DecomposedPhrase | null) => {
      if (!prev) return prev;
      const slotsPerUnit = Math.round(8 / perBeat * perBeat) / perBeat;
      const slotsPerBeat = 8;
      const unitsPerBar = prev.timeSig.num * perBeat;
      const barSlots = measureSlots(prev.timeSig);
      const durMap: Record<number, Duration> = {
        2: "8", 3: "8", 4: "16", 5: "16", 6: "16", 7: "16", 8: "32",
      };
      const dur = durMap[perBeat] ?? "16";
      const allNotes = [...prev.notes]
        .filter(n => !n.isRest)
        .sort((a, b) => a.measure - b.measure || a.startSlot - b.startSlot);
      const result: DecomposedNote[] = [];
      let bar = 0;
      let unitInBar = 0;
      for (const src of allNotes) {
        if (unitInBar >= unitsPerBar) { bar++; unitInBar = 0; }
        const slot = Math.round(unitInBar * slotsPerBeat / perBeat);
        result.push({ ...src, id: uid(), duration: dur, dotted: false, startSlot: slot, measure: bar });
        unitInBar++;
      }
      const newBarCount = Math.max(bar + 1, 1);
      const updated: DecomposedPhrase = { ...prev, notes: result, barCount: newBarCount };
      updated.notes = analyzePhrase(updated);
      return updated;
    });
  }, [phrase, variation, rhythmSubdiv]);

  // ── Rhythm: random permutation ────────────────────────────────────────
  const handleRandomPermutation = useCallback(() => {
    const target = variation ?? phrase;
    if (!target) return;
    const setter = variation ? setVariation : setPhrase;
    const subdivInfo = RHYTHM_SUBDIVS.find(s => s.key === rhythmSubdiv);
    if (!subdivInfo) return;
    const perBeat = subdivInfo.perBeat;
    const perms = SUBDIVISION_PERMUTATIONS[perBeat as SubdivisionN];
    if (!perms || perms.length === 0) return;

    setter((prev: DecomposedPhrase | null) => {
      if (!prev) return prev;
      const slotsPerBeat = 8;
      const beatsPerBar = prev.timeSig.num;
      const allNotes = [...prev.notes]
        .filter(n => !n.isRest)
        .sort((a, b) => a.measure - b.measure || a.startSlot - b.startSlot);
      const result: DecomposedNote[] = [];
      let noteIdx = 0;
      let bar = 0;
      let beat = 0;
      while (noteIdx < allNotes.length) {
        const perm = perms[Math.floor(Math.random() * perms.length)];
        let slotCursor = 0;
        for (const group of perm) {
          for (const entry of group.notes) {
            const rawDur = entry.dur as Duration;
            const dotted = !!entry.dots;
            // partToNoteEntries uses 16th-note-based durations; remap for
            // triplets (need 8th-based) and thirty-seconds (need 32nd-based)
            const DUR_UP: Record<string, Duration> = { "32": "16", "16": "8", "8": "q", "q": "h", "h": "w" };
            const DUR_DN: Record<string, Duration> = { "w": "h", "h": "q", "q": "8", "8": "16", "16": "32" };
            const dur: Duration = perBeat === 3 ? (DUR_UP[rawDur] ?? rawDur)
              : perBeat === 8 ? (DUR_DN[rawDur] ?? rawDur)
              : rawDur;
            // Slot calculation uses original (unshifted) durations for beat-relative positioning
            const baseSlots = DURATION_SLOTS[rawDur] ?? 2;
            const entrySlots = dotted ? baseSlots * 1.5 : baseSlots;
            if (!entry.tie && noteIdx < allNotes.length) {
              const src = allNotes[noteIdx++];
              result.push({
                ...src, id: uid(), duration: dur, dotted: dotted || undefined,
                startSlot: beat * slotsPerBeat + Math.round(slotCursor), measure: bar,
              });
            }
            slotCursor += entrySlots;
          }
        }
        beat++;
        if (beat >= beatsPerBar) { beat = 0; bar++; }
      }
      const newBarCount = Math.max(bar + (beat > 0 ? 1 : 0), 1);
      const updated: DecomposedPhrase = { ...prev, notes: result, barCount: newBarCount };
      updated.notes = analyzePhrase(updated);
      return updated;
    });
  }, [phrase, variation, rhythmSubdiv]);

  // ── Reset / clear ─────────────────────────────────────────────────────
  const handleResetVariation = useCallback(() => { setVariation(null); setGroupingAccents(new Set()); }, []);
  const handleClear = useCallback(() => { setPhrase(null); setVariation(null); setGroupingAccents(new Set()); }, []);
  const toggleBarLock = useCallback((bar: number) => {
    setLockedBars(prev => { const n = new Set(prev); if (n.has(bar)) n.delete(bar); else n.add(bar); return n; });
  }, []);

  // ── Apply reinterpretation ──────────────────────────────────────────────
  const handleApplyOp = useCallback((op: ReinterpretationOp) => {
    const target = variation ?? phrase;
    if (!target) return;
    let result: DecomposedPhrase | null = null;

    switch (op) {
      case "diatonicTranspose":
        result = diatonicTranspose(target, reinterp.diatonicSteps, reinterp.scaleOverride, lockedBars);
        break;
      case "chromaticTranspose":
        result = chromaticTranspose(target, reinterp.chromaticSemitones, lockedBars);
        break;
      case "sequence":
        result = sequencePhrase(target, reinterp.seqCount, reinterp.seqInterval, reinterp.seqType, reinterp.scaleOverride);
        break;
      case "intervalTransform":
        result = transformIntervals(target, reinterp.intervalMode, reinterp.intervalFactor, lockedBars);
        break;
      case "contourPreserve":
        result = contourPreserve(target, reinterp.scaleOverride, lockedBars);
        break;
      case "chordToneShift":
        result = chordToneTargetShift(target, reinterp.targetFunctions, lockedBars);
        break;
      case "scaleReinterpret":
        result = scaleReinterpret(target, reinterp.scaleOverride, lockedBars);
        break;
      case "reharmonize":
        result = reharmonize(target, reinterp.reharmMode);
        break;
      case "insertNotes":
        result = insertNotes(target, reinterp.insertMode, reinterp.scaleOverride);
        break;
      case "simplify":
        result = simplifyPhrase(target, reinterp.simplifyMode, lockedBars);
        break;
      case "fragment":
        result = fragmentPhrase(target, reinterp.fragmentMode, reinterp.fragmentLength);
        break;
      case "rotate":
        result = rotatePhrase(target, reinterp.rotateSteps);
        break;
      case "reverse":
        result = reversePhrase(target);
        break;
      case "registerShift":
        result = registerShift(target, reinterp.registerMode, reinterp.registerOctaves, lockedBars);
        break;
      case "grouping": {
        const groups = GROUPING_PRESETS.find(g => g.key === reinterp.groupingPattern)?.groups ?? [2, 2, 2, 2];
        const nonRest = target.notes
          .filter(n => !n.isRest)
          .sort((a, b) => a.measure - b.measure || a.startSlot - b.startSlot);
        const accentSet = computeGroupingAccents(nonRest.length, groups);

        // Build sets of note IDs that need tie flags (skip index 0)
        const tieEndIds = new Set<string>();
        const tieStartIds = new Set<string>();
        nonRest.forEach((n, i) => {
          if (i > 0 && accentSet.has(i)) {
            tieEndIds.add(n.id);
            tieStartIds.add(nonRest[i - 1].id);
          }
        });

        result = {
          ...target,
          notes: target.notes.map(n => {
            const cleared = { ...n, isTieStart: undefined, isTieEnd: undefined };
            if (tieEndIds.has(n.id)) return { ...cleared, isTieEnd: true };
            if (tieStartIds.has(n.id)) return { ...cleared, isTieStart: true };
            return cleared;
          }),
        };
        setGroupingAccents(accentSet);
        break;
      }
      case "targetBeatShift":
        result = targetBeatShift(target, lockedBars);
        break;
      case "approachNotes":
        result = addApproachNotes(target, reinterp.approachMode, reinterp.scaleOverride);
        break;
      case "motivicDev":
        result = motivicDevelopment(target, reinterp.motifLength, reinterp.motifTransform, reinterp.motifRepeats, reinterp.scaleOverride);
        break;
      case "density":
        result = changeDensity(target, reinterp.densityMode, reinterp.scaleOverride, lockedBars);
        break;
      case "stylePreset":
        result = applyStylePreset(target, reinterp.stylePreset);
        break;
    }

    if (result) setVariation(result);
  }, [phrase, variation, reinterp, lockedBars]);

  // ── Helper: set reinterp param ─────────────────────────────────────────
  const rSet = useCallback(<K extends keyof ReinterpState>(key: K, val: ReinterpState[K]) => {
    setReinterp(prev => ({ ...prev, [key]: val }));
  }, []);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1152, margin: "0 auto", padding: 16 }} className="pd-root">
      <style>{`.pd-root > * { margin-bottom: 14px; } .pd-root > *:last-child { margin-bottom: 0; }`}</style>
      {/* Practice Log — at the top */}
      {phrase && (
        <PracticeLogSaveBar
          mode="phrase-decomposition"
          label="Phrase Decomposition"
          getSnapshot={() => {
            const ap = variation ?? phrase;
            const noteNames = ap!.notes.filter(n => !n.isRest).map(n => n.pitch.replace("/", "")).join(" ");
            const chordNames = ap!.chords.map(c => c.chordName).join(" → ");
            const preview = `${ap!.barCount} bar${ap!.barCount !== 1 ? "s" : ""} · ${chordNames || "no chords"}${noteNames ? ` · ${noteNames}` : ""}`;
            const snap: Record<string, unknown> = {
              original: phrase as unknown as Record<string, unknown>,
              modified: variation ? (variation as unknown as Record<string, unknown>) : null,
            };
            return { preview, snapshot: snap, canRestore: true };
          }}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#ccc", letterSpacing: 1 }}>PHRASE DECOMPOSITION</span>
        {phrase && <button onClick={handleClear} style={pillBtn("#333", "#888")}>Clear</button>}
        {variation && <button onClick={handleResetVariation} style={pillBtn("#c8aa5044", "#c8aa50")}>Reset to Original</button>}
        {phrase && (
          <button onClick={() => setShowTensions(v => !v)}
            style={pillBtn(showTensions ? "#22aa44" : "#333", showTensions ? "#22aa44" : "#555")}>
            Tensions {showTensions ? "ON" : "OFF"}
          </button>
        )}
        {phrase && (
          <button onClick={() => setShowSolfege(v => !v)}
            style={pillBtn(showSolfege ? "#6688cc" : "#333", showSolfege ? "#6688cc" : "#555")}>
            Solfege {showSolfege ? "ON" : "OFF"}
          </button>
        )}
      </div>

      {/* Restore choice: pick original or modified */}
      {restoreChoice && (
        <div style={{
          padding: 16, background: "#111", borderRadius: 10, border: "1px solid #2a2a2a",
          display: "flex", flexDirection: "column", gap: 10, alignItems: "center",
        }}>
          <span style={{ fontSize: 12, color: "#999" }}>This entry has both original and modified phrases. Which would you like to load?</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => {
                setPhrase(restoreChoice.original);
                setVariation(null);
                setRestoreChoice(null);
              }}
              style={pillBtn("#333", "#6688cc")}
            >
              Original
            </button>
            <button
              onClick={() => {
                setPhrase(restoreChoice.original);
                setVariation(restoreChoice.modified);
                setRestoreChoice(null);
              }}
              style={pillBtn("#333", "#c8aa50")}
            >
              Modified
            </button>
            <button
              onClick={() => setRestoreChoice(null)}
              style={pillBtn("#222", "#555")}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!phrase ? (
        <div style={{
          padding: 40, textAlign: "center", color: "#333", fontSize: 12,
          background: "#0a0a0a", borderRadius: 10, border: "1px solid #1a1a1a",
          display: "flex", flexDirection: "column", gap: 16, alignItems: "center",
        }}>
          <span style={{ fontSize: 13, color: "#555" }}>No phrase loaded</span>
          <span style={{ fontSize: 11, color: "#444" }}>
            Hold ALT and click bars in Quick Transcriptions, then click "Decompose"
          </span>
          <button onClick={() => setShowManualImport(!showManualImport)} style={pillBtn("#333", "#888")}>Create Demo Phrase</button>
          {showManualImport && (
            <button onClick={() => {
              const demoNotes: NoteData[] = [
                { id: "d1", measure: 0, startSlot: 0,  duration: "q", pitch: "c/4", isRest: false },
                { id: "d2", measure: 0, startSlot: 8,  duration: "q", pitch: "d/4", isRest: false },
                { id: "d3", measure: 0, startSlot: 16, duration: "q", pitch: "e/4", isRest: false },
                { id: "d4", measure: 0, startSlot: 24, duration: "q", pitch: "f/4", isRest: false },
                { id: "d5", measure: 1, startSlot: 0,  duration: "q", pitch: "g/4", isRest: false },
                { id: "d6", measure: 1, startSlot: 8,  duration: "8", pitch: "a/4", isRest: false },
                { id: "d7", measure: 1, startSlot: 12, duration: "8", pitch: "b/4", isRest: false },
                { id: "d8", measure: 1, startSlot: 16, duration: "q", pitch: "c/5", isRest: false },
                { id: "d9", measure: 1, startSlot: 24, duration: "q", pitch: "d/5", isRest: false },
              ];
              setPhrase(importFromTranscription(demoNotes, [0, 1], { num: 4, den: 4 }, 120));
              setShowManualImport(false);
            }} style={pillBtn("#c8aa50", "#c8aa50")}>Load C Scale (2 bars)</button>
          )}
        </div>
      ) : (
        <>
          {/* ── Notation (sticky) ── */}
          <div
            ref={scoreContainerRef}
            onClick={() => setNotePopup(null)}
            style={{
              position: "sticky", top: 0, zIndex: 10,
              background: "#0a0a0a", borderRadius: 10, border: "1px solid #1a1a1a", padding: 12,
            }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 1 }}>NOTATION</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <div ref={scoreRef} style={{ display: "block", lineHeight: 0 }} />
            </div>

            {/* ── Note popup at cursor position ── */}
            {notePopup && (() => {
              const note = activePhrase?.notes.find(n => n.id === notePopup.noteId);
              if (!note || note.isRest) return null;
              const chord = activePhrase?.chords[note.activeChordIdx];
              const fn = note.chordFunction;
              const cat = chord?.parsed ? tensionCategory(fn, chord.parsed.quality) : "avoid";
              const fnColor = cat === "stable" ? "#22aa44" : "#cc4444";
              return (
                <div
                  onClick={e => e.stopPropagation()}
                  style={{
                    position: "absolute",
                    left: notePopup.x,
                    top: notePopup.y - 8,
                    zIndex: 30,
                    transform: "translateY(-100%)",
                    pointerEvents: "all",
                  }}
                >
                  <div style={{
                    background: "#161616", border: "1px solid #333", borderRadius: 8,
                    padding: "6px 10px", boxShadow: "0 4px 16px #000a",
                    display: "flex", flexDirection: "column", gap: 5, minWidth: 140,
                  }}>
                    {/* Note label */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#9999ee", fontFamily: "monospace" }}>
                        {note.pitch.replace(/^[a-g]/, c => c.toUpperCase())}
                      </span>
                      <span style={{ fontSize: 9, color: fnColor, fontWeight: 600 }}>
                        {FUNCTION_DISPLAY[fn]}
                      </span>
                    </div>
                    {/* Actions */}
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <button
                        onClick={() => { handleCycleTension(notePopup.noteId); setNotePopup(null); }}
                        style={pillBtn("#c8aa5044", "#c8aa50", 9)}
                      >Cycle Tension</button>
                      <button
                        onClick={() => { handleToggleTie(notePopup.noteId); setNotePopup(null); }}
                        style={pillBtn("#9090e044", "#9090e0", 9)}
                      >Toggle Tie</button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── Controls ── */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>

            {/* ── Chords ── */}
            <ControlPanel title="CHORDS">
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                {phrase.chords.map((chord, ci) => (
                  <div key={chord.id} style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "3px 8px", borderRadius: 4,
                    border: `1px solid ${chord.parsed ? "#c8aa5044" : "#222"}`,
                    background: chord.parsed ? "#c8aa5010" : "#0e0e0e",
                  }}>
                    {editingChordIdx === ci ? (
                      <div style={{ display: "flex", gap: 3 }}>
                        <input value={chordInput} onChange={e => setChordInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleSaveChord(ci); if (e.key === "Escape") setEditingChordIdx(null); }}
                          placeholder="Cmaj7" autoFocus
                          style={{ width: 70, padding: "1px 4px", borderRadius: 3, fontSize: 10, border: "1px solid #c8aa50", background: "#111", color: "#ccc", outline: "none" }}
                        />
                        <button onClick={() => handleSaveChord(ci)} style={pillBtn("#60c0a0", "#60c0a0", 8)}>OK</button>
                      </div>
                    ) : (
                      <>
                        <span onClick={() => { setEditingChordIdx(ci); setChordInput(chord.chordName); }}
                          style={{ fontSize: 11, fontWeight: 700, cursor: "pointer", color: chord.parsed ? "#ccc" : "#555" }}>
                          {chord.chordName || "(set)"}
                        </span>
                        <span style={{ fontSize: 7, color: "#444" }}>bar {chord.startMeasure + 1}{chord.startBeat > 0 ? ` beat ${chord.startBeat + 1}` : ""}</span>
                        {phrase.chords.length > 1 && (
                          <button onClick={() => handleDeleteChord(ci)} style={{ ...pillBtn("#333", "#555", 7), padding: "0 3px" }}>x</button>
                        )}
                      </>
                    )}
                  </div>
                ))}
                {addChordOpen ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 4, border: "1px solid #c8aa5044", background: "#0e0e0e" }}>
                    <label style={{ fontSize: 9, color: "#666" }}>bar</label>
                    <select value={addChordBar} onChange={e => setAddChordBar(Number(e.target.value))}
                      style={{ fontSize: 10, padding: "1px 2px", borderRadius: 3, background: "#111", color: "#ccc", border: "1px solid #333", outline: "none" }}>
                      {Array.from({ length: phrase.barCount }, (_, i) => (
                        <option key={i} value={i}>{i + 1}</option>
                      ))}
                    </select>
                    <label style={{ fontSize: 9, color: "#666" }}>beat</label>
                    <select value={addChordBeat} onChange={e => setAddChordBeat(Number(e.target.value))}
                      style={{ fontSize: 10, padding: "1px 2px", borderRadius: 3, background: "#111", color: "#ccc", border: "1px solid #333", outline: "none" }}>
                      {Array.from({ length: phrase.timeSig.num }, (_, i) => (
                        <option key={i} value={i}>{i + 1}</option>
                      ))}
                    </select>
                    <button onClick={() => { handleAddChord(addChordBar, addChordBeat); setAddChordOpen(false); setAddChordBar(0); setAddChordBeat(0); }}
                      style={pillBtn("#60c0a0", "#60c0a0", 8)}>OK</button>
                    <button onClick={() => setAddChordOpen(false)} style={pillBtn("#333", "#555", 8)}>x</button>
                  </div>
                ) : (
                  <button onClick={() => setAddChordOpen(true)} style={pillBtn("#333", "#888")}>+ Add</button>
                )}
              </div>
            </ControlPanel>

            {/* ── Reinterpretation title ── */}
            <div style={{ flex: "1 1 100%", paddingTop: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#666", letterSpacing: 1.5 }}>REINTERPRETATION</span>
            </div>

            {/* ── Reinterpretation Categories ── */}
            {REINTERP_CATEGORIES.map(cat => {
              return (
              <div key={cat.title} style={{
                flex: "1 1 100%", background: "#111", borderRadius: 12,
                border: "1px solid #1a1a1a", padding: 14,
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: cat.color, fontWeight: 700, letterSpacing: 1.5 }}>
                    {cat.title}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>

                  {/* ── PITCH: Tensions bubble ── */}
                  {cat.title === "PITCH" && (
                    <div style={{
                      flex: "1 1 280px", minWidth: 240,
                      background: "#0a0a0a", borderRadius: 8,
                      border: "1px solid #1a1a1a", padding: 10,
                      display: "flex", flexDirection: "column", gap: 6,
                    }}>
                      <span style={{ fontSize: 10, color: "#888", fontWeight: 700 }}>Alter Tensions</span>
                      <span style={noteSt}>{OP_NOTES._tensions}</span>
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                        {(() => {
                          const nonRest = (activePhrase?.notes ?? []).filter(n => !n.isRest);
                          const fnGroups = new Map<string, { fn: ChordFunction; noteIds: string[]; color: string }>();
                          for (const note of nonRest) {
                            const fn = note.chordFunction;
                            const key = fn as string;
                            if (!fnGroups.has(key)) {
                              const chord = activePhrase!.chords[note.activeChordIdx];
                              const ct = chord?.parsed ? tensionCategory(fn, chord.parsed.quality) : "avoid";
                              const color = ct === "stable" ? "#22aa44" : "#cc4444";
                              fnGroups.set(key, { fn, noteIds: [], color });
                            }
                            fnGroups.get(key)!.noteIds.push(note.id);
                          }
                          const TENSION_ORDER: ChordFunction[] = [
                            "root","b9","9","#9","b3","3","11","#11",
                            "b5","5","#5","b13","13","b7","7","non-chord",
                          ];
                          return Array.from(fnGroups.values())
                            .sort((a, b) => TENSION_ORDER.indexOf(a.fn) - TENSION_ORDER.indexOf(b.fn))
                            .map(({ fn, noteIds, color }) => {
                            const isSel = noteIds.some(id => selectedTensions.has(id));
                            return (
                              <button
                                key={fn}
                                onClick={() => setSelectedTensions(prev => {
                                  const next = new Set(prev);
                                  if (isSel) { noteIds.forEach(id => next.delete(id)); }
                                  else { noteIds.forEach(id => next.add(id)); }
                                  return next;
                                })}
                                style={{
                                  padding: "4px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                                  fontFamily: "monospace", minWidth: 32, textAlign: "center" as const,
                                  border: `1.5px solid ${isSel ? color : "#555"}`,
                                  background: isSel ? `${color}30` : "#111",
                                  color: isSel ? color : "#888",
                                  cursor: "pointer",
                                }}>
                                {FUNCTION_DISPLAY[fn]}
                              </button>
                            );
                          });
                        })()}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => {
                          const allIds = (activePhrase?.notes ?? []).filter(n => !n.isRest).map(n => n.id);
                          setSelectedTensions(prev => prev.size === allIds.length ? new Set() : new Set(allIds));
                        }} style={pillBtn("#333", "#888")}>
                          {selectedTensions.size === (activePhrase?.notes.filter(n => !n.isRest).length ?? 0) ? "Deselect All" : "Select All"}
                        </button>
                        <button onClick={handleAlterTensions} style={pillBtn(cat.color, cat.color)}>
                          Alter Selected
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── RHYTHM: Subdivision + Permutation bubble ── */}
                  {cat.title === "RHYTHM" && (
                    <div style={{
                      flex: "1 1 280px", minWidth: 240,
                      background: "#0a0a0a", borderRadius: 8,
                      border: "1px solid #1a1a1a", padding: 10,
                      display: "flex", flexDirection: "column", gap: 6,
                    }}>
                      <span style={{ fontSize: 10, color: "#888", fontWeight: 700 }}>Subdivision / Permutation</span>
                      <span style={noteSt}>{OP_NOTES._subdivision}</span>
                      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                        {RHYTHM_SUBDIVS.map(s => (
                          <button key={s.key} onClick={() => setRhythmSubdiv(s.key)} style={pillBtn(
                            rhythmSubdiv === s.key ? "#9090e0" : "#222",
                            rhythmSubdiv === s.key ? "#9090e0" : "#555",
                          )}>{s.label}</button>
                        ))}
                      </div>
                      <button
                        onClick={() => setUseRandomPerm(p => !p)}
                        style={pillBtn(
                          useRandomPerm ? "#9090e0" : "#222",
                          useRandomPerm ? "#9090e0" : "#555",
                        )}>
                        Random Permutation {useRandomPerm ? "ON" : "OFF"}
                      </button>
                      <button
                        onClick={useRandomPerm ? handleRandomPermutation : handleApplySubdivision}
                        style={pillBtn(cat.color, cat.color)}>
                        Apply
                      </button>
                    </div>
                  )}

                  {/* ── Auto-generated operation bubbles ── */}
                  {cat.ops.map(opKey => {
                    const opInfo = REINTERPRETATION_OPS.find(o => o.key === opKey);
                    if (!opInfo) return null;
                    return (
                      <div key={opKey} style={{
                        flex: "1 1 280px", minWidth: 240,
                        background: "#0a0a0a", borderRadius: 8,
                        border: "1px solid #1a1a1a", padding: 10,
                        display: "flex", flexDirection: "column", gap: 6,
                      }}>
                        <span style={{ fontSize: 10, color: "#888", fontWeight: 700 }}>
                          {opInfo.label}
                        </span>
                        {OP_NOTES[opKey] && <span style={noteSt}>{OP_NOTES[opKey]}</span>}
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                          <ReinterpControls state={reinterp} rSet={rSet} op={opKey} />
                        </div>
                        <button
                          onClick={() => handleApplyOp(opKey)}
                          style={pillBtn(cat.color, cat.color)}
                        >
                          Apply
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
            })}
          </div>
        </>
      )}

    </div>
  );
}

// ── Reinterpretation operation controls ─────────────────────────────────────

function ReinterpControls({
  state,
  rSet,
  op,
}: {
  state: ReinterpState;
  rSet: <K extends keyof ReinterpState>(key: K, val: ReinterpState[K]) => void;
  op: ReinterpretationOp;
}) {
  const stepButtons = (values: number[], current: number, key: keyof ReinterpState) => (
    <>
      {values.map(n => (
        <button key={n} onClick={() => rSet(key, n as any)}
          style={pillBtn(current === n ? "#c8aa50" : "#222", current === n ? "#c8aa50" : "#555")}>
          {n > 0 ? `+${n}` : `${n}`}
        </button>
      ))}
    </>
  );

  const scaleSelect = (key: keyof ReinterpState = "scaleOverride") => (
    <select value={state[key] as string} onChange={e => rSet(key, e.target.value as any)} style={selectStyle}>
      {SCALE_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  );

  const numInput = (value: number, key: keyof ReinterpState, min = 1, max = 12) => (
    <input type="number" value={value} min={min} max={max}
      onChange={e => rSet(key, parseInt(e.target.value) || 1 as any)}
      style={{ width: 44, padding: "1px 4px", borderRadius: 3, fontSize: 10, border: "1px solid #333", background: "#111", color: "#ccc" }}
    />
  );

  switch (op) {
    case "diatonicTranspose":
      return <>
        <span style={labelSt}>Steps:</span>
        {stepButtons([-3, -2, -1, 1, 2, 3], state.diatonicSteps, "diatonicSteps")}
        {scaleSelect()}
      </>;

    case "chromaticTranspose":
      return <>
        <span style={labelSt}>Semitones:</span>
        {stepButtons([-6, -3, -1, 1, 3, 6], state.chromaticSemitones, "chromaticSemitones")}
      </>;

    case "sequence":
      return <>
        <span style={labelSt}>Reps:</span>
        {numInput(state.seqCount, "seqCount")}
        <span style={labelSt}>Interval:</span>
        {numInput(state.seqInterval, "seqInterval", -7, 7)}
        <span style={labelSt}>Type:</span>
        {(["diatonic", "chromatic"] as SequenceType[]).map(t => (
          <button key={t} onClick={() => rSet("seqType", t)}
            style={pillBtn(state.seqType === t ? "#9999ee" : "#222", state.seqType === t ? "#9999ee" : "#555")}>{t}</button>
        ))}
        {scaleSelect()}
      </>;

    case "intervalTransform":
      return <>
        <span style={labelSt}>Mode:</span>
        {(["expand", "compress", "invert", "mirror"] as IntervalMode[]).map(m => (
          <button key={m} onClick={() => rSet("intervalMode", m)}
            style={pillBtn(state.intervalMode === m ? "#9999ee" : "#222", state.intervalMode === m ? "#9999ee" : "#555")}>{m}</button>
        ))}
        {(state.intervalMode === "expand" || state.intervalMode === "compress") && <>
          <span style={labelSt}>Factor:</span>
          {[1.5, 2, 3].map(f => (
            <button key={f} onClick={() => rSet("intervalFactor", f)}
              style={pillBtn(state.intervalFactor === f ? "#c8aa50" : "#222", state.intervalFactor === f ? "#c8aa50" : "#555")}>{f}x</button>
          ))}
        </>}
      </>;

    case "contourPreserve":
      return <>{scaleSelect()}</>;

    case "chordToneShift":
      return <>
        <span style={labelSt}>Targets:</span>
        {(["root", "3", "5", "7", "9", "11", "13", "b7", "#11"] as ChordFunction[]).map(fn => {
          const active = state.targetFunctions.includes(fn);
          return (
            <button key={fn}
              onClick={() => rSet("targetFunctions",
                active ? state.targetFunctions.filter(f => f !== fn) : [...state.targetFunctions, fn]
              )}
              style={pillBtn(active ? "#60c0a0" : "#222", active ? "#60c0a0" : "#555")}>{fn}</button>
          );
        })}
      </>;

    case "scaleReinterpret":
      return <>{scaleSelect()}</>;

    case "reharmonize":
      return <>
        {(Object.entries(REHARM_DISPLAY) as [ReharmMode, string][]).map(([k, label]) => (
          <button key={k} onClick={() => rSet("reharmMode", k)}
            style={pillBtn(state.reharmMode === k ? "#9999ee" : "#222", state.reharmMode === k ? "#9999ee" : "#555")}>{label}</button>
        ))}
      </>;

    case "insertNotes":
      return <>
        {(["diatonicPassing", "chromaticPassing", "enclosure", "doubleChromatic"] as InsertMode[]).map(m => (
          <button key={m} onClick={() => rSet("insertMode", m)}
            style={pillBtn(state.insertMode === m ? "#9999ee" : "#222", state.insertMode === m ? "#9999ee" : "#555")}>
            {m.replace(/([A-Z])/g, " $1").trim()}
          </button>
        ))}
        {scaleSelect()}
      </>;

    case "approachNotes":
      return <>
        {(["above", "below", "enclosure", "doubleChromatic", "diatonic"] as ApproachMode[]).map(m => (
          <button key={m} onClick={() => rSet("approachMode", m)}
            style={pillBtn(state.approachMode === m ? "#9999ee" : "#222", state.approachMode === m ? "#9999ee" : "#555")}>{m}</button>
        ))}
        {scaleSelect()}
      </>;

    case "simplify":
      return <>
        {(["nonChordTones", "everyOther", "weakBeats"] as SimplifyMode[]).map(m => (
          <button key={m} onClick={() => rSet("simplifyMode", m)}
            style={pillBtn(state.simplifyMode === m ? "#9999ee" : "#222", state.simplifyMode === m ? "#9999ee" : "#555")}>
            {m === "nonChordTones" ? "Keep Chord Tones" : m === "everyOther" ? "Every Other" : "Strong Beats"}
          </button>
        ))}
      </>;

    case "fragment":
      return <>
        {(["firstN", "lastN", "random", "perBar", "perBeat"] as FragmentMode[]).map(m => (
          <button key={m} onClick={() => rSet("fragmentMode", m)}
            style={pillBtn(state.fragmentMode === m ? "#9999ee" : "#222", state.fragmentMode === m ? "#9999ee" : "#555")}>{m}</button>
        ))}
        <span style={labelSt}>N:</span>
        {numInput(state.fragmentLength, "fragmentLength")}
      </>;

    case "rotate":
      return <>
        <span style={labelSt}>Steps:</span>
        {stepButtons([-3, -2, -1, 1, 2, 3], state.rotateSteps, "rotateSteps")}
      </>;

    case "reverse":
      return <span style={{ fontSize: 10, color: "#555" }}>Reverses pitch order, preserves rhythm</span>;

    case "registerShift":
      return <>
        {(["shiftAll", "random", "spread", "compress"] as RegisterMode[]).map(m => (
          <button key={m} onClick={() => rSet("registerMode", m)}
            style={pillBtn(state.registerMode === m ? "#9999ee" : "#222", state.registerMode === m ? "#9999ee" : "#555")}>{m}</button>
        ))}
        {state.registerMode === "shiftAll" && <>
          <span style={labelSt}>Oct:</span>
          {stepButtons([-2, -1, 1, 2], state.registerOctaves, "registerOctaves")}
        </>}
      </>;

    case "grouping":
      return <>
        {GROUPING_PRESETS.map(g => (
          <button key={g.key} onClick={() => rSet("groupingPattern", g.key)}
            style={pillBtn(state.groupingPattern === g.key ? "#9999ee" : "#222", state.groupingPattern === g.key ? "#9999ee" : "#555")}>{g.label}</button>
        ))}
      </>;

    case "targetBeatShift":
      return <span style={{ fontSize: 10, color: "#555" }}>Moves chord tones to strong beats</span>;

    case "motivicDev":
      return <>
        <span style={labelSt}>Motif:</span>
        {numInput(state.motifLength, "motifLength")}
        <span style={labelSt}>Transform:</span>
        {(["sequence", "invert", "transpose", "augment", "diminish"] as MotifTransform[]).map(t => (
          <button key={t} onClick={() => rSet("motifTransform", t)}
            style={pillBtn(state.motifTransform === t ? "#9999ee" : "#222", state.motifTransform === t ? "#9999ee" : "#555")}>{t}</button>
        ))}
        <span style={labelSt}>Reps:</span>
        {numInput(state.motifRepeats, "motifRepeats")}
        {scaleSelect()}
      </>;

    case "density":
      return <>
        {(["double", "half", "fill", "sparse"] as DensityMode[]).map(m => (
          <button key={m} onClick={() => rSet("densityMode", m)}
            style={pillBtn(state.densityMode === m ? "#9999ee" : "#222", state.densityMode === m ? "#9999ee" : "#555")}>{m}</button>
        ))}
        {scaleSelect()}
      </>;

    case "stylePreset":
      return <>
        {(Object.entries(STYLE_PRESET_DISPLAY) as [StylePreset, string][]).map(([k, label]) => (
          <button key={k} onClick={() => rSet("stylePreset", k)}
            style={pillBtn(state.stylePreset === k ? "#c8aa50" : "#222", state.stylePreset === k ? "#c8aa50" : "#555")}>{label}</button>
        ))}
      </>;
  }
}

// ── Shared UI ───────────────────────────────────────────────────────────────

function pillBtn(borderColor: string, textColor: string, fontSize = 10): React.CSSProperties {
  return {
    padding: "2px 10px", borderRadius: 4, fontSize, fontWeight: 700,
    border: `1px solid ${borderColor}`, background: "#111", color: textColor,
    cursor: "pointer", transition: "all 60ms",
  };
}

const selectStyle: React.CSSProperties = {
  padding: "3px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
  border: "1px solid #333", background: "#111", color: "#ccc",
  cursor: "pointer", maxWidth: 200,
};

const labelSt: React.CSSProperties = {
  fontSize: 9, color: "#555", fontWeight: 700, letterSpacing: 0.5,
};

const noteSt: React.CSSProperties = {
  fontSize: 9, color: "#444", fontStyle: "italic", lineHeight: 1.3,
};

function ControlPanel({ title, children }: {
  title: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      flex: "1 1 340px", background: "#0a0a0a", borderRadius: 10, border: "1px solid #1a1a1a",
      padding: 12, display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "#555", fontWeight: 700, letterSpacing: 1 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}
