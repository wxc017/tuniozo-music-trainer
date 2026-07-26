import { useEffect, useState } from "react";
import { useUndo, undoLast, clearUndo } from "@/lib/workoutStore";

// Floating "Deleted … · Undo" pill (top-left) shown briefly after a delete.
// Structural deletes don't touch media, so undo always restores cleanly.

export default function UndoBar() {
  const undo = useUndo();
  const [, force] = useState(0);

  // Auto-dismiss ~14s after the delete.
  useEffect(() => {
    if (!undo) return;
    const id = window.setTimeout(() => clearUndo(), 14000);
    // tick so the fade/label stays fresh if needed
    force(x => x + 1);
    return () => window.clearTimeout(id);
  }, [undo?.ts]);

  if (!undo) return null;

  return (
    <div className="wl-root fixed z-[90]" style={{ top: 10, left: 10, pointerEvents: "none", height: "auto", background: "transparent" }}>
      <div className="flex items-center gap-3 rounded-full"
        style={{
          pointerEvents: "auto", padding: "9px 10px 9px 16px",
          background: "var(--wl-surface-2)",
          border: "1px solid color-mix(in srgb, var(--wl-accent) 40%, var(--wl-line))",
          boxShadow: "0 8px 30px rgba(0,0,0,.55)",
        }}>
        <span style={{ fontSize: 14, color: "var(--wl-text)" }}>Deleted {undo.label}</span>
        <button onClick={undoLast} className="wl-mono"
          style={{ fontSize: 14, fontWeight: 700, padding: "8px 14px", borderRadius: 999, background: "var(--wl-accent)", color: "#1a1408", border: "none" }}>
          Undo
        </button>
      </div>
    </div>
  );
}
