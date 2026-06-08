// ── Split Mixes ───────────────────────────────────────────────────
// Auto-ranked "mix-and-match" sticking fills for a grouping.  Instead
// of applying one device uniformly to every cell, this orchestrates
// EACH cell independently — a different device per cell — and ranks the
// combinations.  That combinatorial space is where the actually-
// interesting fills live (e.g. 3+3+2 → KRL+RLK+RR).
//
// Why a dedicated scorer instead of reusing musicalScoring's
// scoreStickingFill: for a FIXED grouping, that scorer's discriminating
// features (group count, size variety, uniformity) are constant, so it
// just rewards "fewest kicks + most repetition" and collapses every
// ranking back to plain singles.  Here we score what actually varies
// between mixes: seam playability, kick placement, and device variety.

export interface CellChoice {
  pattern: string;
  device: string;
}

export interface Mix {
  /** Per-cell sticking strings aligned to the grouping (accent = first note). */
  cells: string[];
  /** Device name per cell, parallel to `cells` (e.g. ["foot-led","singles","doubles"]). */
  devices: string[];
  score: number;
}

const HANDS = ["R", "L"] as const;

function singles(n: number, start = 0): string {
  let s = "";
  for (let i = 0; i < n; i++) s += HANDS[(start + i) % 2];
  return s;
}

function doubles(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += HANDS[Math.floor(i / 2) % 2];
  return s;
}

const PARA = ["R", "L", "R", "R", "L", "R", "L", "L"];
function paraSlice(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += PARA[i % PARA.length];
  return s;
}

/** Idiomatic per-cell sticking options for a cell of size `n` (any n ≥ 1). */
function cellCandidates(n: number): CellChoice[] {
  // Cell heads (accents) only ever start on R or K — never lead with the
  // weak (left) hand, per direct user direction.  So no L-lead candidate.
  const raw: CellChoice[] = [
    { pattern: singles(n, 0),                                              device: "singles" },
    { pattern: doubles(n),                                                 device: "doubles" },
    { pattern: paraSlice(n),                                               device: "paradiddle" },
    { pattern: n === 1 ? "K" : "K" + singles(n - 1, 0),                    device: "foot-led" },
    { pattern: n === 1 ? "K" : singles(n - 1, 0) + "K",                    device: "foot-tail" },
    { pattern: n === 1 ? "K" : n === 2 ? "KK" : "K" + singles(n - 2, 0) + "K", device: "sandwich" },
  ];
  // Dedupe by pattern (small cells collapse, e.g. doubles(2)===singles(2)).
  const seen = new Set<string>();
  const out: CellChoice[] = [];
  for (const c of raw) {
    if (seen.has(c.pattern)) continue;
    seen.add(c.pattern);
    out.push(c);
  }
  return out;
}

export interface SpaciousFill {
  /** Per-cell strings; "." = a rest (left open). Accent = first hit of the cell. */
  cells: string[];
  name: string;
  desc: string;
}

interface SpOpts { voice: "hands" | "kick" | "handKick"; leadIn: boolean; halfTime: boolean; }

/** Build one spacious candidate from a strategy: which voice marks the
 *  accents, whether the last cell gets a stroke-fill lead-in, and
 *  whether to thin out to every-other cell (half-time). */
