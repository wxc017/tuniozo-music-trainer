// ── Notation helpers (pure) ─────────────────────────────────────────
//
// Beat-math + pitch-spelling utilities for the VexFlow renderer, kept
// pure (no VexFlow / DOM) so they can be unit-tested in isolation.

const EPS = 1e-6;

/** Notatable durations in quarter-beats → VexFlow {dur token, dots}. */
const VOCAB: { q: number; dur: string; dots: number }[] = [
  { q: 4, dur: "w", dots: 0 },
  { q: 3, dur: "h", dots: 1 },
  { q: 2, dur: "h", dots: 0 },
  { q: 1.5, dur: "q", dots: 1 },
  { q: 1, dur: "q", dots: 0 },
  { q: 0.75, dur: "8", dots: 1 },
  { q: 0.5, dur: "8", dots: 0 },
  { q: 0.375, dur: "16", dots: 1 },
  { q: 0.25, dur: "16", dots: 0 },
  { q: 0.125, dur: "32", dots: 0 },
];

/** Decompose a duration (quarter-beats) into a left-to-right list of
 *  notatable pieces.  Pieces that belong to one note are tied by the
 *  caller.  Quantized to a 1/8-beat (32nd-note) grid first. */
export function decomposeDuration(durQ: number): { dur: string; dots: number }[] {
  let rem = Math.round(durQ / 0.125) * 0.125;
  const out: { dur: string; dots: number }[] = [];
  let guard = 0;
  while (rem >= 0.125 - EPS && guard++ < 64) {
    const piece = VOCAB.find(v => v.q <= rem + EPS);
    if (!piece) break;
    out.push({ dur: piece.dur, dots: piece.dots });
    rem -= piece.q;
  }
  // Anything shorter than a 32nd just collapses to a 32nd so it's visible.
  if (!out.length) out.push({ dur: "32", dots: 0 });
  return out;
}

export interface TimedEvent<T> { startBeat: number; durBeats: number; data: T }
export interface BarSegment<T> { startInBar: number; dur: number; data: T; tieToNext: boolean }

/** Split events at bar boundaries into per-bar segment lists.  An event
 *  crossing a barline becomes two segments with `tieToNext` set on the
 *  earlier one so the renderer can draw a tie. */
export function segmentByBar<T>(
  events: TimedEvent<T>[], totalBars: number, beatsPerBar: number,
): BarSegment<T>[][] {
  const bars: BarSegment<T>[][] = Array.from({ length: totalBars }, () => []);
  for (const ev of events) {
    let s = ev.startBeat;
    const end = ev.startBeat + ev.durBeats;
    while (s < end - EPS) {
      const barIdx = Math.floor(s / beatsPerBar + EPS);
      if (barIdx >= totalBars) break;
      const barEnd = (barIdx + 1) * beatsPerBar;
      const segEnd = Math.min(end, barEnd);
      bars[barIdx].push({
        startInBar: s - barIdx * beatsPerBar,
        dur: segEnd - s,
        data: ev.data,
        tieToNext: segEnd < end - EPS,
      });
      s = segEnd;
    }
  }
  for (const b of bars) b.sort((a, c) => a.startInBar - c.startInBar);
  return bars;
}

/** A laid-out notation cell: a note (data) or a rest (data === null),
 *  with a duration in quarter-beats. `tieToNext` marks a note continuing
 *  past the bar end. */
export interface BarCell<T> { durBeats: number; data: T | null; tieToNext: boolean; startInBar: number }

/** Turn one bar's note segments into a gap-free, non-overlapping cell list
 *  whose durations sum EXACTLY to `beatsPerBar`.  This is what keeps VexFlow
 *  from cramming: real corpora (esp. jazz) have overlapping, fractional, or
 *  over-long notes; we quantize onsets/durations to `grid`, clamp each note
 *  so it can't overrun the next onset or the barline, drop collisions, and
 *  fill every gap (and the tail) with rests. */
export function layoutBarCells<T>(
  segments: BarSegment<T>[], beatsPerBar: number, grid = 0.25,
): BarCell<T>[] {
  const snap = (x: number) => Math.round(x / grid) * grid;
  const segs = [...segments].sort((a, b) => a.startInBar - b.startInBar);
  const cells: BarCell<T>[] = [];
  let cursor = 0;
  for (let i = 0; i < segs.length; i++) {
    let start = snap(segs[i].startInBar);
    if (start < cursor) start = cursor;                 // clamp behind cursor
    if (start >= beatsPerBar - 1e-9) break;             // starts past the bar
    if (start > cursor + 1e-9) {                        // gap → rest
      cells.push({ durBeats: start - cursor, data: null, tieToNext: false, startInBar: cursor });
    }
    // Next onset (quantized, strictly after this one) bounds the duration.
    let nextStart = beatsPerBar;
    for (let j = i + 1; j < segs.length; j++) {
      const ns = snap(segs[j].startInBar);
      if (ns > start + 1e-9) { nextStart = Math.min(ns, beatsPerBar); break; }
    }
    const wanted = Math.max(snap(segs[i].dur), grid);
    const end = Math.min(start + wanted, nextStart, beatsPerBar);
    const dur = end - start;
    if (dur < grid / 2) continue;                       // collision → drop note
    cells.push({
      durBeats: dur, data: segs[i].data,
      tieToNext: segs[i].tieToNext && end >= beatsPerBar - 1e-9,
      startInBar: start,
    });
    cursor = end;
  }
  if (cursor < beatsPerBar - 1e-9) {
    cells.push({ durBeats: beatsPerBar - cursor, data: null, tieToNext: false, startInBar: cursor });
  }
  return cells;
}

