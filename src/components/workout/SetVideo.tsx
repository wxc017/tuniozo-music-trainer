import { useEffect, useRef, useState, useCallback } from "react";
import {
  putVideo, getVideo, deleteVideo, releaseVideoUrl, newVideoId, getVideoUrl,
} from "@/lib/workoutVideoDb";
import { cutFromElement, canCutVideo, primeSeekable } from "@/lib/workoutVideoCut";
import { resolveClipUrl, releaseClipUrl, isDriveConnected, uploadVideoToDrive, deleteDriveVideo } from "@/lib/workoutDrive";
import type { WorkoutSet } from "@/lib/workoutTypes";

// ─────────────────────────────────────────────────────────────────────────
// Set video, in three pieces so the card can lay them out:
//   • VideoRowButton — tiny icon in the set row (add a clip, or open the editor)
//   • VideoThumb     — small inline player + set-number badge, shown in a strip
//                      under "Add set"
//   • SetVideoEditor — the fullscreen trim/cut/offload popup (opened on demand)
// The blob lives in IndexedDB (workoutVideoDb); the set stores videoId +
// trim bounds, or a driveFileId once offloaded.
// ─────────────────────────────────────────────────────────────────────────

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t % 1) * 10);
  return `${m}:${String(s).padStart(2, "0")}.${cs}`;
}

function probeDuration(url: string): Promise<number> {
  return new Promise(resolve => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve(isFinite(v.duration) ? v.duration : 0);
    v.onerror = () => resolve(0);
    v.src = url;
  });
}

// ── Row button ────────────────────────────────────────────────────────────

export function VideoRowButton({ set, workoutId, onChange, onOpen }: {
  set: WorkoutSet; workoutId: string;
  onChange: (patch: Partial<WorkoutSet>) => void;
  onOpen: (justAdded: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const hasVideo = !!set.videoId || !!set.driveFileId;

  const onPick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const probeUrl = URL.createObjectURL(file);
      const dur = await probeDuration(probeUrl);
      URL.revokeObjectURL(probeUrl);
      const id = set.videoId ?? newVideoId();
      if (set.videoId) await deleteVideo(set.videoId);
      if (set.driveFileId) void deleteDriveVideo(set.driveFileId);
      await putVideo({ id, blob: file, mime: file.type || "video/mp4", durationSec: dur, createdAt: Date.now(), setId: set.id, workoutId });
      onChange({ videoId: id, driveFileId: undefined, trimIn: 0, trimOut: dur || undefined });
      onOpen(true);
    } finally { setBusy(false); }
  }, [set.videoId, set.driveFileId, set.id, workoutId, onChange, onOpen]);

  return (
    <>
      <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={onPick} />
      <button onClick={() => hasVideo ? onOpen(false) : fileRef.current?.click()} disabled={busy}
        className="flex items-center justify-center text-xs flex-shrink-0"
        style={{
          width: "2rem", height: "1.9rem", borderRadius: 8, lineHeight: 1,
          border: "1px solid var(--wl-line)", background: "var(--wl-surface-2)",
        }}
        title={hasVideo ? "Open video" : "Add video"} aria-label={hasVideo ? "Open video" : "Add video"}>
        {busy ? "…" : hasVideo ? "🎬" : "🎥"}
      </button>
    </>
  );
}

// ── Trim-aware player ──────────────────────────────────────────────────────
// Trimming is non-destructive: the blob is still the full recording and only
// `trimIn`/`trimOut` say which slice counts. Every player OUTSIDE the editor
// has to honour those bounds itself, or you get the whole take back.

