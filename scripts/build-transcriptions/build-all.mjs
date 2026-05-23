// ── ETL orchestrator ────────────────────────────────────────────────
//
//   node scripts/build-transcriptions/build-all.mjs            # all four
//   node scripts/build-transcriptions/build-all.mjs weimar     # one/some
//   TX_LIMIT=100 node scripts/build-transcriptions/build-all.mjs
//
// Each source builder writes public/transcriptions/<source>.json; the
// index is rebuilt once at the end from whatever exists on disk.

import { build as thesession } from "./thesession.mjs";
import { build as essen } from "./essen.mjs";
import { build as cocopops } from "./cocopops.mjs";
import { build as weimar } from "./weimar.mjs";
import { build as ewld } from "./ewld.mjs";
import { rebuildIndex } from "./common.mjs";

const BUILDERS = { thesession, essen, cocopops, weimar, ewld };

const requested = process.argv.slice(2).filter(a => a in BUILDERS);
const sources = requested.length ? requested : Object.keys(BUILDERS);

console.log(`Building transcriptions: ${sources.join(", ")}\n`);
for (const name of sources) {
  console.log(`▶ ${name}`);
  try { await BUILDERS[name](); }
  catch (e) { console.error(`  ✗ ${name} failed: ${e.message}`); }
  console.log("");
}
rebuildIndex();
console.log("\nDone. Output in public/transcriptions/.");
