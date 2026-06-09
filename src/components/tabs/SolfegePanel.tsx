// ── Solfège palette (for the fullscreen Lumatone) ───────────────────
// Shows the solfège for the CURRENT EDO only — one syllable per step.
// Plain click = hear the syllable.  Ctrl/⌘-click = select it (silent) → adds to
// the scale, shown separately (with its interval/degree) and lit on the keyboard.
// ▶ Play sounds the whole selected scale as tones.

import { type Dispatch, type MouseEvent, type SetStateAction, useState } from "react";
import { solfegeFor, speakSolfege } from "@/lib/solfegeGamut";
import { fuzzyCode } from "@/lib/intervalCodes";
import { getScalesForEdo, type NamedScale } from "@/lib/commonScales";

// One shared AudioContext for the "play scale" arpeggio.
let _ac: AudioContext | null = null;
function audio(): AudioContext {
  if (!_ac) _ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (_ac.state === "suspended") void _ac.resume();
  return _ac;
}
function tone(ac: AudioContext, freq: number, when: number, dur: number) {
  const o = ac.createOscillator(); o.type = "triangle"; o.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.22, when + 0.02);
  g.gain.linearRampToValueAtTime(0, when + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(when); o.stop(when + dur + 0.05);
}

export default function SolfegePanel({ edo, scale, setScale, onPickScale }: {
  edo: number | null;
  scale: Set<number>;
  setScale: Dispatch<SetStateAction<Set<number>>>;
  onPickScale?: (s: NamedScale | null) => void;   // pick (or null = clear) — re-centers lattice / loads muted voices
}) {
  const [exhaustive, setExhaustive] = useState(false);
  if (edo == null) return <div className="text-xs text-[#666]">No EDO selected.</div>;

  const steps = Array.from({ length: edo }, (_, k) => ({ k, cents: (k * 1200) / edo, cell: solfegeFor((k * 1200) / edo) }));
  const selected = steps.filter(s => scale.has(s.k));
  const presets = getScalesForEdo(edo, exhaustive);
  const presetActive = (st: number[]) => st.length === scale.size && st.every(s => scale.has(s));
  // Nest scales: family heading → interval-limit sub-group → scales.  Group
  // strings are "<family> · <limit>"; anything without " · " (e.g. MOS shapes)
  // sits under its own heading with no limit sub-row.
  const FAMILY_ORDER = ["Ionian", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Aeolian", "Locrian", "Neutral",
    "Harmonic Minor", "Melodic Minor", "Harmonic Major", "Double Harmonic", "Pentatonic", "Symmetric", "Harmonic series", "Maqam & other", "Other"];
  const LIMIT_ORDER = ["Ptolemaic", "Septimal", "Undecimal", ""];
  const orderBy = (list: string[]) => (a: string, b: string) => {
    const ia = list.indexOf(a), ib = list.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  };
  const tiers = presets.reduce<Record<string, Record<string, typeof presets>>>((acc, p) => {
    const i = p.group.indexOf(" · ");
    const family = i >= 0 ? p.group.slice(0, i) : p.group;
    const limit = i >= 0 ? p.group.slice(i + 3) : "";
    ((acc[family] ??= {})[limit] ??= []).push(p);
    return acc;
  }, {});
  const familyNames = Object.keys(tiers).sort(orderBy(FAMILY_ORDER));

  const onClick = (k: number, cell: ReturnType<typeof solfegeFor>, e: MouseEvent) => {
    if (e.ctrlKey || e.metaKey)                          // Ctrl/⌘ = select (silent)
      setScale(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
    else
      speakSolfege(cell);                                // plain click = hear it
  };

  // Play the whole selected scale as an ascending arpeggio of tones.
  const playScale = () => {
    if (!selected.length) return;
    const ac = audio();
    const base = 261.6256;          // C4
    const dur = 0.34;
    const t0 = ac.currentTime + 0.06;
    selected.forEach((s, i) => tone(ac, base * Math.pow(2, s.k / edo), t0 + i * dur, dur * 0.9));
  };

  const hbtn = "px-1.5 py-0.5 rounded text-xs font-medium border transition-colors";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-light text-[#aaa] uppercase tracking-[0.18em]">Solfège · {edo}-EDO</span>
        <button onClick={playScale} disabled={!selected.length}
          className={`${hbtn} bg-[#10240e] border-[#2a4a2a] text-[#7aaa7a] hover:text-[#aaffaa] disabled:opacity-40`}>▶ Play</button>
        <button onClick={() => { setScale(new Set()); onPickScale?.(null); }} disabled={!selected.length}
          className={`${hbtn} bg-[#1a1010] border-[#3a2020] text-[#cc8080] hover:text-[#ffaaaa] disabled:opacity-40`}>Clear</button>
      </div>

      {/* the selected scale, separately — syllable + its interval/degree */}
      <div className="flex flex-wrap gap-1 items-start min-h-[34px] p-1.5 rounded bg-[#0a0a0a] border border-[#1e1e1e]">
        {selected.length === 0
          ? <span className="text-[10px] text-[#555]">Ctrl/⌘-click syllables (or pick a scale below) to build a scale…</span>
          : selected.map(s => (
            <span key={s.k} onClick={() => speakSolfege(s.cell)} title={`/${s.cell.ipa}/ · ${Math.round(s.cents)}¢`}
              className="flex flex-col items-center leading-tight px-1.5 py-0.5 rounded bg-[#7173e6] text-white cursor-pointer hover:brightness-110">
              <span className="text-xs">{s.cell.solfege}</span>
              <span className="text-[8px] text-[#dcdcf6]">{fuzzyCode(s.cents)}</span>
            </span>
          ))}
      </div>

      {/* preset scales — nested: family heading → interval-limit → scales */}
      {familyNames.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-light text-[#888] uppercase tracking-[0.18em]">Scales</span>
            <button onClick={() => setExhaustive(v => !v)}
              title="Off: just the Small/Center/Large flavor of each family. On: all sized 6th/7th alterations too."
              className={`px-1.5 py-px rounded text-[9px] font-medium border transition-colors ${exhaustive
                ? "bg-[#252550] border-[#7173e6] text-[#cfe6ff]" : "bg-[#14141a] border-[#2a2a3a] text-[#8888c0] hover:text-[#cfe6ff]"}`}>
              {exhaustive ? "Exhaustive ✓" : "Exhaustive"}
            </button>
          </div>
          <div className="flex flex-col gap-2 rounded bg-[#0a0a0a] border border-[#1e1e1e] px-2 py-1.5">
            {familyNames.map(family => {
              const limits = tiers[family];
              const limitNames = Object.keys(limits).sort(orderBy(LIMIT_ORDER));
              return (
                <div key={family} className="flex flex-col gap-1">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#d4a050]">{family}</span>
                  {limitNames.map(limit => (
                    <div key={limit} className="flex flex-col gap-0.5 pl-1.5">
                      {limit && <span className="text-[8px] font-light uppercase tracking-[0.18em] text-[#5a6a5a]">{limit}</span>}
                      <div className="flex flex-wrap gap-x-1 gap-y-0.5">
                        {limits[limit].map(p => {
                          const on = presetActive(p.steps);
                          return (
                            <button key={p.name} onClick={() => {
                                if (on) { setScale(new Set()); onPickScale?.(null); }   // already selected → clear
                                else { setScale(new Set(p.steps)); onPickScale?.(p); }
                              }}
                              title={`${p.name} · ${p.steps.map(s => `${s}\\${edo}`).join(" ")}`}
                              className={`px-1.5 py-px rounded text-[10px] font-light tracking-tight leading-tight border transition-colors ${on
                                ? "bg-[#26412091] border-[#5a8a5a] text-[#bfe6bf]"
                                : "bg-[#141414] border-[#2a2a2a] text-[#9a9a9a] hover:border-[#4a6a4a] hover:text-[#dcdcdc]"}`}>
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* full palette for this EDO — tidy uniform grid */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-[#888] uppercase tracking-wider">All syllables</span>
        <div className="grid grid-cols-4 gap-1">
          {steps.map(({ k, cents, cell }) => {
            const on = scale.has(k);
            return (
              <button key={k} onClick={e => onClick(k, cell, e)}
                title={`step ${k} · ${fuzzyCode(cents)} · /${cell.ipa}/ · ${Math.round(cents)}¢`}
                className={`px-1 py-0.5 rounded text-[11px] font-light tracking-tight text-center transition-colors ${on
                  ? "bg-[#7173e6] text-white"
                  : "bg-[#161616] text-[#cfcfcf] hover:bg-[#222238] hover:text-white"}`}>
                {cell.solfege}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
