// ── UncommonMetersPanel: game mode for exploring uncommon meters ──

import { useState, useCallback, useRef, useEffect } from "react";
import { useLS } from "@/lib/storage";
import { rhythmAudio } from "@/lib/rhythmAudio";
import {
  type TimeSigCategory,
  type StructuralLayer,
  type TimeSigDef,
  type PeriodicityClass,
  CATEGORY_LABELS,
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LAYER,
  LAYER_LABELS,
  LAYER_DESCRIPTIONS,
  PERIODICITY_LABELS,
  getPeriodicityClass,
  getAllSigs,
  getSigsByCategory,
  getSigsByLayer,
  getCategoriesInLayer,
  generateTimeSigPattern,
  generateNthPattern,
  isEvolvingSig,
  addCustomSig,
  removeCustomSig,
  loadCustomSigs,
  buildCustomSig,
  parseGroupingString,
  bestReferenceInterval,
} from "@/lib/uncommonMetersData";
import TimeSigVisualizer from "./TimeSigVisualizer";
import { PolyLayerTimeline } from "./TimeSigVisualizer";
import CircleTimeSigVisualizer from "./CircleTimeSigVisualizer";
import { ReferenceCircle, PolyLayerCircle } from "./CircleTimeSigVisualizer";

// ── Sub-views ────────────────────────────────────────────────────────

type View = "browse" | "custom";

const VIEW_LABELS: Record<View, string> = {
  browse: "Browse & Learn",
  custom: "Custom Builder",
};

interface Props {
  bpm: number;
}

