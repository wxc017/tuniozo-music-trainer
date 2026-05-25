import { useState, useRef, useCallback, useEffect } from "react";
import { audioEngine } from "@/lib/audioEngine";
import {
  MELODY_BANK_31,
  JAZZ_FAMILIES, JAZZ_FAMILY_DESCRIPTIONS, JAZZ_VARIANTS,
  generateJazzCell, getDiatonicTriadsForMode,
  jazzPhraseToStepsEdo, randomChoice, fitLineIntoWindow, strictWindowBounds,
  PATTERN_SCALE_FAMILIES, getModeDegreeMap,
  CADENCE_PROGRESSIONS, MELODY_VARIANTS, buildDiatonicChord,
} from "@/lib/musicTheory";
import { getDegreeMap, getHeathwaiteSolfege } from "@/lib/edoData";
import { useLS, registerKnownOption, unregisterKnownOptionsForPrefix } from "@/lib/storage";
import { weightedRandomChoice } from "@/lib/stats";
import { useContourReplay } from "@/components/PitchContour";
import ModeScalePicker, { tonalityKey, parseTonalityKey } from "@/components/ModeScalePicker";
import type { TabSettingsSnapshot } from "@/App";

interface Props {
  tonicPc: number;
  lowestPitch: number;
  highestPitch: number;
  edo: number;
  onHighlight: (pcs: number[]) => void;
  responseMode: string;
  onResult: (text: string) => void;
  onPlay: (optionKey: string, label: string) => void;
  lastPlayed: React.MutableRefObject<{ frames: number[][]; info: string } | null>;
  ensureAudio: () => Promise<void>;
  onShowOnKeyboard?: () => void;
  playVol?: number;
  tabSettingsRef?: React.MutableRefObject<TabSettingsSnapshot | null>;
  answerButtons?: React.ReactNode;
}

const LENGTH_OPTIONS = ["Any", "3", "4", "5", "6", "7", "8", "10", "12"];
// Default note spacing (ms between successive note onsets).  Per
// direct user direction (2026-05-12) "i should be able to control
// length of the notes in scalar permuations" the value is now a
// user-controlled state read from noteGap and only used as the
// useLS default below.
const DEFAULT_GAP_MS = 560;

// Pentatonic Hooks / Neighbor-Tone Cells / Triadic Shapes / Folk-Pop
// Phrases all dropped 2026-05-12 — first three are covered by Bergonzi
// Pentatonics / Enclosures / Chord Tone Arpeggios respectively, and
// Folk-Pop was removed per direct user direction.  Only Cadences
// survives because no jazz family does tonic-resolving V→I phrases.
const KEPT_MELODY_FAMILIES = ["Cadences"];
const MELODY_GENERATIVE_FAMILIES = new Set(["Cadences"]);

const MELODY_DESCRIPTIONS: Record<string, string> = {
  "Cadences": "Tonic-resolving phrases (V → I, ii → V → I, etc.) in major and minor.",
};

type FamilyKind = "melody" | "jazz";
type Category = "chord" | "jazzy" | "perm";
type FamilyEntry = {
  name: string;        // underlying engine key (passed to musicTheory.ts)
  displayName: string; // what the UI shows — strips "Bergonzi " prefix
  kind: FamilyKind;
  category: Category;
  description: string;
  generative: boolean;
};

// Family categorisation per direct user direction (2026-05-12)
// "organize these into three tabs Chord-based, Jazz-Inspired,
// Permutations".  The categories are pedagogical, not engine-based —
// Cadences and Guide-Tone Lines both expose chord-progression
// variants and live in Chord-based regardless of whether their
// underlying engine is the melody-bank or the jazz-cell generator.
const FAMILY_CATEGORY: Record<string, Category> = {
  // Chord-based: harmony / chord-tone identity is the point of the
  // exercise.
  "Cadences":              "chord",
  "Chord Tone Arpeggios":  "chord",
  "Bergonzi Triad Pairs":  "chord",
  "Bergonzi Hexatonics":   "chord",
  "Guide-Tone Lines":      "chord",
  // Jazz-Inspired: bebop / Bergonzi vocabulary built around chord
  // changes, but the unit-of-learning is a phrase shape rather than
  // pure harmony.
  "Enclosures":               "jazzy",
  "Bebop Fragments":          "jazzy",
  "Bergonzi Digital Patterns": "jazzy",
  // Permutations: interval / scale-shape permutation patterns.  Mode
  // identity comes from the underlying scale, not from chord stacks.
  "Bergonzi Pentatonics":  "perm",
  "Bergonzi Intervallic":  "perm",
};

const CATEGORY_ORDER: Category[] = ["chord", "jazzy", "perm"];
const CATEGORY_LABELS: Record<Category, string> = {
  chord: "Chord-based",
  jazzy: "Jazz-Inspired",
  perm:  "Permutations",
};
const CATEGORY_COLORS: Record<Category, string> = {
  chord: "#bf6cd0",   // purple — harmonic identity
  jazzy: "#d0a050",   // amber — bebop / Bergonzi vocabulary
  perm:  "#5cbfae",   // teal — interval / scale-shape permutations
};

// In-category family display order, by pedagogical importance.  Order
// per direct user direction (2026-05-12) "reorder all the ones by
// importance the options in each family" applied to family-rows too:
//   • Chord-based: Triad Pairs first (primary chord-based exercise,
//     best-for-mode-ID per prior analysis), then Hexatonics (Bergonzi
//     Vol 7, closely related), then Cadences (harmonic motion),
//     Chord Tone Arpeggios (single-chord), Guide-Tone Lines (advanced
//     voice-leading across changes — needs the others to make sense).
//   • Jazz-Inspired: Bebop Fragments (most idiomatic), Enclosures
//     (most-used bebop ornament), Digital Patterns (advanced cells).
//   • Permutations: Pentatonics (fundamental subset scales) before
//     Intervallic (interval cycles — wider, covers more ground).
const CATEGORY_FAMILY_ORDER: Record<Category, string[]> = {
  chord: [
    "Bergonzi Triad Pairs",
    "Bergonzi Hexatonics",
    "Cadences",
    "Chord Tone Arpeggios",
    "Guide-Tone Lines",
  ],
  jazzy: [
    "Bebop Fragments",
    "Enclosures",
    "Bergonzi Digital Patterns",
  ],
  perm: [
    "Bergonzi Pentatonics",
    "Bergonzi Intervallic",
  ],
};

