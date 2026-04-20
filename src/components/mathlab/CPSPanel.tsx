import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { audioEngine } from "@/lib/audioEngine";
import { useLS } from "@/lib/storage";
import {
  generateCPS, intervalsWithinCPS, cpsSubchords, cpsPositions3D,
  CPS_PRESETS,
  type CPSStructure, type CPSPitch,
} from "@/lib/cpsEngine";

// ── Prime-based colors for factor visualization ──────────────────────
const FACTOR_COLORS: Record<number, string> = {
  1: "#888888", 2: "#ff4444", 3: "#44aaff", 5: "#44ff88",
  7: "#ffaa44", 11: "#ff44ff", 13: "#ffff44", 17: "#44ffff",
  19: "#ff8888", 23: "#88ff88",
};
function factorColor(f: number): string {
  return FACTOR_COLORS[f] ?? `hsl(${(f * 137) % 360}, 70%, 60%)`;
}
function blendColors(factors: number[]): string {
  if (!factors.length) return "#888";
  let r = 0, g = 0, b = 0;
  for (const f of factors) {
    const c = new THREE.Color(factorColor(f));
    r += c.r; g += c.g; b += c.b;
  }
  const n = factors.length;
  return new THREE.Color(r / n, g / n, b / n).getStyle();
}

const BASE_FREQ = 261.63;

// ── Pulsing ring for active nodes ────────────────────────────────────

function ActiveRing({ radius }: { radius: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const t = clock.getElapsedTime();
      const scale = 1 + 0.15 * Math.sin(t * 3);
      ref.current.scale.setScalar(scale);
    }
  });
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius * 1.3, radius * 1.6, 32]} />
      <meshBasicMaterial color="#66ffaa" opacity={0.7} transparent side={THREE.DoubleSide} />
    </mesh>
  );
}

// ── 3D Scene components ──────────────────────────────────────────────

function CPSNode({ pos, pitch, index, radius, isComplement, hovered, isActive, onHover, onClick }: {
  pos: [number, number, number]; pitch: CPSPitch; index: number;
  radius: number; isComplement: boolean;
  hovered: boolean; isActive: boolean;
  onHover: (i: number | null) => void; onClick: (i: number, e: React.MouseEvent) => void;
}) {
  const color = useMemo(() => blendColors(pitch.factors), [pitch.factors]);
  const r = hovered ? radius * 1.6 : isActive ? radius * 1.3 : radius;
  return (
    <group position={pos}>
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); onHover(index); }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => { e.stopPropagation(); onClick(index, e.nativeEvent as unknown as React.MouseEvent); }}
      >
        <sphereGeometry args={[r, 24, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={isActive ? "#ffffff" : color}
          emissiveIntensity={isActive ? 0.8 : hovered ? 0.6 : isComplement ? 0.15 : 0.3}
          opacity={isComplement ? 0.5 : 1}
          transparent={isComplement}
        />
      </mesh>
      {isActive && <ActiveRing radius={r} />}
      {hovered && (
        <Html distanceFactor={12} style={{ pointerEvents: "none" }}>
          <div style={{
            background: "rgba(0,0,0,0.85)", color: "#eee", padding: "4px 8px",
            borderRadius: 4, fontSize: 12, whiteSpace: "nowrap", border: "1px solid #444",
          }}>
            <div style={{ fontWeight: 600 }}>{pitch.label}</div>
            <div>{pitch.ratio[0]}/{pitch.ratio[1]} ({pitch.cents.toFixed(1)}c)</div>
            {isActive && <div style={{ color: "#66ffaa", fontSize: 10 }}>Playing (click to stop)</div>}
          </div>
        </Html>
      )}
    </group>
  );
}

function CPSEdges({ cps, hoveredIdx }: { cps: CPSStructure; hoveredIdx: number | null }) {
  return (
    <>
      {cps.edges.map((edge, i) => {
        const p0 = cps.positions3D[edge.from];
        const p1 = cps.positions3D[edge.to];
        const adj = hoveredIdx === edge.from || hoveredIdx === edge.to;
        const color = blendColors(edge.differingFactors);
        return (
          <Line
            key={i}
            points={[p0, p1]}
            color={color}
            lineWidth={adj ? 2.5 : 1.2}
            opacity={adj ? 0.8 : 0.4}
            transparent
          />
        );
      })}
    </>
  );
}

