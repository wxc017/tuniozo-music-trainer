import { useEffect, useMemo, useState } from "react";
import SetVideo from "./SetVideo";
import ExercisePicker, { type PickedExercise } from "./ExercisePicker";
import { startRest } from "@/lib/restTimerStore";
import {
  upsertWorkout, makeExercise, makeSet, deleteWorkout,
  templateFromWorkout, saveTemplate, useWorkoutData, captureUndo,
} from "@/lib/workoutStore";
import {
  type Workout, type LoggedExercise, type WorkoutSet, type WeightUnit, type TrackingMode,
  TRACKING_MODES, modeShowsWeight, modeShowsReps, modeShowsTime,
} from "@/lib/workoutTypes";

// Live session logger — the phone-first screen. Every change writes straight
// through to the store (which auto-syncs). Columns adapt to each exercise's
// tracking mode (weight+reps / weight+time / reps / time).

interface Props { workoutId: string; onClose: () => void }

export default function SessionLogger({ workoutId, onClose }: Props) {
  const { workouts, prefs } = useWorkoutData();
  const workout = useMemo(() => workouts.find(w => w.id === workoutId), [workouts, workoutId]);
  const [picking, setPicking] = useState(false);

  if (!workout) {
    return <div className="p-6 wl-muted">Workout not found. <button className="underline" style={{ color: "var(--wl-accent)" }} onClick={onClose}>Back</button></div>;
  }

  const patch = (updater: (w: Workout) => Workout) => upsertWorkout(updater(structuredClone(workout)));

  const addExercise = (c: PickedExercise) => {
    patch(w => { w.exercises.push(makeExercise(c.name, c.mode, c.skillId)); return w; });
    setPicking(false);
  };
  const removeExercise = (exId: string) => { captureUndo("exercise"); patch(w => { w.exercises = w.exercises.filter(e => e.id !== exId); return w; }); };
  const setMode = (exId: string, mode: TrackingMode) =>
    patch(w => { const ex = w.exercises.find(e => e.id === exId); if (ex) ex.mode = mode; return w; });
  const addSet = (exId: string) =>
    patch(w => {
      const ex = w.exercises.find(e => e.id === exId);
      if (ex) {
        const last = ex.sets[ex.sets.length - 1];
        ex.sets.push(makeSet(last ? { reps: last.reps, holdSec: last.holdSec, weight: last.weight, rpe: last.rpe, restSec: last.restSec } : undefined));
      }
      return w;
    });
  const removeSet = (exId: string, setId: string) => {
    captureUndo("set");
    patch(w => { const ex = w.exercises.find(e => e.id === exId); if (ex) ex.sets = ex.sets.filter(s => s.id !== setId); return w; });
  };
  const patchSet = (exId: string, setId: string, sp: Partial<WorkoutSet>) =>
    patch(w => { const s = w.exercises.find(e => e.id === exId)?.sets.find(x => x.id === setId); if (s) Object.assign(s, sp); return w; });

  const saveAsTemplate = () => {
    const name = window.prompt("Template name:", workout.title || "My Workout");
    if (name) saveTemplate(templateFromWorkout(workout, name));
  };
  const removeWorkout = () => { if (window.confirm("Delete this entire workout?")) { deleteWorkout(workout.id); onClose(); } };

  const totalSets = workout.exercises.reduce((n, e) => n + e.sets.length, 0);
  const doneSets = workout.exercises.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0);

  return (
    <div className="wl-root flex flex-col h-full">
      {/* header */}
      <div className="flex items-center gap-2 px-3 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--wl-line)" }}>
        <button onClick={onClose} className="wl-icon-btn text-sm px-1">‹ Back</button>
        <input value={workout.title ?? ""} onChange={e => patch(w => { w.title = e.target.value; return w; })}
          placeholder="Untitled workout" className="wl-h2 flex-1 bg-transparent focus:outline-none"
          style={{ border: "none", color: "var(--wl-text)" }} />
        <span className="wl-num text-xs" style={{ color: doneSets === totalSets && totalSets ? "var(--wl-good)" : "var(--wl-faint)" }}>
          {doneSets}/{totalSets}
        </span>
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-3">
        <div className="wl-mono text-[11px] wl-faint">{workout.date}</div>

        {workout.exercises.map(ex => (
          <ExerciseCard key={ex.id} ex={ex} unit={prefs.unit} workoutId={workout.id}
            onRemove={() => removeExercise(ex.id)} onSetMode={m => setMode(ex.id, m)}
            onAddSet={() => addSet(ex.id)} onRemoveSet={sid => removeSet(ex.id, sid)}
            onPatchSet={(sid, sp) => patchSet(ex.id, sid, sp)}
            onRest={sec => startRest(sec)} />
        ))}

        <button onClick={() => setPicking(true)} className="wl-add">+ Add exercise</button>

        <div className="flex flex-wrap gap-2 pt-2">
          <button onClick={saveAsTemplate} className="wl-btn flex-1">Save as template</button>
          <button onClick={removeWorkout} className="wl-btn wl-btn--danger">Delete</button>
        </div>
      </div>

      {picking && <ExercisePicker onPick={addExercise} onCancel={() => setPicking(false)} />}
    </div>
  );
}

