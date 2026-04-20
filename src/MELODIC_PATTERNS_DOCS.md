# Melodic Patterns Mode — Complete Documentation

Melodic Patterns is a **material generator** for harmonic instrument practice. It generates chord-melody pairings, lets you control the tension relationship between them, and plays them back with rhythm-aware timing through the audio engine. You configure what you want to practice, generate the material, study it visually and aurally, curate the results, then take them to your instrument.

The intended pipeline mirrors how DrumPatterns works for percussionists: set up your parameters, generate material, study/edit it, export it, practice it on your instrument over progressions.

---

## Pipeline

### How it's meant to be used

1. **Configure** — Pick EDO, tonality, harmony pool, melody categories, motion, approach/enclosure settings.
2. **Generate** — Hit "New Chords" or "New Melodies" to create chord-melody segments.
3. **Curate** — Lock segments you like, step through alternatives on individual segments, browse the chord pool, shuffle melodies.
4. **Listen** — Play individual segments or all at once. Rhythm patterns shape playback timing.
5. **Iterate** — Hit the reshuffle button to get new permutations of the variable side while the fixed side stays locked.
6. **Save** — Save presets for configurations you return to. Log practice sessions. Export to HTML for offline study.
7. **Practice** — Take the generated material to your instrument and improvise over the progressions.

---

## Two Pipelines

Toggled by tabs at the top. Each fixes one side and permutes the other.

### Chords Fixed → Melodies Vary

1. Generates a chord progression using the selected harmony pool and logic mode (functional Markov chain or random).
2. For each chord, generates a melody using the note category toggles, bias, motion, and approach/enclosure controls.
3. "New Melodies" reshuffles melodies while keeping chords fixed.
4. **Same Chord** toggle: uses one chord across all segments — hear N melody permutations over the same harmony.
5. Melody categories immediately regenerate melodies when toggled (chords stay).

### Melody Fixed → Chords Vary

1. Generates melodies without chord context. The seed melody is preserved — it IS the melody you hear.
2. For each melody, searches the harmony pool for a chord whose overlap falls within the **Chord Fit** range.
3. "Reharmonize" re-picks chords while keeping melodies fixed.
4. The **Chord Fit** slider controls consonance (0% = best fit, 100% = clash).

---

## Controls

### Global Settings (Row 1)

| Control | Options | Default | Description |
|---------|---------|---------|-------------|
| EDO | 12, 31, 41 | 31 | Tuning system. All chord types, note names, and Lumatone layout reload on change. |
| Root | 0 through EDO-1 | 0 | Tonic for progression generation and roman numeral analysis. |
| Tonality | Major / Minor / Both | Both | Filters the diatonic chord pool. "Both" mixes major and minor. |
| Melody Notes | 2–8 | 4 | Notes per melody segment. Also sets minimum hits for rhythm generator. |
| Min Chord Notes | 2–8 | 3 | Minimum pitch classes a chord must have. Filters the chord pool. |
| Count | 2, 4, 6, 8, 12, 16 | 4 | Number of segments to generate. |
| Speed | Very Fast (250ms) – Very Slow (1200ms) | Medium (600ms) | Playback gap between melody notes. |

### Harmony Pool (Row 2)

14 toggle buttons controlling which chords appear in the pool:

| Group | Categories |
|-------|-----------|
| **Diatonic** (green) | Functional Harmony (I ii iii IV V vi vii + minor equivalents) |
| **Diatonic** (green) | Modal Interchange (bVII, bVI, bIII, iv, bII, #IV) |
| **Chromatic** (pink) | Secondary Dominants, Secondary Diminished, Neapolitan, Tritone Substitutions, Chromatic Mediants |
| **Extended** (gold) | Chromatic Diatonic (all types on 12 roots), Chromatic 31 (all types on all EDO roots) |
| **Xenharmonic** (purple) | Subminor, Neutral, Supermajor, Classic Min, Classic Maj |

Xenharmonic chords participate in the functional Markov chain as substitutes for their nearest diatonic relative (e.g., supermajor substitutes for major). Transition weight = 15 when enabled, competing equally with standard functional transitions.

### Logic Mode

- **Functional**: Markov chain following common-practice tendencies. Transition tables for diatonic, modal, chromatic, and xenharmonic chords. Each chord's function determines next-chord probabilities.
- **Random**: uniform selection from the enabled pool.

### Chord Fit (melody-first only)

Dual-handle range slider (0–100%). Controls acceptable chord-melody overlap:
- 0–20%: "Best fit" — chords maximally overlap with melody.
- 0–50%: "Good fit".
- 70–100%: "Clash" — deliberately dissonant.
- 0–100%: "Any".

### Melody Controls

| Control | Description |
|---------|-------------|
| **Chord Tones** (green) | Notes in the chord. |
| **Stable Diatonic** (gold) | Natural tensions (9, 11, 13) — 0 accidentals from nearest natural. |
| **Tense Diatonic** (pink) | Chromatic tensions (b9, #11, b13) — 1 accidental. |
| **Stable Microtonal** (blue) | 7-limit and 11-limit JI consonances (7/4, 7/6, 11/8, 11/9, etc.) despite having 2+ accidentals. Classification based on proximity to low-ratio JI intervals within half an EDO step. |
| **Tense Microtonal** (purple) | Higher-limit intervals — 2+ accidentals and NOT close to any 7/11-limit ratio. |
| **Bias** | Inside (chord tones dominate) or Outside (outermost enabled category dominates). |
| **Motion** | Stepwise (enforced perceptual step-size limit) toggle. |
| **Approach** | Chromatic and diatonic approach tones to chord tones. |
| **Enclosure** | Upper + lower neighbor targeting of chord tones. |

At least one melody category must remain enabled.

### Same Chord (chords-first only)

Uses one chord across all segments. The core drill: hear multiple melody permutations over the same harmony to internalize how different lines sound against one chord.

---

## Segment Cards

Each segment displays:

### Chord (left)
- Roman numeral (functional analysis, V/ notation for secondary dominants)
- Chord type name
- Pitch classes as degree names
- Fit percentage (green/gold/pink)
- **Browse** button: opens chord browser filtered to the active harmony pool
- **Step** button (melody-first, ↻): try another chord from the pool

### Melody (center)
- **KEY row** (gold): scale degree relative to tonic, colored by category
- **CHORD row** (blue): scale degree relative to chord root
- Intervals between notes (signed integers)
- Contour string (arrows)
- **Melody step** button (↻ melody): try another melody permutation

### Actions (right)
- **Lock** (🔒/🔓): locked segments skip reshuffle. Keeps segments you like while varying the rest.
- **Play** (▶): chord sustained, then melody with rhythm-aware timing
- **Melody only** (♪): melody without chord
- **Remove** (✕): delete segment (disabled at 1)

---

## Melody Generation Algorithm

Four-pass architecture in `randomMelodyWithAngularity()`:

### Pass 1: Role Assignment

Metric weights (from rhythm generator or default phrase weights) determine which note positions are **targets** (strong beats, get chord tones) vs **connectors** (weak beats, get passing/approach tones). Target fraction adjusts for approach/enclosure (fewer targets = more gaps for connector strategies).

### Pass 2: Target Generation

For each target position, selects a pitch class using weighted random choice:

- **Category weight**: chord tones boosted by `(2.0 - bias)`, further multiplied by cross-segment arc boost (grounded opening, colorful middle, strong resolution on final segment).
- **Duration-aware tension**: metrically strong positions (likely longer notes) get extra CT boost (`1 + posWeight * 1.5`, range 1.0–2.5). Long dissonances are more exposed; the algorithm avoids them.
- **Contour bias**: five shapes (arch, ascending, descending, valley, plateau) selected by phrase-arc position. Ascending/arch for opening segments, plateau for middle, descending/valley for closing.
- **Stepwise constraint**: enforced in perceptual interval space — notes beyond `leapThreshold` EDO steps (≈ one diatonic step) get weight 0. Not pool-index adjacency.
- **Guide-tone awareness**: first note prefers 3rds/7ths of the chord when voice-leading from a previous segment.
- **Cross-segment voice-leading**: last note of each segment strongly favors half-step proximity (3x boost) or common tones (2x) with the next chord's pitch classes. Creates smooth chord-to-chord connections.

### Pass 3: Connector Filling

Fills gaps between targets using five strategies, tried in order:

1. **Motivic repetition**: captures an interval cell from the first gap, transposes or inverts it in subsequent gaps. Cells with leaps are skipped in stepwise mode.
2. **Scalar passing fill**: when targets are close in PC space, fills with a scale-step run.
3. **Enclosure**: upper + lower neighbor of a target, placed at gap boundaries.
4. **Approach note**: chromatic or diatonic neighbor placed just before the next target.
5. **Free fill**: weighted random with tension-release (CT after tension, tension after CT).

All strategies use `fillSmooth` for remainder positions — walks toward the next anchor via scale steps instead of random picks. The boundary interval to the next placed note is checked to prevent "smooth walk ending in a leap."

### Pass 4: Octave Placement

Converts pitch classes to absolute pitches:

- **Closest octave** preference in stepwise mode (deterministic).
- **Contour-aware nudging** even in stepwise mode: if the contour wants ascending and the closest octave goes down, try the next octave up — but only if it stays within a step-size interval. Prevents register-flatness without causing leaps.
- **Registral pull**: after 3 notes, discourage drifting more than 1.2 octaves from the phrase center.
- **Leap recovery**: after a leap, prefer the opposite direction for the next note.

---

## Rhythm Integration

### Metric Weight Coupling

The `MelodicRhythm` component generates two rhythm lines (Chord + Melody) and reports:
- **Metric weights**: normalized strength per melody hit position. Fed into Pass 1 (target/connector assignment) and Pass 2 (duration-aware tension).
- **Rhythm timing data**: per-note durations as fractions of the bar. Fed into playback for variable note spacing.

### Rhythm-Aware Playback

When rhythm timing data is available, melody playback uses variable note durations instead of equal spacing. A dotted quarter in the rhythm notation rings longer, an eighth note is short. The total bar duration stays proportional to `noteCount × playbackSpeed` so the overall feel matches the speed setting.

### Styles

| Style | Character |
|-------|-----------|
| Straight | On-beat reinforcement, offbeat suppression |
| Syncopated | Displaced accents, anticipations boosted |
| Triplet | 3-per-beat grid, skip and shuffle accents, tuplet brackets |
| Bossa | Mid-bar anticipation, bossa nova rhythmic cell |
| Clave | 3-2 density split, son clave tension/release |
| Displaced | Everything before the beat, push/pull feel |

---

## Audio Playback

### Single Segment (▶)
1. Chord plays at t=0: all chord PCs at octave 3, volume 0.35, sustained through melody.
2. After `max(600ms, speed × 1.5)`, melody begins with rhythm-derived durations.
3. Each note sustains for 85% of its duration gap.

### Melody Only (♪)
Same as above without the chord.

### Play All (Space)
Plays segments sequentially. Active segment indicator advances. Duration per segment accounts for rhythm timing.

### Keyboard Shortcuts
- **Space**: play all segments
- **R**: regenerate

---

## Presets

Save and load full configuration snapshots to localStorage:

- **Save**: captures all settings (EDO, tonality, pipeline, harmony pool, melody categories, bias, motion, approach, enclosure, pattern length, chord notes, count, fit range, same chord, speed). Named presets; duplicate names overwrite.
- **Load**: restores all settings with one click.
- **Delete**: removes a preset.

Stored under `lt_melodic_presets` in localStorage.

---

## Practice Log

Track practice sessions:

- **Log Session**: records timestamp, preset/settings description, duration (minutes since session start), segment count.
- **History**: scrollable log of past sessions with date, preset, duration, segments.
- Sessions under 1 minute are skipped.
- Keeps last 100 entries in localStorage under `lt_melodic_practice_log`.

---

## Export

**Export HTML**: downloads a self-contained HTML file with:
- All segments as an editable table (chord info + melody degrees + intervals)
- Sticky toolbar with **Print / PDF** and **Download HTML** buttons
- Content area is `contenteditable` — edit chord names, add annotations, etc.
- "Download HTML" re-exports the edited content as a clean file

---

## Lumatone Keyboard Visualizer

Displays the isomorphic Lumatone keyboard for the current EDO. During playback, active notes highlight in real-time. When the inline visualizer scrolls out of view, a floating miniature appears in the bottom-left corner.

---

## Chord Browser

Modal overlay for manually picking a chord. Filtered to only show chords from the active harmony pool (harmony categories + tonality). Chords scored by melody fit (best overlap first) with a search field for filtering by roman numeral or chord type name.

---

## Files

| File | Role |
|------|------|
| `components/MelodicPatterns.tsx` | Main component: UI, state, generation orchestration, playback, presets, practice log, export |
| `components/MelodicRhythm.tsx` | Rhythm sub-component: VexFlow notation, metric weight + timing data export |
| `lib/melodicPatternData.ts` | Core data engine: 4-pass melody generation, chord-melody fit, progression generation, note classification, JI-based microtonal classification, roman numerals |
| `lib/rhythmGen.ts` | Rhythm generation: metric weights, style transforms, phrase arcs, hit generation |
| `lib/edoData.ts` | EDO chord type definitions, degree names, interval maps |
| `lib/musicTheory.ts` | Voicing patterns (60+ entries across 6 groups) |
| `lib/audioEngine.ts` | Web Audio playback (chord sustain, melody sequences, individual note scheduling) |
| `components/LumatoneKeyboard.tsx` | Lumatone isomorphic keyboard visualizer |

---

## State & Re-generation Triggers

| Trigger | Effect |
|---------|--------|
| EDO, tonality, harmony categories, or root change | Full regeneration (chords + melodies) |
| Note category toggles (chords-first) | Melodies re-generated over existing chords |
| Rhythm weights change (chords-first) | Melodies re-generated with new metric coupling |
| Pipeline switch | No automatic regeneration |
| Fit range change (melody-first) | No automatic regeneration (use "Reharmonize") |
| Rhythm style or time signature change | Rhythm lines regenerate, segments unaffected |
| Preset load | All settings restored, full regeneration triggered |

---

## Microtonal Classification (7/11-limit JI)

The Stable vs Tense Microtonal split is based on just intonation consonance theory (Partch, Tenney, Erlich):

**Stable Microtonal** — intervals approximating 7-limit or 11-limit JI ratios within half an EDO step:

| Ratio | Cents | Name |
|-------|-------|------|
| 8/7 | 231 | Septimal whole tone |
| 7/6 | 267 | Subminor third |
| 11/9 | 347 | Neutral third |
| 9/7 | 435 | Supermajor third |
| 11/8 | 551 | Undecimal tritone |
| 7/5 | 583 | Septimal tritone |
| 10/7 | 617 | Septimal tritone (greater) |
| 16/11 | 649 | Undecimal diminished fifth |
| 14/9 | 765 | Subminor sixth |
| 18/11 | 853 | Neutral sixth |
| 12/7 | 933 | Supermajor sixth |
| 7/4 | 969 | Harmonic seventh |
| 11/6 | 1049 | Neutral seventh |
| 12/11 | 151 | Neutral second |

**Tense Microtonal** — 2+ accidentals that are NOT close to any of the above. Higher odd-limit, no harmonic series anchor.
