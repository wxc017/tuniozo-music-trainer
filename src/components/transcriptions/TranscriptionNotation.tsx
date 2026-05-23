// ── Transcriptions notation (VexFlow grand staff) ───────────────────
//
// Renders an excerpt as a treble (melody) + bass (chord voicing) grand
// staff, with the chord symbol drawn above every bar.  Only used in the
// "Show Answer" reveal.  All beat→notation math lives in notation.ts;
// this file is the VexFlow glue.

import { useEffect, useRef } from "react";
import {
  Renderer, Stave, StaveNote, Voice, Formatter, Beam, Dot, Accidental,
  Annotation, StaveConnector, StaveTie, Barline, type StaveNoteStruct,
} from "vexflow";
import type { TxExcerpt } from "@/lib/transcriptions/loader";
import {
  decomposeDuration, segmentByBar, keySpecFor, keyIsFlat, midiToVexKey,
  type TimedEvent,
} from "@/lib/transcriptions/notation";

const MAX_BARS_PER_ROW = 4;
const ROW_H = 170;
const STAVE_GAP = 80;          // treble-top → bass-top
const FIRST_BAR_EXTRA = 56;    // clef + key + time sig overhead
const BAR_W = 150;
const LEFT = 10;
const TOP = 18;

interface BuiltVoice {
  tickables: StaveNote[];
  beatStarts: number[];        // bar-relative start beat of each tickable
  ties: [StaveNote, StaveNote][];
}

/** Build one bar's worth of tickables for a voice, filling gaps with rests
 *  and tying split pieces / cross-bar continuations. */
function buildBarVoice(
  segments: { startInBar: number; dur: number; keys: string[] | null; tieToNext: boolean }[],
  beatsPerBar: number,
  restKeys: string[],
  carryTieFrom: { note: StaveNote | null },
): BuiltVoice {
  const tickables: StaveNote[] = [];
  const beatStarts: number[] = [];
  const ties: [StaveNote, StaveNote][] = [];

  const emit = (durBeats: number, keys: string[] | null, atBeat: number, tieToNext: boolean) => {
    const pieces = decomposeDuration(durBeats);
    let prev: StaveNote | null = null;
    pieces.forEach((p, i) => {
      const isRest = keys === null;
      const note = new StaveNote({
        keys: isRest ? restKeys : keys!,
        duration: p.dur + (isRest ? "r" : ""),
        clef: undefined,
      } as StaveNoteStruct);
      if (p.dots) { try { Dot.buildAndAttach([note], { all: true }); } catch { /* */ } }
      tickables.push(note);
      beatStarts.push(atBeat);
      // Tie a real note to the carried-over continuation from the prior bar.
      if (!isRest && i === 0 && carryTieFrom.note) {
        ties.push([carryTieFrom.note, note]);
        carryTieFrom.note = null;
      }
      // Tie consecutive pieces of one note.
      if (!isRest && prev) ties.push([prev, note]);
      prev = isRest ? null : note;
    });
    // If this note continues into the next bar, remember its last piece.
    if (keys !== null && tieToNext && prev) carryTieFrom.note = prev;
  };

  let cursor = 0;
  for (const seg of segments) {
    if (seg.startInBar > cursor + 1e-6) emit(seg.startInBar - cursor, null, cursor, false);
    emit(seg.dur, seg.keys, seg.startInBar, seg.tieToNext);
    cursor = seg.startInBar + seg.dur;
  }
  if (cursor < beatsPerBar - 1e-6) emit(beatsPerBar - cursor, null, cursor, false);
  // Truly empty bar → one full-bar rest.
  if (!tickables.length) emit(beatsPerBar, null, 0, false);

  return { tickables, beatStarts, ties };
}

/** Close-position bass-clef voicing for a chord (root + reduced tones). */
function bassVoicing(rootPc: number, intervals: number[], bassPc?: number): number[] {
  let rootMidi = 48 + rootPc;
  if (rootMidi > 55) rootMidi -= 12;            // keep root in G2..G3
  const reduced = [...new Set(intervals.map(i => ((i % 12) + 12) % 12))].sort((a, b) => a - b);
  const tones = reduced.map(i => rootMidi + i);
  if (bassPc != null) {
    const b = 36 + bassPc;                       // explicit slash bass, low
    if (!tones.includes(b)) tones.unshift(b);
  }
  return tones.sort((a, b) => a - b);
}

