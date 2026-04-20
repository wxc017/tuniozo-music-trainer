import { useRef, useEffect, useMemo, useCallback, useState } from "react";
import { useLS } from "@/lib/storage";
import {
  roughnessCurve,
  harmonicEntropyCurve,
  defaultSpectrum,
  ratioToCents,
  centsToRatio,
  tenneyHeight,
  CONSONANCE_LANDMARKS,
  type RoughnessDatum,
  type EntropyCurveDatum,
} from "@/lib/consonanceEngine";
import { audioEngine } from "@/lib/audioEngine";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type SpectrumType = "natural" | "saw" | "square" | "sine";
type XAxisMode = "cents" | "ratio";

const CANVAS_H = 400;
const PAD = { top: 24, right: 56, bottom: 36, left: 56 };

const SPECTRUM_OPTS: SpectrumType[] = ["natural", "saw", "square", "sine"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findMinima(data: RoughnessDatum[]): RoughnessDatum[] {
  const out: RoughnessDatum[] = [];
  for (let i = 1; i < data.length - 1; i++) {
    if (data[i].roughness < data[i - 1].roughness && data[i].roughness < data[i + 1].roughness) {
      out.push(data[i]);
    }
  }
  return out;
}

function closestLandmark(cents: number): { ratio: number; name: string } {
  let best: { ratio: number; name: string } = CONSONANCE_LANDMARKS[0];
  let bestDist = Infinity;
  for (const lm of CONSONANCE_LANDMARKS) {
    const d = Math.abs(ratioToCents(lm.ratio) - cents);
    if (d < bestDist) { bestDist = d; best = lm; }
  }
  return best;
}

function lerp(data: { cents: number; value: number }[], cents: number): number {
  if (data.length === 0) return 0;
  if (cents <= data[0].cents) return data[0].value;
  if (cents >= data[data.length - 1].cents) return data[data.length - 1].value;
  for (let i = 0; i < data.length - 1; i++) {
    if (cents >= data[i].cents && cents <= data[i + 1].cents) {
      const t = (cents - data[i].cents) / (data[i + 1].cents - data[i].cents);
      return data[i].value + t * (data[i + 1].value - data[i].value);
    }
  }
  return 0;
}

function nearestSimpleRatio(ratio: number, maxD = 16): { n: number; d: number } {
  let bestN = 1, bestD = 1, bestErr = Infinity;
  for (let d = 1; d <= maxD; d++) {
    const n = Math.round(ratio * d);
    if (n < 1) continue;
    const err = Math.abs(n / d - ratio);
    if (err < bestErr) { bestErr = err; bestN = n; bestD = d; }
  }
  return { n: bestN, d: bestD };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConsonancePanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const lastDroneTime = useRef(0);

  // Persisted state
  const [spectrum, setSpectrum] = useLS<SpectrumType>("lt_cons_spectrum", "natural");
  const [baseFreq, setBaseFreq] = useLS<number>("lt_cons_baseFreq", 261.63);
  const [showRoughness, setShowRoughness] = useLS("lt_cons_showR", true);
  const [showEntropy, setShowEntropy] = useLS("lt_cons_showE", true);
  const [showLandmarks, setShowLandmarks] = useLS("lt_cons_showL", true);
  const [xMode, setXMode] = useLS<XAxisMode>("lt_cons_xmode", "cents");

  // Transient state
  const [cursorCents, setCursorCents] = useState<number | null>(null);
  const isDragging = useRef(false);

  // ---------- Compute curves ----------
  const rData = useMemo(
    () => roughnessCurve(baseFreq, defaultSpectrum(spectrum), 1.0, 2.0, 500),
    [spectrum, baseFreq],
  );

  const eData = useMemo(
    () => harmonicEntropyCurve(0, 1200, 300),
    [],
  );

  const rMinima = useMemo(() => findMinima(rData), [rData]);

  // Normalised lookup arrays (cents -> 0..1)
  const rNorm = useMemo(() => {
    const max = Math.max(...rData.map(d => d.roughness), 1e-9);
    return rData.map(d => ({ cents: d.cents, value: d.roughness / max }));
  }, [rData]);

  const eNorm = useMemo(() => {
    const vals = eData.map(d => d.entropy);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    return eData.map(d => ({ cents: d.cents, value: (d.entropy - min) / range }));
  }, [eData]);

  // ---------- Responsive width ----------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(Math.floor(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---------- Coordinate helpers ----------
  const plotW = width - PAD.left - PAD.right;
  const plotH = CANVAS_H - PAD.top - PAD.bottom;

  const centsToX = useCallback(
    (c: number) => {
      if (xMode === "cents") return PAD.left + (c / 1200) * plotW;
      // ratio mode: log scale 1..2
      const r = centsToRatio(c);
      return PAD.left + (Math.log2(r) / 1) * plotW; // log2(2)/1 = 1
    },
    [xMode, plotW],
  );

  const xToCents = useCallback(
    (x: number) => {
      const frac = Math.max(0, Math.min(1, (x - PAD.left) / plotW));
      if (xMode === "cents") return frac * 1200;
      const ratio = Math.pow(2, frac);
      return ratioToCents(ratio);
    },
    [xMode, plotW],
  );

  // ---------- Draw ----------
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const dpr = window.devicePixelRatio || 1;
    cvs.width = width * dpr;
    cvs.height = CANVAS_H * dpr;
    cvs.style.width = `${width}px`;
    cvs.style.height = `${CANVAS_H}px`;
    const ctx = cvs.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, CANVAS_H);

    // Background
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, width, CANVAS_H);

    // Grid lines
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1;
    for (let c = 0; c <= 1200; c += 100) {
      const x = centsToX(c);
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, CANVAS_H - PAD.bottom);
      ctx.stroke();
    }

    // X-axis labels
    ctx.fillStyle = "#555";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    for (let c = 0; c <= 1200; c += 200) {
      const x = centsToX(c);
      const label = xMode === "cents" ? `${c}` : centsToRatio(c).toFixed(2);
      ctx.fillText(label, x, CANVAS_H - PAD.bottom + 14);
    }

    // Y-axis labels
    ctx.textAlign = "right";
    if (showRoughness) {
      ctx.fillStyle = "#b05030";
      ctx.fillText("Rough", PAD.left - 6, PAD.top + 10);
    }
    ctx.textAlign = "left";
    if (showEntropy) {
      ctx.fillStyle = "#3080c0";
      ctx.fillText("Entropy", width - PAD.right + 6, PAD.top + 10);
    }

    const yVal = (v: number) => PAD.top + plotH * (1 - v);

    // Roughness curve
    if (showRoughness && rNorm.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = "#e06030";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < rNorm.length; i++) {
        const x = centsToX(rNorm[i].cents);
        const y = yVal(rNorm[i].value);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Minima dots
      ctx.fillStyle = "#f0a060";
      for (const m of rMinima) {
        const maxR = Math.max(...rData.map(d => d.roughness), 1e-9);
        const x = centsToX(m.cents);
        const y = yVal(m.roughness / maxR);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Entropy curve
    if (showEntropy && eNorm.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = "#4090d0";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < eNorm.length; i++) {
        const x = centsToX(eNorm[i].cents);
        const y = yVal(eNorm[i].value);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Landmark lines
    if (showLandmarks) {
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      for (const lm of CONSONANCE_LANDMARKS) {
        const c = ratioToCents(lm.ratio);
        if (c < 0 || c > 1200) continue;
        const x = centsToX(c);
        ctx.strokeStyle = "#333";
        ctx.beginPath();
        ctx.moveTo(x, PAD.top);
        ctx.lineTo(x, CANVAS_H - PAD.bottom);
        ctx.stroke();
        ctx.fillStyle = "#666";
        ctx.save();
        ctx.translate(x, PAD.top - 4);
        ctx.rotate(-Math.PI / 4);
        ctx.fillText(lm.name.split("(")[0].trim(), 0, 0);
        ctx.restore();
      }
      ctx.setLineDash([]);
    }

    // Cursor line
    if (cursorCents !== null) {
      const x = centsToX(cursorCents);
      ctx.strokeStyle = "#aaa";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, CANVAS_H - PAD.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Dots on curves at cursor
      const rV = lerp(rNorm, cursorCents);
      const eV = lerp(eNorm, cursorCents);
      if (showRoughness) {
        ctx.fillStyle = "#e06030";
        ctx.beginPath();
        ctx.arc(x, yVal(rV), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (showEntropy) {
        ctx.fillStyle = "#4090d0";
        ctx.beginPath();
        ctx.arc(x, yVal(eV), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [
    width, rNorm, eNorm, rMinima, rData, showRoughness, showEntropy,
    showLandmarks, cursorCents, centsToX, xMode, plotW, plotH,
  ]);

  // ---------- Mouse handlers ----------
  // Throttled drone: restart at most every 100ms to avoid clicking/popping.
  const playThrottledDrone = useCallback(
    (cents: number) => {
      const now = performance.now();
      if (now - lastDroneTime.current < 100) return;
      lastDroneTime.current = now;
      const ratio = centsToRatio(cents);
      audioEngine.init().then(() => {
        audioEngine.startRatioDrone([1, ratio], 0.1, baseFreq);
      });
    },
    [baseFreq],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const c = xToCents(x);
      if (c < 0 || c > 1200) return;
      isDragging.current = true;
      setCursorCents(c);
      // Always play immediately on mousedown (reset throttle timer)
      lastDroneTime.current = 0;
      playThrottledDrone(c);
    },
    [xToCents, playThrottledDrone],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging.current) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const c = xToCents(x);
      if (c < 0 || c > 1200) return;
      setCursorCents(c);
      playThrottledDrone(c);
    },
    [xToCents, playThrottledDrone],
  );

  const stopAudio = useCallback(() => {
    isDragging.current = false;
    lastDroneTime.current = 0;
    audioEngine.stopDrone();
  }, []);

  // ---------- Info bar data ----------
  const info = useMemo(() => {
    if (cursorCents === null) return null;
    const ratio = centsToRatio(cursorCents);
    const rVal = lerp(
      rData.map(d => ({ cents: d.cents, value: d.roughness })),
      cursorCents,
    );
    const eVal = lerp(
      eData.map(d => ({ cents: d.cents, value: d.entropy })),
      cursorCents,
    );
    const lm = closestLandmark(cursorCents);
    const sr = nearestSimpleRatio(ratio);
    const th = tenneyHeight(sr.n, sr.d);
    return { ratio, cents: cursorCents, rVal, eVal, lm, sr, th };
  }, [cursorCents, rData, eData]);

  // ---------- Render ----------
  const btnCls = (active: boolean) =>
    `px-2 py-0.5 text-xs rounded border ${
      active
        ? "bg-[#222] border-[#555] text-[#ccc]"
        : "bg-[#111] border-[#333] text-[#666] hover:text-[#999]"
    }`;

  return (
    <div ref={containerRef} className="flex flex-col gap-2 bg-[#0d0d0d] p-3 rounded-lg border border-[#222] w-full">
      {/* Description */}
      <details className="text-xs text-[#888] leading-relaxed">
        <summary className="cursor-pointer text-[#aaa] font-bold tracking-wide select-none">
          CONSONANCE EXPLORER
        </summary>
        <div className="mt-1 ml-1 space-y-1 text-[#777]">
          <p>Two curves showing why some intervals sound "smooth" and others "rough."</p>
          <p>
            <span style={{ color: "#e06030" }}>ORANGE (Roughness)</span>: When two complex tones are close in frequency,
            their harmonics beat against each other — that's roughness. Valleys = consonance.
          </p>
          <p>
            <span style={{ color: "#4090d0" }}>BLUE (Entropy)</span>: How easily your ear identifies the interval as a
            simple ratio. Low entropy = clear (like a perfect fifth), high = ambiguous.
          </p>
          <p>
            Drag across the curve to hear each interval. Dashed lines mark just-intonation landmarks.
            The shape changes with different timbres — try Saw vs Sine.
          </p>
        </div>
      </details>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-[#999]">
        <span className="text-[#666]">Spectrum:</span>
        {SPECTRUM_OPTS.map(s => (
          <button key={s} className={btnCls(spectrum === s)} onClick={() => setSpectrum(s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}

        <span className="text-[#666] ml-2">Base:</span>
        <input
          type="number"
          value={baseFreq}
          step={1}
          min={50}
          max={2000}
          onChange={e => setBaseFreq(Number(e.target.value) || 261.63)}
          className="w-20 bg-[#111] border border-[#333] rounded px-1 py-0.5 text-[#ccc] text-xs"
        />
        <span className="text-[#555]">Hz</span>

        <span className="text-[#666] ml-2">Show:</span>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={showRoughness} onChange={() => setShowRoughness(v => !v)} className="accent-[#e06030]" />
          <span style={{ color: "#e06030" }}>Roughness</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={showEntropy} onChange={() => setShowEntropy(v => !v)} className="accent-[#4090d0]" />
          <span style={{ color: "#4090d0" }}>Entropy</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={showLandmarks} onChange={() => setShowLandmarks(v => !v)} />
          <span className="text-[#999]">Landmarks</span>
        </label>

        <span className="text-[#666] ml-2">X-axis:</span>
        <button className={btnCls(xMode === "cents")} onClick={() => setXMode("cents")}>Cents</button>
        <button className={btnCls(xMode === "ratio")} onClick={() => setXMode("ratio")}>Ratio</button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full cursor-crosshair rounded"
        style={{ height: CANVAS_H }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopAudio}
        onMouseLeave={stopAudio}
      />

      {/* Info bar */}
      <div className="flex flex-wrap gap-4 text-xs font-mono text-[#888] min-h-[20px]">
        {info ? (
          <>
            <span>
              Ratio: <span className="text-[#ccc]">{info.ratio.toFixed(4)}</span>
            </span>
            <span>
              Cents: <span className="text-[#ccc]">{info.cents.toFixed(1)}</span>
            </span>
            <span>
              Near: <span className="text-[#ccc]">{info.lm.name}</span>
            </span>
            <span style={{ color: "#e06030" }}>
              Rough: {info.rVal.toFixed(3)}
            </span>
            <span style={{ color: "#4090d0" }}>
              Entropy: {info.eVal.toFixed(3)}
            </span>
            <span>
              ~{info.sr.n}/{info.sr.d}{" "}
              <span className="text-[#666]">TH={info.th.toFixed(2)}</span>
            </span>
          </>
        ) : (
          <span className="text-[#555]">Click or drag on the chart to explore intervals</span>
        )}
      </div>
    </div>
  );
}
