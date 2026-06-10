/**
 * GrooveMode.tsx — "Groove Permutations" sub-mode for Drum Patterns.
 *
 * Define a CYCLE (pulses × per-pulse sub-pulses, uniform or additive 3-2-2),
 * pick a tradition/feel, and hit Generate to draw a RANDOM real-world groove of
 * that length + style and hear it played a new way each time.  The library
 * groove is only scaffolding — the engine keeps its style skeleton and re-rolls
 * the playing on top (ghosts, hi-hat subdivision, pushed kicks, open-hat
 * accents, 32nd ornaments) so the goal of the mode — exposure to as many
 * grooves and as much vocabulary as possible — is met by just regenerating.
 * Save any result, or load a reference groove from the library browser below.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { VexDrumStrip } from "@/components/VexDrumNotation";
import {
  PointVoices,
  SUB_PULSE_SIZES,
  makeCycle, assembleCycle, cycleToStripMeasures,
} from "@/lib/grooveCycle";
import { generateInStyle, scoreGroove, toKitVoices, type GrooveBias } from "@/lib/grooveScoring";
import { nearestLibraryGroove, GROOVE_LIBRARY, REGIONS, genresForRegion, type LibraryMatch, type Region, type LibraryGroove } from "@/lib/grooveLibrary";
import { cycleTotalSlots } from "@/lib/grooveCycle";
import {
  getGrooves, addGroove, deleteGroove, renameGroove, type SavedGroove,
} from "@/lib/grooveStore";

type Aesthetic = "musical" | "awkward" | "both";

/** Generation-bias toggles — colours echo the voice each one emphasises. */
const BIAS_OPTS: { key: GrooveBias; label: string; color: string }[] = [
  { key: "ghost",    label: "Ghost notes",  color: "#9a9a9a" },
  { key: "bass",     label: "Busy bass",    color: "#e0a040" },
  { key: "snare",    label: "Busy snare",   color: "#60b0e0" },
  { key: "mixedHat", label: "Mixed hi-hat", color: "#c8aa50" },
];

/** Factor a library groove's slot count into editor pulse sizes (each 2..7),
 *  preferring a uniform sixteenth-style grouping, falling back to an additive
 *  decomposition for prime / awkward lengths (e.g. 11 → 4+7, 13 → 4+4+5). */
function factorSizes(L: number): number[] {
  if (L <= 7) return [Math.max(2, L)];
  for (const s of [4, 3, 2, 6, 5, 7]) if (L % s === 0) return Array<number>(L / s).fill(s);
  const parts: number[] = []; let r = L;
  while (r > 7) { parts.push(4); r -= 4; }
  if (r >= 2) parts.push(r); else if (parts.length) parts[parts.length - 1] += r;
  return parts;
}

