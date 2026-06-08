// Build src/lib/solfegeSystems.ts from the scraped Xenharmonic solfège pages.
//
// Solfège tables group steps by interval class: a row has an "edosteps" range
// (e.g. "2-6") and a space-separated list of syllables that line up 1:1 with
// the steps in that range.  We use the clean (header-aligned) tables, expand
// each range, and zip syllables → a step→syllable map.  Each clean solfège
// table on a page is one system.  Output: per EDO, a list of solfège systems.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, "..", "data", "xen-solfege");
const OUT = path.join(__dirname, "..", "src", "lib", "solfegeSystems.ts");

const RANGE = /^(\d+)\s*[-–]\s*(\d+)$/;

// Junk "system" names: scale-degree syllables, circle/mode artifacts, etc.
const SYLL_JUNK = /^(do|re|mi|fa|sol|so|la|ti|sa|ut)$/i;
const isGenericSolf = (n) => /^solf[eè]ge?( names)?$/i.test((n || "").trim());
const isJunkName = (n) => SYLL_JUNK.test(n) || /\bcircle\b|\bmode\b|conventional|overview|introduction|summary|approximation|^notation$|^intervals?$/i.test(n);
/** Clean, sensible display name for a solfège system, or null to skip junk.
 *  Prefer a real row name; else the section TITLE (the system's heading, e.g.
 *  "Kite Giedraitis's solfege"); else "Uniform Solfège (N vowels)". */
function niceSolfName(name0, title) {
  const n = (name0 || "").trim();
  if (n && isJunkName(n)) return null;
  if (n && !isGenericSolf(n)) return n;
  const t = (title || "").trim();
  const pm = /\(([^)]+)\)/.exec(t);
  const desc = pm && /vowel/i.test(pm[1]) ? pm[1] : null;
  if (t && !/^\d+\s*edo/i.test(t) && !isJunkName(t)) {
    const clean = t.replace(/\s*\(.*?\)\s*/g, "").trim();
    if (clean) return clean;
  }
  return desc ? `Uniform Solfège (${desc})` : "Uniform Solfège";
}
const isStepCell = (s) => /^\d+(\s*[-–]\s*\d+)?$/.test((s || "").trim());
const SOLF_HDR = /solf[eè]g/i;

function transpose(rows, n) { const c = []; for (let i = 0; i < n; i++) c.push(rows.map(r => r[i] ?? "")); return c; }
const expand = (cell) => {
  const s = (cell || "").trim();
  const m = RANGE.exec(s);
  if (m) { const a = +m[1], b = +m[2], out = []; for (let i = a; i <= b; i++) out.push(i); return out; }
  if (/^\d+$/.test(s)) return [+s];
  return [];
};
const splitSyll = (cell) => (cell || "").trim().split(/[\s/]+/).filter(Boolean);

