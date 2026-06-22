# Tonal Audiation — Sized-Interval Chord Notation

Canonical reference for the chord notation used when porting 50-EDO (and every
other EDO) to Tonal Audiation. The canonical symbol is **form C** — an anchored
interval-set, `{<sized codes>}/<anchor>`. It is built from scratch on the
Interval-Spectrum size system; it deliberately keeps **nothing** from
traditional notation except the single idea that **"1 is home."**

---

## 1. Principles

1. **A chord is an anchored interval-set.** The canonical symbol is **form C**:
   `{<codes>}/<anchor>`. The **anchor** names where the chord's root sits — its
   sized interval up from home (`1` = tonic/home). The **set** lists every
   interval of the chord measured from its own root. There is **no Roman
   numeral** and no diatonic-function layer; position is just another sized
   interval.
2. **Quality + microtonal size live entirely in the interval codes.** Both the
   anchor and every set member are sized codes — one alphabet end to end.
3. **Every interval code is `[size][quality][degree]`**, where
   `s` = small, `l` = large, **nothing = center**.
4. **No `°`, no `+`, no privileged "default" third, no hidden 5th.**
   Diminished/augmented are just *sized fifths* (`s5` / `l5`); the set is
   complete, so the perfect 5th is listed and a missing 5th is simply absent.
   Neutral thirds have **no special status** — they fall on the `lm3`/`sM3`
   part of one continuous ladder.
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
chord   ::= "{" set "}" "/" anchor
anchor  ::= code | "1"               ; root's sized interval from home; 1 = tonic
set     ::= code { " " code }        ; ascending, root-relative; complete
code    ::= [ "s" | "l" ] quality degreeNumber
quality ::= "m" | "M" | ""           ; "" for perfect degrees (4,5,8)
```

Rules:
- **The set is complete and honest.** Every sounding interval from the root is
  listed, ascending — including the **perfect 5th** (`5`), which is *not*
  hidden. A sized fifth shows its raw code (`s5` / `l5`); a missing 5th is just
  absent (no `no5` flag — absence is the statement).
- **The third is part of the set** and sets the chord's color.
- **Extensions:** when a 7 is present the upper 2nd / 4th / 6th promote to
  9 / 11 / 13 (sized prefix kept: `s11`, `11`, `lM13`, …).
- **The anchor is never special-cased** — it is the root's sized interval from
  home, exactly like any other code; the tonic chord anchors on `1`.

Conventions:
- **sus / no-3rd:** the set just carries a 4th/2nd instead of a 3rd →
  `{4 5}/1` (sus4), `{M2 5}/1` (sus2).
- **added 6th:** the set carries the 6th → `{sM3 5 M6}/1`.
- **inversions:** append the bass interval in brackets after the anchor →
  `{sM3 5}/1[5]` (the tonic chord with its 5th in the bass). The `/` separates
  set from anchor; `[…]` carries the bass, so the two never collide.

There is **one** form — the complete set. Display density (e.g. collapsing the
implied 5th, or sub-scripting the s/l size for the eye) is a UI concern, not a
notation rule (see §8).

---

## 4. Reading the anchor from an EDO

The anchor is the root's **sized interval from home**; the actual pitch is
whatever that EDO's visualizer key shows at that interval.

- the old "III" of **50-EDO major** anchors on `sM3` — the key at `16\50`.
- in **31-EDO major** that same scale degree is `10\31`, still `sM3`.
- Same symbol, the EDO supplies the steps.

---

## 5. 50-EDO worked examples

Major scale degrees (steps out of 50): `I=0  II=8  III=16  IV=21  V=29  VI=37  VII=45`.
Their sized anchors from home: `1 · sM2 · sM3 · 4 · 5 · sM6 · sM7`.

### Diatonic triads (5th kept explicit in the set)

| old degree | symbol (form C) | set |
|------------|-----------------|-----|
| I   | `{sM3 5}/1`    | sM3 · 5 |
| II  | `{lm3 5}/sM2`  | lm3 · 5 |
| III | `{lm3 5}/sM3`  | lm3 · 5 |
| IV  | `{sM3 5}/4`    | sM3 · 5 |
| V   | `{sM3 5}/5`    | sM3 · 5 |
| VI  | `{lm3 5}/sM6`  | lm3 · 5 |
| VII | `{lm3 s5}/sM7` | lm3 · s5 |

### Sevenths & color chords

| chord | symbol (form C) | set |
|-------|-----------------|-----|
| dominant 7 (V) | `{sM3 5 sm7}/5`     | sM3 · 5 · sm7 (7/4) |
| major 7 (I)    | `{sM3 5 sM7}/1`     | sM3 · 5 · sM7 |
| minor 7 (II)   | `{lm3 5 lm7}/sM2`   | lm3 · 5 · lm7 |
| half-dim (VII) | `{lm3 s5 lm7}/sM7`  | lm3 · s5 · lm7 |
| add6 (I)       | `{sM3 5 M6}/1`      | sM3 · 5 · M6 |
| sus4 (V)       | `{4 5}/5`           | 4 · 5 |

---

## 6. Why nothing is inherited from tradition

- **No Roman numeral / no diatonic function** → position is just the anchor's
  sized interval from home; nothing assumes a 7-note scale or 12-EDO.
- **No case-based major/minor** → a tiny pitch change can never flip a symbol;
  quality lives in the size codes only.
- **No `°` / `+`** → one consistent size mechanism for everything.
- **No "default" third and no hidden 5th** → the set always tells the whole
  truth about the sound; nothing is privileged with a shorter name.
- The only inheritance is **`1` = home** (the anchor of the tonic chord).

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

Store the **full explicit set** (form C); let the UI **collapse/expand** it for
the eye — e.g. render the s/l size as a subscript, drop the implied `5`, or show
just `{sM3}/1` and expand to `{sM3 5 sM7}/1` on hover/click. Density is a display
concern, not a notation flaw — the stored data stays complete and precise, the
screen stays fast to read for audiation.
