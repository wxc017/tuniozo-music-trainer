// ── Solfège Chart ─────────────────────────────────────────────────
// OUR region-centered neutral-consonant solfège.  One row per band: each main
// region splits into Small / Middle(-a) / Large sub-bands (its own box each),
// nested under Interval → Class; transitional regions are single wide bands.
// Each EDO column shows the syllable its step takes in that band.

import { useMemo } from "react";
import { useLocalState } from "@/hooks/useLocalState";
import { REGIONS } from "@/lib/intervalSpectrum";
import { customSolfege, mainRegionContaining, betweenRegionContaining, betweenSyllable } from "@/lib/customSolfege";
import ScaleChordsSection from "./ScaleChordsSection";

const DEGREE: Record<string, string> = {
  Seconds: "2nd", Thirds: "3rd", Fourths: "4th", Fifths: "5th", Sixths: "6th", Sevenths: "7th",
};
const DEGREE_LABELS = new Set(["2nd", "3rd", "4th", "Tritone", "5th", "6th", "7th"]);
const BETWEEN_LABEL: Record<string, string> = {
  "Pure Unison": "Unison", "Commas": "Comma", "Dieses": "Dieses", "Equable Heptatonic": "Equable",
  "Interseptimal (M2–m3)": "Semifourth", "Interseptimal (M3–4)": "Semisixth",
  "Superfourths": "Superfourth", "Subfifths": "Subfifth",
  "Interseptimal (5–m6)": "Semitenth", "Interseptimal (M6–m7)": "Semitwelfth",
  "Octave less diesis": "Octave −diesis", "Octave less comma": "Octave −comma", "Pure Octave": "Octave",
};

function parseMain(name: string): { degree: string; klass: string } {
  if (/Tritonic/.test(name)) return { degree: "Tritone", klass: "" };
  const m = /(Minor|Neutral|Major|Perfect)?\s*(Seconds|Thirds|Fourths|Fifths|Sixths|Sevenths)/.exec(name);
  if (!m) return { degree: name, klass: "" };
  return { degree: DEGREE[m[2]] ?? m[2], klass: /Fourths|Fifths/.test(m[2]) ? "" : (m[1] ?? "") };
}
const titleCase = (s: string) => s.replace(/\s*\(.*\)$/, "").replace(/^\w/, c => c.toUpperCase());
const vowelColor = (syl: string) => {
  const v = syl.slice(-1);
  // center = a (green); sharp side = e/i (amber, brighter); flat side = u/o (blue, darker)
  return v === "a" ? "#8fbf8f" : v === "e" || v === "i" ? "#c99a55" : "#6f93b8";
};
const subIndexFromVowel = (syl: string) => {
  const v = syl.slice(-1);
  // flat sub-band = u/o → 0; center a → 1; sharp sub-band = e/i → 2
  return v === "u" || v === "o" ? 0 : v === "a" ? 1 : 2;
};

interface Row {
  kind: "main" | "between" | "anchor";
  groupLabel: string; label: string; klass: string; subcat: string;
  lo: number; hi: number; solfege: string; region: string | null; subIndex: number;
  middle: boolean; equable: boolean;
  groupStart: boolean; groupSize: number; standalone: boolean; classStart: boolean; classSize: number;
}

