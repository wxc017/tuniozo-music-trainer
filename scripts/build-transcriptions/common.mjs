// ── Transcriptions ETL — shared core ────────────────────────────────
//
// Offline pipeline that fetches the four source corpora, normalizes them
// into the TxItem schema (see src/lib/transcriptions/types.ts), curates a
// bundle-sized subset, and writes public/transcriptions/<source>.json +
// index.json.  The browser ships with that output and never touches the
// raw corpora.
//
// Run individual sources (`node thesession.mjs`) or all (`node build-all.mjs`).

import abcjs from "abcjs";
import { writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import https from "node:https";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = join(__dirname, "..", "..", "public", "transcriptions");
mkdirSync(OUT_DIR, { recursive: true });

export const SOURCE_GENRE = {
  thesession: "Irish Trad", essen: "Folk", weimar: "Jazz", cocopops: "Pop/Rock",
};

// ── HTTP (follows redirects, handles gzip) ──────────────────────────
export function httpGet(url, { binary = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "tx-etl", "Accept-Encoding": "identity" } }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        res.resume();
        return resolve(httpGet(res.headers.location, { binary }));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`${res.statusCode} ${url}`)); }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString("utf8")));
    });
    req.on("error", reject);
    req.setTimeout(60000, () => { req.destroy(new Error(`timeout ${url}`)); });
  });
}
export async function httpGetJson(url) { return JSON.parse(await httpGet(url)); }

// ── Meter / key parsing ─────────────────────────────────────────────
export function parseMeter(str) {
  if (!str) return [4, 4];
  const s = String(str).trim();
  if (s === "C") return [4, 4];
  if (s === "C|") return [2, 2];
  const m = /^(\d+)\s*\/\s*(\d+)/.exec(s);
  return m ? [Number(m[1]), Number(m[2])] : [4, 4];
}

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];
const MODE_OFFSET = {
  major: 0, ionian: 0, dorian: -2, phrygian: -4, lydian: -5,
  mixolydian: -7, mixo: -7, aeolian: -3, minor: -3, min: -3, locrian: -11,
};

/** Parse an ABC/Session mode string ("Gmajor", "Edorian", "Bm") into a
 *  tonic pitch-class, mode name, and the key-signature accidental letters. */
