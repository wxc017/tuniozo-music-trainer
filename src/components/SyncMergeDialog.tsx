// Review dialog for a Google Drive restore/merge. Shows every item the incoming
// payload would ADD, CHANGE, or DELETE versus this device, plus any video clips
// that would be pulled down, each with a checkbox. Safe defaults: additions and
// changes are pre-checked; deletions are NOT — so local-only items survive
// unless the user explicitly ticks them.
//
// Styled with the Workout Log's gold `wl-` design system (wrapped in `.wl-root`
// so those CSS variables resolve even outside the log).

import { useMemo, useState } from "react";
import {
  SyncDiff, ItemChange, itemChangeId, valueChangeId, keyLabel,
} from "@/lib/syncMerge";

/** A clip the restore can pull down (already-present clips aren't listed). */
export interface VideoChange { id: string; label: string }
export function videoSelId(id: string): string { return `vid::${id}`; }

const KIND_META: Record<string, { label: string; color: string }> = {
  add:    { label: "New",                  color: "var(--wl-good)" },
  update: { label: "Changed",              color: "var(--wl-warn)" },
  remove: { label: "Only on this device",  color: "var(--wl-hard)" },
};

export default function SyncMergeDialog({
  diff, videos = [], skippedVideos = 0, onApply, onCancel,
}: {
  diff: SyncDiff;
  videos?: VideoChange[];
  /** How many clips are already on this device (skipped — for the note). */
  skippedVideos?: number;
  onApply: (applied: Set<string>) => void;
  onCancel: () => void;
}) {
  // Default selection: apply adds + updates + value changes + all new videos;
  // leave removes off.
  const [applied, setApplied] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const c of diff.items) if (c.kind !== "remove") s.add(itemChangeId(c));
    for (const c of diff.values) s.add(valueChangeId(c));
    for (const v of videos) s.add(videoSelId(v.id));
    return s;
  });

  const groups = useMemo(() => {
    const m = new Map<string, ItemChange[]>();
    for (const c of diff.items) { const a = m.get(c.key) ?? []; a.push(c); m.set(c.key, a); }
    return [...m.entries()];
  }, [diff.items]);

  // The value changes are low-level app preferences (metronome bpm, chord
  // settings, per-tool state, …) — not content worth vetting one by one. They
  // apply automatically; a single toggle lets you skip them wholesale.
  const settingsAllOn = diff.values.length > 0 && diff.values.every(c => applied.has(valueChangeId(c)));
  const toggleAllSettings = () => setApplied(prev => {
    const n = new Set(prev);
    if (settingsAllOn) diff.values.forEach(c => n.delete(valueChangeId(c)));
    else diff.values.forEach(c => n.add(valueChangeId(c)));
    return n;
  });

  const toggle = (id: string) => setApplied(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const removeCount = diff.items.filter(c => c.kind === "remove" && applied.has(itemChangeId(c))).length;
  const addCount = diff.items.filter(c => c.kind === "add" && applied.has(itemChangeId(c))).length;
  const updCount = diff.items.filter(c => c.kind === "update" && applied.has(itemChangeId(c))).length;
  const vidCount = videos.filter(v => applied.has(videoSelId(v.id))).length;

  const row = (id: string, kind: string, label: string) => (
    <label key={id} className="flex items-center gap-2 py-1 cursor-pointer text-sm">
      <input type="checkbox" checked={applied.has(id)} onChange={() => toggle(id)}
        style={{ accentColor: "var(--wl-accent)" }} />
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
        style={{ color: KIND_META[kind].color, border: `1px solid color-mix(in srgb, ${KIND_META[kind].color} 45%, transparent)` }}>
        {KIND_META[kind].label}
      </span>
      <span className="truncate" style={{ color: "var(--wl-muted)" }}>{label}</span>
    </label>
  );

  const empty = groups.length === 0 && diff.values.length === 0 && videos.length === 0;

  return (
    <div className="wl-root fixed inset-0 z-[90] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,.72)", height: "100%" }} onClick={onCancel}>
      <div className="wl-card w-full max-w-lg max-h-[85vh] flex flex-col" style={{ borderRadius: 16 }} onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3" style={{ borderBottom: "1px solid var(--wl-line)" }}>
          <div className="wl-eyebrow">Google Drive</div>
          <h3 className="wl-h2" style={{ fontSize: 18 }}>Review restore</h3>
          <p className="text-xs mt-1" style={{ color: "var(--wl-muted)" }}>
            Tick what to bring over. <span style={{ color: "var(--wl-hard)" }}>Deletions are off by default</span> — anything only on this device stays unless you tick it.
          </p>
        </div>

        <div className="overflow-y-auto px-5 py-3 flex-1 space-y-4">
          {empty && <p className="text-sm" style={{ color: "var(--wl-muted)" }}>No differences — this device already matches Drive.</p>}

          {groups.map(([key, changes]) => (
            <div key={key}>
              <div className="wl-collabel mb-1" style={{ color: "var(--wl-accent)" }}>{keyLabel(key)}</div>
              <div className="pl-1">
                {changes.slice()
                  .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "add" ? -1 : b.kind === "add" ? 1 : a.kind === "update" ? -1 : 1))
                  .map(c => row(itemChangeId(c), c.kind, c.label))}
              </div>
            </div>
          ))}

          {diff.values.length > 0 && (
            // App/tool preferences apply automatically — one toggle, no wall of
            // cryptic per-key rows. Untick only if you want to keep this device's
            // settings untouched.
            <label className="flex items-center gap-2 py-1 cursor-pointer">
              <input type="checkbox" checked={settingsAllOn} onChange={toggleAllSettings}
                style={{ accentColor: "var(--wl-accent)" }} />
              <span className="wl-collabel" style={{ color: "var(--wl-accent)" }}>App &amp; tool preferences</span>
              <span className="text-[11px]" style={{ color: "var(--wl-faint)" }}>· {diff.values.length} update{diff.values.length === 1 ? "" : "s"}, applied automatically</span>
            </label>
          )}

          {videos.length > 0 && (
            <div>
              <div className="wl-collabel mb-1" style={{ color: "var(--wl-accent)" }}>
                Video clips {skippedVideos > 0 && <span style={{ color: "var(--wl-faint)" }}>· {skippedVideos} already here, skipped</span>}
              </div>
              <div className="pl-1">{videos.map(v => row(videoSelId(v.id), "add", v.label))}</div>
            </div>
          )}
        </div>

        <div className="px-5 py-3" style={{ borderTop: "1px solid var(--wl-line)" }}>
          <div className="wl-mono text-[11px] mb-2" style={{ color: "var(--wl-faint)" }}>
            Applying: <span style={{ color: "var(--wl-good)" }}>{addCount} new</span>,{" "}
            <span style={{ color: "var(--wl-warn)" }}>{updCount} changed</span>
            {vidCount > 0 && <>, <span style={{ color: "var(--wl-accent)" }}>{vidCount} clip{vidCount === 1 ? "" : "s"}</span></>}
            {removeCount > 0 && <>, <span style={{ color: "var(--wl-hard)" }}>{removeCount} deleted</span></>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => onApply(applied)} className="wl-btn wl-btn--primary flex-1">Apply &amp; reload</button>
            <button onClick={onCancel} className="wl-btn flex-1">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
