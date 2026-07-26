// ── Notation picker ("n" popup) ─────────────────────────────────────
// Two per-EDO axes: the interval-symbol notation system, and the solfège system
// (Spectrum-ege everywhere; 12-EDO also offers Movable Do).  The solfège choice
// drives the Sol-fa editor's syllables; its Major/Minor spelling is set there.

import { notationsForEdo, solfegesForEdo, authorFor, SCHULTER, SPECTRUM_SOLFEGE } from "@/lib/notationLabels";

export default function NotationPicker({
  edos, notation, solfege, onNotation, onSolfege, onClose,
}: {
  edos: number[];
  notation: Record<number, string>;
  solfege?: Record<number, string>;
  onNotation: (edo: number, system: string) => void;
  onSolfege?: (edo: number, system: string) => void;
  onClose: () => void;
}) {
  const list = [...new Set(edos)].filter(e => Number.isFinite(e)).sort((a, b) => a - b);

  const Section = ({ title, optionsFor, value, onPick, fallback, hideSingle }: {
    title: string;
    optionsFor: (edo: number) => string[];
    value: Record<number, string>;
    onPick: (edo: number, s: string) => void;
    fallback: string;
    hideSingle?: boolean;   // skip EDOs that offer only one system (no choice)
  }) => {
    const rows = list.filter(edo => !hideSingle || optionsFor(edo).length > 1);
    return (
      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#8888c0] mb-1.5">{title}</h3>
        <div className="flex flex-col gap-2">
          {rows.map(edo => {
            const opts = optionsFor(edo);
            const cur = value[edo] ?? fallback;
            return (
              <div key={edo} className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-[#e0c070] w-16 shrink-0">{edo}-EDO</span>
                <div className="flex flex-wrap gap-1">
                  {opts.map(o => {
                    const on = cur === o;
                    const by = authorFor(o);
                    return (
                      <button key={o} onClick={() => onPick(edo, o)}
                        title={by ? `by ${by}` : undefined}
                        className={`px-2 py-1 text-[11px] rounded border transition-colors text-left ${on
                          ? "bg-[#252550] border-[#7173e6] text-[#cfe6ff]"
                          : "bg-[#111] border-[#2a2a2a] text-[#999] hover:text-[#ddd] hover:border-[#3a3a5a]"}`}>
                        {o}{by && <span className="block text-[8px] opacity-60">by {by}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <p className="text-xs text-[#666]">{hideSingle ? "Only 12-EDO offers a solfège choice." : "No EDO open."}</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[85vh] overflow-auto bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl shadow-2xl p-5"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#cfe6ff]">Notation</h2>
          <button onClick={onClose} className="text-[#999] hover:text-[#cc6666] text-xl leading-none">✕</button>
        </div>
        <div className="flex flex-col gap-5">
          <Section title="Notation" optionsFor={notationsForEdo} value={notation} onPick={onNotation} fallback={SCHULTER} />
          {onSolfege
            ? <Section title="Solfège" optionsFor={solfegesForEdo} value={solfege ?? {}} onPick={onSolfege} fallback={SPECTRUM_SOLFEGE} hideSingle />
            : (
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#8888c0] mb-1.5">Solfège</h3>
                <p className="text-xs text-[#888]">
                  <span className="text-[#cfe6ff] font-semibold">Spectrum-ege</span> — the region-centered syllables from the Solfège chart.
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
