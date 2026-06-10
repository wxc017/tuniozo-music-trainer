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

/** The 10 cultural/geographic STYLE buckets surfaced in the UI.  These replace
 *  the old 5 continents — the continents were both too coarse (509 genres, 80%
 *  of them odd-meter/euclidean abstractions, all flattened into 5 chips) and
 *  unevenly applied.  Every library entry is re-tagged to one of these by
 *  `bucketFor()` at construction (see GROOVE_LIBRARY). */
export type Region =
  | "West African"
  | "Afro-Cuban & Caribbean"
  | "Brazilian & Latin America"
  | "Middle East & Mediterranean"
  | "Indian"
  | "East & SE Asian"
  | "Balkan & Euro Folk"
  | "Jazz & Fusion"
  | "Pop / Rock / Metal"
  | "Funk / Hip-Hop / Electronic";

/** The original 5-continent tag carried by the raw data + generator output.
 *  Kept only as the INPUT to `bucketFor` (some abstract families — aksak,
 *  compound-additive, timelines — route to different buckets by it). */
export type SourceRegion = "African" | "Latin" | "Asian" | "European" | "American";

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
  /** Cultural style bucket (post-remap, one of the 10 `Region`s). */
  region: Region;
  genre: string;
  /** Total slots the pattern is notated over. */
  length: number;
  voices: GrooveVoices;
  desc: string;
}

/** A raw library entry as stored in the data file / emitted by the generator —
 *  identical to `LibraryGroove` but still carrying the 5-continent source tag.
 *  `bucketFor` maps it to a `LibraryGroove` with one of the 10 style buckets. */
export type RawGroove = Omit<LibraryGroove, "region"> & { region: SourceRegion };

/* ═══════════════════════════════════════════════════════════════════════════
   The library
   ═══════════════════════════════════════════════════════════════════════════ */

