import { useState, useRef, useCallback, useEffect } from "react";
import { audioEngine } from "@/lib/audioEngine";
import {
  PATTERN_SCALE_FAMILIES, PATTERN_SEQUENCE_FAMILIES,
  buildDynamicPatternLine, getScaleDiatonicSteps, randomChoice,
  FAMILY_TO_STYLES, PATTERN_VARIANTS
} from "@/lib/musicTheory";
import { getDegreeMap } from "@/lib/edoData";
import { useLS, registerKnownOption, unregisterKnownOptionsForPrefix } from "@/lib/storage";
import { weightedRandomChoice } from "@/lib/stats";
import PitchContour, { useContourReplay } from "@/components/PitchContour";
import ModeScalePicker from "@/components/ModeScalePicker";
import type { TabSettingsSnapshot } from "@/App";

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
  tabSettingsRef?: React.MutableRefObject<TabSettingsSnapshot | null>;
  answerButtons?: React.ReactNode;
}

const LENGTH_OPTIONS = ["Any","3","4","5","6","7","8","10","12"];

const GAP = 580;

export default function PatternsTab({
  tonicPc, lowestOct, highestOct, edo, onHighlight, responseMode, onResult, onPlay, lastPlayed, ensureAudio, onShowOnKeyboard, playVol = 0.65, tabSettingsRef, answerButtons,
}: Props) {
  const frameTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const familyNames = Object.keys(PATTERN_SCALE_FAMILIES);
  const [scaleFam, setScaleFam] = useLS<string>("lt_pat_scaleFam", familyNames[0]);
  const [modeName, setModeName] = useLS<string>("lt_pat_modeName", PATTERN_SCALE_FAMILIES[familyNames[0]][0]);
  const [lengthFilter, setLengthFilter] = useLS<string>("lt_pat_length", "Any");
  const [checked, setChecked] = useLS<Set<string>>("lt_pat_checked",
    new Set(["Steps","Thirds","Fourths","Cells"])
  );
  const [variantEnabled, setVariantEnabled] = useLS<Record<string, string[]>>("lt_pat_variants", {});
  const [showTarget, setShowTarget] = useState<string | null>(null);
  const [infoText, setInfoText] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const pendingInfo = useRef<{text: string; isTarget: boolean} | null>(null);
  const [hasPendingInfo, setHasPendingInfo] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [contourNotes, setContourNotes] = useState<number[] | null>(null);
  const [contourDegrees, setContourDegrees] = useState<string[] | null>(null);
  const [contourVisible, setContourVisible] = useState(false);

  const handleFamChange = (fam: string) => {
    setScaleFam(fam);
    setModeName(PATTERN_SCALE_FAMILIES[fam][0]);
  };

  useEffect(() => {
    unregisterKnownOptionsForPrefix("pat:");
    const styles: string[] = [];
    Array.from(checked).forEach(fam => styles.push(...allowedStylesFor(fam)));
    styles.forEach(style => {
      registerKnownOption(`pat:${style}`, `Pattern: ${style}`);
    });
    return () => unregisterKnownOptionsForPrefix("pat:");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, variantEnabled]);

  // Publish settings snapshot for history panel
  useEffect(() => {
    if (!tabSettingsRef) return;
    const modeOpts = PATTERN_SCALE_FAMILIES[scaleFam] ?? [];
    const safe = modeOpts.includes(modeName) ? modeName : (modeOpts[0] ?? "");
    tabSettingsRef.current = {
      title: "Patterns",
      groups: [
        { label: "Families", items: Array.from(checked) },
        { label: "Length", items: [lengthFilter] },
        { label: "Scale", items: [`${scaleFam} · ${safe}`] },
      ],
    };
  }, [checked, lengthFilter, scaleFam, modeName, tabSettingsRef]);

  const toggle = (f: string) => setChecked(prev => {
    const n = new Set(prev); if (n.has(f)) n.delete(f); else n.add(f); return n;
  });

  // Resolve allowed styles for a family, filtered by enabled variants if any.
  const allowedStylesFor = (fam: string): string[] => {
    const all = FAMILY_TO_STYLES[fam] ?? [fam];
    const variants = PATTERN_VARIANTS[fam];
    if (!variants) return all;
    const enabled = variantEnabled[fam];
    if (!enabled || enabled.length === 0) return all;
    const filtered = all.filter(s => enabled.includes(s));
    return filtered.length ? filtered : all;
  };

  const isVariantOn = (family: string, vid: string): boolean => {
    const list = variantEnabled[family];
    if (!list || list.length === 0) return true;
    return list.includes(vid);
  };

  const toggleVariant = (family: string, vid: string) => {
    setVariantEnabled(prev => {
      const all = (PATTERN_VARIANTS[family] ?? []).map(v => v.id);
      const current = prev[family] && prev[family].length > 0 ? prev[family] : all;
      const next = current.includes(vid) ? current.filter(v => v !== vid) : [...current, vid];
      const safe = next.length === 0 ? all : next;
      return { ...prev, [family]: safe };
    });
  };

  const play = async () => {
    if (isPlaying) return;
    await ensureAudio();
    if (!checked.size) { onResult("Select at least one pattern family."); return; }

    const dyn_len = lengthFilter !== "Any" ? parseInt(lengthFilter) : 4 + Math.floor(Math.random() * 4);
    const allStyles: string[] = [];
    Array.from(checked).forEach(fam => allStyles.push(...allowedStylesFor(fam)));
    const pickedStyle = allStyles.length
      ? weightedRandomChoice(allStyles, s => `pat:${s}`)
      : randomChoice(["asc","desc","skip2","arch","cell2"]);
    let result: [number[], string] | null = null;
    for (let i = 0; i < 30; i++) {
      result = buildDynamicPatternLine(edo, tonicPc, lowestOct, highestOct, scaleFam, modeName, dyn_len, Array.from(checked), pickedStyle);
      if (result) break;
    }
    if (!result) { onResult("Could not fit pattern into window. Try wider octave range."); return; }

    const [lineAbs, styleUsed] = result;
    const frames = lineAbs.map(n => [n]);
    const scaleSteps = getScaleDiatonicSteps(scaleFam, modeName, edo);
    // Build a reverse map: step → chromatic degree name for non-diatonic notes
    const degMap = getDegreeMap(edo);
    const stepToDeg: Record<number, string> = {};
    for (const [name, step] of Object.entries(degMap)) {
      if (step <= edo && !stepToDeg[step]) stepToDeg[step] = name;
    }
    const degreeLabels = lineAbs.map(n => {
      const pc = ((n - tonicPc) % edo + edo) % edo;
      const idx = scaleSteps.indexOf(pc);
      if (idx >= 0) return String(idx + 1);
      // Chromatic note — find its degree name
      return stepToDeg[pc] ?? `${pc}`;
    });
    const info = degreeLabels.join(" → ");
    const optKey = `pat:${styleUsed}`;
    setShowTarget(null);
    setInfoText("");
    setHasPendingInfo(false);
    setContourNotes(lineAbs);
    setContourDegrees(degreeLabels);
    setContourVisible(false);
    pendingInfo.current = { text: info, isTarget: responseMode !== "Play Audio" };
    setHasPendingInfo(true);
    onResult(`Pattern: ${styleUsed} | ${scaleFam} / ${modeName}`);
    onPlay(optKey, `Pattern: ${styleUsed}`);
    lastPlayed.current = { frames, info };
    setHasPlayed(true);

    setIsPlaying(true);
    audioEngine.playSequence(frames, edo, GAP, 0.8);
    setTimeout(() => setIsPlaying(false), frames.length * GAP + 500);
  };

  const highlightFrames = useCallback((frames: number[][]) => {
    frameTimers.current.forEach(id => clearTimeout(id));
    frameTimers.current = [];
    frames.forEach((frame, i) => {
      const id = setTimeout(() => {
        onHighlight(frame);
      }, i * GAP);
      frameTimers.current.push(id);
    });
  }, [edo, onHighlight]);

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
      {/* Scale selector */}
      <div>
        <label className="text-xs text-[#888] block mb-1">Length</label>
        <select value={lengthFilter} onChange={e => setLengthFilter(e.target.value)}
          className="bg-[#1e1e1e] border border-[#333] rounded px-2 py-1.5 text-sm text-white focus:outline-none">
          {LENGTH_OPTIONS.map(l => <option key={l}>{l}</option>)}
        </select>
      </div>

      <ModeScalePicker scaleFam={scaleFam} modeName={modeName}
        onChange={(fam, mode) => { setScaleFam(fam); setModeName(mode); }} />

      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={play} disabled={isPlaying}
          className="bg-[#7173e6] hover:bg-[#5a5cc8] disabled:opacity-50 text-white px-5 py-2 rounded text-sm font-medium transition-colors">
          {isPlaying ? "♪ Playing…" : "▶ Random Pattern"}
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

      {(showTarget || infoText) && contourDegrees && (
        <div className={`rounded p-3 border ${
          showTarget
            ? "bg-[#1a2a1a] border-[#3a5a3a]"
            : "bg-[#141414] border-[#2a2a2a]"
        }`}>
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

      <div>
        <div className="flex items-center gap-3 mb-2">
          <p className="text-xs text-[#555]">Pattern Families:</p>
          <button onClick={() => setChecked(new Set(PATTERN_SEQUENCE_FAMILIES))} className="text-[9px] text-[#555] hover:text-[#9999ee] border border-[#222] rounded px-2 py-0.5">All</button>
          <button onClick={() => setChecked(new Set())} className="text-[9px] text-[#555] hover:text-[#9999ee] border border-[#222] rounded px-2 py-0.5">None</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PATTERN_SEQUENCE_FAMILIES.map(f => {
            const on = checked.has(f);
            const variants = PATTERN_VARIANTS[f] ?? [];
            return (
              <div key={f} className={`rounded border transition-colors ${
                on ? "bg-[#1a1a2a] border-[#3a3a5a]" : "bg-[#111] border-[#222]"
              }`}>
                <button onClick={() => toggle(f)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    on ? "text-[#9999ee]" : "text-[#666] hover:text-[#aaa]"
                  }`}>
                  {f}
                  <span className="ml-auto text-[10px] px-1 rounded text-[#7aaa7a] border border-[#3a6a3a]">generative</span>
                </button>
                {on && variants.length > 0 && (
                  <div className="flex flex-wrap gap-1 px-3 pb-2">
                    {variants.map(v => {
                      const vOn = isVariantOn(f, v.id);
                      return (
                        <button key={v.id} onClick={() => toggleVariant(f, v.id)}
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
    </div>
  );
}