function buildSpacious(grouping: number[], o: SpOpts): { cells: string[]; devices: string[]; name: string; desc: string } {
  const n = grouping.length;
  const dots = (k: number) => ".".repeat(Math.max(0, k));
  // Lead-in flourish on the last cell: starts R, never ends on R (ends on
  // L for even cells, on a kick for odd) so the right hand is free for "1".
  const flourish = (g: number) =>
    g === 1 ? "K" : g % 2 === 0 ? singles(g, 0) : singles(g - 1, 0) + "K";
  const cells = grouping.map((g, i) => {
    const isLast = i === n - 1;
    if (o.halfTime && i % 2 !== 0 && !isLast) return dots(g);   // thinned-out cell
    if (o.leadIn && isLast) return flourish(g);                 // stroke-fill into beat 1
    // Accents always lead with the strong (right) hand — never L.
    const limb = o.voice === "kick" ? "K" : "R";
    if (g === 1) return limb;
    if (o.voice === "handKick") return limb + dots(g - 2) + "K";
    return limb + dots(g - 1);
  });
  const devices = cells.map(c => {
    const hasH = /[RL]/.test(c), hasK = /K/.test(c);
    return !hasH && !hasK ? "rest" : hasH && hasK ? "hand+foot" : hasH ? "hand" : "foot";
  });
  const base =
    o.voice === "kick" ? "kick per cell" :
    o.voice === "handKick" ? "hand + kick tail" : "one per cell";
  const name = [base, o.halfTime ? "half-time" : null, o.leadIn ? "lead-in" : null]
    .filter(Boolean).join(" · ");
  const baseDesc =
    o.voice === "kick" ? "Foot marks each accent, hands silent — heavy half-time pulse." :
    o.voice === "handKick" ? "Hand on the accent, kick answers at the cell tail — call-and-response." :
    "Single strokes on the accents (right-hand lead) — open and ballad-friendly.";
  const desc = baseDesc
    + (o.halfTime ? " Hits only every other cell for maximum space." : "")
    + (o.leadIn ? " A quick stroke-fill on the last cell sets up beat 1." : "");
  return { cells, devices, name, desc };
}

/** Reward space + accent coverage; punish clutter between accents and
 *  anything too busy to read as "slow". */
function scoreSpacious(cells: string[]): number {
  const full = cells.join("");
  const total = full.length;
  const hits = (full.match(/[RLK]/g) || []).length;
  if (hits === 0) return -1000;
  let score = (total - hits) / total * 30;     // space is the whole point

  let headHits = 0, midHits = 0, tailKicks = 0;
  cells.forEach((c, idx) => {
    if (c[0] && c[0] !== ".") headHits++;                       // landed on the accent
    if (idx < cells.length - 1)
      for (let i = 1; i < c.length - 1; i++) if (c[i] !== ".") midHits++;
    if (c.length > 1 && c[c.length - 1] === "K") tailKicks++;
  });
  score += headHits * 12;
  score -= midHits * 8;        // stray notes between accents clutter the space
  score += tailKicks * 6;
  if (/[RL]/.test(full) && /K/.test(full)) score += 8;          // hand/foot contrast

  const cellHits = cells.map(c => (c.match(/[RLK]/g) || []).length);
  const last = cellHits[cellHits.length - 1];
  const restAvg = cellHits.length > 1
    ? cellHits.slice(0, -1).reduce((a, b) => a + b, 0) / (cellHits.length - 1)
    : last;
  if (last > restAvg + 0.5) score += 10;                        // lead-in flourish

  const density = hits / total;
  if (density > 0.55) score -= (density - 0.55) * 120;          // too busy = not slow
  return score;
}

/**
 * Ranked "slow" fills built from space rather than density — for ballad
 * and half-time feels.  Hits land on the cell accents; "." is a rest
 * (e.g. 3+3 → "R.." + "L..").  Strategies are scored for space + accent
 * coverage, then an MMR pass spreads the top-N across distinct ideas.
 */
export function spaciousFills(grouping: number[], topN = 6): SpaciousFill[] {
  if (grouping.length === 0) return [];
  const opts: SpOpts[] = [];
  for (const voice of ["hands", "kick", "handKick"] as const)
    for (const leadIn of [false, true])
      for (const halfTime of [false, true])
        opts.push({ voice, leadIn, halfTime });

  const seen = new Set<string>();
  const pool: (Scored & { name: string; desc: string })[] = [];
  for (const o of opts) {
    const b = buildSpacious(grouping, o);
    const key = b.cells.join("+");
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push({ ...b, score: scoreSpacious(b.cells) });
  }
  return mmrSelect(pool, topN, 0.55)
    .map(p => ({ cells: p.cells, name: p.name, desc: p.desc }));
}

