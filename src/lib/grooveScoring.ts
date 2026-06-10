/**
 * grooveScoring.ts — "Is this groove musical?" engine.
 *
 * Combines general rhythmic FEATURES with a cross-genre LIBRARY bonus, then a
 * generative half (`assembleMusicalCycle`) that permutes the core voices
 * (bass/snare/ghost) over fixed ostinato lines (hi-hat / left-foot / bass) and
 * returns the most musical full cycle + the world-music groove it resembles.
 *
 * Mirrors `musicalScoring.ts`; reuses `weightedScore`, `weightedPick`,
 * `resolveMode`.
 */

import {
  weightedScore, weightedPick, resolveMode, type AestheticMode,
} from "@/lib/musicalScoring";
import {
  AssembledCycle, GrooveCycle, PointVoices, VoicePlacement, LayerVoice,
  assembleCycle, enumerateVoicePerms, hatShapePositions, cycleTotalSlots, pointOffsets,
  type HatShape,
} from "@/lib/grooveCycle";
import {
  grooveLibraryBonus, nearestLibraryGroove, GROOVE_LIBRARY,
  type LibraryMatch, type LibraryGroove, type Region,
} from "@/lib/grooveLibrary";

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 1: Feature extraction
   ═══════════════════════════════════════════════════════════════════════════ */

export interface GrooveFeatures {
  backbeat: number; kickAnchor: number; interlock: number; syncopation: number;
  ghostPlacement: number; density: number; hatSteadiness: number;
  hasEmptyPulse: number; collision: number;
}

function triangle(x: number, peak: number): number {
  if (x <= peak) return peak === 0 ? 1 : x / peak;
  return peak === 1 ? 1 : (1 - x) / (1 - peak);
}

export function extractGrooveFeatures(a: AssembledCycle): GrooveFeatures {
  const P = a.pulseBoundaries.length;
  const starts = new Set(a.pulseBoundaries);
  const isStart = (s: number) => starts.has(s);

  let oddPulses = 0, backHits = 0;
  for (let i = 1; i < P; i += 2) { oddPulses++; if (a.snareHits.includes(a.pulseBoundaries[i])) backHits++; }
  const backbeat = oddPulses > 0 ? backHits / oddPulses : 0;

  let evenPulses = 0, anchorHits = 0;
  for (let i = 0; i < P; i += 2) { evenPulses++; if (a.bassHits.includes(a.pulseBoundaries[i])) anchorHits++; }
  const kickAnchor = evenPulses > 0 ? anchorHits / evenPulses : 0;

  const bassSet = new Set(a.bassHits);
  let collisions = 0;
  for (const s of a.snareHits) if (bassSet.has(s)) collisions++;
  const totalCore = a.bassHits.length + a.snareHits.length + a.ghostHits.length;
  const interlock = totalCore > 0 ? 1 - (collisions * 2) / totalCore : 0;

  const allCore = [...a.bassHits, ...a.snareHits, ...a.ghostHits];
  let offBeat = 0;
  for (const s of allCore) if (!isStart(s)) offBeat++;
  const syncopation = triangle(allCore.length > 0 ? offBeat / allCore.length : 0, 0.4);

  let ghostWeak = 0, ghostLeadIn = 0;
  const snareSet = new Set(a.snareHits);
  for (const g of a.ghostHits) {
    if (!isStart(g)) ghostWeak++;
    if (snareSet.has(g + 1) || snareSet.has(g + 2)) ghostLeadIn++;
  }
  const ghostPlacement = a.ghostHits.length > 0
    ? (ghostWeak / a.ghostHits.length) * 0.6 + (ghostLeadIn / a.ghostHits.length) * 0.4 : 0;

  const density = triangle(Math.min(1, (a.totalSlots > 0 ? totalCore / a.totalSlots : 0) / 0.7), 0.5);

  let hatSteadiness = 0;
  if (a.hatHits.length >= 2) {
    const sorted = [...a.hatHits].sort((x, y) => x - y);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
    hatSteadiness = 1 / (1 + variance);
  }

  const onsetAll = new Set([...allCore, ...a.hatHits, ...a.hatOpenHits, ...a.hhFootHits]);
  let hasEmptyPulse = 0;
  for (let i = 0; i < P; i++) {
    const lo = a.pulseBoundaries[i];
    const hi = i + 1 < P ? a.pulseBoundaries[i + 1] : a.totalSlots;
    let any = false;
    for (let s = lo; s < hi; s++) if (onsetAll.has(s)) { any = true; break; }
    if (!any) { hasEmptyPulse = 1; break; }
  }

  return {
    backbeat, kickAnchor, interlock: clamp1(interlock), syncopation, ghostPlacement,
    density, hatSteadiness, hasEmptyPulse, collision: totalCore > 0 ? collisions / totalCore : 0,
  };
}

