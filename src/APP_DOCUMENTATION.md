# Sound Audiation Trainer — Complete Application Documentation

## Overview

The Sound Audiation Trainer is a comprehensive ear training, music theory exploration, and rhythm pedagogy application built with React, TypeScript, Three.js, and VexFlow. It supports Equal Divisions of the Octave (EDOs 12, 17, 19, 31, 53), microtonal tuning systems, just intonation lattices, advanced rhythm training, and professional music notation — all running entirely in the browser via the Web Audio API.

**Tech stack:** React 18 · TypeScript · Tailwind CSS · shadcn/ui · Three.js + React Three Fiber · VexFlow · Web Audio API · pdfjs-dist · jsPDF

---

## File Architecture

```
src/
├── App.tsx                           # Main shell, routing, global state
├── main.tsx                          # React DOM entry point
├── index.css                         # Global styles
├── components/
│   ├── tabs/                         # 11 files — ear training tabs
│   ├── rhythm/                       # 9 files — rhythm/meter UI + visualizers
│   ├── tonal/                        # 4 files — functional harmony panels
│   ├── reading/                      # 8 files — PDF/EPUB reading workflow
│   ├── ui/                           # 50+ files — shadcn/ui component library
│   ├── UncommonMetersMode.tsx         # Weird time signatures container
│   ├── DrillResponse.tsx             # Gordon-style drill & response
│   ├── DrumPatterns.tsx              # Drum grid editor
│   ├── Konnakol.tsx                  # Solkattu/konnakol system
│   ├── ChordChart.tsx                # Chord chart builder
│   ├── NoteEntryMode.tsx             # Music notation input
│   ├── PhraseDecomposition.tsx       # Harmonic/melodic analysis
│   ├── LatticeView.tsx              # 3D JI lattice
│   ├── IntervalBrowser.tsx          # Xenharmonic interval encyclopedia
│   ├── MicrowaveMode.tsx            # Gamified interval exploration
│   ├── TemperamentExplorer.tsx      # Temperament visualization/analysis
│   ├── LumatoneKeyboard.tsx         # 256-key hexagonal keyboard
│   ├── PianoKeyboard.tsx            # 88-key piano visualization
│   ├── GuitarFretboard.tsx          # 6-string fretboard
│   ├── PitchContour.tsx             # Melodic contour graph
│   ├── AmbientViz.tsx               # Passive background visualizations
│   ├── SettingsModal.tsx            # Export/import, Google Drive sync
│   ├── StatsModal.tsx               # Practice statistics
│   ├── PresetBar.tsx                # Save/load instrument presets
│   ├── MetronomeStrip.tsx           # BPM control + beat indicator
│   ├── CountdownTimer.tsx           # Timed exercise timer
│   └── ...
├── hooks/
│   ├── useMetronome.ts              # Global metronome engine
│   ├── use-mobile.tsx               # Responsive breakpoints
│   └── use-toast.ts                 # Toast notifications
├── lib/
│   ├── audioEngine.ts               # Web Audio wrapper
│   ├── musicTheory.ts               # Multi-EDO theory engine
│   ├── edoData.ts                   # EDO-specific parameters
│   ├── tonalityBanks.ts             # Chord banks per tonality
│   ├── rhythmAudio.ts               # Rhythm audio synthesis
│   ├── rhythmEarData.ts             # Gordon rhythm exercises
│   ├── drumData.ts                  # Drum pattern system
│   ├── accentData.ts                # Accent study framework
│   ├── konnakolData.ts              # Solkattu data
│   ├── uncommonMetersData.ts        # 120+ weird time signatures
│   ├── latticeEngine.ts             # JI lattice math + 3D projection
│   ├── harmonicGraph.ts             # Harmonic series visualization
│   ├── tonnetzEngine.ts             # Neo-Riemannian tonnetz
│   ├── xenIntervals.ts              # Xenharmonic interval database
│   ├── hejiNotation.ts              # Helmholtz-Ellis accidentals
│   ├── edoTemperamentData.ts        # Temperament analysis database
│   ├── edoDescriptions.ts           # EDO historical context
│   ├── phraseReinterpretation.ts    # Reharmonization engine
│   ├── phraseDecompositionData.ts   # Harmonic analysis
│   ├── noteEntryData.ts             # Notation project system
│   ├── drumMusicXml.ts              # MusicXML export (drums)
│   ├── konnakolMusicXml.ts          # MusicXML export (konnakol)
│   ├── chordChartMusicXml.ts        # MusicXML export (chord charts)
│   ├── exportPdf.ts                 # PDF generation
│   ├── storage.ts                   # localStorage + useLS hook
│   ├── stats.ts                     # Practice statistics engine
│   ├── practiceLog.ts               # Session capture/restore
│   ├── googleDrive.ts               # Google Drive sync
│   ├── syncData.ts                  # Cross-device sync protocol
│   ├── lumatoneLayout.ts            # Lumatone hex layout
│   ├── groupingSelector.ts          # Rhythmic grouping generator
│   └── utils.ts                     # General utilities
└── pages/
    └── 404                          # Error page
```