export default function UncommonMetersPanel({ bpm }: Props) {
  const [view, setView] = useLS<View>("lt_rhy_wts_view", "browse");

  return (
    <div className="space-y-4">
      {/* View tabs */}
      <div className="flex gap-1 flex-wrap">
        {(Object.keys(VIEW_LABELS) as View[]).map(v => (
          <button
            key={v}
            onClick={() => { rhythmAudio.stop(); setView(v); }}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              border: `1.5px solid ${view === v ? "#7173e6" : "#222"}`,
              background: view === v ? "#7173e622" : "#111",
              color: view === v ? "#7173e6" : "#555",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      {view === "browse" && <BrowseView bpm={bpm} />}
      {view === "custom" && <CustomBuilderView bpm={bpm} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Browse & Learn View
// ══════════════════════════════════════════════════════════════════════

function BrowseView({ bpm }: { bpm: number }) {
  const [selectedLayer, setSelectedLayer] = useLS<StructuralLayer | "all">("lt_rhy_wts_browse_layer", "all");
  const [selectedCat, setSelectedCat] = useLS<TimeSigCategory | "all">("lt_rhy_wts_browse_cat", "all");
  const [periodicityFilter, setPeriodicityFilter] = useState<PeriodicityClass | "all">("all");
  const [palateCleanser, setPalateCleanser] = useLS<boolean>("lt_rhy_wts_cleanser", true);
  const [refGrid, setRefGrid] = useLS<boolean>("lt_rhy_wts_refgrid", true);
  const [refAudio, setRefAudio] = useLS<boolean>("lt_rhy_wts_refaudio", false);
  const [microBeats, setMicroBeats] = useLS<boolean>("lt_rhy_wts_micro", false);
  const [selectedSig, setSelectedSig] = useState<TimeSigDef | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeBeat, setActiveBeat] = useState<number | null>(null);
  let sigs = selectedLayer === "all"
    ? (selectedCat === "all" ? getAllSigs() : getSigsByCategory(selectedCat as TimeSigCategory))
    : (selectedCat === "all"
      ? getSigsByLayer(selectedLayer)
      : getSigsByCategory(selectedCat as TimeSigCategory));
  if (periodicityFilter !== "all") {
    sigs = sigs.filter(s => getPeriodicityClass(s) === periodicityFilter);
  }

  const [currentRepLabel, setCurrentRepLabel] = useState<string | null>(null);
  const playingRef = useRef(false);

  const playSig = useCallback(async (sig: TimeSigDef) => {
    if (isPlaying || playingRef.current) { rhythmAudio.stop(); setIsPlaying(false); playingRef.current = false; setCurrentRepLabel(null); return; }
    playingRef.current = true;
    setSelectedSig(sig);
    setActiveBeat(null);
    setCurrentRepLabel(null);

    // Palate cleanser: reset metric entrainment before hearing the new sig
    if (palateCleanser) {
      await rhythmAudio.playPalateCleanser();
    }

    // Only start playback (and reference grid animation) after ear reset is done
    setIsPlaying(true);

    rhythmAudio.setOnBeat((beatPos, layer) => {
      // Only update visual on macro beats to avoid flicker from division/micro events
      if (layer === "macro") setActiveBeat(beatPos);
    });

    // Independent reference audio pulse: steady click at the base BPM
    if (refAudio) {
      rhythmAudio.startReference(bpm * sig.tempoScale);
    }

    // Build audio layers — ref grid is visual only, ref audio is the independent pulse
    const layers: import("@/lib/rhythmEarData").BeatLayer[] = ["macro"];
    if (microBeats) layers.push("micro", "division");

    if (isEvolvingSig(sig)) {
      await rhythmAudio.playInfiniteSequence(
        (idx) => generateNthPattern(sig, bpm, idx, layers),
        (idx) => { setCurrentRepLabel(`Rep ${idx + 1}`); },
      );
    } else {
      const pattern = generateTimeSigPattern(sig, bpm, layers);
      // Scale repeats so playback lasts at least ~12 seconds,
      // otherwise very short measures (φ/4 ≈ 1s) stop before
      // the listener can internalize the meter.
      const measDur = (sig.totalBeats * 60) / (bpm * sig.tempoScale);
      const repeats = Math.max(4, Math.ceil(12 / measDur));
      await rhythmAudio.playPattern(
        pattern,
        () => {
          setIsPlaying(false);
          playingRef.current = false;
          setActiveBeat(null);
          setCurrentRepLabel(null);
          rhythmAudio.setOnBeat(null);
          rhythmAudio.stopReference();
        },
        repeats,
      );
    }
  }, [isPlaying, bpm, palateCleanser, refGrid, refAudio, microBeats]);

  const structLayers = Object.keys(LAYER_LABELS) as StructuralLayer[];
  const subCats = selectedLayer === "all"
    ? (Object.keys(CATEGORY_LABELS) as TimeSigCategory[])
    : getCategoriesInLayer(selectedLayer);

  return (
    <div className="space-y-3">
      {/* Structural layer tabs (3 layers) */}
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => { setSelectedLayer("all"); setSelectedCat("all"); }}
          className={`px-3 py-1.5 rounded text-[10px] font-bold transition-colors border ${
            selectedLayer === "all"
              ? "bg-[#1a1a2a] text-[#9999ee] border-[#555]"
              : "bg-[#111] text-[#555] border-[#222] hover:border-[#444]"
          }`}
        >
          All ({getAllSigs().length})
        </button>
        {structLayers.map(l => {
          const count = getSigsByLayer(l).length;
          if (count === 0) return null;
          return (
            <button
              key={l}
              onClick={() => { setSelectedLayer(l); setSelectedCat("all"); }}
              title={LAYER_DESCRIPTIONS[l]}
              className={`px-3 py-1.5 rounded text-[10px] font-bold transition-colors border ${
                selectedLayer === l
                  ? "bg-[#1a1a2a] text-[#9999ee] border-[#555]"
                  : "bg-[#111] text-[#555] border-[#222] hover:border-[#444]"
              }`}
            >
              {LAYER_LABELS[l]} ({count})
            </button>
          );
        })}
      </div>

      {/* Periodicity filter + Palate cleanser toggle */}
      <div className="flex gap-4 flex-wrap items-center">
        <div className="flex gap-1 flex-wrap items-center">
          <span className="text-[9px] text-[#555] mr-1">Periodicity:</span>
          {(["all", "periodic", "quasi_periodic", "aperiodic", "non_cyclic"] as const).map(pc => (
            <button
              key={pc}
              onClick={() => setPeriodicityFilter(pc)}
              className={`px-2 py-0.5 rounded text-[9px] font-semibold transition-colors border ${
                periodicityFilter === pc
                  ? "bg-[#1a1a2e] text-[#8888dd] border-[#4444aa]"
                  : "bg-[#0e0e0e] text-[#444] border-[#1a1a1a] hover:border-[#333]"
              }`}
            >
              {pc === "all" ? "All" : PERIODICITY_LABELS[pc]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setPalateCleanser(!palateCleanser)}
          title="Play a short burst of arrhythmic clicks before each signature to reset your ear — like eating a cracker between wine tastings"
          className={`px-2.5 py-0.5 rounded text-[9px] font-semibold transition-colors border ${
            palateCleanser
              ? "bg-[#1a2a1a] text-[#7aaa7a] border-[#3a5a3a]"
              : "bg-[#0e0e0e] text-[#444] border-[#1a1a1a] hover:border-[#333]"
          }`}
        >
          {palateCleanser ? "Ear Reset: ON" : "Ear Reset: OFF"}
        </button>
        <button
          onClick={() => setRefGrid(!refGrid)}
          title="Show a steady regular-beat reference circle alongside the meter for visual comparison"
          className={`px-2.5 py-0.5 rounded text-[9px] font-semibold transition-colors border ${
            refGrid
              ? "bg-[#2a2211] text-[#ddaa55] border-[#5a4a22]"
              : "bg-[#0e0e0e] text-[#444] border-[#1a1a1a] hover:border-[#333]"
          }`}
        >
          {refGrid ? "Ref Grid: ON" : "Ref Grid: OFF"}
        </button>
        <button
          onClick={() => setRefAudio(!refAudio)}
          title="Play a steady audible reference pulse at the base BPM so you can hear how the meter drifts against a regular beat"
          className={`px-2.5 py-0.5 rounded text-[9px] font-semibold transition-colors border ${
            refAudio
              ? "bg-[#2a2211] text-[#ddaa55] border-[#5a4a22]"
              : "bg-[#0e0e0e] text-[#444] border-[#1a1a1a] hover:border-[#333]"
          }`}
        >
          {refAudio ? "Ref Audio: ON" : "Ref Audio: OFF"}
        </button>
        <button
          onClick={() => setMicroBeats(!microBeats)}
          title="Play audible subdivision clicks halfway through each beat within groups"
          className={`px-2.5 py-0.5 rounded text-[9px] font-semibold transition-colors border ${
            microBeats
              ? "bg-[#1a2a2a] text-[#55aaaa] border-[#225a5a]"
              : "bg-[#0e0e0e] text-[#444] border-[#1a1a1a] hover:border-[#333]"
          }`}
        >
          {microBeats ? "Micro Beats: ON" : "Micro Beats: OFF"}
        </button>
      </div>

      {/* Sub-category filter within selected layer */}
      {selectedLayer !== "all" && subCats.length > 1 && (
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setSelectedCat("all")}
            className={`px-2 py-1 rounded text-[9px] font-semibold transition-colors border ${
              selectedCat === "all"
                ? "bg-[#1a2a1a] text-[#7aaa7a] border-[#3a5a3a]"
                : "bg-[#0e0e0e] text-[#444] border-[#1a1a1a] hover:border-[#333]"
            }`}
          >
            All
          </button>
          {subCats.map(cat => {
            const count = getSigsByCategory(cat).length;
            if (count === 0) return null;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCat(cat)}
                title={CATEGORY_DESCRIPTIONS[cat]}
                className={`px-2 py-1 rounded text-[9px] font-semibold transition-colors border ${
                  selectedCat === cat
                    ? "bg-[#1a2a1a] text-[#7aaa7a] border-[#3a5a3a]"
                    : "bg-[#0e0e0e] text-[#444] border-[#1a1a1a] hover:border-[#333]"
                }`}
              >
                {CATEGORY_LABELS[cat]} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Layer/category description */}
      {selectedLayer !== "all" && (
        <div className="bg-[#111] border border-[#222] rounded-lg px-4 py-3">
          <p className="text-xs text-[#888] leading-relaxed">
            {selectedCat !== "all"
              ? CATEGORY_DESCRIPTIONS[selectedCat as TimeSigCategory]
              : LAYER_DESCRIPTIONS[selectedLayer]}
          </p>
        </div>
      )}

      {/* Signature list */}
      <div className="grid gap-2">
        {sigs.map(sig => {
          const isSelected = selectedSig?.id === sig.id;
          const beat = isSelected ? activeBeat : null;
          return (
            <div
              key={sig.id}
              className={`cursor-pointer transition-all ${
                isSelected ? "ring-1 ring-[#7173e6] rounded-lg" : ""
              }`}
              onClick={() => playSig(sig)}
            >
              {isSelected ? (
                <div className="space-y-2">
                  {currentRepLabel && isPlaying && (
                    <div className="text-[10px] text-[#9395ea] font-mono font-bold px-2">{currentRepLabel}</div>
                  )}
                  {sig.polyLayers && sig.polyLayers.length > 0 ? (
                    <>
                      {/* Poly-layer view: one circle + timeline per layer */}
                      <div className="flex items-start gap-3 flex-wrap justify-center">
                        {sig.polyLayers.map((layer, li) => (
                          <PolyLayerCircle
                            key={li}
                            groups={layer.groups}
                            totalBeats={layer.totalBeats}
                            label={layer.label}
                            colorIdx={layer.colorIdx ?? li}
                            activeBeat={beat}
                            size={160}
                          />
                        ))}
                      </div>
                      <div className="space-y-1.5">
                        {sig.polyLayers.map((layer, li) => (
                          <PolyLayerTimeline
                            key={li}
                            groups={layer.groups}
                            totalBeats={layer.totalBeats}
                            label={layer.label}
                            colorIdx={layer.colorIdx ?? li}
                            activeBeat={beat}
                          />
                        ))}
                      </div>
                      {/* Description */}
                      <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-lg px-3 py-2">
                        <p className="text-xs text-[#888] leading-relaxed">{sig.description}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        <CircleTimeSigVisualizer sig={sig} activeBeat={beat} />
                        {refGrid && (
                          <div className="flex-shrink-0 self-center">
                            <ReferenceCircle
                              numBeats={Math.max(1, Math.round(sig.totalBeats))}
                              bpm={bpm * sig.tempoScale}
                              isPlaying={isPlaying}
                              size={140}
                            />
                          </div>
                        )}
                      </div>
                      <TimeSigVisualizer sig={sig} activeBeat={beat} />
                    </>
                  )}
                </div>
              ) : (
                <TimeSigVisualizer sig={sig} activeBeat={beat} compact />
              )}
            </div>
          );
        })}
      </div>

      {sigs.length === 0 && (
        <div className="text-center text-[#444] text-sm py-8">
          No time signatures in this category yet. Try the Custom Builder to create some.
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Custom Builder View
// ══════════════════════════════════════════════════════════════════════

function CustomBuilderView({ bpm }: { bpm: number }) {
  const [customSigs, setCustomSigs] = useState(loadCustomSigs);

  // Builder form state
  const [category, setCategory] = useState<TimeSigCategory>("additive");
  const [display, setDisplay] = useState("");
  const [description, setDescription] = useState("");
  const [groupingStr, setGroupingStr] = useState("3+2+3");
  const [tempoScale, setTempoScale] = useState(1);

  const [isPlaying, setIsPlaying] = useState(false);
  const [activeBeat, setActiveBeat] = useState<number | null>(null);
  const [previewSig, setPreviewSig] = useState<TimeSigDef | null>(null);
  const [error, setError] = useState("");
  const handlePreview = useCallback(() => {
    setError("");
    const groups = parseGroupingString(groupingStr);
    if (!groups) {
      setError("Invalid grouping. Use format: 3+2+3 or 3,2,3");
      return;
    }
    const sig = buildCustomSig(
      category,
      display || `(${groups.join("+")})/${Math.round(1 / tempoScale * 4)}`,
      description || "Custom time signature",
      groups,
      tempoScale,
    );
    setPreviewSig(sig);
    return sig;
  }, [category, display, description, groupingStr, tempoScale]);

  const handlePlay = useCallback(async () => {
    if (isPlaying) { rhythmAudio.stop(); setIsPlaying(false); return; }
    const sig = previewSig ?? handlePreview();
    if (!sig) return;
    setIsPlaying(true);
    setActiveBeat(null);

    const cbLayers: import("@/lib/rhythmEarData").BeatLayer[] = ["macro"];
    const pattern = generateTimeSigPattern(sig, bpm, cbLayers);

    rhythmAudio.setOnBeat((beatPos, layer) => {
      if (layer === "macro") setActiveBeat(beatPos);
    });

    await rhythmAudio.playPattern(pattern, () => {
      setIsPlaying(false);
      setActiveBeat(null);
      rhythmAudio.setOnBeat(null);
      rhythmAudio.stopReference();
    }, 4);
  }, [isPlaying, previewSig, handlePreview, bpm]);

  const handleSave = () => {
    setError("");
    const groups = parseGroupingString(groupingStr);
    if (!groups) {
      setError("Invalid grouping. Use format: 3+2+3 or 3,2,3");
      return;
    }
    const sig = buildCustomSig(
      category,
      display || `(${groups.join("+")})`,
      description || "Custom time signature",
      groups,
      tempoScale,
    );
    const updated = addCustomSig(sig);
    setCustomSigs(updated);
    setPreviewSig(null);
    setDisplay("");
    setDescription("");
    setGroupingStr("3+2+3");
  };

  const handleDelete = (id: string) => {
    const updated = removeCustomSig(id);
    setCustomSigs(updated);
  };

  return (
    <div className="space-y-6">
      {/* Builder form */}
      <div className="bg-[#111] border border-[#222] rounded-lg p-4 space-y-4">
        <h3 className="text-xs font-semibold text-[#888] uppercase tracking-widest">
          Create Custom Time Signature
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Category */}
          <div>
            <label className="text-[10px] text-[#666] block mb-1">Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as TimeSigCategory)}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-xs text-white focus:outline-none"
            >
              {(Object.keys(CATEGORY_LABELS) as TimeSigCategory[]).map(c => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          {/* Display name */}
          <div>
            <label className="text-[10px] text-[#666] block mb-1">Display Name (optional)</label>
            <input
              type="text"
              value={display}
              onChange={e => setDisplay(e.target.value)}
              placeholder="e.g. (3+2+3)/8"
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-xs text-white focus:outline-none placeholder:text-[#333]"
            />
          </div>

          {/* Grouping */}
          <div>
            <label className="text-[10px] text-[#666] block mb-1">
              Grouping Structure
              <span className="text-[#444] ml-1">(e.g. 3+2+3 or 2.5+1.5 or 3,4,3)</span>
            </label>
            <input
              type="text"
              value={groupingStr}
              onChange={e => { setGroupingStr(e.target.value); setPreviewSig(null); }}
              placeholder="3+2+3"
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-xs text-white focus:outline-none font-mono placeholder:text-[#333]"
            />
          </div>

          {/* Tempo scale */}
          <div>
            <label className="text-[10px] text-[#666] block mb-1">
              Tempo Scale
              <span className="text-[#444] ml-1">(1 = normal, 0.5 = half speed)</span>
            </label>
            <input
              type="number"
              min={0.1}
              max={4}
              step={0.1}
              value={tempoScale}
              onChange={e => { setTempoScale(Number(e.target.value)); setPreviewSig(null); }}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-xs text-white focus:outline-none"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-[10px] text-[#666] block mb-1">Description (optional)</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What makes this time signature interesting..."
            rows={2}
            className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1.5 text-xs text-white focus:outline-none placeholder:text-[#333] resize-none"
          />
        </div>

        {error && (
          <div className="text-xs text-[#e06060] bg-[#3a1a1a] border border-[#6a3a3a] rounded px-3 py-2">
            {error}
          </div>
        )}

        {/* Quick presets */}
        <div>
          <span className="text-[10px] text-[#555] mr-2">Quick presets:</span>
          {[
            { label: "5/8 aksak", g: "2+3", cat: "additive" },
            { label: "7/8 Balkan", g: "3+2+2", cat: "additive" },
            { label: "11/8", g: "3+3+3+2", cat: "prime" },
            { label: "4/3 Ferneyhough", g: "4", cat: "irrational", ts: 2/3 },
            { label: "π beats", g: String(Math.PI.toFixed(4)), cat: "real_number" },
            { label: "3.5/4", g: "2+1.5", cat: "fractional" },
            { label: "13/8 Turkish", g: "3+2+3+2+3", cat: "prime" },
            { label: "5:7 poly", g: "5", cat: "ratio" },
          ].map(preset => (
            <button
              key={preset.label}
              onClick={() => {
                setGroupingStr(preset.g);
                setCategory(preset.cat as TimeSigCategory);
                if (preset.ts) setTempoScale(preset.ts);
                else setTempoScale(1);
                setDisplay(preset.label);
                setPreviewSig(null);
              }}
              className="text-[10px] px-2 py-1 bg-[#1a1a1a] text-[#888] border border-[#2a2a2a] rounded hover:border-[#555] hover:text-[#aaa] transition-colors mr-1 mb-1"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={handlePreview}
            className="px-4 py-2 bg-[#1e1e1e] hover:bg-[#2a2a2a] border border-[#333] text-[#aaa] rounded text-xs font-medium transition-colors"
          >
            Preview
          </button>
          <button
            onClick={handlePlay}
            disabled={isPlaying && !previewSig}
            className="px-4 py-2 bg-[#7173e6] hover:bg-[#5a5cc8] disabled:opacity-50 text-white rounded text-xs font-medium transition-colors"
          >
            {isPlaying ? "■ Stop" : "▶ Play"}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-[#1a3a1a] hover:bg-[#1e4a1e] border border-[#3a6a3a] text-[#5cca5c] rounded text-xs font-medium transition-colors"
          >
            Save Custom Sig
          </button>
        </div>
      </div>

      {/* Preview */}
      {previewSig && (
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <CircleTimeSigVisualizer sig={previewSig} activeBeat={activeBeat} />
            <div className="flex-shrink-0 self-center">
              <ReferenceCircle
                numBeats={Math.max(1, Math.round(previewSig.totalBeats))}
                bpm={bpm * previewSig.tempoScale}
                isPlaying={isPlaying}
                size={140}
              />
            </div>
          </div>
          <TimeSigVisualizer sig={previewSig} activeBeat={activeBeat} />
        </div>
      )}

      {/* Saved custom sigs */}
      {customSigs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-[#888] uppercase tracking-widest">
            Your Custom Signatures ({customSigs.length})
          </h3>
          {customSigs.map(sig => (
            <div key={sig.id} className="flex items-start gap-2">
              <div className="flex-1">
                <TimeSigVisualizer sig={sig} compact />
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button
                  onClick={async () => {
                    if (isPlaying) { rhythmAudio.stop(); setIsPlaying(false); return; }
                    setIsPlaying(true);
                    setActiveBeat(null);
                    const sLayers: import("@/lib/rhythmEarData").BeatLayer[] = ["macro"];
                    const pattern = generateTimeSigPattern(sig, bpm, sLayers);
                    rhythmAudio.setOnBeat((beatPos) => setActiveBeat(beatPos));
                    await rhythmAudio.playPattern(pattern, () => {
                      setIsPlaying(false);
                      setActiveBeat(null);
                      rhythmAudio.setOnBeat(null);
                    }, 4);
                  }}
                  className="px-2 py-1 bg-[#1e1e1e] border border-[#333] text-[#888] hover:text-white rounded text-[10px] transition-colors"
                >
                  ▶
                </button>
                <button
                  onClick={() => handleDelete(sig.id)}
                  className="px-2 py-1 bg-[#2a1a1a] border border-[#5a2a2a] text-[#cc6666] hover:text-[#ff8888] rounded text-[10px] transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
