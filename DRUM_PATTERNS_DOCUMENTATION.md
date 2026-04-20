# Drum Patterns Tab - Documentation

The Drum Patterns tab is a comprehensive drum practice system with four sub-tabs, each targeting a different aspect of drumming technique. All four share a common notation renderer, practice log, and export system.

---

## Shared Concepts

### The Permutation System

All pattern generation is built on **permutations** -- every possible combination of hit positions within a single beat.

For a 16th note grid (4 slots per beat: `1 e + a`):
- **Family 1** (1 note/beat): 4 permutations -- `[1]`, `[e]`, `[+]`, `[a]`
- **Family 2** (2 notes/beat): 6 permutations -- `[1,e]`, `[1,+]`, `[1,a]`, `[e,+]`, `[e,a]`, `[+,a]`
- **Family 3** (3 notes/beat): 4 permutations
- **Family 4** (4 notes/beat): 1 permutation (all slots filled)

Family number = note density. Higher family = busier pattern. This system lets you systematically explore every rhythmic possibility within a beat.

### Musical vs Awkward Scoring

Three sub-tabs (Accent, Stickings, Independence) use a shared scoring framework with two modes:

- **Musical** -- favors patterns that sound natural: symmetry, repeated structures, grounded pulse, on-beat anchoring
- **Awkward** -- favors patterns that challenge you: asymmetry, syncopation, odd groupings, missing downbeats
- **Both** -- coin-flip between musical and awkward each generation

The system works by extracting numerical features from each candidate pattern, multiplying by mode-specific weights, and doing a probabilistic pick biased toward higher scores. This means you get consistent aesthetic character without exact repetition.

### Notation Rendering

All four tabs render standard drum notation via VexFlow:
- **Top staff** -- cymbal/hi-hat (x noteheads), snare (regular noteheads), ghost notes (parenthesized)
- **Bottom staff** -- bass drum (stems down), hi-hat foot (x noteheads, stems down)
- Open hi-hat shown as circle-x noteheads
- Accents shown as `>` marks above notes
- Stickings shown as R/L/K text below

### Practice Log

Every tab can log exercises to a shared practice log:
- **Star rating** (1-5) per line or variant
- **Tag** -- "Isolation" (working on this pattern alone) or "Context" (playing within a larger musical context)
- **Snapshot** -- saves full exercise state for later review
- All entries stored in localStorage, browsable by date

### MusicXML Export

Ostinato and Accent Study tabs support MusicXML export (downloadable `.musicxml` files) for use in Finale, Sibelius, MuseScore, etc.

---

## 1. Cymbal Ostinato

**Purpose**: Build and explore multi-voice drum patterns with a fixed or variable cymbal/hi-hat pattern as the foundation.

### Concept

You select a cymbal ostinato (ride/hi-hat pattern), then layer snare, bass, ghost notes, and hi-hat foot patterns on top. The permutation system lets you systematically explore every possible voice combination within your chosen grid.

### Controls

**Grid** -- Subdivision: 8th, 16th, Triplet, Quintuplet, Sextuplet, Septuplet, 32nd. Determines how many slots per beat are available.

**Ostinato Library** -- 15 pre-built cymbal patterns ranging from sparse (quarter notes) to dense (all 16ths), with open hi-hat variants. Select one as your foundation.

**Voice Rows** -- Five voices, each with independent controls:
| Voice | Label | What it controls |
|-------|-------|-----------------|
| **O** (Ostinato) | Cymbal/ride pattern | Closed hits, open positions, doubles |
| **S** (Snare) | Snare drum | Which beat positions get snare hits |
| **B** (Bass) | Bass drum | Kick pattern |
| **G** (Ghost) | Ghost notes | Quiet snare taps (shown in parentheses) |
| **HH** (HH Pedal) | Hi-hat foot | Foot splash pattern, open positions |

Each voice row has:
- **Family count** -- how many notes per beat (1=quarter, 2=8ths, etc.)
- **Permutation cards** -- click to select a specific beat pattern
- **Open/Double toggles** -- mark specific beat-slots as open hi-hat or double-strokes
- **Pool mode** -- multi-select permutations for randomized generation

