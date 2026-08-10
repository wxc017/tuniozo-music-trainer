import { useMemo, useState } from "react";
import { VideoRowButton, VideoThumb, SetVideoEditor } from "./SetVideo";
import SessionTimer from "./SessionTimer";
import ExercisePicker, { type PickedExercise } from "./ExercisePicker";
import { exportWorkoutSession } from "@/lib/workoutExport";
import {
  upsertWorkout, makeExercise, makeSet, deleteWorkout,
  templateFromWorkout, saveTemplate, useWorkoutData, captureUndo, lastNoteForExercise, isHalverAssisted,
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
  // The picker sheet, in one of two jobs: appending a new exercise, or
  // RE-LABELLING one already in the session (`exId` set).
  const [picking, setPicking] = useState<{ exId?: string } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareMenu, setShareMenu] = useState(false);

  if (!workout) {
    return <div className="p-6 wl-muted">Workout not found. <button className="underline" style={{ color: "var(--wl-accent)" }} onClick={onClose}>Back</button></div>;
  }

  const patch = (updater: (w: Workout) => Workout) => upsertWorkout(updater(structuredClone(workout)));

  const addExercise = (c: PickedExercise) => {
    patch(w => { w.exercises.push(makeExercise(c.name, c.mode, c.skillId)); return w; });
    setPicking(null);
  };
  // Re-label an exercise that's already logged: only the IDENTITY changes (name,
  // catalog link, tracking mode).  `sets` is left alone, and since a set is where
  // the video, the trim marks and the per-set note live, all of that survives —
  // that's the whole point of editing in place instead of deleting and re-adding.
  // The mode follows the new exercise (a hold mislabelled as reps needs the time
  // column), and nothing is deleted when it changes: every set keeps its stored
  // reps / hold / weight, so switching the mode back brings the numbers with it.
  const retargetExercise = (exId: string, c: PickedExercise) => {
    captureUndo("exercise");
    patch(w => {
      const ex = w.exercises.find(e => e.id === exId);
      if (ex) {
        ex.name = c.name;
        ex.mode = c.mode;
        // Clear a stale catalog link — keeping it would show the "skill" tag and
        // the muscle map of the exercise this ISN'T any more.
        if (c.skillId) ex.skillId = c.skillId; else delete ex.skillId;
      }
      return w;
    });
    setPicking(null);
  };
  const removeExercise = (exId: string) => { captureUndo("exercise"); patch(w => { w.exercises = w.exercises.filter(e => e.id !== exId); return w; }); };
  const setMode = (exId: string, mode: TrackingMode) =>
    patch(w => { const ex = w.exercises.find(e => e.id === exId); if (ex) ex.mode = mode; return w; });
  const addSet = (exId: string) =>
    patch(w => {
      const ex = w.exercises.find(e => e.id === exId);
      if (ex) {
        const last = ex.sets[ex.sets.length - 1];
        ex.sets.push(makeSet(last ? { reps: last.reps, holdSec: last.holdSec, weight: last.weight, waistWeight: last.waistWeight, rpe: last.rpe, restSec: last.restSec } : undefined));
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
  const shareSession = async (download: boolean) => {
    setShareMenu(false);
    setSharing(true);
    try { await exportWorkoutSession(workout, { download }); }
    catch (err) { window.alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setSharing(false); }
  };

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

      {/* the one session timer — pinned above the scroll area */}
      <div className="flex-shrink-0"><SessionTimer /></div>

      {/* body */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-3">
        <div className="wl-mono text-[11px] wl-faint">{workout.date}</div>

        {workout.exercises.map(ex => (
          <ExerciseCard key={ex.id} ex={ex} unit={prefs.unit} workoutId={workout.id}
            onRemove={() => removeExercise(ex.id)} onSetMode={m => setMode(ex.id, m)}
            onRetarget={() => setPicking({ exId: ex.id })}
            onAddSet={() => addSet(ex.id)} onRemoveSet={sid => removeSet(ex.id, sid)}
            onPatchSet={(sid, sp) => patchSet(ex.id, sid, sp)} />
        ))}

        <button onClick={() => setPicking({})} className="wl-add">+ Add exercise</button>

        <div className="flex flex-wrap gap-2 pt-2">
          <button onClick={saveAsTemplate} className="wl-btn flex-1">Save as template</button>
          <div className="relative flex-1">
            <button onClick={() => setShareMenu(o => !o)} disabled={sharing} className="wl-btn w-full">
              {sharing ? "Preparing…" : "📤 Share / Export ▾"}
            </button>
            {shareMenu && !sharing && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShareMenu(false)} />
                <div className="absolute bottom-full left-0 right-0 mb-1 z-30 wl-card p-1" style={{ borderRadius: 10 }}>
                  <button onClick={() => shareSession(false)} className="w-full text-left px-3 py-2 rounded-md text-sm hover:brightness-125" style={{ color: "var(--wl-text)" }}>
                    📲 Share… <span className="wl-faint text-xs">(send to another app)</span>
                  </button>
                  <button onClick={() => shareSession(true)} className="w-full text-left px-3 py-2 rounded-md text-sm hover:brightness-125" style={{ color: "var(--wl-text)" }}>
                    ⬇ Download HTML <span className="wl-faint text-xs">(save the file)</span>
                  </button>
                </div>
              </>
            )}
          </div>
          <button onClick={removeWorkout} className="wl-btn wl-btn--danger">Delete</button>
        </div>
      </div>

      {picking && (
        <ExercisePicker
          replacing={picking.exId ? workout.exercises.find(e => e.id === picking.exId)?.name : undefined}
          onPick={c => (picking.exId ? retargetExercise(picking.exId, c) : addExercise(c))}
          onCancel={() => setPicking(null)} />
      )}
    </div>
  );
}

