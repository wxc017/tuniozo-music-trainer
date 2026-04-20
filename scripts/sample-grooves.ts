/**
 * Sample the vocal-percussion generator across the full mode matrix used in
 * the app's Practice > Vocal Percussion section, and dump the results to a
 * text file.  Configs sweep (subdivision, voicingMode, accentMode).  Useful
 * for eyeballing whether the procedural-groove generator produces varied,
 * musical output with motif structure — and for confirming the max-2-in-a-row
 * cap actually holds across every mode combination.
 *
 * Run from the lumatone root:
 *   npx tsx scripts/sample-grooves.ts
 *
 * Output: scripts/groove-samples.txt
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type DrumVoice, type VocalPattern,
  VOICE_SHORT,
  generateFromGrouping,
  applyGrooveVoicing,
  applySpace,
  enforceMusicalConstraints,
} from "../src/lib/vocalPercussionData";
import { generateAndSelectGrouping } from "../src/lib/groupingSelector";

/** Fast random-composition picker for large n.  `generateAndSelectGrouping`
 *  brute-forces ALL compositions (exponential) and OOMs past n≈16 with
 *  maxPart=8.  For the sampler we just want a plausible musical partition —
 *  repeatedly draw sizes from a palette until we've consumed n slots.  For
 *  large n we widen the palette so a 32-slot pattern can resolve into 3-8
 *  parts instead of forcing 7+ tiny ones. */
function fastRandomGrouping(n: number): number[] {
  const parts: number[] = [];
  let remaining = n;
  // Palette widens as n grows so large phrases don't have to be 8+ small
  // parts.  For n≥24 we allow up to 8-slot parts; for huge n even up to 10.
  const palette = n >= 24 ? [2, 3, 4, 5, 6, 7, 8]
                : n >= 16 ? [2, 3, 4, 5, 6]
                : [2, 3, 4, 5];
  const maxPart = Math.max(...palette);
  while (remaining > 0) {
    if (remaining <= maxPart) { parts.push(remaining); break; }
    const pick = palette[Math.floor(Math.random() * palette.length)];
    parts.push(pick);
    remaining -= pick;
  }
  return parts;
}

const SUBDIVISIONS = [2, 3, 4, 5, 6, 7, 8] as const;
const VOICING_MODES = ["linear", "groove"] as const;
const ACCENT_MODES  = ["first", "repeat", "groupings"] as const;
// Sweep beat-count too so the corpus covers every meter shape the UI exposes
// via the preset buttons (2,3,4,6,8) plus the odd meters 5 and 7.
const NUM_BEATS_SET = [2, 3, 4, 5, 6, 7, 8] as const;
const TOTAL_TARGET = 1500;            // corpus-wide sample target
const CEILING_PER_CONFIG = 48;        // don't let any single block starve the rest
const TOTAL_CONFIGS =
  NUM_BEATS_SET.length * SUBDIVISIONS.length * VOICING_MODES.length * ACCENT_MODES.length;

type AccentMode = typeof ACCENT_MODES[number];

/** Lifted from VocalPercussion.tsx — accent-mode rewrite.  The component
 *  doesn't export it, so we re-inline it here for the sampler. */
function applyAccentMode(
  pattern: VocalPattern,
  mode: AccentMode,
  every: number,
): VocalPattern {
  if (mode === "first") return pattern;
  const step = Math.max(1, Math.floor(every));
  const totalSlots = pattern.groups.reduce((s, g) => s + g.size, 0);

  const accentStarts = new Set<number>();
  if (mode === "groupings") {
    // For small n, use the full tiered selector the app uses.  For large n,
    // fall back to fastRandomGrouping — enumerating all compositions of n=32
    // is 2B+ arrays and OOMs.
    const accentGrouping = totalSlots <= 14
      ? (generateAndSelectGrouping(totalSlots, "musical") ?? [totalSlots])
      : fastRandomGrouping(totalSlots);
    let cursor = 0;
    for (const size of accentGrouping) {
      if (cursor < totalSlots) accentStarts.add(cursor);
      cursor += size;
    }
  }

  let globalIdx = 0;
  const groups = pattern.groups.map(g => {
    const slots = g.slots.map(s => {
      let isAccent = false;
      if (mode === "repeat") isAccent = globalIdx % step === 0;
      else if (mode === "groupings") isAccent = accentStarts.has(globalIdx);
      globalIdx++;
      return { ...s, isAccent };
    });
    return { ...g, slots };
  });
  return { ...pattern, groups };
}

