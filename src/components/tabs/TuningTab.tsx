import { useState, useRef, useCallback } from "react";
import { audioEngine } from "@/lib/audioEngine";
import { useLS } from "@/lib/storage";
import { recordAnswer } from "@/lib/stats";
import { randomChoice } from "@/lib/musicTheory";

interface Props {
  tonicPc: number;
  lowestOct: number;
  highestOct: number;
  edo: number;
  onHighlight: (pcs: number[]) => void;
  responseMode: string;
  onResult: (text: string) => void;
  onPlay: (optionKey: string, label: string) => void;
  lastPlayed: React.MutableRefObject<{ frames: number[][]; info: string } | null>;
  ensureAudio: () => Promise<void>;
  playVol?: number;
  onAnswer?: (optionKey: string, label: string, correct: boolean) => void;
}

type ExerciseType = "same_different" | "which_purer" | "edo_comparison";

const EXERCISE_LABELS: Record<ExerciseType, string> = {
  same_different: "Same or Different?",
  which_purer: "Which Is Purer?",
  edo_comparison: "EDO Comparison",
};

// JI ratios for common intervals
const JI_INTERVALS: { label: string; ratio: number; name: string }[] = [
  { label: "Octave (2:1)", ratio: 2/1, name: "octave" },
  { label: "Fifth (3:2)", ratio: 3/2, name: "fifth" },
  { label: "Fourth (4:3)", ratio: 4/3, name: "fourth" },
  { label: "Major Third (5:4)", ratio: 5/4, name: "major_third" },
  { label: "Minor Third (6:5)", ratio: 6/5, name: "minor_third" },
  { label: "Harmonic 7th (7:4)", ratio: 7/4, name: "harmonic_7th" },
];

// EDO approximations (steps for common intervals)
const EDO_INTERVALS: Record<number, Record<string, number>> = {
  12: { fifth: 7, fourth: 5, major_third: 4, minor_third: 3, harmonic_7th: 10, octave: 12 },
  17: { fifth: 10, fourth: 7, major_third: 6, minor_third: 4, harmonic_7th: 14, octave: 17 },
  19: { fifth: 11, fourth: 8, major_third: 6, minor_third: 5, harmonic_7th: 15, octave: 19 },
  31: { fifth: 18, fourth: 13, major_third: 10, minor_third: 8, harmonic_7th: 25, octave: 31 },
  53: { fifth: 31, fourth: 22, major_third: 17, minor_third: 14, harmonic_7th: 43, octave: 53 },
};

