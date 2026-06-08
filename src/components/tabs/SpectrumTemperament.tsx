// ── Fifth-tuning families + ring structure (ported from Temperament Explorer) ──
// Self-contained: native title tooltips, no external tooltip infra.  `onSelectEdo`
// lets the host (Interval Spectrum) drop the chosen EDO onto the spectrum.

import { useMemo, useState } from "react";
import { FIFTH_TUNING_FAMILIES, EDO_DATA, getAllEDOs } from "@/lib/edoTemperamentData";

function FamiliesPanel({ onSelectEdo, activeSet }: { onSelectEdo: (edo: number) => void; activeSet: Set<number> }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-[#aaa] tracking-wider uppercase mb-1">
        Diatonic spectrum of fifth tunings
      </h3>
      <p className="text-[10px] text-[#777] mb-2 leading-snug max-w-prose">
        Each EDO sits in one fifth-tuning family by its best fifth (narrow → wide). Click an EDO to add it.
      </p>
      <div className="space-y-1.5">
        {FIFTH_TUNING_FAMILIES.map(fam => {
          const [minF, maxF] = fam.fifthRange;
          const rangeLabel = minF === maxF ? `${minF.toFixed(1)}¢` : `${minF.toFixed(1)}–${maxF.toFixed(1)}¢`;
          return (
            <div key={fam.name} className="bg-[#0e0e0e] border border-[#1e1e1e] rounded px-2 py-1.5 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-[#cfe6ff]" title={fam.blurb}>{fam.name}</span>
              <span className="text-[9px] text-[#666] font-mono">{rangeLabel}</span>
              <div className="flex gap-1 flex-wrap ml-auto">
                {fam.edos.map(edo => {
                  const fifthC = EDO_DATA.get(edo)?.ring.fifthCents.toFixed(1) ?? "—";
                  const on = activeSet.has(edo);
                  return (
                    <button key={edo} onClick={() => onSelectEdo(edo)}
                      title={`${edo}-TET · 5th = ${fifthC} ¢ — ${on ? "in spectrum" : "add to spectrum"}`}
                      className={`px-1.5 py-0.5 rounded border transition-colors text-[10px] font-semibold ${on
                        ? "bg-[#252550] border-[#7173e6] text-[#cfe6ff] shadow-[0_0_6px_#7173e688]"
                        : "bg-[#1a1a1a] hover:bg-[#252550] border-[#2a2a2a] hover:border-[#7173e6] text-[#ddd]"}`}>
                      {edo}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RingMap({ onSelectEdo, activeSet }: { onSelectEdo: (edo: number) => void; activeSet: Set<number> }) {
  const edos = useMemo(() => getAllEDOs(), []);
  const [primesOnly, setPrimesOnly] = useState(false);
  const filtered = useMemo(() => primesOnly ? edos.filter(e => e.isPrime) : edos, [edos, primesOnly]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <h3 className="text-sm font-bold text-[#ccc]">Ring structure by EDO</h3>
        <label className="text-xs text-[#666] flex items-center gap-1">
          <input type="checkbox" checked={primesOnly} onChange={e => setPrimesOnly(e.target.checked)} className="accent-[#7173e6]" /> Prime EDOs only
        </label>
      </div>
      <p className="text-xs text-[#666] max-w-prose">
        Single ring = fifths generate all notes. Red = multi-ring. Purple = prime. Click to add to the spectrum.
      </p>
      <div className="flex flex-wrap gap-2">
        {filtered.map(e => {
          const rc = e.ring.count; const isM = rc > 1; const sz = 28 + (isM ? rc * 2 : 0);
          const on = activeSet.has(e.edo);
          return (
            <div key={e.edo} className="relative cursor-pointer hover:brightness-150 transition-all"
              style={{ width: sz, height: sz, borderRadius: "50%", border: `1.5px solid ${on ? "#7173e6" : isM ? "#aa4444" : e.isPrime ? "#7173e6" : "#2a2a2a"}`, background: on ? "#252550" : isM ? "#1a1111" : "#111", boxShadow: on ? "0 0 7px #7173e6aa" : "none", display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => onSelectEdo(e.edo)}
              title={`${e.edo}-EDO: ${rc === 1 ? `Single ring — fifth ${e.ring.fifthSteps} steps (${e.ring.fifthCents}¢)` : `${rc} rings of ${e.ring.notesPerRing}`}${e.isPrime ? " [prime]" : ""}${e.temperaments.length ? ` — ${e.temperaments.join(", ")}` : ""}`}>
              <span className={`text-[9px] font-mono ${isM ? "text-[#cc6666]" : e.isPrime ? "text-[#9395ea]" : "text-[#888]"}`}>{e.edo}</span>
              {isM && <span className="absolute -top-1 -right-1 text-[7px] bg-[#aa4444] text-white rounded-full w-3 h-3 flex items-center justify-center font-bold">{rc}</span>}
            </div>
          );
        })}
      </div>
      <h4 className="text-xs font-bold text-[#999] mt-4">Consistency limits</h4>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-1 text-[9px]">
        {filtered.filter(e => e.consistencyLimit !== null && e.consistencyLimit! >= 5).map(e => (
          <div key={e.edo} className="flex items-center gap-1 bg-[#111] rounded px-1.5 py-0.5 border border-[#1e1e1e]">
            <span className="font-mono text-[#9395ea]">{e.edo}</span><span className="text-[#666]">→</span><span className="text-[#7aaa7a]">{e.consistencyLimit}-odd</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SpectrumTemperament({ onSelectEdo, activeEdos = [], view = "both" }: { onSelectEdo: (edo: number) => void; activeEdos?: number[]; view?: "families" | "rings" | "both" }) {
  const activeSet = useMemo(() => new Set(activeEdos), [activeEdos]);
  return (
    <div className="space-y-8">
      {view !== "rings" && <FamiliesPanel onSelectEdo={onSelectEdo} activeSet={activeSet} />}
      {view !== "families" && <RingMap onSelectEdo={onSelectEdo} activeSet={activeSet} />}
    </div>
  );
}