**Total: ~171 TypeScript/TSX source files**

---

## 1. App Shell (`App.tsx`)

The main component manages:

- **Section navigation** — 13 major modes accessible via a section switcher:
  `ear-trainer` · `drill-response` · `uncommon-meters` · `drum-patterns` · `chord-chart` · `konnakol` · `note-entry` · `phrase-decomposition` · `lattice` · `interval-browser` · `microwave` · `temperament-explorer` · `reading-workflow`

- **Audio engine lifecycle** — Initializes Web Audio context, manages sample loading

- **Global metronome** — BPM control (40–200), visual beat indicator, start/stop

- **Drone system** — Sustain generator with:
  - Tonic control (any EDO pitch)
  - Drone modes: Single, Root+5th, Tanpura (harmonic series synthesis)
  - Pulse effects for rhythmic drones

- **Keyboard visualization** — Three instrument views:
  - Lumatone (256-key hexagonal)
  - Piano (88-key standard)
  - Guitar (6-string fretboard)

- **Statistics tracking** — Per-session, per-slot, per-option accuracy counters

- **Preset bar** — Save/load all instrument settings as named presets

- **Settings modal** — Export/import JSON backups, Google Drive auto-sync on tab visibility change

- **EDO selection** — Supports 12, 17, 19, 31, 53 EDO with full theory adaptation

---

## 2. Ear Trainer — Spatial Audiation (Section: `ear-trainer`)

The core ear training mode with 7 tabs:

### 2.1 Intervals Tab (`IntervalsTab.tsx`)

Trains interval recognition within the selected EDO.

**Configuration:**
- Play styles: Sequential, Dyad (simultaneous), Trichord, Random
- Number of notes: 1–6
- Selectable intervals from the EDO's full interval set
- Weighted random selection based on accuracy history

**Flow:** Select intervals → Play → Identify → Track accuracy per interval

### 2.2 Chords Tab (`ChordsTab.tsx`, ~1000 lines)

Two sub-modes:

**Isolated Chords:**
- Chord formula generation for the current EDO
- 10 voicing types: Close, Open Triad, Drop-2, Drop-3, Drop-2&4, Shell, Rootless, Spread, Quartal, Quintal
- Inversions and extensions (7th, 9th, 11th, 13th)
- Register modes: Fixed, Random Bass, Random Full
- Bass modes: Triad Only, Extensions Only, Both

**Functional Harmony:**
- Generates harmonic loops (I–V–vi–IV patterns)
- Function identification training
- Tonality selection: Major, Minor, Dorian, Phrygian, Lydian, Mixolydian, Aeolian, Locrian

**Data source:** `tonalityBanks.ts` — pre-composed chord shapes per EDO/tonality

### 2.3 Melody Tab (`MelodyTab.tsx`)

Melodic phrase learning and quiz:

**Phrase banks:**
- Generative families: Cadences, Pentatonic Hooks, Neighbor-Tone Cells, Triadic Shapes
- Folk/Pop Phrases, Pattern Scale Families

**Quiz modes:** Listen → multiple-choice identification
**Visual aid:** `PitchContour` component plots pitch contour with degree labels
**Controls:** Length filtering, scale family selection, mode/tonality

### 2.4 Jazz Tab (`JazzTab.tsx`)

Jazz improvisation cell training:

**Jazz families:**
- Chord Tone Arpeggios
- Enclosures
- Bebop Fragments
- Guide-Tone Lines

**Features:** Length filter, scale family, mode selection, weighted random based on answer history, visual contour display

### 2.5 Mode Identification Tab (`ModeIdentificationTab.tsx`)

Scale/mode ear training — identify Ionian, Dorian, Phrygian, Lydian, Mixolydian, Aeolian, Locrian by ear.

