// ── Blues corpus (a Transcriptions database, from Guitar Pro solos) ─
//
// Converts essential-bluesman Guitar Pro transcriptions into the shared
// TxItem schema so Blues is just another Transcriptions source (not a
// separate tab).  Source = the two openly-downloadable Internet Archive
// Guitar Pro collections, extracted into the gitignored .cache:
//   • .cache/blues-src/tabs/GuitarPro_Tabs/      (archive.org/details/GuitarProTabs)
//   • .cache/blues-src2/gt/<Letter>/<artist>.zip (archive.org/details/gtptabs)
//
// alphaTab (headless) parses each .gp; we take the LEAD guitar track as the
// melody (the solo).  Chord symbols are usually absent in these files, so the
// loader's harmonizeMelody fills the changes.  `vid` is the actual recording
// (scraped YouTube id) for the Transcriptions "real recording" playback.
// Fan transcriptions of copyrighted songs: personal/educational use only.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import https from "node:https";
import * as at from "@coderline/alphatab";
import { curate, clipBars, writeSource, rebuildIndex, isMain } from "./common.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC1 = join(__dirname, ".cache", "blues-src", "tabs", "GuitarPro_Tabs");
const GT = join(__dirname, ".cache", "blues-src2", "gt");
const PER_ARTIST = 20;
const TPQ = 960;  // alphaTab ticks per quarter note

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

const TAB_RE = /\.(gp[345x]?|gtp)$/i;
const dedupeKey = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
const SMALL = new Set(["a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "for", "my", "me", "you"]);
const titleCase = (s) => s.replace(TAB_RE, "").replace(/[_]+/g, " ").replace(/^[\s\-,]+|[\s\-,]+$/g, "")
  .replace(/\s*\(\d+\)\s*$/, "").replace(/\s+/g, " ").trim()
  .split(" ").map((w, i) => { const l = w.toLowerCase(); return i > 0 && SMALL.has(l) ? l : l.charAt(0).toUpperCase() + l.slice(1); }).join(" ");

/** Lead-track melody + key/metre/tempo from a Guitar Pro byte buffer → partial TxItem. */
function gpToItem(bytes) {
  let score;
  try { score = at.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(bytes)); } catch { return null; }
  if (!score?.tracks?.length) return null;
  // Lead = first track that isn't bass/drums and has the most notes.
  const cand = score.tracks
    .filter(t => !/bass|drum|perc/i.test(t.name || ""))
    .map(t => {
      let n = 0; for (const bar of t.staves[0].bars) for (const v of bar.voices) for (const b of v.beats) n += b.notes.length;
      return { t, n };
    }).sort((a, b) => b.n - a.n)[0];
  if (!cand || cand.n < 20) return null;
  const staff = cand.t.staves[0];

  const melody = [];
  for (const bar of staff.bars) for (const v of bar.voices) for (const b of v.beats) {
    if (b.isRest || !b.notes.length) continue;
    // Guitar is written an octave above its sounding pitch; without the +12 the
    // lead sits far below the treble staff and the notation is a ledger-line
    // mess.  (Real-recording playback is primary, so the octave is cosmetic.)
    const midi = Math.max(...b.notes.map(n => n.realValue)) + 12;   // top note = lead line
    const startBeat = b.absolutePlaybackStart / TPQ;
    const durBeats = Math.max(0.125, b.playbackDuration / TPQ);
    if (Number.isFinite(midi) && Number.isFinite(startBeat)) melody.push({ midi, startBeat, durBeats });
  }
  if (melody.length < 16) return null;

  const mb0 = score.masterBars?.[0];
  const num = mb0?.timeSignatureNumerator || 4, den = mb0?.timeSignatureDenominator || 4;
  const fifths = mb0?.keySignature ?? 0;                            // -7..7
  const tonicPc = ((((fifths * 7) % 12) + 12) % 12);
  const tempo = Math.round(score.tempo) || 100;
  const beatsPerBar = (num * 4) / den;
  const totalBeats = Math.max(...melody.map(n => n.startBeat + n.durBeats));
  const barCount = Math.max(1, Math.round(totalBeats / beatsPerBar));
  return { key: { tonicPc, mode: "major" }, timeSig: [num, den], tempoBpm: tempo, barCount, melody };
}

function fetchSearchHtml(query) {
  return new Promise((resolve) => {
    https.get("https://www.youtube.com/results?search_query=" + encodeURIComponent(query),
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept-Language": "en-US,en;q=0.9" } }, (res) => {
        let d = ""; res.on("data", (c) => { d += c; if (d.length > 3e6) res.destroy(); });
        res.on("end", () => resolve(d));
      }).on("error", () => resolve(""));
  });
}

/** Parse up to 8 {videoId, title} results from a YouTube search page. */
function parseResults(html) {
  const out = []; const seen = new Set();
  // Each result is "videoId":"…","thumbnail":{…},…,"title":{"runs":[{"text":"…"
  // (videoId then, within a bounded gap, its title).
  const re = /"videoId":"([\w-]{11})"[\s\S]{0,2500}?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*?)"/g;
  let m;
  while ((m = re.exec(html)) && out.length < 8) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    const title = m[2].replace(/\\u0026/g, "&").replace(/\\"/g, '"').replace(/\\\//g, "/");
    out.push({ videoId: m[1], title });
  }
  return out;
}

