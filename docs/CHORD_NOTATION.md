# Tonal Audiation — Sized-Interval Chord Notation

Canonical reference for the chord/Roman-numeral notation used when porting
50-EDO (and every other EDO) to Tonal Audiation. It is built from scratch on
the Interval-Spectrum size system; it deliberately keeps **nothing** from
traditional notation except the single idea that **"1 is home."**

---

## 1. Principles

1. **The numeral is pure position.** A Roman numeral names the chord root's
   **scale-degree position** (`I` = tonic/home, `II`, `III`, …). It is *never*
   decorated with quality or size. `I` is always just `I`.
2. **Quality + microtonal size live in the interval codes**, never on the
   numeral. (So there is no case to flip at the neutral boundary.)
3. **Every interval code is `[size][quality][degree]`**, where
   `s` = small, `l` = large, **nothing = center**.
4. **No `°`, no `+`, no privileged "default" third.** Diminished/augmented are
   just *sized fifths*. Neutral thirds have **no special status** — they fall on
   the `lm3`/`sM3` part of one continuous ladder.
5. **EDO-agnostic.** A symbol names a *shape*. The engine fills in the actual
   steps/cents per EDO by reading the root's interval-from-tonic off that EDO's
   Lumatone-visualizer key labels. The same symbol = the same shape everywhere.

---

## 2. Interval-code vocabulary (the ladders)

Each generic degree is one continuous size ladder. `m`/`M` are just labels for
the two adjacent banded regions; the neutral zone is simply where `lm` meets
`sM` — no separate symbol.

| degree | minor band | perfect | major band |
|--------|------------|---------|------------|
| 2nd | `sm2 · m2 · lm2` | — | `sM2 · M2 · lM2` |
| 3rd | `sm3 · m3 · lm3` | — | `sM3 · M3 · lM3` |
| 4th | — | `s4 · 4 · l4` | — |
| 5th | — | `s5 · 5 · l5` | — |
| 6th | `sm6 · m6 · lm6` | — | `sM6 · M6 · lM6` |
| 7th | `sm7 · m7 · lm7` | — | `sM7 · M7 · lM7` |
| octave | — | `8` | — |

- `s5` = the old "diminished 5th"; `l5` = the old "augmented 5th".
- `l4` / `s5` cover the tritone region (use whichever the chord spells).
- Unison/root, when it needs a code, is `1`.

---

## 3. Chord grammar

```
chord   ::= degree  stack
degree  ::= "I" | "II" | "III" | "IV" | "V" | "VI" | "VII" | "VIII" | …
stack   ::= code { code }            ; ascending order, root-relative
code    ::= [ "s" | "l" ] quality degreeNumber
quality ::= "m" | "M" | ""           ; "" for perfect degrees (4,5,8) and unison
```

Rules:
- **Perfect 5 (`5`) is the default** and may be omitted from the written form.
- The **third is normally shown** (it sets the chord's color).
- Everything above the fifth — altered 5th, 6th, 7th, extensions — is appended
  **in ascending order**.
- The **root numeral is never sized**; `I` is home.

Conventions to confirm/extend:
- **sus / no-3rd:** replace the third with a 4th code → `I 4` (sus4), `I M2`
  (sus2).
- **added 6th:** append the 6th → `I sM3 M6`.
- **inversions:** (optional) slash with the bass degree, e.g. `I sM3 / III`.

Forms:
- **Full/explicit:** `I sM3 5 sM7`
- **Compact** (drop default 5): `I sM3 sM7`

---

## 4. Reading the degree from an EDO

The numeral is the root's **position** in the chosen scale; the actual pitch is
whatever that EDO's visualizer key shows.

- `III` in **50-EDO major** = the key at `16\50` (`sM3` from the tonic).
- `III` in **31-EDO major** = `10\31`.
- Same symbol, the EDO supplies the steps.

---

## 5. 50-EDO worked examples

Major scale degrees (steps out of 50): `I=0  II=8  III=16  IV=21  V=29  VI=37  VII=45`.

### Diatonic triads (perfect 5 omitted)

| degree | symbol | tone stack |
|--------|--------|-----------|
| I   | `I sM3`      | sM3 · 5 |
| II  | `II lm3`     | lm3 · 5 |
| III | `III lm3`    | lm3 · 5 |
| IV  | `IV sM3`     | sM3 · 5 |
| V   | `V sM3`      | sM3 · 5 |
| VI  | `VI lm3`     | lm3 · 5 |
| VII | `VII lm3 s5` | lm3 · s5 |

### Sevenths & color chords

| chord | symbol | tone stack |
|-------|--------|-----------|
| dominant 7 (V) | `V sM3 sm7` | sM3 · 5 · sm7 (7/4) |
| major 7 (I) | `I sM3 sM7` | sM3 · 5 · sM7 |
| minor 7 (II) | `II lm3 lm7` | lm3 · 5 · lm7 |
| half-dim (VII) | `VII lm3 s5 lm7` | lm3 · s5 · lm7 |
| add6 (I) | `I sM3 M6` | sM3 · 5 · M6 |
| sus4 (V) | `V 4` | 4 · 5 |

---

## 6. Why nothing is inherited from tradition

- **No case-based major/minor** on the numeral → removes the neutral-boundary
  discontinuity (a tiny pitch change can never flip a symbol's case).
- **No `°` / `+`** → one consistent size mechanism for everything.
- **No "default" third** → the symbol always tells the truth about the sound;
  the common chord isn't privileged with a shorter name.
- The only inheritance is **`I` = home**.

---

## 7. Scope across EDOs

- This sized-interval convention is the **default for every EDO**. Because it is
  cents-based, the same symbol names the same shape in 22, 41, 50, 53, … — the
  engine reads the root degree off that EDO's visualizer labels and fills steps.
- **31-EDO is the one exception: keep it as-is.** 31 retains its existing
  dedicated chord notation (the Modulation & Borrowing tab / `modulationData.ts`
  septimal `s` / `n` / `S` Roman system). Do not override 31 with this system.

The live chord readout in the Interval Spectrum (`chordNotation.ts`) already
emits this convention for any sounding set of pitches, in any EDO.

## 8. Display note (not a notation rule)

Store the **full explicit stack**; let the UI **collapse/expand** it (e.g. show
`I sM3` or a functional skeleton, expand to `I sM3 5 sM7` on hover/click).
Density is a display concern, not a notation flaw — the data stays complete and
precise, the screen stays fast to read for audiation.
