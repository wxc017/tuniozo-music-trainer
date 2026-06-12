// ── Modulation & Borrowing ─────────────────────────────────────────
// EDO-general (meantone family).  Chords are shown as traditional ROMAN
// NUMERALS (functional notation); the audio + overlay are realised per-EDO.
// Views: borrowed chords (each a single chord → click to hear progressions
// that use it), modulations, chord ratios, and the full per-EDO scale list.
// Playback uses the .wav sample engine; chords/scales overlay the keyboard.

import { useRef, useState } from "react";
import {
  BORROWINGS, MODULATIONS, CHORD_TYPES, SCALES,
  qualityChord, qualityLimit, chordStepsForEdo, toEdoStep,
  isDiatonicEdo, romanFor, romanDegree, degree, type Limit, type Mode,
} from "@/lib/modulationData";
import { getScalesForEdo, type NamedScale } from "@/lib/commonScales";
import { notationLabel } from "@/lib/notationLabels";
import { formatRomanNumeral } from "@/lib/formatRoman";
import { audioEngine } from "@/lib/audioEngine";

const GLYPH_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Segoe UI Symbol", "Noto Music", "Cambria Math", "Bravura", monospace';
const LIMIT_STYLE: Record<Limit, { bg: string; border: string; color: string; label: string }> = {
  5:  { bg: "#1a1408", border: "#5a4a20", color: "#d4a050", label: "5-limit" },
  7:  { bg: "#081a16", border: "#205a4a", color: "#4ab0a0", label: "7-limit" },
  11: { bg: "#140a1a", border: "#42205a", color: "#9a7ad0", label: "11-limit" },
};
// Meantone family (best fifth in the meantone band) — the EDOs this tab covers.
const MEANTONE_EDOS = [12, 19, 26, 31, 33, 43, 50, 55];
const ROOT_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

interface Props {
  edo: number;
  tonicPc: number;
  onHighlight?: (pcs: number[], holdMs?: number) => void;
  ensureAudio?: () => Promise<void>;
  setEdo?: (e: number) => void;
  setTonicPc?: (pc: number) => void;
  notationSystem?: string;
}

function HalfSharp() {
  return (
    <svg width="0.5em" height="1em" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="1.1"
      style={{ display: "inline-block", verticalAlign: "-0.12em", margin: "0 0.04em" }} aria-label="half sharp">
      <line x1="4" y1="1.5" x2="4" y2="12.5" /><line x1="1" y1="6" x2="7" y2="4.6" /><line x1="1" y1="9.4" x2="7" y2="8" />
    </svg>
  );
}
function HalfFlat() {
  return (
    <svg width="0.46em" height="1em" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="1.1"
      style={{ display: "inline-block", verticalAlign: "-0.12em", margin: "0 0.04em" }} aria-label="half flat">
      <line x1="6" y1="1" x2="6" y2="12.5" /><path d="M6 7 C 2.5 6.6, 1.6 9.4, 3 10.8 C 4.4 12.2, 6 11.4, 6 10" />
    </svg>
  );
}
function withGlyphs(text: string) {
  return text.split(/([\u{1D132}\u{1D133}])/u).map((p, i) =>
    p === "\u{1D132}" ? <HalfSharp key={i} /> : p === "\u{1D133}" ? <HalfFlat key={i} /> : <span key={i}>{p}</span>);
}
function LimitBadge({ limit }: { limit: Limit }) {
  const s = LIMIT_STYLE[limit];
  return <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded border shrink-0"
    style={{ background: s.bg, borderColor: s.border, color: s.color }}>{s.label}</span>;
}

type View = "borrow" | "modulate" | "scales";

