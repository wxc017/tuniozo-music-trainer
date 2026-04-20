# Temperament Explorer — How Tempering Works

## Overview

The Temperament Explorer visualizes how equal divisions of the octave (EDOs) relate to just intonation (JI) through the lens of **regular temperament theory**. The core idea: an EDO is defined by which **commas** (small JI intervals) it tempers out — declares equal to unison.

---

## 1. The JI Lattice

Every just intonation interval can be written as a product of prime powers:

```
ratio = 2^a · 3^b · 5^c · 7^d · ...
```

The exponent vector `[a, b, c, d, ...]` is called a **monzo**. With octave equivalence (ignoring powers of 2), we work in a space where each axis represents a prime: the 3-axis, 5-axis, 7-axis, etc.

**Lattice generation**: For given primes and bounds (e.g. `3[-5,5], 5[-2,2]`), we enumerate all integer exponent combinations within those bounds, compute their ratios (octave-reduced to `[1, 2)`), and place them as nodes in 3D space using projection vectors.

**Example**: With primes `[3, 5]` and bounds `3[-2,2], 5[-1,1]`:
- `3^0 · 5^0 = 1/1` (unison)
- `3^1 · 5^0 = 3/2` (perfect fifth, octave-reduced)
- `3^0 · 5^1 = 5/4` (major third, octave-reduced)
- `3^-1 · 5^1 = 5/3` (major sixth)
- etc.

Nodes are connected by **generator edges** — links between nodes that differ by exactly ±1 in one prime exponent. Each prime's edges get a distinct color.

---

## 2. What Is a Comma?

A **comma** is a small interval in JI that represents a "near-miss" — two different paths through the lattice that arrive at almost the same pitch. Examples:

| Comma | Ratio | Cents | Meaning |
|-------|-------|-------|---------|
| Syntonic | 81/80 | 21.5¢ | Four fifths (3/2)^4 vs. a major third (5/4) + two octaves |
| Diesis | 128/125 | 41.1¢ | Three major thirds (5/4)^3 vs. one octave |
| Septimal kleisma | 225/224 | 7.7¢ | 15/14 ≈ 16/15 (septimal vs. just semitone) |

Each comma has a **monzo** — its prime exponent vector. For example:
- 81/80 = `2^-4 · 3^4 · 5^-1` → monzo `[-4, 4, -1]`
- With octave equivalence (drop the 2): `[4, -1]` in `[3, 5]` basis

---

## 3. Tempering: The Projection

**Tempering out a comma** means declaring it equal to unison. Geometrically, this **projects** the lattice onto a lower-dimensional subspace where the comma direction is collapsed to zero.

### The Math

Given comma vectors `c₁, c₂, ..., cₖ` (each a row of matrix **C**), the projection matrix is:

```
P = I − Cᵀ(CCᵀ)⁻¹C
```

This is the **orthogonal complement projection**: it maps every monzo to the subspace perpendicular to all comma directions. Two monzos that differ by any linear combination of commas project to the **same point**.

**Example — Syntonic comma (81/80)**:
- Comma vector: `[4, -1]` in `[3, 5]` basis
- C = `[[4, -1]]`, CCᵀ = `[[17]]`, (CCᵀ)⁻¹ = `[[1/17]]`
- P = `[[1/17, 4/17], [4/17, 16/17]]`
- After projection: nodes that differ by `[4, -1]` (i.e., four fifths minus one major third) collapse to the same point

### What You See

When you click "Temper", the lattice **animates**: nodes slide from their JI positions to their tempered positions. Nodes that are now equivalent (same pitch class in the temperament) merge together and get the same color. Dashed orange lines connect equivalent nodes during the animation.

### Fallback for Dependent Commas

If the comma vectors are linearly dependent (one is a combination of others), the standard matrix inverse fails. The engine falls back to **Gram-Schmidt orthogonalization**: it orthonormalizes the comma directions, then projects onto their complement. This handles redundant commas gracefully.

---

## 4. Equivalence Classes via Smith Normal Form

To determine which nodes are "the same" after tempering, the engine uses the **Smith Normal Form (SNF)** of the comma matrix.

### SNF Algorithm

Given the comma matrix **M** (k commas × n dimensions), SNF computes:

```
U · M · V = S (diagonal)
```

where **S** has diagonal entries `d₁, d₂, ..., dₘ` called **invariant factors**.

### What the Invariant Factors Mean

| Factor | Meaning |
|--------|---------|
| `dᵢ = 1` | That dimension is fully collapsed (trivial) |
| `dᵢ > 1` | That dimension forms a cyclic group of order `dᵢ` |
| `dᵢ = 0` or beyond rank | Free direction (infinite line) |

**The quotient group** `ℤⁿ / ⟨commas⟩` tells you the temperament's structure:
- All `dᵢ = 1` → everything collapses to a point (trivial temperament)
- Some `dᵢ > 1` → finite cyclic groups → the EDO structure
- Some free dimensions → rank > 0 temperament (still infinite, not an EDO)

