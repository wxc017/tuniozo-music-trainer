// ── PDF Export via jspdf + svg2pdf ───────────────────────────────────────────
//
// Renders notation SVGs directly into a vector PDF (no PNG raster, no print
// dialog).  The PDF is assembled in-memory and triggers a download
// automatically.  Notation glyphs render as actual SVG paths so they're
// crisp at any zoom and don't depend on the browser's font infrastructure.

import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";

export interface PdfSection {
  title?: string;
  element: HTMLElement;
}

export interface PdfOptions {
  showTitles: boolean;
  splitSections: boolean;
}

/**
 * Clone an SVG and recolour it for printing.  The live editor SVG is
 * white-on-black (post-processed at render time) — the cloned copy
 * needs to read black-on-white for paper.  Returns a detached SVG
 * that can be passed straight to svg2pdf.
 */
function clonePrintableSvg(orig: SVGSVGElement): SVGSVGElement {
  const svg = orig.cloneNode(true) as SVGSVGElement;
  svg.style.filter = "none";
  svg.removeAttribute("filter");
  if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const WHITE_RE = /^(white|#fff(fff)?|rgb\(255\s*,\s*255\s*,\s*255\))$/i;
  const recolour = (node: Element) => {
    const fill = node.getAttribute("fill");
    if (fill && WHITE_RE.test(fill.trim())) node.setAttribute("fill", "#000000");
    const stroke = node.getAttribute("stroke");
    if (stroke && WHITE_RE.test(stroke.trim())) node.setAttribute("stroke", "#000000");
    const styleAttr = node.getAttribute("style");
    if (styleAttr) {
      const fixed = styleAttr
        .replace(/(fill\s*:\s*)(white|#fff(?:fff)?|rgb\(255,\s*255,\s*255\))/gi, "$1#000000")
        .replace(/(stroke\s*:\s*)(white|#fff(?:fff)?|rgb\(255,\s*255,\s*255\))/gi, "$1#000000");
      if (fixed !== styleAttr) node.setAttribute("style", fixed);
    }
  };
  recolour(svg);
  svg.querySelectorAll("*").forEach(recolour);
  return svg;
}

/**
 * Export notation sections directly to a downloadable PDF.  No print
 * window, no edit UI — clicking the button triggers a file download.
 * The score SVG is rendered into the PDF as vector paths, centered on
 * the page with the title at the top.  A4 landscape; multi-page if
 * the score is taller than a single page.
 */
export async function exportToPdf(
  sections: PdfSection[],
  fileName: string,
  options: PdfOptions,
): Promise<void> {
  // Collect the score SVG from each section.  Sibling overlays
  // (X-ray grid, drag-rect, hover dot) live OUTSIDE scoreRef so
  // querying scoreRef directly returns just the VexFlow render.
  const items = sections
    .map(s => {
      const svg = s.element.querySelector("svg") as SVGSVGElement | null;
      return svg ? { title: s.title, svg } : null;
    })
    .filter((x): x is { title?: string; svg: SVGSVGElement } => x !== null);

  if (items.length === 0) return;

  // A4 landscape (842 × 595 pt) suits wide drum scores.
  const PAGE_W = 842;
  const PAGE_H = 595;
  const MARGIN = 36;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i > 0) doc.addPage();

    let yCursor = MARGIN;
    if (options.showTitles && item.title) {
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(20);
      doc.text(item.title, PAGE_W / 2, yCursor + 16, { align: "center" });
      yCursor += 36;
    }

    const orig = item.svg;
    const naturalW = parseFloat(orig.getAttribute("width") ?? "0") || orig.clientWidth || 800;
    const naturalH = parseFloat(orig.getAttribute("height") ?? "0") || orig.clientHeight || 200;
    const usableW = PAGE_W - 2 * MARGIN;
    const usableH = PAGE_H - yCursor - MARGIN;
    const scale = Math.min(usableW / naturalW, usableH / naturalH, 1);
    const fitW = naturalW * scale;
    const fitH = naturalH * scale;
    const xCenter = (PAGE_W - fitW) / 2;

    const clone = clonePrintableSvg(orig);
    // svg2pdf walks a real (in-document) SVG element.  Attach the
    // clone to a hidden container so any layout / measurement queries
    // resolve correctly during conversion.
    const stage = document.createElement("div");
    stage.style.position = "absolute";
    stage.style.left = "-99999px";
    stage.style.top = "0";
    stage.appendChild(clone);
    document.body.appendChild(stage);
    try {
      await svg2pdf(clone, doc, {
        x: xCenter,
        y: yCursor,
        width: fitW,
        height: fitH,
      });
    } finally {
      stage.remove();
    }
  }

  doc.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
}

/**
 * Download a MusicXML string as a file.
 */
export function downloadMusicXml(xml: string, fileName: string): void {
  const blob = new Blob([xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".musicxml") ? fileName : `${fileName}.musicxml`;
  a.click();
  URL.revokeObjectURL(url);
}
