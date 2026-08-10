import { useMemo, useState } from "react";
import { useWorkoutData, saveCustomExercise, deleteCustomExercise, isBuiltinExerciseId } from "@/lib/workoutStore";
import { TRACKING_MODES, type TrackingMode, type CustomExercise } from "@/lib/workoutTypes";
import { GROUP_LABEL, GROUP_ORDER, type MuscleGroup } from "@/lib/muscleGroups";

// Pick from YOUR saved exercises.
//
// A variant is one point on two axes — SURFACE (rings / parallettes / static bar
// / the ground) and ASSISTANCE (counterweight / Halver / bungee / none) — and
// cross product as flat headed sections meant the same skill appeared five or six
// times and the sheet was mostly headings.  So the two axes are FILTERS at the
// top and the list below is one row per skill: pick where you are and what's
// helping you, then pick the movement.
//
// The axes are still parsed out of the stored NAME ("Ring Planche — CW assisted")
// rather than being separate fields, because the name is what the log, the
// progress charts and the Drive backups all key on — making it structured would
// mean migrating every logged workout to gain nothing the filter doesn't already
// give.  classify() is the single place that decoding lives.

export interface PickedExercise { name: string; skillId?: string; mode: TrackingMode }

interface Props {
  onPick: (choice: PickedExercise) => void;
  onCancel: () => void;
  /** Shown above the filters when the sheet is RE-LABELLING an exercise that's
   *  already logged rather than adding a new one, so it's clear the sets stay put. */
  replacing?: string;
}

// ── The two axes ─────────────────────────────────────────────────────
const SURFACES = [
  { id: "ground", label: "On ground", prefix: "" },
  { id: "parallettes", label: "Parallettes", prefix: "Parallettes" },
  { id: "rings", label: "Rings", prefix: "Ring" },
  { id: "bar", label: "Static Bar", prefix: "Static Bar" },
] as const;
type Surface = (typeof SURFACES)[number]["id"];

const ASSISTS = [
  { id: "none", label: "None" },
  { id: "cw", label: "CW" },
  { id: "halver", label: "Halver" },
  { id: "bungee", label: "Bungee" },
] as const;
type Assist = (typeof ASSISTS)[number]["id"];

const SURFACE_LABEL: Record<Surface, string> = Object.fromEntries(SURFACES.map(s => [s.id, s.label])) as Record<Surface, string>;
const ASSIST_LABEL: Record<Assist, string> = Object.fromEntries(ASSISTS.map(a => [a.id, a.label])) as Record<Assist, string>;

/** Decode a stored name into its two axes plus the bare skill name. */
function classify(name: string): { surface: Surface; assist: Assist; skill: string } {
  const assist: Assist = /halver\s+assisted/i.test(name) ? "halver"
    : /bungee\s+assisted/i.test(name) ? "bungee"
    : /cw\s+assisted/i.test(name) ? "cw" : "none";
  let surface: Surface = "ground";
  if (/^rings?\b/i.test(name)) surface = "rings";
  else if (/^parallettes\b/i.test(name)) surface = "parallettes";
  else if (/^static bar\b/i.test(name)) surface = "bar";
  const skill = name
    .replace(/^(rings?|parallettes|static bar)\s+/i, "")
    .replace(/\s*[—–-]\s*(cw|halver|bungee)\s+assisted\s*$/i, "")
    .trim() || name;
  return { surface, assist, skill };
}

type Row = CustomExercise & { skill: string; surface: Surface; assist: Assist };