// Format one pattern as a single line: uppercase voice letters for accents,
// lowercase for non-accents.  Slot-grid visible so long runs jump out.
function formatPattern(p: VocalPattern): string {
  const parts: string[] = [];
  for (const g of p.groups) {
    const letters: string[] = [];
    for (const s of g.slots) {
      if (s.isRest) { letters.push("."); continue; }
      const ch = VOICE_SHORT[s.voice];
      letters.push(s.isAccent ? ch : ch.toLowerCase());
    }
    parts.push(letters.join(""));
  }
  return parts.join(" ");
}

// Derive the actual accent grouping from the slot accents, for the header.
function accentGrouping(p: VocalPattern): number[] {
  const positions: number[] = [];
  let idx = 0;
  for (const g of p.groups) for (const s of g.slots) {
    if (s.isAccent) positions.push(idx);
    idx++;
  }
  if (positions.length === 0) return p.grouping;
  const out: number[] = [];
  for (let i = 0; i < positions.length; i++) {
    const next = i + 1 < positions.length ? positions[i + 1] : p.totalSlots;
    out.push(next - positions[i]);
  }
  return out;
}

function maxRun(p: VocalPattern): { voice: DrumVoice | null; len: number } {
  const flat: DrumVoice[] = [];
  for (const g of p.groups) for (const s of g.slots) if (!s.isRest) flat.push(s.voice);
  let best = 0, bestV: DrumVoice | null = null;
  let cur = 0, curV: DrumVoice | null = null;
  for (const v of flat) {
    if (v === curV) cur++; else { curV = v; cur = 1; }
    if (cur > best) { best = cur; bestV = v; }
  }
  return { voice: bestV, len: best };
}

const lines: string[] = [];
lines.push("# Vocal-percussion generator — full mode-matrix samples");
lines.push(`# Corpus target: ${TOTAL_TARGET} samples spread across ${TOTAL_CONFIGS} configs`);
lines.push(`# ${NUM_BEATS_SET.length} beat-counts × ${SUBDIVISIONS.length} subdivisions × ${VOICING_MODES.length} voicing × ${ACCENT_MODES.length} accent = ${TOTAL_CONFIGS} configs`);
lines.push(`# Per-config target is rebalanced on the fly (ceiling=${CEILING_PER_CONFIG}):`);
lines.push(`# configs that cap out early forward their unused budget to the rest.`);
lines.push(`# beats ∈ {${NUM_BEATS_SET.join(",")}}, grouping = [N × beats] for subdivision N`);
lines.push("# Uppercase = accent, lowercase = non-accent, '.' = rest");
lines.push("# K=kick, S=snare, G=ghost, H=hat");
lines.push("#");
lines.push("# Per sample: the left column shows the accent-phrase grouping");
lines.push("# (what the listener hears) — differs from the subdivision when");
lines.push("# accent mode ≠ 'first'.");
lines.push("");

const enabled: DrumVoice[] = ["kick", "snare", "ghost", "hat", "tom"];

// For "repeat" accent mode: pick an `every` that doesn't equal the subdivision
// (would produce [sub,sub,sub,sub] accent grouping which is identical to
// accent=first — the displacement exercise collapses).
function pickAccentEvery(subdivision: number): number {
  for (const candidate of [5, 7, 3, 4, 6, 8, 2]) {
    if (candidate !== subdivision) return candidate;
  }
  return 3;
}

let totalGenerated = 0;
let totalRejected = 0;
let worstGlobal = 0;
let configsProcessed = 0;

