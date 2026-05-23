// ── CoCoPops / Billboard — pop-rock melody + chords (Humdrum) ───────
//
// Source: Computational-Cognitive-Musicology-Lab/CoCoPops, Billboard/Data
// *.hum files. Each is multi-spine Humdrum: **harte (chord symbols),
// **kern (vocal melody), **timestamp (seconds, for tempo), plus harm /
// lyric / phrase spines we ignore. ~214 of 740 carry a real transcribed
// melody (the rest are chords-only placeholders) — those are filtered out
// downstream by the <6-note rule in the importer.

import { httpGet, makeChord, curate, writeSource, rebuildIndex, isMain } from "./common.mjs";

const TREE = "https://api.github.com/repos/Computational-Cognitive-Musicology-Lab/CoCoPops/git/trees/main";
const RAW = "https://raw.githubusercontent.com/Computational-Cognitive-Musicology-Lab/CoCoPops/main/Billboard/Data/";

// ── Humdrum helpers ─────────────────────────────────────────────────
const KERN_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** Parse a **kern token → { midi|null, durBeats, tieStart, tieEnd } or null. */
function parseKern(tok) {
  if (!tok || tok === "." || tok.startsWith("=") || tok.startsWith("*") || tok.startsWith("!")) return null;
  const durM = /^(\d+)(\.*)/.exec(tok);
  if (!durM) return null;
  const recip = Number(durM[1]);
  if (!recip) return null;
  let durBeats = 4 / recip;
  let d = durM[2].length;
  let add = durBeats / 2;
  while (d-- > 0) { durBeats += add; add /= 2; }

  if (/r/.test(tok)) return { midi: null, durBeats };
  const pm = /([a-gA-G]+)([#-]*)/.exec(tok.replace(/[\d.]/g, ""));
  if (!pm) return { midi: null, durBeats };          // unpitched → treat as rest
  const letters = pm[1];
  const letter = letters[0].toLowerCase();
  const isLower = letters[0] === letter;
  const n = letters.length;
  const octave = isLower ? 4 + (n - 1) : 3 - (n - 1);
  let midi = 12 * (octave + 1) + KERN_PC[letter];
  for (const a of pm[2]) midi += a === "#" ? 1 : -1;
  return { midi, durBeats, tieStart: tok.includes("["), tieEnd: tok.includes("]") || tok.includes("_") };
}

// Harte quality → chord-symbol suffix understood by makeChord/parseChordSymbol.
const HARTE_Q = {
  maj: "", min: "m", dim: "dim", aug: "aug",
  maj7: "maj7", min7: "m7", "7": "7", maj6: "6", min6: "m6", "6": "6",
  "9": "9", maj9: "maj9", min9: "m9", "11": "11", "13": "13",
  sus4: "sus4", sus2: "sus2", hdim7: "m7b5", dim7: "dim7", minmaj7: "mmaj7",
};
/** Harte chord ("B-:maj7", "C:7", "F:", "G:maj/3") → plain chord symbol
 *  ("Bbmaj7"). Harte inversion ("/<degree>") and interval lists ("(...)")
 *  are dropped — only root + named quality are kept. */
function harteToSymbol(tok) {
  if (!tok || tok === "." || tok === "N" || tok.startsWith("*") || tok.startsWith("=")) return null;
  // Quality is the run of letters/digits after the colon, before any
  // "(" interval list or "/" inversion.
  const m = /^([A-G])([#-]*):?([A-Za-z0-9]*)/.exec(tok);
  if (!m) return null;
  const root = m[1] + m[2].replace(/-/g, "b");
  const q = (m[3] || "maj").trim();
  const suffix = HARTE_Q[q] != null ? HARTE_Q[q] : (q.match(/^(maj|min|dim|aug|sus[24]|7|9|11|13|6)/) ? q : "");
  return root + suffix;
}

const KEY_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
/** Parse a Humdrum key interpretation cell ("*F:", "*a:") → {tonicPc, mode}. */
function parseKeyCell(cell) {
  const m = /^\*([A-Ga-g])([#-]?):$/.exec(cell);
  if (!m) return null;
  let pc = KEY_PC[m[1].toLowerCase()];
  if (m[2] === "#") pc += 1; else if (m[2] === "-") pc -= 1;
  return { tonicPc: ((pc % 12) + 12) % 12, mode: m[1] === m[1].toLowerCase() ? "minor" : "major" };
}

function deCamel(s) {
  return s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").trim();
}

function parseHum(text, fileBase) {
  const lines = text.split(/\r?\n/);
  let colKern = -1, colHarte = -1, colTime = -1;
  let timeSig = [4, 4];
  const melody = [];
  const chords = [];
  let beat = 0;
  let lastChordSym = null;
  let key = { tonicPc: 0, mode: "major" };
  const tsPairs = [];        // [beat, seconds] for tempo estimation

  for (const line of lines) {
    if (!line) continue;
    const cells = line.split("\t");
    if (line.startsWith("**")) {
      cells.forEach((c, i) => {
        if (c === "**kern") colKern = i;
        else if (c === "**harte") colHarte = i;
        else if (c === "**timestamp") colTime = i;
      });
      continue;
    }
    if (line.startsWith("*")) {
      const mt = line.match(/\*M(\d+)\/(\d+)/);
      if (mt) timeSig = [Number(mt[1]), Number(mt[2])];
      for (const c of cells) { const k = parseKeyCell(c); if (k) { key = k; break; } }
      continue;
    }
    if (line.startsWith("=")) continue;           // barline
    if (line.startsWith("!")) continue;           // comment

    const kTok = colKern >= 0 ? cells[colKern] : ".";
    const hTok = colHarte >= 0 ? cells[colHarte] : ".";
    const tTok = colTime >= 0 ? cells[colTime] : ".";

    // Chord change.
    const sym = harteToSymbol(hTok);
    if (sym && sym !== lastChordSym) {
      const c = makeChord(sym, beat, 0);
      if (c) { chords.push(c); lastChordSym = sym; }
    }
    // Timestamp for tempo.
    if (tTok && tTok !== "." && !isNaN(Number(tTok))) tsPairs.push([beat, Number(tTok)]);

    // Melody / time advance.
    const k = parseKern(kTok);
    if (k) {
      if (k.midi != null && !k.tieEnd) melody.push({ midi: k.midi, startBeat: beat, durBeats: k.durBeats });
      else if (k.midi != null && k.tieEnd && melody.length) melody[melody.length - 1].durBeats += k.durBeats;
      beat += k.durBeats;
    }
  }

  // Close chord durations (each holds until the next change / end).
  for (let i = 0; i < chords.length; i++) {
    const end = i + 1 < chords.length ? chords[i + 1].startBeat : beat;
    chords[i].durBeats = Math.max(0.5, end - chords[i].startBeat);
  }

  // Tempo from timestamps (quarter-beats per second × 60).
  let tempoBpm = 100;
  if (tsPairs.length >= 2) {
    const [b0, s0] = tsPairs[0], [b1, s1] = tsPairs[tsPairs.length - 1];
    if (s1 > s0 && b1 > b0) {
      const bpm = ((b1 - b0) / (s1 - s0)) * 60;
      if (bpm >= 50 && bpm <= 220) tempoBpm = Math.round(bpm);
    }
  }

  const parts = fileBase.split("_");
  const year = /^\d{4}$/.test(parts[parts.length - 1]) ? parts.pop() : null;
  const artist = deCamel(parts.shift() || "");
  const title = deCamel(parts.join(" ")) || fileBase;
  const bpb = (timeSig[0] * 4) / timeSig[1];
  const totalBeats = melody.length ? Math.max(...melody.map(n => n.startBeat + n.durBeats), beat) : beat;
  const barCount = Math.max(1, Math.round(totalBeats / bpb));

  return {
    id: `cocopops-${fileBase}`,
    source: "cocopops", genre: "Pop/Rock", style: "Billboard",
    title, artist,
    key,
    timeSig, tempoBpm, barCount,
    melody,
    chords: chords.length ? chords : undefined,
    youtubeQuery: `${artist} ${title}${year ? " " + year : ""}`.trim(),
  };
}

export async function build() {
  console.log("CoCoPops: listing Billboard/Data…");
  const root = JSON.parse(await httpGet(TREE));
  const bb = root.tree.find(t => t.path === "Billboard");
  const bbTree = JSON.parse(await httpGet(`https://api.github.com/repos/Computational-Cognitive-Musicology-Lab/CoCoPops/git/trees/${bb.sha}`));
  const dataNode = bbTree.tree.find(t => t.path === "Data");
  const dataTree = JSON.parse(await httpGet(`https://api.github.com/repos/Computational-Cognitive-Musicology-Lab/CoCoPops/git/trees/${dataNode.sha}`));
  const humFiles = dataTree.tree.filter(t => t.type === "blob" && t.path.endsWith(".hum")).map(t => t.path);
  console.log(`  ${humFiles.length} .hum files`);

  const items = [];
  const BATCH = 12;
  for (let i = 0; i < humFiles.length; i += BATCH) {
    const batch = humFiles.slice(i, i + BATCH);
    const texts = await Promise.all(batch.map(f => httpGet(RAW + f).catch(() => null)));
    texts.forEach((text, j) => {
      if (!text) return;
      try {
        const base = batch[j].replace(/^.*\//, "").replace(/\.hum$/, "").replace(/\.(varms|harm)$/, "");
        const item = parseHum(text, base);
        const realNotes = item.melody.filter(n => n.midi != null).length;
        if (realNotes >= 6) items.push(item);
      } catch { /* skip */ }
    });
    process.stdout.write(`\r  parsed ${items.length} (scanned ${Math.min(i + BATCH, humFiles.length)}/${humFiles.length})`);
  }
  process.stdout.write("\n");
  const curated = curate(items, { max: 300, minBars: 8 });
  writeSource("cocopops", curated);
}

if (isMain(import.meta.url)) {
  build().then(rebuildIndex).catch(e => { console.error(e); process.exit(1); });
}
