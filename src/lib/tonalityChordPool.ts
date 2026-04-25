// Shared pool-driven progression engine used by MelodicPatterns and
// HarmonyWorkshop.  Resolves tonality-bank entries (Primary / Diatonic /
// Modal Interchange / etc.) plus per-target approach toggles and per-chord
// xen-variant toggles into chord PCs, and walks the existing
// `generateFunctionalLoop` Markov chain over that pool to produce a
// musically-coherent progression.

import { generateFunctionalLoop } from "@/lib/musicTheory";
import {
  type ProgressionMode,
  type Tonality,
} from "@/lib/melodicPatternData";
import {
  getApproachChords, getTonalityBanks,
  type ApproachKind,
} from "@/lib/tonalityBanks";
import { getBaseChords, getChordShapes, getEdoChordTypes } from "@/lib/edoData";

// ── Tonality families (mirrors ChordsTab) ────────────────────────────
export const TONALITY_FAMILIES: { key: string; label: string; color: string; tonalities: string[] }[] = [
  { key: "major",    label: "MAJOR",          color: "#6a9aca",
    tonalities: ["Major","Dorian","Phrygian","Lydian","Mixolydian","Aeolian","Locrian"] },
  { key: "harmonic", label: "HARMONIC MINOR", color: "#c09050",
    tonalities: ["Harmonic Minor","Locrian #6","Ionian #5","Dorian #4","Phrygian Dominant","Lydian #2","Ultralocrian"] },
  { key: "melodic",  label: "MELODIC MINOR",  color: "#c06090",
    tonalities: ["Melodic Minor","Dorian b2","Lydian Augmented","Lydian Dominant","Mixolydian b6","Locrian #2","Altered"] },
];

// Tonality bank name → (scaleFamily, scaleMode) used by the melody pool builder.
export function bankToScaleFamMode(tonality: string): [string, string] {
  if (tonality === "Major") return ["Major Family", "Ionian"];
  for (const f of TONALITY_FAMILIES) {
    if (f.tonalities.includes(tonality)) {
      const fam = f.key === "major" ? "Major Family"
               : f.key === "harmonic" ? "Harmonic Minor Family"
               : "Melodic Minor Family";
      return [fam, tonality];
    }
  }
  return ["Major Family", "Ionian"];
}

// Tonality → "major" | "minor" | "both".
export function bankToMajMinBoth(tonality: string): Tonality {
  const [, mode] = bankToScaleFamMode(tonality);
  const major = new Set([
    "Ionian","Lydian","Mixolydian","Ionian #5","Lydian Augmented","Lydian Dominant","Mixolydian b6","Lydian #2",
  ]);
  const minor = new Set([
    "Aeolian","Dorian","Phrygian","Locrian","Harmonic Minor","Locrian #6","Dorian #4","Phrygian Dominant",
    "Ultralocrian","Melodic Minor","Dorian b2","Locrian #2",
  ]);
  if (major.has(mode)) return "major";
  if (minor.has(mode)) return "minor";
  return "both";
}

// ── Xen variants ─────────────────────────────────────────────────────
// "neu" / "sub" / "sup" alter the chord's 3rd; "qrt" / "qnt" replace the
// stack with quartal / quintal voicings respectively.
export type XenKind = "neu" | "sub" | "sup" | "clmin" | "clmaj" | "qrt" | "qnt";
export const XEN_KINDS: XenKind[] = ["neu", "sub", "sup", "clmin", "clmaj", "qrt", "qnt"];
export const XEN_LABEL: Record<XenKind, string> = {
  neu: "neu", sub: "sub", sup: "sup",
  clmin: "cl.min", clmaj: "cl.maj",
  qrt: "qua", qnt: "quin",
};
export const XEN_COLOR: Record<XenKind, string> = {
  neu:   "#9a66c0", // neutral — purple
  sub:   "#7aaa6a", // subminor — green
  sup:   "#cc6a8a", // supermajor — pink
  clmin: "#5a8a5a", // classical minor (5-limit) — darker green
  clmaj: "#a85a78", // classical major (5-limit) — darker pink
  qrt:   "#4a9ac7", // quartal — teal
  qnt:   "#c8aa50", // quintal — amber
};
export const XEN_SUFFIX = "~"; // chord-label separator: "I~neu", "ii~sub", "I~qrt"

