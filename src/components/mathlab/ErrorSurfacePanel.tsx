import { useRef, useEffect, useMemo, useCallback, useState } from "react";
import { useLS } from "@/lib/storage";
import { EDO_DATA, type EDOData, type HarmonicError } from "@/lib/edoTemperamentData";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type ErrorMode = "abs" | "rel";
type NormMode = "max" | "sum";

const ALL_PRIMES = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31] as const;
const DEFAULT_PRIMES = new Set<number>([3, 5, 7, 11, 13]);

const PAD = { top: 28, right: 16, bottom: 24, left: 44 };
const BAR_PAD = { top: 20, right: 16, bottom: 28, left: 44 };
const BAR_H = 160;

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

/** Map an error value [0..cap] to an HSL colour string. 0 = green, cap = red */
function errColor(val: number, cap: number): string {
  const t = Math.min(Math.abs(val) / cap, 1);
  // green(140) -> yellow(60) -> red(0)
  const hue = 140 - t * 140;
  const sat = 70 + t * 20;
  const lum = 45 - t * 10;
  return `hsl(${hue},${sat}%,${lum}%)`;
}

function errColorBar(val: number, cap: number): string {
  const t = Math.min(Math.abs(val) / cap, 1);
  const hue = 140 - t * 140;
  return `hsl(${hue},80%,50%)`;
}

// ---------------------------------------------------------------------------
// Pareto front
// ---------------------------------------------------------------------------

