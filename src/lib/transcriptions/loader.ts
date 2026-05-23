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

const ALL_SOURCES: TxSource[] = ["thesession", "essen", "weimar", "cocopops", "ewld"];

function dataUrl(name: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base}transcriptions/${name}`;
}

// ── Caches ──────────────────────────────────────────────────────────
let indexPromise: Promise<TxIndex> | null = null;
const sourceCache = new Map<TxSource, Promise<TxItem[]>>();
const itemById = new Map<string, TxItem>();

/** Normalize an item's notation conventions in place.  3/2 has the same six
 *  quarter-beats per bar as 6/4 but reads far more clearly on the staff (and
 *  matches how players count these tunes), so we relabel it — no beat math
 *  changes since beatsPerBar([3,2]) === beatsPerBar([6,4]). Idempotent. */
function normalizeItem(item: TxItem): TxItem {
  if (item.timeSig[0] === 3 && item.timeSig[1] === 2) item.timeSig = [6, 4];
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
    if (sources.includes(e.source) && e.hasMelody && e.style) set.add(e.style);
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
    e.barCount >= filter.minBars &&
    e.hasMelody &&                                  // this is a melody-transcription tool
    (!filter.requireChords || e.hasChords) &&
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
export type TxNoteRebased = { midi: number; startBeat: number; durBeats: number };
export type TxChordRebased = {
  sym: string; rootPc: number; intervals: number[]; bassPc?: number;
  startBeat: number; durBeats: number;
};

/** Slice a random `bars`-bar window out of an item.  Notes/chords are
 *  clipped to the window edges and rebased so the window begins at beat 0. */
export function pickExcerpt(item: TxItem, bars: number): TxExcerpt {
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
    melody.push({ midi: n.midi, startBeat: s - winStart, durBeats: e - s });
  }
  // Quantize once so playback and the rendered notation use identical notes.
  const qMel = quantizeMelody(melody, melodyGridFor(item.source), windowBeats);
  melody.length = 0; melody.push(...qMel);

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
  const bpb = beatsPerBar(item.timeSig);
  const rawMelody: TxNoteRebased[] = (item.melody ?? []).map(n => ({ midi: n.midi, startBeat: n.startBeat, durBeats: n.durBeats }));
  const melody = quantizeMelody(rawMelody, melodyGridFor(item.source), item.barCount * bpb);
  const chords: TxChordRebased[] = (item.chords ?? []).map(c => ({ ...c }));
  if (!chords.length && melody.length) {
    for (const c of harmonizeMelody(melody, item.key, bpb, item.barCount)) {
      chords.push({ sym: c.sym, rootPc: c.rootPc, intervals: c.intervals, bassPc: c.bassPc, startBeat: c.startBeat, durBeats: c.durBeats });
    }
  }
  return { item, startBar: 0, bars: item.barCount, beatsPerBar: bpb, windowBeats: item.barCount * bpb, melody, chords };
}
