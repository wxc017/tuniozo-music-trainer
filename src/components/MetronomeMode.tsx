// ── MetronomeMode: advanced metronome with per-beat subdivisions ──────
//
// A standalone mode (Section: "Other").  Pick beats per measure, click a
// beat to give it its own subdivision, accent, or mute.  Subdivisions can
// be fixed, cycled through a list, or randomized (list / range), switching
// every N measures.  Global silence patterns: gap-click, mute-every-Nth,
// and random muting.

import { useEffect, useMemo, useRef, useState } from "react";
import { useLS } from "@/lib/storage";
import {
  MetronomeEngine,
  defaultConfig,
  defaultBeat,
  DEFAULT_PLACEMENT,
  DEFAULT_VOICE,
  type MetronomeConfig,
  type BeatConfig,
  type SubdivMode,
} from "@/lib/metronomeEngine";

const CFG_KEY = "lt_metronome_cfg";
const MIN_BPM = 20;
const MAX_BPM = 300;
const MAX_BEATS = 12;
const MAX_SUBDIV = 16;

const MODE_LABELS: Record<SubdivMode, string> = {
  fixed: "Fixed",
  cycle: "Cycle",
  randomList: "Random list",
  randomRange: "Random range",
};

// Small keyframes for the beat / subdivision pulse.  Injected once.
const PULSE_CSS = `
@keyframes metroDotPulse {
  0%   { transform: scale(1);   background: #3a3a4a; }
  12%  { transform: scale(1.6); background: #9999ee; box-shadow: 0 0 8px #7173e6; }
  100% { transform: scale(1);   background: #3a3a4a; }
}`;

