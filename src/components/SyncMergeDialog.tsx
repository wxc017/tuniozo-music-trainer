// Review dialog for a Google Drive "Load from Drive" merge. Shows every item the
// incoming payload would ADD, CHANGE, or DELETE versus what's on this device,
// grouped by collection, each with a checkbox. Safe defaults: additions and
// changes are pre-checked; deletions are NOT — so local-only items (e.g. scores
// the other device never had) survive unless the user explicitly ticks them.

import { useMemo, useState } from "react";
import {
  SyncDiff, ItemChange, ValueChange, itemChangeId, valueChangeId, keyLabel,
} from "@/lib/syncMerge";

const KIND_META: Record<string, { label: string; color: string }> = {
  add:    { label: "New",             color: "#88cc99" },
  update: { label: "Changed",         color: "#e8b060" },
  remove: { label: "Only on this device", color: "#cc6666" },
};

export default function SyncMergeDialog({
  diff, onApply, onCancel,
}: {
  diff: SyncDiff;
  onApply: (applied: Set<string>) => void;
  onCancel: () => void;
}) {
  // Default selection: apply adds + updates + value changes; leave removes off.
  const [applied, setApplied] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const c of diff.items) if (c.kind !== "remove") s.add(itemChangeId(c));
    for (const c of diff.values) s.add(valueChangeId(c));
    return s;
  });

  const groups = useMemo(() => {
    const m = new Map<string, ItemChange[]>();
    for (const c of diff.items) { const a = m.get(c.key) ?? []; a.push(c); m.set(c.key, a); }
    return [...m.entries()];
  }, [diff.items]);

  const toggle = (id: string) => setApplied(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const removeCount = diff.items.filter(c => c.kind === "remove" && applied.has(itemChangeId(c))).length;
  const addCount = diff.items.filter(c => c.kind === "add" && applied.has(itemChangeId(c))).length;
  const updCount = diff.items.filter(c => c.kind === "update" && applied.has(itemChangeId(c))).length;

  const row = (id: string, kind: string, label: string) => (
    <label key={id} className="flex items-center gap-2 py-1 cursor-pointer text-sm">
      <input type="checkbox" checked={applied.has(id)} onChange={() => toggle(id)} className="accent-[#7173e6]" />
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: KIND_META[kind].color, border: `1px solid ${KIND_META[kind].color}55` }}>
        {KIND_META[kind].label}
      </span>
      <span className="text-[#ccc] truncate">{label}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
      <div className="bg-[#111] border border-[#2a2a2a] rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3 border-b border-[#222]">
          <h3 className="text-white font-semibold text-base">Review sync from Drive</h3>
          <p className="text-xs text-[#888] mt-1">
            Tick what to apply. <span className="text-[#cc6666]">Deletions are off by default</span> — anything only on this device stays unless you tick it.
          </p>
        </div>

        <div className="overflow-y-auto px-5 py-3 flex-1 space-y-4">
          {groups.length === 0 && diff.values.length === 0 && (
            <p className="text-sm text-[#888]">No differences — this device already matches Drive.</p>
          )}

          {groups.map(([key, changes]) => (
            <div key={key}>
              <div className="text-[11px] uppercase tracking-widest text-[#7173e6] mb-1">{keyLabel(key)}</div>
              <div className="pl-1">
                {changes
                  .slice()
                  .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "add" ? -1 : b.kind === "add" ? 1 : a.kind === "update" ? -1 : 1))
                  .map(c => row(itemChangeId(c), c.kind, c.label))}
              </div>
            </div>
          ))}

          {diff.values.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-widest text-[#7173e6] mb-1">Settings & other data</div>
              <div className="pl-1">
                {diff.values.map((c: ValueChange) => row(valueChangeId(c), c.kind, c.label))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[#222]">
          <div className="text-[11px] text-[#888] mb-2">
            Applying: <span className="text-[#88cc99]">{addCount} new</span>, <span className="text-[#e8b060]">{updCount} changed</span>
            {removeCount > 0 && <>, <span className="text-[#cc6666]">{removeCount} deleted</span></>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onApply(applied)}
              className="flex-1 bg-[#7173e6] hover:bg-[#5a5cc7] text-white text-sm rounded py-2 font-medium transition-colors"
            >
              Apply &amp; reload
            </button>
            <button
              onClick={onCancel}
              className="flex-1 bg-[#1a1a1a] border border-[#333] text-[#888] text-sm rounded py-2 transition-colors hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
