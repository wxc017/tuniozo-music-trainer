// ── Advanced Metronome Engine ─────────────────────────────────────────
//
// A stand-alone Web Audio metronome supporting:
//   • configurable beats per measure
//   • per-beat subdivision counts (arbitrary — 5, 7, coprime, whatever)
//   • per-beat accent / manual mute
//   • rotating subdivisions (cycle a list, hold each for N measures)
//   • randomized subdivisions (random from a list, or a min–max range)
//   • silence patterns: gap-click (play N / mute M measures),
//     mute-every-Nth-beat, and random per-beat muting
//
// Timing follows Chris Wilson's "A Tale of Two Clocks" lookahead
// scheduler (25 ms wake-up, 0.1 s schedule-ahead) — the same pattern the
// rest of the app uses.  Unlike LCM-grid polyrhythm metronomes, we
// schedule one whole beat at a time and lay its sub-clicks inside the
// beat, so arbitrary/coprime subdivisions cost nothing.
//
// The scheduler reads `this.config` live on every beat, so UI edits take
// effect at the next beat boundary with no stale-closure bugs.

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_SEC = 0.1;

export type SubdivMode = "fixed" | "cycle" | "randomList" | "randomRange";

export interface BeatConfig {
  /** Base subdivision when mode === "fixed" (1 = just the beat). */
  subdivision: number;
  /** Manually silence this beat (still counts time). */
  muted: boolean;
  /** Accent this beat (brighter/louder click). */
  accent: boolean;
  /** How this beat picks its subdivision each measure-block. */
  mode: SubdivMode;
  /** For "cycle" and "randomList": the pool of subdivision counts. */
  list: number[];
  /** For "randomRange": inclusive bounds. */
  rangeMin: number;
  rangeMax: number;
  /** Hold the chosen subdivision for this many measures before switching. */
  holdMeasures: number;
}

export interface SilenceConfig {
  /** Mute every Nth beat (across measures). 0 = off. */
  everyNBeat: number;
  /** Gap-click: play this many measures … */
  gapPlayMeasures: number;
  /** … then mute this many measures, looping. 0 = off. */
  gapMuteMeasures: number;
  /** Probability [0..1] each beat is randomly muted. 0 = off. */
  randomMuteRate: number;
}

export interface PlacementConfig {
  /** Randomly shuffle which beat position carries each subdivision. */
  enabled: boolean;
  /** Keep a shuffle for this many measures before re-shuffling. */
  holdMeasures: number;
}

export interface MetronomeConfig {
  bpm: number;
  volume: number;
  /** One entry per beat in the measure. */
  beats: BeatConfig[];
  silence: SilenceConfig;
  /** Randomize which beat the subdivisions land on (accents stay by position). */
  placement: PlacementConfig;
}

export const DEFAULT_PLACEMENT: PlacementConfig = { enabled: false, holdMeasures: 1 };

/** What the visual layer receives on each scheduled beat. */
export interface BeatInfo {
  beatIndex: number;      // position within the measure
  measureIndex: number;   // 0-based measure count since start
  subdivision: number;    // subdivisions actually played this beat
  muted: boolean;         // whole beat silenced
  accent: boolean;        // accented beat
}

export function defaultBeat(subdivision = 1): BeatConfig {
  return {
    subdivision,
    muted: false,
    accent: false,
    mode: "fixed",
    list: [subdivision, subdivision + 2],
    rangeMin: 2,
    rangeMax: 7,
    holdMeasures: 2,
  };
}

export function defaultConfig(beatsPerMeasure = 4): MetronomeConfig {
  const beats = Array.from({ length: beatsPerMeasure }, () => defaultBeat(1));
  if (beats[0]) beats[0].accent = true;
  return {
    bpm: 120,
    volume: 0.8,
    beats,
    silence: {
      everyNBeat: 0,
      gapPlayMeasures: 0,
      gapMuteMeasures: 0,
      randomMuteRate: 0,
    },
    placement: { ...DEFAULT_PLACEMENT },
  };
}

/** Fisher–Yates shuffle of [0, 1, … n-1]. */
function shuffledIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Click synthesis ───────────────────────────────────────────────────

interface ClickParams {
  freqStart: number;
  freqEnd: number;
  gain: number;
  decay: number;
}