/** Collapse a device name to a one-char family for variety/similarity. */
const FAMILY: Record<string, string> = {
  "singles": "s", "singles (L)": "s", "doubles": "d", "paradiddle": "p",
  "foot-led": "F", "foot-tail": "T", "sandwich": "S",
  // spacious-fill families
  "hand": "h", "foot": "k", "hand+foot": "x", "rest": ".",
};
const fam = (d: string) => FAMILY[d] ?? "?";
const isFoot = (d: string) => fam(d) === "F" || fam(d) === "T" || fam(d) === "S";

/**
 * Score a (possibly partial) mix. Higher = more interesting-but-playable.
 * Rewards device variety + idiomatic kick placement; punishes seam runs
 * (3+ of the same limb in a row) and uniform / kick-less mixes.
 */
function scoreMix(cells: string[], devices: string[]): number {
  const full = cells.join("");
  const cellCount = cells.length;
  let score = 0;

  // ── Seam playability: 3+ same symbol in a row is barely playable; a
  //    double-kick across a seam is heavy. (Within-cell never triggers
  //    this; the penalty exists to catch cell boundaries.) ───────────
  let run = 1;
  for (let i = 1; i < full.length; i++) {
    if (full[i] === full[i - 1]) run++; else run = 1;
    if (run >= 3) score -= 80;
    else if (run === 2 && full[i] === "K") score -= 40;
  }

  // ── Kicks: a fill wants feet, but not wall-to-wall. ───────────────
  const k = (full.match(/K/g) || []).length;
  const kickBudget = Math.ceil(cellCount / 2);
  if (k === 0) score -= 12;
  else {
    score += 15;
    if (k <= kickBudget) score += 15;
    else score -= 10 * (k - kickBudget);
  }
  // Kick position: on a cell head or tail is punchy; mid-cell is muddy.
  for (const c of cells) {
    for (let i = 0; i < c.length; i++) {
      if (c[i] !== "K") continue;
      score += (i === 0 || i === c.length - 1) ? 8 : -6;
    }
  }

  // ── Variety: the whole point of mixing. Uniform = boring (we already
  //    have those in splitVoicings); 2–3 distinct device FAMILIES = the
  //    sweet spot; more is allowed but less coherent. ────────────────
  const families = new Set(devices.map(fam));
  const fc = families.size;
  if (fc === 1) score -= 45;
  else if (fc === 2) score += 34;
  else if (fc === 3) score += 40;
  else score += 30;

  // ── Hand/foot contrast: a fill that plays a pure-hand cell against a
  //    foot-orchestrated cell has more shape than all-feet or all-hands.
  const hasFoot = devices.some(isFoot);
  const hasHand = devices.some(d => !isFoot(d));
  if (hasFoot && hasHand) score += 10;

  // ── Symmetry / framing: same device on the first and last cell gives
  //    a call-and-answer shape (ABA, ABBA…). Mild. ──────────────────
  if (cellCount >= 2 && fam(devices[0]) === fam(devices[cellCount - 1])) score += 6;

  // ── Accent lead: a strong limb (R/K) on the cell head reads cleaner
  //    than starting the accent on the weak hand. Mild. ──────────────
  for (const c of cells) score += c[0] === "L" ? 2 : 5;

  // ── Phrasing / contour: a fill wants an anchor and a resolution, not
  //    just legal notes.  Reward a kick on the downbeat (anchors the
  //    phrase), a kick launching the LAST cell (drives into beat 1), and
  //    a kick in both the first and last cell (frames the phrase).
  //    Validated against KRL+RLR+RLRRL+KRLRL on 3+3+5+5 — a foot-framed
  //    fill with a varied hand build that "sounds nice". ──────────────
  if (cells[0][0] === "K") score += 8;                       // downbeat anchor
  if (cells[cellCount - 1][0] === "K") score += 12;          // resolution launch into beat 1
  if (cellCount >= 2 && cells[0].includes("K") && cells[cellCount - 1].includes("K")) score += 8; // foot bookends

  // Never end the fill on R — leave the strong hand free to hit the next
  // downbeat. The last note of the final cell should be L or K.
  const lastCell = cells[cellCount - 1];
  if (lastCell[lastCell.length - 1] === "R") score -= 60;

  return score;
}

