import { useMemo } from "react";
import type { RhythmPattern } from "@/lib/rhythmEarData";

interface Props {
  patterns: RhythmPattern[];
  activeIdx?: number; // which pattern is currently playing (0 or 1)
  activeBeat?: { beatPos: number; layer: string } | null;
  label?: string;
}

const LAYER_COLORS: Record<string, string> = {
  macro: "#7173e6",
  micro: "#5a8a5a",
  division: "#886644",
};

const LAYER_SIZES: Record<string, number> = {
  macro: 16,
  micro: 10,
  division: 7,
};

// Group colors matching TimeSigVisualizer
const GROUP_COLORS = [
  "#7173e6", "#e67171", "#71e6a3", "#e6c871",
  "#c871e6", "#71c8e6", "#e6a071", "#a0e671",
];

export default function BeatVisualizer({ patterns, activeIdx, activeBeat, label }: Props) {
  return (
    <div className="bg-[#0e0e0e] border border-[#222] rounded-lg overflow-hidden">
      {label && (
        <div className="px-4 pt-3 pb-1 border-b border-[#1a1a1a]">
          <p className="text-xs text-[#666] uppercase tracking-wider">{label}</p>
        </div>
      )}
      {patterns.map((pattern, pi) => (
        <PatternRow
          key={pi}
          pattern={pattern}
          index={pi}
          isActive={activeIdx === pi}
          activeBeat={activeIdx === pi ? (activeBeat ?? null) : null}
          showLabel={patterns.length > 1}
        />
      ))}
    </div>
  );
}

