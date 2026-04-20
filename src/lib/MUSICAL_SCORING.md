# Musical Scoring Framework

**File:** `src/lib/musicalScoring.ts`

All musical vs. awkward aesthetic decisions across the app route through this single module. It replaces three previously independent scoring systems with a unified architecture.

---

## Overview

The framework answers one question: **given a pool of random candidates, which one best fits the aesthetic the user asked for?**

It does this in four stages:

```
Candidates ──▶ Hard Constraints ──▶ Feature Extraction ──▶ Weighted Score ──▶ Pick Best
               (reject invalid)      (normalize -1..+1)     (mode weights)
```

Every domain (groupings, slot mods, stickings) follows this exact pipeline. They differ only in what features they extract and what weights they apply.

---

## Architecture

### Stage 1: Hard Constraints

Invalid candidates are rejected before scoring. This prevents the scoring weights from ever having to compensate for structurally broken patterns.

| Domain | Hard Constraints |
|--------|-----------------|
| **Groupings** | No all-1s, max 3 unique sizes, no middle-1s, max range of 5 (in `groupingSelector.ts`) |
| **Slot Mods** | At least 1 mod, max 2 adjacent rests, every beat has at least 1 sounding attack |
| **Stickings** | Must sum to target slots, must use available patterns |

### Stage 2: Feature Extraction

Each domain extracts a set of **named features**, each normalized to the range **[-1, +1]** using the `norm()` function:

```
norm(value, expectedMin, expectedMax) → [-1, +1]
```

This normalization is critical. Without it, a feature that naturally ranges 0–200 would dominate one that ranges 0–1, making weight tuning impossible.

Binary features (present/absent) use 0 or 1 directly.

### Stage 3: Weighted Scoring

Each domain has **two weight tables** — one for musical, one for awkward. The score is a simple dot product:

```
score = Σ (feature[i] × weight[i])
```

Musical and awkward are **not inverses**. They emphasize different things:

- **Musical** = pulse-preserving, phrase-friendly, moderate variation
- **Awkward** = metrically disruptive, asymmetric, strategically broken

A feature that musical penalizes (-60) might get a smaller reward in awkward (+30), not +60. This prevents awkward from degenerating into "opposite of musical" which would just be random noise.

### Stage 4: Selection

Two methods depending on the domain:

- **Best-of-N**: Generate N random candidates (typically 80), score all, pick the highest. Used by slot mods and stickings.
- **Weighted random pick**: All valid candidates get a chance proportional to their score. Higher scores are more likely but not guaranteed. Used by groupings (via `weightedPick()`). This adds variety — the #2 candidate sometimes wins.

---

## Domain 1: Grouping Scoring

**Used by:** Accent study groupings, konnakol, microwave mode

**Input:** An array of positive integers summing to N (e.g., `[3, 3, 2]` for an 8-slot pattern)

### Features

| Feature | What it measures | Musical wants | Awkward wants |
|---------|-----------------|---------------|---------------|
| `groupCount` | How many groups (norm over 1–8) | Fewer (-100) | More (+50) |
| `repeatedSizes` | How many groups share a size | High (+80) | Low (-60) |
| `sizeRange` | Max size minus min size (norm over 0–6) | Small (-50) | Large (+80) |
| `hasOnes` | Contains any group of size 1 | No (-150) | Yes (+30) |
| `isFramed` | Symmetric shape: first=last, or repeated start/end | Yes (+60) | No (-50) |
| `isLopsided` | First and last differ by ≥ 2 | No (-30) | Yes (+70) |
| `hasEdgeOne` | Starts or ends with a 1 | No (-40) | Yes (+80) |

### Why these features matter musically

- **Group count**: Fewer groups means longer sustained patterns. `4+4` is easier to internalize than `2+3+1+2`.
- **Repeated sizes**: `3+3+2` has an internal pulse you can feel. `2+3+4` does not.
- **Size range**: All groups being similar (range 0–1) creates consistency. A range of 4+ is jarring.
- **Has ones**: A single-note group breaks flow. In musical contexts it's almost always wrong. In awkward contexts it creates a hiccup.
- **Framing**: `3+4+3` frames the phrase. `2+5+1` doesn't. Framing helps memorization.
- **Lopsidedness**: `5+3` is lopsided — the weight shifts. Musical patterns are balanced.
- **Edge ones**: Starting or ending on a 1 is maximally disruptive — the listener loses the downbeat.

### Integration with groupingSelector.ts

The grouping selector adds a **tiering** layer on top of this score:

- Tier 1: All groups same size (Class A) — bonus +600 for musical
- Tier 2: Two unique sizes with strong shape — bonus +400
- Tier 3: Two unique sizes without strong shape — bonus +200
- Tier 4: Three unique sizes (Class C) — no bonus
- Tier 5: Contains 1s (Class D) — bonus for awkward

The final selection score = tier bonus + feature score.

---

## Domain 2: Slot Mod Scoring

