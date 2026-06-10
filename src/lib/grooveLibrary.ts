/**
 * grooveLibrary.ts — Cross-genre groove knowledge base.
 *
 * The groove analogue of `musicalScoring.ts`'s `CANONICAL_CELLS`: a curated,
 * genre-tagged table of canonical grooves / timelines / bell patterns from a
 * wide range of world traditions.  The musical engine uses it two ways:
 *  1. `nearestLibraryGroove()` — find the closest cultural reference for an
 *     assembled cycle, so the UI can say *why* a generated groove is musical.
 *  2. `grooveLibraryBonus()` — a score bonus proportional to how well a
 *     candidate aligns with its nearest library groove (rotation-aware), which
 *     `grooveScoring.ts` adds on top of the general rhythmic features.
 *
 * Positions are slot indices at the entry's own `length` (a 16-slot entry is
 * notated as straight 16ths over one 4/4 bar; a 12-slot entry as a 12/8 bar,
 * etc.).  Only the *defining* voices need be filled — a clave entry may carry
 * just its key-pattern onsets in `snareAccent`/`bass`.
 */

import type { AssembledCycle } from "@/lib/grooveCycle";
import { GROOVE_LIBRARY_EXTRA } from "@/lib/grooveLibraryData";

export type Region = "African" | "Latin" | "Asian" | "European" | "American";

export interface GrooveVoices {
  bass?: number[];
  snareAccent?: number[];
  snareGhost?: number[];
  hatClosed?: number[];
  hatOpen?: number[];
  hhFoot?: number[];
}

export interface LibraryGroove {
  id: string;
  name: string;
  region: Region;
  genre: string;
  /** Total slots the pattern is notated over. */
  length: number;
  voices: GrooveVoices;
  desc: string;
}

/* ═══════════════════════════════════════════════════════════════════════════
   The library
   ═══════════════════════════════════════════════════════════════════════════ */

