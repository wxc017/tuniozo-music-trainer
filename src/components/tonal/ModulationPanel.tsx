import { useState, useRef, useCallback } from "react";
import { audioEngine } from "@/lib/audioEngine";
import { useLS } from "@/lib/storage";
import { recordAnswer } from "@/lib/stats";
import {
  randomChoice, fitLineIntoWindow, strictWindowBounds,
  getModeDegreeMap,
} from "@/lib/musicTheory";
import { getDegreeMap } from "@/lib/edoData";
import TonalVisualizer from "./TonalVisualizer";

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

type ExerciseType = "did_it_modulate" | "outside_note";

const EXERCISE_LABELS: Record<ExerciseType, string> = {
  did_it_modulate: "Did It Modulate?",
  outside_note: "Which Outside Note?",
};

// Chromatic alterations that create "outside" notes in major
const OUTSIDE_NOTES_MAJOR = [
  { label: "b2 (Ra)", degree: "b2" },
  { label: "b3 (Me)", degree: "b3" },
  { label: "#4 (Fi)", degree: "#4" },
  { label: "b6 (Le)", degree: "b6" },
  { label: "b7 (Te)", degree: "b7" },
];

const GAP = 550;

function generateDiatonicPattern(
  tonicAbs: number, edo: number, low: number, high: number, len: number,
): number[] | null {
  const dm = getDegreeMap(edo);
  const modeMap = getModeDegreeMap(edo, "Major Family", "Ionian");
  const degMap = { ...dm, ...modeMap };
  const degrees = ["1","2","3","4","5","6","7"];

  const seq: number[] = [];
  seq.push(tonicAbs + (degMap["1"] ?? 0));

  for (let i = 1; i < len; i++) {
    const deg = randomChoice(degrees);
    const base = tonicAbs + (degMap[deg] ?? 0);
    let best = base, bestD = Math.abs(base - seq[seq.length - 1]);
    for (let k = -3; k <= 3; k++) {
      const c = base + k * edo, d = Math.abs(c - seq[seq.length - 1]);
      if (d < bestD) { bestD = d; best = c; }
    }
    seq.push(best);
  }
  // End on tonic
  seq.push(tonicAbs + (degMap["1"] ?? 0));

  return fitLineIntoWindow(seq, edo, low, high);
}

