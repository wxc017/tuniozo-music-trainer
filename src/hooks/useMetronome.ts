import { useState, useRef, useEffect, useCallback } from "react";
import { lsGet, lsSet } from "@/lib/storage";

const BPM_KEY = "lt_metronome_bpm";
const MIN_BPM = 20;
const MAX_BPM = 300;
const LOOKAHEAD_MS = 25.0;
const SCHEDULE_AHEAD_SEC = 0.1;

function playClick(ctx: AudioContext, time: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(1200, time);
  osc.frequency.exponentialRampToValueAtTime(400, time + 0.02);

  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.6, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(time);
  osc.stop(time + 0.07);
}

export function useMetronome() {
  const [bpm, setBpmState] = useState<number>(() => lsGet(BPM_KEY, 120));
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const schedulerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const beatTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextNoteTime = useRef(0);
  const bpmRef = useRef(bpm);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  const setBpm = useCallback((val: number) => {
    const n = Number(val);
    if (isNaN(n)) return;
    const clamped = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(n)));
    setBpmState(clamped);
    lsSet(BPM_KEY, clamped);
  }, []);

  const clearBeatTimeouts = useCallback(() => {
    for (const id of beatTimeouts.current) clearTimeout(id);
    beatTimeouts.current = [];
  }, []);

  const scheduleBeats = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    while (nextNoteTime.current < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
      const beatTime = nextNoteTime.current;
      playClick(ctx, beatTime);

      const interval = 60.0 / bpmRef.current;
      nextNoteTime.current += interval;

      const msUntilBeat = (beatTime - ctx.currentTime) * 1000;
      const onId = setTimeout(() => {
        setBeat(true);
        const offId = setTimeout(() => setBeat(false), Math.min(80, (interval * 1000) * 0.25));
        beatTimeouts.current.push(offId);
      }, Math.max(0, msUntilBeat));
      beatTimeouts.current.push(onId);
    }
  }, []);

  const start = useCallback(async () => {
    if (schedulerRef.current !== null) return;
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") await ctx.resume();

    nextNoteTime.current = ctx.currentTime + 0.05;

    schedulerRef.current = setInterval(scheduleBeats, LOOKAHEAD_MS);
    setRunning(true);
  }, [scheduleBeats]);

  const stop = useCallback(() => {
    if (schedulerRef.current !== null) {
      clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
    clearBeatTimeouts();
    setRunning(false);
    setBeat(false);
    if (ctxRef.current) {
      ctxRef.current.suspend();
    }
  }, [clearBeatTimeouts]);

  useEffect(() => {
    return () => {
      if (schedulerRef.current !== null) clearInterval(schedulerRef.current);
      clearBeatTimeouts();
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
    };
  }, [clearBeatTimeouts]);

  return { bpm, setBpm, running, beat, start, stop };
}
