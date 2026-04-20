# Weird Time Signatures Mode — Complete Documentation

## Overview

The Weird Time Signatures mode is an interactive system for exploring, learning, and creating unusual meters that go far beyond standard 4/4 or 3/4. It covers **135+ built-in time signatures** organized into a mathematically rigorous taxonomy with two orthogonal classification axes: **structural layer** (what it IS) and **periodicity class** (whether it repeats).

The system spans 4 files:

| File | Purpose |
|------|---------|
| `WeirdTimeSigPanel.tsx` | Main UI — Browse & Learn + Custom Builder views |
| `CircleTimeSigVisualizer.tsx` | Circular (clock-face) beat visualization |
| `TimeSigVisualizer.tsx` | Linear (timeline) beat visualization |
| `weirdTimeSigData.ts` | Data, taxonomy, pattern generation, exercises, custom sig support |

---

## 1. Taxonomy: 3 Structural Layers × 27 Sub-Categories × 4 Periodicity Classes

### The Problem with "Time Signature"

These 135+ entries are not all "time signatures" in the traditional sense. They span three fundamentally different mathematical categories:

| Type | What it is | Example |
|------|-----------|---------|
| **Metric structure** | Discrete grouping object | (3+2+3)/8 |
| **Temporal transformation** | Modification of a pulse | accelerando, phase shift |
| **Generative process** | Rule that produces rhythm | Euclidean, Rule 30, Cantor |

The system formalizes this distinction with 3 **structural layers**.

### Structural Layers (Primary Axis)

| Layer | Description | What belongs here |
|-------|-------------|-------------------|
| **Metric** | Discrete grouping objects — meters built from countable beat clusters, polymetric layers, or graph-structured time | additive, irrational, fractional, prime, polymeter, nested, subdivision trees, graph time, proportional |
| **Transformation** | Temporal modifications — continuous, phase-based, or directional changes applied to an underlying pulse | continuous tempo, elastic, phase shift, irrational subdivisions, retrograde, directed |
| **Generative** | Rule-based and algorithmic — meter emerges from a process, formula, probability field, or mathematical constant | ratio, real-number, algorithmic, stochastic, non-terminating, fractal, limit process, geometric, density |

### Periodicity Classes (Orthogonal Axis)

Every signature also has a **periodicity class** — independent of its structural layer:

| Class | Meaning | Examples |
|-------|---------|----------|
| **Periodic** | Repeats exactly every cycle. The brain can lock on. | (3+2+3)/8, E(5,8), palindrome |
| **Quasi-Periodic** | Eventually aligns via LCM. Long-range periodicity. | 3 vs 4 polymeter, 5:7 ratio |
| **Aperiodic** | Never aligns at any timescale. No periodic reduction possible. | π/4, √2→√3→√5, Cantor set |
| **Non-Cyclic** | No repetition concept at all. Each moment is unique. | 3.2 seconds, stochastic, graph time, density |

### Sub-Categories (all 27)

**Metric Layer (12):**
- `additive` — Unequal groups: (3+2+3)/8. Balkan, Stravinsky, prog rock.
- `irrational` — Non-power-of-2 denominators: 4/3, 5/6. Ferneyhough, new complexity.
- `fractional` — Non-integer numerators: 3.5/4, 2.25/8. Electroacoustic scores.
- `prime` — Prime-based: 7/5, 11/8, 13/10. Microtonal / lattice rhythm.
- `polymeter` — Multiple simultaneous meters: 5/8 + 7/8. Interference patterns.
- `nested` — Metric modulation / fractal: 4/4 → 5/7 subdivisions.
- `subdivision_tree` — Nonlinear trees: beat → 3 → 5 → 7.
- `hybrid_grid` — Mixing binary, ternary, and non-integer layers.
- `graph_time` — Beats as graph/tree nodes, not linear sequence. **NEW**
- `proportional` — Time in seconds. Cage, Brown, graphic scores.
- `absolute_time` — Events at exact timestamps, no pulse.
- `timeline` — Events on a continuous time axis.

**Transformation Layer (6):**
- `continuous_tempo` — Beat spacing changes within a measure: accel, rit, logarithmic.
- `elastic` — Beats stretch/compress dynamically. No fixed grid.
- `phase_shift` — Reich-style: two identical meters offset in time.
- `irrational_subdiv` — Tuplets of √2, π, φ. Never align to integer grids.
- `retrograde` — Reversed / negative time segments. Palindromic structures. **NEW**
- `directed` — Signed / branching time. Forward-backward alternation. **NEW**