function CPSFaces({ cps }: { cps: CPSStructure }) {
  const geom = useMemo(() => {
    const oVerts: number[] = [];
    const uVerts: number[] = [];
    for (const face of cps.faces) {
      if (face.vertices.length < 3) continue;
      const target = face.isOtonal && !face.isUtonal ? oVerts
        : !face.isOtonal && face.isUtonal ? uVerts : oVerts;
      // Fan triangulation from first vertex
      const v0 = cps.positions3D[face.vertices[0]];
      for (let j = 1; j < face.vertices.length - 1; j++) {
        const v1 = cps.positions3D[face.vertices[j]];
        const v2 = cps.positions3D[face.vertices[j + 1]];
        target.push(...v0, ...v1, ...v2);
      }
    }
    return { oVerts, uVerts };
  }, [cps]);

  return (
    <>
      {geom.oVerts.length > 0 && (
        <mesh>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array(geom.oVerts), 3]}
            />
          </bufferGeometry>
          <meshBasicMaterial color="#ff8833" opacity={0.1} transparent side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
      {geom.uVerts.length > 0 && (
        <mesh>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array(geom.uVerts), 3]}
            />
          </bufferGeometry>
          <meshBasicMaterial color="#3388ff" opacity={0.1} transparent side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}

function DoubleClickCatcher({ onDoubleClick }: { onDoubleClick: () => void }) {
  return (
    <mesh visible={false} onDoubleClick={onDoubleClick}>
      <sphereGeometry args={[50, 8, 8]} />
      <meshBasicMaterial />
    </mesh>
  );
}

function CPSScene({ cps, complementPositions, onHoverPitch, onActiveNodesChange }: {
  cps: CPSStructure;
  complementPositions: [number, number, number][];
  onHoverPitch: (p: CPSPitch | null) => void;
  onActiveNodesChange: (nodes: Set<number>) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [activeNodes, setActiveNodes] = useState<Set<number>>(new Set());

  // Clear active nodes when CPS structure changes
  useEffect(() => {
    setActiveNodes(new Set());
    audioEngine.stopDrone();
    onActiveNodesChange(new Set());
  }, [cps, onActiveNodesChange]);

  const handleHover = useCallback((idx: number | null) => {
    setHovered(idx);
    if (idx === null) onHoverPitch(null);
    else if (idx >= 0) onHoverPitch(cps.pitches[idx]);
    else if (cps.complementPitches) onHoverPitch(cps.complementPitches[-1 - idx]);
    else onHoverPitch(null);
  }, [cps, onHoverPitch]);

  const updateDrone = useCallback((nodes: Set<number>) => {
    if (nodes.size === 0) {
      audioEngine.stopDrone();
    } else {
      const ratios = Array.from(nodes).map(i => {
        if (i >= 0) return cps.pitches[i].ratio[0] / cps.pitches[i].ratio[1];
        const ci = -1 - i;
        return cps.complementPitches![ci].ratio[0] / cps.complementPitches![ci].ratio[1];
      });
      audioEngine.startRatioDrone(ratios, 0.08, BASE_FREQ);
    }
  }, [cps]);

  const handleClick = useCallback((idx: number, _e: React.MouseEvent) => {
    setActiveNodes(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      updateDrone(next);
      onActiveNodesChange(next);
      return next;
    });
  }, [updateDrone, onActiveNodesChange]);

  const handleDoubleClick = useCallback(() => {
    setActiveNodes(new Set());
    audioEngine.stopDrone();
    onActiveNodesChange(new Set());
  }, [onActiveNodesChange]);

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <CPSEdges cps={cps} hoveredIdx={hovered} />
      <CPSFaces cps={cps} />
      {cps.pitches.map((p, i) => (
        <CPSNode
          key={`p-${i}`} pos={cps.positions3D[i]} pitch={p} index={i}
          radius={0.2} isComplement={false}
          hovered={hovered === i} isActive={activeNodes.has(i)}
          onHover={handleHover} onClick={handleClick}
        />
      ))}
      {cps.complementPitches?.map((p, i) => (
        <CPSNode
          key={`c-${i}`} pos={complementPositions[i]} pitch={p} index={-1 - i}
          radius={0.12} isComplement
          hovered={hovered === -1 - i} isActive={activeNodes.has(-1 - i)}
          onHover={handleHover} onClick={handleClick}
        />
      ))}
      <DoubleClickCatcher onDoubleClick={handleDoubleClick} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.15} />
    </>
  );
}