### 2.6 Patterns Tab (`PatternsTab.tsx`)

Pattern scale training covering:
- Japanese scales, Blues, Pentatonic, Whole-tone, and more
- Melodic and harmonic pattern recognition

### 2.7 Drone Tab (`DroneTab.tsx`)

Continuous drone accompaniment:
- Single note or harmonic series (Tanpura-style)
- Integration with oscillator and sample playback
- Used as background for all other ear training exercises

### Ear Trainer Data Flow

```
User selects options → stored in localStorage
Click "Play" → onPlay(optionKey, label) callback
App generates audio frames (arrays of pitch steps)
audioEngine.playSequence() → Web Audio API nodes
Keyboard highlights show pitches visually
User answers ✓/✗ → onAnswer() updates stats
Stats displayed in header + StatsModal
```

---

## 3. Drill & Response (Section: `drill-response`)

Combines three teaching methodologies in one interface:

### 3.1 Gordon Rhythm Training

Based on Edwin Gordon's Music Learning Theory:

| Panel | Exercise |
|-------|----------|
| **Comparison** | Same/different rhythm pattern pairs |
| **Metre** | Identify duple, triple, uneven, combined meters |
| **Beat Layers** | Decompose into macrobeat / microbeat / division |
| **Syllables** | Gordon solfège: Du / de / da / di |
| **Elongations & Rests** | Identify ties and rests within rhythm patterns |

**Audio:** `rhythmAudio.ts` synthesizes click patterns at metrical positions. Visual beat grid syncs with audio via `onBeat` callback.

**Visualization:** `AmbientViz.tsx` provides passive background rhythm grids during exercises.

### 3.2 Functional Harmony Training

| Panel | Exercise |
|-------|----------|
| **Comparison** | Same/different tonality pairs |
| **Function ID** | Identify Tonic / Subdominant / Dominant |
| **Chord Loops** | Recognize chord progression patterns |
| **Modulation** | Detect key changes |

### 3.3 Tuning/Temperament Identification

Integrates with the tuning system for ear-based temperament detection exercises.

---

## 4. Uncommon Meters / Weird Time Signatures (Section: `uncommon-meters`)

An interactive system for exploring 120+ unusual meters organized into a rigorous taxonomy.

### 4.1 Taxonomy: 3 Structural Layers × 27 Sub-Categories × 4 Periodicity Classes

#### Structural Layers

**Metric Layer** (12 categories) — Discrete grouping objects:
- `additive` — Unequal groups: (3+2+3)/8. Balkan, Stravinsky, prog rock
- `irrational` — Non-power-of-2 denominators: 4/3, 5/6. Ferneyhough, new complexity
- `fractional` — Non-integer numerators: 3.5/4, 2.25/8
- `prime` — Prime-based: 7/5, 11/8, 13/10
- `polymeter` — Simultaneous meters: 5/8 + 7/8
- `nested` — Metric modulation / fractal nesting
- `subdivision_tree` — Nonlinear trees: beat → 3 → 5 → 7
- `hybrid_grid` — Mixing binary, ternary, non-integer layers
- `graph_time` — Beats as graph/tree nodes
- `proportional` / `absolute_time` / `timeline` — Duration-based (seconds, not beats)

**Transformation Layer** (6 categories) — Temporal modifications:
- `continuous_tempo` — Accelerando, ritardando, logarithmic
- `elastic` — Dynamic beat stretching
- `phase_shift` — Reich-style offset
- `irrational_subdiv` — Tuplets of √2, π, φ
- `retrograde` — Reversed/palindromic
- `directed` — Signed/branching time

**Generative Layer** (9 categories) — Rule-based:
- `ratio` — 5:7, 17:12 polymetric ratios
- `real_number` — π/4, φ/5, e/8 irrational constants
- `algorithmic` — Euclidean rhythms, cellular automata, L-systems
- `stochastic` — Probability-based meter
- `non_terminating` — Infinite ratios: π/√2
- `fractal_time` — Self-similar: Cantor set, Sierpinski
- `limit_process` — Convergence-based meters
- `geometric` — Beats on curves (spirals, hyperbolas)
- `density` — Probability density distributions

#### Periodicity Classes (Orthogonal Axis)

| Class | Meaning | Can You Lock In? |
|-------|---------|------------------|
| **Periodic** | Repeats exactly every cycle | Yes |
| **Quasi-Periodic** | Eventually aligns via LCM | Maybe |
| **Aperiodic** | Never aligns at any timescale | No |
| **Non-Cyclic** | No repetition concept at all | No |

