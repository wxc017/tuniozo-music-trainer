// ── Workout 3D scatter ───────────────────────────────────────────────────
// A rotatable 3D plot of one exercise's sessions inside a dotted grid box:
//   X = session (oldest → newest)
//   Y = counterweight / load
//   Z = hold seconds (or reps)   ← "time" = how long you held
// Each session is a sphere; a dashed line threads them in time order. The three
// inner faces carry a dotted grid so you can eyeball where a point sits against
// the ticks. Drag to rotate, wheel to zoom, right-drag to pan.

import { useMemo, type CSSProperties } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";

const S = 8;              // cube side — every axis normalized into 0..S
const DIV = 4;            // grid divisions per axis
const STEP = S / DIV;
const GRID = "#2a2d38";   // dotted grid
const EDGE = "#474b59";   // solid axis edges
const ACCENT = "#d7ac52";

const lbl: CSSProperties = { color: "#b9bcca", font: "600 11px Helvetica, Arial, sans-serif", whiteSpace: "nowrap", pointerEvents: "none", letterSpacing: "0.04em" };
const tk: CSSProperties = { color: "#6b6e7a", font: "500 9px Helvetica, Arial, sans-serif", whiteSpace: "nowrap", pointerEvents: "none" };

interface Pt { date: string; cw: number | null; volume: number | null }

// Dotted grid on the floor (y=0), back wall (z=0) and left wall (x=0).
function DottedGrid() {
  const segs: [number, number, number][][] = [];
  for (let i = 0; i <= DIV; i++) {
    const t = i * STEP;
    segs.push([[0, 0, t], [S, 0, t]], [[t, 0, 0], [t, 0, S]]);   // floor  (XZ)
    segs.push([[0, t, 0], [S, t, 0]], [[t, 0, 0], [t, S, 0]]);   // back   (XY)
    segs.push([[0, t, 0], [0, t, S]], [[0, 0, t], [0, S, t]]);   // left   (YZ)
  }
  return <>{segs.map((p, i) => <Line key={i} points={p} color={GRID} lineWidth={1} dashed dashSize={0.1} gapSize={0.14} />)}</>;
}

export default function Workout3D({ points, cwLabel, zLabel }: { points: Pt[]; cwLabel: string; zLabel: string }) {
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
      <div style={{ height: 380, borderRadius: 12, background: "#0e0f13", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--wl-faint)", fontSize: 12 }}>
        No counterweight + {zLabel.toLowerCase()} data yet for this exercise.
      </div>
    );
  }

  return (
    <div style={{ height: 380, borderRadius: 12, overflow: "hidden", background: "#0e0f13", touchAction: "none" }}>
      <Canvas camera={{ position: [S * 1.8, S * 1.35, S * 2.0], fov: 42 }}>
        <color attach="background" args={["#0e0f13"]} />
        <DottedGrid />
        {/* solid axis edges */}
        <Line points={[[0, 0, 0], [S, 0, 0]]} color={EDGE} lineWidth={1.5} />
        <Line points={[[0, 0, 0], [0, S, 0]]} color={EDGE} lineWidth={1.5} />
        <Line points={[[0, 0, 0], [0, 0, S]]} color={EDGE} lineWidth={1.5} />

        {/* axis titles */}
        <Html position={[S + 0.5, -0.2, 0]} center><div style={lbl}>Session →</div></Html>
        <Html position={[0, S + 0.6, 0]} center><div style={lbl}>{cwLabel}</div></Html>
        <Html position={[0, -0.2, S + 0.6]} center><div style={lbl}>{zLabel}</div></Html>

        {/* tick values on Y (counterweight) and Z (hold/reps) */}
        {Array.from({ length: DIV + 1 }, (_, i) => (
          <Html key={`y${i}`} position={[-0.5, i * STEP, 0]} center><div style={tk}>{Math.round((i / DIV) * maxCw)}</div></Html>
        ))}
        {Array.from({ length: DIV + 1 }, (_, i) => (
          <Html key={`z${i}`} position={[0, -0.35, i * STEP]} center><div style={tk}>{Math.round((i / DIV) * maxVol)}</div></Html>
        ))}
        {/* session range on X */}
        <Html position={[0, -0.55, 0]} center><div style={tk}>{valid[0].date}</div></Html>
        <Html position={[S, -0.55, 0]} center><div style={tk}>{valid[valid.length - 1].date}</div></Html>

        {/* progression path + session spheres */}
        {path.length > 1 && <Line points={path} color={ACCENT} lineWidth={1.5} dashed dashSize={0.28} gapSize={0.16} />}
        {nodes.map((nd, i) => (
          <mesh key={i} position={nd.pos}>
            <sphereGeometry args={[0.24, 20, 20]} />
            <meshBasicMaterial color={ACCENT} />
          </mesh>
        ))}

        <OrbitControls enablePan enableZoom enableRotate makeDefault />
      </Canvas>
    </div>
  );
}
