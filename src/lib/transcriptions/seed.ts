// ── Bundled seed transcriptions ─────────────────────────────────────
//
// A tiny set of public-domain / demo items so the Transcriptions mode is
// fully functional BEFORE the offline ETL has produced the real
// public/transcriptions/ JSON.  Once the ETL output is present the loader
// fetches that instead and these are never shown.  Kept deliberately
// small and clearly labelled "(demo)".

import type { TxItem, TxNote, TxChord } from "./types";
import { parseChordSymbol } from "./chordSymbols";

const n = (midi: number, startBeat: number, durBeats: number): TxNote => ({ midi, startBeat, durBeats });

const ch = (sym: string, startBeat: number, durBeats: number): TxChord => {
  const p = parseChordSymbol(sym)!;
  return { sym, rootPc: p.rootPc, intervals: p.intervals, bassPc: p.bassPc, startBeat, durBeats };
};

// "Twinkle, Twinkle" — public domain. 4/4, C major, melody only (Essen
// melodies carry no harmony).
const twinkle: TxItem = {
  id: "seed-essen-twinkle",
  source: "essen", genre: "Folk", style: "demo",
  title: "Twinkle, Twinkle (demo)",
  key: { tonicPc: 0, mode: "major" },
  timeSig: [4, 4], tempoBpm: 100, barCount: 4,
  melody: [
    n(60, 0, 1), n(60, 1, 1), n(67, 2, 1), n(67, 3, 1),
    n(69, 4, 1), n(69, 5, 1), n(67, 6, 2),
    n(65, 8, 1), n(65, 9, 1), n(64, 10, 1), n(64, 11, 1),
    n(62, 12, 1), n(62, 13, 1), n(60, 14, 2),
  ],
  youtubeQuery: "Twinkle Twinkle Little Star melody",
};

// Simple 6/8 jig figure — D major, melody only (The Session = melody).
const jig: TxItem = {
  id: "seed-thesession-jig",
  source: "thesession", genre: "Irish Trad", style: "jig",
  title: "Practice Jig (demo)",
  key: { tonicPc: 2, mode: "major" },
  timeSig: [6, 8], tempoBpm: 120, barCount: 4,
  melody: [
    // bar 1
    n(62, 0, 0.5), n(66, 0.5, 0.5), n(69, 1, 0.5), n(74, 1.5, 0.5), n(69, 2, 0.5), n(66, 2.5, 0.5),
    // bar 2
    n(64, 3, 0.5), n(67, 3.5, 0.5), n(71, 4, 0.5), n(74, 4.5, 0.5), n(71, 5, 0.5), n(67, 5.5, 0.5),
    // bar 3
    n(62, 6, 0.5), n(66, 6.5, 0.5), n(69, 7, 0.5), n(66, 7.5, 0.5), n(69, 8, 0.5), n(71, 8.5, 0.5),
    // bar 4
    n(74, 9, 1.5), n(69, 10.5, 0.5), n(66, 11, 0.5), n(62, 11.5, 0.5),
  ],
  youtubeQuery: "Irish jig traditional fiddle",
};

// ii–V–I bebop demo — 4/4, C major, melody + chords (Weimar = solo + changes).
const bebop: TxItem = {
  id: "seed-weimar-bebop",
  source: "weimar", genre: "Jazz", style: "demo",
  title: "ii–V–I Lick (demo)",
  artist: "demo",
  key: { tonicPc: 0, mode: "major" },
  timeSig: [4, 4], tempoBpm: 140, barCount: 4,
  melody: [
    // Dm7 (bar 1)
    n(62, 0, 0.5), n(65, 0.5, 0.5), n(69, 1, 0.5), n(72, 1.5, 0.5), n(74, 2, 0.5), n(72, 2.5, 0.5), n(69, 3, 0.5), n(65, 3.5, 0.5),
    // G7 (bar 2)
    n(67, 4, 0.5), n(71, 4.5, 0.5), n(74, 5, 0.5), n(77, 5.5, 0.5), n(76, 6, 0.5), n(74, 6.5, 0.5), n(71, 7, 0.5), n(67, 7.5, 0.5),
    // Cmaj7 (bars 3-4)
    n(72, 8, 1), n(71, 9, 1), n(67, 10, 1), n(64, 11, 1),
    n(60, 12, 4),
  ],
  chords: [ch("Dm7", 0, 4), ch("G7", 4, 4), ch("Cmaj7", 8, 8)],
  youtubeQuery: "ii V I jazz lick",
};

// I–V–vi–IV pop loop — 4/4, C major, melody + chords (CoCoPops = lead + chords).
const pop: TxItem = {
  id: "seed-cocopops-pop",
  source: "cocopops", genre: "Pop/Rock", style: "demo",
  title: "I–V–vi–IV Loop (demo)",
  artist: "demo",
  key: { tonicPc: 0, mode: "major" },
  timeSig: [4, 4], tempoBpm: 96, barCount: 4,
  melody: [
    n(67, 0, 2), n(64, 2, 2),
    n(67, 4, 2), n(71, 6, 2),
    n(72, 8, 2), n(69, 10, 2),
    n(65, 12, 2), n(64, 14, 2),
  ],
  chords: [ch("C", 0, 4), ch("G", 4, 4), ch("Am", 8, 4), ch("F", 12, 4)],
  youtubeQuery: "I V vi IV pop chord progression",
};

export const SEED_ITEMS: TxItem[] = [twinkle, jig, bebop, pop];
