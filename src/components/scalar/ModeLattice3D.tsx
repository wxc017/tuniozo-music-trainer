// ── 3D mode lattice ───────────────────────────────────────────────────
// Renders the 49 modes (Major / Harmonic Minor / Melodic Minor / 4 xen
// families × 7 modes each) as nodes in 3D, with edges connecting modes
// whose scales differ by ≤ 2 positions.  Vertical position = brightness;
// horizontal position is force-directed so 1-alteration neighbours sit
// close together regardless of which family they belong to.
//
// Click a node → toggle a sustained drone of that mode's scale on the
// user's chosen root.  Click again → stop.

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import { audioEngine } from "@/lib/audioEngine";
import { getModeLattice, alterationFromAnchor, type ModeNode } from "@/lib/modeLatticeLayout";
import { formatHalfAccidentals, getSolfege } from "@/lib/edoData";

interface Props {
  edo: number;
  rootPitch: number;          // absolute pitch (within visualizer range) where the drone sits
  rootName?: string;          // letter name for the root, e.g. "C"
  anchorKey: string | null;   // user's selected tonality key, or null
  playVol?: number;
  onActiveModeChange?: (mode: ModeNode | null) => void;
}

// Family → palette colour.  Mirrors the picker's family colours so the
// lattice reads as the same vocabulary the user just clicked through.
const FAMILY_COLOR: Record<string, string> = {
  "Major Family":             "#6a9aca",
  "Harmonic Minor Family":    "#c09050",
  "Melodic Minor Family":     "#c06090",
  "Subminor Diatonic Family": "#7aaa6a",
  "Neutral Diatonic Family":  "#9a66c0",
  "Supermajor Diatonic Family": "#cc6a8a",
  "Subharmonic Diatonic Family": "#4a9ac7",
};

// Family → distinct 3D geometry.  Each family wears its own platonic
// solid (or torus / torus-knot for the topologically different ones)
// so silhouette alone identifies the family without reading the colour.
type Shape =
  | "octahedron" | "cube" | "dodecahedron" | "tetrahedron"
  | "icosahedron" | "torus" | "torusKnot";

const FAMILY_SHAPE: Record<string, Shape> = {
  "Major Family":               "octahedron",   // 8 faces — clean, classic
  "Harmonic Minor Family":      "cube",         // 6 square faces — grounded, minor-leaning
  "Melodic Minor Family":       "dodecahedron", // 12 faces — rich, more complex
  "Subminor Diatonic Family":   "tetrahedron",  // 4 faces — sharp, septimal edge
  "Neutral Diatonic Family":    "icosahedron",  // 20 faces — rounded, ambivalent
  "Supermajor Diatonic Family": "torus",        // genus-1 — different topology
  "Subharmonic Diatonic Family":"torusKnot",    // most complex topology
};


interface NodeMeshProps {
  node: ModeNode;
  rootName: string;
  isAnchor: boolean;
  isActive: boolean;
  isHovered: boolean;
  alterationFromAnchor: number | null;
  onHover: (key: string | null) => void;
  onClick: (node: ModeNode) => void;
}

// Render the family-specific geometry.  R3F primitives accept the
// element form `<octahedronGeometry args={[radius, detail]} />` etc.
function FamilyGeometry({ shape, r }: { shape: Shape; r: number }) {
  switch (shape) {
    case "octahedron":   return <octahedronGeometry args={[r, 0]} />;
    case "cube":         return <boxGeometry args={[r * 1.6, r * 1.6, r * 1.6]} />;
    case "dodecahedron": return <dodecahedronGeometry args={[r, 0]} />;
    case "tetrahedron":  return <tetrahedronGeometry args={[r * 1.3, 0]} />;
    case "icosahedron":  return <icosahedronGeometry args={[r, 0]} />;
    case "torus":        return <torusGeometry args={[r * 0.85, r * 0.32, 14, 24]} />;
    case "torusKnot":    return <torusKnotGeometry args={[r * 0.7, r * 0.22, 64, 8]} />;
  }
}

