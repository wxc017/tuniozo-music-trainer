// ── Tonality lattice (3D) ────────────────────────────────────────────────
// Direct port of `Downloads/tonality-lattice-v2.html`, extended to seven
// families (Major / Harmonic Minor / Melodic Minor + Subminor / Neutral /
// Supermajor / Subharmonic Diatonic).  The layout is a 3D grid:
//   X = circle of fifths (15 keys, F♭ ... B♯).
//   Y = brightness (sharps relative to Major).
//   Z = family stack (7 layers from Major at front to Subharmonic
//       Diatonic at back).
//
// Click any node to drone that tonality.  The user's currently-selected
// tonality from the picker above appears highlighted at its grid cell.

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import { audioEngine } from "@/lib/audioEngine";
import {
  buildCylinderLattice, LATTICE_FAMILIES, CYLINDER_PARAMS,
  scaleNoteNames,
  type TonalityLattice, type LatticeNode,
} from "@/lib/tonalityLatticeLayout";
import { formatHalfAccidentals, getSolfege } from "@/lib/edoData";
import { formatRomanNumeral } from "@/lib/formatRoman";

interface Props {
  edo: number;
  rootPitch: number;
  tonicPc: number;
  anchorKey: string | null;     // `${family}::${mode}` from ScalarTab
  playVol?: number;
  onActiveModeChange?: (node: LatticeNode | null) => void;
}

// Harmonic-series default per-note gains.  Same logic as before:
//   degree 1 → harmonic 1   (loudest)
//   degree 5 → harmonic 3
//   degree 3 → harmonic 5
//   degree 7 → harmonic 7
//   degree 2 → harmonic 9
//   degree 4 → harmonic 11
//   degree 6 → harmonic 13
const HARMONIC_BY_DEGREE: Record<number, number> = {
  1: 1, 2: 9, 3: 5, 4: 11, 5: 3, 6: 13, 7: 7,
};
const HARMONIC_GAIN_BASE = 1.6;
function harmonicSeriesGains(scale: number[]): number[] {
  return scale.map((_, idx) => {
    const degree = idx + 1;
    const h = HARMONIC_BY_DEGREE[degree] ?? 17;
    return HARMONIC_GAIN_BASE / Math.sqrt(h);
  });
}

interface NodeMeshProps {
  node: LatticeNode;
  edo: number;
  isAnchor: boolean;
  isActive: boolean;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  onClick: (node: LatticeNode) => void;
}

function NodeMesh({ node, edo, isAnchor, isActive, isHovered, onHover, onClick }: NodeMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const baseColor = useMemo(() => new THREE.Color(node.family.color), [node.family.color]);
  const emissive = baseColor;

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const target = isActive ? 1.6 : isAnchor ? 1.4 : isHovered ? 1.2 : 1.0;
    const cur = meshRef.current.scale.x;
    meshRef.current.scale.setScalar(cur + (target - cur) * Math.min(1, delta * 8));
  });

  const r = isAnchor ? 0.18 : 0.13;
  const opacity = isAnchor || isActive || isHovered ? 1 : 0.85;

  return (
    <group position={node.pos}>
      <mesh
        ref={meshRef}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(node.id); }}
        onPointerOut={() => onHover(null)}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(node); }}>
        <sphereGeometry args={[r, 18, 14]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={emissive}
          emissiveIntensity={isActive ? 0.9 : isAnchor ? 0.55 : 0.18}
          roughness={0.35}
          metalness={0.4}
          transparent={opacity < 1}
          opacity={opacity} />
      </mesh>
      <Html center distanceFactor={isHovered || isActive || isAnchor ? 8 : 11}
            style={{ pointerEvents: "none" }}>
        {isHovered || isActive || isAnchor ? (
          <div style={{
            background: "#0a0a0aee",
            border: `1px solid ${node.family.color}`,
            color: node.family.color,
            padding: "3px 7px",
            borderRadius: 3,
            fontSize: 11,
            fontWeight: 700,
            whiteSpace: "nowrap",
            transform: "translate(0, -32px)",
            textAlign: "center",
          }}>
            <div>
              <span style={{ color: "#ddd", marginRight: 4 }}>{node.key.name}</span>
              {formatHalfAccidentals(node.mode.name)}
            </div>
            <div style={{
              fontSize: 9, fontWeight: 500, color: "#bbb",
              marginTop: 2, letterSpacing: 1,
            }}>
              {scaleNoteNames(node.rootPc, node.mode.scale, edo).join(" · ")}
            </div>
          </div>
        ) : (
          // Discrete always-on label — small, dim, no background.
          // Includes the key's root letter alongside the mode short
          // name (e.g. "D Dor", "B♭ Mix", "F♯ HMn") so the user can
          // identify every node by sight without hovering.
          <div style={{
            color: node.family.color,
            opacity: 0.82,
            fontSize: 8.5,
            fontWeight: 600,
            whiteSpace: "nowrap",
            transform: "translate(0, -16px)",
            textShadow: "0 0 4px #000, 0 0 4px #000",
            letterSpacing: 0.2,
          }}>
            <span style={{ color: "#ddd", marginRight: 3 }}>{node.key.name}</span>
            {formatHalfAccidentals(node.mode.short)}
          </div>
        )}
      </Html>
    </group>
  );
}