### 4.2 Data Structure: `TimeSigDef`

```typescript
interface TimeSigDef {
  id: string;                    // "add_3_2_3_8"
  category: TimeSigCategory;     // One of 27 sub-categories
  display: string;               // "(3+2+3)/8"
  description: string;           // Prose explanation
  totalBeats: number;            // Measure duration (can be fractional/irrational)
  groups: number[];              // [3, 2, 3] — how beats cluster
  tempoScale: number;            // BPM multiplier (1 = normal)
  isCustom?: boolean;
  tags?: string[];
  anchorMode?: AnchorMode;       // "single" | "multiple" | "none"
  polyLayers?: PolyLayer[];      // For polymeter sigs
  periodicityClass?: PeriodicityClass;
}
```

**Groups** — the heart of every time signature:
- `[3, 2, 3]` → three clusters of 3, 2, and 3 beats
- `[Math.PI]` → a single group of π ≈ 3.14159 beats
- `[0.74, 0.86, 1.03, 1.37]` → accelerating beats
- `[Math.SQRT2, Math.sqrt(3), Math.sqrt(5)]` → incommensurable durations

**Anchor Modes:**
| Mode | Meaning | Used by |
|------|---------|---------|
| `single` | One reference pulse | additive, irrational, prime, algorithmic |
| `multiple` | Competing pulses | ratio, polymeter, nested, phase_shift |
| `none` | No pulse, ungridded | elastic, proportional, stochastic, infinite |

**PolyLayers** — independent metric layers for polymeter/nested sigs:
```typescript
interface PolyLayer {
  label: string;       // "3/4"
  groups: number[];    // Beat grouping for this layer
  totalBeats: number;  // Cycle length (LCM of all layers)
  colorIdx?: number;   // Color hint
}
```

### 4.3 Built-In Signatures (120+)

| Category | Count | Examples |
|----------|-------|---------|
| Additive | 12 | (3+2+3)/8, (2+2+2+3)/8, (5+5+7)/16 |
| Irrational Denom. | 8 | 4/3, 5/6, 7/12, 3/5 |
| Fractional Numer. | 7 | 3.5/4, 2.25/8, 4.5/4 |
| Ratio | 7 | 5:7, 3:4, 7:11, 11:8 |
| Prime | 8 | 7/5, 11/8, 13/8, 17/16, 31/16 |
| Polymeter | 5 | 3 vs 4 poly, 5 vs 7 poly, Meshuggah 23/16 |
| Nested | 5 | 4/4→5/7 subdivisions, 7/8→φ subdivisions |
| Continuous Tempo | 6 | 4/4 accel (log), 4/4 rit (exp), φ-accel |
| Real-Number | 7 | π/4, φ/4, e/8, √2/4, τ/8 |
| Proportional | 5 | 3.2s, 5.0s, 1.5s, 7.0s, 2.7s |
| Subdivision Trees | 5 | 3→5, 2→3→5, Fibonacci tree |
| Phase Shift | 5 | 4/4 + ⅛ shift, Clapping Music, micro-drift |
| Algorithmic | 8 | E(5,8) cinquillo, E(3,8) tresillo, E(7,12) bell, Rule 30 |
| Infinite/Fractal | 7 | π/√2, Cantor 9, Fibonacci-grow, ζ(2)/4, e/π |

### 4.4 Pattern Generation

#### Static: `generateTimeSigPattern()`

Produces 4 event layers per group:

| Layer | Meaning | Visual/Audio role |
|-------|---------|-------------------|
| `macro` | Group start positions | Strong beats you feel |
| `micro` | Subdivisions within groups | Beats you count |
| `division` | Further subdivisions (2 per micro) | Finest grid level |
| `reference` | Steady click at integer beats | Polymetric contrast pulse |

For polymeter sigs, each `PolyLayer` generates independent events with a `polyLayerIdx` tag.

#### Evolving: `generateNthPattern(sig, bpm, i, layers)`

Stateless — given repetition index `i`, computes the correct pattern from scratch:

