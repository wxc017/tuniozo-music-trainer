// ── Inline 5-limit JI lattice viewer (small SVG, no Three.js) ────────────
//
// Quick visual companion to the Mode ID Show Answer reveal: takes a
// scale's degree labels + cents and plots them on a (3-axis × 5-axis)
// JI lattice grid.  Distinct from the full Harmonic Lattice game-mode
// component (LatticeView.tsx, R3F-based) — this is a static SVG chip
// meant to live inside other panels.
//
// 3-axis runs horizontally (each step = a perfect fifth, 3:2 ≈ 702¢).
// 5-axis runs vertically (each step = a major third, 5:4 ≈ 386¢).
// Each cell is labelled with its JI ratio relative to 1/1; cells the
// scale touches get highlighted with the degree label.  Notes that
// don't fit cleanly into 5-limit (septimal, neutral, tridecimal etc.)
// are projected onto their nearest 5-limit cell and marked with a
// distinct colour, with a footnote listing the actual JI ratios.

import React from "react";

interface ScaleTone {
  degree: string;     // e.g. "1", "b3", "#4"
  cents: number;      // exact cents above tonic in the original scale
}

interface PlottedTone {
  degree: string;
  cents: number;
  pos: [number, number];   // (3-axis, 5-axis) lattice position
  approximated: boolean;   // true if we projected onto nearest 5-limit cell
  approxRatio: string;     // closest 5-limit ratio
  approxCents: number;     // its cents
  errorCents: number;      // how far the actual tone is from this cell
}

const CENT_TOLERANCE = 6;  // closer than this and we treat the tone as 5-limit-pure

/** 5-limit ratio at lattice position (a, b), octave-reduced.  Returns
 *  the simplified "p/q" string and the cents value. */
function latticeRatioAt(a: number, b: number): { ratio: string; cents: number } {
  let num = 1, den = 1;
  if (a > 0) num *= 3 ** a; else den *= 3 ** -a;
  if (b > 0) num *= 5 ** b; else den *= 5 ** -b;
  // Octave-reduce into [1, 2)
  while (num >= den * 2) den *= 2;
  while (num < den) num *= 2;
  // Remove shared 2s
  while (num % 2 === 0 && den % 2 === 0) { num /= 2; den /= 2; }
  const cents = Math.log2(num / den) * 1200;
  return { ratio: `${num}/${den}`, cents };
}

/** Find the nearest lattice cell to a given cents value, preferring
 *  compact (low |a| + |b|) representations on near-ties so the picture
 *  stays readable. */
function nearestLatticePos(cents: number, range = 5): { pos: [number, number]; ratio: string; cellCents: number; error: number } {
  let best = { pos: [0, 0] as [number, number], ratio: "1/1", cellCents: 0, error: Math.abs(cents) };
  let bestScore = Math.abs(cents);
  for (let a = -range; a <= range; a++) {
    for (let b = -3; b <= 3; b++) {
      const { ratio, cents: c } = latticeRatioAt(a, b);
      const target = ((cents % 1200) + 1200) % 1200;
      const cellNorm = ((c % 1200) + 1200) % 1200;
      let err = Math.abs(cellNorm - target);
      if (err > 600) err = 1200 - err;
      const compactness = Math.abs(a) + Math.abs(b);
      const score = err + compactness * 0.001;
      if (score < bestScore) {
        best = { pos: [a, b], ratio, cellCents: c, error: err };
        bestScore = score;
      }
    }
  }
  return best;
}

function plotTones(tones: ScaleTone[]): PlottedTone[] {
  return tones.map(t => {
    const near = nearestLatticePos(t.cents);
    return {
      degree: t.degree,
      cents: t.cents,
      pos: near.pos,
      approximated: near.error > CENT_TOLERANCE,
      approxRatio: near.ratio,
      approxCents: near.cellCents,
      errorCents: near.error,
    };
  });
}

interface Props {
  /** Scale tones to plot — degree label + exact cents above tonic. */
  tones: ScaleTone[];
  /** Optional title shown above the grid. */
  title?: string;
  /** Tonic accent colour.  Default indigo. */
  accent?: string;
  /** When true, omit the explanatory footnote.  Default false. */
  compact?: boolean;
}

