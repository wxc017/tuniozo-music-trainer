// ── Shared TONALITIES section ───────────────────────────────────────
// The collapsible purple TONALITIES picker from Chord Progressions, lifted into
// a reusable component so Intervals and Scalar Permutations show the IDENTICAL
// catalog, layout, and styling (per direct user direction 2026-06-14: "copy and
// paste the tonality section from chords … dont make it look different and allow
// it to be collapsible just like in chords").  Selection is owned by the caller
// (a Set of tonality names); this component only renders + reports toggles.

import { useMemo } from "react";
import { getSizedTonalityBanks } from "@/lib/tonalityBanks";
import { sizedTonalitySections } from "@/lib/tonalityCatalog";
import { formatHalfAccidentals } from "@/lib/edoData";

// Same display-name translation Chord Progressions uses (lookup keys untouched).
const SIZED_ANCHOR_NAME: Record<string, string> = {
  "Subminor Diatonic": "Diatonic Small Minor",
  "Supermajor Diatonic": "Diatonic Large Major",
  "Subharmonic Diatonic M7": "Diatonic Small Minor ♮7",
  "Neutral Diatonic": "Diatonic Neutral",
};
function sizedTonalityName(t: string): string {
  return SIZED_ANCHOR_NAME[t] ?? t
    .replace(/\bSubminor\b/g, "Small Minor")
    .replace(/\bSupermajor\b/g, "Large Major")
    .replace(/\bSubharmonic\b/g, "Small Minor");
}

interface Props {
  edo: number;
  notationSystem?: string;
  /** Selected tonality names (multi-select, like Chord Progressions). */
  selected: Set<string>;
  onToggle: (name: string) => void;
  onClear: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Optional ▶ scale-preview button (matches Chords when provided). */
  onPreview?: (name: string) => void;
  playing?: string | null;
}

export default function TonalitySection({
  edo, notationSystem, selected, onToggle, onClear, collapsed, onToggleCollapsed, onPreview, playing,
}: Props) {
  // Only show tonalities that have a bank for this EDO (same gate as Chords).
  const bankNames = useMemo(() => new Set(getSizedTonalityBanks(edo).map(b => b.name)), [edo]);

  return (
    <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded">
      <div
        onClick={onToggleCollapsed}
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none transition-colors hover:bg-[#161616]"
        style={{ borderLeft: "3px solid #bf6cd0" }}
      >
        <span className="text-[10px] text-[#666] w-3">{collapsed ? "▸" : "▾"}</span>
        <span className="text-xs font-semibold tracking-wider" style={{ color: "#bf6cd0" }}>TONALITIES</span>
        <span className="text-[10px] text-[#555] ml-auto">{selected.size} selected</span>
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="text-[9px] text-[#555] hover:text-[#aaa] border border-[#222] rounded px-2 py-0.5">Clear</button>
      </div>
      {!collapsed && (
        <div className="p-2 space-y-2">
          {sizedTonalitySections(edo).map(section => {
            // Outside 41/53, JI "Diatonic " scale names belong only to the curated
            // 41/53 picker; Small/Large flavours are a Schulter-spectrum concept.
            const stripJiNames = !(edo === 41 || edo === 53);
            const usableFamilies = section.families
              .map(f => ({
                ...f,
                tonalities: f.tonalities
                  .filter(t => bankNames.has(t))
                  .filter(t => !stripJiNames || !t.startsWith("Diatonic "))
                  .filter(t => !notationSystem || notationSystem === "Schulter" || !/^(Small|Large) /.test(t)),
              }))
              .filter(f => f.tonalities.length > 0);
            if (usableFamilies.length === 0) return null;
            return (
              <div key={section.key} className="space-y-1.5">
                <p className="text-[10px] font-bold tracking-widest border-b border-[#1a1a1a] pb-0.5"
                   style={{ color: section.color }}>{section.label}</p>
                {usableFamilies.map(family => (
                  <div key={family.key} className="ml-2">
                    <p className="text-[9px] mb-1 font-medium tracking-wider text-[#666]">{family.label}</p>
                    <div className="flex flex-wrap gap-1">
                      {family.tonalities.map(t => {
                        const on = selected.has(t);
                        return (
                          <span key={t} className="inline-flex items-stretch">
                            <button
                              onClick={() => onToggle(t)}
                              className={`px-2 py-1 text-[10px] ${onPreview ? "rounded-l border-y border-l" : "rounded border"} transition-colors ${
                                on ? "text-white" : "bg-[#111] border-[#2a2a2a] text-[#666] hover:text-[#aaa]"
                              }`}
                              style={on ? { backgroundColor: section.color + "30", borderColor: section.color, color: section.color } : {}}>
                              {formatHalfAccidentals(sizedTonalityName(t), edo)}
                            </button>
                            {onPreview && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onPreview(t); }}
                                disabled={playing === t}
                                title={playing === t ? "Already playing — wait for it to finish" : "Preview scale"}
                                className={`px-1.5 py-1 text-[9px] rounded-r border-y border-r transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                  on ? "" : "bg-[#0a0a0a] border-[#2a2a2a] text-[#555] hover:text-[#aaa]"
                                }`}
                                style={on ? { backgroundColor: section.color + "20", borderColor: section.color, color: section.color } : {}}>
                                ▶
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