/** Split each cell at beat-unit boundaries, tying note pieces, so the
 *  rendered rhythm always shows where each beat (1,2,3,4…) lands instead of
 *  hiding inner beats inside a long note/rest.  `beatUnit` is the felt beat
 *  in quarter-beats (1 in simple metres, 1.5 in compound). */
export function splitCellsAtBeats<T>(cells: BarCell<T>[], beatUnit: number): BarCell<T>[] {
  if (!(beatUnit > 0)) return cells;
  const out: BarCell<T>[] = [];
  for (const c of cells) {
    const cellEnd = c.startInBar + c.durBeats;
    let start = c.startInBar;
    while (start < cellEnd - 1e-9) {
      const boundary = (Math.floor(start / beatUnit + 1e-9) + 1) * beatUnit;
      const end = Math.min(cellEnd, boundary);
      const continues = end < cellEnd - 1e-9;
      out.push({
        durBeats: end - start,
        data: c.data,
        startInBar: start,
        // Notes crossing a beat are tied to their continuation; the final
        // piece keeps the cell's original (cross-bar) tie flag.
        tieToNext: c.data === null ? false : (continues ? true : c.tieToNext),
      });
      start = end;
    }
  }
  return out;
}

/** Notation/quantization grid (quarter-beats) per source. Jazz reads on an
 *  eighth grid; everything else keeps sixteenth resolution. */
export function melodyGridFor(source: string): number {
  return source === "weimar" ? 0.5 : 0.25;
}

interface QNote { midi: number; startBeat: number; durBeats: number }

/** Snap a melody to a notatable `grid`: align onsets, drop sub-grid
 *  collisions (keep the earlier note), clamp each note to the next onset.
 *  Run ONCE on an excerpt so playback and the rendered notation use the
 *  exact same notes — what you hear is what you see. */
export function quantizeMelody(notes: QNote[], grid: number, windowBeats: number): QNote[] {
  const snap = (x: number) => Math.round(x / grid) * grid;
  const kept: { midi: number; startBeat: number; dur0: number }[] = [];
  for (const n of [...notes].sort((a, b) => a.startBeat - b.startBeat)) {
    const s = snap(n.startBeat);
    if (s >= windowBeats - 1e-9) continue;
    const prev = kept[kept.length - 1];
    if (prev && s <= prev.startBeat + 1e-9) continue;        // collision → drop
    kept.push({ midi: n.midi, startBeat: s, dur0: Math.max(grid, snap(n.durBeats)) });
  }
  return kept.map((n, i) => {
    const next = i + 1 < kept.length ? kept[i + 1].startBeat : windowBeats;
    return { midi: n.midi, startBeat: n.startBeat, durBeats: Math.min(n.dur0, next - n.startBeat) };
  });
}

// ── Key signatures + pitch spelling ─────────────────────────────────

const MAJOR_KEY: Record<number, string> = {
  0: "C", 1: "Db", 2: "D", 3: "Eb", 4: "E", 5: "F",
  6: "Gb", 7: "G", 8: "Ab", 9: "A", 10: "Bb", 11: "B",
};
const MINOR_KEY: Record<number, string> = {
  0: "Cm", 1: "C#m", 2: "Dm", 3: "Ebm", 4: "Em", 5: "Fm",
  6: "F#m", 7: "Gm", 8: "G#m", 9: "Am", 10: "Bbm", 11: "Bm",
};

// Semitone offset from a mode's tonic down to its parent-major tonic.
const MODE_PARENT_OFFSET: Record<string, number> = {
  major: 0, ionian: 0,
  dorian: -2, phrygian: -4, lydian: -5, mixolydian: -7,
  aeolian: -3, minor: -3, locrian: -11,
};

/** VexFlow key-signature spec for a tonic pitch-class + mode name. */
export function keySpecFor(tonicPc: number, mode: string): string {
  const m = mode.toLowerCase();
  if (m === "minor" || m === "aeolian") return MINOR_KEY[((tonicPc % 12) + 12) % 12];
  const off = MODE_PARENT_OFFSET[m];
  if (off != null && off !== 0) {
    const parent = (((tonicPc + off) % 12) + 12) % 12;
    return MAJOR_KEY[parent];
  }
  return MAJOR_KEY[((tonicPc % 12) + 12) % 12];
}

const SHARP_KEYS = new Set(["G", "D", "A", "E", "B", "F#", "C#", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m"]);

/** Does a key spec use flats (so chromatic notes spell as flats)? */
export function keyIsFlat(spec: string): boolean {
  if (spec === "C" || spec === "Am") return false;     // no accidentals → sharps by convention
  return !SHARP_KEYS.has(spec);
}

const SHARP_SPELL = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
const FLAT_SPELL = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"];

/** MIDI number → VexFlow key string ("c#/4"), spelled per key flavour. */
export function midiToVexKey(midi: number, flat: boolean): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;       // MIDI 60 = C4
  return `${(flat ? FLAT_SPELL : SHARP_SPELL)[pc]}/${octave}`;
}
