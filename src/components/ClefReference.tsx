// ── Clef reference panel ────────────────────────────────────────────────────
// A quick pitch reference: treble + bass staves with every note from C2 to C6
// drawn as a whole note and labelled, plus three empty ledger lines above and
// below each staff for orientation.  Non-modal — pinned top-right, it stays
// visible while you keep inputting (only the panel takes clicks).

import { useEffect, useRef } from "react";
import { Renderer, Stave, StaveNote, Voice, Formatter, Annotation } from "vexflow";

const LETTERS = ["c", "d", "e", "f", "g", "a", "b"];

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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = "";
    const width = 860, height = 320;
    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const ctx = renderer.getContext();

    const drawStave = (yTop: number, clef: string, keys: string[]) => {
      const stave = new Stave(14, yTop, width - 40);
      stave.addClef(clef);
      stave.setContext(ctx).draw();
      // Three empty ledger lines above (lines −1…−3) and below (lines 5…7).
      const x1 = stave.getX() + 8, x2 = stave.getX() + stave.getWidth() - 8;
      ctx.save();
      ctx.setStrokeStyle("#b8b8b8");
      ctx.setLineWidth(1);
      for (const line of [-3, -2, -1, 5, 6, 7]) {
        const y = stave.getYForLine(line);
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
      }
      ctx.restore();
      const notes = makeNotes(keys, clef);
      const voice = new Voice({ numBeats: keys.length * 4, beatValue: 4 }).setStrict(false);
      voice.addTickables(notes);
      new Formatter().joinVoices([voice]).format([voice], width - 120);
      voice.draw(ctx, stave);
    };

    drawStave(80, "treble", keysFor(4, 0, 6, 0));   // C4 … C6
    drawStave(210, "bass", keysFor(2, 0, 3, 6));     // C2 … B3
  }, []);

  return (
    <div className="fixed top-3 right-3 z-[60] max-w-[92vw] pointer-events-auto bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl shadow-2xl px-3 pt-2 pb-3">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xs font-bold text-[#cfe6ff]">Clef reference — C2 to C6</h2>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[#666]"><span className="font-mono text-[#999]">c</span> / Esc to close</span>
          <button onClick={onClose} className="text-[#999] hover:text-[#cc6666] text-lg leading-none">✕</button>
        </div>
      </div>
      {/* White staff area so VexFlow's default black notation reads clearly. */}
      <div className="overflow-x-auto" style={{ maxWidth: "88vw" }}>
        <div ref={ref} style={{ background: "#fff", borderRadius: 6, padding: 4, overflow: "visible" }} />
      </div>
    </div>
  );
}
