import { lazy, Suspense } from "react";
import { useLS } from "@/lib/storage";

// Lazy-load panels so bundle isn't affected until user visits the tab
const OrbifoldPanel   = lazy(() => import("@/components/mathlab/OrbifoldPanel"));
const ConsonancePanel = lazy(() => import("@/components/mathlab/ConsonancePanel"));
const CPSPanel        = lazy(() => import("@/components/mathlab/CPSPanel"));
const CircleMapPanel  = lazy(() => import("@/components/mathlab/CircleMapPanel"));
const MOSPanel        = lazy(() => import("@/components/mathlab/MOSGeneratorPanel"));

type Tab = "orbifold" | "consonance" | "cps" | "circle-map" | "mos";

const TABS: { key: Tab; label: string; desc: string }[] = [
  { key: "orbifold",      label: "Voice-Leading Orbifold", desc: "Chord space geometry — Tymoczko's T^n/S_n" },
  { key: "consonance",    label: "Consonance Explorer",    desc: "Plomp-Levelt roughness & harmonic entropy" },
  { key: "cps",           label: "CPS Structures",         desc: "Erv Wilson's hexany, dekany, eikosany" },
  { key: "circle-map",    label: "Rhythm Dynamics",        desc: "Circle map, Arnold tongues, entrainment" },
  { key: "mos",           label: "MOS Generator",          desc: "Moment of symmetry scales & generator stacking" },
];

const Spinner = () => (
  <div className="flex-1 flex items-center justify-center text-[#555] text-sm">Loading…</div>
);

export default function MathLab() {
  const [tab, setTab] = useLS<Tab>("lt_mathlab_tab", "orbifold");

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      {/* ── Tab bar ── */}
      <div className="shrink-0 border-b border-[#1a1a1a]">
        <div className="flex items-center gap-1 px-3 py-1.5 overflow-x-auto">
          <span className="text-[10px] text-[#444] font-mono mr-1 shrink-0 select-none">MATH LAB</span>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                tab === t.key
                  ? "bg-[#1a1a2a] text-[#8888dd] border border-[#333]"
                  : "text-[#666] hover:text-[#999] hover:bg-[#151515]"
              }`}
              title={t.desc}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Description line */}
        <div className="px-4 pb-1.5 text-[10px] text-[#444] font-mono">
          {TABS.find(t => t.key === tab)?.desc}
        </div>
      </div>

      {/* ── Panel content ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <Suspense fallback={<Spinner />}>
          {tab === "orbifold"      && <OrbifoldPanel />}
          {tab === "consonance"    && <ConsonancePanel />}
          {tab === "cps"           && <CPSPanel />}
          {tab === "circle-map"    && <CircleMapPanel />}
          {tab === "mos"           && <MOSPanel />}
        </Suspense>
      </div>
    </div>
  );
}
