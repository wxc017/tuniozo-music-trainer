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
import { compEvents, compGenreFor } from "@/lib/transcriptions/accompaniment";
import {
  decomposeDuration, segmentByBar, layoutBarCells, splitCellsAtBeats, keySpecFor, keyIsFlat, midiToVexKey, melodyGridFor,
  type TimedEvent, type BarCell,
} from "@/lib/transcriptions/notation";

const ROW_GAP = 44;            // vertical gap below each row
const STAVE_GAP = 90;          // treble-top → bass-top within a row
// Generous bottom allowance (72px) so the bass staff + its ledger lines /
// descending notes are never clipped.
const ROW_H = STAVE_GAP + ROW_GAP + 72;
const FIRST_BAR_EXTRA = 90;    // clef + key + time-sig overhead on a row's first bar
const PER_TICKABLE = 42;       // horizontal px budget per distinct onset
const MIN_BAR_W = 130;
const MAX_ROW_W = 1180;
const LEFT = 10;
const TOP = 34;                // room above the first row for chord symbols
const BOTTOM_PAD = 28;         // extra height so the last row isn't cut off
const INK = "#e8e8e8";
const NOTE_STYLE = { fillStyle: INK, strokeStyle: INK };

function styleNote(note: StaveNote) {
  try { note.setStyle(NOTE_STYLE); } catch { /* */ }
  try { (note as unknown as { setStemStyle(s: typeof NOTE_STYLE): void }).setStemStyle(NOTE_STYLE); } catch { /* */ }
  try { (note as unknown as { setFlagStyle(s: typeof NOTE_STYLE): void }).setFlagStyle(NOTE_STYLE); } catch { /* */ }
  // Ledger lines have their own style and otherwise render grey on the dark canvas.
  try { (note as unknown as { setLedgerLineStyle(s: typeof NOTE_STYLE): void }).setLedgerLineStyle(NOTE_STYLE); } catch { /* */ }
}

interface BuiltVoice {
  tickables: StaveNote[];
  beatStarts: number[];        // bar-relative start beat of each tickable
  ties: [StaveNote, StaveNote][];
  // A tie INTO this bar from the previous bar's last note (cross-bar carry),
  // kept separate so the renderer can drop it at a row break (where it would
  // otherwise be drawn as a long diagonal line across the page).
  carryTie: [StaveNote, StaveNote] | null;
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
  let carryTie: [StaveNote, StaveNote] | null = null;

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
      // First note of this bar continuing a tie from the previous bar: keep it
      // as the (separate) carry tie so the renderer can suppress it at a row break.
      if (!isRest && i === 0 && carryTieFrom.note) { carryTie = [carryTieFrom.note, note]; carryTieFrom.note = null; }
      if (!isRest && prev) ties.push([prev, note]);
      prev = isRest ? null : note;
    });
    if (!isRest && cell.tieToNext && prev) carryTieFrom.note = prev;
  }
  if (!tickables.length) {
    const rest = new StaveNote({ keys: restKeys, duration: "wr" } as StaveNoteStruct);
    styleNote(rest); tickables.push(rest); beatStarts.push(0);
  }
  return { tickables, beatStarts, ties, carryTie };
}

// Major key name for each position on the circle of fifths (−7…+7).
const MAJOR_BY_FIFTHS: Record<number, string> = {
  [-7]: "Cb", [-6]: "Gb", [-5]: "Db", [-4]: "Ab", [-3]: "Eb", [-2]: "Bb", [-1]: "F",
  [0]: "C", [1]: "G", [2]: "D", [3]: "A", [4]: "E", [5]: "B", [6]: "F#", [7]: "C#",
};

/** Pick the key signature that best fits the actual notes (fewest out-of-key
 *  pitches), so a mis-tagged mode — e.g. a D-Dorian tune labelled "D major" —
 *  doesn't paint a natural on the majority of notes.  `tonicPc` lightly breaks
 *  ties toward a signature whose tonic matches the stated key. */
