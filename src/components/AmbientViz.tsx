// ── Ambient decorative visualizations for Drill & Response panels ──
// These are purely visual — they don't reveal exercise answers.

import { useMemo, useEffect, useRef, useState } from "react";

// ── Rhythm: BPM pulse ring + beat dots ────────────────────────────────

interface BpmPulseProps {
  bpm: number;
  /** Label shown below, e.g. "Comparison" */
  label?: string;
}

/**
 * A small animated ring that pulses at the current BPM.
 * Purely decorative — shows tempo as a visual rhythm.
 */
export function BpmPulse({ bpm, label }: BpmPulseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const startRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 64, H = 64;
    canvas.width = W;
    canvas.height = H;
    const cx = W / 2, cy = H / 2;
    const R = 24;
    const secPerBeat = 60 / bpm;

    startRef.current = performance.now() / 1000;

    const draw = () => {
      const now = performance.now() / 1000;
      const elapsed = now - startRef.current;
      const phase = (elapsed % secPerBeat) / secPerBeat; // 0..1

      ctx.clearRect(0, 0, W, H);

      // Outer ring — faint
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(113,115,230,0.15)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Pulse ring — expands and fades on each beat
      const pulseR = R + phase * 8;
      const pulseAlpha = Math.max(0, 0.5 * (1 - phase));
      ctx.beginPath();
      ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(113,115,230,${pulseAlpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Center dot — bright on downbeat, fades
      const dotAlpha = 0.2 + 0.8 * Math.max(0, 1 - phase * 3);
      const dotR = 4 + 2 * Math.max(0, 1 - phase * 4);
      ctx.beginPath();
      ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(113,115,230,${dotAlpha})`;
      ctx.fill();

      // Sweep arc — shows progress through beat
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + phase * Math.PI * 2);
      ctx.strokeStyle = `rgba(113,115,230,${0.3 + 0.3 * (1 - phase)})`;
      ctx.lineWidth = 3;
      ctx.stroke();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [bpm]);

  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <canvas ref={canvasRef} style={{ width: 64, height: 64 }} />
      <span className="text-[9px] text-[#444] font-mono">{bpm} bpm</span>
      {label && <span className="text-[8px] text-[#333]">{label}</span>}
    </div>
  );
}

// ── Rhythm: Metre glyph ──────────────────────────────────────────────

interface MetreGlyphProps {
  /** Number of macrobeats, e.g. 2 for duple, 3 for triple */
  macrobeats?: number;
  /** Microbeats per macro, e.g. 2 or 3 */
  microPerMacro?: number;
  /** Short label, e.g. "Duple" */
  label?: string;
}

/**
 * A small static glyph showing a metre pattern as concentric dots.
 * Decorative — just hints at the metre family being trained.
 */
export function MetreGlyph({ macrobeats = 4, microPerMacro = 2, label }: MetreGlyphProps) {
  const W = 64, H = 64;
  const cx = W / 2, cy = H / 2;
  const outerR = 22;
  const innerR = 13;

  const macroDots = useMemo(() => {
    const dots = [];
    for (let i = 0; i < macrobeats; i++) {
      const angle = (i / macrobeats) * Math.PI * 2 - Math.PI / 2;
      dots.push({ x: cx + outerR * Math.cos(angle), y: cy + outerR * Math.sin(angle) });
    }
    return dots;
  }, [macrobeats]);

  const microDots = useMemo(() => {
    const dots = [];
    const total = macrobeats * microPerMacro;
    for (let i = 0; i < total; i++) {
      const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
      dots.push({ x: cx + innerR * Math.cos(angle), y: cy + innerR * Math.sin(angle) });
    }
    return dots;
  }, [macrobeats, microPerMacro]);

  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* Guide rings */}
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="#1a1a1a" strokeWidth={0.5} />
        <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="#141414" strokeWidth={0.5} />
        {/* Micro dots */}
        {microDots.map((d, i) => (
          <circle key={`m-${i}`} cx={d.x} cy={d.y} r={2} fill="#5a8a5a" opacity={0.35} />
        ))}
        {/* Macro dots */}
        {macroDots.map((d, i) => (
          <circle key={`M-${i}`} cx={d.x} cy={d.y} r={3.5}
            fill={i === 0 ? "#7173e6" : "#7173e6"} opacity={i === 0 ? 0.9 : 0.5} />
        ))}
      </svg>
      {label && <span className="text-[8px] text-[#333]">{label}</span>}
    </div>
  );
}

// ── Rhythm: Waveform strip ────────────────────────────────────────────

interface WaveformStripProps {
  /** Number of bars to show */
  bars?: number;
  /** Seed for deterministic pattern */
  seed?: number;
}

/**
 * A small decorative waveform strip — static, deterministic.
 * Looks like an audio waveform or beat intensity graph.
 */
export function WaveformStrip({ bars = 32, seed = 42 }: WaveformStripProps) {
  const heights = useMemo(() => {
    // Simple seeded random for deterministic decorative pattern
    let s = seed;
    const next = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s >> 16) / 32767; };
    return Array.from({ length: bars }, () => 0.15 + next() * 0.85);
  }, [bars, seed]);

  return (
    <div className="flex items-end gap-px h-6">
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: `${h * 100}%`,
            backgroundColor: "#7173e6",
            opacity: 0.15 + h * 0.2,
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}

// ── Tonal: Pitch class circle ─────────────────────────────────────────

interface PitchClassCircleProps {
  /** Tonic pitch class (0 = C in 12-EDO) */
  tonicPc: number;
  /** EDO system size */
  edo: number;
  /** Optional highlighted scale degrees (array of pitch classes) */
  highlighted?: number[];
  /** Size in px */
  size?: number;
}

const PC_LABELS_12 = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * A small circle showing all pitch classes in the current EDO,
 * with the tonic highlighted. Decorative context — doesn't reveal answers.
 */
export function PitchClassCircle({ tonicPc, edo, highlighted, size: sizeProp }: PitchClassCircleProps) {
  const size = sizeProp ?? 72;
  const cx = size / 2, cy = size / 2;
  const R = size / 2 - 10;

  const dots = useMemo(() => {
    const result = [];
    for (let i = 0; i < edo; i++) {
      const angle = (i / edo) * Math.PI * 2 - Math.PI / 2;
      const isTonic = i === tonicPc;
      const isHighlighted = highlighted?.includes(i);
      result.push({
        x: cx + R * Math.cos(angle),
        y: cy + R * Math.sin(angle),
        pc: i,
        isTonic,
        isHighlighted: isHighlighted || isTonic,
        label: edo === 12 ? PC_LABELS_12[i] : null,
      });
    }
    return result;
  }, [edo, tonicPc, highlighted, cx, cy, R]);

  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Guide circle */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#1a1a1a" strokeWidth={0.5} />

        {/* Pitch class dots */}
        {dots.map(d => (
          <g key={d.pc}>
            {d.isTonic && (
              <circle cx={d.x} cy={d.y} r={7} fill="#c8aa50" opacity={0.15} />
            )}
            <circle
              cx={d.x} cy={d.y}
              r={d.isTonic ? 4 : d.isHighlighted ? 3 : 2}
              fill={d.isTonic ? "#c8aa50" : d.isHighlighted ? "#c8aa5088" : "#333"}
              opacity={d.isTonic ? 1 : 0.6}
            />
            {/* Labels only for 12-EDO and only tonic */}
            {d.isTonic && d.label && (
              <text
                x={cx + (R + 9) * Math.cos((d.pc / edo) * Math.PI * 2 - Math.PI / 2)}
                y={cy + (R + 9) * Math.sin((d.pc / edo) * Math.PI * 2 - Math.PI / 2)}
                textAnchor="middle" dominantBaseline="middle"
                fill="#c8aa50" fontSize={7} fontFamily="monospace" fontWeight="bold"
              >
                {d.label}
              </text>
            )}
          </g>
        ))}

        {/* Center label */}
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
          fill="#333" fontSize={8} fontFamily="monospace">
          {edo}
        </text>
      </svg>
    </div>
  );
}

// ── Tonal: Harmonic function arcs ────────────────────────────────────

interface HarmonicArcsProps {
  /** Which functions to show */
  functions?: string[];
}

const FUNC_COLORS: Record<string, string> = {
  I: "#5a8a5a",
  IV: "#8a8a5a",
  V: "#5a5a8a",
  vi: "#8a5a5a",
  ii: "#5a7a8a",
  iii: "#7a5a8a",
};

/**
 * Decorative arcs showing harmonic function relationships.
 * Static — just shows the function labels.
 */
export function HarmonicArcs({ functions = ["I", "IV", "V", "vi"] }: HarmonicArcsProps) {
  const W = 120, H = 48;
  const y = H / 2;
  const spacing = W / (functions.length + 1);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* Connection arcs */}
      {functions.map((_, i) => {
        if (i === functions.length - 1) return null;
        const x1 = spacing * (i + 1);
        const x2 = spacing * (i + 2);
        const mid = (x1 + x2) / 2;
        const curveY = y - 12;
        return (
          <path
            key={`arc-${i}`}
            d={`M ${x1} ${y} Q ${mid} ${curveY} ${x2} ${y}`}
            fill="none" stroke="#222" strokeWidth={1}
          />
        );
      })}
      {/* Function dots + labels */}
      {functions.map((fn, i) => {
        const x = spacing * (i + 1);
        const color = FUNC_COLORS[fn] || "#555";
        return (
          <g key={fn}>
            <circle cx={x} cy={y} r={4} fill={color} opacity={0.4} />
            <text x={x} y={y + 14} textAnchor="middle" fill={color} fontSize={8}
              fontFamily="monospace" fontWeight="bold" opacity={0.6}>
              {fn}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Tuning: Cents ruler ──────────────────────────────────────────────

interface CentsRulerProps {
  /** EDO to show divisions for */
  edo?: number;
  /** Width in px */
  width?: number;
}

/**
 * A small decorative cents ruler showing EDO divisions across an octave.
 * Static — just illustrates the tuning system.
 */
export function CentsRuler({ edo = 12, width = 200 }: CentsRulerProps) {
  const H = 32;
  const pad = 8;
  const usable = width - pad * 2;

  const ticks = useMemo(() => {
    const result = [];
    const step = 1200 / edo;
    for (let i = 0; i <= edo; i++) {
      const cents = i * step;
      const x = pad + (cents / 1200) * usable;
      const isOctave = i === 0 || i === edo;
      const isFifth = edo === 12 && i === 7;
      const isFourth = edo === 12 && i === 5;
      result.push({ x, cents, i, isOctave, isFifth, isFourth });
    }
    return result;
  }, [edo, usable]);

  // JI reference lines
  const jiRefs = useMemo(() => {
    const refs = [
      { cents: 386.31, label: "5/4", color: "#5a8a5a" },  // just major third
      { cents: 498.04, label: "4/3", color: "#8a8a5a" },  // just fourth
      { cents: 701.96, label: "3/2", color: "#5a5a8a" },  // just fifth
    ];
    return refs.map(r => ({
      ...r,
      x: pad + (r.cents / 1200) * usable,
    }));
  }, [usable]);

  return (
    <div className="inline-flex flex-col items-center">
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`}>
        {/* Baseline */}
        <line x1={pad} y1={18} x2={width - pad} y2={18} stroke="#222" strokeWidth={1} />

        {/* JI reference marks */}
        {jiRefs.map(ref => (
          <g key={ref.label}>
            <line x1={ref.x} y1={10} x2={ref.x} y2={26} stroke={ref.color} strokeWidth={1} opacity={0.3} />
            <text x={ref.x} y={8} textAnchor="middle" fill={ref.color} fontSize={6}
              fontFamily="monospace" opacity={0.4}>
              {ref.label}
            </text>
          </g>
        ))}

        {/* EDO ticks */}
        {ticks.map(t => (
          <g key={t.i}>
            <line
              x1={t.x} y1={t.isOctave ? 12 : 15}
              x2={t.x} y2={t.isOctave ? 24 : 21}
              stroke={t.isOctave ? "#55aa88" : t.isFifth ? "#5a5a8a" : "#444"}
              strokeWidth={t.isOctave ? 2 : 1}
              opacity={t.isOctave ? 0.8 : 0.4}
            />
          </g>
        ))}

        {/* Labels */}
        <text x={pad} y={30} textAnchor="middle" fill="#444" fontSize={7} fontFamily="monospace">0c</text>
        <text x={width - pad} y={30} textAnchor="middle" fill="#444" fontSize={7} fontFamily="monospace">1200c</text>
      </svg>
      <span className="text-[8px] text-[#333] font-mono">{edo}-EDO</span>
    </div>
  );
}

// ── Composite ambient bars for each drill tab ────────────────────────

interface RhythmAmbientProps {
  bpm: number;
  subMode: string;
}

/**
 * Ambient decoration strip for rhythm drill panels.
 * Shows a BPM pulse, metre glyph, and decorative waveform.
 */
export function RhythmAmbient({ bpm, subMode }: RhythmAmbientProps) {
  // Choose metre hint based on sub-mode
  const metreHint = useMemo(() => {
    switch (subMode) {
      case "metre": return { macro: 3, micro: 2, label: "Metre" };
      case "layers": return { macro: 4, micro: 2, label: "Layers" };
      case "syllables": return { macro: 4, micro: 2, label: "Syllables" };
      case "elongations_rests": return { macro: 4, micro: 2, label: "Duration" };
      default: return { macro: 4, micro: 2, label: "Comparison" };
    }
  }, [subMode]);

  return (
    <div className="flex items-center gap-4 px-3 py-2 bg-[#0a0a0a] border border-[#161616] rounded-lg">
      <BpmPulse bpm={bpm} />
      <MetreGlyph macrobeats={metreHint.macro} microPerMacro={metreHint.micro} label={metreHint.label} />
      <div className="flex-1 flex justify-center opacity-60">
        <WaveformStrip bars={48} seed={bpm * 7 + subMode.length} />
      </div>
      <MetreGlyph macrobeats={3} microPerMacro={3} label="Triple" />
    </div>
  );
}

interface TonalAmbientProps {
  tonicPc: number;
  edo: number;
  subMode: string;
}

/**
 * Ambient decoration strip for tonal drill panels.
 * Shows pitch class circle, harmonic arcs, and a waveform.
 */
export function TonalAmbient({ tonicPc, edo, subMode }: TonalAmbientProps) {
  // Major scale highlighted degrees (for decoration only)
  const majorScale = useMemo(() => {
    if (edo !== 12) return undefined;
    const steps = [0, 2, 4, 5, 7, 9, 11];
    return steps.map(s => (s + tonicPc) % edo);
  }, [tonicPc, edo]);

  const funcs = useMemo(() => {
    switch (subMode) {
      case "function_id": return ["I", "IV", "V"];
      case "chord_loops": return ["I", "IV", "V", "vi"];
      case "modulation": return ["I", "V", "vi", "ii"];
      default: return ["I", "IV", "V", "vi"];
    }
  }, [subMode]);

  return (
    <div className="flex items-center gap-4 px-3 py-2 bg-[#0a0a0a] border border-[#161616] rounded-lg">
      <PitchClassCircle tonicPc={tonicPc} edo={edo} highlighted={majorScale} size={72} />
      <div className="flex-1 flex flex-col items-center gap-1">
        <HarmonicArcs functions={funcs} />
        <div className="opacity-50">
          <WaveformStrip bars={36} seed={tonicPc * 13 + edo} />
        </div>
      </div>
      <PitchClassCircle tonicPc={(tonicPc + (edo === 12 ? 7 : Math.round(edo * 7 / 12))) % edo} edo={edo} size={56} />
    </div>
  );
}

interface TuningAmbientProps {
  edo: number;
  tonicPc: number;
}

/**
 * Ambient decoration strip for tuning drill panels.
 * Shows a cents ruler and pitch class context.
 */
export function TuningAmbient({ edo, tonicPc }: TuningAmbientProps) {
  return (
    <div className="flex items-center gap-4 px-3 py-2 bg-[#0a0a0a] border border-[#161616] rounded-lg">
      <PitchClassCircle tonicPc={tonicPc} edo={edo} size={64} />
      <div className="flex-1 flex flex-col items-center gap-1">
        <CentsRuler edo={edo} width={220} />
        <div className="opacity-40">
          <WaveformStrip bars={40} seed={edo * 17} />
        </div>
      </div>
    </div>
  );
}