// ── One row per band (cents order) ────────────────────────────────
const flat: Row[] = [];
for (const r of REGIONS) {
  if (r.kind === "between" || !r.subs || !r.subs.length) {
    const isEquable = /Equable/.test(r.name);
    const anchor = /Unison|Octave/.test(r.name) && r.lo === r.hi;
    const mid = r.lo === r.hi ? r.lo : (r.lo + r.hi) / 2;
    flat.push({
      kind: anchor ? "anchor" : "between",
      groupLabel: isEquable ? (mid < 600 ? "2nd" : "7th") : (BETWEEN_LABEL[r.name] ?? r.name),
      label: BETWEEN_LABEL[r.name] ?? r.name, klass: "", subcat: isEquable ? "Equable" : "",
      lo: r.lo, hi: r.hi, solfege: anchor ? "Da" : betweenSyllable(r.name), region: anchor ? null : r.name, subIndex: -1,
      middle: false, equable: isEquable,
      groupStart: false, groupSize: 1, standalone: false, classStart: false, classSize: 1,
    });
  } else {
    const { degree, klass } = parseMain(r.name);
    const midIdx = Math.floor((r.subs.length - 1) / 2);
    r.subs.forEach((s, i) => {
      flat.push({
        kind: "main", groupLabel: degree, label: degree, klass, subcat: titleCase(s.name),
        lo: s.lo, hi: s.hi, solfege: customSolfege((s.lo + s.hi) / 2), region: r.name, subIndex: i,
        middle: i === midIdx, equable: false,
        groupStart: false, groupSize: 1, standalone: false, classStart: false, classSize: 1,
      });
    });
  }
}
// Interval (group) + Class rowspans.
for (let gi = 0; gi < flat.length;) {
  let gj = gi; while (gj < flat.length && flat[gj].groupLabel === flat[gi].groupLabel) gj++;
  const size = gj - gi, isDegree = DEGREE_LABELS.has(flat[gi].groupLabel);
  for (let k = gi; k < gj; k++) { flat[k].groupStart = k === gi; flat[k].groupSize = size; flat[k].standalone = !isDegree; }
  if (isDegree) for (let ci = gi; ci < gj;) {
    if (flat[ci].equable) { flat[ci].classStart = true; flat[ci].classSize = 1; ci++; continue; }
    let cj = ci; while (cj < gj && !flat[cj].equable && flat[cj].klass === flat[ci].klass) cj++;
    for (let k = ci; k < cj; k++) { flat[k].classStart = k === ci; flat[k].classSize = cj - ci; }
    ci = cj;
  }
  gi = gj;
}

const mainIdx = new Map<string, number>();
const anchorRows: { idx: number; at: number }[] = [];
// Transitional "between" regions have NO syllable in our system → their rows
// stay empty; only main sub-bands and the unison/octave anchors get syllables.
flat.forEach((row, i) => {
  if (row.kind === "main") mainIdx.set(`${row.region}#${row.subIndex}`, i);
  else if (row.kind === "anchor") anchorRows.push({ idx: i, at: row.lo });
});

/** Syllable(s) each band receives from one EDO (unique; "" if none). */
function edoSyllables(edo: number): string[] {
  const acc: string[][] = flat.map(() => []);
  for (let s = 0; s <= edo; s++) {
    const c = (s * 1200) / edo;
    const region = mainRegionContaining(c);
    const between = region ? null : betweenRegionContaining(c);
    if (region) {
      const syl = customSolfege(c);
      const idx = mainIdx.get(`${region}#${subIndexFromVowel(syl)}`) ?? -1;
      if (idx >= 0 && !acc[idx].includes(syl)) acc[idx].push(syl);
    } else if (between) {
      const syl = customSolfege(c);   // "Ha" / "Cha" / "Zha" / "Za" / "Sha"
      const idx = flat.findIndex(r => r.kind === "between" && r.region === between && r.lo <= c && c <= r.hi);
      if (idx >= 0 && !acc[idx].includes(syl)) acc[idx].push(syl);
    } else {
      const a = anchorRows.find(r => Math.abs(c - r.at) < 1e-6);
      if (a && !acc[a.idx].includes("Da")) acc[a.idx].push("Da");
    }
  }
  return acc.map(a => a.join(", "));
}

