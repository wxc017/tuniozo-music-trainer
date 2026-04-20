import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  IndependenceGrid,
  IndependenceMeasureData,
  VoiceConfig,
  INDEPENDENCE_GRID_LABELS,
  generateIndependenceMeasure,
  loadIndependenceLog,
  deleteIndependenceExercise,
  IndependenceExercise,
  type AestheticMode,
} from "@/lib/independenceData";
import { GRID_SUBDIVS, RATING_LABELS } from "@/lib/drumData";
import { VexDrumStrip, StripMeasureData } from "@/components/VexDrumNotation";

// ── Constants ────────────────────────────────────────────────────────────────

const STRIP_BEAT_W = 150;
const STRIP_MEASURE_H = 165;
const STRIP_CLEF_EXTRA = 36;

const COLOR = "#50b080";
const RATING_COLORS = ["", "#555", "#e06060", "#e0a040", "#7aaa7a", "#7173e6"];

const VOICE_DEFS = [
  { key: "cymbal" as const, label: "Cymbal", short: "C", color: "#c8aa50" },
  { key: "snare"  as const, label: "Snare",  short: "S", color: "#9999ee" },
  { key: "bass"   as const, label: "Bass",   short: "B", color: "#e06060" },
  { key: "hhFoot" as const, label: "HH Foot", short: "H", color: "#7aaa7a" },
] as const;

type VoiceKey = typeof VOICE_DEFS[number]["key"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function toPerBeatStrip(m: IndependenceMeasureData): StripMeasureData[] {
  const beatSize = GRID_SUBDIVS[m.grid] / 4;
  const result: StripMeasureData[] = [];
  for (let b = 0; b < 4; b++) {
    const lo = b * beatSize;
    const hi = lo + beatSize;
    result.push({
      grid: m.grid,
      ostinatoHits: m.cymbalHits.filter(i => i >= lo && i < hi).map(i => i - lo),
      ostinatoOpen: m.cymbalOpen.filter(i => i >= lo && i < hi).map(i => i - lo),
      snareHits: m.snareHits.filter(i => i >= lo && i < hi).map(i => i - lo),
      bassHits: m.bassHits.filter(i => i >= lo && i < hi).map(i => i - lo),
      hhFootHits: m.hhFootHits.filter(i => i >= lo && i < hi).map(i => i - lo),
      hhFootOpen: [],
      ghostHits: m.ghostHits.filter(i => i >= lo && i < hi).map(i => i - lo),
      ghostDoubleHits: [],
      accentFlags: m.snareAccents.slice(lo, hi),
      stickings: [],
      showRests: true,
    });
  }
  return result;
}

// ── VoiceRow ─────────────────────────────────────────────────────────────────

function VoiceRow({
  label, shortLabel, color, config, onConfigChange, grid, onToggleLock,
}: {
  label: string;
  shortLabel: string;
  color: string;
  config: VoiceConfig;
  onConfigChange: (c: VoiceConfig) => void;
  grid: IndependenceGrid;
  onToggleLock: () => void;
}) {
  const beatSize = GRID_SUBDIVS[grid] / 4;
  const maxFamily = beatSize;
  const families = Array.from({ length: maxFamily }, (_, i) => i + 1);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "4px 10px", borderBottom: "1px solid #181818",
      opacity: config.enabled ? 1 : 0.35,
    }}>
      <button
        onClick={() => onConfigChange({ ...config, enabled: !config.enabled })}
        style={{
          width: 54, flexShrink: 0,
          background: "none", border: "none", cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "flex-start", padding: 0,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: config.enabled ? color : "#333", letterSpacing: 1 }}>
          {shortLabel}
        </span>
        <span style={{ fontSize: 7, color: "#3a3a3a" }}>{label}</span>
      </button>

      <div style={{ display: "flex", gap: 2 }}>
        {families.map(f => {
          const active = config.allowedFamilies.includes(f);
          return (
            <button
              key={f}
              onClick={() => {
                if (!config.enabled) return;
                const next = active
                  ? config.allowedFamilies.filter(x => x !== f)
                  : [...config.allowedFamilies, f].sort((a, b) => a - b);
                if (next.length > 0) onConfigChange({ ...config, allowedFamilies: next });
              }}
              style={{
                width: 22, height: 22, borderRadius: 3,
                fontSize: 9, fontWeight: 700,
                border: `1px solid ${active && config.enabled ? color + "88" : "#1a1a1a"}`,
                background: active && config.enabled ? color + "22" : "#0e0e0e",
                color: active && config.enabled ? color : "#333",
                cursor: config.enabled ? "pointer" : "default",
              }}
            >
              {f}
            </button>
          );
        })}
      </div>

      <button
        onClick={onToggleLock}
        title={config.locked ? "Unlock (regenerate with others)" : "Lock (keep pattern)"}
        style={{
          marginLeft: "auto",
          width: 24, height: 22, borderRadius: 3,
          fontSize: 9, fontWeight: 700,
          border: `1px solid ${config.locked ? "#e0a04088" : "#1a1a1a"}`,
          background: config.locked ? "#e0a04022" : "#0e0e0e",
          color: config.locked ? "#e0a040" : "#333",
          cursor: "pointer",
        }}
      >
        {config.locked ? "\u{1F512}" : "\u{1F513}"}
      </button>
    </div>
  );
}

