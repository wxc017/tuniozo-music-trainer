/**
 * Capture a DOM element as a cropped JPEG data URL.
 *
 * 1. Renders the element to a canvas via html-to-image
 * 2. Scans from the bottom to find the last row with visible content
 * 3. Crops off the empty bottom region
 * 4. Returns a JPEG data URL (much smaller than PNG)
 */
export async function captureElement(
  element: HTMLElement,
  bgColor: string,
  opts?: { pixelRatio?: number; quality?: number; bottomPad?: number },
): Promise<string> {
  const { toCanvas } = await import("html-to-image");
  const ratio = opts?.pixelRatio ?? 1.5;
  const quality = opts?.quality ?? 0.82;
  const bottomPad = opts?.bottomPad ?? 16;

  const canvas = await toCanvas(element, {
    backgroundColor: bgColor,
    pixelRatio: ratio,
  });

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/jpeg", quality);

  const { width, height } = canvas;

  // Parse the background colour to compare against
  const bg = parseHexColor(bgColor);
  const tolerance = 16; // pixel channels within this range of bg = "empty"

  // Scan rows from bottom up to find last row with visible content
  const imageData = ctx.getImageData(0, 0, width, height);
  const px = imageData.data;
  let contentBottom = 0;

  for (let y = height - 1; y >= 0; y--) {
    let hasContent = false;
    // Sample every 3rd pixel for speed (still catches thin lines)
    for (let x = 0; x < width; x += 3) {
      const i = (y * width + x) * 4;
      if (
        Math.abs(px[i] - bg.r) > tolerance ||
        Math.abs(px[i + 1] - bg.g) > tolerance ||
        Math.abs(px[i + 2] - bg.b) > tolerance
      ) {
        hasContent = true;
        break;
      }
    }
    if (hasContent) {
      contentBottom = y + 1;
      break;
    }
  }

  // If the image is already tight (or entirely empty), return as-is
  const pad = Math.round(bottomPad * ratio);
  const cropH = Math.min(height, contentBottom + pad);
  if (cropH >= height - pad) {
    return canvas.toDataURL("image/jpeg", quality);
  }

  // Create a smaller canvas with the cropped height
  const cropped = document.createElement("canvas");
  cropped.width = width;
  cropped.height = cropH;
  const cCtx = cropped.getContext("2d")!;
  cCtx.drawImage(canvas, 0, 0, width, cropH, 0, 0, width, cropH);

  return cropped.toDataURL("image/jpeg", quality);
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
