// ── PDF Export via print window ──────────────────────────────────────────────
//
// Captures notation elements as images (removing VexFlow invert filter),
// builds a print-friendly HTML page, and triggers the browser print dialog.

export interface PdfSection {
  title?: string;
  element: HTMLElement;
}

export interface PdfOptions {
  showTitles: boolean;
  splitSections: boolean;
}

/**
 * Capture a notation element as a PNG data URL suitable for print.
 * Temporarily disables the SVG invert(1) filter to get dark-on-white output.
 */
async function captureForPrint(element: HTMLElement): Promise<string> {
  // Find SVGs with invert filter and temporarily disable
  const svgs = element.querySelectorAll("svg");
  const origFilters: string[] = [];
  svgs.forEach((svg, i) => {
    origFilters[i] = (svg as SVGSVGElement).style.filter;
    (svg as SVGSVGElement).style.filter = "none";
  });

  // Also handle abcjs elements (foreground color is light)
  const abcEls = element.querySelectorAll(".abcjs-container svg");
  const origFills: { el: SVGElement; fill: string }[] = [];
  abcEls.forEach(el => {
    const svg = el as SVGElement;
    origFills.push({ el: svg, fill: svg.style.fill });
  });

  try {
    const { toCanvas } = await import("html-to-image");
    const canvas = await toCanvas(element, {
      backgroundColor: "#ffffff",
      pixelRatio: 2,
    });
    return canvas.toDataURL("image/png");
  } finally {
    // Restore filters
    svgs.forEach((svg, i) => {
      (svg as SVGSVGElement).style.filter = origFilters[i];
    });
    origFills.forEach(({ el, fill }) => {
      el.style.fill = fill;
    });
  }
}

function buildPrintHtml(
  captures: { title?: string; dataUrl: string }[],
  fileName: string,
  options: PdfOptions,
): string {
  const sections = captures.map((c, i) => {
    const titleHtml = options.showTitles && c.title
      ? `<h2 style="font-family:Georgia,serif;font-size:18px;margin:0 0 8px;color:#222;">${escHtml(c.title)}</h2>`
      : "";
    const pageBreak = options.splitSections && i > 0
      ? 'style="page-break-before:always;"'
      : i > 0
      ? 'style="margin-top:24px;"'
      : "";
    return `<div ${pageBreak}>${titleHtml}<img src="${c.dataUrl}" style="max-width:100%;height:auto;" /></div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escHtml(fileName)}</title>
  <style>
    @media print {
      body { margin: 0; padding: 12mm; }
      img { max-width: 100% !important; }
      #export-toolbar { display: none !important; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #fff;
      color: #111;
      padding: 20px;
    }
    #export-toolbar {
      position: sticky; top: 0; z-index: 1000;
      display: flex; align-items: center; gap: 8px;
      padding: 8px 14px; margin: -20px -20px 16px;
      background: #1a1a2a; border-bottom: 1px solid #333;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #export-toolbar button {
      padding: 5px 12px; border-radius: 5px; font-size: 11px; font-weight: 700;
      cursor: pointer; border: 1px solid #3a3a7a; background: #1e1e3a;
      color: #9a9cf8; letter-spacing: 0.5px; transition: all 80ms;
    }
    #export-toolbar button:hover { background: #2a2a4a; }
    #export-toolbar .toolbar-label {
      font-size: 11px; color: #666; margin-right: auto;
    }
    #export-content[contenteditable="true"] {
      outline: none;
      min-height: 100px;
    }
    #export-content[contenteditable="true"]:focus {
      box-shadow: inset 0 0 0 2px rgba(113,115,230,0.15);
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div id="export-toolbar">
    <span class="toolbar-label">Edit content below, then export</span>
    <button onclick="window.print()" title="Print or save as PDF">Print / PDF</button>
    <button onclick="downloadHtml()" title="Download edited HTML">Download HTML</button>
  </div>
  <div id="export-content" contenteditable="true">
    ${sections}
  </div>
  <script>
    function downloadHtml() {
      var content = document.getElementById('export-content').innerHTML;
      var html = '<!DOCTYPE html>\\n<html>\\n<head>\\n<meta charset="utf-8"/>\\n'
        + '<title>${escHtml(fileName).replace(/'/g, "\\'")}</title>\\n'
        + '<style>\\nbody{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fff;color:#111;padding:20px;}\\n'
        + '@media print{body{margin:0;padding:12mm;}img{max-width:100%!important;}}\\n</style>\\n'
        + '</head>\\n<body>\\n' + content + '\\n</body>\\n</html>';
      var blob = new Blob([html], { type: 'text/html' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = '${escHtml(fileName).replace(/'/g, "\\'")}' + '.html';
      a.click();
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Export notation sections to PDF via browser print dialog.
 */
export async function exportToPdf(
  sections: PdfSection[],
  fileName: string,
  options: PdfOptions,
): Promise<void> {
  const captures = await Promise.all(
    sections.map(async s => ({
      title: s.title,
      dataUrl: await captureForPrint(s.element),
    })),
  );

  const html = buildPrintHtml(captures, fileName, options);
  const win = window.open("", "_blank");
  if (!win) {
    alert("Popup blocked. Please allow popups to export PDF.");
    return;
  }
  win.document.write(html);
  win.document.close();
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
