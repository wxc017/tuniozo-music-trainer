/**
 * independenceData.ts — 4-Way Limb Independence study engine
 *
 * Each limb gets an independent full-measure rhythm where EACH BEAT is
 * independently randomized from the allowed permutation families.
 *
 * Uses the musicalScoring framework: extract features from each candidate
 * combination, apply musical/awkward weights, probabilistic selection via
 * weightedPick. Musical mode favors grounded, playable coordination;
 * awkward mode favors disorienting, cross-limb syncopation.
 */

import { GridType, GRID_SUBDIVS, Permutation, getPerms } from "./drumData";
import { weightedScore, weightedPick, type AestheticMode, resolveMode } from "./musicalScoring";

// ── Types ──────────────────────────────────────────────────────────────────

export type IndependenceGrid = "8th" | "16th" | "triplet";

export const INDEPENDENCE_GRID_LABELS: Record<IndependenceGrid, string> = {
  "8th": "8th",
  "16th": "16th",
  triplet: "Triplet",
};

export { type AestheticMode } from "./musicalScoring";

export interface VoiceConfig {
  enabled: boolean;
  allowedFamilies: number[];
  locked: boolean;
}

export interface IndependenceMeasureData {
  cymbalHits: number[];
  cymbalOpen: number[];
  snareHits: number[];
  snareAccents: boolean[];
  ghostHits: number[];
  bassHits: number[];
  hhFootHits: number[];
  grid: IndependenceGrid;
  beats: number;
  cymbalPermIds?: string;
  snarePermIds?: string;
  bassPermIds?: string;
  hhFootPermIds?: string;
  lineBreak?: boolean;
}

export interface IndependenceExercise {
  id: string;
  name: string;
  date: string;
  grid: IndependenceGrid;
  beats: number;
  measures: IndependenceMeasureData[];
  rating: number;
}

// ── Generation helpers ─────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateVoiceMeasure(
  perms: Permutation[],
  families: number[],
  beatSize: number,
  numBeats: number,
): { hits: number[]; permIds: string[] } {
  const eligible = perms.filter(p => families.includes(p.family));
  if (eligible.length === 0) return { hits: [], permIds: [] };

  const hits: number[] = [];
  const permIds: string[] = [];

  for (let beat = 0; beat < numBeats; beat++) {
    const perm = pick(eligible);
    permIds.push(perm.id);
    for (const slot of perm.beatSlots) {
      hits.push(slot + beat * beatSize);
    }
  }

  hits.sort((a, b) => a - b);
  return { hits, permIds };
}

// ── Feature extraction ─────────────────────────────────────────────────────

interface IndependenceFeatures {
  /** Fraction of slots with 2+ voices attacking simultaneously */
  unisonDensity: number;
  /** Fraction of downbeats (beat 1,2,3,4) that have bass+cymbal together */
  downbeatAnchoring: number;
  /** Bass on beat 1 specifically */
  hasBeat1Bass: number;
  /** Snare on beats 2 and 4 (backbeat) */
  backbeatSnare: number;
  /** How many beats have unique voice combinations vs repeating */
  beatVariety: number;
  /** Bass syncopation: fraction of bass hits on non-downbeat positions */
  bassSyncopation: number;
  /** Cymbal regularity: how uniform is the cymbal pattern across beats */
  cymbalRegularity: number;
  /** Foot independence: bass and hhFoot on adjacent slots (rapid alternation) */
  footAlternation: number;
  /** Cross-limb syncopation: voices attacking on the "and" of each other */
  crossLimbSyncopation: number;
  /** Density evenness: how evenly distributed are total attacks across beats */
  densityBalance: number;
  /** Total density: fraction of (slots × active voices) filled */
  totalDensity: number;
  /** Snare variety: how many unique snare beat-patterns across the 4 beats */
  snareVariety: number;
}

