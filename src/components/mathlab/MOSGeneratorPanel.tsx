import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useLS } from "@/lib/storage";
import { EDO_DATA, type EDOData } from "@/lib/edoTemperamentData";

// ---------------------------------------------------------------------------
// MOS name database
// ---------------------------------------------------------------------------
const MOS_NAMES: Record<string, string> = {
  "5L2s": "Diatonic", "2L5s": "Pentatonic (anti-diatonic)",
  "3L4s": "Mosh", "4L3s": "Smitonic",
  "1L4s": "Antipentic", "4L1s": "Pentic",
  "1L6s": "Antipine", "6L1s": "Pine",
  "2L3s": "Pentatonic", "3L2s": "Anti-pentatonic",
  "5L1s": "Machinoid", "1L5s": "Anti-machinoid",
  "3L5s": "Checkertonic", "5L3s": "Oneirotonic",
  "7L5s": "Chromatic", "5L7s": "Enharmonic",
};

// ---------------------------------------------------------------------------
// Scale computation helpers
// ---------------------------------------------------------------------------
interface ScaleInfo {
  positions: number[];      // raw stacking positions (mod period), length = numNotes
  sorted: number[];         // positions sorted ascending
  stepSizes: number[];      // intervals between consecutive sorted degrees
  uniqueSteps: number[];    // distinct step sizes (desc)
  isMOS: boolean;
  L: number; s: number;
  Lcount: number; scount: number;
  pattern: string;          // e.g. "LLsLLLs"
  ratio: number;            // L/s
  proper: boolean;
  mosKey: string;            // e.g. "5L2s"
  mosName: string;
}

function computeScale(generator: number, period: number, numNotes: number): ScaleInfo {
  const positions: number[] = [];
  for (let i = 0; i < numNotes; i++) {
    positions.push(((i * generator) % period + period) % period);
  }
  const sorted = [...positions].sort((a, b) => a - b);
  const stepSizes: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const next = i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + period;
    stepSizes.push(+(next - sorted[i]).toFixed(6));
  }
  const uniqueSteps = [...new Set(stepSizes.map(s => +s.toFixed(4)))].sort((a, b) => b - a);
  const isMOS = uniqueSteps.length === 2 || (uniqueSteps.length === 1 && numNotes > 1);
  const L = uniqueSteps[0] ?? 0;
  const s = uniqueSteps.length > 1 ? uniqueSteps[1] : L;
  const Lcount = stepSizes.filter(x => +x.toFixed(4) === +L.toFixed(4)).length;
  const scount = stepSizes.filter(x => +x.toFixed(4) === +s.toFixed(4)).length;
  const pattern = stepSizes.map(x => (+x.toFixed(4) === +L.toFixed(4) ? "L" : "s")).join("");
  const ratio = s > 0.0001 ? L / s : Infinity;
  const mosKey = `${Lcount}L${scount}s`;

  // Properness check: every interval of k steps spans a range that doesn't
  // overlap with any interval of k-1 or k+1 steps
  let proper = true;
  if (isMOS && numNotes > 2) {
    for (let k = 1; k < numNotes && proper; k++) {
      let minK = Infinity, maxK = -Infinity;
      let minK1 = Infinity, maxK1 = -Infinity;
      for (let i = 0; i < numNotes; i++) {
        let sumK = 0, sumK1 = 0;
        for (let j = 0; j < k; j++) sumK += stepSizes[(i + j) % numNotes];
        for (let j = 0; j < k + 1 && k + 1 <= numNotes; j++) sumK1 += stepSizes[(i + j) % numNotes];
        minK = Math.min(minK, sumK); maxK = Math.max(maxK, sumK);
        if (k + 1 <= numNotes) { minK1 = Math.min(minK1, sumK1); maxK1 = Math.max(maxK1, sumK1); }
      }
      if (k + 1 <= numNotes && maxK > minK1) proper = false;
    }
  }

  return {
    positions, sorted, stepSizes, uniqueSteps, isMOS,
    L, s, Lcount, scount, pattern, ratio, proper,
    mosKey, mosName: MOS_NAMES[mosKey] ?? "",
  };
}

