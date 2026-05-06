// Drone Continuum — horizontal pitch strip from A1 (55 Hz, left) to A6
// (1760 Hz, right).  Click anywhere on the strip to place a node; nodes
// drone simultaneously via the existing sample-based audio engine, which
// pitch-shifts each sample to the exact target frequency.  No 12-TET /
// EDO assumption in the audio path: every node is its own continuous
// frequency.
import { useState, useEffect, useRef, useCallback } from "react";
import { audioEngine, AudioEngine, DRONE_INSTRUMENTS, type DroneInstrument } from "@/lib/audioEngine";
import { useLS } from "@/lib/storage";
import { pcToNoteName } from "@/lib/edoData";
import { findJiRatio, formatJiRatio, maxPrimeOf } from "@/lib/jiRatioFinder";

interface Props {
  edo: number;
  ensureAudio: () => Promise<void>;
}

const SUPPORTED_EDO_OPTIONS = [12, 17, 19, 22, 24, 31, 41, 53] as const;

// Strip bounds default to A1 (55 Hz) – A6 (1760 Hz) but the user can
// pick any octave anchors via the controls.  freq(A_n) = 27.5 × 2ⁿ.
const A_BASE_HZ = 27.5; // = freq(A0)
const aOctaveHz = (oct: number) => A_BASE_HZ * Math.pow(2, oct);

// Match the audio engine's C4 reference so EDO labels align with the
// app's tonal-system note names (the EDO grid is C-anchored even though
// the strip's left and right ends happen to be A1 and A6 — that's just
// where the user mentally places the range).
const C4_HZ = 261.63;
const freqToAbsPc = (f: number, edo: number) =>
  4 * edo + edo * Math.log2(f / C4_HZ);
const absPcToFreq = (pc: number, edo: number) =>
  C4_HZ * Math.pow(2, (pc - 4 * edo) / edo);

// Horizontal layout.  STRIP_W is dynamic — measured from the container
// at mount and on resize so the strip always fills the available width
// without horizontal scrolling.  All other dimensions are fixed pixels.
//   y=0..14            = A_n octave anchor labels (A1, A2, ...)
//   y=18..36           = step-name labels — HORIZONTAL, no head-tilt,
//                        each label sits directly on top of its
//                        gridline (just above the strip body)
//   y=STRIP_Y_TOP..STRIP_Y_BOT = strip body (gridlines, node circles)
//   y=STRIP_Y_BOT..NODE_LABEL_Y = (small gap)
//   y=NODE_LABEL_Y..   = per-node label rows + leader lines
const STRIP_X       = 18;
const STRIP_RIGHT   = 18;
const STEP_LABEL_H  = 22;     // single row of horizontal text
const STRIP_Y_TOP   = 18 + STEP_LABEL_H + 4;
const STRIP_H       = 130;
const STRIP_Y_BOT   = STRIP_Y_TOP + STRIP_H;
const NODE_LABEL_Y  = STRIP_Y_BOT + 8;
const NODE_LABEL_H  = 80;
const SVG_H = NODE_LABEL_Y + NODE_LABEL_H;

// xFromFreq / freqFromX are defined inside the component as closures
// over the dynamic stripW measurement.

const snapFreqToEdo = (f: number, edo: number): number =>
  absPcToFreq(Math.round(freqToAbsPc(f, edo)), edo);

// EDO note name + signed cents drift between `freq` and the nearest
// C-anchored EDO step.  Octave numbers count from C0 to match the
// app's standard absolute-pitch convention.
function edoLabelFor(freq: number, edo: number): { name: string; drift: number } {
  const exactPc = freqToAbsPc(freq, edo);
  const snappedPc = Math.round(exactPc);
  const drift = (exactPc - snappedPc) * (1200 / edo);
  const pc = ((snappedPc % edo) + edo) % edo;
  const oct = Math.floor(snappedPc / edo);
  return { name: `${pcToNoteName(pc, edo)}${oct}`, drift };
}

interface DroneNode {
  id: string;
  freq: number;
  harmonicOf?: string;
  harmonicNum?: number;
  subharmonic?: boolean;
  chordOf?: string;
  chordIndex?: number;
  outOfRange?: boolean;
}

let nextId = 1;
const makeId = () => `n${nextId++}`;

const HARMONIC_PRESET_COUNTS = [4, 8, 12, 16, 24] as const;

// Curated 13-limit JI ratios within an octave — the "important" ones
// for ear-training: every consonance up through tridecimal sevenths,
// plus the standard 5-limit minor / major intervals.  Tenney height
// stays moderate so each ratio is hearable as a coherent interval
// rather than a tempered slip.
const JI_GRID_RATIOS: { num: number; den: number; label: string; isP5?: boolean }[] = [
  { num: 1,  den: 1,  label: "1/1" },
  { num: 16, den: 15, label: "16/15" },
  { num: 9,  den: 8,  label: "9/8" },
  { num: 7,  den: 6,  label: "7/6" },
  { num: 6,  den: 5,  label: "6/5" },
  { num: 5,  den: 4,  label: "5/4" },
  { num: 4,  den: 3,  label: "4/3" },
  { num: 11, den: 8,  label: "11/8" },
  { num: 7,  den: 5,  label: "7/5" },
  { num: 3,  den: 2,  label: "3/2", isP5: true },
  { num: 8,  den: 5,  label: "8/5" },
  { num: 5,  den: 3,  label: "5/3" },
  { num: 7,  den: 4,  label: "7/4" },
  { num: 9,  den: 5,  label: "9/5" },
  { num: 13, den: 8,  label: "13/8" },
  { num: 15, den: 8,  label: "15/8" },
];

