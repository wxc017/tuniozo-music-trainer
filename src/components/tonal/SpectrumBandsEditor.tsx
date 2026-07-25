// ── Spectrum Bands editor ───────────────────────────────────────────
// See every interval region individually and DRAG the two margins that split it
// into small / middle / large.  These boundaries are personal; edits persist and
// feed generation, solfège naming and the charts (all read the same regions).

import { useRef, useState } from "react";
import { EDITABLE_REGIONS, getBoundaries, getDefault, setBoundary, resetRegion, resetAll, isModified, ratioCents } from "@/lib/bandOverrides";

const BAND_COLORS = ["#3f9bc4", "#7173e6", "#e0a040"] as const;   // small / middle / large
const BAND_NAMES = ["small", "middle", "large"] as const;

function RegionRow({ name, lo, hi, jis, onChange }: { name: string; lo: number; hi: number; jis?: string[]; onChange: () => void }) {
  const barRef = useRef<HTMLDivElement>(null);
  const [b1, b2] = getBoundaries(name);
  const [d1, d2] = getDefault(name);          // shipped defaults, shown as reference
  const span = hi - lo || 1;
  const pct = (c: number) => ((c - lo) / span) * 100;
  const modified = isModified(name);

  const startDrag = (which: 0 | 1) => (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect) return;
      const frac = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      setBoundary(name, which, lo + frac * span);
      onChange();
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const anchors = (jis ?? []).map(j => ({ j, c: ratioCents(j) })).filter(a => a.c !== null && a.c! >= lo && a.c! <= hi) as { j: string; c: number }[];

  return (
    <div className="py-1.5">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[11px] font-semibold text-[#cfd0ff] w-[130px] shrink-0">{name}</span>
        <span className="text-[9px] font-mono text-[#666]">{lo}–{hi}¢</span>
        <span className="ml-auto flex items-center gap-2 text-[9px] font-mono">
          {(["small", "middle", "large"] as const).map((nm, i) => (
            <span key={nm} style={{ color: BAND_COLORS[i] }}>{nm} {i === 0 ? `${lo}–${b1}` : i === 1 ? `${b1}–${b2}` : `${b2}–${hi}`}</span>
          ))}
          {modified && <button onClick={() => { resetRegion(name); onChange(); }} className="text-[#888] hover:text-white border border-[#2a2a2a] rounded px-1">reset</button>}
        </span>
      </div>
      <div ref={barRef} className="relative h-8 rounded bg-[#0a0a0a] border border-[#1a1a1a] select-none">
        {/* zones */}
        <div className="absolute inset-y-0 left-0" style={{ width: `${pct(b1)}%`, background: BAND_COLORS[0] + "2e" }} />
        <div className="absolute inset-y-0" style={{ left: `${pct(b1)}%`, width: `${pct(b2) - pct(b1)}%`, background: BAND_COLORS[1] + "2e" }} />
        <div className="absolute inset-y-0 right-0" style={{ left: `${pct(b2)}%`, background: BAND_COLORS[2] + "2e" }} />
        {/* band names */}
        {BAND_NAMES.map((nm, i) => {
          const mid = i === 0 ? (lo + b1) / 2 : i === 1 ? (b1 + b2) / 2 : (b2 + hi) / 2;
          return <span key={nm} className="absolute top-0.5 text-[8px] tracking-wide -translate-x-1/2" style={{ left: `${pct(mid)}%`, color: BAND_COLORS[i], opacity: 0.75 }}>{nm}</span>;
        })}
        {/* JI reference ticks */}
        {anchors.map(a => (
          <div key={a.j} className="absolute bottom-0 flex flex-col items-center -translate-x-1/2" style={{ left: `${pct(a.c)}%` }}>
            <span className="text-[7px] font-mono text-[#8a8a8a] leading-none mb-px">{a.j}</span>
            <div className="w-px h-2 bg-[#8a8a8a]" />
          </div>
        ))}
        {/* shipped-default margins — dashed reference lines so you can see the
            original setup while you drag your personal split. */}
        {([d1, d2] as const).map((v, i) => (
          <div key={`def${i}`} className="absolute inset-y-0 w-px -translate-x-1/2 pointer-events-none"
            style={{ left: `${pct(v)}%`, backgroundImage: "repeating-linear-gradient(180deg,#8a8a8a 0 2px,transparent 2px 5px)", opacity: v === (i === 0 ? b1 : b2) ? 0.25 : 0.65 }}
            title={`default ${v}¢`} />
        ))}
        {/* draggable margins */}
        {([[0, b1], [1, b2]] as const).map(([which, val]) => (
          <div key={which} onPointerDown={startDrag(which as 0 | 1)}
            className="absolute inset-y-0 w-3 -translate-x-1/2 cursor-ew-resize flex items-center justify-center group"
            style={{ left: `${pct(val)}%` }} title={`${val}¢ — drag`}>
            <div className="w-[3px] h-full rounded" style={{ background: "#f0f0f0" }} />
            <span className="absolute -top-3.5 text-[8px] font-mono text-[#e6e6e6] opacity-0 group-hover:opacity-100 whitespace-nowrap">{val}¢</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SpectrumBandsEditor({ onChange }: { onChange?: () => void }) {
  const [, setVersion] = useState(0);
  const bump = () => { setVersion(v => v + 1); onChange?.(); };
  return (
    <div className="rounded-lg border border-[#1e1e1e] bg-[#0c0c0c] overflow-hidden">
      <div className="px-3 py-1.5 border-b border-[#161616] flex items-center gap-2 bg-[#0a0a0a]">
        <span className="w-1.5 h-3 rounded-sm" style={{ background: "#7aa8d0" }} />
        <span className="text-[10px] font-semibold tracking-widest text-[#8a8a8a]">SPECTRUM BANDS · drag the margins</span>
        <span className="text-[9px] text-[#5a5a5a] flex items-center gap-1"><span className="inline-block w-3 h-0" style={{ borderTop: "2px dashed #8a8a8a" }} /> default</span>
        <button onClick={() => { resetAll(); bump(); }} className="ml-auto text-[10px] text-[#888] hover:text-white border border-[#2a2a2a] rounded px-1.5 py-0.5">reset all</button>
      </div>
      <div className="p-3 divide-y divide-[#141414]">
        {EDITABLE_REGIONS.map(r => <RegionRow key={r.name} {...r} onChange={bump} />)}
        <div className="pt-2 text-[9px] text-[#4a4a4a]">Personal boundaries — saved on this device. They take effect on the next Generate, and rename the solfège vowels (small/middle/large) accordingly.</div>
      </div>
    </div>
  );
}
