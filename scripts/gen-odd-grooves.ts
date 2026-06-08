// Validates the odd-meter groove data and emits a markdown practice sheet.
// Run:  npx tsx scripts/gen-odd-grooves.ts
import { writeFileSync } from "node:fs";
import {
  ODD_GROOVES, ODD_METERS, METER_INFO, groovesByMeter,
  groupHeadSlots, renderGrooveAscii,
} from "../src/lib/oddMeterGrooves.ts";

// ── Validate invariants ──
const errors: string[] = [];
for (const g of ODD_GROOVES) {
  const info = METER_INFO[g.meter];
  if (g.slots !== info.slots) errors.push(`${g.id}: slots ${g.slots} ≠ ${info.slots}`);
  const sum = g.grouping.reduce((a, b) => a + b, 0);
  if (sum !== info.pulses) errors.push(`${g.id}: grouping sums to ${sum}, expected ${info.pulses}`);
  const inRange = (xs: number[] | undefined) =>
    (xs ?? []).every(s => Number.isInteger(s) && s >= 0 && s < g.slots);
  for (const [v, xs] of [["hihat", g.hihat], ["snare", g.snare], ["kick", g.kick], ["ghost", g.ghost], ["hhFoot", g.hhFoot], ["accents", g.accents]] as const) {
    if (!inRange(xs)) errors.push(`${g.id}: ${v} has an out-of-range slot (slots=${g.slots})`);
  }
  // Group-head accents should sit on the actual group heads.
  const heads = new Set(groupHeadSlots(g.meter, g.grouping));
  for (const a of g.accents ?? []) if (!heads.has(a)) errors.push(`${g.id}: accent ${a} is not a group head [${[...heads].join(",")}]`);
}

if (errors.length) {
  console.error("VALIDATION FAILED:\n" + errors.map(e => "  • " + e).join("\n"));
  process.exit(1);
}

const total = ODD_GROOVES.length;
const counts = ODD_METERS.map(m => `${m}: ${groovesByMeter(m).length}`).join(", ");
console.log(`✓ ${total} grooves validated  (${counts})`);

// ── Emit markdown sheet ──
const md: string[] = [
  "# Odd-Meter Groove Practice Sheet",
  "",
  "Common drum grooves in **3/4, 5/4, 5/8, 7/8, 11/8** — generic functional",
  "patterns (standard subdivision groupings with a basic kick/snare/hat",
  "treatment per style). Authored as common pedagogical material; not a",
  "transcription of any copyrighted recording.",
  "",
  "**Legend** — `X` accented hit · `x` hit · `o` ghost snare · `f` hi-hat foot ·",
  "`|` group boundary · `·` rest. Each column is a 16th note; eighths fall on",
  "every 2nd column, quarters on every 4th.",
  "",
  `Total: **${total} grooves** (${counts}).`,
  "",
];
for (const m of ODD_METERS) {
  md.push(`## ${m}`, "");
  for (const g of groovesByMeter(m)) {
    md.push("```", renderGrooveAscii(g), "```", "");
  }
}
const outPath = new URL("../docs/odd-meter-grooves.md", import.meta.url);
writeFileSync(outPath, md.join("\n"));
console.log(`✓ wrote ${outPath.pathname}`);