function ExerciseCard(props: {
  ex: LoggedExercise; unit: WeightUnit; workoutId: string;
  onRemove: () => void; onSetMode: (m: TrackingMode) => void;
  onRetarget: () => void;
  onAddSet: () => void; onRemoveSet: (setId: string) => void;
  onPatchSet: (setId: string, patch: Partial<WorkoutSet>) => void;
}) {
  const { ex, unit } = props;
  const [modeOpen, setModeOpen] = useState(false);
  // Which set's video editor is open (null = none).
  const [editor, setEditor] = useState<{ setId: string; justAdded: boolean } | null>(null);
  const editorSet = editor ? ex.sets.find(s => s.id === editor.setId) : undefined;
  const videoSets = ex.sets.filter(s => s.videoId || s.driveFileId);
  // Sets whose note field is expanded (auto-open any set that already has one).
  const [openNotes, setOpenNotes] = useState<Set<string>>(() => new Set(ex.sets.filter(s => s.note).map(s => s.id)));
  const toggleNote = (id: string) => setOpenNotes(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // Read off the NAME, the same place the picker and the progress chart read it,
  // so a re-labelled exercise picks up the right columns.
  const cols = columnsFor(ex.mode, unit, isHalverAssisted(ex.name));
  // "Keep in mind" — the last note logged for this exercise in a previous session.
  const reminder = useMemo(() => lastNoteForExercise({ skillId: ex.skillId, name: ex.name }, props.workoutId), [ex.skillId, ex.name, props.workoutId]);

  return (
    <div className="wl-card" style={{ borderRadius: 14 }}>
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid var(--wl-line)" }}>
        {/* The name is the "change exercise" control — tap it to re-label this
            entry without touching its sets, clips or notes. */}
        <button onClick={props.onRetarget} className="text-sm font-medium text-left hover:brightness-125"
          style={{ color: "var(--wl-text)" }} title="Change which exercise this is (keeps sets, videos and notes)">
          {ex.name} <span className="wl-faint" style={{ fontSize: 11 }}>✎</span>
        </button>
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

      {/* Reminder — the last note you left on this exercise, from a past session. */}
      {reminder && (
        <div className="mx-3 mt-2.5 px-3 py-2 rounded-lg flex gap-2 items-start"
          style={{ background: "color-mix(in srgb, var(--wl-accent) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--wl-accent) 30%, var(--wl-line))" }}>
          <span style={{ fontSize: 13, lineHeight: 1.3 }}>📌</span>
          <div className="min-w-0">
            <div className="wl-collabel" style={{ color: "var(--wl-accent-ink)" }}>Keep in mind · {reminder.date}</div>
            <div className="text-[13px] mt-0.5" style={{ color: "var(--wl-text)", whiteSpace: "pre-wrap" }}>{reminder.note}</div>
          </div>
        </div>
      )}

      {/* column header */}
      <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
        <span className="wl-collabel" style={{ width: "1.75rem" }}>#</span>
        {cols.map(c => <span key={c.key} title={c.title} className="wl-collabel flex-1 text-center">{c.label}</span>)}
        <span className="wl-collabel" style={{ width: "3.1rem", textAlign: "center" }}>RPE</span>
        <span style={{ width: "1.6rem" }} />
        <span className="wl-collabel flex-1 text-center">Form</span>
        <span style={{ width: "2.7rem" }} />
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
              <VideoRowButton set={s} workoutId={props.workoutId}
                onChange={sp => props.onPatchSet(s.id, sp)}
                onOpen={justAdded => setEditor({ setId: s.id, justAdded })} />
              <FormCell value={s.form} onChange={v => props.onPatchSet(s.id, { form: v })} />
              <button onClick={() => toggleNote(s.id)} className="wl-icon-btn text-xs" style={{ width: "1.2rem" }}
                title="Note for this set" aria-label="Note for this set">
                <span style={{ color: s.note ? "var(--wl-accent)" : "var(--wl-faint)" }}>🗒</span>
              </button>
              <button onClick={() => props.onRemoveSet(s.id)} className="wl-icon-btn wl-icon-btn--danger text-xs" style={{ width: "1.2rem" }}>✕</button>
            </div>
            {openNotes.has(s.id) && (
              <input value={s.note ?? ""} autoFocus={!s.note}
                onChange={e => props.onPatchSet(s.id, { note: e.target.value || undefined })}
                placeholder="Note to keep in mind next time…"
                className="wl-input mt-1.5 text-[13px]" style={{ padding: "6px 10px" }} />
            )}
          </div>
        ))}
      </div>

      <button onClick={props.onAddSet} className="w-full py-2 text-[11px] wl-mono"
        style={{ color: "var(--wl-accent)", borderTop: "1px solid var(--wl-line)" }}>+ Add set</button>

      {/* Clips for this exercise's sets, embedded small with a set-number badge. */}
      {videoSets.length > 0 && (
        <div className="flex gap-3 overflow-x-auto px-3 py-3" style={{ borderTop: "1px solid var(--wl-line)", scrollSnapType: "x mandatory" }}>
          {ex.sets.map((s, i) => (s.videoId || s.driveFileId)
            ? <VideoThumb key={s.id} set={s} index={i} />
            : null)}
        </div>
      )}

      {editor && editorSet && (
        <SetVideoEditor set={editorSet} workoutId={props.workoutId}
          onChange={sp => props.onPatchSet(editor.setId, sp)}
          onClose={() => setEditor(null)} justAdded={editor.justAdded} />
      )}
    </div>
  );
}