// EDO-specific table of xen 3rd intervals.  Each value is the step count
// (within one octave) for that interval, or undefined when the EDO
// doesn't expose a distinct quality at that pedagogical position.
//
//   17-EDO  →  m3=4 is already subminor-ish, M3=6 is supermajor-ish; no
//              distinct neutral / sub / sup beyond the defaults.
//   19-EDO  →  m3=5 / M3=6 are classical thirds; sub=4 and sup=7 exist
//              but there's no room for a neutral third.
//   31-EDO  →  full sub / neu / sup; no separate classical thirds (m3
//              already sits between Pythagorean and 5-limit).
//   41-EDO  →  m3 / M3 are Pythagorean; classical 5-limit thirds
//              (clmin / clmaj) sit one step inside, plus full
//              sub / neu / sup on either side.
export function xenIntervalsForEdo(edo: number): Partial<Record<"neu" | "sub" | "sup" | "clmin" | "clmaj", number>> {
  if (edo === 12 || edo === 17) return {};
  if (edo === 19) return { sub: 4, sup: 7 };
  if (edo === 31) return { neu: 9, sub: 7, sup: 11 };
  if (edo === 41) return { sub: 9, clmin: 11, neu: 12, clmaj: 13, sup: 15 };
  // Generic fallback for unsupported EDOs — derive sub / neu / sup, skip
  // clmin / clmaj since 5-limit splits aren't well-defined off the table.
  const sh = getChordShapes(edo);
  const distinct = (n: number) => n > 0 && n < edo
    && n !== sh.m3 && n !== sh.M3 && n !== sh.M2 && n !== sh.P4;
  const neu = Math.round((sh.m3 + sh.M3) / 2);
  const sub = sh.m3 - 1;
  const sup = sh.M3 + 1;
  return {
    ...(distinct(neu) ? { neu } : {}),
    ...(distinct(sub) ? { sub } : {}),
    ...(distinct(sup) ? { sup } : {}),
  };
}

export function applyXenKind(steps: number[], kind: XenKind, edo: number): number[] | null {
  if (steps.length < 2) return null;
  const sh = getChordShapes(edo);
  const root = steps[0];
  if (kind === "qrt") return [root, root + sh.P4, root + 2 * sh.P4];
  if (kind === "qnt") return [root, root + sh.P5, root + 2 * sh.P5];
  const xen = xenIntervalsForEdo(edo);
  const newThird = xen[kind];
  if (newThird === undefined) return null;
  const third = steps[1] - root;
  if (newThird === third) return null;
  return [root, root + newThird, ...steps.slice(2)];
}

export function applicableXenKinds(steps: number[], edo: number): XenKind[] {
  if (steps.length < 2) return [];
  const sh = getChordShapes(edo);
  const third = steps[1] - steps[0];
  const xen = xenIntervalsForEdo(edo);
  const out: XenKind[] = [];
  // Tertian alterations are filtered to the same major/minor side as the
  // chord's natural 3rd — neutral applies to either side when present.
  if (third === sh.M3) {
    if (xen.neu   !== undefined) out.push("neu");
    if (xen.clmaj !== undefined) out.push("clmaj");
    if (xen.sup   !== undefined) out.push("sup");
  } else if (third === sh.m3) {
    if (xen.neu   !== undefined) out.push("neu");
    if (xen.clmin !== undefined) out.push("clmin");
    if (xen.sub   !== undefined) out.push("sub");
  }
  // Quartal / quintal apply to any chord with at least a 3rd.
  out.push("qrt");
  out.push("qnt");
  return out;
}

// ── Chord-map / pool builders ────────────────────────────────────────

export function buildChordMapForTonality(
  tonality: string, edo: number,
  approachesForT: Record<string, ApproachKind[]> = {},
  xenForT: Record<string, XenKind[]> = {},
): Record<string, number[]> {
  const baseMap: Record<string, number[]> = Object.fromEntries(getBaseChords(edo));
  const banks = getTonalityBanks(edo);
  const bank = banks.find(b => b.name === tonality);
  const map: Record<string, number[]> = { ...baseMap };
  if (bank) {
    for (const level of bank.levels) {
      for (const e of level.chords) {
        if (e.steps && !map[e.label]) map[e.label] = e.steps;
      }
    }
    // Approach targets — only Primary/Diatonic, since approaches don't
    // really make sense for borrowed (modal-interchange) chords.
    const approachTargets = new Map<string, number[]>();
    // Xen targets — every visible chord (Primary, Diatonic, AND Modal
    // Interchange), so MI chords like bVII can also pick up qrt/qnt etc.
    const xenTargets = new Map<string, number[]>();
    for (const level of bank.levels) {
      const isApproachLevel = level.name === "Primary" || level.name === "Diatonic";
      const isXenLevel = isApproachLevel || level.name === "Modal Interchange";
      for (const c of level.chords) {
        const steps = c.steps ?? baseMap[c.label];
        if (!steps) continue;
        if (isApproachLevel) approachTargets.set(c.label, steps);
        if (isXenLevel) xenTargets.set(c.label, steps);
      }
    }
    for (const [target, kinds] of Object.entries(approachesForT)) {
      const steps = approachTargets.get(target);
      if (!steps) continue;
      for (const kind of kinds) {
        for (const e of getApproachChords(target, steps, kind, edo)) {
          if (e.steps && !map[e.label]) map[e.label] = e.steps;
        }
      }
    }
    for (const [target, kinds] of Object.entries(xenForT)) {
      const steps = xenTargets.get(target);
      if (!steps) continue;
      for (const kind of kinds) {
        const variantSteps = applyXenKind(steps, kind, edo);
        if (!variantSteps) continue;
        const label = `${target}${XEN_SUFFIX}${kind}`;
        if (!map[label]) map[label] = variantSteps;
      }
    }
  }
  return map;
}

