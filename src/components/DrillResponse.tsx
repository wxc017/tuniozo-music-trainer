// ── DrillResponse: listen → identify → feedback training ──
// Three tabs: Gordon Rhythm, Functional Harmony, Tuning

import { useState, useEffect, useCallback, useRef } from "react";
import { useLS } from "@/lib/storage";
import { rhythmAudio } from "@/lib/rhythmAudio";
import { audioEngine } from "@/lib/audioEngine";

// Gordon Rhythm panels
import ComparisonPanel from "./rhythm/ComparisonPanel";
import MetrePanel from "./rhythm/MetrePanel";
import BeatLayersPanel from "./rhythm/BeatLayersPanel";
import SyllablesPanel from "./rhythm/SyllablesPanel";
import ElongationsRestsPanel from "./rhythm/ElongationsRestsPanel";

// Functional Harmony panels
import TonalComparisonPanel from "./tonal/ComparisonPanel";
import FunctionIdPanel from "./tonal/FunctionIdPanel";
import ChordLoopsPanel from "./tonal/ChordLoopsPanel";
import ModulationPanel from "./tonal/ModulationPanel";
// Tuning panel
import TuningTab from "./tabs/TuningTab";

// Drone
import DrillDroneStrip from "./DrillDroneStrip";


type TopTab = "gordon" | "harmony" | "tuning";

// ── Gordon rhythm sub-modes ──────────────────────────────────────────

type RhythmSubMode = "comparison" | "metre" | "layers" | "syllables" | "elongations_rests";

const RHYTHM_SUB_LABELS: Record<RhythmSubMode, string> = {
  comparison: "Comparison",
  metre: "Metre",
  layers: "Beat Layers",
  syllables: "Syllables",
  elongations_rests: "Elongations & Rests",
};

const RHYTHM_SUB_DESC: Record<RhythmSubMode, string> = {
  comparison: "Same/different, tempo, beat size, tempo change",
  metre: "Duple, triple, uneven, combined, unpaired grouping",
  layers: "Macrobeat / microbeat / division",
  syllables: "Gordon syllables (Du/de/da/di)",
  elongations_rests: "Ties and rests in duple & triple metre",
};

// ── Harmony sub-modes ────────────────────────────────────────────────

type HarmonySubMode = "comparison" | "function_id" | "chord_loops" | "modulation";

const HARMONY_SUB_LABELS: Record<HarmonySubMode, string> = {
  comparison: "Comparison",
  function_id: "Function ID",
  chord_loops: "Chord Loops",
  modulation: "Modulation",
};

const HARMONY_SUB_DESC: Record<HarmonySubMode, string> = {
  comparison: "Same/different tonality, higher/lower, contour",
  function_id: "Tonic / Subdominant / Dominant identification",
  chord_loops: "Identify chord loops (I-V-vi-IV etc.)",
  modulation: "Detect modulations and outside notes",
};

