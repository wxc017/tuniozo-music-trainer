import { useState, useCallback, useMemo, useRef } from "react";
import { audioEngine } from "@/lib/audioEngine";
import { rootPcToFreq } from "@/lib/latticeEngine";
import {
  XEN_INTERVALS_BY_LIMIT, XEN_AVAILABLE_LIMITS, XEN_INTERVALS_ALL,
  type XenInterval,
} from "@/lib/xenIntervals";
import { ratioToHEJILabel, accidentalText, type HEJILabel } from "@/lib/hejiNotation";

// ── Limit colors ────────────────────────────────────────────────
const LIMIT_COLORS: Record<number, string> = {
  2: "#888", 3: "#e87010", 5: "#22cc44", 7: "#5599ff",
  11: "#ddbb00", 13: "#cc44cc", 17: "#44cccc", 19: "#ff6688",
  23: "#88cc44", 29: "#cc8844", 31: "#4488cc", 37: "#aa66ff",
  41: "#66ccaa", 43: "#ff9944", 47: "#6688ff", 53: "#cc6688",
  59: "#55ddaa", 61: "#dd7788", 67: "#77bbdd", 71: "#ddaa55",
  73: "#aa55dd", 79: "#55aadd", 83: "#dd5577", 89: "#77dd88",
  97: "#bb77dd", 101: "#dd9966", 103: "#66ddbb", 107: "#dd6699",
  109: "#99dd66", 113: "#6699dd", 127: "#dd66aa",
};
function limitColor(l: number): string {
  return LIMIT_COLORS[l] ?? "#777";
}

// ── EDO matching ──────────────────────────────────────────────────
interface EdoMatch {
  edo: number;
  step: number;
  stepCents: number;
  deviation: number; // cents, positive = EDO step is sharp
}

const EDO_RANGE = Array.from({ length: 68 }, (_, i) => i + 5); // 5-EDO through 72-EDO

function findEdoMatches(cents: number, tolerance: number = 10): EdoMatch[] {
  const normCents = ((cents % 1200) + 1200) % 1200;
  const matches: EdoMatch[] = [];
  for (const edo of EDO_RANGE) {
    const stepSize = 1200 / edo;
    const nearestStep = Math.round(normCents / stepSize);
    const step = nearestStep % edo;
    const stepCents = step * stepSize;
    const deviation = stepCents - normCents;
    if (Math.abs(deviation) <= tolerance) {
      matches.push({ edo, step, stepCents, deviation });
    }
  }
  return matches;
}

function deviationLabel(dev: number): string {
  if (Math.abs(dev) < 0.5) return "exact";
  return `${dev > 0 ? "+" : ""}${dev.toFixed(1)}¢`;
}

function deviationColor(dev: number): string {
  const abs = Math.abs(dev);
  if (abs < 1) return "#4ade80";    // green — near exact
  if (abs < 3) return "#86efac";    // light green
  if (abs < 5) return "#fbbf24";    // yellow
  if (abs < 8) return "#f97316";    // orange
  return "#ef4444";                  // red — edge of range
}

// Note names for matching search queries
const NOTE_SEARCH_NAMES: string[][] = [
  ["C"],
  ["C♯", "C#", "D♭", "Db"],
  ["D"],
  ["D♯", "D#", "E♭", "Eb"],
  ["E"],
  ["F"],
  ["F♯", "F#", "G♭", "Gb"],
  ["G"],
  ["G♯", "G#", "A♭", "Ab"],
  ["A"],
  ["A♯", "A#", "B♭", "Bb"],
  ["B"],
];

const NOTE_NAMES_SHARP = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const NOTE_NAMES_FLAT  = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];