export default function GrooveMode() {
  const [sizes, setSizes] = useState<number[]>([4, 4, 4, 4]);
  const [aesthetic, setAesthetic] = useState<Aesthetic>("musical");
  const [region, setRegion] = useState<Region | "Any">("Any");
  const [genre, setGenre] = useState<string>("");
  const [biases, setBiases] = useState<GrooveBias[]>([]);
  const toggleBias = (b: GrooveBias) => setBiases(prev => (prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]));
  const [pointVoices, setPointVoices] = useState<PointVoices[]>(() => sizes.map(() => ({})));
  const [genMatch, setGenMatch] = useState<LibraryMatch | null>(null);

  const cycle = useMemo(() => makeCycle(sizes), [sizes]);

  // Keep pointVoices aligned to the pulse count.
  useEffect(() => {
    setPointVoices(prev => sizes.map((_s, i) => prev[i] ?? {}));
    setGenMatch(null);
  }, [sizes]);

  const assembled = useMemo(() => assembleCycle(cycle, pointVoices), [cycle, pointVoices]);
  const measures = useMemo(() => cycleToStripMeasures(cycle, pointVoices, { perBeat: true }), [cycle, pointVoices]);
  const match: LibraryMatch | null = useMemo(() => nearestLibraryGroove(assembled), [assembled]);
  const score = useMemo(() => scoreGroove(assembled, aesthetic === "awkward" ? "awkward" : "musical"), [assembled, aesthetic]);
  const rationale = genMatch ?? match;

  const total = cycleTotalSlots(cycle);
  const genreOpts = useMemo(() => genresForRegion(region, total), [region, total]);
  const generate = useCallback(() => {
    const res = generateInStyle(cycle, {
      region: region === "Any" ? undefined : region,
      genre: genre || undefined,
      mode: aesthetic,
      biases,
    });
    setPointVoices(res.pointVoices);
    setGenMatch(res.match);
  }, [cycle, aesthetic, region, genre, total, biases]);

  // ── Per-pulse size editing ──────────────────────────────────────────────
  const setAll = (n: number) => setSizes(prev => prev.map(() => n));
  const cyclePulse = (i: number) => setSizes(prev => prev.map((s, j) => {
    if (j !== i) return s;
    const idx = SUB_PULSE_SIZES.indexOf(s as any);
    return SUB_PULSE_SIZES[(idx + 1) % SUB_PULSE_SIZES.length];
  }));
  const addPulse = () => setSizes(prev => [...prev, prev[prev.length - 1] ?? 4]);
  const removePulse = () => setSizes(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));

  // ── Saved grooves ───────────────────────────────────────────────────────
  const [saved, setSaved] = useState<SavedGroove[]>(() => getGrooves());
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  useEffect(() => {
    const sync = () => setSaved(getGrooves());
    window.addEventListener("grooves-changed", sync);
    return () => window.removeEventListener("grooves-changed", sync);
  }, []);
  const saveCurrent = useCallback(() => addGroove(cycle, pointVoices, { matchName: rationale?.groove.name }), [cycle, pointVoices, rationale]);
  const loadGroove = useCallback((g: SavedGroove) => {
    setSizes(g.cycle.points.map(p => p.subPulses));
    setTimeout(() => { setPointVoices(g.pointVoices); setGenMatch(null); }, 0);
  }, []);

  // Load a reference-library groove straight into the editor so it can be heard.
  const loadLibraryGroove = useCallback((g: LibraryGroove) => {
    const sz = factorSizes(g.length);
    // Build a full kit around sparse timeline/clave entries so the reference
    // plays as a drumset groove, not a single-instrument circle part.
    const pv = toKitVoices(g, makeCycle(sz));
    setSizes(sz);
    setTimeout(() => { setPointVoices(pv); setGenMatch({ groove: g, similarity: 1 }); }, 0);
  }, []);

  // ── Styles ──────────────────────────────────────────────────────────────
  const chip = (active: boolean, color = "#50b0c0"): React.CSSProperties => ({
    padding: "4px 9px", borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: "pointer",
    border: `1px solid ${active ? color : "#2a2a2a"}`, background: active ? color + "22" : "#0e0e0e", color: active ? color : "#666",
  });
  const lbl: React.CSSProperties = { fontSize: 10, letterSpacing: 2, color: "#666", fontWeight: 700 };
  const stripW = Math.min(1500, Math.max(420, assembled.totalSlots * 34));

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "12px 18px", display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── Cycle config ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={lbl}>PULSES</span>
          <button onClick={removePulse} style={chip(false)}>–</button>
          <span style={{ fontFamily: "monospace", fontSize: 14, color: "#ddd", minWidth: 16, textAlign: "center" }}>{sizes.length}</span>
          <button onClick={addPulse} style={chip(false)}>+</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={lbl}>SET ALL</span>
          {SUB_PULSE_SIZES.map(s => <button key={s} onClick={() => setAll(s)} style={chip(sizes.every(x => x === s))}>{s}</button>)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={lbl}>FEEL</span>
          {(["musical", "awkward", "both"] as Aesthetic[]).map(m => <button key={m} onClick={() => setAesthetic(m)} style={chip(aesthetic === m, "#50b080")}>{m}</button>)}
        </div>
        <button onClick={generate} style={{ ...chip(true), padding: "6px 16px", fontSize: 12, marginLeft: "auto" }}>⟳ Generate musical cycle</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={lbl}>STYLE</span>
        {(["Any", ...REGIONS] as (Region | "Any")[]).map(r => (
          <button key={r} onClick={() => { setRegion(r); setGenre(""); }} style={chip(region === r, "#c090e0")}>{r}</button>
        ))}
        {region !== "Any" && (
          <select value={genre} onChange={e => setGenre(e.target.value)}
            style={{ background: "#0e0e0e", color: "#bbb", border: "1px solid #2a2a2a", borderRadius: 5, fontSize: 11, padding: "4px 6px" }}>
            <option value="">any {region} genre</option>
            {genreOpts.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
        <span style={{ fontSize: 10, color: "#555" }}>Generate draws an idiomatic groove from this tradition</span>
      </div>

      {/* ── Generation biases (lean the random variation toward a voice/feel) ─ */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={lbl}>BIAS</span>
        {BIAS_OPTS.map(b => (
          <button key={b.key} onClick={() => toggleBias(b.key)} style={chip(biases.includes(b.key), b.color)}>{b.label}</button>
        ))}
        <span style={{ fontSize: 10, color: "#555" }}>lean each Generate toward a voice/feel — combine freely, or leave all off for neutral</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={lbl}>SUB-PULSES / PULSE</span>
        {sizes.map((s, i) => (
          <button key={i} onClick={() => cyclePulse(i)} title="click to change size"
            style={{ ...chip(false), fontFamily: "monospace", minWidth: 26 }}>{s}</button>
        ))}
        <span style={{ fontSize: 10, color: "#555" }}>e.g. 3-2-2 · 3-4-5 · 6-8-8 — click a number to change it</span>
      </div>

      {/* ── Assembled cycle + rationale ────────────────────────────────── */}
      <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 8, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <VexDrumStrip measures={measures} measureWidth={Math.max(90, stripW / sizes.length)} height={210} showClef oneBeatPerBar equalBeatWidth />
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#888", textAlign: "center" }}>
          {rationale ? (
            <span>
              <span style={{ color: "#7fd4e4", fontWeight: 700 }}>{rationale.groove.name}</span>
              {" · "}<span style={{ color: "#c8aa50" }}>{rationale.groove.region}</span>
              {" · "}<span style={{ color: "#666" }}>{rationale.groove.genre}</span>
              {"  "}<span style={{ color: "#444" }}>({Math.round(rationale.similarity * 100)}% · score {Math.round(score)})</span>
              <div style={{ color: "#777", fontStyle: "italic", marginTop: 3, maxWidth: 760, margin: "3px auto 0" }}>{rationale.groove.desc}</div>
            </span>
          ) : <span style={{ color: "#555" }}>No world-music match yet — build or generate a cycle (score {Math.round(score)}).</span>}
        </div>
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <button onClick={saveCurrent} style={chip(false, "#50b080")}>★ Save groove</button>
        </div>
      </div>

      {/* ── Saved grooves ──────────────────────────────────────────────── */}
      {saved.length > 0 && (
        <div>
          <span style={{ fontSize: 11, letterSpacing: 2, color: "#888", fontWeight: 700 }}>SAVED GROOVES</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {saved.map(g => (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", border: "1px solid #222", borderRadius: 6, background: "#0e0e0e" }}>
                {editId === g.id ? (
                  <input autoFocus value={editLabel} onChange={e => setEditLabel(e.target.value)}
                    onBlur={() => { renameGroove(g.id, editLabel || g.label); setEditId(null); }}
                    onKeyDown={e => { if (e.key === "Enter") { renameGroove(g.id, editLabel || g.label); setEditId(null); } }}
                    style={{ background: "#000", border: "1px solid #333", color: "#ddd", fontSize: 11, padding: "2px 4px", width: 120 }} />
                ) : (
                  <button onClick={() => loadGroove(g)} style={{ background: "none", border: "none", color: "#bbb", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>{g.label}</button>
                )}
                <button onClick={() => { setEditId(g.id); setEditLabel(g.label); }} title="Rename" style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 11 }}>✎</button>
                <button onClick={() => deleteGroove(g.id)} title="Delete" style={{ background: "none", border: "none", color: "#a55", cursor: "pointer", fontSize: 12 }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <LibraryReference onLoad={loadLibraryGroove} />
    </div>
  );
}

/* ── Searchable cross-genre library browser (≈14k grooves) ───────────────── */
function LibraryReference({ onLoad }: { onLoad: (g: LibraryGroove) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [reg, setReg] = useState<Region | "Any">("Any");
  const CAP = 250;

  const filtered = useMemo(() => {
    if (!open) return [];
    const q = query.trim().toLowerCase();
    const out: LibraryGroove[] = [];
    for (const g of GROOVE_LIBRARY) {
      if (reg !== "Any" && g.region !== reg) continue;
      if (q && !(g.name.toLowerCase().includes(q) || g.genre.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q))) continue;
      out.push(g);
    }
    return out;
  }, [open, query, reg]);

  const chip = (active: boolean, color = "#c090e0"): React.CSSProperties => ({
    padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: "pointer",
    border: `1px solid ${active ? color : "#2a2a2a"}`, background: active ? color + "22" : "#0e0e0e", color: active ? color : "#666",
  });

  return (
    <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 10 }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: "none", cursor: "pointer", color: "#777", fontSize: 11, letterSpacing: 2, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
        <span>{open ? "▾" : "▸"}</span> CROSS-GENRE GROOVE LIBRARY
        <span style={{ color: "#444", fontWeight: 400, letterSpacing: 0 }}>{GROOVE_LIBRARY.length.toLocaleString()} grooves — click to browse &amp; load</span>
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <input
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder="search name / tradition / description…"
              style={{ background: "#0a0a0a", color: "#ddd", border: "1px solid #2a2a2a", borderRadius: 5, fontSize: 12, padding: "5px 9px", width: 280 }} />
            {(["Any", ...REGIONS] as (Region | "Any")[]).map(r => (
              <button key={r} onClick={() => setReg(r)} style={chip(reg === r)}>{r}</button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "#555" }}>
            {filtered.length.toLocaleString()} match{filtered.length === 1 ? "" : "es"}
            {filtered.length > CAP && ` · showing first ${CAP} (refine your search to narrow)`}
            {" · click ▸ Load to drop a groove into the editor"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 460, overflowY: "auto", paddingRight: 4 }}>
            {filtered.slice(0, CAP).map(g => (
              <div key={g.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11, color: "#888", padding: "4px 0", borderBottom: "1px solid #141414" }}>
                <button onClick={() => onLoad(g)} title="Load this groove into the editor"
                  style={{ flexShrink: 0, marginTop: 1, padding: "2px 7px", borderRadius: 4, border: "1px solid #2a3a2a", background: "#0e160e", color: "#50b080", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                  ▸ Load
                </button>
                <div style={{ minWidth: 0 }}>
                  <span style={{ color: "#7fd4e4", fontWeight: 600 }}>{g.name}</span>
                  <span style={{ color: "#555" }}> · {g.region} · {g.genre} · {g.length} slots</span>
                  <div style={{ color: "#666", fontStyle: "italic", marginTop: 1 }}>{g.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
