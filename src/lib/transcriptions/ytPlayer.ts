// ── YouTube IFrame Player API wrapper ───────────────────────────────
//
// A raw <iframe autoplay=1> created after an async lookup gets its autoplay
// blocked (the user-gesture chain is broken).  The IFrame Player API is far
// more reliable: we create the player once, then loadVideoById / seekTo /
// playVideo it imperatively.  Used by the Transcriptions player so Play starts
// the real recording at the excerpt's spot and Replay re-seeks to it.

/* eslint-disable @typescript-eslint/no-explicit-any */
let player: any = null;
let boundEl: string | null = null;
let apiPromise: Promise<void> | null = null;

function loadApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    const prev = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return apiPromise;
}

/** Create (once) the player bound to the element with id `elementId`. */
async function ensurePlayer(elementId: string): Promise<any> {
  await loadApi();
  if (player && boundEl === elementId) return player;
  await new Promise<void>((resolve) => {
    player = new (window as any).YT.Player(elementId, {
      width: "100%",
      height: "260",
      playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
      events: { onReady: () => resolve() },
    });
    boundEl = elementId;
  });
  return player;
}

/** Load `vid` and start playing from `startSec` (autoplays via the API). */
export async function playFrom(elementId: string, vid: string, startSec: number): Promise<void> {
  const p = await ensurePlayer(elementId);
  try { p.loadVideoById({ videoId: vid, startSeconds: Math.max(0, Math.round(startSec)) }); } catch { /* */ }
}

/** Re-seek the current video to `startSec` and play (for Replay). */
export function seekAndPlay(startSec: number): void {
  try { player?.seekTo(Math.max(0, Math.round(startSec)), true); player?.playVideo(); } catch { /* */ }
}

export function pause(): void {
  try { player?.pauseVideo(); } catch { /* */ }
}
