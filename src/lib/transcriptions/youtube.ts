// ── YouTube lookup for real-recording playback ──────────────────────
//
// The browser can't fetch youtube.com directly (CORS), so we resolve a search
// query to a video id through a public CORS proxy.  Results are cached per
// query for the session.  Used by the Transcriptions player (Play = the real
// recording) and the Show-Answer embed.

const cache = new Map<string, string | null>();

/** Resolve a search query → first YouTube video id (or null).  Cached. */
export async function lookupVideoId(query: string): Promise<string | null> {
  if (cache.has(query)) return cache.get(query)!;
  const search = "https://www.youtube.com/results?search_query=" + encodeURIComponent(query);
  const proxied = "https://api.allorigins.win/raw?url=" + encodeURIComponent(search);
  let id: string | null = null;
  try {
    const html = await (await fetch(proxied)).text();
    const m = html.match(/"videoId":"([\w-]{11})"/);
    id = m ? m[1] : null;
  } catch { id = null; }
  cache.set(query, id);
  return id;
}

/** Embed URL that plays a [start,end] segment (seconds), autoplaying. */
export function embedUrl(vid: string, startSec: number, endSec?: number): string {
  const s = Math.max(0, Math.round(startSec));
  const end = endSec != null ? `&end=${Math.max(s + 1, Math.round(endSec))}` : "";
  return `https://www.youtube-nocookie.com/embed/${vid}?start=${s}${end}&autoplay=1&rel=0`;
}
