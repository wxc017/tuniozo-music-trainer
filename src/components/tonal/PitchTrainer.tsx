// ── Pitch Trainer ───────────────────────────────────────────────────
// A real-time mic pitch detector.  It shows the full octave spectrum with the
// notes of the currently-generated scales marked as target points, listens
// continuously, auto-locks onto the closest target to what you're singing, and
// — like a clicker — beeps + plays a brief reference pitch whenever you drift
// off that note.

import { useEffect, useRef, useState } from "react";
import { REGIONS } from "@/lib/intervalSpectrum";
import { audioEngine } from "@/lib/audioEngine";
import { C4_FREQ, detectPitch, median, circDelta } from "@/lib/pitchDetect";

const GUIDE_KEY = "pitch-trainer-guide";   // keyed drone voice = the selected instrument sample

const TOL_CENTS = 8;         // you're "on the note" inside ±this many cents (realistic for voice)
const STABLE_SPREAD = 40;       // recent frames must agree within this (cents) = a held voice
const DRONE_GAIN = 1.0;         // guide-drone voice gain (logical 0..2, sampled instrument)
const MIN_DRONE_MS = 1000;      // once it starts, the guide drone holds at least this long
const BIAS_CENTS = 30;          // when clearly moving off a note, switch to the next one this early

// Interval regions (the same spectrum the trainer zooms into) with their
// small / center / large sub-bands.
const MAIN = REGIONS.filter(r => r.kind === "main" && r.subs && r.subs.length === 3);
const BAND_COLORS = ["#3f9bc4", "#7173e6", "#e0a040"] as const;   // small / center / large
const BAND_NAMES = ["small", "center", "large"] as const;
// Region + a small padding window we zoom to when you sing inside it.
const regionOf = (cents: number) => MAIN.find(r => cents >= r.lo && cents <= r.hi);

interface Target { cents: number; syl: string; }

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

// Undo octave / harmonic slips relative to the previous pitch (same logic as the
// shared lib; kept local so the trainer's tuning stays independent).
function correctOctave(f: number, prevF: number): number {
  if (!prevF) return f;
  const cands = [f, f * 2, f / 2, f * 3, f / 3, f * 1.5, f / 1.5, f * 4, f / 4];
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
  const [reading, setReading] = useState<Reading | null>(null);
  const [level, setLevel] = useState(0);
  const [guiding, setGuiding] = useState(false);   // guide drone currently sounding
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

  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    (async () => {
      try {
        // Echo cancellation + noise suppression on: cancels our own guide drone
        // and knocks down background/room noise so only your voice is tracked.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        ctxRef.current = ctx;
        if (ctx.state === "suspended") await ctx.resume();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
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
              const tf = targetFreqNear(tonicFreq, targetCents, voiceFreq);
              audioEngine.startRatioDroneVoice(GUIDE_KEY, tf / C4_FREQ, DRONE_GAIN, C4_FREQ).catch(() => {});
              setGuiding(true);
            }
          } else if (guideOnRef.current && now - guideStart >= MIN_DRONE_MS) {
            guideOnRef.current = false; guideNoteRef.current = -1;
            audioEngine.stopRatioDroneVoice(GUIDE_KEY);
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
          const tgts = targetsRef.current;
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
      audioEngine.stopRatioDroneVoice(GUIDE_KEY);
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

  const inTune = reading && Math.abs(reading.offset) <= TOL_CENTS;
  const near = reading ? targets[reading.nearest] : null;
  // Zoom to the interval region you're currently singing in (the closest note's
  // region), so the display shows that individual spectrum, not the whole octave.
  const region = near ? regionOf(near.cents) : null;
  const lo = region ? region.lo : near ? Math.max(0, near.cents - 130) : 0;
  const hi = region ? region.hi : near ? Math.min(1200, near.cents + 130) : 1200;
  const span = hi - lo || 1;
  const posOf = (c: number) => Math.max(0, Math.min(100, ((c - lo) / span) * 100));
  const inWindow = targets.filter(t => t.cents >= lo - 2 && t.cents <= hi + 2);
  const regionLabel = region ? region.name.replace(/s$/, "").toLowerCase() : "";

  return (
    <div className="rounded-lg border border-[#1e1e1e] bg-[#0c0c0c] overflow-hidden">
      <div className="px-3 py-1.5 border-b border-[#161616] flex items-center gap-2 bg-[#0a0a0a]">
        <span className="w-1.5 h-3 rounded-sm" style={{ background: "#7aa87a" }} />
        <span className="text-[10px] font-semibold tracking-widest text-[#8a8a8a]">PITCH TRAINER</span>
        <span className="text-[10px] text-[#6a6a6a]" title="With speakers, the mic hears the drone and mistakes it for your voice. Headphones fix that.">🎧 headphones</span>
        <button onClick={() => { setErr(""); setOn(o => !o); }}
          className={`ml-auto px-2.5 py-0.5 rounded text-[11px] font-semibold border transition-colors ${on ? "bg-[#c04a4a] border-[#c04a4a] text-white" : "bg-[#1a1a1a] border-[#333] text-[#aaa] hover:text-white"}`}>
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
