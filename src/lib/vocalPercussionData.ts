/**
 * Vocal Percussion Data — Syllable tables, linear drumming voice assignment,
 * pattern generation, polymetric cycles, and audio synthesis.
 *
 * Voice assignment follows linear drumming principles:
 *   - No consecutive same voice
 *   - Kick anchors beat 1, snare on backbeat
 *   - Ghost/hat fill between strong voices
 */

import { generateAndSelectGrouping, selectGrouping, type GroupingMode } from "./groupingSelector";
import { STICKING_PATTERNS } from "./stickingsData";

/* ── Voice types ──────────────────────────────────────────────────────────── */

export type DrumVoice = "kick" | "snare" | "ghost" | "hat" | "tom";

export const VOICE_LABELS: Record<DrumVoice, string> = {
  kick: "Kick", snare: "Snare", ghost: "Ghost", hat: "Hi-Hat", tom: "Tom",
};

export const VOICE_SHORT: Record<DrumVoice, string> = {
  kick: "K", snare: "S", ghost: "G", hat: "H", tom: "T",
};

// Tom gets a warm orange — distinct from kick-red (low) and snare-gold (mid),
// sits between kick and snare in pitch hierarchy like a real drum kit.
export const VOICE_COLORS: Record<DrumVoice, string> = {
  kick: "#e06060", snare: "#c8aa50", ghost: "#9999ee", hat: "#60c0a0", tom: "#e08040",
};

/* ── Syllable tables ──────────────────────────────────────────────────────── */
// Kept for legacy callers and audio-synthesis naming, but the notation no
// longer renders syllable text — voices are shown by color-coded noteheads
// only, so the user is free to invent their own vocalization.

export const VOCAL_SYLLABLES: Record<DrumVoice, string[][]> = {
  kick: [
    ["Bum"],
    ["Bum", "puh"],
    ["Bum", "puh", "guh"],
    ["Bum", "puh", "guh", "duh"],
    ["Bum", "puh", "guh", "duh", "bah"],
    ["Bum", "puh", "guh", "duh", "bah", "tuh"],
    ["Bum", "puh", "guh", "duh", "bah", "tuh", "kuh"],
  ],
  snare: [
    ["Tch"],
    ["Tch", "kuh"],
    ["Tch", "kuh", "tah"],
    ["Tch", "kuh", "tah", "dah"],
    ["Tch", "kuh", "tah", "dah", "pah"],
    ["Tch", "kuh", "tah", "dah", "pah", "gah"],
    ["Tch", "kuh", "tah", "dah", "pah", "gah", "buh"],
  ],
  ghost: [
    ["uh"],
    ["uh", "puh"],
    ["uh", "puh", "kuh"],
    ["uh", "puh", "kuh", "tah"],
    ["uh", "puh", "kuh", "tah", "guh"],
    ["uh", "puh", "kuh", "tah", "guh", "duh"],
    ["uh", "puh", "kuh", "tah", "guh", "duh", "buh"],
  ],
  hat: [
    ["ts"],
    ["ts", "pi"],
    ["ts", "pi", "ti"],
    ["ts", "pi", "ti", "ki"],
    ["ts", "pi", "ti", "ki", "sh"],
    ["ts", "pi", "ti", "ki", "sh", "fi"],
    ["ts", "pi", "ti", "ki", "sh", "fi", "si"],
  ],
  tom: [
    ["Dum"],
    ["Dum", "dah"],
    ["Dum", "dah", "dun"],
    ["Dum", "dah", "dun", "dih"],
    ["Dum", "dah", "dun", "dih", "doh"],
    ["Dum", "dah", "dun", "dih", "doh", "duh"],
    ["Dum", "dah", "dun", "dih", "doh", "duh", "dai"],
  ],
};

export function getSyllables(voice: DrumVoice, size: number): string[] {
  return VOCAL_SYLLABLES[voice][Math.max(0, Math.min(6, size - 1))];
}

/* ── Pattern data structures ──────────────────────────────────────────────── */

export interface VocalSlot {
  syllable: string;
  voice: DrumVoice;
  isAccent: boolean;
  posInGroup: number;
  /** When true: render as a rest, no audio played, no syllable vocalized. */
  isRest?: boolean;
}

export interface VocalGroup {
  size: number;
  voice: DrumVoice;
  slots: VocalSlot[];
}

export interface VocalPattern {
  groups: VocalGroup[];
  grouping: number[];
  totalSlots: number;
  /** Number of BEATS in the pattern (each group = one beat). totalSlots = sum(grouping). */
  numBeats?: number;
  /** For polymetric cycles: the base phrase grouping before repeating */
  phraseGrouping?: number[];
  /** For polymetric cycles: beats per bar in the meter */
  meterBeats?: number;
  /** For polymetric cycles: how many times the phrase repeats to resolve */
  cycleRepeats?: number;
}

/* ── Math helpers ─────────────────────────────────────────────────────────── */

function gcd(a: number, b: number): number {
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

/* ── Linear drumming voice assignment ─────────────────────────────────────── */

const ALL_VOICES: DrumVoice[] = ["kick", "snare", "ghost", "hat", "tom"];

/**
 * Assign voices to groups following linear drumming principles:
 *   1. Never same voice on adjacent groups
 *   2. Kick on beat 1 (position 0)
 *   3. Snare near the midpoint (backbeat)
 *   4. Ghost/hat fill remaining, alternating
 */
export function assignLinearVoices(
  grouping: number[],
  enabledVoices: DrumVoice[] = ALL_VOICES,
): DrumVoice[] {
  const voices = enabledVoices.length > 0 ? enabledVoices : ALL_VOICES;
  const n = grouping.length;

  if (n === 0) return [];
  if (n === 1) return [voices[Math.floor(Math.random() * voices.length)]];

  const strong = voices.filter(v => v === "kick" || v === "snare");
  const weak = voices.filter(v => v === "ghost" || v === "hat");

  if (strong.length === 0 || weak.length === 0) {
    return cycleNoAdjacent(n, voices);
  }

  const result: DrumVoice[] = new Array(n);

  result[0] = strong.includes("kick") ? "kick" : strong[0];

  if (n === 2) {
    result[1] = pickDifferent(strong, result[0]) ?? weak[0];
  } else {
    const backbeat = Math.floor(n / 2);
    result[backbeat] = strong.includes("snare")
      ? "snare"
      : pickDifferent(strong, result[backbeat - 1]) ?? strong[0];
  }

  let weakCursor = 0;
  for (let i = 0; i < n; i++) {
    if (result[i] !== undefined) continue;
    const prev = i > 0 ? result[i - 1] : undefined;
    const candidates = weak.filter(v => v !== prev);
    if (candidates.length > 0) {
      result[i] = candidates[weakCursor % candidates.length];
      weakCursor++;
    } else if (weak.length > 0) {
      const any = voices.filter(v => v !== prev);
      result[i] = any.length > 0
        ? any[Math.floor(Math.random() * any.length)]
        : voices[0];
    } else {
      result[i] = voices[i % voices.length];
    }
  }

  for (let i = 1; i < n; i++) {
    if (result[i] === result[i - 1]) {
      const alts = voices.filter(v => v !== result[i - 1] && (i + 1 >= n || v !== result[i + 1]));
      if (alts.length > 0) result[i] = alts[Math.floor(Math.random() * alts.length)];
    }
  }

  return result;
}

function pickDifferent(arr: DrumVoice[], avoid?: DrumVoice): DrumVoice | undefined {
  const filtered = avoid ? arr.filter(v => v !== avoid) : arr;
  return filtered.length > 0 ? filtered[Math.floor(Math.random() * filtered.length)] : arr[0];
}

/**
 * Build a rest mask biased toward weak slots, modeled on the rhythm ear-trainer
 * `generateRests` approach (rests only land on non-accent / non-macro positions)
 * and the konnakol `randomizePhrases` strong-first protection.
 *
 * Protected (never rest):
 *   - slot 0 (accent / downbeat)
 *   - midpoint slot when size ≥ 4 (backbeat)
 *
 * `density` ∈ [0, 1] is the base probability for candidate slots. Positions
 * further from the strong slots get the full probability; positions adjacent
 * to strong slots get a reduced probability (×0.5) so "musical" rests don't
 * crowd the structurally important attacks.
 */
function buildMusicalRestMask(size: number, density: number): boolean[] {
  const mask = new Array<boolean>(size).fill(false);
  if (density <= 0 || size < 2) return mask;
  const mid = size >= 4 ? Math.floor(size / 2) : -1;
  for (let i = 1; i < size; i++) {
    if (i === mid) continue;
    const nearStrong = i === 1 || i === size - 1 || (mid >= 0 && (i === mid - 1 || i === mid + 1));
    const p = nearStrong ? density * 0.5 : density;
    if (Math.random() < p) mask[i] = true;
  }
  return mask;
}

function cycleNoAdjacent(n: number, voices: DrumVoice[]): DrumVoice[] {
  const result: DrumVoice[] = [];
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? result[i - 1] : undefined;
    const candidates = voices.filter(v => v !== prev);
    result.push(
      candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : voices[i % voices.length],
    );
  }
  return result;
}

