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

type ExerciseType = "same_different" | "higher_lower" | "contour" | "odd_one_out" | "ending";

const EXERCISE_LABELS: Record<ExerciseType, string> = {
  same_different: "Same or Different?",
  higher_lower: "Higher or Lower?",
  contour: "Ascend, Descend, or Stay?",
  odd_one_out: "Which Doesn't Fit?",
  ending: "Which Sounds Like an Ending?",
};

const TONALITIES = [
  { key: "major", label: "Major", family: "Major Family", mode: "Ionian", stable: ["1","3","5"] },
  { key: "minor", label: "Minor", family: "Major Family", mode: "Aeolian", stable: ["1","b3","5"] },
  { key: "dorian", label: "Dorian", family: "Major Family", mode: "Dorian", stable: ["1","b3","5"] },
];

const GAP = 550;

function generatePattern(
  tonicAbs: number, edo: number, low: number, high: number,
  family: string, mode: string, stable: string[], len: number,
): number[] | null {
  const modeMap = getModeDegreeMap(edo, family, mode);
  const chromatic = getDegreeMap(edo);
  const degMap = { ...chromatic, ...modeMap };
  const degrees = Object.keys(modeMap).filter(d => degMap[d] !== undefined);
  if (!degrees.length) return null;

  const seq: number[] = [];
  // Start on a stable tone
  const startDeg = randomChoice(stable.filter(d => degMap[d] !== undefined).length ? stable.filter(d => degMap[d] !== undefined) : degrees);
  seq.push(tonicAbs + (degMap[startDeg] ?? 0));

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

  return fitLineIntoWindow(seq, edo, low, high);
}

