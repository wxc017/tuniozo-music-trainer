// ── Transcriptions tab ──────────────────────────────────────────────
//
// Hear a random N-bar excerpt drawn from four real-world corpora (The
// Session, Essen Folksong, Weimar Jazz DB, CoCoPops/Billboard) and try
// to transcribe it on the spot.  Play a new excerpt, Replay it (or loop
// it), then Show Answer to reveal the title, notation (grand staff w/
// chords above each bar), and a YouTube link.

import { useCallback, useEffect, useRef, useState } from "react";
import { useLS } from "@/lib/storage";
import { SOURCE_LABEL, SOURCE_GENRE, type TxSource, type TxItem, type TxIndex } from "@/lib/transcriptions/types";
import { pickItem, pickExcerpt, loadIndex, stylesForSources, type TxExcerpt } from "@/lib/transcriptions/loader";
import { playExcerpt, stopPlayback, ensureInstruments } from "@/lib/transcriptions/playback";
import TranscriptionNotation from "../transcriptions/TranscriptionNotation";

const ALL_SOURCES: TxSource[] = ["thesession", "essen", "weimar", "cocopops"];

interface Props {
  ensureAudio: () => Promise<void>;
  playVol?: number;
}

export default function TranscriptionsTab({ ensureAudio, playVol = 0.8 }: Props) {
  // ── Options (persisted) ───────────────────────────────────────────
  const [bars, setBars] = useLS<number>("lt_tx_bars", 2);
  const [sources, setSources] = useLS<TxSource[]>("lt_tx_sources", [...ALL_SOURCES]);
  const [styleFilter, setStyleFilter] = useLS<string[]>("lt_tx_styles", []);
  const [withMelody, setWithMelody] = useLS<boolean>("lt_tx_melody", true);
  const [withChords, setWithChords] = useLS<boolean>("lt_tx_chords", true);
  const [tempoMode, setTempoMode] = useLS<"original" | "fixed">("lt_tx_tempoMode", "original");
  const [fixedBpm, setFixedBpm] = useLS<number>("lt_tx_fixedBpm", 90);
  const [countInBars, setCountInBars] = useLS<number>("lt_tx_countbars", 0);
  const [metronome, setMetronome] = useLS<boolean>("lt_tx_metro", false);
  const [loop, setLoop] = useLS<boolean>("lt_tx_loop", false);
  // Practice vs. Options shown as sub-tabs, matching the other Tonal
  // Audiation modes.
  const [view, setView] = useLS<"practice" | "options">("lt_tx_view", "practice");

  // Answer-reveal display toggles (which voices to show in the notation).
  const [revealMelody, setRevealMelody] = useLS<boolean>("lt_tx_reveal_mel", true);
  const [revealChords, setRevealChords] = useLS<boolean>("lt_tx_reveal_chd", true);

  // ── Runtime state ─────────────────────────────────────────────────
  const [index, setIndex] = useState<TxIndex | null>(null);
  const [availableStyles, setAvailableStyles] = useState<string[]>([]);
  const [item, setItem] = useState<TxItem | null>(null);
  const [excerpt, setExcerpt] = useState<TxExcerpt | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const playToken = useRef(0);
  const loopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopRef = useRef(loop);
  loopRef.current = loop;

  useEffect(() => { loadIndex().then(setIndex).catch(() => {}); }, []);
  // Warm up soundfonts + refresh the available style list when sources change.
  useEffect(() => {
    if (!sources.length) { setAvailableStyles([]); return; }
    ensureInstruments(sources).catch(() => {});
    stylesForSources(sources).then(styles => {
      setAvailableStyles(styles);
      setStyleFilter(prev => prev.filter(s => styles.includes(s)));
    }).catch(() => {});
  }, [sources]);
  useEffect(() => () => { stopPlayback(); if (loopTimer.current) clearTimeout(loopTimer.current); }, []);

  const effectiveBpm = (it: TxItem) => (tempoMode === "fixed" ? fixedBpm : it.tempoBpm);

  const cancelLoop = () => { if (loopTimer.current) { clearTimeout(loopTimer.current); loopTimer.current = null; } };

  const playGivenExcerpt = useCallback(async (it: TxItem, ex: TxExcerpt) => {
    const myToken = ++playToken.current;
    cancelLoop();
    setBusy(true);
    setStatus("Loading instrument samples…");
    try {
      await ensureAudio();
      const countInBeats = countInBars * ex.beatsPerBar;
      // Chords (real for jazz/pop, auto-inferred by the loader for folk) are
      // realized into idiomatic comping inside playExcerpt per genre.
      const handle = await playExcerpt(ex, {
        bpm: effectiveBpm(it),
        withMelody: withMelody && (it.melody?.length ?? 0) > 0,
        withChords: withChords && ex.chords.length > 0,
        countInBeats,
        metronome,
        volume: playVol,
      });
      if (myToken !== playToken.current) return;     // superseded
      setStatus(loopRef.current ? "Looping…" : "");
      const spb = 60 / effectiveBpm(it);
      const totalMs = (countInBeats * spb + handle.durationSec) * 1000 + 250;
      loopTimer.current = setTimeout(() => {
        if (myToken !== playToken.current) return;
        if (loopRef.current) playGivenExcerpt(it, ex);   // replay for loop
        else setBusy(false);
      }, totalMs);
    } catch (e) {
      if (myToken === playToken.current) { setStatus(`Playback error: ${String(e)}`); setBusy(false); }
    }
  }, [ensureAudio, withMelody, withChords, countInBars, metronome, playVol, tempoMode, fixedBpm]);

  const playNew = useCallback(async () => {
    cancelLoop();
    stopPlayback();
    setShowAnswer(false);
    if (!sources.length) { setStatus("Select at least one database in Options."); return; }
    setBusy(true);
    setStatus("Finding an excerpt…");
    const picked = await pickItem({
      sources,
      minBars: bars,
      requireChords: withChords && !withMelody,
      styles: styleFilter,
    });
    if (!picked) {
      setBusy(false);
      setStatus(`No tunes match (need ≥ ${bars} bars). Try fewer bars, more databases, or clearing the style filter.`);
      return;
    }
    const ex = pickExcerpt(picked, bars);   // loader auto-harmonizes melody-only tunes
    setItem(picked);
    setExcerpt(ex);
    await playGivenExcerpt(picked, ex);
  }, [sources, bars, withChords, withMelody, styleFilter, playGivenExcerpt]);

  const replay = useCallback(async () => {
    cancelLoop();
    stopPlayback();
    if (item && excerpt) await playGivenExcerpt(item, excerpt);
    else await playNew();
  }, [item, excerpt, playGivenExcerpt, playNew]);

  const stop = () => { playToken.current++; cancelLoop(); stopPlayback(); setBusy(false); setStatus(""); };

  const toggleSource = (s: TxSource) =>
    setSources(prev => (prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]));
  const toggleStyle = (s: string) =>
    setStyleFilter(prev => (prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]));

  // ── UI ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 text-white">
      {/* Sub-tabs — Practice / Options (like other Tonal Audiation modes) */}
      <div className="flex gap-1">
        {(["practice", "options"] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            style={{
              padding: "6px 16px", borderRadius: 6,
              border: `1px solid ${v === view ? "#7173e6" : "#222"}`,
              background: v === view ? "#1a1a2e" : "#111",
              color: v === view ? "#9999ee" : "#666",
              fontSize: 12, cursor: "pointer", transition: "all 0.15s",
            }}>
            {v === "practice" ? "Practice" : "Options"}
          </button>
        ))}
      </div>

      {view === "practice" && (<>
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
        <button onClick={stop}
          className="px-3 py-2 rounded-md text-sm bg-[#1a1a1a] border border-[#333] text-[#888] hover:border-[#555] transition-colors">
          ■ Stop
        </button>
        <button onClick={() => setLoop(l => !l)}
          title="Repeat the excerpt continuously"
          className={`px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
            loop ? "bg-[#1a1a2e] border-[#7173e6] text-[#9999ee]" : "bg-[#1a1a1a] border-[#333] text-[#888] hover:border-[#555]"
          }`}>
          ⟳ Loop
        </button>
        <button onClick={() => setShowAnswer(s => !s)} disabled={!excerpt}
          className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors disabled:opacity-40 ${
            showAnswer ? "bg-[#2a2a1a] border-[#8a7] text-[#cd6]" : "bg-[#1a1a1a] border-[#333] text-[#bbb] hover:border-[#555]"
          }`}>
          {showAnswer ? "Hide Answer" : "Show Answer"}
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
      </>)}

      {/* Options panel (its own sub-tab) */}
      {view === "options" && (
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

          {/* Style / genre sub-filter */}
          {availableStyles.length > 0 && (
            <div>
              <div className="text-xs text-[#888] mb-1.5 flex items-center gap-2">
                Styles
                <span className="text-[10px] text-[#555]">
                  {styleFilter.length ? `${styleFilter.length} selected` : "any"}
                </span>
                {styleFilter.length > 0 && (
                  <button onClick={() => setStyleFilter([])}
                    className="text-[10px] text-[#7aa] hover:text-[#9cc] underline">clear</button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {availableStyles.map(st => {
                  const on = styleFilter.includes(st);
                  return (
                    <button key={st} onClick={() => toggleStyle(st)}
                      className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                        on ? "bg-[#1a2a1a] border-[#6a8] text-[#9d9]" : "bg-[#141414] border-[#2a2a2a] text-[#777]"
                      }`}>
                      {st}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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

          {/* Count-in + metronome */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-[#888] w-28">Count-in</span>
            {[0, 1, 2].map(n => (
              <label key={n} className="flex items-center gap-1.5 text-xs text-[#bbb] cursor-pointer">
                <input type="radio" name="txCountIn" checked={countInBars === n} onChange={() => setCountInBars(n)} className="accent-[#7173e6]" />
                {n === 0 ? "None" : `${n} bar${n > 1 ? "s" : ""}`}
              </label>
            ))}
            <span className="w-px h-4 bg-[#2a2a2a]" />
            <label className="flex items-center gap-1.5 text-xs text-[#bbb] cursor-pointer">
              <input type="checkbox" checked={metronome} onChange={e => setMetronome(e.target.checked)} className="accent-[#7173e6]" /> Metronome
            </label>
          </div>
        </div>
      )}

      {/* Answer reveal */}
      {view === "practice" && showAnswer && item && excerpt && (
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

          {/* Notation voice toggles */}
          <div className="flex items-center gap-4 text-xs">
            <span className="text-[#888]">Show</span>
            <label className="flex items-center gap-1.5 text-[#bbb] cursor-pointer">
              <input type="checkbox" checked={revealMelody} onChange={e => setRevealMelody(e.target.checked)} className="accent-[#7173e6]" /> Melody
            </label>
            <label className={`flex items-center gap-1.5 cursor-pointer ${excerpt.chords.length ? "text-[#bbb]" : "text-[#555]"}`}>
              <input type="checkbox" checked={revealChords} disabled={!excerpt.chords.length}
                onChange={e => setRevealChords(e.target.checked)} className="accent-[#7173e6]" /> Chords
            </label>
          </div>

          <div className="bg-[#161616] rounded-md p-2 overflow-x-auto">
            <TranscriptionNotation excerpt={excerpt} showMelody={revealMelody} showChords={revealChords} />
          </div>

          <div className="text-xs text-[#777]">
            Bars {excerpt.startBar + 1}–{excerpt.startBar + excerpt.bars} of {item.barCount} ·
            {" "}{item.timeSig[0]}/{item.timeSig[1]} · {item.tempoBpm} bpm original
          </div>
        </div>
      )}
    </div>
  );
}
