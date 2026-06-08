// ── Sized-interval notation cheat sheet ─────────────────────────────
// A button + modal explaining the notation, built on Margo Schulter's
// "Regions of the Interval Spectrum."  The Major-3rd example mirrors the
// region bands drawn in the Interval Spectrum tab.

import { useState } from "react";

const SIZE = [
  ["s", "Small", "flatter / narrower than the center shade"],
  ["(none)", "Center", "the middle of the band — written bare"],
  ["l", "Large", "sharper / wider than the center shade"],
];
const QUALITY = [
  ["m", "Minor", "the minor band (2 / 3 / 6 / 7)"],
  ["(none)", "Perfect", "perfect degrees 4 / 5 / 8 and the unison 1"],
  ["M", "Major", "the major band (2 / 3 / 6 / 7)"],
];

// Major-3rd region, copied from the Interval Spectrum (Major Thirds: 372–440¢).
const M3_LO = 372, M3_HI = 440;
const M3_BANDS = [
  { name: "small", lo: 372, hi: 400, code: "sM3" },
  { name: "center", lo: 400, hi: 423, code: "M3" },
  { name: "large", lo: 423, hi: 440, code: "lM3" },
];
const M3_JIS = [
  { ratio: "5/4", cents: 386, note: "just major 3rd" },
  { ratio: "81/64", cents: 408, note: "Pythagorean 3rd" },
  { ratio: "9/7", cents: 435, note: "septimal (super) 3rd" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#8888c0] mb-1.5">{title}</h3>
      {children}
    </div>
  );
}