// Bergonzi prefix dropped from display per direct user direction
// (2026-05-12) "remove and bergonzi references just have the main ideas".
// The engine keys stay verbatim so generateJazzCell still dispatches.
function displayNameFor(family: string): string {
  return family.startsWith("Bergonzi ") ? family.slice("Bergonzi ".length) : family;
}

// Unified family list, ordered melody → jazz at the data-layer; the UI
// regroups them by FAMILY_CATEGORY (Chord-based / Jazz-Inspired /
// Permutations) at render time.
const FAMILIES: FamilyEntry[] = [
  ...KEPT_MELODY_FAMILIES.map<FamilyEntry>(name => ({
    name,
    displayName: name,
    kind: "melody",
    category: FAMILY_CATEGORY[name] ?? "perm",
    description: MELODY_DESCRIPTIONS[name] ?? "",
    generative: MELODY_GENERATIVE_FAMILIES.has(name),
  })),
  ...JAZZ_FAMILIES.map<FamilyEntry>(name => ({
    name,
    displayName: displayNameFor(name),
    kind: "jazz",
    category: FAMILY_CATEGORY[name] ?? "perm",
    description: JAZZ_FAMILY_DESCRIPTIONS[name] ?? "",
    generative: true,
  })),
];
const FAMILY_KIND: Record<string, FamilyKind> = Object.fromEntries(
  FAMILIES.map(f => [f.name, f.kind])
);
const FAMILY_NAMES = FAMILIES.map(f => f.name);

// ── Melody bank helper (voice-led degree resolution) ──────────────────
function resolveMelodyDegrees(
  phrase: { degrees: string[]; scale?: string },
  rootStep: number,
  scaleFam: string,
  modeName: string,
  isGenerative: boolean,
  edo: number,
): number[] {
  const chromatic = getDegreeMap(edo);
  const degMap = isGenerative
    ? { ...chromatic, ...getModeDegreeMap(edo, scaleFam, modeName) }
    : chromatic;
  const out: number[] = [rootStep + (degMap[phrase.degrees[0]] ?? 0)];
  for (let i = 1; i < phrase.degrees.length; i++) {
    const pc = degMap[phrase.degrees[i]] ?? 0;
    let best = rootStep + pc;
    let bestDist = Math.abs(best - out[i - 1]);
    for (let k = -4; k <= 4; k++) {
      const c = rootStep + pc + k * edo;
      const dist = Math.abs(c - out[i - 1]);
      if (dist < bestDist) { bestDist = dist; best = c; }
    }
    out.push(best);
  }
  return out;
}