/** Circle-of-fifths position for a ratio, summing across all prime factors. */
function fifthsPosition(n: number, d: number): number {
  const PRIMES = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31];
  let pos = 0;
  for (const p of PRIMES) {
    let exp = 0;
    while (n % p === 0) { n /= p; exp++; }
    while (d % p === 0) { d /= p; exp--; }
    if (exp !== 0) {
      const semi = Math.round(1200 * Math.log2(p) / 100) % 12;
      const f = (semi * 7) % 12;
      pos += exp * (f > 6 ? f - 12 : f);
    }
  }
  return pos;
}

function centsToNoteName(cents: number, rootPc: number, n?: number, d?: number): string {
  const normCents = ((cents % 1200) + 1200) % 1200;
  const semitones = Math.round(normCents / 100);
  const pc = (rootPc + semitones) % 12;
  const deviation = normCents - semitones * 100;
  const useFlat = (n != null && d != null) ? fifthsPosition(n, d) < 0 : [1, 3, 8, 10].includes(semitones % 12);
  const name = useFlat ? NOTE_NAMES_FLAT[pc] : NOTE_NAMES_SHARP[pc];
  const octavesAbove = Math.floor(cents / 1200);
  const octaveLabel = octavesAbove > 0 ? `+${octavesAbove}oct` : "";
  if (Math.abs(deviation) > 5) {
    const sign = deviation > 0 ? "+" : "";
    return `${name}${sign}${deviation.toFixed(3)}¢${octaveLabel ? " " + octaveLabel : ""}`;
  }
  return octaveLabel ? `${name} ${octaveLabel}` : name;
}

/** Check if an interval matches a note= query */
function matchesNoteQuery(noteQuery: string, cents: number, rootPc: number): boolean {
  const normCents = ((cents % 1200) + 1200) % 1200;
  const semitones = Math.round(normCents / 100);
  const pc = (rootPc + semitones) % 12;
  const q = noteQuery.toLowerCase();
  return NOTE_SEARCH_NAMES[pc].some(n => n.toLowerCase() === q);
}

const ROOT_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

