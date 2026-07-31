// ── Pitch Trainer ───────────────────────────────────────────────────
// A real-time mic pitch detector.  It shows the full octave spectrum with the
// notes of the currently-generated scales marked as target points, listens
// continuously, auto-locks onto the closest target to what you're singing, and
// — like a clicker — beeps + plays a brief reference pitch whenever you drift
// off that note.

import { useEffect, useRef, useState } from "react";
import { REGIONS } from "@/lib/intervalSpectrum";
import { C4_FREQ, detectPitch, median, circDelta } from "@/lib/pitchDetect";

// Guide-drone volume: a 0..100% slider spanning the FULL usable range so it audibly
// changes level the whole way. The voice is soft-clipped (see GUIDE_SHAPER_CURVE) to
// push RMS up for real perceived loudness without static. 100% ≈ the loudest the output
// allows without clipping. NB: the output ceiling is fixed and a single low tone is
// inherently quieter to the ear than broadband music — if it's still low, raise your
// OS / headphone volume (the app can't go past the system output).
const DRONE_VOL_MAX = 0.95;     // output gain at 100% (post-shaper peak stays just under clip)
const DRONE_VOL_DEFAULT = 85;   // % — loud by default; turn it down if it buries your voice
const guideGainFor = (volPct: number) => (Math.max(0, Math.min(100, volPct)) / 100) * DRONE_VOL_MAX;
// Soft-clip transfer curve for the guide voice: tanh raises RMS (loudness) with a soft
// knee (no harsh static) and adds a little harmonic glue so a low tone still carries.
const GUIDE_SHAPER_CURVE = (() => {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(1.8 * x); }
  return c;
})();

const TOL_CENTS = 8;         // you're "on the note" inside ±this many cents. Kept tight on
                             // purpose: the bands (31/12/39-EDO) sit only ~10-25¢ apart, so a
                             // wide window would read "on" for the WRONG band and defeat the
                             // microtonal training. Precision is the point — narrow it, don't
                             // widen it. (Loosen only to warm up.)
const STABLE_SPREAD = 40;       // recent frames must agree within this (cents) = a held voice
const MIN_DRONE_MS = 1000;      // once it starts, the guide drone holds at least this long
const BIAS_CENTS = 30;          // when clearly moving off a note, switch to the next one this early

// Interval regions (the same spectrum the trainer zooms into) with their
// small / center / large sub-bands.
const MAIN = REGIONS.filter(r => r.kind === "main" && r.subs && r.subs.length === 3);
const BAND_COLORS = ["#3f9bc4", "#7173e6", "#e0a040"] as const;   // small / center / large
const BAND_NAMES = ["small", "center", "large"] as const;
// Region + a small padding window we zoom to when you sing inside it.
const regionOf = (cents: number) => MAIN.find(r => cents >= r.lo && cents <= r.hi);

interface Target { cents: number; syl: string; band: number; }
const BAND_EDO = ["50", "12", "39"] as const;   // small / center / large tunings

const vowelColor = (syl: string) => {
  const v = syl.slice(-1).toLowerCase();
  return v === "o" ? "#3f9bc4" : v === "e" ? "#e0a040" : v === "u" ? "#2f6f88" : v === "i" ? "#e6c860" : "#8fbf8f";
};

// Target note frequency nearest the octave you're actually singing in, so the
// guide drone sits right next to your voice.
function targetFreqNear(tonicFreq: number, targetCents: number, voiceFreq: number): number {
  let tf = tonicFreq * Math.pow(2, targetCents / 1200);
  while (tf < voiceFreq / 1.414) tf *= 2;
  while (tf > voiceFreq * 1.414) tf /= 2;
  return tf;
}

