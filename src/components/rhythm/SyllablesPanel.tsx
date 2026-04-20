import { useState, useRef, useCallback } from "react";
import { useLS } from "@/lib/storage";
import { recordAnswer } from "@/lib/stats";
import { rhythmAudio } from "@/lib/rhythmAudio";
import {
  generateSyllables,
  generateDivisionSyllables,
  generateUnevenSyllables,
  GORDON_SYLLABLES,
  type RhythmExercise,
} from "@/lib/rhythmEarData";
import BeatVisualizer from "./BeatVisualizer";

type SylExercise =
  | "syllables"
  | "divisions_duple"
  | "divisions_triple"
  | "syllables_uneven";

const EXERCISE_LABELS: Record<SylExercise, string> = {
  syllables: "Duple or Triple? (syllables)",
  divisions_duple: "Divisions in Duple",
  divisions_triple: "Divisions in Triple",
  syllables_uneven: "Uneven Paired Syllables",
};

interface Props {
  bpm: number;
  onAnswer?: (optionKey: string, label: string, correct: boolean) => void;
}

export default function SyllablesPanel({ bpm, onAnswer }: Props) {
  const [exercise, setExercise] = useLS<SylExercise>("lt_rhy_syl_ex", "syllables");

  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [userAnswer, setUserAnswer] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [activeBeat, setActiveBeat] = useState<{ beatPos: number; layer: string } | null>(null);

  const curExercise = useRef<RhythmExercise | null>(null);

  const generate = useCallback((): RhythmExercise => {
    switch (exercise) {
      case "syllables":          return generateSyllables(bpm);
      case "divisions_duple":    return generateDivisionSyllables(bpm, "duple");
      case "divisions_triple":   return generateDivisionSyllables(bpm, "triple");
      case "syllables_uneven":   return generateUnevenSyllables(bpm);
    }
  }, [exercise, bpm]);

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

  // Show relevant syllable reference based on exercise
  const showSyllableRef = ["syllables", "divisions_duple", "divisions_triple", "syllables_uneven"].includes(exercise);

  return (
    <div className="space-y-4">
      {/* Settings */}
      <div>
        <label className="text-xs text-[#888] block mb-1.5">Exercise</label>
        <div className="flex gap-1 flex-wrap">
          {(Object.keys(EXERCISE_LABELS) as SylExercise[]).map(k => (
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

      {/* Gordon syllable reference */}
      {showSyllableRef && (
        <div className="bg-[#111] border border-[#222] rounded-lg px-4 py-3">
          <p className="text-xs text-[#666] mb-2">Gordon Rhythm Syllables:</p>
          <div className="flex flex-wrap gap-4 text-xs">
            <div>
              <span className="text-[#7173e6]">Duple micro:</span>{" "}
              <span className="text-[#aaa]">{GORDON_SYLLABLES.duple_micro.join(" ")}</span>
            </div>
            <div>
              <span className="text-[#7173e6]">Triple micro:</span>{" "}
              <span className="text-[#aaa]">{GORDON_SYLLABLES.triple_micro.join(" ")}</span>
            </div>
            <div>
              <span className="text-[#7173e6]">Duple div:</span>{" "}
              <span className="text-[#aaa]">{GORDON_SYLLABLES.duple_division.join(" ")}</span>
            </div>
            <div>
              <span className="text-[#7173e6]">Triple div:</span>{" "}
              <span className="text-[#aaa]">{GORDON_SYLLABLES.triple_division.join(" ")}</span>
            </div>
            {(exercise === "syllables_uneven") && (<>
              <div>
                <span className="text-[#7173e6]">Uneven 2+3:</span>{" "}
                <span className="text-[#aaa]">{GORDON_SYLLABLES.uneven_2_3_micro.join(" ")}</span>
              </div>
              <div>
                <span className="text-[#7173e6]">Uneven 3+2:</span>{" "}
                <span className="text-[#aaa]">{GORDON_SYLLABLES.uneven_3_2_micro.join(" ")}</span>
              </div>
            </>)}
          </div>
        </div>
      )}

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
