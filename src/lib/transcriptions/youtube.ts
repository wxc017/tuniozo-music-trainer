// ── YouTube lookup for real-recording playback ──────────────────────
//
// The browser can't fetch youtube.com directly (CORS), so we resolve a tune to
// its video through a public CORS proxy.  Crucially we DON'T just take the
// first hit — we parse several results and score them by artist + title match
// (penalising covers / lessons / karaoke) so the match is the genuine
// recording, 1-to-1.  Cached per artist+title for the session.

const cache = new Map<string, string | null>();

interface Result { videoId: string; title: string; }

/** Parse up to 8 {videoId, title} from a YouTube search page. */
function parseResults(html: string): Result[] {
  const out: Result[] = [];
  const seen = new Set<string>();
  const re = /"videoId":"([\w-]{11})"[\s\S]{0,2500}?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*?)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 8) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    const title = m[2].replace(/\\u0026/g, "&").replace(/\\"/g, '"').replace(/\\\//g, "/");
    out.push({ videoId: m[1], title });
  }
  return out;
}

const BAD = /cover|lesson|tutorial|backing track|karaoke|how to play|reaction|remix|guitar pro|\btab\b|instrumental version|8d audio/i;
function score(r: Result, artist: string, title: string): number {
  const t = r.title.toLowerCase();
  const surname = artist.toLowerCase().split(" ").pop() ?? "";
  const words = title.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(w => w.length > 2);
  let s = 0;
  if (t.includes(artist.toLowerCase())) s += 3; else if (surname && t.includes(surname)) s += 2;
  const hit = words.filter(w => t.includes(w)).length;
  s += words.length ? (hit / words.length) * 4 : 0;
  if (BAD.test(t)) s -= 6;
  if (/official|topic|full album|remaster/i.test(t)) s += 1;
  return s;
}

/** Best-matching video id for a tune (artist + title), or null.  Cached. */
export async function lookupBestVideo(artist: string, title: string): Promise<string | null> {
  const key = `${artist}|${title}`;
  if (cache.has(key)) return cache.get(key)!;
  const search = "https://www.youtube.com/results?search_query=" + encodeURIComponent(`${artist} ${title}`);
  const proxied = "https://api.allorigins.win/raw?url=" + encodeURIComponent(search);
  let id: string | null = null;
  try {
    const html = await (await fetch(proxied)).text();
    const results = parseResults(html);
    if (results.length) {
      let best = results[0], bestScore = -Infinity;
      for (const r of results) { const sc = score(r, artist, title); if (sc > bestScore) { bestScore = sc; best = r; } }
      id = best.videoId;
    }
  } catch { id = null; }
  cache.set(key, id);
  return id;
}
