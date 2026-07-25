// Slick dark (app-styled) 3-page landscape PDF:
//  p1  region-centered gamut, app's nested Interval/Class/band table (12/31/49/53-EDO)
//  p2  MAJOR scale: each degree zoomed across 12/31/49-EDO + I·IV·V (each tone zoomed)
//  p3  NATURAL MINOR scale: each degree zoomed + i·iv·v
// All glyphs WinAnsi-safe.
import { jsPDF } from "jspdf";
import { writeFileSync } from "fs";
import { REGIONS } from "./src/lib/intervalSpectrum.ts";
import { customSolfege, mainRegionContaining, betweenRegionContaining } from "./src/lib/customSolfege.ts";

const OUT = "C:/Users/wilda/tunizo-solfege-gamut.pdf";
const GAMUT_EDOS = [12, 31, 39, 53];
const ZOOM_EDOS = [12, 31, 39];

// ── palette (app, on dark) ───────────────────────────────────────────
const BG = [13, 13, 13], PANEL = [20, 20, 20], INNER = [10, 10, 10], BORDER = [40, 40, 44];
const B2A = [42, 42, 42], B1C = [28, 28, 28], B24 = [36, 36, 36];
const LIGHT = [221, 221, 221], GRY = [154, 154, 154], SUB = [138, 138, 138], CENT = [102, 102, 102], DIM = [90, 90, 96];
const GOLD = [212, 160, 80], EDOH = [153, 153, 238], WHITE = [240, 240, 240], EMPTY = [55, 55, 60];
const A = [143, 191, 143], EI = [201, 154, 85], OU = [111, 147, 184];
const C = { 12: [121, 176, 230], 31: [224, 162, 74], 39: [176, 150, 230] };  // 12 blue · 31 amber · 39 violet
const vRGB = (s) => { const v = s.slice(-1); return v === "a" ? A : (v === "e" || v === "i") ? EI : (v === "u" || v === "o") ? OU : GRY; };