export default function IntervalBrowser() {
  const [audioReady, setAudioReady] = useState(false);
  const [selectedLimit, setSelectedLimit] = useState<number | null>(null);
  const [playingKeys, setPlayingKeys] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [rootPc, setRootPc] = useState(0);
  // Drone state — mirrors LatticeView pattern
  type DroneMode = "Off" | "Single" | "Root+5th" | "Tanpura";
  const [droneMode, setDroneMode] = useState<DroneMode>("Off");
  const [droneOn, setDroneOn] = useState(false);
  const [droneOctave, setDroneOctave] = useState(3);
  const [droneVol, setDroneVol] = useState(0.1);

  const ensureAudio = useCallback(async () => {
    if (!audioReady) { await audioEngine.init(); setAudioReady(true); }
    else audioEngine.resume();
  }, [audioReady]);

  const buildDroneRatios = useCallback((mode: DroneMode) => {
    if (mode === "Off") return [];
    if (mode === "Single") return [1];
    if (mode === "Root+5th") return [1, 3 / 2];
    return [1, 3 / 2, 2]; // Tanpura
  }, []);

  const startDrone = useCallback(async (mode: DroneMode, vol: number, pc: number, oct?: number) => {
    if (mode === "Off") { audioEngine.stopDrone(); setDroneOn(false); return; }
    await ensureAudio();
    const ratios = buildDroneRatios(mode);
    const freq = rootPcToFreq(pc) * Math.pow(2, (oct ?? droneOctave) - 4);
    audioEngine.startRatioDrone(ratios, vol, freq);
    setDroneOn(true);
  }, [ensureAudio, buildDroneRatios, droneOctave]);

  const stopDrone = useCallback(() => {
    audioEngine.stopDrone();
    setDroneOn(false);
  }, []);

  // Update drone when params change while active
  const prevDroneParamsRef = useRef({ rootPc, droneOctave, droneMode, droneVol });
  if (droneOn && (rootPc !== prevDroneParamsRef.current.rootPc ||
      droneOctave !== prevDroneParamsRef.current.droneOctave ||
      droneMode !== prevDroneParamsRef.current.droneMode ||
      droneVol !== prevDroneParamsRef.current.droneVol)) {
    prevDroneParamsRef.current = { rootPc, droneOctave, droneMode, droneVol };
    if (droneMode === "Off") { audioEngine.stopDrone(); setDroneOn(false); }
    else { startDrone(droneMode, droneVol, rootPc, droneOctave); }
  }
  prevDroneParamsRef.current = { rootPc, droneOctave, droneMode, droneVol };

  // Toggle interval drone — plays just the interval (not root), multiple can be active
  const toggleInterval = useCallback(async (interval: XenInterval) => {
    await ensureAudio();
    const key = `${interval.n}/${interval.d}`;
    const ratio = interval.n / interval.d;
    const baseFreq = rootPcToFreq(rootPc);
    const freq = baseFreq * ratio;

    setPlayingKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        audioEngine.stopIntervalDroneByKey(key);
        next.delete(key);
      } else {
        audioEngine.startIntervalDrone(key, freq);
        next.add(key);
      }
      return next;
    });
  }, [ensureAudio, rootPc]);

  const stopAll = useCallback(() => {
    audioEngine.stopAllIntervalDrones();
    setPlayingKeys(new Set());
  }, []);

  // Search results (across all limits) — supports note=X queries
  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.trim();

    // Check for note= prefix
    const noteMatch = q.match(/^note\s*=\s*(.+)$/i);
    if (noteMatch) {
      const noteQ = noteMatch[1].trim();
      return XEN_INTERVALS_ALL.filter(i => matchesNoteQuery(noteQ, i.cents, rootPc))
        .sort((a, b) => b.n / b.d - a.n / a.d);
    }

    const ql = q.toLowerCase();
    return XEN_INTERVALS_ALL.filter(i =>
      i.name.toLowerCase().includes(ql) ||
      i.names.some(n => n.toLowerCase().includes(ql)) ||
      `${i.n}/${i.d}`.includes(ql)
    ).sort((a, b) => b.n / b.d - a.n / a.d);
  }, [search, rootPc]);

  // ── Drone strip (matches LatticeView style) ──
  const droneStrip = (
    <div className="flex flex-wrap gap-2 items-center py-1.5 px-2 rounded bg-[#0c0c0c] border border-[#1a1a1a]">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold text-[#666] uppercase tracking-widest">Drone</span>
        {droneOn && <span className="w-2 h-2 rounded-full bg-[#7173e6] animate-pulse" />}
      </div>
      {/* Mode buttons */}
      {(["Off", "Single", "Root+5th", "Tanpura"] as DroneMode[]).map(m => (
        <button key={m}
          onClick={async () => {
            setDroneMode(m);
            if (m === "Off") { stopDrone(); }
            else { await startDrone(m, droneVol, rootPc); }
          }}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors border ${
            droneMode === m && (m === "Off" ? !droneOn : droneOn)
              ? m === "Off"
                ? "bg-[#1a1a1a] border-[#333] text-[#888]"
                : "bg-[#7173e6] border-[#7173e6] text-white"
              : "bg-[#111] border-[#222] text-[#444] hover:text-[#aaa] hover:border-[#444]"
          }`}>
          {m}
        </button>
      ))}
      <div className="w-px h-5 bg-[#222]" />
      {/* Root note selector */}
      <label className="text-[10px] text-[#555] flex items-center gap-1">
        Root
        <select
          value={rootPc}
          onChange={async (e) => {
            const pc = Number(e.target.value);
            setRootPc(pc);
            if (droneOn && droneMode !== "Off") {
              await ensureAudio();
              const ratios = buildDroneRatios(droneMode);
              audioEngine.startRatioDrone(ratios, droneVol, rootPcToFreq(pc) * Math.pow(2, droneOctave - 4));
            }
          }}
          className="bg-[#141414] border border-[#333] text-white text-xs rounded px-1.5 py-0.5"
        >
          {ROOT_NAMES.map((name, i) => (
            <option key={i} value={i}>{name}</option>
          ))}
        </select>
      </label>
      <div className="w-px h-5 bg-[#222]" />
      {/* Octave selector */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-[#555]">Oct</span>
        {[2, 3, 4, 5, 6].map(o => (
          <button key={o}
            onClick={async () => {
              setDroneOctave(o);
              if (droneOn && droneMode !== "Off") {
                await startDrone(droneMode, droneVol, rootPc, o);
              }
            }}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors border ${
              droneOctave === o
                ? "bg-[#7173e6] text-white border-[#7173e6]"
                : "bg-[#111] text-[#444] border-[#222] hover:text-[#aaa]"
            }`}>
            {o}
          </button>
        ))}
      </div>
      <div className="w-px h-5 bg-[#222]" />
      {/* Volume slider */}
      <label className="text-[10px] text-[#555] flex items-center gap-1">
        Vol
        <input type="range" min={0} max={0.3} step={0.005} value={droneVol}
          onChange={e => setDroneVol(Number(e.target.value))}
          className="w-16 accent-[#7173e6]" />
        <span className="text-[10px] text-[#444] w-6 text-right">{Math.round(droneVol * 100 / 0.3)}%</span>
      </label>
    </div>
  );

  // ── Category grid (no limit selected) ──────────────────────────
  if (!selectedLimit && !searchResults) {
    return (
      <div className="mx-auto py-4 px-4 flex flex-col" style={{ height: "calc(100vh - 48px)", maxWidth: 960 }}>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <h2 className="text-sm font-semibold text-[#888] uppercase tracking-widest">Interval Database</h2>
          <span className="text-[10px] text-[#444]">{XEN_INTERVALS_ALL.length} intervals</span>
          <div className="ml-auto">{droneStrip}</div>
        </div>
        <div className="mb-4">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, ratio, or note=E..."
            className="w-full max-w-md px-3 py-2 rounded text-sm bg-[#111] border border-[#2a2a2a] text-white placeholder-[#444] focus:border-[#7173e6] outline-none" />
        </div>
        <div className="flex-1 overflow-auto">
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {XEN_AVAILABLE_LIMITS.map(limit => {
              const intervals = XEN_INTERVALS_BY_LIMIT[limit] ?? [];
              const color = limitColor(limit);
              return (
                <button key={limit} onClick={() => setSelectedLimit(limit)}
                  className="flex flex-col gap-1 p-4 rounded-lg text-left transition-all border border-[#1a1a1a] bg-[#0c0c0c] hover:bg-[#111] hover:border-[#333] group">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold" style={{ color }}>{limit}</span>
                    <span className="text-xs text-[#555]">-limit</span>
                  </div>
                  <span className="text-[11px] text-[#666] group-hover:text-[#999] transition-colors">
                    {intervals.length} interval{intervals.length !== 1 ? "s" : ""}
                  </span>
                  <span className="text-[10px] text-[#444] truncate mt-1">
                    {intervals.slice(0, 3).map(i => i.name).join(", ")}
                    {intervals.length > 3 ? "..." : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Search results view ─────────────────────────────────────────
  if (searchResults) {
    return (
      <div className="mx-auto py-4 px-4 flex flex-col" style={{ height: "calc(100vh - 48px)", maxWidth: 960 }}>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <button onClick={() => setSearch("")}
            className="px-2 py-1 rounded text-xs font-medium border border-[#333] bg-[#111] text-[#888] hover:text-white transition-colors">
            ← Back
          </button>
          <h2 className="text-sm font-semibold text-[#888] uppercase tracking-widest">Search Results</h2>
          <span className="text-[10px] text-[#444]">{searchResults.length} matches</span>
          <div className="ml-auto">{droneStrip}</div>
        </div>
        <div className="mb-3">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} autoFocus
            placeholder="Search by name, ratio, or note=E..."
            className="w-full max-w-md px-3 py-2 rounded text-sm bg-[#111] border border-[#2a2a2a] text-white placeholder-[#444] focus:border-[#7173e6] outline-none" />
        </div>
        <div className="flex-1 overflow-auto">
          <IntervalList intervals={searchResults} playingKeys={playingKeys}
            onPlay={toggleInterval} rootPc={rootPc} grouped={false} />
        </div>
      </div>
    );
  }

  // ── Single limit view (grouped by numerator) ───────────────────
  const intervals = XEN_INTERVALS_BY_LIMIT[selectedLimit!] ?? [];
  const color = limitColor(selectedLimit!);

  return (
    <div className="mx-auto py-4 px-4 flex flex-col" style={{ height: "calc(100vh - 48px)", maxWidth: 960 }}>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <button onClick={() => setSelectedLimit(null)}
          className="px-2 py-1 rounded text-xs font-medium border border-[#333] bg-[#111] text-[#888] hover:text-white transition-colors">
          ← Back
        </button>
        <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color }}>
          {selectedLimit}-limit intervals
        </h2>
        <span className="text-[10px] text-[#444]">{intervals.length} intervals</span>
        <div className="ml-auto flex items-center gap-1">
          {(() => {
            const idx = XEN_AVAILABLE_LIMITS.indexOf(selectedLimit!);
            const prev = idx > 0 ? XEN_AVAILABLE_LIMITS[idx - 1] : null;
            const next = idx < XEN_AVAILABLE_LIMITS.length - 1 ? XEN_AVAILABLE_LIMITS[idx + 1] : null;
            return (<>
              {prev !== null && (
                <button onClick={() => setSelectedLimit(prev)}
                  className="px-2 py-1 rounded text-[10px] font-medium border border-[#222] bg-[#111] text-[#555] hover:text-white transition-colors">
                  ← {prev}
                </button>
              )}
              {next !== null && (
                <button onClick={() => setSelectedLimit(next)}
                  className="px-2 py-1 rounded text-[10px] font-medium border border-[#222] bg-[#111] text-[#555] hover:text-white transition-colors">
                  {next} →
                </button>
              )}
            </>);
          })()}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {droneStrip}
        {playingKeys.size > 0 && (
          <button onClick={stopAll}
            className="ml-auto px-2 py-1 rounded text-[10px] border border-[#5a2a2a] bg-[#2a1a1a] text-[#cc6666] hover:text-white transition-colors">
            ■ Stop all ({playingKeys.size})
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <IntervalList intervals={intervals} playingKeys={playingKeys}
          onPlay={toggleInterval} rootPc={rootPc} grouped={true} />
      </div>
    </div>
  );
}

// ── Interval list sub-component ─────────────────────────────────

function IntervalList({ intervals, playingKeys, onPlay, rootPc, grouped }: {
  intervals: XenInterval[];
  playingKeys: Set<string>;
  onPlay: (i: XenInterval) => void;
  rootPc: number;
  grouped: boolean;
}) {
  // Group intervals by first digit of numerator (1–9)
  const groups = useMemo(() => {
    if (!grouped) return null;
    const map = new Map<number, XenInterval[]>();
    for (let d = 1; d <= 9; d++) map.set(d, []);
    for (const i of intervals) {
      const firstDigit = Number(String(i.n)[0]);
      map.get(firstDigit)!.push(i);
    }
    // Sort each group by ratio value — largest first
    for (const [, list] of map) {
      list.sort((a, b) => b.n / b.d - a.n / a.d);
    }
    // Remove empty groups, sort by digit
    return [...map.entries()].filter(([, list]) => list.length > 0).sort(([a], [b]) => a - b);
  }, [intervals, grouped]);

  if (grouped && groups) {
    return (
      <div className="flex flex-col gap-3">
        {groups.map(([digit, items]) => (
          <div key={digit}>
            {/* Group header */}
            <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-[#0a0a0a]/90 backdrop-blur-sm border-b border-[#1a1a1a] mb-0.5">
              <span className="text-xs font-bold text-[#7173e6]">{digit}</span>
              <span className="text-[10px] text-[#444]">{items.length} interval{items.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {items.map(interval => (
                <IntervalRow key={`${interval.n}/${interval.d}`}
                  interval={interval} playingKeys={playingKeys}
                  onPlay={onPlay} rootPc={rootPc} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Flat list (search results)
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-[#555] uppercase tracking-wider border-b border-[#1a1a1a]">
        <span className="w-14 text-center">Note</span>
        <span className="w-24 text-right">Ratio</span>
        <span className="flex-1">Name</span>
        <span className="w-12 text-center">Limit</span>
      </div>
      {intervals.map(interval => (
        <IntervalRow key={`${interval.n}/${interval.d}`}
          interval={interval} playingKeys={playingKeys}
          onPlay={onPlay} rootPc={rootPc} />
      ))}
    </div>
  );
}

// ── Single interval row ─────────────────────────────────────────

function IntervalRow({ interval, playingKeys, onPlay, rootPc }: {
  interval: XenInterval;
  playingKeys: Set<string>;
  onPlay: (i: XenInterval) => void;
  rootPc: number;
}) {
  const key = `${interval.n}/${interval.d}`;
  const isPlaying = playingKeys.has(key);
  const normCents = ((interval.cents % 1200) + 1200) % 1200;
  const nearestSemitone = Math.round(normCents / 100);
  const pc = (rootPc + nearestSemitone) % 12;
  const useFlats = [1, 3, 6, 8, 10].includes(rootPc);
  const noteName = useFlats ? NOTE_NAMES_FLAT[pc] : NOTE_NAMES_SHARP[pc];
  const octavesAbove = Math.floor(interval.cents / 1200);
  const edoDeviation = normCents - nearestSemitone * 100;
  const [showNames, setShowNames] = useState(false);
  const [showEdos, setShowEdos] = useState(false);
  const nameRef = useRef<HTMLDivElement>(null);

  const edoMatches = useMemo(() => findEdoMatches(interval.cents), [interval.cents]);
  const hejiLabel = useMemo(() => ratioToHEJILabel(interval.n, interval.d, rootPc), [interval.n, interval.d, rootPc]);

  return (
    <div className={`rounded transition-colors ${
      isPlaying
        ? "bg-[#171730] border border-[#7173e6]"
        : "bg-[#0a0a0a] border border-transparent hover:bg-[#111] hover:border-[#222]"
    }`}>
      <div onClick={() => onPlay(interval)}
        className="flex items-center gap-2 px-3 py-2 group cursor-pointer select-none">
        {/* HEJI note + 12-EDO note */}
        <div className="w-52 flex-shrink-0">
          <span className="inline-flex items-baseline gap-0.5">
            <span style={{
              fontSize: 13,
              fontFamily: "Inter, system-ui, sans-serif",
              fontWeight: 700,
              color: isPlaying ? "#88bbff" : "#5588cc",
            }}>
              {hejiLabel.notation.letter}
            </span>
            {hejiLabel.accidentalSmufl ? (
              <span style={{
                fontSize: 18,
                fontFamily: "'HEJI2'",
                fontWeight: 400,
                color: isPlaying ? "#88bbff" : "#5588cc",
                lineHeight: 1,
              }}>
                {hejiLabel.accidentalSmufl}
              </span>
            ) : hejiLabel.notation.accidentals !== 0 ? (
              <span style={{
                fontSize: 13,
                fontFamily: "Inter, system-ui, sans-serif",
                fontWeight: 700,
                color: isPlaying ? "#88bbff" : "#5588cc",
              }}>
                {accidentalText(hejiLabel.notation.accidentals)}
              </span>
            ) : null}
            {octavesAbove > 0 && (
              <span className={`text-[10px] ${isPlaying ? "text-[#555]" : "text-[#333]"}`}> +{octavesAbove}oct</span>
            )}
          </span>
          <span className={`ml-2 text-[10px] ${isPlaying ? "text-[#555]" : "text-[#333]"}`}>
            {noteName}{Math.abs(edoDeviation) >= 0.5
              ? ` ${edoDeviation > 0 ? "+" : ""}${edoDeviation.toFixed(1)}¢`
              : ""
            }
          </span>
        </div>
        {/* Ratio */}
        <span className={`w-24 text-right font-mono text-xs flex-shrink-0 ${isPlaying ? "text-[#9395ea]" : "text-[#666]"}`}>
          {key}
        </span>
        {/* Name with alternate names dropdown */}
        <div className="flex-1 min-w-0 relative" ref={nameRef}>
          <span
            className={`text-sm font-medium cursor-default ${isPlaying ? "text-white" : "text-[#ccc] group-hover:text-white"}`}
            onMouseEnter={() => interval.names.length > 1 && setShowNames(true)}
            onMouseLeave={() => setShowNames(false)}
          >
            {interval.name}
            {interval.names.length > 1 && (
              <span className="text-[10px] text-[#555] ml-1">▾</span>
            )}
          </span>
          {showNames && interval.names.length > 1 && (
            <div className="absolute left-0 top-full z-20 mt-1 py-1 px-2 rounded bg-[#1a1a2a] border border-[#333] shadow-lg"
              onMouseEnter={() => setShowNames(true)}
              onMouseLeave={() => setShowNames(false)}>
              <div className="text-[10px] text-[#555] mb-1">Also known as:</div>
              {interval.names.slice(1).map((name, i) => (
                <div key={i} className="text-xs text-[#aaa] py-0.5 whitespace-nowrap">{name}</div>
              ))}
            </div>
          )}
        </div>
        {/* EDO count badge — clickable to expand */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowEdos(prev => !prev); }}
          className={`w-16 text-center text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 transition-colors ${
            showEdos
              ? "bg-[#1a2a1a] text-[#4ade80] border border-[#4ade8040]"
              : "bg-[#111] text-[#555] border border-[#222] hover:text-[#888]"
          }`}>
          {edoMatches.length} EDO{edoMatches.length !== 1 ? "s" : ""}
        </button>
        {/* Limit badge */}
        <span className="w-12 text-center text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
          style={{ color: limitColor(interval.limit), backgroundColor: `${limitColor(interval.limit)}15`, border: `1px solid ${limitColor(interval.limit)}30` }}>
          {interval.limit}
        </span>
      </div>
      {/* Expanded EDO matches panel */}
      {showEdos && (
        <div className="px-3 pb-2 pt-0">
          <div className="flex flex-wrap gap-1 p-2 rounded bg-[#0d0d0d] border border-[#1a1a1a]">
            <div className="w-full text-[10px] text-[#555] mb-1">
              EDOs within ±10¢ of {interval.cents.toFixed(1)}¢ — step (deviation)
            </div>
            {edoMatches.length === 0 ? (
              <span className="text-[10px] text-[#444]">No EDOs in range</span>
            ) : (
              edoMatches.map(m => (
                <span key={m.edo}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#111] border border-[#222]"
                  title={`${m.edo}-EDO step ${m.step} = ${m.stepCents.toFixed(1)}¢ (${deviationLabel(m.deviation)} from ${interval.cents.toFixed(1)}¢)`}>
                  <span className="font-semibold text-[#ccc]">{m.edo}</span>
                  <span className="text-[#555]">⟨{m.step}⟩</span>
                  <span style={{ color: deviationColor(m.deviation) }}>{deviationLabel(m.deviation)}</span>
                </span>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
