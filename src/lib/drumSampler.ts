// ── Drum sampler — real drum samples for Rhythmic Audiation ───────────────
//
// Plays a Groove's hits through smplr's DrumMachine (LM-2 / LinnDrum —
// sampled acoustic drums), routed through the app's AudioEngine so the master
// volume applies.  The sample kit loads from a CDN; until it's ready (or if it
// fails to load) playback falls back to a lightweight synthesized kit so the
// Play button always produces sound.

import { DrumMachine } from "smplr";
import { audioEngine } from "./audioEngine";
import type { Groove } from "./drumGroove";

// LinnDrum: sampled acoustic-ish drums, the most "kit"-like of smplr's five
// machines (vs the very electronic TR-808 / CR-8000).
const KIT = "LM-2";

type Voice = "kick" | "snare" | "ghost" | "hihat" | "hihatOpen";

let kit: ReturnType<typeof DrumMachine> | null = null;
let kitReady: Promise<void> | null = null;
let kitFailed = false;
let voiceSample: Partial<Record<Voice, string>> = {};

/** Resolve our abstract voices to whatever sample names the loaded kit
 *  exposes (names differ per machine), by substring priority. */
function resolveVoices(names: string[]): Partial<Record<Voice, string>> {
  const find = (...res: RegExp[]): string | undefined => {
    for (const re of res) { const m = names.find(n => re.test(n)); if (m) return m; }
    return undefined;
  };
  const closed = find(/closed.*hat|hat.*closed|\bclosed\b/i, /\bhh\b|hi.?hat|hat/i);
  return {
    kick:      find(/kick|bass.?drum|\bbd\b/i) ?? names[0],
    snare:     find(/snare|\bsd\b|\bsn\b/i) ?? names[1],
    ghost:     find(/snare|\bsd\b|\bsn\b/i) ?? names[1],
    hihat:     closed,
    hihatOpen: find(/open.*hat|hat.*open|\boh\b|open/i) ?? closed,
  };
}

/** Kick off (and remember) the sample-kit load.  Never throws — on failure it
 *  flips `kitFailed` so playback uses the synth fallback. */
export async function ensureDrumKit(): Promise<void> {
  if (kit || kitFailed) return;
  if (!kitReady) {
    kitReady = (async () => {
      try {
        const ctx = audioEngine.getOutputContext();
        const dm = DrumMachine(ctx, { instrument: KIT, destination: audioEngine.getPlayDestination(), volume: 100 });
        await dm.ready;
        kit = dm;
        voiceSample = resolveVoices(dm.getSampleNames());
      } catch { kitFailed = true; }
    })();
  }
  await kitReady;
}

const VEL: Record<Voice, number> = { kick: 118, snare: 104, ghost: 34, hihat: 74, hihatOpen: 88 };

export interface PlayGrooveOpts {
  bpm: number;            // quarter-note tempo
  bars?: number;          // how many times to loop the bar (default 2)
  countInBeats?: number;  // count-in clicks (one per beat) before the groove
  metronome?: boolean;    // click on every beat under the groove
  onDone?: () => void;
}

let stopFns: Array<() => void> = [];
let doneTimer: ReturnType<typeof setTimeout> | null = null;