// ── PatternDotViz ────────────────────────────────────────────────────────────

function PatternDotViz({ hits, totalSlots, beatSize, color, permId }: {
  hits: number[];
  totalSlots: number;
  beatSize: number;
  color: string;
  permId?: string;
}) {
  const hitSet = new Set(hits);
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
      {Array.from({ length: totalSlots }, (_, i) => {
        const isHit = hitSet.has(i);
        const isBeat = i % beatSize === 0;
        return (
          <div
            key={i}
            style={{
              width: 8, height: 8, borderRadius: "50%",
              background: isHit ? color : "transparent",
              border: `1px solid ${isHit ? color : isBeat ? "#333" : "#1a1a1a"}`,
              marginLeft: isBeat && i > 0 ? 4 : 0,
            }}
          />
        );
      })}
      {permId && <span style={{ fontSize: 7, color: "#333", fontFamily: "monospace", marginLeft: 4 }}>{permId}</span>}
    </div>
  );
}

// ── IndependenceStrip ────────────────────────────────────────────────────────

function IndependenceStripInner({
  measures, selectedIdx, onSelect, onDelete, lineRatings, onLineRatingChange,
}: {
  measures: IndependenceMeasureData[];
  selectedIdx: number | null;
  onSelect: (i: number) => void;
  onDelete: () => void;
  lineRatings: Record<number, number>;
  onLineRatingChange: (lineIdx: number, rating: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (measures.length === 0) return null;

  const lines: { measure: IndependenceMeasureData; globalIdx: number }[][] = [[]];
  for (let i = 0; i < measures.length; i++) {
    if (measures[i].lineBreak && lines[lines.length - 1].length > 0) lines.push([]);
    lines[lines.length - 1].push({ measure: measures[i], globalIdx: i });
  }

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: 2, width: "100%" }}>
      {lines.map((line, lineIdx) => {
        const lineBeatData: StripMeasureData[] = [];
        const lineLayouts: { x: number; w: number; globalIdx: number }[] = [];
        let beatCursor = 0;
        const totalBeatsInLine = line.length * 4;

        const STAR_AREA = 60;
        const availW = containerW > 0 ? containerW - STRIP_CLEF_EXTRA - STAR_AREA : 0;
        const beatW = containerW > 0
          ? Math.min(STRIP_BEAT_W, Math.max(40, Math.floor(availW / totalBeatsInLine)))
          : STRIP_BEAT_W;

        for (let j = 0; j < line.length; j++) {
          const { measure: m, globalIdx } = line[j];
          const x = j === 0 ? 0 : STRIP_CLEF_EXTRA + beatCursor * beatW;
          const w = j === 0 ? 4 * beatW + STRIP_CLEF_EXTRA : 4 * beatW;
          lineLayouts.push({ x, w, globalIdx });
          lineBeatData.push(...toPerBeatStrip(m));
          beatCursor += 4;
        }

        const totalW = STRIP_CLEF_EXTRA + beatCursor * beatW;
        const r = lineRatings[lineIdx] ?? 0;

        return (
          <div key={lineIdx} style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, width: "100%" }}>
            <div style={{ position: "relative", height: STRIP_MEASURE_H, width: totalW, flexShrink: 0 }}>
              <VexDrumStrip measures={lineBeatData} measureWidth={beatW} height={STRIP_MEASURE_H} />
              {lineLayouts.map(({ x, w, globalIdx }) => {
                const isSel = selectedIdx === globalIdx;
                return (
                  <div key={globalIdx} onClick={() => onSelect(globalIdx)} style={{
                    position: "absolute", top: 0, left: x, width: w,
                    height: STRIP_MEASURE_H, cursor: "pointer",
                    border: isSel ? `1.5px solid ${COLOR}` : "1.5px solid transparent",
                    borderRadius: 4, boxSizing: "border-box",
                  }}>
                    {isSel && (
                      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{
                        position: "absolute", top: 4, right: 4,
                        width: 16, height: 16, borderRadius: "50%",
                        background: "#3a1a1a", border: "1px solid #6a3a3a",
                        color: "#e06060", fontSize: 9, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>x</button>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 0, flexShrink: 0 }}>
              {[1, 2, 3, 4, 5].map(star => (
                <button key={star}
                  onClick={() => onLineRatingChange(lineIdx, r === star ? 0 : star)}
                  title={["", "Hard", "Tough", "OK", "Good", "Easy"][star]}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 14, padding: "0 1px", lineHeight: 1,
                    color: star <= r ? RATING_COLORS[r] : "#1a1a1a",
                  }}
                >*</button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Exported Strip ───────────────────────────────────────────────────────────

export interface IndependenceStudyStripProps {
  measures: IndependenceMeasureData[];
  grid: IndependenceGrid;
  selectedIdx: number | null;
  onSelect: (i: number) => void;
  onDelete: () => void;
  onClearAll: () => void;
  onLog?: (entries: { rating: number; measures: IndependenceMeasureData[]; lineIdx: number }[], tag?: string) => void;
}

export function IndependenceStudyStrip({
  measures, grid, selectedIdx, onSelect, onDelete, onClearAll, onLog,
}: IndependenceStudyStripProps) {
  const [lineRatings, setLineRatings] = useState<Record<number, number>>({});
  const [flash, setFlash] = useState("");
  const [tag, setTag] = useState<"isolation" | "context">("isolation");

  const handleLineRatingChange = useCallback((lineIdx: number, rating: number) => {
    setLineRatings(prev => ({ ...prev, [lineIdx]: rating }));
  }, []);

  const lines = useMemo(() => {
    const result: IndependenceMeasureData[][] = [[]];
    for (const m of measures) {
      if (m.lineBreak && result[result.length - 1].length > 0) result.push([]);
      result[result.length - 1].push(m);
    }
    return result;
  }, [measures]);

  const handleLog = useCallback(() => {
    const entries: { rating: number; measures: IndependenceMeasureData[]; lineIdx: number }[] = [];
    for (const [lineStr, rating] of Object.entries(lineRatings)) {
      if (rating <= 0) continue;
      const lineIdx = parseInt(lineStr, 10);
      if (isNaN(lineIdx) || !lines[lineIdx]) continue;
      entries.push({ rating, measures: lines[lineIdx], lineIdx });
    }
    if (entries.length === 0) return;
    onLog?.(entries, tag);
    setFlash(`Logged ${entries.length}!`);
    setTimeout(() => setFlash(""), 2000);
  }, [lineRatings, lines, onLog, tag]);

  const ratedCount = Object.values(lineRatings).filter(r => r > 0).length;

  return (
    <div style={{ flexShrink: 0, borderTop: "1px solid #181818" }}>
      <div style={{ padding: "4px 12px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 9, color: COLOR, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" }}>
            Independence {measures.length > 0 && `(${measures.length})`}
          </span>
          {measures.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <select
                value={tag}
                onChange={e => setTag(e.target.value as "isolation" | "context")}
                style={{
                  background: "#141414",
                  border: `1px solid ${tag === "isolation" ? "#e0a040" : "#7aaa7a"}44`,
                  borderRadius: 4, padding: "2px 6px", fontSize: 9,
                  color: tag === "isolation" ? "#e0a040" : "#7aaa7a",
                  outline: "none", fontWeight: 600, cursor: "pointer",
                }}
              >
                <option value="isolation">Isolation</option>
                <option value="context">Context</option>
              </select>
              <button onClick={handleLog} disabled={ratedCount === 0} style={{
                padding: "2px 8px", background: "#0e1a0e",
                border: "1px solid #2a5a2a", color: ratedCount > 0 ? "#5a9a5a" : "#2a3a2a",
                borderRadius: 4, fontSize: 9, fontWeight: 600,
                cursor: ratedCount === 0 ? "default" : "pointer", letterSpacing: 1,
              }}>
                {ratedCount > 0 ? `+ LOG (${ratedCount})` : "+ LOG"}
              </button>
              {flash && <span style={{ fontSize: 8, color: "#7aaa7a", letterSpacing: 1 }}>{flash}</span>}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {measures.length === 0 && <span style={{ fontSize: 9, color: "#2a2a2a" }}>Generate an independence pattern below</span>}
          {measures.length > 0 && (
            <button onClick={onClearAll} style={{ fontSize: 9, color: "#3a3a3a", background: "none", border: "none", cursor: "pointer" }}>Clear all</button>
          )}
        </div>
      </div>
      <div style={{ overflowX: "auto", display: "flex", justifyContent: "center", padding: "6px 16px 10px", minHeight: STRIP_MEASURE_H + 20, alignItems: "flex-start" }}>
        {measures.length > 0 ? (
          <IndependenceStripInner
            measures={measures} selectedIdx={selectedIdx}
            onSelect={onSelect} onDelete={onDelete}
            lineRatings={lineRatings} onLineRatingChange={handleLineRatingChange}
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", fontSize: 10, color: "#1e1e1e" }}>
            No independence measures yet
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function IndependenceStudy({
  independenceMeasures,
  setIndependenceMeasures,
  independenceGrid,
  setIndependenceGrid,
  independenceSelectedIdx,
  setIndependenceSelectedIdx,
}: {
  independenceMeasures: IndependenceMeasureData[];
  setIndependenceMeasures: React.Dispatch<React.SetStateAction<IndependenceMeasureData[]>>;
  independenceGrid: IndependenceGrid;
  setIndependenceGrid: (g: IndependenceGrid) => void;
  independenceSelectedIdx: number | null;
  setIndependenceSelectedIdx: (i: number | null) => void;
}) {
  // Voice configs — user controls which families each limb draws from
  const [cymbalConfig, setCymbalConfig] = useState<VoiceConfig>({
    enabled: true, allowedFamilies: [2], locked: false,
  });
  const [snareConfig, setSnareConfig] = useState<VoiceConfig>({
    enabled: true, allowedFamilies: [1, 2], locked: false,
  });
  const [bassConfig, setBassConfig] = useState<VoiceConfig>({
    enabled: true, allowedFamilies: [1, 2], locked: false,
  });
  const [hhFootConfig, setHhFootConfig] = useState<VoiceConfig>({
    enabled: false, allowedFamilies: [1], locked: false,
  });

  const voiceConfigs = useMemo(() => ({
    cymbal: cymbalConfig,
    snare: snareConfig,
    bass: bassConfig,
    hhFoot: hhFootConfig,
  }), [cymbalConfig, snareConfig, bassConfig, hhFootConfig]);

  const [preview, setPreview] = useState<IndependenceMeasureData | null>(null);
  const [patternMode, setPatternMode] = useState<AestheticMode>("musical");

  const handleGenerate = useCallback(() => {
    const lockedData: Partial<IndependenceMeasureData> = {};
    if (preview) {
      if (cymbalConfig.locked) {
        lockedData.cymbalHits = preview.cymbalHits;
        lockedData.cymbalPermIds = preview.cymbalPermIds;
      }
      if (snareConfig.locked) {
        lockedData.snareHits = preview.snareHits;
        lockedData.snarePermIds = preview.snarePermIds;
      }
      if (bassConfig.locked) {
        lockedData.bassHits = preview.bassHits;
        lockedData.bassPermIds = preview.bassPermIds;
      }
      if (hhFootConfig.locked) {
        lockedData.hhFootHits = preview.hhFootHits;
        lockedData.hhFootPermIds = preview.hhFootPermIds;
      }
    }
    const m = generateIndependenceMeasure(
      independenceGrid, 4, voiceConfigs, patternMode, independenceMeasures, lockedData,
    );
    setPreview(m);
  }, [independenceGrid, voiceConfigs, patternMode, independenceMeasures, preview,
      cymbalConfig.locked, snareConfig.locked, bassConfig.locked, hhFootConfig.locked]);

  // Auto-generate on mount and grid change
  useEffect(() => {
    handleGenerate();
  }, [independenceGrid]);

  const handleAdd = (lineBreak?: boolean) => {
    if (!preview) return;
    const m = { ...preview };
    if (lineBreak) m.lineBreak = true;
    setIndependenceMeasures(prev => [...prev, m]);
    setIndependenceSelectedIdx(null);
    handleGenerate();
  };

  const handleReplace = () => {
    if (independenceSelectedIdx === null || !preview) return;
    setIndependenceMeasures(prev =>
      prev.map((m, i) => (i === independenceSelectedIdx ? { ...preview } : m)),
    );
  };

  const previewStripData = useMemo(() => {
    if (!preview) return [];
    return toPerBeatStrip(preview);
  }, [preview]);

  const totalSlots = GRID_SUBDIVS[independenceGrid];
  const beatSize = totalSlots / 4;

  const configSetters: Record<VoiceKey, React.Dispatch<React.SetStateAction<VoiceConfig>>> = {
    cymbal: setCymbalConfig,
    snare: setSnareConfig,
    bass: setBassConfig,
    hhFoot: setHhFootConfig,
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      background: "#0c0c0c", overflow: "hidden", flex: 1, minHeight: 0,
    }}>
      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        padding: "8px 12px", borderBottom: "1px solid #181818", flexShrink: 0,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 4,
          color: COLOR, textTransform: "uppercase", marginRight: 4,
        }}>
          Independence
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <label style={{ fontSize: 10, color: "#444" }}>Grid</label>
          <select
            value={independenceGrid}
            onChange={e => setIndependenceGrid(e.target.value as IndependenceGrid)}
            style={{
              background: "#141414", border: "1px solid #222", borderRadius: 4,
              padding: "2px 6px", fontSize: 10, color: "#ccc", outline: "none",
            }}
          >
            {(Object.keys(INDEPENDENCE_GRID_LABELS) as IndependenceGrid[]).map(k => (
              <option key={k} value={k}>{INDEPENDENCE_GRID_LABELS[k]}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {(["musical", "awkward", "both"] as AestheticMode[]).map(m => (
            <button
              key={m}
              onClick={() => setPatternMode(m)}
              style={{
                padding: "2px 8px", borderRadius: 3, fontSize: 9, fontWeight: 600,
                cursor: "pointer", textTransform: "capitalize",
                border: `1px solid ${patternMode === m ? COLOR + "88" : "#1a1a1a"}`,
                background: patternMode === m ? COLOR + "22" : "#0e0e0e",
                color: patternMode === m ? COLOR : "#444",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={{
        flex: 1, minHeight: 0, display: "flex", gap: 8,
        padding: "8px 12px", overflow: "hidden",
      }}>
        {/* Left: preview + voice configs */}
        <div style={{
          flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
          gap: 8, overflow: "auto",
        }}>
          {/* Preview */}
          <div style={{
            fontSize: 9, color: "#333", fontWeight: 700,
            letterSpacing: 4, textTransform: "uppercase",
          }}>
            Preview
          </div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            overflowX: "auto",
          }}>
            <div style={{
              background: "#0f0f0f", border: "1px solid #1e1e1e",
              borderRadius: 8, overflow: "hidden", lineHeight: 0,
              flexShrink: 0, padding: "4px 0",
            }}>
              {previewStripData.length > 0 && (
                <VexDrumStrip
                  measures={previewStripData}
                  measureWidth={Math.max(100, Math.min(200, 700 / 4))}
                  height={200}
                  staveY={50}
                />
              )}
            </div>
          </div>

          {/* Pattern dots per voice */}
          {preview && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, padding: "0 4px" }}>
              {VOICE_DEFS.map(v => {
                const hits = v.key === "cymbal" ? preview.cymbalHits
                  : v.key === "snare" ? preview.snareHits
                  : v.key === "bass" ? preview.bassHits
                  : preview.hhFootHits;
                const conf = voiceConfigs[v.key];
                if (!conf.enabled || hits.length === 0) return null;
                const permIds = v.key === "cymbal" ? preview.cymbalPermIds
                  : v.key === "snare" ? preview.snarePermIds
                  : v.key === "bass" ? preview.bassPermIds
                  : preview.hhFootPermIds;
                return (
                  <div key={v.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 8, color: v.color, fontWeight: 700, width: 14 }}>{v.short}</span>
                    <PatternDotViz hits={hits} totalSlots={totalSlots} beatSize={beatSize} color={v.color} permId={permIds} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Voice configuration */}
          <div style={{
            fontSize: 8, color: "#444", letterSpacing: 2,
            textTransform: "uppercase", fontWeight: 700,
          }}>
            Voices
          </div>
          <div style={{
            border: "1px solid #181818", borderRadius: 6,
            background: "#0a0a0a", overflow: "hidden",
          }}>
            {VOICE_DEFS.map(v => {
              const config = voiceConfigs[v.key];
              const setConfig = configSetters[v.key];
              return (
                <VoiceRow
                  key={v.key}
                  label={v.label}
                  shortLabel={v.short}
                  color={v.color}
                  config={config}
                  onConfigChange={setConfig}
                  grid={independenceGrid}
                  onToggleLock={() => setConfig(c => ({ ...c, locked: !c.locked }))}
                />
              );
            })}
          </div>
        </div>

        {/* Right: action column */}
        <div style={{
          width: 108, flexShrink: 0, display: "flex",
          flexDirection: "column", gap: 5, paddingTop: 26,
        }}>
          <div style={{ display: "flex", gap: 4, width: "100%" }}>
            <button
              onClick={() => handleAdd(false)}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 5,
                border: `1px solid ${COLOR}88`, background: COLOR + "15",
                color: COLOR, fontSize: 9, fontWeight: 600, cursor: "pointer",
              }}
              title="Add to current phrase"
            >
              + Phrase
            </button>
            <button
              onClick={() => handleAdd(true)}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 5,
                border: `1px solid ${COLOR}88`, background: COLOR + "15",
                color: COLOR, fontSize: 9, fontWeight: 600, cursor: "pointer",
              }}
              title="Add to a new line"
            >
              + Line
            </button>
          </div>
          <button
            onClick={handleReplace}
            disabled={independenceSelectedIdx === null}
            style={{
              width: "100%", padding: "8px 0", borderRadius: 5,
              fontSize: 10, fontWeight: 500,
              cursor: independenceSelectedIdx !== null ? "pointer" : "not-allowed",
              border: `1px solid ${independenceSelectedIdx !== null ? "#4a3a1a" : "#1a1a1a"}`,
              background: independenceSelectedIdx !== null ? "#1e1a0e" : "transparent",
              color: independenceSelectedIdx !== null ? "#e0a040" : "#333",
            }}
          >
            Replace M{independenceSelectedIdx !== null ? independenceSelectedIdx + 1 : "\u2013"}
          </button>
          <button
            onClick={handleGenerate}
            style={{
              width: "100%", padding: "8px 0", borderRadius: 5,
              border: `1px solid ${COLOR}44`, background: COLOR + "11",
              color: COLOR, fontSize: 10, cursor: "pointer",
            }}
          >
            Generate
          </button>

          {(cymbalConfig.locked || snareConfig.locked || bassConfig.locked || hhFootConfig.locked) && (
            <div style={{
              fontSize: 8, color: "#e0a040", textAlign: "center",
              padding: "4px", background: "#1a1a0e", borderRadius: 4,
              border: "1px solid #3a3a1a",
            }}>
              Locked voices preserved
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