function tablesFor(json) {
  const out = [];
  const fileEdo = (/(\d+)edo/i.exec(json.title || "") || [])[1];
  for (const tbl of json.tables || []) {
    if (!tbl.rows || tbl.rows.length < 3) continue;
    const headers = tbl.headers || [];
    const nCols = Math.max(...tbl.rows.map(r => r.length));
    const edo = +((/(\d+)edo/i.exec(tbl.title || "") || [])[1] || fileEdo || 0);
    if (!edo) continue;
    const cols = transpose(tbl.rows, nCols);
    const isSyll = (c) => /[A-Za-z]/.test(c) && !/[\^v~#♯b♭]/.test(c) && /[aeiouy]/i.test(c);

    // TRANSPOSED layout: step numbers in the header row, each data row a system.
    const stepHdr = headers.map((h, i) => (i >= 1 && /^\d+$/.test((h || "").trim())) ? { i, step: +h } : null).filter(Boolean);
    if (stepHdr.length >= 4) {
      const JUNK = /^(1sns?|2nds?|3rds?|4ths?|5ths?|6ths?|7ths?|octaves?|intervals?|interval categories|edosteps?|plain circle|[-–]|notes?)\b/i;
      for (const row of tbl.rows) {
        const name0 = (row[0] || "").trim();
        if (!name0 || JUNK.test(name0)) continue;          // interval-class / vowel-artifact rows
        const vals = stepHdr.map(sc => (row[sc.i] || "").trim());
        if (vals.filter(isSyll).length < 4) continue;      // not a solfège row
        const labels = {};
        stepHdr.forEach(sc => { const v = (row[sc.i] || "").trim(); if (v) labels[((sc.step % edo) + edo) % edo] = v; });
        // a real, full system covers most of the octave
        if (Object.keys(labels).length >= Math.max(5, Math.floor(edo * 0.5))) {
          const name = niceSolfName(name0, tbl.title);
          if (name) out.push({ edo, name, labels });
        }
      }
      continue;
    }

    // step column: the one whose cells are step ranges/ints
    const stepIdx = cols.findIndex(c => c.filter(isStepCell).length >= Math.max(2, c.filter(Boolean).length * 0.6));
    if (stepIdx < 0) continue;
    // solfège columns: header says solfège, or column is syllable-like (letters,
    // not interval codes like ^m2 / vM3 and not note names).
    for (let ci = 0; ci < nCols; ci++) {
      const h = headers[ci] ?? "";
      if (ci === stepIdx) continue;
      const cells = cols[ci].map(c => (c || "").trim()).filter(Boolean);
      if (!cells.length) continue;
      const headerSolf = SOLF_HDR.test(h);
      const syllabic = cells.filter(c => /[A-Za-z]/.test(c) && !/[\^v~#♯b♭]/.test(c) && /[aeiouy]/i.test(c)).length / cells.length > 0.6;
      if (!headerSolf && !syllabic) continue;
      // build step→syllable by zipping each row's range with its syllables
      const labels = {};
      tbl.rows.forEach(r => {
        const steps = expand(r[stepIdx]);
        const sylls = splitSyll(r[ci]);
        if (!steps.length || !sylls.length) return;
        steps.forEach((st, k) => { const v = sylls[k] ?? sylls[sylls.length - 1]; if (v) labels[((st % edo) + edo) % edo] = v; });
      });
      if (Object.keys(labels).length >= 4) {
        const name = niceSolfName(isGenericSolf(h) ? "" : h, tbl.title);
        if (name) out.push({ edo, name, labels });
      }
    }
  }
  return out;
}

const out = {};
for (const f of fs.readdirSync(DATA)) {
  if (!f.endsWith(".json")) continue;
  let json; try { json = JSON.parse(fs.readFileSync(path.join(DATA, f), "utf-8")); } catch { continue; }
  for (const sys of tablesFor(json)) {
    const arr = (out[sys.edo] ??= []);
    const sig = JSON.stringify(sys.labels);
    if (arr.some(s => JSON.stringify(s.labels) === sig)) continue;   // identical system already present
    let name = sys.name; let n = 2;
    while (arr.some(s => s.name === name)) name = `${sys.name} ${n++}`;
    arr.push({ name, labels: sys.labels });
  }
}

const body = `// AUTO-GENERATED by scripts/build_solfege_registry.mjs — do not edit by hand.
// Per-EDO solfège systems mined exhaustively from the Xenharmonic Wiki solfège
// pages (per-EDO pages + List of uniform solfeges).  step → syllable.

export interface SolfegeSystem { name: string; labels: Record<number, string>; }
export const SOLFEGE_SYSTEMS: Record<number, SolfegeSystem[]> = ${JSON.stringify(out, null, 1)};
`;
fs.writeFileSync(OUT, body);
const counts = Object.entries(out).map(([e, s]) => `${e}:${s.length}`).join(" ");
console.log(`Wrote ${OUT} — ${Object.keys(out).length} EDOs`);
console.log(counts);
