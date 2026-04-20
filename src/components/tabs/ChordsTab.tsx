import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { audioEngine } from "@/lib/audioEngine";
import { useLS, registerKnownOption, unregisterKnownOptionsForPrefix } from "@/lib/storage";
import type { TabSettingsSnapshot } from "@/App";
import { weightedRandomChoice } from "@/lib/stats";
import {
  FORMULA_NAMES, EXTENSION_LABELS, LOOP_LENGTHS,
  buildSequenceFromFormula,
  placeChordInRegister,
  getAllChordsForEdo, generateFunctionalLoop,
  triadQuality, describeChord, intervalLabel, randomChoice, shuffle,
  ALL_VOICING_PATTERNS, VOICING_PATTERN_GROUPS, applyVoicingPattern,
  scoreVoiceLeading,
  generateBassLine, generateMelodyLine,
  checkLowIntervalLimits, formatLilWarnings,
  type LilWarning,
} from "@/lib/musicTheory";
import { getExtLabelToSteps, getChordShapes, getEdoChordTypes, type EdoChordType } from "@/lib/edoData";
import { getTonalityBanks, getMagicModeBank, getTonalityNames, type TonalityBank, type ChordEntry } from "@/lib/tonalityBanks";
import { formatRomanNumeral } from "@/lib/formatRoman";

interface Props {
  tonicPc: number;
  lowestOct: number;
  highestOct: number;
  edo: number;
  onHighlight: (pcs: number[]) => void;
  responseMode: string;
  onResult: (text: string) => void;
  onPlay: (optionKey: string, label: string) => void;
  lastPlayed: React.MutableRefObject<{frames: number[][]; info: string} | null>;
  ensureAudio: () => Promise<void>;
  onShowOnKeyboard?: () => void;
  playVol?: number;
  layoutPitchRange?: { min: number; max: number };
  tabSettingsRef?: React.MutableRefObject<TabSettingsSnapshot | null>;
}

const REGISTER_MODES = ["Fixed Register","Random Bass Octave","Random Full Register"];
type Section = "isolated" | "functional";
const SECTION_META: { id: Section; label: string; color: string }[] = [
  { id: "isolated",   label: "Isolated Chords",   color: "#9999ee" },
  { id: "functional", label: "Functional Harmony", color: "#e0a040" },
];

// Chord-type tier ordering for the Functional Harmony progression selector.
// Classification walks 3rd by 3rd outward from the roman numeral's natural
// 3rd: exact match → any diatonic (m3/M3/sus) → xenharmonic same side → xen
// opposite side.  See `classifyChordType` below for the side/diatonic rules.
const CHORD_TYPE_MODES = ["diatonic", "chromatic-diatonic", "diatonic-xen", "chromatic-xen"] as const;
type ChordTypeMode = typeof CHORD_TYPE_MODES[number];
const CHORD_TYPE_MODE_LABELS: Record<ChordTypeMode, string> = {
  "diatonic":           "Diatonic",
  "chromatic-diatonic": "Chromatic Diatonic",
  "diatonic-xen":       "Diatonic Xenharmonic",
  "chromatic-xen":      "Chromatic Xenharmonic",
};
const CHORD_TYPE_MODE_HINTS: Record<ChordTypeMode, string> = {
  "diatonic":           "Exact match on 3rd (and 7th if present): IV → IV, IV7 → IV7.",
  "chromatic-diatonic": "Any standard 3rd + 7th (m3/M3/sus, m7/M7/dim7): IV → IV7, iv, sus, …",
  "diatonic-xen":       "Xenharmonic 3rd or 7th on the same side (IV → IVneutral, IV min_h7-major-side, …).",
  "chromatic-xen":      "Xenharmonic 3rd or 7th on the opposite side (IV → ivsubminor, harm7 variants, …).",
};