export function TrimmedVideo({ src, trimIn, trimOut, videoRef, ...rest }: {
  src: string; trimIn?: number; trimOut?: number;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
} & React.VideoHTMLAttributes<HTMLVideoElement>) {
  const ownRef = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? ownRef;

  const tIn = trimIn != null && trimIn > 0 ? trimIn : 0;
  const tOut = trimOut != null && trimOut > tIn + 0.05 ? trimOut : 0; // 0 → no end bound
  const trimmed = tIn > 0 || tOut > 0;

  // A media fragment gets the poster/preload frame right (and lets browsers
  // that support it stop natively); the handlers below are the real guarantee.
  const base = src.split("#")[0];
  const fragSrc = trimmed ? `${base}#t=${tIn}${tOut ? `,${tOut}` : ""}` : src;

  const clampIn = () => {
    const v = ref.current;
    if (!v || !tIn) return;
    if (v.currentTime < tIn - 0.05) v.currentTime = tIn;
  };

  const onLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    clampIn();
    rest.onLoadedMetadata?.(e);
  };

  const onTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = ref.current;
    if (v) {
      const mediaEnd = isFinite(v.duration) && v.duration > 0 ? v.duration : Infinity;
      if (tOut && tOut < mediaEnd - 0.05 && v.currentTime >= tOut) { v.pause(); v.currentTime = tOut; }
      else if (!v.seeking) clampIn();
    }
    rest.onTimeUpdate?.(e);
  };

  const onPlay = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = ref.current;
    // Replay from the in-point instead of resuming past the out-point.
    if (v && tOut && v.currentTime >= tOut - 0.05) v.currentTime = tIn;
    else clampIn();
    rest.onPlay?.(e);
  };

  const onSeeked = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = ref.current;
    if (v) { if (tOut && v.currentTime > tOut) v.currentTime = tOut; else clampIn(); }
    rest.onSeeked?.(e);
  };

  return (
    <video {...rest} ref={ref} src={fragSrc}
      onLoadedMetadata={onLoadedMetadata} onTimeUpdate={onTimeUpdate} onPlay={onPlay} onSeeked={onSeeked} />
  );
}

// ── Bottom thumbnail (small inline player + numbered circle) ───────────────

type Phase = "idle" | "loading" | "ready" | "failed";

export function VideoThumb({ set, index }: {
  set: WorkoutSet; index: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string>("");
  const wantFs = useRef(false);

  const load = useCallback(() => {
    setPhase("loading");
    resolveClipUrl({ videoId: set.videoId, driveFileId: set.driveFileId })
      .then(r => { if ("url" in r) { setUrl(r.url); setPhase("ready"); } else { setErr(r.error); setPhase("failed"); } })
      .catch(e => { setErr(e instanceof Error ? e.message : String(e)); setPhase("failed"); });
  }, [set.videoId, set.driveFileId]);

  // Auto-load every clip (local + Drive). Cached URLs mean repeat views don't
  // re-download, so there's no reason to make the user tap "load".
  useEffect(() => {
    let alive = true;
    resolveClipUrl({ videoId: set.videoId, driveFileId: set.driveFileId })
      .then(r => { if (!alive) return; if ("url" in r) { setUrl(r.url); setPhase("ready"); } else { setErr(r.error); setPhase("failed"); } })
      .catch(e => { if (alive) { setErr(e instanceof Error ? e.message : String(e)); setPhase("failed"); } });
    return () => { alive = false; };
  }, [set.videoId, set.driveFileId]);

  const goFullscreen = () => {
    const el = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitRequestFullscreen?: () => void }) | null;
    if (!el) return;
    (el.requestFullscreen?.bind(el) || el.webkitRequestFullscreen?.bind(el) || el.webkitEnterFullscreen?.bind(el))?.();
    el.play?.().catch(() => { /* autoplay may be blocked */ });
  };

  // If the clip wasn't loaded yet when the number was tapped, fullscreen once ready.
  useEffect(() => {
    if (phase === "ready" && url && wantFs.current) { wantFs.current = false; window.setTimeout(goFullscreen, 60); }
  }, [phase, url]);

  const onNumber = () => {
    if (phase === "ready" && url) goFullscreen();
    else { wantFs.current = true; load(); }
  };

  return (
    <div className="flex-shrink-0 flex flex-col items-center gap-1.5" style={{ width: 116, scrollSnapAlign: "start" }}>
      {phase === "ready" && url ? (
        <TrimmedVideo videoRef={videoRef} src={url} trimIn={set.trimIn} trimOut={set.trimOut}
          controls playsInline preload="metadata" className="rounded bg-black w-full" style={{ maxHeight: 200 }} />
      ) : (
        <div className="rounded bg-black w-full flex flex-col items-center justify-center gap-1.5 text-center px-1"
          style={{ height: 160, color: "var(--wl-faint)", fontSize: 10 }}>
          {phase === "loading" ? <span>loading…</span>
            : phase === "failed" ? (<><span title={err}>can't load</span><button onClick={load} className="wl-tag" style={{ cursor: "pointer" }}>Retry</button></>)
            : <button onClick={load} className="wl-btn wl-btn--ghost" style={{ padding: "6px 10px", fontSize: 11 }}>▶ Load</button>}
        </div>
      )}
      <button onClick={onNumber} title="Fullscreen this clip"
        className="w-6 h-6 rounded-full text-[11px] flex items-center justify-center wl-num"
        style={{ border: "1px solid var(--wl-line)", background: "var(--wl-surface-2)", color: "var(--wl-accent)" }}>
        {index + 1}
      </button>
    </div>
  );
}