export default function MetronomeMode() {
  const [config, setConfig] = useLS<MetronomeConfig>(CFG_KEY, defaultConfig(4));
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  // The currently sounding beat, for the visual playhead.
  const [active, setActive] = useState<{ beat: number; measure: number; sub: number; muted: boolean } | null>(null);
  // The resolved plan for the measure now playing (what the grid previews).
  const [plan, setPlan] = useState<{ sub: number; muted: boolean }[] | null>(null);

  const engineRef = useRef<MetronomeEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new MetronomeEngine(config);
  }

  // Keep the engine's live config in sync with edits.
  useEffect(() => {
    engineRef.current?.setConfig(config);
  }, [config]);

  // Wire the visual playhead + dispose on unmount.
  useEffect(() => {
    const engine = engineRef.current!;
    engine.setOnBeat(info =>
      setActive({ beat: info.beatIndex, measure: info.measureIndex, sub: info.subdivision, muted: info.muted }),
    );
    engine.setOnMeasure(p => setPlan(p.beats));
    return () => {
      engine.setOnBeat(null);
      engine.setOnMeasure(null);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const beatDurationMs = useMemo(() => 60000 / Math.max(1, config.bpm), [config.bpm]);

  async function toggleRun() {
    const engine = engineRef.current!;
    if (running) {
      engine.stop();
      setRunning(false);
      setActive(null);
      setPlan(null);
    } else {
      await engine.start();
      setRunning(true);
    }
  }

  // ── Config mutation helpers (immutable) ──
  function patchConfig(patch: Partial<MetronomeConfig>) {
    setConfig(prev => ({ ...prev, ...patch }));
  }
  function patchSilence(patch: Partial<MetronomeConfig["silence"]>) {
    setConfig(prev => ({ ...prev, silence: { ...prev.silence, ...patch } }));
  }
  function patchPlacement(patch: Partial<MetronomeConfig["placement"]>) {
    setConfig(prev => ({ ...prev, placement: { ...DEFAULT_PLACEMENT, ...prev.placement, ...patch } }));
  }
  function patchVoice(patch: Partial<MetronomeConfig["voice"]>) {
    setConfig(prev => ({ ...prev, voice: { ...DEFAULT_VOICE, ...prev.voice, ...patch } }));
  }
  function patchBeat(idx: number, patch: Partial<BeatConfig>) {
    setConfig(prev => ({
      ...prev,
      beats: prev.beats.map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    }));
  }
  function setBeatCount(n: number) {
    const count = Math.max(1, Math.min(MAX_BEATS, n));
    setConfig(prev => {
      const beats = [...prev.beats];
      while (beats.length < count) beats.push(defaultBeat(1));
      beats.length = count;
      return { ...prev, beats };
    });
    setSelected(s => (s !== null && s >= count ? null : s));
  }

  function setBpm(v: number) {
    if (isNaN(v)) return;
    patchConfig({ bpm: Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(v))) });
  }

  // ── Tap tempo ──
  const tapsRef = useRef<number[]>([]);
  function tapTempo() {
    const now = performance.now();
    const taps = tapsRef.current.filter(t => now - t < 2500);
    taps.push(now);
    tapsRef.current = taps;
    if (taps.length >= 2) {
      const intervals = [];
      for (let i = 1; i < taps.length; i++) intervals.push(taps[i] - taps[i - 1]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      setBpm(60000 / avg);
    }
  }

  const sel = selected !== null ? config.beats[selected] : null;
  const placement = config.placement ?? DEFAULT_PLACEMENT;
  const voice = config.voice ?? DEFAULT_VOICE;

  // What each beat node displays: while playing, the engine's resolved plan
  // for the current measure; otherwise a static preview so nothing jumps when
  // Start is pressed.  (Random modes only settle to concrete numbers once the
  // engine rolls them each measure.)
  const preview = useMemo(
    () => config.beats.map(b => ({ sub: previewSub(b), muted: b.muted })),
    [config.beats],
  );
  const view = running && plan && plan.length === config.beats.length ? plan : preview;

  return (
    <div className="max-w-4xl mx-auto py-4 space-y-4">
      <style>{PULSE_CSS}</style>

      {/* ── Header / transport ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-[#888] uppercase tracking-widest">Metronome</h2>

        <button
          onClick={toggleRun}
          className={`px-4 py-1.5 rounded text-xs font-semibold transition-colors border ${
            running
              ? "bg-[#e6a217] border-[#e6a217] text-[#111]"
              : "bg-[#7173e618] border-[#7173e6] text-[#9999ee] hover:bg-[#7173e630]"
          }`}
        >
          {running ? "■ Stop" : "▶ Start"}
        </button>

        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-[#666]">BPM</label>
          <BpmInput bpm={config.bpm} onCommit={setBpm} />
          <button
            onClick={tapTempo}
            className="px-2 py-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded text-xs text-[#888] hover:text-[#ccc] hover:border-[#3a3a3a] transition-colors"
            title="Tap to set tempo"
          >
            Tap
          </button>
          <div className="w-px h-4 bg-[#2a2a2a]" />
          <label className="text-xs text-[#666]">Vol</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.volume}
            onChange={e => patchConfig({ volume: Number(e.target.value) })}
            className="w-16 accent-[#7173e6]"
          />
          <span className="text-xs text-[#555] w-7">{Math.round(config.volume * 100)}%</span>
        </div>
      </div>

      {/* ── Beats-per-measure stepper ── */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-[#666]">Beats per measure</span>
        <div className="flex items-center gap-1">
          <StepBtn onClick={() => setBeatCount(config.beats.length - 1)} disabled={config.beats.length <= 1}>−</StepBtn>
          <span className="w-8 text-center text-sm text-white font-mono">{config.beats.length}</span>
          <StepBtn onClick={() => setBeatCount(config.beats.length + 1)} disabled={config.beats.length >= MAX_BEATS}>+</StepBtn>
        </div>
        <span className="text-[10px] text-[#555]">click a beat to edit its subdivision</span>
      </div>

      {/* ── Randomize placement ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Toggle
          on={placement.enabled}
          onClick={() => patchPlacement({ enabled: !placement.enabled })}
          label="⤮ Randomize placement"
          color="#7173e6"
        />
        {placement.enabled && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#666]">re-shuffle every</span>
            <NumberStepper value={placement.holdMeasures} min={1} max={16} onChange={v => patchPlacement({ holdMeasures: v })} />
            <span className="text-xs text-[#555]">measure{placement.holdMeasures === 1 ? "" : "s"}</span>
          </div>
        )}
        <Toggle
          on={voice.enabled}
          onClick={() => patchVoice({ enabled: !voice.enabled })}
          label="🔊 Announce changes"
          color="#5a8a5a"
        />
      </div>

      {/* ── Beat grid ── */}
      <div className="flex flex-wrap gap-2">
        {config.beats.map((beat, i) => {
          const isActive = running && active?.beat === i;
          const isSel = selected === i;
          const v = view[i] ?? { sub: previewSub(beat), muted: beat.muted };
          return (
            <BeatNode
              key={i}
              index={i}
              beat={beat}
              displaySub={v.sub}
              displayMuted={v.muted || beat.muted}
              active={isActive}
              activeMeasure={active?.measure ?? 0}
              selected={isSel}
              beatDurationMs={beatDurationMs}
              onClick={() => setSelected(isSel ? null : i)}
            />
          );
        })}
      </div>

      {/* ── Selected-beat editor ── */}
      {sel && selected !== null && (
        <BeatEditor
          index={selected}
          beat={sel}
          onPatch={patch => patchBeat(selected, patch)}
          onClose={() => setSelected(null)}
        />
      )}

      {/* ── Silence patterns ── */}
      <SilencePanel silence={config.silence} onPatch={patchSilence} />
    </div>
  );
}

// Static preview subdivision for a beat when the metronome is idle — a
// representative value so the grid shows real numbers (never "~") before
// Start is pressed.  Random modes only settle once the engine rolls them.
function previewSub(beat: BeatConfig): number {
  switch (beat.mode) {
    case "fixed":       return beat.subdivision;
    case "cycle":       return beat.list[0] ?? beat.subdivision;
    case "randomList":  return beat.list[0] ?? beat.subdivision;
    case "randomRange": return Math.min(beat.rangeMin, beat.rangeMax);
  }
}

// ── Beat node ─────────────────────────────────────────────────────────

function BeatNode({
  index,
  beat,
  displaySub,
  displayMuted,
  active,
  activeMeasure,
  selected,
  beatDurationMs,
  onClick,
}: {
  index: number;
  beat: BeatConfig;
  displaySub: number;   // subdivisions this beat plays in the current/previewed measure
  displayMuted: boolean; // silenced this measure (manual or by a silence rule)
  active: boolean;
  activeMeasure: number;
  selected: boolean;
  beatDurationMs: number;
  onClick: () => void;
}) {
  const dots = Math.min(Math.max(1, displaySub), MAX_SUBDIV);
  const suppressPulse = displayMuted;

  const borderColor = selected
    ? "#9999ee"
    : active
    ? "#e6a217"
    : displayMuted
    ? "#3a2a2a"
    : "#1e1e1e";
  const bg = selected ? "#9999ee14" : active ? "#e6a21714" : "#0a0a0a";

  return (
    <button
      onClick={onClick}
      style={{ borderColor, background: bg }}
      className={`relative flex flex-col items-center gap-2 w-24 px-3 py-3 rounded-lg border-[1.5px] transition-colors ${
        displayMuted ? "opacity-50" : ""
      }`}
    >
      {/* top row: beat number + badges */}
      <div className="flex items-center gap-1 w-full">
        <span className="text-[10px] text-[#666] font-mono">{index + 1}</span>
        <span className="ml-auto flex gap-1">
          {beat.accent && <span className="text-[9px] text-[#e6a217] font-bold" title="Accent">▲</span>}
          {displayMuted && <span className="text-[9px] text-[#cc6666]" title="Muted">✕</span>}
          {beat.mode !== "fixed" && <span className="text-[9px] text-[#7aa]" title={MODE_LABELS[beat.mode]}>⟳</span>}
        </span>
      </div>

      {/* big subdivision number — the value this measure actually plays */}
      <div className={`text-2xl font-bold leading-none ${beat.accent ? "text-[#e6c078]" : "text-[#ccc]"}`}>
        {displaySub}
      </div>

      {/* subdivision dots */}
      <div className="flex items-center justify-center gap-1 flex-wrap min-h-[8px]" style={{ maxWidth: 72 }}>
        {Array.from({ length: dots }).map((_, d) => (
          <span
            key={active ? `${activeMeasure}-${d}` : `s-${d}`}
            className="rounded-full inline-block"
            style={{
              width: 5,
              height: 5,
              background: "#3a3a4a",
              ...(active && !suppressPulse
                ? {
                    animation: `metroDotPulse ${beatDurationMs}ms linear`,
                    animationDelay: `${(beatDurationMs / dots) * d}ms`,
                  }
                : {}),
            }}
          />
        ))}
      </div>

      <span className="text-[9px] text-[#555]">{MODE_LABELS[beat.mode]}</span>
    </button>
  );
}

// ── Selected-beat editor ──────────────────────────────────────────────

function BeatEditor({
  index,
  beat,
  onPatch,
  onClose,
}: {
  index: number;
  beat: BeatConfig;
  onPatch: (patch: Partial<BeatConfig>) => void;
  onClose: () => void;
}) {
  return (
    <div className="bg-[#111] border border-[#7173e640] rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-[#9999ee]">Beat {index + 1}</span>
        <div className="ml-auto flex items-center gap-2">
          <Toggle on={beat.accent} onClick={() => onPatch({ accent: !beat.accent })} label="Accent" color="#e6a217" />
          <Toggle on={beat.muted} onClick={() => onPatch({ muted: !beat.muted })} label="Mute" color="#cc6666" />
          <button onClick={onClose} className="text-[#666] hover:text-[#ccc] text-sm px-1" title="Close">✕</button>
        </div>
      </div>

      {/* mode selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[#666]">Subdivision</span>
        <div className="flex gap-1">
          {(Object.keys(MODE_LABELS) as SubdivMode[]).map(m => (
            <button
              key={m}
              onClick={() => onPatch({ mode: m })}
              className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                beat.mode === m
                  ? "bg-[#7173e618] border-[#7173e6] text-[#9999ee]"
                  : "bg-[#1a1a1a] border-[#2a2a2a] text-[#888] hover:text-[#ccc]"
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {/* mode-specific controls */}
      {beat.mode === "fixed" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#666]">Notes in this beat</span>
          <NumberStepper
            value={beat.subdivision}
            min={1}
            max={MAX_SUBDIV}
            onChange={v => onPatch({ subdivision: v })}
          />
        </div>
      )}

      {(beat.mode === "cycle" || beat.mode === "randomList") && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[#666]">
              {beat.mode === "cycle" ? "Cycle through" : "Random from"}
            </span>
            <ListEditor list={beat.list} onChange={list => onPatch({ list })} />
          </div>
          <HoldControl value={beat.holdMeasures} onChange={v => onPatch({ holdMeasures: v })} />
        </div>
      )}

      {beat.mode === "randomRange" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#666]">Range</span>
            <NumberStepper value={beat.rangeMin} min={1} max={MAX_SUBDIV} onChange={v => onPatch({ rangeMin: v })} />
            <span className="text-xs text-[#555]">to</span>
            <NumberStepper value={beat.rangeMax} min={1} max={MAX_SUBDIV} onChange={v => onPatch({ rangeMax: v })} />
          </div>
          <HoldControl value={beat.holdMeasures} onChange={v => onPatch({ holdMeasures: v })} />
        </div>
      )}
    </div>
  );
}

function HoldControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[#666]">Switch every</span>
      <NumberStepper value={value} min={1} max={16} onChange={onChange} />
      <span className="text-xs text-[#555]">measure{value === 1 ? "" : "s"}</span>
    </div>
  );
}

