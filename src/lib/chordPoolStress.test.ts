// ── Chord-pool engine stress tests ───────────────────────────────────
// Runs the shared `tonalityChordPool` engine (used by ChordsTab,
// MelodicPatterns and HarmonyWorkshop) over every tonality bank for
// every supported EDO, with every approach kind and every xen variant
// turned on, across 10 000 samples.  Validates:
//
//   - chord PCs are all in [0, edo)
//   - chord PCs are unique within a chord
//   - chordTypeId is non-empty
//   - V/X / iiø/X / TT/X chords resolve to dom7 shapes (M3 + P5 + m7
//     above their root) — the "minor-7th not major-7th" invariant
//   - vii°/X chords resolve to a diminished triad (m3 + d5)
//   - ii-V's V/X part is *not* in the effective pool unless secdom is
//     also enabled (the V/-toggle-owns-V/X invariant)
//   - xen variants (~neu / ~sub / ~sup / ~qrt / ~qnt) produce a chord
//     shape distinct from the parent
//   - functional Markov walks reach non-diatonic chords when boosted
//
// Failures are surfaced as test errors with a sample of offenders.

import { describe, it, expect } from "vitest";
import {
  TONALITY_FAMILIES,
  buildChordMapForTonality,
  getEffectiveCheckedForTonality,
  generatePoolProgression,
  getAllPoolChords,
  applicableXenKinds,
  XEN_KINDS,
  XEN_SUFFIX,
  type XenKind,
} from "./tonalityChordPool";
import {
  getTonalityBanks,
  APPROACH_KINDS,
  type ApproachKind,
} from "./tonalityBanks";
import { getChordShapes, getBaseChords } from "./edoData";

const EDOS = [12, 31, 41] as const;
const TONIC_ROOT = 0;
const SAMPLES_PER_CASE = 200;
const TARGET_TOTAL_SAMPLES = 10000;

interface Bug {
  edo: number;
  tonality: string;
  roman: string;
  chordPcs: number[];
  reason: string;
}

function allCheckedForBank(edo: number, tonality: string): string[] {
  const banks = getTonalityBanks(edo);
  const bank = banks.find(b => b.name === tonality);
  if (!bank) return [];
  const out: string[] = [];
  for (const level of bank.levels) {
    if (level.name !== "Primary" && level.name !== "Diatonic" && level.name !== "Modal Interchange") continue;
    for (const c of level.chords) out.push(c.label);
  }
  return out;
}

function allApproachesForChecked(checked: string[]): Record<string, ApproachKind[]> {
  const out: Record<string, ApproachKind[]> = {};
  for (const lbl of checked) {
    out[lbl] = [...APPROACH_KINDS];
  }
  return out;
}

function allXenForChecked(
  edo: number, tonality: string, checked: string[],
): Record<string, XenKind[]> {
  const baseMap: Record<string, number[]> = Object.fromEntries(getBaseChords(edo));
  const banks = getTonalityBanks(edo);
  const bank = banks.find(b => b.name === tonality);
  if (!bank) return {};
  const stepsByLabel = new Map<string, number[]>();
  for (const level of bank.levels) {
    for (const c of level.chords) {
      const steps = c.steps ?? baseMap[c.label];
      if (steps) stepsByLabel.set(c.label, steps);
    }
  }
  const out: Record<string, XenKind[]> = {};
  for (const lbl of checked) {
    const steps = stepsByLabel.get(lbl);
    if (!steps) continue;
    const avail = applicableXenKinds(steps, edo);
    if (avail.length > 0) out[lbl] = avail;
  }
  return out;
}

