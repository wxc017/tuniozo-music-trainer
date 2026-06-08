// Build src/lib/notationSystems.ts from the scraped Xenharmonic interval tables.
//
// Extracts, per EDO, both NOTATION systems (interval symbols: Ups-and-downs,
// SKULO, Extended Pythagorean, …) and SOLFÈGE systems (movable-do / uniform /
// per-EDO syllables).  The wiki tables are messy: column counts vary and each
// notation system spans symbol/name/note sub-columns via colspan, so we
// classify columns by content and pair symbol columns with system headers;
// solfège columns are found by their header (…"Solfège"/"Solfeges"…).
// Output is pure renaming data: step → label, tagged by kind.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "..", "data", "xen-notation");
const OUT = path.join(__dirname, "..", "src", "lib", "notationSystems.ts");

const NAME_WORD = /(unison|2nd|3rd|4th|5th|6th|7th|octave|second|third|fourth|fifth|sixth|seventh|minor|major|perfect|dim|aug|neutral|sub|super|wide|narrow|comma|tone|region)/i;
const SOLFEGE_HDR = /solf[eè]g/i;
const NOTATION_HDR = /ups? and downs|skulo|sagittal|pythagorean|relative|circle.?of.?fifths|standard notation|helmholtz|notation/i;
const baseHeader = (h) => /degree|cents|ratio|audio|monzo|categor|^#$|harmonic|^step|example|difference|letter|english/i.test(h || "");

const isInt = (s) => /^\d+$/.test((s || "").trim());
const numeric = (s) => /^-?\d+(\.\d+)?$/.test((s || "").trim());

