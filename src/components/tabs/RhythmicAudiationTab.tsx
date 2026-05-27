// ── Rhythmic Audiation · Drum Transcription ───────────────────────────────
//
// The rhythm counterpart to Tonal Audiation's Transcriptions tab: hear a
// generated drum groove (real samples), audiate it, then Show Answer to check
// against the drum notation.  4/4 only for now — time signatures are a
// planned follow-up.

import { useEffect, useRef, useState } from "react";
import { useLS } from "@/lib/storage";
import { generateGroove, LEVEL_INFO, type Groove, type GrooveLevel } from "@/lib/drumGroove";
import { playGroove, stopGroove, ensureDrumKit } from "@/lib/drumSampler";
import DrumNotation from "../DrumNotation";

function OptSection({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0f0f0f] border border-[#242424] rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: accent }}>{title}</div>
      {children}
    </div>
  );
}

export default function RhythmicAudiationTab() {
  const [level, setLevel] = useLS<GrooveLevel>("lt_ra_level", "basic");
  const [bpm, setBpm] = useLS<number>("lt_ra_bpm", 90);
  const [repeats, setRepeats] = useLS<number>("lt_ra_repeats", 2);
  const [countIn, setCountIn] = useLS<boolean>("lt_ra_countin", true);
  const [metronome, setMetronome] = useLS<boolean>("lt_ra_metro", false);

  const [groove, setGroove] = useState<Groove | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState("");
  const grooveRef = useRef<Groove | null>(null);

  // Warm the sampler up front (first Play is then instant) + first groove.
  useEffect(() => {
    setStatus("Loading drum samples…");
    ensureDrumKit().then(() => setStatus("")).catch(() => setStatus("Couldn't load drum samples."));
    newGroove();
    return () => stopGroove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function newGroove() {
    stopGroove();
    setPlaying(false);
    const g = generateGroove(level);
    grooveRef.current = g;
    setGroove(g);
    setShowAnswer(false);
  }

  async function play() {
    const g = grooveRef.current;
    if (!g) return;
    stopGroove();
    setPlaying(true);
    try {
      await playGroove(g, {
        bpm, bars: repeats,
        countInBeats: countIn ? 4 : 0,
        metronome,
        onDone: () => setPlaying(false),
      });
    } catch {
      setPlaying(false);
      setStatus("Playback failed.");
    }
  }

  function stop() { stopGroove(); setPlaying(false); }

  return (
    <div className="space-y-4 text-white">
      <div className="text-xs text-[#666] min-h-[1em]">
        {status || "Real drum samples · transcribe the groove by ear, then Show Answer · 4/4"}
      </div>

      {/* Transport */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={playing ? stop : play}
          className={`px-4 py-2 rounded-md text-sm font-semibold border transition-colors ${
            playing ? "bg-[#2a1a1a] border-[#a55] text-[#e99]" : "bg-[#1a2a1a] border-[#5cbf8a] text-[#9d9]"
          }`}>
          {playing ? "Stop" : "Play"}
        </button>
        <button onClick={play} disabled={!groove}
          className="px-3 py-2 rounded-md text-sm border bg-[#141414] border-[#2a2a2a] text-[#bbb] hover:border-[#444] disabled:opacity-40">
          Replay
        </button>
        <button onClick={() => setShowAnswer(s => !s)} disabled={!groove}
          className={`px-3 py-2 rounded-md text-sm border transition-colors disabled:opacity-40 ${
            showAnswer ? "bg-[#1a1a2e] border-[#7173e6] text-[#9999ee]" : "bg-[#141414] border-[#2a2a2a] text-[#bbb] hover:border-[#444]"
          }`}>
          {showAnswer ? "Hide Answer" : "Show Answer"}
        </button>
        <span className="w-px h-5 bg-[#2a2a2a] mx-1" />
        <button onClick={newGroove}
          className="px-3 py-2 rounded-md text-sm border bg-[#141414] border-[#2a2a2a] text-[#bbb] hover:border-[#bf6cd0] hover:text-[#d9a]">
          New groove
        </button>
      </div>

      {/* Options */}
      <div className="space-y-2">
        <OptSection title="DIFFICULTY" accent="#bf6cd0">
          <div className="flex flex-wrap gap-2">
            {LEVEL_INFO.map(l => {
              const on = level === l.value;
              return (
                <button key={l.value} onClick={() => { setLevel(l.value); }}
                  className={`px-3 py-1.5 rounded-md text-xs border transition-colors text-left ${
                    on ? "bg-[#1a1a2e] border-[#7173e6] text-[#9999ee]" : "bg-[#141414] border-[#2a2a2a] text-[#666]"
                  }`}>
                  {l.label}
                  <span className="block text-[10px] opacity-60">{l.desc}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 text-[10px] text-[#666]">Changing difficulty applies to the next “New groove”.</div>
        </OptSection>

        <OptSection title="TEMPO" accent="#e0a040">
          <div className="flex items-center gap-3">
            <label className="text-xs text-[#888] w-16">{bpm} bpm</label>
            <input type="range" min={50} max={180} step={1} value={bpm}
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
            <button onClick={() => setMetronome(m => !m)}
              className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                metronome ? "bg-[#1a1a2e] border-[#7173e6] text-[#9999ee]" : "bg-[#141414] border-[#2a2a2a] text-[#666]"
              }`}>
              Metronome
            </button>
          </div>
        </OptSection>
      </div>

      {/* Answer reveal */}
      {showAnswer && groove && (
        <div className="bg-[#0f0f0f] border border-[#242424] rounded-lg p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-[#cd6] font-semibold">The groove</div>
          <div className="bg-[#161616] rounded-md p-3 overflow-x-auto">
            <DrumNotation
              grid={groove.grid}
              hhHits={groove.hhHits}
              hhOpen={groove.hhOpen}
              snareHits={groove.snareHits}
              ghostHits={groove.ghostHits}
              bassHits={groove.bassHits}
              cellWidth={26}
            />
          </div>
          <div className="text-xs text-[#777]">{groove.timeSig[0]}/{groove.timeSig[1]} · {bpm} bpm · {LEVEL_INFO.find(l => l.value === level)?.label}</div>
        </div>
      )}
    </div>
  );
}
