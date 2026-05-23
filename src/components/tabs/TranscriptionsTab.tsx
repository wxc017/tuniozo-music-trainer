// ── Transcriptions tab ──────────────────────────────────────────────
//
// Hear a random N-bar excerpt drawn from four real-world corpora (The
// Session, Essen Folksong, Weimar Jazz DB, CoCoPops/Billboard) and try
// to transcribe it on the spot.  Play a new excerpt, Replay it (or loop
// it), then Show Answer to reveal the title, notation (grand staff w/
// chords above each bar), and a YouTube link.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLS } from "@/lib/storage";
import { SOURCE_LABEL, SOURCE_GENRE, type TxSource, type TxItem, type TxIndex } from "@/lib/transcriptions/types";
import { pickItem, pickExcerpt, fullExcerpt, loadIndex, stylesForSources, type TxExcerpt } from "@/lib/transcriptions/loader";
import { playExcerpt, stopPlayback, ensureInstruments } from "@/lib/transcriptions/playback";
import TranscriptionNotation from "../transcriptions/TranscriptionNotation";

const ALL_SOURCES: TxSource[] = ["thesession", "essen", "weimar", "cocopops", "ewld", "blues"];

/** Add spaces to run-together titles from filename-derived data, e.g.
 *  "25Or6To4" → "25 Or 6 To 4", "HoneyHoney" → "Honey Honey". */
