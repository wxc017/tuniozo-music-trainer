import { useMemo } from "react";
import { ComputedKey, HEX_RADIUS, LayoutResult } from "@/lib/lumatoneLayout";

interface Props {
  layout: LayoutResult;
  highlightedPitches: Set<number>;
  onKeyClick?: (key: ComputedKey) => void;
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i + 15);
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(" ");
}

function lightenHex(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(255, r + 120)},${Math.min(255, g + 120)},${Math.min(255, b + 120)})`;
}

function darkenHex(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * 0.28)},${Math.round(g * 0.28)},${Math.round(b * 0.28)})`;
}

export default function LumatoneKeyboard({ layout, highlightedPitches, onKeyClick }: Props) {
  const pad = 32;
  const hasHighlight = highlightedPitches.size > 0;

  const { viewBox } = useMemo(() => {
    const w = layout.maxX - layout.minX + pad * 2 + HEX_RADIUS * 2;
    const h = layout.maxY - layout.minY + pad * 2 + HEX_RADIUS * 2;
    const vb = `${layout.minX - pad - HEX_RADIUS} ${layout.minY - pad - HEX_RADIUS} ${w} ${h}`;
    return { viewBox: vb };
  }, [layout]);

  return (
    <div className="w-full overflow-hidden bg-[#111111] rounded-xl border border-[#333]">
      <svg
        width="100%"
        viewBox={viewBox}
        style={{ maxHeight: 220, display: "block", transform: "rotate(-2.5deg)", transformOrigin: "center center" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {layout.keys.map((key, i) => {
          const isLit = highlightedPitches.has(key.pitch);
          const fill = isLit
            ? lightenHex(key.color_hex)
            : hasHighlight
              ? darkenHex(key.color_hex)
              : key.color_hex;
          const stroke = isLit ? "#ffffff" : hasHighlight ? "#0d0d0d" : "#111111";
          const strokeW = isLit ? 2.0 : 0.35;

          return (
            <polygon
              key={i}
              points={hexPoints(key.x, key.y, HEX_RADIUS - 0.5)}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeW}
              style={{ cursor: onKeyClick ? "pointer" : "default", transition: "fill 0.18s, stroke 0.18s" }}
              onClick={() => onKeyClick?.(key)}
            />
          );
        })}
      </svg>
    </div>
  );
}
