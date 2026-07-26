import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useWorkoutData, exerciseHistory, loggedExerciseIndex, exerciseClips, isCwAssisted } from "@/lib/workoutStore";
import { getVideoUrl } from "@/lib/workoutVideoDb";
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
  const assisted = isCwAssisted(active?.name ?? "");
  const data = useMemo(() => {
    if (!active) return [];
    return exerciseHistory({ skillId: active.skillId, name: active.name }).map(p => ({
      date: p.date.slice(5),
      bestRpe: p.bestRpe ?? null,
      // CW-assisted: track the LEAST assistance that day (best set), toward 0.
      topWeight: (assisted ? p.minWeight : p.topWeight) ?? null,
      volume: p.totalReps || Math.round(p.totalHoldSec) || null,
    }));
  }, [active, assisted]);

  if (index.length === 0) {
    return <div className="text-sm wl-faint text-center py-8">Log some sets to see progress charts.</div>;
  }

  // For CW-assisted weight, less counterweight = more progress, so reverse the
  // axis (0 at the top) and label it accordingly.
  const reverseY = metric === "topWeight" && assisted;
  const metricLabel = metric === "bestRpe" ? "Best RPE"
    : metric === "volume" ? "Volume (reps / hold s)"
    : assisted ? "Counterweight (0 = unassisted — higher is better)" : "Top load";

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
              {m === "topWeight" ? (assisted ? "Assist" : "Load") : m === "bestRpe" ? "RPE" : "Vol"}
            </button>
          ))}
        </div>
      </div>
      <div className="text-[11px] wl-muted mb-2">{active?.name} — {metricLabel}</div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid stroke="#2a2c36" />
          <XAxis dataKey="date" tick={{ fill: "#6b6e7a", fontSize: 10 }} stroke="#2a2c36" />
          <YAxis tick={{ fill: "#6b6e7a", fontSize: 10 }} stroke="#2a2c36"
            reversed={reverseY}
            domain={metric === "bestRpe" ? [5, 10] : reverseY ? [0, "auto"] : ["auto", "auto"]} />
          <Tooltip contentStyle={{ background: "#16171d", border: "1px solid #2a2c36", borderRadius: 10, fontSize: 12 }} labelStyle={{ color: ACCENT }} />
          <Line type="monotone" dataKey={metric} stroke={ACCENT} strokeWidth={2} dot={{ r: 3, fill: ACCENT }} connectNulls />
        </LineChart>
      </ResponsiveContainer>

      {active && <FormTimeline match={{ skillId: active.skillId, name: active.name }} />}
    </div>
  );
}

// Embedded form clips for the selected exercise, oldest → newest, so you can
// watch how your form has changed over time.
function FormTimeline({ match }: { match: { skillId?: string; name: string } }) {
  const { workouts } = useWorkoutData();
  const clips = useMemo(() => exerciseClips(match), [match.skillId, match.name, workouts]);
  const [urls, setUrls] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let alive = true;
    Promise.all(clips.map(c => getVideoUrl(c.videoId).then(u => [c.videoId, u] as const)))
      .then(pairs => { if (alive) setUrls(Object.fromEntries(pairs)); });
    return () => { alive = false; };
  }, [clips]);

  if (clips.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="wl-eyebrow mb-2">Form over time · {clips.length} clip{clips.length === 1 ? "" : "s"}</div>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollSnapType: "x mandatory" }}>
        {clips.map(c => (
          <div key={c.videoId} className="flex-shrink-0" style={{ width: 170, scrollSnapAlign: "start" }}>
            {urls[c.videoId] ? (
              <video src={urls[c.videoId]!} controls playsInline preload="metadata"
                className="rounded bg-black w-full" style={{ maxHeight: 260 }} />
            ) : (
              <div className="rounded bg-black w-full flex items-center justify-center" style={{ height: 120, color: "var(--wl-faint)", fontSize: 11 }}>loading…</div>
            )}
            <div className="wl-mono mt-1" style={{ fontSize: 11, color: "var(--wl-faint)" }}>{c.date}</div>
          </div>
        ))}
      </div>
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
