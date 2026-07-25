// ── Diatonic scales → syllables + Roman-numeral triads / 7th chords ──
// For the Solfège Chart's "Scales & Chords" section.  Builds the major and
// minor scales in the sizes the EDO can ACTUALLY render (Small / Center /
// Large), gives each degree its region-centered solfège syllable, and stacks
// diatonic thirds into triads and seventh chords named with functional Roman
// numerals — I ii iii IV V vi vii° etc.
//
// Each size's degrees are the nearest EDO steps to that flavour's just-intonation
// targets (5-limit Small, Pythagorean Center, septimal Large), which gives the
// conventional diatonic scale for the tuning.  A size is shown ONLY when its 3rd
// actually renders inside that size's spectrum band — so 12-EDO (whose only major
// 3rd is the centre 400¢) shows just a Center scale, and 31-EDO meantone (a 387¢
// small 3rd and a 426¢ large 3rd, but no Pythagorean centre one) shows Small and
// Large Major but never a Center Major.

import { customSolfege } from "./customSolfege";
import { fuzzyCode } from "./intervalCodes";

// Functional base Roman numerals (case = triad quality; ° = diminished) — the
// Tonal Audiation set.  Each chord's label prefixes this with the ROOT's size
// (s/l → ↓/↑ arrow via formatRomanNumeral) and appends the chord's sized
// interval codes (sM3, lm3, M7 …), which formatRomanNumeral renders with ↓/↑
// arrows for small/large (bare = central).  Triad vs 7th differ by the stack.
const BASE_ROMANS: Record<"Major" | "Minor", string[]> = {
  Major: ["I", "ii", "iii", "IV", "V", "vi", "vii"],
  Minor: ["i", "ii", "III", "iv", "v", "VI", "VII"],
};

/** Leading size letter (s/l) of the root's interval from the tonic — the
 *  Tonal-Audiation root-size arrow (rendered ↓/↑ downstream); centre → bare.
 *  Uses the SAME spectrum classifier (fuzzyCode) as the scale syllables, so a
 *  root the syllable calls small/large gets the matching arrow.  The lookahead
 *  keeps it to real sized qualities (sM2, s5, lm3 …), not sup4/sub5. */
function rootSizePrefix(edo: number, rootStep: number): string {
  const k = ((rootStep % edo) + edo) % edo;
  const m = /^([sl])(?=[mMn]?\d)/.exec(fuzzyCode((k / edo) * 1200));
  return m ? m[1] : "";
}

/** Space-delimited spectrum interval codes of a chord (intervals from its root),
 *  skipping the root, the perfect 5th and the octave — the Tonal Audiation
 *  interval-stack convention.  fuzzyCode keeps the sizing in step with the
 *  syllables; formatRomanNumeral arrow-ifies the s/l prefixes. */
function intervalStack(edo: number, rootStep: number, memberSteps: number[]): string {
  const fifth = Math.round((edo * 702) / 1200);
  const seen = new Set<number>();
  const out: string[] = [];
  for (const st of memberSteps) {
    const k = (((st - rootStep) % edo) + edo) % edo;
    if (k === 0 || k === fifth || seen.has(k)) continue;
    seen.add(k);
    const code = fuzzyCode((k / edo) * 1200);
    out.push(/^[sl]?T$/.test(code) ? "TT" : code);   // tritone (dim 5th) → TT
  }
  return out.join(" ");
}

/** A sized scale flavour: its 7 just-intonation degree cents (degree 0 = tonic)
 *  and the spectrum code its 3rd must render as for this size to be shown. */
interface Flavor { size: "Small" | "Center" | "Large"; cents: number[]; thirdCode: string; }