export default function ModulationBorrowingTab({ edo, tonicPc, onHighlight, ensureAudio, setEdo, setTonicPc, notationSystem }: Props) {
  const [view, setView] = useState<View>("borrow");
  const [limitFilter, setLimitFilter] = useState<Limit | null>(null);
  const [mode, setMode] = useState<Mode>("major");
  const [expanded, setExpanded] = useState<string | null>(null);
  const show = (l: Limit) => limitFilter === null || limitFilter === l;

  const tonicStep = tonicPc; // tonicPc is a raw EDO step
  const homeTriadRatio = mode === "major" ? "4:5:6" : "10:12:15";

  // One octave below the C4 reference so the tonic sounds in octave 3
  // (pitch 0 = C4) per direct user direction — the chords were too low before.
  const baseStep = tonicStep - 1 * edo;
  const chordAbs = (root31: number, ratio: string): number[] => {
    const r = toEdoStep(root31, edo);
    return chordStepsForEdo(ratio, edo).map(s => baseStep + r + s);
  };
  // Highlight ONLY the pitches actually played (the sounding octave).
  const highlightAbs = (pitches: number[]) => onHighlight?.([...new Set(pitches)], -1);

  // ── Playback (sample engine) — steps the overlay through each chord ──
  const STEP_MS = 1600;
  const hlTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const play = async (frames: number[][]) => {
    await ensureAudio?.();
    audioEngine.playSequence(frames, edo, STEP_MS, 1.5, 0.7);
    hlTimers.current.forEach(clearTimeout); hlTimers.current = [];
    frames.forEach((f, i) => hlTimers.current.push(setTimeout(() => highlightAbs(f), i * STEP_MS)));
  };

  // Roman numeral with proper case: lowercase = minor/diminished, uppercase =
  // major/augmented; quality suffix (°, +, 7, ø7…) appended.  This is our
  // roman-numeral convention for the modulation/borrowing chords.
  const MINOR_Q = new Set(["min", "min7", "min6", "minMaj7", "dim", "hdim7", "sub", "sub7", "utonal7"]);
  const Q_SUFFIX: Record<string, string> = {
    maj: "", min: "", dim: "°", aug: "+", maj7: "maj7", min7: "7", min6: "6", minMaj7: "(maj7)",
    dom7: "7", hdim7: "ø7", sub: "", sub7: "7", sup: "", utonal7: "7",
    neu: "~", neu7: "~7", dom7s11: "7♯11", over11: "9♯11",
  };
  // With a notation system chosen (non-Schulter), show the chord's quality tones
  // (3rd / 7th / altered 5th) in that system's interval symbols instead of the
  // built-in °/+/~/7 suffixes — so the picked system "dictates" the third.
  const useSchu = !notationSystem || notationSystem === "Schulter";
  const qualStack = (quality: string): string => {
    const steps = chordStepsForEdo(qualityChord(quality).ratio, edo);
    const fifth = Math.round((edo * 702) / 1200);
    const seen = new Set<number>(); const out: string[] = [];
    for (const s of steps) { const k = ((s % edo) + edo) % edo; if (k === 0 || k === fifth || seen.has(k)) continue; seen.add(k); out.push(notationLabel(edo, notationSystem, k)); }
    return out.join(" ");
  };
  const romanCased = (root31: number, quality: string): string => {
    const base = romanDegree(root31, mode);
    const r = MINOR_Q.has(quality) ? base.toLowerCase() : base;
    // Space-delimit the quality so formatRomanNumeral superscripts it — the same
    // convention the Chords tab uses (anything after the first space → <sup>).
    const q = useSchu ? (Q_SUFFIX[quality] ?? "") : qualStack(quality);
    return q ? `${r} ${q}` : r;
  };

  // Home diatonic chords by functional slot (per mode) — used to weave real
  // roman-numeral progressions around a borrowed chord.
  const DIATONIC: Record<Mode, Record<string, { root: number; quality: string }>> = {
    major: { I: { root: 0, quality: "maj" }, ii: { root: 5, quality: "min" }, iii: { root: 10, quality: "min" },
             IV: { root: 13, quality: "maj" }, V: { root: 18, quality: "maj" }, vi: { root: 23, quality: "min" } },
    minor: { I: { root: 0, quality: "min" }, ii: { root: 5, quality: "dim" }, iii: { root: 8, quality: "maj" },
             IV: { root: 13, quality: "min" }, V: { root: 18, quality: "maj" }, vi: { root: 21, quality: "maj" } },
  };
  // Ten functional templates that put the borrowed chord (X) in a slot that
  // works — predominant, chromatic colour, or substitute — always cadencing to I.
  const PROG_TEMPLATES: string[][] = [
    ["I", "X", "V", "I"],
    ["I", "IV", "X", "V", "I"],
    ["I", "vi", "X", "V", "I"],
    ["I", "ii", "X", "V", "I"],
    ["vi", "IV", "X", "V", "I"],
    ["I", "X", "IV", "V", "I"],
    ["I", "iii", "X", "V", "I"],
    ["I", "V", "X", "I"],
    ["I", "X", "ii", "V", "I"],
    ["IV", "X", "I", "V", "I"],
  ];
  // Ten roman-numeral progressions that USE the borrowed chord, each playable.
  const borrowProgs = (root31: number, quality: string): { name: string; frames: number[][] }[] => {
    const X = { root: root31, quality };
    return PROG_TEMPLATES.map(tpl => {
      const chords = tpl.map(slot => slot === "X" ? X : DIATONIC[mode][slot]);
      return {
        name: chords.map(c => romanCased(c.root, c.quality)).join(" → "),
        frames: chords.map(c => chordAbs(c.root, qualityChord(c.quality).ratio)),
      };
    });
  };
  const playScale = (steps: number[]) => {
    const abs = steps.map(s => baseStep + s);
    highlightAbs(abs);
    void play(abs.map(p => [p]).concat([[baseStep + edo]]));
  };

  // Ten progressions that ESTABLISH a modulation to `target31`, written in
  // old-key roman numerals (the new-key chords come out chromatic, e.g. a
  // dominant of V reads as "II7").  Each cadences onto the new tonic.
  const modProgs = (t: number): { name: string; frames: number[][] }[] => {
    const hQ = mode === "major" ? "maj" : "min";
    const nI = { root: t % 31, quality: hQ }, nV = { root: (t + 18) % 31, quality: "dom7" };
    const nii = { root: (t + 5) % 31, quality: "min" }, niii = { root: (t + 10) % 31, quality: "min" };
    const nIV = { root: (t + 13) % 31, quality: hQ }, nvi = { root: (t + 23) % 31, quality: "min" };
    const hI = { root: 0, quality: hQ }, hIV = { root: 13, quality: hQ }, hvi = { root: 23, quality: "min" };
    const tpls = [
      [hI, nV, nI], [hI, nii, nV, nI], [hI, nIV, nV, nI], [hI, nvi, nii, nV, nI],
      [hI, nIV, nI, nV, nI], [hI, niii, nvi, nV, nI], [hI, nii, nV, nI, nV, nI],
      [hvi, nV, nI], [hIV, nV, nI], [hI, nV, nI, nIV, nI],
    ];
    return tpls.map(chords => ({
      name: chords.map(c => romanCased(c.root, c.quality)).join(" → "),
      frames: chords.map(c => chordAbs(c.root, qualityChord(c.quality).ratio)),
    }));
  };

  const scaleGroups = (() => {
    const out: { name: string; scales: NamedScale[] }[] = [];
    for (const s of getScalesForEdo(edo)) {
      let g = out.find(x => x.name === s.group);
      if (!g) { g = { name: s.group, scales: [] }; out.push(g); }
      g.scales.push(s);
    }
    return out;
  })();

  const Play = ({ on }: { on: () => void }) => (
    <button onClick={(e) => { e.stopPropagation(); on(); }} title="Play (sample engine) + overlay"
      className="shrink-0 w-5 h-5 rounded text-[10px] leading-none border border-[#2a3a2a] bg-[#10240e] text-[#7aaa7a] hover:text-[#aaffaa] transition-colors">▶</button>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-[#e0a040] mb-1">
          Modulation &amp; Borrowing <span className="text-[#7173e6] text-sm font-semibold align-middle">· {edo}-EDO</span>
        </h2>
      </div>

      {/* EDO picker (meantone family) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-[#888] tracking-wider uppercase w-10 shrink-0">EDO</span>
        {MEANTONE_EDOS.map(e => (
          <button key={e} onClick={() => setEdo?.(e)}
            className={`w-9 py-1 rounded text-[11px] font-medium border transition-colors ${
              edo === e ? "bg-[#7173e6] text-white border-[#7173e6]"
                        : "bg-[#1a1a1a] text-[#aaa] border-[#2a2a2a] hover:text-white hover:border-[#3a3a5a]"}`}>{e}</button>
        ))}
      </div>

      {/* Root note (first 12 notes) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-[#888] tracking-wider uppercase w-10 shrink-0">Root</span>
        {ROOT_NAMES.map((n, i) => (
          <button key={i} onClick={() => setTonicPc?.(i)}
            className={`w-9 py-1 rounded text-[11px] font-medium border transition-colors ${
              tonicPc === i ? "bg-[#7173e6] text-white border-[#7173e6]"
                            : "bg-[#1a1a1a] text-[#aaa] border-[#2a2a2a] hover:text-white hover:border-[#3a3a5a]"}`}>{n}</button>
        ))}
      </div>

      {/* Home key */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[#888] tracking-wider uppercase">Home key</span>
        {(["major", "minor"] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-3 py-1 rounded text-sm font-medium border capitalize transition-colors ${
              mode === m ? "bg-[#7173e618] border-[#7173e6] text-[#9999ee]"
                         : "bg-[#1a1a1a] border-[#2a2a2a] text-[#999] hover:text-[#ccc] hover:border-[#3a3a3a]"}`}>{m}</button>
        ))}
        <span className="text-[10px] text-[#666] ml-2">re-spells romans · hides diatonic chords</span>
      </div>

      {/* View + limit filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          {([["borrow", "Borrowed chords"], ["modulate", "Modulations"], ["scales", "Scales"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setView(id)}
              className={`px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
                view === id ? "bg-[#7173e618] border-[#7173e6] text-[#9999ee]"
                            : "bg-[#1a1a1a] border-[#2a2a2a] text-[#888] hover:text-[#ccc] hover:border-[#3a3a3a]"}`}>{label}</button>
          ))}
        </div>
        {view !== "scales" && (
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[10px] text-[#666] mr-1">filter</span>
            {([null, 5, 7, 11] as const).map(l => (
              <button key={String(l)} onClick={() => setLimitFilter(l)}
                className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                  limitFilter === l ? "bg-[#2a2a2a] border-[#4a4a4a] text-[#eee]"
                                    : "bg-[#141414] border-[#222] text-[#777] hover:text-[#bbb]"}`}>
                {l === null ? "all" : `${l}-lim`}</button>
            ))}
          </div>
        )}
      </div>

      {/* Borrowed chords — one chord per row; click a row to see 10
          progressions (real roman numerals) that make the borrowing work. */}
      {view === "borrow" && (
        <div className="flex flex-col gap-1">
          <Header cols={[["Chord", "w-24"], ["Function / source", "flex-1"]]} />
          {BORROWINGS.filter(b => show(b.limit ?? qualityLimit(b.quality)) && !isDiatonicEdo(b.root, b.quality, mode, edo)).map((b, i) => {
            const lim = b.limit ?? qualityLimit(b.quality);
            const key = `${b.quality}-${b.root}-${i}`;
            const isOpen = expanded === key;
            return (
              <div key={key}>
                <div title={`from ${b.source}`} onClick={() => setExpanded(isOpen ? null : key)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer transition-colors ${
                    isOpen ? "border-[#5a5a8a] bg-[#12121c]" : "border-[#161616] bg-[#0e0e0e] hover:border-[#2a2a3a]"}`}>
                  <span className="w-[60px] shrink-0"><LimitBadge limit={lim} /></span>
                  <Cell w="w-24"><span className="text-sm text-[#e0c070]" style={{ fontFamily: GLYPH_FONT }}>{formatRomanNumeral(romanCased(b.root, b.quality))}</span></Cell>
                  <span className="flex-1 min-w-0 truncate"><span className="text-[11px] text-[#aaa]">{b.use}</span> <span className="text-[10px] text-[#666]">· {b.source}</span></span>
                  <span className="text-[10px] text-[#555] shrink-0 w-24 text-right">{isOpen ? "▾ hide" : "▸ progressions"}</span>
                </div>
                {isOpen && (
                  <div className="ml-[68px] mb-1 mt-0.5 flex flex-wrap gap-1.5 px-2 py-2 rounded bg-[#0a0a14] border border-[#1e1e2a]">
                    {borrowProgs(b.root, b.quality).map((p, pi) => (
                      <button key={pi} onClick={() => { void play(p.frames); }}
                        className="flex items-center gap-1.5 px-2 py-1 text-[11px] rounded border border-[#2a3a2a] bg-[#0e1a0e] text-[#9cc79c] hover:text-[#cfffcf] hover:border-[#3a5a3a] transition-colors">
                        <span className="text-[#6aaa6a]">▶</span><span style={{ fontFamily: GLYPH_FONT }}>{withGlyphs(p.name)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modulations — one target per row; click to see 10 progressions that
          establish the key change. */}
      {view === "modulate" && (
        <div className="flex flex-col gap-1">
          <Header cols={[["New I", "w-16"], ["Modulation", "w-56"], ["Lands in (scales)", "flex-1"]]} />
          {MODULATIONS.filter(m => show(m.limit)).map(m => {
            const key = `mod-${m.target}`;
            const isOpen = expanded === key;
            return (
              <div key={key}>
                <div onClick={() => setExpanded(isOpen ? null : key)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer transition-colors ${
                    isOpen ? "border-[#5a5a8a] bg-[#12121c]" : "border-[#161616] bg-[#0e0e0e] hover:border-[#2a2a3a]"}`}>
                  <span className="w-[60px] shrink-0"><LimitBadge limit={m.limit} /></span>
                  <Cell w="w-16"><span className="text-sm text-[#d4a050]" style={{ fontFamily: GLYPH_FONT }}>{formatRomanNumeral(romanDegree(m.target, mode))}</span></Cell>
                  <Cell w="w-56"><span className="text-[11px] text-[#cbb]">{m.name}</span></Cell>
                  <span className="flex-1 min-w-0 truncate text-[10px] text-[#cbb]">{m.scales.filter(sk => SCALES[sk]).map(sk => SCALES[sk].name).join(" · ")}</span>
                  <span className="text-[10px] text-[#555] shrink-0 w-24 text-right">{isOpen ? "▾ hide" : "▸ progressions"}</span>
                </div>
                {isOpen && (
                  <div className="ml-[68px] mb-1 mt-0.5 flex flex-wrap gap-1.5 px-2 py-2 rounded bg-[#0a0a14] border border-[#1e1e2a]">
                    {modProgs(m.target).map((p, pi) => (
                      <button key={pi} onClick={() => { void play(p.frames); }}
                        className="flex items-center gap-1.5 px-2 py-1 text-[11px] rounded border border-[#2a3a2a] bg-[#0e1a0e] text-[#9cc79c] hover:text-[#cfffcf] hover:border-[#3a5a3a] transition-colors">
                        <span className="text-[#6aaa6a]">▶</span><span style={{ fontFamily: GLYPH_FONT }}>{withGlyphs(p.name)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Scales — the full per-EDO catalog; ▶ plays + overlays */}
      {view === "scales" && (
        <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto">
          {scaleGroups.map(g => (
            <div key={g.name} className="space-y-1">
              <p className="text-[9px] font-bold tracking-widest text-[#7a8a9a] border-b border-[#1a1a1a] pb-0.5">{g.name}</p>
              <div className="flex flex-wrap gap-1">
                {g.scales.map((s, i) => (
                  <button key={s.name + i} onClick={() => playScale(s.steps)}
                    title={`${s.steps.map(st => `${st}\\${edo}`).join(" ")} — play + overlay`}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-[#2a2a2a] bg-[#111] text-[#999] hover:text-[#ddd] hover:border-[#3a4a3a] transition-colors">
                    <span className="text-[#6aaa6a]">▶</span>{s.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Header({ cols }: { cols: [string, string][] }) {
  return (
    <div className="flex items-center gap-2 px-2 pb-1 mb-1 border-b border-[#222]">
      <span className="w-[60px] shrink-0" />
      {cols.map(([label, w], i) => (
        <span key={label + i} className={`${w} min-w-0 text-[9px] uppercase tracking-widest text-[#666]`}>{label}</span>
      ))}
    </div>
  );
}
function Row({ limit, title, children }: { limit: Limit; title?: string; children: React.ReactNode }) {
  return (
    <div title={title} className="flex items-center gap-2 px-2 py-1.5 rounded border border-[#161616] bg-[#0e0e0e]">
      <span className="w-[60px] shrink-0"><LimitBadge limit={limit} /></span>
      {children}
    </div>
  );
}
function Cell({ w, children }: { w: string; children: React.ReactNode }) {
  return <span className={`${w} min-w-0 truncate`}>{children}</span>;
}