const BAD = /cover|lesson|tutorial|backing track|karaoke|how to play|reaction|remix|guitar pro|tab\b|instrumental version|8d audio/i;
/** Score a result for being the genuine `artist` recording of `title`. */
function scoreMatch(r, artist, title) {
  const t = r.title.toLowerCase();
  const surname = artist.toLowerCase().split(" ").pop();
  const titleWords = title.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(w => w.length > 2);
  let s = 0;
  if (t.includes(artist.toLowerCase())) s += 3; else if (t.includes(surname)) s += 2;
  const hit = titleWords.filter(w => t.includes(w)).length;
  s += titleWords.length ? (hit / titleWords.length) * 4 : 0;
  if (BAD.test(t)) s -= 6;
  if (/official|topic|full album|remaster/i.test(t)) s += 1;
  return s;
}

/** Best-matching video id for an artist + title (or null). */
async function fetchBestVideo(artist, title) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const results = parseResults(await fetchSearchHtml(`${artist} ${title}`));
    if (results.length) {
      let best = results[0], bestScore = -Infinity;
      for (const r of results) { const sc = scoreMatch(r, artist, title); if (sc > bestScore) { bestScore = sc; best = r; } }
      // Require at least a weak title match, else treat as not found.
      return bestScore >= 2 ? best.videoId : null;
    }
    await new Promise(r => setTimeout(r, 800));   // throttled — back off and retry once
  }
  return null;
}

/** Resolve video ids sequentially, persisting to a disk cache so re-runs
 *  accumulate (YouTube throttles bulk server-side search, so a single run only
 *  resolves a handful — re-run a few times to fill the corpus). */
async function lookupAll(tunes) {
  const cacheFile = join(__dirname, ".cache", "blues-vids.json");
  let cache = {};
  try { cache = JSON.parse(readFileSync(cacheFile, "utf8")); } catch { /* no cache yet */ }
  const out = [];
  for (let i = 0; i < tunes.length; i++) {
    const key = `${tunes[i].artist}|${tunes[i].title}`;
    if (cache[key]) { out[i] = cache[key]; continue; }
    const v = await fetchBestVideo(tunes[i].artist, tunes[i].title);
    if (v) { cache[key] = v; try { writeFileSync(cacheFile, JSON.stringify(cache, null, 1)); } catch { /* */ } }
    out[i] = v;
    await new Promise(r => setTimeout(r, 350));
  }
  return out;
}

export async function build() {
  if (!existsSync(SRC1) && !existsSync(GT)) { console.log("Blues: no source archives in .cache."); return; }
  const flat = existsSync(SRC1) ? readdirSync(SRC1).filter(f => TAB_RE.test(f)) : [];
  const raw = [];
  for (const a of ARTISTS) {
    const cands = [];
    for (const f of flat) if (a.a1.some(m => f.toLowerCase().includes(m))) cands.push({ title: titleCase(f.split(" - ").slice(1).join(" - ") || f), bytes: readFileSync(join(SRC1, f)) });
    for (const z of a.zips) { const zp = join(GT, z); if (!existsSync(zp)) continue;
      try { for (const [k, b] of Object.entries(unzipSync(new Uint8Array(readFileSync(zp))))) if (TAB_RE.test(k)) cands.push({ title: titleCase(k.split("/").pop()), bytes: Buffer.from(b) }); } catch { /* */ } }
    const seen = new Set(); let kept = 0;
    for (const c of cands) {
      if (kept >= PER_ARTIST) break;
      if (!c.title || seen.has(dedupeKey(c.title))) continue;
      seen.add(dedupeKey(c.title));
      raw.push({ artist: a.name, ...c });
      kept++;
    }
    if (kept === 0) console.log(`  (none found for ${a.name})`);
  }

  console.log(`Blues: parsing ${raw.length} Guitar Pro solos…`);
  const items = [];
  for (const r of raw) {
    const parsed = gpToItem(r.bytes);
    if (!parsed) continue;
    items.push({ id: `blues-${items.length}`, source: "blues", genre: "Blues", style: r.artist, title: r.title, artist: r.artist, ...parsed, youtubeQuery: `${r.artist} ${r.title}` });
  }
  console.log(`  parsed ${items.length}; matching each to its recording on YouTube…`);
  const vids = await lookupAll(items);
  items.forEach((it, i) => { if (vids[i]) it.vid = vids[i]; });
  console.log(`  matched ${vids.filter(Boolean).length}/${items.length} recordings`);

  const curated = curate(items, { max: 300, minBars: 8 }).map(it => clipBars(it, 64));
  writeSource("blues", curated);
}

if (isMain(import.meta.url)) build().then(rebuildIndex).catch(e => { console.error(e); process.exit(1); });
