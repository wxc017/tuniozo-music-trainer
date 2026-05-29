// ── Transcriptions tab ──────────────────────────────────────────────
//
// Hear a random N-bar excerpt drawn from four real-world corpora (The
// Session, Essen Folksong, Weimar Jazz DB, CoCoPops/Billboard) and try
// to transcribe it on the spot.  Play a new excerpt, Replay it (or loop
// it), then Show Answer to reveal the title, notation (grand staff w/
// chords above each bar), and a YouTube link.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLS } from "@/lib/storage";
import { SOURCE_LABEL, SOURCE_GENRE, isAudioSource, type TxSource, type TxItem, type TxIndex } from "@/lib/transcriptions/types";
import { pickItem, pickExcerpt, fullExcerpt, sliceExcerpt, loadIndex, loadItemById, stylesForSources, type TxExcerpt } from "@/lib/transcriptions/loader";
import { playExcerpt, stopPlayback, ensureInstruments, playTonicDrone } from "@/lib/transcriptions/playback";
import TranscriptionNotation from "../transcriptions/TranscriptionNotation";

const ALL_SOURCES: TxSource[] = ["thesession", "essen", "weimar", "cocopops", "ewld", "bluesguitar", "bluesvocal", "drums"];
const BASE = import.meta.env.BASE_URL ?? "/";

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
  /** When set, the tab is locked to these sources (the DATABASES picker is
   *  hidden) — used to embed a single-corpus view, e.g. the drums-only
   *  Transcriptions sub-tab under Rhythmic Audiation. */
  lockSources?: TxSource[];
  /** Hide these sources from the DATABASES picker and from the persisted
   *  selection, but otherwise leave the picker active.  Used to exclude
   *  non-tonal corpora (e.g. drums) from the Tonal Audiation embed. */
  excludeSources?: TxSource[];
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

