// ── Transcriptions tab ──────────────────────────────────────────────
//
// Hear a random N-bar excerpt drawn from four real-world corpora (The
// Session, Essen Folksong, Weimar Jazz DB, CoCoPops/Billboard) and try
// to transcribe it on the spot.  Play a new excerpt, Replay it, then
// Show Answer to reveal the title, notation (grand staff w/ chords above
// each bar), and a YouTube link.

import { useCallback, useEffect, useRef, useState } from "react";
import { useLS } from "@/lib/storage";
import { SOURCE_LABEL, SOURCE_GENRE, type TxSource, type TxItem, type TxIndex } from "@/lib/transcriptions/types";
import { pickItem, pickExcerpt, loadIndex, type TxExcerpt } from "@/lib/transcriptions/loader";
import { playExcerpt, stopPlayback, ensureInstruments } from "@/lib/transcriptions/playback";
import TranscriptionNotation from "../transcriptions/TranscriptionNotation";

const ALL_SOURCES: TxSource[] = ["thesession", "essen", "weimar", "cocopops"];

interface Props {
  ensureAudio: () => Promise<void>;
  playVol?: number;
}

function youtubeUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export default function TranscriptionsTab({ ensureAudio, playVol = 0.8 }: Props) {
  // ── Options (persisted) ───────────────────────────────────────────
  const [bars, setBars] = useLS<number>("lt_tx_bars", 2);
  const [sources, setSources] = useLS<TxSource[]>("lt_tx_sources", [...ALL_SOURCES]);
  const [withMelody, setWithMelody] = useLS<boolean>("lt_tx_melody", true);
  const [withChords, setWithChords] = useLS<boolean>("lt_tx_chords", true);
  const [tempoMode, setTempoMode] = useLS<"original" | "fixed">("lt_tx_tempoMode", "original");
  const [fixedBpm, setFixedBpm] = useLS<number>("lt_tx_fixedBpm", 90);
  const [countIn, setCountIn] = useLS<boolean>("lt_tx_countin", true);
  const [metronome, setMetronome] = useLS<boolean>("lt_tx_metro", false);
  const [showOptions, setShowOptions] = useState(false);

  // ── Runtime state ─────────────────────────────────────────────────
  const [index, setIndex] = useState<TxIndex | null>(null);
  const [item, setItem] = useState<TxItem | null>(null);
  const [excerpt, setExcerpt] = useState<TxExcerpt | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const playToken = useRef(0);

  useEffect(() => { loadIndex().then(setIndex).catch(() => {}); }, []);
  // Warm up the soundfonts for the enabled sources so the first Play is snappy.
  useEffect(() => { if (sources.length) ensureInstruments(sources).catch(() => {}); }, [sources]);
  useEffect(() => () => { stopPlayback(); }, []);

  const effectiveBpm = (it: TxItem) => (tempoMode === "fixed" ? fixedBpm : it.tempoBpm);

  const playGivenExcerpt = useCallback(async (it: TxItem, ex: TxExcerpt) => {
    const myToken = ++playToken.current;
    setBusy(true);
    setStatus("Loading instrument samples…");
    try {
      await ensureAudio();
      const handle = await playExcerpt(ex, {
        bpm: effectiveBpm(it),
        withMelody: withMelody && (it.melody?.length ?? 0) > 0,
        withChords: withChords && (it.chords?.length ?? 0) > 0,
        countInBeats: countIn ? ex.beatsPerBar : 0,
        metronome,
        volume: playVol,
      });
      if (myToken !== playToken.current) return;     // superseded
      setStatus("");
      setTimeout(() => { if (myToken === playToken.current) setBusy(false); }, handle.durationSec * 1000 + 300);
    } catch (e) {
      if (myToken === playToken.current) { setStatus(`Playback error: ${String(e)}`); setBusy(false); }
    }
  }, [ensureAudio, withMelody, withChords, countIn, metronome, playVol, tempoMode, fixedBpm]);

  const playNew = useCallback(async () => {
    stopPlayback();
    setShowAnswer(false);
    if (!sources.length) { setStatus("Select at least one database in Options."); return; }
    setBusy(true);
    setStatus("Finding an excerpt…");
    const picked = await pickItem({
      sources,
      minBars: bars,
      requireChords: withChords && !withMelody,
    });
    if (!picked) {
      setBusy(false);
      setStatus(`No tunes match (need ≥ ${bars} bars). Try fewer bars or more databases.`);
      return;
    }
    const ex = pickExcerpt(picked, bars);
    setItem(picked);
    setExcerpt(ex);
    await playGivenExcerpt(picked, ex);
  }, [sources, bars, withChords, withMelody, playGivenExcerpt]);

  const replay = useCallback(async () => {
    stopPlayback();
    if (item && excerpt) await playGivenExcerpt(item, excerpt);
    else await playNew();
  }, [item, excerpt, playGivenExcerpt, playNew]);

  const toggleSource = (s: TxSource) =>
    setSources(prev => (prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]));

  // ── UI ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 text-white">
      <p className="text-xs text-[#777] leading-relaxed">
        Hear a random passage and transcribe it. <span className="text-[#999]">Play</span> a new excerpt,
        {" "}<span className="text-[#999]">Replay</span> to hear it again, then <span className="text-[#999]">Show Answer</span>{" "}
        to check the notation and find the source on YouTube.
      </p>

      {/* Transport */}
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={playNew} disabled={busy}
          className="px-5 py-2 rounded-md text-sm font-semibold bg-[#7173e6] text-white hover:bg-[#5d5fd0] disabled:opacity-50 transition-colors">
          ▶ Play
        </button>
        <button onClick={replay} disabled={busy || !excerpt}
          className="px-4 py-2 rounded-md text-sm font-medium bg-[#1a1a1a] border border-[#333] text-[#bbb] hover:border-[#555] disabled:opacity-40 transition-colors">
          ↻ Replay
        </button>
        <button onClick={() => { stopPlayback(); setBusy(false); }}
          className="px-3 py-2 rounded-md text-sm bg-[#1a1a1a] border border-[#333] text-[#888] hover:border-[#555] transition-colors">
          ■ Stop
        </button>
        <button onClick={() => setShowAnswer(s => !s)} disabled={!excerpt}
          className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors disabled:opacity-40 ${
            showAnswer ? "bg-[#2a2a1a] border-[#8a7] text-[#cd6]" : "bg-[#1a1a1a] border-[#333] text-[#bbb] hover:border-[#555]"
          }`}>
          {showAnswer ? "Hide Answer" : "Show Answer"}
        </button>
        <button onClick={() => setShowOptions(o => !o)}
          className="ml-auto px-3 py-2 rounded-md text-xs bg-[#1a1a1a] border border-[#333] text-[#888] hover:border-[#555] transition-colors">
          ⚙ Options
        </button>
      </div>

      {status && <div className="text-xs text-[#9a9] min-h-[1em]">{status}</div>}

      {/* Now-playing chip (no spoilers until Show Answer) */}
      {excerpt && (
        <div className="text-xs text-[#666]">
          {SOURCE_GENRE[excerpt.item.source]} · {excerpt.bars} bar{excerpt.bars > 1 ? "s" : ""} ·
          {" "}{excerpt.item.timeSig[0]}/{excerpt.item.timeSig[1]} · {Math.round(effectiveBpm(excerpt.item))} bpm
        </div>
      )}

      {/* Options panel */}
      {showOptions && (
        <div className="bg-[#111] border border-[#222] rounded-lg p-4 space-y-4">
          {/* Bars */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-[#888] w-28">Bars per excerpt</label>
            <input type="range" min={1} max={8} step={1} value={bars}
              onChange={e => setBars(Number(e.target.value))} className="w-40 accent-[#7173e6]" />
            <span className="text-xs text-[#bbb] w-6">{bars}</span>
          </div>

          {/* Databases / genres */}
          <div>
            <div className="text-xs text-[#888] mb-1.5">Databases</div>
            <div className="flex flex-wrap gap-2">
              {ALL_SOURCES.map(s => {
                const on = sources.includes(s);
                const count = index?.counts[s] ?? 0;
                return (
                  <button key={s} onClick={() => toggleSource(s)}
                    className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                      on ? "bg-[#1a1a2e] border-[#7173e6] text-[#9999ee]" : "bg-[#141414] border-[#2a2a2a] text-[#666]"
                    }`}>
                    {SOURCE_LABEL[s]}
                    <span className="block text-[10px] opacity-60">{SOURCE_GENRE[s]} · {count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Voices */}
          <div className="flex items-center gap-4">
            <span className="text-xs text-[#888] w-28">Play</span>
            <label className="flex items-center gap-1.5 text-xs text-[#bbb] cursor-pointer">
              <input type="checkbox" checked={withMelody} onChange={e => setWithMelody(e.target.checked)} className="accent-[#7173e6]" /> Melody
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#bbb] cursor-pointer">
              <input type="checkbox" checked={withChords} onChange={e => setWithChords(e.target.checked)} className="accent-[#7173e6]" /> Chords
            </label>
          </div>

          {/* Tempo */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-[#888] w-28">Tempo</span>
            <label className="flex items-center gap-1.5 text-xs text-[#bbb] cursor-pointer">
              <input type="radio" name="txTempo" checked={tempoMode === "original"} onChange={() => setTempoMode("original")} className="accent-[#7173e6]" /> Original
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#bbb] cursor-pointer">
              <input type="radio" name="txTempo" checked={tempoMode === "fixed"} onChange={() => setTempoMode("fixed")} className="accent-[#7173e6]" /> Fixed
            </label>
            {tempoMode === "fixed" && (
              <>
                <input type="range" min={40} max={220} step={2} value={fixedBpm}
                  onChange={e => setFixedBpm(Number(e.target.value))} className="w-32 accent-[#7173e6]" />
                <span className="text-xs text-[#bbb] w-12">{fixedBpm} bpm</span>
              </>
            )}
          </div>

          {/* Click options */}
          <div className="flex items-center gap-4">
            <span className="text-xs text-[#888] w-28">Click</span>
            <label className="flex items-center gap-1.5 text-xs text-[#bbb] cursor-pointer">
              <input type="checkbox" checked={countIn} onChange={e => setCountIn(e.target.checked)} className="accent-[#7173e6]" /> Count-in bar
            </label>
            <label className="flex items-center gap-1.5 text-xs text-[#bbb] cursor-pointer">
              <input type="checkbox" checked={metronome} onChange={e => setMetronome(e.target.checked)} className="accent-[#7173e6]" /> Metronome
            </label>
          </div>
        </div>
      )}

      {/* Answer reveal */}
      {showAnswer && item && excerpt && (
        <div className="bg-[#0f0f0f] border border-[#242424] rounded-lg p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <div className="text-base font-semibold text-white">{item.title}</div>
              {item.artist && <div className="text-xs text-[#888]">{item.artist}</div>}
            </div>
            <div className="text-xs text-[#666] text-right">
              {SOURCE_LABEL[item.source]} · {item.genre}{item.style ? ` · ${item.style}` : ""}
            </div>
          </div>

          <div className="bg-[#161616] rounded-md p-2 overflow-x-auto">
            <TranscriptionNotation excerpt={excerpt} />
          </div>

          <div className="text-xs text-[#777]">
            Bars {excerpt.startBar + 1}–{excerpt.startBar + excerpt.bars} of {item.barCount} ·
            {" "}{item.timeSig[0]}/{item.timeSig[1]} · {item.tempoBpm} bpm original
          </div>

          <a href={youtubeUrl(item.youtubeQuery)} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-[#2a1414] border border-[#a44] text-[#e88] hover:bg-[#3a1a1a] transition-colors">
            ▶ Find “{item.youtubeQuery}” on YouTube
          </a>
        </div>
      )}
    </div>
  );
}
