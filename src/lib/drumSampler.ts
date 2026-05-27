// ── Drum sampler — real drum samples for Rhythmic Audiation ───────────────
//
// The synth-click engine in rhythmAudio.ts is great for abstract metre work,
// but for *drum* transcription you want to hear an actual kit.  This module
// loads smplr's DrumMachine (LM-2 / LinnDrum — sampled acoustic drums, clear
// kick/snare/hat) and schedules a Groove's hits as real samples, routed
// through the app's AudioEngine so the master volume slider applies.

import { DrumMachine } from "smplr";
import { audioEngine } from "./audioEngine";
import { GRID_SUBDIVS, type GridType } from "./drumData";
import type { Groove } from "./drumGroove";

// LinnDrum: sampled acoustic-ish drums, the most "kit"-like of smplr's five
// machines (vs the very electronic TR-808 / CR-8000).
const KIT = "LM-2";

type Voice = "kick" | "snare" | "ghost" | "hihat" | "hihatOpen";

let kit: ReturnType<typeof DrumMachine> | null = null;
let kitReady: Promise<void> | null = null;
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

export async function ensureDrumKit(): Promise<void> {
  if (kit) return;
  if (!kitReady) {
    kitReady = (async () => {
      const ctx = audioEngine.getOutputContext();
      const dest = audioEngine.getPlayDestination();
      const dm = DrumMachine(ctx, { instrument: KIT, destination: dest, volume: 100 });
      await dm.ready;
      kit = dm;
      voiceSample = resolveVoices(dm.getSampleNames());
    })();
  }
  await kitReady;
}

/** Slots per beat for a grid (16th → 4, 8th → 2, triplet → 3). */
function slotsPerBeat(grid: GridType): number {
  return grid === "16th" ? 4 : grid === "triplet" ? 3 : grid === "32nd" ? 8
    : grid === "quintuplet" ? 5 : grid === "septuplet" ? 7 : 2;
}

const VEL: Record<Voice, number> = { kick: 118, snare: 104, ghost: 34, hihat: 74, hihatOpen: 88 };

export interface PlayGrooveOpts {
  bpm: number;
  bars?: number;          // how many times to loop the bar (default 2)
  countInBeats?: number;  // metronome count-in before the groove (default 0)
  metronome?: boolean;    // click on every beat under the groove
  onDone?: () => void;
}

let stopFns: Array<() => void> = [];
let doneTimer: ReturnType<typeof setTimeout> | null = null;

function trigger(voice: Voice, time: number, vel: number) {
  const note = voiceSample[voice];
  if (!kit || !note) return;
  const stop = kit.start({ note, time, velocity: vel });
  if (typeof stop === "function") stopFns.push(stop);
}

/** Play a groove; returns its total audible duration in seconds. */
export async function playGroove(groove: Groove, opts: PlayGrooveOpts): Promise<number> {
  await ensureDrumKit();
  stopGroove();
  const ctx = audioEngine.getOutputContext();
  if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* ignore */ } }

  const secPerBeat = 60 / opts.bpm;
  const spb = slotsPerBeat(groove.grid);
  const slotDur = secPerBeat / spb;
  const subdivs = GRID_SUBDIVS[groove.grid];
  const beatsPerBar = subdivs / spb;
  const barDur = subdivs * slotDur;
  const bars = Math.max(1, opts.bars ?? 2);

  const t0 = ctx.currentTime + 0.12;
  const countIn = Math.max(0, opts.countInBeats ?? 0) * secPerBeat;
  const grooveStart = t0 + countIn;

  // Count-in: an accented hi-hat click on each beat (uses the kit so it
  // matches the timbre you're about to transcribe).
  for (let i = 0; i < (opts.countInBeats ?? 0); i++) {
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

  const total = countIn + bars * barDur;
  if (opts.onDone) doneTimer = setTimeout(opts.onDone, (total + 0.25) * 1000);
  return total;
}

export function stopGroove() {
  for (const fn of stopFns) { try { fn(); } catch { /* ignore */ } }
  stopFns = [];
  if (doneTimer !== null) { clearTimeout(doneTimer); doneTimer = null; }
  try { kit?.stop(); } catch { /* ignore */ }
}