function SpectrumBar() {
  const PX = 6;                       // px per cent
  const PAD = 26;
  const W = (M3_HI - M3_LO) * PX + PAD * 2;
  const x = (c: number) => PAD + (c - M3_LO) * PX;
  return (
    <div className="relative" style={{ width: W, height: 76 }}>
      {/* band */}
      <div className="absolute rounded overflow-hidden border border-[#26262e]"
        style={{ top: 30, height: 14, left: PAD, width: (M3_HI - M3_LO) * PX, background: "#15131c" }}>
        {M3_BANDS.map((b, i) => (
          <div key={b.name} className="absolute top-0 bottom-0 border-l border-[#33333c]"
            style={{ left: (b.lo - M3_LO) * PX, width: (b.hi - b.lo) * PX, background: i % 2 === 0 ? "#ffffff08" : "transparent" }}>
            <span className="absolute -top-4 left-1 text-[8px] uppercase tracking-wider text-[#777]">{b.name}</span>
            <span className="absolute bottom-0.5 left-1 font-mono text-[9px] text-[#cfe6ff]">{b.code}</span>
          </div>
        ))}
      </div>
      {/* JI ticks */}
      {M3_JIS.map(j => (
        <div key={j.ratio} className="absolute" style={{ left: x(j.cents), top: 30 }}>
          <div className="absolute w-px" style={{ height: 14, background: "#4ab0a0" }} />
          <span className="absolute -translate-x-1/2 whitespace-nowrap text-center" style={{ top: 16 }}>
            <span className="block text-[9px] font-mono text-[#7affe0]">{j.ratio}</span>
            <span className="block text-[7px] text-[#5f9f96]">{j.cents}¢</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ConventionCheatSheet() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}
        title="How the interval & chord notation works"
        className="px-3 py-1.5 rounded text-xs font-medium bg-[#161616] text-[#8888c0] hover:text-[#cfe6ff] hover:bg-[#1e1e1e] border border-[#2a2a2a] transition-colors">
        Notation
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl max-h-[85vh] overflow-auto bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl shadow-2xl p-5"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-[#cfe6ff]">Sized-Interval Notation</h2>
              <button onClick={() => setOpen(false)} className="text-[#999] hover:text-[#cc6666] text-xl leading-none">✕</button>
            </div>

            <p className="text-xs text-[#aaa] mb-4 leading-relaxed">
              Every interval is written <span className="font-mono text-[#cfe6ff]">[size][quality][degree]</span> — it
              names a <em>shape</em>, and any tuning fills in the cents. The system is built on Margo Schulter's
              <em> “Regions of the Interval Spectrum,”</em> which divides each interval class into shaded regions.
            </p>

            <Section title="Size prefix">
              <table className="w-full text-xs"><tbody>
                {SIZE.map(([code, name, desc]) => (
                  <tr key={name} className="border-t border-[#1a1a1a]">
                    <td className="py-1 font-mono text-[#cfe6ff] w-16">{code}</td>
                    <td className="py-1 text-[#ddd] w-24">{name}</td>
                    <td className="py-1 text-[#888]">{desc}</td>
                  </tr>
                ))}
              </tbody></table>
            </Section>

            <Section title="Quality letter">
              <table className="w-full text-xs"><tbody>
                {QUALITY.map(([code, name, desc]) => (
                  <tr key={name} className="border-t border-[#1a1a1a]">
                    <td className="py-1 font-mono text-[#cfe6ff] w-16">{code}</td>
                    <td className="py-1 text-[#ddd] w-24">{name}</td>
                    <td className="py-1 text-[#888]">{desc}</td>
                  </tr>
                ))}
              </tbody></table>
              <p className="text-[11px] text-[#777] mt-1.5">
                There is no neutral / sub / super category and no <span className="font-mono">°</span> /
                <span className="font-mono"> +</span> — every interval is just a <em>size</em> of minor, major, or perfect.
              </p>
            </Section>

            <Section title="Example — the major third, in three shades">
              <div className="rounded-lg bg-[#0a0a14] border border-[#1e1e2a] p-3 overflow-x-auto">
                <SpectrumBar />
              </div>
              <p className="text-[11px] text-[#888] mt-2 leading-relaxed">
                The Major-3rd region (≈372–440¢) splits into <span className="font-mono text-[#cfe6ff]">sM3</span> (small,
                around the just <span className="font-mono">5/4</span>), <span className="font-mono text-[#cfe6ff]">M3</span> (center,
                the Pythagorean <span className="font-mono">81/64</span>), and <span className="font-mono text-[#cfe6ff]">lM3</span> (large,
                up toward the septimal <span className="font-mono">9/7</span>). What used to be called “sub-”, “neutral”, and “super-”
                thirds are just the small / center / large shades of the same band.
              </p>
            </Section>

            <Section title="The regions (theory)">
              <p className="text-xs text-[#aaa] leading-relaxed">
                Schulter maps the octave as a continuum and groups nearby tunings of an interval into a <em>region</em>
                (minor 3rds, major 3rds, …). Each region has a small / center / large zone set by the just landmarks that
                bound it. We adopt those zones directly: the <em>quality</em> letter picks the band (minor vs major), the
                <em> size</em> prefix picks the shade within it, and perfect classes (4 / 5 / 8 / 1) work the same way with
                no quality letter. Because the regions are defined in cents, one symbol names the same colour of interval
                in any EDO.
              </p>
            </Section>

            <Section title="Chords">
              <p className="text-xs text-[#aaa] leading-relaxed">
                The Roman numeral is pure <strong>position</strong> — the chord root's scale degree
                (<span className="font-mono">I</span> = home). Quality lives in the sized codes stacked on top; the
                perfect 5th is the default and omitted.
              </p>
              <div className="mt-2 font-mono text-xs text-[#cfe6ff] bg-[#0a0a14] border border-[#1e1e2a] rounded p-2 leading-6">
                I sM3 &nbsp;·&nbsp; II m3 &nbsp;·&nbsp; V sM3 m7 &nbsp;·&nbsp; VII m3 s5
              </div>
            </Section>

            <p className="text-[10px] text-[#666] mt-3 leading-relaxed">
              Inspired by Margo Schulter, <em>“Regions of the Interval Spectrum”</em>; MOS / <span className="font-mono">aLbs</span>
              scale names follow TAMNAMS; scale &amp; EDO data from the Xenharmonic Wiki.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