interface ChordPreset { id: string; label: string; ratios: number[] }
const CHORD_LIBRARY: ChordPreset[] = [
  { id: "M",    label: "Maj 4:5:6",         ratios: [1, 5/4, 3/2] },
  { id: "m",    label: "Min 10:12:15",      ratios: [1, 6/5, 3/2] },
  { id: "ms",   label: "Sept-min 6:7:9",    ratios: [1, 7/6, 3/2] },
  { id: "sus",  label: "Sus 6:8:9",         ratios: [1, 4/3, 3/2] },
  { id: "Maj7", label: "Maj7 8:10:12:15",   ratios: [1, 5/4, 3/2, 15/8] },
  { id: "Min7", label: "Min7 10:12:15:18",  ratios: [1, 6/5, 3/2, 9/5] },
  { id: "Dom7", label: "Sept-7 4:5:6:7",    ratios: [1, 5/4, 3/2, 7/4] },
  { id: "h7",   label: "Half-dim 5:6:7:9",  ratios: [1, 6/5, 7/5, 9/5] },
  { id: "d7",   label: "Trideci 7:9:11:13", ratios: [1, 9/7, 11/7, 13/7] },
  { id: "Ot",   label: "Otonal 4:5:6:7:9",  ratios: [1, 5/4, 3/2, 7/4, 9/4] },
  { id: "Ut",   label: "Utonal 7:6:5:4",    ratios: [1, 7/6, 7/5, 7/4] },
];