// ── gamut row model (app-faithful) ───────────────────────────────────
const DEG = { Seconds: "2nd", Thirds: "3rd", Fourths: "4th", Fifths: "5th", Sixths: "6th", Sevenths: "7th" };
const DEGSET = new Set(["2nd", "3rd", "4th", "Tritone", "5th", "6th", "7th"]);
const BLAB = {
  "Pure Unison": "unison", "Commas": "comma", "Dieses": "diesis", "Interseptimal (M2–m3)": "semifourth",
  "Interseptimal (M3–4)": "semisixth", "Superfourths": "superfourth", "Subfifths": "subfifth",
  "Interseptimal (5–m6)": "semitenth", "Interseptimal (M6–m7)": "semitwelfth",
  "Octave less diesis": "8ve less diesis", "Octave less comma": "8ve less comma", "Pure Octave": "octave",
};
const titleCase = (s) => s.replace(/\s*\(.*\)$/, "").replace(/^\w/, c => c.toUpperCase());
const parseMain = (n) => {
  if (/Tritonic/.test(n)) return { degree: "Tritone", klass: "" };
  const m = /(Minor|Neutral|Major|Perfect)?\s*(Seconds|Thirds|Fourths|Fifths|Sixths|Sevenths)/.exec(n);
  return { degree: DEG[m[2]], klass: /Fourths|Fifths/.test(m[2]) ? "" : (m[1] ?? "") };
};
const rows = [];
for (const r of REGIONS) {
  if (r.kind === "main" && r.subs?.length) {
    const { degree, klass } = parseMain(r.name);
    r.subs.forEach(s => rows.push({ kind: "main", groupLabel: degree, klass, subcat: titleCase(s.name), lo: s.lo, hi: s.hi, solf: customSolfege((s.lo + s.hi) / 2), middle: /middle/i.test(s.name), equable: false, cells: {} }));
  } else if (/Equable/.test(r.name)) {
    const mid = (r.lo + r.hi) / 2;
    rows.push({ kind: "between", groupLabel: mid < 600 ? "2nd" : "7th", klass: "", subcat: "Equable", lo: r.lo, hi: r.hi, solf: customSolfege(mid), middle: false, equable: true, cells: {} });
  } else {
    const anchor = r.lo === r.hi;
    rows.push({ kind: anchor ? "anchor" : "between", groupLabel: BLAB[r.name] ?? r.name, label: BLAB[r.name] ?? r.name, klass: "", subcat: "", lo: r.lo, hi: r.hi, solf: anchor ? "Da" : customSolfege((r.lo + r.hi) / 2), middle: false, equable: false, standaloneLabel: true, cells: {} });
  }
}
// group + class spans (app algorithm)
for (let gi = 0; gi < rows.length;) {
  let gj = gi; while (gj < rows.length && rows[gj].groupLabel === rows[gi].groupLabel) gj++;
  const size = gj - gi, isDeg = DEGSET.has(rows[gi].groupLabel);
  for (let k = gi; k < gj; k++) { rows[k].groupStart = k === gi; rows[k].groupSize = size; rows[k].standalone = !isDeg; }
  if (isDeg) for (let ci = gi; ci < gj;) {
    if (rows[ci].equable) { rows[ci].classStart = true; rows[ci].classSize = 1; ci++; continue; }
    let cj = ci; while (cj < gj && !rows[cj].equable && rows[cj].klass === rows[ci].klass) cj++;
    for (let k = ci; k < cj; k++) { rows[k].classStart = k === ci; rows[k].classSize = cj - ci; }
    ci = cj;
  }
  gi = gj;
}
// bucket EDO syllables
for (const edo of GAMUT_EDOS) {
  const acc = rows.map(() => []);
  for (let s = 0; s <= edo; s++) {
    const c = (s * 1200) / edo; let idx = -1;
    const mn = mainRegionContaining(c);
    if (mn) { const g = parseMain(mn).degree; idx = rows.findIndex(r => r.kind === "main" && r.groupLabel === g && c >= r.lo - 0.01 && c <= r.hi + 0.01); if (idx < 0) idx = rows.findIndex(r => r.kind === "main" && r.groupLabel === g && c >= r.lo - 0.6 && c <= r.hi + 0.6); }
    else { const rn = betweenRegionContaining(c) ?? (c < 6 ? "Pure Unison" : c > 1194 ? "Pure Octave" : null); if (rn) idx = rows.findIndex(r => r.kind !== "main" && c >= r.lo - 0.01 && c <= r.hi + 0.01 && (r.equable ? /Equable/.test(rn) : (r.label === (BLAB[rn] ?? rn)))); }
    if (idx >= 0) { const syl = c < 6 || c > 1194 ? "Da" : customSolfege(c); if (!acc[idx].includes(syl)) acc[idx].push(syl); }
  }
  rows.forEach((r, i) => { r.cells[edo] = acc[i].join(" "); });
}

// ── scale data: each EDO's native diatonic scale from ITS OWN best fifth ──
// Fifths-based (real diatonic theory), so every EDO gets its idiomatic degrees
// automatically:  Major 3rd = 4 fifths up, minor 3rd = 3 fifths down, etc.
//   12 -> Ma / Na    31 -> Mo / Ne (large m3)    39 -> Me / No (small m3), b7 = Yo
const edoFifth = (edo) => Math.round(edo * Math.log2(3 / 2));
const IONIAN = [0, 2, 4, -1, 1, 3, 5], AEOLIAN = [0, 2, -3, -1, 1, -4, -2];   // fifths from tonic, degrees 1..7
const degStep = (edo, f) => (((f * edoFifth(edo)) % edo) + edo) % edo;
const scaleData = (edo, family) => {
  const steps = (family === "Major" ? IONIAN : AEOLIAN).map(f => degStep(edo, f));
  const tone = (st) => ({ syl: customSolfege((st / edo) * 1200), cents: (st / edo) * 1200 });
  const romans = family === "Major" ? ["I", "IV", "V"] : ["i", "iv", "v"];
  return {
    scale: steps.map(tone),
    chords: [0, 3, 4].map((di, ix) => ({ roman: romans[ix], tones: [0, 2, 4].map(o => tone(steps[(di + o) % 7])) })),
  };
};
const NAME = {
  Major: ["tonic", "major 2nd", "major 3rd", "perfect 4th", "perfect 5th", "major 6th", "major 7th"],
  Minor: ["tonic", "major 2nd", "minor 3rd", "perfect 4th", "perfect 5th", "minor 6th", "minor 7th"],
};
const SCALE = { Major: ZOOM_EDOS.map(e => ({ e, d: scaleData(e, "Major") })), Minor: ZOOM_EDOS.map(e => ({ e, d: scaleData(e, "Minor") })) };

