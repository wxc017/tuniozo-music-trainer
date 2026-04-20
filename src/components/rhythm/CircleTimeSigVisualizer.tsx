// ── CircleTimeSigVisualizer: circular beat visualizer for uncommon meters ──

import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import type { TimeSigDef, TimeSigCategory } from "@/lib/uncommonMetersData";
import { CATEGORY_LABELS, CATEGORY_COMPOSERS } from "@/lib/uncommonMetersData";

interface Props {
  sig: TimeSigDef;
  /** Active beat position during playback (0-based, fractional) */
  activeBeat?: number | null;
  /** Compact mode — smaller, less detail */
  compact?: boolean;
  /** Radius of the main circle in px */
  size?: number;
}

export const GROUP_COLORS = [
  "#7173e6", "#e67171", "#71e6a3", "#e6c871",
  "#c871e6", "#71c8e6", "#e6a071", "#a0e671",
  "#e67191", "#91e671", "#7191e6", "#e6b071",
];

const CATEGORY_ICONS: Record<TimeSigCategory, string> = {
  additive: "\u25E8", irrational: "\u221E", fractional: "\u00BD",
  ratio: "\u27F7", real_number: "\u03C0", prime: "\u2295",
  nested: "\u27D0", proportional: "\u23F1", absolute_time: "\u23F1",
  timeline: "\u23F1", continuous_tempo: "\u23E9", elastic: "\u23E9",
  subdivision_tree: "\uD83C\uDF3F", irrational_subdiv: "\uD83C\uDF3F",
  hybrid_grid: "\uD83C\uDF3F", phase_shift: "\u219D", polymeter: "\u2AD8",
  algorithmic: "\u2B21", stochastic: "\u2B21",
  non_terminating: "\u2204", fractal_time: "\u2204", limit_process: "\u2204",
  retrograde: "\u2B8C", directed: "\u2442", geometric: "\u25E0",
  graph_time: "\u229E", density: "\u2593",
};

// ── Geometry helpers ────────────────────────────────────────────────

/** Angle for a beat position (0 = top, clockwise) */
function beatAngle(pos: number, total: number): number {
  return (pos / total) * Math.PI * 2 - Math.PI / 2;
}

