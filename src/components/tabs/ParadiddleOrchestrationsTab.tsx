// ── Paradiddle Orchestrations ──────────────────────────────────────
// A matrix of rudiment orchestrations: pick a sticking, then read the grid
// where every ROW is a diddle/foot treatment and every COLUMN is a voicing
// style.  Each cell renders the sticking under that (style, treatment) as real
// drum notation (reusing the Drum-Patterns / Accent-Study VexDrumStrip).  The
// reference grooves below are the user-supplied patterns, notated verbatim.
//
// See src/lib/paradiddleOrchestrations.ts for the generative theory.

import { useState } from "react";
import { useLS } from "@/lib/storage";
import { VexDrumStrip } from "@/components/VexDrumNotation";
import {
  STICKINGS, STYLES, TREATMENTS, REFERENCE_GROOVES,
  orchestrate, toStripMeasure, type Sticking,
} from "@/lib/paradiddleOrchestrations";

const CELL_W = 230;   // notation tile width
const CELL_H = 130;   // notation tile height

export default function ParadiddleOrchestrationsTab() {
  const [stickingId, setStickingId] = useLS<string>("lt_po_sticking", "paradiddle");
  const [showRef, setShowRef] = useLS<boolean>("lt_po_showref", true);

  const sticking: Sticking = STICKINGS.find(s => s.id === stickingId) ?? STICKINGS[0];

  return (
    <div className="space-y-6">
      {/* ── Sticking selector ── */}
      <section>
        <h3 className="text-xs font-semibold tracking-widest text-[#d4a050] uppercase mb-3">Sticking</h3>
        <div className="flex flex-wrap gap-2">
          {STICKINGS.map(s => {
            const on = s.id === sticking.id;
            return (
              <button key={s.id}
                onClick={() => setStickingId(s.id)}
                className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
                  on
                    ? "bg-[#1a1408] border-[#d4a050] text-[#d4a050]"
                    : "bg-[#0e0e0e] border-[#1f1f1f] text-[#999] hover:text-[#ccc] hover:border-[#333]"
                }`}>
                {s.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Matrix: rows = treatment, cols = style ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold tracking-widest text-[#d4a050] uppercase">
            Orchestration matrix — {sticking.label}
          </h3>
          <span className="text-[10px] text-[#666]">
            rows = diddle / foot treatment · columns = voicing style
          </span>
        </div>
        <div className="overflow-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-[#0d0d0d] p-2 text-left align-bottom">
                  <span className="text-[10px] text-[#555]">treat ╲ style</span>
                </th>
                {STYLES.map(st => (
                  <th key={st.id} className="p-2 text-center align-bottom" style={{ minWidth: CELL_W }}>
                    <div className="text-xs font-semibold text-[#cda6e0]" title={st.desc}>{st.label}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TREATMENTS.map(tr => (
                <tr key={tr.id}>
                  <th className="sticky left-0 z-10 bg-[#0d0d0d] p-2 text-right align-middle">
                    <div className="text-xs font-semibold text-[#5cbfae] whitespace-nowrap" title={tr.desc}>{tr.label}</div>
                  </th>
                  {STYLES.map(st => {
                    const pattern = orchestrate(sticking, st.id, tr.id);
                    const measure = toStripMeasure(pattern);
                    return (
                      <td key={st.id} className="p-1 align-top">
                        <div className="rounded border border-[#1a1a1a] bg-[#fafafa]" title={`${sticking.label} · ${st.label} · ${tr.label}`}>
                          <VexDrumStrip
                            measures={[measure]}
                            measureWidth={CELL_W - 12}
                            height={CELL_H}
                            showClef
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Reference grooves (the patterns supplied) ── */}
      <section>
        <button
          onClick={() => setShowRef(v => !v)}
          className="flex items-center gap-2 mb-3">
          <span className="text-[10px] text-[#666] w-3">{showRef ? "▾" : "▸"}</span>
          <span className="text-xs font-semibold tracking-widest text-[#d4a050] uppercase">
            Reference grooves
          </span>
          <span className="text-[10px] text-[#555]">({REFERENCE_GROOVES.length})</span>
        </button>
        {showRef && (
          <div className="flex flex-wrap gap-3">
            {REFERENCE_GROOVES.map((g, i) => (
              <div key={i} className="rounded border border-[#1a1a1a] bg-[#fafafa]">
                <div className="px-2 pt-1 text-[10px] font-mono text-[#444] bg-[#fafafa]">{g.name}</div>
                <VexDrumStrip
                  measures={[toStripMeasure(g)]}
                  measureWidth={CELL_W}
                  height={CELL_H}
                  showClef
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
