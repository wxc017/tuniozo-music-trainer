import { useMemo, useState } from "react";
import { SKILLS, CATEGORY_LABELS, type SkillCategory } from "@/lib/calisthenicsData";
import { useWorkoutData, saveCustomExercise, deleteCustomExercise, defaultModeForSkill } from "@/lib/workoutStore";
import { TRACKING_MODES, type TrackingMode } from "@/lib/workoutTypes";

// Pick an exercise: your saved custom exercises, the calisthenics SKILLS
// catalog, or type a brand-new one (choosing how it's tracked — weight+reps,
// weight+time, reps, or time). New customs are saved for next time.

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

  const catalog = useMemo(() => {
    const byCat = new Map<SkillCategory, typeof SKILLS>();
    for (const s of SKILLS) {
      if (query && !s.name.toLowerCase().includes(query)) continue;
      const arr = byCat.get(s.category) ?? []; arr.push(s); byCat.set(s.category, arr);
    }
    return [...byCat.entries()];
  }, [query]);

  const exactMatch = customExercises.some(e => e.name.toLowerCase() === query)
    || SKILLS.some(s => s.name.toLowerCase() === query);

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
        style={{ borderRadius: undefined }}
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
          {/* Create new custom → choose tracking mode */}
          {q.trim() && !exactMatch && (
            <div className="px-3 py-3" style={{ borderBottom: "1px solid var(--wl-line)" }}>
              {creating == null ? (
                <button onClick={() => setCreating(q.trim())}
                  className="flex items-center gap-2 text-sm" style={{ color: "var(--wl-text)" }}>
                  <span style={{ color: "var(--wl-accent)", fontSize: 18, lineHeight: 1 }}>＋</span>
                  Add <b>“{q.trim()}”</b> <span className="wl-faint">— new exercise</span>
                </button>
              ) : (
                <div>
                  <div className="wl-collabel mb-2">How is “{creating}” tracked?</div>
                  <div className="grid grid-cols-2 gap-2">
                    {TRACKING_MODES.map(m => (
                      <button key={m.id} onClick={() => confirmCreate(m.id)}
                        className="wl-btn" style={{ padding: "10px 8px", textAlign: "center" }}>
                        <div style={{ color: "var(--wl-text)", fontWeight: 600 }}>{m.label}</div>
                        <div className="wl-mono" style={{ fontSize: 10, color: "var(--wl-faint)" }}>{m.short}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Saved custom exercises */}
          {customs.length > 0 && (
            <Group label="Your exercises">
              {customs.map(e => (
                <Row key={e.id}
                  name={e.name}
                  right={<span className="wl-mono" style={{ fontSize: 10, color: "var(--wl-faint)" }}>
                    {TRACKING_MODES.find(m => m.id === e.mode)?.short}
                  </span>}
                  onDelete={() => deleteCustomExercise(e.id)}
                  onClick={() => onPick({ name: e.name, mode: e.mode })} />
              ))}
            </Group>
          )}

          {/* Catalog */}
          {catalog.map(([cat, skills]) => (
            <Group key={cat} label={CATEGORY_LABELS[cat]}>
              {skills.map(s => (
                <Row key={s.id}
                  name={s.name}
                  right={s.rating ? <span className="wl-mono" style={{ fontSize: 10, color: "var(--wl-faint)" }}>{s.rating}</span> : null}
                  onClick={() => onPick({ name: s.name, skillId: s.id, mode: defaultModeForSkill(s.id) })} />
              ))}
            </Group>
          ))}

          {catalog.length === 0 && customs.length === 0 && !q.trim() && (
            <div className="p-4 text-sm wl-faint">Search the catalog, or type any exercise name.</div>
          )}
        </div>

        <button onClick={onCancel} className="flex-shrink-0 p-3 text-sm wl-muted"
          style={{ borderTop: "1px solid var(--wl-line)" }}>Cancel</button>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="wl-collabel sticky top-0 px-4 py-1.5" style={{ background: "var(--wl-surface-2)", borderBottom: "1px solid var(--wl-line)" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({ name, right, onClick, onDelete }: { name: string; right?: React.ReactNode; onClick: () => void; onDelete?: () => void }) {
  return (
    <div className="w-full flex items-center gap-2 px-4 py-2.5 hover:brightness-125" style={{ borderBottom: "1px solid color-mix(in srgb, var(--wl-line) 50%, transparent)" }}>
      <button onClick={onClick} className="flex-1 text-left flex items-center gap-2">
        <span className="text-sm" style={{ color: "var(--wl-text)" }}>{name}</span>
        {right && <span className="ml-auto">{right}</span>}
      </button>
      {onDelete && (
        <button onClick={onDelete} className="wl-icon-btn wl-icon-btn--danger text-xs" title="Remove saved exercise">✕</button>
      )}
    </div>
  );
}