// ── PDF plumbing ─────────────────────────────────────────────────────
const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
const M = 24;
const bg = (w, h) => { doc.setFillColor(...BG); doc.rect(0, 0, w, h, "F"); };
const T = (x, y, s, { size = 8, bold = false, color = LIGHT, align = "left", cs = 0 } = {}) => { doc.setFont("Helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(color[0], color[1], color[2]); doc.text(String(s), x, y, { align, charSpace: cs }); };
const rrect = (x, y, w, h, f, s, r = 3) => { if (f) doc.setFillColor(...f); if (s) { doc.setDrawColor(...s); doc.setLineWidth(0.5); } doc.roundedRect(x, y, w, h, r, r, f && s ? "FD" : f ? "F" : "D"); };
const seg = (x1, y1, x2, y2, c, w = 0.4) => { doc.setDrawColor(...c); doc.setLineWidth(w); doc.line(x1, y1, x2, y2); };
const dot = (x, y, r, c) => { doc.setFillColor(...c); doc.circle(x, y, r, "F"); };
const tri = (x, y, r, c) => { doc.setFillColor(...c); doc.triangle(x - r, y, x + r, y, x, y + r * 1.6, "F"); };
const sq = (x, y, r, c) => { doc.setFillColor(...c); doc.rect(x - r, y - r, r * 2, r * 2, "F"); };
const mark = (edo, x, y, r) => edo === 12 ? dot(x, y, r, C[12]) : edo === 31 ? tri(x, y - r, r, C[31]) : sq(x, y, r * 0.9, C[39]);

// ═══ PAGE 1 · GAMUT (PORTRAIT, app-styled) ═══════════════════════════
const PW = 595, PH = 842;
bg(PW, PH);
const GC = [{ k: "iv", w: 54 }, { k: "cl", w: 62 }, { k: "sb", w: 54 }, { k: "ct", w: 56 }, { k: "sf", w: 48, c: true }, { k: "12", w: 48, c: true }, { k: "31", w: 50, c: true }, { k: "39", w: 50, c: true }, { k: "53", w: 54, c: true }];
const GHDR = { iv: "Interval", cl: "", sb: "", ct: "Cents", sf: "Solf", "12": "12", "31": "31", "39": "39", "53": "53" };
const TW = GC.reduce((a, c) => a + c.w, 0);
const TX = Math.round((PW - TW) / 2), TY = M + 32, TH = PH - TY - M;
T(TX, M + 8, "REGION-CENTERED SOLFEGE  ·  GAMUT", { size: 13, bold: true, color: GOLD, cs: 1 });
T(TX, M + 21, "Schulter interval regions  ·  small / mid / large sub-bands  ·  white = centre band, grey = sub-band, dot = not reached", { size: 6.3, color: GRY });
let gx = TX; const gX = {}, gW = {}; GC.forEach(c => { gX[c.k] = gx; gW[c.k] = c.w; gx += c.w; });
const cellX = (k) => GC.find(c => c.k === k).c ? gX[k] + gW[k] / 2 : gX[k] + 4;
const rowH = TH / (rows.length + 1), rowTop = (i) => TY + (i + 1) * rowH;
// header
doc.setFillColor(20, 20, 20); doc.rect(TX, TY, TW, rowH, "F");
GC.forEach(c => { if (GHDR[c.k]) T(cellX(c.k), TY + rowH - 4, GHDR[c.k], { size: 6.8, bold: true, color: /^\d/.test(c.k) ? EDOH : (c.k === "sf" ? A : GRY), align: c.c ? "center" : "left", cs: 0.3 }); });
seg(TX, TY + rowH, TX + TW, TY + rowH, B2A, 0.8);
rows.forEach((row, i) => {
  const yt = rowTop(i), y = yt + rowH - 4, yb = yt + rowH;
  if (row.kind !== "main") { doc.setFillColor(...INNER); doc.rect(TX, yt, TW, rowH, "F"); }
  seg(TX, yt, TX + TW, yt, (row.groupStart || row.standalone) ? B2A : [24, 24, 26], (row.groupStart || row.standalone) ? 0.45 : 0.3);
  if (row.standalone) T(gX.iv + 4, y, row.label, { size: 7, color: [176, 176, 176] });
  else {
    if (row.groupStart) T(gX.iv + 4, rowTop(i) + row.groupSize * rowH / 2 + 2.5, row.groupLabel, { size: 7.6, bold: true, color: [221, 221, 221] });
    seg(gX.cl, yt, gX.cl, yb, B24, 0.3);                       // border-r after Interval
    if (row.equable) T(gX.cl + 4, y, "Equable", { size: 6.8, color: [127, 127, 127] });
    else {
      if (row.classStart && row.klass) T(gX.cl + 4, rowTop(i) + row.classSize * rowH / 2 + 2.5, row.klass, { size: 6.9, color: GRY });
      seg(gX.sb, yt, gX.sb, yb, B1C, 0.3);                     // border-r after Class
      T(gX.sb + 4, y, row.subcat, { size: 6.7, color: SUB });
      seg(gX.ct, yt, gX.ct, yb, B24, 0.3);                     // border-r after Sub
    }
  }
  T(gX.ct + gW.ct - 5, y, row.lo === row.hi ? String(row.lo) : `${row.lo}-${row.hi}`, { size: 6.5, color: CENT, align: "right" });
  T(cellX("sf"), y, row.solf, { size: 7.9, bold: true, color: vRGB(row.solf), align: "center" });
  GAMUT_EDOS.forEach(e => { const cell = row.cells[e] || ""; T(cellX(String(e)), y, cell || "·", { size: 7.4, color: cell ? (row.middle ? WHITE : [205, 205, 205]) : EMPTY, align: "center" }); });
});
rrect(TX, TY, TW, TH, null, BORDER, 6);

// ═══ SCALE PAGES ═════════════════════════════════════════════════════
function zoomCard(x, y, w, h, num, name, edoEntries) {
  rrect(x, y, w, h, PANEL, BORDER, 4);
  let lx = x + 9;
  if (num) { T(lx, y + h / 2 + 5, num, { size: 14, bold: true, color: GOLD }); lx += 15; }
  T(lx, y + 12, name, { size: 7, bold: true, color: LIGHT });
  // per-EDO values (stacked)
  const mx = x + (num ? 90 : 74);
  edoEntries.forEach((en, k) => {
    const ly = y + 11 + k * ((h - 12) / edoEntries.length);
    T(mx, ly, String(en.e), { size: 5.4, bold: true, color: C[en.e] });
    T(mx + 15, ly, en.syl, { size: 7.6, bold: true, color: vRGB(en.syl) });
    T(mx + 40, ly, Math.round(en.cents) + "c", { size: 5.6, color: DIM });
  });
  // zoom spectrum centred on 12-EDO
  const ref = edoEntries[0].cents, W = 50, zx = x + w * 0.52, zw = x + w - 14 - (x + w * 0.52), cxc = zx + zw / 2, ppc = (zw / 2) / W, zy = y + h / 2 + 3;
  seg(zx, zy, zx + zw, zy, [62, 62, 68], 0.5);
  for (const t of [-30, -15, 0, 15, 30]) seg(cxc + t * ppc, zy - 2.5, cxc + t * ppc, zy + 2.5, [46, 46, 52], 0.4);
  seg(cxc, y + 6, cxc, y + h - 6, [72, 72, 80], 0.4);
  edoEntries.forEach(en => { const d = Math.max(-W, Math.min(W, en.cents - ref)); const px = cxc + d * ppc; if (en.e !== 12 && Math.abs(en.cents - ref) > 0.3) seg(cxc, zy, px, zy, C[en.e], 0.9); mark(en.e, px, zy, 2.4); });
  // deviations for 31/49
  const devs = edoEntries.slice(1).map(en => `${en.e}: ${Math.round(en.cents - ref) >= 0 ? "+" : ""}${Math.round(en.cents - ref)}`);
  T(x + w - 6, y + 12, devs.join("   "), { size: 6, bold: true, color: GRY, align: "right" });
  T(zx, y + h - 4, "+/-50c", { size: 4.6, color: DIM });
}
function legend(x, y) {
  const items = [[12, "12-EDO"], [31, "31-EDO"], [39, "39-EDO"]];
  let lx = x;
  items.forEach(([e, l]) => { mark(e, lx + 3, y - 2, 2.4); T(lx + 11, y, l, { size: 7, bold: true, color: C[e] }); lx += 58; });
}
function scalePage(family) {
  doc.addPage("a4", "landscape"); const PW = 842, PH = 595; bg(PW, PH);
  const S = SCALE[family], nm = NAME[family];
  T(M, M + 2, `${family === "Major" ? "MAJOR" : "NATURAL MINOR"} SCALE  ·  ${ZOOM_EDOS.join(" / ")}-EDO`, { size: 13, bold: true, color: GOLD, cs: 1.1 });
  T(M, M + 15, "Each degree zoomed (window centred on 12-EDO) so the tuning differences are clear.", { size: 7.2, color: GRY });
  legend(M + 470, M + 8);
  // left: 7 degree cards
  const LW = 452, cardH = 40, top = M + 26;
  for (let i = 0; i < 7; i++) {
    const entries = S.map(({ e, d }) => ({ e, syl: d.scale[i].syl, cents: d.scale[i].cents }));
    zoomCard(M, top + i * (cardH + 6), LW, cardH, String(i + 1), nm[i], entries);
  }
  // right: chords
  const RX = M + LW + 20, RW = PW - M - RX;
  T(RX, top + 8, `CHORDS  ${S[0].d.chords.map(c => c.roman).join(" · ")}`, { size: 10, bold: true, color: LIGHT, cs: 0.6 });
  const tLabel = ["root", "3rd", "5th"], toneH = 34;
  S[0].d.chords.forEach((_, ci) => {
    const panelTop = top + 16 + ci * (16 + 3 * (toneH + 3) + 8);
    T(RX, panelTop + 10, S[0].d.chords[ci].roman, { size: 13, bold: true, color: GOLD });
    T(RX + 24, panelTop + 10, family === "Major" ? "major triad" : "minor triad", { size: 6.5, color: GRY });
    for (let t = 0; t < 3; t++) {
      const entries = S.map(({ e, d }) => ({ e, syl: d.chords[ci].tones[t].syl, cents: d.chords[ci].tones[t].cents }));
      zoomCard(RX, panelTop + 15 + t * (toneH + 3), RW, toneH, "", tLabel[t], entries);
    }
  });
}
scalePage("Major");
scalePage("Minor");

writeFileSync(OUT, Buffer.from(doc.output("arraybuffer")));
console.log("wrote", OUT, "| pages 3 | gamut rows:", rows.length);
