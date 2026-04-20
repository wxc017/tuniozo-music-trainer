import { useMemo } from "react";

interface PianoKey {
  pitch: number;
  isBlack: boolean;
  x: number;
  w: number;
  h: number;
}

interface Props {
  highlightedPitches: Set<number>;
  onKeyClick?: (key: { pitch: number; section: number; color_hex: string; x: number; y: number; midi_note: number; channel: number; local_key_index: number }) => void;
  pitchMin?: number;
  pitchMax?: number;
}

/* Which positions in an octave (0–11) are black keys */
const IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];

/*
 * For each pitch-class 0–11, its x-offset in "white-key units" within the octave.
 * White keys sit at integer positions; black keys are placed between them.
 */
const PC_X: number[] = [
  0,      // C
  0.55,   // C#
  1,      // D
  1.55,   // D#
  2,      // E
  3,      // F
  3.55,   // F#
  4,      // G
  4.55,   // G#
  5,      // A
  5.55,   // A#
  6,      // B
];

const WHITES_PER_OCTAVE = 7;

export default function PianoKeyboard({ highlightedPitches, onKeyClick, pitchMin = -27, pitchMax = 32 }: Props) {
  const hasHighlight = highlightedPitches.size > 0;

  const { whiteKeys, blackKeys, totalW, totalH } = useMemo(() => {
    const WK_W = 22;
    const WK_H = 100;
    const BK_W = 14;
    const BK_H = 60;

    const whites: PianoKey[] = [];
    const blacks: PianoKey[] = [];

    /* Find the octave of pitchMin */
    const baseOct = Math.floor(pitchMin / 12);

    for (let p = pitchMin; p <= pitchMax; p++) {
      const pc = ((p % 12) + 12) % 12;
      const oct = Math.floor(p / 12) - baseOct;
      const x = (oct * WHITES_PER_OCTAVE + PC_X[pc]) * WK_W;

      if (IS_BLACK[pc]) {
        blacks.push({ pitch: p, isBlack: true, x: x - BK_W / 2 + WK_W / 2, w: BK_W, h: BK_H });
      } else {
        whites.push({ pitch: p, isBlack: false, x, w: WK_W, h: WK_H });
      }
    }

    /* Total width from leftmost to rightmost white key */
    const minX = whites.length > 0 ? whites[0].x : 0;
    const maxX = whites.length > 0 ? whites[whites.length - 1].x + WK_W : 0;

    /* Shift everything so it starts at 0 */
    const shift = -minX;
    whites.forEach(k => (k.x += shift));
    blacks.forEach(k => (k.x += shift));

    return { whiteKeys: whites, blackKeys: blacks, totalW: maxX - minX, totalH: WK_H };
  }, [pitchMin, pitchMax]);

  const makeClickable = (key: PianoKey) => ({
    pitch: key.pitch,
    section: 1,
    color_hex: key.isBlack ? "#606060" : "#e8e8e8",
    x: key.x,
    y: 0,
    midi_note: key.pitch + 60,
    channel: 1,
    local_key_index: 0,
  });

  const whiteFill = (k: PianoKey) => {
    const lit = highlightedPitches.has(k.pitch);
    if (lit) return "#7cb8ff";
    if (hasHighlight) return "#2a2a2a";
    return "#d4d4d4";
  };

  const blackFill = (k: PianoKey) => {
    const lit = highlightedPitches.has(k.pitch);
    if (lit) return "#5a9fd4";
    if (hasHighlight) return "#111";
    return "#1a1a1a";
  };

  const stroke = (k: PianoKey) => {
    if (highlightedPitches.has(k.pitch)) return "#fff";
    return k.isBlack ? "#222" : "#333";
  };

  return (
    <div className="w-full overflow-hidden bg-[#111111] rounded-xl border border-[#333]">
      <svg
        width="100%"
        viewBox={`-2 -2 ${totalW + 4} ${totalH + 4}`}
        style={{ maxHeight: 220, display: "block" }}
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* White keys (background layer) */}
        {whiteKeys.map((k, i) => (
          <rect
            key={`w${i}`}
            x={k.x} y={0}
            width={k.w} height={k.h}
            rx={2}
            fill={whiteFill(k)}
            stroke={stroke(k)}
            strokeWidth={highlightedPitches.has(k.pitch) ? 2 : 0.5}
            style={{ cursor: onKeyClick ? "pointer" : "default", transition: "fill 0.18s" }}
            onClick={() => onKeyClick?.(makeClickable(k))}
          />
        ))}
        {/* Black keys (foreground layer) */}
        {blackKeys.map((k, i) => (
          <rect
            key={`b${i}`}
            x={k.x} y={0}
            width={k.w} height={k.h}
            rx={2}
            fill={blackFill(k)}
            stroke={stroke(k)}
            strokeWidth={highlightedPitches.has(k.pitch) ? 2 : 0.5}
            style={{ cursor: onKeyClick ? "pointer" : "default", transition: "fill 0.18s" }}
            onClick={() => onKeyClick?.(makeClickable(k))}
          />
        ))}
      </svg>
    </div>
  );
}
