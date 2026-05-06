// Drone Continuum — vertical pitch strip from A1 (55 Hz) to A6 (1760 Hz).
// Click anywhere on the strip to place a node; nodes drone simultaneously
// via the existing sample-based audio engine, which pitch-shifts each
// sample to the exact target frequency.  No 12-TET / EDO assumption in
// the audio path: every node is its own continuous frequency.
import { useState, useEffect, useRef, useCallback } from "react";
import { audioEngine } from "@/lib/audioEngine";
import { useLS } from "@/lib/storage";
import { pcToNoteName } from "@/lib/edoData";
import { findJiRatio, formatJiRatio } from "@/lib/jiRatioFinder";

interface Props {
  edo: number;
  ensureAudio: () => Promise<void>;
}

const A1_HZ = 55;
const A6_HZ = 1760;
const STRIP_OCTAVES = Math.log2(A6_HZ / A1_HZ); // 5

// Match the audio engine's C4 reference so EDO labels align with the
// app's tonal-system note names (the EDO grid is C-anchored, not
// A-anchored, even though the strip's bottom and top happen to be A1
// and A6 — that's just where users mentally place the range).
const C4_HZ = 261.63;
const freqToAbsPc = (f: number, edo: number) =>
  4 * edo + edo * Math.log2(f / C4_HZ);
const absPcToFreq = (pc: number, edo: number) =>
  C4_HZ * Math.pow(2, (pc - 4 * edo) / edo);

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

const snapFreqToEdo = (f: number, edo: number): number =>
  absPcToFreq(Math.round(freqToAbsPc(f, edo)), edo);

// Compute the EDO note name + signed cents drift between `freq` and the
// nearest C-anchored EDO step.  Octave numbers count from C0 (= 16.35 Hz)
// to match the app's standard absolute-pitch convention.
function edoLabelFor(freq: number, edo: number): { name: string; drift: number } {
  const exactPc = freqToAbsPc(freq, edo);
  const snappedPc = Math.round(exactPc);
  const drift = (exactPc - snappedPc) * (1200 / edo);
  const pc = ((snappedPc % edo) + edo) % edo;
  const oct = Math.floor(snappedPc / edo);
  return { name: `${pcToNoteName(pc, edo)}${oct}`, drift };
}

interface DroneNode {
  id: string;
  freq: number;
  harmonicOf?: string;   // parent node id, when spawned by a series preset
  harmonicNum?: number;  // 2 = octave / 2nd partial, 3 = 3rd partial, ...
  subharmonic?: boolean; // true for series-below spawns
  outOfRange?: boolean;  // visible as grey dot, NOT droned
}

let nextId = 1;
const makeId = () => `n${nextId++}`;

const HARMONIC_PRESET_COUNTS = [4, 8, 12, 16, 24] as const;

