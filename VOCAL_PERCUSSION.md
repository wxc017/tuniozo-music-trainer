# Vocal Percussion Mode — Technical Documentation

## Overview

The Vocal Percussion mode is a training system for internalizing rhythmic patterns through vocalization. Inspired by Matt Garstka and Tigran Hamasyan, it maps drum kit voices to phonetic syllable families and generates patterns through rhythmic groupings, producing vocalizable linear drum grooves displayed as konnakol-style notation.

Core building blocks reused from the rest of the app:

- **Grouping Selector** (`lib/groupingSelector.ts`) — Lerdahl & Jackendoff-derived classification and selection of integer compositions.
- **Accent-study generator** (`lib/accentData.ts`) — musical/awkward grouping picker used by the Accent Study feature; the same generator drives both "16th groups" pattern generation and the "Groupings" accent mode.
- **Sticking catalog** (`lib/stickingsData.ts`) — 675 curated R/L/K patterns used to fill group slots with syllables via sticking-to-voice mapping.
- **Konnakol notation renderer** (`components/KonnakolNotation.tsx`) — VexFlow-based rendering engine; Vocal Percussion adds voice-colored annotations and hidden-rest pulse-alignment on top.

---

## Architecture

```
lib/vocalPercussionData.ts    Data model, generation engine, audio synthesis
components/VocalPercussion.tsx UI component (controls + pattern display)
components/KonnakolNotation.tsx Notation rendering (shared)
lib/groupingSelector.ts       generateAndSelectGrouping()
lib/accentData.ts             generateMusicalGrouping / generateAwkwardGrouping
lib/stickingsData.ts          STICKING_PATTERNS catalog
```

Wired into `App.tsx` as section `"vocal-percussion"` under the **Practice** optgroup.

---

## Phonetic Syllable System

Four drum voices, each with a unique articulatory family. Every syllable within a voice is positionally unique (no repeats within a voice at any group size). Syllable tables support group sizes 1–7.

### Voice → Articulation Mapping

| Voice  | Short | Color   | Articulation          | Attack Character         |
|--------|-------|---------|-----------------------|--------------------------|
| Kick   | K     | #e06060 | Voiced bilabials      | Low, resonant            |
| Snare  | S     | #c8aa50 | Sharp plosives        | High attack, explosive   |
| Ghost  | G     | #9999ee | Soft/breathy          | Low energy, interior     |
| Hi-Hat | H     | #60c0a0 | Fricatives/affricates | Crisp, sibilant          |

### Full Syllable Matrix

| Size | Kick                        | Snare                       | Ghost                       | Hi-Hat                    |
|------|-----------------------------|-----------------------------|-----------------------------|---------------------------|
| 1    | Bum                         | Tch                         | uh                          | ts                        |
| 2    | Bum-puh                     | Tch-kuh                     | uh-puh                      | ts-pi                     |
| 3    | Bum-puh-guh                 | Tch-kuh-tah                 | uh-puh-kuh                  | ts-pi-ti                  |
| 4    | Bum-puh-guh-duh             | Tch-kuh-tah-dah             | uh-puh-kuh-tah              | ts-pi-ti-ki               |
| 5    | Bum-puh-guh-duh-bah         | Tch-kuh-tah-dah-pah         | uh-puh-kuh-tah-guh          | ts-pi-ti-ki-sh            |
| 6    | Bum-puh-guh-duh-bah-tuh     | Tch-kuh-tah-dah-pah-gah     | uh-puh-kuh-tah-guh-duh      | ts-pi-ti-ki-sh-fi         |
| 7    | Bum-puh-guh-duh-bah-tuh-kuh | Tch-kuh-tah-dah-pah-gah-buh | uh-puh-kuh-tah-guh-duh-buh  | ts-pi-ti-ki-sh-fi-si      |

### Phonetic Design Principles

1. **Positional uniqueness**: no syllable repeats within a voice at any size — every subdivision position is audibly identifiable.
2. **Articulatory contrast**: voices use distinct places of articulation (bilabial, alveolar, glottal, dental).
3. **Initial syllable is the identity**: `Bum` = kick, `Tch` = snare, `uh` = ghost, `ts` = hat.
4. **Speed-optimized**: consonant transitions follow natural articulatory sequences (front→back of mouth) to minimize effort at tempo.

---

