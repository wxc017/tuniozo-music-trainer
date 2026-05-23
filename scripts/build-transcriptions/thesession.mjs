// ── The Session — Irish trad tune archive (ABC) ─────────────────────
//
// Source: adactio/TheSession-data (public data dump). Each record has an
// `abc` body + `meter` + `mode`. We wrap it in a minimal ABC header and
// parse with the shared abcjs importer.

import { httpGetJson, parseMeter, abcToItems, curate, writeSource, rebuildIndex, isMain } from "./common.mjs";

const TUNES_URL = "https://raw.githubusercontent.com/adactio/TheSession-data/main/json/tunes.json";

// Rough tempo by tune type (bpm in the item's time signature).
const TYPE_TEMPO = {
  jig: 116, reel: 112, hornpipe: 100, slip: 120, slide: 120,
  polka: 120, march: 100, waltz: 90, strathspey: 88, barndance: 104,
};
const TYPE_STYLE = {
  jig: "Jig", reel: "Reel", hornpipe: "Hornpipe", "slip jig": "Slip Jig",
  slide: "Slide", polka: "Polka", march: "March", waltz: "Waltz",
  strathspey: "Strathspey", barndance: "Barndance",
};

export async function build() {
  console.log("The Session: downloading tune dump…");
  const tunes = await httpGetJson(TUNES_URL);
  console.log(`  ${tunes.length} settings downloaded`);

  const items = [];
  for (let i = 0; i < tunes.length; i++) {
    const t = tunes[i];
    if (!t.abc || !t.name) continue;
    const meter = parseMeter(t.meter);
    const abc = `X:1\nM:${t.meter || "4/4"}\nL:1/8\nK:${t.mode || "Cmajor"}\n${t.abc.replace(/\\r\\n|\\n/g, "\n").replace(/\r/g, "")}\n`;
    const built = abcToItems(abc, {
      source: "thesession",
      idBase: `ts-${t.tune_id}-${t.setting_id || 0}`,
      idx: 0,
      meterOverride: meter,
      modeOverride: t.mode || "Cmajor",
      titleOverride: t.name,
      tempoBpm: TYPE_TEMPO[t.type] ?? 110,
      style: TYPE_STYLE[t.type] ?? (t.type ? t.type[0].toUpperCase() + t.type.slice(1) : undefined),
    });
    items.push(...built);
  }
  console.log(`  parsed ${items.length} tunes`);
  const curated = curate(items, { max: 500, minBars: 8 });
  writeSource("thesession", curated);
}

if (isMain(import.meta.url)) {
  build().then(rebuildIndex).catch(e => { console.error(e); process.exit(1); });
}
