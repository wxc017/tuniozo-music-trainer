// ── Rhythm Ear Training: Audio engine with click synthesis ──

import type { RhythmPattern, RhythmEvent } from "./rhythmEarData";

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.1;

// ── Click timbres by layer ────────────────────────────────────────────

interface ClickParams {
  freqStart: number;
  freqEnd: number;
  rampTime: number;
  attackTime: number;
  decayTime: number;
  gain: number;
}

// Accented beat 1 — highest, loudest, longest decay to clearly mark cycle restart
const CLICK_ACCENT: ClickParams = {
  freqStart: 1400, freqEnd: 400, rampTime: 0.03,
  attackTime: 0.002, decayTime: 0.14, gain: 1.0,
};

// Group start — mid-high, strong, marks group boundaries
const CLICK_GROUP_START: ClickParams = {
  freqStart: 1000, freqEnd: 350, rampTime: 0.025,
  attackTime: 0.002, decayTime: 0.1, gain: 0.75,
};

// Internal beats within a group — noticeably softer/shorter than group starts
const CLICK_MACRO: ClickParams = {
  freqStart: 700, freqEnd: 250, rampTime: 0.02,
  attackTime: 0.002, decayTime: 0.05, gain: 0.35,
};

const CLICK_MICRO: ClickParams = {
  freqStart: 1200, freqEnd: 600, rampTime: 0.015,
  attackTime: 0.002, decayTime: 0.05, gain: 0.4,
};

const CLICK_DIVISION: ClickParams = {
  freqStart: 1600, freqEnd: 1000, rampTime: 0.01,
  attackTime: 0.001, decayTime: 0.035, gain: 0.25,
};

const CLICK_REST: ClickParams = {
  freqStart: 400, freqEnd: 200, rampTime: 0.01,
  attackTime: 0.001, decayTime: 0.02, gain: 0.1,
};

// Steady reference pulse — high metallic ping, clearly distinct from all
// pattern layers.  Bright attack + fast decay = "ride cymbal bell" character.
const CLICK_REFERENCE: ClickParams = {
  freqStart: 2400, freqEnd: 1800, rampTime: 0.005,
  attackTime: 0.001, decayTime: 0.08, gain: 0.35,
};

// ── Poly-layer clicks: distinct timbres per layer so you can hear both ──

// Layer 2 accent — low, punchy (like a bass drum / low woodblock)
const CLICK_POLY2_ACCENT: ClickParams = {
  freqStart: 500, freqEnd: 150, rampTime: 0.02,
  attackTime: 0.002, decayTime: 0.14, gain: 0.95,
};

// Layer 2 group start
const CLICK_POLY2_GROUP: ClickParams = {
  freqStart: 400, freqEnd: 140, rampTime: 0.02,
  attackTime: 0.002, decayTime: 0.1, gain: 0.7,
};

// Layer 2 macro
const CLICK_POLY2_MACRO: ClickParams = {
  freqStart: 350, freqEnd: 130, rampTime: 0.02,
  attackTime: 0.002, decayTime: 0.08, gain: 0.5,
};

// Layer 2 micro
const CLICK_POLY2_MICRO: ClickParams = {
  freqStart: 500, freqEnd: 250, rampTime: 0.012,
  attackTime: 0.002, decayTime: 0.05, gain: 0.35,
};

// Layer 3 accent — mid-range clap-like
const CLICK_POLY3_ACCENT: ClickParams = {
  freqStart: 800, freqEnd: 500, rampTime: 0.015,
  attackTime: 0.001, decayTime: 0.12, gain: 0.85,
};

// Layer 3 group start
const CLICK_POLY3_GROUP: ClickParams = {
  freqStart: 700, freqEnd: 450, rampTime: 0.015,
  attackTime: 0.001, decayTime: 0.09, gain: 0.6,
};