## Data Model

### Core Types

```typescript
type DrumVoice = "kick" | "snare" | "ghost" | "hat"

interface VocalSlot {
  syllable: string       // syllable to vocalize ("" if rest)
  voice: DrumVoice       // voice this slot represents
  isAccent: boolean      // true = accent (default: first slot of group)
  posInGroup: number     // 0-based position within the group
  isRest?: boolean       // true = no hit, just a silent placeholder
}

interface VocalGroup {
  size: number           // number of slots in this group
  voice: DrumVoice       // primary voice (drives color/label)
  slots: VocalSlot[]     // per-slot syllables
}

interface VocalPattern {
  groups: VocalGroup[]   // ordered sequence of groups
  grouping: number[]     // integer composition (e.g. [3, 2, 3])
  totalSlots: number     // sum(grouping)
  numBeats?: number      // number of beats (optional — for headers)
}
```

### Playback Types

```typescript
interface PlaybackEvent {
  slot: VocalSlot
  groupIdx: number       // which group this belongs to
  globalIdx: number      // flat slot index across the pattern
  timeOffset: number     // seconds from cycle start
}

interface PlaybackResult {
  events: PlaybackEvent[]
  totalDuration: number  // in slot-units
}
```

---

## Generation Paths

Pattern generation has three entry points, chosen in `generate()` based on UI state:

### 1. Default (per-beat density)

```
generateVocalPattern(numBeats, groupingMode, enabledVoices, prev,
                     allowedSubdivisions, restDensity, voicingMode, grooveDensity)
```

Each beat independently picks a density from `allowedSubdivisions`. Example with `allowed=[3,4,5]`, `numBeats=4` → grouping `[4, 3, 5, 4]`. Used when neither custom grouping nor 16th-groups mode is active.

### 2. Custom Grouping

```
generateFromGrouping(grouping, enabledVoices, restDensity, voicingMode, grooveDensity)
```

Parses the user's text input (`"3+2+3"`, `"3,2,3"`, `"3 2 3"`). Validates part range 1–8, builds groups with sticking-derived voices.

### 3. 16th-Groups Mode (subdivision-first)

When "16th groups" is toggled on:

1. Pick a subdivision from `allowedSubdivisions` at generation time. The map is:
   `2→"8th"`, `3→"triplet"`, `4→"16th"`, `5→"quintuplet"`, `6→"sextuplet"`, `7→"septuplet"`, `8→"32nd"`.
2. Ask the accent-study generator for a musical partition of `subdivision × numBeats` slots (musical or awkward flavor, depending on `groupingMode`).
3. Build `VocalPattern` with `generateFromGrouping` — each group filled via `pickStickingForGroup` + `buildGroupFromSticking`.

**Example.** `subdivision=7`, `numBeats=4` → `28` slots → grouping `4+4+6+4+4+6` → 6 groups played as septuplets with accents at group starts. The generation flow is *"first pick subdivisions, find pulses, then generate groupings"* — not "size N ⇒ N-tuplet".

---

## Voice Assignment

`buildGroupFromSticking(sticking, size, enabledVoices, restDensity)` produces each group:

1. Pick a sticking string from `STICKING_PATTERNS` matching the group size and enabled voices (`pickStickingForGroup`).
2. Map each letter to a voice: `K→kick`, `R→hat` (or snare on accent), `L→snare` (or ghost).
3. Walk consecutive voice-runs so the syllables for each run come from that voice's table sized to the run length. `"KKLL"` with sizes 4 → `[Bum, puh, Tch, kuh]`, not `[Bum, puh, tah, dah]`.
4. Apply `restDensity` probability to non-accent slots, producing silent placeholders.

Groove, substitution, voicing-mode options alter the voice selection before the sticking/voice mapping runs.

---

## Mode Toggles (UI Overlays)

All toggles are additive — they can stack on the same generated pattern. Beat-locked and Polymetric Cycle were removed from the current build; they are **not** part of the present system.

### Pulse (formerly "Counterpoint")