function extractFeatures(
  cymHits: number[],
  snrHits: number[],
  basHits: number[],
  hhHits: number[],
  totalSlots: number,
  beatSize: number,
): IndependenceFeatures {
  const cymSet = new Set(cymHits);
  const snrSet = new Set(snrHits);
  const basSet = new Set(basHits);
  const hhSet = new Set(hhHits);

  // Unison density: slots where 2+ voices coincide
  let unisonCount = 0;
  for (let i = 0; i < totalSlots; i++) {
    let count = 0;
    if (cymSet.has(i)) count++;
    if (snrSet.has(i)) count++;
    if (basSet.has(i)) count++;
    if (hhSet.has(i)) count++;
    if (count >= 2) unisonCount++;
  }

  // Downbeat anchoring
  const numBeats = 4;
  let anchoredBeats = 0;
  for (let b = 0; b < numBeats; b++) {
    const pos = b * beatSize;
    if ((cymSet.has(pos) || snrSet.has(pos)) && basSet.has(pos)) anchoredBeats++;
  }

  // Beat 1 bass
  const hasBeat1Bass = basSet.has(0) ? 1 : 0;

  // Backbeat snare (beats 2 and 4)
  const beat2Pos = beatSize;
  const beat4Pos = beatSize * 3;
  const backbeat = ((snrSet.has(beat2Pos) ? 1 : 0) + (snrSet.has(beat4Pos) ? 1 : 0)) / 2;

  // Beat variety: fingerprint each beat as a string of which voices play, count uniques
  const beatFingerprints: string[] = [];
  for (let b = 0; b < numBeats; b++) {
    let fp = "";
    for (let s = 0; s < beatSize; s++) {
      const pos = b * beatSize + s;
      let cell = "";
      if (cymSet.has(pos)) cell += "c";
      if (snrSet.has(pos)) cell += "s";
      if (basSet.has(pos)) cell += "b";
      if (hhSet.has(pos)) cell += "h";
      fp += cell + ",";
    }
    beatFingerprints.push(fp);
  }
  const uniqueBeats = new Set(beatFingerprints).size;

  // Bass syncopation
  let bassSynco = 0;
  for (const b of basHits) {
    if (b % beatSize !== 0) bassSynco++;
  }

  // Cymbal regularity: compare each beat's cymbal pattern
  const cymBeatPatterns: string[] = [];
  for (let b = 0; b < numBeats; b++) {
    const pattern = Array.from({ length: beatSize }, (_, s) =>
      cymSet.has(b * beatSize + s) ? "1" : "0"
    ).join("");
    cymBeatPatterns.push(pattern);
  }
  const uniqueCymBeats = new Set(cymBeatPatterns).size;

  // Foot alternation: bass and hhFoot on adjacent slots
  let footAlt = 0;
  const footEvents: { slot: number; voice: string }[] = [];
  for (const b of basHits) footEvents.push({ slot: b, voice: "b" });
  for (const h of hhHits) footEvents.push({ slot: h, voice: "h" });
  footEvents.sort((a, b) => a.slot - b.slot);
  for (let i = 1; i < footEvents.length; i++) {
    if (footEvents[i].voice !== footEvents[i - 1].voice &&
        footEvents[i].slot - footEvents[i - 1].slot <= 1) {
      footAlt++;
    }
  }

  // Cross-limb syncopation: count slots where one voice plays on the "and"
  // position relative to another voice's downbeat hit
  let crossSynco = 0;
  for (let b = 0; b < numBeats; b++) {
    const downbeat = b * beatSize;
    // If bass is on downbeat, check if snare or cymbal is on an offbeat in that beat
    if (basSet.has(downbeat)) {
      for (let s = 1; s < beatSize; s++) {
        const pos = downbeat + s;
        if (snrSet.has(pos) || cymSet.has(pos)) crossSynco++;
      }
    }
    // If snare is on downbeat, check if bass is on offbeat
    if (snrSet.has(downbeat)) {
      for (let s = 1; s < beatSize; s++) {
        if (basSet.has(downbeat + s)) crossSynco++;
      }
    }
  }

  // Density balance: variance of attacks per beat
  const beatsAttacks: number[] = [];
  for (let b = 0; b < numBeats; b++) {
    let count = 0;
    for (let s = 0; s < beatSize; s++) {
      const pos = b * beatSize + s;
      if (cymSet.has(pos) || snrSet.has(pos) || basSet.has(pos) || hhSet.has(pos)) count++;
    }
    beatsAttacks.push(count);
  }
  const avgAttacks = beatsAttacks.reduce((a, b) => a + b, 0) / numBeats;
  const variance = beatsAttacks.reduce((s, c) => s + (c - avgAttacks) ** 2, 0) / numBeats;
  const densityBalance = avgAttacks > 0 ? 1 - Math.min(1, variance / (avgAttacks + 1)) : 0;

  // Total density
  const allHits = new Set([...cymHits, ...snrHits, ...basHits, ...hhHits]);
  const totalDensity = allHits.size / totalSlots;

  // Snare variety
  const snrBeatPatterns: string[] = [];
  for (let b = 0; b < numBeats; b++) {
    const pattern = Array.from({ length: beatSize }, (_, s) =>
      snrSet.has(b * beatSize + s) ? "1" : "0"
    ).join("");
    snrBeatPatterns.push(pattern);
  }
  const uniqueSnrBeats = new Set(snrBeatPatterns).size;

  return {
    unisonDensity: totalSlots > 0 ? unisonCount / totalSlots : 0,
    downbeatAnchoring: anchoredBeats / numBeats,
    hasBeat1Bass,
    backbeatSnare: backbeat,
    beatVariety: (uniqueBeats - 1) / Math.max(1, numBeats - 1), // 0=all same, 1=all different
    bassSyncopation: basHits.length > 0 ? bassSynco / basHits.length : 0,
    cymbalRegularity: 1 - (uniqueCymBeats - 1) / Math.max(1, numBeats - 1), // 1=uniform, 0=all different
    footAlternation: footEvents.length > 1 ? footAlt / (footEvents.length - 1) : 0,
    crossLimbSyncopation: Math.min(1, crossSynco / (numBeats * 2)),
    densityBalance,
    totalDensity,
    snareVariety: (uniqueSnrBeats - 1) / Math.max(1, numBeats - 1),
  };
}

