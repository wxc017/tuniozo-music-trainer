import { useEffect, useState } from "react";
import "./workout/workout.css";
import SessionLogger from "./workout/SessionLogger";
import WorkoutHistory from "./workout/WorkoutHistory";
import ProgressView from "./workout/ProgressView";
import TemplatesView from "./workout/TemplatesView";
import WeekVolume from "./workout/WeekVolume";
import UndoBar from "./workout/UndoBar";
import { useWorkoutData, startWorkout, pruneStoredBuiltins, wipeWorkoutData } from "@/lib/workoutStore";
import { registerRestSW } from "@/lib/restNotify";
import { initDriveDataSync } from "@/lib/workoutDrive";
import { initTokenAutoRefresh } from "@/lib/googleDrive";
import { pruneVideos } from "@/lib/workoutVideoDb";
import {
  backupWorkoutsToDrive, restoreWorkoutsFromDrive, listWorkoutBackups,
  KEEP_BACKUPS, type DriveBackup,
} from "@/lib/workoutDriveBackup";
import { localToday } from "@/lib/storage";
import type { Workout } from "@/lib/workoutTypes";

// ─────────────────────────────────────────────────────────────────────────
// Workout Log — top-level section. Today / Calendar / Templates. The log
// rides the app's existing cross-device sync (Google Drive + desktop folder),
// so a session logged on the phone shows here on the computer with no extra
// step. Videos are the exception — large, in IndexedDB, moved by an explicit
// export (share sheet / download), added next.
// ─────────────────────────────────────────────────────────────────────────

type View = "today" | "week" | "calendar" | "progress" | "templates";

export default function WorkoutLog() {
  const { workouts } = useWorkoutData();
  const [view, setView] = useState<View>("today");
  const [openId, setOpenId] = useState<string | null>(null);

  // Drive connect + backup/restore/export/import all live in Settings now.
  // This just keeps the auto data-sync running while the log is open.
  useEffect(() => { pruneStoredBuiltins(); void registerRestSW(); initDriveDataSync(); initTokenAutoRefresh(); }, []);

  // Wipe every workout record on THIS device (double-confirmed — it's destructive).
  // Built-in exercises come back on their own; Drive is untouched.
  const wipeAll = () => {
    if (!window.confirm("Wipe ALL workout data on this device? Log, templates, and your custom exercises will be deleted. This can't be undone (Drive backups are not affected).")) return;
    if (!window.confirm("Really wipe everything? Last chance.")) return;
    wipeWorkoutData();
    void pruneVideos(new Set()).catch(() => {});   // keep none = delete every clip
    setOpenId(null);
    setView("today");
  };

  // Workout-only backup/restore straight to Google Drive (log + templates +
  // exercises + video clips) — a single file in a "Tunizo Workouts" folder,
  // WITHOUT the whole-app data sync.
  const [ioBusy, setIoBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const doExport = async () => {
    setIoBusy(true);
    try {
      const r = await backupWorkoutsToDrive();
      const pruneNote = r.pruned ? ` Oldest ${r.pruned === 1 ? "backup" : `${r.pruned} backups`} dropped.` : "";
      window.alert(
        `Backed up to Google Drive — ${r.videoCount} clip${r.videoCount === 1 ? "" : "s"}, ${(r.bytes / 1e6).toFixed(1)} MB.\n\n` +
        `Keeping the last ${r.kept} backup${r.kept === 1 ? "" : "s"}.${pruneNote}`,
      );
    } catch (e) { window.alert(`Backup failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setIoBusy(false); }
  };
  // Restore always goes through the picker now — with a rolling set of backups,
  // silently taking the newest is exactly the wrong default when the newest is
  // the one you just messed up.
  const doRestore = async (b: DriveBackup) => {
    setPicking(false);
    setIoBusy(true);
    try {
      const r = await restoreWorkoutsFromDrive(b.id);
      if (!r.found) { window.alert("That backup is no longer on your Drive — it may have been deleted from another device."); return; }
      const x = r.result!;
      window.alert(`Restored from Drive — ${x.workouts} workouts, ${x.templates} templates, ${x.exercises} exercises, ${x.videos} videos.`);
    } catch (e) { window.alert(`Restore failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setIoBusy(false); }
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
              {(["today", "week", "calendar", "progress", "templates"] as View[]).map(v => (
                <button key={v} data-on={view === v} onClick={() => setView(v)}>{v}</button>
              ))}
            </div>
            <button onClick={wipeAll} title="Wipe all workout data on this device (Drive is untouched)"
              className="wl-icon-btn text-sm" style={{ color: "var(--wl-faint)" }} aria-label="Wipe all workout data">🗑</button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 p-4">
            {view === "week" && <WeekVolume />}
            {view === "today" && <TodayView workouts={workouts} onOpen={setOpenId} />}
            {view === "calendar" && <WorkoutHistory onOpenWorkout={setOpenId} />}
            {view === "progress" && <ProgressView />}
            {view === "templates" && <TemplatesView onStart={setOpenId} />}
          </div>

          {/* Workout-only backup/restore to Google Drive — no whole-app sync needed. */}
          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5" style={{ borderTop: "1px solid var(--wl-line)" }}>
            <button onClick={doExport} disabled={ioBusy} className="wl-btn flex-1"
              title={`Back up all workouts + video clips to your Google Drive (keeps the last ${KEEP_BACKUPS})`}>
              {ioBusy ? "…" : "⬆ Back up to Drive"}
            </button>
            <button onClick={() => setPicking(true)} disabled={ioBusy} className="wl-btn flex-1"
              title="Pick which Drive backup to restore (merges, safe to re-run)">
              ⬇ Restore from Drive
            </button>
          </div>
          {picking && <RestorePicker onPick={doRestore} onClose={() => setPicking(false)} />}
        </div>
      )}
      {/* Floating overlays — persist across views, above the video popup. */}
      <UndoBar />
    </>
  );
}

