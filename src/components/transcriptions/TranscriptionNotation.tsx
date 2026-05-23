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
import { compEvents, type CompGenre } from "@/lib/transcriptions/accompaniment";
import type { TxSource } from "@/lib/transcriptions/types";

const COMP_GENRE: Record<TxSource, CompGenre> = {
  thesession: "folk", essen: "folk", weimar: "jazz", cocopops: "pop",
};
import {
  decomposeDuration, segmentByBar, layoutBarCells, keySpecFor, keyIsFlat, midiToVexKey,
  type TimedEvent, type BarCell,
} from "@/lib/transcriptions/notation";

const ROW_GAP = 36;
const STAVE_GAP = 80;          // treble-top → bass-top within a row
const ROW_H = STAVE_GAP + ROW_GAP + 44;
const FIRST_BAR_EXTRA = 90;    // clef + key + time-sig overhead on a row's first bar
const PER_TICKABLE = 42;       // horizontal px budget per distinct onset
const MIN_BAR_W = 130;
const MAX_ROW_W = 1180;
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
  carryTieFrom: { note: StaveNote | null }, clef: "treble" | "bass" = "treble", stemDir = 0,
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
      if (stemDir && !isRest) { try { (note as unknown as { setStemDirection(d: number): void }).setStemDirection(stemDir); } catch { /* */ } }
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

export interface NotationProps {
  excerpt: TxExcerpt;
  showMelody?: boolean;
  showChords?: boolean;
  showBass?: boolean;
}