**Generative Layer (9):**
- `ratio` — Polymetric ratios: 5:7, 17:12. Nancarrow player piano studies.
- `real_number` — Irrational constants: π/4, φ/5, e/8. Computer-only playback.
- `algorithmic` — Euclidean rhythms, cellular automata, L-systems.
- `stochastic` — Probability-based meter.
- `non_terminating` — Infinite ratios: π/√2. No periodic alignment ever.
- `fractal_time` — Self-similar: Cantor set rhythms, Sierpinski timing.
- `limit_process` — Meter as convergence of an infinite sequence.
- `geometric` — Beats on mathematical curves: spirals, hyperbolas. **NEW**
- `density` — Probability density as rhythm: Gaussian, Poisson, max-entropy. **NEW**

---

## 2. The TimeSigDef Data Structure

Every time signature (built-in or custom) is a `TimeSigDef`:

```typescript
interface TimeSigDef {
  id: string;                    // Unique identifier, e.g. "add_3_2_3_8"
  category: TimeSigCategory;     // One of the 27 sub-categories
  display: string;               // Display name, e.g. "(3+2+3)/8"
  description: string;           // Prose explanation
  totalBeats: number;            // Measure duration in abstract beat units
  groups: number[];              // How beats cluster, e.g. [3, 2, 3]
  tempoScale: number;            // BPM multiplier (1 = normal, 0.5 = half speed)
  isCustom?: boolean;            // User-created?
  tags?: string[];               // Filter tags, e.g. ["balkan", "aksak"]
  anchorMode?: AnchorMode;       // Override: "single" | "multiple" | "none"
  polyLayers?: PolyLayer[];      // For polymeter sigs: independent layers
  periodicityClass?: PeriodicityClass; // Override periodicity (defaults to category default)
}
```

### Groups: The Core Concept

The `groups` array is the heart of every time signature. It defines how the measure's beats are clustered:

- `[3, 2, 3]` → three groups of 3, 2, and 3 beats = 8 total
- `[Math.PI]` → a single group of π ≈ 3.14159 beats
- `[0.74, 0.86, 1.03, 1.37]` → accelerating beats (each group is one beat with different duration)
- `[Math.SQRT2, Math.sqrt(3), Math.sqrt(5)]` → three incommensurable durations

Groups can be **non-integer** (fractional, irrational) and **unequal** (additive). The system handles all of these uniformly — it rounds to integer steps for subdivision purposes but preserves fractional durations for timing.

### Anchor Modes

Each sub-category has a default anchor mode controlling how the listener perceives the pulse:

| Mode | Meaning | Used by |
|------|---------|---------|
| `single` | One reference pulse (metronome click) | additive, irrational, prime, algorithmic |
| `multiple` | Competing pulses (stereo/two colors) | ratio, polymeter, nested, phase_shift |
| `none` | No pulse — floating, ungridded | elastic, proportional, stochastic, infinite |

### PolyLayers: Multi-Layer Meters

Polymeter and nested sigs use `polyLayers` to define independent metric layers that run simultaneously:

```typescript
interface PolyLayer {
  label: string;       // e.g. "3/4"
  groups: number[];    // Beat grouping for this layer
  totalBeats: number;  // Cycle length for this layer
  colorIdx?: number;   // Color hint (index into GROUP_COLORS)
}
```

Example — "3 vs 4 polymeter":
```typescript
polyLayers: [
  { label: "3/4", groups: [3, 3, 3, 3], totalBeats: 12, colorIdx: 0 },
  { label: "4/4", groups: [4, 4, 4],     totalBeats: 12, colorIdx: 1 },
]
// Both layers share totalBeats = LCM(3*4, 4*3) = 12
// Downbeats coincide every 12 beats
```

---

## 3. Built-In Signatures (120+)

### Signatures Meta-Category

**Additive (12 sigs):**
(3+2+3)/8, (2+2+2+3)/8, (3+3+2)/8, (2+3+2+2)/8, (5+5+7)/16, (3+2+2)/7, (2+3)/8, (3+2+2+3+2)/8, (2+2+3)/8, (4+3+3+2)/8, (3+3+3+2)/8, (2+3+2+3)/8

**Irrational Denominator (8 sigs):**
4/3, 5/6, 7/12, 3/5, 4/6, 3/10, 6/5, 5/3

