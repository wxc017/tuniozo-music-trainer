// ── Paradiddle Orchestrations ──────────────────────────────────────
// COLUMNS = sticking; ROWS = musical orchestration.  Each cell renders that
// sticking under that scheme as real 16th-note drum notation (one voice per
// stroke).  Cells that aren't musical are left empty on purpose.
//
// See src/lib/paradiddleOrchestrations.ts for the theory.

import { VexDrumStrip } from "@/components/VexDrumNotation";
import {
  STICKINGS, SCHEMES, orchestrate, toStripMeasure, isEmptyPattern, columnWidth,
} from "@/lib/paradiddleOrchestrations";

const CELL_H = 170;   // tall enough for stem-down bass + accents above the beam

export default function ParadiddleOrchestrationsTab() {
  // Per-column widths so 4-stroke cells aren't stretched and 12-stroke cells
  // aren't crushed.
  const colW = STICKINGS.map(sk => columnWidth(sk.pattern.length));

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
              {STICKINGS.map((sk, i) => (
                <th key={sk.id} className="p-2 text-center align-bottom" style={{ minWidth: colW[i] + 14 }}>
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
                {STICKINGS.map((sk, i) => {
                  const pattern = orchestrate(sk, scheme);
                  const empty = isEmptyPattern(pattern);
                  return (
                    <td key={sk.id} className="p-1 align-top">
                      <div
                        className="rounded border border-[#1f1f1f] bg-[#0e0e0e] flex items-center justify-center"
                        style={{ minHeight: CELL_H, minWidth: colW[i] + 14 }}
                        title={`${sk.label} · ${scheme.label}`}
                      >
                        {empty ? (
                          <span className="text-[10px] text-[#444]">—</span>
                        ) : (
                          <VexDrumStrip
                            measures={[toStripMeasure(pattern)]}
                            measureWidth={colW[i]}
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
