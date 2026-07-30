// ── 3-, 4-Part Chords reference (Spectrum Research tab) ──────────────────
// Two sub-tabs (3-Part / 4-Part) over the M-Lode + over-bass catalogue.
// Each row is a set of aligned columns: the voicing ("1 + upper degrees"), the
// structure it re-roots to (its own chord formula), the scale degree it sits
// on, and the construction name.  No interval pills, no "=".
import { useState } from "react";
import { THREE_PART, FOUR_PART, obDegree, type StructFamily, type ChordStruct } from "@/lib/overBassStructures";

const GRID = "34px 190px 1fr auto";

// Rows are numbered ①②③ rather than I·II·III.  A roman numeral means a scale
// DEGREE everywhere else in the app; using it here for "the third entry in this
// family" was the same symbol saying something completely different.
const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫"];

/** "1" → "1st", "♭3" → "3rd", "13" → "13th".
 *  Accidentals are deliberately DROPPED.  The point of this vocabulary is to say
 *  which member of the stack a tone is without committing to a quality — ♭3 and 3
 *  are both "the 3rd", which stays true in any scale or EDO, where "♭3" and the
 *  quality words built on it ("min7 shell") quietly assume a major-scale reading. */
function ordinal(deg: string): string {
  const n = parseInt(deg.replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(n)) return deg;
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

function Degrees({ degs, gold }: { degs: string[]; gold?: boolean }) {
  return (
    <span className="italic font-mono text-[14px] tabular-nums tracking-tight">
      {degs.map((d, i) => (
        <span key={i}>
          {i > 0 && <span className="not-italic text-[#464646]"> · </span>}
          <span style={{ color: gold && i === 0 ? "#e6c674" : "#dcdcdc", fontWeight: gold && i === 0 ? 800 : 700 }}>
            {ordinal(d.trim())}
          </span>
        </span>
      ))}
    </span>
  );
}

function MemberRow({ m, color, index }: { m: ChordStruct; color: string; index: number }) {
  const numTag = (
    <span className="w-[34px] text-center font-mono text-[22px] leading-none py-[1px]" style={{ color }}>
      {CIRCLED[index] ?? index + 1}
    </span>
  );

  if (m.over) {
    const upDegs = m.upper.map(obDegree);
    return (
      <div className="grid items-center gap-x-4 py-[9px]" style={{ gridTemplateColumns: GRID }}>
        {numTag}
        {/* voicing: bass + upper members, all as ordinals */}
        <span className="italic font-mono text-[14px] tabular-nums tracking-tight whitespace-nowrap">
          <span style={{ color: "#e6c674", fontWeight: 800 }}>1st</span>
          <span className="not-italic text-[#5f5f5f] px-1.5">+</span>
          {upDegs.map((d, i) => (
            <span key={i}>
              {i > 0 && <span className="not-italic text-[#464646]"> · </span>}
              <span className="text-[#dcdcdc] font-bold">{ordinal(d)}</span>
            </span>
          ))}
        </span>
        {/* the structure it re-roots to, named by member only — no quality word,
            no scale-degree roman: both said more than this vocabulary intends. */}
        <span className="italic font-mono font-bold text-[13px] tabular-nums" style={{ color }}>
          {(m.local ?? []).map(d => ordinal(d)).join(" · ")}
        </span>
        <span aria-hidden />
      </div>
    );
  }

  return (
    <div className="grid items-center gap-x-4 py-[9px]" style={{ gridTemplateColumns: GRID }}>
      {numTag}
      <span className="whitespace-nowrap"><Degrees degs={(m.degFull ?? "").split("·")} gold /></span>
      <span aria-hidden />
      <span className="justify-self-end text-[10.5px] font-medium px-2.5 py-[2px] rounded-full whitespace-nowrap"
            style={{ color, background: color + "14" }}>{m.name}</span>
    </div>
  );
}

function FamilyCard({ fam }: { fam: StructFamily }) {
  return (
    <div className="relative rounded-2xl border overflow-hidden"
         style={{ borderColor: "#20222a", background: "linear-gradient(180deg,#111318,#0c0d11)" }}>
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: fam.color }} aria-hidden />
      <div className="flex items-baseline gap-2 px-4 pt-3.5 pb-2.5 border-b border-[#181a20]">
        <span className="text-[15px] font-extrabold tracking-wide" style={{ color: fam.color }}>{fam.label}</span>
        <span className="text-[10.5px] text-[#7a7a7a]">{fam.desc}</span>
        <span className="ml-auto text-[10px] text-[#666] font-mono rounded-full px-1.5 py-[1px]"
              style={{ background: fam.color + "12" }}>{fam.members.length}</span>
      </div>
      <div className="px-4 py-1 divide-y divide-[#16181e]">
        {fam.members.map((m, i) => <MemberRow key={m.id} m={m} color={fam.color} index={i} />)}
      </div>
    </div>
  );
}

export default function OverBassReference() {
  const [tab, setTab] = useState<"3" | "4">("4");
  const families = tab === "3" ? THREE_PART : FOUR_PART;
  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-baseline gap-3 mb-4 flex-wrap">
        <h2 className="text-[22px] font-bold text-[#efefef] tracking-tight">3-, 4-Part Chords</h2>
      </div>

      <div className="inline-flex items-center p-1 mb-5 rounded-xl bg-[#0e0f13] border border-[#20222a]">
        {([["3", "3-Part"], ["4", "4-Part"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className="px-5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors"
            style={tab === id
              ? { background: "#2a2c6e", color: "#c6c7fb", boxShadow: "0 1px 0 #ffffff10 inset" }
              : { background: "transparent", color: "#7f7f7f" }}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {families.map(f => <FamilyCard key={f.key} fam={f} />)}
      </div>
    </div>
  );
}
