// ── Blues corpus: curated canonical solos, real audio + AI transcription ──
//
// Per direct user direction (2026-05): drop the fan-tab .gp approach.  Instead
// curate well-renowned solos by the great blues guitarists (lots of LIVE; for
// Hendrix his blues + live), pull the best recording off YouTube (bias to
// official / Topic / live; reject AI uploads), download the audio LOCALLY so
// the app plays offline, then run a lightweight AI transcription (transcribe.py)
// which both (a) finds the solo section and (b) emits an approximate melody for
// the Show-Answer notation ("doesn't have to be accurate — learn by ear").
//
// Audio → public/blues/audio/<vid>.mp3 (GITIGNORED; copyrighted, personal use).
// Corpus → public/transcriptions/blues.json.  Needs yt-dlp + ffmpeg + python.
//
//   node scripts/build-transcriptions/blues.mjs

import { writeFileSync, existsSync, mkdirSync, statSync, readFileSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";
import { writeSource, rebuildIndex, isMain } from "./common.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = join(__dirname, "..", "..", "public", "blues", "audio");
mkdirSync(AUDIO_DIR, { recursive: true });
const YTDLP = process.env.YTDLP || "C:\\Users\\wilda\\AppData\\Local\\Programs\\Python\\Python315\\Scripts\\yt-dlp.exe";
const PYTHON = process.env.PYTHON || "python";
const TRANSCRIBE = join(__dirname, "transcribe.py");
const WINDOW = 24;   // seconds of solo to capture per tune

// Well-renowned solos.  `q` is the search query (live-biased where the canonical
// version is live).  `live` just records intent.
const A = (artist, list) => list.map(([title, q]) => ({ artist, title, q: `${artist} ${q}` }));
const SOLOS = [
  ...A("Albert King", [
    ["Blues Power (live)", "Blues Power live wire"], ["Born Under a Bad Sign", "Born Under a Bad Sign"],
    ["Crosscut Saw", "Crosscut Saw"], ["I'll Play the Blues for You", "I'll Play the Blues for You live"],
    ["Stormy Monday (live)", "Stormy Monday live"], ["Blues at Sunrise (live)", "Blues at Sunrise live"],
    ["As the Years Go Passing By", "As the Years Go Passing By"], ["The Hunter", "The Hunter"],
    ["Oh Pretty Woman", "Oh Pretty Woman"], ["Laundromat Blues", "Laundromat Blues"],
    ["Personal Manager", "Personal Manager"], ["Cold Feet", "Cold Feet"],
    ["Don't Throw Your Love on Me So Strong", "Don't Throw Your Love on Me So Strong"], ["Angel of Mercy", "Angel of Mercy"],
    ["Travelin' to California", "Travelin to California"], ["Killing Floor", "Killing Floor"],
    ["Drowning on Dry Land", "Drowning on Dry Land"], ["Breaking Up Somebody's Home", "Breaking Up Somebody's Home"],
    ["Down Don't Bother Me", "Down Don't Bother Me"], ["Wrapped Up in Love Again", "Wrapped Up in Love Again"],
    ["Match Box Blues", "Match Box Blues"], ["Overall Junction", "Overall Junction"],
  ]),
  ...A("Stevie Ray Vaughan", [
    ["Texas Flood (live)", "Texas Flood live el mocambo"], ["Lenny", "Lenny live"], ["Little Wing", "Little Wing"],
    ["Tin Pan Alley (live)", "Tin Pan Alley live"], ["Cold Shot", "Cold Shot live"], ["Pride and Joy", "Pride and Joy live"],
    ["Voodoo Child (Slight Return)", "Voodoo Child Slight Return live"], ["Couldn't Stand the Weather", "Couldn't Stand the Weather"],
    ["Scuttle Buttin'", "Scuttle Buttin"], ["Riviera Paradise", "Riviera Paradise"], ["Crossfire", "Crossfire live"],
    ["The Sky Is Crying", "The Sky Is Crying"], ["Mary Had a Little Lamb", "Mary Had a Little Lamb"],
    ["Love Struck Baby", "Love Struck Baby"], ["Rude Mood", "Rude Mood"], ["Look at Little Sister", "Look at Little Sister"],
    ["Honey Bee", "Honey Bee live"], ["Leave My Girl Alone", "Leave My Little Girl Alone live"],
    ["Say What!", "Say What"], ["Empty Arms", "Empty Arms"], ["Wall of Denial", "Wall of Denial"],
    ["Going Down (live)", "Going Down live jam"],
  ]),
  ...A("B.B. King", [
    ["The Thrill Is Gone (live)", "The Thrill Is Gone live"], ["Sweet Little Angel (live)", "Sweet Little Angel live at the regal"],
    ["How Blue Can You Get (live)", "How Blue Can You Get live"], ["Every Day I Have the Blues (live)", "Every Day I Have the Blues live regal"],
    ["Why I Sing the Blues (live)", "Why I Sing the Blues live"], ["Rock Me Baby", "Rock Me Baby live"],
    ["Three O'Clock Blues", "Three O'Clock Blues"], ["Paying the Cost to Be the Boss", "Paying the Cost to Be the Boss"],
    ["Lucille", "Lucille"], ["Don't Answer the Door", "Don't Answer the Door live"], ["Worry, Worry (live)", "Worry Worry live regal"],
    ["Gambler's Blues", "Gambler's Blues"], ["Chains and Things", "Chains and Things"], ["Hummingbird", "Hummingbird"],
    ["Nobody Loves Me But My Mother", "Nobody Loves Me But My Mother"], ["Help the Poor", "Help the Poor"],
    ["You Upset Me Baby", "You Upset Me Baby"], ["Sweet Sixteen", "Sweet Sixteen"], ["Please Love Me", "Please Love Me"],
    ["It's My Own Fault", "It's My Own Fault live"], ["Woke Up This Morning", "Woke Up This Morning"], ["Ask Me No Questions", "Ask Me No Questions"],
  ]),
  ...A("Jimi Hendrix", [
    ["Red House (live)", "Red House live"], ["Hear My Train A Comin' (live)", "Hear My Train A Comin live"],
    ["Machine Gun (live)", "Machine Gun band of gypsys live"], ["Voodoo Child (Slight Return)", "Voodoo Child Slight Return live"],
    ["Catfish Blues (live)", "Catfish Blues live"], ["Killing Floor (Monterey)", "Killing Floor live Monterey"],
    ["Voodoo Chile", "Voodoo Chile blues long"], ["Bleeding Heart (live)", "Bleeding Heart live"],
    ["Hey Joe (live)", "Hey Joe live"], ["Wild Thing (Monterey)", "Wild Thing live Monterey"],
    ["Spanish Castle Magic (live)", "Spanish Castle Magic live"], ["Johnny B. Goode (live)", "Johnny B Goode live"],
    ["Lover Man (live)", "Lover Man live"], ["Stone Free (live)", "Stone Free live"], ["Foxy Lady (live)", "Foxy Lady live"],
    ["Purple Haze (live)", "Purple Haze live"], ["Izabella (live)", "Izabella live"], ["Power of Soul (live)", "Power of Soul band of gypsys"],
    ["Who Knows (live)", "Who Knows band of gypsys live"], ["Star Spangled Banner (Woodstock)", "Star Spangled Banner Woodstock"],
    ["Little Wing", "Little Wing"], ["Fire (live)", "Fire live"],
  ]),
  ...A("Eric Clapton", [
    ["Crossroads (Cream, live)", "Crossroads Cream live wheels of fire"], ["Have You Ever Loved a Woman (live)", "Have You Ever Loved a Woman live"],
    ["Further On Up the Road (live)", "Further On Up the Road live"], ["Old Love (live)", "Old Love live 24 nights"],
    ["Layla", "Layla"], ["White Room (Cream)", "Cream White Room"], ["Sunshine of Your Love (live)", "Cream Sunshine of Your Love live"],
    ["Spoonful (Cream, live)", "Cream Spoonful live"], ["Steppin' Out (Bluesbreakers)", "Bluesbreakers Steppin Out"],
    ["Hideaway (Bluesbreakers)", "Bluesbreakers Hideaway"], ["All Your Love (Bluesbreakers)", "Bluesbreakers All Your Love"],
    ["Ramblin' on My Mind", "Bluesbreakers Ramblin on My Mind"], ["Double Trouble (live)", "Double Trouble live"],
    ["Key to the Highway", "Key to the Highway derek dominos"], ["Bell Bottom Blues", "Bell Bottom Blues"],
    ["Cocaine (live)", "Cocaine live"], ["Badge", "Badge Cream"], ["Strange Brew (Cream)", "Cream Strange Brew"],
    ["Five Long Years (live)", "Five Long Years live"], ["Nobody Knows You When You're Down and Out", "Nobody Knows You When You're Down and Out unplugged"],
    ["I'm So Glad (Cream, live)", "Cream I'm So Glad live"], ["Got to Get Better in a Little While (live)", "Derek and the Dominos Got to Get Better live"],
  ]),
  // Cushion of further canonical solos so the corpus comfortably clears 100.
  ...A("Albert King", [
    ["I Get Evil", "I Get Evil"], ["You Sure Drive a Hard Bargain", "You Sure Drive a Hard Bargain"],
    ["That's What the Blues Is All About", "That's What the Blues Is All About"], ["Answer to the Laundromat Blues", "Answer to the Laundromat Blues"],
  ]),
  ...A("Stevie Ray Vaughan", [
    ["Life by the Drop", "Life by the Drop"], ["Texas Flood (studio)", "Texas Flood studio"],
    ["Lookin' Out the Window", "Lookin Out the Window"], ["Travis Walk", "Travis Walk"],
  ]),
  ...A("B.B. King", [
    ["The Thrill Is Gone (studio)", "The Thrill Is Gone studio completely well"], ["Caldonia (live)", "Caldonia live"],
    ["Let the Good Times Roll", "Let the Good Times Roll BB King"], ["Never Make a Move Too Soon", "Never Make a Move Too Soon"],
  ]),
  ...A("Jimi Hendrix", [
    ["All Along the Watchtower", "All Along the Watchtower"], ["Bold as Love", "Bold as Love"],
    ["Castles Made of Sand", "Castles Made of Sand"], ["Pali Gap", "Pali Gap"],
  ]),
  ...A("Eric Clapton", [
    ["Wonderful Tonight (live)", "Wonderful Tonight live"], ["I Shot the Sheriff (live)", "I Shot the Sheriff live"],
    ["Tell the Truth (live)", "Derek and the Dominos Tell the Truth live"], ["Why Does Love Got to Be So Sad (live)", "Derek and the Dominos Why Does Love live"],
  ]),
];

// ── YouTube best-match via the allorigins proxy (bypasses the IP throttle) ──
function fetchSearchHtml(query) {
  const yt = "https://www.youtube.com/results?search_query=" + encodeURIComponent(query);
  const url = "https://api.allorigins.win/raw?url=" + encodeURIComponent(yt);
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } }, (res) => {
      let d = ""; res.on("data", (c) => { d += c; if (d.length > 4e6) res.destroy(); });
      res.on("end", () => resolve(d));
    });
    req.on("error", () => resolve(""));
    req.setTimeout(25000, () => { req.destroy(); resolve(""); });
  });
}
function parseDur(span) {
  // lengthText in the search JSON, e.g. "lengthText":{...,"simpleText":"4:32"}.
  const m = /"lengthText":\{[^}]*?"simpleText":"([\d:]+)"/.exec(span);
  if (!m) return null;
  const p = m[1].split(":").map(Number);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + (p[1] || 0);
}
function parseResults(html) {
  const out = [], seen = new Set();
  const re = /"videoId":"([\w-]{11})"([\s\S]{0,2500}?)"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*?)"/g;
  let m;
  while ((m = re.exec(html)) && out.length < 12) {
    if (seen.has(m[1])) continue; seen.add(m[1]);
    out.push({
      videoId: m[1],
      title: m[3].replace(/\\u0026/g, "&").replace(/\\"/g, '"').replace(/\\\//g, "/"),
      durSec: parseDur(m[2]),
    });
  }
  return out;
}
const AI = /\b(ai|a\.i\.|suno|udio|generated|ai[- ]?cover|deepfake|riffusion)\b/i;
const BAD = /cover|lesson|tutorial|backing track|karaoke|how to play|reaction|remix|guitar pro|\btab\b|8d audio/i;
function score(r, artist, title, wantLive) {
  const t = r.title.toLowerCase();
  const surname = artist.toLowerCase().split(" ").pop();
  const words = title.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(w => w.length > 2);
  let s = 0;
  if (t.includes(artist.toLowerCase())) s += 3; else if (t.includes(surname)) s += 2;
  const hit = words.filter(w => t.includes(w)).length;
  s += words.length ? (hit / words.length) * 4 : 0;
  if (AI.test(t)) s -= 50;
  if (BAD.test(t)) s -= 6;
  if (/ - topic$|vevo|official audio|official video|remaster/i.test(t)) s += 3;   // official/auto-generated
  if (wantLive && /\blive\b/.test(t)) s += 2;
  // Prefer a single-song upload over album/compilation/full-concert dumps: those
  // wreck the solo-finder (it just grabs the densest 24s of a 40-min file).
  const d = r.durSec;
  if (d == null) s -= 4;                              // unknown length (livestream, etc.)
  else if (d > (wantLive ? 1200 : 900)) s -= 20;     // >20min live / >15min studio = album/comp
  else if (d > (wantLive ? 900 : 600)) s -= 8;       // long-ish — penalize but allow
  else if (d < 90) s -= 6;                            // snippet/clip
  else if (d >= 150 && d <= 480) s += 3;              // 2.5–8 min = the sweet spot
  return s;
}
async function bestVideo(s) {
  const wantLive = /live/i.test(s.q);
  // The allorigins proxy is flaky under bulk load (returns empty HTML), which
  // dropped many famous tracks as "no video" in one pass.  Retry several times
  // with backoff and only give up when scraping genuinely yields nothing.
  for (let attempt = 0; attempt < 5; attempt++) {
    const results = parseResults(await fetchSearchHtml(s.q));
    if (results.length) {
      let best = results[0], bestS = -Infinity;
      for (const r of results) { const sc = score(r, s.artist, s.title, wantLive); if (sc > bestS) { bestS = sc; best = r; } }
      return bestS >= 2 ? best.videoId : null;
    }
    await new Promise(r => setTimeout(r, 1200 + attempt * 800));
  }
  return null;
}

export async function build() {
  const items = [];
  // Resume: reuse already-built solos whose audio file is still present, so a
  // re-run only has to recover the ones that failed (flaky proxy) — no
  // re-downloading or re-transcribing the whole corpus.
  const prevPath = join(__dirname, "..", "..", "public", "transcriptions", "blues.json");
  const prev = new Map();
  try {
    for (const it of JSON.parse(readFileSync(prevPath, "utf8"))) prev.set(`${it.artist}|||${it.title}`, it);
  } catch { /* first run */ }

  for (const s of SOLOS) {
    const cached = prev.get(`${s.artist}|||${s.title}`);
    if (cached?.audio && existsSync(join(AUDIO_DIR, cached.audio.replace(/^audio\//, "")))) {
      items.push({ ...cached, id: `blues-${items.length}` });
      continue;
    }
    const vid = await bestVideo(s);
    if (!vid) { console.log(`  no video: ${s.artist} - ${s.title}`); continue; }
    const mp3 = join(AUDIO_DIR, `${vid}.mp3`);
    if (!existsSync(mp3) || statSync(mp3).size < 10000) {
      try {
        execFileSync(YTDLP, ["-x", "--audio-format", "mp3", "--audio-quality", "5", "--no-playlist",
          "-o", join(AUDIO_DIR, `${vid}.%(ext)s`), `https://www.youtube.com/watch?v=${vid}`], { stdio: "ignore" });
      } catch { console.log(`  download failed: ${s.artist} - ${s.title}`); continue; }
    }
    if (!existsSync(mp3)) continue;
    // Blues is AUDIO-ONLY: the answer is the real recording, transcribed by ear.
    // We run the analyzer only to LOCATE the solo (its busiest/loudest stretch)
    // so the clip starts on the playing, not the intro/vocals.  No melody is
    // emitted — a monophonic tracker on a full band mix is noise, and showing
    // wrong notes as an "answer" is worse than showing none.
    let tr;
    try { tr = JSON.parse(execSync(`"${PYTHON}" "${TRANSCRIBE}" "${mp3}" ${WINDOW}`, { encoding: "utf8", maxBuffer: 1 << 26 })); }
    catch { console.log(`  solo-find failed: ${s.artist} - ${s.title}`); continue; }
    if (tr.error) { console.log(`  ${tr.error}: ${s.artist} - ${s.title}`); continue; }

    const solostart = tr.soloStart || 0;
    const soloLen = Math.round(((tr.soloEnd ?? solostart + WINDOW) - solostart) * 100) / 100 || WINDOW;
    items.push({
      id: `blues-${items.length}`, source: "blues", genre: "Blues", style: s.artist,
      title: s.title, artist: s.artist,
      key: { tonicPc: 0, mode: "major" },
      timeSig: [4, 4], tempoBpm: tr.bpm || 100, barCount: 1,
      audio: `audio/${vid}.mp3`, solostart, soloLen, vid,
      youtubeQuery: s.q,
    });
    console.log(`  ${s.artist} - ${s.title} -> ${vid} | solo @${solostart}s for ${soloLen}s`);
  }
  console.log(`Blues: built ${items.length}/${SOLOS.length} curated solos`);
  writeSource("blues", items);
}

if (isMain(import.meta.url)) build().then(rebuildIndex).catch(e => { console.error(e); process.exit(1); });