function computePareto(
  edos: number[],
  primes: number[],
  mode: ErrorMode,
): Set<number> {
  const errs = edos.map(edo => {
    const d = EDO_DATA.get(edo)!;
    return primes.map(p => {
      const h = d.harmonics[p];
      return h ? Math.abs(mode === "abs" ? h.abs : h.rel) : 999;
    });
  });
  const pareto = new Set<number>();
  for (let i = 0; i < edos.length; i++) {
    let dominated = false;
    for (let j = 0; j < edos.length; j++) {
      if (i === j) continue;
      const allLeq = errs[j].every((v, k) => v <= errs[i][k]);
      const someLt = errs[j].some((v, k) => v < errs[i][k]);
      if (allLeq && someLt) { dominated = true; break; }
    }
    if (!dominated) pareto.add(edos[i]);
  }
  return pareto;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ErrorSurfacePanel() {
  // -- persisted state --
  const [selPrimes, setSelPrimes] = useLS<number[]>("lt_esp_primes", [...DEFAULT_PRIMES]);
  const [errorMode, setErrorMode] = useLS<ErrorMode>("lt_esp_errmode", "abs");
  const [norm, setNorm] = useLS<NormMode>("lt_esp_norm", "max");
  const [edoMin, setEdoMin] = useLS("lt_esp_edomin", 5);
  const [edoMax, setEdoMax] = useLS("lt_esp_edomax", 99);
  const [showLabels, setShowLabels] = useLS("lt_esp_labels", true);

  // -- local state --
  const [selEdo, setSelEdo] = useState<number | null>(null);
  const [hoverEdo, setHoverEdo] = useState<number | null>(null);
  const [hoverPrime, setHoverPrime] = useState<number | null>(null);

  const heatRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const primeSet = useMemo(() => new Set(selPrimes), [selPrimes]);
  const activePrimes = useMemo(
    () => ALL_PRIMES.filter(p => primeSet.has(p)),
    [primeSet],
  );

  const edos = useMemo(() => {
    const lo = Math.max(5, Math.min(edoMin, 98));
    const hi = Math.min(99, Math.max(lo + 1, edoMax));
    return Array.from({ length: hi - lo + 1 }, (_, i) => i + lo);
  }, [edoMin, edoMax]);

  const cap = errorMode === "abs" ? 50 : 50; // 50 cents or 50%

  // -- composite error per EDO --
  const composite = useMemo(() => {
    return edos.map(edo => {
      const d = EDO_DATA.get(edo)!;
      const vals = activePrimes.map(p => {
        const h = d.harmonics[p];
        return h ? Math.abs(errorMode === "abs" ? h.abs : h.rel) : 0;
      });
      return norm === "max" ? Math.max(...vals, 0) : vals.reduce((a, b) => a + b, 0);
    });
  }, [edos, activePrimes, errorMode, norm]);

  const pareto = useMemo(
    () => computePareto(edos, activePrimes, errorMode),
    [edos, activePrimes, errorMode],
  );

  // -- toggle prime --
  const togglePrime = useCallback((p: number) => {
    setSelPrimes(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p].sort((a, b) => a - b),
    );
  }, [setSelPrimes]);

  // -- draw heatmap --
  useEffect(() => {
    const canvas = heatRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rows = activePrimes.length;
    const cols = edos.length;
    if (!rows || !cols) return;

    const cellW = Math.max(12, Math.min(36, (canvas.parentElement!.clientWidth - PAD.left - PAD.right) / cols));
    const cellH = Math.max(20, Math.min(36, 300 / rows));
    const w = PAD.left + cols * cellW + PAD.right;
    const h = PAD.top + rows * cellH + PAD.bottom;

    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // cells
    for (let r = 0; r < rows; r++) {
      const prime = activePrimes[r];
      for (let c = 0; c < cols; c++) {
        const edo = edos[c];
        const d = EDO_DATA.get(edo)!;
        const he = d.harmonics[prime];
        const val = he ? (errorMode === "abs" ? Math.abs(he.abs) : Math.abs(he.rel)) : 0;
        const x = PAD.left + c * cellW;
        const y = PAD.top + r * cellH;

        ctx.fillStyle = errColor(val, cap);
        ctx.fillRect(x, y, cellW - 1, cellH - 1);

        // highlight on hover / selection
        if (edo === hoverEdo || edo === selEdo) {
          ctx.strokeStyle = edo === selEdo ? "#fff" : "rgba(255,255,255,0.4)";
          ctx.lineWidth = edo === selEdo ? 2 : 1;
          ctx.strokeRect(x, y, cellW - 1, cellH - 1);
        }
        if (prime === hoverPrime) {
          ctx.strokeStyle = "rgba(255,255,255,0.25)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, cellW - 1, cellH - 1);
        }

        // labels
        if (showLabels && cellW >= 24) {
          const label = errorMode === "abs"
            ? (he ? he.abs.toFixed(1) : "-")
            : (he ? he.rel.toFixed(0) : "-");
          ctx.fillStyle = val > cap * 0.6 ? "#fff" : "#ccc";
          ctx.font = `${Math.min(10, cellW * 0.35)}px monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, x + cellW / 2, y + cellH / 2);
        }
      }
    }

    // Y-axis: prime labels
    ctx.fillStyle = "#888";
    ctx.font = "11px monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let r = 0; r < rows; r++) {
      ctx.fillText(String(activePrimes[r]), PAD.left - 6, PAD.top + r * cellH + cellH / 2);
    }

    // X-axis: EDO labels (every Nth)
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const step = cellW < 18 ? Math.ceil(18 / cellW) : 1;
    for (let c = 0; c < cols; c += step) {
      ctx.fillText(String(edos[c]), PAD.left + c * cellW + cellW / 2, PAD.top + rows * cellH + 4);
    }
  }, [edos, activePrimes, errorMode, cap, showLabels, hoverEdo, hoverPrime, selEdo]);

  // -- draw bar chart --
  useEffect(() => {
    const canvas = barRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cols = edos.length;
    if (!cols) return;

    const cellW = Math.max(12, Math.min(36, (canvas.parentElement!.clientWidth - BAR_PAD.left - BAR_PAD.right) / cols));
    const w = BAR_PAD.left + cols * cellW + BAR_PAD.right;
    const h = BAR_H;

    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const maxVal = Math.max(...composite, 1);
    const barArea = h - BAR_PAD.top - BAR_PAD.bottom;

    for (let c = 0; c < cols; c++) {
      const edo = edos[c];
      const val = composite[c];
      const barH = (val / maxVal) * barArea;
      const x = BAR_PAD.left + c * cellW;
      const y = BAR_PAD.top + barArea - barH;

      ctx.fillStyle = errColorBar(val, maxVal * 0.8);
      if (edo === selEdo) ctx.fillStyle = "#7df";
      ctx.fillRect(x + 1, y, cellW - 3, barH);

      // Pareto star
      if (pareto.has(edo)) {
        ctx.fillStyle = "#ff0";
        ctx.font = `${Math.min(14, cellW * 0.6)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("\u2605", x + cellW / 2, y - 2);
      }
    }

    // X-axis labels
    ctx.fillStyle = "#666";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const step = cellW < 18 ? Math.ceil(18 / cellW) : 1;
    for (let c = 0; c < cols; c += step) {
      ctx.fillText(String(edos[c]), BAR_PAD.left + c * cellW + cellW / 2, h - BAR_PAD.bottom + 4);
    }

    // Y-axis
    ctx.fillStyle = "#555";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText("0", BAR_PAD.left - 4, BAR_PAD.top + barArea);
    ctx.fillText(maxVal.toFixed(1), BAR_PAD.left - 4, BAR_PAD.top);
  }, [edos, composite, pareto, selEdo]);

  // -- mouse interaction for heatmap --
  const onHeatMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = heatRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const rows = activePrimes.length;
    const cols = edos.length;
    const cellW = (canvas.clientWidth - PAD.left - PAD.right) / cols;
    const cellH = (canvas.clientHeight - PAD.top - PAD.bottom) / rows;
    const col = Math.floor((x - PAD.left) / cellW);
    const row = Math.floor((y - PAD.top) / cellH);
    setHoverEdo(col >= 0 && col < cols ? edos[col] : null);
    setHoverPrime(row >= 0 && row < rows ? activePrimes[row] : null);
  }, [edos, activePrimes]);

  const onHeatClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = heatRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const cols = edos.length;
    const cellW = (canvas.clientWidth - PAD.left - PAD.right) / cols;
    const col = Math.floor((x - PAD.left) / cellW);
    if (col >= 0 && col < cols) setSelEdo(edos[col]);
  }, [edos]);

  const onBarClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = barRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const cols = edos.length;
    const cellW = (canvas.clientWidth - BAR_PAD.left - BAR_PAD.right) / cols;
    const col = Math.floor((x - BAR_PAD.left) / cellW);
    if (col >= 0 && col < cols) setSelEdo(edos[col]);
  }, [edos]);

  // -- selected EDO detail --
  const detail = useMemo(() => {
    if (selEdo == null) return null;
    return EDO_DATA.get(selEdo) ?? null;
  }, [selEdo]);

  // -- btn style helper --
  const btn = (active: boolean) =>
    `px-2 py-0.5 rounded text-xs font-mono cursor-pointer transition-colors ${
      active ? "bg-white/15 text-[#ccc]" : "bg-transparent text-[#666] hover:text-[#999]"
    }`;

  return (
    <div ref={wrapRef} className="flex flex-col gap-3 bg-[#0d0d0d] p-3 rounded-lg border border-[#222] text-[#aaa] text-sm select-none">
      {/* ── Controls ── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[#222] pb-2">
        <span className="text-[#666] text-xs uppercase tracking-wider mr-1">Primes</span>
        {ALL_PRIMES.map(p => (
          <label key={p} className="flex items-center gap-1 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={primeSet.has(p)}
              onChange={() => togglePrime(p)}
              className="accent-emerald-500"
            />
            <span className={primeSet.has(p) ? "text-[#ccc]" : "text-[#555]"}>{p}</span>
          </label>
        ))}

        <span className="border-l border-[#333] h-4 mx-1" />

        <span className="text-[#666] text-xs">Error</span>
        <button className={btn(errorMode === "abs")} onClick={() => setErrorMode("abs")}>Abs ¢</button>
        <button className={btn(errorMode === "rel")} onClick={() => setErrorMode("rel")}>Rel %</button>

        <span className="border-l border-[#333] h-4 mx-1" />

        <span className="text-[#666] text-xs">Norm</span>
        <button className={btn(norm === "max")} onClick={() => setNorm("max")}>Max</button>
        <button className={btn(norm === "sum")} onClick={() => setNorm("sum")}>Sum</button>

        <span className="border-l border-[#333] h-4 mx-1" />

        <span className="text-[#666] text-xs">EDO</span>
        <input
          type="number" min={5} max={98} value={edoMin}
          onChange={e => setEdoMin(Math.max(5, +e.target.value))}
          className="w-12 bg-[#111] border border-[#333] rounded px-1 py-0.5 text-xs text-[#ccc] text-center"
        />
        <span className="text-[#555]">-</span>
        <input
          type="number" min={6} max={99} value={edoMax}
          onChange={e => setEdoMax(Math.min(99, +e.target.value))}
          className="w-12 bg-[#111] border border-[#333] rounded px-1 py-0.5 text-xs text-[#ccc] text-center"
        />

        <span className="border-l border-[#333] h-4 mx-1" />

        <label className="flex items-center gap-1 cursor-pointer text-xs text-[#666]">
          <input type="checkbox" checked={showLabels} onChange={() => setShowLabels(!showLabels)} className="accent-emerald-500" />
          Labels
        </label>
      </div>

      {/* ── Heatmap ── */}
      <div className="overflow-x-auto">
        <canvas
          ref={heatRef}
          onMouseMove={onHeatMove}
          onMouseLeave={() => { setHoverEdo(null); setHoverPrime(null); }}
          onClick={onHeatClick}
          className="cursor-crosshair"
        />
      </div>

      {/* ── Bar chart ── */}
      <div className="overflow-x-auto border-t border-[#222] pt-2">
        <div className="text-[#555] text-[10px] uppercase tracking-wider mb-1">
          Composite error ({norm}) &mdash; <span className="text-yellow-400">{"\u2605"}</span> = Pareto-optimal
        </div>
        <canvas ref={barRef} onClick={onBarClick} className="cursor-pointer" />
      </div>

      {/* ── Detail panel ── */}
      {detail && (
        <div className="border-t border-[#222] pt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs">
          <div className="col-span-full text-[#ccc] font-mono text-sm mb-1">
            {detail.edo}-EDO
            <span className="text-[#666] ml-2">({detail.stepCents.toFixed(2)}¢/step)</span>
            {pareto.has(detail.edo) && <span className="text-yellow-400 ml-2">{"\u2605"} Pareto</span>}
          </div>

          <div>
            <span className="text-[#555]">Good subgroup: </span>
            <span className="text-[#aaa]">{detail.goodSubgroup.join(".")}</span>
          </div>
          <div>
            <span className="text-[#555]">Consistency: </span>
            <span className="text-[#aaa]">{detail.consistencyLimit ?? "none"}-odd</span>
          </div>
          <div>
            <span className="text-[#555]">Ring: </span>
            <span className="text-[#aaa]">{detail.ring.type === "single" ? "single" : `${detail.ring.count} rings`}</span>
          </div>

          {detail.temperaments.length > 0 && (
            <div className="col-span-full">
              <span className="text-[#555]">Temperaments: </span>
              <span className="text-[#aaa]">{detail.temperaments.join(", ")}</span>
            </div>
          )}
          {detail.commasTempered.length > 0 && (
            <div className="col-span-full">
              <span className="text-[#555]">Commas: </span>
              <span className="text-[#aaa]">
                {detail.commasTempered.slice(0, 8).map(c => c.name).join(", ")}
                {detail.commasTempered.length > 8 && ` +${detail.commasTempered.length - 8} more`}
              </span>
            </div>
          )}
          {detail.mosPatterns.length > 0 && (
            <div className="col-span-full">
              <span className="text-[#555]">MOS: </span>
              <span className="text-[#aaa]">
                {detail.mosPatterns.slice(0, 6).map(m => `${m.L}L${m.s}s`).join(", ")}
              </span>
            </div>
          )}

          {/* Per-prime error table */}
          <div className="col-span-full mt-1 overflow-x-auto">
            <table className="text-[10px] font-mono">
              <thead>
                <tr className="text-[#555]">
                  <td className="pr-2">Prime</td>
                  {activePrimes.map(p => <td key={p} className="px-1.5 text-center">{p}</td>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="pr-2 text-[#555]">¢ err</td>
                  {activePrimes.map(p => {
                    const h = detail.harmonics[p];
                    return (
                      <td key={p} className="px-1.5 text-center" style={{ color: h ? errColorBar(Math.abs(h.abs), 50) : "#333" }}>
                        {h ? h.abs.toFixed(1) : "-"}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="pr-2 text-[#555]">% err</td>
                  {activePrimes.map(p => {
                    const h = detail.harmonics[p];
                    return (
                      <td key={p} className="px-1.5 text-center" style={{ color: h ? errColorBar(Math.abs(h.rel), 50) : "#333" }}>
                        {h ? h.rel.toFixed(1) : "-"}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="pr-2 text-[#555]">Steps</td>
                  {activePrimes.map(p => {
                    const h = detail.harmonics[p];
                    return <td key={p} className="px-1.5 text-center text-[#777]">{h ? h.steps : "-"}</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
