// Guard: every modal-interchange chord the sized banks emit must have a
// functional resolution row in FUNCTIONAL_WEIGHTS_TABLE, so borrowed colours
// resolve musically rather than via the generic completion-pass fallback.
import { describe, it, expect } from "vitest";
import { getSizedTonalityBanks } from "./tonalityBanks";
import { FUNCTIONAL_WEIGHTS_TABLE } from "./musicTheory";

describe("modal-interchange wiring", () => {
  it("every borrowed chord across all EDOs has a resolution row", () => {
    const EDOS = [12, 19, 22, 31, 41, 50, 53];
    const miLabels = new Set<string>();
    for (const edo of EDOS) {
      for (const bank of getSizedTonalityBanks(edo)) {
        for (const level of bank.levels) {
          if (level.name !== "Modal Interchange") continue;
          for (const c of level.chords) miLabels.add(c.label);
        }
      }
    }
    // augmented "+" labels share their functional base (e.g. V+ → V).
    const base = (l: string) => l.replace(/\+$/, "");
    const missing = [...miLabels].filter(l => !FUNCTIONAL_WEIGHTS_TABLE[base(l)]).sort();
    expect(missing, `modal-interchange labels missing a resolution row: ${missing.join(", ")}`).toEqual([]);
  });
});
