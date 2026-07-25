import { useEffect, useRef, useState } from "react";
import { scheduleRestNotification } from "@/lib/restNotify";

// Full-screen rest countdown launched from a set's ⏱ button. Counts down the
// set's rest seconds and beeps + vibrates at zero (best-effort; the Web Audio
// beep needs the launching tap as its user gesture, which we have).

interface Props {
  seconds: number;
  onDone: () => void;
  onCancel: () => void;
}

export default function RestTimer({ seconds, onDone, onCancel }: Props) {
  const [left, setLeft] = useState(seconds);
  const startedAt = useRef(Date.now());

  // Schedule a phone notification for when rest ends, so the user can leave
  // the app (e.g. to record/trim a clip) and still get pinged. Cancelled if
  // they finish/skip early.
  useEffect(() => {
    const cancel = scheduleRestNotification(seconds);
    return cancel;
  }, [seconds]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt.current) / 1000;
      const remaining = Math.max(0, seconds - elapsed);
      setLeft(remaining);
      if (remaining <= 0) {
        window.clearInterval(id);
        beep();
        try { navigator.vibrate?.([200, 100, 200]); } catch { /* unsupported */ }
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [seconds]);

  const m = Math.floor(left / 60);
  const s = Math.floor(left % 60);
  const done = left <= 0;

  return (
    <div className="wl-root fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6"
      style={{ background: "rgba(0,0,0,.88)" }} onClick={onCancel}>
      <div className="wl-num text-7xl font-bold" style={{ color: done ? "var(--wl-good)" : "var(--wl-text)" }}>
        {m}:{String(s).padStart(2, "0")}
      </div>
      <div className="text-sm wl-muted">{done ? "Rest complete — go" : "Resting…"}</div>
      <div className="flex gap-3" onClick={e => e.stopPropagation()}>
        <button onClick={() => { startedAt.current = Date.now() - (seconds - left - 30) * 1000; setLeft(l => Math.min(seconds, l + 30)); }}
          className="wl-btn">+30s</button>
        <button onClick={done ? onDone : onCancel} className="wl-btn wl-btn--primary" style={{ padding: "9px 24px" }}>
          {done ? "Done" : "Skip"}
        </button>
      </div>
    </div>
  );
}

function beep(): void {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
    osc.onended = () => ctx.close();
  } catch { /* audio blocked */ }
}