export function getEffectiveCheckedForTonality(
  tonality: string, edo: number,
  checked: string[],
  approachesForT: Record<string, ApproachKind[]>,
  xenForT: Record<string, XenKind[]> = {},
): string[] {
  const out = new Set(checked);
  const banks = getTonalityBanks(edo);
  const bank = banks.find(b => b.name === tonality);
  if (!bank) return Array.from(out);
  const baseMap: Record<string, number[]> = Object.fromEntries(getBaseChords(edo));
  const approachTargets = new Map<string, number[]>();
  const xenTargets = new Map<string, number[]>();
  for (const level of bank.levels) {
    const isApproachLevel = level.name === "Primary" || level.name === "Diatonic";
    const isXenLevel = isApproachLevel || level.name === "Modal Interchange";
    for (const c of level.chords) {
      const steps = c.steps ?? baseMap[c.label];
      if (!steps) continue;
      if (isApproachLevel) approachTargets.set(c.label, steps);
      if (isXenLevel) xenTargets.set(c.label, steps);
    }
  }
  for (const [target, kinds] of Object.entries(approachesForT)) {
    const steps = approachTargets.get(target);
    if (!steps) continue;
    for (const kind of kinds) {
      for (const e of getApproachChords(target, steps, kind, edo)) {
        // ii-V's V/X part is owned by the V/ (secdom) toggle.
        if (kind === "iiV" && e.label.startsWith("V/")) continue;
        out.add(e.label);
      }
    }
  }
  for (const [target, kinds] of Object.entries(xenForT)) {
    const steps = xenTargets.get(target);
    if (!steps) continue;
    for (const kind of kinds) {
      const variantSteps = applyXenKind(steps, kind, edo);
      if (!variantSteps) continue;
      out.add(`${target}${XEN_SUFFIX}${kind}`);
    }
  }
  return Array.from(out);
}

function inferChordTypeId(steps: number[], edo: number): string {
  const chordTypes = getEdoChordTypes(edo);
  if (steps.length === 0) return "chord";
  const root = steps[0];
  const rels = steps.map(s => ((s - root) % edo + edo) % edo).sort((a, b) => a - b).join(",");
  for (const ct of chordTypes) {
    const ctRels = ct.steps.slice().sort((a, b) => a - b).join(",");
    if (ctRels === rels) return ct.id;
  }
  return "chord";
}

export interface PoolProgChord {
  roman: string;
  chordPcs: number[];
  root: number;
  chordTypeId: string;
}

