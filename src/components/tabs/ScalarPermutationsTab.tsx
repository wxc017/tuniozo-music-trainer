import { useState, useRef, useCallback, useEffect } from "react";
import { audioEngine } from "@/lib/audioEngine";
import {
  MELODY_BANK_31,
  JAZZ_FAMILIES, JAZZ_FAMILY_DESCRIPTIONS, JAZZ_VARIANTS,
  generateJazzCell, getDiatonicTriadsForMode,
  jazzPhraseToStepsEdo, randomChoice, fitLineIntoWindow, strictWindowBounds,
  PATTERN_SCALE_FAMILIES, getModeDegreeMap,
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
type FamilyEntry = {
  name: string;        // underlying engine key (passed to musicTheory.ts)
  displayName: string; // what the UI shows — strips "Bergonzi " prefix
  kind: FamilyKind;
  description: string;
  generative: boolean;
};

// Bergonzi prefix dropped from display per direct user direction
// (2026-05-12) "remove and bergonzi references just have the main ideas".
// The engine keys stay verbatim so generateJazzCell still dispatches.
function displayNameFor(family: string): string {
  return family.startsWith("Bergonzi ") ? family.slice("Bergonzi ".length) : family;
}

// Unified family list, ordered melody (Cadences first) → jazz so the
// cadential exercise sits at the top and the longer intervallic
// material follows.
const FAMILIES: FamilyEntry[] = [
  ...KEPT_MELODY_FAMILIES.map<FamilyEntry>(name => ({
    name,
    displayName: name,
    kind: "melody",
    description: MELODY_DESCRIPTIONS[name] ?? "",
    generative: MELODY_GENERATIVE_FAMILIES.has(name),
  })),
  ...JAZZ_FAMILIES.map<FamilyEntry>(name => ({
    name,
    displayName: displayNameFor(name),
    kind: "jazz",
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
  // Per-jazz-family variant filter (matches the prior JazzTab UI).
  const [jazzVariants, setJazzVariants] = useLS<Record<string, string[]>>("lt_perm_jazz_variants", {});

  const [showTarget, setShowTarget] = useState<string | null>(null);
  const [infoText, setInfoText] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const pendingInfo = useRef<{ text: string; isTarget: boolean } | null>(null);
  const [hasPendingInfo, setHasPendingInfo] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [contourNotes, setContourNotes] = useState<number[] | null>(null);
  const [contourDegrees, setContourDegrees] = useState<string[] | null>(null);
  const [contourVisible, setContourVisible] = useState(false);
  const [lastVariantText, setLastVariantText] = useState<string>("");

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
  // Bergonzi families re-label their triad-pair variants based on the
  // active mode (e.g. "1+2" → "I+ii" in Ionian) — preserved from JazzTab.
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

  type Built = { frames: number[][]; degrees: string[]; absNotes: number[]; optKey: string; label: string; variantText?: string };

  function buildMelody(family: string): Built | null {
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
    return {
      frames: absNotes.map(n => [n]),
      degrees: phrase.degrees,
      absNotes,
      optKey: `perm:jazz:${family}`,
      label: `Jazz: ${displayNameFor(family)}`,
      // Variant strings from musicTheory.ts may also embed "Bergonzi"
      // (e.g. pentatonic descriptions); strip them in the display layer
      // so the user never sees the prefix.
      variantText: phrase.variant.replace(/Bergonzi[^\s]*\s*/g, ""),
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

      <ModeScalePicker scaleFam={scaleFam} modeName={modeName}
        onChange={(fam, mode) => { setScaleFam(fam); setModeName(mode); }} />

      {/* Family rows sit immediately under the mode picker so Play is
          at the bottom of the tab — per direct user direction
          (2026-05-12) "put it below modes so play is at the bottom". */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => setChecked(new Set(FAMILY_NAMES))} className="text-[9px] text-[#555] hover:text-[#9999ee] border border-[#222] rounded px-2 py-0.5">All</button>
          <button onClick={() => setChecked(new Set())} className="text-[9px] text-[#555] hover:text-[#9999ee] border border-[#222] rounded px-2 py-0.5">None</button>
        </div>
        <div className="space-y-2">
          {FAMILIES.map(f => {
            const on = checked.has(f.name);
            const variants = f.kind === "jazz" ? (JAZZ_VARIANTS[f.name] ?? []) : [];
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
                      const vOn = isJazzVariantOn(f.name, v.id);
                      return (
                        <button key={v.id} onClick={() => toggleJazzVariant(f.name, v.id)}
                          className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                            vOn
                              ? "bg-[#7173e6]/20 border-[#7173e6] text-[#bbbbee]"
                              : "bg-[#0e0e0e] border-[#2a2a2a] text-[#555] hover:text-[#999]"
                          }`}>
                          {jazzVariantLabel(f.name, v.id, v.label)}
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

      {(showTarget || infoText) && contourDegrees && (() => {
        // Variant strings from musicTheory.ts encode the family-specific
        // sub-structure of each phrase.  Examples:
        //   triad pair:  "ascending triad pair ii+iii: 2-4-6 / 3-5-7"
        //   arpeggio:    "ascending arpeggio (1-3-5-7-9)"
        //   enclosure:   "enclosure → 3 (4 above, 2 below)"
        //   digital:     "digital cell, perm 1234 (sequenced from …)"
        // Rather than family-by-family parsers, we walk the variant text
        // and extract every dash-separated degree run (`1-3-5-7`) as a
        // numbered group, then render the surrounding text + groups.
        // Single bare degrees inside parens (e.g. enclosure target,
        // "above" / "below" tokens) are kept inline as small boxes too.
        const boxColor = showTarget ? "text-[#8fc88f] bg-[#1a2a1a] border-[#3a5a3a]"
                                    : "text-[#9999ee] bg-[#1a1a2a] border-[#333]";
        // Match: dash-separated degree run (2+ tokens) OR single degree-like token.
        // Degree tokens: optional b/#/bb, then digit(s).  Examples: 1, b3, #11, 13.
        const tokenRE = /\b(?:[b#]{0,2}\d{1,2}(?:-[b#]{0,2}\d{1,2})+)\b/g;
        const groups: string[][] = [];
        let prose = lastVariantText;
        if (lastVariantText) {
          const matches = Array.from(lastVariantText.matchAll(tokenRE));
          matches.forEach(m => groups.push(m[0].split("-")));
          // Strip the matched degree-runs from the prose so we don't
          // duplicate them in text form below the boxes.  Also strip
          // any orphaned " / " separators left behind.
          prose = lastVariantText.replace(tokenRE, "").replace(/\s*\/\s*/g, " ").replace(/\s+/g, " ").trim();
          // If prose ends with a stray colon (from "label: a-b-c / d-e-f"
          // pattern), trim it for readability.
          prose = prose.replace(/[:\s]+$/, "").trim();
        }
        // Group label: "Triad N" for the triad-pair case (two groups
        // from "X / Y"), "Degrees" otherwise (single arpeggio pool, etc.)
        const isTriadPair = groups.length === 2 && /triad pair/i.test(lastVariantText);
        const groupLabel = (i: number) =>
          isTriadPair ? `Triad ${i + 1}` :
          groups.length === 1 ? "Tones" :
          `Group ${i + 1}`;
        return (
        <div className={`rounded p-3 border space-y-2 ${
          showTarget ? "bg-[#1a2a1a] border-[#3a5a3a]" : "bg-[#141414] border-[#2a2a2a]"
        }`}>
          {prose && (
            <div className="text-xs text-[#aaa]">
              <span className="text-[#666]">Variant: </span>
              <span className={showTarget ? "text-[#bfdfbf]" : "text-[#bbbbee]"}>{prose}</span>
            </div>
          )}
          {groups.length > 0 && (
            <div className="space-y-1.5">
              {groups.map((g, gi) => (
                <div key={gi} className="flex gap-1 items-center flex-wrap">
                  <span className="text-[#666] text-xs mr-1">{groupLabel(gi)}:</span>
                  {g.map((deg, i) => (
                    <span key={i} className={`px-1.5 py-0.5 rounded text-xs font-mono border ${boxColor}`}>
                      {deg}
                    </span>
                  ))}
                </div>
              ))}
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
        );
      })()}

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
