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
    const width = 1020, height = 300;
    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const ctx = renderer.getContext();

    const drawStave = (yTop: number, clef: string, keys: string[]) => {
      // spaceAbove/BelowStaffLn = 0 removes VexFlow's default reserved text
      // margin above/below the staff (that was the ~inch of empty space).
      const stave = new Stave(12, yTop, width - 30, { spaceAboveStaffLn: 0, spaceBelowStaffLn: 0 });
      stave.addClef(clef);
      stave.setContext(ctx).draw();
      const notes = makeNotes(keys, clef);
      const voice = new Voice({ numBeats: keys.length * 4, beatValue: 4 }).setStrict(false);
      voice.addTickables(notes);
      // VexFlow draws the correct short ledger lines under each note automatically.
      new Formatter().joinVoices([voice]).format([voice], width - 110);
      voice.draw(ctx, stave);
    };

    // With the reserved margin gone, place the top staff so E6 (3 ledgers up) sits
    // near the top; the bass follows with room for A1 (3 ledgers down).
    drawStave(48, "treble", keysFor(3, 3, 6, 2));   // F3 … E6 (3 ledgers each way)
    drawStave(198, "bass", keysFor(1, 5, 4, 4));    // A1 … G4 (3 ledgers each way)
  }, []);

  return (
    <div className="fixed top-3 right-3 z-[60] max-w-[94vw] max-h-[92vh] overflow-y-auto pointer-events-auto bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl shadow-2xl px-3 pt-1.5 pb-2">
      <div className="flex items-center justify-between mb-0.5">
        <h2 className="text-xs font-bold text-[#cfe6ff]">Clef reference — treble &amp; bass</h2>
        <div className="flex items-center gap-3">
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
