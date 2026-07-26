import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { subscribeRest, restEndsAt, addRest, stopRest } from "@/lib/restTimerStore";

// A compact, non-blocking rest countdown that floats above everything (incl.
// the video popup). It keeps running as you cut a clip, switch views, or leave
// the timer — because its state lives in restTimerStore, not in this component.

export default function FloatingRestTimer() {
  const endsAt = useSyncExternalStore(subscribeRest, restEndsAt);
  const [, force] = useState(0);
  const beeped = useRef(false);

  // Reset the "done" beep latch whenever a new rest starts.
  useEffect(() => { beeped.current = false; }, [endsAt]);

  // Tick the display while active.
  useEffect(() => {
    if (endsAt == null) return;
    const id = window.setInterval(() => force(x => x + 1), 250);
    return () => window.clearInterval(id);
  }, [endsAt]);

  if (endsAt == null) return null;

  const left = Math.max(0, (endsAt - Date.now()) / 1000);
  const done = left <= 0;
  if (done && !beeped.current) {
    beeped.current = true;
    beep();
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* unsupported */ }
  }

  const m = Math.floor(left / 60);
  const s = Math.floor(left % 60);

  return (
    // `wl-root` supplies the color variables, but its base rule also sets
    // height:100% + a solid background — override both here so this is just a
    // small floating pill, not a full-screen black box.
    <div className="wl-root fixed z-[90]"
      style={{ top: 10, right: 10, pointerEvents: "none", height: "auto", background: "transparent" }}>
      <div className="flex items-center gap-2.5 rounded-full"
        style={{
          pointerEvents: "auto",
          padding: "10px 12px 10px 20px",
          background: done ? "var(--wl-good)" : "var(--wl-surface-2)",
          border: `1px solid ${done ? "var(--wl-good)" : "color-mix(in srgb, var(--wl-accent) 45%, var(--wl-line))"}`,
          boxShadow: "0 8px 30px rgba(0,0,0,.55)",
        }}>
        <span className="wl-num" style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, color: done ? "#0d0d0f" : "var(--wl-text)" }}>
          {done ? "Rest done" : `${m}:${String(s).padStart(2, "0")}`}
        </span>
        {!done && (
          <button onClick={() => addRest(30)} className="wl-mono"
            style={{ fontSize: 16, padding: "9px 13px", borderRadius: 999, background: "var(--wl-surface)", color: "var(--wl-accent-ink)", border: "1px solid var(--wl-line)" }}>
            +30
          </button>
        )}
        <button onClick={stopRest} className="wl-mono"
          style={{ fontSize: 16, padding: "9px 16px", borderRadius: 999, background: done ? "#0d0d0f" : "var(--wl-accent)", color: done ? "var(--wl-good)" : "#1a1408", fontWeight: 700, border: "none" }}>
          {done ? "✓ Done" : "Skip ✕"}
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
