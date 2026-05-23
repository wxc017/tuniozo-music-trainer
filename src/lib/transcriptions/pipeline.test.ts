// Integration smoke test: real generated corpora flow through the
// excerpt picker and the notation segmentation without throwing, and the
// excerpt windows are correctly bounded + rebased.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pickExcerpt } from "./loader";
import { segmentByBar, decomposeDuration } from "./notation";
import { beatsPerBar, type TxItem } from "./types";

const DIR = join(process.cwd(), "public", "transcriptions");
const SOURCES = ["thesession", "essen", "weimar", "cocopops"];

function load(source: string): TxItem[] | null {
  const f = join(DIR, `${source}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
}

describe("transcriptions pipeline (real corpora)", () => {
  for (const source of SOURCES) {
    const items = load(source);
    const present = !!items?.length;
    it.skipIf(!present)(`${source}: excerpts stay in-window and notate`, () => {
      // Sample up to 25 items across a few window sizes.
      const sample = items!.slice(0, 25);
      for (const item of sample) {
        expect(item.barCount).toBeGreaterThan(0);
        for (const bars of [1, 2, 4]) {
          const ex = pickExcerpt(item, bars);
          const win = ex.windowBeats;
          // Every event lies within [0, windowBeats].
          for (const n of ex.melody) {
            expect(n.startBeat).toBeGreaterThanOrEqual(-1e-6);
            expect(n.startBeat + n.durBeats).toBeLessThanOrEqual(win + 1e-6);
            expect(Number.isFinite(n.midi)).toBe(true);
          }
          for (const c of ex.chords) {
            expect(c.startBeat).toBeGreaterThanOrEqual(-1e-6);
            expect(c.startBeat + c.durBeats).toBeLessThanOrEqual(win + 1e-6);
          }
          // Segmentation + duration decomposition never throw / never empty.
          const bpb = beatsPerBar(item.timeSig);
          const segs = segmentByBar(
            ex.melody.map(n => ({ startBeat: n.startBeat, durBeats: n.durBeats, data: n.midi })),
            ex.bars, bpb,
          );
          expect(segs.length).toBe(ex.bars);
          for (const n of ex.melody) expect(decomposeDuration(n.durBeats).length).toBeGreaterThan(0);
        }
      }
    });
  }

  it("has at least one source built (else seed fallback is used at runtime)", () => {
    const any = SOURCES.some(s => load(s)?.length);
    expect(any).toBe(true);
  });
});
