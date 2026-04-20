import { useState, useRef, useCallback } from "react";
import { audioEngine } from "@/lib/audioEngine";
import { useLS } from "@/lib/storage";
import { recordAnswer } from "@/lib/stats";
import { randomChoice, placeChordInRegister } from "@/lib/musicTheory";
import { getChordShapes } from "@/lib/edoData";

interface Props {
  tonicPc: number;
  lowestOct: number;
  highestOct: number;
  edo: number;
  onHighlight: (pcs: number[]) => void;
  onResult: (text: string) => void;
  onPlay: (optionKey: string, label: string) => void;
  lastPlayed: React.MutableRefObject<{ frames: number[][]; info: string } | null>;
  ensureAudio: () => Promise<void>;
  playVol?: number;
  onAnswer?: (optionKey: string, label: string, correct: boolean) => void;
}

type LoopSize = 2 | 3 | 4;

interface ChordDef {
  label: string;
  build: (sh: ReturnType<typeof getChordShapes>) => number[];
}

const CHORD_POOL: ChordDef[] = [
  { label: "I",  build: sh => sh.MAJ.map(s => s) },
  { label: "IV", build: sh => sh.MAJ.map(s => s + sh.P4) },
  { label: "V",  build: sh => sh.MAJ.map(s => s + sh.P5) },
  { label: "vi", build: sh => sh.MIN.map(s => s + sh.M6) },
];

// Common progressions to draw from
const COMMON_LOOPS: Record<LoopSize, string[][]> = {
  2: [["I","V"], ["I","IV"], ["IV","V"], ["I","vi"], ["vi","IV"]],
  3: [["I","V","vi"], ["I","IV","V"], ["vi","IV","I"], ["IV","V","I"], ["I","vi","IV"]],
  4: [["I","V","vi","IV"], ["vi","IV","I","V"], ["I","IV","V","vi"], ["IV","V","vi","I"], ["I","vi","IV","V"]],
};

