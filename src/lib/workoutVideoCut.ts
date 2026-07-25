// In-browser video trimming with no heavy dependencies (no ffmpeg.wasm).
//
// We re-record the ON-SCREEN <video> element as it plays the selected segment,
// via HTMLMediaElement.captureStream() + MediaRecorder. Using the visible,
// already-rendered element is important on mobile: an offscreen/undisplayed
// video often won't decode or advance currentTime, so the cut would silently
// capture nothing and the original clip would remain.
//
// Tradeoff: this re-encodes in REAL TIME (a 20s cut takes ~20s, and you see it
// play through once). captureStream + MediaRecorder are supported on Android
// Chrome; not on iOS Safari.

export function canCutVideo(): boolean {
  if (typeof MediaRecorder === "undefined") return false;
  const v = document.createElement("video");
  return typeof (v as any).captureStream === "function" || typeof (v as any).mozCaptureStream === "function";
}

function pickMime(): string {
  const cands = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  for (const c of cands) {
    try { if (MediaRecorder.isTypeSupported(c)) return c; } catch { /* ignore */ }
  }
  return "";
}

function seekTo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise(res => {
    if (Math.abs(v.currentTime - t) < 0.01) { res(); return; }
    const done = () => { v.removeEventListener("seeked", done); res(); };
    v.addEventListener("seeked", done);
    v.currentTime = t;
    // Safety: some browsers don't fire seeked reliably — resolve after a beat.
    setTimeout(done, 800);
  });
}

/** Cut [tIn, tOut] out of the LIVE on-screen video element, returning a new
 *  (smaller) Blob containing only that segment. */
export async function cutFromElement(
  v: HTMLVideoElement, tIn: number, tOut: number, onProgress?: (frac: number) => void,
): Promise<Blob> {
  const capture: (() => MediaStream) | undefined =
    (v as any).captureStream?.bind(v) ?? (v as any).mozCaptureStream?.bind(v);
  if (!capture) throw new Error("captureStream unsupported");

  const wasMuted = v.muted;
  v.muted = true; // don't blast audio through the speaker during the cut

  // Make sure the element has decodable data before we seek/play.
  if (v.readyState < 2) {
    await new Promise<void>(res => {
      const h = () => { v.removeEventListener("canplay", h); res(); };
      v.addEventListener("canplay", h);
      setTimeout(h, 1500);
    });
  }

  const end = Math.min(tOut, v.duration || tOut);
  const start = Math.max(0, Math.min(tIn, end - 0.05));
  await seekTo(v, start);

  const stream = capture();
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise<void>(res => { rec.onstop = () => res(); });

  rec.start(100);
  await v.play();

  await new Promise<void>((res) => {
    const startedAt = performance.now();
    const maxMs = (end - start) * 1000 + 4000; // hard cap so we never hang
    const tick = () => {
      onProgress?.(Math.min(1, (v.currentTime - start) / Math.max(0.01, end - start)));
      if (v.currentTime >= end || v.ended || performance.now() - startedAt > maxMs) { res(); return; }
      requestAnimationFrame(tick);
    };
    tick();
  });

  v.pause();
  rec.stop();
  await stopped;
  v.muted = wasMuted;

  const out = new Blob(chunks, { type: mime || "video/webm" });
  if (!out.size) throw new Error("Cut produced an empty clip — your browser may not support in-app cutting. Trim in your gallery instead.");
  return out;
}
