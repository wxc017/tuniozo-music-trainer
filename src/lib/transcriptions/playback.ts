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

import { Soundfont, SplendidGrandPiano, Smolken, Reverb } from "smplr";
import { audioEngine } from "@/lib/audioEngine";
import type { TxExcerpt } from "./loader";
import type { TxSource } from "./types";
import { compEvents, compGenreFor } from "./accompaniment";

// Upgrade the two voices that have reliable, smplr-native sample sets — a
// multi-velocity Steinway (SplendidGrandPiano) for piano and a sampled pizzicato
// upright (Smolken) for bass.  Guitar / sax / flute use the GM soundfont: a
// URL-based tonejs Sampler loaded but produced NO sound in-browser (melody went
// silent), so reliability wins over timbre there until that's diagnosed live.
type SoundfontInst =
  | ReturnType<typeof Soundfont>
  | ReturnType<typeof SplendidGrandPiano>
  | ReturnType<typeof Smolken>;

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
  // Nylon comps warmer than the plinky GM steel; bass is the sampled upright.
  cocopops: { melody: "acoustic_grand_piano", chords: "acoustic_guitar_nylon", bass: "acoustic_bass" },
  // Jazz-standard lead sheets: sax head over piano comp + upright (a combo).
  ewld: { melody: "tenor_sax", chords: "acoustic_grand_piano", bass: "acoustic_bass" },
  // Blues solos: overdriven lead guitar over a clean comp guitar + upright bass.
  blues: { melody: "overdriven_guitar", chords: "electric_guitar_clean", bass: "acoustic_bass" },
};

// ── Instrument cache + shared output gain ───────────────────────────
const instCache = new Map<string, Promise<SoundfontInst>>();
let txGain: GainNode | null = null;
let reverbCtx: BaseAudioContext | null = null;       // ctx the reverb send is wired for

function outputGain(): GainNode {
  const ctx = audioEngine.getOutputContext();
  if (!txGain || txGain.context !== ctx) {
    txGain = ctx.createGain();
    txGain.gain.value = 1;
    txGain.connect(audioEngine.getPlayDestination());
    reverbCtx = null;                                 // rebuild reverb for the new context
  }
  return txGain;
}

/** Wire a subtle algorithmic reverb as a parallel send off the dry bus.  A
 *  little room is the cheapest way to stop sampled notes sounding bone-dry and
 *  disconnected — it glues melody + comp + bass into one space.  Idempotent
 *  per AudioContext; reverb is optional (failure is non-fatal). */
async function ensureReverb(): Promise<void> {
  const ctx = audioEngine.getOutputContext();
  const bus = outputGain();
  if (reverbCtx === ctx) return;
  try {
    const reverb = new Reverb(ctx as AudioContext);
    await reverb.ready();
    const send = ctx.createGain();
    send.gain.value = 0.18;                           // subtle — space, not a cathedral
    bus.connect(send);
    send.connect(reverb.input);
    reverb.connect(audioEngine.getPlayDestination());
    try { reverb.getParam("dry")?.setValueAtTime(0, ctx.currentTime); } catch { /* */ }
    try { reverb.getParam("wet")?.setValueAtTime(1, ctx.currentTime); } catch { /* */ }
    reverbCtx = ctx;
  } catch { /* reverb is a nice-to-have */ }
}

function getInstrument(name: string): Promise<SoundfontInst> {
  const cached = instCache.get(name);
  if (cached) return cached;
  // Evict on failure so a transient CDN error doesn't poison the cache (a
  // rejected promise would otherwise break this instrument until reload).
  const p = loadInstrument(name).catch(err => { instCache.delete(name); throw err; });
  instCache.set(name, p);
  return p;
}

/** Pick the best available timbre for a corpus instrument: dedicated sampled
 *  instruments first (piano/bass), then recorded tonejs samples (guitar/sax/
 *  flute), and the GM soundfont as a universal fallback.  CRITICAL: a single
 *  preferred-instrument failure (a flaky sample CDN, a rejected `ready`) must
 *  NOT break playback, so EVERY preferred path is guarded and falls through to
 *  the GM soundfont, which loads from smplr's own CDN. */
