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
import { getDegreeMap } from "@/lib/edoData";
import { useLS, registerKnownOption, unregisterKnownOptionsForPrefix } from "@/lib/storage";
import { weightedRandomChoice } from "@/lib/stats";
import { useContourReplay } from "@/components/PitchContour";
import ModeScalePicker from "@/components/ModeScalePicker";
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
const GAP = 560;

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
  const [scaleFam, setScaleFam] = useLS<string>("lt_perm_scaleFam", famNames[0]);
  const [modeName, setModeName] = useLS<string>("lt_perm_mode", PATTERN_SCALE_FAMILIES[famNames[0]][0]);
  const [lengthFilter, setLengthFilter] = useLS<string>("lt_perm_length", "Any");

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

  const [showTarget, setShowTarget] = useState<string | null>(null);
  const [infoText, setInfoText] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const pendingInfo = useRef<{ text: string; isTarget: boolean } | null>(null);
  const [hasPendingInfo, setHasPendingInfo] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [contourNotes, setContourNotes] = useState<number[] | null>(null);
  const [contourDegrees, setContourDegrees] = useState<string[] | null>(null);
  const [contourVisible, setContourVisible] = useState(false);
  const [lastChordContext, setLastChordContext] = useState<string>("");

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
  function buildMelodicPhrase(family: string): Built | null {
    let pool = MELODY_BANK_31.filter(m => m.family === family);
    if (lengthFilter !== "Any") {
      const len = parseInt(lengthFilter);
      pool = pool.filter(m => m.degrees.length === len);
    }
    if (!pool.length) return null;
    const phrase = randomChoice(pool);
    const isGen = MELODY_GENERATIVE_FAMILIES.has(family);
    const [low, high] = strictWindowBounds(lowestPitch, highestPitch);
    const midPitch = Math.floor((lowestPitch + highestPitch) / 2);
    const base = midPitch - (((midPitch - tonicPc) % edo + edo) % edo);
    const rawSteps = resolveMelodyDegrees(phrase, base - tonicPc, scaleFam, modeName, isGen, edo);
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
  function buildCadenceChords(progId: string): Built | null {
    const chords = CADENCE_PROGRESSIONS[progId];
    if (!chords || !chords.length) return null;
    const modeMap = getModeDegreeMap(edo, scaleFam, modeName);
    const midPitch = Math.floor((lowestPitch + highestPitch) / 2);
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

  function buildMelody(family: string): Built | null {
    if (family === "Cadences") {
      // If any variant is enabled, pick one; otherwise default to
      // "phrase" (the curated melodic bank).
      const enabled = melodyVariants["Cadences"];
      const allIds = (MELODY_VARIANTS["Cadences"] ?? []).map(v => v.id);
      const active = (enabled && enabled.length) ? enabled : allIds;
      const picked = active.length ? randomChoice(active) : "phrase";
      if (picked === "phrase") return buildMelodicPhrase(family);
      const chord = buildCadenceChords(picked);
      if (chord) return chord;
      // Fall back to melodic phrase if chord build failed.
      return buildMelodicPhrase(family);
    }
    return buildMelodicPhrase(family);
  }

  function buildJazz(family: string): Built | null {
    const len = lengthFilter !== "Any" ? parseInt(lengthFilter) : 3 + Math.floor(Math.random() * 5);
    const enabledList = jazzVariants[family];
    const enabledSet = enabledList && enabledList.length > 0 ? new Set(enabledList) : undefined;
    const phrase = generateJazzCell(family, len, enabledSet, scaleFam, modeName);
    const [low, high] = strictWindowBounds(lowestPitch, highestPitch);
    const midPitch = Math.floor((lowestPitch + highestPitch) / 2);
    const base = midPitch - (((midPitch - tonicPc) % edo + edo) % edo);
    const rawSteps = jazzPhraseToStepsEdo(phrase.degrees, base - tonicPc, scaleFam, modeName, edo);
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
    const family = weightedRandomChoice(active, f => `perm:${FAMILY_KIND[f]}:${f}`);
    const kind = FAMILY_KIND[family];
    const built = kind === "jazz" ? buildJazz(family) : buildMelody(family);
    if (!built) { onResult("Could not build a phrase. Try wider range or another family."); return; }

    const info = built.degrees.join(" → ");
    setShowTarget(null);
    setInfoText("");
    setHasPendingInfo(false);
    setContourNotes(built.absNotes);
    setContourDegrees(built.degrees);
    setContourVisible(false);
    setLastChordContext(built.chordContext ?? "");
    pendingInfo.current = { text: info, isTarget: responseMode !== "Play Audio" };
    setHasPendingInfo(true);
    onResult(built.label);
    onPlay(built.optKey, built.label);
    lastPlayed.current = { frames: built.frames, info };
    setHasPlayed(true);

    setIsPlaying(true);
    audioEngine.playSequence(built.frames, edo, GAP, 0.8);
    setTimeout(() => setIsPlaying(false), built.frames.length * GAP + 500);
  };

  const highlightFrames = useCallback((frames: number[][]) => {
    frameTimers.current.forEach(id => clearTimeout(id));
    frameTimers.current = [];
    frames.forEach((frame, i) => {
      const id = setTimeout(() => onHighlight(frame), i * GAP);
      frameTimers.current.push(id);
    });
  }, [onHighlight]);

  const contourReplay = useContourReplay(
    contourVisible && contourNotes ? contourNotes.map(n => [n]) : null,
    GAP,
  );

  const replay = () => {
    const lp = lastPlayed.current;
    if (!lp) return;
    setIsPlaying(true);
    if (contourVisible) contourReplay.startReplay();
    audioEngine.playSequence(lp.frames, edo, GAP, 0.8);
    if (showTarget || infoText) highlightFrames(lp.frames);
    setTimeout(() => setIsPlaying(false), lp.frames.length * GAP + 500);
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
    const lp = lastPlayed.current;
    if (lp && !isPlaying) {
      setIsPlaying(true);
      audioEngine.playSequence(lp.frames, edo, GAP, 0.8);
      highlightFrames(lp.frames);
      setTimeout(() => setIsPlaying(false), lp.frames.length * GAP + 500);
    } else if (lp) {
      highlightFrames(lp.frames);
    }
  };

  return (
    <div className="space-y-4">
      <ModeScalePicker scaleFam={scaleFam} modeName={modeName}
        onChange={(fam, mode) => { setScaleFam(fam); setModeName(mode); }} />

      {/* Length filter sits directly above the categories per direct
          user direction (2026-05-12) "put length above the categories"
          so it reads as the filter that applies to every family below. */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-[#888] block mb-1">Length Filter</label>
          <select value={lengthFilter} onChange={e => setLengthFilter(e.target.value)}
            className="bg-[#1e1e1e] border border-[#333] rounded px-2 py-1.5 text-sm text-white focus:outline-none">
            {LENGTH_OPTIONS.map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div className="text-xs text-[#555]">
          {FAMILY_NAMES.filter(f => checked.has(f)).length} families selected
        </div>
      </div>

      {/* Family rows grouped into three collapsible categories per
          direct user direction (2026-05-12) "organize these into three
          tabs Chord-based, Jazz-Inspired, Permutations" with "where i
          can collapse like a list".  Each category header shows the
          on/off count for its families and toggles a collapse. */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => setChecked(new Set(FAMILY_NAMES))} className="text-[9px] text-[#555] hover:text-[#9999ee] border border-[#222] rounded px-2 py-0.5">All</button>
          <button onClick={() => setChecked(new Set())} className="text-[9px] text-[#555] hover:text-[#9999ee] border border-[#222] rounded px-2 py-0.5">None</button>
        </div>
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
                        {on && variants.length > 0 && (
                          <div className="flex flex-wrap gap-1 px-3 pb-2">
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
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Show Answer panel — Roman-numeral chord context (when
          relevant for the family) + Degrees-played row.  No more
          variant prose per direct user direction (2026-05-12) "i odnt
          need to see the varient information, this show answer looks
          like notepad information" + "i want roman numerals for
          whatever is relevant like triad pairs or arpeggios". */}
      {(showTarget || infoText) && contourDegrees && (
        <div className={`rounded p-3 border space-y-2 ${
          showTarget ? "bg-[#1a2a1a] border-[#3a5a3a]" : "bg-[#141414] border-[#2a2a2a]"
        }`}>
          {lastChordContext && (
            <div className="flex gap-1 items-center flex-wrap">
              <span className="text-[#666] text-xs mr-1">Chord:</span>
              <span className={`px-2 py-0.5 rounded text-xs font-mono font-semibold border ${
                showTarget
                  ? "bg-[#1a2a1a] text-[#8fc88f] border-[#3a5a3a]"
                  : "bg-[#1a1a2a] text-[#bbbbee] border-[#3a3a5a]"
              }`}>
                {lastChordContext}
              </span>
            </div>
          )}
          <div className="flex gap-1 items-center flex-wrap">
            <span className="text-[#666] text-xs mr-1">Degrees played:</span>
            {contourDegrees.map((deg, i) => {
              const isAltered = /[b#]/.test(deg);
              return (
                <span key={i} className={`px-1.5 py-0.5 rounded text-xs font-mono border ${
                  isAltered
                    ? "bg-[#2a1a3a] text-[#bb88ee] border-[#6644aa] font-bold"
                    : showTarget
                      ? "bg-[#1a2a1a] text-[#8fc88f] border-[#3a5a3a]"
                      : "bg-[#1a1a2a] text-[#9999ee] border-[#333]"
                }`}>
                  {deg}
                </span>
              );
            })}
          </div>
        </div>
      )}

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
        {hasPendingInfo && (
          <button onClick={handleShowInfo}
            className="bg-[#1e1e1e] hover:bg-[#2a2a2a] border border-[#444] text-[#9999ee] px-4 py-2 rounded text-sm transition-colors">
            Show Answer
          </button>
        )}
        {answerButtons}
      </div>
    </div>
  );
}