function NodeMesh({ node, rootName, isAnchor, isActive, isHovered, alterationFromAnchor: dAnchor, onHover, onClick }: NodeMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const baseColor = new THREE.Color(FAMILY_COLOR[node.family] ?? "#888");
  const emissive = new THREE.Color(FAMILY_COLOR[node.family] ?? "#888");

  // Slow rotation gives every shape a sense of dimensionality even
  // when the camera isn't moving.  Anchor + active spin a touch faster.
  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const targetScale = isActive ? 1.5 : isAnchor ? 1.3 : isHovered ? 1.2 : 1.0;
    const cur = meshRef.current.scale.x;
    meshRef.current.scale.setScalar(cur + (targetScale - cur) * Math.min(1, delta * 8));
    const spin = isActive ? 0.6 : isAnchor ? 0.35 : 0.12;
    meshRef.current.rotation.y += delta * spin;
    meshRef.current.rotation.x += delta * spin * 0.4;
  });

  // Dim nodes that are far from the anchor so the lattice has a focal
  // point.  Anchor itself + 1-alteration neighbours stay full saturation.
  let intensity = 1.0;
  if (dAnchor !== null) {
    if (dAnchor === 0) intensity = 1.0;
    else if (dAnchor === 1) intensity = 0.95;
    else if (dAnchor === 2) intensity = 0.7;
    else intensity = 0.4;
  }

  const r = isAnchor ? 0.18 : 0.14;
  const shape = FAMILY_SHAPE[node.family] ?? "octahedron";

  return (
    <group position={node.pos}>
      <mesh
        ref={meshRef}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(node.key); }}
        onPointerOut={() => onHover(null)}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(node); }}>
        <FamilyGeometry shape={shape} r={r} />
        <meshStandardMaterial
          color={baseColor.clone().multiplyScalar(intensity)}
          emissive={emissive.clone().multiplyScalar(isActive ? 0.6 : isAnchor ? 0.35 : 0.1)}
          roughness={0.4}
          metalness={0.25}
          flatShading />
      </mesh>
      {/* Label always visible.  Root prefix appears whenever a 12-EDO
          letter is available (so 31-EDO sessions just show the mode
          name, since there's no clean letter for microtonal roots). */}
      <Html center distanceFactor={9} style={{ pointerEvents: "none" }}>
        <div style={{
          background: "#0a0a0acc",
          border: `1px solid ${FAMILY_COLOR[node.family] ?? "#444"}${isAnchor || isActive ? "" : "55"}`,
          color: FAMILY_COLOR[node.family] ?? "#ccc",
          padding: "1px 5px",
          borderRadius: 3,
          fontSize: isAnchor || isActive ? 11 : isHovered ? 10 : 9,
          fontWeight: isAnchor || isActive ? 700 : 600,
          whiteSpace: "nowrap",
          transform: `translate(0, ${-Math.round((r + 0.06) * 40)}px)`,
          opacity: isAnchor || isActive ? 1 : isHovered ? 0.95 : 0.75,
        }}>
          {rootName ? <span style={{ color: "#bbb", marginRight: 4 }}>{rootName}</span> : null}
          {formatHalfAccidentals(node.mode)}
          {dAnchor !== null && dAnchor > 0 && (isHovered || isActive) && (
            <span style={{ color: "#888", fontWeight: 400, marginLeft: 6 }}>
              · {dAnchor} alt
            </span>
          )}
        </div>
      </Html>
    </group>
  );
}

interface SceneProps {
  anchorKey: string | null;
  activeKey: string | null;
  hoveredKey: string | null;
  rootName: string;
  onHover: (key: string | null) => void;
  onClick: (node: ModeNode) => void;
  edo: number;
}

