import { describe, it, expect } from "vitest";
import { generateVoicings, generateChordVoicings, assembleVoicing, chordToneSteps } from "./chordVoicings";

const pc = (n: number) => ((n % 12) + 12) % 12;

describe("generateVoicings", () => {
  it("emits close + open + drop voicings per inversion", () => {
    const v = generateVoicings(["1", "3", "5", "7"]);
    const labels = v.map(p => p.label);
    expect(labels).toContain("1 3 5 7");   // close root
    expect(labels).toContain("1 5 3 7");   // open / drop-2&4 root
    expect(labels).toContain("5 1 3 7");   // drop-2 of root (5 in bass)
    expect(labels).toContain("3 1 5 7");   // drop-3 of root (3 in bass)
    // the 16 standard drop voicings + the harmonic-rank open (deduped)
    expect(v.length).toBeGreaterThanOrEqual(16);
    for (const p of v) expect(p.order.length).toBe(4);
  });

  it("groups by the actual bass when no section override is given", () => {
    const v = generateVoicings(["1", "3", "5", "7"]);
    const rootGroup = v.filter(p => p.group === "Root Position");
    // every Root Position voicing actually has the root (index 0) in the bass
    expect(rootGroup.every(p => p.order[0] === 0)).toBe(true);
    expect(new Set(v.map(p => p.group))).toContain("2nd Inversion");
  });

  it("a section override puts every voicing under one group", () => {
    const v = generateVoicings(["1", "3", "5", "7"], { group: "Seventh", baseNotes: 4 });
    expect(v.every(p => p.group === "Seventh")).toBe(true);
    expect(v.every(p => p.baseNotes === 4)).toBe(true);
  });
});

describe("generateChordVoicings — chord-type sections", () => {
  it("always has Triad + Seventh; extensions add their own sections", () => {
    const none = generateChordVoicings([]);
    expect(new Set(none.map(p => p.group))).toEqual(new Set(["Triad", "Seventh"]));

    const withExt = generateChordVoicings(["6th", "9th"]);
    const groups = new Set(withExt.map(p => p.group));
    expect(groups).toContain("Triad");
    expect(groups).toContain("Seventh");
    expect(groups).toContain("6th");    // first-octave addition section
    expect(groups).toContain("9th");    // compound extension section
  });

  it("extension sections carry their extDegrees and base size", () => {
    const v = generateChordVoicings(["9th", "2nd"]);
    const ninth = v.filter(p => p.group === "9th");
    const second = v.filter(p => p.group === "2nd");
    expect(ninth.every(p => p.baseNotes === 4 && p.extDegrees?.[0] === "9th")).toBe(true);
    expect(second.every(p => p.baseNotes === 3 && p.extDegrees?.[0] === "2nd")).toBe(true);
    // 9th section voicings span 5 tones (1 3 5 7 9); 2nd section 4 (1 2 3 5)
    expect(ninth.every(p => p.order.length === 5)).toBe(true);
    expect(second.every(p => p.order.length === 4)).toBe(true);
  });

  it("ids are unique across sections", () => {
    const v = generateChordVoicings(["2nd", "4th", "6th", "9th", "11th", "13th"]);
    const ids = v.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("assembleVoicing + chordToneSteps", () => {
  const edo = 12;
  const baseSteps = [0, 4, 7, 10];        // C7
  const extSteps = [12 + 2];              // 9 (compound)
  const tones = chordToneSteps(baseSteps, extSteps);
  const find = (label: string) =>
    generateVoicings(["1", "3", "5", "7", "9"]).find(p => p.label === label)!;

  it("tone steps are pitch-sorted with the 9 on top", () => {
    expect(tones).toEqual([0, 4, 7, 10, 14]);
  });

  it("open voicing (1 5 3 7 9) puts the 5th below the 3rd, 9 on top", () => {
    const v = assembleVoicing(0, tones, find("1 5 3 7 9"), edo);
    expect(pc(v[0])).toBe(0);   // root
    expect(pc(v[1])).toBe(7);   // 5th
    expect(pc(v[2])).toBe(4);   // 3rd
    expect(pc(v[v.length - 1])).toBe(2); // 9 (= D) on top
  });

  it("drop-2 of root puts the 5th in the bass", () => {
    const v = assembleVoicing(0, tones, find("5 1 3 7 9"), edo);
    expect(pc(v[0])).toBe(7);   // 5th in the bass
  });
});
