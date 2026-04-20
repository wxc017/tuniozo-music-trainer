import {
  useState, useRef, useEffect, useCallback, useMemo,
} from "react";
import {
  Renderer, Stave, StaveNote, Voice, Formatter, Beam, Barline, Accidental, Dot,
  GhostNote as VFGhostNote,
  type StaveNoteStruct,
} from "vexflow";
import {
  NoteData, NoteEntryProject, ScoreSetup, Duration, AccidentalType,
  DURATION_SLOTS, DURATION_ORDER, DURATION_NAMES, VF_DURATION_MAP,
  KEY_NAMES, KEY_LABELS, measureSlots, decomposeSlotsToRestSpecs, noteSlots,
  linePosToPitch, pitchToLineIdx,
  loadProjects, saveProject, deleteProject, newProject, generateMusicXML,
} from "@/lib/noteEntryData";
import PracticeLogSaveBar from "./PracticeLogSaveBar";
import { exportToPdf } from "@/lib/exportPdf";
import { writePendingRestore } from "@/lib/practiceLog";

// ── YouTube API global ──────────────────────────────────────────────────────
declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement | string, opts: {
        height?: number | string;
        width?: number | string;
        videoId?: string;
        playerVars?: Record<string, unknown>;
        events?: {
          onReady?: (e: { target: YTPlayerAPI }) => void;
        };
      }) => YTPlayerAPI;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}
