import { useState, useRef, useCallback } from "react";
import { audioEngine } from "@/lib/audioEngine";
import { useLS } from "@/lib/storage";
import { recordAnswer } from "@/lib/stats";
import { randomChoice, strictWindowBounds, placeChordInRegister } from "@/lib/musicTheory";
import { getChordShapes } from "@/lib/edoData";
import TonalVisualizer from "./TonalVisualizer";
import { formatRomanNumeral } from "@/lib/formatRoman";

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

type Tonality = "major" | "minor" | "dorian";

interface FunctionDef {
  label: string;
  romanNumeral: string;
  buildShape: (sh: ReturnType<typeof getChordShapes>) => number[];
}

const FUNCTIONS: Record<Tonality, FunctionDef[]> = {
  major: [
    { label: "Tonic (I)", romanNumeral: "I", buildShape: sh => sh.MAJ.map(s => s) },
    { label: "Subdominant (IV)", romanNumeral: "IV", buildShape: sh => sh.MAJ.map(s => s + sh.P4) },
    { label: "Dominant (V)", romanNumeral: "V", buildShape: sh => sh.MAJ.map(s => s + sh.P5) },
    { label: "vi", romanNumeral: "vi", buildShape: sh => sh.MIN.map(s => s + sh.M6) },
  ],
  minor: [
    { label: "Tonic (i)", romanNumeral: "i", buildShape: sh => sh.MIN.map(s => s) },
    { label: "Subdominant (iv)", romanNumeral: "iv", buildShape: sh => sh.MIN.map(s => s + sh.P4) },
    { label: "Dominant (V)", romanNumeral: "V", buildShape: sh => sh.MAJ.map(s => s + sh.P5) },
  ],
  dorian: [
    { label: "Tonic (i)", romanNumeral: "i", buildShape: sh => sh.MIN.map(s => s) },
    { label: "Subdominant (IV)", romanNumeral: "IV", buildShape: sh => sh.MAJ.map(s => s + sh.P4) },
    { label: "Subtonic (bVII)", romanNumeral: "bVII", buildShape: sh => sh.MAJ.map(s => s + sh.m7) },
  ],
};

const TONALITY_LABELS: Record<Tonality, string> = {
  major: "Major", minor: "Minor", dorian: "Dorian",
};

