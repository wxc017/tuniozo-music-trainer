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

interface DroneNode {
  id: string;
  freq: number;
}

let nextId = 1;
const makeId = () => `n${nextId++}`;

export default function DroneContinuumTab({ edo: _edo, ensureAudio }: Props) {
  const [nodes, setNodes] = useState<DroneNode[]>([]);
  const [droneOn, setDroneOn] = useLS<boolean>("lt_dc_on", true);
  const [gain, setGain] = useLS<number>("lt_dc_gain", 0.18);
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
    const freq = freqFromY(local.y);
    if (!isFinite(freq) || freq < A1_HZ * 0.99 || freq > A6_HZ * 1.01) return;
    setNodes(prev => [...prev, { id: makeId(), freq }]);
  }, []);

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

      <svg
        ref={stripRef}
        width={SVG_W}
        height={STRIP_H}
        className="bg-[#0a0a0a] rounded border border-[#1a1a1a] select-none"
        style={{ display: "block" }}
      >
        {/* Octave gridlines */}
        {octaveTicks.map(t => (
          <g key={t.label}>
            <line
              x1={0} x2={SVG_W} y1={t.y} y2={t.y}
              stroke="#1a1a1a" strokeWidth={1}
            />
            <text
              x={6} y={t.y - 4}
              fill="#555" fontSize={10} fontFamily="monospace"
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* The strip itself — clickable rect */}
        <rect
          x={50} y={STRIP_PAD_TOP}
          width={STRIP_W} height={STRIP_INNER_H}
          fill="#101010"
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
                x={50 + STRIP_W + 12}
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
