import { useMemo, useState } from "react";
import { useWorkoutData, saveCustomExercise, deleteCustomExercise } from "@/lib/workoutStore";
import { TRACKING_MODES, type TrackingMode } from "@/lib/workoutTypes";

// Pick from YOUR saved exercises, or add a new one — choosing how it's tracked
// (weight+reps, weight+time, reps, or time). New exercises are saved for reuse.

export interface PickedExercise { name: string; skillId?: string; mode: TrackingMode }

interface Props {
  onPick: (choice: PickedExercise) => void;
  onCancel: () => void;
}

export default function ExercisePicker({ onPick, onCancel }: Props) {
  const { customExercises } = useWorkoutData();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState<string | null>(null); // name pending a mode choice
  const query = q.trim().toLowerCase();

  const customs = useMemo(
    () => customExercises.filter(e => !query || e.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [customExercises, query],
  );

  const typed = q.trim();
  const exactMatch = customExercises.some(e => e.name.toLowerCase() === query);
  const canAdd = typed.length > 0 && !exactMatch;

  const confirmCreate = (mode: TrackingMode) => {
    if (!creating) return;
    const saved = saveCustomExercise(creating, mode);
    onPick({ name: saved.name, mode: saved.mode });
  };

  return (
    <div className="wl-root fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,.7)" }} onClick={onCancel}>
      <div
        className="wl-card w-full max-w-md max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--wl-line)" }}>
          <input
            autoFocus className="wl-input" value={q}
            onChange={e => { setQ(e.target.value); setCreating(null); }}
            placeholder="Search or type a new exercise…"
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Add new → choose tracking mode */}
          {canAdd && (
            <div className="px-3 py-3" style={{ borderBottom: "1px solid var(--wl-line)" }}>
              {creating == null ? (
                <button onClick={() => setCreating(typed)} className="flex items-center gap-2 text-sm" style={{ color: "var(--wl-text)" }}>
                  <span style={{ color: "var(--wl-accent)", fontSize: 18, lineHeight: 1 }}>＋</span>
                  Add <b>“{typed}”</b> <span className="wl-faint">— new exercise</span>
                </button>
              ) : (
                <div>
                  <div className="wl-collabel mb-2">How is “{creating}” tracked?</div>
                  <div className="grid grid-cols-2 gap-2">
                    {TRACKING_MODES.map(m => (
                      <button key={m.id} onClick={() => confirmCreate(m.id)} className="wl-btn" style={{ padding: "10px 8px", textAlign: "center" }}>
                        <div style={{ color: "var(--wl-text)", fontWeight: 600 }}>{m.label}</div>
                        <div className="wl-mono" style={{ fontSize: 10, color: "var(--wl-faint)" }}>{m.short}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Your saved exercises */}
          {customs.length > 0 && (
            <div>
              <div className="wl-collabel sticky top-0 px-4 py-1.5" style={{ background: "var(--wl-surface-2)", borderBottom: "1px solid var(--wl-line)" }}>
                Your exercises
              </div>
              {customs.map(e => (
                <div key={e.id} className="w-full flex items-center gap-2 px-4 py-2.5 hover:brightness-125"
                  style={{ borderBottom: "1px solid color-mix(in srgb, var(--wl-line) 50%, transparent)" }}>
                  <button onClick={() => onPick({ name: e.name, mode: e.mode })} className="flex-1 text-left flex items-center gap-2">
                    <span className="text-sm" style={{ color: "var(--wl-text)" }}>{e.name}</span>
                    <span className="ml-auto wl-mono" style={{ fontSize: 10, color: "var(--wl-faint)" }}>
                      {TRACKING_MODES.find(m => m.id === e.mode)?.short}
                    </span>
                  </button>
                  <button onClick={() => deleteCustomExercise(e.id)} className="wl-icon-btn wl-icon-btn--danger text-xs" title="Remove saved exercise">✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {customs.length === 0 && !canAdd && (
            <div className="px-4 py-10 text-center text-sm wl-muted leading-relaxed">
              {customExercises.length === 0
                ? <>No exercises yet.<br />Type a name above to add your first one.</>
                : <>No match. Type a new name to add it.</>}
            </div>
          )}
        </div>

        <button onClick={onCancel} className="flex-shrink-0 p-3 text-sm wl-muted" style={{ borderTop: "1px solid var(--wl-line)" }}>Cancel</button>
      </div>
    </div>
  );
}
