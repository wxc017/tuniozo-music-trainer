import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import {
  allChordTypes,
  simplexCoords,
  buildVLGraph,
  voiceLeading,
  geodesicPath,
  type ChordType,
  type VLGraph,
  type VLGraphNode,
  type VLGraphEdge,
  type GeodesicFrame,
} from "@/lib/orbifoldEngine";
import { audioEngine } from "@/lib/audioEngine";
import { useLS } from "@/lib/storage";

// ── Constants ────────────────────────────────────────────────────────
const EDO_OPTIONS = [12, 17, 19, 31, 53] as const;
const ACCENT = "#8888dd";
const GOLD = "#d4a843";
const GRAY = "#555";
const BG = "#0d0d0d";

// ── Helpers ──────────────────────────────────────────────────────────

/** Convert pitch class to absolute pitch (octave 4 root). */
function pcToAbs(pc: number, _edo: number): number {
  return pc; // pcSet values are 0-based offsets from root; root = 0 = C4
}

function isNamed(c: ChordType): boolean {
  return c.name !== c.intervals.join("-");
}

function isMaxSymmetric(c: ChordType): boolean {
  return c.symmetryOrder === c.intervals.length; // aug, dim7, etc.
}

function nodeColor(c: ChordType): string {
  if (isMaxSymmetric(c)) return GOLD;
  if (isNamed(c)) return ACCENT;
  return GRAY;
}

function nodeRadius(c: ChordType): number {
  return 3 + 5 / c.symmetryOrder;
}

// ── 3D rotation helpers ──────────────────────────────────────────────
type Vec3 = [number, number, number];

