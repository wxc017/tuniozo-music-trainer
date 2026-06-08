// ── Interval Spectrum (Margo Schulter's regions) ──────────────────
// Margo Schulter, "Regions of the Interval Spectrum" — every interval in
// the octave categorised into regions (with fuzzy borders) by cents, with
// sub-categories and the just-intonation ratios that live in each.
// Source: https://www.bestii.com/~mschulter/IntervalSpectrumRegions.txt

import { XEN_INTERVALS_BY_LIMIT } from "./xenIntervals";

export interface SubRegion { name: string; lo: number; hi: number; }
export interface Region {
  name: string;
  lo: number;
  hi: number;
  /** "main" = a named interval category; "between" = comma/diesis/
   *  interseptimal/equable transitional regions. */
  kind: "main" | "between";
  subs?: SubRegion[];
  /** Notable just-intonation ratios in this region. */
  jis: string[];
}

export const REGIONS: Region[] = [
  { name: "Pure Unison", lo: 0, hi: 0, kind: "between", jis: ["1/1"] },
  { name: "Commas", lo: 1, hi: 30, kind: "between",
    jis: ["352/351", "364/363", "896/891", "144/143", "81/80", "64/63"] },
  { name: "Dieses", lo: 30, hi: 60, kind: "between",
    jis: ["49/48", "128/125", "36/35", "33/32", "91/88"] },
  { name: "Minor Seconds", lo: 60, hi: 125, kind: "main",
    subs: [{ name: "small", lo: 60, hi: 80 }, { name: "middle", lo: 80, hi: 100 }, { name: "large", lo: 100, hi: 125 }],
    jis: ["28/27", "22/21", "256/243", "16/15", "15/14"] },
  { name: "Neutral Seconds", lo: 125, hi: 170, kind: "main",
    subs: [{ name: "small (supraminor)", lo: 125, hi: 135 }, { name: "middle (central)", lo: 135, hi: 160 }, { name: "large (submajor)", lo: 160, hi: 170 }],
    jis: ["14/13", "13/12", "88/81", "12/11", "11/10"] },
  { name: "Equable Heptatonic", lo: 160, hi: 182, kind: "between", jis: ["11/10", "10/9"] },
  { name: "Major Seconds", lo: 180, hi: 240, kind: "main",
    subs: [{ name: "small", lo: 180, hi: 200 }, { name: "middle", lo: 200, hi: 220 }, { name: "large", lo: 220, hi: 240 }],
    jis: ["10/9", "19/17", "9/8", "17/15", "8/7"] },
  { name: "Interseptimal (M2–m3)", lo: 240, hi: 260, kind: "between", jis: ["147/128", "15/13", "22/19"] },
  { name: "Minor Thirds", lo: 260, hi: 330, kind: "main",
    subs: [{ name: "small", lo: 260, hi: 280 }, { name: "middle", lo: 280, hi: 300 }, { name: "large", lo: 300, hi: 330 }],
    jis: ["7/6", "13/11", "32/27", "6/5"] },
  { name: "Neutral Thirds", lo: 330, hi: 372, kind: "main",
    subs: [{ name: "small (supraminor)", lo: 330, hi: 342 }, { name: "middle (central)", lo: 342, hi: 360 }, { name: "large (submajor)", lo: 360, hi: 372 }],
    jis: ["63/52", "17/14", "39/32", "11/9", "27/22", "16/13", "21/17", "26/21"] },
  { name: "Major Thirds", lo: 372, hi: 440, kind: "main",
    subs: [{ name: "small", lo: 372, hi: 400 }, { name: "middle", lo: 400, hi: 423 }, { name: "large", lo: 423, hi: 440 }],
    jis: ["5/4", "81/64", "14/11", "9/7"] },
  { name: "Interseptimal (M3–4)", lo: 440, hi: 468, kind: "between",
    jis: ["22/17", "13/10", "30/23", "64/49", "17/13"] },
  { name: "Perfect Fourths", lo: 468, hi: 528, kind: "main",
    subs: [{ name: "small", lo: 468, hi: 491 }, { name: "middle", lo: 491, hi: 505 }, { name: "large", lo: 505, hi: 528 }],
    jis: ["21/16", "4/3", "256/189"] },
  { name: "Superfourths", lo: 528, hi: 560, kind: "between", jis: ["49/36", "15/11", "11/8", "243/176"] },
  { name: "Tritonic Region", lo: 560, hi: 640, kind: "main",
    subs: [{ name: "small", lo: 560, hi: 577 }, { name: "middle", lo: 577, hi: 623 }, { name: "large", lo: 623, hi: 640 }],
    jis: ["112/81", "18/13", "25/18", "39/28", "7/5", "1024/729", "45/32", "24/17", "17/12", "64/45", "729/512", "10/7", "56/39", "36/25", "13/9", "81/56"] },
  { name: "Subfifths", lo: 640, hi: 672, kind: "between", jis: ["352/243", "16/11", "3200/2187", "22/15"] },
  { name: "Perfect Fifths", lo: 672, hi: 732, kind: "main",
    subs: [{ name: "small", lo: 672, hi: 695 }, { name: "middle", lo: 695, hi: 709 }, { name: "large", lo: 709, hi: 732 }],
    jis: ["189/128", "3/2", "32/21"] },
  { name: "Interseptimal (5–m6)", lo: 732, hi: 760, kind: "between", jis: ["49/32", "20/13", "17/11"] },
  { name: "Minor Sixths", lo: 760, hi: 828, kind: "main",
    subs: [{ name: "small", lo: 760, hi: 777 }, { name: "middle", lo: 777, hi: 800 }, { name: "large", lo: 800, hi: 828 }],
    jis: ["14/9", "11/7", "128/81", "8/5"] },
  { name: "Neutral Sixths", lo: 828, hi: 870, kind: "main",
    subs: [{ name: "small (supraminor)", lo: 828, hi: 840 }, { name: "middle (central)", lo: 840, hi: 858 }, { name: "large (submajor)", lo: 858, hi: 870 }],
    jis: ["21/13", "34/21", "13/8", "44/27", "18/11", "64/39", "104/63"] },
  { name: "Major Sixths", lo: 870, hi: 940, kind: "main",
    subs: [{ name: "small", lo: 870, hi: 900 }, { name: "middle", lo: 900, hi: 920 }, { name: "large", lo: 920, hi: 940 }],
    jis: ["5/3", "27/16", "17/10", "12/7"] },
  { name: "Interseptimal (M6–m7)", lo: 940, hi: 960, kind: "between", jis: ["19/11", "26/15"] },
  { name: "Minor Sevenths", lo: 960, hi: 1025, kind: "main",
    subs: [{ name: "small", lo: 960, hi: 987 }, { name: "middle", lo: 987, hi: 1000 }, { name: "large", lo: 1000, hi: 1025 }],
    jis: ["7/4", "16/9", "9/5"] },
  { name: "Equable Heptatonic", lo: 1018, hi: 1040, kind: "between", jis: ["9/5", "20/11"] },
  { name: "Neutral Sevenths", lo: 1030, hi: 1075, kind: "main",
    subs: [{ name: "small (supraminor)", lo: 1030, hi: 1043 }, { name: "middle (central)", lo: 1043, hi: 1065 }, { name: "large (submajor)", lo: 1065, hi: 1075 }],
    jis: ["20/11", "51/28", "11/6", "24/13", "13/7"] },
  { name: "Major Sevenths", lo: 1075, hi: 1140, kind: "main",
    subs: [{ name: "small", lo: 1075, hi: 1100 }, { name: "middle", lo: 1100, hi: 1120 }, { name: "large", lo: 1120, hi: 1140 }],
    jis: ["28/15", "15/8", "243/128", "21/11", "27/14"] },
  { name: "Octave less diesis", lo: 1140, hi: 1170, kind: "between", jis: ["35/18", "48/25", "64/33", "96/49"] },
  { name: "Octave less comma", lo: 1170, hi: 1199, kind: "between", jis: ["63/32", "143/72", "160/81"] },
  { name: "Pure Octave", lo: 1200, hi: 1200, kind: "between", jis: ["2/1"] },
];