// ── Weight tables ──────────────────────────────────────────────────────────

/** Musical: grounded, playable, clear pulse, moderate independence */
const WEIGHTS_MUSICAL: Record<string, number> = {
  unisonDensity:        40,   // some unisons = glue between voices
  downbeatAnchoring:    120,  // bass+cymbal on downbeats = strong pulse
  hasBeat1Bass:         100,  // beat 1 bass = grounding
  backbeatSnare:        80,   // snare on 2 & 4 = groove
  beatVariety:          60,   // some variety across beats (not all same)
  bassSyncopation:      -60,  // on-beat bass = stable
  cymbalRegularity:     80,   // consistent cymbal pattern = ride feel
  footAlternation:      -80,  // avoid rapid foot switching
  crossLimbSyncopation: 30,   // moderate cross-limb interest
  densityBalance:       60,   // even density across beats
  totalDensity:         -30,  // not too dense
  snareVariety:         40,   // some snare variation
};

/** Awkward: destabilizing, syncopated, challenging coordination */
const WEIGHTS_AWKWARD: Record<string, number> = {
  unisonDensity:        -60,  // avoid unisons (forces independence)
  downbeatAnchoring:    -80,  // no anchoring (floating feel)
  hasBeat1Bass:         -60,  // no beat 1 bass (disorienting)
  backbeatSnare:        -80,  // no backbeat (no groove reference)
  beatVariety:          100,  // maximum variety across beats
  bassSyncopation:      100,  // bass on offbeats = destabilizing
  cymbalRegularity:     -80,  // irregular cymbal = no ride reference
  footAlternation:      80,   // rapid foot switching = challenge
  crossLimbSyncopation: 80,   // lots of cross-limb syncopation
  densityBalance:       -40,  // uneven density = harder to track
  totalDensity:         30,   // denser = more going on
  snareVariety:         80,   // snare varies every beat
};

// ── Hard constraints ───────────────────────────────────────────────────────

function passesHardConstraints(
  basHits: number[],
  hhHits: number[],
): boolean {
  const basSet = new Set(basHits);
  for (const h of hhHits) {
    if (basSet.has(h)) return false;
  }
  return true;
}

// ── Main generation ────────────────────────────────────────────────────────

