import { useState, useEffect, useRef } from "react";
import { audioEngine } from "@/lib/audioEngine";
import {
  strictWindowBounds, fitChordIntoWindow, randomChoice,
  ALL_VOICING_PATTERNS, applyVoicingPattern,
  checkLowIntervalLimits, formatLilWarnings,
} from "@/lib/musicTheory";
import { getChordDroneTypes, getIntervalNames, getDegreeMap } from "@/lib/edoData";
import { useLS, registerKnownOption, unregisterKnownOptionsForPrefix } from "@/lib/storage";
import { weightedRandomChoice, recordAnswer } from "@/lib/stats";
import type { TabSettingsSnapshot } from "@/App";

const ROOT_VOICING_PATTERNS = ALL_VOICING_PATTERNS.filter(p => p.group === "Root Position");

interface ChromDeg { key: string; label: string; step: number; }

// Walk the EDO's degree map and bucket each step into "1", "b2/2/#2", etc.
// so the user can pick any chromatic root degree (not just diatonic 1–7).
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
  const [checkedVoicings, setCheckedVoicings] = useLS<Set<string>>("lt_drn_voicings",
    new Set(["t-135", "7-1357"])
  );
  const [checkedDegrees, setCheckedDegrees] = useLS<Set<string>>("lt_drn_degrees_v2",
    new Set<string>(["1"])
  );
  const [checkedIvls, setCheckedIvls] = useLS<Set<number>>("lt_drn_ivls", new Set());
  const chromDegrees = getChromDegrees(edo);
  const [duration, setDuration] = useLS<string>("lt_drn_duration", "4");
  const [playMode, setPlayMode] = useLS<PlayMode>("lt_drn_playMode", "After drone");
  const [droneVol, setDroneVol] = useLS<number>("lt_drn_vol", 0.12);
  const [ivlVol, setIvlVol] = useLS<number>("lt_drn_ivl_vol", 0.65);
  const [droneActive, setDroneActive] = useState(false);
  const [droneLabel, setDroneLabel] = useState("");
  const [answerText, setAnswerText] = useState<string | null>(null);
  const [answerVisible, setAnswerVisible] = useState(false);
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
        { label: "Voicings", items: ROOT_VOICING_PATTERNS.filter(p => checkedVoicings.has(p.id)).map(p => p.label) },
        { label: "Intervals", items: Array.from(checkedIvls).map(i => ivlNames[i] ?? `Step ${i}`) },
        { label: "Settings", items: [`Duration: ${duration}s`, `Play: ${playMode}`] },
      ],
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedChords, checkedDegrees, checkedVoicings, checkedIvls, duration, playMode, tabSettingsRef]);

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
    if (!checkedDegrees.size) { onResult("Select at least one scale degree."); return; }

    const chordName = weightedRandomChoice(Array.from(checkedChords), c => `drn:${c}`);
    const degKey  = randomChoice(Array.from(checkedDegrees));
    const degInfo = chromDegrees.find(d => d.key === degKey);
    const degLabel = degInfo?.label ?? degKey;
    const degStep  = degInfo?.step ?? (getDegreeMap(edo)[degKey] ?? 0);

    const shape = getChordDroneTypes(edo)[chordName];
    const [low, high] = strictWindowBounds(tonicPc, edo, lowestOct, highestOct);

    // Place drone root at (tonic + selected degree offset), mid-register
    const midOct = lowestOct + Math.floor((highestOct - lowestOct) / 2);
    let droneRoot = tonicPc + degStep + (midOct - 4) * edo;
    while (droneRoot >= high) droneRoot -= edo;
    while (droneRoot < low)  droneRoot += edo;

    const rawChord = shape.map(s => droneRoot + s);
    let chordAbs = fitChordIntoWindow(rawChord, edo, low, high);
    if (!chordAbs.length) { onResult("Chord doesn't fit in register window."); return; }

    // Apply a root-position voicing pattern whose note count matches the chord
    const compatVoicings = ROOT_VOICING_PATTERNS.filter(p => {
      if (!checkedVoicings.has(p.id)) return false;
      if (chordAbs.length < p.minNotes) return false;
      if (p.maxNotes !== undefined && chordAbs.length > p.maxNotes) return false;
      return true;
    });
    if (compatVoicings.length) {
      const pat = randomChoice(compatVoicings);
      const voiced = applyVoicingPattern(chordAbs, edo, pat);
      if (voiced.length) chordAbs = voiced;
    }

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
    const label = `${degLabel} — ${chordName}`;
    const params: DroneParams = { chordAbs, droneRoot, ivlNote, ivlName, droneVol, ivlVol, dur, playMode };
    lastDroneParams.current = params;

    const frames = [chordAbs, ...(ivlNote !== null ? [[ivlNote]] : [])];
    const lilWarn = formatLilWarnings(checkLowIntervalLimits(chordAbs, edo), edo);
    const info = [`Drone: ${label}`, ivlNote !== null ? `Interval: ${ivlName}` : "", lilWarn].filter(Boolean).join("\n");
    lastPlayed.current = { frames, info };
    setHasPlayed(true);

    setDroneActive(true);
    setDroneLabel(label);
    setAnswerText(ivlNote !== null ? `${label} — ${ivlName}` : label);
    setAnswerVisible(false);
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

  const handleShowAnswer = () => {
    if (answerVisible) {
      setAnswerVisible(false);
      onHighlight([]);
      return;
    }
    setAnswerVisible(true);
    const params = lastDroneParams.current;
    if (params) showSequential(params);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#666]">
        A sustained drone chord plays on the tonic; a random interval note sounds over or after it.
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
        {hasPlayed && answerText && (
          <button onClick={handleShowAnswer}
            className={`hover:bg-[#2a2a2a] border px-4 py-2 rounded text-sm transition-colors ${answerVisible ? "bg-[#1a1a2e] border-[#7173e6] text-[#9999ee]" : "bg-[#1e1e1e] border-[#444] text-[#9999ee]"}`}>
            {answerVisible ? "Hide Answer" : "Show Answer"}
          </button>
        )}
      </div>

      {answerVisible && answerText && (
        <div className="bg-[#1a2a1a] border border-[#3a5a3a] rounded p-3 text-sm text-[#8fc88f] font-mono whitespace-pre">{answerText}</div>
      )}

      {/* Drone chord types */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <p className="text-xs text-[#555]">Drone Chord Types:</p>
          <button onClick={() => setCheckedChords(new Set(Object.keys(getChordDroneTypes(edo))))}
            className="text-xs text-[#666] hover:text-[#aaa]">All</button>
          <button onClick={() => setCheckedChords(new Set())}
            className="text-xs text-[#666] hover:text-[#aaa]">None</button>
        </div>
        <div className="flex flex-wrap gap-1">
          {Object.keys(getChordDroneTypes(edo)).map(name => {
            const on = checkedChords.has(name);
            const accent = "#9999ee";
            return (
              <button key={name} onClick={() => setCheckedChords(toggle(checkedChords, name))}
                className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                  on ? "" : "bg-[#111] border-[#2a2a2a] text-[#666] hover:text-[#aaa]"
                }`}
                style={on ? { backgroundColor: accent + "30", borderColor: accent, color: accent } : undefined}>
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scale degrees — drone root placed at (tonic + selected degree); pick is randomized */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <p className="text-xs text-[#555]">Scale degrees (drone root):</p>
          <button onClick={() => setCheckedDegrees(new Set(chromDegrees.map(d => d.key)))}
            className="text-xs text-[#666] hover:text-[#aaa]">All</button>
          <button onClick={() => setCheckedDegrees(new Set())}
            className="text-xs text-[#666] hover:text-[#aaa]">None</button>
        </div>
        <div className="flex flex-wrap gap-1">
          {chromDegrees.map(d => {
            const on = checkedDegrees.has(d.key);
            const accent = "#9999ee";
            return (
              <button key={d.key} onClick={() => setCheckedDegrees(toggle(checkedDegrees, d.key))}
                className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${
                  on ? "" : "bg-[#111] border-[#2a2a2a] text-[#666] hover:text-[#aaa]"
                }`}
                style={on ? { backgroundColor: accent + "30", borderColor: accent, color: accent } : undefined}>
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Voicings (root position) */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <p className="text-xs text-[#555]">Voicings (root position):</p>
          <button onClick={() => setCheckedVoicings(new Set(ROOT_VOICING_PATTERNS.map(p => p.id)))}
            className="text-xs text-[#666] hover:text-[#aaa]">All</button>
          <button onClick={() => setCheckedVoicings(new Set())}
            className="text-xs text-[#666] hover:text-[#aaa]">None</button>
        </div>
        <div className="flex flex-wrap gap-1">
          {ROOT_VOICING_PATTERNS.map(p => {
            const on = checkedVoicings.has(p.id);
            const accent = "#9999ee";
            return (
              <button key={p.id} onClick={() => setCheckedVoicings(toggle(checkedVoicings, p.id))}
                className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${
                  on ? "" : "bg-[#111] border-[#2a2a2a] text-[#666] hover:text-[#aaa]"
                }`}
                style={on ? { backgroundColor: accent + "30", borderColor: accent, color: accent } : undefined}>
                {p.label}
              </button>
            );
          })}
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
        <div className="flex flex-wrap gap-1 max-h-64 overflow-y-auto pr-1">
          {getIntervalNames(edo).map((name, i) => {
            const on = checkedIvls.has(i);
            const accent = "#9999ee";
            return (
              <button key={i} onClick={() => setCheckedIvls(toggle(checkedIvls, i))}
                className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                  on ? "" : "bg-[#111] border-[#2a2a2a] text-[#666] hover:text-[#aaa]"
                }`}
                style={on ? { backgroundColor: accent + "30", borderColor: accent, color: accent } : undefined}>
                <span className="opacity-60 mr-1">{i}</span>{name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