export default function TranscriptionNotation({ excerpt, showMelody = true, showChords = true, showBass = false }: NotationProps) {
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
    const hasChordData = excerpt.chords.length > 0;
    const showChordSymbols = showChords && hasChordData;
    const showBassStaff = showBass && hasChordData;
    // Beat-grouped beaming so dense lines beam per beat, not one span/bar.
    let beamGroups: ReturnType<typeof Beam.getDefaultBeamGroups> | undefined;
    try { beamGroups = Beam.getDefaultBeamGroups(`${ts[0]}/${ts[1]}`); } catch { beamGroups = undefined; }

    // ── Per-bar cells ───────────────────────────────────────────────
    const melodyEvents: TimedEvent<number>[] = showMelody
      ? excerpt.melody.map(n => ({ startBeat: n.startBeat, durBeats: n.durBeats, data: n.midi }))
      : [];
    const melodyByBar = segmentByBar(melodyEvents, bars, bpb);
    // Bass line voice (only when Bass is on).  Block chord voicings are NOT
    // drawn — the chord symbols above carry the harmony, which keeps the
    // staff readable.  Octave-up so the line sits inside the bass clef.
    const comp = showBassStaff
      ? compEvents(excerpt.chords, COMP_GENRE[excerpt.item.source] ?? "folk", bpb, ts, bars * bpb)
      : { chord: [], bass: [] };
    const bassLineByBar = segmentByBar<number>(
      comp.bass.map(e => ({ startBeat: e.startBeat, durBeats: e.durBeats, data: e.midi + 12 })), bars, bpb);

    // Chord symbols per bar (carry-over at downbeat + mid-bar changes).
    const chordLabelByBar: { beatInBar: number; sym: string }[][] = Array.from({ length: bars }, () => []);
    for (let b = 0; showChordSymbols && b < bars; b++) {
      const barStart = b * bpb, barEnd = (b + 1) * bpb;
      const changes = excerpt.chords.filter(c => c.startBeat >= barStart - 1e-6 && c.startBeat < barEnd - 1e-6);
      if (!changes.some(c => Math.abs(c.startBeat - barStart) < 1e-6)) {
        const carry = [...excerpt.chords].reverse().find(c => c.startBeat <= barStart + 1e-6);
        if (carry) chordLabelByBar[b].push({ beatInBar: 0, sym: carry.sym });
      }
      for (const c of changes) chordLabelByBar[b].push({ beatInBar: c.startBeat - barStart, sym: c.sym });
    }

    // ── Phase 1: build voices for every bar (sequential, ties carry) ─
    // Treble = melody; bass staff (only when Bass on) = the bass line.
    const carryMelody = { note: null as StaveNote | null };
    const carryBass = { note: null as StaveNote | null };
    interface BuiltBar {
      melody: BuiltVoice | null; bassV: BuiltVoice | null;
      contentW: number; labels: { beatInBar: number; sym: string }[];
    }
    const built: BuiltBar[] = [];
    for (let b = 0; b < bars; b++) {
      const melody = showMelody
        ? cellsToVoice(layoutBarCells(melodyByBar[b], bpb), (m: number) => [midiToVexKey(m, flat)], ["b/4"], carryMelody, "treble")
        : null;
      const bassV = showBassStaff
        ? cellsToVoice(layoutBarCells(bassLineByBar[b], bpb), (m: number) => [midiToVexKey(m, flat)], ["d/3"], carryBass, "bass")
        : null;
      // Width is driven by the number of DISTINCT onsets across both voices,
      // because the formatter creates one column per shared tick position —
      // sizing by max(voice) alone leaves dense bars cramped/overlapping.
      const onsets = new Set<number>([...(melody?.beatStarts ?? []), ...(bassV?.beatStarts ?? [])]);
      const count = Math.max(onsets.size, 1);
      built.push({ melody, bassV, contentW: Math.max(MIN_BAR_W, count * PER_TICKABLE), labels: chordLabelByBar[b] });
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
          const bass = showBassStaff ? new Stave(x, bassY, w) : null;
          if (isFirst) {
            treble.addClef("treble").addKeySignature(keySpec);
            bass?.addClef("bass").addKeySignature(keySpec);
            if (r === 0) { treble.addTimeSignature(`${ts[0]}/${ts[1]}`); bass?.addTimeSignature(`${ts[0]}/${ts[1]}`); }
            firstTreble = treble; firstBass = bass;
          }
          if (b === bars - 1) { treble.setEndBarType(Barline.type.END); bass?.setEndBarType(Barline.type.END); }
          treble.setContext(ctx).draw();
          bass?.setContext(ctx).draw();
          lastTreble = treble; lastBass = bass;

          const mkVoice = (bvv: BuiltVoice) => {
            const v = new Voice({ numBeats: ts[0], beatValue: ts[1] });
            (v as unknown as { setMode(m: number): void }).setMode(2);
            v.addTickables(bvv.tickables);
            return v;
          };
          const mv = built[b].melody, bv = built[b].bassV;
          const trebleVoice = mv ? mkVoice(mv) : null;
          const bassVoice = bv ? mkVoice(bv) : null;
          const allVoices = [trebleVoice, bassVoice].filter(Boolean) as Voice[];
          for (const v of allVoices) { try { Accidental.applyAccidentals([v], keySpec); } catch { /* */ } }

          // Chord symbols above the melody (treble), else the bass voice.
          const labelHost = mv ?? bv;
          if (labelHost) {
            for (const lbl of built[b].labels) {
              let idx = labelHost.beatStarts.findIndex(bs => bs >= lbl.beatInBar - 1e-6);
              if (idx < 0) idx = labelHost.tickables.length - 1;
              const a = new Annotation(lbl.sym);
              a.setVerticalJustification(Annotation.VerticalJustify.TOP);
              a.setJustification(Annotation.HorizontalJustify.LEFT);
              a.setFont("Arial", 11, "bold");
              try { labelHost.tickables[idx]?.addModifier(a, 0); } catch { /* */ }
            }
          }

          // Beam melody + bass line BEFORE drawing so VexFlow suppresses the
          // individual note flags (beams after draw left stray tails).
          const beams: Beam[] = [];
          for (const v of [mv, bv]) {
            if (!v) continue;
            try { beams.push(...Beam.generateBeams(v.tickables, { groups: beamGroups, beamRests: false, maintainStemDirections: true })); } catch { /* */ }
          }

          const noteStartX = (treble as unknown as { getNoteStartX(): number }).getNoteStartX();
          // Leave a wider right margin so the last note never lands on the
          // end barline, and format to the bar's note area.
          const justify = Math.max(60, x + w - noteStartX - 28);
          const fmt = new Formatter();
          if (allVoices.length) { fmt.joinVoices(allVoices); fmt.format(allVoices, justify); }

          if (trebleVoice) trebleVoice.draw(ctx, treble);
          if (bassVoice && bass) bassVoice.draw(ctx, bass);
          beams.forEach(beam => { try { beam.setStyle(NOTE_STYLE); } catch { /* */ } beam.setContext(ctx).draw(); });
          for (const v of [mv, bv]) {
            if (!v) continue;
            for (const [a, z] of v.ties) { try { new StaveTie({ firstNote: a, lastNote: z }).setContext(ctx).draw(); } catch { /* */ } }
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
  }, [excerpt, showMelody, showChords, showBass]);

  return <div ref={ref} style={{ overflowX: "auto", maxWidth: "100%" }} />;
}
