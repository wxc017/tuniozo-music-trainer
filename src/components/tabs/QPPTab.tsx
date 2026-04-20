import { useState } from "react";
import { audioEngine } from "@/lib/audioEngine";
import {
  QPP_TARGET_TYPES, qppGenerate
} from "@/lib/musicTheory";
import { useLS } from "@/lib/storage";

interface Props {
  tonicPc: number;
  lowestOct: number;
  highestOct: number;
  edo: number;
  onHighlight: (pcs: number[]) => void;
  responseMode: string;
  onResult: (text: string) => void;
  onPlay: (optionKey: string, label: string) => void;
  lastPlayed: React.MutableRefObject<{frames: number[][]; info: string} | null>;
  ensureAudio: () => Promise<void>;
}

export default function QPPTab({
  tonicPc, lowestOct, highestOct, edo, onHighlight, responseMode, onResult, onPlay, lastPlayed, ensureAudio
}: Props) {
  const [checked, setChecked] = useLS<Set<string>>("lt_qpp_checked",
    new Set(["Single Notes","Intervals","Triads"])
  );
  const [showTarget, setShowTarget] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);

  const toggle = (t: string) => setChecked(prev => {
    const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n;
  });

  const play = async () => {
    if (isPlaying) return;
    await ensureAudio();
    if (!checked.size) { onResult("Select at least one QPP target type."); return; }

    const result = qppGenerate(edo, tonicPc, lowestOct, highestOct, Array.from(checked));
    if (!result) { onResult("Could not generate QPP target. Try wider octave range."); return; }

    const { kind, notes, label } = result;
    const frames = notes.length === 1 ? [[notes[0]]] : [notes];
    const info = `Type:  ${kind}\nNotes: [${notes.join(", ")}]\nLabel: ${label}`;
    const optKey = `qpp:${[...checked].sort().join(',')}:oct${lowestOct}-${highestOct}`;
    setShowTarget(null);
    onResult(`QPP: ${kind}`);
    onPlay(optKey, `QPP (${[...checked].join(', ')}, Oct ${lowestOct}-${highestOct})`);
    lastPlayed.current = { frames, info };
    setHasPlayed(true);

    if (responseMode === "Play Audio") {
      setIsPlaying(true);
      audioEngine.playSequence(frames, edo, 1200, 1.0, 0.6);
      setTimeout(() => setIsPlaying(false), 1500);
    } else {
      setShowTarget(info);
    }
  };

  const replay = () => {
    const lp = lastPlayed.current;
    if (!lp) return;
    setIsPlaying(true);
    audioEngine.playSequence(lp.frames, edo, 1200, 1.0, 0.6);
    setTimeout(() => setIsPlaying(false), 1500);
  };

  const reveal = () => {
    const lp = lastPlayed.current;
    if (!lp) return;
    setShowTarget(lp.info);
    const allNotes = lp.frames.flat();
    onHighlight(allNotes);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#666]">
        Play a random harmonic target. Try to identify it by ear before revealing.
      </p>

      <div className="flex gap-2 flex-wrap">
        <button onClick={play} disabled={isPlaying}
          className="bg-[#7173e6] hover:bg-[#5a5cc8] disabled:opacity-50 text-white px-5 py-2 rounded text-sm font-medium transition-colors">
          {isPlaying ? "♪ Playing…" : "▶ Play Target"}
        </button>
        {hasPlayed && (
          <button onClick={replay}
            className="bg-[#1e1e1e] hover:bg-[#2a2a2a] border border-[#333] text-[#aaa] px-4 py-2 rounded text-sm transition-colors">
            Replay
          </button>
        )}
        <button onClick={reveal}
          className="bg-[#2a1e1e] hover:bg-[#3a2a2a] border border-[#4a3333] text-[#cc9999] px-4 py-2 rounded text-sm transition-colors">
          👁 Reveal Answer
        </button>
      </div>

      {showTarget && (
        <div className="bg-[#1a2a1a] border border-[#3a5a3a] rounded p-3 text-sm text-[#8fc88f] font-mono whitespace-pre">{showTarget}</div>
      )}

      <div>
        <p className="text-xs text-[#555] mb-2">Target Types:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {QPP_TARGET_TYPES.map(t => (
            <label key={t} className={`flex items-center gap-2 px-3 py-2 rounded text-sm cursor-pointer transition-colors ${
              checked.has(t) ? "bg-[#1a1a2a] text-[#9999ee]" : "bg-[#141414] text-[#666] hover:bg-[#1e1e1e]"
            }`}>
              <input type="checkbox" checked={checked.has(t)} onChange={() => toggle(t)} className="accent-[#7173e6]" />
              {t}
            </label>
          ))}
        </div>
      </div>

      <div className="bg-[#141414] border border-[#222] rounded p-3 text-xs text-[#555]">
        <p className="font-medium text-[#666] mb-1">How to use:</p>
        <ol className="space-y-0.5 list-decimal pl-4">
          <li>Press Play Target to hear a mystery sound</li>
          <li>Try to identify it on your instrument or by ear</li>
          <li>Press Replay to hear again</li>
          <li>Press Reveal Answer to check your answer</li>
        </ol>
      </div>
    </div>
  );
}
