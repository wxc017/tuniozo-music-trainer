import { useState, useRef, useEffect, useCallback } from "react";
import { lsGet, lsSet } from "@/lib/storage";

const DUR_KEY = "lt_timer_duration_secs";
const DEFAULT_DURATION = 5 * 60;

let alertCtx: AudioContext | null = null;

function playAlertClick(times = 3) {
  try {
    if (!alertCtx || alertCtx.state === "closed") {
      alertCtx = new AudioContext();
    }
    if (alertCtx.state === "suspended") alertCtx.resume();
  } catch {
    return;
  }
  const ctx = alertCtx;
  for (let i = 0; i < times; i++) {
    const t = ctx.currentTime + i * 0.25;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  }
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function CountdownTimer() {
  const [duration, setDuration] = useState<number>(() => lsGet(DUR_KEY, DEFAULT_DURATION));
  const [remaining, setRemaining] = useState<number>(() => lsGet(DUR_KEY, DEFAULT_DURATION));
  const [running, setRunning] = useState(false);
  const [expired, setExpired] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editMin, setEditMin] = useState<string>("");
  const [editSec, setEditSec] = useState<string>("");

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remainingRef = useRef(remaining);
  remainingRef.current = remaining;

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRunning(false);
  }, []);

  const tick = useCallback(() => {
    setRemaining(prev => {
      if (prev <= 1) {
        stop();
        setExpired(true);
        playAlertClick(3);
        return 0;
      }
      return prev - 1;
    });
  }, [stop]);

  const startTimer = useCallback(() => {
    if (intervalRef.current !== null) return;
    if (remaining <= 0) {
      setRemaining(duration);
    }
    setExpired(false);
    intervalRef.current = setInterval(tick, 1000);
    setRunning(true);
  }, [remaining, duration, tick]);

  const pauseTimer = useCallback(() => {
    stop();
  }, [stop]);

  const reset = useCallback(() => {
    stop();
    setExpired(false);
    setRemaining(duration);
  }, [stop, duration]);

  const openEdit = () => {
    stop();
    setEditMin(String(Math.floor(duration / 60)));
    setEditSec(String(duration % 60));
    setEditing(true);
  };

  const applyEdit = () => {
    const m = Math.max(0, Math.min(99, parseInt(editMin) || 0));
    const s = Math.max(0, Math.min(59, parseInt(editSec) || 0));
    const newDur = m * 60 + s;
    const safeDur = newDur > 0 ? newDur : DEFAULT_DURATION;
    setDuration(safeDur);
    lsSet(DUR_KEY, safeDur);
    setRemaining(safeDur);
    setExpired(false);
    setEditing(false);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, []);

  const pct = duration > 0 ? remaining / duration : 1;
  const isLow = remaining <= 30 && running;

  return (
    <div className="flex items-center gap-2 select-none">
      {editing ? (
        <div className="flex items-center gap-1 bg-[#1a1a1a] border border-[#3a3a3a] rounded px-2 py-1">
          <input
            type="number"
            min={0}
            max={99}
            value={editMin}
            onChange={e => setEditMin(e.target.value)}
            className="w-10 bg-transparent text-xs text-white text-center focus:outline-none"
            placeholder="mm"
          />
          <span className="text-xs text-[#555]">:</span>
          <input
            type="number"
            min={0}
            max={59}
            value={editSec}
            onChange={e => setEditSec(e.target.value)}
            className="w-10 bg-transparent text-xs text-white text-center focus:outline-none"
            placeholder="ss"
          />
          <button
            onClick={applyEdit}
            className="ml-1 px-2 py-0.5 bg-[#7173e6] text-white rounded text-xs font-medium"
          >
            Set
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-1 py-0.5 text-[#666] hover:text-[#aaa] text-xs"
          >
            ✕
          </button>
        </div>
      ) : (
        <>
          <div
            className={`relative flex items-center gap-1.5 bg-[#1a1a1a] border rounded px-2 py-1 cursor-pointer transition-colors ${
              expired
                ? "border-[#cc3333] animate-pulse"
                : isLow
                ? "border-[#cc6633]"
                : "border-[#2a2a2a]"
            }`}
            title="Click to edit timer"
            onClick={!running ? openEdit : undefined}
          >
            <span
              className={`font-mono text-xs font-semibold tabular-nums ${
                expired
                  ? "text-[#cc3333]"
                  : isLow
                  ? "text-[#e08040]"
                  : remaining === duration
                  ? "text-[#666]"
                  : "text-[#ccc]"
              }`}
            >
              {formatTime(remaining)}
            </span>
            {duration > 0 && (
              <div className="w-12 h-1 bg-[#2a2a2a] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    expired ? "bg-[#cc3333]" : isLow ? "bg-[#cc6633]" : "bg-[#7173e6]"
                  }`}
                  style={{ width: `${Math.round(pct * 100)}%` }}
                />
              </div>
            )}
          </div>

          <button
            onClick={running ? pauseTimer : startTimer}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors border ${
              running
                ? "bg-[#1a1a1a] border-[#555] text-[#aaa] hover:text-white"
                : "bg-[#1a1a1a] border-[#333] text-[#666] hover:text-white hover:border-[#555]"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title={running ? "Pause timer" : "Start timer"}
          >
            {running ? "⏸" : "▶"}
          </button>

          <button
            onClick={reset}
            className="px-2 py-1 rounded text-xs border border-[#2a2a2a] text-[#555] hover:text-[#aaa] hover:border-[#444] transition-colors"
            title="Reset timer"
          >
            ↺
          </button>

          {!running && (
            <button
              onClick={openEdit}
              className="px-2 py-1 rounded text-xs border border-[#2a2a2a] text-[#555] hover:text-[#aaa] hover:border-[#444] transition-colors"
              title="Set duration"
            >
              ✎
            </button>
          )}
        </>
      )}
    </div>
  );
}
