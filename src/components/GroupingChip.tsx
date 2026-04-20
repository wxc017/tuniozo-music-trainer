import { useEffect, useRef, memo } from "react";
import {
  Renderer, Stave, StaveNote, StaveNoteStruct, Voice, Formatter, Beam,
  Annotation, Articulation, Tuplet, Barline, Dot,
} from "vexflow";
import type { GroupingDef, SubGrouping, SubdivisionN } from "@/lib/konnakolData";

const SNARE_KEY = "c/5";

type NoteEntry = { dur: string; dots?: number; syl: string };

const PATTERN_NOTES_4: Record<string, NoteEntry[]> = {
  "ta":                      [{ dur: "16", syl: "ta" }],
  "ta ke":                   [{ dur: "16", syl: "ta" }, { dur: "16", syl: "ke" }],
  "ta dim":                  [{ dur: "16", dots: 1, syl: "ta" }, { dur: "32", syl: "dim" }],
  "ta ki te":                [{ dur: "16", syl: "ta" }, { dur: "16", syl: "ki" }, { dur: "16", syl: "te" }],
  "ta ke dim":               [{ dur: "8",  syl: "ta ke" }, { dur: "16", syl: "dim" }],
  "ta dim ke":               [{ dur: "16", dots: 1, syl: "ta" }, { dur: "32", syl: "dim" }, { dur: "16", syl: "ke" }],
  "ta ke di mi":             [{ dur: "16", syl: "ta" }, { dur: "16", syl: "ke" }, { dur: "16", syl: "di" }, { dur: "16", syl: "mi" }],
  "ta ki te dim":            [{ dur: "8",  dots: 1, syl: "ta ki te" }, { dur: "16", syl: "dim" }],
  "ta ke dim ke":            [{ dur: "8",  syl: "ta ke" }, { dur: "16", dots: 1, syl: "dim" }, { dur: "32", syl: "ke" }],
  "ta ke ja nu":             [{ dur: "8",  syl: "ta ke" }, { dur: "8",  syl: "ja nu" }],
  "ta di ghi na ton":        [{ dur: "16", syl: "ta" }, { dur: "16", syl: "di" }, { dur: "16", syl: "ghi" }, { dur: "16", syl: "na" }, { dur: "16", syl: "ton" }],
  "ta ke di mi ta ke":       [{ dur: "16", syl: "ta" }, { dur: "16", syl: "ke" }, { dur: "16", syl: "di" }, { dur: "16", syl: "mi" }, { dur: "16", syl: "ta" }, { dur: "16", syl: "ke" }],
  "ta ke ta di ghi na ton":  [{ dur: "16", syl: "ta" }, { dur: "16", syl: "ke" }, { dur: "16", syl: "ta" }, { dur: "16", syl: "di" }, { dur: "16", syl: "ghi" }, { dur: "16", syl: "na" }, { dur: "16", syl: "ton" }],
  "ta ke di mi ta ke ja nu": [{ dur: "16", syl: "ta" }, { dur: "16", syl: "ke" }, { dur: "16", syl: "di" }, { dur: "16", syl: "mi" }, { dur: "8",  syl: "ta ke" }, { dur: "8",  syl: "ja nu" }],
};

const BASE_DUR: Record<SubdivisionN, string> = {
  3: "8",
  4: "16",
  5: "16",
  6: "8",
  7: "8",
  8: "32",
};

function notesForSubdiv(def: GroupingDef, subdiv: SubdivisionN): NoteEntry[] {
  if (subdiv === 4 && PATTERN_NOTES_4[def.label]) return PATTERN_NOTES_4[def.label];
  const dur = BASE_DUR[subdiv];
  return def.syllables.map(s => ({ dur, syl: s }));
}

function notesForSubGroups(def: GroupingDef, subdiv: SubdivisionN): NoteEntry[] {
  const dur = BASE_DUR[subdiv] ?? "16";
  return def.syllables.map(s => ({ dur, syl: s }));
}

function tupletNum(subdiv: SubdivisionN, noteCount: number): number | null {
  if (subdiv === 3 && noteCount >= 2) return 3;
  if (subdiv === 5 && noteCount >= 2) return 5;
  if (subdiv === 6 && noteCount >= 2) return 6;
  if (subdiv === 7 && noteCount >= 2) return 7;
  return null;
}