interface YTPlayerAPI {
  getCurrentTime(): number;
  seekTo(s: number, allow: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
  loadVideoById(id: string): void;
}

// ── Layout constants ────────────────────────────────────────────────────────
const STAVE_TOP_Y      = 38;
const LINE_SPACING     = 10;
const STAVE_AREA_H     = 160;
const DEFAULT_MEASURE_W = 220;
const CLEF_EXTRA_W      = 78;
const DEFAULT_MPR       = 4;
// Active layout — updated per render for dense grids (16th/32nd)
let MEASURE_W        = DEFAULT_MEASURE_W;
let MEASURES_PER_ROW = DEFAULT_MPR;

// ── Rendering helpers (pure VexFlow, not React) ─────────────────────────────

function measureX(mInRow: number): number {
  return mInRow === 0 ? 0 : CLEF_EXTRA_W + mInRow * MEASURE_W;
}
function measureW(mInRow: number): number {
  return mInRow === 0 ? MEASURE_W + CLEF_EXTRA_W : MEASURE_W;
}
function usableStart(mInRow: number): number {
  return mInRow === 0 ? CLEF_EXTRA_W + 14 : measureX(mInRow) + 8;
}
function usableWidth(): number {
  return MEASURE_W - 22;
}
function rowSvgW(count: number): number {
  return CLEF_EXTRA_W + count * MEASURE_W + 10;
}

// idGroups[i] = array of NoteData.ids for vfNotes[i] (chord = multiple ids)
function buildVFNotes(
  _mIdx: number,
  mNotes: NoteData[],
  _totalSlots: number,
  clef: string,
  selectedIds: string[],
  playingIds: string[] = [],
): { vfNotes: StaveNote[]; idGroups: string[][]; slotMap: number[] } {
  const vfNotes: StaveNote[] = [];
  const idGroups: string[][] = [];
  const slotMap: number[] = [];
  const vfClef = (clef === "bass" ? "bass" : "treble") as "treble" | "bass";

  // Group consecutive non-rest notes at the same startSlot into chords
  const groups: NoteData[][] = [];
  for (const note of mNotes) {
    const last = groups[groups.length - 1];
    if (
      last &&
      !note.isRest &&
      !last[0].isRest &&
      last[0].startSlot === note.startSlot
    ) {
      last.push(note);
    } else {
      groups.push([note]);
    }
  }

  for (const group of groups) {
    const first = group[0];

    if (first.isRest) {
      // Rests: render individually
      for (const note of group) {
        const isPlay = playingIds.includes(note.id);
        const isSel = selectedIds.includes(note.id);
        const color = isPlay ? "#88ccff" : isSel ? "#7173e6" : "#ffffff";
        const rn = new StaveNote({
          keys: [note.pitch || "b/4"],
          duration: VF_DURATION_MAP[note.duration] + "r",
          dots: note.dotted ? 1 : 0,
          clef,
        } as StaveNoteStruct);
        if (note.dotted) {
          try { Dot.buildAndAttach([rn], { all: true }); } catch { /* skip */ }
        }
        rn.setStyle({ fillStyle: color, strokeStyle: color });
        try {
          const mods = (rn as unknown as { getModifiers(): Array<{ setStyle(s: object): void }> }).getModifiers();
          mods.forEach(mod => { try { mod.setStyle({ fillStyle: color, strokeStyle: color }); } catch { } });
        } catch { /* older VF builds */ }
        vfNotes.push(rn);
        idGroups.push([note.id]);
        slotMap.push(note.startSlot);
      }
    } else if (group.length === 1) {
      // Single pitched note
      const note = first;
      const isPlay = playingIds.includes(note.id);
      const isSel = selectedIds.includes(note.id);
      const color = isPlay ? "#88ccff" : isSel ? "#7173e6" : "#ffffff";
      const vfn = new StaveNote({
        keys: [note.pitch],
        duration: VF_DURATION_MAP[note.duration],
        dots: note.dotted ? 1 : 0,
        clef,
      } as StaveNoteStruct);
      if (note.dotted) {
        try { Dot.buildAndAttach([vfn], { all: true }); } catch { /* skip */ }
      }
      if (note.accidental) {
        try { vfn.addModifier(new Accidental(note.accidental), 0); } catch { /* skip */ }
      }
      vfn.setStyle({ fillStyle: color, strokeStyle: color });
      try {
        (vfn as unknown as { setLedgerLineStyle(s: object): void })
          .setLedgerLineStyle({ fillStyle: color, strokeStyle: color });
      } catch { /* method may not exist in all VF builds */ }
      try {
        const mods = (vfn as unknown as { getModifiers(): Array<{ setStyle(s: object): void }> }).getModifiers();
        mods.forEach(mod => { try { mod.setStyle({ fillStyle: color, strokeStyle: color }); } catch { } });
      } catch { /* older VF builds */ }
      vfNotes.push(vfn);
      idGroups.push([note.id]);
      slotMap.push(note.startSlot);
    } else {
      // Chord — multiple pitched notes at the same slot
      // Sort by pitch low-to-high (descending lineIdx)
      const sorted = [...group].sort((a, b) =>
        pitchToLineIdx(b.pitch, vfClef) - pitchToLineIdx(a.pitch, vfClef)
      );
      const dotted = sorted.some(n => n.dotted);
      const keys = sorted.map(n => n.pitch);
      const vfn = new StaveNote({
        keys,
        duration: VF_DURATION_MAP[sorted[0].duration],
        dots: dotted ? 1 : 0,
        clef,
      } as StaveNoteStruct);
      if (dotted) {
        try { Dot.buildAndAttach([vfn], { all: true }); } catch { /* skip */ }
      }
      sorted.forEach((n, idx) => {
        if (n.accidental) {
          try { vfn.addModifier(new Accidental(n.accidental), idx); } catch { /* skip */ }
        }
      });
      // Color each notehead individually so selecting one doesn't highlight the whole chord
      const keyColors = sorted.map(n => {
        const isPlay = playingIds.includes(n.id);
        const isSel = selectedIds.includes(n.id);
        return isPlay ? "#88ccff" : isSel ? "#7173e6" : "#ffffff";
      });
      // Stem/flag color: use the "most active" color among chord members
      const stemColor = keyColors.includes("#88ccff") ? "#88ccff"
        : keyColors.includes("#7173e6") ? "#7173e6" : "#ffffff";
      vfn.setStyle({ fillStyle: stemColor, strokeStyle: stemColor });
      // Per-key notehead coloring
      sorted.forEach((_n, idx) => {
        try {
          (vfn as unknown as { setKeyStyle(i: number, s: object): void })
            .setKeyStyle(idx, { fillStyle: keyColors[idx], strokeStyle: keyColors[idx] });
        } catch { /* setKeyStyle may not exist in all VF builds */ }
      });
      try {
        (vfn as unknown as { setLedgerLineStyle(s: object): void })
          .setLedgerLineStyle({ fillStyle: stemColor, strokeStyle: stemColor });
      } catch { /* skip */ }
      try {
        const mods = (vfn as unknown as { getModifiers(): Array<{ setStyle(s: object): void }> }).getModifiers();
        mods.forEach(mod => { try { mod.setStyle({ fillStyle: stemColor, strokeStyle: stemColor }); } catch { } });
      } catch { /* older VF builds */ }
      vfNotes.push(vfn);
      idGroups.push(sorted.map(n => n.id));
      slotMap.push(sorted[0].startSlot);
    }
  }

  return { vfNotes, idGroups, slotMap };
}

interface NotePixelPos { id: string; x: number; y: number; }
interface SlotAnchor { slot: number; x: number; }
interface MeasureLayout {
  mIdx: number;
  noteStartX: number;
  justifyWidth: number;
  rowIdx: number;
  staveTopLineY: number;   // actual y of top staff line from VexFlow
  lineSpacing: number;     // actual px between lines from VexFlow
  slotAnchors: SlotAnchor[]; // sorted (slot→x) for accurate ghost-note positioning
}

function renderScore(
  el: HTMLDivElement,
  setup: ScoreSetup,
  notes: NoteData[],
  selectedIds: string[],
  playingIds: string[] = [],
): { positions: NotePixelPos[]; layouts: MeasureLayout[] } {
  el.innerHTML = "";
  const { barCount, defaultTimeSig, clef, keySignature } = setup;
  const numRows = Math.ceil(barCount / MEASURES_PER_ROW);
  const totalH = numRows * STAVE_AREA_H;
  const totalW = rowSvgW(MEASURES_PER_ROW);

  const renderer = new Renderer(el, Renderer.Backends.SVG);
  renderer.resize(totalW, totalH);
  // SVG is inline by default — set to block so the overlay stays co-registered
  const svgEl = el.querySelector("svg");
  if (svgEl) (svgEl as unknown as HTMLElement).style.display = "block";
  const ctx = renderer.getContext();
  // White staff on dark background
  ctx.setStrokeStyle("#ffffff");
  ctx.setFillStyle("#ffffff");
  ctx.setFont("Arial", 10);

  const vfClef = clef === "bass" ? "bass" : "treble";
  const positions: NotePixelPos[] = [];
  const layouts: MeasureLayout[] = [];

  for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
    const rowY = rowIdx * STAVE_AREA_H;
    const rowStart = rowIdx * MEASURES_PER_ROW;
    const rowEnd = Math.min(rowStart + MEASURES_PER_ROW, barCount);

    for (let mInRow = 0; mInRow < rowEnd - rowStart; mInRow++) {
      const mIdx = rowStart + mInRow;
      const isLast = mIdx === barCount - 1;
      const x = measureX(mInRow);
      const w = measureW(mInRow);
      const y = rowY + STAVE_TOP_Y;

      const stave = new Stave(x, y, w);
      if (mInRow === 0) {
        stave.addClef(vfClef);
        const keyName = KEY_NAMES[keySignature as keyof typeof KEY_NAMES] ?? "C";
        stave.addKeySignature(keyName);
        const ts = setup.perBarTimeSig?.[mIdx] ?? defaultTimeSig;
        stave.addTimeSignature(`${ts.num}/${ts.den}`);
      }
      if (isLast) stave.setEndBarType(Barline.type.END);
      stave.setContext(ctx).draw();

      // Record actual usable note area from VexFlow.
      // justifyWidth = from noteStartX to (stave right edge minus margin).
      // Using x + w - noteStartX - 14 correctly accounts for clef/key/time sig overhead
      // in measure 0 and the small barline margin in subsequent measures.
      const noteStartX = (stave as unknown as { getNoteStartX(): number }).getNoteStartX();
      const justifyWidth = Math.max(60, x + w - noteStartX - 14);
      const staveTopLineY = (stave as unknown as { getYForLine(n: number): number }).getYForLine(0);
      const lineSpacing = (stave as unknown as { getSpacingBetweenLines(): number }).getSpacingBetweenLines();
      const ts = setup.perBarTimeSig?.[mIdx] ?? defaultTimeSig;
      const totalSlots = measureSlots(ts);
      const mNotes = notes
        .filter(n => n.measure === mIdx)
        .sort((a, b) => a.startSlot - b.startSlot);
      // Slot anchor map — built from actual rendered positions so the hover
      // grid always matches what VexFlow drew.  Recalculated every render.
      const slotAnchorMap = new Map<number, number>();

      if (mNotes.length > 0) {
        const { vfNotes, idGroups, slotMap } = buildVFNotes(mIdx, mNotes, totalSlots, vfClef, selectedIds, playingIds);
        if (vfNotes.length === 0) continue;

        // Fill empty slots with VexFlow GhostNotes so the formatter distributes
        // notes across the full measure width (prevents "squishing").
        // Track the start slot of every tickable so we can build the anchor map.
        const allTickables: (StaveNote | VFGhostNote)[] = [];
        const allTickableSlots: number[] = [];
        let cursor = 0;
        const addGhosts = (upTo: number) => {
          if (upTo <= cursor) return;
          // Use small, uniform ghost notes (8th = 4 slots) so VexFlow
          // distributes space evenly.  Large ghosts (half/dotted-quarter)
          // make the formatter stretch empty areas disproportionately,
          // causing grid lines to bunch up around notes.
          let rem = upTo - cursor;
          while (rem >= 4) {
            allTickables.push(new VFGhostNote({ duration: "8" }));
            allTickableSlots.push(cursor);
            cursor += 4;
            rem -= 4;
          }
          if (rem >= 2) {
            allTickables.push(new VFGhostNote({ duration: "16" }));
            allTickableSlots.push(cursor);
            cursor += 2;
            rem -= 2;
          }
          if (rem >= 1) {
            allTickables.push(new VFGhostNote({ duration: "32" }));
            allTickableSlots.push(cursor);
            cursor += 1;
            rem -= 1;
          }
        };
        for (let ni = 0; ni < vfNotes.length; ni++) {
          addGhosts(slotMap[ni]);
          allTickables.push(vfNotes[ni]);
          allTickableSlots.push(slotMap[ni]);
          const nd = mNotes.find(n => n.startSlot === slotMap[ni]);
          cursor = slotMap[ni] + (nd ? noteSlots(nd) : 8);
        }
        addGhosts(totalSlots);

        const voice = new Voice({ numBeats: ts.num, beatValue: ts.den });
        (voice as unknown as { setMode(m: number): void }).setMode(2);
        voice.addTickables(allTickables);

        try {
          const fmt = new Formatter();
          fmt.joinVoices([voice]);
          fmt.format([voice], justifyWidth);

          // Manual beam grouping: group consecutive beamable notes (8th or
          // shorter) within the same beat.  This is more reliable than
          // Beam.generateBeams which can silently fail with mixed tick configs.
          const beatSlots = 32 / ts.den;
          const beams: Beam[] = [];
          {
            let currentGroup: StaveNote[] = [];
            let currentBeat = -1;
            const flushGroup = () => {
              if (currentGroup.length > 1) {
                try {
                  const beam = new Beam(currentGroup);
                  // Flat beams for mixed-duration groups (e.g. 8th + 32nd)
                  // so the extra beam lines don't tilt the bar sideways.
                  const durations = currentGroup.map(n => n.getDuration());
                  if (!durations.every(d => d === durations[0])) {
                    beam.renderOptions.flatBeams = true;
                  }
                  beams.push(beam);
                } catch { /* skip */ }
              }
            };
            for (let ni = 0; ni < vfNotes.length; ni++) {
              const n = vfNotes[ni];
              const slot = slotMap[ni];
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

          // Draw — VexFlow handles natural spacing, no manual xShift needed.
          voice.draw(ctx, stave);

          ctx.setStrokeStyle("#ffffff");
          ctx.setFillStyle("#ffffff");
          beams.forEach(b => { try { b.setContext(ctx).draw(); } catch { /* skip */ } });

          // Build anchor map from actual rendered positions of ALL tickables
          // (both real notes and ghost fills).  This ensures the hover grid
          // exactly matches the on-screen layout.
          allTickables.forEach((tk, i) => {
            try {
              const ax = (tk as unknown as { getAbsoluteX(): number }).getAbsoluteX();
              slotAnchorMap.set(allTickableSlots[i], ax);
            } catch { /* skip */ }
          });
          slotAnchorMap.set(totalSlots, noteStartX + justifyWidth);

          const anchors: SlotAnchor[] = Array.from(slotAnchorMap.entries())
            .map(([slot, ax]) => ({ slot, x: ax }))
            .sort((a, b) => a.slot - b.slot);

          // Collect note pixel positions from actual rendered positions.
          vfNotes.forEach((vfn, i) => {
            const ids = idGroups[i];
            const nx = slotToX(slotMap[i], anchors);
            try {
              const isRestNote = vfn.isRest();
              if (isRestNote) {
                let ny: number;
                try {
                  const bb = (vfn as unknown as {
                    getBoundingBox(): { x: number; y: number; w: number; h: number };
                  }).getBoundingBox();
                  ny = bb.y + bb.h / 2;
                } catch {
                  ny = staveTopLineY + 2 * lineSpacing;
                }
                positions.push({ id: ids[0], x: nx, y: ny });
              } else {
                const ys = (vfn as unknown as { getYs(): number[] }).getYs();
                ids.forEach((id, keyIdx) => {
                  const ny = ys[keyIdx] ?? (staveTopLineY + 2 * lineSpacing);
                  positions.push({ id, x: nx, y: ny });
                });
              }
            } catch { /* skip */ }
          });

        } catch (e) {
          console.warn("VexFlow format error in measure", mIdx, e);
        }
      }

      // Fallback for empty measures: linear endpoints so hover still works.
      if (!slotAnchorMap.has(0)) slotAnchorMap.set(0, noteStartX + 14);
      if (!slotAnchorMap.has(totalSlots)) slotAnchorMap.set(totalSlots, noteStartX + justifyWidth);

      const slotAnchors: SlotAnchor[] = Array.from(slotAnchorMap.entries())
        .map(([slot, x]) => ({ slot, x }))
        .sort((a, b) => a.slot - b.slot);
      layouts.push({ mIdx, noteStartX, justifyWidth, rowIdx, staveTopLineY, lineSpacing, slotAnchors });
    }
  }
  // Post-process the SVG so every element is visible on a dark background.
  // • Set stroke/fill inheritance at the root to white — elements without an
  //   explicit attribute inherit white rather than browser-default black.
  // • Walk every child and recolour explicit black values (SVG attributes AND
  //   inline style attributes, which VexFlow uses for dots/modifiers).
  // • Dots are rendered as <circle> elements — if they have no explicit light
  //   fill (e.g. they inherit black from a group) force them white.
  // Do NOT replace "none" — fill="none" means transparent.
  const BLACK_RE = /^(black|#000(000)?|rgb\(0\s*,\s*0\s*,\s*0\)|#9{3}(9{3})?|#8{3}(8{3})?|#7{3}(7{3})?)$/i;
  const svgRoot = el.querySelector("svg");
  if (svgRoot) {
    svgRoot.setAttribute("stroke", "#ffffff");
    svgRoot.setAttribute("fill", "#ffffff");
    svgRoot.querySelectorAll<SVGElement>("*").forEach(node => {
      // Fix SVG presentation attributes
      const fill   = node.getAttribute("fill");
      const stroke = node.getAttribute("stroke");
      if (fill   && BLACK_RE.test(fill.trim()))   node.setAttribute("fill",   "#ffffff");
      if (stroke && BLACK_RE.test(stroke.trim())) node.setAttribute("stroke", "#ffffff");

      // Fix inline CSS style attribute (VexFlow Dot modifiers use this path)
      const styleAttr = node.getAttribute("style");
      if (styleAttr) {
        const fixed = styleAttr
          .replace(/(fill\s*:\s*)(black|#000(?:000)?|rgb\(0,\s*0,\s*0\))/gi, "$1#ffffff")
          .replace(/(stroke\s*:\s*)(black|#000(?:000)?|rgb\(0,\s*0,\s*0\))/gi, "$1#ffffff");
        if (fixed !== styleAttr) node.setAttribute("style", fixed);
      }
    });

    // VexFlow renders augmentation dots as <circle> elements. If a dot has no
    // explicit fill set (it inherits black from a parent group or the browser
    // default), force it white — unless it's already a light or accent colour.
    svgRoot.querySelectorAll<SVGCircleElement>("circle").forEach(circle => {
      const fill = circle.getAttribute("fill");
      if (!fill || BLACK_RE.test(fill.trim())) {
        circle.setAttribute("fill", "#ffffff");
      }
    });
  }

  return { positions, layouts };
}

// ── Drag-select: find notes whose pixel position falls inside a rect ─────────

function notesInDragRect(
  notes: NoteData[],
  rect: { x1: number; y1: number; x2: number; y2: number },
  setup: ScoreSetup,
): string[] {
  const x1 = Math.min(rect.x1, rect.x2);
  const x2 = Math.max(rect.x1, rect.x2);
  const y1 = Math.min(rect.y1, rect.y2);
  const y2 = Math.max(rect.y1, rect.y2);

  return notes
    .filter(n => {
      const mInRow = n.measure % MEASURES_PER_ROW;
      const rowIdx = Math.floor(n.measure / MEASURES_PER_ROW);
      const ts = setup.perBarTimeSig?.[n.measure] ?? setup.defaultTimeSig;
      const totalSlots = measureSlots(ts);
      const nx = usableStart(mInRow) + (n.startSlot / totalSlots) * usableWidth();
      const li = n.isRest ? 2 : pitchToLineIdx(n.pitch, setup.clef);
      const ny = rowIdx * STAVE_AREA_H + STAVE_TOP_Y + li * LINE_SPACING;
      return nx >= x1 && nx <= x2 && ny >= y1 && ny <= y2;
    })
    .map(n => n.id);
}

// ── Slot ↔ X helpers (piecewise-linear using VexFlow-derived anchors) ────────

function slotToX(slot: number, anchors: SlotAnchor[]): number {
  if (anchors.length === 0) return 0;
  if (anchors.length === 1) return anchors[0].x;
  for (let i = 0; i < anchors.length - 1; i++) {
    if (slot <= anchors[i + 1].slot) {
      const d = anchors[i + 1].slot - anchors[i].slot;
      if (d === 0) return anchors[i].x;
      const t = (slot - anchors[i].slot) / d;
      return anchors[i].x + t * (anchors[i + 1].x - anchors[i].x);
    }
  }
  return anchors[anchors.length - 1].x;
}

function xToSlot(
  x: number,
  anchors: SlotAnchor[],
  gridSnap: number,
  totalSlots: number,
): number {
  if (anchors.length < 2) return 0;
  let raw = 0;
  if (x <= anchors[0].x) {
    raw = anchors[0].slot;
  } else if (x >= anchors[anchors.length - 1].x) {
    raw = anchors[anchors.length - 1].slot;
  } else {
    for (let i = 0; i < anchors.length - 1; i++) {
      if (x >= anchors[i].x && x < anchors[i + 1].x) {
        const dx = anchors[i + 1].x - anchors[i].x;
        const t = dx === 0 ? 0 : (x - anchors[i].x) / dx;
        raw = anchors[i].slot + t * (anchors[i + 1].slot - anchors[i].slot);
        break;
      }
    }
  }
  const snapped = Math.round(raw / gridSnap) * gridSnap;
  return Math.max(0, Math.min(totalSlots - gridSnap, snapped));
}

// ── Coordinate math ─────────────────────────────────────────────────────────

interface HoverPos {
  mIdx: number;
  slot: number;
  pitch: string;
  px: number;
  py: number;
  lineIdx: number;
  staveTopLineY: number;
  lineSpacing: number;
}

function computeHover(
  relX: number,
  relY: number,
  setup: ScoreSetup,
  duration: Duration,
  layouts: MeasureLayout[],
): HoverPos | null {
  const rowIdx = Math.floor(relY / STAVE_AREA_H);
  const rowY = relY - rowIdx * STAVE_AREA_H;

  const rowStart = rowIdx * MEASURES_PER_ROW;
  if (rowStart >= setup.barCount) return null;
  const rowEnd = Math.min(rowStart + MEASURES_PER_ROW, setup.barCount);

  let mInRow = -1;
  for (let i = 0; i < rowEnd - rowStart; i++) {
    const left = measureX(i);
    const right = left + measureW(i);
    if (relX >= left && relX < right) { mInRow = i; break; }
  }
  if (mInRow < 0) {
    mInRow = rowEnd - rowStart - 1;
  }

  const mIdx = rowStart + mInRow;
  const ts = setup.perBarTimeSig?.[mIdx] ?? setup.defaultTimeSig;
  const totalSlots = measureSlots(ts);
  const gridSnap = DURATION_SLOTS[duration];

  // Use VexFlow layout geometry when available, otherwise fall back to constants
  const layout = layouts.find(l => l.mIdx === mIdx);
  const noteStart = layout ? layout.noteStartX : usableStart(mInRow);
  const justifyW = layout ? layout.justifyWidth : usableWidth();
  const staveTopY = layout ? layout.staveTopLineY : (rowIdx * STAVE_AREA_H + STAVE_TOP_Y);
  const ls = layout ? layout.lineSpacing : LINE_SPACING;

  // Use piecewise-linear anchors from VexFlow layout for accurate slot mapping
  const anchors: SlotAnchor[] = layout?.slotAnchors ?? [
    { slot: 0, x: noteStart },
    { slot: totalSlots, x: noteStart + justifyW },
  ];
  const slot = xToSlot(relX, anchors, gridSnap, totalSlots);

  const lineIdx = (rowY - (staveTopY - rowIdx * STAVE_AREA_H)) / ls;
  const snappedLine = Math.round(lineIdx * 2) / 2;
  const pitch = linePosToPitch(snappedLine, setup.clef);

  const px = slotToX(slot, anchors);
  const py = staveTopY + snappedLine * ls;

  return { mIdx, slot, pitch, px, py, lineIdx: snappedLine, staveTopLineY: staveTopY, lineSpacing: ls };
}

// Tight pixel-radius hit detection — sized to the actual note head ellipse (rx≈5.5, ry≈4)
const HIT_W = 7;
const HIT_H = 5;

function noteAtClick(
  notes: NoteData[],
  clickX: number,
  clickY: number,
  knownPositions: NotePixelPos[],
  setup: ScoreSetup,
): NoteData | undefined {
  // Prefer exact VexFlow positions when available
  const pool = knownPositions.length > 0 ? knownPositions : notes.map(n => {
    const mInRow = n.measure % MEASURES_PER_ROW;
    const rowIdx = Math.floor(n.measure / MEASURES_PER_ROW);
    const ts = setup.perBarTimeSig?.[n.measure] ?? setup.defaultTimeSig;
    const totalSlots = measureSlots(ts);
    const nx = usableStart(mInRow) + (n.startSlot / totalSlots) * usableWidth();
    const li = n.isRest ? 2 : pitchToLineIdx(n.pitch, setup.clef);
    const ny = rowIdx * STAVE_AREA_H + STAVE_TOP_Y + li * LINE_SPACING;
    return { id: n.id, x: nx, y: ny };
  });

  let bestId: string | undefined;
  let bestDist = Infinity;
  for (const p of pool) {
    const dx = Math.abs(clickX - p.x);
    const dy = Math.abs(clickY - p.y);
    if (dx <= HIT_W && dy <= HIT_H) {
      const dist = dx + dy;
      if (dist < bestDist) { bestDist = dist; bestId = p.id; }
    }
  }
  return bestId ? notes.find(n => n.id === bestId) : undefined;
}

function extractVideoId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] ?? null;
}

// ── Setup dialog ─────────────────────────────────────────────────────────────

function SetupDialog({
  initial,
  onConfirm,
  onCancel,
}: {
  initial?: ScoreSetup;
  onConfirm: (s: ScoreSetup) => void;
  onCancel?: () => void;
}) {
  const [clef, setClef] = useState<"treble" | "bass">(initial?.clef ?? "treble");
  const [tsNum, setTsNum] = useState(initial?.defaultTimeSig.num ?? 4);
  const [tsDen, setTsDen] = useState(initial?.defaultTimeSig.den ?? 4);
  const [keySig, setKeySig] = useState(initial?.keySignature ?? 0);
  const [bars, setBars] = useState(initial?.barCount ?? 8);

  const input = "bg-[#1a1a1a] border border-[#333] rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-[#7173e6] w-full";
  const label = "text-xs text-[#888] block mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-6 w-80 space-y-4">
        <h2 className="text-white font-semibold text-base">Score Setup</h2>

        <div>
          <label className={label}>Clef</label>
          <select value={clef} onChange={e => setClef(e.target.value as "treble" | "bass")} className={input}>
            <option value="treble">Treble</option>
            <option value="bass">Bass</option>
          </select>
        </div>

        <div>
          <label className={label}>Time Signature</label>
          <div className="flex gap-2">
            <select value={tsNum} onChange={e => setTsNum(Number(e.target.value))} className={input}>
              {[2,3,4,5,6,7,8,9,12].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-[#666] self-center">/</span>
            <select value={tsDen} onChange={e => setTsDen(Number(e.target.value))} className={input}>
              {[2,4,8].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={label}>Key Signature</label>
          <select value={keySig} onChange={e => setKeySig(Number(e.target.value))} className={input}>
            {([-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7] as const).map(k => (
              <option key={k} value={k}>{KEY_LABELS[k]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={label}>Number of Bars</label>
          <input
            type="number" min={1} max={64} value={bars}
            onChange={e => setBars(Math.max(1, Math.min(64, Number(e.target.value))))}
            className={input}
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={() => onConfirm({ clef, defaultTimeSig: { num: tsNum, den: tsDen }, keySignature: keySig, barCount: bars })}
            className="flex-1 bg-[#7173e6] hover:bg-[#5a5cc7] text-white text-sm rounded py-2 font-medium transition-colors"
          >
            {initial ? "Apply" : "Create Score"}
          </button>
          {onCancel && (
            <button onClick={onCancel} className="flex-1 bg-[#1a1a1a] border border-[#333] text-[#888] text-sm rounded py-2 transition-colors hover:text-white">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── YouTube sync helpers ─────────────────────────────────────────────────────

function interpolateMeasureTime(
  measure: number,
  syncPoints: { measure: number; timestamp: number }[],
): number | null {
  if (syncPoints.length === 0) return null;
  const sorted = [...syncPoints].sort((a, b) => a.measure - b.measure);
  const exact = sorted.find(s => s.measure === measure);
  if (exact) return exact.timestamp;
  if (sorted.length < 2) return sorted[0].timestamp;
  const before = sorted.filter(s => s.measure < measure);
  const after  = sorted.filter(s => s.measure > measure);
  if (before.length === 0) {
    const rate = (sorted[1].timestamp - sorted[0].timestamp) / (sorted[1].measure - sorted[0].measure);
    return sorted[0].timestamp + (measure - sorted[0].measure) * rate;
  }
  if (after.length === 0) {
    const s1 = sorted[sorted.length - 2], s2 = sorted[sorted.length - 1];
    const rate = (s2.timestamp - s1.timestamp) / (s2.measure - s1.measure);
    return s2.timestamp + (measure - s2.measure) * rate;
  }
  const s1 = before[before.length - 1], s2 = after[0];
  const frac = (measure - s1.measure) / (s2.measure - s1.measure);
  return s1.timestamp + frac * (s2.timestamp - s1.timestamp);
}

// ── YouTube panel ────────────────────────────────────────────────────────────

function YouTubePanel({
  url,
  onUrlChange,
  syncPoints,
  onSync,
  onJump,
  onPlay,
  currentSyncMeasure,
  onChangeSyncMeasure,
  barCount,
  ytPlayerRef,
  loopRange,
  onClearLoop,
}: {
  url: string;
  onUrlChange: (u: string) => void;
  syncPoints: { measure: number; timestamp: number }[];
  onSync: () => void;
  onJump: (ts: number) => void;
  onPlay: () => void;
  currentSyncMeasure: number;
  onChangeSyncMeasure: (n: number) => void;
  barCount: number;
  ytPlayerRef: React.MutableRefObject<YTPlayerAPI | null>;
  loopRange: { start: number; end: number } | null;
  onClearLoop: () => void;
}) {
  const [inputUrl, setInputUrl] = useState(url);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);

  const videoId = useMemo(() => extractVideoId(url), [url]);

  useEffect(() => {
    if (!videoId || !ytContainerRef.current) return;
    let destroyed = false;

    const initPlayer = () => {
      if (destroyed || !ytContainerRef.current || !window.YT) return;
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch { /* ignore */ }
      }
      ytContainerRef.current.innerHTML = "";
      const div = document.createElement("div");
      div.id = "yt-player-" + videoId;
      ytContainerRef.current.appendChild(div);
      ytPlayerRef.current = new window.YT.Player(div, {
        height: "180",
        width: "100%",
        videoId,
        playerVars: { playsinline: 1, controls: 1 },
        events: { onReady: () => {} },
      });
    };

    if (window.YT) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
      const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (!existing) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
    }

    return () => { destroyed = true; };
  }, [videoId]);

  const sp = syncPoints.find(s => s.measure === currentSyncMeasure);

  const fmtTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const btn = "px-2 py-1 rounded text-xs border transition-colors";
  const btnPrimary = `${btn} bg-[#7173e6] border-[#7173e6] text-white hover:bg-[#5a5cc7]`;
  const btnSecondary = `${btn} bg-[#1a1a1a] border-[#333] text-[#aaa] hover:text-white hover:border-[#555]`;

  return (
    <div className="bg-[#0d0d0d] px-4 py-3 flex gap-4 items-start">
      {/* Left: video embed */}
      <div style={{ width: 300, flexShrink: 0 }}>
        {videoId ? (
          <div ref={ytContainerRef} className="rounded overflow-hidden bg-black" style={{ height: 169 }} />
        ) : (
          <div className="rounded bg-[#0a0a0a] border border-[#222] flex items-center justify-center" style={{ height: 100 }}>
            <span className="text-xs text-[#555]">No video loaded</span>
          </div>
        )}
      </div>

      {/* Right: controls */}
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <div className="text-xs font-semibold text-[#888] uppercase tracking-widest">YouTube Sync Mode</div>

        <div className="flex gap-2">
          <input
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            placeholder="Paste YouTube URL…"
            className="flex-1 bg-[#1a1a1a] border border-[#333] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#7173e6]"
          />
          <button onClick={() => onUrlChange(inputUrl)} className={btnPrimary}>Load</button>
        </div>

        {/* Sync controls */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[#666]">Sync measure:</span>
            <button onClick={() => onChangeSyncMeasure(Math.max(0, currentSyncMeasure - 1))} className={btnSecondary}>◀</button>
            <span className="text-xs text-white font-mono w-6 text-center">{currentSyncMeasure + 1}</span>
            <button onClick={() => onChangeSyncMeasure(Math.min(barCount - 1, currentSyncMeasure + 1))} className={btnSecondary}>▶</button>
            <button onClick={onSync} className={btnPrimary} title="Record current video time — auto-advances to next measure">
              ⏱ Sync
            </button>
            <button onClick={onPlay} className={`${btn} bg-[#1a6b3a] border-[#1a6b3a] text-white hover:bg-[#15552e]`} title={`Play from measure ${currentSyncMeasure + 1} (or Ctrl+click a measure)`}>
              ▶ Play
            </button>
            {sp && (
              <span className="text-xs text-[#7173e6]">@ {fmtTime(sp.timestamp)}</span>
            )}
          </div>

          {loopRange && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#f0a030]">Loop: m{loopRange.start + 1}–m{loopRange.end + 1}</span>
              <button onClick={onClearLoop} className={`${btn} border-[#553a18] text-[#f0a030] hover:bg-[#2a1a0a]`} title="Clear loop (Esc)">✕</button>
            </div>
          )}

          <div className="text-[10px] text-[#555]">
            ⏱ Sync to mark measure times. Ctrl+click a measure to play from there. Shift+click measures to set a loop range.
          </div>

          {syncPoints.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {syncPoints.sort((a,b)=>a.measure-b.measure).map(s => (
                <button
                  key={s.measure}
                  onClick={() => { onChangeSyncMeasure(s.measure); onJump(s.timestamp); }}
                  className={`px-1.5 py-0.5 rounded text-xs border transition-colors ${s.measure === currentSyncMeasure ? "border-[#7173e6] text-[#7173e6] bg-[#7173e610]" : "border-[#333] text-[#555] hover:text-[#aaa] hover:border-[#555]"}`}
                  title={`m${s.measure + 1} → ${fmtTime(s.timestamp)}`}
                >
                  m{s.measure + 1} <span className="text-[9px] opacity-60">{fmtTime(s.timestamp)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Project list ─────────────────────────────────────────────────────────────

function ProjectList({
  projects,
  onOpen,
  onDelete,
  onNew,
}: {
  projects: NoteEntryProject[];
  onOpen: (p: NoteEntryProject) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold text-base">Quick Transcriptions</h2>
        <button onClick={onNew} className="px-3 py-1.5 bg-[#7173e6] hover:bg-[#5a5cc7] text-white text-sm rounded font-medium transition-colors">
          + New Score
        </button>
      </div>
      {projects.length === 0 ? (
        <div className="text-center py-12 text-[#444] text-sm">No projects yet. Create one to get started.</div>
      ) : (
        <div className="space-y-2">
          {projects.map(p => (
            <div key={p.id} className="flex items-center gap-3 bg-[#111] border border-[#222] rounded-lg px-4 py-3 hover:border-[#333] transition-colors">
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium truncate">{p.title}</div>
                <div className="text-[#555] text-xs mt-0.5">
                  {p.setup.barCount} bars · {p.setup.clef} clef · {p.setup.defaultTimeSig.num}/{p.setup.defaultTimeSig.den} · {new Date(p.createdAt).toLocaleDateString()}
                </div>
              </div>
              <button onClick={() => onOpen(p)} className="px-3 py-1 bg-[#1a1a1a] border border-[#333] text-[#aaa] hover:text-white text-xs rounded transition-colors">
                Open
              </button>
              <button onClick={() => setConfirmDeleteId(p.id)} className="px-2 py-1 text-[#555] hover:text-[#cc5555] text-xs rounded transition-colors">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-6 w-80 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-white font-semibold text-base">Delete Score</h2>
            <p className="text-[#aaa] text-sm">Are you sure you want to delete this score?</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-3 py-1.5 bg-[#1a1a1a] border border-[#333] text-[#aaa] hover:text-white text-sm rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null); }}
                className="px-3 py-1.5 bg-[#cc5555] hover:bg-[#aa3333] text-white text-sm rounded font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ghost note SVG ──────────────────────────────────────────────────────────

function GhostNote({ pos, isRest }: { pos: HoverPos; isRest: boolean }) {
  const { px, py, lineIdx, staveTopLineY, lineSpacing } = pos;
  const onLine = lineIdx % 1 === 0;
  const onStaff = lineIdx >= 0 && lineIdx <= 4;

  const ledgerLines: number[] = [];
  if (!onStaff) {
    if (lineIdx < 0) {
      for (let l = -1; l >= Math.ceil(lineIdx); l--) {
        if (l % 1 === 0) ledgerLines.push(l);
      }
    } else {
      for (let l = 5; l <= Math.floor(lineIdx); l++) {
        if (l % 1 === 0) ledgerLines.push(l);
      }
    }
  } else if (onLine) {
    // already on staff
  }

  return (
    <g opacity={0.5}>
      {ledgerLines.map(l => (
        <line
          key={l}
          x1={px - 12} x2={px + 12}
          y1={staveTopLineY + l * lineSpacing}
          y2={staveTopLineY + l * lineSpacing}
          stroke="#ffffff" strokeWidth={1.2}
        />
      ))}
      {isRest ? (
        <rect x={px - 6} y={py - 2} width={12} height={4} fill="#7173e6" rx={1} />
      ) : (
        <ellipse
          cx={px} cy={py} rx={5.5} ry={4}
          transform={`rotate(-20, ${px}, ${py})`}
          fill="#7173e6"
        />
      )}
    </g>
  );
}

// ── Practice log save bar for Note Entry ─────────────────────────────────────

function NoteEntryLogBar({ activeProject }: { activeProject: NoteEntryProject }) {
  const [status, setStatus] = useState<"Working On" | "Finished">("Working On");
  return (
    <div className="flex items-center gap-2">
      <select
        value={status}
        onChange={e => setStatus(e.target.value as "Working On" | "Finished")}
        className="bg-[#1a1a1a] border border-[#333] rounded px-2 py-1 text-xs text-[#888] focus:outline-none"
      >
        <option value="Working On">Working On</option>
        <option value="Finished">Finished</option>
      </select>
      <PracticeLogSaveBar
        mode="note-entry"
        label="Transcription"
        getSnapshot={() => ({
          preview: `${activeProject.title} — ${status}`,
          snapshot: { projectTitle: activeProject.title, projectId: activeProject.id, status },
          canRestore: false,
        })}
      />
    </div>
  );
}

// ── Main editor ──────────────────────────────────────────────────────────────

export default function NoteEntryMode() {
  const [projects, setProjectsState] = useState<NoteEntryProject[]>(loadProjects);
  const [activeProject, setActiveProject] = useState<NoteEntryProject | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [deletedProject, setDeletedProject] = useState<NoteEntryProject | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Editor state
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [duration, setDuration] = useState<Duration>("q");
  // Update layout density for 16th/32nd note grids (2 bars per line, double width)
  // Derive from actual note content OR selected duration tool
  const _denseGrid = duration === "16" || duration === "32"
    || notes.some(n => n.duration === "16" || n.duration === "32");
  const [accidental, setAccidental] = useState<AccidentalType | null>(null);
  const [isRest, setIsRest] = useState(false);
  const [hoverPos, setHoverPos] = useState<HoverPos | null>(null);
  const [dragRect, setDragRect] = useState<{ x1:number; y1:number; x2:number; y2:number } | null>(null);
  const [syncPoints, setSyncPoints] = useState<{ measure: number; timestamp: number }[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [currentSyncMeasure, setCurrentSyncMeasure] = useState(0);
  const [showYT, setShowYT] = useState(false);
  const [showXRay, setShowXRay] = useState(false);
  const [loopRange, setLoopRange] = useState<{ start: number; end: number } | null>(null);
  const [phraseDecompBars, setPhraseDecompBars] = useState<Set<number>>(new Set());

  // Derived single-select (for popup anchor)
  const selectedId = selectedIds[0] ?? null;

  // History for undo
  const historyRef = useRef<NoteData[][]>([]);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isMouseDownRef = useRef(false);

  const scoreRef = useRef<HTMLDivElement | null>(null);
  const scoreAreaRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerAPI | null>(null);
  const notePixelPosRef = useRef<NotePixelPos[]>([]);
  const measureLayoutsRef = useRef<MeasureLayout[]>([]);
  const notesRef = useRef<NoteData[]>(notes);
  notesRef.current = notes;
  const [renderTick, setRenderTick] = useState(0);

  // Playback cursor + note highlighting
  const [playCursorInfo, setPlayCursorInfo] = useState<{ x: number; y1: number; y2: number } | null>(null);
  const [playingNoteIds, setPlayingNoteIds] = useState<string[]>([]);
  const playingNoteIdsRef = useRef<string[]>([]);
  playingNoteIdsRef.current = playingNoteIds;
  const rafRef = useRef<number | null>(null);
  const syncPointsRef = useRef(syncPoints);
  syncPointsRef.current = syncPoints;
  const activeProjectRef = useRef(activeProject);
  activeProjectRef.current = activeProject;
  const loopRangeRef = useRef(loopRange);
  loopRangeRef.current = loopRange;

  // Fit measures to container width
  const [containerW, setContainerW] = useState(0);
  useEffect(() => {
    const el = scoreAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setContainerW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeProject]);

  {
    if (containerW > 0) {
      // Fit measures to available width, reducing measures-per-row if needed
      const minMW = 140; // narrowest acceptable measure
      let mpr = _denseGrid ? 2 : DEFAULT_MPR;
      let mw = Math.floor((containerW - CLEF_EXTRA_W - 10) / mpr);
      while (mw < minMW && mpr > 1) {
        mpr--;
        mw = Math.floor((containerW - CLEF_EXTRA_W - 10) / mpr);
      }
      MEASURES_PER_ROW = mpr;
      MEASURE_W = Math.max(mw, minMW);
    } else {
      MEASURES_PER_ROW = _denseGrid ? 2 : DEFAULT_MPR;
      MEASURE_W = _denseGrid ? DEFAULT_MEASURE_W * 2 : DEFAULT_MEASURE_W;
    }
  }

  // Render score on changes
  useEffect(() => {
    if (!scoreRef.current || !activeProject) return;
    try {
      const { positions, layouts } = renderScore(scoreRef.current, activeProject.setup, notes, selectedIds, playingNoteIds);
      notePixelPosRef.current = positions;
      measureLayoutsRef.current = layouts;
      setRenderTick(t => t + 1);
    } catch (e) {
      console.warn("Score render error:", e);
    }
  }, [notes, selectedIds, activeProject, playingNoteIds, _denseGrid, containerW]);

  // Auto-save
  useEffect(() => {
    if (!activeProject) return;
    const updated = { ...activeProject, notes, syncPoints, youtubeUrl };
    saveProject(updated);
    setProjectsState(loadProjects());
  }, [notes, syncPoints, youtubeUrl]);

  // Playback cursor animation
  useEffect(() => {
    if (!showYT) {
      setPlayCursorInfo(null);
      if (playingNoteIdsRef.current.length > 0) setPlayingNoteIds([]);
      setLoopRange(null);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      const sp = syncPointsRef.current;
      const proj = activeProjectRef.current;
      if (sp.length < 2 || !ytPlayerRef.current || typeof ytPlayerRef.current.getCurrentTime !== 'function') {
        setPlayCursorInfo(null);
        if (playingNoteIdsRef.current.length > 0) setPlayingNoteIds([]);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const currentTime = ytPlayerRef.current.getCurrentTime();
      const sorted = [...sp].sort((a, b) => a.timestamp - b.timestamp);

      // Loop: if active loop range and playback has passed the loop end, seek back
      const loop = loopRangeRef.current;
      if (loop) {
        const loopEndTime = interpolateMeasureTime(loop.end + 1, sp);
        const loopStartTime = interpolateMeasureTime(loop.start, sp);
        if (loopEndTime !== null && loopStartTime !== null && currentTime >= loopEndTime) {
          ytPlayerRef.current.seekTo(loopStartTime, true);
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
      }

      if (currentTime < sorted[0].timestamp || currentTime > sorted[sorted.length - 1].timestamp) {
        setPlayCursorInfo(null);
        if (playingNoteIdsRef.current.length > 0) setPlayingNoteIds([]);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      let sp1 = sorted[0], sp2 = sorted[1];
      for (let i = 0; i < sorted.length - 1; i++) {
        if (currentTime >= sorted[i].timestamp && currentTime <= sorted[i + 1].timestamp) {
          sp1 = sorted[i]; sp2 = sorted[i + 1]; break;
        }
      }
      const fraction = sp2.timestamp > sp1.timestamp
        ? Math.max(0, Math.min(1, (currentTime - sp1.timestamp) / (sp2.timestamp - sp1.timestamp)))
        : 0;
      const fracMeasure = sp1.measure + fraction * (sp2.measure - sp1.measure);
      const mIdx = Math.min(Math.floor(fracMeasure), (proj?.setup.barCount ?? 1) - 1);
      const mFrac = fracMeasure - mIdx;
      const mInRow = mIdx % MEASURES_PER_ROW;
      const rowIdx = Math.floor(mIdx / MEASURES_PER_ROW);
      const layout = measureLayoutsRef.current.find(l => l.mIdx === mIdx);
      const startX = layout ? layout.noteStartX : measureX(mInRow) + (mInRow === 0 ? CLEF_EXTRA_W : 0);
      const endX = measureX(mInRow) + measureW(mInRow);
      const x = startX + mFrac * (endX - startX);
      const staveTopY = layout ? layout.staveTopLineY : rowIdx * STAVE_AREA_H + STAVE_TOP_Y;
      const ls = layout ? layout.lineSpacing : LINE_SPACING;
      setPlayCursorInfo({ x, y1: staveTopY - ls, y2: staveTopY + 5 * ls });

      // Note highlighting: find which note the cursor is currently over
      if (proj) {
        const ts = proj.setup.perBarTimeSig?.[mIdx] ?? proj.setup.defaultTimeSig;
        const totalSlots = measureSlots(ts);
        const currentSlot = mFrac * totalSlots;
        const allNotes = notesRef.current;
        const mNotes = allNotes.filter(n => n.measure === mIdx);
        const playingNote = mNotes.find(n => {
          const endSlot = n.startSlot + noteSlots(n);
          return currentSlot >= n.startSlot && currentSlot < endSlot;
        });
        const newId = playingNote?.id ?? null;
        const prevId = playingNoteIdsRef.current[0] ?? null;
        if (newId !== prevId) {
          setPlayingNoteIds(newId ? [newId] : []);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [showYT]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!activeProject) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;

      if (e.key === "Escape") { setSelectedIds([]); setLoopRange(null); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length > 0) {
        e.preventDefault();
        pushHistory(notes);
        setNotes(prev => prev.filter(n => !selectedIds.includes(n.id)));
        setSelectedIds([]);
        return;
      }
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); return; }

      const durKeys: Record<string, Duration> = {
        "1": "w", "2": "h", "3": "q", "4": "8", "5": "16", "6": "32",
      };
      if (durKeys[e.key]) { setDuration(durKeys[e.key]); return; }
      if (e.key === "0" || e.key === "r") { setIsRest(r => !r); return; }

      // Arrow keys move primary selected note pitch
      if (selectedId && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        setNotes(prev => prev.map(n => {
          if (!selectedIds.includes(n.id) || n.isRest) return n;
          const li = pitchToLineIdx(n.pitch, activeProject.setup.clef);
          const newLi = e.key === "ArrowUp" ? li - 0.5 : li + 0.5;
          const newPitch = linePosToPitch(newLi, activeProject.setup.clef);
          return { ...n, pitch: newPitch };
        }));
        return;
      }

      // Accidentals for all selected notes
      if (selectedIds.length > 0) {
        if (e.key === "#") setNotes(prev => prev.map(n => selectedIds.includes(n.id) ? { ...n, accidental: "#" as AccidentalType } : n));
        if (e.key === "b") setNotes(prev => prev.map(n => selectedIds.includes(n.id) ? { ...n, accidental: "b" as AccidentalType } : n));
        if (e.key === "n") setNotes(prev => prev.map(n => selectedIds.includes(n.id) ? { ...n, accidental: "n" as AccidentalType } : n));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeProject, selectedIds, notes, duration]);

  function pushHistory(current: NoteData[]) {
    historyRef.current = [...historyRef.current.slice(-30), [...current]];
  }
  function undo() {
    if (historyRef.current.length === 0) return;
    const prev = historyRef.current.pop()!;
    setNotes(prev);
    setSelectedIds([]);
  }

  function moveSelectedNote(dir: -1 | 1) {
    if (!selectedNote || !activeProject) return;
    const ts = activeProject.setup.perBarTimeSig?.[selectedNote.measure] ?? activeProject.setup.defaultTimeSig;
    const totalSlots = measureSlots(ts);
    const dur = noteSlots(selectedNote);
    const newSlot = selectedNote.startSlot + dir * dur;
    if (newSlot < 0 || newSlot + dur > totalSlots) return;
    pushHistory(notes);
    setNotes(prev => {
      const displaced = prev.filter(n =>
        n.id !== selectedNote.id &&
        n.measure === selectedNote.measure &&
        n.startSlot < newSlot + dur &&
        n.startSlot + noteSlots(n) > newSlot
      );
      let next = prev.map(n => n.id === selectedNote.id ? { ...n, startSlot: newSlot } : n);
      next = next.filter(n => !displaced.find(d => d.id === n.id));
      return next.sort((a, b) => a.measure !== b.measure ? a.measure - b.measure : a.startSlot - b.startSlot);
    });
  }

  function setBendOnSelected(val: number) {
    if (selectedIds.length === 0) return;
    pushHistory(notes);
    setNotes(prev => prev.map(n => selectedIds.includes(n.id) ? { ...n, bendSteps: val === 0 ? undefined : val } : n));
  }

  function setAccidentalOnSelected(acc: AccidentalType | undefined) {
    if (selectedIds.length === 0) return;
    pushHistory(notes);
    setNotes(prev => prev.map(n => selectedIds.includes(n.id) && !n.isRest ? { ...n, accidental: acc } : n));
  }

  // ── Score interaction ────────────────────────────────────────────────────

  const getOverlayPos = useCallback((e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    if (!overlayRef.current) return null;
    // getBoundingClientRect() already returns viewport-relative coordinates that
    // account for any scroll of ancestor containers, so a plain subtraction gives
    // the correct offset within the full (un-clipped) overlay.
    const rect = overlayRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const pos = getOverlayPos(e);
    if (!pos) return;
    dragStartRef.current = pos;
    isMouseDownRef.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [getOverlayPos]);

  // Adjust ghost-note x and y to match VexFlow's actual layout for the measure
  const applyLayoutX = useCallback((hp: HoverPos): HoverPos => {
    const layout = measureLayoutsRef.current.find(l => l.mIdx === hp.mIdx);
    if (!layout) return hp;
    if (!activeProject) return hp;

    // Use the piecewise-linear anchor map built during renderScore.
    // This accounts for VexFlow's duration-proportional note spacing regardless
    // of whether the measure contains mixed durations or unusual time signatures.
    const px = slotToX(hp.slot, layout.slotAnchors);

    // Correct y using actual VexFlow stave geometry (staveTopLineY = y of line 0 = top line)
    const py = layout.staveTopLineY + hp.lineIdx * layout.lineSpacing;
    return { ...hp, px, py, staveTopLineY: layout.staveTopLineY, lineSpacing: layout.lineSpacing };
  }, [activeProject]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const pos = getOverlayPos(e);
    if (!pos) { setHoverPos(null); return; }
    if (activeProject) {
      const raw = computeHover(pos.x, pos.y, activeProject.setup, duration, measureLayoutsRef.current);
      const hp = raw ? applyLayoutX(raw) : null;
      setHoverPos(hp);
    }
    if (isMouseDownRef.current && dragStartRef.current) {
      const { x: sx, y: sy } = dragStartRef.current;
      if (Math.abs(pos.x - sx) > 4 || Math.abs(pos.y - sy) > 4) {
        setDragRect({ x1: sx, y1: sy, x2: pos.x, y2: pos.y });
      }
    }
  }, [activeProject, duration, getOverlayPos]);

  const handlePointerLeave = useCallback(() => {
    if (!isMouseDownRef.current) setHoverPos(null);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!activeProject || !isMouseDownRef.current) return;
    isMouseDownRef.current = false;
    const pos = getOverlayPos(e);
    const start = dragStartRef.current;
    dragStartRef.current = null;
    setDragRect(null);
    if (!pos || !start) return;

    const dx = pos.x - start.x;
    const dy = pos.y - start.y;
    const isDrag = Math.abs(dx) > 5 || Math.abs(dy) > 5;

    if (isDrag) {
      // Drag-select all notes within the bounding rect — prefer exact VexFlow positions
      const rx1 = Math.min(start.x, pos.x), rx2 = Math.max(start.x, pos.x);
      const ry1 = Math.min(start.y, pos.y), ry2 = Math.max(start.y, pos.y);
      const knownPos = notePixelPosRef.current;
      const ids = knownPos.length > 0
        ? knownPos.filter(p => p.x >= rx1 && p.x <= rx2 && p.y >= ry1 && p.y <= ry2).map(p => p.id)
        : notesInDragRect(notes, { x1: start.x, y1: start.y, x2: pos.x, y2: pos.y }, activeProject.setup);
      setSelectedIds(ids);
      return;
    }

    // Single click
    const hp = computeHover(pos.x, pos.y, activeProject.setup, duration, measureLayoutsRef.current);
    if (!hp) return;
    const { mIdx, slot } = hp;
    const ts = activeProject.setup.perBarTimeSig?.[mIdx] ?? activeProject.setup.defaultTimeSig;
    const totalSlots = measureSlots(ts);

    // ALT+click = toggle bar selection for Phrase Decomposition
    if (e.altKey) {
      setPhraseDecompBars(prev => {
        const next = new Set(prev);
        if (next.has(mIdx)) next.delete(mIdx); else next.add(mIdx);
        return next;
      });
      return;
    }

    // YouTube sync mode: Ctrl+click = seek+play from measure, Shift+click = set loop range
    if (showYT && syncPoints.length >= 2) {
      if (e.ctrlKey || e.metaKey) {
        const timestamp = interpolateMeasureTime(mIdx, syncPoints);
        if (timestamp !== null && ytPlayerRef.current) {
          setCurrentSyncMeasure(mIdx);
          ytPlayerRef.current.seekTo(timestamp, true);
          ytPlayerRef.current.playVideo();
        }
        return;
      }
      if (e.shiftKey) {
        setLoopRange(prev => {
          if (!prev) return { start: mIdx, end: mIdx };
          const lo = Math.min(prev.start, prev.end, mIdx);
          const hi = Math.max(prev.start, prev.end, mIdx);
          return { start: lo, end: hi };
        });
        return;
      }
    }

    const hit = noteAtClick(notes, pos.x, pos.y, notePixelPosRef.current, activeProject.setup);

    // In note-placement mode, clicking a user rest falls through to placement.
    const clickedRestInNoteMode = !isRest && (hit?.isRest ?? false);

    if (!clickedRestInNoteMode) {
      // If a popup is already open, re-select or deselect on click
      if (selectedIds.length === 1) {
        if (hit) { setSelectedIds([hit.id]); return; }
        setSelectedIds([]);
        return;
      }

      if (hit) { setSelectedIds([hit.id]); return; }

      // Clicked empty space — deselect only, do NOT place
      if (selectedIds.length > 0) {
        setSelectedIds([]);
        return;
      }
    } else {
      setSelectedIds([]);
    }

    // Place new note
    if (slot + DURATION_SLOTS[duration] > totalSlots) return;
    pushHistory(notes);
    const newNote: NoteData = {
      id: crypto.randomUUID(),
      measure: mIdx,
      startSlot: slot,
      duration,
      pitch: isRest ? "b/4" : hp.pitch,
      accidental: accidental ?? undefined,
      isRest,
    };
    setNotes(prev => {
      // Rests replace everything at the slot; pitched notes only replace
      // same-pitch notes (and any rests) — other pitches stay to form chords.
      const filtered = prev.filter(n => {
        if (n.measure !== mIdx || n.startSlot !== slot) return true;
        if (isRest) return false;                    // rest clears slot
        return !n.isRest && n.pitch !== newNote.pitch; // keep other pitches
      });
      return [...filtered, newNote].sort((a, b) =>
        a.measure !== b.measure ? a.measure - b.measure : a.startSlot - b.startSlot
      );
    });
    setSelectedIds([]);
  }, [activeProject, notes, duration, accidental, isRest, selectedIds, getOverlayPos, showYT, syncPoints]);

  // ── Project actions ──────────────────────────────────────────────────────

  function openProject(p: NoteEntryProject) {
    setActiveProject(p);
    setNotes(p.notes);
    setSyncPoints(p.syncPoints);
    setYoutubeUrl(p.youtubeUrl);
    setSelectedIds([]);
    historyRef.current = [];
  }

  function handleDeleteProject(id: string) {
    const proj = projects.find(p => p.id === id);
    deleteProject(id);
    setProjectsState(loadProjects());
    if (proj) {
      setDeletedProject(proj);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => setDeletedProject(null), 6000);
    }
  }

  function handleUndoDelete() {
    if (!deletedProject) return;
    saveProject(deletedProject);
    setProjectsState(loadProjects());
    setDeletedProject(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }

  function handleCreateNew(setup: ScoreSetup) {
    if (!newTitle.trim()) return;
    const p = newProject(newTitle.trim(), setup);
    saveProject(p);
    setProjectsState(loadProjects());
    setShowNewDialog(false);
    setNewTitle("");
    openProject(p);
  }

  function handleApplySetup(setup: ScoreSetup) {
    if (!activeProject) return;
    const updated = { ...activeProject, setup };
    setActiveProject(updated);
    saveProject(updated);
    setShowSetup(false);
  }

  function handleFillRests() {
    if (!activeProject) return;
    pushHistory(notes);
    const newRests: NoteData[] = [];
    for (let mIdx = 0; mIdx < activeProject.setup.barCount; mIdx++) {
      const ts = activeProject.setup.perBarTimeSig?.[mIdx] ?? activeProject.setup.defaultTimeSig;
      const totalSlots = measureSlots(ts);
      const mNotes = notes
        .filter(n => n.measure === mIdx)
        .sort((a, b) => a.startSlot - b.startSlot);
      let cursor = 0;
      for (const n of mNotes) {
        if (n.startSlot > cursor) {
          let slot = cursor;
          for (const spec of decomposeSlotsToRestSpecs(n.startSlot - cursor)) {
            newRests.push({ id: crypto.randomUUID(), measure: mIdx, startSlot: slot, duration: spec.dur, dotted: spec.dotted || undefined, pitch: "b/4", isRest: true });
            slot += spec.slots;
          }
        }
        cursor = n.startSlot + noteSlots(n);
      }
      if (cursor < totalSlots) {
        let slot = cursor;
        for (const spec of decomposeSlotsToRestSpecs(totalSlots - cursor)) {
          newRests.push({ id: crypto.randomUUID(), measure: mIdx, startSlot: slot, duration: spec.dur, dotted: spec.dotted || undefined, pitch: "b/4", isRest: true });
          slot += spec.slots;
        }
      }
    }
    if (newRests.length > 0) {
      setNotes(prev => [...prev, ...newRests].sort((a, b) =>
        a.measure !== b.measure ? a.measure - b.measure : a.startSlot - b.startSlot
      ));
    }
  }

  function handleExportMusicXML() {
    if (!activeProject) return;
    const xml = generateMusicXML({ ...activeProject, notes, syncPoints, youtubeUrl });
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeProject.title.replace(/\s+/g, "_")}.musicxml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExportPdf() {
    if (!activeProject || !scoreRef.current) return;
    await exportToPdf(
      [{ title: activeProject.title, element: scoreRef.current }],
      activeProject.title.replace(/\s+/g, "_"),
      { showTitles: true, splitSections: false },
    );
  }

  function handleSendToPhraseDecomp() {
    if (!activeProject || phraseDecompBars.size === 0) return;
    const ts = activeProject.setup.defaultTimeSig;
    // Store import data so PhraseDecomposition picks it up on mount
    writePendingRestore("phrase_decomp_import", {
      notes,
      barNumbers: [...phraseDecompBars],
      timeSig: ts,
      tempo: undefined,
    });
    setPhraseDecompBars(new Set());
    // Navigate to phrase decomposition
    window.dispatchEvent(new CustomEvent("app-navigate", { detail: "phrase-decomposition" }));
  }

  function handleSync() {
    const ts = ytPlayerRef.current?.getCurrentTime() ?? 0;
    setSyncPoints(prev => {
      const filtered = prev.filter(s => s.measure !== currentSyncMeasure);
      return [...filtered, { measure: currentSyncMeasure, timestamp: ts }];
    });
    setCurrentSyncMeasure(m => Math.min(m + 1, (activeProject?.setup.barCount ?? 1) - 1));
  }

  function handleJump(timestamp: number) {
    if (ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(timestamp, true);
      ytPlayerRef.current.playVideo();
    }
  }

  // ── Selected note controls ───────────────────────────────────────────────

  const selectedNote = notes.find(n => n.id === selectedId);

  // Centroid position for multi-select overlay (min-x, min-y of selected notes)
  const multiSelectPos = useMemo(() => {
    if (selectedIds.length < 2 || !activeProject) return null;
    const known = notePixelPosRef.current.filter(p => selectedIds.includes(p.id));
    if (known.length > 0) {
      const minX = Math.min(...known.map(p => p.x));
      const minY = Math.min(...known.map(p => p.y));
      return { px: minX, py: minY };
    }
    // Fallback: use first selected note's computed position
    const first = notes.find(n => n.id === selectedIds[0]);
    if (!first) return null;
    const ts = activeProject.setup.perBarTimeSig?.[first.measure] ?? activeProject.setup.defaultTimeSig;
    const totalSlots = measureSlots(ts);
    const mInRow = first.measure % MEASURES_PER_ROW;
    const rowIdx = Math.floor(first.measure / MEASURES_PER_ROW);
    const layout = measureLayoutsRef.current.find(l => l.mIdx === first.measure);
    const px = layout
      ? layout.noteStartX + (first.startSlot / totalSlots) * layout.justifyWidth
      : usableStart(mInRow) + (first.startSlot / totalSlots) * usableWidth();
    const py = rowIdx * STAVE_AREA_H + STAVE_TOP_Y;
    return { px, py };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, activeProject, notes, renderTick]);

  // Pixel position of selected note (used to place the popup)
  const selectedNotePos = useMemo(() => {
    if (!selectedNote || !activeProject) return null;
    // Use exact VexFlow position when available
    const known = notePixelPosRef.current.find(p => p.id === selectedNote.id);
    if (known) return { px: known.x, py: known.y };
    // Fallback: use layout-based x + computed y
    const ts = activeProject.setup.perBarTimeSig?.[selectedNote.measure] ?? activeProject.setup.defaultTimeSig;
    const totalSlots = measureSlots(ts);
    const mInRow = selectedNote.measure % MEASURES_PER_ROW;
    const rowIdx = Math.floor(selectedNote.measure / MEASURES_PER_ROW);
    const layout = measureLayoutsRef.current.find(l => l.mIdx === selectedNote.measure);
    const px = layout
      ? layout.noteStartX + (selectedNote.startSlot / totalSlots) * layout.justifyWidth
      : usableStart(mInRow) + (selectedNote.startSlot / totalSlots) * usableWidth();
    const li = selectedNote.isRest ? 2 : pitchToLineIdx(selectedNote.pitch, activeProject.setup.clef);
    const py = rowIdx * STAVE_AREA_H + STAVE_TOP_Y + li * LINE_SPACING;
    return { px, py };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNote?.id, selectedNote?.startSlot, selectedNote?.pitch, activeProject, notes, renderTick]);

  const updateSelected = (patch: Partial<NoteData>) => {
    pushHistory(notes);
    setNotes(prev => prev.map(n => selectedIds.includes(n.id) ? { ...n, ...patch } : n));
  };

  // Duration change for a selection: when multiple notes are selected, repack
  // them consecutively from the first note's slot/measure rather than just
  // changing each note's duration in place (which would leave gaps or overlaps).
  const updateSelectedDuration = (d: Duration) => {
    pushHistory(notes);
    if (selectedIds.length <= 1) {
      setNotes(prev => prev.map(n => selectedIds.includes(n.id) ? { ...n, duration: d } : n));
      return;
    }
    const slotsPerNote = DURATION_SLOTS[d];
    const ordered = notes
      .filter(n => selectedIds.includes(n.id))
      .sort((a, b) => a.measure !== b.measure ? a.measure - b.measure : a.startSlot - b.startSlot);
    if (ordered.length === 0) return;

    let curMeasure = ordered[0].measure;
    let curSlot = ordered[0].startSlot;
    const patches = new Map<string, { duration: Duration; measure: number; startSlot: number }>();

    for (const n of ordered) {
      const ts = activeProject!.setup.perBarTimeSig?.[curMeasure] ?? activeProject!.setup.defaultTimeSig;
      const total = measureSlots(ts);
      // Advance to next measure when the current one is full
      while (curSlot + slotsPerNote > total) {
        curMeasure++;
        curSlot = 0;
        if (curMeasure >= activeProject!.setup.barCount) break;
      }
      if (curMeasure >= activeProject!.setup.barCount) break;
      patches.set(n.id, { duration: d, measure: curMeasure, startSlot: curSlot });
      curSlot += slotsPerNote;
      const ts2 = activeProject!.setup.perBarTimeSig?.[curMeasure] ?? activeProject!.setup.defaultTimeSig;
      if (curSlot >= measureSlots(ts2)) { curMeasure++; curSlot = 0; }
    }

    const newSlots = Array.from(patches.values()).map(p => ({ measure: p.measure, startSlot: p.startSlot }));
    setNotes(prev =>
      prev
        .map(n => {
          const patch = patches.get(n.id);
          if (patch) return { ...n, ...patch };
          // Remove non-selected notes that now collide with repacked positions
          if (!selectedIds.includes(n.id)) {
            const collides = newSlots.some(p =>
              p.measure === n.measure &&
              Math.abs(p.startSlot - n.startSlot) < slotsPerNote
            );
            if (collides) return null;
          }
          return n;
        })
        .filter(Boolean) as NoteData[]
    );
  };

  // ── SVG overlay dimensions ───────────────────────────────────────────────

  const scoreDims = useMemo(() => {
    if (!activeProject) return { w: 0, h: 0 };
    const numRows = Math.ceil(activeProject.setup.barCount / MEASURES_PER_ROW);
    return {
      w: rowSvgW(MEASURES_PER_ROW),
      h: numRows * STAVE_AREA_H,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject, _denseGrid, containerW]);

  // ── Styles ───────────────────────────────────────────────────────────────
  const toolBtn = (active: boolean) =>
    `px-2.5 py-1 rounded text-xs border transition-colors font-medium ` +
    (active
      ? "bg-[#7173e6] border-[#7173e6] text-white"
      : "bg-[#1a1a1a] border-[#333] text-[#888] hover:text-white hover:border-[#555]");

  // ── Render ───────────────────────────────────────────────────────────────

  if (!activeProject) {
    return (
      <>
        <ProjectList
          projects={projects}
          onOpen={openProject}
          onDelete={handleDeleteProject}
          onNew={() => setShowNewDialog(true)}
        />
        {deletedProject && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-2.5 shadow-lg">
            <span className="text-[#aaa] text-sm">Score deleted</span>
            <button
              onClick={handleUndoDelete}
              className="px-3 py-1 bg-[#7173e6] hover:bg-[#5a5cc7] text-white text-sm rounded font-medium transition-colors"
            >
              Undo
            </button>
          </div>
        )}
        {showNewDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-6 w-80 space-y-3">
              <h2 className="text-white font-semibold text-base">New Score</h2>
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Score title…"
                autoFocus
                className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-[#7173e6]"
                onKeyDown={e => e.key === "Escape" && setShowNewDialog(false)}
              />
              <button
                disabled={!newTitle.trim()}
                onClick={() => setShowSetup(true)}
                className="w-full bg-[#7173e6] disabled:opacity-40 hover:bg-[#5a5cc7] text-white text-sm rounded py-2 font-medium transition-colors"
              >
                Configure Score →
              </button>
              <button onClick={() => { setShowNewDialog(false); setNewTitle(""); }} className="w-full text-xs text-[#555] hover:text-[#888]">
                Cancel
              </button>
            </div>
          </div>
        )}
        {showSetup && newTitle.trim() && (
          <SetupDialog
            onConfirm={handleCreateNew}
            onCancel={() => setShowSetup(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto w-full" onKeyDown={() => {}}>
      {/* ── Toolbar rows ── */}
      <div className="flex flex-wrap items-center gap-2 py-2">
        {/* Projects + Duration + Rest + Accidentals */}
        <div className="flex items-center gap-2 bg-[#111] border border-[#1e1e1e] rounded-lg px-3 py-2">
          <button onClick={() => setActiveProject(null)} className={toolBtn(false)} title="Back to project list">
            ← Projects
          </button>
          <div className="w-px h-4 bg-[#2a2a2a]" />
          <div className="flex gap-1">
            {DURATION_ORDER.map((d, i) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={toolBtn(duration === d)}
                title={DURATION_NAMES[d] + " (key " + (i + 1) + ")"}
              >
                {DURATION_NAMES[d]}
              </button>
            ))}
          </div>
          <div className="w-px h-4 bg-[#2a2a2a]" />
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[#666] select-none">Rest</span>
            <button onClick={() => setIsRest(r => !r)} className={toolBtn(isRest)} title="Rest (R)">
              𝄽
            </button>
          </div>
          <div className="w-px h-4 bg-[#2a2a2a]" />
          <div className="flex gap-1">
            {(["b", "n", "#"] as AccidentalType[]).map(a => (
              <button
                key={a}
                onClick={() => setAccidental(acc => acc === a ? null : a)}
                className={toolBtn(accidental === a)}
                title={{ b: "Flat", n: "Natural", "#": "Sharp" }[a]}
              >
                {a === "#" ? "♯" : a === "b" ? "♭" : "♮"}
              </button>
            ))}
          </div>
          <div className="w-px h-4 bg-[#2a2a2a]" />
          <button onClick={undo} className={toolBtn(false)} title="Undo (Ctrl+Z)">↩ Undo</button>
          <button onClick={handleFillRests} className={toolBtn(false)} title="Fill all empty gaps with rests">𝄼 Fill Rests</button>
        </div>

        {/* Export */}
        <div className="flex items-center gap-1 bg-[#111] border border-[#1e1e1e] rounded-lg px-3 py-2">
          <button onClick={handleExportMusicXML} className={toolBtn(false)}>↓ MusicXML</button>
          <button onClick={handleExportPdf} className={toolBtn(false)}>↓ PDF</button>
          <div className="w-px h-4 bg-[#2a2a2a]" />
          <button
            onClick={handleSendToPhraseDecomp}
            className={toolBtn(phraseDecompBars.size > 0)}
            title="ALT+click bars to select, then send to Phrase Decomposition"
            style={phraseDecompBars.size > 0 ? { borderColor: "#c8aa50", color: "#c8aa50" } : {}}
          >
            {phraseDecompBars.size > 0
              ? `→ Decompose (${phraseDecompBars.size} bars)`
              : "→ Decompose"}
          </button>
        </div>

        {/* Setup / YouTube / X-Ray */}
        <div className="flex items-center gap-1 bg-[#111] border border-[#1e1e1e] rounded-lg px-3 py-2">
          <button onClick={() => setShowSetup(true)} className={toolBtn(false)}>⚙ Setup</button>
          <button onClick={() => setShowYT(v => !v)} className={toolBtn(showYT)}>▶ YouTube</button>
          <button onClick={() => setShowXRay(v => !v)} className={toolBtn(showXRay)} title="Toggle X-Ray mode: beat grid + empty space">⊡ X-Ray</button>
        </div>

        {/* Practice Log */}
        <div className="flex items-center gap-2 bg-[#111] border border-[#1e1e1e] rounded-lg px-3 py-2">
          <NoteEntryLogBar activeProject={activeProject} />
        </div>
      </div>

      {/* ── YouTube Sync panel — above the score ── */}
      {showYT && (
        <div className="flex-shrink-0 border-b border-[#1e1e1e]">
          <YouTubePanel
            url={youtubeUrl}
            onUrlChange={setYoutubeUrl}
            syncPoints={syncPoints}
            onSync={handleSync}
            onJump={handleJump}
            onPlay={() => {
              const ts = interpolateMeasureTime(currentSyncMeasure, syncPoints);
              if (ts !== null && ytPlayerRef.current) {
                ytPlayerRef.current.seekTo(ts, true);
                ytPlayerRef.current.playVideo();
              }
            }}
            currentSyncMeasure={currentSyncMeasure}
            onChangeSyncMeasure={setCurrentSyncMeasure}
            barCount={activeProject.setup.barCount}
            ytPlayerRef={ytPlayerRef}
            loopRange={loopRange}
            onClearLoop={() => setLoopRange(null)}
          />
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Score area */}
        <div ref={scoreAreaRef} className="flex-1 overflow-auto py-4">
          <div style={{ position: "relative", display: "inline-block" }}>
            {/* VexFlow rendering target — lineHeight:0 prevents baseline gap under the SVG */}
            <div ref={scoreRef} style={{ display: "block", lineHeight: 0 }} />

            {/* Interactive overlay */}
            <div
              ref={overlayRef}
              style={{
                position: "absolute",
                top: 0, left: 0,
                width: scoreDims.w,
                height: scoreDims.h,
                cursor: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Ccircle cx='5' cy='5' r='3' fill='white' fill-opacity='.85'/%3E%3C/svg%3E") 5 5, auto`,
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
            />

            {/* Ghost note + drag-select rect + sync cursor SVG */}
            <svg
              style={{
                position: "absolute",
                top: 0, left: 0,
                width: scoreDims.w,
                height: scoreDims.h,
                pointerEvents: "none",
              }}
            >
              {/* X-Ray: beat-grid lines + empty-space counter per measure */}
              {showXRay && measureLayoutsRef.current.flatMap(layout => {
                const ts = activeProject.setup.perBarTimeSig?.[layout.mIdx] ?? activeProject.setup.defaultTimeSig;
                const totalSlots = measureSlots(ts);
                const gridSlots = DURATION_SLOTS[duration];
                const gridY1 = layout.staveTopLineY;
                const gridY2 = layout.staveTopLineY + 4 * layout.lineSpacing;
                const els: React.ReactElement[] = [];
                // Grid lines
                for (let s = 0; s < totalSlots; s += gridSlots) {
                  const lx = slotToX(s, layout.slotAnchors);
                  els.push(
                    <line
                      key={`grid-${layout.mIdx}-${s}`}
                      x1={lx} x2={lx}
                      y1={gridY1} y2={gridY2}
                      stroke="rgba(255,255,255,0.35)"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                  );
                }
                // Empty-slots counter — how many slots in this measure have no note covering them
                const mNotes = notes.filter(n => n.measure === layout.mIdx);
                const covered = new Set<number>();
                for (const n of mNotes) {
                  const ns = noteSlots(n);
                  for (let s = n.startSlot; s < n.startSlot + ns; s++) covered.add(s);
                }
                const emptySlots = totalSlots - covered.size;
                if (emptySlots > 0) {
                  // Format as beats (e.g. "1½ beats empty")
                  const label = (() => {
                    const slotsPerBeat = 32 / ts.den;
                    const beats = emptySlots / slotsPerBeat;
                    const whole = Math.floor(beats);
                    const frac = beats - whole;
                    const fracStr =
                      Math.abs(frac - 0.875) < 0.01 ? "⅞" :
                      Math.abs(frac - 0.75)  < 0.01 ? "¾" :
                      Math.abs(frac - 0.625) < 0.01 ? "⅝" :
                      Math.abs(frac - 0.5)   < 0.01 ? "½" :
                      Math.abs(frac - 0.375) < 0.01 ? "⅜" :
                      Math.abs(frac - 0.25)  < 0.01 ? "¼" :
                      Math.abs(frac - 0.125) < 0.01 ? "⅛" : "";
                    const num = whole > 0 ? `${whole}${fracStr}` : fracStr || `${beats}`;
                    return `${num} beat${beats === 1 ? "" : "s"} empty`;
                  })();
                  // Pill sits just below the stave, right-aligned to measure end
                  const px = layout.noteStartX + layout.justifyWidth - 4;
                  const py = gridY2 + 5;
                  els.push(
                    <g key={`xray-empty-${layout.mIdx}`}>
                      <text
                        x={px} y={py + 8}
                        textAnchor="end"
                        fontSize={10}
                        fontFamily="monospace"
                        fill="rgba(255,160,60,0.9)"
                        style={{ userSelect: "none" }}
                      >{label}</text>
                    </g>
                  );
                }
                return els;
              })}

              {/* Sync-measure highlight — only visible when YouTube panel is open */}
              {showYT && (() => {
                const mIdx = currentSyncMeasure;
                const mInRow = mIdx % MEASURES_PER_ROW;
                const rowIdx = Math.floor(mIdx / MEASURES_PER_ROW);
                const layout = measureLayoutsRef.current.find(l => l.mIdx === mIdx);
                const staffTopY = layout
                  ? layout.staveTopLineY
                  : rowIdx * STAVE_AREA_H + STAVE_TOP_Y;
                const ls = layout ? layout.lineSpacing : LINE_SPACING;
                const padding = ls * 1.2;
                const staffH = 4 * ls;
                const x = measureX(mInRow);
                const w = measureW(mInRow);
                const y = staffTopY - padding;
                const h = staffH + padding * 2;
                return (
                  <rect
                    x={x} y={y}
                    width={w} height={h}
                    fill="rgba(113,115,230,0.08)"
                    stroke="#7173e6"
                    strokeWidth={1}
                    strokeOpacity={0.4}
                  />
                );
              })()}
              {/* Playback cursor line */}
              {showYT && playCursorInfo && (
                <line
                  x1={playCursorInfo.x} x2={playCursorInfo.x}
                  y1={playCursorInfo.y1} y2={playCursorInfo.y2}
                  stroke="#f0a030"
                  strokeWidth={2}
                  strokeOpacity={0.9}
                />
              )}

              {/* Loop range highlight — green tint over looped measures */}
              {showYT && loopRange && measureLayoutsRef.current
                .filter(l => l.mIdx >= loopRange.start && l.mIdx <= loopRange.end)
                .map(layout => {
                  const ls = layout.lineSpacing;
                  const padding = ls * 1.2;
                  const staffH = 4 * ls;
                  const x = measureX(layout.mIdx % MEASURES_PER_ROW);
                  const w = measureW(layout.mIdx % MEASURES_PER_ROW);
                  const y = layout.staveTopLineY - padding;
                  const h = staffH + padding * 2;
                  return (
                    <rect
                      key={`loop-${layout.mIdx}`}
                      x={x} y={y} width={w} height={h}
                      fill="rgba(240,160,48,0.06)"
                      stroke="#f0a030"
                      strokeWidth={1}
                      strokeOpacity={0.35}
                      strokeDasharray="4 3"
                    />
                  );
                })
              }

              {/* Phrase Decomposition bar selection highlights */}
              {phraseDecompBars.size > 0 && measureLayoutsRef.current
                .filter(l => phraseDecompBars.has(l.mIdx))
                .map(layout => {
                  const ls = layout.lineSpacing;
                  const padding = ls * 1.2;
                  const staffH = 4 * ls;
                  const x = measureX(layout.mIdx % MEASURES_PER_ROW);
                  const w = measureW(layout.mIdx % MEASURES_PER_ROW);
                  const y = layout.staveTopLineY - padding;
                  const h = staffH + padding * 2;
                  return (
                    <rect
                      key={`pd-${layout.mIdx}`}
                      x={x} y={y} width={w} height={h}
                      fill="rgba(200,170,80,0.08)"
                      stroke="#c8aa50"
                      strokeWidth={1.5}
                      strokeOpacity={0.5}
                      strokeDasharray="5 3"
                    />
                  );
                })
              }

              {/* Bend annotations — smooth curved arrow with label snapped between staff lines */}
              {notePixelPosRef.current.map(pos => {
                const n = notes.find(n => n.id === pos.id);
                if (!n || !n.bendSteps) return null;
                const lbl = n.bendSteps === 0.25 ? "¼" : n.bendSteps === 0.5 ? "½" : n.bendSteps === 1.5 ? "1½" : n.bendSteps === 2.5 ? "2½" : String(n.bendSteps);
                const layout = measureLayoutsRef.current.find(l => l.mIdx === n.measure);
                const ls = layout?.lineSpacing ?? LINE_SPACING;
                const topY = layout?.staveTopLineY ?? (Math.floor(n.measure / MEASURES_PER_ROW) * STAVE_AREA_H + STAVE_TOP_Y);
                // Sweep curve: bottom of arrow sits at the far-right edge of the notehead
                const sx = pos.x + 7, sy = pos.y;
                const tipX = sx + 10, tipY = sy - 16;
                // Snap label to nearest between-lines position
                const rawLabelY = tipY - 6;
                const relLine = (rawLabelY - topY) / ls;
                const snappedLine = Math.round(relLine - 0.5) + 0.5;
                const labelY = topY + snappedLine * ls + 3;
                return (
                  <g key={`bend-${pos.id}`}>
                    {/* Smooth tapered curve — cubic bezier sweeping from note rightward and up */}
                    <path
                      d={`M${sx},${sy} C${sx + 12},${sy} ${tipX},${tipY + 8} ${tipX},${tipY}`}
                      fill="none" stroke="#f0a030" strokeWidth={1.2} strokeLinecap="round"
                    />
                    {/* Filled arrowhead */}
                    <path
                      d={`M${tipX},${tipY} L${tipX - 3.5},${tipY + 5} L${tipX + 3.5},${tipY + 5} Z`}
                      fill="#f0a030"
                    />
                    {/* Label */}
                    <text x={tipX} y={labelY} fontSize={9} fill="#f0a030" fontFamily="Georgia, 'Times New Roman', serif" fontStyle="italic" textAnchor="middle">{lbl}</text>
                  </g>
                );
              })}

              {hoverPos && !dragRect && <GhostNote pos={hoverPos} isRest={isRest} />}
              {dragRect && (
                <rect
                  x={Math.min(dragRect.x1, dragRect.x2)}
                  y={Math.min(dragRect.y1, dragRect.y2)}
                  width={Math.abs(dragRect.x2 - dragRect.x1)}
                  height={Math.abs(dragRect.y2 - dragRect.y1)}
                  fill="rgba(113,115,230,0.12)"
                  stroke="#7173e6"
                  strokeWidth={1}
                  strokeDasharray="4 2"
                />
              )}
            </svg>

            {/* Per-measure play buttons removed — single play button in YouTube panel + Ctrl+click */}

            {/* ── Multi-select overlay (duration + ties + delete) ── */}
            {selectedIds.length > 1 && multiSelectPos && (
              <div
                style={{
                  position: "absolute",
                  left: Math.max(4, multiSelectPos.px - 10),
                  top: (() => { const above = multiSelectPos.py - 140; return above >= 4 ? above : multiSelectPos.py + 22; })(),
                  zIndex: 20,
                  pointerEvents: "all",
                }}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex flex-col gap-1.5 bg-[#161616] border border-[#333] rounded-lg px-2 py-1.5 shadow-xl text-xs" style={{ minWidth: 220 }}>
                  {/* Header: count + delete */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#7173e6] font-mono font-medium">{selectedIds.length} notes selected</span>
                    <button
                      className="px-1.5 py-0.5 text-[#cc5555] border border-[#3a1818] rounded hover:bg-[#2a0a0a] text-xs"
                      onClick={() => {
                        pushHistory(notes);
                        setNotes(prev => prev.filter(n => !selectedIds.includes(n.id)));
                        setSelectedIds([]);
                      }}
                    >✕ Del</button>
                  </div>
                  {/* Duration row — highlights the shared duration if all selected notes match */}
                  {(() => {
                    const selNotes = notes.filter(n => selectedIds.includes(n.id));
                    const sharedDur = selNotes.length > 0 && selNotes.every(n => n.duration === selNotes[0].duration)
                      ? selNotes[0].duration : null;
                    return (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[#666]">Dur:</span>
                        {(DURATION_ORDER as Duration[]).map(d => (
                          <button
                            key={d}
                            className={`px-1.5 py-0.5 border rounded transition-colors text-[10px] font-mono ${d === sharedDur ? "bg-[#7173e6] border-[#7173e6] text-white" : "border-[#333] text-[#aaa] hover:text-white hover:border-[#7173e6]"}`}
                            onClick={() => updateSelectedDuration(d)}
                          >{DURATION_NAMES[d]}</button>
                        ))}
                      </div>
                    );
                  })()}
                  {/* Consolidate row — merge adjacent same-pitch notes into one longer note */}
                  {(() => {
                    const sel = notes
                      .filter(n => selectedIds.includes(n.id))
                      .sort((a, b) => a.measure !== b.measure ? a.measure - b.measure : a.startSlot - b.startSlot);
                    if (sel.length < 2) return null;
                    // Must all be in same measure, same pitch/rest type, consecutive slots
                    const allSameMeasure = sel.every(n => n.measure === sel[0].measure);
                    const allSamePitch = sel.every(n => n.isRest === sel[0].isRest && (sel[0].isRest || n.pitch === sel[0].pitch));
                    const isConsecutive = sel.every((n, i) => i === 0 || sel[i - 1].startSlot + noteSlots(sel[i - 1]) === n.startSlot);
                    if (!allSameMeasure || !allSamePitch || !isConsecutive) return null;
                    const totalSlotsUsed = sel.reduce((s, n) => s + noteSlots(n), 0);
                    // Find a duration that fits totalSlotsUsed (exact or dotted)
                    const SLOT_TO_DUR: [number, Duration, boolean][] = [
                      [32,"w",false],[24,"h",true],[16,"h",false],[12,"q",true],[8,"q",false],
                      [6,"8",true],[4,"8",false],[3,"16",true],[2,"16",false],[1,"32",false],
                    ];
                    const match = SLOT_TO_DUR.find(([s]) => s === totalSlotsUsed);
                    if (!match) return null;
                    const [, mergedDur, mergedDotted] = match;
                    return (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#666]">Merge:</span>
                        <button
                          className="px-2 py-0.5 border border-[#555] rounded text-[#aaa] hover:text-white hover:border-[#7173e6] transition-colors"
                          title={`Consolidate into one ${mergedDotted ? "dotted " : ""}${DURATION_NAMES[mergedDur]}`}
                          onClick={() => {
                            if (!activeProject) return;
                            pushHistory(notes);
                            const merged: NoteData = {
                              id: sel[0].id,
                              measure: sel[0].measure,
                              startSlot: sel[0].startSlot,
                              duration: mergedDur,
                              dotted: mergedDotted || undefined,
                              pitch: sel[0].isRest ? "b/4" : sel[0].pitch,
                              accidental: sel[0].accidental,
                              isRest: sel[0].isRest,
                            };
                            setNotes(prev => {
                              const without = prev.filter(n => !selectedIds.includes(n.id));
                              return [...without, merged].sort((a, b) =>
                                a.measure !== b.measure ? a.measure - b.measure : a.startSlot - b.startSlot
                              );
                            });
                            setSelectedIds([merged.id]);
                          }}
                        >⊕ {mergedDotted ? "dotted " : ""}{DURATION_NAMES[mergedDur]}</button>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ── Single-note context popup ── */}
            {selectedIds.length === 1 && selectedNote && selectedNotePos && (
              <div
                style={{
                  position: "absolute",
                  left: (() => {
                    const POPUP_W = 220;
                    const onRightHalf = selectedNotePos.px > scoreDims.w / 2;
                    return onRightHalf
                      ? Math.max(4, selectedNotePos.px - POPUP_W - 8)
                      : Math.min(scoreDims.w - POPUP_W - 4, selectedNotePos.px + 16);
                  })(),
                  top: (() => {
                    const above = selectedNotePos.py - 108;
                    return above >= 4 ? above : selectedNotePos.py + 22;
                  })(),
                  zIndex: 20,
                  pointerEvents: "all",
                }}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex flex-col gap-1 bg-[#161616] border border-[#333] rounded-lg px-2 py-1.5 shadow-xl text-xs" style={{ minWidth: 200 }}>
                  {/* Row 1: note label + delete */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#7173e6] font-mono font-medium">
                      {selectedNote.isRest ? "rest" : selectedNote.pitch.replace(/^[a-g]/, c => c.toUpperCase())}
                    </span>
                    <button
                      className="px-1.5 py-0.5 text-[#cc5555] border border-[#3a1818] rounded hover:bg-[#2a0a0a] text-xs"
                      onClick={() => {
                        pushHistory(notes);
                        setNotes(prev => prev.filter(n => n.id !== selectedNote.id));
                        setSelectedIds([]);
                      }}
                    >✕ Del</button>
                  </div>

                  {/* Row 2a: rest direction (vertical position on staff) — rests only */}
                  {selectedNote.isRest && (
                    <div className="flex items-center gap-1">
                      <span className="text-[#666]">Dir:</span>
                      {([["b/5","↑ High"],["b/4","= Mid"],["b/3","↓ Low"]] as [string,string][]).map(([key, lbl]) => (
                        <button
                          key={key}
                          className={`px-2 py-0.5 border rounded transition-colors text-[10px] ${(selectedNote.pitch || "b/4") === key ? "bg-[#7173e6] border-[#7173e6] text-white" : "border-[#333] text-[#aaa] hover:text-white hover:border-[#555]"}`}
                          onClick={() => updateSelected({ pitch: key })}
                        >{lbl}</button>
                      ))}
                    </div>
                  )}

                  {/* Row 2: accidentals — pitched notes only */}
                  {!selectedNote.isRest && (
                    <div className="flex items-center gap-1">
                      <span className="text-[#666]">Acc:</span>
                      {([["b","♭"],["n","♮"],["#","♯"]] as [AccidentalType, string][]).map(([a, sym]) => (
                        <button
                          key={a}
                          className={`px-2 py-0.5 border rounded transition-colors ${selectedNote.accidental === a ? "bg-[#7173e6] border-[#7173e6] text-white" : "border-[#333] text-[#aaa] hover:text-white hover:border-[#555]"}`}
                          onClick={() => setAccidentalOnSelected(selectedNote.accidental === a ? undefined : a)}
                        >{sym}</button>
                      ))}
                      {selectedNote.accidental && (
                        <button className="text-[#555] hover:text-[#888] ml-1" onClick={() => setAccidentalOnSelected(undefined)}>✕</button>
                      )}
                    </div>
                  )}

                  {/* Row 3: duration + dot */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[#666]">Dur:</span>
                    {(DURATION_ORDER as Duration[]).map(d => (
                      <button
                        key={d}
                        className={`px-1.5 py-0.5 border rounded transition-colors text-[10px] font-mono ${selectedNote.duration === d ? "bg-[#7173e6] border-[#7173e6] text-white" : "border-[#333] text-[#aaa] hover:text-white hover:border-[#555]"}`}
                        onClick={() => updateSelectedDuration(d)}
                      >{DURATION_NAMES[d]}</button>
                    ))}
                    <div className="w-px h-3 bg-[#333] mx-0.5" />
                    <button
                      title={selectedNote.duration === "32" ? "Cannot dot a 32nd note" : "Toggle dotted duration"}
                      disabled={selectedNote.duration === "32"}
                      className={`px-2 py-0.5 border rounded transition-colors text-[11px] font-bold disabled:opacity-30 ${selectedNote.dotted ? "bg-[#7173e6] border-[#7173e6] text-white" : "border-[#333] text-[#aaa] hover:text-white hover:border-[#555]"}`}
                      onClick={() => {
                        if (selectedNote.duration === "32") return;
                        const ts = activeProject!.setup.perBarTimeSig?.[selectedNote.measure] ?? activeProject!.setup.defaultTimeSig;
                        const total = measureSlots(ts);
                        const newDotted = !selectedNote.dotted;
                        const newSlotsVal = DURATION_SLOTS[selectedNote.duration] * (newDotted ? 1.5 : 1);
                        if (selectedNote.startSlot + newSlotsVal > total) return;
                        updateSelected({ dotted: newDotted });
                      }}
                    >·</button>
                  </div>

                  {/* Row 4: move */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#666]">Move:</span>
                    <button
                      className="px-2 py-0.5 border border-[#333] rounded text-[#aaa] hover:text-white hover:border-[#555] transition-colors"
                      onClick={() => moveSelectedNote(-1)}
                    >◀</button>
                    <button
                      className="px-2 py-0.5 border border-[#333] rounded text-[#aaa] hover:text-white hover:border-[#555] transition-colors"
                      onClick={() => moveSelectedNote(1)}
                    >▶</button>
                  </div>

                  {/* Row 5: subdivide ("blow up") — split into equal smaller notes or rests */}
                  {(() => {
                    const mySlots = noteSlots(selectedNote);
                    const subdivOptions = (DURATION_ORDER as Duration[]).filter(d => {
                      const dSlots = DURATION_SLOTS[d];
                      return dSlots < mySlots && mySlots % dSlots === 0;
                    });
                    if (subdivOptions.length === 0) return null;
                    return (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[#666]">Split:</span>
                        {subdivOptions.map(d => {
                          const count = mySlots / DURATION_SLOTS[d];
                          return (
                            <button
                              key={d}
                              className="px-1.5 py-0.5 border border-[#333] rounded text-[#aaa] hover:text-white hover:border-[#7173e6] transition-colors text-[10px] font-mono"
                              title={`Split into ${count}× ${DURATION_NAMES[d]}`}
                              onClick={() => {
                                if (!activeProject) return;
                                pushHistory(notes);
                                const ts = activeProject.setup.perBarTimeSig?.[selectedNote.measure] ?? activeProject.setup.defaultTimeSig;
                                const totalSlots = measureSlots(ts);
                                const dSlots = DURATION_SLOTS[d];
                                if (selectedNote.startSlot + mySlots > totalSlots) return;
                                const replacements: NoteData[] = Array.from({ length: count }, (_, i) => ({
                                  id: i === 0 ? selectedNote.id : crypto.randomUUID(),
                                  measure: selectedNote.measure,
                                  startSlot: selectedNote.startSlot + i * dSlots,
                                  duration: d,
                                  pitch: selectedNote.isRest ? "b/4" : selectedNote.pitch,
                                  accidental: (!selectedNote.isRest && i === 0) ? selectedNote.accidental : undefined,
                                  isRest: selectedNote.isRest,
                                }));
                                setNotes(prev => {
                                  const without = prev.filter(n => n.id !== selectedNote.id);
                                  return [...without, ...replacements].sort((a, b) =>
                                    a.measure !== b.measure ? a.measure - b.measure : a.startSlot - b.startSlot
                                  );
                                });
                                setSelectedIds([replacements[0].id]);
                              }}
                            >{count}× {DURATION_NAMES[d]}</button>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Row 6: tie — only allowed between different beat groups, never within.
                       In mixed groups (varying durations within a beat), only the first
                       note of every group (besides the first) may tie, and only backward. */}
                  {!selectedNote.isRest && (() => {
                    const sorted = [...notes].sort((a, b) =>
                      a.measure !== b.measure ? a.measure - b.measure : a.startSlot - b.startSlot);
                    const idx = sorted.findIndex(n => n.id === selectedNote.id);
                    const prevN = idx > 0 ? sorted[idx - 1] : null;
                    const nextN = idx < sorted.length - 1 ? sorted[idx + 1] : null;
                    // Beat group = slots per beat based on time sig denominator
                    const ts = activeProject!.setup.perBarTimeSig?.[selectedNote.measure] ?? activeProject!.setup.defaultTimeSig;
                    const beatSlots = 32 / ts.den;
                    const beatGroup = (n: NoteData) => Math.floor(n.startSlot / beatSlots);
                    const myBeat = beatGroup(selectedNote);

                    // Collect all notes in the same measure & beat group
                    const sameGroupNotes = sorted.filter(n =>
                      n.measure === selectedNote.measure && beatGroup(n) === myBeat && !n.isRest);
                    const isMixed = sameGroupNotes.length > 1 &&
                      !sameGroupNotes.every(n => n.duration === sameGroupNotes[0].duration);
                    const isFirstInGroup = sameGroupNotes.length === 0 ||
                      sameGroupNotes[0].id === selectedNote.id;

                    // Only allow ties across beat group boundaries
                    let canTiePrev = prevN && !prevN.isRest && prevN.pitch === selectedNote.pitch
                      && (prevN.measure !== selectedNote.measure || beatGroup(prevN) !== beatGroup(selectedNote));
                    let canTieNext = nextN && !nextN.isRest && nextN.pitch === selectedNote.pitch
                      && (nextN.measure !== selectedNote.measure || beatGroup(nextN) !== beatGroup(selectedNote));

                    // In mixed groups: only the first note of every group (besides
                    // the first beat group) may tie, and only backward ("tie to prev").
                    // It's a press-once action — sets the tie and deselects.
                    if (isMixed) {
                      if (!isFirstInGroup || myBeat === 0) canTiePrev = false;
                      canTieNext = false;
                    }

                    if (!canTiePrev && !canTieNext) return null;
                    return (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[#666]">Tie:</span>
                        {canTiePrev && (
                          <button
                            className={`px-2 py-0.5 border rounded transition-colors ${selectedNote.isTieEnd ? "bg-[#7173e6] border-[#7173e6] text-white" : "border-[#333] text-[#aaa] hover:text-white hover:border-[#7173e6]"}`}
                            onClick={() => {
                              pushHistory(notes);
                              setNotes(all => all.map(n => n.id === selectedNote.id ? { ...n, isTieEnd: !n.isTieEnd } : n));
                              if (isMixed) setSelectedIds([]);
                            }}
                          >← from prev</button>
                        )}
                        {canTieNext && (
                          <button
                            className={`px-2 py-0.5 border rounded transition-colors ${selectedNote.isTieStart ? "bg-[#7173e6] border-[#7173e6] text-white" : "border-[#333] text-[#aaa] hover:text-white hover:border-[#7173e6]"}`}
                            onClick={() => { pushHistory(notes); setNotes(all => all.map(n => n.id === selectedNote.id ? { ...n, isTieStart: !n.isTieStart } : n)); }}
                          >→ to next</button>
                        )}
                      </div>
                    );
                  })()}

                  {/* Row 7: bend — fixed guitar values */}
                  {!selectedNote.isRest && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[#666]">Bend:</span>
                      {([0.25,0.5,1,1.5,2,2.5] as number[]).map(v => {
                        const lbl = v === 0.25 ? "¼" : v === 0.5 ? "½" : v === 1.5 ? "1½" : v === 2.5 ? "2½" : String(v);
                        const active = selectedNote.bendSteps === v;
                        return (
                          <button
                            key={v}
                            className={`px-1.5 py-0.5 border rounded transition-colors text-[10px] font-mono ${active ? "bg-[#7173e6] border-[#7173e6] text-white" : "border-[#333] text-[#aaa] hover:text-white hover:border-[#555]"}`}
                            onClick={() => setBendOnSelected(active ? 0 : v)}
                          >{lbl}</button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {showSetup && (
        <SetupDialog
          initial={activeProject.setup}
          onConfirm={handleApplySetup}
          onCancel={() => setShowSetup(false)}
        />
      )}
    </div>
  );
}