export function modeInfo(modeStr) {
  const s = String(modeStr || "C").trim();
  const m = /^([A-Ga-g])([#b♯♭]?)\s*(.*)$/.exec(s);
  let tonicPc = 0, modeName = "major";
  if (m) {
    tonicPc = LETTER_PC[m[1].toUpperCase()];
    if (m[2] === "#" || m[2] === "♯") tonicPc += 1;
    if (m[2] === "b" || m[2] === "♭") tonicPc -= 1;
    const tail = m[3].toLowerCase();
    if (tail.startsWith("dor")) modeName = "dorian";
    else if (tail.startsWith("phr")) modeName = "phrygian";
    else if (tail.startsWith("lyd")) modeName = "lydian";
    else if (tail.startsWith("mix")) modeName = "mixolydian";
    else if (tail.startsWith("aeo") || tail.startsWith("min") || tail === "m") modeName = "minor";
    else if (tail.startsWith("loc")) modeName = "locrian";
    else modeName = "major";
  }
  tonicPc = ((tonicPc % 12) + 12) % 12;
  const parentPc = (((tonicPc + (MODE_OFFSET[modeName] ?? 0)) % 12) + 12) % 12;
  let fifths = (parentPc * 7) % 12;       // 0..11
  if (fifths > 6) fifths -= 12;            // → −5..6 (negative = flats)
  const sharpLetters = new Set(), flatLetters = new Set();
  if (fifths > 0) for (let i = 0; i < fifths; i++) sharpLetters.add(SHARP_ORDER[i]);
  else for (let i = 0; i < -fifths; i++) flatLetters.add(FLAT_ORDER[i]);
  return { tonicPc, modeName, sharpLetters, flatLetters };
}

// ── ABC → TxItem (via abcjs.parseOnly) ──────────────────────────────
// abcjs note pitch: integer diatonic steps from middle C (C4 = 0).
function abcPitchToMidi(pitch) {
  const letterIdx = ((pitch % 7) + 7) % 7;
  const octaveOffset = Math.floor(pitch / 7);
  const semis = [0, 2, 4, 5, 7, 9, 11][letterIdx];
  return 60 + 12 * octaveOffset + semis;
}
const ACC_DELTA = { sharp: 1, flat: -1, natural: 0, dblsharp: 2, dblflat: -2, quartersharp: 1, quarterflat: -1 };
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];

/** Convert one parsed abcjs tune into a TxItem, or null if unusable. */
function tuneToItem(tune, { source, idBase, idx, meterOverride, modeOverride, titleOverride, tempoBpm, style }) {
  const staffLines = tune.lines.filter(l => l.staff);
  if (!staffLines.length) return null;

  const meterEl = staffLines[0].staff[0].meter;
  let timeSig = meterOverride ?? [4, 4];
  if (!meterOverride && meterEl?.value?.[0]) timeSig = [Number(meterEl.value[0].num), Number(meterEl.value[0].den)];
  const beatsPerBar = (timeSig[0] * 4) / timeSig[1];

  let keyStr = modeOverride;
  if (!keyStr) {
    const k = staffLines[0].staff[0].key;
    if (k) keyStr = `${k.root || "C"}${k.acc === "sharp" ? "#" : k.acc === "flat" ? "b" : ""}${k.mode || ""}`;
  }
  const { tonicPc, modeName, sharpLetters, flatLetters } = modeInfo(keyStr || "C");

  // Flatten every staff line's first voice into one melody stream.
  const melody = [];
  let beat = 0;                       // running position, quarter-note beats
  const barAccidentals = {};          // letter → delta, reset each barline
  for (const line of staffLines) {
    const voice = line.staff[0].voices?.[0];
    if (!voice) continue;
    for (const el of voice) {
      if (el.el_type === "bar") { for (const k of Object.keys(barAccidentals)) delete barAccidentals[k]; continue; }
      if (el.el_type !== "note") continue;
      const durBeats = (el.duration || 0) * 4;     // whole-note frac → quarter beats
      if (durBeats <= 0) continue;
      if (el.rest || !el.pitches?.length) { beat += durBeats; continue; }
      // Use the lowest pitch as the melody note (handles incidental chords).
      const p = el.pitches.reduce((lo, q) => (q.pitch < lo.pitch ? q : lo), el.pitches[0]);
      let midi = abcPitchToMidi(p.pitch);
      const letter = LETTERS[((p.pitch % 7) + 7) % 7];
      if (p.accidental && ACC_DELTA[p.accidental] != null) {
        midi += ACC_DELTA[p.accidental]; barAccidentals[letter] = ACC_DELTA[p.accidental];
      } else if (barAccidentals[letter] != null) {
        midi += barAccidentals[letter];
      } else if (sharpLetters.has(letter)) midi += 1;
      else if (flatLetters.has(letter)) midi -= 1;
      melody.push({ midi, startBeat: beat, durBeats });
      beat += durBeats;
    }
  }
  if (melody.length < 6) return null;

  // ── Anacrusis: shift so the first downbeat lands on beat 0. ────────
  // First barline position = pickup length; if it's a partial bar, drop
  // those notes and rebase.
  const firstBarBeat = firstBarlineBeat(staffLines);
  if (firstBarBeat != null && firstBarBeat > 1e-6 && firstBarBeat < beatsPerBar - 1e-6) {
    for (const n of melody) n.startBeat -= firstBarBeat;
    const kept = melody.filter(n => n.startBeat > -1e-6);
    melody.length = 0; melody.push(...kept);
  }

  const totalBeats = melody.length ? Math.max(...melody.map(n => n.startBeat + n.durBeats)) : 0;
  const barCount = Math.max(1, Math.round(totalBeats / beatsPerBar));

  const title = (titleOverride || tune.metaText?.title || `${source} ${idx}`).trim();
  const artist = source === "thesession" ? "Traditional" : undefined;
  return {
    id: `${idBase}-${idx}`,
    source,
    genre: SOURCE_GENRE[source],
    style,
    title,
    artist,
    key: { tonicPc, mode: modeName },
    timeSig,
    tempoBpm: tempoBpm ?? 100,
    barCount,
    melody,
    youtubeQuery: `${title}${source === "thesession" ? " irish traditional" : source === "essen" ? " folk song" : ""}`.trim(),
  };
}

function firstBarlineBeat(staffLines) {
  let beat = 0;
  for (const line of staffLines) {
    const voice = line.staff[0].voices?.[0];
    if (!voice) continue;
    for (const el of voice) {
      if (el.el_type === "bar") return beat;
      if (el.el_type === "note") beat += (el.duration || 0) * 4;
    }
  }
  return null;
}

/** Parse ABC text (one or many tunes) into TxItems. */
export function abcToItems(abcText, opts) {
  let tunes;
  try { tunes = abcjs.parseOnly(abcText); } catch { return []; }
  const out = [];
  tunes.forEach((tune, i) => {
    try {
      const item = tuneToItem(tune, { ...opts, idx: opts.idx != null ? opts.idx : i });
      if (item) out.push(item);
    } catch { /* skip malformed tune */ }
  });
  return out;
}

// ── Chord-symbol parser (JS port of src/lib/transcriptions/chordSymbols.ts) ──
const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function parseRoot(s) {
  const m = /^([A-Ga-g])([#b♯♭]*)/.exec(s);
  if (!m) return null;
  let pc = NOTE_PC[m[1].toUpperCase()];
  for (const ch of m[2]) { if (ch === "#" || ch === "♯") pc += 1; else if (ch === "b" || ch === "♭") pc -= 1; }
  return [((pc % 12) + 12) % 12, m[0].length];
}
const BASE_TRIAD = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7] };
export function parseChordSymbol(raw) {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[Δ∆]/g, "maj7").replace(/[øØ]/g, "m7b5").replace(/[°ο]/g, "dim").replace(/−/g, "-");
  let bassPc;
  const slash = s.lastIndexOf("/");
  if (slash >= 0) { const b = parseRoot(s.slice(slash + 1)); if (b) { bassPc = b[0]; s = s.slice(0, slash); } }
  const root = parseRoot(s);
  if (!root) return null;
  const [rootPc, ri] = root;
  let body = s.slice(ri);
  const adds = [];
  body = body.replace(/add([b#♭♯])?(\d+)/g, (_, acc, deg) => { adds.push({ deg: +deg, accent: acc === "b" || acc === "♭" ? -1 : acc === "#" || acc === "♯" ? 1 : 0 }); return ""; });
  let sus = null;
  if (/sus2/.test(body)) { sus = 2; body = body.replace(/sus2/g, ""); }
  else if (/sus4?/.test(body)) { sus = 4; body = body.replace(/sus4?/g, ""); }
  let base = "maj";
  if (/^\+/.test(body)) { base = "aug"; body = body.replace(/^\+/, ""); }
  else if (/^dim/.test(body)) { base = "dim"; body = body.replace(/^dim/, ""); }
  else if (/^aug/.test(body)) { base = "aug"; body = body.replace(/^aug/, ""); }
  else if (/^(maj|Maj|M)(?=7|9|11|13|6|$)/.test(body)) { base = "maj"; body = body.replace(/^(maj|Maj|M)/, "majMARK"); }
  else if (/^(min|m|-)/.test(body)) { base = "min"; body = body.replace(/^(min|m|-)/, ""); }
  if (sus) base = sus === 2 ? "sus2" : "sus4";
  const ivs = new Set(BASE_TRIAD[base]);
  const isMaj7 = /majMARK|maj7|M7/.test(body) || /maj7|M7/.test(s.slice(ri));
  body = body.replace(/majMARK/g, "");
  const ext = /(?<![b#♭♯])13/.test(body) ? 13 : /(?<![b#♭♯])11/.test(body) ? 11 : /(?<![b#♭♯])9/.test(body) ? 9 : /(?<![b#♭♯])7/.test(body) ? 7 : /(?<![b#♭♯])6/.test(body) ? 6 : 0;
  if (ext >= 7) { if (isMaj7) ivs.add(11); else if (base === "dim") ivs.add(9); else ivs.add(10); }
  if (ext === 6) ivs.add(9);
  if (ext >= 9) ivs.add(14);
  if (ext >= 11) ivs.add(17);
  if (ext >= 13) ivs.add(21);
  if (/[b♭]5/.test(body)) { ivs.delete(7); ivs.add(6); }
  if (/[#♯]5/.test(body)) { ivs.delete(7); ivs.add(8); }
  if (/[b♭]9/.test(body)) ivs.add(13);
  if (/[#♯]9/.test(body)) ivs.add(15);
  if (/[#♯]11/.test(body)) ivs.add(18);
  if (/[b♭]13/.test(body)) ivs.add(20);
  const ADD_MAP = { 2: 2, 4: 5, 6: 9, 9: 14, 11: 17, 13: 21 };
  for (const a of adds) if (ADD_MAP[a.deg] != null) ivs.add(ADD_MAP[a.deg] + a.accent);
  return { rootPc, intervals: [...ivs].sort((a, b) => a - b), bassPc, quality: base };
}

/** Build a TxChord from a chord symbol at a beat position. */
export function makeChord(sym, startBeat, durBeats) {
  const p = parseChordSymbol(sym);
  if (!p) return null;
  return { sym, rootPc: p.rootPc, intervals: p.intervals, bassPc: p.bassPc, startBeat, durBeats };
}

// ── Curation + output ───────────────────────────────────────────────
function shuffle(arr, seed = 42) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Keep at most `max` items, requiring `minBars`, de-duplicating titles. */
export function curate(items, { max = 400, minBars = 8 } = {}) {
  const seen = new Set();
  const ok = items.filter(it => {
    if (it.barCount < minBars) return false;
    const key = it.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return shuffle(ok).slice(0, max);
}

export function writeSource(source, items) {
  const file = join(OUT_DIR, `${source}.json`);
  writeFileSync(file, JSON.stringify(items));
  console.log(`  wrote ${items.length} → public/transcriptions/${source}.json`);
}

/** Rebuild index.json from whatever per-source files exist. */
export function rebuildIndex() {
  const counts = { thesession: 0, essen: 0, weimar: 0, cocopops: 0 };
  const indexItems = [];
  for (const source of Object.keys(counts)) {
    const file = join(OUT_DIR, `${source}.json`);
    if (!existsSync(file)) continue;
    const items = JSON.parse(readFileSync(file, "utf8"));
    counts[source] = items.length;
    for (const it of items) {
      indexItems.push({
        id: it.id, source: it.source, genre: it.genre, style: it.style,
        title: it.title, artist: it.artist, barCount: it.barCount,
        hasMelody: !!(it.melody && it.melody.length), hasChords: !!(it.chords && it.chords.length),
      });
    }
  }
  const index = { generatedAt: new Date().toISOString(), counts, items: indexItems };
  writeFileSync(join(OUT_DIR, "index.json"), JSON.stringify(index));
  console.log(`  index.json: ${indexItems.length} items`, counts);
}

export { readdirSync };

/** True when a script file is being run directly (not imported). */
export function isMain(importMetaUrl) {
  return process.argv[1] && fileURLToPath(importMetaUrl) === process.argv[1];
}
