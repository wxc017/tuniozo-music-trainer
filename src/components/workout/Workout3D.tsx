// ── Workout 3D scatter ───────────────────────────────────────────────────
// A rotatable 3D plot of one exercise's sessions:
//   X = time (session order, oldest → newest)
//   Y = counterweight / load
//   Z = volume (reps or hold seconds)
// Each session is a sphere; a faint line threads them in time order so you can
// read the progression path. Drag to rotate, wheel to zoom, right-drag to pan.

import { useMemo, type CSSProperties } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";

const S = 8;               // cube side (all axes normalized into 0..S)
const AXIS = "#3a3d48";
const ACCENT = "#d7ac52";

const labelStyle: CSSProperties = {
  color: "#9a9daa", font: "600 11px Helvetica, Arial, sans-serif",
  whiteSpace: "nowrap", pointerEvents: "none", letterSpacing: "0.04em",
};
const tickStyle: CSSProperties = {
  color: "#6b6e7a", font: "500 9px Helvetica, Arial, sans-serif", whiteSpace: "nowrap", pointerEvents: "none",
};

interface Pt { date: string; cw: number | null; volume: number | null }

function Axes({ cwLabel, maxCw, maxVol, firstDate, lastDate }: {
  cwLabel: string; maxCw: number; maxVol: number; firstDate: string; lastDate: string;
}) {
  return (
    <group>
      <Line points={[[0, 0, 0], [S, 0, 0]]} color={AXIS} lineWidth={1} />
      <Line points={[[0, 0, 0], [0, S, 0]]} color={AXIS} lineWidth={1} />
      <Line points={[[0, 0, 0], [0, 0, S]]} color={AXIS} lineWidth={1} />
      <Html position={[S + 0.4, 0, 0]} center><div style={labelStyle}>Time →</div></Html>
      <Html position={[0, S + 0.5, 0]} center><div style={labelStyle}>{cwLabel}</div></Html>
      <Html position={[0, 0, S + 0.4]} center><div style={labelStyle}>Volume</div></Html>
      {/* end ticks so the axes have a scale */}
      <Html position={[0, 0, 0]} center><div style={tickStyle}>{firstDate}</div></Html>
      <Html position={[S, -0.5, 0]} center><div style={tickStyle}>{lastDate}</div></Html>
      <Html position={[-0.6, S, 0]} center><div style={tickStyle}>{Math.round(maxCw)}</div></Html>
      <Html position={[0, -0.4, S]} center><div style={tickStyle}>{Math.round(maxVol)}</div></Html>
    </group>
  );
}

export default function Workout3D({ points, cwLabel }: { points: Pt[]; cwLabel: string }) {
  const valid = useMemo(
    () => points.filter(p => p.cw != null && p.volume != null) as { date: string; cw: number; volume: number }[],
    [points],
  );
  const { nodes, path, maxCw, maxVol } = useMemo(() => {
    const maxCw = Math.max(1, ...valid.map(p => p.cw));
    const maxVol = Math.max(1, ...valid.map(p => p.volume));
    const n = valid.length;
    const nodes = valid.map((p, i) => ({
      pos: [n > 1 ? (i / (n - 1)) * S : S / 2, (p.cw / maxCw) * S, (p.volume / maxVol) * S] as [number, number, number],
      p,
    }));
    return { nodes, path: nodes.map(nd => nd.pos), maxCw, maxVol };
  }, [valid]);

  if (valid.length === 0) {
    return (
      <div style={{ height: 360, borderRadius: 12, background: "#0e0f13", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--wl-faint)", fontSize: 12 }}>
        No counterweight + volume data yet for this exercise.
      </div>
    );
  }

  return (
    <div style={{ height: 360, borderRadius: 12, overflow: "hidden", background: "#0e0f13", touchAction: "none" }}>
      <Canvas camera={{ position: [S * 1.7, S * 1.25, S * 1.9], fov: 45 }}>
        <color attach="background" args={["#0e0f13"]} />
        <Axes cwLabel={cwLabel} maxCw={maxCw} maxVol={maxVol} firstDate={valid[0].date} lastDate={valid[valid.length - 1].date} />
        {path.length > 1 && <Line points={path} color={ACCENT} lineWidth={1.5} dashed dashSize={0.25} gapSize={0.15} />}
        {nodes.map((nd, i) => (
          <mesh key={i} position={nd.pos}>
            <sphereGeometry args={[0.24, 16, 16]} />
            <meshBasicMaterial color={ACCENT} />
          </mesh>
        ))}
        <OrbitControls enablePan enableZoom enableRotate makeDefault />
      </Canvas>
    </div>
  );
}
