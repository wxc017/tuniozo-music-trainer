// ── EWLD / OpenEWLD jazz-standard lead sheets (MusicXML) ────────────
//
// Source: the Enhanced Wikifonia Leadsheet Dataset.  The FULL set (5000+
// lead sheets, incl. the copyrighted Real-Book canon) is access-restricted
// on Zenodo (https://zenodo.org/records/1476555) — request access there,
// download EWLD.zip, and drop it at scripts/build-transcriptions/.cache/
// ewld-full.zip and this builder will ingest all of it.  Otherwise it falls
// back to OpenEWLD (https://github.com/00sapo/OpenEWLD): the 502 lead sheets
// whose underlying compositions are PUBLIC DOMAIN — same .mxl format, so the
// exact same parser handles both.
//
// COPYRIGHT NOTE: the full EWLD's compositions are under copyright; treat the
// generated corpus as personal/educational material, not for redistribution.
// OpenEWLD's are public domain and safe to ship.
//
// Each .mxl is a zipped MusicXML lead sheet (single melody voice + chord
// symbols).  We parse melody notes, chord changes, key, metre and tempo into
// the shared TxItem schema.

import { unzipSync } from "fflate";
import { DOMParser } from "@xmldom/xmldom";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  httpGet, parseChordSymbol, consolidateChords, curate, clipBars,
  writeSource, rebuildIndex, isMain, SOURCE_GENRE,
} from "./common.mjs";

const TREE_API = "https://api.github.com/repos/00sapo/OpenEWLD/git/trees/master?recursive=1";
const RAW = "https://raw.githubusercontent.com/00sapo/OpenEWLD/master/";
const CACHE_FULL = join(import.meta.dirname ?? new URL(".", import.meta.url).pathname, ".cache", "ewld-full.zip");

const STEP_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// MusicXML <kind> value → chord-symbol suffix understood by parseChordSymbol.
const KIND_SUFFIX = {
  "major": "", "minor": "m", "augmented": "aug", "diminished": "dim",
  "dominant": "7", "major-seventh": "maj7", "minor-seventh": "m7",
  "diminished-seventh": "dim7", "augmented-seventh": "aug7", "half-diminished": "m7b5",
  "major-minor": "mMaj7", "minor-major": "mMaj7",
  "major-sixth": "6", "minor-sixth": "m6",
  "dominant-ninth": "9", "major-ninth": "maj9", "minor-ninth": "m9",
  "dominant-11th": "11", "dominant-13th": "13", "major-13th": "maj13", "minor-11th": "m11",
  "suspended-second": "sus2", "suspended-fourth": "sus4",
  "power": "5", "pedal": "", "other": "",
};

const txt = (el, tag) => el?.getElementsByTagName(tag)?.[0]?.textContent?.trim() ?? null;
const acc = (n) => (n > 0 ? "#".repeat(n) : n < 0 ? "b".repeat(-n) : "");
// xmldom NodeLists are array-LIKE but not spread-iterable in 0.7 — convert by index.
const toArr = (nl) => { const a = []; for (let i = 0; i < (nl?.length ?? 0); i++) a.push(nl[i]); return a; };

/** Build a chord symbol string from a MusicXML <harmony> element. */
function harmonyToSym(h) {
  const root = h.getElementsByTagName("root")[0];
  if (!root) return null;                       // (function-only/N.C. harmony)
  const step = txt(root, "root-step");
  if (!step) return null;
  const alter = Number(txt(root, "root-alter") || 0);
  const kindEl = h.getElementsByTagName("kind")[0];
  const kindVal = kindEl?.textContent?.trim() || "major";
  let suffix = KIND_SUFFIX[kindVal];
  if (suffix == null) suffix = kindEl?.getAttribute("text")?.trim() || "";  // fall back to the printed text
  let sym = step + acc(alter) + suffix;
  const bass = h.getElementsByTagName("bass")[0];
  if (bass) {
    const bstep = txt(bass, "bass-step");
    if (bstep) sym += "/" + bstep + acc(Number(txt(bass, "bass-alter") || 0));
  }
  return sym;
}

