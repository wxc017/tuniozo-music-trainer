// ── Weimar Jazz Database — jazz solos, melody + chords (SQLite) ─────
//
// Source: the Jazzomat WJazzD release (wjazzd.db, ODbL). 456 expert solo
// transcriptions. Read with Node's built-in node:sqlite (no deps).
//
// Timing comes from the melody table's metric columns (bar/beat/tatum/
// division) rather than raw seconds, so notes land on a clean quarter-beat
// grid and notate readably. Chords come from the `beats` table (one row
// per beat, WJazzD chord shorthand). The DB is cached under .cache/.

import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, writeFileSync, statSync, mkdirSync, copyFileSync } from "node:fs";
import { httpGet, makeChord, curate, writeSource, rebuildIndex, isMain } from "./common.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE = join(__dirname, ".cache");
const DB_PATH = join(CACHE, "wjazzd.db");
// Primary: a stable GitHub blob; the Jazzomat site is a fallback.
const DB_URLS = [
  "https://raw.githubusercontent.com/sebsilas/WJD/master/data-raw/wjazzd.db",
  "https://jazzomat.hfm-weimar.de/download/downloads/wjazzd.db",
];
const LIMIT = Number(process.env.TX_LIMIT || 300);

async function ensureDb() {
  mkdirSync(CACHE, { recursive: true });
  if (existsSync(DB_PATH) && statSync(DB_PATH).size > 1_000_000) {
    console.log(`  using cached ${DB_PATH} (${(statSync(DB_PATH).size / 1e6).toFixed(0)} MB)`);
    return;
  }
  const tmpCopy = join(tmpdir(), "wjazzd.db");
  if (existsSync(tmpCopy) && statSync(tmpCopy).size > 1_000_000) { copyFileSync(tmpCopy, DB_PATH); return; }
  for (const url of DB_URLS) {
    try {
      console.log(`  downloading wjazzd.db (~43 MB) from ${url}…`);
      const buf = await httpGet(url, { binary: true });
      writeFileSync(DB_PATH, buf);
      console.log(`  saved ${(buf.length / 1e6).toFixed(0)} MB`);
      return;
    } catch (e) { console.warn(`   ${e.message}`); }
  }
  throw new Error("could not download wjazzd.db");
}

