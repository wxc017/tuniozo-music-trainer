import { useState, useEffect } from "react";
import { addPracticeEntry, PracticeRating, PracticeLogEntry } from "@/lib/practiceLog";

interface SnapshotResult { preview: string; snapshot: Record<string, unknown>; canRestore: boolean }

interface SaveBarProps {
  mode: string;
  label: string;
  getSnapshot: () => SnapshotResult;
  /** If provided, each item becomes a separate practice log entry (overrides getSnapshot) */
  getMultiSnapshots?: () => SnapshotResult[] | null;
  /** Optional async function to capture a preview image. Returns a data URL or undefined. */
  getCapture?: () => Promise<string | undefined>;
  /** If provided, shows a dropdown to pick which pattern to log (e.g. Ostinato vs Accent Study) */
  sourceOptions?: { value: string; label: string }[];
  /** Called when the user changes the source dropdown selection */
  onSourceChange?: (value: string) => void;
  /** If provided, shows a tag dropdown next to LOG (e.g. Isolation / Context) */
  tagOptions?: { value: string; label: string; color: string }[];
  /** Externally controlled tag value — keeps dropdown in sync with parent state */
  defaultTag?: string;
  /** Called when the user changes the tag dropdown */
  onTagChange?: (value: string) => void;
  onSaved?: (entry: PracticeLogEntry) => void;
  style?: React.CSSProperties;
  /** When true, hides star rating and LOG button (logging handled elsewhere) */
  hideRatingAndLog?: boolean;
}

const STAR_COLORS = ["", "#e06060", "#e0a040", "#c8aa50", "#7aaa7a", "#7173e6"];

export default function PracticeLogSaveBar({
  mode,
  label,
  getSnapshot,
  getMultiSnapshots,
  getCapture,
  sourceOptions,
  onSourceChange,
  tagOptions,
  defaultTag,
  onTagChange,
  onSaved,
  style,
  hideRatingAndLog,
}: SaveBarProps) {
  const [rating, setRating] = useState<PracticeRating>(0);
  const [hovered, setHovered] = useState(0);
  const [source, setSource] = useState(mode);
  // Keep source in sync when the active mode changes (e.g. switching tabs)
  useEffect(() => { if (sourceOptions) setSource(mode); }, [mode, sourceOptions]);
  const [tag, setTag] = useState(defaultTag ?? tagOptions?.[0]?.value ?? "");
  // Keep tag in sync when parent changes defaultTag
  useEffect(() => { if (defaultTag !== undefined) setTag(defaultTag); }, [defaultTag]);
  const [flash, setFlash] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    let imagePreview: string | undefined;
    if (getCapture) {
      try {
        imagePreview = await getCapture();
      } catch (e) {
        console.warn("Practice log preview capture failed", e);
      }
    }

    const modeVal = sourceOptions ? source : mode;
    const labelVal = sourceOptions
      ? `${label} · ${sourceOptions.find(o => o.value === source)?.label ?? source}`
      : label;
    const tagVal = tagOptions && tag ? { tag } : {};

    // Multi-snapshot: each item becomes a separate log entry
    const multiSnaps = getMultiSnapshots?.();
    if (multiSnaps && multiSnaps.length > 0) {
      let lastEntry: PracticeLogEntry | undefined;
      for (const snap of multiSnaps) {
        lastEntry = addPracticeEntry({
          mode: modeVal,
          label: labelVal,
          rating,
          preview: snap.preview,
          snapshot: imagePreview ? { ...snap.snapshot, imagePreview } : snap.snapshot,
          canRestore: snap.canRestore,
          ...tagVal,
        });
        // Only attach the image to the first entry
        imagePreview = undefined;
      }
      setSaving(false);
      setFlash(`Logged ${multiSnaps.length}!`);
      setTimeout(() => setFlash(""), 2000);
      if (lastEntry) onSaved?.(lastEntry);
      return;
    }

    const { preview, snapshot, canRestore } = getSnapshot();
    const entry = addPracticeEntry({
      mode: modeVal,
      label: labelVal,
      rating,
      preview,
      snapshot: imagePreview ? { ...snapshot, imagePreview } : snapshot,
      canRestore,
      ...tagVal,
    });
    setSaving(false);
    setFlash("Logged!");
    setTimeout(() => setFlash(""), 2000);
    onSaved?.(entry);
  };

  const displayStars = hovered > 0 ? hovered : rating;
  const starColor = STAR_COLORS[displayStars] || "#333";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        ...style,
      }}
    >
      {/* Divider */}
      <div style={{ width: 1, height: 16, background: "#222", flexShrink: 0 }} />

      {/* Source dropdown */}
      {sourceOptions && sourceOptions.length > 1 && (
        <select
          value={source}
          onChange={e => { setSource(e.target.value); onSourceChange?.(e.target.value); }}
          style={{
            background: "#141414",
            border: "1px solid #2a2a2a",
            borderRadius: 4,
            padding: "2px 6px",
            fontSize: 10,
            color: "#aaa",
            outline: "none",
          }}
        >
          {sourceOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}

      {/* Star rating */}
      {!hideRatingAndLog && (
      <div style={{ display: "flex", gap: 1 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => setRating(prev => prev === n ? 0 : n as PracticeRating)}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            title={["", "Hard", "Tough", "OK", "Good", "Easy"][n]}
            style={{
              fontSize: 14,
              lineHeight: 1,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: n <= displayStars ? starColor : "#2a2a2a",
              padding: "0 1px",
              transition: "color 80ms",
            }}
          >
            ★
          </button>
        ))}
      </div>
      )}

      {/* Tag dropdown */}
      {tagOptions && tagOptions.length > 0 && (
        <>
          <div style={{ width: 1, height: 16, background: "#222", flexShrink: 0 }} />
          <select
            value={tag}
            onChange={e => { setTag(e.target.value); onTagChange?.(e.target.value); }}
            style={{
              background: "#141414",
              border: `1px solid ${tagOptions.find(t => t.value === tag)?.color ?? "#2a2a2a"}44`,
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 10,
              color: tagOptions.find(t => t.value === tag)?.color ?? "#aaa",
              outline: "none",
              fontWeight: 600,
            }}
          >
            {tagOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </>
      )}

      {/* Divider before LOG */}
      {!hideRatingAndLog && <div style={{ width: 1, height: 16, background: "#222", flexShrink: 0 }} />}

      {/* Log button in its own box */}
      {!hideRatingAndLog && <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "#0a1a0a",
          border: "1px solid #1a3a1a",
          borderRadius: 5,
          padding: "3px 6px",
        }}
      >
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "2px 10px",
            background: saving ? "#1a2a1a" : "#0e1a0e",
            border: "1px solid #2a5a2a",
            color: saving ? "#7aaa7a" : "#5a9a5a",
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 600,
            cursor: saving ? "default" : "pointer",
            letterSpacing: 1,
            transition: "all 80ms",
            opacity: saving ? 0.7 : 1,
          }}
          onMouseEnter={e => {
            if (!saving) {
              (e.currentTarget as HTMLElement).style.background = "#1a2a1a";
              (e.currentTarget as HTMLElement).style.color = "#7aaa7a";
            }
          }}
          onMouseLeave={e => {
            if (!saving) {
              (e.currentTarget as HTMLElement).style.background = "#0e1a0e";
              (e.currentTarget as HTMLElement).style.color = "#5a9a5a";
            }
          }}
        >
          {saving ? "…" : "+ LOG"}
        </button>

        {flash && (
          <span style={{ fontSize: 9, color: "#7aaa7a", letterSpacing: 1 }}>{flash}</span>
        )}
      </div>}
    </div>
  );
}
