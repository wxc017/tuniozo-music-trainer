# Rhythm Generator — Internal Documentation

The Rhythm Generator lives inside the Patterns tab (MelodicPatterns). It produces two independent rhythmic lines — **Chord** and **Melody** — rendered as snare-style notation on single-line staves. The rhythm determines *when* each chord change and melody note falls within the bar.

---

## Files

| File | Role |
|------|------|
| `lib/rhythmGen.ts` | Generation engine: grouping, metric weights, style transforms, phrase arcs, hit generation |
| `components/MelodicRhythm.tsx` | UI component: controls, VexFlow notation rendering, state management |

---

## Generation Pipeline

The generator runs five stages in sequence. Stages 3–5 are applied independently for the chord and melody layers.

### Stage 1 — Grouping

Determines the metric structure of the bar.

- **/4 meters**: each quarter-note beat = one group of `beatSize` slots.
  - Example: 4/4 with beatSize 4 → grouping `[4, 4, 4, 4]` (16 total slots on a 16th-note grid).
- **/8 meters**: the accent-study grouping engine (`generateAndSelectGrouping`) decomposes the total slot count into musical groups of 2s and 3s.
  - Example: 7/8 → `[3, 2, 2]` or `[2, 2, 3]`.
  - Fallback if the engine returns nothing: greedy 3s then 2s.

### Stage 2 — Metric Weights

Assigns a hierarchical importance value (0–1) to every slot in the bar. Based on Lerdahl & Jackendoff metric preference rules, Cooper & Meyer metric hierarchy, and Gordon rhythm pedagogy.

| Position | Weight |
|----------|--------|
| Beat 1 (first group start) | 1.0 |
| Mid-bar group start (group at index `floor(numGroups/2)`) | 0.7 |
| Other group starts (simple meters ≤4 groups) | 0.5 |
| Other group starts (many groups, alternating) | 0.5 / 0.35 |
| Group midpoint ("and" of the beat, when group size ≥ 3) | 35% of the group's downbeat weight |
| Even subdivisions (8th-note level in 16th grid, when group size ≥ 4) | 0.12 |
| Weak offbeats (e-and-a level) | 0.06 |

### Stage 3 — Style Transform

Each style reshapes the base metric weights to create its characteristic feel. The transform receives the full weight array, the grouping structure, and which layer (chord/melody) is being processed.

**Straight**
- Boosts group starts ×1.3.
- Suppresses non-midpoint offbeats ×0.6.
- Result: clear, predictable rhythms anchored to strong beats.

**Syncopated**
- Suppresses group starts ×0.4 (except beat 1, which stays at ×1.0).
- Boosts all offbeats: `max(weight × 2.0, 0.5)`.
- Anticipations (slot before each group start) boosted to at least 0.7.
- Result: tension through displaced accents.

**Triplet**
- Uses a 3-per-beat grid (beatSize = 3) instead of the default 16th grid.
- Downbeats: ×0.9 (moderate, not every beat needs a hit).
- Group midpoints (2nd triplet partial): `max(weight × 2.5, 0.5)` — gives the "skip" feel.
- Last triplet partial: `max(weight × 1.8, 0.35)` — shuffle accent.
- VexFlow tuplet brackets (3:2) are drawn over groups of three non-rest notes.
- Result: swing-like and Afro-Cuban triplet patterns.

**Bossa**
- Boosts anticipation of the mid-bar group start to at least 0.8 (e.g., the slot before beat 3 in 4/4).
- Boosts anticipation of beat 1 (last slot) to at least 0.6.
- Suppresses straight group starts (except beat 1) ×0.6.
- Result: classic bossa nova rhythmic cell with anticipated accents.

**Clave**
- Splits the bar in half.
- First half (3-side): boosts non-group-start offbeats `max(weight × 1.5, 0.4)` — denser.
- Second half (2-side): boosts group starts ×1.3, suppresses offbeats ×0.5 — sparser.
- Result: 3-2 clave density profile with characteristic tension/release.

**Displaced**
- Suppresses all group starts ×0.15.
- Beat 1: chord layer ×0.5, melody layer ×0.2.
- All anticipations boosted to at least 0.85.
- Result: everything lands just before the strong beat. Push/pull feeling.

### Stage 4 — Phrase Arc

A density contour applied across the bar prevents uniform rhythm. Multiplied into the probability alongside the style-transformed weights.

**Chord layer**: gentle sinusoidal rise toward mid-bar.
- `arc[i] = 0.3 + 0.2 × sin(t × π)` where `t = i / totalSlots`.

**Melody layer**: randomly selects one of four shapes per generation:
1. **Front-heavy**: `0.8 − 0.3t` (active opening, quieter ending).
2. **Back-heavy**: `0.5 + 0.3t` (builds toward cadence).
3. **Arch**: `0.5 + 0.4 × sin(tπ)` (peaks at midpoint).
4. **Even**: constant 0.7.