export default function TranscriptionNotation({ excerpt }: { excerpt: TxExcerpt }) {
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

    // ── Per-bar segments for melody + chords ────────────────────────
    const melodyEvents: TimedEvent<number>[] = excerpt.melody.map(n => ({
      startBeat: n.startBeat, durBeats: n.durBeats, data: n.midi,
    }));
    const melodyByBar = segmentByBar(melodyEvents, bars, bpb);

    const chordEvents: TimedEvent<number[]>[] = excerpt.chords.map(c => ({
      startBeat: c.startBeat, durBeats: c.durBeats,
      data: bassVoicing(c.rootPc, c.intervals, c.bassPc),
    }));
    const chordByBar = segmentByBar(chordEvents, bars, bpb);
    const hasChords = excerpt.chords.length > 0;

    // Chord symbol to show above each bar: the symbol sounding at the bar
    // downbeat plus any change starting inside the bar.
    const chordLabelByBar: { beatInBar: number; sym: string }[][] = Array.from({ length: bars }, () => []);
    for (let b = 0; b < bars; b++) {
      const barStart = b * bpb, barEnd = (b + 1) * bpb;
      const changes = excerpt.chords.filter(c => c.startBeat >= barStart - 1e-6 && c.startBeat < barEnd - 1e-6);
      const startsAtDownbeat = changes.some(c => Math.abs(c.startBeat - barStart) < 1e-6);
      if (!startsAtDownbeat) {
        const carry = [...excerpt.chords].reverse().find(c => c.startBeat <= barStart + 1e-6);
        if (carry) chordLabelByBar[b].push({ beatInBar: 0, sym: carry.sym });
      }
      for (const c of changes) chordLabelByBar[b].push({ beatInBar: c.startBeat - barStart, sym: c.sym });
    }

    // ── Renderer ────────────────────────────────────────────────────
    const numRows = Math.ceil(bars / MAX_BARS_PER_ROW);
    const longestRow = Math.min(bars, MAX_BARS_PER_ROW);
    const totalW = LEFT * 2 + FIRST_BAR_EXTRA + longestRow * BAR_W;
    const totalH = TOP + numRows * ROW_H;

    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(totalW, totalH);
    const svgEl = el.querySelector("svg");
    if (svgEl) (svgEl as unknown as HTMLElement).style.display = "block";
    const ctx = renderer.getContext();
    ctx.setStrokeStyle("#e8e8e8");
    ctx.setFillStyle("#e8e8e8");
    ctx.setFont("Arial", 10);

    const carryTreble = { note: null as StaveNote | null };
    const carryBass = { note: null as StaveNote | null };

    try {
      for (let row = 0; row < numRows; row++) {
        const rowBars: number[] = [];
        for (let i = 0; i < MAX_BARS_PER_ROW; i++) {
          const b = row * MAX_BARS_PER_ROW + i;
          if (b < bars) rowBars.push(b);
        }
        const trebleY = TOP + row * ROW_H;
        const bassY = trebleY + STAVE_GAP;
        let x = LEFT;
        let firstTreble: Stave | null = null;
        let firstBass: Stave | null = null;
        let lastTreble: Stave | null = null;
        let lastBass: Stave | null = null;

        for (let mi = 0; mi < rowBars.length; mi++) {
          const b = rowBars[mi];
          const w = (mi === 0 ? FIRST_BAR_EXTRA : 0) + BAR_W;
          const treble = new Stave(x, trebleY, w);
          const bass = new Stave(x, bassY, w);
          if (mi === 0) {
            treble.addClef("treble").addKeySignature(keySpec);
            bass.addClef("bass").addKeySignature(keySpec);
            if (row === 0) {
              treble.addTimeSignature(`${ts[0]}/${ts[1]}`);
              bass.addTimeSignature(`${ts[0]}/${ts[1]}`);
            }
            firstTreble = treble; firstBass = bass;
          }
          if (b === bars - 1) { treble.setEndBarType(Barline.type.END); bass.setEndBarType(Barline.type.END); }
          treble.setContext(ctx).draw();
          bass.setContext(ctx).draw();
          lastTreble = treble; lastBass = bass;

          // Build voices for this bar.
          const tb = buildBarVoice(
            melodyByBar[b].map(s => ({ startInBar: s.startInBar, dur: s.dur, keys: [midiToVexKey(s.data, flat)], tieToNext: s.tieToNext })),
            bpb, ["b/4"], carryTreble,
          );
          const bb = buildBarVoice(
            hasChords
              ? chordByBar[b].map(s => ({ startInBar: s.startInBar, dur: s.dur, keys: s.data.map(m => midiToVexKey(m, flat)), tieToNext: s.tieToNext }))
              : [],
            bpb, ["d/3"], carryBass,
          );

          const trebleVoice = new Voice({ numBeats: ts[0], beatValue: ts[1] });
          (trebleVoice as unknown as { setMode(m: number): void }).setMode(2);
          trebleVoice.addTickables(tb.tickables);
          const bassVoice = new Voice({ numBeats: ts[0], beatValue: ts[1] });
          (bassVoice as unknown as { setMode(m: number): void }).setMode(2);
          bassVoice.addTickables(bb.tickables);

          try { Accidental.applyAccidentals([trebleVoice], keySpec); } catch { /* */ }
          try { Accidental.applyAccidentals([bassVoice], keySpec); } catch { /* */ }

          // Chord symbols above this bar — attach to the nearest treble
          // tickable at/after each label's beat.
          for (const lbl of chordLabelByBar[b]) {
            let idx = tb.beatStarts.findIndex(bs => bs >= lbl.beatInBar - 1e-6);
            if (idx < 0) idx = tb.tickables.length - 1;
            const a = new Annotation(lbl.sym);
            (a as unknown as { setPosition(p: number): void }).setPosition(3);   // ABOVE
            try {
              (a as unknown as { setVerticalJustification(v: number): void }).setVerticalJustification(1); // TOP
            } catch { /* */ }
            try { tb.tickables[idx]?.addModifier(a, 0); } catch { /* */ }
          }

          const noteStartX = (treble as unknown as { getNoteStartX(): number }).getNoteStartX();
          const justify = Math.max(60, x + w - noteStartX - 18);
          const fmt = new Formatter();
          fmt.joinVoices([trebleVoice]);
          fmt.joinVoices([bassVoice]);
          fmt.format([trebleVoice, bassVoice], justify);

          trebleVoice.draw(ctx, treble);
          bassVoice.draw(ctx, bass);

          // Beams (auto) per voice, drawn after notes.
          for (const grp of [tb.tickables, bb.tickables]) {
            try {
              const beams = Beam.generateBeams(grp.filter(n => !(n as unknown as { isRest(): boolean }).isRest?.()));
              beams.forEach(beam => beam.setContext(ctx).draw());
            } catch { /* */ }
          }

          // Ties for this bar.
          for (const [a, z] of [...tb.ties, ...bb.ties]) {
            try { new StaveTie({ firstNote: a, lastNote: z }).setContext(ctx).draw(); }
            catch { /* */ }
          }

          x += w;
        }

        // Brace + left line joining the grand staff at the row start.
        if (firstTreble && firstBass) {
          try {
            new StaveConnector(firstTreble, firstBass).setType(StaveConnector.type.BRACE).setContext(ctx).draw();
            new StaveConnector(firstTreble, firstBass).setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
          } catch { /* */ }
        }
        if (lastTreble && lastBass) {
          try { new StaveConnector(lastTreble, lastBass).setType(StaveConnector.type.SINGLE_RIGHT).setContext(ctx).draw(); }
          catch { /* */ }
        }
      }
    } catch (err) {
      el.innerHTML = `<div style="color:#a55;font-size:12px;padding:8px">Notation render error: ${String(err)}</div>`;
    }
  }, [excerpt]);

  return <div ref={ref} style={{ overflowX: "auto", maxWidth: "100%" }} />;
}
