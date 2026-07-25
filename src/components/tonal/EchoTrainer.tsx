// ── Echo Trainer (call & response) ──────────────────────────────────
// The app plays a RANDOM phrase (line, chord or cycle) from what you generated,
// at a RANDOM tempo, over a chosen number of SLOTS.  You then fill the empty
// boxes by SINGING: focus a box (arrows / click), press SPACE to record, sing,
// and move off to lock whatever you last sang — no retry loop.  Nothing is
// revealed until you Check, so it stays a real recall test.

import { useEffect, useRef, useState } from "react";
import { audioEngine } from "@/lib/audioEngine";
import { customSolfege } from "@/lib/customSolfege";
import { C4_FREQ, detectPitch, median, circDelta, correctOctave, rmsOf } from "@/lib/pitchDetect";

export interface EchoNote { abs: number; cents: number; syl: string; oct: number; }
export interface EchoSlot { notes: EchoNote[]; }               // 1 note = line; N = chord tones (low→high)
export interface EchoPhrase { label: string; cat: string; slots: EchoSlot[]; }

// Pool sections you can toggle on/off + a display order.  Modal interchange is
// off by default (you asked to keep it out of Echo).
const CAT_ORDER = ["scale", "patterns", "pentatonic", "angular", "chromatic", "resolution", "chords", "cycles", "interchange"];
const CAT_LABEL: Record<string, string> = {
  scale: "Scale", patterns: "Patterns", pentatonic: "Pentatonic", angular: "Angular",
  chromatic: "Chromatic", resolution: "Resolution", chords: "Chords", cycles: "Cycles", interchange: "Interchange",
};
const DEFAULT_TOL = 15;      // ± cents to count a box correct — tight enough to tell small/center/large apart
const STABLE_SPREAD = 40;
const vowelColor = (syl: string) => {
  const v = syl.slice(-1).toLowerCase();
  return v === "o" ? "#3f9bc4" : v === "e" ? "#e0a040" : v === "u" ? "#2f6f88" : v === "i" ? "#e6c860" : "#8fbf8f";
};
const randInt = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

// Syllable stacked with octave dots (above = higher octave, below = lower).
function Glyph({ syl, oct, color }: { syl: string; oct: number; color?: string }) {
  return (
    <span className="inline-flex flex-col items-center leading-none">
      <span className={`text-[7px] leading-none ${oct > 0 ? "" : "invisible"} text-[#7aa0c0]`}>{"•".repeat(Math.max(1, oct))}</span>
      <span className="leading-snug" style={{ color: color ?? vowelColor(syl) }}>{syl}</span>
      <span className={`text-[7px] leading-none ${oct < 0 ? "" : "invisible"} text-[#7aa0c0]`}>{"•".repeat(Math.max(1, -oct))}</span>
    </span>
  );
}

type Phase = "idle" | "playing" | "responding";
interface BoxResult { hit: boolean; sungCents: number; }