const PRIME_NAME: Record<number, string> = {
  1: "unison", 2: "octave", 3: "Pythagorean", 5: "pental", 7: "septimal",
  11: "undecimal", 13: "tridecimal", 17: "septendecimal", 19: "novemdecimal", 23: "23-limit",
};
function largestPrime(n: number): number {
  let r = n, max = 1;
  for (let p = 2; p * p <= r; p++) while (r % p === 0) { max = p; r /= p; }
  return r > 1 ? r : max;
}

/** Actual interval names from the Xenharmonic Wiki interval database,
 *  keyed by "n/d" (lowest terms). */
const XEN_NAME = new Map<string, string>();
for (const list of Object.values(XEN_INTERVALS_BY_LIMIT))
  for (const iv of list) {
    const k = `${iv.n}/${iv.d}`;
    if (!XEN_NAME.has(k)) XEN_NAME.set(k, iv.name);
  }

/** Proper name of a ratio — its actual name from the interval database
 *  (e.g. "Just major third", "Septimal whole tone", "Harmonic seventh"),
 *  falling back to a prime-limit class name (pental, septimal, Pythagorean…). */
export function ratioName(ratio: string): string {
  const [a, b] = ratio.split("/").map(Number);
  if (a === b) return "unison";
  const named = XEN_NAME.get(ratio);
  if (named) return named;
  const lim = Math.max(largestPrime(a), largestPrime(b));
  return PRIME_NAME[lim] ?? `${lim}-limit`;
}

const ORD_SHORT: Record<string, string> = {
  second: "2nd", third: "3rd", fourth: "4th", fifth: "5th", sixth: "6th", seventh: "7th",
};
function ordinalOf(name: string): string | null {
  if (/Second/.test(name)) return "second";
  if (/Third/.test(name)) return "third";
  if (/Fourth/.test(name)) return "fourth";
  if (/Fifth/.test(name)) return "fifth";
  if (/Sixth/.test(name)) return "sixth";
  if (/Seventh/.test(name)) return "seventh";
  return null;
}
/** Readable interval name for a point at `cents` inside a region — the
 *  name the interval would be called (e.g. "subminor 3rd", "neutral 3rd",
 *  "supermajor 2nd", "perfect 4th"). Combines the region's ordinal with
 *  the quality implied by its sub-category band. */
