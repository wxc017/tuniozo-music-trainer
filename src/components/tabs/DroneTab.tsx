import { useState, useEffect, useRef } from "react";
import { audioEngine } from "@/lib/audioEngine";
import {
  strictWindowBounds, fitChordIntoWindow, randomChoice,
  VOICING_TYPES, applyVoicing,
  checkLowIntervalLimits, formatLilWarnings,
} from "@/lib/musicTheory";
import { getChordDroneTypes, getIntervalNames, getDegreeMap } from "@/lib/edoData";
import { useLS, registerKnownOption, unregisterKnownOptionsForPrefix } from "@/lib/storage";
import { weightedRandomChoice, recordAnswer } from "@/lib/stats";
import type { TabSettingsSnapshot } from "@/App";

interface Props {
  tonicPc: number;
  lowestOct: number;
  highestOct: number;
  edo: number;
  onHighlight: (pcs: number[]) => void;
  onResult: (text: string) => void;
  onPlay: (optionKey: string, label: string) => void;
  lastPlayed: React.MutableRefObject<{frames: number[][]; info: string} | null>;
  ensureAudio: () => Promise<void>;
  onDroneStateChange?: (active: boolean) => void;
  onAnswer?: (optionKey: string, label: string, correct: boolean) => void;
  tabSettingsRef?: React.MutableRefObject<TabSettingsSnapshot | null>;
}

const DURATION_OPTIONS = ["1","2","3","4","5"];
type PlayMode = "After drone" | "Over drone";

interface ChromDeg { key: string; label: string; step: number; }

function getChromDegrees(edo: number): ChromDeg[] {
  const dm = getDegreeMap(edo);
  const byStep = new Map<number, string[]>();
  for (const [name, step] of Object.entries(dm)) {
    if (step < 0 || step >= edo) continue;
    if (!byStep.has(step)) byStep.set(step, []);
    byStep.get(step)!.push(name);
  }
  return Array.from(byStep.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([step, names]) => {
      const sorted = [...names].sort((a, b) => {
        const rank = (s: string) => s.startsWith("b") ? 0 : s.startsWith("#") ? 1 : -1;
        return rank(a) - rank(b);
      });
      return { key: sorted[0], label: sorted.join("/"), step };
    });
}

interface DroneParams {
  chordAbs: number[];
  droneRoot: number;
  ivlNote: number | null;
  ivlName: string | null;
  droneVol: number;
  ivlVol: number;
  dur: number;
  playMode: PlayMode;
}

