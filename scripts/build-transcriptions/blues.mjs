// ── Blues tab corpus (essential bluesmen, real recordings) ──────────
//
// Curates ESSENTIAL pure-blues guitar transcriptions for the Blues tab from
// two openly-downloadable Internet Archive Guitar Pro collections (extract
// both into the gitignored .cache first):
//   • .cache/blues-src/tabs/GuitarPro_Tabs/      (archive.org/details/GuitarProTabs)
//   • .cache/blues-src2/gt/<Letter>/<artist>.zip (archive.org/details/gtptabs)
//
// alphaTab renders the .gp as notation + tab; the ACTUAL recording (a scraped
// YouTube video id) is what you LISTEN to — MIDI can't reproduce blues
// inflections.  Fan transcriptions of copyrighted songs: personal use only.
//
// Output: public/blues/<artist>__<title>.gpN + public/blues/index.json
// (title / artist / file / youtube / vid).

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import https from "node:https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC1 = join(__dirname, ".cache", "blues-src", "tabs", "GuitarPro_Tabs");
const GT = join(__dirname, ".cache", "blues-src2", "gt");
const OUT = join(__dirname, "..", "..", "public", "blues");

const PER_ARTIST = 20;

// The ESSENTIAL pure-blues guitarists only (no rock-crossover).  Some have no
// transcriptions in these archives (noted at build time) — Albert King, Otis
// Rush, Albert Collins are kept here to record intent even though they're absent.
const ARTISTS = [
  { name: "B.B. King", a1: ["b.b. king", "bb king", "king, b.b", "king, bb"], zips: ["B/bb_king.zip"] },
  { name: "Albert King", a1: ["albert king", "king, albert"], zips: [] },
  { name: "Freddie King", a1: ["freddie king", "king, freddie"], zips: ["F/freddie_king.zip"] },
  { name: "T-Bone Walker", a1: ["t-bone"], zips: ["T/t_bone_walker.zip"] },
  { name: "Otis Rush", a1: ["otis rush", "rush, otis"], zips: [] },
  { name: "Albert Collins", a1: ["albert collins", "collins, albert"], zips: [] },
  { name: "Elmore James", a1: ["elmore james", "james, elmore"], zips: ["J/james_elmore.zip"] },
  { name: "Muddy Waters", a1: ["muddy waters", "waters, muddy"], zips: ["W/waters_muddy.zip"] },
  { name: "Howlin' Wolf", a1: ["howlin"], zips: ["H/howlin_wolf.zip"] },
  { name: "John Lee Hooker", a1: ["john lee hooker", "hooker, john"], zips: ["H/hooker_john_lee.zip"] },
  { name: "Robert Johnson", a1: ["robert johnson", "johnson, robert"], zips: ["J/johnson_robert.zip"] },
  { name: "Buddy Guy", a1: ["buddy guy", "guy, buddy"], zips: ["B/buddy_guy.zip", "G/guy_buddy.zip"] },
  { name: "Stevie Ray Vaughan", a1: ["stevie ray vaughan", "vaughan, stevie"], zips: ["V/vaughan_stevie_ray.zip"] },
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const TAB_RE = /\.(gp[345x]?|gtp)$/i;
const dedupeKey = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
const isGp45 = (e) => /gp[45]/i.test(e);

const SMALL = new Set(["a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "for", "my", "me", "you"]);
/** Proper-case a messy filename-derived title. */
function titleCase(s) {
  const words = s.replace(TAB_RE, "").replace(/[_]+/g, " ")
    .replace(/^[\s\-,]+|[\s\-,]+$/g, "").replace(/\s*\(\d+\)\s*$/, "").replace(/\s+/g, " ").trim()
    .split(" ");
  return words.map((w, i) => {
    const lw = w.toLowerCase();
    if (i > 0 && SMALL.has(lw)) return lw;
    return lw.charAt(0).toUpperCase() + lw.slice(1);
  }).join(" ");
}

/** Scrape the first YouTube video id for a query (best effort). */
function fetchVideoId(query) {
  return new Promise((resolve) => {
    const url = "https://www.youtube.com/results?search_query=" + encodeURIComponent(query);
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let d = "";
      res.on("data", (c) => { d += c; if (d.length > 2e6) res.destroy(); });
      res.on("end", () => { const m = d.match(/"videoId":"([\w-]{11})"/); resolve(m ? m[1] : null); });
    }).on("error", () => resolve(null));
  });
}

async function mapLimit(items, limit, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
}

export async function build() {
  if (!existsSync(SRC1) && !existsSync(GT)) { console.log("Blues: no source archives in .cache."); return; }
  if (existsSync(OUT)) for (const f of readdirSync(OUT)) if (/\.(gp[345x]?|gtp|json)$/i.test(f)) rmSync(join(OUT, f));
  mkdirSync(OUT, { recursive: true });
  const flat = existsSync(SRC1) ? readdirSync(SRC1).filter(f => TAB_RE.test(f)) : [];

  // Gather curated tunes (sync).
  const tunes = [];
  for (const a of ARTISTS) {
    const cands = [];
    for (const f of flat) {
      if (!a.a1.some(m => f.toLowerCase().includes(m))) continue;
      let t = f; for (const m of a.a1) t = t.replace(new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "");
      cands.push({ title: titleCase(t), ext: f.split(".").pop().toLowerCase(), bytes: readFileSync(join(SRC1, f)) });
    }
    for (const z of a.zips) {
      const zp = join(GT, z); if (!existsSync(zp)) continue;
      try {
        for (const [k, bytes] of Object.entries(unzipSync(new Uint8Array(readFileSync(zp))))) {
          if (!TAB_RE.test(k)) continue;
          const base = k.split("/").pop();
          cands.push({ title: titleCase(base), ext: base.split(".").pop().toLowerCase(), bytes: Buffer.from(bytes) });
        }
      } catch { /* skip */ }
    }
    cands.sort((x, y) => (isGp45(y.ext) ? 1 : 0) - (isGp45(x.ext) ? 1 : 0) || x.title.localeCompare(y.title));
    const seen = new Set(); let kept = 0;
    for (const c of cands) {
      if (kept >= PER_ARTIST) break;
      if (!c.title || seen.has(dedupeKey(c.title))) continue;
      seen.add(dedupeKey(c.title));
      tunes.push({ artist: a.name, ...c });
      kept++;
    }
    if (kept === 0) console.log(`  (none found for ${a.name})`);
  }

  // Look up the actual recording for each tune (concurrent, best effort).
  console.log(`Blues: ${tunes.length} tunes — looking up recordings on YouTube…`);
  const vids = await mapLimit(tunes, 5, t => fetchVideoId(`${t.artist} ${t.title}`));

  const index = [];
  tunes.forEach((t, i) => {
    const dest = `${slug(t.artist)}__${slug(t.title)}.${t.ext}`;
    writeFileSync(join(OUT, dest), t.bytes);
    index.push({
      file: dest, title: t.title, artist: t.artist, vid: vids[i] || undefined,
      youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${t.artist} ${t.title}`)}`,
    });
  });
  index.sort((x, y) => x.artist.localeCompare(y.artist) || x.title.localeCompare(y.title));
  writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 1));
  const withVid = index.filter(i => i.vid).length;
  console.log(`Blues: wrote ${index.length} tabs (${withVid} with embedded recordings) across ${new Set(index.map(i => i.artist)).size} artists`);
}

build().catch(e => { console.error(e); process.exit(1); });