**Used by:** Accent study "Slot Mods" section (rest and 32nd-note split randomization)

**Input:** A set of rest positions and split positions across the beat grid

### Hard Constraints (reject before scoring)

1. Must have at least 1 modification
2. Max 2 adjacent rests (3+ consecutive rests = unplayable)
3. Every beat must have at least 1 sounding attack (no completely empty beats)

### Features

| Feature | What it measures | Musical wants | Awkward wants |
|---------|-----------------|---------------|---------------|
| `modDensity` | Total mods / (40% of slots) | Low (-40) | High (+30) |
| `beat1Rests` | Rests on downbeats (beat 1 positions) | None (-120) | Yes (+80) |
| `secondaryStrongRests` | Rests on on-beats (half-beat positions) | None (-60) | Yes (+50) |
| `weakRests` | Rests on weak subdivisions | Yes (+40) | No (-10) |
| `adjacencyRatio` | Adjacent rest pairs / total mods | Low (-50) | High (+40) |
| `crossBeatAdjacency` | Adjacent rests that cross a beat boundary | Very low (-70) | High (+60) |
| `densityVariance` | Variance of mods across beats | Low (-20) | High (+50) |
| `beatSpread` | How many beats have at least one mod | High (+30) | Low (-20) |
| `splitRatio` | Fraction of mods that are splits vs rests | Low (-30) | High (+30) |
| `hasEmptyBeat` | Any beat with zero attacks | NEVER (-999) | NEVER (-999) |

### Key design decisions

**Beat 1 vs secondary strong beats:** A rest on beat 1 is catastrophic for pulse — the listener loses where "1" is. A rest on beat 3 is disruptive but recoverable. That's why `beat1Rests` has weight -120 in musical but `secondaryStrongRests` is only -60.

**Cross-beat adjacency:** Two adjacent rests within one beat (e.g., the "e" and "+" of beat 2) create a brief gap. Two adjacent rests *across* a beat boundary (e.g., the "a" of beat 2 and the "1" of beat 3) destroy the barline. The latter is weighted more heavily in both modes.

**Density variance vs raw density:** The old system rewarded raw density for awkward mode, which just produced busy patterns. The new system rewards *uneven* density — one beat dense, another sparse. That's what actually sounds awkward: unexpected compression followed by space.

**hasEmptyBeat = -999:** This is effectively a hard constraint encoded as a weight. Any candidate with an empty beat scores so badly it can never win. This is a safety net in case the hard-constraint filter is somehow bypassed.

### Generation pipeline

```
1. Generate 80 random candidates
   - Each slot (except slot 0) has 15% chance of rest, 10% chance of split
2. Filter: reject candidates failing hard constraints
3. Score remaining candidates with mode-specific weights
4. Return the highest-scoring candidate
```

---

## Domain 3: Sticking Fill Scoring

**Used by:** Stickings study "Musical" and "Awkward" randomize buttons

**Input:** An array of sticking patterns (e.g., `[RLRL, RLK, RLRLR]`) filling a measure

### Features

| Feature | What it measures | Musical wants | Awkward wants |
|---------|-----------------|---------------|---------------|
| `groupCount` | Number of pattern groups (norm over 1..slots/2) | Fewer (-60) | More (+40) |
| `sizeVariety` | Unique group sizes / total groups | Low (-70) | High (+70) |
| `repetition` | Adjacent identical patterns (ABAB) | High (+80) | Low (-50) |
| `kickDensity` | Total K notes / (30% of slots) | Low (-40) | High (+30) |
| `familyMix` | Number of distinct rudiment families | One (-50) | Many (+50) |
| `oddSizeRatio` | Fraction of groups with odd size (3,5,7) | Low (-20) | High (+60) |
| `isUniform` | All groups same size (binary) | Yes (+80) | No (-60) |

### Rudiment families

Patterns are classified into families by their label:

| Family | Matches | Musical example |
|--------|---------|----------------|
| single | "single stroke", "alternating" | RLRL, RLRLR |
| double | "double stroke", "dbl" | RRLL, RRLR |
| paradiddle | "para" | RLRR, RLRRLL |
| 3k | "3K" | KRKRK, RKKLKR |
| other | everything else | Custom patterns |

### Why these features matter

- **Group count / size variety**: `RLRL + RLRL + RLRL + RLRL` (4 groups, 1 size) is a bread-and-butter snare exercise. `RLK + RLRLR + RR + RLRLRL` (4 groups, 4 sizes) is progressive metal.
- **Repetition**: Repeating the same sticking builds muscle memory. Varying it builds adaptability.
- **Kick density**: Each K is a bass drum hit. Musical = sparse kicks (groove feel). Awkward = dense kicks (coordination challenge).
- **Family mix**: Same family = consistent hand motion. Mixed = constant technique switching.
- **Odd sizes**: Groups of 5 and 7 cross 16th-note beat boundaries. `RLRLR` starting on beat 1 ends on the "+" of beat 2 — the next group starts on a weak position.