export default function DroneContinuumTab({ edo, ensureAudio }: Props) {
  const [nodes, setNodes] = useState<DroneNode[]>([]);
  const [droneOn, setDroneOn] = useLS<boolean>("lt_dc_on", true);
  const [gain, setGain] = useLS<number>("lt_dc_gain", 0.18);
  const [showEdoGrid, setShowEdoGrid] = useLS<boolean>("lt_dc_edoGrid", true);
  const [snapToEdo, setSnapToEdo] = useLS<boolean>("lt_dc_snap", false);
  const [showJiRulers, setShowJiRulers] = useLS<boolean>("lt_dc_jiRulers", false);
  const [labelMode, setLabelMode] = useLS<"both" | "edo" | "ji">("lt_dc_labelMode", "both");
  const [primeLimit, setPrimeLimit] = useLS<number>("lt_dc_primeLimit", 13);
  const [menuNodeId, setMenuNodeId] = useState<string | null>(null);
  const stripRef = useRef<SVGSVGElement>(null);
  const droneActiveRef = useRef(false);

  // Restart the drone whenever the active node set, gain, or on/off toggles.
  // startRatioDrone tears down the previous voices internally, so this is
  // a single atomic update — no need for incremental add/remove plumbing.
  useEffect(() => {
    const audible = nodes.filter(n => !n.outOfRange);
    if (!droneOn || audible.length === 0) {
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
      const ratios = audible.map(n => n.freq / A1_HZ);
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
    setMenuNodeId(null);
  }, [snapToEdo, edo]);

  const removeNode = (id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id && n.harmonicOf !== id));
    setMenuNodeId(null);
  };

  const clearAll = () => { setNodes([]); setMenuNodeId(null); };

  const addHarmonicSeries = (parentId: string, count: number, below: boolean) => {
    setNodes(prev => {
      const parent = prev.find(n => n.id === parentId);
      if (!parent) return prev;
      // Drop any existing harmonics of this parent — re-running the
      // preset replaces, doesn't accumulate.
      const filtered = prev.filter(n => n.harmonicOf !== parentId);
      const additions: DroneNode[] = [];
      for (let h = 2; h <= count; h++) {
        const freq = below ? parent.freq / h : parent.freq * h;
        const outOfRange = below
          ? freq < A1_HZ * 0.999
          : freq > A6_HZ * 1.001;
        additions.push({
          id: makeId(), freq,
          harmonicOf: parentId, harmonicNum: h,
          subharmonic: below,
          outOfRange,
        });
      }
      return [...filtered, ...additions];
    });
    setMenuNodeId(null);
  };

  // Octave tick markers (A1, A2, ..., A6).
  const octaveTicks: { y: number; label: string }[] = [];
  for (let i = 0; i <= 5; i++) {
    const f = A1_HZ * Math.pow(2, i);
    octaveTicks.push({ y: yFromFreq(f), label: `A${i + 1}` });
  }

  // EDO grid spanning the visible range, C-anchored so each gridline
  // sits on an actual EDO degree of the app's tonal system.  P5 steps
  // (i.e. the "G" of every octave) get a brighter stroke for orientation.
  const edoLines: { y: number; isP5: boolean }[] = [];
  if (showEdoGrid) {
    const minPc = Math.ceil(freqToAbsPc(A1_HZ, edo));
    const maxPc = Math.floor(freqToAbsPc(A6_HZ, edo));
    const p5Step = Math.round(edo * Math.log2(3 / 2));
    for (let pc = minPc; pc <= maxPc; pc++) {
      const f = absPcToFreq(pc, edo);
      const stepInOct = ((pc % edo) + edo) % edo;
      edoLines.push({ y: yFromFreq(f), isP5: stepInOct === p5Step });
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

        <div className="w-px h-4 bg-[#2a2a2a] mx-1" />

        <span className="text-[10px] text-[#555]">Labels</span>
        <div className="flex rounded overflow-hidden border border-[#333]">
          {(["both", "edo", "ji"] as const).map(m => (
            <button key={m}
              onClick={() => setLabelMode(m)}
              className={`px-2 py-1 text-[10px] transition-colors ${
                labelMode === m ? "bg-[#7173e6] text-white" : "bg-[#1e1e1e] text-[#888] hover:text-[#ccc]"
              }`}
            >
              {m === "both" ? "Both" : m === "edo" ? "EDO" : "JI"}
            </button>
          ))}
        </div>

        <span className="text-[10px] text-[#555]">Prime limit</span>
        <select
          value={primeLimit}
          onChange={e => setPrimeLimit(parseInt(e.target.value))}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none"
        >
          {[5, 7, 11, 13, 17, 19, 23, 31].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="relative" style={{ width: SVG_W, height: STRIP_H }}>
      <svg
        ref={stripRef}
        width={SVG_W}
        height={STRIP_H}
        className="bg-[#0a0a0a] rounded border border-[#1a1a1a] select-none"
        style={{ display: "block" }}
        onClick={() => setMenuNodeId(null)}
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

        {/* Nodes — circle on the strip + multi-row label to the right.
            JI ratios reference the lowest currently-placed in-range
            node as 1/1.  Out-of-range nodes (harmonics past A6 or
            sub-harmonics below A1) render as small grey dots on the
            far edge — visible-but-silent so users can see partials
            that exist beyond the strip. */}
        {(() => {
          if (!nodes.length) return null;
          const inRange = nodes.filter(n => !n.outOfRange);
          const oor = nodes.filter(n => n.outOfRange);
          const sorted = [...inRange].sort((a, b) => a.freq - b.freq);
          const rootFreq = sorted[0]?.freq;
          const labelX = 50 + STRIP_W + 70;
          const cx = 50 + STRIP_W / 2;

          // Out-of-range dots — draw them stacked at the strip's top or
          // bottom edge so they stay anchored even though their real
          // y is off-canvas.  Stagger horizontally so dots from a long
          // harmonic series don't pile on a single pixel.
          const oorAbove = oor.filter(n => !n.subharmonic);
          const oorBelow = oor.filter(n =>  n.subharmonic);

          return (
            <>
              {oorAbove.map((n, i) => {
                const x = cx + (i - (oorAbove.length - 1) / 2) * 9;
                return (
                  <g key={n.id}>
                    <circle
                      cx={x} cy={STRIP_PAD_TOP - 6} r={2.5}
                      fill="#444" stroke="#222" strokeWidth={0.5}
                    >
                      <title>h{n.harmonicNum} = {n.freq.toFixed(1)} Hz (above A6 — visible only)</title>
                    </circle>
                  </g>
                );
              })}
              {oorBelow.map((n, i) => {
                const x = cx + (i - (oorBelow.length - 1) / 2) * 9;
                return (
                  <g key={n.id}>
                    <circle
                      cx={x} cy={STRIP_H - STRIP_PAD_BOT + 6} r={2.5}
                      fill="#444" stroke="#222" strokeWidth={0.5}
                    >
                      <title>1/{n.harmonicNum} = {n.freq.toFixed(1)} Hz (below A1 — visible only)</title>
                    </circle>
                  </g>
                );
              })}

              {inRange.map(n => {
                const y = yFromFreq(n.freq);
                const isRoot = rootFreq !== undefined && n.id === sorted[0].id;
                const isMenuOpen = menuNodeId === n.id;
                const edo_ = edoLabelFor(n.freq, edo);
                const ji = (isRoot || rootFreq === undefined)
                  ? null
                  : findJiRatio(n.freq / rootFreq, primeLimit);
                const ratioStr = isRoot
                  ? "1/1"
                  : (ji
                      ? formatJiRatio(ji)
                      : (rootFreq !== undefined
                          ? `+${(1200 * Math.log2(n.freq / rootFreq)).toFixed(1)}¢`
                          : ""));
                const edoStr = `${edo_.name}${
                  Math.abs(edo_.drift) < 1
                    ? ""
                    : ` ${edo_.drift >= 0 ? "+" : "−"}${Math.abs(edo_.drift).toFixed(1)}¢`
                }`;
                const rows: string[] = [];
                rows.push(`${n.freq.toFixed(1)} Hz`);
                if (labelMode !== "ji") rows.push(edoStr);
                if (labelMode !== "edo") rows.push(ratioStr);
                const rowH = 12;
                const yOff = -((rows.length - 1) * rowH) / 2;
                return (
                  <g key={n.id}>
                    <line
                      x1={50} x2={50 + STRIP_W}
                      y1={y} y2={y}
                      stroke={n.harmonicOf ? "#7173e6" : "#55aa88"}
                      strokeWidth={1.5}
                    />
                    <circle
                      cx={cx} cy={y}
                      r={isMenuOpen ? 8 : 6}
                      fill={isRoot ? "#c8aa50" : (n.harmonicOf ? "#7173e6" : "#55aa88")}
                      stroke={isMenuOpen ? "#fff" : "#0a0a0a"}
                      strokeWidth={2}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuNodeId(prev => prev === n.id ? null : n.id);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <title>Click for options.</title>
                    </circle>
                    {rows.map((text, i) => (
                      <text
                        key={i}
                        x={labelX}
                        y={y + yOff + i * rowH + 4}
                        fill={
                          i === 0 ? "#aaa"
                          : (rows[i] === ratioStr ? "#c8aa50" : "#9999ee")
                        }
                        fontSize={i === 0 ? 11 : 10}
                        fontFamily="monospace"
                      >
                        {text}
                      </text>
                    ))}
                  </g>
                );
              })}
            </>
          );
        })()}
      </svg>

      {(() => {
        if (!menuNodeId) return null;
        const node = nodes.find(n => n.id === menuNodeId);
        if (!node || node.outOfRange) return null;
        const y = yFromFreq(node.freq);
        // Anchor the menu to the right of the strip + label area, then
        // clamp vertically so it fits inside the strip's height even
        // when the source node is near the top or bottom.
        const MENU_W = 220;
        const MENU_H_EST = 240;
        const left = 50 + STRIP_W + 200;
        let top = y - MENU_H_EST / 2;
        if (top < 4) top = 4;
        if (top + MENU_H_EST > STRIP_H - 4) top = STRIP_H - 4 - MENU_H_EST;
        return (
          <div
            className="absolute bg-[#161616] border border-[#3a3a3a] rounded shadow-lg p-2 space-y-1 z-10"
            style={{ left, top, width: MENU_W }}
            onClick={e => e.stopPropagation()}
          >
            <div className="text-[10px] text-[#777] px-1 pb-1 border-b border-[#2a2a2a]">
              Node @ {node.freq.toFixed(1)} Hz
            </div>

            <div className="text-[9px] text-[#666] px-1 pt-1">Harmonic series above</div>
            <div className="flex gap-1">
              {HARMONIC_PRESET_COUNTS.map(c => (
                <button key={c}
                  onClick={() => addHarmonicSeries(node.id, c, false)}
                  className="flex-1 px-1 py-1 text-[10px] rounded bg-[#1e1e1e] border border-[#333] text-[#aaa] hover:bg-[#7173e622] hover:border-[#7173e6] hover:text-[#9999ee]"
                >
                  h2-{c}
                </button>
              ))}
            </div>

            <div className="text-[9px] text-[#666] px-1 pt-1">Sub-harmonics below</div>
            <div className="flex gap-1">
              {HARMONIC_PRESET_COUNTS.map(c => (
                <button key={c}
                  onClick={() => addHarmonicSeries(node.id, c, true)}
                  className="flex-1 px-1 py-1 text-[10px] rounded bg-[#1e1e1e] border border-[#333] text-[#aaa] hover:bg-[#7173e622] hover:border-[#7173e6] hover:text-[#9999ee]"
                >
                  1/2-{c}
                </button>
              ))}
            </div>

            <div className="pt-1 border-t border-[#2a2a2a] flex gap-1">
              <button
                onClick={() => removeNode(node.id)}
                className="flex-1 px-2 py-1 text-[10px] rounded bg-[#2a1414] border border-[#552020] text-[#c08080] hover:bg-[#3a1818]"
              >
                Delete{nodes.some(n => n.harmonicOf === node.id) ? " (and its series)" : ""}
              </button>
              <button
                onClick={() => setMenuNodeId(null)}
                className="px-2 py-1 text-[10px] rounded bg-[#1e1e1e] border border-[#333] text-[#888]"
              >
                Close
              </button>
            </div>
          </div>
        );
      })()}
      </div>

      <p className="text-[10px] text-[#444]">
        Click strip = add node · Click node = open menu (harmonic series, delete) · Out-of-range partials shown as small grey dots above/below the strip
      </p>
    </div>
  );
}
