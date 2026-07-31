import { useMemo, useState } from "react";
import MuscleMap from "@/components/statics/MuscleMap";
import { getPose, getAnimation } from "@/lib/staticsPoses";
import { chainRenders, POSITION_NOTE, POSITION_CUES } from "@/lib/staticsRenders";
import GymnastPose3D from "@/components/statics/GymnastPose3D";
import {
  SKILLS, CATEGORY_ORDER, CATEGORY_LABELS, MUSCLE_META, ALL_MUSCLES,
  TIER_COLORS,
  type StaticSkill, type MuscleKey, type SkillCategory,
} from "@/lib/staticsData";

type SortMode = "family" | "muscle";

export default function StaticsTab() {
  const [selectedId, setSelectedId] = useState<string>(SKILLS[0]?.id ?? "");
  const [sortMode, setSortMode] = useState<SortMode>("family");
  const [muscleFilter, setMuscleFilter] = useState<MuscleKey | null>(null);
  const [query, setQuery] = useState("");
  // which position of a transition's chain is on screen; reset when the skill does
  const [step, setStep] = useState(0);

  const selected = useMemo(
    () => SKILLS.find(s => s.id === selectedId) ?? null,
    [selectedId],
  );

  const q = query.trim().toLowerCase();
  const matches = (s: StaticSkill) =>
    (!q || s.name.toLowerCase().includes(q)) &&
    (!muscleFilter || s.muscles.includes(muscleFilter));

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
      label: MUSCLE_META[m].simple,
      skills: SKILLS.filter(s => s.muscles.includes(m) && matches(s)),
    })).filter(g => g.skills.length > 0),
  [q, muscleFilter]);

  const groups = sortMode === "family" ? familyGroups : muscleGroups;

  const pickMuscle = (m: MuscleKey) => {
    setSortMode("muscle");
    setMuscleFilter(prev => (prev === m ? null : m));
  };

  return (
    <div className="h-full flex bg-[#0d0d0d] text-white min-h-0">
      {/* ── Left: controls + master list ── */}
      <aside className="w-[340px] flex-shrink-0 border-r border-[#1e1e1e] flex flex-col min-h-0">
        {/* controls sit ABOVE the master list */}
        <div className="p-2.5 border-b border-[#1e1e1e] flex flex-col gap-2 flex-shrink-0">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search skill…"
            className="px-2.5 py-1.5 rounded text-xs bg-[#141414] border border-[#2a2a2a] text-white placeholder-[#555] focus:outline-none focus:border-[#7173e6]"
          />
          <div className="flex rounded overflow-hidden border border-[#2a2a2a]">
            {(["family", "muscle"] as SortMode[]).map(m => (
              <button key={m}
                onClick={() => { setSortMode(m); if (m === "family") setMuscleFilter(null); }}
                className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                  sortMode === m ? "bg-[#7173e6] text-white" : "bg-[#141414] text-[#888] hover:text-white"
                }`}>
                {m === "family" ? "By Family" : "By Muscle"}
              </button>
            ))}
          </div>
          {muscleFilter && (
            <button onClick={() => setMuscleFilter(null)}
              className="self-start px-2 py-1 rounded text-xs bg-[#7173e6] text-white flex items-center gap-1.5">
              {MUSCLE_META[muscleFilter].simple} <span className="opacity-70">✕</span>
            </button>
          )}
        </div>

        {/* master list */}
        <div className="flex-1 overflow-y-auto min-h-0">
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
                    onClick={() => { setSelectedId(s.id); setStep(0); }}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 border-b border-[#161616] transition-colors ${
                      on ? "bg-[#1c1c2e]" : "hover:bg-[#141414]"
                    }`}>
                    {s.tier && (
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TIER_COLORS[s.tier] }} />
                    )}
                    <span className={`text-sm ${on ? "text-white font-medium" : "text-[#ccc]"}`}>{s.name}</span>
                    {s.rating && <span className="ml-auto text-[10px] text-[#666] whitespace-nowrap">{s.rating}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {groups.length === 0 && <div className="p-4 text-sm text-[#666]">No skills match.</div>}
        </div>
      </aside>

      {/* ── Right: detail + graphic ── */}
      <main className="flex-1 overflow-y-auto p-6 min-h-0">
        {!selected ? (
          <div className="text-[#666] text-sm">Select a skill to see the muscles worked.</div>
        ) : (
          <div className="max-w-6xl">
            <h2 className="text-2xl font-bold">{selected.name}</h2>
            <div className="text-xs text-[#7173e6] uppercase tracking-wide mt-1">
              {CATEGORY_LABELS[selected.category]}
            </div>
            <p className="text-[#bbb] mt-3 leading-relaxed">{selected.desc}</p>

            {/* Position chain — what you actually have to hold on the way through.
                A single-entry chain is a pure hold, so there's nothing to show. */}
            {selected.chain && selected.chain.length > 1 && (
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                {selected.chain.map((step, i) => (
                  <span key={i} className="flex items-center gap-2">
                    {i > 0 && <span className="text-[#555] text-sm">→</span>}
                    <span
                      title={step.via ? "Passed through, not held" : "Held position"}
                      className={`text-[13px] px-2.5 py-1 rounded-md border ${
                        step.via
                          ? "border-dashed border-[#3a3a3a] text-[#8a8a8a] bg-transparent italic"
                          : "border-[#2e2e46] text-[#dcdcdc] bg-[#16162a]"
                      }`}>
                      {step.pos}
                    </span>
                  </span>
                ))}
                <span className="text-[10px] text-[#555] ml-1">dashed = passed through</span>
              </div>
            )}

            <div className="mt-6 grid xl:grid-cols-2 gap-8 items-start">
            {/* ── Section 1: Muscle map ── */}
            <section>
              <div className="text-xs font-semibold uppercase tracking-wide text-[#7173e6] mb-3 border-b border-[#1e1e1e] pb-1.5">
                Muscle Map
              </div>
              <div className="flex flex-col gap-6 items-start">
                <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg p-4 w-fit">
                  <MuscleMap active={selected.muscles} onMuscleClick={pickMuscle} />
                </div>

                <div className="max-w-[21rem]">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[#888] mb-2">Muscles Worked</div>
                  <div className="flex flex-wrap gap-2">
                    {selected.muscles.map(m => (
                      <button key={m} onClick={() => pickMuscle(m)}
                        className="px-2.5 py-1 rounded text-xs bg-[#1c1c2e] border border-[#7173e6]/40 text-[#cdcdfa] hover:bg-[#26264a] flex items-baseline gap-1.5">
                        <span className="font-medium">{MUSCLE_META[m].simple}</span>
                        <span className="text-[10px] text-[#8a8ad0]">{MUSCLE_META[m].label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* ── Section 2: rendered positions ── */}
            {(() => {
              const anim = getAnimation(selected.id, selected.name, selected.category);
              const frames = anim ?? [getPose(selected.id, selected.name, selected.category)];
              const cuePose = frames[frames.length - 1];
              const steps = chainRenders(selected.chain);
              const idx = Math.min(step, Math.max(0, steps.length - 1));
              const shown = steps[idx];
              return (
                <section>
                  <div className="text-xs font-semibold uppercase tracking-wide text-[#7173e6] mb-3 border-b border-[#1e1e1e] pb-1.5 flex items-center gap-2">
                    Position
                    {steps.length > 1
                      ? <span className="text-[10px] normal-case font-normal text-[#c98a2b]">
                          {steps.length}-position sequence
                        </span>
                      : <span className="text-[10px] normal-case font-normal text-[#3b8f5a]">Static hold</span>}
                  </div>

                  <div className="flex flex-col gap-4">
                    {shown ? (
                      <>
                        <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg p-3">
                          <div className="max-w-[30rem] mx-auto">
                            <GymnastPose3D key={shown.key} poseKey={shown.key} />
                          </div>
                          <div className="mt-2 text-center">
                            <div className="text-sm text-white capitalize">
                              {shown.pos}
                              {shown.via && (
                                <span className="ml-2 text-[10px] uppercase tracking-wide text-[#8a8a8a] italic">
                                  passed through
                                </span>
                              )}
                            </div>
                            {POSITION_NOTE[shown.key] && (
                              <p className="text-xs text-[#999] mt-1 leading-relaxed max-w-[28rem] mx-auto">
                                {POSITION_NOTE[shown.key]}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* thumbnails: step through the positions of a transition */}
                        {steps.length > 1 && (
                          <div className="flex items-center gap-1.5 flex-wrap justify-center">
                            {steps.map((s, i) => (
                              <span key={s.key + i} className="flex items-center gap-1.5">
                                {i > 0 && <span className="text-[#555] text-sm">→</span>}
                                <button
                                  onClick={() => setStep(i)}
                                  title={s.pos}
                                  className={`rounded-md border p-0.5 transition-colors ${
                                    i === idx
                                      ? "border-[#7173e6] bg-[#16162a]"
                                      : s.via
                                        ? "border-dashed border-[#3a3a3a] hover:border-[#555]"
                                        : "border-[#2a2a2a] hover:border-[#555]"
                                  }`}>
                                  <img src={s.src} alt={s.pos} width={64} height={64}
                                       loading="lazy" className="w-16 h-16 block" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg p-6 text-sm text-[#666]">
                        No render for this position yet.
                      </div>
                    )}

                    {/* Cues for the POSITION on screen where we have them —
                        these are the same numbers that drive the shoulder
                        girdle and forearm rotation in the render, so the text
                        and the picture cannot disagree. */}
                    <div className="grid sm:grid-cols-3 gap-3">
                      <Cue label="Scapular position"
                           text={(shown && POSITION_CUES[shown.key]?.scapula) || cuePose.cue.scapula} />
                      <Cue label="Grip / ring placement"
                           text={(shown && POSITION_CUES[shown.key]?.grip) || cuePose.cue.grip} />
                      <Cue label="Body line" text={cuePose.cue.line} />
                    </div>
                  </div>
                </section>
              );
            })()}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Cue({ label, text }: { label: string; text: string }) {
  return (
    <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-lg p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8a8ad0] mb-1">{label}</div>
      <div className="text-xs text-[#bbb] leading-relaxed">{text}</div>
    </div>
  );
}