// ── Fullscreen editor ──────────────────────────────────────────────────────

export function SetVideoEditor({ set, workoutId, onChange, onClose }: {
  set: WorkoutSet; workoutId: string;
  onChange: (patch: Partial<WorkoutSet>) => void;
  onClose: () => void; justAdded: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [duration, setDuration] = useState(0);
  const [cutPct, setCutPct] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  // Only a CUT marks the clip dirty → uploaded to Drive on close. Adding or
  // replacing a video keeps it LOCAL; it goes to Drive only when you trim it.
  const dirtyRef = useRef(false);

  const hasVideo = !!set.videoId || !!set.driveFileId;
  const onDrive = !!set.driveFileId;

  useEffect(() => {
    let alive = true;
    if (!hasVideo) return;
    setLoadFailed(false);
    resolveClipUrl({ videoId: set.videoId, driveFileId: set.driveFileId }).then(r => {
      if (!alive) return;
      if ("url" in r) setUrl(r.url); else setLoadFailed(true);
    });
    return () => { alive = false; };
  }, [set.videoId, set.driveFileId, hasVideo]);

  // NOTE: we intentionally do NOT revoke the object URL on close. The URL is
  // cached module-side and SHARED with the inline thumbnails / Progress strip;
  // revoking it here made those reload (and re-download from Drive) every time
  // the editor was opened and closed. Cached URLs are freed on replace/delete
  // and when the page unloads.

  const onReplace = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const probeUrl = URL.createObjectURL(file);
    const dur = await probeDuration(probeUrl);
    URL.revokeObjectURL(probeUrl);
    const id = set.videoId ?? newVideoId();
    if (set.videoId) await deleteVideo(set.videoId);
    if (set.driveFileId) void deleteDriveVideo(set.driveFileId);
    await putVideo({ id, blob: file, mime: file.type || "video/mp4", durationSec: dur, createdAt: Date.now(), setId: set.id, workoutId });
    // Replacing keeps the new clip LOCAL — not dirty, so it isn't auto-offloaded.
    onChange({ videoId: id, driveFileId: undefined, trimIn: 0, trimOut: dur || undefined });
    setDuration(dur);
    setUrl(URL.createObjectURL(file));
  }, [set.videoId, set.driveFileId, set.id, workoutId, onChange]);

  const onLoadedMeta = async () => {
    const v = videoRef.current;
    if (!v) return;
    let d = v.duration;
    if (!isFinite(d) || d <= 0) d = await primeSeekable(v);
    if (isFinite(d) && d > 0) { setDuration(d); if (set.trimOut == null) onChange({ trimOut: d }); }
  };

  // `vidId` overrides set.videoId — a cut mints a NEW id and has to offload THAT
  // one, since the `set` in this closure is still the pre-cut render's copy.
  const offloadToDrive = useCallback(async (vidId?: string) => {
    if (!dirtyRef.current) return;
    const id = typeof vidId === "string" ? vidId : set.videoId;
    if (!id || set.driveFileId || !isDriveConnected()) return;
    const stored = await getVideo(id);
    if (!stored) return;
    setUploading(true);
    try {
      const ext = /mp4/i.test(stored.mime) ? "mp4" : /webm/i.test(stored.mime) ? "webm" : "mp4";
      const fileId = await uploadVideoToDrive(stored.blob, `${set.id}.${ext}`);
      await deleteVideo(id);
      releaseVideoUrl(id);
      dirtyRef.current = false;
      onChange({ videoId: undefined, driveFileId: fileId });
    } catch (err) {
      window.alert(`Couldn't upload to Drive: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setUploading(false); }
  }, [set.videoId, set.driveFileId, set.id, onChange]);

  const finalizeAndClose = useCallback(async () => { await offloadToDrive(); onClose(); }, [offloadToDrive, onClose]);

  const remove = useCallback(async () => {
    if (set.videoId) { await deleteVideo(set.videoId); releaseVideoUrl(set.videoId); }
    if (set.driveFileId) { void deleteDriveVideo(set.driveFileId); releaseClipUrl({ driveFileId: set.driveFileId }); }
    setUrl(null);
    onChange({ videoId: undefined, driveFileId: undefined, trimIn: undefined, trimOut: undefined });
    onClose();
  }, [set.videoId, set.driveFileId, onChange, onClose]);

  const dur = duration || set.trimOut || 0;
  const tIn = set.trimIn ?? 0;
  const tOut = set.trimOut ?? dur;

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    const mediaEnd = isFinite(v.duration) && v.duration > 0 ? v.duration : Infinity;
    if (tOut > 0 && tOut < mediaEnd - 0.2 && v.currentTime >= tOut) v.pause();
  };
  const markStart = () => { const v = videoRef.current; if (v) onChange({ trimIn: Math.min(v.currentTime, tOut - 0.1) }); };
  const markEnd = () => { const v = videoRef.current; if (v) onChange({ trimOut: Math.max(v.currentTime, tIn + 0.1) }); };

  const canCut = !onDrive && tOut - tIn > 0.2 && tOut - tIn < dur - 0.05;
  const cut = useCallback(async () => {
    const oldId = set.videoId;
    if (!oldId) return;
    const v = videoRef.current;
    if (!v) return;
    if (!canCutVideo()) { window.alert("Cutting isn't supported in this browser. Trim in your gallery app, then re-upload."); return; }
    setCutPct(0);
    try {
      const trimmed = await cutFromElement(v, tIn, tOut, f => setCutPct(Math.round(f * 100)));
      const newDur = Math.max(0.1, tOut - tIn);
      // The cut clip gets a NEW videoId — it must not reuse the old one. Every
      // embed (thumbnail strip, Progress "form over time") resolves its object
      // URL once and re-resolves ONLY when videoId changes, so overwriting the
      // blob in place left them all playing the ORIGINAL take while the trim
      // marks reset to 0 — i.e. the full video from its start, not the cut.
      const newId = newVideoId();
      await putVideo({ id: newId, blob: trimmed, mime: trimmed.type || "video/webm", durationSec: newDur, createdAt: Date.now(), setId: set.id, workoutId });
      dirtyRef.current = true;
      onChange({ videoId: newId, driveFileId: undefined, trimIn: 0, trimOut: newDur });
      await deleteVideo(oldId);
      releaseVideoUrl(oldId);
      setUrl(await getVideoUrl(newId));
      setDuration(newDur);
      setCutPct(null);
      await offloadToDrive(newId);
      onClose();
    } catch (err) {
      window.alert(`Couldn't cut the clip: ${err instanceof Error ? err.message : String(err)}`);
      setCutPct(null);
    }
  }, [set.videoId, set.id, workoutId, tIn, tOut, onChange, offloadToDrive, onClose]);

  return (
    <div className="wl-root fixed inset-0 z-[65] flex flex-col" style={{ background: "rgba(0,0,0,.94)" }}>
      <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={onReplace} />
      <div className="flex items-center gap-2 px-3 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--wl-line)" }}>
        <span className="wl-h2">Video</span>
        {onDrive && <span className="wl-tag">☁ Drive</span>}
        <span className="wl-mono wl-faint">{`${fmt(tIn)}–${fmt(tOut)}`}</span>
        <button onClick={finalizeAndClose} disabled={cutPct !== null || uploading} className="wl-btn ml-auto">
          {uploading ? "Saving to Drive…" : "Close"}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center p-2">
        {url ? (
          <video ref={videoRef} src={url} playsInline controls onLoadedMetadata={onLoadedMeta} onTimeUpdate={onTimeUpdate}
            className="rounded bg-black" style={{ maxWidth: "100%", maxHeight: "100%" }} />
        ) : loadFailed ? (
          <div className="max-w-sm text-center px-6" style={{ color: "var(--wl-muted)" }}>
            <div className="text-3xl mb-2">🎞️</div>
            <div className="text-sm">This clip's video file isn't available here.</div>
            <div className="text-xs mt-2">If it's on Drive, make sure you're signed in; if it only lives on another device, restore from Drive first.</div>
          </div>
        ) : (
          <div className="text-sm" style={{ color: "var(--wl-muted)" }}>Loading…</div>
        )}
      </div>

      <div className="flex-shrink-0 p-3 flex flex-col gap-2" style={{ borderTop: "1px solid var(--wl-line)" }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={markStart} disabled={cutPct !== null} className="wl-btn wl-btn--ghost">▶ Set start</button>
          <button onClick={markEnd} disabled={cutPct !== null} className="wl-btn wl-btn--ghost">⏹ Set end</button>
          <button onClick={cut} disabled={cutPct !== null || !canCut} className="wl-btn wl-btn--primary ml-auto"
            title={canCut ? "Keep only the selected segment" : "Move the start/end in to select a shorter segment"}>
            {cutPct !== null ? `Cutting… ${cutPct}%` : "✂ Cut"}
          </button>
        </div>

        {dur > 0 && (
          <div className="flex flex-col gap-1">
            <RangeHandle label="In" value={tIn} min={0} max={Math.max(dur, tOut)}
              onInput={v => onChange({ trimIn: Math.min(v, tOut - 0.1) })} onScrub={t => seek(videoRef, t)} />
            <RangeHandle label="Out" value={tOut} min={0} max={dur}
              onInput={v => onChange({ trimOut: Math.max(v, tIn + 0.1) })} onScrub={t => seek(videoRef, t)} />
            <div className="wl-mono text-[11px] wl-faint">
              {cutPct !== null ? "Re-encoding the selection… (plays through once)" : `Keeping ${fmt(Math.max(0, tOut - tIn))} of ${fmt(dur)}`}
            </div>
          </div>
        )}

        {isDriveConnected() && !onDrive && <div className="wl-mono text-[11px] wl-faint">Saves to Google Drive automatically when you close.</div>}
        {onDrive && <div className="wl-mono text-[11px] wl-faint">Stored on Google Drive — streams when you play it.</div>}

        <div className="flex items-center gap-1.5">
          <button onClick={() => fileRef.current?.click()} disabled={cutPct !== null || uploading} className="wl-btn">Replace</button>
          <button onClick={remove} disabled={cutPct !== null || uploading} className="wl-btn wl-btn--danger ml-auto">Delete clip</button>
        </div>
      </div>
    </div>
  );
}

function seek(ref: React.RefObject<HTMLVideoElement | null>, t: number): void {
  if (ref.current) ref.current.currentTime = t;
}

function RangeHandle(props: {
  label: string; value: number; min: number; max: number;
  onInput: (v: number) => void; onScrub: (t: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 wl-mono text-[10px]" style={{ color: "var(--wl-muted)" }}>
      <span className="w-6">{props.label}</span>
      <input type="range" min={props.min} max={props.max} step={0.1} value={props.value}
        onChange={e => { const v = parseFloat(e.target.value); props.onInput(v); props.onScrub(v); }}
        className="flex-1" style={{ accentColor: "var(--wl-accent)" }} />
    </label>
  );
}