**Example — 12-EDO in 7-limit**:
- Primes: `[3, 5, 7]` (3D lattice with octave equivalence)
- Commas: 81/80 `[4,-1,0]`, 225/224 `[2,2,-1]`, 128/125 `[0,-3,0]`
- Comma matrix: `[[4,-1,0],[2,2,-1],[0,-3,0]]`
- det = -12 → quotient group ≅ ℤ/12ℤ → exactly **12 pitch classes**

### Node Classification

Each node's monzo is projected into the **V-basis** (from SNF), then reduced modulo the invariant factors. Nodes with the same reduced vector get the same equivalence class ID and color.

---

## 5. Comma Selection for EDOs

### The Problem

An EDO like 12-EDO tempers out dozens of commas from the database. But only a few are **independent** — the rest are linear combinations. For an `n`-dimensional lattice, you need exactly `n` independent commas to collapse to a finite group (EDO).

### The Algorithm

1. **Filter**: Only use commas whose primes are all in the lattice. If the lattice has primes `[3, 5]` and a comma has prime 7, it's excluded — its 7-exponent would be silently dropped, creating a wrong constraint.

2. **Find basis**: Use Gaussian elimination to find a maximal linearly independent subset (the **basis**). Remaining commas are **dependent** (implied by the basis).

3. **Greedy coverage**: When picking which commas to show in the animation sequence, prefer commas that cover new prime directions. This ensures the lattice collapses evenly across all dimensions.

### Minimum Bounds

Each comma's monzo tells you the minimum lattice bounds needed to represent it. For example, the schisma (32805/32768) has 3-exponent = 8, so it needs `3[-8,8]` or similar. The UI shows which commas fit within current bounds and which need expansion.

---

## 6. The Temper Lab Animation

### Lattice Sequence

The Temper Lab pre-builds a sequence of lattices, one for each comma in the sequence:

```
lattice[0] = untempered JI lattice
lattice[1] = tempered with comma 1
lattice[2] = tempered with commas 1+2
lattice[3] = tempered with commas 1+2+3
...
```

Each lattice has the same nodes but different 3D positions (progressively more collapsed).

### Frame-by-Frame Animation

When you click "Temper", the renderer interpolates between consecutive lattices:

```
progress: 0 → 1 (with cubic ease-in-out)
position[node] = lerp(lattice[i].pos, lattice[i+1].pos, ease(progress))
```

Nodes that will merge gain a glow effect (emissive intensity increases with progress). Tempered edges (dashed orange) fade in proportionally to progress. At progress = 1.0, the state advances to the next stage.

---

## 7. EDO Temper Page

The EDO Temper page shows a **per-EDO deep dive** with an inline lattice preview:

### Lattice Preview

- Shows the JI lattice for the selected prime limit
- **"Show tempered"** checkbox applies all basis commas at once
- Nodes in the same equivalence class get the same color
- Non-representative nodes (duplicates in a class) become translucent
- The simplest ratio in each class keeps its label

### What's Computed

- **Basis commas**: The minimum independent set that defines this EDO in the chosen prime limit
- **Dependent commas**: Implied by the basis (shown grayed out)
- **Active bounds**: The minimum bounds needed to contain all basis comma vectors
- **Expandable bounds**: Commas that need wider bounds have "expand" buttons

---

## 8. Key Mathematical Relationships

1. **Projection idempotence**: P² = P. Projecting twice gives the same result as projecting once.

2. **Comma annihilation**: P·c = 0 for any comma vector c. The projection kills the comma direction.

3. **Equivalence preservation**: If m₁ - m₂ = Σ aᵢcᵢ (monzos differ by integer combo of commas), then P·m₁ = P·m₂ (same tempered position).

4. **Rank theorem**: For n primes and k independent commas, the tempered space has dimension n-k. When k = n, the quotient group is finite (an EDO). When k < n, it's a rank-(n-k) temperament (infinite but structured).

5. **Determinant = EDO size**: For n independent commas in n-dimensional space, |det(comma matrix)| = number of equivalence classes = number of notes in the EDO.

---

## 9. Octave Equivalence vs. Including Prime 2

### Default: Octave Equivalence ON (recommended)

- Prime 2 is projected out; lattice lives in ℤⁿ⁻¹
- All ratios are octave-reduced to [1, 2)
- n-1 independent commas collapse to a finite EDO
- **This is the standard approach in regular temperament theory**

### Optional: Prime 2 as axis

- Lattice gains an extra dimension
- Nodes at different octaves are distinct
- You need n independent commas (one more) to collapse fully
- But N-limit commas all lie in an (n-1)-dimensional subspace (the 2-exponent is determined by the other exponents for near-unison intervals)
- So you can never fully collapse to a finite group with only N-limit commas — there's always a free octave direction
- **Useful for visualization** but the math won't produce a finite EDO

---

## 10. File Structure

| File | Purpose |
|------|---------|
| `latticeEngine.ts` | Core math: monzo factorization, projection matrix, Smith Normal Form, lattice building |
| `edoTemperamentData.ts` | EDO database: harmonic errors, comma lists, temperament families, chord/scale computation, comma classification |
| `edoDescriptions.ts` | Parsed wiki descriptions per EDO |
| `TemperamentExplorer.tsx` | UI: Temper Lab (animated 3D), EDO Temper (per-EDO info), Fifth Quality, Ring Map |