### Stage 5 — Hit Generation

For every slot `i`, computes `probability = weight[i] × arc[i] × density`. A seeded PRNG coin-flip decides whether slot `i` gets a hit.

**Density ranges** (style-dependent):

| Style | Chord density | Melody density |
|-------|--------------|----------------|
| Straight | 0.7 – 1.2 | 1.0 – 1.6 |
| Syncopated | 0.8 – 1.4 | 1.2 – 1.8 |
| Triplet | 0.8 – 1.3 | 1.0 – 1.6 |
| Bossa | 0.8 – 1.4 | 1.0 – 1.6 |
| Clave | 0.8 – 1.3 | 1.2 – 1.8 |
| Displaced | 0.7 – 1.2 | 1.0 – 1.6 |

---

## Post-Generation Guarantees

1. **Chord never empty**: if zero chord hits, beat 1 is added.
2. **Melody minimum**: melody must have at least as many hits as `melodyNoteCount` (the number of melody notes passed in from the parent component). If under-generated, the highest-weighted unused slots are filled in descending score order (`weight × arc`).
3. **Melody ≥ Chord**: if chord ends up busier than melody, the two arrays are swapped. After swap, chord is guaranteed to still include beat 1.

---

## Grid Resolution

| Style | Beat size | Grid | Slots in 4/4 |
|-------|-----------|------|-------------|
| All except Triplet | 4 | 16th notes | 16 |
| Triplet | 3 | 8th-note triplets | 12 |

The grid determines the finest rhythmic value possible:
- **16th grid (beatSize 4)**: can produce whole, half, dotted quarter, quarter, dotted 8th, 8th, and 16th notes.
- **Triplet grid (beatSize 3)**: produces quarter notes (3 slots) and 8th notes (1 slot) within each beat's triplet group.

---

## VexFlow Notation Rendering

### Stave Setup

Each line (Chord / Melody) is drawn as a VexFlow `Stave` with:
- 5 logical staff lines, but lines 0, 1, 3, 4 are hidden via `setConfigForLines`.
- Only line 2 (the middle line) is visible — this gives a single-line percussion appearance.
- The reason for 5 hidden lines instead of `setNumLines(1)`: VexFlow's `addTimeSignature` assumes a 5-line staff for centering. With hidden lines, the time signature numerator and denominator center correctly with the visible line passing through the gap between them.
- `staveY = -5` positions the stave so the time signature sits at the right vertical position.

### Note Placement

All notes use the key `b/4`, which maps to line 2 (the visible middle line) of a treble-clef 5-line staff. Stems point upward (`stemDirection: 1`).

### Duration Conversion

The function `slotsToVfDur(slots, beatSize, bottom)` converts a span of grid slots into a VexFlow duration string:

**16th grid (beatSize 4, /4 time)**:
| Slots | Duration |
|-------|----------|
| 8 | half note |
| 6 | dotted quarter |
| 4 | quarter |
| 3 | dotted 8th |
| 2 | 8th |
| 1 | 16th |

**Triplet grid (beatSize 3)**:
| Slots | Duration |
|-------|----------|
| 3 | quarter |
| 1–2 | 8th |

Longer durations are split via `splitSlots` — it greedily takes the largest fitting duration, then recurses on the remainder.

### Tied-Over Duration

When a hit spans multiple duration units, the first is a visible note and the remaining are transparent rests. This simulates tied notes without VexFlow tie objects.

### Beaming

- **beatSize 2 or 4**: VexFlow's `Beam.generateBeams` with `flatBeams: true`.
- **beatSize 3 (triplet)**: notes are manually grouped in `beatSize`-sized chunks and beamed. Tuplet brackets (3:2) are drawn over consecutive groups of 3 non-rest notes.

### Stave Width

Scales with beat count: `max(350, min(900, beats × 80 + 100))` pixels. Overflow scrolls horizontally.

---

## Seeded PRNG

Uses a linear congruential generator: `s = (s × 1664525 + 1013904223) & 0x7FFFFFFF`. The seed is set on mount (`Date.now()`) and re-rolled on each "Randomize" click. Same seed + same parameters = same rhythm (deterministic).

---

## UI Controls

### Time Signature Presets
Buttons: 4/4, 3/4, 2/4, 6/8, 5/8, 7/8, 9/8, 5/4, 11/8.

### Custom Time Signature
Text input accepting `N/D` format. Numerator 1–32, denominator must be 4, 8, or 16. Applied on Enter or blur.

### Style Selector
Six buttons, one active at a time. Changing style regenerates immediately.

### Randomize Button
Re-seeds the PRNG and regenerates both lines.

### Status Line
Shows: time signature, style name, chord hit count, melody hit count.
