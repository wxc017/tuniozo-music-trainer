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

/** Treat a sparse single-line entry (a bell/clave/timeline) as the hi-hat
 *  ostinato and build a simple kit under it: kick on the strong (even) pulse
 *  downbeats, snare backbeat on the odd pulses.  Yields a full, playable groove
 *  with the authentic timeline on top — not a bare one-voice line. */
function kitUnderTimeline(g: LibraryGroove, cycle: GrooveCycle): PointVoices[] {
  const offs = pointOffsets(cycle);
  const total = cycleTotalSlots(cycle);
  const pv: PointVoices[] = cycle.points.map(() => ({}));
  const add = (pi: number, voice: LayerVoice, local: number) => {
    const cur = pv[pi][voice] ?? { hits: [], doubles: [] };
    if (!cur.hits.includes(local)) cur.hits.push(local);
    pv[pi][voice] = cur;
  };
  // Densest defined voice = the timeline; ride it on the hi-hat.
  const timeline = [g.voices.hatClosed, g.voices.snareAccent, g.voices.bass, g.voices.hhFoot]
    .filter((a): a is number[] => !!a && a.length > 0)
    .sort((a, b) => b.length - a.length)[0] ?? [];
  for (const pos of timeline) {
    if (pos < 0 || pos >= total) continue;
    const pi = pulseOf(pos, offs);
    add(pi, "hatClosed", pos - offs[pi]);
  }
  // Kick/snare foundation under the bell.
  cycle.points.forEach((_p, i) => add(i, i % 2 === 0 ? "bass" : "snareAccent", 0));
  return pv;
}

/**
 * Vary a loaded groove with light theory moves so the SAME scaffolding can be
 * played many different ways — nothing about the result is predetermined.  The
 * skeleton that defines the STYLE is kept intact (existing kick anchors + snare
 * backbeat, plus any `preserve` voice such as a bell/clave timeline); ghosts,
 * hi-hat subdivision, the odd pushed kick, an open-hat accent and a 32nd
 * ornament are re-rolled around it.  Every call is fresh random.
 */
function varyGroove(src: PointVoices[], cycle: GrooveCycle, preserve: LayerVoice[] = []): PointVoices[] {
  const sizes = cycle.points.map(p => p.subPulses);
  const keep = new Set(preserve);
  const pv: PointVoices[] = src.map(p => {
    const o: PointVoices = {};
    for (const v of ALL_LIB_VOICES) if (p[v]) o[v] = { hits: [...p[v]!.hits], doubles: [...(p[v]!.doubles ?? [])] };
    return o;
  });

  // 1. Hat subdivision — change how the ride divides the pulse (8ths ↔ 16ths ↔
  //    offbeats ↔ mixed ↔ quarter).  Skipped when the closed-hat IS the
  //    preserved timeline (a clave/bell must stay put to keep the style).
  if (!keep.has("hatClosed") && pv.some(p => (p.hatClosed?.hits.length ?? 0) > 0) && chance(0.55)) {
    const shape = pick<HatShape>(["8ths", "16ths", "offbeats", "mixed", "quarter"]);
    pv.forEach((p, i) => { if (p.hatClosed) p.hatClosed = { hits: hatShapePositions(shape, sizes[i]), doubles: [] }; });
  }

  // 2. Ghost reshuffle — the main vocabulary driver.  Re-seed light ghost notes
  //    on the weak slots around the backbeat (never on a slot the snare accents).
  if (!keep.has("snareGhost") && chance(0.75)) {
    pv.forEach((p, i) => {
      const accents = new Set(p.snareAccent?.hits ?? []);
      const ghosts = seq(sizes[i]).filter(s => s !== 0 && !accents.has(s) && chance(0.18));
      if (ghosts.length) p.snareGhost = { hits: ghosts, doubles: [] };
      else delete p.snareGhost;
    });
  }

  // 3. Pushed kick — keep every existing kick, occasionally add a syncopated one
  //    on a late slot of a point.
  if (!keep.has("bass") && chance(0.55)) {
    pv.forEach((p, i) => {
      const cur = new Set(p.bass?.hits ?? []);
      const accents = new Set(p.snareAccent?.hits ?? []);
      const cand = seq(sizes[i]).filter(s => s !== 0 && !cur.has(s) && !accents.has(s));
      if (cand.length && chance(0.3)) cur.add(pick(cand));
      if (cur.size) p.bass = { hits: [...cur].sort((a, b) => a - b), doubles: [] };
    });
  }

  // 4. Open-hat accent — lift one offbeat closed hat into an open hat.
  if (!keep.has("hatClosed") && chance(0.3)) {
    const i = Math.floor(Math.random() * pv.length);
    const offs = (pv[i].hatClosed?.hits ?? []).filter(s => s !== 0);
    if (offs.length) {
      const s = pick(offs);
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

  return pv;
}

/**
 * Draw a RANDOM real-world groove of the cycle's length (filtered to the chosen
 * region/genre, or any tradition when none is given) and use it as SCAFFOLDING
 * only — `varyGroove` keeps its style skeleton and re-rolls the playing, so each
 * call exposes the player to a different groove played a different way.  A
 * full-kit entry (≥3 voices) supplies its own voices; a sparse timeline entry
 * becomes a preserved bell/clave over a kick+backbeat kit.  Falls back to the
 * generative engine only when no library entry of that length exists.
 */
export function generateInStyle(
  cycle: GrooveCycle,
  opts: { region?: Region; genre?: string; mode?: AestheticMode } = {},
): AssembleResult {
  const total = cycleTotalSlots(cycle);
  const pool = GROOVE_LIBRARY.filter(g =>
    g.length === total &&
    (!opts.region || g.region === opts.region) &&
    (!opts.genre || g.genre === opts.genre));
  if (pool.length > 0) {
    const g = pick(pool);
    const voiceCount = ALL_LIB_VOICES.filter(v => (g.voices[v]?.length ?? 0) > 0).length;
    const isTimeline = voiceCount < 3;
    const base = isTimeline ? kitUnderTimeline(g, cycle) : grooveToPointVoices(g, cycle);
    const pointVoices = varyGroove(base, cycle, isTimeline ? ["hatClosed"] : []);
    const assembled = assembleCycle(cycle, pointVoices);
    return { pointVoices, assembled, score: scoreGroove(assembled, resolveMode(opts.mode ?? "musical")), match: { groove: g, similarity: 1 } };
  }
  return assembleMusicalCycle(cycle, { mode: opts.mode });
}
