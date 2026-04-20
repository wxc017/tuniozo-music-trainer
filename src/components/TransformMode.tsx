import { useState, useMemo, useCallback } from "react";
import {
  TransformPattern,
  TransformDef,
  TransformFamily,
  FAMILY_LABELS,
  ALL_TRANSFORMS,
  getTransformsByFamily,
  MetricAnnotation,
  NoteType,
} from "@/lib/transformData";
import { VexDrumStrip, StripMeasureData } from "@/components/VexDrumNotation";

const COLOR = "#c090e0"; // transform purple

const FAMILY_ORDER: TransformFamily[] = ["shift", "mirror", "metric", "density", "voicing", "phrase"];
const FAMILY_COLORS: Record<TransformFamily, string> = {
  shift: "#e0a040",
  mirror: "#60b0e0",
  metric: "#e06060",
  density: "#7aaa7a",
  voicing: "#c8aa50",
  phrase: "#9999ee",
};

// ── Pattern → StripMeasureData conversion ────────────────────────────────────

const TUPLET_BEAT_SIZES = new Set([3, 5, 6, 7]);

function patternToStrip(p: TransformPattern): StripMeasureData[] {
  const beatSize = p.beatSize;
  const tupletNum = TUPLET_BEAT_SIZES.has(beatSize) ? beatSize : undefined;
  const result: StripMeasureData[] = [];
  for (let b = 0; b < 4; b++) {
    const lo = b * beatSize;
    const hi = lo + beatSize;
    const filter = (arr: number[]) => arr.filter(i => i >= lo && i < hi).map(i => i - lo);
    result.push({
      grid: p.grid,
      ostinatoHits: filter(p.cymbalHits),
      ostinatoOpen: filter(p.cymbalOpen),
      snareHits: filter(p.snareHits),
      bassHits: filter(p.bassHits),
      hhFootHits: filter(p.hhFootHits),
      hhFootOpen: [],
      ghostHits: filter(p.ghostHits),
      ghostDoubleHits: [],
      tomHits: filter(p.tomHits),
      crashHits: filter(p.crashHits),
      accentFlags: p.accentFlags.slice(lo, hi),
      stickings: p.stickings.slice(lo, hi),
      showRests: true,
      tupletNum,
    });
  }
  return result;
}

// ── Pattern dot visualization ────────────────────────────────────────────────