export default function DroneTab({
  tonicPc, lowestOct, highestOct, edo, onHighlight, onResult, onPlay, lastPlayed, ensureAudio, onDroneStateChange, onAnswer, tabSettingsRef,
}: Props) {
  const [checkedChords, setCheckedChords] = useLS<Set<string>>("lt_drn_chords",
    new Set(["Major Triad","Dominant 7"])
  );
  const chromDegrees = getChromDegrees(edo);
  const [checkedDegrees, setCheckedDegrees] = useLS<Set<string>>("lt_drn_degrees_v2",
    new Set<string>(["1"])
  );
  const [voicingType, setVoicingType] = useLS<string>("lt_drn_voicing", "Close");
  const [checkedIvls, setCheckedIvls] = useLS<Set<number>>("lt_drn_ivls", new Set());
  const [duration, setDuration] = useLS<string>("lt_drn_duration", "4");
  const [playMode, setPlayMode] = useLS<PlayMode>("lt_drn_playMode", "After drone");
  const [droneVol, setDroneVol] = useLS<number>("lt_drn_vol", 0.12);
  const [ivlVol, setIvlVol] = useLS<number>("lt_drn_ivl_vol", 0.65);
  const [droneActive, setDroneActive] = useState(false);
  const [droneLabel, setDroneLabel] = useState("");
  const [showTarget, setShowTarget] = useState<string | null>(null);
  const [hasPlayed, setHasPlayed] = useState(false);
  const lastDroneParams = useRef<DroneParams | null>(null);

  const ivlNames = getIntervalNames(edo);

  useEffect(() => {
    unregisterKnownOptionsForPrefix("drn:");
    Array.from(checkedChords).forEach(chord => {
      registerKnownOption(`drn:${chord}`, `Drone: ${chord}`);
    });
    Array.from(checkedIvls).forEach(idx => {
      const name = ivlNames[idx] ?? `Step ${idx}`;
      registerKnownOption(`drn:ivl:${idx}`, `Drone Interval: ${name}`);
    });
    return () => unregisterKnownOptionsForPrefix("drn:");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedChords, checkedIvls, edo]);

  // Publish settings snapshot for history panel
  useEffect(() => {
    if (!tabSettingsRef) return;
    tabSettingsRef.current = {
      title: "Chord Drone",
      groups: [
        { label: "Chords", items: Array.from(checkedChords) },
        { label: "Root Degrees", items: Array.from(checkedDegrees) },
        { label: "Intervals", items: Array.from(checkedIvls).map(i => ivlNames[i] ?? `Step ${i}`) },
        { label: "Settings", items: [`Voicing: ${voicingType}`, `Duration: ${duration}s`, `Play: ${playMode}`] },
      ],
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedChords, checkedDegrees, checkedIvls, voicingType, duration, playMode, tabSettingsRef]);

  const toggle = <T,>(set: Set<T>, val: T): Set<T> => {
    const n = new Set(set); if (n.has(val)) n.delete(val); else n.add(val); return n;
  };

  const showSequential = (params: DroneParams) => {
    const { chordAbs, ivlNote, dur, playMode } = params;
    if (ivlNote === null) {
      onHighlight(chordAbs);
      setTimeout(() => onHighlight([]), dur + 500);
      return;
    }
    if (playMode === "Over drone") {
      onHighlight(chordAbs);
      setTimeout(() => onHighlight([...chordAbs, ivlNote]), Math.floor(dur / 2));
      setTimeout(() => onHighlight([]), dur + 500);
    } else {
      onHighlight(chordAbs);
      setTimeout(() => onHighlight([]), dur);
      setTimeout(() => onHighlight([ivlNote]), dur + 400);
      setTimeout(() => onHighlight([]), dur + 2500);
    }
  };

  const handleVolChange = (v: number) => {
    setDroneVol(v);
    if (droneActive) audioEngine.setDroneGain(v);
  };

  const startDrone = async () => {
    await ensureAudio();
    if (!checkedChords.size) { onResult("Select at least one drone chord type."); return; }
    if (!checkedDegrees.size) { onResult("Select at least one degree."); return; }

    const chordName = weightedRandomChoice(Array.from(checkedChords), c => `drn:${c}`);
    const degKey    = randomChoice(Array.from(checkedDegrees));
    const degName   = chromDegrees.find(d => d.key === degKey)?.label ?? degKey;
    const degStep   = getDegreeMap(edo)[degKey] ?? 0;

    const shape = getChordDroneTypes(edo)[chordName];
    const [low, high] = strictWindowBounds(tonicPc, edo, lowestOct, highestOct);

    // Place drone root (tonicPc + degree offset) in the mid-register window
    const midOct = lowestOct + Math.floor((highestOct - lowestOct) / 2);
    let droneRoot = tonicPc + degStep + (midOct - 4) * edo;
    while (droneRoot >= high) droneRoot -= edo;
    while (droneRoot < low)  droneRoot += edo;

    const rawChord = shape.map(s => droneRoot + s);
    let chordAbs = fitChordIntoWindow(rawChord, edo, low, high);
    if (!chordAbs.length) { onResult("Chord doesn't fit in register window."); return; }

    // Apply voicing
    const voiced = applyVoicing(chordAbs, edo, voicingType);
    if (voiced.length === chordAbs.length) chordAbs = voiced;

    // Pick interval relative to drone root
    let ivlNote: number | null = null;
    let ivlName: string | null = null;
    let ivlIdx: number | null = null;
    if (checkedIvls.size) {
      ivlIdx = weightedRandomChoice(Array.from(checkedIvls), i => `drn:ivl:${i}`);
      ivlName = ivlNames[ivlIdx] ?? `Step ${ivlIdx}`;
      let n = droneRoot + ivlIdx;
      while (n >= high) n -= edo;
      while (n < low)  n += edo;
      if (n >= low && n < high) ivlNote = n;
    }

    const dur = parseInt(duration) * 1000;
    const label = `${degName} — ${chordName}`;
    const params: DroneParams = { chordAbs, droneRoot, ivlNote, ivlName, droneVol, ivlVol, dur, playMode };
    lastDroneParams.current = params;

    const frames = [chordAbs, ...(ivlNote !== null ? [[ivlNote]] : [])];
    const lilWarn = formatLilWarnings(checkLowIntervalLimits(chordAbs, edo), edo);
    const info = [`Drone: ${label}`, ivlNote !== null ? `Interval: ${ivlName}` : "", lilWarn].filter(Boolean).join("\n");
    lastPlayed.current = { frames, info };
    setHasPlayed(true);

    setDroneActive(true);
    setDroneLabel(label);
    setShowTarget(null);
    onDroneStateChange?.(true);
    onResult(`Chord Drone: ${label}`);
    onPlay(`drn:${chordName}`, `Drone: ${label}`);
    if (ivlIdx !== null && ivlName !== null) {
      recordAnswer(`drn:ivl:${ivlIdx}`, `Drone Interval: ${ivlName}`, true);
      onAnswer?.(`drn:ivl:${ivlIdx}`, `Drone Interval: ${ivlName}`, true);
    }

    audioEngine.startDrone(chordAbs, edo, droneVol);

    if (playMode === "Over drone" && ivlNote !== null) {
      setTimeout(() => { audioEngine.playNote(ivlNote!, edo, 1.5, ivlVol); }, Math.floor(dur / 2));
    }

    setTimeout(() => {
      audioEngine.stopDrone();
      setDroneActive(false);
      onDroneStateChange?.(false);
      if (playMode === "After drone" && ivlNote !== null) {
        setTimeout(() => { audioEngine.playNote(ivlNote!, edo, 1.5, ivlVol); }, 300);
      }
    }, dur);
  };

  const stopDrone = () => {
    audioEngine.stopDrone();
    setDroneActive(false);
    onDroneStateChange?.(false);
    onHighlight([]);
  };

  const replay = () => {
    const params = lastDroneParams.current;
    if (!params) return;
    const { chordAbs, ivlNote, droneVol: dv, ivlVol: iv, dur, playMode } = params;
    showSequential(params);
    audioEngine.startDrone(chordAbs, edo, dv);
    if (playMode === "Over drone" && ivlNote !== null) {
      setTimeout(() => audioEngine.playNote(ivlNote!, edo, 1.5, iv), Math.floor(dur / 2));
    }
    setTimeout(() => {
      audioEngine.stopDrone();
      if (playMode === "After drone" && ivlNote !== null) {
        setTimeout(() => audioEngine.playNote(ivlNote!, edo, 1.5, iv), 300);
      }
    }, dur);
  };

  const showOnKeyboard = () => {
    const params = lastDroneParams.current;
    if (!params) return;
    showSequential(params);
  };
  void showOnKeyboard;

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#666]">
        A sustained drone chord plays on a random scale degree; a random interval note sounds over or after it.
      </p>

      {/* Controls row */}
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="text-xs text-[#888] block mb-1">Duration (sec)</label>
          <select value={duration} onChange={e => setDuration(e.target.value)}
            className="bg-[#1e1e1e] border border-[#333] rounded px-2 py-1.5 text-sm text-white focus:outline-none">
            {DURATION_OPTIONS.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-[#888] block mb-1">Voicing</label>
          <select value={voicingType} onChange={e => setVoicingType(e.target.value)}
            className="bg-[#1e1e1e] border border-[#333] rounded px-2 py-1.5 text-sm text-white focus:outline-none">
            {VOICING_TYPES.map(v => <option key={v}>{v}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs text-[#888] block mb-1">Interval timing</label>
          <div className="flex rounded overflow-hidden border border-[#333]">
            {(["After drone","Over drone"] as PlayMode[]).map(m => (
              <button key={m} onClick={() => setPlayMode(m)}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  playMode === m ? "bg-[#7173e6] text-white" : "bg-[#1e1e1e] text-[#666] hover:text-[#aaa]"
                }`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-[120px]">
          <label className="text-xs text-[#888] block mb-1">
            Drone vol <span className="text-[#555]">{Math.round(droneVol * 100)}%</span>
          </label>
          <input type="range" min={0.01} max={0.5} step={0.01} value={droneVol}
            onChange={e => handleVolChange(parseFloat(e.target.value))}
            className="w-full accent-[#7173e6]" />
        </div>

        <div className="min-w-[120px]">
          <label className="text-xs text-[#888] block mb-1">
            Interval vol <span className="text-[#555]">{Math.round(ivlVol * 100)}%</span>
          </label>
          <input type="range" min={0.01} max={1.5} step={0.01} value={ivlVol}
            onChange={e => setIvlVol(parseFloat(e.target.value))}
            className="w-full accent-[#7173e6]" />
        </div>
      </div>

      {/* Play controls */}
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={droneActive ? stopDrone : startDrone}
          className={`px-5 py-2 rounded text-sm font-medium transition-colors ${
            droneActive ? "bg-red-700 hover:bg-red-800 text-white" : "bg-[#7173e6] hover:bg-[#5a5cc8] text-white"
          }`}>
          {droneActive ? `⏹ Stop (${droneLabel})` : "▶ Play"}
        </button>
        {hasPlayed && (
          <button onClick={replay}
            className="bg-[#1e1e1e] hover:bg-[#2a2a2a] border border-[#333] text-[#aaa] px-4 py-2 rounded text-sm transition-colors">
            Replay
          </button>
        )}
      </div>


      {showTarget && (
        <div className="bg-[#1a2a1a] border border-[#3a5a3a] rounded p-3 text-sm text-[#8fc88f] font-mono whitespace-pre">{showTarget}</div>
      )}

      {/* Scale degree selector */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <p className="text-xs text-[#555]">Drone degree (random):</p>
          <button onClick={() => setCheckedDegrees(new Set(chromDegrees.map(d => d.key)))}
            className="text-xs text-[#666] hover:text-[#aaa]">All</button>
          <button onClick={() => setCheckedDegrees(new Set<string>(["1"]))}
            className="text-xs text-[#666] hover:text-[#aaa]">Reset</button>
        </div>
        <div className="flex flex-wrap gap-1">
          {chromDegrees.map(deg => (
            <button key={deg.key}
              onClick={() => setCheckedDegrees(toggle(checkedDegrees, deg.key))}
              className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors border ${
                checkedDegrees.has(deg.key)
                  ? "bg-[#1a1a2a] border-[#4a4a8a] text-[#9999ee]"
                  : "bg-[#141414] border-[#2a2a2a] text-[#555] hover:text-[#888]"
              }`}>
              {deg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Drone chord types */}
      <div>
        <p className="text-xs text-[#555] mb-2">Drone Chord Types:</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
          {Object.keys(getChordDroneTypes(edo)).map(name => (
            <label key={name} className={`flex items-center gap-2 px-3 py-2 rounded text-xs cursor-pointer transition-colors ${
              checkedChords.has(name) ? "bg-[#1a1a2a] text-[#9999ee]" : "bg-[#141414] text-[#666] hover:bg-[#1e1e1e]"
            }`}>
              <input type="checkbox" checked={checkedChords.has(name)}
                onChange={() => setCheckedChords(toggle(checkedChords, name))}
                className="accent-[#7173e6]" />
              {name}
            </label>
          ))}
        </div>
      </div>

      {/* Intervals to play over drone */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <p className="text-xs text-[#555]">Intervals over drone (relative to drone root):</p>
          <button onClick={() => setCheckedIvls(new Set(getIntervalNames(edo).map((_,i) => i)))}
            className="text-xs text-[#666] hover:text-[#aaa]">All</button>
          <button onClick={() => setCheckedIvls(new Set())}
            className="text-xs text-[#666] hover:text-[#aaa]">None</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1 max-h-48 overflow-y-auto pr-1">
          {getIntervalNames(edo).map((name, i) => (
            <label key={i} className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
              checkedIvls.has(i) ? "bg-[#1a1a2a] text-[#9999ee]" : "bg-[#141414] text-[#666] hover:bg-[#1e1e1e]"
            }`}>
              <input type="checkbox" checked={checkedIvls.has(i)}
                onChange={() => setCheckedIvls(toggle(checkedIvls, i))}
                className="accent-[#7173e6]" />
              <span className="text-[#444] mr-0.5">{i}</span>{name}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
