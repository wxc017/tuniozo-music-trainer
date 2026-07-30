import { describe, it, expect } from "vitest";
import { barTimeSig, barSlots, type NoteEntryProject } from "@/lib/noteEntryData";

const proj = (cycleMode: boolean, cycles: Record<number, number>): NoteEntryProject => ({
  id: "t", title: "t", createdAt: 0, youtubeUrl: "", syncPoints: [], notes: [],
  instrument: "jianpu", cycleMode,
  setup: { clef: "treble", keySignature: 0, defaultTimeSig: { num: 4, den: 4 }, barCount: 4, perBarCycleSlots: cycles },
});

describe("cycle → MusicXML time signature", () => {
  it("a 15-eighth cycle exports as 15/8", () => {
    const p = proj(true, { 0: 60 });           // 15 eighths = 60 slots
    expect(barSlots(p, 0)).toBe(60);
    expect(barTimeSig(p, 0)).toEqual({ num: 15, den: 8 });
  });
  it("keeps 16ths honest instead of rounding to eighths", () => {
    const p = proj(true, { 0: 30 });           // 15 sixteenths
    expect(barTimeSig(p, 0)).toEqual({ num: 15, den: 16 });
  });
  it("slots and the derived signature always agree", () => {
    for (const s of [4, 8, 12, 30, 60, 61]) {
      const p = proj(true, { 0: s });
      const ts = barTimeSig(p, 0);
      expect(ts.num * (32 / ts.den)).toBe(barSlots(p, 0));
    }
  });
  it("leaves metred scores on their own signature", () => {
    const p = proj(false, {});
    expect(barTimeSig(p, 0)).toEqual({ num: 4, den: 4 });
    expect(barSlots(p, 0)).toBe(32);
  });
});

import { barTimeXml, barGroups, generateJianpuMusicXML, type NoteData } from "@/lib/noteEntryData";

const cyc = (slots: number, groupEnds: number[], notes: NoteData[] = []): NoteEntryProject => ({
  id: "t", title: "t", createdAt: 0, youtubeUrl: "", syncPoints: [], notes,
  instrument: "jianpu", cycleMode: true,
  setup: { clef: "treble", keySignature: 0, defaultTimeSig: { num: 4, den: 4 }, barCount: 1,
           perBarCycleSlots: { 0: slots }, perBarGroupEnds: { 0: groupEnds } },
});

describe("Balkan / additive export", () => {
  it("a 15-cycle grouped 4+4+4+3 exports additively, not as 15/8", () => {
    const p = cyc(60, [16, 32, 48]);                    // 4+4+4+3 eighths
    expect(barGroups(p, 0)).toEqual([16, 16, 16, 12]);
    expect(barTimeXml(p, 0)).toBe(
      "<time><beats>4</beats><beat-type>8</beat-type><beats>4</beats><beat-type>8</beat-type>" +
      "<beats>4</beats><beat-type>8</beat-type><beats>3</beats><beat-type>8</beat-type></time>");
  });
  it("the parts always sum back to the cycle length", () => {
    const p = cyc(60, [20, 40]);                        // 5+5+5
    const parts = [...barTimeXml(p, 0).matchAll(/<beats>(\d+)<\/beats>/g)].map(x => +x[1]);
    expect(parts).toEqual([5, 5, 5]);
    expect(parts.reduce((a, b) => a + b, 0) * 4).toBe(barSlots(p, 0));
  });
  it("falls back to a plain signature when ungrouped", () => {
    expect(barTimeXml(cyc(60, []), 0)).toBe("<time><beats>15</beats><beat-type>8</beat-type></time>");
  });
  it("produces well-formed XML carrying the additive time", () => {
    const xml = generateJianpuMusicXML(cyc(60, [16, 32, 48]));
    expect(xml).toContain("<beats>3</beats>");
    expect((xml.match(/<time>/g) ?? []).length).toBeGreaterThan(0);
  });
});

describe("sol-fa marks survive export", () => {
  const note = (over: Partial<NoteData>): NoteData => ({
    id: "n1", measure: 0, startSlot: 0, duration: "q", pitch: "c/4", isRest: false,
    jianpuDegree: 1, jianpuOctave: 0, voice: 0, ...over,
  });
  it("carries accents and staccatos into the XML", () => {
    const xml = generateJianpuMusicXML(cyc(60, [], [note({ accent: true, staccato: true })]));
    expect(xml).toContain("<accent/>");
    expect(xml).toContain("<staccato/>");
  });
  it("omits the notations element when a note is unmarked", () => {
    const xml = generateJianpuMusicXML(cyc(60, [], [note({})]));
    expect(xml).not.toContain("<articulations>");
  });
});
