// ── Rhythmic Audiation ────────────────────────────────────────────────────
//
// The rhythm counterpart to Tonal Audiation: a section with sub-tabs that all
// follow the play → audiate → Show Answer loop, but with rhythm/drum content.
//
//   • Grooves        — random kit grooves drawn from the Drum Patterns
//                       permutation vocabulary, in the selected time signature.
//   • Stickings      — random sticking patterns for the selected time signature.
//   • Transcriptions — real drummer recordings, transcribed by ear.
//
// Time signatures (typical quick-picks + a custom entry) drive Grooves and
// Stickings.  Playback uses real drum samples (drumSampler).

import { useEffect, useRef, useState } from "react";
import { useLS } from "@/lib/storage";
import { generateGroove, meterSpecFor, TYPICAL_METERS, type Groove, type TimeSig } from "@/lib/drumGroove";
import { playGroove, stopGroove, ensureDrumKit } from "@/lib/drumSampler";
import {
  randomizeStickings, buildStickingMeasure, uniformBeamGroups,
  type StickingMeasureData,
} from "@/lib/stickingsData";
import { VexDrumStrip, type StripMeasureData } from "@/components/VexDrumNotation";
import TranscriptionsTab from "./TranscriptionsTab";

type RaTab = "grooves" | "stickings" | "transcriptions";
const RA_TABS: { id: RaTab; label: string }[] = [
  { id: "grooves",        label: "Grooves" },
  { id: "stickings",      label: "Stickings" },
  { id: "transcriptions", label: "Transcriptions" },
];

const ALL_GROUPS = new Set([1, 2, 3, 4, 5, 6, 7]);
const ALL_KICKS = new Set([0, 1, 2, 3]);
const ALL_FAMILIES = new Set(["3k", "single", "double", "paradiddle", "other"]);

function OptSection({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0f0f0f] border border-[#242424] rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: accent }}>{title}</div>
      {children}
    </div>
  );
}

// ── Notation helpers ──────────────────────────────────────────────────────
function grooveStrip(g: Groove): StripMeasureData {
  return {
    grid: g.grid,
    ostinatoHits: g.hhHits, ostinatoOpen: g.hhOpen,
    snareHits: g.snareHits, bassHits: g.bassHits,
    hhFootHits: [], hhFootOpen: [], ghostHits: g.ghostHits, ghostDoubleHits: [],
    slotOverride: g.subdivs, beamGrouping: g.slotsPerBeat,
    showRests: true,
  };
}
function stickingStrip(m: StickingMeasureData, spb: number): StripMeasureData {
  return {
    grid: "16th",
    ostinatoHits: [], ostinatoOpen: [],
    snareHits: m.snareHits, bassHits: m.bassHits,
    hhFootHits: [], hhFootOpen: [], ghostHits: [], ghostDoubleHits: [],
    stickings: m.stickings,
    slotOverride: m.totalSlots, beamGrouping: spb,
    showRests: true, hideGhostParens: true, bassStemUp: true,
  };
}