/* ── Pattern generation ───────────────────────────────────────────────────── */

/**
 * Map a sticking letter to a drum voice.
 *   R → hat (right hand typically plays hi-hat)
 *   L → snare (accented) or ghost (unaccented) — left-hand snare hits
 *   K → kick
 *
 * This is the inverse of traditional drum sticking where you play right/left
 * hand on different surfaces. Here we use stickings as the blueprint for
 * musical voice sequences since STICKING_PATTERNS are already curated to sound
 * musically coherent (no more than 2 consecutive same limb, max 2 kicks, etc).
 */
function stickingLetterToVoice(letter: string, isAccent: boolean): DrumVoice {
  const ch = letter.toUpperCase();
  if (ch === "K") return "kick";
  if (ch === "L") return isAccent ? "snare" : "ghost";
  return "hat"; // R or unknown
}

/**
 * Pick a random sticking pattern for a group of the given size, filtered by
 * enabled voices. Returns the sticking string (e.g., "RLKR" for size 4).
 *
 * The sticking pattern provides the voice sequence for the group — each letter
 * maps to a drum voice. This produces real groove-like sequences because
 * stickings are curated for musical playability.
 */
function pickStickingForGroup(size: number, enabledVoices: DrumVoice[]): string {
  const allowK = enabledVoices.includes("kick");
  const allowLSnare = enabledVoices.includes("snare");
  const allowLGhost = enabledVoices.includes("ghost");
  const allowL = allowLSnare || allowLGhost;
  const allowR = enabledVoices.includes("hat");

  // Clamp size to stickings catalogue (1-7)
  const lookupSize = Math.min(size, 7);

  let candidates = STICKING_PATTERNS.filter(p => p.group === lookupSize);
  const filtered = candidates.filter(p => {
    for (const ch of p.pattern) {
      if (ch === "K" && !allowK) return false;
      if (ch === "L" && !allowL) return false;
      if (ch === "R" && !allowR) return false;
    }
    return true;
  });

  if (filtered.length > 0) candidates = filtered;
  if (candidates.length === 0) {
    // Fallback: synthesize from enabled voices
    const fallback = allowR ? "R" : allowL ? "L" : allowK ? "K" : "R";
    return fallback.repeat(size);
  }

  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  // If size > 7, repeat/extend the pattern
  if (size > picked.pattern.length) {
    let out = picked.pattern;
    while (out.length < size) out += picked.pattern;
    return out.slice(0, size);
  }
  return picked.pattern;
}

/**
 * Build a VocalGroup from a sticking string. Voice-restart syllable assignment:
 * each consecutive run of the same voice starts at that voice's strong syllable
 * (Bum, Tch, uh, ts) and walks its table for the run's length. So sticking
 * "KKLL" → [Bum, puh, Tch, kuh] rather than [Bum, puh, tah, dah].
 */
function buildGroupFromSticking(
  sticking: string,
  size: number,
  enabledVoices: DrumVoice[],
  restDensity = 0,
): VocalGroup {
  // Resolve voice for each slot (apply enabled-voice fallback)
  const voices: DrumVoice[] = [];
  for (let i = 0; i < size; i++) {
    const letter = sticking[i] ?? "R";
    let voice = stickingLetterToVoice(letter, i === 0);
    if (!enabledVoices.includes(voice)) {
      if (voice === "ghost" && enabledVoices.includes("snare")) voice = "snare";
      else if (voice === "snare" && enabledVoices.includes("ghost")) voice = "ghost";
      else voice = enabledVoices[0] ?? "hat";
    }
    voices.push(voice);
  }

  // Musical rest placement: protect the accent + midpoint, down-weight slots
  // adjacent to strong positions (see buildMusicalRestMask).
  const restMask = buildMusicalRestMask(size, restDensity);

  // Walk voice-runs, assigning syllables from the voice's table sized to the run.
  // Rests count toward the run length but get an empty syllable.
  const slots: VocalSlot[] = new Array(size);
  let i = 0;
  while (i < size) {
    let j = i;
    while (j < size && voices[j] === voices[i]) j++;
    const runLength = j - i;
    const syllables = getSyllables(voices[i], runLength);
    for (let k = 0; k < runLength; k++) {
      const slotIdx = i + k;
      const rest = restMask[slotIdx];
      slots[slotIdx] = {
        syllable: rest ? "" : (syllables[Math.min(k, syllables.length - 1)] ?? ""),
        voice: voices[slotIdx],
        isAccent: slotIdx === 0,
        posInGroup: slotIdx,
        isRest: rest,
      };
    }
    i = j;
  }

  const primaryVoice = slots[0]?.voice ?? "hat";
  return { size, voice: primaryVoice, slots };
}

/* ── Groove voicing (accent-driven phrase voicing) ──────────────────────── */

export type VoicingMode = "linear" | "groove";

/**
 * Substitute any voice that isn't in `enabled` with the best-available analog.
 * Different descents for different musical roles:
 *   - `accent`: K/S/hat only. Ghost is *never* a valid accent — an accent is a
 *     dynamic loud hit by definition, a ghost is the opposite. This prevents
 *     "uh" (ghost) showing up on an accented slot.
 *   - `fill`:  normal descent for interior hat/ghost/kick positions.
 */
function substituteFillVoice(v: DrumVoice, enabled: DrumVoice[]): DrumVoice {
  if (enabled.includes(v)) return v;
  // Tom sits between ghost (quiet) and snare (loud) — toms fall back to snare
  // or kick when disabled; other voices can fall through to tom as a fill.
  const descent: Record<DrumVoice, DrumVoice[]> = {
    hat:   ["ghost", "tom", "snare", "kick"],
    ghost: ["hat", "tom", "snare", "kick"],
    tom:   ["snare", "ghost", "hat", "kick"],
    snare: ["tom", "kick", "ghost", "hat"],
    kick:  ["tom", "snare", "ghost", "hat"],
  };
  for (const alt of descent[v]) if (enabled.includes(alt)) return alt;
  return enabled[0] ?? "hat";
}

/** Substitute an accent voice — never falls back to ghost (an accent can't be
 *  a ghost note; ghosts are unaccented decoration by definition).  Toms CAN
 *  be accented (tom hits are loud by nature), so tom is a valid fallback. */
function substituteAccentVoice(v: DrumVoice, enabled: DrumVoice[]): DrumVoice {
  if (enabled.includes(v) && v !== "ghost") return v;
  const descent: DrumVoice[] = v === "snare"
    ? ["snare", "tom", "kick", "hat"]
    : v === "tom"
      ? ["tom", "snare", "kick", "hat"]
      : ["kick", "snare", "tom", "hat"];
  for (const alt of descent) if (enabled.includes(alt)) return alt;
  // Only ghost is enabled → user must vocalize accents as ghost; return ghost
  // and the accent mark will appear but there's no other musical choice.
  return enabled[0] ?? "hat";
}