function bestFitKeySpec(pcs: number[], tonicPc: number): { spec: string; flat: boolean } {
  const hist = new Array(12).fill(0);
  for (const pc of pcs) hist[((pc % 12) + 12) % 12]++;
  let best = 0, bestScore = -Infinity;
  for (let f = -7; f <= 7; f++) {
    const tonic = (((f * 7) % 12) + 12) % 12;
    const inSet = new Set([0, 2, 4, 5, 7, 9, 11].map(s => (tonic + s) % 12));
    let covered = 0;
    for (let pc = 0; pc < 12; pc++) if (inSet.has(pc)) covered += hist[pc];
    // Maximise covered notes; tie-break toward fewer accidentals, then toward
    // the stated tonic being in-key.
    const score = covered - Math.abs(f) * 0.02 + (inSet.has(((tonicPc % 12) + 12) % 12) ? 0.01 : 0);
    if (score > bestScore) { bestScore = score; best = f; }
  }
  return { spec: MAJOR_BY_FIFTHS[best], flat: best < 0 };
}

const BEAMABLE = new Set(["8", "16", "32", "64"]);

/** Beam a voice's flagged notes per FELT BEAT, grouped by each note's ABSOLUTE
 *  beat position (from beatStarts).  VexFlow's generateBeams instead accumulates
 *  durations sequentially, so a dotted rest / odd duration earlier in the bar
 *  drifts the group boundaries off the beat grid and a trailing pair of eighths
 *  fails to beam.  Grouping by absolute beat avoids that entirely. */