// ── Main panel ───────────────────────────────────────────────────────

export default function CPSPanel() {
  const [presetName, setPresetName] = useLS("lt_cps_preset", CPS_PRESETS[0].name);
  const [customFactors, setCustomFactors] = useLS("lt_cps_factors", "");
  const [customK, setCustomK] = useLS("lt_cps_k", 2);
  const [useCustom, setUseCustom] = useState(false);
  const [hoveredInfo, setHoveredInfo] = useState<CPSPitch | null>(null);
  const [activeNodes, setActiveNodes] = useState<Set<number>>(new Set());

  // Resolve factors and k
  const preset = CPS_PRESETS.find(p => p.name === presetName) ?? CPS_PRESETS[0];

  const parsedFactors = useMemo(() => {
    const txt = customFactors.trim();
    if (!txt) return null;
    const nums = txt.split(/[\s,]+/).map(Number).filter(n => n > 0 && Number.isFinite(n));
    return nums.length >= 2 ? nums : null;
  }, [customFactors]);

  const factors = useCustom && parsedFactors ? parsedFactors : preset.factors;
  const k = useCustom && parsedFactors ? Math.min(Math.max(1, customK), factors.length - 1) : preset.k;

  const cps = useMemo(() => generateCPS(factors, k), [factors, k]);

  const complementPositions = useMemo(() => {
    if (!cps.complementPitches) return [];
    return cpsPositions3D(cps.complementPitches, cps.factors, cps.factors.length - cps.k);
  }, [cps]);

  const intervals = useMemo(() => intervalsWithinCPS(cps), [cps]);
  const subchords = useMemo(() => cpsSubchords(cps), [cps]);

  // Deduplicate intervals by ratio
  const uniqueIntervals = useMemo(() => {
    const seen = new Set<string>();
    return intervals.filter(iv => {
      const key = `${iv.ratio[0]}/${iv.ratio[1]}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [intervals]);

  const otonalCount = subchords.filter(s => s.type === "otonal").length;
  const utonalCount = subchords.filter(s => s.type === "utonal").length;
  const mixedCount = subchords.filter(s => s.type === "mixed").length;

  const handleActiveNodesChange = useCallback((nodes: Set<number>) => {
    setActiveNodes(new Set(nodes));
  }, []);

  const handleStopAll = useCallback(() => {
    audioEngine.stopDrone();
    setActiveNodes(new Set());
  }, []);

  // Build list of active pitch info for sidebar
  const activePitchList = useMemo(() => {
    return Array.from(activeNodes).map(idx => {
      if (idx >= 0) return { idx, pitch: cps.pitches[idx] };
      const ci = -1 - idx;
      if (cps.complementPitches && ci < cps.complementPitches.length) {
        return { idx, pitch: cps.complementPitches[ci] };
      }
      return null;
    }).filter(Boolean) as { idx: number; pitch: CPSPitch }[];
  }, [activeNodes, cps]);

  return (
    <div style={{ display: "flex", height: "100%", background: "#0d0d0d", color: "#ccc" }}>
      {/* Left sidebar */}
      <div style={{
        width: 280, minWidth: 280, padding: 12, overflowY: "auto",
        borderRight: "1px solid #222", display: "flex", flexDirection: "column", gap: 10,
        fontSize: 13,
      }}>
        {/* Educational description */}
        <div style={{
          background: "#111", border: "1px solid #2a2a2a", borderRadius: 6,
          padding: "8px 10px", fontSize: 11, color: "#888", lineHeight: 1.5,
        }}>
          <div style={{ color: "#aaa", fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
            CPS STRUCTURES (Erv Wilson)
          </div>
          <div>
            Combination Product Sets — choose a set of harmonic factors
            (like &#123;1, 3, 5, 7&#125;) and combine them in pairs to get pitches.
          </div>
          <div style={{ marginTop: 4 }}>
            The hexany (6 notes from 4 factors) forms an octahedron.
            Each edge connects pitches sharing a common factor.
            <span style={{ color: "#ff8833" }}> Orange faces</span> = otonal (harmonic) triads.
            <span style={{ color: "#5599ff" }}> Blue faces</span> = utonal (subharmonic) triads.
          </div>
          <div style={{ marginTop: 4, color: "#777" }}>
            Click nodes to hear pitches. Multiple nodes play simultaneously.
            Click again to stop.
          </div>
        </div>

        {/* Preset */}
        <div>
          <label style={{ color: "#888", fontSize: 11, display: "block", marginBottom: 3 }}>Preset</label>
          <select
            value={presetName}
            onChange={e => { setPresetName(e.target.value); setUseCustom(false); }}
            style={{
              width: "100%", background: "#181818", color: "#ccc", border: "1px solid #333",
              borderRadius: 4, padding: "4px 6px", fontSize: 13,
            }}
          >
            {CPS_PRESETS.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
          {!useCustom && (
            <div style={{ color: "#666", fontSize: 11, marginTop: 3 }}>{preset.description}</div>
          )}
        </div>

        {/* Custom factors */}
        <div>
          <label style={{ color: "#888", fontSize: 11, display: "block", marginBottom: 3 }}>
            Custom factors
          </label>
          <input
            type="text"
            value={customFactors}
            onChange={e => setCustomFactors(e.target.value)}
            placeholder="e.g. 1 3 5 7 or 1,3,5,7"
            style={{
              width: "100%", background: "#181818", color: "#ccc", border: "1px solid #333",
              borderRadius: 4, padding: "4px 6px", fontSize: 13, boxSizing: "border-box",
            }}
          />
        </div>

        {/* k */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ color: "#888", fontSize: 11 }}>k (comb. size)</label>
          <input
            type="number"
            value={customK}
            min={1}
            max={parsedFactors ? parsedFactors.length - 1 : 9}
            onChange={e => setCustomK(Number(e.target.value))}
            style={{
              width: 50, background: "#181818", color: "#ccc", border: "1px solid #333",
              borderRadius: 4, padding: "4px 6px", fontSize: 13, textAlign: "center",
            }}
          />
          <button
            onClick={() => {
              if (parsedFactors) setUseCustom(true);
            }}
            disabled={!parsedFactors}
            style={{
              background: parsedFactors ? "#2a5a3a" : "#222", color: parsedFactors ? "#8f8" : "#555",
              border: "1px solid #333", borderRadius: 4, padding: "4px 10px", cursor: "pointer",
              fontSize: 12,
            }}
          >
            Generate
          </button>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid #222", margin: "4px 0" }} />

        {/* Structure info */}
        <div>
          <div style={{ color: "#999", fontWeight: 600, marginBottom: 4 }}>{cps.name}</div>
          <div style={{ color: "#777", fontSize: 12 }}>
            Factors: {cps.factors.join(" \u00b7 ")} &nbsp; k={cps.k}
          </div>
          <div style={{ color: "#777", fontSize: 12, marginTop: 2 }}>
            {cps.pitches.length} pitches &middot; {cps.edges.length} edges &middot; {cps.faces.length} faces
          </div>
          {cps.complementPitches && (
            <div style={{ color: "#666", fontSize: 11, marginTop: 2 }}>
              Complement: {cps.complementPitches.length} pitches (k={cps.factors.length - cps.k})
            </div>
          )}
        </div>

        {/* Intervals */}
        <div>
          <div style={{ color: "#888", fontSize: 11, marginBottom: 3 }}>
            Intervals ({uniqueIntervals.length})
          </div>
          <div style={{ maxHeight: 120, overflowY: "auto", fontSize: 11, color: "#777" }}>
            {uniqueIntervals.map((iv, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
                <span>{iv.ratio[0]}/{iv.ratio[1]}</span>
                <span style={{ color: "#555" }}>{iv.cents.toFixed(1)}c</span>
                <span style={{ color: "#666", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {iv.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Subchords */}
        <div>
          <div style={{ color: "#888", fontSize: 11, marginBottom: 3 }}>
            Triads ({subchords.length})
          </div>
          <div style={{ fontSize: 11, color: "#777" }}>
            <span style={{ color: "#ff8833" }}>Otonal: {otonalCount}</span>
            {" \u00b7 "}
            <span style={{ color: "#3388ff" }}>Utonal: {utonalCount}</span>
            {mixedCount > 0 && <span> &middot; Mixed: {mixedCount}</span>}
          </div>
          <div style={{ maxHeight: 100, overflowY: "auto", fontSize: 11, color: "#666", marginTop: 3 }}>
            {subchords.slice(0, 30).map((sc, i) => (
              <div key={i} style={{ color: sc.type === "otonal" ? "#cc7722" : sc.type === "utonal" ? "#2266cc" : "#666" }}>
                [{sc.triad.map(t => cps.pitches[t].label).join(", ")}] {sc.type}
              </div>
            ))}
            {subchords.length > 30 && (
              <div style={{ color: "#555" }}>...and {subchords.length - 30} more</div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid #222", margin: "4px 0" }} />

        {/* Active / playing nodes */}
        <div style={{ minHeight: 50 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
            <div style={{ color: "#888", fontSize: 11 }}>
              Playing ({activePitchList.length})
            </div>
            {activePitchList.length > 0 && (
              <button
                onClick={handleStopAll}
                style={{
                  background: "#3a1a1a", color: "#f88", border: "1px solid #533",
                  borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 10,
                }}
              >
                Stop All
              </button>
            )}
          </div>
          {activePitchList.length > 0 ? (
            <div style={{ maxHeight: 80, overflowY: "auto", fontSize: 11 }}>
              {activePitchList.map(({ idx, pitch }) => (
                <div key={idx} style={{
                  display: "flex", justifyContent: "space-between", padding: "1px 0",
                  color: "#66ffaa",
                }}>
                  <span style={{ fontWeight: 600 }}>{pitch.label}</span>
                  <span style={{ color: "#559977" }}>
                    {pitch.ratio[0]}/{pitch.ratio[1]}
                  </span>
                  <span style={{ color: "#447755" }}>
                    {pitch.cents.toFixed(1)}c
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "#555", fontSize: 11 }}>Click nodes to play</div>
          )}
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid #222", margin: "4px 0" }} />

        {/* Hover info */}
        <div style={{ minHeight: 50 }}>
          <div style={{ color: "#888", fontSize: 11, marginBottom: 3 }}>Hovered pitch</div>
          {hoveredInfo ? (
            <div style={{ fontSize: 12 }}>
              <div style={{ color: "#ccc", fontWeight: 600 }}>{hoveredInfo.label}</div>
              <div style={{ color: "#999" }}>
                {hoveredInfo.ratio[0]}/{hoveredInfo.ratio[1]} &mdash; {hoveredInfo.cents.toFixed(1)} cents
              </div>
              <div style={{ color: "#777" }}>Factors: {hoveredInfo.factors.join(", ")}</div>
            </div>
          ) : (
            <div style={{ color: "#555", fontSize: 11 }}>Hover a node to see details</div>
          )}
        </div>

        {/* Instructions */}
        <div style={{ color: "#444", fontSize: 10, marginTop: "auto" }}>
          Click: toggle pitch on/off &middot; Accumulate freely<br />
          Double-click empty space: stop all sound
        </div>
      </div>

      {/* 3D Canvas */}
      <div style={{ flex: 1, position: "relative" }}>
        <Canvas camera={{ position: [8, 6, 8], fov: 50 }} style={{ background: "#0d0d0d" }}>
          <CPSScene
            cps={cps}
            complementPositions={complementPositions}
            onHoverPitch={setHoveredInfo}
            onActiveNodesChange={handleActiveNodesChange}
          />
        </Canvas>
      </div>
    </div>
  );
}
