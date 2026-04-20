import { useState, useEffect, useRef, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PitchContourProps {
  /** Absolute note numbers (higher = higher pitch) */
  notes: number[];
  /** Scale degree labels for each note, e.g. ["1","3","5","7"] */
  degrees: string[];
  /** Currently highlighted note index during replay, null when not playing */
  activeIdx?: number | null;
  /** Family/category label */
  label?: string;
  /** Color theme — defaults to purple */
  color?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SVG_HEIGHT = 120;
const PAD_LEFT = 32;     // room for optional label
const PAD_RIGHT = 16;
const PAD_TOP = 20;
const PAD_BOTTOM = 28;   // room for degree labels
const DOT_R = 5;
const Y_MIN = PAD_TOP;
const Y_MAX = SVG_HEIGHT - PAD_BOTTOM;
const DEFAULT_COLOR = "#a78bfa"; // purple-400

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Map a note value into the SVG y range (higher note = lower y). */
function mapY(note: number, minNote: number, maxNote: number): number {
  if (maxNote === minNote) return (Y_MIN + Y_MAX) / 2;
  const t = (note - minNote) / (maxNote - minNote); // 0..1
  return Y_MAX - t * (Y_MAX - Y_MIN); // invert: high note -> low y
}

/** Small chevron path pointing up or down, centered at (0,0). */
function chevronPath(up: boolean): string {
  const dy = up ? -3 : 3;
  return `M-3,${dy} L0,${-dy} L3,${dy}`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PitchContour({
  notes,
  degrees,
  activeIdx = null,
  label,
  color = DEFAULT_COLOR,
}: PitchContourProps) {
  if (notes.length === 0) return null;

  const n = notes.length;
  const minNote = Math.min(...notes);
  const maxNote = Math.max(...notes);

  // Find tonic positions (degree "1" or "8") for the reference line
  const tonicIndices = degrees
    .map((d, i) => (d === "1" || d === "8" ? i : -1))
    .filter((i) => i >= 0);
  const tonicNote = tonicIndices.length > 0 ? notes[tonicIndices[0]] : null;
  const tonicY = tonicNote !== null ? mapY(tonicNote, minNote, maxNote) : null;

  return (
    <div
      style={{
        background: "#0e0e0e",
        border: "1px solid #222",
        borderRadius: 8,
        padding: "6px 4px",
        maxHeight: 300,
        overflow: "hidden",
      }}
    >
      <svg
        width="100%"
        height={SVG_HEIGHT}
        viewBox={`0 0 400 ${SVG_HEIGHT}`}
        preserveAspectRatio="none"
        style={{ display: "block" }}
      >
        {/* Glow filter for active dot */}
        <defs>
          <filter id="pc-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Tonic reference line */}
        {tonicY !== null && (
          <line
            x1={PAD_LEFT}
            x2={400 - PAD_RIGHT}
            y1={tonicY}
            y2={tonicY}
            stroke="#333"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}

        {/* Label text (vertical, left side) */}
        {label && (
          <text
            x={10}
            y={SVG_HEIGHT / 2}
            fill="#888"
            fontSize={9}
            fontFamily="monospace"
            textAnchor="middle"
            dominantBaseline="central"
            transform={`rotate(-90, 10, ${SVG_HEIGHT / 2})`}
          >
            {label}
          </text>
        )}

        {/* Connecting lines */}
        {notes.map((_, i) => {
          if (i === 0) return null;
          const x1 = PAD_LEFT + ((i - 1) / Math.max(n - 1, 1)) * (400 - PAD_LEFT - PAD_RIGHT);
          const x2 = PAD_LEFT + (i / Math.max(n - 1, 1)) * (400 - PAD_LEFT - PAD_RIGHT);
          const y1 = mapY(notes[i - 1], minNote, maxNote);
          const y2 = mapY(notes[i], minNote, maxNote);
          return (
            <line
              key={`line-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth={1}
              strokeOpacity={0.4}
            />
          );
        })}

        {/* Interval direction arrows */}
        {notes.map((_, i) => {
          if (i === 0) return null;
          const interval = notes[i] - notes[i - 1];
          if (Math.abs(interval) <= 2) return null;
          const x1 = PAD_LEFT + ((i - 1) / Math.max(n - 1, 1)) * (400 - PAD_LEFT - PAD_RIGHT);
          const x2 = PAD_LEFT + (i / Math.max(n - 1, 1)) * (400 - PAD_LEFT - PAD_RIGHT);
          const mx = (x1 + x2) / 2;
          const y1 = mapY(notes[i - 1], minNote, maxNote);
          const y2 = mapY(notes[i], minNote, maxNote);
          const my = (y1 + y2) / 2;
          const up = interval > 0;
          return (
            <path
              key={`arrow-${i}`}
              d={chevronPath(up)}
              transform={`translate(${mx}, ${my})`}
              fill="none"
              stroke="#888"
              strokeWidth={1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {/* Dots */}
        {notes.map((note, i) => {
          const x = PAD_LEFT + (i / Math.max(n - 1, 1)) * (400 - PAD_LEFT - PAD_RIGHT);
          const y = mapY(note, minNote, maxNote);
          const isActive = activeIdx === i;
          return (
            <g key={`dot-${i}`}>
              {/* Active glow ring */}
              {isActive && (
                <circle
                  cx={x}
                  cy={y}
                  r={DOT_R + 4}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={1.5}
                  strokeOpacity={0.35}
                  filter="url(#pc-glow)"
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={DOT_R}
                fill={isActive ? "#fff" : color}
                fillOpacity={isActive ? 1 : 0.7}
                filter={isActive ? "url(#pc-glow)" : undefined}
              />
            </g>
          );
        })}

        {/* Degree labels */}
        {degrees.map((deg, i) => {
          const x = PAD_LEFT + (i / Math.max(n - 1, 1)) * (400 - PAD_LEFT - PAD_RIGHT);
          return (
            <text
              key={`deg-${i}`}
              x={x}
              y={SVG_HEIGHT - 6}
              fill="#888"
              fontSize={9}
              fontFamily="monospace"
              textAnchor="middle"
              dominantBaseline="auto"
            >
              {deg}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Replay animation hook                                              */
/* ------------------------------------------------------------------ */

export function useContourReplay(
  frames: number[][] | null,
  gapMs: number,
): { activeIdx: number | null; startReplay: () => void; isReplaying: boolean } {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idxRef = useRef(0);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => cleanup, [cleanup]);

  const startReplay = useCallback(() => {
    if (!frames || frames.length === 0) return;

    cleanup();
    idxRef.current = 0;
    setActiveIdx(0);
    setIsReplaying(true);

    const totalFrames = frames.length;

    timerRef.current = setInterval(() => {
      idxRef.current += 1;
      if (idxRef.current >= totalFrames) {
        cleanup();
        setActiveIdx(null);
        setIsReplaying(false);
      } else {
        setActiveIdx(idxRef.current);
      }
    }, gapMs);
  }, [frames, gapMs, cleanup]);

  return { activeIdx, startReplay, isReplaying };
}
