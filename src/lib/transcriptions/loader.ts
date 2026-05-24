// ── Transcriptions data loader + excerpt picker ─────────────────────
//
// Loads the curated JSON the ETL emits into public/transcriptions/.
// The index (id/source/genre/length only) is fetched once up front so
// the UI can offer source/genre/length filters; each source's full
// corpus is fetched lazily the first time an item from it is needed.
//
// When the JSON is absent (ETL not yet run, or a dev build), everything
// falls back to the bundled SEED_ITEMS so the mode is always usable.

import type { TxIndex, TxIndexEntry, TxItem, TxSource } from "./types";
import { beatsPerBar } from "./types";
import { SEED_ITEMS } from "./seed";
import { harmonizeMelody } from "./accompaniment";
import { quantizeMelody, melodyGridFor } from "./notation";

const ALL_SOURCES: TxSource[] = ["thesession", "essen", "weimar", "cocopops", "ewld", "blues"];

function dataUrl(name: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}transcriptions/${name}`;
}

// ── Caches ──────────────────────────────────────────────────────────
let indexPromise: Promise<TxIndex> | null = null;
const sourceCache = new Map<TxSource, Promise<TxItem[]>>();
const itemById = new Map<string, TxItem>();

/** Normalize an item's notation conventions in place.  Some source meters read
 *  oddly and have an identical quarter-beats-per-bar equivalent that matches how
 *  players actually count the tune, so we relabel them (no beat-math change,
 *  idempotent): 3/2→6/4, and 2/2 (cut time, how Wikifonia tags many standards)
 *  →4/4 — both jazz standards and the rest are counted in 4. */
function normalizeItem(item: TxItem): TxItem {
  const [num, den] = item.timeSig;
  if (num === 3 && den === 2) item.timeSig = [6, 4];
  else if (num === 2 && den === 2) item.timeSig = [4, 4];
  return item;
}

/** Build a fallback index/corpus from the bundled seed items. */
function seedItemsBySource(source: TxSource): TxItem[] {
  return SEED_ITEMS.filter(i => i.source === source).map(normalizeItem);
}

function indexEntryFor(item: TxItem): TxIndexEntry {
  return {
    id: item.id, source: item.source, genre: item.genre, style: item.style,
    title: item.title, artist: item.artist, barCount: item.barCount,
    hasMelody: !!item.melody?.length, hasChords: !!item.chords?.length,
  };
}

function seedIndex(): TxIndex {
  const counts = Object.fromEntries(ALL_SOURCES.map(s => [s, 0])) as Record<TxSource, number>;
  for (const i of SEED_ITEMS) counts[i.source]++;
  return { generatedAt: "seed", counts, items: SEED_ITEMS.map(indexEntryFor) };
}

/** Load the global index once. Falls back to the seed index on 404/parse error. */
export function loadIndex(): Promise<TxIndex> {
  if (indexPromise) return indexPromise;
  indexPromise = (async () => {
    try {
      const res = await fetch(dataUrl("index.json"));
      if (!res.ok) throw new Error(`index ${res.status}`);
      const idx = (await res.json()) as TxIndex;
      if (!idx.items?.length) throw new Error("empty index");
      return idx;
    } catch {
      return seedIndex();
    }
  })();
  return indexPromise;
}

/** Load (and cache) the full corpus for one source. Seed fallback on failure. */
export function loadSource(source: TxSource): Promise<TxItem[]> {
  const cached = sourceCache.get(source);
  if (cached) return cached;
  const p = (async () => {
    let items: TxItem[];
    try {
      const res = await fetch(dataUrl(`${source}.json`));
      if (!res.ok) throw new Error(`${source} ${res.status}`);
      const json = (await res.json()) as TxItem[];
      items = json?.length ? json.map(normalizeItem) : seedItemsBySource(source);
    } catch {
      items = seedItemsBySource(source);
    }
    for (const it of items) itemById.set(it.id, it);
    return items;
  })();
  sourceCache.set(source, p);
  return p;
}

export interface TxFilter {
  sources: TxSource[];
  /** Inclusive bar-count floor — only items at least this long qualify so
   *  a window of the requested size always fits. */
  minBars: number;
  /** Restrict to items that carry chords (e.g. for chord-focused study). */
  requireChords?: boolean;
  /** Restrict to these style/genre sub-tags (empty/undefined = any). */
  styles?: string[];
}

/** Distinct style tags available across the given sources, from the index. */
export async function stylesForSources(sources: TxSource[]): Promise<string[]> {
  const index = await loadIndex();
  const set = new Set<string>();
  for (const e of index.items) {
    // Blues is audio-only (no melody) but its `style` is the PLAYER, so the
    // Styles filter doubles as "organize blues by player" — include it.
    if (sources.includes(e.source) && (e.hasMelody || e.source === "blues") && e.style) set.add(e.style);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Pick a random full item matching the filter, loading its corpus on demand.
 *  Returns null when nothing qualifies (e.g. all sources deselected). */
export async function pickItem(filter: TxFilter): Promise<TxItem | null> {
  const index = await loadIndex();
  const styleSet = filter.styles?.length ? new Set(filter.styles) : null;
  const pool = index.items.filter(e =>
    filter.sources.includes(e.source) &&
    // Blues is an audio-only "transcribe the real solo by ear" corpus: it has no
    // melody/notation and is a single fixed clip, so it's exempt from the
    // melody/bar-count/chord requirements that gate the notated corpora.
    (e.source === "blues"
      ? true
      : (e.barCount >= filter.minBars &&
         e.hasMelody &&
         (!filter.requireChords || e.hasChords))) &&
    (!styleSet || (e.style != null && styleSet.has(e.style)))
  );
  if (!pool.length) return null;
  const entry = pool[Math.floor(Math.random() * pool.length)];

  if (itemById.has(entry.id)) return itemById.get(entry.id)!;
  const corpus = await loadSource(entry.source);
  return corpus.find(i => i.id === entry.id) ?? itemById.get(entry.id) ?? null;
}

// ── Excerpt extraction ──────────────────────────────────────────────

export interface TxExcerpt {
  item: TxItem;
  startBar: number;
  bars: number;
  beatsPerBar: number;
  /** Window length in beats (bars * beatsPerBar). */
  windowBeats: number;
  /** Melody notes inside the window, rebased so the window starts at 0. */
  melody: TxNoteRebased[];
  /** Chords inside the window (plus the one carrying over at the start),
   *  rebased to 0 and clipped to the window. */
  chords: TxChordRebased[];
}
export type TxNoteRebased = { midi: number; startBeat: number; durBeats: number; artic?: string };

/** Shift a melody by whole octaves so it sits centered on the treble staff
 *  (low transcriptions otherwise pile ledger lines below the staff).  Octave is
 *  perceptually equivalent for a by-ear melody exercise, and shifting the whole
 *  line keeps notation == playback.  Targets a mean in C4..G#5. */
function fitMelodyOctave(melody: TxNoteRebased[]): void {
  if (!melody.length) return;
  let mean = melody.reduce((s, n) => s + n.midi, 0) / melody.length;
  let shift = 0;
  while (mean < 60 && shift < 36) { mean += 12; shift += 12; }
  while (mean > 80 && shift > -36) { mean -= 12; shift -= 12; }
  if (shift) for (const n of melody) n.midi += shift;
}
export type TxChordRebased = {
  sym: string; rootPc: number; intervals: number[]; bassPc?: number;
  startBeat: number; durBeats: number;
};

/** Slice a random `bars`-bar window out of an item.  Notes/chords are
 *  clipped to the window edges and rebased so the window begins at beat 0. */
export function pickExcerpt(item: TxItem, bars: number): TxExcerpt {
  // Blues: audio-only — no notes to slice, but carry the requested bar count so
  // the player can size the audio clip to it (see TranscriptionsTab).
  if (item.source === "blues") {
    return { item, startBar: 0, bars, beatsPerBar: 4, windowBeats: bars * 4, melody: [], chords: [] };
  }
  const bpb = beatsPerBar(item.timeSig);
  const usableBars = Math.min(bars, item.barCount);
  const maxStartBar = Math.max(0, item.barCount - usableBars);
  // Avoid a thin/empty stretch (intro rests, a single held note, a gap): try a
  // few random windows and keep the first with MORE THAN 4 melody notes, so an
  // excerpt always has enough to hear/read.  Falls back to the last try.
  const melodyCountIn = (sb: number) => {
    const ws = sb * bpb, we = ws + usableBars * bpb;
    let n = 0;
    for (const m of item.melody ?? []) if (m.startBeat < we - 1e-6 && m.startBeat + m.durBeats > ws + 1e-6) n++;
    return n;
  };
  let startBar = Math.floor(Math.random() * (maxStartBar + 1));
  for (let tries = 0; tries < 12 && melodyCountIn(startBar) <= 4; tries++) {
    startBar = Math.floor(Math.random() * (maxStartBar + 1));
  }
  const winStart = startBar * bpb;
  const windowBeats = usableBars * bpb;
  const winEnd = winStart + windowBeats;

  const melody: TxNoteRebased[] = [];
  for (const n of item.melody ?? []) {
    const end = n.startBeat + n.durBeats;
    if (end <= winStart || n.startBeat >= winEnd) continue;       // outside
    const s = Math.max(n.startBeat, winStart);
    const e = Math.min(end, winEnd);
    melody.push({ midi: n.midi, startBeat: s - winStart, durBeats: e - s, artic: n.artic });
  }
  // Quantize once so playback and the rendered notation use identical notes.
  const qMel = quantizeMelody(melody, melodyGridFor(item.source), windowBeats);
  melody.length = 0; melody.push(...qMel);
  fitMelodyOctave(melody);   // center low transcriptions on the treble staff

  const chords: TxChordRebased[] = [];
  for (const c of item.chords ?? []) {
    const end = c.startBeat + c.durBeats;
    if (end <= winStart || c.startBeat >= winEnd) continue;
    const s = Math.max(c.startBeat, winStart);
    const e = Math.min(end, winEnd);
    chords.push({
      sym: c.sym, rootPc: c.rootPc, intervals: c.intervals, bassPc: c.bassPc,
      startBeat: s - winStart, durBeats: e - s,
    });
  }

  // Melody-only tunes (folk/trad): infer a fitting diatonic progression so
  // the answer shows chord symbols and playback can comp the accompaniment.
  // (Blues returned early above — it's audio-only, never harmonized.)
  if (!chords.length && melody.length) {
    for (const c of harmonizeMelody(melody, item.key, bpb, usableBars)) {
      chords.push({ sym: c.sym, rootPc: c.rootPc, intervals: c.intervals, bassPc: c.bassPc, startBeat: c.startBeat, durBeats: c.durBeats });
    }
  }

  return { item, startBar, bars: usableBars, beatsPerBar: bpb, windowBeats, melody, chords };
}

/** A whole-item excerpt (the full tune from bar 1), for "play the full
 *  song".  Same shape as pickExcerpt, with melody-only tunes harmonized. */
export function fullExcerpt(item: TxItem): TxExcerpt {
  if (item.source === "blues") {
    return { item, startBar: 0, bars: 1, beatsPerBar: 4, windowBeats: 4, melody: [], chords: [] };
  }
  const bpb = beatsPerBar(item.timeSig);
  const rawMelody: TxNoteRebased[] = (item.melody ?? []).map(n => ({ midi: n.midi, startBeat: n.startBeat, durBeats: n.durBeats, artic: n.artic }));
  const melody = quantizeMelody(rawMelody, melodyGridFor(item.source), item.barCount * bpb);
  fitMelodyOctave(melody);   // center low transcriptions on the treble staff
  const chords: TxChordRebased[] = (item.chords ?? []).map(c => ({ ...c }));
  if (!chords.length && melody.length) {
    for (const c of harmonizeMelody(melody, item.key, bpb, item.barCount)) {
      chords.push({ sym: c.sym, rootPc: c.rootPc, intervals: c.intervals, bassPc: c.bassPc, startBeat: c.startBeat, durBeats: c.durBeats });
    }
  }
  return { item, startBar: 0, bars: item.barCount, beatsPerBar: bpb, windowBeats: item.barCount * bpb, melody, chords };
}