function Scene({ anchorKey, activeKey, hoveredKey, rootName, onHover, onClick, edo }: SceneProps) {
  const lattice = useMemo(() => getModeLattice(edo), [edo]);
  const anchor = anchorKey ? lattice.byKey.get(anchorKey) ?? null : null;

  // Edge geometry split by alteration count.  Rendered back-to-front so
  // 1-alt edges (the strongest topological signal) sit on top:
  //   3 → faint bridge, dotted, near-invisible — only there to remind
  //       the user that the xen and Western families ARE related.
  //   2 → dim grey, dashed.
  //   1 → bright purple, solid, opaque.
  const edgesByAlt = useMemo(() => {
    const bucket: Record<number, { key: string; points: [number, number, number][] }[]> = { 1: [], 2: [], 3: [] };
    for (let i = 0; i < lattice.edges.length; i++) {
      const e = lattice.edges[i];
      const a = lattice.byKey.get(e.fromKey)!.pos;
      const b = lattice.byKey.get(e.toKey)!.pos;
      bucket[e.alterations].push({ key: `${e.alterations}-${i}`, points: [a, b] });
    }
    return bucket;
  }, [lattice]);

  return (
    <>
      <ambientLight intensity={0.45} />
      <pointLight position={[6, 6, 6]} intensity={1.0} />
      <pointLight position={[-6, -3, -6]} intensity={0.5} />

      {/* 3-alteration bridges — very faint, dotted */}
      {edgesByAlt[3].map(e => (
        <Line key={e.key} points={e.points} color="#202028" lineWidth={1} dashed dashScale={40} gapSize={0.4} transparent opacity={0.5} />
      ))}
      {/* 2-alteration edges */}
      {edgesByAlt[2].map(e => (
        <Line key={e.key} points={e.points} color="#3a3a3a" lineWidth={1} dashed dashScale={20} gapSize={0.2} />
      ))}
      {/* 1-alteration edges */}
      {edgesByAlt[1].map(e => (
        <Line key={e.key} points={e.points} color="#7173e6" lineWidth={1.5} transparent opacity={0.55} />
      ))}

      {lattice.nodes.map(node => (
        <NodeMesh
          key={node.key}
          node={node}
          rootName={rootName}
          isAnchor={anchorKey === node.key}
          isActive={activeKey === node.key}
          isHovered={hoveredKey === node.key}
          alterationFromAnchor={anchor ? alterationFromAnchor(anchor, node) : null}
          onHover={onHover}
          onClick={onClick} />
      ))}

      <OrbitControls enableDamping dampingFactor={0.15} />
    </>
  );
}

// Default per-note gains: root sits ~2x louder than upper tones so the
// fundamental reads clearly as the root of the drone.
const DEFAULT_ROOT_GAIN = 1.6;
const DEFAULT_TONE_GAIN = 0.85;

