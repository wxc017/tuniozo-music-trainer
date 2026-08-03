import { describe, it, expect } from "vitest";
import { pdfSafeText } from "./exportPdf";

// jsPDF's standard fonts are cp1252, one byte per character. Anything above
// U+00FF is emitted as its two UTF-16 bytes, so it prints as a pair of
// unrelated Latin-1 characters rather than failing. These cases pin the
// transliteration that stops that happening.

describe("pdfSafeText", () => {
  it("rewrites the cycle-length label that printed as \"'ó\"", () => {
    // "⟳" is U+27F3 -> 0x27 0xF3 -> "'" + "ó" in the PDF.
    expect(pdfSafeText("⟳15")).toBe("cyc 15");
    expect(pdfSafeText("⟳15…")).toBe("cyc 15...");
  });

  it("leaves Latin-1 completely alone", () => {
    const latin1 = "Ma Da La Sa Ta Ra 4/4 — café ñ ° × ¼";
    for (const ch of latin1) {
      if (ch.codePointAt(0)! <= 0xff) expect(pdfSafeText(ch)).toBe(ch);
    }
    expect(pdfSafeText("Sa Ta Da 15/8")).toBe("Sa Ta Da 15/8");
  });

  it("transliterates accidentals and punctuation rather than mangling them", () => {
    expect(pdfSafeText("F♯ B♭ C♮")).toBe("F# Bb Cn");
    expect(pdfSafeText("“quoted” – it’s")).toBe('"quoted" - it\'s');
  });

  it("falls back to ? for anything unmapped, never to mojibake", () => {
    const out = pdfSafeText("♜");                 // no sensible print form
    expect(out).toBe("?");
    expect(out).not.toContain("ó");
  });

  it("never emits a codepoint the PDF font can't encode", () => {
    const messy = "⟳15… F♯ → ≤ • ‰ ♜ 中";
    for (const ch of pdfSafeText(messy)) {
      expect(ch.codePointAt(0)).toBeLessThanOrEqual(0xff);
    }
  });

  it("is idempotent — re-exporting a sanitised string changes nothing", () => {
    const once = pdfSafeText("⟳15… F♯");
    expect(pdfSafeText(once)).toBe(once);
  });
});
