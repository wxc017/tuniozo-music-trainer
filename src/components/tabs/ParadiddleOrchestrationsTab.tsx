// ── Paradiddle Orchestrations ──────────────────────────────────────
// A flat, ordered list of the musical LINEAR VOICINGS of the single paradiddle
// (RLRR): each tile is a 4-stroke cell where every stroke is one of
// {snare, hi-hat, hi-hat-pedal, bass}, rendered as real 16th-note drum
// notation.  No sticking columns, no R/L labels — just the raw voicings,
// ordered left-to-right by minimal change from the previous one.
//
// See src/lib/paradiddleOrchestrations.ts for the theory.

import { VexDrumStrip } from "@/components/VexDrumNotation";
import { useLS } from "@/lib/storage";
import { VOICINGS, voicingToPattern, toStripMeasure, columnWidth, type Voice, type Voicing } from "@/lib/paradiddleOrchestrations";

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
  // Disliked/deleted voicings, persisted across sessions (keyed by voicing id).
  const [deleted, setDeleted] = useLS<Record<string, boolean>>("lt_po_deleted", {});
  // When on, show the deleted voicings instead of the kept ones (so you can
  // review / restore them).
  const [showDeleted, setShowDeleted] = useLS<boolean>("lt_po_showdeleted", false);

  const isDeleted = (v: Voicing) => !!deleted[v.id];
  const toggle = (id: string) =>
    setDeleted(prev => {
      const next = { ...prev };
      if (next[id]) delete next[id]; else next[id] = true;
      return next;
    });

  const deletedCount = VOICINGS.filter(isDeleted).length;
  const visible = (v: Voicing) => showDeleted ? isDeleted(v) : !isDeleted(v);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-widest text-[#d4a050] uppercase">
          Paradiddle linear voicings
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[#666]">
            {VOICINGS.length - deletedCount} kept · {deletedCount} removed
          </span>
          <button
            onClick={() => setShowDeleted(s => !s)}
            className={`px-2 py-1 rounded text-[11px] border transition-colors ${
              showDeleted
                ? "bg-[#3a1a1a] border-[#6a3a3a] text-[#e08080]"
                : "bg-[#1a1a1a] border-[#2a2a2a] text-[#888] hover:text-[#ccc] hover:border-[#3a3a3a]"
            }`}
            title="Toggle between the kept voicings and the ones you've removed"
          >
            {showDeleted ? "Viewing removed — back to kept" : `View removed (${deletedCount})`}
          </button>
        </div>
      </div>

      <div className="flex gap-4 items-start overflow-x-auto">
        {COLUMNS.map(col => {
          const items = VOICINGS.filter(v => v.voices[0] === col.voice && visible(v));
          return (
            <div key={col.voice} className="flex flex-col gap-2 flex-shrink-0">
              <div className="text-xs font-semibold text-[#cda6e0] sticky top-0 bg-[#0d0d0d] py-1 z-10">
                {col.label} <span className="text-[#555] font-normal">({items.length})</span>
              </div>
              {items.map(v => (
                <div
                  key={v.id}
                  className="relative rounded border border-[#1f1f1f] bg-[#0e0e0e] overflow-hidden"
                  style={{ width: CELL_W + CLEF_W, height: CELL_H }}
                  title={v.label}
                >
                  {/* Per-cell dislike / restore toggle. */}
                  <button
                    onClick={() => toggle(v.id)}
                    className={`absolute top-1 right-1 z-10 w-5 h-5 rounded inline-flex items-center justify-center text-xs font-bold leading-none border transition-colors ${
                      isDeleted(v)
                        ? "bg-[#143014] border-[#2a5a2a] text-[#6ac44e]"
                        : "bg-[#1a0e0e] border-[#5a2a2a] text-[#cc6666] hover:bg-[#2a1414] hover:text-[#ff8080]"
                    }`}
                    title={isDeleted(v) ? "Restore this voicing" : "Remove this voicing"}
                  >
                    {isDeleted(v) ? "↺" : "✕"}
                  </button>
                  <VexDrumStrip
                    measures={[toStripMeasure(voicingToPattern(v))]}
                    measureWidth={CELL_W}
                    height={CELL_H}
                    staveY={44}
                    showClef
                  />
                </div>
              ))}
              {items.length === 0 && (
                <div className="text-[10px] text-[#444] px-1">—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
