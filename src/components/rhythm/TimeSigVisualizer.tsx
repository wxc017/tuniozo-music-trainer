// ── TimeSigVisualizer: rich visual explanation of uncommon meters ──

import { useMemo } from "react";
import type { TimeSigDef, TimeSigCategory, PolyLayer, PeriodicityClass } from "@/lib/uncommonMetersData";
import { CATEGORY_LABELS, CATEGORY_COMPOSERS, CATEGORY_LAYER, LAYER_LABELS, getAnchorMode, ANCHOR_DESCRIPTIONS, PERIODICITY_LABELS, getPeriodicityClass, computePerceptualResistance } from "@/lib/uncommonMetersData";

interface Props {
  sig: TimeSigDef;
  /** Active beat position during playback */
  activeBeat?: number | null;
  /** Compact mode — less detail */
  compact?: boolean;
}

// Colors for each group (cycle through)
const GROUP_COLORS = [
  "#7173e6", "#e67171", "#71e6a3", "#e6c871",
  "#c871e6", "#71c8e6", "#e6a071", "#a0e671",
];

const CATEGORY_ICONS: Record<TimeSigCategory, string> = {
  additive: "◨",
  irrational: "∞",
  fractional: "½",
  ratio: "⟷",
  real_number: "π",
  prime: "⊕",
  nested: "⟐",
  proportional: "⏱",
  absolute_time: "⏱",
  timeline: "⏱",
  continuous_tempo: "⏩",
  elastic: "⏩",
  subdivision_tree: "🌿",
  irrational_subdiv: "🌿",
  hybrid_grid: "🌿",
  phase_shift: "↝",
  polymeter: "⫘",
  algorithmic: "⬡",
  stochastic: "⬡",
  non_terminating: "∄",
  fractal_time: "∄",
  limit_process: "∄",
  retrograde: "⮌",
  directed: "⑂",
  geometric: "◠",
  graph_time: "⊞",
  density: "▓",
};

const ANCHOR_ICONS: Record<string, { icon: string; color: string }> = {
  single: { icon: "●", color: "#7aaa7a" },
  multiple: { icon: "●●", color: "#ddaa55" },
  none: { icon: "○", color: "#666" },
};