/**
 * Pick the K-or-S role for the n-th accent in a pattern. Even accents anchor
 * on kick (downbeat role), odd accents anchor on snare (backbeat role) — the
 * fundamental K-S-K-S groove skeleton underlying nearly all popular-music
 * drumming (see Pfleiderer, *Rhythm in Popular Music*; Monson, *Saying
 * Something*). The accent count drives this — not the slot position — so
 * asymmetric phrase groupings (3+3+3+3+4, 5+5+6, etc.) still get the K/S
 * alternation at their own accent starts.
 */
function accentRoleVoice(accentIdx: number): DrumVoice {
  return accentIdx % 2 === 0 ? "kick" : "snare";
}

/**
 * Musical voice placement for a single accent-span — procedural, not template-
 * driven.  A span is [anchor, interior..., pickup?]: slot 0 is the accent
 * anchor (K or S per Pfleiderer/Monson K-S-K-S backbone), the final interior
 * slot resolves into the next anchor as a pickup.  The interior between anchor
 * and pickup is built by sampling from a vocabulary of "moves" — short voice
 * fragments drawn from the modern-linear drum literature — with context-
 * sensitive weights.  This replaces the earlier fixed-template catalog: there
 * are no enumerated fills; the space of possible interiors is combinatorial.
 *
 * Moves (each consumes 1..2 slots, `P` marks the pickup position).  Triples
 * (GGG, KKK) are intentionally absent — the hard run cap is 2 same-voice
 * slots in a row, so triples would always be rejected by the filter.
 *
 *   G    — single ghost (standard decoration; Garstka under-accent carpet)
 *   GG   — ghost drag    (Williams/Cobham texture; two ghosts as one gesture)
 *   K    — single kick push
 *   KK   — kick double   (double-bass / gospel push)
 *   H    — hat hit       (ostinato splash; Williams ride spelling)
 *   S    — snare displacement (weak-beat snare; Colaiuta/Hamasyan)
 *   SS   — snare double  (flam/drag fragment; Williams)
 *   P    — pickup (1 slot, voice derived from next anchor)
 *
 * Selection weights depend on:
 *   - **position in span**: pickup moves weight up near the end, kick-push
 *     weights up near the beginning (Cobham/Garstka anchor-entry)
 *   - **previous voice**: penalise the same voice consecutively (Lerdahl/
 *     Jackendoff grouping preference rule 1 — maximise differentiation)
 *   - **next anchor**: spans resolving to snare prefer ghost/snare pickups;
 *     spans resolving to kick prefer a kick-lead-in
 *   - **span size**: multi-slot moves are unavailable when they wouldn't fit
 *
 * The result: the same musical question (spanSize=5, anchor=K, nextAnchor=S)
 * admits many distinct voicings — the generator will reach voicings no
 * enumerated catalog contains.  Legendary-drummer vocabulary emerges from the
 * weight shape, not from transcription.
 */

type GrooveMove = {
  voices: DrumVoice[];       // the voice fragment this move emits
  isPickup?: boolean;        // true for the P move — gets context-dependent voice
  /** Weight as a function of position, remaining-slots, previous voice, and
   *  the next anchor.  Return 0 to exclude the move from this decision. */
  weight: (ctx: {
    pos: number;             // current interior position (0-based)
    remaining: number;       // slots left in the span including current
    prev: DrumVoice;         // voice of the previous slot (anchor if pos=0)
    anchor: DrumVoice;       // this span's anchor voice
    nextAnchor: DrumVoice;   // next span's anchor (drives pickup)
  }) => number;
};

const GROOVE_MOVES: GrooveMove[] = [
  // ── Ghost vocabulary ───────────────────────────────────────────────────
  {
    voices: ["ghost"],
    weight: ({ prev }) => prev === "ghost" ? 0.6 : 2.5,
  },
  {
    voices: ["ghost", "ghost"],
    weight: ({ pos, remaining, prev }) =>
      remaining >= 3 && prev !== "ghost" ? 2.2 + pos * 0.15 : 0,
  },
  // ── Kick vocabulary ────────────────────────────────────────────────────
  {
    voices: ["kick"],
    weight: ({ pos, prev, nextAnchor }) => {
      const base = prev === "kick" ? 0.3 : 1.4;
      // Kick-push early in the span (Cobham/Garstka anchor entry)
      const earlyBonus = pos <= 1 ? 0.6 : 0;
      // Slight preference for kick when resolving into a K anchor
      const leadIntoK = nextAnchor === "kick" ? 0.3 : 0;
      return base + earlyBonus + leadIntoK;
    },
  },
  {
    voices: ["kick", "kick"],
    weight: ({ remaining, prev, nextAnchor, pos }) => {
      if (remaining < 3 || prev === "kick") return 0;
      const baseline = 1.2;
      const leadIntoK = nextAnchor === "kick" ? 0.8 : 0;
      const earlyBonus = pos <= 1 ? 0.4 : 0;
      return baseline + leadIntoK + earlyBonus;
    },
  },
  // ── Hat / snare spelling ───────────────────────────────────────────────
  {
    voices: ["hat"],
    weight: ({ prev }) => prev === "hat" ? 0.4 : 1.0,
  },
  {
    voices: ["snare"],
    // Snare in the interior is a displacement — rarer, but characteristic of
    // Colaiuta and Hamasyan's off-grid snare placements.
    weight: ({ prev, pos }) => prev === "snare" ? 0.1 : 0.5 + (pos >= 2 ? 0.3 : 0),
  },
  {
    voices: ["snare", "snare"],
    weight: ({ remaining, prev }) => remaining >= 3 && prev !== "snare" ? 0.3 : 0,
  },

  // ── Tom vocabulary ─────────────────────────────────────────────────────
  // Toms are melodic fill voices — they appear in runs (tom-fills, gospel
  // rolls) and as a mid-register accent alternative.  In interior positions
  // they break up the ghost/kick/hat carpet with a distinct colour.
  {
    voices: ["tom"],
    weight: ({ prev, pos, remaining }) => {
      if (prev === "tom") return 0.3;
      // Tom bias grows near span-end — tom-fills lead into the next anchor.
      const endBonus = remaining <= 2 ? 0.4 : 0;
      const midBonus = pos >= 1 && pos <= 3 ? 0.3 : 0;
      return 0.7 + endBonus + midBonus;
    },
  },
  {
    voices: ["tom", "tom"],
    // Tom doubles = melodic fill cell (T-T landing into S or K).
    weight: ({ remaining, prev }) => remaining >= 3 && prev !== "tom" ? 0.6 : 0,
  },

  // ── Pickup resolution ──────────────────────────────────────────────────
  // The P move is chosen preferentially at the span's final slot.  Its
  // voice is filled in post-hoc based on nextAnchor (ghost → snare, kick →
  // kick, ghost → hat).  Strongly favoured when remaining=1, otherwise weak.
  {
    voices: ["__pickup__" as DrumVoice],
    isPickup: true,
    weight: ({ remaining }) => remaining === 1 ? 6.0 : 0.2,
  },
];

/** Resolve the pickup voice given the next anchor.  Ghost → snare is the
 *  archetypal backbeat setup; kick → kick is the linear-double lead-in. */
function pickupVoiceFor(nextAnchor: DrumVoice): DrumVoice {
  if (nextAnchor === "snare") return "ghost";
  if (nextAnchor === "kick")  return "kick";
  return "ghost";
}

/** Maximum consecutive slots allowed per voice.  Runs of 2 sound like a
 *  deliberate drag or double; 3+ starts sounding like a stuck hand. */
