import { useMemo, type MouseEvent } from "react";
import { ComputedKey, HEX_RADIUS, LayoutResult } from "@/lib/lumatoneLayout";

interface Props {
  layout: LayoutResult;
  highlightedPitches: Set<number>;
  /** Light only these specific KEY INDICES (one instance per note) instead of
   *  every key sharing a pitch class.  When set, it overrides highlightedPitches. */
  litKeys?: Set<number>;
  /** Pitch CLASSES (not absolute pitches) to render with a very dim glow —
   *  e.g. the underlying scale shown faintly behind the lit chord tones.
   *  Matched modulo `edo` so every octave of each scale degree lights. */
  dimPitchClasses?: Set<number>;
  edo?: number;
  onKeyClick?: (key: ComputedKey, e: MouseEvent) => void;
  /** Optional short text drawn in the middle of every key (e.g. interval suffix).
   *  `prefer` is the sharp/flat spelling chosen from the hex's position (only set
   *  when `isNatural` is provided). */
  labelOf?: (pitch: number, prefer?: "sharp" | "flat") => string | undefined;
  /** When given, non-natural hexes are spelled SHARP if they sit above the
   *  nearest natural hex and FLAT if below (Lumatone position-based spelling). */
  isNatural?: (pitch: number) => boolean;
  /** Pitch CLASS treated as the root — its keys get a bright outline. */
  rootPitchClass?: number;
  /** Pitch CLASSES to darken and unlabel (e.g. the ring you're not viewing). */
  mutedPitchClasses?: Set<number>;
  /** SVG max-height in px.  Default 220 keeps the global header
   *  visualizer compact; pass a larger number (or null to remove
   *  the cap entirely) when embedding inside a tall column that
   *  should be filled with hex keys. */
  maxHeight?: number | null;
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i + 15);
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(" ");
}

// How much a lit chord node is brightened over its base key colour.
const LIT_BOOST = 110;

function lightenHex(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(255, r + LIT_BOOST)},${Math.min(255, g + LIT_BOOST)},${Math.min(255, b + LIT_BOOST)})`;
}

function darkenHex(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * 0.28)},${Math.round(g * 0.28)},${Math.round(b * 0.28)})`;
}

