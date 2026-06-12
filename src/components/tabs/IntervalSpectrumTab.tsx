// ── Interval Spectrum (Schulter) ───────────────────────────────────
// Margo Schulter's "Regions of the Interval Spectrum", drawn in order as
// stacked strips.  Type EDOs → dots fall where their steps land; JI ratios
// are marked with name + cents.  Each dot/tick is a toggle-able DRONE
// voice from a built-in oscillator synth — click to ring it, click again
// to stop; stack several to compare how bright/active each interval is.

import { useEffect, useRef, useState } from "react";
import { REGIONS, ratioCents, ratioName, edoIntervalLabel, edoSteps, centsToRatio, type Region } from "@/lib/intervalSpectrum";
import { useDroneSynth, DEFAULT_VOICE_GAIN } from "@/hooks/useDroneSynth";
import { fuzzyCode, solfegeName, sizedNoteLabel } from "@/lib/intervalCodes";
import { notationLabel, solfegeLabel } from "@/lib/notationLabels";
import { useLocalState } from "@/hooks/useLocalState";
import SpectrumTemperament from "@/components/tabs/SpectrumTemperament";
import SpectrumIntervalDatabase from "@/components/tabs/SpectrumIntervalDatabase";
import LumatoneVisualizer from "@/components/tabs/LumatoneVisualizer";

// EDO dot colors — deliberately avoid the JI teal and the custom magenta below
const EDO_COLORS = ["#e0c070", "#5b8dd9", "#9a7ad0", "#cc6a8a", "#6acc7a"];
const RATIO_COLOR = "#4ab0a0";   // JI ratio ticks
const CUSTOM_COLOR = "#ff79c6";  // typed ratios + placed nodes
const REF_C = 261.6256; // C4 — the 0¢ reference the root is measured from
const ROOT_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
// 12-EDO root names with both enharmonic spellings (the chromatic roots read as
// note letters; finer EDOs fall back to the app's per-step interval code).
const ROOT_NAMES_DUAL = ["C", "C♯/D♭", "D", "D♯/E♭", "E", "F", "F♯/G♭", "G", "G♯/A♭", "A", "A♯/B♭", "B"];

function subName(r: Region, c: number): string {
  return r.subs?.find(s => c >= s.lo && c <= s.hi)?.name ?? "";
}

