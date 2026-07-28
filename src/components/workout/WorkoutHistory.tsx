import { useMemo, useState } from "react";
import { useWorkoutData, getPrefs } from "@/lib/workoutStore";
import type { Workout, WorkoutSet } from "@/lib/workoutTypes";

// Calendar — the "computer" view over the same synced log. Tap a day to see its
// workout inline (read-only, no video); an Edit button opens the live logger.

interface Props { onOpenWorkout: (id: string) => void }

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ACCENT = "#d7ac52";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const setsOn = (list: Workout[] | undefined): number =>
  list ? list.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0), 0) : 0;

export default function WorkoutHistory({ onOpenWorkout }: Props) {
  const { workouts } = useWorkoutData();
  const [cursor, setCursor] = useState(() => new Date());
  const [selDate, setSelDate] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const m = new Map<string, Workout[]>();
    for (const w of workouts) { const a = m.get(w.date) ?? []; a.push(w); m.set(w.date, a); }
    return m;
  }, [workouts]);

  const grid = useMemo(() => buildMonth(cursor), [cursor]);
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const selWorkouts = selDate ? byDate.get(selDate) ?? [] : [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Calendar — sets per day */}
      <div className="wl-card p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setCursor(shiftMonth(cursor, -1))} className="wl-icon-btn px-2 py-1">‹</button>
          <div className="wl-h2">{monthLabel}</div>
          <button onClick={() => setCursor(shiftMonth(cursor, 1))} className="wl-icon-btn px-2 py-1">›</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {DOW.map(d => <div key={d} className="wl-collabel py-1">{d}</div>)}
          {grid.map((cell, i) => {
            if (!cell) return <div key={i} />;
            const key = ymd(cell);
            const list = byDate.get(key);
            const sets = setsOn(list);
            const isToday = key === ymd(new Date());
            const sel = key === selDate;
            return (
              <button key={i} onClick={() => setSelDate(sel ? null : key)}
                className="aspect-square rounded-lg text-xs flex flex-col items-center justify-center wl-num transition-colors"
                style={{
                  border: `1px solid ${sel ? ACCENT : list ? "var(--wl-line)" : "transparent"}`,
                  background: sel ? "color-mix(in srgb, var(--wl-accent) 16%, transparent)" : list ? "var(--wl-surface-2)" : "transparent",
                  boxShadow: isToday ? `inset 0 0 0 1px color-mix(in srgb, ${ACCENT} 50%, transparent)` : undefined,
                }}>
                <span style={{ color: list ? "var(--wl-text)" : "var(--wl-faint)", fontWeight: list ? 600 : 400 }}>{cell.getDate()}</span>
                {sets > 0 && <span style={{ fontSize: 9, lineHeight: 1, color: ACCENT, fontWeight: 700, marginTop: 2 }}>{sets} {sets === 1 ? "set" : "sets"}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected-day workout, shown inline (read-only, no videos) */}
      {selDate && (
        <div className="space-y-3">
          <div className="wl-eyebrow">{selDate} · {setsOn(selWorkouts)} sets</div>
          {selWorkouts.length === 0 && <div className="text-sm wl-faint">No workout logged.</div>}
          {selWorkouts.map(w => <DaySession key={w.id} w={w} onEdit={() => onOpenWorkout(w.id)} />)}
        </div>
      )}
    </div>
  );
}

function DaySession({ w, onEdit }: { w: Workout; onEdit: () => void }) {
  const unit = getPrefs().unit;
  return (
    <div className="wl-card">
      <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ borderBottom: "1px solid var(--wl-line)" }}>
        <span className="wl-h2" style={{ fontSize: 15 }}>{w.title || "Workout"}</span>
        <span className="wl-count">{w.exercises.length} ex · {w.exercises.reduce((n, e) => n + e.sets.length, 0)} sets</span>
        <button onClick={onEdit} className="wl-btn ml-auto" style={{ padding: "5px 12px", fontSize: 12 }}>Edit ›</button>
      </div>
      <div className="px-3.5 py-2.5 space-y-3">
        {w.exercises.length === 0 && <div className="text-sm wl-faint">No exercises.</div>}
        {w.exercises.map(ex => (
          <div key={ex.id}>
            <div className="text-sm font-medium mb-1" style={{ color: "var(--wl-text)" }}>{ex.name}</div>
            <div className="space-y-0.5">
              {ex.sets.map((s, i) => (
                <div key={s.id} className="flex items-baseline gap-2 wl-mono" style={{ fontSize: 12 }}>
                  <span style={{ color: "var(--wl-faint)", minWidth: "1.4rem" }}>{i + 1}</span>
                  <span style={{ color: "var(--wl-text)" }}>{setBrief(s, unit)}</span>
                  {s.form != null && <span style={{ marginLeft: "auto", color: "var(--wl-accent)", letterSpacing: 1 }}>{stars(s.form)}</span>}
                  {(s.videoId || s.driveFileId) && <span style={{ color: "var(--wl-accent-ink)" }}>🎬</span>}
                </div>
              ))}
            </div>
            {ex.sets.some(s => s.note) && (
              <div className="mt-1 space-y-0.5">
                {ex.sets.filter(s => s.note).map(s => (
                  <div key={s.id} className="text-[12px]" style={{ color: "var(--wl-muted)", fontStyle: "italic" }}>“{s.note}”</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function stars(n: number): string { return [1, 2, 3, 4, 5].map(x => x <= n ? "★" : "☆").join(""); }

function setBrief(s: WorkoutSet, unit: string): string {
  const parts: string[] = [];
  if (s.weight != null && s.weight !== 0) parts.push(`${s.weight > 0 ? "+" : ""}${s.weight}${unit}`);
  if (s.reps != null) parts.push(`${s.reps} reps`);
  if (s.holdSec != null) parts.push(`${s.holdSec}s`);
  if (s.rpe != null) parts.push(`RPE ${s.rpe}`);
  return parts.join(" · ") || "—";
}

function shiftMonth(d: Date, delta: number): Date { return new Date(d.getFullYear(), d.getMonth() + delta, 1); }
function buildMonth(cursor: Date): (Date | null)[] {
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
