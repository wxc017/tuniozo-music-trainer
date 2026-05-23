// ── ETL: Weimar Jazz Database — jazz solos, melody + chords (SQLite) ─
// Source: jazzomat.hfm-weimar.de (wjazzd.db, ODbL).  456 expert solo
// transcriptions with onset/pitch/duration + chord changes per solo.
//
// Reads the SQLite DB with Node's built-in node:sqlite (no deps).  The DB
// is ~43 MB; it's downloaded once into the OS temp dir and cached there.

import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, writeFileSync, statSync } from "node:fs";
import { httpGet, makeChord, curate, writeSource, rebuildIndex, isMain } from "./common.mjs";

const DB_URL = "https://jazzomat.hfm-weimar.de/download/downloads/wjazzd.db";
const DB_PATH = join(tmpdir(), "wjazzd.db");
const LIMIT = Number(process.env.TX_LIMIT || 200);

async function ensureDb() {
  if (existsSync(DB_PATH) && statSync(DB_PATH).size > 1_000_000) {
    console.log(`  using cached ${DB_PATH} (${(statSync(DB_PATH).size / 1e6).toFixed(0)} MB)`);
    return;
  }
  console.log("  downloading wjazzd.db (~43 MB)…");
  const buf = await httpGet(DB_URL, { binary: true });
  writeFileSync(DB_PATH, buf);
  console.log(`  saved ${(buf.length / 1e6).toFixed(0)} MB → ${DB_PATH}`);
}

/** Weimar chord syntax → a symbol parseChordSymbol understands.
 *  Weimar: "-"=minor, "j"=maj7, "+"=aug, "o"=dim, "%"=half-dim, "sus". */
function weimarChordToSymbol(tok) {
  if (!tok || /^(NC|N\.?C\.?|=|\*|\.)$/i.test(tok.trim())) return null;
  let s = tok.trim();
  let bass = "";
  const sl = s.indexOf("/");
  if (sl >= 0) { bass = s.slice(sl); s = s.slice(0, sl); }
  const m = /^([A-G][b#]?)(.*)$/.exec(s);
  if (!m) return null;
  let q = m[2]
    .replace(/%7?/, "m7b5")
    .replace(/o7/, "dim7").replace(/o(?![a-z])/, "dim")
    .replace(/j7?/, "maj7")
    .replace(/\+/, "aug")
    .replace(/^-/, "m")
    .replace(/69/, "6add9")
    .replace(/sus$/, "sus4")
    .replace(/alt/, "7#9");
  return m[1] + q + bass;
}

function parseSignature(sig) {
  const m = /(\d+)\s*\/\s*(\d+)/.exec(String(sig || ""));
  return m ? [Number(m[1]), Number(m[2])] : [4, 4];
}
function parseKey(keyStr) {
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const m = /^([A-G])([b#]?)/.exec(String(keyStr || "C").trim());
  let pc = m ? PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) : 0;
  const mode = /min|m\b|-/.test(String(keyStr || "")) ? "minor" : "major";
  return { tonicPc: ((pc % 12) + 12) % 12, mode };
}

export async function build() {
  console.log("Weimar Jazz DB:");
  await ensureDb();
  const db = new DatabaseSync(DB_PATH, { readOnly: true });

  const solos = db.prepare(
    `SELECT melid, title, performer, key, signature, avgtempo FROM solo_info`
  ).all();
  console.log(`  ${solos.length} solos in DB; building up to ${LIMIT}…`);

  const noteStmt = db.prepare(`SELECT onset, pitch, duration FROM melody WHERE melid = ? ORDER BY onset`);
  const chordStmt = db.prepare(
    `SELECT s.value AS sym, m.onset AS onset
       FROM sections s JOIN melody m ON m.eventid = s.start
      WHERE s.melid = ? AND s.type = 'CHORD' ORDER BY m.onset`
  );

  const items = [];
  for (const solo of solos) {
    if (items.length >= LIMIT) break;
    const tempo = Number(solo.avgtempo) || 0;
    if (tempo < 40 || tempo > 320) continue;
    const bps = tempo / 60;                       // beats per second
    const notes = noteStmt.all(solo.melid);
    if (notes.length < 8) continue;
    const rawChords = chordStmt.all(solo.melid);
    // Rebase to the earliest event (note OR chord) so nothing is negative
    // when a chord sounds before the solo's first note.
    const firstChordOnset = rawChords.length ? Number(rawChords[0].onset) : Infinity;
    const onset0 = Math.min(Number(notes[0].onset), firstChordOnset);

    const melody = notes.map(n => ({
      midi: Number(n.pitch),
      startBeat: (Number(n.onset) - onset0) * bps,
      durBeats: Math.max(0.05, Number(n.duration) * bps),
    })).filter(n => n.midi > 0 && n.startBeat >= -1e-6);
    if (melody.length < 8) continue;

    const timeSig = parseSignature(solo.signature);
    const bpb = (timeSig[0] * 4) / timeSig[1];
    const totalBeats = Math.max(...melody.map(n => n.startBeat + n.durBeats));

    // Chords → consolidated, durations up to next change.
    const chordEv = [];
    for (const c of rawChords) {
      const sym = weimarChordToSymbol(c.sym);
      if (!sym) continue;
      const chord = makeChord(sym, (Number(c.onset) - onset0) * bps, 0);
      if (chord && (!chordEv.length || chordEv[chordEv.length - 1].sym !== chord.sym)) chordEv.push(chord);
    }
    for (let i = 0; i < chordEv.length; i++) {
      const end = i + 1 < chordEv.length ? chordEv[i + 1].startBeat : totalBeats;
      chordEv[i].durBeats = Math.max(0.5, end - chordEv[i].startBeat);
    }

    const title = (solo.title || `Solo ${solo.melid}`).trim();
    const performer = (solo.performer || "").trim();
    items.push({
      id: `weimar-${solo.melid}`,
      source: "weimar", genre: "Jazz",
      style: performer || undefined,
      title, artist: performer,
      key: parseKey(solo.key),
      timeSig, tempoBpm: Math.round(tempo),
      barCount: Math.max(1, Math.round(totalBeats / bpb)),
      melody,
      chords: chordEv.length ? chordEv : undefined,
      youtubeQuery: `${performer} ${title} solo`.trim(),
    });
  }
  db.close();
  console.log(`  built ${items.length} solos`);
  writeSource("weimar", curate(items, { max: 200, minBars: 8 }));
}

if (isMain(import.meta.url)) {
  build().then(rebuildIndex).catch(e => { console.error(e); process.exit(1); });
}