// ── Time-signature picker (typical buttons + custom entry) ────────────────
function TimeSigPicker({ value, onChange }: { value: TimeSig; onChange: (ts: TimeSig) => void }) {
  const [custom, setCustom] = useState(false);
  const [num, setNum] = useState(value[0]);
  const [den, setDen] = useState(value[1]);
  const isTypical = TYPICAL_METERS.some(([n, d]) => n === value[0] && d === value[1]);
  return (
    <OptSection title="TIME SIGNATURE" accent="#bf6cd0">
      <div className="flex flex-wrap items-center gap-2">
        {TYPICAL_METERS.map(([n, d]) => {
          const on = !custom && value[0] === n && value[1] === d;
          return (
            <button key={`${n}/${d}`} onClick={() => { setCustom(false); onChange([n, d]); }}
              className={`px-3 py-1.5 rounded-md text-sm border transition-colors tabular-nums ${
                on ? "bg-[#1a1a2e] border-[#7173e6] text-[#9999ee]" : "bg-[#141414] border-[#2a2a2a] text-[#666]"
              }`}>
              {n}/{d}
            </button>
          );
        })}
        <span className="w-px h-5 bg-[#2a2a2a] mx-1" />
        <button onClick={() => setCustom(c => !c)}
          className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
            custom || !isTypical ? "bg-[#1a1a2e] border-[#7173e6] text-[#9999ee]" : "bg-[#141414] border-[#2a2a2a] text-[#666]"
          }`}>
          Custom
        </button>
      </div>
      {(custom || !isTypical) && (
        <div className="flex items-center gap-2 mt-3">
          <input type="number" min={1} max={16} value={num} onChange={e => setNum(Math.max(1, Math.min(16, Number(e.target.value) || 1)))}
            className="w-16 bg-[#141414] border border-[#2a2a2a] rounded px-2 py-1 text-sm text-white text-center" />
          <span className="text-[#666]">/</span>
          <select value={den} onChange={e => setDen(Number(e.target.value))}
            className="bg-[#141414] border border-[#2a2a2a] rounded px-2 py-1 text-sm text-white">
            {[2, 4, 8].map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button onClick={() => onChange([num, den])}
            className="px-3 py-1 rounded-md text-xs border bg-[#1a2a1a] border-[#5cbf8a] text-[#9d9]">Apply</button>
        </div>
      )}
    </OptSection>
  );
}

// ── Shared transport ──────────────────────────────────────────────────────
function Transport({ playing, hasItem, showAnswer, onPlay, onStop, onReplay, onToggleAnswer, onNext, nextLabel }: {
  playing: boolean; hasItem: boolean; showAnswer: boolean;
  onPlay: () => void; onStop: () => void; onReplay: () => void; onToggleAnswer: () => void;
  onNext: () => void; nextLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={playing ? onStop : onPlay}
        className={`px-4 py-2 rounded-md text-sm font-semibold border transition-colors ${
          playing ? "bg-[#2a1a1a] border-[#a55] text-[#e99]" : "bg-[#1a2a1a] border-[#5cbf8a] text-[#9d9]"
        }`}>
        {playing ? "Stop" : "Play"}
      </button>
      <button onClick={onReplay} disabled={!hasItem}
        className="px-3 py-2 rounded-md text-sm border bg-[#141414] border-[#2a2a2a] text-[#bbb] hover:border-[#444] disabled:opacity-40">
        Replay
      </button>
      <button onClick={onToggleAnswer} disabled={!hasItem}
        className={`px-3 py-2 rounded-md text-sm border transition-colors disabled:opacity-40 ${
          showAnswer ? "bg-[#1a1a2e] border-[#7173e6] text-[#9999ee]" : "bg-[#141414] border-[#2a2a2a] text-[#bbb] hover:border-[#444]"
        }`}>
        {showAnswer ? "Hide Answer" : "Show Answer"}
      </button>
      <span className="w-px h-5 bg-[#2a2a2a] mx-1" />
      <button onClick={onNext}
        className="px-3 py-2 rounded-md text-sm border bg-[#141414] border-[#2a2a2a] text-[#bbb] hover:border-[#bf6cd0] hover:text-[#d9a]">
        {nextLabel}
      </button>
    </div>
  );
}

export default function RhythmicAudiationTab({ ensureAudio, playVol = 0.8 }: { ensureAudio: () => Promise<void>; playVol?: number }) {
  const [tab, setTab] = useLS<RaTab>("lt_ra_tab", "grooves");
  const [timeSig, setTimeSig] = useLS<TimeSig>("lt_ra_timesig", [4, 4]);
  const [bpm, setBpm] = useLS<number>("lt_ra_bpm", 90);
  const [repeats, setRepeats] = useLS<number>("lt_ra_repeats", 2);
  const [countIn, setCountIn] = useLS<boolean>("lt_ra_countin", true);
  const [metronome, setMetronome] = useLS<boolean>("lt_ra_metro", false);

  const [groove, setGroove] = useState<Groove | null>(null);
  const [sticking, setSticking] = useState<StickingMeasureData | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState("");
  const playRef = useRef<Groove | null>(null);   // the currently-loaded playable groove

  useEffect(() => {
    setStatus("Loading drum samples…");
    ensureDrumKit().then(() => setStatus("")).catch(() => setStatus("Couldn't load drum samples."));
    return () => stopGroove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)generate the current item whenever the tab or time signature changes.
  useEffect(() => {
    if (tab === "grooves") makeGroove();
    else if (tab === "stickings") makeSticking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, timeSig]);

  function makeGroove() {
    stopGroove(); setPlaying(false); setShowAnswer(false);
    const g = generateGroove(timeSig);
    setGroove(g); playRef.current = g;
  }

  function makeSticking() {
    stopGroove(); setPlaying(false); setShowAnswer(false);
    const m = meterSpecFor(timeSig);
    const patterns = randomizeStickings(m.subdivs, "musical", ALL_KICKS, ALL_GROUPS, ALL_FAMILIES);
    if (!patterns) { setSticking(null); playRef.current = null; return; }
    const measure = buildStickingMeasure(patterns, m.subdivs, uniformBeamGroups(m.subdivs, m.slotsPerBeat));
    setSticking(measure);
    // A playable groove: hands → snare, kicks → bass, on the meter's timing.
    playRef.current = {
      timeSig, grid: "16th", subdivs: m.subdivs, slotsPerBeat: m.slotsPerBeat,
      slotQuarters: m.slotQuarters, beats: m.beats,
      hhHits: [], hhOpen: [], snareHits: measure.snareHits, ghostHits: [], bassHits: measure.bassHits,
    };
  }

  async function play() {
    const g = playRef.current;
    if (!g) return;
    stopGroove(); setPlaying(true);
    try {
      await playGroove(g, { bpm, bars: repeats, countInBeats: countIn ? g.beats : 0, metronome, onDone: () => setPlaying(false) });
    } catch { setPlaying(false); setStatus("Playback failed."); }
  }
  function stop() { stopGroove(); setPlaying(false); }

  const m = meterSpecFor(timeSig);
  const cell = m.subdivs > 16 ? 22 : 30;
  const stripW = Math.max(220, m.subdivs * cell);

  return (
    <div className="space-y-4 text-white">
      {/* Sub-tab bar (mirrors Tonal Audiation) */}
      <div className="flex gap-1 flex-wrap items-center">
        {RA_TABS.map(t => (
          <button key={t.id} onClick={() => { stopGroove(); setPlaying(false); setTab(t.id); }}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              tab === t.id ? "bg-[#7173e6] text-white"
                : "bg-[#161616] text-[#666] hover:text-[#aaa] hover:bg-[#1e1e1e] border border-[#2a2a2a]"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {status && <div className="text-xs text-[#9a9] min-h-[1em]">{status}</div>}

      {tab === "transcriptions" ? (
        <TranscriptionsTab ensureAudio={ensureAudio} playVol={playVol} lockSources={["drums"]} />
      ) : (
        <>
          <Transport
            playing={playing} hasItem={tab === "grooves" ? !!groove : !!sticking} showAnswer={showAnswer}
            onPlay={play} onStop={stop} onReplay={play} onToggleAnswer={() => setShowAnswer(s => !s)}
            onNext={tab === "grooves" ? makeGroove : makeSticking}
            nextLabel={tab === "grooves" ? "New groove" : "New stickings"}
          />

          <div className="space-y-2">
            <TimeSigPicker value={timeSig} onChange={setTimeSig} />

            <OptSection title="TEMPO" accent="#e0a040">
              <div className="flex items-center gap-3">
                <label className="text-xs text-[#888] w-16">{bpm} bpm</label>
                <input type="range" min={40} max={200} step={1} value={bpm}
                  onChange={e => setBpm(Number(e.target.value))} className="w-48 accent-[#e0a040]" />
              </div>
              <div className="flex items-center gap-3 mt-3">
                <label className="text-xs text-[#888] w-16">Repeats</label>
                <input type="range" min={1} max={8} step={1} value={repeats}
                  onChange={e => setRepeats(Number(e.target.value))} className="w-40 accent-[#7173e6]" />
                <span className="text-xs text-[#bbb] w-6">{repeats}×</span>
              </div>
            </OptSection>

            <OptSection title="PLAYBACK" accent="#7173e6">
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setCountIn(c => !c)}
                  className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                    countIn ? "bg-[#1a1a2e] border-[#7173e6] text-[#9999ee]" : "bg-[#141414] border-[#2a2a2a] text-[#666]"
                  }`}>
                  Count-in (1 bar)
                </button>
                <button onClick={() => setMetronome(mm => !mm)}
                  className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                    metronome ? "bg-[#1a1a2e] border-[#7173e6] text-[#9999ee]" : "bg-[#141414] border-[#2a2a2a] text-[#666]"
                  }`}>
                  Metronome
                </button>
              </div>
            </OptSection>
          </div>

          {/* Answer reveal */}
          {showAnswer && (
            <div className="bg-[#0f0f0f] border border-[#242424] rounded-lg p-4 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-[#cd6] font-semibold">
                {tab === "grooves" ? "The groove" : "The stickings"}
              </div>
              <div className="bg-[#161616] rounded-md p-3 overflow-x-auto">
                {tab === "grooves" && groove && (
                  <VexDrumStrip measures={[grooveStrip(groove)]} measureWidth={stripW} height={150} showClef />
                )}
                {tab === "stickings" && sticking && (
                  <VexDrumStrip measures={[stickingStrip(sticking, m.slotsPerBeat)]} measureWidth={stripW} height={150} showClef />
                )}
              </div>
              <div className="text-xs text-[#777]">{m.label} · {bpm} bpm</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