const MAX_VOICE_RUN = 2;

function grooveSpanVoices(
  spanSize: number,
  anchor: DrumVoice,       // already K/S/hat (substituteAccentVoice applied)
  nextAnchor: DrumVoice,   // the next accent's anchor, for pickup decisions
  enabled: DrumVoice[],
): DrumVoice[] {
  if (spanSize <= 0) return [];
  if (spanSize === 1) return [anchor];

  const out: DrumVoice[] = [anchor];
  let prev = anchor;
  let prevRun = 1;         // same-voice run length at the tail of `out`
  let pos = 0;             // position within the INTERIOR (slot index 1 = pos 0)

  // Resolve a move's slot-by-slot voice list once, so the run-cap filter and
  // the placement loop agree on substitutions.
  const resolveMove = (m: GrooveMove): DrumVoice[] =>
    m.isPickup
      ? [substituteFillVoice(pickupVoiceFor(nextAnchor), enabled)]
      : m.voices.map(v => substituteFillVoice(v, enabled));

  // Count leading same-voice slots in a resolved fragment — used to check
  // whether this move would extend the current run past MAX_VOICE_RUN.
  const leadingSameCount = (resolved: DrumVoice[], runVoice: DrumVoice): number => {
    let n = 0;
    for (const v of resolved) {
      if (v === runVoice) n++;
      else break;
    }
    return n;
  };

  while (out.length < spanSize) {
    const remaining = spanSize - out.length;

    // Filter: fits in span AND wouldn't push same-voice run past the cap.
    const viable = GROOVE_MOVES.filter(m => m.voices.length <= remaining);
    const weights = viable.map(m => {
      const resolved = resolveMove(m);
      const leading = leadingSameCount(resolved, prev);
      if (leading > 0 && prevRun + leading > MAX_VOICE_RUN) return 0;
      return m.weight({ pos, remaining, prev, anchor, nextAnchor });
    });
    const total = weights.reduce((s, w) => s + w, 0);

    let chosen: GrooveMove;
    if (total <= 0) {
      // Every move is blocked by the run cap — escape by switching to a
      // different voice.  Prefer hat (the neutral filler), then ghost, then
      // kick; snare is last because it's structurally the accent backbone.
      const alt = (["hat", "ghost", "tom", "kick", "snare"] as DrumVoice[])
        .map(v => substituteFillVoice(v, enabled))
        .find(v => v !== prev) ?? prev;
      out.push(alt);
      if (alt === prev) prevRun++;
      else { prev = alt; prevRun = 1; }
      pos++;
      continue;
    }

    let pick = Math.random() * total;
    chosen = viable[viable.length - 1];
    for (let i = 0; i < viable.length; i++) {
      if (weights[i] <= 0) continue;
      pick -= weights[i];
      if (pick <= 0) { chosen = viable[i]; break; }
    }

    for (const v of resolveMove(chosen)) {
      out.push(v);
      if (v === prev) prevRun++;
      else { prev = v; prevRun = 1; }
      pos++;
    }
  }

  // Ensure the span ends on a legitimate pickup into the next anchor.  If the
  // sampled moves ended on hat or snare (not a natural lead-in), rewrite the
  // final interior slot to the contextual pickup — but only if that rewrite
  // wouldn't violate the run cap.
  if (spanSize >= 2) {
    const last = out[spanSize - 1];
    const pickup = substituteFillVoice(pickupVoiceFor(nextAnchor), enabled);
    if (last !== pickup && last !== "ghost" && last !== "kick") {
      const before = out[spanSize - 2];
      let runBefore = 0;
      for (let i = spanSize - 2; i >= 0 && out[i] === before; i--) runBefore++;
      if (before !== pickup || runBefore < MAX_VOICE_RUN) {
        out[spanSize - 1] = pickup;
      }
    }
  }

  return out;
}

/**
 * Re-voice a pattern so kick/snare land on the accent positions and the
 * interior slots between accents carry groove-appropriate fill (ghost / kick /
 * hat) sized to each accent span. Call this AFTER applyAccentMode has placed
 * the accents — this function reads the accent pattern and makes the
 * voicing emphasize it.
 *
 * Without this step, an asymmetric accent grouping like 3+3+3+3+4 is only
 * visual: the accent marks move but the underlying K/S stay on per-beat
 * positions and the groove doesn't actually shift. With this step, the K/S
 * *follow* the accent grouping and the pattern grooves the displacement.
 *
 * Ghost notes are NEVER placed on accent slots (a ghost by definition is
 * unaccented decoration). If kick and snare are both disabled, the accent
 * falls back to hat rather than ghost.
 */