export default function EchoTrainer({ pool, rootCents, ensureAudio, playVol = 0.6, onRegenerate }: {
  pool: EchoPhrase[]; rootCents: number; ensureAudio: () => Promise<void>; playVol?: number; onRegenerate?: () => void;
}) {
  const [on, setOn] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [phrase, setPhrase] = useState<EchoPhrase | null>(null);
  const [tempo, setTempo] = useState(0);
  const [tempoMin, setTempoMin] = useState(60);
  const [tempoMax, setTempoMax] = useState(120);
  const [slots, setSlots] = useState(3);
  const [tol, setTol] = useState(DEFAULT_TOL);
  const [disabledCats, setDisabledCats] = useState<Set<string>>(new Set(["interchange"]));
  const [focus, setFocus] = useState({ col: 0, row: 0 });
  const [results, setResults] = useState<Record<string, BoxResult>>({});
  const [checked, setChecked] = useState(false);      // Check pressed → show what you sang + ✓/✗
  const [answerShown, setAnswerShown] = useState(false);   // Show Answer → show the targets
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [err, setErr] = useState("");

  const rootRef = useRef(rootCents); rootRef.current = rootCents;
  const tolRef = useRef(tol); tolRef.current = tol;
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const histRef = useRef<number[]>([]);
  const prevFreqRef = useRef(0);
  const liveRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const phraseRef = useRef<EchoPhrase | null>(null);
  const focusRef = useRef({ col: 0, row: 0 });
  const recordingRef = useRef(false);
  const setPhaseBoth = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  const boxKey = (col: number, row: number) => `${col}:${row}`;
  const clearTimers = () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };
  const after = (ms: number, fn: () => void) => { timersRef.current.push(setTimeout(fn, ms)); };

  // Lock whatever was last sung into the focused box (called when recording stops
  // or focus moves) — it checks once and keeps your answer; it does not retry.
  const commit = () => {
    const l = liveRef.current, p = phraseRef.current, f = focusRef.current;
    if (l == null || !p) return;
    const target = p.slots[f.col]?.notes[f.row]; if (!target) return;
    const hit = Math.abs(circDelta(l, target.cents)) <= tolRef.current;
    setResults(r => ({ ...r, [boxKey(f.col, f.row)]: { hit, sungCents: l } }));
  };
  const stopRecording = () => { if (recordingRef.current) { recordingRef.current = false; setRecording(false); commit(); } };
  const startRecording = () => {
    if (phaseRef.current !== "responding") return;
    recordingRef.current = true; setRecording(true);
    liveRef.current = null; histRef.current = []; prevFreqRef.current = 0;
  };
  const moveFocus = (col: number, row: number) => {
    stopRecording();
    const p = phraseRef.current; if (!p) return;
    const c = Math.max(0, Math.min(col, p.slots.length - 1));
    const r = Math.max(0, Math.min(row, p.slots[c].notes.length - 1));
    focusRef.current = { col: c, row: r }; setFocus({ col: c, row: r });
    liveRef.current = null; histRef.current = [];
  };

  // ── Mic loop — captures only while a box is RECORDING. ──
  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        ctxRef.current = ctx;
        if (ctx.state === "suspended") await ctx.resume();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0;
        src.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        const tick = () => {
          analyser.getFloatTimeDomainData(buf);
          const rms = rmsOf(buf);
          const lv = Math.min(1, Math.sqrt(rms) * 3.2);
          setLevel(l => (Math.abs(l - lv) > 0.03 ? lv : l));
          if (recordingRef.current && phaseRef.current === "responding") {
            const { freq: rawFreq } = detectPitch(buf, ctx.sampleRate, rms);
            if (rawFreq > 0) {
              const f = correctOctave(rawFreq, prevFreqRef.current); prevFreqRef.current = f;
              const tonicFreq = C4_FREQ * Math.pow(2, (rootRef.current - 1200) / 1200);
              const raw = 1200 * Math.log2(f / tonicFreq);
              const h = histRef.current; h.push(raw); if (h.length > 5) h.shift();
              const recent = h.slice(-3);
              if (h.length >= 3 && Math.max(...recent) - Math.min(...recent) <= STABLE_SPREAD)
                liveRef.current = ((median(h) % 1200) + 1200) % 1200;
            } else prevFreqRef.current = 0;
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        setErr(e instanceof Error && e.name === "NotAllowedError" ? "Mic permission denied." : "Mic unavailable.");
        setOn(false);
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current); clearTimers();
      streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
      ctxRef.current?.close().catch(() => {}); ctxRef.current = null;
      setLevel(0);
    };
  }, [on]);

  // ── Controls ──
  const playFrames = (p: EchoPhrase, t: number) => {
    audioEngine.playSequence(p.slots.map(s => s.notes.map(n => n.abs)), 1200, 60000 / t, 0.95, playVol * 0.7);
  };
  const newPhrase = async () => {
    onRegenerate?.();
    const usable = pool.filter(p => !disabledCats.has(p.cat));
    if (!usable.length) return;
    clearTimers(); stopRecording();
    const src = usable[randInt(0, usable.length - 1)];
    let sl = src.slots;
    // Random window (start on a different point) + random retrograde, so the pool
    // varies itself instead of you toggling transforms by hand.
    if (slots > 0 && slots < sl.length) { const start = randInt(0, sl.length - slots); sl = sl.slice(start, start + slots); }
    if (Math.random() < 0.5) sl = [...sl].reverse();
    const chosen: EchoPhrase = { label: src.label, cat: src.cat, slots: sl };
    const t = randInt(tempoMin, Math.max(tempoMin, tempoMax));
    phraseRef.current = chosen; setPhrase(chosen); setTempo(t);
    setResults({}); setChecked(false); setAnswerShown(false);
    liveRef.current = null; histRef.current = [];
    focusRef.current = { col: 0, row: 0 }; setFocus({ col: 0, row: 0 });
    await ensureAudio();
    setPhaseBoth("playing");
    playFrames(chosen, t);
    after(chosen.slots.length * (60000 / t) + 200, () => setPhaseBoth("responding"));
  };
  const replay = async () => { const p = phraseRef.current; if (!p || !tempo) return; await ensureAudio(); playFrames(p, tempo); };
  const doCheck = () => { stopRecording(); setChecked(true); };

  // Keyboard: a play · s replay · d check · f answer · space record · arrows move.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === " ") { e.preventDefault(); recordingRef.current ? stopRecording() : startRecording(); return; }
      const k = e.key.toLowerCase();
      if (k === "a") { e.preventDefault(); newPhrase(); }
      else if (k === "s") { e.preventDefault(); replay(); }
      else if (k === "d") { e.preventDefault(); doCheck(); }
      else if (k === "f") { e.preventDefault(); setAnswerShown(v => !v); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); moveFocus(focusRef.current.col - 1, focusRef.current.row); }
      else if (e.key === "ArrowRight") { e.preventDefault(); moveFocus(focusRef.current.col + 1, focusRef.current.row); }
      else if (e.key === "ArrowUp") { e.preventDefault(); moveFocus(focusRef.current.col, focusRef.current.row + 1); }
      else if (e.key === "ArrowDown") { e.preventDefault(); moveFocus(focusRef.current.col, focusRef.current.row - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, tempo, tempoMin, tempoMax, slots, disabledCats]);

  const availableCats = CAT_ORDER.filter(c => pool.some(p => p.cat === c));

  const ctrl = (label: string, key: string, fn: () => void, primary = false, disabled = false) => (
    <button onClick={fn} disabled={disabled}
      className={`px-4 py-2 rounded text-sm font-semibold transition-colors ${disabled ? "bg-[#141414] text-[#444] cursor-not-allowed"
        : primary ? "bg-[#7173e6] hover:bg-[#5a5cc8] text-white" : "border border-[#333] bg-[#1a1a1a] text-[#cfcfcf] hover:text-white"}`}>
      {label} <span className="opacity-60 text-[10px]">{key}</span>
    </button>
  );

  return (
    <div className="rounded-lg border border-[#1e1e1e] bg-[#0c0c0c] overflow-hidden">
      <div className="px-3 py-1.5 border-b border-[#161616] flex items-center gap-2 bg-[#0a0a0a]">
        <span className="w-1.5 h-3 rounded-sm" style={{ background: "#c98fd0" }} />
        <span className="text-[10px] font-semibold tracking-widest text-[#8a8a8a]">ECHO · CALL &amp; RESPONSE</span>
        <span className="text-[9px] text-[#6a6a6a]" title="With speakers the mic can hear the phrase. Headphones fix that.">🎧</span>
        <button onClick={() => { setErr(""); setOn(o => !o); }}
          className={`ml-auto px-2.5 py-0.5 rounded text-[11px] font-semibold border transition-colors ${on ? "bg-[#c04a4a] border-[#c04a4a] text-white" : "bg-[#1a1a1a] border-[#333] text-[#aaa] hover:text-white"}`}>
          {on ? "● mic on" : "🎤 mic"}
        </button>
      </div>
      <div className="p-3 space-y-3">
        {err && <div className="text-[11px] text-[#c88f8f]">{err}</div>}
        {pool.length === 0 ? (
          <div className="text-[11px] text-[#666]">Generate material first — it becomes the phrase pool here.</div>
        ) : (<>
          {/* Tempo range · slots · tolerance */}
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            <span className="text-[9px] text-[#555] font-semibold tracking-wider">TEMPO</span>
            <input type="number" value={tempoMin} min={20} max={300} onChange={e => setTempoMin(Math.max(20, Math.min(300, +e.target.value || 20)))} className="w-14 bg-[#141414] border border-[#242424] rounded px-1.5 py-0.5 text-white" />
            <span className="text-[#555]">–</span>
            <input type="number" value={tempoMax} min={20} max={300} onChange={e => setTempoMax(Math.max(20, Math.min(300, +e.target.value || 20)))} className="w-14 bg-[#141414] border border-[#242424] rounded px-1.5 py-0.5 text-white" />
            <span className="text-[9px] text-[#555]">bpm{tempo ? ` · ${tempo}` : ""}</span>
            <span className="w-px h-4 bg-[#1e1e1e] mx-1" />
            <span className="text-[9px] text-[#555] font-semibold tracking-wider">SLOTS</span>
            <input type="number" value={slots} min={0} max={32} onChange={e => setSlots(Math.max(0, Math.min(32, +e.target.value || 0)))} className="w-12 bg-[#141414] border border-[#242424] rounded px-1.5 py-0.5 text-white" title="Events played (0 = whole phrase)" />
            <span className="w-px h-4 bg-[#1e1e1e] mx-1" />
            <span className="text-[9px] text-[#555] font-semibold tracking-wider" title="How many cents count as correct — lower = must nail small/center/large">±¢</span>
            <input type="number" value={tol} min={3} max={60} onChange={e => setTol(Math.max(3, Math.min(60, +e.target.value || 3)))} className="w-12 bg-[#141414] border border-[#242424] rounded px-1.5 py-0.5 text-white" />
            <span className="ml-auto text-[10px]" style={{ color: recording ? "#e06a6a" : "#666" }}>
              {recording ? "● recording — sing, then move off" : phase === "playing" ? "listen…" : phase === "responding" ? "focus a box · space to record · ← ↑ ↓ →" : on ? "press Play (a)" : "turn the mic on"}
            </span>
          </div>

          {/* Pool sections — toggle which material the random phrase is drawn from. */}
          {availableCats.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[9px] text-[#555] font-semibold tracking-wider mr-0.5">POOL</span>
              {availableCats.map(c => {
                const on2 = !disabledCats.has(c);
                return (
                  <button key={c} onClick={() => setDisabledCats(s => { const nx = new Set(s); nx.has(c) ? nx.delete(c) : nx.add(c); return nx; })}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${on2 ? "bg-[#7173e6] text-white border-[#7173e6]" : "bg-[#1a1a1a] text-[#888] border-[#2a2a2a] hover:text-white"}`}>
                    {CAT_LABEL[c] ?? c}
                  </button>
                );
              })}
            </div>
          )}

          {/* Box grid — one column per slot; a column of boxes for a chord. */}
          {phrase ? (
            <div className="flex gap-1.5 items-end overflow-x-auto pb-1">
              {phrase.slots.map((slot, col) => (
                <div key={col} className="flex flex-col gap-1">
                  {[...slot.notes].map((_, i) => i).reverse().map(row => {
                    const note = slot.notes[row];
                    const res = results[boxKey(col, row)];
                    const focused = focus.col === col && focus.row === row;
                    const rec = recording && focused;
                    const err2 = res ? Math.round(circDelta(res.sungCents, note.cents)) : 0;
                    return (
                      <button key={row} onClick={() => moveFocus(col, row)}
                        className={`min-w-[44px] h-12 rounded border flex flex-col items-center justify-center text-sm font-mono transition-colors ${
                          focused ? "border-[#8fc88f] ring-1 ring-[#8fc88f]/50" : "border-[#242424]"}`}
                        style={{ background: rec ? "#3a1616" : (checked && res) ? (res.hit ? "#1e3a1e" : "#3a1e1e") : focused ? "#16161c" : "#101014" }}>
                        {answerShown
                          ? <Glyph syl={note.syl} oct={note.oct} />
                          : checked && res
                            ? <><span className="flex items-center gap-0.5"><Glyph syl={customSolfege(res.sungCents)} oct={0} color={res.hit ? "#8fc88f" : "#e0a040"} />{res.hit ? "✓" : "✗"}</span><span className="text-[7px] text-[#888] leading-none">{err2 > 0 ? "+" : ""}{err2}¢</span></>
                            : rec
                              ? <span className="text-[#e06a6a] animate-pulse text-lg leading-none">●</span>
                              : res
                                ? <span className="text-[#5a7a5a]">●</span>
                                : <span className="text-[#3a3a3a]">?</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="h-12 rounded bg-[#0a0a0a] border border-[#1a1a1a] flex items-center justify-center text-[11px] text-[#555]">press Play to hear a phrase</div>
          )}

          {/* Mic level */}
          {on && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-[#555] font-semibold tracking-wider w-8">MIC</span>
              <div className="flex-1 h-1.5 rounded-full bg-[#0a0a0a] border border-[#1a1a1a] overflow-hidden">
                <div className="h-full rounded-full transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%`, background: level > 0.04 ? "#7aa87a" : "#333" }} />
              </div>
            </div>
          )}

          {/* Bottom transport */}
          <div className="flex items-center gap-2 pt-1">
            {ctrl("▶ Play", "a", newPhrase, true)}
            {ctrl("Replay", "s", replay, false, !phrase)}
            {ctrl("Check", "d", doCheck, false, !phrase)}
            {ctrl(answerShown ? "Hide" : "Show Answer", "f", () => setAnswerShown(v => !v), false, !phrase)}
          </div>
        </>)}
      </div>
    </div>
  );
}
