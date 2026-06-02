// ── Paradiddle Orchestrations ──────────────────────────────────────
// COLUMNS = sticking; ROWS = musical orchestration.  Each cell renders that
// sticking under that scheme as real 16th-note drum notation (one voice per
// stroke, no rests, beamed as one group).  Beneath the notation, two R/L rows
// (the sticking + its hand-swapped mirror) are pinned to the actual notehead
// x-positions; a bass stroke shows no hand.
//
// See src/lib/paradiddleOrchestrations.ts for the theory + sources.

import { useState } from "react";
import { VexDrumStrip } from "@/components/VexDrumNotation";
import {
  STICKINGS, SCHEMES, orchestrate, toStripMeasure, isEmptyPattern,
  columnWidth, mirrorHand, type Pattern,
} from "@/lib/paradiddleOrchestrations";

const CELL_H = 120;

// One matrix cell.  Captures the rendered notehead x-positions (per slot) from
// VexDrumStrip and pins the two R/L label rows under them so the stickings sit
// exactly below each note.
function OrchestrationCell({ pattern, width }: { pattern: Pattern; width: number }) {
  const [slotX, setSlotX] = useState<Record<number, number>>({});
  const slots = pattern.slots ?? pattern.strokes.map((_, i) => i);
  // Hand (R/L) per slot — only for strokes played by a HAND.  A pure foot
  // stroke (bass or hi-hat pedal alone) shows no letter; a hand+foot stack
  // (e.g. snare + pedal) still shows the hand.
  const isHandVoice = (v: string) => v === "hh" || v === "tap" || v === "buzz";
  const handBySlot = new Map<number, "R" | "L">();
  pattern.strokes.forEach((s, i) => {
    if (s.voices.some(isHandVoice)) handBySlot.set(slots[i], s.hand);
  });

  return (
    <div className="relative" style={{ width: width + 40 }}>
      <VexDrumStrip
        measures={[toStripMeasure(pattern)]}
        measureWidth={width}
        height={CELL_H}
        showClef
        onNoteSlotPositions={(positions) => {
          const next: Record<number, number> = {};
          for (const p of positions) next[p.slot] = p.x;
          // Avoid an update loop: only set when something actually changed.
          setSlotX(prev => {
            const same = Object.keys(next).length === Object.keys(prev).length &&
              Object.entries(next).every(([k, v]) => prev[+k] === v);
            return same ? prev : next;
          });
        }}
      />
      {/* Two label rows pinned to notehead x-positions. */}
      <div className="relative" style={{ height: 28 }}>
        {[0, 1].map(rowIdx => (
          [...handBySlot.keys()].map(slot => {
            const x = slotX[slot];
            if (x === undefined) return null;
            const hand = handBySlot.get(slot)!;
            const label = rowIdx === 0 ? hand : mirrorHand(hand);
            return (
              <span
                key={`${rowIdx}-${slot}`}
                className={`absolute font-mono text-[11px] ${rowIdx === 0 ? "text-[#ddd]" : "text-[#777]"}`}
                style={{ left: x, top: rowIdx * 13, transform: "translateX(-50%)" }}
              >
                {label}
              </span>
            );
          })
        ))}
      </div>
    </div>
  );
}

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
                <th key={sk.id} className="p-2 text-center align-bottom" style={{ minWidth: colW[i] + 40 }}>
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
                        style={{ minHeight: CELL_H + 30, minWidth: colW[i] + 44 }}
                        title={`${sk.label} · ${scheme.label}`}
                      >
                        {empty
                          ? <span className="text-[10px] text-[#444]">—</span>
                          : <OrchestrationCell pattern={pattern} width={colW[i]} />}
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
