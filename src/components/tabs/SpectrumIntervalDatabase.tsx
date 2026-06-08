// ── Interval Database (embedded in the Interval Spectrum) ───────────
// A compact, browsable list of the xenharmonic interval database.  Clicking
// an interval drops its ratio onto the spectrum as a magenta tick (octave-
// reduced so it always lands inside a 0–1200¢ region).  See IntervalBrowser
// for the full standalone version.

import { useMemo, useState } from "react";
import {
  XEN_INTERVALS_BY_LIMIT, XEN_AVAILABLE_LIMITS, XEN_INTERVALS_ALL,
  type XenInterval,
} from "@/lib/xenIntervals";

const LIMIT_COLORS: Record<number, string> = {
  2: "#888", 3: "#e87010", 5: "#22cc44", 7: "#5599ff",
  11: "#ddbb00", 13: "#cc44cc", 17: "#44cccc", 19: "#ff6688",
  23: "#88cc44", 29: "#cc8844", 31: "#4488cc", 37: "#aa66ff",
  41: "#66ccaa", 43: "#ff9944", 47: "#6688ff", 53: "#cc6688",
};
const limitColor = (l: number) => LIMIT_COLORS[l] ?? "#777";

function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }
/** Reduce a ratio into [1, 2) and lowest terms so it lands in a spectrum region. */
export function octaveReduceRatio(n: number, d: number): string {
  while (n / d >= 2) d *= 2;
  while (n / d < 1) n *= 2;
  const g = gcd(n, d);
  return `${n / g}/${d / g}`;
}

export default function SpectrumIntervalDatabase({ onAddRatio, activeRatios }: {
  onAddRatio: (ratio: string) => void;
  activeRatios: Set<string>;
}) {
  const [selectedLimit, setSelectedLimit] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) {
      return XEN_INTERVALS_ALL.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.names.some(n => n.toLowerCase().includes(q)) ||
        `${i.n}/${i.d}`.includes(q)
      ).sort((a, b) => a.cents - b.cents);
    }
    if (selectedLimit == null) return null;
    return [...(XEN_INTERVALS_BY_LIMIT[selectedLimit] ?? [])].sort((a, b) => a.cents - b.cents);
  }, [search, selectedLimit]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h3 className="text-xs font-semibold text-[#aaa] tracking-wider uppercase">Interval Database</h3>
        <span className="text-[10px] text-[#555]">{XEN_INTERVALS_ALL.length} intervals · click to add to spectrum</span>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name / ratio…"
          className="ml-auto w-52 px-2 py-1 text-xs bg-[#0a0a08] border border-[#2a2620] rounded text-[#ddd] placeholder-[#555] outline-none focus:border-[#7173e6]" />
      </div>

      {/* Limit category grid (no limit selected, not searching) */}
      {!results && (
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {XEN_AVAILABLE_LIMITS.filter(l => l <= 53).map(limit => {
            const ivs = XEN_INTERVALS_BY_LIMIT[limit] ?? [];
            const color = limitColor(limit);
            return (
              <button key={limit} onClick={() => setSelectedLimit(limit)}
                className="flex flex-col gap-0.5 p-3 rounded-lg text-left border border-[#1a1a1a] bg-[#0c0c0c] hover:bg-[#111] hover:border-[#333] transition-all">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base font-bold" style={{ color }}>{limit}</span>
                  <span className="text-[10px] text-[#555]">-limit</span>
                </div>
                <span className="text-[10px] text-[#666]">{ivs.length} interval{ivs.length !== 1 ? "s" : ""}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Interval list (a limit selected or searching) */}
      {results && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            {!search && (
              <button onClick={() => setSelectedLimit(null)}
                className="px-2 py-0.5 rounded text-[11px] border border-[#333] bg-[#111] text-[#888] hover:text-white transition-colors">
                ← Limits
              </button>
            )}
            <span className="text-[11px] text-[#777]">{results.length} interval{results.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="max-h-[420px] overflow-auto flex flex-col gap-0.5 pr-1">
            {results.map(iv => {
              const reduced = octaveReduceRatio(iv.n, iv.d);
              const on = activeRatios.has(reduced);
              return (
                <button key={`${iv.n}/${iv.d}`} onClick={() => onAddRatio(reduced)}
                  title={`${iv.name} — add ${reduced} to spectrum`}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-left transition-colors ${on
                    ? "bg-[#1a1015] border border-[#ff79c6]"
                    : "bg-[#0a0a0a] border border-transparent hover:bg-[#111] hover:border-[#222]"}`}>
                  <span className="w-16 text-right font-mono text-xs shrink-0" style={{ color: on ? "#ff79c6" : "#888" }}>{iv.n}/{iv.d}</span>
                  <span className="w-14 text-right text-[10px] text-[#555] shrink-0">{Math.round(iv.cents)}¢</span>
                  <span className={`flex-1 min-w-0 truncate text-xs ${on ? "text-white" : "text-[#ccc]"}`}>{iv.name}</span>
                  <span className="w-10 text-center text-[10px] px-1 py-0.5 rounded shrink-0"
                    style={{ color: limitColor(iv.limit), backgroundColor: `${limitColor(iv.limit)}15`, border: `1px solid ${limitColor(iv.limit)}30` }}>
                    {iv.limit}
                  </span>
                  <span className="w-4 text-center text-xs shrink-0" style={{ color: on ? "#ff79c6" : "#444" }}>{on ? "✓" : "+"}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
