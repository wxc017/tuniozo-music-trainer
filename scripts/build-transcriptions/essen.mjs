// ── Essen Folksong Collection (ABC via music21 corpus) ──────────────
//
// Source: cuthbertLab/music21 corpus/essenFolksong — 32 .abc files, each
// holding many fully-headed tunes. Parsed directly with the shared abcjs
// importer (full headers ⇒ meter/key/title come from the tune itself).

import { httpGet, abcToItems, curate, writeSource, rebuildIndex, isMain } from "./common.mjs";

const API = "https://api.github.com/repos/cuthbertLab/music21/git/trees/master?recursive=1";
const RAW = "https://raw.githubusercontent.com/cuthbertLab/music21/master/";

// Region/collection style tags from the file-name prefix.
function styleFor(file) {
  const f = file.toLowerCase();
  if (f.includes("china") || f.startsWith("han")) return "Chinese";
  if (f.startsWith("ballad")) return "Ballad";
  if (f.startsWith("altdeu") || f.startsWith("boehme") || f.startsWith("deut")) return "German";
  if (f.startsWith("erk")) return "German (Erk)";
  if (f.startsWith("fink")) return "German (Fink)";
  if (f.startsWith("zuccal")) return "Italian";
  return "European";
}

export async function build() {
  console.log("Essen: locating .abc files in music21 corpus…");
  const tree = JSON.parse(await httpGet(API));
  const files = tree.tree
    .filter(t => t.type === "blob" && /music21\/corpus\/essenFolksong\/.+\.abc$/.test(t.path))
    .map(t => t.path);
  console.log(`  ${files.length} .abc collections`);

  const items = [];
  for (const path of files) {
    let text;
    try { text = await httpGet(RAW + path); } catch (e) { console.warn(`  skip ${path}: ${e.message}`); continue; }
    const file = path.split("/").pop();
    const built = abcToItems(text, {
      source: "essen",
      idBase: `essen-${file.replace(/\.abc$/, "")}`,
      // idx defaults to each tune's position in the file
      tempoBpm: 96,
      style: styleFor(file),
    });
    items.push(...built);
  }
  console.log(`  parsed ${items.length} tunes`);
  const curated = curate(items, { max: 450, minBars: 8 });
  writeSource("essen", curated);
}

if (isMain(import.meta.url)) {
  build().then(rebuildIndex).catch(e => { console.error(e); process.exit(1); });
}
