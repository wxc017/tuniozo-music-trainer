import { useState, useEffect, useRef } from "react";

interface MetronomeStripProps {
  bpm: number;
  setBpm: (v: number) => void;
  running: boolean;
  beat: boolean;
  start: () => Promise<void>;
  stop: () => void;
}

const MIN_BPM = 20;
const MAX_BPM = 300;

export default function MetronomeStrip({ bpm, setBpm, running, beat, start, stop }: MetronomeStripProps) {
  const [draft, setDraft] = useState<string>(String(bpm));
  const focusedRef = useRef(false);
  const committedByEnterRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(String(bpm));
    }
  }, [bpm]);

  function commit() {
    const parsed = parseInt(draft, 10);
    if (isNaN(parsed)) {
      setBpm(MIN_BPM);
      setDraft(String(MIN_BPM));
    } else {
      const clamped = Math.max(MIN_BPM, Math.min(MAX_BPM, parsed));
      setBpm(clamped);
      setDraft(String(clamped));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 bg-[#111] border border-[#222] rounded-lg px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-[#888] tracking-widest uppercase">Metro</span>
        <span
          className={`w-2 h-2 rounded-full inline-block transition-all duration-75 ${
            running && beat
              ? "bg-[#e6a217] scale-125"
              : running
              ? "bg-[#7173e6]"
              : "bg-[#333]"
          }`}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="number"
          min={MIN_BPM}
          max={MAX_BPM}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onFocus={() => { focusedRef.current = true; }}
          onBlur={() => {
            focusedRef.current = false;
            if (!committedByEnterRef.current) {
              commit();
            }
            committedByEnterRef.current = false;
          }}
          onKeyDown={e => {
            if (e.key === "Enter") {
              committedByEnterRef.current = true;
              commit();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="w-16 bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white focus:outline-none text-center"
          aria-label="BPM"
        />
        <span className="text-xs text-[#555]">BPM</span>
      </div>

      <button
        onClick={running ? stop : start}
        className={`px-3 py-1 rounded text-xs font-medium transition-colors border ${
          running
            ? "bg-[#e6a217] border-[#e6a217] text-[#111]"
            : "bg-[#1a1a1a] border-[#333] text-[#888] hover:text-white hover:border-[#555]"
        }`}
      >
        {running ? "Stop" : "Start"}
      </button>
    </div>
  );
}
