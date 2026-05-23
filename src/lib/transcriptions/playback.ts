// ── Transcriptions playback (sample-based) ──────────────────────────
//
// Plays an excerpt with real instrument samples via `smplr` (danigb),
// loading General-MIDI soundfonts from its hosted sample CDN.  Each
// source gets genre-appropriate timbres: a flute for trad/folk melody,
// tenor sax over piano comping + upright bass for jazz, piano + guitar
// + bass for pop.
//
// All output is routed through the app's shared AudioContext and play
// limiter (via audioEngine), so the global volume slider and dynamics
// apply uniformly with the rest of the trainer.

import { Soundfont } from "smplr";
import { audioEngine } from "@/lib/audioEngine";
import type { TxExcerpt } from "./loader";
import type { TxSource } from "./types";
import { compEvents, type CompGenre } from "./accompaniment";

type SoundfontInst = ReturnType<typeof Soundfont>;

/** GM instrument assignment per corpus. `chords`/`bass` omitted ⇒ that
 *  voice isn't played (melody-only sources). */
interface VoiceKit {
  melody: string;
  chords?: string;
  bass?: string;
}

const SOURCE_KIT: Record<TxSource, VoiceKit> = {
  // Folk/trad melodies are auto-harmonized into a guitar + upright-bass
  // arpeggio accompaniment (see harmonize.ts) under the flute lead.
  thesession: { melody: "flute", chords: "acoustic_guitar_nylon", bass: "acoustic_bass" },
  essen: { melody: "flute", chords: "acoustic_guitar_nylon", bass: "acoustic_bass" },
  weimar: { melody: "tenor_sax", chords: "acoustic_grand_piano", bass: "acoustic_bass" },
  cocopops: { melody: "acoustic_grand_piano", chords: "acoustic_guitar_steel", bass: "acoustic_bass" },
};

// ── Instrument cache + shared output gain ───────────────────────────
const instCache = new Map<string, Promise<SoundfontInst>>();
let txGain: GainNode | null = null;

function outputGain(): GainNode {
  const ctx = audioEngine.getOutputContext();
  if (!txGain || txGain.context !== ctx) {
    txGain = ctx.createGain();
    txGain.gain.value = 1;
    txGain.connect(audioEngine.getPlayDestination());
  }
  return txGain;
}

function getInstrument(name: string): Promise<SoundfontInst> {
  const cached = instCache.get(name);
  if (cached) return cached;
  const ctx = audioEngine.getOutputContext();
  const inst = Soundfont(ctx, { instrument: name, destination: outputGain() });
  const p = inst.ready.then(() => inst);
  instCache.set(name, p);
  return p;
}

/** Distinct instrument names a set of sources will need — for preloading. */
export function instrumentsForSources(sources: TxSource[]): string[] {
  const names = new Set<string>();
  for (const s of sources) {
    const kit = SOURCE_KIT[s];
    names.add(kit.melody);
    if (kit.chords) names.add(kit.chords);
    if (kit.bass) names.add(kit.bass);
  }
  return [...names];
}

/** Preload (and cache) the soundfonts a set of sources will use. */
export async function ensureInstruments(sources: TxSource[]): Promise<void> {
  await Promise.all(instrumentsForSources(sources).map(getInstrument));
}

const COMP_GENRE: Record<TxSource, CompGenre> = {
  thesession: "folk", essen: "folk", weimar: "jazz", cocopops: "pop",
};

export interface PlayOptions {
  bpm: number;
  withMelody: boolean;
  withChords: boolean;
  /** Beats of count-in clicks before the music starts (0 = none). */
  countInBeats?: number;
  /** Keep a metronome click going under the excerpt. */
  metronome?: boolean;
  /** 0..~1.5 — multiplied into the shared output gain. */
  volume?: number;
}

export interface PlayHandle {
  /** Wall-clock seconds the audible excerpt lasts (excluding count-in). */
  durationSec: number;
  /** Stop everything immediately (in-flight notes + scheduled clicks). */
  stop: () => void;
}

// Track scheduled metronome oscillators so stop() can silence them.
let activeClicks: { osc: OscillatorNode; gain: GainNode }[] = [];

function scheduleClick(time: number, accent: boolean, dest: AudioNode) {
  const ctx = audioEngine.getOutputContext();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.value = accent ? 1600 : 1050;
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, time + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  osc.connect(g); g.connect(dest);
  osc.start(time); osc.stop(time + 0.06);
  const entry = { osc, gain: g };
  activeClicks.push(entry);
  osc.onended = () => { activeClicks = activeClicks.filter(e => e !== entry); };
}

