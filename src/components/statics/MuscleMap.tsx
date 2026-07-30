import { useMemo } from "react";
import Model, { type IExerciseData, type IMuscleStats, type Muscle } from "react-body-highlighter";
import type { MuscleKey } from "@/lib/staticsData";
import { MUSCLE_META, ALL_MUSCLES } from "@/lib/staticsData";

const ACCENT = "#7173e6";
const BODY = "#2c2c33";

type Props = {
  active: MuscleKey[];
  onMuscleClick?: (m: MuscleKey) => void;
};

// Front/back anatomy using the react-body-highlighter package (no hand-drawn SVG).
export default function MuscleMap({ active, onMuscleClick }: Props) {
  const data: IExerciseData[] = useMemo(() => {
    const pkg = active.flatMap(k => MUSCLE_META[k].pkg);
    const muscles = Array.from(new Set(pkg)) as Muscle[];
    return [{ name: "Selected skill", muscles }];
  }, [active]);

  // Map a clicked package region back to one of our muscle keys (prefer an
  // already-active one, since several of our muscles share a package region).
  const handleClick = ({ muscle }: IMuscleStats) => {
    if (!onMuscleClick) return;
    const candidates = ALL_MUSCLES.filter(k => MUSCLE_META[k].pkg.includes(muscle));
    const pick = candidates.find(k => active.includes(k)) ?? candidates[0];
    if (pick) onMuscleClick(pick);
  };

  return (
    <div className="flex gap-3 justify-center items-start flex-wrap">
      <figure className="flex flex-col items-center gap-1 m-0">
        <Model
          data={data}
          type="anterior"
          onClick={handleClick}
          bodyColor={BODY}
          highlightedColors={[ACCENT]}
          style={{ width: "9rem" }}
        />
        <figcaption className="text-[10px] text-[#666] uppercase tracking-wide">Front</figcaption>
      </figure>
      <figure className="flex flex-col items-center gap-1 m-0">
        <Model
          data={data}
          type="posterior"
          onClick={handleClick}
          bodyColor={BODY}
          highlightedColors={[ACCENT]}
          style={{ width: "9rem" }}
        />
        <figcaption className="text-[10px] text-[#666] uppercase tracking-wide">Back</figcaption>
      </figure>
    </div>
  );
}
