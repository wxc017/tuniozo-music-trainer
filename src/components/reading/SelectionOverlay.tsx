import { useState, useRef, useCallback, useEffect } from "react";
import AskGptOverlay from "./AskGptOverlay";

export interface RegionInfo {
  page: number;
  /** Fraction of page dimensions (0–1) */
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onTextAction: (text: string, action: "T" | "N" | "Q" | "E" | "S", page: number, imageDataUrl?: string, region?: RegionInfo) => void;
}

interface Popup {
  text: string;
  imageDataUrl?: string; // screenshot fallback for scanned PDFs
  x: number;
  y: number;
  page: number;
  region?: { left: number; top: number; width: number; height: number };
  regionInfo?: RegionInfo;
}

export default function SelectionOverlay({ containerRef, onTextAction }: Props) {
  const [popup, setPopup] = useState<Popup | null>(null);
  const [gptImage, setGptImage] = useState<string | null>(null);
  const [dragRect, setDragRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, clientX: 0, clientY: 0 });
  const isDragSelection = useRef(false);

  /** Convert scroll-adjusted coords back to client coords for accurate capture */
  const captureRegionDataUrl = useCallback((left: number, top: number, w: number, h: number): string | null => {
    const container = containerRef.current;
    if (!container) return null;
    const cr = container.getBoundingClientRect();
    const clientLeft = left - container.scrollLeft + cr.left;
    const clientTop = top - container.scrollTop + cr.top;

    const captureCanvas = document.createElement("canvas");
    const outScale = 2;
    captureCanvas.width = w * outScale;
    captureCanvas.height = h * outScale;
    const ctx = captureCanvas.getContext("2d")!;
    ctx.scale(outScale, outScale);

    const pageCanvases = container.querySelectorAll(".pdf-page-wrapper canvas");
    for (const pc of pageCanvases) {
      const canvas = pc as HTMLCanvasElement;
      const pcRect = canvas.getBoundingClientRect();
      const overlapLeft = Math.max(clientLeft, pcRect.left);
      const overlapTop = Math.max(clientTop, pcRect.top);
      const overlapRight = Math.min(clientLeft + w, pcRect.right);
      const overlapBottom = Math.min(clientTop + h, pcRect.bottom);
      if (overlapRight <= overlapLeft || overlapBottom <= overlapTop) continue;

      const ratioX = canvas.width / pcRect.width;
      const ratioY = canvas.height / pcRect.height;
      const srcX = (overlapLeft - pcRect.left) * ratioX;
      const srcY = (overlapTop - pcRect.top) * ratioY;
      const srcW = (overlapRight - overlapLeft) * ratioX;
      const srcH = (overlapBottom - overlapTop) * ratioY;

      const dstX = overlapLeft - clientLeft;
      const dstY = overlapTop - clientTop;
      const dstW = overlapRight - overlapLeft;
      const dstH = overlapBottom - overlapTop;

      ctx.drawImage(canvas, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH);
    }
    return captureCanvas.toDataURL("image/png");
  }, [containerRef]);

  /** Find the page number for a given position */
  const findPageAtPosition = useCallback((top: number, bottom: number, container: HTMLElement): number => {
    let page = 1;
    const containerRect = container.getBoundingClientRect();
    const pageWrappers = container.querySelectorAll(".pdf-page-wrapper");
    for (const pw of pageWrappers) {
      const el = pw as HTMLElement;
      const r = el.getBoundingClientRect();
      const sy = r.top - containerRect.top + container.scrollTop;
      if (sy + r.height > top && sy < bottom && el.dataset.page) {
        page = parseInt(el.dataset.page);
        break;
      }
    }
    return page;
  }, []);

  // Dismiss on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".tn-popup")) return;
      setTimeout(() => {
        setPopup(null);
      }, 100);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Drag-select rectangle
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;
    // For pen/touch: prevent browser from starting a pan/scroll gesture
    if (e.pointerType === "pen" || e.pointerType === "touch") {
      e.preventDefault();
    }
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left + container.scrollLeft;
    const y = e.clientY - rect.top + container.scrollTop;
    dragStart.current = { x, y, clientX: e.clientX, clientY: e.clientY };
    dragging.current = true;
    isDragSelection.current = false;
    // Capture pointer so pen/touch drag events aren't lost to the browser
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [containerRef]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + containerRef.current.scrollLeft;
    const y = e.clientY - rect.top + containerRef.current.scrollTop;

    const dx = Math.abs(e.clientX - dragStart.current.clientX);
    const dy = Math.abs(e.clientY - dragStart.current.clientY);
    if (dx > 8 || dy > 8) {
      if (!isDragSelection.current) {
        isDragSelection.current = true;
        window.getSelection()?.removeAllRanges();
        e.preventDefault();
      }
      setDragRect({ x1: dragStart.current.x, y1: dragStart.current.y, x2: x, y2: y });
    }
  }, [containerRef]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch (_) {}

    if (!isDragSelection.current || !dragRect || !containerRef.current) {
      isDragSelection.current = false;
      setDragRect(null);
      return;
    }
    isDragSelection.current = false;

    const left = Math.min(dragRect.x1, dragRect.x2);
    const top = Math.min(dragRect.y1, dragRect.y2);
    const right = Math.max(dragRect.x1, dragRect.x2);
    const bottom = Math.max(dragRect.y1, dragRect.y2);
    const w = right - left;
    const h = bottom - top;

    if (w < 10 || h < 10) {
      setDragRect(null);
      return;
    }

    const container = containerRef.current;

    // Capture screenshot of the selected region
    const dataUrl = captureRegionDataUrl(left, top, w, h);
    const page = findPageAtPosition(top, bottom, container);

    // Compute page-relative percentages for persistent highlights
    // Use getBoundingClientRect for accurate cross-container coordinate mapping
    let regionInfo: RegionInfo | undefined;
    const containerRect = container.getBoundingClientRect();
    // Convert scroll-adjusted drag coords to client coords
    const dragClientLeft = left - container.scrollLeft + containerRect.left;
    const dragClientTop = top - container.scrollTop + containerRect.top;
    const pageWrappers = container.querySelectorAll(".pdf-page-wrapper");
    for (const pw of pageWrappers) {
      const el = pw as HTMLElement;
      if (el.dataset.page === String(page)) {
        const pr = el.getBoundingClientRect();
        if (pr.width > 0 && pr.height > 0) {
          regionInfo = {
            page,
            xPct: (dragClientLeft - pr.left) / pr.width,
            yPct: (dragClientTop - pr.top) / pr.height,
            wPct: w / pr.width,
            hPct: h / pr.height,
          };
        }
        break;
      }
    }

    setDragRect(null);

    if (dataUrl) {
      setPopup({
        text: dataUrl,
        imageDataUrl: dataUrl,
        x: right,
        y: bottom + 4,
        page,
        region: { left, top, width: w, height: h },
        regionInfo,
      });
    }
  }, [dragRect, containerRef, findPageAtPosition, captureRegionDataUrl]);

  return {
    overlayProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      // touch-action:none prevents browser from hijacking pen/touch drags for scrolling
      style: { touchAction: "none" as const, ...(isDragSelection.current ? { userSelect: "none" as const } : {}) },
    },
    overlayUI: (
      <>
        {/* Drag-select rectangle */}
        {dragRect && (
          <div
            style={{
              position: "absolute",
              left: Math.min(dragRect.x1, dragRect.x2),
              top: Math.min(dragRect.y1, dragRect.y2),
              width: Math.abs(dragRect.x2 - dragRect.x1),
              height: Math.abs(dragRect.y2 - dragRect.y1),
              border: "2px dashed rgba(113,115,230,0.7)",
              background: "rgba(113,115,230,0.1)",
              pointerEvents: "none",
              zIndex: 20,
            }}
          />
        )}

        {/* T/N/S popup */}
        {popup && (
          <div
            className="tn-popup"
            style={{
              position: "absolute",
              left: popup.x,
              top: popup.y,
              zIndex: 30,
            }}
          >
            <div className="flex gap-1 bg-[#1a1a1a] border border-[#3a3a3a] rounded-lg shadow-xl p-1">
              <button
                onClick={() => { onTextAction(popup.text, "N", popup.page, popup.imageDataUrl, popup.regionInfo); setPopup(null); }}
                className="px-3 py-1.5 text-xs font-bold rounded bg-[#5a8a5a] hover:bg-[#4a7a4a] text-white transition-colors"
                title="Add note"
              >
                N
              </button>
              <button
                onClick={() => { onTextAction(popup.text, "Q", popup.page, popup.imageDataUrl, popup.regionInfo); setPopup(null); }}
                className="px-3 py-1.5 text-xs font-bold rounded bg-[#c06090] hover:bg-[#a04878] text-white transition-colors"
                title="Add question"
              >
                Q
              </button>
              <button
                onClick={() => { onTextAction(popup.text, "E", popup.page, popup.imageDataUrl, popup.regionInfo); setPopup(null); }}
                className="px-3 py-1.5 text-xs font-bold rounded bg-[#e0a040] hover:bg-[#c88a30] text-white transition-colors"
                title="Add exploration"
              >
                E
              </button>
              <button
                onClick={() => {
                  const src = popup.imageDataUrl || popup.text;
                  if (!src.startsWith("data:image/")) return;
                  // Copy image to clipboard
                  fetch(src).then(r => r.blob()).then(blob => {
                    const item = new ClipboardItem({ "image/png": blob });
                    navigator.clipboard.write([item]);
                  });
                  setPopup(null);
                }}
                className="px-3 py-1.5 text-xs font-bold rounded bg-[#888] hover:bg-[#666] text-white transition-colors"
                title="Screenshot to clipboard"
              >
                S
              </button>
              <button
                onClick={() => {
                  const src = popup.imageDataUrl || popup.text;
                  if (!src.startsWith("data:image/")) return;
                  setGptImage(src);
                  setPopup(null);
                }}
                className="px-3 py-1.5 text-xs font-bold rounded bg-[#10a37f] hover:bg-[#0d8c6d] text-white transition-colors"
                title="Ask GPT about this image"
              >
                G
              </button>
            </div>
          </div>
        )}

        {/* GPT overlay */}
        {gptImage && (
          <AskGptOverlay imageDataUrl={gptImage} onClose={() => setGptImage(null)} />
        )}
      </>
    ),
  };
}