export default function DrillResponse() {
  const [topTab, setTopTab] = useLS<TopTab>("lt_drill_tab", "gordon");
  const [rhythmSub, setRhythmSub] = useLS<RhythmSubMode>("lt_rhy_subMode", "comparison");
  const [harmonySub, setHarmonySub] = useLS<HarmonySubMode>("lt_tonal_subMode", "comparison");

  // Shared audio controls
  const [bpm, setBpm] = useLS<number>("lt_rhy_bpm", 90);
  const [volume, setVolume] = useLS<number>("lt_rhy_vol", 0.7);

  // Tonal params
  const [tonicPc, setTonicPc] = useLS<number>("lt_drill_tonic", 0);
  const [edo, setEdo] = useLS<number>("lt_app_edo", 12);
  const [lowestOct, setLowestOct] = useLS<number>("lt_drill_lowOct", 3);
  const [highestOct, setHighestOct] = useLS<number>("lt_drill_highOct", 5);
  const [playVol, setPlayVol] = useLS<number>("lt_drill_playVol", 0.7);
  const [audioReady, setAudioReady] = useState(false);
  const lastPlayed = useRef<{ frames: number[][]; info: string } | null>(null);

  const ensureAudio = useCallback(async () => {
    if (!audioReady) {
      await audioEngine.init(edo);
      audioEngine.setPlayGain(playVol);
      setAudioReady(true);
    } else {
      audioEngine.resume();
    }
  }, [audioReady, playVol, edo]);

  useEffect(() => {
    rhythmAudio.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    return () => { rhythmAudio.stop(); };
  }, []);

  // No-op handlers for tonal panels (no keyboard in this standalone view)
  const noop = useCallback(() => {}, []);
  const noopPcs = useCallback((_pcs: number[]) => {}, []);
  const noopPlay = useCallback((_k: string, _l: string) => {}, []);
  const noopResult = useCallback((_t: string) => {}, []);

  const tonalProps = {
    tonicPc,
    lowestOct,
    highestOct,
    edo,
    onHighlight: noopPcs,
    responseMode: "Play Audio",
    onResult: noopResult,
    onPlay: noopPlay,
    lastPlayed,
    ensureAudio,
    playVol,
  };

  return (
    <div className="max-w-4xl mx-auto py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-[#888] uppercase tracking-widest">
          Drill & Response
        </h2>
        <div className="flex items-center gap-2 ml-auto">
          {topTab === "gordon" && (
            <>
              <label className="text-xs text-[#666]">BPM</label>
              <input
                type="number" min={40} max={200} value={bpm}
                onChange={e => setBpm(Math.max(40, Math.min(200, Number(e.target.value))))}
                className="w-14 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white focus:outline-none text-center"
              />
              <div className="w-px h-4 bg-[#2a2a2a]" />
            </>
          )}
          <label className="text-xs text-[#666]">Vol</label>
          <input
            type="range" min={0} max={1} step={0.05}
            value={topTab === "gordon" ? volume : playVol}
            onChange={e => {
              const v = Number(e.target.value);
              if (topTab === "gordon") setVolume(v);
              else { setPlayVol(v); audioEngine.setPlayGain(v); }
            }}
            className="w-16 accent-[#7173e6]"
          />
          <span className="text-xs text-[#555] w-7">
            {Math.round((topTab === "gordon" ? volume : playVol) * 100)}%
          </span>
        </div>
      </div>

      {/* Top tabs — underline style like Drum Patterns */}
      <div className="flex border-b border-[#1a1a1a]">
        <button
          onClick={() => { rhythmAudio.stop(); setTopTab("gordon"); }}
          style={{
            padding: "8px 16px", fontSize: 10, fontWeight: 700, letterSpacing: 3,
            textTransform: "uppercase" as const, cursor: "pointer", border: "none",
            borderBottom: topTab === "gordon" ? "2px solid #9999ee" : "2px solid transparent",
            background: topTab === "gordon" ? "#0e0e14" : "transparent",
            color: topTab === "gordon" ? "#9999ee" : "#3a3a3a",
          }}
        >
          Gordon Rhythm
        </button>
        <button
          onClick={() => { rhythmAudio.stop(); setTopTab("harmony"); }}
          style={{
            padding: "8px 16px", fontSize: 10, fontWeight: 700, letterSpacing: 3,
            textTransform: "uppercase" as const, cursor: "pointer", border: "none",
            borderBottom: topTab === "harmony" ? "2px solid #c8aa50" : "2px solid transparent",
            background: topTab === "harmony" ? "#0e0e08" : "transparent",
            color: topTab === "harmony" ? "#c8aa50" : "#3a3a3a",
          }}
        >
          Functional Harmony
        </button>
        <button
          onClick={() => { rhythmAudio.stop(); setTopTab("tuning"); }}
          style={{
            padding: "8px 16px", fontSize: 10, fontWeight: 700, letterSpacing: 3,
            textTransform: "uppercase" as const, cursor: "pointer", border: "none",
            borderBottom: topTab === "tuning" ? "2px solid #55aa88" : "2px solid transparent",
            background: topTab === "tuning" ? "#0e140e" : "transparent",
            color: topTab === "tuning" ? "#55aa88" : "#3a3a3a",
          }}
        >
          Tuning
        </button>
      </div>

      {/* Drone strip with tonic + EDO controls */}
      <DrillDroneStrip
        tonicPc={tonicPc} setTonicPc={setTonicPc}
        edo={edo} setEdo={setEdo}
        lowestOct={lowestOct} highestOct={highestOct}
        ensureAudio={ensureAudio}
        onEdoChange={() => setAudioReady(false)}
      />

      {/* ── Gordon Rhythm ── */}
      {topTab === "gordon" && (
        <div className="space-y-4">
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(RHYTHM_SUB_LABELS) as RhythmSubMode[]).map(m => (
              <button
                key={m}
                onClick={() => { rhythmAudio.stop(); setRhythmSub(m); }}
                title={RHYTHM_SUB_DESC[m]}
                style={{
                  padding: "6px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: `1.5px solid ${rhythmSub === m ? "#9999ee" : "#222"}`,
                  background: rhythmSub === m ? "#9999ee22" : "#111",
                  color: rhythmSub === m ? "#9999ee" : "#555",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                {RHYTHM_SUB_LABELS[m]}
              </button>
            ))}
          </div>
          {rhythmSub === "comparison" && <ComparisonPanel bpm={bpm} />}
          {rhythmSub === "metre" && <MetrePanel bpm={bpm} />}
          {rhythmSub === "layers" && <BeatLayersPanel bpm={bpm} />}
          {rhythmSub === "syllables" && <SyllablesPanel bpm={bpm} />}
          {rhythmSub === "elongations_rests" && <ElongationsRestsPanel bpm={bpm} />}
        </div>
      )}

      {/* ── Functional Harmony ── */}
      {topTab === "harmony" && (
        <div className="space-y-4">
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(HARMONY_SUB_LABELS) as HarmonySubMode[]).map(m => (
              <button
                key={m}
                onClick={() => setHarmonySub(m)}
                title={HARMONY_SUB_DESC[m]}
                style={{
                  padding: "6px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: `1.5px solid ${harmonySub === m ? "#c8aa50" : "#222"}`,
                  background: harmonySub === m ? "#c8aa5022" : "#111",
                  color: harmonySub === m ? "#c8aa50" : "#555",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                {HARMONY_SUB_LABELS[m]}
              </button>
            ))}
          </div>
          {harmonySub === "comparison" && <TonalComparisonPanel {...tonalProps} />}
          {harmonySub === "function_id" && <FunctionIdPanel {...tonalProps} />}
          {harmonySub === "chord_loops" && <ChordLoopsPanel {...tonalProps} />}
          {harmonySub === "modulation" && <ModulationPanel {...tonalProps} />}
        </div>
      )}

      {/* ── Tuning ── */}
      {topTab === "tuning" && (
        <div className="space-y-4">
          <TuningTab {...tonalProps} />
        </div>
      )}
    </div>
  );
}
