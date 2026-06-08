// ── Lumatone Intervals ──────────────────────────────────────────────
// Pick an EDO → the Lumatone board renders with each key labelled by the
// nearest just interval from the chosen root.  Click a key to drone it;
// Ctrl/Cmd-click to make it the new root.

import { useEffect, useState, type MouseEvent } from "react";
import LumatoneKeyboard from "@/components/LumatoneKeyboard";
import { computeLayout, type LayoutResult, type LumatoneData, type ComputedKey } from "@/lib/lumatoneLayout";
import { getPastelLayoutFile } from "@/lib/edoData";
import { fuzzyCode, solfegeName } from "@/lib/intervalCodes";
import { useDroneSynth } from "@/hooks/useDroneSynth";
import { useLocalState } from "@/hooks/useLocalState";

const AVAILABLE = [
  5, 7, 12, 17, 19, 22, 26, 27, 29, 31, 32, 33, 34, 35, 37, 39, 40, 41, 43, 45, 46, 47, 49, 50, 53,
  55, 56, 63, 80, 81, 94,
];
const C4 = 261.6256; // layout pitch 0 = C4

export default function LumatoneIntervalsTab() {
  const [edo, setEdo] = useLocalState("li_edo", 31);
  const [rootPc, setRootPc] = useLocalState("li_root", 0);
  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const { active, toggle, stopAll } = useDroneSynth();

  useEffect(() => {
    let alive = true;
    setLayout(null);
    fetch(getPastelLayoutFile(edo))
      .then(r => r.json())
      .then((d: LumatoneData) => { if (alive) setLayout(computeLayout(d)); })
      .catch(() => { if (alive) setLayout(null); });
    return () => { alive = false; };
  }, [edo]);

  // Ring structure: the best fifth generates a subgroup; gcd(fifth, edo) = #rings
  const fifthSteps = Math.round(edo * Math.log2(3 / 2));
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const rings = gcd(fifthSteps, edo);
  const [ring, setRing] = useState<number | null>(null);   // null = show all rings
  const ringOf = (pc: number) => (((pc - rootPc) % rings) + rings) % rings;
  const muted = ring === null ? undefined
    : new Set(Array.from({ length: edo }, (_, pc) => pc).filter(pc => ringOf(pc) !== ring));

  const [nameMode, setNameMode] = useLocalState<"code" | "solfege">("li_namemode", "code");

  // Each key labelled by its spectrum interval from the root (code or solfège).
  const labelOf = (pitch: number) => {
    const cents = ((((pitch - rootPc) % edo) + edo) % edo) * 1200 / edo;
    return nameMode === "solfege" ? solfegeName(cents) : fuzzyCode(cents);
  };

  // Click = drone the key; Ctrl/Cmd-click = set it as the root.
  const onKey = (k: ComputedKey, e: MouseEvent) => {
    if (e.ctrlKey || e.metaKey) { setRootPc(((k.pitch % edo) + edo) % edo); return; }
    toggle(String(k.pitch), C4 * Math.pow(2, k.pitch / edo));
  };
  const highlighted = new Set([...active].map(Number));

  const ringBtn = (on: boolean) =>
    `px-2 py-1 rounded text-[11px] font-medium border transition-colors ${on
      ? "bg-[#252550] border-[#7173e6] text-[#cfe6ff]"
      : "bg-[#14141a] border-[#2a2a3a] text-[#8888c0] hover:text-[#cfe6ff]"}`;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-[#e0a040]">Lumatone Intervals</h2>
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2">
          <span className="text-[10px] text-[#888] uppercase tracking-wider">EDO</span>
          <select value={edo} onChange={e => { setEdo(Number(e.target.value)); setRootPc(0); setRing(null); stopAll(); }}
            className="px-2 py-1 text-sm bg-[#0a0a08] border border-[#2a2620] rounded text-[#d4a050] outline-none">
            {AVAILABLE.map(e => <option key={e} value={e}>{e}-EDO</option>)}
          </select>
        </label>
        {rings > 1 && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[#888] uppercase tracking-wider mr-1">Rings ({rings})</span>
            <button onClick={() => setRing(null)} className={ringBtn(ring === null)}>Both</button>
            {Array.from({ length: rings }, (_, i) => (
              <button key={i} onClick={() => setRing(i)} className={ringBtn(ring === i)}>Ring {i + 1}</button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1">
          <button onClick={() => setNameMode("code")} className={ringBtn(nameMode === "code")}>Intervals</button>
          <button onClick={() => setNameMode("solfege")} className={ringBtn(nameMode === "solfege")}>Solfège</button>
        </div>
        <span className="text-[11px] text-[#888]">
          Keys show the nearest just interval from the root.
          {" "}<span className="text-[#cfe6ff] font-semibold">Click = drone</span>,
          {" "}<span className="text-[#cfe6ff] font-semibold">Ctrl/⌘-click = set root</span>.
        </span>
        {active.size > 0 && (
          <button onClick={stopAll}
            className="ml-auto px-3 py-1 rounded text-sm font-medium border bg-[#1a1010] border-[#3a2020] text-[#cc8080] hover:text-[#ffaaaa] transition-colors">
            ■ Stop all
          </button>
        )}
      </div>
      {layout
        ? <LumatoneKeyboard layout={layout} highlightedPitches={highlighted} edo={edo}
            labelOf={labelOf} rootPitchClass={rootPc} mutedPitchClasses={muted}
            onKeyClick={onKey} maxHeight={null} />
        : <div className="text-sm text-[#666]">Loading {edo}-EDO…</div>}
    </div>
  );
}
