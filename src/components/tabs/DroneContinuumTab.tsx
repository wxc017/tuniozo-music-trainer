// Drone Continuum — horizontal pitch strip from A1 (55 Hz, left) to A6
// (1760 Hz, right).  Click anywhere on the strip to place a node; nodes
// drone simultaneously via the existing sample-based audio engine, which
// pitch-shifts each sample to the exact target frequency.  No 12-TET /
// EDO assumption in the audio path: every node is its own continuous
// frequency.
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
// app's tonal-system note names (the EDO grid is C-anchored even though
// the strip's left and right ends happen to be A1 and A6 — that's just
// where the user mentally places the range).
const C4_HZ = 261.63;
const freqToAbsPc = (f: number, edo: number) =>
  4 * edo + edo * Math.log2(f / C4_HZ);
const absPcToFreq = (pc: number, edo: number) =>
  C4_HZ * Math.pow(2, (pc - 4 * edo) / edo);

// Horizontal layout.  STRIP_W is dynamic — measured from the container
// at mount and on resize so the strip always fills the available width
// without horizontal scrolling.  All other dimensions are fixed pixels.
//   STRIP_X .. STRIP_X+STRIP_W   = clickable strip (log-frequency axis)
//   y=0..STRIP_Y_TOP             = octave anchors + JI ruler header
//   y=STRIP_Y_TOP..STRIP_Y_BOT   = strip body (gridlines, node circles)
//   y=STRIP_Y_BOT..NODE_LABEL_Y  = per-EDO-step note labels (rotated -90)
//   y=NODE_LABEL_Y..             = per-node label rows + leader lines
const STRIP_X      = 70;
const STRIP_RIGHT  = 70;
const STRIP_Y_TOP  = 90;
const STRIP_H      = 130;
const STRIP_Y_BOT  = STRIP_Y_TOP + STRIP_H;
const STEP_LABEL_H = 88;
const NODE_LABEL_Y = STRIP_Y_BOT + STEP_LABEL_H + 8;
const NODE_LABEL_H = 80;
const SVG_H = NODE_LABEL_Y + NODE_LABEL_H;

// xFromFreq / freqFromX are defined inside the component as closures
// over the dynamic stripW measurement.

const snapFreqToEdo = (f: number, edo: number): number =>
  absPcToFreq(Math.round(freqToAbsPc(f, edo)), edo);

// EDO note name + signed cents drift between `freq` and the nearest
// C-anchored EDO step.  Octave numbers count from C0 to match the
// app's standard absolute-pitch convention.
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
  harmonicOf?: string;
  harmonicNum?: number;
  subharmonic?: boolean;
  chordOf?: string;
  chordIndex?: number;
  outOfRange?: boolean;
}

let nextId = 1;
const makeId = () => `n${nextId++}`;

const HARMONIC_PRESET_COUNTS = [4, 8, 12, 16, 24] as const;

interface ChordPreset { id: string; label: string; ratios: number[] }
const CHORD_LIBRARY: ChordPreset[] = [
  { id: "M",    label: "Maj 4:5:6",         ratios: [1, 5/4, 3/2] },
  { id: "m",    label: "Min 10:12:15",      ratios: [1, 6/5, 3/2] },
  { id: "ms",   label: "Sept-min 6:7:9",    ratios: [1, 7/6, 3/2] },
  { id: "sus",  label: "Sus 6:8:9",         ratios: [1, 4/3, 3/2] },
  { id: "Maj7", label: "Maj7 8:10:12:15",   ratios: [1, 5/4, 3/2, 15/8] },
  { id: "Min7", label: "Min7 10:12:15:18",  ratios: [1, 6/5, 3/2, 9/5] },
  { id: "Dom7", label: "Sept-7 4:5:6:7",    ratios: [1, 5/4, 3/2, 7/4] },
  { id: "h7",   label: "Half-dim 5:6:7:9",  ratios: [1, 6/5, 7/5, 9/5] },
  { id: "d7",   label: "Trideci 7:9:11:13", ratios: [1, 9/7, 11/7, 13/7] },
  { id: "Ot",   label: "Otonal 4:5:6:7:9",  ratios: [1, 5/4, 3/2, 7/4, 9/4] },
  { id: "Ut",   label: "Utonal 7:6:5:4",    ratios: [1, 7/6, 7/5, 7/4] },
];

