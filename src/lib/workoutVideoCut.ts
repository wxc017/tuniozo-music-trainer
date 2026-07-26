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

/**
 * MediaRecorder WebM blobs (what `cutFromElement` produces) carry NO duration
 * in their header — they're written as an open-ended live stream. A freshly cut
 * clip therefore loads with `video.duration === Infinity` and won't seek: the
 * native scrub bar sticks at the far end and you can't skip through it.
 *
 * The dependency-free fix: seek far past the end. That forces the browser to
 * read to EOF, which establishes the true duration AND a seekable byte range.
 * Then we reset to the start. Resolves the corrected duration (0 if it can't be
 * determined). Safe to call on any clip — returns immediately if the duration
 * is already finite.
 */
export function primeSeekable(v: HTMLVideoElement): Promise<number> {
  return new Promise(resolve => {
    if (isFinite(v.duration) && v.duration > 0) { resolve(v.duration); return; }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      v.removeEventListener("durationchange", check);
      v.removeEventListener("timeupdate", check);
      const d = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
      try { v.currentTime = 0; } catch { /* ignore */ }
      resolve(d);
    };
    const check = () => { if (isFinite(v.duration) && v.duration > 0) finish(); };
    v.addEventListener("durationchange", check);
    v.addEventListener("timeupdate", check);
    // A very large target makes the browser scan to the real end.
    try { v.currentTime = 1e101; } catch { /* ignore */ }
    setTimeout(finish, 2000); // safety: never hang
  });
}

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
