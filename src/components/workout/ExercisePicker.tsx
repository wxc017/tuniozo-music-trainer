import { useMemo, useState } from "react";
import { useWorkoutData, saveCustomExercise } from "@/lib/workoutStore";
import { TRACKING_MODES, type TrackingMode, type CustomExercise } from "@/lib/workoutTypes";
import { GROUP_LABEL, GROUP_ORDER, type MuscleGroup } from "@/lib/muscleGroups";

// Pick from YOUR saved exercises — grouped by equipment (Rings / Parallettes /
// Static Bar / Other), each split into CW-assisted and Non-assisted — or add a
// new one, choosing how it's tracked. New exercises are saved for reuse.

export interface PickedExercise { name: string; skillId?: string; mode: TrackingMode }

interface Props {
  onPick: (choice: PickedExercise) => void;
  onCancel: () => void;
}

const EQUIP_ORDER = ["Rings", "Parallettes", "Static Bar", "Other"] as const;
type Equip = (typeof EQUIP_ORDER)[number];

// Derive equipment + assisted-ness from the saved name, plus a short display
// name (prefix and "— CW assisted" suffix stripped, since the headings convey
// that already).
function classify(name: string): { equip: Equip; assisted: boolean; disp: string } {
  const assisted = /cw assisted/i.test(name);
  let equip: Equip = "Other";
  if (/^rings?\b/i.test(name)) equip = "Rings";
  else if (/^parallettes\b/i.test(name)) equip = "Parallettes";
  else if (/^static bar\b/i.test(name)) equip = "Static Bar";
  const disp = name
    .replace(/^(rings?|parallettes|static bar)\s+/i, "")
    .replace(/\s*[—-]\s*cw assisted\s*$/i, "")
    .trim() || name;
  return { equip, assisted, disp };
}

type Row = CustomExercise & { disp: string };

export default function ExercisePicker({ onPick, onCancel }: Props) {
  const { customExercises } = useWorkoutData();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState<string | null>(null);
  const [pendingMode, setPendingMode] = useState<TrackingMode | null>(null);
  const [groups, setGroups] = useState<Set<MuscleGroup>>(new Set());
  const query = q.trim().toLowerCase();

  const resetCreate = () => { setCreating(null); setPendingMode(null); setGroups(new Set()); };
  const toggleGroup = (g: MuscleGroup) => setGroups(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });

  const grouped = useMemo(() => {
    const map = new Map<Equip, { assisted: Row[]; plain: Row[] }>();
    const filtered = customExercises.filter(e => !query || e.name.toLowerCase().includes(query));
    for (const e of filtered) {
      const { equip, assisted, disp } = classify(e.name);
      if (!map.has(equip)) map.set(equip, { assisted: [], plain: [] });
      (assisted ? map.get(equip)!.assisted : map.get(equip)!.plain).push({ ...e, disp });
    }
    for (const g of map.values()) {
      g.assisted.sort((a, b) => a.disp.localeCompare(b.disp));
      g.plain.sort((a, b) => a.disp.localeCompare(b.disp));
    }
    return map;
  }, [customExercises, query]);

  const anyResults = [...grouped.values()].some(g => g.assisted.length || g.plain.length);

  const typed = q.trim();
  const exactMatch = customExercises.some(e => e.name.toLowerCase() === query);
  const canAdd = typed.length > 0 && !exactMatch;

  const saveNew = () => {
    if (!creating || !pendingMode) return;
    const saved = saveCustomExercise(creating, pendingMode, [...groups]);
    onPick({ name: saved.name, mode: saved.mode });
  };

  return (
    <div className="wl-root fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,.7)" }} onClick={onCancel}>
      <div className="wl-card w-full max-w-md max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="p-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--wl-line)" }}>
          <input className="wl-input" value={q}
            onChange={e => { setQ(e.target.value); resetCreate(); }}
            placeholder="Search or type a new exercise…" />
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

          {/* Grouped saved exercises */}
          {EQUIP_ORDER.map(equip => {
            const g = grouped.get(equip);
            if (!g || (!g.assisted.length && !g.plain.length)) return null;
            return (
              <div key={equip}>
                <div className="sticky top-0 wl-mono"
                  style={{ background: "var(--wl-surface)", borderBottom: "1px solid var(--wl-line)", padding: "8px 16px", fontSize: 13, fontWeight: 700, letterSpacing: ".04em", color: "var(--wl-accent)" }}>
                  {equip}
                </div>
                {g.assisted.length > 0 && <SubGroup title="CW assisted" rows={g.assisted} onPick={onPick} />}
                {g.plain.length > 0 && <SubGroup title="Non assisted" rows={g.plain} onPick={onPick} />}
              </div>
            );
          })}

          {/* Empty state */}
          {!anyResults && !canAdd && (
            <div className="px-4 py-10 text-center text-sm wl-muted leading-relaxed">
              {customExercises.length === 0
                ? <>No exercises yet.<br />Type a name above to add your first one.</>
                : <>No match. Type a new name to add it.</>}
            </div>
          )}
        </div>

        <button onClick={onCancel} className="flex-shrink-0 p-3 text-sm wl-muted" style={{ borderTop: "1px solid var(--wl-line)" }}>Cancel</button>
      </div>
    </div>
  );
}

function SubGroup({ title, rows, onPick }: { title: string; rows: Row[]; onPick: (c: PickedExercise) => void }) {
  return (
    <div>
      {/* Subheading — indented one level under the equipment header. */}
      <div className="wl-mono" style={{ paddingLeft: 28, paddingRight: 16, paddingTop: 6, paddingBottom: 2, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--wl-accent-ink)", opacity: .85 }}>
        {title}
      </div>
      {rows.map(e => (
        /* Exercise — indented a second level. */
        <button key={e.id} onClick={() => onPick({ name: e.name, mode: e.mode })}
          className="w-full text-left flex items-center gap-3 hover:brightness-125"
          style={{ paddingLeft: 40, paddingRight: 14, paddingTop: 9, paddingBottom: 9, borderBottom: "1px solid color-mix(in srgb, var(--wl-line) 50%, transparent)" }}>
          <span style={{ color: "var(--wl-text)", fontSize: 14 }}>{e.disp}</span>
          <span className="ml-auto wl-mono" style={{ fontSize: 11, color: "var(--wl-faint)" }}>
            {TRACKING_MODES.find(m => m.id === e.mode)?.short}
          </span>
        </button>
      ))}
    </div>
  );
}
