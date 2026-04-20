import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

// Configure worker — use legacy build for broader compatibility (Uint8Array.toHex polyfill)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  import.meta.url,
).href;

export interface TocEntry {
  title: string;
  pageIndex: number; // 0-based
  depth: number;
}

export interface SearchMatch {
  page: number;
  matchIndexOnPage: number;
}

interface Props {
  fileData: ArrayBuffer;
  lastPage: number;
  lastScrollFraction: number;
  onPageChange: (page: number, scrollFraction: number) => void;
  onTocLoaded: (toc: TocEntry[]) => void;
}

export default function PdfViewer({ fileData, lastPage, lastScrollFraction, onPageChange, onTocLoaded }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.3);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Track the visible page in a ref so zoom can restore it without stale closure
  const visiblePageRef = useRef(1);
  // Flag: true only on initial load, so we scroll to lastPage once
  const initialLoadRef = useRef(true);

  // Load PDF
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadError(null);
      try {
        const data = new Uint8Array(fileData);
        const doc = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;
        setPdf(doc);
        setTotalPages(doc.numPages);
        initialLoadRef.current = true;

        // Extract table of contents
        try {
          const outline = await doc.getOutline();
          const toc = await buildToc(doc, outline);
          onTocLoaded(toc);
        } catch {
          onTocLoaded([]);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("PDF load failed:", msg);
        setLoadError(msg);
        onTocLoaded([]);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [fileData]);

  // Track scroll offset within the current page so zoom can restore position
  const scrollFractionRef = useRef(0);
  // Render generation counter — scroll handler ignores events from stale renders
  const renderGenRef = useRef(0);
  const activeGenRef = useRef(0);

  // How many pages above/below the viewport to keep rendered
  const PAGE_BUFFER = 3;
  // Track which pages currently have a rendered canvas
  const renderedPagesRef = useRef<Set<number>>(new Set());
  // Store viewports so we can render on demand without re-fetching page dimensions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewportsRef = useRef<Map<number, any>>(new Map());

  // Build page placeholders (Phase 1) — runs once per pdf/scale change
  useEffect(() => {
    if (!pdf || !containerRef.current) return;

    const gen = ++renderGenRef.current;
    activeGenRef.current = gen;

    const rawTarget = initialLoadRef.current
      ? (lastPage > 0 ? lastPage : 1)
      : visiblePageRef.current;
    const scrollTarget = Math.max(1, Math.min(rawTarget, pdf.numPages));
    const savedFraction = Math.max(0, Math.min(1, initialLoadRef.current ? lastScrollFraction : scrollFractionRef.current));

    visiblePageRef.current = scrollTarget;
    scrollFractionRef.current = savedFraction;
    setCurrentPage(scrollTarget);

    const buildPlaceholders = async () => {
      const container = containerRef.current!;
      container.innerHTML = "";
      pageRefs.current.clear();
      renderedPagesRef.current.clear();
      viewportsRef.current.clear();

      // Fetch only the first page's viewport to use as an estimate for all pages.
      // This avoids sequentially fetching all N pages before showing anything.
      const firstPage = await pdf.getPage(1);
      if (gen !== renderGenRef.current) return;
      const firstViewport = firstPage.getViewport({ scale });
      viewportsRef.current.set(1, firstViewport);

      const estWidth = firstViewport.width;
      const estHeight = firstViewport.height;

      for (let i = 1; i <= pdf.numPages; i++) {
        const pageDiv = document.createElement("div");
        pageDiv.className = "pdf-page-wrapper";
        pageDiv.style.position = "relative";
        pageDiv.style.marginBottom = "8px";
        pageDiv.style.width = `${estWidth}px`;
        pageDiv.style.height = `${estHeight}px`;
        pageDiv.style.background = "#181818";
        pageDiv.dataset.page = String(i);

        container.appendChild(pageDiv);
        pageRefs.current.set(i, pageDiv);
      }

      // Scroll to correct position
      const wasInitial = initialLoadRef.current;
      initialLoadRef.current = false;

      // Set scroll position synchronously — placeholders are already in the DOM
      if (scrollTarget > 0 && scrollTarget <= pdf.numPages) {
        const el = pageRefs.current.get(scrollTarget);
        if (el) {
          container.scrollTop = Math.max(0, el.offsetTop + savedFraction * el.offsetHeight);
        }
      }

      // Use rAF to finalize — keep activeGenRef non-zero to suppress scroll
      // handler until rendering completes and scroll position is corrected.
      requestAnimationFrame(async () => {
        if (gen !== renderGenRef.current) return;

        // Set provisional page for display while rendering proceeds.
        // Don't call onPageChange yet — page heights are still estimates,
        // so detectCurrentPage may return a wrong number.  The post-render
        // block below will fire the authoritative onPageChange.
        setCurrentPage(scrollTarget);
        visiblePageRef.current = scrollTarget;
        scrollFractionRef.current = savedFraction;

        // Keep activeGenRef non-zero — scroll handler stays suppressed
        // until after rendering finishes and we correct the scroll position.
        // Multiple passes needed: rendering changes page heights (placeholders
        // use page 1's estimate), which shifts the viewport, which may change
        // which pages are visible. Each pass corrects further.
        for (let pass = 0; pass < 3; pass++) {
          await renderVisiblePages();
          const targetEl = pageRefs.current.get(scrollTarget);
          const cont = containerRef.current;
          if (targetEl && cont) {
            cont.scrollTo({ top: targetEl.offsetTop + savedFraction * targetEl.offsetHeight, behavior: "instant" });
          }
        }
        // After rendering, page heights may differ from placeholders — detect
        // the actual visible page rather than trusting the original scrollTarget.
        const finalPage = detectCurrentPage() ?? scrollTarget;
        // Recompute fraction relative to the detected page (may differ from
        // savedFraction if the final page is not the original scrollTarget).
        const finalEl = pageRefs.current.get(finalPage);
        const cont2 = containerRef.current;
        const finalFraction = (finalEl && cont2)
          ? Math.max(0, Math.min(1, (cont2.scrollTop - finalEl.offsetTop) / (finalEl.offsetHeight || 1)))
          : savedFraction;
        setCurrentPage(finalPage);
        visiblePageRef.current = finalPage;
        scrollFractionRef.current = finalFraction;
        onPageChange(finalPage, finalFraction);

        // Enable the scroll handler only after pending scroll events from the
        // scrollTo calls above have drained.  Without this delay, queued scroll
        // events fire with activeGenRef already 0, causing the scroll handler to
        // detect a wrong page from partially-rendered page heights.
        await new Promise(r => requestAnimationFrame(r));
        activeGenRef.current = 0;

        // Post-stabilization: after everything settles (rendering may trigger
        // further scroll events that change page heights), verify the page
        // number one more time and correct if needed.
        setTimeout(() => {
          if (gen !== renderGenRef.current) return;
          const stablePage = detectCurrentPage();
          if (stablePage && stablePage !== visiblePageRef.current) {
            setCurrentPage(stablePage);
            visiblePageRef.current = stablePage;
            const el = pageRefs.current.get(stablePage);
            const c = containerRef.current;
            const frac = (el && c)
              ? Math.max(0, Math.min(1, (c.scrollTop - el.offsetTop) / (el.offsetHeight || 1)))
              : 0;
            scrollFractionRef.current = frac;
            onPageChange(stablePage, frac);
          }
        }, 500);
      });
    };
    buildPlaceholders();
    return () => { /* gen check handles cancellation */ };
  }, [pdf, scale]);

  // Render / evict pages based on scroll position
  const renderingRef = useRef(false);
  const pendingRenderRef = useRef(false);

  // Detect the page at the viewport top (the page the scrollTop falls within).
  // Using the viewport top rather than center ensures the saved scroll fraction
  // (scrollTop relative to page top) round-trips correctly on restore.
  const detectCurrentPage = useCallback((): number | null => {
    const container = containerRef.current;
    if (!container) return null;
    const scrollTop = container.scrollTop;
    let found = 1;
    for (const [num, el] of pageRefs.current) {
      const top = el.offsetTop;
      const bottom = top + el.offsetHeight;
      if (scrollTop >= top && scrollTop < bottom) {
        found = num;
        break;
      }
      if (top > scrollTop) break;
      found = num;
    }
    return found;
  }, []);

  const getVisiblePages = useCallback((): Set<number> => {
    const container = containerRef.current;
    if (!container) return new Set();
    const scrollTop = container.scrollTop;
    const viewHeight = container.clientHeight;
    const visible = new Set<number>();
    for (const [num, el] of pageRefs.current) {
      const top = el.offsetTop;
      const bottom = top + el.offsetHeight;
      if (bottom >= scrollTop - viewHeight * PAGE_BUFFER && top <= scrollTop + viewHeight * (1 + PAGE_BUFFER)) {
        visible.add(num);
      }
    }
    return visible;
  }, []);

  const renderVisiblePages = useCallback(async () => {
    if (!pdf || !containerRef.current) return;

    // If already rendering, queue a follow-up pass instead of dropping the call
    if (renderingRef.current) {
      pendingRenderRef.current = true;
      return;
    }
    renderingRef.current = true;
    pendingRenderRef.current = false;

    try {
      // Re-read visible set at start of each pass (scroll may have changed)
      const visible = getVisiblePages();

      // Evict pages that are no longer near the viewport
      for (const num of renderedPagesRef.current) {
        if (!visible.has(num)) {
          const el = pageRefs.current.get(num);
          if (el) {
            const canvas = el.querySelector("canvas");
            if (canvas) {
              canvas.width = 0;
              canvas.height = 0;
              canvas.remove();
            }
            el.style.background = "#181818";
          }
          renderedPagesRef.current.delete(num);
        }
      }

      // Render newly visible pages
      for (const num of visible) {
        if (renderedPagesRef.current.has(num)) continue;

        // Re-check visibility before each expensive render — user may have scrolled away
        const stillVisible = getVisiblePages();
        if (!stillVisible.has(num)) continue;

        const el = pageRefs.current.get(num);
        if (!el) continue;

        const page = await pdf.getPage(num);
        if (!containerRef.current) break;

        // Fetch actual viewport if not cached (placeholders used an estimate)
        let viewport = viewportsRef.current.get(num);
        if (!viewport) {
          viewport = page.getViewport({ scale });
          viewportsRef.current.set(num, viewport);
          // Update placeholder dimensions to match actual page size
          el.style.width = `${viewport.width}px`;
          el.style.height = `${viewport.height}px`;
        }

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;

        // Verify page still exists and is still needed
        if (!pageRefs.current.has(num)) {
          canvas.width = 0;
          canvas.height = 0;
          continue;
        }

        el.style.background = "";
        el.appendChild(canvas);
        renderedPagesRef.current.add(num);
      }
    } finally {
      renderingRef.current = false;
      // If a render was requested while we were busy, run another pass
      if (pendingRenderRef.current) {
        pendingRenderRef.current = false;
        renderVisiblePages();
      }
    }
  }, [pdf, scale, getVisiblePages]);

  // Scroll to a specific page (used by TOC and bookmarks)
  const scrollToPage = useCallback((pageNum: number) => {
    const el = pageRefs.current.get(pageNum);
    const container = containerRef.current;
    if (el && container) {
      // Use instant scroll — smooth scroll breaks when renderVisiblePages()
      // changes page heights mid-animation, causing the final position to
      // land on the wrong page.
      container.scrollTo({ top: el.offsetTop, behavior: "instant" });
      setCurrentPage(pageNum);
      visiblePageRef.current = pageNum;
      onPageChange(pageNum, 0);
      // Render visible pages, then re-verify scroll position after each pass
      // (rendering may change page heights, shifting the target offset)
      const reScrollIfNeeded = () => {
        renderVisiblePages();
        const targetEl = pageRefs.current.get(pageNum);
        if (targetEl && containerRef.current) {
          const detected = detectCurrentPage();
          if (detected !== pageNum) {
            containerRef.current.scrollTo({ top: targetEl.offsetTop, behavior: "instant" });
          }
        }
      };
      reScrollIfNeeded();
      setTimeout(reScrollIfNeeded, 300);
      setTimeout(reScrollIfNeeded, 600);
    }
  }, [onPageChange, renderVisiblePages, detectCurrentPage]);

  // Jump to a page (alias for scrollToPage, kept for API compatibility)
  const highlightText = useCallback((pageNum: number, _text: string) => {
    scrollToPage(pageNum);
  }, [scrollToPage]);

  // Track current page on scroll + fractional position within page for zoom restore
  // Debounce timer for persisting scroll fraction
  const fractionSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable ref for onPageChange so the scroll handler never needs to re-bind
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleScroll = () => {
      // Suppress during initial load or active re-render
      if (initialLoadRef.current || activeGenRef.current !== 0) return;

      // Detect the page at the viewport top (consistent with detectCurrentPage)
      const scrollTop = container.scrollTop;
      let closest = 1;
      for (const [num, el] of pageRefs.current) {
        const top = el.offsetTop;
        const bottom = top + el.offsetHeight;
        if (scrollTop >= top && scrollTop < bottom) { closest = num; break; }
        if (top > scrollTop) break;
        closest = num;
      }
      // Track how far into the current page the viewport top is
      const pageEl = pageRefs.current.get(closest);
      if (pageEl) {
        const pageTop = pageEl.offsetTop;
        const fraction = Math.max(0, Math.min(1, (scrollTop - pageTop) / (pageEl.offsetHeight || 1)));
        scrollFractionRef.current = fraction;
      }
      // Use the ref (always current) instead of state (stale closure)
      if (closest !== visiblePageRef.current) {
        setCurrentPage(closest);
        visiblePageRef.current = closest;
        onPageChangeRef.current(closest, scrollFractionRef.current);
      } else {
        // Same page — debounce fraction saves (500ms) to avoid thrashing
        if (fractionSaveTimer.current) clearTimeout(fractionSaveTimer.current);
        fractionSaveTimer.current = setTimeout(() => {
          onPageChangeRef.current(closest, scrollFractionRef.current);
        }, 500);
      }
    };
    // Render visible pages on scroll (debounced to avoid thrashing during fast scrolling)
    let renderTimer: ReturnType<typeof setTimeout> | null = null;
    const handleScrollRender = () => {
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(() => renderVisiblePages(), 150);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("scroll", handleScrollRender, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("scroll", handleScrollRender);
      if (renderTimer) clearTimeout(renderTimer);
      if (fractionSaveTimer.current) clearTimeout(fractionSaveTimer.current);
    };
  }, [renderVisiblePages]);

  // ── Search functionality ──────────────────────────────────────────────

  const searchText = useCallback(async (query: string): Promise<SearchMatch[]> => {
    if (!pdf || !query.trim()) return [];
    const results: SearchMatch[] = [];
    const q = query.toLowerCase();

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const text = content.items
        .filter((it): it is (typeof it & { str: string }) => "str" in it)
        .map(it => it.str)
        .join("");
      const lower = text.toLowerCase();
      let pos = 0;
      let idx = 0;
      while ((pos = lower.indexOf(q, pos)) !== -1) {
        results.push({ page: p, matchIndexOnPage: idx++ });
        pos += 1;
      }
    }
    return results;
  }, [pdf]);

  const highlightOnPage = useCallback(async (pageNum: number, query: string, activeMatchOnPage: number) => {
    // Clear existing highlights on all pages
    for (const [, el] of pageRefs.current) {
      el.querySelectorAll(".pdf-search-hl").forEach(h => h.remove());
    }
    if (!pdf || !query.trim()) return;

    const pageEl = pageRefs.current.get(pageNum);
    if (!pageEl) return;

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const content = await page.getTextContent();
    const items = content.items.filter(
      (it): it is (typeof it & { str: string; transform: number[]; width: number }) =>
        "str" in it,
    );

    // Build character → item mapping
    let fullText = "";
    const charMap: { item: (typeof items)[number] }[] = [];
    for (const item of items) {
      for (let c = 0; c < item.str.length; c++) charMap.push({ item });
      fullText += item.str;
    }

    const q = query.toLowerCase();
    const lower = fullText.toLowerCase();
    let pos = 0;
    let matchIdx = 0;

    while ((pos = lower.indexOf(q, pos)) !== -1) {
      const isCurrent = matchIdx === activeMatchOnPage;
      const endPos = pos + q.length;

      // Collect unique items that span this match
      const seen = new Set<typeof items[0]>();
      for (let c = pos; c < endPos && c < charMap.length; c++) seen.add(charMap[c].item);

      for (const item of seen) {
        const [vx, vy] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        const fontSizePdf = Math.hypot(item.transform[0], item.transform[1]);
        const fontSizeVp = fontSizePdf * viewport.scale;
        const widthVp = item.width * viewport.scale;

        const div = document.createElement("div");
        div.className = "pdf-search-hl";
        Object.assign(div.style, {
          position: "absolute",
          left: `${vx}px`,
          top: `${vy - fontSizeVp}px`,
          width: `${widthVp}px`,
          height: `${fontSizeVp * 1.3}px`,
          background: isCurrent ? "rgba(230,160,23,0.45)" : "rgba(255,255,60,0.25)",
          pointerEvents: "none",
          borderRadius: "2px",
          ...(isCurrent ? { outline: "2px solid rgba(230,160,23,0.8)", zIndex: "1" } : {}),
        });
        pageEl.appendChild(div);
      }
      matchIdx++;
      pos += 1;
    }
  }, [pdf, scale]);

  const clearHighlights = useCallback(() => {
    for (const [, el] of pageRefs.current) {
      el.querySelectorAll(".pdf-search-hl").forEach(h => h.remove());
    }
  }, []);

  return {
    totalPages,
    currentPage,
    scale,
    setScale,
    scrollToPage,
    highlightText,
    containerRef,
    searchText,
    highlightOnPage,
    clearHighlights,
    loadError,
    viewerUI: loadError ? (
      <div className="flex-1 min-h-0 flex items-center justify-center px-4 py-8">
        <div className="bg-[#2a1a1a] border border-[#5a2a2a] rounded-lg p-6 max-w-md text-center space-y-3">
          <div className="text-[#e06060] text-lg font-semibold">Failed to load PDF</div>
          <p className="text-xs text-[#cc8888] leading-relaxed">{loadError}</p>
          <p className="text-[10px] text-[#885555]">
            The file may be corrupted, password-protected, or in an unsupported format.
          </p>
        </div>
      </div>
    ) : (
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto px-4 py-4 flex flex-col items-center"
        style={{ userSelect: "text", overscrollBehavior: "contain" }}
      />
    ),
  };
}

