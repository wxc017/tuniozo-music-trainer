import { describe, it, expect } from "vitest";
import { generateVoicings, assembleVoicing, chordToneSteps } from "./chordVoicings";

const pc = (n: number) => ((n % 12) + 12) % 12;

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

describe("assembleVoicing + chordToneSteps", () => {
  const edo = 12;
  // C7 base (root, M3, P5, m7) + 9 (oct+M2) + 13 (oct+M6) — extensions octave-up.
  const baseSteps = [0, 4, 7, 10];
  const extSteps = [12 + 2, 12 + 9];
  const tones = chordToneSteps(baseSteps, extSteps);
  const degrees = ["1", "3", "5", "7", "9", "13"];
  const find = (label: string) => generateVoicings(degrees).find(p => p.label === label)!;

  it("tone steps are pitch-sorted with extensions on top", () => {
    expect(tones).toEqual([0, 4, 7, 10, 14, 21]);
  });

  it("close root voicing stacks all six tones ascending", () => {
    const v = assembleVoicing(0, tones, find("1 3 5 7 9 13"), edo);
    expect(v.length).toBe(6);
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThan(v[i - 1]);
    expect(new Set(v.map(pc))).toEqual(new Set([0, 4, 7, 10, 2, 9]));
  });

  it("open root voicing (1 5 3 7 9 13) puts the 5th below the 3rd, colours on top", () => {
    const v = assembleVoicing(0, tones, find("1 5 3 7 9 13"), edo);
    expect(pc(v[0])).toBe(0);   // root
    expect(pc(v[1])).toBe(7);   // 5th below the 3rd
    expect(pc(v[2])).toBe(4);   // 3rd
    expect(pc(v[v.length - 1])).toBe(9); // 13 (M6) on top
  });

  it("inversion puts the chosen tone in the bass", () => {
    const inv = generateVoicings(degrees).find(p => p.group === "1st Inversion")!;
    const v = assembleVoicing(0, tones, inv, edo);
    expect(pc(v[0])).toBe(4);   // 3rd in the bass
  });
});