/** Parse one MusicXML score string into TxItem fields, or null if unusable. */
export function parseLeadSheet(xml, { id, title, artist }) {
  const doc = new DOMParser({ errorHandler: { warning() {}, error() {}, fatalError() {} } }).parseFromString(xml, "text/xml");
  const measures = toArr(doc.getElementsByTagName("measure"));
  if (!measures.length) return null;

  let divisions = 1, timeSig = null, fifths = null, mode = "major", tempo = 0;
  const melody = [];
  const chordEvents = [];
  let beat = 0;
  let pickup = 0;

  measures.forEach((measure, mi) => {
    const measureStartBeat = beat;
    for (const node of toArr(measure.childNodes)) {
      const tag = node.nodeName;
      if (tag === "attributes") {
        const d = txt(node, "divisions"); if (d) divisions = Number(d) || divisions;
        if (fifths == null) {
          const f = txt(node, "fifths"); if (f != null) fifths = Number(f);
          const m = txt(node, "mode"); if (m) mode = m.toLowerCase();
        }
        if (!timeSig) {
          const b = txt(node, "beats"), bt = txt(node, "beat-type");
          if (b && bt) timeSig = [Number(b), Number(bt)];
        }
      } else if (tag === "direction") {
        const sound = node.getElementsByTagName("sound")[0];
        const t = sound?.getAttribute("tempo");
        if (t && !tempo) tempo = Math.round(Number(t));
      } else if (tag === "sound") {
        const t = node.getAttribute("tempo"); if (t && !tempo) tempo = Math.round(Number(t));
      } else if (tag === "harmony") {
        const sym = harmonyToSym(node);
        if (sym) chordEvents.push({ sym, startBeat: beat });
      } else if (tag === "note") {
        if (node.getElementsByTagName("grace").length) continue;   // grace notes carry no duration
        const dur = Number(txt(node, "duration") || 0);
        const db = divisions ? dur / divisions : 0;
        const isChord = node.getElementsByTagName("chord").length > 0;
        const isRest = node.getElementsByTagName("rest").length > 0;
        if (isChord) continue;                                     // stacked harmony note: not the melody, no time advance
        if (!isRest) {
          const pitch = node.getElementsByTagName("pitch")[0];
          if (pitch) {
            const step = txt(pitch, "step");
            const octave = Number(txt(pitch, "octave"));
            const alter = Number(txt(pitch, "alter") || 0);
            if (step in STEP_PC && Number.isFinite(octave) && db > 0) {
              melody.push({ midi: 12 * (octave + 1) + STEP_PC[step] + alter, startBeat: beat, durBeats: db });
            }
          }
        }
        beat += db;
      } else if (tag === "backup") {
        beat -= Number(txt(node, "duration") || 0) / divisions;
      } else if (tag === "forward") {
        beat += Number(txt(node, "duration") || 0) / divisions;
      }
    }
    // An implicit first measure is an anacrusis; remember its length to rebase.
    if (mi === 0 && measure.getAttribute("implicit") === "yes") pickup = beat - measureStartBeat;
  });

  if (melody.length < 6 || !timeSig) return null;
  const beatsPerBar = (timeSig[0] * 4) / timeSig[1];

  // Drop the pickup so the first downbeat is beat 0 (matches the ABC importer).
  if (pickup > 1e-6 && pickup < beatsPerBar - 1e-6) {
    for (const n of melody) n.startBeat -= pickup;
    for (const c of chordEvents) c.startBeat -= pickup;
  }
  const keepMel = melody.filter(n => n.startBeat > -1e-6);
  if (keepMel.length < 6) return null;

  const totalBeats = Math.max(...keepMel.map(n => n.startBeat + n.durBeats));
  const barCount = Math.max(1, Math.round(totalBeats / beatsPerBar));

  // Key: MusicXML fifths + major/minor → tonic pitch-class.
  let tonicPc = ((((fifths ?? 0) * 7) % 12) + 12) % 12;
  if (mode === "minor") tonicPc = (tonicPc + 9) % 12;
  const modeName = mode === "minor" ? "minor" : "major";

  // Chords → TxChords (parse symbol → root/intervals), de-duped + held.
  const parsed = [];
  for (const ce of chordEvents) {
    if (ce.startBeat < -1e-6) continue;
    const p = parseChordSymbol(ce.sym);
    if (p) parsed.push({ sym: ce.sym, rootPc: p.rootPc, intervals: p.intervals, bassPc: p.bassPc, startBeat: ce.startBeat });
  }
  const chords = consolidateChords(parsed, totalBeats);

  return {
    id,
    source: "ewld",
    genre: SOURCE_GENRE.ewld,
    style: "Standard",
    title,
    artist,
    key: { tonicPc, mode: modeName },
    timeSig,
    tempoBpm: tempo || 110,
    barCount,
    melody: keepMel,
    chords,
    youtubeQuery: `${title}${artist ? " " + artist : ""} jazz standard`.trim(),
  };
}

