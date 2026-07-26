import { useEffect, useRef, useState, useCallback } from "react";
import {
  putVideo, getVideo, getVideoUrl, deleteVideo, releaseVideoUrl, newVideoId,
} from "@/lib/workoutVideoDb";
import { cutFromElement, canCutVideo, primeSeekable } from "@/lib/workoutVideoCut";
import { getClipUrl, releaseClipUrl, isDriveConnected, uploadVideoToDrive, deleteDriveVideo } from "@/lib/workoutDrive";
import type { WorkoutSet } from "@/lib/workoutTypes";

// ─────────────────────────────────────────────────────────────────────────
// SetVideo — attach a clip to a set (pick/record via the file input), mark a
// start and end, then Cut to keep ONLY that segment. Cutting re-encodes the
// selection into a new, smaller Blob and replaces the stored clip, so the
// full-length original is discarded. The Blob lives in IndexedDB
// (workoutVideoDb); the set stores the videoId + current trim bounds.
// ─────────────────────────────────────────────────────────────────────────

interface Props {
  set: WorkoutSet;
  workoutId: string;
  onChange: (patch: Partial<WorkoutSet>) => void;
}

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t % 1) * 10);
  return `${m}:${String(s).padStart(2, "0")}.${cs}`;
}

export default function SetVideo({ set, workoutId, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [cutPct, setCutPct] = useState<number | null>(null); // null = not cutting
  const [uploading, setUploading] = useState(false);

  const hasVideo = !!set.videoId || !!set.driveFileId;
  const onDrive = !!set.driveFileId;

  // Load the object URL when the panel opens (lazy). Resolves from Drive if the
  // clip was offloaded, else from local IndexedDB.
  useEffect(() => {
    let alive = true;
    if (open && hasVideo) {
      setLoadFailed(false);
      getClipUrl({ videoId: set.videoId, driveFileId: set.driveFileId }).then(u => {
        if (!alive) return;
        setUrl(u);
        if (!u) setLoadFailed(true);
      });
    }
    return () => { alive = false; };
  }, [open, set.videoId, set.driveFileId, hasVideo]);

  // Revoke this clip's object URL on unmount.
  useEffect(() => {
    const ref = { videoId: set.videoId, driveFileId: set.driveFileId };
    return () => { if (ref.videoId) releaseVideoUrl(ref.videoId); releaseClipUrl(ref); };
  }, [set.videoId, set.driveFileId]);

  const onPick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-record of the same slot
    if (!file) return;
    setBusy(true);
    try {
      // Best-effort duration probe before storing.
      const probeUrl = URL.createObjectURL(file);
      const dur = await probeDuration(probeUrl);
      URL.revokeObjectURL(probeUrl);
      const id = set.videoId ?? newVideoId();
      if (set.videoId) await deleteVideo(set.videoId); // replace old blob
      if (set.driveFileId) void deleteDriveVideo(set.driveFileId); // replace old Drive clip
      await putVideo({
        id, blob: file, mime: file.type || "video/mp4",
        durationSec: dur, createdAt: Date.now(),
        setId: set.id, workoutId,
      });
      onChange({ videoId: id, driveFileId: undefined, trimIn: 0, trimOut: dur || undefined });
      setDuration(dur);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }, [set.videoId, set.id, workoutId, onChange]);

  const onLoadedMeta = async () => {
    const v = videoRef.current;
    if (!v) return;
    // A cut clip is a MediaRecorder WebM with no header duration → Infinity, and
    // the scrub bar sticks at the end. primeSeekable forces a real, seekable
    // duration before we trust it.
    let d = v.duration;
    if (!isFinite(d) || d <= 0) d = await primeSeekable(v);
    if (isFinite(d) && d > 0) {
      setDuration(d);
      if (set.trimOut == null) onChange({ trimOut: d });
    }
  };

  const remove = useCallback(async () => {
    if (set.videoId) { await deleteVideo(set.videoId); releaseVideoUrl(set.videoId); }
    if (set.driveFileId) { void deleteDriveVideo(set.driveFileId); releaseClipUrl({ driveFileId: set.driveFileId }); }
    setUrl(null);
    onChange({ videoId: undefined, driveFileId: undefined, trimIn: undefined, trimOut: undefined });
    setOpen(false);
  }, [set.videoId, set.driveFileId, onChange]);

  // Offload the local clip to Google Drive and drop the phone-side copy.
  // Runs automatically on close whenever Drive is connected.
  const offloadToDrive = useCallback(async () => {
    if (!set.videoId || set.driveFileId || !isDriveConnected()) return;
    const stored = await getVideo(set.videoId);
    if (!stored) return;
    setUploading(true);
    try {
      const ext = /mp4/i.test(stored.mime) ? "mp4" : /webm/i.test(stored.mime) ? "webm" : "mp4";
      const fileId = await uploadVideoToDrive(stored.blob, `${set.id}.${ext}`);
      await deleteVideo(set.videoId);
      releaseVideoUrl(set.videoId);
      onChange({ videoId: undefined, driveFileId: fileId });
    } catch (err) {
      window.alert(`Couldn't upload to Drive: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  }, [set.videoId, set.driveFileId, set.id, onChange]);

  const finalizeAndClose = useCallback(async () => {
    await offloadToDrive(); // no-op unless connected + a local clip
    setOpen(false);
  }, [offloadToDrive]);

  const dur = duration || set.trimOut || 0;
  const tIn = set.trimIn ?? 0;
  const tOut = set.trimOut ?? dur;

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (v && tOut > 0 && v.currentTime >= tOut) v.pause();
  };

  const markStart = () => {
    const v = videoRef.current;
    if (v) onChange({ trimIn: Math.min(v.currentTime, tOut - 0.1) });
  };
  const markEnd = () => {
    const v = videoRef.current;
    if (v) onChange({ trimOut: Math.max(v.currentTime, tIn + 0.1) });
  };

  // Actually cut: re-encode [tIn, tOut] into a new smaller Blob, replace the
  // stored clip with it, and discard the full-length original.
  // Cut only works on a local clip (Drive clips are streamed) — cut first,
  // then move to Drive.
  const canCut = !onDrive && tOut - tIn > 0.2 && tOut - tIn < dur - 0.05;
  const cut = useCallback(async () => {
    if (!set.videoId) return;
    const v = videoRef.current;
    if (!v) return;
    if (!canCutVideo()) { window.alert("Cutting isn't supported in this browser. Trim your clip in your gallery app instead, then re-upload."); return; }
    setCutPct(0);
    try {
      const trimmed = await cutFromElement(v, tIn, tOut, f => setCutPct(Math.round(f * 100)));
      const newDur = Math.max(0.1, tOut - tIn);
      await putVideo({ id: set.videoId, blob: trimmed, mime: trimmed.type || "video/webm", durationSec: newDur, createdAt: Date.now(), setId: set.id, workoutId });
      releaseVideoUrl(set.videoId);
      onChange({ trimIn: 0, trimOut: newDur });
      setDuration(newDur);
      setCutPct(null);
      // Cut done → upload the trimmed clip to Drive (if connected) and close.
      await offloadToDrive();
      setOpen(false);
    } catch (err) {
      window.alert(`Couldn't cut the clip: ${err instanceof Error ? err.message : String(err)}`);
      setCutPct(null);
    }
  }, [set.videoId, set.id, workoutId, tIn, tOut, onChange, offloadToDrive]);

  return (
    <div className="mt-1">
      {/* No `capture` attribute: forcing capture makes many phones open the
          camera in PHOTO mode. Plain accept="video/*" lets the camera app
          record video (or lets you pick an existing clip). */}
      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={onPick}
      />

      {!hasVideo ? (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-[13px]"
          style={{ background: "var(--wl-surface-2)", border: "1px solid var(--wl-line)", color: "var(--wl-accent)", opacity: busy ? .5 : 1 }}
        >
          {busy ? "Saving…" : "🎥 Add Video"}
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px]"
          style={{ border: "1px solid color-mix(in srgb, var(--wl-accent) 30%, var(--wl-line))", background: "var(--wl-surface-2)", color: "var(--wl-accent-ink)" }}
        >
          <span>🎬</span>
          <span className="font-medium">Video</span>
          <span className="wl-mono wl-faint">
            {tIn > 0 || (dur && tOut < dur) ? `trim ${fmt(tIn)}–${fmt(tOut)}` : fmt(dur)}
          </span>
          <span className="ml-auto wl-faint">tap to open</span>
        </button>
      )}

      {/* Fullscreen video popup */}
      {open && hasVideo && (
        <div className="wl-root fixed inset-0 z-[65] flex flex-col" style={{ background: "rgba(0,0,0,.94)" }}>
          <div className="flex items-center gap-2 px-3 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--wl-line)" }}>
            <span className="wl-h2">Video</span>
            {onDrive && <span className="wl-tag">☁ Drive</span>}
            <span className="wl-mono wl-faint">{`${fmt(tIn)}–${fmt(tOut)}`}</span>
            <button onClick={finalizeAndClose} disabled={cutPct !== null || uploading} className="wl-btn ml-auto">
              {uploading ? "Saving to Drive…" : "Close"}
            </button>
          </div>

          {/* Video fills the available space */}
          <div className="flex-1 min-h-0 flex items-center justify-center p-2">
            {url ? (
              <video
                ref={videoRef}
                src={url}
                playsInline
                controls
                onLoadedMetadata={onLoadedMeta}
                onTimeUpdate={onTimeUpdate}
                className="rounded bg-black"
                style={{ maxWidth: "100%", maxHeight: "100%" }}
              />
            ) : loadFailed ? (
              <div className="max-w-sm text-center px-6" style={{ color: "var(--wl-muted)" }}>
                <div className="text-3xl mb-2">🎞️</div>
                <div className="text-sm">This clip's video file isn't on this device.</div>
                <div className="text-xs mt-2">Only the reference syncs automatically — the video itself travels in the backup. On the device that has it, open <span className="wl-accent">Settings → Workout Log → Back up to Drive</span>, then here tap <span className="wl-accent">Restore from Drive</span> and reopen.</div>
              </div>
            ) : (
              <div className="text-sm" style={{ color: "var(--wl-muted)" }}>Loading…</div>
            )}
          </div>

          {/* Controls */}
          <div className="flex-shrink-0 p-3 flex flex-col gap-2" style={{ borderTop: "1px solid var(--wl-line)" }}>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={markStart} disabled={cutPct !== null} className="wl-btn wl-btn--ghost">▶ Set start</button>
              <button onClick={markEnd} disabled={cutPct !== null} className="wl-btn wl-btn--ghost">⏹ Set end</button>
              <button onClick={cut} disabled={cutPct !== null || !canCut}
                className="wl-btn wl-btn--primary ml-auto"
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
                  {cutPct !== null ? "Re-encoding the selection… (plays through once)"
                    : `Keeping ${fmt(Math.max(0, tOut - tIn))} of ${fmt(dur)}`}
                </div>
              </div>
            )}

            {/* Auto-offload status (no button — happens on close). */}
            {isDriveConnected() && !onDrive && (
              <div className="wl-mono text-[11px] wl-faint">Saves to Google Drive automatically when you close.</div>
            )}
            {onDrive && <div className="wl-mono text-[11px] wl-faint">Stored on Google Drive — streams when you play it.</div>}

            <div className="flex items-center gap-1.5">
              <button onClick={() => fileRef.current?.click()} disabled={cutPct !== null || uploading} className="wl-btn">Replace</button>
              <button onClick={remove} disabled={cutPct !== null || uploading} className="wl-btn wl-btn--danger ml-auto">Delete clip</button>
            </div>
          </div>
        </div>
      )}
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
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={0.1}
        value={props.value}
        onChange={e => { const v = parseFloat(e.target.value); props.onInput(v); props.onScrub(v); }}
        className="flex-1"
        style={{ accentColor: "var(--wl-accent)" }}
      />
    </label>
  );
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
