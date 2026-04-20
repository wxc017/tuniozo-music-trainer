// ── Export Dialog ────────────────────────────────────────────────────────────
//
// Shared export dialog for all modes. Supports:
// - Section checkboxes (for multi-section modes like DrumPatterns, Konnakol)
// - Per-section titles with editing
// - Section reordering (move up/down)
// - Split sections option (page breaks between sections in PDF)
// - Export as PDF or MusicXML

import { useState, useCallback } from "react";
import { exportToPdf, downloadMusicXml } from "@/lib/exportPdf";
import type { PdfSection } from "@/lib/exportPdf";

export interface ExportSection {
  id: string;
  label: string;
  defaultTitle: string;
  /** Ref to the DOM element to capture for PDF */
  getElement: () => HTMLElement | null;
  /** Generate MusicXML string for this section */
  generateMusicXml: () => string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  sections: ExportSection[];
  fileName: string;
}

interface SectionState {
  id: string;
  enabled: boolean;
  title: string;
}

export default function ExportDialog({ open, onClose, sections, fileName }: Props) {
  const [sectionStates, setSectionStates] = useState<SectionState[]>(() =>
    sections.map(s => ({ id: s.id, enabled: true, title: s.defaultTitle })),
  );
  const [showTitles, setShowTitles] = useState(true);
  const [splitSections, setSplitSections] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Keep in sync if sections prop changes
  if (sectionStates.length !== sections.length || !sectionStates.every((s, i) => s.id === sections[i].id)) {
    setSectionStates(sections.map(s => ({ id: s.id, enabled: true, title: s.defaultTitle })));
  }

  const enabledSections = sectionStates.filter(s => s.enabled);
  const multiSection = enabledSections.length > 1;

  const toggleSection = (id: string) => {
    setSectionStates(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  const updateTitle = (id: string, title: string) => {
    setSectionStates(prev => prev.map(s => s.id === id ? { ...s, title } : s));
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    setSectionStates(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const handleExportPdf = useCallback(async () => {
    const ordered = sectionStates.filter(s => s.enabled);
    if (ordered.length === 0) return;

    setExporting(true);
    try {
      const pdfSections: PdfSection[] = [];
      for (const ss of ordered) {
        const sec = sections.find(s => s.id === ss.id);
        if (!sec) continue;
        const el = sec.getElement();
        if (!el) continue;
        pdfSections.push({
          title: showTitles && multiSection ? ss.title : undefined,
          element: el,
        });
      }
      await exportToPdf(pdfSections, fileName, { showTitles: showTitles && multiSection, splitSections });
    } finally {
      setExporting(false);
    }
  }, [sectionStates, sections, fileName, showTitles, splitSections, multiSection]);

  const handleExportMusicXml = useCallback(() => {
    const ordered = sectionStates.filter(s => s.enabled);
    if (ordered.length === 0) return;

    // If single section, export directly
    if (ordered.length === 1) {
      const sec = sections.find(s => s.id === ordered[0].id);
      if (sec) downloadMusicXml(sec.generateMusicXml(), fileName);
      return;
    }

    // Multiple sections: export each as separate file
    for (const ss of ordered) {
      const sec = sections.find(s => s.id === ss.id);
      if (sec) {
        const name = `${fileName}_${ss.id}`;
        downloadMusicXml(sec.generateMusicXml(), name);
      }
    }
  }, [sectionStates, sections, fileName]);

  if (!open) return null;

  const B: React.CSSProperties = {
    padding: "6px 14px", borderRadius: 5, fontSize: 11, fontWeight: 700,
    cursor: "pointer", border: "1px solid #3a3a7a", background: "#1e1e3a",
    color: "#9a9cf8", letterSpacing: 0.5, transition: "all 80ms",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100, display: "flex",
      alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)",
    }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#111", border: "1px solid #2a2a2a", borderRadius: 12,
          padding: "20px 24px", minWidth: 340, maxWidth: 460,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#ccc" }}>Export</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        {/* Section checkboxes */}
        {sections.length > 1 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: "#555", fontWeight: 600, letterSpacing: 1, marginBottom: 8 }}>SECTIONS</div>
            {sectionStates.map((ss, idx) => (
              <div key={ss.id} style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 6,
                padding: "6px 8px", borderRadius: 6,
                background: ss.enabled ? "#1a1a2a" : "#0e0e0e",
                border: `1px solid ${ss.enabled ? "#333" : "#1a1a1a"}`,
              }}>
                <input
                  type="checkbox"
                  checked={ss.enabled}
                  onChange={() => toggleSection(ss.id)}
                  style={{ accentColor: "#7173e6" }}
                />
                <span style={{ flex: 1, fontSize: 12, color: ss.enabled ? "#ccc" : "#555", fontWeight: 600 }}>
                  {sections.find(s => s.id === ss.id)?.label ?? ss.id}
                </span>
                {/* Reorder buttons */}
                <button
                  onClick={() => moveSection(idx, -1)}
                  disabled={idx === 0}
                  style={{ background: "none", border: "none", color: idx === 0 ? "#333" : "#666", cursor: idx === 0 ? "default" : "pointer", fontSize: 11, padding: "2px 4px" }}
                >▲</button>
                <button
                  onClick={() => moveSection(idx, 1)}
                  disabled={idx === sectionStates.length - 1}
                  style={{ background: "none", border: "none", color: idx === sectionStates.length - 1 ? "#333" : "#666", cursor: idx === sectionStates.length - 1 ? "default" : "pointer", fontSize: 11, padding: "2px 4px" }}
                >▼</button>
              </div>
            ))}
          </div>
        )}

        {/* Title editing for enabled sections (only when multiple sections) */}
        {multiSection && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={showTitles}
                onChange={() => setShowTitles(p => !p)}
                style={{ accentColor: "#7173e6" }}
              />
              <span style={{ fontSize: 11, color: "#888" }}>Show section titles</span>
            </div>

            {showTitles && enabledSections.map(ss => (
              <div key={ss.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: "#555", width: 60, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {sections.find(s => s.id === ss.id)?.label}:
                </span>
                <input
                  type="text"
                  value={ss.title}
                  onChange={e => updateTitle(ss.id, e.target.value)}
                  style={{
                    flex: 1, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 4,
                    padding: "4px 8px", fontSize: 11, color: "#ccc", outline: "none",
                  }}
                />
              </div>
            ))}

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={splitSections}
                onChange={() => setSplitSections(p => !p)}
                style={{ accentColor: "#7173e6" }}
              />
              <span style={{ fontSize: 11, color: "#888" }}>Split sections (page breaks)</span>
            </div>
          </div>
        )}

        {/* Export buttons */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button
            onClick={handleExportPdf}
            disabled={enabledSections.length === 0 || exporting}
            style={{ ...B, opacity: enabledSections.length === 0 ? 0.4 : 1 }}
          >
            {exporting ? "Exporting…" : "Export PDF"}
          </button>
          <button
            onClick={handleExportMusicXml}
            disabled={enabledSections.length === 0}
            style={{ ...B, opacity: enabledSections.length === 0 ? 0.4 : 1 }}
          >
            Export MusicXML
          </button>
        </div>
      </div>
    </div>
  );
}