async function loadInstrument(name: string): Promise<SoundfontInst> {
  const ctx = audioEngine.getOutputContext();
  const dest = outputGain();
  try {
    if (name === "acoustic_grand_piano") {
      const i = SplendidGrandPiano(ctx, { destination: dest }); await i.ready; return i;
    }
    if (name === "acoustic_bass") {
      const i = Smolken(ctx, { instrument: "Pizzicato", destination: dest }); await i.ready; return i;
    }
  } catch { /* preferred timbre unavailable → fall back to GM below */ }
  const i = Soundfont(ctx, { instrument: name, destination: dest }); await i.ready; return i;
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

export interface PlayOptions {
  bpm: number;
  withMelody: boolean;
  withChords: boolean;
  /** Play the bass line. Independent of chords so "bass off" = silent bass. */
  withBass: boolean;
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
// smplr start() returns a stop-fn per note.  We collect them so Stop can
// cancel notes scheduled in the FUTURE (a full song queues hundreds up
// front; inst.stop() alone only kills currently-sounding voices).
let activeStops: Array<(time?: number) => void> = [];

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
  // Cancel every scheduled note (including ones not yet started — full-song
  // playback queues the whole tune up front).
  for (const stop of activeStops) { try { stop(0); } catch { /* */ } }
  activeStops = [];
  for (const p of instCache.values()) p.then(inst => inst.stop()).catch(() => {});
  for (const c of activeClicks) {
    try { c.gain.gain.cancelScheduledValues(0); c.gain.gain.value = 0; c.osc.stop(); } catch { /* already stopped */ }
  }
  activeClicks = [];
  stopDrone();
}

// ── Tonic drone ─────────────────────────────────────────────────────
// A momentary tonic + fifth + octave pad so the ear can orient to the key
// before transcribing.  Synthesised (triangle oscillators) so it's instant —
// no sample load — and routed through the shared bus like everything else.
let droneNodes: { osc: OscillatorNode; gain: GainNode }[] = [];

export function stopDrone(): void {
  const now = (() => { try { return audioEngine.getOutputContext().currentTime; } catch { return 0; } })();
  for (const { osc, gain } of droneNodes) {
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.stop(now + 0.15);
    } catch { /* already stopped */ }
  }
  droneNodes = [];
}

/** Sound the tonic (root + fifth + octave) for `seconds`, to orient the ear. */
export async function playTonicDrone(tonicPc: number, seconds = 3, volume = 1): Promise<void> {
  const ctx = audioEngine.getOutputContext();
  await audioEngine.resume();
  stopDrone();
  const dest = outputGain();
  const t = ctx.currentTime;
  const base = 48 + (((tonicPc % 12) + 12) % 12);     // tonic in C3..B3
  const peak = 0.16 * volume;
  for (const [m, lvl] of [[base, peak], [base + 7, peak * 0.7], [base + 12, peak * 0.5]] as const) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(lvl, t + 0.05);
    g.gain.setValueAtTime(lvl, t + Math.max(0.1, seconds - 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + seconds + 0.05);
    const entry = { osc, gain: g };
    droneNodes.push(entry);
    osc.onended = () => { droneNodes = droneNodes.filter(e => e !== entry); };
  }
}

/** Schedule and start an excerpt. Resolves once instruments are loaded
 *  and notes are scheduled; audio then plays on the AudioContext clock. */
