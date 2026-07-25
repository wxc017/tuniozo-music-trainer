import { useEffect, useRef, useState, useCallback } from "react";
import {
  putVideo, getVideoUrl, deleteVideo, releaseVideoUrl, newVideoId,
} from "@/lib/workoutVideoDb";
import type { WorkoutSet } from "@/lib/workoutTypes";

// ─────────────────────────────────────────────────────────────────────────
// SetVideo — record a clip straight from the phone camera, link it to a set,
// and mark a non-destructive trim (drag two handles, or "Mark start" the
// instant the real rep begins so the setup footage is skipped on playback).
//
// Recording uses <input type="file" accept="video/*" capture="environment">,
// which on Android opens the camera app, records, and hands back the file —
// no getUserMedia permission dance, works in a plain PWA. The Blob goes into
// IndexedDB (workoutVideoDb); the set only stores the videoId + trim marks.
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

  // Play only the trimmed window.
  const playTrimmed = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = tIn;
    v.play();
  };
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

  return (
    <div className="mt-1">
      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />

      {!hasVideo ? (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px]"
          style={{ background: "var(--wl-surface-2)", border: "1px solid var(--wl-line)", color: "var(--wl-accent)", opacity: busy ? .5 : 1 }}
        >
          {busy ? "Saving…" : "🎥 Record"}
        </button>
      ) : (
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid color-mix(in srgb, var(--wl-accent) 30%, var(--wl-line))", background: "var(--wl-surface-2)" }}>
          <button
            onClick={() => setOpen(o => !o)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px]"
            style={{ color: "var(--wl-accent-ink)" }}
          >
            <span>🎬</span>
            <span className="font-medium">Clip linked</span>
            <span className="wl-mono wl-faint">
              {tIn > 0 || (dur && tOut < dur) ? `trim ${fmt(tIn)}–${fmt(tOut)}` : fmt(dur)}
            </span>
            <span className="ml-auto wl-faint">{open ? "▲" : "▼"}</span>
          </button>

          {open && (
            <div className="px-2.5 pb-2.5 flex flex-col gap-2">
              {url && (
                <video
                  ref={videoRef}
                  src={url}
                  playsInline
                  controls
                  onLoadedMetadata={onLoadedMeta}
                  onTimeUpdate={onTimeUpdate}
                  className="w-full max-h-[50vh] rounded bg-black"
                />
              )}

              {/* Trim marks — non-destructive; applied on playback + export. */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button onClick={markStart} className="wl-btn wl-btn--ghost" style={{ padding: "5px 9px", fontSize: 11 }}>▶ Mark start</button>
                <button onClick={markEnd} className="wl-btn wl-btn--ghost" style={{ padding: "5px 9px", fontSize: 11 }}>⏹ Mark end</button>
                <button onClick={playTrimmed} className="wl-btn" style={{ padding: "5px 9px", fontSize: 11 }}>Preview cut</button>
              </div>

              {dur > 0 && (
                <div className="flex flex-col gap-1">
                  <RangeHandle label="In" value={tIn} min={0} max={Math.max(dur, tOut)}
                    onInput={v => onChange({ trimIn: Math.min(v, tOut - 0.1) })} onScrub={t => seek(videoRef, t)} />
                  <RangeHandle label="Out" value={tOut} min={0} max={dur}
                    onInput={v => onChange({ trimOut: Math.max(v, tIn + 0.1) })} onScrub={t => seek(videoRef, t)} />
                  <div className="wl-mono text-[10px] wl-faint">Kept: {fmt(Math.max(0, tOut - tIn))} of {fmt(dur)}</div>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <button onClick={() => fileRef.current?.click()} className="wl-btn" style={{ padding: "5px 9px", fontSize: 11 }}>Re-record</button>
                <button onClick={remove} className="wl-btn wl-btn--danger ml-auto" style={{ padding: "5px 9px", fontSize: 11 }}>Delete clip</button>
              </div>
            </div>
          )}
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
