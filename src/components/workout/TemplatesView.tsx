import { useState } from "react";
import ExercisePicker, { type PickedExercise } from "./ExercisePicker";
import { useWorkoutData, saveTemplate, deleteTemplate, startWorkout, uid } from "@/lib/workoutStore";
import { type WorkoutTemplate, type TemplateExercise, TRACKING_MODES } from "@/lib/workoutTypes";

// Saved custom workouts. Build one (name + target exercises/sets), then
// "Start" spins up a live session pre-filled from it.

interface Props { onStart: (workoutId: string) => void }

export default function TemplatesView({ onStart }: Props) {
  const { templates } = useWorkoutData();
  const [editing, setEditing] = useState<WorkoutTemplate | null>(null);

  const newTemplate = () => setEditing({ id: uid("tpl"), name: "", exercises: [], createdAt: 0, updatedAt: 0 });
  if (editing) return <TemplateEditor template={editing} onClose={() => setEditing(null)} />;

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <div className="wl-sechead">
        <span className="wl-eyebrow">Saved workouts</span>
        <button onClick={newTemplate} className="wl-btn wl-btn--ghost ml-auto" style={{ padding: "6px 12px" }}>+ New</button>
      </div>

      {templates.length === 0 && (
        <div className="wl-add" style={{ cursor: "default" }}>
          No saved workouts yet. Build one, or save a finished session as a template.
        </div>
      )}

      {templates.map(t => (
        <div key={t.id} className="wl-card p-3.5">
          <div className="flex items-center gap-2">
            <span className="wl-h2" style={{ fontSize: 15 }}>{t.name || "Untitled"}</span>
            <span className="wl-count">{t.exercises.length} exercises</span>
          </div>
          <div className="text-[12px] wl-muted mt-1.5 truncate">
            {t.exercises.map(e => `${e.name}${e.targetSets ? ` ×${e.targetSets}` : ""}`).join(" · ") || "empty"}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => onStart(startWorkout(t).id)} className="wl-btn wl-btn--ghost flex-1">Start</button>
            <button onClick={() => setEditing(t)} className="wl-btn">Edit</button>
            <button onClick={() => { if (window.confirm(`Delete “${t.name}”?`)) deleteTemplate(t.id); }} className="wl-btn wl-btn--danger">Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TemplateEditor({ template, onClose }: { template: WorkoutTemplate; onClose: () => void }) {
  const [t, setT] = useState<WorkoutTemplate>(template);
  const [picking, setPicking] = useState(false);

  const addExercise = (c: PickedExercise) => {
    const te: TemplateExercise = { name: c.name, skillId: c.skillId, mode: c.mode, targetSets: 3 };
    setT(prev => ({ ...prev, exercises: [...prev.exercises, te] }));
    setPicking(false);
  };
  const patchEx = (i: number, patch: Partial<TemplateExercise>) =>
    setT(prev => ({ ...prev, exercises: prev.exercises.map((e, j) => j === i ? { ...e, ...patch } : e) }));
  const removeEx = (i: number) => setT(prev => ({ ...prev, exercises: prev.exercises.filter((_, j) => j !== i) }));

  const save = () => { if (!t.name.trim()) { window.alert("Give the workout a name."); return; } saveTemplate(t); onClose(); };

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onClose} className="wl-icon-btn text-sm">‹ Back</button>
        <button onClick={save} className="wl-btn wl-btn--primary ml-auto" style={{ padding: "6px 16px" }}>Save</button>
      </div>

      <input value={t.name} onChange={e => setT(prev => ({ ...prev, name: e.target.value }))}
        placeholder="Workout name (e.g. Push Day, Ring Skills)…" className="wl-input" />

      {t.exercises.map((e, i) => (
        <div key={i} className="wl-card p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm" style={{ color: "var(--wl-text)" }}>{e.name}</span>
            <span className="wl-tag wl-tag--muted">{TRACKING_MODES.find(m => m.id === e.mode)?.short}</span>
            <button onClick={() => removeEx(i)} className="wl-icon-btn wl-icon-btn--danger text-xs ml-auto">✕</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <LabeledNum label="Sets" value={e.targetSets} onChange={v => patchEx(i, { targetSets: v })} />
            <LabeledNum label="Reps" value={e.targetReps} onChange={v => patchEx(i, { targetReps: v })} />
            <LabeledNum label="Rest s" value={e.restSec} onChange={v => patchEx(i, { restSec: v })} />
          </div>
        </div>
      ))}

      <button onClick={() => setPicking(true)} className="wl-add">+ Add exercise</button>
      {picking && <ExercisePicker onPick={addExercise} onCancel={() => setPicking(false)} />}
    </div>
  );
}

function LabeledNum({ label, value, onChange }: { label: string; value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="wl-collabel">{label}</span>
      <input type="number" inputMode="numeric" min={0} value={value ?? ""}
        onChange={e => onChange(e.target.value === "" ? undefined : Number(e.target.value))} className="wl-cell" />
    </label>
  );
}
