import { useState, useRef, useCallback, useEffect } from "react";
import { audioEngine } from "@/lib/audioEngine";
import {
  PATTERN_SCALE_FAMILIES, PATTERN_SEQUENCE_FAMILIES,
  buildDynamicPatternLine, getScaleDiatonicSteps, randomChoice,
  FAMILY_TO_STYLES, PATTERN_VARIANTS,
  MELODY_BANK_31, MELODY_FAMILIES,
  JAZZ_FAMILIES, JAZZ_FAMILY_DESCRIPTIONS, JAZZ_VARIANTS,
  generateJazzCell, getDiatonicTriadsForMode,
  jazzPhraseToStepsEdo, fitLineIntoWindow, strictWindowBounds,
  getModeDegreeMap,
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

// Source = which engine to dispatch Play to.  Each round picks one
// enabled source at random; per-source toggles narrow the pool further.
type Source = "patterns" | "melody" | "jazz" | "scaleDeg";
const SOURCES: Source[] = ["patterns", "melody", "jazz", "scaleDeg"];
const SOURCE_LABEL: Record<Source, string> = {
  patterns: "Pattern Sequences",
  melody:   "Melody Bank",
  jazz:     "Jazz Cells",
  scaleDeg: "Scale Permutations",
};
const SOURCE_COLOR: Record<Source, string> = {
  patterns: "#7173e6",
  melody:   "#8888cc",
  jazz:     "#c89a6c",
  scaleDeg: "#5cca8a",
};

const SCALE_DEG_PATTERNS = ["color-set", "thirds", "fourths", "fifths", "sixths", "shuffle"] as const;
type ScaleDegPattern = typeof SCALE_DEG_PATTERNS[number];
const SCALE_DEG_LABEL: Record<ScaleDegPattern, string> = {
  "color-set": "Color Set",
  "thirds":    "Scale 3rds",
  "fourths":   "Scale 4ths",
  "fifths":    "Scale 5ths",
  "sixths":    "Scale 6ths",
  "shuffle":   "Scale Shuffled",
};

const LENGTH_OPTIONS = ["Any", "3", "4", "5", "6", "7", "8", "10", "12"];
const GAP = 560;

const MELODY_GENERATIVE_FAMILIES = new Set([
  "Cadences", "Pentatonic Hooks", "Neighbor-Tone Cells", "Triadic Shapes",
]);

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

// ── Scale-degree traversal (Mode-ID style: 3rds / 4ths / shuffle…) ────
function buildScaleDegLine(
  scaleFam: string, modeName: string, pattern: ScaleDegPattern,
  tonicPc: number, edo: number, low: number, high: number, maxNotes: number,
): { notes: number[]; degrees: string[] } | null {
  const modeMap = getModeDegreeMap(edo, scaleFam, modeName);
  const scaleDegrees = Object.entries(modeMap).sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const n = scaleDegrees.length;
  if (n === 0) return null;
  const asc = Array.from({ length: n }, (_, i) => i);

  let idxSeq: number[];
  if (pattern === "shuffle" || pattern === "color-set") {
    idxSeq = [...asc].sort(() => Math.random() - 0.5);
  } else {
    const stepSize =
      pattern === "thirds"  ? 2 :
      pattern === "fourths" ? 3 :
      pattern === "fifths"  ? 4 :
      pattern === "sixths"  ? 5 : 1;
    const startIdx = Math.floor(Math.random() * n);
    idxSeq = [];
    const seen = new Set<number>();
    for (let k = 0; k < n; k++) {
      const idx = ((startIdx + k * stepSize) % n + n) % n;
      if (seen.has(idx)) break;
      seen.add(idx);
      idxSeq.push(idx);
    }
    if (Math.random() < 0.5) idxSeq = idxSeq.slice().reverse();
  }
  if (Number.isFinite(maxNotes) && maxNotes > 0) {
    const slots = Math.max(1, Math.floor(maxNotes));
    if (slots < idxSeq.length) idxSeq = idxSeq.slice(0, slots);
  }
  const degrees = idxSeq.map(i => scaleDegrees[i]);
  const notes: number[] = [];
  for (let i = 0; i < degrees.length; i++) {
    const step = modeMap[degrees[i]] ?? 0;
    const base = tonicPc + step;
    if (i === 0) { notes.push(base); continue; }
    const prev = notes[i - 1];
    let best: number | null = null;
    let bestD = Infinity;
    for (let k = -4; k <= 4; k++) {
      const cand = base + k * edo;
      if (cand < low || cand > high) continue;
      const d = Math.abs(cand - prev);
      if (d < bestD) { bestD = d; best = cand; }
    }
    if (best === null) {
      best = base;
      bestD = Math.abs(base - prev);
      for (let k = -4; k <= 4; k++) {
        const cand = base + k * edo, d = Math.abs(cand - prev);
        if (d < bestD) { bestD = d; best = cand; }
      }
    }
    notes.push(best);
  }
  let fitted = notes.slice();
  while (Math.max(...fitted) > high) fitted = fitted.map(v => v - edo);
  while (Math.min(...fitted) < low)  fitted = fitted.map(v => v + edo);
  if (Math.max(...fitted) > high || Math.min(...fitted) < low) return null;
  return { notes: fitted, degrees };
}

export default function ScalarPermutationsTab({
  tonicPc, lowestPitch, highestPitch, edo, onHighlight, responseMode, onResult, onPlay, lastPlayed, ensureAudio, tabSettingsRef, answerButtons,
}: Props) {
  const frameTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ── Source selector ────────────────────────────────────────────────
  const [enabledSources, setEnabledSources] = useLS<Set<Source>>(
    "lt_perm_sources", new Set<Source>(["patterns"])
  );

  // ── Shared scale picker ────────────────────────────────────────────
  const famNames = Object.keys(PATTERN_SCALE_FAMILIES);
  const [scaleFam, setScaleFam] = useLS<string>("lt_perm_scaleFam", famNames[0]);
  const [modeName, setModeName] = useLS<string>("lt_perm_mode", PATTERN_SCALE_FAMILIES[famNames[0]][0]);
  const [lengthFilter, setLengthFilter] = useLS<string>("lt_perm_length", "Any");

  // ── Per-source toggles ─────────────────────────────────────────────
  // Pattern-sequence families (existing PatternsTab state shape).
  const [patternChecked, setPatternChecked] = useLS<Set<string>>(
    "lt_perm_pat_checked", new Set(["Steps", "Thirds", "Fourths", "Cells"])
  );
  const [patternVariants, setPatternVariants] = useLS<Record<string, string[]>>("lt_perm_pat_variants", {});

  // Melody-bank families.
  const [melodyChecked, setMelodyChecked] = useLS<Set<string>>(
    "lt_perm_mel_checked",
    new Set(["Cadences", "Pentatonic Hooks", "Neighbor-Tone Cells", "Triadic Shapes", "Folk / Pop Phrases"])
  );

  // Jazz families + variants.
  const [jazzChecked, setJazzChecked] = useLS<Set<string>>(
    "lt_perm_jazz_checked",
    new Set(["Chord Tone Arpeggios", "Enclosures", "Bebop Fragments", "Guide-Tone Lines"])
  );
  const [jazzVariants, setJazzVariants] = useLS<Record<string, string[]>>("lt_perm_jazz_variants", {});

  // Scale-degree traversals (Mode-ID style).
  const [scaleDegChecked, setScaleDegChecked] = useLS<Set<ScaleDegPattern>>(
    "lt_perm_scaleDeg_checked", new Set<ScaleDegPattern>(SCALE_DEG_PATTERNS)
  );

  // Playback state
  const [showTarget, setShowTarget] = useState<string | null>(null);
  const [infoText, setInfoText] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const pendingInfo = useRef<{ text: string; isTarget: boolean } | null>(null);
  const [hasPendingInfo, setHasPendingInfo] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [contourNotes, setContourNotes] = useState<number[] | null>(null);
  const [contourDegrees, setContourDegrees] = useState<string[] | null>(null);
  const [contourVisible, setContourVisible] = useState(false);
  const [lastSourceLabel, setLastSourceLabel] = useState<string>("");
  const [lastVariantText, setLastVariantText] = useState<string>("");

  // ── Known-option registration (stats / weighted picker) ────────────
  useEffect(() => {
    unregisterKnownOptionsForPrefix("perm:");
    if (enabledSources.has("patterns")) {
      const styles: string[] = [];
      Array.from(patternChecked).forEach(fam => {
        const all = FAMILY_TO_STYLES[fam] ?? [fam];
        const enabled = patternVariants[fam];
        const list = !enabled || enabled.length === 0 ? all : all.filter(s => enabled.includes(s));
        styles.push(...(list.length ? list : all));
      });
      styles.forEach(s => registerKnownOption(`perm:pat:${s}`, `Pattern: ${s}`));
    }
    if (enabledSources.has("melody")) {
      MELODY_FAMILIES.filter(f => melodyChecked.has(f)).forEach(f =>
        registerKnownOption(`perm:mel:${f}`, `Melody: ${f}`)
      );
    }
    if (enabledSources.has("jazz")) {
      JAZZ_FAMILIES.filter(f => jazzChecked.has(f)).forEach(f =>
        registerKnownOption(`perm:jazz:${f}`, `Jazz: ${f}`)
      );
    }
    if (enabledSources.has("scaleDeg")) {
      Array.from(scaleDegChecked).forEach(p =>
        registerKnownOption(`perm:scaleDeg:${p}`, `Scale: ${SCALE_DEG_LABEL[p]}`)
      );
    }
    return () => unregisterKnownOptionsForPrefix("perm:");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledSources, patternChecked, patternVariants, melodyChecked, jazzChecked, scaleDegChecked]);

  // ── Settings snapshot for history panel ────────────────────────────
  useEffect(() => {
    if (!tabSettingsRef) return;
    const modeOpts = PATTERN_SCALE_FAMILIES[scaleFam] ?? [];
    const safe = modeOpts.includes(modeName) ? modeName : (modeOpts[0] ?? "");
    const groups = [
      { label: "Sources", items: SOURCES.filter(s => enabledSources.has(s)).map(s => SOURCE_LABEL[s]) },
      { label: "Length", items: [lengthFilter] },
      { label: "Scale", items: [`${scaleFam} · ${safe}`] },
    ];
    if (enabledSources.has("patterns")) groups.push({ label: "Pattern Fams", items: Array.from(patternChecked) });
    if (enabledSources.has("melody"))   groups.push({ label: "Melody Fams",  items: Array.from(melodyChecked) });
    if (enabledSources.has("jazz"))     groups.push({ label: "Jazz Fams",    items: Array.from(jazzChecked) });
    if (enabledSources.has("scaleDeg")) groups.push({ label: "Scale Patts",  items: Array.from(scaleDegChecked).map(p => SCALE_DEG_LABEL[p]) });
    tabSettingsRef.current = { title: "Scalar Permutations", groups };
  }, [enabledSources, lengthFilter, scaleFam, modeName, patternChecked, melodyChecked, jazzChecked, scaleDegChecked, tabSettingsRef]);

  // ── Toggle helpers ─────────────────────────────────────────────────
  const toggleSource = (s: Source) => setEnabledSources(prev => {
    const n = new Set(prev);
    if (n.has(s)) {
      if (n.size > 1) n.delete(s);  // never empty
    } else n.add(s);
    return n;
  });
  const toggleSet = <T extends string>(state: Set<T>, set: (s: Set<T>) => void, item: T) => {
    const n = new Set(state);
    if (n.has(item)) n.delete(item); else n.add(item);
    set(n);
  };
  const isPatVariantOn = (family: string, vid: string): boolean => {
    const list = patternVariants[family];
    if (!list || list.length === 0) return true;
    return list.includes(vid);
  };
  const togglePatVariant = (family: string, vid: string) => {
    setPatternVariants(prev => {
      const all = (PATTERN_VARIANTS[family] ?? []).map(v => v.id);
      const current = prev[family] && prev[family].length > 0 ? prev[family] : all;
      const next = current.includes(vid) ? current.filter(v => v !== vid) : [...current, vid];
      const safe = next.length === 0 ? all : next;
      return { ...prev, [family]: safe };
    });
  };
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
  const allowedStylesFor = (fam: string): string[] => {
    const all = FAMILY_TO_STYLES[fam] ?? [fam];
    const variants = PATTERN_VARIANTS[fam];
    if (!variants) return all;
    const enabled = patternVariants[fam];
    if (!enabled || enabled.length === 0) return all;
    const filtered = all.filter(s => enabled.includes(s));
    return filtered.length ? filtered : all;
  };
  const jazzVariantLabel = (family: string, vid: string, fallback: string): string => {
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

  // ── Active-source enumeration (Play needs to know what's available) ─
  const activeSources = (): Source[] => {
    const out: Source[] = [];
    if (enabledSources.has("patterns") && patternChecked.size > 0) out.push("patterns");
    if (enabledSources.has("melody")   && melodyChecked.size  > 0) out.push("melody");
    if (enabledSources.has("jazz")     && jazzChecked.size    > 0) out.push("jazz");
    if (enabledSources.has("scaleDeg") && scaleDegChecked.size > 0) out.push("scaleDeg");
    return out;
  };

  // ── Engines ────────────────────────────────────────────────────────
  type Built = { frames: number[][]; degrees: string[]; absNotes: number[]; optKey: string; label: string; variantText?: string };
  function buildPattern(): Built | null {
    const dyn_len = lengthFilter !== "Any" ? parseInt(lengthFilter) : 4 + Math.floor(Math.random() * 4);
    const allStyles: string[] = [];
    Array.from(patternChecked).forEach(fam => allStyles.push(...allowedStylesFor(fam)));
    const pickedStyle = allStyles.length
      ? weightedRandomChoice(allStyles, s => `perm:pat:${s}`)
      : randomChoice(["asc", "desc", "skip2", "arch", "cell2"]);
    let result: [number[], string] | null = null;
    for (let i = 0; i < 30; i++) {
      result = buildDynamicPatternLine(edo, tonicPc, lowestPitch, highestPitch, scaleFam, modeName, dyn_len, Array.from(patternChecked), pickedStyle);
      if (result) break;
    }
    if (!result) return null;
    const [lineAbs, styleUsed] = result;
    const scaleSteps = getScaleDiatonicSteps(scaleFam, modeName, edo);
    const degMap = getDegreeMap(edo);
    const stepToDeg: Record<number, string> = {};
    for (const [name, step] of Object.entries(degMap)) {
      if (step <= edo && !stepToDeg[step]) stepToDeg[step] = name;
    }
    const degreeLabels = lineAbs.map(n => {
      const pc = ((n - tonicPc) % edo + edo) % edo;
      const idx = scaleSteps.indexOf(pc);
      if (idx >= 0) return String(idx + 1);
      return stepToDeg[pc] ?? `${pc}`;
    });
    return {
      frames: lineAbs.map(n => [n]),
      degrees: degreeLabels,
      absNotes: lineAbs,
      optKey: `perm:pat:${styleUsed}`,
      label: `Pattern: ${styleUsed} | ${scaleFam} / ${modeName}`,
    };
  }

  function buildMelody(): Built | null {
    const families = MELODY_FAMILIES.filter(f => melodyChecked.has(f));
    if (!families.length) return null;
    const family = weightedRandomChoice(families, f => `perm:mel:${f}`);
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
      optKey: `perm:mel:${family}`,
      label: `Melody: ${family}`,
    };
  }

  function buildJazz(): Built | null {
    const families = JAZZ_FAMILIES.filter(f => jazzChecked.has(f));
    if (!families.length) return null;
    const family = weightedRandomChoice(families, f => `perm:jazz:${f}`);
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
    return {
      frames: absNotes.map(n => [n]),
      degrees: phrase.degrees,
      absNotes,
      optKey: `perm:jazz:${family}`,
      label: `Jazz: ${family}`,
      variantText: phrase.variant,
    };
  }

  function buildScaleDeg(): Built | null {
    const pool = Array.from(scaleDegChecked);
    if (!pool.length) return null;
    const picked = randomChoice(pool);
    const [low, high] = strictWindowBounds(lowestPitch, highestPitch);
    const maxNotes = lengthFilter === "Any" ? Infinity : parseInt(lengthFilter);
    const built = buildScaleDegLine(scaleFam, modeName, picked, tonicPc, edo, low, high, maxNotes);
    if (!built) return null;
    return {
      frames: built.notes.map(n => [n]),
      degrees: built.degrees,
      absNotes: built.notes,
      optKey: `perm:scaleDeg:${picked}`,
      label: `Scale: ${SCALE_DEG_LABEL[picked]} | ${scaleFam} / ${modeName}`,
    };
  }

  // ── Play ───────────────────────────────────────────────────────────
  const play = async () => {
    if (isPlaying) return;
    await ensureAudio();
    const sources = activeSources();
    if (!sources.length) { onResult("Enable at least one source with families selected."); return; }

    const picked = randomChoice(sources);
    let built: Built | null = null;
    if (picked === "patterns") built = buildPattern();
    else if (picked === "melody") built = buildMelody();
    else if (picked === "jazz") built = buildJazz();
    else built = buildScaleDeg();
    if (!built) { onResult("Could not build a phrase in current register. Try widening range or another source."); return; }

    const info = built.degrees.join(" → ");
    setShowTarget(null);
    setInfoText("");
    setHasPendingInfo(false);
    setContourNotes(built.absNotes);
    setContourDegrees(built.degrees);
    setContourVisible(false);
    setLastSourceLabel(SOURCE_LABEL[picked]);
    setLastVariantText(built.variantText ?? "");
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
    if (lastPlayed.current) highlightFrames(lastPlayed.current.frames);
  };

  return (
    <div className="space-y-4">
      {/* ── Source selector (replaces tab buttons) ──────────────────── */}
      <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded p-2 space-y-2">
        <p className="text-xs text-[#888] font-medium">SOURCES</p>
        <div className="flex flex-wrap gap-1">
          {SOURCES.map(s => {
            const on = enabledSources.has(s);
            const color = SOURCE_COLOR[s];
            return (
              <button key={s} onClick={() => toggleSource(s)}
                className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                  on ? "text-white" : "bg-[#111] border-[#2a2a2a] text-[#666] hover:text-[#aaa]"
                }`}
                style={on ? { backgroundColor: color + "30", borderColor: color, color } : {}}>
                {SOURCE_LABEL[s]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Shared controls: length + scale picker ──────────────────── */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-[#888] block mb-1">Length</label>
          <select value={lengthFilter} onChange={e => setLengthFilter(e.target.value)}
            className="bg-[#1e1e1e] border border-[#333] rounded px-2 py-1.5 text-sm text-white focus:outline-none">
            {LENGTH_OPTIONS.map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
      </div>
      <ModeScalePicker scaleFam={scaleFam} modeName={modeName}
        onChange={(fam, mode) => { setScaleFam(fam); setModeName(mode); }} />

      {/* ── Play / Replay / Show Answer ─────────────────────────────── */}
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
        {lastSourceLabel && (
          <span className="text-[10px] text-[#666] ml-1">
            last: <span className="text-[#aaa]">{lastSourceLabel}</span>
          </span>
        )}
        {answerButtons}
      </div>

      {(showTarget || infoText) && contourDegrees && (
        <div className={`rounded p-3 border space-y-2 ${
          showTarget ? "bg-[#1a2a1a] border-[#3a5a3a]" : "bg-[#141414] border-[#2a2a2a]"
        }`}>
          {lastVariantText && (
            <div className="text-xs text-[#aaa]">
              <span className="text-[#666]">Variant: </span>
              <span className={showTarget ? "text-[#bfdfbf]" : "text-[#bbbbee]"}>{lastVariantText}</span>
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

      {/* ── Per-source family/variant panels ─────────────────────────── */}
      {enabledSources.has("patterns") && (
        <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded p-2 space-y-2">
          <div className="flex items-center gap-3">
            <p className="text-xs text-[#888] font-medium">PATTERN FAMILIES</p>
            <button onClick={() => setPatternChecked(new Set(PATTERN_SEQUENCE_FAMILIES))}
              className="text-[9px] text-[#555] hover:text-[#9999ee] border border-[#222] rounded px-2 py-0.5">All</button>
            <button onClick={() => setPatternChecked(new Set())}
              className="text-[9px] text-[#555] hover:text-[#9999ee] border border-[#222] rounded px-2 py-0.5">None</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PATTERN_SEQUENCE_FAMILIES.map(f => {
              const on = patternChecked.has(f);
              const variants = PATTERN_VARIANTS[f] ?? [];
              return (
                <div key={f} className={`rounded border transition-colors ${
                  on ? "bg-[#1a1a2a] border-[#3a3a5a]" : "bg-[#111] border-[#222]"
                }`}>
                  <button onClick={() => toggleSet(patternChecked, setPatternChecked, f)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      on ? "text-[#9999ee]" : "text-[#666] hover:text-[#aaa]"
                    }`}>
                    {f}
                    <span className="ml-auto text-[10px] px-1 rounded text-[#7aaa7a] border border-[#3a6a3a]">generative</span>
                  </button>
                  {on && variants.length > 0 && (
                    <div className="flex flex-wrap gap-1 px-3 pb-2">
                      {variants.map(v => {
                        const vOn = isPatVariantOn(f, v.id);
                        return (
                          <button key={v.id} onClick={() => togglePatVariant(f, v.id)}
                            className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                              vOn
                                ? "bg-[#7173e6]/20 border-[#7173e6] text-[#bbbbee]"
                                : "bg-[#0e0e0e] border-[#2a2a2a] text-[#555] hover:text-[#999]"
                            }`}>
                            {v.label}
                          </button>
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

      {enabledSources.has("melody") && (
        <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded p-2 space-y-2">
          <div className="flex items-center gap-3">
            <p className="text-xs text-[#888] font-medium">MELODY FAMILIES</p>
            <button onClick={() => setMelodyChecked(new Set(MELODY_FAMILIES))}
              className="text-[9px] text-[#555] hover:text-[#9999ee] border border-[#222] rounded px-2 py-0.5">All</button>
            <button onClick={() => setMelodyChecked(new Set())}
              className="text-[9px] text-[#555] hover:text-[#9999ee] border border-[#222] rounded px-2 py-0.5">None</button>
          </div>
          {([
            { key: "gen",   label: "GENERATIVE", color: "#7aaa7a",
              families: MELODY_FAMILIES.filter(f =>  MELODY_GENERATIVE_FAMILIES.has(f)) },
            { key: "fixed", label: "FIXED BANK", color: "#8888cc",
              families: MELODY_FAMILIES.filter(f => !MELODY_GENERATIVE_FAMILIES.has(f)) },
          ] as const).map(group => (
            <div key={group.key}>
              <p className="text-[9px] mb-1 font-medium tracking-wider" style={{ color: group.color }}>{group.label}</p>
              <div className="flex flex-wrap gap-1">
                {group.families.map(f => {
                  const on = melodyChecked.has(f);
                  return (
                    <button key={f} onClick={() => toggleSet(melodyChecked, setMelodyChecked, f)}
                      className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                        on ? "text-white" : "bg-[#111] border-[#2a2a2a] text-[#666] hover:text-[#aaa]"
                      }`}
                      style={on ? { backgroundColor: group.color + "30", borderColor: group.color, color: group.color } : {}}>
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {enabledSources.has("jazz") && (
        <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded p-2 space-y-2">
          <div className="flex items-center gap-3">
            <p className="text-xs text-[#888] font-medium">JAZZ CELL FAMILIES</p>
            <button onClick={() => setJazzChecked(new Set(JAZZ_FAMILIES))}
              className="text-[9px] text-[#555] hover:text-[#9999ee] border border-[#222] rounded px-2 py-0.5">All</button>
            <button onClick={() => setJazzChecked(new Set())}
              className="text-[9px] text-[#555] hover:text-[#9999ee] border border-[#222] rounded px-2 py-0.5">None</button>
          </div>
          <div className="space-y-2">
            {JAZZ_FAMILIES.map(f => {
              const on = jazzChecked.has(f);
              const variants = JAZZ_VARIANTS[f] ?? [];
              return (
                <div key={f} className={`rounded border transition-colors ${
                  on ? "bg-[#1a1a2a] border-[#3a3a5a]" : "bg-[#111] border-[#222]"
                }`}>
                  <button onClick={() => toggleSet(jazzChecked, setJazzChecked, f)}
                    className={`w-full flex items-start gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      on ? "text-[#9999ee]" : "text-[#666] hover:text-[#aaa]"
                    }`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {f}
                        <span className="text-[10px] px-1 rounded text-[#7aaa7a] border border-[#3a6a3a]">generative</span>
                      </div>
                      <p className="text-[10px] text-[#555] mt-0.5 leading-snug">{JAZZ_FAMILY_DESCRIPTIONS[f]}</p>
                    </div>
                  </button>
                  {on && variants.length > 0 && (
                    <div className="flex flex-wrap gap-1 px-3 pb-2">
                      {variants.map(v => {
                        const vOn = isJazzVariantOn(f, v.id);
                        return (
                          <button key={v.id} onClick={() => toggleJazzVariant(f, v.id)}
                            className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                              vOn
                                ? "bg-[#7173e6]/20 border-[#7173e6] text-[#bbbbee]"
                                : "bg-[#0e0e0e] border-[#2a2a2a] text-[#555] hover:text-[#999]"
                            }`}>
                            {jazzVariantLabel(f, v.id, v.label)}
                          </button>
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

      {enabledSources.has("scaleDeg") && (
        <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded p-2 space-y-2">
          <div className="flex items-center gap-3">
            <p className="text-xs text-[#888] font-medium">SCALE TRAVERSALS</p>
            <button onClick={() => setScaleDegChecked(new Set(SCALE_DEG_PATTERNS))}
              className="text-[9px] text-[#555] hover:text-[#9999ee] border border-[#222] rounded px-2 py-0.5">All</button>
            <button onClick={() => setScaleDegChecked(new Set([SCALE_DEG_PATTERNS[0]]))}
              className="text-[9px] text-[#555] hover:text-[#9999ee] border border-[#222] rounded px-2 py-0.5">Min</button>
          </div>
          <div className="flex flex-wrap gap-1">
            {SCALE_DEG_PATTERNS.map(p => {
              const on = scaleDegChecked.has(p);
              const color = p === "color-set" ? "#7173e6" : "#5cca8a";
              return (
                <button key={p}
                  onClick={() => toggleSet(scaleDegChecked, setScaleDegChecked, p)}
                  className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                    on ? "" : "bg-[#111] border-[#2a2a2a] text-[#666] hover:text-[#aaa]"
                  }`}
                  style={on ? { backgroundColor: color + "30", borderColor: color, color } : undefined}>
                  {SCALE_DEG_LABEL[p]}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
