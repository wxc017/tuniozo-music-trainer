import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useWorkoutData, exerciseHistory, loggedExerciseIndex, exerciseClips, isCwAssisted } from "@/lib/workoutStore";
import { resolveClipUrl } from "@/lib/workoutDrive";
import { TrimmedVideo } from "./SetVideo";

// Progress — its own tab. Pick any exercise you've logged and see its load /
// RPE / volume trend, plus a "form over time" strip of its clips.

const ACCENT = "#d7ac52";

export default function ProgressView() {
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
      topWeight: (assisted ? p.minWeight : p.topWeight) ?? null,
      volume: p.totalReps || Math.round(p.totalHoldSec) || null,
    }));
  }, [active, assisted]);

  if (index.length === 0) {
    return <div className="max-w-3xl mx-auto text-sm wl-faint text-center py-10">Log some sets to see progress charts.</div>;
  }

  const reverseY = metric === "topWeight" && assisted;
  const metricLabel = metric === "bestRpe" ? "Best RPE"
    : metric === "volume" ? "Volume (reps / hold s)"
    : assisted ? "Counterweight (0 = unassisted — higher is better)" : "Top load";

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="wl-card p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="wl-eyebrow">Progress</span>
          <select value={active?.key ?? ""} onChange={e => setSel(e.target.value)}
            className="wl-input wl-mono" style={{ width: "auto", padding: "5px 8px", fontSize: 12 }}>
            {index.map(e => <option key={e.key} value={e.key}>{e.name} · {e.count}</option>)}
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
            <Line type="monotone" dataKey={metric}
              name={metric === "bestRpe" ? "Best RPE" : metric === "volume" ? "Volume" : assisted ? "Counterweight" : "Top load"}
              stroke={ACCENT} strokeWidth={2} dot={{ r: 3, fill: ACCENT }} connectNulls />
          </LineChart>
        </ResponsiveContainer>

        {active && <FormTimeline match={{ skillId: active.skillId, name: active.name }} />}
      </div>
    </div>
  );
}

type Phase = "idle" | "loading" | "ready" | "failed";
type ClipState = { phase: Phase; url?: string | null; error?: string };

// Form strip. LOCAL clips load instantly; DRIVE clips (a full-blob download
// that can take a while on mobile) load on tap — so nothing false-fails on a
// short timeout and one big download never blocks the rest. A failed load
// offers Retry.
function FormTimeline({ match }: { match: { skillId?: string; name: string } }) {
  const { workouts } = useWorkoutData();
  const clips = useMemo(() => exerciseClips(match), [match.skillId, match.name, workouts]);
  const [state, setState] = useState<Record<string, ClipState>>({});

  const load = (c: { videoId?: string; driveFileId?: string; setId: string }) => {
    const key = clipKey(c);
    setState(s => ({ ...s, [key]: { phase: "loading" } }));
    resolveClipUrl({ videoId: c.videoId, driveFileId: c.driveFileId })
      .then(r => setState(s => ({ ...s, [key]: "url" in r ? { phase: "ready", url: r.url } : { phase: "failed", error: r.error } })))
      .catch(err => setState(s => ({ ...s, [key]: { phase: "failed", error: err instanceof Error ? err.message : String(err) } })));
  };

  // Auto-load every clip (local + Drive). Cached URLs mean repeat views don't
  // re-download, so there's no reason to make the user tap "load".
  useEffect(() => {
    let alive = true;
    setState({});
    for (const c of clips) {
      const key = clipKey(c);
      resolveClipUrl({ videoId: c.videoId, driveFileId: c.driveFileId })
        .then(r => { if (alive) setState(s => ({ ...s, [key]: "url" in r ? { phase: "ready", url: r.url } : { phase: "failed", error: r.error } })); })
        .catch(err => { if (alive) setState(s => ({ ...s, [key]: { phase: "failed", error: err instanceof Error ? err.message : String(err) } })); });
    }
    return () => { alive = false; };
  }, [clips]);

  if (clips.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="wl-eyebrow mb-2">Form over time · {clips.length} clip{clips.length === 1 ? "" : "s"}</div>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollSnapType: "x mandatory" }}>
        {clips.map(c => {
          const key = clipKey(c);
          const st = state[key] ?? { phase: "loading" as Phase };
          return (
            <div key={key} className="flex-shrink-0" style={{ width: 170, scrollSnapAlign: "start" }}>
              {st.phase === "ready" && st.url ? (
                <TrimmedVideo src={st.url} trimIn={c.trimIn} trimOut={c.trimOut}
                  controls playsInline preload="metadata"
                  className="rounded bg-black w-full" style={{ maxHeight: 260 }} />
              ) : (
                <div className="rounded bg-black w-full flex flex-col items-center justify-center gap-2 text-center px-2"
                  style={{ height: 200, color: "var(--wl-faint)", fontSize: 11 }}>
                  {st.phase === "loading" ? (
                    <span>{c.driveFileId ? "loading from Drive…" : "loading…"}</span>
                  ) : st.phase === "failed" ? (
                    <>
                      <span>{c.driveFileId ? "Couldn't load from Drive" : "Clip not on this device"}</span>
                      <button onClick={() => load(c)} className="wl-tag" style={{ cursor: "pointer" }}>Retry</button>
                    </>
                  ) : (
                    <button onClick={() => load(c)} className="wl-btn wl-btn--ghost" style={{ padding: "8px 14px" }}>
                      ▶ Load Drive clip
                    </button>
                  )}
                </div>
              )}
              <div className="wl-mono mt-1" style={{ fontSize: 11, color: "var(--wl-faint)" }}>{c.date}{c.driveFileId ? " ☁" : ""}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function clipKey(c: { videoId?: string; driveFileId?: string; setId: string }): string {
  return c.videoId || c.driveFileId || c.setId;
}
