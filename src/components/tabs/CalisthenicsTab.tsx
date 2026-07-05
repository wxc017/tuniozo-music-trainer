import { useMemo, useState } from "react";
import MuscleMap from "@/components/calisthenics/MuscleMap";
import {
  SKILLS, CATEGORY_ORDER, CATEGORY_LABELS, MUSCLE_META, ALL_MUSCLES,
  TIER_LABELS, TIER_COLORS,
  type CaliSkill, type MuscleKey, type SkillCategory,
} from "@/lib/calisthenicsData";

type SortMode = "family" | "muscle";

type Props = { onBack?: () => void };

export default function CalisthenicsTab({ onBack }: Props) {
  const [selectedId, setSelectedId] = useState<string>(SKILLS[0]?.id ?? "");
  const [sortMode, setSortMode] = useState<SortMode>("family");
  const [muscleFilter, setMuscleFilter] = useState<MuscleKey | null>(null);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => SKILLS.find(s => s.id === selectedId) ?? null,
    [selectedId],
  );

  const q = query.trim().toLowerCase();
  const matches = (s: CaliSkill) =>
    (!q || s.name.toLowerCase().includes(q)) &&
    (!muscleFilter || s.muscles.includes(muscleFilter));

  // Group skills for the left list depending on sort mode.
  const familyGroups = useMemo(() =>
    CATEGORY_ORDER.map(cat => ({
      key: cat as string,
      label: CATEGORY_LABELS[cat as SkillCategory],
      skills: SKILLS.filter(s => s.category === cat && matches(s)),
    })).filter(g => g.skills.length > 0),
  [q, muscleFilter]);

  const muscleGroups = useMemo(() =>
    ALL_MUSCLES.map(m => ({
      key: m as string,
      label: MUSCLE_META[m].label,
      skills: SKILLS.filter(s => s.muscles.includes(m) && matches(s)),
    })).filter(g => g.skills.length > 0),
  [q, muscleFilter]);

  const groups = sortMode === "family" ? familyGroups : muscleGroups;

  const pickMuscle = (m: MuscleKey) => {
    setSortMode("muscle");
    setMuscleFilter(prev => (prev === m ? null : m));
  };

  return (
    <div className="h-screen flex flex-col bg-[#0d0d0d] text-white">
      {/* ── Header ── */}
      <div className="border-b border-[#1e1e1e] px-4 py-3 flex items-center gap-3 flex-shrink-0">
        {onBack && (
          <button onClick={onBack}
            className="px-2.5 py-1.5 rounded text-xs font-medium bg-[#161616] text-[#aaa] hover:text-white border border-[#2a2a2a]">
            ← Back
          </button>
        )}
        <h1 className="text-lg font-semibold tracking-tight">Calisthenics</h1>
        <span className="text-xs text-[#666]">Elite Rings & Straight-Arm Skills</span>

        <div className="ml-auto flex items-center gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search skill…"
            className="px-2.5 py-1.5 rounded text-xs bg-[#141414] border border-[#2a2a2a] text-white placeholder-[#555] w-36 focus:outline-none focus:border-[#7173e6]"
          />
          <div className="flex rounded overflow-hidden border border-[#2a2a2a]">
            {(["family", "muscle"] as SortMode[]).map(m => (
              <button key={m}
                onClick={() => { setSortMode(m); if (m === "family") setMuscleFilter(null); }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  sortMode === m ? "bg-[#7173e6] text-white" : "bg-[#141414] text-[#888] hover:text-white"
                }`}>
                {m === "family" ? "By Family" : "By Muscle"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* active muscle filter pill */}
      {muscleFilter && (
        <div className="px-4 py-2 border-b border-[#1e1e1e] flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-[#888]">Filtering by muscle:</span>
          <button onClick={() => setMuscleFilter(null)}
            className="px-2 py-1 rounded text-xs bg-[#7173e6] text-white flex items-center gap-1.5">
            {MUSCLE_META[muscleFilter].label} <span className="opacity-70">✕</span>
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* ── Left: master list ── */}
        <aside className="w-[330px] flex-shrink-0 border-r border-[#1e1e1e] overflow-y-auto">
          {groups.map(g => (
            <div key={g.key}>
              <div className="sticky top-0 bg-[#111] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#7173e6] border-b border-[#1e1e1e] flex justify-between">
                <span>{g.label}</span>
                <span className="text-[#555]">{g.skills.length}</span>
              </div>
              {g.skills.map(s => {
                const on = s.id === selectedId;
                return (
                  <button key={s.id + g.key}
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 border-b border-[#161616] transition-colors ${
                      on ? "bg-[#1c1c2e]" : "hover:bg-[#141414]"
                    }`}>
                    {s.tier && (
                      <span className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: TIER_COLORS[s.tier] }} title={TIER_LABELS[s.tier]} />
                    )}
                    <span className={`text-sm ${on ? "text-white font-medium" : "text-[#ccc]"}`}>{s.name}</span>
                    {s.rating && <span className="ml-auto text-[10px] text-[#666] whitespace-nowrap">{s.rating}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {groups.length === 0 && (
            <div className="p-4 text-sm text-[#666]">No skills match.</div>
          )}
        </aside>

        {/* ── Right: detail + graphic ── */}
        <main className="flex-1 overflow-y-auto p-6">
          {!selected ? (
            <div className="text-[#666] text-sm">Select a skill to see the muscles worked.</div>
          ) : (
            <div className="max-w-3xl mx-auto">
              <div className="flex items-baseline gap-3 flex-wrap">
                <h2 className="text-2xl font-bold">{selected.name}</h2>
                {selected.rating && (
                  <span className="px-2 py-0.5 rounded text-xs bg-[#161616] border border-[#2a2a2a] text-[#aaa]">{selected.rating}</span>
                )}
                {selected.tier && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium text-white"
                    style={{ background: TIER_COLORS[selected.tier] }}>{TIER_LABELS[selected.tier]}</span>
                )}
              </div>
              <div className="text-xs text-[#7173e6] uppercase tracking-wide mt-1">
                {CATEGORY_LABELS[selected.category]}
              </div>
              <p className="text-[#bbb] mt-3 leading-relaxed">{selected.desc}</p>

              <div className="mt-6 grid md:grid-cols-2 gap-6 items-start">
                {/* graphic */}
                <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg p-4">
                  <MuscleMap active={selected.muscles} onMuscleClick={pickMuscle} />
                  <p className="text-[10px] text-[#555] text-center mt-2">Tip: click a highlighted muscle to filter the list</p>
                </div>

                {/* muscles worked */}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-[#888] mb-2">Muscles Worked</div>
                  <div className="flex flex-wrap gap-2">
                    {selected.muscles.map(m => (
                      <button key={m} onClick={() => pickMuscle(m)}
                        className="px-2.5 py-1 rounded text-xs bg-[#1c1c2e] border border-[#7173e6]/40 text-[#cdcdfa] hover:bg-[#26264a]">
                        {MUSCLE_META[m].label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-[#666] mt-4 leading-relaxed">
                    Note: nearly every elite ring skill loads the <span className="text-[#aaa]">biceps tendon</span> —
                    why connective-tissue conditioning matters so much before heavy work.
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