export default function ChordLoopsPanel({
  tonicPc, lowestOct, highestOct, edo, onHighlight, onResult, onPlay, lastPlayed, ensureAudio, playVol = 0.6, onAnswer,
}: Props) {
  const [loopSize, setLoopSize] = useLS<LoopSize>("lt_tonal_loop_size", 4);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [userAnswer, setUserAnswer] = useState<string[] | null>(null);
  const [userPicks, setUserPicks] = useState<string[]>([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const correctLoop = useRef<string[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stopTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const stop = () => {
    stopTimers();
    setIsPlaying(false);
    audioEngine.silencePlay();
  };

  const play = useCallback(async () => {
    if (isPlaying) return;
    await ensureAudio();
    stopTimers();

    const sh = getChordShapes(edo);
    const loops = COMMON_LOOPS[loopSize];
    const loop = randomChoice(loops);
    correctLoop.current = loop;

    const midOct = Math.floor((lowestOct + highestOct) / 2);
    const rootAbs = tonicPc + (midOct - 4) * edo;

    const chordMap = Object.fromEntries(CHORD_POOL.map(c => [c.label, c.build(sh)]));
    const frames: number[][] = [];

    // Play the loop once
    for (const label of loop) {
      const shape = chordMap[label];
      if (!shape) continue;
      const notes = placeChordInRegister(
        shape.map(s => rootAbs + s), edo, tonicPc, lowestOct, highestOct, "Fixed Register"
      );
      frames.push(notes);
    }

    lastPlayed.current = { frames, info: loop.join("-") };
    setHasPlayed(true);
    setUserAnswer(null);
    setUserPicks([]);
    setShowAnswer(false);
    setIsPlaying(true);
    onPlay("tonal:loops", `Chord Loop: ${loopSize} chords`);
    onResult(`Listen to the ${loopSize}-chord loop...`);

    audioEngine.playSequence(frames, edo, 1000, 0.65, playVol * 0.7);
    const d = setTimeout(() => setIsPlaying(false), frames.length * 1000 + 500);
    timers.current.push(d);
  }, [isPlaying, ensureAudio, loopSize, tonicPc, edo, lowestOct, highestOct, onResult, onPlay, lastPlayed, playVol]);

  const replay = () => {
    const lp = lastPlayed.current;
    if (!lp || isPlaying) return;
    setIsPlaying(true);
    audioEngine.playSequence(lp.frames, edo, 1000, 0.65, playVol * 0.7);
    const d = setTimeout(() => setIsPlaying(false), lp.frames.length * 1000 + 500);
    timers.current.push(d);
  };

  const handlePick = (label: string) => {
    if (userAnswer !== null || showAnswer) return;
    const newPicks = [...userPicks, label];
    setUserPicks(newPicks);

    if (newPicks.length === loopSize) {
      // Check answer
      setUserAnswer(newPicks);
      const correct = newPicks.every((p, i) => p === correctLoop.current[i]);
      recordAnswer("tonal:loops", `Loop: ${newPicks.join("-")}`, correct);
      onAnswer?.("tonal:loops", `Loop: ${newPicks.join("-")}`, correct);
      onResult(correct
        ? `Correct! ${correctLoop.current.join(" - ")}`
        : `Incorrect — answer was ${correctLoop.current.join(" - ")}`
      );
    }
  };

  const clearPicks = () => {
    if (userAnswer !== null) return;
    setUserPicks([]);
  };

  const handleShowAnswer = async () => {
    await ensureAudio();
    setShowAnswer(true);
    setIsPlaying(true);
    onResult(`Answer: ${correctLoop.current.join(" - ")}`);

    // Play each chord sequentially with keyboard highlight
    const lp = lastPlayed.current;
    if (lp) {
      const loopLen = correctLoop.current.length;
      // Use only the first pass (one loop) of frames
      const onePass = lp.frames.slice(0, loopLen);
      const GAP = 1000;
      for (let i = 0; i < onePass.length; i++) {
        const tid = setTimeout(() => {
          onHighlight(onePass[i]);
          audioEngine.playChord(onePass[i], edo, 0.65, playVol * 0.7);
        }, i * GAP);
        timers.current.push(tid);
      }
      const doneId = setTimeout(() => setIsPlaying(false), onePass.length * GAP + 500);
      timers.current.push(doneId);
    }
  };

  const answered = userAnswer !== null || showAnswer;

  return (
    <div className="space-y-4">
      {/* Config */}
      <div className="flex items-center gap-4 flex-wrap">
        <label className="text-xs text-[#888]">Chords in loop</label>
        {([2, 3, 4] as LoopSize[]).map(n => (
          <button key={n} onClick={() => { setLoopSize(n); setHasPlayed(false); setUserAnswer(null); setUserPicks([]); }}
            className={`px-3 py-1 rounded text-xs border transition-colors ${
              loopSize === n ? "border-[#c8aa50] bg-[#1a1a0e] text-[#c8aa50]" : "border-[#222] bg-[#111] text-[#666]"
            }`}>
            {n}
          </button>
        ))}
      </div>

      {/* Play / Stop / Replay */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={play} disabled={isPlaying}
          className="bg-[#c8aa50] hover:bg-[#a89040] disabled:opacity-50 text-white px-5 py-2 rounded text-sm font-medium transition-colors">
          Play
        </button>
        {isPlaying && (
          <button onClick={stop}
            className="bg-[#3a1a1a] hover:bg-[#4a2020] border border-[#6a3a3a] text-[#e06060] px-4 py-2 rounded text-sm font-bold transition-colors">
            Stop
          </button>
        )}
        {hasPlayed && !isPlaying && (
          <button onClick={replay}
            className="bg-[#1e1e1e] hover:bg-[#2a2a2a] border border-[#333] text-[#aaa] px-4 py-2 rounded text-sm transition-colors">
            Replay
          </button>
        )}
        {hasPlayed && (
          <button onClick={handleShowAnswer} disabled={isPlaying}
            className="bg-[#1e1e1e] hover:bg-[#2a2a2a] disabled:opacity-50 border border-[#444] text-[#c8aa50] px-4 py-2 rounded text-sm transition-colors">
            Show Answer
          </button>
        )}
      </div>

      {/* User picks display */}
      {hasPlayed && !answered && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#666]">Your answer:</span>
          {userPicks.map((p, i) => (
            <span key={i} className="px-2 py-1 bg-[#1a1a0e] border border-[#5a4a22] rounded text-xs text-[#c8aa50]">{p}</span>
          ))}
          {userPicks.length < loopSize && <span className="text-xs text-[#444]">({loopSize - userPicks.length} remaining)</span>}
          {userPicks.length > 0 && (
            <button onClick={clearPicks} className="text-xs text-[#666] hover:text-[#aaa] ml-2">Clear</button>
          )}
        </div>
      )}

      {/* Chord selection buttons */}
      {hasPlayed && !answered && (
        <div className="flex gap-2 flex-wrap">
          {CHORD_POOL.map(c => (
            <button key={c.label} onClick={() => handlePick(c.label)}
              disabled={isPlaying}
              className="px-5 py-2.5 rounded text-sm border font-medium transition-colors bg-[#161616] border-[#2a2a2a] text-[#aaa] hover:bg-[#1e1e1e] hover:border-[#555] disabled:opacity-50">
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Feedback text */}
      {answered && (
        <div className={`text-sm px-3 py-2 rounded border ${
          showAnswer && !userAnswer ? "border-[#555] text-[#c8aa50]"
            : userAnswer && userAnswer.every((p, i) => p === correctLoop.current[i])
              ? "border-[#2a5a2a] text-[#7aaa7a]"
              : "border-[#5a2a2a] text-[#e06060]"
        }`}>
          {showAnswer && !userAnswer
            ? `Answer: ${correctLoop.current.join(" → ")}`
            : userAnswer && userAnswer.every((p, i) => p === correctLoop.current[i])
              ? `Correct! ${correctLoop.current.join(" → ")}`
              : `Incorrect — answer was ${correctLoop.current.join(" → ")}${userAnswer ? ` (you picked ${userAnswer.join(" → ")})` : ""}`
          }
        </div>
      )}
    </div>
  );
}