// ── TOC extraction — scans actual page text for structural headings ───────

/**
 * Heading patterns ordered by hierarchy (depth).
 * Each regex is tested against lines extracted from page text.
 * We look for PART, CHAPTER, SECTION etc. with a number/roman numeral
 * and optionally a title on the same line or the next line.
 */
const HEADING_PATTERNS: { re: RegExp; depth: number; label: string }[] = [
  // "PART I", "Part One", "PART I: TITLE", "PART 1 — TITLE"
  { re: /^PART\s+([IVXLCDM]+|\d+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)[\s.:—\-]*(.*)/i, depth: 0, label: "Part" },
  // "CHAPTER I", "Chapter 1", "CHAPTER IV THE TITLE", "Chapter 1: Title"
  { re: /^CHAPTER\s+([IVXLCDM]+|\d+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)[\s.:—\-]*(.*)/i, depth: 1, label: "Chapter" },
  // "SECTION I", "Section 1", "Section 3.2"
  { re: /^SECTION\s+([IVXLCDM\d.]+)[\s.:—\-]*(.*)/i, depth: 2, label: "Section" },
  // "BOOK I", "Book One"
  { re: /^BOOK\s+([IVXLCDM]+|\d+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)[\s.:—\-]*(.*)/i, depth: 0, label: "Book" },
  // "PREFACE", "INTRODUCTION", "FOREWORD", "PROLOGUE", "EPILOGUE", "CONCLUSION", "APPENDIX"
  { re: /^(PREFACE|INTRODUCTION|FOREWORD|PROLOGUE|EPILOGUE|CONCLUSION|AFTERWORD|APPENDIX(?:\s+[A-Z\d])?)[\s.:—\-]*(.*)/i, depth: 1, label: "" },
];

