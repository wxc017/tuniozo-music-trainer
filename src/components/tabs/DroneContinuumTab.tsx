// Drone Continuum — vertical pitch strip from A1 (55 Hz) to A6 (1760 Hz).
// Click anywhere on the strip to place a node; nodes drone simultaneously
// via the existing sample-based audio engine, which pitch-shifts each
// sample to the exact target frequency.  No 12-TET / EDO assumption in
// the audio path: every node is its own continuous frequency.
import { useState, useEffect, useRef, useCallback } from "react";
import { audioEngine } from "@/lib/audioEngine";
import { useLS } from "@/lib/storage";

interface Props {
  edo: number;
  ensureAudio: () => Promise<void>;
}

const A1_HZ = 55;
const A6_HZ = 1760;
const STRIP_OCTAVES = Math.log2(A6_HZ / A1_HZ); // 5

const STRIP_W = 80;
const STRIP_H = 720;
const STRIP_PAD_TOP = 12;
const STRIP_PAD_BOT = 12;
const STRIP_INNER_H = STRIP_H - STRIP_PAD_TOP - STRIP_PAD_BOT;
const SVG_W = 560;

const yFromFreq = (f: number): number =>
  STRIP_PAD_TOP + (1 - Math.log2(f / A1_HZ) / STRIP_OCTAVES) * STRIP_INNER_H;
const freqFromY = (y: number): number =>
  A1_HZ * Math.pow(2, (1 - (y - STRIP_PAD_TOP) / STRIP_INNER_H) * STRIP_OCTAVES);

// Snap a frequency to the nearest EDO step on the A1-anchored grid.
// (We use A1 = 55 Hz as the strip's reference, so the grid is independent
// of the app's tonic.  This is "raw cents" tuning, not a key.)
const snapFreqToEdo = (f: number, edo: number): number => {
  const cents = 1200 * Math.log2(f / A1_HZ);
  const stepCents = 1200 / edo;
  const snapped = Math.round(cents / stepCents) * stepCents;
  return A1_HZ * Math.pow(2, snapped / 1200);
};

interface DroneNode {
  id: string;
  freq: number;
}

let nextId = 1;
const makeId = () => `n${nextId++}`;