export default function DroneContinuumTab({ edo: globalEdo, ensureAudio }: Props) {
  const [nodes, setNodes] = useState<DroneNode[]>([]);
  // Local EDO override — lets users compare different EDO grids in
  // this mode without having to leave the section to switch the global
  // EDO.  Initialised to whatever the rest of the app has set.
  const [localEdo, setLocalEdo] = useLS<number>("lt_dc_edo", globalEdo);
  const edo = localEdo;
  const [droneOn, setDroneOn] = useLS<boolean>("lt_dc_on", true);
  const [gain, setGain] = useLS<number>("lt_dc_gain", 0.18);
  const [showEdoGrid, setShowEdoGrid] = useLS<boolean>("lt_dc_edoGrid", true);
  const [snapToEdo, setSnapToEdo] = useLS<boolean>("lt_dc_snap", false);
  const [showJiRulers, setShowJiRulers] = useLS<boolean>("lt_dc_jiRulers", false);
  const [showStepNames, setShowStepNames] = useLS<boolean>("lt_dc_stepNames", true);
  const [labelMode, setLabelMode] = useLS<"both" | "edo" | "ji">("lt_dc_labelMode", "both");
  const [primeLimit, setPrimeLimit] = useLS<number>("lt_dc_primeLimit", 13);
  const [menuNodeId, setMenuNodeId] = useState<string | null>(null);
  // Grid mode — switches the gridlines between equal-temperament steps
  // (12/19/31/41/53/etc.) and just-intonation 13-limit ratios anchored
  // to each A_n octave.  Per-node JI ratio analysis still runs the
  // same way regardless (it answers "what JI ratio is closest to this
  // freq from the current root?"), so this only affects the *grid*.
  const [gridMode, setGridMode] = useLS<"edo" | "ji">("lt_dc_gridMode", "edo");
  // Strip range — user-pickable octave bounds (each anchored to A_n).
  // Default A1..A6 (55–1760 Hz, 5 octaves).
  const [lowOct, setLowOct] = useLS<number>("lt_dc_lowOct", 1);
  const [highOct, setHighOct] = useLS<number>("lt_dc_highOct", 6);
  // Drone instrument — shares the same LS key as the global drone strip
  // so picking here also persists to the rest of the app (and vice versa).
  const [instrument, setInstrumentState] = useLS<DroneInstrument>("lt_app_droneInstrument", "tanpura");
  useEffect(() => {
    if (!AudioEngine.isValidInstrument(instrument)) setInstrumentState("tanpura");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const stripLowHz   = aOctaveHz(lowOct);
  const stripHighHz  = aOctaveHz(highOct);
  const stripOctaves = Math.max(0.5, highOct - lowOct);
  // Per-node JI-harmonic-ruler visibility — toggled via the node menu.
  // Each entry overlays the harmonic series of that node (2..32) on
  // the strip in the node's own color, so users can see where each
  // node's partials fall against the EDO grid.
  const [nodeRulers, setNodeRulers] = useState<Set<string>>(new Set());
  // Live spectrum analyser — feeds an FFT off the audio engine's master
  // bus and projects detected peaks onto the strip so users can see
  // which partials of the playing drone are actually sounding.
  const [showSpectrum, setShowSpectrum] = useLS<boolean>("lt_dc_spectrum", true);
  const [spectrumPeaks, setSpectrumPeaks] = useState<{ freq: number; mag: number }[]>([]);
  // Additive-synth per-harmonic amplitudes (h1..h16).  Default uses a
  // cello-like spectrum — sounds warm and pad-y as a drone, unlike
  // raw 1/n sawtooth which is buzzy and harsh sustained.  Presets
  // below mirror well-known synth voicings (Hammond drawbars, cello,
  // mellow pad, etc.) for users to start from.
  const ADDITIVE_PRESETS: Record<string, number[]> = {
    Cello:    [1.00, 0.85, 0.70, 0.62, 0.50, 0.40, 0.30, 0.22, 0.18, 0.14, 0.10, 0.07, 0.05, 0.035, 0.025, 0.018],
    Pad:      [1.00, 0.60, 0.40, 0.30, 0.22, 0.16, 0.12, 0.09, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.015, 0.012],
    // Hammond B3 "full drawbars 888 888 888" — h1+h2+h3+h4+h5+h6+h8,
    // skipping h7 (no drawbar maps to it).  Classic full-organ sound.
    Hammond:  [1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 0.00, 1.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
    // Mellow 1/n² rolloff — closer to a soft pad / sine-rich tone.
    Mellow:   Array.from({ length: 16 }, (_, i) => 1 / Math.pow(i + 1, 2)),
    // Square wave: only odd harmonics.
    Square:   Array.from({ length: 16 }, (_, i) => (i % 2 === 0 ? 1 / (i + 1) : 0)),
    // Sawtooth: classic 1/n (kept as a preset for completeness, even
    // though it's harsh as a sustain).
    Sawtooth: Array.from({ length: 16 }, (_, i) => 1 / (i + 1)),
    Sine:     [1, ...Array(15).fill(0)],
    Flat:     Array(16).fill(1),
  };
  const [additivePartials, setAdditivePartials] = useLS<number[]>(
    "lt_dc_additivePartials",
    ADDITIVE_PRESETS.Cello,
  );
  // Push partials to the audio engine whenever they change.
  useEffect(() => {
    const arr = new Float32Array(33);
    for (let i = 0; i < Math.min(32, additivePartials.length); i++) {
      arr[i + 1] = additivePartials[i];
    }
    audioEngine.setAdditivePartials(arr);
  }, [additivePartials]);
  const stripRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const droneActiveRef = useRef(false);

  // Measured container width — drives the SVG width so the strip always
  // fits the available space without horizontal scrolling.
  const [containerWidth, setContainerWidth] = useState(1200);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(Math.max(600, el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const SVG_W   = containerWidth;
  const STRIP_W = SVG_W - STRIP_X - STRIP_RIGHT;
  const cy = STRIP_Y_TOP + STRIP_H / 2;
  const TICK_HALF        = 9;   // half-height of an EDO step tick (snare-notation style)
  const OCTAVE_TICK_HALF = 22;  // taller ticks for A1..A6 octave anchors

  const xFromFreq = (f: number): number =>
    STRIP_X + (Math.log2(f / stripLowHz) / stripOctaves) * STRIP_W;
  const freqFromX = (x: number): number =>
    stripLowHz * Math.pow(2, ((x - STRIP_X) / STRIP_W) * stripOctaves);

  // Restart the drone whenever the active node set, gain, or on/off changes.
  // startRatioDrone tears down the previous voices internally, so this is
  // a single atomic update — no incremental add/remove plumbing needed.
  useEffect(() => {
    const audible = nodes.filter(n => !n.outOfRange);
    if (!droneOn || audible.length === 0) {
      if (droneActiveRef.current) {
        audioEngine.stopDrone();
        droneActiveRef.current = false;
      }
      return;
    }
    let cancelled = false;
    (async () => {
      await ensureAudio();
      if (cancelled) return;
      audioEngine.setInstrument(instrument);
      const ratios = audible.map(n => n.freq / stripLowHz);
      audioEngine.startRatioDrone(ratios, gain, stripLowHz);
      droneActiveRef.current = true;
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, droneOn, gain, instrument, stripLowHz, ensureAudio, additivePartials]);

  useEffect(() => {
    return () => {
      if (droneActiveRef.current) {
        audioEngine.stopDrone();
        droneActiveRef.current = false;
      }
    };
  }, []);

  // Spectrum analyser loop — runs while drone is on AND spectrum
  // visualisation is enabled.  Pulls Float dB data from the master-bus
  // analyser, finds local maxima above a threshold, and stashes the
  // top peaks (freq + dB magnitude) so the SVG render highlights them.
  useEffect(() => {
    if (!droneOn || !showSpectrum) {
      setSpectrumPeaks([]);
      return;
    }
    let raf = 0;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      const a = audioEngine.getAnalyser();
      const sr = audioEngine.getSampleRate();
      if (!a || !sr) {
        raf = requestAnimationFrame(run);
        return;
      }
      const N = a.frequencyBinCount;
      const buf = new Float32Array(N);
      a.getFloatFrequencyData(buf);
      const binHz = sr / 2 / N;
      // Local-max peak picker, dB threshold relative to noise floor.
      const PEAK_DB = -55;
      const peaks: { freq: number; mag: number }[] = [];
      for (let i = 2; i < N - 2; i++) {
        const v = buf[i];
        if (v < PEAK_DB) continue;
        if (v <= buf[i - 1] || v <= buf[i + 1]) continue;
        if (v <= buf[i - 2] || v <= buf[i + 2]) continue;
        const f = i * binHz;
        if (f < stripLowHz * 0.95 || f > stripHighHz * 1.05) continue;
        peaks.push({ freq: f, mag: v });
      }
      // Keep the loudest 32 peaks to avoid drawing hundreds.
      peaks.sort((p, q) => q.mag - p.mag);
      setSpectrumPeaks(peaks.slice(0, 32));
      raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [droneOn, showSpectrum, stripLowHz, stripHighHz]);

  const onStripClick = (e: React.MouseEvent<SVGRectElement>) => {
    const svg = stripRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    let freq = freqFromX(local.x);
    if (!isFinite(freq) || freq < stripLowHz * 0.99 || freq > stripHighHz * 1.01) return;
    if (snapToEdo) {
      if (gridMode === "edo") {
        freq = snapFreqToEdo(freq, edo);
      } else {
        // JI snap: pick the nearest gridline frequency.
        let bestF = freq;
        let bestD = Infinity;
        for (const s of gridSteps) {
          const d = Math.abs(Math.log2(freq / s.freq));
          if (d < bestD) { bestD = d; bestF = s.freq; }
        }
        freq = bestF;
      }
    }
    setNodes(prev => [...prev, { id: makeId(), freq }]);
    setMenuNodeId(null);
  };

  const isChildOf = (n: DroneNode, parentId: string) =>
    n.harmonicOf === parentId || n.chordOf === parentId;

  const removeNode = (id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id && !isChildOf(n, id)));
    setNodeRulers(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setMenuNodeId(null);
  };

  const clearAll = () => { setNodes([]); setNodeRulers(new Set()); setMenuNodeId(null); };

  const toggleNodeRuler = (id: string) => {
    setNodeRulers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addHarmonicSeries = (parentId: string, count: number, below: boolean) => {
    setNodes(prev => {
      const parent = prev.find(n => n.id === parentId);
      if (!parent) return prev;
      const filtered = prev.filter(n => !isChildOf(n, parentId));
      const additions: DroneNode[] = [];
      for (let h = 2; h <= count; h++) {
        const freq = below ? parent.freq / h : parent.freq * h;
        const outOfRange = below
          ? freq < stripLowHz * 0.999
          : freq > stripHighHz * 1.001;
        additions.push({
          id: makeId(), freq,
          harmonicOf: parentId, harmonicNum: h,
          subharmonic: below,
          outOfRange,
        });
      }
      return [...filtered, ...additions];
    });
    setMenuNodeId(null);
  };

  const spawnChord = (parentId: string, chord: ChordPreset) => {
    setNodes(prev => {
      const parent = prev.find(n => n.id === parentId);
      if (!parent) return prev;
      const filtered = prev.filter(n => !isChildOf(n, parentId));
      const additions: DroneNode[] = chord.ratios.slice(1).map((r, idx) => {
        const ideal = parent.freq * r;
        const finalFreq = ideal;
        const outOfRange = finalFreq > stripHighHz * 1.001 || finalFreq < stripLowHz * 0.999;
        return {
          id: makeId(),
          freq: finalFreq,
          chordOf: parentId,
          chordIndex: idx + 1,
          outOfRange,
        };
      });
      return [...filtered, ...additions];
    });
    setMenuNodeId(null);
  };

  // ── Visual layout precomputation ──────────────────────────────────

  // Octave anchor labels (A_lowOct .. A_highOct) at exact A frequencies.
  const octaveTicks = Array.from({ length: highOct - lowOct + 1 }, (_, i) => {
    const oct = lowOct + i;
    return { x: xFromFreq(aOctaveHz(oct)), label: `A${oct}` };
  });

  // EDO grid + per-step note labels.  Iterate C-anchored EDO steps that
  // fall inside the active range.  Each step gets:
  //   - a vertical gridline through the strip body
  //   - a small note-name label below the strip (rotated -90 so dense
  //     EDOs like 41 / 53 don't collide horizontally)
  // P5 steps within each octave (the "G" of every octave) get a
  // brighter stroke so the user has a sub-octave reference.
  // Labels with double-accidentals or comma-arrows are filtered out
  // (`labelVisible = false`); the gridline still draws, only the text
  // is suppressed — keeps dense EDOs readable.
  const isSimpleLabel = (label: string): boolean => {
    if (/[𝄪𝄫↑↓]/.test(label)) return false;
    const sharpFlats = (label.match(/[♯♭]/g) ?? []).length;
    return sharpFlats <= 1;
  };
  // Active grid steps — either EDO steps (12/19/31/...) or 13-limit
  // JI ratios per octave, depending on gridMode.  Rendering and click-
  // snapping consume this unified list.
  type GridStep = { x: number; isP5: boolean; label: string; labelVisible: boolean; freq: number };
  const gridSteps: GridStep[] = [];
  if (showEdoGrid || showStepNames) {
    if (gridMode === "edo") {
      const minPc = Math.ceil(freqToAbsPc(stripLowHz, edo));
      const maxPc = Math.floor(freqToAbsPc(stripHighHz, edo));
      const p5Step = Math.round(edo * Math.log2(3 / 2));
      for (let pc = minPc; pc <= maxPc; pc++) {
        const f = absPcToFreq(pc, edo);
        const stepInOct = ((pc % edo) + edo) % edo;
        const label = pcToNoteName(stepInOct, edo);
        gridSteps.push({
          x: xFromFreq(f),
          isP5: stepInOct === p5Step,
          label,
          labelVisible: isSimpleLabel(label),
          freq: f,
        });
      }
    } else {
      // JI mode: place each curated 13-limit ratio at A_n × ratio for
      // every octave anchor in the strip range.  Octave anchors get
      // their A_n label; intermediate ratios get their fraction label.
      for (let oct = lowOct; oct <= highOct; oct++) {
        const baseFreq = aOctaveHz(oct);
        for (const r of JI_GRID_RATIOS) {
          const f = baseFreq * (r.num / r.den);
          if (f < stripLowHz * 0.999 || f > stripHighHz * 1.001) continue;
          const isOctaveAnchor = r.num === 1 && r.den === 1;
          if (isOctaveAnchor) continue;  // anchors drawn separately by octaveTicks
          gridSteps.push({
            x: xFromFreq(f),
            isP5: r.isP5 ?? false,
            label: r.label,
            labelVisible: true,
            freq: f,
          });
        }
      }
    }
  }
  // Backwards-compat alias for the rest of the render path.
  const edoSteps = gridSteps;

  // JI harmonic ruler — partials of A1 from h2 up to whatever fits in
  // A6 (h32 lands exactly on A6 since 32*55 = 1760).  Filtered by the
  // active prime limit: e.g. at limit=5, h7/h11/h13/h14/h17... drop
  // out so the ruler reflects what the user is actually willing to
  // hear as 'in tune'.  Subsets the dense upper region: above h16,
  // label only h20/h24/h28/h32.
  const jiTicks: { x: number; harmonic: number; labelled: boolean }[] = [];
  if (showJiRulers) {
    for (let h = 2; h <= 32; h++) {
      const f = stripLowHz * h;
      if (f > stripHighHz * 1.001) break;
      if (maxPrimeOf(h) > primeLimit) continue;
      const labelled = h <= 16 || h % 4 === 0;
      jiTicks.push({ x: xFromFreq(f), harmonic: h, labelled });
    }
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <p className="text-xs text-[#666]">
        Click anywhere on the strip to place a sustained drone between A1 (55 Hz) and A6 (1760 Hz).
        Multiple nodes drone simultaneously — train ordering low/high, hear real harmonic stacks, and
        compare JI ratios against the {edo}-EDO grid.
      </p>

      <div className="flex flex-wrap gap-3 items-center">
        <button
          onClick={() => setDroneOn(!droneOn)}
          className={`px-4 py-1.5 rounded text-xs font-semibold transition-colors ${
            droneOn
              ? "bg-[#55aa8833] border border-[#55aa88] text-[#55aa88]"
              : "bg-[#111] border border-[#2a2a2a] text-[#888]"
          }`}
        >
          {droneOn ? "● Drone on" : "○ Drone off"}
        </button>

        <div className="flex items-center gap-2">
          <label className="text-xs text-[#888]">Gain</label>
          <input
            type="range" min={0.02} max={0.5} step={0.01}
            value={gain}
            onChange={e => setGain(parseFloat(e.target.value))}
            className="w-32 accent-[#55aa88]"
          />
          <span className="text-[10px] text-[#666] tabular-nums w-8">{Math.round(gain * 100)}%</span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-[#888]">Instrument</label>
          <select
            value={instrument}
            onChange={e => setInstrumentState(e.target.value as DroneInstrument)}
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white focus:outline-none"
          >
            {DRONE_INSTRUMENTS.map(d => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={clearAll}
          disabled={!nodes.length}
          className="px-3 py-1.5 rounded text-xs bg-[#1e1e1e] border border-[#333] text-[#aaa] hover:bg-[#2a2a2a] disabled:text-[#444] disabled:cursor-not-allowed"
        >
          Clear ({nodes.length})
        </button>

        <div className="w-px h-4 bg-[#2a2a2a]" />

        <span className="text-[10px] text-[#555]">Range</span>
        <select
          value={lowOct}
          onChange={e => {
            const v = parseInt(e.target.value);
            setLowOct(v);
            if (v >= highOct) setHighOct(v + 1);
          }}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none"
        >
          {[0, 1, 2, 3, 4, 5, 6, 7].map(o => (
            <option key={o} value={o}>A{o}</option>
          ))}
        </select>
        <span className="text-[10px] text-[#555]">to</span>
        <select
          value={highOct}
          onChange={e => {
            const v = parseInt(e.target.value);
            setHighOct(v);
            if (v <= lowOct) setLowOct(v - 1);
          }}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none"
        >
          {[1, 2, 3, 4, 5, 6, 7, 8].map(o => (
            <option key={o} value={o}>A{o}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => setShowEdoGrid(!showEdoGrid)}
          className={`px-2 py-1 rounded text-[11px] border transition-colors ${
            showEdoGrid
              ? "border-[#7173e6] bg-[#7173e622] text-[#9999ee]"
              : "border-[#2a2a2a] bg-[#111] text-[#666] hover:text-[#aaa]"
          }`}
        >
          Grid
        </button>
        <div className="flex rounded overflow-hidden border border-[#333]">
          {(["edo", "ji"] as const).map(m => (
            <button key={m}
              onClick={() => setGridMode(m)}
              className={`px-2 py-1 text-[10px] transition-colors ${
                gridMode === m ? "bg-[#7173e6] text-white" : "bg-[#1e1e1e] text-[#888] hover:text-[#ccc]"
              }`}
              title={m === "edo"
                ? "Equal-temperament gridlines (12 / 19 / 31 / 41 / 53)"
                : "Just-intonation 13-limit ratio gridlines (1/1, 9/8, 5/4, 3/2, 7/4, …)"}
            >
              {m === "edo" ? "EDO" : "JI"}
            </button>
          ))}
        </div>
        {gridMode === "edo" && (
          <select
            value={localEdo}
            onChange={e => setLocalEdo(parseInt(e.target.value))}
            className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1.5 py-0.5 text-[11px] text-white focus:outline-none"
            title="EDO grid for this view (independent of the global EDO setting)"
          >
            {SUPPORTED_EDO_OPTIONS.map(n => (
              <option key={n} value={n}>{n}-EDO</option>
            ))}
          </select>
        )}
        <button
          onClick={() => setShowStepNames(!showStepNames)}
          className={`px-2 py-1 rounded text-[11px] border transition-colors ${
            showStepNames
              ? "border-[#7173e6] bg-[#7173e622] text-[#9999ee]"
              : "border-[#2a2a2a] bg-[#111] text-[#666] hover:text-[#aaa]"
          }`}
        >
          Step names
        </button>
        <button
          onClick={() => setSnapToEdo(!snapToEdo)}
          className={`px-2 py-1 rounded text-[11px] border transition-colors ${
            snapToEdo
              ? "border-[#7173e6] bg-[#7173e622] text-[#9999ee]"
              : "border-[#2a2a2a] bg-[#111] text-[#666] hover:text-[#aaa]"
          }`}
        >
          Snap to grid
        </button>
        <button
          onClick={() => setShowJiRulers(!showJiRulers)}
          className={`px-2 py-1 rounded text-[11px] border transition-colors ${
            showJiRulers
              ? "border-[#c8aa50] bg-[#c8aa5022] text-[#c8aa50]"
              : "border-[#2a2a2a] bg-[#111] text-[#666] hover:text-[#aaa]"
          }`}
        >
          JI harmonics of A{lowOct}
        </button>
        <button
          onClick={() => setShowSpectrum(!showSpectrum)}
          className={`px-2 py-1 rounded text-[11px] border transition-colors ${
            showSpectrum
              ? "border-[#88ccaa] bg-[#88ccaa22] text-[#88ccaa]"
              : "border-[#2a2a2a] bg-[#111] text-[#666] hover:text-[#aaa]"
          }`}
          title="Live spectrum: highlights where the playing drone's harmonics actually fall on the strip"
        >
          Spectrum
        </button>

        <div className="w-px h-4 bg-[#2a2a2a] mx-1" />

        <span className="text-[10px] text-[#555]">Labels</span>
        <div className="flex rounded overflow-hidden border border-[#333]">
          {(["both", "edo", "ji"] as const).map(m => (
            <button key={m}
              onClick={() => setLabelMode(m)}
              className={`px-2 py-1 text-[10px] transition-colors ${
                labelMode === m ? "bg-[#7173e6] text-white" : "bg-[#1e1e1e] text-[#888] hover:text-[#ccc]"
              }`}
            >
              {m === "both" ? "Both" : m === "edo" ? "EDO" : "JI"}
            </button>
          ))}
        </div>

        <span className="text-[10px] text-[#555]">Prime limit</span>
        <select
          value={primeLimit}
          onChange={e => setPrimeLimit(parseInt(e.target.value))}
          className="bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none"
        >
          {[5, 7, 11, 13, 17, 19, 23, 31].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

      </div>

      {instrument === "additive" && (
        <div className="bg-[#0c0c0c] border border-[#222] rounded px-3 py-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[#888] tracking-wider uppercase">Harmonic levels (h1–h16)</span>
            <div className="flex gap-1 flex-wrap">
              {Object.entries(ADDITIVE_PRESETS).map(([name, partials]) => (
                <button
                  key={name}
                  onClick={() => setAdditivePartials(partials)}
                  className="px-2 py-0.5 text-[10px] rounded bg-[#1e1e1e] border border-[#333] text-[#aaa] hover:bg-[#88ccaa22] hover:border-[#88ccaa] hover:text-[#88ccaa]"
                  title={
                    name === "Cello" ? "Bowed-string spectrum (warm, drone-y) — default"
                    : name === "Pad" ? "Smooth synth pad — gentle harmonic rolloff"
                    : name === "Hammond" ? "Hammond B3 full drawbars 888 888 888 — classic organ"
                    : name === "Mellow" ? "1/n² rolloff — soft sine-rich tone"
                    : name === "Square" ? "Only odd harmonics — hollow / clarinet-like"
                    : name === "Sawtooth" ? "1/n falloff — buzzy / brassy"
                    : name === "Sine" ? "Pure fundamental, no overtones"
                    : "All harmonics at unity amplitude (raw harmonic series)"
                  }
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-1 items-end">
            {additivePartials.map((v, i) => (
              <div key={i} className="flex flex-col items-center" style={{ width: 24 }}>
                <input
                  type="range"
                  min={0} max={1} step={0.01}
                  value={v}
                  onChange={e => {
                    const val = parseFloat(e.target.value);
                    setAdditivePartials(prev => {
                      const next = [...prev];
                      next[i] = val;
                      return next;
                    });
                  }}
                  className="accent-[#88ccaa]"
                  style={{
                    writingMode: "vertical-lr" as React.CSSProperties["writingMode"],
                    transform: "rotate(180deg)",
                    width: 18, height: 80, padding: 0,
                  }}
                />
                <span className="text-[9px] text-[#555] mt-1 font-mono">h{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div ref={containerRef} className="relative" style={{ width: "100%", height: SVG_H }}>
      <svg
        ref={stripRef}
        width={SVG_W}
        height={SVG_H}
        className="bg-[#0a0a0a] rounded border border-[#1a1a1a] select-none"
        style={{ display: "block" }}
        onClick={() => setMenuNodeId(null)}
      >
        {/* Centerline — single thin baseline through the strip. */}
        <line
          x1={STRIP_X} x2={STRIP_X + STRIP_W}
          y1={cy} y2={cy}
          stroke="#2a2a2a" strokeWidth={1}
        />

        {/* EDO step ticks — small discrete vertical lines centered on
            the baseline (snare-notation style).  Octave anchors at
            A1..A6 get longer ticks; P5 steps get a brighter color. */}
        {showEdoGrid && edoSteps.map((s, i) => (
          <line
            key={`edo${i}`}
            x1={s.x} x2={s.x}
            y1={cy - TICK_HALF} y2={cy + TICK_HALF}
            stroke={s.isP5 ? "#5a6e9a" : "#3a3a3a"}
            strokeWidth={s.isP5 ? 1 : 0.7}
          />
        ))}

        {/* Octave anchor ticks — taller than EDO step ticks; A1..A6
            label sits at the very top of the SVG so it doesn't fight
            the rotated step labels for vertical space. */}
        {octaveTicks.map(t => (
          <g key={t.label}>
            <line
              x1={t.x} x2={t.x}
              y1={cy - OCTAVE_TICK_HALF} y2={cy + OCTAVE_TICK_HALF}
              stroke="#888" strokeWidth={1.5}
            />
            <text
              x={t.x} y={14}
              fill="#aaa" fontSize={12} fontFamily="monospace" fontWeight={600}
              textAnchor="middle"
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* Per-EDO-step note labels — HORIZONTAL, sitting directly
            on top of each gridline just above the strip body.  No
            rotation: the user reads them straight without tilting.
            Double accidentals and comma-arrow notations (𝄪 / 𝄫 / ↑ /
            ↓) are hidden so dense EDOs stay readable; the gridlines
            themselves still draw at every step.  Octave digit
            dropped — A_n anchor labels at the very top imply octave. */}
        {showStepNames && edoSteps.filter(s => s.labelVisible).map((s, i) => (
          <text
            key={`name${i}`}
            x={s.x} y={STRIP_Y_TOP - 4}
            fill={s.isP5 ? "#9aa6cc" : "#aaa"}
            fontSize={11} fontFamily="monospace"
            textAnchor="middle"
          >
            {s.label}
          </text>
        ))}

        {/* JI harmonic ruler — above the strip.  Tick + h-number for
            each in-range partial of A1. */}
        {jiTicks.map(jt => (
          <g key={`ji${jt.harmonic}`}>
            <line
              x1={jt.x} x2={jt.x}
              y1={STRIP_Y_TOP - 22} y2={STRIP_Y_TOP - 4}
              stroke="#c8aa5066" strokeWidth={1}
            />
            {jt.labelled && (
              <text
                x={jt.x} y={STRIP_Y_TOP - 26}
                fill="#c8aa5099" fontSize={9} fontFamily="monospace"
                textAnchor="middle"
              >
                h{jt.harmonic}
              </text>
            )}
          </g>
        ))}

        {/* Per-node JI harmonic rulers — drawn through the strip body
            (vertical dotted lines at h2..h32 of each node whose ruler
            is toggled on).  Color-matched to the node so multiple
            simultaneous rulers stay distinguishable. */}
        {Array.from(nodeRulers).map(rulerId => {
          const src = nodes.find(n => n.id === rulerId);
          if (!src || src.outOfRange) return null;
          const color = src.chordOf
            ? "#cc7755"
            : src.harmonicOf ? "#7173e6" : "#55aa88";
          return (
            <g key={`ruler-${rulerId}`}>
              {Array.from({ length: 31 }, (_, i) => i + 2).map(h => {
                const f = src.freq * h;
                if (f < stripLowHz * 0.999 || f > stripHighHz * 1.001) return null;
                if (maxPrimeOf(h) > primeLimit) return null;
                const x = xFromFreq(f);
                const labelled = h <= 16 || h % 4 === 0;
                return (
                  <g key={`ruler-${rulerId}-${h}`}>
                    <line
                      x1={x} x2={x}
                      y1={STRIP_Y_TOP} y2={STRIP_Y_BOT}
                      stroke={color} strokeOpacity={0.55}
                      strokeWidth={0.8}
                      strokeDasharray="2 3"
                    />
                    {labelled && (
                      <text
                        x={x} y={STRIP_Y_TOP - 4}
                        fill={color} fontSize={8.5} fontFamily="monospace"
                        textAnchor="middle"
                        opacity={0.85}
                      >
                        h{h}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Live spectrum peaks — small glowing dots above the strip
            at each detected harmonic's x position.  Brightness scales
            with peak magnitude so loud partials read brighter. */}
        {showSpectrum && spectrumPeaks.map((p, i) => {
          const x = xFromFreq(p.freq);
          // Map dB mag from [-60..0] to opacity [0.3..1.0]
          const op = Math.max(0.3, Math.min(1, (p.mag + 60) / 60));
          return (
            <g key={`peak${i}`}>
              <circle
                cx={x} cy={cy - OCTAVE_TICK_HALF - 12}
                r={3.5}
                fill="#88ffcc"
                opacity={op}
              />
              <circle
                cx={x} cy={cy - OCTAVE_TICK_HALF - 12}
                r={6}
                fill="#88ffcc"
                opacity={op * 0.25}
              />
            </g>
          );
        })}

        {/* Invisible click-target rect spanning the strip's full
            vertical band — generous click zone even though the visible
            strip is just a thin row of ticks. */}
        <rect
          x={STRIP_X} y={STRIP_Y_TOP}
          width={STRIP_W} height={STRIP_H}
          fill="transparent"
          onClick={onStripClick}
          style={{ cursor: "crosshair" }}
        />

        {/* Nodes + per-node labels + out-of-range dots. */}
        {(() => {
          if (!nodes.length) return null;
          const inRange = nodes.filter(n => !n.outOfRange);
          const oor = nodes.filter(n => n.outOfRange);
          const sorted = [...inRange].sort((a, b) => a.freq - b.freq);
          const rootFreq = sorted[0]?.freq;

          // Out-of-range dots — sub-harmonics on the left margin,
          // super-harmonics on the right margin.  Stacked vertically
          // so series of multiple OOR partials don't overlap.
          const oorBelow = oor.filter(n =>  n.subharmonic);
          const oorAbove = oor.filter(n => !n.subharmonic);

          return (
            <>
              {oorBelow.map((n, i) => {
                const y = cy + (i - (oorBelow.length - 1) / 2) * 9;
                return (
                  <circle
                    key={n.id}
                    cx={STRIP_X - 14} cy={y} r={2.5}
                    fill="#444" stroke="#222" strokeWidth={0.5}
                  >
                    <title>1/{n.harmonicNum} = {n.freq.toFixed(1)} Hz (below A1 — visible only)</title>
                  </circle>
                );
              })}
              {oorAbove.map((n, i) => {
                const y = cy + (i - (oorAbove.length - 1) / 2) * 9;
                return (
                  <circle
                    key={n.id}
                    cx={STRIP_X + STRIP_W + 14} cy={y} r={2.5}
                    fill="#444" stroke="#222" strokeWidth={0.5}
                  >
                    <title>h{n.harmonicNum} = {n.freq.toFixed(1)} Hz (above A6 — visible only)</title>
                  </circle>
                );
              })}

              {inRange.map(n => {
                const x = xFromFreq(n.freq);
                const isRoot = rootFreq !== undefined && n.id === sorted[0].id;
                const isMenuOpen = menuNodeId === n.id;
                const edo_ = edoLabelFor(n.freq, edo);
                const ji = (isRoot || rootFreq === undefined)
                  ? null
                  : findJiRatio(n.freq / rootFreq, primeLimit, Math.max(300, primeLimit * primeLimit * 3));
                const ratioStr = isRoot
                  ? "1/1"
                  : (ji
                      ? formatJiRatio(ji)
                      : (rootFreq !== undefined
                          ? `+${(1200 * Math.log2(n.freq / rootFreq)).toFixed(1)}¢`
                          : ""));
                const edoStr = `${edo_.name}${
                  Math.abs(edo_.drift) < 1
                    ? ""
                    : ` ${edo_.drift >= 0 ? "+" : "−"}${Math.abs(edo_.drift).toFixed(1)}¢`
                }`;
                const rows: string[] = [`${n.freq.toFixed(1)} Hz`];
                if (labelMode !== "ji") rows.push(edoStr);
                if (labelMode !== "edo") rows.push(ratioStr);
                const fillColor = isRoot
                  ? "#c8aa50"
                  : (n.chordOf ? "#cc7755" : (n.harmonicOf ? "#7173e6" : "#55aa88"));
                return (
                  <g key={n.id}>
                    {/* Vertical highlight stripe through the strip body. */}
                    <line
                      x1={x} x2={x}
                      y1={STRIP_Y_TOP} y2={STRIP_Y_BOT}
                      stroke={fillColor} strokeWidth={1.5} opacity={0.55}
                    />
                    {/* Leader line from node down to its label group. */}
                    <line
                      x1={x} x2={x}
                      y1={STRIP_Y_BOT}
                      y2={NODE_LABEL_Y - 2}
                      stroke={fillColor} strokeWidth={0.5} opacity={0.4}
                    />
                    <circle
                      cx={x} cy={cy}
                      r={isMenuOpen ? 8 : 6}
                      fill={fillColor}
                      stroke={isMenuOpen ? "#fff" : "#0a0a0a"}
                      strokeWidth={2}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuNodeId(prev => prev === n.id ? null : n.id);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <title>Click for options.</title>
                    </circle>
                    {rows.map((text, i) => (
                      <text
                        key={i}
                        x={x}
                        y={NODE_LABEL_Y + i * 13 + 4}
                        fill={
                          i === 0 ? "#aaa"
                          : (rows[i] === ratioStr ? "#c8aa50" : "#9999ee")
                        }
                        fontSize={i === 0 ? 11 : 10}
                        fontFamily="monospace"
                        textAnchor="middle"
                      >
                        {text}
                      </text>
                    ))}
                  </g>
                );
              })}
            </>
          );
        })()}
      </svg>

      {(() => {
        if (!menuNodeId) return null;
        const node = nodes.find(n => n.id === menuNodeId);
        if (!node || node.outOfRange) return null;
        // Anchor the menu below the node, clamped horizontally so it
        // doesn't fall off either edge of the SVG.
        const x = xFromFreq(node.freq);
        const MENU_W = 240;
        const MENU_H_EST = 320;
        let left = x - MENU_W / 2;
        if (left < 4) left = 4;
        if (left + MENU_W > SVG_W - 4) left = SVG_W - 4 - MENU_W;
        // Prefer below the strip.  If that overflows, place above.
        const belowTop = NODE_LABEL_Y + NODE_LABEL_H + 4;
        const fitsBelow = belowTop + MENU_H_EST <= SVG_H + 200;  // allow brief overflow
        const top = fitsBelow ? belowTop : Math.max(4, STRIP_Y_TOP - MENU_H_EST - 4);
        return (
          <div
            className="absolute bg-[#161616] border border-[#3a3a3a] rounded shadow-lg p-2 space-y-1 z-10"
            style={{ left, top, width: MENU_W }}
            onClick={e => e.stopPropagation()}
          >
            <div className="text-[10px] text-[#777] px-1 pb-1 border-b border-[#2a2a2a]">
              Node @ {node.freq.toFixed(1)} Hz
            </div>

            <div className="text-[9px] text-[#666] px-1 pt-1">Harmonic series above</div>
            <div className="flex gap-1">
              {HARMONIC_PRESET_COUNTS.map(c => (
                <button key={c}
                  onClick={() => addHarmonicSeries(node.id, c, false)}
                  className="flex-1 px-1 py-1 text-[10px] rounded bg-[#1e1e1e] border border-[#333] text-[#aaa] hover:bg-[#7173e622] hover:border-[#7173e6] hover:text-[#9999ee]"
                >
                  h2-{c}
                </button>
              ))}
            </div>

            <div className="text-[9px] text-[#666] px-1 pt-1">Sub-harmonics below</div>
            <div className="flex gap-1">
              {HARMONIC_PRESET_COUNTS.map(c => (
                <button key={c}
                  onClick={() => addHarmonicSeries(node.id, c, true)}
                  className="flex-1 px-1 py-1 text-[10px] rounded bg-[#1e1e1e] border border-[#333] text-[#aaa] hover:bg-[#7173e622] hover:border-[#7173e6] hover:text-[#9999ee]"
                >
                  1/2-{c}
                </button>
              ))}
            </div>

            <button
              onClick={() => toggleNodeRuler(node.id)}
              className={`w-full px-2 py-1 text-[10px] rounded border transition-colors ${
                nodeRulers.has(node.id)
                  ? "bg-[#c8aa5022] border-[#c8aa50] text-[#c8aa50]"
                  : "bg-[#1e1e1e] border-[#333] text-[#aaa] hover:bg-[#c8aa5022] hover:border-[#c8aa50] hover:text-[#c8aa50]"
              }`}
            >
              {nodeRulers.has(node.id) ? "Hide" : "Show"} JI harmonics of this note
            </button>

            <div className="text-[9px] text-[#666] px-1 pt-1">
              Chord (root = this node, exact JI)
            </div>
            <div className="grid grid-cols-2 gap-1">
              {CHORD_LIBRARY.map(c => (
                <button key={c.id}
                  onClick={() => spawnChord(node.id, c)}
                  className="px-1 py-1 text-[9px] rounded bg-[#1e1e1e] border border-[#333] text-[#aaa] hover:bg-[#cc775522] hover:border-[#cc7755] hover:text-[#cc9966] text-left font-mono"
                  title={c.label}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="pt-1 border-t border-[#2a2a2a] flex gap-1">
              <button
                onClick={() => removeNode(node.id)}
                className="flex-1 px-2 py-1 text-[10px] rounded bg-[#2a1414] border border-[#552020] text-[#c08080] hover:bg-[#3a1818]"
              >
                Delete{nodes.some(n => isChildOf(n, node.id)) ? " (and its overlay)" : ""}
              </button>
              <button
                onClick={() => setMenuNodeId(null)}
                className="px-2 py-1 text-[10px] rounded bg-[#1e1e1e] border border-[#333] text-[#888]"
              >
                Close
              </button>
            </div>
          </div>
        );
      })()}
      </div>
    </div>
  );
}