| Signature | Rule |
|-----------|------|
| Fibonacci-grow | Measure `i` has `fib(i)` beats: 1, 1, 2, 3, 5, 8, 13... |
| Clapping Music | Base [3,2,1,2,1,2,1] rotates by `i mod 7` |
| Phase drift | Groups widen: `g × (1 + gi/len × i × 0.005)` |
| Cantor set | Depth increases: `min(i+1, 6)`. Remove middle thirds recursively |
| √ chain | Each rep adds another √prime |
| Non-terminating | Precision increases by 1 decimal place per rep |
| Subdivision trees | Groups subdivided by next factor, capped at 64 |
| Rule 30 | Wolfram cellular automaton evolved `i` steps |

#### Anti-Collapse Playback Modes

| Mode | Effect |
|------|--------|
| **Clear** | Standard accents, stable timing — for learning |
| **Ambiguous** | 50% accent suppression, ±20ms jitter — tests internalization |
| **Non-Reducible** | Zero accents, cumulative √2×0.02 drift — true non-reducibility |

### 4.5 Audio: Click Timbres

| Layer | Frequency | Decay | Gain |
|-------|-----------|-------|------|
| Accent (cycle start) | 1400→400 Hz | 140ms | 1.0 |
| Group start | 1000→350 Hz | 100ms | 0.75 |
| Macro | 900→300 Hz | 80ms | 0.55 |
| Micro | 1200→600 Hz | 50ms | 0.4 |
| Division | 1600→1000 Hz | 35ms | 0.25 |
| Rest | 400→200 Hz | 20ms | 0.1 |
| Reference | 600→200 Hz | 120ms | 0.5 |

Poly-layer sigs get distinct timbres: layer 2 = low woodblock (500→150 Hz), layer 3 = clap-like (800→500 Hz).

### 4.6 Visualizations