**Fractional Numerator (7 sigs):**
3.5/4, 2.25/8, 4.5/4, 1.75/4, 5.5/8, 2.33/4, 6.25/8

**Ratio (7 sigs):**
5:7, 3:4, 7:11, 5:3, 4:7, 11:8, 8:5

**Prime (8 sigs):**
7/5, 11/8, 13/8, 17/16, 31/16, 5/4, 19/16, 23/8

### Layered Meta-Category

**Polymeter (5 sigs):**
- 3 vs 4 poly — 3/4 + 4/4, downbeats every 12 beats
- 5 vs 7 poly — 5/8 + 7/8, cycle every 35 beats
- 3+4+5 poly — Triple polymeter, cycle every 60 beats
- Meshuggah 23/16 — 23-note guitar riff over 4/4 drums
- 4/4 vs 7/8 — Stravinsky-like metric dissonance, cycle every 28

**Nested (5 sigs):**
- 4/4 → 5/7 subdivisions
- 3/4 → √2 subdivisions (irrational nesting)
- 5/4 vs 3/4 nesting
- 7/8 → φ subdivisions (golden ratio)
- 3/4 → [2+3]/5 → 7/8 (three nesting levels)

### Continuous Meta-Category

**Continuous Tempo (6 sigs):**
- 4/4 accel. (logarithmic), 4/4 rit. (exponential)
- 6 log-spaced, 5 exp-spaced, 8 sine-wave (breathing)
- φ-accel (golden ratio spiral compression)

**Real-Number (7 sigs):**
π/4 (≈3.14), φ/4 (≈1.618), e/8 (≈2.718), √2/4 (≈1.414), ln(2)/4 (≈0.693), √5/4 (≈2.236), τ/8 (≈6.283)

### Duration Meta-Category

**Proportional (5 sigs):**
3.2 seconds, 5.0 seconds, 1.5 seconds, 7.0 seconds, 2.7 seconds

### Subdivision Meta-Category

**Subdivision Trees (5 sigs):**
3→5 tree, 2→3→5 tree, [3,5,7] nonuniform, [2,3,5,7] prime tree, Fibonacci tree

### Process Meta-Category

**Phase Shift (5 sigs):**
- 4/4 + ⅛ shift (Reich canon), 12/8 gradual drift
- Clapping Music (3+2+1+2, rotates each cycle)
- 5/8 + 1 shift, micro-drift (1.01× per beat)

**Algorithmic / Euclidean (8 sigs):**
- E(5,8) — Cuban cinquillo
- E(3,8) — Cuban tresillo
- E(7,12) — West African bell pattern / major diatonic
- E(5,12) — Pentatonic rhythm
- E(7,16) — Brazilian samba timeline
- E(9,16) — Dense 9-in-16
- E(11,24) — Long-cycle compound
- Rule 30 × 8 — Wolfram cellular automaton

### Infinite Meta-Category (7 sigs)

π/√2 (doubly irrational), Cantor 9 (fractal silence), Fibonacci-grow (expanding measures), √2→√3→√5 (incommensurable chain), ζ(2)/4 (Riemann zeta), ρ meter (plastic ratio), e/π (open mathematical problem)

---

## 4. Pattern Generation

### Static Patterns: `generateTimeSigPattern()`

Converts a `TimeSigDef` into a `RhythmPattern` (array of `RhythmEvent` objects sorted by beat position).

**Three layers of events are generated per group:**

1. **Macro beats** (`layer: "macro"`) — Placed at the start of each group. First beat of the measure gets `accent: true`. These are the "strong beats" you feel.

2. **Micro beats** (`layer: "micro"`) — Subdivisions within each group. A group of size 3 gets micro beats at positions 0, 1, 2 within the group. These are the "subdivisions" you count.

3. **Division beats** (`layer: "division"`) — Further subdivisions (2 per micro beat). These are the finest grid level.

4. **Reference pulse** (`layer: "reference"`) — Optional steady click at integer beat positions. Added automatically for "layered" category sigs (polymeter, nested) so you can hear the polymetric clash against a steady pulse.

**For polymeter sigs**, each `PolyLayer` generates its own independent set of events with a `polyLayerIdx` tag, so the audio engine can assign distinct timbres per layer.

**Metre classification** maps to a unified type for display:
- 5 beats → `uneven_2_3`
- 7 beats → `uneven_unpaired`
- Mixed groups → `combined`
- ≤4 beats → `duple`
- else → `triple`

