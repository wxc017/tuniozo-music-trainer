// ── Auto functional-harmony panel (Tonal Audiation) ─────────────────
// Pick any scale from the exhaustive, per-EDO-correct catalog; the panel
// derives its diatonic chords by stacking scale-thirds, names each in the
// sized-interval system (position numeral + sized quality), and groups them
// by harmonic function (Tonic / Subdominant / Dominant) — all from theory,
// correct in every EDO.  Click a chord to hear it.

import { useMemo, useState } from "react";
import { getScalesForEdo, type NamedScale } from "@/lib/commonScales";
import { deriveFunctionalChords, FUNCTION_ORDER, FUNCTION_COLOR, type FunctionalChord } from "@/lib/functionalChords";

let _ac: AudioContext | null = null;
function audio(): AudioContext {
  if (!_ac) _ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (_ac.state === "suspended") void _ac.resume();
  return _ac;
}
function playChord(steps: number[], edo: number, rootPc: number) {
  const ac = audio();
  const base = 261.6256 * Math.pow(2, rootPc / 12); // C4 transposed to the tonic pc
  const t0 = ac.currentTime + 0.02;
  for (const s of steps) {
    const o = ac.createOscillator(); o.type = "triangle";
    o.frequency.value = base * Math.pow(2, s / edo);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.16, t0 + 0.02);
    g.gain.linearRampToValueAtTime(0, t0 + 1.1);
    o.connect(g); g.connect(ac.destination);
    o.start(t0); o.stop(t0 + 1.2);
  }
}

export default function FunctionalChordsPanel({ edo, rootPc = 0 }: { edo: number; rootPc?: number }) {
  const [picked, setPicked] = useState<NamedScale | null>(null);
  const [sevenths, setSevenths] = useState(false);

  const groups = useMemo(() => {
    const scales = getScalesForEdo(edo);
    const gs: { name: string; scales: NamedScale[] }[] = [];
    for (const s of scales) {
      let g = gs.find(x => x.name === s.group);
      if (!g) { g = { name: s.group, scales: [] }; gs.push(g); }
      g.scales.push(s);
    }
    return gs;
  }, [edo]);

  // Default to the first diatonic mode (Major) if nothing picked yet.
  const scale = picked ?? groups[0]?.scales[0] ?? null;
  const chords = useMemo(() => scale ? deriveFunctionalChords(scale.steps, edo) : [], [scale, edo]);

  const byFunction = (f: string) => chords.filter(c => c.func === f);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold tracking-widest text-[#c8a0e0] uppercase">Functional Chords (auto · theory)</span>
        <span className="text-[10px] text-[#666]">{getScalesForEdo(edo).length} scales · {edo}-EDO</span>
        <label className="ml-auto flex items-center gap-1 text-[10px] text-[#888]">
          <input type="checkbox" checked={sevenths} onChange={e => setSevenths(e.target.checked)} className="accent-[#7173e6]" />
          7th chords
        </label>
      </div>

      {/* Scale catalog — grouped, exhaustive, per-EDO correct */}
      <div className="max-h-56 overflow-y-auto rounded bg-[#0a0a0a] border border-[#1e1e1e] p-2 space-y-1.5">
        {groups.map(g => (
          <div key={g.name} className="space-y-1">
            <p className="text-[9px] font-bold tracking-widest text-[#7a8a9a] border-b border-[#1a1a1a] pb-0.5">{g.name}</p>
            <div className="flex flex-wrap gap-1">
              {g.scales.map((s, i) => {
                const on = scale === s || (scale != null && s.steps.join() === scale.steps.join() && s.name === scale.name);
                return (
                  <button key={s.name + i} onClick={() => setPicked(s)}
                    title={s.steps.map(st => `${st}\\${edo}`).join(" ")}
                    className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${on
                      ? "bg-[#2a1a3a] border-[#c8a0e0] text-[#e6cff5]"
                      : "bg-[#111] border-[#2a2a2a] text-[#888] hover:text-[#ccc]"}`}>
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Derived functional chords for the picked scale */}
      {scale && (
        <div>
          <p className="text-[11px] text-[#aaa] mb-1.5">
            <span className="font-semibold text-[#e6cff5]">{scale.name}</span>
            <span className="text-[#666]"> — {chords.length} diatonic chords by function</span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            {FUNCTION_ORDER.map(fn => (
              <div key={fn} className="rounded border bg-[#0c0c0c] p-1.5"
                style={{ borderColor: FUNCTION_COLOR[fn] + "55" }}>
                <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: FUNCTION_COLOR[fn] }}>{fn}</p>
                <div className="flex flex-col gap-1">
                  {byFunction(fn).map((c: FunctionalChord) => {
                    const steps = sevenths ? c.seventhSteps : c.triadSteps;
                    const sym = sevenths ? c.seventhSymbol : c.symbol;
                    return (
                      <button key={c.degree} onClick={() => playChord(steps, edo, rootPc)}
                        title={`degree ${c.degree} · ${steps.map(s => `${s}\\${edo}`).join(" ")}`}
                        className="text-left px-1.5 py-1 rounded bg-[#141414] border border-[#222] hover:border-[#444] transition-colors">
                        <span className="font-mono text-[12px] font-bold" style={{ color: FUNCTION_COLOR[fn] }}>{sym}</span>
                      </button>
                    );
                  })}
                  {byFunction(fn).length === 0 && <span className="text-[9px] text-[#444]">—</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