export function applyGrooveVoicing(
  pattern: VocalPattern,
  enabledVoices: DrumVoice[],
  opts: {
    /** When true (groove mode default), hat slots carry no syllable text so the
     *  staff reads as K/S/G punctuation over an implied ostinato. Linear mode
     *  passes false so every slot — including hats — shows its syllable, which
     *  is the "full vocabulary" reading view (the patterns are identical in
     *  voice content; only the syllable typography differs). */
    suppressHat?: boolean;
  } = {},
): VocalPattern {
  const suppressHat = opts.suppressHat ?? true;
  // Flatten slots to a global sequence.
  const flat: { groupIdx: number; slotIdx: number; slot: VocalSlot }[] = [];
  pattern.groups.forEach((g, gi) => {
    g.slots.forEach((s, si) => flat.push({ groupIdx: gi, slotIdx: si, slot: s }));
  });
  if (flat.length === 0) return pattern;

  // Find accent positions (fall back to slot 0 if nothing is accented).
  const accentPositions: number[] = [];
  flat.forEach((f, i) => { if (f.slot.isAccent) accentPositions.push(i); });
  if (accentPositions.length === 0) accentPositions.push(0);

  // Pre-resolve each accent's anchor voice (never ghost) so pickup logic in
  // the next span can read it to decide ghost-lead-in vs. kick-push.
  const anchors: DrumVoice[] = accentPositions.map((_, ai) =>
    substituteAccentVoice(accentRoleVoice(ai), enabledVoices),
  );

  // Build per-span voice sequences. The leading slots before the first accent
  // (if any) are filled with hat — they're an anacrusis leading into the
  // first downbeat.
  const voices: DrumVoice[] = new Array(flat.length).fill(
    substituteFillVoice("hat", enabledVoices),
  );
  // Motif cache — spans with matching (spanLen, anchor, nextAnchor) reuse a
  // shared voicing so the pattern exhibits call/response structure instead of
  // being a string of independent variations.  The cache is the difference
  // between "chops" (flat permutation) and "groove" (motif → restatement →
  // motif → fill).  A small per-restatement variation keeps repetition from
  // feeling mechanical, and the final span always generates fresh as the
  // phrase turnaround (drummer's "fill" slot before the downbeat returns).
  const motifCache = new Map<string, DrumVoice[]>();
  const MOTIF_REUSE_P = 0.8;       // probability of reusing a cached motif
  const MOTIF_VARIATION_P = 0.25;  // conditional probability of one-slot variation on reuse
  const lastIdx = accentPositions.length - 1;

  for (let ai = 0; ai < accentPositions.length; ai++) {
    const start = accentPositions[ai];
    const end = ai + 1 < accentPositions.length ? accentPositions[ai + 1] : flat.length;
    const spanLen = end - start;
    const anchor = anchors[ai];
    const nextAnchor = ai + 1 < anchors.length ? anchors[ai + 1] : anchors[0]; // loop
    const key = `${spanLen}:${anchor}:${nextAnchor}`;

    let spanVoices: DrumVoice[];
    const cached = motifCache.get(key);
    const isLast = ai === lastIdx && accentPositions.length >= 3;

    if (cached && !isLast && Math.random() < MOTIF_REUSE_P) {
      // Restatement — copy the motif, optionally vary one interior slot.
      spanVoices = cached.slice();
      if (spanLen >= 3 && Math.random() < MOTIF_VARIATION_P) {
        const varyIdx = 1 + Math.floor(Math.random() * (spanLen - 2));
        const current = spanVoices[varyIdx];
        const candidates: DrumVoice[] = (["ghost", "tom", "kick", "hat"] as DrumVoice[])
          .filter(v => v !== current && enabledVoices.includes(v));
        if (candidates.length > 0) {
          spanVoices[varyIdx] = candidates[Math.floor(Math.random() * candidates.length)];
        }
      }
    } else {
      spanVoices = grooveSpanVoices(spanLen, anchor, nextAnchor, enabledVoices);
      // Only cache the first occurrence; the fill-span stays out of the cache
      // so future patterns starting from this state still get a motif seed.
      if (!isLast) motifCache.set(key, spanVoices);
    }

    for (let k = 0; k < spanLen; k++) {
      voices[start + k] = spanVoices[k];
    }
  }

  // Snare-off-accent → ghost + cross-span run cap.  These two passes feed
  // each other: demoting an unaccented snare can create a ghost run, and
  // breaking a ghost run can introduce an alternative that needs demoting.
  // Iterate twice to let the fixed point settle.
  const ghostFallback = substituteFillVoice("ghost", enabledVoices);
  const accentAt = (idx: number) => flat[idx]?.slot.isAccent === true;

  const demoteSnares = () => {
    for (let i = 0; i < voices.length; i++) {
      if (voices[i] === "snare" && !accentAt(i)) {
        voices[i] = ghostFallback;
      }
    }
  };

  const breakRuns = () => {
    for (let i = 2; i < voices.length; i++) {
      const v = voices[i];
      if (v !== voices[i - 1] || v !== voices[i - 2]) continue;
      const breakPos = accentAt(i) ? i - 1 : i;
      const order: DrumVoice[] = accentAt(breakPos)
        ? ["snare", "tom", "kick", "hat"]
        : ["hat", "ghost", "tom", "kick"];
      const neighbor = (idx: number) => voices[idx];
      const alt = order.find(x =>
        x !== voices[breakPos] &&
        x !== neighbor(breakPos - 1) &&
        x !== neighbor(breakPos + 1) &&
        enabledVoices.includes(x),
      ) ?? order.find(x => x !== voices[breakPos] && enabledVoices.includes(x));
      if (alt && !(alt === "snare" && !accentAt(breakPos))) {
        voices[breakPos] = alt;
      }
    }
  };

  demoteSnares();
  breakRuns();
  demoteSnares();
  breakRuns();

  // Rewrite every slot's voice + syllable. Hat stays silent (suppressed
  // syllable) so the staff only labels the structurally loaded voices.
  // Voice-runs share the voice's syllable table so syllables walk naturally.
  const out = pattern.groups.map((g, gi) => {
    const starts = flat.findIndex(f => f.groupIdx === gi);
    const newSlots: VocalSlot[] = [];
    let i = 0;
    while (i < g.slots.length) {
      let j = i;
      const vi = voices[starts + i];
      while (j < g.slots.length && voices[starts + j] === vi) j++;
      const runLen = j - i;
      const syllables = getSyllables(vi, runLen);
      const suppress = vi === "hat" && suppressHat;
      for (let k = 0; k < runLen; k++) {
        const orig = g.slots[i + k];
        const rest = orig.isRest === true;
        newSlots.push({
          ...orig,
          voice: vi,
          syllable: rest || suppress ? "" : (syllables[Math.min(k, syllables.length - 1)] ?? ""),
        });
      }
      i = j;
    }
    return { ...g, slots: newSlots, voice: newSlots[0]?.voice ?? g.voice };
  });
  return { ...pattern, groups: out };
}

/**
 * Theoretically-grounded "space" placement for drum patterns.  Works for both
 * linear and groove voicings — what distinguishes it from a density-based rest
 * mask is that space is placed STRUCTURALLY, not sprinkled statistically.
 *
 * References — the space-placement rules draw from standard groove pedagogy:
 *
 *   - Jim Chapin, "Advanced Techniques for the Modern Drummer" (1948) —
 *     treats the hi-hat ostinato as a CARRIER that can be interrupted for
 *     melodic phrasing. Space breaks the carrier to expose the kick/snare
 *     conversation.
 *   - Gary Chaffee, "Patterns: Linear Phrasing" (1976) — the "displacement"
 *     school: space as a tool for shifting the feel away from the grid.
 *     Space lands on "weak" slots (the &-of-beat) to create syncopation
 *     without moving the accents.
 *   - Gary Chester, "The New Breed" (1985) — the bar of silence / the "hole"
 *     as a textural device: the groove is defined as much by where it does
 *     NOT hit as by where it does.
 *   - David Garibaldi, "Future Sounds" (1990) — space on the last slot
 *     before an accent creates "anticipation silence", making the accent
 *     land harder.
 *
 * Three invariants follow from these sources:
 *
 *   1. **Backbone is sacred.**  Accents (K/S on 1, 2, 3, 4 in a backbeat
 *      feel) are never silenced — they define the groove's identity.  Kick,
 *      snare, and tom slots are also preserved: they're structurally loaded
 *      even when unaccented, and silencing them hollows the groove.  Only
 *      hat and ghost slots are eligible for space.
 *
 *   2. **Loop turnover punches.**  The final accent span's pickup into the
 *      downbeat must sound — otherwise the loop doesn't turn over cleanly.
 *      The last 1–2 slots of the last span are protected.
 *
 *   3. **Offbeat bias.**  Space lands preferentially on the back half of an
 *      accent span (the Chaffee "&" territory) and as 2–3 slot runs so the
 *      silence has weight.  A single 1-slot gap reads as a dropped note;
 *      a 2–3 slot run reads as deliberate phrasing.
 *
 * A run-bridge guard prevents space from joining two separate same-voice runs
 * into a cap-breaking ≥3 run in the flattened audio sequence.
 *
 * Run this AFTER voicing (applyGrooveVoicing or enforceMusicalConstraints)
 * so voice assignments are final.
 */
