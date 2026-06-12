// ── Sticky Lumatone visualizer ──────────────────────────────────────
// A small floating keyboard that lights up the keys for the notes currently
// sounding.  It only offers the EDOs you've entered in the spectrum (that
// also have a layout file), and only lights nodes belonging to the EDO whose
// keyboard is shown — i.e. the 12-EDO board reflects 12-EDO nodes only.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import LumatoneKeyboard from "@/components/LumatoneKeyboard";
import { computeLayout, type LayoutResult, type LumatoneData, type ComputedKey } from "@/lib/lumatoneLayout";
import { getLayoutFile } from "@/lib/edoData";
import { notationLabel, solfegeLabel } from "@/lib/notationLabels";
import { type LatticeNode } from "@/lib/tonalityLatticeLayout";
import { type NamedScale } from "@/lib/commonScales";
import SolfegePanel from "@/components/tabs/SolfegePanel";
import { useLocalState } from "@/hooks/useLocalState";

// Map a picked preset scale → the lattice anchor (`family::mode`) it centres on.
// Only scales that exist as lattice families have an anchor; the septimal ones
// are 31-EDO-only.  Others just select on the keyboard without re-centring.
const SCALE_ANCHOR: Record<string, string> = {
  "Major": "Major Family::Ionian",
  "Major (Pyth)": "Major Family::Ionian",
  "Major (just)": "Major Family::Ionian",
  "Dorian": "Major Family::Dorian",
  "Phrygian": "Major Family::Phrygian",
  "Lydian": "Major Family::Lydian",
  "Mixolydian": "Major Family::Mixolydian",
  "Nat. minor": "Major Family::Aeolian",
  "Nat. minor (Pyth)": "Major Family::Aeolian",
  "Nat. minor (just)": "Major Family::Aeolian",
  "Harm. minor": "Harmonic Minor Family::Harmonic Minor",
  "Mel. minor": "Melodic Minor Family::Melodic Minor",
  "Diatonic Small Minor": "Subminor Diatonic Family::Subminor Diatonic",
  "Diatonic Large Major": "Supermajor Diatonic Family::Supermajor Diatonic",
  "Diatonic Small Minor (Major 7th)": "Subharmonic Diatonic Family::Subharmonic Diatonic M7",
};
const SEPTIMAL_ANCHORS = new Set([
  "Subminor Diatonic Family::Subminor Diatonic",
  "Supermajor Diatonic Family::Supermajor Diatonic",
  "Subharmonic Diatonic Family::Subharmonic Diatonic M7",
]);

// The 3D alteration lattice is heavy (three.js); load it only when opened.
const ModeLattice3D = lazy(() => import("@/components/scalar/ModeLattice3D"));

// Original layouts (pitch class 0 = C) — correct reference for mapping spectrum
// steps to keys.  (The pastel layouts are transposed, so they're not used here.)
const AVAILABLE_LAYOUTS = [
  5, 7, 12, 17, 19, 22, 26, 27, 29, 31, 32, 33, 34, 35, 37, 39, 40, 41, 43, 45, 46, 47, 49, 50, 53,
  55, 56, 63, 80, 81, 94,
];
// The alteration lattice is only offered for these EDOs (per user direction).
const LATTICE_EDOS = [12, 31, 41];
const EMPTY_PITCHES: Set<number> = new Set();