export default function SolfegeChartTab() {
  const [edoInput, setEdoInput] = useLocalState("solfege_chart_edos", "12, 19, 22, 24, 31, 41, 53");
  const edos = useMemo(() => {
    const nums = (edoInput.match(/\d+/g) ?? []).map(Number).filter(n => n >= 2 && n <= 120);
    return Array.from(new Set(nums)).sort((a, b) => a - b);
  }, [edoInput]);
  const cells = useMemo(() => Object.fromEntries(edos.map(e => [e, edoSyllables(e)])), [edos]);

  return (
    <div className="text-white">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-2">
        <div>
          <h2 className="text-base font-semibold">Solfège Chart</h2>
        </div>
        <label className="text-[11px] text-[#aaa] flex items-center gap-2">
          EDOs
          <input value={edoInput} onChange={e => setEdoInput(e.target.value)} spellCheck={false}
            className="bg-[#0d0d0d] border border-[#2a2a2a] rounded px-2 py-1 text-sm text-white w-56 focus:outline-none focus:border-[#7173e6]"
            placeholder="12, 19, 22, 24, 31, 41, 53" />
        </label>
      </div>

      <div className="flex flex-wrap gap-6 items-start">
      <div className="w-fit rounded-lg border border-[#242424]">
        <table className="border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-[#141414]">
            <tr className="text-[#aaa] [&>th]:border-b [&>th]:border-[#2a2a2a] [&>th]:py-1.5">
              <th className="px-3 text-left font-medium" colSpan={3}>Interval</th>
              <th className="px-2 text-right font-medium">¢</th>
              <th className="px-3 text-left font-medium text-[#8fbf8f]">Solfege</th>
              {edos.map(e => <th key={e} className="px-3 text-center font-semibold text-[#9999ee] whitespace-nowrap">{e}<span className="text-[#666] font-normal">edo</span></th>)}
            </tr>
          </thead>
          <tbody>
            {flat.map((row, i) => {
              const range = row.lo === row.hi ? `${row.lo}` : `${row.lo}–${row.hi}`;
              return (
                <tr key={i} className={`${row.groupStart || row.standalone ? "border-t border-[#2a2a2a]" : "border-t border-[#161616]"} ${row.kind !== "main" ? "bg-[#0d0d0d]" : ""}`}>
                  {row.standalone ? (
                    <td colSpan={3} className="px-3 py-1 text-left text-[#b0b0b0] whitespace-nowrap">{row.label}</td>
                  ) : (
                    <>
                      {row.groupStart && <td rowSpan={row.groupSize} className="px-3 py-1 text-left align-middle font-medium text-[#ddd] border-r border-[#242424] whitespace-nowrap">{row.groupLabel}</td>}
                      {row.equable ? (
                        <td colSpan={2} className="px-3 py-1 text-left text-[#7f7f7f] border-r border-[#242424] whitespace-nowrap">{row.subcat}</td>
                      ) : (
                        <>
                          {row.classStart && <td rowSpan={row.classSize} className="px-3 py-1 text-left align-middle text-[#9a9a9a] border-r border-[#1c1c1c] whitespace-nowrap">{row.klass}</td>}
                          <td className="px-3 py-1 text-left text-[#8a8a8a] border-r border-[#242424] whitespace-nowrap">{row.subcat}</td>
                        </>
                      )}
                    </>
                  )}
                  <td className="px-2 py-1 text-right text-[#666] whitespace-nowrap tabular-nums">{range}</td>
                  <td className="px-3 py-1 text-left whitespace-nowrap font-semibold">
                    {row.solfege ? <span style={{ color: vowelColor(row.solfege) }}>{row.solfege}</span> : <span className="text-[#2b2b2b] font-normal">·</span>}
                  </td>
                  {edos.map(e => {
                    const s = cells[e]?.[i] ?? "";
                    return <td key={e} className="px-3 py-1 text-center whitespace-nowrap">{s ? <span className={row.middle ? "text-white" : "text-[#c8c8c8]"}>{s}</span> : <span className="text-[#2b2b2b]">·</span>}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Separate part — scales & chords, beside the interval gamut. */}
      <ScaleChordsSection edos={edos} />
      </div>
    </div>
  );
}
