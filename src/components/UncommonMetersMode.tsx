// ── UncommonMetersMode: standalone top-level mode for uncommon meters ──

import { useState, useEffect } from "react";
import { useLS } from "@/lib/storage";
import { rhythmAudio } from "@/lib/rhythmAudio";
import UncommonMetersPanel from "./rhythm/UncommonMetersPanel";

export default function UncommonMetersMode() {
  const [bpm, setBpm] = useLS<number>("lt_rhy_wts_bpm", 90);
  const [volume, setVolume] = useLS<number>("lt_rhy_wts_vol", 0.7);

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
          Unusual Meters & Time Systems
        </h2>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-[#666]">BPM</label>
          <input
            type="number"
            min={40}
            max={200}
            value={bpm || ""}
            onChange={e => {
              const v = parseInt(e.target.value, 10);
              setBpm(isNaN(v) ? 0 : v);
            }}
            onBlur={() => setBpm(prev => Math.max(40, Math.min(200, prev || 90)))}
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

      {/* Panel content */}
      <UncommonMetersPanel bpm={bpm} />
    </div>
  );
}