export default function JiScaleLattice({ tones, title, accent = "#7173e6", compact = false }: Props) {
  const plotted = plotTones(tones);
  // Bounding box of the plotted positions, padded by ±1 cell for context.
  const minA = Math.min(0, ...plotted.map(p => p.pos[0])) - 1;
  const maxA = Math.max(0, ...plotted.map(p => p.pos[0])) + 1;
  const minB = Math.min(0, ...plotted.map(p => p.pos[1])) - 1;
  const maxB = Math.max(0, ...plotted.map(p => p.pos[1])) + 1;
  const cols = maxA - minA + 1;
  const rows = maxB - minB + 1;

  const cellW = 60;
  const cellH = 34;
  const padding = 26;
  const width = cols * cellW + padding * 2;
  const height = rows * cellH + padding * 2;

  const xOf = (a: number) => padding + (a - minA) * cellW + cellW / 2;
  // Y inverted so +5-axis (major third up) appears HIGHER on screen.
  const yOf = (b: number) => padding + (maxB - b) * cellH + cellH / 2;

  const plottedByPos = new Map<string, PlottedTone>();
  for (const p of plotted) plottedByPos.set(`${p.pos[0]},${p.pos[1]}`, p);
  const approxNotes = plotted.filter(p => p.approximated);

  return (
    <div className="space-y-1.5">
      {title && <p className="text-[10px] text-[#888] font-medium tracking-wider">{title}</p>}
      <svg width={width} height={height} className="bg-[#0a0a0a] rounded border border-[#1a1a1a]">
        {/* Axis labels */}
        <text x={width / 2} y={12} textAnchor="middle" fill="#555" fontSize={9} fontFamily="monospace">
          3-axis (perfect fifth, 3:2) →
        </text>
        <text x={11} y={height / 2} textAnchor="middle" fill="#555" fontSize={9} fontFamily="monospace"
          transform={`rotate(-90 11 ${height / 2})`}>
          5-axis (major third, 5:4) →
        </text>

        {/* Grid cells — every (a, b) in the bounding box gets drawn so the
            tones have spatial context against unfilled lattice cells. */}
        {Array.from({ length: rows }, (_, ri) => {
          const b = maxB - ri;
          return Array.from({ length: cols }, (_, ci) => {
            const a = minA + ci;
            const { ratio } = latticeRatioAt(a, b);
            const x = xOf(a);
            const y = yOf(b);
            const tone = plottedByPos.get(`${a},${b}`);
            const isOrigin = a === 0 && b === 0;
            const fill = tone
              ? (tone.approximated ? "#3a2a3a" : (isOrigin ? accent + "55" : "#1e2a4a"))
              : "#0e0e0e";
            const stroke = tone
              ? (tone.approximated ? "#7a4a7a" : (isOrigin ? accent : "#3a4a8a"))
              : "#1a1a1a";
            return (
              <g key={`${a},${b}`}>
                <rect x={x - cellW / 2 + 2} y={y - cellH / 2 + 2}
                  width={cellW - 4} height={cellH - 4}
                  rx={4} fill={fill} stroke={stroke} strokeWidth={1} />
                {tone ? (
                  <>
                    <text x={x} y={y - 4} textAnchor="middle"
                      fill={tone.approximated ? "#cca0e0" : "#ffffff"}
                      fontSize={11} fontWeight={600} fontFamily="monospace">
                      {tone.degree}
                    </text>
                    <text x={x} y={y + 8} textAnchor="middle"
                      fill={tone.approximated ? "#7a5a8a" : "#9999cc"}
                      fontSize={8} fontFamily="monospace">
                      {ratio}
                    </text>
                  </>
                ) : (
                  <text x={x} y={y + 3} textAnchor="middle"
                    fill="#2a2a2a" fontSize={8} fontFamily="monospace">
                    {ratio}
                  </text>
                )}
              </g>
            );
          });
        })}
      </svg>
      {!compact && approxNotes.length > 0 && (
        <p className="text-[9px] text-[#7a5a8a] italic">
          Higher-prime tones (purple cells) projected onto nearest 5-limit cell:
          {" "}{approxNotes.map(n =>
            `${n.degree}=${n.cents.toFixed(0)}¢ (≈${n.approxRatio}, off by ${n.errorCents.toFixed(0)}¢)`
          ).join("  ·  ")}.
        </p>
      )}
    </div>
  );
}