interface Col { key: string; label: string; title?: string; allowNeg?: boolean; get: (s: WorkoutSet) => number | undefined; set: (v: number | undefined) => Partial<WorkoutSet> }
function columnsFor(mode: TrackingMode, unit: WeightUnit, halver: boolean): Col[] {
  const cols: Col[] = [];
  if (modeShowsWeight(mode)) {
    // The Halver is the only rig that takes load in two independent places —
    // plates on its rings and weight worn at the waist — and they pull opposite
    // ways, so one signed box can't hold both. Everything else, counterweight
    // included, is a single number and gets the single ± column.
    if (halver) {
      cols.push({ key: "w", label: `rings ${unit}`, title: "Load on the Halver's rings. More = easier.", get: s => s.weight, set: v => ({ weight: v }) });
      cols.push({ key: "ww", label: `waist ${unit}`, title: "Weight worn at the waist. More = harder.", get: s => s.waistWeight, set: v => ({ waistWeight: v }) });
    } else {
      cols.push({ key: "w", label: `±${unit}`, allowNeg: true, get: s => s.weight, set: v => ({ weight: v }) });
    }
  }
  if (modeShowsReps(mode)) cols.push({ key: "r", label: "Reps", get: s => s.reps, set: v => ({ reps: v }) });
  if (modeShowsTime(mode)) cols.push({ key: "t", label: "Hold s", get: s => s.holdSec, set: v => ({ holdSec: v }) });
  return cols;
}

function RpeCell({ value, onChange }: { value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <select value={value ?? ""} onChange={e => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      className="wl-cell" style={{ width: "3.1rem", padding: "7px 2px" }}>
      <option value="">–</option>
      {[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

// Self-rated movement quality for the set: 1 (sloppy) – 5 (clean). Tap a star
// to set; tap the current rating again to clear.
function FormCell({ value, onChange }: { value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <div className="flex items-center justify-center gap-0.5 flex-1" title="Rate your form (1–5)">
      {[1, 2, 3, 4, 5].map(n => {
        const on = value != null && n <= value;
        return (
          <button key={n} onClick={() => onChange(value === n ? undefined : n)}
            className="text-[15px] leading-none" style={{ color: on ? "var(--wl-accent)" : "var(--wl-line)" }}>
            {on ? "★" : "☆"}
          </button>
        );
      })}
    </div>
  );
}
