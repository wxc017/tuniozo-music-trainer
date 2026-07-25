import { describe, it, expect } from "vitest";
import { noteLabel, jianpuToPitch, shiftDegree, jianpuGlyphFor, degreeToEdoStep, edoFifth, edoNoteLabel } from "./jianpu";

describe("EDO diatonic + region-centered solfège", () => {
  it("12-EDO major scale degrees = 0 2 4 5 7 9 11", () => {
    expect([1,2,3,4,5,6,7].map(d => degreeToEdoStep(d, 12))).toEqual([0,2,4,5,7,9,11]);
  });
  it("31-EDO best fifth = 18, degree 3 = step 10", () => {
    expect(edoFifth(31)).toBe(18);
    expect(degreeToEdoStep(3, 31)).toBe(10);
  });
  it("12-EDO solfa degrees are the centre syllables Da Ra Ma Fa Sa La Ta", () => {
    expect([1,2,3,4,5,6,7].map(d => edoNoteLabel("solfa", d, 0, 12).text)).toEqual(["Da","Ra","Ma","Fa","Sa","La","Ta"]);
  });
  it("31-EDO major triad 1-3-5 = Da Mo Sa (degree 3 is the small major 3rd, not centre Ma)", () => {
    expect([1,3,5].map(d => edoNoteLabel("solfa", d, 0, 31).text)).toEqual(["Da","Mo","Sa"]);
  });
  it("altering degree 3 in 31-EDO walks the syllable: Ja / Mo / Me (small→center→large)", () => {
    expect([-1,0,1].map(a => edoNoteLabel("solfa", 3, a, 31).text)).toEqual(["Ja","Mo","Me"]);
  });
  it("jianpu number system marks alteration (^ / v off-12, ♯ / ♭ in 12)", () => {
    expect(edoNoteLabel("jianpu", 3, 1, 31).prefix).toBe("^");
    expect(edoNoteLabel("jianpu", 3, -1, 12).prefix).toBe("♭");
  });
});

describe("jianpuGlyphFor — matches standard jianpu duration table", () => {
  const g = (d: Parameters<typeof jianpuGlyphFor>[0], dot?: boolean) => jianpuGlyphFor(d, dot);
  it("undotted: whole=3 dashes, half=1 dash, quarter=bare, eighth=1 underline, 16th=2", () => {
    expect(g("w")).toEqual({ underlines: 0, dashes: 3, dot: false }); // 1 – – –
    expect(g("h")).toEqual({ underlines: 0, dashes: 1, dot: false }); // 1 –
    expect(g("q")).toEqual({ underlines: 0, dashes: 0, dot: false }); // 1
    expect(g("8")).toEqual({ underlines: 1, dashes: 0, dot: false }); // 1̲
    expect(g("16")).toEqual({ underlines: 2, dashes: 0, dot: false });
  });
  it("dotted whole/half add dashes (no • dot)", () => {
    expect(g("w", true)).toEqual({ underlines: 0, dashes: 5, dot: false }); // 1 – – – – –
    expect(g("h", true)).toEqual({ underlines: 0, dashes: 2, dot: false }); // 1 – –
  });
  it("dotted quarter/eighth use the • augmentation dot", () => {
    expect(g("q", true)).toEqual({ underlines: 0, dashes: 0, dot: true }); // 1•
    expect(g("8", true)).toEqual({ underlines: 1, dashes: 0, dot: true }); // 1̲•
  });
});

describe("noteLabel — jianpu vs sol-fa", () => {
  it("jianpu shows numbers", () => {
    expect(noteLabel("jianpu", 1, undefined)).toBe("1");
    expect(noteLabel("jianpu", 5, "#")).toBe("5"); // accidental drawn separately in jianpu
  });
  it("sol-fa maps naturals 1→d … 7→t", () => {
    const got = [1,2,3,4,5,6,7].map(d => noteLabel("solfa", d, undefined));
    expect(got).toEqual(["d","r","m","f","s","l","t"]);
  });
  it("sol-fa chromatics: sharps (di ri fi si li) and flats (ra me se le te)", () => {
    expect(noteLabel("solfa", 4, "#")).toBe("fi"); // raised 4
    expect(noteLabel("solfa", 5, "b")).toBe("se"); // lowered 5
    expect(noteLabel("solfa", 1, "#")).toBe("di");
    expect(noteLabel("solfa", 3, "b")).toBe("me");
    expect(noteLabel("solfa", 7, "b")).toBe("te");
  });
});

describe("shiftDegree wraps octaves", () => {
  it("raising 7 → 1 up an octave", () => {
    expect(shiftDegree(7, 0, 1)).toEqual({ degree: 1, octave: 1 });
  });
  it("lowering 1 → 7 down an octave", () => {
    expect(shiftDegree(1, 0, -1)).toEqual({ degree: 7, octave: -1 });
  });
});

describe("jianpuToPitch sanity", () => {
  it("C-key degree 1 = C4 (midi 60)", () => {
    expect(jianpuToPitch(1, 0, undefined, 0).midi).toBe(60);
  });
  it("degree 5 up an octave = G5 (midi 79)", () => {
    expect(jianpuToPitch(5, 1, undefined, 0).midi).toBe(79);
  });
});