function PatternDots({ p, label }: { p: TransformPattern; label: string }) {
  const voices: { key: string; hits: number[]; color: string; short: string }[] = [
    { key: "cymbal", hits: p.cymbalHits, color: "#c8aa50", short: "C" },
    { key: "snare", hits: p.snareHits, color: "#9999ee", short: "S" },
    { key: "bass", hits: p.bassHits, color: "#e06060", short: "B" },
    { key: "hhFoot", hits: p.hhFootHits, color: "#7aaa7a", short: "H" },
    { key: "ghost", hits: p.ghostHits, color: "#666", short: "G" },
  ].filter(v => v.hits.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 7, color: "#333", letterSpacing: 2, textTransform: "uppercase", fontWeight: 700 }}>{label}</span>
      {voices.map(v => (
        <div key={v.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 7, color: v.color, fontWeight: 700, width: 10 }}>{v.short}</span>
          <div style={{ display: "flex", gap: 1.5 }}>
            {Array.from({ length: p.totalSlots }, (_, i) => {
              const hit = new Set(v.hits).has(i);
              const isBeat = i % p.beatSize === 0;
              return (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: hit ? v.color : "transparent",
                  border: `1px solid ${hit ? v.color : isBeat ? "#333" : "#1a1a1a"}`,
                  marginLeft: isBeat && i > 0 ? 3 : 0,
                }} />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── NotationPreview ──────────────────────────────────────────────────────────

// ── SVG metric modulation notation ───────────────────────────────────────────

/** Draw a notehead + stem + flag(s) + optional dot at (cx, baseY) */
function notePath(cx: number, baseY: number, noteType: NoteType): string {
  const stemH = 22;
  const stemTop = baseY - stemH;
  const stemX = cx + 5;
  // Notehead ellipse approximated as a path
  let d = `M${cx - 4},${baseY} a5,3.5 -15 1,1 8,0 a5,3.5 -15 1,1 -8,0`;
  // Stem
  d += ` M${stemX},${baseY - 1} L${stemX},${stemTop}`;
  // Flags
  if (noteType === "eighth" || noteType === "dotted-eighth") {
    d += ` M${stemX},${stemTop} c1,4 6,8 3,14`;
  }
  if (noteType === "sixteenth") {
    d += ` M${stemX},${stemTop} c1,4 6,7 3,12`;
    d += ` M${stemX},${stemTop + 5} c1,4 6,7 3,12`;
  }
  return d;
}

function MetricModVexflow({ annotation }: { annotation: MetricAnnotation }) {
  const W = 90;
  const H = 38;
  const noteY = 28; // baseline for noteheads
  const color = "#ddd";

  // Layout positions
  const leftX = 8;
  const eqX = 30;
  const rightX = 52;

  const leftDotted = annotation.leftNote === "dotted-quarter" || annotation.leftNote === "dotted-eighth";
  const rightDotted = annotation.rightNote === "dotted-quarter" || annotation.rightNote === "dotted-eighth";

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      {/* Left note */}
      <path d={notePath(leftX, noteY, annotation.leftNote)} fill={color} stroke={color} strokeWidth={1} />
      {leftDotted && <circle cx={leftX + 10} cy={noteY} r={1.5} fill={color} />}

      {/* Equals sign */}
      <line x1={eqX - 3} y1={noteY - 10} x2={eqX + 7} y2={noteY - 10} stroke={color} strokeWidth={1.5} />
      <line x1={eqX - 3} y1={noteY - 6} x2={eqX + 7} y2={noteY - 6} stroke={color} strokeWidth={1.5} />

      {/* Right note */}
      <path d={notePath(rightX, noteY, annotation.rightNote)} fill={color} stroke={color} strokeWidth={1} />
      {rightDotted && <circle cx={rightX + 10} cy={noteY} r={1.5} fill={color} />}

      {/* Tuplet bracket over right note */}
      {annotation.rightTuplet && (() => {
        const bL = rightX - 4;
        const bR = rightX + 14;
        const bY = 3;
        const mid = (bL + bR) / 2;
        const numW = annotation.rightTuplet >= 10 ? 7 : 4;
        return (
          <g>
            <line x1={bL} y1={bY + 4} x2={bL} y2={bY} stroke={color} strokeWidth={0.8} />
            <line x1={bL} y1={bY} x2={mid - numW - 1} y2={bY} stroke={color} strokeWidth={0.8} />
            <line x1={mid + numW + 1} y1={bY} x2={bR} y2={bY} stroke={color} strokeWidth={0.8} />
            <line x1={bR} y1={bY + 4} x2={bR} y2={bY} stroke={color} strokeWidth={0.8} />
            <text x={mid} y={bY + 4.5} textAnchor="middle" fontSize={9} fontWeight={700}
              fill={color} fontFamily="serif">{annotation.rightTuplet}</text>
          </g>
        );
      })()}
    </svg>
  );
}

function NotationPreview({ pattern }: { pattern: TransformPattern }) {
  const stripData = useMemo(() => patternToStrip(pattern), [pattern]);
  return (
    <div style={{
      background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 6,
      overflow: "hidden", flexShrink: 0, padding: "4px 0",
      position: "relative",
    }}>
      {pattern.metricAnnotation && (
        <div style={{
          position: "absolute", top: 2, left: 44, zIndex: 1, lineHeight: 0,
        }}>
          <MetricModVexflow annotation={pattern.metricAnnotation} />
        </div>
      )}
      <VexDrumStrip
        measures={stripData}
        measureWidth={Math.max(80, Math.min(160, 600 / 4))}
        height={170}
        staveY={pattern.metricAnnotation ? 50 : 40}
      />
    </div>
  );
}

// ── Transform parameter controls ─────────────────────────────────────────────

function ParamControls({ transform, params, onChange }: {
  transform: TransformDef;
  params: Record<string, any>;
  onChange: (key: string, value: any) => void;
}) {
  if (transform.params.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {transform.params.map(pd => (
        <div key={pd.key} style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <label style={{ fontSize: 8, color: "#555" }}>{pd.label}</label>
          {pd.type === "select" && pd.options ? (
            <select
              value={params[pd.key] ?? pd.default}
              onChange={e => onChange(pd.key, e.target.value)}
              style={{
                background: "#141414", border: "1px solid #333", borderRadius: 3,
                padding: "2px 4px", fontSize: 9, color: "#ccc", outline: "none",
              }}
            >
              {pd.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : pd.type === "number" ? (
            <input
              type="number"
              value={params[pd.key] ?? pd.default}
              min={pd.min} max={pd.max} step={pd.step ?? 1}
              onChange={e => onChange(pd.key, parseInt(e.target.value) || 0)}
              style={{
                background: "#141414", border: "1px solid #333", borderRadius: 3,
                padding: "2px 4px", fontSize: 9, color: "#ccc", outline: "none",
                width: 50,
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

// ── Main TransformMode component ─────────────────────────────────────────────

export default function TransformMode({
  source,
  sourceTab,
  onAddLine,
}: {
  source: TransformPattern[];
  sourceTab: string;
  onAddLine: (patterns: TransformPattern[]) => void;
}) {
  const [selectedTransformId, setSelectedTransformId] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, any>>({});
  const [preview, setPreview] = useState<TransformPattern[] | null>(null);

  const byFamily = useMemo(() => getTransformsByFamily(), []);

  const sourcePattern = source.length > 0 ? source[0] : null;

  const handleSelectTransform = useCallback((t: TransformDef) => {
    setSelectedTransformId(t.id);
    // Initialize params with defaults
    const defaults: Record<string, any> = {};
    for (const pd of t.params) defaults[pd.key] = pd.default;
    setParams(defaults);
    // Auto-apply
    if (sourcePattern) {
      try {
        const result = t.apply(sourcePattern, defaults);
        setPreview(result);
      } catch { setPreview(null); }
    }
  }, [sourcePattern]);

  const handleParamChange = useCallback((key: string, value: any) => {
    const newParams = { ...params, [key]: value };
    setParams(newParams);
    // Re-apply with new params
    const t = ALL_TRANSFORMS.find(t => t.id === selectedTransformId);
    if (t && sourcePattern) {
      try {
        const result = t.apply(sourcePattern, newParams);
        setPreview(result);
      } catch { setPreview(null); }
    }
  }, [params, selectedTransformId, sourcePattern]);

  const handleAddLine = useCallback(() => {
    if (preview && preview.length > 0) {
      onAddLine(preview);
    }
  }, [preview, onAddLine]);

  const selectedTransform = ALL_TRANSFORMS.find(t => t.id === selectedTransformId);

  if (!sourcePattern) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: 200, color: "#333", fontSize: 11,
      }}>
        Import a pattern from any tab to begin transforming
      </div>
    );
  }

  const tabLabel = sourceTab === "ostinato" ? "Ostinato" : sourceTab === "accent" ? "Accent" :
    sourceTab === "stickings" ? "Stickings" : sourceTab === "independence" ? "Independence" : sourceTab;

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      background: "#0c0c0c", overflow: "hidden", flex: 1, minHeight: 0,
    }}>
      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px", borderBottom: "1px solid #181818", flexShrink: 0,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 4,
          color: COLOR, textTransform: "uppercase",
        }}>
          Transform
        </span>
        <span style={{ fontSize: 9, color: "#555" }}>
          from {tabLabel} · {sourcePattern.grid} · {sourcePattern.totalSlots} slots
        </span>
        {source.length > 1 && (
          <span style={{ fontSize: 9, color: "#444" }}>({source.length} measures — using first)</span>
        )}
      </div>

      {/* Main content */}
      <div style={{
        flex: 1, minHeight: 0, display: "flex", gap: 8,
        padding: "8px 12px", overflow: "hidden",
      }}>
        {/* Left: source, transforms, preview */}
        <div style={{
          flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
          gap: 6, overflow: "auto",
        }}>
          {/* Source */}
          <PatternDots p={sourcePattern} label="Source" />
          <NotationPreview pattern={sourcePattern} />

          {/* Quick transforms */}
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {[
              { id: "rotate", label: "Rotate +1", quick: { slots: 1 } },
              { id: "rotate", label: "Rotate -1", quick: { slots: -1 } },
              { id: "rotate", label: "Rotate +beat", quick: { slots: sourcePattern.beatSize } },
              { id: "retrograde", label: "Retrograde", quick: { scope: "measure" } },
              { id: "mirror-beat", label: "Mirror/beat", quick: {} },
              { id: "accent-inv", label: "Accent inv.", quick: {} },
              { id: "limb-remap", label: "Swap S↔B", quick: { from: "snare", to: "bass" } },
            ].map((q, i) => (
              <button
                key={i}
                onClick={() => {
                  const t = ALL_TRANSFORMS.find(t => t.id === q.id);
                  if (t && sourcePattern) {
                    setSelectedTransformId(q.id);
                    setParams(q.quick);
                    try {
                      setPreview(t.apply(sourcePattern, q.quick));
                    } catch { setPreview(null); }
                  }
                }}
                style={{
                  padding: "3px 7px", borderRadius: 3, fontSize: 8, fontWeight: 600,
                  cursor: "pointer",
                  border: `1px solid ${COLOR}44`,
                  background: COLOR + "11",
                  color: COLOR,
                }}
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Transform families */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {FAMILY_ORDER.map(family => {
              const transforms = byFamily[family];
              const familyColor = FAMILY_COLORS[family];
              return (
                <div key={family}>
                  <div style={{
                    fontSize: 7, color: familyColor, letterSpacing: 3,
                    textTransform: "uppercase", fontWeight: 700, padding: "4px 0 2px",
                  }}>
                    {FAMILY_LABELS[family]}
                  </div>
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {transforms.map(t => {
                      const isSelected = selectedTransformId === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => handleSelectTransform(t)}
                          title={t.description}
                          style={{
                            padding: "3px 8px", borderRadius: 3, fontSize: 8, fontWeight: 600,
                            cursor: "pointer",
                            border: `1px solid ${isSelected ? familyColor + "88" : "#1a1a1a"}`,
                            background: isSelected ? familyColor + "22" : "#0e0e0e",
                            color: isSelected ? familyColor : "#444",
                          }}
                        >
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected transform params */}
          {selectedTransform && selectedTransform.params.length > 0 && (
            <div style={{
              padding: "6px 8px", background: "#0a0a0a", borderRadius: 4,
              border: "1px solid #1a1a1a",
            }}>
              <div style={{ fontSize: 8, color: "#555", marginBottom: 4 }}>
                {selectedTransform.name}: {selectedTransform.description}
              </div>
              <ParamControls transform={selectedTransform} params={params} onChange={handleParamChange} />
            </div>
          )}

          {/* Preview */}
          {preview && preview.length > 0 && (
            <>
              <PatternDots p={preview[0]} label={`Result${preview.length > 1 ? ` (${preview.length} measures)` : ""}`} />
              {preview.map((pp, i) => (
                <NotationPreview key={i} pattern={pp} />
              ))}
            </>
          )}
        </div>

        {/* Right: action column */}
        <div style={{
          width: 108, flexShrink: 0, display: "flex",
          flexDirection: "column", gap: 5, paddingTop: 26,
        }}>
          <button
            onClick={handleAddLine}
            disabled={!preview || preview.length === 0}
            style={{
              width: "100%", padding: "8px 0", borderRadius: 5,
              border: `1px solid ${preview ? COLOR + "88" : "#1a1a1a"}`,
              background: preview ? COLOR + "15" : "transparent",
              color: preview ? COLOR : "#333",
              fontSize: 9, fontWeight: 600,
              cursor: preview ? "pointer" : "not-allowed",
            }}
          >
            + Line to {tabLabel}
          </button>
          {preview && preview.length > 1 && (
            <div style={{ fontSize: 8, color: "#555", textAlign: "center" }}>
              {preview.length} measures will be added
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