// The scale wash: about 45% of the brightness of a lit chord node (which renders
// as lightenHex(color)), so scale degrees read clearly below the chord tones.
function dimHex(hex: string): string {
  const lr = Math.min(255, parseInt(hex.slice(1, 3), 16) + LIT_BOOST);
  const lg = Math.min(255, parseInt(hex.slice(3, 5), 16) + LIT_BOOST);
  const lb = Math.min(255, parseInt(hex.slice(5, 7), 16) + LIT_BOOST);
  return `rgb(${Math.round(lr * 0.45)},${Math.round(lg * 0.45)},${Math.round(lb * 0.45)})`;
}

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export default function LumatoneKeyboard({ layout, highlightedPitches, litKeys, dimPitchClasses, edo, onKeyClick, labelOf, isNatural, rootPitchClass, mutedPitchClasses, maxHeight = 220 }: Props) {
  const pad = 32;
  // Natural-pitch hex positions, so each non-natural hex can pick its sharp/flat
  // spelling from whether it sits above (sharp) or below (flat) the nearest one.
  const naturalKeys = useMemo(
    () => (isNatural ? layout.keys.filter(k => isNatural(k.pitch)) : []),
    [layout, isNatural],
  );
  // ~a whole tone in this EDO (+ a little) — the pitch window that brackets a
  // note with its two neighbouring naturals, so we never reference a far/wrong-
  // octave white key.
  const wtWindow = edo ? Math.round((edo * 210) / 1200) + 2 : 3;
  const preferFor = (kx: number, ky: number, pitch: number): "sharp" | "flat" | undefined => {
    if (!isNatural || naturalKeys.length === 0 || isNatural(pitch)) return undefined;
    // Nearest natural HEX among the pitch-bracketing ones (within ~a whole tone),
    // by physical distance.  Higher pitch sits higher on screen (smaller y), so a
    // hex above that white key → sharp, below → flat.
    let best: ComputedKey | null = null, bd = Infinity;
    for (const nk of naturalKeys) {
      if (Math.abs(nk.pitch - pitch) > wtWindow) continue;
      const d = (nk.x - kx) ** 2 + (nk.y - ky) ** 2;
      if (d < bd) { bd = d; best = nk; }
    }
    if (!best) return undefined;
    return ky < best.y ? "sharp" : "flat";
  };
  const hasHighlight = (litKeys ?? highlightedPitches).size > 0;
  const hasDim = !!dimPitchClasses && dimPitchClasses.size > 0;
  // When something is lit OR a dim scale is shown, non-member keys darken so
  // the (dim or full) highlights stand out.
  const hasAny = hasHighlight || hasDim;

  const { viewBox } = useMemo(() => {
    const w = layout.maxX - layout.minX + pad * 2 + HEX_RADIUS * 2;
    const h = layout.maxY - layout.minY + pad * 2 + HEX_RADIUS * 2;
    const vb = `${layout.minX - pad - HEX_RADIUS} ${layout.minY - pad - HEX_RADIUS} ${w} ${h}`;
    return { viewBox: vb };
  }, [layout]);

  return (
    <div className="w-full h-full overflow-hidden bg-[#111111] rounded-xl border border-[#333]">
      <svg
        width="100%"
        height={maxHeight === null ? "100%" : undefined}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        style={{ ...(maxHeight !== null ? { maxHeight } : {}), display: "block", transform: "rotate(-2.5deg)", transformOrigin: "center center" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {layout.keys.map((key, i) => {
          const isLit = litKeys ? litKeys.has(i) : highlightedPitches.has(key.pitch);
          const pc = hasDim && edo && edo > 0 ? ((key.pitch % edo) + edo) % edo : -1;
          const isDim = !isLit && hasDim && dimPitchClasses!.has(pc);
          const isMuted = edo != null && !!mutedPitchClasses
            && mutedPitchClasses.has(((key.pitch % edo) + edo) % edo);
          const fill = isMuted
            ? darkenHex(key.color_hex)
            : isLit
              ? lightenHex(key.color_hex)
              : isDim
                ? dimHex(key.color_hex)
                : hasAny
                  ? darkenHex(key.color_hex)
                  : key.color_hex;
          const isRoot = !isMuted && edo != null && rootPitchClass != null
            && ((key.pitch % edo) + edo) % edo === ((rootPitchClass % edo) + edo) % edo;
          const stroke = isMuted ? "#0d0d0d" : isRoot ? "#ffffff" : isLit ? "#ffffff" : isDim ? "#3a3a3a" : hasAny ? "#0d0d0d" : "#111111";
          const strokeW = isMuted ? 0.35 : isRoot ? 2.4 : isLit ? 2.0 : isDim ? 0.6 : 0.35;
          const label = isMuted ? undefined : labelOf?.(key.pitch, preferFor(key.x, key.y, key.pitch));
          // lit keys are brightened, so use dark text on them; otherwise pick by base luminance
          const textCol = isLit ? "#0a0a0a" : luminance(key.color_hex) > 140 ? "#0c0c0c" : "#f4f4f4";

          return (
            <g key={i}>
              <polygon
                points={hexPoints(key.x, key.y, HEX_RADIUS - 0.5)}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeW}
                style={{ cursor: onKeyClick ? "pointer" : "default", transition: "fill 0.18s, stroke 0.18s" }}
                onClick={(e) => onKeyClick?.(key, e)}
              />
              {label && (() => {
                // Multi-word labels (the fully-spelled interval names, e.g.
                // "Small Major 3rd") stack one word per line so they fit the
                // hex; single tokens (codes / solfège / note names) render at
                // full size.
                const words = label.split(" ");
                const multi = words.length > 1;
                const fs = HEX_RADIUS * (multi ? 0.3 : 0.52);
                const lineH = fs * 1.08;
                const y0 = key.y - (lineH * (words.length - 1)) / 2;
                // SMuFL accidental glyphs live in the Private-Use Area; render them
                // a touch BIGGER (so they read at the letter's size, not subscript)
                // in Bravura, with the letter/superscript runs in the normal font.
                const isPua = (c: string) => { const cp = c.codePointAt(0)!; return cp >= 0xE000 && cp <= 0xF8FF; };
                const isSup = (c: string) => "ˢˡⁿᵏᵈⁱ⁻⁺⁰¹²³⁴⁵⁶⁷⁸⁹".includes(c);   // the s/l size superscript
                const hasGlyph = !multi && [...label].some(c => isPua(c) || isSup(c));
                return (
                  <text x={key.x} y={key.y} textAnchor="middle" dominantBaseline="central"
                    fontSize={fs} fontWeight={multi ? 700 : 600} fill={textCol}
                    fontFamily="Inter, system-ui, sans-serif, 'Bravura Text'"
                    style={{ pointerEvents: "none", userSelect: "none" }}>
                    {multi
                      ? words.map((w, wi) => <tspan key={wi} x={key.x} y={y0 + wi * lineH}>{w}</tspan>)
                      : hasGlyph
                        ? [...label].map((c, ci) => isPua(c)
                            ? <tspan key={ci} fontSize={fs * 1.32} fontWeight={400} fontFamily="'Bravura Text'">{c}</tspan>
                            : isSup(c)
                              ? <tspan key={ci} fontWeight={400}>{c}</tspan>   // size superscript: lighter
                              : <tspan key={ci}>{c}</tspan>)
                        : label}
                  </text>
                );
              })()}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
