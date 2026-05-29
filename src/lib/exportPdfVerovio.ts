// ── PDF Export via Verovio (MusicXML → engraved SVG → vector PDF) ────────────
//
// Alternative to exportPdf.ts which screenshots the live VexFlow render.
// This path feeds our existing MusicXML output through Verovio (a real
// engraving engine — same family as MuseScore/LilyPond) and pipes Verovio's
// SVG through svg2pdf into a vector PDF.  Drum spacing, beam grouping, and
// percussion glyphs are handled by Verovio rather than VexFlow.
//
// Verovio ships as a ~7 MB WASM module so we lazy-import it on first use;
// it stays out of the initial bundle until the user clicks the button.

import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";

export interface VerovioPdfSection {
  title?: string;
  musicXml: string;
}

export interface VerovioPdfOptions {
  showTitles: boolean;
}

interface ToolkitLike {
  setOptions(opts: Record<string, unknown>): void;
  loadData(data: string): boolean;
  getPageCount(): number;
  renderToSVG(page: number, options?: Record<string, unknown>): string;
}

let toolkitPromise: Promise<ToolkitLike> | null = null;

/** Insert <print new-system="yes"/> at every Nth measure of each <part> so
 *  Verovio (with breaks:"encoded") lays the score out N bars per line.
 *  Falls back to the original XML if parsing fails. */
function injectSystemBreaks(xml: string, barsPerLine: number): string {
  if (barsPerLine <= 0) return xml;
  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) return xml;
    const parts = Array.from(doc.getElementsByTagName("part"));
    const partsList = parts.length ? parts : [doc.documentElement];
    for (const part of partsList) {
      const measures = Array.from(part.children).filter(c => c.tagName === "measure");
      for (let i = barsPerLine; i < measures.length; i += barsPerLine) {
        const m = measures[i];
        const has = Array.from(m.children).some(c => c.tagName === "print" && c.getAttribute("new-system") === "yes");
        if (has) continue;
        const print = doc.createElement("print");
        print.setAttribute("new-system", "yes");
        m.insertBefore(print, m.firstChild);
      }
    }
    return new XMLSerializer().serializeToString(doc);
  } catch {
    return xml;
  }
}

async function getToolkit(): Promise<ToolkitLike> {
  if (!toolkitPromise) {
    toolkitPromise = (async () => {
      const [{ default: createVerovioModule }, { VerovioToolkit }] = await Promise.all([
        import("verovio/wasm"),
        import("verovio/esm"),
      ]);
      const VerovioModule = await createVerovioModule();
      return new VerovioToolkit(VerovioModule) as unknown as ToolkitLike;
    })();
  }
  return toolkitPromise;
}

export async function exportToPdfViaVerovio(
  sections: VerovioPdfSection[],
  fileName: string,
  options: VerovioPdfOptions,
): Promise<void> {
  if (sections.length === 0) return;

  const toolkit = await getToolkit();

  // A4 portrait (per user direction): 595 × 842 pt.  Engraved scores read
  // naturally as portrait pages, like a printed lead sheet.
  const PAGE_W = 595;
  const PAGE_H = 842;
  const MARGIN = 36;

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  let firstPage = true;

  for (const section of sections) {
    // Force exactly N bars per line by injecting <print new-system="yes"/>
    // into the MusicXML at every Nth measure, then telling Verovio to
    // respect those encoded system breaks.
    const xml = injectSystemBreaks(section.musicXml, 4);

    // Verovio page units are 1/10 mm.  A4 portrait = 210 × 297 mm.
    // Generous margins inside the engraving so notation breathes; the
    // outer PDF margin is applied separately when we place the SVG.
    // `header: "none"` suppresses Verovio's engraved title block — we
    // draw a single document title via doc.text below, so we don't want
    // a second title baked into the score.
    toolkit.setOptions({
      inputFrom: "musicxml",
      font: "Leipzig",
      pageWidth: 2100,
      pageHeight: 2970,
      pageMarginLeft: 100,
      pageMarginRight: 100,
      pageMarginTop: 100,
      pageMarginBottom: 100,
      scale: 40,
      adjustPageHeight: true,
      breaks: "encoded",
      header: "none",
      svgViewBox: true,
    });

    if (!toolkit.loadData(xml)) {
      console.warn("[Verovio] Failed to load MusicXML for section:", section.title);
      continue;
    }

    const pageCount = toolkit.getPageCount();
    for (let p = 1; p <= pageCount; p++) {
      if (!firstPage) doc.addPage();
      firstPage = false;

      let yCursor = MARGIN;
      if (options.showTitles && section.title && p === 1) {
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(20);
        doc.text(section.title, PAGE_W / 2, yCursor + 16, { align: "center" });
        yCursor += 36;
      }

      const svgString = toolkit.renderToSVG(p);
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
      const svg = svgDoc.documentElement as unknown as SVGSVGElement;

      // Verovio's SVG width/height come back in mm (e.g. "297mm").  The
      // viewBox carries the unitless coordinate system svg2pdf actually
      // measures against, so prefer that for fit math.
      let naturalW = 0;
      let naturalH = 0;
      const vb = svg.getAttribute("viewBox");
      if (vb) {
        const parts = vb.trim().split(/\s+/);
        if (parts.length === 4) {
          naturalW = parseFloat(parts[2]);
          naturalH = parseFloat(parts[3]);
        }
      }
      if (!naturalW) naturalW = parseFloat(svg.getAttribute("width") ?? "0") || 800;
      if (!naturalH) naturalH = parseFloat(svg.getAttribute("height") ?? "0") || 600;

      const usableW = PAGE_W - 2 * MARGIN;
      const usableH = PAGE_H - yCursor - MARGIN;
      const scale = Math.min(usableW / naturalW, usableH / naturalH);
      const fitW = naturalW * scale;
      const fitH = naturalH * scale;
      const xCenter = (PAGE_W - fitW) / 2;

      // svg2pdf needs the SVG attached to the live DOM so it can resolve
      // any layout/measurement queries during traversal.
      const stage = document.createElement("div");
      stage.style.position = "absolute";
      stage.style.left = "-99999px";
      stage.style.top = "0";
      stage.appendChild(svg);
      document.body.appendChild(stage);
      try {
        await svg2pdf(svg, doc, {
          x: xCenter,
          y: yCursor,
          width: fitW,
          height: fitH,
        });
      } finally {
        stage.remove();
      }
    }
  }

  doc.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
}