/**
 * Scan every page of the PDF for structural headings.
 * This is more reliable than the PDF outline for merged/scanned PDFs.
 * We extract lines from each page's text content and test them against
 * known heading patterns. Large font items get priority as headings.
 */
async function buildTocFromText(doc: pdfjsLib.PDFDocumentProxy): Promise<TocEntry[]> {
  const entries: TocEntry[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    const content = await page.getTextContent();

    // Group text items into lines: items at similar Y positions are one line.
    // Also track font size to identify headings (larger text).
    const items = content.items.filter(
      (it): it is (typeof it & { str: string; transform: number[] }) =>
        "str" in it && !!it.str.trim()
    );
    if (items.length === 0) continue;

    // Collect candidate lines: group by Y coordinate (within 3px tolerance)
    const lines: { text: string; fontSize: number; y: number }[] = [];
    let currentY = -999;
    let currentLine = "";
    let currentFontSize = 0;

    for (const item of items) {
      const y = Math.round(item.transform[5]);
      const fontSize = Math.sqrt(item.transform[0] ** 2 + item.transform[1] ** 2);
      if (Math.abs(y - currentY) > 3) {
        if (currentLine.trim()) {
          lines.push({ text: currentLine.trim(), fontSize: currentFontSize, y: currentY });
        }
        currentLine = item.str;
        currentFontSize = fontSize;
        currentY = y;
      } else {
        currentLine += " " + item.str;
        currentFontSize = Math.max(currentFontSize, fontSize);
      }
    }
    if (currentLine.trim()) {
      lines.push({ text: currentLine.trim(), fontSize: currentFontSize, y: currentY });
    }

    // Compute median font size for this page to identify what's "large"
    const fontSizes = lines.map(l => l.fontSize).sort((a, b) => a - b);
    const medianFontSize = fontSizes[Math.floor(fontSizes.length / 2)] || 12;

    // Test each line against heading patterns
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const text = line.text.replace(/\s+/g, " ");

      for (const pattern of HEADING_PATTERNS) {
        const m = text.match(pattern.re);
        if (!m) continue;

        // Build a clean title
        let title = text;
        const suffix = (m[2] || "").trim();

        // If the matched heading has no title suffix, check the next line
        // (common pattern: "CHAPTER I" on one line, "THE TITLE" on the next)
        if (!suffix && li + 1 < lines.length) {
          const nextLine = lines[li + 1].text.trim();
          // Only grab next line if it looks like a title (not another chapter/page number)
          if (nextLine && !HEADING_PATTERNS.some(p => p.re.test(nextLine)) && !/^\d+$/.test(nextLine)) {
            title = text + " " + nextLine;
          }
        }

        // Also accept if the font is notably larger than body text (even without pattern match)
        // But here we already matched a pattern, so just clean up.
        title = cleanHeadingTitle(title);

        // Deduplicate
        const key = title.toUpperCase().replace(/\s+/g, " ");
        if (seen.has(key)) break;
        seen.add(key);

        entries.push({ title, pageIndex: i, depth: pattern.depth });
        break; // one match per line
      }

      // Also detect standalone large-font lines that might be titles
      // (e.g. "THE EXTENSIVE CONTINUUM" as a chapter title without "CHAPTER" prefix)
      // Only if font is at least 1.4x the median and the text is shortish
      if (
        line.fontSize >= medianFontSize * 1.4 &&
        text.length > 3 &&
        text.length < 80 &&
        !HEADING_PATTERNS.some(p => p.re.test(text)) &&
        !/^\d+$/.test(text) &&
        text === text.toUpperCase() // all caps = likely a heading
      ) {
        const key = text.toUpperCase().replace(/\s+/g, " ");
        if (!seen.has(key)) {
          // Only add if it's in the top 30% of the page (headings are usually near the top)
          const pageHeight = lines[lines.length - 1].y - lines[0].y;
          const relY = pageHeight > 0 ? (lines[0].y + pageHeight - line.y) / pageHeight : 0;
          if (relY > 0.6) {
            seen.add(key);
            entries.push({ title: cleanHeadingTitle(text), pageIndex: i, depth: 1 });
          }
        }
      }
    }
  }

  return entries;
}