const WEIGHTS_MUSICAL: Record<string, number> = {
  backbeat: 90, kickAnchor: 80, interlock: 60, syncopation: 50, ghostPlacement: 40,
  density: 60, hatSteadiness: 30, hasEmptyPulse: -200, collision: -120,
};
const WEIGHTS_AWKWARD: Record<string, number> = {
  backbeat: -60, kickAnchor: -50, interlock: -40, syncopation: -30, ghostPlacement: -20,
  density: -30, hatSteadiness: -40, hasEmptyPulse: -200, collision: 40,
};

/** Feature-only score (no library scan) — cheap, for ranking many candidates. */
export function scoreGrooveFeatures(a: AssembledCycle, mode: "musical" | "awkward"): number {
  const features = extractGrooveFeatures(a);
  const weights = mode === "musical" ? WEIGHTS_MUSICAL : WEIGHTS_AWKWARD;
  return weightedScore(features as unknown as Record<string, number>, weights);
}

/** Full score = features + cross-genre library bonus. The library scan is
 *  length-indexed but still ~O(entries of this length), so call this for
 *  DISPLAY / final ranking, not inside a tight candidate loop. */
export function scoreGroove(a: AssembledCycle, mode: "musical" | "awkward"): number {
  const base = scoreGrooveFeatures(a, mode);
  return mode === "musical" ? base + grooveLibraryBonus(a) : base;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 2: The musical-assembly engine (per-voice output)
   ═══════════════════════════════════════════════════════════════════════════ */

export interface AssembleResult {
  pointVoices: PointVoices[];
  assembled: AssembledCycle;
  score: number;
  match: LibraryMatch | null;
}

export interface AssembleOpts {
  mode?: AestheticMode;
  candidates?: number;
  /** Hi-hat ostinato shape. `undefined` = randomize for variety; `null` = none. */
  hat?: HatShape | null;
  /** Left-foot style. `undefined` = randomize. */
  footStyle?: FootStyle;
  /** Force linear vocab (one voice per slot). `undefined` = occasionally. */
  linear?: boolean;
  /** Allow 32nd double-stroke variants in the snare/ghost pools (default false). */
  includeDoubles?: boolean;
}

const HAT_SHAPES: HatShape[] = ["8ths", "16ths", "offbeats", "mixed", "quarter"];
type FootStyle = "none" | "backbeat" | "offbeats" | "downbeat";
const FOOT_STYLES: FootStyle[] = ["none", "none", "backbeat", "offbeats", "downbeat"]; // weighted toward none
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const chance = (p: number) => Math.random() < p;
const seq = (n: number) => Array.from({ length: n }, (_, i) => i);
const shuffled = <T,>(xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** Generation biases — each leans the random variation toward a voice or feel.
 *  Several can be active at once; an empty list means "no bias". */
export type GrooveBias = "ghost" | "bass" | "snare" | "mixedHat";

/** Left-foot positions for a point given a style. */
function footFor(style: FootStyle, pointIdx: number, size: number): number[] {
  switch (style) {
    case "backbeat": return pointIdx % 2 === 1 ? [0] : [];
    case "downbeat": return [0];
    case "offbeats": return [Math.floor(size / 2)];
    default:         return [];
  }
}

/** A linear candidate: exactly ONE voice per slot (hat/snare/ghost/bass weave a
 *  single line — the basis of linear funk and jazz-independence vocab). */
function linearCandidate(cycle: GrooveCycle): PointVoices[] {
  return cycle.points.map((p, pi) => {
    const bass: number[] = [], snare: number[] = [], ghost: number[] = [], hat: number[] = [];
    for (let s = 0; s < p.subPulses; s++) {
      if (s === 0 && pi % 2 === 1) snare.push(s);          // backbeat lands the line
      else if (s === 0 && pi % 2 === 0) bass.push(s);      // downbeat kick
      else if (Math.random() < 0.18) bass.push(s);          // syncopated kick
      else if (Math.random() < 0.14) ghost.push(s);         // ghost in the line
      else hat.push(s);                                     // hat fills the rest
    }
    const pv: PointVoices = {};
    if (bass.length) pv.bass = { hits: bass, doubles: [] };
    if (snare.length) pv.snareAccent = { hits: snare, doubles: [] };
    if (ghost.length) pv.snareGhost = { hits: ghost, doubles: [] };
    if (hat.length) pv.hatClosed = { hits: hat, doubles: [] };
    return pv;
  });
}

/** A small density-limited pool of placements for one voice in a point. */
function voicePool(size: number, voice: LayerVoice, maxK: number, includeDoubles: boolean): VoicePlacement[] {
  const out: VoicePlacement[] = [];
  for (let k = 0; k <= Math.min(size, maxK); k++) {
    for (const vp of enumerateVoicePerms(size, k, voice, { includeDoubles, maxPerNode: 200 })) {
      out.push({ hits: vp.hits, doubles: vp.doubles });
    }
  }
  return out;
}

/** Local musicality of a sampled placement, biased per voice + pulse role.
 *  Tuned to keep generated grooves SPARSE and readable — a clean kit groove is
 *  mostly one hit per voice per point, with ghosts the exception not the rule. */
function localScore(voice: LayerVoice, vp: VoicePlacement, pointIdx: number, _size: number): number {
  const hasDown = vp.hits.includes(0);
  const n = vp.hits.length;
  let s = 0;
  if (voice === "bass") {
    if (pointIdx % 2 === 0 && hasDown) s += 8;       // kick anchors the strong pulses
    s -= n * 2;                                       // prefer ≤1 kick per point
  } else if (voice === "snareAccent") {
    if (pointIdx % 2 === 1 && hasDown) s += 10;       // backbeat on 2 & 4
    if (pointIdx % 2 === 0) s -= 3;                   // discourage snare on strong pulses
    s -= n * 4;                                        // at most one snare per point
  } else if (voice === "snareGhost") {
    if (n === 0) s += 6;                               // most points have NO ghost (clarity)
    else { s += vp.hits.filter(h => h !== 0).length; s -= n * 3; }
  }
  return s;
}

export function assembleMusicalCycle(cycle: GrooveCycle, opts: AssembleOpts = {}): AssembleResult {
  const mode = resolveMode(opts.mode ?? "musical");
  const candidates = opts.candidates ?? 220;
  const includeDoubles = opts.includeDoubles ?? false;

  // Choose ONE template for this generation so each click varies: a random
  // hi-hat shape, a (usually-absent) left-foot, and now-and-then a linear feel.
  const hat: HatShape | null = opts.hat !== undefined ? opts.hat : pick(HAT_SHAPES);
  const footStyle: FootStyle = opts.footStyle ?? pick(FOOT_STYLES);
  const linear = opts.linear ?? Math.random() < 0.22;

  const pools = cycle.points.map(p => ({
    bass: voicePool(p.subPulses, "bass", 1, false),
    snare: voicePool(p.subPulses, "snareAccent", 1, includeDoubles),
    ghost: voicePool(p.subPulses, "snareGhost", 1, includeDoubles),
  }));
  const sample = (pool: VoicePlacement[], voice: LayerVoice, i: number, size: number) =>
    pool.length ? weightedPick(pool, vp => localScore(voice, vp, i, size)) : { hits: [], doubles: [] };

  const stacked = (): PointVoices[] => cycle.points.map((p, i) => {
    const size = p.subPulses;
    const pv: PointVoices = {
      bass:        sample(pools[i].bass, "bass", i, size),
      snareAccent: sample(pools[i].snare, "snareAccent", i, size),
      snareGhost:  sample(pools[i].ghost, "snareGhost", i, size),
    };
    if (hat) pv.hatClosed = { hits: hatShapePositions(hat, size), doubles: [] };
    const foot = footFor(footStyle, i, size);
    if (foot.length) pv.hhFoot = { hits: foot, doubles: [] };
    return pv;
  });

  let best: AssembleResult | null = null;
  for (let c = 0; c < candidates; c++) {
    const pointVoices = linear ? linearCandidate(cycle) : stacked();
    const assembled = assembleCycle(cycle, pointVoices);
    // Rank on features only — the full library scan runs once, on the winner.
    const score = scoreGrooveFeatures(assembled, mode);
    if (!best || score > best.score) best = { pointVoices, assembled, score, match: null };
  }
  if (!best) {
    const pointVoices = cycle.points.map(() => ({} as PointVoices));
    const assembled = assembleCycle(cycle, pointVoices);
    best = { pointVoices, assembled, score: scoreGroove(assembled, mode), match: null };
  }
  best.match = nearestLibraryGroove(best.assembled);
  return best;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 3: Tradition / style generation — draw idiomatic grooves from the
   1386-entry library so permutations + ostinatos fit the chosen tradition.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Convert a library groove's absolute onsets into per-point voice placements. */
export function grooveToPointVoices(g: LibraryGroove, cycle: GrooveCycle): PointVoices[] {
  const offs = pointOffsets(cycle);
  const total = cycleTotalSlots(cycle);
  const pv: PointVoices[] = cycle.points.map(() => ({}));
  const assign = (voice: LayerVoice, positions?: number[]) => {
    if (!positions) return;
    for (const pos of positions) {
      if (pos < 0 || pos >= total) continue;
      let pi = 0;
      for (let i = 0; i < offs.length; i++) if (pos >= offs[i]) pi = i;
      const local = pos - offs[pi];
      const cur = pv[pi][voice] ?? { hits: [], doubles: [] };
      if (!cur.hits.includes(local)) cur.hits.push(local);
      pv[pi][voice] = cur;
    }
  };
  assign("bass", g.voices.bass);
  assign("snareAccent", g.voices.snareAccent);
  assign("snareGhost", g.voices.snareGhost);
  assign("hatClosed", g.voices.hatClosed);
  assign("hatOpen", g.voices.hatOpen);
  assign("hhFoot", g.voices.hhFoot);
  return pv;
}

const ALL_LIB_VOICES: LayerVoice[] = ["bass", "snareAccent", "snareGhost", "hatClosed", "hatOpen", "hhFoot"];

/** Which slot/point a global position falls in. */
function pulseOf(pos: number, offs: number[]): number {
  let pi = 0;
  for (let i = 0; i < offs.length; i++) if (pos >= offs[i]) pi = i;
  return pi;
}

/** The densest voice a sparse entry defines — its timeline. */
function timelineVoice(g: LibraryGroove): LayerVoice {
  const vlen = (v: LayerVoice) => g.voices[v]?.length ?? 0;
  return (["hatClosed", "snareAccent", "bass", "hhFoot"] as LayerVoice[])
    .reduce((best, v) => (vlen(v) > vlen(best) ? v : best), "snareAccent" as LayerVoice);
}

/** Which KIT voice a timeline should be played on.  The decision is by how busy
 *  the line is, not a hard-coded accent map: a running line (more than ~1.5
 *  strokes per beat) is a ride/bell/cowbell pattern → the hi-hat (x-heads),
 *  where it reads as the bell it is and carries NO accent/ghost; a sparse clave
 *  stays a cross-stick on the snare (few strokes, all genuine accents).  This is
 *  why an evenly-spaced bell no longer comes out as a wall of snare accents. */
function timelineKitVoice(g: LibraryGroove, cycle: GrooveCycle): LayerVoice {
  const tv = timelineVoice(g);
  if (tv === "snareAccent") {
    const perBeat = (g.voices.snareAccent?.length ?? 0) / Math.max(1, cycle.points.length);
    if (perBeat > 1.5) return "hatClosed";   // a running bell → ride/cowbell, not the snare
  }
  return tv;
}

/** Turn a sparse single-line / two-voice entry (a bell, clave or timeline) into
 *  a FULL-KIT groove rather than a one-instrument part.  A busy bell rides on
 *  the hi-hat (see timelineKitVoice); a sparse clave is a cross-stick on the
 *  snare.  Then a real drumset foundation is built around it: a steady 8th-note
 *  hi-hat for time (if the line isn't already on the hat), a kick on the first +
 *  middle downbeats, and a backbeat snare when the kit would otherwise have none
 *  (e.g. a bell that rode to the hat). */
function kitUnderTimeline(g: LibraryGroove, cycle: GrooveCycle): PointVoices[] {
  const pv = grooveToPointVoices(g, cycle);
  const add = (pi: number, voice: LayerVoice, local: number) => {
    const cur = pv[pi][voice] ?? { hits: [], doubles: [] };
    if (!cur.hits.includes(local)) cur.hits.push(local);
    pv[pi][voice] = cur;
  };
  // Re-voice a busy bell off the snare onto the hi-hat: on a cymbal it reads as
  // the bell it is, instead of a wall of snare accents.
  const tv = timelineVoice(g);
  const bv = timelineKitVoice(g, cycle);
  if (bv !== tv) {
    pv.forEach(p => {
      const src = p[tv];
      if (!src) return;
      const dst = p[bv] ?? { hits: [], doubles: [] };
      for (const h of src.hits) if (!dst.hits.includes(h)) dst.hits.push(h);
      dst.hits.sort((a, b) => a - b);
      p[bv] = dst;
      delete p[tv];
    });
  }
  const hasHat = pv.some(p => (p.hatClosed?.hits.length ?? 0) > 0);
  const hasKick = pv.some(p => (p.bass?.hits.length ?? 0) > 0);
  const hasSnare = pv.some(p => (p.snareAccent?.hits.length ?? 0) > 0);
  // Steady 8th-note hi-hat for time (unless the bell already rides the hat).
  if (!hasHat) cycle.points.forEach((p, i) => { for (const s of hatShapePositions("8ths", p.subPulses)) add(i, "hatClosed", s); });
  // Kick foundation on the first + middle downbeats (not a 2&4 backbeat).
  if (!hasKick) {
    add(0, "bass", 0);
    const mid = cycle.points.length >> 1;
    if (mid > 0) add(mid, "bass", 0);
  }
  // Backbeat snare only if the kit has no snare of its own (e.g. a bell that
  // rode to the hat) — so a clave-on-snare keeps its own line untouched.
  if (!hasSnare) cycle.points.forEach((_p, i) => { if (i % 2 === 1) add(i, "snareAccent", 0); });
  return pv;
}

/** Voices for a library entry as a FULL-KIT groove: sparse timeline entries get
 *  a kit built around them (see kitUnderTimeline); full-kit entries load as-is.
 *  Used by both the generator and the library-reference loader so neither ever
 *  yields a bare one-instrument part. */
export function toKitVoices(g: LibraryGroove, cycle: GrooveCycle): PointVoices[] {
  return isTimelineGroove(g) ? kitUnderTimeline(g, cycle) : grooveToPointVoices(g, cycle);
}

/**
 * Vary a loaded groove with light theory moves so the SAME scaffolding can be
 * played many different ways — nothing about the result is predetermined.  The
 * skeleton that defines the STYLE is kept intact (existing kick anchors + snare
 * backbeat, plus any `preserve` voice such as a bell/clave timeline); ghosts,
 * hi-hat subdivision, the odd pushed kick, an open-hat accent and a 32nd
 * ornament are re-rolled around it.  Every call is fresh random.
 */
interface VaryOpts {
  /** Voices that must survive untouched (the style backbone / clave). */
  preserve?: LayerVoice[];
  /** Active generation biases — lean the random variation toward these. */
  biases?: GrooveBias[];
  /** Global intensity damp (<1 = gentler) — used for sparse timeline grooves so
   *  the clave's open feel survives the variation. */
  damp?: number;
}

/** Per-point hi-hat-foot (left-foot pedal) ostinato shapes. */
type FootShape = "none" | "backbeat" | "downbeats" | "offbeats" | "down+up";
function footOstinato(shape: FootShape, sizes: number[]): number[][] {
  return sizes.map((s, i) => {
    const mid = Math.min(s - 1, Math.max(1, Math.round(s / 2)));
    switch (shape) {
      case "backbeat":  return i % 2 === 1 ? [0] : [];   // foot "chick" on 2 & 4
      case "downbeats": return [0];                       // quarter-note foot
      case "offbeats":  return [mid];                     // foot on the "and"
      case "down+up":   return mid > 0 ? [0, mid] : [0];
      default:          return [];
    }
  });
}

/** Per-point bass-drum ostinato shapes (added on top of any existing kick). */
type BassOstShape = "none" | "four" | "down+mid" | "eighths" | "sixteenths" | "gallop";
function bassOstinato(shape: BassOstShape, sizes: number[]): number[][] {
  return sizes.map((s) => {
    const mid = Math.min(s - 1, Math.max(1, Math.round(s / 2)));
    switch (shape) {
      case "four":       return [0];                              // four-on-the-floor
      case "down+mid":   return mid > 0 ? [0, mid] : [0];
      case "eighths":    return seq(s).filter(x => x % 2 === 0);  // 8th double-bass
      case "sixteenths": return seq(s);                           // 16th double-bass
      case "gallop":     return s >= 2 ? [0, s - 1] : [0];        // kick + pickup
      default:           return [];
    }
  });
}

function varyGroove(src: PointVoices[], cycle: GrooveCycle, opts: VaryOpts = {}): PointVoices[] {
  const sizes = cycle.points.map(p => p.subPulses);
  const keep = new Set(opts.preserve ?? []);
  const bias = new Set(opts.biases ?? []);
  const damp = opts.damp ?? 1;
  const pv: PointVoices[] = src.map(p => {
    const o: PointVoices = {};
    for (const v of ALL_LIB_VOICES) if (p[v]) o[v] = { hits: [...p[v]!.hits], doubles: [...(p[v]!.doubles ?? [])] };
    return o;
  });

  // 1. Hi-hat subdivision — change how the ride divides the pulse.  Mixed-hat
  //    bias makes the swap near-certain and favours busier/syncopated shapes.
  //    Skipped when the closed-hat IS a preserved timeline.
  const hatBias = bias.has("mixedHat");
  if (!keep.has("hatClosed") && pv.some(p => (p.hatClosed?.hits.length ?? 0) > 0) && chance((hatBias ? 0.92 : 0.55) * damp)) {
    const shapes: HatShape[] = hatBias ? ["mixed", "16ths", "offbeats", "mixed", "16ths"] : ["8ths", "16ths", "offbeats", "mixed", "quarter"];
    const shape = pick(shapes);
    pv.forEach((p, i) => { if (p.hatClosed) p.hatClosed = { hits: hatShapePositions(shape, sizes[i]), doubles: [] }; });
  }

  // 2. Ghost reshuffle — the main vocabulary driver.  Ghost bias raises both the
  //    chance and the density of ghost notes (never on a slot the snare accents).
  const ghostProb = (bias.has("ghost") ? 0.95 : 0.75) * damp;
  const ghostDensity = bias.has("ghost") ? 0.40 : 0.18;
  if (!keep.has("snareGhost") && chance(ghostProb)) {
    pv.forEach((p, i) => {
      const accents = new Set(p.snareAccent?.hits ?? []);
      const ghosts = seq(sizes[i]).filter(s => s !== 0 && !accents.has(s) && chance(ghostDensity));
      if (ghosts.length) p.snareGhost = { hits: ghosts, doubles: [] };
      else delete p.snareGhost;
    });
  }

  // 3. Pushed kick — keep every existing kick; add syncopated ones.  Bass bias
  //    makes the kick busier (higher chance, up to two added per point).
  const kickOuter = (bias.has("bass") ? 0.85 : 0.55) * damp;
  const kickInner = bias.has("bass") ? 0.6 : 0.3;
  const kickMax = bias.has("bass") ? 2 : 1;
  if (!keep.has("bass") && chance(kickOuter)) {
    pv.forEach((p, i) => {
      const cur = new Set(p.bass?.hits ?? []);
      const accents = new Set(p.snareAccent?.hits ?? []);
      let added = 0;
      for (const s of shuffled(seq(sizes[i]))) {
        if (added >= kickMax) break;
        if (s !== 0 && !cur.has(s) && !accents.has(s) && chance(kickInner)) { cur.add(s); added++; }
      }
      if (cur.size) p.bass = { hits: [...cur].sort((a, b) => a - b), doubles: [] };
    });
  }

  // 3b. Snare-accent bias — add a syncopated snare accent (busier comping /
  //     displaced backbeat).  Off by default so it can't dilute a clean groove;
  //     skipped when the snare is a preserved clave.
  if (bias.has("snare") && !keep.has("snareAccent")) {
    pv.forEach((p, i) => {
      const cur = new Set(p.snareAccent?.hits ?? []);
      const cand = seq(sizes[i]).filter(s => s !== 0 && !cur.has(s));
      if (cand.length && chance(0.4)) {
        cur.add(pick(cand));
        p.snareAccent = { hits: [...cur].sort((a, b) => a - b), doubles: [] };
      }
    });
  }

  // 4. Open-hat accent — lift one offbeat closed hat into an open hat.  Mixed-hat
  //    bias makes this more frequent.
  if (!keep.has("hatClosed") && chance(bias.has("mixedHat") ? 0.6 : 0.3)) {
    const i = Math.floor(Math.random() * pv.length);
    const off = (pv[i].hatClosed?.hits ?? []).filter(s => s !== 0);
    if (off.length) {
      const s = pick(off);
      pv[i].hatClosed = { hits: pv[i].hatClosed!.hits.filter(h => h !== s), doubles: [] };
      pv[i].hatOpen = { hits: [...(pv[i].hatOpen?.hits ?? []), s], doubles: [] };
    }
  }

  // 5. Ornament — split one ghost/snare note into a 32nd double-stroke (a drag),
  //    never adjacent to another hit of that voice.
  if (chance(0.4)) {
    const i = Math.floor(Math.random() * pv.length);
    for (const v of ["snareGhost", "snareAccent"] as LayerVoice[]) {
      const pl = pv[i][v];
      if (pl && pl.hits.length) {
        const cands = pl.hits.filter(h => !pl.hits.includes(h + 1) && !pl.hits.includes(h - 1));
        if (cands.length) { pl.doubles = [pick(cands)]; break; }
      }
    }
  }

  // 6. LEFT-FOOT (hi-hat pedal) ostinato — the missing left-foot action.  A real
  //    chance every generation so a foot voice regularly appears; additive, so it
  //    never disturbs the hands.  Spread of shapes for breadth.
  if (!keep.has("hhFoot") && chance(0.7 * damp)) {
    const foot = footOstinato(pick<FootShape>(["backbeat", "backbeat", "downbeats", "offbeats", "down+up", "none"]), sizes);
    pv.forEach((p, i) => { if (foot[i].length) p.hhFoot = { hits: foot[i], doubles: [] }; else delete p.hhFoot; });
  }

  // 7. BASS ostinato — lay a repeating kick foundation (four-on-floor, 8th/16th
  //    double-bass, gallop) on top of the existing kick for variety; only when
  //    the kick isn't a preserved style skeleton.  Bass bias = busier + likelier.
  if (!keep.has("bass") && chance((bias.has("bass") ? 0.6 : 0.32) * damp)) {
    const shapes: BassOstShape[] = bias.has("bass")
      ? ["eighths", "sixteenths", "down+mid", "gallop", "four"]
      : ["four", "down+mid", "eighths", "none", "none"];
    const bassO = bassOstinato(pick(shapes), sizes);
    pv.forEach((p, i) => {
      if (!bassO[i].length) return;
      const cur = new Set(p.bass?.hits ?? []);
      for (const s of bassO[i]) cur.add(s);
      p.bass = { hits: [...cur].sort((a, b) => a - b), doubles: p.bass?.doubles ?? [] };
    });
  }

  // 8. No ghost on a kick — a parenthesised ghost stacked on the bass drum reads
  //    as nonsense; drop any ghost that lands on a bass hit (covers the source
  //    groove and any kick added above).
  pv.forEach(p => {
    if (!p.snareGhost) return;
    const bassSet = new Set(p.bass?.hits ?? []);
    const cleaned = p.snareGhost.hits.filter(h => !bassSet.has(h));
    if (cleaned.length) p.snareGhost = { hits: cleaned, doubles: (p.snareGhost.doubles ?? []).filter(d => cleaned.includes(d)) };
    else delete p.snareGhost;
  });

  return pv;
}

/** Source-type test: a sparse single-line entry (<3 defined voices) is treated
 *  as a bell/clave TIMELINE (kept as a cross-stick clave on the snare under a
 *  light kick + hi-hat); a fuller entry supplies its own kit voices directly. */
export function isTimelineGroove(g: LibraryGroove): boolean {
  return ALL_LIB_VOICES.filter(v => (g.voices[v]?.length ?? 0) > 0).length < 3;
}

/** Build one varied groove from a SPECIFIC library entry used as scaffolding.
 *  Shared by generateInStyle and the stress test so both exercise identical
 *  logic: keep the style skeleton, re-roll the playing (see varyGroove).  The
 *  optional `biases` lean the variation toward a voice/feel (ghost-heavy,
 *  busy bass, busy snare, mixed hi-hat). */
export function generateFromGroove(
  g: LibraryGroove, cycle: GrooveCycle,
  opts: { mode?: AestheticMode; biases?: GrooveBias[]; computeScore?: boolean } = {},
): AssembleResult {
  const timeline = isTimelineGroove(g);
  const base = timeline ? kitUnderTimeline(g, cycle) : grooveToPointVoices(g, cycle);
  const pointVoices = varyGroove(base, cycle, {
    // Timeline grooves keep the bell/clave intact on whichever kit voice it was
    // played on (ride-hat for a busy bell, cross-stick snare for a clave); the
    // supplemented kit around it (kick, backbeat, hat) is free to re-roll.
    // Full-kit grooves keep their backbone (snare + kick are never removed).
    preserve: timeline ? [timelineKitVoice(g, cycle)] : [],
    biases: opts.biases,
    damp: timeline ? 0.6 : 1,   // keep sparse timelines open
  });
  const assembled = assembleCycle(cycle, pointVoices);
  const m = resolveMode(opts.mode ?? "musical");
  // computeScore:false skips the full library-bonus scan (nearestLibraryGroove)
  // — used by the stress test to avoid 100k library scans; production keeps the
  // full score.  The generated groove itself is identical either way.
  const score = (opts.computeScore ?? true) ? scoreGroove(assembled, m) : scoreGrooveFeatures(assembled, m);
  return { pointVoices, assembled, score, match: { groove: g, similarity: 1 } };
}

export function generateInStyle(
  cycle: GrooveCycle,
  opts: { region?: Region; genre?: string; mode?: AestheticMode; biases?: GrooveBias[] } = {},
): AssembleResult {
  const total = cycleTotalSlots(cycle);
  const pool = GROOVE_LIBRARY.filter(g =>
    g.length === total &&
    (!opts.region || g.region === opts.region) &&
    (!opts.genre || g.genre === opts.genre));
  if (pool.length > 0) return generateFromGroove(pick(pool), cycle, { mode: opts.mode, biases: opts.biases });
  return assembleMusicalCycle(cycle, { mode: opts.mode });
}