// ── Restore picker ────────────────────────────────────────────────────────
// Lists the rolling backup set OLDEST FIRST, numbered the way the rotation
// works: slot 1 is the next to be dropped, the last row is the newest. Showing
// the age matters more than the filename — "which one was before I broke it"
// is the actual question being answered here.

function RestorePicker({ onPick, onClose }: { onPick: (b: DriveBackup) => void; onClose: () => void }) {
  const [backups, setBackups] = useState<DriveBackup[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    listWorkoutBackups()
      .then(b => { if (alive) setBackups(b); })
      .catch(e => { if (alive) { setErr(e instanceof Error ? e.message : String(e)); setBackups([]); } });
    return () => { alive = false; };
  }, []);

  const confirmPick = (b: DriveBackup, isNewest: boolean) => {
    const which = isNewest ? "the newest backup" : `a backup from ${relTime(b.when)}`;
    if (!window.confirm(`Restore ${which}?\n\nIt MERGES into what's already on this device by id — it won't delete anything you've logged since.`)) return;
    onPick(b);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-3" style={{ background: "rgba(0,0,0,.72)" }}>
      <div className="wl-card w-full" style={{ maxWidth: 460, padding: 0, overflow: "hidden" }}>
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--wl-line)" }}>
          <div>
            <div className="wl-eyebrow">Restore</div>
            <div className="wl-h2" style={{ fontSize: 15 }}>Pick a backup</div>
          </div>
          <button onClick={onClose} className="wl-btn ml-auto">Cancel</button>
        </div>

        <div className="p-3 space-y-2" style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {backups === null && <div className="text-sm wl-muted text-center py-6">Loading backups…</div>}

          {backups?.length === 0 && (
            <div className="text-sm wl-muted text-center py-6 leading-relaxed">
              {err
                ? <>Couldn't read your Drive backups.<br /><span className="wl-mono text-[11px] wl-faint">{err}</span></>
                : <>No backups on your Drive yet.<br />Hit <b style={{ color: "var(--wl-accent-ink)" }}>Back up to Drive</b> first.</>}
            </div>
          )}

          {backups?.map((b, i) => {
            const isNewest = i === backups.length - 1;
            return (
              <button key={b.id} onClick={() => confirmPick(b, isNewest)}
                className="wl-card wl-card--hover w-full text-left p-3">
                <div className="flex items-center gap-2">
                  <span className="wl-num w-6 h-6 rounded-full text-[11px] flex items-center justify-center flex-shrink-0"
                    style={{ border: "1px solid var(--wl-line)", background: "var(--wl-surface-2)", color: "var(--wl-accent)" }}>
                    {i + 1}
                  </span>
                  <span className="wl-h2" style={{ fontSize: 14 }}>{b.when.toLocaleString()}</span>
                  {isNewest && <span className="wl-tag ml-auto">newest</span>}
                  {i === 0 && backups.length >= KEEP_BACKUPS && !isNewest && <span className="wl-tag ml-auto">drops next</span>}
                </div>
                <div className="wl-mono text-[10px] wl-faint mt-1.5">
                  {relTime(b.when)} · {(b.bytes / 1e6).toFixed(1)} MB{b.legacy ? " · pre-rotation backup" : ""}
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-4 py-2.5 wl-mono text-[10px] wl-faint" style={{ borderTop: "1px solid var(--wl-line)" }}>
          Keeping the last {KEEP_BACKUPS}. Each backup adds a new one and drops the oldest.
        </div>
      </div>
    </div>
  );
}

/** "3 days ago" / "just now" — the useful axis when picking a restore point. */
function relTime(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
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
  const clips = w.exercises.reduce((n, e) => n + e.sets.filter(s => s.videoId || s.driveFileId).length, 0);
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