export function applySpace(pattern: VocalPattern): VocalPattern {
  const flat: { g: number; s: number; slot: VocalSlot }[] = [];
  pattern.groups.forEach((grp, gi) =>
    grp.slots.forEach((s, si) => flat.push({ g: gi, s: si, slot: s })),
  );
  if (flat.length === 0) return pattern;

  const accentPositions: number[] = [];
  flat.forEach((f, i) => { if (f.slot.isAccent) accentPositions.push(i); });
  if (accentPositions.length < 2) return pattern;

  const spaceMask = new Array<boolean>(flat.length).fill(false);
  const numSpans = accentPositions.length;

  const audibleVoiceAt = (idx: number, step: 1 | -1): DrumVoice | null => {
    for (let i = idx; i >= 0 && i < flat.length; i += step) {
      if (!spaceMask[i] && !flat[i].slot.isRest) return flat[i].slot.voice;
    }
    return null;
  };
  // Would silencing slot i merge left+right audible neighbours into a run of ≥3?
  const wouldBridgeRun = (i: number): boolean => {
    const left = audibleVoiceAt(i - 1, -1);
    const right = audibleVoiceAt(i + 1, +1);
    if (left === null || right === null || left !== right) return false;
    let leftRun = 0;
    for (let k = i - 1; k >= 0; k--) {
      if (spaceMask[k] || flat[k].slot.isRest) continue;
      if (flat[k].slot.voice !== left) break;
      leftRun++;
    }
    let rightRun = 0;
    for (let k = i + 1; k < flat.length; k++) {
      if (spaceMask[k] || flat[k].slot.isRest) continue;
      if (flat[k].slot.voice !== right) break;
      rightRun++;
    }
    return leftRun + rightRun >= 3;
  };

  // For each non-final span, decide whether it hosts space and how long.
  // Target: ~60% of non-final spans get space; run length weighted toward 2–3
  // slots for the "deliberate phrasing" read over the "dropped note" read.
  for (let ai = 0; ai < numSpans - 1; ai++) {
    const spanStart = accentPositions[ai];
    const spanEnd = accentPositions[ai + 1];
    const spanLen = spanEnd - spanStart;
    if (spanLen < 3) continue;
    if (Math.random() > 0.6) continue;

    // Chaffee "&-of" territory: back half of the span, skip the accent itself.
    // Reserve the span's final slot as the pickup into the next anchor — a
    // space there reads as a dropped anacrusis, not as phrasing.
    const zoneStart = spanStart + Math.max(1, Math.floor(spanLen / 2));
    const zoneEnd = spanEnd - 1;
    if (zoneStart >= zoneEnd) continue;

    // Weight run lengths: 1→0.2, 2→0.5, 3→0.3 (cap at 3 for readability).
    const maxLen = Math.min(3, zoneEnd - zoneStart);
    const pickLen = (): number => {
      if (maxLen < 2) return 1;
      const r = Math.random();
      if (maxLen >= 3 && r < 0.3) return 3;
      if (r < 0.8) return 2;
      return 1;
    };
    const wantLen = pickLen();
    const dropStart = zoneStart + Math.floor(Math.random() * (zoneEnd - zoneStart - wantLen + 1));

    for (let i = dropStart; i < dropStart + wantLen && i < zoneEnd; i++) {
      const v = flat[i].slot.voice;
      if (v !== "hat" && v !== "ghost") continue;
      if (flat[i].slot.isAccent) continue;
      if (wouldBridgeRun(i)) continue;
      spaceMask[i] = true;
    }
  }

  const groups = pattern.groups.map((g, gi) => {
    const groupStart = flat.findIndex(f => f.g === gi);
    const slots = g.slots.map((s, si) => {
      const idx = groupStart + si;
      if (spaceMask[idx] && !s.isAccent) {
        return { ...s, isRest: true, syllable: "" };
      }
      return s;
    });
    return { ...g, slots };
  });

  return { ...pattern, groups };
}

/** @deprecated Renamed to applySpace. Alias preserved for existing imports. */
export const applyDramaticRests = applySpace;

/**
 * Post-process constraint enforcement for linear mode. Two universal rules:
 *
 *   1. **No ghost on an accent**. Accents are loud; ghosts are quiet by
 *      definition — the two are mutually exclusive in drum-set vocabulary.
 *      Any accented slot that came out as a ghost is promoted to snare
 *      (a loud ghost *is* a snare hit).
 *
 *   2. **No more than 2 consecutive slots of the same voice**. A double
 *      (GG, KK, SS) reads as a deliberate drag; 3+ in a row sounds like a
 *      stuck hand.  This pass walks the pattern globally and breaks any run
 *      of 3+ by changing the 3rd slot's voice to the closest alternative that
 *      doesn't extend a neighboring run.
 *
 * Syllables are regenerated per-group from the final voice assignment so the
 * run-walk stays consistent after voice changes. Hat syllables are preserved
 * (linear mode shows the full syllable grid — groove mode hides them via
 * applyGrooveVoicing instead).
 */
export function enforceMusicalConstraints(
  pattern: VocalPattern,
  enabledVoices: DrumVoice[],
): VocalPattern {
  const flat: VocalSlot[] = [];
  const groupStarts: number[] = [];
  for (const g of pattern.groups) {
    groupStarts.push(flat.length);
    for (const s of g.slots) flat.push(s);
  }
  if (flat.length === 0) return pattern;

  const voices = flat.map(s => s.voice);
  const accents = flat.map(s => s.isAccent);

  const promoteGhostAccents = () => {
    for (let i = 0; i < voices.length; i++) {
      if (accents[i] && voices[i] === "ghost") {
        voices[i] = substituteAccentVoice("snare", enabledVoices);
      }
    }
  };

  // Snare-off-accent → ghost.  Mirrors the rule in applyGrooveVoicing: an
  // unaccented snare reads as a ghost note in drum-set vocabulary, so the
  // notehead colour should follow.  Applied BEFORE breakLongRuns so any
  // ghost runs this creates are chopped down to the 2-in-a-row ceiling.
  const demoteUnaccentedSnares = () => {
    const ghostFallback = substituteFillVoice("ghost", enabledVoices);
    for (let i = 0; i < voices.length; i++) {
      if (voices[i] === "snare" && !accents[i]) {
        voices[i] = ghostFallback;
      }
    }
  };

  const breakLongRuns = () => {
    // Allow up to 2 consecutive same-voice slots; break runs of 3+.
    for (let i = 2; i < voices.length; i++) {
      const v = voices[i];
      if (v !== voices[i - 1] || v !== voices[i - 2]) continue;

      // Prefer to change the non-accented slot. Accents are structurally
      // important and shouldn't be demoted. If slot i is an accent, change
      // slot i-1 instead.
      const breakPos = accents[i] ? i - 1 : i;
      const cur = voices[breakPos];
      const next = breakPos + 1 < voices.length ? voices[breakPos + 1] : undefined;
      const prev = breakPos - 1 >= 0 ? voices[breakPos - 1] : undefined;
      const order: DrumVoice[] = accents[breakPos]
        ? ["snare", "tom", "kick", "hat"]
        : ["hat", "ghost", "tom", "snare", "kick"];
      let chosen: DrumVoice | undefined;
      for (const x of order) {
        if (x === cur) continue;
        if (x === next || x === prev) continue;
        if (!enabledVoices.includes(x)) continue;
        chosen = x;
        break;
      }
      if (!chosen) {
        for (const x of order) {
          if (x === cur) continue;
          if (!enabledVoices.includes(x)) continue;
          chosen = x;
          break;
        }
      }
      if (chosen) voices[breakPos] = chosen;
    }
  };

  // Anchor slot 0 on kick (when enabled).  Singable phrases need a strong
  // syllable on 1 — "Bum" (kick) is the universal downbeat anchor.  Without
  // this, ~40% of linear patterns open on hat ("ts") which has no attack
  // weight and the listener can't find the phrase start.  Only promotes when
  // kick is enabled and slot 0 isn't already accented as snare (a snare-1
  // pickup is valid vocabulary too).  Done BEFORE breakLongRuns so any
  // kick-cluster this creates at slots 0..1..2 gets chopped.
  if (voices.length > 0 && enabledVoices.includes("kick")) {
    if (voices[0] !== "kick" && !(accents[0] && voices[0] === "snare")) {
      voices[0] = "kick";
    }
  }

  promoteGhostAccents();
  demoteUnaccentedSnares();
  breakLongRuns();
  // Run pass 1 again in case pass 2 introduced a ghost on an accent slot
  // (shouldn't happen given our ordering, but defensive).
  promoteGhostAccents();
  // Run pass 2's snare→ghost again in case breakLongRuns reintroduced an
  // unaccented snare while trying to break a long ghost run.
  demoteUnaccentedSnares();
  breakLongRuns();

  // Rebuild slots per-group with regenerated syllables based on local runs.
  let cursor = 0;
  const newGroups = pattern.groups.map(g => {
    const gVoices = voices.slice(cursor, cursor + g.slots.length);
    cursor += g.slots.length;

    const newSlots: VocalSlot[] = [];
    let i = 0;
    while (i < g.slots.length) {
      let j = i;
      while (j < g.slots.length && gVoices[j] === gVoices[i]) j++;
      const runLen = j - i;
      const runVoice = gVoices[i];
      const syllables = getSyllables(runVoice, runLen);
      for (let k = 0; k < runLen; k++) {
        const orig = g.slots[i + k];
        const rest = orig.isRest === true;
        newSlots.push({
          ...orig,
          voice: runVoice,
          syllable: rest ? "" : (syllables[Math.min(k, syllables.length - 1)] ?? ""),
        });
      }
      i = j;
    }
    return { ...g, slots: newSlots, voice: newSlots[0]?.voice ?? g.voice };
  });

  return { ...pattern, groups: newGroups };
}

