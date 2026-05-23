// ── Transcriptions notation (VexFlow grand staff) ───────────────────
//
// Renders an excerpt as a treble (melody) + bass (chord voicing) grand
// staff, with the chord symbol drawn above every bar.  Only used in the
// "Show Answer" reveal.  Beat→cell math lives in notation.ts
// (layoutBarCells quantizes + clamps so bars never overflow); this file
// is the VexFlow glue.
//
// Layout is density-aware: each bar is sized by how many notes it holds,
// and bars wrap into rows, so dense jazz lines don't cram or overflow.

import { useEffect, useRef } from "react";
import {
  Renderer, Stave, StaveNote, Voice, Formatter, Beam, Dot, Accidental,
  Annotation, StaveConnector, StaveTie, Barline, type StaveNoteStruct,
} from "vexflow";
import type { TxExcerpt } from "@/lib/transcriptions/loader";
import {
  decomposeDuration, segmentByBar, layoutBarCells, keySpecFor, keyIsFlat, midiToVexKey,
  type TimedEvent, type BarCell,
} from "@/lib/transcriptions/notation";

const ROW_GAP = 36;
const STAVE_GAP = 80;          // treble-top → bass-top within a row
const ROW_H = STAVE_GAP + ROW_GAP + 44;
const FIRST_BAR_EXTRA = 90;    // clef + key + time-sig overhead on a row's first bar
const PER_TICKABLE = 26;       // horizontal px budget per note/rest
const MIN_BAR_W = 96;
const MAX_ROW_W = 1040;
const LEFT = 10;
const TOP = 22;
const INK = "#e8e8e8";
const NOTE_STYLE = { fillStyle: INK, strokeStyle: INK };

function styleNote(note: StaveNote) {
  try { note.setStyle(NOTE_STYLE); } catch { /* */ }
  try { (note as unknown as { setStemStyle(s: typeof NOTE_STYLE): void }).setStemStyle(NOTE_STYLE); } catch { /* */ }
  try { (note as unknown as { setFlagStyle(s: typeof NOTE_STYLE): void }).setFlagStyle(NOTE_STYLE); } catch { /* */ }
}

interface BuiltVoice {
  tickables: StaveNote[];
  beatStarts: number[];        // bar-relative start beat of each tickable
  ties: [StaveNote, StaveNote][];
}

/** Turn one bar's laid-out cells into VexFlow tickables, splitting each
 *  cell's duration into notatable pieces and tying split pieces / cross-bar
 *  continuations.  `keyFn` maps a cell's payload to VexFlow key strings. */
function cellsToVoice<T>(
  cells: BarCell<T>[], keyFn: (d: T) => string[], restKeys: string[],
  carryTieFrom: { note: StaveNote | null }, clef: "treble" | "bass" = "treble",
): BuiltVoice {
  const tickables: StaveNote[] = [];
  const beatStarts: number[] = [];
  const ties: [StaveNote, StaveNote][] = [];

  for (const cell of cells) {
    const isRest = cell.data === null;
    const keys = isRest ? restKeys : keyFn(cell.data as T);
    const pieces = decomposeDuration(cell.durBeats);
    let prev: StaveNote | null = null;
    pieces.forEach((p, i) => {
      const note = new StaveNote({ keys, duration: p.dur + (isRest ? "r" : ""), clef } as StaveNoteStruct);
      styleNote(note);
      if (p.dots) { try { Dot.buildAndAttach([note], { all: true }); } catch { /* */ } }
      tickables.push(note);
      beatStarts.push(cell.startInBar);
      if (!isRest && i === 0 && carryTieFrom.note) { ties.push([carryTieFrom.note, note]); carryTieFrom.note = null; }
      if (!isRest && prev) ties.push([prev, note]);
      prev = isRest ? null : note;
    });
    if (!isRest && cell.tieToNext && prev) carryTieFrom.note = prev;
  }
  if (!tickables.length) {
    const rest = new StaveNote({ keys: restKeys, duration: "wr" } as StaveNoteStruct);
    styleNote(rest); tickables.push(rest); beatStarts.push(0);
  }
  return { tickables, beatStarts, ties };
}

/** Close-position bass-clef voicing for a chord (root + reduced tones). */
function bassVoicing(rootPc: number, intervals: number[], bassPc?: number): number[] {
  let rootMidi = 48 + rootPc;
  if (rootMidi > 55) rootMidi -= 12;
  const reduced = [...new Set(intervals.map(i => ((i % 12) + 12) % 12))].sort((a, b) => a - b);
  const tones = reduced.map(i => rootMidi + i);
  if (bassPc != null) {
    const b = 36 + bassPc;
    if (!tones.includes(b)) tones.unshift(b);
  }
  return tones.sort((a, b) => a - b);
}

export interface NotationProps {
  excerpt: TxExcerpt;
  showMelody?: boolean;
  showChords?: boolean;
}

