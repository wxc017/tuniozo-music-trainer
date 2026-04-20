// DrillDroneStrip: persistent tonic drone + tonic/EDO controls for drill exercises
import { useEffect, useRef, useCallback } from "react";
import { useLS } from "@/lib/storage";
import { audioEngine } from "@/lib/audioEngine";
import { getEDOIntervals, SUPPORTED_EDOS, pcToNoteNameWithEnharmonic } from "@/lib/edoData";

type DroneMode = "Single" | "Root+5th" | "Tanpura";

interface Props {
  tonicPc: number;
  setTonicPc: (v: number) => void;
  edo: number;
  setEdo: (v: number) => void;
  lowestOct: number;
  highestOct: number;
  ensureAudio: () => Promise<void>;
  onEdoChange?: () => void;
}

export default function DrillDroneStrip({ tonicPc, setTonicPc, edo, setEdo, lowestOct, highestOct, ensureAudio, onEdoChange }: Props) {
  const [droneOn, setDroneOn] = useLS<boolean>("lt_drill_drone_on", false);
  const [droneMode, setDroneMode] = useLS<DroneMode>("lt_drill_drone_mode", "Single");
  const [droneGain, setDroneGain] = useLS<number>("lt_drill_drone_gain", 0.08);
  const [droneOct, setDroneOct] = useLS<number>("lt_drill_drone_oct", 4);
  const wasOn = useRef(false);

  const buildNotes = useCallback((): number[] => {
    const abs = tonicPc + (droneOct - 4) * edo;
    const P5 = getEDOIntervals(edo).P5;
    if (droneMode === "Root+5th") return [abs, abs + P5];
    if (droneMode === "Tanpura") return [abs - edo, abs, abs + P5];
    return [abs];
  }, [tonicPc, edo, droneOct, droneMode]);

  // Start/stop drone when toggle or parameters change
  useEffect(() => {
    if (droneOn) {
      (async () => {
        await ensureAudio();
        audioEngine.startDrone(buildNotes(), edo, droneGain);
        wasOn.current = true;
      })();
    } else {
      if (wasOn.current) {
        audioEngine.stopDrone();
        wasOn.current = false;
      }
    }
  }, [droneOn, tonicPc, edo, droneOct, droneMode, buildNotes, ensureAudio, droneGain]);

  // Update gain in real-time
  useEffect(() => {
    if (droneOn) audioEngine.setDroneGain(droneGain);
  }, [droneGain, droneOn]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wasOn.current) { audioEngine.stopDrone(); wasOn.current = false; }
    };
  }, []);

  const handleToggle = async () => {
    if (!droneOn) {
      await ensureAudio();
    }
    setDroneOn(!droneOn);
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded bg-[#0a0a0a] border border-[#1a1a1a] flex-wrap">
      {/* Tonic */}
      <label className="text-xs text-[#666]">Tonic</label>
      <select
        value={tonicPc}
        onChange={e => setTonicPc(Number(e.target.value))}
        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white focus:outline-none"
      >
        {Array.from({ length: edo }, (_, i) => (
          <option key={i} value={i}>{pcToNoteNameWithEnharmonic(i, edo)}</option>
        ))}
      </select>

      {/* EDO */}
      <label className="text-xs text-[#666]">EDO</label>
      <select
        value={edo}
        onChange={e => { setEdo(Number(e.target.value)); onEdoChange?.(); }}
        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white focus:outline-none"
      >
        {SUPPORTED_EDOS.map(n => <option key={n} value={n}>{n}</option>)}
      </select>

      <div className="w-px h-4 bg-[#2a2a2a]" />

      {/* Drone toggle */}
      <button
        onClick={handleToggle}
        className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors ${
          droneOn
            ? "bg-[#55aa8833] border border-[#55aa88] text-[#55aa88]"
            : "bg-[#111] border border-[#2a2a2a] text-[#555] hover:text-[#888]"
        }`}
      >
        <span className={`inline-block w-2 h-2 rounded-full ${droneOn ? "bg-[#55aa88] shadow-[0_0_4px_#55aa88]" : "bg-[#333]"}`} />
        Drone
      </button>

      {/* Mode */}
      <select
        value={droneMode}
        onChange={e => setDroneMode(e.target.value as DroneMode)}
        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white focus:outline-none"
      >
        <option value="Single">Single</option>
        <option value="Root+5th">Root+5th</option>
        <option value="Tanpura">Tanpura</option>
      </select>

      {/* Octave */}
      <label className="text-xs text-[#666]">Oct</label>
      <select
        value={droneOct}
        onChange={e => setDroneOct(Number(e.target.value))}
        className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white focus:outline-none"
      >
        {[2, 3, 4, 5, 6].map(o => <option key={o} value={o}>{o}</option>)}
      </select>

      {/* Drone gain */}
      <input
        type="range" min={0.01} max={0.3} step={0.005}
        value={droneGain}
        onChange={e => setDroneGain(Number(e.target.value))}
        className="w-14 accent-[#55aa88]"
      />
    </div>
  );
}