export default function IntervalSpectrumTab({ notationByEdo = {}, solfegeByEdo = {}, onOpenNotation }: {
  notationByEdo?: Record<number, string>;
  solfegeByEdo?: Record<number, string>;
  onOpenNotation?: () => void;
} = {}) {
  const [edoInput, setEdoInput] = useLocalState("is_edos", "12, 31");
  // Root is EDO-precise: stored as cents above C so it can land on ANY step of
  // any EDO (not just the 12 chromatic pitch classes).  900¢ = A (the old default).
  const [rootCents, setRootCents] = useLocalState("is_root_cents", 900);
  // Interval/solfège naming, shared with the Lumatone keyboard so the root
  // selector + readout name the root exactly the way the keys do (in solfège
  // the root reads "A", in intervals it reads "1").
  const [nameMode, setNameMode] = useLocalState<"code" | "solfege" | "notes">("lv_namemode", "code");
  const [fullscreen, setFullscreen] = useState(false);
  const { active, toggle, stopAll, gainByKey, freqByKey, setGain } = useDroneSynth();
  const baseFreq = REF_C * Math.pow(2, rootCents / 1200);

  // Per-voice volume (mirror of the synth's gains so the sliders stay controlled)
  const [vols, setVols] = useState<Record<string, number>>({});
  const [muted, setMuted] = useState<Record<string, number>>({}); // key -> pre-mute gain
  const setVoiceVol = (k: string, v: number) => { setGain(k, v); setVols(p => ({ ...p, [k]: v })); };
  // 1..9 toggle mute on the n-th sounding voice; Ctrl+digit removes it entirely.
  const toggleMute = (k: string) => {
    if (k in muted) {
      setVoiceVol(k, muted[k] || DEFAULT_VOICE_GAIN);
      setMuted(({ [k]: _drop, ...rest }) => rest);
    } else {
      const cur = vols[k] ?? gainByKey.current.get(k) ?? DEFAULT_VOICE_GAIN;
      setMuted(prev => ({ ...prev, [k]: cur || DEFAULT_VOICE_GAIN }));
      setVoiceVol(k, 0);
    }
  };
  const labelForKey = (k: string): string => {
    let m: RegExpExecArray | null;
    if ((m = /^(\d+)-(\d+)$/.exec(k))) return `${m[2]}\\${m[1]}`;
    if ((m = /^custom-(.+)$/.exec(k))) return `${m[1]}¢`;
    if ((m = /^u?ji-\d+-(.+)$/.exec(k))) return m[1];
    return k;
  };

  // Active EDO steps grouped by EDO (only EDO-dot voices, keyed "edo-step") —
  // for the Lumatone visualizer, so each keyboard reflects only its own EDO.
  const activeStepsByEdo: Record<number, number[]> = {};
  for (const k of active) {
    const m = /^(\d+)-(\d+)$/.exec(k);
    if (m) (activeStepsByEdo[+m[1]] ??= []).push(+m[2]);
  }

  const edos = edoInput.split(/[,\s]+/).map(s => parseInt(s, 10))
    .filter(n => Number.isFinite(n) && n >= 2 && n <= 200);
  // The EDO whose steps the Root selector enumerates (first entered, else 12).
  const primaryEdo = edos[0] ?? 12;
  // The root's nearest step in a given EDO (exact when the root was set from it).
  const rootStepIn = (e: number) => (((Math.round((rootCents * e) / 1200)) % e) + e) % e;
  // Name a step of `primaryEdo`: solfège syllables (root = "A"), 12-EDO note
  // letters with both enharmonics, else the app's per-step interval code.
  const rootNameOf = (step: number) => nameMode === "notes"
    ? sizedNoteLabel(primaryEdo, step)
    : nameMode === "solfege"
      ? solfegeLabel(primaryEdo, solfegeByEdo[primaryEdo], step)
      : primaryEdo === 12
        ? ROOT_NAMES_DUAL[step]
        : notationLabel(primaryEdo, notationByEdo[primaryEdo], step);

  const toggleVoice = (key: string, cents: number, gain?: number) => toggle(key, baseFreq * centsToRatio(cents), gain);
  // Toggle the spectrum's own EDO-step voice (shared with the Lumatone keyboard,
  // so a key click lights the matching spectrum node and vice-versa).
  const toggleEdoStep = (e: number, step: number) => toggleVoice(`${e}-${step}`, (step * 1200) / e);

  // Typed ratios → magenta ticks wherever they land
  const [ratioInput, setRatioInput] = useLocalState("is_ratios", "");
  const userRatios = ratioInput.split(/[,\s]+/).map(s => s.trim())
    .filter(s => /^\d+\/\d+$/.test(s)).map(j => ({ j, c: ratioCents(j) }));

  // Click a bar to drop a node anywhere; right-click a placed node to remove it
  const [customCents, setCustomCents] = useState<number[]>([]);
  const placeNode = (cents: number) => {
    const v = Math.round(Math.max(0, Math.min(1200, cents)) * 10) / 10;
    setCustomCents(prev => (prev.includes(v) ? prev : [...prev, v]));
    if (!active.has(`custom-${v}`)) toggleVoice(`custom-${v}`, v);
  };
  const removeNode = (v: number) => {
    if (active.has(`custom-${v}`)) toggleVoice(`custom-${v}`, v);
    setCustomCents(prev => prev.filter(c => c !== v));
  };
  const clearCustom = () => {
    customCents.forEach(v => { if (active.has(`custom-${v}`)) toggleVoice(`custom-${v}`, v); });
    setCustomCents([]);
  };

  // Stop one sounding voice completely (Ctrl+digit / sidebar), cleaning up state.
  const removeVoiceKey = (k: string) => {
    if (active.has(k)) toggle(k, 1);                 // freq unused when stopping
    const cm = /^custom-(.+)$/.exec(k);
    if (cm) setCustomCents(prev => prev.filter(c => String(c) !== cm[1]));
    setVols(({ [k]: _v, ...rest }) => rest);
    setMuted(({ [k]: _m, ...rest }) => rest);
  };
  // Backspace: clear everything — stop all voices, drop placed nodes + state.
  const clearAll = () => { stopAll(); setCustomCents([]); setVols({}); setMuted({}); };

  // Drop volume/mute state for voices that are no longer sounding, so a voice
  // that's stopped and later re-toggled starts fresh at the default level
  // (otherwise a stale 0 / muted entry would make it come back silent).
  useEffect(() => {
    setVols(v => { const n = Object.fromEntries(Object.entries(v).filter(([k]) => active.has(k))); return Object.keys(n).length === Object.keys(v).length ? v : n; });
    setMuted(m => { const n = Object.fromEntries(Object.entries(m).filter(([k]) => active.has(k))); return Object.keys(n).length === Object.keys(m).length ? m : n; });
  }, [active]);

  // Picking a scale in the L popup: replace ALL of this EDO's voices with
  // exactly the scale's notes, started MUTED.  Each new voice starts at an
  // explicit gain 0 (no reliance on gainByKey surviving the same-tick remove/
  // re-add), so nothing rings AND no stray notes from a previous pick stay lit.
  const setScaleVoicesMuted = (e: number, steps: number[]) => {
    [...active].filter(k => k.startsWith(`${e}-`)).forEach(removeVoiceKey);
    steps.forEach(s => {
      const k = `${e}-${s}`;
      toggleVoice(k, (s * 1200) / e, 0);   // start silent
      setMuted(prev => ({ ...prev, [k]: DEFAULT_VOICE_GAIN }));
      setVols(prev => ({ ...prev, [k]: 0 }));
    });
  };

  // Hover tracking so Space can place a node at the cursor (over a bar) or
  // remove the placed node under the cursor.
  const hoverCentsRef = useRef<number | null>(null);
  const hoverNodeRef = useRef<number | null>(null);
  const spaceRef = useRef<() => void>(() => {});
  spaceRef.current = () => {
    if (hoverNodeRef.current != null) removeNode(hoverNodeRef.current);
    else if (hoverCentsRef.current != null) placeNode(hoverCentsRef.current);
  };
  // Sounding voices grouped by pitch (same note across EDOs merges), low→high.
  const voiceGroups = Object.values([...active].reduce((acc, k) => {
    const hz = freqByKey.current.get(k) ?? 0;
    const b = Math.round(hz * 100) / 100;
    (acc[b] ??= { hz, keys: [] as string[] }).keys.push(k);
    return acc;
  }, {} as Record<number, { hz: number; keys: string[] }>)).sort((a, b) => a.hz - b.hz);

  // Live readout: each sounding pitch named from the root in the active system —
  // intervals (root reads "1", a comma above reads "k"/"di") or solfège (root
  // reads "A").  The root is the drone reference, so it follows any root change.
  const chordSym = voiceGroups.map(g => {
    const c = 1200 * Math.log2(g.hz / baseFreq);
    return nameMode === "solfege" ? solfegeName(c) : fuzzyCode(c);
  }).join(" ");

  const setGroupVol = (keys: string[], v: number) => keys.forEach(k => setVoiceVol(k, v));
  const unmuteState = (keys: string[]) => setMuted(prev => { const n = { ...prev }; keys.forEach(k => delete n[k]); return n; });
  const toggleMuteGroup = (keys: string[]) => {
    if (keys[0] in muted) {
      keys.forEach(k => { if (k in muted) setVoiceVol(k, muted[k] || DEFAULT_VOICE_GAIN); });
      unmuteState(keys);
    } else {
      const snap = Object.fromEntries(keys.map(k => [k, (vols[k] ?? gainByKey.current.get(k) ?? DEFAULT_VOICE_GAIN) || DEFAULT_VOICE_GAIN]));
      setMuted(prev => ({ ...prev, ...snap }));
      keys.forEach(k => setVoiceVol(k, 0));
    }
  };
  const removeGroup = (keys: string[]) => keys.forEach(removeVoiceKey);

  // Digit 1..9 acts on the n-th mixer row (a pitch group): plain = mute/unmute,
  // Backspace+digit = remove.  Backspace alone clears everything.
  const numKeyRef = useRef<(n: number, remove: boolean) => void>(() => {});
  numKeyRef.current = (n, remove) => {
    const g = voiceGroups[n - 1];
    if (!g) return;
    if (remove) removeGroup(g.keys); else toggleMuteGroup(g.keys);
  };
  const clearAllRef = useRef<() => void>(() => {});
  clearAllRef.current = clearAll;
  const bsDownRef = useRef(false);   // Backspace currently held
  const bsUsedRef = useRef(false);   // a digit was pressed during this hold

  // Keys: "L" toggles the fullscreen Lumatone (Esc closes); Space places /
  // removes a node at the hovered position.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.key === "l" || e.key === "L") { e.preventDefault(); setFullscreen(f => !f); }
      else if (e.key === "Escape") setFullscreen(false);
      else if (e.key === " ") { e.preventDefault(); spaceRef.current(); }
      else if (e.key === "Backspace") { e.preventDefault(); if (!bsDownRef.current) { bsDownRef.current = true; bsUsedRef.current = false; } }
      else if (/^[1-9]$/.test(e.key)) { e.preventDefault(); const rm = bsDownRef.current; if (rm) bsUsedRef.current = true; numKeyRef.current(parseInt(e.key, 10), rm); }
    };
    const onUp = (e: KeyboardEvent) => {
      // Backspace released with no digit pressed during the hold → clear all.
      if (e.key === "Backspace") {
        if (bsDownRef.current && !bsUsedRef.current) clearAllRef.current();
        bsDownRef.current = false; bsUsedRef.current = false;
      }
    };
    const onBlur = () => { bsDownRef.current = false; bsUsedRef.current = false; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Explorer panel: families / rings / interval database (one open at a time)
  const [panel, setPanel] = useLocalState<"families" | "rings" | "database" | null>("is_panel", null);
  const addEdo = (edo: number) => setEdoInput(prev => {
    const list = prev.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    return list.includes(String(edo)) ? prev : [...list, String(edo)].join(", ");
  });
  // Drop a ratio (from the Interval Database) onto the spectrum as a magenta tick.
  const addRatio = (ratio: string) => setRatioInput(prev => {
    const list = prev.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    return list.includes(ratio) ? prev : [...list, ratio].join(", ");
  });
  const activeRatioSet = new Set(userRatios.map(r => r.j));
  const PANELS: ReadonlyArray<["families" | "rings" | "database", string]> =
    [["families", "Families"], ["rings", "Rings"], ["database", "Interval Database"]];

  // Per-note volume mixer content — shared by the floating panel (when the
  // Lumatone overlay is closed) and a column inside the L overlay itself, so
  // the user can adjust voice levels without leaving fullscreen.
  const mixerContent = voiceGroups.length === 0 ? null : (
    <>
      {chordSym && (
        <div className="mb-1.5 px-1.5 py-1 rounded bg-[#0d0d14] border border-[#2a2a3a] text-[#cfe6ff] text-sm font-bold tracking-wide text-center">
          {chordSym}
        </div>
      )}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold text-[#aaa] uppercase tracking-wider">Volume</span>
        <span className="text-[9px] text-[#666]">{voiceGroups.length}</span>
      </div>
      <div className="text-[8px] text-[#666] mb-1.5">1–9 mute · ⌫+# remove · ⌫ clear</div>
      <div className="flex flex-col gap-1.5">
        {voiceGroups.map((g, i) => {
          const k0 = g.keys[0];
          const v = vols[k0] ?? gainByKey.current.get(k0) ?? DEFAULT_VOICE_GAIN;
          const isMuted = k0 in muted;
          const label = g.keys.map(labelForKey).join(" ");
          return (
            <div key={k0} className="flex items-center gap-1.5">
              {i < 9 && (
                <button onClick={() => toggleMuteGroup(g.keys)}
                  title={isMuted ? "unmute" : "mute"}
                  className={`shrink-0 w-4 h-4 rounded text-[9px] leading-none border ${isMuted
                    ? "bg-[#3a2020] border-[#5a3030] text-[#cc8080]"
                    : "bg-[#1a1a22] border-[#2a2a3a] text-[#8888c0]"}`}>{i + 1}</button>
              )}
              <span className={`text-[10px] w-14 shrink-0 truncate ${isMuted ? "text-[#666] line-through" : "text-[#bbb]"}`}
                title={label}>{label}</span>
              <input type="range" min={0} max={0.25} step={0.005} value={v}
                onChange={e => { setGroupVol(g.keys, parseFloat(e.target.value)); if (isMuted) unmuteState(g.keys); }}
                className="flex-1 min-w-0" style={{ accentColor: isMuted ? "#664" : "#7173e6" }} />
              <button onClick={() => removeGroup(g.keys)} title="remove"
                className="shrink-0 text-[#666] hover:text-[#cc6666] text-xs leading-none">✕</button>
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-[#e0a040]">Interval Spectrum</h2>

      <div className="sticky top-0 z-20 -mx-5 px-5 py-2.5 bg-[#111] border-b border-[#1e1e1e] flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2">
          <span className="text-[10px] text-[#888] tracking-wider uppercase">EDOs</span>
          <input value={edoInput} onChange={e => setEdoInput(e.target.value)}
            placeholder="e.g. 12, 19, 31"
            className="w-36 px-2 py-1 text-sm bg-[#0a0a08] border border-[#2a2620] rounded text-[#d4a050] outline-none" />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-[10px] text-[#888] tracking-wider uppercase">Ratios</span>
          <input value={ratioInput} onChange={e => setRatioInput(e.target.value)}
            placeholder="e.g. 11/8, 7/4"
            className="w-32 px-2 py-1 text-sm bg-[#0a0a08] border border-[#2a2620] rounded outline-none"
            style={{ color: CUSTOM_COLOR }} />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-[10px] text-[#888] tracking-wider uppercase">Root</span>
          {/* Every step of the primary EDO is selectable, named in the active
              system — so the root can land on ANY node, not just 12 pitches. */}
          <select value={rootStepIn(primaryEdo)}
            onChange={e => setRootCents((Number(e.target.value) * 1200) / primaryEdo)}
            className="px-2 py-1 text-sm bg-[#0a0a08] border border-[#2a2620] rounded text-[#d4a050] outline-none">
            {Array.from({ length: primaryEdo }, (_, s) => (
              <option key={s} value={s}>{rootNameOf(s)}</option>
            ))}
          </select>
        </label>
        {edos.map((e, i) => (
          <span key={`${e}-${i}`} className="flex items-center gap-1 text-[11px]" style={{ color: EDO_COLORS[i % EDO_COLORS.length] }}>
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: EDO_COLORS[i % EDO_COLORS.length] }} />
            {e}-EDO
          </span>
        ))}
        <span className="flex items-center gap-1 text-[11px]" style={{ color: RATIO_COLOR }}>
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: RATIO_COLOR }} />JI
        </span>
        <span className="text-[10px] text-[#666]">press <kbd className="px-1 rounded bg-[#222] text-[#aaa]">L</kbd> for Lumatone</span>
        {customCents.length > 0 && (
          <button onClick={clearCustom}
            className="px-2 py-1 rounded text-[11px] font-medium border border-[#3a2a35] bg-[#1a1015] hover:text-white transition-colors"
            style={{ color: CUSTOM_COLOR }}>
            Clear placed ({customCents.length})
          </button>
        )}
      </div>

      {/* Chrome-style tab strip — Families / Rings / Interval Database.
          The active tab connects to the panel body below it. */}
      <div>
        <div className="flex items-end gap-1 px-1 border-b border-[#2a2a3a]">
          {PANELS.map(([id, label]) => {
            const on = panel === id;
            return (
              <button key={id} onClick={() => setPanel(p => (p === id ? null : id))}
                className={`relative px-4 py-1.5 text-xs font-medium rounded-t-lg border border-b-0 transition-colors ${on
                  ? "bg-[#101018] border-[#2a2a3a] text-[#cfe6ff] -mb-px z-10"
                  : "bg-[#0a0a0c] border-transparent text-[#777] hover:text-[#bbb] hover:bg-[#101013]"}`}>
                {label}
              </button>
            );
          })}
        </div>
        {panel && (
          <div className="bg-[#101018] border border-t-0 border-[#2a2a3a] rounded-b-lg p-4">
            {(panel === "families" || panel === "rings") && (
              <SpectrumTemperament onSelectEdo={addEdo} activeEdos={edos} view={panel} />
            )}
            {panel === "database" && (
              <SpectrumIntervalDatabase onAddRatio={addRatio} activeRatios={activeRatioSet} />
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="flex flex-col items-start gap-3 min-w-min">
          {REGIONS.map((r, ri) => {
            const span = r.hi - r.lo;
            const PX = 14;                       // pixels per cent
            const PAD = 80;                      // side room so edge labels aren't clipped
            const innerW = span * PX;
            const width = Math.max(320, innerW + PAD * 2);
            const x = (c: number) => (span > 0 ? PAD + (c - r.lo) * PX : PAD);
            const barLeft = PAD;                 // every region starts at the same left
            const barW = span > 0 ? innerW : 48;
            const inRange = (c: number) => c >= r.lo - 0.01 && c <= r.hi + 0.01;
            const labelColor = r.kind === "main" ? "#cbb59a" : "#7a7a9a";
            const BAR_TOP = 58, BAR_H = 12;
            const jiList = r.jis.map(j => ({ j, c: ratioCents(j) })).filter(o => inRange(o.c)).sort((a, b) => a.c - b.c);
            const uList = userRatios.filter(o => inRange(o.c)).sort((a, b) => a.c - b.c);
            const cList = customCents.filter(c => inRange(c)).sort((a, b) => a - b);
            const dotList = edos.flatMap((e, ei) =>
              edoSteps(e).filter(s => inRange(s.cents)).map(s => ({ e, ei, step: s.step, cents: s.cents })))
              .sort((a, b) => a.cents - b.cents);
            // merge dots that land on the same cents (e.g. unison/octave across EDOs)
            const dotGroups = Object.values(dotList.reduce<Record<number, typeof dotList>>((acc, o) => {
              const k = Math.round(o.cents); (acc[k] ??= []).push(o); return acc;
            }, {}));
            return (
              <div key={r.name + ri}>
                <div className="text-[11px] font-medium leading-tight mb-0.5" style={{ color: labelColor }}>
                  {r.name}
                </div>
                <div className="relative" style={{ width, height: 124 }}>
                  {/* region bar + sub-region shading — click anywhere on it to drop a node */}
                  <div className={`absolute rounded border border-[#1c1c1c] overflow-hidden ${span > 0 ? "cursor-crosshair" : ""}`}
                    onClick={span > 0 ? (e) => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); placeNode(r.lo + (e.clientX - rect.left) / PX); } : undefined}
                    onMouseMove={span > 0 ? (e) => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); hoverCentsRef.current = Math.max(r.lo, Math.min(r.hi, r.lo + (e.clientX - rect.left) / PX)); } : undefined}
                    onMouseLeave={span > 0 ? () => { hoverCentsRef.current = null; } : undefined}
                    style={{ top: BAR_TOP, height: BAR_H, left: barLeft, width: barW, background: r.kind === "main" ? "#15131c" : "#101010" }}>
                    {r.subs?.map((s, si) => (
                      <div key={s.name} className="absolute top-0 bottom-0 border-l border-[#26262e]"
                        style={{ left: (s.lo - r.lo) * PX, width: (s.hi - s.lo) * PX, background: si % 2 === 0 ? "#ffffff06" : "transparent" }}>
                        <span className="absolute bottom-0 left-0.5 text-[7px] uppercase text-[#444]">{s.name}</span>
                      </div>
                    ))}
                  </div>

                  {/* cents at EVERY band margin (region edges + each small/center/large boundary).
                      Point regions (unison/octave) draw none — the node sitting there already
                      shows its own cents, so a margin label would just duplicate it. */}
                  {(r.lo === r.hi ? [] : r.subs && r.subs.length ? [r.lo, ...r.subs.map(s => s.hi)] : [r.lo, r.hi])
                    .map((b, i) => (
                      <span key={`bd-${i}`} className="absolute -translate-x-1/2 text-[8px] text-[#9a9a9a] whitespace-nowrap"
                        style={{ left: x(b), top: BAR_TOP + BAR_H + 1 }}>{b}¢</span>
                    ))}

                  {/* JI ratio ticks — name above ratio above cents */}
                  {jiList.map((o, idx) => {
                    const key = `ji-${ri}-${o.j}`;
                    const on = active.has(key);
                    const row = idx % 2;
                    const top = row * 26;
                    return (
                      <div key={o.j} className="absolute cursor-pointer" style={{ left: x(o.c) }}
                        title={`${ratioName(o.j)} ${o.j} = ${o.c.toFixed(1)}¢ — click to drone`} onClick={() => toggleVoice(key, o.c)}>
                        <span className="absolute -translate-x-1/2 whitespace-nowrap text-center leading-none"
                          style={{ top, color: on ? "#7affe0" : "#4ab0a0" }}>
                          <span className="block text-[7px]" style={{ color: on ? "#9fffe9" : "#5f9f96" }}>
                            {o.j === "1/1" ? `${ROOT_NAMES[rootStepIn(12)]} (root)` : o.j === "2/1" ? `${ROOT_NAMES[rootStepIn(12)]} (8ve)` : ratioName(o.j)}
                          </span>
                          <span className="block text-[9px] mt-px">{o.j}</span>
                          <span className="block text-[7px] mt-px opacity-70">{Math.round(o.c)}¢</span>
                        </span>
                        <div className="absolute w-px left-0" style={{ top: top + 26, height: BAR_TOP - (top + 26), background: on ? "#7affe0" : "#4ab0a088" }} />
                      </div>
                    );
                  })}

                  {/* EDO dots — merged when several EDOs share a cents (unison/octave/…) */}
                  {dotGroups.map((g, idx) => {
                    const cents = g[0].cents;
                    const anyOn = g.some(o => active.has(`${o.e}-${o.step}`));
                    const col = g.length === 1 ? EDO_COLORS[g[0].ei % EDO_COLORS.length] : "#cbb59a";
                    const iname = edoIntervalLabel(r, dotList.filter(d => d.e === g[0].e).map(d => d.cents), cents);
                    const row = idx % 2;
                    // merged nodes are all the same pitch — turning on sounds ONE
                    // representative voice (not a stack); turning off clears any that are on.
                    const toggleGroup = () => {
                      if (anyOn) g.forEach(o => { const k = `${o.e}-${o.step}`; if (active.has(k)) toggleVoice(k, o.cents); });
                      else toggleVoice(`${g[0].e}-${g[0].step}`, g[0].cents);
                    };
                    return (
                      <div key={`grp-${Math.round(cents)}`} className="absolute" style={{ left: x(cents), top: BAR_TOP }}>
                        {/* large transparent hit area centred on the dot so a near-miss
                            still toggles the node instead of dropping a new one nearby */}
                        <button onClick={(e) => { e.stopPropagation(); if (e.ctrlKey || e.metaKey) setRootCents((((rootCents + cents) % 1200) + 1200) % 1200); else toggleGroup(); }}
                          title={`${g.map(o => `${o.step}\\${o.e}`).join(" · ")} = ${cents.toFixed(1)}¢ — ${iname} — click to drone, Ctrl/⌘-click to set root`}
                          className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer"
                          style={{ top: BAR_H / 2, width: 24, height: 24, background: "transparent", border: "none", padding: 0 }}>
                          <span className="rounded-full transition-all" style={{ width: anyOn ? 11 : 8, height: anyOn ? 11 : 8, background: col,
                            boxShadow: anyOn ? `0 0 0 2px #fff, 0 0 8px ${col}` : "none" }} />
                        </button>
                        <span className="absolute -translate-x-1/2 whitespace-nowrap text-center leading-none"
                          style={{ top: 20 + row * 22, color: col }}>
                          <span className="block text-[8px]">{g.map(o => `${o.step}\\${o.e}`).join(" ")}</span>
                          <span className="block text-[7px] mt-px opacity-70">{Math.round(cents)}¢</span>
                        </span>
                      </div>
                    );
                  })}

                  {/* Typed-ratio ticks (magenta) — name above ratio above cents */}
                  {uList.map((o, idx) => {
                    const key = `uji-${ri}-${o.j}`;
                    const on = active.has(key);
                    const row = idx % 2;
                    const top = row * 26;
                    return (
                      <div key={key} className="absolute cursor-pointer" style={{ left: x(o.c) }}
                        title={`${ratioName(o.j)} ${o.j} = ${o.c.toFixed(1)}¢ — click to drone`} onClick={() => toggleVoice(key, o.c)}>
                        <span className="absolute -translate-x-1/2 whitespace-nowrap text-center leading-none"
                          style={{ top, color: CUSTOM_COLOR, opacity: on ? 1 : 0.85 }}>
                          <span className="block text-[7px]">{ratioName(o.j)}</span>
                          <span className="block text-[9px] mt-px">{o.j}</span>
                          <span className="block text-[7px] mt-px opacity-70">{Math.round(o.c)}¢</span>
                        </span>
                        <div className="absolute w-px left-0" style={{ top: top + 26, height: BAR_TOP - (top + 26), background: CUSTOM_COLOR }} />
                      </div>
                    );
                  })}

                  {/* Placed nodes (magenta) — click to drone, right-click to remove */}
                  {cList.map((c, idx) => {
                    const key = `custom-${c}`;
                    const on = active.has(key);
                    const row = idx % 2;
                    return (
                      <div key={key} className="absolute" style={{ left: x(c), top: BAR_TOP }}>
                        <button onClick={(e) => { e.stopPropagation(); toggleVoice(key, c); }}
                          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); removeNode(c); }}
                          onMouseEnter={() => { hoverNodeRef.current = c; }}
                          onMouseLeave={() => { hoverNodeRef.current = null; }}
                          title={`${c}¢ — click to drone, Space/right-click to remove`}
                          className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer"
                          style={{ top: BAR_H / 2, width: 24, height: 24, background: "transparent", border: "none", padding: 0 }}>
                          <span className="rounded-full transition-all" style={{ width: on ? 11 : 8, height: on ? 11 : 8, background: CUSTOM_COLOR,
                            boxShadow: on ? `0 0 0 2px #fff, 0 0 8px ${CUSTOM_COLOR}` : "none" }} />
                        </button>
                        <span className="absolute -translate-x-1/2 whitespace-nowrap text-center leading-none"
                          style={{ top: 20 + row * 22, color: CUSTOM_COLOR }}>
                          <span className="block text-[8px]">{c}¢</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-note volume mixer — floats while voices sound (when the L overlay
          is closed; inside the overlay it renders as its own column). */}
      {!fullscreen && mixerContent && (
        <div className="fixed top-1/2 right-6 -translate-y-1/2 z-30 w-52 max-h-[70vh] overflow-auto bg-[#111] border border-[#2a2a2a] rounded-lg shadow-xl p-2">
          {mixerContent}
        </div>
      )}

      {fullscreen && (
        <LumatoneVisualizer edos={edos} activeStepsByEdo={activeStepsByEdo} rootCents={rootCents}
          fullscreen onToggleStep={toggleEdoStep} onScaleVoices={setScaleVoicesMuted}
          notationByEdo={notationByEdo} solfegeByEdo={solfegeByEdo} onOpenNotation={onOpenNotation}
          mixer={mixerContent} onSetRoot={setRootCents}
          nameMode={nameMode} onNameMode={setNameMode} onClose={() => setFullscreen(false)} />
      )}
    </div>
  );
}
