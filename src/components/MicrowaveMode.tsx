import { useState, useRef, useCallback, useEffect } from "react";
import { audioEngine } from "@/lib/audioEngine";
import { XEN_INTERVALS_ALL, type XenInterval } from "@/lib/xenIntervals";
import { generateAndSelectGrouping, type GroupingMode } from "@/lib/groupingSelector";

const DONE_EMOJIS = [
  "🍕", "🌮", "🍔", "🍟", "🍩", "🧁", "🍪", "🎂", "🍿", "🌭",
  "🥪", "🧀", "🍗", "🥓", "🍳", "🥞", "🫕", "🍜", "🍣", "🥡",
  "🔥", "✨", "💥", "🎉", "🎊", "⭐", "🌟", "💫", "🫠", "😋",
  "🤤", "😤", "💪", "🎵", "🎶", "🎸", "🎹", "🎺", "🥁", "🎷",
];

const MICROWAVE_IMAGES = [
  "mozart.jpg",
  "plato.jpg",
  "aristotle.jpg",
  "hegel.jpg",
  "wittgenstein.jpg",
  "whitehead.jpg",
  "tony-williams.jpg",
  "elvin-jones.jpg",
  "joe-pass.jpg",
  "herbie-hancock.jpg",
  "thelonious-monk.jpg",
  "bill-evans.jpg",
  "brahms.jpg",
  "chopin.jpg",
  "beethoven.jpg",
  "bach.jpg",
];