export default function TimeSigVisualizer({ sig, activeBeat, compact }: Props) {
  const { groups, totalBeats, category, display, description } = sig;

  // Calculate group widths as percentages
  const groupWidths = useMemo(() => {
    const total = groups.reduce((a, b) => a + b, 0);
    return groups.map(g => (g / total) * 100);
  }, [groups]);

  // Calculate individual beat positions for the entire measure
  const beatPositions = useMemo(() => {
    const beats: { pos: number; groupIdx: number; isGroupStart: boolean; beatInGroup: number }[] = [];
    let pos = 0;
    for (let gi = 0; gi < groups.length; gi++) {
      const grpSize = groups[gi];
      const intSteps = Math.max(1, Math.round(grpSize));
      for (let s = 0; s < intSteps; s++) {
        beats.push({
          pos: pos + (s * grpSize) / intSteps,
          groupIdx: gi,
          isGroupStart: s === 0,
          beatInGroup: s,
        });
      }
      pos += grpSize;
    }
    return beats;
  }, [groups]);

  if (compact) {
    return (
      <div className="bg-[#111] border border-[#222] rounded-lg px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-lg" title={CATEGORY_LABELS[category]}>
            {CATEGORY_ICONS[category]}
          </span>
          <span className="text-sm font-mono text-[#e6e6e6] font-bold">{display}</span>
          <span className="text-[10px] text-[#555] px-2 py-0.5 bg-[#1a1a1a] rounded-full">
            {CATEGORY_LABELS[category]}
          </span>
          {(() => { const a = getAnchorMode(sig); const ai = ANCHOR_ICONS[a]; return (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full border" style={{ color: ai.color, borderColor: ai.color + "44" }} title={ANCHOR_DESCRIPTIONS[a]}>
              {ai.icon} {a}
            </span>
          ); })()}
        </div>
        {/* Mini beat bar */}
        <div className="flex mt-2 h-4 rounded overflow-hidden gap-px">
          {groups.map((g, gi) => (
            <div
              key={gi}
              style={{
                width: `${groupWidths[gi]}%`,
                backgroundColor: `${GROUP_COLORS[gi % GROUP_COLORS.length]}33`,
                borderBottom: `3px solid ${GROUP_COLORS[gi % GROUP_COLORS.length]}`,
              }}
              className="relative flex items-center justify-center"
            >
              <span className="text-[9px] font-mono text-[#888]">
                {Number.isInteger(g) ? g : g.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0e0e0e] border border-[#222] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1a1a1a] flex items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl" title={CATEGORY_LABELS[category]}>
              {CATEGORY_ICONS[category]}
            </span>
            <span className="text-xl font-mono text-[#e6e6e6] font-bold tracking-wide">
              {display}
            </span>
            <span className="text-[10px] text-[#777] px-2 py-0.5 bg-[#1a1a1a] rounded-full border border-[#2a2a2a]">
              {LAYER_LABELS[CATEGORY_LAYER[category]]} / {CATEGORY_LABELS[category]}
            </span>
            {(() => { const pc = getPeriodicityClass(sig); const pcColors: Record<PeriodicityClass, string> = { periodic: "#5a8a5a", quasi_periodic: "#8a8a5a", aperiodic: "#8a5a5a", non_cyclic: "#5a5a8a" }; return (
              <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ color: pcColors[pc], borderColor: pcColors[pc] + "44" }}>
                {PERIODICITY_LABELS[pc]}
              </span>
            ); })()}
            {(() => { const a = getAnchorMode(sig); const ai = ANCHOR_ICONS[a]; return (
              <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ color: ai.color, borderColor: ai.color + "44", background: ai.color + "11" }} title={ANCHOR_DESCRIPTIONS[a]}>
                {ai.icon} {a}
              </span>
            ); })()}
          </div>
          <p className="text-xs text-[#888] leading-relaxed max-w-2xl">{description}</p>
          {CATEGORY_COMPOSERS[category] && (
            <p className="text-[10px] text-[#555] mt-1">
              Used by: {CATEGORY_COMPOSERS[category].join(" · ")}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[10px] text-[#555]">Total beats</div>
          <div className="text-lg font-mono text-[#7173e6] font-bold">
            {Number.isInteger(totalBeats) ? totalBeats : totalBeats.toFixed(4)}
          </div>
        </div>
      </div>

      {/* How weird is this? — plain-English weirdness summary */}
      {(() => {
        const pr = computePerceptualResistance(sig);
        // Overall weirdness: average of inverted metrics (low clarity/periodicity/symmetry/reducibility = weirder)
        const weirdness = 1 - (pr.pulseClarity + pr.periodicity + pr.symmetry + pr.reducibility) / 4;

        // Build plain-English observations
        const notes: string[] = [];
        const pc = getPeriodicityClass(sig);
        const isEvolving = pc === "non_cyclic" || (sig.polyLayers && sig.polyLayers.length > 0);

        // Pulse
        if (pr.pulseClarity < 0.3) notes.push("no clear steady beat");
        else if (pr.pulseClarity < 0.6) notes.push("uneven pulse");

        // Periodicity — distinguish "changes each cycle" from "irrational length"
        if (pc === "non_cyclic") notes.push("no repeating cycle");
        else if (pc === "aperiodic") notes.push("irrational length \u2014 never lines up with a regular grid");
        else if (pc === "quasi_periodic") notes.push("layers drift in and out of sync");

        // Symmetry — only meaningful with 3+ groups
        if (groups.length >= 3 && pr.symmetry > 0.9) notes.push("palindromic grouping");
        else if (groups.length >= 3 && pr.symmetry < 0.3) notes.push("asymmetric grouping");
        if (groups.length === 1 && !Number.isInteger(totalBeats)) notes.push("single irrational duration");

        // Reducibility
        if (pr.reducibility < 0.3) notes.push("can\u2019t be heard as a simpler meter");
        else if (pr.reducibility > 0.7) notes.push("easy to hear as " + (totalBeats <= 4 ? `${Math.round(totalBeats)}/4` : `${Math.round(totalBeats)}/8`));

        const weirdLabel = weirdness > 0.7 ? "Very hard to internalize"
          : weirdness > 0.5 ? "Genuinely disorienting"
          : weirdness > 0.3 ? "Unusual but learnable"
          : "Approachable";
        const weirdColor = weirdness > 0.7 ? "#cc5555"
          : weirdness > 0.5 ? "#cc8855"
          : weirdness > 0.3 ? "#aaaa55"
          : "#6aaa6a";

        return (
          <div className="px-4 py-2 border-b border-[#1a1a1a]">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-[60px] h-[6px] bg-[#1a1a1a] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${weirdness * 100}%`, backgroundColor: weirdColor }} />
                </div>
                <span className="text-[10px] font-semibold" style={{ color: weirdColor }}>{weirdLabel}</span>
              </div>
              {notes.length > 0 && (
                <span className="text-[9px] text-[#666]">— {notes.join(", ")}</span>
              )}
            </div>
          </div>
        );
      })()}

      {/* Group structure bar */}
      <div className="px-4 py-3">
        <div className="text-[10px] text-[#555] mb-2 uppercase tracking-wider">Group Structure</div>

        {/* Main visual bar */}
        <div className="flex h-14 rounded-lg overflow-hidden gap-px mb-1">
          {groups.map((g, gi) => {
            const color = GROUP_COLORS[gi % GROUP_COLORS.length];
            const intSteps = Math.max(1, Math.round(g));
            return (
              <div
                key={gi}
                style={{
                  width: `${groupWidths[gi]}%`,
                  backgroundColor: `${color}15`,
                  borderBottom: `4px solid ${color}`,
                }}
                className="relative flex flex-col items-center justify-between py-1"
              >
                {/* Group size label */}
                <span className="text-xs font-mono font-bold" style={{ color }}>
                  {Number.isInteger(g) ? g : g.toFixed(2)}
                </span>
                {/* Individual beats within group */}
                <div className="flex items-center gap-1 px-1">
                  {Array.from({ length: intSteps }).map((_, bi) => {
                    // Check if this beat is active
                    let cumPos = 0;
                    for (let k = 0; k < gi; k++) cumPos += groups[k];
                    const beatPos = cumPos + (bi * g) / intSteps;
                    const isActive = activeBeat != null && Math.abs(beatPos - activeBeat) < 0.1;

                    return (
                      <div
                        key={bi}
                        className="transition-all duration-75"
                        style={{
                          width: bi === 0 ? 12 : 8,
                          height: bi === 0 ? 12 : 8,
                          borderRadius: "50%",
                          backgroundColor: isActive ? "#fff" : bi === 0 ? color : `${color}66`,
                          border: isActive ? "2px solid #fff" : `1px solid ${color}88`,
                          transform: isActive ? "scale(1.4)" : "scale(1)",
                          boxShadow: isActive ? `0 0 8px ${color}` : "none",
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Grouping formula */}
        <div className="flex items-center gap-1 mt-2">
          <span className="text-[10px] text-[#555]">Grouping:</span>
          <span className="text-xs font-mono text-[#aaa]">
            ({groups.map((g, i) => (
              <span key={i}>
                {i > 0 && <span className="text-[#555]">+</span>}
                <span style={{ color: GROUP_COLORS[i % GROUP_COLORS.length] }}>
                  {Number.isInteger(g) ? g : g.toFixed(2)}
                </span>
              </span>
            ))})
          </span>
          <span className="text-[10px] text-[#555] ml-2">
            = {Number.isInteger(totalBeats) ? totalBeats : totalBeats.toFixed(4)} beats
          </span>
          {sig.tempoScale !== 1 && (
            <span className="text-[10px] text-[#666] ml-2 px-2 py-0.5 bg-[#1a1a1a] rounded">
              tempo ×{sig.tempoScale.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Beat timeline */}
      <div className="px-4 pb-3">
        <div className="text-[10px] text-[#555] mb-2 uppercase tracking-wider">Beat Timeline</div>
        <div className="relative h-8 bg-[#141414] rounded-lg overflow-hidden">
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
          {/* Beat markers */}
          {beatPositions.map((beat, i) => {
            const pct = (beat.pos / totalBeats) * 100;
            const color = GROUP_COLORS[beat.groupIdx % GROUP_COLORS.length];
            const isActive = activeBeat != null && Math.abs(beat.pos - activeBeat) < 0.1;
            return (
              <div
                key={i}
                className="absolute top-0 bottom-0 flex items-center transition-all duration-75"
                style={{ left: `${pct}%` }}
              >
                <div
                  style={{
                    width: beat.isGroupStart ? 3 : 1,
                    height: beat.isGroupStart ? "100%" : "60%",
                    backgroundColor: isActive ? "#fff" : beat.isGroupStart ? color : `${color}55`,
                    boxShadow: isActive ? `0 0 6px ${color}` : "none",
                  }}
                />
              </div>
            );
          })}
          {/* Position indicator */}
          {activeBeat != null && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white opacity-80 transition-all duration-75"
              style={{ left: `${(activeBeat / totalBeats) * 100}%` }}
            />
          )}
        </div>
        {/* Beat numbers under timeline */}
        <div className="relative h-4 mt-0.5">
          {beatPositions.filter(b => b.isGroupStart).map((beat, i) => {
            const pct = (beat.pos / totalBeats) * 100;
            return (
              <span
                key={i}
                className="absolute text-[9px] font-mono"
                style={{
                  left: `${pct}%`,
                  color: GROUP_COLORS[beat.groupIdx % GROUP_COLORS.length],
                  transform: "translateX(-50%)",
                }}
              >
                {i + 1}
              </span>
            );
          })}
        </div>
      </div>

      {/* Tags */}
      {sig.tags && sig.tags.length > 0 && (
        <div className="px-4 pb-3 flex gap-1 flex-wrap">
          {sig.tags.map(t => (
            <span key={t} className="text-[9px] px-1.5 py-0.5 bg-[#1a1a2a] text-[#7173e6] rounded border border-[#2a2a3a]">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PolyLayerTimeline: beat timeline for a single polymeter layer ─────

interface PolyTimelineProps {
  groups: number[];
  totalBeats: number;
  label: string;
  colorIdx: number;
  activeBeat?: number | null;
}

export function PolyLayerTimeline({ groups, totalBeats, label, colorIdx, activeBeat }: PolyTimelineProps) {
  const color = GROUP_COLORS[colorIdx % GROUP_COLORS.length];

  const groupWidths = useMemo(() => {
    const total = groups.reduce((a, b) => a + b, 0);
    return groups.map(g => (g / total) * 100);
  }, [groups]);

  const beatPositions = useMemo(() => {
    const beats: { pos: number; groupIdx: number; isGroupStart: boolean }[] = [];
    let pos = 0;
    for (let gi = 0; gi < groups.length; gi++) {
      const grpSize = groups[gi];
      const intSteps = Math.max(1, Math.round(grpSize));
      for (let s = 0; s < intSteps; s++) {
        beats.push({
          pos: pos + (s * grpSize) / intSteps,
          groupIdx: gi,
          isGroupStart: s === 0,
        });
      }
      pos += grpSize;
    }
    return beats;
  }, [groups]);

  return (
    <div className="bg-[#0c0c0c] border border-[#1a1a1a] rounded-lg px-3 py-2">
      {/* Label + grouping */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-mono font-bold" style={{ color }}>{label}</span>
        <span className="text-[10px] text-[#555]">
          ({groups.map((g, i) => (
            <span key={i}>
              {i > 0 && "+"}
              <span style={{ color: `${color}88` }}>{Number.isInteger(g) ? g : g.toFixed(2)}</span>
            </span>
          ))})
        </span>
      </div>

      {/* Group structure bar */}
      <div className="flex h-8 rounded overflow-hidden gap-px mb-1">
        {groups.map((g, gi) => {
          const intSteps = Math.max(1, Math.round(g));
          const isActiveGroup = activeBeat != null && (() => {
            let start = 0;
            for (let k = 0; k < gi; k++) start += groups[k];
            return activeBeat >= start && activeBeat < start + g;
          })();
          return (
            <div
              key={gi}
              style={{
                width: `${groupWidths[gi]}%`,
                backgroundColor: isActiveGroup ? `${color}25` : `${color}0a`,
                borderBottom: `3px solid ${color}`,
                transition: "background-color 0.08s",
              }}
              className="relative flex items-center justify-center"
            >
              <span className="text-[10px] font-mono font-bold" style={{ color: `${color}88` }}>
                {Number.isInteger(g) ? g : g.toFixed(2)}
              </span>
              {/* Beat dots within group */}
              <div className="absolute bottom-1 left-0 right-0 flex items-center justify-center gap-0.5 px-1">
                {Array.from({ length: intSteps }).map((_, bi) => {
                  let cumPos = 0;
                  for (let k = 0; k < gi; k++) cumPos += groups[k];
                  const beatPos = cumPos + (bi * g) / intSteps;
                  const isActive = activeBeat != null && Math.abs(beatPos - activeBeat) < 0.1;
                  return (
                    <div
                      key={bi}
                      style={{
                        width: bi === 0 ? 8 : 5,
                        height: bi === 0 ? 8 : 5,
                        borderRadius: "50%",
                        backgroundColor: isActive ? "#fff" : bi === 0 ? color : `${color}55`,
                        transform: isActive ? "scale(1.3)" : "scale(1)",
                        transition: "all 0.06s",
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
      <div className="relative h-5 bg-[#111] rounded overflow-hidden">
        {beatPositions.map((beat, i) => {
          const pct = (beat.pos / totalBeats) * 100;
          const isActive = activeBeat != null && Math.abs(beat.pos - activeBeat) < 0.1;
          return (
            <div
              key={i}
              className="absolute top-0 bottom-0 flex items-center"
              style={{ left: `${pct}%` }}
            >
              <div
                style={{
                  width: beat.isGroupStart ? 2.5 : 1,
                  height: beat.isGroupStart ? "100%" : "50%",
                  backgroundColor: isActive ? "#fff" : beat.isGroupStart ? color : `${color}44`,
                  boxShadow: isActive ? `0 0 4px ${color}` : "none",
                }}
              />
            </div>
          );
        })}
        {activeBeat != null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white opacity-60"
            style={{ left: `${(activeBeat / totalBeats) * 100}%`, transition: "left 0.06s" }}
          />
        )}
      </div>
    </div>
  );
}