function ExerciseCard(props: {
  ex: LoggedExercise; unit: WeightUnit; workoutId: string;
  onRemove: () => void; onSetMode: (m: TrackingMode) => void;
  onAddSet: () => void; onRemoveSet: (setId: string) => void;
  onPatchSet: (setId: string, patch: Partial<WorkoutSet>) => void; onRest: (sec: number) => void;
}) {
  const { ex, unit } = props;
  const [modeOpen, setModeOpen] = useState(false);
  const cols = columnsFor(ex.mode, unit);

  return (
    <div className="wl-card" style={{ borderRadius: 14 }}>
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid var(--wl-line)" }}>
        <span className="text-sm font-medium" style={{ color: "var(--wl-text)" }}>{ex.name}</span>
        {ex.skillId && <span className="wl-tag">skill</span>}
        {/* mode switcher */}
        <div className="relative ml-auto">
          <button onClick={() => setModeOpen(o => !o)} className="wl-tag wl-tag--muted" style={{ cursor: "pointer" }}>
            {TRACKING_MODES.find(m => m.id === ex.mode)?.short} ▾
          </button>
          {modeOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 wl-card p-1" style={{ borderRadius: 10, minWidth: 150 }}>
              {TRACKING_MODES.map(m => (
                <button key={m.id} onClick={() => { props.onSetMode(m.id); setModeOpen(false); }}
                  className="w-full text-left px-2.5 py-1.5 rounded-md text-xs hover:brightness-125"
                  style={{ color: m.id === ex.mode ? "var(--wl-accent-ink)" : "var(--wl-muted)" }}>
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={props.onRemove} className="wl-icon-btn wl-icon-btn--danger text-xs">✕</button>
      </div>

      {/* column header */}
      <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
        <span className="wl-collabel" style={{ width: "1.75rem" }}>#</span>
        {cols.map(c => <span key={c.key} className="wl-collabel flex-1 text-center">{c.label}</span>)}
        <span className="wl-collabel" style={{ width: "3.1rem", textAlign: "center" }}>RPE</span>
        <span className="wl-collabel flex-1 text-center">Rest</span>
        <span style={{ width: "1.2rem" }} />
      </div>

      <div className="px-3 pb-2 space-y-2">
        {ex.sets.map((s, i) => (
          <div key={s.id}>
            <div className="wl-setrow flex items-center gap-1.5">
              <button onClick={() => props.onPatchSet(s.id, { done: !s.done })}
                className="w-7 h-7 rounded-full text-[11px] flex items-center justify-center flex-shrink-0 wl-num"
                style={{
                  border: `1px solid ${s.done ? "var(--wl-good)" : "var(--wl-line)"}`,
                  background: s.done ? "var(--wl-good)" : "transparent",
                  color: s.done ? "#0d0d0f" : "var(--wl-faint)",
                }} title="Mark set done">
                {s.done ? "✓" : i + 1}
              </button>

              {cols.map(c => (
                <input key={c.key} type="number" inputMode="decimal" className="wl-cell flex-1"
                  value={c.get(s) ?? ""} min={c.allowNeg ? undefined : 0}
                  onChange={e => props.onPatchSet(s.id, c.set(e.target.value === "" ? undefined : Number(e.target.value)))} />
              ))}

              <RpeCell value={s.rpe} onChange={v => props.onPatchSet(s.id, { rpe: v })} />
              <RestCell value={s.restSec} onChange={v => props.onPatchSet(s.id, { restSec: v })}
                onStart={() => s.restSec && props.onRest(s.restSec)} />
              <button onClick={() => props.onRemoveSet(s.id)} className="wl-icon-btn wl-icon-btn--danger text-xs" style={{ width: "1.2rem" }}>✕</button>
            </div>
            <SetVideo set={s} workoutId={props.workoutId} onChange={sp => props.onPatchSet(s.id, sp)} />
          </div>
        ))}
      </div>

      <button onClick={props.onAddSet} className="w-full py-2 text-[11px] wl-mono"
        style={{ color: "var(--wl-accent)", borderTop: "1px solid var(--wl-line)" }}>+ Add set</button>
    </div>
  );
}

interface Col { key: string; label: string; allowNeg?: boolean; get: (s: WorkoutSet) => number | undefined; set: (v: number | undefined) => Partial<WorkoutSet> }
function columnsFor(mode: TrackingMode, unit: WeightUnit): Col[] {
  const cols: Col[] = [];
  if (modeShowsWeight(mode)) cols.push({ key: "w", label: `±${unit}`, allowNeg: true, get: s => s.weight, set: v => ({ weight: v }) });
  if (modeShowsReps(mode)) cols.push({ key: "r", label: "Reps", get: s => s.reps, set: v => ({ reps: v }) });
  if (modeShowsTime(mode)) cols.push({ key: "t", label: "Hold s", get: s => s.holdSec, set: v => ({ holdSec: v }) });
  return cols;
}

function RpeCell({ value, onChange }: { value?: number; onChange: (v: number | undefined) => void }) {
  const color = value == null ? "var(--wl-line)"
    : value >= 9 ? "var(--wl-hard)" : value >= 8 ? "var(--wl-warn)" : value >= 7 ? "var(--wl-accent)" : "var(--wl-good)";
  return (
    <select value={value ?? ""} onChange={e => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      className="wl-cell" style={{ width: "3.1rem", borderColor: color, padding: "7px 2px" }}>
      <option value="">–</option>
      {[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

// Rest accepts "3:00" (m:ss) or plain seconds ("180" / "90"); stored as seconds.
function parseRest(t: string): number | undefined {
  const s = t.trim();
  if (!s) return undefined;
  if (s.includes(":")) {
    const [m, sec] = s.split(":");
    return (parseInt(m || "0", 10) || 0) * 60 + (parseInt(sec || "0", 10) || 0);
  }
  const n = parseInt(s, 10);
  return isNaN(n) ? undefined : n;
}
function fmtRest(v?: number): string {
  if (v == null) return "";
  const m = Math.floor(v / 60), s = v % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}`;
}
function RestCell({ value, onChange, onStart }: { value?: number; onChange: (v: number | undefined) => void; onStart: () => void }) {
  const [text, setText] = useState(() => fmtRest(value));
  const [focused, setFocused] = useState(false);
  // Reflect external value changes while not actively typing.
  useEffect(() => { if (!focused) setText(fmtRest(value)); }, [value, focused]);
  return (
    <div className="flex items-center gap-0.5 flex-1">
      <input type="text" inputMode="numeric" className="wl-cell flex-1" value={text} placeholder="m:ss"
        onFocus={() => setFocused(true)}
        onChange={e => { setText(e.target.value); onChange(parseRest(e.target.value)); }}
        onBlur={() => { setFocused(false); setText(fmtRest(value)); }}
        title="Rest — type 3:00 or seconds" />
      <button onClick={onStart} disabled={!value} className="text-[13px]" style={{ color: "var(--wl-accent)", opacity: value ? 1 : .3 }} title="Start rest timer">⏱</button>
    </div>
  );
}