// ── Synth fallback kit ─────────────────────────────────────────────────────
let noiseBuf: AudioBuffer | null = null;
function noise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = Math.floor(ctx.sampleRate * 0.4);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = b;
  return b;
}
function envGain(ctx: AudioContext, dest: AudioNode, time: number, peak: number, dur: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), time + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  g.connect(dest);
  return g;
}
function synthHit(voice: Voice, time: number, vel: number) {
  const ctx = audioEngine.getOutputContext();
  const dest = audioEngine.getPlayDestination();
  const v = vel / 127;
  if (voice === "kick") {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, time);
    o.frequency.exponentialRampToValueAtTime(48, time + 0.12);
    const g = envGain(ctx, dest, time, v, 0.2);
    o.connect(g); o.start(time); o.stop(time + 0.22);
    stopFns.push(() => { try { o.stop(); } catch { /* */ } });
  } else if (voice === "snare" || voice === "ghost") {
    const dur = voice === "ghost" ? 0.07 : 0.16;
    const n = ctx.createBufferSource(); n.buffer = noise(ctx);
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1400;
    const g = envGain(ctx, dest, time, v * (voice === "ghost" ? 0.45 : 0.85), dur);
    n.connect(hp); hp.connect(g); n.start(time); n.stop(time + dur + 0.02);
    const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = 185;
    const g2 = envGain(ctx, dest, time, v * 0.3, dur);
    o.connect(g2); o.start(time); o.stop(time + dur + 0.02);
    stopFns.push(() => { try { n.stop(); o.stop(); } catch { /* */ } });
  } else {
    const dur = voice === "hihatOpen" ? 0.2 : 0.045;
    const n = ctx.createBufferSource(); n.buffer = noise(ctx);
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7000;
    const g = envGain(ctx, dest, time, v * 0.5, dur);
    n.connect(hp); hp.connect(g); n.start(time); n.stop(time + dur + 0.02);
    stopFns.push(() => { try { n.stop(); } catch { /* */ } });
  }
}

function trigger(voice: Voice, time: number, vel: number) {
  const note = kit && !kitFailed ? voiceSample[voice] : undefined;
  if (kit && note) {
    const stop = kit.start({ note, time, velocity: vel });
    if (typeof stop === "function") stopFns.push(stop);
  } else {
    synthHit(voice, time, vel);   // samples not ready / unavailable
  }
}

/** Play a groove; returns its total audible duration in seconds. */
export async function playGroove(groove: Groove, opts: PlayGrooveOpts): Promise<number> {
  ensureDrumKit();                // fire-and-forget; synth covers "not ready yet"
  stopGroove();
  const ctx = audioEngine.getOutputContext();
  if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* ignore */ } }

  // Timing comes straight off the groove: one slot is `slotQuarters` quarter
  // notes, tempo is quarter-note bpm — works for x/4 and compound x/8 alike.
  const slotDur = (60 / opts.bpm) * groove.slotQuarters;
  const secPerBeat = slotDur * groove.slotsPerBeat;
  const subdivs = groove.subdivs;
  const beatsPerBar = groove.beats;
  const barDur = subdivs * slotDur;
  const bars = Math.max(1, opts.bars ?? 2);

  const t0 = ctx.currentTime + 0.12;
  const countInBeats = Math.max(0, opts.countInBeats ?? 0);
  const grooveStart = t0 + countInBeats * secPerBeat;

  for (let i = 0; i < countInBeats; i++) {
    trigger("hihat", t0 + i * secPerBeat, i === 0 ? 96 : 70);
  }

  for (let b = 0; b < bars; b++) {
    const base = grooveStart + b * barDur;
    const at = (slot: number) => base + slot * slotDur;
    for (const s of groove.bassHits)  trigger("kick", at(s), VEL.kick);
    for (const s of groove.snareHits) trigger("snare", at(s), VEL.snare);
    for (const s of groove.ghostHits) trigger("ghost", at(s), VEL.ghost);
    for (const s of groove.hhHits)    trigger("hihat", at(s), VEL.hihat);
    for (const s of groove.hhOpen)    trigger("hihatOpen", at(s), VEL.hihatOpen);
    if (opts.metronome) {
      for (let beat = 0; beat < beatsPerBar; beat++) {
        trigger("hihatOpen", base + beat * secPerBeat, beat === 0 ? 50 : 38);
      }
    }
  }

  const total = countInBeats * secPerBeat + bars * barDur;
  if (opts.onDone) doneTimer = setTimeout(opts.onDone, (total + 0.25) * 1000);
  return total;
}

export function stopGroove() {
  for (const fn of stopFns) { try { fn(); } catch { /* ignore */ } }
  stopFns = [];
  if (doneTimer !== null) { clearTimeout(doneTimer); doneTimer = null; }
  try { kit?.stop(); } catch { /* ignore */ }
}