export default function TuningTab({
  tonicPc, edo, onResult, onPlay, lastPlayed, ensureAudio, playVol = 0.6, onAnswer,
}: Props) {
  const [exerciseType, setExerciseType] = useLS<ExerciseType>("lt_tuning_type", "same_different");
  const [threshold, setThreshold] = useLS<number>("lt_tuning_threshold", 50); // cents
  const [hasPlayed, setHasPlayed] = useState(false);
  const [userAnswer, setUserAnswer] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const correctAnswer = useRef<string>("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stopTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const edoRatio = (steps: number, e: number) => Math.pow(2, steps / e);
  const centsDiff = (ratio: number, jiRatio: number) => 1200 * Math.log2(ratio / jiRatio);

  const play = useCallback(async () => {
    if (isPlaying) return;
    await ensureAudio();
    stopTimers();

    if (exerciseType === "same_different") {
      const isSame = Math.random() < 0.4;
      const centShift = isSame ? 0 : (Math.random() < 0.5 ? threshold : -threshold);
      const ratioA = 1;
      const ratioB = Math.pow(2, centShift / 1200);
      correctAnswer.current = isSame ? "Same" : "Different";

      setHasPlayed(true); setUserAnswer(null); setIsPlaying(true);
      onPlay("tuning:same_diff", "Tuning: Same/Different");
      onResult(`Listen to two pitches (threshold: ${threshold} cents)...`);

      audioEngine.playRatioSequence([[ratioA], [ratioB]], 1500, 1.2, playVol * 0.4);
      lastPlayed.current = { frames: [], info: correctAnswer.current };
      const d = setTimeout(() => setIsPlaying(false), 3200);
      timers.current.push(d);

    } else if (exerciseType === "which_purer") {
      const interval = randomChoice(JI_INTERVALS.filter(i => i.name !== "octave"));
      const edoSteps = EDO_INTERVALS[edo]?.[interval.name];
      if (edoSteps === undefined) { onResult(`No ${interval.name} mapping for ${edo}-EDO`); return; }

      const jiRatio = interval.ratio;
      const edoRat = edoRatio(edoSteps, edo);
      const jiFirst = Math.random() < 0.5;
      correctAnswer.current = jiFirst ? "First" : "Second";

      setHasPlayed(true); setUserAnswer(null); setIsPlaying(true);
      onPlay("tuning:purer", `Tuning: Purer ${interval.label}`);
      onResult(`Which ${interval.name.replace(/_/g, " ")} is purer? (JI ${interval.label} vs ${edo}-EDO)`);

      const first = jiFirst ? [1, jiRatio] : [1, edoRat];
      const second = jiFirst ? [1, edoRat] : [1, jiRatio];
      audioEngine.playRatioSequence([first, second], 2000, 1.5, playVol * 0.3);
      lastPlayed.current = { frames: [], info: `JI: ${jiFirst ? "First" : "Second"}` };
      const d = setTimeout(() => setIsPlaying(false), 4000);
      timers.current.push(d);

    } else if (exerciseType === "edo_comparison") {
      const interval = randomChoice(JI_INTERVALS.filter(i => i.name !== "octave"));
      const edos = [12, 17, 19, 31, 53].filter(e => EDO_INTERVALS[e]?.[interval.name] !== undefined);
      if (edos.length < 2) { onResult("Not enough EDOs for comparison"); return; }
      const edoA = randomChoice(edos);
      const edoB = randomChoice(edos.filter(e => e !== edoA));

      const stepsA = EDO_INTERVALS[edoA]![interval.name]!;
      const stepsB = EDO_INTERVALS[edoB]![interval.name]!;
      const centsA = Math.abs(centsDiff(edoRatio(stepsA, edoA), interval.ratio));
      const centsB = Math.abs(centsDiff(edoRatio(stepsB, edoB), interval.ratio));
      const purerFirst = Math.random() < 0.5;
      const purer = centsA < centsB ? edoA : edoB;
      const less = centsA < centsB ? edoB : edoA;
      correctAnswer.current = purerFirst ? "First" : "Second";

      setHasPlayed(true); setUserAnswer(null); setIsPlaying(true);
      onPlay("tuning:edo_comp", `Tuning: EDO Comparison ${interval.name}`);
      onResult(`Which ${interval.name.replace(/_/g, " ")} is purer?`);

      const firstEdo = purerFirst ? purer : less;
      const secondEdo = purerFirst ? less : purer;
      const firstRatio = edoRatio(EDO_INTERVALS[firstEdo]![interval.name]!, firstEdo);
      const secondRatio = edoRatio(EDO_INTERVALS[secondEdo]![interval.name]!, secondEdo);
      audioEngine.playRatioSequence([[1, firstRatio], [1, secondRatio]], 2000, 1.5, playVol * 0.3);
      lastPlayed.current = { frames: [], info: `Purer: ${purer}-EDO` };
      const d = setTimeout(() => setIsPlaying(false), 4000);
      timers.current.push(d);
    }
  }, [isPlaying, ensureAudio, exerciseType, threshold, edo, onResult, onPlay, lastPlayed, playVol]);

  const handleAnswer = (ans: string) => {
    if (userAnswer !== null) return;
    setUserAnswer(ans);
    const correct = ans === correctAnswer.current;
    recordAnswer(`tuning:${exerciseType}`, `Tuning: ${ans}`, correct);
    onAnswer?.(`tuning:${exerciseType}`, `Tuning: ${ans}`, correct);
    onResult(correct ? `Correct! ${correctAnswer.current}` : `Incorrect — answer was ${correctAnswer.current}`);
  };

  const answered = userAnswer !== null;
  const options: Record<ExerciseType, string[]> = {
    same_different: ["Same", "Different"],
    which_purer: ["First", "Second"],
    edo_comparison: ["First", "Second"],
  };

  return (
    <div className="space-y-4">
      {/* Exercise type selector */}
      <div className="flex gap-1 flex-wrap">
        {(Object.keys(EXERCISE_LABELS) as ExerciseType[]).map(t => (
          <button key={t} onClick={() => { setExerciseType(t); setUserAnswer(null); setHasPlayed(false); }}
            className={`px-3 py-1.5 rounded text-xs border transition-colors ${
              exerciseType === t ? "border-[#55aa88] bg-[#0e1a0e] text-[#55aa88]" : "border-[#222] bg-[#111] text-[#666] hover:text-[#aaa]"
            }`}>
            {EXERCISE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Config */}
      {exerciseType === "same_different" && (
        <div className="flex items-center gap-3">
          <label className="text-xs text-[#888]">Threshold (cents)</label>
          <select value={threshold} onChange={e => setThreshold(Number(e.target.value))}
            className="bg-[#1e1e1e] border border-[#333] rounded px-2 py-1 text-xs text-white focus:outline-none">
            {[100, 50, 25, 12.5, 6, 3].map(c => (
              <option key={c} value={c}>{c}c</option>
            ))}
          </select>
        </div>
      )}

      {/* Play */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={play} disabled={isPlaying}
          className="bg-[#55aa88] hover:bg-[#448a70] disabled:opacity-50 text-white px-5 py-2 rounded text-sm font-medium transition-colors">
          ▶ Play
        </button>
      </div>

      {/* Answer buttons */}
      {hasPlayed && (
        <div className="flex gap-2 flex-wrap">
          {options[exerciseType].map(opt => {
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

      {/* Info */}
      <div className="text-xs text-[#555] space-y-1">
        <p>JI intervals use pure whole-number ratios from the harmonic series.</p>
        <p>Available JI intervals: {JI_INTERVALS.map(i => i.label).join(", ")}</p>
      </div>
    </div>
  );
}