function pickRandomImages(count: number): string[] {
  const shuffled = [...MICROWAVE_IMAGES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Filter to intervals within 2 octaves that sound interesting as drones
const DRONE_INTERVALS = XEN_INTERVALS_ALL.filter(
  (iv) => iv.cents > 50 && iv.cents < 2400
);

function pickRandomInterval(): XenInterval {
  return DRONE_INTERVALS[Math.floor(Math.random() * DRONE_INTERVALS.length)];
}

type Phase = "idle" | "cooking" | "done" | "exploded";

export default function MicrowaveMode({ edo = 12 }: { edo?: number }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [timeLeft, setTimeLeft] = useState(60);
  const [totalTime, setTotalTime] = useState(60);
  const [inputTime, setInputTime] = useState("1:00");
  const [currentInterval, setCurrentInterval] = useState<XenInterval | null>(null);
  const [spawnedEmojis, setSpawnedEmojis] = useState<
    { id: number; emoji: string; x: number; y: number; delay: number }[]
  >([]);
  const [plateSpinDeg, setPlateSpinDeg] = useState(0);
  const [explosionStage, setExplosionStage] = useState<"none" | "sauce" | "flash" | "wasteland" | "recovering">("none");
  const explosionTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [displayImages, setDisplayImages] = useState<string[]>(() => pickRandomImages(6));
  // Spherical rotation for the 3D scene inside the microwave
  const [sphereRot, setSphereRot] = useState({ x: 0, y: 0, z: 0 });
  const sphereTargetRef = useRef({ theta: 0, phi: 0, spin: 0 });
  const sphereCurrentRef = useRef({ theta: 0, phi: 0, spin: 0 });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const humRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idCounter = useRef(0);

  const ensureAudio = useCallback(async () => {
    await audioEngine.init(edo);
    audioEngine.resume();
  }, [edo]);

  /* ── pulse interval in solkattu-style groupings ── */
  const pulseTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const previousGroupingsRef = useRef<number[][]>([]);
  const cancelledRef = useRef(false);

  const stopPulsing = useCallback(() => {
    cancelledRef.current = true;
    for (const t of pulseTimeoutsRef.current) clearTimeout(t);
    pulseTimeoutsRef.current = [];
  }, []);

  const startPulsing = useCallback((ratio: number) => {
    stopPulsing();
    cancelledRef.current = false;

    const PULSE_MS = 120;
    const GAP_MS = 220;
    const CYCLE_MS = 3000;

    const mode: GroupingMode = Math.random() < 0.5 ? "musical" : "awkward";

    const scheduleGroupingCycle = () => {
      if (cancelledRef.current) return;

      const totalPulses = 5 + Math.floor(Math.random() * 6);
      const grouping = generateAndSelectGrouping(
        totalPulses, mode, Math.min(totalPulses, 6), previousGroupingsRef.current,
      ) ?? [totalPulses];

      previousGroupingsRef.current.push(grouping);
      if (previousGroupingsRef.current.length > 8) previousGroupingsRef.current.shift();

      let t = 0;
      for (const groupSize of grouping) {
        for (let i = 0; i < groupSize; i++) {
          const delay = t;
          const isAccent = i === 0;
          const tid = setTimeout(() => {
            if (cancelledRef.current) return;
            audioEngine.playRatioChord(
              [1, ratio],
              isAccent ? 0.35 : 0.2,
              isAccent ? 0.45 : 0.3,
            );
          }, delay);
          pulseTimeoutsRef.current.push(tid);
          t += PULSE_MS;
        }
        t += GAP_MS;
      }

      const tid = setTimeout(scheduleGroupingCycle, CYCLE_MS);
      pulseTimeoutsRef.current.push(tid);
    };

    scheduleGroupingCycle();
  }, [stopPulsing]);

  /* ── nuclear explosion sequence ── */
  const triggerExplosion = useCallback(() => {
    stopPulsing();
    if (timerRef.current) clearInterval(timerRef.current);
    if (humRef.current) clearInterval(humRef.current);
    timerRef.current = null;
    humRef.current = null;

    const savedTimeLeft = timeLeft;
    const base = import.meta.env.BASE_URL ?? "/";

    // Clear any previous explosion timers
    for (const t of explosionTimersRef.current) clearTimeout(t);
    explosionTimersRef.current = [];

    // 1) Play "too much sauce" audio (no overlay, just audio)
    setPhase("exploded");
    setExplosionStage("sauce");
    const narration = new Audio(`${base}too-much-sauce.mp3`);
    narration.volume = 1;
    narration.play().catch(() => {});

    // 2) After sauce audio (~1.5s), flash + boom
    const t1 = setTimeout(() => {
      setExplosionStage("flash");
      const boom = new Audio(`${base}nuke-boom.mp3`);
      boom.volume = 0.8;
      boom.play().catch(() => {});
    }, 1500);

    // 3) Wasteland video (0.4s after flash)
    const t2 = setTimeout(() => setExplosionStage("wasteland"), 1900);

    // 4) Video plays for 8s, then fade out and recover
    const t3 = setTimeout(() => setExplosionStage("recovering"), 9900);

    // 5) Fade-out takes ~2s, then reset to idle
    const t4 = setTimeout(() => {
      setExplosionStage("none");
      setPhase("idle");
      setTimeLeft(60);
      setInputTime("1:00");
      setCurrentInterval(null);
    }, 11900);

    explosionTimersRef.current = [t1, t2, t3, t4];
  }, [stopPulsing, timeLeft]);

  const droneIntervalRef = useRef(() => {});
  const droneInterval = useCallback(() => {
    const iv = pickRandomInterval();
    setCurrentInterval(iv);
    startPulsing(iv.n / iv.d);
  }, [startPulsing]);
  droneIntervalRef.current = droneInterval;

  /* ── BotW item-get jingle (MP3) ── */
  const jingleRef = useRef<HTMLAudioElement | null>(null);
  const playPickupJingle = useCallback(() => {
    stopPulsing();
    const base = import.meta.env.BASE_URL ?? "/";
    const audio = new Audio(`${base}item-get.mp3`);
    audio.volume = 0.7;
    audio.play().catch(() => {});
    jingleRef.current = audio;
  }, [stopPulsing]);

  /* ── spawn emoji explosion ── */
  const spawnEmojis = useCallback(() => {
    const count = 15 + Math.floor(Math.random() * 10);
    const emojis: typeof spawnedEmojis = [];
    for (let i = 0; i < count; i++) {
      emojis.push({
        id: idCounter.current++,
        emoji: DONE_EMOJIS[Math.floor(Math.random() * DONE_EMOJIS.length)],
        x: 10 + Math.random() * 80,
        y: 10 + Math.random() * 70,
        delay: Math.random() * 0.8,
      });
    }
    setSpawnedEmojis(emojis);
  }, []);

  /* ── parse time input ── */
  const parseTime = (s: string): number => {
    const trimmed = s.trim();
    if (trimmed.includes(":")) {
      const [m, sec] = trimmed.split(":");
      return (parseInt(m) || 0) * 60 + (parseInt(sec) || 0);
    }
    const n = parseInt(trimmed);
    return isNaN(n) ? 60 : n;
  };

  /* ── start cooking ── */
  const startCook = useCallback(
    async () => {
      await ensureAudio();
      setExplosionStage("none");
      const seconds = Math.max(5, parseTime(inputTime));
      setTotalTime(seconds);
      setTimeLeft(seconds);
      setPhase("cooking");
      setDisplayImages(pickRandomImages(6));
      setSpawnedEmojis([]);
      setCurrentInterval(null);

      droneInterval();

      humRef.current = setInterval(() => {
        droneInterval();
      }, 3000);

      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            clearInterval(humRef.current!);
            timerRef.current = null;
            humRef.current = null;
            setPhase("done");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [ensureAudio, droneInterval, inputTime]
  );

  /* ── random explosion chance while cooking ── */
  const explosionCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (phase !== "cooking") return;
    explosionCheckRef.current = setInterval(() => {
      // ~50% chance per second
      if (Math.random() < 0.50) {
        clearInterval(explosionCheckRef.current!);
        explosionCheckRef.current = null;
        triggerExplosion();
      }
    }, 1000);
    return () => {
      if (explosionCheckRef.current) clearInterval(explosionCheckRef.current);
    };
  }, [phase, triggerExplosion]);

  /* ── when done → play jingle + emoji burst ── */
  useEffect(() => {
    if (phase === "done") {
      playPickupJingle();
      spawnEmojis();
    }
  }, [phase, playPickupJingle, spawnEmojis]);

  /* ── plate spin + continuous spherical rotation ── */
  useEffect(() => {
    if (phase !== "cooking") return;
    // Reset to upright when cooking starts
    sphereCurrentRef.current = { theta: 0, phi: 0, spin: 0 };
    setSphereRot({ x: 0, y: 0, z: 0 });

    let raf: number;
    let last = performance.now();

    // Random angular velocities (radians/sec) — each axis drifts at its own speed
    // Periodically nudge these so the path doesn't repeat exactly
    let vTheta = (0.3 + Math.random() * 0.5) * (Math.random() < 0.5 ? 1 : -1);
    let vPhi   = (0.2 + Math.random() * 0.4) * (Math.random() < 0.5 ? 1 : -1);
    let vSpin  = (0.15 + Math.random() * 0.3) * (Math.random() < 0.5 ? 1 : -1);
    let nextNudge = performance.now() + 3000 + Math.random() * 4000;

    const animate = (now: number) => {
      const dtSec = (now - last) / 1000;
      last = now;

      // Turntable flat spin
      setPlateSpinDeg((d) => (d + dtSec * 60 * 0.06) % 360);

      // Nudge velocities occasionally for variety
      if (now > nextNudge) {
        vTheta += (Math.random() - 0.5) * 0.4;
        vPhi   += (Math.random() - 0.5) * 0.3;
        vSpin  += (Math.random() - 0.5) * 0.2;
        // Clamp so it doesn't get too fast or too slow
        vTheta = Math.max(-1.2, Math.min(1.2, vTheta));
        vPhi   = Math.max(-0.8, Math.min(0.8, vPhi));
        vSpin  = Math.max(-0.6, Math.min(0.6, vSpin));
        nextNudge = now + 3000 + Math.random() * 4000;
      }

      // Advance angles continuously
      const cur = sphereCurrentRef.current;
      cur.theta += vTheta * dtSec;
      cur.phi   += vPhi * dtSec;
      cur.spin  += vSpin * dtSec;

      // Convert to degrees for CSS
      const rx = cur.phi * (180 / Math.PI);
      const ry = cur.theta * (180 / Math.PI);
      const rz = cur.spin * (180 / Math.PI);

      setSphereRot({ x: rx, y: ry, z: rz });

      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  /* ── cleanup on unmount ── */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (humRef.current) clearInterval(humRef.current);
      if (explosionCheckRef.current) clearInterval(explosionCheckRef.current);
      for (const t of explosionTimersRef.current) clearTimeout(t);
      stopPulsing();
    };
  }, []);

  const stopCook = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (humRef.current) clearInterval(humRef.current);
    if (explosionCheckRef.current) clearInterval(explosionCheckRef.current);
    for (const t of explosionTimersRef.current) clearTimeout(t);
    timerRef.current = null;
    humRef.current = null;
    stopPulsing();
    setPhase("idle");
    setExplosionStage("none");
    setSpawnedEmojis([]);
    setCurrentInterval(null);
  };

  const progress = totalTime > 0 ? ((totalTime - timeLeft) / totalTime) * 100 : 0;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && phase === "idle") startCook();
  };

  const isCooking = phase === "cooking";
  const isDone = phase === "done";
  const isExploded = phase === "exploded";
  const lightColor = isCooking ? "rgba(255,190,50," : isDone ? "rgba(74,222,128," : "rgba(100,100,100,";

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 py-8 relative overflow-hidden select-none">
      {/* ── Emoji explosion overlay ── */}
      {spawnedEmojis.map((e) => (
        <span
          key={e.id}
          className="absolute text-3xl pointer-events-none"
          style={{
            left: `${e.x}%`,
            top: `${e.y}%`,
            animation: `emoji-pop 1.2s ease-out ${e.delay}s both`,
          }}
        >
          {e.emoji}
        </span>
      ))}

      {/* ── Nuclear flash ── */}
      {isExploded && explosionStage === "flash" && (
        <div className="fixed inset-0 z-50 pointer-events-none" style={{
          background: "white",
          animation: "nuke-flash 0.4s ease-out forwards",
        }} />
      )}

      {/* ── Wasteland video ── */}
      {(explosionStage === "wasteland" || explosionStage === "recovering") && (
        <div className="fixed inset-0 z-30 pointer-events-none" style={{
          animation: explosionStage === "recovering" ? "wasteland-fade 2s ease-in forwards" : "none",
        }}>
          <video
            autoPlay
            muted
            playsInline
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            src={`${import.meta.env.BASE_URL ?? "/"}wasteland-video.mp4`}
          />
        </div>
      )}

      {/* ── Microwave graphic ── */}
      <div className="relative" style={{
        opacity: isExploded ? 0 : 1,
        pointerEvents: isExploded ? "none" as const : "auto" as const,
        transition: isExploded ? "opacity 0.3s ease-out" : "opacity 1.5s ease-in",
      }}>
        {/* Outer body */}
        <div
          className="relative rounded-2xl border-2 border-[#3a3a3a] shadow-2xl"
          style={{
            width: 420, height: 300,
            background: "linear-gradient(145deg, #222 0%, #1a1a1a 50%, #151515 100%)",
            boxShadow: "8px 8px 0 #111, 10px 10px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
            transform: "perspective(800px) rotateY(-2deg) rotateX(1deg)",
          }}
        >
          {/* Top edge highlight */}
          <div
            className="absolute top-0 left-0 right-0 h-px rounded-t-2xl"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)" }}
          />

          {/* ══════════════════════════════════════════════════════════
              Window — CSS 3D room with piano, Bach bust, trumpet
              ══════════════════════════════════════════════════════════ */}
          <div
            className="absolute rounded-xl overflow-hidden"
            style={{
              left: 20, top: 20, width: 260, height: 220,
              border: "2px solid #222",
              boxShadow: "inset 0 0 30px rgba(0,0,0,0.8), 0 0 0 1px #333",
              background: "#080808",
            }}
          >
            {/* 3D room walls via CSS transforms */}
            <div className="absolute inset-0" style={{ perspective: 350, perspectiveOrigin: "50% 42%", transformStyle: "preserve-3d" }}>
              {/* Back wall */}
              <div style={{
                position: "absolute", left: 0, top: 0, width: 260, height: 220,
                transform: "translateZ(-100px)",
                background: isCooking
                  ? "linear-gradient(180deg, #1c1700 0%, #0e0c00 100%)"
                  : "#0e0e0e",
                boxShadow: "inset 0 0 60px rgba(0,0,0,0.6)",
              }}>
                {/* Perforated metal dots */}
                <div style={{
                  position: "absolute", inset: 0,
                  background: "radial-gradient(circle 1px, rgba(255,255,255,0.03) 1px, transparent 1px)",
                  backgroundSize: "10px 10px",
                }} />
                {/* Horizontal panel lines */}
                <div style={{
                  position: "absolute", inset: 0,
                  background: "repeating-linear-gradient(0deg, transparent, transparent 54px, rgba(255,255,255,0.015) 54px, rgba(255,255,255,0.015) 55px)",
                }} />
              </div>

              {/* Floor */}
              <div style={{
                position: "absolute", left: 0, bottom: 0, width: 260, height: 100,
                transformOrigin: "bottom center", transform: "rotateX(90deg)",
                background: isCooking
                  ? "linear-gradient(180deg, #181400 0%, #0c0a00 100%)"
                  : "linear-gradient(180deg, #141414 0%, #0a0a0a 100%)",
              }} />

              {/* Ceiling */}
              <div style={{
                position: "absolute", left: 0, top: 0, width: 260, height: 100,
                transformOrigin: "top center", transform: "rotateX(-90deg)",
                background: isCooking
                  ? "linear-gradient(180deg, #0a0800 0%, #141000 100%)"
                  : "linear-gradient(180deg, #0a0a0a 0%, #111 100%)",
              }}>
                {isCooking && <div style={{
                  position: "absolute", bottom: 0, left: "20%", width: "60%", height: 8,
                  background: "rgba(255,200,50,0.15)", borderRadius: 4, filter: "blur(4px)",
                }} />}
              </div>

              {/* Left wall */}
              <div style={{
                position: "absolute", left: 0, top: 0, width: 100, height: 220,
                transformOrigin: "left center", transform: "rotateY(90deg)",
                background: isCooking
                  ? "linear-gradient(90deg, #100e00 0%, #0a0800 100%)"
                  : "linear-gradient(90deg, #0c0c0c 0%, #080808 100%)",
              }} />

              {/* Right wall */}
              <div style={{
                position: "absolute", right: 0, top: 0, width: 100, height: 220,
                transformOrigin: "right center", transform: "rotateY(-90deg)",
                background: isCooking
                  ? "linear-gradient(-90deg, #100e00 0%, #0a0800 100%)"
                  : "linear-gradient(-90deg, #0c0c0c 0%, #080808 100%)",
              }} />
            </div>

            {/* Interior warm light */}
            {isCooking && (
              <div className="absolute inset-0 pointer-events-none" style={{
                background: "radial-gradient(ellipse at 50% 25%, rgba(255,190,50,0.14) 0%, rgba(255,160,20,0.04) 55%, transparent 80%)",
                animation: "microwave-glow 2s ease-in-out infinite",
              }} />
            )}

            {/* ── Turntable ── */}
            <div className="absolute" style={{ left: "50%", bottom: 8, transform: "translateX(-50%)" }}>
              {/* Shadow ellipse */}
              <div style={{
                width: 170, height: 16, marginLeft: -85,
                background: "radial-gradient(ellipse, rgba(0,0,0,0.5) 0%, transparent 70%)",
                filter: "blur(3px)",
              }} />
              {/* Glass disc */}
              <div style={{
                width: 170, height: 22, marginLeft: -85, marginTop: -12,
                borderRadius: "50%",
                background: "radial-gradient(ellipse at 40% 30%, rgba(50,50,50,0.5) 0%, rgba(25,25,25,0.3) 100%)",
                border: "1px solid rgba(70,70,70,0.2)",
                boxShadow: "inset 0 0 10px rgba(0,0,0,0.4)",
                transform: `rotate(${isCooking ? plateSpinDeg : 0}deg)`,
                position: "relative",
              }}>
                <div style={{
                  position: "absolute", left: "50%", top: "50%", width: 110, height: 14,
                  transform: "translate(-50%, -50%)", borderRadius: "50%",
                  border: "1px solid rgba(70,70,70,0.1)",
                }} />
              </div>
            </div>

            {/* ── 3D orbiting portrait images — fills the whole window ── */}
            <div className="absolute" style={{
              left: 130, top: 110, width: 0, height: 0,
              perspective: 400,
              perspectiveOrigin: "50% 50%",
            }}>
              <div style={{
                transformStyle: "preserve-3d",
                transform: isCooking
                  ? `rotateX(${sphereRot.x}deg) rotateY(${sphereRot.y}deg) rotateZ(${sphereRot.z}deg)`
                  : "none",
                transition: phase === "idle" ? "transform 0.5s ease-out" : "none",
                width: 0, height: 0,
                position: "relative",
              }}>
                {/* ═══ Portrait Images spread on a sphere (Fibonacci) ═══ */}
                {displayImages.map((img, i) => {
                  const base = import.meta.env.BASE_URL ?? "/";
                  const n = displayImages.length;
                  const radius = 90;
                  // Fibonacci sphere: even distribution across the full sphere
                  const golden = (1 + Math.sqrt(5)) / 2;
                  const theta = Math.acos(1 - (2 * (i + 0.5)) / n); // polar angle 0..PI
                  const phi = 2 * Math.PI * i / golden;              // azimuth
                  // Convert to rotateY (azimuth) + rotateX (elevation) + translateZ
                  const yAngle = (phi * 180) / Math.PI;
                  const xTilt = 90 - (theta * 180) / Math.PI;
                  return (
                    <div
                      key={img}
                      style={{
                        position: "absolute",
                        transformStyle: "preserve-3d",
                        transform: `rotateY(${yAngle}deg) rotateX(${xTilt}deg) translateZ(${radius}px)`,
                        left: -29, top: -38,
                      }}
                    >
                      {/* Front face */}
                      <img
                        src={`${base}microwave/${img}`}
                        alt=""
                        style={{
                          width: 58, height: 75,
                          objectFit: "cover",
                          borderRadius: 4,
                          border: "1px solid rgba(255,255,255,0.08)",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
                          filter: isCooking ? "sepia(0.3) brightness(0.9)" : "brightness(0.7) grayscale(0.3)",
                          transition: "filter 0.5s ease",
                          backfaceVisibility: "hidden",
                        }}
                      />
                      {/* Back face — mirrored copy so it's not paper-thin */}
                      <img
                        src={`${base}microwave/${img}`}
                        alt=""
                        style={{
                          position: "absolute",
                          top: 0, left: 0,
                          width: 58, height: 75,
                          objectFit: "cover",
                          borderRadius: 4,
                          border: "1px solid rgba(255,255,255,0.08)",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
                          filter: isCooking ? "sepia(0.3) brightness(0.8)" : "brightness(0.6) grayscale(0.3)",
                          transition: "filter 0.5s ease",
                          transform: "rotateY(180deg)",
                          backfaceVisibility: "hidden",
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* ═══ Floating music notes (cooking) ═══ */}
              {isCooking && (
                <>
                  <span className="absolute" style={{ left: -100, top: -80, fontSize: 22, color: `${lightColor}0.5)`, animation: "float-note 3s ease-in-out infinite" }}>&#9835;</span>
                  <span className="absolute" style={{ right: -100, top: -60, fontSize: 17, color: `${lightColor}0.4)`, animation: "float-note 2.5s ease-in-out 0.5s infinite" }}>&#9834;</span>
                  <span className="absolute" style={{ left: -15, top: -90, fontSize: 19, color: `${lightColor}0.35)`, animation: "float-note 3.5s ease-in-out 1s infinite" }}>&#9833;</span>
                  <span className="absolute" style={{ left: -55, top: -65, fontSize: 15, color: `${lightColor}0.3)`, animation: "float-note 4s ease-in-out 1.5s infinite" }}>&#9839;</span>
                </>
              )}
            </div>

            {/* Depth vignette */}
            <div className="absolute inset-0 pointer-events-none" style={{
              boxShadow: "inset 12px 0 25px rgba(0,0,0,0.6), inset -12px 0 25px rgba(0,0,0,0.6), inset 0 12px 25px rgba(0,0,0,0.5), inset 0 -8px 20px rgba(0,0,0,0.5)",
            }} />

            {/* Glass reflection */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 25%, transparent 75%, rgba(255,255,255,0.02) 100%)",
              borderRadius: "inherit",
            }} />
          </div>

          {/* Control panel (right side) */}
          <div
            className="absolute flex flex-col items-center gap-2 py-3"
            style={{
              right: 12, top: 20, width: 110, height: 220,
              background: "linear-gradient(180deg, #1e1e1e 0%, #181818 100%)",
              borderRadius: 8, border: "1px solid #2a2a2a",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
            }}
          >
            {/* Digital display — interval name */}
            <div
              className="w-[96px] rounded border border-[#333] bg-black px-1.5 py-1 text-center font-mono text-[11px] leading-tight overflow-hidden"
              style={{
                color: isDone ? "#4ade80" : isCooking ? "#facc15" : "#444",
                textShadow: isCooking ? "0 0 6px rgba(250,204,21,0.4)" : isDone ? "0 0 6px rgba(74,222,128,0.4)" : "none",
                minHeight: 32, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}
            >
              {isDone && <span className="text-sm font-bold">DONE</span>}
              {isCooking && currentInterval && (
                <>
                  <span className="text-[10px] text-[#666]">{currentInterval.n}/{currentInterval.d}</span>
                  <span className="truncate w-full" title={currentInterval.name}>{currentInterval.name}</span>
                </>
              )}
              {phase === "idle" && <span className="text-[#333]">---</span>}
            </div>

            {/* Timer display */}
            <div
              className="w-[96px] rounded border border-[#333] bg-black px-2 py-1 text-center font-mono text-lg"
              style={{
                color: isDone ? "#4ade80" : isCooking ? "#facc15" : "#666",
                textShadow: isCooking ? "0 0 6px rgba(250,204,21,0.4)" : isDone ? "0 0 6px rgba(74,222,128,0.4)" : "none",
              }}
            >
              {formatTime(timeLeft)}
            </div>

            {/* Progress bar */}
            <div className="w-[96px] h-1.5 bg-[#222] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${progress}%`,
                  background: isDone ? "#4ade80" : "linear-gradient(90deg, #facc15, #f97316)",
                }}
              />
            </div>

            {/* Time input + start / stop */}
            <div className="flex flex-col gap-1.5 w-[96px] mt-auto">
              {phase === "idle" ? (
                <>
                  <input
                    type="text"
                    value={inputTime}
                    onChange={(e) => setInputTime(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="M:SS"
                    className="w-full px-2 py-1 rounded text-xs font-mono bg-black border border-[#333] text-[#aaa] text-center focus:outline-none focus:border-[#555]"
                  />
                  <button
                    onClick={startCook}
                    className="w-full px-1 py-1.5 rounded text-xs font-bold bg-[#1a2a1a] border border-[#2a4a2a] text-green-500 hover:bg-[#2a3a2a] hover:text-green-400 transition-colors"
                  >
                    START
                  </button>
                </>
              ) : (
                <button
                  onClick={stopCook}
                  className="w-full px-1 py-1.5 rounded text-xs font-medium bg-[#3a1a1a] border border-[#5a2a2a] text-[#cc6666] hover:bg-[#4a2a2a] hover:text-[#ff7777] transition-colors"
                >
                  STOP
                </button>
              )}
              {isDone && (
                <button
                  onClick={() => {
                    setPhase("idle");
                    setSpawnedEmojis([]);
                    setCurrentInterval(null);
                    setTimeLeft(parseTime(inputTime));
                  }}
                  className="w-full px-1 py-1.5 rounded text-xs font-medium bg-[#1a2a1a] border border-[#2a4a2a] text-green-500 hover:bg-[#2a3a2a] transition-colors"
                >
                  RESET
                </button>
              )}
            </div>
          </div>

          {/* Handle */}
          <div className="absolute rounded" style={{
            left: 10, top: 250, width: 270, height: 8,
            background: "linear-gradient(180deg, #444 0%, #333 40%, #222 100%)",
            boxShadow: "0 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
          }} />

          {/* Vent holes */}
          <div className="absolute flex gap-1" style={{ right: 20, top: 252 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-full" style={{ width: 3, height: 3, background: "#111", boxShadow: "inset 0 1px 1px rgba(0,0,0,0.5)" }} />
            ))}
          </div>

          {/* Feet */}
          <div className="absolute rounded-b" style={{ left: 30, bottom: -8, width: 35, height: 8, background: "linear-gradient(180deg, #2a2a2a, #1a1a1a)", boxShadow: "0 2px 3px rgba(0,0,0,0.5)" }} />
          <div className="absolute rounded-b" style={{ right: 30, bottom: -8, width: 35, height: 8, background: "linear-gradient(180deg, #2a2a2a, #1a1a1a)", boxShadow: "0 2px 3px rgba(0,0,0,0.5)" }} />

          {/* Side panel depth */}
          <div className="absolute top-0 right-0 bottom-0 w-[3px] rounded-r-2xl" style={{ background: "linear-gradient(180deg, #2a2a2a, #151515)" }} />
        </div>

        {/* Brand label */}
        <div className="text-center mt-3 text-[10px] text-[#444] tracking-[0.3em] uppercase font-mono">
          IntervalWave 3000
        </div>
      </div>

      {/* ── CSS animations ── */}
      <style>{`
        @keyframes emoji-pop {
          0% { opacity: 0; transform: scale(0) rotate(0deg); }
          30% { opacity: 1; transform: scale(1.3) rotate(20deg); }
          100% { opacity: 0; transform: scale(0.8) translateY(-60px) rotate(-10deg); }
        }
        @keyframes microwave-glow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes float-note {
          0%, 100% { transform: translateY(0); opacity: 0.7; }
          50% { transform: translateY(-12px); opacity: 1; }
        }
        @keyframes nuke-flash {
          0% { opacity: 1; }
          60% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes wasteland-fade {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
