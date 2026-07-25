import { useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useWorkoutData, exerciseHistory, loggedExerciseIndex } from "@/lib/workoutStore";
import type { Workout } from "@/lib/workoutTypes";

// Calendar + progress charts — the "computer" view over the same synced log.

interface Props { onOpenWorkout: (id: string) => void }

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ACCENT = "#d7ac52";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
      {/* Calendar */}
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
                {list && <span style={{ width: 5, height: 5, borderRadius: 9, background: ACCENT, marginTop: 2 }} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected-day sessions */}
      {selDate && (
        <div className="space-y-2">
          <div className="wl-eyebrow">{selDate}</div>
          {selWorkouts.length === 0 && <div className="text-sm wl-faint">No workout logged.</div>}
          {selWorkouts.map(w => (
            <button key={w.id} onClick={() => onOpenWorkout(w.id)} className="wl-card wl-card--hover w-full text-left p-3.5">
              <div className="flex items-center gap-2">
                <span className="wl-h2" style={{ fontSize: 15 }}>{w.title || "Workout"}</span>
                <span className="wl-count">{w.exercises.length} ex · {w.exercises.reduce((n, e) => n + e.sets.length, 0)} sets</span>
              </div>
              <div className="text-[12px] wl-muted mt-1.5 truncate">{w.exercises.map(e => e.name).join(" · ") || "empty"}</div>
            </button>
          ))}
        </div>
      )}

      <ProgressChart />
    </div>
  );
}

function ProgressChart() {
  const { workouts } = useWorkoutData();
  const index = useMemo(() => loggedExerciseIndex(), [workouts]);
  const [sel, setSel] = useState<string>("");
  const [metric, setMetric] = useState<"bestRpe" | "topWeight" | "volume">("topWeight");

  const active = index.find(e => e.key === sel) ?? index[0];
  const data = useMemo(() => {
    if (!active) return [];
    return exerciseHistory({ skillId: active.skillId, name: active.name }).map(p => ({
      date: p.date.slice(5),
      bestRpe: p.bestRpe ?? null,
      topWeight: p.topWeight ?? null,
      volume: p.totalReps || Math.round(p.totalHoldSec) || null,
    }));
  }, [active]);

  if (index.length === 0) {
    return <div className="text-sm wl-faint text-center py-8">Log some sets to see progress charts.</div>;
  }

  const metricLabel = { bestRpe: "Best RPE", topWeight: "Top load", volume: "Volume (reps / hold s)" }[metric];

  return (
    <div className="wl-card p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="wl-eyebrow">Progress</span>
        <select value={active?.key ?? ""} onChange={e => setSel(e.target.value)}
          className="wl-input wl-mono" style={{ width: "auto", padding: "5px 8px", fontSize: 12 }}>
          {index.map(e => <option key={e.key} value={e.key}>{e.name}</option>)}
        </select>
        <div className="wl-seg ml-auto">
          {(["topWeight", "bestRpe", "volume"] as const).map(m => (
            <button key={m} data-on={metric === m} onClick={() => setMetric(m)}>
              {m === "topWeight" ? "Load" : m === "bestRpe" ? "RPE" : "Vol"}
            </button>
          ))}
        </div>
      </div>
      <div className="text-[11px] wl-muted mb-2">{active?.name} — {metricLabel}</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid stroke="#2a2c36" />
          <XAxis dataKey="date" tick={{ fill: "#6b6e7a", fontSize: 10 }} stroke="#2a2c36" />
          <YAxis tick={{ fill: "#6b6e7a", fontSize: 10 }} stroke="#2a2c36" domain={metric === "bestRpe" ? [5, 10] : ["auto", "auto"]} />
          <Tooltip contentStyle={{ background: "#16171d", border: "1px solid #2a2c36", borderRadius: 10, fontSize: 12 }} labelStyle={{ color: ACCENT }} />
          <Line type="monotone" dataKey={metric} stroke={ACCENT} strokeWidth={2} dot={{ r: 3, fill: ACCENT }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
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