**CircleTimeSigVisualizer (Clock-Face):**
- Beats around a circle, angle = (beatPos/totalBeats) × 2π − π/2
- Group arcs (colored, 70% active / 25% inactive)
- Beat dots (6px group starts, 3.5px subdivisions, white active with glow)
- Sweep hand following playback
- Progress trail arc
- Center label: category icon + name + beat count
- `ReferenceCircle`: secondary circle showing steady equal-beat pulse (golden #ddaa55)
- `PolyLayerCircle`: one circle per poly-layer with independent tracking

**TimeSigVisualizer (Linear Timeline):**
- Compact mode: icon + name + category badge + mini beat bar
- Full mode: group structure bar, grouping formula with color-coded numbers, beat timeline with vertical markers, perceptual resistance bars
- Perceptual resistance metrics (0–1): Pulse Clarity, Periodicity, Symmetry, Reducibility
- `PolyLayerTimeline`: linear view per layer in polymeter sigs

### 4.7 UI: Browse & Learn + Custom Builder

**Browse & Learn:**
- Structural layer filter tabs (all / metric / transformation / generative)
- Sub-category filter, periodicity filter
- Playback options: palate cleanser, reference grid, reference audio, micro beats
- Compact view for unselected sigs, expanded view for selected
- Static sigs repeat 4×, evolving sigs play infinitely with "Rep N" counter

**Custom Builder:**
- Category dropdown, display name, grouping input (`3+2+3`, `3,2,3`, `3 2 3`, `(3+2+3)`, `2.5+1.5`)
- Tempo scale (0.1–4.0), description
- 8 quick presets: 5/8 aksak, 7/8 Balkan, 11/8, 4/3 Ferneyhough, π beats, 3.5/4, 13/8 Turkish, 5:7 poly
- Preview → Play → Save to localStorage (`lt_weird_ts_custom`)

### 4.8 Exercise System (5 types)

1. **Identify Category** — Listen, pick the sub-category
2. **Identify Grouping** — Hear additive/prime sig, identify the grouping pattern (e.g. "3+2+3")
3. **Count Beats** — Count total beats (3–17, ±2 distractors)
4. **Compare Signatures** — Which of two sigs has a longer measure?
5. **Feel the Pulse** — Count strong beats (group starts)

### 4.9 Mathematical Foundations

**Euclidean Rhythms:** E(k,n) = k onsets maximally distributed in n slots. E(3,8) = tresillo, E(5,8) = cinquillo, E(7,12) = West African bell pattern.

**Rule 30:** Wolfram cellular automaton on 8-cell ring. Run-length encoding → beat groups. Each rep evolves one generation.

**Cantor Set:** At depth d, 3^d slots, recursively remove middle thirds. Remaining slots → groups scaled to 9 beats. Fractal silence.

**Fibonacci Growing:** Measure i has fib(i) beats. Measures grow: 1, 1, 2, 3, 5, 8, 13...

**Phase Drift:** `g × (1 + groupIndex/length × repIndex × 0.005)` — imperceptible at first, clearly audible after 10+ reps.

**Non-Terminating Precision:** Each rep adds 1 decimal place of the irrational constant. Asymptotically approaches true value.

---

## 5. Drum Patterns (Section: `drum-patterns`)

Advanced drum notation and performance interface (~1000 lines).

**Four drum voices:** Ostinato, Snare, Bass, Hi-Hat

**Features:**
- Grid-based editing: 4, 8, 16, 32-note subdivisions
- Permutation system: predefined rhythmic patterns per grid type
- Open/closed controls for hi-hat pedal and ghost notes
- Double hits and accents with fine-grained dynamics
- Pool presets: save/load custom patterns
- Accent studies imported from transcriptions
- MusicXML export via `drumMusicXml.ts`
- Real-time VexFlow staff rendering

---

## 6. Solkattu / Konnakol (Section: `konnakol`)

Indian rhythmic vocal training system with 3 sub-modes:

### 6.1 Subdivisions (`KonnakolBasicPanel.tsx`)
- Indian solfège syllables: Tat, Janu, Dha, Gina
- Rhythmic pattern generation with accent/weight control

### 6.2 Cycles (`KonnakolCyclesPanel.tsx`)
- Tala cycles: Trisra, Tisra, Khandam (various beat cycles)
- Phrase cycling and repetition
- Time signature mapping to talas

### 6.3 Mixed Groups (`KonnakolMixedPanel.tsx`)
- Combines multiple tala cycles
- Complex rhythmic permutations
- Practice logs and export

**Notation:** VexFlow rendering via `KonnakolNotation.tsx`
**Export:** MusicXML via `konnakolMusicXml.ts`

---

## 7. Chord Chart Builder (Section: `chord-chart`)

- Create custom chord progressions for practice
- Time signature support (4/4, 3/4, 7/8, custom)
- Per-bar chord notation
- Save/load charts from localStorage
- MusicXML export via `chordChartMusicXml.ts`

---

## 8. Note Entry / Quick Transcriptions (Section: `note-entry`)

Professional music notation input using VexFlow (~1000 lines):

- **Staff editing:** Treble/bass clef
- **Note input:** Mouse/keyboard entry with duration selection
- **Durations:** Whole, half, quarter, eighth, 16th, 32nd
- **Rests, dots, accidentals** (sharps, flats, naturals)
- **Tuplets:** Triplets and other groupings
- **Project management:** Save/load transcription projects
- **YouTube sync:** Embed video for transcription analysis
- **Export:** PDF (jsPDF) and MusicXML

---

## 9. Phrase Decomposition (Section: `phrase-decomposition`)

Advanced harmonic and melodic analysis tool (~1000 lines):

**Core features:**
- Chord assignment to phrase notes
- Function identification: Tonic, Subdominant, Dominant, Passing, Approach

**20+ reinterpretation operations:**
- Diatonic/chromatic transposition
- Melodic sequencing
- Interval transformation
- Scale reinterpretation
- Reharmonization
- Note insertion/deletion
- Phrase simplification & fragmentation
- Registration shifting
- Approach note addition
- Motivic development
- Density modulation
- Style presets

**Visualization:** VexFlow staff with harmonic function labels
**Engine:** `phraseReinterpretation.ts` (~1000 lines)

---

## 10. Lattice View / 11-Limit Harmonic Space (Section: `lattice`)

3D interactive JI lattice using Three.js + React Three Fiber (~1000 lines):

**Visualization modes:**
- Monzo lattices: otonality, utonality, comma clusters, harmonic series
- Tonnetz: neo-Riemannian voice-leading graphs
- Temperament overlay: EDO tempering on JI lattices
- Multiple harmonic stacks

**3D controls:**
- OrbitControls for camera panning/rotation
- Arrow key navigation
- Mouse click → hear the ratio
- Hover → ratio details (cents, factorization, names)

**Data sources:** `latticeEngine.ts`, `harmonicGraph.ts`, `tonnetzEngine.ts`

---

## 11. Interval Browser (Section: `interval-browser`)

Xenharmonic interval encyclopedia:

- 12–127 limit ratios browsable
- EDO mapping: which EDOs approximate each interval
- Deviation display: cents sharp/flat vs. EDO steps
- Harmonic/subharmonic series exploration
- HEJI notation (Helmholtz-Ellis JI accidentals)
- Click to hear each interval
- Data: `xenIntervals.ts`, `hejiNotation.ts`

---

## 12. Temperament Explorer (Section: `temperament-explorer`)

Deep temperament visualization and analysis (~1500 lines), with 4 sub-modes:

### 12.1 Temper Lab

Animated 3D lattice showing comma tempering in real time.

**How it works:**
1. JI lattice built from prime exponent vectors (monzos)
2. Commas selected for the EDO (e.g., 81/80 syntonic comma)
3. Projection matrix `P = I − Cᵀ(CCᵀ)⁻¹C` collapses comma directions
4. Nodes animate from JI positions to tempered positions
5. Equivalent nodes merge and share colors
6. Sequential comma application shows progressive collapse

**Math:**
- Smith Normal Form determines equivalence classes
- Invariant factors reveal cyclic group structure
- |det(comma matrix)| = number of EDO pitch classes
- Gram-Schmidt fallback for dependent commas

### 12.2 EDO Temper

Per-EDO deep dive:
- Description, intervals, commas, bounds
- Audio playback of all notes in the EDO
- Accidental system for non-12-EDO (HEJI)
- Harmonic deviation analysis
- Basis vs. dependent commas displayed
- Inline lattice preview with "show tempered" toggle

### 12.3 Fifth Quality

- Convergence of fifths across all EDOs
- Historical temperament families
- Syntonic vs. pythagorean comma comparison

### 12.4 Ring Map

- Ring/cycle structure for all EDOs
- Algebraic factorization display
- Prime limit analysis

**Data:** `edoTemperamentData.ts` (comma database, EDO classification, convergence analysis), `edoDescriptions.ts` (2000+ lines of historical context)

---

## 13. Microwave Mode (Section: `microwave`)

Gamified interval/scale exploration:

- "Cook" intervals: set timer, grow food emoji while running
- Solkattu-style pulses fire during cooking
- 3D spinning display with random philosopher images
- Explosion effects on timer expiration
- Xeno interval drones: randomly selected microtonal sustain tones
- Emoji-based scoring

---

## 14. Audio Engine (`lib/audioEngine.ts`)

Comprehensive Web Audio API wrapper (~300 lines):

**Capabilities:**
- **Note playback:** Sampled (C4.wav pitch-shifted) or synthesized (triangle wave fallback)
- **Chord generation:** Multi-note simultaneous playback
- **Sequence playback:** Sequential frames with configurable gap timing
- **Drone generation:** Tambura-style harmonic synthesis using `PeriodicWave`
- **Interval drones:** Per-note harmonic series for 11-limit exploration
- **Equal-loudness compensation:** Fletcher-Munson correction for low frequencies

**Pitch system:** All values in absolute steps. C4 = 4 × EDO in the system.

---

## 15. Music Theory Engine (`lib/musicTheory.ts`)

Comprehensive multi-EDO theory engine (~1200 lines):

- **Chord analysis:** `getAllChordsForEdo()` — generates all valid chord formulas
- **Voicing algorithms:** 10 types (Close, Drop-2, Drop-3, Drop-2&4, Shell, Rootless, Spread, Quartal, Quintal, Open Triad)
- **Scale families:** Major, Minor, Harmonic Minor, Melodic Minor, Jazz, Blues, Japanese, Pentatonic, Whole-tone, and more
- **Melodic phrase banks:** Cadences, Pentatonic Hooks, Neighbor-Tone Cells, Triadic Shapes
- **Jazz cell generation:** Chord tones, Enclosures, Bebop fragments, Guide-tone lines
- **Tonality randomization** with weighted selection based on accuracy
- **Note name generation** for any EDO

---

## 16. EDO Data (`lib/edoData.ts`)

EDO-specific parameters for 12, 17, 19, 31, 53 (~600 lines):

- Degree maps (which steps map to which scale degrees)
- Interval name lists per EDO
- Diatonic structure parameters (T, s, A1)
- Chord shape definitions
- Time signature patterns for rhythm exercises
- Mode degree maps (Ionian through Locrian for each EDO)

---

## 17. Rhythm Audio (`lib/rhythmAudio.ts`)

Rhythm audio synthesis engine (~300 lines):

- Rhythmic cell playback with Gordon solfège (Ta, te, ka, di)
- Metrical grouping patterns
- Tempo/BPM synchronization
- Comparison exercises (A vs. B playback)
- `playPattern(pattern, onDone, repeats)` — finite playback
- `playInfiniteSequence(generator, onNewRep)` — indefinite evolving playback
- `computeEventTimes()` — maps beat positions to absolute timestamps

---

## 18. State Management

**No Redux or Context** — uses:
- `useLS()` hook — drop-in `useState` replacement with localStorage persistence
- `useState` for immediate UI state
- `useRef` for non-rerender data (timers, audio nodes)
- `useMemo` / `useCallback` for optimization
- Custom event emitter for cross-component navigation: `window.dispatchEvent("app-navigate", {detail: section})`

### Persistence Keys (Selection)

| Key Pattern | Purpose |
|-------------|---------|
| `lt_rhy_*` | Rhythm/meter settings |
| `lt_weird_ts_custom` | Custom time signatures |
| `lt_drum_*` | Drum pattern settings |
| `lt_konnakol_*` | Solkattu settings |
| `lt_chord_chart_*` | Chord chart data |
| `lt_note_entry_*` | Transcription projects |
| `lt_preset_*` | Instrument presets |
| `lt_stats_*` | Practice statistics |

### Google Drive Sync

- OAuth2 token management
- Payload built from all localStorage keys
- Upload/download via Drive API
- Auto-sync on browser visibility change
- Timestamp-based merge conflict resolution

---

## 19. Keyboard Visualizations

### Lumatone (`LumatoneKeyboard.tsx`)
- 256-note hexagonal layout
- Pitch highlight on play
- Mouse/touch interaction
- Color-coded octaves
- Layout generated by `lumatoneLayout.ts`

### Piano (`PianoKeyboard.tsx`)
- Standard 88-key piano
- Highlight on play

### Guitar (`GuitarFretboard.tsx`)
- 6-string, 24-fret fretboard
- Highlight on play

All three respond to the same audio events and highlight the same pitches.

---

## 20. Notation & Export

| Format | Generator | Used By |
|--------|-----------|---------|
| VexFlow staff | Real-time rendering | Note Entry, Drum Patterns, Konnakol, Chord Charts |
| MusicXML | `drumMusicXml.ts`, `konnakolMusicXml.ts`, `chordChartMusicXml.ts` | Export for notation software |
| PDF | `exportPdf.ts` (jsPDF) | Printable scores |
| JSON | localStorage | Project save/load |

---

## 21. Practice Statistics (`lib/stats.ts`, `lib/practiceLog.ts`)

- Daily stats: correct/wrong per option
- Weighted random selection based on accuracy history (weaker areas appear more)
- Accuracy calculation and session logging
- Session capture/restore for interrupted sessions
- Practice log entries with timestamps, scores, modes
- Stats aggregation and filtering in `StatsModal`

---

## 22. Composer & Cultural References

Every sub-category in the meters system links to composers and traditions:

| Category | Composers / Traditions |
|----------|----------------------|
| Additive | Stravinsky, Bartók, Balkan folk, Tool, King Crimson |
| Irrational | Ferneyhough, Nancarrow, Thomas Adès |
| Polymeter | Nancarrow, Ligeti, Stravinsky, Carter, Meshuggah |
| Phase shift | Steve Reich, Terry Riley, minimalism |
| Algorithmic | Toussaint (Euclidean), Xenakis, Wolfram, West African drumming |
| Proportional | John Cage, Earle Brown, Feldman |
| Stochastic | Xenakis, Cage (chance operations) |
| Real-number | Generative music, DSP synthesis |

---

## Summary

The application provides:

- **7 ear training tabs** with adaptive difficulty and weighted random
- **13+ specialized practice modes** covering melody, harmony, rhythm, tuning, and theory
- **120+ weird time signatures** with rigorous mathematical taxonomy
- **Professional notation** via VexFlow with MusicXML/PDF export
- **3D interactive lattices** for JI and temperament visualization
- **Multi-EDO support** (12, 17, 19, 31, 53) with full theory adaptation
- **Rhythm pedagogy** spanning Gordon, Solkattu, drum patterns, and uncommon meters
- **Statistical tracking** with adaptive learning
- **Cloud sync** via Google Drive
- **Three instrument visualizations** (Lumatone, Piano, Guitar)

All audio runs in-browser via the Web Audio API with no external dependencies. State persists via localStorage with optional Google Drive backup.