/** The hand-curated core reference grooves (kept verbatim, well-documented). */
const GROOVE_LIBRARY_CORE: RawGroove[] = [
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

/* ═══════════════════════════════════════════════════════════════════════════
   Style bucketing — map each entry's genre (+ its source continent) to one of
   the 10 cultural buckets.  Ordered rules, FIRST match wins; the four big
   ABSTRACT families (aksak, euclidean, compound-additive, odd-meter kit) are
   routed to their nearest cultural home, splitting by source continent where
   the same family spans regions (Asian aksak → Turkic/Mid-East, European aksak
   → Balkan).  Validated to classify all 518 (genre × continent) pairs with no
   fallthrough; the source-continent fallback is a belt-and-braces backstop.
   ═══════════════════════════════════════════════════════════════════════════ */

const has = (g: string, ...ks: string[]) => ks.some(k => g.includes(k));

export function bucketFor(genre: string, region: SourceRegion): Region {
  const g = genre.toLowerCase();

  // Abstract algorithmic families (route by source continent where they split).
  if (g.includes("euclidean")) return "West African";              // models African bell timelines
  if (g.includes("polyrhythm")) return "West African";
  if (g.includes("aksak")) return region === "European" ? "Balkan & Euro Folk" : "Middle East & Mediterranean";
  if (g.includes("compound additive")) return region === "Asian" ? "East & SE Asian" : "Balkan & Euro Folk";
  if (g.includes("odd-meter kit") || g === "odd meter" || g.includes("(odd meter)")) return "Jazz & Fusion";
  if (g.includes("timeline rotation")) return region === "Latin" ? "Afro-Cuban & Caribbean" : "West African";
  if (g.includes("additive cell") || g.includes("balkan cell")) return "Balkan & Euro Folk";
  if (g.includes("pan-caribbean") || g.includes("cuban/haitian cell")) return "Afro-Cuban & Caribbean";

  // Jazz & Fusion first, so "latin jazz" / "jazz fusion" don't fall to Latin/rock.
  if (has(g, "jazz", "bebop", "bop", "swing", "dixieland", "big band", "ecm", "modal")) return "Jazz & Fusion";
  if (g.includes("fusion")) return "Jazz & Fusion";

  if (has(g, "carnatic", "hindustani", "tala", "solkattu", "nadai", "konnakol", "punjabi", "bhangra", "qawwali")) return "Indian";
  if (g.includes("south asia")) return "Indian";

  if (has(g, "arabic", "iqa", "egypt", "ottoman", "andalus", "levantine", "sufi", "mugham", "muqam",
            "turkish", "usul", "persian", "tonbak", "azerbaijani", "uyghur", "central asian", "doira",
            "flamenco", "spanish", "iberian", "moroccan", "gnawa", "tunisian", "malouf", "algerian", "rai", "raï", "chaabi")) return "Middle East & Mediterranean";

  if (has(g, "gamelan", "javanese", "balinese", "sundanese", "gong", "kulintang", "kotekan", "malay", "minangkabau",
            "thai", "piphat", "lao", "cambod", "pinpeat", "burmese", "vietnam", "japanese", "taiko", "gagaku",
            "togaku", "bon odori", "min'yo", "matsuri", "okinawan", "eisa", "kachashi", "korean", "jangdan",
            "samul", "pungmul", "pansori", "sanjo", "nongak", "chinese", "jingju", "luogu", "jiangnan", "sizhu",
            "chaozhou", "cantonese", "yangge", "qupai", "peking", "lion dance", "mongolian", "tuvan")) return "East & SE Asian";

  if (has(g, "afro-cuban", "cuban", "clave", "rumba", "guaguanc", "songo", "cascara", "cáscara", "mambo",
            "timba", "salsa", "danzon", "danzón", "contradanza", "pello",
            "haitian", "vodou", "rara", "méring", "konpa", "kompa", "rabòday",
            "dominican", "merengue", "bachata", "palos", "gagá", "salve", "pri-prí", "sarandunga",
            "puerto ric", "bomba", "plena", "jíbaro", "seis", "danza",
            "jamaic", "reggae", "ska", "rocksteady", "dub", "dancehall", "ragga", "nyabinghi", "mento",
            "reggaeton", "dembow", "trinidad", "soca", "calypso", "calipso", "chutney", "parang", "steelband",
            "bahamian", "junkanoo", "rake-and-scrape", "martinican", "bélé", "biguine", "garifuna", "antillean",
            "gwoka", "guadeloup", "haiti")) return "Afro-Cuban & Caribbean";

  if (has(g, "brazil", "samba", "bossa", "baião", "baiao", "candombl", "bateria", "recife", "bahia",
            "afro-peru", "peruvian", "andean", "huayn", "huayñ", "yaraví", "yaravi", "tondero", "zamacueca",
            "vals criollo", "vals", "marinera", "milonga", "tango", "argentin", "chacarera", "zamba", "gato",
            "escondido", "malambo", "vidala", "carnavalito", "caporales", "saya", "tinku", "morenada",
            "diablada", "tobas", "sanjuanito", "albazo", "bolivia", "candombe",
            "colombi", "cumbia", "porro", "gaita", "mapale", "champeta", "chande", "fandango", "bambuco", "pasillo",
            "vallenato", "venezuel", "joropo", "golpe", "llanero", "tambor", "calipso",
            "mexic", "norteñ", "norteno", "mariachi", "huasteco", "jalisciense", "jarocho", "chilena", "banda",
            "panama", "tamborito", "mejorana", "guatemala", "son chapin", "marimba", "nicaragua", "palo de mayo",
            "costa rica", "paraguay", "guarania", "polka paraguaya", "cueca", "tonada")) return "Brazilian & Latin America";

  if (has(g, "african", "djembe", "dunun", "malinke", "maninka", "susu", "ewe", "ghana", "akan", "asante",
            "dagaaba", "mossi", "baga", "nalu", "komanko", "kassonke", "soninke", "temne", "mandingo", "manian",
            "wassoulou", "landuma", "afrobeat", "highlife", "hiplife", "palm-wine", "soukous", "ndombolo",
            "congolese", "juju", "jùjú", "fuji", "apala", "makossa", "bikutsi", "cameroon", "nigeria",
            "senegal", "mbalax", "sabar", "mali", "bambara", "zimbabwe", "mbira", "chimurenga", "jit", "sungura",
            "mbaqanga", "marabi", "kwela", "kwaito", "amapiano", "tsonga", "shangaan", "kenyan", "benga",
            "swahili", "taarab", "chakacha", "tanzanian", "bongo flava", "angolan", "semba", "kizomba",
            "cape verde", "funana", "coladeira", "morna", "batuque", "sudanese", "ethiopian", "ivorian", "ga (", "ga/")) return "West African";

  if (has(g, "balkan", "bulgar", "macedon", "serbian", "romanian", "romani", "greek", "klezmer", "hungar",
            "nordic", "scandinav", "polish", "celtic", "irish", "scottish", "english", "sliabh", "french",
            "breton", "italian", "salentino", "tarantella", "central european", "european", "rachenitsa",
            "kopanitsa", "marching", "march", "waltz", "polka", "portuguese", "viennese", "military")) return "Balkan & Euro Folk";

  // Oceania / Pacific → fold into East & SE Asian (nearest geographic home).
  if (has(g, "tahitian", "cook island", "samoan", "tongan", "maori", "hawaiian", "papua", "'are'are",
            "solomon", "fijian", "aboriginal", "polynesia", "pacific", "oceania")) return "East & SE Asian";

  if (has(g, "funk", "soul", "motown", "gospel", "second line", "new orleans", "nola",
            "hip-hop", "hip hop", "boom-bap", "lo-fi", "trap", "drill",
            "house", "techno", "trance", "club", "electro", "edm", "dubstep", "drum and bass", "drum & bass",
            "dnb", "jungle", "idm", "breakbeat", "uk garage", "footwork", "gabber", "hardstyle",
            "ebm", "grime", "future garage", "ballroom", "moombahton", "disco", "bass")) return "Funk / Hip-Hop / Electronic";

  if (has(g, "rock", "punk", "pop", "surf", "indie", "garage", "krautrock", "arena", "stadium", "metal",
            "thrash", "death", "black", "doom", "power", "speed", "grindcore", "metalcore", "djent", "prog",
            "technical", "math", "country", "bluegrass", "rockabilly", "cajun", "creole", "ostinato",
            "blues", "hardcore")) return "Pop / Rock / Metal";

  // Backstop (no genre matched any rule): map by source continent.
  const fallback: Record<SourceRegion, Region> = {
    African: "West African", Latin: "Brazilian & Latin America", Asian: "East & SE Asian",
    European: "Balkan & Euro Folk", American: "Pop / Rock / Metal",
  };
  return fallback[region];
}

/**
 * The full library: the curated core plus the large auto-generated cross-genre
 * table (`grooveLibraryData.ts`, ~14k entries across ~500 genres).  Each raw
 * entry is re-tagged from its 5-continent source region to one of the 10
 * cultural style buckets via `bucketFor`.
 */
export const GROOVE_LIBRARY: LibraryGroove[] =
  [...GROOVE_LIBRARY_CORE, ...GROOVE_LIBRARY_EXTRA].map(g => ({ ...g, region: bucketFor(g.genre, g.region) }));

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
 * Similarity ∈ [0,1] of an assembled cycle to a library groove.  Compares EVERY
 * voice the entry defines (bass, snare, hi-hat, ghost, foot, open-hat) under a
 * single consistent rotation — so a plain backbeat no longer scores 100% on a
 * brush-swing entry just because their snares align; the hat/ghost/foot must
 * line up too.  Lengths must match; different lengths return 0.
 */
export function grooveSimilarity(a: AssembledCycle, g: LibraryGroove): number {
  if (a.totalSlots !== g.length) return 0;
  const length = g.length;

  // Each defined voice contributes, weighted by how structurally defining it is.
  const comps: { cand: number[]; lib: number[]; w: number }[] = [];
  const add = (cand: number[], lib: number[] | undefined, w: number) => {
    if (lib && lib.length > 0) comps.push({ cand, lib, w });
  };
  add(a.bassHits, g.voices.bass, 1.0);
  add(a.snareHits, g.voices.snareAccent, 1.0);
  add(a.hatHits, g.voices.hatClosed, 0.8);
  add(a.ghostHits, g.voices.snareGhost, 0.5);
  add(a.hhFootHits, g.voices.hhFoot, 0.5);
  add(a.hatOpenHits, g.voices.hatOpen, 0.4);
  if (comps.length === 0) return 0;

  let best = 0;
  for (let r = 0; r < length; r++) {
    let num = 0, den = 0;
    for (const c of comps) { num += c.w * onsetF1(rotate(c.cand, r, length), c.lib); den += c.w; }
    const combined = num / den;
    if (combined > best) best = combined;
  }
  return best;
}

export interface LibraryMatch {
  groove: LibraryGroove;
  similarity: number;
}

/** Library indexed by cycle length — matching only ever needs same-length
 *  entries (similarity is 0 across lengths), so this avoids scanning all ~14k
 *  entries on every call.  Built lazily, once. */
let _byLength: Map<number, LibraryGroove[]> | null = null;
function libraryByLength(): Map<number, LibraryGroove[]> {
  if (!_byLength) {
    _byLength = new Map();
    for (const g of GROOVE_LIBRARY) {
      const arr = _byLength.get(g.length);
      if (arr) arr.push(g); else _byLength.set(g.length, [g]);
    }
  }
  return _byLength;
}

/** The nearest library groove to an assembled cycle (or null if none align). */
export function nearestLibraryGroove(a: AssembledCycle): LibraryMatch | null {
  const pool = libraryByLength().get(a.totalSlots);
  if (!pool) return null;
  let best: LibraryMatch | null = null;
  for (const g of pool) {
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

/** The 10 cultural style buckets, in UI display order. */
export const REGIONS: Region[] = [
  "West African", "Afro-Cuban & Caribbean", "Brazilian & Latin America",
  "Middle East & Mediterranean", "Indian", "East & SE Asian",
  "Balkan & Euro Folk", "Jazz & Fusion", "Pop / Rock / Metal",
  "Funk / Hip-Hop / Electronic",
];

/** Library grouped by style bucket, for the UI's reference browser. */
export function libraryByRegion(): Record<Region, LibraryGroove[]> {
  const out = Object.fromEntries(REGIONS.map(r => [r, [] as LibraryGroove[]])) as Record<Region, LibraryGroove[]>;
  for (const g of GROOVE_LIBRARY) out[g.region].push(g);
  return out;
}

/** Distinct genres available for a region (optionally only at a given cycle
 *  length), sorted — used to populate the tradition/style picker. */
export function genresForRegion(region: Region | "Any", length?: number): string[] {
  const set = new Set<string>();
  for (const g of GROOVE_LIBRARY) {
    if (region !== "Any" && g.region !== region) continue;
    if (length !== undefined && g.length !== length) continue;
    set.add(g.genre);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
