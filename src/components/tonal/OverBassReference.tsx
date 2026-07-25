// ── 3-, 4-Part Chords reference (Spectrum Research tab) ──────────────────
// Two sub-tabs (3-Part / 4-Part) over the M-Lode + over-bass catalogue.
// Each row is a set of aligned columns: the voicing ("1 + upper degrees"), the
// structure it re-roots to (its own chord formula), the scale degree it sits
// on, and the construction name.  No interval pills, no "=".
import { useState } from "react";
import { THREE_PART, FOUR_PART, obDegree, type StructFamily, type ChordStruct } from "@/lib/overBassStructures";

const GRID = "34px 132px 1fr auto";

function DegBadge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="italic font-mono font-bold text-[11px] px-1.5 py-[2px] rounded-md leading-none"
          style={{ color, background: color + "18", border: `1px solid ${color}3a` }}>
      {children}
    </span>
  );
}

function Degrees({ degs, gold }: { degs: string[]; gold?: boolean }) {
  return (
    <span className="font-mono text-[15px] tabular-nums tracking-tight">
      {degs.map((d, i) => (
        <span key={i}>
          {i > 0 && <span className="text-[#464646]"> · </span>}
          <span style={{ color: gold && i === 0 ? "#e6c674" : "#dcdcdc", fontWeight: gold && i === 0 ? 800 : 700 }}>{d}</span>
        </span>
      ))}
    </span>
  );
}

function MemberRow({ m, color }: { m: ChordStruct; color: string }) {
  const nameTag = (
    <span className="justify-self-end text-[10.5px] font-medium px-2.5 py-[2px] rounded-full whitespace-nowrap"
          style={{ color, background: color + "14" }}>{m.name}</span>
  );

  if (m.over) {
    const upDegs = m.upper.map(obDegree);
    return (
      <div className="grid items-center gap-x-4 py-[9px]" style={{ gridTemplateColumns: GRID }}>
        <span className="w-[34px] text-center italic font-mono font-bold text-[11px] rounded-md py-[3px]"
              style={{ color, background: color + "16", border: `1px solid ${color}3a` }}>{m.roman}</span>
        {/* voicing: bass + upper degrees */}
        <span className="font-mono text-[15px] tabular-nums tracking-tight whitespace-nowrap">
          <span style={{ color: "#e6c674", fontWeight: 800 }}>1</span>
          <span className="text-[#5f5f5f] px-1.5">+</span>
          {upDegs.map((d, i) => <span key={i}>{i > 0 && <span className="text-[#464646]"> · </span>}<span className="text-[#dcdcdc] font-bold">{d}</span></span>)}
        </span>
        {/* structure it re-roots to + the degree it's built on */}
        <span className="flex items-center gap-2">
          <span className="font-mono font-bold text-[13px] tabular-nums" style={{ color }}>{(m.local ?? []).join(" · ")}</span>
          <DegBadge color={color}>{m.at}</DegBadge>
        </span>
        {nameTag}
      </div>
    );
  }

  return (
    <div className="grid items-center gap-x-4 py-[9px]" style={{ gridTemplateColumns: GRID }}>
      <span aria-hidden />
      <span className="whitespace-nowrap"><Degrees degs={(m.degFull ?? "").split("·")} gold /></span>
      <span aria-hidden />
      {nameTag}
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
        {fam.members.map(m => <MemberRow key={m.id} m={m} color={fam.color} />)}
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
