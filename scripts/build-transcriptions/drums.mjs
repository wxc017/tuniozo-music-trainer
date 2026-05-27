// ── Drums corpus: real recordings, transcribe-by-ear (audio-only) ─────────
//
// Counterpart to the Blues corpus, for the (drum) Tonal/Rhythmic Audiation
// work.  A curated roster of ~35 great drummers is downloaded as full albums
// off Soulseek (see drums-albums.csv + sldl) into public/drums/lib/.  This ETL
// attributes each file to its DRUMMER via the album tag (the CSV maps
// album → drummer), runs the onset/tempo analyzer, and emits an audio-only
// source ("drums") whose `style` is the drummer — so the Styles filter
// organises the corpus by player, exactly like Blues Guitar/Vocal.
//
// Like blues, this is AUDIO-ONLY: no melody/notation is emitted — you
// transcribe the groove/fill by ear.  Per-track drummer credits don't exist
// in tags, so albums that two roster drummers both played on (e.g. Steely
// Dan's "Aja" — Purdie + Gadd) are SKIPPED rather than mislabeled.
//
//   node scripts/build-transcriptions/drums.mjs

import { writeFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { execFile } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeSource, rebuildIndex, isMain } from "./common.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB_DIR = join(__dirname, "..", "..", "public", "drums", "lib");
const ONSETS = join(__dirname, "onsets.py");
const CSV = join(__dirname, "drums-albums.csv");
const PYTHON = process.env.PYTHON || "python";

const AUDIO_EXT = /\.(flac|mp3|m4a|ogg|opus|wav|aac)$/i;
const encPath = (p) => p.split(/[\\/]/).map(encodeURIComponent).join("/");
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ── album → drummer map, from drums-albums.csv ────────────────────────
// Key is the normalized album title.  A normalized album maps to a SINGLE
// drummer; if two roster entries share an album (different drummers on the
// same record) we mark it ambiguous and drop those files (can't attribute by
// tag).  We also remember the album credit/Artist for a secondary match.
function parseCsv(text) {
  // simple quoted-CSV: fields are "..."-wrapped, comma-separated, 3 columns.
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = [...line.matchAll(/"((?:[^"]|"")*)"/g)].map(x => x[1].replace(/""/g, '"'));
    if (m.length >= 3) rows.push({ drummer: m[0], artist: m[1], album: m[2] });
  }
  return rows.slice(1).length && rows[0].drummer === "Drummer" ? rows.slice(1) : rows;
}

function buildAlbumMap() {
  const rows = parseCsv(readFileSync(CSV, "utf8"));
  const byAlbum = new Map();   // normAlbum -> { drummer, artist, ambiguous }
  for (const r of rows) {
    const k = norm(r.album);
    if (!k) continue;
    const prev = byAlbum.get(k);
    if (prev && prev.drummer !== r.drummer) prev.ambiguous = true;
    else if (!prev) byAlbum.set(k, { drummer: r.drummer, artist: r.artist, ambiguous: false });
  }
  return byAlbum;
}

/** Resolve a file's drummer from its album tag (then the file path as a
 *  fallback).  Returns the drummer name, or null when unattributable. */
function resolveDrummer(albumTag, path, byAlbum) {
  const candidates = [];
  const aTag = norm(albumTag);
  if (aTag) {
    for (const [k, v] of byAlbum) {
      if (k === aTag || aTag.includes(k) || k.includes(aTag)) candidates.push(v);
    }
  }
  if (!candidates.length) {
    const hay = norm(path);
    for (const [k, v] of byAlbum) if (hay.includes(k)) candidates.push(v);
  }
  if (!candidates.length) return null;
  if (candidates.some(c => c.ambiguous)) return null;          // two drummers, same album
  const set = new Set(candidates.map(c => c.drummer));
  return set.size === 1 ? [...set][0] : null;                  // distinct albums, same drummer is fine
}

// ── ffprobe tags (artist/title/album/duration) ────────────────────────
function ffTags(file) {
  return new Promise((resolve) => {
    execFile("ffprobe", ["-v", "quiet", "-show_entries", "format=duration:format_tags=artist,album_artist,album,title", "-of", "json", file],
      { encoding: "utf8", maxBuffer: 1 << 24 }, (err, out) => {
        if (err) return resolve({ dur: 0, album: "", title: "" });
        try { const fmt = JSON.parse(out).format || {}; const t = fmt.tags || {}; resolve({ dur: parseFloat(fmt.duration) || 0, album: t.album || "", title: t.title || "" }); }
        catch { resolve({ dur: 0, album: "", title: "" }); }
      });
  });
}

function analyzeOnsets(file) {
  return new Promise((resolve) => {
    execFile(PYTHON, [ONSETS, file], { encoding: "utf8", maxBuffer: 1 << 26 }, (err, stdout) => {
      if (err) return resolve(null);
      try { resolve(JSON.parse(stdout)); } catch { resolve(null); }
    });
  });
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; results[k] = await fn(items[k], k); }
  }));
  return results;
}

function walkAudio(dir, base = dir) {
  const out = [];
  let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkAudio(p, base));
    else if (e.isFile() && AUDIO_EXT.test(e.name) && !/\.incomplete$/i.test(e.name)) out.push(p);
  }
  return out;
}

export async function buildFromLibrary() {
  if (!existsSync(LIB_DIR)) { console.error(`no library at ${LIB_DIR}`); return; }
  const byAlbum = buildAlbumMap();
  const files = walkAudio(LIB_DIR);
  console.log(`Drums: analysing ${files.length} audio files (${byAlbum.size} albums mapped)…`);
  let done = 0;
  const raw = await pool(files, 8, async (abs) => {
    const tags = await ffTags(abs);
    if (++done % 200 === 0) console.log(`  …${done}/${files.length}`);
    if (tags.dur < 45) return null;                        // intros/skits/interludes
    const rel = "lib/" + abs.slice(LIB_DIR.length + 1).replace(/\\/g, "/");
    const drummer = resolveDrummer(tags.album, rel, byAlbum);
    if (!drummer) return null;                              // unattributable / ambiguous
    const an = await analyzeOnsets(abs);
    if (!an || (an.onsets?.length ?? 0) < 4) return null;  // too sparse / silent
    const title = (tags.title || rel.split("/").pop().replace(AUDIO_EXT, "")).trim();
    return { drummer, title, rel, onsets: an.onsets, bpm: an.bpm || 100 };
  });

  const items = [];
  for (const r of raw) {
    if (!r) continue;
    items.push({
      id: `drums-${items.length}`, source: "drums", genre: "Drums",
      style: r.drummer, title: r.title, artist: r.drummer,
      key: { tonicPc: 0, mode: "major" },
      timeSig: [4, 4], tempoBpm: r.bpm, barCount: 1,
      audio: encPath(r.rel), onsets: r.onsets,
      youtubeQuery: `${r.drummer} ${r.title}`,
    });
  }
  const byPlayer = {};
  for (const it of items) byPlayer[it.style] = (byPlayer[it.style] || 0) + 1;
  console.log(`Drums: built ${items.length} tracks across ${Object.keys(byPlayer).length} drummers`);
  console.log(byPlayer);
  writeSource("drums", items);
}

if (isMain(import.meta.url)) buildFromLibrary().then(rebuildIndex).catch(e => { console.error(e); process.exit(1); });