export default function FunctionIdPanel({
  tonicPc, lowestOct, highestOct, edo, onHighlight, onResult, onPlay, lastPlayed, ensureAudio, playVol = 0.6, onAnswer,
}: Props) {
  const [tonality, setTonality] = useLS<Tonality>("lt_tonal_func_tonality", "major");
  const [playContext, setPlayContext] = useLS<boolean>("lt_tonal_func_context", true);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [userAnswer, setUserAnswer] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const correctAnswer = useRef<string>("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stopTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const play = useCallback(async () => {
    if (isPlaying) return;
    await ensureAudio();
    stopTimers();

    const sh = getChordShapes(edo);
    const funcs = FUNCTIONS[tonality];
    const target = randomChoice(funcs);
    correctAnswer.current = target.label;

    const midOct = Math.floor((lowestOct + highestOct) / 2);
    const rootAbs = tonicPc + (midOct - 4) * edo;

    // Build tonic chord for context
    const tonicShape = funcs[0].buildShape(sh);
    const tonicNotes = tonicShape.map(s => rootAbs + s);

    // Build target chord
    const targetShape = target.buildShape(sh);
    const targetNotes = placeChordInRegister(
      targetShape.map(s => rootAbs + s), edo, tonicPc, lowestOct, highestOct, "Fixed Register"
    );

    setHasPlayed(true);
    setUserAnswer(null);
    setShowAnswer(false);
    setIsPlaying(true);

    onPlay(`tonal:func:${tonality}`, `Function ID: ${TONALITY_LABELS[tonality]}`);

    if (playContext) {
      // Play tonic first, then target
      const contextNotes = placeChordInRegister(tonicNotes, edo, tonicPc, lowestOct, highestOct, "Fixed Register");
      lastPlayed.current = { frames: [contextNotes, targetNotes], info: target.label };
      onResult("Listen: tonic context, then identify the chord...");
      audioEngine.playChord(contextNotes, edo, 1.2, playVol * 0.7);
      const t = setTimeout(() => {
        audioEngine.playChord(targetNotes, edo, 1.5, playVol);
        const d = setTimeout(() => setIsPlaying(false), 2000);
        timers.current.push(d);
      }, 1400);
      timers.current.push(t);
    } else {
      lastPlayed.current = { frames: [targetNotes], info: target.label };
      onResult("Identify this chord function...");
      audioEngine.playChord(targetNotes, edo, 1.5, playVol);
      const d = setTimeout(() => setIsPlaying(false), 2000);
      timers.current.push(d);
    }
  }, [isPlaying, ensureAudio, tonality, playContext, tonicPc, edo, lowestOct, highestOct, onResult, onPlay, lastPlayed, onHighlight, playVol]);

  const replay = () => {
    const lp = lastPlayed.current;
    if (!lp || isPlaying) return;
    setIsPlaying(true);
    let delay = 0;
    for (const frame of lp.frames) {
      const d = setTimeout(() => {
        audioEngine.playChord(frame, edo, 1.3, playVol);
      }, delay);
      timers.current.push(d);
      delay += 1400;
    }
    const d = setTimeout(() => setIsPlaying(false), delay + 500);
    timers.current.push(d);
  };

  const revealHighlight = () => {
    const lp = lastPlayed.current;
    if (lp && lp.frames.length) onHighlight(lp.frames[lp.frames.length - 1]);
  };

  const handleAnswer = (ans: string) => {
    if (userAnswer !== null || showAnswer) return;
    setUserAnswer(ans);
    const correct = ans === correctAnswer.current;
    recordAnswer(`tonal:func:${tonality}`, `Function: ${ans}`, correct);
    onAnswer?.(`tonal:func:${tonality}`, `Function: ${ans}`, correct);
    onResult(correct ? `Correct! ${correctAnswer.current}` : `Incorrect — answer was ${correctAnswer.current}`);
    revealHighlight();
  };

  const handleShowAnswer = () => {
    setShowAnswer(true);
    onResult(`Answer: ${correctAnswer.current}`);
    revealHighlight();
  };

  const answered = userAnswer !== null || showAnswer;
  const funcs = FUNCTIONS[tonality];

  return (
    <div className="space-y-4">
      {/* Config */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="text-xs text-[#888] block mb-1.5">Tonality</label>
          <div className="flex gap-1">
            {(Object.keys(TONALITY_LABELS) as Tonality[]).map(t => (
              <button key={t} onClick={() => { setTonality(t); setHasPlayed(false); setUserAnswer(null); }}
                className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                  tonality === t
                    ? "border-[#c8aa50] bg-[#1a1a0e] text-[#c8aa50]"
                    : "border-[#222] bg-[#111] text-[#666] hover:text-[#aaa] hover:border-[#444]"
                }`}>
                {TONALITY_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-1.5 text-xs cursor-pointer text-[#aaa]">
          <input type="checkbox" checked={playContext} onChange={() => setPlayContext(!playContext)} className="accent-[#c8aa50]" />
          Play tonic context first
        </label>
      </div>

      {/* Play / Replay */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={play} disabled={isPlaying}
          className="bg-[#c8aa50] hover:bg-[#a89040] disabled:opacity-50 text-white px-5 py-2 rounded text-sm font-medium transition-colors">
          ▶ Play
        </button>
        {hasPlayed && (
          <button onClick={replay} disabled={isPlaying}
            className="bg-[#1e1e1e] hover:bg-[#2a2a2a] disabled:opacity-50 border border-[#333] text-[#aaa] px-4 py-2 rounded text-sm transition-colors">
            Replay
          </button>
        )}
        {hasPlayed && !answered && (
          <button onClick={handleShowAnswer}
            className="bg-[#1e1e1e] hover:bg-[#2a2a2a] border border-[#444] text-[#c8aa50] px-4 py-2 rounded text-sm transition-colors">
            Show Answer
          </button>
        )}
      </div>

      {/* Visualizer — show after answering */}
      {answered && lastPlayed.current && (
        <TonalVisualizer
          frames={lastPlayed.current.frames}
          edo={edo}
          label={`Function ID: ${TONALITY_LABELS[tonality]}`}
          feedback={
            showAnswer && !userAnswer ? `Answer: ${correctAnswer.current}`
              : userAnswer === correctAnswer.current ? `Correct! ${correctAnswer.current}`
              : `Incorrect — answer was ${correctAnswer.current}`
          }
          feedbackType={
            showAnswer && !userAnswer ? "reveal"
              : userAnswer === correctAnswer.current ? "correct"
              : "incorrect"
          }
        />
      )}

      {/* Answer buttons */}
      {hasPlayed && (
        <div className="flex gap-2 flex-wrap">
          {funcs.map(f => {
            const isCorrect = f.label === correctAnswer.current;
            const isSelected = f.label === userAnswer;
            const reveal = answered && isCorrect;
            return (
              <button key={f.label} onClick={() => handleAnswer(f.label)}
                disabled={answered || isPlaying}
                className={`px-5 py-2.5 rounded text-sm border font-medium transition-colors ${
                  reveal ? "bg-[#1a3a1a] border-[#3a6a3a] text-[#5cca5c]"
                    : isSelected && !isCorrect ? "bg-[#3a1a1a] border-[#6a3a3a] text-[#e06060]"
                    : answered || isPlaying ? "bg-[#141414] border-[#2a2a2a] text-[#444] cursor-default"
                    : "bg-[#161616] border-[#2a2a2a] text-[#aaa] hover:bg-[#1e1e1e] hover:border-[#555]"
                }`}>
                {formatRomanNumeral(f.label)}
              </button>
            );
          })}
        </div>
      )}

      {/* Feedback is shown inside the TonalVisualizer above */}
    </div>
  );
}
