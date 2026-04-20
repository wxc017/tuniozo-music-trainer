import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

const isElectron = typeof navigator !== "undefined" && navigator.userAgent.includes("Electron");

interface Props {
  imageDataUrl: string;
  onClose: () => void;
}

/** Copy a data-URL image to the clipboard so the user can paste into ChatGPT */
async function copyImageToClipboard(dataUrl: string) {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

export default function AskGptOverlay({ imageDataUrl, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [fallbackOpened, setFallbackOpened] = useState(false);
  const webviewRef = useRef<HTMLElement | null>(null);

  // Copy image on mount
  useEffect(() => {
    copyImageToClipboard(imageDataUrl).then(ok => setCopied(ok));
  }, [imageDataUrl]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Browser fallback: open ChatGPT in a new tab
  const openInTab = useCallback(() => {
    window.open("https://chatgpt.com/", "_blank");
    setFallbackOpened(true);
  }, []);

  const handleRecopy = useCallback(() => {
    copyImageToClipboard(imageDataUrl).then(ok => setCopied(ok));
  }, [imageDataUrl]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#0d0d0d]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e1e1e] flex-shrink-0 bg-[#141414]">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-white">ChatGPT</span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full ${
              copied ? "bg-[#10a37f]/20 text-[#10a37f]" : "bg-[#333] text-[#888]"
            }`}
          >
            {copied ? "Image copied to clipboard — paste with Ctrl+V" : "Copying image..."}
          </span>
          <button
            onClick={handleRecopy}
            className="text-[10px] text-[#666] hover:text-white transition-colors underline"
          >
            Re-copy image
          </button>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-white hover:bg-[#2a2a2a] transition-colors text-lg"
          title="Close (Esc)"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 relative">
        {isElectron ? (
          /* Electron: embed ChatGPT via <webview> */
          <webview
            ref={el => { webviewRef.current = el; }}
            src="https://chatgpt.com/"
            style={{ width: "100%", height: "100%" }}
            /* @ts-expect-error webview is an Electron-specific element */
            allowpopups="true"
            partition="persist:chatgpt"
          />
        ) : (
          /* Browser fallback: can't iframe ChatGPT, so prompt user */
          <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
            {/* Show the captured image */}
            <div className="rounded-lg overflow-hidden border border-[#1e1e1e] bg-[#0d0d0d] max-w-md">
              <img
                src={imageDataUrl}
                alt="Selected region"
                className="max-h-52 w-auto mx-auto object-contain"
              />
            </div>
            <div className="text-sm text-[#888] text-center max-w-md">
              ChatGPT can't be embedded in a browser tab.
              <br />
              Your image has been copied to the clipboard.
            </div>
            {!fallbackOpened ? (
              <button
                onClick={openInTab}
                className="px-5 py-2.5 text-sm font-medium rounded-lg bg-[#10a37f] hover:bg-[#0d8c6d] text-white transition-colors"
              >
                Open ChatGPT in new tab
              </button>
            ) : (
              <div className="text-xs text-[#555]">
                ChatGPT opened — paste your image there with Ctrl+V
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