function layerClick(ev: RhythmEvent): ClickParams {
  if (ev.isRest) return CLICK_REST;

  // Poly layer 1 (idx 2+): mid-range clap
  if (ev.polyLayerIdx != null && ev.polyLayerIdx >= 2) {
    if (ev.accent) return CLICK_POLY3_ACCENT;
    if (ev.layer === "macro" && ev.isGroupStart) return CLICK_POLY3_GROUP;
    return ev.layer === "macro" ? CLICK_POLY2_MACRO : ev.layer === "micro" ? CLICK_POLY2_MICRO : CLICK_DIVISION;
  }

  // Poly layer 1 (idx 1): low woodblock
  if (ev.polyLayerIdx === 1) {
    if (ev.accent) return CLICK_POLY2_ACCENT;
    if (ev.layer === "macro" && ev.isGroupStart) return CLICK_POLY2_GROUP;
    return ev.layer === "macro" ? CLICK_POLY2_MACRO : ev.layer === "micro" ? CLICK_POLY2_MICRO : CLICK_DIVISION;
  }

  // Reference layer always uses its own timbre so it's always discernible
  if (ev.layer === "reference") return CLICK_REFERENCE;

  // Default / poly layer 0: standard high click
  if (ev.accent) return CLICK_ACCENT;
  if (ev.layer === "macro" && ev.isGroupStart) return CLICK_GROUP_START;
  switch (ev.layer) {
    case "macro":     return CLICK_MACRO;
    case "micro":     return CLICK_MICRO;
    case "division":  return CLICK_DIVISION;
    default:          return CLICK_MACRO;
  }
}

function playClick(ctx: AudioContext, time: number, params: ClickParams, vol: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(params.freqStart, time);
  osc.frequency.exponentialRampToValueAtTime(
    Math.max(params.freqEnd, 20), time + params.rampTime,
  );

  const g = params.gain * vol;
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(g, time + params.attackTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + params.decayTime);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(time);
  osc.stop(time + params.decayTime + 0.01);
}

// ── Compute absolute times for events ─────────────────────────────────

function computeEventTimes(
  pattern: RhythmPattern,
  startTime: number,
): { time: number; event: RhythmEvent }[] {
  const { events, bpm, bpmEnd, macrobeats } = pattern;
  const totalBeats = macrobeats;

  return events.map(ev => {
    const frac = ev.beatPos / totalBeats; // 0..1 normalised position

    if (bpmEnd && bpmEnd !== bpm) {
      // Linear tempo ramp: compute time via integration
      // tempo(t) = bpm + (bpmEnd - bpm) * t/T where T is total duration
      // dt/dbeat = 60/tempo(beat), integrate for time
      const avgBpmAtFrac = bpm + (bpmEnd - bpm) * frac;
      const avgBpm = (bpm + avgBpmAtFrac) / 2;
      const timeOffset = (frac * totalBeats * 60) / avgBpm;
      return { time: startTime + timeOffset, event: ev };
    }

    const secPerBeat = 60 / bpm;
    return { time: startTime + ev.beatPos * secPerBeat, event: ev };
  });
}

/** Total duration of a pattern in seconds */
export function patternDuration(pattern: RhythmPattern): number {
  const { bpm, bpmEnd, macrobeats } = pattern;
  if (bpmEnd && bpmEnd !== bpm) {
    const avgBpm = (bpm + bpmEnd) / 2;
    return (macrobeats * 60) / avgBpm;
  }
  return (macrobeats * 60) / bpm;
}

// ── RhythmAudioEngine ─────────────────────────────────────────────────

export type BeatCallback = (beatPos: number, layer: string) => void;

export class RhythmAudioEngine {
  private ctx: AudioContext | null = null;
  private schedulerId: ReturnType<typeof setInterval> | null = null;
  private scheduledEvents: { time: number; event: RhythmEvent }[] = [];
  private nextIdx = 0;
  private vol = 0.7;
  private onBeat: BeatCallback | null = null;
  private beatTimeouts: ReturnType<typeof setTimeout>[] = [];
  private onComplete: (() => void) | null = null;
  private completeTimeout: ReturnType<typeof setTimeout> | null = null;

  setVolume(v: number) { this.vol = Math.max(0, Math.min(1, v)); }
  setOnBeat(cb: BeatCallback | null) { this.onBeat = cb; }