for (const numBeats of NUM_BEATS_SET) {
 for (const subdivision of SUBDIVISIONS) {
  for (const voicing of VOICING_MODES) {
    for (const accent of ACCENT_MODES) {
      const grouping = Array<number>(numBeats).fill(subdivision);
      const accentEvery = pickAccentEvery(subdivision);
      const headerExtras = accent === "repeat" ? ` (every=${accentEvery})` : "";
      const header = `── beats=${numBeats} · subdivision=${subdivision} · voicing=${voicing} · accent=${accent}${headerExtras} ────────────`;
      lines.push(header);

      // Adaptive per-config target: evenly split the remaining budget across
      // remaining configs, capped by CEILING_PER_CONFIG.  Capped configs that
      // underfill (e.g. sub=2/groove/first, which only admits 13 unique
      // variants) push their surplus onto later configs automatically.
      const configsLeft = TOTAL_CONFIGS - configsProcessed;
      const remaining = Math.max(0, TOTAL_TARGET - totalGenerated);
      const configTarget = Math.min(
        CEILING_PER_CONFIG,
        Math.ceil(remaining / configsLeft),
      );
      configsProcessed++;

      // Dedupe block — the groove·first configs collapse to ~5 distinct
      // patterns.  Rejecting duplicates forces the sampler to surface the
      // actual variety in the generator's distribution.
      const seen = new Set<string>();
      let worstBlock = 0;
      let blockAttempts = 0;
      const maxAttempts = configTarget * 20;

      while (seen.size < configTarget && blockAttempts < maxAttempts) {
        blockAttempts++;
        let p = generateFromGrouping(grouping, enabled);
        p = applyAccentMode(p, accent, accentEvery);
        p = voicing === "groove"
          ? applyGrooveVoicing(p, enabled)
          : enforceMusicalConstraints(p, enabled);
        // Exercise the space pass in both voicing modes — the user toggles it
        // on/off in the UI.  Sampling it on here shows its effect across the
        // full mode matrix.
        p = applySpace(p);

        // Reject degenerate accent-groupings: single-part ([N]) gives the
        // listener no phrase to latch onto.  Upper bound scales with total
        // slots — for short phrases cap tight (5 parts max), for long phrases
        // (n≥24) allow up to 8 parts so sub=7/sub=8 patterns can resolve.
        const ag = accentGrouping(p);
        const maxParts = p.totalSlots >= 24 ? 8 : p.totalSlots >= 16 ? 6 : 5;
        if (accent === "groupings" && (ag.length < 2 || ag.length > maxParts)) {
          totalRejected++;
          continue;
        }

        const key = formatPattern(p);
        if (seen.has(key)) {
          totalRejected++;
          continue;
        }
        seen.add(key);

        const run = maxRun(p);
        if (run.len > worstBlock) worstBlock = run.len;
        if (run.len > worstGlobal) worstGlobal = run.len;

        const idx = String(seen.size).padStart(3, "0");
        const agStr = ag.join("+").padEnd(14, " ");
        const runTag = run.len > 2 ? `  ⚠ run=${run.len} ${run.voice}` : "";
        lines.push(`  ${idx}  [${agStr}]  ${key}${runTag}`);
        totalGenerated++;
      }

      if (seen.size < configTarget) {
        lines.push(`  (only ${seen.size} distinct variants reachable after ${blockAttempts} attempts — target was ${configTarget})`);
      }
      lines.push(`  (worst same-voice run in this block: ${worstBlock})`);
      lines.push("");
    }
  }
 }
}

lines.push(`# Total samples generated: ${totalGenerated}`);
lines.push(`# Rejected (duplicate or degenerate grouping): ${totalRejected}`);
lines.push(`# Worst same-voice run across entire corpus: ${worstGlobal}`);
lines.push(`# Run cap target: 2 (max 2 same-voice in a row)`);
lines.push(`# ${worstGlobal <= 2 ? "✓ CAP HELD across every sample" : "✗ CAP VIOLATED somewhere — see ⚠ markers"}`);

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "groove-samples.txt");
writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`Wrote ${lines.length} lines, ${totalGenerated} samples, worst run=${worstGlobal} to ${outPath}`);
