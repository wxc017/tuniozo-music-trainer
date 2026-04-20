import { useState, useRef, useCallback } from "react";
import { useLS } from "@/lib/storage";
import { recordAnswer } from "@/lib/stats";
import { rhythmAudio } from "@/lib/rhythmAudio";
import {
  generateMetreId,
  generateUnevenDirection,
  generateUnevenUnpairedAcculturation,
  type RhythmExercise,
} from "@/lib/rhythmEarData";
import BeatVisualizer from "./BeatVisualizer";

type MetreExercise = "metre_id" | "uneven_direction" | "unpaired_grouping";

const EXERCISE_LABELS: Record<MetreExercise, string> = {
  metre_id: "What is the metre?",
  uneven_direction: "Short-Long or Long-Short?",
  unpaired_grouping: "Uneven Unpaired Grouping?",
};

interface Props {
  bpm: number;
  onAnswer?: (optionKey: string, label: string, correct: boolean) => void;
}

export default function MetrePanel({ bpm, onAnswer }: Props) {
  const [exercise, setExercise] = useLS<MetreExercise>("lt_rhy_metre_ex", "metre_id");
  const [includeUneven, setIncludeUneven] = useLS<boolean>("lt_rhy_metre_uneven", false);
  const [includeCombined, setIncludeCombined] = useLS<boolean>("lt_rhy_metre_combined", false);
  const [includeUnevenUnpaired, setIncludeUnevenUnpaired] = useLS<boolean>("lt_rhy_metre_unpaired", false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [userAnswer, setUserAnswer] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [activeBeat, setActiveBeat] = useState<{ beatPos: number; layer: string } | null>(null);

  const curExercise = useRef<RhythmExercise | null>(null);

  const generate = useCallback((): RhythmExercise => {
    if (exercise === "uneven_direction") return generateUnevenDirection(bpm);
    if (exercise === "unpaired_grouping") return generateUnevenUnpairedAcculturation(bpm);
    return generateMetreId(bpm, includeUneven, includeCombined, includeUnevenUnpaired);
  }, [exercise, bpm, includeUneven, includeCombined, includeUnevenUnpaired]);

  const play = useCallback(async () => {
    if (isPlaying) return;
    const ex = generate();
    curExercise.current = ex;
    setHasPlayed(true);
    setUserAnswer(null);
    setShowAnswer(false);
    setIsPlaying(true);
    setActiveBeat(null);

    rhythmAudio.setOnBeat((beatPos, layer) => {
      setActiveBeat({ beatPos, layer });
    });

    await rhythmAudio.playPattern(ex.patterns[0], () => {
      setIsPlaying(false);
      setActiveBeat(null);
      rhythmAudio.setOnBeat(null);
    });
  }, [isPlaying, generate]);

  const replay = useCallback(async () => {
    const ex = curExercise.current;
    if (!ex || isPlaying) return;
    setIsPlaying(true);
    setActiveBeat(null);

    rhythmAudio.setOnBeat((beatPos, layer) => {
      setActiveBeat({ beatPos, layer });
    });

    await rhythmAudio.playPattern(ex.patterns[0], () => {
      setIsPlaying(false);
      setActiveBeat(null);
      rhythmAudio.setOnBeat(null);
    });
  }, [isPlaying]);

  const handleAnswer = (key: string) => {
    if (userAnswer !== null || showAnswer) return;
    const ex = curExercise.current;
    if (!ex) return;
    setUserAnswer(key);
    recordAnswer(ex.optionKey, ex.label, key === ex.correctAnswer);
    onAnswer?.(ex.optionKey, ex.label, key === ex.correctAnswer);
  };

  const ex = curExercise.current;
  const answered = userAnswer !== null || showAnswer;
  const correct = userAnswer === ex?.correctAnswer;

  return (
    <div className="space-y-4">
      {/* Settings */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-[#888] block mb-1.5">Exercise</label>
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(EXERCISE_LABELS) as MetreExercise[]).map(k => (
              <button
                key={k}
                onClick={() => setExercise(k)}
                className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                  exercise === k
                    ? "border-[#7173e6] bg-[#1a1a2e] text-[#9999ee]"
                    : "border-[#222] bg-[#111] text-[#666] hover:text-[#aaa] hover:border-[#444]"
                }`}
              >
                {EXERCISE_LABELS[k]}
              </button>
            ))}
          </div>
        </div>
        {exercise === "metre_id" && (
          <>
            <label className={`flex items-center gap-2 px-3 py-2 rounded text-sm cursor-pointer transition-colors border ${
              includeUneven
                ? "bg-[#1a1a2a] text-[#9999ee] border-[#555]"
                : "bg-[#141414] text-[#666] border-[#2a2a2a] hover:border-[#444]"
            }`}>
              <input type="checkbox" checked={includeUneven} onChange={e => setIncludeUneven(e.target.checked)}
                className="accent-[#7173e6]" />
              5 (Uneven Paired)
            </label>
            <label className={`flex items-center gap-2 px-3 py-2 rounded text-sm cursor-pointer transition-colors border ${
              includeCombined
                ? "bg-[#1a1a2a] text-[#9999ee] border-[#555]"
                : "bg-[#141414] text-[#666] border-[#2a2a2a] hover:border-[#444]"
            }`}>
              <input type="checkbox" checked={includeCombined} onChange={e => setIncludeCombined(e.target.checked)}
                className="accent-[#7173e6]" />
              Combined
            </label>
            <label className={`flex items-center gap-2 px-3 py-2 rounded text-sm cursor-pointer transition-colors border ${
              includeUnevenUnpaired
                ? "bg-[#1a1a2a] text-[#9999ee] border-[#555]"
                : "bg-[#141414] text-[#666] border-[#2a2a2a] hover:border-[#444]"
            }`}>
              <input type="checkbox" checked={includeUnevenUnpaired} onChange={e => setIncludeUnevenUnpaired(e.target.checked)}
                className="accent-[#7173e6]" />
              7 (Uneven Unpaired)
            </label>
          </>
        )}
      </div>

      {/* Visualizer — only after answering */}
      {answered && ex && (
        <BeatVisualizer
          patterns={ex.patterns}
          activeIdx={0}
          activeBeat={activeBeat}
          label={EXERCISE_LABELS[exercise]}
        />
      )}

      {/* Answer buttons */}
      {hasPlayed && ex && (
        <div className="flex flex-wrap gap-2">
          {ex.options.map(opt => {
            const isSelected = userAnswer === opt.key;
            const isCorrect = ex.correctAnswer === opt.key;
            const reveal = answered && isCorrect;
            return (
              <button
                key={opt.key}
                onClick={() => handleAnswer(opt.key)}
                disabled={answered || !hasPlayed}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors border ${
                  reveal
                    ? "bg-[#1a3a1a] border-[#3a6a3a] text-[#5cca5c]"
                    : isSelected && !isCorrect
                      ? "bg-[#3a1a1a] border-[#6a3a3a] text-[#e06060]"
                      : answered || !hasPlayed
                        ? "bg-[#141414] border-[#2a2a2a] text-[#444] cursor-default"
                        : "bg-[#161616] border-[#2a2a2a] text-[#aaa] hover:bg-[#1e1e1e] hover:border-[#555]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Feedback */}
      {answered && ex && (
        <div className={`rounded p-3 text-sm border font-medium ${
          showAnswer && userAnswer === null
            ? "bg-[#1a1a2a] border-[#444] text-[#9999ee]"
            : correct
              ? "bg-[#1a3a1a] border-[#3a6a3a] text-[#5cca5c]"
              : "bg-[#3a1a1a] border-[#6a3a3a] text-[#e06060]"
        }`}>
          {showAnswer && userAnswer === null
            ? `Answer: ${ex.options.find(o => o.key === ex.correctAnswer)?.label}`
            : correct
              ? `✓ ${ex.options.find(o => o.key === ex.correctAnswer)?.label}`
              : `✗ It was: ${ex.options.find(o => o.key === ex.correctAnswer)?.label}`
          }
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={play} disabled={isPlaying}
          className="bg-[#7173e6] hover:bg-[#5a5cc8] disabled:opacity-50 text-white px-5 py-2 rounded text-sm font-medium transition-colors">
          {isPlaying ? "♪ Playing…" : "▶ Play"}
        </button>
        {hasPlayed && (
          <button onClick={replay} disabled={isPlaying}
            className="bg-[#1e1e1e] hover:bg-[#2a2a2a] disabled:opacity-50 border border-[#333] text-[#aaa] px-4 py-2 rounded text-sm transition-colors">
            Replay
          </button>
        )}
        {hasPlayed && !answered && (
          <button onClick={() => setShowAnswer(true)}
            className="bg-[#1e1e1e] hover:bg-[#2a2a2a] border border-[#444] text-[#9999ee] px-4 py-2 rounded text-sm transition-colors">
            Show Answer
          </button>
        )}
      </div>
    </div>
  );
}
