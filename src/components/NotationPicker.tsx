// ── Notation picker ("n" popup) ─────────────────────────────────────
// Notation section only — pick the interval-symbol system per EDO.  Solfège is
// no longer selectable: it's always "Spectrum-ege" (the region-centered
// syllables from the Solfège chart), used everywhere.

import { notationsForEdo, authorFor, SCHULTER } from "@/lib/notationLabels";

export default function NotationPicker({
  edos, notation, onNotation, onClose,
}: {
  edos: number[];
  notation: Record<number, string>;
  solfege?: Record<number, string>;
  onNotation: (edo: number, system: string) => void;
  onSolfege?: (edo: number, system: string) => void;
  onClose: () => void;
}) {
  const list = [...new Set(edos)].filter(e => Number.isFinite(e)).sort((a, b) => a - b);

  const Section = ({ title, optionsFor, value, onPick, fallback }: {
    title: string;
    optionsFor: (edo: number) => string[];
    value: Record<number, string>;
    onPick: (edo: number, s: string) => void;
    fallback: string;
  }) => (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#8888c0] mb-1.5">{title}</h3>
      <div className="flex flex-col gap-2">
        {list.map(edo => {
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
        {list.length === 0 && <p className="text-xs text-[#666]">No EDO open.</p>}
      </div>
    </div>
  );

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
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#8888c0] mb-1.5">Solfège</h3>
            <p className="text-xs text-[#888]">
              Always <span className="text-[#cfe6ff] font-semibold">Spectrum-ege</span> — the region-centered syllables from the Solfège chart, used everywhere.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
