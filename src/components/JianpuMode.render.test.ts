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
    const lines = container.querySelectorAll("line").length;
    const texts = Array.from(container.querySelectorAll("text")).map(t => t.textContent);

    // 3 bars, 1 row (MPR=3) → 3 right barlines + 1 leading barline = 4 barlines.
    // + 1 beam line (eighth note's underline) = 5 lines total.
    // 1 octave dot for note "a"; numbers "1"/"2" plus a "–" dash for the half.
    expect(texts).toContain("1");
    expect(texts).toContain("2");
    expect(texts).toContain("–");
    expect(circles).toBe(1);      // octave dot
    expect(lines).toBe(5);        // 4 barlines + 1 beam

    await act(async () => { root.unmount(); });
    container.remove();
  });
});