/** Stop all transcription audio immediately. */
export function stopPlayback() {
  for (const p of instCache.values()) p.then(inst => inst.stop()).catch(() => {});
  for (const c of activeClicks) {
    try { c.gain.gain.cancelScheduledValues(0); c.gain.gain.value = 0; c.osc.stop(); } catch { /* already stopped */ }
  }
  activeClicks = [];
}

/** Schedule and start an excerpt. Resolves once instruments are loaded
 *  and notes are scheduled; audio then plays on the AudioContext clock. */
export async function playExcerpt(ex: TxExcerpt, opts: PlayOptions): Promise<PlayHandle> {
  const kit = SOURCE_KIT[ex.item.source];
  const ctx = audioEngine.getOutputContext();
  await audioEngine.resume();

  // Apply volume to the shared output gain.
  outputGain().gain.value = opts.volume ?? 1;

  const secPerBeat = 60 / opts.bpm;
  const countIn = opts.countInBeats ?? 0;

  // Preload exactly the instruments this excerpt needs before scheduling,
  // so every note lands on the AudioContext clock with no gaps.
  const need: string[] = [];
  if (opts.withMelody) need.push(kit.melody);
  if (opts.withChords && kit.chords) need.push(kit.chords);
  if (opts.withChords && kit.bass) need.push(kit.bass);
  const loaded = new Map<string, SoundfontInst>();
  await Promise.all([...new Set(need)].map(async name => { loaded.set(name, await getInstrument(name)); }));

  // Stop any prior playback now that loading (which can take a while) is done.
  stopPlayback();

  const lead = 0.15;
  const t0 = ctx.currentTime + lead + countIn * secPerBeat;
  const dest = outputGain();

  // ── Count-in + metronome clicks ───────────────────────────────────
  // Felt pulse: quarter note in simple metres, dotted-quarter in compound.
  const [num, den] = ex.item.timeSig;
  const pulseBeats = den === 8 && num % 3 === 0 ? 1.5 : 1;
  if (countIn > 0) {
    for (let b = 0; b < countIn; b += pulseBeats) {
      scheduleClick(t0 - (countIn - b) * secPerBeat, b === 0, dest);
    }
  }
  if (opts.metronome) {
    const bpb = ex.beatsPerBar;
    for (let b = 0; b < ex.windowBeats - 1e-6; b += pulseBeats) {
      const isDownbeat = Math.abs(b % bpb) < 1e-6;
      scheduleClick(t0 + b * secPerBeat, isDownbeat, dest);
    }
  }

  // ── Melody ────────────────────────────────────────────────────────
  if (opts.withMelody) {
    const inst = loaded.get(kit.melody)!;
    for (const note of ex.melody) {
      inst.start({
        note: note.midi,
        time: t0 + note.startBeat * secPerBeat,
        duration: Math.max(0.05, note.durBeats * secPerBeat * 0.96),
        velocity: 96,
      });
    }
  }

  // ── Accompaniment (idiomatic comping + bass, per genre) ───────────
  // compEvents turns the chord track into genre/metre-specific comping
  // (jazz Charleston + walking bass, pop, folk boom-chick, waltz, 6/8)
  // rather than a single block per chord.
  if (opts.withChords && kit.chords && ex.chords.length) {
    const chordInst = loaded.get(kit.chords)!;
    const bassInst = kit.bass ? loaded.get(kit.bass)! : chordInst;
    const comp = compEvents(ex.chords, COMP_GENRE[ex.item.source], ex.beatsPerBar, ex.item.timeSig, ex.windowBeats);
    for (const e of comp.chord) {
      chordInst.start({ note: e.midi, time: t0 + e.startBeat * secPerBeat, duration: Math.max(0.08, e.durBeats * secPerBeat * 0.95), velocity: e.velocity });
    }
    for (const e of comp.bass) {
      bassInst.start({ note: e.midi, time: t0 + e.startBeat * secPerBeat, duration: Math.max(0.08, e.durBeats * secPerBeat * 0.95), velocity: e.velocity });
    }
  }

  // Hard-cut every voice just after the window ends so sample ring-out
  // doesn't bleed well past the requested N bars ("2 bars" stays ≈ 2 bars).
  const endTime = t0 + ex.windowBeats * secPerBeat;
  for (const inst of loaded.values()) {
    try { inst.stop({ time: endTime + 0.4 }); } catch { /* */ }
  }

  const durationSec = ex.windowBeats * secPerBeat;
  return {
    durationSec,
    stop: stopPlayback,
  };
}

export { SOURCE_KIT };
