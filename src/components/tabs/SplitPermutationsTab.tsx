// ── Split Permutations ─────────────────────────────────────────────
// Pick a pulse count and see every musical grouping of those pulses
// (e.g. 16 → "3+3+5+5", "5+5+6", "8+8" …) organised by musicality tier.
// Each permutation has a 3-state status button (red ✕ / yellow ■ /
// green ✓) you cycle through to track your practice progress; status
// persists session-to-session per permutation string and starts as red
// (haven't got it yet) by default.

import { useMemo } from "react";
import { useLS } from "@/lib/storage";
import { allMusicalGroupings } from "@/lib/groupingSelector";

// Default for every permutation that hasn't been touched yet is "red"
// ("haven't got it") per direct user direction "have everything
// automatically be x".
type SplitStatus = "red" | "yellow" | "green";
const DEFAULT_STATUS: SplitStatus = "red";

const STATUS_PALETTE: Record<SplitStatus, { bg: string; border: string; color: string; label: string; name: string }> = {
  red:    { bg: "#1a0a0a", border: "#5a2a2a", color: "#cc5a5a", label: "✕", name: "Haven't got it" },
  yellow: { bg: "#1a1a08", border: "#5a5a2a", color: "#c8c050", label: "■", name: "Working on it" },
  green:  { bg: "#0a1a0e", border: "#2a5a3a", color: "#5acc7a", label: "✓", name: "Nailed it" },
};

const NEXT_STATUS: Record<SplitStatus, SplitStatus> = { red: "yellow", yellow: "green", green: "red" };

export default function SplitPermutationsTab() {
  const [pulses, setPulses] = useLS<number>("lt_sp_pulses", 16);
  const [maxPart, setMaxPart] = useLS<number>("lt_sp_maxpart", 8);
  const [status, setStatus] = useLS<Record<string, SplitStatus>>("lt_sp_status", {});
  // Filter toggles — which status colours are visible.  Default all on.
  const [visible, setVisible] = useLS<Record<SplitStatus, boolean>>(
    "lt_sp_visible",
    { red: true, yellow: true, green: true },
  );

  const cycleStatus = (key: string) => {
    setStatus(prev => {
      const cur = prev[key] ?? DEFAULT_STATUS;
      return { ...prev, [key]: NEXT_STATUS[cur] };
    });
  };

  // Enumerate all musical groupings with the maxPart filter.
  const groupings = useMemo(() => {
    if (pulses < 2 || pulses > 64) return [];
    const cap = Math.max(1, Math.min(pulses, maxPart));
    return allMusicalGroupings(pulses, cap);
  }, [pulses, maxPart]);

  // Flat list (no tier grouping) — `allMusicalGroupings` already sorts
  // by musical score, so we just apply the status-visibility filter.
  const shownKeys = useMemo(() => {
    const out: string[] = [];
    for (const g of groupings) {
      const key = g.grouping.join("+");
      const st = status[key] ?? DEFAULT_STATUS;
      if (visible[st]) out.push(key);
    }
    return out;
  }, [groupings, status, visible]);

  const totalShown = shownKeys.length;

  return (
    <div className="space-y-6">
      {/* ── Section 1: Pulses ──────────────────────────────────────── */}
      <section>
        <h3 className="text-xs font-semibold tracking-widest text-[#d4a050] uppercase mb-3">Pulses</h3>
        <div className="flex items-end gap-4 flex-wrap">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-[#888] tracking-wider">Total pulses</span>
            <input
              type="number" min={2} max={64} step={1}
              value={pulses}
              onChange={e => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v)) setPulses(Math.max(2, Math.min(64, v)));
              }}
              className="w-24 px-3 py-2 text-base font-bold bg-[#0a0a08] border border-[#2a2620] rounded text-[#d4a050] outline-none text-center"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-[#888] tracking-wider">Max group size</span>
            <input
              type="number" min={1} max={Math.max(1, pulses)} step={1}
              value={maxPart}
              onChange={e => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v)) setMaxPart(Math.max(1, Math.min(64, v)));
              }}
              title="Maximum size of any single group in a permutation (e.g. 5 → groups can be 1-5)."
              className="w-24 px-3 py-2 text-base font-bold bg-[#0a0a08] border border-[#2a2620] rounded text-[#d4a050] outline-none text-center"
            />
          </label>
          <span className="text-xs text-[#666] pb-2">
            Showing {totalShown} of {groupings.length}
          </span>
        </div>

        {/* Status filter toggles — colour swatches only, no name labels. */}
        <div className="flex items-center gap-2 mt-3">
          <span className="text-[10px] text-[#888] tracking-wider">Show</span>
          {(["red", "yellow", "green"] as SplitStatus[]).map(s => {
            const p = STATUS_PALETTE[s];
            const on = visible[s];
            return (
              <button key={s}
                onClick={() => setVisible(prev => ({ ...prev, [s]: !prev[s] }))}
                title={`Toggle ${p.name}`}
                className="w-8 h-7 rounded border inline-flex items-center justify-center text-sm font-bold leading-none transition-opacity"
                style={{
                  background: p.bg, borderColor: p.border, color: p.color,
                  opacity: on ? 1 : 0.3,
                }}>
                {p.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Section 2: Permutations (flat list, sorted by musicality) ── */}
      <section>
        <h3 className="text-xs font-semibold tracking-widest text-[#d4a050] uppercase mb-3">Permutations</h3>
        {groupings.length === 0 ? (
          <p className="text-xs text-[#666]">No musical permutations for {pulses} pulses (max group {maxPart}) — try different values.</p>
        ) : totalShown === 0 ? (
          <p className="text-xs text-[#666]">No permutations match the current status filter.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {shownKeys.map(key => {
              const s = status[key] ?? DEFAULT_STATUS;
              const p = STATUS_PALETTE[s];
              return (
                <div key={key} className="flex items-center justify-between px-3 py-1.5 rounded border border-[#1a1a1a] bg-[#0e0e0e]">
                  <span className="font-mono text-sm text-[#ddd] tracking-wide">{key}</span>
                  <button
                    onClick={() => cycleStatus(key)}
                    title={`Status: ${p.name} — click to cycle (red ✕ → yellow ■ → green ✓)`}
                    className="w-8 h-7 rounded inline-flex items-center justify-center text-sm font-bold leading-none cursor-pointer"
                    style={{ background: p.bg, border: `1px solid ${p.border}`, color: p.color }}>
                    {p.label}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