interface SceneProps {
  lattice: TonalityLattice;
  edo: number;
  anchorId: string | null;
  activeId: string | null;
  hoveredId: string | null;
  showFamilies: Record<string, boolean>;
  showEdges: Record<string, boolean>;
  onHover: (id: string | null) => void;
  onClick: (node: LatticeNode) => void;
}

function Scene({ lattice, edo, anchorId, activeId, hoveredId, showFamilies, showEdges, onHover, onClick }: SceneProps) {
  // Edges are filtered to those touching the user's focus — the
  // anchor (picker selection), the active drone, or the hovered node.
  // This keeps the surface readable: only the current scale's
  // connections light up rather than the full hairball.
  const visibleEdges = useMemo(() => {
    type Pair = { color: string; type: "y" | "z"; points: [LatticeNode["pos"], LatticeNode["pos"]] };
    const focusIds = new Set<string>();
    if (anchorId)  focusIds.add(anchorId);
    if (activeId)  focusIds.add(activeId);
    if (hoveredId) focusIds.add(hoveredId);
    if (focusIds.size === 0) return [] as Pair[];

    const out: Pair[] = [];
    for (const e of lattice.edges) {
      if (e.type === "x") continue;
      if (!focusIds.has(e.fromId) && !focusIds.has(e.toId)) continue;
      const a = lattice.nodeMap.get(e.fromId);
      const b = lattice.nodeMap.get(e.toId);
      if (!a || !b) continue;
      if (!showFamilies[a.family.id] || !showFamilies[b.family.id]) continue;
      if (!showEdges[e.type]) continue;
      out.push({ color: e.color, type: e.type as "y" | "z", points: [a.pos, b.pos] });
    }
    out.sort((a, b) => (a.type === "z" ? 1 : 0) - (b.type === "z" ? 1 : 0));
    return out;
  }, [lattice, anchorId, activeId, hoveredId, showFamilies, showEdges]);

  return (
    <>
      <ambientLight intensity={0.55} />
      <pointLight position={[10, 10, 10]} intensity={1.2} />
      <pointLight position={[-10, -5, -10]} intensity={0.7} />
      <pointLight position={[0, 0, 14]} intensity={0.7} />

      {/* Family cylinders — translucent shells underneath each family's
          ring of nodes, so the user can see "Major is the inner family,
          Subharmonic Diatonic is the outermost", etc. */}
      {LATTICE_FAMILIES.map(f => {
        const r = CYLINDER_PARAMS.R0 + f.zOrd * CYLINDER_PARAMS.DR;
        const height = (lattice.bounds.maxY - lattice.bounds.minY) + 1;
        const yMid = (lattice.bounds.maxY + lattice.bounds.minY) / 2;
        return (
          <mesh key={`cyl-${f.id}`} position={[0, yMid, 0]}>
            <cylinderGeometry args={[r, r, height, 48, 1, true]} />
            <meshBasicMaterial
              color={f.color}
              transparent opacity={0.045}
              side={THREE.DoubleSide}
              depthWrite={false} />
          </mesh>
        );
      })}

      {visibleEdges.map((e, i) => (
        e.type === "y" ? (
          <Line key={`y-${i}`} points={e.points} color={e.color}
            lineWidth={1.6} transparent opacity={0.75} />
        ) : (
          <Line key={`z-${i}`} points={e.points} color={e.color}
            lineWidth={2.0} transparent opacity={0.9} />
        )
      ))}

      {lattice.nodes.map(node => {
        if (!showFamilies[node.family.id]) return null;
        return (
          <NodeMesh
            key={node.id}
            node={node}
            edo={edo}
            isAnchor={anchorId === node.id}
            isActive={activeId === node.id}
            isHovered={hoveredId === node.id}
            onHover={onHover}
            onClick={onClick} />
        );
      })}

      <OrbitControls enableDamping dampingFactor={0.15} />
    </>
  );
}