/**
 * Generate all integer compositions of totalSlots where every part is in
 * allowedSubdivisions. Returns [] if no composition is possible.
 */
function generateFilteredCompositions(
  totalSlots: number,
  allowedSubdivisions: number[],
): number[][] {
  const results: number[][] = [];
  const sorted = [...allowedSubdivisions].sort((a, b) => a - b);
  function build(remaining: number, current: number[]) {
    if (remaining === 0) {
      results.push([...current]);
      return;
    }
    // Limit total group count to avoid blow-up on small sizes
    if (current.length > 16) return;
    for (const size of sorted) {
      if (size <= remaining) {
        current.push(size);
        build(remaining - size, current);
        current.pop();
      }
    }
  }
  build(totalSlots, []);
  return results;
}

/**
 * Generate a beat-based grouping: each beat independently picks a density from
 * allowedSubdivisions. For numBeats=4 and allowed=[3,4,5], might produce
 * [3,4,5,4] or [5,5,3,4] etc. Each group corresponds to one beat.
 *
 * groupingMode biases the selection:
 *   musical: prefer patterns with repetition/symmetry (4+4+4+4, 3+4+3+4, 3+3+4+4)
 *   awkward: prefer patterns with variety (no adjacent repeats)
 *   both:    uniform random
 */
function generateBeatGrouping(
  numBeats: number,
  allowedSubdivisions: number[],
  groupingMode: GroupingMode,
  prevGroupings: number[][],
): number[] {
  const allowed = allowedSubdivisions.length > 0 ? allowedSubdivisions : [4];
  const prevKey = (g: number[]) => g.join("+");
  const prevSet = new Set(prevGroupings.map(prevKey));

  const pickOne = (): number[] => {
    const g: number[] = [];
    for (let i = 0; i < numBeats; i++) {
      let density: number;
      if (groupingMode === "awkward" && i > 0) {
        // Try to pick a different density than the previous beat
        const others = allowed.filter(d => d !== g[i - 1]);
        const pool = others.length > 0 ? others : allowed;
        density = pool[Math.floor(Math.random() * pool.length)];
      } else {
        density = allowed[Math.floor(Math.random() * allowed.length)];
      }
      g.push(density);
    }
    return g;
  };

  if (groupingMode === "musical") {
    // Prefer symmetry: half ABBA or AABB or all same. Try a few candidates,
    // pick one with more repeats.
    let best: number[] | null = null;
    let bestScore = -Infinity;
    for (let attempt = 0; attempt < 12; attempt++) {
      const cand = pickOne();
      if (prevSet.has(prevKey(cand))) continue;
      const distinct = new Set(cand).size;
      const reps = cand.length - distinct + 1; // more reps = higher score
      const score = reps + (cand[0] === cand[cand.length - 1] ? 1 : 0);
      if (score > bestScore) { best = cand; bestScore = score; }
    }
    if (best) return best;
  }

  // awkward / both / fallback
  for (let attempt = 0; attempt < 8; attempt++) {
    const cand = pickOne();
    if (!prevSet.has(prevKey(cand))) return cand;
  }
  return pickOne();
}

/**
 * Partition exactly `totalPulses` slots into a grouping whose part sizes are
 * drawn from `allowedSubdivisions` (interpreted here as group sizes, not
 * per-beat subdivisions). Used by "split by pulses" mode where the pattern is
 * a flat pulse stream of N slots with no underlying beat structure — accents
 * still emerge from group starts, exactly as in the by-beat path.
 */
export function generatePulseGrouping(
  totalPulses: number,
  allowedSubdivisions: number[],
  groupingMode: GroupingMode,
  prevGroupings: number[][] = [],
): number[] {
  const target = Math.max(1, Math.floor(totalPulses));
  const allowed = [...new Set(allowedSubdivisions.filter(n => n >= 1))].sort((a, b) => a - b);
  if (allowed.length === 0) allowed.push(1);
  const prevKey = (g: number[]) => g.join("+");
  const prevSet = new Set(prevGroupings.map(prevKey));

  const pickOne = (): number[] => {
    const g: number[] = [];
    let remaining = target;
    while (remaining > 0) {
      let candidates = allowed.filter(s => s <= remaining);
      // Last-step safety: if no allowed size fits, drop in a 1-slot remainder.
      if (candidates.length === 0) { g.push(remaining); break; }
      if (groupingMode === "awkward" && g.length > 0) {
        const others = candidates.filter(s => s !== g[g.length - 1]);
        if (others.length > 0) candidates = others;
      }
      const size = candidates[Math.floor(Math.random() * candidates.length)];
      g.push(size);
      remaining -= size;
    }
    return g;
  };

  if (groupingMode === "musical") {
    let best: number[] | null = null;
    let bestScore = -Infinity;
    for (let attempt = 0; attempt < 16; attempt++) {
      const cand = pickOne();
      if (prevSet.has(prevKey(cand))) continue;
      const distinct = new Set(cand).size;
      const reps = cand.length - distinct + 1;
      const score = reps + (cand[0] === cand[cand.length - 1] ? 1 : 0);
      if (score > bestScore) { best = cand; bestScore = score; }
    }
    if (best) return best;
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const cand = pickOne();
    if (!prevSet.has(prevKey(cand))) return cand;
  }
  return pickOne();
}

/**
 * Generate a pattern organized by BEATS: each beat = one group, with density
 * (notes per beat) randomly chosen from `allowedSubdivisions`.
 *
 * Example: numBeats=4, allowedSubdivisions=[3,4,5] → grouping like [4,3,5,4].
 */
export function generateVocalPattern(
  numBeats: number,
  groupingMode: GroupingMode,
  enabledVoices: DrumVoice[] = ALL_VOICES,
  prevGroupings: number[][] = [],
  allowedSubdivisions: number[] = [2, 3, 4, 5, 6, 7],
  restDensity = 0,
): VocalPattern {
  const grouping = generateBeatGrouping(numBeats, allowedSubdivisions, groupingMode, prevGroupings);
  const totalSlots = grouping.reduce((s, n) => s + n, 0);
  const groups = grouping.map(size => {
    const sticking = pickStickingForGroup(size, enabledVoices);
    return buildGroupFromSticking(sticking, size, enabledVoices, restDensity);
  });
  return { groups, grouping, totalSlots, numBeats };
}

/** Generate a pattern from an explicit grouping array. */
export function generateFromGrouping(
  grouping: number[],
  enabledVoices: DrumVoice[] = ALL_VOICES,
  restDensity = 0,
): VocalPattern {
  const groups = grouping.map(size => {
    const sticking = pickStickingForGroup(size, enabledVoices);
    return buildGroupFromSticking(sticking, size, enabledVoices, restDensity);
  });
  const totalSlots = grouping.reduce((a, b) => a + b, 0);
  return { groups, grouping, totalSlots };
}

/**
 * Generate a pattern from an explicit sticking string + grouping.
 * Each group slices the sticking; R/L/K map to hat/snare(or ghost)/kick.
 */
export function generateFromSticking(
  sticking: string,
  grouping: number[],
  enabledVoices: DrumVoice[] = ALL_VOICES,
  restDensity = 0,
): VocalPattern {
  const groups: VocalGroup[] = [];
  let cursor = 0;
  for (const size of grouping) {
    const segment = sticking.slice(cursor, cursor + size);
    groups.push(buildGroupFromSticking(segment, size, enabledVoices, restDensity));
    cursor += size;
  }
  return {
    groups,
    grouping,
    totalSlots: grouping.reduce((a, b) => a + b, 0),
  };
}

/* ── Polymetric cycle generation ──────────────────────────────────────────── */

