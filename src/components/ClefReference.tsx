// ── Clef reference overlay ──────────────────────────────────────────────────
// A quick pitch reference: treble + bass staves with every note from C2 to C6
// drawn as a whole note and labelled (C2, D2, …).  Toggled from the editor.

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
    const width = 920, height = 420;
    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const ctx = renderer.getContext();

    const drawStave = (yTop: number, clef: string, keys: string[]) => {
      const stave = new Stave(16, yTop, width - 48);
      stave.addClef(clef);
      stave.setContext(ctx).draw();
      const notes = makeNotes(keys, clef);
      const voice = new Voice({ numBeats: keys.length * 4, beatValue: 4 }).setStrict(false);
      voice.addTickables(notes);
      new Formatter().joinVoices([voice]).format([voice], width - 130);
      voice.draw(ctx, stave);
    };

    drawStave(30, "treble", keysFor(4, 0, 6, 0));   // C4 … C6
    drawStave(230, "bass", keysFor(2, 0, 3, 6));     // C2 … B3
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <div className="max-w-[96vw] max-h-[92vh] overflow-auto bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl shadow-2xl p-5"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-[#cfe6ff]">Clef reference — C2 to C6</h2>
          <button onClick={onClose} className="text-[#999] hover:text-[#cc6666] text-xl leading-none">✕</button>
        </div>
        {/* White staff area so VexFlow's default black notation reads clearly. */}
        <div ref={ref} style={{ background: "#fff", borderRadius: 6, padding: 4 }} />
        <p className="text-[11px] text-[#666] mt-2">Press <span className="font-mono text-[#999]">c</span> or Esc to close.</p>
      </div>
    </div>
  );
}
