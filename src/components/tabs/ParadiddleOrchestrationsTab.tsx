// ── Paradiddle Orchestrations ──────────────────────────────────────
// A matrix of rudiment orchestrations.  COLUMNS = sticking; ROWS = every
// musical orchestration (a voicing style × a diddle/foot treatment).  Each
// cell renders that sticking under that orchestration as real drum notation
// (reusing the Drum-Patterns / Accent-Study VexDrumStrip).
//
// See src/lib/paradiddleOrchestrations.ts for the generative theory.

import { VexDrumStrip } from "@/components/VexDrumNotation";
import {
  STICKINGS, STYLES, TREATMENTS,
  orchestrate, toStripMeasure,
} from "@/lib/paradiddleOrchestrations";

const CELL_W = 220;   // notation tile width
const CELL_H = 120;   // notation tile height

// Every orchestration = one (style, treatment) pair, in a musical reading
// order (group by style, then by treatment within it).
const ORCHESTRATIONS = STYLES.flatMap(style =>
  TREATMENTS.map(treat => ({ style, treat })),
);

export default function ParadiddleOrchestrationsTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-widest text-[#d4a050] uppercase">
          Orchestration matrix
        </h3>
        <span className="text-[10px] text-[#666]">
          columns = sticking · rows = musical orchestration (style · treatment)
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
            {ORCHESTRATIONS.map(({ style, treat }) => (
              <tr key={`${style.id}/${treat.id}`}>
                <th className="sticky left-0 z-10 bg-[#0d0d0d] p-2 text-right align-middle">
                  <div className="text-xs font-semibold text-[#5cbfae] whitespace-nowrap" title={`${style.desc} — ${treat.desc}`}>
                    {style.label}
                  </div>
                  <div className="text-[10px] text-[#888] whitespace-nowrap">{treat.label}</div>
                </th>
                {STICKINGS.map(sk => {
                  const measure = toStripMeasure(orchestrate(sk, style.id, treat.id));
                  return (
                    <td key={sk.id} className="p-1 align-top">
                      <div
                        className="rounded border border-[#1f1f1f] bg-[#0e0e0e]"
                        title={`${sk.label} · ${style.label} · ${treat.label}`}
                      >
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
    </div>
  );
}
