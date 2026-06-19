import { describe, it, expect } from "vitest";
import { generateVoicings, generateChordVoicings, assembleVoicing, chordToneSteps, chordPartials } from "./chordVoicings";

const pc = (n: number) => ((n % 12) + 12) % 12;

describe("generateVoicings", () => {
  it("emits close + open + drops + doubled/rootless/shell for a seventh", () => {
    const v = generateVoicings(["1", "3", "5", "7"]);
    const labels = v.map(p => p.label);
    expect(labels).toContain("1 3 5 7");   // close root
    expect(labels).toContain("1 5 3 7");   // open / drop-2&4 root
    expect(labels).toContain("5 1 3 7");   // drop-2 of root (5 in bass)
    expect(labels).toContain("3 1 5 7");   // drop-3 of root (3 in bass)
    const types = new Set(v.map(p => p.voicingType));
    for (const t of ["Close", "Open", "Drop 2", "Drop 3", "Drop 2&3", "Drop 2&4", "Doubled", "Rootless", "Shell"]) {
      expect(types).toContain(t);
    }
    // shell is the 3+7 guide tones
    expect(labels).toContain("3 7");
  });

  it("groups by the actual bass when no section override is given", () => {
    const v = generateVoicings(["1", "3", "5", "7"]);
    const rootGroup = v.filter(p => p.group === "Root Position");
    // every Root Position voicing actually has the root (index 0) in the bass
    expect(rootGroup.every(p => p.order[0] === 0)).toBe(true);
    expect(new Set(v.map(p => p.group))).toContain("2nd Inversion");
  });

  it("triads: 3 1 5 / 5 3 1 are Open (not drops); doublings included, no drops", () => {
    const v = generateVoicings(["1", "3", "5"]);
    const find = (label: string) => v.find(p => p.label === label)!;
    expect(find("3 1 5").voicingType).toBe("Open");
    expect(find("5 3 1").voicingType).toBe("Open");
    expect(find("1 3 5").voicingType).toBe("Close");
    expect(v.some(p => p.voicingType === "Doubled")).toBe(true);
    expect(v.some(p => (p.voicingType ?? "").startsWith("Drop"))).toBe(false);
  });

  it("a section override puts every voicing under one group", () => {
    const v = generateVoicings(["1", "3", "5", "7"], { group: "Seventh", baseNotes: 4 });
    expect(v.every(p => p.group === "Seventh")).toBe(true);
    expect(v.every(p => p.baseNotes === 4)).toBe(true);
  });
});

describe("generateChordVoicings — chord-type sections", () => {
  it("always has Triad + Seventh + Sus; extensions add their own sections", () => {
    const none = generateChordVoicings([]);
    const baseGroups = new Set(none.map(p => p.group));
    expect(baseGroups).toContain("Triad");
    expect(baseGroups).toContain("Seventh");
    expect(baseGroups).toContain("Sus2");
    expect(baseGroups).toContain("Sus4");
    expect(baseGroups).toContain("7sus4");
    // sus voicings carry the substitution marker
    expect(none.some(p => p.group === "Sus2" && p.sus === "2")).toBe(true);
    expect(none.some(p => p.group === "Sus4" && p.sus === "4")).toBe(true);

    const withExt = generateChordVoicings(["6th", "9th"]);
    const groups = new Set(withExt.map(p => p.group));
    expect(groups).toContain("Triad");
    expect(groups).toContain("Seventh");
    expect(groups).toContain("6th");    // first-octave addition section
    expect(groups).toContain("9th");    // compound extension section
  });

  it("emits a section for every combination of the active extensions", () => {
    const v = generateChordVoicings(["9th", "11th"]);
    const groups = new Set(v.map(p => p.group));
    expect(groups).toContain("9th");
    expect(groups).toContain("11th");
    expect(groups).toContain("9th + 11th");   // the combo section
    // the combo carries both extensions
    expect(v.some(p => p.group === "9th + 11th"
      && p.extDegrees?.includes("9th") && p.extDegrees?.includes("11th"))).toBe(true);
  });

  it("tags each voicing with its type (Close / Open / Drop …)", () => {
    const v = generateVoicings(["1", "3", "5", "7"]);
    const close = v.find(p => p.label === "1 3 5 7");
    const drop2 = v.find(p => p.label === "5 1 3 7");
    expect(close?.voicingType).toBe("Close");
    expect(drop2?.voicingType).toBe("Drop 2");
    expect(v.some(p => p.voicingType === "Open")).toBe(true);
    expect(v.some(p => p.voicingType === "Drop 2&4")).toBe(true);
  });

  it("extension sections carry their extDegrees and base size", () => {
    const v = generateChordVoicings(["9th", "2nd"]);
    const ninth = v.filter(p => p.group === "9th");
    const second = v.filter(p => p.group === "2nd");
    expect(ninth.every(p => p.baseNotes === 4 && p.extDegrees?.[0] === "9th")).toBe(true);
    expect(second.every(p => p.baseNotes === 3 && p.extDegrees?.[0] === "2nd")).toBe(true);
    // a full 5-tone 9th voicing and 4-tone add2 voicing both exist (the
    // Doubled/Rootless/Shell variants differ in voice count)
    expect(ninth.some(p => p.order.length === 5)).toBe(true);
    expect(second.some(p => p.order.length === 4)).toBe(true);
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

describe("chordPartials", () => {
  it("a close major triad ≈ 4:5:6", () => {
    expect(chordPartials([0, 4, 7], 12)).toEqual([4, 5, 6]);
  });
  it("an open triad (1 5 3) ≈ 2:3:5", () => {
    expect(chordPartials([0, 7, 16], 12)).toEqual([2, 3, 5]);
  });
  it("an octave ≈ 1:2", () => {
    expect(chordPartials([0, 12], 12)).toEqual([1, 2]);
  });
  it("a wide (two-hand) spread keeps a clean low set", () => {
    // bass C two octaves below a close C-E-G → fundamental + 4:5:6
    expect(chordPartials([-24, 0, 4, 7], 12)).toEqual([1, 4, 5, 6]);
    // bass + a 3-octave-spread open triad still resolves
    expect(chordPartials([0, 19, 28, 36], 12)).not.toBeNull();
  });
});