export default function ModeLattice3D({ edo, rootPitch, rootName = "", anchorKey, playVol = 0.55, onActiveModeChange }: Props) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activeNode, setActiveNode] = useState<ModeNode | null>(null);

  // Per-scale-degree volume.  Index = position in the active mode's scale
  // (0 = root, 1..6 = upper degrees).  Reset whenever the active mode
  // changes.  Range: 0.0 – 2.0; default tilts the root higher than the rest.
  const [perNoteGains, setPerNoteGains] = useState<number[]>([]);

  // Stop drone on unmount.
  useEffect(() => {
    return () => { audioEngine.stopDrone(); };
  }, []);

  // If anchor changes (user re-selects in the picker), stop the active
  // drone so we don't keep playing a stale scale.
  useEffect(() => {
    audioEngine.stopDrone();
    setActiveKey(null);
    setActiveNode(null);
    setPerNoteGains([]);
    onActiveModeChange?.(null);
  }, [anchorKey, onActiveModeChange]);

  const startDroneFor = useCallback((node: ModeNode, gains: number[]) => {
    audioEngine.stopDrone();
    const notes = node.scale.map(s => rootPitch + s);
    audioEngine.startDrone(notes, edo, 0.06 * playVol * 4, gains);
  }, [rootPitch, edo, playVol]);

  const handleClick = useCallback((node: ModeNode) => {
    // Toggle: clicking the active node stops the drone.
    if (activeKey === node.key) {
      audioEngine.stopDrone();
      setActiveKey(null);
      setActiveNode(null);
      setPerNoteGains([]);
      onActiveModeChange?.(null);
      return;
    }
    const gains = node.scale.map(s => (s === 0 ? DEFAULT_ROOT_GAIN : DEFAULT_TONE_GAIN));
    setPerNoteGains(gains);
    setActiveKey(node.key);
    setActiveNode(node);
    onActiveModeChange?.(node);
    startDroneFor(node, gains);
  }, [activeKey, startDroneFor, onActiveModeChange]);

  // Live-update per-note gain.  Restarts the drone with new gains so the
  // change is audible immediately.
  const updateGain = useCallback((index: number, value: number) => {
    if (!activeNode) return;
    const next = [...perNoteGains];
    next[index] = value;
    setPerNoteGains(next);
    startDroneFor(activeNode, next);
  }, [activeNode, perNoteGains, startDroneFor]);

  const resetGains = useCallback(() => {
    if (!activeNode) return;
    const gains = activeNode.scale.map(s => (s === 0 ? DEFAULT_ROOT_GAIN : DEFAULT_TONE_GAIN));
    setPerNoteGains(gains);
    startDroneFor(activeNode, gains);
  }, [activeNode, startDroneFor]);

  const solfege = useMemo(() => getSolfege(edo), [edo]);

  return (
    <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between border-b border-[#1a1a1a]">
        <p className="text-[10px] tracking-wider font-semibold text-[#888]">
          MODE LATTICE — 49 modes, edges by alteration count
        </p>
        <div className="flex items-center gap-3 text-[9px] text-[#666]">
          <span><span style={{ color: "#7173e6" }}>━</span> 1 alt</span>
          <span><span style={{ color: "#3a3a3a" }}>┄</span> 2 alts</span>
          <span><span style={{ color: "#202028" }}>┈</span> 3 alts (bridge)</span>
          <span>↑ bright / ↓ dark</span>
        </div>
      </div>
      <div style={{ height: 520, background: "#0a0a0a" }}>
        <Canvas camera={{ position: [0, 0, 12], fov: 50 }}>
          <Scene
            anchorKey={anchorKey}
            activeKey={activeKey}
            hoveredKey={hoveredKey}
            rootName={rootName}
            onHover={setHoveredKey}
            onClick={handleClick}
            edo={edo} />
        </Canvas>
      </div>

      {/* Per-note drone mixer.  Only renders when something is droning. */}
      {activeNode && (
        <div className="px-3 py-2 border-t border-[#1a1a1a] bg-[#0d0d0d]">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[10px] tracking-wider font-semibold"
                  style={{ color: "#9999ee" }}>
              DRONE MIXER · {formatHalfAccidentals(activeNode.mode)}
            </span>
            <button onClick={resetGains}
              className="text-[9px] px-2 py-0.5 rounded border border-[#2a2a2a] bg-[#141414] text-[#888] hover:text-[#ccc]">
              reset
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeNode.scale.map((step, i) => {
              const isRoot = step === 0;
              const v = perNoteGains[i] ?? (isRoot ? DEFAULT_ROOT_GAIN : DEFAULT_TONE_GAIN);
              const label = solfege ? solfege[step] : `step ${step}`;
              return (
                <div key={i}
                     className="flex flex-col items-center px-2 py-1 rounded border border-[#1f1f1f] bg-[#0a0a0a]"
                     style={{ minWidth: 56 }}>
                  <span className="text-[10px] font-bold"
                        style={{ color: isRoot ? "#9999ee" : "#aaa" }}>
                    {label}
                  </span>
                  <input type="range" min={0} max={2} step={0.01} value={v}
                    onChange={(e) => updateGain(i, parseFloat(e.target.value))}
                    style={{ width: 56, accentColor: isRoot ? "#9999ee" : "#666" }} />
                  <span className="text-[8px] text-[#555]">
                    {v.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-3 py-1.5 text-[9px] text-[#555] border-t border-[#1a1a1a] flex items-center gap-3">
        <span>Click a mode to drone its scale.  Click again to stop.</span>
        {activeKey && (
          <span style={{ color: "#9999ee" }}>
            playing: {formatHalfAccidentals(activeKey.split("::")[1])}
          </span>
        )}
      </div>
    </div>
  );
}