export default function TranscriptionNotation({ excerpt, showMelody = true, showChords = true }: NotationProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = "";

    const bpb = excerpt.beatsPerBar;
    const bars = excerpt.bars;
    const ts = excerpt.item.timeSig;
    const keySpec = keySpecFor(excerpt.item.key.tonicPc, excerpt.item.key.mode);
    const flat = keyIsFlat(keySpec);
    const hasChords = showChords && excerpt.chords.length > 0;
    // Beat-grouped beaming so dense lines beam per beat, not one span/bar.
    let beamGroups: ReturnType<typeof Beam.getDefaultBeamGroups> | undefined;
    try { beamGroups = Beam.getDefaultBeamGroups(`${ts[0]}/${ts[1]}`); } catch { beamGroups = undefined; }

    // ── Per-bar cells ───────────────────────────────────────────────
    const melodyEvents: TimedEvent<number>[] = showMelody
      ? excerpt.melody.map(n => ({ startBeat: n.startBeat, durBeats: n.durBeats, data: n.midi }))
      : [];
    const melodyByBar = segmentByBar(melodyEvents, bars, bpb);
    const chordEvents: TimedEvent<number[]>[] = hasChords
      ? excerpt.chords.map(c => ({ startBeat: c.startBeat, durBeats: c.durBeats, data: bassVoicing(c.rootPc, c.intervals, c.bassPc) }))
      : [];
    const chordByBar = segmentByBar(chordEvents, bars, bpb);

    // Chord symbols per bar (carry-over at downbeat + mid-bar changes).
    const chordLabelByBar: { beatInBar: number; sym: string }[][] = Array.from({ length: bars }, () => []);
    for (let b = 0; hasChords && b < bars; b++) {
      const barStart = b * bpb, barEnd = (b + 1) * bpb;
      const changes = excerpt.chords.filter(c => c.startBeat >= barStart - 1e-6 && c.startBeat < barEnd - 1e-6);
      if (!changes.some(c => Math.abs(c.startBeat - barStart) < 1e-6)) {
        const carry = [...excerpt.chords].reverse().find(c => c.startBeat <= barStart + 1e-6);
        if (carry) chordLabelByBar[b].push({ beatInBar: 0, sym: carry.sym });
      }
      for (const c of changes) chordLabelByBar[b].push({ beatInBar: c.startBeat - barStart, sym: c.sym });
    }

    // ── Phase 1: build voices for every bar (sequential, ties carry) ─
    // Put the melody on whichever clef fits its register, so low (e.g.
    // baritone-sax) lines render on the bass staff instead of drowning the
    // treble in ledger lines.  `treble`/`bass` below are the TOP/BOTTOM
    // staves; the melody+chord content swaps between them accordingly.
    const mids = excerpt.melody.map(n => n.midi).sort((a, b) => a - b);
    const median = mids.length ? mids[Math.floor(mids.length / 2)] : 71;
    const melodyOnBass = showMelody && mids.length > 0 && median < 56;
    const chordOctave = melodyOnBass ? 12 : 0;     // lift chord voicing onto the treble staff
    const melodyRest = melodyOnBass ? ["d/3"] : ["b/4"];
    const chordRest = melodyOnBass ? ["b/4"] : ["d/3"];

    const carryMelody = { note: null as StaveNote | null };
    const carryChord = { note: null as StaveNote | null };
    interface BuiltBar { treble: BuiltVoice; bass: BuiltVoice; contentW: number; labels: { beatInBar: number; sym: string }[] }
    const built: BuiltBar[] = [];
    for (let b = 0; b < bars; b++) {
      const melodyVoice = cellsToVoice(
        layoutBarCells(melodyByBar[b], bpb), (m: number) => [midiToVexKey(m, flat)], melodyRest, carryMelody,
        melodyOnBass ? "bass" : "treble",
      );
      const chordVoice = cellsToVoice(
        hasChords ? layoutBarCells(chordByBar[b], bpb) : [],
        (ms: number[]) => ms.map(m => midiToVexKey(m + chordOctave, flat)), chordRest, carryChord,
        melodyOnBass ? "treble" : "bass",
      );
      const top = melodyOnBass ? chordVoice : melodyVoice;
      const bottom = melodyOnBass ? melodyVoice : chordVoice;
      const count = Math.max(top.tickables.length, bottom.tickables.length);
      built.push({ treble: top, bass: bottom, contentW: Math.max(MIN_BAR_W, count * PER_TICKABLE), labels: chordLabelByBar[b] });
    }

    // ── Phase 2: pack bars into rows by width ───────────────────────
    const rows: number[][] = [];
    let cur: number[] = [];
    let curW = 0;
    for (let b = 0; b < bars; b++) {
      const w = built[b].contentW + (cur.length === 0 ? FIRST_BAR_EXTRA : 0);
      if (cur.length && curW + w > MAX_ROW_W) { rows.push(cur); cur = []; curW = 0; }
      cur.push(b);
      curW += built[b].contentW + (cur.length === 1 ? FIRST_BAR_EXTRA : 0);
    }
    if (cur.length) rows.push(cur);

    const rowWidths = rows.map(r => r.reduce((sum, b, i) => sum + built[b].contentW + (i === 0 ? FIRST_BAR_EXTRA : 0), 0));
    const totalW = LEFT * 2 + Math.max(MIN_BAR_W + FIRST_BAR_EXTRA, ...rowWidths);
    const totalH = TOP + rows.length * ROW_H;

    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(totalW, totalH);
    const svgEl = el.querySelector("svg");
    if (svgEl) (svgEl as unknown as HTMLElement).style.display = "block";
    const ctx = renderer.getContext();
    ctx.setStrokeStyle(INK);
    ctx.setFillStyle(INK);
    ctx.setFont("Arial", 10);

    // ── Phase 3: render ─────────────────────────────────────────────
    try {
      for (let r = 0; r < rows.length; r++) {
        const rowBars = rows[r];
        const trebleY = TOP + r * ROW_H;
        const bassY = trebleY + STAVE_GAP;
        let x = LEFT;
        let firstTreble: Stave | null = null, firstBass: Stave | null = null;
        let lastTreble: Stave | null = null, lastBass: Stave | null = null;

        for (let mi = 0; mi < rowBars.length; mi++) {
          const b = rowBars[mi];
          const isFirst = mi === 0;
          const w = built[b].contentW + (isFirst ? FIRST_BAR_EXTRA : 0);
          const treble = new Stave(x, trebleY, w);
          const bass = new Stave(x, bassY, w);
          if (isFirst) {
            treble.addClef("treble").addKeySignature(keySpec);
            bass.addClef("bass").addKeySignature(keySpec);
            if (r === 0) { treble.addTimeSignature(`${ts[0]}/${ts[1]}`); bass.addTimeSignature(`${ts[0]}/${ts[1]}`); }
            firstTreble = treble; firstBass = bass;
          }
          if (b === bars - 1) { treble.setEndBarType(Barline.type.END); bass.setEndBarType(Barline.type.END); }
          treble.setContext(ctx).draw();
          bass.setContext(ctx).draw();
          lastTreble = treble; lastBass = bass;

          const tb = built[b].treble, bb = built[b].bass;
          const trebleVoice = new Voice({ numBeats: ts[0], beatValue: ts[1] });
          (trebleVoice as unknown as { setMode(m: number): void }).setMode(2);
          trebleVoice.addTickables(tb.tickables);
          const bassVoice = new Voice({ numBeats: ts[0], beatValue: ts[1] });
          (bassVoice as unknown as { setMode(m: number): void }).setMode(2);
          bassVoice.addTickables(bb.tickables);

          try { Accidental.applyAccidentals([trebleVoice], keySpec); } catch { /* */ }
          try { Accidental.applyAccidentals([bassVoice], keySpec); } catch { /* */ }

          for (const lbl of built[b].labels) {
            let idx = tb.beatStarts.findIndex(bs => bs >= lbl.beatInBar - 1e-6);
            if (idx < 0) idx = tb.tickables.length - 1;
            const a = new Annotation(lbl.sym);
            a.setVerticalJustification(Annotation.VerticalJustify.TOP);
            a.setJustification(Annotation.HorizontalJustify.LEFT);
            a.setFont("Arial", 11, "bold");
            try { tb.tickables[idx]?.addModifier(a, 0); } catch { /* */ }
          }

          const noteStartX = (treble as unknown as { getNoteStartX(): number }).getNoteStartX();
          const justify = Math.max(40, x + w - noteStartX - 16);
          const fmt = new Formatter();
          // Join both staves into one tick context so melody notes align
          // vertically over the chords they sound against.
          fmt.joinVoices([trebleVoice, bassVoice]);
          fmt.format([trebleVoice, bassVoice], justify);

          trebleVoice.draw(ctx, treble);
          bassVoice.draw(ctx, bass);

          // Beam only the melody (treble); block-chord bass isn't beamed.
          try {
            const melodyNotes = tb.tickables.filter(n => !(n as unknown as { isRest(): boolean }).isRest?.());
            const beams = Beam.generateBeams(melodyNotes, { groups: beamGroups, beamRests: false, maintainStemDirections: true });
            beams.forEach(beam => { try { beam.setStyle(NOTE_STYLE); } catch { /* */ } beam.setContext(ctx).draw(); });
          } catch { /* */ }
          for (const [a, z] of [...tb.ties, ...bb.ties]) {
            try { new StaveTie({ firstNote: a, lastNote: z }).setContext(ctx).draw(); } catch { /* */ }
          }
          x += w;
        }

        if (firstTreble && firstBass) {
          try {
            new StaveConnector(firstTreble, firstBass).setType(StaveConnector.type.BRACE).setContext(ctx).draw();
            new StaveConnector(firstTreble, firstBass).setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
          } catch { /* */ }
        }
        if (lastTreble && lastBass) {
          try { new StaveConnector(lastTreble, lastBass).setType(StaveConnector.type.SINGLE_RIGHT).setContext(ctx).draw(); } catch { /* */ }
        }
      }
    } catch (err) {
      el.innerHTML = `<div style="color:#a55;font-size:12px;padding:8px">Notation render error: ${String(err)}</div>`;
    }
  }, [excerpt, showMelody, showChords]);

  return <div ref={ref} style={{ overflowX: "auto", maxWidth: "100%" }} />;
}