/** Extract the score XML from a .mxl (zipped MusicXML) buffer. */
export function mxlToXml(buf) {
  const files = unzipSync(new Uint8Array(buf));
  const name = Object.keys(files).find(n => !/^META-INF/i.test(n) && /\.(musicxml|xml)$/i.test(n));
  if (!name) return null;
  return Buffer.from(files[name]).toString("utf8");
}

/** Pretty composer + title from an OpenEWLD path: dataset/<Composer>/<Work>/<Work>.mxl */
function metaFromPath(path) {
  const parts = path.split("/");
  const composer = decodeURIComponent(parts[1] || "").replace(/_/g, " ").replace(/-/g, ", ");
  const title = decodeURIComponent(parts[2] || parts[parts.length - 1] || "").replace(/_/g, " ").replace(/\.mxl$/i, "");
  return { composer: composer || undefined, title: title || "Untitled" };
}

export async function build() {
  const items = [];

  if (existsSync(CACHE_FULL)) {
    // ── Full EWLD: ingest every .mxl inside the user-provided zip. ──
    console.log("EWLD: found cached full EWLD.zip — ingesting all lead sheets…");
    const files = unzipSync(new Uint8Array(readFileSync(CACHE_FULL)));
    const mxls = Object.keys(files).filter(n => /\.mxl$/i.test(n));
    console.log(`  ${mxls.length} .mxl lead sheets`);
    let i = 0;
    for (const name of mxls) {
      try {
        const xml = mxlToXml(Buffer.from(files[name]));
        if (!xml) continue;
        const { composer, title } = metaFromPath(name.replace(/^.*?dataset\//, "dataset/"));
        const item = parseLeadSheet(xml, { id: `ewld-${i}`, title, artist: composer });
        if (item) { items.push(item); i++; }
      } catch { /* skip malformed */ }
    }
  } else {
    // ── OpenEWLD (public domain) over HTTP. ──
    console.log("EWLD: full set not cached — using public-domain OpenEWLD (502 lead sheets).");
    console.log("      (To ingest the full 5000+, request EWLD.zip from Zenodo and place it at");
    console.log("       scripts/build-transcriptions/.cache/ewld-full.zip)");
    const tree = JSON.parse(await httpGet(TREE_API));
    const paths = tree.tree.filter(t => t.type === "blob" && /\.mxl$/i.test(t.path)).map(t => t.path);
    console.log(`  ${paths.length} .mxl lead sheets`);

    // Modest concurrency so the fetch finishes in reasonable time.
    let i = 0, done = 0;
    const BATCH = 12;
    for (let b = 0; b < paths.length; b += BATCH) {
      const slice = paths.slice(b, b + BATCH);
      const results = await Promise.all(slice.map(async (path) => {
        try {
          const buf = await httpGet(RAW + encodeURI(path), { binary: true });
          const xml = mxlToXml(buf);
          if (!xml) return null;
          const { composer, title } = metaFromPath(path);
          return parseLeadSheet(xml, { id: `ewld-x`, title, artist: composer });
        } catch { return null; }
      }));
      for (const item of results) { if (item) { item.id = `ewld-${i++}`; items.push(item); } }
      done += slice.length;
      if (done % 60 === 0 || done === paths.length) console.log(`  parsed ${done}/${paths.length}…`);
    }
  }

  console.log(`  built ${items.length} lead sheets`);
  const curated = curate(items, { max: 1200, minBars: 8 }).map(it => clipBars(it, 40));
  writeSource("ewld", curated);
}

if (isMain(import.meta.url)) {
  build().then(rebuildIndex).catch(e => { console.error(e); process.exit(1); });
}