/** Similarity ∈ [0,1] between two mixes of the same grouping: how much
 *  their device families line up, plus a nudge for an identical opening
 *  cell. Used by the diversity pass so the top-N aren't near-duplicates. */
function similarity(a: Scored, b: Scored): number {
  const n = Math.min(a.devices.length, b.devices.length) || 1;
  let same = 0;
  for (let i = 0; i < n; i++) if (fam(a.devices[i]) === fam(b.devices[i])) same++;
  let sim = same / n;
  if (a.cells[0] === b.cells[0]) sim += 0.34;
  return Math.min(1, sim);
}

/** Anything carrying per-cell strings + device labels + a score. */
interface Scored { cells: string[]; devices: string[]; score: number; }

/**
 * Diversity pass (Maximal Marginal Relevance): greedily pick the
 * highest-scoring item that is least similar to what's already chosen,
 * so the top-N showcase distinct ideas instead of N variations of one.
 * `lambda` trades off score (0) vs. spread (higher).
 */
function mmrSelect<T extends Scored>(pool: T[], topN: number, lambda: number): T[] {
  const rem = [...pool].sort((a, b) =>
    b.score - a.score || a.cells.join("+").localeCompare(b.cells.join("+")));
  const denom = rem.length && rem[0].score > 0 ? rem[0].score : 1;
  const picked: T[] = [];
  while (picked.length < topN && rem.length) {
    let bestIdx = 0, bestVal = -Infinity;
    for (let i = 0; i < rem.length; i++) {
      const maxSim = picked.reduce((m, p) => Math.max(m, similarity(rem[i], p)), 0);
      const val = rem[i].score / denom - lambda * maxSim;
      if (val > bestVal) { bestVal = val; bestIdx = i; }
    }
    picked.push(rem.splice(bestIdx, 1)[0]);
  }
  return picked;
}

/**
 * Beam-search the top `topN` mixed fills for a grouping. Beam (vs full
 * Cartesian product) keeps it bounded — a 5-cell grouping has tens of
 * thousands of raw combinations.
 */
export function rankedMixes(grouping: number[], topN = 10): Mix[] {
  if (grouping.length === 0) return [];
  const pools = grouping.map(cellCandidates);
  const WIDTH = 140;

  let beam: { cells: string[]; devices: string[] }[] = [{ cells: [], devices: [] }];
  for (const pool of pools) {
    const next: { cells: string[]; devices: string[]; score: number }[] = [];
    for (const partial of beam) {
      for (const cand of pool) {
        const cells = [...partial.cells, cand.pattern];
        const devices = [...partial.devices, cand.device];
        next.push({ cells, devices, score: scoreMix(cells, devices) });
      }
    }
    next.sort((a, b) => b.score - a.score || a.cells.join("").localeCompare(b.cells.join("")));
    beam = next.slice(0, WIDTH).map(({ cells, devices }) => ({ cells, devices }));
  }

  // Score + dedupe the survivors into a candidate pool.
  const seen = new Set<string>();
  const pool: Mix[] = [];
  for (const b of beam) {
    const key = b.cells.join("+");
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push({ cells: b.cells, devices: b.devices, score: scoreMix(b.cells, b.devices) });
  }
  return mmrSelect(pool, topN, 0.6);
}
