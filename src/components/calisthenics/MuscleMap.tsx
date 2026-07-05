import { useMemo } from "react";
import type { ReactNode } from "react";
import type { MuscleKey } from "@/lib/calisthenicsData";
import { MUSCLE_META } from "@/lib/calisthenicsData";

const BASE = "#26262b";
const ACTIVE = "#7173e6";
const ACTIVE_STROKE = "#a5a6f5";
const BODY = "#1b1b20";
const STROKE = "#3a3a42";

type Props = {
  active: MuscleKey[];
  onMuscleClick?: (m: MuscleKey) => void;
};

export default function MuscleMap({ active, onMuscleClick }: Props) {
  const set = useMemo(() => new Set(active), [active]);

  // A highlightable muscle region. Renders base/active fill + title tooltip.
  const M = (key: MuscleKey, node: (fill: string, stroke: string) => ReactNode) => {
    const on = set.has(key);
    const fill = on ? ACTIVE : BASE;
    const stroke = on ? ACTIVE_STROKE : STROKE;
    return (
      <g
        style={{ cursor: onMuscleClick ? "pointer" : "default", transition: "fill .15s" }}
        onClick={onMuscleClick ? () => onMuscleClick(key) : undefined}
      >
        <title>{MUSCLE_META[key].label}</title>
        {node(fill, stroke)}
      </g>
    );
  };

  return (
    <div className="flex gap-4 justify-center items-start flex-wrap">
      {/* ── FRONT ── */}
      <figure className="flex flex-col items-center gap-1">
        <svg viewBox="0 0 200 450" width="150" height="338" role="img" aria-label="Front muscle map">
          {/* structural body */}
          <g fill={BODY} stroke={STROKE} strokeWidth={1.2}>
            <circle cx="100" cy="34" r="19" />
            <rect x="90" y="50" width="20" height="13" rx="4" />
            <path d="M78 196 h44 v20 q0 8 -8 8 h-28 q-8 0 -8 -8 z" />
            <circle cx="41" cy="250" r="9" />
            <circle cx="159" cy="250" r="9" />
            <rect x="80" y="326" width="17" height="88" rx="8" />
            <rect x="103" y="326" width="17" height="88" rx="8" />
            <ellipse cx="86" cy="424" rx="13" ry="7" />
            <ellipse cx="114" cy="424" rx="13" ry="7" />
          </g>
          {/* muscles */}
          {M("ant_delts", (f, s) => (<><ellipse cx="66" cy="74" rx="17" ry="14" fill={f} stroke={s} /><ellipse cx="134" cy="74" rx="17" ry="14" fill={f} stroke={s} /></>))}
          {M("pecs", (f, s) => (<><ellipse cx="84" cy="99" rx="17" ry="15" fill={f} stroke={s} /><ellipse cx="116" cy="99" rx="17" ry="15" fill={f} stroke={s} /></>))}
          {M("serratus", (f, s) => (<><ellipse cx="73" cy="126" rx="6" ry="10" fill={f} stroke={s} /><ellipse cx="127" cy="126" rx="6" ry="10" fill={f} stroke={s} /></>))}
          {M("biceps", (f, s) => (<><ellipse cx="54" cy="122" rx="11" ry="27" transform="rotate(-12 54 122)" fill={f} stroke={s} /><ellipse cx="146" cy="122" rx="11" ry="27" transform="rotate(12 146 122)" fill={f} stroke={s} /></>))}
          {M("forearms", (f, s) => (<><ellipse cx="45" cy="188" rx="9" ry="32" transform="rotate(-8 45 188)" fill={f} stroke={s} /><ellipse cx="155" cy="188" rx="9" ry="32" transform="rotate(8 155 188)" fill={f} stroke={s} /></>))}
          {M("abs", (f, s) => (<rect x="88" y="112" width="24" height="78" rx="9" fill={f} stroke={s} />))}
          {M("obliques", (f, s) => (<><ellipse cx="79" cy="156" rx="7" ry="23" fill={f} stroke={s} /><ellipse cx="121" cy="156" rx="7" ry="23" fill={f} stroke={s} /></>))}
          {M("hip_flexors", (f, s) => (<><ellipse cx="90" cy="206" rx="8" ry="12" fill={f} stroke={s} /><ellipse cx="110" cy="206" rx="8" ry="12" fill={f} stroke={s} /></>))}
          {M("quads", (f, s) => (<><ellipse cx="88" cy="272" rx="15" ry="48" fill={f} stroke={s} /><ellipse cx="112" cy="272" rx="15" ry="48" fill={f} stroke={s} /></>))}
        </svg>
        <figcaption className="text-[10px] text-[#666] uppercase tracking-wide">Front</figcaption>
      </figure>

      {/* ── BACK ── */}
      <figure className="flex flex-col items-center gap-1">
        <svg viewBox="0 0 200 450" width="150" height="338" role="img" aria-label="Back muscle map">
          <g fill={BODY} stroke={STROKE} strokeWidth={1.2}>
            <circle cx="100" cy="34" r="19" />
            <rect x="90" y="50" width="20" height="13" rx="4" />
            <path d="M78 196 h44 v20 q0 8 -8 8 h-28 q-8 0 -8 -8 z" />
            <circle cx="41" cy="250" r="9" />
            <circle cx="159" cy="250" r="9" />
            <rect x="80" y="326" width="17" height="88" rx="8" />
            <rect x="103" y="326" width="17" height="88" rx="8" />
            <ellipse cx="86" cy="424" rx="13" ry="7" />
            <ellipse cx="114" cy="424" rx="13" ry="7" />
          </g>
          {M("rear_delts", (f, s) => (<><ellipse cx="66" cy="74" rx="17" ry="14" fill={f} stroke={s} /><ellipse cx="134" cy="74" rx="17" ry="14" fill={f} stroke={s} /></>))}
          {M("traps", (f, s) => (<polygon points="100,54 72,82 100,124 128,82" fill={f} stroke={s} />))}
          {M("rhomboids", (f, s) => (<rect x="90" y="96" width="20" height="26" rx="4" fill={f} stroke={s} />))}
          {M("teres", (f, s) => (<><ellipse cx="77" cy="112" rx="7" ry="9" fill={f} stroke={s} /><ellipse cx="123" cy="112" rx="7" ry="9" fill={f} stroke={s} /></>))}
          {M("lats", (f, s) => (<><polygon points="80,108 97,114 99,184 83,186 71,150" fill={f} stroke={s} /><polygon points="120,108 103,114 101,184 117,186 129,150" fill={f} stroke={s} /></>))}
          {M("triceps", (f, s) => (<><ellipse cx="54" cy="122" rx="11" ry="27" transform="rotate(-12 54 122)" fill={f} stroke={s} /><ellipse cx="146" cy="122" rx="11" ry="27" transform="rotate(12 146 122)" fill={f} stroke={s} /></>))}
          {M("forearms", (f, s) => (<><ellipse cx="45" cy="188" rx="9" ry="32" transform="rotate(-8 45 188)" fill={f} stroke={s} /><ellipse cx="155" cy="188" rx="9" ry="32" transform="rotate(8 155 188)" fill={f} stroke={s} /></>))}
          {M("erectors", (f, s) => (<><rect x="90" y="150" width="8" height="44" rx="3" fill={f} stroke={s} /><rect x="102" y="150" width="8" height="44" rx="3" fill={f} stroke={s} /></>))}
          {M("glutes", (f, s) => (<><circle cx="89" cy="210" r="14" fill={f} stroke={s} /><circle cx="111" cy="210" r="14" fill={f} stroke={s} /></>))}
        </svg>
        <figcaption className="text-[10px] text-[#666] uppercase tracking-wide">Back</figcaption>
      </figure>
    </div>
  );
}
