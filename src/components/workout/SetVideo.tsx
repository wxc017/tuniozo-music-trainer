import { useEffect, useRef, useState, useCallback } from "react";
import {
  putVideo, getVideoUrl, deleteVideo, releaseVideoUrl, newVideoId,
} from "@/lib/workoutVideoDb";
import { cutFromElement, canCutVideo } from "@/lib/workoutVideoCut";
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
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [cutPct, setCutPct] = useState<number | null>(null); // null = not cutting

  const hasVideo = !!set.videoId;

  // Load the object URL when the panel opens (lazy — don't hydrate every set).
  useEffect(() => {
    let alive = true;
    if (open && set.videoId) {
      getVideoUrl(set.videoId).then(u => { if (alive) setUrl(u); });
    }
    return () => { alive = false; };
  }, [open, set.videoId]);

  // Revoke this clip's object URL on unmount.
  useEffect(() => {
    const id = set.videoId;
    return () => { if (id) releaseVideoUrl(id); };
  }, [set.videoId]);

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
      await putVideo({
        id, blob: file, mime: file.type || "video/mp4",
        durationSec: dur, createdAt: Date.now(),
        setId: set.id, workoutId,
      });
      onChange({ videoId: id, trimIn: 0, trimOut: dur || undefined });
      setDuration(dur);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }, [set.videoId, set.id, workoutId, onChange]);

  const onLoadedMeta = () => {
    const d = videoRef.current?.duration ?? 0;
    if (isFinite(d) && d > 0) {
      setDuration(d);
      if (set.trimOut == null) onChange({ trimOut: d });
    }
  };

  const remove = useCallback(async () => {
    if (set.videoId) { await deleteVideo(set.videoId); releaseVideoUrl(set.videoId); }
    setUrl(null);
    onChange({ videoId: undefined, trimIn: undefined, trimOut: undefined });
    setOpen(false);
  }, [set.videoId, onChange]);

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
  const canCut = tOut - tIn > 0.2 && tOut - tIn < dur - 0.05; // a real sub-range
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
      const u = await getVideoUrl(set.videoId);
      setUrl(u);
    } catch (err) {
      window.alert(`Couldn't cut the clip: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCutPct(null);
    }
  }, [set.videoId, set.id, workoutId, tIn, tOut, onChange]);

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
            <span className="wl-mono wl-faint">{`${fmt(tIn)}–${fmt(tOut)}`}</span>
            <button onClick={() => setOpen(false)} disabled={cutPct !== null} className="wl-btn ml-auto">Close</button>
          </div>

          {/* Video fills the available space */}
          <div className="flex-1 min-h-0 flex items-center justify-center p-2">
            {url && (
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

            <div className="flex items-center gap-1.5">
              <button onClick={() => fileRef.current?.click()} disabled={cutPct !== null} className="wl-btn">Replace</button>
              <button onClick={remove} disabled={cutPct !== null} className="wl-btn wl-btn--danger ml-auto">Delete clip</button>
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