**Measure Strip** -- Built measures appear in a scrollable strip at the bottom. Click to select/edit, click x to delete.

**+ Phrase / + Line** -- Add current preview to the strip (same line or new line).

**+ Permutations** -- Duplicate the current phrase across all pool combinations. Creates a systematic practice sheet covering every selected permutation.

### Rotation System (Beta)

When measures are built, the rotation engine cycles through them during playback:
- Set **rotation amount** (how many full plays before advancing)
- **Accent mode** per bar: Accent / Normal / Silent (3-state cycle)
- **BPM** syncs with the universal metronome
- Countdown dots show progress within each rotation

### Quickmarks

Save/load full ostinato configurations:
- Capture current state (grid, ostinato, all voice selections) as a named bookmark
- Load instantly to restore a setup
- Useful for saving genre-specific configurations (jazz ride, funk hats, etc.)

### Pool Presets

Save/load voice-specific permutation selections:
- Per-voice preset storage (e.g., "sparse kicks", "dense ghost pattern")
- Quick-load bar for rapid voice configuration changes

---

## 2. Accent Study

**Purpose**: Practice accent placement, sticking patterns, and rhythmic grouping across any subdivision.

### Concept

The generator creates a **rhythmic grouping** (e.g., 3-4-2-3 = groups of 3, 4, 2, 3 slots) where the first note of each group is accented. You then apply sticking patterns, interpretation modes, and orchestration to turn it into a full exercise.

### Controls

**Grid** -- 8th, 16th, Triplet, Quintuplet, Sextuplet, Septuplet, 32nd, Mixed.

**Beats** -- 1 through 8 beats per measure.

**Pattern Mode** -- Musical / Awkward / Both. Affects how groupings are generated:
- Musical: fewer groups, uniform sizes, symmetry, avoids isolated singles
- Awkward: more groups, wide size range, asymmetry, edge-1s allowed

**Grouping Display** -- Visual dots showing the accent pattern, with group sizes labeled (e.g., "3-4-5-4"). The Generate button picks a new grouping; custom input lets you type one manually.

**Start Mode**:
- *Accent* -- first note of each group always accented
- *Random* -- accent placement randomized within groups

**Sticking Options**:
| Option | Pattern |
|--------|---------|
| Single Strokes | RLRL... alternating |
| Paradiddle | Group-aware doubles (RLRR LRLL) |
| Odd Sticking | Constrained to 3, 5, 7-slot groups |
| Even Sticking | Constrained to 2, 4, 6, 8-slot groups |

- **Bias R** toggle: lead with right or left hand

**Interpretation** -- How accents and taps are played:
| Accent Interpretation | Effect |
|----------------------|--------|
| Normal | Standard accent |
| Flams | Grace note before accent |
| Doubles | Two rapid strokes |
| Buzz | Buzz roll |

| Tap Interpretation | Effect |
|-------------------|--------|
| Normal | Standard tap |
| Buzz | Buzz roll on taps |
| Flams | Grace note on taps |
| Doubles | Two rapid strokes on taps |

**Bass Option**:
- *None* -- accents and taps stay on snare
- *Replace Accents* -- accented notes move to bass drum
- *Replace Taps* -- tap notes move to bass drum

**Orchestration**:
- *Snare Only* -- everything on snare
- *Snare + Toms* -- alternate accents between snare and toms
- *Accent to Tom* -- all accents on tom
- *Accent to Crash* -- all accents get crash cymbal

**Slot Mods** -- Per-slot modifications:
- **Rest** -- silence a specific slot (R button per slot)
- **Split** -- convert a 16th to two 32nds (32 button per slot)
- **Musical/Awkward** auto-generation buttons with scoring
- Musical rests: avoid downbeats, prefer weak positions
- Awkward rests: target downbeats and strong accents

### Rating System