// WJazzD chord shorthand → symbol parseChordSymbol understands.
// "-"=minor, "j"=maj7, "o"=dim, "%"=half-dim, "79b"=7b9, "79#"=7#9, "alt".
function weimarChordToSymbol(tok) {
  if (!tok || /^(NC|N\.?C\.?|=|\*|\.)?$/i.test(tok.trim())) return null;
  let s = tok.trim();
  let bass = "";
  const sl = s.indexOf("/");
  if (sl >= 0) { bass = s.slice(sl); s = s.slice(0, sl); }
  const m = /^([A-G][b#]?)(.*)$/.exec(s);
  if (!m) return null;
  const q = m[2]
    .replace(/79b/g, "7b9").replace(/79#/g, "7#9")
    .replace(/9b/g, "b9").replace(/9#/g, "#9")
    .replace(/%7?/g, "m7b5")
    .replace(/o7/g, "dim7").replace(/o(?![a-z])/g, "dim")
    .replace(/j7?/g, "maj7")
    .replace(/\+/g, "aug")
    .replace(/^-/, "m")
    .replace(/69/g, "6add9")
    .replace(/sus$/g, "sus4")
    .replace(/alt/g, "7#9");
  return m[1] + q + bass;
}

const KEY_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** WJazzD key ("Bb-maj", "C-min", "D-dor") — "-" is a separator, not minor. */
function parseKey(keyStr) {
  const m = /^([A-G])([b#]?)-?([a-z]*)/i.exec(String(keyStr || "C").trim());
  if (!m) return { tonicPc: 0, mode: "major" };
  const pc = KEY_PC[m[1].toUpperCase()] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  const t = (m[3] || "maj").toLowerCase();
  const mode = t.startsWith("min") ? "minor" : t.startsWith("dor") ? "dorian"
    : t.startsWith("phr") ? "phrygian" : t.startsWith("lyd") ? "lydian"
    : t.startsWith("mix") ? "mixolydian" : "major";
  return { tonicPc: ((pc % 12) + 12) % 12, mode };
}

function parseSignature(sig) {
  const m = /(\d+)\s*\/\s*(\d+)/.exec(String(sig || "4/4"));
  return m ? [Number(m[1]), Number(m[2])] : [4, 4];
}

export async function build() {
  console.log("Weimar Jazz DB:");
  await ensureDb();
  const db = new DatabaseSync(DB_PATH, { readOnly: true });

  const solos = db.prepare(
    `SELECT melid, title, performer, key, signature, avgtempo, style, rhythmfeel FROM solo_info`
  ).all();
  console.log(`  ${solos.length} solos; building up to ${LIMIT}…`);

  const melStmt = db.prepare(
    `SELECT pitch, bar, beat, tatum, division, duration, beatdur FROM melody WHERE melid = ? ORDER BY eventid`
  );
  const beatStmt = db.prepare(`SELECT bar, beat, chord FROM beats WHERE melid = ? ORDER BY beatid`);

  const items = [];
  for (const s of solos) {
    if (items.length >= LIMIT) break;
    const [num, den] = parseSignature(s.signature);
    const q = 4 / den;                 // den-beat → quarter-beats
    const bpb = num * q;

    // ── Melody (metric grid) ───────────────────────────────────────
    const rows = melStmt.all(s.melid);
    if (rows.length < 8) continue;
    const rawMel = [];
    for (const r of rows) {
      if (r.pitch == null || r.bar == null) continue;
      const div = r.division && r.division > 0 ? r.division : 1;
      const frac = r.tatum != null && div > 1 ? (r.tatum - 1) / div : 0;
      const startBeat = (r.bar * num + (r.beat - 1) + frac) * q;
      const durBeats = r.beatdur > 0 ? Math.max(0.125, (r.duration / r.beatdur) * q) : 0.5;
      rawMel.push({ midi: r.pitch, startBeat, durBeats });
    }
    if (rawMel.length < 8) continue;

    // ── Chords (consolidate consecutive duplicates) ────────────────
    const rawChords = [];
    let lastSym = null;
    for (const b of beatStmt.all(s.melid)) {
      const sym = weimarChordToSymbol(b.chord);
      if (!sym || b.bar == null) continue;
      if (sym === lastSym) continue;
      const c = makeChord(sym, (b.bar * num + (b.beat - 1)) * q, 0);
      if (c) { rawChords.push(c); lastSym = sym; }
    }

    // ── Rebase to first content bar (drop leading pickup/empty) ────
    const minBeat = Math.min(rawMel[0].startBeat, rawChords.length ? rawChords[0].startBeat : Infinity);
    const offset = Number.isFinite(minBeat) ? Math.floor(minBeat / bpb) * bpb : 0;
    for (const n of rawMel) n.startBeat -= offset;
    for (const c of rawChords) c.startBeat -= offset;
    const melody = rawMel.filter(n => n.startBeat > -1e-6);
    const chords = rawChords.filter(c => c.startBeat > -1e-6);
    if (melody.length < 8) continue;

    const totalBeats = Math.max(...melody.map(n => n.startBeat + n.durBeats));
    for (let i = 0; i < chords.length; i++) {
      const end = i + 1 < chords.length ? chords[i + 1].startBeat : totalBeats;
      chords[i].durBeats = Math.max(0.5, end - chords[i].startBeat);
    }

    const title = (s.title || `Solo ${s.melid}`).trim();
    const performer = (s.performer || "").trim();
    const style = (s.style || s.rhythmfeel || "").trim();
    items.push({
      id: `weimar-${s.melid}`,
      source: "weimar", genre: "Jazz",
      style: style ? style[0] + style.slice(1).toLowerCase() : undefined,
      title, artist: performer,
      key: parseKey(s.key),
      timeSig: [num, den],
      tempoBpm: s.avgtempo > 30 && s.avgtempo < 400 ? Math.round(s.avgtempo) : 160,
      barCount: Math.max(1, Math.round(totalBeats / bpb)),
      melody,
      chords: chords.length ? chords : undefined,
      youtubeQuery: `${performer} ${title}`.trim(),
    });
  }
  db.close();
  console.log(`  built ${items.length} solos`);
  writeSource("weimar", curate(items, { max: 250, minBars: 8 }));
}

if (isMain(import.meta.url)) {
  build().then(rebuildIndex).catch(e => { console.error(e); process.exit(1); });
}
