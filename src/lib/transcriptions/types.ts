// ── Transcriptions mode — normalized data schema ───────────────────────
//
// Four external corpora (The Session, Essen Folksong, Weimar Jazz DB,
// CoCoPops/Billboard) are parsed OFFLINE by the ETL scripts under
// scripts/build-transcriptions/ and normalized into the single shape
// below.  The browser never touches the raw corpora — it fetches the
// curated JSON the ETL emits into public/transcriptions/.
//
// Everything is expressed in standard 12-tone equal temperament.  This
// mode is intentionally 12-EDO only: the source material is tonal
// Western (and Chinese-pentatonic) repertoire and the AudioEngine plays
// it back at edo = 12 regardless of the app's current temperament.
//
// Timing convention: every onset/duration is in QUARTER-NOTE BEATS
// measured from the start of the piece (beat 0 = downbeat of bar 1).
// Bar boundaries are derived from `timeSig`, so a window of N bars is
// the half-open beat range [startBar*beatsPerBar, (startBar+N)*beatsPerBar).

/** Which corpus an item came from. Doubles as the coarse genre key. */
export type TxSource = "thesession" | "essen" | "weimar" | "cocopops" | "ewld";

/** Coarse genre shown in the UI and used for the genre filter. */
export type TxGenre = "Irish Trad" | "Folk" | "Jazz" | "Pop/Rock";

export const SOURCE_GENRE: Record<TxSource, TxGenre> = {
  thesession: "Irish Trad",
  essen: "Folk",
  weimar: "Jazz",
  cocopops: "Pop/Rock",
  ewld: "Jazz",
};

export const SOURCE_LABEL: Record<TxSource, string> = {
  thesession: "The Session",
  essen: "Essen Folksong",
  weimar: "Weimar Jazz DB",
  cocopops: "CoCoPops / Billboard",
  ewld: "Jazz Standards (EWLD)",
};

/** A single melody note. `midi` is a standard MIDI pitch (C4 = 60). */
export interface TxNote {
  midi: number;
  startBeat: number;
  durBeats: number;
}

/** A chord change. Held until the next chord's `startBeat` (or item end).
 *  `sym` is the human-readable symbol shown above the bar (e.g. "Cmaj7",
 *  "G7", "F#m7b5"). `rootPc` (0-11) and `intervals` (semitone offsets
 *  from the root, root included as 0) are precomputed by the ETL so the
 *  browser never has to re-parse symbols for playback. `bassPc` carries
 *  a slash-chord bass when present (e.g. "C/E"). */
export interface TxChord {
  sym: string;
  rootPc: number;
  intervals: number[];
  bassPc?: number;
  startBeat: number;
  durBeats: number;
}

/** Tonal center + mode for the key signature and notation. */
export interface TxKey {
  /** Pitch class of the tonic, 0-11 (C = 0). */
  tonicPc: number;
  /** "major" | "minor" | "dorian" | … — free-form, used for display +
   *  VexFlow key-signature selection. */
  mode: string;
}

/** One transcription item in normalized form. */
export interface TxItem {
  id: string;
  source: TxSource;
  genre: TxGenre;
  /** Finer style/region tag when the source provides one (e.g. Weimar
   *  "Cool"/"Bebop", Essen region "deutschl"/"china"). Optional. */
  style?: string;
  title: string;
  artist?: string;
  key: TxKey;
  /** [numerator, denominator], e.g. [4,4], [6,8], [3,4]. */
  timeSig: [number, number];
  tempoBpm: number;
  /** Total bar count of the stored excerpt/tune. */
  barCount: number;
  melody?: TxNote[];
  chords?: TxChord[];
  /** Pre-built YouTube search query, e.g. "Danny Boy traditional". */
  youtubeQuery: string;
}

/** Lightweight index entry — loaded up front so the UI can filter by
 *  source/genre/length without pulling whole corpora into memory. */
export interface TxIndexEntry {
  id: string;
  source: TxSource;
  genre: TxGenre;
  style?: string;
  title: string;
  artist?: string;
  barCount: number;
  hasMelody: boolean;
  hasChords: boolean;
}

/** Top-level index.json shape emitted by the ETL. */
export interface TxIndex {
  generatedAt: string;
  counts: Record<TxSource, number>;
  items: TxIndexEntry[];
}

/** Quarter-note beats per bar for a time signature.  A quarter note is
 *  one beat, so 6/8 = 6 eighth-notes = 3 quarter-note beats. */
export function beatsPerBar([num, den]: [number, number]): number {
  return (num * 4) / den;
}