export default function DroneContinuumTab({ edo, ensureAudio }: Props) {
  const [nodes, setNodes] = useState<DroneNode[]>([]);
  const [droneOn, setDroneOn] = useLS<boolean>("lt_dc_on", true);
  const [gain, setGain] = useLS<number>("lt_dc_gain", 0.18);
  const [showEdoGrid, setShowEdoGrid] = useLS<boolean>("lt_dc_edoGrid", true);
  const [snapToEdo, setSnapToEdo] = useLS<boolean>("lt_dc_snap", false);
  const [showJiRulers, setShowJiRulers] = useLS<boolean>("lt_dc_jiRulers", false);
  const [showStepNames, setShowStepNames] = useLS<boolean>("lt_dc_stepNames", true);
  const [labelMode, setLabelMode] = useLS<"both" | "edo" | "ji">("lt_dc_labelMode", "both");
  const [primeLimit, setPrimeLimit] = useLS<number>("lt_dc_primeLimit", 13);
  const [menuNodeId, setMenuNodeId] = useState<string | null>(null);
  const [chordTuning, setChordTuning] = useLS<"ji" | "edo">("lt_dc_chordTuning", "ji");
  const stripRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const droneActiveRef = useRef(false);

  // Measured container width — drives the SVG width so the strip always
  // fits the available space without horizontal scrolling.
  const [containerWidth, setContainerWidth] = useState(1200);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(Math.max(600, el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const SVG_W   = containerWidth;
  const STRIP_W = SVG_W - STRIP_X - STRIP_RIGHT;
  const cy = STRIP_Y_TOP + STRIP_H / 2;
  const TICK_HALF        = 9;   // half-height of an EDO step tick (snare-notation style)
  const OCTAVE_TICK_HALF = 22;  // taller ticks for A1..A6 octave anchors

  const xFromFreq = (f: number): number =>
    STRIP_X + (Math.log2(f / A1_HZ) / STRIP_OCTAVES) * STRIP_W;
  const freqFromX = (x: number): number =>
    A1_HZ * Math.pow(2, ((x - STRIP_X) / STRIP_W) * STRIP_OCTAVES);

  // Restart the drone whenever the active node set, gain, or on/off changes.
  // startRatioDrone tears down the previous voices internally, so this is
  // a single atomic update — no incremental add/remove plumbing needed.
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
    let freq = freqFromX(local.x);
    if (!isFinite(freq) || freq < A1_HZ * 0.99 || freq > A6_HZ * 1.01) return;
    if (snapToEdo) freq = snapFreqToEdo(freq, edo);
    setNodes(prev => [...prev, { id: makeId(), freq }]);
    setMenuNodeId(null);
  }, [snapToEdo, edo]);

  const isChildOf = (n: DroneNode, parentId: string) =>
    n.harmonicOf === parentId || n.chordOf === parentId;

  const removeNode = (id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id && !isChildOf(n, id)));
    setMenuNodeId(null);
  };

  const clearAll = () => { setNodes([]); setMenuNodeId(null); };

  const addHarmonicSeries = (parentId: string, count: number, below: boolean) => {
    setNodes(prev => {
      const parent = prev.find(n => n.id === parentId);
      if (!parent) return prev;
      const filtered = prev.filter(n => !isChildOf(n, parentId));
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

  const spawnChord = (parentId: string, chord: ChordPreset) => {
    setNodes(prev => {
      const parent = prev.find(n => n.id === parentId);
      if (!parent) return prev;
      const filtered = prev.filter(n => !isChildOf(n, parentId));
      const additions: DroneNode[] = chord.ratios.slice(1).map((r, idx) => {
        const ideal = parent.freq * r;
        const finalFreq = chordTuning === "edo" ? snapFreqToEdo(ideal, edo) : ideal;
        const outOfRange = finalFreq > A6_HZ * 1.001 || finalFreq < A1_HZ * 0.999;
        return {
          id: makeId(),
          freq: finalFreq,
          chordOf: parentId,
          chordIndex: idx + 1,
          outOfRange,
        };
      });
      return [...filtered, ...additions];
    });
    setMenuNodeId(null);
  };

  // ── Visual layout precomputation ──────────────────────────────────

  // Octave anchor labels (A1, A2, ..., A6) at exact A frequencies.
  const octaveTicks = Array.from({ length: 6 }, (_, i) => {
    const f = A1_HZ * Math.pow(2, i);
    return { x: xFromFreq(f), label: `A${i + 1}` };
  });

  // EDO grid + per-step note labels.  Iterate C-anchored EDO steps that
  // fall inside [A1, A6].  Each step gets:
  //   - a vertical gridline through the strip body
  //   - a small note-name label below the strip (rotated -90 so dense
  //     EDOs like 41 / 53 don't collide horizontally)
  // P5 steps within each octave (the "G" of every octave) get a
  // brighter stroke so the user has a sub-octave reference.
  const edoSteps: { x: number; pc: number; isP5: boolean; label: string }[] = [];
  if (showEdoGrid || showStepNames) {
    const minPc = Math.ceil(freqToAbsPc(A1_HZ, edo));
    const maxPc = Math.floor(freqToAbsPc(A6_HZ, edo));
    const p5Step = Math.round(edo * Math.log2(3 / 2));
    for (let pc = minPc; pc <= maxPc; pc++) {
      const f = absPcToFreq(pc, edo);
      const stepInOct = ((pc % edo) + edo) % edo;
      const oct = Math.floor(pc / edo);
      const label = `${pcToNoteName(stepInOct, edo)}${oct}`;
      edoSteps.push({ x: xFromFreq(f), pc, isP5: stepInOct === p5Step, label });
    }
  }

  // JI harmonic ruler — partials of A1 from h2 up to whatever fits in
  // A6 (h32 lands exactly on A6 since 32*55 = 1760).  Subset the dense
  // upper region: above h16, label only h20/h24/h28/h32 to avoid clutter.
  const jiTicks: { x: number; harmonic: number; labelled: boolean }[] = [];
  if (showJiRulers) {
    for (let h = 2; h <= 32; h++) {
      const f = A1_HZ * h;
      if (f > A6_HZ * 1.001) break;
      const labelled = h <= 16 || h % 4 === 0;
      jiTicks.push({ x: xFromFreq(f), harmonic: h, labelled });
    }
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#666]">
        Click anywhere on the strip to place a sustained drone between A1 (55 Hz) and A6 (1760 Hz).
        Multiple nodes drone simultaneously — train ordering low/high, hear real harmonic stacks, and
        compare JI ratios against the {edo}-EDO grid.
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
          onClick={() => setShowStepNames(!showStepNames)}
          className={`px-2 py-1 rounded text-[11px] border transition-colors ${
            showStepNames
              ? "border-[#7173e6] bg-[#7173e622] text-[#9999ee]"
              : "border-[#2a2a2a] bg-[#111] text-[#666] hover:text-[#aaa]"
          }`}
        >
          Step names
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

        <div className="w-px h-4 bg-[#2a2a2a] mx-1" />

        <span className="text-[10px] text-[#555]">Chord tuning</span>
        <div className="flex rounded overflow-hidden border border-[#333]">
          {(["ji", "edo"] as const).map(t => (
            <button key={t}
              onClick={() => setChordTuning(t)}
              className={`px-2 py-1 text-[10px] transition-colors ${
                chordTuning === t ? "bg-[#cc7755] text-white" : "bg-[#1e1e1e] text-[#888] hover:text-[#ccc]"
              }`}
              title={t === "ji"
                ? "Spawned chords play exact JI ratios"
                : `Spawned chords snap each tone to the nearest ${edo}-EDO step`}
            >
              {t === "ji" ? "JI" : `${edo}-EDO`}
            </button>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="relative" style={{ width: "100%", height: SVG_H }}>
      <svg
        ref={stripRef}
        width={SVG_W}
        height={SVG_H}
        className="bg-[#0a0a0a] rounded border border-[#1a1a1a] select-none"
        style={{ display: "block" }}
        onClick={() => setMenuNodeId(null)}
      >
        {/* Centerline — single thin baseline through the strip. */}
        <line
          x1={STRIP_X} x2={STRIP_X + STRIP_W}
          y1={cy} y2={cy}
          stroke="#2a2a2a" strokeWidth={1}
        />

        {/* EDO step ticks — small discrete vertical lines centered on
            the baseline (snare-notation style).  Octave anchors at
            A1..A6 get longer ticks; P5 steps get a brighter color. */}
        {showEdoGrid && edoSteps.map((s, i) => (
          <line
            key={`edo${i}`}
            x1={s.x} x2={s.x}
            y1={cy - TICK_HALF} y2={cy + TICK_HALF}
            stroke={s.isP5 ? "#5a6e9a" : "#3a3a3a"}
            strokeWidth={s.isP5 ? 1 : 0.7}
          />
        ))}

        {/* Octave anchor ticks — taller than EDO step ticks; A1..A6
            label sits above. */}
        {octaveTicks.map(t => (
          <g key={t.label}>
            <line
              x1={t.x} x2={t.x}
              y1={cy - OCTAVE_TICK_HALF} y2={cy + OCTAVE_TICK_HALF}
              stroke="#888" strokeWidth={1.5}
            />
            <text
              x={t.x} y={cy - OCTAVE_TICK_HALF - 6}
              fill="#aaa" fontSize={11} fontFamily="monospace"
              textAnchor="middle"
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* Per-EDO-step note labels — rotated -90° so they read
            bottom-to-top alongside each gridline.  Anchor at the
            bottom of the step-label zone (textAnchor=start) so longer
            labels all align flush at the deep end. */}
        {showStepNames && edoSteps.map((s, i) => {
          const anchorY = STRIP_Y_BOT + STEP_LABEL_H - 4;
          return (
            <text
              key={`name${i}`}
              x={s.x} y={anchorY}
              fill={s.isP5 ? "#9aa6cc" : "#888"}
              fontSize={10} fontFamily="monospace"
              textAnchor="start"
              transform={`rotate(-90 ${s.x} ${anchorY})`}
            >
              {s.label}
            </text>
          );
        })}

        {/* JI harmonic ruler — above the strip.  Tick + h-number for
            each in-range partial of A1. */}
        {jiTicks.map(jt => (
          <g key={`ji${jt.harmonic}`}>
            <line
              x1={jt.x} x2={jt.x}
              y1={STRIP_Y_TOP - 22} y2={STRIP_Y_TOP - 4}
              stroke="#c8aa5066" strokeWidth={1}
            />
            {jt.labelled && (
              <text
                x={jt.x} y={STRIP_Y_TOP - 26}
                fill="#c8aa5099" fontSize={9} fontFamily="monospace"
                textAnchor="middle"
              >
                h{jt.harmonic}
              </text>
            )}
          </g>
        ))}

        {/* Invisible click-target rect spanning the strip's full
            vertical band — generous click zone even though the visible
            strip is just a thin row of ticks. */}
        <rect
          x={STRIP_X} y={STRIP_Y_TOP}
          width={STRIP_W} height={STRIP_H}
          fill="transparent"
          onClick={onStripClick}
          style={{ cursor: "crosshair" }}
        />

        {/* Nodes + per-node labels + out-of-range dots. */}
        {(() => {
          if (!nodes.length) return null;
          const inRange = nodes.filter(n => !n.outOfRange);
          const oor = nodes.filter(n => n.outOfRange);
          const sorted = [...inRange].sort((a, b) => a.freq - b.freq);
          const rootFreq = sorted[0]?.freq;

          // Out-of-range dots — sub-harmonics on the left margin,
          // super-harmonics on the right margin.  Stacked vertically
          // so series of multiple OOR partials don't overlap.
          const oorBelow = oor.filter(n =>  n.subharmonic);
          const oorAbove = oor.filter(n => !n.subharmonic);

          return (
            <>
              {oorBelow.map((n, i) => {
                const y = cy + (i - (oorBelow.length - 1) / 2) * 9;
                return (
                  <circle
                    key={n.id}
                    cx={STRIP_X - 14} cy={y} r={2.5}
                    fill="#444" stroke="#222" strokeWidth={0.5}
                  >
                    <title>1/{n.harmonicNum} = {n.freq.toFixed(1)} Hz (below A1 — visible only)</title>
                  </circle>
                );
              })}
              {oorAbove.map((n, i) => {
                const y = cy + (i - (oorAbove.length - 1) / 2) * 9;
                return (
                  <circle
                    key={n.id}
                    cx={STRIP_X + STRIP_W + 14} cy={y} r={2.5}
                    fill="#444" stroke="#222" strokeWidth={0.5}
                  >
                    <title>h{n.harmonicNum} = {n.freq.toFixed(1)} Hz (above A6 — visible only)</title>
                  </circle>
                );
              })}

              {inRange.map(n => {
                const x = xFromFreq(n.freq);
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
                const rows: string[] = [`${n.freq.toFixed(1)} Hz`];
                if (labelMode !== "ji") rows.push(edoStr);
                if (labelMode !== "edo") rows.push(ratioStr);
                const fillColor = isRoot
                  ? "#c8aa50"
                  : (n.chordOf ? "#cc7755" : (n.harmonicOf ? "#7173e6" : "#55aa88"));
                return (
                  <g key={n.id}>
                    {/* Vertical highlight stripe through the strip body. */}
                    <line
                      x1={x} x2={x}
                      y1={STRIP_Y_TOP} y2={STRIP_Y_BOT}
                      stroke={fillColor} strokeWidth={1.5} opacity={0.55}
                    />
                    {/* Leader line from node down to its label group. */}
                    <line
                      x1={x} x2={x}
                      y1={STRIP_Y_BOT}
                      y2={NODE_LABEL_Y - 2}
                      stroke={fillColor} strokeWidth={0.5} opacity={0.4}
                    />
                    <circle
                      cx={x} cy={cy}
                      r={isMenuOpen ? 8 : 6}
                      fill={fillColor}
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
                        x={x}
                        y={NODE_LABEL_Y + i * 13 + 4}
                        fill={
                          i === 0 ? "#aaa"
                          : (rows[i] === ratioStr ? "#c8aa50" : "#9999ee")
                        }
                        fontSize={i === 0 ? 11 : 10}
                        fontFamily="monospace"
                        textAnchor="middle"
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
        // Anchor the menu below the node, clamped horizontally so it
        // doesn't fall off either edge of the SVG.
        const x = xFromFreq(node.freq);
        const MENU_W = 240;
        const MENU_H_EST = 320;
        let left = x - MENU_W / 2;
        if (left < 4) left = 4;
        if (left + MENU_W > SVG_W - 4) left = SVG_W - 4 - MENU_W;
        // Prefer below the strip.  If that overflows, place above.
        const belowTop = NODE_LABEL_Y + NODE_LABEL_H + 4;
        const fitsBelow = belowTop + MENU_H_EST <= SVG_H + 200;  // allow brief overflow
        const top = fitsBelow ? belowTop : Math.max(4, STRIP_Y_TOP - MENU_H_EST - 4);
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

            <div className="text-[9px] text-[#666] px-1 pt-1">
              Chord (root = this node, {chordTuning === "ji" ? "exact JI" : `${edo}-EDO snap`})
            </div>
            <div className="grid grid-cols-2 gap-1">
              {CHORD_LIBRARY.map(c => (
                <button key={c.id}
                  onClick={() => spawnChord(node.id, c)}
                  className="px-1 py-1 text-[9px] rounded bg-[#1e1e1e] border border-[#333] text-[#aaa] hover:bg-[#cc775522] hover:border-[#cc7755] hover:text-[#cc9966] text-left font-mono"
                  title={c.label}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="pt-1 border-t border-[#2a2a2a] flex gap-1">
              <button
                onClick={() => removeNode(node.id)}
                className="flex-1 px-2 py-1 text-[10px] rounded bg-[#2a1414] border border-[#552020] text-[#c08080] hover:bg-[#3a1818]"
              >
                Delete{nodes.some(n => isChildOf(n, node.id)) ? " (and its overlay)" : ""}
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
    </div>
  );
}