### Generation pipeline

```
1. Generate 200 random fills:
   a. Pick group sizes summing to total slots (weighted random)
      - Musical: favor 4s and 3s, prefer sizes already used
      - Awkward: favor 5s and 7s, prefer unused sizes
   b. For each group size, pick a random matching pattern from the catalogue
2. Score each fill using the feature/weight system
3. Return the highest-scoring fill
```

---

## The `norm()` Function

```typescript
norm(value, min, max) → [-1, +1]
```

Maps a raw value to a normalized range:
- `value = min` → -1
- `value = max` → +1
- `value = (min+max)/2` → 0

This ensures all features contribute on the same scale regardless of their natural range. A weight of 50 on any feature means the same amount of influence.

---

## The `weightedPick()` Function

```typescript
weightedPick(items, scoreFn) → item
```

Probabilistic selection where higher scores are more likely but not guaranteed:

1. Score all items
2. Shift scores so the minimum becomes 1 (all positive)
3. Use scores as probability weights
4. Random selection proportional to weight

This prevents the system from always picking the same "best" pattern. The #2 and #3 candidates sometimes win, adding variety across repeated generations.

---

## The `resolveMode()` Function

```typescript
resolveMode("both") → "musical" | "awkward"  // 50/50 coin flip
resolveMode("musical") → "musical"
resolveMode("awkward") → "awkward"
```

All three modes are supported everywhere. "Both" flips a coin, then runs that mode's full pipeline.

---

## Consumers

| File | What it does | How it uses the framework |
|------|-------------|--------------------------|
| `groupingSelector.ts` | Selects accent groupings | `scoreGrouping()` replaces old `musicalScore()` / `awkwardScore()` |
| `AccentStudy.tsx` | Slot mod randomization | `randomizeSlotMods()` replaces inline 80-candidate scoring |
| `stickingsData.ts` | Sticking fill randomization | `scoreStickingFill()` replaces old inline scoring |
| `accentData.ts` | Generates groupings for accent study | Routes through `groupingSelector.ts` → `scoreGrouping()` |
| `konnakolData.ts` | Generates konnakol groupings | Routes through `groupingSelector.ts` → `scoreGrouping()` |
| `MicrowaveMode.tsx` | Pulse sequence groupings | Routes through `groupingSelector.ts` → `scoreGrouping()` |

---

## Tuning Weights

All weights are collected in clearly named constants at the top of each section:

```
GROUPING_WEIGHTS_MUSICAL    / GROUPING_WEIGHTS_AWKWARD
SLOT_MOD_WEIGHTS_MUSICAL    / SLOT_MOD_WEIGHTS_AWKWARD
STICKING_WEIGHTS_MUSICAL    / STICKING_WEIGHTS_AWKWARD
```

To tune the system:

1. **Identify the problem**: "Musical slot mods are too sparse" or "Awkward groupings aren't lopsided enough"
2. **Find the weight**: `SLOT_MOD_WEIGHTS_MUSICAL.modDensity` or `GROUPING_WEIGHTS_AWKWARD.isLopsided`
3. **Adjust**: Increase magnitude to make the feature more influential, decrease to make it less
4. **Test**: Re-run the generator multiple times and check the distribution

Because all features are normalized to [-1, +1], the weights are directly comparable:
- A weight of ±30 is a mild preference
- A weight of ±60 is a moderate preference
- A weight of ±100+ is a strong preference
- A weight of ±999 is effectively a hard constraint

---

## Adding a New Domain

To add musical/awkward scoring to a new part of the app:

1. **Define features**: What measurable properties affect the aesthetic?
2. **Create an `extract*Features()` function**: Compute each feature, normalize with `norm()`
3. **Create two weight tables**: `*_WEIGHTS_MUSICAL` and `*_WEIGHTS_AWKWARD`
4. **Create a `score*()` function**: `weightedScore(features, weights)`
5. **Optionally add hard constraints**: An `isValid()` function for the reject stage
6. **Wire it up**: Generate candidates → filter → score → pick best

The framework is intentionally minimal. Each section is a pure function with no global state — easy to test and debug.

---

## Design Principles

1. **Same features, different weights** — Musical and awkward see the same world, they just value different things. No mode-specific branching in feature extraction.

2. **Hard constraints are filters, not penalties** — "Every beat must have an attack" is not a -999 weight that might be outweighed. It's a boolean reject. (The -999 weight on `hasEmptyBeat` is a safety net, not the primary mechanism.)

3. **Normalized features** — Every feature on the same scale. No "raw count of rests" competing with "boolean isFramed". This makes weight tuning predictable.

4. **Probabilistic selection** — The best candidate usually wins, but not always. This prevents the generator from collapsing onto one pattern shape.

5. **Awkward ≠ inverse of musical** — Awkward has its own positive identity: metrical disruption, strategic gaps, concentrated irregularity. It's not just "low musical score."