| Field | Value |
|-------|-------|
| State | `counterpoint: boolean`, `counterpointPulse: "quarter" \| "eighth"` |
| Default | OFF |
| Color | gold (#c8aa50) |

**What it does.** Adds a second staff below the main pattern showing just the pulse — one quarter note per beat (or two eighths per beat). Each pulse note is drawn at the beat-start position, and hidden filler rests inside each group force VexFlow to give the pulse voice the same per-group slot-count as the main voice — so the quarter on beat *k* lines up vertically with the first note of group *k*, even when that group is a quintuplet or septuplet.

**Audio.** The audible pulse track fires a 1000→800 Hz click on the pulse positions, mixed at 50% volume with the drum hits.

**Purpose.** Trains rhythmic independence — you vocalize the pattern while tapping (or hearing) the pulse; neither layer should lock to the other.

### 16th Groups (subdivision-first generation)

| Field | Value |
|-------|-------|
| State | `sixteenthMode: boolean` |
| Default | OFF |
| Color | teal (#60c0a0) |

**What it does.** Switches generation to the subdivision-first flow described above (§ "Generation Paths / 16th-Groups Mode"). Instead of each beat picking its own density, the whole pattern picks one subdivision and the accent-study generator partitions `subdivision × numBeats` slots into a musical grouping.

**Accent interaction.** When on, the accent-mode selector is bypassed — the default `buildGroupFromSticking` accent-on-first-slot-of-each-group is left intact, so accents always land at grouping boundaries. Grouping `2+4` produces accents on slots 0 and 2 only.

**Rendering.** Groups render as straight N-wide runs (`duration="16"`, `noTuplet=true`) rather than bracketed tuplets. Row width scales linearly with slot count (a group of 5 is 5/4 of a beat wide).

**Enablement.** Any non-empty `allowedSubdivisions` enables this mode — the "16th" name is historical; it accepts triplets, quintuplets, septuplets, etc., driven by whatever is checked in NOTES / BEAT.

### Substitution

| Field | Value |
|-------|-------|
| State | `substitution: boolean` |
| Default | OFF |
| Color | red (#e06060) |

Play accents on the kit; vocalize fills silently. The audio engine skips non-accent slots; the visual dims them. Trains timing stability through silence.

### Voice Muting

| Field | Value |
|-------|-------|
| State | `mutedVoices: Set<DrumVoice>` |
| Default | empty |

Per-voice toggles. Muted voices appear on the staff but skip audio — the player must vocalize them. Stacks with substitution: `shouldPlay = !muted && (!substitution || isAccent)`.

### Accents (three modes)

| Field | Value |
|-------|-------|
| State | `accentMode: "first" \| "repeat" \| "groupings"`, `accentEvery: number` |
| Default | `"first"`, 3 |

Controls what `applyAccentMode(pattern, mode, every)` does after generation:

- **On 1** — leaves the default accent-first-slot-of-each-group intact. No rewrite.
- **Every N** — accents every Nth slot across the whole pattern (counting rests), so accents land on consistent metric positions regardless of group boundaries.
- **Groupings** — calls `generateAndSelectGrouping(totalSlots, "musical")` (the same generator the Accent Study uses), then accents the first slot of each returned group. Musical grouping-based accent placement — no percentages, no coin flips.

16th-groups mode overrides this selector: the accent override is skipped entirely so the generated grouping's own boundaries carry the accents.

### Voicing and Groove Density

| Field | Value |
|-------|-------|
| State | `voicingMode: VoicingMode`, `grooveDensity: number` |

Control how voices are assigned to groups (linear vs groove styles) and how often fill voices (hat) appear between strong hits.

---

## Notation Rendering

`toKonnakolGroups(pattern, sixteenthMode)` converts a `VocalPattern` into `KonnakolGroup[]` for VexFlow. Each `VocalGroup` becomes one `KonnakolGroup` whose `duration`/`subdivision`/`noTuplet` flags come from `groupSizeToNotation(size, sixteenthMode)`:

| size | sixteenthMode=false             | sixteenthMode=true              |
|------|---------------------------------|---------------------------------|
| 1    | q (quarter, no bracket)         | 16 × 1, no bracket              |
| 2    | 8 × 2, no bracket               | 16 × 2, no bracket              |
| 3    | 8 × 3, triplet bracket          | 16 × 3, no bracket              |
| 4    | 16 × 4, no bracket              | 16 × 4, no bracket              |
| 5    | 16 × 5, quintuplet bracket      | 16 × 5, no bracket              |
| 6    | 16 × 6, sextuplet bracket       | 16 × 6, no bracket              |
| 7    | 16 × 7, septuplet bracket       | 16 × 7, no bracket              |
| 8    | 32 × 8, no bracket              | 16 × 8, no bracket              |

`consolidateSlots` absorbs trailing rests into the preceding note's duration so `Bum + 3 sixteenth rests` renders as a single quarter `Bum`. Tuplet groups are left untouched because their timing assumes uniform notes inside the bracket.

### Pulse alignment (`toPulseGroups`)

For each main group, a pulse group is emitted whose total slot-count matches the main group exactly:

- Quarter mode: `q` (4 slots) + hidden rests filling `groupSlots - 4`.
- Eighth mode: two `"8"` notes at slot 0 and slot `groupSlots/2`, with hidden rests around them.

`hidden: true` notes pass through VexFlow with transparent notehead/stem/flag/ledger styles. They occupy voice slots for the formatter but don't render visibly. Result: the pulse quarter is drawn exactly above the group's first note, regardless of how wide the main group's tuplet is.

### Per-slot voice coloring

`ColoredStaff` wraps `KonnakolNotation` and post-processes the SVG after render: every annotation `<text>` element whose content matches a syllable gets its fill set to the inverted per-voice color (inverted because the parent SVG uses `filter: invert(1)`). Pulse annotations (if any) are painted gold.

### Multi-row layout

When `pattern.totalSlots` exceeds what fits in one row (`availW` measured via `ResizeObserver`), `splitBarIntoRows` breaks at group boundaries so tuplet brackets and beams stay intact. Each row becomes its own `ColoredStaff` instance.

---

## Playback

`flattenForPlayback(pattern, beatLocked=false)` walks groups in order and emits one `PlaybackEvent` per slot with a `timeOffset` in slot-units. With the always-false `beatLocked` argument, every slot has equal duration — so a size-5 group plays as five equal slots of `1 slot-unit` each. The audio scheduler converts slot-units to seconds via `60 / bpm`.

`scheduleOneCycle(ctx, result, cycleStart, secPerUnit, muted, pulse, meter=undefined, bl=false)` schedules one pass of the pattern. For each event it calls `scheduleDrumHit(ctx, time, voice, isAccent, volume)` and updates the active-slot cursor via `setTimeout`. Pulse events are scheduled separately via `schedulePulseClick`.

**Loop mode** pre-schedules four cycles ahead and uses a rolling timer (`timersRef`) to keep queuing more. `stopAll()` clears all timers and resets `stopRef.current = true`.

### Audio Synthesis

All audio is Web-Audio-API synthesis; no samples.

| Voice | Method              | Freq Start → End | Decay  | HPF     |
|-------|---------------------|------------------|--------|---------|
| Kick  | Oscillator          | 160 → 50 Hz      | 200 ms | —       |
| Snare | Noise + oscillator  | 400 → 200 Hz     | 100 ms | 2000 Hz |
| Ghost | Noise               | 300 → 200 Hz     | 60 ms  | 1500 Hz |
| Hat   | Noise               | 8000 → 6000 Hz   | 40 ms  | 5000 Hz |
| Pulse | Oscillator          | 1000 → 800 Hz    | 30 ms  | —       |

Accented slots receive a 1.4× gain multiplier.

---

## UI Layout

```
┌────────────────────────────────────────────────────────┐
│ Legend / title                                         │
├──────────────┬─────────────────────────────────────────┤
│              │                                         │
│  Controls    │  Pattern Display                        │
│              │  ┌─────────────────────────────────┐    │
│  Beats: 4    │  │ 3+5+3+5 [K G S G] over 4 beats  │    │
│  [Presets]   │  │                                 │    │
│              │  │  ┌────┐ ┌──────┐ ┌────┐ ┌────┐  │    │
│  Grouping:   │  │  │3-let│ │5-plet│ │3-let│ │5-plet│ │
│  Musical /   │  │  │Bum..│ │Tch..│ │Bum..│ │Tch..│  │    │
│  Awkward /   │  │  └────┘ └──────┘ └────┘ └──────┘ │    │
│  Both        │  │                                 │    │
│              │  │  Pulse: ♩ ─ ♩ ─ ♩ ─ ♩ ─         │    │
│  Voices      │  │                                 │    │
│  [K][S][G][H]│  │                                 │    │
│              │  └─────────────────────────────────┘    │
│  Notes/Beat  │                                         │
│  [2][3][4]   │  Syllable cheat sheet                   │
│  [5][6][7]   │                                         │
│              │                                         │
│  BPM: 80     │                                         │
│              │                                         │
│  Accents     │                                         │
│  [On 1][Every│                                         │
│   N][Groupings]                                        │
│              │                                         │
│  ☐ 16th grps │                                         │
│  ☐ Pulse     │                                         │
│  ☐ Subst.    │                                         │
│  Mute [K][S][G][H]                                     │
│              │                                         │
│  [Generate]  │                                         │
│  [Play][Loop]│                                         │
│              │                                         │
│  HISTORY     │                                         │
└──────────────┴─────────────────────────────────────────┘
```

### Controls Reference

| Control                 | Type                       | Range / Options                         | Default  |
|-------------------------|----------------------------|-----------------------------------------|----------|
| Beats                   | Number + presets           | 1–16                                    | 4        |
| Grouping source         | Toggle Random/Custom       | Custom accepts `3+2+3` / `3,2,3` / etc. | Random   |
| Grouping mode           | 3-way toggle               | Musical / Awkward / Both                | Musical  |
| Voices                  | 4 toggles                  | K / S / G / H (min 1)                   | All ON   |
| Notes / Beat            | 6 toggles                  | 2, 3, 4, 5, 6, 7                        | 2–7 all  |
| BPM                     | Number + slider            | 30–300                                  | 80       |
| Accents                 | 3 radio buttons + input    | On 1 / Every N / Groupings              | On 1     |
| 16th Groups             | Checkbox                   | Subdivision-first generation            | OFF      |
| Pulse                   | Checkbox + quarter/eighth  | Quarter / Eighth                        | OFF      |
| Substitution            | Checkbox                   | Accents only → audio; fills → vocalize  | OFF      |
| Voice mute              | Per-voice                  | Machine skips muted; player vocalizes   | none     |
| Rest density            | Slider                     | 0–0.75 of non-accent slots → rests      | 0        |

---

## State Summary

Kept in `VocalPercussion` component:

```typescript
// Config
numBeats, groupingMode, useCustomGrouping, groupingInput
enabledVoices, allowedSubdivisions, bpm

// Mode toggles
counterpoint, counterpointPulse             // Pulse
sixteenthMode (+ effectiveSixteenthMode)     // 16th groups
accentMode, accentEvery                      // Accents
substitution, voicingMode, grooveDensity
mutedVoices, restDensity

// Pattern + history
pattern, history, historyIdx

// Playback refs
audioCtxRef, timersRef, stopRef, loopRef, isPlaying, activeSlot
prevGroupingsRef                             // novelty tracking for the generator
```

---

## Generation Pipeline (end-to-end)

```
generate()
  │
  ├─ stopAll()                        (cancel any running playback)
  │
  ├─ Resolve grouping source:
  │   • useCustomGrouping + text      → parseGrouping()
  │   • effectiveSixteenthMode        → sixteenthGrouping()
  │   • default                       → generateVocalPattern()
  │
  ├─ Build pattern via:
  │   • generateFromGrouping(grouping, …)  for custom + 16th paths
  │   • generateVocalPattern(…)            for default path
  │
  ├─ applyAccentMode(pat, accentMode, accentEvery)
  │   • SKIPPED when effectiveSixteenthMode
  │     (so grouping starts stay as accents)
  │
  ├─ setPattern(pat)
  └─ setHistory([...prev, pat])
```

The `sixteenthGrouping` helper inside `generate()`:

```typescript
const SUBDIV_LABELS = {
  2: "8th", 3: "triplet", 4: "16th", 5: "quintuplet",
  6: "sextuplet", 7: "septuplet", 8: "32nd",
};

const sixteenthGrouping = () => {
  const pool = allowedSubdivisions.filter(n => SUBDIV_LABELS[n]);
  const chosen = pool.length > 0
    ? pool[Math.floor(Math.random() * pool.length)]
    : 4;
  const picker = groupingMode === "awkward"
    ? generateAwkwardGrouping
    : generateMusicalGrouping;
  return picker(SUBDIV_LABELS[chosen], numBeats, [], prevGroupingsRef.current);
};
```

---

## File Reference

### `lib/vocalPercussionData.ts`

| Export                                       | Purpose                                                        |
|----------------------------------------------|----------------------------------------------------------------|
| `DrumVoice`, `VocalSlot`, `VocalGroup`, `VocalPattern` | Core types                                           |
| `VOICE_LABELS`, `VOICE_SHORT`, `VOICE_COLORS`| UI constants                                                   |
| `VOCAL_SYLLABLES`, `getSyllables(voice, size)` | Syllable table + lookup                                      |
| `generateVocalPattern(...)`                  | Default per-beat-density pattern generator                     |
| `generateFromGrouping(...)`                  | Pattern from an explicit grouping                              |
| `generateFromSticking(...)`                  | Pattern from a sticking string + grouping                      |
| `flattenForPlayback(pattern, beatLocked=false)` | Pattern → timed event array                                 |
| `scheduleDrumHit(ctx, t, voice, accent, vol)`| Web Audio drum synthesis                                       |
| `schedulePulseClick(ctx, t, vol)`            | Web Audio pulse click                                          |
| `parseGrouping(input)`                       | String → `number[]` parser (accepts `+`, `,`, space)           |

### `components/VocalPercussion.tsx`

| Export / Local                 | Purpose                                                      |
|--------------------------------|--------------------------------------------------------------|
| `VocalPercussion` (default)    | Main component, owns all state                               |
| `PatternDisplay`               | Staff / pulse / header rendering                             |
| `ColoredStaff`                 | KonnakolNotation wrapper with per-voice annotation colors    |
| `groupSizeToNotation(size, sixteenthMode)` | VexFlow duration / subdivision / bracket mapping |
| `toKonnakolGroups(pattern, sixteenthMode)` | Main-staff group converter                        |
| `toPulseGroups(pattern, mode, sixteenthMode)` | Pulse-staff group converter with alignment     |
| `consolidateSlots(slots, baseDuration)` | Rest-absorption for non-tuplet groups               |
| `AccentMode` + `applyAccentMode(pattern, mode, every)` | Post-generation accent rewrite       |

### Dependencies

| Module                  | What's used                                                     |
|-------------------------|-----------------------------------------------------------------|
| `groupingSelector.ts`   | `generateAndSelectGrouping`, `GroupingMode`                     |
| `accentData.ts`         | `generateMusicalGrouping`, `generateAwkwardGrouping`            |
| `stickingsData.ts`      | `STICKING_PATTERNS` via `pickStickingForGroup`                  |
| `konnakolData.ts`       | `KonnakolGroup`, `KonnakolNote` types                           |
| `KonnakolNotation.tsx`  | VexFlow staff rendering (hidden-note support for pulse align)  |

---

## Pedagogical Progression

The toggles are designed to stack; each adds a layer of difficulty.

1. **Unison** — no toggles. Voice and limbs play the same pattern in sync.
2. **Groove / voicing** — abstract groupings become drumable patterns (hat filling between K/S/G hits).
3. **Pulse** — an independent quarter (or eighth) pulse runs against the pattern; player maintains both simultaneously.
4. **Substitution** — only accents play on the kit; fills are vocalized, keeping the ghost grid alive through silences.
5. **Voice muting** — machine skips specific voices; player fills those gaps vocally.
6. **16th Groups** — subdivision-first generation (say, septuplet grid with an asymmetric grouping like 4+4+6+4+4+6) trains displacement inside an unfamiliar pulse.
7. **Accent modes — Every N / Groupings** — relocate accents off the default "beat-start" positions, exposing polymetric accent patterns over the same grouping.

Each layer is independent; any combination is a valid exercise.

---

## What Was Removed

Relative to earlier drafts of this doc, the following have been taken out of the current system:

- **Beat-locked subdivision** — the density-per-beat mode is gone. Playback always runs in equal-slot mode (`flattenForPlayback(..., false)`), and the notation renderer no longer carries a `beatLocked` prop.
- **Polymetric Cycle** — the cycle toggle, meter picker, `generatePolymetricCycle` call, and the meter/bar-line logic in playback and display have all been removed. The older doc sections describing meter-versus-phrase displacement no longer apply.
- **Counterpoint → Pulse rename** — what was called "Counterpoint" in earlier docs is now labelled "Pulse" in the UI; state variables `counterpoint` / `counterpointPulse` persist for internal continuity but are user-facing as "Pulse".