export default function ChordsTab({
  tonicPc, lowestOct, highestOct, edo, onHighlight, responseMode, onResult, onPlay, lastPlayed, ensureAudio, playVol = 0.55, layoutPitchRange, tabSettingsRef
}: Props) {
  const frameTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [section, setSection] = useLS<Section>("lt_crd_section", "isolated");

  // ── Shared chord selection state ────────────────────────────────────
  const [checkedChords, setCheckedChords] = useLS<Set<string>>("lt_crd_chords",
    new Set(["I","IV","V","vi","ii","iii","vii°"])
  );
  const [regMode, setRegMode] = useLS<string>("lt_crd_regMode", "Fixed Register");
  const [extTendency, setExtTendency] = useLS<string>("lt_crd_extTend", "Any");
  const [checkedExts, setCheckedExts] = useLS<Set<string>>("lt_crd_exts", new Set(["7th"]));
  const [checkedExtCounts, setCheckedExtCounts] = useLS<Set<number>>("lt_crd_extCounts", new Set([0, 1]));
  const [checkedPatterns, setCheckedPatterns] = useLS<Set<string>>("lt_crd_vpatterns", new Set(["t-135"]));
  const [checkedChordTypes, setCheckedChordTypes] = useLS<Set<string>>("lt_crd_chordTypes",
    new Set(["maj", "min", "dim", "aug", "maj7", "dom7", "min7", "halfdim7"])
  );
  // Chord-type progression mode for Functional Harmony.  Four tiers,
  // classified by the candidate's 3rd relative to the roman numeral's 3rd:
  //   "diatonic"            — exact match (IV → IV only)
  //   "chromatic-diatonic"  — any standard m3/M3/sus type, regardless of
  //                            numeral (IV → IV, IV7, iv, iv7, IVsus, …)
  //   "diatonic-xen"        — xenharmonic 3rds on the SAME side as the
  //                            numeral (IV → IV-neutral, IV-supermaj, …)
  //   "chromatic-xen"       — xenharmonic 3rds on the OPPOSITE side
  //                            (IV → iv-subminor, …)
  // Legacy values ("any"/"by-third") are migrated on load.
  const [chordTypeModeRaw, setChordTypeModeRaw] = useLS<string>("lt_crd_chordTypeMode", "chromatic-diatonic");
  const chordTypeMode: ChordTypeMode =
    chordTypeModeRaw === "any"      ? "chromatic-diatonic" :
    chordTypeModeRaw === "by-third" ? "diatonic" :
    (CHORD_TYPE_MODES as readonly string[]).includes(chordTypeModeRaw)
      ? (chordTypeModeRaw as ChordTypeMode)
      : "chromatic-diatonic";
  const setChordTypeMode = (m: ChordTypeMode) => setChordTypeModeRaw(m);

  // Isolated section state
  const [checkedFormulas, setCheckedFormulas] = useLS<Set<string>>("lt_crd_formulas",
    new Set(["I X I","ii/X V/X X"])
  );
  const [showTarget, setShowTarget] = useState<string | null>(null);
  const [infoText, setInfoText] = useState<string>("");
  const pendingInfo = useRef<{text: string; isTarget: boolean} | null>(null);
  const [hasPendingInfo, setHasPendingInfo] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);

  // Tonality state (shared)
  const [tonality, setTonality] = useLS<string>("lt_crd_tonality", "Major");
  const [tonicBetween, setTonicBetween] = useLS<boolean>("lt_crd_tonicBetween", false);
  const [collapsedLevels, setCollapsedLevels] = useState<Set<string>>(new Set());

  // Store last play params for re-voice
  const lastPlayParams = useRef<{
    seq: [string, number[] | null][];
    formula: string;
    chordMap: Record<string, number[]>;
  } | null>(null);

  // ── Functional Harmony state ────────────────────────────────────────
  const [loopLength, setLoopLength] = useLS<number>("lt_crd_fh_len", 4);
  const [loopGap, setLoopGap] = useLS<number>("lt_crd_fh_gap", 1.5);
  const [chordDur, setChordDur] = useLS<number>("lt_crd_fh_dur", 0.65);
  const [isLooping, setIsLooping] = useState(false);
  const loopTimerId = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoopingRef = useRef(false);
  const [currentLoop, setCurrentLoop] = useState<string[] | null>(null);
  const [loopInfo, setLoopInfo] = useState<string>("");
  const [fhDetailInfo, setFhDetailInfo] = useState<string>("");
  const [fhShowAnswer, setFhShowAnswer] = useState(false);
  const fhFramesRef = useRef<number[][] | null>(null);

  // ── Polyphonic Realization state ────────────────────────────────────
  type BassLineMode = "root" | "root-fifth" | "passing" | "walking";
  type MelodyMode = "chord-tone" | "scalar" | "arpeggiate";
  const [textureLayers, setTextureLayers] = useLS<Set<string>>("lt_crd_texture", new Set(["harmony"]));
  const [bassLineMode, setBassLineMode] = useLS<BassLineMode>("lt_crd_bass_line_mode", "root");
  const [melodyMode, setMelodyMode] = useLS<MelodyMode>("lt_crd_melody_mode", "chord-tone");
  const [harmonyVol, setHarmonyVol] = useLS<number>("lt_crd_vol_harmony", 0.7);
  const [bassVol, setBassVol] = useLS<number>("lt_crd_vol_bass", 0.55);
  const [melodyVol, setMelodyVol] = useLS<number>("lt_crd_vol_melody", 0.75);
  const [arpEnabled, setArpEnabled] = useLS<boolean>("lt_crd_arp_enabled", false);
  const [arpBpm, setArpBpm] = useLS<number>("lt_crd_arp_bpm", 100);
  const [passingTones, setPassingTones] = useLS<boolean>("lt_crd_passing_tones", false);
  const fhVoicesRef = useRef<{ chords: number[][]; bass: number[][]; melody: number[][]; appliedShapes: (number[] | null)[] } | null>(null);

  useEffect(() => { isLoopingRef.current = isLooping; }, [isLooping]);

  useEffect(() => {
    unregisterKnownOptionsForPrefix("crd:");
    if (section === "isolated") {
      Array.from(checkedFormulas).forEach(f => {
        registerKnownOption(`crd:${f}`, `Chord Formula: ${f}`);
      });
    } else {
      // Functional Harmony: register selected roman numerals
      Array.from(checkedChords).forEach(rn => {
        registerKnownOption(`crd:fh:${rn}`, `Chords: ${rn}`);
      });
    }
    return () => unregisterKnownOptionsForPrefix("crd:");
  }, [section, checkedFormulas, checkedChords]);

  // Publish settings snapshot for history panel
  useEffect(() => {
    if (!tabSettingsRef) return;
    const edoTypes = getEdoChordTypes(edo);
    const triads = edoTypes.filter(t => t.category === "triad" && checkedChordTypes.has(t.id)).map(t => t.name);
    const sevenths = edoTypes.filter(t => t.category === "seventh" && checkedChordTypes.has(t.id)).map(t => t.name);
    const voicingLabels = ALL_VOICING_PATTERNS.filter(p => checkedPatterns.has(p.id)).map(p => p.label);
    const extLabels = Array.from(checkedExts);
    const extCountLabels = Array.from(checkedExtCounts).sort().map(String);
    const texLayerLabels = Array.from(textureLayers);

    if (section === "functional") {
      tabSettingsRef.current = {
        title: "Chord Progression (Functional Harmony)",
        groups: [
          { label: "Roman Numerals", items: Array.from(checkedChords) },
          { label: "Ext Tendency", items: [extTendency] },
          { label: "Voicings", items: voicingLabels },
          { label: "Extensions", items: extLabels.length ? extLabels : ["none"] },
          { label: "# Extensions", items: extCountLabels },
          { label: "Chord Types", items: [CHORD_TYPE_MODE_LABELS[chordTypeMode]] },
          { label: "Triads", items: triads.length ? triads : ["none"] },
          { label: "7th Chords", items: sevenths.length ? sevenths : ["none"] },
          { label: "Settings", items: [
            `Loop: ${loopLength}`,
            `Spacing: ${loopGap}s`,
            `Duration: ${chordDur}s`,
            `Register: ${regMode}`,
            `Layers: ${texLayerLabels.join(", ") || "Harmony"}`,
            `Tonality: ${tonality}`,
          ]},
        ],
      };
    } else {
      tabSettingsRef.current = {
        title: "Chord Progression (Isolated)",
        groups: [
          { label: "Formulas", items: Array.from(checkedFormulas) },
          { label: "Roman Numerals", items: Array.from(checkedChords) },
          { label: "Ext Tendency", items: [extTendency] },
          { label: "Voicings", items: voicingLabels },
          { label: "Extensions", items: extLabels.length ? extLabels : ["none"] },
          { label: "# Extensions", items: extCountLabels },
          { label: "Chord Types", items: [CHORD_TYPE_MODE_LABELS[chordTypeMode]] },
          { label: "Triads", items: triads.length ? triads : ["none"] },
          { label: "7th Chords", items: sevenths.length ? sevenths : ["none"] },
          { label: "Settings", items: [`Register: ${regMode}`, `Tonality: ${tonality}`] },
        ],
      };
    }
  }, [section, checkedChords, checkedFormulas, extTendency, checkedPatterns, checkedExts, checkedExtCounts,
      checkedChordTypes, chordTypeMode, loopLength, loopGap, chordDur, regMode, textureLayers, tonality, edo, tabSettingsRef]);

  // Clamp notes to the keyboard's physical pitch range.
  // Avoids losing voices by deduplicating collapsed octaves.
  const clampToLayout = useCallback((notes: number[]): number[] => {
    if (!layoutPitchRange) return notes;
    const { min, max } = layoutPitchRange;
    const clamped: number[] = [];
    for (const n of notes) {
      let v = n;
      while (v < min) v += edo;
      while (v > max) v -= edo;
      // Always keep the note — never drop it even if it's outside the range
      if (v < min || v > max) v = n;
      clamped.push(v);
    }
    return clamped;
  }, [layoutPitchRange, edo]);

  const toggleSet = <T,>(set: Set<T>, val: T) => {
    const n = new Set(set);
    if (n.has(val)) n.delete(val); else n.add(val);
    return n;
  };

  // Build chord map: label → raw steps (relative to tonic root = 0)
  const allChords = getAllChordsForEdo(edo);
  const baseChordMap = Object.fromEntries(allChords.map(([n, s]) => [n, s]));

  // Get active tonality bank
  const tonalityBanks = useMemo(() => getTonalityBanks(edo), [edo]);
  const magicBank = useMemo(() => getMagicModeBank(edo), [edo]);
  const tonalityNames = useMemo(() => getTonalityNames(edo), [edo]);

  const activeBank: TonalityBank | null = useMemo(() => {
    if (tonality === "Magic Mode") return magicBank;
    return tonalityBanks.find(b => b.name === tonality) ?? tonalityBanks[0] ?? null;
  }, [tonality, tonalityBanks, magicBank]);

  // Merge tonality-specific chord shapes into base map
  const chordMap = useMemo(() => {
    const map = { ...baseChordMap };
    if (activeBank) {
      for (const level of activeBank.levels) {
        for (const entry of level.chords) {
          if (entry.steps && !map[entry.label]) {
            map[entry.label] = entry.steps;
          }
        }
      }
    }
    return map;
  }, [baseChordMap, activeBank]);

  // Filter chords by whether their type matches the checked chord types
  const edoChordTypes = useMemo(() => getEdoChordTypes(edo), [edo]);

  // Diatonic scale roots for the active tonality, sorted ascending pc. Used
  // to compute the natural 7th on each scale degree so "1 3 5 7" voicings
  // respect the key (e.g. I → Imaj7 in Major, V → V7, never Vmaj7).
  // Bank entries often have steps=null (ref lookups) so resolve each label
  // through chordMap — which already merges baseChordMap with bank overrides.
  const diatonicScaleRoots = useMemo<number[] | null>(() => {
    if (!activeBank) return null;
    const roots = new Set<number>();
    for (const level of activeBank.levels) {
      if (level.name !== "Primary" && level.name !== "Diatonic") continue;
      for (const c of level.chords) {
        const steps = c.steps ?? chordMap[c.label];
        if (steps && steps.length > 0) {
          roots.add(((steps[0] % edo) + edo) % edo);
        }
      }
    }
    if (roots.size !== 7) return null;
    return Array.from(roots).sort((a, b) => a - b);
  }, [activeBank, chordMap, edo]);

  // Get the pool of checked chord types that are compatible with a roman numeral's shape.
  // Returns the matching types so the caller can pick one and rebuild the chord.
  //
  // Both the 3rd AND (for seventh chords) the 7th feed classification:
  //   diatonic            → 3rd exactly matches the numeral's 3rd.  If the
  //                         numeral shape already carries a 7th, the
  //                         candidate's 7th must match exactly too; if the
  //                         numeral is a triad, only triad candidates qualify
  //                         (so "V diatonic" doesn't quietly add a 7th —
  //                         pick "V7" as the numeral for that).
  //   chromatic-diatonic  → every component is a standard 12-EDO interval:
  //                         3rd ∈ {m3, M3, M2, P4}, 7th ∈ {m7, M7, dim7}.
  //                         Any numeral pairs with any such type (IV → IV,
  //                         IV7, iv, iv7, IVsus, …).
  //   diatonic-xen        → at least one component is xenharmonic AND the
  //                         type's side (major/minorish) matches the
  //                         numeral's side.  E.g. IV (major-side) →
  //                         IVneutral, IVsupermaj.
  //   chromatic-xen       → at least one xen component AND opposite side.
  //                         E.g. IV → ivsubminor.
  //
  // Side of a type: if its 3rd is xen, use the 3rd's nearest-standard side;
  // else if its 7th is xen, use the 7th's side; else the 3rd's side (only
  // reached when fully standard, in which case the xen tiers exclude it).
  const getCompatibleTypes = useCallback((shape: number[]): EdoChordType[] => {
    if (checkedChordTypes.size === 0) return [];
    const root = shape[0];
    const rels = shape.map(s => ((s - root) % edo + edo) % edo).sort((a, b) => a - b);
    const chordThird   = rels.length >= 2 ? rels[1] : -1;
    const chordSeventh = rels.length >= 4 ? rels[3] : null;
    const { m3: minThird, M3: majThird, m7: min7th, M7: maj7th, M2, P4, A1 } = getChordShapes(edo);
    const dim7 = min7th - A1;

    const numeralIsMajor = Math.abs(chordThird - majThird) <= Math.abs(chordThird - minThird);
    const isStdThird   = (th: number) => th === majThird || th === minThird || th === M2 || th === P4;
    const isStd7th     = (sv: number) => sv === maj7th || sv === min7th || sv === dim7;
    const sideOfThird  = (th: number) => Math.abs(th - majThird) <= Math.abs(th - minThird);
    const sideOf7th    = (sv: number) => Math.abs(sv - maj7th) <= Math.abs(sv - min7th);

    // Diatonic 7th above this root in the current tonality, if the root is
    // a scale degree. Used to force "1 3 5 7" voicings on triads to match
    // the key (I → Imaj7 in major, V → V7, etc.) rather than softening to
    // "any m7/M7".
    const rootNorm = ((root % edo) + edo) % edo;
    let diatonicSeventh: number | null = null;
    if (diatonicScaleRoots) {
      const idx = diatonicScaleRoots.indexOf(rootNorm);
      if (idx >= 0) {
        const seventhRoot = diatonicScaleRoots[(idx + 6) % diatonicScaleRoots.length];
        diatonicSeventh = ((seventhRoot - rootNorm) % edo + edo) % edo;
      }
    }

    return edoChordTypes.filter(t => {
      if (!checkedChordTypes.has(t.id)) return false;
      const tThird   = t.third;
      const tSeventh = t.category === "seventh" ? t.steps[3] : null;
      const t3rdStd  = isStdThird(tThird);
      const t7thStd  = tSeventh === null ? true : isStd7th(tSeventh);
      const tAllStd  = t3rdStd && t7thStd;
      // Side: 3rd is the dominant signal; fall back to 7th only when the 3rd
      // is standard.  Standard-3rd + xen-7th types (e.g. min_h7) get their
      // side from the 7th so they land on the right xen tier.
      const tSide = !t3rdStd ? sideOfThird(tThird)
                   : (tSeventh !== null && !t7thStd) ? sideOf7th(tSeventh)
                   : sideOfThird(tThird);

      switch (chordTypeMode) {
        case "diatonic": {
          // Sus types always allowed on any side (triads only — a seventh
          // sus would need a scale-aware 7th choice we don't have here).
          if (tThird === M2 || tThird === P4) return tSeventh === null;
          const thirdMatches = tThird === chordThird;
          if (!thirdMatches) return false;
          if (chordSeventh === null) {
            if (tSeventh === null) return true;
            // Scale-degree root: require the exact diatonic 7th for the key
            // (e.g. I in major → M7 only, never m7).
            if (diatonicSeventh !== null) return tSeventh === diatonicSeventh;
            // Non-scale root (e.g. secondary dominant targets that aren't
            // triad-built): fall back to standard m7/M7.
            return tSeventh === maj7th || tSeventh === min7th;
          }
          // 7th numeral: require exact 7th match.
          return tSeventh !== null && tSeventh === chordSeventh;
        }
        case "chromatic-diatonic":
          return tAllStd;
        case "diatonic-xen":
          return !tAllStd && tSide === numeralIsMajor;
        case "chromatic-xen":
          return !tAllStd && tSide !== numeralIsMajor;
      }
    });
  }, [edo, edoChordTypes, checkedChordTypes, chordTypeMode, diatonicScaleRoots]);

  // Build a chord shape by applying a chord type's intervals to a roman numeral's root
  const applyChordType = useCallback((shape: number[], type: EdoChordType): number[] => {
    const root = shape[0];
    return type.steps.map(s => root + s);
  }, []);

  // Check if any chord type is compatible (for filtering the roman numeral pool)
  const chordMatchesType = useCallback((shape: number[]): boolean => {
    if (checkedChordTypes.size === 0) return true;
    return getCompatibleTypes(shape).length > 0;
  }, [checkedChordTypes, getCompatibleTypes]);

  // When tonality changes, auto-select its primary chords
  const prevTonality = useRef(tonality);
  useEffect(() => {
    if (prevTonality.current !== tonality) {
      prevTonality.current = tonality;
      if (activeBank) {
        const primary = activeBank.levels[0];
        if (primary) {
          setCheckedChords(new Set(primary.chords.map(c => c.label)));
        }
      }
    }
  }, [tonality, activeBank, setCheckedChords]);

  // ── Shared voicing pipeline ─────────────────────────────────────────

  // Derive the set of valid note counts from the selected voicing patterns
  const patternNoteCounts = useMemo(() => {
    const counts = new Set<number>();
    for (const p of ALL_VOICING_PATTERNS) {
      if (!checkedPatterns.has(p.id)) continue;
      const lo = p.minNotes;
      const hi = p.maxNotes ?? 7;
      for (let n = lo; n <= hi; n++) counts.add(n);
    }
    return counts;
  }, [checkedPatterns]);

  const voiceChord = useCallback((rn: string, stepsOverride: number[] | null, currentChordMap: Record<string, number[]>, prevChord: number[] | null = null) => {
    // No voicing patterns selected → nothing to play
    if (patternNoteCounts.size === 0) return null;

    let shape = stepsOverride ?? currentChordMap[rn];
    if (!shape) return null;

    // Apply a random compatible chord type if any are checked
    const compatTypes = getCompatibleTypes(shape);
    if (compatTypes.length > 0) {
      shape = applyChordType(shape, randomChoice(compatTypes));
    }

    // Target note count is drawn from what the selected patterns support
    const validCounts = Array.from(patternNoteCounts);
    const targetNotes = randomChoice(validCounts);
    const k_ext = Math.max(0, targetNotes - 3);

    const scalePcs = new Set<number>();
    const checkedRomans = Array.from(checkedChords).filter(r => currentChordMap[r]);
    for (const rn2 of checkedRomans) {
      for (const s of currentChordMap[rn2] ?? []) scalePcs.add(((s % edo) + edo) % edo);
    }

    const rootStep = shape[0];

    // Pick a "reference" octave to build the chord content (extension picking
    // uses absolute-pitch dedup, so we need a concrete octave for that step).
    const refOctave = lowestOct + Math.floor(Math.random() * (highestOct - lowestOct + 1));
    const refRootAbs = tonicPc + (refOctave - 4) * edo + rootStep;
    let chordAbsRef = shape.map(s => refRootAbs + (s - rootStep));

    // Find the matching chord type for per-type stable/avoid filtering
    const chordRels = shape.map(s => ((s - rootStep) % edo + edo) % edo).sort((a, b) => a - b);
    const matchedType = edoChordTypes.find(t => {
      const tKey = t.steps.join(",");
      return chordRels.join(",") === tKey || chordRels.join(",").startsWith(tKey + ",");
    });

    const buildExtPool = (strict: boolean): number[] => {
      const pool: number[] = [];
      for (const lbl of checkedExts) {
        for (const s of getExtLabelToSteps(edo)[lbl] ?? []) {
          if (strict && matchedType && (matchedType.stable.length > 0 || matchedType.avoid.length > 0)) {
            const relPc = ((s) % edo + edo) % edo;
            if (extTendency === "Stable" && !matchedType.stable.includes(relPc)) continue;
            if (extTendency === "Avoid"  && !matchedType.avoid.includes(relPc)) continue;
          } else if (strict) {
            const pc = ((rootStep + s) % edo + edo) % edo;
            if (extTendency === "Stable" && !scalePcs.has(pc)) continue;
            if (extTendency === "Avoid"  &&  scalePcs.has(pc)) continue;
          }
          pool.push(s);
        }
      }
      return pool;
    };
    let extStepPool = buildExtPool(true);
    if (extStepPool.length === 0 && extTendency !== "Any") extStepPool = buildExtPool(false);

    if (k_ext > 0 && extStepPool.length > 0) {
      const existing = new Set(chordAbsRef);
      const candidates = extStepPool.map(s => refRootAbs + s).filter(n => !existing.has(n));
      shuffle(candidates);
      chordAbsRef = [...chordAbsRef, ...candidates.slice(0, k_ext)].sort((a, b) => a - b);
    }

    if (chordAbsRef.length > targetNotes) {
      chordAbsRef = chordAbsRef.slice(0, targetNotes);
    }

    // Must match a selected voicing pattern — no fallback
    const nNotes = chordAbsRef.length;
    const compatPatterns = ALL_VOICING_PATTERNS.filter(p =>
      checkedPatterns.has(p.id) && nNotes >= p.minNotes && (!p.maxNotes || nNotes <= p.maxNotes)
    );
    if (compatPatterns.length === 0) return null;

    // Capture chord content as steps relative to the reference root, so we
    // can re-realize it at any candidate octave during voice-leading search.
    const relSteps = chordAbsRef.map(n => n - refRootAbs);
    const buildVoicing = (oct: number, pattern: typeof ALL_VOICING_PATTERNS[number]): number[] => {
      const rootAbs = tonicPc + (oct - 4) * edo + rootStep;
      const content = relSteps.map(s => rootAbs + s).sort((a, b) => a - b);
      const voiced = applyVoicingPattern(content, edo, pattern);
      return clampToLayout(voiced);
    };

    let chordAbs: number[];
    if (prevChord && prevChord.length > 0) {
      // ── Voice-leading search: enumerate every (octave, pattern) candidate
      //   from the user's allowed patterns, score each via scoreVoiceLeading
      //   (smooth motion, common tones, voice-count match, bass leap), keep
      //   the lowest-scoring candidate.  Ties broken by random shuffle so
      //   the loop doesn't lock onto the same exact voicing every iteration.
      const scored: { voicing: number[]; score: number }[] = [];
      for (let oct = lowestOct; oct <= highestOct; oct++) {
        for (const pat of compatPatterns) {
          const cand = buildVoicing(oct, pat);
          if (cand.length === 0) continue;
          scored.push({ voicing: cand, score: scoreVoiceLeading(cand, prevChord, edo) });
        }
      }
      if (scored.length === 0) {
        chordAbs = buildVoicing(refOctave, randomChoice(compatPatterns));
      } else {
        scored.sort((a, b) => a.score - b.score);
        // Pick from the top 3 (or fewer) so repeats vary.
        const top = scored.slice(0, Math.min(3, scored.length));
        chordAbs = randomChoice(top).voicing;
      }
    } else {
      chordAbs = buildVoicing(refOctave, randomChoice(compatPatterns));
    }

    return { chordAbs, voicingType: "pattern", quality: triadQuality(shape, edo), appliedShape: [...shape] };
  }, [section, checkedPatterns, patternNoteCounts, checkedChords, checkedExts, extTendency, regMode, edo, tonicPc, lowestOct, highestOct, clampToLayout, getCompatibleTypes, applyChordType, edoChordTypes]);

  // ── Isolated Chords: buildAndPlayFrames ─────────────────────────────

  const buildAndPlayFrames = async (
    seq: [string, number[] | null][],
    usedFormula: string,
    currentChordMap: Record<string, number[]>,
  ) => {
    const validCounts = Array.from(patternNoteCounts);
    if (validCounts.length === 0) return; // no patterns selected
    const targetNotes = randomChoice(validCounts);
    const k_ext = Math.max(0, targetNotes - 3);

    const scalePcs = new Set<number>();
    const checkedRomans = Array.from(checkedChords).filter(r => currentChordMap[r]);
    for (const rn of checkedRomans) {
      for (const s of currentChordMap[rn] ?? []) scalePcs.add(((s % edo) + edo) % edo);
    }

    const frames: number[][] = [];
    const infoLines: string[] = [
      `Progression: ${seq.map(([lbl]) => lbl).join(", ")}`,
      "",
    ];

    if (tonicBetween) {
      const sh = getChordShapes(edo);
      const tonicShape = activeBank
        ? (activeBank.levels[0]?.chords[0]?.steps ?? sh.MAJ.map(s => s))
        : sh.MAJ.map(s => s);
      const midOct = Math.floor((lowestOct + highestOct) / 2);
      const tonicRoot = tonicPc + (midOct - 4) * edo;
      let tonicAbs = tonicShape.map(s => tonicRoot + s);
      tonicAbs = placeChordInRegister(tonicAbs, edo, tonicPc, lowestOct, highestOct, regMode);
      tonicAbs = clampToLayout(tonicAbs);
      frames.push(tonicAbs);
      infoLines.push(`[1] Tonic context`);
      infoLines.push("─".repeat(28));
    }

    for (const [rn, stepsOverride] of seq) {
      let shape = stepsOverride ?? currentChordMap[rn];
      if (!shape) { infoLines.push(`[${rn}] — missing shape`); continue; }

      // Apply a random compatible chord type if any are checked
      const compatTypes = getCompatibleTypes(shape);
      if (compatTypes.length > 0) {
        const chosenType = randomChoice(compatTypes);
        shape = applyChordType(shape, chosenType);
      }

      const rootStep = shape[0];

      // Pick a random octave for the root within the register
      const octave = lowestOct + Math.floor(Math.random() * (highestOct - lowestOct + 1));
      const rootAbs = tonicPc + (octave - 4) * edo + rootStep;

      let chordAbs = shape.map(s => rootAbs + (s - rootStep));
      const quality = triadQuality(shape, edo);

      // Match chord type for per-type stable/avoid
      const chordRels = shape.map(s => ((s - rootStep) % edo + edo) % edo).sort((a, b) => a - b);
      const matchedType = edoChordTypes.find(t => {
        const tKey = t.steps.join(",");
        return chordRels.join(",") === tKey || chordRels.join(",").startsWith(tKey + ",");
      });

      const buildExtPool = (strict: boolean): number[] => {
        const pool: number[] = [];
        for (const lbl of checkedExts) {
          for (const s of getExtLabelToSteps(edo)[lbl] ?? []) {
            if (strict && matchedType && (matchedType.stable.length > 0 || matchedType.avoid.length > 0)) {
              const relPc = ((s) % edo + edo) % edo;
              if (extTendency === "Stable" && !matchedType.stable.includes(relPc)) continue;
              if (extTendency === "Avoid"  && !matchedType.avoid.includes(relPc)) continue;
            } else if (strict) {
              const pc = ((rootStep + s) % edo + edo) % edo;
              if (extTendency === "Stable" && !scalePcs.has(pc)) continue;
              if (extTendency === "Avoid"  &&  scalePcs.has(pc)) continue;
            }
            pool.push(s);
          }
        }
        return pool;
      };
      let extStepPool = buildExtPool(true);
      if (extStepPool.length === 0 && extTendency !== "Any") extStepPool = buildExtPool(false);

      if (k_ext > 0 && extStepPool.length > 0) {
        const existing = new Set(chordAbs);
        const candidates = extStepPool.map(s => rootAbs + s).filter(n => !existing.has(n));
        shuffle(candidates);
        chordAbs = [...chordAbs, ...candidates.slice(0, k_ext)].sort((a, b) => a - b);
      }

      if (chordAbs.length > targetNotes) {
        chordAbs = chordAbs.slice(0, targetNotes);
      }

      // Must match a selected voicing pattern — no fallback
      const nNotes = chordAbs.length;
      const compatPats = ALL_VOICING_PATTERNS.filter(p =>
        checkedPatterns.has(p.id) && nNotes >= p.minNotes && (!p.maxNotes || nNotes <= p.maxNotes)
      );
      if (compatPats.length === 0) { infoLines.push(`[${rn}] — no matching voicing pattern`); continue; }

      chordAbs = applyVoicingPattern(chordAbs, edo, randomChoice(compatPats));
      chordAbs = clampToLayout(chordAbs);

      if (chordAbs.length) {
        frames.push(chordAbs);
        const chordRootAbs = stepsOverride !== null
          ? ((tonicPc + stepsOverride[0]) % edo + edo) % edo
          : tonicPc + (currentChordMap[rn]?.[0] ?? 0);
        infoLines.push(`[${frames.length}] ${rn} (${quality})`);
        infoLines.push(`── Chord from Do ──`);
        infoLines.push(describeChord(chordAbs, tonicPc, edo));
        infoLines.push(`── Chord in context ──`);
        infoLines.push(describeChord(chordAbs, chordRootAbs, edo));
        const lilWarn = formatLilWarnings(checkLowIntervalLimits(chordAbs, edo), edo);
        if (lilWarn) infoLines.push(lilWarn);
        if (frames.length < seq.length + (tonicBetween ? 1 : 0)) infoLines.push("─".repeat(28));
      }
    }

    const info = infoLines.join("\n").trim();
    const optKey = `crd:${usedFormula}`;
    setInfoText("");
    setShowTarget(null);
    setHasPendingInfo(false);
    pendingInfo.current = { text: info, isTarget: responseMode !== "Play Audio" };
    setHasPendingInfo(true);

    lastPlayed.current = { frames, info };
    setHasPlayed(true);
    onPlay(optKey, `Chord Formula: ${usedFormula} (${seq.map(([lbl]) => lbl).join(' → ')})`);

    if (responseMode === "Play Audio") {
      audioEngine.playSequence(frames, edo, 1800, 1.5, playVol);
      onResult(`Chord progression: ${seq.map(([lbl]) => lbl).join(" → ")}`);
    } else {
      onResult(`Show Target: ${seq.map(([lbl]) => lbl).join(" → ")} — click Show Answer`);
    }
  };

  const play = async () => {
    await ensureAudio();
    const checkedRomans = Array.from(checkedChords).filter(r => chordMap[r]);
    if (!checkedRomans.length) { setInfoText("Select at least one chord."); return; }

    const formulas = Array.from(checkedFormulas);
    let seq: [string, number[] | null][] | null = null;
    let usedFormula = "custom";

    if (formulas.length) {
      for (let i = 0; i < 20; i++) {
        const f = weightedRandomChoice(formulas, f => `crd:${f}`);
        seq = buildSequenceFromFormula(f, checkedRomans, chordMap, edo);
        if (seq && seq.length) { usedFormula = f; break; }
      }
    }
    if (!seq) {
      seq = Array.from({length: 3}, () => [randomChoice(checkedRomans), null] as [string, number[] | null]);
      usedFormula = seq.map(([rn]) => rn).join('-');
    }

    lastPlayParams.current = { seq, formula: usedFormula, chordMap: { ...chordMap } };
    await buildAndPlayFrames(seq, usedFormula, chordMap);
  };

  const revoice = async () => {
    const params = lastPlayParams.current;
    if (!params) return;
    await ensureAudio();
    await buildAndPlayFrames(params.seq, params.formula, params.chordMap);
  };

  const highlightFrames = (frames: number[][], gapMs: number) => {
    frameTimers.current.forEach(id => clearTimeout(id));
    frameTimers.current = [];
    frames.forEach((frame, i) => {
      const id = setTimeout(() => {
        onHighlight(frame);
      }, i * gapMs);
      frameTimers.current.push(id);
    });
  };

  const replay = () => {
    const lp = lastPlayed.current;
    if (!lp) return;
    audioEngine.playSequence(lp.frames, edo, 1000, 1.5);
  };

  const handleShowInfo = () => {
    const p = pendingInfo.current;
    if (!p) return;
    if (lastPlayed.current) highlightFrames(lastPlayed.current.frames, 1000);
    if (p.isTarget) setShowTarget(p.text);
    else setInfoText(p.text);
  };

  // ── Functional Harmony: loop engine ─────────────────────────────────

  const stopLoop = useCallback(() => {
    if (loopTimerId.current !== null) {
      clearTimeout(loopTimerId.current);
      loopTimerId.current = null;
    }
    frameTimers.current.forEach(id => clearTimeout(id));
    frameTimers.current = [];
    isLoopingRef.current = false;
    setIsLooping(false);
    audioEngine.silencePlay();
  }, []);

  const buildLoopFrames = useCallback((progression: string[]): { chords: number[][]; bass: number[][]; melody: number[][]; appliedShapes: (number[] | null)[] } => {
    const chords: number[][] = [];
    const appliedShapes: (number[] | null)[] = [];
    // Thread each chord's voicing into the next so voiceChord can run its
    // voice-leading checklist against the previous chord's actual pitches.
    let prevVoicing: number[] | null = null;
    for (const rn of progression) {
      const result = voiceChord(rn, null, chordMap, prevVoicing);
      chords.push(result ? result.chordAbs : []);
      appliedShapes.push(result ? result.appliedShape : null);
      if (result && result.chordAbs.length > 0) prevVoicing = result.chordAbs;
    }
    const midOct = Math.floor((lowestOct + highestOct) / 2);
    // Always generate all voices so Show Answer has complete info;
    // playVoices filters by textureLayers for audio output
    const bassOct = midOct - 2;
    // Place melody above the highest chord note when possible
    const highestChordOct = chords.length > 0
      ? Math.floor(Math.max(...chords.flat()) / edo) + 4
      : midOct + 1;
    const melOct = Math.max(midOct, highestChordOct);
    const validShapes = appliedShapes.filter((s): s is number[] => s !== null);
    const bass = generateBassLine(validShapes, edo, tonicPc, bassOct, bassLineMode);
    const melody = generateMelodyLine(validShapes, edo, tonicPc, melOct, melodyMode);

    // Chords are already clamped by voiceChord — only clamp bass & melody
    const layoutMax = layoutPitchRange?.max ?? Infinity;
    for (let i = 0; i < melody.length; i++) {
      melody[i] = clampToLayout(melody[i]);
      // If clamping emptied the frame, fallback: use the highest chord note
      const subdivsMel = Math.max(1, Math.round(melody.length / chords.length));
      const chordIdxMel = Math.min(Math.floor(i / subdivsMel), chords.length - 1);
      if (melody[i].length === 0 && chords[chordIdxMel]?.length) {
        const topNote = Math.max(...chords[chordIdxMel]);
        melody[i] = [topNote + edo]; // one octave above highest chord note
      }
      // Ensure melody is always above the highest chord note
      if (chords[chordIdxMel]?.length) {
        const highestChordNote = Math.max(...chords[chordIdxMel]);
        melody[i] = melody[i].map(n => {
          while (n <= highestChordNote) n += edo;
          while (n > layoutMax) n -= edo;
          return n;
        });
      }
    }

    // Ensure bass notes are always below the lowest chord note,
    // then clamp to layout floor (never go below the keyboard)
    const layoutMin = layoutPitchRange?.min ?? -Infinity;
    if (bass.length > 0 && chords.length > 0) {
      for (let i = 0; i < bass.length; i++) {
        const subdivs = Math.max(1, Math.round(bass.length / chords.length));
        const chordIdx = Math.min(Math.floor(i / subdivs), chords.length - 1);
        const lowestChordNote = Math.min(...chords[chordIdx]);
        bass[i] = bass[i].map(n => {
          while (n >= lowestChordNote) n -= edo;
          // Don't go below the keyboard's lowest key
          while (n < layoutMin) n += edo;
          return n;
        });
      }
    } else {
      for (let i = 0; i < bass.length; i++) bass[i] = clampToLayout(bass[i]);
    }

    // ── Arpeggiation: replace block chords with musical broken-chord patterns ──
    // Bass note first, then chord tones in varied patterns (Alberti, ascending, etc.)
    if (arpEnabled) {
      const arpChords: number[][] = [];
      const patterns = [
        [0, 2, 1, 2],     // Alberti bass: low-high-mid-high
        [0, 1, 2, 1],     // low-mid-high-mid
        [0, 1, 2, 0],     // ascending + return
        [2, 1, 0, 1],     // descending + return
        [0, 2, 0, 1],     // bass-top-bass-mid
        [0, 1, 0, 2],     // bass-mid-bass-top
      ];
      for (let ci = 0; ci < chords.length; ci++) {
        const chord = chords[ci];
        if (chord.length === 0) { arpChords.push([], [], [], []); continue; }
        const sorted = [...chord].sort((a, b) => a - b);
        // Pick a pattern — vary per chord for musicality
        const pat = patterns[ci % patterns.length];
        for (const idx of pat) {
          const noteIdx = Math.min(idx, sorted.length - 1);
          arpChords.push([sorted[noteIdx]]);
        }
      }
      chords.length = 0;
      chords.push(...arpChords);
    }

    // ── Passing tones: add diatonic passing tones between melody notes ──
    if (passingTones && melody.length > 1) {
      const withPassing: number[][] = [];
      for (let i = 0; i < melody.length; i++) {
        withPassing.push(melody[i]);
        if (i < melody.length - 1 && melody[i].length > 0 && melody[i + 1].length > 0) {
          const from = melody[i][0];
          const to = melody[i + 1][0];
          const diff = to - from;
          // Only add passing tone if the interval is larger than a step
          if (Math.abs(diff) > 2 && Math.abs(diff) <= edo / 2) {
            const mid = Math.round((from + to) / 2);
            withPassing.push([mid]);
          }
        }
      }
      melody.length = 0;
      melody.push(...withPassing);
    }

    return { chords, bass, melody, appliedShapes };
  }, [voiceChord, chordMap, bassLineMode, melodyMode, edo, tonicPc, lowestOct, highestOct, clampToLayout, layoutPitchRange, arpEnabled, passingTones]);

  /** Play all active texture voices using the multi-voice scheduler. */
  const playVoices = useCallback((voices: { chords: number[][]; bass: number[][]; melody: number[][] }, gapMs: number, noteDur: number, vol: number) => {
    const voiceList: { frames: number[][]; noteDuration: number; gain: number }[] = [];
    if (textureLayers.has("harmony") && voices.chords.length) {
      voiceList.push({ frames: voices.chords, noteDuration: noteDur, gain: vol * harmonyVol });
    }
    if (textureLayers.has("bass") && voices.bass.length) {
      voiceList.push({ frames: voices.bass, noteDuration: noteDur * 1.2, gain: vol * bassVol });
    }
    if (textureLayers.has("melody") && voices.melody.length) {
      voiceList.push({ frames: voices.melody, noteDuration: noteDur * 0.8, gain: vol * melodyVol });
    }
    if (voiceList.length === 0) return;
    audioEngine.playMultiVoice(voiceList, edo, gapMs, voices.chords.length || 1);
  }, [textureLayers, edo, harmonyVol, bassVol, melodyVol]);

  /** Build a unified highlight timeline from all voices, merging events at the same time.
   *  Only includes voices whose texture layer is active. */
  const highlightAllVoices = useCallback((voices: { chords: number[][]; bass: number[][]; melody: number[][] }, gapMs: number) => {
    frameTimers.current.forEach(id => clearTimeout(id));
    frameTimers.current = [];
    const n = voices.chords.length;
    if (n === 0) return;

    // Only include voices for active texture layers
    const activeBass = textureLayers.has("bass") ? voices.bass : [];
    const activeMelody = textureLayers.has("melody") ? voices.melody : [];

    // Figure out subdivisions for each voice
    const bassSubdivs = activeBass.length > 0 ? Math.max(1, Math.round(activeBass.length / n)) : 0;
    const melSubdivs = activeMelody.length > 0 ? Math.max(1, Math.round(activeMelody.length / n)) : 0;
    const maxSubdivs = Math.max(1, bassSubdivs, melSubdivs);
    const subGap = gapMs / maxSubdivs;

    for (let slot = 0; slot < n; slot++) {
      for (let sub = 0; sub < maxSubdivs; sub++) {
        const t = slot * gapMs + sub * subGap;
        const notes: number[] = textureLayers.has("harmony") ? [...(voices.chords[slot] || [])] : [];
        // Add bass frame for this sub-beat
        if (bassSubdivs > 0) {
          const bassIdx = slot * bassSubdivs + Math.min(sub, bassSubdivs - 1);
          if (bassIdx < activeBass.length) notes.push(...activeBass[bassIdx]);
        }
        // Add melody frame for this sub-beat
        if (melSubdivs > 0) {
          const melIdx = slot * melSubdivs + Math.min(sub, melSubdivs - 1);
          if (melIdx < activeMelody.length) notes.push(...activeMelody[melIdx]);
        }
        const id = setTimeout(() => onHighlight(notes), t);
        frameTimers.current.push(id);
      }
    }
  }, [onHighlight, textureLayers]);

  const playLoopIteration = useCallback((voices: { chords: number[][]; bass: number[][]; melody: number[][] }, gapMs: number, noteDur: number) => {
    if (!voices.chords.length) return;
    playVoices(voices, gapMs, noteDur, playVol);
    highlightAllVoices(voices, gapMs);

    if (isLoopingRef.current) {
      const seqDur = (voices.chords.length - 1) * gapMs + noteDur * 1000 + 250;
      const totalMs = seqDur + loopGap * 1000;
      loopTimerId.current = setTimeout(() => {
        loopTimerId.current = null;
        const loop = currentLoop;
        if (!loop || !isLoopingRef.current) return;
        const newVoices = buildLoopFrames(loop);
        if (newVoices.chords.some(c => c.length > 0)) {
          lastPlayed.current = { frames: newVoices.chords, info: loop.join(" → ") };
          fhVoicesRef.current = newVoices;
          playLoopIteration(newVoices, gapMs, noteDur);
        }
      }, totalMs);
    }
  }, [playVoices, playVol, loopGap, currentLoop, buildLoopFrames, highlightAllVoices]);

  const startFunctionalLoop = useCallback(async () => {
    await ensureAudio();
    stopLoop();

    const checkedRomans = Array.from(checkedChords).filter(r => chordMap[r]);
    if (checkedRomans.length < 2) {
      setLoopInfo("Select at least 2 chords.");
      return;
    }

    const progression = generateFunctionalLoop(checkedRomans, loopLength);
    if (!progression) {
      setLoopInfo("Could not build a valid loop from these chords.");
      return;
    }

    setCurrentLoop(progression);
    const voices = buildLoopFrames(progression);
    if (!voices.chords.some(c => c.length > 0)) {
      setLoopInfo("Could not voice these chords.");
      return;
    }

    // Build detailed info for "Show Answer"
    const detailLines: string[] = [`Loop: ${progression.join(" → ")}`, ""];
    for (let idx = 0; idx < progression.length; idx++) {
      const rn = progression[idx];
      const applied = voices.appliedShapes[idx];
      const quality = applied ? triadQuality(applied, edo) : "?";
      detailLines.push(`[${idx + 1}] ${rn} (${quality})`);
      // Bass
      if (textureLayers.has("bass") && voices.bass.length > 0) {
        const subdivs = Math.max(1, Math.round(voices.bass.length / progression.length));
        const bassSlice = voices.bass.slice(idx * subdivs, (idx + 1) * subdivs);
        const bassNames = bassSlice.map(f => f.map(n => intervalLabel(((n - tonicPc) % edo + edo) % edo, edo)).join(",")).join(" → ");
        detailLines.push(`Bass:   ${bassNames}`);
      }
      // Melody
      if (textureLayers.has("melody") && voices.melody.length > 0) {
        const subdivs = Math.max(1, Math.round(voices.melody.length / progression.length));
        const melSlice = voices.melody.slice(idx * subdivs, (idx + 1) * subdivs);
        const melNames = melSlice.map(f => f.map(n => intervalLabel(((n - tonicPc) % edo + edo) % edo, edo)).join(",")).join(" → ");
        detailLines.push(`Melody: ${melNames}`);
      }
      // "from Do" and "in context" show ONLY the chord (harmony) notes
      if (voices.chords[idx]?.length) {
        const chordRoot = applied ? tonicPc + applied[0] : tonicPc;
        const chordNotes = [...voices.chords[idx]].sort((a, b) => a - b);
        const tonicNames = chordNotes.map(n => intervalLabel(((n - tonicPc) % edo + edo) % edo, edo));
        const rootNames = chordNotes.map(n => intervalLabel(((n - chordRoot) % edo + edo) % edo, edo));
        detailLines.push(`Chord from Do:    [${tonicNames.join(", ")}]`);
        detailLines.push(`Chord in context: [${rootNames.join(", ")}]`);
        const lilWarn = formatLilWarnings(checkLowIntervalLimits(chordNotes, edo), edo);
        if (lilWarn) detailLines.push(lilWarn);
      }
      if (idx < progression.length - 1) detailLines.push("─".repeat(28));
    }

    const info = progression.join(" → ");
    setLoopInfo(info);
    setFhDetailInfo(detailLines.join("\n"));
    setFhShowAnswer(false);
    fhFramesRef.current = voices.chords;
    fhVoicesRef.current = voices;
    lastPlayed.current = { frames: voices.chords, info };
    onPlay(`crd:fh:${info}`, `Chords: ${info}`);
    onResult(`Listen to the loop...`);

    // Play once — when arpeggiated, derive gap from BPM (each chord = 1 beat)
    const gapMs = arpEnabled ? (60000 / arpBpm) : loopGap * 1000;
    const noteDur = arpEnabled ? (60 / arpBpm) : chordDur; // quarter note duration
    setIsLooping(true);
    playVoices(voices, gapMs, noteDur, playVol * 0.7);
    // Total duration: for arpeggiated, chordCount = original progression length * 4
    const totalChords = arpEnabled ? voices.chords.length / 4 : voices.chords.length;
    const d = setTimeout(() => { setIsLooping(false); }, totalChords * gapMs + 500);
    frameTimers.current.push(d);
  }, [ensureAudio, stopLoop, checkedChords, chordMap, loopLength, loopGap, chordDur, buildLoopFrames, playVoices, onPlay, onResult, edo, tonicPc, playVol, textureLayers, arpEnabled, arpBpm]);

  const replayFunctionalLoop = useCallback(() => {
    const voices = fhVoicesRef.current;
    if (!voices || !voices.chords.length || isLooping) return;
    const gapMs = arpEnabled ? (60000 / arpBpm) : loopGap * 1000;
    const noteDur = arpEnabled ? (60 / arpBpm) * 0.25 : chordDur;
    setIsLooping(true);
    playVoices(voices, gapMs, noteDur, playVol * 0.7);
    const totalChords = arpEnabled ? voices.chords.length / 4 : voices.chords.length;
    const d = setTimeout(() => setIsLooping(false), totalChords * gapMs + 500);
    frameTimers.current.push(d);
  }, [playVoices, playVol, isLooping, loopGap, chordDur, arpEnabled, arpBpm]);

  const showFhAnswer = useCallback(async () => {
    await ensureAudio();
    setFhShowAnswer(true);
    setIsLooping(true);
    const voices = fhVoicesRef.current;
    if (voices && voices.chords.length) {
      const gapMs = loopGap * 1000;
      // Play all voices together
      playVoices(voices, gapMs, chordDur, playVol * 0.7);
      // Highlight all voices with subdivisions
      highlightAllVoices(voices, gapMs);
      const doneId = setTimeout(() => setIsLooping(false), voices.chords.length * gapMs + 500);
      frameTimers.current.push(doneId);
    }
  }, [ensureAudio, playVoices, highlightAllVoices, playVol, loopGap, chordDur]);

  // Stop loop on unmount or section change
  useEffect(() => {
    return () => stopLoop();
  }, [stopLoop]);

  useEffect(() => {
    if (section === "isolated") stopLoop();
  }, [section, stopLoop]);

  // ── Shared UI helpers ───────────────────────────────────────────────

  const toggleLevel = (name: string) => {
    setCollapsedLevels(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
  };

  const selectLevel = (chords: ChordEntry[]) => {
    setCheckedChords(prev => { const n = new Set(prev); for (const c of chords) n.add(c.label); return n; });
  };

  const deselectLevel = (chords: ChordEntry[]) => {
    const labels = new Set(chords.map(c => c.label));
    setCheckedChords(prev => { const n = new Set(prev); for (const l of labels) n.delete(l); return n; });
  };

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Section tabs — drum-pattern style pill buttons */}
      <div className="flex gap-2 items-center">
        {SECTION_META.map(s => {
          const active = section === s.id;
          return (
            <button key={s.id}
              onClick={() => setSection(s.id)}
              style={{
                padding: "6px 18px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                border: `1.5px solid ${active ? s.color : "#222"}`,
                background: active ? s.color + "18" : "#111",
                color: active ? s.color : "#555",
                cursor: "pointer", transition: "all 0.15s",
                letterSpacing: 0.5,
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Tonality selector row (shared) */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs text-[#888] font-medium">TONALITY</label>
        <select value={tonality} onChange={e => setTonality(e.target.value)}
          className="bg-[#1e1e1e] border border-[#333] rounded px-2 py-1.5 text-xs text-white focus:outline-none">
          {tonalityNames.map(t => <option key={t}>{t}</option>)}
        </select>
        {section === "isolated" && (
          <label className="flex items-center gap-1.5 text-xs cursor-pointer text-[#aaa] hover:text-white">
            <input type="checkbox" checked={tonicBetween}
              onChange={() => setTonicBetween(!tonicBetween)}
              className="accent-[#7173e6]" />
            Tonic before question
          </label>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* ISOLATED CHORDS section                                        */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {section === "isolated" && (
        <>
          {/* Formula + Controls row */}
          <div className="grid grid-cols-1 lg:grid-cols-[4fr_1fr] gap-4">
            {/* Left: controls + LIL underneath */}
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-[#888] mb-1.5 font-medium">FORMULA</p>
                  <div className="space-y-1">
                    {FORMULA_NAMES.map(f => (
                      <label key={f} className="flex items-center gap-2 text-xs cursor-pointer text-[#aaa] hover:text-white">
                        <input type="checkbox" checked={checkedFormulas.has(f)}
                          onChange={() => setCheckedFormulas(toggleSet(checkedFormulas, f))}
                          className="accent-[#7173e6]" />
                        <span>
                          {formatRomanNumeral(f)}
                          {f === "ii/X V/X X"  && <span className="ml-1 text-[#555] italic">major X only</span>}
                          {f === "iiø/X V/X X" && <span className="ml-1 text-[#555] italic">minor X only</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                {/* Shared voicing controls */}
                <VoicingControls
                  regMode={regMode} setRegMode={setRegMode}
                />
                <ExtensionControls
                  extTendency={extTendency} setExtTendency={setExtTendency}
                  checkedExts={checkedExts} setCheckedExts={setCheckedExts}
                  checkedExtCounts={checkedExtCounts} setCheckedExtCounts={setCheckedExtCounts} toggleSet={toggleSet}
                />
                <VoicingPatternControls checkedPatterns={checkedPatterns} setCheckedPatterns={setCheckedPatterns} toggleSet={toggleSet} />
              </div>
              <LilPreviewPanel checkedChords={checkedChords} chordMap={chordMap} edo={edo} tonicPc={tonicPc} lowestOct={lowestOct} highestOct={highestOct} getCompatibleTypes={getCompatibleTypes} applyChordType={applyChordType} />
            </div>
            {/* Right: chord types */}
            <ChordTypeControls edo={edo} checkedChordTypes={checkedChordTypes} setCheckedChordTypes={setCheckedChordTypes} chordTypeMode={chordTypeMode} setChordTypeMode={setChordTypeMode} toggleSet={toggleSet} />
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap items-center">
            <button onClick={play}
              className="bg-[#7173e6] hover:bg-[#5a5cc8] text-white px-5 py-2 rounded text-sm font-medium transition-colors">
              ▶ Play Progression
            </button>
            {hasPlayed && (
              <>
                <button onClick={replay}
                  className="bg-[#1e1e1e] hover:bg-[#2a2a2a] border border-[#333] text-[#aaa] px-4 py-2 rounded text-sm transition-colors">
                  Replay
                </button>
                <button onClick={revoice}
                  className="bg-[#1e1e1e] hover:bg-[#2a2a2a] border border-[#333] text-[#aaa] px-4 py-2 rounded text-sm transition-colors"
                  title="Same chords, different voicing">
                  Re-voice
                </button>
              </>
            )}
            {hasPendingInfo && !showTarget && !infoText && (
              <button onClick={handleShowInfo}
                className="bg-[#1e1e1e] hover:bg-[#2a2a2a] border border-[#444] text-[#9999ee] px-4 py-2 rounded text-sm transition-colors">
                Show Answer
              </button>
            )}
          </div>

          {showTarget && (
            <div className="bg-[#1a2a1a] border border-[#3a5a3a] rounded p-3 text-xs text-[#8fc88f] font-mono whitespace-pre">{showTarget}</div>
          )}
          {infoText && !showTarget && (
            <div className="bg-[#141414] border border-[#2a2a2a] rounded p-3 text-xs text-[#888] font-mono whitespace-pre">{infoText}</div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* FUNCTIONAL HARMONY section                                     */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {section === "functional" && (
        <>
          <div className="bg-[#141008] border border-[#2a2210] rounded-lg px-4 py-3 space-y-3">
            <p className="text-xs text-[#a08840] leading-relaxed">
              Automatically builds looping progressions from your selected chords using functional harmony rules.
              The engine finds chord movements that make musical sense and loops them continuously.
            </p>

            {/* Controls row */}
            <div className="flex gap-4 flex-wrap items-end">
              <div>
                <p className="text-[10px] text-[#886622] mb-1 font-medium">LOOP LENGTH</p>
                <div className="flex gap-1">
                  {LOOP_LENGTHS.map(n => (
                    <button key={n} onClick={() => setLoopLength(n)}
                      style={{
                        width: 28, height: 28, borderRadius: 4, fontSize: 11, fontWeight: 700,
                        border: `1.5px solid ${loopLength === n ? "#e0a040" : "#1a1a1a"}`,
                        background: loopLength === n ? "#e0a04018" : "#0e0e0e",
                        color: loopLength === n ? "#e0a040" : "#444",
                        cursor: "pointer",
                      }}
                    >{n}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-[#886622] mb-1 font-medium">SPACING (s)</p>
                <input type="number" min={0.5} max={10} step={0.5} value={loopGap}
                  onChange={e => setLoopGap(Math.max(0.5, Math.min(10, parseFloat(e.target.value) || 0.5)))}
                  className="w-16 bg-[#1e1e1e] border border-[#333] rounded px-2 py-1.5 text-xs text-white text-center focus:outline-none"
                />
              </div>
              <div>
                <p className="text-[10px] text-[#886622] mb-1 font-medium">DURATION (s)</p>
                <input type="number" min={0.1} max={8} step={0.1} value={chordDur}
                  onChange={e => setChordDur(Math.max(0.1, Math.min(8, parseFloat(e.target.value) || 0.5)))}
                  className="w-16 bg-[#1e1e1e] border border-[#333] rounded px-2 py-1.5 text-xs text-white text-center focus:outline-none"
                />
              </div>

              {/* Voicing controls inline */}
              <VoicingControls
                regMode={regMode} setRegMode={setRegMode}
                compact
              />
            </div>

            {/* ── Texture Layers ── */}
            <div className="flex gap-4 flex-wrap items-end">
              <div>
                <p className="text-[10px] text-[#886622] mb-1 font-medium">TEXTURE LAYERS</p>
                <div className="flex gap-3">
                  {([
                    { layer: "harmony" as const, vol: harmonyVol, setVol: setHarmonyVol },
                    { layer: "bass" as const, vol: bassVol, setVol: setBassVol },
                    { layer: "melody" as const, vol: melodyVol, setVol: setMelodyVol },
                  ]).map(({ layer, vol, setVol }) => {
                    const checked = textureLayers.has(layer);
                    return (
                      <div key={layer} className="flex flex-col items-center gap-0.5">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input type="checkbox" checked={checked}
                            onChange={() => setTextureLayers(toggleSet(textureLayers, layer))}
                            className="accent-[#e0a040]" />
                          <span className="text-xs" style={{ color: checked ? "#e0a040" : "#555" }}>
                            {layer.charAt(0).toUpperCase() + layer.slice(1)}
                          </span>
                        </label>
                        {checked && (
                          <input type="range" min={0} max={1} step={0.05} value={vol}
                            onChange={e => setVol(parseFloat(e.target.value))}
                            title={`${layer} vol: ${Math.round(vol * 100)}%`}
                            style={{ width: 60, accentColor: "#e0a040" }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              {textureLayers.has("bass") && (
                <div>
                  <p className="text-[10px] text-[#886622] mb-1 font-medium">BASS MODE</p>
                  <div className="flex gap-1">
                    {(["root", "root-fifth", "passing", "walking"] as const).map(m => {
                      const active = bassLineMode === m;
                      return (
                        <button key={m} onClick={() => setBassLineMode(m)}
                          style={{
                            padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                            border: `1.5px solid ${active ? "#e0a040" : "#1a1a1a"}`,
                            background: active ? "#e0a04018" : "#0e0e0e",
                            color: active ? "#e0a040" : "#444",
                            cursor: "pointer",
                          }}
                        >{m}</button>
                      );
                    })}
                  </div>
                </div>
              )}
              {textureLayers.has("melody") && (
                <div>
                  <p className="text-[10px] text-[#886622] mb-1 font-medium">MELODY MODE</p>
                  <div className="flex gap-1">
                    {(["chord-tone", "scalar", "arpeggiate"] as const).map(m => {
                      const active = melodyMode === m;
                      return (
                        <button key={m} onClick={() => setMelodyMode(m)}
                          style={{
                            padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                            border: `1.5px solid ${active ? "#e0a040" : "#1a1a1a"}`,
                            background: active ? "#e0a04018" : "#0e0e0e",
                            color: active ? "#e0a040" : "#444",
                            cursor: "pointer",
                          }}
                        >{m}</button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Arpeggio + Passing Tones */}
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={arpEnabled}
                    onChange={() => setArpEnabled(!arpEnabled)}
                    className="accent-[#e0a040]" />
                  <span className="text-xs" style={{ color: arpEnabled ? "#e0a040" : "#555" }}>
                    Arpeggiate
                  </span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={passingTones}
                    onChange={() => setPassingTones(!passingTones)}
                    className="accent-[#e0a040]" />
                  <span className="text-xs" style={{ color: passingTones ? "#e0a040" : "#555" }}>
                    Passing Tones
                  </span>
                </label>
              </div>
              {arpEnabled && (
                <div>
                  <p className="text-[10px] text-[#886622] mb-1 font-medium">BPM</p>
                  <input type="number" min={40} max={240} step={5} value={arpBpm}
                    onChange={e => setArpBpm(Math.max(40, Math.min(240, parseInt(e.target.value) || 100)))}
                    className="w-16 bg-[#1e1e1e] border border-[#333] rounded px-2 py-1.5 text-xs text-white text-center focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Play / Stop / Replay / Show Answer */}
            <div className="flex gap-2 flex-wrap items-center">
              <button onClick={startFunctionalLoop} disabled={isLooping}
                className="bg-[#e0a040] hover:bg-[#c89030] disabled:opacity-50 text-black px-5 py-2 rounded text-sm font-bold transition-colors">
                Play
              </button>
              {isLooping && (
                <button onClick={stopLoop}
                  className="bg-[#3a1a1a] hover:bg-[#4a2020] border border-[#6a3a3a] text-[#e06060] px-4 py-2 rounded text-sm font-bold transition-colors">
                  Stop
                </button>
              )}
              {fhFramesRef.current && fhFramesRef.current.length > 0 && !isLooping && (
                <button onClick={replayFunctionalLoop}
                  className="bg-[#1e1e1e] hover:bg-[#2a2a2a] border border-[#333] text-[#aaa] px-4 py-2 rounded text-sm transition-colors">
                  Replay
                </button>
              )}
              {fhDetailInfo && (
                <button onClick={showFhAnswer} disabled={isLooping}
                  className="bg-[#1e1e1e] hover:bg-[#2a2a2a] disabled:opacity-50 border border-[#444] text-[#e0a040] px-4 py-2 rounded text-sm transition-colors">
                  {fhShowAnswer ? "Replay Answer" : "Show Answer"}
                </button>
              )}
            </div>

            {/* Answer — only visible after clicking Show Answer */}
            {fhShowAnswer && fhDetailInfo && (
              <div className="bg-[#1a1a0a] border border-[#3a3a1a] rounded p-3 text-xs text-[#c8a850] font-mono whitespace-pre">{fhDetailInfo}</div>
            )}
          </div>

          {/* Voicing types + extensions (shared controls) */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <ExtensionControls
              extTendency={extTendency} setExtTendency={setExtTendency}
              checkedExts={checkedExts} setCheckedExts={setCheckedExts}
              checkedExtCounts={checkedExtCounts} setCheckedExtCounts={setCheckedExtCounts} toggleSet={toggleSet}
            />
            <VoicingPatternControls checkedPatterns={checkedPatterns} setCheckedPatterns={setCheckedPatterns} toggleSet={toggleSet} />
            <ChordTypeControls edo={edo} checkedChordTypes={checkedChordTypes} setCheckedChordTypes={setCheckedChordTypes} chordTypeMode={chordTypeMode} setChordTypeMode={setChordTypeMode} toggleSet={toggleSet} />
          </div>

          <LilPreviewPanel checkedChords={checkedChords} chordMap={chordMap} edo={edo} tonicPc={tonicPc} lowestOct={lowestOct} highestOct={highestOct} getCompatibleTypes={getCompatibleTypes} applyChordType={applyChordType} />
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* CHORD SELECTION (shared between both sections)                 */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <ChordSelectionPanel
        activeBank={activeBank}
        checkedChords={checkedChords} setCheckedChords={setCheckedChords}
        collapsedLevels={collapsedLevels} toggleLevel={toggleLevel}
        selectLevel={selectLevel} deselectLevel={deselectLevel}
        toggleSet={toggleSet}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Extracted sub-components for shared controls
// ══════════════════════════════════════════════════════════════════════

function VoicingControls({ regMode, setRegMode, compact }: {
  regMode: string; setRegMode: (v: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "flex gap-3 flex-wrap items-end" : "space-y-3"}>
      <div>
        <label className="text-xs text-[#888] block mb-1">Register</label>
        <select value={regMode} onChange={e => setRegMode(e.target.value)}
          className="w-full bg-[#1e1e1e] border border-[#333] rounded px-2 py-1.5 text-xs text-white focus:outline-none">
          {REGISTER_MODES.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>
    </div>
  );
}

const EXT_COUNTS = [0, 1, 2, 3, 4];

function ExtensionControls({ extTendency, setExtTendency, checkedExts, setCheckedExts, checkedExtCounts, setCheckedExtCounts, toggleSet }: {
  extTendency: string; setExtTendency: (v: string) => void;
  checkedExts: Set<string>; setCheckedExts: (s: Set<string>) => void;
  checkedExtCounts: Set<number>; setCheckedExtCounts: (s: Set<number>) => void;
  toggleSet: <T>(s: Set<T>, v: T) => Set<T>;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-[#888] mb-1.5">EXT TENDENCY</p>
        <div className="flex gap-3">
          {["Any","Stable","Avoid"].map(v => (
            <label key={v} className="flex items-center gap-1 text-xs cursor-pointer text-[#aaa]">
              <input type="radio" name="extTend" checked={extTendency===v}
                onChange={() => setExtTendency(v)} className="accent-[#7173e6]" />
              {v}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-[#888] mb-1.5">EXTENSIONS</p>
        <div className="grid grid-cols-2 gap-1">
          {EXTENSION_LABELS.map(lbl => (
            <label key={lbl} className="flex items-center gap-1.5 text-xs cursor-pointer text-[#aaa] hover:text-white">
              <input type="checkbox" checked={checkedExts.has(lbl)}
                onChange={() => setCheckedExts(toggleSet(checkedExts, lbl))}
                className="accent-[#7173e6]" />
              {lbl}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-[#888] mb-1.5"># EXTENSIONS</p>
        <div className="flex gap-1.5 flex-wrap">
          {EXT_COUNTS.map(n => (
            <label key={n} className="flex items-center gap-1 text-xs cursor-pointer text-[#aaa]">
              <input type="checkbox" checked={checkedExtCounts.has(n)}
                onChange={() => setCheckedExtCounts(toggleSet(checkedExtCounts, n))}
                className="accent-[#7173e6]" />
              {n}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function VoicingPatternControls({ checkedPatterns, setCheckedPatterns, toggleSet }: {
  checkedPatterns: Set<string>; setCheckedPatterns: (s: Set<string>) => void;
  toggleSet: <T>(s: Set<T>, v: T) => Set<T>;
}) {
  const [activeTab, setActiveTab] = useState(VOICING_PATTERN_GROUPS[0]);

  const selectGroup = (g: string) => {
    const ids = ALL_VOICING_PATTERNS.filter(p => p.group === g).map(p => p.id);
    const n = new Set(checkedPatterns); ids.forEach(id => n.add(id)); setCheckedPatterns(n);
  };
  const deselectGroup = (g: string) => {
    const ids = new Set(ALL_VOICING_PATTERNS.filter(p => p.group === g).map(p => p.id));
    const n = new Set(checkedPatterns); ids.forEach(id => n.delete(id)); setCheckedPatterns(n);
  };

  const patterns = ALL_VOICING_PATTERNS.filter(p => p.group === activeTab);
  const totalChecked = ALL_VOICING_PATTERNS.filter(p => checkedPatterns.has(p.id)).length;

  return (
    <div>
      <p className="text-xs text-[#888] mb-1.5 font-medium">VOICINGS <span className="text-[#555] font-normal">({totalChecked} selected)</span></p>
      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-2">
        {VOICING_PATTERN_GROUPS.map(g => {
          const count = ALL_VOICING_PATTERNS.filter(p => p.group === g && checkedPatterns.has(p.id)).length;
          const isActive = activeTab === g;
          return (
            <button key={g} onClick={() => setActiveTab(g)}
              style={{
                padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                border: `1px solid ${isActive ? "#7173e6" : count > 0 ? "#333" : "#1a1a1a"}`,
                background: isActive ? "#7173e618" : count > 0 ? "#161622" : "#0e0e0e",
                color: isActive ? "#9999ee" : count > 0 ? "#888" : "#444",
                cursor: "pointer", transition: "all 0.12s",
              }}>
              {g}{count > 0 && <span style={{ marginLeft: 3, color: "#7173e6", fontSize: 9 }}>{count}</span>}
            </button>
          );
        })}
      </div>
      {/* Active panel */}
      <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded p-2">
        <div className="flex items-center gap-2 mb-1.5">
          <button onClick={() => selectGroup(activeTab)}
            className="text-[9px] text-[#555] hover:text-[#9999ee] border border-[#222] rounded px-2 py-0.5">All</button>
          <button onClick={() => deselectGroup(activeTab)}
            className="text-[9px] text-[#555] hover:text-[#e06060] border border-[#222] rounded px-2 py-0.5">None</button>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {patterns.map(p => (
            <label key={p.id} className="flex items-center gap-1.5 text-[11px] cursor-pointer text-[#aaa] hover:text-white">
              <input type="checkbox" checked={checkedPatterns.has(p.id)}
                onChange={() => setCheckedPatterns(toggleSet(checkedPatterns, p.id))}
                className="accent-[#7173e6]" style={{ width: 11, height: 11 }} />
              <span className="font-mono">{p.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChordTypeControls({ edo, checkedChordTypes, setCheckedChordTypes, chordTypeMode, setChordTypeMode, toggleSet }: {
  edo: number;
  checkedChordTypes: Set<string>; setCheckedChordTypes: (s: Set<string>) => void;
  chordTypeMode: ChordTypeMode; setChordTypeMode: (v: ChordTypeMode) => void;
  toggleSet: <T>(s: Set<T>, v: T) => Set<T>;
}) {
  const allTypes = useMemo(() => getEdoChordTypes(edo), [edo]);
  const triads = allTypes.filter(t => t.category === "triad");
  const sevenths = allTypes.filter(t => t.category === "seventh");

  const selectAll = (cat: EdoChordType[]) => {
    const next = new Set(checkedChordTypes);
    cat.forEach(t => next.add(t.id));
    setCheckedChordTypes(next);
  };
  const deselectAll = (cat: EdoChordType[]) => {
    const next = new Set(checkedChordTypes);
    cat.forEach(t => next.delete(t.id));
    setCheckedChordTypes(next);
  };

  return (
    <div className="space-y-2">
      {/* Chord-type progression tier */}
      <div>
        <p className="text-xs text-[#888] mb-1 font-medium">CHORD TYPES</p>
        <div className="flex gap-x-3 gap-y-1 flex-wrap">
          {CHORD_TYPE_MODES.map(m => (
            <label key={m} className="flex items-center gap-1 text-[10px] cursor-pointer text-[#aaa]">
              <input type="radio" name="chordTypeMode" checked={chordTypeMode === m}
                onChange={() => setChordTypeMode(m)} className="accent-[#7173e6]" />
              {CHORD_TYPE_MODE_LABELS[m]}
            </label>
          ))}
        </div>
        <p className="text-[9px] text-[#444] mt-0.5">
          {CHORD_TYPE_MODE_HINTS[chordTypeMode]}
        </p>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs text-[#888] font-medium">TRIADS</p>
          <button onClick={() => selectAll(triads)} className="text-[9px] text-[#555] hover:text-[#888]">all</button>
          <button onClick={() => deselectAll(triads)} className="text-[9px] text-[#555] hover:text-[#888]">none</button>
        </div>
        <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
          {triads.map(t => (
            <label key={t.id} className="flex items-center gap-1.5 text-xs cursor-pointer text-[#aaa] hover:text-white">
              <input type="checkbox" checked={checkedChordTypes.has(t.id)}
                onChange={() => setCheckedChordTypes(toggleSet(checkedChordTypes, t.id))}
                className="accent-[#7173e6]" />
              <span title={t.name}>{t.abbr}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs text-[#888] font-medium">7TH CHORDS</p>
          <button onClick={() => selectAll(sevenths)} className="text-[9px] text-[#555] hover:text-[#888]">all</button>
          <button onClick={() => deselectAll(sevenths)} className="text-[9px] text-[#555] hover:text-[#888]">none</button>
        </div>
        <div className="flex flex-col gap-0.5 max-h-52 overflow-y-auto">
          {sevenths.map(t => (
            <label key={t.id} className="flex items-center gap-1.5 text-xs cursor-pointer text-[#aaa] hover:text-white">
              <input type="checkbox" checked={checkedChordTypes.has(t.id)}
                onChange={() => setCheckedChordTypes(toggleSet(checkedChordTypes, t.id))}
                className="accent-[#7173e6]" />
              <span title={t.name}>{t.abbr}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function LilPreviewPanel({ checkedChords, chordMap, edo, tonicPc, lowestOct, highestOct, getCompatibleTypes, applyChordType }: {
  checkedChords: Set<string>; chordMap: Record<string, number[]>;
  edo: number; tonicPc: number; lowestOct: number; highestOct: number;
  getCompatibleTypes: (shape: number[]) => EdoChordType[];
  applyChordType: (shape: number[], type: EdoChordType) => number[];
}) {
  const [expanded, setExpanded] = useState(true);

  const results = useMemo(() => {
    const checkedRomans = Array.from(checkedChords).filter(r => chordMap[r]);
    const out: { rn: string; ok: boolean; warnings: LilWarning[] }[] = [];

    // Check at both the mid-octave (normal placement) and lowest octave (worst case)
    const midOct = Math.floor((lowestOct + highestOct) / 2);
    const octaves = [midOct, lowestOct];

    for (const rn of checkedRomans) {
      const baseShape = chordMap[rn];
      if (!baseShape) continue;

      // Get all chord types that could be applied to this numeral
      const compatTypes = getCompatibleTypes(baseShape);
      const shapesToCheck = compatTypes.length > 0
        ? compatTypes.map(t => applyChordType(baseShape, t))
        : [baseShape];

      let worst: LilWarning[] = [];
      for (const shape of shapesToCheck) {
        const rootStep = shape[0];
        for (const oct of octaves) {
          const rootAbs = tonicPc + (oct - 4) * edo + rootStep;
          const chordAbs = shape.map(s => rootAbs + (s - rootStep)).sort((a, b) => a - b);
          const w = checkLowIntervalLimits(chordAbs, edo);
          if (w.length > worst.length) worst = w;
        }
      }
      out.push({ rn, ok: worst.length === 0, warnings: worst });
    }
    return out;
  }, [checkedChords, chordMap, edo, tonicPc, lowestOct, highestOct, getCompatibleTypes, applyChordType]);

  const problemCount = results.filter(r => !r.ok).length;

  return (
    <div className="flex flex-col h-full">
      <button onClick={() => setExpanded(!expanded)}
        style={{
          padding: "4px 10px", borderRadius: 4, fontSize: 10, fontWeight: 700,
          border: `1.5px solid ${problemCount > 0 ? "#e06060" : "#2a3a2a"}`,
          background: problemCount > 0 ? "#e0606018" : "#0e1a0e",
          color: problemCount > 0 ? "#e06060" : "#5a8a5a",
          cursor: "pointer", transition: "all 0.15s",
          letterSpacing: 0.5,
        }}>
        ⚠ LIL {problemCount > 0 ? `(${problemCount} at risk)` : "(all clear)"}
        <span style={{ marginLeft: 4, fontSize: 8, color: "#555" }}>{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div className="mt-2 bg-[#0e0e0e] border border-[#1a1a1a] rounded p-2 space-y-0.5 flex-1"
          style={{ overflowY: "auto" }}>
          {results.map(({ rn, ok, warnings }) => (
            <div key={rn} className="flex items-start gap-2 text-[11px] font-mono"
              style={{ color: ok ? "#4a6a4a" : "#e06060", padding: "1px 0" }}>
              <span style={{ minWidth: 48, fontWeight: 600 }}>{formatRomanNumeral(rn)}</span>
              {ok
                ? <span style={{ color: "#3a5a3a" }}>OK</span>
                : <span>{warnings.map(w => {
                    const gapName = intervalLabel(w.gapSteps, edo);
                    const minName = intervalLabel(w.minSteps, edo);
                    return `${gapName} in ${w.region} (need ≥ ${minName})`;
                  }).join("; ")}</span>
              }
            </div>
          ))}
          {results.length === 0 && (
            <p className="text-[10px] text-[#444]">No chords selected.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ChordSelectionPanel({ activeBank, checkedChords, setCheckedChords, collapsedLevels, toggleLevel, selectLevel, deselectLevel, toggleSet }: {
  activeBank: TonalityBank | null;
  checkedChords: Set<string>; setCheckedChords: (s: Set<string>) => void;
  collapsedLevels: Set<string>;
  toggleLevel: (name: string) => void;
  selectLevel: (chords: ChordEntry[]) => void;
  deselectLevel: (chords: ChordEntry[]) => void;
  toggleSet: <T>(s: Set<T>, v: T) => Set<T>;
}) {
  return (
    <div>
      {activeBank && (
        <div className="space-y-2">
          {activeBank.levels.map(level => {
            const isCollapsed = collapsedLevels.has(level.name);
            const allChecked = level.chords.every(c => checkedChords.has(c.label));
            const someChecked = level.chords.some(c => checkedChords.has(c.label));
            return (
              <div key={level.name} className="border border-[#1a1a1a] rounded overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0e0e0e] cursor-pointer select-none"
                  onClick={() => toggleLevel(level.name)}>
                  <span className="text-[10px] text-[#555] w-3">{isCollapsed ? "▸" : "▾"}</span>
                  <span className="text-xs text-[#888] font-medium flex-1">{level.name}</span>
                  <span className="text-[10px] text-[#444]">{level.chords.filter(c => checkedChords.has(c.label)).length}/{level.chords.length}</span>
                  <button onClick={e => { e.stopPropagation(); allChecked ? deselectLevel(level.chords) : selectLevel(level.chords); }}
                    className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                      allChecked ? "border-[#7173e6] text-[#7173e6]"
                        : someChecked ? "border-[#444] text-[#888]"
                        : "border-[#222] text-[#555]"
                    }`}>
                    {allChecked ? "Clear" : "All"}
                  </button>
                </div>
                {!isCollapsed && (
                  <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-1 p-2">
                    {level.chords.map(entry => (
                      <label key={entry.label} className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                        checkedChords.has(entry.label) ? "bg-[#1a1a2a] text-[#9999ee]" : "bg-[#141414] text-[#666] hover:bg-[#1e1e1e]"
                      }`}>
                        <input type="checkbox" checked={checkedChords.has(entry.label)}
                          onChange={() => setCheckedChords(toggleSet(checkedChords, entry.label))}
                          className="accent-[#7173e6]" />
                        {formatRomanNumeral(entry.label)}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
