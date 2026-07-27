import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { subscribeRest, restEndsAt, startRest, addRest, stopRest } from "@/lib/restTimerStore";

// The one timer for a session — pinned to the top of the logger. Its state
// lives in restTimerStore (anchored to a wall-clock end time), so it keeps
// counting correctly across view switches and tab throttling. When it reaches
// zero it beeps + buzzes.

const PRESETS = [30, 60, 90, 120, 180]; // seconds

export default function SessionTimer() {
  const endsAt = useSyncExternalStore(subscribeRest, restEndsAt);
  const [, force] = useState(0);
  const [custom, setCustom] = useState("");
  const beeped = useRef(false);

  // Re-arm the completion beep whenever a new countdown starts.
  useEffect(() => { beeped.current = false; }, [endsAt]);

  // Tick the display while a countdown is live.
  useEffect(() => {
    if (endsAt == null) return;
    const id = window.setInterval(() => force(x => x + 1), 250);
    return () => window.clearInterval(id);
  }, [endsAt]);

  const running = endsAt != null;
  const left = running ? Math.max(0, (endsAt - Date.now()) / 1000) : 0;
  const done = running && left <= 0;

  if (done && !beeped.current) {
    beeped.current = true;
    beep();
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* unsupported */ }
  }

  const m = Math.floor(left / 60);
  const s = Math.floor(left % 60);

  const startCustom = () => {
    const secs = parseTime(custom);
    if (secs) { startRest(secs); setCustom(""); }
  };

  if (!running) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-2 flex-wrap"
        style={{ borderBottom: "1px solid var(--wl-line)" }}>
        <span className="wl-collabel" style={{ marginRight: 2 }}>⏱ Timer</span>
        {PRESETS.map(p => (
          <button key={p} onClick={() => startRest(p)} className="wl-tag wl-tag--muted"
            style={{ cursor: "pointer" }}>{fmt(p)}</button>
        ))}
        <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="m:ss"
          onKeyDown={e => { if (e.key === "Enter") startCustom(); }}
          inputMode="numeric" className="wl-cell" style={{ width: "3.4rem" }} />
        <button onClick={startCustom} disabled={!parseTime(custom)} className="wl-tag"
          style={{ cursor: "pointer", opacity: parseTime(custom) ? 1 : .4 }}>Go</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 px-3 py-2"
      style={{ borderBottom: "1px solid var(--wl-line)", background: done ? "var(--wl-good)" : "transparent" }}>
      <span className="wl-num" style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color: done ? "#0d0d0f" : "var(--wl-text)" }}>
        {done ? "Time!" : `${m}:${String(s).padStart(2, "0")}`}
      </span>
      {!done && (
        <button onClick={() => addRest(30)} className="wl-tag" style={{ cursor: "pointer" }}>+30</button>
      )}
      <button onClick={stopRest} className="wl-tag ml-auto"
        style={{ cursor: "pointer", background: done ? "#0d0d0f" : "var(--wl-accent)", color: done ? "var(--wl-good)" : "#1a1408", fontWeight: 700 }}>
        {done ? "✓ Dismiss" : "Stop ✕"}
      </button>
    </div>
  );
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? (s ? `${m}:${String(s).padStart(2, "0")}` : `${m}:00`) : `${s}s`;
}

// Accepts "m:ss" or plain seconds; returns seconds or undefined.
function parseTime(t: string): number | undefined {
  const v = t.trim();
  if (!v) return undefined;
  if (v.includes(":")) {
    const [m, sec] = v.split(":");
    const total = (parseInt(m || "0", 10) || 0) * 60 + (parseInt(sec || "0", 10) || 0);
    return total > 0 ? total : undefined;
  }
  const n = parseInt(v, 10);
  return n > 0 ? n : undefined;
}

function beep(): void {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    // Two short rising blips so it's clearly a "done" chime, not a stray tick.
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t0 = ctx.currentTime + i * 0.22;
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
      osc.start(t0);
      osc.stop(t0 + 0.24);
      if (i === 1) osc.onended = () => ctx.close();
    });
  } catch { /* audio blocked until a user gesture */ }
}