export default function ModeLattice3D({ edo, rootPitch, tonicPc, anchorKey, playVol = 0.55, onActiveModeChange }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeNode, setActiveNode] = useState<LatticeNode | null>(null);
  const [perNoteGains, setPerNoteGains] = useState<number[]>([]);

  // Family / edge visibility toggles.
  const [showFamilies, setShowFamilies] = useState<Record<string, boolean>>(
    Object.fromEntries(LATTICE_FAMILIES.map(f => [f.id, true]))
  );
  const [showEdges, setShowEdges] = useState<Record<string, boolean>>({
    y: true, z: true,
  });

  // Parse the anchor's family + mode out of the picker selection.
  const [anchorFamilyName, anchorModeName] = useMemo(() => {
    if (!anchorKey) return [null, null] as [string | null, string | null];
    const [f, m] = anchorKey.split("::");
    return [f ?? null, m ?? null] as [string | null, string | null];
  }, [anchorKey]);

  // Multi-key cylinder lattice — 15 keys × 7 families × 7 modes = 735
  // nodes, distributed on 7 concentric vertical cylinders (one per
  // family), with the anchor's key rotated to θ = 0 and its brightness
  // centred at y = 0 so it lands at front-and-centre.
  const lattice = useMemo(
    () => buildCylinderLattice(edo, tonicPc, anchorFamilyName, anchorModeName),
    [edo, tonicPc, anchorFamilyName, anchorModeName]
  );

  // Find the anchor's id within the cylinder lattice — its keyIdx
  // depends on which spelling matches tonicPc.
  const anchorId = useMemo(() => {
    if (!anchorFamilyName || !anchorModeName) return null;
    const family = LATTICE_FAMILIES.find(f => f.familyName === anchorFamilyName);
    if (!family) return null;
    for (const n of lattice.nodes) {
      if (n.family.id === family.id
          && n.mode.name === anchorModeName
          && n.rootPc === ((tonicPc % edo) + edo) % edo) {
        return n.id;
      }
    }
    return null;
  }, [lattice, anchorFamilyName, anchorModeName, tonicPc, edo]);

  useEffect(() => {
    return () => { audioEngine.stopDrone(); };
  }, []);

  // Reset drone when picker selection changes.
  useEffect(() => {
    audioEngine.stopDrone();
    setActiveId(null);
    setActiveNode(null);
    setPerNoteGains([]);
    onActiveModeChange?.(null);
  }, [anchorKey, onActiveModeChange]);

  const startDroneFor = useCallback((node: LatticeNode, gains: number[]) => {
    audioEngine.stopDrone();
    // Map node's pc + scale steps to absolute pitches.  rootPitch is
    // the tonicPc-anchored absolute pitch in the user's range; we shift
    // by (node.rootPc - tonicPc) to land on this node's actual key.
    const offset = ((node.rootPc - tonicPc) % edo + edo) % edo;
    const base = rootPitch + offset;
    const notes = node.mode.scale.map(s => base + s);
    audioEngine.startDrone(notes, edo, 0.06 * playVol * 4, gains);
  }, [rootPitch, tonicPc, edo, playVol]);

  const handleClick = useCallback((node: LatticeNode) => {
    if (activeId === node.id) {
      audioEngine.stopDrone();
      setActiveId(null);
      setActiveNode(null);
      setPerNoteGains([]);
      onActiveModeChange?.(null);
      return;
    }
    const gains = harmonicSeriesGains(node.mode.scale);
    setPerNoteGains(gains);
    setActiveId(node.id);
    setActiveNode(node);
    onActiveModeChange?.(node);
    startDroneFor(node, gains);
  }, [activeId, startDroneFor, onActiveModeChange]);

  const updateGain = useCallback((index: number, value: number) => {
    if (!activeNode) return;
    const next = [...perNoteGains];
    next[index] = value;
    setPerNoteGains(next);
    startDroneFor(activeNode, next);
  }, [activeNode, perNoteGains, startDroneFor]);

  const resetGains = useCallback(() => {
    if (!activeNode) return;
    const gains = harmonicSeriesGains(activeNode.mode.scale);
    setPerNoteGains(gains);
    startDroneFor(activeNode, gains);
  }, [activeNode, startDroneFor]);

  const solfege = useMemo(() => getSolfege(edo), [edo]);

  // Initial camera position — pull back along +Z far enough to see the
  // outermost cylinder, raised slightly so we look at the "front" of
  // the structure (anchor's column).
  const cameraPos = useMemo<[number, number, number]>(() => {
    const w = lattice.bounds.maxX - lattice.bounds.minX;
    const h = lattice.bounds.maxY - lattice.bounds.minY;
    const d = lattice.bounds.maxZ - lattice.bounds.minZ;
    const dist = Math.max(w, h, d) * 1.4;
    return [0, 1.5, dist + 6];
  }, [lattice]);

  return (
    <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2 flex-wrap border-b border-[#1a1a1a]">
        <p className="text-[10px] tracking-wider font-semibold text-[#888] mr-2">
          TONALITY LATTICE · 15 KEYS × 7 FAMILIES × 7 MODES
        </p>
        {LATTICE_FAMILIES.map(f => (
          <button key={f.id}
            onClick={() => setShowFamilies(s => ({ ...s, [f.id]: !s[f.id] }))}
            className="text-[9px] px-2 py-0.5 rounded border transition-colors"
            style={{
              borderColor: showFamilies[f.id] ? f.color : "#222",
              background: showFamilies[f.id] ? f.dim : "transparent",
              color: showFamilies[f.id] ? f.color : "#444",
            }}>
            <span style={{
              display: "inline-block", width: 6, height: 6,
              borderRadius: "50%", background: f.color, marginRight: 4,
              opacity: showFamilies[f.id] ? 1 : 0.3,
            }} />
            {f.short}
          </button>
        ))}
        <span className="ml-2 text-[8px] text-[#444]">EDGES</span>
        {[
          { id: "y", label: "Y · brightness", color: "#445d7a" },
          { id: "z", label: "Z · alteration", color: "#22ddaa" },
        ].map(e => (
          <button key={e.id}
            onClick={() => setShowEdges(s => ({ ...s, [e.id]: !s[e.id] }))}
            className="text-[9px] px-2 py-0.5 rounded border transition-colors"
            style={{
              borderColor: showEdges[e.id] ? e.color : "#222",
              color: showEdges[e.id] ? e.color : "#444",
            }}>
            {e.label}
          </button>
        ))}
      </div>

      <div style={{ height: 540, background: "#050b16" }}>
        <Canvas camera={{ position: cameraPos, fov: 45 }}>
          <Scene
            lattice={lattice}
            edo={edo}
            anchorId={anchorId}
            activeId={activeId}
            hoveredId={hoveredId}
            showFamilies={showFamilies}
            showEdges={showEdges}
            onHover={setHoveredId}
            onClick={handleClick} />
        </Canvas>
      </div>

      {activeNode && (
        <div className="px-3 py-2 border-t border-[#1a1a1a] bg-[#0d0d0d]">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[10px] tracking-wider font-semibold"
                  style={{ color: activeNode.family.color }}>
              DRONE MIXER · {activeNode.key.name} {formatHalfAccidentals(activeNode.mode.name)}
            </span>
            <button onClick={resetGains}
              className="text-[9px] px-2 py-0.5 rounded border border-[#2a2a2a] bg-[#141414] text-[#888] hover:text-[#ccc]">
              reset
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeNode.mode.scale.map((step, i) => {
              const isRoot = step === 0;
              const harmonicDefaults = harmonicSeriesGains(activeNode.mode.scale);
              const v = perNoteGains[i] ?? harmonicDefaults[i];
              const label = solfege ? solfege[step] : `step ${step}`;
              return (
                <div key={i}
                     className="flex flex-col items-center px-2 py-1 rounded border border-[#1f1f1f] bg-[#0a0a0a]"
                     style={{ minWidth: 56 }}>
                  <span className="text-[10px] font-bold"
                        style={{ color: isRoot ? activeNode.family.color : "#aaa" }}>
                    {label}
                  </span>
                  <input type="range" min={0} max={2} step={0.01} value={v}
                    onChange={(e) => updateGain(i, parseFloat(e.target.value))}
                    style={{ width: 56, accentColor: isRoot ? activeNode.family.color : "#666" }} />
                  <span className="text-[8px] text-[#555]">{v.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Info strip — shows the active or hovered node's notes so the
          user can read them without zooming into the floating label. */}
      {(() => {
        const focus = activeNode
          ?? (hoveredId ? lattice.nodeMap.get(hoveredId) ?? null : null)
          ?? (anchorId  ? lattice.nodeMap.get(anchorId)  ?? null : null);
        if (!focus) return null;
        const notes = scaleNoteNames(focus.rootPc, focus.mode.scale, edo);
        return (
          <div className="px-3 py-2 border-t border-[#1a1a1a] bg-[#0d0d0d]"
               style={{ borderTopColor: focus.family.color + "30" }}>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span style={{ color: focus.family.color, fontSize: 13, fontWeight: 700 }}>
                {focus.key.name} {formatHalfAccidentals(focus.mode.name)}
              </span>
              <span className="text-[9px] text-[#666] tracking-wider">
                {focus.family.label.toUpperCase()}
              </span>
              <span className="ml-auto text-[10px] text-[#888] font-mono tracking-wider">
                {notes.join("   ")}
              </span>
            </div>
          </div>
        );
      })()}

      <div className="px-3 py-1.5 text-[9px] text-[#555] border-t border-[#1a1a1a] flex items-center gap-3">
        <span>Click any node to drone its tonality.  Drag to orbit, scroll to zoom.  Edges fade in for whichever node you hover or have selected.</span>
        {activeNode && (
          <span style={{ color: activeNode.family.color }}>
            playing: {activeNode.key.name} {formatHalfAccidentals(activeNode.mode.name)}
          </span>
        )}
      </div>
    </div>
  );
}

// Suppress unused import warning if formatRomanNumeral isn't referenced
// from this file's UI yet — kept in scope so future selection/info
// panels can show Roman numerals consistently with the rest of the tab.
void formatRomanNumeral;
