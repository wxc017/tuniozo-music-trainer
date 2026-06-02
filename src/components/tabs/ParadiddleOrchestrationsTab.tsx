// ── Paradiddle Orchestrations ──────────────────────────────────────
// COLUMNS = sticking; ROWS = musical orchestration scheme.  Each cell renders
// that sticking under that scheme as real 16th-note drum notation (reusing the
// Drum-Patterns VexDrumStrip).  Cells that aren't musical are left empty.
//
// See src/lib/paradiddleOrchestrations.ts for the theory.

import { VexDrumStrip } from "@/components/VexDrumNotation";
import {
  STICKINGS, SCHEMES, orchestrate, toStripMeasure, isEmptyPattern,
} from "@/lib/paradiddleOrchestrations";

const CELL_W = 230;   // notation tile width
const CELL_H = 170;   // tall enough for stem-down bass + hi-hat pedal ledger line

export default function ParadiddleOrchestrationsTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-widest text-[#d4a050] uppercase">
          Orchestration matrix
        </h3>
        <span className="text-[10px] text-[#666]">
          columns = sticking · rows = orchestration · 16th notes
        </span>
      </div>

      <div className="overflow-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[#0d0d0d] p-2 text-left align-bottom">
                <span className="text-[10px] text-[#555]">orchestration ╲ sticking</span>
              </th>
              {STICKINGS.map(sk => (
                <th key={sk.id} className="p-2 text-center align-bottom" style={{ minWidth: CELL_W }}>
                  <div className="text-xs font-semibold text-[#cda6e0]">{sk.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SCHEMES.map(scheme => (
              <tr key={scheme.id}>
                <th className="sticky left-0 z-10 bg-[#0d0d0d] p-2 text-right align-middle">
                  <div className="text-xs font-semibold text-[#5cbfae] whitespace-nowrap" title={scheme.desc}>
                    {scheme.label}
                  </div>
                </th>
                {STICKINGS.map(sk => {
                  const pattern = orchestrate(sk, scheme);
                  const empty = isEmptyPattern(pattern);
                  return (
                    <td key={sk.id} className="p-1 align-top">
                      <div
                        className="rounded border border-[#1f1f1f] bg-[#0e0e0e] flex items-center justify-center"
                        style={{ minHeight: CELL_H }}
                        title={`${sk.label} · ${scheme.label}`}
                      >
                        {empty ? (
                          <span className="text-[10px] text-[#444]">—</span>
                        ) : (
                          <VexDrumStrip
                            measures={[toStripMeasure(pattern)]}
                            measureWidth={CELL_W - 12}
                            height={CELL_H}
                            showClef
                          />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
