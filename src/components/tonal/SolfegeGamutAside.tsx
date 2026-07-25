// ── Solfège Gamut aside ─────────────────────────────────────────────
// The interval → solfège gamut from the Solfège Chart, reproduced here as a
// compact side reference for Spectrum Audiation (same layout, minus the per-EDO
// comparison columns).  Click a syllable to hear it spoken.

import { REGIONS } from "@/lib/intervalSpectrum";
import { customSolfege, betweenSyllable } from "@/lib/customSolfege";

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
  return v === "a" ? "#8fbf8f" : v === "e" || v === "i" ? "#c99a55" : "#6f93b8";
};

interface Row {
  kind: "main" | "between" | "anchor";
  groupLabel: string; label: string; klass: string; subcat: string;
  lo: number; hi: number; solfege: string; middle: boolean; equable: boolean;
  groupStart: boolean; groupSize: number; standalone: boolean; classStart: boolean; classSize: number;
}

// One row per band (cents order), with Interval-group + Class rowspans — the
// same construction the Solfège Chart uses.
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
      lo: r.lo, hi: r.hi, solfege: anchor ? "Da" : betweenSyllable(r.name),
      middle: false, equable: isEquable,
      groupStart: false, groupSize: 1, standalone: false, classStart: false, classSize: 1,
    });
  } else {
    const { degree, klass } = parseMain(r.name);
    const midIdx = Math.floor((r.subs.length - 1) / 2);
    r.subs.forEach((s, i) => {
      flat.push({
        kind: "main", groupLabel: degree, label: degree, klass, subcat: titleCase(s.name),
        lo: s.lo, hi: s.hi, solfege: customSolfege((s.lo + s.hi) / 2),
        middle: i === midIdx, equable: false,
        groupStart: false, groupSize: 1, standalone: false, classStart: false, classSize: 1,
      });
    });
  }
}
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

export default function SolfegeGamutAside() {
  return (
    <div className="rounded-lg border border-[#1e1e1e] bg-[#0c0c0c] overflow-hidden">
      <div className="px-3 py-1.5 border-b border-[#161616] flex items-center gap-2 bg-[#0a0a0a]">
        <span className="w-1.5 h-3 rounded-sm" style={{ background: "#7aa87a" }} />
        <span className="text-[10px] font-semibold tracking-widest text-[#8a8a8a]">SOLFÈGE GAMUT</span>
      </div>
      <div>
        <table className="border-collapse text-[11px] w-full">
          <thead className="bg-[#141414]">
            <tr className="text-[#999] [&>th]:border-b [&>th]:border-[#2a2a2a] [&>th]:py-1">
              <th className="px-2 text-left font-medium" colSpan={3}>Interval</th>
              <th className="px-1.5 text-right font-medium">¢</th>
              <th className="px-2 text-left font-medium text-[#8fbf8f]">Solfège</th>
            </tr>
          </thead>
          <tbody>
            {flat.map((row, i) => {
              const range = row.lo === row.hi ? `${row.lo}` : `${row.lo}–${row.hi}`;
              return (
                <tr key={i} className={`${row.groupStart || row.standalone ? "border-t border-[#2a2a2a]" : "border-t border-[#161616]"} ${row.kind !== "main" ? "bg-[#0d0d0d]" : ""}`}>
                  {row.standalone ? (
                    <td colSpan={3} className="px-2 py-0.5 text-left text-[#b0b0b0] whitespace-nowrap">{row.label}</td>
                  ) : (
                    <>
                      {row.groupStart && <td rowSpan={row.groupSize} className="px-2 py-0.5 text-left align-middle font-medium text-[#ddd] border-r border-[#242424] whitespace-nowrap">{row.groupLabel}</td>}
                      {row.equable ? (
                        <td colSpan={2} className="px-2 py-0.5 text-left text-[#7f7f7f] border-r border-[#242424] whitespace-nowrap">{row.subcat}</td>
                      ) : (
                        <>
                          {row.classStart && <td rowSpan={row.classSize} className="px-2 py-0.5 text-left align-middle text-[#9a9a9a] border-r border-[#1c1c1c] whitespace-nowrap">{row.klass}</td>}
                          <td className="px-2 py-0.5 text-left text-[#8a8a8a] border-r border-[#242424] whitespace-nowrap">{row.subcat}</td>
                        </>
                      )}
                    </>
                  )}
                  <td className="px-1.5 py-0.5 text-right text-[#666] whitespace-nowrap tabular-nums">{range}</td>
                  <td className="px-2 py-0.5 text-left whitespace-nowrap font-semibold">
                    {row.solfege
                      ? <span style={{ color: vowelColor(row.solfege) }}>{row.solfege}</span>
                      : <span className="text-[#2b2b2b] font-normal">·</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
