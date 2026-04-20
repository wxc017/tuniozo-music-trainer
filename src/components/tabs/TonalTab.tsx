import { useState } from "react";
import { useLS } from "@/lib/storage";
import ComparisonPanel from "../tonal/ComparisonPanel";
import FunctionIdPanel from "../tonal/FunctionIdPanel";
import ChordLoopsPanel from "../tonal/ChordLoopsPanel";
import ModulationPanel from "../tonal/ModulationPanel";

interface Props {
  tonicPc: number;
  lowestOct: number;
  highestOct: number;
  edo: number;
  onHighlight: (pcs: number[]) => void;
  responseMode: string;
  onResult: (text: string) => void;
  onPlay: (optionKey: string, label: string) => void;
  lastPlayed: React.MutableRefObject<{ frames: number[][]; info: string } | null>;
  ensureAudio: () => Promise<void>;
  playVol?: number;
  onAnswer?: (optionKey: string, label: string, correct: boolean) => void;
}

type SubMode = "comparison" | "function_id" | "chord_loops" | "modulation";

const SUB_MODE_LABELS: Record<SubMode, string> = {
  comparison: "Comparison",
  function_id: "Function ID",
  chord_loops: "Chord Loops",
  modulation: "Modulation",
};

const SUB_MODE_DESC: Record<SubMode, string> = {
  comparison: "Same/different tonality, higher/lower, contour",
  function_id: "Tonic / Subdominant / Dominant identification",
  chord_loops: "Identify chord loops (I-V-vi-IV etc.)",
  modulation: "Detect modulations and outside notes",
};

export default function TonalTab(props: Props) {
  const [subMode, setSubMode] = useLS<SubMode>("lt_tonal_subMode", "comparison");

  return (
    <div className="space-y-4">
      {/* Sub-mode tabs */}
      <div className="flex gap-1 flex-wrap">
        {(Object.keys(SUB_MODE_LABELS) as SubMode[]).map(m => (
          <button
            key={m}
            onClick={() => setSubMode(m)}
            title={SUB_MODE_DESC[m]}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              border: `1px solid ${m === subMode ? "#7173e6" : "#222"}`,
              background: m === subMode ? "#1a1a2e" : "#111",
              color: m === subMode ? "#9999ee" : "#666",
              fontSize: 12,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {SUB_MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {subMode === "comparison" && <ComparisonPanel {...props} />}
      {subMode === "function_id" && <FunctionIdPanel {...props} />}
      {subMode === "chord_loops" && <ChordLoopsPanel {...props} />}
      {subMode === "modulation" && <ModulationPanel {...props} />}
    </div>
  );
}