function prettyTitle(t: string): string {
  return t
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

interface Props {
  ensureAudio: () => Promise<void>;
  playVol?: number;
}

/** Collapsible options section, styled to match the other modes
 *  (accent bar + ▸/▾ disclosure + uppercase tracking-wide label). */
function OptSection({ title, accent, defaultOpen = true, children }: {
  title: string; accent: string; defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded">
      <div onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none transition-colors hover:bg-[#161616]"
        style={{ borderLeft: `3px solid ${accent}` }}>
        <span className="text-[10px] text-[#666] w-3">{open ? "▾" : "▸"}</span>
        <span className="text-xs font-semibold tracking-wider" style={{ color: accent }}>{title}</span>
      </div>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
}

export default function TranscriptionsTab({ ensureAudio, playVol = 0.8 }: Props) {
  // ── Options (persisted) ───────────────────────────────────────────
  const [bars, setBars] = useLS<number>("lt_tx_bars", 2);
  const [sources, setSources] = useLS<TxSource[]>("lt_tx_sources", [...ALL_SOURCES]);
  const [styleFilter, setStyleFilter] = useLS<string[]>("lt_tx_styles", []);
  const [withMelody, setWithMelody] = useLS<boolean>("lt_tx_melody", true);
  const [withChords, setWithChords] = useLS<boolean>("lt_tx_chords", true);
  const [withBass, setWithBass] = useLS<boolean>("lt_tx_bass", false);
  const [countInBars, setCountInBars] = useLS<number>("lt_tx_countbars", 0);
  const [metronome, setMetronome] = useLS<boolean>("lt_tx_metro", false);
  // Playback tempo for Play / Replay / Full song. 0 = follow the tune's
  // original tempo; otherwise an override set by the BPM control in the
  // transport row (applies to all three).
  const [bpm, setBpm] = useLS<number>("lt_tx_bpm", 0);

  // Answer-reveal display toggles (which voices to show in the notation).

  // ── Runtime state ─────────────────────────────────────────────────
  const [index, setIndex] = useState<TxIndex | null>(null);
  const [availableStyles, setAvailableStyles] = useState<string[]>([]);
  const [item, setItem] = useState<TxItem | null>(null);
  const [excerpt, setExcerpt] = useState<TxExcerpt | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const playToken = useRef(0);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  useEffect(() => () => { stopPlayback(); if (endTimer.current) clearTimeout(endTimer.current); }, []);

  // 0 = play at the tune's own tempo; any positive value overrides it.
  const effectiveBpm = (it: TxItem) => (bpm > 0 ? bpm : it.tempoBpm);

  const clearEndTimer = () => { if (endTimer.current) { clearTimeout(endTimer.current); endTimer.current = null; } };

  const playGivenExcerpt = useCallback(async (it: TxItem, ex: TxExcerpt) => {
    const myToken = ++playToken.current;
    clearEndTimer();
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
        withBass: withBass && ex.chords.length > 0,
        countInBeats,
        metronome,
        volume: playVol,
      });
      if (myToken !== playToken.current) return;     // superseded
      setStatus("");
      const spb = 60 / effectiveBpm(it);
      const totalMs = (countInBeats * spb + handle.durationSec) * 1000 + 250;
      endTimer.current = setTimeout(() => { if (myToken === playToken.current) setBusy(false); }, totalMs);
    } catch (e) {
      if (myToken === playToken.current) { setStatus(`Playback error: ${String(e)}`); setBusy(false); }
    }
  }, [ensureAudio, withMelody, withChords, withBass, countInBars, metronome, playVol, bpm]);

  const playNew = useCallback(async () => {
    clearEndTimer();
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
    clearEndTimer();
    stopPlayback();
    if (item && excerpt) await playGivenExcerpt(item, excerpt);
    else await playNew();
  }, [item, excerpt, playGivenExcerpt, playNew]);

  const playFull = useCallback(async () => {
    if (!item) return;
    clearEndTimer();
    stopPlayback();
    await playGivenExcerpt(item, fullExcerpt(item));   // whole tune; leaves the excerpt target intact
  }, [item, playGivenExcerpt]);

  const stop = () => { playToken.current++; clearEndTimer(); stopPlayback(); setBusy(false); setStatus(""); };

  // BPM shown in the transport: the override if set, else the current tune's tempo.
  const curTempo = excerpt?.item.tempoBpm ?? item?.tempoBpm ?? 100;
  const displayBpm = bpm > 0 ? bpm : Math.round(curTempo);

  const toggleSource = (s: TxSource) =>
    setSources(prev => (prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]));
  const toggleStyle = (s: string) =>
    setStyleFilter(prev => (prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]));

  // ── UI ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 text-white">
      {status && <div className="text-xs text-[#9a9] min-h-[1em]">{status}</div>}

      {/* Now-playing chip (no spoilers until Show Answer) */}
      {excerpt && (
        <div className="text-xs text-[#666]">
          {SOURCE_GENRE[excerpt.item.source]} · {excerpt.bars} bar{excerpt.bars > 1 ? "s" : ""} ·
          {" "}{excerpt.item.timeSig[0]}/{excerpt.item.timeSig[1]} · {Math.round(effectiveBpm(excerpt.item))} bpm
        </div>
      )}

      {/* Options — always visible, collapsible accent sections */}
      <div className="space-y-2">
          <OptSection title="EXCERPT" accent="#bf6cd0">
            <div className="flex items-center gap-3">
              <label className="text-xs text-[#888] w-28">Bars per excerpt</label>
              <input type="range" min={1} max={8} step={1} value={bars}
                onChange={e => setBars(Number(e.target.value))} className="w-40 accent-[#7173e6]" />
              <span className="text-xs text-[#bbb] w-6">{bars}</span>
            </div>
          </OptSection>

          <OptSection title="DATABASES" accent="#7173e6">
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
          </OptSection>

          {availableStyles.length > 0 && (
            <OptSection title="STYLES" accent="#5cbf8a">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-[10px] text-[#555]">{styleFilter.length ? `${styleFilter.length} selected` : "any"}</span>
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
            </OptSection>
          )}

          <OptSection title="PLAYBACK" accent="#e0a040">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs text-[#888] w-28">Voices</span>
              {([
                ["Melody", withMelody, setWithMelody],
                ["Chords", withChords, setWithChords],
                ["Bass", withBass, setWithBass],
              ] as const).map(([label, on, set]) => (
                <button key={label} onClick={() => set(v => !v)}
                  className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                    on ? "bg-[#1a1a2e] border-[#7173e6] text-[#9999ee]" : "bg-[#141414] border-[#2a2a2a] text-[#666]"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
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
          </OptSection>
      </div>

      {/* Answer reveal */}
      {showAnswer && item && excerpt && (
        <div className="bg-[#0f0f0f] border border-[#242424] rounded-lg p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              {item.source === "weimar" ? (
                <>
                  <div className="text-[10px] uppercase tracking-wider text-[#cd6] font-semibold">Transcribed solo</div>
                  <div className="text-base font-semibold text-white">
                    {item.artist ? `${item.artist}'s solo` : "Solo"}
                  </div>
                  <div className="text-xs text-[#888]">on “{prettyTitle(item.title)}” (original tune)</div>
                </>
              ) : (
                <>
                  <div className="text-base font-semibold text-white">{prettyTitle(item.title)}</div>
                  {item.artist && <div className="text-xs text-[#888]">{item.artist}</div>}
                </>
              )}
            </div>
            <div className="text-xs text-[#666] text-right">
              {SOURCE_LABEL[item.source]} · {item.genre}{item.style ? ` · ${item.style}` : ""}
            </div>
          </div>

          <div className="bg-[#161616] rounded-md p-2 overflow-x-auto">
            <TranscriptionNotation excerpt={excerpt} showMelody={withMelody} showChords={withChords} showBass={withBass} />
          </div>

          <div className="text-xs text-[#777]">
            Bars {excerpt.startBar + 1}–{excerpt.startBar + excerpt.bars} of {item.barCount} ·
            {" "}{item.timeSig[0]}/{item.timeSig[1]} · {item.tempoBpm} bpm original
          </div>
        </div>
      )}

      {/* Transport — at the bottom */}
      <div className="flex flex-wrap gap-2 items-center pt-1">
        <button onClick={playNew} disabled={busy}
          className="px-5 py-2 rounded-md text-sm font-semibold bg-[#7173e6] text-white hover:bg-[#5d5fd0] disabled:opacity-50 transition-colors">
          ▶ Play
        </button>
        <button onClick={replay} disabled={busy || !excerpt}
          className="px-4 py-2 rounded-md text-sm font-medium bg-[#1a1a1a] border border-[#333] text-[#bbb] hover:border-[#555] disabled:opacity-40 transition-colors">
          ↻ Replay
        </button>
        <button onClick={playFull} disabled={busy || !item}
          title="Play the whole tune from the top"
          className="px-4 py-2 rounded-md text-sm font-medium bg-[#1a1a1a] border border-[#333] text-[#bbb] hover:border-[#555] disabled:opacity-40 transition-colors">
          ♫ Full song
        </button>
        {/* Tempo — applies to Play, Replay and Full song */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#1a1a1a] border border-[#333]" title="Playback tempo for Play / Replay / Full song">
          <span className="text-[10px] text-[#888]">BPM</span>
          <input type="range" min={40} max={240} step={1} value={displayBpm}
            onChange={e => setBpm(Number(e.target.value))} className="w-24 accent-[#7173e6]" />
          <span className="text-xs text-[#bbb] w-8 text-right tabular-nums">{displayBpm}</span>
          {bpm > 0 && (
            <button onClick={() => setBpm(0)} title="Reset to the tune's original tempo"
              className="text-[10px] text-[#7aa] hover:text-[#9cc]">orig</button>
          )}
        </div>
        <button onClick={stop}
          className="px-3 py-2 rounded-md text-sm bg-[#1a1a1a] border border-[#333] text-[#888] hover:border-[#555] transition-colors">
          ■ Stop
        </button>
        <button onClick={() => setShowAnswer(true)} disabled={!excerpt || showAnswer}
          className="px-4 py-2 rounded-md text-sm font-medium border border-[#333] bg-[#1a1a1a] text-[#bbb] hover:border-[#555] transition-colors disabled:opacity-40">
          Show Answer
        </button>
      </div>
    </div>
  );
}
