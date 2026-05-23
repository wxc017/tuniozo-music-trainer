// ── Blues tab corpus (curated Guitar Pro files) ─────────────────────
//
// Curates canonical blues-guitar transcriptions for the Blues tab (alphaTab)
// by MERGING two openly-downloadable Internet Archive Guitar Pro collections
// (extract both into the gitignored .cache first):
//   • .cache/blues-src/tabs/GuitarPro_Tabs/   — archive.org/details/GuitarProTabs
//       flat files named "Artist - Song.gpN"   (GuitarPro_Tabs.rar)
//   • .cache/blues-src2/gt/<Letter>/<artist>.zip — archive.org/details/gtptabs
//       one zip per artist, each holding that artist's .gp files
//
// These are fan transcriptions of copyrighted songs: PERSONAL / EDUCATIONAL
// use only, do not redistribute.  Output: public/blues/<artist>__<title>.gpN +
// public/blues/index.json (title / artist / file / youtube reference query).

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC1 = join(__dirname, ".cache", "blues-src", "tabs", "GuitarPro_Tabs");   // flat files
const GT = join(__dirname, ".cache", "blues-src2", "gt");                         // per-artist zips
const OUT = join(__dirname, "..", "..", "public", "blues");

const PER_ARTIST = 20;   // EQUAL representation — cap so no artist dominates

// `a1` = filename substrings in archive 1 (both name orders).  `zips` = the
// artist's zip(s) in archive 2.  `name` = display/normalised artist.
const ARTISTS = [
  { name: "B.B. King", a1: ["b.b. king", "bb king", "king, b.b", "king, bb"], zips: ["B/bb_king.zip"] },
  { name: "Albert King", a1: ["albert king", "king, albert"], zips: [] },
  { name: "Freddie King", a1: ["freddie king", "king, freddie"], zips: ["F/freddie_king.zip"] },
  { name: "T-Bone Walker", a1: ["t-bone"], zips: ["T/t_bone_walker.zip"] },
  { name: "Stevie Ray Vaughan", a1: ["stevie ray vaughan", "vaughan, stevie"], zips: ["V/vaughan_stevie_ray.zip"] },
  { name: "Buddy Guy", a1: ["buddy guy", "guy, buddy"], zips: ["B/buddy_guy.zip", "G/guy_buddy.zip"] },
  { name: "Muddy Waters", a1: ["muddy waters", "waters, muddy"], zips: ["W/waters_muddy.zip"] },
  { name: "John Lee Hooker", a1: ["john lee hooker", "hooker, john"], zips: ["H/hooker_john_lee.zip"] },
  { name: "Howlin' Wolf", a1: ["howlin"], zips: ["H/howlin_wolf.zip"] },
  { name: "Robert Johnson", a1: ["robert johnson", "johnson, robert"], zips: ["J/johnson_robert.zip"] },
  { name: "Lonnie Johnson", a1: ["lonnie johnson", "johnson, lonnie"], zips: ["J/johnson_lonnie.zip"] },
  { name: "Johnny Winter", a1: ["johnny winter", "winter, johnny"], zips: ["W/winter_johnny.zip"] },
  { name: "Robert Cray", a1: ["robert cray", "cray, robert"], zips: ["C/cray_robert.zip"] },
  { name: "Robben Ford", a1: ["robben ford", "ford, robben"], zips: ["F/ford_robben.zip"] },
  { name: "Roy Buchanan", a1: ["roy buchanan", "buchanan, roy"], zips: ["R/roy_buchanan.zip"] },
  { name: "Kenny Wayne Shepherd", a1: ["kenny wayne"], zips: ["K/kenny_wayne_shepard.zip"] },
  { name: "Gary Moore", a1: ["gary moore", "moore, gary"], zips: ["M/moore_gary.zip"] },
  { name: "Allman Brothers", a1: ["allman brothers", "allman"], zips: ["A/allman_brothers_band_the.zip"] },
  { name: "Eric Clapton", a1: ["eric clapton", "clapton, eric", "clapton"], zips: ["C/clapton_eric.zip"] },
  { name: "Jimi Hendrix", a1: ["jimi hendrix", "hendrix, jimi", "hendrix"], zips: ["H/hendrix_jimi.zip"] },
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const TAB_RE = /\.(gp[345x]?|gtp)$/i;
const cleanTitle = (s) => s.replace(TAB_RE, "").replace(/[_]+/g, " ")
  .replace(/^[\s\-,]+|[\s\-,]+$/g, "").replace(/\s*\(\d+\)\s*$/, "").replace(/\s+/g, " ").trim();
const dedupeKey = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
const isGp45 = (ext) => /gp[45]/i.test(ext);

export function build() {
  if (!existsSync(SRC1) && !existsSync(GT)) {
    console.log("Blues: no source archives in .cache. See header for download links.");
    return;
  }
  if (existsSync(OUT)) for (const f of readdirSync(OUT)) if (/\.(gp[345x]?|gtp|json)$/i.test(f)) rmSync(join(OUT, f));
  mkdirSync(OUT, { recursive: true });

  const flat = existsSync(SRC1) ? readdirSync(SRC1).filter(f => TAB_RE.test(f)) : [];
  const index = [];

  for (const a of ARTISTS) {
    // Gather candidate { title, ext, bytes } from BOTH archives.
    const cands = [];
    for (const f of flat) {
      if (!a.a1.some(m => f.toLowerCase().includes(m))) continue;
      let title = f; for (const m of a.a1) title = title.replace(new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "");
      cands.push({ title: cleanTitle(title), ext: f.split(".").pop().toLowerCase(), bytes: readFileSync(join(SRC1, f)) });
    }
    for (const z of a.zips) {
      const zp = join(GT, z);
      if (!existsSync(zp)) continue;
      try {
        const entries = unzipSync(new Uint8Array(readFileSync(zp)));
        for (const [k, bytes] of Object.entries(entries)) {
          if (!TAB_RE.test(k)) continue;
          const base = k.split("/").pop();
          cands.push({ title: cleanTitle(base), ext: base.split(".").pop().toLowerCase(), bytes: Buffer.from(bytes) });
        }
      } catch { /* skip bad zip */ }
    }
    // Prefer newer formats, dedupe by title, cap.
    cands.sort((x, y) => (isGp45(y.ext) ? 1 : 0) - (isGp45(x.ext) ? 1 : 0) || x.title.localeCompare(y.title));
    const seen = new Set();
    let kept = 0;
    for (const c of cands) {
      if (kept >= PER_ARTIST) break;
      if (!c.title) continue;
      const key = dedupeKey(c.title);
      if (seen.has(key)) continue;
      seen.add(key);
      const dest = `${slug(a.name)}__${slug(c.title)}.${c.ext}`;
      writeFileSync(join(OUT, dest), c.bytes);
      index.push({
        file: dest, title: c.title, artist: a.name,
        youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${a.name} ${c.title}`)}`,
      });
      kept++;
    }
    if (kept === 0) console.log(`  (none found for ${a.name})`);
  }

  index.sort((x, y) => x.artist.localeCompare(y.artist) || x.title.localeCompare(y.title));
  writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 1));
  console.log(`Blues: wrote ${index.length} tabs across ${new Set(index.map(i => i.artist)).size} artists → public/blues/`);
}

build();