// Pool-driven progression generator (Markov walk over user-checked labels).
export function generatePoolProgression(
  edo: number,
  count: number,
  tonality: string,
  checked: string[],
  approachesForT: Record<string, ApproachKind[]>,
  xenForT: Record<string, XenKind[]>,
  tonicRoot: number,
  mode: ProgressionMode,
): PoolProgChord[] {
  if (count <= 0) return [];
  const chordMap = buildChordMapForTonality(tonality, edo, approachesForT, xenForT);
  const effective = getEffectiveCheckedForTonality(tonality, edo, checked, approachesForT, xenForT)
    .filter(l => chordMap[l] && chordMap[l].length > 0);
  if (effective.length === 0) return [];

  let labels: string[] | null = null;
  if (mode === "functional") {
    const banks = getTonalityBanks(edo);
    const bank = banks.find(b => b.name === tonality);
    const diatonicSet = new Set<string>();
    if (bank) {
      for (const level of bank.levels) {
        if (level.name === "Primary" || level.name === "Diatonic") {
          for (const c of level.chords) diatonicSet.add(c.label);
        }
      }
    }
    const boost = new Set<string>();
    for (const lbl of effective) if (!diatonicSet.has(lbl)) boost.add(lbl);
    // Xen-variant labels share their parent chord's transitions in the Markov
    // graph — substitute parent for the walk and remap variants afterwards.
    const variantToParent = new Map<string, string>();
    const markovAvailable = effective.map(lbl => {
      const idx = lbl.indexOf(XEN_SUFFIX);
      if (idx > 0) {
        const parent = lbl.slice(0, idx);
        variantToParent.set(lbl, parent);
        return parent;
      }
      return lbl;
    });
    const markovBoost = new Set<string>();
    for (const lbl of boost) {
      const parent = variantToParent.get(lbl) ?? lbl;
      markovBoost.add(parent);
    }
    const parentLabels = generateFunctionalLoop(markovAvailable, count, 300, markovBoost);
    if (parentLabels) {
      const variantsByParent = new Map<string, string[]>();
      for (const lbl of effective) {
        const idx = lbl.indexOf(XEN_SUFFIX);
        if (idx > 0) {
          const parent = lbl.slice(0, idx);
          if (!variantsByParent.has(parent)) variantsByParent.set(parent, []);
          variantsByParent.get(parent)!.push(lbl);
        }
      }
      const parentChecked = new Set(effective.filter(l => !l.includes(XEN_SUFFIX)));
      labels = parentLabels.map(parent => {
        const variants = variantsByParent.get(parent) ?? [];
        const candidates: string[] = [];
        if (parentChecked.has(parent)) candidates.push(parent);
        candidates.push(...variants);
        if (candidates.length === 0) return parent;
        return candidates[Math.floor(Math.random() * candidates.length)];
      });
    }
  }
  if (!labels) {
    labels = Array.from({ length: count }, () => effective[Math.floor(Math.random() * effective.length)]);
  }

  return labels.map(roman => {
    const steps = chordMap[roman] ?? [0];
    const chordPcs = steps.map(s => ((s + tonicRoot) % edo + edo) % edo);
    const root = ((steps[0] + tonicRoot) % edo + edo) % edo;
    return { roman, chordPcs, root, chordTypeId: inferChordTypeId(steps, edo) };
  });
}

// Enumerate every chord in one tonality's effective pool.
export function getAllPoolChords(
  edo: number, tonality: string, checked: string[],
  approachesForT: Record<string, ApproachKind[]>,
  xenForT: Record<string, XenKind[]>,
  tonicRoot: number,
): PoolProgChord[] {
  const chordMap = buildChordMapForTonality(tonality, edo, approachesForT, xenForT);
  const effective = getEffectiveCheckedForTonality(tonality, edo, checked, approachesForT, xenForT)
    .filter(l => chordMap[l] && chordMap[l].length > 0);
  return effective.map(roman => {
    const steps = chordMap[roman];
    const chordPcs = steps.map(s => ((s + tonicRoot) % edo + edo) % edo);
    const root = ((steps[0] + tonicRoot) % edo + edo) % edo;
    return { roman, chordPcs, root, chordTypeId: inferChordTypeId(steps, edo) };
  });
}

// Pick one chord from the pool whose PCs best fit a melody.
export function pickPoolChordForMelody(
  edo: number, melodyPcs: number[],
  tonality: string, checked: string[],
  approachesForT: Record<string, ApproachKind[]>,
  xenForT: Record<string, XenKind[]>,
  tonicRoot: number,
): PoolProgChord | null {
  const chordMap = buildChordMapForTonality(tonality, edo, approachesForT, xenForT);
  const effective = getEffectiveCheckedForTonality(tonality, edo, checked, approachesForT, xenForT)
    .filter(l => chordMap[l] && chordMap[l].length > 0);
  if (effective.length === 0) return null;
  const melodyPcSet = new Set(melodyPcs.map(p => ((p % edo) + edo) % edo));
  let best: { label: string; score: number } | null = null;
  for (const label of effective) {
    const steps = chordMap[label];
    const pcs = steps.map(s => ((s + tonicRoot) % edo + edo) % edo);
    let overlap = 0;
    for (const pc of pcs) if (melodyPcSet.has(pc)) overlap++;
    const score = overlap / Math.max(1, pcs.length);
    if (!best || score > best.score) best = { label, score };
  }
  if (!best) return null;
  const steps = chordMap[best.label];
  const chordPcs = steps.map(s => ((s + tonicRoot) % edo + edo) % edo);
  const root = ((steps[0] + tonicRoot) % edo + edo) % edo;
  return { roman: best.label, chordPcs, root, chordTypeId: inferChordTypeId(steps, edo) };
}