### Evolving Patterns: `generateNthPattern()`

Signatures in the **infinite**, **process**, and **subdivision_tree** categories are "evolving" — they change with each repetition. The function `isEvolvingSig()` returns true for these.

`generateNthPattern(sig, bpm, i, layers)` is **stateless** — given repetition index `i`, it computes the correct pattern from scratch. This supports infinite playback.

**Evolution rules by signature:**

| Signature | Rule |
|-----------|------|
| **Fibonacci-grow** | Measure `i` has `fib(i)` beats. Measures grow: 1, 1, 2, 3, 5, 8, 13... |
| **Clapping Music** | Base pattern [3,2,1,2,1,2,1] rotates by `i mod 7` positions each rep |
| **Phase drift** (12/8 gradual, micro-drift) | Each group widens by `g × (1 + gi/len × i × 0.005)` — accumulating drift |
| **Cantor set** | Depth increases: `min(i+1, 6)`. At depth d, 3^d slots, remove middle thirds recursively, scale to 9 beats |
| **√chain** | Each rep adds another √prime: rep 0 = √2,√3,√5; rep 1 = √2,√3,√5,√7; etc. |
| **Non-terminating ratios** (π/√2, ζ(2)/4, ρ, e/π) | Precision increases: rep i uses i+1 decimal places of the irrational value |
| **Subdivision trees** | Each rep subdivides all groups by the next factor in the tree sequence, capped at 64 groups |
| **Rule 30** | Wolfram cellular automaton starting from [0,0,0,1,0,0,0,0], evolved i steps. Run-length encoding → groups |
| **4/4 + ⅛ shift** | Offset increases by 0.5 each rep |
| **5/8 + 1 shift** | Offset rotates 1–5 cyclically |

### Helper Functions

- `rule30Step(state)` — One step of Wolfram's Rule 30: `(30 >> (l<<2 | c<<1 | r)) & 1`
- `stateToGroups(state)` — Run-length encodes a binary array into group sizes
- `fibAt(n)` — Returns the nth Fibonacci number

---

## 5. Audio System

### Click Timbres

Each event layer has a distinct synthesized click sound:

| Layer | Frequency | Decay | Gain | Sound character |
|-------|-----------|-------|------|-----------------|
| **Accent** (cycle start) | 1400→400 Hz | 140ms | 1.0 | Highest, loudest, longest |
| **Group start** | 1000→350 Hz | 100ms | 0.75 | Mid-high, marks boundaries |
| **Macro** | 900→300 Hz | 80ms | 0.55 | Standard beat |
| **Micro** | 1200→600 Hz | 50ms | 0.4 | Quick subdivision |
| **Division** | 1600→1000 Hz | 35ms | 0.25 | Finest grid, quiet |
| **Rest** | 400→200 Hz | 20ms | 0.1 | Near-silent marker |
| **Reference** | 600→200 Hz | 120ms | 0.5 | Soft cowbell/woodblock |

Poly-layer sigs get separate timbres per layer:
- Layer 2: Low woodblock (500→150 Hz, 400→140 Hz)
- Layer 3: Clap-like (800→500 Hz, 700→450 Hz)

### Playback Modes

**Static playback** — `rhythmAudio.playPattern(pattern, onDone, repeats=4)`:
- Plays the pattern 4 times then stops
- Fires `onBeat(beatPos)` callback for UI sync

**Infinite playback** — `rhythmAudio.playInfiniteSequence(generator, onNewRep)`:
- Calls `generator(idx)` to produce each successive pattern
- Plays forever until `rhythmAudio.stop()` is called
- Fires `onNewRep(idx)` when a new repetition begins (displayed as "Rep 1", "Rep 2", etc.)

### Event Timing

`computeEventTimes()` maps beat positions to absolute audio timestamps:
- **Constant tempo**: `timeOffset = beatPos × 60 / bpm`
- **Tempo ramp** (bpm → bpmEnd): Integrates the tempo function over beat positions
- **Pattern duration**: `totalBeats × 60 / effectiveBpm`

---

## 6. Visualizations

### CircleTimeSigVisualizer (Clock-Face View)

A circular SVG visualization where beats are arranged around a clock face.

**Geometry:**
- `beatAngle(pos, total)` = (pos/total) × 2π − π/2 → 0 = top, clockwise
- Four concentric rings: outer guide → group arcs → beat dots → center label
- Size defaults to 220px (full) or 120px (compact)