export default function LumatoneVisualizer({ edos, activeStepsByEdo, rootCents, fullscreen, onToggleStep, onScaleVoices, onClose, notationByEdo = {}, solfegeByEdo = {}, onOpenNotation, mixer, onSetRoot, nameMode, onNameMode }: {
  edos: number[];
  /** edo -> active step numbers (0..edo) currently sounding for that EDO */
  activeStepsByEdo: Record<number, number[]>;
  /** Global root as cents above C (EDO-precise — lands on any step of any EDO). */
  rootCents: number;
  fullscreen?: boolean;
  /** drone/un-drone the spectrum's own voice for (edo, step) — bidirectional */
  onToggleStep: (edo: number, step: number) => void;
  /** Per-voice volume mixer, rendered as a column inside the overlay. */
  mixer?: ReactNode;
  /** picking a scale: turn its steps on as voices but muted (replaces edo's voices) */
  onScaleVoices?: (edo: number, steps: number[]) => void;
  /** chosen notation / solfège system per EDO (from the "n" picker) */
  notationByEdo?: Record<number, string>;
  solfegeByEdo?: Record<number, string>;
  onOpenNotation?: () => void;
  /** Set the global root (cents above C) — Ctrl/⌘-clicking a key calls this so
   *  that key becomes the true root (labels AND readout follow, EDO-precise). */
  onSetRoot?: (cents: number) => void;
  /** Interval/solfège naming, owned by the parent so the keyboard, root selector
   *  and readout stay in sync. */
  nameMode: "code" | "solfege";
  onNameMode: (m: "code" | "solfege") => void;
  onClose: () => void;
}) {
  const options = useMemo(() => edos.filter(e => AVAILABLE_LAYOUTS.includes(e)), [edos]);
  // Persisted settings (remembered across tab switches / reloads).
  const [pick, setPick] = useLocalState<number | null>("lv_pick", null);
  const edo = pick !== null && options.includes(pick) ? pick : (options[0] ?? null);

  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const [scale, setScale] = useState<Set<number>>(new Set());   // selected solfège steps
  // Root step on THIS board, derived from the EDO-precise global root (cents).
  // Ctrl/⌘-clicking a key sets that root for real, so labels, the root marker,
  // the drone frame and the readout all stay in agreement (no label-only drift).
  const rootStep = edo !== null ? (((Math.round((rootCents * edo) / 1200)) % edo) + edo) % edo : 0;
  const [showLattice, setShowLattice] = useLocalState("lv_showlattice", false);  // 3D alteration lattice
  const [latticeAnchorKey, setLatticeAnchorKey] = useLocalState("lv_anchor", "Major Family::Ionian");
  const latticeOk = edo !== null && LATTICE_EDOS.includes(edo);

  // Clicking a lattice node selects its tonality on the keyboard (highlight)
  // + the solfège list — mapped from the node's own root into steps relative to
  // the popup's current root.
  const onLatticeMode = useCallback((node: LatticeNode | null) => {
    if (!node || edo === null) return;
    const rs = (((Math.round((rootCents * edo) / 1200)) % edo) + edo) % edo;
    setScale(new Set(node.mode.scale.map(s => (((node.rootPc + s - rs) % edo) + edo) % edo)));
  }, [edo, rootCents]);

  // Picking a preset scale: turn its notes on as muted voices (they fill the
  // mixer ready to unmute) and re-centre the alteration lattice on it (when it
  // maps to a lattice family; septimal anchors are 31-EDO only).
  const onPickScale = useCallback((s: NamedScale | null) => {
    if (edo === null) return;
    if (!s) { onScaleVoices?.(edo, []); return; }   // clear: remove this EDO's voices
    onScaleVoices?.(edo, s.steps);                   // load the scale's notes (muted)
    // Match the anchor by name, tolerating the EDO-accurate suffix the sized
    // namer can add (e.g. "Diatonic Large Major M7"): try exact, then the
    // longest anchor key the name starts with.
    const prefixKey = Object.keys(SCALE_ANCHOR).sort((a, b) => b.length - a.length).find(k => s.name.startsWith(k));
    const anchor = SCALE_ANCHOR[s.name] ?? (prefixKey ? SCALE_ANCHOR[prefixKey] : undefined);
    if (anchor && !(SEPTIMAL_ANCHORS.has(anchor) && edo !== 31)) setLatticeAnchorKey(anchor);
  }, [edo, onScaleVoices]);

  // Backspace in the overlay clears the highlighted notes: drop the selection
  // and turn off this EDO's droning voices.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Backspace") return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      e.preventDefault();
      if (edo !== null) for (const s of activeStepsByEdo[edo] ?? []) onToggleStep(edo, s);
      setScale(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, edo, activeStepsByEdo, onToggleStep]);
  useEffect(() => {
    if (edo === null) { setLayout(null); return; }
    let alive = true;
    setLayout(null);
    fetch(getLayoutFile(edo))
      .then(r => r.json())
      .then((d: LumatoneData) => { if (alive) setLayout(computeLayout(d)); })
      .catch(() => { if (alive) setLayout(null); });
    return () => { alive = false; };
  }, [edo]);

  // Auto-select the sounding notes as solfège syllables, so the panel reflects
  // whatever scale is already droning (e.g. loaded from the spectrum before
  // pressing L) instead of forcing a manual Ctrl-click.  On EDO change / first
  // mount we seed the selection from the sounding set; while staying on one EDO
  // we only ADD newly-sounding steps — never resurrecting ones the user just
  // removed (Clear / un-drone update `scale` synchronously, but the parent's
  // sounding set lags by a render, so a blind re-sync would undo the removal).
  const prevSounding = useRef<{ edo: number | null; steps: Set<number> }>({ edo: null, steps: new Set() });
  useEffect(() => {
    if (edo === null) return;
    const sounding = new Set(activeStepsByEdo[edo] ?? []);
    const prev = prevSounding.current;
    prevSounding.current = { edo, steps: sounding };
    if (prev.edo !== edo) { setScale(new Set(sounding)); return; }   // seed on EDO change / mount
    const added = [...sounding].filter(s => !prev.steps.has(s));
    if (added.length) setScale(p => { const n = new Set(p); added.forEach(s => n.add(s)); return n; });
  }, [edo, activeStepsByEdo]);

  const steps = edo !== null ? (activeStepsByEdo[edo] ?? []) : [];
  // Light ONE key per sounding/selected note — the instance at the note's own
  // register (root + step, one octave up from a central root key), instead of
  // every octave-repeat of its pitch class across the board.
  const litKeys = useMemo(() => {
    const set = new Set<number>();
    if (!layout || edo === null) return set;
    const rootClass = (((rootStep) % edo) + edo) % edo;
    // reference root key: the root-class instance nearest the board centre —
    // defines the register the scale is played / shown in.
    const cx = (layout.minX + layout.maxX) / 2, cy = (layout.minY + layout.maxY) / 2;
    let rootKey: typeof layout.keys[number] | null = null, rootD = Infinity;
    for (const k of layout.keys) {
      if ((((k.pitch % edo) + edo) % edo) !== rootClass) continue;
      const d = (k.x - cx) ** 2 + (k.y - cy) ** 2;
      if (d < rootD) { rootD = d; rootKey = k; }
    }
    if (!rootKey) return set;
    const want = new Set<number>(steps);
    for (const s of scale) want.add(s);
    // notes sounding in OTHER edos → their nearest step on this board, so the
    // same pitch (the root/unison especially) lights across every edo's overlay.
    for (const [e, sts] of Object.entries(activeStepsByEdo)) {
      const en = Number(e);
      if (en === edo) continue;
      for (const st of sts) want.add((((Math.round((st * edo) / en) % edo) + edo) % edo));
    }
    // Light every key at the note's ACTUAL pitch in the playback register
    // (root + step) — so duplicate keys for the same pitch light together (e.g.
    // both m7), but ONLY the octave being played, not every octave on the board.
    for (const s of want) {
      const target = rootKey.pitch + s;
      let any = false;
      layout.keys.forEach((k, i) => { if (k.pitch === target) { set.add(i); any = true; } });
      if (!any) {                                   // target out of range → nearest pitch-class instance
        const cls = (((rootClass + s) % edo) + edo) % edo;
        let best = -1, bestD = Infinity;
        layout.keys.forEach((k, i) => { if ((((k.pitch % edo) + edo) % edo) === cls) { const d = (k.x - rootKey!.x) ** 2 + (k.y - rootKey!.y) ** 2; if (d < bestD) { bestD = d; best = i; } } });
        if (best >= 0) set.add(best);
      }
    }
    return set;
  }, [layout, steps, edo, rootStep, scale, activeStepsByEdo]);

  const onKey = (key: ComputedKey, e: MouseEvent) => {
    if (edo === null) return;
    const pc = ((key.pitch % edo) + edo) % edo;
    // Ctrl/⌘-click makes THIS node the real tonic (EDO-precise), so it reads as
    // the unison "1"/"A" and labels, drone frame and readout all follow it.
    if (e.ctrlKey || e.metaKey) {
      onSetRoot?.((pc * 1200) / edo);
      return;
    }
    const step = (((pc - rootStep) % edo) + edo) % edo;
    // A key is "on" if it's droning OR selected.  Toggle BOTH together so a
    // second click always turns it fully off (otherwise it stays lit by the
    // other channel and can't be un-highlighted).
    const droning = steps.includes(step);
    const isOn = droning || scale.has(step);
    if (isOn) {
      if (droning) onToggleStep(edo, step);   // un-drone
      setScale(prev => { const n = new Set(prev); n.delete(step); return n; });
    } else {
      onToggleStep(edo, step);                // drone
      setScale(prev => { const n = new Set(prev); n.add(step); return n; });
    }
  };

  // Code labels deduped per EDO: in very fine EDOs a sized band can hold 4+
  // steps and two keys would share a code — append the step number so each
  // reads uniquely.  (No-op when every step already has its own code.)
  const codeByStep = useMemo(() => {
    if (edo === null) return null;
    const codes = Array.from({ length: edo }, (_, s) => notationLabel(edo, notationByEdo[edo], s));
    const counts = new Map<string, number>();
    for (const c of codes) counts.set(c, (counts.get(c) ?? 0) + 1);
    return codes.map((c, s) => (counts.get(c)! > 1 ? `${c} ${s}` : c));
  }, [edo, notationByEdo]);

  // Fuzzy (Schulter-spectrum) interval name for a key, measured from the root.
  const keyLabel = (pitch: number) => {
    if (edo === null) return undefined;
    const pc = ((pitch % edo) + edo) % edo;
    const step = (((pc - rootStep) % edo) + edo) % edo;
    // Use the per-EDO system chosen in the "n" picker (Schulter / Universal by default).
    return nameMode === "solfege"
      ? solfegeLabel(edo, solfegeByEdo[edo], step)
      : (codeByStep ? codeByStep[step] : notationLabel(edo, notationByEdo[edo], step));
  };
  const rootPitchClass = edo !== null ? ((rootStep % edo) + edo) % edo : undefined;

  const header = (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[11px] font-semibold text-[#aaa] tracking-wider uppercase">Lumatone</span>
      {options.length > 0 && (
        <select value={edo ?? undefined} onChange={e => setPick(Number(e.target.value))}
          className="px-1.5 py-0.5 text-xs bg-[#141414] border border-[#2a2a2a] rounded text-[#ddd] outline-none">
          {options.map(e => <option key={e} value={e}>{e}-EDO</option>)}
        </select>
      )}
      <div className="flex items-center gap-1">
        {(["code", "solfege"] as const).map(m => (
          <button key={m} onClick={() => onNameMode(m)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${nameMode === m
              ? "bg-[#252550] border-[#7173e6] text-[#cfe6ff]" : "bg-[#14141a] border-[#2a2a3a] text-[#8888c0] hover:text-[#cfe6ff]"}`}>
            {m === "code" ? "Intervals" : "Solfège"}
          </button>
        ))}
      </div>
      {fullscreen && latticeOk && (
        <button onClick={() => setShowLattice(v => !v)}
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${showLattice
            ? "bg-[#1a2230] border-[#88bbff] text-[#cfe6ff]" : "bg-[#14141a] border-[#2a2a3a] text-[#8888c0] hover:text-[#cfe6ff]"}`}>
          {showLattice ? "▾ Lattice" : "▸ Lattice"}
        </button>
      )}
      {edo !== null && <span className="text-[10px] text-[#555]">{steps.length} sounding · click a key to drone · ⌘/Ctrl-click = root</span>}
      {fullscreen && <span className="text-[10px] text-[#555]">press L or Esc to exit</span>}
      <button onClick={onClose} className="ml-auto text-[#999] hover:text-[#cc6666] text-lg leading-none">✕</button>
    </div>
  );

  const board = edo === null
    ? <div className="text-xs text-[#666] py-10 text-center">No Lumatone layout for your EDO(s). Try 12, 17, 19, 31, 41, or 53.</div>
    : layout
      ? <div className={fullscreen ? "flex-1 min-h-0" : ""}>
          <LumatoneKeyboard layout={layout} highlightedPitches={EMPTY_PITCHES} litKeys={litKeys} edo={edo}
            labelOf={keyLabel} rootPitchClass={rootPitchClass} onKeyClick={onKey}
            maxHeight={fullscreen ? null : 210} />
        </div>
      : <div className="text-xs text-[#666] py-10 text-center">Loading {edo}-EDO…</div>;

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
        <div className="w-full h-full max-w-[1500px] bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl shadow-2xl p-4 flex flex-col"
          onClick={e => e.stopPropagation()}>
          {header}
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            <div className={`min-h-0 flex gap-3 ${showLattice && latticeOk ? "h-[44%]" : "flex-1"}`}>
              {board}
              {mixer && (
                <div className="w-52 shrink-0 min-h-0 overflow-auto border-l border-[#1e1e1e] pl-3">
                  {mixer}
                </div>
              )}
              <div className="w-72 shrink-0 min-h-0 overflow-auto border-l border-[#1e1e1e] pl-3">
                <SolfegePanel edo={edo} scale={scale} setScale={setScale} onPickScale={onPickScale} />
              </div>
            </div>
            {showLattice && latticeOk && edo !== null && (
              <div className="flex-1 min-h-0 border-t border-[#1e1e1e] pt-2">
                <Suspense fallback={<div className="text-xs text-[#666] p-4">Loading lattice…</div>}>
                  <ModeLattice3D edo={edo} rootPitch={Math.round((rootCents * edo) / 1200) + edo * 4}
                    tonicPc={Math.round((rootCents * edo) / 1200)} anchorKey={latticeAnchorKey}
                    onActiveModeChange={onLatticeMode} fillHeight embedded />
                </Suspense>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[460px] max-w-[92vw] bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl shadow-2xl p-3">
      {header}
      {board}
    </div>
  );
}