export function intervalLabel(region: Region, cents: number): string {
  const sub = (region.subs?.find(s => cents >= s.lo - 0.01 && cents <= s.hi + 0.01)?.name ?? "").toLowerCase();
  const name = region.name;
  const small = /small|narrow|subminor|supraminor/.test(sub);
  const large = /large|wide|supermajor|submajor/.test(sub);
  if (/Unison/.test(name)) return "unison";
  if (/Octave less diesis/.test(name)) return "8ve − diesis";
  if (/Octave less comma/.test(name)) return "8ve − comma";
  if (/Octave/.test(name)) return "octave";
  if (/Tritonic/.test(name)) return small ? "dim 5th" : large ? "aug 4th" : "tritone";
  if (/Interseptimal/.test(name)) return "interseptimal";
  if (/Superfourth/.test(name)) return "superfourth";
  if (/Subfifth/.test(name)) return "subfifth";
  if (/Commas/.test(name)) return "comma";
  if (/Dieses/.test(name)) return "diesis";
  if (/Equable/.test(name)) return cents < 600 ? "equable 2nd" : "equable 7th";
  const ord = ordinalOf(name);
  if (!ord) return name;
  const o = ORD_SHORT[ord];
  let q = "";
  if (name.startsWith("Major")) q = large ? "supermajor" : "major";
  else if (name.startsWith("Minor")) q = small ? "subminor" : "minor";
  else if (name.startsWith("Neutral")) q = small ? "supraminor" : large ? "submajor" : "neutral";
  else if (name.startsWith("Perfect")) q = "perfect";
  return q ? `${q} ${o}` : o;
}

// Defining JI interval (cents) for each main region — the "anchor" the base
// quality sits on.  Used by EDO-aware naming below.
const CANON: Record<string, number> = {
  "Minor Seconds": 112, "Major Seconds": 204,
  "Minor Thirds": 316, "Major Thirds": 386,
  "Perfect Fourths": 498, "Perfect Fifths": 702,
  "Minor Sixths": 814, "Major Sixths": 884,
  "Minor Sevenths": 1018, "Major Sevenths": 1088,
  "Neutral Seconds": 150, "Neutral Thirds": 349, "Neutral Sixths": 849, "Neutral Sevenths": 1049,
};

/** EDO-aware interval name: names `cents` relative to the other steps the SAME
 *  EDO lands in this region (`group`).  The step nearest the region's defining
 *  JI interval is the base quality; lower steps become subminor / narrow /
 *  supraminor, higher steps supermajor / wide / submajor.  This is why two
 *  minor-third steps in one EDO read as "subminor 3rd" + "minor 3rd". */
export function edoIntervalLabel(region: Region, group: number[], cents: number): string {
  const name = region.name;
  const ord = ordinalOf(name);
  const canon = CANON[name];
  if (!ord || canon === undefined || group.length <= 1) return intervalLabel(region, cents);
  const o = ORD_SHORT[ord];
  const sorted = [...group].sort((a, b) => a - b);
  // index of the step closest to the region's defining JI interval
  let baseIdx = 0;
  for (let i = 1; i < sorted.length; i++)
    if (Math.abs(sorted[i] - canon) < Math.abs(sorted[baseIdx] - canon)) baseIdx = i;
  const d = sorted.indexOf(cents) - baseIdx;   // <0 below anchor, >0 above
  if (name.startsWith("Minor")) return `${d < 0 ? "subminor" : "minor"} ${o}`;
  if (name.startsWith("Major")) return `${d > 0 ? "supermajor" : "major"} ${o}`;
  if (name.startsWith("Neutral")) return `${d < 0 ? "supraminor" : d > 0 ? "submajor" : "neutral"} ${o}`;
  if (name.startsWith("Perfect")) return `${d < 0 ? "narrow" : d > 0 ? "wide" : "perfect"} ${o}`;
  return intervalLabel(region, cents);
}

/** Cents of a ratio string "a/b". */
export function ratioCents(ratio: string): number {
  const [a, b] = ratio.split("/").map(Number);
  return 1200 * Math.log2(a / b);
}

/** Cents → frequency ratio (for audio: 2^(c/1200)). */
export function centsToRatio(cents: number): number {
  return Math.pow(2, cents / 1200);
}

/** Every EDO step within the octave as {step, cents} (0…edo inclusive). */
export function edoSteps(edo: number): { step: number; cents: number }[] {
  if (!Number.isFinite(edo) || edo < 1 || edo > 200) return [];
  const out: { step: number; cents: number }[] = [];
  for (let k = 0; k <= edo; k++) out.push({ step: k, cents: (k * 1200) / edo });
  return out;
}
