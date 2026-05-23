import { describe, it, expect } from "vitest";
import { parseChordSymbol } from "./chordSymbols";

function ivs(sym: string) {
  return parseChordSymbol(sym)?.intervals;
}

describe("parseChordSymbol", () => {
  it("triads", () => {
    expect(parseChordSymbol("C")).toMatchObject({ rootPc: 0, intervals: [0, 4, 7] });
    expect(parseChordSymbol("Cm")).toMatchObject({ rootPc: 0, intervals: [0, 3, 7] });
    expect(parseChordSymbol("F#")).toMatchObject({ rootPc: 6, intervals: [0, 4, 7] });
    expect(parseChordSymbol("Bb")).toMatchObject({ rootPc: 10, intervals: [0, 4, 7] });
    expect(parseChordSymbol("Caug")?.intervals).toEqual([0, 4, 8]);
    expect(parseChordSymbol("C+")?.intervals).toEqual([0, 4, 8]);
    expect(parseChordSymbol("Cdim")?.intervals).toEqual([0, 3, 6]);
  });

  it("sevenths", () => {
    expect(ivs("C7")).toEqual([0, 4, 7, 10]);
    expect(ivs("Cmaj7")).toEqual([0, 4, 7, 11]);
    expect(ivs("CM7")).toEqual([0, 4, 7, 11]);
    expect(ivs("CΔ")).toEqual([0, 4, 7, 11]);
    expect(ivs("Cm7")).toEqual([0, 3, 7, 10]);
    expect(ivs("Cm7b5")).toEqual([0, 3, 6, 10]);
    expect(ivs("Cø")).toEqual([0, 3, 6, 10]);
    expect(ivs("Cdim7")).toEqual([0, 3, 6, 9]);
  });

  it("sixths", () => {
    expect(ivs("C6")).toEqual([0, 4, 7, 9]);
    expect(ivs("Cm6")).toEqual([0, 3, 7, 9]);
  });

  it("extensions", () => {
    expect(ivs("C9")).toEqual([0, 4, 7, 10, 14]);
    expect(ivs("Cmaj9")).toEqual([0, 4, 7, 11, 14]);
    expect(ivs("Cm9")).toEqual([0, 3, 7, 10, 14]);
    expect(ivs("C13")).toEqual([0, 4, 7, 10, 14, 17, 21]);
  });

  it("suspensions", () => {
    expect(ivs("Csus4")).toEqual([0, 5, 7]);
    expect(ivs("Csus2")).toEqual([0, 2, 7]);
    expect(ivs("C7sus4")).toEqual([0, 5, 7, 10]);
  });

  it("alterations", () => {
    expect(ivs("C7b9")).toEqual([0, 4, 7, 10, 13]);
    expect(ivs("C7#9")).toEqual([0, 4, 7, 10, 15]);
    expect(ivs("C7#11")).toEqual([0, 4, 7, 10, 18]);
    expect(ivs("C7#5")).toEqual([0, 4, 8, 10]);
  });

  it("slash bass", () => {
    const c = parseChordSymbol("C/E");
    expect(c).toMatchObject({ rootPc: 0, bassPc: 4 });
    expect(c?.intervals).toEqual([0, 4, 7]);
    expect(parseChordSymbol("Dm7/G")).toMatchObject({ rootPc: 2, bassPc: 7 });
  });

  it("add", () => {
    expect(ivs("Cadd9")).toEqual([0, 4, 7, 14]);
  });

  it("never throws on junk, returns null without root", () => {
    expect(parseChordSymbol("N.C.")).toBeNull();
    expect(parseChordSymbol("")).toBeNull();
    expect(() => parseChordSymbol("C???")).not.toThrow();
  });
});