// ── Silence panel ─────────────────────────────────────────────────────

function SilencePanel({
  silence,
  onPatch,
}: {
  silence: MetronomeConfig["silence"];
  onPatch: (patch: Partial<MetronomeConfig["silence"]>) => void;
}) {
  return (
    <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg p-4 space-y-3">
      <span className="text-xs font-semibold text-[#888] uppercase tracking-wider">Silence patterns</span>

      {/* mute every Nth beat */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[#666] w-40">Mute every Nth beat</span>
        <div className="flex gap-1">
          {[0, 2, 3, 4, 5, 6].map(n => (
            <button
              key={n}
              onClick={() => onPatch({ everyNBeat: n })}
              className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                silence.everyNBeat === n
                  ? "bg-[#7173e618] border-[#7173e6] text-[#9999ee]"
                  : "bg-[#1a1a1a] border-[#2a2a2a] text-[#888] hover:text-[#ccc]"
              }`}
            >
              {n === 0 ? "Off" : n}
            </button>
          ))}
        </div>
      </div>

      {/* gap-click */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[#666] w-40">Gap click (measures)</span>
        <span className="text-xs text-[#555]">play</span>
        <NumberStepper value={silence.gapPlayMeasures} min={0} max={16} onChange={v => onPatch({ gapPlayMeasures: v })} />
        <span className="text-xs text-[#555]">mute</span>
        <NumberStepper value={silence.gapMuteMeasures} min={0} max={16} onChange={v => onPatch({ gapMuteMeasures: v })} />
        <span className="text-[10px] text-[#555]">{silence.gapMuteMeasures > 0 ? "" : "(off)"}</span>
      </div>

      {/* random mute */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[#666] w-40">Random mute</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={silence.randomMuteRate}
          onChange={e => onPatch({ randomMuteRate: Number(e.target.value) })}
          className="w-40 accent-[#7173e6]"
        />
        <span className="text-xs text-[#555] w-10">{Math.round(silence.randomMuteRate * 100)}%</span>
      </div>
    </div>
  );
}

// ── Small shared UI bits ──────────────────────────────────────────────

function BpmInput({ bpm, onCommit }: { bpm: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(bpm));
  const focused = useRef(false);
  const byEnter = useRef(false);

  // Reflect external changes (tap tempo, etc.) when not being edited.
  useEffect(() => {
    if (!focused.current) setDraft(String(bpm));
  }, [bpm]);

  function commit() {
    const parsed = parseInt(draft, 10);
    const v = isNaN(parsed) ? bpm : Math.max(MIN_BPM, Math.min(MAX_BPM, parsed));
    onCommit(v);
    setDraft(String(v));
  }

  return (
    <input
      type="number"
      min={MIN_BPM}
      max={MAX_BPM}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onFocus={() => { focused.current = true; }}
      onBlur={() => {
        focused.current = false;
        if (!byEnter.current) commit();
        byEnter.current = false;
      }}
      onKeyDown={e => {
        if (e.key === "Enter") {
          byEnter.current = true;
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="w-16 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white focus:outline-none text-center"
      aria-label="BPM"
    />
  );
}

function StepBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-6 h-6 flex items-center justify-center bg-[#1a1a1a] border border-[#2a2a2a] rounded text-[#aaa] hover:text-white hover:border-[#3a3a3a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

function NumberStepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="flex items-center gap-1">
      <StepBtn onClick={() => onChange(clamp(value - 1))} disabled={value <= min}>−</StepBtn>
      <span className="w-7 text-center text-sm text-white font-mono">{value}</span>
      <StepBtn onClick={() => onChange(clamp(value + 1))} disabled={value >= max}>+</StepBtn>
    </div>
  );
}

function Toggle({ on, onClick, label, color }: { on: boolean; onClick: () => void; label: string; color: string }) {
  return (
    <button
      onClick={onClick}
      style={on ? { borderColor: color, color, background: `${color}14` } : {}}
      className={`px-2 py-1 text-[11px] rounded border transition-colors ${
        on ? "" : "bg-[#1a1a1a] border-[#2a2a2a] text-[#888] hover:text-[#ccc]"
      }`}
    >
      {label}
    </button>
  );
}

function ListEditor({ list, onChange }: { list: number[]; onChange: (list: number[]) => void }) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = parseInt(draft, 10);
    if (!isNaN(v) && v >= 1 && v <= MAX_SUBDIV) {
      onChange([...list, v]);
      setDraft("");
    }
  }
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {list.map((n, i) => (
        <span
          key={i}
          className="flex items-center gap-1 px-1.5 py-0.5 bg-[#7173e618] border border-[#7173e640] rounded text-[11px] text-[#9999ee] font-mono"
        >
          {n}
          <button
            onClick={() => onChange(list.filter((_, j) => j !== i))}
            className="text-[#6666aa] hover:text-[#cc6666]"
            title="Remove"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onKeyDown={e => {
          if (e.key === "Enter") add();
        }}
        placeholder="+"
        className="w-9 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1 py-0.5 text-[11px] text-white focus:outline-none text-center"
      />
      {draft && (
        <button onClick={add} className="text-[11px] text-[#9999ee] hover:text-white px-1">
          add
        </button>
      )}
    </div>
  );
}