export default function ModulationPanel({
  tonicPc, lowestOct, highestOct, edo, onHighlight, onResult, onPlay, lastPlayed, ensureAudio, playVol = 0.65, onAnswer,
}: Props) {
  const [exerciseType, setExerciseType] = useLS<ExerciseType>("lt_tonal_mod_type", "did_it_modulate");
  const [hasPlayed, setHasPlayed] = useState(false);
  const [userAnswer, setUserAnswer] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const correctAnswer = useRef<string>("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stopTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const play = useCallback(async () => {
    if (isPlaying) return;
    await ensureAudio();
    stopTimers();

    const [low, high] = strictWindowBounds(tonicPc, edo, lowestOct, highestOct);
    const midAbs = tonicPc + (Math.floor((lowestOct + highestOct) / 2) - 4) * edo;

    if (exerciseType === "did_it_modulate") {
      const doesModulate = Math.random() < 0.5;

      const patA = generateDiatonicPattern(midAbs, edo, low, high, 5);
      if (!patA) { onResult("Could not generate."); return; }

      let patB: number[] | null;
      if (doesModulate) {
        // Modulate to a nearby key (up a P5 or down a P5)
        const dm = getDegreeMap(edo);
        const shift = randomChoice([dm["5"] ?? Math.round(edo * 7/12), -(dm["5"] ?? Math.round(edo * 7/12))]);
        patB = generateDiatonicPattern(midAbs + shift, edo, low, high, 5);
      } else {
        patB = generateDiatonicPattern(midAbs, edo, low, high, 5);
      }
      if (!patB) { onResult("Could not generate."); return; }

      correctAnswer.current = doesModulate ? "Modulates" : "Same Key";
      const allFrames = [...patA.map(n => [n]), ...patB.map(n => [n])];
      lastPlayed.current = { frames: allFrames, info: correctAnswer.current };
      setHasPlayed(true); setUserAnswer(null); setShowAnswer(false); setIsPlaying(true);
      onPlay("tonal:modulation", "Tonal: Modulation");
      onResult("Do these two phrases stay in the same key, or does it modulate?");

      audioEngine.playSequence(patA.map(n => [n]), edo, GAP, 0.85, playVol);
      const t = setTimeout(() => {
        audioEngine.playSequence(patB!.map(n => [n]), edo, GAP, 0.85, playVol);
        const d = setTimeout(() => setIsPlaying(false), patB!.length * GAP + 500);
        timers.current.push(d);
      }, patA.length * GAP + 800);
      timers.current.push(t);

    } else if (exerciseType === "outside_note") {
      const dm = getDegreeMap(edo);
      const modeMap = getModeDegreeMap(edo, "Major Family", "Ionian");
      const degMap = { ...dm, ...modeMap };

      // Generate a purely diatonic baseline phrase first
      const baseline = generateDiatonicPattern(midAbs, edo, low, high, 5);
      if (!baseline) { onResult("Could not generate baseline."); return; }

      // Generate a mostly diatonic phrase, inject one outside note
      const outsideNote = randomChoice(OUTSIDE_NOTES_MAJOR);
      correctAnswer.current = outsideNote.label;

      const degrees = ["1","2","3","4","5","6","7"];
      const len = 6;
      const insertAt = 2 + Math.floor(Math.random() * (len - 3)); // not first or last

      const seq: number[] = [];
      seq.push(midAbs + (degMap["1"] ?? 0));

      for (let i = 1; i <= len; i++) {
        let deg: string;
        if (i === insertAt) {
          deg = outsideNote.degree;
        } else {
          deg = randomChoice(degrees);
        }
        const off = degMap[deg] ?? dm[deg] ?? 0;
        const base = midAbs + off;
        let best = base, bestD = Math.abs(base - seq[seq.length - 1]);
        for (let k = -3; k <= 3; k++) {
          const c = base + k * edo, d2 = Math.abs(c - seq[seq.length - 1]);
          if (d2 < bestD) { bestD = d2; best = c; }
        }
        seq.push(best);
      }
      // End on tonic
      seq.push(midAbs + (degMap["1"] ?? 0));

      const fitted = fitLineIntoWindow(seq, edo, low, high);
      if (!fitted.length) { onResult("Could not fit."); return; }

      // Store both baseline + test phrase for replay
      const allFrames = [...baseline.map(n => [n]), ...fitted.map(n => [n])];
      lastPlayed.current = { frames: allFrames, info: outsideNote.label };
      setHasPlayed(true); setUserAnswer(null); setShowAnswer(false); setIsPlaying(true);
      onPlay("tonal:outside_note", "Tonal: Outside Note");
      onResult("Listen: diatonic baseline first, then spot the outside note...");

      // Play diatonic baseline, then the test phrase after a gap
      audioEngine.playSequence(baseline.map(n => [n]), edo, GAP, 0.85, playVol * 0.7);
      const baselineDur = baseline.length * GAP + 800;
      const t = setTimeout(() => {
        audioEngine.playSequence(fitted.map(n => [n]), edo, GAP, 0.85, playVol);
        const d = setTimeout(() => setIsPlaying(false), fitted.length * GAP + 500);
        timers.current.push(d);
      }, baselineDur);
      timers.current.push(t);
    }
  }, [isPlaying, ensureAudio, exerciseType, tonicPc, edo, lowestOct, highestOct, onResult, onPlay, lastPlayed, playVol]);

  const replay = () => {
    const lp = lastPlayed.current;
    if (!lp || isPlaying) return;
    setIsPlaying(true);
    audioEngine.playSequence(lp.frames, edo, GAP, 0.85, playVol);
    const d = setTimeout(() => setIsPlaying(false), lp.frames.length * GAP + 500);
    timers.current.push(d);
  };

  const revealHighlight = () => {
    const lp = lastPlayed.current;
    if (lp && lp.frames.length) onHighlight(lp.frames[lp.frames.length - 1]);
  };

  const [showAnswer, setShowAnswer] = useState(false);

  const handleShowAnswer = () => {
    setShowAnswer(true);
    onResult(`Answer: ${correctAnswer.current}`);
    revealHighlight();
  };

  const handleAnswer = (ans: string) => {
    if (userAnswer !== null || showAnswer) return;
    setUserAnswer(ans);
    const correct = ans === correctAnswer.current;
    recordAnswer(`tonal:${exerciseType}`, `${EXERCISE_LABELS[exerciseType]}: ${ans}`, correct);
    onAnswer?.(`tonal:${exerciseType}`, `${EXERCISE_LABELS[exerciseType]}: ${ans}`, correct);
    onResult(correct ? `Correct! ${correctAnswer.current}` : `Incorrect — answer was ${correctAnswer.current}`);
    revealHighlight();
  };

  const answered = userAnswer !== null || showAnswer;

  const modulationOptions = ["Same Key", "Modulates"];
  const outsideOptions = OUTSIDE_NOTES_MAJOR.map(n => n.label);
  const options = exerciseType === "did_it_modulate" ? modulationOptions : outsideOptions;

  return (
    <div className="space-y-4">
      {/* Exercise type selector */}
      <div className="flex gap-1 flex-wrap">
        {(Object.keys(EXERCISE_LABELS) as ExerciseType[]).map(t => (
          <button key={t} onClick={() => { setExerciseType(t); setUserAnswer(null); setHasPlayed(false); }}
            className={`px-3 py-1.5 rounded text-xs border transition-colors ${
              exerciseType === t ? "border-[#c8aa50] bg-[#1a1a0e] text-[#c8aa50]" : "border-[#222] bg-[#111] text-[#666] hover:text-[#aaa]"
            }`}>
            {EXERCISE_LABELS[t]}
          </button>
        ))}
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
          label={EXERCISE_LABELS[exerciseType]}
          feedback={
            showAnswer && userAnswer === null
              ? `Answer: ${correctAnswer.current}`
              : userAnswer === correctAnswer.current
                ? `Correct! ${correctAnswer.current}`
                : `Incorrect — answer was ${correctAnswer.current}`
          }
          feedbackType={
            showAnswer && userAnswer === null ? "reveal"
              : userAnswer === correctAnswer.current ? "correct"
              : "incorrect"
          }
        />
      )}

      {/* Answer buttons */}
      {hasPlayed && (
        <div className="flex gap-2 flex-wrap">
          {options.map(opt => {
            const isCorrect = opt === correctAnswer.current;
            const isSelected = opt === userAnswer;
            return (
              <button key={opt} onClick={() => handleAnswer(opt)}
                disabled={answered || isPlaying}
                className={`px-4 py-2 rounded text-sm border font-medium transition-colors ${
                  answered && isCorrect ? "bg-[#1a3a1a] border-[#3a6a3a] text-[#5cca5c]"
                    : answered && isSelected ? "bg-[#3a1a1a] border-[#6a3a3a] text-[#e06060]"
                    : answered || isPlaying ? "bg-[#141414] border-[#2a2a2a] text-[#444] cursor-default"
                    : "bg-[#161616] border-[#2a2a2a] text-[#aaa] hover:bg-[#1e1e1e] hover:border-[#555]"
                }`}>
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
