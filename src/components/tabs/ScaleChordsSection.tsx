// ── Scales & Chords (Solfège Chart) ─────────────────────────────────
// A separate part of the Solfège tab (NOT the interval gamut): for each EDO,
// the major and minor scales in the sizes the EDO can render (Small / Center /
// Large), each degree labelled with its region-centered solfège syllable, and
// every diatonic triad and seventh chord named with the Tonal-Audiation Roman
// numerals (I ii iii IV V vi vii° …).  Click any syllable or chord to hear it.

import { useMemo } from "react";
import { scaleChordsForEdo, type Chord, type ScaleVariant } from "@/lib/scaleChords";
import { speakSolfege } from "@/lib/solfegeGamut";
import { SOLFEGE_SYLLABLE_IPA } from "@/lib/solfegeSyllableIpa";
import { formatRomanNumeral } from "@/lib/formatRoman";

// Coloured by the syllable's vowel shade (matches the chart's Small/Mid/Large key).
const vowelColor = (syl: string) => {
  const v = syl.slice(-1);
  return v === "a" ? "#8fbf8f" : v === "e" || v === "i" ? "#c99a55" : v === "u" || v === "o" ? "#6f93b8" : "#cfcfcf";
};
const say = (syl: string) => speakSolfege({ solfege: syl, ipa: SOLFEGE_SYLLABLE_IPA[syl] ?? syl });

// Fixed, equal degree columns so every row lines up symmetrically regardless of
// how wide a chord label (e.g. "IVmaj7") is.
const DEG_COL = "5.25rem";
const LABEL_COL = "2.8rem";

function ChordCell({ chord, edo }: { chord: Chord; edo: number }) {
  return (
    <button onClick={() => chord.syllables.forEach((s, i) => setTimeout(() => say(s), i * 240))}
      title={`${chord.roman} · ${chord.syllables.join(" ")}`}
      className="flex flex-col items-center gap-1 px-1 py-2 rounded hover:bg-[#1a1a26] transition-colors w-full min-w-0">
      <span className="text-[13px] font-semibold text-[#e0c070] leading-tight text-center whitespace-nowrap">{formatRomanNumeral(chord.roman, edo)}</span>
      <span className="flex flex-col-reverse items-center leading-none gap-0.5">
        {chord.syllables.map((s, i) => (
          <span key={i} className="text-[12px] leading-tight" style={{ color: vowelColor(s) }}>{s}</span>
        ))}
      </span>
    </button>
  );
}

function VariantTable({ v, edo }: { v: ScaleVariant; edo: number }) {
  return (
    <div className="rounded-lg border border-[#242424] bg-[#0b0b0b] overflow-hidden">
      <div className="px-2.5 py-1.5 bg-[#141414] border-b border-[#242424]">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8fbf8f]">{v.size}</span>
      </div>
      <table className="table-fixed border-collapse text-center">
        <colgroup>
          <col style={{ width: LABEL_COL }} />
          {v.degrees.map(d => <col key={d.degree} style={{ width: DEG_COL }} />)}
        </colgroup>
        <tbody>
          {/* scale syllables */}
          <tr className="border-b border-[#1a1a1a]">
            <td className="px-1.5 py-2 text-left text-[9px] uppercase tracking-wider text-[#666] border-r border-[#1e1e1e]">Scale</td>
            {v.degrees.map(d => (
              <td key={d.degree} className="px-1 py-2">
                <button onClick={() => say(d.syllable)} title={`degree ${d.degree}`}
                  className="text-[19px] font-semibold leading-none hover:brightness-125"
                  style={{ color: vowelColor(d.syllable) }}>{d.syllable}</button>
              </td>
            ))}
          </tr>
          {/* triads */}
          <tr className="border-b border-[#1a1a1a]">
            <td className="px-1.5 py-1.5 text-left text-[9px] uppercase tracking-wider text-[#666] border-r border-[#1e1e1e]">Triad</td>
            {v.degrees.map(d => <td key={d.degree} className="align-top"><ChordCell chord={d.triad} edo={edo} /></td>)}
          </tr>
          {/* seventh chords */}
          <tr>
            <td className="px-1.5 py-1.5 text-left text-[9px] uppercase tracking-wider text-[#666] border-r border-[#1e1e1e]">7th</td>
            {v.degrees.map(d => <td key={d.degree} className="align-top"><ChordCell chord={d.seventh} edo={edo} /></td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function ScaleChordsSection({ edos }: { edos: number[] }) {
  const byEdo = useMemo(() => edos.map(e => ({ edo: e, families: scaleChordsForEdo(e) })), [edos]);

  return (
    <div className="text-white flex-1 min-w-[640px]">
      <h3 className="text-sm font-semibold">Scales &amp; Chords</h3>

      <div className="flex flex-col gap-6 mt-3">
        {byEdo.map(({ edo, families }) => (
          <div key={edo} className="flex flex-col gap-2.5">
            <span className="text-[13px] font-semibold text-[#9999ee]">{edo}<span className="text-[#666] font-normal">-EDO</span></span>
            {families.map(fam => (
              <div key={fam.name} className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d4a050]">{fam.name}</span>
                <div className="flex flex-wrap gap-3">
                  {fam.variants.map((v, i) => <VariantTable key={i} v={v} edo={edo} />)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
