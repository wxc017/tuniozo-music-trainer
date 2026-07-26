import { useEffect, useRef, useState } from "react";
import "./workout/workout.css";
import SessionLogger from "./workout/SessionLogger";
import WorkoutHistory from "./workout/WorkoutHistory";
import TemplatesView from "./workout/TemplatesView";
import FloatingRestTimer from "./workout/FloatingRestTimer";
import { useWorkoutData, startWorkout, seedExercisesOnce } from "@/lib/workoutStore";
import { registerRestSW } from "@/lib/restNotify";
import { exportBackup, importBackupFromFile } from "@/lib/workoutBackup";
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
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => { seedExercisesOnce(); void registerRestSW(); }, []);

  const doExport = async () => {
    setExporting(true);
    try {
      const { shared, videoCount } = await exportBackup();
      if (!shared) window.alert(`Backup saved to your downloads (${videoCount} video${videoCount === 1 ? "" : "s"}). Move it to your backup folder.`);
    } catch (err) {
      window.alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  };

  const doImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const r = await importBackupFromFile(file);
      window.alert(`Imported: ${r.workouts} workouts, ${r.exercises} exercises, ${r.templates} templates, ${r.videos} videos.`);
    } catch (err) {
      window.alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  };

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

          {/* Persistent footer: back up / restore the whole log (data + videos). */}
          <div className="flex-shrink-0 p-3 flex gap-2" style={{ borderTop: "1px solid var(--wl-line)" }}>
            <input ref={importRef} type="file" accept=".zip,application/zip" className="hidden" onChange={doImport} />
            <button onClick={doExport} disabled={exporting || importing} className="wl-btn flex-1">
              {exporting ? "Preparing…" : "⤓ Export backup"}
            </button>
            <button onClick={() => importRef.current?.click()} disabled={exporting || importing} className="wl-btn flex-1">
              {importing ? "Importing…" : "⤒ Import backup"}
            </button>
          </div>
        </div>
      )}
      {/* Floating rest timer — persists across views, above the video popup. */}
      <FloatingRestTimer />
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
  const inProgress = !w.endedAt;
  return (
    <button onClick={() => onOpen(w.id)} className="wl-card wl-card--hover w-full text-left p-3.5">
      <div className="flex items-center gap-2">
        <span className="wl-h2" style={{ fontSize: 15 }}>{w.title || "Workout"}</span>
        {inProgress && <span className="wl-tag" style={{ color: "var(--wl-warn)", background: "color-mix(in srgb, var(--wl-warn) 14%, transparent)", borderColor: "color-mix(in srgb, var(--wl-warn) 30%, transparent)" }}>live</span>}
        <span className="wl-count">{w.date}</span>
      </div>
      <div className="text-[12px] wl-muted mt-1.5 truncate">{w.exercises.map(e => e.name).join(" · ") || "empty"}</div>
      <div className="wl-mono text-[10px] wl-faint mt-1.5">
        {w.exercises.length} exercises · {sets} sets{clips ? ` · ${clips} 🎬` : ""}
      </div>
    </button>
  );
}