describe("chord-pool engine — stress test", () => {
  it("every chord in every progression is well-formed", { timeout: 60000 }, () => {
    let totalSamples = 0;
    const bugs: Bug[] = [];

    // Distribute samples across (edo × tonality) cases.
    const cases: { edo: number; tonality: string }[] = [];
    for (const edo of EDOS) {
      const banks = getTonalityBanks(edo);
      for (const b of banks) cases.push({ edo, tonality: b.name });
    }
    const samplesPerCase = Math.max(SAMPLES_PER_CASE, Math.floor(TARGET_TOTAL_SAMPLES / cases.length));

    for (const { edo, tonality } of cases) {
      const checked = allCheckedForBank(edo, tonality);
      const approaches = allApproachesForChecked(checked);
      const xen = allXenForChecked(edo, tonality, checked);

      for (let i = 0; i < samplesPerCase; i++) {
        const count = 4 + (i % 5); // vary 4..8 chords per progression
        const prog = generatePoolProgression(
          edo, count, tonality, checked, approaches, xen, TONIC_ROOT,
          i % 2 === 0 ? "functional" : "random",
        );
        if (prog.length === 0) continue;

        for (const ch of prog) {
          totalSamples++;

          // PCs in range
          for (const pc of ch.chordPcs) {
            if (pc < 0 || pc >= edo) {
              bugs.push({ edo, tonality, roman: ch.roman, chordPcs: ch.chordPcs, reason: `pc out of range: ${pc}` });
            }
          }
          // PC uniqueness within chord
          const seen = new Set<number>();
          for (const pc of ch.chordPcs) {
            if (seen.has(pc)) {
              bugs.push({ edo, tonality, roman: ch.roman, chordPcs: ch.chordPcs, reason: `duplicate PC ${pc}` });
              break;
            }
            seen.add(pc);
          }
          // chordTypeId present
          if (!ch.chordTypeId || ch.chordTypeId === "") {
            bugs.push({ edo, tonality, roman: ch.roman, chordPcs: ch.chordPcs, reason: "missing chordTypeId" });
          }
          // root is the first PC
          if (ch.chordPcs.length > 0 && ch.root !== ch.chordPcs[0]) {
            bugs.push({ edo, tonality, roman: ch.roman, chordPcs: ch.chordPcs, reason: `root ${ch.root} != chordPcs[0] ${ch.chordPcs[0]}` });
          }
        }
      }
    }

    if (bugs.length > 0) {
      const sample = bugs.slice(0, 10);
      throw new Error(`Found ${bugs.length} well-formedness bugs across ${totalSamples} chord samples.\nFirst 10:\n${JSON.stringify(sample, null, 2)}`);
    }

    expect(totalSamples).toBeGreaterThan(0);
  });

  it("V/X and TT/X resolve to dom7 (M3 + P5 + m7), not maj7", () => {
    const bugs: Bug[] = [];

    for (const edo of EDOS) {
      const sh = getChordShapes(edo);
      const banks = getTonalityBanks(edo);
      for (const bank of banks) {
        const tonality = bank.name;
        const checked = allCheckedForBank(edo, tonality);
        const approaches = allApproachesForChecked(checked);
        // No xen here — we want to see the bare V/X / TT/X shapes.
        const xen = {};

        const allChords = getAllPoolChords(edo, tonality, checked, approaches, xen, TONIC_ROOT);
        for (const ch of allChords) {
          if (!ch.roman.startsWith("V/") && !ch.roman.startsWith("TT/")) continue;
          // Expect 4-note dom7 shape
          if (ch.chordPcs.length < 4) {
            bugs.push({ edo, tonality, roman: ch.roman, chordPcs: ch.chordPcs, reason: `expected 4-note dom7, got ${ch.chordPcs.length} notes` });
            continue;
          }
          const r = ch.chordPcs[0];
          const rels = ch.chordPcs.map(p => ((p - r) % edo + edo) % edo).sort((a, b) => a - b);
          const expected = [0, sh.M3, sh.P5, sh.m7].sort((a, b) => a - b);
          if (rels.join(",") !== expected.join(",")) {
            bugs.push({ edo, tonality, roman: ch.roman, chordPcs: ch.chordPcs, reason: `not dom7 — relative ${rels.join(",")}, expected ${expected.join(",")}` });
          }
        }
      }
    }

    if (bugs.length > 0) {
      const sample = bugs.slice(0, 10);
      throw new Error(`Found ${bugs.length} V/X-or-TT/X chords that are not dom7.\nFirst 10:\n${JSON.stringify(sample, null, 2)}`);
    }
  });

  it("vii°/X resolves to a diminished triad (m3 + d5)", () => {
    const bugs: Bug[] = [];

    for (const edo of EDOS) {
      const sh = getChordShapes(edo);
      const banks = getTonalityBanks(edo);
      for (const bank of banks) {
        const tonality = bank.name;
        const checked = allCheckedForBank(edo, tonality);
        const approaches = allApproachesForChecked(checked);
        const allChords = getAllPoolChords(edo, tonality, checked, approaches, {}, TONIC_ROOT);
        for (const ch of allChords) {
          if (!ch.roman.startsWith("vii°/")) continue;
          if (ch.chordPcs.length !== 3) {
            bugs.push({ edo, tonality, roman: ch.roman, chordPcs: ch.chordPcs, reason: `expected 3-note dim, got ${ch.chordPcs.length}` });
            continue;
          }
          const r = ch.chordPcs[0];
          const rels = ch.chordPcs.map(p => ((p - r) % edo + edo) % edo).sort((a, b) => a - b);
          const expected = [0, sh.m3, sh.d5].sort((a, b) => a - b);
          if (rels.join(",") !== expected.join(",")) {
            bugs.push({ edo, tonality, roman: ch.roman, chordPcs: ch.chordPcs, reason: `not dim triad — relative ${rels.join(",")}` });
          }
        }
      }
    }

    if (bugs.length > 0) {
      const sample = bugs.slice(0, 10);
      throw new Error(`Found ${bugs.length} vii°/X chords that are not diminished triads.\nFirst 10:\n${JSON.stringify(sample, null, 2)}`);
    }
  });

  it("ii-V toggle alone never adds V/X to the effective pool", () => {
    const bugs: { edo: number; tonality: string; offending: string[] }[] = [];
    for (const edo of EDOS) {
      const banks = getTonalityBanks(edo);
      for (const bank of banks) {
        const tonality = bank.name;
        const checked = allCheckedForBank(edo, tonality);
        // Only ii-V on every checked target — NOT secdom.
        const approaches: Record<string, ApproachKind[]> = {};
        for (const lbl of checked) approaches[lbl] = ["iiV"];
        const eff = getEffectiveCheckedForTonality(edo, tonality, checked, approaches, {})
          .filter(l => l.startsWith("V/") || l.startsWith("ii/") || l.startsWith("iiø/"));
        const offending = eff.filter(l => l.startsWith("V/"));
        if (offending.length > 0) bugs.push({ edo, tonality, offending });
      }
    }
    if (bugs.length > 0) {
      throw new Error(`ii-V leaked V/X labels for ${bugs.length} (edo,tonality) cases:\n${JSON.stringify(bugs.slice(0, 8), null, 2)}`);
    }
  });

  it("xen variants ~neu / ~sub / ~sup / ~qrt / ~qnt produce shapes distinct from the parent", () => {
    const bugs: { edo: number; tonality: string; parent: string; kind: XenKind; reason: string }[] = [];
    for (const edo of EDOS) {
      const banks = getTonalityBanks(edo);
      for (const bank of banks) {
        const tonality = bank.name;
        const checked = allCheckedForBank(edo, tonality);
        const xen = allXenForChecked(edo, tonality, checked);
        const map = buildChordMapForTonality(edo as number, tonality, {}, xen) as never;
        // Re-call with positional args
        const chordMap = buildChordMapForTonality(tonality, edo, {}, xen);
        void map;
        for (const [parent, kinds] of Object.entries(xen)) {
          const parentShape = chordMap[parent];
          for (const k of kinds) {
            const variantLabel = `${parent}${XEN_SUFFIX}${k}`;
            const variantShape = chordMap[variantLabel];
            if (!variantShape || variantShape.length === 0) {
              bugs.push({ edo, tonality, parent, kind: k, reason: "variant missing from chord map" });
              continue;
            }
            // qrt / qnt always replace the stack — should differ from parent.
            // neu / sub / sup change the 3rd — should also differ.
            const same = parentShape.length === variantShape.length
              && parentShape.every((s, i) => s === variantShape[i]);
            if (same) {
              bugs.push({ edo, tonality, parent, kind: k, reason: "variant shape identical to parent" });
            }
          }
        }
      }
    }
    if (bugs.length > 0) {
      throw new Error(`${bugs.length} xen variants did not produce distinct shapes:\n${JSON.stringify(bugs.slice(0, 12), null, 2)}`);
    }
  });

  it("XEN_KINDS list and applicableXenKinds stay consistent", () => {
    // applicableXenKinds must only return kinds in XEN_KINDS.
    for (const edo of EDOS) {
      const probeShapes = [
        [0, getChordShapes(edo).M3, getChordShapes(edo).P5],
        [0, getChordShapes(edo).m3, getChordShapes(edo).P5],
        [0, getChordShapes(edo).m3, getChordShapes(edo).d5],
        [0, getChordShapes(edo).M2, getChordShapes(edo).P5], // sus2
        [0, getChordShapes(edo).P4, getChordShapes(edo).P5], // sus4
      ];
      for (const shape of probeShapes) {
        const ks = applicableXenKinds(shape, edo);
        for (const k of ks) {
          expect(XEN_KINDS).toContain(k);
        }
      }
    }
  });

  it("EDO-specific xen options match the documented table", () => {
    // Probe a known major-3rd chord (M3 above root) and a known minor-3rd
    // chord (m3 above root) in each EDO and assert the per-side xen-kind
    // list matches the table's promises.  qrt + qnt always present.
    const sh = (e: number) => getChordShapes(e);
    const cases: { edo: number; majSide: string[]; minSide: string[] }[] = [
      { edo: 12, majSide: ["qrt", "qnt"], minSide: ["qrt", "qnt"] }, // no tertian
      { edo: 17, majSide: ["qrt", "qnt"], minSide: ["qrt", "qnt"] }, // 17 has none
      { edo: 19, majSide: ["sup", "qrt", "qnt"], minSide: ["sub", "qrt", "qnt"] }, // no neutral
      { edo: 31, majSide: ["neu", "sup", "qrt", "qnt"], minSide: ["neu", "sub", "qrt", "qnt"] },
      { edo: 41, majSide: ["neu", "clmaj", "sup", "qrt", "qnt"], minSide: ["neu", "clmin", "sub", "qrt", "qnt"] },
    ];
    for (const c of cases) {
      const major = applicableXenKinds([0, sh(c.edo).M3, sh(c.edo).P5], c.edo);
      const minor = applicableXenKinds([0, sh(c.edo).m3, sh(c.edo).P5], c.edo);
      expect(major).toEqual(c.majSide);
      expect(minor).toEqual(c.minSide);
    }
  });

  it("functional walks visit non-diatonic boost chords when present", () => {
    // Check that adding modal-interchange chords + secdom approaches actually
    // surfaces them in some progressions.  Statistical assertion.
    const checks: { edo: number; tonality: string; surfaced: number; samples: number; nonDiatonicLabels: string[] }[] = [];
    for (const edo of EDOS) {
      // Use the Major bank in each EDO since it has Modal Interchange.
      const tonality = "Major";
      const banks = getTonalityBanks(edo);
      const bank = banks.find(b => b.name === tonality);
      if (!bank) continue;
      const checked = allCheckedForBank(edo, tonality);
      const diatonicSet = new Set<string>();
      for (const level of bank.levels) {
        if (level.name === "Primary" || level.name === "Diatonic") {
          for (const c of level.chords) diatonicSet.add(c.label);
        }
      }
      const nonDiatonic = checked.filter(l => !diatonicSet.has(l));
      if (nonDiatonic.length === 0) continue;
      // Enable secdom on every non-tonic chord too (more variety).
      const approaches: Record<string, ApproachKind[]> = {};
      for (const lbl of checked) {
        if (lbl !== "I" && lbl !== "i") approaches[lbl] = ["secdom"];
      }
      let surfaced = 0;
      const samples = 200;
      for (let i = 0; i < samples; i++) {
        const prog = generatePoolProgression(edo, 6, tonality, checked, approaches, {}, TONIC_ROOT, "functional");
        for (const ch of prog) {
          if (!diatonicSet.has(ch.roman)) { surfaced++; break; }
        }
      }
      checks.push({ edo, tonality, surfaced, samples, nonDiatonicLabels: nonDiatonic });
    }
    // Expect at least 30% of progressions to surface a non-diatonic chord
    for (const c of checks) {
      const ratio = c.surfaced / c.samples;
      if (ratio < 0.3) {
        throw new Error(`Non-diatonic chords under-surfaced in ${c.edo}-EDO ${c.tonality}: ${c.surfaced}/${c.samples} (${(ratio * 100).toFixed(1)}%) — pool had ${c.nonDiatonicLabels.length} non-diatonic labels.`);
      }
    }
  });
});