export function generateIndependenceMeasure(
  grid: IndependenceGrid,
  beats: number,
  voiceConfigs: {
    cymbal: VoiceConfig;
    snare: VoiceConfig;
    bass: VoiceConfig;
    hhFoot: VoiceConfig;
  },
  mode: AestheticMode,
  previousMeasures: IndependenceMeasureData[],
  lockedData?: Partial<IndependenceMeasureData>,
): IndependenceMeasureData {
  const perms = getPerms(grid);
  const totalSlots = GRID_SUBDIVS[grid];
  const beatSize = totalSlots / 4;
  const numBeats = 4;
  const resolvedMode = resolveMode(mode);
  const weights = resolvedMode === "musical" ? WEIGHTS_MUSICAL : WEIGHTS_AWKWARD;

  // Generate a pool of candidates
  const POOL_SIZE = 80;
  const candidates: IndependenceMeasureData[] = [];

  for (let attempt = 0; attempt < POOL_SIZE * 3; attempt++) {
    if (candidates.length >= POOL_SIZE) break;

    let cymHits: number[] = [];
    let snrHits: number[] = [];
    let basHits: number[] = [];
    let hhHits: number[] = [];
    let cymIds = "";
    let snrIds = "";
    let basIds = "";
    let hhIds = "";

    if (voiceConfigs.cymbal.enabled) {
      if (voiceConfigs.cymbal.locked && lockedData?.cymbalHits) {
        cymHits = lockedData.cymbalHits;
        cymIds = lockedData.cymbalPermIds ?? "";
      } else {
        const r = generateVoiceMeasure(perms, voiceConfigs.cymbal.allowedFamilies, beatSize, numBeats);
        cymHits = r.hits;
        cymIds = r.permIds.join("|");
      }
    }

    if (voiceConfigs.snare.enabled) {
      if (voiceConfigs.snare.locked && lockedData?.snareHits) {
        snrHits = lockedData.snareHits;
        snrIds = lockedData.snarePermIds ?? "";
      } else {
        const r = generateVoiceMeasure(perms, voiceConfigs.snare.allowedFamilies, beatSize, numBeats);
        snrHits = r.hits;
        snrIds = r.permIds.join("|");
      }
    }

    if (voiceConfigs.bass.enabled) {
      if (voiceConfigs.bass.locked && lockedData?.bassHits) {
        basHits = lockedData.bassHits;
        basIds = lockedData.bassPermIds ?? "";
      } else {
        const r = generateVoiceMeasure(perms, voiceConfigs.bass.allowedFamilies, beatSize, numBeats);
        basHits = r.hits;
        basIds = r.permIds.join("|");
      }
    }

    if (voiceConfigs.hhFoot.enabled) {
      if (voiceConfigs.hhFoot.locked && lockedData?.hhFootHits) {
        hhHits = lockedData.hhFootHits;
        hhIds = lockedData.hhFootPermIds ?? "";
      } else {
        const r = generateVoiceMeasure(perms, voiceConfigs.hhFoot.allowedFamilies, beatSize, numBeats);
        hhHits = r.hits;
        hhIds = r.permIds.join("|");
      }
    }

    if (!passesHardConstraints(basHits, hhHits)) continue;

    candidates.push({
      cymbalHits: cymHits,
      cymbalOpen: [],
      snareHits: snrHits,
      snareAccents: new Array(totalSlots).fill(false),
      ghostHits: [],
      bassHits: basHits,
      hhFootHits: hhHits,
      grid,
      beats,
      cymbalPermIds: cymIds,
      snarePermIds: snrIds,
      bassPermIds: basIds,
      hhFootPermIds: hhIds,
    });
  }

  if (candidates.length === 0) {
    // Fallback
    return {
      cymbalHits: voiceConfigs.cymbal.enabled ? [0, beatSize, beatSize * 2, beatSize * 3] : [],
      cymbalOpen: [],
      snareHits: voiceConfigs.snare.enabled ? [beatSize, beatSize * 3] : [],
      snareAccents: new Array(totalSlots).fill(false),
      ghostHits: [],
      bassHits: voiceConfigs.bass.enabled ? [0, beatSize * 2] : [],
      hhFootHits: [],
      grid,
      beats,
    };
  }

  // Collect recent perm ID strings for novelty
  const recentIds = new Set<string>();
  for (const m of previousMeasures.slice(-4)) {
    if (m.cymbalPermIds) recentIds.add(m.cymbalPermIds);
    if (m.snarePermIds) recentIds.add(m.snarePermIds);
    if (m.bassPermIds) recentIds.add(m.bassPermIds);
    if (m.hhFootPermIds) recentIds.add(m.hhFootPermIds);
  }

  // Score and select
  return weightedPick(candidates, (c) => {
    const features = extractFeatures(
      c.cymbalHits, c.snareHits, c.bassHits, c.hhFootHits,
      totalSlots, beatSize,
    );
    let score = weightedScore(features as unknown as Record<string, number>, weights);

    // Novelty penalty
    let noveltyPenalty = 0;
    if (c.cymbalPermIds && recentIds.has(c.cymbalPermIds)) noveltyPenalty += 40;
    if (c.snarePermIds && recentIds.has(c.snarePermIds)) noveltyPenalty += 40;
    if (c.bassPermIds && recentIds.has(c.bassPermIds)) noveltyPenalty += 40;
    if (c.hhFootPermIds && recentIds.has(c.hhFootPermIds)) noveltyPenalty += 40;
    score -= noveltyPenalty;

    return score;
  });
}

// ── Storage ────────────────────────────────────────────────────────────────

const INDEPENDENCE_LOG_KEY = "lt_independence_log";

export function loadIndependenceLog(): IndependenceExercise[] {
  try {
    const raw = localStorage.getItem(INDEPENDENCE_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveIndependenceExercise(ex: IndependenceExercise) {
  const log = loadIndependenceLog();
  log.push(ex);
  localStorage.setItem(INDEPENDENCE_LOG_KEY, JSON.stringify(log));
}

export function deleteIndependenceExercise(id: string) {
  const log = loadIndependenceLog().filter(ex => ex.id !== id);
  localStorage.setItem(INDEPENDENCE_LOG_KEY, JSON.stringify(log));
}
