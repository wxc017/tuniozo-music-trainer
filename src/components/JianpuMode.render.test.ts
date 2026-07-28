// Render smoke-test: verifies octave dots (<circle>) and duration underlines
// (<line>) actually appear in the jianpu SVG for notes that carry them.
import { describe, it, expect } from "vitest";
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import JianpuMode from "./JianpuMode";
import { saveProject, newProject, type NoteData } from "@/lib/noteEntryData";

describe("JianpuMode rendering", () => {
  it("draws octave dots and duration underlines", async () => {
    const p = newProject("T", { clef: "treble", keySignature: 0, defaultTimeSig: { num: 4, den: 4 }, barCount: 3 });
    p.instrument = "jianpu";
    const notes: NoteData[] = [
      // eighth note, one octave up → expect 1 octave dot + 1 underline
      { id: "a", measure: 0, startSlot: 0, duration: "8", voice: 0, isRest: false, pitch: "c/5", jianpuDegree: 1, jianpuOctave: 1 },
      // half note → expect a trailing dash (a <text>), no underline
      { id: "b", measure: 0, startSlot: 8, duration: "h", voice: 0, isRest: false, pitch: "d/4", jianpuDegree: 2, jianpuOctave: 0 },
    ];
    p.notes = notes;
    saveProject(p);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(JianpuMode, { controlledActiveId: p.id }));
    });
    // allow the load effect (loadProjects) to flush
    await act(async () => { await Promise.resolve(); });

    const circles = container.querySelectorAll("circle").length;
    // The faint cell grid is drawn with <line> too, so count only the SOLID
    // lines — barlines, beams and duration strokes — by excluding the dashed
    // ones.  Otherwise this number tracks the grid resolution, not the notation.
    const solidLines = Array.from(container.querySelectorAll("line"))
      .filter(l => !l.getAttribute("stroke-dasharray")).length;
    const texts = Array.from(container.querySelectorAll("text")).map(t => t.textContent);

    // 3 bars, 1 row → 3 right barlines + 1 leading barline = 4 barlines,
    // + 1 beam (the eighth's underline)
    // + 1 vertical stroke (the half note's length mark) = 6 solid lines.
    expect(texts).toContain("1");
    expect(texts).toContain("2");
    // Length is carried by the stroke beside the syllable now, NOT by trailing
    // horizontal dashes — those were removed so every note keeps to its own cell.
    expect(texts).not.toContain("–");
    expect(circles).toBe(1);      // octave dot
    expect(solidLines).toBe(6);

    await act(async () => { root.unmount(); });
    container.remove();
  });
});