export default function ScalarPermutationsTab({
  tonicPc, lowestPitch, highestPitch, edo, onHighlight, responseMode, onResult, onPlay, lastPlayed, ensureAudio, tabSettingsRef, answerButtons,
}: Props) {
  const frameTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const famNames = Object.keys(PATTERN_SCALE_FAMILIES);
  // Multi-select tonality pool per direct user direction (2026-05-12)
  // "in scalar permuations i should be able to click more then one
  // tonality and you renadomize which one is chosen further there
  // should be a bias towards the ones that havent been chosen often".
  // The current per-play "picked" tonality (scaleFam + modeName) is
  // held in state so the build functions + variantLabel can keep
  // computing against a single concrete tonality without API churn.
  const defaultKey = tonalityKey(famNames[0], PATTERN_SCALE_FAMILIES[famNames[0]][0]);
  const [tonalityPool, setTonalityPool] = useLS<Set<string>>("lt_perm_tonality_pool", new Set([defaultKey]));
  const [scaleFam, setScaleFam] = useLS<string>("lt_perm_scaleFam", famNames[0]);
  const [modeName, setModeName] = useLS<string>("lt_perm_mode", PATTERN_SCALE_FAMILIES[famNames[0]][0]);
  // Per-tonality pick counter — drives the bias toward less-picked
  // entries.  Stored in a ref so it doesn't trigger re-renders and
  // resets per session (a long session converges to uniform
  // distribution rather than hardcoding fairness into LS).
  const tonalityPickCounts = useRef<Map<string, number>>(new Map());
  const [lengthFilter, setLengthFilter] = useLS<string>("lt_perm_length", "Any");
  // User-controllable note spacing (gap between successive note
  // onsets) — replaces the prior hard-coded 560ms.  Stored in
  // milliseconds; UI exposes seconds (0.20s..1.50s) so the unit is
  // intuitive.  Lives in the OPTIONS collapsible per direct user
  // direction "and it should be in options".
  const [noteGap, setNoteGap] = useLS<number>("lt_perm_note_gap_ms", DEFAULT_GAP_MS);
  // Number of simultaneous voices to transcribe.  1 = single line
  // (original behaviour); 2 = two independent lines played at once —
  // per direct user direction "in scalar permutations add option for 2
  // voices so i have to transcribe two instead of just one line".  The
  // two voices live in separate registers (voice 1 upper half of the
  // range, voice 2 lower half) so they stay distinguishable by ear, and
  // each picks its own length, so their onsets need not line up.
  const [numVoices, setNumVoices] = useLS<number>("lt_perm_num_voices", 1);

  const [checked, setChecked] = useLS<Set<string>>(
    "lt_perm_checked",
    new Set([
      ...KEPT_MELODY_FAMILIES,
      "Chord Tone Arpeggios", "Enclosures", "Bebop Fragments", "Guide-Tone Lines",
    ])
  );
  // Per-family variant filters.  Jazz families and melody families
  // share the same shape (empty array = all enabled), so jazzVariants
  // doubles as the storage for melody variants too (Cadences only at
  // present).  Distinct LS keys keep them separable.
  const [jazzVariants, setJazzVariants] = useLS<Record<string, string[]>>("lt_perm_jazz_variants", {});
  const [melodyVariants, setMelodyVariants] = useLS<Record<string, string[]>>("lt_perm_mel_variants", {});
  // Collapsible state per category.  Defaults: all expanded so first-
  // time users see everything; preference persists per browser.
  const [collapsed, setCollapsed] = useLS<Record<Category, boolean>>(
    "lt_perm_collapsed",
    { chord: false, jazzy: false, perm: false } as Record<Category, boolean>,
  );
  // Additional top-level collapsibles per direct user direction
  // (2026-05-12) "allow me to collapse each part like we can collapse
  // the options in scalar permutations, so i can collapse tonalities,
  // the options, and roman numerals".  Each persists its own state.
  const [collapsedTonalities, setCollapsedTonalities] = useLS<boolean>("lt_perm_collapsed_tonalities", false);
  const [collapsedOptions, setCollapsedOptions] = useLS<boolean>("lt_perm_collapsed_options", false);
  // Per-family collapse for the Roman-numeral / variant chip rows.
  // Keyed by family name so each family remembers its own state.
  const [collapsedVariants, setCollapsedVariants] = useLS<Record<string, boolean>>("lt_perm_collapsed_variants", {});

  const [showTarget, setShowTarget] = useState<string | null>(null);
  const [infoText, setInfoText] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const pendingInfo = useRef<{ text: string; isTarget: boolean } | null>(null);
  const [hasPendingInfo, setHasPendingInfo] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [contourNotes, setContourNotes] = useState<number[] | null>(null);
  const [contourVisible, setContourVisible] = useState(false);
  // Answer-panel rows — one per voice.  Single-voice mode produces one
  // unlabelled row (identical to the old display); 2-voice mode produces
  // an "Upper voice" row and a "Lower voice" row, each with its own
  // degrees / notes / chord context.
  type AnswerRow = { label: string; degrees: string[]; notes: number[]; chordContext: string };
  const [answerRows, setAnswerRows] = useState<AnswerRow[]>([]);
  // Per-voice playback frames + gap, kept for Replay / Show Answer when
  // more than one voice is sounding (each voice spans the same total
  // time but may have a different note count, hence a different gap).
  const lastVoices = useRef<{ frames: number[][]; gap: number }[] | null>(null);

  useEffect(() => {
    unregisterKnownOptionsForPrefix("perm:");
    Array.from(checked).forEach(fam => {
      const kind = FAMILY_KIND[fam];
      if (!kind) return;
      registerKnownOption(`perm:${kind}:${fam}`, `${kind === "jazz" ? "Jazz" : "Melody"}: ${fam}`);
    });
    return () => unregisterKnownOptionsForPrefix("perm:");
  }, [checked]);

  useEffect(() => {
    if (!tabSettingsRef) return;
    const modeOpts = PATTERN_SCALE_FAMILIES[scaleFam] ?? [];
    const safe = modeOpts.includes(modeName) ? modeName : (modeOpts[0] ?? "");
    tabSettingsRef.current = {
      title: "Scalar Permutations",
      groups: [
        { label: "Families", items: FAMILY_NAMES.filter(f => checked.has(f)) },
        { label: "Length", items: [lengthFilter] },
        { label: "Scale", items: [`${scaleFam} · ${safe}`] },
      ],
    };
  }, [checked, lengthFilter, scaleFam, modeName, tabSettingsRef]);

  const toggle = (f: string) => setChecked(prev => {
    const n = new Set(prev); if (n.has(f)) n.delete(f); else n.add(f); return n;
  });

  const isJazzVariantOn = (family: string, vid: string): boolean => {
    const list = jazzVariants[family];
    if (!list || list.length === 0) return true;
    return list.includes(vid);
  };
  const toggleJazzVariant = (family: string, vid: string) => {
    setJazzVariants(prev => {
      const all = (JAZZ_VARIANTS[family] ?? []).map(v => v.id);
      const current = prev[family] && prev[family].length > 0 ? prev[family] : all;
      const next = current.includes(vid) ? current.filter(v => v !== vid) : [...current, vid];
      const safe = next.length === 0 ? all : next;
      return { ...prev, [family]: safe };
    });
  };
  // Re-label variants whose Roman case depends on the active mode:
  //   • Triad Pairs / Hexatonics "1+4" → "I+IV" in Ionian, "i+iv" in Aeolian, …
  //   • Guide-Tone Lines "prog_2_5_1" → "ii-V-I" in Ionian, "ii°-v-i" in Aeolian, …
  //   • Cadences "cad_2_5_1" → "ii-V-I" with the active mode's case.
  // Augmented / whole-tone hexes are symmetric and mode-independent
  // so they keep their fallback labels.
  const variantLabel = (family: string, vid: string, fallback: string): string => {
    const romansFromUnderscoreSeq = (prefix: string): string => {
      const triads = getDiatonicTriadsForMode(scaleFam, modeName);
      if (triads.length < 7) return fallback;
      const parts = vid.slice(prefix.length).split("_");
      const romans = parts.map(p => {
        const idx = parseInt(p) - 1;
        return triads[idx]?.roman ?? p;
      });
      return romans.join("-");
    };
    if (family === "Guide-Tone Lines" && vid.startsWith("prog_")) return romansFromUnderscoreSeq("prog_");
    if (family === "Cadences" && vid.startsWith("cad_"))         return romansFromUnderscoreSeq("cad_");
    if (family !== "Bergonzi Triad Pairs" && family !== "Bergonzi Hexatonics") return fallback;
    if (vid === "augmented" || vid === "whole-tone") return fallback;
    if (!/^\d\+\d$/.test(vid)) return fallback;
    const triads = getDiatonicTriadsForMode(scaleFam, modeName);
    if (triads.length < 7) return fallback;
    const [aStr, bStr] = vid.split("+");
    const a = triads[parseInt(aStr) - 1]?.roman ?? aStr;
    const b = triads[parseInt(bStr) - 1]?.roman ?? bStr;
    return `${a}+${b}`;
  };

  // Melody-variant toggle helpers (parallel to the jazz ones).
  const isMelodyVariantOn = (family: string, vid: string): boolean => {
    const list = melodyVariants[family];
    if (!list || list.length === 0) return true;
    return list.includes(vid);
  };
  const toggleMelodyVariant = (family: string, vid: string) => {
    setMelodyVariants(prev => {
      const all = (MELODY_VARIANTS[family] ?? []).map(v => v.id);
      const current = prev[family] && prev[family].length > 0 ? prev[family] : all;
      const next = current.includes(vid) ? current.filter(v => v !== vid) : [...current, vid];
      const safe = next.length === 0 ? all : next;
      return { ...prev, [family]: safe };
    });
  };

  type Built = { frames: number[][]; degrees: string[]; absNotes: number[]; optKey: string; label: string; variantText?: string; chordContext?: string };

  // Roman-numeral chord context for the rendered phrase.  Surfaces the
  // active chord(s) — single triad for Arpeggios, pair for Triad
  // Pairs / Hexatonics, progression for Cadence chords and Guide-Tone
  // progressions.  Per direct user direction (2026-05-12) "i want
  // roman numerals for whatever is relevant like triad pairs or
  // arpeggios" — the variant text was removed from Show Answer, so
  // this re-surfaces the harmonic info in a single clean line.
  function chordContextFor(family: string, variantText: string | undefined, progId?: string): string {
    const triads = getDiatonicTriadsForMode(scaleFam, modeName);
    const romansFor = (degrees: number[]): string =>
      degrees.map(d => triads[d - 1]?.roman ?? String(d)).join("-");
    if (family === "Cadences" && progId && progId.startsWith("cad_")) {
      const degs = progId.slice("cad_".length).split("_").map(s => parseInt(s));
      return romansFor(degs);
    }
    if (family === "Guide-Tone Lines" && variantText) {
      // Generator emits "guide-tone line over 2-5-1".  Convert the
      // numeric progression to Roman; tonic-only variants ("starting
      // on 3" / "starting on 7") have no chord context.
      const m = variantText.match(/guide-tone line over ([\d_\-]+)/);
      if (m) {
        const degs = m[1].split(/[_-]/).map(s => parseInt(s)).filter(n => !isNaN(n));
        if (degs.length) return romansFor(degs);
      }
      return "";
    }
    if (family === "Bergonzi Triad Pairs" && variantText) {
      // Variant text: "ascending triad pair I+ii sequenced through scale"
      const m = variantText.match(/triad pair (\S+)/);
      if (m) return m[1];
    }
    if (family === "Bergonzi Hexatonics" && variantText) {
      // Variant text: "I+ii hexatonic — cell4" OR "augmented hexatonic — …"
      const m = variantText.match(/^(.+?) hexatonic/);
      if (m && m[1] !== "augmented" && m[1] !== "whole-tone") return m[1];
    }
    if (family === "Chord Tone Arpeggios") {
      // Arpeggios always outline the tonic chord — show its Roman.
      return triads[0]?.roman ?? "I";
    }
    return "";
  }

  // Build a melodic-phrase cadence (curated bank).  Original behaviour.
  // Build functions take explicit scaleFam/modeName per direct user
  // direction (2026-05-12) "in scalar permuations i should be able to
  // click more then one tonality and you renadomize which one is
  // chosen" — play() picks one tonality from the multi-select pool
  // per call and passes it through so the build doesn't read stale
  // closure state after setScaleFam/setModeName.
  function buildMelodicPhrase(family: string, sFam: string, sMode: string, loBound = lowestPitch, hiBound = highestPitch): Built | null {
    let pool = MELODY_BANK_31.filter(m => m.family === family);
    if (lengthFilter !== "Any") {
      const len = parseInt(lengthFilter);
      pool = pool.filter(m => m.degrees.length === len);
    }
    if (!pool.length) return null;
    const phrase = randomChoice(pool);
    const isGen = MELODY_GENERATIVE_FAMILIES.has(family);
    const [low, high] = strictWindowBounds(loBound, hiBound);
    const midPitch = Math.floor((loBound + hiBound) / 2);
    const base = midPitch - (((midPitch - tonicPc) % edo + edo) % edo);
    const rawSteps = resolveMelodyDegrees(phrase, base - tonicPc, sFam, sMode, isGen, edo);
    const absNotes = fitLineIntoWindow(rawSteps.map(s => tonicPc + s), edo, low, high);
    if (!absNotes.length) return null;
    return {
      frames: absNotes.map(n => [n]),
      degrees: phrase.degrees,
      absNotes,
      optKey: `perm:melody:${family}`,
      label: `Melody: ${family}`,
    };
  }

  // Build a cadence as a chord progression — each chord in the
  // progression is stacked (root, 3rd, 5th, 7th of the diatonic chord
  // at that scale degree) and played as a single multi-note frame.
  function buildCadenceChords(progId: string, sFam: string, sMode: string, loBound = lowestPitch, hiBound = highestPitch): Built | null {
    const chords = CADENCE_PROGRESSIONS[progId];
    if (!chords || !chords.length) return null;
    const modeMap = getModeDegreeMap(edo, sFam, sMode);
    const midPitch = Math.floor((loBound + hiBound) / 2);
    const tonicAbs = midPitch - (((midPitch - tonicPc) % edo + edo) % edo);
    const frames: number[][] = [];
    const displayDegrees: string[] = [];
    for (const root of chords) {
      const chordDegs = buildDiatonicChord(root);
      // Stack ascending starting from the chord root's pitch class.
      // Each subsequent voice is bumped up by an octave when it'd
      // otherwise be at or below the previous voice — produces a
      // root-position 7th chord stack.
      const rootStep = modeMap[chordDegs[0]] ?? (root - 1);
      const notes: number[] = [tonicAbs + rootStep];
      for (let i = 1; i < chordDegs.length; i++) {
        let step = modeMap[chordDegs[i]] ?? 0;
        let n = tonicAbs + step;
        while (n <= notes[notes.length - 1]) n += edo;
        notes.push(n);
      }
      frames.push(notes);
      displayDegrees.push(`(${chordDegs.join("-")})`);
    }
    return {
      frames,
      degrees: displayDegrees,
      absNotes: frames.flat(),
      optKey: `perm:melody:Cadences:${progId}`,
      label: `Cadence: ${progId.replace(/^cad_/, "").replace(/_/g, "-")}`,
      variantText: `${progId.replace(/^cad_/, "").replace(/_/g, "-")} cadence`,
      chordContext: chordContextFor("Cadences", undefined, progId),
    };
  }

  function buildMelody(family: string, sFam: string, sMode: string, loBound = lowestPitch, hiBound = highestPitch): Built | null {
    if (family === "Cadences") {
      // If any variant is enabled, pick one; otherwise default to
      // "phrase" (the curated melodic bank).
      const enabled = melodyVariants["Cadences"];
      const allIds = (MELODY_VARIANTS["Cadences"] ?? []).map(v => v.id);
      const active = (enabled && enabled.length) ? enabled : allIds;
      const picked = active.length ? randomChoice(active) : "phrase";
      if (picked === "phrase") return buildMelodicPhrase(family, sFam, sMode, loBound, hiBound);
      const chord = buildCadenceChords(picked, sFam, sMode, loBound, hiBound);
      if (chord) return chord;
      // Fall back to melodic phrase if chord build failed.
      return buildMelodicPhrase(family, sFam, sMode, loBound, hiBound);
    }
    return buildMelodicPhrase(family, sFam, sMode, loBound, hiBound);
  }

  function buildJazz(family: string, sFam: string, sMode: string, loBound = lowestPitch, hiBound = highestPitch): Built | null {
    const len = lengthFilter !== "Any" ? parseInt(lengthFilter) : 3 + Math.floor(Math.random() * 5);
    const enabledList = jazzVariants[family];
    const enabledSet = enabledList && enabledList.length > 0 ? new Set(enabledList) : undefined;
    const phrase = generateJazzCell(family, len, enabledSet, sFam, sMode);
    const [low, high] = strictWindowBounds(loBound, hiBound);
    const midPitch = Math.floor((loBound + hiBound) / 2);
    const base = midPitch - (((midPitch - tonicPc) % edo + edo) % edo);
    const rawSteps = jazzPhraseToStepsEdo(phrase.degrees, base - tonicPc, sFam, sMode, edo);
    const absNotes = fitLineIntoWindow(rawSteps.map(s => tonicPc + s), edo, low, high);
    if (!absNotes.length) return null;
    const cleanedVariant = phrase.variant.replace(/Bergonzi[^\s]*\s*/g, "");
    return {
      frames: absNotes.map(n => [n]),
      degrees: phrase.degrees,
      absNotes,
      optKey: `perm:jazz:${family}`,
      label: `Jazz: ${displayNameFor(family)}`,
      // Variant strings from musicTheory.ts may also embed "Bergonzi"
      // (e.g. pentatonic descriptions); strip them in the display layer
      // so the user never sees the prefix.
      variantText: cleanedVariant,
      chordContext: chordContextFor(family, cleanedVariant),
    };
  }

  const play = async () => {
    if (isPlaying) return;
    await ensureAudio();
    const active = FAMILY_NAMES.filter(f => checked.has(f));
    if (!active.length) { onResult("Select at least one family."); return; }

    // Pick a tonality from the pool with bias toward the least-picked
    // entries per direct user direction "there should be a bias
    // towards the ones that havent been chosen often".  Weight =
    // (maxCount + 1 - thisCount), so a tonality never picked yet has
    // the highest weight; one that's been picked `max` times still
    // gets weight 1 (never fully starved).  Plain uniform picking
    // was letting Math.random cluster repeats; this smooths the
    // distribution over a session.
    const poolKeys = Array.from(tonalityPool);
    if (poolKeys.length === 0) { onResult("Select at least one tonality."); return; }
    const counts = tonalityPickCounts.current;
    const maxCount = poolKeys.reduce((m, k) => Math.max(m, counts.get(k) ?? 0), 0);
    const weights = poolKeys.map(k => Math.max(1, (maxCount + 1) - (counts.get(k) ?? 0)));
    const total = weights.reduce((a, b) => a + b, 0);
    let pick = Math.random() * total;
    let pickedKey = poolKeys[0];
    for (let i = 0; i < poolKeys.length; i++) {
      pick -= weights[i];
      if (pick <= 0) { pickedKey = poolKeys[i]; break; }
    }
    counts.set(pickedKey, (counts.get(pickedKey) ?? 0) + 1);
    const { scaleFam: pickedFam, modeName: pickedMode } = parseTonalityKey(pickedKey);
    setScaleFam(pickedFam);
    setModeName(pickedMode);

    // Build one voice: pick a family from the active set (own weighted
    // draw per voice, so the two lines can come from different families)
    // and render it within the given pitch window.
    const buildVoice = (lo: number, hi: number): Built | null => {
      const fam = weightedRandomChoice(active, f => `perm:${FAMILY_KIND[f]}:${f}`);
      const kind = FAMILY_KIND[fam];
      return kind === "jazz"
        ? buildJazz(fam, pickedFam, pickedMode, lo, hi)
        : buildMelody(fam, pickedFam, pickedMode, lo, hi);
    };

    let voices: { frames: number[][]; gap: number }[];
    let rows: AnswerRow[];
    let label: string;
    let optKey: string;

    if (numVoices >= 2) {
      // Split the range so voice 1 sits in the upper register and voice
      // 2 in the lower, keeping at least an octave of room for each (the
      // halves overlap slightly when the global range is tight, but the
      // anchor pitches still separate the two lines by ear).
      const mid = Math.floor((lowestPitch + highestPitch) / 2);
      const upperLo = Math.min(mid, highestPitch - edo);
      const lowerHi = Math.max(mid, lowestPitch + edo);
      const v1 = buildVoice(upperLo, highestPitch);
      const v2 = buildVoice(lowestPitch, lowerHi);
      if (!v1 || !v2) { onResult("Could not build two voices. Try a wider range or another family."); return; }
      // Both voices span the same total time; the denser one keeps the
      // user's chosen note spacing, the sparser one is stretched to match
      // so their onsets don't line up (independent lengths).
      const span = Math.max(v1.frames.length, v2.frames.length) * noteGap;
      voices = [
        { frames: v1.frames, gap: v1.frames.length ? span / v1.frames.length : noteGap },
        { frames: v2.frames, gap: v2.frames.length ? span / v2.frames.length : noteGap },
      ];
      rows = [
        { label: "Upper voice", degrees: v1.degrees, notes: v1.absNotes, chordContext: v1.chordContext ?? "" },
        { label: "Lower voice", degrees: v2.degrees, notes: v2.absNotes, chordContext: v2.chordContext ?? "" },
      ];
      label = `2 voices: ${v1.label.replace(/^(Jazz|Melody|Cadence): /, "")} / ${v2.label.replace(/^(Jazz|Melody|Cadence): /, "")}`;
      optKey = "perm:voices2";
    } else {
      const built = buildVoice(lowestPitch, highestPitch);
      if (!built) { onResult("Could not build a phrase. Try wider range or another family."); return; }
      voices = [{ frames: built.frames, gap: noteGap }];
      rows = [{ label: "", degrees: built.degrees, notes: built.absNotes, chordContext: built.chordContext ?? "" }];
      label = built.label;
      optKey = built.optKey;
    }

    const info = rows.map(r => r.degrees.join(" → ")).join("  |  ");
    setShowTarget(null);
    setInfoText("");
    setHasPendingInfo(false);
    setAnswerRows(rows);
    // Contour visual only tracks a single line; enable it for 1 voice.
    setContourNotes(numVoices >= 2 ? null : rows[0].notes);
    setContourVisible(false);
    pendingInfo.current = { text: info, isTarget: responseMode !== "Play Audio" };
    setHasPendingInfo(true);
    onResult(label);
    onPlay(optKey, label);
    lastVoices.current = voices;
    lastPlayed.current = { frames: voices.flatMap(v => v.frames), info };
    setHasPlayed(true);

    startVoices(voices);
  };

  // Play one or more voices simultaneously (each its own frames + gap),
  // and clear the playing flag once the longest voice has finished.
  const startVoices = (voices: { frames: number[][]; gap: number }[]) => {
    setIsPlaying(true);
    let maxMs = 0;
    voices.forEach(v => {
      audioEngine.playSequence(v.frames, edo, v.gap, 0.8);
      maxMs = Math.max(maxMs, v.frames.length * v.gap);
    });
    setTimeout(() => setIsPlaying(false), maxMs + 500);
  };

  const highlightFrames = useCallback((frames: number[][]) => {
    frameTimers.current.forEach(id => clearTimeout(id));
    frameTimers.current = [];
    frames.forEach((frame, i) => {
      const id = setTimeout(() => onHighlight(frame), i * noteGap);
      frameTimers.current.push(id);
    });
  }, [onHighlight]);

  const contourReplay = useContourReplay(
    contourVisible && contourNotes ? contourNotes.map(n => [n]) : null,
    noteGap,
  );

  const replay = () => {
    const voices = lastVoices.current;
    if (!voices || !voices.length) return;
    // Contour replay + keyboard highlight only apply to a single line.
    if (voices.length === 1 && contourVisible) contourReplay.startReplay();
    if (voices.length === 1 && (showTarget || infoText)) highlightFrames(voices[0].frames);
    startVoices(voices);
  };

  const handleShowInfo = () => {
    const p = pendingInfo.current;
    if (!p) return;
    if (p.isTarget) setShowTarget(p.text);
    else setInfoText(p.text);
    setContourVisible(true);
    // Show Answer re-plays the phrase so the user hears it again while
    // the degree labels reveal — per direct user direction (2026-05-12)
    // "when i click show answer it should play it".
    const voices = lastVoices.current;
    if (voices && voices.length) {
      if (!isPlaying) startVoices(voices);
      if (voices.length === 1) highlightFrames(voices[0].frames);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tonalities — collapsible (wraps the scale/mode picker).  Per
          direct user direction (2026-05-12) "allow me to collapse each
          part" — defaults to expanded so first-time users see the
          picker, but the user can fold it away once their preferred
          scale is set. */}
      <div className="rounded border border-[#1e1e1e] bg-[#0e0e0e]">
        <div
          onClick={() => setCollapsedTonalities(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer select-none transition-colors hover:bg-[#161616]"
          style={{ borderLeft: "3px solid #888" }}
        >
          <span className="text-[10px] text-[#666] w-3">{collapsedTonalities ? "▸" : "▾"}</span>
          <span className="text-xs font-semibold tracking-wider text-[#aaa]">TONALITIES</span>
          <span className="text-[10px] text-[#555] ml-auto">{tonalityPool.size} selected</span>
        </div>
        {!collapsedTonalities && (
          <div className="px-2 pb-2">
            <ModeScalePicker
              selected={tonalityPool}
              onToggle={(fam, mode) => {
                const k = tonalityKey(fam, mode);
                setTonalityPool(prev => {
                  const next = new Set(prev);
                  if (next.has(k)) {
                    // Don't allow the pool to drop to zero — keep at
                    // least one tonality selected so play() always has
                    // material.
                    if (next.size > 1) next.delete(k);
                  } else next.add(k);
                  return next;
                });
              }} />
          </div>
        )}
      </div>

      {/* Length filter + Note Length row moved to right ABOVE the
          Play row per direct user direction (2026-05-12) "these need
          to be above the play button not below tonality" — the row
          was sitting between TONALITIES and FAMILIES which made it
          feel like a settings section rather than a playback
          parameter.  See <playControlsRow /> JSX just above the
          Random Permutation button. */}

      {/* Family categories — collapsible per direct user direction
          (2026-05-12) "these should be under options" (kept for the
          family lists themselves) but with the Length / Note Length
          controls promoted out per the later direction "always
          visible never collapsible". */}
      <div className="rounded border border-[#1e1e1e] bg-[#0e0e0e]">
        <div
          onClick={() => setCollapsedOptions(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer select-none transition-colors hover:bg-[#161616]"
          style={{ borderLeft: "3px solid #888" }}
        >
          <span className="text-[10px] text-[#666] w-3">{collapsedOptions ? "▸" : "▾"}</span>
          <span className="text-xs font-semibold tracking-wider text-[#aaa]">FAMILIES</span>
          <span className="text-[10px] text-[#555] ml-auto">
            {FAMILY_NAMES.filter(f => checked.has(f)).length} selected
          </span>
        </div>
        {!collapsedOptions && (
          <div className="px-3 pb-3 pt-1 space-y-3">
            <div className="space-y-2">
        {CATEGORY_ORDER.map(cat => {
          // Order families within this category by pedagogical
          // importance per CATEGORY_FAMILY_ORDER, falling back to data-
          // layer order for any family not listed there.
          const order = CATEGORY_FAMILY_ORDER[cat] ?? [];
          const indexOf = (name: string) => {
            const i = order.indexOf(name);
            return i === -1 ? 1000 + FAMILIES.findIndex(f => f.name === name) : i;
          };
          const catFamilies = FAMILIES
            .filter(f => f.category === cat)
            .slice()
            .sort((a, b) => indexOf(a.name) - indexOf(b.name));
          if (!catFamilies.length) return null;
          const catColor = CATEGORY_COLORS[cat];
          const catLabel = CATEGORY_LABELS[cat];
          const isCollapsed = collapsed[cat];
          const onCount = catFamilies.filter(f => checked.has(f.name)).length;
          return (
            <div key={cat} className="rounded border border-[#1e1e1e] bg-[#0e0e0e]">
              <div
                onClick={() => setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }))}
                className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer select-none transition-colors hover:bg-[#161616]"
                style={{ borderLeft: `3px solid ${catColor}` }}
              >
                <span className="text-[10px] text-[#666] w-3">{isCollapsed ? "▸" : "▾"}</span>
                <span className="text-xs font-semibold tracking-wider" style={{ color: catColor }}>
                  {catLabel.toUpperCase()}
                </span>
                <span className="text-[10px] text-[#555] ml-auto">
                  {onCount}/{catFamilies.length}
                </span>
                {/* Bulk on/off for this category — click events stop
                    propagation so they don't also collapse the panel. */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setChecked(prev => {
                      const n = new Set(prev);
                      catFamilies.forEach(f => n.add(f.name));
                      return n;
                    });
                  }}
                  className="text-[9px] text-[#555] hover:text-[#9999ee] border border-[#222] rounded px-1.5 py-0.5">All</button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setChecked(prev => {
                      const n = new Set(prev);
                      catFamilies.forEach(f => n.delete(f.name));
                      return n;
                    });
                  }}
                  className="text-[9px] text-[#555] hover:text-[#9999ee] border border-[#222] rounded px-1.5 py-0.5">None</button>
              </div>
              {!isCollapsed && (
                <div className="space-y-2 px-2 pb-2">
                  {catFamilies.map(f => {
                    const on = checked.has(f.name);
                    const variants = f.kind === "jazz"
                      ? (JAZZ_VARIANTS[f.name] ?? [])
                      : (MELODY_VARIANTS[f.name] ?? []);
                    const isVariantActive = (vid: string) => f.kind === "jazz"
                      ? isJazzVariantOn(f.name, vid)
                      : isMelodyVariantOn(f.name, vid);
                    const onToggleVariant = (vid: string) => f.kind === "jazz"
                      ? toggleJazzVariant(f.name, vid)
                      : toggleMelodyVariant(f.name, vid);
                    return (
                      <div key={f.name} className={`rounded border transition-colors ${
                        on ? "bg-[#1a1a2a] border-[#3a3a5a]" : "bg-[#111] border-[#222]"
                      }`}>
                        <button onClick={() => toggle(f.name)}
                          className={`w-full flex items-start gap-2 px-3 py-2 text-left text-sm transition-colors ${
                            on ? "text-[#9999ee]" : "text-[#666] hover:text-[#aaa]"
                          }`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {f.displayName}
                              {f.generative ? (
                                <span className="text-[10px] px-1 rounded text-[#7aaa7a] border border-[#3a6a3a]">generative</span>
                              ) : (
                                <span className="text-[10px] px-1 rounded text-[#8888cc] border border-[#3a3a6a]">fixed bank</span>
                              )}
                            </div>
                            {f.description && (
                              <p className="text-[10px] text-[#555] mt-0.5 leading-snug">{f.description}</p>
                            )}
                          </div>
                        </button>
                        {on && variants.length > 0 && (() => {
                          // Roman-numeral / variant chip row is itself
                          // collapsible per direct user direction
                          // (2026-05-12) "i can collapse … roman
                          // numerals".  Per-family state so each
                          // family remembers its own collapse.
                          const variantsCollapsed = !!collapsedVariants[f.name];
                          const enabledCount = variants.filter(v => isVariantActive(v.id)).length;
                          return (
                            <div className="px-3 pb-2">
                              <div
                                onClick={() => setCollapsedVariants(prev => ({ ...prev, [f.name]: !prev[f.name] }))}
                                className="flex items-center gap-1.5 mb-1 cursor-pointer select-none text-[#666] hover:text-[#aaa]"
                              >
                                <span className="text-[9px] w-3">{variantsCollapsed ? "▸" : "▾"}</span>
                                <span className="text-[9px] tracking-wider">VARIANTS</span>
                                <span className="text-[9px] text-[#444]">({enabledCount}/{variants.length})</span>
                              </div>
                              {!variantsCollapsed && (
                                <div className="flex flex-wrap gap-1">
                                  {variants.map(v => {
                                    const vOn = isVariantActive(v.id);
                                    return (
                                      <button key={v.id} onClick={() => onToggleVariant(v.id)}
                                        className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                                          vOn
                                            ? "bg-[#7173e6]/20 border-[#7173e6] text-[#bbbbee]"
                                            : "bg-[#0e0e0e] border-[#2a2a2a] text-[#555] hover:text-[#999]"
                                        }`}>
                                        {variantLabel(f.name, v.id, v.label)}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
            </div>
          </div>
        )}
      </div>

      {/* Show Answer panel — Roman-numeral chord context (when
          relevant for the family) + Degrees-played row.  No more
          variant prose per direct user direction (2026-05-12) "i odnt
          need to see the varient information, this show answer looks
          like notepad information" + "i want roman numerals for
          whatever is relevant like triad pairs or arpeggios". */}
      {/* Show Answer reveal panel relocated to AFTER the Play row per
          direct user direction (2026-05-12) "the collapsibles should
          be always visible above random permutations" — keeps the
          family pickers + play button anchored at consistent vertical
          positions instead of getting pushed down whenever Show
          Answer renders. */}

      {/* Length Filter + Note Length — always visible, immediately
          above the Play row per direct user direction (2026-05-12)
          "these need to be above the play button not below
          tonality".  Acts as the playback-parameter row that the
          user adjusts right before pressing Play. */}
      <div className="flex flex-wrap gap-3 items-end px-3 py-2 bg-[#0e0e0e] border border-[#1a1a1a] rounded">
        <div>
          <label className="text-xs text-[#888] block mb-1">Length Filter</label>
          <select value={lengthFilter} onChange={e => setLengthFilter(e.target.value)}
            className="bg-[#1e1e1e] border border-[#333] rounded px-2 py-1.5 text-sm text-white focus:outline-none">
            {LENGTH_OPTIONS.map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-[#888] block mb-1">Note Length (s)</label>
          <input type="number" min={0.2} max={1.5} step={0.05}
            value={(noteGap / 1000).toFixed(2)}
            onChange={e => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) setNoteGap(Math.max(200, Math.min(1500, Math.round(v * 1000))));
            }}
            className="w-16 bg-[#1e1e1e] border border-[#333] rounded px-2 py-1.5 text-sm text-white text-center focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-[#888] block mb-1">Voices</label>
          <select value={numVoices} onChange={e => setNumVoices(parseInt(e.target.value))}
            className="bg-[#1e1e1e] border border-[#333] rounded px-2 py-1.5 text-sm text-white focus:outline-none">
            <option value={1}>1 (single line)</option>
            <option value={2}>2 (transcribe both)</option>
          </select>
        </div>
        <div className="text-xs text-[#555]">
          {FAMILY_NAMES.filter(f => checked.has(f)).length} families selected
        </div>
      </div>

      {/* Top row: Play / Replay (primary action). */}
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={play} disabled={isPlaying}
          className="bg-[#7173e6] hover:bg-[#5a5cc8] disabled:opacity-50 text-white px-5 py-2 rounded text-sm font-medium transition-colors">
          {isPlaying ? "♪ Playing…" : "▶ Random Permutation"}
        </button>
        {hasPlayed && (
          <button onClick={replay} disabled={isPlaying}
            className="bg-[#1e1e1e] hover:bg-[#2a2a2a] disabled:opacity-50 border border-[#333] text-[#aaa] px-4 py-2 rounded text-sm transition-colors">
            Replay
          </button>
        )}
        {answerButtons}
      </div>
      {/* Bottom row: Show Answer — kept below Play per direct user
          direction (2026-05-12) "show answer should always be below
          play" so it never visually competes with the primary action. */}
      {hasPendingInfo && (
        <div className="flex gap-2 flex-wrap items-center mt-2">
          <button onClick={handleShowInfo}
            className="bg-[#1e1e1e] hover:bg-[#2a2a2a] border border-[#444] text-[#9999ee] px-4 py-2 rounded text-sm transition-colors">
            Show Answer
          </button>
        </div>
      )}
      {(showTarget || infoText) && answerRows.length > 0 && (() => {
        // Per direct user direction (2026-05-12) "random permuations
        // should show a box of the scale degrees played with the
        // solfege as well in similar card style" — each played degree
        // becomes a card with the degree number on top and the
        // Heathwaite solfege below.  With 2 voices each line gets its
        // own labelled row.
        const heathwaiteTable = getHeathwaiteSolfege(edo);
        const multi = answerRows.length > 1;
        return (
        <div className={`rounded p-3 border space-y-3 ${
          showTarget ? "bg-[#1a2a1a] border-[#3a5a3a]" : "bg-[#141414] border-[#2a2a2a]"
        }`}>
          {answerRows.map((row, ri) => (
            <div key={ri} className="space-y-1">
              {row.label && (
                <div className="text-[10px] tracking-wider font-semibold text-[#888]">{row.label.toUpperCase()}</div>
              )}
              {row.chordContext && (
                <div className="flex gap-1 items-center flex-wrap">
                  <span className="text-[#666] text-xs mr-1">Chord:</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-mono font-semibold border ${
                    showTarget
                      ? "bg-[#1a2a1a] text-[#8fc88f] border-[#3a5a3a]"
                      : "bg-[#1a1a2a] text-[#bbbbee] border-[#3a3a5a]"
                  }`}>
                    {row.chordContext}
                  </span>
                </div>
              )}
              <div className="space-y-1">
                {!multi && <span className="text-[#666] text-xs">Degrees played:</span>}
                <div className="flex gap-1 items-stretch flex-wrap">
                  {row.degrees.map((deg, i) => {
                    const isAltered = /[b#]/.test(deg);
                    const absPitch = row.notes[i] ?? 0;
                    const pcFromTonic = ((absPitch - tonicPc) % edo + edo) % edo;
                    const solfege = heathwaiteTable ? heathwaiteTable[pcFromTonic] ?? "—" : "—";
                    const degColor = isAltered ? "#bb88ee" : showTarget ? "#8fc88f" : "#9999ee";
                    const bg = isAltered
                      ? "bg-[#2a1a3a]"
                      : showTarget ? "bg-[#1a2a1a]" : "bg-[#1a1a2a]";
                    const border = isAltered
                      ? "border-[#6644aa]"
                      : showTarget ? "border-[#3a5a3a]" : "border-[#333]";
                    return (
                      <div key={i} className={`flex flex-col items-center px-2 py-1 rounded border ${bg} ${border}`}
                           style={{ minWidth: 36 }}>
                        <span className="text-[11px] font-mono font-bold leading-tight" style={{ color: degColor }}>
                          {deg}
                        </span>
                        <span className="text-[9px] leading-tight mt-0.5" style={{ color: degColor + "cc" }}>
                          {solfege}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
        );
      })()}
    </div>
  );
}
