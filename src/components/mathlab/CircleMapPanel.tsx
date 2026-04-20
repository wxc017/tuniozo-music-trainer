import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLS } from "@/lib/storage";
import { audioEngine } from "@/lib/audioEngine";
import {
  type CircleMapParams,
  type ArnoldTongueCell,
  type BifurcationPoint,
  type OrbitPoint,
  type RhythmOnset,
  iterateOrbit,
  rotationNumber,
  detectPeriod,
  bifurcationData,
  arnoldTongueGrid,
  orbitToRhythm,
  formatRotationNumber,
  RHYTHM_PRESETS,
} from "@/lib/circleMapEngine";

// ---------------------------------------------------------------------------
// Lyapunov (single point)
// ---------------------------------------------------------------------------
function lyapunovSingle(omega: number, K: number, iters = 3000): number {
  const TWO_PI = 2 * Math.PI;
  let theta = 0.1;
  for (let i = 0; i < 500; i++)
    theta = ((theta + omega - (K / TWO_PI) * Math.sin(TWO_PI * theta)) % 1 + 1) % 1;
  let sum = 0;
  const n = iters - 500;
  for (let i = 0; i < n; i++) {
    sum += Math.log(Math.max(Math.abs(1 - K * Math.cos(TWO_PI * theta)), 1e-300));
    theta = ((theta + omega - (K / TWO_PI) * Math.sin(TWO_PI * theta)) % 1 + 1) % 1;
  }
  return sum / n;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setD(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return d;
}

// Tongue label positions for prominent mode-locked regions
const TONGUE_LABELS: [string, number][] = [
  ["0", 0], ["1/4", 0.25], ["1/3", 1 / 3], ["1/2", 0.5],
  ["2/3", 2 / 3], ["3/4", 0.75], ["1", 1],
];

// Fixed canvas pixel dimensions (before DPR scaling)
const TONGUE_W = 450;
const TONGUE_H = 300;
const BIFUR_W = 450;
const BIFUR_H = 300;
const ORBIT_SIZE = 200;
const RHYTHM_W = 600;
const RHYTHM_H = 120;

// Arnold tongue grid resolution (reduced for fast initial render)
const AT_OMEGA_STEPS = 80;
const AT_K_STEPS = 50;
const AT_K_MAX = 2.0;

/**
 * Set up a canvas for crisp hi-DPI rendering.
 * Sets the buffer size to logicalW * dpr x logicalH * dpr,
 * then scales the context so drawing code uses logical coordinates.
 * Returns the context (already scaled) and the DPR.
 */
function setupCanvas(
  cv: HTMLCanvasElement,
  logicalW: number,
  logicalH: number,
): { ctx: CanvasRenderingContext2D; dpr: number } | null {
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(logicalW * dpr);
  cv.height = Math.round(logicalH * dpr);
  cv.style.width = logicalW + "px";
  cv.style.height = logicalH + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, dpr };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function CircleMapPanel() {
  // -- persisted state --
  const [omega, setOmega] = useLS("lt_cm_omega", 0.5);
  const [K, setK] = useLS("lt_cm_K", 0.8);
  const [sweepMode, setSweepMode] = useLS<"omega" | "K">("lt_cm_sweep", "omega");
  const [bpm, setBpm] = useLS("lt_cm_bpm", 120);
  const [preset, setPreset] = useLS("lt_cm_preset", "");

  // -- local state --
  const [playing, setPlaying] = useState(false);
  const playRef = useRef(false);
  const [tongueReady, setTongueReady] = useState(false);

  // -- canvas refs --
  const tongueRef = useRef<HTMLCanvasElement>(null);
  const bifurRef = useRef<HTMLCanvasElement>(null);
  const orbitRef = useRef<HTMLCanvasElement>(null);
  const rhythmRef = useRef<HTMLCanvasElement>(null);

  // -- debounced params for expensive computations --
  const dOmega = useDebounced(omega, 200);
  const dK = useDebounced(K, 200);

  // -- expensive computations --
  const tongueGrid = useMemo(() => {
    const grid = arnoldTongueGrid(AT_OMEGA_STEPS, AT_K_STEPS, AT_K_MAX, 200);
    return grid;
  }, []);

  // Signal when tongue grid is ready (it computes synchronously, but we
  // need a state flip so the canvas draw effect fires after mount + data)
  useEffect(() => {
    if (tongueGrid.length > 0) setTongueReady(true);
  }, [tongueGrid]);

  const bifurData = useMemo(
    () =>
      bifurcationData(
        sweepMode,
        sweepMode === "omega" ? dK : dOmega,
        0, sweepMode === "omega" ? 1 : 3,
        400, 200, 400,
      ),
    [sweepMode, dOmega, dK],
  );

  const params: CircleMapParams = useMemo(() => ({ omega: dOmega, K: dK }), [dOmega, dK]);
  const orbit = useMemo(() => iterateOrbit(params, 80), [params]);
  const rho = useMemo(() => rotationNumber(params), [params]);
  const period = useMemo(() => detectPeriod(params), [params]);
  const lambda = useMemo(() => lyapunovSingle(dOmega, dK), [dOmega, dK]);
  const rhythm = useMemo(() => orbitToRhythm(orbit.slice(-32), period || 8), [orbit, period]);

  // -- preset apply --
  const applyPreset = useCallback((name: string) => {
    const p = RHYTHM_PRESETS.find((r) => r.name === name);
    if (p) { setOmega(p.omega); setK(p.K); }
    setPreset(name);
  }, [setOmega, setK, setPreset]);

  // -- Arnold tongue canvas --
  useEffect(() => {
    const cv = tongueRef.current;
    if (!cv || !tongueReady) return;
    const setup = setupCanvas(cv, TONGUE_W, TONGUE_H);
    if (!setup) return;
    const { ctx } = setup;
    const W = TONGUE_W, H = TONGUE_H;

    // Dark background first
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, W, H);

    if (tongueGrid.length === 0) {
      ctx.fillStyle = "#555";
      ctx.font = "13px monospace";
      ctx.textAlign = "center";
      ctx.fillText("Computing Arnold tongues...", W / 2, H / 2);
      return;
    }

    // Build ImageData at grid resolution, then scale up
    const img = ctx.createImageData(AT_OMEGA_STEPS, AT_K_STEPS);

    // The engine iterates ki (outer) then oi (inner), so index = ki * omegaSteps + oi
    for (let idx = 0; idx < tongueGrid.length; idx++) {
      const c = tongueGrid[idx];
      const oi = Math.round(c.omega * (AT_OMEGA_STEPS - 1));
      const ki = Math.round((c.K / AT_K_MAX) * (AT_K_STEPS - 1));
      const px = (ki * AT_OMEGA_STEPS + oi) * 4;
      if (px < 0 || px + 3 >= img.data.length) continue;
      const hue = ((c.rho % 1 + 1) % 1) * 360;
      const sat = c.isLocked ? 85 : 15;
      const lum = c.isLocked ? 50 : 20;
      const [r, g, b] = hslToRgb(hue, sat, lum);
      img.data[px] = r;
      img.data[px + 1] = g;
      img.data[px + 2] = b;
      img.data[px + 3] = 255;
    }

    // Draw the small ImageData to a temp canvas, then scale it up
    const tmp = document.createElement("canvas");
    tmp.width = AT_OMEGA_STEPS;
    tmp.height = AT_K_STEPS;
    tmp.getContext("2d")!.putImageData(img, 0, 0);

    // K axis: bottom=0, top=kMax => flip vertically
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.translate(0, H);
    ctx.scale(1, -1);
    ctx.drawImage(tmp, 0, 0, W, H);
    ctx.restore();

    // Crosshair at current (omega, K)
    const cx = omega * W;
    const cy = H - (K / AT_K_MAX) * H;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
    ctx.setLineDash([]);

    // Ratio labels along bottom
    ctx.fillStyle = "#aaa";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    for (const [label, oVal] of TONGUE_LABELS) {
      const lx = oVal * W;
      ctx.fillText(label, lx, H - 3);
    }

    // Axis labels
    ctx.fillStyle = "#666";
    ctx.font = "11px monospace";
    ctx.textAlign = "center";
    ctx.fillText("\u03A9", W / 2, H - 14);
    ctx.save();
    ctx.translate(12, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("K", 0, 0);
    ctx.restore();
  }, [tongueGrid, tongueReady, omega, K]);

  // -- Bifurcation canvas --
  useEffect(() => {
    const cv = bifurRef.current;
    if (!cv) return;
    const setup = setupCanvas(cv, BIFUR_W, BIFUR_H);
    if (!setup) return;
    const { ctx } = setup;
    const W = BIFUR_W, H = BIFUR_H;

    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, W, H);

    if (bifurData.length === 0) {
      ctx.fillStyle = "#555";
      ctx.font = "13px monospace";
      ctx.textAlign = "center";
      ctx.fillText("Computing...", W / 2, H / 2);
      return;
    }

    const pMin = 0;
    const pMax = sweepMode === "omega" ? 1 : 3;

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (const pt of bifurData) {
      const x = ((pt.paramValue - pMin) / (pMax - pMin)) * W;
      const y = H - pt.theta * H;
      ctx.fillRect(x, y, 1.2, 1.2);
    }

    // Vertical marker at current param value
    const curVal = sweepMode === "omega" ? omega : K;
    const mx = ((curVal - pMin) / (pMax - pMin)) * W;
    ctx.strokeStyle = "rgba(255,100,100,0.6)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, H); ctx.stroke();
    ctx.setLineDash([]);

    // Axis labels
    ctx.fillStyle = "#666";
    ctx.font = "11px monospace";
    ctx.textAlign = "center";
    ctx.fillText(sweepMode === "omega" ? "\u03A9" : "K", W / 2, H - 4);
    ctx.save();
    ctx.translate(12, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("\u03B8", 0, 0);
    ctx.restore();
  }, [bifurData, omega, K, sweepMode]);

  // -- Orbit circle canvas --
  useEffect(() => {
    const cv = orbitRef.current;
    if (!cv) return;
    const setup = setupCanvas(cv, ORBIT_SIZE, ORBIT_SIZE);
    if (!setup) return;
    const { ctx } = setup;
    const W = ORBIT_SIZE, H = ORBIT_SIZE;

    ctx.clearRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 16;
    const pts = orbit.slice(-50);

    // Unit circle
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();

    // Connecting lines
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1].theta * 2 * Math.PI;
      const b = pts[i].theta * 2 * Math.PI;
      const alpha = 0.1 + 0.6 * (i / pts.length);
      ctx.strokeStyle = `rgba(100,180,255,${alpha.toFixed(2)})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx + R * Math.cos(a), cy - R * Math.sin(a));
      ctx.lineTo(cx + R * Math.cos(b), cy - R * Math.sin(b));
      ctx.stroke();
    }

    // Dots
    for (let i = 0; i < pts.length; i++) {
      const ang = pts[i].theta * 2 * Math.PI;
      const alpha = 0.2 + 0.8 * (i / pts.length);
      const r = 2 + 2 * (i / pts.length);
      ctx.fillStyle = `rgba(100,200,255,${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(cx + R * Math.cos(ang), cy - R * Math.sin(ang), r, 0, 2 * Math.PI);
      ctx.fill();
    }
  }, [orbit]);

  // -- Rhythm timeline canvas --
  useEffect(() => {
    const cv = rhythmRef.current;
    if (!cv) return;
    const setup = setupCanvas(cv, RHYTHM_W, RHYTHM_H);
    if (!setup) return;
    const { ctx } = setup;
    const W = RHYTHM_W, H = RHYTHM_H;
    const pad = 12;
    const usableW = W - pad * 2;
    const baseY = H - pad;
    const topY = pad;
    const trackH = baseY - topY;

    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, W, H);

    if (!rhythm.length) {
      ctx.fillStyle = "#555";
      ctx.font = "11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("No rhythm data", W / 2, H / 2);
      return;
    }

    const maxTime = rhythm[rhythm.length - 1].time || 1;

    // Beat grid lines (quarter divisions)
    const gridSteps = Math.ceil(maxTime);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1;
    for (let i = 0; i <= gridSteps; i++) {
      const x = pad + (i / maxTime) * usableW;
      if (x > W - pad) break;
      ctx.beginPath(); ctx.moveTo(x, topY); ctx.lineTo(x, baseY); ctx.stroke();
      ctx.fillStyle = "#333";
      ctx.font = "8px monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), x, H - 2);
    }

    // Baseline
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, baseY); ctx.lineTo(W - pad, baseY); ctx.stroke();

    // Onset markers — vertical lines with velocity height + dot at top
    for (const onset of rhythm) {
      const x = pad + (onset.time / maxTime) * usableW;
      const h = onset.velocity * trackH;
      const alpha = 0.4 + onset.velocity * 0.6;

      // Vertical line
      ctx.strokeStyle = `rgba(100, 180, 255, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, baseY); ctx.lineTo(x, baseY - h); ctx.stroke();

      // Dot at top
      const r = 2 + onset.velocity * 3;
      ctx.fillStyle = `rgba(100, 200, 255, ${alpha})`;
      ctx.beginPath(); ctx.arc(x, baseY - h, r, 0, 2 * Math.PI); ctx.fill();
    }
  }, [rhythm]);

  // -- Tongue click handler --
  const handleTongueClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const cv = tongueRef.current;
      if (!cv) return;
      const rect = cv.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1 - (e.clientY - rect.top) / rect.height;
      setOmega(clamp(x, 0, 1));
      setK(clamp(y * AT_K_MAX, 0, AT_K_MAX));
    },
    [setOmega, setK],
  );

  // -- Play rhythm --
  const playRhythm = useCallback(async () => {
    // Stop if already playing
    if (playRef.current) {
      playRef.current = false;
      setPlaying(false);
      return;
    }
    if (!rhythm.length) return;

    // Use the app's audioEngine context
    await audioEngine.init(12);
    audioEngine.resume();
    const ctx = (audioEngine as any).ctx as AudioContext;
    if (!ctx) return;

    playRef.current = true;
    setPlaying(true);

    const beatDur = 60 / bpm;
    const now = ctx.currentTime + 0.05;

    for (const onset of rhythm) {
      const t = now + onset.time * beatDur;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g);
      g.connect(ctx.destination);

      osc.type = "sine";
      osc.frequency.value = 800 + onset.velocity * 600;
      g.gain.setValueAtTime(onset.velocity * 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

      osc.start(t);
      osc.stop(t + 0.06);
    }

    const totalDur = (rhythm[rhythm.length - 1]?.time ?? 0) * beatDur + 0.2;
    setTimeout(() => {
      playRef.current = false;
      setPlaying(false);
    }, totalDur * 1000);
  }, [rhythm, bpm]);

  // -- Render --
  return (
    <div className="flex flex-col gap-3 bg-[#0d0d0d] p-4 rounded-lg border border-[#222] text-[#ccc]">
      {/* Educational description */}
      <div className="text-xs text-[#888] leading-relaxed font-mono whitespace-pre-line border-b border-[#222] pb-3 mb-1">
        <span className="text-[#aaa] font-bold tracking-wider">RHYTHM DYNAMICS — CIRCLE MAP</span>
{`
A mathematical model of how two rhythmic pulses interact.

`}<span className="text-[#999]">{"\u03A9 (omega)"}</span>{` = the natural frequency ratio between two rhythms
`}<span className="text-[#999]">K</span>{` = how strongly they pull each other into sync

`}<span className="text-[#666] uppercase text-[10px]">Left:</span>{` Arnold Tongues — colored regions where rhythms lock into simple ratios (2:3, 3:4, etc.). Dark = ambiguous/chaotic.
`}<span className="text-[#666] uppercase text-[10px]">Right:</span>{` Bifurcation diagram — what the rhythm looks like as you change one parameter. Clean lines = stable pattern, scatter = chaos.

`}<span className="text-[#666] uppercase text-[10px]">Bottom:</span>{` The actual rhythm pattern you'd hear, with a play button. Presets include Steve Reich phase-drift, golden ratio, and polyrhythms.`}
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-1 text-[#999]">
          Preset
          <select
            className="bg-[#181818] border border-[#333] rounded px-2 py-1 text-[#ccc] text-xs"
            value={preset}
            onChange={(e) => applyPreset(e.target.value)}
          >
            <option value="">--</option>
            {RHYTHM_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1 text-[#999]">
          <span className="font-mono">&Omega;</span>
          <input
            type="range" min={0} max={1} step={0.001}
            value={omega}
            onChange={(e) => setOmega(+e.target.value)}
            className="w-28 accent-blue-500"
          />
          <span className="font-mono text-[#aaa] w-12">{omega.toFixed(3)}</span>
        </label>

        <label className="flex items-center gap-1 text-[#999]">
          K
          <input
            type="range" min={0} max={3} step={0.01}
            value={K}
            onChange={(e) => setK(+e.target.value)}
            className="w-28 accent-blue-500"
          />
          <span className="font-mono text-[#aaa] w-12">{K.toFixed(2)}</span>
        </label>

        <span className="font-mono text-[#888]">
          &rho;&nbsp;=&nbsp;{formatRotationNumber(rho)}
        </span>
        <span className="font-mono text-[#888]">
          Period:&nbsp;{period || "\u221E"}
        </span>
        <span className="font-mono text-[#888]">
          &lambda;&nbsp;=&nbsp;{lambda.toFixed(3)}
        </span>
      </div>

      {/* Top row: Arnold tongue + Bifurcation */}
      <div className="grid grid-cols-2 gap-3" style={{ minHeight: TONGUE_H + 20 }}>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-[#666] uppercase tracking-wider">Arnold Tongues</span>
          <div style={{ width: TONGUE_W, height: TONGUE_H, maxWidth: "100%" }}>
            <canvas
              ref={tongueRef}
              className="rounded border border-[#222] cursor-crosshair bg-[#0a0a0a]"
              style={{ width: TONGUE_W, height: TONGUE_H, maxWidth: "100%" }}
              onClick={handleTongueClick}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[#666] uppercase tracking-wider">Bifurcation</span>
            <label className="flex items-center gap-1 text-[10px] text-[#888]">
              <input
                type="radio" name="sweep" value="omega"
                checked={sweepMode === "omega"}
                onChange={() => setSweepMode("omega")}
                className="accent-blue-500"
              />
              Sweep &Omega;
            </label>
            <label className="flex items-center gap-1 text-[10px] text-[#888]">
              <input
                type="radio" name="sweep" value="K"
                checked={sweepMode === "K"}
                onChange={() => setSweepMode("K")}
                className="accent-blue-500"
              />
              Sweep K
            </label>
          </div>
          <div style={{ width: BIFUR_W, height: BIFUR_H, maxWidth: "100%" }}>
            <canvas
              ref={bifurRef}
              className="rounded border border-[#222] bg-[#0a0a0a]"
              style={{ width: BIFUR_W, height: BIFUR_H, maxWidth: "100%" }}
            />
          </div>
        </div>
      </div>

      {/* Bottom row: Orbit circle + Rhythm timeline */}
      <div className="grid grid-cols-[200px_1fr] gap-3 items-end">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-[#666] uppercase tracking-wider">Orbit</span>
          <div style={{ width: ORBIT_SIZE, height: ORBIT_SIZE }}>
            <canvas
              ref={orbitRef}
              className="rounded border border-[#222] bg-[#0a0a0a]"
              style={{ width: ORBIT_SIZE, height: ORBIT_SIZE }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[#666] uppercase tracking-wider">Rhythm</span>
            <label className="flex items-center gap-1 text-[10px] text-[#888]">
              BPM
              <input
                type="range" min={60} max={180} step={1}
                value={bpm}
                onChange={(e) => setBpm(+e.target.value)}
                className="w-20 accent-blue-500"
              />
              <span className="font-mono w-8">{bpm}</span>
            </label>
            <button
              onClick={playRhythm}
              className={`px-3 py-1 rounded text-xs font-mono border ${
                playing
                  ? "border-red-700 text-red-400 bg-red-950"
                  : "border-[#444] text-[#aaa] bg-[#181818] hover:bg-[#222]"
              }`}
            >
              {playing ? "\u25A0 Stop" : "\u25B6 Play rhythm"}
            </button>
          </div>
          <div style={{ width: RHYTHM_W, height: RHYTHM_H, maxWidth: "100%" }}>
            <canvas
              ref={rhythmRef}
              className="rounded border border-[#222] bg-[#0a0a0a]"
              style={{ width: RHYTHM_W, height: RHYTHM_H, maxWidth: "100%" }}
            />
          </div>
        </div>
      </div>

      {/* Preset description */}
      {preset && (
        <div className="text-[11px] text-[#555] italic">
          {RHYTHM_PRESETS.find((p) => p.name === preset)?.description}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HSL to RGB helper
// ---------------------------------------------------------------------------
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