interface Props {
  groupingDef: GroupingDef;
  subdivision: SubdivisionN;
  subGroups?: SubGrouping;
}

const NOTE_W = 30;
const CHIP_H = 86;

export const GroupingChip = memo(function GroupingChip({ groupingDef, subdivision, subGroups }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = "";

    try {
      const useSubGroups = subGroups && subGroups.length > 1;
      const entries = useSubGroups
        ? notesForSubGroups(groupingDef, subdivision)
        : notesForSubdiv(groupingDef, subdivision);
      const noteCount = entries.length;
      const W = Math.max(80, noteCount * NOTE_W + 30);

      const renderer = new Renderer(el, Renderer.Backends.SVG);
      renderer.resize(W, CHIP_H);
      const ctx = renderer.getContext();
      ctx.setFont("Arial", 8);

      const stave = new Stave(4, 2, W - 8);
      stave.setBegBarType(Barline.type.NONE);
      stave.setEndBarType(Barline.type.NONE);
      stave.setContext(ctx).draw();

      const vfNotes: StaveNote[] = [];
      for (const entry of entries) {
        const sn = new StaveNote({
          keys: [SNARE_KEY],
          duration: entry.dur,
          stemDirection: 1,
        } as StaveNoteStruct);
        if (entry.dots) {
          for (let d = 0; d < entry.dots; d++) Dot.buildAndAttach([sn], { all: true });
        }
        try {
          const ann = new Annotation(entry.syl);
          ann.setFont("Arial", 7, "normal");
          ann.setVerticalJustification(Annotation.VerticalJustify.BOTTOM);
          sn.addModifier(ann);
        } catch { /* ignore */ }
        vfNotes.push(sn);
      }

      if (useSubGroups && subGroups) {
        let noteIdx = 0;
        for (const sz of subGroups) {
          if (noteIdx < vfNotes.length) {
            try {
              vfNotes[noteIdx].addModifier(
                new Articulation("a>").setPosition(3),
              );
            } catch { /* ignore */ }
          }
          noteIdx += sz;
        }
      }

      const voice = new Voice({ numBeats: noteCount, beatValue: 4 });
      (voice as unknown as { setMode(m: number): void }).setMode(2);
      voice.addTickables(vfNotes);

      new Formatter().joinVoices([voice]).format([voice], W - 12);
      voice.draw(ctx, stave);

      if (useSubGroups && subGroups) {
        let noteIdx = 0;
        for (const sz of subGroups) {
          const sub = vfNotes.slice(noteIdx, noteIdx + sz);
          if (sub.length >= 2) {
            try { new Beam(sub).setContext(ctx).draw(); } catch { /* ignore */ }
          }
          noteIdx += sz;
        }

        const tn = tupletNum(subdivision, noteCount);
        if (tn && noteCount >= 2) {
          try {
            new Tuplet(vfNotes, {
              numNotes: noteCount,
              notesOccupied: noteCount,
              ratioed: false,
              bracketed: true,
              location: 1,
            }).setContext(ctx).draw();
          } catch { /* ignore */ }
        }
      } else {
        const nonRests = vfNotes.filter(n => !n.isRest());
        const beams = Beam.generateBeams(nonRests, { maintainStemDirections: true });
        beams.forEach(b => b.setContext(ctx).draw());

        const tn = tupletNum(subdivision, vfNotes.length);
        if (tn && vfNotes.length >= 2) {
          try {
            new Tuplet(vfNotes, {
              numNotes: vfNotes.length,
              notesOccupied: vfNotes.length,
              ratioed: false,
              bracketed: true,
              location: 1,
            }).setContext(ctx).draw();
          } catch { /* ignore */ }
        }
      }

      const svg = el.querySelector("svg");
      if (svg) (svg as SVGSVGElement).style.filter = "invert(1)";
    } catch (err) {
      console.warn("GroupingChip render error:", err);
    }
  }, [groupingDef, subdivision, subGroups]);

  const entries = subGroups && subGroups.length > 1
    ? notesForSubGroups(groupingDef, subdivision)
    : notesForSubdiv(groupingDef, subdivision);
  const W = Math.max(80, entries.length * NOTE_W + 30);
  return <div ref={ref} style={{ width: W, height: CHIP_H, flexShrink: 0 }} />;
});