/** The hand-curated core reference grooves (kept verbatim, well-documented). */
const GROOVE_LIBRARY_CORE: LibraryGroove[] = [
  /* ── African ─────────────────────────────────────────────────────────── */
  {
    id: "bell-standard-128", name: "Standard Bell (7-stroke)", region: "African",
    genre: "West African 12/8", length: 12,
    voices: { snareAccent: [0, 2, 4, 5, 7, 9, 11] },
    desc: "The near-universal sub-Saharan 12/8 bell timeline (gankogui/atoke). " +
      "Seven strokes across twelve pulses (×.×.××.×.×.× rotated) underpinning " +
      "Ewe, Yoruba and much of the diaspora — the rhythmic key the whole ensemble locks to.",
  },
  {
    id: "kpanlogo-16", name: "Kpanlogo Bell", region: "African",
    genre: "Ga (Ghana)", length: 16,
    voices: { snareAccent: [0, 3, 6, 8, 10, 14] },
    desc: "Ghanaian Ga recreational-drumming bell pattern over 16 pulses. A bright, " +
      "danceable 4/4 timeline cousin of the son clave family.",
  },
  {
    id: "highlife-16", name: "Highlife / Afrobeat", region: "African",
    genre: "Ghana / Nigeria", length: 16,
    voices: { bass: [0, 6, 10], snareAccent: [4, 12], hatClosed: [0,2,4,6,8,10,12,14] },
    desc: "Backbeat-meets-clave feel of highlife and Fela-style Afrobeat: a syncopated " +
      "kick riding a clave skeleton with a steady hat and snare on 2 and 4.",
  },

  /* ── Latin / Afro-Cuban / Brazilian ──────────────────────────────────── */
  {
    id: "son-clave-32", name: "Son Clave (3-2)", region: "Latin",
    genre: "Afro-Cuban", length: 16,
    voices: { snareAccent: [0, 3, 6, 10, 12] },
    desc: "The 3-2 son clave — five strokes that organize Cuban son, salsa and much " +
      "Latin music. The 'three side' (0,3,6) answered by the 'two side' (10,12).",
  },
  {
    id: "son-clave-23", name: "Son Clave (2-3)", region: "Latin",
    genre: "Afro-Cuban", length: 16,
    voices: { snareAccent: [2, 4, 8, 11, 14] },
    desc: "The 2-3 son clave — the same key rotated so the 'two side' leads. Direction " +
      "(2-3 vs 3-2) sets the whole arrangement's rhythmic gravity.",
  },
  {
    id: "rumba-clave-23", name: "Rumba Clave (2-3)", region: "Latin",
    genre: "Afro-Cuban rumba", length: 16,
    voices: { snareAccent: [2, 4, 8, 11, 15] },
    desc: "Rumba clave shifts the third stroke later than son, giving a darker, more " +
      "off-balance pull. The backbone of guaguancó and Afro-Cuban folkloric music.",
  },
  {
    id: "cascara-16", name: "Cáscara", region: "Latin",
    genre: "Afro-Cuban timbales", length: 16,
    voices: { snareAccent: [0, 2, 4, 7, 8, 10, 12, 15] },
    desc: "The shell pattern played on timbale sides during the soft sections of a " +
      "mambo — a busy clave-aligned timeline that leaves room for the conga tumbao.",
  },
  {
    id: "bossa-16", name: "Bossa Nova", region: "Latin",
    genre: "Brazilian", length: 16,
    voices: { bass: [0, 6, 8, 14], snareAccent: [0, 3, 6, 10, 12], hatClosed: [0,2,4,6,8,10,12,14] },
    desc: "João Gilberto's bossa: a soft surdo-style kick on the bossa clave with a " +
      "steady brushed hat. Gentle, syncopated, unmistakably Brazilian.",
  },
  {
    id: "samba-16", name: "Samba (surdo+caixa)", region: "Latin",
    genre: "Brazilian", length: 16,
    voices: { bass: [2, 6, 10, 14], snareAccent: [0, 4, 8, 12], snareGhost: [1,3,5,7,9,11,13,15], hatClosed: [0,4,8,12] },
    desc: "Samba's engine: the surdo answering on the 'and' while the caixa rolls " +
      "sixteenths underneath. Forward-leaning Carnaval drive.",
  },
  {
    id: "songo-16", name: "Songo", region: "Latin",
    genre: "Cuban (Los Van Van)", length: 16,
    voices: { bass: [3, 6, 11, 14], snareAccent: [4, 12], snareGhost: [2, 6, 10], hatClosed: [0,2,4,6,8,10,12,14] },
    desc: "A modern Cuban drum-set groove fusing clave, rumba and funk — backbeat on " +
      "2 and 4 with a clave-driven kick and conga-like ghosts.",
  },

  /* ── Asian ───────────────────────────────────────────────────────────── */
  {
    id: "teental-16", name: "Teental (accent skeleton)", region: "Asian",
    genre: "Hindustani (North India)", length: 16,
    voices: { snareAccent: [0, 4, 12], snareGhost: [8] },
    desc: "The 16-beat teental tala reduced to its tali/khali accent map: strong claps " +
      "at 0, 4, 12 and the empty 'khali' wave at 8. The foundational classical cycle.",
  },
  {
    id: "jhaptal-10", name: "Jhaptal", region: "Asian",
    genre: "Hindustani", length: 10,
    voices: { snareAccent: [0, 2, 5, 7], snareGhost: [] },
    desc: "A 10-beat tala grouped 2+3+2+3 — the wave-like asymmetric pulse of khyal and " +
      "instrumental classical music.",
  },
  {
    id: "rupak-7", name: "Rupak Tal", region: "Asian",
    genre: "Hindustani", length: 7,
    voices: { snareAccent: [0, 3, 5] },
    desc: "A 7-beat tala grouped 3+2+2 that — unusually — opens on the empty khali, " +
      "giving it a lifting, upbeat character shared with the Balkan rachenitsa.",
  },
  {
    id: "gamelan-16", name: "Gamelan Colotomic", region: "Asian",
    genre: "Javanese gamelan", length: 16,
    voices: { bass: [15], snareAccent: [7], hatClosed: [3, 11] },
    desc: "The colotomic structure of Javanese gamelan: the great gong marks the cycle's " +
      "end, the kenong its halves, the kethuk its subdivisions — time nested in time.",
  },

  /* ── European ────────────────────────────────────────────────────────── */
  {
    id: "rachenitsa-7", name: "Rachenitsa", region: "European",
    genre: "Bulgarian", length: 7,
    voices: { bass: [0, 2], snareAccent: [4], hatClosed: [0,2,4] },
    desc: "Bulgarian 7/8 dance grouped 2+2+3 — the long final cell is the 'limp' that " +
      "defines an entire family of Balkan dances.",
  },
  {
    id: "kopanitsa-11", name: "Kopanitsa", region: "European",
    genre: "Bulgarian", length: 11,
    voices: { bass: [0, 2, 7], snareAccent: [4, 9], hatClosed: [0,2,4,7,9] },
    desc: "Bulgarian 11/8 (2+2+3+2+2) wedding-band dance — the single 3-cell in the " +
      "middle is the limp around which the groove turns.",
  },
  {
    id: "waltz-12", name: "Waltz", region: "European",
    genre: "Viennese / folk", length: 12,
    voices: { bass: [0], snareAccent: [4, 8], hatClosed: [0, 4, 8] },
    desc: "The 3/4 'oom-pah-pah': a grounded downbeat answered by two lighter " +
      "afterbeats. The template for a vast European dance repertoire.",
  },
  {
    id: "march-16", name: "March", region: "European",
    genre: "Military / concert", length: 16,
    voices: { bass: [0, 8], snareAccent: [0, 4, 8, 12], snareGhost: [2,6,10,14] },
    desc: "A duple march: kick on the strong beats, snare driving every beat with " +
      "rudimental ghosts between. Steady, square, propulsive.",
  },

  /* ── American ────────────────────────────────────────────────────────── */
  {
    id: "rock-backbeat-16", name: "Rock Backbeat", region: "American",
    genre: "Rock / pop", length: 16,
    voices: { bass: [0, 8], snareAccent: [4, 12], hatClosed: [0,2,4,6,8,10,12,14] },
    desc: "The defining Anglo-American groove: kick on 1 and 3, snare backbeat on 2 and " +
      "4, eighth-note hats. The 'four-on-the-floor of rock'.",
  },
  {
    id: "funk-16", name: "Funk (syncopated kick)", region: "American",
    genre: "Funk", length: 16,
    voices: { bass: [0, 3, 10], snareAccent: [4, 12], snareGhost: [2, 6, 7, 9, 14], hatClosed: [0,2,4,6,8,10,12,14] },
    desc: "James Brown / New Orleans funk: a syncopated kick conversing with a hard 2-and-4 " +
      "backbeat and a carpet of snare ghost notes that make it breathe.",
  },
  {
    id: "halftime-16", name: "Half-Time", region: "American",
    genre: "Hip-hop / rock", length: 16,
    voices: { bass: [0, 10], snareAccent: [8], snareGhost: [4, 12], hatClosed: [0,2,4,6,8,10,12,14] },
    desc: "The backbeat pushed to beat 3 only, halving the perceived tempo — the heavy, " +
      "spacious feel of hip-hop and modern rock breakdowns.",
  },
  {
    id: "shuffle-12", name: "Shuffle", region: "American",
    genre: "Blues / swing", length: 12,
    voices: { bass: [0, 6], snareAccent: [3, 9], snareGhost: [], hatClosed: [0,2,3,5,6,8,9,11] },
    desc: "The triplet-based blues shuffle: a swung skip pulse on the cymbal with the " +
      "backbeat on 2 and 4. The groove of countless blues and rock-and-roll records.",
  },
  {
    id: "secondline-16", name: "Second Line", region: "American",
    genre: "New Orleans", length: 16,
    voices: { bass: [0, 3, 6, 8, 11], snareAccent: [4, 12], snareGhost: [2, 6, 10, 14], hatClosed: [] },
    desc: "The New Orleans street-parade groove: a rolling, syncopated bass-drum " +
      "conversation with a parade-snare backbeat. Loose, buoyant, swung.",
  },
  {
    id: "jazz-ride-12", name: "Jazz Ride (swing)", region: "American",
    genre: "Jazz", length: 12,
    voices: { hatClosed: [0, 3, 5, 6, 9, 11], hhFoot: [3, 9], snareGhost: [], bass: [] },
    desc: "The swing ride-cymbal pattern (ding · ding-da) with the hi-hat foot 'chick' on " +
      "2 and 4. The pulse of bebop and mainstream jazz.",
  },
];