// Accent (downbeat / accented beat) — brightest + loudest.
const CLICK_ACCENT: ClickParams = { freqStart: 2000, freqEnd: 1150, gain: 1.0, decay: 0.05 };
// Regular beat — the main pulse (used only when the beat is NOT subdivided).
const CLICK_BEAT: ClickParams   = { freqStart: 1150, freqEnd: 700,  gain: 0.7, decay: 0.05 };
// Inner subdivision — soft, higher "tick" so it reads under the beat.
const CLICK_SUB: ClickParams    = { freqStart: 1600, freqEnd: 1350, gain: 0.3, decay: 0.03 };
// Beat marker WITHIN a subdivided beat — same tight timbre family as the
// inner subdivisions, just louder, so the downbeat reads clearly without a
// second, different-sounding click flamming against the first subdivision.
const CLICK_SUB_DOWN: ClickParams = { freqStart: 1700, freqEnd: 1350, gain: 0.62, decay: 0.03 };

function playClick(ctx: AudioContext, time: number, p: ClickParams, vol: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(p.freqStart, time);
  osc.frequency.exponentialRampToValueAtTime(Math.max(p.freqEnd, 20), time + 0.02);

  const g = Math.max(0.0001, p.gain * vol);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(g, time + 0.002);
  // Exponential ramp to a tiny value (never 0) avoids the audible click/pop.
  gain.gain.exponentialRampToValueAtTime(0.0001, time + p.decay);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + p.decay + 0.01);
}

// ── Engine ────────────────────────────────────────────────────────────

type BeatCallback = (info: BeatInfo) => void;

export class MetronomeEngine {
  private ctx: AudioContext | null = null;
  private schedulerId: ReturnType<typeof setInterval> | null = null;
  private beatTimeouts: ReturnType<typeof setTimeout>[] = [];

  private nextBeatTime = 0;
  private beatInMeasure = 0;
  private measureIndex = 0;

  private config: MetronomeConfig;
  private onBeat: BeatCallback | null = null;

  // Per-beat rotation state: which subdivision is "held" and for which
  // measure-block it was chosen (so random modes re-roll only on switch).
  private rotState: { block: number; sub: number }[] = [];

  // Placement-randomization state: a permutation of beat positions held for
  // a measure-block, and the resolved subdivisions laid out per position for
  // the current measure.
  private perm: number[] = [];
  private permBlock = -1;
  private placedSubs: number[] = [];
  private placedMeasure = -1;

  running = false;

  constructor(config: MetronomeConfig) {
    this.config = config;
  }

  setConfig(config: MetronomeConfig) {
    this.config = config;
  }

  setOnBeat(cb: BeatCallback | null) {
    this.onBeat = cb;
  }

