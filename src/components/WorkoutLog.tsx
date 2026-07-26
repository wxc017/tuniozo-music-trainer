import { useEffect, useState } from "react";
import "./workout/workout.css";
import SessionLogger from "./workout/SessionLogger";
import WorkoutHistory from "./workout/WorkoutHistory";
import TemplatesView from "./workout/TemplatesView";
import FloatingRestTimer from "./workout/FloatingRestTimer";
import UndoBar from "./workout/UndoBar";
import { useWorkoutData, startWorkout, seedExercisesOnce } from "@/lib/workoutStore";
import { registerRestSW } from "@/lib/restNotify";
import { initDriveDataSync } from "@/lib/workoutDrive";
import { localToday } from "@/lib/storage";
import type { Workout } from "@/lib/workoutTypes";

// ─────────────────────────────────────────────────────────────────────────
// Workout Log — top-level section. Today / Calendar / Templates. The log
// rides the app's existing cross-device sync (Google Drive + desktop folder),
// so a session logged on the phone shows here on the computer with no extra
// step. Videos are the exception — large, in IndexedDB, moved by an explicit
// export (share sheet / download), added next.
// ─────────────────────────────────────────────────────────────────────────

type View = "today" | "calendar" | "templates";

export default function WorkoutLog() {
  const { workouts } = useWorkoutData();
  const [view, setView] = useState<View>("today");
  const [openId, setOpenId] = useState<string | null>(null);

  // Drive connect + backup/restore/export/import all live in Settings now.
  // This just keeps the auto data-sync running while the log is open.
  useEffect(() => { seedExercisesOnce(); void registerRestSW(); initDriveDataSync(); }, []);

  return (
    <>
      {openId ? (
        <SessionLogger workoutId={openId} onClose={() => setOpenId(null)} />
      ) : (
        <div className="wl-root flex flex-col h-full">
          <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--wl-line)" }}>
            <div>
              <div className="wl-eyebrow">Training</div>
              <div className="wl-h1">Workout Log</div>
            </div>
            <div className="wl-seg ml-auto">
              {(["today", "calendar", "templates"] as View[]).map(v => (
                <button key={v} data-on={view === v} onClick={() => setView(v)}>{v}</button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 p-4">
            {view === "today" && <TodayView workouts={workouts} onOpen={setOpenId} />}
            {view === "calendar" && <WorkoutHistory onOpenWorkout={setOpenId} />}
            {view === "templates" && <TemplatesView onStart={setOpenId} />}
          </div>
        </div>
      )}
      {/* Floating overlays — persist across views, above the video popup. */}
      <FloatingRestTimer />
      <UndoBar />
    </>
  );
}

function TodayView({ workouts, onOpen }: { workouts: Workout[]; onOpen: (id: string) => void }) {
  const today = localToday();
  const todays = workouts.filter(w => w.date === today);
  const recent = workouts.filter(w => w.date !== today).slice(0, 8);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <button onClick={() => onOpen(startWorkout().id)} className="wl-btn wl-btn--primary w-full"
        style={{ padding: "16px", fontSize: 15, borderRadius: 16 }}>
        + Start workout
      </button>

      {todays.length > 0 && (
        <Section eyebrow="Today" count={`${todays.length}`}>
          {todays.map(w => <WorkoutRow key={w.id} w={w} onOpen={onOpen} />)}
        </Section>
      )}

      {recent.length > 0 && (
        <Section eyebrow="Recent" count={`${recent.length}`}>
          {recent.map(w => <WorkoutRow key={w.id} w={w} onOpen={onOpen} />)}
        </Section>
      )}

      {workouts.length === 0 && (
        <div className="text-sm wl-muted text-center py-10 leading-relaxed">
          No workouts yet. Hit <b style={{ color: "var(--wl-accent-ink)" }}>Start workout</b> to log your first session,
          <br />or build a reusable one under <b style={{ color: "var(--wl-accent-ink)" }}>Templates</b>.
        </div>
      )}
    </div>
  );
}

function Section({ eyebrow, count, children }: { eyebrow: string; count?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="wl-sechead">
        <span className="wl-eyebrow">{eyebrow}</span>
        {count && <span className="wl-count">{count}</span>}
      </div>
      {children}
    </div>
  );
}

function WorkoutRow({ w, onOpen }: { w: Workout; onOpen: (id: string) => void }) {
  const sets = w.exercises.reduce((n, e) => n + e.sets.length, 0);
  const clips = w.exercises.reduce((n, e) => n + e.sets.filter(s => s.videoId).length, 0);
  return (
    <button onClick={() => onOpen(w.id)} className="wl-card wl-card--hover w-full text-left p-3.5">
      <div className="flex items-center gap-2">
        <span className="wl-h2" style={{ fontSize: 15 }}>{w.title || "Workout"}</span>
        <span className="wl-count">{w.date}</span>
      </div>
      <div className="text-[12px] wl-muted mt-1.5 truncate">{w.exercises.map(e => e.name).join(" · ") || "empty"}</div>
      <div className="wl-mono text-[10px] wl-faint mt-1.5">
        {w.exercises.length} exercises · {sets} sets{clips ? ` · ${clips} 🎬` : ""}
      </div>
    </button>
  );
}