/**
 * The full library: the curated core plus the large auto-generated cross-genre
 * table (`grooveLibraryData.ts`, ~1300+ entries across ~60 world traditions).
 */
export const GROOVE_LIBRARY: LibraryGroove[] = [...GROOVE_LIBRARY_CORE, ...GROOVE_LIBRARY_EXTRA];

/* ═══════════════════════════════════════════════════════════════════════════
   Matching: align an assembled cycle to its nearest library groove
   ═══════════════════════════════════════════════════════════════════════════ */

/** F1 overlap between two onset sets (precision/recall harmonic mean). */
function onsetF1(a: number[], b: number[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let hit = 0;
  for (const x of a) if (setB.has(x)) hit++;
  const precision = hit / a.length;
  const recall = hit / b.length;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

/** Rotate an onset set by `r` within `length`. */
function rotate(onsets: number[], r: number, length: number): number[] {
  return onsets.map(x => (x + r) % length);
}

/**
 * Similarity ∈ [0,1] of an assembled cycle to a library groove.  Only the
 * defining voices (bass, snareAccent) are compared, rotation-aware (claves and
 * bells are identities up to rotation).  Lengths must match for a real score;
 * different lengths return 0.
 */
export function grooveSimilarity(a: AssembledCycle, g: LibraryGroove): number {
  if (a.totalSlots !== g.length) return 0;
  const length = g.length;
  // The two structurally-defining voices for most grooves.
  const candBass = a.bassHits;
  const candSnare = a.snareHits;
  const libBass = g.voices.bass ?? [];
  const libSnare = g.voices.snareAccent ?? [];

  // Weight toward whichever voice the library entry actually defines.
  const bassW = libBass.length > 0 ? 1 : 0;
  const snareW = libSnare.length > 0 ? 1 : 0;
  const wSum = bassW + snareW;
  if (wSum === 0) return 0;

  let best = 0;
  for (let r = 0; r < length; r++) {
    const bScore = bassW ? onsetF1(rotate(candBass, r, length), libBass) : 0;
    const sScore = snareW ? onsetF1(rotate(candSnare, r, length), libSnare) : 0;
    const combined = (bScore * bassW + sScore * snareW) / wSum;
    if (combined > best) best = combined;
  }
  return best;
}

export interface LibraryMatch {
  groove: LibraryGroove;
  similarity: number;
}

/** The nearest library groove to an assembled cycle (or null if none align). */
export function nearestLibraryGroove(a: AssembledCycle): LibraryMatch | null {
  let best: LibraryMatch | null = null;
  for (const g of GROOVE_LIBRARY) {
    const sim = grooveSimilarity(a, g);
    if (sim > 0 && (!best || sim > best.similarity)) best = { groove: g, similarity: sim };
  }
  return best;
}

/** Score bonus for resembling a library groove — mirrors `canonicalCellBonus`.
 *  Scaled so a strong (≥0.85) match dominates generic feature scores, while a
 *  weak resemblance contributes only a little. */
export function grooveLibraryBonus(a: AssembledCycle): number {
  const match = nearestLibraryGroove(a);
  if (!match) return 0;
  // Cubic emphasis: rewards genuine alignment, ignores coincidental overlap.
  return Math.round(600 * Math.pow(match.similarity, 3));
}

/** Library grouped by region, for the UI's reference browser. */
export function libraryByRegion(): Record<Region, LibraryGroove[]> {
  const out = { African: [], Latin: [], Asian: [], European: [], American: [] } as Record<Region, LibraryGroove[]>;
  for (const g of GROOVE_LIBRARY) out[g.region].push(g);
  return out;
}
