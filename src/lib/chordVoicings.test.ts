import { describe, it, expect } from "vitest";
import { generateVoicings } from "./chordVoicings";

describe("generateVoicings", () => {
  it("triad → close + open per inversion", () => {
    const v = generateVoicings(["1", "3", "5"]);
    const labels = v.map(p => p.label);
    expect(labels).toContain("1 3 5");   // close root
    expect(labels).toContain("1 5 3");   // open root (rank: 1,5,3)
    expect(labels).toContain("3 5 1");   // close 1st inv
    expect(labels).toContain("5 1 3");   // close 2nd inv
    // every pattern indexes exactly the 3 tones
    for (const p of v) expect(p.order.length).toBe(3);
  });

  it("grows when extensions are added", () => {
    const seventh = generateVoicings(["1", "3", "5", "7"]);
    const ninth = generateVoicings(["1", "3", "5", "7", "9"]);
    const full = generateVoicings(["1", "3", "5", "7", "9", "11", "13"]);
    // more tones → more voicings, and the order spans the extensions
    expect(ninth.length).toBeGreaterThan(seventh.length);
    expect(full.length).toBeGreaterThan(ninth.length);
    expect(full.some(p => p.order.length === 7)).toBe(true);
  });

  it("open ordering is the harmonic-series rank (1·5·3·7·9·11·13)", () => {
    const v = generateVoicings(["1", "3", "5", "7", "9", "13"]);
    // root-position open = bass(1) then rank order of the rest
    const rootOpen = v.find(p => p.group === "Root Position" && p.label === "1 5 3 7 9 13");
    expect(rootOpen).toBeTruthy();
  });

  it("inversions are grouped by the bass degree", () => {
    const v = generateVoicings(["1", "3", "5", "7", "9"]);
    const groups = new Set(v.map(p => p.group));
    expect(groups).toContain("Root Position");   // bass 1
    expect(groups).toContain("1st Inversion");   // bass 3
    expect(groups).toContain("2nd Inversion");   // bass 5
    expect(groups).toContain("3rd Inversion");   // bass 7
    expect(groups).toContain("4th Inversion");   // bass 9
  });

  it("ids are stable and unique", () => {
    const v = generateVoicings(["1", "3", "5", "7", "9", "11", "13"]);
    const ids = v.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    // same input → same ids
    const v2 = generateVoicings(["1", "3", "5", "7", "9", "11", "13"]);
    expect(v2.map(p => p.id)).toEqual(ids);
  });
});