export async function playExcerpt(ex: TxExcerpt, opts: PlayOptions): Promise<PlayHandle> {
  const kit = SOURCE_KIT[ex.item.source];
  const ctx = audioEngine.getOutputContext();
  await audioEngine.resume();
  await ensureReverb();

  // Apply volume to the shared output gain.
  outputGain().gain.value = opts.volume ?? 1;

  const secPerBeat = 60 / opts.bpm;
  const countIn = opts.countInBeats ?? 0;

  // Preload exactly the instruments this excerpt needs before scheduling,
  // so every note lands on the AudioContext clock with no gaps.
  const need: string[] = [];
  if (opts.withMelody) need.push(kit.melody);
  if (opts.withChords && kit.chords) need.push(kit.chords);
  if (opts.withBass && kit.bass) need.push(kit.bass);
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

  // ── Humanize ──────────────────────────────────────────────────────
  // Quantized events sound robotic, so: swing the off-beat eighths for
  // swing-jazz, and give every voice subtle micro-timing + velocity
  // variation.  Seeded → a Replay sounds identical.  Velocities also set
  // the mix: melody on top, comping softer, bass underneath.
  const swing = compGenreFor(ex.item.source, ex.item.style) === "jazz" && !(den === 8 && num % 3 === 0);
  let hseed = (Math.round(ex.windowBeats * 131 + (ex.item.tempoBpm || 100)) >>> 0) || 1;
  const hrand = () => { hseed = (hseed * 1103515245 + 12345) & 0x7fffffff; return hseed / 0x7fffffff; };
  const humanTime = (beat: number) => {
    let t = t0 + beat * secPerBeat;
    const frac = beat - Math.floor(beat);
    if (swing) {
      if (Math.abs(frac - 0.5) < 0.06) t += secPerBeat / 6;          // swung 8ths (triplet feel)
    } else if (Math.abs(frac - 0.5) < 0.06) {
      t += secPerBeat * 0.03;                                        // subtle laid-back 8ths (un-square straight feel)
    }
    return t + (hrand() * 2 - 1) * 0.015;            // ±15 ms human jitter
  };
  const hvel = (v: number) => Math.max(1, Math.min(127, Math.round(v + (hrand() * 2 - 1) * 6)));

  // Felt pulse + bar length in quarter-beats, for metric accents.
  const beatsPerBar = ex.beatsPerBar;
  const pulse = den === 8 && num % 3 === 0 ? 1.5 : 1;
  // Metric stress: downbeat strong, on-pulse medium, off-pulse weak.  Real
  // players lean on the beat and ghost the offbeats — flat velocities are the
  // single biggest "robotic" tell.
  const metricAccent = (beat: number) => {
    const inBar = ((beat % beatsPerBar) + beatsPerBar) % beatsPerBar;
    if (inBar < 1e-6) return 10;                      // downbeat
    if (Math.abs(((inBar % pulse) + pulse) % pulse) < 1e-6) return 3; // on a pulse
    return -7;                                        // off the pulse → ghosted
  };

  // ── Melody ────────────────────────────────────────────────────────
  // A solo isn't a flat sequence of equal notes.  We shape three things:
  //   • metric accent (lean on beats, ghost offbeats),
  //   • pitch contour (higher = a touch brighter/louder),
  //   • phrase arch (swell into a phrase, taper out of it — phrases are split
  //     by rests), plus a hair of laid-back time on swing tunes.
  if (opts.withMelody) {
    const inst = loaded.get(kit.melody)!;
    const mel = ex.melody;
    // Phrase arch: sin-curve swell across each run of notes between rests.
    const swell = new Array(mel.length).fill(0.5);
    for (let s = 0, i = 1; i <= mel.length; i++) {
      const gap = i < mel.length && (mel[i].startBeat - (mel[i - 1].startBeat + mel[i - 1].durBeats)) > pulse * 1.2;
      if (i === mel.length || gap) {
        const n = i - s;
        for (let k = s; k < i; k++) swell[k] = Math.sin((n > 1 ? (k - s) / (n - 1) : 0.5) * Math.PI);
        s = i;
      }
    }
    const lo = Math.min(...mel.map(n => n.midi)), hi = Math.max(...mel.map(n => n.midi));
    const mid = (lo + hi) / 2, span = Math.max(6, hi - lo);
    // Pop/Billboard leads on piano, which is naturally loud and buries the comp —
    // start its melody a touch softer so the chords come through.
    const melBase = ex.item.source === "cocopops" ? 80 : 88;
    mel.forEach((note, i) => {
      const contour = ((note.midi - mid) / (span / 2)) * 5;     // ±5 by register
      const base = melBase + metricAccent(note.startBeat) + contour + swell[i] * 10;
      // Slightly detached on long notes that precede a rest, legato otherwise.
      const next = i + 1 < mel.length ? mel[i + 1].startBeat : Infinity;
      const rest = next - (note.startBeat + note.durBeats) > pulse * 0.5;
      activeStops.push(inst.start({
        note: note.midi,
        time: humanTime(note.startBeat) + (swing ? 0.012 : 0),  // lay back the lead on swing
        duration: Math.max(0.05, note.durBeats * secPerBeat * (rest ? 0.9 : 0.97)),
        velocity: hvel(base),
      }));
    });
  }

  // ── Accompaniment (idiomatic comping + bass, per genre) ───────────
  // compEvents turns the chord track into genre/metre-specific comping
  // (jazz Charleston + walking bass, pop, folk boom-chick, waltz, 6/8)
  // rather than a single block per chord.
  if ((opts.withChords || opts.withBass) && ex.chords.length) {
    const comp = compEvents(ex.chords, compGenreFor(ex.item.source, ex.item.style), ex.beatsPerBar, ex.item.timeSig, ex.windowBeats);
    if (opts.withChords && kit.chords) {
      const chordInst = loaded.get(kit.chords)!;
      const guitar = /guitar/.test(kit.chords);
      // Group simultaneous chord notes so we can STRUM them rather than hit
      // every string at once (the dead giveaway of a fake guitar).
      const groups = new Map<number, typeof comp.chord>();
      for (const e of comp.chord) {
        const k = Math.round(e.startBeat / 0.0625) * 0.0625;
        (groups.get(k) ?? groups.set(k, []).get(k)!).push(e);
      }
      for (const [, g] of groups) {
        const onBeat = Math.abs(((g[0].startBeat % pulse) + pulse) % pulse) < 1e-6;
        // Down-stroke (on the beat) sweeps low→high; up-stroke (offbeat) high→low.
        const ordered = [...g].sort((a, b) => onBeat ? a.midi - b.midi : b.midi - a.midi);
        // Guitars spread ~10 ms/string, piano barely rolls; humans aren't tight.
        const step = (guitar ? 0.011 : 0.004) + hrand() * 0.004;
        const base = humanTime(g[0].startBeat);
        const accent = metricAccent(g[0].startBeat);
        const n = ordered.length;
        ordered.forEach((e, i) => {
          // Guitars ring a little past the stab (not staccato), pianos shorter,
          // but not so long that successive stabs overlap into mud.
          const dur = e.durBeats * secPerBeat * (guitar ? 1.2 : 0.95);
          // Strum dynamics: a real pick sweep swells slightly across the strings
          // rather than hitting them all at one flat velocity.
          const ramp = n > 1 ? (i / (n - 1) - 0.5) * 4 : 0;   // -2 .. +2 across the sweep
          activeStops.push(chordInst.start({
            note: e.midi,
            time: base + i * step,
            duration: Math.max(guitar ? 0.25 : 0.12, dur),
            // Comp must sit clearly UNDER the lead but stay audible: lift the
            // (low, ~52) source velocity instead of attenuating it.
            velocity: hvel(e.velocity + 22 + accent + ramp),
          }));
        });
      }
    }
    if (opts.withBass && kit.bass) {
      const bassInst = loaded.get(kit.bass)!;
      for (const e of comp.bass) {
        const onBeat = Math.abs(((e.startBeat % pulse) + pulse) % pulse) < 1e-6;
        activeStops.push(bassInst.start({ note: e.midi, time: humanTime(e.startBeat), duration: Math.max(0.1, e.durBeats * secPerBeat * 0.96), velocity: hvel(e.velocity + (onBeat ? 4 : -4)) }));
      }
    }
  }

  // Note durations already bound the audible content to the window; we
  // deliberately do NOT schedule a timed inst.stop() here — a shared
  // instrument's timed stop would fire during a quick Replay and silence
  // the freshly-scheduled notes (Replay = no audio).  The natural sample
  // release tail past the window edge is negligible.
  const durationSec = ex.windowBeats * secPerBeat;
  return {
    durationSec,
    stop: stopPlayback,
  };
}

export { SOURCE_KIT };