// Major: 2nd/4th/5th fixed; 3rd/6th/7th follow the size.
const MAJOR_FLAVORS: Flavor[] = [
  { size: "Small",  cents: [0, 204, 386, 498, 702, 884, 1088], thirdCode: "sM3" }, // 5/4, 5/3, 15/8
  { size: "Center", cents: [0, 204, 408, 498, 702, 906, 1110], thirdCode: "M3"  }, // 81/64, 27/16, 243/128
  { size: "Large",  cents: [0, 204, 435, 498, 702, 933, 1137], thirdCode: "lM3" }, // 9/7, 12/7, 27/14
];
// Natural minor (Aeolian): major 2nd, minor 3rd/6th/7th, sized together.
const MINOR_FLAVORS: Flavor[] = [
  { size: "Small",  cents: [0, 204, 267, 498, 702, 765, 969], thirdCode: "sm3" },  // 7/6, 14/9, 7/4
  { size: "Center", cents: [0, 204, 294, 498, 702, 792, 996], thirdCode: "m3"  },  // 32/27, 128/81, 16/9
  { size: "Large",  cents: [0, 204, 316, 498, 702, 814, 1018], thirdCode: "lm3" }, // 6/5, 8/5, 9/5
];

const toStep = (edo: number, cents: number) =>
  ((Math.round((edo * cents) / 1200) % edo) + edo) % edo;

export interface Chord {
  roman: string;           // Roman-numeral label (for formatRomanNumeral)
  syllables: string[];     // stacked chord-tone syllables, root → top
}
export interface Degree {
  degree: number;          // 1..7
  syllable: string;        // the scale degree's syllable
  triad: Chord;
  seventh: Chord;
}
export interface ScaleVariant {
  size: "Small" | "Center" | "Large";
  steps: number[];                            // 7 EDO steps
  degrees: Degree[];
}
export interface ScaleFamily {
  name: "Major" | "Minor";
  variants: ScaleVariant[];
}

/** The chord rooted on scale degree `d` (0-based), taking scale members at
 *  offsets `offs` ([0,2,4] triad, [0,2,4,6] seventh): its stacked syllables plus
 *  the Tonal-Audiation Roman label (root-size arrow + sized interval stack). */
function buildChord(edo: number, name: "Major" | "Minor", d: number, steps: number[], offs: number[]): Chord {
  const memberSteps = offs.map(off => steps[(d + off) % 7]);
  const syllables = memberSteps.map(st => customSolfege((st / edo) * 1200));
  const prefix = rootSizePrefix(edo, steps[d]);
  const stack = intervalStack(edo, steps[d], memberSteps);
  const roman = `${prefix}${BASE_ROMANS[name][d]}${stack ? " " + stack : ""}`;
  return { roman, syllables };
}

function buildVariant(edo: number, name: "Major" | "Minor", size: Flavor["size"], steps: number[]): ScaleVariant {
  const degrees: Degree[] = steps.map((s, d) => ({
    degree: d + 1,
    syllable: customSolfege((s / edo) * 1200),
    triad: buildChord(edo, name, d, steps, [0, 2, 4]),
    seventh: buildChord(edo, name, d, steps, [0, 2, 4, 6]),
  }));
  return { size, steps, degrees };
}

function buildFamily(edo: number, name: "Major" | "Minor", flavors: Flavor[]): ScaleFamily {
  const variants: ScaleVariant[] = [];
  const seen = new Set<string>();
  for (const f of flavors) {
    const steps = f.cents.map(c => toStep(edo, c)).sort((a, b) => a - b);
    if (new Set(steps).size !== 7) continue;                 // degrees collided at this EDO
    // Show this size only if its 3rd actually renders in the size's own band —
    // otherwise the flavour has folded onto a neighbouring size (e.g. 31-EDO's
    // Pythagorean centre 3rd rounds to the large band, so no Center Major).
    const thirdStep = toStep(edo, f.cents[2]);
    if (fuzzyCode((thirdStep / edo) * 1200) !== f.thirdCode) continue;
    const key = steps.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push(buildVariant(edo, name, f.size, steps));
  }
  return { name, variants };
}

/** Major and minor scale families (only the sizes the EDO can render) for an
 *  EDO, ready to draw as syllables + Roman-numeral triads / seventh chords. */
export function scaleChordsForEdo(edo: number): ScaleFamily[] {
  return [
    buildFamily(edo, "Major", MAJOR_FLAVORS),
    buildFamily(edo, "Minor", MINOR_FLAVORS),
  ];
}