export default function TranscriptionsTab({ ensureAudio, playVol = 0.8, lockSources, excludeSources }: Props) {
  // Visible source pool: everything minus any explicitly excluded source.
  const excludeSet = new Set(excludeSources ?? []);
  const VISIBLE_SOURCES = ALL_SOURCES.filter(s => !excludeSet.has(s));

  // ── Options (persisted) ───────────────────────────────────────────
  const [bars, setBars] = useLS<number>("lt_tx_bars", 2);
  // When locked to a fixed corpus, use isolated local state so we don't
  // clobber the main Transcriptions tab's persisted database selection.
  const [sourcesLS, setSourcesLS] = useLS<TxSource[]>("lt_tx_sources", [...ALL_SOURCES]);
  // Strip any excluded source from the persisted set on every render so
  // a stale "drums" entry from before the exclusion was added gets dropped.
  const sourcesFiltered = sourcesLS.filter(s => !excludeSet.has(s));
  const [sourcesLocal, setSourcesLocal] = useState<TxSource[]>(lockSources ?? []);
  const sources = lockSources ? sourcesLocal : sourcesFiltered;
  const setSources = lockSources ? setSourcesLocal : setSourcesLS;
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
  // Blues plays the actual recording from a LOCAL audio file (offline).
  const [audioSeg, setAudioSeg] = useState<{ src: string; start: number; end: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const segEndRef = useRef<number>(Infinity);
  // Extra bars to play before/after the excerpt (the "hear more" buttons).  The
  // ref is what playback reads (always current); the state drives the on-screen
  // indicator.  Both reset on each new Play.
  const clipPadRef = useRef({ before: 0, after: 0 });
  const [clipPad, setClipPad] = useState({ before: 0, after: 0 });

  // ── Saved phrases ─────────────────────────────────────────────────
  // Bookmark the current excerpt to come back to later.  Stored in LS as
  // identifiers only (id + source + startBar + bars); the TxItem is
  // re-fetched on demand via loadItemById, so saves survive page reloads
  // and corpus rebuilds (a stale saved entry whose id no longer exists
  // surfaces an error on play instead of crashing).
  interface SavedPhrase {
    sid: string;          // unique local id for list keys / remove
    itemId: string;
    source: TxSource;
    startBar: number;
    bars: number;
    title: string;        // snapshot of TxItem.title (for the list label)
    artist?: string;
    label: string;        // optional user note ("" until edited)
    savedAt: number;
  }
  const [savedPhrases, setSavedPhrases] = useLS<SavedPhrase[]>("lt_tx_saved", []);

  /** Play a local-audio segment [start,end].  Seeking into a large/VBR mp3 is
   *  unreliable if you play() before the seek lands, so: wait for metadata, set
   *  currentTime, then play on the 'seeked' event (with a fallback). */
  const playAudioSeg = (src: string, start: number, end: number) => {
    const a = audioRef.current; if (!a) return;
    segEndRef.current = end;
    const begin = () => {
      if (Math.abs(a.currentTime - start) < 0.3) { a.play().catch(() => {}); return; }
      const onSeeked = () => { clearTimeout(fb); a.play().catch(() => {}); };
      a.addEventListener("seeked", onSeeked, { once: true });
      // Fallback: some files don't fire 'seeked' promptly — play anyway.
      const fb = setTimeout(() => { a.removeEventListener("seeked", onSeeked); a.play().catch(() => {}); }, 600);
      try { a.currentTime = start; } catch { clearTimeout(fb); a.play().catch(() => {}); }
    };
    const abs = new URL(src, location.href).href;
    if (a.src !== abs) {
      a.src = src;
      a.onerror = () => setStatus("Couldn't load the recording.");
      a.addEventListener("loadedmetadata", begin, { once: true });
      a.load();
    } else if (a.readyState >= 1) {
      begin();
    } else {
      a.addEventListener("loadedmetadata", begin, { once: true });
    }
  };
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

  const playGivenExcerpt = useCallback(async (it: TxItem, ex: TxExcerpt, full = false, forceTempo?: number) => {
    const myToken = ++playToken.current;
    clearEndTimer();
    audioRef.current?.pause();
    setBusy(true);
    const tempo = forceTempo ?? effectiveBpm(it);

    // BLUES is audio-only: play the ACTUAL recording from a LOCAL file (offline).
    // Play starts at the solo (solostart, from audio analysis) and runs for the
    // clip length; "Full song" plays the whole recording.  You transcribe it by
    // ear — there is no synthesized melody/notation.  Every other corpus plays MIDI.
    if (isAudioSource(it.source) && it.audio) {
      // Audio-only corpora live under different public folders: blues clips in
      // public/blues/, drum clips in public/drums/.
      const folder = it.source === "drums" ? "drums" : "blues";
      const src = `${BASE}${folder}/${it.audio}`;
      // pickExcerpt chose a random window of the recording that contains notes.
      // The "hear more" buttons extend it by whole bars before/after (clipPad).
      // "Full song" plays the whole track from the top (and does NOT change the
      // clip, so Replay still replays the clip).
      const secPerBar = (60 / (it.tempoBpm || 100)) * 4;
      const clipStart = ex.audioStart ?? it.solostart ?? 0;
      const start = full ? 0 : Math.max(0, clipStart - clipPadRef.current.before * secPerBar);
      const end = full ? Infinity : clipStart + (ex.audioLen ?? it.soloLen ?? 24) + clipPadRef.current.after * secPerBar;
      setAudioSeg({ src, start, end });
      playAudioSeg(src, start, end);
      setStatus(""); setBusy(false);
      return;
    }
    setAudioSeg(null);

    setStatus("Loading instrument samples…");
    try {
      await ensureAudio();
      const countInBeats = countInBars * ex.beatsPerBar;
      // Chords (real for jazz/pop, auto-inferred by the loader for folk) are
      // realized into idiomatic comping inside playExcerpt per genre.
      const handle = await playExcerpt(ex, {
        bpm: tempo,
        withMelody: withMelody && (it.melody?.length ?? 0) > 0,
        withChords: withChords && ex.chords.length > 0,
        withBass: withBass && ex.chords.length > 0,
        countInBeats,
        metronome,
        volume: playVol,
      });
      if (myToken !== playToken.current) return;     // superseded
      setStatus("");
      const spb = 60 / tempo;
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
    const filter = { sources, minBars: bars, requireChords: withChords && !withMelody, styles: styleFilter };
    // Enforce "at least 2 melody notes per bar": try a few items and keep the
    // first whose excerpt has >=2 notes in EVERY bar (blues is audio-only, so
    // it's accepted as-is — its own onset rule governs the clip).
    const minNotesPerBar = (e: TxExcerpt) => {
      if (!e.bars) return 0;
      const counts = new Array(e.bars).fill(0);
      for (const n of e.melody) { const b = Math.floor(n.startBeat / e.beatsPerBar + 1e-6); if (b >= 0 && b < e.bars) counts[b]++; }
      return Math.min(...counts);
    };
    let picked: TxItem | null = null, ex: TxExcerpt | null = null, best = -1;
    for (let t = 0; t < 8; t++) {
      const p = await pickItem(filter);
      if (!p) break;
      const e = pickExcerpt(p, bars);
      if (isAudioSource(p.source)) { picked = p; ex = e; break; }
      const mn = minNotesPerBar(e);
      if (mn >= 2) { picked = p; ex = e; break; }
      if (mn > best) { best = mn; picked = p; ex = e; }
    }
    if (!picked || !ex) {
      setBusy(false);
      setStatus(`No tunes match (need ≥ ${bars} bars). Try fewer bars, more databases, or clearing the style filter.`);
      return;
    }
    setItem(picked);
    setExcerpt(ex);
    clipPadRef.current = { before: 0, after: 0 };   // fresh clip → no extra bars
    setClipPad({ before: 0, after: 0 });
    // The tempo slider follows the new song: reset the override so it shows (and
    // plays at) this tune's tempo.  forceTempo keeps the immediate play in sync
    // before the state update lands.
    setBpm(0);
    await playGivenExcerpt(picked, ex, false, picked.tempoBpm);
  }, [sources, bars, withChords, withMelody, styleFilter, playGivenExcerpt]);

  const replay = useCallback(async () => {
    clearEndTimer();
    // Replay always re-plays the CLIP/excerpt (full=false), so it works even
    // right after "Full song".  The "hear more" bars are applied here: blues
    // extends the audio segment (inside playGivenExcerpt, via clipPadRef); a
    // notated tune replays an EXTENDED bar window.
    stopPlayback();
    if (!item || !excerpt) { await playNew(); return; }
    const { before, after } = clipPadRef.current;
    const playEx = (!isAudioSource(item.source) && (before || after))
      ? sliceExcerpt(item, excerpt.startBar - before, excerpt.bars + before + after)
      : excerpt;
    await playGivenExcerpt(item, playEx, false);
  }, [item, excerpt, playGivenExcerpt, playNew]);

  // "Hear more": bump the extra-bars count (with on-screen indicator).  It does
  // NOT play — the next Replay applies it.  `delta` lets the UI's "−" button
  // undo a bar that was added by mistake (clamped to 0).
  const adjustBar = (which: "before" | "after", delta: number) => {
    const p = clipPadRef.current;
    const next = { ...p, [which]: Math.max(0, p[which] + delta) };
    clipPadRef.current = next;
    setClipPad(next);
  };
  const addBar = (which: "before" | "after") => adjustBar(which, +1);
  const removeBar = (which: "before" | "after") => adjustBar(which, -1);

  const playFull = useCallback(async () => {
    if (!item) return;
    clearEndTimer();
    stopPlayback();
    await playGivenExcerpt(item, fullExcerpt(item), true);   // whole tune; leaves the excerpt target intact
  }, [item, playGivenExcerpt]);

  const stop = () => { playToken.current++; clearEndTimer(); stopPlayback(); audioRef.current?.pause(); setBusy(false); setStatus(""); };

  // ── Saved phrases: save / play / rename / remove ──────────────────
  const saveCurrent = useCallback(() => {
    if (!item || !excerpt) return;
    const itemId = excerpt.item.id;
    const startBar = excerpt.startBar;
    const bars = excerpt.bars;
    // Dedupe: same id + window already saved → no-op.
    if (savedPhrases.some(p => p.itemId === itemId && p.startBar === startBar && p.bars === bars)) return;
    const entry: SavedPhrase = {
      sid: `${itemId}|${startBar}|${bars}|${Date.now()}`,
      itemId, source: excerpt.item.source, startBar, bars,
      title: excerpt.item.title, artist: excerpt.item.artist,
      label: "", savedAt: Date.now(),
    };
    setSavedPhrases(prev => [entry, ...prev]);
  }, [item, excerpt, savedPhrases, setSavedPhrases]);

  const playSaved = useCallback(async (p: SavedPhrase) => {
    setStatus("Loading saved phrase…");
    const it = await loadItemById(p.itemId, p.source);
    if (!it) { setStatus("Saved phrase not found in the current corpus."); return; }
    const ex = isAudioSource(it.source) ? fullExcerpt(it) : sliceExcerpt(it, p.startBar, p.bars);
    setItem(it);
    setExcerpt(ex);
    setShowAnswer(false);
    clipPadRef.current = { before: 0, after: 0 }; setClipPad({ before: 0, after: 0 });
    await playGivenExcerpt(it, ex, false);
  }, [playGivenExcerpt]);

  const removeSaved = useCallback((sid: string) => {
    setSavedPhrases(prev => prev.filter(p => p.sid !== sid));
  }, [setSavedPhrases]);

  const renameSaved = useCallback((sid: string, label: string) => {
    setSavedPhrases(prev => prev.map(p => p.sid === sid ? { ...p, label } : p));
  }, [setSavedPhrases]);

  // True when the current excerpt is already in the saved list (drives Save button affordance).
  const currentIsSaved = !!(item && excerpt && savedPhrases.some(p =>
    p.itemId === excerpt.item.id && p.startBar === excerpt.startBar && p.bars === excerpt.bars
  ));

  // Momentary tonic drone (root+5th+octave) so the ear can orient to the key.
  const drone = useCallback(async () => {
    if (!item) return;
    await ensureAudio();
    await playTonicDrone(item.key.tonicPc);
  }, [item, ensureAudio]);

  // BPM shown in the transport: the override if set, else the current tune's tempo.
  const curTempo = excerpt?.item.tempoBpm ?? item?.tempoBpm ?? 100;
  const displayBpm = bpm > 0 ? bpm : Math.round(curTempo);

  // Voices (Melody/Chords/Bass) only apply to the SYNTHESISED corpora — blues
  // plays a real recording.  Disable them when only blues is selected; note the
  // scope when blues is mixed with notated corpora.
  const onlyBlues = sources.length > 0 && sources.every(isAudioSource);
  const mixedBlues = sources.some(isAudioSource) && sources.some(s => !isAudioSource(s));

  const toggleSource = (s: TxSource) =>
    setSources(prev => (prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]));
  const toggleStyle = (s: string) =>
    setStyleFilter(prev => (prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]));

  // ── UI ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 text-white">
      {status && <div className="text-xs text-[#9a9] min-h-[1em]">{status}</div>}

      {/* Now-playing chip */}
      {excerpt && (
        <div className="text-xs text-[#666]">
          {isAudioSource(excerpt.item.source) ? (
            <>Blues · real recording · transcribe the solo by ear</>
          ) : (
            <>
              {SOURCE_GENRE[excerpt.item.source]} · {excerpt.bars} bar{excerpt.bars > 1 ? "s" : ""} ·
              {" "}{excerpt.item.timeSig[0]}/{excerpt.item.timeSig[1]} · {Math.round(effectiveBpm(excerpt.item))} bpm
            </>
          )}
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

          {!lockSources && <OptSection title="DATABASES" accent="#7173e6">
            <div className="flex flex-wrap gap-2">
              {VISIBLE_SOURCES.map(s => {
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
          </OptSection>}

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
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs text-[#888] w-28">Voices</span>
              {([
                ["Melody", withMelody, setWithMelody],
                ["Chords", withChords, setWithChords],
                ["Bass", withBass, setWithBass],
              ] as const).map(([label, on, set]) => (
                <button key={label} onClick={() => set(v => !v)} disabled={onlyBlues}
                  className={`px-3 py-1.5 rounded-md text-xs border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    on ? "bg-[#1a1a2e] border-[#7173e6] text-[#9999ee]" : "bg-[#141414] border-[#2a2a2a] text-[#666]"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="mb-3 ml-28 text-[10px] text-[#666] min-h-[1em]">
              {onlyBlues ? "Blues plays the real recording — voices don't apply."
                : mixedBlues ? "Applies to everything but blues (blues plays the recording)." : ""}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[#888] w-28">Count-in</span>
              {[0, 1, 2].map(n => {
                const on = countInBars === n;
                return (
                  <button key={n} onClick={() => setCountInBars(n)}
                    className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                      on ? "bg-[#1a1a2e] border-[#7173e6] text-[#9999ee]" : "bg-[#141414] border-[#2a2a2a] text-[#666]"
                    }`}>
                    {n === 0 ? "None" : `${n} bar${n > 1 ? "s" : ""}`}
                  </button>
                );
              })}
              <span className="w-px h-4 bg-[#2a2a2a] mx-1" />
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
      {showAnswer && item && excerpt && (() => {
        // Base excerpt timestamps — what the BASE Replay is on, independent
        // of the "hear more" padding (per user direction: "it shouldnt
        // change with what measures i add").  For audio corpora this is the
        // actual recording timecode of the clip; for notated corpora it's
        // the synth playback time at the tune's own tempo.
        const mmss = (s: number) => {
          const t = Math.max(0, Math.floor(s));
          return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
        };
        let segStart: number, segEnd: number;
        if (isAudioSource(item.source)) {
          segStart = excerpt.audioStart ?? item.solostart ?? 0;
          segEnd = segStart + (excerpt.audioLen ?? item.soloLen ?? 24);
        } else {
          const secPerBeat = 60 / (item.tempoBpm || 100);
          segStart = excerpt.startBar * excerpt.beatsPerBar * secPerBeat;
          segEnd = segStart + excerpt.bars * excerpt.beatsPerBar * secPerBeat;
        }
        const dur = Math.max(0, segEnd - segStart);
        const stampLabel = isAudioSource(item.source) ? "Recording" : "At tempo";
        const stamp = `${stampLabel}: ${mmss(segStart)}–${mmss(segEnd)} (${dur.toFixed(1)}s)`;
        return (
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

          {/* Blues is audio-only — the answer is just the title/artist above (you
              already heard the real recording).  Notated corpora show notation. */}
          {!isAudioSource(item.source) && (
            <>
              <div className="bg-[#161616] rounded-md p-2 overflow-x-auto">
                <TranscriptionNotation excerpt={excerpt} showMelody={withMelody} showChords={withChords} showBass={withBass} />
              </div>
              <div className="text-xs text-[#777]">
                Bars {excerpt.startBar + 1}–{excerpt.startBar + excerpt.bars} of {item.barCount} ·
                {" "}{item.timeSig[0]}/{item.timeSig[1]} · {item.tempoBpm} bpm original
              </div>
            </>
          )}
          {/* Timestamps of the BASE excerpt — does NOT include any extra
              bars added via the "hear more" buttons. */}
          <div className="text-xs text-[#888] font-mono">{stamp}</div>
        </div>
        );
      })()}

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
        {/* Hear more — add bars of context before/after; applied on the next
            Replay.  The count on each button is the indicator (reset on Play). */}
        {item && excerpt && (
          <div className="flex items-center gap-1" title="Add bars of context, then Replay to hear them. − undoes one bar.">
            {/* Before group: add (◀ +N) and undo (−) sit together so the
                relationship is obvious; − only shows when there's something
                to undo. */}
            <div className="flex items-center gap-0.5">
              <button onClick={() => addBar("before")}
                className={`px-2 py-2 rounded-md text-xs border transition-colors ${clipPad.before ? "bg-[#1a2a1a] border-[#6a8] text-[#9d9]" : "bg-[#1a1a1a] border-[#333] text-[#9a9] hover:border-[#555]"}`}>
                ◀ +{clipPad.before}
              </button>
              {clipPad.before > 0 && (
                <button onClick={() => removeBar("before")} title="Remove one extra bar from the start"
                  className="px-1.5 py-2 rounded-md text-xs border bg-[#1a1a1a] border-[#333] text-[#9a9] hover:border-[#aa6] hover:text-[#ca6] transition-colors">
                  −
                </button>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              {clipPad.after > 0 && (
                <button onClick={() => removeBar("after")} title="Remove one extra bar from the end"
                  className="px-1.5 py-2 rounded-md text-xs border bg-[#1a1a1a] border-[#333] text-[#9a9] hover:border-[#aa6] hover:text-[#ca6] transition-colors">
                  −
                </button>
              )}
              <button onClick={() => addBar("after")}
                className={`px-2 py-2 rounded-md text-xs border transition-colors ${clipPad.after ? "bg-[#1a2a1a] border-[#6a8] text-[#9d9]" : "bg-[#1a1a1a] border-[#333] text-[#9a9] hover:border-[#555]"}`}>
                +{clipPad.after} ▶
              </button>
            </div>
          </div>
        )}
        <button onClick={playFull} disabled={busy || !item}
          title="Play the whole tune from the top"
          className="px-4 py-2 rounded-md text-sm font-medium bg-[#1a1a1a] border border-[#333] text-[#bbb] hover:border-[#555] disabled:opacity-40 transition-colors">
          ♫ Full song
        </button>
        {/* Momentary tonic drone — orient the ear to the key (notated corpora;
            blues has no established key, you take it from the recording). */}
        {item && !isAudioSource(item.source) && (
          <button onClick={drone}
            title="Briefly sound the tonic (root + 5th) to orient your ear to the key"
            className="px-4 py-2 rounded-md text-sm font-medium bg-[#1a1a1a] border border-[#333] text-[#bbb] hover:border-[#555] transition-colors">
            ◉ Key
          </button>
        )}
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
        {/* Bookmark the current excerpt to the Saved Phrases list below.  Disabled
            when there's no excerpt to save, or when this exact window is already saved. */}
        <button onClick={saveCurrent} disabled={!excerpt || currentIsSaved}
          title={currentIsSaved ? "This excerpt is already in your Saved Phrases" : "Save this excerpt to review later"}
          className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors disabled:opacity-40 ${
            currentIsSaved
              ? "border-[#aa8] bg-[#2a2614] text-[#dca]"
              : "border-[#333] bg-[#1a1a1a] text-[#bbb] hover:border-[#aa8]"
          }`}>
          {currentIsSaved ? "★ Saved" : "★ Save"}
        </button>
      </div>

      {/* ── Saved phrases ───────────────────────────────────────────── */}
      {savedPhrases.length > 0 && (
        <OptSection title={`SAVED PHRASES (${savedPhrases.length})`} accent="#d4b15a" defaultOpen={false}>
          <div className="space-y-1.5">
            {savedPhrases.map(p => (
              <div key={p.sid} className="flex items-center gap-2 px-2 py-1.5 rounded border border-[#222] bg-[#0e0e0e] hover:border-[#333]">
                <button onClick={() => playSaved(p)} disabled={busy}
                  className="px-3 py-1 rounded text-xs font-medium bg-[#1a1a1a] border border-[#333] text-[#bbb] hover:border-[#7173e6] hover:text-white disabled:opacity-40 transition-colors">
                  ▶
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[#ddd] truncate" title={`${prettyTitle(p.title)}${p.artist ? " — " + p.artist : ""}`}>
                    {prettyTitle(p.title)}{p.artist ? <span className="text-[#888]"> — {p.artist}</span> : null}
                  </div>
                  <div className="text-[10px] text-[#777]">
                    {SOURCE_LABEL[p.source]} · bars {p.startBar + 1}–{p.startBar + p.bars}
                  </div>
                </div>
                <input type="text" value={p.label} onChange={e => renameSaved(p.sid, e.target.value)}
                  placeholder="add a note…"
                  className="w-40 px-2 py-1 text-[11px] rounded bg-[#0a0a0a] border border-[#222] text-[#bbb] placeholder-[#555] focus:outline-none focus:border-[#555]"
                />
                <button onClick={() => removeSaved(p.sid)} title="Remove from Saved Phrases"
                  className="px-2 py-1 rounded text-xs text-[#a66] hover:text-[#d88] hover:bg-[#2a1414] transition-colors">
                  ✕
                </button>
              </div>
            ))}
          </div>
        </OptSection>
      )}

      {/* Blues clip playback uses a LOCAL file, driven by the transport buttons
          (Play / Replay / Full song / Stop) — the element is always hidden (no
          native scrubber bar).  onTimeUpdate stops it at the clip's end. */}
      <audio
        ref={audioRef}
        className="hidden"
        onTimeUpdate={() => { const a = audioRef.current; if (a && a.currentTime >= segEndRef.current) a.pause(); }}
      />
    </div>
  );
}
