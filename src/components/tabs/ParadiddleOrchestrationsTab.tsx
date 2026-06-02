// ── Paradiddle Orchestrations ──────────────────────────────────────
// COLUMNS = sticking; ROWS = musical orchestration.  Each cell renders that
// sticking under that scheme as real 16th-note drum notation (one voice per
// stroke, no rests, beamed as one group).  Beneath the notation, two R/L rows
// show the sticking and its hand-swapped mirror; a bass stroke shows no hand.
//
// See src/lib/paradiddleOrchestrations.ts for the theory + sources.

import { VexDrumStrip } from "@/components/VexDrumNotation";
import {
  STICKINGS, SCHEMES, orchestrate, toStripMeasure, isEmptyPattern,
  columnWidth, stickingRows,
} from "@/lib/paradiddleOrchestrations";

const CELL_H = 140;   // notation height (no rests/labels → can be shorter)

export default function ParadiddleOrchestrationsTab() {
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
                  const rows = empty ? null : stickingRows(pattern);
                  return (
                    <td key={sk.id} className="p-1 align-top">
                      <div
                        className="rounded border border-[#1f1f1f] bg-[#0e0e0e] flex flex-col items-center justify-center"
                        style={{ minHeight: CELL_H, minWidth: colW[i] + 14 }}
                        title={`${sk.label} · ${scheme.label}`}
                      >
                        {empty ? (
                          <span className="text-[10px] text-[#444]">—</span>
                        ) : (<>
                          <VexDrumStrip
                            measures={[toStripMeasure(pattern)]}
                            measureWidth={colW[i]}
                            height={CELL_H}
                            showClef
                          />
                          {/* Two sticking rows: played hand + hand-swapped
                              mirror, aligned under the evenly-spaced notes.
                              The clef eats ~40px at the head, so offset to match
                              the note area. */}
                          {rows && (
                            <div style={{ width: colW[i], paddingLeft: 40 }} className="pb-1 -mt-2">
                              {[rows.top, rows.mirror].map((rowArr, ri) => (
                                <div key={ri} className="flex">
                                  {rowArr.map((h, si) => (
                                    <span key={si} className={`flex-1 text-center font-mono text-[11px] ${ri === 0 ? "text-[#ddd]" : "text-[#777]"}`}>
                                      {h || " "}
                                    </span>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                        </>)}
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