/** Clean up a heading title for display */
function cleanHeadingTitle(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  // Fix missing space after roman numeral: "CHAPTER ITHE" → "CHAPTER I THE"
  s = s.replace(/^((?:PART|CHAPTER|SECTION|BOOK)\s+[IVXLCDM]+)([A-Z]{2})/i, "$1 $2");
  // Remove trailing page numbers
  s = s.replace(/\s+\d+\s*$/, "");
  return s;
}

/**
 * Try the PDF outline first. If it's clean (has real chapter entries),
 * use it. Otherwise fall back to text scanning.
 */
async function buildToc(
  doc: pdfjsLib.PDFDocumentProxy,
  outline: Awaited<ReturnType<pdfjsLib.PDFDocumentProxy["getOutline"]>>,
): Promise<TocEntry[]> {
  // First try the outline
  if (outline && outline.length > 0) {
    const fromOutline = await buildTocFromOutline(doc, outline, 0);
    const cleaned = dedup(normalize(fromOutline));
    // Consider the outline "clean" if most entries look like real headings
    const realCount = cleaned.filter(e =>
      HEADING_PATTERNS.some(p => p.re.test(e.title)) || e.title.length > 3
    ).length;
    const noiseCount = cleaned.filter(e =>
      /\.(pdf|epub|mobi)$/i.test(e.title) ||
      /^binder\d*$/i.test(e.title) ||
      /OCR\d/i.test(e.title) ||
      e.title.length <= 2
    ).length;
    if (realCount > 2 && noiseCount / cleaned.length < 0.3) {
      return cleaned;
    }
  }

  // Outline is missing or noisy — scan page text
  return dedup(normalize(await buildTocFromText(doc)));
}