  private async ensureCtx(): Promise<AudioContext> {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  private clearAll() {
    if (this.schedulerId !== null) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    for (const id of this.beatTimeouts) clearTimeout(id);
    this.beatTimeouts = [];
    if (this.completeTimeout !== null) {
      clearTimeout(this.completeTimeout);
      this.completeTimeout = null;
    }
    this.scheduledEvents = [];
    this.nextIdx = 0;
    this.onComplete = null;
    this.infiniteGen = null;
    this.infiniteIdx = 0;
    this.infiniteOnIdx = null;
  }

  stop() {
    this.clearAll();
    this.stopReference();
    if (this.ctx) this.ctx.suspend();
  }

  async playPattern(
    pattern: RhythmPattern,
    onComplete?: () => void,
    repeats = 1,
  ) {
    this.clearAll();
    const ctx = await this.ensureCtx();
    const startTime = ctx.currentTime + 0.05;
    const singleDur = patternDuration(pattern);

    // Schedule all repeats up-front
    let allEvents: { time: number; event: RhythmEvent }[] = [];
    for (let r = 0; r < repeats; r++) {
      const offset = startTime + r * singleDur;
      allEvents = allEvents.concat(computeEventTimes(pattern, offset));
    }
    allEvents.sort((a, b) => a.time - b.time);

    this.scheduledEvents = allEvents;
    this.nextIdx = 0;
    this.onComplete = onComplete ?? null;

    const totalDur = singleDur * repeats;
    this.completeTimeout = setTimeout(() => {
      this.clearAll();
      onComplete?.();
    }, (totalDur + 0.3) * 1000);

    this.schedulerId = setInterval(() => this.schedule(ctx), LOOKAHEAD_MS);
  }

  /**
   * Play an infinite evolving sequence. Calls `nextPattern(index)` to get
   * each successive pattern. Runs until `stop()` is called.
   */
  async playInfiniteSequence(
    nextPattern: (index: number) => RhythmPattern,
    onPatternIndex?: (idx: number) => void,
  ) {
    this.clearAll();
    const ctx = await this.ensureCtx();
    this.infiniteGen = nextPattern;
    this.infiniteIdx = 0;
    this.infiniteOnIdx = onPatternIndex ?? null;
    this.infiniteEndTime = ctx.currentTime + 0.05;
    // Pre-schedule first 2 patterns
    this.scheduleNextInfinitePatterns(ctx, 2);
    this.schedulerId = setInterval(() => {
      this.schedule(ctx);
      // When running low on events, generate more
      if (this.infiniteGen && this.nextIdx >= this.scheduledEvents.length - 5) {
        this.scheduleNextInfinitePatterns(ctx, 1);
      }
    }, LOOKAHEAD_MS);
  }

  private infiniteGen: ((idx: number) => RhythmPattern) | null = null;
  private infiniteIdx = 0;
  private infiniteOnIdx: ((idx: number) => void) | null = null;
  private infiniteEndTime = 0;

  private scheduleNextInfinitePatterns(ctx: AudioContext, n: number) {
    if (!this.infiniteGen) return;
    for (let i = 0; i < n; i++) {
      const pattern = this.infiniteGen(this.infiniteIdx);
      const dur = patternDuration(pattern);
      const events = computeEventTimes(pattern, this.infiniteEndTime);
      this.scheduledEvents.push(...events);
      // Fire index callback
      if (this.infiniteOnIdx) {
        const idx = this.infiniteIdx;
        const delay = Math.max(0, (this.infiniteEndTime - ctx.currentTime) * 1000);
        const cb = this.infiniteOnIdx;
        this.beatTimeouts.push(setTimeout(() => cb(idx), delay));
      }
      this.infiniteEndTime += dur;
      this.infiniteIdx++;
    }
    this.scheduledEvents.sort((a, b) => a.time - b.time);
  }

  /**
   * Start a steady reference pulse at the given BPM.
   * Runs independently until `stopReference()` or `stop()` is called.
   */
  async startReference(bpm: number) {
    this.stopReference();
    const ctx = await this.ensureCtx();
    const interval = 60 / bpm;
    let nextTime = ctx.currentTime + 0.05;

    // Schedule clicks in a loop
    this.refIntervalId = setInterval(() => {
      const ahead = ctx.currentTime + SCHEDULE_AHEAD_SEC;
      while (nextTime <= ahead) {
        playClick(ctx, nextTime, CLICK_REFERENCE, this.vol * 0.6);
        nextTime += interval;
      }
    }, LOOKAHEAD_MS);
  }

  stopReference() {
    if (this.refIntervalId !== null) {
      clearInterval(this.refIntervalId);
      this.refIntervalId = null;
    }
  }

  private refIntervalId: ReturnType<typeof setInterval> | null = null;

  async playPatternPair(
    a: RhythmPattern,
    b: RhythmPattern,
    gapSec: number,
    onComplete?: () => void,
  ) {
    this.clearAll();
    const ctx = await this.ensureCtx();
    const startA = ctx.currentTime + 0.05;
    const durA = patternDuration(a);
    const startB = startA + durA + gapSec;
    const durB = patternDuration(b);

    const eventsA = computeEventTimes(a, startA);
    const eventsB = computeEventTimes(b, startB);
    this.scheduledEvents = [...eventsA, ...eventsB].sort((x, y) => x.time - y.time);
    this.nextIdx = 0;
    this.onComplete = onComplete ?? null;

    const totalDur = durA + gapSec + durB;
    this.completeTimeout = setTimeout(() => {
      this.clearAll();
      onComplete?.();
    }, (totalDur + 0.3) * 1000);

    this.schedulerId = setInterval(() => this.schedule(ctx), LOOKAHEAD_MS);
  }

  private schedule(ctx: AudioContext) {
    const ahead = ctx.currentTime + SCHEDULE_AHEAD_SEC;
    while (this.nextIdx < this.scheduledEvents.length) {
      const { time, event } = this.scheduledEvents[this.nextIdx];
      if (time > ahead) break;

      if (!event.isRest && !event.isTie) {
        playClick(ctx, time, layerClick(event), this.vol);
      }

      // Visual beat callback via setTimeout
      if (this.onBeat) {
        const msUntil = Math.max(0, (time - ctx.currentTime) * 1000);
        const cb = this.onBeat;
        const ev = event;
        const tid = setTimeout(() => cb(ev.beatPos, ev.layer), msUntil);
        this.beatTimeouts.push(tid);
      }

      this.nextIdx++;
    }
  }

  /**
   * Palate cleanser — a short burst of metrically-incoherent clicks that
   * resets the listener's metric entrainment before hearing a new signature.
   *
   * Design:
   *  • ~1.2s of clicks at golden-ratio-derived intervals (φ = 1.618...)
   *  • Varied timbres (low, mid, high) so no single pitch dominates
   *  • Clicks get sparser toward the end, fading into ~400ms silence
   *  • The irrational spacing prevents any periodic interpretation
   *
   * Like eating a cracker between wine tastings.
   */
  async playPalateCleanser(): Promise<void> {
    const ctx = await this.ensureCtx();
    const now = ctx.currentTime + 0.03;
    const PHI = (1 + Math.sqrt(5)) / 2;
    const TOTAL = 1.2; // seconds of clicks
    const SILENCE = 0.4; // trailing silence

    // Generate click times at golden-ratio subdivisions.
    // Start dense, get sparser: positions at φ^(-k) * TOTAL for k = 0,1,2...
    // Plus their φ-complements. This creates an anti-periodic burst.
    const times: number[] = [];
    for (let k = 0; k < 8; k++) {
      const t = TOTAL * Math.pow(PHI, -(k + 1));
      times.push(t);
      const complement = TOTAL - t;
      if (complement > 0.02 && complement < TOTAL - 0.02) times.push(complement);
    }
    // Add a few more at irrational offsets
    times.push(TOTAL * (Math.SQRT2 / 2));
    times.push(TOTAL * (Math.E / 4));
    times.push(TOTAL * 0.08);
    // Deduplicate and sort
    const sorted = [...new Set(times.map(t => Math.round(t * 1000) / 1000))]
      .filter(t => t > 0.01 && t < TOTAL)
      .sort((a, b) => a - b);

    // Alternate between 3 timbres: low thud, mid click, high tick
    const timbres: ClickParams[] = [
      { freqStart: 300, freqEnd: 100, rampTime: 0.02, attackTime: 0.002, decayTime: 0.06, gain: 0.4 },
      { freqStart: 800, freqEnd: 400, rampTime: 0.015, attackTime: 0.002, decayTime: 0.04, gain: 0.35 },
      { freqStart: 1500, freqEnd: 800, rampTime: 0.01, attackTime: 0.001, decayTime: 0.03, gain: 0.25 },
    ];

    // Schedule clicks with decreasing volume toward the end
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      const fade = 1 - (t / TOTAL) * 0.6; // fade to 40% by end
      const timbre = { ...timbres[i % 3], gain: timbres[i % 3].gain * fade };
      playClick(ctx, now + t, timbre, this.vol);
    }

    // Wait for clicks + silence to finish
    return new Promise(resolve => {
      setTimeout(resolve, (TOTAL + SILENCE) * 1000);
    });
  }

  dispose() {
    this.clearAll();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

// Singleton
export const rhythmAudio = new RhythmAudioEngine();
