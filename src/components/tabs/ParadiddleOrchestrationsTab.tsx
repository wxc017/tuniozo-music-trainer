// ── Paradiddle Orchestrations ──────────────────────────────────────
// A flat, ordered list of the musical LINEAR VOICINGS of the single paradiddle
// (RLRR): each tile is a 4-stroke cell where every stroke is one of
// {snare, hi-hat, hi-hat-pedal, bass}, rendered as real 16th-note drum
// notation.  No sticking columns, no R/L labels — just the raw voicings,
// ordered left-to-right by minimal change from the previous one.
//
// See src/lib/paradiddleOrchestrations.ts for the theory.

import { VexDrumStrip } from "@/components/VexDrumNotation";
import { VOICINGS, voicingToPattern, toStripMeasure, columnWidth } from "@/lib/paradiddleOrchestrations";

const CELL_H = 150;
const CELL_W = columnWidth(4);

export default function ParadiddleOrchestrationsTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-widest text-[#d4a050] uppercase">
          Paradiddle linear voicings
        </h3>
        <span className="text-[10px] text-[#666]">
          {VOICINGS.length} voicings · single paradiddle · 16th notes · ordered by minimal change
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {VOICINGS.map(v => (
          <div
            key={v.id}
            className="rounded border border-[#1f1f1f] bg-[#0e0e0e] flex flex-col items-center"
            style={{ width: CELL_W + 14 }}
            title={v.label}
          >
            <VexDrumStrip
              measures={[toStripMeasure(voicingToPattern(v))]}
              measureWidth={CELL_W}
              height={CELL_H}
              staveY={44}
              showClef
            />
            <div className="pb-1 font-mono text-[11px] text-[#bbb]">{v.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
