import {
  Renderer, Stave, StaveNote, StaveNoteStruct, Voice, Formatter, Beam,
  Annotation, Barline, Dot, Articulation,
} from "vexflow";
import type { Permutation, PermNoteEntry } from "@/lib/konnakolData";

const SNARE_KEY = "c/5";

const BEAMABLE_DURS = new Set(["8", "16", "32"]);

const DUR_TO_SLOTS: Record<string, number> = {
  "32": 0.5,
  "16": 1,
  "8": 2,
  "q": 4,
  "h": 8,
};

function noteSlotsForEntry(entry: PermNoteEntry): number {
  const base = DUR_TO_SLOTS[entry.dur] ?? 1;
  if (entry.dots) {
    return base * (2 - Math.pow(0.5, entry.dots));
  }
  return base;
}

function totalGroupSlots(notes: PermNoteEntry[]): number {
  return notes.reduce((s, e) => s + noteSlotsForEntry(e), 0);
}

const EXACT_SLOT_TO_DUR: Record<number, { dur: string; dots?: number }> = {
  0.5: { dur: "32" },
  1:   { dur: "16" },
  1.5: { dur: "16", dots: 1 },
  2:   { dur: "8" },
  3:   { dur: "8", dots: 1 },
  4:   { dur: "q" },
  5:   { dur: "q", dots: 1 },
  6:   { dur: "q", dots: 1 },
  7:   { dur: "h", dots: 1 },
  8:   { dur: "h" },
  12:  { dur: "h", dots: 1 },
  16:  { dur: "w" },
};

function slotsToDur(slots: number): { dur: string; dots?: number } {
  const rounded = Math.round(slots * 2) / 2;
  if (EXACT_SLOT_TO_DUR[rounded]) return EXACT_SLOT_TO_DUR[rounded];
  if (slots >= 12) return { dur: "h", dots: 1 };
  if (slots >= 8)  return { dur: "h" };
  if (slots >= 6)  return { dur: "q", dots: 1 };
  if (slots >= 4)  return { dur: "q" };
  if (slots >= 3)  return { dur: "8", dots: 1 };
  if (slots >= 2)  return { dur: "8" };
  if (slots >= 1)  return { dur: "16" };
  return { dur: "32" };
}

export function renderPermutationToVexFlow(
  el: HTMLElement,
  permutation: Permutation,
  width: number,
  height: number,
  _showClef: boolean,
): void {
  el.innerHTML = "";

  try {
    const renderer = new Renderer(el as HTMLDivElement, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const ctx = renderer.getContext();
    ctx.setFont("Arial", 10);

    const staveX = 10;
    const staveH = 40;
    const staveY = Math.max(4, Math.round((height - staveH) / 2) - 10);
    const staveW = width - staveX - 4;

    const stave = new Stave(staveX, staveY, staveW);
    stave.addClef("percussion");
    stave.setEndBarType(Barline.type.END);
    stave.setContext(ctx).draw();

    const allVfNotes: StaveNote[] = [];
    const noteIsBeamable: boolean[] = [];
    const groupSlots: number[] = [];
    let totalSlots = 0;

    for (const grp of permutation) {
      const slots = totalGroupSlots(grp.notes);
      totalSlots += slots;
      groupSlots.push(slots);
      const { dur, dots } = slotsToDur(slots);

      const sn = new StaveNote({
        keys: [SNARE_KEY],
        duration: dur,
        stemDirection: 1,
      } as StaveNoteStruct);

      if (dots) {
        for (let d = 0; d < dots; d++) {
          Dot.buildAndAttach([sn], { all: true });
        }
      }

      try {
        sn.addModifier(new Articulation("a>").setPosition(3));
      } catch { /* ignore */ }

      const firstSyl = grp.notes[0]?.syl ?? "";
      if (firstSyl) {
        try {
          const ann = new Annotation(firstSyl);
          ann.setFont("Arial", 9, "normal");
          ann.setVerticalJustification(Annotation.VerticalJustify.BOTTOM);
          sn.addModifier(ann);
        } catch { /* ignore */ }
      }

      allVfNotes.push(sn);
      noteIsBeamable.push(BEAMABLE_DURS.has(dur));
    }

    if (allVfNotes.length === 0) return;

    const voice = new Voice({ numBeats: totalSlots, beatValue: 16 });
    (voice as unknown as { setMode(m: number): void }).setMode(2);
    voice.addTickables(allVfNotes);

    const fmtW = Math.max(60, staveW - 55);
    new Formatter().joinVoices([voice]).format([voice], fmtW);

    // Reposition each note to its exact proportional slot position in the grid
    const gridStartX = (stave as unknown as { getNoteStartX(): number }).getNoteStartX() + 2;
    const gridEndX = staveX + staveW - 14;
    const gridW = Math.max(10, gridEndX - gridStartX);
    let cumSlots = 0;
    allVfNotes.forEach((vfn, i) => {
      const targetX = gridStartX + (cumSlots / totalSlots) * gridW;
      const formattedX = (vfn as unknown as { getAbsoluteX(): number }).getAbsoluteX();
      (vfn as unknown as { setXShift(n: number): void }).setXShift(targetX - formattedX);
      cumSlots += groupSlots[i];
    });

    const beamsToRender: Beam[] = [];
    let run: StaveNote[] = [];
    for (let i = 0; i < allVfNotes.length; i++) {
      if (noteIsBeamable[i]) {
        run.push(allVfNotes[i]);
      } else {
        if (run.length >= 2) {
          try { beamsToRender.push(new Beam(run)); } catch { /* ignore */ }
        }
        run = [];
      }
    }
    if (run.length >= 2) {
      try { beamsToRender.push(new Beam(run)); } catch { /* ignore */ }
    }

    voice.draw(ctx, stave);
    beamsToRender.forEach(b => b.setContext(ctx).draw());

    const svg = el.querySelector("svg");
    if (svg) (svg as SVGSVGElement).style.filter = "invert(1)";
  } catch (err) {
    console.warn("PermutationRenderer error:", err);
  }
}
