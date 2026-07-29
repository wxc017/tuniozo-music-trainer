import { useMemo, useState } from "react";
import { useWorkoutData } from "@/lib/workoutStore";
import { weeklyVolume, weekRange, GROUP_LABEL, type GroupVolume } from "@/lib/muscleVolume";

// ─────────────────────────────────────────────────────────────────────────
// Week — training volume per muscle group for a Mon–Sun week, split into
// PRIMARY (prime-mover) and SECONDARY (synergist / stabilizer) working sets.
// Each exercise maps to the muscles it trains (curated catalog data + a keyword
// resolver + your own custom-exercise tags) in muscleVolume.
// ─────────────────────────────────────────────────────────────────────────

export default function WeekVolume() {
  const { workouts } = useWorkoutData();
  const [offset, setOffset] = useState(0);

  const range = useMemo(() => weekRange(offset), [offset]);
  const { groups, totalPrimary, totalSecondary, workouts: wk } = useMemo(
    () => weeklyVolume(range.start, range.end),
    [range.start, range.end, workouts],
  );

  const primary = groups.filter(g => g.primarySets > 0).sort((a, b) => b.primarySets - a.primarySets);
  // A group that's a prime mover anywhere this week shows ONLY under Primary — never
  // also under Secondary (e.g. triceps, primary in reverse planche, shouldn't appear
  // in both). Secondary lists groups that were *only ever* synergists this week.
  const secondary = groups.filter(g => g.secondarySets > 0 && g.primarySets === 0).sort((a, b) => b.secondarySets - a.secondarySets);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* week navigator */}
      <div className="wl-card flex items-center gap-2 px-3 py-2.5">
        <button onClick={() => setOffset(o => o - 1)} className="wl-icon-btn px-2" aria-label="Previous week">‹</button>
        <div className="text-center flex-1">
          <div className="wl-h2" style={{ fontSize: 15 }}>{offset === 0 ? "This week" : offset === -1 ? "Last week" : range.label}</div>
          <div className="wl-mono text-[11px] wl-faint">{range.label}</div>
        </div>
        <button onClick={() => setOffset(o => o + 1)} disabled={offset >= 0}
          className="wl-icon-btn px-2" style={{ opacity: offset >= 0 ? .3 : 1 }} aria-label="Next week">›</button>
      </div>

      {/* summary */}
      <div className="flex gap-2">
        <Stat n={totalPrimary} label="primary sets" />
        <Stat n={totalSecondary} label="secondary sets" />
        <Stat n={wk} label={wk === 1 ? "session" : "sessions"} />
      </div>

      {groups.length === 0 ? (
        <div className="wl-card p-6 text-center text-sm wl-muted leading-relaxed">
          No volume logged {offset === 0 ? "this week" : "in this week"} yet.
          <br />Log some sets and they'll break down by muscle here.
        </div>
      ) : (
        <>
          <Section title="Primary muscle volume" hint="prime movers" groups={primary} pick={g => g.primarySets} accent />
          {secondary.length > 0 && (
            <Section title="Secondary muscle volume" hint="synergists & stabilizers" groups={secondary} pick={g => g.secondarySets} />
          )}
        </>
      )}

      <div className="wl-mono text-[10px] wl-faint text-center leading-relaxed px-4">
        A set counts once per muscle group — primary if that group is a prime mover for the movement,
        <br />otherwise secondary. Mapped from the skill catalog and your custom-exercise tags.
      </div>
    </div>
  );
}

function Section({ title, hint, groups, pick, accent }: {
  title: string; hint: string; groups: GroupVolume[];
  pick: (g: GroupVolume) => number; accent?: boolean;
}) {
  const max = groups.reduce((m, g) => Math.max(m, pick(g)), 0) || 1;
  const barColor = accent ? "var(--wl-accent)" : "color-mix(in srgb, var(--wl-accent) 45%, var(--wl-line))";
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2 px-1">
        <span className="wl-eyebrow" style={{ color: accent ? "var(--wl-accent)" : "var(--wl-muted)" }}>{title}</span>
        <span className="wl-mono text-[10px] wl-faint">{hint}</span>
      </div>
      <div className="wl-card">
        {groups.map((g, i) => (
          <div key={g.group} className="px-3.5 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid var(--wl-line)" }}>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium" style={{ color: "var(--wl-text)" }}>{GROUP_LABEL[g.group]}</span>
              <span className="wl-num ml-auto" style={{ fontSize: 20, fontWeight: 700, color: accent ? "var(--wl-accent)" : "var(--wl-text)" }}>{pick(g)}</span>
              <span className="wl-collabel">sets</span>
            </div>
            <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: "var(--wl-surface-2)" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.round((pick(g) / max) * 100)}%`, background: barColor }} />
            </div>
            <div className="wl-mono text-[11px] wl-faint mt-1.5 truncate">
              {g.topExercises.map(e => e.name).join(" · ")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="wl-card flex-1 px-3 py-2.5 text-center">
      <div className="wl-num" style={{ fontSize: 22, fontWeight: 700, color: "var(--wl-text)" }}>{n}</div>
      <div className="wl-collabel mt-0.5">{label}</div>
    </div>
  );
}
