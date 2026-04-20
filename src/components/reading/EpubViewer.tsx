import { useEffect, useRef, useState, useCallback } from "react";
import ePub, { type Book, type Rendition } from "epubjs";

interface Props {
  fileData: ArrayBuffer;
  lastPage: number;
  onPageChange: (page: number, scrollFraction: number) => void;
  onTextSelected: (text: string, rect: DOMRect, page: number) => void;
}

export default function EpubViewer({ fileData, lastPage, onPageChange, onTextSelected }: Props) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [currentLocation, setCurrentLocation] = useState("");
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    if (!viewerRef.current) return;
    const container = viewerRef.current;

    const book = ePub(fileData);
    bookRef.current = book;

    const rendition = book.renderTo(container, {
      width: "100%",
      height: "100%",
      flow: "scrolled-doc",
      allowScriptedContent: false,
    });

    renditionRef.current = rendition;

    // Dark theme
    rendition.themes.default({
      body: {
        color: "#ccc !important",
        background: "#0d0d0d !important",
        "font-family": "system-ui, sans-serif !important",
        "line-height": "1.6 !important",
        padding: "0 16px !important",
      },
      "a": { color: "#7173e6 !important" },
      "p, div, span, li, td, th, h1, h2, h3, h4, h5, h6": {
        color: "#ccc !important",
      },
      "img": { "max-width": "100% !important" },
    });

    rendition.display(lastPage > 0 ? `epubcfi(${lastPage})` : undefined);

    rendition.on("relocated", (location: { start: { cfi: string; displayed: { page: number } } }) => {
      setCurrentLocation(location.start.cfi);
      onPageChange(location.start.displayed.page, 0);
    });

    rendition.on("started", () => {
      setAtStart(true);
    });

    // Listen for text selection inside iframe
    rendition.on("selected", (cfiRange: string, _contents: unknown) => {
      const iframe = container.querySelector("iframe");
      if (!iframe?.contentWindow) return;
      const sel = iframe.contentWindow.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (!text) return;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      // Offset rect by iframe position
      const iframeRect = iframe.getBoundingClientRect();
      const adjusted = new DOMRect(
        rect.x + iframeRect.x,
        rect.y + iframeRect.y,
        rect.width,
        rect.height,
      );
      onTextSelected(text, adjusted, 0);
    });

    return () => {
      rendition.destroy();
      book.destroy();
    };
  }, [fileData]);

  const prev = () => renditionRef.current?.prev();
  const next = () => renditionRef.current?.next();

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[#1e1e1e] flex-shrink-0">
        <button onClick={prev} disabled={atStart}
          className="px-2 py-0.5 text-xs bg-[#1a1a1a] border border-[#2a2a2a] rounded text-[#888] hover:text-white disabled:opacity-30">
          ← Prev
        </button>
        <button onClick={next} disabled={atEnd}
          className="px-2 py-0.5 text-xs bg-[#1a1a1a] border border-[#2a2a2a] rounded text-[#888] hover:text-white disabled:opacity-30">
          Next →
        </button>
      </div>

      {/* Reader */}
      <div ref={viewerRef} className="flex-1 overflow-hidden" />
    </div>
  );
}
