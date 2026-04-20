import { useState, useEffect } from "react";
import { useLS } from "@/lib/storage";
import { rhythmAudio } from "@/lib/rhythmAudio";
import ComparisonPanel from "./rhythm/ComparisonPanel";
import MetrePanel from "./rhythm/MetrePanel";
import BeatLayersPanel from "./rhythm/BeatLayersPanel";
import SyllablesPanel from "./rhythm/SyllablesPanel";
import ElongationsRestsPanel from "./rhythm/ElongationsRestsPanel";

type SubMode = "comparison" | "metre" | "layers" | "syllables" | "elongations_rests";

const SUB_MODE_LABELS: Record<SubMode, string> = {
  comparison: "Comparison",
  metre: "Metre",
  layers: "Beat Layers",
  syllables: "Syllables",
  elongations_rests: "Elongations & Rests",
};

const SUB_MODE_DESCRIPTIONS: Record<SubMode, string> = {
  comparison: "Same/different, tempo, beat size, tempo change",
  metre: "Duple, triple, uneven, combined, unpaired grouping",
  layers: "Macrobeat / microbeat / division",
  syllables: "Gordon syllables (Du/de/da/di)",
  elongations_rests: "Ties and rests in duple & triple metre",
};

export default function RhythmEarTraining() {
  const [subMode, setSubMode] = useLS<SubMode>("lt_rhy_subMode", "comparison");
  const [bpm, setBpm] = useLS<number>("lt_rhy_bpm", 90);
  const [volume, setVolume] = useLS<number>("lt_rhy_vol", 0.7);

  useEffect(() => {
    rhythmAudio.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    return () => {
      rhythmAudio.stop();
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-[#888] uppercase tracking-widest">
          Rhythm Spatial Audiation
        </h2>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-[#666]">BPM</label>
          <input
            type="number"
            min={40}
            max={200}
            value={bpm}
            onChange={e => setBpm(Math.max(40, Math.min(200, Number(e.target.value))))}
            className="w-14 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white focus:outline-none text-center"
          />
          <div className="w-px h-4 bg-[#2a2a2a]" />
          <label className="text-xs text-[#666]">Vol</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={e => setVolume(Number(e.target.value))}
            className="w-16 accent-[#7173e6]"
          />
          <span className="text-xs text-[#555] w-7">{Math.round(volume * 100)}%</span>
        </div>
      </div>

      {/* Sub-mode tabs */}
      <div className="flex gap-1 flex-wrap">
        {(Object.keys(SUB_MODE_LABELS) as SubMode[]).map(m => (
          <button
            key={m}
            onClick={() => { rhythmAudio.stop(); setSubMode(m); }}
            title={SUB_MODE_DESCRIPTIONS[m]}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              border: `1.5px solid ${subMode === m ? "#9999ee" : "#222"}`,
              background: subMode === m ? "#9999ee22" : "#111",
              color: subMode === m ? "#9999ee" : "#555",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {SUB_MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Panel content */}
      {subMode === "comparison" && <ComparisonPanel bpm={bpm} />}
      {subMode === "metre" && <MetrePanel bpm={bpm} />}
      {subMode === "layers" && <BeatLayersPanel bpm={bpm} />}
      {subMode === "syllables" && <SyllablesPanel bpm={bpm} />}
      {subMode === "elongations_rests" && <ElongationsRestsPanel bpm={bpm} />}
    </div>
  );
}