export default function DroneContinuumTab({ edo, ensureAudio }: Props) {
  const [nodes, setNodes] = useState<DroneNode[]>([]);
  const [droneOn, setDroneOn] = useLS<boolean>("lt_dc_on", true);
  const [gain, setGain] = useLS<number>("lt_dc_gain", 0.18);
  const [showEdoGrid, setShowEdoGrid] = useLS<boolean>("lt_dc_edoGrid", true);
  const [snapToEdo, setSnapToEdo] = useLS<boolean>("lt_dc_snap", false);
  const [showJiRulers, setShowJiRulers] = useLS<boolean>("lt_dc_jiRulers", false);
  const stripRef = useRef<SVGSVGElement>(null);
  const droneActiveRef = useRef(false);

  // Restart the drone whenever the active node set, gain, or on/off toggles.
  // startRatioDrone tears down the previous voices internally, so this is
  // a single atomic update — no need for incremental add/remove plumbing.
  useEffect(() => {
    if (!droneOn || nodes.length === 0) {
      if (droneActiveRef.current) {
        audioEngine.stopDrone();
        droneActiveRef.current = false;
      }
      return;
    }
    let cancelled = false;
    (async () => {
      await ensureAudio();
      if (cancelled) return;
      const ratios = nodes.map(n => n.freq / A1_HZ);
      audioEngine.startRatioDrone(ratios, gain, A1_HZ);
      droneActiveRef.current = true;
    })();
    return () => { cancelled = true; };
  }, [nodes, droneOn, gain, ensureAudio]);

  useEffect(() => {
    return () => {
      if (droneActiveRef.current) {
        audioEngine.stopDrone();
        droneActiveRef.current = false;
      }
    };
  }, []);

  const onStripClick = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    const svg = stripRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    let freq = freqFromY(local.y);
    if (!isFinite(freq) || freq < A1_HZ * 0.99 || freq > A6_HZ * 1.01) return;
    if (snapToEdo) freq = snapFreqToEdo(freq, edo);
    setNodes(prev => [...prev, { id: makeId(), freq }]);
  }, [snapToEdo, edo]);

  const removeNode = (id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id));
  };

  const clearAll = () => setNodes([]);

  // Octave tick markers (A1, A2, ..., A6).
  const octaveTicks: { y: number; label: string }[] = [];
  for (let i = 0; i <= 5; i++) {
    const f = A1_HZ * Math.pow(2, i);
    octaveTicks.push({ y: yFromFreq(f), label: `A${i + 1}` });
  }

  // EDO grid lines spanning A1-A6.  Skip step 0 of each octave (those
  // coincide with octave gridlines and would double-draw).  Lines that
  // are perfect-fifth steps get a slightly brighter color so the user
  // can find P5 quickly when reading the grid.
  const edoLines: { y: number; isP5: boolean }[] = [];
  if (showEdoGrid) {
    const totalSteps = edo * 5;             // 5 octaves
    const p5Step = Math.round(edo * Math.log2(3 / 2));
    for (let s = 1; s < totalSteps; s++) {  // skip 0 (= A1) and totalSteps (= A6)
      if (s % edo === 0) continue;          // already drawn as octave line
      const f = A1_HZ * Math.pow(2, s / edo);
      edoLines.push({ y: yFromFreq(f), isP5: (s % edo) === p5Step });
    }
  }

  // JI harmonic ruler — partials of A1 from h2 to whatever fits in A6.
  // 32 * 55 = 1760 = A6 exactly, so harmonics 2..32 of A1 all sit on or
  // below A6.  Highlights the simplest partials with brighter strokes
  // so 2nd / 3rd / 5th / 7th stand out from the dense upper region.
  const jiLines: { y: number; harmonic: number }[] = [];
  if (showJiRulers) {
    for (let h = 2; h <= 32; h++) {
      const f = A1_HZ * h;
      if (f > A6_HZ * 1.001) break;
      jiLines.push({ y: yFromFreq(f), harmonic: h });
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#666]">
        Click the strip to place a sustained drone at any pitch from A1 (55 Hz) to A6 (1760 Hz).
        Multiple nodes drone simultaneously — train ordering low/high, hear real harmonic stacks.
      </p>

      <div className="flex flex-wrap gap-3 items-center">
        <button
          onClick={() => setDroneOn(!droneOn)}
          className={`px-4 py-1.5 rounded text-xs font-semibold transition-colors ${
            droneOn
              ? "bg-[#55aa8833] border border-[#55aa88] text-[#55aa88]"
              : "bg-[#111] border border-[#2a2a2a] text-[#888]"
          }`}
        >
          {droneOn ? "● Drone on" : "○ Drone off"}
        </button>

        <div className="flex items-center gap-2">
          <label className="text-xs text-[#888]">Gain</label>
          <input
            type="range" min={0.02} max={0.5} step={0.01}
            value={gain}
            onChange={e => setGain(parseFloat(e.target.value))}
            className="w-32 accent-[#55aa88]"
          />
          <span className="text-[10px] text-[#666] tabular-nums w-8">{Math.round(gain * 100)}%</span>
        </div>

        <button
          onClick={clearAll}
          disabled={!nodes.length}
          className="px-3 py-1.5 rounded text-xs bg-[#1e1e1e] border border-[#333] text-[#aaa] hover:bg-[#2a2a2a] disabled:text-[#444] disabled:cursor-not-allowed"
        >
          Clear ({nodes.length})
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => setShowEdoGrid(!showEdoGrid)}
          className={`px-2 py-1 rounded text-[11px] border transition-colors ${
            showEdoGrid
              ? "border-[#7173e6] bg-[#7173e622] text-[#9999ee]"
              : "border-[#2a2a2a] bg-[#111] text-[#666] hover:text-[#aaa]"
          }`}
        >
          {edo}-EDO grid
        </button>
        <button
          onClick={() => setSnapToEdo(!snapToEdo)}
          className={`px-2 py-1 rounded text-[11px] border transition-colors ${
            snapToEdo
              ? "border-[#7173e6] bg-[#7173e622] text-[#9999ee]"
              : "border-[#2a2a2a] bg-[#111] text-[#666] hover:text-[#aaa]"
          }`}
        >
          Snap to grid
        </button>
        <button
          onClick={() => setShowJiRulers(!showJiRulers)}
          className={`px-2 py-1 rounded text-[11px] border transition-colors ${
            showJiRulers
              ? "border-[#c8aa50] bg-[#c8aa5022] text-[#c8aa50]"
              : "border-[#2a2a2a] bg-[#111] text-[#666] hover:text-[#aaa]"
          }`}
        >
          JI harmonics of A1
        </button>
      </div>

      <svg
        ref={stripRef}
        width={SVG_W}
        height={STRIP_H}
        className="bg-[#0a0a0a] rounded border border-[#1a1a1a] select-none"
        style={{ display: "block" }}
      >
        {/* Octave gridlines (drawn first so other layers sit on top) */}
        {octaveTicks.map(t => (
          <g key={t.label}>
            <line
              x1={0} x2={SVG_W} y1={t.y} y2={t.y}
              stroke="#262626" strokeWidth={1}
            />
            <text
              x={6} y={t.y - 4}
              fill="#777" fontSize={10} fontFamily="monospace"
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* EDO grid (within strip rect only) */}
        {edoLines.map((g, i) => (
          <line
            key={`edo${i}`}
            x1={50} x2={50 + STRIP_W} y1={g.y} y2={g.y}
            stroke={g.isP5 ? "#33445e" : "#1d1f28"}
            strokeWidth={g.isP5 ? 1 : 0.5}
          />
        ))}

        {/* JI harmonic ruler (right of the strip) */}
        {jiLines.map(jl => (
          <g key={`ji${jl.harmonic}`}>
            <line
              x1={50 + STRIP_W} x2={50 + STRIP_W + 18}
              y1={jl.y} y2={jl.y}
              stroke="#c8aa5066" strokeWidth={1}
            />
            <text
              x={50 + STRIP_W + 22}
              y={jl.y + 3}
              fill="#c8aa5099" fontSize={9} fontFamily="monospace"
            >
              h{jl.harmonic}
            </text>
          </g>
        ))}

        {/* The strip itself — clickable rect */}
        <rect
          x={50} y={STRIP_PAD_TOP}
          width={STRIP_W} height={STRIP_INNER_H}
          fill="transparent"
          stroke="#2a2a2a" strokeWidth={1}
          onClick={onStripClick}
          style={{ cursor: "crosshair" }}
        />

        {/* Centerline of strip */}
        <line
          x1={50 + STRIP_W / 2} x2={50 + STRIP_W / 2}
          y1={STRIP_PAD_TOP} y2={STRIP_H - STRIP_PAD_BOT}
          stroke="#222" strokeWidth={1} strokeDasharray="2 4"
        />

        {/* Nodes */}
        {nodes.map(n => {
          const y = yFromFreq(n.freq);
          const cx = 50 + STRIP_W / 2;
          return (
            <g key={n.id}>
              <line
                x1={50} x2={50 + STRIP_W}
                y1={y} y2={y}
                stroke="#55aa88" strokeWidth={1.5}
              />
              <circle
                cx={cx} cy={y} r={6}
                fill="#55aa88"
                stroke="#0a0a0a" strokeWidth={2}
                onClick={(e) => { e.stopPropagation(); removeNode(n.id); }}
                style={{ cursor: "pointer" }}
              />
              <text
                x={50 + STRIP_W + 70}
                y={y + 4}
                fill="#aaa" fontSize={11} fontFamily="monospace"
              >
                {n.freq.toFixed(1)} Hz
              </text>
            </g>
          );
        })}
      </svg>

      <p className="text-[10px] text-[#444]">
        Click strip = add node · Click node = remove
      </p>
    </div>
  );
}
