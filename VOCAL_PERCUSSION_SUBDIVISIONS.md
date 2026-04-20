# Vocal Percussion — Subdivision Selector & Example Patterns

## What the Subdivision Checklist Does

The **SUBDIVISIONS** control panel section contains 6 checkboxes for group sizes 2–7:

| Button | Size | Name         | Notation              | Tuplet bracket |
|--------|------|--------------|-----------------------|----------------|
| 2      | 2    | 8th notes    | two 8ths per beat     | none           |
| 3      | 3    | triplet      | three 8ths per beat   | **3**          |
| 4      | 4    | 16th notes   | four 16ths per beat   | none           |
| 5      | 5    | quintuplet   | five 16ths per beat   | **5**          |
| 6      | 6    | sextuplet    | six 16ths per beat    | **6**          |
| 7      | 7    | septuplet    | seven 16ths per beat  | **7**          |

When you check a subdivision, it is **allowed** as a part size in the generated grouping. Unchecked subdivisions are excluded.

At least one subdivision must be checked; clicking the last remaining one re-enables it (prevents empty selection).

## How It Interacts With Generation

The generator enumerates all integer compositions of `totalSlots` that use *only* the allowed part sizes, then selects one via the Musical / Awkward / Both scoring mode.

```
totalSlots = 8, allowed = {3, 4}
Enumerate compositions of 8 using only 3 and 4:
  [4, 4]
  [8] → rejected (not composable from 3 or 4, wait: 4+4 is the only one here)
Actually with {3, 4}:
  [4, 4]           ← valid
  [3, ...] → need 5 more, can't make 5 from {3, 4}, fail
So only [4, 4] is generated.
```

If the allowed set can't compose `totalSlots`, the generator falls back to the unrestricted set to avoid empty output.

## Example Patterns by Subdivision Set

All examples below are actual patterns the generator can produce. Voice sequences come from the curated sticking library (`STICKING_PATTERNS`) with `R → hat`, `L accented → snare`, `L unaccented → ghost`, `K → kick`.

---

### Only Triplets (size 3)

**Setting:** `allowedSubdivisions = [3]`, `totalSlots = 12`

**Possible grouping:** `3 + 3 + 3 + 3` (four triplet beats)

**Example pattern:**
```
Group 1 (triplet):  Tch — kuh — tah     (S G G from sticking RLL)
Group 2 (triplet):  Bum — ts  — pi      (K H H from sticking RLR → K replacement)
Group 3 (triplet):  Tch — ts  — pi      (S H H from sticking RRL)
Group 4 (triplet):  Bum — kuh — tah     (K S S from sticking KRL)
```

**Staff rendering:** Each beat is a triplet bracket of 3 eighth notes.

**Use case:** Pure triplet feel, useful for 12/8 grooves, jazz shuffle swing, or internalizing the triplet grid before adding other densities.

---

### Only 16th Notes (size 4)

**Setting:** `allowedSubdivisions = [4]`, `totalSlots = 16`

**Possible grouping:** `4 + 4 + 4 + 4` (four beats of 16ths)

**Example pattern:**
```
Beat 1 (16th):  Tch — kuh — tah — dah   (from sticking RLRL)
Beat 2 (16th):  Bum — ts  — pi  — ti    (from sticking KRRR)
Beat 3 (16th):  Tch — kuh — ts  — pi    (from sticking RLRL variation)
Beat 4 (16th):  Bum — uh  — kuh — ts    (from sticking RLKR — mixed)
```

**Staff rendering:** Standard 16th notes, 4 per beat, no tuplet brackets.

**Use case:** Linear funk fills, 16th-note rock grooves, straight-ahead beatboxing.

---

### Only Quintuplets (size 5)

**Setting:** `allowedSubdivisions = [5]`, `totalSlots = 10`

**Possible grouping:** `5 + 5`

**Example pattern:**
```
Beat 1 (quintuplet):  Tch — kuh — ts — pi — ti     (from sticking RLRRL → hat-snare-hat-hat-snare)
Beat 2 (quintuplet):  Bum — kuh — tah — ts — pi    (from sticking KLRLR)
```

**Staff rendering:** Two quintuplet brackets, each 5 sixteenths.

**Use case:** The Tigran Hamasyan odd-subdivision feel. Hard to vocalize cleanly — this is where the syllable system really helps.

---

### Only Septuplets (size 7)

**Setting:** `allowedSubdivisions = [7]`, `totalSlots = 14`

**Possible grouping:** `7 + 7`

**Example pattern:**
```
Beat 1 (septuplet):  Tch — kuh — tah — dah — pah — gah — buh   (from sticking RLRLRRL)
Beat 2 (septuplet):  Bum — puh — guh — ts — pi — ti — ki       (from sticking KRLRRLK)
```