function classify(colCells) {
  const cells = colCells.map(c => (c ?? "").trim()).filter(Boolean);
  if (!cells.length) return "empty";
  const frac = (pred) => cells.filter(pred).length / cells.length;
  if (frac(c => c.includes("http")) > 0.4) return "audio";
  if (cells.every(isInt) && cells.length > 4) return "step";
  if (frac(numeric) > 0.8) return "cents";
  if (frac(c => /\d+\/\d+/.test(c)) > 0.5) return "ratio";
  if (frac(c => /^[\^v~]*[A-G][#♯b♭x𝄪𝄫t↑↓]*(\s*[/,]\s*[\^v~]*[A-G][#♯b♭x𝄪𝄫t↑↓]*)*$/.test(c)) > 0.6) return "note";
  if (frac(c => NAME_WORD.test(c) && /\s/.test(c)) > 0.5) return "name";
  if (frac(c => /\d/.test(c) && c.length <= 14 && /[\^v~#♯b♭dAPMmnKSULRtq0-9/, ]/.test(c)) > 0.5) return "symbol";
  return "other";
}

function transpose(rows, nCols) {
  const cols = [];
  for (let c = 0; c < nCols; c++) cols.push(rows.map(r => r[c] ?? ""));
  return cols;
}
const cleanName = (h) => h.replace(/\s*\(.*?\)\s*/g, "").replace(/\s*\[.*?\]\s*/g, "").trim();

function systemsFromTable(tbl) {
  const out = [];
  if (!tbl.rows || tbl.rows.length < 6) return out;
  const nCols = Math.max(...tbl.rows.map(r => r.length));
  const cols = transpose(tbl.rows, nCols);
  const kinds = cols.map(classify);
  const stepIdx = kinds.indexOf("step");
  const headers = tbl.headers || [];

  // TRANSPOSED: step numbers in the header row, each data row a notation system.
  if (stepIdx < 0) {
    const stepHdr = headers.map((h, i) => (i >= 1 && /^\d+$/.test((h || "").trim())) ? { i, step: +h } : null).filter(Boolean);
    if (stepHdr.length >= 4) {
      const SYM = /\d/, NOTE = /[\^v~#♯b♭dAPMmnKSULRtq]/;
      for (const row of tbl.rows) {
        const name = (row[0] || "").trim();
        if (!name || /sharp symbol|flat symbol|^step|^note|cents?$/i.test(name)) continue;
        const vals = stepHdr.map(sc => (row[sc.i] || "").trim());
        if (vals.filter(c => c && SYM.test(c) && NOTE.test(c)).length < 4) continue;
        const labels = {};
        stepHdr.forEach(sc => { const v = (row[sc.i] || "").trim(); if (v) labels[sc.step] = v; });
        if (Object.keys(labels).length >= 4) out.push({ name: cleanName(name), kind: "notation", labels });
      }
    }
    return out;
  }
  const steps = cols[stepIdx].map(s => parseInt(s, 10));

  const addSystem = (name, kind, colIdx) => {
    const labels = {};
    cols[colIdx].forEach((v, ri) => {
      const st = steps[ri]; const val = (v || "").trim();
      if (Number.isFinite(st) && val) labels[st] = val;
    });
    if (Object.keys(labels).length >= 4) out.push({ name, kind, labels });
  };

  if (headers.length === nCols) {
    // Clean 1:1 table — map by header directly.
    headers.forEach((h, i) => {
      if (i === stepIdx) return;
      if (SOLFEGE_HDR.test(h)) addSystem(cleanName(h) || "Solfège", "solfege", i);
      else if (NOTATION_HDR.test(h) && (kinds[i] === "symbol" || kinds[i] === "name")) addSystem(cleanName(h), "notation", i);
    });
  } else {
    // Colspan table — pair symbol columns with the (non-base) system headers.
    const sysNames = headers.filter(h => !baseHeader(h) && !SOLFEGE_HDR.test(h)).map(cleanName);
    const symbolCols = kinds.map((k, i) => k === "symbol" ? i : -1).filter(i => i >= 0);
    symbolCols.forEach((ci, k) => addSystem(sysNames[k] || `System ${k + 1}`, "notation", ci));
    // Solfège: if a header looks like solfège, the syllable column is usually
    // the last data column; grab it when its content isn't notey/ratio.
    if (headers.some(h => SOLFEGE_HDR.test(h))) {
      const last = nCols - 1;
      if (["name", "other", "symbol"].includes(kinds[last])) addSystem("Solfège", "solfege", last);
    }
  }
  return out;
}

function parseEdo(json) {
  const merged = [];
  const seen = new Set();
  for (const tbl of json.tables || []) {
    for (const s of systemsFromTable(tbl)) {
      const key = s.kind + ":" + s.name.toLowerCase();
      if (seen.has(key)) continue;
      // drop junk system names
      if (/^(example|difference|note|cents|ratio|prime limit|interval region)\b/i.test(s.name)) continue;
      seen.add(key); merged.push(s);
    }
  }
  return merged;
}

const out = {};
for (const f of fs.readdirSync(DATA)) {
  const m = /^(\d+)edo\.json$/.exec(f);
  if (!m) continue;
  const edo = +m[1];
  try {
    const systems = parseEdo(JSON.parse(fs.readFileSync(path.join(DATA, f), "utf-8")));
    if (systems.length) out[edo] = systems;
  } catch (e) { console.warn(`skip ${f}: ${e.message}`); }
}

const body = `// AUTO-GENERATED by scripts/build_notation_registry.mjs — do not edit by hand.
// Per-EDO notation + solfège systems mined from the Xenharmonic Wiki.  Each
// system maps an EDO step → its label (interval symbol or solfège syllable);
// the built-in "Schulter" sized system is added separately at runtime.

export interface MinedSystem { name: string; kind: "notation" | "solfege"; labels: Record<number, string>; }
export const NOTATION_SYSTEMS: Record<number, MinedSystem[]> = ${JSON.stringify(out, null, 1)};
`;
fs.writeFileSync(OUT, body);
const counts = Object.entries(out).map(([e, s]) => `${e}:${s.map(x => `${x.kind[0]}:${x.name}`).join("/")}`).join("\n");
console.log(`Wrote ${OUT} — ${Object.keys(out).length} EDOs`);
console.log(counts);
