import { useState, useEffect, useRef } from "react";

/** Small "Notation" button with a click-to-show legend explaining the
 *  letter codes that appear throughout the app's mode / interval / chord
 *  labels.  Visible in Tonal Audiation, Melodic Patterns, and Scalar
 *  Explorations per direct user direction (2026-05-05): "put a small
 *  button at top called notation for tonal audiation melodic patterns
 *  and scalar explorations that writes stuff like n = netural S =
 *  superminor exc.". */
export default function NotationLegend() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className={`px-2 py-1 text-[10px] rounded border transition-colors ${
          open
            ? "bg-[#7173e6] border-[#7173e6] text-white"
            : "bg-[#141414] border-[#2a2a2a] text-[#888] hover:text-white hover:border-[#444]"
        }`}>
        Notation
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-[480px] bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg shadow-2xl z-50 p-4 space-y-3">
          <p className="text-xs text-[#888] leading-relaxed">
            Microtonal mode + interval names use letter codes for each
            "flavour" of third / sixth / seventh.  These show up in 31-,
            41-, and 53-EDO scale names (e.g. "Subminor Phrygian m7",
            "Neutral Dorian N2 bb5 N6") and in chord-quality labels.
          </p>

          <div>
            <p className="text-[10px] text-[#666] uppercase tracking-widest mb-1">Flavour letters (lo → hi)</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <div><span className="text-[#7aaa6a] font-bold w-5 inline-block">s</span><span className="text-[#888]"> sub</span> — septimal-flat (e.g. s3 ≈ 7/6)</div>
              <div><span className="text-[#9a8a5a] font-bold w-5 inline-block">m</span><span className="text-[#888]"> minor</span> — Pythagorean (3-limit)</div>
              <div><span className="text-[#a07050] font-bold w-5 inline-block">Cm</span><span className="text-[#888]"> classic minor</span> — 5-limit (6/5)</div>
              <div><span className="text-[#caac5a] font-bold w-5 inline-block">u</span><span className="text-[#888]"> supraminor</span> — between minor + neutral</div>
              <div><span className="text-[#9a66c0] font-bold w-5 inline-block">n / N</span><span className="text-[#888]"> neutral</span> — 11-limit (e.g. 11/9)</div>
              <div><span className="text-[#cc6a8a] font-bold w-5 inline-block">C</span><span className="text-[#888]"> classic major</span> — 5-limit (5/4)</div>
              <div><span className="text-[#6a9aca] font-bold w-5 inline-block">M</span><span className="text-[#888]"> major</span> — Pythagorean (81/64)</div>
              <div><span className="text-[#cc8a4a] font-bold w-5 inline-block">S</span><span className="text-[#888]"> super</span> — septimal-sharp (e.g. S3 ≈ 9/7)</div>
            </div>
          </div>

          <div>
            <p className="text-[10px] text-[#666] uppercase tracking-widest mb-1">Accidentals</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <div><span className="font-bold w-5 inline-block text-white">#</span><span className="text-[#888]"> sharp (raise one chromatic step)</span></div>
              <div><span className="font-bold w-5 inline-block text-white">b</span><span className="text-[#888]"> flat (lower one chromatic step)</span></div>
              <div><span className="font-bold w-5 inline-block text-white">##</span><span className="text-[#888]"> double-sharp / aug</span></div>
              <div><span className="font-bold w-5 inline-block text-white">bb</span><span className="text-[#888]"> double-flat / dim</span></div>
              <div><span className="font-bold w-5 inline-block text-white">𝄲</span><span className="text-[#888]"> half-sharp (31-EDO only)</span></div>
              <div><span className="font-bold w-5 inline-block text-white">𝄳</span><span className="text-[#888]"> half-flat (31-EDO only)</span></div>
            </div>
          </div>

          <div>
            <p className="text-[10px] text-[#666] uppercase tracking-widest mb-1">Diatonic prefix</p>
            <p className="text-[11px] text-[#888] leading-snug">
              <b className="text-white">Diatonic</b> = the scale preserves the diatonic backbone:
              <b className="text-white"> M2</b> (9/8), <b className="text-white">P4</b> (4/3),
              <b className="text-white"> P5</b> (3/2).  The named flavour (Major / Subminor /
              Neutral / etc.) lives in the 3rd, 6th, and 7th degrees only.
            </p>
          </div>

          <div>
            <p className="text-[10px] text-[#666] uppercase tracking-widest mb-1">Examples</p>
            <ul className="text-[11px] text-[#888] space-y-0.5 leading-snug">
              <li><b className="text-white">Subminor Phrygian m7</b> — phrygian mode with sub-3rd + Pyth-minor 7th</li>
              <li><b className="text-white">Dorian N2 bb5 N6</b> — dorian-shape with neutral 2nd, dim 5th, neutral 6th</li>
              <li><b className="text-white">Supermajor Lydian M2 b5</b> — lydian shape with super-3rd, Pyth-major 2nd, flat 5th</li>
              <li><b className="text-white">Diatonic Major</b> (41 / 53-EDO) — pure 5-limit JI major scale (M2/P4/P5 + 5/4 third)</li>
            </ul>
          </div>

          <p className="text-[10px] text-[#555] leading-snug pt-1 border-t border-[#1a1a1a]">
            JI prime-limit prefix subscripts (e.g. <b>₁₃</b>I, <b>JI</b>iv) appear on 41 / 53-EDO chord
            roman numerals to disambiguate which limit's tuning the chord uses.  3 = Pythagorean,
            JI = 5-limit, 7 = septimal, 11 = neutral, 13 = tridecimal.
          </p>
        </div>
      )}
    </div>
  );
}
