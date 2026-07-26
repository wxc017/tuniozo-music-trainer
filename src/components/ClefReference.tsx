// ── Clef reference panel ────────────────────────────────────────────────────
// A quick pitch reference: treble + bass staves with every note from C2 to C6
// drawn as a whole note and labelled, plus three empty ledger lines above and
// below each staff for orientation.  Non-modal — pinned top-right, it stays
// visible while you keep inputting (only the panel takes clicks).
//
// Octave bands: type a root note (e.g. D) and see-through boxes mark each
// octave register relative to it, labelled by jianpu octave dots — D3–D4 = 0
// (middle), D2–D3 = −1, D4–D5 = +1, etc. Each clef shows the octaves it covers.

import { useEffect, useRef, useState } from "react";
import { Renderer, Stave, StaveNote, Voice, Formatter, Annotation } from "vexflow";

const LETTERS = ["c", "d", "e", "f", "g", "a", "b"];
const SVGNS = "http://www.w3.org/2000/svg";

/** Inclusive list of "letter/octave" keys from one pitch up to another. */
function keysFor(fromOct: number, fromIdx: number, toOct: number, toIdx: number): string[] {
  const out: string[] = [];
  let o = fromOct, i = fromIdx;
  while (o < toOct || (o === toOct && i <= toIdx)) {
    out.push(`${LETTERS[i]}/${o}`);
    if (++i >= LETTERS.length) { i = 0; o++; }
  }
  return out;
}

function makeNotes(keys: string[], clef: string): StaveNote[] {
  return keys.map(k => {
    const [letter, oct] = k.split("/");
    const n = new StaveNote({ keys: [k], duration: "w", clef });
    const a = new Annotation(`${letter.toUpperCase()}${oct}`);
    a.setVerticalJustification(Annotation.VerticalJustify.BOTTOM);
    n.addModifier(a, 0);
    return n;
  });
}

export default function ClefReference({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [root, setRoot] = useState("");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = "";
    const width = 1020, height = 300;
    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const ctx = renderer.getContext();

    // Draw a staff and return the y of each drawn note-head, keyed by "d/4".
    const drawStave = (yTop: number, clef: string, keys: string[]) => {
      const stave = new Stave(12, yTop, width - 30, { spaceAboveStaffLn: 0, spaceBelowStaffLn: 0 });
      stave.addClef(clef);
      stave.setContext(ctx).draw();
      const notes = makeNotes(keys, clef);
      const voice = new Voice({ numBeats: keys.length * 4, beatValue: 4 }).setStrict(false);
      voice.addTickables(notes);
      new Formatter().joinVoices([voice]).format([voice], width - 110);
      voice.draw(ctx, stave);
      const keyY: Record<string, number> = {};
      notes.forEach((n, i) => { try { keyY[keys[i]] = n.getYs()[0]; } catch { /* not drawn */ } });
      return { stave, keyY };
    };

    const treble = drawStave(48, "treble", keysFor(3, 3, 6, 2));   // F3 … E6
    const bass = drawStave(198, "bass", keysFor(1, 5, 4, 4));      // A1 … G4

    // ── Octave bands for the chosen root ────────────────────────────────
    const rl = root.trim()[0]?.toLowerCase();
    if (rl && LETTERS.includes(rl)) {
      const svg = el.querySelector("svg");
      if (svg) {
        const band = (stave: Stave, keyY: Record<string, number>) => {
          const x0 = stave.getNoteStartX();
          const x1 = stave.getX() + stave.getWidth() - 6;
          // A band spans root/o (bottom) → root/(o+1) (top); label = o − 3 so
          // that root3–root4 = 0 (the middle jianpu register).
          for (let o = 0; o <= 7; o++) {
            const yb = keyY[`${rl}/${o}`];
            const yt = keyY[`${rl}/${o + 1}`];
            if (yb == null || yt == null) continue;
            const label = o - 3;
            const rect = document.createElementNS(SVGNS, "rect");
            rect.setAttribute("x", String(x0));
            rect.setAttribute("y", String(yt));
            rect.setAttribute("width", String(x1 - x0));
            rect.setAttribute("height", String(yb - yt));
            rect.setAttribute("fill", "rgba(113,115,230,0.14)");
            rect.setAttribute("stroke", "rgba(113,115,230,0.6)");
            rect.setAttribute("stroke-width", "1");
            rect.setAttribute("rx", "4");
            svg.insertBefore(rect, svg.firstChild);   // behind the notes
            const txt = document.createElementNS(SVGNS, "text");
            txt.setAttribute("x", String(x0 + 6));
            txt.setAttribute("y", String((yt + yb) / 2 + 5));
            txt.setAttribute("fill", "#5457c8");
            txt.setAttribute("font-size", "16");
            txt.setAttribute("font-weight", "bold");
            txt.textContent = label > 0 ? `+${label}` : String(label);
            svg.appendChild(txt);
          }
        };
        band(treble.stave, treble.keyY);
        band(bass.stave, bass.keyY);
      }
    }
  }, [root]);

  return (
    <div className="fixed top-3 right-3 z-[60] max-w-[94vw] max-h-[92vh] overflow-y-auto pointer-events-auto bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl shadow-2xl px-3 pt-1.5 pb-2">
      <div className="flex items-center justify-between mb-0.5 gap-3">
        <h2 className="text-xs font-bold text-[#cfe6ff]">Clef reference — treble &amp; bass</h2>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-[#888] flex items-center gap-1">
            root
            <input
              value={root}
              onChange={e => setRoot(e.target.value.replace(/[^A-Ga-g#b]/g, "").slice(0, 2))}
              placeholder="C"
              className="w-9 bg-[#161616] border border-[#2a2a2a] rounded px-1.5 py-0.5 text-xs text-white uppercase outline-none focus:border-[#7173e6]"
            />
          </label>
          <span className="text-[10px] text-[#666]"><span className="font-mono text-[#999]">c</span> / Esc to close</span>
          <button onClick={onClose} className="text-[#999] hover:text-[#cc6666] text-lg leading-none">✕</button>
        </div>
      </div>
      {/* White staff area so VexFlow's default black notation reads clearly. */}
      <div className="overflow-x-auto" style={{ maxWidth: "88vw" }}>
        <div ref={ref} style={{ background: "#fff", borderRadius: 6, padding: 0, overflow: "visible" }} />
      </div>
    </div>
  );
}