// ---------------------------------------------------------------------------
// Generator Circle (SVG)
// ---------------------------------------------------------------------------
const CX = 160, CY = 160, R = 130;

function GeneratorCircle({ scale, generator, period, numNotes }: {
  scale: ScaleInfo; generator: number; period: number; numNotes: number;
}) {
  const points = useMemo(() => {
    return scale.sorted.map((pos, idx) => {
      const angle = (pos / period) * 2 * Math.PI - Math.PI / 2;
      const stackIdx = scale.positions.indexOf(pos);
      return { x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle), angle, pos, stackIdx, degIdx: idx };
    });
  }, [scale, period]);

  // Generator arrow: from point at stacking index 0 to stacking index 1
  const p0 = points.find(p => p.stackIdx === 0);
  const p1 = points.find(p => p.stackIdx === 1);

  return (
    <svg viewBox="0 0 320 320" className="w-full max-w-[320px]">
      {/* Background circle */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#333" strokeWidth={1.5} />
      {/* Period mark at top */}
      <line x1={CX} y1={CY - R - 8} x2={CX} y2={CY - R + 8} stroke="#666" strokeWidth={2} />

      {/* Arc segments between consecutive scale degrees */}
      {points.map((pt, i) => {
        const next = points[(i + 1) % points.length];
        const stepVal = scale.stepSizes[i];
        const isLarge = +stepVal.toFixed(4) === +scale.L.toFixed(4);
        const color = isLarge ? "#8888dd" : "#666699";
        // SVG arc from pt to next
        const sweep = ((next.angle - pt.angle + 2 * Math.PI) % (2 * Math.PI)) > Math.PI ? 1 : 0;
        const largeArc = ((next.angle - pt.angle + 2 * Math.PI) % (2 * Math.PI)) > Math.PI ? 1 : 0;
        return (
          <path key={i}
            d={`M ${pt.x} ${pt.y} A ${R} ${R} 0 ${largeArc} 1 ${next.x} ${next.y}`}
            fill="none" stroke={color} strokeWidth={3} opacity={0.8}
          />
        );
      })}

      {/* Generator arrow */}
      {p0 && p1 && (
        <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y}
          stroke="#cc8844" strokeWidth={1.5} strokeDasharray="4 3"
          markerEnd="url(#arrow)" />
      )}
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#cc8844" />
        </marker>
      </defs>

      {/* Points */}
      {points.map((pt, i) => (
        <g key={i}>
          <circle cx={pt.x} cy={pt.y} r={6} fill={scale.isMOS ? "#8888dd" : "#888"}
            stroke="#222" strokeWidth={1} style={{ transition: "cx 0.15s, cy 0.15s" }} />
          {/* Stacking order inside circle */}
          <text x={CX + (R - 22) * Math.cos(pt.angle)} y={CY + (R - 22) * Math.sin(pt.angle)}
            fill="#aaa" fontSize={9} textAnchor="middle" dominantBaseline="central">
            {pt.stackIdx}
          </text>
          {/* Scale degree outside */}
          <text x={CX + (R + 16) * Math.cos(pt.angle)} y={CY + (R + 16) * Math.sin(pt.angle)}
            fill="#ccc" fontSize={10} textAnchor="middle" dominantBaseline="central" fontWeight="bold">
            {i}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Stable color for a MOS pattern key (deterministic, well-spaced hues)
// ---------------------------------------------------------------------------
function mosColor(Lcount: number, scount: number, alpha = 0.75): string {
  const hue = ((Lcount * 67 + scount * 137) % 360);
  return `hsla(${hue}, 55%, 45%, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Staircase Diagram (Canvas) — DPR-aware, with hover tooltip + legend
// ---------------------------------------------------------------------------
const STAIRCASE_MIN_NOTES = 2;
const STAIRCASE_MAX_NOTES = 20;

function StaircaseDiagram({ generator, period, numNotes, mode }: {
  generator: number; period: number; numNotes: number; mode: "free" | "edo";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    x: number; y: number; gen: number; notes: number; mosKey: string; mosName: string; pattern: string; L: number; s: number;
  } | null>(null);

  // Collect unique MOS patterns found in the diagram for the legend
  const legendRef = useRef<Map<string, { Lcount: number; scount: number; name: string }>>(new Map());

  // Store layout params so hover can use them
  const layoutRef = useRef<{
    marginL: number; marginT: number; plotW: number; plotH: number;
    halfP: number; xSteps: number; ySteps: number; cellW: number; cellH: number;
  } | null>(null);

  const draw = useCallback(() => {
    const cvs = canvasRef.current;
    const container = containerRef.current;
    if (!cvs || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const cssW = Math.floor(rect.width);
    const cssH = 260;

    cvs.width = cssW * dpr;
    cvs.height = cssH * dpr;
    cvs.style.width = cssW + "px";
    cvs.style.height = cssH + "px";

    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const marginL = 38;
    const marginR = 10;
    const marginT = 10;
    const marginB = 28;
    const plotW = cssW - marginL - marginR;
    const plotH = cssH - marginT - marginB;

    const minNotes = STAIRCASE_MIN_NOTES;
    const maxNotes = STAIRCASE_MAX_NOTES;
    const halfP = period / 2;

    const xSteps = mode === "edo" ? Math.min(Math.floor(halfP), plotW) : Math.min(300, plotW);
    const ySteps = maxNotes - minNotes + 1;

    const cellW = plotW / xSteps;
    const cellH = plotH / ySteps;

    // Save layout for hover handler
    layoutRef.current = { marginL, marginT, plotW, plotH, halfP, xSteps, ySteps, cellW, cellH };

    const legend = new Map<string, { Lcount: number; scount: number; name: string }>();

    // Draw MOS cells + collect legend entries
    for (let yi = 0; yi < ySteps; yi++) {
      const n = minNotes + yi;
      for (let xi = 0; xi < xSteps; xi++) {
        const gx = mode === "edo"
          ? Math.round((xi + 0.5) / xSteps * halfP)
          : ((xi + 0.5) / xSteps) * halfP;
        if (gx < 0.01) continue;

        const info = computeScale(gx, period, n);
        const sx = marginL + xi * cellW;
        const sy = marginT + (ySteps - 1 - yi) * cellH;

        if (info.isMOS && info.uniqueSteps.length === 2) {
          ctx.fillStyle = mosColor(info.Lcount, info.scount);
          if (!legend.has(info.mosKey)) {
            legend.set(info.mosKey, { Lcount: info.Lcount, scount: info.scount, name: info.mosName });
          }
        } else {
          ctx.fillStyle = "rgba(40,40,40,0.5)";
        }
        ctx.fillRect(sx, sy, Math.ceil(cellW) + 0.5, Math.ceil(cellH) + 0.5);
      }
    }

    legendRef.current = legend;

    // Label MOS regions: for each unique MOS pattern, find the center of its cells
    // and draw the label once (at the largest contiguous region)
    const labelPositions: { key: string; cx: number; cy: number; area: number }[] = [];
    const seen = new Set<string>();
    for (let yi = 0; yi < ySteps; yi++) {
      const n = minNotes + yi;
      for (let xi = 0; xi < xSteps; xi++) {
        const gx = mode === "edo"
          ? Math.round((xi + 0.5) / xSteps * halfP)
          : ((xi + 0.5) / xSteps) * halfP;
        if (gx < 0.01) continue;
        const info = computeScale(gx, period, n);
        if (!info.isMOS || info.uniqueSteps.length !== 2) continue;
        const regionKey = `${info.mosKey}_${yi}`;
        if (seen.has(regionKey)) continue;
        // Flood-fill to find contiguous region extent for this MOS at this row
        let minX = xi, maxX = xi;
        for (let x2 = xi + 1; x2 < xSteps; x2++) {
          const g2 = mode === "edo"
            ? Math.round((x2 + 0.5) / xSteps * halfP)
            : ((x2 + 0.5) / xSteps) * halfP;
          if (g2 < 0.01) break;
          const i2 = computeScale(g2, period, n);
          if (i2.mosKey !== info.mosKey) break;
          maxX = x2;
          seen.add(`${i2.mosKey}_${yi}`);
        }
        seen.add(regionKey);
        const spanCells = maxX - minX + 1;
        const cx = marginL + ((minX + maxX) / 2) * cellW + cellW / 2;
        const cy = marginT + (ySteps - 1 - yi) * cellH + cellH / 2;
        labelPositions.push({ key: info.mosKey, cx, cy, area: spanCells });
      }
    }

    // Deduplicate: keep the largest region for each mosKey
    const bestLabels = new Map<string, typeof labelPositions[0]>();
    for (const lp of labelPositions) {
      const prev = bestLabels.get(lp.key);
      if (!prev || lp.area > prev.area) bestLabels.set(lp.key, lp);
    }

    // Draw labels on the largest region of each pattern
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const [key, lp] of bestLabels) {
      const labelW = ctx.measureText(key).width + 4;
      if (lp.area * cellW > labelW) {
        ctx.font = "bold 9px monospace";
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillText(key, lp.cx + 0.5, lp.cy + 0.5);
        ctx.fillStyle = "#eee";
        ctx.fillText(key, lp.cx, lp.cy);
      }
    }

    // Axes
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(marginL, marginT + plotH);
    ctx.lineTo(marginL + plotW, marginT + plotH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(marginL, marginT);
    ctx.lineTo(marginL, marginT + plotH);
    ctx.stroke();

    // X-axis labels
    ctx.fillStyle = "#888";
    ctx.font = "10px monospace";
    ctx.textAlign = "left";
    ctx.fillText("0", marginL, marginT + plotH + 14);
    ctx.textAlign = "right";
    const halfLabel = mode === "edo" ? `${Math.round(halfP)} steps` : `${Math.round(halfP)}\u00A2`;
    ctx.fillText(halfLabel, marginL + plotW, marginT + plotH + 14);
    ctx.textAlign = "center";
    ctx.fillText("generator size \u2192", marginL + plotW / 2, marginT + plotH + 24);

    // Y-axis labels
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let n = minNotes; n <= maxNotes; n++) {
      const yi = n - minNotes;
      const sy = marginT + (ySteps - 1 - yi) * cellH + cellH / 2;
      ctx.fillStyle = n === numNotes ? "#cc4444" : "#555";
      ctx.font = n === numNotes ? "bold 10px monospace" : "10px monospace";
      ctx.fillText(`${n}`, marginL - 4, sy);
    }
    // Y-axis title
    ctx.save();
    ctx.translate(8, marginT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillStyle = "#888";
    ctx.font = "10px monospace";
    ctx.fillText("notes", 0, 0);
    ctx.restore();

    // Crosshair at current generator position
    const genClamped = Math.min(generator, halfP);
    const crossX = marginL + (genClamped / halfP) * plotW;
    ctx.strokeStyle = "#cc4444";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(crossX, marginT);
    ctx.lineTo(crossX, marginT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Horizontal crosshair at current numNotes
    if (numNotes >= minNotes && numNotes <= maxNotes) {
      const noteY = marginT + (ySteps - 1 - (numNotes - minNotes)) * cellH + cellH / 2;
      ctx.strokeStyle = "#cc4444";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(marginL, noteY);
      ctx.lineTo(marginL + plotW, noteY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Crosshair intersection dot
    if (numNotes >= minNotes && numNotes <= maxNotes) {
      const noteY = marginT + (ySteps - 1 - (numNotes - minNotes)) * cellH + cellH / 2;
      ctx.beginPath();
      ctx.arc(crossX, noteY, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#cc4444";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [generator, period, numNotes, mode]);

  useEffect(() => {
    draw();
    const obs = new ResizeObserver(() => draw());
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [draw]);

  // Hover handler: map mouse position to generator/notes and compute MOS info
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const cvs = canvasRef.current;
    const lay = layoutRef.current;
    if (!cvs || !lay) return;

    const rect = cvs.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Check if within plot area
    if (mx < lay.marginL || mx > lay.marginL + lay.plotW ||
        my < lay.marginT || my > lay.marginT + lay.plotH) {
      setHoverInfo(null);
      return;
    }

    const xFrac = (mx - lay.marginL) / lay.plotW;
    const yFrac = (my - lay.marginT) / lay.plotH;
    const yi = Math.floor((1 - yFrac) * lay.ySteps);
    const notes = STAIRCASE_MIN_NOTES + Math.max(0, Math.min(yi, lay.ySteps - 1));

    const gx = mode === "edo"
      ? Math.round(xFrac * lay.halfP)
      : xFrac * lay.halfP;

    if (gx < 0.01) { setHoverInfo(null); return; }

    const info = computeScale(gx, period, notes);
    setHoverInfo({
      x: e.clientX, y: e.clientY,
      gen: gx, notes,
      mosKey: info.isMOS && info.uniqueSteps.length === 2 ? info.mosKey : "",
      mosName: info.mosName,
      pattern: info.pattern,
      L: info.L, s: info.s,
    });
  }, [mode, period]);

  const handleMouseLeave = useCallback(() => setHoverInfo(null), []);

  // Build legend from collected patterns
  const legendEntries = useMemo(() => {
    return Array.from(legendRef.current.entries()).sort((a, b) => {
      const [aL, aS] = [a[1].Lcount, a[1].scount];
      const [bL, bS] = [b[1].Lcount, b[1].scount];
      return (aL + aS) - (bL + bS);
    });
  }, [generator, period, numNotes, mode]); // re-derive when diagram redraws

  return (
    <div ref={containerRef} className="w-full relative">
      <canvas ref={canvasRef} className="rounded border border-[#222] block"
        onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} />

      {/* Hover tooltip */}
      {hoverInfo && (
        <div style={{
          position: "fixed", left: hoverInfo.x + 12, top: hoverInfo.y - 10,
          background: "#1a1a1a", border: "1px solid #444", borderRadius: 5,
          padding: "5px 8px", zIndex: 100, pointerEvents: "none",
          fontSize: 11, color: "#ccc", whiteSpace: "nowrap",
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {mode === "edo" ? `gen=${hoverInfo.gen} steps` : `gen=${hoverInfo.gen.toFixed(1)}\u00A2`}, {hoverInfo.notes} notes
          </div>
          {hoverInfo.mosKey ? (
            <>
              <div style={{ color: "#aac" }}>
                {hoverInfo.mosKey}{hoverInfo.mosName ? ` \u2014 ${hoverInfo.mosName}` : ""}
              </div>
              <div style={{ color: "#888", fontSize: 10 }}>
                L={mode === "edo" ? hoverInfo.L : hoverInfo.L.toFixed(1)}, s={mode === "edo" ? hoverInfo.s : hoverInfo.s.toFixed(1)} &middot; {hoverInfo.pattern}
              </div>
            </>
          ) : (
            <div style={{ color: "#666", fontStyle: "italic" }}>Not a MOS</div>
          )}
        </div>
      )}

      {/* Legend */}
      {legendEntries.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 px-1">
          {legendEntries.slice(0, 12).map(([key, { Lcount, scount, name }]) => (
            <div key={key} className="flex items-center gap-1 text-[10px] text-[#888]">
              <span style={{
                display: "inline-block", width: 8, height: 8, borderRadius: 2,
                background: mosColor(Lcount, scount, 1),
              }} />
              <span>{key}{name ? ` (${name})` : ""}</span>
            </div>
          ))}
          {legendEntries.length > 12 && (
            <span className="text-[10px] text-[#555]">+{legendEntries.length - 12} more</span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------
export default function MOSGeneratorPanel() {
  const [mode, setMode] = useLS<"free" | "edo">("mos_mode", "edo");
  const [freeGen, setFreeGen] = useLS("mos_freeGen", 700);
  const [freePeriod, setFreePeriod] = useLS("mos_freePeriod", 1200);
  const [numNotes, setNumNotes] = useLS("mos_numNotes", 7);
  const [selectedEdo, setSelectedEdo] = useLS("mos_edo", 12);
  const [selectedMosIdx, setSelectedMosIdx] = useLS("mos_mosIdx", 0);
  const [edoGenSteps, setEdoGenSteps] = useLS<number | null>("mos_edoGenSteps", null);

  const edoList = useMemo(() => Array.from({ length: 95 }, (_, i) => i + 5), []);

  const edoData: EDOData | undefined = useMemo(() => EDO_DATA.get(selectedEdo), [selectedEdo]);

  // The effective generator steps in EDO mode (fall back to fifth if null)
  const effectiveEdoGen = useMemo(() => {
    if (!edoData) return 7;
    return edoGenSteps ?? edoData.ring.fifthSteps;
  }, [edoData, edoGenSteps]);

  // Effective generator/period based on mode
  const { generator, period } = useMemo(() => {
    if (mode === "free") return { generator: freeGen, period: freePeriod };
    if (!edoData) return { generator: 7, period: 12 };
    return { generator: effectiveEdoGen, period: selectedEdo };
  }, [mode, freeGen, freePeriod, edoData, effectiveEdoGen, selectedEdo]);

  // numNotes is always used directly now (MOS preset buttons set it via setNumNotes)
  const effectiveNotes = numNotes;

  const scale = useMemo(
    () => computeScale(generator, period, effectiveNotes),
    [generator, period, effectiveNotes],
  );

  // Display values in cents for EDO mode
  const genCents = mode === "edo" && edoData
    ? +(generator * edoData.stepCents).toFixed(2) : generator;
  const perCents = mode === "edo" ? 1200 : period;

  return (
    <div className="flex flex-col gap-3 p-4 bg-[#0d0d0d] text-[#ccc] rounded-lg border border-[#222] text-sm">
      {/* ── Description ── */}
      <details className="text-xs text-[#888] leading-relaxed">
        <summary className="cursor-pointer text-[#666] uppercase tracking-wider text-[10px] mb-1 select-none">
          MOS Generator
        </summary>
        <div className="mt-1 space-y-1 text-[11px]">
          <p>
            A <span className="text-[#aac]">Moment of Symmetry</span> scale has exactly two step sizes (Large and small).
            Stack a generator interval repeatedly around the octave circle.
          </p>
          <p>
            <span className="text-[#aac]">CIRCLE:</span> Points show where each stacked generator lands.
            Colored arcs show Large (bright) and small (dim) steps.
          </p>
          <p>
            <span className="text-[#aac]">STAIRCASE:</span> Colored regions show where MOS scales occur as you
            sweep the generator size. Each color is a different scale pattern.
            The ratio L/s near &#966; (1.618) = "maximally even" distribution.
          </p>
        </div>
      </details>

      {/* ── Controls ── */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[#888]">
          Mode
          <select value={mode} onChange={e => setMode(e.target.value as "free" | "edo")}
            className="bg-[#181818] border border-[#333] rounded px-2 py-1 text-[#ccc] text-xs">
            <option value="free">Free Generator</option>
            <option value="edo">EDO-based</option>
          </select>
        </label>

        {mode === "free" && (
          <>
            <label className="flex items-center gap-1.5 text-[#888]">
              Gen
              <input type="range" min={0} max={freePeriod} step={0.5} value={freeGen}
                onChange={e => setFreeGen(+e.target.value)}
                className="w-32 accent-[#8888dd]" />
              <span className="text-[#aaa] w-16 text-right tabular-nums">{freeGen.toFixed(1)}&cent;</span>
            </label>
            <label className="flex items-center gap-1.5 text-[#888]">
              Period
              <input type="number" min={100} max={2400} step={1} value={freePeriod}
                onChange={e => setFreePeriod(+e.target.value)}
                className="bg-[#181818] border border-[#333] rounded px-2 py-1 w-20 text-[#ccc] text-xs" />
            </label>
            <label className="flex items-center gap-1.5 text-[#888]">
              Notes
              <input type="range" min={2} max={30} value={numNotes}
                onChange={e => setNumNotes(+e.target.value)}
                className="w-20 accent-[#8888dd]" />
              <span className="text-[#aaa] w-6 text-right">{numNotes}</span>
            </label>
          </>
        )}

        {mode === "edo" && (
          <>
            <label className="flex items-center gap-1.5 text-[#888]">
              EDO
              <select value={selectedEdo} onChange={e => { setSelectedEdo(+e.target.value); setSelectedMosIdx(0); setEdoGenSteps(null); }}
                className="bg-[#181818] border border-[#333] rounded px-2 py-1 text-[#ccc] text-xs">
                {edoList.map(n => <option key={n} value={n}>{n}-EDO</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[#888]">
              Gen
              <input type="range" min={1} max={Math.floor(selectedEdo / 2)} step={1}
                value={effectiveEdoGen}
                onChange={e => setEdoGenSteps(+e.target.value)}
                className="w-28 accent-[#8888dd]" />
              <select value={effectiveEdoGen}
                onChange={e => setEdoGenSteps(+e.target.value)}
                className="bg-[#181818] border border-[#333] rounded px-1 py-0.5 text-[#ccc] text-xs max-w-[180px]">
                {Array.from({ length: Math.floor(selectedEdo / 2) }, (_, i) => i + 1).map(step => {
                  const cents = edoData ? +(step * edoData.stepCents).toFixed(1) : 0;
                  const isFifth = edoData != null && step === edoData.ring.fifthSteps;
                  const labels: string[] = [];
                  if (isFifth) labels.push("= fifth");
                  if (edoData) {
                    if (Math.abs(cents - 386.3) <= edoData.stepCents / 2) labels.push("\u2248 M3");
                    if (Math.abs(cents - 315.6) <= edoData.stepCents / 2) labels.push("\u2248 m3");
                    if (Math.abs(cents - 498) <= edoData.stepCents / 2 && !isFifth)
                      labels.push("\u2248 P4");
                  }
                  const tag = labels.length > 0 ? `  (${labels.join(", ")})` : "";
                  return (
                    <option key={step} value={step}>
                      {step} step{step > 1 ? "s" : ""} ({cents}&cent;){tag}
                    </option>
                  );
                })}
              </select>
            </label>
            {edoData && effectiveEdoGen !== edoData.ring.fifthSteps && (
              <button
                onClick={() => setEdoGenSteps(null)}
                className="px-2 py-0.5 rounded text-[10px] border border-[#cc8844] text-[#cc8844] bg-[#cc884410] hover:bg-[#cc884422] transition-colors"
              >
                {"\u2192"} Fifth ({edoData.ring.fifthSteps} steps, {edoData.ring.fifthCents}{"\u00A2"})
              </button>
            )}
            <label className="flex items-center gap-1.5 text-[#888]">
              Notes
              <input type="range" min={2} max={30} value={effectiveNotes}
                onChange={e => setNumNotes(+e.target.value)}
                className="w-20 accent-[#8888dd]" />
              <span className="text-[#aaa] w-6 text-right">{effectiveNotes}</span>
            </label>
          </>
        )}
      </div>

      {/* ── MOS pattern selector (EDO mode) ── */}
      {mode === "edo" && edoData && edoData.mosPatterns.length > 0 && (
        <div>
          <div className="text-[#666] text-[10px] uppercase tracking-wider mb-1">Fifth-based MOS presets</div>
          <div className="flex flex-wrap gap-1.5">
            {edoData.mosPatterns.map((mos, i) => {
              const key = `${mos.L}L${mos.s}s`;
              const name = MOS_NAMES[key];
              const isActive = i === selectedMosIdx && effectiveEdoGen === edoData.ring.fifthSteps;
              return (
                <button key={i}
                  onClick={() => { setSelectedMosIdx(i); setEdoGenSteps(null); setNumNotes(mos.L + mos.s); }}
                  className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                    isActive
                      ? "bg-[#8888dd22] border-[#8888dd] text-[#aac]"
                      : "bg-[#111] border-[#333] text-[#888] hover:border-[#555]"
                  }`}>
                  {key}{name ? ` (${name})` : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Main content grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-3">
        {/* Left column: circle + staircase */}
        <div className="flex flex-col gap-3">
          <div className="bg-[#111] rounded border border-[#222] p-2 flex justify-center">
            <GeneratorCircle scale={scale} generator={generator} period={period} numNotes={effectiveNotes} />
          </div>
          <div className="bg-[#111] rounded border border-[#222] p-2">
            <div className="text-[#666] text-[10px] mb-1 uppercase tracking-wider">Staircase / MOS Regions</div>
            <StaircaseDiagram generator={generator} period={period} numNotes={effectiveNotes} mode={mode} />
          </div>
        </div>

        {/* Right column: scale info */}
        <div className="bg-[#111] rounded border border-[#222] p-3 flex flex-col gap-2">
          <div className="text-[#666] text-[10px] uppercase tracking-wider">Scale Info</div>

          {scale.isMOS ? (
            <>
              <Row label="MOS" value={scale.mosKey + (scale.mosName ? ` — ${scale.mosName}` : "")} />
              <Row label="Step sizes"
                value={mode === "edo"
                  ? `L=${scale.L} steps (${(scale.L * (edoData?.stepCents ?? 0)).toFixed(1)}¢), s=${scale.s} steps (${(scale.s * (edoData?.stepCents ?? 0)).toFixed(1)}¢)`
                  : `L=${scale.L.toFixed(1)}¢, s=${scale.s.toFixed(1)}¢`
                } />
              <Row label="Pattern" value={scale.pattern} mono />
              <Row label="L/s ratio" value={
                scale.ratio === Infinity ? "equal (1-size)" : scale.ratio.toFixed(4) +
                  (Math.abs(scale.ratio - 1.618) < 0.05 ? "  (near golden)" : "")
              } />
              <Row label="Proper" value={scale.proper ? "Yes" : "No"} />
              <Row label="Brightness"
                value={scale.ratio > 2 ? "Very bright" : scale.ratio > 1.5 ? "Bright" : scale.ratio > 1 ? "Neutral-bright" : "Dark"} />
            </>
          ) : (
            <div className="text-[#666] italic text-xs py-2">
              Not a MOS scale ({scale.uniqueSteps.length} distinct step sizes).
              Adjust generator to find a MOS.
            </div>
          )}

          {/* Interval table */}
          <div className="text-[#666] text-[10px] uppercase tracking-wider mt-2">Intervals</div>
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-xs text-[#aaa]">
              <thead>
                <tr className="text-[#666] border-b border-[#222]">
                  <th className="text-left py-0.5 pr-2">Deg</th>
                  <th className="text-right py-0.5 pr-2">{mode === "edo" ? "Steps" : "Cents"}</th>
                  {mode === "edo" && <th className="text-right py-0.5">Cents</th>}
                </tr>
              </thead>
              <tbody>
                {scale.sorted.map((pos, i) => (
                  <tr key={i} className="border-b border-[#1a1a1a]">
                    <td className="py-0.5 pr-2">{i}</td>
                    <td className="text-right py-0.5 pr-2 tabular-nums">
                      {mode === "edo" ? pos : pos.toFixed(1)}
                    </td>
                    {mode === "edo" && edoData && (
                      <td className="text-right py-0.5 tabular-nums text-[#666]">
                        {(pos * edoData.stepCents).toFixed(1)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny row component
// ---------------------------------------------------------------------------
function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[#666] shrink-0">{label}</span>
      <span className={`text-[#aaa] text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