function beamByBeat(v: BuiltVoice, beatUnit: number): Beam[] {
  const beams: Beam[] = [];
  let group: StaveNote[] = [];
  let groupBeat = -1;
  const flush = () => {
    if (group.length >= 2) {
      try { const b = new Beam(group); b.setStyle(NOTE_STYLE); beams.push(b); } catch { /* */ }
    }
    group = [];
  };
  v.tickables.forEach((note, i) => {
    let rest = false, dur = "";
    try { rest = (note as unknown as { isRest(): boolean }).isRest(); } catch { /* */ }
    try { dur = (note as unknown as { getDuration(): string }).getDuration(); } catch { /* */ }
    const beat = Math.floor((v.beatStarts[i] ?? 0) / beatUnit + 1e-9);
    if (rest || !BEAMABLE.has(dur)) { flush(); groupBeat = beat; return; }
    if (beat !== groupBeat) { flush(); groupBeat = beat; }
    group.push(note);
  });
  flush();
  return beams;
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
    // Felt beat (quarter-beats): quarter in simple metres, dotted-quarter in
    // compound. Notes are split + tied at these so every beat stays visible.
    const beatUnit = ts[1] === 8 && ts[0] % 3 === 0 ? 1.5 : 1;
    // Key signature from the notes themselves (robust to mis-tagged modes in
    // the source data), with the stated key as a tie-breaker / fallback.
    const fitPcs = [
      ...excerpt.melody.map(n => n.midi),
      ...excerpt.chords.map(c => c.rootPc),
    ];
    const { spec: keySpec, flat } = fitPcs.length
      ? bestFitKeySpec(fitPcs, excerpt.item.key.tonicPc)
      : { spec: keySpecFor(excerpt.item.key.tonicPc, excerpt.item.key.mode), flat: keyIsFlat(keySpecFor(excerpt.item.key.tonicPc, excerpt.item.key.mode)) };
    const hasChordData = excerpt.chords.length > 0;
    const showChordSymbols = showChords && hasChordData;
    const showBassStaff = showBass && hasChordData;

    // ── Per-bar cells ───────────────────────────────────────────────
    const melodyEvents: TimedEvent<number>[] = showMelody
      ? excerpt.melody.map(n => ({ startBeat: n.startBeat, durBeats: n.durBeats, data: n.midi }))
      : [];
    const melodyByBar = segmentByBar(melodyEvents, bars, bpb);
    // Bass staff carries up to two voices, both built from the SAME comping
    // the audio plays (so notation == sound): the chord voicing (when Chords
    // is on) and the bass line (when Bass is on).
    const wantComp = (showChordSymbols || showBassStaff);
    const comp = wantComp
      ? compEvents(excerpt.chords, compGenreFor(excerpt.item.source, excerpt.item.style), bpb, ts, bars * bpb)
      : { chord: [], bass: [] };
    // Chord stabs grouped by onset → one stacked chord per hit.  Voicings are
    // already in the bass-clef comping register (see voiceChord), so we notate
    // the EXACT pitches that play — what you see is what you hear.
    const chordByOnset = new Map<number, { dur: number; midis: number[] }>();
    for (const e of comp.chord) {
      const key = Math.round(e.startBeat / 0.0625) * 0.0625;
      const g = chordByOnset.get(key) ?? { dur: e.durBeats, midis: [] };
      g.midis.push(e.midi); g.dur = Math.max(g.dur, e.durBeats);
      chordByOnset.set(key, g);
    }
    const chordVoicingByBar = segmentByBar<number[]>(
      showChordSymbols
        ? [...chordByOnset.entries()].map(([k, g]) => ({ startBeat: k, durBeats: g.dur, data: [...new Set(g.midis)].sort((a, b) => a - b) }))
        : [], bars, bpb);
    const bassLineByBar = segmentByBar<number>(
      showBassStaff ? comp.bass.map(e => ({ startBeat: e.startBeat, durBeats: e.durBeats, data: e.midi + 12 })) : [], bars, bpb);

    // Chord symbols: one per actual chord change, at its onset.  No
    // per-bar carry-over duplicates (those produced "Fmaj7 Fmaj7" nonsense);
    // the excerpt already includes the chord sounding at the window start.
    const chordLabelByBar: { beatInBar: number; sym: string }[][] = Array.from({ length: bars }, () => []);
    if (showChordSymbols) {
      let lastSym: string | null = null;
      for (const c of excerpt.chords) {
        if (c.sym === lastSym) continue;                 // skip repeats of the same chord
        lastSym = c.sym;
        const bar = Math.floor(c.startBeat / bpb + 1e-6);
        if (bar >= 0 && bar < bars) chordLabelByBar[bar].push({ beatInBar: c.startBeat - bar * bpb, sym: c.sym });
      }
    }

    // ── Phase 1: build voices for every bar (sequential, ties carry) ─
    // Treble = melody; bass staff (only when Bass on) = the bass line.
    const carryMelody = { note: null as StaveNote | null };
    const carryChord = { note: null as StaveNote | null };
    const carryBass = { note: null as StaveNote | null };
    interface BuiltBar {
      melody: BuiltVoice | null; chordV: BuiltVoice | null; bassV: BuiltVoice | null;
      contentW: number; labels: { beatInBar: number; sym: string }[];
    }
    const built: BuiltBar[] = [];
    for (let b = 0; b < bars; b++) {
      const melody = showMelody
        ? cellsToVoice(splitCellsAtBeats(layoutBarCells(melodyByBar[b], bpb, melodyGridFor(excerpt.item.source)), beatUnit), (m: number) => [midiToVexKey(m, flat)], ["b/4"], carryMelody, "treble")
        : null;
      // Chord voicing (Chords on): stacked stabs on the bass staff, stems up.
      const chordV = showChordSymbols && chordVoicingByBar[b].length
        ? cellsToVoice(splitCellsAtBeats(layoutBarCells(chordVoicingByBar[b], bpb, 0.5), beatUnit), (ms: number[]) => ms.map(m => midiToVexKey(m, flat)), ["d/3"], carryChord, "bass", 1)
        : null;
      // Bass line (Bass on): single notes on the bass staff, stems down.
      const bassV = showBassStaff
        ? cellsToVoice(splitCellsAtBeats(layoutBarCells(bassLineByBar[b], bpb, 0.5), beatUnit), (m: number) => [midiToVexKey(m, flat)], ["d/3"], carryBass, "bass", -1)
        : null;
      // Width is driven by the number of DISTINCT onsets across all voices,
      // because the formatter creates one column per shared tick position —
      // sizing by max(voice) alone leaves dense bars cramped/overlapping.
      const onsets = new Set<number>([...(melody?.beatStarts ?? []), ...(chordV?.beatStarts ?? []), ...(bassV?.beatStarts ?? [])]);
      const count = Math.max(onsets.size, 1);
      built.push({ melody, chordV, bassV, contentW: Math.max(MIN_BAR_W, count * PER_TICKABLE), labels: chordLabelByBar[b] });
    }

    // ── Phase 2: uniform bar width, pack into rows ──────────────────
    // Every bar gets the SAME width (driven by the densest bar) so the page
    // reads evenly — no "first bar wide, next bar cramped".
    const uniformW = Math.max(MIN_BAR_W, ...built.map(b => b.contentW));
    const perRow = Math.max(1, Math.floor((MAX_ROW_W - FIRST_BAR_EXTRA) / uniformW));
    const rows: number[][] = [];
    for (let b = 0; b < bars; b += perRow) {
      rows.push(Array.from({ length: Math.min(perRow, bars - b) }, (_, i) => b + i));
    }

    const rowWidths = rows.map(r => r.length * uniformW + FIRST_BAR_EXTRA);
    const totalW = LEFT * 2 + Math.max(uniformW + FIRST_BAR_EXTRA, ...rowWidths);
    const totalH = TOP + rows.length * ROW_H + BOTTOM_PAD;

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
          const w = uniformW + (isFirst ? FIRST_BAR_EXTRA : 0);
          const treble = new Stave(x, trebleY, w);
          const bass = (showChordSymbols || showBassStaff) ? new Stave(x, bassY, w) : null;
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
          const mv = built[b].melody, cv = built[b].chordV, bv = built[b].bassV;
          const trebleVoice = mv ? mkVoice(mv) : null;
          const chordVoice = cv ? mkVoice(cv) : null;
          const bassVoice = bv ? mkVoice(bv) : null;
          const allVoices = [trebleVoice, chordVoice, bassVoice].filter(Boolean) as Voice[];
          for (const v of allVoices) { try { Accidental.applyAccidentals([v], keySpec); } catch { /* */ } }

          // Chord symbols above the melody (treble), else the chord/bass voice.
          const labelHost = mv ?? cv ?? bv;
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

          // Beam melody + bass line per beat BEFORE drawing (beams after draw
          // left stray tails).  beamByBeat groups by absolute beat position so
          // each beam spans exactly one beat — clarifying the pulse — and a
          // trailing pair of eighths in a beat always beams.
          const beams: Beam[] = [];
          for (const v of [mv, bv]) {
            if (!v) continue;
            beams.push(...beamByBeat(v, beatUnit));
          }

          const noteStartX = (treble as unknown as { getNoteStartX(): number }).getNoteStartX();
          // Leave a wider right margin so the last note never lands on the
          // end barline, and format to the bar's note area.
          const justify = Math.max(60, x + w - noteStartX - 28);
          const fmt = new Formatter();
          if (allVoices.length) { fmt.joinVoices(allVoices); fmt.format(allVoices, justify); }

          // Re-assert ink: stave.draw() leaves the context stroke dark, which
          // made ledger lines render black (invisible on the dark canvas).
          ctx.setStrokeStyle(INK); ctx.setFillStyle(INK);
          if (trebleVoice) trebleVoice.draw(ctx, treble);
          if (chordVoice && bass) chordVoice.draw(ctx, bass);
          if (bassVoice && bass) bassVoice.draw(ctx, bass);
          beams.forEach(beam => { try { beam.setStyle(NOTE_STYLE); } catch { /* */ } beam.setContext(ctx).draw(); });
          const drawTie = (a: StaveNote | null, z: StaveNote | null) => {
            try {
              // firstIndexes/lastIndexes pin the tie to the actual noteheads,
              // otherwise VexFlow floats it in the gap between notes.  A null
              // first/last note makes a HANGING tie (curve to the system edge),
              // used at row breaks instead of a diagonal across the page.
              const tie = new StaveTie({ firstNote: a, lastNote: z, firstIndexes: [0], lastIndexes: [0] } as unknown as ConstructorParameters<typeof StaveTie>[0]);
              try { (tie as unknown as { setStyle(s: typeof NOTE_STYLE): void }).setStyle(NOTE_STYLE); } catch { /* */ }
              tie.setContext(ctx).draw();
            } catch { /* */ }
          };
          for (const v of [mv, cv, bv]) {
            if (!v) continue;
            for (const [a, z] of v.ties) drawTie(a, z);
            if (v.carryTie) {
              if (isFirst) {
                // Row break: the held note's two halves are on different systems.
                // Draw a hanging tie-out on the previous row's last note and a
                // hanging tie-in on this row's first note (proper engraving).
                drawTie(v.carryTie[0], null);
                drawTie(null, v.carryTie[1]);
              } else {
                drawTie(v.carryTie[0], v.carryTie[1]);
              }
            }
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