function rotateY(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

function rotateX(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}

function project3D(
  v: Vec3, rotY: number, rotX: number,
  cx: number, cy: number, scale: number,
): [number, number] {
  const r = rotateX(rotateY(v, rotY), rotX);
  return [cx + r[0] * scale, cy - r[1] * scale];
}

// ── Component ────────────────────────────────────────────────────────

export default function OrbifoldPanel() {
  const [edo, setEdo] = useLS("lt_orbi_edo", 12);
  const [chordSize, setChordSize] = useLS("lt_orbi_n", 3);
  const [maxDist, setMaxDist] = useLS("lt_orbi_maxdist", 2);

  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [geoFrames, setGeoFrames] = useState<GeodesicFrame[] | null>(null);
  const [animIdx, setAnimIdx] = useState(-1);
  const [dragState, setDragState] = useState<{ rx: number; ry: number } | null>(null);
  const [rot, setRot] = useState<{ rx: number; ry: number }>({ rx: -0.4, ry: 0.6 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const is3D = chordSize === 4;

  // ── Expensive computations (with safety cap) ──────────────────────
  const MAX_TYPES = 300; // avoid O(n²) explosion for large EDOs

  const graph: VLGraph = useMemo(() => {
    const types = allChordTypes(chordSize, edo);
    if (types.length > MAX_TYPES) {
      // Too many — build graph from named/symmetric chords only
      const notable = types.filter(c => isNamed(c) || isMaxSymmetric(c));
      const subset = notable.length > 0 ? notable : types.slice(0, MAX_TYPES);
      const nodes: VLGraphNode[] = subset.map((ct, i) => {
        const coords = simplexCoords(ct.intervals, edo);
        return { id: i, chord: ct, x: coords.x, y: coords.y, z: coords.z };
      });
      // Still compute edges for the small subset
      const edges: VLGraphEdge[] = [];
      for (let i = 0; i < subset.length; i++) {
        for (let j = i + 1; j < subset.length; j++) {
          const vl = voiceLeading(subset[i].pcSet, subset[j].pcSet, edo);
          if (vl.totalL1 <= maxDist) edges.push({ from: i, to: j, vl });
        }
      }
      return { nodes, edges };
    }
    return buildVLGraph(chordSize, edo, maxDist);
  }, [chordSize, edo, maxDist]);

  const tooMany = useMemo(() => {
    // Quick count without full generation: compositions of edo into n parts ≥ 1
    // = C(edo-1, n-1). If this exceeds MAX_TYPES, we know it's too many.
    let count = 1;
    for (let i = 1; i < chordSize; i++) count = count * (edo - i) / i;
    return Math.round(count / chordSize) > MAX_TYPES; // rough dedup by rotation
  }, [chordSize, edo]);

  const namedChords = useMemo(
    () => graph.nodes.filter((n) => isNamed(n.chord)),
    [graph],
  );

  // ── Bounding box of actual node positions (2D) ────────────────────
  const bounds = useMemo(() => {
    if (graph.nodes.length === 0) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const n of graph.nodes) {
      if (n.x < xMin) xMin = n.x;
      if (n.x > xMax) xMax = n.x;
      if (n.y < yMin) yMin = n.y;
      if (n.y > yMax) yMax = n.y;
    }
    return { xMin, xMax, yMin, yMax };
  }, [graph]);

  // ── Geodesic ─────────────────────────────────────────────────────
  useEffect(() => {
    if (selected.length === 2) {
      const a = graph.nodes[selected[0]].chord.pcSet;
      const b = graph.nodes[selected[1]].chord.pcSet;
      setGeoFrames(geodesicPath(a, b, edo, 12));
    } else {
      setGeoFrames(null);
    }
    setAnimIdx(-1);
  }, [selected, graph, edo]);

  // Clear selection when parameters change
  useEffect(() => { setSelected([]); }, [edo, chordSize, maxDist]);

  // ── Audio helpers ────────────────────────────────────────────────
  const playChord = useCallback(
    (pcSet: number[]) => {
      audioEngine.init(edo);
      audioEngine.resume();
      const abs = pcSet.map((pc) => pcToAbs(pc, edo));
      audioEngine.playChord(abs, edo, 1.2, 0.6);
    },
    [edo],
  );

  const playGeodesic = useCallback(() => {
    if (!geoFrames) return;
    audioEngine.init(edo);
    audioEngine.resume();
    const frames = geoFrames.map((f) =>
      f.pitches.map((p) => Math.round(p)),
    );
    audioEngine.playSequence(frames, edo, 500, 0.45, 0.55);

    // Animate highlight
    setAnimIdx(0);
    let i = 0;
    const iv = setInterval(() => {
      i++;
      if (i >= geoFrames.length) {
        clearInterval(iv);
        setAnimIdx(-1);
      } else {
        setAnimIdx(i);
      }
    }, 500);
  }, [geoFrames, edo]);

  // ── Canvas coordinate mapping ────────────────────────────────────
  const coordsForNode = useCallback(
    (node: VLGraphNode, w: number, h: number): [number, number] => {
      const pad = 50;
      if (!is3D) {
        // 2D: fit to bounding box of actual node positions
        const { xMin, xMax, yMin, yMax } = bounds;
        const rangeX = xMax - xMin || 1;
        const rangeY = yMax - yMin || 1;
        const scaleX = (w - pad * 2) / rangeX;
        const scaleY = (h - pad * 2) / rangeY;
        const scale = Math.min(scaleX, scaleY);
        const cx = w / 2;
        const cy = h / 2;
        const x = cx + (node.x - (xMin + xMax) / 2) * scale;
        const y = cy - (node.y - (yMin + yMax) / 2) * scale; // flip y
        return [x, y];
      }
      // 3D orthographic
      const scale = (Math.min(w, h) - pad * 2) * 0.7;
      return project3D(
        [node.x, node.y, node.z], rot.ry, rot.rx,
        w / 2, h / 2, scale,
      );
    },
    [is3D, rot, bounds],
  );

  // ── Draw ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    const { nodes, edges } = graph;

    // Pre-compute screen positions
    const pos = nodes.map((n) => coordsForNode(n, w, h));

    // Edges
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = "#333";
    for (const e of edges) {
      const [x1, y1] = pos[e.from];
      const [x2, y2] = pos[e.to];
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Geodesic path highlight
    if (geoFrames && geoFrames.length > 1) {
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      for (let i = 0; i < geoFrames.length; i++) {
        const f = geoFrames[i];
        const sc = simplexCoords(
          // approximate interval vector from interpolated pitches
          f.pitches.map((_, idx, arr) => {
            const next = arr[(idx + 1) % arr.length];
            return ((next - f.pitches[idx]) + edo) % edo;
          }),
          edo,
        );
        const fakeNode = { x: sc.x, y: sc.y, z: sc.z } as VLGraphNode;
        const [fx, fy] = coordsForNode(fakeNode, w, h);
        if (i === 0) ctx.moveTo(fx, fy);
        else ctx.lineTo(fx, fy);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Animated dot
      if (animIdx >= 0 && animIdx < geoFrames.length) {
        const f = geoFrames[animIdx];
        const sc = simplexCoords(
          f.pitches.map((_, idx, arr) => {
            const next = arr[(idx + 1) % arr.length];
            return ((next - f.pitches[idx]) + edo) % edo;
          }),
          edo,
        );
        const fakeNode = { x: sc.x, y: sc.y, z: sc.z } as VLGraphNode;
        const [ax, ay] = coordsForNode(fakeNode, w, h);
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(ax, ay, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Nodes
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const [x, y] = pos[i];
      const r = nodeRadius(n.chord);
      const isSel = selected.includes(i);
      const isHov = hovered === i;

      ctx.fillStyle = isSel ? "#fff" : nodeColor(n.chord);
      ctx.globalAlpha = isHov ? 1 : isSel ? 1 : 0.75;
      ctx.beginPath();
      ctx.arc(x, y, isSel ? r + 2 : isHov ? r + 1 : r, 0, Math.PI * 2);
      ctx.fill();

      if (isSel) {
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Permanent label for named chords
      if (isNamed(n.chord)) {
        ctx.font = "10px sans-serif";
        ctx.fillStyle = "#999";
        ctx.textAlign = "center";
        ctx.fillText(n.chord.name, x, y + r + 11);
        ctx.textAlign = "start";
      }
    }

    // Hover tooltip — chord name and intervals
    if (hovered !== null && hovered < nodes.length) {
      const n = nodes[hovered];
      const [x, y] = pos[hovered];
      const intervals = n.chord.intervals.join("+");
      const pcs = n.chord.pcSet.join(",");
      const label = `${n.chord.name}  (${intervals})  pcs:{${pcs}}  sym=${n.chord.symmetryOrder}${n.chord.inversionallySymmetric ? " inv-sym" : ""}`;
      ctx.font = "12px monospace";
      const tw = ctx.measureText(label).width;
      const tx = Math.min(x + 10, w - tw - 8);
      const ty = Math.max(y - 14, 16);
      ctx.fillStyle = "#181818";
      ctx.fillRect(tx - 4, ty - 12, tw + 8, 16);
      ctx.fillStyle = "#ccc";
      ctx.fillText(label, tx, ty);
    }
  }, [graph, hovered, selected, geoFrames, animIdx, coordsForNode, is3D, edo]);

  // ── Mouse interaction ────────────────────────────────────────────
  const hitTest = useCallback(
    (mx: number, my: number): number | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const { nodes } = graph;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const [x, y] = coordsForNode(nodes[i], w, h);
        const r = nodeRadius(nodes[i].chord) + 3;
        if ((mx - x) ** 2 + (my - y) ** 2 < r ** 2) return i;
      }
      return null;
    },
    [graph, coordsForNode],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (is3D && dragState) {
        const dx = (e.clientX - rect.left) / rect.width;
        const dy = (e.clientY - rect.top) / rect.height;
        setRot({
          ry: dragState.ry + (dx - 0.5) * Math.PI * 2,
          rx: dragState.rx + (dy - 0.5) * Math.PI * 2,
        });
        return;
      }
      setHovered(hitTest(mx, my));
    },
    [hitTest, is3D, dragState],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (is3D) {
        setDragState({ rx: rot.rx, ry: rot.ry });
      }
      const rect = canvasRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const hit = hitTest(mx, my);
      if (hit !== null) {
        playChord(graph.nodes[hit].chord.pcSet);
        setSelected((prev) => {
          if (prev.includes(hit)) return prev.filter((s) => s !== hit);
          if (prev.length >= 2) return [hit];
          return [...prev, hit];
        });
      }
    },
    [hitTest, is3D, rot, playChord, graph],
  );

  const onMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  // ── Geodesic info ────────────────────────────────────────────────
  const geoVL = useMemo(() => {
    if (selected.length !== 2) return null;
    const a = graph.nodes[selected[0]].chord.pcSet;
    const b = graph.nodes[selected[1]].chord.pcSet;
    return voiceLeading(a, b, edo);
  }, [selected, graph, edo]);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full" style={{ background: BG, color: "#aaa" }}>
      {/* Left sidebar */}
      <div
        className="flex flex-col gap-3 p-3 overflow-y-auto shrink-0"
        style={{ width: 250, borderRight: "1px solid #222" }}
      >
        <h2 className="text-sm font-bold tracking-wide" style={{ color: "#ccc" }}>
          Voice-Leading Orbifold
        </h2>

        {/* Educational description */}
        <div
          className="text-xs leading-relaxed rounded p-2"
          style={{ color: "#777", background: "#111", border: "1px solid #1a1a1a" }}
        >
          <p className="mb-1">
            Every dot is a chord type. Distance between dots = how much
            the voices need to move to get from one chord to another.
          </p>
          <p className="mb-1">
            Close dots = smooth voice leading (e.g. C major &rarr; A minor).
            Far dots = large jumps.
          </p>
          <p className="mb-1">
            <span style={{ color: GOLD }}>Gold dots</span>: maximally symmetric (augmented, diminished)
            <br />
            <span style={{ color: ACCENT }}>Blue dots</span>: named chords (Major, Minor, sus2, etc.)
            <br />
            <span style={{ color: GRAY }}>Gray dots</span>: unnamed chord types
          </p>
          <p>
            Click two chords to see the shortest voice-leading path.
          </p>
        </div>

        {/* EDO */}
        <label className="text-xs" style={{ color: "#666" }}>
          EDO
          <select
            className="ml-2 bg-[#181818] border border-[#333] text-xs px-2 py-1 rounded"
            style={{ color: "#ccc" }}
            value={edo}
            onChange={(e) => setEdo(Number(e.target.value))}
          >
            {EDO_OPTIONS.map((e) => (
              <option key={e} value={e}>{e}-EDO</option>
            ))}
          </select>
        </label>

        {/* Chord size */}
        <label className="text-xs" style={{ color: "#666" }}>
          Chord size
          <select
            className="ml-2 bg-[#181818] border border-[#333] text-xs px-2 py-1 rounded"
            style={{ color: "#ccc" }}
            value={chordSize}
            onChange={(e) => setChordSize(Number(e.target.value))}
          >
            <option value={3}>Trichords (2D)</option>
            <option value={4}>Tetrachords (3D)</option>
          </select>
        </label>

        {/* Max VL distance */}
        <label className="text-xs" style={{ color: "#666" }}>
          Max VL dist: {maxDist}
          <input
            type="range"
            min={1}
            max={6}
            value={maxDist}
            onChange={(e) => setMaxDist(Number(e.target.value))}
            className="w-full mt-1"
          />
        </label>

        {/* Stats */}
        <div className="text-xs" style={{ color: "#555" }}>
          {graph.nodes.length} types, {graph.edges.length} edges
        </div>
        {tooMany && (
          <div className="text-xs rounded p-1.5" style={{ color: "#cc8844", background: "#1a1500", border: "1px solid #332200" }}>
            Large EDO — showing only named/symmetric chord types to avoid freezing.
          </div>
        )}

        {/* Selected chords info */}
        {selected.length > 0 && (
          <div className="text-xs border border-[#222] rounded p-2 flex flex-col gap-1">
            <div style={{ color: "#888" }}>Selected:</div>
            {selected.map((s) => {
              const n = graph.nodes[s];
              return (
                <div key={s} style={{ color: "#ccc" }}>
                  <span style={{ color: nodeColor(n.chord) }}>{n.chord.name}</span>{" "}
                  <span style={{ color: "#555" }}>[{n.chord.intervals.join("-")}]</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Geodesic info */}
        {geoVL && (
          <div className="text-xs border border-[#222] rounded p-2 flex flex-col gap-1">
            <div style={{ color: "#888" }}>Geodesic:</div>
            <div style={{ color: "#ccc" }}>
              L1 = {geoVL.totalL1}, L2 = {geoVL.totalL2.toFixed(2)}, L&#8734; = {geoVL.maxMotion}
            </div>
            <div style={{ color: "#666" }}>
              Motions: [{geoVL.motions.map((m) => (m >= 0 ? "+" : "") + m).join(", ")}]
            </div>
            <button
              className="mt-1 px-2 py-1 rounded text-xs"
              style={{ background: "#222", color: ACCENT, border: `1px solid ${ACCENT}44` }}
              onClick={playGeodesic}
            >
              &#9654; Animate geodesic
            </button>
          </div>
        )}

        {/* Named chords list */}
        <div className="text-xs mt-2" style={{ color: "#666" }}>
          Named chords ({namedChords.length})
        </div>
        <div className="flex flex-col gap-0.5 text-xs overflow-y-auto" style={{ maxHeight: 200 }}>
          {namedChords.map((n) => (
            <button
              key={n.id}
              className="text-left px-1 py-0.5 rounded hover:bg-[#1a1a1a]"
              style={{
                color: selected.includes(n.id) ? "#fff" : isMaxSymmetric(n.chord) ? GOLD : ACCENT,
              }}
              onClick={() => {
                playChord(n.chord.pcSet);
                setSelected((prev) => {
                  if (prev.includes(n.id)) return prev.filter((s) => s !== n.id);
                  if (prev.length >= 2) return [n.id];
                  return [...prev, n.id];
                });
              }}
            >
              {n.chord.name}{" "}
              <span style={{ color: "#444" }}>[{n.chord.intervals.join("-")}]</span>
              {n.chord.symmetryOrder > 1 && (
                <span style={{ color: GOLD }}> &times;{n.chord.symmetryOrder}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair"
          onMouseMove={onMouseMove}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={() => { setHovered(null); setDragState(null); }}
        />
        {is3D && (
          <div
            className="absolute bottom-2 right-2 text-xs px-2 py-1 rounded"
            style={{ background: "#181818", color: "#555" }}
          >
            Drag to rotate
          </div>
        )}
      </div>
    </div>
  );
}