Each line in the strip gets **per-variant ratings**:
- Rate each interpretation variant independently (Accent: Normal/Flams/Doubles/Buzz x Tap: Normal/Buzz/Flams/Doubles)
- Star ratings (1-5) per variant per line
- Log button sends rated variants to practice log

### Composed Studies

The **Composed** sub-tab provides pre-composed exercises:
- Mixed-subdivision measures (e.g., beat 1 = quarter, beat 2 = triplet, beat 3 = 16ths)
- Import as phrase (same line) or new line
- Tuplet brackets rendered automatically

---

## 3. Stickings Study

**Purpose**: Practice rudiment combinations and sticking pattern vocabulary.

### Concept

The generator fills a measure (configurable pulse count) with sticking patterns drawn from a library of ~900+ rudiment fragments. You filter by group size, kick count, and rudiment family, then the system fills the measure with compatible patterns scored for musical or awkward character.

### Controls

**Pulse Count** -- 4 to 32 slots to fill (default 16 = one bar of 16ths).

**Beam Groups** -- How notes are visually grouped in notation (e.g., "4+4+4+4" for standard 16th beaming, "3+3+3+3+4" for displaced grouping). Text input with apply button.

**Pattern Filters**:

| Filter | Options | Effect |
|--------|---------|--------|
| **Group sizes** | 2, 3, 4, 5, 6, 7 | Which pattern lengths can be used |
| **Kick count** | 0, 1, 2, 3 | How many K (bass) hits per pattern |
| **Families** | Single, Double, 3K, Paradiddle | Rudiment type filter |

**Pattern Mode** -- Musical / Awkward / Both:
- Musical: prefers uniform group sizes, repeated patterns, low kicks, same rudiment family
- Awkward: prefers mixed sizes, variety, more kicks, mixed families

**Generate** -- Fill the measure with filtered, scored patterns.

### Pattern Library

~900+ sticking patterns organized by group size (2-7 slots):

**Notation**: R = Right hand, L = Left hand, K = Kick (bass drum)

Examples by family:
- **Singles**: RL, RLR, RLRL, RLRLR...
- **Doubles**: RR, LL, RRLL, RLLR...
- **With kicks**: RK, LK, RLK, RLKR, RKLR...
- **Paradiddles**: RLRR, LRLL, RLRRK...

Each pattern has a label describing its rudiment type and kick positions.

### Display

Measures show:
- Sticking letters (R/L/K) as notation text
- Bass drum hits (K) rendered on bass drum line
- Non-K hits on snare line
- Beam grouping brackets above notes

---

## 4. Independence

**Purpose**: Practice 4-way limb independence through random multi-voice coordination.

### Concept

Inspired by Gary Chester's *New Breed* and Marco Minnemann's *Extreme Independence*. Each limb (cymbal, snare, bass, hi-hat foot) gets an **independently randomized rhythm** where every beat can have a different pattern. The challenge is the combination -- playing four independent lines simultaneously.

Unlike the Ostinato tab where the cymbal pattern is fixed and other voices layer on top, here ALL voices vary independently, and each beat within each voice is separately randomized.

### Controls

**Grid** -- 8th, 16th, Triplet.

**Pattern Mode** -- Musical / Awkward / Both. This is where the real value is:

**Musical mode** favors combinations that sound like actual drumming:
- Bass on beat 1 (+100), bass+cymbal anchoring on downbeats (+120)
- Snare on beats 2 & 4 (backbeat, +80)
- Consistent cymbal pattern across beats (+80)
- Moderate unison between voices (+40)
- Avoids rapid foot alternation (-80) and bass syncopation (-60)

**Awkward mode** strips away all familiar landmarks:
- No beat 1 bass (-60), no downbeat anchoring (-80)
- No backbeat snare (-80)
- Irregular cymbal patterns (-80)
- Maximum beat-to-beat variety (+100)
- Bass on offbeats (+100), rapid foot switching (+80)
- Cross-limb syncopation rewarded (+80)

**Voice Configuration** -- Four rows, one per limb:

| Voice | Label | Default |
|-------|-------|---------|
| **C** (Cymbal) | Ride/hi-hat hand | Enabled, family 2 |
| **S** (Snare) | Snare hand | Enabled, families 1-2 |
| **B** (Bass) | Bass drum foot | Enabled, families 1-2 |
| **H** (HH Foot) | Hi-hat pedal foot | Disabled |

Each voice has:
- **Enable/Disable** -- click the voice label to toggle
- **Family buttons** (1, 2, 3, 4) -- which note densities this voice can draw from. The numbers mean "notes per beat": 1 = quarter notes, 2 = two hits per beat, 3 = three per beat, 4 = all 16ths. Toggle multiple to allow mixed densities.
- **Lock toggle** -- keeps this voice's pattern frozen when you hit Generate. This is the core *New Breed* method: lock the cymbal, regenerate snare/bass until you find a challenging combination.

**Pattern Dots** -- Below the notation preview, colored dots show each voice's hit positions across the full measure, with per-beat perm IDs displayed. This lets you quickly see the independence relationships at a glance.

**Hard Constraint**: Bass and HH Foot can never hit the same slot (physically impossible -- same player, two feet, one moment).

### Action Buttons

- **Generate** -- Re-randomize all unlocked voices
- **+ Phrase** -- Add preview to current line
- **+ Line** -- Add preview as a new line
- **Replace M#** -- Replace a selected measure with current preview

### Scoring Details

Generation creates 80 candidate combinations, extracts 12 features from each, applies mode weights, then does a weighted probabilistic pick. A novelty penalty discourages repeating perm IDs from the last 4 measures.

The 12 features:
1. **Unison density** -- how often 2+ voices coincide
2. **Downbeat anchoring** -- bass+cymbal on beats 1-4
3. **Beat 1 bass** -- whether bass plays on beat 1
4. **Backbeat snare** -- snare on 2 & 4
5. **Beat variety** -- how many beats have unique voice combinations
6. **Bass syncopation** -- fraction of bass on offbeats
7. **Cymbal regularity** -- how uniform the cymbal pattern is
8. **Foot alternation** -- rapid bass/hhFoot switching
9. **Cross-limb syncopation** -- voices offsetting each other
10. **Density balance** -- evenness of attacks across beats
11. **Total density** -- overall busyness
12. **Snare variety** -- unique snare patterns across beats

---

## Export

The **Export** button (top-right) opens a dialog for MusicXML export:
- **Ostinato measures** -- all built measures from the Cymbal Ostinato tab
- **Accent Study measures** -- all built measures from the Accent Study tab
- Download as `.musicxml` file or copy to clipboard
- Compatible with Finale, Sibelius, MuseScore, and other notation software

Exports include:
- Proper percussion clef and instrument mapping
- Noteheads (x for cymbals, circle-x for open, standard for drums)
- Stem directions (up for hands, down for feet)
- Articulations (accents, ghost parentheses)
- Tremolo marks (doubles, buzz rolls)
- Grace notes (flams)
- Sticking text (R/L labels)

---

## Feature Comparison

| Feature | Ostinato | Accent | Stickings | Independence |
|---------|----------|--------|-----------|--------------|
| Grids | 7 types | 8 types | Pulse-based | 3 types |
| Musical/Awkward | -- | Yes | Yes | Yes |
| Voice independence | Layered on fixed ostinato | Single voice + bass | Single voice | All 4 voices independent |
| Paradiddle support | Yes | Yes (interpretation) | -- | -- |
| Open hi-hat | Yes | -- | -- | -- |
| Ghost notes | Yes | Yes | -- | -- |
| Orchestration | Open/close/doubles | Snare/tom/crash | -- | -- |
| Voice locking | -- | -- | -- | Yes |
| Rotation/playback | Yes (beta) | -- | -- | -- |
| Quickmarks | Yes | -- | -- | -- |
| Pool presets | Yes | -- | -- | -- |
| MusicXML export | Yes | Yes | -- | -- |
| Composed studies | -- | Yes | Partial | -- |
| Per-variant rating | -- | Yes (8 variants) | -- | -- |
| Practice log | Yes | Yes | Yes | Yes |
