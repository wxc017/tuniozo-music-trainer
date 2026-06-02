// ── Paradiddle Orchestrations ──────────────────────────────────────
// A flat, ordered list of the musical LINEAR VOICINGS of the single paradiddle
// (RLRR): each tile is a 4-stroke cell where every stroke is one of
// {snare, hi-hat, hi-hat-pedal, bass}, rendered as real 16th-note drum
// notation.  No sticking columns, no R/L labels — just the raw voicings,
// ordered left-to-right by minimal change from the previous one.
//
// See src/lib/paradiddleOrchestrations.ts for the theory.

import { VexDrumStrip } from "@/components/VexDrumNotation";
import { VOICINGS, voicingToPattern, toStripMeasure, columnWidth, type Voice } from "@/lib/paradiddleOrchestrations";

const CELL_H = 150;
const CELL_W = columnWidth(4);
const CLEF_W = 40;   // VexDrumStrip prepends a clef this wide; tile must include it so SVGs don't overlap

// Four columns grouped by the voice the voicing STARTS with.
const COLUMNS: { voice: Voice; label: string }[] = [
  { voice: "hhFoot", label: "Starts: HH Pedal" },
  { voice: "tap",    label: "Starts: Snare" },
  { voice: "bass",   label: "Starts: Bass" },
  { voice: "hh",     label: "Starts: HH" },
];

export default function ParadiddleOrchestrationsTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-widest text-[#d4a050] uppercase">
          Paradiddle linear voicings
        </h3>
        <span className="text-[10px] text-[#666]">
          {VOICINGS.length} voicings · grouped by starting voice
        </span>
      </div>

      <div className="flex gap-4 items-start overflow-x-auto">
        {COLUMNS.map(col => {
          const items = VOICINGS.filter(v => v.voices[0] === col.voice);
          return (
            <div key={col.voice} className="flex flex-col gap-2 flex-shrink-0">
              <div className="text-xs font-semibold text-[#cda6e0] sticky top-0 bg-[#0d0d0d] py-1 z-10">
                {col.label} <span className="text-[#555] font-normal">({items.length})</span>
              </div>
              {items.map(v => (
                <div
                  key={v.id}
                  className="rounded border border-[#1f1f1f] bg-[#0e0e0e] overflow-hidden"
                  style={{ width: CELL_W + CLEF_W, height: CELL_H }}
                  title={v.label}
                >
                  <VexDrumStrip
                    measures={[toStripMeasure(voicingToPattern(v))]}
                    measureWidth={CELL_W}
                    height={CELL_H}
                    staveY={44}
                    showClef
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