/**
 * Generate a polymetric cycle where a phrase repeats over a fixed meter.
 *
 * The phrase (defined by grouping) repeats continuously. The meter defines
 * bar lines at a different interval. The pattern resolves when both clocks
 * realign at LCM(phraseLength, meterBeats).
 *
 * Example: grouping=[3,2] (5 slots), meter=4 beats
 *   → LCM(5,4)=20 slots, 4 phrase repeats, 5 bars
 *   → Phrase accents at 0,3,5,8,10,13,15,18
 *   → Bar lines at 0,4,8,12,16
 *   → Maximum displacement tension
 */
export function generatePolymetricCycle(
  grouping: number[],
  meterBeats: number,
  enabledVoices: DrumVoice[] = ALL_VOICES,
  restDensity = 0,
): VocalPattern {
  const phraseLength = grouping.reduce((a, b) => a + b, 0);
  const totalSlots = lcm(phraseLength, meterBeats);
  const repeats = totalSlots / phraseLength;

  // Cap at reasonable length (max 64 slots)
  const maxRepeats = Math.max(1, Math.floor(64 / phraseLength));
  const actualRepeats = Math.min(repeats, maxRepeats);
  const actualTotal = actualRepeats * phraseLength;

  // Pick stickings once for the phrase (so every cycle uses the same voicing)
  const phraseStickings = grouping.map(size => pickStickingForGroup(size, enabledVoices));

  const groups: VocalGroup[] = [];
  for (let r = 0; r < actualRepeats; r++) {
    for (let i = 0; i < grouping.length; i++) {
      groups.push(buildGroupFromSticking(phraseStickings[i], grouping[i], enabledVoices, restDensity));
    }
  }

  return {
    groups,
    grouping: Array.from({ length: actualRepeats }, () => grouping).flat(),
    totalSlots: actualTotal,
    phraseGrouping: grouping,
    meterBeats,
    cycleRepeats: actualRepeats,
  };
}

/* ── Playback helpers ─────────────────────────────────────────────────────── */

export interface PlaybackEvent {
  slot: VocalSlot;
  groupIdx: number;
  globalIdx: number;
  /** Time offset from pattern start, in "time units" (multiply by 60/bpm for seconds) */
  timeOffset: number;
}

export interface PlaybackResult {
  events: PlaybackEvent[];
  /** Total duration of the pattern in time units */
  totalDuration: number;
}

/**
 * Flatten a VocalPattern into a linear sequence of timed events.
 *
 * @param beatLocked When true, each GROUP spans exactly 1 beat regardless of
 *   its size. A group of 3 = triplet density, group of 4 = 16th density, etc.
 *   This creates push-pull between different subdivision densities.
 *   When false (default), each SLOT has equal duration.
 */
export function flattenForPlayback(
  pattern: VocalPattern,
  beatLocked = false,
): PlaybackResult {
  const events: PlaybackEvent[] = [];
  let globalIdx = 0;
  let timeOffset = 0;

  for (let gi = 0; gi < pattern.groups.length; gi++) {
    const group = pattern.groups[gi];
    // In beat-locked mode each group = 1 beat; in equal mode each slot = 1 unit
    const groupDuration = beatLocked ? 1 : group.size;
    const slotDuration = groupDuration / group.size;

    for (let si = 0; si < group.slots.length; si++) {
      events.push({
        slot: group.slots[si],
        groupIdx: gi,
        globalIdx,
        timeOffset,
      });
      timeOffset += slotDuration;
      globalIdx++;
    }
  }

  return { events, totalDuration: timeOffset };
}

/* ── Audio synthesis ──────────────────────────────────────────────────────── */

interface DrumSynthParams {
  freqStart: number;
  freqEnd: number;
  rampTime: number;
  attackTime: number;
  decayTime: number;
  gain: number;
  useNoise: boolean;
  hpf: number;
}

const DRUM_SYNTH: Record<DrumVoice, DrumSynthParams> = {
  kick:  { freqStart: 160, freqEnd: 50,   rampTime: 0.08, attackTime: 0.003, decayTime: 0.2,  gain: 0.7,  useNoise: false, hpf: 0 },
  snare: { freqStart: 400, freqEnd: 200,  rampTime: 0.02, attackTime: 0.001, decayTime: 0.1,  gain: 0.5,  useNoise: true,  hpf: 2000 },
  ghost: { freqStart: 300, freqEnd: 200,  rampTime: 0.01, attackTime: 0.002, decayTime: 0.06, gain: 0.15, useNoise: true,  hpf: 1500 },
  hat:   { freqStart: 8000, freqEnd: 6000, rampTime: 0.01, attackTime: 0.001, decayTime: 0.04, gain: 0.3,  useNoise: true,  hpf: 5000 },
  // Tom: mid-register pitched sweep between kick and snare — oscillator only
  // (no noise), longer decay than snare, no high-pass so the body comes through.
  tom:   { freqStart: 240, freqEnd: 120,  rampTime: 0.05, attackTime: 0.002, decayTime: 0.15, gain: 0.55, useNoise: false, hpf: 0 },
};

const CLICK_SYNTH: DrumSynthParams = {
  freqStart: 1000, freqEnd: 800, rampTime: 0.01,
  attackTime: 0.001, decayTime: 0.03, gain: 0.35,
  useNoise: false, hpf: 0,
};

export function scheduleDrumHit(
  ctx: AudioContext, time: number, voice: DrumVoice,
  accent: boolean, masterVol = 0.7,
): void {
  const p = DRUM_SYNTH[voice];
  const vol = p.gain * masterVol * (accent ? 1.4 : 1);

  if (p.useNoise) {
    const bufSize = Math.ceil(ctx.sampleRate * (p.attackTime + p.decayTime));
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + p.attackTime);
    g.gain.exponentialRampToValueAtTime(0.001, time + p.attackTime + p.decayTime);
    if (p.hpf > 0) {
      const f = ctx.createBiquadFilter();
      f.type = "highpass"; f.frequency.value = p.hpf;
      src.connect(f); f.connect(g);
    } else { src.connect(g); }
    g.connect(ctx.destination);
    src.start(time);
    src.stop(time + p.attackTime + p.decayTime + 0.01);
    if (voice === "snare") {
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.frequency.setValueAtTime(p.freqStart, time);
      osc.frequency.exponentialRampToValueAtTime(p.freqEnd, time + p.rampTime);
      og.gain.setValueAtTime(vol * 0.4, time);
      og.gain.exponentialRampToValueAtTime(0.001, time + p.decayTime);
      osc.connect(og); og.connect(ctx.destination);
      osc.start(time); osc.stop(time + p.decayTime + 0.01);
    }
  } else {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(p.freqStart, time);
    osc.frequency.exponentialRampToValueAtTime(Math.max(p.freqEnd, 1), time + p.rampTime);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + p.attackTime);
    g.gain.exponentialRampToValueAtTime(0.001, time + p.attackTime + p.decayTime);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(time); osc.stop(time + p.attackTime + p.decayTime + 0.01);
  }
}

export function schedulePulseClick(
  ctx: AudioContext, time: number, masterVol = 0.7,
): void {
  const p = CLICK_SYNTH;
  const vol = p.gain * masterVol;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.setValueAtTime(p.freqStart, time);
  osc.frequency.exponentialRampToValueAtTime(p.freqEnd, time + p.rampTime);
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(vol, time + p.attackTime);
  g.gain.exponentialRampToValueAtTime(0.001, time + p.attackTime + p.decayTime);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(time); osc.stop(time + p.attackTime + p.decayTime + 0.01);
}

/* ── Grouping parser ──────────────────────────────────────────────────────── */

export function parseGrouping(input: string): number[] | null {
  const parts = input.split(/[+,\s]+/).map(s => parseInt(s.trim(), 10));
  if (parts.some(n => isNaN(n) || n < 1 || n > 8)) return null;
  if (parts.length === 0) return null;
  return parts;
}
