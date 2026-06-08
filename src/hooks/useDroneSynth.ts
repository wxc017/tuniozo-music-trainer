// ── Shared drone synth ──────────────────────────────────────────────
// The additive sine-partial drone voice used by Interval Spectrum and the
// Interval Browser / Database.  Each voice is a single pitch (given as a
// frequency) built from 4 sine partials through a lowpass, toggled on/off
// by an arbitrary key.  Stack several to compare intervals.

import { useCallback, useEffect, useRef, useState } from "react";

type Voice = { nodes: AudioNode[]; gain: GainNode };

/** Default per-voice gain (the level a voice rings at when first toggled on). */
export const DEFAULT_VOICE_GAIN = 0.16;

export function useDroneSynth() {
  const [active, setActive] = useState<Set<string>>(new Set());
  const ctxRef = useRef<AudioContext | null>(null);
  const voices = useRef<Map<string, Voice>>(new Map());
  /** key -> frequency (Hz) of every currently-sounding voice */
  const freqByKey = useRef<Map<string, number>>(new Map());
  /** key -> per-voice gain (volume); persists across re-toggles */
  const gainByKey = useRef<Map<string, number>>(new Map());

  const ctx = () => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  };

  const startVoice = (key: string, freq: number, initialGain?: number) => {
    const ac = ctx();
    const g = ac.createGain();
    g.gain.setValueAtTime(0, ac.currentTime);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 4500;
    g.connect(lp); lp.connect(ac.destination);
    const nodes: AudioNode[] = [];
    // soft, fast-decaying overtones — audible but smooth (not a buzzy saw).
    for (const [mult, amp] of [
      [1, 0.5], [2, 0.15], [3, 0.08], [4, 0.04], [5, 0.02],
    ] as const) {
      const o = ac.createOscillator();
      o.type = "sine"; o.frequency.value = freq * mult;
      const pg = ac.createGain(); pg.gain.value = amp;
      o.connect(pg); pg.connect(g); o.start();
      nodes.push(o, pg);
    }
    // Explicit initialGain (e.g. 0 for a muted scale voice) wins, so a voice can
    // start silent deterministically without depending on a prior gainByKey
    // entry surviving a same-tick remove/re-add.
    const target = initialGain ?? gainByKey.current.get(key) ?? DEFAULT_VOICE_GAIN;
    gainByKey.current.set(key, target);
    g.gain.linearRampToValueAtTime(target, ac.currentTime + 0.06);
    voices.current.set(key, { nodes, gain: g });
  };

  /** Set the volume of a sounding voice (and remember it for re-toggles). */
  const setGain = useCallback((key: string, v: number) => {
    gainByKey.current.set(key, v);
    const voice = voices.current.get(key);
    if (!voice || !ctxRef.current) return;
    const t = ctxRef.current.currentTime;
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
    voice.gain.gain.linearRampToValueAtTime(v, t + 0.05);
  }, []);

  const stopVoice = (key: string) => {
    const v = voices.current.get(key);
    if (!v || !ctxRef.current) return;
    const t = ctxRef.current.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(0, t + 0.12);
    v.nodes.forEach(n => { const o = n as OscillatorNode; if (o.stop) try { o.stop(t + 0.14); } catch { /* already stopped */ } });
    voices.current.delete(key);
  };

  /** Toggle the voice at `key` on/off. `freq` is the absolute pitch in Hz. */
  const toggle = useCallback((key: string, freq: number, initialGain?: number) => {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(key)) { stopVoice(key); next.delete(key); freqByKey.current.delete(key); gainByKey.current.delete(key); }
      else { startVoice(key, freq, initialGain); next.add(key); freqByKey.current.set(key, freq); }
      return next;
    });
  }, []);

  const stopAll = useCallback(() => {
    voices.current.forEach((_, k) => stopVoice(k));
    freqByKey.current.clear();
    gainByKey.current.clear();
    setActive(new Set());
  }, []);

  useEffect(() => () => { voices.current.forEach((_, k) => stopVoice(k)); }, []);

  return { active, toggle, stopAll, freqByKey, gainByKey, setGain };
}
