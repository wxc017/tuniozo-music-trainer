// In-browser video trimming with no heavy dependencies (no ffmpeg.wasm).
//
// Approach: play the source clip from `tIn` to `tOut` into an offscreen
// <video>, capture its output via HTMLMediaElement.captureStream(), and
// re-record that stream with MediaRecorder. The result is a real, smaller
// Blob containing only the selected segment — so we can throw the full clip
// away and keep just the cut.
//
// Tradeoff: this re-encodes in REAL TIME (a 20s cut takes ~20s) and needs
// captureStream + MediaRecorder (supported on Android Chrome; not iOS Safari).
// For short gym set clips that's fine and avoids a 30MB ffmpeg download that
// GitHub Pages can't even run multithreaded (no cross-origin isolation).

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
    const done = () => { v.removeEventListener("seeked", done); res(); };
    v.addEventListener("seeked", done);
    v.currentTime = t;
  });
}

/** Cut [tIn, tOut] out of `srcBlob`, returning a new (smaller) Blob. */
export async function cutVideoBlob(
  srcBlob: Blob, tIn: number, tOut: number, onProgress?: (frac: number) => void,
): Promise<Blob> {
  const url = URL.createObjectURL(srcBlob);
  const v = document.createElement("video");
  try {
    v.src = url;
    v.muted = true;           // don't blast audio through the speaker while cutting
    (v as any).playsInline = true;
    await new Promise<void>((res, rej) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => rej(new Error("Could not load the clip to cut."));
    });

    const capture: (() => MediaStream) | undefined =
      (v as any).captureStream?.bind(v) ?? (v as any).mozCaptureStream?.bind(v);
    if (!capture) throw new Error("captureStream unsupported");

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
    await new Promise<void>(res => {
      const tick = () => {
        onProgress?.(Math.min(1, (v.currentTime - start) / Math.max(0.01, end - start)));
        if (v.currentTime >= end || v.ended) { res(); return; }
        requestAnimationFrame(tick);
      };
      tick();
    });
    v.pause();
    rec.stop();
    await stopped;

    const out = new Blob(chunks, { type: mime || "video/webm" });
    if (!out.size) throw new Error("Cut produced an empty clip.");
    return out;
  } finally {
    v.pause();
    v.src = "";
    URL.revokeObjectURL(url);
  }
}
