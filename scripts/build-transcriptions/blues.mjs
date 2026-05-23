// ── Blues tab corpus (curated Guitar Pro files) ─────────────────────
//
// Curates a starter set of canonical blues-guitar transcriptions for the
// Blues tab (alphaTab).  Source: the openly-downloadable Internet Archive
// "Guitar Pro Tabs" collection (archive.org/details/GuitarProTabs) — extract
// it to scripts/build-transcriptions/.cache/blues-src/tabs/GuitarPro_Tabs/
// first (the .cache dir is gitignored).  These are fan transcriptions of
// copyrighted songs: PERSONAL / EDUCATIONAL use only, do not redistribute.
//
// Output: public/blues/<artist>__<title>.gpN  +  public/blues/index.json
// (title / artist / file / youtube reference query).  The Blues tab fetches
// that index, lists the tunes, and loads the selected .gp via alphaTab.

import { readdirSync, copyFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, ".cache", "blues-src", "tabs", "GuitarPro_Tabs");
const OUT = join(__dirname, "..", "..", "public", "blues");

// Keep at most this many tunes per artist so the corpus is balanced (the source
// archive is heavy on a few names) — EQUAL representation, not whoever has most.
const PER_ARTIST = 6;

// The great blues guitarists.  `match` = case-insensitive filename substrings
// (BOTH "First Last" and "Last, First" orders the archive uses), specific
// forms first so titles strip cleanly; `name` = the display/normalised artist.
const ARTISTS = [
  { name: "B.B. King", match: ["b.b. king", "bb king", "king, b.b", "king, bb"] },
  { name: "Albert King", match: ["albert king", "king, albert"] },
  { name: "Freddie King", match: ["freddie king", "king, freddie"] },
  { name: "Stevie Ray Vaughan", match: ["stevie ray vaughan", "vaughan, stevie ray", "vaughan, stevie"] },
  { name: "Buddy Guy", match: ["buddy guy", "guy, buddy"] },
  { name: "Muddy Waters", match: ["muddy waters", "waters, muddy"] },
  { name: "John Lee Hooker", match: ["john lee hooker", "hooker, john lee", "hooker, john"] },
  { name: "Lightnin' Hopkins", match: ["lightnin' hopkins", "hopkins, lightnin", "lightnin"] },
  { name: "Howlin' Wolf", match: ["howlin' wolf", "howlin"] },
  { name: "Robert Johnson", match: ["robert johnson", "johnson, robert"] },
  { name: "Johnny Winter", match: ["johnny winter", "winter, johnny"] },
  { name: "Gary Moore", match: ["gary moore", "moore, gary"] },
  { name: "Eric Clapton", match: ["eric clapton", "clapton, eric", "clapton"] },
  { name: "Jimi Hendrix", match: ["jimi hendrix", "hendrix, jimi", "hendrix"] },
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Title = filename minus the artist substring + extension, tidied. */
function titleOf(fn, matched) {
  let t = fn.replace(/\.(gp[345x]?|gtp)$/i, "");
  for (const m of matched) t = t.replace(new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "");
  return t.replace(/^[\s\-,]+|[\s\-,]+$/g, "")        // strip leading/trailing separators
          .replace(/\s*\(\d+\)\s*$/, "")              // drop "(2)" dupe markers
          .replace(/\s+/g, " ").trim() || fn;
}

export function build() {
  if (!existsSync(SRC)) {
    console.log("Blues: source not found. Download archive.org/details/GuitarProTabs,");
    console.log("       extract GuitarPro_Tabs.rar to scripts/build-transcriptions/.cache/blues-src/tabs/");
    return;
  }
  // Start clean so re-runs don't leave a stale (unbalanced) set behind.
  if (existsSync(OUT)) for (const f of readdirSync(OUT)) if (/\.(gp[345x]?|gtp|json)$/i.test(f)) rmSync(join(OUT, f));
  mkdirSync(OUT, { recursive: true });
  const all = readdirSync(SRC).filter(f => /\.(gp[345x]?|gtp)$/i.test(f));
  const index = [];
  const seen = new Set();
  for (const a of ARTISTS) {
    // Prefer .gp4/.gp5 over .gp3 (newer = cleaner bends), then alphabetical.
    const matches = all
      .filter(f => a.match.some(m => f.toLowerCase().includes(m)))
      .sort((x, y) => (y.match(/gp[45]/i) ? 1 : 0) - (x.match(/gp[45]/i) ? 1 : 0) || x.localeCompare(y));
    let kept = 0;
    for (const f of matches) {
      if (kept >= PER_ARTIST) break;                  // cap → balanced representation
      const title = titleOf(f, a.match);
      const key = `${a.name}|${title}`.toLowerCase();
      if (seen.has(key)) continue;                    // dedupe (2)/(3) variants
      seen.add(key);
      const ext = f.split(".").pop().toLowerCase();
      const dest = `${slug(a.name)}__${slug(title)}.${ext}`;
      copyFileSync(join(SRC, f), join(OUT, dest));
      index.push({
        file: dest, title, artist: a.name,
        youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${a.name} ${title}`)}`,
      });
      kept++;
    }
  }
  index.sort((x, y) => x.artist.localeCompare(y.artist) || x.title.localeCompare(y.title));
  writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 1));
  console.log(`Blues: copied ${index.length} tabs → public/blues/`);
}

build();
