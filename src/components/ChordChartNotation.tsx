import { useEffect, useRef } from "react";
import { renderAbc } from "abcjs";

interface Bar {
  timeSig: string;
  beats: number;
  chords: string[];
}

interface Props {
  bars: Bar[];
}

function beatDur(timeSig: string): string {
  const denom = parseInt(timeSig.split("/")[1] ?? "4");
  return denom === 8 ? "B" : "B2";
}

function escChord(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildABC(bars: Bar[]): string {
  if (bars.length === 0) return "";

  let curTs = "4/4";
  for (const b of bars) {
    if (b.timeSig && b.timeSig !== "__custom__") {
      curTs = b.timeSig;
      break;
    }
  }

  let abc = `X:1\nM:${curTs}\nL:1/8\nK:treble\nV:1 style=rhythm\n`;
  let music = "";

  for (let bi = 0; bi < bars.length; bi++) {
    const bar = bars[bi];
    const ts = bar.timeSig && bar.timeSig !== "__custom__" ? bar.timeSig : curTs;

    if (ts !== curTs) {
      music += `[M:${ts}]`;
      curTs = ts;
    }

    const dur = beatDur(curTs);

    for (let beat = 0; beat < bar.beats; beat++) {
      const chord = (bar.chords[beat] ?? "").trim();
      music += chord ? `"${escChord(chord)}"${dur}` : dur;
    }

    music += bi === bars.length - 1 ? "|]" : "|";
  }

  return abc + music;
}

export default function ChordChartNotation({ bars }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || bars.length === 0) return;
    el.innerHTML = "";

    renderAbc(el, buildABC(bars), {
      add_classes: true,
      staffwidth: Math.min((el.parentElement?.clientWidth ?? 700) - 40, 820),
      scale: 1.3,
      paddingbottom: 16,
      paddingtop: 24,
      paddingleft: 20,
      paddingright: 20,
      foregroundColor: "#e8e8e8",
      jazzchords: true,
      format: {
        gchordfont: { face: "Georgia, 'Times New Roman', serif", size: 11, weight: "bold", style: "italic", decoration: "none" },
      },
    });

    // Hide stems and beams — only noteheads needed for rhythm slash notation.
    el.querySelectorAll(".abcjs-stem, .abcjs-beam-elem").forEach((s) => {
      (s as SVGElement).style.display = "none";
    });
  }, [bars]);

  if (bars.length === 0) return null;

  return (
    <div
      style={{
        marginTop: 16,
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid #2a2a2a",
        background: "#121212",
      }}
    >
      <div
        ref={ref}
        style={{ background: "#121212", overflowX: "auto" }}
      />
    </div>
  );
}