// Undo OCTAVE slips relative to the previous pitch. Only pure-octave candidates
// (×2 / ÷2 / ×4 / ÷4) — deliberately NOT ×1.5 / ×3 (fifths / twelfths): those change
// the pitch CLASS, so they could "correct" a note you're singing dead-on into a fifth
// away and read wildly out of tune even with zero beating against the drone. Octave
// shifts are pitch-class-neutral (and the reading is octave-reduced anyway), so this
// can only fix a genuine octave jump, never invent a wrong note.
function correctOctave(f: number, prevF: number): number {
  if (!prevF) return f;
  const cands = [f, f * 2, f / 2, f * 4, f / 4];
  let best = f, bestD = Infinity;
  for (const c of cands) {
    const d = Math.abs(1200 * Math.log2(c / prevF));
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD < 60 ? best : f;
}

interface Reading { cents: number; freq: number; nearest: number; offset: number; }

export default function PitchTrainer({ rootCents, targets }: { rootCents: number; targets: Target[] }) {
  const [on, setOn] = useState(false);
  // Lock detection to ONE band (0 small/31 · 1 center/12 · 2 large/39) so it
  // stops snapping to a neighbouring tuning ~30¢ away; null = auto-nearest.
  const [lockBand, setLockBand] = useState<number | null>(null);
  const lockBandRef = useRef<number | null>(null);
  lockBandRef.current = lockBand;
  const [reading, setReading] = useState<Reading | null>(null);
  const [level, setLevel] = useState(0);
  const [guiding, setGuiding] = useState(false);   // guide drone currently sounding
  const [droneVol, setDroneVol] = useState(DRONE_VOL_DEFAULT);   // guide-drone volume (%)
  const droneVolRef = useRef(DRONE_VOL_DEFAULT);
  droneVolRef.current = droneVol;
  const [err, setErr] = useState("");
  const rootRef = useRef(rootCents);
  rootRef.current = rootCents;
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const histRef = useRef<number[]>([]);
  const lastGoodRef = useRef(0);
  const prevFreqRef = useRef(0);       // last accepted pitch (for octave-slip correction)
  const guideOnRef = useRef(false);
  const guideNoteRef = useRef(-1);     // which target the guide drone is sounding
  const prevCentsRef = useRef(-1);     // last committed cents (for movement / directional bias)

  // ── Synth guide voice ──────────────────────────────────────────────
  // The guide drone is its OWN synth voice — a clean, mostly-sine tone (dominant
  // fundamental), NOT the app's sampled drone instrument. That keeps a different
  // timbre from the cycle circle-drones AND makes beating against your voice easy to
  // hear; on its own signal path (straight to the mic context output, no shared
  // drone-bus limiter) the cycle chords can't duck or bury it.
  const guideVoiceRef = useRef<{ oscs: OscillatorNode[]; gain: GainNode } | null>(null);
  const killGuideVoice = (fade = 0.16) => {
    const ac = ctxRef.current, v = guideVoiceRef.current;
    if (!ac || !v) { guideVoiceRef.current = null; return; }
    const t = ac.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(0, t + fade);
    v.oscs.forEach(o => { try { o.stop(t + fade + 0.03); } catch { /* already stopped */ } });
    guideVoiceRef.current = null;
  };
  const buildGuideVoice = (freq: number) => {
    const ac = ctxRef.current;
    if (!ac) return;
    killGuideVoice(0.03);                          // clear the prior note before retuning
    // Signal path: oscillators -> pre (drives the soft-clipper) -> shaper -> g (output).
    // The soft-clip lifts RMS for real loudness without static; a strong fundamental
    // plus an octave keeps beating clear and gives presence in a more audible range.
    const pre = ac.createGain(); pre.gain.value = 1;
    const shaper = ac.createWaveShaper(); shaper.curve = GUIDE_SHAPER_CURVE; shaper.oversample = "2x";
    const g = ac.createGain();
    g.gain.setValueAtTime(0, ac.currentTime);
    pre.connect(shaper); shaper.connect(g); g.connect(ac.destination);
    const oscs: OscillatorNode[] = [];
    for (const [mult, amp] of [[1, 0.62], [2, 0.30], [3, 0.12]] as const) {
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * mult;
      const pg = ac.createGain(); pg.gain.value = amp;
      o.connect(pg); pg.connect(pre); o.start();
      oscs.push(o);
    }
    g.gain.linearRampToValueAtTime(guideGainFor(droneVolRef.current), ac.currentTime + 0.05);
    guideVoiceRef.current = { oscs, gain: g };
  };
  // Slider moved while a note is sounding → ramp the live guide voice to the new level.
  useEffect(() => {
    const ac = ctxRef.current, v = guideVoiceRef.current;
    if (!ac || !v) return;
    const t = ac.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(guideGainFor(droneVol), t + 0.05);
  }, [droneVol]);

  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    (async () => {
      try {
        // Echo cancellation / noise suppression are SPEECH filters that gate out
        // steady/sustained tones — they cut your voice (and the spectrum) the
        // instant you hold a pitch. Off, so a sustained note is tracked
        // continuously (the RMS/clarity gates in detectPitch handle silence).
        // autoGainControl is left ON, though: unlike those two it doesn't gate
        // tones, it just boosts a quiet mic up to a usable level so quiet singing
        // clears the detection gates.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        ctxRef.current = ctx;
        if (ctx.state === "suspended") await ctx.resume();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 4096;   // longer window → finer low-pitch resolution (less cents error)
        analyser.smoothingTimeConstant = 0;
        src.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);

        // Guide drone uses the app's selected drone INSTRUMENT SAMPLE (cello,
        // harmonium, …) as a keyed voice, so it doesn't disturb the tonic drone.
        // Started once per note, retuned only when the target note changes, and
        // held for at least MIN_DRONE_MS so it never blips on/off.
        let guideStart = 0;
        const setDrone = (active: boolean, noteIdx = -1, targetCents = 0, voiceFreq = 0, tonicFreq = 0) => {
          const now = ctx.currentTime * 1000;
          if (active) {
            if (!guideOnRef.current || guideNoteRef.current !== noteIdx) {
              guideOnRef.current = true; guideNoteRef.current = noteIdx; guideStart = now;
              // Guide drone in the SAME octave you're singing in (a unison right next
              // to your voice) as its own clean synth tone — a different timbre from the
              // cycle drones, loud enough to hear over them, and pure enough that the
              // beating slows to a stop as you lock in.
              // Note: inside the 70–1200 Hz detection range, so with SPEAKERS the mic
              // can hear it and track it — use headphones (🎧 hint above).
              const tf = targetFreqNear(tonicFreq, targetCents, voiceFreq);
              buildGuideVoice(tf);
              setGuiding(true);
            }
          } else if (guideOnRef.current && now - guideStart >= MIN_DRONE_MS) {
            guideOnRef.current = false; guideNoteRef.current = -1;
            killGuideVoice();   // smooth release, not a hard cut
            setGuiding(false);
          }
        };

        let lastLevelPush = 0;
        const tick = () => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          const now = ctx.currentTime * 1000;
          if (now - lastLevelPush > 33) { lastLevelPush = now; setLevel(Math.min(1, Math.sqrt(rms) * 3.2)); }

          const { freq: rawFreq } = detectPitch(buf, ctx.sampleRate, rms);
          // When a band is locked, only consider that band's targets so it can't
          // hop to a different-tuning neighbour of the same syllable.
          const lb = lockBandRef.current;
          const allT = targetsRef.current;
          const tgts = lb == null ? allT : allT.filter(t => t.band === lb);
          if (rawFreq > 0 && tgts.length) {
            // Undo octave / harmonic slips relative to the note you were just on.
            const cont = now - lastGoodRef.current < 350;
            const freq = cont ? correctOctave(rawFreq, prevFreqRef.current) : rawFreq;
            prevFreqRef.current = freq;
            lastGoodRef.current = now;                         // voiced → keep the display alive
            const tonicFreq = C4_FREQ * Math.pow(2, (rootRef.current - 1200) / 1200);
            const raw = 1200 * Math.log2(freq / tonicFreq);
            const h = histRef.current; h.push(raw); if (h.length > 8) h.shift();
            const recent = h.slice(-3);
            const stable = h.length >= 3 && Math.max(...recent) - Math.min(...recent) <= STABLE_SPREAD;
            const cents = ((median(h) % 1200) + 1200) % 1200;
            // Nearest target, but bias toward the note you're clearly moving to.
            const move = prevCentsRef.current < 0 ? 0 : circDelta(cents, prevCentsRef.current);
            let nearest = 0, offset = 0, best = Infinity;
            for (let i = 0; i < tgts.length; i++) {
              const d = circDelta(cents, tgts[i].cents);
              let score = Math.abs(d);
              if (Math.abs(move) > 6 && Math.sign(d) === Math.sign(move)) score -= BIAS_CENTS;  // it's ahead in your direction of travel
              if (score < best) { best = score; nearest = i; offset = d; }
            }
            if (stable) prevCentsRef.current = cents;
            setReading({ cents, freq, nearest, offset });
            // Guide drone: sound the target note while you're off it, stop the
            // moment you're inside ±TOL.  Only act on a stable (held) pitch.
            if (stable) {
              if (Math.abs(offset) <= TOL_CENTS) setDrone(false);
              else setDrone(true, nearest, tgts[nearest].cents, freq, tonicFreq);
            }
          } else if (now - lastGoodRef.current > 700) {
            histRef.current = [];
            prevFreqRef.current = 0;
            prevCentsRef.current = -1;
            setDrone(false);
            setReading(null);
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        setErr(e instanceof Error && e.name === "NotAllowedError" ? "Mic permission denied — allow it in the browser and press start again." : "Mic unavailable on this device / context.");
        setOn(false);
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      killGuideVoice(0);
      guideOnRef.current = false; guideNoteRef.current = -1;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      setReading(null);
      setLevel(0);
      setGuiding(false);
    };
  }, [on]);

  // Keybinds while listening: h/j/k lock to small/center/large (31/12/39-EDO),
  // g returns to auto-nearest. (1–7 stay the parent's "start on degree".)
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      let hit = true;
      if (e.key === "h") setLockBand(0);
      else if (e.key === "j") setLockBand(1);
      else if (e.key === "k") setLockBand(2);
      else if (e.key === "g") setLockBand(null);
      else hit = false;
      if (hit) { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [on]);

  // Same filtered set the detection loop uses, so reading.nearest indexes correctly.
  const activeTargets = lockBand == null ? targets : targets.filter(t => t.band === lockBand);
  const inTune = reading && Math.abs(reading.offset) <= TOL_CENTS;
  const near = reading ? activeTargets[reading.nearest] : null;
  // Zoom to the interval region you're currently singing in (the closest note's
  // region), so the display shows that individual spectrum, not the whole octave.
  const region = near ? regionOf(near.cents) : null;
  const lo = region ? region.lo : near ? Math.max(0, near.cents - 130) : 0;
  const hi = region ? region.hi : near ? Math.min(1200, near.cents + 130) : 1200;
  const span = hi - lo || 1;
  const posOf = (c: number) => Math.max(0, Math.min(100, ((c - lo) / span) * 100));
  const inWindow = activeTargets.filter(t => t.cents >= lo - 2 && t.cents <= hi + 2);
  const regionLabel = region ? region.name.replace(/s$/, "").toLowerCase() : "";

  return (
    <div className="rounded-lg border border-[#1e1e1e] bg-[#0c0c0c] overflow-hidden">
      <div className="px-3 py-1.5 border-b border-[#161616] flex flex-wrap items-center gap-2 bg-[#0a0a0a]">
        <span className="w-1.5 h-3 rounded-sm" style={{ background: "#7aa87a" }} />
        <span className="text-[10px] font-semibold tracking-widest text-[#8a8a8a]">PITCH TRAINER</span>
        {/* Band lock — hold the target to one tuning instead of snapping nearest. */}
        <div className="flex items-center gap-1">
          {[0, 1, 2].map(b => (
            <button key={b} onClick={() => setLockBand(lockBand === b ? null : b)}
              title={`Lock to ${BAND_NAMES[b]} · ${BAND_EDO[b]}-EDO  (key ${["h", "j", "k"][b]})`}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors"
              style={lockBand === b
                ? { background: BAND_COLORS[b], borderColor: BAND_COLORS[b], color: "#000" }
                : { borderColor: "#333", color: "#888" }}>{BAND_EDO[b]}</button>
          ))}
          {lockBand !== null && (
            <button onClick={() => setLockBand(null)} title="Auto (nearest) — key 0" className="text-[9px] text-[#666] hover:text-[#aaa]">auto</button>
          )}
        </div>
        <span className="text-[10px] text-[#6a6a6a]" title="With speakers, the mic hears the drone and mistakes it for your voice. Headphones fix that.">🎧</span>
        {/* Guide-drone volume — 10% is the old fixed level; crank it up (limited, so it stays clean). */}
        <label className="flex items-center gap-1 text-[10px] text-[#6a6a6a]" title={`Guide-drone volume (${droneVol}%)`}>
          🔊
          <input type="range" min={5} max={100} step={5} value={droneVol}
            onChange={e => setDroneVol(Number(e.target.value))}
            className="w-16 h-1 accent-[#7aa8d0] cursor-pointer" />
          <span className="w-7 font-mono text-[#7a7a7a]">{droneVol}%</span>
        </label>
        <button onClick={() => { setErr(""); setOn(o => !o); }}
          className={`ml-auto shrink-0 px-2.5 py-0.5 rounded text-[11px] font-semibold border transition-colors ${on ? "bg-[#c04a4a] border-[#c04a4a] text-white" : "bg-[#1a1a1a] border-[#333] text-[#aaa] hover:text-white"}`}>
          {on ? "● stop" : "🎤 start"}
        </button>
      </div>
      <div className="p-3">
        {err && <div className="text-[11px] text-[#c88f8f] mb-2">{err}</div>}
        {targets.length === 0 ? (
          <div className="text-[11px] text-[#666]">Generate a scale first — its notes become the target points here.</div>
        ) : (
          <>
            {/* Readout — closest generated note + how far off you are. */}
            <div className="flex items-baseline gap-2 mb-2">
              {near ? (
                <>
                  <span className="text-lg font-semibold leading-none" style={{ color: vowelColor(near.syl) }}>{near.syl}</span>
                  {regionLabel && <span className="text-[10px] text-[#777]">{regionLabel}</span>}
                  <span className={`text-xs font-mono ${inTune ? "text-[#8fc88f]" : "text-[#e0a040]"}`}>
                    {inTune ? "on ✓" : `${reading!.offset > 0 ? "+" : ""}${Math.round(reading!.offset)}¢ ${reading!.offset > 0 ? "sharp" : "flat"}`}
                  </span>
                  {guiding && <span className="text-[10px] text-[#7aa8d0] animate-pulse">♪ drone</span>}
                </>
              ) : (
                <span className="text-[11px] text-[#666]">{on ? (level > 0.04 ? "sing a sustained note…" : "listening…") : "start the mic and sing"}</span>
              )}
              <span className="ml-auto text-[9px] font-mono text-[#555]">{reading?.freq ? `${Math.round(reading.freq)} Hz` : ""}</span>
            </div>

            {/* Zoomed spectrum of the interval you're in — small/center/large band
                zones, the generated notes as ticks, your voice as the moving line. */}
            {reading && near ? (
              <div className="relative h-16 rounded bg-[#0a0a0a] border border-[#1a1a1a] overflow-hidden">
                {/* band zones (small / center / large) */}
                {region?.subs?.map((s, i) => (
                  <div key={`z${i}`} className="absolute top-0 bottom-0" style={{ left: `${posOf(s.lo)}%`, width: `${((s.hi - s.lo) / span) * 100}%`, background: BAND_COLORS[i] + "18", borderRight: i < 2 ? "1px solid #141414" : "none" }} />
                ))}
                {region?.subs?.map((s, i) => (
                  <span key={`l${i}`} className="absolute bottom-0.5 text-[7px] tracking-wide" style={{ left: `${posOf((s.lo + s.hi) / 2)}%`, transform: "translateX(-50%)", color: BAND_COLORS[i], opacity: 0.7 }}>{BAND_NAMES[i]}</span>
                ))}
                {/* generated notes inside this region */}
                {inWindow.map((t, idx) => {
                  const isNear = t === near;
                  const col = vowelColor(t.syl);
                  return (
                    <div key={idx} className="absolute top-1 flex flex-col items-center" style={{ height: "calc(100% - 14px)", left: `${posOf(t.cents)}%`, transform: "translateX(-50%)" }}>
                      <span className="text-[9px] leading-none mb-0.5" style={{ color: col, opacity: isNear ? 1 : 0.6, fontWeight: isNear ? 700 : 400 }}>{t.syl}</span>
                      <div style={{ width: isNear ? 3 : 1.5, flex: 1, background: col, opacity: isNear ? 1 : 0.45 }} />
                    </div>
                  );
                })}
                {/* your voice */}
                <div className="absolute top-0 w-[2px]" style={{ height: "calc(100% - 12px)", left: `${posOf(reading.cents)}%`, transform: "translateX(-50%)", background: inTune ? "#8fc88f" : "#ffffff", boxShadow: `0 0 5px ${inTune ? "#8fc88f" : "#fff"}` }} />
              </div>
            ) : (
              <div className="h-16 rounded bg-[#0a0a0a] border border-[#1a1a1a] flex items-center justify-center text-[11px] text-[#555]">
                {on ? "sing — it zooms to your interval" : "start the mic to begin"}
              </div>
            )}

            {/* Mic level — proves it hears you. */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[9px] text-[#555] font-semibold tracking-wider w-8">MIC</span>
              <div className="flex-1 h-1.5 rounded-full bg-[#0a0a0a] border border-[#1a1a1a] overflow-hidden">
                <div className="h-full rounded-full transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%`, background: level > 0.04 ? "#7aa87a" : "#333" }} />
              </div>
              <span className="text-[9px] font-mono text-[#666] w-14 text-right">{on ? (level > 0.04 ? "hearing" : "silent") : "off"}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