export default function ComparisonPanel({
  tonicPc, lowestOct, highestOct, edo, onHighlight, onResult, onPlay, lastPlayed, ensureAudio, playVol = 0.65, onAnswer,
}: Props) {
  const [exerciseType, setExerciseType] = useLS<ExerciseType>("lt_tonal_comp_type", "same_different");
  const [hasPlayed, setHasPlayed] = useState(false);
  const [userAnswer, setUserAnswer] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const correctAnswer = useRef<string>("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stopTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const tonality = useRef(TONALITIES[0]);

  const play = useCallback(async () => {
    if (isPlaying) return;
    await ensureAudio();
    stopTimers();

    const ton = randomChoice(TONALITIES);
    tonality.current = ton;
    const [low, high] = strictWindowBounds(tonicPc, edo, lowestOct, highestOct);
    const midAbs = tonicPc + (Math.floor((lowestOct + highestOct) / 2) - 4) * edo;

    if (exerciseType === "same_different") {
      const patA = generatePattern(midAbs, edo, low, high, ton.family, ton.mode, ton.stable, 4);
      const isSame = Math.random() < 0.4;
      const patB = isSame ? patA : generatePattern(midAbs, edo, low, high, ton.family, ton.mode, ton.stable, 4);
      if (!patA || !patB) { onResult("Could not generate pattern."); return; }
      correctAnswer.current = isSame ? "Same" : "Different";
      const frames = [...patA.map(n => [n]), [-1], ...patB.map(n => [n])]; // -1 = gap marker
      const playFrames = [...patA.map(n => [n]), ...patB.map(n => [n])];
      lastPlayed.current = { frames: playFrames, info: correctAnswer.current };
      setHasPlayed(true); setUserAnswer(null); setShowAnswer(false); setIsPlaying(true);
      onPlay("tonal:comparison", "Tonal: Same/Different");
      onResult("Listen to both patterns...");
      audioEngine.playSequence(patA.map(n => [n]), edo, GAP, 0.85, playVol);
      const t = setTimeout(() => {
        audioEngine.playSequence(patB.map(n => [n]), edo, GAP, 0.85, playVol);
        const d = setTimeout(() => setIsPlaying(false), patB.length * GAP + 500);
        timers.current.push(d);
      }, patA.length * GAP + 800);
      timers.current.push(t);

    } else if (exerciseType === "higher_lower") {
      const deg = randomChoice(ton.stable.filter(d => {
        const dm = { ...getDegreeMap(edo), ...getModeDegreeMap(edo, ton.family, ton.mode) };
        return dm[d] !== undefined;
      }));
      const dm = { ...getDegreeMap(edo), ...getModeDegreeMap(edo, ton.family, ton.mode) };
      const noteA = midAbs + (dm[deg] ?? 0);
      const shift = (Math.random() < 0.5 ? 1 : -1) * randomChoice([1, 2, 3, 4, 5]);
      const noteB = noteA + shift;
      correctAnswer.current = shift > 0 ? "Higher" : "Lower";
      lastPlayed.current = { frames: [[noteA], [noteB]], info: correctAnswer.current };
      setHasPlayed(true); setUserAnswer(null); setShowAnswer(false); setIsPlaying(true);
      onPlay("tonal:higher_lower", "Tonal: Higher/Lower");
      onResult("Is the second pitch higher or lower?");
      audioEngine.playSequence([[noteA], [noteB]], edo, 900, 1.2, playVol);
      const d = setTimeout(() => setIsPlaying(false), 2500);
      timers.current.push(d);

    } else if (exerciseType === "contour") {
      const dm = { ...getDegreeMap(edo), ...getModeDegreeMap(edo, ton.family, ton.mode) };
      const degrees = Object.keys(dm).filter(d => dm[d] !== undefined);
      const contourType = randomChoice(["ascend", "descend", "stay"]);
      const startDeg = randomChoice(degrees);
      const startNote = midAbs + (dm[startDeg] ?? 0);
      let notes: number[];
      if (contourType === "stay") {
        notes = [startNote, startNote, startNote];
      } else {
        const dir = contourType === "ascend" ? 1 : -1;
        notes = [startNote];
        for (let i = 0; i < 3; i++) {
          notes.push(notes[notes.length - 1] + dir * randomChoice([1, 2, 3]));
        }
      }
      correctAnswer.current = contourType === "ascend" ? "Ascend" : contourType === "descend" ? "Descend" : "Stay";
      const fitted = fitLineIntoWindow(notes, edo, low, high);
      if (!fitted.length) { onResult("Could not fit pattern."); return; }
      lastPlayed.current = { frames: fitted.map(n => [n]), info: correctAnswer.current };
      setHasPlayed(true); setUserAnswer(null); setShowAnswer(false); setIsPlaying(true);
      onPlay("tonal:contour", "Tonal: Contour");
      onResult("Does this pattern ascend, descend, or stay?");
      audioEngine.playSequence(fitted.map(n => [n]), edo, GAP, 0.85, playVol);
      const d = setTimeout(() => setIsPlaying(false), fitted.length * GAP + 500);
      timers.current.push(d);

    } else if (exerciseType === "odd_one_out") {
      const pat1 = generatePattern(midAbs, edo, low, high, ton.family, ton.mode, ton.stable, 4);
      const pat2 = generatePattern(midAbs, edo, low, high, ton.family, ton.mode, ton.stable, 4);
      // One of three is different tonality
      const otherTon = randomChoice(TONALITIES.filter(t => t.key !== ton.key));
      const patOdd = generatePattern(midAbs, edo, low, high, otherTon.family, otherTon.mode, otherTon.stable, 4);
      if (!pat1 || !pat2 || !patOdd) { onResult("Could not generate patterns."); return; }
      const oddPos = randomChoice([0, 1, 2]);
      const patterns = [pat1, pat2, patOdd];
      // Swap odd into position
      [patterns[2], patterns[oddPos]] = [patterns[oddPos], patterns[2]];
      correctAnswer.current = ["First", "Second", "Third"][oddPos];
      const allFrames = patterns.flatMap(p => p.map(n => [n]));
      lastPlayed.current = { frames: allFrames, info: correctAnswer.current };
      setHasPlayed(true); setUserAnswer(null); setShowAnswer(false); setIsPlaying(true);
      onPlay("tonal:odd_one_out", "Tonal: Odd One Out");
      onResult("Which pattern doesn't fit?");
      // Play with gaps between patterns
      let delay = 0;
      for (let i = 0; i < 3; i++) {
        const p = patterns[i];
        const d = setTimeout(() => {
          audioEngine.playSequence(p.map(n => [n]), edo, GAP, 0.85, playVol);
        }, delay);
        timers.current.push(d);
        delay += p.length * GAP + 800;
      }
      const d = setTimeout(() => setIsPlaying(false), delay);
      timers.current.push(d);

    } else if (exerciseType === "ending") {
      // Two patterns, one ends on tonic, the other doesn't
      const dm = { ...getDegreeMap(edo), ...getModeDegreeMap(edo, ton.family, ton.mode) };
      const ending = generatePattern(midAbs, edo, low, high, ton.family, ton.mode, ton.stable, 4);
      const nonEnding = generatePattern(midAbs, edo, low, high, ton.family, ton.mode, ton.stable, 4);
      if (!ending || !nonEnding) { onResult("Could not generate patterns."); return; }
      // Force ending to end on tonic
      ending[ending.length - 1] = midAbs + (dm["1"] ?? 0);
      // Force non-ending to end on non-tonic
      const nonTonicDeg = randomChoice(["2", "4", "6", "7"].filter(d => dm[d] !== undefined));
      nonEnding[nonEnding.length - 1] = midAbs + (dm[nonTonicDeg] ?? 0);

      const endFirst = Math.random() < 0.5;
      correctAnswer.current = endFirst ? "First" : "Second";
      const first = endFirst ? ending : nonEnding;
      const second = endFirst ? nonEnding : ending;
      const allFrames = [...first.map(n => [n]), ...second.map(n => [n])];
      lastPlayed.current = { frames: allFrames, info: correctAnswer.current };
      setHasPlayed(true); setUserAnswer(null); setShowAnswer(false); setIsPlaying(true);
      onPlay("tonal:ending", "Tonal: Ending");
      onResult("Which pattern sounds like an ending?");
      audioEngine.playSequence(first.map(n => [n]), edo, GAP, 0.85, playVol);
      const t = setTimeout(() => {
        audioEngine.playSequence(second.map(n => [n]), edo, GAP, 0.85, playVol);
        const d2 = setTimeout(() => setIsPlaying(false), second.length * GAP + 500);
        timers.current.push(d2);
      }, first.length * GAP + 800);
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
    recordAnswer(`tonal:${exerciseType}`, EXERCISE_LABELS[exerciseType], correct);
    onAnswer?.(`tonal:${exerciseType}`, EXERCISE_LABELS[exerciseType], correct);
    onResult(correct ? `Correct! ${correctAnswer.current}` : `Incorrect — answer was ${correctAnswer.current}`);
    revealHighlight();
  };

  const answered = userAnswer !== null || showAnswer;
  const answerOptions: Record<ExerciseType, string[]> = {
    same_different: ["Same", "Different"],
    higher_lower: ["Higher", "Lower"],
    contour: ["Ascend", "Descend", "Stay"],
    odd_one_out: ["First", "Second", "Third"],
    ending: ["First", "Second"],
  };

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
          {answerOptions[exerciseType].map(opt => {
            const isCorrect = opt === correctAnswer.current;
            const isSelected = opt === userAnswer;
            return (
              <button key={opt} onClick={() => handleAnswer(opt)}
                disabled={answered || isPlaying}
                className={`px-5 py-2.5 rounded text-sm border font-medium transition-colors ${
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