/** Build TOC from PDF outline (for clean outlines) */
async function buildTocFromOutline(
  doc: pdfjsLib.PDFDocumentProxy,
  items: Awaited<ReturnType<pdfjsLib.PDFDocumentProxy["getOutline"]>>,
  depth: number,
): Promise<TocEntry[]> {
  if (!items) return [];
  const result: TocEntry[] = [];
  for (const item of items) {
    let pageIndex = 0;
    try {
      if (item.dest) {
        const dest = typeof item.dest === "string"
          ? await doc.getDestination(item.dest)
          : item.dest;
        if (dest && dest[0]) {
          pageIndex = await doc.getPageIndex(dest[0]);
        }
      }
    } catch { /* skip */ }

    const title = cleanHeadingTitle(item.title?.trim() ?? "");
    if (!title) continue;

    // Skip obvious file/binder noise
    if (/\.(pdf|epub|mobi)$/i.test(title) || /^binder\d*$/i.test(title) || /OCR\d/i.test(title)) {
      // Still recurse children
      if (item.items?.length) {
        result.push(...await buildTocFromOutline(doc, item.items, depth));
      }
      continue;
    }

    result.push({ title, pageIndex, depth });
    if (item.items?.length) {
      result.push(...await buildTocFromOutline(doc, item.items, depth + 1));
    }
  }
  return result;
}

function dedup(entries: TocEntry[]): TocEntry[] {
  const seen = new Set<string>();
  return entries.filter(e => {
    const key = `${e.title.toUpperCase().replace(/\s+/g, " ")}|${e.pageIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalize(entries: TocEntry[]): TocEntry[] {
  if (entries.length === 0) return entries;
  const min = Math.min(...entries.map(e => e.depth));
  return min === 0 ? entries : entries.map(e => ({ ...e, depth: e.depth - min }));
}