**Staff rendering:** Two septuplet brackets, each 7 sixteenths.

**Use case:** Progressive metal fills, Gartska-style 7-in-1-beat phrases. Uses the full extended syllable table.

---

### Triplet + 16th (sizes 3, 4)

**Setting:** `allowedSubdivisions = [3, 4]`, `totalSlots = 7`

**Possible groupings:** `3 + 4`, `4 + 3`

**Example pattern (3+4):**
```
Group 1 (triplet):  Bum — ts — pi        (K H H)
Group 2 (16th):     Tch — kuh — tah — dah (S S S S)
```

**Staff rendering:** Beat 1 has a triplet bracket (3 notes), beat 2 has plain 16ths.

**Use case:** The "push-pull" feel between triplet and 16th time. Classic Gartska orchestration where a triplet fill resolves into a 16th-note groove.

---

### Triplet + Quintuplet (sizes 3, 5)

**Setting:** `allowedSubdivisions = [3, 5]`, `totalSlots = 8`

**Possible grouping:** `3 + 5`, `5 + 3`

**Example pattern (3+5):**
```
Group 1 (triplet):     Tch — kuh — tah                          (S G G)
Group 2 (quintuplet):  Bum — ts — pi — kuh — tah                (K H H S S)
```

**Staff rendering:** Triplet bracket then quintuplet bracket.

**Use case:** Extreme polyrhythmic practice. Two tuplets in a row with different densities. The syllables are your anchor — if you lose them, you lose the phrase.

---

### Full Mix (all subdivisions)

**Setting:** `allowedSubdivisions = [2, 3, 4, 5, 6, 7]`, `totalSlots = 16`

**Possible groupings:** Hundreds — the Musical mode tends to favor balanced shapes like `4+4+4+4`, `3+5+3+5`, `5+6+5`, etc.

**Example pattern (3+5+4+4):**
```
Beat 1 (triplet):     Tch — kuh — tah
Beat 2 (quintuplet):  Bum — ts  — pi  — kuh — tah
Beat 3 (16th):        Tch — kuh — ts  — pi
Beat 4 (16th):        Bum — puh — guh — duh
```

**Staff rendering:** Mixed tuplet brackets across the bar — the full Tigran palette.

**Use case:** Advanced drill. Every bar has unpredictable density shifts; you can't rely on muscle memory.

---

## Interactions with Other Modes

### Subdivisions + Groove (implicit)

Every pattern now uses sticking-derived voice sequences by default. The subdivision selector controls *which group sizes* appear; the voice sequence within each group comes from the sticking library and is always groove-shaped (no 3 consecutive same voices, kick-snare anchoring, etc.).

### Subdivisions + Beat-Locked

When `Beat-locked` is on, each group spans exactly 1 beat — so:
- Size 3 group = 3 notes in 1 beat (genuine triplet timing)
- Size 4 group = 4 notes in 1 beat (genuine 16th timing)
- Size 5 group = 5 notes in 1 beat (genuine quintuplet timing)

Without beat-locked, each *slot* is 1 unit and groups have proportional durations.

### Subdivisions + Polymetric Cycle

The phrase grouping (e.g., `3+5`) repeats over the meter (e.g., 4 beats). With only size-5 allowed, a grouping of `[5]` cycling over a 4-beat meter produces the classic 5-over-4 displacement.

### Subdivisions + Custom Grouping

When you use the **Custom** grouping input (e.g., `3+5+3+5`), the subdivision checklist is **bypassed** — your explicit grouping is used as-is. The checklist only affects Random mode generation.

---

## Practical Drill Progression

A suggested practice sequence:

1. **Week 1 — Single tuplet** (triplets only): `[3]` checked, `totalSlots = 12`
2. **Week 2 — 16ths only** (straight feel): `[4]` checked, `totalSlots = 16`
3. **Week 3 — Binary mix** (triplet + 16th): `[3, 4]` checked, `totalSlots = 7` or `11`
4. **Week 4 — Add quintuplets** (`[3, 4, 5]`), `totalSlots = 12`
5. **Week 5 — Full odd-tuplet palette** (`[3, 5, 6, 7]`), `totalSlots = 15` or `20`
6. **Week 6 — Polymetric cycles** with odd subdivisions against a 4-beat meter

Each stage introduces one new density family. Use the syllable matrix cheat sheet (always visible at the top of the screen) as your reference.

---

## File Reference

- **Subdivision checklist UI:** `src/components/VocalPercussion.tsx` — SUBDIVISIONS section in the left control panel
- **Generation filter:** `src/lib/vocalPercussionData.ts` — `generateFilteredCompositions()` + `generateRandomGrouping()`
- **Cheat sheet matrix:** `src/components/VocalPercussionCheatSheet.tsx` — always-visible 4×7 syllable table, voice-colored