function polarToXY(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/** SVG arc path from angle a1 to a2 on circle (cx, cy, r) */
function arcPath(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const start = polarToXY(cx, cy, r, a1);
  const end = polarToXY(cx, cy, r, a2);
  const sweep = a2 - a1;
  const largeArc = sweep > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

// ── Component ───────────────────────────────────────────────────────

export default function CircleTimeSigVisualizer({ sig, activeBeat, compact, size: sizeProp }: Props) {
  const { groups, totalBeats, category, display, description } = sig;
  const size = sizeProp ?? (compact ? 120 : 220);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 8;
  const mainR = outerR - 12;
  const innerR = mainR - 18;
  const dotR = innerR - 8;

  // Detect cycle restart (beat near 0) for flash effect
  const prevBeatRef = useRef<number | null>(null);
  const [cycleFlash, setCycleFlash] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    if (activeBeat != null && prevBeatRef.current != null) {
      // If beat jumped backwards (e.g. from near totalBeats back to near 0), it's a cycle restart
      if (prevBeatRef.current > totalBeats * 0.5 && activeBeat < totalBeats * 0.2) {
        setCycleFlash(true);
        t = setTimeout(() => setCycleFlash(false), 200);
      }
    }
    prevBeatRef.current = activeBeat ?? null;
    return () => { if (t) clearTimeout(t); };
  }, [activeBeat, totalBeats]);

  // Beat positions: { pos (fractional), groupIdx, isGroupStart, beatInGroup }
  const beats = useMemo(() => {
    const result: { pos: number; groupIdx: number; isGroupStart: boolean; beatInGroup: number }[] = [];
    let pos = 0;
    for (let gi = 0; gi < groups.length; gi++) {
      const grpSize = groups[gi];
      const intSteps = Math.max(1, Math.round(grpSize));
      for (let s = 0; s < intSteps; s++) {
        result.push({
          pos: pos + (s * grpSize) / intSteps,
          groupIdx: gi,
          isGroupStart: s === 0,
          beatInGroup: s,
        });
      }
      pos += grpSize;
    }
    return result;
  }, [groups]);

  // Group arc boundaries
  const groupArcs = useMemo(() => {
    const arcs: { start: number; end: number; groupIdx: number }[] = [];
    let pos = 0;
    for (let gi = 0; gi < groups.length; gi++) {
      arcs.push({ start: pos, end: pos + groups[gi], groupIdx: gi });
      pos += groups[gi];
    }
    return arcs;
  }, [groups]);

  // Active progress angle (sweep hand)
  const activeAngle = activeBeat != null ? beatAngle(activeBeat, totalBeats) : null;
  const activePct = activeBeat != null ? activeBeat / totalBeats : null;

  if (compact) {
    return (
      <div className="inline-flex flex-col items-center gap-1">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Group arcs */}
          {groupArcs.map((arc, gi) => {
            const color = GROUP_COLORS[gi % GROUP_COLORS.length];
            const a1 = beatAngle(arc.start, totalBeats);
            const a2 = beatAngle(arc.end, totalBeats);
            return (
              <path
                key={`arc-${gi}`}
                d={arcPath(cx, cy, mainR, a1, a2)}
                fill="none"
                stroke={color}
                strokeWidth={6}
                opacity={0.5}
              />
            );
          })}
          {/* Beat dots */}
          {beats.map((beat, i) => {
            const color = GROUP_COLORS[beat.groupIdx % GROUP_COLORS.length];
            const angle = beatAngle(beat.pos, totalBeats);
            const r = beat.isGroupStart ? mainR : mainR;
            const pt = polarToXY(cx, cy, r, angle);
            const isActive = activeBeat != null && Math.abs(beat.pos - activeBeat) < 0.15;
            return (
              <circle
                key={i}
                cx={pt.x} cy={pt.y}
                r={beat.isGroupStart ? 4 : 2.5}
                fill={isActive ? "#fff" : color}
                opacity={beat.isGroupStart ? 1 : 0.6}
              />
            );
          })}
          {/* Sweep hand */}
          {activeAngle != null && (
            <line
              x1={cx} y1={cy}
              x2={cx + (mainR - 4) * Math.cos(activeAngle)}
              y2={cy + (mainR - 4) * Math.sin(activeAngle)}
              stroke="#fff" strokeWidth={1.5} opacity={0.7}
            />
          )}
          {/* Center label */}
          <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
            fill="#888" fontSize={11} fontFamily="monospace" fontWeight="bold">
            {display}
          </text>
        </svg>
      </div>
    );
  }

  // ── Full view ──

  return (
    <div className="bg-[#0e0e0e] border border-[#222] rounded-lg overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        {/* Circle SVG */}
        <div className="flex items-center justify-center p-4 flex-shrink-0">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* Outer ring (thin guide) */}
            <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="#1a1a1a" strokeWidth={1} />

            {/* Cycle restart flash */}
            {cycleFlash && (
              <circle cx={cx} cy={cy} r={outerR + 2} fill="none"
                stroke="#fff" strokeWidth={3} opacity={0.6}
                style={{ transition: "opacity 0.2s" }}
              />
            )}

            {/* Group arcs — colored bands */}
            {groupArcs.map((arc, gi) => {
              const color = GROUP_COLORS[gi % GROUP_COLORS.length];
              const a1 = beatAngle(arc.start, totalBeats);
              const a2 = beatAngle(arc.end, totalBeats);
              // Active highlight: is the current beat within this group?
              const isActiveGroup = activeBeat != null && activeBeat >= arc.start && activeBeat < arc.end;
              return (
                <g key={`grp-${gi}`}>
                  {/* Wide arc band */}
                  <path
                    d={arcPath(cx, cy, mainR, a1, a2)}
                    fill="none"
                    stroke={color}
                    strokeWidth={14}
                    opacity={isActiveGroup ? 0.7 : 0.25}
                    strokeLinecap="butt"
                    style={{ transition: "opacity 0.08s" }}
                  />
                  {/* Group size label along arc */}
                  {(() => {
                    const midAngle = (a1 + a2) / 2;
                    const labelPt = polarToXY(cx, cy, outerR + 1, midAngle);
                    return (
                      <text
                        x={labelPt.x} y={labelPt.y}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={color} fontSize={9} fontFamily="monospace" fontWeight="bold"
                        opacity={0.8}
                      >
                        {Number.isInteger(groups[gi]) ? groups[gi] : groups[gi].toFixed(2)}
                      </text>
                    );
                  })()}
                </g>
              );
            })}

            {/* Inner ring for subdivision dots */}
            <circle cx={cx} cy={cy} r={innerR} fill="none" stroke="#161616" strokeWidth={0.5} />

            {/* Group boundary spokes */}
            {groupArcs.map((arc, gi) => {
              const angle = beatAngle(arc.start, totalBeats);
              const inner = polarToXY(cx, cy, innerR - 4, angle);
              const outer = polarToXY(cx, cy, mainR + 7, angle);
              const color = GROUP_COLORS[gi % GROUP_COLORS.length];
              return (
                <line
                  key={`spoke-${gi}`}
                  x1={inner.x} y1={inner.y}
                  x2={outer.x} y2={outer.y}
                  stroke={color} strokeWidth={1.5} opacity={0.5}
                />
              );
            })}

            {/* Beat dots on inner ring */}
            {beats.map((beat, i) => {
              const color = GROUP_COLORS[beat.groupIdx % GROUP_COLORS.length];
              const angle = beatAngle(beat.pos, totalBeats);
              const r = beat.isGroupStart ? mainR : innerR;
              const pt = polarToXY(cx, cy, r, angle);
              const isActive = activeBeat != null && Math.abs(beat.pos - activeBeat) < 0.15;
              const dotSize = beat.isGroupStart ? 6 : 3.5;
              return (
                <g key={`dot-${i}`}>
                  {/* Glow */}
                  {isActive && (
                    <circle cx={pt.x} cy={pt.y} r={dotSize + 4}
                      fill={color} opacity={0.3}
                      style={{ transition: "opacity 0.05s" }}
                    />
                  )}
                  <circle
                    cx={pt.x} cy={pt.y} r={dotSize}
                    fill={isActive ? "#fff" : beat.isGroupStart ? color : `${color}`}
                    opacity={isActive ? 1 : beat.isGroupStart ? 1 : 0.5}
                    stroke={isActive ? "#fff" : "none"}
                    strokeWidth={isActive ? 1.5 : 0}
                    style={{ transition: "all 0.06s" }}
                  />
                </g>
              );
            })}

            {/* Sweep hand / needle */}
            {activeAngle != null && (
              <g>
                <line
                  x1={cx} y1={cy}
                  x2={cx + (mainR + 2) * Math.cos(activeAngle)}
                  y2={cy + (mainR + 2) * Math.sin(activeAngle)}
                  stroke="#ffffff" strokeWidth={2} opacity={0.6}
                  strokeLinecap="round"
                  style={{ transition: "all 0.06s" }}
                />
                {/* Needle tip glow */}
                <circle
                  cx={cx + (mainR + 2) * Math.cos(activeAngle)}
                  cy={cy + (mainR + 2) * Math.sin(activeAngle)}
                  r={3} fill="#fff" opacity={0.8}
                />
              </g>
            )}

            {/* Active position arc (progress trail) */}
            {activePct != null && activePct > 0.01 && (
              <path
                d={arcPath(cx, cy, dotR, -Math.PI / 2, activeAngle!)}
                fill="none"
                stroke="#ffffff"
                strokeWidth={1.5}
                opacity={0.15}
                strokeLinecap="round"
              />
            )}

            {/* Center pulse on cycle restart */}
            {cycleFlash && (
              <circle cx={cx} cy={cy} r={mainR * 0.4} fill="#fff" opacity={0.12} />
            )}

            {/* Center: icon + display name */}
            <text x={cx} y={cy - 8} textAnchor="middle" dominantBaseline="middle"
              fill={cycleFlash ? "#fff" : "#555"} fontSize={16}
              style={{ transition: "fill 0.15s" }}>
              {CATEGORY_ICONS[category]}
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle" dominantBaseline="middle"
              fill={cycleFlash ? "#fff" : "#ccc"} fontSize={13} fontFamily="monospace" fontWeight="bold"
              style={{ transition: "fill 0.15s" }}>
              {display}
            </text>
            <text x={cx} y={cy + 24} textAnchor="middle" dominantBaseline="middle"
              fill="#444" fontSize={8} fontFamily="monospace">
              {Number.isInteger(totalBeats) ? totalBeats : totalBeats.toFixed(3)} beats
            </text>
          </svg>
        </div>

        {/* Info panel */}
        <div className="flex-1 p-4 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-[#777] px-2 py-0.5 bg-[#1a1a1a] rounded-full border border-[#2a2a2a]">
              {CATEGORY_LABELS[category]}
            </span>
            {sig.tempoScale !== 1 && (
              <span className="text-[10px] text-[#666] px-2 py-0.5 bg-[#1a1a1a] rounded">
                tempo x{sig.tempoScale.toFixed(2)}
              </span>
            )}
          </div>

          {/* Description */}
          <p className="text-xs text-[#888] leading-relaxed mb-3">{description}</p>

          {/* Grouping formula */}
          <div className="flex items-center gap-1 flex-wrap mb-2">
            <span className="text-[10px] text-[#555]">Groups:</span>
            {groups.map((g, i) => (
              <span key={i} className="flex items-center gap-0.5">
                {i > 0 && <span className="text-[#333] text-xs">+</span>}
                <span
                  className="text-xs font-mono font-bold px-1 py-0.5 rounded"
                  style={{
                    color: GROUP_COLORS[i % GROUP_COLORS.length],
                    backgroundColor: `${GROUP_COLORS[i % GROUP_COLORS.length]}15`,
                  }}
                >
                  {Number.isInteger(g) ? g : g.toFixed(2)}
                </span>
              </span>
            ))}
            <span className="text-[10px] text-[#555] ml-1">
              = {Number.isInteger(totalBeats) ? totalBeats : totalBeats.toFixed(4)}
            </span>
          </div>

          {/* Composers */}
          {CATEGORY_COMPOSERS[category] && (
            <p className="text-[10px] text-[#555] mb-2">
              Used by: {CATEGORY_COMPOSERS[category].join(" \u00B7 ")}
            </p>
          )}

          {/* Tags */}
          {sig.tags && sig.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {sig.tags.map(t => (
                <span key={t} className="text-[9px] px-1.5 py-0.5 bg-[#1a1a2a] text-[#7173e6] rounded border border-[#2a2a3a]">
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Beat count summary */}
          <div className="mt-3 flex gap-4">
            <div>
              <div className="text-[9px] text-[#444] uppercase">Groups</div>
              <div className="text-sm font-mono text-[#7173e6]">{groups.length}</div>
            </div>
            <div>
              <div className="text-[9px] text-[#444] uppercase">Beats</div>
              <div className="text-sm font-mono text-[#7173e6]">{beats.length}</div>
            </div>
            <div>
              <div className="text-[9px] text-[#444] uppercase">Duration</div>
              <div className="text-sm font-mono text-[#7173e6]">
                {Number.isInteger(totalBeats) ? totalBeats : totalBeats.toFixed(3)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ReferenceCircle: steady-beat circle for visual comparison ─────────

interface RefCircleProps {
  /** Number of evenly-spaced beats in the reference cycle */
  numBeats: number;
  /** BPM for animation speed */
  bpm: number;
  /** Whether playback is active */
  isPlaying: boolean;
  /** Size in px (defaults to 140) */
  size?: number;
}

/**
 * A simple circle showing a regular beat pulse. When `isPlaying` is true,
 * a sweep hand rotates continuously at the given BPM. Place this next to
 * the pattern circle to see how the two go in and out of sync.
 */
export function ReferenceCircle({ numBeats, bpm, isPlaying, size: sizeProp }: RefCircleProps) {
  const size = sizeProp ?? 140;
  const cx = size / 2;
  const cy = size / 2;
  const mainR = size / 2 - 14;
  const dotR = mainR - 10;

  const [sweepAngle, setSweepAngle] = useState(-Math.PI / 2);
  const [activeDot, setActiveDot] = useState(-1);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!isPlaying) {
      setSweepAngle(-Math.PI / 2);
      setActiveDot(-1);
      return;
    }
    startRef.current = performance.now();
    const animate = () => {
      const elapsed = (performance.now() - startRef.current) / 1000;
      const beatPos = (elapsed * bpm / 60) % numBeats;
      setSweepAngle(beatAngle(beatPos, numBeats));
      setActiveDot(Math.floor(beatPos));
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, bpm, numBeats]);

  const dots = useMemo(() => {
    const result: { angle: number; idx: number }[] = [];
    for (let i = 0; i < numBeats; i++) {
      result.push({ angle: beatAngle(i, numBeats), idx: i });
    }
    return result;
  }, [numBeats]);

  const handX = cx + (mainR - 2) * Math.cos(sweepAngle);
  const handY = cy + (mainR - 2) * Math.sin(sweepAngle);

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={mainR} fill="none" stroke="#1a1a1a" strokeWidth={1} />
        {/* Reference arc band */}
        <circle cx={cx} cy={cy} r={mainR} fill="none" stroke="#ddaa55" strokeWidth={8} opacity={0.15} />

        {/* Beat dots */}
        {dots.map(({ angle, idx }) => {
          const pt = polarToXY(cx, cy, mainR, angle);
          const isActive = idx === activeDot;
          return (
            <g key={idx}>
              {isActive && (
                <circle cx={pt.x} cy={pt.y} r={9}
                  fill="#ddaa55" opacity={0.25} />
              )}
              <circle
                cx={pt.x} cy={pt.y}
                r={idx === 0 ? 5 : 4}
                fill={isActive ? "#fff" : "#ddaa55"}
                opacity={isActive ? 1 : idx === 0 ? 0.9 : 0.5}
              />
            </g>
          );
        })}

        {/* Sweep hand */}
        {isPlaying && (
          <g>
            <line
              x1={cx} y1={cy}
              x2={handX} y2={handY}
              stroke="#ddaa55" strokeWidth={2} opacity={0.6}
              strokeLinecap="round"
            />
            <circle cx={handX} cy={handY} r={3} fill="#ddaa55" opacity={0.8} />
          </g>
        )}

        {/* Center label */}
        <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="middle"
          fill="#ddaa55" fontSize={12} fontFamily="monospace" fontWeight="bold" opacity={0.7}>
          {numBeats}/{numBeats}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" dominantBaseline="middle"
          fill="#555" fontSize={8} fontFamily="monospace">
          ref pulse
        </text>
      </svg>
    </div>
  );
}

// ── PolyLayerCircle: circle for one layer of a polymeter ─────────────

interface PolyLayerCircleProps {
  /** Beat groups for this layer */
  groups: number[];
  /** Total beats in one full cycle */
  totalBeats: number;
  /** Display label (e.g. "3/4") */
  label: string;
  /** Color index into GROUP_COLORS */
  colorIdx: number;
  /** Active beat position from playback */
  activeBeat?: number | null;
  /** Size in px */
  size?: number;
}

export function PolyLayerCircle({ groups, totalBeats, label, colorIdx, activeBeat, size: sizeProp }: PolyLayerCircleProps) {
  const size = sizeProp ?? 160;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 8;
  const mainR = outerR - 10;
  const innerR = mainR - 14;
  const color = GROUP_COLORS[colorIdx % GROUP_COLORS.length];

  const beats = useMemo(() => {
    const result: { pos: number; groupIdx: number; isGroupStart: boolean }[] = [];
    let pos = 0;
    for (let gi = 0; gi < groups.length; gi++) {
      const grpSize = groups[gi];
      const intSteps = Math.max(1, Math.round(grpSize));
      for (let s = 0; s < intSteps; s++) {
        result.push({
          pos: pos + (s * grpSize) / intSteps,
          groupIdx: gi,
          isGroupStart: s === 0,
        });
      }
      pos += grpSize;
    }
    return result;
  }, [groups]);

  const groupArcs = useMemo(() => {
    const arcs: { start: number; end: number }[] = [];
    let pos = 0;
    for (const g of groups) {
      arcs.push({ start: pos, end: pos + g });
      pos += g;
    }
    return arcs;
  }, [groups]);

  const activeAngle = activeBeat != null ? beatAngle(activeBeat, totalBeats) : null;

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="#1a1a1a" strokeWidth={1} />

        {/* Group arcs */}
        {groupArcs.map((arc, gi) => {
          const a1 = beatAngle(arc.start, totalBeats);
          const a2 = beatAngle(arc.end, totalBeats);
          const isActiveGroup = activeBeat != null && activeBeat >= arc.start && activeBeat < arc.end;
          return (
            <path
              key={`arc-${gi}`}
              d={arcPath(cx, cy, mainR, a1, a2)}
              fill="none"
              stroke={color}
              strokeWidth={10}
              opacity={isActiveGroup ? 0.7 : 0.2}
              strokeLinecap="butt"
              style={{ transition: "opacity 0.08s" }}
            />
          );
        })}

        {/* Group boundary spokes */}
        {groupArcs.map((arc, gi) => {
          const angle = beatAngle(arc.start, totalBeats);
          const inner = polarToXY(cx, cy, innerR - 2, angle);
          const outer = polarToXY(cx, cy, mainR + 5, angle);
          return (
            <line
              key={`spoke-${gi}`}
              x1={inner.x} y1={inner.y}
              x2={outer.x} y2={outer.y}
              stroke={color} strokeWidth={1.5} opacity={0.4}
            />
          );
        })}

        {/* Beat dots */}
        {beats.map((beat, i) => {
          const angle = beatAngle(beat.pos, totalBeats);
          const r = beat.isGroupStart ? mainR : innerR;
          const pt = polarToXY(cx, cy, r, angle);
          const isActive = activeBeat != null && Math.abs(beat.pos - activeBeat) < 0.15;
          const dotSize = beat.isGroupStart ? 5 : 3;
          return (
            <g key={`dot-${i}`}>
              {isActive && (
                <circle cx={pt.x} cy={pt.y} r={dotSize + 3}
                  fill={color} opacity={0.3} />
              )}
              <circle
                cx={pt.x} cy={pt.y} r={dotSize}
                fill={isActive ? "#fff" : color}
                opacity={isActive ? 1 : beat.isGroupStart ? 0.9 : 0.4}
              />
            </g>
          );
        })}

        {/* Sweep hand */}
        {activeAngle != null && (
          <g>
            <line
              x1={cx} y1={cy}
              x2={cx + (mainR + 2) * Math.cos(activeAngle)}
              y2={cy + (mainR + 2) * Math.sin(activeAngle)}
              stroke={color} strokeWidth={2} opacity={0.6}
              strokeLinecap="round"
              style={{ transition: "all 0.06s" }}
            />
            <circle
              cx={cx + (mainR + 2) * Math.cos(activeAngle)}
              cy={cy + (mainR + 2) * Math.sin(activeAngle)}
              r={3} fill={color} opacity={0.8}
            />
          </g>
        )}

        {/* Center label */}
        <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="middle"
          fill={color} fontSize={14} fontFamily="monospace" fontWeight="bold" opacity={0.9}>
          {label}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" dominantBaseline="middle"
          fill="#555" fontSize={8} fontFamily="monospace">
          {totalBeats} beats
        </text>
      </svg>
    </div>
  );
}