export default function ExercisePicker({ onPick, onCancel, replacing }: Props) {
  const { customExercises } = useWorkoutData();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState<string | null>(null);
  const [pendingMode, setPendingMode] = useState<TrackingMode | null>(null);
  const [groups, setGroups] = useState<Set<MuscleGroup>>(new Set());
  // Start on the axes the exercise being replaced already sits on, so re-labelling
  // opens where you are rather than making you re-find it.
  const start = replacing ? classify(replacing) : null;
  const [surface, setSurface] = useState<Surface>(start?.surface ?? "rings");
  const [assist, setAssist] = useState<Assist>(start?.assist ?? "none");
  const query = q.trim().toLowerCase();

  const resetCreate = () => { setCreating(null); setPendingMode(null); setGroups(new Set()); };
  const toggleGroup = (g: MuscleGroup) => setGroups(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });

  const all = useMemo<Row[]>(() => customExercises.map(e => ({ ...e, ...classify(e.name) })), [customExercises]);

  // Searching looks across EVERY variant — you shouldn't have to guess the right
  // filter combination to find something by name.  With the box empty the filters
  // rule.  Either way, a row that isn't on the selected axes shows what it is.
  const rows = useMemo(() => {
    const hits = query
      ? all.filter(r => r.name.toLowerCase().includes(query))
      : all.filter(r => r.surface === surface && r.assist === assist);
    return hits.sort((a, b) => a.skill.localeCompare(b.skill) || a.name.localeCompare(b.name));
  }, [all, query, surface, assist]);

  // Which combinations actually hold anything, so an empty pairing can say so
  // instead of looking broken.
  const populated = useMemo(() => new Set(all.map(r => `${r.surface}|${r.assist}`)), [all]);

  const typed = q.trim();
  const exactMatch = all.some(e => e.name.toLowerCase() === query);
  const canAdd = typed.length > 0 && !exactMatch;

  const saveNew = () => {
    if (!creating || !pendingMode) return;
    const saved = saveCustomExercise(creating, pendingMode, [...groups]);
    onPick({ name: saved.name, mode: saved.mode });
  };

  const chip = (on: boolean, dim = false) => ({
    padding: "5px 11px", borderRadius: 999, fontSize: 12, cursor: "pointer",
    background: on ? "var(--wl-accent)" : "var(--wl-surface-2)",
    color: on ? "#1a1408" : dim ? "var(--wl-faint)" : "var(--wl-muted)",
    border: `1px solid ${on ? "var(--wl-accent)" : "var(--wl-line)"}`,
    fontWeight: on ? 700 : 400,
  });

  return (
    <div className="wl-root fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,.7)" }} onClick={onCancel}>
      <div className="wl-card w-full max-w-md max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="p-3 flex-shrink-0 space-y-2" style={{ borderBottom: "1px solid var(--wl-line)" }}>
          {replacing && (
            <div>
              <div className="wl-collabel" style={{ color: "var(--wl-accent-ink)" }}>Change exercise</div>
              <div className="text-[13px] mt-0.5" style={{ color: "var(--wl-text)" }}>
                <b>{replacing}</b> → pick what it really was
              </div>
              <div className="text-[11px] wl-faint mt-0.5">Sets, videos and notes stay exactly as they are.</div>
            </div>
          )}

          {/* Axis 1 — where your hands are. */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="wl-collabel" style={{ width: "4.6rem", flexShrink: 0 }}>Surface</span>
            {SURFACES.map(s => (
              <button key={s.id} onClick={() => setSurface(s.id)}
                style={chip(surface === s.id, !populated.has(`${s.id}|${assist}`))}>{s.label}</button>
            ))}
          </div>
          {/* Axis 2 — what's taking weight off you. */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="wl-collabel" style={{ width: "4.6rem", flexShrink: 0 }}>Assist</span>
            {ASSISTS.map(a => (
              <button key={a.id} onClick={() => setAssist(a.id)}
                style={chip(assist === a.id, !populated.has(`${surface}|${a.id}`))}>{a.label}</button>
            ))}
          </div>

          <input className="wl-input" value={q}
            onChange={e => { setQ(e.target.value); resetCreate(); }}
            placeholder="Search every variant, or type a new exercise…" />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Add new → choose tracking mode */}
          {canAdd && (
            <div className="px-3 py-3" style={{ borderBottom: "1px solid var(--wl-line)" }}>
              {creating == null ? (
                <button onClick={() => setCreating(typed)} className="flex items-center gap-2 text-sm" style={{ color: "var(--wl-text)" }}>
                  <span style={{ color: "var(--wl-accent)", fontSize: 18, lineHeight: 1 }}>+</span>
                  Add <b>“{typed}”</b> <span className="wl-faint">— new exercise</span>
                </button>
              ) : pendingMode == null ? (
                <div>
                  <div className="wl-collabel mb-2">How is “{creating}” tracked?</div>
                  <div className="grid grid-cols-2 gap-2">
                    {TRACKING_MODES.map(m => (
                      <button key={m.id} onClick={() => setPendingMode(m.id)} className="wl-btn" style={{ padding: "10px 8px", textAlign: "center" }}>
                        <div style={{ color: "var(--wl-text)", fontWeight: 600 }}>{m.label}</div>
                        <div className="wl-mono" style={{ fontSize: 10, color: "var(--wl-faint)" }}>{m.short}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="wl-collabel mb-2">Which muscles does “{creating}” train? <span className="wl-faint">(for weekly volume — optional)</span></div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {GROUP_ORDER.map(g => {
                      const on = groups.has(g);
                      return (
                        <button key={g} onClick={() => toggleGroup(g)} className="wl-tag" style={{ cursor: "pointer",
                          background: on ? "var(--wl-accent)" : "var(--wl-surface-2)",
                          color: on ? "#1a1408" : "var(--wl-muted)",
                          border: `1px solid ${on ? "var(--wl-accent)" : "var(--wl-line)"}`, fontWeight: on ? 700 : 400 }}>
                          {GROUP_LABEL[g]}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveNew} className="wl-btn wl-btn--primary flex-1">
                      {groups.size ? `Add with ${groups.size} muscle${groups.size === 1 ? "" : "s"}` : "Add (auto-detect muscles)"}
                    </button>
                    <button onClick={() => setPendingMode(null)} className="wl-btn">Back</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {rows.map(e => {
            // While SEARCHING the list spans every combination, so each row has to
            // say which one it's from; under the filters that would just repeat the
            // chips back at you.
            const offAxis = query ? (e.surface !== surface || e.assist !== assist) : false;
            return (
              <div key={e.id} className="flex items-center hover:brightness-125"
                style={{ borderBottom: "1px solid color-mix(in srgb, var(--wl-line) 50%, transparent)" }}>
                <button onClick={() => onPick({ name: e.name, mode: e.mode })}
                  className="flex-1 min-w-0 text-left flex items-center gap-2"
                  style={{ paddingLeft: 16, paddingRight: 6, paddingTop: 9, paddingBottom: 9 }}>
                  <span className="truncate" style={{ color: "var(--wl-text)", fontSize: 14 }}>{e.skill}</span>
                  {(offAxis || query) && (
                    <span className="wl-tag wl-tag--muted flex-shrink-0" style={{ fontSize: 10 }}>
                      {SURFACE_LABEL[e.surface]}{e.assist === "none" ? "" : ` · ${ASSIST_LABEL[e.assist]}`}
                    </span>
                  )}
                  <span className="ml-auto wl-mono flex-shrink-0" style={{ fontSize: 11, color: "var(--wl-faint)" }}>
                    {TRACKING_MODES.find(m => m.id === e.mode)?.short}
                  </span>
                </button>
                {/* Delete — only for exercises the USER saved.  The built-in starters
                    are hard-coded and come back on reload, so offering it there would
                    be a button that appears to do nothing.  This is the only way to
                    clear a stray saved exercise (a typo'd name, or a copy left behind
                    by an old build), which otherwise sits in the list forever. */}
                {!isBuiltinExerciseId(e.id) && (
                  <button
                    onClick={() => { if (window.confirm(`Delete “${e.name}” from your saved exercises?\n\nLogged sets already using it are not affected.`)) deleteCustomExercise(e.id); }}
                    className="wl-icon-btn wl-icon-btn--danger text-xs flex-shrink-0"
                    style={{ width: "2rem" }} title={`Delete “${e.name}” from your saved exercises`}>✕</button>
                )}
              </div>
            );
          })}

          {/* Empty state */}
          {rows.length === 0 && !canAdd && (
            <div className="px-4 py-10 text-center text-sm wl-muted leading-relaxed">
              {all.length === 0
                ? <>No exercises yet.<br />Type a name above to add your first one.</>
                : query
                  ? <>No match. Type a new name to add it.</>
                  : <>Nothing saved for <b>{SURFACE_LABEL[surface]}</b> · <b>{ASSIST_LABEL[assist]}</b> yet.<br />
                    Try another combination, or type a name to add one.</>}
            </div>
          )}
        </div>

        <button onClick={onCancel} className="flex-shrink-0 p-3 text-sm wl-muted" style={{ borderTop: "1px solid var(--wl-line)" }}>Cancel</button>
      </div>
    </div>
  );
}
