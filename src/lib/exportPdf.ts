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
  const items: { title: string | undefined; svg: SVGSVGElement }[] = sections
    .map(s => {
      const svg = s.element.querySelector("svg") as SVGSVGElement | null;
      return svg ? { title: s.title, svg } : null;
    })
    .filter((x): x is { title: string | undefined; svg: SVGSVGElement } => x !== null);

  if (items.length === 0) return;

  // A4 landscape (842 × 595 pt) suits wide drum scores.
  const PAGE_W = 842;
  const PAGE_H = 595;
  const MARGIN = 36;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  let firstPage = true;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const orig = item.svg;
    const naturalW = parseFloat(orig.getAttribute("width") ?? "0") || orig.clientWidth || 800;
    const naturalH = parseFloat(orig.getAttribute("height") ?? "0") || orig.clientHeight || 200;

    // Width-fit scale.  Per direct user feedback ('export pdf for
    // scores in drum look terrible i cant decipher it'): the previous
    // `Math.min(..., 1)` cap prevented UPSCALING, so scores rendered
    // at their natural editor pixel size which sits well below the
    // page width on A4 landscape — notes ended up at ~50–65% of
    // readable size.  Now we scale to fill the page width even if
    // that means going above 1×, and split into multiple pages
    // vertically when the resulting height exceeds one page.
    const usableW = PAGE_W - 2 * MARGIN;
    const titleH = options.showTitles && item.title ? 36 : 0;
    const usableHFirst  = PAGE_H - MARGIN - titleH - MARGIN;
    const usableHFollow = PAGE_H - 2 * MARGIN;

    const widthScale = usableW / naturalW;
    const scaledH = naturalH * widthScale;

    // Convert scaled-page heights back to natural-SVG y coordinates
    // — that's what we'll slice on between pages.
    const pageBudgetFirst  = usableHFirst  / widthScale;
    const pageBudgetFollow = usableHFollow / widthScale;

    let svgYCursor = 0;          // top of remaining SVG content (natural coords)
    let pageNumWithinSection = 0;

    while (svgYCursor < naturalH - 0.5) {
      if (!firstPage) doc.addPage();
      firstPage = false;

      let yCursor = MARGIN;
      if (pageNumWithinSection === 0 && options.showTitles && item.title) {
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(20);
        doc.text(item.title, PAGE_W / 2, yCursor + 16, { align: "center" });
        yCursor += 36;
      }

      const budget = pageNumWithinSection === 0 ? pageBudgetFirst : pageBudgetFollow;
      const sliceH = Math.min(budget, naturalH - svgYCursor);
      const renderH = sliceH * widthScale;

      // Clone + viewBox the clone to the current slice so svg2pdf
      // only paints that vertical band of the score.
      const clone = clonePrintableSvg(orig);
      clone.setAttribute("viewBox", `0 ${svgYCursor} ${naturalW} ${sliceH}`);
      clone.setAttribute("preserveAspectRatio", "xMidYMin meet");
      clone.setAttribute("width", String(naturalW));
      clone.setAttribute("height", String(sliceH));

      const stage = document.createElement("div");
      stage.style.position = "absolute";
      stage.style.left = "-99999px";
      stage.style.top = "0";
      stage.appendChild(clone);
      document.body.appendChild(stage);
      try {
        await svg2pdf(clone, doc, {
          x: MARGIN,
          y: yCursor,
          width: usableW,
          height: renderH,
        });
      } finally {
        stage.remove();
      }

      svgYCursor += sliceH;
      pageNumWithinSection += 1;
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
