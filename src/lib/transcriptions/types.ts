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
export type TxSource = "thesession" | "essen" | "weimar" | "cocopops" | "ewld" | "blues";

/** Coarse genre shown in the UI and used for the genre filter. */
export type TxGenre = "Irish Trad" | "Folk" | "Jazz" | "Pop/Rock" | "Blues";

export const SOURCE_GENRE: Record<TxSource, TxGenre> = {
  thesession: "Irish Trad",
  essen: "Folk",
  weimar: "Jazz",
  cocopops: "Pop/Rock",
  ewld: "Jazz",
  blues: "Blues",
};

export const SOURCE_LABEL: Record<TxSource, string> = {
  thesession: "The Session",
  essen: "Essen Folksong",
  weimar: "Weimar Jazz DB",
  cocopops: "CoCoPops / Billboard",
  ewld: "Jazz Standards (EWLD)",
  blues: "Blues Guitar",
};

/** A single melody note. `midi` is a standard MIDI pitch (C4 = 60). */
export interface TxNote {
  midi: number;
  startBeat: number;
  durBeats: number;
  /** Played inflection, when the source annotates it (e.g. Weimar Jazz DB
   *  f0_mod): "bend" | "slide" | "vibrato" | "fall".  Shown as a small mark
   *  above the note in the notation. */
  artic?: string;
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
  /** Specific YouTube video id of the actual recording (when known), so the
   *  Transcriptions player can embed it and seek to the excerpt's spot. */
  vid?: string;
  /** Seconds into the recording where the transcription's bar 0 begins (e.g.
   *  Weimar's solo start), so playback seeks to the real solo, not the top. */
  solostart?: number;
  /** Per-bar start time in seconds, computed from the transcription's own
   *  tempo map (handles tempo/metre changes) — used to seek the real recording
   *  accurately to a given bar.  Index = bar number. */
  barSec?: number[];
  /** Path (under public/blues/) to a LOCAL audio file of the actual recording,
   *  so blues plays offline.  e.g. "audio/<videoId>.mp3". */
  audio?: string;
  /** Seconds of audio to play from `solostart` — the solo clip length (blues is
   *  audio-only: you transcribe it by ear, so there is no melody/notation). */
  soloLen?: number;
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