  private async ensureCtx(): Promise<AudioContext> {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  async start() {
    if (this.running) return;
    const ctx = await this.ensureCtx();
    this.beatInMeasure = 0;
    this.measureIndex = 0;
    this.rotState = [];
    this.perm = [];
    this.permBlock = -1;
    this.placedSubs = [];
    this.placedMeasure = -1;
    this.nextBeatTime = ctx.currentTime + 0.06;
    this.running = true;
    this.schedulerId = setInterval(() => this.schedule(ctx), LOOKAHEAD_MS);
  }

  stop() {
    if (this.schedulerId !== null) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    for (const id of this.beatTimeouts) clearTimeout(id);
    this.beatTimeouts = [];
    this.running = false;
    if (this.ctx) this.ctx.suspend();
  }

  dispose() {
    this.stop();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }

  /** Resolve the subdivision count for a beat, honoring its rotation mode. */
  private resolveSubdivision(beatIdx: number, beat: BeatConfig, measure: number): number {
    if (beat.mode === "fixed") return Math.max(1, beat.subdivision);

    const hold = Math.max(1, beat.holdMeasures);
    const block = Math.floor(measure / hold);
    const prev = this.rotState[beatIdx];

    if (prev && prev.block === block) return prev.sub;

    let sub: number;
    if (beat.mode === "cycle") {
      const list = beat.list.length ? beat.list : [beat.subdivision];
      sub = list[block % list.length];
    } else if (beat.mode === "randomList") {
      const list = beat.list.length ? beat.list : [beat.subdivision];
      sub = list[Math.floor(Math.random() * list.length)];
    } else {
      // randomRange
      const lo = Math.min(beat.rangeMin, beat.rangeMax);
      const hi = Math.max(beat.rangeMin, beat.rangeMax);
      sub = lo + Math.floor(Math.random() * (hi - lo + 1));
    }
    sub = Math.max(1, sub);
    this.rotState[beatIdx] = { block, sub };
    return sub;
  }

  /**
   * Subdivision for a beat position, honoring placement randomization.
   * When placement is on, subdivisions are shuffled across positions once per
   * measure-block (accents/mutes stay tied to the position, so the downbeat
   * pulse never moves — only which beat carries which subdivision).
   */
  private subForPosition(beatIdx: number, beats: BeatConfig[], count: number, measure: number): number {
    const pl = this.config.placement;
    if (!pl || !pl.enabled || count <= 1) {
      return this.resolveSubdivision(beatIdx, beats[beatIdx], measure);
    }
    if (this.placedMeasure !== measure || this.placedSubs.length !== count) {
      const hold = Math.max(1, pl.holdMeasures);
      const block = Math.floor(measure / hold);
      if (this.permBlock !== block || this.perm.length !== count) {
        this.perm = shuffledIndices(count);
        this.permBlock = block;
      }
      // Resolve every configured beat's subdivision, then lay them out in the
      // shuffled order for this measure.
      const resolved = beats.map((b, i) => this.resolveSubdivision(i, b, measure));
      this.placedSubs = this.perm.map(idx => resolved[idx]);
      this.placedMeasure = measure;
    }
    return this.placedSubs[beatIdx];
  }

  /** Decide whether a whole beat is silenced by any active rule. */
  private isMuted(beat: BeatConfig, beatIdx: number, measure: number, globalBeat: number): boolean {
    if (beat.muted) return true;

    const s = this.config.silence;

    // Gap-click: play N measures, then mute M measures, looping.
    if (s.gapMuteMeasures > 0 && s.gapPlayMeasures >= 0) {
      const cycle = s.gapPlayMeasures + s.gapMuteMeasures;
      if (cycle > 0 && measure % cycle >= s.gapPlayMeasures) return true;
    }

    // Mute every Nth beat (across measures).
    if (s.everyNBeat > 1 && (globalBeat + 1) % s.everyNBeat === 0) return true;

    // Random per-beat mute.
    if (s.randomMuteRate > 0 && Math.random() < s.randomMuteRate) return true;

    return false;
  }

  private schedule(ctx: AudioContext) {
    const ahead = ctx.currentTime + SCHEDULE_AHEAD_SEC;

    while (this.nextBeatTime < ahead) {
      const beats = this.config.beats;
      const count = beats.length;
      if (count === 0) {
        // No beats configured — idle but keep the clock moving.
        this.nextBeatTime += 60 / Math.max(1, this.config.bpm);
        continue;
      }

      // Wrap into the current measure.
      if (this.beatInMeasure >= count) {
        this.beatInMeasure = 0;
        this.measureIndex++;
      }
      const beatIdx = this.beatInMeasure;
      const beat = beats[beatIdx];
      const measure = this.measureIndex;
      const globalBeat = measure * count + beatIdx;

      const secPerBeat = 60 / Math.max(1, this.config.bpm);
      const sub = this.subForPosition(beatIdx, beats, count, measure);
      const muted = this.isMuted(beat, beatIdx, measure, globalBeat);
      const beatTime = this.nextBeatTime;

      if (!muted) {
        const secPerSub = secPerBeat / sub;
        for (let i = 0; i < sub; i++) {
          const t = beatTime + secPerSub * i;
          let params: ClickParams;
          if (i === 0) {
            // Downbeat of the beat.  When subdivided, mark it with the loud
            // subdivision-family click (CLICK_SUB_DOWN) so it doesn't flam
            // against the following inner subdivisions; only an unsubdivided
            // beat gets the distinct "beat" timbre.
            params = beat.accent ? CLICK_ACCENT : sub > 1 ? CLICK_SUB_DOWN : CLICK_BEAT;
          } else {
            params = CLICK_SUB;
          }
          playClick(ctx, t, params, this.config.volume);
        }
      }

      // Visual callback, timed to the audio clock.
      if (this.onBeat) {
        const cb = this.onBeat;
        const info: BeatInfo = { beatIndex: beatIdx, measureIndex: measure, subdivision: sub, muted, accent: beat.accent };
        const delay = Math.max(0, (beatTime - ctx.currentTime) * 1000);
        this.beatTimeouts.push(setTimeout(() => cb(info), delay));
      }

      this.nextBeatTime += secPerBeat;
      this.beatInMeasure++;
    }
  }
}