**Elements in full view:**
1. **Outer guide ring** — Thin circle for reference
2. **Cycle restart flash** — White ring that flashes when the measure loops
3. **Group arcs** — Colored bands around the ring, one per group. Active group at 70% opacity, inactive at 25%. Group size labels positioned on the outer edge.
4. **Spokes** — Lines from center through group boundary positions
5. **Beat dots** — Circles on the inner ring:
   - Group starts: 6px, full color
   - Subdivisions: 3.5px, reduced opacity
   - Active beat: white with glow + stroke
6. **Sweep hand** — Rotating needle showing current beat position during playback
7. **Progress trail** — Faint arc showing how far through the measure we are
8. **Center** — Category icon + display name + total beat count

**ReferenceCircle** — A secondary simple circle showing a steady equal-beat pulse for visual comparison. Uses `requestAnimationFrame` for smooth rotation. Displayed in golden color (#ddaa55).

**PolyLayerCircle** — One circle per poly-layer. Each layer gets its own:
- Group arcs in the layer's color
- Beat dots with independent activation tracking
- Sweep hand in layer color
- Center label showing the layer name (e.g. "3/4")

### TimeSigVisualizer (Linear View)

A horizontal bar visualization showing beat structure as a timeline.

**Compact mode** (used for unselected items in the list):
- Single row: icon + display name + category badge + anchor mode indicator
- Mini beat bar: horizontal strip divided by group widths with color coding
- Each segment shows the group size in small text

**Full mode** (used for the selected/playing item):

1. **Header** — Icon + display name + meta/category badges + description + composer list + total beats
2. **Group structure bar** — Horizontal bar divided into colored sections proportional to group sizes. Within each section:
   - Group size label
   - Individual beat circles (first beat: 12px, subsequent: 8px, active: white with glow)
3. **Grouping formula** — `(3+2+3) = 8 beats` with each number colored by its group. Tempo scale shown if ≠ 1.
4. **Beat timeline** — Horizontal bar with vertical markers:
   - Group starts: full height in color
   - Subdivisions: 60% height in muted color
   - Active beat: white with shadow
   - Position indicator: thin white line following playback
   - Beat number labels at group starts
5. **Tags** — Displayed at the bottom if any

**PolyLayerTimeline** — Linear view for a single layer in a polymeter. Shows label + grouping + structure bar + timeline, all in the layer's assigned color.

---

## 7. The UI: WeirdTimeSigPanel

### Browse & Learn View

The main exploration interface. Two levels of filtering:

1. **Meta-category tabs** — 7 buttons across the top (+ "All"), each showing a count of available sigs. Clicking one filters to that meta-category.
2. **Sub-category filter** — Appears when a meta-category is selected and has multiple sub-categories. Further narrows the list.
3. **Category description** — Contextual prose explanation of the selected category.

**Signature list:**
- All matching sigs displayed as a vertical list
- **Unselected sigs** → compact `TimeSigVisualizer` (one-line summary)
- **Selected sig** → full expanded view:
  - For **polymeter/nested sigs**: Multiple `PolyLayerCircle` + `PolyLayerTimeline` components arranged horizontally
  - For **single-layer sigs**: `CircleTimeSigVisualizer` + `ReferenceCircle` (side by side) + `TimeSigVisualizer`
- Clicking any sig toggles playback (play or stop)

**Playback behavior:**
- Static sigs repeat 4 times then auto-stop
- Evolving sigs play infinitely with a "Rep N" label updating in real-time
- Layered sigs automatically include a steady reference pulse
- `activeBeat` state is passed to all visualizers for synchronized animation

### Custom Builder View

Create and save your own time signatures.

**Form fields:**
- **Category** — Dropdown of all 22 sub-categories
- **Display Name** — Optional, auto-generates from grouping if blank
- **Grouping Structure** — Text input. Accepts: `3+2+3`, `3,2,3`, `3 2 3`, `(3+2+3)`, `2.5+1.5`
- **Tempo Scale** — Number input, 0.1 to 4.0 (1 = normal)
- **Description** — Optional textarea

**Quick presets** (8 buttons):
- 5/8 aksak (2+3)
- 7/8 Balkan (3+2+2)
- 11/8 (3+3+3+2)
- 4/3 Ferneyhough (4, tempoScale=2/3)
- π beats (3.1416)
- 3.5/4 (2+1.5)
- 13/8 Turkish (3+2+3+2+3)
- 5:7 poly (5)

**Actions:**
- **Preview** — Validates grouping, builds a `TimeSigDef`, shows circle + timeline visualizers
- **Play** — Plays the preview pattern 4 times with beat tracking
- **Save** — Persists to localStorage under key `lt_weird_ts_custom`

**Saved custom sigs:**
- Listed below the builder with compact visualization
- Each has ▶ (play) and ✕ (delete) buttons
- Persist across sessions via localStorage

### Parsing: `parseGroupingString()`

Accepts flexible input formats:
```
"3+2+3"       → [3, 2, 3]
"3,2,3"        → [3, 2, 3]
"3 2 3"        → [3, 2, 3]
"(3+2+3)"      → [3, 2, 3]
"2.5+1.5"      → [2.5, 1.5]
"3.1416"       → [3.1416]
```
Returns `null` if any value is NaN or ≤ 0.

### Building: `buildCustomSig()`

Creates a `TimeSigDef` with:
- `totalBeats` = sum of groups
- `id` = `custom_${Date.now()}_${random4chars}`
- `isCustom` = true
- `tags` = ["custom"]

---

## 8. Exercise System

Five exercise types for training your perception of unusual meters:

### 1. Identify Category

Listen to a random time signature, identify which sub-category it belongs to.
- Picks a random category from enabled list, then a random sig within it
- 4+ multiple-choice options (all category labels)
- Explanation reveals the sig name, category, and description

### 2. Identify Grouping

Hear an additive or prime sig, identify the grouping pattern.
- Only uses `additive` and `prime` category sigs
- Correct answer: the actual groups joined with "+"
- Wrong options generated by:
  1. Shuffling the correct groups
  2. Using groups from other sigs with the same total
  3. Random ±1 perturbations of each group value

### 3. Count Beats

Listen and count the total number of beats in the measure.
- Only uses integer-beat sigs with 3–17 beats
- Options: correct ± {-2, -1, +1, +2, +3}
- Sorted numerically, max 5 options

### 4. Compare Signatures

Hear two random sigs, determine which has a longer measure.
- Duration computed as: `(totalBeats × 60) / (bpm × tempoScale)`
- Options: "first is longer", "second is longer", "about the same"
- "Same" threshold: < 0.05 seconds difference

### 5. Feel the Pulse

Listen and count the number of strong beats (group starts).
- Only uses sigs with ≥ 2 groups
- Options: 2, 3, 4, or 5 strong beats
- Answer = `groups.length`

### Master Dispatcher

`generateWeirdTSExercise(type, bpm, enabledCategories?)` routes to the appropriate generator.

---

## 9. State Persistence

| What | Where | Key |
|------|-------|-----|
| Current view (browse/custom) | localStorage via `useLS` | `lt_rhy_wts_view` |
| Selected meta-category | localStorage via `useLS` | `lt_rhy_wts_browse_meta` |
| Selected sub-category | localStorage via `useLS` | `lt_rhy_wts_browse_cat` |
| Custom time signatures | localStorage | `lt_weird_ts_custom` |

---

## 10. Composer & Cultural References

Each sub-category links to composers and traditions:

| Category | Composers / Traditions |
|----------|----------------------|
| Additive | Stravinsky, Bartók, Balkan folk, Tool, King Crimson |
| Irrational | Ferneyhough, Nancarrow, Thomas Adès, new complexity |
| Fractional | Electroacoustic, algorithmic, proportional notation |
| Ratio | Nancarrow, Ligeti, Vijay Iyer |
| Prime | Erv Wilson, microtonal composers, lattice-based rhythm |
| Polymeter | Nancarrow, Ligeti, Stravinsky, Carter, Meshuggah |
| Nested | Xenakis, spectral music, algorithmic composition |
| Continuous | Nancarrow, Ligeti, Stockhausen, electronic/tape |
| Elastic | Feldman, Scelsi, free improvisation, graphic scores |
| Real-number | Generative music, DSP synthesis, microtime systems |
| Proportional | John Cage, Earle Brown, Feldman, graphic scores |
| Phase shift | Steve Reich, Terry Riley, minimalism, process music |
| Algorithmic | Toussaint (Euclidean), Xenakis, Wolfram, West African drumming |
| Stochastic | Xenakis, Cage (chance), algorithmic composition |
| Non-terminating | Cage, Xenakis, mathematical music |

---

## 11. Perceptual Resistance

The brain is extremely good at collapsing complex rhythmic input into the nearest familiar meter (usually 2, 3, or 4). The **perceptual resistance** system quantifies how hard it is to normalize a given signature.

### Four Metrics (0–1 scale, computed automatically)

| Metric | 0 means | 1 means | How computed |
|--------|---------|---------|--------------|
| **Pulse Clarity** | No discernible steady beat | Perfectly regular click | Group variance (irregular groups → low), structural layer penalty (generative → −0.3), poly-layer penalty (−0.2) |
| **Periodicity** | Non-cyclic, never repeats | Exact repetition | Maps directly from PeriodicityClass: periodic=1, quasi=0.6, aperiodic=0.2, non-cyclic=0 |
| **Symmetry** | Fully asymmetric grouping | Palindromic (reads same forwards/backwards) | Fraction of groups that match their reverse-position counterpart |
| **Reducibility** | Cannot be heard as a simpler meter | Trivially reducible to 2/4 or 3/4 | Sum of: integer totalBeats (+0.3), small totalBeats ≤7 (+0.2), all equal groups (+0.3), ≤3 groups (+0.2) |

### How to Read the Bar

The resistance bar appears in the full `TimeSigVisualizer` view. **Lower values across all four metrics = harder to normalize = more "truly weird."** A signature with all four near zero is perceptually non-reducible — the brain cannot compress it.

---

## 12. Anti-Collapse Playback Modes

Three playback modes that control how much the audio actively resists perceptual normalization:

| Mode | What it does | When to use |
|------|-------------|-------------|
| **Clear** (default) | Standard accents, stable timing | Learning a new signature, hearing its structure clearly |
| **Ambiguous** | Randomly suppresses 50% of accents, adds ±20ms timing jitter | Testing whether you've internalized the meter vs. relying on accents |
| **Non-Reducible** | Zero accents, cumulative √2 × 0.02 irrational drift per event | Experiencing what it's like when the brain truly cannot normalize |

### Implementation

```
Clear:       events unchanged
Ambiguous:   ev.beatPos += random(-0.02, 0.02); if (accent && random > 0.5) accent = false
Non-Reducible: ev.beatPos += √2 × 0.02 × eventIndex; accent = false (all events)
```

The drift in Non-Reducible mode is **cumulative and irrational** — it grows with each event and never aligns back to any integer grid. After ~50 events the drift exceeds one full beat, destroying any periodic locking.

---

## 13. How the Math Works

### Euclidean Rhythms

E(k, n) = k onsets maximally distributed in n slots. The algorithm (Bjorklund/Toussaint) produces patterns found across world music:
- E(3,8) = [3,3,2] = Cuban tresillo
- E(5,8) = [2,1,2,1,2] = Cuban cinquillo
- E(7,12) = [2,2,1,2,2,2,1] = West African bell = major diatonic scale

### Rule 30 Cellular Automaton

Wolfram's Rule 30 applied to an 8-cell ring: `[0,0,0,1,0,0,0,0]`.
Each generation, cell state = `(30 >> (left<<2 | center<<1 | right)) & 1`.
Run-length encoding converts binary state to beat groups.
Each repetition evolves one more generation → pseudorandom but deterministic rhythms.

### Cantor Set Rhythm

At depth d, create 3^d slots. Recursively remove the middle third. Remaining slots become groups (via run-length encoding), scaled to 9 total beats. Creates self-similar gaps — fractal silence.

### Fibonacci Growing Measures

Measure i has `fib(i)` beats. Beats are grouped using the Fibonacci sequence itself: [1, 1, 2, 3, 5, 8, ...]. The measure never stabilizes — it grows without bound.

### Phase Drift

Groups widen by: `g × (1 + (groupIndex / length) × repetitionIndex × 0.005)`.
The drift is proportional to both position within the measure and how many repetitions have passed. Imperceptible at first, clearly audible after 10+ reps.

### Non-Terminating Precision

For irrational constants (π/√2, ζ(2)/4, e/π, ρ), each repetition increases decimal precision by 1 digit:
- Rep 0: π/√2 ≈ 2.2
- Rep 1: π/√2 ≈ 2.22
- Rep 2: π/√2 ≈ 2.221
- ...

The measure asymptotically approaches the true value but never reaches it.
