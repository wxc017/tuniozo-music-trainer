// ── Real-recording playback for a transcription excerpt ─────────────
//
// MIDI playback can't reproduce real phrasing (esp. blues/jazz inflections),
// so this finds the tune's actual recording on YouTube and embeds it, seeked
// to roughly where the excerpt sits in the piece.  The video id is taken from
// the item when known (`vid`), otherwise looked up at click time via a public
// CORS proxy (the browser can't fetch youtube.com directly).
//
// The seek is APPROXIMATE: it assumes the recording starts at the tune's bar 1
// with no intro, which is often not true (intros, repeats, multiple choruses),
// so the player is left scrubable.

import { useState } from "react";

interface Props {
  /** Known YouTube video id, if the ETL captured one. */
  vid?: string;
  /** Search query fallback, e.g. "B.B. King The Thrill Is Gone". */
  query: string;
  /** Estimated seconds into the recording where the excerpt begins. */
  startSec: number;
}

export default function RealRecording({ vid, query, startSec }: Props) {
  const [embedVid, setEmbedVid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const searchUrl = "https://www.youtube.com/results?search_query=" + encodeURIComponent(query);

  const open = async () => {
    if (vid) { setEmbedVid(vid); return; }
    setLoading(true); setFailed(false);
    try {
      const proxied = "https://api.allorigins.win/raw?url=" + encodeURIComponent(searchUrl);
      const html = await (await fetch(proxied)).text();
      const m = html.match(/"videoId":"([\w-]{11})"/);
      if (m) setEmbedVid(m[1]); else setFailed(true);
    } catch { setFailed(true); }
    setLoading(false);
  };

  if (embedVid) {
    const start = Math.max(0, Math.round(startSec));
    return (
      <div className="space-y-1">
        <iframe
          className="aspect-video w-full max-w-xl rounded"
          src={`https://www.youtube-nocookie.com/embed/${embedVid}?start=${start}&autoplay=1`}
          title="Real recording"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
        <div className="text-[10px] text-[#666]">
          Started ≈ {Math.floor(start / 60)}:{String(start % 60).padStart(2, "0")} (estimated from the excerpt's bar) —
          scrub if the recording has an intro or extra choruses.
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={open}
        disabled={loading}
        className="rounded bg-red-800/80 px-3 py-1.5 text-xs hover:bg-red-700 disabled:opacity-50"
      >
        {loading ? "Finding recording…" : "▶ Hear the real recording (≈ this spot)"}
      </button>
      {failed && (
        <a href={searchUrl} target="_blank" rel="noreferrer" className="text-xs text-[#88f] underline">
          open YouTube search
        </a>
      )}
    </div>
  );
}
