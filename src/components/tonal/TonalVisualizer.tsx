// Visualizer for tonal ear training — shows pitched note contour and feedback
// Mirrors the BeatVisualizer / TimeSigVisualizer visual language

import { useMemo } from "react";

interface Props {
  /** Array of absolute note numbers played (single-note frames) */
  frames: number[][];
  /** edo size, for computing octave-relative info */
  edo: number;
  /** Label text (exercise name) */
  label?: string;
  /** Feedback text after answering */
  feedback?: string;
  /** Feedback type for coloring */
  feedbackType?: "correct" | "incorrect" | "reveal";
}

const BAR_COLORS = [
  "#7173e6", "#e67171", "#71e6a3", "#e6c871",
  "#c871e6", "#71c8e6", "#e6a071", "#a0e671",
];

export default function TonalVisualizer({ frames, edo, label, feedback, feedbackType }: Props) {
  // Flatten all notes to get range
  const allNotes = useMemo(() => frames.flatMap(f => f.filter(n => n >= 0)), [frames]);
  const minNote = useMemo(() => Math.min(...allNotes), [allNotes]);
  const maxNote = useMemo(() => Math.max(...allNotes), [allNotes]);
  const range = Math.max(maxNote - minNote, 1);

  if (!frames.length || !allNotes.length) return null;

  // Detect phrase boundaries: sequences separated by gap markers (-1)
  const phrases = useMemo(() => {
    const result: number[][][] = [];
    let current: number[][] = [];
    for (const frame of frames) {
      if (frame.length === 1 && frame[0] === -1) {
        if (current.length) result.push(current);
        current = [];
      } else {
        current.push(frame);
      }
    }
    if (current.length) result.push(current);
    return result;
  }, [frames]);

  const totalNotes = phrases.reduce((a, p) => a + p.length, 0);

  return (
    <div className="bg-[#0e0e0e] border border-[#222] rounded-lg overflow-hidden">
      {/* Header */}
      {label && (
        <div className="px-4 pt-3 pb-1 border-b border-[#1a1a1a] flex items-center gap-2">
          <p className="text-xs text-[#666] uppercase tracking-wider">{label}</p>
          <span className="text-[10px] text-[#444] ml-auto">{totalNotes} notes</span>
        </div>
      )}

      {/* Note contour visualization */}
      <div className="px-4 py-3">
        <div className="relative h-16 bg-[#141414] rounded-lg overflow-hidden">
          {/* Background grid lines */}
          {[0.25, 0.5, 0.75].map(frac => (
            <div key={frac} className="absolute left-0 right-0" style={{ top: `${frac * 100}%`, height: 1, backgroundColor: "rgba(255,255,255,0.03)" }} />
          ))}

          {/* Phrase separator lines */}
          {phrases.length > 1 && (() => {
            let notesSoFar = 0;
            return phrases.slice(0, -1).map((phrase, pi) => {
              notesSoFar += phrase.length;
              const pct = (notesSoFar / totalNotes) * 100;
              return (
                <div key={`sep-${pi}`} className="absolute top-0 bottom-0" style={{ left: `${pct}%`, width: 1, backgroundColor: "rgba(255,255,255,0.08)", borderLeft: "1px dashed rgba(255,255,255,0.06)" }} />
              );
            });
          })()}

          {/* Note dots and connecting lines */}
          {(() => {
            let globalIdx = 0;
            return phrases.map((phrase, pi) => {
              const color = BAR_COLORS[pi % BAR_COLORS.length];
              const startIdx = globalIdx;
              const dots = phrase.map((frame, fi) => {
                const idx = startIdx + fi;
                const x = ((idx + 0.5) / totalNotes) * 100;
                // For chords, use average pitch for vertical position
                const validNotes = frame.filter(n => n >= 0);
                const avgNote = validNotes.reduce((a, b) => a + b, 0) / validNotes.length;
                const y = (1 - (avgNote - minNote) / range) * 100;
                const isChord = validNotes.length > 1;
                return { x, y, frame: validNotes, isChord, idx };
              });
              globalIdx += phrase.length;

              return (
                <g key={pi}>
                  {/* Connection lines between notes in phrase */}
                  {dots.map((dot, di) => {
                    if (di === 0) return null;
                    const prev = dots[di - 1];
                    return (
                      <div
                        key={`line-${pi}-${di}`}
                        className="absolute"
                        style={{
                          left: `${prev.x}%`,
                          top: `${Math.min(prev.y, dot.y)}%`,
                          width: `${dot.x - prev.x}%`,
                          height: `${Math.abs(dot.y - prev.y) || 1}%`,
                          background: `linear-gradient(${dot.y < prev.y ? "to top right" : "to bottom right"}, ${color}44, ${color}44)`,
                          opacity: 0.3,
                        }}
                      />
                    );
                  })}
                  {/* Note dots */}
                  {dots.map((dot) => (
                    <div
                      key={`dot-${dot.idx}`}
                      className="absolute"
                      style={{
                        left: `${dot.x}%`,
                        top: `${dot.y}%`,
                        width: dot.isChord ? 10 : 8,
                        height: dot.isChord ? 10 : 8,
                        borderRadius: "50%",
                        backgroundColor: color,
                        border: `1.5px solid ${color}`,
                        transform: "translate(-50%, -50%)",
                        boxShadow: `0 0 4px ${color}44`,
                      }}
                    />
                  ))}
                </g>
              );
            });
          })()}
        </div>

        {/* Phrase labels */}
        {phrases.length > 1 && (
          <div className="flex mt-1.5 gap-3">
            {phrases.map((_, pi) => (
              <span key={pi} className="text-[9px] font-mono flex items-center gap-1">
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: BAR_COLORS[pi % BAR_COLORS.length], display: "inline-block" }} />
                <span style={{ color: BAR_COLORS[pi % BAR_COLORS.length] }}>
                  Phrase {String.fromCharCode(65 + pi)}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`mx-4 mb-3 rounded p-2.5 text-sm border font-medium ${
          feedbackType === "correct"
            ? "bg-[#1a3a1a] border-[#3a6a3a] text-[#5cca5c]"
            : feedbackType === "incorrect"
              ? "bg-[#3a1a1a] border-[#6a3a3a] text-[#e06060]"
              : "bg-[#1a1a0e] border-[#5a4a22] text-[#c8aa50]"
        }`}>
          {feedback}
        </div>
      )}
    </div>
  );
}