function PatternRow({
  pattern,
  index,
  isActive,
  activeBeat,
  showLabel,
}: {
  pattern: RhythmPattern;
  index: number;
  isActive: boolean;
  activeBeat: { beatPos: number; layer: string } | null;
  showLabel: boolean;
}) {
  const { events, macrobeats, grouping } = pattern;

  // Deduplicate events at the same position: when macro and micro (or micro
  // and division) land on the same beat, keep only the highest-priority layer.
  const LAYER_PRIORITY: Record<string, number> = { macro: 0, micro: 1, division: 2 };
  const deduped: typeof events = [];
  const sorted = [...events].sort((a, b) => a.beatPos - b.beatPos || (LAYER_PRIORITY[a.layer] ?? 9) - (LAYER_PRIORITY[b.layer] ?? 9));
  for (const ev of sorted) {
    const existing = deduped.find(d => Math.abs(d.beatPos - ev.beatPos) < 0.001);
    if (!existing) {
      deduped.push(ev);
    }
  }

  // Group events into macrobeat groups for visual bracketing
  const groups = useMemo(() => {
    const result: { start: number; size: number; events: typeof events }[] = [];
    if (grouping && grouping.length > 0) {
      const total = grouping.reduce((a, b) => a + b, 0);
      let cumulative = 0;
      for (const grpSize of grouping) {
        const lo = cumulative / total * macrobeats;
        cumulative += grpSize;
        const hi = cumulative / total * macrobeats;
        const grp = deduped.filter(e => e.beatPos >= lo - 0.001 && e.beatPos < hi - 0.001);
        result.push({ start: lo, size: grpSize, events: grp });
      }
    } else {
      for (let mb = 0; mb < macrobeats; mb++) {
        const grp = deduped.filter(e => e.beatPos >= mb && e.beatPos < mb + 1);
        result.push({ start: mb, size: 1, events: grp });
      }
    }
    return result;
  }, [events, macrobeats, grouping]);

  // Group widths as percentages
  const groupWidths = useMemo(() => {
    const total = groups.reduce((a, b) => a + b.size, 0);
    return groups.map(g => (g.size / total) * 100);
  }, [groups]);

  const metreLabel = pattern.metre === "duple" ? "Duple"
    : pattern.metre === "triple" ? "Triple"
    : pattern.metre === "uneven_2_3" ? "5 (2+3)"
    : pattern.metre === "uneven_3_2" ? "5 (3+2)"
    : pattern.metre === "uneven_unpaired" ? `7 (${pattern.grouping?.join("+") ?? "Unpaired"})`
    : pattern.metre === "combined" ? "Combined"
    : "";

  return (
    <div className="px-4 py-3">
      {/* Pattern label + metre info */}
      <div className="flex items-center gap-2 mb-2">
        {showLabel && (
          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${isActive ? "bg-[#7173e622] text-[#9999ee]" : "bg-[#1a1a1a] text-[#444]"}`}>
            {String.fromCharCode(65 + index)}
          </span>
        )}
        <span className="text-[10px] text-[#555]">{metreLabel}</span>
        <span className="text-[10px] text-[#444]">{pattern.bpm}bpm{pattern.bpmEnd && pattern.bpmEnd !== pattern.bpm ? `→${pattern.bpmEnd}` : ""}</span>
        {grouping && grouping.length > 1 && (
          <span className="text-[10px] text-[#555] ml-auto">
            Grouping: {grouping.map((g, i) => (
              <span key={i}>
                {i > 0 && <span className="text-[#333]">+</span>}
                <span style={{ color: GROUP_COLORS[i % GROUP_COLORS.length] }}>{g}</span>
              </span>
            ))}
          </span>
        )}
      </div>

      {/* Group structure bar — TimeSigVisualizer style */}
      <div className="flex h-12 rounded-lg overflow-hidden gap-px mb-1">
        {groups.map((grp, gi) => {
          const color = GROUP_COLORS[gi % GROUP_COLORS.length];
          return (
            <div
              key={gi}
              style={{
                width: `${groupWidths[gi]}%`,
                backgroundColor: `${color}15`,
                borderBottom: `3px solid ${color}`,
              }}
              className="relative flex flex-col items-center justify-between py-1"
            >
              {/* Group size label */}
              {groups.length > 1 && (
                <span className="text-[9px] font-mono font-bold" style={{ color: `${color}88` }}>
                  {grp.size}
                </span>
              )}
              {/* Beat dots within group */}
              <div className="flex items-center gap-1 px-1">
                {grp.events.map((ev, ei) => {
                  const isHit =
                    activeBeat &&
                    Math.abs(ev.beatPos - activeBeat.beatPos) < 0.01 &&
                    ev.layer === activeBeat.layer;
                  const size = LAYER_SIZES[ev.layer] ?? 8;
                  const layerColor = LAYER_COLORS[ev.layer] ?? "#666";
                  return (
                    <div
                      key={ei}
                      className="transition-all duration-75"
                      style={{
                        width: size,
                        height: size,
                        borderRadius: "50%",
                        backgroundColor: ev.isRest
                          ? "transparent"
                          : isHit
                            ? "#fff"
                            : layerColor,
                        border: ev.isRest
                          ? `1px dashed ${layerColor}55`
                          : isHit
                            ? "2px solid #fff"
                            : `1px solid ${layerColor}88`,
                        opacity: ev.isTie ? 0.4 : 1,
                        transform: isHit ? "scale(1.4)" : "scale(1)",
                        boxShadow: isHit ? `0 0 8px ${layerColor}` : "none",
                        margin: "0 1px",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Beat timeline */}
      <div className="relative h-6 bg-[#141414] rounded overflow-hidden">
        {/* Group backgrounds */}
        {groups.map((_, gi) => {
          let left = 0;
          for (let k = 0; k < gi; k++) left += groupWidths[k];
          return (
            <div
              key={`bg-${gi}`}
              className="absolute top-0 bottom-0"
              style={{
                left: `${left}%`,
                width: `${groupWidths[gi]}%`,
                backgroundColor: gi % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
              }}
            />
          );
        })}
        {/* Beat markers from events */}
        {deduped.map((ev, i) => {
          const pct = (ev.beatPos / macrobeats) * 100;
          const groupIdx = groups.findIndex((g, gi) => {
            const lo = g.start;
            const hi = gi + 1 < groups.length ? groups[gi + 1].start : macrobeats;
            return ev.beatPos >= lo - 0.001 && ev.beatPos < hi + 0.001;
          });
          const color = groupIdx >= 0 ? GROUP_COLORS[groupIdx % GROUP_COLORS.length] : LAYER_COLORS[ev.layer] ?? "#666";
          const isHit = activeBeat && Math.abs(ev.beatPos - activeBeat.beatPos) < 0.01 && ev.layer === activeBeat.layer;
          const isMacro = ev.layer === "macro";
          return (
            <div
              key={i}
              className="absolute top-0 bottom-0 flex items-center transition-all duration-75"
              style={{ left: `${pct}%` }}
            >
              <div
                style={{
                  width: isMacro ? 3 : 1,
                  height: isMacro ? "100%" : "50%",
                  backgroundColor: isHit ? "#fff" : isMacro ? color : `${color}55`,
                  boxShadow: isHit ? `0 0 6px ${color}` : "none",
                }}
              />
            </div>
          );
        })}
        {/* Playback position indicator */}
        {activeBeat && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white opacity-80 transition-all duration-75"
            style={{ left: `${(activeBeat.beatPos / macrobeats) * 100}%` }}
          />
        )}
      </div>

      {/* Beat numbers under timeline */}
      <div className="relative h-3 mt-0.5">
        {groups.map((grp, gi) => {
          const pct = (grp.start / macrobeats) * 100;
          return (
            <span
              key={gi}
              className="absolute text-[9px] font-mono"
              style={{
                left: `${pct}%`,
                color: GROUP_COLORS[gi % GROUP_COLORS.length],
                transform: "translateX(-50%)",
              }}
            >
              {gi + 1}
            </span>
          );
        })}
      </div>
    </div>
  );
}
