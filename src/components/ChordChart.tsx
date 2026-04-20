import { useState, useCallback, useEffect, useRef } from "react";
import { lsGet, lsSet } from "@/lib/storage";
import ChordChartNotation from "./ChordChartNotation";
import PracticeLogSaveBar from "./PracticeLogSaveBar";
import ExportDialog from "./ExportDialog";
import { generateChordChartXML } from "@/lib/chordChartMusicXml";

const CHARTS_KEY = "lt_chord_charts";

const BAR_COUNT_OPTIONS = [1, 2, 4, 8, 16];

const TIME_SIG_OPTIONS = [
  { label: "4/4", beats: 4 },
  { label: "3/4", beats: 3 },
  { label: "7/8", beats: 7 },
];

const PRESET_LABELS = new Set(TIME_SIG_OPTIONS.map((o) => o.label));

function parseNumerator(label: string): number | null {
  const match = label.match(/^(\d+)/);
  if (match) {
    const n = parseInt(match[1], 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return null;
}

function isCustomTimeSig(label: string): boolean {
  return label === "__custom__" || !PRESET_LABELS.has(label);
}

interface Bar {
  timeSig: string;
  beats: number;
  chords: string[];
}

interface ChordChart {
  title: string;
  bars: Bar[];
}

function makeBar(timeSig = "4/4", beats = 4): Bar {
  return { timeSig, beats, chords: Array(beats).fill("") };
}

function makeBars(count: number): Bar[] {
  return Array.from({ length: count }, () => makeBar());
}

function loadCharts(): Record<string, ChordChart> {
  return lsGet<Record<string, ChordChart>>(CHARTS_KEY, {});
}

function saveChart(title: string, bars: Bar[]): void {
  const charts = loadCharts();
  charts[title] = { title, bars };
  lsSet(CHARTS_KEY, charts);
}

function deleteChart(title: string): void {
  const charts = loadCharts();
  delete charts[title];
  lsSet(CHARTS_KEY, charts);
}

function BarCard({
  bar,
  index,
  onChange,
  onCopyPrevious,
  onApplyToAll,
}: {
  bar: Bar;
  index: number;
  onChange: (updated: Bar) => void;
  onCopyPrevious?: () => void;
  onApplyToAll?: () => void;
}) {
  const isCustom = isCustomTimeSig(bar.timeSig);
  const [customLabel, setCustomLabel] = useState(
    isCustom && bar.timeSig !== "__custom__" ? bar.timeSig : ""
  );
  const [customBeats, setCustomBeats] = useState(
    isCustom && bar.timeSig !== "__custom__" ? String(bar.beats) : ""
  );

  useEffect(() => {
    if (bar.timeSig === "__custom__") {
      setCustomLabel("");
      setCustomBeats((prev) => prev || String(bar.beats));
    } else if (isCustomTimeSig(bar.timeSig)) {
      setCustomLabel(bar.timeSig);
      setCustomBeats(String(bar.beats));
    } else {
      setCustomLabel("");
      setCustomBeats("");
    }
  }, [bar.timeSig, bar.beats]);

  const selectValue = isCustom ? "Custom" : bar.timeSig;

  const handleTimeSigChange = (value: string) => {
    if (value === "Custom") {
      setCustomLabel("");
      setCustomBeats("");
      onChange({ timeSig: "__custom__", beats: bar.beats, chords: [...bar.chords] });
    } else {
      const opt = TIME_SIG_OPTIONS.find((o) => o.label === value);
      if (!opt) return;
      const newChords = Array(opt.beats)
        .fill("")
        .map((_, i) => bar.chords[i] ?? "");
      onChange({ timeSig: opt.label, beats: opt.beats, chords: newChords });
    }
  };

  const applyCustom = () => {
    const label = customLabel.trim() || "__custom__";
    const parsed = parseInt(customBeats, 10);
    const rawBeats = Number.isFinite(parsed) && parsed > 0
      ? parsed
      : parseNumerator(label) ?? bar.beats;
    const beats = Math.max(1, Math.min(32, rawBeats));
    const newChords = Array(beats)
      .fill("")
      .map((_, i) => bar.chords[i] ?? "");
    onChange({ timeSig: label, beats, chords: newChords });
  };

  const handleChordChange = (beatIdx: number, value: string) => {
    const chords = [...bar.chords];
    chords[beatIdx] = value;
    onChange({ ...bar, chords });
  };

  return (
    <div
      style={{
        background: "#111",
        border: "1px solid #222",
        borderRadius: 8,
        padding: "10px 12px",
        minWidth: 120,
        flex: "0 0 auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          gap: 4,
        }}
      >
        <span style={{ fontSize: 9, color: "#444", fontWeight: 700, letterSpacing: 1, flexShrink: 0 }}>
          BAR {index + 1}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
          {onCopyPrevious && (
            <button
              onClick={onCopyPrevious}
              title="Copy time signature from previous bar"
              style={{
                padding: "1px 5px",
                borderRadius: 3,
                fontSize: 9,
                fontWeight: 700,
                border: "1px solid #2a2a2a",
                background: "#161616",
                color: "#666",
                cursor: "pointer",
                lineHeight: 1.4,
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#7173e6";
                (e.currentTarget as HTMLButtonElement).style.color = "#9a9cf8";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#2a2a2a";
                (e.currentTarget as HTMLButtonElement).style.color = "#666";
              }}
            >
              ↑ copy prev
            </button>
          )}
          {onApplyToAll && (
            <button
              onClick={onApplyToAll}
              title="Apply this time signature to all subsequent bars"
              style={{
                padding: "1px 5px",
                borderRadius: 3,
                fontSize: 9,
                fontWeight: 700,
                border: "1px solid #2a2a2a",
                background: "#161616",
                color: "#666",
                cursor: "pointer",
                lineHeight: 1.4,
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#7173e6";
                (e.currentTarget as HTMLButtonElement).style.color = "#9a9cf8";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#2a2a2a";
                (e.currentTarget as HTMLButtonElement).style.color = "#666";
              }}
            >
              → all after
            </button>
          )}
        </div>
        <select
          value={selectValue}
          onChange={(e) => handleTimeSigChange(e.target.value)}
          style={{
            background: "#1a1a1a",
            border: "1px solid #2a2a2a",
            borderRadius: 4,
            padding: "2px 4px",
            fontSize: 10,
            color: "#aaa",
            outline: "none",
            cursor: "pointer",
          }}
        >
          {TIME_SIG_OPTIONS.map((o) => (
            <option key={o.label} value={o.label}>
              {o.label}
            </option>
          ))}
          <option value="Custom">Custom</option>
        </select>
      </div>

      {isCustom && (
        <div style={{ display: "flex", gap: 4, marginBottom: 8, alignItems: "center" }}>
          <input
            type="text"
            placeholder="e.g. 5/8"
            value={customLabel}
            onChange={(e) => {
              const val = e.target.value;
              setCustomLabel(val);
              const num = parseNumerator(val.trim());
              if (num !== null) {
                setCustomBeats(String(num));
              }
            }}
            onBlur={applyCustom}
            onKeyDown={(e) => e.key === "Enter" && applyCustom()}
            style={{
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: 4,
              padding: "2px 4px",
              fontSize: 10,
              color: "#aaa",
              outline: "none",
              width: 52,
            }}
          />
          <input
            type="number"
            min={1}
            max={32}
            placeholder="#"
            value={customBeats}
            onChange={(e) => setCustomBeats(e.target.value)}
            onBlur={applyCustom}
            onKeyDown={(e) => e.key === "Enter" && applyCustom()}
            style={{
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: 4,
              padding: "2px 4px",
              fontSize: 10,
              color: "#aaa",
              outline: "none",
              width: 36,
            }}
          />
        </div>
      )}


      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {Array.from({ length: bar.beats }, (_, b) => (
          <div key={b} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, color: "#333", width: 12, textAlign: "right", flexShrink: 0 }}>
              {b + 1}
            </span>
            <input
              type="text"
              value={bar.chords[b] ?? ""}
              onChange={(e) => handleChordChange(b, e.target.value)}
              placeholder="—"
              style={{
                flex: 1,
                background: bar.chords[b] ? "#1a1a2a" : "#141414",
                border: `1px solid ${bar.chords[b] ? "#3a3a7a" : "#1e1e1e"}`,
                borderRadius: 4,
                padding: "4px 6px",
                fontSize: 13,
                color: bar.chords[b] ? "#ccd" : "#2a2a2a",
                outline: "none",
                fontFamily: "monospace",
                fontWeight: 600,
                width: "100%",
                minWidth: 0,
                transition: "border-color 0.1s, background 0.1s",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#7173e6";
                e.target.style.background = "#1c1c30";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = bar.chords[b] ? "#3a3a7a" : "#1e1e1e";
                e.target.style.background = bar.chords[b] ? "#1a1a2a" : "#141414";
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ChordChart() {
  const [bars, setBars] = useState<Bar[]>(() => makeBars(4));
  const [barCountInput, setBarCountInput] = useState<string>("4");
  const [customCount, setCustomCount] = useState<string>("");
  const [useCustom, setUseCustom] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const notationRef = useRef<HTMLDivElement>(null);

  const [charts, setCharts] = useState<Record<string, ChordChart>>(loadCharts);
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [currentTitle, setCurrentTitle] = useState("");
  const [saveError, setSaveError] = useState("");
  const [logStatus, setLogStatus] = useState<"Working On" | "Finished">("Working On");

  const refreshCharts = useCallback(() => {
    setCharts(loadCharts());
  }, []);

  const handleBarCountChange = (value: string) => {
    setBarCountInput(value);
    setUseCustom(false);
    const n = parseInt(value, 10);
    if (!isNaN(n) && n > 0) {
      setBars((prev) => {
        if (n === prev.length) return prev;
        if (n < prev.length) return prev.slice(0, n);
        return [...prev, ...makeBars(n - prev.length)];
      });
    }
  };

  const handleCustomCountApply = () => {
    const n = parseInt(customCount, 10);
    if (isNaN(n) || n < 1 || n > 64) return;
    setUseCustom(true);
    setBars((prev) => {
      if (n === prev.length) return prev;
      if (n < prev.length) return prev.slice(0, n);
      return [...prev, ...makeBars(n - prev.length)];
    });
  };

  const handleBarChange = useCallback((index: number, updated: Bar) => {
    setBars((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  }, []);

  const handleCopyPrevious = useCallback((index: number) => {
    setBars((prev) => {
      if (index === 0 || index >= prev.length) return prev;
      const prevBar = prev[index - 1];
      const current = prev[index];
      const newChords = Array(prevBar.beats)
        .fill("")
        .map((_, i) => current.chords[i] ?? "");
      const next = [...prev];
      next[index] = { timeSig: prevBar.timeSig, beats: prevBar.beats, chords: newChords };
      return next;
    });
  }, []);

  const handleApplyToSubsequent = useCallback((index: number) => {
    setBars((prev) => {
      if (index >= prev.length - 1) return prev;
      const source = prev[index];
      const next = [...prev];
      for (let i = index + 1; i < next.length; i++) {
        const current = next[i];
        const newChords = Array(source.beats)
          .fill("")
          .map((_, b) => current.chords[b] ?? "");
        next[i] = { timeSig: source.timeSig, beats: source.beats, chords: newChords };
      }
      return next;
    });
  }, []);

  const handleSaveOpen = () => {
    setSaveError("");
    setSavePromptOpen(true);
  };

  const handleSaveConfirm = () => {
    const title = currentTitle.trim();
    if (!title) {
      setSaveError("Please enter a title.");
      return;
    }
    saveChart(title, bars);
    refreshCharts();
    setSavePromptOpen(false);
  };

  const handleLoad = (title: string) => {
    const chart = loadCharts()[title];
    if (!chart) return;
    setBars(chart.bars);
    setCurrentTitle(title);
    const count = chart.bars.length;
    if (BAR_COUNT_OPTIONS.includes(count)) {
      setBarCountInput(String(count));
      setUseCustom(false);
    } else {
      setCustomCount(String(count));
      setUseCustom(true);
    }
  };

  const handleDelete = (title: string) => {
    deleteChart(title);
    refreshCharts();
  };

  const chartTitles = Object.keys(charts).sort();

  return (
    <div className="flex gap-4 items-start" style={{ minHeight: 0 }}>
      {/* Main chart area */}
      <div className="flex-1 min-w-0">
        {/* Controls bar */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
            background: "#111",
            border: "1px solid #1e1e1e",
            borderRadius: 8,
            padding: "10px 14px",
          }}
        >
          <span style={{ fontSize: 11, color: "#666", fontWeight: 600, letterSpacing: 1 }}>
            BARS
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            {BAR_COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => handleBarCountChange(String(n))}
                style={{
                  padding: "3px 10px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  border: `1px solid ${!useCustom && barCountInput === String(n) ? "#7173e6" : "#2a2a2a"}`,
                  background: !useCustom && barCountInput === String(n) ? "#2a2a60" : "#1a1a1a",
                  color: !useCustom && barCountInput === String(n) ? "#9a9cf8" : "#666",
                  cursor: "pointer",
                  transition: "all 0.1s",
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11, color: "#444" }}>Custom:</span>
            <input
              type="number"
              min={1}
              max={64}
              value={customCount}
              onChange={(e) => setCustomCount(e.target.value)}
              placeholder="n"
              style={{
                width: 46,
                background: "#1a1a1a",
                border: `1px solid ${useCustom ? "#7173e6" : "#2a2a2a"}`,
                borderRadius: 4,
                padding: "3px 6px",
                fontSize: 11,
                color: "#aaa",
                outline: "none",
                textAlign: "center",
              }}
            />
            <button
              onClick={handleCustomCountApply}
              style={{
                padding: "3px 8px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 700,
                border: "1px solid #2a2a2a",
                background: "#1a1a1a",
                color: "#888",
                cursor: "pointer",
              }}
            >
              Set
            </button>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="text"
              placeholder="Chart title…"
              value={currentTitle}
              onChange={(e) => setCurrentTitle(e.target.value)}
              style={{
                width: 160,
                background: "#1a1a1a",
                border: `1px solid ${currentTitle ? "#3a3a7a" : "#2a2a2a"}`,
                borderRadius: 5,
                padding: "5px 10px",
                fontSize: 12,
                color: "#ddd",
                outline: "none",
                fontWeight: 500,
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#7173e6";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = currentTitle ? "#3a3a7a" : "#2a2a2a";
              }}
            />
            <button
              onClick={handleSaveOpen}
              style={{
                padding: "5px 14px",
                borderRadius: 5,
                fontSize: 11,
                fontWeight: 700,
                border: "1px solid #3a3a7a",
                background: "#1e1e3a",
                color: "#9a9cf8",
                cursor: "pointer",
                letterSpacing: 0.5,
              }}
            >
              Save Chart
            </button>
            <button
              onClick={() => setShowExport(true)}
              style={{
                padding: "5px 14px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                border: "1px solid #3a3a7a", background: "#1e1e3a", color: "#9a9cf8",
                cursor: "pointer", letterSpacing: 0.5,
              }}
            >↓ Export</button>
          </div>
        </div>

        {/* Practice Log bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
            background: "#111",
            border: "1px solid #1e1e1e",
            borderRadius: 8,
            padding: "10px 14px",
          }}
        >
          <select
            value={logStatus}
            onChange={e => setLogStatus(e.target.value as "Working On" | "Finished")}
            style={{
              background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 5,
              padding: "5px 8px", fontSize: 11, color: "#888", outline: "none",
            }}
          >
            <option value="Working On">Working On</option>
            <option value="Finished">Finished</option>
          </select>
          <PracticeLogSaveBar
            mode="chord-chart"
            label="Chord Chart"
            getSnapshot={() => ({
              preview: `${currentTitle || "Untitled"} — ${logStatus} · ${bars.length} bar${bars.length !== 1 ? "s" : ""}`,
              snapshot: { chartTitle: currentTitle || "Untitled", status: logStatus },
              canRestore: false,
            })}
          />
        </div>

        {/* Bar grid */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          {bars.map((bar, i) => (
            <BarCard
              key={i}
              bar={bar}
              index={i}
              onChange={(updated) => handleBarChange(i, updated)}
              onCopyPrevious={i > 0 ? () => handleCopyPrevious(i) : undefined}
              onApplyToAll={() => handleApplyToSubsequent(i)}
            />
          ))}
        </div>

        {/* Count display */}
        <div style={{ marginTop: 10, fontSize: 10, color: "#333" }}>
          {bars.length} bar{bars.length !== 1 ? "s" : ""}
        </div>

        {/* Notation panel */}
        <div ref={notationRef}>
          <ChordChartNotation bars={bars} />
        </div>
      </div>

      {/* Saved charts sidebar */}
      <div
        style={{
          width: 200,
          flexShrink: 0,
          background: "#0f0f0f",
          border: "1px solid #1a1a1a",
          borderRadius: 8,
          padding: "12px",
          alignSelf: "flex-start",
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "#555",
            fontWeight: 700,
            letterSpacing: 1,
            marginBottom: 10,
          }}
        >
          SAVED CHARTS
        </div>
        {chartTitles.length === 0 ? (
          <div style={{ fontSize: 11, color: "#2a2a2a", fontStyle: "italic" }}>
            No saved charts yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {chartTitles.map((title) => (
              <div
                key={title}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <button
                  onClick={() => handleLoad(title)}
                  title={`Load "${title}"`}
                  style={{
                    flex: 1,
                    textAlign: "left",
                    background: "#161616",
                    border: "1px solid #222",
                    borderRadius: 4,
                    padding: "5px 8px",
                    fontSize: 11,
                    color: "#aaa",
                    cursor: "pointer",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLButtonElement).style.borderColor = "#7173e6";
                    (e.target as HTMLButtonElement).style.color = "#ccd";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.borderColor = "#222";
                    (e.target as HTMLButtonElement).style.color = "#aaa";
                  }}
                >
                  {title}
                </button>
                <button
                  onClick={() => handleDelete(title)}
                  title="Delete"
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "#1a0a0a",
                    border: "1px solid #3a1a1a",
                    color: "#c06060",
                    fontSize: 10,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save prompt overlay */}
      {savePromptOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setSavePromptOpen(false)}
        >
          <div
            style={{
              background: "#141414",
              border: "1px solid #2a2a2a",
              borderRadius: 10,
              padding: "24px 28px",
              minWidth: 300,
              boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#ccc",
                marginBottom: 14,
              }}
            >
              Save Chart
            </div>
            <input
              type="text"
              autoFocus
              placeholder="Chart title…"
              value={currentTitle}
              onChange={(e) => {
                setCurrentTitle(e.target.value);
                setSaveError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveConfirm();
                if (e.key === "Escape") setSavePromptOpen(false);
              }}
              style={{
                width: "100%",
                background: "#1a1a1a",
                border: "1px solid #333",
                borderRadius: 5,
                padding: "8px 10px",
                fontSize: 13,
                color: "#ddd",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {saveError && (
              <div style={{ fontSize: 11, color: "#e06060", marginTop: 6 }}>
                {saveError}
              </div>
            )}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 14,
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setSavePromptOpen(false)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 5,
                  fontSize: 11,
                  border: "1px solid #2a2a2a",
                  background: "#1a1a1a",
                  color: "#666",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfirm}
                style={{
                  padding: "6px 16px",
                  borderRadius: 5,
                  fontSize: 11,
                  fontWeight: 700,
                  border: "1px solid #3a3a7a",
                  background: "#1e1e3a",
                  color: "#9a9cf8",
                  cursor: "pointer",
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <ExportDialog
        open={showExport}
        onClose={() => setShowExport(false)}
        fileName={currentTitle || "chord_chart"}
        sections={[{
          id: "chart",
          label: "Chord Chart",
          defaultTitle: currentTitle || "Chord Chart",
          getElement: () => notationRef.current,
          generateMusicXml: () => generateChordChartXML(currentTitle || "Chord Chart", bars),
        }]}
      />
    </div>
  );
}
